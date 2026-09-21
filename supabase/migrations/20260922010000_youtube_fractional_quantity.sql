begin;

-- Preserve fractional quantities such as 1/2 and 1 1/2 in extracted drafts.
-- Malformed fractions remain unknown and require review.
-- Verify the prior catalog and re-attest the reviewed parser change atomically.
do $verify_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_fingerprint text;
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  v_fingerprint := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_fingerprint is distinct from
    '750a0236e57ebcfaa19dd720de9b29c686064ca608948453dbed805740e4e9ef' then
    raise exception 'YouTube ingredient-search catalog differs from the reviewed schema: %', v_fingerprint
      using errcode = '55000';
  end if;
end;
$verify_catalog$;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format('grant youtube_extraction_worker_rpc_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  else
    execute format('grant youtube_extraction_worker_rpc_owner to %I', current_user);
  end if;
end;
$membership$;
grant create on schema public to youtube_extraction_worker_rpc_owner;
set local role youtube_extraction_worker_rpc_owner;
do $fraction$
declare
  v_signature regprocedure := 'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_start text := '    v_amount_match := substring(replace(v_amount_text,';
  v_end text := '    v_unit := case';
  v_start_at integer;
  v_end_at integer;
  v_replacement text := $quantity$
    v_amount_match := replace(v_amount_text, ',', '.');
    v_amount_fraction := regexp_match(v_amount_match,
      '^(?:([0-9]+)[[:space:]]+)?([0-9]+(?:[.][0-9]+)?)[[:space:]]*/[[:space:]]*([0-9]+(?:[.][0-9]+)?)$');
    if v_amount_fraction is not null then
      v_amount := coalesce(v_amount_fraction[1]::numeric, 0)
        + v_amount_fraction[2]::numeric / nullif(v_amount_fraction[3]::numeric, 0);
    elsif strpos(v_amount_match, '/') > 0 then
      -- Do not interpret a malformed fraction as its first integer.
      v_amount := null;
    else
      v_amount_match := substring(v_amount_match from '[0-9]+[.]?[0-9]*');
      v_amount := v_amount_match::numeric;
    end if;
    if v_amount <= 0 then
      v_amount := null;
    end if;
$quantity$;
begin
  v_start_at := strpos(v_definition, v_start);
  v_end_at := strpos(v_definition, v_end);
  if v_start_at = 0 or v_end_at <= v_start_at
    or strpos(v_definition, 'v_amount_fraction') <> 0 then
    raise exception 'YouTube fraction parser source drifted' using errcode = '55000';
  end if;
  v_definition := substr(v_definition, 1, v_start_at - 1) || v_replacement || substr(v_definition, v_end_at);
  v_definition := replace(v_definition, '  v_amount_match text;', E'  v_amount_match text;\n  v_amount_fraction text[];');
  v_definition := replace(v_definition,
    '''quantity_review_required'', v_amount is not null and v_unit is null,',
    '''quantity_review_required'', (v_amount is not null and v_unit is null) or (strpos(coalesce(v_amount_text, ''''), ''/'') > 0 and v_amount is null),');
  execute v_definition;
end;
$fraction$;
reset role;
revoke create on schema public from youtube_extraction_worker_rpc_owner;
do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format('revoke youtube_extraction_worker_rpc_owner from %I granted by %I', current_user, current_user);
  else
    execute format('revoke youtube_extraction_worker_rpc_owner from %I', current_user);
  end if;
end;
$membership$;

-- Lease the existing function owner only for the atomic definition replacement.
do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user, current_user
    );
  else
    execute format('grant youtube_extraction_credential_manager_rpc_owner to %I', current_user);
  end if;
end;
$membership$;

grant create on schema public, private to youtube_extraction_credential_manager_rpc_owner;
set local role youtube_extraction_credential_manager_rpc_owner;

do $replace_fingerprint$
declare
  v_previous constant text := '750a0236e57ebcfaa19dd720de9b29c686064ca608948453dbed805740e4e9ef';
  v_current constant text := '2b4f7b7e645f8609df30399224da979cb399b7c955cc2c215d28e7f5482bc402';
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.read_youtube_extraction_enqueue_readiness()'::regprocedure,
    'private.assert_youtube_extraction_catalog_ready()'::regprocedure
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    if (length(v_definition) - length(replace(v_definition, v_previous, ''))) / length(v_previous) <> 1
      or strpos(v_definition, v_current) <> 0 then
      raise exception 'YouTube catalog fingerprint source drifted: %', v_signature
        using errcode = '55000';
    end if;
    execute replace(v_definition, v_previous, v_current);
  end loop;
end;
$replace_fingerprint$;

reset role;
revoke create on schema public, private from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user, current_user
    );
  else
    execute format('revoke youtube_extraction_credential_manager_rpc_owner from %I', current_user);
  end if;
end;
$membership$;

do $verify_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  perform private.assert_youtube_extraction_catalog_ready();
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$verify_catalog$;

commit;
