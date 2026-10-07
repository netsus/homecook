set request.jwt.claim.role='service_role';
do $test$
declare v_first jsonb;v_replay jsonb;v_before int;v_receipts int;v_key uuid:='cc000000-0000-4000-8000-000000000001';v_recipe uuid:='a2000000-0000-4000-8000-000000000001';v_column uuid:='a6000000-0000-4000-8000-000000000001';
begin
 select count(*) into v_before from public.meals;
 v_first:=public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,2);
 v_replay:=public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,2);
 if v_first is distinct from v_replay or (select count(*) from public.meals)<>v_before+1 then raise exception 'duplicate meal after replay';end if;
 if (select count(*) from public.action_notifications where source_id=(v_first->>'id')::uuid)<>1 then raise exception 'duplicate notification after replay';end if;
 begin
  perform public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,3);
  raise exception 'changed payload accepted';
 exception when unique_violation then if sqlerrm<>'IDEMPOTENCY_KEY_REUSED' then raise;end if;end;
 begin
  perform public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('b',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,2);
  raise exception 'stale replay accepted';
 exception when sqlstate '55000' then null;end;
 begin
  perform public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000002','2026-01-01',repeat('b',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,2);
  raise exception 'owner receipt/source leaked';
 exception when sqlstate 'P0002' then null;end;
 -- Source removal after a committed action must not turn an uncertain retry into a new action/error.
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
 update public.recipes set deleted_at=now() where id=v_recipe;
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
 v_replay:=public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02',v_key,v_recipe,current_date,v_column,2);
 if v_replay is distinct from v_first then raise exception 'removed source replay lost';end if;
 select count(*) into v_receipts from public.mutation_idempotency_keys;
 begin
  perform public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','cc000000-0000-4000-8000-000000000002',v_recipe,current_date,v_column,2);
  raise exception 'new creation accepted removed recipe';
 exception when sqlstate 'P0002' then null;end;
 if (select count(*) from public.mutation_idempotency_keys)<>v_receipts then raise exception 'failed create left receipt';end if;
 if (select count(*) from public.meals)<>v_before+1 then raise exception 'failed create changed source';end if;
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
 update public.recipes set deleted_at=null where id=v_recipe;
 perform public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
end $test$;
-- A failure after source/notification insertion must also roll back the claimed key.
create function public.test_meal_key_abort() returns trigger language plpgsql as $$begin if new.planned_servings=99 then raise exception 'TEST_ROLLBACK';end if;return new;end$$;
create trigger zz_test_meal_key_abort after insert on public.meals for each row execute function public.test_meal_key_abort();
do $test$
declare v_before int;v_receipts int;v_notices int;
begin
 select count(*) into v_before from public.meals;select count(*) into v_receipts from public.mutation_idempotency_keys;select count(*) into v_notices from public.action_notifications;
 begin
  perform public.create_future_meal_idempotent('a1000000-0000-4000-8000-000000000001','2026-01-01',repeat('a',64),1,'2026-01-02','cc000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001',current_date,'a6000000-0000-4000-8000-000000000001',99);
  raise exception 'rollback injection not reached';
 exception when raise_exception then if sqlerrm<>'TEST_ROLLBACK' then raise;end if;end;
 if (select count(*) from public.meals)<>v_before or (select count(*) from public.mutation_idempotency_keys)<>v_receipts or (select count(*) from public.action_notifications)<>v_notices then raise exception 'partial action survived rollback';end if;
end $test$;
drop trigger zz_test_meal_key_abort on public.meals;drop function public.test_meal_key_abort();
do $test$
begin
 if has_function_privilege('anon','public.create_future_meal_idempotent(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,date,uuid,integer,uuid,timestamptz)','EXECUTE') or has_function_privilege('authenticated','public.create_future_meal_idempotent(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,date,uuid,integer,uuid,timestamptz)','EXECUTE') then raise exception 'ACL expanded';end if;
 perform set_config('request.headers','{"x-homecook-internal-scope":"future-meal-write"}',true);perform set_config('request.method','POST',true);perform set_config('request.path','/rpc/create_future_meal_idempotent',true);perform private.verify_full_local_internal_scope();
end $test$;
select jsonb_build_object('status','PASS','checks',array['two_calls_one_meal','one_notification','payload_mismatch_409','stale_session_replay_denied','owner_isolation','deleted_source_replay','failed_source_rollback','post_insert_atomic_rollback','role_acl','exact_scope_path']);
