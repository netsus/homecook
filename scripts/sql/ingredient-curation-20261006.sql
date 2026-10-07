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
  if v_input->>'schema_version' is distinct from 'homecook-ingredient-curation-20261006'
    or v_input->>'operation_checksum' is distinct from '38ec29348c8fd07e5c3db6f1841cad62d2ae34e0017d0465924276d7f2a6e14e'
    or jsonb_array_length(v_patch->'entries') is distinct from 3
    or jsonb_array_length(v_input->'invalid_aliases') is distinct from 3 then
    raise exception 'CURATION_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:ingredient-curation-20261006',0));
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
    array(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_patch->'entries')),false);
  for v_row in select value from jsonb_array_elements(v_input->'expected_links') loop
    if not exists(select 1 from public.ingredients
      where id=(v_row->>'ingredient_id')::uuid and standard_name=v_row->>'standard_name') then
      raise exception 'CURATION_INGREDIENT_DRIFT';
    end if;
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links
    from public.ingredient_nutrition_profiles
    where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' or not exists(
      select 1 from public.ingredient_nutrition_profiles l
      join public.nutrition_profiles p on p.id=l.nutrition_profile_id
      join public.nutrition_source_items si on si.id=p.source_item_id
      where l.id=(v_row->'active_links'->>0)::uuid and p.id=(v_row->>'old_profile_id')::uuid
      and si.external_item_key=v_row->>'old_source_code') then
      raise exception 'CURATION_LINK_DRIFT';
    end if;
  end loop;
  select capability.current_cutover_attempt_id into v_cutover
  from public.account_generation_capability_state capability
  join public.account_generation_cutover_attempts attempt on attempt.id=capability.current_cutover_attempt_id
  where capability.singleton and capability.state='generation_active' for key share of capability,attempt;
  if v_cutover is null then raise exception 'CURATION_WRITER_AUTHORITY_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
  if (v_result->>'applied_count')::integer is distinct from 3 then
    raise exception 'CURATION_APPLY_COUNT_MISMATCH';
  end if;
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
      when value->>'missing_reason'='trace' then 'trace' else 'missing' end)) from jsonb_each(v_row->'values')) then
      raise exception 'CURATION_VALUE_VERIFICATION_FAILED';
    end if;
  end loop;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
  values('ingredient_catalog_curation_applied','info','ingredient-curation-20261006',
    (v_patch->>'reviewed_by')::uuid,'Correct sesame, tofu and iceberg lettuce source identities',
    jsonb_build_object('operation_checksum',v_input->>'operation_checksum','payload_checksum',v_patch->>'payload_checksum',
      'removed_invalid_aliases',v_removed_aliases,'expected_previous_links',v_input->'expected_links',
      'user_request','2026-10-06 prioritize ingredient nutrition; source-reviewed correction of three wrong links'));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  raise notice 'Curation applied: %',v_result;
end;
$curation$;
commit;
