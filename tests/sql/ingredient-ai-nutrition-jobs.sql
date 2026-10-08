-- Isolated full-schema integration fixture. Latest 090000/091000/092000 required.
-- Uses the existing account-generation fixture marker for catalog inserts;
-- complete() is also exercised with that marker turned OFF.
-- All fixture IDs are random and every change is rolled back. No model/network.
begin;
set local statement_timeout = '60s';
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
set local request.headers = '{"x-homecook-internal-scope":"ingredient-ai-nutrition"}';
set local request.method = 'POST';
select public.set_account_generation_internal_writer_marker(
  (select current_cutover_attempt_id from public.account_generation_capability_state where singleton), true
);

do $jobs$
declare
  v_run text := replace(gen_random_uuid()::text, '-', '');
  v_policy text;
  v_actor uuid;
  v_cutover uuid;
  v_ingredient uuid := gen_random_uuid();
  v_retry_ingredient uuid := gen_random_uuid();
  v_race_ingredient uuid := gen_random_uuid();
  v_excluded uuid := gen_random_uuid();
  v_budget_ingredient uuid := gen_random_uuid();
  v_group uuid := gen_random_uuid();
  v_claim jsonb; v_second jsonb; v_context jsonb; v_payload jsonb; v_result jsonb; v_replay jsonb;
  v_job uuid; v_retry_job uuid; v_race_job uuid; v_excluded_job uuid; v_budget_job uuid;
  v_token uuid; v_expired_token uuid; v_profile uuid;
  v_source uuid := gen_random_uuid(); v_item uuid := gen_random_uuid(); v_official_profile uuid := gen_random_uuid();
  v_name text; v_count integer; v_before integer; v_after integer;
  v_ids uuid[]; v_stored uuid[]; v_fake uuid := gen_random_uuid();
  v_first_job uuid; v_other_job uuid; v_initial_budget integer;
begin
  select id into v_actor from public.users where deleted_at is null order by id limit 1;
  if v_actor is null then raise exception 'seeded reviewer required'; end if;
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton;
  v_policy := 'sql-ai-' || v_run;
  update private.ingredient_ai_nutrition_settings set enabled = false,
    policy_version = v_policy, prompt_version = 'sql-prompt-v1', model_id = 'sql-fixture-model',
    reviewed_by = v_actor, daily_limit = 50, budget_date = (clock_timestamp() at time zone 'Asia/Seoul')::date,
    claims_today = 0 where singleton;

  insert into public.ingredients(id,standard_name,category)
  values (v_ingredient, 'AI fixture main ' || v_run, '기타'),
    (v_retry_ingredient, 'AI fixture retry ' || v_run, '기타'),
    (v_race_ingredient, 'AI fixture race ' || v_run, '기타'),
    (v_excluded, 'AI fixture excluded ' || v_run, '기타'),
    (v_budget_ingredient, 'AI fixture budget ' || v_run, '기타');
  select count(*) into v_count from private.ingredient_ai_nutrition_jobs where policy_version = v_policy;
  if v_count <> 5 then raise exception 'AFTER INSERT did not enqueue five jobs: %', v_count; end if;
  select id into v_job from private.ingredient_ai_nutrition_jobs where ingredient_id=v_ingredient and policy_version=v_policy;
  select id into v_retry_job from private.ingredient_ai_nutrition_jobs where ingredient_id=v_retry_ingredient and policy_version=v_policy;
  select id into v_race_job from private.ingredient_ai_nutrition_jobs where ingredient_id=v_race_ingredient and policy_version=v_policy;
  select id into v_excluded_job from private.ingredient_ai_nutrition_jobs where ingredient_id=v_excluded and policy_version=v_policy;
  select id into v_budget_job from private.ingredient_ai_nutrition_jobs where ingredient_id=v_budget_ingredient and policy_version=v_policy;
  update private.ingredient_ai_nutrition_jobs set available_at='2200-01-01' where policy_version=v_policy;

  perform set_config('request.path','/rpc/enqueue_ingredient_ai_nutrition',true);
  v_result := public.enqueue_ingredient_ai_nutrition(array[v_ingredient,v_ingredient]);
  if v_result is distinct from '{"queued":0,"skipped":0,"existing":1}'::jsonb then
    raise exception 'enqueue not idempotent: %',v_result;
  end if;
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  v_result := public.claim_ingredient_ai_nutrition_job('sql-worker',180);
  if v_result ->> 'status' is distinct from 'disabled' then raise exception 'disabled claim ran'; end if;
  if (select claims_today from private.ingredient_ai_nutrition_settings where singleton) <> 0 then
    raise exception 'disabled claim consumed budget';
  end if;
  update private.ingredient_ai_nutrition_settings set enabled=true where singleton;
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_job;
  v_claim := public.claim_ingredient_ai_nutrition_job('sql-worker',180);
  if v_claim ->> 'status' <> 'claimed' or (v_claim ->> 'job_id')::uuid <> v_job then
    raise exception 'wrong claim %',v_claim;
  end if;
  v_token := (v_claim ->> 'lease_token')::uuid;
  if (select attempt_count from private.ingredient_ai_nutrition_jobs where id=v_job) <> 1 then
    raise exception 'claim did not count attempt';
  end if;
  perform set_config('request.path','/rpc/get_ingredient_ai_nutrition_context',true);
  v_context := public.get_ingredient_ai_nutrition_context(v_job,v_token);
  if v_context ->> 'standard_name' is distinct from 'AI fixture main ' || v_run then
    raise exception 'context identity mismatch: %',v_context;
  end if;
  v_payload := jsonb_build_object('model',v_claim->>'model','policy_version',v_claim->>'policy_version',
    'prompt_version',v_claim->>'prompt_version','context_hash',v_context->>'context_hash',
    'generated_at',clock_timestamp(),'basis',jsonb_build_object('amount',100,'unit','g'),
    'assumptions',jsonb_build_array('Uncooked edible portion; fixture only'),'uncertainty','high',
    'values','{"energy_kcal":200,"carbohydrate_g":20,"protein_g":5,"fat_g":8,"sodium_mg":null,"sugars_g":0,"fiber_g":2,"saturated_fat_g":3}'::jsonb);
  perform set_config('request.path','/rpc/complete_ingredient_ai_nutrition_job',true);
  begin
    perform public.complete_ingredient_ai_nutrition_job(v_job,gen_random_uuid(),v_payload);
    raise exception 'wrong lease accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.complete_ingredient_ai_nutrition_job(v_job,v_token,v_payload || '{"provider":"RDA"}');
    raise exception 'spoofed provider accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.complete_ingredient_ai_nutrition_job(v_job,v_token,jsonb_set(v_payload,'{values,energy_kcal}','0'));
    raise exception 'zero energy with macros accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.complete_ingredient_ai_nutrition_job(v_job,v_token,jsonb_set(v_payload,'{values,sugars_g}','90'));
    raise exception 'sugar exceeds carbohydrate accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.complete_ingredient_ai_nutrition_job(v_job,v_token,jsonb_set(v_payload,'{assumptions}','["api_key fixture-do-not-store"]'));
    raise exception 'secret-bearing assumption accepted';
  exception when invalid_parameter_value then null; end;
  update private.ingredient_ai_nutrition_settings set enabled=false where singleton;
  v_result := public.complete_ingredient_ai_nutrition_job(v_job,v_token,v_payload);
  if v_result ->> 'status' is distinct from 'disabled' then raise exception 'disabled apply ran'; end if;
  update private.ingredient_ai_nutrition_settings set enabled=true where singleton;

  -- A scoped production completion must not need the fixture writer bypass.
  if v_cutover is not null then perform public.set_account_generation_internal_writer_marker(v_cutover,false); end if;
  v_result := public.complete_ingredient_ai_nutrition_job(v_job,v_token,v_payload);
  if v_cutover is not null then perform public.set_account_generation_internal_writer_marker(v_cutover,true); end if;
  if v_result ->> 'status' is distinct from 'applied' then raise exception 'complete failed %',v_result; end if;
  v_profile := (v_result ->> 'profile_id')::uuid;
  select count(*) into v_before from public.nutrition_values where profile_id=v_profile;
  if v_before <> 8 then raise exception 'expected eight nullable nutrition values'; end if;
  if not exists (select 1 from public.nutrition_values where profile_id=v_profile and nutrient_code='sodium_mg'
    and value_status='missing' and amount is null) then raise exception 'missing sodium became zero'; end if;
  if not exists (select 1 from public.nutrition_values where profile_id=v_profile and nutrient_code='sugars_g'
    and value_status='estimated' and amount=0) then raise exception 'estimated zero lost provenance'; end if;
  if exists(select 1 from public.nutrition_values where profile_id=v_profile and value_status='observed') then
    raise exception 'AI values labelled observed';
  end if;
  if not exists(select 1 from public.nutrition_profiles profile
    join public.nutrition_source_items item on item.id=profile.source_item_id
    join public.nutrition_sources source on source.id=item.source_id
    where profile.id=v_profile and item.external_name='AI fixture main '||v_run
      and source.provider_code='HOMECOOK_AI_ESTIMATE'
      and source.source_url='https://app.mumeok.kr/about/ai-nutrition'
      and item.provenance_json->>'warning'='AI_NUTRITION_ESTIMATE_USED') then
    raise exception 'AI source identity/provenance mismatch';
  end if;
  v_replay := public.complete_ingredient_ai_nutrition_job(v_job,v_token,v_payload);
  if (v_replay->>'replayed')::boolean is distinct from true or v_replay->>'profile_id'<>v_result->>'profile_id' then
    raise exception 'completion not idempotent';
  end if;
  select count(*) into v_after from public.nutrition_values where profile_id=v_profile;
  if v_before<>v_after then raise exception 'replay changed values'; end if;
  begin
    update public.nutrition_values set amount=999 where profile_id=v_profile and nutrient_code='energy_kcal';
    raise exception 'immutable AI values changed';
  exception when raise_exception then
    if sqlerrm <> 'IMMUTABLE_NUTRITION_PAYLOAD' then raise; end if;
  end;

  -- An official primary arriving during model generation wins, even when its
  -- nutrient payload is incomplete. No AI profile or link is added for the race.
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_race_job;
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  v_claim:=public.claim_ingredient_ai_nutrition_job('sql-race',180);
  if (v_claim->>'job_id')::uuid<>v_race_job then raise exception 'wrong race claim'; end if;
  v_token:=(v_claim->>'lease_token')::uuid;
  perform set_config('request.path','/rpc/get_ingredient_ai_nutrition_context',true);
  v_context:=public.get_ingredient_ai_nutrition_context(v_race_job,v_token);
  v_payload:=v_payload||jsonb_build_object('context_hash',v_context->>'context_hash','generated_at',clock_timestamp());
  select standard_name into v_name from public.ingredients where id=v_race_ingredient;
  insert into public.nutrition_sources(id,provider_code,dataset_name,source_kind,source_version,
    fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,
    review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_source,'SQL_OFFICIAL_FIXTURE','SQL official '||v_run,'nutrition_dataset','v1',now(),now(),
    'current','https://example.org/official-fixture','fixture',repeat('c',64),'approved','fixture',v_actor,now(),true);
  insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,
    source_basis_amount,source_basis_unit,edible_portion_text,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
  values(v_item,v_source,'official',v_name,'as_published',100,'g','100g edible',repeat('d',64),'approved','fixture',v_actor,now());
  insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,
    basis_unit,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
  values(v_official_profile,v_item,'ingredient_source','mass_100g',100,'g','approved','fixture',v_actor,now(),true);
  insert into public.ingredient_nutrition_profiles(ingredient_id,nutrition_profile_id,preparation_state,
    match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active)
  values(v_race_ingredient,v_official_profile,'as_published','manual',true,'approved','fixture',v_actor,now(),1,true);
  perform set_config('request.path','/rpc/complete_ingredient_ai_nutrition_job',true);
  v_result:=public.complete_ingredient_ai_nutrition_job(v_race_job,v_token,v_payload);
  if v_result->>'status'<>'skipped' or v_result->>'reason'<>'NON_AI_PRIMARY_EXISTS' then
    raise exception 'official did not win: %',v_result;
  end if;
  if (select count(*) from public.ingredient_nutrition_profiles where ingredient_id=v_race_ingredient)<>1 then
    raise exception 'AI appended a link despite official primary';
  end if;
  begin
    insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
    values(v_official_profile,'energy_kcal','energy_kcal','kcal',10,'estimated');
    raise exception 'official source accepted estimated';
  exception when check_violation then null; end;

  -- Expired token fails after reclaim. Three attempts exhaust bounded retries;
  -- raw error text is never persisted.
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_retry_job;
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  v_claim:=public.claim_ingredient_ai_nutrition_job('sql-retry',180);
  v_expired_token:=(v_claim->>'lease_token')::uuid;
  update private.ingredient_ai_nutrition_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=v_retry_job;
  v_second:=public.claim_ingredient_ai_nutrition_job('sql-retry-2',180);
  if (v_second->>'job_id')::uuid<>v_retry_job or v_second->>'lease_token'=v_claim->>'lease_token' then
    raise exception 'lease was not reclaimed with a fresh token';
  end if;
  perform set_config('request.path','/rpc/get_ingredient_ai_nutrition_context',true);
  begin
    perform public.get_ingredient_ai_nutrition_context(v_retry_job,v_expired_token);
    raise exception 'expired previous token accepted';
  exception when serialization_failure then null; end;
  perform set_config('request.path','/rpc/fail_ingredient_ai_nutrition_job',true);
  v_result:=public.fail_ingredient_ai_nutrition_job(v_retry_job,(v_second->>'lease_token')::uuid,'secret raw provider text',true);
  if v_result->>'status'<>'queued' then raise exception 'second attempt should retry'; end if;
  if (select last_error_code from private.ingredient_ai_nutrition_jobs where id=v_retry_job)<>'INTERNAL_ERROR' then
    raise exception 'raw error was stored';
  end if;
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_retry_job;
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  v_claim:=public.claim_ingredient_ai_nutrition_job('sql-retry-3',180);
  perform set_config('request.path','/rpc/fail_ingredient_ai_nutrition_job',true);
  v_result:=public.fail_ingredient_ai_nutrition_job(v_retry_job,(v_claim->>'lease_token')::uuid,'MODEL_TIMEOUT',true);
  if v_result->>'status'<>'failed' or (select attempt_count from private.ingredient_ai_nutrition_jobs where id=v_retry_job)<>3 then
    raise exception 'maximum retry count not enforced';
  end if;

  -- Catalog metadata can arrive after the ingredient's insert trigger.
  insert into public.ingredient_catalog_groups(id,category,name) values(v_group,'기타','AI excluded '||v_run);
  insert into public.ingredient_catalog_entries(ingredient_id,group_id,display_name,presentation,review_state,review_version)
  values(v_excluded,v_group,'AI excluded fixture','excluded','reviewed','sql-fixture');
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_excluded_job;
  select claims_today into v_initial_budget from private.ingredient_ai_nutrition_settings where singleton;
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  v_result:=public.claim_ingredient_ai_nutrition_job('sql-excluded',180);
  if v_result->>'status'<>'skipped' or v_result->>'reason'<>'CATALOG_SCOPE_EXCLUDED' then
    raise exception 'excluded catalog ingredient claimed: %',v_result;
  end if;
  if (select claims_today from private.ingredient_ai_nutrition_settings where singleton)<>v_initial_budget then
    raise exception 'scope skip consumed generation budget';
  end if;
  update private.ingredient_ai_nutrition_settings set daily_limit=1,claims_today=1 where singleton;
  update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where id=v_budget_job;
  v_result:=public.claim_ingredient_ai_nutrition_job('sql-budget',180);
  if v_result->>'status'<>'budget_exhausted' or
    (select attempt_count from private.ingredient_ai_nutrition_jobs where id=v_budget_job)<>0 then
    raise exception 'daily budget exceeded';
  end if;
  update private.ingredient_ai_nutrition_settings set budget_date=(clock_timestamp() at time zone 'Asia/Seoul')::date-1 where singleton;
  v_result:=public.claim_ingredient_ai_nutrition_job('sql-next-day',180);
  if v_result->>'status'<>'claimed' or
    (select claims_today from private.ingredient_ai_nutrition_settings where singleton)<>1 then
    raise exception 'daily budget did not reset';
  end if;

  -- Queue-only fairness fixture, using existing live recipe IDs without changing
  -- their data. First ten may fail forever: the eleventh must still be returned
  -- at the front next time; another job must also get a turn.
  select array_agg(id order by id) into v_ids from
    (select id from public.recipes where deleted_at is null order by id limit 11) live;
  if cardinality(v_ids)<>11 then raise exception 'fairness test requires 11 seeded live recipes'; end if;
  update private.ingredient_ai_nutrition_jobs set pending_recipe_ids=array[v_fake]||v_ids,
    result=jsonb_build_object('affected_recipe_ids',to_jsonb(array[v_fake]||v_ids)),updated_at='1800-01-01'
    where id=v_job;
  update private.ingredient_ai_nutrition_jobs set status='succeeded',pending_recipe_ids=array[v_ids[1]],
    lease_token=null,lease_expires_at=null,
    result=jsonb_build_object('affected_recipe_ids',to_jsonb(array[v_ids[1]])),updated_at='1801-01-01'
    where id=v_budget_job;
  perform set_config('request.path','/rpc/list_ingredient_ai_nutrition_refresh_jobs',true);
  v_result:=public.list_ingredient_ai_nutrition_refresh_jobs(1);
  if (v_result->'jobs'->0->>'job_id')::uuid<>v_job
    or (v_result->'jobs'->0->'pending_recipe_ids'->>0)::uuid<>v_ids[1] then
    raise exception 'refresh ordering or deleted-reference pruning failed: %',v_result;
  end if;
  select pending_recipe_ids into v_stored from private.ingredient_ai_nutrition_jobs where id=v_job;
  if v_fake=any(v_stored) or v_stored[1]<>v_ids[11] or cardinality(v_stored)<>11 then
    raise exception 'refresh tail did not rotate: %',v_stored;
  end if;
  v_result:=public.list_ingredient_ai_nutrition_refresh_jobs(1);
  if (v_result->'jobs'->0->>'job_id')::uuid<>v_budget_job then raise exception 'next job starved'; end if;
  v_result:=public.list_ingredient_ai_nutrition_refresh_jobs(100);
  if not exists(select 1 from jsonb_array_elements(v_result->'jobs') j
    where (j->>'job_id')::uuid=v_job and (j->'pending_recipe_ids'->>0)::uuid=v_ids[11]) then
    raise exception 'eleventh recipe remains starved';
  end if;
  perform set_config('request.path','/rpc/acknowledge_ingredient_ai_nutrition_refresh',true);
  perform public.acknowledge_ingredient_ai_nutrition_refresh(v_job,array[v_ids[11]]);
  perform public.acknowledge_ingredient_ai_nutrition_refresh(v_job,array[v_ids[11]]);
  select pending_recipe_ids into v_stored from private.ingredient_ai_nutrition_jobs where id=v_job;
  if v_ids[11]=any(v_stored) then
    raise exception 'successful recipe ACK was not retained';
  end if;
  begin
    perform public.acknowledge_ingredient_ai_nutrition_refresh(v_job,array[gen_random_uuid()]);
    raise exception 'unrelated recipe ACK accepted';
  exception when insufficient_privilege then null; end;
end;
$jobs$;
rollback;
