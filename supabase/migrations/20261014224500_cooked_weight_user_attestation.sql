begin;

-- This control stops only fresh personal assertions; C01 and read/retract stay independent.
create table private.cooked_weight_user_attestation_control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.cooked_weight_user_attestation_control owner to postgres;
alter table private.cooked_weight_user_attestation_control enable row level security;
revoke all on private.cooked_weight_user_attestation_control from public,anon,authenticated,service_role;
insert into private.cooked_weight_user_attestation_control(singleton,enabled) values(true,false);

-- Personal QA records only: no change to C01 predictions, planned rows or model collection.
create table private.cooked_weight_user_attestations (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_uuid uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null check(account_generation>0),
  batch_id uuid not null references public.leftover_dishes(id) on delete cascade,
  measurement_evidence_id uuid not null references private.cooked_batch_weight_evidence(id) on delete cascade,
  recipe_content_snapshot_id uuid not null references public.recipe_content_snapshots(id),
  measurement_original_revision bigint not null check(measurement_original_revision>0),
  assertion_revision bigint not null check(assertion_revision>0),
  event_kind text not null check(event_kind in ('attested','retracted')),
  prior_assertion_id uuid references private.cooked_weight_user_attestations(id) on delete cascade,
  statement_version text not null check(statement_version='pinned-quantities-whole-net-weight-v1'),
  context_fingerprint text not null check(context_fingerprint~'^[0-9a-f]{64}$'),
  assertion_json jsonb not null,
  operation_receipt_id uuid not null unique,
  observed_at timestamptz not null,
  unique(measurement_evidence_id,assertion_revision),
  check((event_kind='attested' and prior_assertion_id is null and assertion_revision=1)
    or (event_kind='retracted' and prior_assertion_id is not null and assertion_revision=2))
);
create unique index cooked_weight_user_attestation_once on private.cooked_weight_user_attestations(measurement_evidence_id) where event_kind='attested';
create index cooked_weight_user_attestation_owner_batch on private.cooked_weight_user_attestations(owner_uuid,account_generation,batch_id);
alter table private.cooked_weight_user_attestations owner to postgres;
alter table private.cooked_weight_user_attestations enable row level security;
revoke all on private.cooked_weight_user_attestations from public,anon,authenticated,service_role;
create trigger cooked_weight_user_attestation_immutable before update on private.cooked_weight_user_attestations
for each row execute function private.reject_cooked_weight_evidence_update();

create function private.require_cooked_weight_attestation_scope(p_rpc text) returns void
language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $function$
begin
  if auth.role() is distinct from 'service_role'
    or coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope' is distinct from 'snapshot-v2-session'
    or current_setting('request.method',true) is distinct from 'POST'
    or current_setting('request.path',true) is distinct from '/rpc/'||p_rpc then
    raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform private.verify_full_local_internal_scope();
end;
$function$;

-- Every quantity below comes from the server's frozen snapshot, never a client actual vector.
create function private.cooked_weight_attestation_context(p_owner uuid,p_generation bigint,p_kind text,p_target uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,private,pg_temp as $function$
declare s public.cooking_sessions%rowtype; b public.leftover_dishes%rowtype; snap public.recipe_content_snapshots%rowtype;
  servings numeric; can_attest boolean:=false; rows jsonb; payload jsonb;
begin
  if p_kind='session' then
    select * into s from public.cooking_sessions where id=p_target and user_id=p_owner and contract_version='snapshot_v2';
    if s.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    select * into snap from public.recipe_content_snapshots where id=s.recipe_content_snapshot_id;
    servings:=s.cooking_servings; can_attest:=s.status='in_progress';
  elsif p_kind='batch' then
    select * into b from public.leftover_dishes where id=p_target and user_id=p_owner;
    if b.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    select * into snap from public.recipe_content_snapshots where id=b.recipe_content_snapshot_id;
    servings:=b.cooking_servings;
    can_attest:=b.batch_status='available' and (b.weight_status='missing' or (b.weight_status='known' and b.weight_source='estimated'))
      and not exists(select 1 from public.cooked_batch_quantity_events where cooked_batch_id=b.id)
      and exists(select 1 from private.cooked_batch_weight_evidence where batch_id=b.id and owner_uuid=p_owner
        and account_generation=p_generation and event_kind='prediction');
  else raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if snap.id is null or servings is null or servings<=0 or snap.base_servings<=0
    or (snap.owner_user_id is not null and snap.owner_user_id<>p_owner)
    or jsonb_typeof(snap.ingredients_json)<>'array' or jsonb_array_length(snap.ingredients_json)>200 then
    raise exception 'CONFLICT' using errcode='55000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'row_key',coalesce(r->>'row_key',coalesce(r->>'food_product_id',r->>'ingredient_id')||':'||(n-1)::text),
    'ingredient_id',r->'ingredient_id','food_product_id',r->'food_product_id',
    'food_product_nutrition_version_id',r->'food_product_nutrition_version_id',
    'snapshot_amount',r->'amount','unit',r->'unit','scalable',r->'scalable','ingredient_type',r->'ingredient_type',
    'frozen_quantity_input',r->'quantity_input',
    'declared_batch_amount',case when jsonb_typeof(r->'amount')='number' then
      to_jsonb((r->>'amount')::numeric*case when r->'scalable'='true'::jsonb then servings/snap.base_servings else 1 end) else 'null'::jsonb end,
    'quantity_origin','planned','claim','matches_pinned_quantities','provenance','user_attested') order by n),'[]'::jsonb)
    into rows from jsonb_array_elements(snap.ingredients_json) with ordinality as items(r,n);
  payload:=jsonb_build_object('schema_version','cooked-weight-user-attestation-v1','statement_version','pinned-quantities-whole-net-weight-v1',
    'owner_uuid',p_owner,'account_generation',p_generation,'target_kind',p_kind,'target_id',p_target,
    'recipe_content_snapshot_id',snap.id,'content_hash',snap.content_hash,'base_servings',snap.base_servings,
    'cooking_servings',servings,'rows',rows,'steps_fingerprint',encode(extensions.digest(convert_to(snap.steps_json::text,'UTF8'),'sha256'),'hex'));
  return jsonb_build_object('payload',payload,'context_fingerprint',encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'),
    'can_attest',can_attest and jsonb_array_length(rows)>0
      and coalesce((select enabled from private.cooked_batch_weight_evidence_control where singleton),false)
      and coalesce((select enabled from private.cooked_weight_user_attestation_control where singleton),false));
end;
$function$;

create function private.project_cooked_weight_attestation_record(p_owner uuid,p_generation bigint,p_batch uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,private,pg_temp as $function$
declare entry private.cooked_weight_user_attestations%rowtype; original private.cooked_weight_user_attestations%rowtype; measurement private.cooked_batch_weight_evidence%rowtype;
begin
  if (select count(distinct measurement_evidence_id) from private.cooked_weight_user_attestations
    where owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch)>1 then
    raise exception 'CONFLICT' using errcode='55000'; end if;
  select * into entry from private.cooked_weight_user_attestations where owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch
    order by assertion_revision desc limit 1;
  if entry.id is null then return null; end if;
  if entry.event_kind='retracted' then select * into original from private.cooked_weight_user_attestations
    where id=entry.prior_assertion_id and owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch;
  else original:=entry; end if;
  if original.id is null then raise exception 'CONFLICT' using errcode='55000'; end if;
  select * into measurement from private.cooked_batch_weight_evidence where id=original.measurement_evidence_id
    and owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch
    and event_kind='reported_measurement' and input_source='reported_measured'
    and recipe_content_snapshot_id=original.recipe_content_snapshot_id and original_revision=original.measurement_original_revision;
  if measurement.id is null or measurement.measured_g is null then raise exception 'CONFLICT' using errcode='55000'; end if;
  return jsonb_build_object('id',entry.id,'revision',entry.assertion_revision,'status',entry.event_kind,
    'statement_version',entry.statement_version,'measurement_evidence_id',entry.measurement_evidence_id,
    'measurement_original_revision',entry.measurement_original_revision,'measured_g',measurement.measured_g,'recipe_content_snapshot_id',entry.recipe_content_snapshot_id,
    'context_fingerprint',entry.context_fingerprint,'observed_at',entry.observed_at,
    'row_count',jsonb_array_length(original.assertion_json#>'{payload,rows}'),
    'provenance','user_attested','physical_verification','not_verified','record_usage','qa_personal_record');
end;
$function$;

create function public.read_cooked_weight_attestation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_target_kind text,p_target_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare authority jsonb; ctx jsonb; generation bigint;
begin
  perform private.require_cooked_weight_attestation_scope('read_cooked_weight_attestation');
  authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  generation:=(authority->>'account_generation')::bigint;
  ctx:=private.cooked_weight_attestation_context(p_owner_uuid,generation,p_target_kind,p_target_id);
  return jsonb_build_object('schema_version','cooked-weight-user-attestation-v1','statement_version','pinned-quantities-whole-net-weight-v1',
    'subject',jsonb_build_object('owner_uuid',p_owner_uuid,'account_generation',generation),'target_kind',p_target_kind,'target_id',p_target_id,
    'context_fingerprint',ctx->'context_fingerprint','recipe_content_snapshot_id',ctx#>'{payload,recipe_content_snapshot_id}',
    'cooking_servings',ctx#>'{payload,cooking_servings}','can_attest',ctx->'can_attest',
    'record',private.project_cooked_weight_attestation_record(p_owner_uuid,generation,p_target_id));
end;
$function$;

create function private.insert_cooked_weight_user_attestation(p_owner uuid,p_generation bigint,p_batch uuid,p_key uuid,p_context jsonb,p_receipt uuid,p_now timestamptz) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog,public,private,pg_temp as $function$
declare observation private.cooked_batch_weight_evidence%rowtype; prediction private.cooked_batch_weight_evidence%rowtype;
begin
  select e.* into strict observation from private.cooked_batch_weight_evidence e join public.mutation_idempotency_keys r on r.id=e.operation_receipt_id
    where e.owner_uuid=p_owner and e.account_generation=p_generation and e.batch_id=p_batch and e.event_kind='reported_measurement'
    and r.owner_uuid=p_owner and r.account_generation=p_generation and r.state='succeeded' and r.terminal_result='succeeded'
    and r.key_hash=encode(extensions.digest(convert_to(p_key::text,'UTF8'),'sha256'),'hex') and r.result_reference=p_batch;
  select * into strict prediction from private.cooked_batch_weight_evidence where id=observation.refers_to_prediction_id
    and owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch and event_kind='prediction';
  if observation.recipe_content_snapshot_id::text is distinct from p_context#>>'{payload,recipe_content_snapshot_id}'
    or prediction.recipe_content_snapshot_id<>observation.recipe_content_snapshot_id then raise exception 'CONFLICT' using errcode='55000'; end if;
  insert into private.cooked_weight_user_attestations(owner_uuid,account_generation,batch_id,measurement_evidence_id,recipe_content_snapshot_id,
    measurement_original_revision,assertion_revision,event_kind,statement_version,context_fingerprint,assertion_json,operation_receipt_id,observed_at)
  values(p_owner,p_generation,p_batch,observation.id,observation.recipe_content_snapshot_id,observation.original_revision,1,'attested',
    'pinned-quantities-whole-net-weight-v1',p_context->>'context_fingerprint',p_context||jsonb_build_object('prediction_evidence_id',prediction.id,
      'input_version',prediction.prediction_json->>'inputVersion','model_version',prediction.prediction_json#>>'{prediction,modelVersion}',
      'catalog_version',prediction.prediction_json->>'catalogVersion','physical_verification','not_verified','record_usage','qa_personal_record'),p_receipt,p_now);
  return private.project_cooked_weight_attestation_record(p_owner,p_generation,p_batch);
end;
$function$;

create function public.complete_snapshot_v2_cooking_session_with_attestation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_session_id uuid,p_idempotency_key uuid,p_consumed_pantry_item_ids uuid[],p_weight_action text,p_finished_weight_g numeric,
  p_weight_input_source text,p_prediction jsonb,p_write_enabled boolean,
  p_expected_generation bigint,p_statement_version text,p_expected_context text,p_checked boolean,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare authority jsonb; generation bigint; claim jsonb; receipt uuid; ctx jsonb; result jsonb; attestation jsonb; enabled boolean;
begin
  perform private.require_cooked_weight_attestation_scope('complete_snapshot_v2_cooking_session_with_attestation');
  if p_checked is distinct from true or p_statement_version is distinct from 'pinned-quantities-whole-net-weight-v1'
    or p_expected_context is null or p_expected_context!~'^[0-9a-f]{64}$' or p_weight_action is distinct from 'set_finished_weight'
    or p_weight_input_source is distinct from 'reported_measured' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  generation:=(authority->>'account_generation')::bigint;
  if generation is distinct from p_expected_generation then raise exception 'WEIGHT_ATTESTATION_SUBJECT_CHANGED' using errcode='55000'; end if;
  claim:=private.claim_cooked_batch_operation(p_owner_uuid,generation,'weight_attestation_complete',p_idempotency_key,
    jsonb_build_object('session_id',p_session_id,'pantry_ids',p_consumed_pantry_item_ids,'weight_action',p_weight_action,'grams',p_finished_weight_g,
      'source',p_weight_input_source,'generation',p_expected_generation,'statement',p_statement_version,'context',p_expected_context,'checked',p_checked),p_now);
  if claim?'replay' then return claim->'replay'; end if;
  receipt:=(claim->>'receipt_id')::uuid;
  select c.enabled into enabled from private.cooked_weight_user_attestation_control c where singleton for share;
  if enabled is distinct from true then raise exception 'WEIGHT_ATTESTATION_DISABLED' using errcode='55000'; end if;
  if exists(select 1 from public.mutation_idempotency_keys where owner_uuid=p_owner_uuid and account_generation=generation
    and operation_scope in ('snapshot_v2_complete_weight_evidence','snapshot_v2_complete')
    and key_hash=encode(extensions.digest(convert_to(p_idempotency_key::text,'UTF8'),'sha256'),'hex')) then
    raise exception 'WEIGHT_ATTESTATION_OLD_RECEIPT' using errcode='55000'; end if;
  perform 1 from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid for update;
  ctx:=private.cooked_weight_attestation_context(p_owner_uuid,generation,'session',p_session_id);
  if ctx->>'context_fingerprint' is distinct from p_expected_context or ctx->'can_attest' is distinct from 'true'::jsonb then
    raise exception 'WEIGHT_ATTESTATION_CONTEXT_CHANGED' using errcode='55000'; end if;
  -- Call the original C01 and core writers without replacing request headers/claims or their checks.
  result:=public.complete_snapshot_v2_cooking_session_with_weight_evidence(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
    p_session_id,p_idempotency_key,p_consumed_pantry_item_ids,p_weight_action,p_finished_weight_g,p_weight_input_source,p_prediction,p_write_enabled,p_now);
  attestation:=private.insert_cooked_weight_user_attestation(p_owner_uuid,generation,p_session_id,p_idempotency_key,ctx,receipt,p_now);
  result:=jsonb_set(result,'{data,weight_attestation}',attestation);
  perform private.finish_cooked_batch_operation(receipt,result,p_session_id,p_now);
  return result;
end;
$function$;

create function public.mutate_cooked_batch_weight_with_attestation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_action text,p_finished_weight_g numeric,p_expected_revision bigint,p_weight_input_source text,p_write_enabled boolean,
  p_expected_generation bigint,p_statement_version text,p_expected_context text,p_checked boolean,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare authority jsonb; generation bigint; claim jsonb; receipt uuid; ctx jsonb; result jsonb; attestation jsonb; enabled boolean;
begin
  perform private.require_cooked_weight_attestation_scope('mutate_cooked_batch_weight_with_attestation');
  if p_checked is distinct from true or p_statement_version is distinct from 'pinned-quantities-whole-net-weight-v1'
    or p_expected_context is null or p_expected_context!~'^[0-9a-f]{64}$' or p_action is distinct from 'set_finished_weight'
    or p_weight_input_source is distinct from 'reported_measured' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  generation:=(authority->>'account_generation')::bigint;
  if generation is distinct from p_expected_generation then raise exception 'WEIGHT_ATTESTATION_SUBJECT_CHANGED' using errcode='55000'; end if;
  claim:=private.claim_cooked_batch_operation(p_owner_uuid,generation,'weight_attestation_measure',p_idempotency_key,
    jsonb_build_object('batch_id',p_batch_id,'action',p_action,'grams',p_finished_weight_g,'revision',p_expected_revision,'source',p_weight_input_source,
      'generation',p_expected_generation,'statement',p_statement_version,'context',p_expected_context,'checked',p_checked),p_now);
  if claim?'replay' then return claim->'replay'; end if;
  receipt:=(claim->>'receipt_id')::uuid;
  select c.enabled into enabled from private.cooked_weight_user_attestation_control c where singleton for share;
  if enabled is distinct from true then raise exception 'WEIGHT_ATTESTATION_DISABLED' using errcode='55000'; end if;
  if exists(select 1 from public.mutation_idempotency_keys where owner_uuid=p_owner_uuid and account_generation=generation
    and operation_scope in ('cooked_batch_weight_evidence','cooked_batch_set_finished_weight')
    and key_hash=encode(extensions.digest(convert_to(p_idempotency_key::text,'UTF8'),'sha256'),'hex')) then
    raise exception 'WEIGHT_ATTESTATION_OLD_RECEIPT' using errcode='55000'; end if;
  perform 1 from public.leftover_dishes where id=p_batch_id and user_id=p_owner_uuid for update;
  ctx:=private.cooked_weight_attestation_context(p_owner_uuid,generation,'batch',p_batch_id);
  if ctx->>'context_fingerprint' is distinct from p_expected_context or ctx->'can_attest' is distinct from 'true'::jsonb then
    raise exception 'WEIGHT_ATTESTATION_CONTEXT_CHANGED' using errcode='55000'; end if;
  result:=public.mutate_cooked_batch_weight_with_evidence(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,
    p_batch_id,p_idempotency_key,p_action,p_finished_weight_g,p_expected_revision,p_weight_input_source,p_write_enabled,p_now);
  attestation:=private.insert_cooked_weight_user_attestation(p_owner_uuid,generation,p_batch_id,p_idempotency_key,ctx,receipt,p_now);
  result:=jsonb_set(result,'{data,weight_attestation}',attestation);
  perform private.finish_cooked_batch_operation(receipt,result,p_batch_id,p_now);
  return result;
end;
$function$;

create function public.retract_cooked_weight_attestation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_expected_generation bigint,p_expected_record uuid,p_expected_revision bigint,p_expected_context text,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare authority jsonb; generation bigint; claim jsonb; receipt uuid; previous private.cooked_weight_user_attestations%rowtype; result jsonb;
begin
  perform private.require_cooked_weight_attestation_scope('retract_cooked_weight_attestation');
  authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  generation:=(authority->>'account_generation')::bigint;
  if generation is distinct from p_expected_generation then raise exception 'WEIGHT_ATTESTATION_SUBJECT_CHANGED' using errcode='55000'; end if;
  claim:=private.claim_cooked_batch_operation(p_owner_uuid,generation,'weight_attestation_retract',p_idempotency_key,
    jsonb_build_object('batch_id',p_batch_id,'generation',p_expected_generation,'record',p_expected_record,'revision',p_expected_revision,'context',p_expected_context),p_now);
  if claim?'replay' then return claim->'replay'; end if;
  receipt:=(claim->>'receipt_id')::uuid;
  select * into previous from private.cooked_weight_user_attestations where id=p_expected_record and owner_uuid=p_owner_uuid
    and account_generation=generation and batch_id=p_batch_id for update;
  if previous.id is null or previous.event_kind<>'attested' or previous.assertion_revision is distinct from p_expected_revision
    or previous.context_fingerprint is distinct from p_expected_context or exists(select 1 from private.cooked_weight_user_attestations where prior_assertion_id=previous.id) then
    raise exception 'WEIGHT_ATTESTATION_REVISION_CONFLICT' using errcode='55000'; end if;
  insert into private.cooked_weight_user_attestations(owner_uuid,account_generation,batch_id,measurement_evidence_id,recipe_content_snapshot_id,
    measurement_original_revision,assertion_revision,event_kind,prior_assertion_id,statement_version,context_fingerprint,assertion_json,operation_receipt_id,observed_at)
  values(p_owner_uuid,generation,p_batch_id,previous.measurement_evidence_id,previous.recipe_content_snapshot_id,previous.measurement_original_revision,
    2,'retracted',previous.id,previous.statement_version,previous.context_fingerprint,'{}'::jsonb,receipt,p_now);
  -- Projection is private; do not spoof the nested public RPC's exact request path.
  result:=private.cooked_weight_attestation_context(p_owner_uuid,generation,'batch',p_batch_id);
  result:=jsonb_build_object('schema_version','cooked-weight-user-attestation-v1','statement_version','pinned-quantities-whole-net-weight-v1',
    'subject',jsonb_build_object('owner_uuid',p_owner_uuid,'account_generation',generation),'target_kind','batch','target_id',p_batch_id,
    'context_fingerprint',result->'context_fingerprint','recipe_content_snapshot_id',result#>'{payload,recipe_content_snapshot_id}',
    'cooking_servings',result#>'{payload,cooking_servings}','can_attest',false,'record',private.project_cooked_weight_attestation_record(p_owner_uuid,generation,p_batch_id));
  perform private.finish_cooked_batch_operation(receipt,result,p_batch_id,p_now);
  return result;
end;
$function$;

alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_weight_attestation_20261014;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='snapshot-v2-session'
    and current_setting('request.method',true)='POST' and current_setting('request.path',true) in (
      '/rpc/read_cooked_weight_attestation','/rpc/complete_snapshot_v2_cooking_session_with_attestation',
      '/rpc/mutate_cooked_batch_weight_with_attestation','/rpc/retract_cooked_weight_attestation') then return; end if;
  perform private.verify_scope_pre_weight_attestation_20261014();
end;
$function$;

alter function private.require_cooked_weight_attestation_scope(text) owner to postgres;
alter function private.cooked_weight_attestation_context(uuid,bigint,text,uuid) owner to postgres;
alter function private.project_cooked_weight_attestation_record(uuid,bigint,uuid) owner to postgres;
alter function private.insert_cooked_weight_user_attestation(uuid,bigint,uuid,uuid,jsonb,uuid,timestamptz) owner to postgres;
alter function public.read_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,text,uuid) owner to postgres;
alter function public.complete_snapshot_v2_cooking_session_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,text,text,boolean,timestamptz) owner to postgres;
alter function public.mutate_cooked_batch_weight_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,bigint,text,text,boolean,timestamptz) owner to postgres;
alter function public.retract_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,bigint,text,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.require_cooked_weight_attestation_scope(text),private.cooked_weight_attestation_context(uuid,bigint,text,uuid),
  private.project_cooked_weight_attestation_record(uuid,bigint,uuid),private.insert_cooked_weight_user_attestation(uuid,bigint,uuid,uuid,jsonb,uuid,timestamptz),
  private.verify_full_local_internal_scope(),private.verify_scope_pre_weight_attestation_20261014() from public,anon,authenticated,service_role;
revoke all on function public.read_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,text,uuid),
  public.complete_snapshot_v2_cooking_session_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,text,text,boolean,timestamptz),
  public.mutate_cooked_batch_weight_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,bigint,text,text,boolean,timestamptz),
  public.retract_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.read_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,text,uuid),
  public.complete_snapshot_v2_cooking_session_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,text,text,boolean,timestamptz),
  public.mutate_cooked_batch_weight_with_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,text,boolean,bigint,text,text,boolean,timestamptz),
  public.retract_cooked_weight_attestation(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,bigint,text,timestamptz) to service_role;
comment on table private.cooked_weight_user_attestations is 'Personal append-only QA user statements about pinned quantities and reported net whole weight. Not physical verification, corrected actual rows, learning participation or model collection. Owner/batch/measurement deletion cascades; no new retention period is selected.';
comment on table private.cooked_weight_user_attestation_control is 'Default-OFF fresh personal assertion writer only. Read, retract and existing C01 writes remain independent.';
commit;
