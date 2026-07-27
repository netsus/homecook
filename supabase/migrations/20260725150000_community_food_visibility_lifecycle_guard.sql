begin;

do $guard_prerequisite$
begin
  if to_regprocedure(
    'recipe_visibility_guard.is_owner_publicly_visible(uuid)'
  ) is null then
    raise exception 'RECIPE_VISIBILITY_OWNER_GUARD_MISSING';
  end if;
end
$guard_prerequisite$;

drop policy if exists food_products_select_visible on public.food_products;
create policy food_products_select_visible on public.food_products
for select to authenticated
using (
  deleted_at is null
  and moderation_status = 'visible'
  and recipe_visibility_guard.is_owner_publicly_visible(owner_user_id)
  and (
    visibility = 'public'
    or (visibility = 'private' and owner_user_id = auth.uid())
  )
);

drop policy if exists food_product_versions_select_visible
  on public.food_product_nutrition_versions;
create policy food_product_versions_select_visible
on public.food_product_nutrition_versions
for select to authenticated
using (exists (
  select 1
  from public.food_products product
  where product.id = product_id
    and product.deleted_at is null
    and product.moderation_status = 'visible'
    and recipe_visibility_guard.is_owner_publicly_visible(
      product.owner_user_id
    )
    and (
      product.visibility = 'public'
      or (
        product.visibility = 'private'
        and product.owner_user_id = auth.uid()
      )
    )
));

drop policy if exists food_product_reports_insert_own
  on public.food_product_reports;
create policy food_product_reports_insert_own
on public.food_product_reports
for insert to authenticated
with check (
  reporter_user_id = auth.uid()
  and report_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.food_products product
    where product.id = product_id
      and product.visibility = 'public'
      and product.source_type = 'manual'
      and product.moderation_status = 'visible'
      and product.deleted_at is null
      and recipe_visibility_guard.is_owner_publicly_visible(
        product.owner_user_id
      )
      and product.owner_user_id is distinct from auth.uid()
  )
);

do $patch_report_function$
declare
  v_definition text;
  v_needle text := 'or v_product.deleted_at is not null';
  v_replacement text :=
    E'or v_product.deleted_at is not null\n'
    || E'    or not recipe_visibility_guard.is_owner_publicly_visible(\n'
    || E'      v_product.owner_user_id\n'
    || E'    )';
begin
  select pg_get_functiondef(
    'public.report_food_product(uuid,uuid,text,text)'::regprocedure
  )
  into v_definition;

  if (
    length(v_definition)
      - length(replace(
        v_definition,
        'recipe_visibility_guard.is_owner_publicly_visible',
        ''
      ))
  ) / length('recipe_visibility_guard.is_owner_publicly_visible') = 0 then
    if (
      length(v_definition) - length(replace(v_definition, v_needle, ''))
    ) / length(v_needle) <> 1 then
      raise exception 'REPORT_FOOD_PRODUCT_PATCH_ANCHOR_MISMATCH';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  elsif (
    length(v_definition)
      - length(replace(
        v_definition,
        'recipe_visibility_guard.is_owner_publicly_visible',
        ''
      ))
  ) / length('recipe_visibility_guard.is_owner_publicly_visible') <> 1 then
    raise exception 'REPORT_FOOD_PRODUCT_GUARD_COUNT_MISMATCH';
  end if;
end
$patch_report_function$;

do $patch_list_function$
declare
  v_definition text;
  v_needle text := 'product.deleted_at is null';
  v_replacement text :=
    E'product.deleted_at is null\n'
    || E'      and recipe_visibility_guard.is_owner_publicly_visible(\n'
    || E'        product.owner_user_id\n'
    || E'      )';
  v_guard_count integer;
begin
  select pg_get_functiondef(
    'public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'
      ::regprocedure
  )
  into v_definition;
  v_guard_count := (
    length(v_definition)
      - length(replace(
        v_definition,
        'recipe_visibility_guard.is_owner_publicly_visible',
        ''
      ))
  ) / length('recipe_visibility_guard.is_owner_publicly_visible');

  if v_guard_count = 0 then
    if (
      length(v_definition) - length(replace(v_definition, v_needle, ''))
    ) / length(v_needle) <> 4 then
      raise exception 'LIST_FOOD_PRODUCTS_PATCH_ANCHOR_MISMATCH';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  elsif v_guard_count <> 4 then
    raise exception 'LIST_FOOD_PRODUCTS_GUARD_COUNT_MISMATCH';
  end if;
end
$patch_list_function$;

do $patch_ranked_search_function$
declare
  v_definition text;
  v_needle text := 'product.deleted_at is null';
  v_replacement text :=
    E'product.deleted_at is null\n'
    || E'      and recipe_visibility_guard.is_owner_publicly_visible(\n'
    || E'        product.owner_user_id\n'
    || E'      )';
  v_guard_count integer;
begin
  select pg_get_functiondef(
    'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'
      ::regprocedure
  )
  into v_definition;
  v_guard_count := (
    length(v_definition)
      - length(replace(
        v_definition,
        'recipe_visibility_guard.is_owner_publicly_visible',
        ''
      ))
  ) / length('recipe_visibility_guard.is_owner_publicly_visible');

  if v_guard_count = 0 then
    if (
      length(v_definition) - length(replace(v_definition, v_needle, ''))
    ) / length(v_needle) <> 3 then
      raise exception 'RANKED_SEARCH_PATCH_ANCHOR_MISMATCH';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  elsif v_guard_count <> 3 then
    raise exception 'RANKED_SEARCH_GUARD_COUNT_MISMATCH';
  end if;
end
$patch_ranked_search_function$;

commit;
