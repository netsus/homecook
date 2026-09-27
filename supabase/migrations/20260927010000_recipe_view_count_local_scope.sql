begin;

-- Preserve every existing scope rule and add only the public view telemetry RPC.
do $migration$
begin
  if to_regprocedure('private.verify_full_local_internal_scope_pre_recipe_view()') is null then
    alter function private.verify_full_local_internal_scope()
      rename to verify_full_local_internal_scope_pre_recipe_view;
  end if;
end;
$migration$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if v_headers ->> 'x-homecook-internal-scope' = 'recipe-view'
    and upper(coalesce(current_setting('request.method', true), '')) = 'POST'
    and current_setting('request.path', true) = '/rpc/increment_recipe_view_count' then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_recipe_view();
end;
$function$;

alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope() from public, anon, authenticated, service_role;
revoke all on function private.verify_full_local_internal_scope_pre_recipe_view() from public, anon, authenticated, service_role;

create or replace function public.increment_recipe_view_count(p_recipe_id uuid)
returns table(id uuid, view_count integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if auth.role() is distinct from 'service_role'
    or (v_headers ->> 'x-homecook-internal-scope') is distinct from 'recipe-view'
    or upper(coalesce(current_setting('request.method', true), '')) <> 'POST'
    or current_setting('request.path', true) is distinct from '/rpc/increment_recipe_view_count' then
    raise exception 'recipe view mutation requires exact service scope' using errcode = '42501';
  end if;
  perform private.verify_full_local_internal_scope();

  -- Only this column changes: preserve the existing account-generation telemetry exception.
  return query
  update public.recipes as recipe
     set view_count = recipe.view_count + 1
   where recipe.id = p_recipe_id
     and recipe.visibility = 'public'
     and recipe.deleted_at is null
     and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
  returning recipe.id, recipe.view_count;
end;
$function$;

alter function public.increment_recipe_view_count(uuid) owner to postgres;
revoke all on function public.increment_recipe_view_count(uuid) from public, anon, authenticated, service_role;
grant execute on function public.increment_recipe_view_count(uuid) to service_role;

commit;
