-- Synthetic fixtures only. Control singletons are bootstrapped with replication
-- triggers suppressed, then all business writes use the real generation guard.
begin;
set local request.jwt.claim.role='service_role';
set local session_replication_role=replica;
insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at) values(true,'local','https://auth.example.invalid/auth/v1',2,1,true,'2026-01-01');
insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('a5000000-0000-4000-8000-000000000001','promoted',2,'{}');
insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'a5000000-0000-4000-8000-000000000001','2026-01-01');
set local session_replication_role=origin;
select public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
insert into auth.users(id,created_at,email) values('a1000000-0000-4000-8000-000000000001','2026-01-01','notify-a@example.invalid'),('a1000000-0000-4000-8000-000000000002','2026-01-01','notify-b@example.invalid');
insert into public.users(id,nickname,social_provider,social_id) values('a1000000-0000-4000-8000-000000000001','알림검증A','google','notify-a'),('a1000000-0000-4000-8000-000000000002','알림검증B','google','notify-b') on conflict(id) do nothing;
insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('a1000000-0000-4000-8000-000000000001',1),('a1000000-0000-4000-8000-000000000002',1);
insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at) values('a1000000-0000-4000-8000-000000000001',1,'2026-01-01','runtime','active',now()),('a1000000-0000-4000-8000-000000000002',1,'2026-01-01','runtime','active',now());
insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,last_token_issued_at,binding_expires_at) values(repeat('a',64),1,'a1000000-0000-4000-8000-000000000001',1,'2026-01-01','active','local','https://auth.example.invalid/auth/v1',now(),2,'2026-01-02','2026-01-02','2099-01-01'),(repeat('b',64),1,'a1000000-0000-4000-8000-000000000002',1,'2026-01-01','active','local','https://auth.example.invalid/auth/v1',now(),2,'2026-01-02','2026-01-02','2099-01-01');
insert into public.ingredients(id,standard_name,category,default_unit) values('a8000000-0000-4000-8000-000000000001','검증 김치','채소','g');
insert into public.recipes(id,title,base_servings,created_by,source_type,visibility) values('a2000000-0000-4000-8000-000000000001','김치찌개',2,'a1000000-0000-4000-8000-000000000001','manual','private');
insert into public.recipe_ingredients(recipe_id,ingredient_id,amount,unit,ingredient_type,sort_order) values('a2000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001',100,'g','QUANT',0);
insert into public.meal_plan_columns(id,user_id,name,sort_order) values('a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','아침',0);
insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings) values('a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',current_date,'a6000000-0000-4000-8000-000000000001',2);
insert into public.pantry_items(id,user_id,ingredient_id) values('a9000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001'),('a9000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000001');
select public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
commit;
