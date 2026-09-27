-- Preserve the predecessor scope ACL/body and add only two exact internal POST RPCs.
begin;
alter function private.verify_full_local_internal_scope() rename to verify_full_local_internal_scope_pre_manual_publish_20260927;
create function private.verify_full_local_internal_scope() returns void
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb ->> 'x-homecook-internal-scope' = 'recipe-future-propagation'
    and upper(coalesce(current_setting('request.method',true),''))='POST'
    and current_setting('request.path',true) in (
      '/rpc/publish_manual_recipe', '/rpc/read_owned_manual_recipe_publication_context'
    ) then return; end if;
  perform private.verify_full_local_internal_scope_pre_manual_publish_20260927();
end
$function$;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_internal_scope_pre_manual_publish_20260927() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
