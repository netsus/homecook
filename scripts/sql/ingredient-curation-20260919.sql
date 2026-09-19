-- Source-reviewed catalog operation. Run only after exact local target and backup verification.
set local lock_timeout='10s';
set local statement_timeout='120s';
do $curation$
declare
  v_input jsonb := current_setting('homecook.ingredient_curation_input',true)::jsonb;
  v_patch jsonb := v_input->'patch';
  v_expected jsonb := v_input->'expected_links';
  v_rep jsonb := v_input->'representative';
  v_hold jsonb := v_input->'source_quality_hold';
  v_row jsonb;
  v_links jsonb;
  v_cutover uuid;
  v_result jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after text;
  v_table text;
  v_source_item uuid;
  v_removed_alias jsonb;
  v_moved_alias jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-ingredient-curation-20260919' or v_input->>'operation_checksum' is distinct from 'd7971ea5fdfe82843432f97c890d98997276e4b4da2bbe0fbc075997bd604eb6' then raise exception 'CURATION_INPUT_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:ingredient-curation-20260919',0));
  if exists(select 1 from public.operational_events where event_type='ingredient_catalog_curation_applied' and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    raise notice 'Curation already applied; no writes';
    return;
  end if;
  if exists(select 1 from public.operational_events where event_type='ingredient_nutrition_review_applied' and metadata_json->>'payload_checksum'=v_patch->>'payload_checksum') then raise exception 'CURATION_INCOMPLETE_PREVIOUS_OPERATION'; end if;
  if not exists(select 1 from public.nutrition_sources where id='8ed16622-19ef-41f0-8061-2f9e47d60cce' and manifest_sha256='999505db59474e9f321fb04ff2c970aa8842bce530ee26a794613ced6880d313' and review_status='approved' and is_active and freshness_status='current') then
    raise exception 'CURATION_SOURCE_DRIFT';
  end if;
  perform public.lock_recipe_nutrition_ingredient_ids(array(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_patch->'entries')),false);
  for v_row in select value from jsonb_array_elements(v_expected) loop
    if not exists(select 1 from public.ingredients where id=(v_row->>'ingredient_id')::uuid and standard_name=v_row->>'standard_name') then raise exception 'CURATION_INGREDIENT_DRIFT'; end if;
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links from public.ingredient_nutrition_profiles where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' then raise exception 'CURATION_LINK_DRIFT'; end if;
  end loop;
  foreach v_table in array array['recipe_ingredients','meals','meal_log_entries','leftover_dishes','cooked_batch_quantity_events','recipe_content_snapshots','recipe_nutrition_snapshots'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),''[]''::jsonb)::text) from public.%I t',v_table) into v_after;
    v_before:=v_before||jsonb_build_object(v_table,v_after);
  end loop;
  select capability.current_cutover_attempt_id into v_cutover
  from public.account_generation_capability_state capability join public.account_generation_cutover_attempts attempt on attempt.id=capability.current_cutover_attempt_id
  where capability.singleton and capability.state='generation_active' for key share of capability,attempt;
  if v_cutover is null then raise exception 'CURATION_WRITER_AUTHORITY_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
  if (v_result->>'applied_count')::integer<>10 then raise exception 'CURATION_APPLY_COUNT_MISMATCH'; end if;
  select p.source_item_id into v_source_item from public.nutrition_profiles p where p.id=(v_rep->>'nutrition_profile_id')::uuid and p.review_status='approved' and p.is_active;
  if v_source_item is null or not exists(select 1 from public.nutrition_source_items where id=v_source_item and source_id='8ed16622-19ef-41f0-8061-2f9e47d60cce' and external_item_key='1704') then raise exception 'CURATION_REPRESENTATIVE_SOURCE_DRIFT'; end if;
  if (select count(*) from public.ingredient_nutrition_profiles where ingredient_id in ((v_rep->>'source_ingredient_id')::uuid,(v_rep->>'representative_ingredient_id')::uuid) and nutrition_profile_id=(v_rep->>'nutrition_profile_id')::uuid and is_active and is_primary and review_status='approved')<>2 then raise exception 'CURATION_REPRESENTATIVE_PROFILE_MISMATCH'; end if;
  insert into public.ingredient_representative_links(source_ingredient_id,representative_ingredient_id,nutrition_source_item_id,evidence_json,decision_reason,reviewed_by,reviewed_at)
  values((v_rep->>'source_ingredient_id')::uuid,(v_rep->>'representative_ingredient_id')::uuid,v_source_item,jsonb_build_object('source_version','RDA10.4','source_key','1704','source_profile_id',v_rep->>'nutrition_profile_id','preparation','raw','preserve_existing_references',true,'payload_checksum',v_patch->>'payload_checksum'),v_rep->>'reason',(v_patch->>'reviewed_by')::uuid,(v_patch->>'reviewed_at')::timestamptz);
  -- Preserve the suspect source's original values; do not let new calculations treat it as verified.
  if exists(select 1 from public.recipe_ingredients ri join public.ingredient_nutrition_profiles l on l.ingredient_id=ri.ingredient_id join public.nutrition_profiles p on p.id=l.nutrition_profile_id where p.source_item_id=(v_hold->>'source_item_id')::uuid) then raise exception 'CURATION_SUSPECT_SOURCE_HAS_RECIPE_REFERENCES'; end if;
  update public.ingredient_nutrition_profiles link set review_status='revoked',is_active=false,is_primary=false,decision_reason=v_hold->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
  where link.nutrition_profile_id='edcaab5b-1ef1-425f-a253-ff65161daa27'::uuid and link.review_status='approved' and link.is_active;
  if not found then raise exception 'CURATION_SUSPECT_LINK_DRIFT'; end if;
  update public.nutrition_profiles set review_status='revoked',is_active=false,decision_reason=v_hold->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
  where id='edcaab5b-1ef1-425f-a253-ff65161daa27'::uuid and source_item_id=(v_hold->>'source_item_id')::uuid and review_status='approved' and is_active;
  if not found then raise exception 'CURATION_SUSPECT_PROFILE_DRIFT'; end if;
  delete from public.ingredient_synonyms alias where alias.id='5f0fcd3f-84ff-4760-ac0a-fc4d695ce73c'::uuid and alias.ingredient_id='83a74ff7-329d-577b-94f7-2275f2afc8eb'::uuid and alias.synonym='멥쌀밥, 쪄서 말린것' returning to_jsonb(alias) into v_removed_alias;
  if v_removed_alias is null then raise exception 'CURATION_DRY_RICE_ALIAS_DRIFT'; end if;
  select to_jsonb(alias) into v_moved_alias from public.ingredient_synonyms alias where alias.id='6f30ac8c-7546-4337-8e3b-ad629e12bdd2'::uuid and alias.ingredient_id='d60f539f-d3ad-4f15-ab44-27c2d7e9cf20'::uuid and alias.synonym='돼지 앞다리' for update;
  if v_moved_alias is null then raise exception 'CURATION_PORK_ALIAS_DRIFT'; end if;
  update public.ingredient_synonyms set ingredient_id='1ea5d6ec-5228-5022-ace8-90c648df5c03'::uuid where id='6f30ac8c-7546-4337-8e3b-ad629e12bdd2'::uuid;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
  values('ingredient_catalog_curation_applied','info','ingredient-curation-20260919',(v_patch->>'reviewed_by')::uuid,'Source-reviewed nutrition and representative links; historical records preserved',jsonb_build_object('operation_checksum',v_input->>'operation_checksum','payload_checksum',v_patch->>'payload_checksum','representative',v_rep,'quarantined_profile','edcaab5b-1ef1-425f-a253-ff65161daa27','source_quality_hold',v_hold,'removed_invalid_alias',v_removed_alias,'moved_pork_alias_before',v_moved_alias,'moved_pork_alias_target','1ea5d6ec-5228-5022-ace8-90c648df5c03','user_request','2026-09-19 nutrient/duplicate curation; ambiguous entries withheld'));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  foreach v_table in array array['recipe_ingredients','meals','meal_log_entries','leftover_dishes','cooked_batch_quantity_events','recipe_content_snapshots','recipe_nutrition_snapshots'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),''[]''::jsonb)::text) from public.%I t',v_table) into v_after;
    if v_after is distinct from v_before->>v_table then raise exception 'CURATION_HISTORY_CHANGED: %',v_table; end if;
  end loop;
  raise notice 'Curation applied: %', v_result;
end;
$curation$;
commit;
