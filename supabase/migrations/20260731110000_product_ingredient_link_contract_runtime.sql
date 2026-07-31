begin;

alter table public.pantry_items
  add column food_product_id uuid,
  add column food_product_nutrition_version_id uuid,
  alter column ingredient_id drop not null,
  drop constraint if exists pantry_items_user_id_ingredient_id_key,
  drop constraint if exists pantry_items_ingredient_id_fkey;

alter table public.pantry_items
  add constraint pantry_items_ingredient_id_fkey
    foreign key (ingredient_id) references public.ingredients(id) on delete restrict,
  add constraint pantry_items_identity_xor_check check (
    (
      ingredient_id is not null
      and food_product_id is null
      and food_product_nutrition_version_id is null
    )
    or (
      ingredient_id is null
      and food_product_id is not null
      and food_product_nutrition_version_id is not null
    )
  ),
  add constraint pantry_items_product_version_fkey
    foreign key (food_product_id, food_product_nutrition_version_id)
    references public.food_product_nutrition_versions(product_id, id)
    on delete restrict;

create unique index pantry_items_user_ingredient_unique
  on public.pantry_items (user_id, ingredient_id)
  where ingredient_id is not null;

create unique index pantry_items_user_product_version_unique
  on public.pantry_items (
    user_id,
    food_product_id,
    food_product_nutrition_version_id
  )
  where ingredient_id is null;

create index pantry_items_user_product_lookup_idx
  on public.pantry_items (user_id, food_product_id, food_product_nutrition_version_id)
  where food_product_id is not null;

alter table public.shopping_list_items
  add column food_product_id uuid,
  add column food_product_nutrition_version_id uuid,
  alter column ingredient_id drop not null,
  drop constraint if exists shopping_list_items_shopping_list_id_ingredient_id_key;

do $preflight$
begin
  if exists (
    select 1
    from public.shopping_list_items
    where ingredient_id is null
      and food_product_id is null
      and food_product_nutrition_version_id is null
  ) then
    raise exception 'SHOPPING_LIST_ITEMS_ALL_NULL_PROVENANCE'
      using errcode = '23514';
  end if;
end
$preflight$;

alter table public.shopping_list_items
  add constraint shopping_list_items_identity_xor_check check (
    (
      ingredient_id is not null
      and food_product_id is null
      and food_product_nutrition_version_id is null
    )
    or (
      ingredient_id is null
      and food_product_id is not null
      and food_product_nutrition_version_id is not null
    )
  ),
  add constraint shopping_list_items_product_version_fkey
    foreign key (food_product_id, food_product_nutrition_version_id)
    references public.food_product_nutrition_versions(product_id, id)
    on delete restrict;

create unique index shopping_list_items_list_ingredient_unique
  on public.shopping_list_items (shopping_list_id, ingredient_id)
  where ingredient_id is not null;

create unique index shopping_list_items_list_product_version_unique
  on public.shopping_list_items (
    shopping_list_id,
    food_product_id,
    food_product_nutrition_version_id
  )
  where ingredient_id is null and food_product_id is not null;

create index shopping_list_items_list_product_lookup_idx
  on public.shopping_list_items (
    shopping_list_id,
    food_product_id,
    food_product_nutrition_version_id
  )
  where food_product_id is not null;

create or replace function public.select_pantry_effective_ingredients(p_user_id uuid)
returns table (ingredient_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return;
  end if;

  return query
  select distinct effective.ingredient_id
  from (
    select pantry.ingredient_id
    from public.pantry_items as pantry
    where pantry.user_id = p_user_id
      and pantry.ingredient_id is not null

    union

    select link.ingredient_id
    from public.pantry_items as pantry
    join public.food_products as product
      on product.id = pantry.food_product_id
     and product.deleted_at is null
     and product.moderation_status = 'visible'
     and recipe_visibility_guard.is_owner_publicly_visible(
       product.owner_user_id
     )
     and (
       product.visibility = 'public'
       or (
         product.visibility = 'private'
         and product.owner_user_id = p_user_id
       )
     )
    join public.food_product_ingredient_links as link
      on link.product_id = pantry.food_product_id
     and link.relation = 'represents'
     and link.review_status = 'approved'
     and link.is_primary
     and link.is_active
    where pantry.user_id = p_user_id
      and pantry.ingredient_id is null
      and pantry.food_product_id is not null
      and pantry.food_product_nutrition_version_id is not null
  ) as effective;
end;
$function$;

revoke all on function public.select_pantry_effective_ingredients(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.select_pantry_effective_ingredients(uuid)
  to authenticated;

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
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_item jsonb;
  v_list_id uuid;
  v_created_at timestamptz;
  v_owned_meal_count integer := 0;
  v_meals_updated integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
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
    select value
    from jsonb_array_elements(coalesce(p_split_remainders, '[]'::jsonb))
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
    select value
    from jsonb_array_elements(coalesce(p_split_originals, '[]'::jsonb))
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
      set status = 'shopping_done', updated_at = v_now
      where id = any(coalesce(p_shopping_meal_ids, '{}'::uuid[]))
        and user_id = p_user_id
        and status = 'registered'
        and shopping_list_id is null
      returning id
    )
    select count(*) into v_meals_updated from updated_meals;

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
    food_product_id,
    food_product_nutrition_version_id,
    display_text,
    amounts_json,
    is_pantry_excluded,
    is_checked,
    added_to_pantry,
    sort_order
  )
  select
    v_list_id,
    nullif(row ->> 'ingredient_id', '')::uuid,
    nullif(row ->> 'food_product_id', '')::uuid,
    nullif(row ->> 'food_product_nutrition_version_id', '')::uuid,
    row ->> 'display_text',
    coalesce(row -> 'amounts_json', '[]'::jsonb),
    coalesce((row ->> 'is_pantry_excluded')::boolean, false),
    false,
    false,
    coalesce((row ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_item_rows, '[]'::jsonb)) as row;

  update public.meals
  set shopping_list_id = v_list_id, updated_at = v_now
  where id = any(coalesce(p_shopping_meal_ids, '{}'::uuid[]))
    and user_id = p_user_id
    and status = 'registered'
    and shopping_list_id is null;

  return jsonb_build_object(
    'id', v_list_id,
    'title', p_title,
    'is_completed', false,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'source_type', case
            when item.ingredient_id is not null then 'ingredient'
            when item.food_product_id is not null
              and item.food_product_nutrition_version_id is not null
              then 'food_product'
            else null
          end,
          'ingredient_id', item.ingredient_id,
          'food_product_id', item.food_product_id,
          'food_product_nutrition_version_id',
            item.food_product_nutrition_version_id,
          'display_text', item.display_text,
          'amounts_json', item.amounts_json,
          'is_checked', item.is_checked,
          'is_pantry_excluded', item.is_pantry_excluded,
          'added_to_pantry', item.added_to_pantry,
          'sort_order', item.sort_order
        )
        order by item.sort_order, item.id
      )
      from public.shopping_list_items as item
      where item.shopping_list_id = v_list_id
    ), '[]'::jsonb),
    'created_at', v_created_at
  );
end;
$function$;

revoke all on function public.create_shopping_list_from_payload(
  uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer
) from public, anon, authenticated, service_role;
grant execute on function public.create_shopping_list_from_payload(
  uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer
) to authenticated;

create or replace function public.complete_shopping_list(
  p_list_id uuid,
  p_user_id uuid,
  p_add_to_pantry_item_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_list public.shopping_lists%rowtype;
  v_now timestamptz := now();
  v_completed_at timestamptz;
  v_newly_completed boolean := false;
  v_meal_ids uuid[] := '{}'::uuid[];
  v_meals_updated integer := 0;
  v_pantry_item_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return jsonb_build_object('error_code', 'FORBIDDEN', 'message', '내 장보기 리스트만 완료할 수 있어요.');
  end if;

  select * into v_list
  from public.shopping_lists
  where id = p_list_id
  for update;

  if not found then
    return jsonb_build_object('error_code', 'RESOURCE_NOT_FOUND', 'message', '장보기 리스트를 찾을 수 없어요.');
  end if;
  if v_list.user_id <> p_user_id then
    return jsonb_build_object('error_code', 'FORBIDDEN', 'message', '내 장보기 리스트만 완료할 수 있어요.');
  end if;

  if v_list.is_completed then
    v_completed_at := v_list.completed_at;
  else
    update public.shopping_lists
    set is_completed = true, completed_at = v_now
    where id = p_list_id and user_id = p_user_id
    returning completed_at into v_completed_at;
    v_newly_completed := true;
  end if;

  with updated_meals as (
    update public.meals
    set status = 'shopping_done', updated_at = v_now
    where shopping_list_id = p_list_id
      and user_id = p_user_id
      and status = 'registered'
    returning id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_meal_ids
  from updated_meals;
  v_meals_updated := cardinality(v_meal_ids);

  if v_list.is_completed then
    select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_pantry_item_ids
    from public.shopping_list_items
    where shopping_list_id = p_list_id and added_to_pantry;
  elsif p_add_to_pantry_item_ids is null
     or cardinality(p_add_to_pantry_item_ids) > 0 then
    with valid_items as (
      select
        item.id,
        item.ingredient_id,
        item.food_product_id,
        item.food_product_nutrition_version_id
      from public.shopping_list_items as item
      where item.shopping_list_id = p_list_id
        and (
          (item.is_checked and not item.is_pantry_excluded)
          or item.is_pantry_excluded
        )
        and (
          p_add_to_pantry_item_ids is null
          or item.id = any(p_add_to_pantry_item_ids)
        )
        and (
          item.ingredient_id is not null
          or (
            item.food_product_id is not null
            and item.food_product_nutrition_version_id is not null
          )
        )
    ),
    inserted_generic as (
      insert into public.pantry_items (user_id, ingredient_id)
      select distinct p_user_id, item.ingredient_id
      from valid_items as item
      where item.ingredient_id is not null
      on conflict (user_id, ingredient_id)
        where ingredient_id is not null
      do nothing
    ),
    inserted_products as (
      insert into public.pantry_items (
        user_id,
        food_product_id,
        food_product_nutrition_version_id
      )
      select distinct
        p_user_id,
        item.food_product_id,
        item.food_product_nutrition_version_id
      from valid_items as item
      where item.ingredient_id is null
        and item.food_product_id is not null
        and item.food_product_nutrition_version_id is not null
      on conflict (
        user_id,
        food_product_id,
        food_product_nutrition_version_id
      ) where ingredient_id is null
      do nothing
    )
    select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_pantry_item_ids
    from valid_items;

    update public.shopping_list_items
    set added_to_pantry = true
    where id = any(v_pantry_item_ids)
      and shopping_list_id = p_list_id
      and not added_to_pantry;
  end if;

  return jsonb_build_object(
    'completed', true,
    'meals_updated', v_meals_updated,
    'pantry_added', cardinality(v_pantry_item_ids),
    'pantry_added_item_ids', to_jsonb(v_pantry_item_ids),
    'completed_at', v_completed_at,
    'meal_ids', to_jsonb(v_meal_ids),
    'newly_completed', v_newly_completed
  );
end;
$function$;

revoke all on function public.complete_shopping_list(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.complete_shopping_list(uuid, uuid, uuid[])
  to authenticated;

alter table public.food_product_nutrition_versions
  drop constraint food_product_nutrition_versions_product_id_fkey,
  add constraint food_product_nutrition_versions_product_id_fkey
    foreign key (product_id)
    references public.food_products(id)
    on delete cascade;

create or replace function public.protect_food_product_nutrition_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_cleanup_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_cleanup_user_id := nullif(
      current_setting('homecook.private_product_cleanup_user_id', true),
      ''
    )::uuid;

    -- Only the service-only account cleanup function sets this transaction-local
    -- token after its exact private-owner fence and zero-reference check.
    if v_cleanup_user_id is not null then
      return old;
    end if;
  end if;

  raise exception 'IMMUTABLE_PRODUCT_NUTRITION_VERSION';
end;
$function$;

revoke all on function public.protect_food_product_nutrition_version()
  from public, anon, authenticated, service_role;

commit;
