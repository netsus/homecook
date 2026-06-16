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
          and is_checked = true
          and is_pantry_excluded = false
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

create or replace function public.create_shopping_list_from_payload(
  p_user_id uuid,
  p_title text,
  p_date_range_start date,
  p_date_range_end date,
  p_complete_without_list boolean,
  p_shopping_meal_ids uuid[],
  p_split_remainders jsonb default '[]'::jsonb,
  p_split_originals jsonb default '[]'::jsonb,
  p_recipe_rows jsonb default '[]'::jsonb,
  p_item_rows jsonb default '[]'::jsonb,
  p_pantry_item_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_item jsonb;
  v_list_id uuid;
  v_created_at timestamptz;
  v_owned_meal_count integer := 0;
  v_meals_updated integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 식사만 장보기로 만들 수 있어요.'
    );
  end if;

  select count(*)
    into v_owned_meal_count
    from public.meals
    where id = any(coalesce(p_shopping_meal_ids, '{}'::uuid[]))
      and user_id = p_user_id
      and status = 'registered'
      and shopping_list_id is null;

  if v_owned_meal_count <> cardinality(coalesce(p_shopping_meal_ids, '{}'::uuid[])) then
    return jsonb_build_object(
      'error_code', 'CONFLICT',
      'message', '이미 다른 장보기 리스트에 포함된 식사가 있어요.'
    );
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_split_remainders, '[]'::jsonb))
  loop
    insert into public.meals (
      user_id,
      recipe_id,
      plan_date,
      column_id,
      planned_servings,
      status,
      is_leftover,
      leftover_dish_id,
      shopping_list_id,
      cooked_at
    ) values (
      (v_item ->> 'user_id')::uuid,
      (v_item ->> 'recipe_id')::uuid,
      (v_item ->> 'plan_date')::date,
      (v_item ->> 'column_id')::uuid,
      (v_item ->> 'planned_servings')::integer,
      'registered',
      coalesce((v_item ->> 'is_leftover')::boolean, false),
      nullif(v_item ->> 'leftover_dish_id', '')::uuid,
      null,
      null
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_split_originals, '[]'::jsonb))
  loop
    update public.meals
       set planned_servings = (v_item ->> 'planned_servings')::integer,
           updated_at = v_now
     where id = (v_item ->> 'meal_id')::uuid
       and user_id = p_user_id
       and status = 'registered'
       and shopping_list_id is null;
  end loop;

  if p_complete_without_list then
    with updated_meals as (
      update public.meals
         set status = 'shopping_done',
             updated_at = v_now
       where id = any(coalesce(p_shopping_meal_ids, '{}'::uuid[]))
         and user_id = p_user_id
         and status = 'registered'
         and shopping_list_id is null
       returning id
    )
    select count(*)
      into v_meals_updated
      from updated_meals;

    return jsonb_build_object(
      'id', null,
      'title', p_title,
      'date_range_start', p_date_range_start,
      'date_range_end', p_date_range_end,
      'is_completed', true,
      'completed_at', v_now,
      'completed_without_list', true,
      'meals_updated', v_meals_updated,
      'pantry_item_count', greatest(0, coalesce(p_pantry_item_count, 0)),
      'created_at', v_now
    );
  end if;

  insert into public.shopping_lists (
    user_id,
    title,
    date_range_start,
    date_range_end,
    is_completed
  ) values (
    p_user_id,
    p_title,
    p_date_range_start,
    p_date_range_end,
    false
  )
  returning id, created_at into v_list_id, v_created_at;

  insert into public.shopping_list_recipes (
    shopping_list_id,
    recipe_id,
    shopping_servings,
    planned_servings_total
  )
  select
    v_list_id,
    (row ->> 'recipe_id')::uuid,
    (row ->> 'shopping_servings')::integer,
    (row ->> 'planned_servings_total')::integer
  from jsonb_array_elements(coalesce(p_recipe_rows, '[]'::jsonb)) as row;

  insert into public.shopping_list_items (
    shopping_list_id,
    ingredient_id,
    display_text,
    amounts_json,
    is_pantry_excluded,
    is_checked,
    added_to_pantry,
    sort_order
  )
  select
    v_list_id,
    (row ->> 'ingredient_id')::uuid,
    row ->> 'display_text',
    coalesce(row -> 'amounts_json', '[]'::jsonb),
    coalesce((row ->> 'is_pantry_excluded')::boolean, false),
    false,
    false,
    coalesce((row ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_item_rows, '[]'::jsonb)) as row;

  update public.meals
     set shopping_list_id = v_list_id,
         updated_at = v_now
   where id = any(coalesce(p_shopping_meal_ids, '{}'::uuid[]))
     and user_id = p_user_id
     and status = 'registered'
     and shopping_list_id is null;

  return jsonb_build_object(
    'id', v_list_id,
    'title', p_title,
    'is_completed', false,
    'created_at', v_created_at
  );
end;
$$;

create or replace function public.create_manual_recipe(
  p_user_id uuid,
  p_title text,
  p_base_servings integer,
  p_thumbnail_url text,
  p_tags text[] default '{}',
  p_ingredients jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.recipes%rowtype;
  v_item jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 레시피만 등록할 수 있어요.'
    );
  end if;

  insert into public.recipes (
    title,
    base_servings,
    source_type,
    created_by,
    thumbnail_url,
    tags
  ) values (
    p_title,
    p_base_servings,
    'manual',
    p_user_id,
    p_thumbnail_url,
    coalesce(p_tags, '{}'::text[])
  )
  returning * into v_recipe;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    insert into public.recipe_ingredients (
      recipe_id,
      ingredient_id,
      amount,
      unit,
      ingredient_type,
      display_text,
      scalable,
      sort_order
    ) values (
      v_recipe.id,
      (v_item ->> 'ingredient_id')::uuid,
      nullif(v_item ->> 'amount', '')::numeric,
      nullif(v_item ->> 'unit', ''),
      (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
      nullif(v_item ->> 'display_text', ''),
      coalesce((v_item ->> 'scalable')::boolean, true),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.recipe_steps (
      recipe_id,
      step_number,
      instruction,
      cooking_method_id,
      ingredients_used,
      heat_level,
      duration_seconds,
      duration_text
    ) values (
      v_recipe.id,
      (v_item ->> 'step_number')::integer,
      v_item ->> 'instruction',
      (v_item ->> 'cooking_method_id')::uuid,
      coalesce(v_item -> 'ingredients_used', '[]'::jsonb),
      nullif(v_item ->> 'heat_level', ''),
      nullif(v_item ->> 'duration_seconds', '')::integer,
      nullif(v_item ->> 'duration_text', '')
    );
  end loop;

  return jsonb_build_object(
    'id', v_recipe.id,
    'title', v_recipe.title,
    'source_type', v_recipe.source_type,
    'created_by', v_recipe.created_by,
    'base_servings', v_recipe.base_servings
  );
end;
$$;

grant execute on function public.complete_shopping_list(uuid, uuid, uuid[]) to authenticated, service_role;
grant execute on function public.create_shopping_list_from_payload(
  uuid,
  text,
  date,
  date,
  boolean,
  uuid[],
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  integer
) to authenticated, service_role;
grant execute on function public.create_manual_recipe(
  uuid,
  text,
  integer,
  text,
  text[],
  jsonb,
  jsonb
) to authenticated, service_role;
