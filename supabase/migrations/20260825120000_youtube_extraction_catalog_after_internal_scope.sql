begin;

-- Decouple the YouTube queue catalog from unrelated additions to the shared
-- full-local internal-scope verifier. YouTube-required scope changes must bump
-- this explicit marker; other product scopes no longer invalidate enqueue.

create or replace function private.youtube_extraction_internal_scope_contract_v1()
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select 'youtube-extraction-internal-scope-contract-v1'::text;
$function$;

alter function private.youtube_extraction_internal_scope_contract_v1()
  owner to postgres;
revoke all on function private.youtube_extraction_internal_scope_contract_v1()
  from public, anon, authenticated, service_role,
    youtube_extraction_worker, youtube_extraction_credential_manager;
comment on function private.youtube_extraction_internal_scope_contract_v1() is
  'Versioned marker for the internal request scopes required by YouTube extraction; bump only when that contract changes.';

-- Supabase migrations run as a non-superuser. Lease only the owner role and
-- schema CREATE privileges required for CREATE OR REPLACE, then revoke both
-- before this migration commits.
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

do $migration$
declare
  v_base_fingerprint constant text :=
    'b8561e40e39a97962dab877e3d7c732236bf1bc55c8c985e56b846c50f7f90b1';
  v_hotfix_fingerprint constant text :=
    '17a54238fccf56255accbdd492f77f548c697089f96705350cb4f4085d248ca1';
  v_current_fingerprint constant text :=
    'a0740a9e9789d0176d55bac206f3bc7a7ed2b5dc9eb31737317d072512477d6c';
  v_shared_scope constant text :=
    'private.verify_full_local_internal_scope()';
  v_youtube_scope constant text :=
    'private.youtube_extraction_internal_scope_contract_v1()';
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
  v_previous_occurrences integer;
  v_current_occurrences integer;
  v_shared_scope_occurrences integer;
  v_youtube_scope_occurrences integer;
begin
  for v_signature in
    select signature
    from pg_catalog.unnest(array[
      'public.read_youtube_extraction_enqueue_readiness()'::regprocedure,
      'private.assert_youtube_extraction_catalog_ready()'::regprocedure
    ]) as signature
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    v_previous_occurrences := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_base_fingerprint, ''))
    ) / pg_catalog.length(v_base_fingerprint) + (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_hotfix_fingerprint, ''))
    ) / pg_catalog.length(v_hotfix_fingerprint);
    v_current_occurrences := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_current_fingerprint, ''))
    ) / pg_catalog.length(v_current_fingerprint);

    if v_previous_occurrences = 1 and v_current_occurrences = 0 then
      v_rewritten := pg_catalog.replace(
        pg_catalog.replace(
          v_definition,
          v_base_fingerprint,
          v_current_fingerprint
        ),
        v_hotfix_fingerprint,
        v_current_fingerprint
      );
    elsif v_previous_occurrences = 0 and v_current_occurrences = 1 then
      v_rewritten := v_definition;
    else
      raise exception 'YouTube extraction catalog fingerprint source drifted: %',
        v_signature::text
        using errcode = '55000';
    end if;

    if v_signature =
      'public.read_youtube_extraction_enqueue_readiness()'::regprocedure then
      v_shared_scope_occurrences := (
        pg_catalog.length(v_rewritten)
        - pg_catalog.length(pg_catalog.replace(v_rewritten, v_shared_scope, ''))
      ) / pg_catalog.length(v_shared_scope);
      v_youtube_scope_occurrences := (
        pg_catalog.length(v_rewritten)
        - pg_catalog.length(pg_catalog.replace(v_rewritten, v_youtube_scope, ''))
      ) / pg_catalog.length(v_youtube_scope);
      if v_shared_scope_occurrences = 1 and v_youtube_scope_occurrences = 0 then
        v_rewritten := pg_catalog.replace(
          v_rewritten,
          v_shared_scope,
          v_youtube_scope
        );
      elsif not (
        v_shared_scope_occurrences = 0 and v_youtube_scope_occurrences = 1
      ) then
        raise exception 'YouTube extraction scope marker source drifted: %',
          v_signature::text
          using errcode = '55000';
      end if;
    end if;

    execute v_rewritten;

    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    if pg_catalog.strpos(v_definition, v_base_fingerprint) <> 0
      or pg_catalog.strpos(v_definition, v_hotfix_fingerprint) <> 0
      or pg_catalog.strpos(v_definition, v_current_fingerprint) = 0 then
      raise exception 'YouTube extraction catalog fingerprint rewrite failed: %',
        v_signature::text
        using errcode = '55000';
    end if;
  end loop;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.read_youtube_extraction_enqueue_readiness()'::regprocedure
  );
  if pg_catalog.strpos(v_definition, v_shared_scope) <> 0
    or pg_catalog.strpos(v_definition, v_youtube_scope) = 0 then
    raise exception 'YouTube extraction scope marker rewrite failed'
      using errcode = '55000';
  end if;
end;
$migration$;

comment on function public.read_youtube_extraction_enqueue_readiness() is
  'Returns the exact policy, credential, and YouTube-specific catalog attestation required before enqueue.';
comment on function private.assert_youtube_extraction_catalog_ready() is
  'Fails closed unless the live YouTube extraction catalog matches the versioned expected digest.';

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

commit;
