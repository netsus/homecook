create function public.protect_public_prepared_food_catalog_import_run_registry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source = 'public-prepared-food-catalog-import' then
    raise exception 'IMMUTABLE_PUBLIC_PREPARED_FOOD_IMPORT_RUN';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_public_prepared_food_catalog_import_run_registry
before update or delete on public.operational_events
for each row execute function public.protect_public_prepared_food_catalog_import_run_registry();

create function public.get_public_prepared_food_catalog_import_run(p_run_identifier text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, extensions, public
stable
as $$
  select registry.metadata_json
  from (
    (
      select event.metadata_json, 1 as lookup_priority
      from public.operational_events event
      where event.source = 'public-prepared-food-catalog-import'
        and event.metadata_json ->> 'idempotency_key' = p_run_identifier
      limit 1
    )
    union all
    (
      select event.metadata_json, 2 as lookup_priority
      from public.operational_events event
      where event.source = 'public-prepared-food-catalog-import'
        and event.metadata_json ->> 'run_id' = p_run_identifier
      limit 1
    )
  ) registry
  where registry.metadata_json ->> 'registry_checksum' = encode(
    extensions.digest((registry.metadata_json - 'registry_checksum')::text, 'sha256'),
    'hex'
  )
  order by registry.lookup_priority
  limit 1
$$;

create function public.prepared_food_catalog_import_item_digest(p_item jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions, public
as $$
  select encode(
    extensions.digest(
      concat_ws(E'\x1d',
        coalesce(p_item ->> 'external_item_key', ''),
        coalesce(p_item ->> 'external_name', ''),
        coalesce(p_item ->> 'manufacturer_name', ''),
        coalesce(p_item ->> 'distributor_name', ''),
        coalesce(p_item ->> 'importer_name', ''),
        coalesce(p_item -> 'basis' ->> 'amount', ''),
        coalesce(p_item -> 'basis' ->> 'unit', ''),
        coalesce(p_item -> 'basis' ->> 'source_text', ''),
        coalesce(p_item ->> 'label_basis_text', ''),
        coalesce(p_item ->> 'source_serving_text', ''),
        coalesce(p_item ->> 'source_food_size_text', ''),
        coalesce((
          select string_agg(
            concat_ws(E'\x1f',
              value.key,
              coalesce(value.value ->> 'amount', ''),
              coalesce(value.value ->> 'source_nutrient_code', ''),
              coalesce(value.value ->> 'source_unit', ''),
              coalesce(value.value ->> 'value_status', ''),
              coalesce(value.value ->> 'source_token', '')
            ),
            E'\x1e'
            order by value.key
          )
          from jsonb_each(coalesce(p_item -> 'values', '{}'::jsonb)) value
        ), '')
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create function public.apply_public_prepared_food_catalog_import(p_import jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_actor uuid := nullif(p_import ->> 'actor_user_id', '')::uuid;
  v_run_id text := nullif(btrim(p_import ->> 'run_id'), '');
  v_idempotency_key text := nullif(btrim(p_import ->> 'idempotency_key'), '');
  v_bundle jsonb := p_import -> 'bundle';
  v_manifest jsonb := v_bundle -> 'approved_manifest';
  v_counts jsonb := v_manifest -> 'counts';
  v_scope text := nullif(btrim(v_manifest -> 'query' ->> 'scope'), '');
  v_checkpoint jsonb := v_manifest -> 'query' -> 'approval_checkpoint';
  v_approved_row_count integer := nullif(v_checkpoint ->> 'approved_row_count', '')::integer;
  v_valid_row_count integer := nullif(v_checkpoint ->> 'valid_row_count', '')::integer;
  v_selection_mode text := nullif(btrim(v_checkpoint ->> 'selection_mode'), '');
  v_count_fetched integer := nullif(v_counts ->> 'fetched_raw_count', '')::integer;
  v_count_unique integer := nullif(v_counts ->> 'unique_input_count', '')::integer;
  v_count_normalized integer := nullif(v_counts ->> 'normalized_count', '')::integer;
  v_count_deduplicated integer := nullif(v_counts ->> 'deduplicated_identical_count', '')::integer;
  v_count_quarantined integer := nullif(v_counts ->> 'quarantined_count', '')::integer;
  v_registry jsonb;
  v_result jsonb;
  v_registry_metadata jsonb;
  v_source_id uuid;
  v_product_id uuid;
  v_profile_id uuid;
  v_version_id uuid;
  v_source_item_id uuid;
  v_item jsonb;
  v_value jsonb;
  v_values record;
  v_next_version integer;
  v_brand text;
  v_existing_product public.food_products%rowtype;
  v_previous_source_count integer := 0;
  v_version_updates integer := 0;
  v_writes integer := 0;
  v_item_count integer := 0;
  v_sorted_item_digests text[] := '{}'::text[];
  v_item_digests_valid boolean := false;
  v_items_from_array boolean := false;
  v_staged_items_table regclass;
  v_approved_fingerprint_checksum text;
  v_normalized_content_hash text;
  v_source_payload_identity text;
  v_content_hash text;
  v_product_count integer := 0;
  v_source_ids jsonb := '[]'::jsonb;
begin
  v_items_from_array := jsonb_typeof(v_bundle -> 'approved_items') = 'array';
  v_staged_items_table := to_regclass('pg_temp.homecook_prepared_food_import_items');
  if v_actor is null
    or not exists (select 1 from public.users where id = v_actor)
    or v_run_id is null
    or v_idempotency_key is null
    or jsonb_typeof(v_bundle) <> 'object'
    or v_bundle ->> 'schema_version' <> 'public-prepared-food-catalog-import-v1'
    or v_bundle ->> 'handoff_schema_checksum' <>
      'e115c54746221b76356748ea6dcb3bd9d4c1461c3854454d53a3371813079b61'
    or v_bundle ->> 'status' <> 'approved_pinned'
    or (v_bundle ->> 'production_db_writes')::integer <> 0
    or coalesce(v_bundle -> 'lifecycle', 'null'::jsonb) <> '["raw", "normalized", "reviewed", "approved_pinned"]'::jsonb
    or jsonb_typeof(v_manifest) <> 'object'
    or v_manifest ->> 'source_id' <> 'data-go-kr-15100066'
    or v_manifest ->> 'dataset_id' <> '15100066'
    or nullif(btrim(v_manifest ->> 'provider'), '') is null
    or nullif(btrim(v_manifest ->> 'dataset'), '') is null
    or nullif(btrim(v_manifest ->> 'source_version'), '') is null
    or nullif(btrim(v_manifest ->> 'license'), '') is null
    or v_manifest ->> 'license' not in ('이용허락범위 제한 없음', 'public-open-data')
    or nullif(btrim(v_manifest ->> 'endpoint_or_file_url'), '') is null
    or nullif(btrim(v_manifest ->> 'raw_sha256'), '') is null
    or v_manifest ->> 'raw_sha256' <> v_bundle ->> 'raw_sha256'
    or nullif(btrim(v_manifest ->> 'schema_fingerprint'), '') is null
    or v_manifest ->> 'schema_fingerprint' <> v_bundle ->> 'schema_fingerprint'
    or jsonb_typeof(v_counts) <> 'object'
    or v_count_fetched is null
    or v_count_unique is null
    or v_count_normalized is null
    or v_count_deduplicated is null
    or v_count_quarantined is null
  then
    raise exception 'INVALID_IMPORT_BUNDLE';
  end if;
  if v_items_from_array then
    if jsonb_array_length(v_bundle -> 'approved_items') = 0
      or v_staged_items_table is not null
    then
      raise exception 'INVALID_IMPORT_BUNDLE';
    end if;
    execute 'create temporary table homecook_prepared_food_import_items (item jsonb) on commit drop';
    insert into pg_temp.homecook_prepared_food_import_items(item)
    select value
    from jsonb_array_elements(v_bundle -> 'approved_items');
    v_staged_items_table := to_regclass('pg_temp.homecook_prepared_food_import_items');
  elsif v_staged_items_table is null
    or not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid = relation.oid
       and attribute.attname = 'item'
       and attribute.atttypid = 'jsonb'::regtype
       and attribute.attnum > 0
       and not attribute.attisdropped
      where relation.oid = v_staged_items_table
        and relation.relkind = 'r'
    )
  then
    raise exception 'INVALID_IMPORT_BUNDLE';
  end if;
  select
    count(*)::integer,
    coalesce(array_agg(digest_value order by digest_value), '{}'::text[]),
    coalesce(bool_and(
      item ->> 'stable_fingerprint' = digest_value
      and item ->> 'fingerprint' = digest_value
      and item ->> 'content_hash' = digest_value
    ), false)
  into v_item_count, v_sorted_item_digests, v_item_digests_valid
  from (
    select
      item,
      public.prepared_food_catalog_import_item_digest(item) as digest_value
    from pg_temp.homecook_prepared_food_import_items
  ) digested_items;
  if v_item_count = 0 or not v_item_digests_valid then
    raise exception 'INVALID_IMPORT_BUNDLE';
  end if;
  v_approved_fingerprint_checksum := encode(
    extensions.digest(coalesce(array_to_string(v_sorted_item_digests, E'\x1e'), ''), 'sha256'),
    'hex'
  );
  v_normalized_content_hash := encode(
    extensions.digest(
      concat_ws(E'\x1d',
        v_count_fetched::text,
        v_count_unique::text,
        v_count_normalized::text,
        v_count_deduplicated::text,
        v_count_quarantined::text,
        coalesce(array_to_string(v_sorted_item_digests, E'\x1e'), '')
      ),
      'sha256'
    ),
    'hex'
  );
  v_source_payload_identity := encode(
    extensions.digest(
      concat_ws(E'\x1d',
        coalesce(v_manifest ->> 'provider', ''),
        coalesce(v_manifest ->> 'dataset', ''),
        coalesce(v_manifest ->> 'source_version', ''),
        coalesce(v_manifest ->> 'endpoint_or_file_url', ''),
        v_normalized_content_hash
      ),
      'sha256'
    ),
    'hex'
  );
  v_content_hash := encode(
    extensions.digest(
      concat_ws(E'\x1d',
        v_source_payload_identity,
        v_normalized_content_hash,
        v_approved_fingerprint_checksum
      ),
      'sha256'
    ),
    'hex'
  );
  if v_count_quarantined < 0
    or v_count_normalized <> v_item_count
    or v_count_unique <> v_count_normalized + v_count_quarantined
    or v_count_fetched <> v_count_unique + v_count_deduplicated
    or v_bundle ->> 'approved_fingerprint_checksum' <> v_approved_fingerprint_checksum
    or v_bundle ->> 'review_checksum' <> v_approved_fingerprint_checksum
    or v_bundle ->> 'normalized_content_hash' <> v_normalized_content_hash
    or v_bundle ->> 'source_payload_identity' <> v_source_payload_identity
    or v_bundle ->> 'content_hash' <> v_content_hash
  then
    raise exception 'INVALID_IMPORT_BUNDLE';
  end if;
  if jsonb_typeof(v_checkpoint) <> 'object'
    or v_scope not in ('pilot', 'full')
    or v_approved_row_count is null
    or v_approved_row_count <> v_item_count
    or nullif(btrim(v_checkpoint ->> 'approved_at'), '') is null
  then
    raise exception 'CHECKPOINT_MISMATCH';
  end if;
  if v_bundle ->> 'normalized_content_hash' <> v_checkpoint ->> 'target_fingerprint' then
    raise exception 'TARGET_FINGERPRINT_MISMATCH';
  end if;
  if v_scope = 'pilot' then
    if v_selection_mode <> 'pilot-min-10000' or v_approved_row_count < 10000 then
      raise exception 'CHECKPOINT_MISMATCH';
    end if;
  elsif v_selection_mode <> 'all-valid'
    or v_valid_row_count is null
    or v_valid_row_count <> v_approved_row_count
    or v_valid_row_count <> v_count_normalized
  then
    raise exception 'CHECKPOINT_MISMATCH';
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'public-prepared-food-catalog-import'
    and event_type = 'public_prepared_food_catalog_import_applied'
    and metadata_json ->> 'idempotency_key' = v_idempotency_key
  order by created_at desc
  limit 1;
  if v_registry is not null then
    return (v_registry - 'registry_checksum') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true);
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'public-prepared-food-catalog-import'
    and event_type = 'public_prepared_food_catalog_import_applied'
    and metadata_json ->> 'content_hash' = v_bundle ->> 'content_hash'
  order by created_at desc
  limit 1;
  if v_registry is not null then
    return (v_registry - 'registry_checksum') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true);
  end if;

  update public.nutrition_sources source
  set review_status = 'superseded',
      freshness_status = 'stale',
      is_active = false,
      decision_reason = 'superseded by public prepared food catalog import',
      reviewed_by = v_actor,
      reviewed_at = now()
  where source.provider_code = v_manifest ->> 'provider'
    and source.dataset_name = v_manifest ->> 'dataset'
    and source.is_active;
  get diagnostics v_previous_source_count = row_count;
  v_writes := v_writes + v_previous_source_count;

  insert into public.nutrition_sources (
    id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank, source_url,
    license_name, license_url, manifest_sha256, review_status, decision_reason,
    reviewed_by, reviewed_at, is_active
  ) values (
    gen_random_uuid(),
    v_manifest ->> 'provider',
    v_manifest ->> 'dataset',
    'nutrition_dataset',
    v_manifest ->> 'source_version',
    nullif(v_manifest ->> 'data_basis_date', '')::date,
    now(),
    now(),
    'current',
    1,
    v_manifest ->> 'endpoint_or_file_url',
    v_manifest ->> 'license',
    nullif(v_manifest ->> 'license_url', ''),
    v_manifest ->> 'raw_sha256',
    'approved',
    'public prepared food import',
    v_actor,
    now(),
    true
  ) returning id into v_source_id;
  v_source_ids := v_source_ids || to_jsonb(v_source_id);
  v_writes := v_writes + 1;

  for v_item in
    select item
    from pg_temp.homecook_prepared_food_import_items
  loop
    if nullif(btrim(v_item ->> 'external_item_key'), '') is null
      or nullif(btrim(v_item ->> 'external_name'), '') is null
      or jsonb_typeof(v_item -> 'basis') <> 'object'
      or (v_item -> 'basis' ->> 'amount')::numeric <> 100
      or lower(v_item -> 'basis' ->> 'unit') not in ('g', 'ml')
      or jsonb_typeof(v_item -> 'values') <> 'object'
      or exists (
        select 1
        from (values
          ('energy_kcal'),
          ('carbohydrate_g'),
          ('protein_g'),
          ('fat_g'),
          ('sodium_mg')
        ) required(code)
        where jsonb_typeof(v_item -> 'values' -> required.code) <> 'object'
          or (v_item -> 'values' -> required.code ->> 'amount') is null
      )
    then
      raise exception 'INVALID_IMPORT_BUNDLE';
    end if;

    insert into public.nutrition_source_items (
      id, source_id, external_item_key, external_name, source_basis_text,
      source_basis_amount, source_basis_unit, source_serving_text,
      source_total_content_text, stable_fingerprint, review_status, decision_reason,
      reviewed_by, reviewed_at, provenance_json
    ) values (
      gen_random_uuid(),
      v_source_id,
      v_item ->> 'external_item_key',
      v_item ->> 'external_name',
      v_item -> 'basis' ->> 'source_text',
      (v_item -> 'basis' ->> 'amount')::numeric,
      lower(v_item -> 'basis' ->> 'unit'),
      nullif(v_item ->> 'source_serving_text', ''),
      nullif(v_item ->> 'source_food_size_text', ''),
      coalesce(nullif(v_item ->> 'stable_fingerprint', ''), nullif(v_item ->> 'fingerprint', '')),
      'approved',
      'public prepared food import',
      v_actor,
      now(),
      jsonb_build_object(
        'content_hash', v_item ->> 'content_hash',
        'source_payload_identity', v_bundle ->> 'source_payload_identity'
      )
    ) returning id into v_source_item_id;
    v_writes := v_writes + 1;

    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      gen_random_uuid(),
      v_source_item_id,
      'product_label',
      'as_labeled',
      (v_item -> 'basis' ->> 'amount')::numeric,
      lower(v_item -> 'basis' ->> 'unit'),
      1,
      'approved',
      'public prepared food import',
      v_actor,
      now(),
      true
    ) returning id into v_profile_id;
    v_writes := v_writes + 1;

    for v_values in
      select key, value
      from jsonb_each(v_item -> 'values')
    loop
      v_value := v_values.value;
      if v_value ->> 'amount' is null or v_value -> 'amount' = 'null'::jsonb then
        continue;
      end if;
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_nutrient_code, source_unit, amount,
        value_status, source_token
      ) values (
        v_profile_id,
        v_values.key,
        nullif(v_value ->> 'source_nutrient_code', ''),
        nullif(v_value ->> 'source_unit', ''),
        (v_value ->> 'amount')::numeric,
        coalesce(nullif(v_value ->> 'value_status', ''), 'observed'),
        nullif(v_value ->> 'source_token', '')
      );
      v_writes := v_writes + 1;
    end loop;

    select * into v_existing_product
    from public.food_products
    where source_type = 'public_dataset'
      and external_product_key = v_item ->> 'external_item_key'
    for update;

    v_brand := coalesce(
      nullif(btrim(v_item ->> 'distributor_name'), ''),
      nullif(btrim(v_item ->> 'importer_name'), ''),
      nullif(btrim(v_item ->> 'manufacturer_name'), '')
    );

    if v_existing_product.id is null then
      v_product_id := gen_random_uuid();
      v_version_id := gen_random_uuid();
      set constraints food_products_current_version_fk deferred;
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, name, brand,
        external_product_key, current_nutrition_version_id
      ) values (
        v_product_id, null, 'public', 'public_dataset',
        v_item ->> 'external_name',
        v_brand,
        v_item ->> 'external_item_key',
        v_version_id
      );
      v_writes := v_writes + 1;
    else
      v_product_id := v_existing_product.id;
      v_version_id := gen_random_uuid();
      select coalesce(max(version), 0) + 1 into v_next_version
      from public.food_product_nutrition_versions
      where product_id = v_product_id;
      update public.food_products
      set name = v_item ->> 'external_name',
          brand = v_brand,
          current_nutrition_version_id = v_version_id,
          updated_at = now()
      where id = v_product_id;
      v_writes := v_writes + 1;
      v_version_updates := v_version_updates + 1;
    end if;

    if v_existing_product.id is null then
      v_next_version := 1;
    end if;
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, label_basis_text,
      basis_relations_json, source_item_id, created_by
    ) values (
      v_version_id,
      v_product_id,
      v_profile_id,
      v_next_version,
      nullif(v_item ->> 'label_basis_text', ''),
      '[]'::jsonb,
      v_source_item_id,
      null
    );
    v_writes := v_writes + 1;
    v_product_count := v_product_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'source', 'public-prepared-food-catalog-import',
    'status', 'applied',
    'run_id', v_run_id,
    'idempotency_key', v_idempotency_key,
    'source_payload_identity', coalesce(v_bundle ->> 'source_payload_identity', ''),
    'content_hash', coalesce(v_bundle ->> 'content_hash', ''),
    'source_item_count', v_item_count,
    'product_count', v_product_count,
    'version_updates', v_version_updates,
    'affected_source_ids', v_source_ids,
    'writes_committed', v_writes + 1,
    'replayed', false,
    'production_db_writes', 0,
    'secret_leak_count', 0
  );
  v_registry_metadata := v_result || jsonb_build_object(
    'actor_user_id', v_actor::text
  );
  v_registry_metadata := v_registry_metadata || jsonb_build_object(
    'registry_checksum', encode(extensions.digest(v_registry_metadata::text, 'sha256'), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'public_prepared_food_catalog_import_applied',
    'info',
    'public-prepared-food-catalog-import',
    v_actor,
    'public prepared food catalog import apply registry',
    v_registry_metadata
  );
  return v_result;
end;
$$;

create function public.disable_public_prepared_food_catalog_import(
  p_model_run_key text,
  p_disable_key text,
  p_actor uuid,
  p_reason text,
  p_reviewed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_registry jsonb;
  v_result jsonb;
  v_disable_registry jsonb;
  v_source_id uuid;
  v_sources_disabled integer := 0;
  v_row_count integer := 0;
begin
  select metadata_json into v_registry
  from public.operational_events
  where source = 'public-prepared-food-catalog-import'
    and event_type = 'public_prepared_food_catalog_import_disabled'
    and metadata_json ->> 'idempotency_key' = p_disable_key
  order by created_at desc
  limit 1;
  if v_registry is not null then
    return (v_registry - 'registry_checksum') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true);
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'public-prepared-food-catalog-import'
    and event_type = 'public_prepared_food_catalog_import_applied'
    and (
      metadata_json ->> 'idempotency_key' = p_model_run_key
      or metadata_json ->> 'run_id' = p_model_run_key
    )
  order by created_at desc
  limit 1;

  if nullif(btrim(p_disable_key), '') is null
    or nullif(btrim(p_model_run_key), '') is null
    or p_actor is null
    or not exists (select 1 from public.users where id = p_actor)
    or nullif(btrim(p_reason), '') is null
    or p_reviewed_at is null
    or v_registry is null
  then
    raise exception 'INVALID_DISABLE_DECISION';
  end if;

  for v_source_id in
    select value::uuid
    from jsonb_array_elements_text(coalesce(v_registry -> 'affected_source_ids', '[]'::jsonb))
  loop
    update public.nutrition_sources
    set review_status = 'superseded',
        freshness_status = 'stale',
        is_active = false,
        decision_reason = p_reason,
        reviewed_by = p_actor,
        reviewed_at = p_reviewed_at
    where id = v_source_id
      and is_active;
    get diagnostics v_row_count = row_count;
    v_sources_disabled := v_sources_disabled + v_row_count;
  end loop;

  v_result := jsonb_build_object(
    'source', 'public-prepared-food-catalog-import',
    'status', 'disabled',
    'run_id', 'disable-' || left(p_disable_key, 24),
    'idempotency_key', p_disable_key,
    'model_run_key', p_model_run_key,
    'writes_committed', v_sources_disabled + 1,
    'replayed', false,
    'payload_deleted', 0,
    'production_db_writes', 0,
    'secret_leak_count', 0
  );
  v_disable_registry := v_result || jsonb_build_object(
    'actor_user_id', p_actor::text
  );
  v_disable_registry := v_disable_registry || jsonb_build_object(
    'registry_checksum', encode(extensions.digest(v_disable_registry::text, 'sha256'), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'public_prepared_food_catalog_import_disabled',
    'info',
    'public-prepared-food-catalog-import',
    p_actor,
    'public prepared food catalog import disable registry',
    v_disable_registry
  );
  return v_result;
end;
$$;

revoke all on function public.protect_public_prepared_food_catalog_import_run_registry()
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_prepared_food_catalog_import_run(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_prepared_food_catalog_import_run(text)
  to service_role;
revoke all on function public.apply_public_prepared_food_catalog_import(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_public_prepared_food_catalog_import(jsonb)
  to service_role;
revoke all on function public.disable_public_prepared_food_catalog_import(text, text, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.disable_public_prepared_food_catalog_import(text, text, uuid, text, timestamptz)
  to service_role;
