-- Owned full-local clone only, after 20261011200000. All fixtures roll back.
begin;
set local statement_timeout='60s';
do $helpers$
declare v_unit text; v_bad jsonb; v_candidate jsonb := '{
  "piece_weight_id":"f0112000-0000-4000-8000-000000000001",
  "preparation_state":"raw","evidence_preparation_state":"raw",
  "size_code":"household_spoon","evidence_size_code":"household_spoon",
  "evidence_kind":"piece_weight","weight_g":9,"observed_weight_g":9,
  "source_observed_amount":1,"source_observed_unit":"1 밥숟가락"}';
begin
  if private.ingredient_piece_unit_family('밥숟가락') is distinct from 'household_spoon'
    or private.ingredient_piece_default_size('밥숟가락') is distinct from 'household_spoon'
    or private.ingredient_piece_unit_family('1 밥숟가락',true) is distinct from 'household_spoon'
    or private.select_ingredient_piece_candidate(jsonb_build_array(v_candidate),'밥숟가락','raw') is distinct from v_candidate then
    raise exception 'HOUSEHOLD_SPOON_CANONICAL_FAILED';
  end if;
  foreach v_unit in array array['스푼','숟가락','숟갈','밥숟갈','큰술','작은술','T','t','tbsp','tsp','1밥숟가락','2밥숟가락','밥 숟가락'] loop
    if private.ingredient_piece_unit_family(v_unit) is not null
      or private.select_ingredient_piece_candidate(jsonb_build_array(v_candidate),v_unit,'raw') is not null then
      raise exception 'LEGACY_OR_UNSUPPORTED_UNIT_CHANGED: %',v_unit;
    end if;
  end loop;
  if public.normalize_recipe_nutrition_unit('밥숟가락') is distinct from '밥숟가락'
    or public.normalize_recipe_nutrition_unit('T') is distinct from 'tbsp'
    or public.normalize_recipe_nutrition_unit('t') is distinct from 'tsp' then
    raise exception 'UNIT_NORMALIZATION_CHANGED';
  end if;
  foreach v_unit in array array['스푼','숟가락','숟갈','밥숟갈','큰술','왕큰술'] loop
    if public.normalize_recipe_nutrition_unit(v_unit) is distinct from 'tbsp' then
      raise exception 'LEGACY_VOLUME_UNIT_CHANGED: %',v_unit;
    end if;
  end loop;
  foreach v_unit in array array['개','장','대','모','줌','꼬집'] loop
    if private.select_ingredient_piece_candidate(jsonb_build_array(v_candidate),v_unit,'raw') is not null then
      raise exception 'CROSS_FAMILY_WEIGHT_ACCEPTED: %',v_unit;
    end if;
  end loop;
  if private.select_ingredient_piece_candidate(jsonb_build_array(v_candidate,v_candidate),'밥숟가락','raw') is not null
    or private.select_ingredient_piece_candidate(jsonb_build_array(v_candidate),'밥숟가락','cooked') is not null then
    raise exception 'AMBIGUITY_OR_PREPARATION_ACCEPTED';
  end if;
  for v_bad in select value from jsonb_array_elements(jsonb_build_array(
    v_candidate||'{"source_observed_amount":2}',
    v_candidate||'{"source_observed_unit":"2밥숟가락"}',
    v_candidate||'{"source_observed_unit":"1숟가락"}',
    v_candidate||'{"source_observed_unit":"1개"}',
    v_candidate||'{"observed_weight_g":10}',
    v_candidate||'{"weight_g":0}',
    v_candidate||'{"size_code":"medium"}',
    v_candidate||'{"evidence_size_code":"medium"}',
    v_candidate||'{"evidence_preparation_state":"cooked"}',
    v_candidate||'{"evidence_kind":"volume_weight"}'
  )) loop
    if private.select_ingredient_piece_candidate(jsonb_build_array(v_bad),'밥숟가락','raw') is not null then
      raise exception 'INVALID_OBSERVATION_ACCEPTED: %',v_bad;
    end if;
  end loop;
  if exists(select 1 from pg_proc p where p.oid in (
    'private.ingredient_piece_unit_family(text,boolean)'::regprocedure,
    'private.ingredient_piece_default_size(text)'::regprocedure)
    and (p.proowner<>'postgres'::regrole or p.prosecdef
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE')
      or has_function_privilege('service_role',p.oid,'EXECUTE'))) then
    raise exception 'PRIVATE_HELPER_AUTHORITY_CHANGED';
  end if;
end;
$helpers$;
-- Real synthetic lifecycle/session fixtures; no auth guard or singleton changes.
set local request.jwt.claim.role='service_role';
-- Exercise the feature's existing test gate; lifecycle/session/owner checks remain active.
set local homecook.personal_recipe_v2='on';
do $writers$
declare
  v_owner uuid:='f0112000-0000-4000-8000-000000000002';
  v_identity timestamptz:=clock_timestamp()-interval '1 day';
  v_issued timestamptz:=clock_timestamp();
  v_control private.full_local_auth_control%rowtype; v_cutover uuid;
  v_test_role text:=current_user; v_ingredient uuid; v_other uuid;
  v_ingredients jsonb; v_steps jsonb; v_draft jsonb; v_nutrition jsonb;
  v_result jsonb; v_payload jsonb; v_recipe uuid; v_manual uuid; v_key uuid:=extensions.gen_random_uuid();
  v_replay jsonb; v_revision bigint; v_unavailable jsonb;
begin
  select * into strict v_control from private.full_local_auth_control where singleton;
  select current_cutover_attempt_id into strict v_cutover from public.account_generation_capability_state where singleton;
  if v_control.authority<>'local' or not v_control.flows_open then raise exception 'LOCAL_AUTHORITY_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  insert into auth.users(id,created_at,email) values(v_owner,v_identity,'household-spoon-test@example.invalid');
  insert into public.users(id,nickname,social_provider,social_id)
    values(v_owner,'HOUSEHOLD SPOON TEST','google','household-spoon-test') on conflict(id) do nothing;
  insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values(v_owner,1);
  insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
    values(v_owner,1,v_identity,'runtime','active',now());
  insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
    auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,
    session_issued_at,last_token_issued_at,binding_expires_at)
    values(repeat('e',64),v_control.hmac_key_version,v_owner,1,v_identity,'active','local',v_control.local_issuer,
      v_issued,v_control.cutover_epoch,v_issued,v_issued,now()+interval '1 day');
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  select id into strict v_ingredient from public.ingredients where standard_name='다진마늘';
  v_ingredients:=jsonb_build_array(jsonb_build_object('ingredient_id',v_ingredient,'ingredient_type','QUANT',
    'amount',1,'unit','밥숟가락','display_text','다진마늘 1밥숟가락','scalable',true));
  v_steps:=jsonb_build_array(jsonb_build_object('step_number',1,'instruction','넣는다',
    'ingredients_used','[]'::jsonb,'cooking_method_id',(select id from public.cooking_methods order by id limit 1)));
  v_draft:=jsonb_build_object('title','Household spoon SQL test','base_servings',1,'ingredients',v_ingredients,'steps',v_steps);
  v_unavailable:='{"status":"unavailable","amount":null,"known_amount":null,"display_mode":null}';
  v_nutrition:=jsonb_build_object('calculation_version','personal-recipe-v2','scalable_values','{}'::jsonb,'fixed_values','{}'::jsonb,
    'nutrient_status',jsonb_build_object('energy_kcal',v_unavailable,'carbohydrate_g',v_unavailable,'protein_g',v_unavailable,'fat_g',v_unavailable,'sodium_mg',v_unavailable),
    'calculation_status','unavailable','calculation_quality',null,'reflected_ingredient_count',0,'target_ingredient_count',1,
    'missing_reasons',jsonb_build_array('UNIT_CONVERSION_MISSING:'||v_ingredient),'warnings','[]'::jsonb,'sources','[]'::jsonb);
  -- Create an ordinary g source through the real manual API writer.
  v_payload:=jsonb_build_object('p_title','Household spoon manual test','p_base_servings',1,
    'p_tags','[]'::jsonb,'p_tag_source','user_reviewed',
    'p_ingredients',jsonb_set(v_ingredients,'{0,unit}','"g"'),'p_steps',v_steps);
  perform set_config('role','service_role',true);
  v_result:=public.create_manual_recipe_recoverable(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,
    v_issued,extensions.gen_random_uuid(),v_payload,v_payload);
  perform set_config('role',v_test_role,true);
  select id into strict v_manual from public.recipes where created_by=v_owner and title='Household spoon manual test';
  if not exists(select 1 from public.recipe_ingredients where recipe_id=v_manual and unit='g' and amount=1) then
    raise exception 'MANUAL_G_UNIT_NOT_SAVED';
  end if;
  -- Simulate only the reviewed DB correction on this rollback-only fixture.
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  update public.recipe_ingredients set unit='밥숟가락' where recipe_id=v_manual;
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  perform set_config('role','service_role',true);
  v_result:=public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
    'fork',null,v_manual,1,v_draft,v_nutrition,'[]',null,null,v_key);
  v_replay:=public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
    'fork',null,v_manual,1,v_draft,v_nutrition,'[]',null,null,v_key);
  if v_result is distinct from v_replay then raise exception 'PERSONAL_REPLAY_CHANGED'; end if;
  perform set_config('role',v_test_role,true);
  select id,revision into strict v_recipe,v_revision from public.recipes where created_by=v_owner and title='Household spoon SQL test';
  if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and unit='밥숟가락' and amount=1) then
    raise exception 'TRUSTED_SOURCE_UNIT_NOT_FORKED';
  end if;
  v_draft:=jsonb_set(v_draft,'{ingredients,0,amount}','2');
  perform set_config('role','service_role',true);
  v_result:=public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
    'update',v_recipe,null,v_revision,v_draft,v_nutrition,'[]',null,null,extensions.gen_random_uuid());
  perform set_config('role',v_test_role,true);
  if not exists(select 1 from public.recipe_ingredients where recipe_id=v_recipe and unit='밥숟가락' and amount=2) then
    raise exception 'TRUSTED_SOURCE_UNIT_NOT_EDITED';
  end if;
  v_draft:=jsonb_set(v_draft,'{ingredients,0,amount}','1');
  -- Neither writer allows an unsourced new canonical household unit.
  perform set_config('role','service_role',true);
  begin
    v_payload:=jsonb_set(v_payload,'{p_ingredients}',v_ingredients);
    perform public.create_manual_recipe_recoverable(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,
      v_issued,extensions.gen_random_uuid(),v_payload,v_payload);
    raise exception 'MANUAL_UNSOURCED_HOUSEHOLD_UNIT_ACCEPTED';
  exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  begin
    perform public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
      'create',null,null,null,v_draft,v_nutrition,'[]',null,null,extensions.gen_random_uuid());
    raise exception 'PERSONAL_UNSOURCED_HOUSEHOLD_UNIT_ACCEPTED';
  exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  -- The trusted-source exception remains scoped to the same ingredient/component.
  v_draft:=jsonb_set(v_draft,'{ingredients,0,component_label}','"different component"');
  begin
    perform public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
      'fork',null,v_manual,1,v_draft,v_nutrition,'[]',null,null,extensions.gen_random_uuid());
    raise exception 'UNKNOWN_UNIT_BORROWED_FROM_OTHER_COMPONENT';
  exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  v_draft:=v_draft #- '{ingredients,0,component_label}';
  perform set_config('role',v_test_role,true);
  select id into strict v_other from public.ingredients where standard_name='양파';
  v_draft:=jsonb_set(v_draft,'{ingredients,0,ingredient_id}',to_jsonb(v_other));
  perform set_config('role','service_role',true);
  begin
    perform public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
      'fork',null,v_manual,1,v_draft,v_nutrition,'[]',null,null,extensions.gen_random_uuid());
    raise exception 'UNKNOWN_UNIT_BORROWED_FROM_OTHER_INGREDIENT';
  exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
  v_draft:=jsonb_set(v_draft,'{ingredients,0,ingredient_id}',to_jsonb(v_ingredient));
  begin
    perform public.create_manual_recipe_recoverable(v_owner,v_identity,repeat('f',64),v_control.hmac_key_version,
      v_issued,extensions.gen_random_uuid(),v_payload,v_payload);
    raise exception 'MANUAL_INVALID_SESSION_ACCEPTED';
  exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise; end if; end;
  perform set_config('role',v_test_role,true);
  select id into strict v_other from public.recipes where created_by is distinct from v_owner and visibility='public' and deleted_at is null limit 1;
  v_draft:=jsonb_set(v_draft,'{ingredients,0,unit}','"밥숟가락"');
  perform set_config('role','service_role',true);
  begin
    perform public.write_personal_recipe_core(v_owner,v_identity,repeat('e',64),v_control.hmac_key_version,v_issued,
      'update',v_other,null,1,v_draft,v_nutrition,'[]',null,null,extensions.gen_random_uuid());
    raise exception 'PERSONAL_WRONG_OWNER_ACCEPTED';
  exception when sqlstate '42501' then if sqlerrm<>'FORBIDDEN' then raise; end if;
    when sqlstate 'P0002' then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
  perform set_config('role',v_test_role,true);
end;
$writers$;
select jsonb_build_object('status','PASS','checks',array[
 'canonical_family_and_size','legacy_units_unchanged','volume_normalization_unchanged','cross_family_rejected','source_literal_one_only',
 'preparation_size_weight_amount_guard','ambiguity_rejected','private_helper_privileges',
 'manual_g_source_created','trusted_source_unit_forked','trusted_source_unit_edited','personal_writer_idempotency',
 'manual_unsourced_household_unit_rejected','personal_unsourced_household_unit_rejected',
 'source_component_exception_scoped','source_ingredient_exception_scoped','invalid_session_rejected','wrong_owner_rejected']);
rollback;
