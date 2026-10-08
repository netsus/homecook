-- Isolated seeded clone only, after 0900/0910/0920. No persistent test rows.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
set local request.headers = '{"x-homecook-internal-scope":"ingredient-ai-nutrition"}';
set local request.method = 'POST';
set local request.path = '/rpc/get_ingredient_ai_recipe_refresh_input';

do $test$
declare
  v_job uuid := gen_random_uuid();
  v_recipe uuid := gen_random_uuid();
  v_ingredient uuid := gen_random_uuid();
  v_ri uuid := gen_random_uuid();
  v_source_id uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_profile uuid := gen_random_uuid();
  v_link uuid := gen_random_uuid();
  v_reviewer uuid;
  v_cutover uuid;
  v_recipe_before jsonb;
  v_ingredients_before jsonb;
  v_source jsonb := jsonb_build_object('provider','HOMECOOK_AI_ESTIMATE',
    'dataset','AI refresh SQL fixture','source_version','fixture-v1',
    'data_basis_date',null,'license','test-only','source_url','https://example.org/ai-nutrition');
  v_bundle jsonb;
  v_guard jsonb;
  v_snapshot jsonb;
  v_old_payload jsonb;
  v_old_snapshot uuid;
  v_old_before jsonb;
  v_new_snapshot uuid;
  v_result jsonb;
  v_bad jsonb;
  v_core jsonb := '{}'::jsonb;
  v_zero jsonb := '{}'::jsonb;
  v_unknown jsonb := '{}'::jsonb;
  v_values jsonb := '{}'::jsonb;
  v_code text;
  v_role text;
  v_updated timestamptz;
begin
  -- Serialize only this fixture's brief rollout-setting mutations. Enabling is
  -- uncommitted and is rolled back; other sessions never observe it enabled.
  perform 1 from private.ingredient_ai_nutrition_settings where singleton for update;
  select id into v_reviewer from public.users order by id limit 1;
  if v_reviewer is null then raise exception 'Refresh fixture requires seeded reviewer'; end if;
  update private.ingredient_ai_nutrition_settings set enabled=true,
    model_id='fixture-model',reviewed_by=v_reviewer where singleton;

  select current_cutover_attempt_id into v_cutover
  from public.account_generation_capability_state where singleton and state='generation_active';
  if v_cutover is not null then
    perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  end if;
  insert into public.ingredients(id,standard_name,category)
    values(v_ingredient,'AI refresh fixture '||v_ingredient::text,'기타');
  insert into public.recipes(id,title,source_type,created_by,visibility,base_servings)
    values(v_recipe,'AI refresh fixture '||v_recipe::text,'manual',v_reviewer,'private',1);
  insert into public.recipe_ingredients(id,recipe_id,ingredient_id,ingredient_type,amount,unit,scalable,sort_order)
    values(v_ri,v_recipe,v_ingredient,'QUANT',50,'g',true,0);
  if v_cutover is not null then
    perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  end if;
  insert into private.ingredient_ai_nutrition_jobs(id,ingredient_id,policy_version,status,pending_recipe_ids,result)
    values(v_job,v_ingredient,'refresh-fixture-'||v_job::text,'succeeded',array[v_recipe],
      jsonb_build_object('affected_recipe_ids',jsonb_build_array(v_recipe)));
  select to_jsonb(recipe),updated_at into v_recipe_before,v_updated
    from public.recipes recipe where id=v_recipe;
  select jsonb_agg(to_jsonb(ingredient) order by id) into v_ingredients_before
    from public.recipe_ingredients ingredient where recipe_id=v_recipe;

  foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role,'public.get_ingredient_ai_recipe_refresh_input(uuid,uuid)','EXECUTE')
      or has_function_privilege(v_role,'public.write_ingredient_ai_recipe_refresh(uuid,uuid,jsonb,timestamptz,jsonb)','EXECUTE') then
      raise exception 'Refresh RPC leaked EXECUTE to %',v_role;
    end if;
    perform set_config('request.jwt.claim.role',v_role,true);
    perform set_config('request.jwt.claims',jsonb_build_object('role',v_role)::text,true);
    begin
      perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
      raise exception 'Unauthorized refresh read accepted';
    exception when insufficient_privilege then
      if sqlerrm <> 'AI_NUTRITION_UNAUTHORIZED' then raise; end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);

  perform set_config('request.method','GET',true);
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
    raise exception 'GET refresh accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'AI_NUTRITION_UNAUTHORIZED' then raise; end if;
  end;
  perform set_config('request.method','POST',true);
  perform set_config('request.headers','{"x-homecook-internal-scope":"wrong-scope"}',true);
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
    raise exception 'Wrong scope accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'AI_NUTRITION_UNAUTHORIZED' then raise; end if;
  end;
  perform set_config('request.headers','{"x-homecook-internal-scope":"ingredient-ai-nutrition"}',true);
  perform set_config('request.path','/rpc/write_recipe_nutrition_snapshot',true);
  begin
    perform private.verify_full_local_internal_scope();
    raise exception 'Broad snapshot writer was exposed through AI scope';
  exception when insufficient_privilege then
    if sqlerrm <> 'AI_NUTRITION_SCOPE_DENIED' then raise; end if;
  end;
  perform set_config('request.path','/rpc/get_ingredient_ai_recipe_refresh_input',true);

  update private.ingredient_ai_nutrition_settings set enabled=false where singleton;
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
    raise exception 'Disabled refresh accepted';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'AI_NUTRITION_DISABLED' then raise; end if;
  end;
  update private.ingredient_ai_nutrition_settings set enabled=true where singleton;
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,gen_random_uuid());
    raise exception 'Unlisted recipe accepted';
  exception when no_data_found then
    if sqlerrm <> 'AI_NUTRITION_REFRESH_NOT_PENDING' then raise; end if;
  end;
  update private.ingredient_ai_nutrition_jobs set status='failed' where id=v_job;
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
    raise exception 'Failed job accepted';
  exception when no_data_found then
    if sqlerrm <> 'AI_NUTRITION_REFRESH_NOT_PENDING' then raise; end if;
  end;
  update private.ingredient_ai_nutrition_jobs set status='succeeded' where id=v_job;

  -- Store an actual previous snapshot before the AI source becomes available.
  foreach v_code in array array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg'] loop
    v_unknown:=v_unknown||jsonb_build_object(v_code,jsonb_build_object(
      'amount',null,'known_amount',null,'status','unavailable','display_mode',null));
    v_values:=v_values||jsonb_build_object(v_code,jsonb_build_object(
      'amount',5,'known_amount',null,'status','complete','display_mode','total'));
    v_core:=v_core||jsonb_build_object(v_code,5);
    v_zero:=v_zero||jsonb_build_object(v_code,0);
  end loop;
  v_bundle:=public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
  v_guard:=v_bundle->'input_guard';
  if v_bundle->>'job_id' is distinct from v_job::text or v_bundle->>'recipe_id' is distinct from v_recipe::text
    or jsonb_array_length(v_bundle->'recipe_ingredients') is distinct from 1
    or v_bundle->'ingredient_nutrition_profiles' is distinct from '[]'::jsonb then
    raise exception 'Initial scoped bundle mismatch';
  end if;
  v_old_payload:=jsonb_build_object('base_servings',1,'input_hash',repeat('a',64),
    'calculation_version','recipe-nutrition-v2','calculation_status','unavailable','calculation_quality',null,
    'scalable_values','{}'::jsonb,'fixed_values','{}'::jsonb,'nutrient_status',v_unknown,
    'target_ingredient_count',1,'reflected_ingredient_count',0,
    'missing_reasons',jsonb_build_array('NUTRITION_PROFILE_MISSING:'||v_ri::text),
    'warnings','["NUTRITION_PROFILE_MISSING"]'::jsonb,'sources','[]'::jsonb,'calculated_at',now());
  perform set_config('request.path','/rpc/write_ingredient_ai_recipe_refresh',true);
  perform set_config('homecook.recipe_nutrition_writer','fixture-sentinel',true);
  v_result:=public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_old_payload,v_updated,v_guard);
  v_old_snapshot:=(v_result->>'snapshot_id')::uuid;
  select to_jsonb(snapshot)-'is_current' into v_old_before
    from public.recipe_nutrition_snapshots snapshot where id=v_old_snapshot;
  if current_setting('homecook.recipe_nutrition_writer',true)<>'fixture-sentinel' then
    raise exception 'Success leaked snapshot writer marker';
  end if;

  insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,source_version,data_basis_date,
    fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,
    review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_source_id,'HOMECOOK_AI_ESTIMATE','AI refresh SQL fixture','nutrition_dataset','fixture-v1',null,
    now(),now(),'current','https://example.org/ai-nutrition','test-only',repeat('a',64),
    'approved','Isolated refresh fixture',v_reviewer,now(),true);
  insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,stable_fingerprint,
    source_basis_amount,source_basis_unit,preparation_state,edible_portion_text,
    review_status,decision_reason,reviewed_by,reviewed_at)
  values(v_item,v_source_id,'refresh-fixture','AI refresh fixture '||v_ingredient::text,repeat('b',64),
    100,'g','as_published','100g edible portion',
    'approved','Isolated refresh fixture',v_reviewer,now());
  insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,
    review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_profile,v_item,'ingredient_source','mass_100g',100,'g','approved','Isolated refresh fixture',v_reviewer,now(),true);
  foreach v_code in array array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg'] loop
    insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status,source_token)
    values(v_profile,v_code,v_code,case v_code when 'energy_kcal' then 'kcal' when 'sodium_mg' then 'mg' else 'g' end,
      10,'estimated','10');
  end loop;
  insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,
    match_method,review_status,version,is_active,is_primary,decision_reason,reviewed_by,reviewed_at)
  values(v_link,v_ingredient,v_profile,'as_published','manual','approved',1,true,true,
    'Isolated refresh fixture',v_reviewer,now());

  perform set_config('request.path','/rpc/get_ingredient_ai_recipe_refresh_input',true);
  v_bundle:=public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
  v_guard:=v_bundle->'input_guard';
  if jsonb_array_length(v_bundle->'ingredient_nutrition_profiles') is distinct from 1
    or v_bundle#>>'{ingredient_nutrition_profiles,0,nutrition_profiles,nutrition_source_items,nutrition_sources,provider_code}' is distinct from 'HOMECOOK_AI_ESTIMATE'
    or v_guard#>>'{recipe_ingredients,0,selected_nutrition_link_id}' is distinct from v_link::text
    or v_bundle->'product_predecessors' is distinct from '[]'::jsonb
    or v_bundle->'ingredient_conversion_assignments' is distinct from '[]'::jsonb
    or v_bundle->'piece_unit_weights' is distinct from '[]'::jsonb then
    raise exception 'AI scoped predecessor bundle mismatch: %',v_bundle;
  end if;
  v_snapshot:=jsonb_build_object('base_servings',1,'input_hash',repeat('b',64),
    'calculation_version','recipe-nutrition-v2','calculation_status','complete','calculation_quality','estimated',
    'scalable_values',v_core,'fixed_values',v_zero,'nutrient_status',v_values,
    'target_ingredient_count',1,'reflected_ingredient_count',1,'missing_reasons','[]'::jsonb,
    'warnings','["AI_NUTRITION_ESTIMATE_USED"]'::jsonb,'sources',jsonb_build_array(v_source),'calculated_at',now());
  perform set_config('request.path','/rpc/write_ingredient_ai_recipe_refresh',true);
  update private.ingredient_ai_nutrition_settings set enabled=false where singleton;
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_guard);
    raise exception 'Disable between read and write did not block the refresh';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'AI_NUTRITION_DISABLED' then raise; end if;
  end;
  update private.ingredient_ai_nutrition_settings set enabled=true where singleton;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_guard);
    raise exception 'Authenticated refresh write accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'AI_NUTRITION_UNAUTHORIZED' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated-interval '1 second',v_guard);
    raise exception 'Stale recipe version accepted';
  exception when raise_exception then
    if sqlerrm<>'RECIPE_NUTRITION_INPUT_STALE' then raise; end if;
  end;
  v_bad:=jsonb_set(v_guard,'{recipe_ingredients,0,amount}','51');
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_bad);
    raise exception 'Stale ingredient guard accepted';
  exception when raise_exception then
    if sqlerrm<>'RECIPE_NUTRITION_INPUT_STALE' then raise; end if;
  end;
  v_bad:=jsonb_set(v_snapshot,'{sources,0,dataset}','"different-source"');
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_bad,v_updated,v_guard);
    raise exception 'Wrong source attribution accepted';
  exception when raise_exception then
    if sqlerrm<>'UNSAFE_SNAPSHOT_SOURCE' then raise; end if;
  end;
  v_bad:=jsonb_set(v_snapshot,'{calculation_quality}','"direct"');
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_bad,v_updated,v_guard);
    raise exception 'AI presented as official direct nutrition';
  exception when raise_exception then
    if sqlerrm<>'INVALID_SNAPSHOT_STATUS' then raise; end if;
  end;
  if current_setting('homecook.recipe_nutrition_writer',true)<>'fixture-sentinel' then
    raise exception 'Failure leaked snapshot writer marker';
  end if;
  if (select count(*) from public.recipe_nutrition_snapshots where recipe_id=v_recipe)<>1 then
    raise exception 'A failed refresh left a snapshot';
  end if;

  v_result:=public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_guard);
  v_new_snapshot:=(v_result->>'snapshot_id')::uuid;
  if v_result->'created'<>'true'::jsonb or v_result->'is_current'<>'true'::jsonb then
    raise exception 'Successful refresh result mismatch: %',v_result;
  end if;
  v_result:=public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_guard);
  if v_result->'created'<>'false'::jsonb or v_result->>'snapshot_id'<>v_new_snapshot::text then
    raise exception 'Refresh retry was not idempotent';
  end if;
  if (select count(*) from public.recipe_nutrition_snapshots where recipe_id=v_recipe)<>2
    or (select to_jsonb(snapshot)-'is_current' from public.recipe_nutrition_snapshots snapshot where id=v_old_snapshot) is distinct from v_old_before
    or (select is_current from public.recipe_nutrition_snapshots where id=v_old_snapshot) then
    raise exception 'Historical snapshot values changed or current pointer not moved';
  end if;
  if (select to_jsonb(recipe) from public.recipes recipe where id=v_recipe) is distinct from v_recipe_before
    or (select jsonb_agg(to_jsonb(ingredient) order by id) from public.recipe_ingredients ingredient where recipe_id=v_recipe) is distinct from v_ingredients_before then
    raise exception 'Refresh changed recipe content or its product pins';
  end if;
  if not (select v_recipe=any(pending_recipe_ids) from private.ingredient_ai_nutrition_jobs where id=v_job) then
    raise exception 'Snapshot write implicitly acknowledged pending work';
  end if;
  perform set_config('request.path','/rpc/acknowledge_ingredient_ai_nutrition_refresh',true);
  v_result:=public.acknowledge_ingredient_ai_nutrition_refresh(v_job,array[v_recipe]);
  if v_result->>'remaining'<>'0' then raise exception 'Refresh acknowledgement did not remove pending recipe'; end if;
  perform set_config('request.path','/rpc/get_ingredient_ai_recipe_refresh_input',true);
  begin
    perform public.get_ingredient_ai_recipe_refresh_input(v_job,v_recipe);
    raise exception 'Acknowledged recipe was still readable through job scope';
  exception when no_data_found then
    if sqlerrm<>'AI_NUTRITION_REFRESH_NOT_PENDING' then raise; end if;
  end;
  perform set_config('request.path','/rpc/write_ingredient_ai_recipe_refresh',true);
  begin
    perform public.write_ingredient_ai_recipe_refresh(v_job,v_recipe,v_snapshot,v_updated,v_guard);
    raise exception 'Acknowledged recipe was still writable through job scope';
  exception when no_data_found then
    if sqlerrm<>'AI_NUTRITION_REFRESH_NOT_PENDING' then raise; end if;
  end;
end;
$test$;
select 'AI_RECIPE_REFRESH_SQL_OK';
rollback;
