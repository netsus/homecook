begin;

-- Use only a product's pinned label and reviewed public provenance. A missing or
-- revoked predecessor stays unavailable; representative ingredient data is not
-- a substitute for the label. No historical snapshot is rewritten.
create function private.recipe_product_nutrition_predecessor(
  p_product_id uuid, p_version_id uuid, p_ingredient_id uuid
) returns jsonb language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'nutrition', jsonb_build_object(
      'link', jsonb_build_object(
        'id', link.id, 'review_status', link.review_status,
        'is_active', link.is_active, 'is_primary', link.is_primary,
        'preparation_state', 'product_label'
      ),
      'profile', jsonb_build_object(
        'id', profile.id, 'basis_amount', profile.basis_amount,
        'basis_unit', profile.basis_unit, 'review_status', profile.review_status,
        'is_active', profile.is_active,
        'values', coalesce((
          select jsonb_object_agg(value.nutrient_code, jsonb_build_object(
            'amount', value.amount, 'value_status', value.value_status
          )) from public.nutrition_values value
          where value.profile_id = profile.id
            and value.nutrient_code in ('energy_kcal', 'carbohydrate_g', 'protein_g',
              'fat_g', 'sodium_mg', 'sugars_g', 'saturated_fat_g', 'fiber_g')
        ), '{}'::jsonb)
      ),
      'source', jsonb_build_object(
        'id', source.id, 'review_status', source.review_status,
        'freshness_status', source.freshness_status, 'is_active', source.is_active,
        'provider', source.provider_code, 'dataset', source.dataset_name,
        'source_version', source.source_version, 'data_basis_date', source.data_basis_date,
        'license', source.license_name, 'source_url', source.source_url
      )
    ),
    'basis_relations', version.basis_relations_json
  )
  from public.food_product_nutrition_versions version
  join public.food_products product on product.id = version.product_id
    and product.deleted_at is null and product.moderation_status = 'visible'
  join public.food_product_ingredient_links link on link.product_id = product.id
    and link.ingredient_id = p_ingredient_id and link.relation = 'represents'
    and link.review_status = 'approved' and link.is_primary and link.is_active
  join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
    and profile.profile_kind = 'product_label' and profile.normalization_method = 'as_labeled'
    and profile.review_status = 'approved'
    and profile.basis_amount > 0 and profile.basis_unit in ('g', 'ml', 'serving', 'package')
  join public.nutrition_source_items item on item.id = version.source_item_id
    and item.review_status = 'approved'
  join public.nutrition_sources source on source.id = item.source_id
    and source.review_status = 'approved' and source.freshness_status = 'current'
    and source.is_active
  where version.id = p_version_id and version.product_id = p_product_id;
$function$;

create function public.read_recipe_product_nutrition_predecessors(
  p_owner_uuid uuid, p_ingredients jsonb
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_pin jsonb;
  v_result jsonb := '[]'::jsonb;
  v_product public.food_products%rowtype;
  v_predecessor jsonb;
begin
  if auth.role() = 'authenticated' then
    if p_owner_uuid is distinct from auth.uid() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  elsif auth.role() is distinct from 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
    or jsonb_array_length(p_ingredients) > 200 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  for v_pin in select value from jsonb_array_elements(p_ingredients) loop
    select * into v_product from public.food_products
    where id = (v_pin ->> 'food_product_id')::uuid;
    if v_product.id is not null and v_product.visibility = 'private'
      and v_product.owner_user_id is distinct from p_owner_uuid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_predecessor := private.recipe_product_nutrition_predecessor(
      (v_pin ->> 'food_product_id')::uuid,
      (v_pin ->> 'food_product_nutrition_version_id')::uuid,
      (v_pin ->> 'ingredient_id')::uuid
    );
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_pin -> 'id', 'product_predecessor', v_predecessor
    ));
  end loop;
  return v_result;
end;
$function$;

-- Preserve the existing generic predecessor guard byte-for-byte, and include
-- the exact immutable product version/profile/relations for product rows only.
do $migration$
begin
  execute replace(pg_get_functiondef('public.build_recipe_nutrition_input_guard(uuid)'::regprocedure),
    'FUNCTION public.build_recipe_nutrition_input_guard(',
    'FUNCTION private.build_recipe_nutrition_input_guard_pre_product_20260922(');
  execute replace(pg_get_functiondef('public.build_recipe_draft_nutrition_predecessor_guard(jsonb)'::regprocedure),
    'FUNCTION public.build_recipe_draft_nutrition_predecessor_guard(',
    'FUNCTION private.build_recipe_draft_nutrition_guard_pre_product_20260922(');
  execute replace(pg_get_functiondef('public.build_recipe_nutrition_contributing_sources(jsonb)'::regprocedure),
    'FUNCTION public.build_recipe_nutrition_contributing_sources(',
    'FUNCTION private.recipe_nutrition_sources_pre_product_20260922(');
end;
$migration$;

create or replace function public.build_recipe_nutrition_input_guard(p_recipe_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object('recipe_ingredients', coalesce(jsonb_agg(
    row.value || case when ingredient.food_product_id is null then '{}'::jsonb
      else jsonb_build_object(
        'food_product_id', ingredient.food_product_id,
        'food_product_nutrition_version_id', ingredient.food_product_nutrition_version_id,
        'product_predecessor', private.recipe_product_nutrition_predecessor(
          ingredient.food_product_id, ingredient.food_product_nutrition_version_id,
          ingredient.ingredient_id
        )
      ) end order by row.ordinality
  ), '[]'::jsonb))
  from jsonb_array_elements(
    private.build_recipe_nutrition_input_guard_pre_product_20260922(p_recipe_id) -> 'recipe_ingredients'
  ) with ordinality as row(value, ordinality)
  join public.recipe_ingredients ingredient on ingredient.id = (row.value ->> 'id')::uuid;
$function$;

create or replace function public.build_recipe_draft_nutrition_predecessor_guard(p_draft jsonb)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object('recipe_ingredients', coalesce(jsonb_agg(
    row.value || case when nullif(row.value ->> 'food_product_id', '') is null then '{}'::jsonb
      else jsonb_build_object('product_predecessor', private.recipe_product_nutrition_predecessor(
        (row.value ->> 'food_product_id')::uuid,
        (row.value ->> 'food_product_nutrition_version_id')::uuid,
        (row.value ->> 'ingredient_id')::uuid
      )) end order by row.ordinality
  ), '[]'::jsonb))
  from jsonb_array_elements(
    private.build_recipe_draft_nutrition_guard_pre_product_20260922(p_draft) -> 'recipe_ingredients'
  ) with ordinality as row(value, ordinality);
$function$;


-- The snapshot writer checks contributing sources independently of the input
-- guard. Keep that check strict and derive product contributions from its own
-- version's approved basis relations, with no generic density fallback.
create or replace function public.build_recipe_nutrition_contributing_sources(p_input_guard jsonb)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_sources jsonb;
  v_row jsonb;
  v_nutrition jsonb;
  v_unit text;
  v_amount numeric;
  v_scale numeric;
begin
  v_sources := private.recipe_nutrition_sources_pre_product_20260922(
    jsonb_build_object('recipe_ingredients', coalesce((
      select jsonb_agg(value) from jsonb_array_elements(p_input_guard -> 'recipe_ingredients')
      where nullif(value ->> 'food_product_id', '') is null
    ), '[]'::jsonb))
  );
  for v_row in select value from jsonb_array_elements(p_input_guard -> 'recipe_ingredients')
    where nullif(value ->> 'food_product_id', '') is not null loop
    v_nutrition := v_row -> 'product_predecessor' -> 'nutrition';
    if v_nutrition is null or v_nutrition = 'null'::jsonb then continue; end if;
    if v_row ->> 'ingredient_type' = 'TO_TASTE' then
      if not exists (select 1 from jsonb_each(v_nutrition -> 'profile' -> 'values')
        where value ->> 'value_status' = 'observed' and (value ->> 'amount')::numeric = 0) then
        continue;
      end if;
    else
      v_amount := (v_row ->> 'amount')::numeric;
      if v_amount is null or v_amount <= 0 then continue; end if;
      v_unit := case v_row ->> 'unit' when 'T' then 'tbsp' when 't' then 'tsp'
        else public.normalize_recipe_nutrition_unit(v_row ->> 'unit') end;
      if v_unit = 'kg' then v_amount := v_amount * 1000; v_unit := 'g';
      elsif v_unit = 'l' then v_amount := v_amount * 1000; v_unit := 'ml';
      elsif v_unit = 'tbsp' then v_amount := v_amount * 15; v_unit := 'ml';
      elsif v_unit = 'tsp' then v_amount := v_amount * 5; v_unit := 'ml';
      elsif v_unit = 'cup' then v_amount := v_amount * 200; v_unit := 'ml'; end if;
      if v_unit not in ('g','ml','serving','package') then continue; end if;
      begin
        v_scale := public.product_planner_quantity_scale(
          (v_row ->> 'food_product_nutrition_version_id')::uuid, v_amount, v_unit
        );
      exception when raise_exception then
        if sqlerrm not in ('NUTRITION_BASIS_MISMATCH', 'VALIDATION_ERROR') then raise; end if;
        continue;
      end;
      if v_scale is null or not exists (select 1 from jsonb_each(v_nutrition -> 'profile' -> 'values')
        where value ->> 'value_status' = 'observed' and (value ->> 'amount')::numeric >= 0) then
        continue;
      end if;
    end if;
    v_sources := v_sources || jsonb_build_array(
      (v_nutrition -> 'source') - array['id','review_status','freshness_status','is_active']
    );
  end loop;
  return coalesce((select jsonb_agg(source order by
    source ->> 'provider' collate "C" asc nulls first,
    source ->> 'dataset' collate "C" asc nulls first,
    source ->> 'source_version' collate "C" asc nulls first,
    source ->> 'data_basis_date' collate "C" asc nulls first,
    source ->> 'license' collate "C" asc nulls first,
    source ->> 'source_url' collate "C" asc nulls first)
    from (select distinct value as source from jsonb_array_elements(v_sources)) canonical), '[]'::jsonb);
end;
$function$;

alter function private.verify_full_local_internal_scope()
  rename to verify_full_local_internal_scope_pre_product_nutrition_20260922;
create function private.verify_full_local_internal_scope()
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if v_headers ->> 'x-homecook-internal-scope' = 'recipe-future-propagation'
    and (
      (upper(coalesce(current_setting('request.method', true), '')) = 'POST'
        and current_setting('request.path', true) = '/rpc/read_recipe_product_nutrition_predecessors')
      or (upper(coalesce(current_setting('request.method', true), '')) = 'GET'
        and current_setting('request.path', true) = '/piece_unit_weights')
    ) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_product_nutrition_20260922();
end;
$function$;

alter function private.recipe_nutrition_sources_pre_product_20260922(jsonb) owner to postgres;
revoke all on function private.recipe_nutrition_sources_pre_product_20260922(jsonb) from public,anon,authenticated,service_role;
alter function private.recipe_product_nutrition_predecessor(uuid,uuid,uuid) owner to postgres;
alter function public.read_recipe_product_nutrition_predecessors(uuid,jsonb) owner to postgres;
alter function private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid) owner to postgres;
alter function private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.recipe_product_nutrition_predecessor(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid) from public,anon,authenticated,service_role;
revoke all on function private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_internal_scope_pre_product_nutrition_20260922() from public,anon,authenticated,service_role;
revoke all on function public.read_recipe_product_nutrition_predecessors(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_recipe_product_nutrition_predecessors(uuid,jsonb) to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
