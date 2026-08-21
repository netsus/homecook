-- Reject absent PostgREST scope headers before PostgreSQL three-valued logic
-- can turn the private allowlist predicate into a fail-open NULL.

begin;

create or replace function public.verify_hybrid_request_authority_pre_request()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_role text := v_claims ->> 'role';
begin
  if v_role = 'service_role'
    and btrim(coalesce(v_headers ->> 'x-homecook-internal-scope', '')) = '' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_role = 'anon'
    and btrim(coalesce(v_headers ->> 'x-homecook-public-read-scope', '')) = '' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  perform private.verify_hybrid_request_authority();
end;
$function$;

alter function public.verify_hybrid_request_authority_pre_request()
  owner to postgres;

revoke all on function public.verify_hybrid_request_authority_pre_request()
  from public, anon, authenticated, service_role;
grant execute on function public.verify_hybrid_request_authority_pre_request()
  to anon, authenticated, service_role;

comment on function public.verify_hybrid_request_authority_pre_request() is
  'PostgREST pre-request entrypoint v2: missing scopes fail closed before private authority delegation.';

alter role authenticator set pgrst.db_pre_request =
  'public.verify_hybrid_request_authority_pre_request';
notify pgrst, 'reload config';

commit;
