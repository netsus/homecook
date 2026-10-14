begin;

-- Server-only read preparation. No collector, policy, expiry or source write.
create function private.project_weight_improvement_sample_source(
  p_owner uuid,p_generation bigint,p_batch uuid,p_evidence uuid,p_revision bigint
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,private,pg_temp as $function$
declare
  b public.leftover_dishes%rowtype; o private.cooked_batch_weight_evidence%rowtype;
  p private.cooked_batch_weight_evidence%rowtype; s public.cooking_sessions%rowtype;
  snap public.recipe_content_snapshots%rowtype;
  receipt public.mutation_idempotency_keys%rowtype; prior public.mutation_idempotency_keys%rowtype;
  inner_receipt public.mutation_idempotency_keys%rowtype; completion_core public.mutation_idempotency_keys%rowtype;
  result_batch jsonb; expected_scope text; expected_inner text; input jsonb; projected_input jsonb;
  rows jsonb; segments jsonb; source jsonb;
begin
  select * into b from public.leftover_dishes where id=p_batch and user_id=p_owner;
  select * into o from private.cooked_batch_weight_evidence where id=p_evidence and owner_uuid=p_owner
    and account_generation=p_generation and batch_id=p_batch and original_revision=p_revision;
  if b.id is null or o.id is null then return null; end if;
  select * into p from private.cooked_batch_weight_evidence where id=o.refers_to_prediction_id
    and owner_uuid=p_owner and account_generation=p_generation and batch_id=p_batch and event_kind='prediction';
  select * into s from public.cooking_sessions where id=p.session_id and user_id=p_owner;
  select * into snap from public.recipe_content_snapshots where id=b.recipe_content_snapshot_id;
  if p.id is null or s.id is null or snap.id is null
    or o.event_kind<>'reported_measurement' or o.input_source<>'reported_measured'
    or o.measurement_path not in('completion','before_consumption')
    or b.weight_status is distinct from 'known' or b.weight_source is distinct from 'measured'
    or b.finished_weight_g is distinct from o.measured_g or o.measured_g<=0
    or b.revision is null or b.cooking_servings is null or b.cooking_servings<=0 or b.revision<o.original_revision or p.original_revision<>1 or p.original_revision>o.original_revision
    or o.recipe_content_snapshot_id<>b.recipe_content_snapshot_id or p.recipe_content_snapshot_id<>b.recipe_content_snapshot_id
    or s.id<>b.id or s.status is distinct from 'completed' or s.contract_version is distinct from 'snapshot_v2'
    or s.recipe_content_snapshot_id<>b.recipe_content_snapshot_id or s.cooking_servings<>b.cooking_servings
    or (snap.owner_user_id is not null and snap.owner_user_id<>p_owner)
    or snap.recipe_id<>b.recipe_id or s.recipe_id<>b.recipe_id
    or p.prediction_json->>'schemaVersion' is distinct from 'cooked-weight-evidence-v1'
    or p.prediction_json->>'inputVersion' is distinct from 'snapshot-weight-v2'
    or p.prediction_json->>'catalogVersion' is distinct from 'usda-release2-2014'
    or p.prediction_json#>>'{prediction,modelVersion}' is distinct from 'bounded-weight-v2'
    or p.prediction_json#>>'{prediction,scope}' is distinct from 'candidate'
    or p.prediction_json#>'{prediction,learningEligible}' is distinct from 'false'::jsonb
    or p.prediction_json->>'recipeSnapshotId' is distinct from snap.id::text
    or p.prediction_json->'baseServings' is distinct from to_jsonb(snap.base_servings)
    or p.prediction_json->'cookingServings' is distinct from to_jsonb(b.cooking_servings)
    or (o.measurement_path='completion' and (o.session_id is distinct from s.id or o.operation_receipt_id<>p.operation_receipt_id or o.original_revision<>1))
    or (o.measurement_path='before_consumption' and (o.session_id is not null or o.original_revision<>2))
    or exists(select 1 from private.cooked_batch_weight_evidence other where other.batch_id=p_batch
      and other.owner_uuid=p_owner and other.event_kind<>'prediction' and other.id<>o.id)
  then return null; end if;

  -- Exact causal receipt, not a latest observation or current/original revision equality.
  expected_scope:=case o.measurement_path when 'completion' then 'snapshot_v2_complete_weight_evidence' else 'cooked_batch_weight_evidence' end;
  expected_inner:=case o.measurement_path when 'completion' then 'snapshot_v2_complete' else 'cooked_batch_set_finished_weight' end;
  select * into receipt from public.mutation_idempotency_keys where id=o.operation_receipt_id;
  select * into prior from public.mutation_idempotency_keys where id=p.operation_receipt_id;
  if receipt.id is null or prior.id is null
    or receipt.owner_uuid<>p_owner or receipt.account_generation<>p_generation or receipt.operation_scope<>expected_scope
    or receipt.state<>'succeeded' or receipt.terminal_result is distinct from 'succeeded' or receipt.result_reference is distinct from b.id
    or receipt.updated_at is distinct from o.observed_at
    or receipt.durable_result->'success' is distinct from 'true'::jsonb or receipt.durable_result->'error' is distinct from 'null'::jsonb
    or prior.owner_uuid<>p_owner or prior.account_generation<>p_generation or prior.operation_scope<>'snapshot_v2_complete_weight_evidence'
    or prior.state<>'succeeded' or prior.terminal_result is distinct from 'succeeded' or prior.result_reference is distinct from b.id
    or prior.updated_at is distinct from p.observed_at
    or prior.durable_result->'success' is distinct from 'true'::jsonb or prior.durable_result->'error' is distinct from 'null'::jsonb
    or prior.durable_result#>>'{data,session_id}' is distinct from s.id::text
    or prior.durable_result#>>'{data,contract_version}' is distinct from 'snapshot_v2'
    or prior.durable_result#>>'{data,status}' is distinct from 'completed'
    or prior.durable_result#>>'{data,cooked_batch,id}' is distinct from b.id::text
    or prior.durable_result#>'{data,cooked_batch,revision}' is distinct from '1'::jsonb
    or prior.durable_result#>'{data,cooked_batch,cooked_at}' is distinct from to_jsonb(b.cooked_at)
    or prior.durable_result#>'{data,cooked_batch,cooking_servings}' is distinct from to_jsonb(b.cooking_servings)
  then return null; end if;
  select * into completion_core from public.mutation_idempotency_keys r where r.owner_uuid=p_owner
    and r.account_generation=p_generation and r.operation_scope='snapshot_v2_complete' and r.key_hash=prior.key_hash;
  if completion_core.id is null or completion_core.state<>'succeeded'
    or completion_core.terminal_result is distinct from 'succeeded' or completion_core.result_reference is distinct from b.id
    or completion_core.durable_result is distinct from prior.durable_result
  then return null; end if;
  result_batch:=case o.measurement_path when 'completion' then receipt.durable_result#>'{data,cooked_batch}' else receipt.durable_result#>'{data,batch}' end;
  if jsonb_typeof(result_batch) is distinct from 'object' or result_batch->>'id' is distinct from b.id::text
    or result_batch->>'weight_status' is distinct from 'known' or result_batch->>'weight_source' is distinct from 'measured'
    or result_batch->'finished_weight_g' is distinct from to_jsonb(o.measured_g)
    or result_batch->'revision' is distinct from to_jsonb(o.original_revision)
    or (o.measurement_path='before_consumption' and receipt.durable_result#>>'{data,action}' is distinct from 'set_finished_weight')
  then return null; end if;
  select * into inner_receipt from public.mutation_idempotency_keys r where r.owner_uuid=p_owner
    and r.account_generation=p_generation and r.operation_scope=expected_inner and r.key_hash=receipt.key_hash;
  if inner_receipt.id is null or inner_receipt.state<>'succeeded' or inner_receipt.terminal_result is distinct from 'succeeded'
    or inner_receipt.result_reference is distinct from b.id or inner_receipt.durable_result is distinct from receipt.durable_result
    or exists(select 1 from public.mutation_idempotency_keys r where r.owner_uuid=p_owner and r.result_reference=b.id
      and r.operation_scope='cooked_batch_set_finished_weight' and r.state='succeeded'
      and (o.measurement_path='completion' or r.id<>inner_receipt.id))
  then return null; end if;
  -- The reviewed core only sets missing/estimated weights before events; it cannot reset measured weights.
  -- Subsequent quantity events may change batch revision/remaining grams, not this whole-weight observation.
  input:=p.prediction_json#>'{prediction,input}';
  if input is not null and input<>'null'::jsonb then
    if jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_typeof(input->'segments') is distinct from 'array'
      or jsonb_array_length(input->'rows')>200 or jsonb_array_length(input->'segments')>200 then return null; end if;
    select coalesce(jsonb_agg(jsonb_build_object('rowKey',r->'rowKey','sourceKind',r->'sourceKind','sourceId',r->'sourceId',
      'sourceVersion',r->'sourceVersion','amount',r->'amount','unit',r->'unit','grams',r->'grams','quantityOrigin',r->'quantityOrigin',
      'gramsEvidence',case when r->'gramsEvidence'='null'::jsonb then 'null'::jsonb else jsonb_build_object(
        'kind',r#>'{gramsEvidence,kind}','status',r#>'{gramsEvidence,status}','version',r#>'{gramsEvidence,version}',
        'quality',r#>'{gramsEvidence,quality}') end) order by n),'[]') into rows from jsonb_array_elements(input->'rows') with ordinality t(r,n);
    select coalesce(jsonb_agg((select jsonb_object_agg(name,jsonb_build_object('value',r->name->'value',
      'status',r->name->'status','evidenceRef',r->name->'evidenceRef'))
      from unnest(array['method','boundary','drainage','addedMedia','protocol']) name) order by n),'[]')
      into segments from jsonb_array_elements(input->'segments') with ordinality t(r,n);
    projected_input:=jsonb_build_object('recipeSnapshotId',input->'recipeSnapshotId','cookingServings',input->'cookingServings','rows',rows,'segments',segments);
  else projected_input:='null'::jsonb; end if;
  source:=jsonb_build_object('batch',jsonb_build_object('id',b.id,'user_id',b.user_id,'cooked_at',b.cooked_at,
    'recipe_content_snapshot_id',b.recipe_content_snapshot_id,'cooking_servings',b.cooking_servings,'revision',b.revision),
    'observation',jsonb_build_object('id',o.id,'owner_uuid',o.owner_uuid,'account_generation',o.account_generation,'batch_id',o.batch_id,
      'recipe_content_snapshot_id',o.recipe_content_snapshot_id,'original_revision',o.original_revision,'event_kind',o.event_kind,
      'input_source',o.input_source,'refers_to_prediction_id',o.refers_to_prediction_id,'measured_g',o.measured_g,'measurement_path',o.measurement_path,'observed_at',o.observed_at),
    'prediction',jsonb_build_object('id',p.id,'owner_uuid',p.owner_uuid,'account_generation',p.account_generation,'batch_id',p.batch_id,
      'recipe_content_snapshot_id',p.recipe_content_snapshot_id,'original_revision',p.original_revision,'event_kind',p.event_kind,
      'prediction_json',jsonb_build_object('schemaVersion',p.prediction_json->'schemaVersion','inputVersion',p.prediction_json->'inputVersion',
        'catalogVersion',p.prediction_json->'catalogVersion','recipeSnapshotId',p.prediction_json->'recipeSnapshotId','cookingServings',p.prediction_json->'cookingServings',
        'prediction',jsonb_build_object('modelVersion',p.prediction_json#>'{prediction,modelVersion}','scope',p.prediction_json#>'{prediction,scope}',
          'learningEligible',p.prediction_json#>'{prediction,learningEligible}','input',projected_input))),
    'current_relation',jsonb_build_object('subject',jsonb_build_object('owner_uuid',p_owner,'account_generation',p_generation),
      'purpose','cooked_weight_estimation_improvement','source_batch_id',b.id,'source_evidence_id',o.id,'original_revision',o.original_revision,
      'state','current','recipe_content_snapshot_id',b.recipe_content_snapshot_id));
  return source;
end;
$function$;

create function public.read_weight_improvement_sample_source(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_expected_account_generation bigint,p_consent_revision bigint,p_document_version text,p_document_hash text,
  p_batch_id uuid,p_evidence_id uuid,p_original_revision bigint
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare authority jsonb; generation bigint; control private.weight_improvement_control%rowtype;
  participation private.weight_improvement_participation%rowtype; document private.weight_improvement_documents%rowtype;
  source jsonb;
begin
  perform private.require_weight_improvement_scope('read_weight_improvement_sample_source');
  authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  generation:=(authority->>'account_generation')::bigint;
  if p_expected_account_generation is distinct from generation then raise exception 'PARTICIPATION_SUBJECT_CHANGED' using errcode='55000'; end if;
  if p_batch_id is null or p_evidence_id is null or p_original_revision is null or p_original_revision<=0
    or p_consent_revision is null or p_consent_revision<0 or p_document_version is null or p_document_hash is null
    or length(p_document_version)>80 or p_document_hash!~'^[a-f0-9]{64}$' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  select * into control from private.weight_improvement_control where singleton for share;
  select * into document from private.weight_improvement_documents where version=control.current_document_version;
  select * into participation from private.weight_improvement_participation where owner_uuid=p_owner_uuid
    and account_generation=generation and purpose='cooked_weight_estimation_improvement' for share;
  if control.participation_enabled is distinct from true or not coalesce(private.is_weight_improvement_document_complete(document.document_json),false)
    or participation.decision is distinct from 'opted_in' or participation.revision is distinct from p_consent_revision
    or participation.consent_document_version is distinct from document.version or participation.consent_document_hash is distinct from document.document_hash
    or document.version is distinct from p_document_version or document.document_hash is distinct from p_document_hash
  then return jsonb_build_object('schema_version','weight-improvement-source-v1','status','disabled','source',null); end if;
  -- No source table is queried above this server-side current consent boundary.
  if not exists(select 1 from public.leftover_dishes where id=p_batch_id and user_id=p_owner_uuid and cooked_at>participation.opted_in_at)
    then return jsonb_build_object('schema_version','weight-improvement-source-v1','status','unavailable','source',null); end if;
  source:=private.project_weight_improvement_sample_source(p_owner_uuid,generation,p_batch_id,p_evidence_id,p_original_revision);
  return jsonb_build_object('schema_version','weight-improvement-source-v1','status',case when source is null then 'unknown' else 'source' end,'source',source);
end;
$function$;

alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_weight_source_read_20261014;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='weight-improvement'
    and upper(coalesce(current_setting('request.method',true),''))='POST'
    and current_setting('request.path',true)='/rpc/read_weight_improvement_sample_source' then return; end if;
  perform private.verify_scope_pre_weight_source_read_20261014();
end;
$function$;
alter function private.project_weight_improvement_sample_source(uuid,bigint,uuid,uuid,bigint) owner to postgres;
alter function public.read_weight_improvement_sample_source(uuid,timestamptz,text,integer,timestamptz,bigint,bigint,text,text,uuid,uuid,bigint) owner to postgres;
alter function private.verify_scope_pre_weight_source_read_20261014() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.project_weight_improvement_sample_source(uuid,bigint,uuid,uuid,bigint),
  private.verify_scope_pre_weight_source_read_20261014(),private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function public.read_weight_improvement_sample_source(uuid,timestamptz,text,integer,timestamptz,bigint,bigint,text,text,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.read_weight_improvement_sample_source(uuid,timestamptz,text,integer,timestamptz,bigint,bigint,text,text,uuid,uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
