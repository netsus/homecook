create extension if not exists pg_trgm;

drop index if exists public.food_products_search_idx;

create index if not exists food_products_visible_name_trgm_idx
  on public.food_products
  using gin (lower(name) gin_trgm_ops)
  where deleted_at is null and moderation_status = 'visible';

create index if not exists food_products_visible_brand_trgm_idx
  on public.food_products
  using gin (lower(coalesce(brand, '')) gin_trgm_ops)
  where deleted_at is null and moderation_status = 'visible';

create or replace function public.list_food_products(
  p_user_id uuid,
  p_query text,
  p_source text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_has_next boolean := false;
  v_last_created_at timestamptz;
  v_last_id uuid;
  v_cursor_partition integer;
  v_cursor text;
  v_trimmed_query text := nullif(btrim(p_query), '');
  v_query_pattern text;
  v_target_count integer := p_limit + 1;
  v_eligible_rows jsonb := '[]'::jsonb;
  v_batch_rows jsonb := '[]'::jsonb;
  v_batch_count integer := 0;
  v_batch_size integer := 0;
  v_batch_last_created_at timestamptz;
  v_batch_last_id uuid;
  v_partition_cursor_created_at timestamptz;
  v_partition_cursor_id uuid;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_source is null
    or p_source not in ('all', 'public_dataset', 'manual')
    or p_limit is null or p_limit < 1 or p_limit > 50
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then raise exception 'VALIDATION_ERROR'; end if;

  if v_trimmed_query is not null then
    v_query_pattern := '%' || lower(v_trimmed_query) || '%';
  end if;

  if p_cursor_id is not null then
    select case
      when product.source_type = 'public_dataset' then 1
      when product.visibility = 'public' and product.source_type = 'manual' then 2
      else 3
    end
    into v_cursor_partition
    from public.food_products product
    where product.id = p_cursor_id
      and product.created_at = p_cursor_created_at
      and product.deleted_at is null
      and product.moderation_status = 'visible'
      and (
        (product.visibility = 'public' and product.source_type in ('public_dataset', 'manual'))
        or (product.visibility = 'private' and product.source_type = 'manual' and product.owner_user_id = p_user_id)
      )
      and (
        p_source = 'all'
        or (p_source = 'public_dataset' and product.source_type = 'public_dataset')
        or (p_source = 'manual' and product.source_type = 'manual')
      );
    if v_cursor_partition is null then raise exception 'VALIDATION_ERROR'; end if;
  end if;

  if p_source in ('all', 'public_dataset')
    and (v_cursor_partition is null or v_cursor_partition <= 1)
  then
    v_partition_cursor_created_at := case when v_cursor_partition = 1 then p_cursor_created_at else null end;
    v_partition_cursor_id := case when v_cursor_partition = 1 then p_cursor_id else null end;

    loop
      exit when jsonb_array_length(v_eligible_rows) >= v_target_count;
      v_batch_size := greatest((v_target_count - jsonb_array_length(v_eligible_rows)) * 8, 64);

      with candidate_batch as materialized (
        select product.id, product.created_at
        from public.food_products product
        where product.deleted_at is null
          and product.moderation_status = 'visible'
          and product.visibility = 'public'
          and product.source_type = 'public_dataset'
          and product.current_nutrition_version_id is not null
          and (
            v_trimmed_query is null
            or lower(product.name) like v_query_pattern
            or lower(coalesce(product.brand, '')) like v_query_pattern
          )
          and (
            v_partition_cursor_id is null
            or (
              product.created_at < v_partition_cursor_created_at
              or (product.created_at = v_partition_cursor_created_at and product.id < v_partition_cursor_id)
            )
          )
        order by product.created_at desc, product.id desc
        limit v_batch_size
      ), admitted_batch as (
        select candidate.id, candidate.created_at, 1 as partition_rank
        from candidate_batch candidate
        join public.food_products product on product.id = candidate.id
        join lateral (
          select 1
          from public.food_product_nutrition_versions admitted_version
          join public.nutrition_profiles admitted_profile
            on admitted_profile.id = admitted_version.nutrition_profile_id
          join public.nutrition_source_items admitted_item
            on admitted_item.id = admitted_version.source_item_id
          join public.nutrition_sources admitted_source
            on admitted_source.id = admitted_item.source_id
          where admitted_version.id = product.current_nutrition_version_id
            and admitted_version.product_id = product.id
            and admitted_profile.source_item_id = admitted_item.id
            and admitted_profile.profile_kind = 'product_label'
            and admitted_profile.normalization_method = 'as_labeled'
            and admitted_profile.review_status = 'approved'
            and admitted_profile.is_active
            and admitted_item.external_item_key = product.external_product_key
            and admitted_item.source_basis_amount is not null
            and admitted_item.source_basis_amount = admitted_profile.basis_amount
            and admitted_item.source_basis_unit = admitted_profile.basis_unit
            and admitted_item.review_status = 'approved'
            and admitted_source.review_status = 'approved'
            and admitted_source.freshness_status = 'current'
            and admitted_source.is_active
            and nullif(btrim(admitted_source.source_version), '') is not null
            and (
              select count(*)
              from public.nutrition_values admitted_value
              where admitted_value.profile_id = admitted_profile.id
                and admitted_value.nutrient_code in (
                  'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
                )
                and admitted_value.value_status = 'observed'
                and admitted_value.amount is not null
            ) = 5
        ) admitted on true
        order by candidate.created_at desc, candidate.id desc
      )
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'id', admitted.id,
          'created_at', admitted.created_at,
          'partition_rank', admitted.partition_rank
        ) order by admitted.created_at desc, admitted.id desc), '[]'::jsonb),
        (select count(*) from candidate_batch),
        (select candidate.created_at from candidate_batch candidate order by candidate.created_at asc, candidate.id asc limit 1),
        (select candidate.id from candidate_batch candidate order by candidate.created_at asc, candidate.id asc limit 1)
      into v_batch_rows, v_batch_count, v_batch_last_created_at, v_batch_last_id
      from admitted_batch admitted;

      v_eligible_rows := v_eligible_rows || v_batch_rows;
      exit when v_batch_count < v_batch_size;
      v_partition_cursor_created_at := v_batch_last_created_at;
      v_partition_cursor_id := v_batch_last_id;
    end loop;
  end if;

  if p_source in ('all', 'manual')
    and (v_cursor_partition is null or v_cursor_partition <= 2)
    and jsonb_array_length(v_eligible_rows) < v_target_count
  then
    v_partition_cursor_created_at := case when v_cursor_partition = 2 then p_cursor_created_at else null end;
    v_partition_cursor_id := case when v_cursor_partition = 2 then p_cursor_id else null end;

    loop
      exit when jsonb_array_length(v_eligible_rows) >= v_target_count;
      v_batch_size := greatest((v_target_count - jsonb_array_length(v_eligible_rows)) * 4, 32);

      with candidate_batch as materialized (
        select product.id, product.created_at
        from public.food_products product
        where product.deleted_at is null
          and product.moderation_status = 'visible'
          and product.visibility = 'public'
          and product.source_type = 'manual'
          and (
            v_trimmed_query is null
            or lower(product.name) like v_query_pattern
            or lower(coalesce(product.brand, '')) like v_query_pattern
          )
          and (
            v_partition_cursor_id is null
            or (
              product.created_at < v_partition_cursor_created_at
              or (product.created_at = v_partition_cursor_created_at and product.id < v_partition_cursor_id)
            )
          )
        order by product.created_at desc, product.id desc
        limit v_batch_size
      )
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'id', candidate.id,
          'created_at', candidate.created_at,
          'partition_rank', 2
        ) order by candidate.created_at desc, candidate.id desc), '[]'::jsonb),
        count(*),
        (select batch.created_at from candidate_batch batch order by batch.created_at asc, batch.id asc limit 1),
        (select batch.id from candidate_batch batch order by batch.created_at asc, batch.id asc limit 1)
      into v_batch_rows, v_batch_count, v_batch_last_created_at, v_batch_last_id
      from candidate_batch candidate;

      v_eligible_rows := v_eligible_rows || v_batch_rows;
      exit when v_batch_count < v_batch_size;
      v_partition_cursor_created_at := v_batch_last_created_at;
      v_partition_cursor_id := v_batch_last_id;
    end loop;
  end if;

  if p_source in ('all', 'manual')
    and (v_cursor_partition is null or v_cursor_partition <= 3)
    and jsonb_array_length(v_eligible_rows) < v_target_count
  then
    v_partition_cursor_created_at := case when v_cursor_partition = 3 then p_cursor_created_at else null end;
    v_partition_cursor_id := case when v_cursor_partition = 3 then p_cursor_id else null end;

    loop
      exit when jsonb_array_length(v_eligible_rows) >= v_target_count;
      v_batch_size := greatest((v_target_count - jsonb_array_length(v_eligible_rows)) * 4, 32);

      with candidate_batch as materialized (
        select product.id, product.created_at
        from public.food_products product
        where product.deleted_at is null
          and product.moderation_status = 'visible'
          and product.visibility = 'private'
          and product.source_type = 'manual'
          and product.owner_user_id = p_user_id
          and (
            v_trimmed_query is null
            or lower(product.name) like v_query_pattern
            or lower(coalesce(product.brand, '')) like v_query_pattern
          )
          and (
            v_partition_cursor_id is null
            or (
              product.created_at < v_partition_cursor_created_at
              or (product.created_at = v_partition_cursor_created_at and product.id < v_partition_cursor_id)
            )
          )
        order by product.created_at desc, product.id desc
        limit v_batch_size
      )
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'id', candidate.id,
          'created_at', candidate.created_at,
          'partition_rank', 3
        ) order by candidate.created_at desc, candidate.id desc), '[]'::jsonb),
        count(*),
        (select batch.created_at from candidate_batch batch order by batch.created_at asc, batch.id asc limit 1),
        (select batch.id from candidate_batch batch order by batch.created_at asc, batch.id asc limit 1)
      into v_batch_rows, v_batch_count, v_batch_last_created_at, v_batch_last_id
      from candidate_batch candidate;

      v_eligible_rows := v_eligible_rows || v_batch_rows;
      exit when v_batch_count < v_batch_size;
      v_partition_cursor_created_at := v_batch_last_created_at;
      v_partition_cursor_id := v_batch_last_id;
    end loop;
  end if;

  with eligible as materialized (
    select *
    from jsonb_to_recordset(v_eligible_rows) as eligible_row(
      id uuid,
      created_at timestamptz,
      partition_rank integer
    )
    order by partition_rank asc, created_at desc, id desc
    limit p_limit + 1
  ), page as materialized (
    select eligible.id, eligible.created_at, eligible.partition_rank
    from eligible
    order by partition_rank asc, created_at desc, id desc
    limit p_limit
  ), context as materialized (
    select page.partition_rank, page.created_at as listed_created_at,
      product.*,
      version.id as nutrition_version_id,
      version.label_basis_text,
      version.basis_relations_json,
      version.source_item_id,
      profile.id as profile_id,
      profile.basis_amount,
      profile.basis_unit
    from page
    join public.food_products product on product.id = page.id
    join public.food_product_nutrition_versions version
      on version.id = product.current_nutrition_version_id
      and version.product_id = product.id
    join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
  ), core_values as (
    select context.id,
      jsonb_object_agg(core.code, jsonb_build_object(
        'amount', value.amount,
        'known_amount', null,
        'status', case when value.amount is null then 'unavailable' else 'complete' end,
        'display_mode', case when value.amount is null then null else 'total' end
      ) order by core.position) as values_json,
      count(value.amount) as observed_count
    from context
    cross join (values
      ('energy_kcal', 1), ('carbohydrate_g', 2), ('protein_g', 3),
      ('fat_g', 4), ('sodium_mg', 5)
    ) core(code, position)
    left join public.nutrition_values value
      on value.profile_id = context.profile_id and value.nutrient_code = core.code
    group by context.id
  ), optional_values as (
    select context.id,
      jsonb_object_agg(value.nutrient_code, jsonb_build_object(
        'amount', value.amount,
        'known_amount', null,
        'status', 'complete',
        'display_mode', 'total'
      ) order by definition.display_order) as values_json
    from context
    join public.nutrition_values value on value.profile_id = context.profile_id
    join public.nutrient_definitions definition on definition.code = value.nutrient_code
    where not definition.is_core
      and value.value_status = 'observed'
      and value.amount is not null
    group by context.id
  ), source_projection as (
    select context.id,
      jsonb_build_array(jsonb_build_object(
        'provider', source.provider_code,
        'dataset', source.dataset_name,
        'source_version', source.source_version,
        'data_basis_date', source.data_basis_date,
        'license', source.license_name,
        'source_url', source.source_url
      )) as sources_json
    from context
    join public.nutrition_source_items item on item.id = context.source_item_id
    join public.nutrition_sources source on source.id = item.source_id
    where context.source_type = 'public_dataset'
      and item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ), payloads as (
    select context.id, context.partition_rank, context.listed_created_at,
      jsonb_build_object(
        'id', context.id,
        'name', context.name,
        'brand', context.brand,
        'visibility', context.visibility,
        'source_type', context.source_type,
        'editable', context.source_type = 'manual'
          and context.owner_user_id = p_user_id
          and context.moderation_status = 'visible',
        'nutrition_version_id', context.nutrition_version_id,
        'basis_relations', context.basis_relations_json,
        'nutrition', jsonb_build_object(
          'basis', jsonb_build_object('amount', context.basis_amount, 'unit', context.basis_unit),
          'label_basis_text', context.label_basis_text,
          'values', core.values_json || coalesce(optional.values_json, '{}'::jsonb),
          'calculation_status', case
            when core.observed_count = 5 then 'complete'
            when core.observed_count > 0 then 'partial'
            else 'unavailable'
          end,
          'calculation_quality', case when core.observed_count > 0 then 'direct' else null end,
          'warnings', '[]'::jsonb,
          'sources', case when context.source_type = 'manual'
            then jsonb_build_array(jsonb_build_object(
              'provider', 'user_label', 'dataset', null, 'source_version', null,
              'data_basis_date', null, 'license', null, 'source_url', null
            ))
            else coalesce(source.sources_json, '[]'::jsonb)
          end
        )
      ) as payload
    from context
    join core_values core on core.id = context.id
    left join optional_values optional on optional.id = context.id
    left join source_projection source on source.id = context.id
  )
  select
    coalesce((
      select jsonb_agg(payload order by partition_rank asc, listed_created_at desc, id desc)
      from payloads
    ), '[]'::jsonb),
    (select count(*) > p_limit from eligible),
    (select created_at from page order by partition_rank desc, created_at asc, id asc limit 1),
    (select id from page order by partition_rank desc, created_at asc, id asc limit 1)
  into v_items, v_has_next, v_last_created_at, v_last_id;

  if v_has_next then
    v_cursor := translate(rtrim(regexp_replace(encode(convert_to(
      jsonb_build_object(
        'created_at', to_char(v_last_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'id', v_last_id
      )::text,
      'UTF8'
    ), 'base64'), E'\\s', '', 'g'), '='), '+/', '-_');
  end if;
  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_has_next then v_cursor else null end,
    'has_next', v_has_next
  );
end;
$$;

create or replace function public.list_food_products(
  p_user_id uuid,
  p_query text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.list_food_products(
    p_user_id, p_query, 'all', p_cursor_created_at, p_cursor_id, p_limit
  )
$$;
