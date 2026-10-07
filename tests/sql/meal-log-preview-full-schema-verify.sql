set request.jwt.claim.role='service_role';
set homecook.snapshot_v2_creation='on';
do $test$
declare v_result jsonb;v_preview jsonb;v_session uuid;v_batch uuid;v_before jsonb;v_after jsonb;v_expected jsonb;
begin
 if has_function_privilege('anon','public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)','EXECUTE')
 or has_function_privilege('authenticated','public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)','EXECUTE') then raise exception 'ACL expanded';end if;
 v_preview:=public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','ingredient','a8000000-0000-4000-8000-000000000001',50,'g');
 if (v_preview->>'calories_kcal')::numeric<>50 or (v_preview->>'protein_g')::numeric<>5 then raise exception 'ingredient scaling mismatch: %',v_preview;end if;
 v_result:=public.mutate_meal_log_entry('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','create','ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002',null,
 jsonb_build_object('consumed_local_date',current_date,'timezone_name_snapshot','Asia/Seoul','consumed_at',null,'meal_plan_column_id','a6000000-0000-4000-8000-000000000001','source',jsonb_build_object('type','ingredient','id','a8000000-0000-4000-8000-000000000001'),'quantity',jsonb_build_object('amount',50,'unit','g')));
 select nutrition_evidence_json into v_expected from public.meal_log_entries where id='ac000000-0000-4000-8000-000000000001';
 if v_preview is distinct from v_expected then raise exception 'create evidence differs: % vs %',v_preview,v_expected;end if;
 v_result:=public.start_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','aa000000-0000-4000-8000-000000000001','standalone',null,null,'a2000000-0000-4000-8000-000000000001',1,2);
 v_session:=(v_result->'data'->>'session_id')::uuid;
 perform public.complete_snapshot_v2_cooking_session('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_session,'aa000000-0000-4000-8000-000000000002','{}'::uuid[],'set_finished_weight',750,now());
 select id into v_batch from public.leftover_dishes limit 1;
 select jsonb_build_object('batch',to_jsonb(b),'events',(select count(*) from public.cooked_batch_quantity_events),'entries',(select count(*) from public.meal_log_entries),'receipts',(select count(*) from public.mutation_idempotency_keys),'notifications',(select count(*) from public.action_notifications)) into v_before from public.leftover_dishes b where id=v_batch;
 v_preview:=public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','cooked_batch',v_batch,100,'g');
 select jsonb_build_object('batch',to_jsonb(b),'events',(select count(*) from public.cooked_batch_quantity_events),'entries',(select count(*) from public.meal_log_entries),'receipts',(select count(*) from public.mutation_idempotency_keys),'notifications',(select count(*) from public.action_notifications)) into v_after from public.leftover_dishes b where id=v_batch;
 if v_before is distinct from v_after then raise exception 'preview mutated data';end if;
 begin
  perform public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000002','2026-01-01',repeat('b',64),1,'2026-01-02','cooked_batch',v_batch,100,'g');raise exception 'owner leak';
 exception when sqlstate 'P0002' then null;end;
 begin
  perform public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('b',64),1,'2026-01-02','cooked_batch',v_batch,100,'g');raise exception 'session leak';
 exception when sqlstate '55000' then null;end;
 begin
  perform public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','cooked_batch',v_batch,751,'g');raise exception 'excess accepted';
 exception when sqlstate '55000' then null;end;
 update public.user_account_lifecycles set status='deleting' where owner_uuid='a1000000-0000-4000-8000-000000000001';
 begin
  perform public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','ingredient','a8000000-0000-4000-8000-000000000001',50,'g');raise exception 'deleted identity accepted';
 exception when sqlstate '55000' then null;end;
 insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at) values('a1000000-0000-4000-8000-000000000001',2,'2026-01-01','runtime','active',now());
 begin
  perform public.preview_meal_log_nutrition('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','ingredient','a8000000-0000-4000-8000-000000000001',50,'g');raise exception 'old generation accepted';
 exception when sqlstate '55000' then null;end;
end $test$;
select jsonb_build_object('status','PASS','checks',array['canonical_ingredient_preview_matches_create','real_snapshot_v2_batch_preview','no_batch_ledger_entry_receipt_notification_writes','owner_isolation','session_authority','quantity_limit','withdrawal_fence','generation_isolation','role_acl']);
