begin;

-- Only these three existing public functions change. No grants or pinned private helper changes.
-- The canonical branch reuses the exact current pre-product evidence SELECT,
-- substituting current saved projection rows; it never fabricates recipe steps.
do $preimages$
begin
  if (select md5(prosrc) from pg_proc where oid='public.build_recipe_nutrition_input_guard(uuid)'::regprocedure) is distinct from '41f07c2cf30e0eeb7b0af8b24925a530' then raise exception 'SAVED_NUTRITION_PREIMAGE_DRIFT: public.build_recipe_nutrition_input_guard' using errcode='55000';end if;
  if (select md5(prosrc) from pg_proc where oid='public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)'::regprocedure) is distinct from '2fa6e78e191600ac58c2852626f72322' then raise exception 'SAVED_NUTRITION_PREIMAGE_DRIFT: public.write_recipe_nutrition_snapshot' using errcode='55000';end if;
  if (select md5(prosrc) from pg_proc where oid='public.start_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamptz)'::regprocedure) is distinct from '6b576d455b8812917ce19d77de0622d0' then raise exception 'SAVED_NUTRITION_PREIMAGE_DRIFT: public.start_snapshot_v2_cooking_session' using errcode='55000';end if;
  if (select md5(prosrc) from pg_proc where oid='private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)'::regprocedure) is distinct from 'dcf289f354fba431d8be1bf324ae7b19' then raise exception 'SAVED_NUTRITION_PREIMAGE_DRIFT: private.build_recipe_nutrition_input_guard_pre_product_20260922' using errcode='55000';end if;
end;
$preimages$;

create or replace function public.build_recipe_nutrition_input_guard(p_recipe_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_saved public.youtube_saved_recipe_results%rowtype;v_input record;v_guard jsonb;v_rows jsonb:='[]';
 v_item jsonb;v_index bigint;v_explicit boolean;v_safe boolean;v_raw jsonb;v_factor numeric;v_to numeric;v_normal numeric;
begin
 select * into v_saved from public.youtube_saved_recipe_results where canonical_recipe_id=p_recipe_id;
 if v_saved.id is null then
   return ((select jsonb_build_object('recipe_ingredients', coalesce(jsonb_agg(
    row.value || case when ingredient.food_product_id is null then '{}'::jsonb
      else jsonb_build_object(
        'food_product_id', ingredient.food_product_id,
        'food_product_nutrition_version_id', ingredient.food_product_nutrition_version_id,
        'product_predecessor', private.recipe_product_nutrition_predecessor(
          ingredient.food_product_id, ingredient.food_product_nutrition_version_id,
          ingredient.ingredient_id
        )
      ) end||case when exists(select 1 from public.recipe_ingredients current_row
        where current_row.recipe_id=p_recipe_id and current_row.quantity_input is not null)
        then jsonb_build_object('recipe_quantity_context_sha256',private.recipe_quantity_context_hash_v4(
          ingredient.ingredient_id,ingredient.food_product_id,ingredient.food_product_nutrition_version_id))
        else '{}'::jsonb end order by row.ordinality
  ), '[]'::jsonb))
  from jsonb_array_elements(
    private.build_recipe_nutrition_input_guard_pre_product_20260922(p_recipe_id) -> 'recipe_ingredients'
  ) with ordinality as row(value, ordinality)
  join public.recipe_ingredients ingredient on ingredient.id = (row.value ->> 'id')::uuid)
    ||private.recipe_quantity_mode_metadata_v4(p_recipe_id));
 end if;
 select * into strict v_input from public.build_recipe_content_snapshot_input(p_recipe_id);
 v_explicit:=exists(select 1 from jsonb_array_elements(v_input.ingredients_json) item where item ? 'quantity_input');
 for v_item,v_index in select item,ordinality from jsonb_array_elements(v_input.ingredients_json) with ordinality rows(item,ordinality) loop
   v_safe:=not v_explicit;
   if v_explicit then
     v_safe:=v_item->>'unit' in ('g','kg','ml','mL','l','L');
     if v_item ? 'quantity_input' then
       v_safe:=coalesce(v_safe and v_item#>>'{quantity_input,quality}'='direct'
         and v_item#>'{quantity_input,reason}'='null'::jsonb and v_item#>'{quantity_input,batch_basis}'='null'::jsonb
         and ((v_item#>>'{quantity_input,raw_unit}' in ('g','kg') and v_item->>'unit' in ('g','kg') and v_item#>>'{quantity_input,normalized,unit}'='g')
           or (v_item#>>'{quantity_input,raw_unit}' in ('ml','mL','l','L') and v_item->>'unit' in ('ml','mL','l','L') and v_item#>>'{quantity_input,normalized,unit}'='ml')),false);
       if v_safe then
         v_raw:=private.parse_quantity_input_v4(jsonb_build_object('schema_version','quantity-v4',
           'raw_value',v_item#>>'{quantity_input,raw_value}','raw_unit',v_item#>>'{quantity_input,raw_unit}'),(v_item->>'amount')::numeric,v_item->>'unit');
         v_factor:=case when v_raw->>'raw_unit' in ('kg','l','L') then 1000 else 1 end;
         v_to:=case when v_item->>'unit' in ('kg','l','L') then 1000 else 1 end;
         v_normal:=(v_raw->>'amount')::numeric*v_factor;
         v_safe:=abs(v_normal-(v_item->>'amount')::numeric*v_to)<=greatest(1,abs(v_normal))*0.000000000001
           and abs(v_normal-(v_item#>>'{quantity_input,normalized,amount}')::numeric)<=greatest(1,abs(v_normal))*0.000000000001;
       end if;
     end if;
   end if;
   -- Numeric is transported through JS Number, while the content hash below
   -- still commits to the exact frozen original numeric and complete metadata.
   v_item:=v_item||jsonb_build_object('id',v_saved.editable_content_json#>array['ingredients',(v_index-1)::text,'row_id'],
     'amount',case when coalesce(v_safe,false) then to_jsonb((v_item->>'amount')::double precision) else 'null'::jsonb end);
   v_rows:=v_rows||jsonb_build_array(v_item);
 end loop;

  select jsonb_build_object(
    'recipe_ingredients',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ingredient.id,
          'ingredient_id', ingredient.ingredient_id,
          'amount', ingredient.amount,
          'unit', ingredient.unit,
          'ingredient_type', ingredient.ingredient_type,
          'scalable', ingredient.scalable,
          'sort_order', ingredient.sort_order,
          'nutrition_candidates', nutrition.candidates,
          'conversion_candidates', conversion.candidates,
          'piece_candidates', piece_candidates.candidates,
          'selected_piece_weight_id', piece_selected.candidate ->> 'piece_weight_id',
          'selected_nutrition_link_id', selected.link_id,
          'selected_conversion_assignment_id',
            case
              when (
                selected.basis_unit = 'g' and selected.is_volume_input
                or selected.basis_unit = 'ml' and selected.is_mass_input
              )
                and conversion.candidate_count = 1
              then conversion.single_assignment_id
              else null
            end
        ) order by ingredient.id::text collate "C"
      ),
      '[]'::jsonb
    )
  )
  into v_guard
  from jsonb_to_recordset(v_rows) as ingredient(id uuid,ingredient_id uuid,amount numeric,unit text,
    ingredient_type text,scalable boolean,sort_order integer)
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'link_id', link.id,
            'profile_id', profile.id,
            'source_item_id', source_item.id,
            'source_id', source.id,
            'preparation_state', link.preparation_state,
            'normalization_method', profile.normalization_method,
            'basis_amount', profile.basis_amount,
            'basis_unit', profile.basis_unit,
            'nutrition_values', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'nutrient_code', value.nutrient_code,
                    'amount', value.amount,
                    'value_status', value.value_status
                  ) order by value.nutrient_code collate "C"
                ),
                '[]'::jsonb
              )
              from public.nutrition_values value
              where value.profile_id = profile.id
            ),
            'source', jsonb_build_object(
              'provider', source.provider_code,
              'dataset', source.dataset_name,
              'source_version', source.source_version,
              'data_basis_date', source.data_basis_date,
              'license', source.license_name,
              'source_url', source.source_url
            )
          ) order by link.id::text collate "C"
        ),
        '[]'::jsonb
      ) as candidates,
      count(*) filter (where profile.basis_unit = 'g') as mass_count,
      count(*) filter (where profile.basis_unit = 'ml') as volume_count,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'g'))[1] as single_mass_link_id,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'ml'))[1] as single_volume_link_id
    from public.ingredient_nutrition_profiles link
    join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
    join public.nutrition_source_items source_item on source_item.id = profile.source_item_id
    join public.nutrition_sources source on source.id = source_item.source_id
    where link.ingredient_id = ingredient.ingredient_id
      and link.review_status = 'approved'
      and link.is_active
      and link.is_primary
      and profile.profile_kind = 'ingredient_source'
      and profile.normalization_method in ('mass_100g', 'volume_100ml')
      and profile.review_status = 'approved'
      and profile.is_active
      and profile.basis_amount = 100
      and (
        (profile.normalization_method = 'mass_100g' and profile.basis_unit = 'g')
        or (profile.normalization_method = 'volume_100ml' and profile.basis_unit = 'ml')
      )
      and source_item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
      and not exists (
        select 1
        from public.nutrition_values value
        where value.profile_id = profile.id
          and value.nutrient_code <> all(array[
            'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg',
            'sugars_g', 'saturated_fat_g', 'fiber_g'
          ])
      )
  ) nutrition on true
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'assignment_id', assignment.id,
            'profile_id', profile.id,
            'evidence_id', evidence.id,
            'source_id', source.id,
            'preparation_state', assignment.preparation_state,
            'profile_code', profile.code,
            'basis_volume_ml', profile.basis_volume_ml,
            'representative_weight_g', profile.representative_weight_g,
            'normalized_g_per_15ml', evidence.normalized_g_per_15ml,
            'evidence_preparation_state', evidence.preparation_state,
            'source', jsonb_build_object(
              'provider', source.provider_code,
              'dataset', source.dataset_name,
              'source_version', source.source_version,
              'data_basis_date', source.data_basis_date,
              'license', source.license_name,
              'source_url', source.source_url
            )
          ) order by assignment.id::text collate "C"
        ),
        '[]'::jsonb
      ) as candidates,
      count(*) as candidate_count,
      (array_agg(assignment.id order by assignment.id::text collate "C"))[1]
        as single_assignment_id
    from public.ingredient_conversion_assignments assignment
    join public.measurement_conversion_profiles profile
      on profile.id = assignment.conversion_profile_id
    join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
    join public.nutrition_sources source on source.id = evidence.source_id
    where assignment.ingredient_id = ingredient.ingredient_id
      and assignment.review_status = 'approved'
      and assignment.is_active
      and profile.is_active
      and profile.basis_volume_ml = 15
      and (
        (profile.code = 'VOLUME_G6' and profile.representative_weight_g = 6)
        or (profile.code = 'VOLUME_G10' and profile.representative_weight_g = 10)
        or (profile.code = 'VOLUME_G15' and profile.representative_weight_g = 15)
        or (profile.code = 'VOLUME_G20' and profile.representative_weight_g = 20)
        or (profile.code = 'VOLUME_G25' and profile.representative_weight_g = 25)
      )
      and evidence.evidence_kind = 'volume_weight'
      and evidence.normalized_g_per_15ml > 0
      and evidence.preparation_state = assignment.preparation_state
      and evidence.review_status = 'approved'
      and evidence.is_active
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ) conversion on true
  cross join lateral (
    select
      count(*) filter (where candidate ->> 'basis_unit' = 'g') as mass_count,
      count(*) filter (where candidate ->> 'basis_unit' = 'ml') as volume_count,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'g'))[1] as single_mass_link_id,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'ml'))[1] as single_volume_link_id
    from jsonb_array_elements(nutrition.candidates) candidate
    where candidate #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      or not exists (
        select 1 from jsonb_array_elements(nutrition.candidates) official
        where official #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      )
  ) preferred
  cross join lateral (
    select
      unit_flags.is_volume_input,
      unit_flags.is_mass_input,
      case
        when unit_flags.is_volume_input and preferred.volume_count = 1
          then preferred.single_volume_link_id
        when unit_flags.is_volume_input
          and preferred.volume_count = 0
          and preferred.mass_count = 1
          then preferred.single_mass_link_id
        when not unit_flags.is_volume_input and preferred.mass_count = 1
          then preferred.single_mass_link_id
        when unit_flags.is_mass_input
          and preferred.mass_count = 0
          and preferred.volume_count = 1
          then preferred.single_volume_link_id
        else null
      end as link_id,
      case
        when unit_flags.is_volume_input and preferred.volume_count = 1 then 'ml'
        when unit_flags.is_volume_input
          and preferred.volume_count = 0
          and preferred.mass_count = 1
          then 'g'
        when not unit_flags.is_volume_input and preferred.mass_count = 1 then 'g'
        when unit_flags.is_mass_input
          and preferred.mass_count = 0
          and preferred.volume_count = 1
          then 'ml'
        else null
      end as basis_unit
    from (
      select
        public.normalize_recipe_nutrition_unit(ingredient.unit)
          in ('ml', 'l', 'tbsp', 'tsp', 'cup') as is_volume_input,
        public.normalize_recipe_nutrition_unit(ingredient.unit)
          in ('g', 'kg') as is_mass_input
    ) unit_flags
  ) selected
  cross join lateral (select private.ingredient_piece_candidates(ingredient.ingredient_id) as candidates) piece_candidates
  cross join lateral (
    select private.select_ingredient_piece_candidate(piece_candidates.candidates,ingredient.unit,
      (select candidate->>'preparation_state' from jsonb_array_elements(nutrition.candidates) candidate
       where candidate->>'link_id'=selected.link_id::text)) as candidate
  ) piece_selected
;

 if v_explicit then v_guard:=private.recipe_quantity_guard_v4(v_guard,p_recipe_id);end if;
 return v_guard||jsonb_build_object('canonical_saved_recipe',jsonb_build_object('revision',v_saved.revision,'content_hash',v_input.content_hash));
end;
$function$;

create or replace function public.write_recipe_nutrition_snapshot(p_recipe_id uuid,p_snapshot jsonb,p_expected_recipe_updated_at timestamptz,p_input_guard jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare
  v_snapshot_id uuid;
  v_deterministic_snapshot_id uuid;
  v_snapshot_hex text;
  v_created boolean := false;
  v_existing public.recipe_nutrition_snapshots%rowtype;
  v_recipe_updated_at timestamptz;
  v_recipe_base_servings numeric;
  v_ingredient_ids uuid[];
  v_actual_input_guard jsonb;
  v_actual_sources jsonb;
begin
  perform public.lock_recipe_nutrition_recipe_ids(array[p_recipe_id]);
  select updated_at, base_servings into v_recipe_updated_at, v_recipe_base_servings
  from public.recipes
  where id = p_recipe_id
  for share;
  if v_recipe_updated_at is null then
    raise exception 'RECIPE_NOT_FOUND';
  end if;
  if v_recipe_updated_at is distinct from p_expected_recipe_updated_at then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE';
  end if;

  select array_agg(ingredient_id order by ingredient_id::text collate "C")
    into v_ingredient_ids
    from (
      select distinct ingredient_id
      from public.recipe_ingredients
      where recipe_id = p_recipe_id
      union
      select (item->>'ingredient_id')::uuid
      from public.build_recipe_content_snapshot_input(p_recipe_id) input,
        lateral jsonb_array_elements(input.ingredients_json) item
      where exists(select 1 from public.youtube_saved_recipe_results saved where saved.canonical_recipe_id=p_recipe_id)
    ) ingredients;
  perform public.lock_recipe_nutrition_ingredient_ids(v_ingredient_ids, true);

  if exists(select 1 from public.youtube_saved_recipe_results where canonical_recipe_id=p_recipe_id)
    and (auth.uid() is null or auth.uid() is distinct from (select created_by from public.recipes where id=p_recipe_id)) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
  perform public.validate_recipe_nutrition_snapshot_payload(p_snapshot);
  v_actual_input_guard := public.build_recipe_nutrition_input_guard(p_recipe_id);
  if p_snapshot->>'calculation_version' in ('recipe-nutrition-v4','recipe-nutrition-v5') then
    v_actual_input_guard:=private.recipe_quantity_guard_v4(v_actual_input_guard,p_recipe_id);
  end if;
  if v_actual_input_guard ? 'canonical_saved_recipe' and (
    p_snapshot->>'input_hash' is distinct from v_actual_input_guard#>>'{canonical_saved_recipe,content_hash}'
    or (case when v_actual_input_guard->>'quantity_policy_version'='quantity-v4' then 'recipe-nutrition-v4' else 'recipe-nutrition-v3' end)
       is distinct from p_snapshot->>'calculation_version') then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE' using errcode='40001';end if;
  if v_recipe_base_servings is distinct from (p_snapshot ->> 'base_servings')::numeric
    or v_actual_input_guard is distinct from p_input_guard
  then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE';
  end if;
  v_actual_sources := public.build_recipe_nutrition_contributing_sources(v_actual_input_guard);
  if v_actual_sources is distinct from p_snapshot -> 'sources' then
    raise exception 'SNAPSHOT_SOURCE_MISMATCH';
  end if;

  v_snapshot_hex := md5(
    p_recipe_id::text || chr(31) || (p_snapshot ->> 'input_hash') || chr(31) ||
    (p_snapshot ->> 'calculation_version')
  );
  v_deterministic_snapshot_id := (
    substr(v_snapshot_hex, 1, 8) || '-' || substr(v_snapshot_hex, 9, 4) || '-' ||
    substr(v_snapshot_hex, 13, 4) || '-' || substr(v_snapshot_hex, 17, 4) || '-' ||
    substr(v_snapshot_hex, 21, 12)
  )::uuid;
  perform set_config('homecook.recipe_nutrition_writer', 'on', true);

  insert into public.recipe_nutrition_snapshots (
    id, recipe_id, base_servings, input_hash, calculation_version,
    scalable_values_json, fixed_values_json, nutrient_status_json,
    calculation_status, calculation_quality, reflected_ingredient_count,
    target_ingredient_count, missing_reasons, warnings_json, sources_json,
    is_current, calculated_at
  ) values (
    v_deterministic_snapshot_id,
    p_recipe_id,
    (p_snapshot ->> 'base_servings')::numeric,
    p_snapshot ->> 'input_hash',
    p_snapshot ->> 'calculation_version',
    p_snapshot -> 'scalable_values',
    p_snapshot -> 'fixed_values',
    p_snapshot -> 'nutrient_status',
    p_snapshot ->> 'calculation_status',
    nullif(p_snapshot ->> 'calculation_quality', ''),
    (p_snapshot ->> 'reflected_ingredient_count')::integer,
    (p_snapshot ->> 'target_ingredient_count')::integer,
    array(select jsonb_array_elements_text(p_snapshot -> 'missing_reasons')),
    p_snapshot -> 'warnings',
    p_snapshot -> 'sources',
    false,
    (p_snapshot ->> 'calculated_at')::timestamptz
  )
  on conflict (recipe_id, input_hash, calculation_version) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select * into v_existing
    from public.recipe_nutrition_snapshots
    where recipe_id = p_recipe_id
      and input_hash = p_snapshot ->> 'input_hash'
      and calculation_version = p_snapshot ->> 'calculation_version'
    for update;
    if v_existing.id is null
      or v_existing.base_servings <> (p_snapshot ->> 'base_servings')::numeric
      or v_existing.scalable_values_json <> p_snapshot -> 'scalable_values'
      or v_existing.fixed_values_json <> p_snapshot -> 'fixed_values'
      or v_existing.nutrient_status_json <> p_snapshot -> 'nutrient_status'
      or v_existing.calculation_status <> p_snapshot ->> 'calculation_status'
      or v_existing.calculation_quality is distinct from nullif(p_snapshot ->> 'calculation_quality', '')
      or v_existing.reflected_ingredient_count <> (p_snapshot ->> 'reflected_ingredient_count')::integer
      or v_existing.target_ingredient_count <> (p_snapshot ->> 'target_ingredient_count')::integer
      or v_existing.missing_reasons <> array(select jsonb_array_elements_text(p_snapshot -> 'missing_reasons'))
      or v_existing.warnings_json <> p_snapshot -> 'warnings'
      or v_existing.sources_json <> p_snapshot -> 'sources'
    then
      raise exception 'SNAPSHOT_IDENTITY_COLLISION';
    end if;
    v_snapshot_id := v_existing.id;
  else
    v_created := true;
  end if;

  update public.recipe_nutrition_snapshots
    set is_current = false
    where recipe_id = p_recipe_id and is_current and id <> v_snapshot_id;
  update public.recipe_nutrition_snapshots
    set is_current = true
    where id = v_snapshot_id and not is_current;

  -- The canonical publication produces the matching immutable content pin in
  -- the same TX, so standalone cooking never picks an older content/nutrition.
  if v_actual_input_guard ? 'canonical_saved_recipe' then
    insert into public.recipe_content_snapshots(owner_user_id,recipe_id,recipe_nutrition_snapshot_id,
      title,base_servings,ingredients_json,steps_json,content_hash,schema_version)
    select input.owner_user_id,p_recipe_id,v_snapshot_id,input.title,input.base_servings,
      input.ingredients_json,input.steps_json,input.content_hash,1
    from public.build_recipe_content_snapshot_input(p_recipe_id) input
    on conflict(recipe_id,content_hash,recipe_nutrition_snapshot_id,schema_version) do nothing;
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'created', v_created,
    'is_current', true
  );
end;
$function$;

create or replace function public.start_snapshot_v2_cooking_session(p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamp with time zone, p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamp with time zone, p_idempotency_key uuid, p_mode text, p_meal_ids uuid[], p_expected_meal_revisions jsonb, p_recipe_id uuid, p_expected_recipe_revision bigint, p_cooking_servings numeric, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_authority jsonb;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_recipe public.recipes%rowtype;
  v_source_recipe public.recipes%rowtype;
  v_source_lifecycle public.user_account_lifecycles%rowtype;
  v_snapshot public.recipe_content_snapshots%rowtype;
  v_session_id uuid := extensions.gen_random_uuid();
  v_recipe_id uuid;
  v_content_snapshot_id uuid;
  v_cooking_servings integer;
  v_key_hash text;
  v_payload_hash text;
  v_result jsonb;
  v_meal record;
  v_owner_uuid uuid;
  v_resume public.cooking_sessions%rowtype;
begin
  if p_idempotency_key is null
    or p_mode not in ('planner', 'standalone')
    or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );

  if p_mode = 'planner' then
    if cardinality(coalesce(p_meal_ids, '{}'::uuid[])) = 0
      or cardinality(p_meal_ids) is distinct from (
        select count(distinct id) from unnest(p_meal_ids) as ids(id)
      )
      or jsonb_typeof(p_expected_meal_revisions) <> 'object'
      or (select count(*) from jsonb_object_keys(p_expected_meal_revisions))
        is distinct from cardinality(p_meal_ids)
      or p_recipe_id is not null
      or p_expected_recipe_revision is not null
      or p_cooking_servings is not null then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    select
           (array_agg(meal.recipe_id order by meal.recipe_id::text collate "C"))[1],
           (array_agg(meal.recipe_content_snapshot_id
             order by meal.recipe_content_snapshot_id::text collate "C"))[1],
           sum(meal.planned_servings)::integer
      into v_recipe_id, v_content_snapshot_id, v_cooking_servings
    from public.meals as meal
    where meal.id = any(p_meal_ids);
  else
    if p_recipe_id is null
      or p_expected_recipe_revision is null
      or p_cooking_servings is null
      or p_cooking_servings <= 0
      or trunc(p_cooking_servings) <> p_cooking_servings
      or cardinality(coalesce(p_meal_ids, '{}'::uuid[])) <> 0
      or coalesce(p_expected_meal_revisions, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    v_recipe_id := p_recipe_id;
    v_cooking_servings := p_cooking_servings::integer;
    select recipe.* into v_source_recipe
    from public.recipes as recipe
    where recipe.id = v_recipe_id;
  end if;

  v_key_hash := encode(extensions.digest(
    convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'mode', p_mode,
    'meal_ids', case when p_mode = 'planner' then to_jsonb(p_meal_ids) else null end,
    'expected_meal_revisions', case when p_mode = 'planner'
      then p_expected_meal_revisions else null end,
    'recipe_id', case when p_mode = 'standalone' then p_recipe_id else null end,
    'expected_recipe_revision', case when p_mode = 'standalone'
      then p_expected_recipe_revision else null end,
    'cooking_servings', case when p_mode = 'standalone'
      then p_cooking_servings else null end
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.mutation_idempotency_keys (
    owner_uuid, account_generation, operation_scope, key_hash, payload_hash,
    state, attempt_token, lease_expires_at, created_at, updated_at
  ) values (
    p_owner_uuid, (v_authority ->> 'account_generation')::bigint,
    'snapshot_v2_start', v_key_hash, v_payload_hash, 'in_progress',
    extensions.gen_random_uuid(), p_now + interval '5 minutes', p_now, p_now
  ) on conflict (owner_uuid, account_generation, operation_scope, key_hash)
  do nothing returning * into v_idempotency;
  if v_idempotency.id is null then
    select receipt.* into v_idempotency
    from public.mutation_idempotency_keys as receipt
    where receipt.owner_uuid = p_owner_uuid
      and receipt.account_generation = (v_authority ->> 'account_generation')::bigint
      and receipt.operation_scope = 'snapshot_v2_start'
      and receipt.key_hash = v_key_hash
    for update;
    if v_idempotency.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    if v_idempotency.state = 'succeeded' then
      return v_idempotency.durable_result;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
  end if;


  if p_mode = 'standalone'
    and v_source_recipe.visibility = 'public'
    and v_source_recipe.created_by is distinct from p_owner_uuid then
    for v_owner_uuid in
      select ordered.owner_uuid
      from (
        select distinct owner_uuid
        from unnest(array[p_owner_uuid, v_source_recipe.created_by]) as owner_uuid
        where owner_uuid is not null
      ) as ordered
      order by ordered.owner_uuid::text collate "C"
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'homecook-account-owner:' || v_owner_uuid::text,
          0
        )
      );
    end loop;
  end if;

  perform public.lock_personal_recipe_ids(array[v_recipe_id]);
  select recipe.* into v_recipe
  from public.recipes as recipe
  where recipe.id = v_recipe_id
  for update;
  if v_recipe.id is null or (v_recipe.deleted_at is not null and not coalesce((
    p_mode='planner' and v_recipe.created_by=p_owner_uuid
    and recipe_visibility_guard.is_owner_publicly_visible(p_owner_uuid)
    and (v_recipe.visibility='private' or (v_recipe.visibility='public'
      and v_recipe.source_type='manual' and v_recipe.origin_recipe_id is null))
    and exists (
      select 1 from public.recipe_content_snapshots pinned
      where pinned.id=v_content_snapshot_id and pinned.recipe_id=v_recipe_id
        and pinned.created_at<=v_recipe.deleted_at
        and (pinned.owner_user_id=p_owner_uuid or (v_recipe.visibility='public' and pinned.owner_user_id is null))
    )
    and cardinality(p_meal_ids)>0
    and (select count(*) from public.meals where id=any(p_meal_ids))=cardinality(p_meal_ids)
    and not exists (
      select 1 from public.meals meal where meal.id=any(p_meal_ids)
        and not coalesce((meal.user_id=p_owner_uuid and meal.recipe_id=v_recipe_id
          and meal.recipe_content_snapshot_id=v_content_snapshot_id
          and meal.created_at<=v_recipe.deleted_at),false)
    )
  ),false)) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (
    v_recipe.created_by = p_owner_uuid
    or (
      v_recipe.visibility = 'public'
      and recipe_visibility_guard.is_owner_publicly_visible(v_recipe.created_by)
    )
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_mode = 'standalone'
    and v_recipe.visibility = 'public'
    and v_recipe.created_by is distinct from p_owner_uuid then
    select lifecycle.* into v_source_lifecycle
    from public.user_account_lifecycles as lifecycle
    where lifecycle.owner_uuid = v_recipe.created_by
    order by lifecycle.account_generation desc
    limit 1
    for update;
    if v_source_lifecycle.owner_uuid is not null
      and v_source_lifecycle.status is distinct from 'active' then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if p_mode = 'planner' then
    for v_meal in
      select meal.*
      from public.meals as meal
      where meal.id = any(p_meal_ids)
      order by meal.id::text collate "C"
      for update
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('homecook-meal:' || v_meal.id::text, 0)
      );
      if v_meal.user_id is distinct from p_owner_uuid
        or v_meal.recipe_id is distinct from v_recipe_id
        or v_meal.recipe_content_snapshot_id is null
        or v_meal.recipe_content_snapshot_id is distinct from v_content_snapshot_id
        or v_meal.status not in ('registered', 'shopping_done')
        or v_meal.revision is distinct from
          (p_expected_meal_revisions ->> v_meal.id::text)::bigint then
        raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
      end if;

    end loop;
    if (select count(*) from public.meals where id = any(p_meal_ids))
      is distinct from cardinality(p_meal_ids) then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  else
    if v_recipe.revision is distinct from p_expected_recipe_revision then
      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
    select snapshot.* into v_snapshot
    from public.recipe_content_snapshots as snapshot
    where snapshot.recipe_id = v_recipe_id
      and snapshot.owner_user_id is not distinct from
        case when v_recipe.visibility = 'private' then p_owner_uuid else null end
    -- Canonical saved documents can return to an earlier content hash. Match
    -- current content/current nutrition explicitly; never retimestamp old pins.
      and (not exists(select 1 from public.youtube_saved_recipe_results saved
        where saved.canonical_recipe_id=v_recipe_id)
        or exists(select 1 from public.build_recipe_content_snapshot_input(v_recipe_id) current_input
          where current_input.content_hash=snapshot.content_hash
            and snapshot.recipe_nutrition_snapshot_id is not distinct from
              (select nutrition.id from public.recipe_nutrition_snapshots nutrition
                where nutrition.recipe_id=v_recipe_id and nutrition.is_current)))
    order by snapshot.created_at desc, snapshot.id desc
    limit 1;
    v_content_snapshot_id := v_snapshot.id;
    if v_content_snapshot_id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select snapshot.* into v_snapshot
  from public.recipe_content_snapshots as snapshot
  where snapshot.id = v_content_snapshot_id;
  -- Recipe/account/meal locks and the preceding access/revision checks still apply.
  select session.* into v_resume from public.cooking_sessions session
  where session.user_id=p_owner_uuid and session.contract_version='snapshot_v2'
    and session.session_kind=p_mode and session.status='in_progress'
    and session.recipe_id=v_recipe_id
    and session.recipe_content_snapshot_id=v_content_snapshot_id
    and session.cooking_servings=v_cooking_servings
    and (
      (p_mode='standalone' and session.base_recipe_revision=p_expected_recipe_revision)
      or (p_mode='planner'
        and (select array_agg(link.meal_id order by link.meal_id) from public.cooking_session_meals link where link.session_id=session.id)
          = (select array_agg(id order by id) from unnest(p_meal_ids) requested(id))
        and (select count(*) from public.cooking_session_meal_claims claim
          where claim.session_id=session.id and claim.owner_user_id=p_owner_uuid and claim.meal_id=any(p_meal_ids))=cardinality(p_meal_ids)
      )
    )
  order by session.created_at desc,session.id
  limit 1 for update;
  if v_resume.id is not null then
    v_session_id := v_resume.id;
  else
    if p_mode='planner' and exists(select 1 from public.cooking_session_meal_claims where meal_id=any(p_meal_ids)) then
      raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode='23505';
    end if;
    if current_setting('homecook.snapshot_v2_creation',true) is distinct from 'on' then
      raise exception 'SNAPSHOT_V2_CREATION_DISABLED' using errcode='55000';
    end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  set constraints all deferred;
  insert into public.cooking_sessions (
    id, user_id, status, contract_version, session_kind, recipe_id,
    recipe_content_snapshot_id, cooking_servings, base_recipe_revision,
    created_at
  ) values (
    v_session_id, p_owner_uuid, 'in_progress', 'snapshot_v2', p_mode,
    v_recipe_id, v_content_snapshot_id, v_cooking_servings,
    case when p_mode = 'standalone' then p_expected_recipe_revision else null end,
    p_now
  );
  if p_mode = 'planner' then
    insert into public.cooking_session_meals (
      session_id, meal_id, recipe_id, cooking_servings, meal_revision_snapshot
    )
    select v_session_id, meal.id, meal.recipe_id, meal.planned_servings,
           meal.revision
    from public.meals as meal
    where meal.id = any(p_meal_ids)
    order by meal.id::text collate "C";
    insert into public.cooking_session_meal_claims (
      meal_id, session_id, owner_user_id, claimed_at
    )
    select meal.id, v_session_id, p_owner_uuid, p_now
    from public.meals as meal
    where meal.id = any(p_meal_ids)
    order by meal.id::text collate "C";
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );

  end if;

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', v_session_id,
      'contract_version', 'snapshot_v2',
      'mode', p_mode,
      'status', 'in_progress',
      'content_summary', jsonb_build_object(
        'recipe_id', v_recipe_id,
        'title', v_snapshot.title,
        'cooking_servings', v_cooking_servings
      )
    ),
    'error', null
  );
  update public.mutation_idempotency_keys
  set state = 'succeeded', terminal_result = 'succeeded',
      durable_result = v_result, result_reference = v_session_id,
      attempt_token = null, lease_expires_at = null, updated_at = p_now
  where id = v_idempotency.id;
  return v_result;
end;
$$;

commit;
