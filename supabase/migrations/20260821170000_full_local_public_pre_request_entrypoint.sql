-- Route PostgREST pre-request execution through an exposed, self-blocking
-- entrypoint while preserving the private verifier as the only authority.

begin;

create or replace function public.verify_hybrid_request_authority_pre_request()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
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
  'PostgREST pre-request entrypoint. Direct RPC requests are rejected by the delegated authority verifier.';

alter role authenticator set pgrst.db_pre_request =
  'public.verify_hybrid_request_authority_pre_request';
notify pgrst, 'reload config';

commit;
