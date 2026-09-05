-- Run only on an isolated restored database. No production fixture writes.
begin;
do $test$
declare
  b public.user_session_generation_bindings%rowtype;
  payload jsonb;
  result jsonb;
  key text := 'repair-test-' || gen_random_uuid()::text;
  notifications_before bigint;
  seen timestamptz := clock_timestamp();
begin
  select * into strict b from public.user_session_generation_bindings
  where binding_state = 'active' and revoked_at is null
    and binding_expires_at > clock_timestamp()
  order by binding_expires_at desc limit 1;
  if has_function_privilege('authenticated',
    'public.write_user_gamification_projection(uuid,timestamptz,text,integer,timestamptz,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon',
    'public.write_user_gamification_projection(uuid,timestamptz,text,integer,timestamptz,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role',
    'public.write_user_gamification_projection(uuid,timestamptz,text,integer,timestamptz,text,jsonb)', 'EXECUTE') then
    raise exception 'RPC execute grants are incorrect';
  end if;
  select count(*) into notifications_before from public.user_progress_notifications;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);

  payload := jsonb_build_object('user_id',b.owner_uuid,'achievement_key',key,
    'category_key','cooking','track_key',null,'target_value',1,'achieved_value',2,
    'badge_key',null,'source_event_id',null,'source_activity_id',null,
    'idempotency_key',key,'earned_at',clock_timestamp());
  result := public.write_user_gamification_projection(b.owner_uuid,
    b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
    b.last_token_issued_at,'achievement',payload);
  if result ->> 'achievement_key' <> key or result ->> 'user_id' <> b.owner_uuid::text then
    raise exception 'Achievement projection failed';
  end if;
  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
      b.last_token_issued_at,'achievement',payload);
    raise exception 'Duplicate award accepted';
  exception when unique_violation then null; end;
  if (select count(*) from public.user_achievement_awards where achievement_key=key) <> 1 then
    raise exception 'Duplicate award persisted';
  end if;

  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,repeat('0',64),b.hmac_key_version,
      b.last_token_issued_at,'achievement',payload);
    raise exception 'Invalid session accepted';
  exception when sqlstate '55000' then null; end;
  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
      b.last_token_issued_at,'achievement',payload || jsonb_build_object('user_id',gen_random_uuid()));
    raise exception 'Foreign owner accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
      b.last_token_issued_at,'achievement',payload || jsonb_build_object('source_event_id',gen_random_uuid()));
    raise exception 'Foreign event accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
      b.last_token_issued_at,'notification',payload);
    raise exception 'Unexpected table operation accepted';
  exception when sqlstate '22023' then null; end;

  result := public.write_user_gamification_projection(b.owner_uuid,
    b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
    b.last_token_issued_at,'badge',jsonb_build_object('user_id',b.owner_uuid,
      'badge_key',key,'source_event_id',null,'idempotency_key',key,'earned_at',clock_timestamp()));
  if result ->> 'badge_key' <> key then raise exception 'Badge projection failed'; end if;

  payload := jsonb_build_object('user_id',b.owner_uuid,'quest_key',key,
    'quest_type','tutorial','status','active','progress_current',0,'progress_target',1,
    'source_event_id',null,'completed_at',null,'dismissed_at',null,'updated_at',clock_timestamp());
  result := public.write_user_gamification_projection(b.owner_uuid,
    b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
    b.last_token_issued_at,'quest',payload);
  result := public.write_user_gamification_projection(b.owner_uuid,
    b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
    b.last_token_issued_at,'quest',payload || jsonb_build_object('progress_current',1,'status','completed','completed_at',seen));
  if (result ->> 'progress_current')::integer <> 1
    or (select count(*) from public.user_quest_progress where quest_key=key) <> 1 then
    raise exception 'Quest upsert failed';
  end if;

  select to_jsonb(s) into payload from public.user_progress_summary s where user_id=b.owner_uuid;
  if payload is null then
    payload := jsonb_build_object('user_id',b.owner_uuid,'total_xp',0,'current_level',1,
      'level_curve_version','v2','event_counts','{}'::jsonb,'last_event_at',null,'last_updated_at',seen);
  end if;
  result := public.write_user_gamification_projection(b.owner_uuid,
    b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
    b.last_token_issued_at,'summary',payload);
  if result ->> 'total_xp' <> payload ->> 'total_xp' then
    raise exception 'Summary projection changed XP';
  end if;
  if (select count(*) from public.user_progress_notifications) <> notifications_before then
    raise exception 'Silent projection created notifications';
  end if;
  if exists(select 1 from public.account_generation_cutover_attempts
    where result_json ? '_internal_generation_writer_txid') then
    raise exception 'Internal marker leaked';
  end if;

  perform set_config('request.headers','{"x-homecook-internal-scope":"gamification-projection"}',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.path','/rpc/write_user_gamification_projection',true);
  perform private.verify_full_local_internal_scope();
  begin
    perform set_config('request.path','/user_achievement_awards',true);
    perform private.verify_full_local_internal_scope();
    raise exception 'Direct table path accepted';
  exception when sqlstate '55000' then null; end;
  begin
    perform set_config('request.path','/rpc/write_user_gamification_projection',true);
    perform set_config('request.method','GET',true);
    perform private.verify_full_local_internal_scope();
    raise exception 'Wrong RPC method accepted';
  exception when sqlstate '55000' then null; end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.write_user_gamification_projection(b.owner_uuid,
      b.auth_identity_created_at_snapshot,b.session_key_hash,b.hmac_key_version,
      b.last_token_issued_at,'summary',payload);
    raise exception 'Nonservice caller accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: 4 projection writes, duplicate handling, owner/session/source/role/scope denials, no notifications or leaked marker';
end;
$test$;
rollback;
