set request.jwt.claim.role='service_role';
set homecook.snapshot_v2_creation='on';
do $test$
begin
 if has_table_privilege('authenticated','public.action_notifications','SELECT') or has_table_privilege('service_role','public.action_notifications','INSERT')
 or has_function_privilege('service_role','private.write_action_notification(uuid,text,uuid,text,text,text,bigint)','EXECUTE')
 or has_function_privilege('anon','public.list_action_notifications(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.mark_action_notifications_seen(uuid,timestamptz,text,integer,timestamptz,uuid[])','EXECUTE') then raise exception 'notification ACL expanded'; end if;
 if not has_function_privilege('service_role','public.list_action_notifications(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid)','EXECUTE') then raise exception 'internal read unavailable'; end if;
end $test$;
do $test$
declare v_result jsonb; v_session uuid; v_second uuid; v_count int; v_seen uuid;
begin
 v_result:=public.start_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','aa000000-0000-4000-8000-000000000001','standalone',null,null,'a2000000-0000-4000-8000-000000000001',1,2);
 v_session:=(v_result->'data'->>'session_id')::uuid;
 v_result:=public.complete_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_session,'aa000000-0000-4000-8000-000000000002',array['a9000000-0000-4000-8000-000000000001'::uuid],'set_finished_weight',750,now());
 if (v_result->'data'->>'pantry_removed')::int<>1 then raise exception 'actual pantry count failed'; end if;
 perform public.complete_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_session,'aa000000-0000-4000-8000-000000000002',array['a9000000-0000-4000-8000-000000000001'::uuid],'set_finished_weight',750,now());
 select count(*) into v_count from public.action_notifications where owner_user_id='a1000000-0000-4000-8000-000000000001';
 if v_count<>3 then raise exception 'replayed completion created duplicates: %',v_count; end if;
 if not exists(select 1 from public.action_notifications where event_type='pantry_deducted' and message='검증 김치') then raise exception 'pantry message failed'; end if;
 if not exists(select 1 from public.pantry_items where user_id='a1000000-0000-4000-8000-000000000002') then raise exception 'foreign pantry changed'; end if;
 v_result:=public.list_action_notifications('a1000000-0000-4000-8000-000000000002','2026-01-01',repeat('b',64),1,'2026-01-02');
 if v_result->'items'<>'[]'::jsonb then raise exception 'foreign owner leaked'; end if;
 select id into v_seen from public.action_notifications limit 1;
 v_result:=public.mark_action_notifications_seen('a1000000-0000-4000-8000-000000000002','2026-01-01',repeat('b',64),1,'2026-01-02',array[v_seen]);
 if v_result->'seen_ids'<>'[]'::jsonb then raise exception 'foreign mark allowed'; end if;
 v_result:=public.mark_action_notifications_seen('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',array[v_seen]);
 if (v_result->>'unread_count')::int<>2 then raise exception 'unread count failed'; end if;
 begin
  perform public.list_action_notifications('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('b',64),1,'2026-01-02');
  raise exception 'stale session accepted';
 exception when sqlstate '55000' then null; end;
end $test$;
-- Fail after the notification insert and pantry deletion, proving atomic rollback.
create function public.test_abort_notification_completion() returns trigger language plpgsql as $$begin raise exception 'TEST_COMPLETION_ROLLBACK'; end$$;
create trigger test_abort_notification_completion before update of status on public.cooking_sessions
for each row when(new.status='completed') execute function public.test_abort_notification_completion();
do $test$
declare v_result jsonb; v_session uuid; v_before int;
begin
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
 insert into public.pantry_items(id,user_id,ingredient_id) values('a9000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001');
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
 v_result:=public.start_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','aa000000-0000-4000-8000-000000000003','standalone',null,null,'a2000000-0000-4000-8000-000000000001',1,2);
 v_session:=(v_result->'data'->>'session_id')::uuid;
 select count(*) into v_before from public.action_notifications;
 begin
  perform public.complete_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_session,'aa000000-0000-4000-8000-000000000004',array['a9000000-0000-4000-8000-000000000003'::uuid],'set_finished_weight',750,now());
  raise exception 'rollback injection did not execute';
 exception when raise_exception then if sqlerrm<>'TEST_COMPLETION_ROLLBACK' then raise; end if; end;
 if (select count(*) from public.action_notifications)<>v_before then raise exception 'rolled back notification survived'; end if;
 if not exists(select 1 from public.pantry_items where id='a9000000-0000-4000-8000-000000000003') then raise exception 'rolled back pantry deletion survived'; end if;
end $test$;
drop trigger test_abort_notification_completion on public.cooking_sessions;
drop function public.test_abort_notification_completion();
-- Exercise the deployed legacy adapter with its existing owner/write fences.
do $test$
declare v_result jsonb; v_source uuid;
begin
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
 v_result:=public.complete_standalone_cooking('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',2,array['a8000000-0000-4000-8000-000000000001'::uuid]);
 v_source:=(v_result->>'leftover_dish_id')::uuid;
 if (v_result->>'pantry_removed')::int<>1 then raise exception 'legacy actual pantry count failed'; end if;
 if not exists(select 1 from public.action_notifications where source_id=v_source and event_type='pantry_deducted' and message='검증 김치') then raise exception 'legacy pantry history failed'; end if;
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
end $test$;
-- Shopping and meal logging use their actual constrained source tables/RPC.
do $test$
declare v_batch uuid; v_result jsonb;
begin
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
 insert into public.shopping_lists(id,user_id,title,date_range_start,date_range_end) values('ab000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','검증 장보기',current_date,current_date);
 update public.shopping_lists set is_completed=true,completed_at=now() where id='ab000000-0000-4000-8000-000000000001';
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
 select id into v_batch from public.leftover_dishes where recipe_content_snapshot_id is not null and finished_weight_g=750 limit 1;
 v_result:=public.mutate_meal_log_entry('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','create','ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002',null,
 jsonb_build_object('consumed_local_date',current_date,'timezone_name_snapshot','Asia/Seoul','consumed_at',null,'meal_plan_column_id','a6000000-0000-4000-8000-000000000001','source',jsonb_build_object('type','cooked_batch','id',v_batch),'quantity',jsonb_build_object('amount',750,'unit','g')));
 if not exists(select 1 from public.action_notifications where event_type='meal_logged') or not exists(select 1 from public.action_notifications where event_type='leftover_consumed') then raise exception 'meal logging/consumed history failed'; end if;
 if (select count(*) from public.action_notifications where source_id='ab000000-0000-4000-8000-000000000001')<>2 then raise exception 'shopping history failed'; end if;
end $test$;
-- Real lifecycle state/identity functions must isolate old generations.
do $test$
begin
 update public.user_account_lifecycles set status='deleting' where owner_uuid='a1000000-0000-4000-8000-000000000001';
 if exists(select 1 from public.action_notifications where owner_user_id='a1000000-0000-4000-8000-000000000001') then raise exception 'withdrawal history survived'; end if;
 begin
  perform public.list_action_notifications('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02');
  raise exception 'deleting identity accepted';
 exception when sqlstate '55000' then null; end;
 insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at) values('a1000000-0000-4000-8000-000000000001',2,'2026-01-01','runtime','active',now());
 begin
  perform public.list_action_notifications('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02');
  raise exception 'old generation binding accepted';
 exception when sqlstate '55000' then null; end;
end $test$;
select jsonb_build_object('status','PASS','checks',array['real_source_triggers','snapshot_v2_completion','completion_replay','atomic_rollback','actual_pantry_names','legacy_completion','owner_isolation','seen_count','session_authority','withdrawal_cleanup','generation_isolation','shopping_created_completed','meal_logged','leftover_consumed']);
