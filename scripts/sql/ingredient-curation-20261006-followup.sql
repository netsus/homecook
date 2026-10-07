-- Data-only, reviewed correction. Requires verified full-local target and fresh DB backup.
set local lock_timeout='10s';
set local statement_timeout='120s';
do $curation$
declare
  v_input jsonb := current_setting('homecook.ingredient_curation_input',true)::jsonb;
  v_patch jsonb := v_input->'patch';
  v_row jsonb;
  v_links jsonb;
  v_cutover uuid;
  v_result jsonb;
  v_alias jsonb;
  v_removed_aliases jsonb := '[]'::jsonb;
  v_values jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-ingredient-curation-20261006-followup'
    or v_input->>'operation_checksum' is distinct from '29f1577792f82473090cac1ad53affb0393f10094cf198a4fae411ab1504f3da'
    or jsonb_array_length(v_patch->'entries') is distinct from ((v_input->'counts'->>'new_links')::integer+(v_input->'counts'->>'replacements')::integer)
    or jsonb_array_length(v_input->'invalid_aliases') is distinct from (v_input->'counts'->>'invalid_aliases')::integer
    or jsonb_array_length(v_input->'revocations') is distinct from (v_input->'counts'->>'revocations')::integer then
    raise exception 'CURATION_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:ingredient-curation-20261006-followup',0));
  if exists(select 1 from public.operational_events where event_type='ingredient_catalog_curation_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    raise notice 'Curation already applied; no writes';
    return;
  end if;
  if exists(select 1 from public.operational_events where event_type='ingredient_nutrition_review_applied'
    and metadata_json->>'payload_checksum'=v_patch->>'payload_checksum') then
    raise exception 'CURATION_INCOMPLETE_PREVIOUS_OPERATION';
  end if;
  if not exists(select 1 from public.nutrition_sources
    where id='8ed16622-19ef-41f0-8061-2f9e47d60cce'
    and manifest_sha256='999505db59474e9f321fb04ff2c970aa8842bce530ee26a794613ced6880d313'
    and review_status='approved' and is_active and freshness_status='current') then
    raise exception 'CURATION_SOURCE_DRIFT';
  end if;
  perform public.lock_recipe_nutrition_ingredient_ids(
    array(select distinct (value->>'ingredient_id')::uuid from jsonb_array_elements((v_patch->'entries')||(v_input->'revocations')||(v_input->'invalid_aliases'))),false);
  for v_row in select value from jsonb_array_elements(v_input->'expected_links') loop
    if not exists(select 1 from public.ingredients
      where id=(v_row->>'ingredient_id')::uuid and standard_name=v_row->>'standard_name') then
      raise exception 'CURATION_INGREDIENT_DRIFT';
    end if;
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links
    from public.ingredient_nutrition_profiles
    where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' then
      raise exception 'CURATION_LINK_DRIFT';
    end if;
    if exists(select 1 from jsonb_array_elements(v_row->'old_profiles') e where not exists(
      select 1 from public.ingredient_nutrition_profiles l join public.nutrition_profiles p on p.id=l.nutrition_profile_id
      join public.nutrition_source_items si on si.id=p.source_item_id where l.id=(e->>'link_id')::uuid
      and p.id=(e->>'profile_id')::uuid and si.external_item_key=e->>'source_code')) then
      raise exception 'CURATION_PROFILE_DRIFT';
    end if;
  end loop;
  select capability.current_cutover_attempt_id into v_cutover
  from public.account_generation_capability_state capability
  join public.account_generation_cutover_attempts attempt on attempt.id=capability.current_cutover_attempt_id
  where capability.singleton and capability.state='generation_active' for key share of capability,attempt;
  if v_cutover is null then raise exception 'CURATION_WRITER_AUTHORITY_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  if exists(select 1 from jsonb_array_elements(v_patch->'entries') e
    join public.nutrition_sources s on s.provider_code=e->'source'->>'provider_code' and s.source_version=e->'source'->>'source_version'
    join public.nutrition_source_items si on si.source_id=s.id and si.external_item_key=e->'source_item'->>'external_item_key'
    join public.nutrition_profiles p on p.source_item_id=si.id
    where p.review_status in ('revoked','rejected')) then raise exception 'CURATION_SOURCE_QUALITY_HOLD'; end if;
  v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
  if (v_result->>'applied_count')::integer is distinct from jsonb_array_length(v_patch->'entries') then
    raise exception 'CURATION_APPLY_COUNT_MISMATCH';
  end if;
  for v_row in select value from jsonb_array_elements(v_input->'revocations') loop
    update public.ingredient_nutrition_profiles set is_active=false,is_primary=false,review_status='revoked',
      decision_reason=v_row->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
      where id=(v_row->>'link_id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid
      and is_active and is_primary and review_status='approved';
    if not found then raise exception 'CURATION_REVOCATION_DRIFT'; end if;
  end loop;
  -- The old source profiles describe real foods. Supersede only the wrong links;
  -- never revoke the shared source/profile or rewrite its nutritional facts.
  for v_row in select value from jsonb_array_elements(v_input->'invalid_aliases') loop
    delete from public.ingredient_synonyms a where a.id=(v_row->>'id')::uuid
      and a.ingredient_id=(v_row->>'ingredient_id')::uuid and a.synonym=v_row->>'synonym'
      returning to_jsonb(a) into v_alias;
    if v_alias is null then raise exception 'CURATION_ALIAS_DRIFT'; end if;
    v_removed_aliases:=v_removed_aliases||jsonb_build_array(v_alias);
  end loop;
  for v_row in select value from jsonb_array_elements(v_patch->'entries') loop
    select jsonb_object_agg(v.nutrient_code,jsonb_build_object('amount',v.amount,'unit',v.source_unit,
      'status',v.value_status)) into v_values
    from public.ingredient_nutrition_profiles l
    join public.nutrition_profiles p on p.id=l.nutrition_profile_id
    join public.nutrition_source_items si on si.id=p.source_item_id
    join public.nutrition_values v on v.profile_id=p.id
    where l.ingredient_id=(v_row->>'ingredient_id')::uuid and l.is_active and l.is_primary
      and l.review_status='approved' and p.is_active and p.review_status='approved'
      and si.external_item_key=v_row->'source_item'->>'external_item_key'
      and si.external_name=v_row->'source_item'->>'external_name';
    if v_values is distinct from (select jsonb_object_agg(key,jsonb_build_object('amount',value->'amount',
      'unit',value->'unit','status',case when value->>'amount' is not null then 'observed'
      when value->>'missing_reason'='trace' then 'trace' when value->>'missing_reason' in ('malformed','parse_error') then 'parse_error' else 'missing' end)) from jsonb_each(v_row->'values')) then
      raise exception 'CURATION_VALUE_VERIFICATION_FAILED: %',v_row->>'ingredient_name';
    end if;
  end loop;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
  values('ingredient_catalog_curation_applied','info','ingredient-curation-20261006-followup',
    (v_patch->>'reviewed_by')::uuid,'Correct reviewed source identities, link exact missing nutrition, quarantine wrong-food links',
    jsonb_build_object('operation_checksum',v_input->>'operation_checksum','payload_checksum',v_patch->>'payload_checksum',
      'removed_invalid_aliases',v_removed_aliases,'expected_previous_links',v_input->'expected_links','revoked_wrong_links',v_input->'revocations','counts',v_input->'counts',
      'user_request','2026-10-06 continue ingredient nutrition cleanup; exact sources only, original missing/trace preserved'));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  raise notice 'Curation applied: %',v_result;
end;
$curation$;
commit;
