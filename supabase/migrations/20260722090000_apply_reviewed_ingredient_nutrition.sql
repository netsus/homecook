create or replace function public.apply_reviewed_ingredient_nutrition(p_patch jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, extensions, public
as $$
declare
  v_actor uuid;
  v_reviewed_at timestamptz;
  v_reason text;
  v_payload_checksum text;
  v_existing_event jsonb;
  v_entry jsonb;
  v_source jsonb;
  v_source_item jsonb;
  v_basis jsonb;
  v_value jsonb;
  v_nutrient_code text;
  v_value_status text;
  v_source_id uuid;
  v_source_item_id uuid;
  v_profile_id uuid;
  v_previous_link_id uuid;
  v_new_link_id uuid;
  v_ingredient_id uuid;
  v_ingredient_name text;
  v_next_version integer;
  v_entry_count integer;
  v_unique_ingredient_count integer;
  v_value_count integer;
  v_known_value_count integer;
  v_writes integer := 0;
  v_superseded_count integer := 0;
  v_source_ids uuid[] := '{}'::uuid[];
  v_link_ids uuid[] := '{}'::uuid[];
  v_result jsonb;
  v_metadata jsonb;
begin
  if coalesce(p_patch ->> 'schema_version', '') <> 'homecook-nutrition-review-apply-v1'
    or coalesce(jsonb_typeof(p_patch -> 'entries'), '') <> 'array'
    or coalesce(p_patch ->> 'payload_checksum', '') !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_patch ->> 'reviewed_by'), '') is null
    or nullif(btrim(p_patch ->> 'reviewed_at'), '') is null
    or nullif(btrim(p_patch ->> 'decision_reason'), '') is null
  then
    raise exception 'INVALID_NUTRITION_REVIEW_PATCH';
  end if;

  begin
    v_actor := (p_patch ->> 'reviewed_by')::uuid;
    v_reviewed_at := (p_patch ->> 'reviewed_at')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'INVALID_NUTRITION_REVIEW_PATCH';
  end;
  v_reason := p_patch ->> 'decision_reason';
  v_payload_checksum := p_patch ->> 'payload_checksum';

  if not exists (select 1 from public.users where id = v_actor) then
    raise exception 'INVALID_NUTRITION_REVIEW_ACTOR';
  end if;

  select metadata_json into v_existing_event
  from public.operational_events
  where event_type = 'ingredient_nutrition_review_applied'
    and source = 'ingredient-nutrition-review'
    and metadata_json ->> 'payload_checksum' = v_payload_checksum
  order by created_at desc
  limit 1;
  if v_existing_event is not null then
    return (v_existing_event -> 'result') || jsonb_build_object(
      'writes_committed', 0,
      'replayed', true
    );
  end if;

  select count(*), count(distinct value ->> 'ingredient_id')
  into v_entry_count, v_unique_ingredient_count
  from jsonb_array_elements(p_patch -> 'entries');
  if v_entry_count <= 0 or v_entry_count <> v_unique_ingredient_count then
    raise exception 'INVALID_NUTRITION_REVIEW_PATCH';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_patch -> 'entries')
    order by value ->> 'ingredient_id'
  loop
    v_source := v_entry -> 'source';
    v_source_item := v_entry -> 'source_item';
    v_basis := v_entry -> 'basis';
    begin
      v_ingredient_id := (v_entry ->> 'ingredient_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_NUTRITION_REVIEW_ENTRY';
    end;
    select standard_name into v_ingredient_name
    from public.ingredients
    where id = v_ingredient_id;

    select count(*), count(*) filter (
      where key in (
        'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g',
        'saturated_fat_g', 'sugars_g', 'fiber_g', 'sodium_mg'
      )
    )
    into v_value_count, v_known_value_count
    from jsonb_each(coalesce(v_entry -> 'values', '{}'::jsonb));

    if v_ingredient_name is null
      or v_ingredient_name is distinct from v_entry ->> 'ingredient_name'
      or coalesce(v_entry ->> 'preparation_state', '') <> 'as_published'
      or coalesce(v_entry ->> 'resolution_kind', '') not in ('official_candidate', 'manual_source')
      or nullif(btrim(v_entry ->> 'decision_reason'), '') is null
      or coalesce(jsonb_typeof(v_source), '') <> 'object'
      or coalesce(jsonb_typeof(v_source_item), '') <> 'object'
      or coalesce(jsonb_typeof(v_basis), '') <> 'object'
      or coalesce(jsonb_typeof(v_entry -> 'values'), '') <> 'object'
      or (v_basis ->> 'amount')::numeric <> 100
      or coalesce(v_basis ->> 'unit', '') not in ('g', 'ml')
      or nullif(btrim(v_source ->> 'provider_code'), '') is null
      or nullif(btrim(v_source ->> 'dataset_name'), '') is null
      or nullif(btrim(v_source ->> 'source_version'), '') is null
      or nullif(btrim(v_source ->> 'source_url'), '') is null
      or nullif(btrim(v_source ->> 'license_name'), '') is null
      or coalesce(v_source ->> 'manifest_sha256', '') !~ '^[0-9a-f]{64}$'
      or coalesce((v_source ->> 'priority_rank')::integer, 0) <= 0
      or nullif(btrim(v_source_item ->> 'external_item_key'), '') is null
      or nullif(btrim(v_source_item ->> 'external_name'), '') is null
      or nullif(btrim(v_source_item ->> 'source_basis_text'), '') is null
      or nullif(btrim(v_source_item ->> 'edible_portion_text'), '') is null
      or coalesce(v_source_item ->> 'stable_fingerprint', '') !~ '^[0-9a-f]{64}$'
      or coalesce(v_source_item ->> 'content_hash', '') !~ '^[0-9a-f]{64}$'
      or v_value_count <> 8
      or v_known_value_count <> 8
    then
      raise exception 'INVALID_NUTRITION_REVIEW_ENTRY';
    end if;

    v_source_id := null;
    select id into v_source_id
    from public.nutrition_sources
    where provider_code = v_source ->> 'provider_code'
      and dataset_name = v_source ->> 'dataset_name'
      and source_version = v_source ->> 'source_version'
      and manifest_sha256 = v_source ->> 'manifest_sha256';
    if v_source_id is null and exists (
      select 1 from public.nutrition_sources
      where provider_code = v_source ->> 'provider_code'
        and dataset_name = v_source ->> 'dataset_name'
        and is_active
    ) then
      raise exception 'NUTRITION_REVIEW_SOURCE_DRIFT';
    end if;
    if v_source_id is null then
      insert into public.nutrition_sources (
        provider_code, dataset_name, source_kind, source_version, data_basis_date,
        fetched_at, freshness_checked_at, freshness_status, priority_rank,
        source_url, license_name, license_url, manifest_sha256, review_status,
        decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        v_source ->> 'provider_code', v_source ->> 'dataset_name',
        'nutrition_dataset', v_source ->> 'source_version',
        nullif(v_source ->> 'data_basis_date', '')::date,
        v_reviewed_at, v_reviewed_at, 'current',
        (v_source ->> 'priority_rank')::smallint,
        v_source ->> 'source_url', v_source ->> 'license_name',
        nullif(v_source ->> 'license_url', ''), v_source ->> 'manifest_sha256',
        'approved', v_reason, v_actor, v_reviewed_at, true
      ) returning id into v_source_id;
      v_writes := v_writes + 1;
    elsif not exists (
      select 1 from public.nutrition_sources
      where id = v_source_id
        and freshness_status = 'current'
        and review_status = 'approved'
        and is_active
    ) then
      raise exception 'NUTRITION_REVIEW_SOURCE_NOT_CURRENT';
    end if;
    if not v_source_id = any(v_source_ids) then
      v_source_ids := array_append(v_source_ids, v_source_id);
    end if;

    v_source_item_id := null;
    select id into v_source_item_id
    from public.nutrition_source_items
    where source_id = v_source_id
      and external_item_key = v_source_item ->> 'external_item_key'
      and stable_fingerprint = v_source_item ->> 'stable_fingerprint';
    if v_source_item_id is null then
      insert into public.nutrition_source_items (
        source_id, external_item_key, external_name, preparation_state,
        source_basis_text, source_basis_amount, source_basis_unit,
        edible_portion_text, stable_fingerprint, review_status, decision_reason,
        reviewed_by, reviewed_at, provenance_json
      ) values (
        v_source_id, v_source_item ->> 'external_item_key',
        v_source_item ->> 'external_name', v_entry ->> 'preparation_state',
        v_source_item ->> 'source_basis_text', 100, v_basis ->> 'unit',
        v_source_item ->> 'edible_portion_text',
        v_source_item ->> 'stable_fingerprint', 'approved',
        v_entry ->> 'decision_reason', v_actor, v_reviewed_at,
        coalesce(v_source_item -> 'provenance', '{}'::jsonb) || jsonb_build_object(
          'content_hash', v_source_item ->> 'content_hash',
          'review_payload_checksum', v_payload_checksum,
          'resolution_kind', v_entry ->> 'resolution_kind'
        )
      ) returning id into v_source_item_id;
      v_writes := v_writes + 1;
    end if;

    v_profile_id := null;
    select id into v_profile_id
    from public.nutrition_profiles
    where source_item_id = v_source_item_id
      and profile_kind = 'ingredient_source'
      and review_status = 'approved'
      and is_active;
    if v_profile_id is null then
      insert into public.nutrition_profiles (
        source_item_id, profile_kind, normalization_method, basis_amount,
        basis_unit, version, review_status, decision_reason, reviewed_by,
        reviewed_at, is_active
      ) values (
        v_source_item_id, 'ingredient_source',
        case when v_basis ->> 'unit' = 'g' then 'mass_100g' else 'volume_100ml' end,
        100, v_basis ->> 'unit', 1, 'approved',
        v_entry ->> 'decision_reason', v_actor, v_reviewed_at, true
      ) returning id into v_profile_id;
      v_writes := v_writes + 1;

      for v_nutrient_code, v_value in
        select key, value from jsonb_each(v_entry -> 'values') order by key
      loop
        if jsonb_typeof(v_value) <> 'object'
          or nullif(btrim(v_value ->> 'source_nutrient_code'), '') is null
          or coalesce(v_value ->> 'unit', '') not in ('kcal', 'g', 'mg')
          or (
            v_value ->> 'amount' is not null
            and (v_value ->> 'amount')::numeric < 0
          )
        then
          raise exception 'INVALID_NUTRITION_REVIEW_VALUE';
        end if;
        v_value_status := case
          when v_value ->> 'amount' is not null then 'observed'
          when v_value ->> 'missing_reason' = 'trace' then 'trace'
          when v_value ->> 'missing_reason' in ('malformed', 'parse_error') then 'parse_error'
          else 'missing'
        end;
        insert into public.nutrition_values (
          profile_id, nutrient_code, source_nutrient_code, source_unit,
          amount, value_status, source_token
        ) values (
          v_profile_id, v_nutrient_code, v_value ->> 'source_nutrient_code',
          v_value ->> 'unit',
          case when v_value_status = 'observed'
            then (v_value ->> 'amount')::numeric else null end,
          v_value_status, coalesce(v_value ->> 'source_token', '')
        );
        v_writes := v_writes + 1;
      end loop;
    end if;

    if lower(btrim(v_source_item ->> 'external_name')) <> lower(btrim(v_ingredient_name)) then
      insert into public.ingredient_synonyms (ingredient_id, synonym)
      values (v_ingredient_id, v_source_item ->> 'external_name')
      on conflict (ingredient_id, synonym) do nothing;
      get diagnostics v_value_count = row_count;
      v_writes := v_writes + v_value_count;
    end if;

    v_previous_link_id := null;
    select id into v_previous_link_id
    from public.ingredient_nutrition_profiles
    where ingredient_id = v_ingredient_id
      and preparation_state = v_entry ->> 'preparation_state'
      and review_status = 'approved'
      and is_active
      and is_primary
    for update;
    if v_previous_link_id is not null and exists (
      select 1
      from public.ingredient_nutrition_profiles
      where id = v_previous_link_id
        and nutrition_profile_id = v_profile_id
    ) then
      v_link_ids := array_append(v_link_ids, v_previous_link_id);
      continue;
    end if;
    select coalesce(max(version), 0) + 1 into v_next_version
    from public.ingredient_nutrition_profiles
    where ingredient_id = v_ingredient_id
      and preparation_state = v_entry ->> 'preparation_state';

    insert into public.ingredient_nutrition_profiles (
      ingredient_id, nutrition_profile_id, preparation_state, match_method,
      confidence_score, candidate_rank, is_primary, review_status,
      decision_reason, reviewed_by, reviewed_at, version, is_active
    ) values (
      v_ingredient_id, v_profile_id, v_entry ->> 'preparation_state', 'manual',
      1, (v_source ->> 'priority_rank')::integer,
      v_previous_link_id is null,
      case when v_previous_link_id is null then 'approved' else 'pending' end,
      v_entry ->> 'decision_reason', v_actor, v_reviewed_at, v_next_version,
      v_previous_link_id is null
    ) returning id into v_new_link_id;
    v_writes := v_writes + 1;

    if v_previous_link_id is not null then
      update public.ingredient_nutrition_profiles
      set review_status = 'superseded', is_active = false, is_primary = false,
          superseded_by_id = v_new_link_id,
          decision_reason = v_entry ->> 'decision_reason',
          reviewed_by = v_actor, reviewed_at = v_reviewed_at
      where id = v_previous_link_id;
      v_writes := v_writes + 1;
      v_superseded_count := v_superseded_count + 1;

      update public.ingredient_nutrition_profiles
      set review_status = 'approved', is_active = true, is_primary = true,
          decision_reason = v_entry ->> 'decision_reason',
          reviewed_by = v_actor, reviewed_at = v_reviewed_at
      where id = v_new_link_id;
      v_writes := v_writes + 1;
      v_link_ids := array_append(v_link_ids, v_previous_link_id);
    end if;
    v_link_ids := array_append(v_link_ids, v_new_link_id);
  end loop;

  v_result := jsonb_build_object(
    'status', 'applied',
    'applied_count', v_entry_count,
    'superseded_count', v_superseded_count,
    'source_ids', to_jsonb(v_source_ids),
    'nutrition_link_ids', to_jsonb(v_link_ids),
    'writes_committed', v_writes + 1,
    'replayed', false
  );
  v_metadata := jsonb_build_object(
    'schema_version', 'homecook-nutrition-review-apply-event-v1',
    'payload_checksum', v_payload_checksum,
    'source_report_checksum', p_patch ->> 'source_report_checksum',
    'reviewed_at', v_reviewed_at,
    'summary', p_patch -> 'summary',
    'result', v_result
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'ingredient_nutrition_review_applied', 'info',
    'ingredient-nutrition-review', v_actor,
    'reviewed ingredient nutrition applied', v_metadata
  );
  return v_result;
end;
$$;

revoke all on function public.apply_reviewed_ingredient_nutrition(jsonb) from public;
revoke all on function public.apply_reviewed_ingredient_nutrition(jsonb) from anon, authenticated;
grant execute on function public.apply_reviewed_ingredient_nutrition(jsonb) to service_role;
