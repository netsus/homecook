alter function public.apply_ingredient_nutrition_model(jsonb)
  rename to apply_ingredient_nutrition_model_without_reviewed_aliases;

create or replace function public.merge_ingredient_nutrition_affected_rows(
  p_left jsonb,
  p_right jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_object_agg(
    affected_key,
    (
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      from (
        select distinct value
        from jsonb_array_elements_text(
          coalesce(p_left -> affected_key, '[]'::jsonb) ||
          coalesce(p_right -> affected_key, '[]'::jsonb)
        ) values_for_key(value)
      ) deduplicated
    )
  )
  from unnest(array[
    'nutrition_source_ids',
    'nutrition_source_item_ids',
    'nutrition_profile_ids',
    'nutrition_value_keys',
    'nutrition_link_ids',
    'measurement_evidence_ids',
    'conversion_assignment_ids',
    'piece_weight_ids'
  ]) affected_keys(affected_key);
$$;

create function public.apply_ingredient_nutrition_model(p_model jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_run_id text := p_model ->> 'run_id';
  v_idempotency_key text := p_model ->> 'idempotency_key';
  v_source_payload_identity text := p_model ->> 'source_payload_identity';
  v_decision_checksum text := p_model ->> 'decision_checksum';
  v_content_hash text := p_model ->> 'content_hash';
  v_registry jsonb;
  v_result jsonb;
  v_bundle jsonb;
  v_bundle_checksum text;
  v_bundle_item_count integer;
  v_matched_item_count integer;
  v_max_decision_rank integer;
  v_decision_rank integer;
  v_child_items jsonb;
  v_child_decisions jsonb;
  v_child_candidates jsonb;
  v_virtual_bundle_checksum text;
  v_child_bundle jsonb;
  v_child_model jsonb;
  v_child_result jsonb;
  v_child_affected_row_ids jsonb;
  v_child_run_id text;
  v_child_idempotency_key text;
  v_child_source_payload_identity text;
  v_child_decision_checksum text;
  v_child_content_hash text;
  v_total_writes integer := 0;
  v_total_superseded integer := 0;
  v_source_ids text[] := '{}'::text[];
  v_reason_codes jsonb := '[]'::jsonb;
  v_affected_row_ids jsonb := public.merge_ingredient_nutrition_affected_rows(
    '{}'::jsonb,
    '{}'::jsonb
  );
  v_registry_metadata jsonb;
  v_decision jsonb;
  v_candidate jsonb;
  v_source_item jsonb;
  v_match_count integer;
  v_external_name text;
  v_ingredient_id uuid;
  v_created_alias_id uuid;
  v_created_alias_ids uuid[] := '{}'::uuid[];
begin
  if coalesce(jsonb_typeof(p_model -> 'bundles'), '') <> 'array'
    or jsonb_array_length(p_model -> 'bundles') <= 1
  then
    return public.apply_ingredient_nutrition_model_without_reviewed_aliases(p_model);
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_applied'
    and metadata_json ->> 'idempotency_key' = v_idempotency_key;
  if v_registry is not null then
    return jsonb_strip_nulls(
      (v_registry -> 'result') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true)
    );
  end if;

  if nullif(v_run_id, '') is null
    or nullif(v_idempotency_key, '') is null
    or nullif(v_source_payload_identity, '') is null
    or nullif(v_decision_checksum, '') is null
    or nullif(v_content_hash, '') is null
    or coalesce(jsonb_typeof(p_model -> 'approval' -> 'nutrition_decisions'), '') <> 'array'
    or coalesce(jsonb_typeof(p_model -> 'candidate_plan' -> 'nutrition_candidates'), '') <> 'array'
  then
    raise exception 'INVALID_MODEL_IMPORT';
  end if;

  for v_decision in
    select value
    from jsonb_array_elements(p_model -> 'approval' -> 'nutrition_decisions')
    where value ->> 'status' = 'approved'
  loop
    select count(*), (jsonb_agg(candidate) -> 0)
    into v_match_count, v_candidate
    from jsonb_array_elements(
      p_model -> 'candidate_plan' -> 'nutrition_candidates'
    ) candidates(candidate)
    where candidate ->> 'candidate_identity' = v_decision ->> 'candidate_identity'
      and candidate ->> 'candidate_checksum' = v_decision ->> 'candidate_checksum'
      and candidate ->> 'ingredient_id' = v_decision ->> 'ingredient_id'
      and candidate ->> 'fingerprint' = v_decision ->> 'fingerprint';
    if v_match_count <> 1 then
      raise exception 'INVALID_REVIEWED_SOURCE_ALIAS_DECISION';
    end if;

    select count(*), (jsonb_agg(bundle) -> 0)
    into v_match_count, v_bundle
    from jsonb_array_elements(p_model -> 'bundles') bundles(bundle)
    where bundle ->> 'handoff_checksum' = v_candidate ->> 'source_bundle_checksum';
    if v_match_count <> 1 then
      raise exception 'INVALID_REVIEWED_SOURCE_ALIAS_BUNDLE';
    end if;

    select count(*), (jsonb_agg(item) -> 0)
    into v_match_count, v_source_item
    from jsonb_array_elements(v_bundle -> 'approved_items') items(item)
    where item ->> 'external_item_key' = v_candidate ->> 'external_item_key'
      and item ->> 'fingerprint' = v_candidate ->> 'fingerprint';
    v_external_name := btrim(v_source_item ->> 'external_name');
    begin
      v_ingredient_id := (v_decision ->> 'ingredient_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_REVIEWED_SOURCE_ALIAS_DECISION';
    end;
    if v_match_count <> 1
      or nullif(v_external_name, '') is null
      or char_length(v_external_name) > 100
      or not exists (select 1 from public.ingredients where id = v_ingredient_id)
    then
      raise exception 'INVALID_REVIEWED_SOURCE_ALIAS_ITEM';
    end if;
    if not exists (
      select 1
      from public.ingredients ingredient
      where ingredient.id = v_ingredient_id
        and lower(btrim(ingredient.standard_name)) = lower(v_external_name)
    ) then
      v_created_alias_id := null;
      insert into public.ingredient_synonyms (ingredient_id, synonym)
      values (v_ingredient_id, v_external_name)
      on conflict (ingredient_id, synonym) do nothing
      returning id into v_created_alias_id;
      if v_created_alias_id is not null then
        v_created_alias_ids := array_append(v_created_alias_ids, v_created_alias_id);
      end if;
    end if;
  end loop;

  for v_bundle in select value from jsonb_array_elements(p_model -> 'bundles')
  loop
    v_bundle_checksum := v_bundle ->> 'handoff_checksum';
    if nullif(v_bundle_checksum, '') is null then
      raise exception 'INVALID_HANDOFF_BUNDLE';
    end if;

    select jsonb_array_length(v_bundle -> 'approved_items')
    into v_bundle_item_count;
    with matched as (
      select item ->> 'fingerprint' as fingerprint
      from jsonb_array_elements(v_bundle -> 'approved_items') items(item)
      where exists (
        select 1
        from jsonb_array_elements(
          p_model -> 'candidate_plan' -> 'nutrition_candidates'
        ) candidates(candidate)
        join jsonb_array_elements(
          p_model -> 'approval' -> 'nutrition_decisions'
        ) decisions(decision)
          on decision ->> 'candidate_identity' = candidate ->> 'candidate_identity'
          and decision ->> 'candidate_checksum' = candidate ->> 'candidate_checksum'
          and decision ->> 'ingredient_id' = candidate ->> 'ingredient_id'
          and decision ->> 'fingerprint' = candidate ->> 'fingerprint'
        where candidate ->> 'source_bundle_checksum' = v_bundle_checksum
          and candidate ->> 'external_item_key' = item ->> 'external_item_key'
          and candidate ->> 'fingerprint' = item ->> 'fingerprint'
      )
    )
    select count(distinct fingerprint) into v_matched_item_count from matched;
    if v_bundle_item_count <> v_matched_item_count then
      raise exception 'INVALID_APPROVAL_FILE';
    end if;

    with matched as (
      select decision
      from jsonb_array_elements(
        p_model -> 'candidate_plan' -> 'nutrition_candidates'
      ) candidates(candidate)
      join jsonb_array_elements(
        p_model -> 'approval' -> 'nutrition_decisions'
      ) decisions(decision)
        on decision ->> 'candidate_identity' = candidate ->> 'candidate_identity'
        and decision ->> 'candidate_checksum' = candidate ->> 'candidate_checksum'
        and decision ->> 'ingredient_id' = candidate ->> 'ingredient_id'
        and decision ->> 'fingerprint' = candidate ->> 'fingerprint'
      where candidate ->> 'source_bundle_checksum' = v_bundle_checksum
    ), per_item as (
      select decision ->> 'fingerprint' as fingerprint, count(*) as decision_count
      from matched
      group by decision ->> 'fingerprint'
    )
    select coalesce(max(decision_count), 0) into v_max_decision_rank from per_item;

    for v_decision_rank in 1..v_max_decision_rank
    loop
      with ranked as (
        select decision, candidate,
          row_number() over (
            partition by decision ->> 'fingerprint'
            order by decision ->> 'ingredient_id', decision ->> 'candidate_identity'
          ) as decision_rank
        from jsonb_array_elements(
          p_model -> 'candidate_plan' -> 'nutrition_candidates'
        ) candidates(candidate)
        join jsonb_array_elements(
          p_model -> 'approval' -> 'nutrition_decisions'
        ) decisions(decision)
          on decision ->> 'candidate_identity' = candidate ->> 'candidate_identity'
          and decision ->> 'candidate_checksum' = candidate ->> 'candidate_checksum'
          and decision ->> 'ingredient_id' = candidate ->> 'ingredient_id'
          and decision ->> 'fingerprint' = candidate ->> 'fingerprint'
        where candidate ->> 'source_bundle_checksum' = v_bundle_checksum
      ), selected as (
        select decision, candidate from ranked where decision_rank = v_decision_rank
      )
      select
        (
          select coalesce(jsonb_agg(item order by item ->> 'fingerprint'), '[]'::jsonb)
          from jsonb_array_elements(v_bundle -> 'approved_items') items(item)
          where exists (
            select 1 from selected
            where selected.decision ->> 'fingerprint' = item ->> 'fingerprint'
          )
        ),
        (
          select coalesce(
            jsonb_agg(decision order by decision ->> 'ingredient_id'),
            '[]'::jsonb
          ) from selected
        ),
        (
          select coalesce(
            jsonb_agg(candidate order by candidate ->> 'ingredient_id'),
            '[]'::jsonb
          ) from selected
        )
      into v_child_items, v_child_decisions, v_child_candidates;

      if jsonb_array_length(v_child_items) = 0 then
        continue;
      end if;

      v_virtual_bundle_checksum := encode(
        extensions.digest(
          v_bundle_checksum || '::decision-rank::' || v_decision_rank::text,
          'sha256'
        ),
        'hex'
      );
      v_child_bundle := jsonb_set(
        jsonb_set(
          v_bundle,
          '{approved_items}',
          v_child_items
        ),
        '{measurement_evidence}',
        case when v_decision_rank = 1
          then coalesce(v_bundle -> 'measurement_evidence', '[]'::jsonb)
          else '[]'::jsonb
        end
      ) || jsonb_build_object('handoff_checksum', v_virtual_bundle_checksum);

      v_child_run_id := 'bundle-' || left(encode(extensions.digest(
        v_run_id || '::' || v_virtual_bundle_checksum,
        'sha256'
      ), 'hex'), 24);
      v_child_idempotency_key := encode(extensions.digest(
        v_idempotency_key || '::' || v_virtual_bundle_checksum,
        'sha256'
      ), 'hex');
      v_child_source_payload_identity := encode(extensions.digest(
        v_source_payload_identity || '::' || v_virtual_bundle_checksum,
        'sha256'
      ), 'hex');
      v_child_decision_checksum := encode(extensions.digest(
        v_decision_checksum || '::' || v_virtual_bundle_checksum,
        'sha256'
      ), 'hex');
      v_child_content_hash := encode(extensions.digest(
        v_content_hash || '::' || v_virtual_bundle_checksum,
        'sha256'
      ), 'hex');

      v_child_model := jsonb_build_object(
        'bundle', v_child_bundle,
        'approval',
        (p_model -> 'approval') || jsonb_build_object(
          'nutrition_decisions', v_child_decisions,
          'conversion_decisions', '[]'::jsonb,
          'piece_decisions', '[]'::jsonb
        ),
        'candidate_plan', jsonb_build_object(
          'nutrition_candidates', v_child_candidates,
          'conversion_candidates', '[]'::jsonb,
          'piece_candidates', '[]'::jsonb
        ),
        'run_id', v_child_run_id,
        'idempotency_key', v_child_idempotency_key,
        'source_payload_identity', v_child_source_payload_identity,
        'decision_checksum', v_child_decision_checksum,
        'content_hash', v_child_content_hash,
        'run_summary', p_model -> 'run_summary'
      );

      v_child_result := public.apply_ingredient_nutrition_model_single_bundle(v_child_model);
      v_child_affected_row_ids := coalesce(
        v_child_result -> 'affected_row_ids',
        '{}'::jsonb
      );
      if coalesce(v_child_result ->> 'status', '') <> 'applied'
        or coalesce(v_child_result ->> 'freshness_status', '') <> 'current'
        or nullif(v_child_result ->> 'source_id', '') is null
      then
        raise exception 'INVALID_MODEL_IMPORT';
      end if;

      v_source_ids := array(
        select distinct source_id
        from unnest(v_source_ids || array[v_child_result ->> 'source_id']) source_id
        where nullif(source_id, '') is not null
        order by 1
      );
      v_total_writes := v_total_writes +
        coalesce((v_child_result ->> 'writes_committed')::integer, 0);
      v_total_superseded := v_total_superseded +
        coalesce((v_child_result ->> 'superseded_count')::integer, 0);
      v_reason_codes := to_jsonb(array(
        select distinct code
        from jsonb_array_elements_text(
          v_reason_codes || coalesce(v_child_result -> 'reason_codes', '[]'::jsonb)
        ) codes(code)
        order by 1
      ));
      v_affected_row_ids := public.merge_ingredient_nutrition_affected_rows(
        v_affected_row_ids,
        v_child_affected_row_ids
      );
    end loop;
  end loop;

  if coalesce(array_length(v_source_ids, 1), 0) < 2 then
    raise exception 'INVALID_MODEL_IMPORT';
  end if;

  delete from public.ingredient_synonyms
  where id = any(v_created_alias_ids);

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'status', 'applied',
    'freshness_status', 'current',
    'reason_codes', v_reason_codes,
    'writes_committed', v_total_writes + 1,
    'replayed', false,
    'superseded_count', v_total_superseded,
    'source_ids', to_jsonb(v_source_ids),
    'affected_row_ids', v_affected_row_ids
  ));
  v_registry_metadata := jsonb_strip_nulls(jsonb_build_object(
    'run_id', v_run_id,
    'idempotency_key', v_idempotency_key,
    'source_payload_identity', v_source_payload_identity,
    'decision_checksum', v_decision_checksum,
    'content_hash', v_content_hash,
    'affected_source_ids', to_jsonb(v_source_ids),
    'affected_row_ids', v_affected_row_ids,
    'writes_committed', v_total_writes + 1,
    'summary', jsonb_strip_nulls(
      coalesce(p_model -> 'run_summary', '{}'::jsonb) ||
      jsonb_build_object(
        'schema_version', 'ingredient-nutrition-model-run-v1',
        'run_id', v_run_id,
        'idempotency_key', v_idempotency_key,
        'source_payload_identity', v_source_payload_identity,
        'decision_checksum', v_decision_checksum,
        'content_hash', v_content_hash,
        'writes_attempted', v_total_writes + 1,
        'writes_committed', v_total_writes + 1,
        'replayed', false,
        'superseded_count', v_total_superseded,
        'affected_source_ids', to_jsonb(v_source_ids),
        'affected_row_ids', v_affected_row_ids
      )
    ),
    'result', v_result
  ));
  v_registry_metadata := v_registry_metadata || jsonb_build_object(
    'registry_checksum', encode(extensions.digest(
      (v_registry_metadata - 'registry_checksum')::text,
      'sha256'
    ), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'ingredient_nutrition_model_applied',
    'info',
    'ingredient-nutrition-model',
    (p_model -> 'approval' ->> 'reviewed_by')::uuid,
    'ingredient nutrition model apply registry',
    v_registry_metadata
  );
  return v_result;
end;
$$;

revoke all on function public.merge_ingredient_nutrition_affected_rows(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_ingredient_nutrition_model(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_ingredient_nutrition_model(jsonb)
  to service_role;
