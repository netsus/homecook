-- Repair real production tag provenance and incomplete-shopping reconciliation.
-- Preserve the current session, idempotency, snapshot and completed-list guards.
begin;

do $repair_tag_provenance$
declare
  v_definition text := pg_get_functiondef('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure);
  v_old text := quote_literal('user_selected');
  v_new text := quote_literal('user_reviewed');
  v_count integer;
begin
  v_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_count = 2 then
    execute replace(v_definition, v_old, v_new);
  elsif v_count <> 0 or strpos(v_definition, v_new) = 0 then
    raise exception 'RECIPE_TAG_PROVENANCE_SOURCE_DRIFT';
  end if;
end;
$repair_tag_provenance$;

create or replace function private.reconcile_recipe_shopping_lists_from_date(
  p_owner_uuid uuid,
  p_recipe_id uuid,
  p_from_date date
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_list_id uuid;
begin
  -- Completed shopping is intentionally absent from this loop and therefore
  -- remains bit-for-bit immutable. Existing identity rows keep their checked
  -- and pantry-excluded state; only their derived amount projection changes.
  for v_list_id in
    select selected_list.id
    from (
      select distinct list.id
      from public.shopping_lists as list
      join public.meals as meal on meal.shopping_list_id = list.id
      where list.user_id = p_owner_uuid
        and not list.is_completed
        and meal.recipe_id = p_recipe_id
        and meal.plan_date >= p_from_date
        and (p_from_date = '-infinity'::date or meal.status <> 'cook_done')
    ) as selected_list
    order by selected_list.id::text collate "C"
  loop
    perform 1
    from public.shopping_lists as list
    where list.id = v_list_id and list.user_id = p_owner_uuid and not list.is_completed
    for update;
    if not found then continue; end if;
    if exists (select 1 from public.meals where shopping_list_id = v_list_id
      and recipe_content_snapshot_id is null) then
      raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
    end if;

    with required as (
      select
        v_list_id as shopping_list_id,
        nullif(ingredient ->> 'food_product_id', '')::uuid as food_product_id,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
          as food_product_nutrition_version_id,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end as ingredient_id,
        coalesce(min(nullif(ingredient ->> 'food_product_name', '')),
          min(nullif(ingredient ->> 'standard_name', '')), min(dictionary.standard_name),
          min(nullif(ingredient ->> 'display_text', ''))) as display_text,
        jsonb_agg(jsonb_build_object(
          'amount', case when coalesce((ingredient ->> 'scalable')::boolean, true)
            then (ingredient ->> 'amount')::numeric * meal.planned_servings / snapshot.base_servings
            else (ingredient ->> 'amount')::numeric end,
          'unit', ingredient ->> 'unit'
        ) order by meal.id::text collate "C") as amounts_json,
        min(coalesce((ingredient ->> 'sort_order')::integer, 0)) as sort_order
      from public.meals as meal
      join public.recipe_content_snapshots as snapshot
        on snapshot.id = meal.recipe_content_snapshot_id
      cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
      left join public.ingredients as dictionary
        on dictionary.id = (ingredient ->> 'ingredient_id')::uuid
      where meal.shopping_list_id = v_list_id
      group by
        nullif(ingredient ->> 'food_product_id', '')::uuid,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end
    )
    update public.shopping_list_items as item
    set display_text = required.display_text,
        amounts_json = required.amounts_json,
        sort_order = required.sort_order
    from required
    where item.shopping_list_id = v_list_id
      and item.ingredient_id is not distinct from required.ingredient_id
      and item.food_product_id is not distinct from required.food_product_id
      and item.food_product_nutrition_version_id
        is not distinct from required.food_product_nutrition_version_id;

    -- New requirements are created unchecked. Existing states are never
    -- overwritten by this INSERT path.
    insert into public.shopping_list_items (
      shopping_list_id, ingredient_id, food_product_id,
      food_product_nutrition_version_id, display_text, amounts_json,
      is_pantry_excluded, is_checked, added_to_pantry, sort_order
    )
    select required.shopping_list_id, required.ingredient_id,
           required.food_product_id, required.food_product_nutrition_version_id,
           required.display_text, required.amounts_json, false, false, false,
           required.sort_order
    from (
      select
        v_list_id as shopping_list_id,
        nullif(ingredient ->> 'food_product_id', '')::uuid as food_product_id,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
          as food_product_nutrition_version_id,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end as ingredient_id,
        coalesce(min(nullif(ingredient ->> 'food_product_name', '')),
          min(nullif(ingredient ->> 'standard_name', '')), min(dictionary.standard_name),
          min(nullif(ingredient ->> 'display_text', ''))) as display_text,
        jsonb_agg(jsonb_build_object(
          'amount', case when coalesce((ingredient ->> 'scalable')::boolean, true)
            then (ingredient ->> 'amount')::numeric * meal.planned_servings / snapshot.base_servings
            else (ingredient ->> 'amount')::numeric end,
          'unit', ingredient ->> 'unit'
        ) order by meal.id::text collate "C") as amounts_json,
        min(coalesce((ingredient ->> 'sort_order')::integer, 0)) as sort_order
      from public.meals as meal
      join public.recipe_content_snapshots as snapshot
        on snapshot.id = meal.recipe_content_snapshot_id
      cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
      left join public.ingredients as dictionary
        on dictionary.id = (ingredient ->> 'ingredient_id')::uuid
      where meal.shopping_list_id = v_list_id
      group by
        nullif(ingredient ->> 'food_product_id', '')::uuid,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end
    ) as required
    where not exists (
      select 1 from public.shopping_list_items as existing
      where existing.shopping_list_id = required.shopping_list_id
        and existing.ingredient_id is not distinct from required.ingredient_id
        and existing.food_product_id is not distinct from required.food_product_id
        and existing.food_product_nutrition_version_id
          is not distinct from required.food_product_nutrition_version_id
    );

    delete from public.shopping_list_items as item
    where item.shopping_list_id = v_list_id
      and not exists (
        select 1
        from public.meals as meal
        join public.recipe_content_snapshots as snapshot
          on snapshot.id = meal.recipe_content_snapshot_id
        cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
        where meal.shopping_list_id = v_list_id
          and item.ingredient_id is not distinct from case
            when nullif(ingredient ->> 'food_product_id', '') is null
              then (ingredient ->> 'ingredient_id')::uuid else null end
          and item.food_product_id is not distinct from
            nullif(ingredient ->> 'food_product_id', '')::uuid
          and item.food_product_nutrition_version_id is not distinct from
            nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
      );
  end loop;
end;
$function$;

revoke all on function private.reconcile_recipe_shopping_lists_from_date(uuid,uuid,date)
  from public, anon, authenticated, service_role;

-- Existing cancellation callers keep their original all-dates reconciliation.
create or replace function public.reconcile_incomplete_recipe_shopping_lists(p_owner_uuid uuid,p_recipe_id uuid)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform private.reconcile_recipe_shopping_lists_from_date(p_owner_uuid,p_recipe_id,'-infinity'::date);
end;
$function$;
revoke all on function public.reconcile_incomplete_recipe_shopping_lists(uuid,uuid)
  from public, anon, authenticated, service_role;

do $repair_future_reconciliation$
declare
  v_definition text := pg_get_functiondef('public.write_recipe_future_plan_change(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamptz)'::regprocedure);
  v_old text := E'perform public.reconcile_incomplete_recipe_shopping_lists(\n      p_owner_uuid, p_recipe_id\n    );';
  v_new text := E'perform private.reconcile_recipe_shopping_lists_from_date(\n      p_owner_uuid, p_recipe_id, p_now::date\n    );';
begin
  if strpos(v_definition, v_old) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif strpos(v_definition, v_new) = 0
    and strpos(v_definition, replace(v_new, 'p_now::date', '(p_now at time zone ''Asia/Seoul'')::date')) = 0 then
    raise exception 'RECIPE_FUTURE_RECONCILIATION_SOURCE_DRIFT';
  end if;
end;
$repair_future_reconciliation$;

-- Plan dates are Korean calendar dates, including the 00:00-09:00 UTC gap.
-- Use the same date for preview hashes, claim checks and the actual mutation.
do $align_plan_dates$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    'public.preview_recipe_future_plan_impact(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,timestamptz)'::regprocedure,
    'public.write_recipe_future_plan_change(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamptz)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    if strpos(v_definition, 'p_now::date') > 0 then
      execute replace(v_definition, 'p_now::date', '(p_now at time zone ''Asia/Seoul'')::date');
    elsif strpos(v_definition, 'p_now at time zone ''Asia/Seoul''') = 0 then
      raise exception 'RECIPE_FUTURE_PLAN_DATE_SOURCE_DRIFT';
    end if;
  end loop;
end;
$align_plan_dates$;

notify pgrst, 'reload schema';
commit;
