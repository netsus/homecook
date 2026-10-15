begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Replace only the exact DB231 outer guard; preserve its delegated allow-list.
do $preimage$
declare observed jsonb;
begin
  select jsonb_build_object(
    'definition_sha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
    'source_hash', md5(btrim(p.prosrc, chr(10))),
    'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl,
    'configuration', p.proconfig, 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'arguments', pg_get_function_identity_arguments(p.oid),
    'result', pg_get_function_result(p.oid)
  ) into observed
  from pg_proc p where p.oid = 'private.verify_full_local_internal_scope()'::regprocedure;
  if observed is distinct from '{"definition_sha256":"59cd9173efa0be26485d26e8c94ff49b816459c6f915b8bf41ade64838526ee4","source_hash":"cdba05648213ef145555dfc02fd234c8","owner":"postgres","acl":["postgres=X/postgres"],"configuration":["search_path=pg_catalog, public, private, pg_temp"],"security_definer":true,"volatility":"v","arguments":"","result":"void"}'::jsonb then
    raise exception 'RECIPE_FUTURE_REQUEST_ROLE_PREIMAGE_MISMATCH';
  end if;
end;
$preimage$;

create or replace function private.verify_full_local_internal_scope() returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  -- auth.role() reads the JSON JWT claims used by PostgREST as well as legacy claims.
  if auth.role() = 'service_role'
    and coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='recipe-future-propagation'
    and current_setting('request.method',true)='POST' and current_setting('request.path',true) in
      ('/rpc/read_recipe_future_patch_result','/rpc/write_recipe_future_plan_change_recoverable') then return;end if;
  perform private.verify_scope_pre_recipe_future_http_replay_20261014();
end;
$function$;

-- CREATE OR REPLACE keeps the original postgres owner and postgres-only ACL.
notify pgrst, 'reload schema';
commit;
