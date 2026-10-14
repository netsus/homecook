export const owner = "c1000000-0000-4000-8000-000000000001";
export const other = "c1000000-0000-4000-8000-000000000002";
export const cutover = "c5000000-0000-4000-8000-000000000001";
export const epoch = "2026-08-08T00:00:00Z";
export const issued = "2026-08-08T01:00:00Z";
export const sourceNativeBootstrap = `begin;
  set session_replication_role=replica;
  insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at)
    values(true,'local','https://auth.mumeok.kr/auth/v1',2,1,true,'${epoch}');
  insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
  insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at)
    values(true,'generation_active',2,'${cutover}','${epoch}');
  set session_replication_role=origin;
  select public.set_account_generation_internal_writer_marker('${cutover}',true);
  insert into auth.users(id,created_at,email) values('${owner}','${epoch}','c05-native-a@example.invalid'),('${other}','${epoch}','c05-native-b@example.invalid');
  insert into public.users(id,nickname,social_provider,social_id) values('${owner}','c05-native-a','google','c05-native-a'),('${other}','c05-native-b','google','c05-native-b') on conflict(id) do nothing;
  insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
  insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
    values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
  insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,
    binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
    values(repeat('b',64),1,'${owner}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01'),
      (repeat('c',64),1,'${other}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
  select public.set_account_generation_internal_writer_marker('${cutover}',false);
  set session authorization postgres;
`;
export const sourceNativeDocument = `insert into private.weight_improvement_documents(version,document_json,document_hash)
  select 'native-fixture-v1',body,encode(extensions.digest(convert_to(body::text,'UTF8'),'sha256'),'hex')
  from (select '{"notice_version":"native-fixture-notice","title":"synthetic QA only","purpose":"synthetic QA only",
    "data_items":["fixture mass"],"excluded_items":["raw text"],"sample_retention":"fixture only",
    "evidence_retention":"fixture only","withdrawal":"fixture withdrawal","personal_service":"unchanged",
    "body":"not an approved policy or retention period"}'::jsonb body) document;
  update private.weight_improvement_control set participation_enabled=true,current_document_version='native-fixture-v1';`;
