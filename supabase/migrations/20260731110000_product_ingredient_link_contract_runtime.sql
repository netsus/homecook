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

create table public.shopping_meal_snapshot_clone_tokens (
  token uuid primary key,
  source_meal_id uuid not null,
  user_id uuid not null,
  recipe_id uuid not null,
  plan_date date not null,
  column_id uuid not null,
  planned_servings integer not null,
  is_leftover boolean not null,
  leftover_dish_id uuid,
  recipe_nutrition_snapshot_id uuid,
  nutrition_snapshot_origin varchar(20),
  recipe_content_snapshot_id uuid,
  recipe_content_snapshot_origin varchar(20),
  created_at timestamptz not null default now()
);

revoke all on table public.shopping_meal_snapshot_clone_tokens
  from public, anon, authenticated, service_role;

create or replace function public.pin_recipe_snapshot_or_authorized_shopping_clone_on_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_snapshot_id uuid;
  v_content_id uuid;
  v_owner_user_id uuid;
  v_title varchar(200);
  v_base_servings numeric(8,2);
  v_ingredients_json jsonb;
  v_steps_json jsonb;
  v_content_hash text;
  v_clone_token uuid;
begin
  if new.recipe_content_snapshot_id is not null
    or new.recipe_content_snapshot_origin is not null
    or new.recipe_nutrition_snapshot_id is not null
    or new.nutrition_snapshot_origin is not null
  then
    delete from public.shopping_meal_snapshot_clone_tokens as clone_token
    where clone_token.token = nullif(
        current_setting(
          'homecook.shopping_meal_snapshot_clone_token',
          true
        ),
        ''
      )::uuid
      and clone_token.user_id = new.user_id
      and clone_token.recipe_id = new.recipe_id
      and clone_token.plan_date = new.plan_date
      and clone_token.column_id = new.column_id
      and clone_token.planned_servings = new.planned_servings
      and clone_token.is_leftover = new.is_leftover
      and clone_token.leftover_dish_id is not distinct from new.leftover_dish_id
      and clone_token.recipe_nutrition_snapshot_id
        is not distinct from new.recipe_nutrition_snapshot_id
      and clone_token.nutrition_snapshot_origin
        is not distinct from new.nutrition_snapshot_origin
      and clone_token.recipe_content_snapshot_id
        is not distinct from new.recipe_content_snapshot_id
      and clone_token.recipe_content_snapshot_origin
        is not distinct from new.recipe_content_snapshot_origin
    returning clone_token.token into v_clone_token;

    if v_clone_token is not null then
      perform set_config(
        'homecook.shopping_meal_snapshot_clone_token',
        '',
        true
      );
      return new;
    end if;

    raise exception 'CLIENT_SELECTED_CONTENT_OR_NUTRITION_SNAPSHOT_NOT_ALLOWED';
  end if;

  select snapshot.id
    into v_snapshot_id
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.recipe_id = new.recipe_id
    and snapshot.is_current
  limit 1;

  select input.owner_user_id,
         input.title,
         input.base_servings,
         input.ingredients_json,
         input.steps_json,
         input.content_hash
    into v_owner_user_id,
         v_title,
         v_base_servings,
         v_ingredients_json,
         v_steps_json,
         v_content_hash
  from public.build_recipe_content_snapshot_input(new.recipe_id) as input;

  insert into public.recipe_content_snapshots (
    owner_user_id,
    recipe_id,
    recipe_nutrition_snapshot_id,
    title,
    base_servings,
    ingredients_json,
    steps_json,
    content_hash,
    schema_version
  ) values (
    v_owner_user_id,
    new.recipe_id,
    v_snapshot_id,
    v_title,
    v_base_servings,
    v_ingredients_json,
    v_steps_json,
    v_content_hash,
    1
  )
  on conflict (
    recipe_id,
    content_hash,
    recipe_nutrition_snapshot_id,
    schema_version
  )
  do nothing
  returning id into v_content_id;

  if v_content_id is null then
    select snapshot.id
      into v_content_id
    from public.recipe_content_snapshots as snapshot
    where snapshot.recipe_id = new.recipe_id
      and snapshot.content_hash = v_content_hash
      and snapshot.recipe_nutrition_snapshot_id is not distinct from v_snapshot_id
      and snapshot.schema_version = 1;
  end if;

  new.recipe_content_snapshot_id := v_content_id;
  new.recipe_content_snapshot_origin := 'created';
  new.recipe_nutrition_snapshot_id := v_snapshot_id;
  if v_snapshot_id is not null then
    new.nutrition_snapshot_origin := 'created';
  end if;
  return new;
end;
$function$;

revoke all on function public.pin_recipe_snapshot_or_authorized_shopping_clone_on_meal_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists pin_current_recipe_nutrition_snapshot_on_meal_insert
  on public.meals;
create trigger pin_current_recipe_nutrition_snapshot_on_meal_insert
before insert on public.meals
for each row execute function
  public.pin_recipe_snapshot_or_authorized_shopping_clone_on_meal_insert();

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
  v_original jsonb;
  v_source_meal public.meals%rowtype;
  v_list_id uuid;
  v_created_at timestamptz;
  v_date_range_start date;
  v_date_range_end date;
  v_requested_meal_count integer := 0;
  v_owned_meal_count integer := 0;
  v_invalid_count integer := 0;
  v_meals_updated integer := 0;
  v_pantry_item_count integer := 0;
  v_complete_without_list boolean := false;
  v_snapshot_clone_token uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 식사만 장보기로 만들 수 있어요.'
    );
  end if;

  if jsonb_typeof(coalesce(p_split_remainders, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_split_originals, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_recipe_rows, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_item_rows, '[]'::jsonb)) <> 'array'
  then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '장보기 생성 값이 올바르지 않아요.'
    );
  end if;

  select
    cardinality(coalesce(p_shopping_meal_ids, '{}'::uuid[])),
    count(distinct meal_id)
  into v_requested_meal_count, v_owned_meal_count
  from unnest(coalesce(p_shopping_meal_ids, '{}'::uuid[])) as meal_id;

  if v_requested_meal_count = 0
    or v_owned_meal_count <> v_requested_meal_count
  then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '선택된 식사가 없어요.'
    );
  end if;

  perform meal.id
  from public.meals as meal
  join public.meal_plan_columns as meal_column
    on meal_column.id = meal.column_id
   and meal_column.user_id = p_user_id
  join public.recipes as recipe
    on recipe.id = meal.recipe_id
   and recipe.deleted_at is null
   and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
   and (
     recipe.visibility = 'public'
     or recipe.created_by = p_user_id
   )
  where meal.id = any(p_shopping_meal_ids)
    and meal.user_id = p_user_id
    and meal.status = 'registered'
    and meal.shopping_list_id is null
  order by meal.id
  for update of meal;

  select
    count(*),
    min(meal.plan_date),
    max(meal.plan_date)
  into
    v_owned_meal_count,
    v_date_range_start,
    v_date_range_end
  from public.meals as meal
  join public.meal_plan_columns as meal_column
    on meal_column.id = meal.column_id
   and meal_column.user_id = p_user_id
  join public.recipes as recipe
    on recipe.id = meal.recipe_id
   and recipe.deleted_at is null
   and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
   and (
     recipe.visibility = 'public'
     or recipe.created_by = p_user_id
   )
  where meal.id = any(p_shopping_meal_ids)
    and meal.user_id = p_user_id
    and meal.status = 'registered'
    and meal.shopping_list_id is null;

  if v_owned_meal_count <> v_requested_meal_count then
    return jsonb_build_object(
      'error_code', 'CONFLICT',
      'message', '이미 다른 장보기 리스트에 포함된 식사가 있어요.'
    );
  end if;

  if jsonb_array_length(coalesce(p_split_remainders, '[]'::jsonb))
      <> jsonb_array_length(coalesce(p_split_originals, '[]'::jsonb))
  then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '장보기 분할 값이 올바르지 않아요.'
    );
  end if;

  select count(*)
  into v_invalid_count
  from (
    select
      remainder.value as remainder,
      original.value as original
    from jsonb_array_elements(
      coalesce(p_split_remainders, '[]'::jsonb)
    ) with ordinality as remainder(value, position)
    full join jsonb_array_elements(
      coalesce(p_split_originals, '[]'::jsonb)
    ) with ordinality as original(value, position)
      using (position)
  ) as split
  left join public.meals as meal
    on meal.id = (split.original ->> 'meal_id')::uuid
  left join public.meal_plan_columns as meal_column
    on meal_column.id = meal.column_id
   and meal_column.user_id = p_user_id
  where split.remainder is null
    or split.original is null
    or meal.id is null
    or not (meal.id = any(p_shopping_meal_ids))
    or meal.user_id <> p_user_id
    or meal.status <> 'registered'
    or meal.shopping_list_id is not null
    or meal_column.id is null
    or (split.remainder ->> 'user_id')::uuid <> p_user_id
    or (split.remainder ->> 'recipe_id')::uuid <> meal.recipe_id
    or (split.remainder ->> 'plan_date')::date <> meal.plan_date
    or (split.remainder ->> 'column_id')::uuid <> meal.column_id
    or coalesce(
      (split.remainder ->> 'is_leftover')::boolean,
      false
    ) <> meal.is_leftover
    or nullif(
      split.remainder ->> 'leftover_dish_id',
      ''
    )::uuid is distinct from meal.leftover_dish_id
    or (split.original ->> 'planned_servings')::integer <= 0
    or (split.remainder ->> 'planned_servings')::integer <= 0
    or (split.original ->> 'planned_servings')::integer
      + (split.remainder ->> 'planned_servings')::integer
      <> meal.planned_servings;

  if v_invalid_count > 0 then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 식사 정보만 장보기로 만들 수 있어요.'
    );
  end if;

  select count(*) - count(distinct (row ->> 'meal_id')::uuid)
  into v_invalid_count
  from jsonb_array_elements(
    coalesce(p_split_originals, '[]'::jsonb)
  ) as row;

  if v_invalid_count > 0 then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '장보기 분할 값이 올바르지 않아요.'
    );
  end if;

  select count(*)
  into v_owned_meal_count
  from (
    select distinct meal.recipe_id
    from public.meals as meal
    where meal.id = any(p_shopping_meal_ids)
  ) as selected_recipe;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(
    coalesce(p_recipe_rows, '[]'::jsonb)
  ) as row
  left join (
    select
      meal.recipe_id,
      sum(
        coalesce(
          split_original.planned_servings,
          meal.planned_servings
        )
      )::integer as planned_servings_total
    from public.meals as meal
    left join lateral (
      select (row ->> 'planned_servings')::integer as planned_servings
      from jsonb_array_elements(
        coalesce(p_split_originals, '[]'::jsonb)
      ) as row
      where (row ->> 'meal_id')::uuid = meal.id
    ) as split_original on true
    where meal.id = any(p_shopping_meal_ids)
    group by meal.recipe_id
  ) as selected_recipe
    on selected_recipe.recipe_id = (row ->> 'recipe_id')::uuid
  where selected_recipe.recipe_id is null
    or (row ->> 'shopping_servings')::integer <= 0
    or (row ->> 'planned_servings_total')::integer
      <> selected_recipe.planned_servings_total;

  if v_invalid_count > 0
    or jsonb_array_length(coalesce(p_recipe_rows, '[]'::jsonb))
      <> v_owned_meal_count
    or (
      select count(distinct (row ->> 'recipe_id')::uuid)
      from jsonb_array_elements(
        coalesce(p_recipe_rows, '[]'::jsonb)
      ) as row
    ) <> v_owned_meal_count
  then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '선택한 식사의 레시피만 장보기에 포함할 수 있어요.'
    );
  end if;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(
    coalesce(p_item_rows, '[]'::jsonb)
  ) as row
  where not (
      (
        nullif(row ->> 'ingredient_id', '') is not null
        and nullif(row ->> 'food_product_id', '') is null
        and nullif(
          row ->> 'food_product_nutrition_version_id',
          ''
        ) is null
        and exists (
          select 1
          from public.meals as meal
          where meal.id = any(p_shopping_meal_ids)
            and (
              (
                meal.recipe_content_snapshot_id is null
                and exists (
                  select 1
                  from public.recipe_ingredients as recipe_ingredient
                  where recipe_ingredient.recipe_id = meal.recipe_id
                    and recipe_ingredient.ingredient_id
                      = (row ->> 'ingredient_id')::uuid
                )
              )
              or (
                meal.recipe_content_snapshot_id is not null
                and exists (
                  select 1
                  from public.recipe_content_snapshots as snapshot
                  cross join jsonb_array_elements(
                    snapshot.ingredients_json
                  ) as snapshot_item
                  where snapshot.id = meal.recipe_content_snapshot_id
                    and nullif(
                      snapshot_item ->> 'ingredient_id',
                      ''
                    )::uuid = (row ->> 'ingredient_id')::uuid
                )
              )
            )
        )
      )
      or (
        nullif(row ->> 'ingredient_id', '') is null
        and nullif(row ->> 'food_product_id', '') is not null
        and nullif(
          row ->> 'food_product_nutrition_version_id',
          ''
        ) is not null
        and exists (
          select 1
          from public.meals as meal
          join public.recipe_content_snapshots as snapshot
            on snapshot.id = meal.recipe_content_snapshot_id
          cross join jsonb_array_elements(
            snapshot.ingredients_json
          ) as snapshot_item
          where meal.id = any(p_shopping_meal_ids)
            and nullif(
              snapshot_item ->> 'food_product_id',
              ''
            )::uuid = (row ->> 'food_product_id')::uuid
            and nullif(
              snapshot_item ->> 'food_product_nutrition_version_id',
              ''
            )::uuid
              = (row ->> 'food_product_nutrition_version_id')::uuid
        )
        and exists (
          select 1
          from public.food_products as product
          join public.food_product_nutrition_versions as version
            on version.product_id = product.id
           and version.id
             = (row ->> 'food_product_nutrition_version_id')::uuid
          where product.id = (row ->> 'food_product_id')::uuid
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
        )
      )
    )
    or nullif(btrim(row ->> 'display_text'), '') is null
    or jsonb_typeof(coalesce(row -> 'amounts_json', '[]'::jsonb))
      <> 'array'
    or coalesce((row ->> 'sort_order')::integer, 0) < 0;

  if v_invalid_count > 0 then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '선택한 식사에서 확인된 항목만 장보기에 포함할 수 있어요.'
    );
  end if;

  select count(*) - count(
    distinct case
      when nullif(row ->> 'ingredient_id', '') is not null
        then 'ingredient:' || (row ->> 'ingredient_id')
      else 'product:' || (row ->> 'food_product_id')
        || ':' || (row ->> 'food_product_nutrition_version_id')
    end
  )
  into v_invalid_count
  from jsonb_array_elements(
    coalesce(p_item_rows, '[]'::jsonb)
  ) as row;

  if v_invalid_count > 0 then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '중복된 장보기 항목이 있어요.'
    );
  end if;

  select count(*)
  into v_pantry_item_count
  from jsonb_array_elements(
    coalesce(p_item_rows, '[]'::jsonb)
  ) as row
  where exists (
    select 1
    from public.pantry_items as pantry
    where pantry.user_id = p_user_id
      and (
        (
          pantry.ingredient_id
            = nullif(row ->> 'ingredient_id', '')::uuid
          and pantry.food_product_id is null
          and pantry.food_product_nutrition_version_id is null
        )
        or (
          pantry.ingredient_id is null
          and pantry.food_product_id
            = nullif(row ->> 'food_product_id', '')::uuid
          and pantry.food_product_nutrition_version_id
            = nullif(
              row ->> 'food_product_nutrition_version_id',
              ''
            )::uuid
        )
      )
  );

  v_complete_without_list :=
    p_complete_without_list
    and jsonb_array_length(coalesce(p_item_rows, '[]'::jsonb)) > 0
    and v_pantry_item_count
      = jsonb_array_length(coalesce(p_item_rows, '[]'::jsonb));

  begin
    if not v_complete_without_list then
      insert into public.shopping_lists (
        user_id,
        title,
        date_range_start,
        date_range_end,
        is_completed
      ) values (
        p_user_id,
        p_title,
        v_date_range_start,
        v_date_range_end,
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
        selected_recipe.recipe_id,
        (recipe_row.row ->> 'shopping_servings')::integer,
        selected_recipe.planned_servings_total
      from jsonb_array_elements(
        coalesce(p_recipe_rows, '[]'::jsonb)
      ) as recipe_row(row)
      join (
        select
          meal.recipe_id,
          sum(
            coalesce(
              split_original.planned_servings,
              meal.planned_servings
            )
          )::integer as planned_servings_total
        from public.meals as meal
        left join lateral (
          select (row ->> 'planned_servings')::integer as planned_servings
          from jsonb_array_elements(
            coalesce(p_split_originals, '[]'::jsonb)
          ) as row
          where (row ->> 'meal_id')::uuid = meal.id
        ) as split_original on true
        where meal.id = any(p_shopping_meal_ids)
        group by meal.recipe_id
      ) as selected_recipe
        on selected_recipe.recipe_id
          = (recipe_row.row ->> 'recipe_id')::uuid;

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
        nullif(
          row ->> 'food_product_nutrition_version_id',
          ''
        )::uuid,
        row ->> 'display_text',
        coalesce(row -> 'amounts_json', '[]'::jsonb),
        exists (
          select 1
          from public.pantry_items as pantry
          where pantry.user_id = p_user_id
            and (
              (
                pantry.ingredient_id
                  = nullif(row ->> 'ingredient_id', '')::uuid
                and pantry.food_product_id is null
                and pantry.food_product_nutrition_version_id is null
              )
              or (
                pantry.ingredient_id is null
                and pantry.food_product_id
                  = nullif(row ->> 'food_product_id', '')::uuid
                and pantry.food_product_nutrition_version_id
                  = nullif(
                    row ->> 'food_product_nutrition_version_id',
                    ''
                  )::uuid
              )
            )
        ),
        false,
        false,
        coalesce((row ->> 'sort_order')::integer, 0)
      from jsonb_array_elements(
        coalesce(p_item_rows, '[]'::jsonb)
      ) as row;
    end if;

    for v_item, v_original in
      select remainder.value, original.value
      from jsonb_array_elements(
        coalesce(p_split_remainders, '[]'::jsonb)
      ) with ordinality as remainder(value, position)
      join jsonb_array_elements(
        coalesce(p_split_originals, '[]'::jsonb)
      ) with ordinality as original(value, position)
        using (position)
    loop
      select meal.*
      into strict v_source_meal
      from public.meals as meal
      where meal.id = (v_original ->> 'meal_id')::uuid
        and meal.user_id = p_user_id
        and meal.id = any(p_shopping_meal_ids);

      v_snapshot_clone_token := gen_random_uuid();
      insert into public.shopping_meal_snapshot_clone_tokens (
        token,
        source_meal_id,
        user_id,
        recipe_id,
        plan_date,
        column_id,
        planned_servings,
        is_leftover,
        leftover_dish_id,
        recipe_nutrition_snapshot_id,
        nutrition_snapshot_origin,
        recipe_content_snapshot_id,
        recipe_content_snapshot_origin
      ) values (
        v_snapshot_clone_token,
        v_source_meal.id,
        p_user_id,
        v_source_meal.recipe_id,
        v_source_meal.plan_date,
        v_source_meal.column_id,
        v_source_meal.planned_servings
          - (v_original ->> 'planned_servings')::integer,
        v_source_meal.is_leftover,
        v_source_meal.leftover_dish_id,
        v_source_meal.recipe_nutrition_snapshot_id,
        v_source_meal.nutrition_snapshot_origin,
        v_source_meal.recipe_content_snapshot_id,
        v_source_meal.recipe_content_snapshot_origin
      );
      perform set_config(
        'homecook.shopping_meal_snapshot_clone_token',
        v_snapshot_clone_token::text,
        true
      );

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
        cooked_at,
        recipe_nutrition_snapshot_id,
        nutrition_snapshot_origin,
        recipe_content_snapshot_id,
        recipe_content_snapshot_origin
      ) values (
        p_user_id,
        v_source_meal.recipe_id,
        v_source_meal.plan_date,
        v_source_meal.column_id,
        v_source_meal.planned_servings
          - (v_original ->> 'planned_servings')::integer,
        'registered',
        v_source_meal.is_leftover,
        v_source_meal.leftover_dish_id,
        null,
        null,
        v_source_meal.recipe_nutrition_snapshot_id,
        v_source_meal.nutrition_snapshot_origin,
        v_source_meal.recipe_content_snapshot_id,
        v_source_meal.recipe_content_snapshot_origin
      );

      update public.meals
      set planned_servings =
            (v_original ->> 'planned_servings')::integer,
          updated_at = v_now
      where id = v_source_meal.id
        and user_id = p_user_id
        and status = 'registered'
        and shopping_list_id is null;
    end loop;

    if v_complete_without_list then
      update public.meals
      set status = 'shopping_done', updated_at = v_now
      where id = any(p_shopping_meal_ids)
        and user_id = p_user_id
        and status = 'registered'
        and shopping_list_id is null;
      get diagnostics v_meals_updated = row_count;
    else
      update public.meals
      set shopping_list_id = v_list_id, updated_at = v_now
      where id = any(p_shopping_meal_ids)
        and user_id = p_user_id
        and status = 'registered'
        and shopping_list_id is null;
      get diagnostics v_meals_updated = row_count;
    end if;

    if v_meals_updated <> v_requested_meal_count then
      raise exception 'SHOPPING_CREATE_CONFLICT';
    end if;
  exception
    when raise_exception then
      if sqlerrm = 'SHOPPING_CREATE_CONFLICT' then
        return jsonb_build_object(
          'error_code', 'CONFLICT',
          'message', '이미 다른 장보기 리스트에 포함된 식사가 있어요.'
        );
      end if;
      raise;
  end;

  if v_complete_without_list then
    return jsonb_build_object(
      'id', null,
      'title', p_title,
      'date_range_start', v_date_range_start,
      'date_range_end', v_date_range_end,
      'is_completed', true,
      'completed_at', v_now,
      'completed_without_list', true,
      'meals_updated', v_meals_updated,
      'pantry_item_count', v_pantry_item_count,
      'created_at', v_now
    );
  end if;

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
