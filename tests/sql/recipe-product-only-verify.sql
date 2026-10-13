-- Run after the rollback-only synthetic fixture on a verified owned rehearsal DB.
set local homecook.personal_recipe_v2='on';
set local homecook.snapshot_v2_creation='on';
do $verify$
declare
  v_rows jsonb; v_steps jsonb; v_result jsonb; v_recipe uuid; v_row uuid;
  v_key uuid:='79000000-0000-4000-8000-000000000010';
  v_owner uuid:='78000000-0000-4000-8000-000000000001';
  v_product uuid:='78000000-0000-4000-8000-000000000003';
  v_version uuid:='78000000-0000-4000-8000-000000000004';
  v_method uuid:='79000000-0000-4000-8000-000000000003';
  v_before bigint; v_guard jsonb; v_input jsonb; v_canonical jsonb;
  v_session uuid; v_cook jsonb; v_completion jsonb; v_complete_key uuid:=gen_random_uuid();
begin
  v_rows:=jsonb_build_array(jsonb_build_object('ingredient_id',null,'row_key',v_key,'source_kind','food_product',
    'food_product_id',v_product,'food_product_nutrition_version_id',v_version,'amount',0.5,'unit','package',
    'ingredient_type','QUANT','scalable',true,'sort_order',0));
  v_steps:=jsonb_build_array(jsonb_build_object('step_number',1,'instruction','0.5팩을 섞습니다. 원문 그대로',
    'cooking_method_id',v_method,'ingredients_used',jsonb_build_array(jsonb_build_object('ingredient_id',null,
    'row_key',v_key,'amount',0.5,'unit','package','cut_size',null))));
  v_result:=public.create_manual_recipe_with_managed_image(v_owner,'2026-01-01',repeat('7',64),1,null,null,
    '제품 단독 레시피',2,null,array[]::text[],'system_suggested',v_rows,v_steps);
  v_recipe:=(v_result->>'id')::uuid;
  select id into strict v_row from public.recipe_ingredients where recipe_id=v_recipe;
  if not exists(select 1 from public.recipe_ingredients where id=v_row and ingredient_id is null
    and food_product_id=v_product and food_product_nutrition_version_id=v_version and source_kind='food_product'
    and amount=0.5 and unit='package') then raise exception 'PRODUCT_ONLY_ROW_NOT_STORED'; end if;
  if not exists(select 1 from public.recipe_steps where recipe_id=v_recipe
    and instruction='0.5팩을 섞습니다. 원문 그대로' and ingredients_used->0->>'row_key'=v_row::text
    and ingredients_used->0->'ingredient_id'='null'::jsonb and ingredients_used->0->>'amount'='0.5') then
    raise exception 'STEP_MAPPING_OR_ORIGINAL_QUANTITY_CHANGED'; end if;
  select to_jsonb(input) into v_input from public.build_recipe_content_snapshot_input(v_recipe) input;
  if v_input->'ingredients_json'->0->>'row_key'<>v_row::text
    or v_input->'ingredients_json'->0->'ingredient_id'<>'null'::jsonb then raise exception 'CONTENT_SOURCE_KEYS_MISSING'; end if;
  v_guard:=public.build_recipe_nutrition_input_guard(v_recipe);
  if v_guard->'recipe_ingredients'->0->'product_predecessor'->'nutrition'->'profile'->>'id'<>'78000000-0000-4000-8000-000000000008'
    or v_guard->'recipe_ingredients'->0->'product_predecessor'->'nutrition' ? 'link' then raise exception 'PINNED_LABEL_BORROWED_GENERIC'; end if;

  -- Every invalid identity/unit/reference must roll back recipe and all child rows.
  foreach v_canonical in array array[
    jsonb_set(v_rows,'{0,food_product_nutrition_version_id}',to_jsonb('78000000-0000-4000-8000-000000000013'::text)),
    v_rows #- '{0,food_product_nutrition_version_id}',
    jsonb_set(v_rows,'{0,source_kind}','"ingredient"'),
    jsonb_set(v_rows,'{0,unit}','"ml"'),
    jsonb_set(v_rows,'{0,amount}','0'),
    v_rows||v_rows
  ] loop
    select count(*) into v_before from public.recipes;
    begin
      perform public.create_manual_recipe_with_managed_image(v_owner,'2026-01-01',repeat('7',64),1,null,null,
        '거부 대상',2,null,array[]::text[],'system_suggested',v_canonical,v_steps);
      raise exception 'INVALID_PRODUCT_ACCEPTED';
    exception when sqlstate '22023' or sqlstate 'P0001' then
      if sqlerrm='INVALID_PRODUCT_ACCEPTED' then raise; end if;
    end;
    if (select count(*) from public.recipes)<>v_before then raise exception 'INVALID_SELECTION_PARTIAL_RECIPE'; end if;
  end loop;
  select count(*) into v_before from public.recipes;
  begin
    perform public.create_manual_recipe_with_managed_image(v_owner,'2026-01-01',repeat('7',64),1,null,null,
      '가짜 참조',2,null,array[]::text[],'system_suggested',v_rows,
      jsonb_set(v_steps,'{0,ingredients_used,0,row_key}',to_jsonb(gen_random_uuid()::text)));
    raise exception 'FORGED_REF_ACCEPTED';
  exception when sqlstate '22023' then null; end;
  if (select count(*) from public.recipes)<>v_before then raise exception 'FORGED_REF_PARTIAL_RECIPE'; end if;

  insert into public.users(id,nickname,social_provider,social_id) values('79000000-0000-4000-8000-000000000002','검증 B','google','product-b');
  insert into public.pantry_items(id,user_id,food_product_id,food_product_nutrition_version_id) values
    ('79000000-0000-4000-8000-000000000031',v_owner,v_product,v_version),
    ('79000000-0000-4000-8000-000000000032',v_owner,v_product,'78000000-0000-4000-8000-000000000005'),
    ('79000000-0000-4000-8000-000000000033','79000000-0000-4000-8000-000000000002',v_product,v_version);
  insert into public.pantry_items(id,user_id,ingredient_id) values
    ('79000000-0000-4000-8000-000000000034',v_owner,'78000000-0000-4000-8000-000000000002');
  insert into public.recipe_content_snapshots(owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version)
    select owner_user_id,v_recipe,title,base_servings,ingredients_json,steps_json,content_hash,1
    from public.build_recipe_content_snapshot_input(v_recipe);
  v_result:=public.start_snapshot_v2_cooking_session(v_owner,'2026-01-01',repeat('7',64),1,'2026-01-02',gen_random_uuid(),
    'standalone',null,null,v_recipe,(select revision from public.recipes where id=v_recipe),2);
  v_session:=(v_result->'data'->>'session_id')::uuid;
  v_cook:=public.read_snapshot_v2_cook_mode(v_owner,'2026-01-01',repeat('7',64),1,'2026-01-02',v_session);
  if jsonb_array_length(v_cook->'data'->'pantry_candidates')<>1
    or v_cook->'data'->'pantry_candidates'->0->>'pantry_item_id'<>'79000000-0000-4000-8000-000000000031'
    or v_cook->'data'->'pantry_candidates'->0->'ingredient_id'<>'null'::jsonb then raise exception 'EXACT_PANTRY_CANDIDATE_MISSING'; end if;
  foreach v_row in array array['79000000-0000-4000-8000-000000000032'::uuid,'79000000-0000-4000-8000-000000000033'::uuid,'79000000-0000-4000-8000-000000000034'::uuid] loop
    begin
      perform public.complete_snapshot_v2_cooking_session(v_owner,'2026-01-01',repeat('7',64),1,'2026-01-02',v_session,
        gen_random_uuid(),array[v_row],'weigh_later',null);
      raise exception 'WRONG_PANTRY_ACCEPTED';
    exception when sqlstate '22023' or sqlstate 'P0002' then null; end;
  end loop;
  v_completion:=public.complete_snapshot_v2_cooking_session(v_owner,'2026-01-01',repeat('7',64),1,'2026-01-02',v_session,
    v_complete_key,array['79000000-0000-4000-8000-000000000031'::uuid],'weigh_later',null);
  if v_completion is distinct from public.complete_snapshot_v2_cooking_session(v_owner,'2026-01-01',repeat('7',64),1,'2026-01-02',v_session,
    v_complete_key,array['79000000-0000-4000-8000-000000000031'::uuid],'weigh_later',null)
    or exists(select 1 from public.pantry_items where id='79000000-0000-4000-8000-000000000031')
    or (select count(*) from public.pantry_items where id in ('79000000-0000-4000-8000-000000000032','79000000-0000-4000-8000-000000000033','79000000-0000-4000-8000-000000000034'))<>3
    then raise exception 'PANTRY_CONSUMPTION_OR_REPLAY_WRONG'; end if;

  -- Public projection remains exact-recipe only, including for anon/B, with no table grant.
  perform public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
  update public.recipes set visibility='public' where id=v_recipe;
  if jsonb_array_length(public.read_public_recipe_product_sources(v_recipe))<>1 then raise exception 'PUBLIC_PRODUCT_LABEL_MISSING'; end if;
  if public.read_public_recipe_product_sources(gen_random_uuid())<>'[]'::jsonb then raise exception 'FORGED_RECIPE_EXPOSED'; end if;
  update public.recipes set visibility='private' where id=v_recipe;
  if public.read_public_recipe_product_sources(v_recipe)<>'[]'::jsonb then raise exception 'PRIVATE_RECIPE_EXPOSED'; end if;
  update private.recipe_product_only_write_control set enabled=false where singleton;
  if private.recipe_product_nutrition_predecessor(v_product,v_version,null) is null then raise exception 'PAUSE_CHANGED_EXISTING_PRODUCT_NUTRITION'; end if;
  if public.build_recipe_nutrition_input_guard(v_recipe)->'recipe_ingredients'->0->'product_predecessor' is null then raise exception 'PAUSE_CHANGED_PRODUCT_READER'; end if;
  begin
    update public.recipe_ingredients set amount=2 where recipe_id=v_recipe and ingredient_id is null;
    raise exception 'PAUSED_PRODUCT_UPDATE_ACCEPTED';
  exception when sqlstate '22023' then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise; end if; end;
  select count(*) into v_before from public.recipes;
  begin
    perform public.create_manual_recipe_with_managed_image(v_owner,'2026-01-01',repeat('7',64),1,null,null,
      '중지된 제품 저장',2,null,array[]::text[],'system_suggested',v_rows,v_steps);
    raise exception 'PAUSED_PRODUCT_INSERT_ACCEPTED';
  exception when sqlstate '22023' then if sqlerrm<>'RECIPE_PRODUCT_UNAVAILABLE' then raise; end if; end;
  if (select count(*) from public.recipes)<>v_before then raise exception 'PAUSED_WRITE_PARTIAL_RECIPE'; end if;
  perform private.write_recipe_source_rows(v_recipe,v_owner,jsonb_build_array(jsonb_build_object(
    'ingredient_id','78000000-0000-4000-8000-000000000002','amount',20,'unit','g','ingredient_type','QUANT',
    'component_label','pause-generic','scalable',true)),'[]',false);
  insert into public.food_product_ingredient_links(product_id,ingredient_id,relation,review_status,is_primary,is_active,source,decision_reason,reviewed_at)
    values('78000000-0000-4000-8000-000000000012','78000000-0000-4000-8000-000000000002','represents','approved',true,true,'isolated','fixture only',now());
  perform private.write_recipe_source_rows(v_recipe,v_owner,jsonb_build_array(jsonb_build_object(
    'ingredient_id','78000000-0000-4000-8000-000000000002','food_product_id','78000000-0000-4000-8000-000000000012',
    'food_product_nutrition_version_id','78000000-0000-4000-8000-000000000013','amount',20,'unit','g','ingredient_type','QUANT',
    'component_label','pause-linked','scalable',true)),'[]',false);
  if (select count(*) from public.recipe_ingredients where recipe_id=v_recipe and ingredient_id is not null)<>2 then raise exception 'PAUSE_BLOCKED_GENERIC_OR_LINKED'; end if;
  if has_function_privilege('anon','private.write_recipe_source_rows(uuid,uuid,jsonb,jsonb,boolean)','EXECUTE')
    or has_function_privilege('authenticated','private.write_recipe_source_rows(uuid,uuid,jsonb,jsonb,boolean)','EXECUTE')
    or has_table_privilege('authenticated','private.recipe_product_only_write_control','UPDATE')
    or has_table_privilege('anon','private.recipe_product_only_write_control','UPDATE') then raise exception 'PRODUCT_PRIVILEGE_WIDENED'; end if;

  -- All-null and null-marker nullable rows fail the new check, and the pair FK remains.
  update private.recipe_product_only_write_control set enabled=true where singleton;
  begin
    insert into public.recipe_ingredients(recipe_id,ingredient_id,food_product_id,food_product_nutrition_version_id,
      amount,unit,ingredient_type,sort_order) values(v_recipe,null,v_product,v_version,1,'g','QUANT',1);
    raise exception 'NULL_SOURCE_MARKER_ACCEPTED';
  exception when check_violation then null; end;
end;
$verify$;
select jsonb_build_object('status','PASS','checks',array['product_only_managed_write','same_transaction_row_mapping','quantity_and_instruction_unchanged','exact_immutable_version_without_representative','invalid_selection_atomic','forged_row_ref_atomic','v2_start_exact_pantry_reader','wrong_version_foreign_owner_and_generic_pantry_rejected','exact_pantry_consumption_and_idempotent_replay','public_projection_exact_recipe','private_recipe_not_exposed','private_helper_and_write_control_acl','pause_existing_product_read_and_nutrition','pause_product_write_atomic','pause_generic_and_linked_write_unchanged','nullable_source_constraint']);
rollback;
