-- recipe-nutrition-v2 keeps exact nutrient provenance for observed zero
-- TO_TASTE values and approved medium piece-weight estimates.
create or replace function public.build_recipe_nutrition_contributing_sources(
  p_input_guard jsonb
)
returns jsonb
language sql
stable
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
      piece.candidate as piece_candidate,
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
    left join lateral (
      select jsonb_build_object(
        'piece_weight_id', piece_weight.id,
        'size_code', piece_weight.size_code,
        'preparation_state', piece_weight.preparation_state,
        'weight_g', piece_weight.weight_g,
        'source', jsonb_build_object(
          'provider', source.provider_code,
          'dataset', source.dataset_name,
          'source_version', source.source_version,
          'data_basis_date', source.data_basis_date,
          'license', source.license_name,
          'source_url', source.source_url
        )
      ) as candidate
      from public.piece_unit_weights piece_weight
      join public.measurement_source_evidence evidence
        on evidence.id = piece_weight.evidence_id
      join public.nutrition_sources source on source.id = evidence.source_id
      where piece_weight.ingredient_id::text =
          (guard_ingredient.ingredient ->> 'ingredient_id')
        and piece_weight.size_code = 'medium'
        and piece_weight.preparation_state =
          (nutrition.candidate ->> 'preparation_state')
        and piece_weight.review_status = 'approved'
        and piece_weight.is_active
        and evidence.evidence_kind = 'piece_weight'
        and evidence.size_code = 'medium'
        and evidence.preparation_state = piece_weight.preparation_state
        and evidence.review_status = 'approved'
        and evidence.is_active
        and source.review_status = 'approved'
        and source.freshness_status = 'current'
        and source.is_active
      order by piece_weight.id::text collate "C"
      limit 1
    ) piece on true
  ), contributing as (
    select
      selected.*,
      case
        when selected.ingredient ->> 'ingredient_type' = 'TO_TASTE'
          and exists (
            select 1
            from jsonb_array_elements(
              coalesce(selected.nutrition_candidate -> 'nutrition_values', '[]'::jsonb)
            ) value
            where value ->> 'value_status' = 'observed'
              and value -> 'amount' <> 'null'::jsonb
              and (value ->> 'amount')::numeric = 0
          )
          then 'to_taste_zero'
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
        when selected.unit in ('개', '장', '대', '모', 'piece', 'pieces')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'g'
          and selected.piece_candidate is not null
          then 'piece'
        else null
      end as resolution_kind
    from selected
    where selected.nutrition_candidate is not null
      and (
        (
          selected.ingredient ->> 'ingredient_type' = 'TO_TASTE'
          and exists (
            select 1
            from jsonb_array_elements(
              coalesce(selected.nutrition_candidate -> 'nutrition_values', '[]'::jsonb)
            ) value
            where value ->> 'value_status' = 'observed'
              and value -> 'amount' <> 'null'::jsonb
              and (value ->> 'amount')::numeric = 0
          )
        )
        or (
          selected.ingredient ->> 'ingredient_type' = 'QUANT'
          and selected.amount > 0
          and exists (
            select 1
            from jsonb_array_elements(
              coalesce(selected.nutrition_candidate -> 'nutrition_values', '[]'::jsonb)
            ) value
            where value ->> 'value_status' = 'observed'
              and value -> 'amount' <> 'null'::jsonb
          )
        )
      )
  ), source_rows as (
    select nutrition_candidate -> 'source' as source
    from contributing
    where resolution_kind is not null
    union all
    select conversion_candidate -> 'source' as source
    from contributing
    where resolution_kind = 'conversion'
    union all
    select piece_candidate -> 'source' as source
    from contributing
    where resolution_kind = 'piece'
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
