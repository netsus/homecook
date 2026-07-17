alter function public.apply_ingredient_nutrition_model(jsonb)
  rename to apply_ingredient_nutrition_model_single_bundle;

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
  v_affected_row_ids jsonb := jsonb_build_object(
    'nutrition_source_ids', '[]'::jsonb,
    'nutrition_source_item_ids', '[]'::jsonb,
    'nutrition_profile_ids', '[]'::jsonb,
    'nutrition_value_keys', '[]'::jsonb,
    'nutrition_link_ids', '[]'::jsonb,
    'measurement_evidence_ids', '[]'::jsonb,
    'conversion_assignment_ids', '[]'::jsonb,
    'piece_weight_ids', '[]'::jsonb
  );
  v_registry_metadata jsonb;
begin
  if coalesce(jsonb_typeof(p_model -> 'bundles'), '') <> 'array'
    or jsonb_array_length(p_model -> 'bundles') <= 1
  then
    if coalesce(jsonb_typeof(p_model -> 'bundles'), '') = 'array'
      and jsonb_array_length(p_model -> 'bundles') = 1
      and not (p_model ? 'bundle')
    then
      return public.apply_ingredient_nutrition_model_single_bundle(
        (p_model - 'bundles') || jsonb_build_object('bundle', p_model -> 'bundles' -> 0)
      );
    end if;
    return public.apply_ingredient_nutrition_model_single_bundle(p_model);
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

  for v_bundle in
    select value
    from jsonb_array_elements(p_model -> 'bundles')
  loop
    v_bundle_checksum := v_bundle ->> 'handoff_checksum';
    if nullif(v_bundle_checksum, '') is null then
      raise exception 'INVALID_HANDOFF_BUNDLE';
    end if;

    v_child_run_id := 'bundle-' || left(
      encode(extensions.digest(v_run_id || '::' || v_bundle_checksum, 'sha256'), 'hex'),
      24
    );
    v_child_idempotency_key := encode(
      extensions.digest(v_idempotency_key || '::' || v_bundle_checksum, 'sha256'),
      'hex'
    );
    v_child_source_payload_identity := encode(
      extensions.digest(v_source_payload_identity || '::' || v_bundle_checksum, 'sha256'),
      'hex'
    );
    v_child_decision_checksum := encode(
      extensions.digest(v_decision_checksum || '::' || v_bundle_checksum, 'sha256'),
      'hex'
    );
    v_child_content_hash := encode(
      extensions.digest(v_content_hash || '::' || v_bundle_checksum, 'sha256'),
      'hex'
    );

    v_child_model := jsonb_build_object(
      'bundle', v_bundle,
      'approval',
      (p_model -> 'approval') ||
      jsonb_build_object(
        'nutrition_decisions',
        (
          select coalesce(
            jsonb_agg(decision order by decision ->> 'ingredient_id', decision ->> 'fingerprint'),
            '[]'::jsonb
          )
          from jsonb_array_elements(p_model -> 'approval' -> 'nutrition_decisions') decisions(decision)
          where exists (
            select 1
            from jsonb_array_elements(
              p_model -> 'candidate_plan' -> 'nutrition_candidates'
            ) candidates(candidate)
            where candidate ->> 'candidate_identity' = decision ->> 'candidate_identity'
              and candidate ->> 'candidate_checksum' = decision ->> 'candidate_checksum'
              and candidate ->> 'source_bundle_checksum' = v_bundle_checksum
          )
        ),
        'conversion_decisions', '[]'::jsonb,
        'piece_decisions', '[]'::jsonb
      ),
      'candidate_plan',
      jsonb_build_object(
        'nutrition_candidates',
        (
          select coalesce(
            jsonb_agg(candidate order by candidate ->> 'ingredient_id', candidate ->> 'fingerprint'),
            '[]'::jsonb
          )
          from jsonb_array_elements(
            p_model -> 'candidate_plan' -> 'nutrition_candidates'
          ) candidates(candidate)
          where candidate ->> 'source_bundle_checksum' = v_bundle_checksum
        ),
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
    v_child_affected_row_ids := coalesce(v_child_result -> 'affected_row_ids', '{}'::jsonb);

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
    v_total_writes := v_total_writes + coalesce((v_child_result ->> 'writes_committed')::integer, 0);
    v_total_superseded := v_total_superseded + coalesce((v_child_result ->> 'superseded_count')::integer, 0);
    v_reason_codes := to_jsonb(array(
      select distinct code
      from jsonb_array_elements_text(
        v_reason_codes || coalesce(v_child_result -> 'reason_codes', '[]'::jsonb)
      ) as codes(code)
      order by 1
    ));
    v_affected_row_ids := jsonb_build_object(
      'nutrition_source_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'nutrition_source_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'nutrition_source_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'nutrition_source_item_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'nutrition_source_item_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'nutrition_source_item_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'nutrition_profile_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'nutrition_profile_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'nutrition_profile_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'nutrition_value_keys',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'nutrition_value_keys', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'nutrition_value_keys', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'nutrition_link_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'nutrition_link_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'nutrition_link_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'measurement_evidence_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'measurement_evidence_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'measurement_evidence_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'conversion_assignment_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'conversion_assignment_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'conversion_assignment_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      )),
      'piece_weight_ids',
      to_jsonb(array(
        select distinct value
        from jsonb_array_elements_text(
          coalesce(v_affected_row_ids -> 'piece_weight_ids', '[]'::jsonb) ||
          coalesce(v_child_affected_row_ids -> 'piece_weight_ids', '[]'::jsonb)
        ) as merged(value)
        order by 1
      ))
    );
  end loop;

  if coalesce(array_length(v_source_ids, 1), 0) < 2 then
    raise exception 'INVALID_MODEL_IMPORT';
  end if;

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
    'summary',
    jsonb_strip_nulls(
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
    'registry_checksum',
    encode(extensions.digest((v_registry_metadata - 'registry_checksum')::text, 'sha256'), 'hex')
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

create or replace function public.disable_ingredient_nutrition_model(
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
  v_links integer := 0;
  v_assignments integer := 0;
  v_pieces integer := 0;
  v_registry jsonb;
  v_affected_row_ids jsonb;
  v_source_ids jsonb;
  v_result jsonb;
  v_disable_registry jsonb;
begin
  select metadata_json into v_registry
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_disabled'
    and metadata_json ->> 'idempotency_key' = p_disable_key;
  if v_registry is not null then
    return jsonb_strip_nulls(
      (v_registry -> 'result') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true)
    );
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_applied'
    and metadata_json ->> 'idempotency_key' = p_model_run_key;
  v_affected_row_ids := v_registry -> 'affected_row_ids';
  v_source_ids := coalesce(
    v_registry -> 'affected_source_ids',
    case
      when nullif(v_registry ->> 'affected_source_id', '') is not null
      then jsonb_build_array(v_registry ->> 'affected_source_id')
      else '[]'::jsonb
    end
  );

  if nullif(btrim(p_reason), '') is null or p_actor is null or p_reviewed_at is null
    or not exists (select 1 from public.users where id = p_actor)
    or v_registry is null
    or coalesce(jsonb_typeof(v_source_ids), '') <> 'array'
    or jsonb_array_length(v_source_ids) = 0
  then
    raise exception 'INVALID_DISABLE_DECISION';
  end if;

  update public.ingredient_nutrition_profiles link
  set review_status = 'revoked', is_active = false, is_primary = false,
      decision_reason = p_reason, reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'nutrition_link_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = link.id
    )
    and link.review_status = 'approved' and link.is_active
    and exists (
      select 1
      from public.nutrition_profiles profile
      join public.nutrition_source_items item on item.id = profile.source_item_id
      join jsonb_array_elements_text(v_source_ids) source_ids(id)
        on source_ids.id::uuid = item.source_id
      where profile.id = link.nutrition_profile_id
    );
  get diagnostics v_links = row_count;

  update public.ingredient_conversion_assignments assignment
  set review_status = 'revoked', is_active = false, assignment_reason = p_reason,
      reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'conversion_assignment_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = assignment.id
    )
    and assignment.review_status = 'approved' and assignment.is_active;
  get diagnostics v_assignments = row_count;

  update public.piece_unit_weights piece
  set review_status = 'revoked', is_active = false, decision_reason = p_reason,
      reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'piece_weight_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = piece.id
    )
    and piece.review_status = 'approved' and piece.is_active;
  get diagnostics v_pieces = row_count;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'writes_committed', v_links + v_assignments + v_pieces + 1,
    'revoked_count', v_links + v_assignments + v_pieces,
    'payload_deleted', 0,
    'replayed', false,
    'source_ids', v_source_ids
  ));
  v_disable_registry := jsonb_strip_nulls(jsonb_build_object(
      'run_id', 'disable-' || left(p_disable_key, 24),
      'idempotency_key', p_disable_key,
      'model_run_key', p_model_run_key,
      'source_payload_identity', v_registry ->> 'source_payload_identity',
      'decision_checksum', p_disable_key,
      'content_hash', v_registry ->> 'content_hash',
      'affected_source_ids', v_source_ids,
      'affected_source_id',
      case
        when jsonb_array_length(v_source_ids) = 1 then v_source_ids ->> 0
        else null
      end,
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', v_links + v_assignments + v_pieces + 1,
      'summary', jsonb_strip_nulls(jsonb_build_object(
        'schema_version', 'ingredient-nutrition-model-run-v1',
        'mode', 'disable',
        'status', 'disabled',
        'run_id', 'disable-' || left(p_disable_key, 24),
        'idempotency_key', p_disable_key,
        'model_run_key', p_model_run_key,
        'source_payload_identity', v_registry ->> 'source_payload_identity',
        'decision_checksum', p_disable_key,
        'content_hash', v_registry ->> 'content_hash',
        'affected_source_ids', v_source_ids,
        'affected_source_id',
        case
          when jsonb_array_length(v_source_ids) = 1 then v_source_ids ->> 0
          else null
        end,
        'affected_row_ids', v_affected_row_ids,
        'writes_attempted', v_links + v_assignments + v_pieces + 1,
        'writes_committed', v_links + v_assignments + v_pieces + 1,
        'payload_deleted', 0,
        'production_db_writes', 0,
        'provider_requests', 0,
        'secret_leak_count', 0
      )),
      'result', v_result
    ));
  v_disable_registry := v_disable_registry || jsonb_build_object(
    'registry_checksum',
    encode(extensions.digest((v_disable_registry - 'registry_checksum')::text, 'sha256'), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'ingredient_nutrition_model_disabled', 'info', 'ingredient-nutrition-model',
    p_actor, 'ingredient nutrition model disable registry', v_disable_registry
  );
  return v_result;
end;
$$;

revoke all on function public.apply_ingredient_nutrition_model(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ingredient_nutrition_model(jsonb) to service_role;
revoke all on function public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamptz) to service_role;
