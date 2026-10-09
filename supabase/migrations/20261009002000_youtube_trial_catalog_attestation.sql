begin;

-- Re-attest the extraction catalog derived after the saved-result migration
-- and the trial quantity bridge in the isolated 209 pre-attestation replay.
-- The saved-result tables/RPCs remain outside the extraction worker catalog;
-- only the reviewed resolver bridge changes its fingerprint.
do $verify_prior_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_fingerprint text;
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  v_fingerprint := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_fingerprint is distinct from
    'fb53256a0f5cb3c2690ecbc070718d2bbfaeafab4c23710dab0584f4cbc5d7c8' then
    raise exception 'YouTube extraction catalog differs from the reviewed post-bridge postimage: %', v_fingerprint
      using errcode = '55000';
  end if;
end;
$verify_prior_catalog$;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I',
      current_user
    );
  end if;
end;
$membership$;

grant create on schema public, private
  to youtube_extraction_credential_manager_rpc_owner;

set local role youtube_extraction_credential_manager_rpc_owner;

do $replace_fingerprint$
declare
  v_previous constant text :=
    '2b4f7b7e645f8609df30399224da979cb399b7c955cc2c215d28e7f5482bc402';
  v_current constant text :=
    'fb53256a0f5cb3c2690ecbc070718d2bbfaeafab4c23710dab0584f4cbc5d7c8';
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

revoke create on schema public, private
  from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I',
      current_user
    );
  end if;
end;
$membership$;

-- Verify after temporary membership is removed so the observed catalog is the
-- committed postimage. The external catalog integration additionally invokes
-- the private assertion under its installed supabase_admin authority.
do $verify_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_fingerprint text;
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  v_fingerprint := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_fingerprint is distinct from
    'fb53256a0f5cb3c2690ecbc070718d2bbfaeafab4c23710dab0584f4cbc5d7c8' then
    raise exception 'YouTube extraction post-attestation catalog drifted: %', v_fingerprint
      using errcode = '55000';
  end if;
end;
$verify_catalog$;

commit;
