-- Local draft only. No historical batch/meal/snapshot UPDATE and no learning collection.
begin;

create table private.cooked_batch_weight_evidence_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.cooked_batch_weight_evidence_control(singleton) values(true);

create table private.cooked_batch_weight_evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_uuid uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null,
  batch_id uuid not null references public.leftover_dishes(id) on delete cascade,
  session_id uuid references public.cooking_sessions(id) on delete cascade,
  operation_receipt_id uuid not null,
  event_kind text not null check (event_kind in ('prediction','reported_measurement','manual_entry')),
  refers_to_prediction_id uuid references private.cooked_batch_weight_evidence(id) on delete cascade,
  recipe_content_snapshot_id uuid not null references public.recipe_content_snapshots(id),
  original_revision bigint not null check (original_revision > 0),
  input_source text not null check (input_source in ('conditional_estimate','unavailable','reported_measured','manual_estimate')),
  measured_g numeric check (measured_g > 0 and measured_g::text not in ('NaN','Infinity','-Infinity')),
  prediction_json jsonb,
  measurement_path text check (measurement_path in ('completion','before_consumption')),
  quality_reasons text[] not null default array['planned_input','conditions_unknown','device_unverified'],
  observed_at timestamptz not null,
  unique (operation_receipt_id,event_kind),
  check ((event_kind='prediction' and prediction_json is not null and measured_g is null and measurement_path is null)
    or (event_kind<>'prediction' and prediction_json is null and measured_g is not null and measurement_path is not null))
);
create unique index cooked_batch_weight_evidence_prediction on private.cooked_batch_weight_evidence(batch_id) where event_kind='prediction';
create index cooked_batch_weight_evidence_owner_batch on private.cooked_batch_weight_evidence(owner_uuid,batch_id,observed_at,id);
alter table private.cooked_batch_weight_evidence_control owner to postgres;
alter table private.cooked_batch_weight_evidence owner to postgres;
alter table private.cooked_batch_weight_evidence_control enable row level security;
alter table private.cooked_batch_weight_evidence enable row level security;
revoke all on private.cooked_batch_weight_evidence_control,private.cooked_batch_weight_evidence from public,anon,authenticated,service_role;

create or replace function private.reject_cooked_weight_evidence_update() returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
begin raise exception 'CONFLICT' using errcode='55000'; end;
$function$;
create trigger cooked_weight_evidence_immutable before update on private.cooked_batch_weight_evidence
for each row execute function private.reject_cooked_weight_evidence_update();

create or replace function private.project_cooked_weight_evidence(p_batch_id uuid,p_owner_uuid uuid) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
  select jsonb_build_object(
    'source', coalesce(entry.input_source,
      case when batch.weight_status='known' and batch.weight_source is distinct from 'estimated' then 'legacy_unknown' else prediction.input_source end,
      case when batch.weight_source='estimated' then 'historical_estimate' else 'legacy_unknown' end),
    'predicted_g', prediction.prediction_json->'prediction'->'totalGrams',
    'model_version', case when entry.input_source is null and batch.weight_status='known' and batch.weight_source is distinct from 'estimated'
      then null else prediction.prediction_json->'prediction'->'modelVersion' end,
    'reason_codes', coalesce((select jsonb_agg(distinct reason->>'code' order by reason->>'code')
      from jsonb_array_elements(prediction.prediction_json->'prediction'->'reasons') reason),'[]'::jsonb),
    'assumption_codes',coalesce(prediction.prediction_json->'prediction'->'assumptions','[]'::jsonb)
  ) from public.leftover_dishes batch
  left join private.cooked_batch_weight_evidence prediction on prediction.batch_id=batch.id and prediction.owner_uuid=p_owner_uuid and prediction.event_kind='prediction'
  left join lateral (select input_source from private.cooked_batch_weight_evidence
    where batch_id=batch.id and owner_uuid=p_owner_uuid and event_kind<>'prediction'
    order by observed_at desc,id desc limit 1) entry on true
  where batch.id=p_batch_id and batch.user_id=p_owner_uuid;
$function$;

create or replace function private.cooked_weight_meal_basis(p_batch_id uuid,p_owner_uuid uuid) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
  select jsonb_build_object('schema_version','cooked-weight-basis-v1','batch_id',batch.id,
    'recipe_content_snapshot_id',batch.recipe_content_snapshot_id,'finished_weight_g',batch.finished_weight_g,
    'source',private.project_cooked_weight_evidence(batch.id,p_owner_uuid)->'source',
    'model_version',private.project_cooked_weight_evidence(batch.id,p_owner_uuid)->'model_version',
    'prediction_id',prediction.id,'observation_id',entry.id,'batch_revision',batch.revision)
  from public.leftover_dishes batch
  left join private.cooked_batch_weight_evidence prediction on prediction.batch_id=batch.id and prediction.owner_uuid=p_owner_uuid and prediction.event_kind='prediction'
  left join lateral(select id from private.cooked_batch_weight_evidence where batch_id=batch.id and owner_uuid=p_owner_uuid
    and event_kind<>'prediction' order by observed_at desc,id desc limit 1) entry on true
  where batch.id=p_batch_id and batch.user_id=p_owner_uuid;
$function$;

create or replace function private.cooked_weight_meal_assumptions(p_batch_id uuid,p_owner_uuid uuid) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
  select case when summary->>'source'='conditional_estimate' and jsonb_array_length(summary->'assumption_codes')>0
    then jsonb_build_object('weight_assumption_codes',summary->'assumption_codes') else '{}'::jsonb end
  from (select private.project_cooked_weight_evidence(p_batch_id,p_owner_uuid) summary) evidence;
$function$;

create or replace function private.freeze_meal_log_cooked_weight_basis() returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
begin
  -- These entries are written only inside the existing owner/revision/ledger RPC.
  -- Never backfill an old entry during a same-source/quantity date or slot move.
  new.nutrition_evidence_json:=new.nutrition_evidence_json-'weight_basis'-'weight_assumption_codes';
  if new.source_type is distinct from 'cooked_batch' then return new; end if;
  if (select enabled from private.cooked_batch_weight_evidence_control where singleton for share) is distinct from true then
    if tg_op='UPDATE' and old.source_type='cooked_batch' and new.source_type='cooked_batch'
      and new.cooked_batch_id=old.cooked_batch_id and old.nutrition_evidence_json ? 'weight_basis' then
      new.nutrition_evidence_json:=new.nutrition_evidence_json||jsonb_build_object('weight_basis',old.nutrition_evidence_json->'weight_basis');
      if old.nutrition_evidence_json ? 'weight_assumption_codes' then
        new.nutrition_evidence_json:=new.nutrition_evidence_json||jsonb_build_object('weight_assumption_codes',old.nutrition_evidence_json->'weight_assumption_codes');
      end if;
    end if;
    return new;
  end if;
  if new.source_type='cooked_batch' then
    if tg_op='UPDATE' and old.source_type='cooked_batch' and new.cooked_batch_id=old.cooked_batch_id
      and new.actual_amount=old.actual_amount and new.actual_unit=old.actual_unit then
      if old.nutrition_evidence_json ? 'weight_basis' then
        new.nutrition_evidence_json:=new.nutrition_evidence_json||jsonb_build_object('weight_basis',old.nutrition_evidence_json->'weight_basis');
        if old.nutrition_evidence_json ? 'weight_assumption_codes' then
          new.nutrition_evidence_json:=new.nutrition_evidence_json||jsonb_build_object('weight_assumption_codes',old.nutrition_evidence_json->'weight_assumption_codes');
        end if;
      end if;
    else
      perform 1 from public.leftover_dishes where id=new.cooked_batch_id and user_id=new.owner_user_id for share;
      new.nutrition_evidence_json:=new.nutrition_evidence_json||jsonb_build_object('weight_basis',private.cooked_weight_meal_basis(new.cooked_batch_id,new.owner_user_id))
        ||private.cooked_weight_meal_assumptions(new.cooked_batch_id,new.owner_user_id);
    end if;
  end if;
  return new;
end;
$function$;
-- Runs after the existing legacy nutrition filler; nutrition scalars are unchanged.
create trigger zz_freeze_meal_log_cooked_weight_basis before insert or update of cooked_batch_id,actual_amount,actual_unit,nutrition_evidence_json
on public.meal_log_entries for each row execute function private.freeze_meal_log_cooked_weight_basis();

-- Called only on the base RPC's fresh branch, before its durable result is finished.
-- The wrapper's transaction-local context is never a client request body field.
create or replace function private.record_cooked_weight_evidence(p_batch_id uuid,p_owner_uuid uuid,p_generation bigint,p_revision bigint,p_path text,p_now timestamptz)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_context jsonb; v_prediction jsonb; v_batch public.leftover_dishes%rowtype;
  v_receipt uuid; v_source text; v_prediction_id uuid; v_kind text; v_base numeric;
begin
  if nullif(current_setting('homecook.cooked_weight_evidence_context',true),'') is null then return; end if;
  v_context:=current_setting('homecook.cooked_weight_evidence_context',true)::jsonb;
  v_receipt:=(v_context->>'receipt_id')::uuid;
  v_source:=v_context->>'input_source';
  if (select enabled from private.cooked_batch_weight_evidence_control where singleton for share) is distinct from true
    or not exists(select 1 from public.mutation_idempotency_keys where id=v_receipt
      and owner_uuid=p_owner_uuid and account_generation=p_generation and state='in_progress'
      and operation_scope in ('snapshot_v2_complete_weight_evidence','cooked_batch_weight_evidence'))
  then raise exception 'CONFLICT' using errcode='55000'; end if;
  select * into strict v_batch from public.leftover_dishes where id=p_batch_id and user_id=p_owner_uuid;
  if v_batch.recipe_content_snapshot_id is null then raise exception 'CONFLICT' using errcode='55000'; end if;
  if p_path='completion' then
    v_prediction:=v_context->'prediction';
    select base_servings into strict v_base from public.recipe_content_snapshots where id=v_batch.recipe_content_snapshot_id;
    if v_prediction is null or jsonb_typeof(v_prediction)<>'object' or octet_length(v_prediction::text)>524288
      or v_prediction->>'schemaVersion' is distinct from 'cooked-weight-evidence-v1'
      or v_prediction->>'inputVersion' is distinct from 'snapshot-weight-v2'
      or v_prediction->>'catalogVersion' is distinct from 'usda-release2-2014'
      or v_prediction->>'recipeSnapshotId' is distinct from v_batch.recipe_content_snapshot_id::text
      or (v_prediction->>'baseServings')::numeric is distinct from v_base
      or (v_prediction->>'cookingServings')::numeric is distinct from v_batch.cooking_servings
      or v_prediction->'prediction'->>'scope' is distinct from 'candidate'
      or v_prediction->'prediction'->>'learningEligible' is distinct from 'false'
      or v_prediction->'prediction'->>'modelVersion' is distinct from 'bounded-weight-v2'
      or v_prediction->'prediction'->'input'->>'recipeSnapshotId' is distinct from v_batch.recipe_content_snapshot_id::text
      or jsonb_typeof(v_prediction->'rawRows') is distinct from 'array'
      or jsonb_typeof(v_prediction->'prediction'->'reasons') is distinct from 'array'
      or jsonb_typeof(v_prediction->'prediction'->'totalGrams') is null
      or jsonb_typeof(v_prediction->'prediction'->'totalGrams') not in ('number','null')
      or v_prediction->'prediction'->>'status' is distinct from (case when v_prediction->'prediction'->'totalGrams'='null'::jsonb then 'unavailable' else 'estimated' end)
      or jsonb_typeof(v_prediction->'prediction'->'appliedRules') is distinct from 'array'
      or jsonb_typeof(v_prediction->'prediction'->'assumptions') is distinct from 'array'
      or jsonb_array_length(v_prediction->'prediction'->'assumptions')>32
      or jsonb_typeof(v_prediction->'methodSteps') is distinct from 'array'
      or jsonb_array_length(v_prediction->'methodSteps')>200
      or jsonb_array_length(v_prediction->'rawRows')>200
      or exists(select 1 from jsonb_object_keys(v_prediction) key where key not in ('schemaVersion','inputVersion','catalogVersion','recipeSnapshotId','baseServings','cookingServings','rawRows','methodSteps','prediction'))
    then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if (v_prediction->'prediction'->'totalGrams') is distinct from 'null'::jsonb
      and (jsonb_typeof(v_prediction->'prediction'->'totalGrams')<>'number'
        or (v_prediction->'prediction'->>'totalGrams')::numeric<=0)
    then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    insert into private.cooked_batch_weight_evidence(owner_uuid,account_generation,batch_id,session_id,operation_receipt_id,
      event_kind,recipe_content_snapshot_id,original_revision,input_source,prediction_json,observed_at)
    values(p_owner_uuid,p_generation,p_batch_id,p_batch_id,v_receipt,'prediction',v_batch.recipe_content_snapshot_id,p_revision,
      case when v_prediction->'prediction'->'totalGrams'='null'::jsonb then 'unavailable' else 'conditional_estimate' end,v_prediction,p_now)
    returning id into v_prediction_id;
  else
    select id into v_prediction_id from private.cooked_batch_weight_evidence where batch_id=p_batch_id and event_kind='prediction';
  end if;
  if v_source is not null then
    if v_source not in ('reported_measured','manual_estimate') then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    v_kind:=case when v_source='reported_measured' then 'reported_measurement' else 'manual_entry' end;
    insert into private.cooked_batch_weight_evidence(owner_uuid,account_generation,batch_id,session_id,operation_receipt_id,
      event_kind,refers_to_prediction_id,recipe_content_snapshot_id,original_revision,input_source,measured_g,measurement_path,observed_at)
    values(p_owner_uuid,p_generation,p_batch_id,case when p_path='completion' then p_batch_id else null end,v_receipt,
      v_kind,v_prediction_id,v_batch.recipe_content_snapshot_id,p_revision,v_source,v_batch.finished_weight_g,p_path,p_now);
  end if;
end;
$function$;

create or replace function public.complete_snapshot_v2_cooking_session_with_weight_evidence(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_session_id uuid,p_idempotency_key uuid,p_consumed_pantry_item_ids uuid[],p_weight_action text,p_finished_weight_g numeric,
  p_weight_input_source text,p_prediction jsonb,p_write_enabled boolean,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare v_authority jsonb; v_claim jsonb; v_result jsonb; v_receipt uuid; v_previous text;
begin
  if p_weight_action is null or p_weight_action not in ('set_finished_weight','weigh_later')
    or (p_weight_action='weigh_later' and p_finished_weight_g is not null)
    or (p_weight_input_source is not null and (p_weight_input_source<>'reported_measured' or p_weight_action<>'set_finished_weight'))
    or (p_finished_weight_g is not null and p_finished_weight_g::text in ('NaN','Infinity','-Infinity'))
  then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,
    'snapshot_v2_complete_weight_evidence',p_idempotency_key,jsonb_build_object('session_id',p_session_id,
      'consumed_pantry_item_ids',p_consumed_pantry_item_ids,'weight_action',p_weight_action,'finished_weight_g',p_finished_weight_g,
      'weight_input_source',p_weight_input_source),p_now);
  if v_claim ? 'replay' then return v_claim->'replay'; end if;
  if p_write_enabled is distinct from true or (select enabled from private.cooked_batch_weight_evidence_control where singleton for share) is distinct from true
    then raise exception 'COOKED_WEIGHT_EVIDENCE_DISABLED' using errcode='55000'; end if;
  v_receipt:=(v_claim->>'receipt_id')::uuid;
  v_previous:=current_setting('homecook.cooked_weight_evidence_context',true);
  perform set_config('homecook.cooked_weight_evidence_context',jsonb_build_object('receipt_id',v_receipt,'prediction',p_prediction,
    'input_source',case when p_weight_action='set_finished_weight' then coalesce(p_weight_input_source,'manual_estimate') else null end)::text,true);
  v_result:=public.complete_snapshot_v2_cooking_session(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
    p_session_id,p_idempotency_key,p_consumed_pantry_item_ids,case when p_weight_action='weigh_later' then 'estimate_from_ingredients' else p_weight_action end,
    case when p_weight_action='weigh_later' then (p_prediction->'prediction'->>'totalGrams')::numeric else p_finished_weight_g end,p_now);
  perform set_config('homecook.cooked_weight_evidence_context',coalesce(v_previous,''),true);
  if p_weight_input_source='reported_measured' and not exists(select 1 from private.cooked_batch_weight_evidence
    where operation_receipt_id=v_receipt and owner_uuid=p_owner_uuid and batch_id=p_session_id and event_kind='reported_measurement')
  then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_session_id,p_now);
  return v_result;
end;
$function$;

create or replace function public.mutate_cooked_batch_weight_with_evidence(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_action text,p_finished_weight_g numeric,p_expected_revision bigint,p_weight_input_source text,
  p_write_enabled boolean,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare v_authority jsonb; v_claim jsonb; v_result jsonb; v_receipt uuid; v_previous text;
begin
  if p_action is distinct from 'set_finished_weight' or (p_weight_input_source is not null and p_weight_input_source<>'reported_measured')
    or p_finished_weight_g is null or p_finished_weight_g<=0 or p_finished_weight_g::text in ('NaN','Infinity','-Infinity')
  then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,
    'cooked_batch_weight_evidence',p_idempotency_key,jsonb_build_object('batch_id',p_batch_id,'expected_revision',p_expected_revision,
      'action',p_action,'finished_weight_g',p_finished_weight_g,'weight_input_source',p_weight_input_source),p_now);
  if v_claim ? 'replay' then return v_claim->'replay'; end if;
  if p_write_enabled is distinct from true or (select enabled from private.cooked_batch_weight_evidence_control where singleton for share) is distinct from true
    then raise exception 'COOKED_WEIGHT_EVIDENCE_DISABLED' using errcode='55000'; end if;
  v_receipt:=(v_claim->>'receipt_id')::uuid;
  v_previous:=current_setting('homecook.cooked_weight_evidence_context',true);
  perform set_config('homecook.cooked_weight_evidence_context',jsonb_build_object('receipt_id',v_receipt,
    'input_source',coalesce(p_weight_input_source,'manual_estimate'))::text,true);
  v_result:=public.mutate_cooked_batch_weight(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
    p_batch_id,p_idempotency_key,p_action,p_finished_weight_g,p_expected_revision,p_now);
  perform set_config('homecook.cooked_weight_evidence_context',coalesce(v_previous,''),true);
  if p_weight_input_source='reported_measured' and not exists(select 1 from private.cooked_batch_weight_evidence
    where operation_receipt_id=v_receipt and owner_uuid=p_owner_uuid and batch_id=p_batch_id and event_kind='reported_measurement')
  then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_batch_id,p_now);
  return v_result;
end;
$function$;

do $migration$
declare v_definition text; v_anchor text;
begin
  select pg_get_functiondef('public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz)'::regprocedure) into v_definition;
  v_anchor:='perform private.finish_cooked_batch_operation(v_receipt,v_result,v_batch_id,p_now);';
  if position(v_anchor in v_definition)=0 then raise exception 'completion evidence anchor missing'; end if;
  execute replace(v_definition,v_anchor,$hook$perform private.record_cooked_weight_evidence(v_batch_id,p_owner_uuid,(v_authority->>'account_generation')::bigint,1,'completion',p_now);
  v_result:=jsonb_set(v_result,'{data,cooked_batch}',private.project_cooked_batch(v_batch_id,p_owner_uuid));
  perform private.finish_cooked_batch_operation(v_receipt,v_result,v_batch_id,p_now);$hook$);

  select pg_get_functiondef('public.mutate_cooked_batch_weight(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,timestamptz)'::regprocedure) into v_definition;
  v_anchor:='perform private.finish_cooked_batch_operation(v_receipt,v_result,p_batch_id,p_now);';
  if position(v_anchor in v_definition)=0 then raise exception 'measurement evidence anchor missing'; end if;
  execute replace(v_definition,v_anchor,$hook$perform private.record_cooked_weight_evidence(p_batch_id,p_owner_uuid,(v_authority->>'account_generation')::bigint,p_expected_revision+1,'before_consumption',p_now);
  v_result:=jsonb_set(v_result,'{data,batch}',private.project_cooked_batch(p_batch_id,p_owner_uuid));
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_batch_id,p_now);$hook$);

  select pg_get_functiondef('private.project_cooked_batch(uuid,uuid)'::regprocedure) into v_definition;
  v_anchor:=$anchor$'weight_status', batch.weight_status,$anchor$;
  if position(v_anchor in v_definition)=0 then raise exception 'weight reader anchor missing'; end if;
  execute replace(v_definition,v_anchor,$hook$'weight_status', batch.weight_status,
    'weight_evidence',private.project_cooked_weight_evidence(batch.id,p_owner_uuid),
    'weight_evidence_enabled',(select enabled from private.cooked_batch_weight_evidence_control where singleton),$hook$);

  select pg_get_functiondef('public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)'::regprocedure) into v_definition;
  v_anchor:=$anchor$'pantry_candidates', v_candidates$anchor$;
  if position(v_anchor in v_definition)=0 then raise exception 'cook capability anchor missing'; end if;
  execute replace(v_definition,v_anchor,$hook$'pantry_candidates', v_candidates,
      'weight_evidence_enabled',(select enabled from private.cooked_batch_weight_evidence_control where singleton)$hook$);

  select pg_get_functiondef('public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)'::regprocedure) into v_definition;
  v_anchor:=$anchor$select * into v_batch from public.leftover_dishes where id=p_source_id and user_id=p_owner_uuid;$anchor$;
  if position(v_anchor in v_definition)=0 then raise exception 'meal preview lock anchor missing'; end if;
  v_definition:=replace(v_definition,v_anchor,$hook$select * into v_batch from public.leftover_dishes where id=p_source_id and user_id=p_owner_uuid for share;$hook$);
  v_anchor:=$anchor$p_amount/v_batch.finished_weight_g);$anchor$;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then raise exception 'meal preview basis anchor missing or ambiguous'; end if;
  execute replace(v_definition,v_anchor,$hook$p_amount/v_batch.finished_weight_g)
      ||jsonb_build_object('weight_basis',private.cooked_weight_meal_basis(v_batch.id,p_owner_uuid))
      ||private.cooked_weight_meal_assumptions(v_batch.id,p_owner_uuid);$hook$);

end;
$migration$;

-- Preserve the current scope chain, including later preview/product scopes.
alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_cooked_weight_evidence_20261013;
create or replace function private.verify_full_local_internal_scope() returns void
language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='snapshot-v2-session'
    and current_setting('request.method',true)='POST'
    and current_setting('request.path',true) in ('/rpc/complete_snapshot_v2_cooking_session_with_weight_evidence','/rpc/mutate_cooked_batch_weight_with_evidence') then return; end if;
  perform private.verify_scope_pre_cooked_weight_evidence_20261013();
end;
$function$;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope(),private.verify_scope_pre_cooked_weight_evidence_20261013() from public,anon,authenticated,service_role;

alter function private.reject_cooked_weight_evidence_update() owner to postgres;
alter function private.project_cooked_weight_evidence(uuid,uuid) owner to postgres;
alter function private.cooked_weight_meal_basis(uuid,uuid) owner to postgres;
alter function private.cooked_weight_meal_assumptions(uuid,uuid) owner to postgres;
alter function private.freeze_meal_log_cooked_weight_basis() owner to postgres;
alter function private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamptz) owner to postgres;
alter function public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamptz) owner to postgres;
alter function public.mutate_cooked_batch_weight_with_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,timestamptz) owner to postgres;
revoke all on function private.reject_cooked_weight_evidence_update(),private.project_cooked_weight_evidence(uuid,uuid),
  private.cooked_weight_meal_basis(uuid,uuid),private.cooked_weight_meal_assumptions(uuid,uuid),private.freeze_meal_log_cooked_weight_basis(),
  private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamptz),
  public.mutate_cooked_batch_weight_with_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamptz),
  public.mutate_cooked_batch_weight_with_evidence(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,timestamptz) to service_role;

comment on table private.cooked_batch_weight_evidence is 'Personal immutable weight provenance. Not quantity events, consent state, eligible training samples, or device verification. Owner/batch deletion cascades; no new retention period is selected.';
notify pgrst,'reload schema';
commit;
