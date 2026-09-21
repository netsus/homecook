begin;

-- The reviewed ingredient-search migration changed the draft resolver body.
-- Keep fail-closed catalog verification; attest that exact new catalog only.
-- Derived on both a full migration replay and an isolated production schema.
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
  v_previous constant text := '06e3d277cbf5ae9199c21866567b141698385fa25c0429289c3b53002ca51e13';
  v_current constant text := '750a0236e57ebcfaa19dd720de9b29c686064ca608948453dbed805740e4e9ef';
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
