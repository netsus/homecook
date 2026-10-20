-- Local candidate only. No tables, grants, owner, authentication or operational data changes.
-- Deploy with the matching web change after separate release approval.
begin;
create or replace function private.record_cooked_weight_evidence(p_batch_id uuid,p_owner_uuid uuid,p_generation bigint,p_revision bigint,p_path text,p_now timestamptz)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_context jsonb; v_prediction jsonb; v_batch public.leftover_dishes%rowtype;
  v_receipt uuid; v_source text; v_prediction_id uuid; v_kind text; v_base numeric;
  v_proxy jsonb; v_row jsonb; v_proof jsonb; v_raw jsonb; v_original jsonb; v_original_rows jsonb;
  v_index integer; v_kind_proxy text; v_label text; v_amount numeric; v_scale numeric;
  v_expected_amount numeric; v_expected_unit text;
  v_g numeric; v_low numeric; v_high numeric; v_known numeric:=0; v_assumed numeric:=0;
  v_sum numeric:=0; v_sum_low numeric:=0; v_sum_high numeric:=0;
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
      or coalesce(v_prediction->'prediction'->>'modelVersion','') not in ('bounded-weight-v2','ingredient-mass-75-v1','recipe-mass-proxy-v1')
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

    -- A separate, explicitly disclosed raw-input proxy. Do not weaken the 75%
    -- validator above or promote inferred doses into confirmed conversion rows.
    if v_prediction->'prediction'->>'modelVersion'='recipe-mass-proxy-v1' then
      v_proxy:=v_prediction->'prediction'->'massProxy';
      select ingredients_json into strict v_original_rows from public.recipe_content_snapshots where id=v_batch.recipe_content_snapshot_id;
      if jsonb_typeof(v_proxy) is distinct from 'object'
        or v_proxy->>'policyVersion' is distinct from 'household-minor-dose-20261020-v1'
        or v_proxy->>'policySha256' is distinct from '746ee7461077249fee0e463d7910bd1a678f0bf2d5ded9d4b5c9831959bcccb1'
        or v_proxy->>'labelSource' is distinct from 'authorized_cook_mode'
        or v_proxy->>'cookingLoss' is distinct from 'unmodelled'
        or v_prediction->'prediction'->'appliedRules' <> '[]'::jsonb
        or jsonb_typeof(v_proxy->'rows') is distinct from 'array'
        or jsonb_typeof(v_prediction->'prediction'->'input'->'rows') is distinct from 'array'
        or jsonb_array_length(v_proxy->'rows') not between 1 and 200
        or jsonb_array_length(v_proxy->'rows')<>jsonb_array_length(v_prediction->'prediction'->'input'->'rows')
        or jsonb_array_length(v_proxy->'rows')<>jsonb_array_length(v_prediction->'rawRows')
        or jsonb_array_length(v_proxy->'rows')<>jsonb_array_length(v_original_rows)
        or not exists(select 1 from public.recipe_content_snapshots s where s.id=v_batch.recipe_content_snapshot_id and jsonb_typeof(s.steps_json)='array' and jsonb_array_length(s.steps_json)>0)
        or exists(select 1 from jsonb_object_keys(v_proxy) key where key not in ('policyVersion','policySha256','labelSource','cookingLoss','inputMassGrams','inputLowGrams','inputHighGrams','rows'))
        or (select count(*)<>count(distinct row->>'rowKey') from jsonb_array_elements(v_proxy->'rows') row)
      then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
      for v_index in 0..jsonb_array_length(v_proxy->'rows')-1 loop
        v_proof:=v_proxy->'rows'->v_index;
        v_row:=v_prediction->'prediction'->'input'->'rows'->v_index;
        v_raw:=v_prediction->'rawRows'->v_index;
        v_original:=v_original_rows->v_index;
        v_kind_proxy:=v_proof->>'kind';
        v_label:=lower(regexp_replace(v_proof->>'label','\s','','g'));
        if v_proof->>'rowKey' is distinct from v_row->>'rowKey'
          or v_proof->>'rowKey' is distinct from v_raw->>'rowKey'
          or v_proof->>'rowKey' is distinct from coalesce(v_original->>'row_key',coalesce(v_original->>'food_product_id',v_original->>'ingredient_id')||':'||v_index::text)
          or v_proof->>'sourceId' is distinct from v_row->>'sourceId'
          or v_row->>'sourceId' is distinct from coalesce(v_original->>'food_product_id',v_original->>'ingredient_id')
          or v_row->>'sourceVersion' is distinct from v_original->>'food_product_nutrition_version_id'
          or v_row->>'sourceKind' is distinct from (case when v_original->>'food_product_id' is null then 'ingredient' else 'food_product' end)
          or coalesce(v_row->>'quantityOrigin','') not in ('planned','reported_actual')
          or coalesce(v_row->>'quantityKind','') not in ('quantitative','to_taste')
          or length(coalesce(v_proof->>'label','')) not between 1 and 200
          or exists(select 1 from jsonb_object_keys(v_proof) key where key not in ('rowKey','sourceId','label','kind','grams','lowGrams','highGrams'))
          or jsonb_typeof(v_proof->'grams') is distinct from 'number'
          or jsonb_typeof(v_proof->'lowGrams') is distinct from 'number'
          or jsonb_typeof(v_proof->'highGrams') is distinct from 'number'
          or (v_proof->>'lowGrams')::numeric<=0
          or (v_proof->>'lowGrams')::numeric>(v_proof->>'grams')::numeric
          or (v_proof->>'highGrams')::numeric<(v_proof->>'grams')::numeric
          or (v_proof->>'grams')::numeric>1000000
        then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        v_amount:=(v_row->>'amount')::numeric;
        v_scale:=case when (v_raw->>'scalable')::boolean then v_batch.cooking_servings else v_base end/2;
        v_g:=null; v_low:=null; v_high:=null;
        if v_kind_proxy='confirmed_mass' then
          if v_row->>'quantityKind' is distinct from 'quantitative'
            or jsonb_typeof(v_row->'grams') is distinct from 'number' or (v_row->>'grams')::numeric<=0
            or jsonb_typeof(v_row->'amount') is distinct from 'number' or v_amount<=0
            or v_row->'gramsEvidence'->>'status' is distinct from 'confirmed'
            or coalesce(v_row->'gramsEvidence'->>'kind','') not in ('direct_mass','ingredient_conversion','product_relation')
            or (v_row->'gramsEvidence'->>'kind'='direct_mass' and (lower(trim(v_row->>'unit')) not in ('g','kg')
              or abs((v_row->>'grams')::numeric-v_amount*case when lower(trim(v_row->>'unit'))='kg' then 1000 else 1 end)>0.00000001))
            or (v_row->'gramsEvidence'->>'kind'<>'direct_mass' and (nullif(v_row->'gramsEvidence'->>'evidenceId','') is null or nullif(v_row->'gramsEvidence'->>'version','') is null))
            or (v_row->'gramsEvidence'->>'kind'<>'direct_mass' and (case when v_row->>'sourceKind'='food_product'
              then v_row->'gramsEvidence'->>'kind' is distinct from 'product_relation' or v_row->'gramsEvidence'->>'version' is distinct from v_row->>'sourceVersion'
              else v_row->'gramsEvidence'->>'kind' is distinct from 'ingredient_conversion' end))
          then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
          v_g:=round((v_row->>'grams')::numeric,2);v_low:=v_g;v_high:=v_g;v_known:=v_known+v_g;
        else
          v_expected_amount:=(v_raw->>'amount')::numeric*(case when (v_raw->>'scalable')::boolean then v_batch.cooking_servings/v_base else 1 end);
          v_expected_unit:=v_raw->>'unit';
          -- Frozen v4 can retain 1500mL while displaying 1.5L. Bind to the
          -- immutable proof, rather than demanding identical display units.
          if (v_row->>'unit' is distinct from v_expected_unit or v_amount is distinct from v_expected_amount)
            and v_original->'quantity_input'->>'quality'='unavailable'
            and v_original->'quantity_input'->'normalized'='null'::jsonb
            and v_original->'quantity_input'->'display_quantity'->>'unit'=v_raw->>'unit'
            and (v_original->'quantity_input'->'display_quantity'->>'amount')::numeric=(v_raw->>'amount')::numeric
            and v_original->'quantity_input'->>'numerator' ~ '^[0-9]+$'
            and v_original->'quantity_input'->>'denominator' ~ '^[0-9]+$'
            and (v_original->'quantity_input'->>'denominator')::numeric>0 then
            v_expected_amount:=(v_original->'quantity_input'->>'numerator')::numeric/(v_original->'quantity_input'->>'denominator')::numeric
              *(case when (v_raw->>'scalable')::boolean then v_batch.cooking_servings/v_base else 1 end);
            v_expected_unit:=v_original->'quantity_input'->>'raw_unit';
          end if;
          if v_row->>'sourceKind' is distinct from 'ingredient'
            or v_row->'grams' is distinct from 'null'::jsonb or v_row->'gramsEvidence' is distinct from 'null'::jsonb
            or (v_amount is null) is distinct from (v_expected_amount is null)
            or abs(v_amount-v_expected_amount)>greatest(1,abs(v_expected_amount))*0.000000000001
            or v_row->>'unit' is distinct from v_expected_unit
          then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
          if v_kind_proxy='water_ml' and v_label in ('물','생수','정수','water') and v_amount>0 and lower(v_row->>'unit') in ('ml','l') then
            v_g:=round(v_amount*case when lower(v_row->>'unit')='l' then 1000 else 1 end,2);v_low:=v_g;v_high:=v_g;v_known:=v_known+v_g;
          elsif v_kind_proxy='salt_pinch' and v_label in ('소금','salt') and v_amount>0 and v_amount<=10 and v_row->>'unit'='꼬집' then
            v_g:=round(v_amount,2);v_low:=round(v_amount*0.5,2);v_high:=round(v_amount*1.5,2);
          elsif v_kind_proxy='pepper_small' and v_label in ('후추','흑후추','후춧가루','pepper') and v_amount is null and v_row->>'quantityKind'='to_taste' and coalesce(v_row->>'unit','약간')='약간' then
            v_g:=round(0.2*v_scale,2);v_low:=round(0.05*v_scale,2);v_high:=round(0.5*v_scale,2);
          elsif v_kind_proxy='oil_small' and v_label in ('식용유','올리브유','카놀라유','vegetableoil') and v_amount is null and coalesce(v_row->>'unit','약간')='약간'
            and exists(select 1 from public.recipe_content_snapshots s,jsonb_array_elements(s.steps_json) step where s.id=v_batch.recipe_content_snapshot_id
              and step->>'instruction' ~ '(식용유|올리브유|카놀라유|기름)(을|를)?\s*(약간|조금|살짝)') then
            v_g:=round(7*v_scale,2);v_low:=round(3.5*v_scale,2);v_high:=round(14*v_scale,2);
          elsif v_amount>0 and v_amount<=10 and lower(v_row->>'unit') in ('스푼','큰술','tbsp','크게스푼') then
            if v_kind_proxy='mirin_spoon' and v_label in ('맛술','미림','mirin') and v_row->>'unit'<>'크게스푼'
              or v_kind_proxy='soy_spoon' and v_label in ('간장','국간장','진간장','soysauce') and v_row->>'unit'<>'크게스푼' then
              v_g:=round(18*v_amount,2);v_low:=round(6*v_amount,2);v_high:=round(22.5*v_amount,2);
            elsif v_label in ('케첩','토마토케첩','ketchup') then
              if v_kind_proxy='ketchup_heaped_spoon' and v_row->>'unit'='크게스푼' then v_g:=round(22.5*v_amount,2);v_low:=round(15*v_amount,2);v_high:=round(30*v_amount,2);
              elsif v_kind_proxy='ketchup_spoon' and v_row->>'unit'<>'크게스푼' then v_g:=round(15*v_amount,2);v_low:=round(5*v_amount,2);v_high:=round(22.5*v_amount,2);end if;
            end if;
          end if;
          if v_kind_proxy<>'water_ml' then v_assumed:=v_assumed+v_high;end if;
        end if;
        if v_g is null or v_g is distinct from (v_proof->>'grams')::numeric or v_low is distinct from (v_proof->>'lowGrams')::numeric or v_high is distinct from (v_proof->>'highGrams')::numeric
        then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        v_sum:=v_sum+v_g;v_sum_low:=v_sum_low+v_low;v_sum_high:=v_sum_high+v_high;
      end loop;
      if v_known<=0 or v_assumed>v_known*0.1
        or v_prediction->'prediction'->'assumptions' is distinct from (case when v_assumed>0 then '["raw_ingredient_mass_proxy","cooking_loss_unmodelled","minor_seasoning_household_assumptions"]'::jsonb else '["raw_ingredient_mass_proxy","cooking_loss_unmodelled"]'::jsonb end)
        or v_sum is distinct from (v_proxy->>'inputMassGrams')::numeric
        or v_sum_low is distinct from (v_proxy->>'inputLowGrams')::numeric
        or v_sum_high is distinct from (v_proxy->>'inputHighGrams')::numeric
        or v_sum is distinct from (v_prediction->'prediction'->>'totalGrams')::numeric
        or exists(select 1 from public.recipe_content_snapshots s,jsonb_array_elements(s.steps_json) step where s.id=v_batch.recipe_content_snapshot_id
          and step->>'instruction' ~* '물기|배수|건져|버리|버려|따라\s*(내|낸)|짜\s*내|(물|국물|기름)(을|를)?\s*(빼|뺀)|체에\s*(거르|걸러)|튀(기|겨|긴)|drain|discard|strain|deep.fry|(물|기름)(을|를)?\s*(더|추가)|add\s+more\s+(water|oil)')
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
    or (p_weight_input_source is not null and (p_weight_input_source not in ('reported_measured','manual_estimate') or p_weight_action<>'set_finished_weight'))
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
  if p_weight_input_source is not null and not exists(select 1 from private.cooked_batch_weight_evidence
    where operation_receipt_id=v_receipt and owner_uuid=p_owner_uuid and batch_id=p_session_id and event_kind=case when p_weight_input_source='reported_measured' then 'reported_measurement' else 'manual_entry' end)
  then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_session_id,p_now);
  return v_result;
end;
$function$;

commit;
