alter table public.shopping_list_items
  drop constraint if exists shopping_list_items_added_to_pantry_integrity;

alter table public.shopping_list_items
  add constraint shopping_list_items_added_to_pantry_integrity check (
    added_to_pantry = false
    or is_checked = true
    or is_pantry_excluded = true
  );

comment on constraint shopping_list_items_added_to_pantry_integrity on public.shopping_list_items
  is 'added_to_pantry marks pantry reflection for checked purchase items or already-have excluded items.';

create or replace function public.complete_shopping_list(
  p_list_id uuid,
  p_user_id uuid,
  p_add_to_pantry_item_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_now timestamptz := now();
  v_completed_at timestamptz;
  v_newly_completed boolean := false;
  v_meal_ids uuid[] := '{}'::uuid[];
  v_meals_updated integer := 0;
  v_pantry_item_ids uuid[] := '{}'::uuid[];
  v_ingredient_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 장보기 리스트만 완료할 수 있어요.'
    );
  end if;

  select *
    into v_list
    from public.shopping_lists
    where id = p_list_id
    for update;

  if not found then
    return jsonb_build_object(
      'error_code', 'RESOURCE_NOT_FOUND',
      'message', '장보기 리스트를 찾을 수 없어요.'
    );
  end if;

  if v_list.user_id <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 장보기 리스트만 완료할 수 있어요.'
    );
  end if;

  if v_list.is_completed then
    v_completed_at := v_list.completed_at;
  else
    update public.shopping_lists
       set is_completed = true,
           completed_at = v_now
     where id = p_list_id
       and user_id = p_user_id
     returning completed_at into v_completed_at;

    v_newly_completed := true;
  end if;

  with updated_meals as (
    update public.meals
       set status = 'shopping_done',
           updated_at = v_now
     where shopping_list_id = p_list_id
       and user_id = p_user_id
       and status = 'registered'
     returning id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_meal_ids
    from updated_meals;

  v_meals_updated := coalesce(array_length(v_meal_ids, 1), 0);

  if v_list.is_completed then
    select coalesce(array_agg(id order by id), '{}'::uuid[])
      into v_pantry_item_ids
      from public.shopping_list_items
      where shopping_list_id = p_list_id
        and added_to_pantry = true;

    return jsonb_build_object(
      'completed', true,
      'meals_updated', v_meals_updated,
      'pantry_added', coalesce(array_length(v_pantry_item_ids, 1), 0),
      'pantry_added_item_ids', to_jsonb(v_pantry_item_ids),
      'completed_at', v_completed_at,
      'meal_ids', to_jsonb(v_meal_ids),
      'newly_completed', false
    );
  end if;

  if p_add_to_pantry_item_ids is null or cardinality(p_add_to_pantry_item_ids) > 0 then
    with valid_items as (
      select id, ingredient_id
        from public.shopping_list_items
        where shopping_list_id = p_list_id
          and (
            (is_checked = true and is_pantry_excluded = false)
            or is_pantry_excluded = true
          )
          and (
            p_add_to_pantry_item_ids is null
            or id = any(p_add_to_pantry_item_ids)
          )
    ),
    distinct_ingredients as (
      select distinct ingredient_id
        from valid_items
    )
    select
      coalesce((select array_agg(id order by id) from valid_items), '{}'::uuid[]),
      coalesce((select array_agg(ingredient_id order by ingredient_id) from distinct_ingredients), '{}'::uuid[])
      into v_pantry_item_ids, v_ingredient_ids;

    insert into public.pantry_items (user_id, ingredient_id)
    select p_user_id, ingredient_id
      from unnest(v_ingredient_ids) as ingredient_id
      where not exists (
        select 1
          from public.pantry_items existing
          where existing.user_id = p_user_id
            and existing.ingredient_id = ingredient_id
      );

    update public.shopping_list_items
       set added_to_pantry = true
     where id = any(v_pantry_item_ids)
       and shopping_list_id = p_list_id
       and added_to_pantry = false;
  end if;

  return jsonb_build_object(
    'completed', true,
    'meals_updated', v_meals_updated,
    'pantry_added', coalesce(array_length(v_pantry_item_ids, 1), 0),
    'pantry_added_item_ids', to_jsonb(v_pantry_item_ids),
    'completed_at', v_completed_at,
    'meal_ids', to_jsonb(v_meal_ids),
    'newly_completed', v_newly_completed
  );
end;
$$;

grant execute on function public.complete_shopping_list(uuid, uuid, uuid[]) to authenticated, service_role;
