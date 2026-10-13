create schema extensions;
create extension pgcrypto with schema extensions;
create schema private;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public,auth to anon,authenticated,service_role;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true); $$;
-- Cryptographic/session lifecycle verification is an existing dependency, not reimplemented by this D1 fixture.
create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb
language plpgsql as $$
begin
  if $1::text is distinct from current_setting('fixture.owner',true) or $2 is distinct from '2026-10-13T00:00:00Z'::timestamptz
    or $3 is distinct from repeat('b',64) or $4 is distinct from 1 or $5 is distinct from '2026-10-13T01:00:00Z'::timestamptz then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode='55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook-account-owner:'||$1::text,0));
  return jsonb_build_object('account_generation',coalesce(nullif(current_setting('fixture.generation',true),''),'3')::bigint);
end;
$$;
create table public.mutation_idempotency_keys (
  id uuid primary key default extensions.gen_random_uuid(), owner_uuid uuid,account_generation bigint,operation_scope text,key_hash text,payload_hash text,
  state text,attempt_token uuid,lease_expires_at timestamptz,created_at timestamptz,updated_at timestamptz,terminal_result text,durable_result jsonb,result_reference uuid,
  unique(owner_uuid,account_generation,operation_scope,key_hash)
);
create function private.verify_full_local_internal_scope() returns void language plpgsql as $$
begin
  if current_setting('request.headers',true)::jsonb->>'x-homecook-internal-scope'='fixture-existing-scope'
    and current_setting('request.method',true)='POST' and current_setting('request.path',true)='/rpc/fixture_existing_rpc' then
    perform set_config('fixture.predecessor_called','true',true); return;
  end if;
  raise exception 'PREDECESSOR_SCOPE_DENIED' using errcode='42501';
end;
$$;
