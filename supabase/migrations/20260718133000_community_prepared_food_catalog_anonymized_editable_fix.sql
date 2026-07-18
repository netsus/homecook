do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure
  )
  into v_definition;

  if v_definition is null then
    raise exception 'LIST_FOOD_PRODUCTS_MISSING';
  end if;

  v_updated_definition := regexp_replace(
    v_definition,
    '(''editable'',\s*context\.source_type = ''manual''\s*and context\.owner_user_id)\s*=\s*p_user_id(\s*and context\.moderation_status = ''visible'')',
    E'\\1 is not null and p_user_id is not null and context.owner_user_id = p_user_id\\2'
  );

  if v_updated_definition = v_definition then
    raise exception 'LIST_FOOD_PRODUCTS_EDITABLE_PATCH_FAILED';
  end if;

  execute v_updated_definition;
end;
$$;

create or replace function public.list_food_products(
  p_user_id uuid,
  p_query text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.list_food_products(
    p_user_id, p_query, 'all', p_cursor_created_at, p_cursor_id, p_limit
  )
$$;

revoke all on function public.list_food_products(uuid, text, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_food_products(uuid, text, text, timestamptz, uuid, integer)
  to authenticated, service_role;

revoke all on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  to authenticated, service_role;
