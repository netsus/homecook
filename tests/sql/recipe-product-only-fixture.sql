begin;
set local request.jwt.claim.role='service_role';
update private.recipe_product_only_write_control set enabled=true where singleton;
set local session_replication_role=replica;
insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at) values(true,'local','https://auth.product-only.invalid/auth/v1',2,1,true,'2026-01-01') on conflict(singleton) do update set authority='local',local_issuer=excluded.local_issuer,cutover_epoch=2,hmac_key_version=1,flows_open=true;
insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('79000000-0000-4000-8000-000000000001','promoted',2,'{}');
insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'79000000-0000-4000-8000-000000000001','2026-01-01') on conflict(singleton) do update set state='generation_active',revision=2,current_cutover_attempt_id=excluded.current_cutover_attempt_id;
insert into private.ingredient_ai_nutrition_settings(singleton,enabled,model_id,reviewed_by) values(true,false,'fixture-disabled',null) on conflict(singleton) do nothing;
set local session_replication_role=origin;
select public.set_account_generation_internal_writer_marker('79000000-0000-4000-8000-000000000001',true);
insert into auth.users(id,created_at,email) values('78000000-0000-4000-8000-000000000001','2026-01-01','product-a@example.invalid'),('79000000-0000-4000-8000-000000000002','2026-01-01','product-b@example.invalid');
insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('78000000-0000-4000-8000-000000000001',1),('79000000-0000-4000-8000-000000000002',1);
insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at) values('78000000-0000-4000-8000-000000000001',1,'2026-01-01','runtime','active',now()),('79000000-0000-4000-8000-000000000002',1,'2026-01-01','runtime','active',now());
insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,last_token_issued_at,binding_expires_at) values
  (repeat('7',64),1,'78000000-0000-4000-8000-000000000001',1,'2026-01-01','active','local','https://auth.product-only.invalid/auth/v1',now(),2,'2026-01-02','2026-01-02','2099-01-01'),
  (repeat('8',64),1,'79000000-0000-4000-8000-000000000002',1,'2026-01-01','active','local','https://auth.product-only.invalid/auth/v1',now(),2,'2026-01-02','2026-01-02','2099-01-01');


  set local request.jwt.claim.role = 'service_role';
  set local request.jwt.claims = '{"role":"service_role","sub":"78000000-0000-4000-8000-000000000001"}';
  set constraints all deferred;
  insert into public.users (id, nickname, social_provider, social_id)
    values ('78000000-0000-4000-8000-000000000001', '영양 제품 검증', 'google', 'product-nutrition-test');
  insert into public.ingredients (id, standard_name, category, default_unit)
    values ('78000000-0000-4000-8000-000000000002', '영양 제품 검증 재료', '유제품', 'g');
  insert into public.nutrition_sources (
    id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank,
    source_url, license_name, license_url, manifest_sha256, review_status,
    decision_reason, reviewed_by, reviewed_at, is_active
  ) values ('78000000-0000-4000-8000-000000000006', 'MFDS', 'Product nutrition fixture', 'nutrition_dataset', '2026-09-22', '2026-09-22',
    now(), now(), 'current', 1, 'https://example.test/product-nutrition', 'test-only',
    'https://example.test/license', repeat('b',64), 'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now(), true);
  insert into public.nutrition_source_items (
    id, source_id, external_item_key, external_name, preparation_state,
    source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
    stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
  ) values ('78000000-0000-4000-8000-000000000007', '78000000-0000-4000-8000-000000000006', 'product-pinned-label', '제품 라벨', 'raw-edible',
    '100g', 100, 'g', 100, repeat('c',64), 'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now());
  insert into public.nutrition_sources (
    id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank,
    source_url, license_name, license_url, manifest_sha256, review_status,
    decision_reason, reviewed_by, reviewed_at, is_active
  ) values ('78000000-0000-4000-8000-000000000016', 'MFDS', 'Product nutrition fixture current label', 'nutrition_dataset', '2026-09-23', '2026-09-23',
    now(), now(), 'current', 1, 'https://example.test/product-nutrition', 'test-only',
    'https://example.test/license', repeat('e',64), 'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now(), true);
  insert into public.nutrition_source_items (
    id, source_id, external_item_key, external_name, preparation_state,
    source_basis_text, source_basis_amount, source_basis_unit, edible_portion_percent,
    stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at
  ) values ('78000000-0000-4000-8000-000000000014', '78000000-0000-4000-8000-000000000016', 'product-pinned-label', '제품 새 라벨', 'raw-edible',
    '100g', 100, 'g', 100, repeat('d',64), 'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now());
  insert into public.nutrition_profiles (
    id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
    version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
  ) values
    ('78000000-0000-4000-8000-000000000008', '78000000-0000-4000-8000-000000000007', 'product_label', 'as_labeled', 100, 'g', 1,
      'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now(), true),
    ('78000000-0000-4000-8000-000000000009', '78000000-0000-4000-8000-000000000014', 'product_label', 'as_labeled', 100, 'g', 2,
      'approved', 'isolated fixture', '78000000-0000-4000-8000-000000000001', now(), true);
  insert into public.nutrient_definitions(code,label,unit,display_order,is_core) select code,code,case when code='energy_kcal' then 'kcal' when code='sodium_mg' then 'mg' else 'g' end,ordinality,true from unnest(array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg']) with ordinality r(code,ordinality) on conflict(code) do nothing;
  insert into public.nutrition_values (profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status)
    select profile.id, code, code, case when code='energy_kcal' then 'kcal' when code='sodium_mg' then 'mg' else 'g' end, case when code='energy_kcal' then profile.energy else 10 end, 'observed'
    from (values ('78000000-0000-4000-8000-000000000008'::uuid,300),('78000000-0000-4000-8000-000000000009'::uuid,900)) profile(id,energy),
      unnest(array['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg']) code;
  insert into public.nutrition_profiles (
    id, profile_kind, normalization_method, basis_amount, basis_unit, version,
    review_status, is_active, created_by
  ) values ('78000000-0000-4000-8000-000000000015', 'product_label', 'as_labeled', 100, 'g', 1, 'self_reported', true, '78000000-0000-4000-8000-000000000001');
  select public.insert_manual_food_product_values('78000000-0000-4000-8000-000000000015',
    '{"energy_kcal":100,"carbohydrate_g":10,"protein_g":10,"fat_g":10,"sodium_mg":10}'::jsonb);

  insert into public.food_products (
    id, owner_user_id, visibility, source_type, moderation_status, name, current_nutrition_version_id, external_product_key
  ) values
    ('78000000-0000-4000-8000-000000000003', null, 'public', 'public_dataset', 'visible', '라벨제품', '78000000-0000-4000-8000-000000000005', 'product-pinned-label'),
    ('78000000-0000-4000-8000-000000000012', '78000000-0000-4000-8000-000000000001', 'private', 'manual', 'visible', '비공개라벨제품', '78000000-0000-4000-8000-000000000013', null);
  insert into public.food_product_nutrition_versions (
    id, product_id, nutrition_profile_id, version, basis_relations_json, source_item_id, created_by
  ) values
    ('78000000-0000-4000-8000-000000000004', '78000000-0000-4000-8000-000000000003', '78000000-0000-4000-8000-000000000008', 1,
      '[{"from":{"amount":1,"unit":"package"},"to":{"amount":200,"unit":"g"}}]', '78000000-0000-4000-8000-000000000007', null),
    ('78000000-0000-4000-8000-000000000005', '78000000-0000-4000-8000-000000000003', '78000000-0000-4000-8000-000000000009', 2,
      '[{"from":{"amount":1,"unit":"package"},"to":{"amount":300,"unit":"g"}}]', '78000000-0000-4000-8000-000000000014', null),
    ('78000000-0000-4000-8000-000000000013', '78000000-0000-4000-8000-000000000012', '78000000-0000-4000-8000-000000000015', 1, '[]', null, '78000000-0000-4000-8000-000000000001');
  set constraints all immediate;
  insert into public.recipes (id,title,source_type,base_servings) values ('78000000-0000-4000-8000-000000000010', '제품 영양 검증', 'system', 2);
  insert into public.recipe_ingredients (
    id, recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order,
    food_product_id, food_product_nutrition_version_id, source_kind
  ) values ('78000000-0000-4000-8000-000000000011', '78000000-0000-4000-8000-000000000010', null, 0.5, 'package', 'QUANT', true, 0, '78000000-0000-4000-8000-000000000003', '78000000-0000-4000-8000-000000000004','food_product');

insert into public.cooking_methods(id,code,label,color_key) values('79000000-0000-4000-8000-000000000003','product-mix','섞기','orange');
