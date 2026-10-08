begin;
set local session_replication_role = replica;

insert into auth.users(id,email,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values ('11000000-0000-4000-8000-000000000001','isolated-authority@example.invalid','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','{}','{}')
on conflict (id) do nothing;

insert into public.users(id,nickname,social_provider,social_id)
values ('11000000-0000-4000-8000-000000000001','isolated-authority','google','isolated-authority')
on conflict (id) do nothing;

insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation)
values ('11000000-0000-4000-8000-000000000001',1)
on conflict (owner_uuid) do nothing;

insert into public.user_account_lifecycles(
  owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at
) values (
  '11000000-0000-4000-8000-000000000001',1,'2026-10-01T00:00:00Z','runtime','active','2026-10-01T00:00:00Z'
) on conflict (owner_uuid,account_generation) do nothing;

insert into public.account_generation_cutover_attempts(id,state,capability_revision,promoted_at)
values ('12000000-0000-4000-8000-000000000001','finalized',1,'2026-10-01T00:00:00Z')
on conflict (id) do nothing;

update public.account_generation_capability_state
set state='generation_active',revision=1,current_cutover_attempt_id='12000000-0000-4000-8000-000000000001',activated_at='2026-10-01T00:00:00Z';

update private.full_local_auth_control
set authority='local',local_issuer='https://isolated.homecook.invalid/auth/v1',cutover_epoch=1,hmac_key_version=1,
  flows_open=true,cutover_started_at='2026-10-01T00:00:00Z',local_activated_at='2026-10-01T00:00:00Z';

insert into public.user_session_generation_bindings(
  session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,
  binding_expires_at,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,
  session_issued_at,last_token_issued_at,session_identity_hash
) values (
  repeat('a',64),1,'11000000-0000-4000-8000-000000000001',1,'2026-10-01T00:00:00Z',
  now()+interval '1 hour','active','local','https://isolated.homecook.invalid/auth/v1',now(),1,
  '2026-10-08T12:00:00Z','2026-10-08T12:00:00Z',repeat('b',64)
) on conflict (hmac_key_version,session_key_hash) do nothing;

set local session_replication_role = origin;
commit;
