-- Personal execution quantities never alter the recipe or its immutable pins.
begin;
create table private.cooking_execution_quantities (
  session_id uuid primary key references public.cooking_sessions(id) on delete cascade,
  owner_uuid uuid not null references public.users(id) on delete cascade,
  recipe_content_snapshot_id uuid not null references public.recipe_content_snapshots(id) on delete restrict,
  revision bigint not null check(revision>0),
  rows_json jsonb not null check(jsonb_typeof(rows_json)='array'),
  nutrition_snapshot_json jsonb not null,
  weight_prediction_json jsonb not null,
  updated_at timestamptz not null
);
alter table private.cooking_execution_quantities enable row level security;
revoke all on private.cooking_execution_quantities from public,anon,authenticated,service_role;

create function public.read_cooking_execution_quantities(
 p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
 p_session_id uuid,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_session public.cooking_sessions%rowtype;v_snapshot public.recipe_content_snapshots%rowtype;v_execution private.cooking_execution_quantities%rowtype;
begin
 perform public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
 select * into v_session from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid and contract_version='snapshot_v2';
 if v_session.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
 select * into strict v_snapshot from public.recipe_content_snapshots where id=v_session.recipe_content_snapshot_id;
 select * into v_execution from private.cooking_execution_quantities where session_id=p_session_id and owner_uuid=p_owner_uuid;
 return jsonb_build_object('revision',coalesce(v_execution.revision,0),'snapshot_id',v_snapshot.id,'base_servings',v_snapshot.base_servings,
   'cooking_servings',v_session.cooking_servings,'original_rows',v_snapshot.ingredients_json,
   'rows',coalesce(v_execution.rows_json,v_snapshot.ingredients_json),'steps',v_snapshot.steps_json,
   'nutrition_snapshot',v_execution.nutrition_snapshot_json,'prediction',v_execution.weight_prediction_json);
end;$function$;

create function public.save_cooking_execution_quantities(
 p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
 p_session_id uuid,p_idempotency_key uuid,p_expected_revision bigint,p_snapshot_id uuid,p_rows jsonb,p_nutrition_snapshot jsonb,p_prediction jsonb,p_request_changes jsonb,
 p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_authority jsonb;v_session public.cooking_sessions%rowtype;v_snapshot public.recipe_content_snapshots%rowtype;v_execution private.cooking_execution_quantities%rowtype;
 v_recipe_id uuid;v_claim jsonb;v_result jsonb;
begin
 if p_expected_revision is null or p_expected_revision<0 or p_idempotency_key is null or p_snapshot_id is null or p_now is null
   or jsonb_typeof(p_rows) is distinct from 'array' or octet_length(p_rows::text)>524288
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
 select recipe_id into v_recipe_id from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid and contract_version='snapshot_v2';
 if v_recipe_id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
 perform public.lock_personal_recipe_ids(array[v_recipe_id]);
 select * into strict v_session from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid for update;
 v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,'cooking_execution_quantities',p_idempotency_key,
   jsonb_build_object('session_id',p_session_id,'expected_revision',p_expected_revision,'snapshot_id',p_snapshot_id,'changes',p_request_changes),p_now);
 if v_claim ? 'replay' then return v_claim->'replay';end if;
 if v_session.status<>'in_progress' or v_session.recipe_content_snapshot_id is distinct from p_snapshot_id then raise exception 'CONFLICT' using errcode='55000';end if;
 select * into strict v_snapshot from public.recipe_content_snapshots where id=p_snapshot_id;
 select * into v_execution from private.cooking_execution_quantities where session_id=p_session_id for update;
 if coalesce(v_execution.revision,0)<>p_expected_revision or (v_execution.owner_uuid is not null and v_execution.owner_uuid<>p_owner_uuid)
 then raise exception 'CONFLICT' using errcode='55000';end if;
 if jsonb_typeof(p_request_changes) is distinct from 'array' or jsonb_array_length(p_request_changes) not between 1 and 200
  or exists(select 1 from jsonb_array_elements(p_request_changes) change where
   jsonb_typeof(change) is distinct from 'object' or jsonb_typeof(change->'row_index') is distinct from 'number'
   or (change->>'row_index')::numeric<>trunc((change->>'row_index')::numeric)
   or (change->>'row_index')::numeric not between 0 and jsonb_array_length(v_snapshot.ingredients_json)-1)
  or (select count(*)<>count(distinct change->>'row_index') from jsonb_array_elements(p_request_changes) change)
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 if p_rows is distinct from (select jsonb_agg(case when change.row is null then original.row else
   (original.row-'quantity_input')||jsonb_build_object('amount',change.row->'amount','unit',change.row->'unit',
    'ingredient_type','QUANT','scalable',false,'display_text',null) end order by original.idx)
  from jsonb_array_elements(coalesce(v_execution.rows_json,v_snapshot.ingredients_json)) with ordinality original(row,idx)
  left join jsonb_array_elements(p_request_changes) change(row) on (change.row->>'row_index')::numeric=original.idx-1)
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 if jsonb_array_length(p_rows)<>jsonb_array_length(v_snapshot.ingredients_json) or jsonb_array_length(p_rows)>200
   or exists(select 1 from jsonb_array_elements(p_rows) with ordinality proposed(row,idx)
    join jsonb_array_elements(v_snapshot.ingredients_json) with ordinality original(row,idx) using(idx)
    where jsonb_typeof(proposed.row) is distinct from 'object'
      or (proposed.row-array['amount','unit','ingredient_type','scalable','quantity_input','display_text']) is distinct from
         (original.row-array['amount','unit','ingredient_type','scalable','quantity_input','display_text'])
      or (proposed.row is distinct from original.row and (
        proposed.row->>'scalable' is distinct from 'false' or proposed.row ? 'quantity_input'
        or proposed.row->>'ingredient_type' is distinct from 'QUANT' or proposed.row->'display_text' is distinct from 'null'::jsonb
        or jsonb_typeof(proposed.row->'amount') is null or jsonb_typeof(proposed.row->'amount') not in('number','null')
        or (proposed.row->'amount'<>'null'::jsonb and ((proposed.row->>'amount')::numeric<=0 or (proposed.row->>'amount')::numeric>1000000))
        or jsonb_typeof(proposed.row->'unit') is null or jsonb_typeof(proposed.row->'unit') not in('string','null')
        or (proposed.row->'amount'<>'null'::jsonb and nullif(trim(proposed.row->>'unit'),'') is null)
        or length(proposed.row->>'unit')>32)))
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 perform public.validate_recipe_nutrition_snapshot_payload(p_nutrition_snapshot);
 if (p_nutrition_snapshot->>'base_servings')::numeric is distinct from v_session.cooking_servings
   or p_prediction->>'recipeSnapshotId' is distinct from p_snapshot_id::text
   or (p_prediction->>'baseServings')::numeric is distinct from v_snapshot.base_servings
   or (p_prediction->>'cookingServings')::numeric is distinct from v_session.cooking_servings
   or octet_length(p_prediction::text)>524288 or jsonb_typeof(p_prediction) is distinct from 'object'
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 insert into private.cooking_execution_quantities values(p_session_id,p_owner_uuid,p_snapshot_id,p_expected_revision+1,p_rows,p_nutrition_snapshot,p_prediction,p_now)
 on conflict(session_id) do update set revision=excluded.revision,rows_json=excluded.rows_json,nutrition_snapshot_json=excluded.nutrition_snapshot_json,
   weight_prediction_json=excluded.weight_prediction_json,updated_at=excluded.updated_at;
 v_result:=jsonb_build_object('success',true,'data',jsonb_build_object('revision',p_expected_revision+1),'error',null);
 perform private.finish_cooked_batch_operation((v_claim->>'receipt_id')::uuid,v_result,p_session_id,p_now);
 return v_result;
end;$function$;

create function private.assert_execution_completion_revision(p_session_id uuid,p_owner_uuid uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_execution private.cooking_execution_quantities%rowtype;v_context jsonb;
begin
 select * into v_execution from private.cooking_execution_quantities where session_id=p_session_id;
 if not found then return;end if;
 v_context:=coalesce(nullif(current_setting('homecook.execution_completion_context',true),''),'{}')::jsonb;
 if v_execution.owner_uuid is distinct from p_owner_uuid or v_context->>'session_id' is distinct from p_session_id::text
  or v_context->>'owner_uuid' is distinct from p_owner_uuid::text or (v_context->>'revision')::bigint is distinct from v_execution.revision
 then raise exception 'CONFLICT' using errcode='55000';end if;
end;$function$;

create function public.complete_cooking_execution(
 p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
 p_session_id uuid,p_idempotency_key uuid,p_consumed_pantry_item_ids uuid[],p_weight_action text,p_finished_weight_g numeric,p_weight_input_source text,
 p_prediction jsonb,p_write_enabled boolean,p_expected_execution_revision bigint,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_session public.cooking_sessions%rowtype;v_execution private.cooking_execution_quantities%rowtype;v_recipe_id uuid;v_prediction jsonb;v_result jsonb;v_previous text;
begin
 perform public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
 select recipe_id into v_recipe_id from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid and contract_version='snapshot_v2';
 if v_recipe_id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
 perform public.lock_personal_recipe_ids(array[v_recipe_id]);
 select * into strict v_session from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid for update;
 select * into v_execution from private.cooking_execution_quantities where session_id=p_session_id;
 if p_expected_execution_revision is null or p_expected_execution_revision<>coalesce(v_execution.revision,0)
 then raise exception 'CONFLICT' using errcode='55000';end if;
 v_prediction:=case when v_execution.session_id is null then p_prediction else v_execution.weight_prediction_json end;
 v_previous:=current_setting('homecook.execution_completion_context',true);
 perform set_config('homecook.execution_completion_context',jsonb_build_object('session_id',p_session_id,'owner_uuid',p_owner_uuid,'revision',p_expected_execution_revision)::text,true);
 if p_write_enabled is true or p_weight_input_source is not null then
  v_result:=public.complete_snapshot_v2_cooking_session_with_weight_evidence(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
   p_session_id,p_idempotency_key,p_consumed_pantry_item_ids,p_weight_action,p_finished_weight_g,p_weight_input_source,v_prediction,p_write_enabled,p_now);
 else
  if p_weight_action not in('weigh_later','set_finished_weight') or (p_weight_action='weigh_later' and p_finished_weight_g is not null)
  then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  v_result:=public.complete_snapshot_v2_cooking_session(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
   p_session_id,p_idempotency_key,p_consumed_pantry_item_ids,case when p_weight_action='weigh_later' then 'estimate_from_ingredients' else p_weight_action end,
   case when p_weight_action='weigh_later' then (v_prediction->'prediction'->>'totalGrams')::numeric else p_finished_weight_g end,p_now);
 end if;
 perform set_config('homecook.execution_completion_context',coalesce(v_previous,''),true);
 return v_result;
end;$function$;

-- Keep the established authority, meal/state/ownership and idempotency code.
-- The additional check runs only after the established session lock.
do $migration$
declare definition text;anchor text;
begin
 select pg_get_functiondef('public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz)'::regprocedure) into definition;
 anchor:='v_requested := cardinality(coalesce(p_consumed_pantry_item_ids, ''{}''::uuid[]));';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'execution completion anchor missing';end if;
 execute replace(definition,anchor,'perform private.assert_execution_completion_revision(p_session_id,p_owner_uuid);'||chr(10)||anchor);
end;$migration$;

create function private.resolve_execution_batch_nutrition(p_batch_id uuid,p_owner_uuid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_execution private.cooking_execution_quantities%rowtype;v_batch public.leftover_dishes%rowtype;v_nutrition jsonb;
begin
 select * into v_batch from public.leftover_dishes where id=p_batch_id and user_id=p_owner_uuid;
 if not found then return null;end if;
 select * into v_execution from private.cooking_execution_quantities where session_id=p_batch_id and owner_uuid=p_owner_uuid;
 if not found then return null;end if;
 if v_execution.recipe_content_snapshot_id is distinct from v_batch.recipe_content_snapshot_id then raise exception 'CONFLICT' using errcode='55000';end if;
 v_nutrition:=v_execution.nutrition_snapshot_json;
 return jsonb_build_object('recipe_content_snapshot_id',v_batch.recipe_content_snapshot_id,'recipe_nutrition_snapshot_id',null,'basis',jsonb_build_object('amount',v_batch.cooking_servings,'unit','serving'),
 'base_servings',(v_nutrition->>'base_servings')::numeric,'values',v_nutrition->'nutrient_status','calculation_status',v_nutrition->>'calculation_status',
 'calculation_quality',v_nutrition->'calculation_quality','contains_ai_estimate',v_nutrition->'warnings' ? 'AI_NUTRITION_ESTIMATE_USED',
 'reflected_ingredient_count',v_nutrition->'reflected_ingredient_count','target_ingredient_count',v_nutrition->'target_ingredient_count',
 'missing_reasons',v_nutrition->'missing_reasons','warnings',v_nutrition->'warnings','sources',v_nutrition->'sources','snapshot_id',null,'calculated_at',v_nutrition->>'calculated_at');
end;$function$;

do $migration$
declare definition text;anchor text;
begin
 select pg_get_functiondef('private.resolve_cooked_batch_nutrition(uuid,uuid)'::regprocedure) into definition;
 anchor:='  select batch.* into v_batch';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'execution nutrition anchor missing';end if;
 execute replace(definition,anchor,'  if exists(select 1 from private.cooking_execution_quantities where session_id=p_batch_id and owner_uuid=p_owner_uuid) then return private.resolve_execution_batch_nutrition(p_batch_id,p_owner_uuid);end if;'||chr(10)||anchor);
end;$migration$;

alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_cooking_execution_20261017;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
begin
 if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='snapshot-v2-session'
  and current_setting('request.method',true)='POST' and current_setting('request.path',true) in
  ('/rpc/read_cooking_execution_quantities','/rpc/save_cooking_execution_quantities','/rpc/complete_cooking_execution') then return;end if;
 perform private.verify_scope_pre_cooking_execution_20261017();
end;$function$;
revoke all on function private.assert_execution_completion_revision(uuid,uuid),private.resolve_execution_batch_nutrition(uuid,uuid),
 private.resolve_cooked_batch_nutrition(uuid,uuid),private.verify_full_local_internal_scope(),private.verify_scope_pre_cooking_execution_20261017() from public,anon,authenticated,service_role;
revoke all on function public.read_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz),
 public.save_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz),
 public.complete_cooking_execution(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.read_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz),
 public.save_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz),
 public.complete_cooking_execution(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,timestamptz) to service_role;
commit;
