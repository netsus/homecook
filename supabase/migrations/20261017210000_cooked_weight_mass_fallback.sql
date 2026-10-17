-- Extend model compatibility only; owner/state/idempotency/measurement gates stay intact.
-- Requires schema+web release; existing evidence/observations are never rewritten.
begin;
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
      or coalesce(v_prediction->'prediction'->>'modelVersion','') not in ('bounded-weight-v2','ingredient-mass-75-v1')
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
    -- Disclosed fallback requires a completely known mass, never a partial sum.
    if v_prediction->'prediction'->>'modelVersion'='ingredient-mass-75-v1' then
      if v_prediction->'prediction'->'assumptions' <> '["ingredient_mass_seventy_five_percent"]'::jsonb
        or v_prediction->'prediction'->'appliedRules' <> '[]'::jsonb
        or jsonb_typeof(v_prediction->'prediction'->'input'->'rows') is distinct from 'array'
        or jsonb_array_length(v_prediction->'prediction'->'input'->'rows') not between 1 and 200
        or exists(select 1 from jsonb_array_elements(v_prediction->'prediction'->'input'->'rows') row where
          coalesce(row->>'sourceKind','') not in ('ingredient','food_product')
          or row->>'quantityKind' is distinct from 'quantitative'
          or coalesce(row->>'quantityOrigin','') not in ('planned','reported_actual')
          or nullif(row->>'rowKey','') is null or nullif(row->>'sourceId','') is null
          or nullif(row->>'unit','') is null
          or jsonb_typeof(row->'amount') is distinct from 'number' or (row->>'amount')::numeric<=0
          or jsonb_typeof(row->'grams') is distinct from 'number' or (row->>'grams')::numeric<=0
          or row->'gramsEvidence'->>'status' is distinct from 'confirmed'
          or coalesce(row->'gramsEvidence'->>'kind','') not in ('direct_mass','ingredient_conversion','product_relation')
          or (row->'gramsEvidence'->>'kind'='direct_mass' and (lower(trim(row->>'unit')) not in ('g','kg')
            or abs((row->>'grams')::numeric-(row->>'amount')::numeric*case when lower(trim(row->>'unit'))='kg' then 1000 else 1 end)>0.00000001))
          or (row->'gramsEvidence'->>'kind'<>'direct_mass' and (nullif(row->'gramsEvidence'->>'evidenceId','') is null
            or nullif(row->'gramsEvidence'->>'version','') is null))
          or (row->'gramsEvidence'->>'kind'<>'direct_mass' and (case when row->>'sourceKind'='food_product'
            then row->'gramsEvidence'->>'kind' is distinct from 'product_relation'
              or row->'gramsEvidence'->>'version' is distinct from row->>'sourceVersion'
            else row->'gramsEvidence'->>'kind' is distinct from 'ingredient_conversion' end)))
        or (select count(*)<>count(distinct row->>'rowKey') from jsonb_array_elements(v_prediction->'prediction'->'input'->'rows') row)
        or (v_prediction->'prediction'->>'totalGrams')::numeric is distinct from
          (select round(sum((row->>'grams')::numeric)*0.75,2) from jsonb_array_elements(v_prediction->'prediction'->'input'->'rows') row)
      then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    end if;
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
commit;
