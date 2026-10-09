-- Run only against the owned full seeded clone, after 20261009130000.
-- No persistent application data changes; verifies real approved fixture rows.
begin;
set local statement_timeout='60s';
do $verify$
declare v_unit text; v_candidates jsonb; v_selected jsonb; v_bad jsonb; v_id uuid;
  v_state text; v_guard jsonb; v_sources jsonb; v_expected jsonb; v_recipe uuid;
begin
  foreach v_unit in array array['개','알','통','piece','pieces','PIECES'] loop
    if private.ingredient_piece_unit_family(v_unit) is distinct from 'count' then
      raise exception 'count family failed: %',v_unit;
    end if;
  end loop;
  foreach v_unit in array array['1개','2개','1줌','쪽','종이컵','mg','11개','1.0개'] loop
    if private.ingredient_piece_unit_family(v_unit) is not null then
      raise exception 'unsupported input accepted: %',v_unit;
    end if;
  end loop;
  if private.ingredient_piece_unit_family('1 줌',true) is distinct from 'handful'
    or private.ingredient_piece_unit_family('1개',true) is distinct from 'count'
    or private.ingredient_piece_unit_family('2개',true) is not null
    or private.ingredient_piece_unit_family('11개',true) is not null
    or private.ingredient_piece_unit_family('1.0개',true) is not null then
    raise exception 'observation prefix contract failed';
  end if;
  select id into strict v_id from public.ingredients where standard_name='대파';
  v_candidates:=private.ingredient_piece_candidates(v_id);
  select candidate->>'preparation_state' into strict v_state
    from jsonb_array_elements(v_candidates) candidate where candidate->>'size_code'='handful';
  v_selected:=private.select_ingredient_piece_candidate(v_candidates,'줌',v_state);
  if (v_selected->>'weight_g')::numeric is distinct from 30 then
    raise exception '대파 handful must use approved 30g: %',v_selected;
  end if;
  if (private.select_ingredient_piece_candidate(v_candidates,'대',v_state)->>'weight_g')::numeric is distinct from 100 then
    raise exception '대파 stalk must retain 100g';
  end if;
  foreach v_unit in array array['개','장','모','꼬집'] loop
    if private.select_ingredient_piece_candidate(v_candidates,v_unit,v_state) is not null then
      raise exception '대파 incompatible family accepted: %',v_unit;
    end if;
  end loop;
  if private.select_ingredient_piece_candidate(v_candidates,'줌','wrong-state') is not null
    or private.select_ingredient_piece_candidate(v_candidates||jsonb_build_array(v_selected),'줌',v_state) is not null then
    raise exception 'state or ambiguity guard failed';
  end if;
  for v_bad in select value from jsonb_array_elements(jsonb_build_array(
    v_selected||'{"source_observed_unit":"개"}',
    v_selected||'{"source_observed_amount":2}',
    v_selected||'{"observed_weight_g":60}',
    v_selected||'{"weight_g":0}',
    v_selected||'{"size_code":"medium"}',
    v_selected||'{"evidence_size_code":"medium"}',
    v_selected||'{"evidence_preparation_state":"wrong-state"}',
    v_selected||'{"evidence_kind":"volume_weight"}'
  )) loop
    if private.select_ingredient_piece_candidate(jsonb_build_array(v_bad),'줌',v_state) is not null then
      raise exception 'invalid candidate accepted: %',v_bad;
    end if;
  end loop;
  select id into strict v_id from public.ingredients where standard_name='양파';
  v_candidates:=private.ingredient_piece_candidates(v_id);
  v_state:=v_candidates->0->>'preparation_state';
  if private.select_ingredient_piece_candidate(v_candidates,'장',v_state) is not null then
    raise exception '양파 sheet borrowed whole onion weight';
  end if;
  -- Actual recipe guard includes all candidate observations; source attribution
  -- consumes that selected candidate instead of reloading a medium default.
  select ri.recipe_id into v_recipe from public.recipe_ingredients ri
    join public.ingredients i on i.id=ri.ingredient_id
    where i.standard_name='대파' and ri.unit='줌' limit 1;
  if v_recipe is null then raise exception 'seeded handful recipe missing'; end if;
  v_guard:=public.build_recipe_nutrition_input_guard(v_recipe);
  select ingredient into strict v_selected from jsonb_array_elements(v_guard->'recipe_ingredients') ingredient
    join public.ingredients i on i.id=(ingredient->>'ingredient_id')::uuid
    where i.standard_name='대파' and ingredient->>'unit'='줌';
  if v_selected->>'selected_piece_weight_id' is null
    or not (v_selected ? 'piece_candidates') then raise exception 'actual guard missing piece provenance'; end if;
  v_sources:=private.recipe_nutrition_sources_pre_product_20260922(
    jsonb_build_object('recipe_ingredients',jsonb_build_array(v_selected)));
  select candidate->'source' into strict v_expected
    from jsonb_array_elements(v_selected->'piece_candidates') candidate
    where candidate->>'piece_weight_id'=v_selected->>'selected_piece_weight_id';
  if not (v_sources @> jsonb_build_array(v_expected)) then raise exception 'handful source absent'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in ('ingredient_piece_unit_family','ingredient_piece_default_size',
      'ingredient_piece_observation_matches','ingredient_piece_candidates','select_ingredient_piece_candidate')
    and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE')
      or has_function_privilege('service_role',p.oid,'EXECUTE'))) then
    raise exception 'private helper privileges expanded';
  end if;
end;
$verify$;
-- A new synthetic account/session uses the clone's existing real authority and
-- generation guard. No authority singleton, policy or function is replaced.
set local request.jwt.claim.role='service_role';
do $meal_verify$
declare
  v_owner uuid:='ed091300-0000-4000-8000-000000000001';
  v_column uuid:='ed091300-0000-4000-8000-000000000002';
  v_entry uuid:='ed091300-0000-4000-8000-000000000003';
  v_legacy uuid:='ed091300-0000-4000-8000-000000000004';
  v_identity timestamptz:=clock_timestamp()-interval '1 day';
  v_issued timestamptz:=clock_timestamp();
  v_control private.full_local_auth_control%rowtype; v_cutover uuid;
  v_scallion uuid; v_onion uuid; v_payload jsonb; v_preview jsonb; v_saved jsonb; v_frozen jsonb;
  v_result jsonb; v_revision bigint; v_test_role text:=current_user;
begin
  select * into strict v_control from private.full_local_auth_control where singleton;
  select current_cutover_attempt_id into strict v_cutover from public.account_generation_capability_state where singleton;
  if v_control.authority<>'local' or not v_control.flows_open then raise exception 'local clone authority unavailable'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  insert into auth.users(id,created_at,email) values(v_owner,v_identity,'piece-runtime-test@example.invalid');
  insert into public.users(id,nickname,social_provider,social_id)
    values(v_owner,'PIECE UNIT TEST','google','piece-runtime-test') on conflict(id) do nothing;
  insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values(v_owner,1);
  insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
    values(v_owner,1,v_identity,'runtime','active',now());
  insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
    auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,
    session_issued_at,last_token_issued_at,binding_expires_at)
    values(repeat('d',64),v_control.hmac_key_version,v_owner,1,v_identity,'active','local',v_control.local_issuer,
      v_issued,v_control.cutover_epoch,v_issued,v_issued,now()+interval '1 day');
  insert into public.meal_plan_columns(id,user_id,name,sort_order) values(v_column,v_owner,'TEST',0);
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  select id into strict v_scallion from public.ingredients where standard_name='대파';
  select id into strict v_onion from public.ingredients where standard_name='양파';
  v_payload:=jsonb_build_object('consumed_local_date',current_date,'timezone_name_snapshot','Asia/Seoul',
    'consumed_at',null,'meal_plan_column_id',v_column,'source',jsonb_build_object('type','ingredient','id',v_scallion),
    'quantity',jsonb_build_object('amount',1,'unit','줌'));
  perform set_config('role','service_role',true);
  v_preview:=public.preview_meal_log_nutrition(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,'ingredient',v_scallion,1,'줌');
  v_result:=public.mutate_meal_log_entry(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,
    'create',v_entry,extensions.gen_random_uuid(),null,v_payload);
  perform set_config('role',v_test_role,true);
  select nutrition_evidence_json,revision into strict v_saved,v_revision from public.meal_log_entries where id=v_entry;
  if v_saved is distinct from v_preview then raise exception 'handful preview/writer mismatch'; end if;
  if v_preview is distinct from public.preview_meal_log_nutrition(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,'ingredient',v_scallion,30,'g') then
    raise exception 'handful preview does not equal 30g';
  end if;
  v_payload:=jsonb_set(v_payload,'{quantity,amount}','2');
  v_result:=public.mutate_meal_log_entry(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,
    'patch',v_entry,extensions.gen_random_uuid(),v_revision,v_payload);
  select nutrition_evidence_json into strict v_saved from public.meal_log_entries where id=v_entry;
  if v_saved is distinct from public.preview_meal_log_nutrition(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,'ingredient',v_scallion,60,'g') then
    raise exception 'pinned handful quantity change does not equal 60g';
  end if;
  -- Simulate an old wrong-family row using only this synthetic entry. The
  -- original frozen nutrition remains valid history; a changed amount must not
  -- continue borrowing whole-onion evidence for sheets.
  v_payload:=jsonb_set(v_payload,'{source,id}',to_jsonb(v_onion));
  v_payload:=jsonb_set(v_payload,'{quantity}',jsonb_build_object('amount',1,'unit','개'));
  v_result:=public.mutate_meal_log_entry(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,
    'create',v_legacy,extensions.gen_random_uuid(),null,v_payload);
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  update public.meal_log_entries set actual_unit='장' where id=v_legacy;
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  select nutrition_evidence_json,revision into strict v_frozen,v_revision from public.meal_log_entries where id=v_legacy;
  v_payload:=jsonb_set(v_payload,'{quantity,unit}','"장"');
  v_result:=public.mutate_meal_log_entry(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,
    'patch',v_legacy,extensions.gen_random_uuid(),v_revision,v_payload);
  select nutrition_evidence_json,revision into strict v_saved,v_revision from public.meal_log_entries where id=v_legacy;
  if v_saved is distinct from v_frozen then raise exception 'same quantity rewrote frozen nutrition'; end if;
  begin
    v_payload:=jsonb_set(v_payload,'{quantity,amount}','2');
    perform public.mutate_meal_log_entry(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,
      'patch',v_legacy,extensions.gen_random_uuid(),v_revision,v_payload);
    raise exception 'wrong-family legacy quantity change accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'UNIT_CONVERSION_MISSING' then raise; end if;
  end;
  begin
    perform public.preview_meal_log_nutrition(v_owner,v_identity,repeat('d',64),v_control.hmac_key_version,v_issued,'ingredient',v_onion,1,'장');
    raise exception 'wrong-family preview accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'UNIT_CONVERSION_MISSING' then raise; end if;
  end;
end;
$meal_verify$;
select jsonb_build_object('status','PASS','checks',array[
  'piece_families','source_only_literal_one_prefix','handful_30g','stalk_100g',
  'onion_sheet_rejected','wrong_state_size_observation_rejected','ambiguous_candidate_rejected',
  'actual_guard_piece_provenance','contributing_piece_source','private_invoker_helpers',
  'meal_preview_writer_30g','pinned_quantity_change_60g','historical_same_quantity_frozen','legacy_wrong_family_quantity_rejected']);
rollback;
