-- Run after the full schema plus 20261008090000/091000 in an isolated seeded
-- database. No production invocation. Every fixture and assertion is rolled back.
begin;
set local request.jwt.claim.role='service_role';

do $test$
declare
  v_source jsonb := jsonb_build_object('provider','HOMECOOK_AI_ESTIMATE',
    'dataset','SQL AI evidence regression','source_version','test-v1',
    'data_basis_date',null,'license','test','source_url','https://example.org/ai-nutrition');
  v_official jsonb := v_source || '{"provider":"ZZ_TEST_OFFICIAL"}'::jsonb;
  v_candidate jsonb;
  v_row jsonb;
  v_guard jsonb;
  v_result jsonb;
  v_profile uuid := gen_random_uuid();
  v_source_id uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_reviewer uuid;
  v_ingredient uuid := gen_random_uuid();
  v_name text := 'AI source preference fixture ' || gen_random_uuid()::text;
  v_ai_link uuid := gen_random_uuid();
  v_official_link uuid := gen_random_uuid();
  v_official_source uuid := gen_random_uuid();
  v_official_item uuid := gen_random_uuid();
  v_official_profile uuid := gen_random_uuid();
  v_pinned_link uuid;
  v_snapshot jsonb;
  v_bad jsonb;
  v_status jsonb := '{}'::jsonb;
  v_vectors jsonb := '{}'::jsonb;
  v_code text;
  v_entry public.meal_log_entries%rowtype;
begin
  -- Pure guard fixtures prove provenance eligibility without relying on the
  -- writer to sanitize crafted candidates on the caller's behalf.
  v_candidate := jsonb_build_object('link_id','b1000000-0000-4000-8000-000000000001',
    'basis_unit','g','basis_amount',100,'preparation_state','as_published',
    'source',v_source,'nutrition_values',
    '[{"nutrient_code":"energy_kcal","amount":200,"value_status":"estimated"}]'::jsonb);
  v_row := jsonb_build_object('ingredient_id','b1000000-0000-4000-8000-000000000002',
    'ingredient_type','QUANT','amount',50,'unit','g',
    'selected_nutrition_link_id',v_candidate->'link_id',
    'nutrition_candidates',jsonb_build_array(v_candidate));
  v_guard := jsonb_build_object('recipe_ingredients',jsonb_build_array(v_row));
  v_result := public.build_recipe_nutrition_contributing_sources(v_guard);
  if v_result is distinct from jsonb_build_array(v_source) then
    raise exception 'AI QUANT must contribute exactly six public source keys: %',v_result;
  end if;

  v_guard := jsonb_set(v_guard,'{recipe_ingredients,0,nutrition_candidates,0,source}',v_official);
  if public.build_recipe_nutrition_contributing_sources(v_guard) <> '[]'::jsonb then
    raise exception 'Non-AI estimated value was eligible';
  end if;

  v_guard := jsonb_build_object('recipe_ingredients',jsonb_build_array(
    v_row || jsonb_build_object('ingredient_type','TO_TASTE','amount',null,'unit',null)));
  v_guard := jsonb_set(v_guard,'{recipe_ingredients,0,nutrition_candidates,0,nutrition_values,0,amount}','0');
  if public.build_recipe_nutrition_contributing_sources(v_guard) <> '[]'::jsonb then
    raise exception 'AI estimated zero certified TO_TASTE';
  end if;
  v_guard := jsonb_set(v_guard,'{recipe_ingredients,0,nutrition_candidates,0,nutrition_values,0,value_status}','"observed"');
  if public.build_recipe_nutrition_contributing_sources(v_guard) <> '[]'::jsonb then
    raise exception 'AI observed zero certified TO_TASTE';
  end if;
  v_guard := jsonb_set(v_guard,'{recipe_ingredients,0,nutrition_candidates,0,source}',v_official);
  if public.build_recipe_nutrition_contributing_sources(v_guard) is distinct from jsonb_build_array(v_official) then
    raise exception 'Official observed TO_TASTE zero regressed';
  end if;

  v_guard := jsonb_build_object('recipe_ingredients',jsonb_build_array(v_row ||
    jsonb_build_object('food_product_id','b2000000-0000-4000-8000-000000000001',
      'food_product_nutrition_version_id','b2000000-0000-4000-8000-000000000002',
      'product_predecessor',null)));
  if public.build_recipe_nutrition_contributing_sources(v_guard) <> '[]'::jsonb then
    raise exception 'Failed product pin fell back to AI ingredient data';
  end if;

  v_result := private.compact_meal_log_nutrition('partial',
    '{"energy_kcal":200,"protein_g":{"amount":null,"known_amount":4},"contains_ai_estimate":true}',0.5);
  if (v_result->>'calories_kcal')::numeric <> 100
    or (v_result->>'protein_g')::numeric <> 2
    or v_result->'contains_ai_estimate' <> 'true'::jsonb then
    raise exception 'Compact scaling lost AI evidence: %',v_result;
  end if;
  if private.compact_meal_log_nutrition('complete','{"energy_kcal":20}',1)->'contains_ai_estimate' <> 'false'::jsonb then
    raise exception 'Legacy evidence must default to false';
  end if;
  v_entry := jsonb_populate_record(null::public.meal_log_entries,
    '{"source_type":"ingredient","nutrition_evidence_json":{"calculation_status":"complete","calories_kcal":23}}');
  v_result := private.project_meal_log_entry(v_entry)->'nutrition';
  if (v_result->>'calories_kcal')::numeric <> 23 or v_result->'contains_ai_estimate' <> 'false'::jsonb then
    raise exception 'Historical projection changed numeric evidence: %',v_result;
  end if;

  -- Approved isolated fixtures exercise the unchanged source safety checks and
  -- the actual profile resolver. Require the shared schema test seed's reviewer.
  select id into v_reviewer from public.users order by id limit 1;
  if v_reviewer is null then raise exception 'AI evidence test requires seeded reviewer'; end if;
  insert into public.ingredients(id,standard_name,category,default_unit)
  values(v_ingredient,v_name,'기타','g');
  insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,
    source_version,data_basis_date,fetched_at,freshness_checked_at,freshness_status,
    source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_source_id,'HOMECOOK_AI_ESTIMATE','SQL AI evidence regression','nutrition_dataset',
    'test-v1',null,now(),now(),'current','https://example.org/ai-nutrition','test',repeat('b',64),
    'approved','isolated SQL evidence fixture',v_reviewer,now(),true);
  insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,
    preparation_state,source_basis_unit,edible_portion_text,
    stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
  values(v_item,v_source_id,'fixture',v_name,'as_published','g','edible portion',repeat('c',64),'approved',
    'isolated SQL evidence fixture',v_reviewer,now());
  insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,
    basis_amount,basis_unit,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_profile,v_item,'ingredient_source','mass_100g',100,'g','approved',
    'isolated SQL evidence fixture',v_reviewer,now(),true);
  foreach v_code in array array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg'] loop
    -- Match the production writer's source context; AI eligibility supplements
    -- rather than bypasses validate_product_aware_nutrition_value_insert.
    insert into public.nutrition_values(profile_id,nutrient_code,
      source_nutrient_code,source_unit,amount,value_status,source_token)
      values(v_profile,v_code,v_code,
        case v_code when 'energy_kcal' then 'kcal' when 'sodium_mg' then 'mg' else 'g' end,
        10,'estimated','10');
    v_status := v_status || jsonb_build_object(v_code,jsonb_build_object(
      'amount',10,'known_amount',null,'status','complete','display_mode','total'));
    v_vectors := v_vectors || jsonb_build_object(v_code,10);
  end loop;
  v_result := private.resolve_meal_log_profile_nutrition(v_profile,50,'g',false);
  if v_result->>'calculation_status' <> 'complete'
    or (v_result->>'calories_kcal')::numeric <> 5
    or v_result->'contains_ai_estimate' <> 'true'::jsonb then
    raise exception 'AI profile values/evidence did not reach meal preview: %',v_result;
  end if;

  -- The two active states are legal. A new direct meal must prefer official
  -- evidence even when AI was inserted first, while an existing AI pin survives.
  insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,
    preparation_state,match_method,is_primary,review_status,decision_reason,
    reviewed_by,reviewed_at,version,is_active)
  values(v_ai_link,v_ingredient,v_profile,'as_published','ai_estimate',true,'approved',
    'isolated preference fixture',v_reviewer,now(),1,true);
  if private.preferred_meal_log_ingredient_profile(v_ingredient) is distinct from v_ai_link then
    raise exception 'Missing official profile must retain AI fallback';
  end if;
  v_pinned_link := v_ai_link;
  insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,
    source_version,fetched_at,freshness_checked_at,freshness_status,
    source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_official_source,'ZZ_TEST_OFFICIAL','SQL official preference regression','nutrition_dataset',
    'test-v1',now(),now(),'current','https://example.org/official-nutrition','test',repeat('e',64),
    'approved','isolated preference fixture',v_reviewer,now(),true);
  insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,
    preparation_state,source_basis_unit,edible_portion_text,
    stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
  values(v_official_item,v_official_source,'fixture',v_name,'raw','g','edible portion',
    repeat('f',64),'approved','isolated preference fixture',v_reviewer,now());
  insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,
    basis_amount,basis_unit,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_official_profile,v_official_item,'ingredient_source','mass_100g',100,'g','approved',
    'isolated preference fixture',v_reviewer,now(),true);
  insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,
    source_unit,amount,value_status,source_token)
  values(v_official_profile,'energy_kcal','energy_kcal','kcal',20,'observed','20');
  insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,
    preparation_state,match_method,is_primary,review_status,decision_reason,
    reviewed_by,reviewed_at,version,is_active)
  values(v_official_link,v_ingredient,v_official_profile,'raw','exact_name',true,'approved',
    'isolated preference fixture',v_reviewer,now(),1,true);
  if private.preferred_meal_log_ingredient_profile(v_ingredient) is distinct from v_official_link then
    raise exception 'Direct meal profile selector did not prefer official over AI';
  end if;
  v_result := private.resolve_meal_log_profile_nutrition(
    (select nutrition_profile_id from public.ingredient_nutrition_profiles where id=v_pinned_link),50,'g',true);
  if v_result->'contains_ai_estimate' is distinct from 'true'::jsonb
    or (v_result->>'calories_kcal')::numeric <> 5 then
    raise exception 'Existing AI pin changed after official profile arrived: %',v_result;
  end if;
  foreach v_code in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_code,'private.preferred_meal_log_ingredient_profile(uuid)','EXECUTE') then
      raise exception 'Private profile selector unexpectedly callable by %',v_code;
    end if;
  end loop;

  v_snapshot := jsonb_build_object('base_servings',1,'calculated_at',now(),
    'calculation_quality','estimated','calculation_status','complete',
    'calculation_version','recipe-nutrition-v2','fixed_values',
    '{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}'::jsonb,
    'input_hash',repeat('d',64),'missing_reasons','[]'::jsonb,'nutrient_status',v_status,
    'reflected_ingredient_count',1,'scalable_values',v_vectors,'sources',jsonb_build_array(v_source),
    'target_ingredient_count',1,'warnings','["AI_NUTRITION_ESTIMATE_USED"]'::jsonb);
  perform public.validate_recipe_nutrition_snapshot_payload(v_snapshot);
  foreach v_code in array array['direct','mixed'] loop
    begin
      perform public.validate_recipe_nutrition_snapshot_payload(
        jsonb_set(v_snapshot,'{calculation_quality}',to_jsonb(v_code)));
      raise exception 'AI-only quality accepted: %',v_code;
    exception when raise_exception then
      if sqlerrm <> 'INVALID_SNAPSHOT_STATUS' then raise; end if;
    end;
  end loop;
  begin
    perform public.validate_recipe_nutrition_snapshot_payload(jsonb_set(v_snapshot,'{warnings}','[]'));
    raise exception 'AI source accepted without its warning';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_SNAPSHOT_STATUS' then raise; end if;
  end;
  v_bad := jsonb_set(v_snapshot,'{sources,0,raw_payload}','{}');
  begin
    perform public.validate_recipe_nutrition_snapshot_payload(v_bad);
    raise exception 'Public source contract gained a seventh key';
  exception when raise_exception then
    if sqlerrm <> 'UNSAFE_SNAPSHOT_SOURCE' then raise; end if;
  end;
end;
$test$;

rollback;
