-- Owned empty PostgreSQL only. Authority/base completion below are explicit test
-- stubs: this fixture tests new evidence validation, not production auth/meal SQL.
create schema private;
create extension pgcrypto;
create table public.recipe_content_snapshots(id uuid primary key,base_servings numeric,ingredients_json jsonb,steps_json jsonb);
create table public.leftover_dishes(id uuid primary key,user_id uuid,recipe_content_snapshot_id uuid,cooking_servings numeric,finished_weight_g numeric);
create table public.mutation_idempotency_keys(id uuid primary key,owner_uuid uuid,account_generation bigint,state text,operation_scope text,durable_result jsonb);
create table private.cooked_batch_weight_evidence_control(singleton boolean primary key,enabled boolean);
insert into private.cooked_batch_weight_evidence_control values(true,true);
create table private.cooked_batch_weight_evidence(id uuid primary key default gen_random_uuid(),owner_uuid uuid,account_generation bigint,batch_id uuid,session_id uuid,operation_receipt_id uuid,event_kind text,recipe_content_snapshot_id uuid,original_revision bigint,input_source text,prediction_json jsonb,observed_at timestamptz,refers_to_prediction_id uuid,measured_g numeric,measurement_path text);
create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language plpgsql as $$begin if $3<>'synthetic-fixture' then raise exception 'ACCOUNT_SESSION_STALE';end if;return '{"account_generation":1}';end;$$;
create function private.claim_cooked_batch_operation(p_owner uuid,p_generation bigint,p_scope text,p_key uuid,p_body jsonb,p_now timestamptz) returns jsonb language plpgsql as $$begin
 if exists(select 1 from public.mutation_idempotency_keys where id=p_key and state='completed') then return jsonb_build_object('replay',(select durable_result from public.mutation_idempotency_keys where id=p_key));end if;
 insert into public.mutation_idempotency_keys values(p_key,p_owner,p_generation,'in_progress',p_scope,null);return jsonb_build_object('receipt_id',p_key);end;$$;
create function private.finish_cooked_batch_operation(uuid,jsonb,uuid,timestamptz) returns void language sql as $$update public.mutation_idempotency_keys set state='completed',durable_result=$2 where id=$1;$$;
create function public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz) returns jsonb language plpgsql as $$begin
 update public.leftover_dishes set finished_weight_g=$10 where id=$6 and user_id=$1;
 perform private.record_cooked_weight_evidence($6,$1,1,1,'completion',$11);
 return jsonb_build_object('weight_g',$10,'source',coalesce((select input_source from private.cooked_batch_weight_evidence where batch_id=$6 and event_kind<>'prediction'),'conditional_estimate'));
end;$$;
