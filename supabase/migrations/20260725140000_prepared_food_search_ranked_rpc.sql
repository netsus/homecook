create or replace function public.search_food_catalog_ranked(
  p_actor_id uuid,
  p_query text,
  p_types text[],
  p_source text,
  p_cursor_version integer,
  p_cursor jsonb,
  p_query_fingerprint text,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_query text := public.normalize_food_search_text(coalesce(p_query, ''), false);
  v_compact_query text := public.normalize_food_search_text(coalesce(p_query, ''), true);
  v_cursor_source_partition integer;
  v_result jsonb;
begin
  perform public.assert_food_product_actor(p_actor_id);

  if p_types is null
    or cardinality(p_types) = 0
    or not (p_types <@ array['ingredient', 'food_product']::text[])
    or cardinality(p_types) <> cardinality(array(select distinct unnest(p_types)))
    or (p_source is not null and p_source not in ('public', 'community', 'mine'))
    or p_limit is null
    or p_limit < 1
    or p_limit > 50
    or char_length(v_query) > 120
    or p_query_fingerprint is null
    or p_query_fingerprint !~ '^[a-f0-9]{64}$'
    or (p_cursor_version is null) <> (p_cursor is null)
    or (p_cursor_version is not null and p_cursor_version not in (1, 2))
  then
    raise exception 'INVALID_SEARCH_FILTER';
  end if;

  if p_cursor_version = 1 then
    if p_types <> array['food_product']::text[]
      or jsonb_typeof(p_cursor) <> 'object'
      or not (p_cursor ?& array['created_at', 'stable_id'])
      or jsonb_typeof(p_cursor -> 'created_at') <> 'string'
      or jsonb_typeof(p_cursor -> 'stable_id') <> 'string'
      or (p_cursor ->> 'stable_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then
      raise exception 'INVALID_SEARCH_FILTER';
    end if;

    select case
      when product.source_type = 'public_dataset' then 0
      when product.visibility = 'public' then 1
      else 2
    end
    into v_cursor_source_partition
    from public.food_products product
    where product.id = (p_cursor ->> 'stable_id')::uuid
      and product.created_at = (p_cursor ->> 'created_at')::timestamptz
      and product.deleted_at is null
      and product.moderation_status = 'visible'
      and (
        (product.visibility = 'public'
          and product.source_type = 'public_dataset'
          and (p_source is null or p_source = 'public'))
        or
        (product.visibility = 'public'
          and product.source_type = 'manual'
          and (p_source is null or p_source = 'community'))
        or
        (product.visibility = 'private'
          and product.source_type = 'manual'
          and product.owner_user_id = p_actor_id
          and (p_source is null or p_source = 'mine'))
      );

    if v_cursor_source_partition is null then
      raise exception 'INVALID_SEARCH_FILTER';
    end if;
  elsif p_cursor_version = 2 then
    if jsonb_typeof(p_cursor) <> 'object'
      or not (p_cursor ?& array[
        'algorithm_version',
        'match_bucket',
        'coverage_bucket',
        'quantized_score',
        'source_partition',
        'type_partition',
        'created_at',
        'stable_id'
      ])
      or jsonb_typeof(p_cursor -> 'algorithm_version') <> 'number'
      or (p_cursor ->> 'algorithm_version')::integer <> 2
      or jsonb_typeof(p_cursor -> 'match_bucket') <> 'number'
      or (p_cursor ->> 'match_bucket') !~ '^[0-9]+$'
      or (p_cursor ->> 'match_bucket')::integer not between 0 and 9
      or jsonb_typeof(p_cursor -> 'coverage_bucket') <> 'number'
      or (p_cursor ->> 'coverage_bucket') !~ '^[0-9]+$'
      or (p_cursor ->> 'coverage_bucket')::integer not between 0 and 9
      or jsonb_typeof(p_cursor -> 'quantized_score') <> 'number'
      or (p_cursor ->> 'quantized_score') !~ '^[0-9]+$'
      or (p_cursor ->> 'quantized_score')::integer not between 0 and 1000000
      or jsonb_typeof(p_cursor -> 'source_partition') <> 'number'
      or (p_cursor ->> 'source_partition') !~ '^[0-9]+$'
      or (p_cursor ->> 'source_partition')::integer not between 0 and 9
      or jsonb_typeof(p_cursor -> 'type_partition') <> 'number'
      or (p_cursor ->> 'type_partition') !~ '^[0-9]+$'
      or (p_cursor ->> 'type_partition')::integer not between 0 and 9
      or jsonb_typeof(p_cursor -> 'created_at') <> 'string'
      or jsonb_typeof(p_cursor -> 'stable_id') <> 'string'
      or (p_cursor ->> 'stable_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then
      raise exception 'INVALID_SEARCH_FILTER';
    end if;
  end if;

  with
  query_parts as materialized (
    select part
    from unnest(regexp_split_to_array(v_query, '[[:space:]]+')) part
    where char_length(part) > 0
  ),
  query_splits as materialized (
    select
      substr(v_compact_query, 1, split_at) as left_part,
      substr(v_compact_query, split_at + 1) as right_part
    from generate_series(2, greatest(2, char_length(v_compact_query) - 2)) split_at
    where v_query <> ''
      and position(' ' in v_query) = 0
      and char_length(v_compact_query) >= 4
      and split_at <= char_length(v_compact_query) - 2
  ),
  ingredient_candidates as materialized (
    select
      'ingredient'::text as item_type,
      ingredient.id as stable_id,
      ingredient.created_at,
      0 as source_partition,
      0 as type_partition,
      public.normalize_food_search_text(ingredient.standard_name::text, false)
        as normalized_document,
      public.normalize_food_search_text(ingredient.standard_name::text, true)
        as compact_document,
      jsonb_build_object(
        'type', 'ingredient',
        'id', ingredient.id,
        'standard_name', ingredient.standard_name,
        'category', ingredient.category,
        'default_unit', ingredient.default_unit
      ) as seed_payload
    from public.ingredients ingredient
    where 'ingredient' = any(p_types)
      and (p_source is null or p_source = 'public')
      and p_cursor_version is distinct from 1
      and (
        v_query = ''
        or (
          char_length(v_compact_query) <= 2
          and public.food_search_short_ngrams(ingredient.standard_name::text)
            @> array[v_compact_query]::text[]
        )
        or (
          char_length(v_compact_query) >= 3
          and (
            public.normalize_food_search_text(
              ingredient.standard_name::text,
              true
            ) like '%' || v_compact_query || '%'
            or public.normalize_food_search_text(
              ingredient.standard_name::text,
              true
            ) % v_compact_query
            or public.food_search_short_ngrams(ingredient.standard_name::text)
              && public.food_search_short_ngrams(v_compact_query)
          )
        )
      )
    order by ingredient.created_at desc, ingredient.id desc
    limit 400
  ),
  public_product_candidates as materialized (
    select
      'food_product'::text as item_type,
      product.id as stable_id,
      product.created_at,
      case when product.source_type = 'public_dataset' then 0 else 1 end
        as source_partition,
      1 as type_partition,
      public.normalize_food_search_text(
        coalesce(product.brand::text || ' ', '') || product.name::text,
        false
      ) as normalized_document,
      public.normalize_food_search_text(
        coalesce(product.brand::text || ' ', '') || product.name::text,
        true
      ) as compact_document,
      null::jsonb as seed_payload
    from public.food_products product
    where 'food_product' = any(p_types)
      and product.visibility = 'public'
      and product.moderation_status = 'visible'
      and product.deleted_at is null
      and (
        (product.source_type = 'public_dataset'
          and (p_source is null or p_source = 'public'))
        or
        (product.source_type = 'manual'
          and (p_source is null or p_source = 'community'))
      )
      and (
        product.source_type <> 'public_dataset'
        or exists (
          select 1
          from public.food_product_nutrition_versions version
          join public.nutrition_profiles profile
            on profile.id = version.nutrition_profile_id
          join public.nutrition_source_items source_item
            on source_item.id = version.source_item_id
          join public.nutrition_sources source
            on source.id = source_item.source_id
          where version.id = product.current_nutrition_version_id
            and version.product_id = product.id
            and profile.source_item_id = source_item.id
            and profile.profile_kind = 'product_label'
            and profile.normalization_method = 'as_labeled'
            and profile.review_status = 'approved'
            and profile.is_active
            and source_item.external_item_key = product.external_product_key
            and source_item.source_basis_amount is not null
            and source_item.source_basis_amount = profile.basis_amount
            and source_item.source_basis_unit = profile.basis_unit
            and source_item.review_status = 'approved'
            and source.review_status = 'approved'
            and source.freshness_status = 'current'
            and source.is_active
            and nullif(btrim(source.source_version), '') is not null
            and (
              select count(*)
              from public.nutrition_values nutrition_value
              where nutrition_value.profile_id = profile.id
                and nutrition_value.nutrient_code in (
                  'energy_kcal',
                  'carbohydrate_g',
                  'protein_g',
                  'fat_g',
                  'sodium_mg'
                )
                and nutrition_value.value_status = 'observed'
                and nutrition_value.amount is not null
            ) = 5
        )
      )
      and (
        v_query = ''
        or (
          char_length(v_compact_query) <= 2
          and public.food_search_short_ngrams(
            coalesce(product.brand::text || ' ', '') || product.name::text
          ) @> array[v_compact_query]::text[]
        )
        or (
          char_length(v_compact_query) >= 3
          and (
            public.normalize_food_search_text(
              coalesce(product.brand::text || ' ', '') || product.name::text,
              true
            ) like '%' || v_compact_query || '%'
            or public.normalize_food_search_text(
              coalesce(product.brand::text || ' ', '') || product.name::text,
              true
            ) % v_compact_query
            or public.food_search_short_ngrams(
              coalesce(product.brand::text || ' ', '') || product.name::text
            ) && public.food_search_short_ngrams(v_compact_query)
          )
        )
      )
    order by product.created_at desc, product.id desc
    limit 400
  ),
  private_product_candidates as materialized (
    select
      'food_product'::text as item_type,
      product.id as stable_id,
      product.created_at,
      2 as source_partition,
      1 as type_partition,
      public.normalize_food_search_text(
        coalesce(product.brand::text || ' ', '') || product.name::text,
        false
      ) as normalized_document,
      public.normalize_food_search_text(
        coalesce(product.brand::text || ' ', '') || product.name::text,
        true
      ) as compact_document,
      null::jsonb as seed_payload
    from public.food_products product
    where 'food_product' = any(p_types)
      and product.visibility = 'private'
      and product.owner_user_id = p_actor_id
      and product.source_type = 'manual'
      and product.moderation_status = 'visible'
      and product.deleted_at is null
      and (p_source is null or p_source = 'mine')
      and (
        v_query = ''
        or (
          char_length(v_compact_query) <= 2
          and public.food_search_short_ngrams(
            coalesce(product.brand::text || ' ', '') || product.name::text
          ) @> array[v_compact_query]::text[]
        )
        or (
          char_length(v_compact_query) >= 3
          and (
            public.normalize_food_search_text(
              coalesce(product.brand::text || ' ', '') || product.name::text,
              true
            ) like '%' || v_compact_query || '%'
            or public.normalize_food_search_text(
              coalesce(product.brand::text || ' ', '') || product.name::text,
              true
            ) % v_compact_query
            or public.food_search_short_ngrams(
              coalesce(product.brand::text || ' ', '') || product.name::text
            ) && public.food_search_short_ngrams(v_compact_query)
          )
        )
      )
    order by product.created_at desc, product.id desc
    limit 400
  ),
  admitted_candidates as materialized (
    select * from ingredient_candidates
    union all
    select * from public_product_candidates
    union all
    select * from private_product_candidates
  ),
  scored_candidates as materialized (
    select
      candidate.*,
      2 as algorithm_version,
      case
        when v_query = '' then 4
        when candidate.normalized_document = v_query
          or candidate.compact_document = v_compact_query then 0
        when candidate.compact_document like '%' || v_compact_query || '%'
          then 1
        when not exists (
          select 1
          from query_parts
          where candidate.normalized_document not like '%' || query_parts.part || '%'
        ) then 2
        when exists (
          select 1
          from query_splits
          where candidate.compact_document like '%' || query_splits.left_part || '%'
            and candidate.compact_document like '%' || query_splits.right_part || '%'
        ) then 2
        else 3
      end as match_bucket,
      case
        when v_query = '' then 0
        when not exists (
          select 1
          from query_parts
          where candidate.normalized_document not like '%' || query_parts.part || '%'
        ) then 0
        when exists (
          select 1
          from query_splits
          where candidate.compact_document like '%' || query_splits.left_part || '%'
            and candidate.compact_document like '%' || query_splits.right_part || '%'
        ) then 0
        else 1
      end as coverage_bucket,
      case
        when v_query = '' or char_length(v_compact_query) <= 2 then 0
        else greatest(
          0,
          least(
            1000000,
            1000000 - round(
              public.similarity(candidate.compact_document, v_compact_query)
              * 1000000
            )::integer
          )
        )
      end as quantized_score
    from admitted_candidates candidate
  ),
  cursor_filtered as materialized (
    select scored.*
    from scored_candidates scored
    where
      (
        p_cursor_version is null
        or (
          p_cursor_version = 1
          and (
            scored.source_partition > v_cursor_source_partition
            or (
              scored.source_partition = v_cursor_source_partition
              and (
                scored.created_at < (p_cursor ->> 'created_at')::timestamptz
                or (
                  scored.created_at = (p_cursor ->> 'created_at')::timestamptz
                  and scored.stable_id < (p_cursor ->> 'stable_id')::uuid
                )
              )
            )
          )
        )
        or (
          p_cursor_version = 2
          and (
            (
              scored.algorithm_version,
              scored.match_bucket,
              scored.coverage_bucket,
              scored.quantized_score,
              scored.source_partition,
              scored.type_partition
            ) > (
              (p_cursor ->> 'algorithm_version')::integer,
              (p_cursor ->> 'match_bucket')::integer,
              (p_cursor ->> 'coverage_bucket')::integer,
              (p_cursor ->> 'quantized_score')::integer,
              (p_cursor ->> 'source_partition')::integer,
              (p_cursor ->> 'type_partition')::integer
            )
            or (
              (
                scored.algorithm_version,
                scored.match_bucket,
                scored.coverage_bucket,
                scored.quantized_score,
                scored.source_partition,
                scored.type_partition
              ) = (
                (p_cursor ->> 'algorithm_version')::integer,
                (p_cursor ->> 'match_bucket')::integer,
                (p_cursor ->> 'coverage_bucket')::integer,
                (p_cursor ->> 'quantized_score')::integer,
                (p_cursor ->> 'source_partition')::integer,
                (p_cursor ->> 'type_partition')::integer
              )
              and (
                scored.created_at < (p_cursor ->> 'created_at')::timestamptz
                or (
                  scored.created_at = (p_cursor ->> 'created_at')::timestamptz
                  and scored.stable_id < (p_cursor ->> 'stable_id')::uuid
                )
              )
            )
          )
        )
      )
  ),
  legacy_product_page as materialized (
    select *
    from cursor_filtered
    where p_cursor_version = 1
    order by source_partition, created_at desc, stable_id desc
    limit p_limit + 1
  ),
  ranked_page as materialized (
    select *
    from cursor_filtered
    where p_cursor_version is distinct from 1
    order by
      algorithm_version,
      match_bucket,
      coverage_bucket,
      quantized_score,
      source_partition,
      type_partition,
      created_at desc,
      stable_id desc
    limit p_limit + 1
  ),
  selected_rows as materialized (
    select * from legacy_product_page
    union all
    select * from ranked_page
  ),
  page as materialized (
    select *
    from selected_rows
    order by
      case when p_cursor_version = 1 then 0 else algorithm_version end,
      case when p_cursor_version = 1 then 0 else match_bucket end,
      case when p_cursor_version = 1 then 0 else coverage_bucket end,
      case when p_cursor_version = 1 then 0 else quantized_score end,
      source_partition,
      case when p_cursor_version = 1 then 0 else type_partition end,
      created_at desc,
      stable_id desc
    limit p_limit
  ),
  product_context as materialized (
    select
      page.stable_id,
      product.*,
      version.id as nutrition_version_id,
      version.label_basis_text,
      version.basis_relations_json,
      version.source_item_id,
      profile.id as profile_id,
      profile.basis_amount,
      profile.basis_unit
    from page
    join public.food_products product on product.id = page.stable_id
    join public.food_product_nutrition_versions version
      on version.id = product.current_nutrition_version_id
      and version.product_id = product.id
    join public.nutrition_profiles profile
      on profile.id = version.nutrition_profile_id
    where page.item_type = 'food_product'
  ),
  core_values as materialized (
    select
      context.id,
      jsonb_object_agg(
        core.code,
        jsonb_build_object(
          'amount', nutrition_value.amount,
          'known_amount', null,
          'status',
            case when nutrition_value.amount is null
              then 'unavailable'
              else 'complete'
            end,
          'display_mode',
            case when nutrition_value.amount is null then null else 'total' end
        )
        order by core.position
      ) as values_json,
      count(nutrition_value.amount) as observed_count
    from product_context context
    cross join (values
      ('energy_kcal', 1),
      ('carbohydrate_g', 2),
      ('protein_g', 3),
      ('fat_g', 4),
      ('sodium_mg', 5)
    ) core(code, position)
    left join public.nutrition_values nutrition_value
      on nutrition_value.profile_id = context.profile_id
      and nutrition_value.nutrient_code = core.code
    group by context.id
  ),
  optional_values as materialized (
    select
      context.id,
      jsonb_object_agg(
        nutrition_value.nutrient_code,
        jsonb_build_object(
          'amount', nutrition_value.amount,
          'known_amount', null,
          'status', 'complete',
          'display_mode', 'total'
        )
        order by definition.display_order
      ) as values_json
    from product_context context
    join public.nutrition_values nutrition_value
      on nutrition_value.profile_id = context.profile_id
    join public.nutrient_definitions definition
      on definition.code = nutrition_value.nutrient_code
    where not definition.is_core
      and nutrition_value.value_status = 'observed'
      and nutrition_value.amount is not null
    group by context.id
  ),
  source_projection as materialized (
    select
      context.id,
      jsonb_build_array(jsonb_build_object(
        'provider', source.provider_code,
        'dataset', source.dataset_name,
        'source_version', source.source_version,
        'data_basis_date', source.data_basis_date,
        'license', source.license_name,
        'source_url', source.source_url
      )) as sources_json
    from product_context context
    join public.nutrition_source_items source_item
      on source_item.id = context.source_item_id
    join public.nutrition_sources source
      on source.id = source_item.source_id
    where context.source_type = 'public_dataset'
      and source_item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ),
  product_payloads as materialized (
    select
      context.id,
      jsonb_build_object(
        'type', 'food_product',
        'id', context.id,
        'name', context.name,
        'brand', context.brand,
        'visibility', context.visibility,
        'source_type', context.source_type,
        'editable',
          context.source_type = 'manual'
          and context.owner_user_id = p_actor_id
          and context.moderation_status = 'visible',
        'nutrition_version_id', context.nutrition_version_id,
        'basis_relations', context.basis_relations_json,
        'nutrition', jsonb_build_object(
          'basis', jsonb_build_object(
            'amount', context.basis_amount,
            'unit', context.basis_unit
          ),
          'label_basis_text', context.label_basis_text,
          'values',
            core.values_json || coalesce(optional.values_json, '{}'::jsonb),
          'calculation_status',
            case
              when core.observed_count = 5 then 'complete'
              when core.observed_count > 0 then 'partial'
              else 'unavailable'
            end,
          'calculation_quality',
            case when core.observed_count > 0 then 'direct' else null end,
          'warnings', '[]'::jsonb,
          'sources',
            case
              when context.source_type = 'manual'
                then jsonb_build_array(jsonb_build_object(
                  'provider', 'user_label',
                  'dataset', null,
                  'source_version', null,
                  'data_basis_date', null,
                  'license', null,
                  'source_url', null
                ))
              else coalesce(source.sources_json, '[]'::jsonb)
            end
        )
      ) as payload
    from product_context context
    join core_values core on core.id = context.id
    left join optional_values optional on optional.id = context.id
    left join source_projection source on source.id = context.id
  ),
  page_payloads as materialized (
    select
      page.*,
      coalesce(page.seed_payload, product_payload.payload) as payload
    from page
    left join product_payloads product_payload
      on product_payload.id = page.stable_id
  ),
  last_row as materialized (
    select *
    from page
    order by
      case when p_cursor_version = 1 then 0 else algorithm_version end desc,
      case when p_cursor_version = 1 then 0 else match_bucket end desc,
      case when p_cursor_version = 1 then 0 else coverage_bucket end desc,
      case when p_cursor_version = 1 then 0 else quantized_score end desc,
      source_partition desc,
      case when p_cursor_version = 1 then 0 else type_partition end desc,
      created_at,
      stable_id
    limit 1
  )
  select jsonb_build_object(
    'items',
      coalesce(
        jsonb_agg(
          page_payloads.payload
          order by
            case when p_cursor_version = 1
              then 0
              else page_payloads.algorithm_version
            end,
            case when p_cursor_version = 1
              then 0
              else page_payloads.match_bucket
            end,
            case when p_cursor_version = 1
              then 0
              else page_payloads.coverage_bucket
            end,
            case when p_cursor_version = 1
              then 0
              else page_payloads.quantized_score
            end,
            page_payloads.source_partition,
            case when p_cursor_version = 1
              then 0
              else page_payloads.type_partition
            end,
            page_payloads.created_at desc,
            page_payloads.stable_id desc
        ),
        '[]'::jsonb
      ),
    'has_next', (select count(*) > p_limit from selected_rows),
    'next_cursor_tuple',
      case
        when (select count(*) > p_limit from selected_rows)
          then (
            select jsonb_build_object(
              'algorithm_version', last_row.algorithm_version,
              'match_bucket', last_row.match_bucket,
              'coverage_bucket', last_row.coverage_bucket,
              'quantized_score', last_row.quantized_score,
              'source_partition', last_row.source_partition,
              'type_partition', last_row.type_partition,
              'created_at',
                to_char(
                  last_row.created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
              'stable_id', last_row.stable_id
            )
            from last_row
          )
        else null
      end
  )
  into v_result
  from page_payloads;

  return coalesce(
    v_result,
    jsonb_build_object(
      'items', '[]'::jsonb,
      'has_next', false,
      'next_cursor_tuple', null
    )
  );
exception
  when invalid_text_representation or datetime_field_overflow
    or numeric_value_out_of_range then
    raise exception 'INVALID_SEARCH_FILTER';
end;
$$;

revoke all on function public.search_food_catalog_ranked(
  uuid,
  text,
  text[],
  text,
  integer,
  jsonb,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.search_food_catalog_ranked(
  uuid,
  text,
  text[],
  text,
  integer,
  jsonb,
  text,
  integer
) to service_role;
