-- Use the approved exact g/15mL evidence in either direction. Legacy conversion
-- profiles remain in the guard only as immutable compatibility/audit pointers.

create or replace function public.build_recipe_nutrition_input_guard(p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
  from public.recipe_ingredients ingredient
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
      unit_flags.is_volume_input,
      unit_flags.is_mass_input,
      case
        when unit_flags.is_volume_input and nutrition.volume_count = 1
          then nutrition.single_volume_link_id
        when unit_flags.is_volume_input
          and nutrition.volume_count = 0
          and nutrition.mass_count = 1
          then nutrition.single_mass_link_id
        when not unit_flags.is_volume_input and nutrition.mass_count = 1
          then nutrition.single_mass_link_id
        when unit_flags.is_mass_input
          and nutrition.mass_count = 0
          and nutrition.volume_count = 1
          then nutrition.single_volume_link_id
        else null
      end as link_id,
      case
        when unit_flags.is_volume_input and nutrition.volume_count = 1 then 'ml'
        when unit_flags.is_volume_input
          and nutrition.volume_count = 0
          and nutrition.mass_count = 1
          then 'g'
        when not unit_flags.is_volume_input and nutrition.mass_count = 1 then 'g'
        when unit_flags.is_mass_input
          and nutrition.mass_count = 0
          and nutrition.volume_count = 1
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
  where ingredient.recipe_id = p_recipe_id;
$$;

create or replace function public.build_recipe_nutrition_contributing_sources(p_input_guard jsonb)
returns jsonb
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  with guard_ingredients as (
    select ingredient
    from jsonb_array_elements(
      coalesce(p_input_guard -> 'recipe_ingredients', '[]'::jsonb)
    ) ingredient
  ), selected as (
    select
      guard_ingredient.ingredient,
      nutrition.candidate as nutrition_candidate,
      conversion.candidate as conversion_candidate,
      public.normalize_recipe_nutrition_unit(
        guard_ingredient.ingredient ->> 'unit'
      ) as unit,
      coalesce((guard_ingredient.ingredient ->> 'amount')::numeric, 0) as amount
    from guard_ingredients guard_ingredient
    left join lateral (
      select candidates.candidate
      from jsonb_array_elements(
        coalesce(guard_ingredient.ingredient -> 'nutrition_candidates', '[]'::jsonb)
      ) as candidates(candidate)
      where (candidates.candidate ->> 'link_id') =
        (guard_ingredient.ingredient ->> 'selected_nutrition_link_id')
      limit 1
    ) nutrition on true
    left join lateral (
      select candidates.candidate
      from jsonb_array_elements(
        coalesce(guard_ingredient.ingredient -> 'conversion_candidates', '[]'::jsonb)
      ) as candidates(candidate)
      where (candidates.candidate ->> 'assignment_id') =
        (guard_ingredient.ingredient ->> 'selected_conversion_assignment_id')
      limit 1
    ) conversion on true
  ), contributing as (
    select
      selected.*,
      case
        when selected.unit in ('g', 'kg')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'g'
          then 'direct'
        when selected.unit in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'ml'
          then 'direct'
        when selected.unit in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'g'
          and selected.conversion_candidate is not null
          and (selected.conversion_candidate ->> 'normalized_g_per_15ml')::numeric > 0
          and (selected.conversion_candidate ->> 'preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          and (selected.conversion_candidate ->> 'evidence_preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          then 'conversion'
        when selected.unit in ('g', 'kg')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'ml'
          and selected.conversion_candidate is not null
          and (selected.conversion_candidate ->> 'normalized_g_per_15ml')::numeric > 0
          and (selected.conversion_candidate ->> 'preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          and (selected.conversion_candidate ->> 'evidence_preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          then 'conversion'
        else null
      end as resolution_kind
    from selected
    where selected.ingredient ->> 'ingredient_type' = 'QUANT'
      and selected.amount > 0
      and selected.nutrition_candidate is not null
      and exists (
        select 1
        from jsonb_array_elements(
          coalesce(selected.nutrition_candidate -> 'nutrition_values', '[]'::jsonb)
        ) value
        where value ->> 'value_status' = 'observed'
          and value -> 'amount' <> 'null'::jsonb
      )
  ), source_rows as (
    select nutrition_candidate -> 'source' as source
    from contributing
    where resolution_kind is not null
    union all
    select conversion_candidate -> 'source' as source
    from contributing
    where resolution_kind = 'conversion'
  )
  select coalesce(
    jsonb_agg(source order by
      source ->> 'provider' collate "C" asc nulls first,
      source ->> 'dataset' collate "C" asc nulls first,
      source ->> 'source_version' collate "C" asc nulls first,
      source ->> 'data_basis_date' collate "C" asc nulls first,
      source ->> 'license' collate "C" asc nulls first,
      source ->> 'source_url' collate "C" asc nulls first
    ),
    '[]'::jsonb
  )
  from (select distinct source from source_rows where source is not null) canonical;
$$;
