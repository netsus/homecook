#!/usr/bin/env node
// Fixed-scope offline renderer; production execution and backup are separate operations.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_PLAN = new URL('../docs/engineering/data/household-spoon-weight-plan-20261011.json', import.meta.url);
const TARGETS = [{"ingredient_id":"03d5e5b4-b44c-455d-9f9d-564f776c68df","ingredient_name":"굴소스","weight_g":15,"base_g_per_15ml":20,"base_assignment_id":"a804fb66-4b78-4d61-9d0e-0eed9e91ac8b","base_evidence_id":"18828577-a05c-42af-89c7-f64e89433b2c","base_source_id":"2ed8f8e6-fc3f-4868-b678-7a1f1174aff0"},{"ingredient_id":"464be6fb-f154-4ef8-bb6d-6936d1378ef5","ingredient_name":"멸치액젓","weight_g":14,"base_g_per_15ml":17.9,"base_assignment_id":"d2ad20fc-aef1-4de9-9fa6-1aea48a1826c","base_evidence_id":"3d197019-5279-4c52-b784-172e559c5c4b","base_source_id":"a5f5ed60-873b-4499-85c8-94bc9e8f10a2"},{"ingredient_id":"4dfdc5ff-42d8-4c22-b1f7-ff9a0f43d568","ingredient_name":"양조간장","weight_g":14,"base_g_per_15ml":17.7,"base_assignment_id":"e409be2f-d5b6-4a43-b151-50f40d30240d","base_evidence_id":"cd053bd1-2e0e-452b-9adb-c750747e0731","base_source_id":"a5f5ed60-873b-4499-85c8-94bc9e8f10a2"},{"ingredient_id":"68c0c37d-89d0-44cd-94f9-6bf9dfb73aa8","ingredient_name":"올리고당","weight_g":12,"base_g_per_15ml":15,"base_assignment_id":"8c567d34-c538-43b2-9428-18f5aa1ec42e","base_evidence_id":"363b1d45-7241-446b-b4f9-b1a1f5b72d04","base_source_id":"a99b3b4f-c833-4b57-9ab9-5ba5efb5e04e"},{"ingredient_id":"9935fd54-6916-4743-9783-06fb457dacca","ingredient_name":"다시다","weight_g":8,"base_g_per_15ml":10,"base_assignment_id":"46aa6092-a6b6-400e-b42b-2193abd3cff6","base_evidence_id":"e9aa1f65-c285-4acd-a79d-cdbc65d9a625","base_source_id":"2ed8f8e6-fc3f-4868-b678-7a1f1174aff0"},{"ingredient_id":"a75bf43b-c473-44cc-ab3f-44bfcf6a0530","ingredient_name":"양조식초","weight_g":12,"base_g_per_15ml":15.3,"base_assignment_id":"6f891de1-88e7-4b10-9da4-2744840ddb3f","base_evidence_id":"2ef44713-3a08-4f8e-bda9-143f0fe2a7c9","base_source_id":"a5f5ed60-873b-4499-85c8-94bc9e8f10a2"},{"ingredient_id":"d8e4b087-3629-4f58-8ccd-2185a07d3da5","ingredient_name":"맛술","weight_g":10,"base_g_per_15ml":13.5,"base_assignment_id":"45d6ae27-1076-496b-8967-a1fbc3a9a5fb","base_evidence_id":"11a62a50-7c71-4d19-8ee6-c83080c28f68","base_source_id":"e759bf3f-9b62-4df6-afae-49102fc3e843"}];
const PRECONDITIONS = [{"table":"ingredients","id":"03d5e5b4-b44c-455d-9f9d-564f776c68df","md5":"570357194e8b4505f2e8fa2f819d7416"},{"table":"ingredient_conversion_assignments","id":"a804fb66-4b78-4d61-9d0e-0eed9e91ac8b","md5":"2b30f6df61b39c7fe079bb046bb17a5f"},{"table":"measurement_source_evidence","id":"18828577-a05c-42af-89c7-f64e89433b2c","md5":"dd44cb70a9440783f02a0fcde3b86cdc"},{"table":"nutrition_sources","id":"2ed8f8e6-fc3f-4868-b678-7a1f1174aff0","md5":"3eb4da04e04987341fe12954fe3a016b"},{"table":"ingredients","id":"464be6fb-f154-4ef8-bb6d-6936d1378ef5","md5":"80917c89a1583922a7790a0da2bd60ed"},{"table":"ingredient_conversion_assignments","id":"d2ad20fc-aef1-4de9-9fa6-1aea48a1826c","md5":"c45f534f9dfa5e77f6db3731d29036ac"},{"table":"measurement_source_evidence","id":"3d197019-5279-4c52-b784-172e559c5c4b","md5":"94b3a67d8f08de429c5b40c4f6ac028d"},{"table":"nutrition_sources","id":"a5f5ed60-873b-4499-85c8-94bc9e8f10a2","md5":"aa48f9f1fc5cc8b4dd504076d2b25a0f"},{"table":"ingredients","id":"4dfdc5ff-42d8-4c22-b1f7-ff9a0f43d568","md5":"68b5e9aafa9029f8338319b4ec0b0dbf"},{"table":"ingredient_conversion_assignments","id":"e409be2f-d5b6-4a43-b151-50f40d30240d","md5":"744a1c928ab22523c83e7514ed558d98"},{"table":"measurement_source_evidence","id":"cd053bd1-2e0e-452b-9adb-c750747e0731","md5":"52f5b4e6f33c54e88b3948edf80e7d32"},{"table":"ingredients","id":"68c0c37d-89d0-44cd-94f9-6bf9dfb73aa8","md5":"3e4884f49902c2f106f789e6c8449aaf"},{"table":"ingredient_conversion_assignments","id":"8c567d34-c538-43b2-9428-18f5aa1ec42e","md5":"81e5295d1004dd09883846bd93e0d5db"},{"table":"measurement_source_evidence","id":"363b1d45-7241-446b-b4f9-b1a1f5b72d04","md5":"ee179d7f82493090fa75fa9617c35ff0"},{"table":"nutrition_sources","id":"a99b3b4f-c833-4b57-9ab9-5ba5efb5e04e","md5":"ab92f8c5c0dea3cfafd16835e41a3f21"},{"table":"ingredients","id":"9935fd54-6916-4743-9783-06fb457dacca","md5":"14a686544935867fc68d4624ff3bd2bb"},{"table":"ingredient_conversion_assignments","id":"46aa6092-a6b6-400e-b42b-2193abd3cff6","md5":"2f35814c42ccf164225713bc36121ea0"},{"table":"measurement_source_evidence","id":"e9aa1f65-c285-4acd-a79d-cdbc65d9a625","md5":"f43f1761adf5d16814fa45d292b923a9"},{"table":"ingredients","id":"a75bf43b-c473-44cc-ab3f-44bfcf6a0530","md5":"1cd8376d831037efdb21569f87065a15"},{"table":"ingredient_conversion_assignments","id":"6f891de1-88e7-4b10-9da4-2744840ddb3f","md5":"df158173721e2d9fe9c26b749b435689"},{"table":"measurement_source_evidence","id":"2ef44713-3a08-4f8e-bda9-143f0fe2a7c9","md5":"cc415ee905c7e6e7186c625c98aa79c4"},{"table":"ingredients","id":"d8e4b087-3629-4f58-8ccd-2185a07d3da5","md5":"55a3ede5968456abe8da7849bdd5d47e"},{"table":"ingredient_conversion_assignments","id":"45d6ae27-1076-496b-8967-a1fbc3a9a5fb","md5":"a07facd137297baac8c21c30b781ee8b"},{"table":"measurement_source_evidence","id":"11a62a50-7c71-4d19-8ee6-c83080c28f68","md5":"03ce21f3c065d972d0cfbfba6b1904bb"},{"table":"nutrition_sources","id":"e759bf3f-9b62-4df6-afae-49102fc3e843","md5":"a5ba4676861cab9ecd7e211cadac868e"}];
const LIMITATION = "사용자 승인 AI 추정 밥숟가락 중량. 평평한 밥숟가락 11.5ml 가정과 기존 재료별 15ml 환산값으로 추정한 뒤 1g 단위로 반올림한 승인값이다. 원영상은 밥숟가락 도구 확인 근거일 뿐 실제 무게·용량 측정이 아니다. 제품·농도·도구 크기에 따라 달라지며 수북하게 담은 숟가락에는 적용하지 않는다. 실제 측정 g 입력을 우선한다.";
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sourceUrl='https://github.com/netsus/homecook/blob/master/docs/engineering/data/household-spoon-weight-plan-20261011.json';
const deterministicId=key=>{const h=createHash('sha256').update('homecook:household-spoon-20261011:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const observation=t=>({amount:1,unit:'밥숟가락',weight_g:t.weight_g,method:'user_approved_ai_estimate',assumed_volume_ml:11.5,actually_measured:false,video_confirms_tool_only:true,rounding:'nearest_1g_user_approved',fill:'level_not_heaped',base_g_per_15ml:t.base_g_per_15ml,base_assignment_id:t.base_assignment_id,base_evidence_id:t.base_evidence_id,base_source_id:t.base_source_id});
function requireCondition(condition,reason) { if(!condition) throw Error('HOUSEHOLD_SPOON_'+reason); }
export function validateHouseholdSpoonWeights(plan) {
  const {operation_checksum,...body}=plan;
  requireCondition(hash(body)===operation_checksum,'CHECKSUM');
  requireCondition(plan.schema==='homecook.household-spoon-weights.v1' && plan.reviewed_on==='2026-10-11' && plan.decisions.length===7 && plan.inserts.length===15 && same(plan.updates,[]),'SCOPE');
  requireCondition(same(plan.preconditions,PRECONDITIONS),'PREIMAGE');
  const manifest={assumption:'level household spoon assumed 11.5ml; not physically measured',mapping:TARGETS.map(t=>({ingredient_id:t.ingredient_id,...observation(t)}))};
  requireCondition(same(plan.manifest,manifest),'MANIFEST');
  const sourceId=deterministicId('source'),stamp=plan.inserts[0].row.created_at;
  requireCondition(typeof stamp==='string' && /^2026-10-11T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp) && Number.isFinite(Date.parse(stamp)),'TIMESTAMP');
  const common={review_status:'approved',is_active:true,reviewed_by:'__PRIVATE_REVIEWER__',reviewed_at:stamp,created_at:stamp,superseded_by_id:null};
  const expectedSource={...common,id:sourceId,source_kind:'measurement_reference',fetched_at:stamp,freshness_checked_at:stamp,freshness_status:'current',priority_rank:null,license_name:'Service-authored user-approved estimate; not an official measurement',license_url:null,decision_reason:LIMITATION,provider_code:'HOMECOOK_USER_STANDARD',dataset_name:'사용자 승인 AI 추정 밥숟가락 중량20261011',source_version:'user-approved-household-spoon-estimate-20261011',source_url:sourceUrl,manifest_sha256:hash(manifest),data_basis_date:'2026-10-11'};
  requireCondition(same(plan.inserts[0],{table:'nutrition_sources',row:expectedSource}),'SOURCE');
  TARGETS.forEach((t,i)=>{
    const d={...t,unit:'밥숟가락',preparation_state:'as_published',new_source_id:sourceId,new_evidence_id:deterministicId('evidence:'+t.ingredient_id),new_link_id:deterministicId('piece:'+t.ingredient_id),raw_source_observation:observation(t),limitation:LIMITATION};
    requireCondition(same(plan.decisions[i],d),'DECISION');
    const e={...common,id:d.new_evidence_id,version:1,source_id:sourceId,source_item_id:null,evidence_kind:'piece_weight',source_subject:t.ingredient_name,preparation_state:'as_published',size_code:'household_spoon',source_observed_unit:'밥숟가락',source_observed_amount:1,observed_volume_ml:null,normalized_g_per_15ml:null,observed_weight_g:t.weight_g,source_url:sourceUrl,source_accessed_at:'2026-10-11',evidence_fingerprint:hash(observation(t)),decision_reason:LIMITATION};
    requireCondition(same(plan.inserts[i+1],{table:'measurement_source_evidence',row:e}),'EVIDENCE');
    const link={...common,id:d.new_link_id,version:1,ingredient_id:t.ingredient_id,evidence_id:d.new_evidence_id,size_code:'household_spoon',preparation_state:'as_published',weight_g:t.weight_g,decision_reason:LIMITATION};
    requireCondition(same(plan.inserts[i+8],{table:'piece_unit_weights',row:link}),'LINK');
  });
  return plan;
}
export function renderHouseholdSpoonWeights(input,{reviewedBy}={}) {
  validateHouseholdSpoonWeights(input);
  requireCondition(uuid(reviewedBy),'REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$household_'+p.operation_checksum+'$';
  const check=(condition,error)=>`IF ${condition} THEN RAISE EXCEPTION 'HOUSEHOLD_SPOON_${error}'; END IF;`;
  const actual=(table,id)=>`(SELECT to_jsonb(t) FROM public.${table} t WHERE id=${literal(id)}::uuid)`;
  const castRow=(table,row)=>`(SELECT to_jsonb(t) FROM jsonb_populate_record(NULL::public.${table},${json(row)}) t)`;
  const pre=p.preconditions.map(op=>check(`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE id=${literal(op.id)}::uuid) IS DISTINCT FROM ${literal(op.md5)}`,'PREIMAGE_DRIFT')).join('\n');
  const activeLinks=after=>p.decisions.map(d=>check(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.piece_unit_weights WHERE ingredient_id=${literal(d.ingredient_id)}::uuid AND size_code='household_spoon' AND is_active AND review_status='approved') IS DISTINCT FROM ${json(after?[d.new_link_id]:[])}`,'ACTIVE_LINK_DRIFT')).join('\n');
  const activeVolumes=p.decisions.map(d=>check(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.ingredient_conversion_assignments WHERE ingredient_id=${literal(d.ingredient_id)}::uuid AND preparation_state='as_published' AND is_active AND review_status='approved') IS DISTINCT FROM ${json([d.base_assignment_id])}`,'VOLUME_LINK_DRIFT')).join('\n');
  const post=p.inserts.map(op=>check(`${actual(op.table,op.row.id)} IS DISTINCT FROM ${castRow(op.table,op.row)}`,'POSTIMAGE')).join('\n');
  const protectedTables=['nutrition_sources','measurement_source_evidence','piece_unit_weights','ingredient_conversion_assignments','measurement_conversion_profiles','ingredients','ingredient_synonyms','ingredient_catalog_entries','nutrition_source_items','nutrition_profiles','nutrition_values','ingredient_nutrition_profiles','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','pantry_items','youtube_extraction_sessions','leftover_dishes'];
  const digest=table=>{
    const exclude=p.inserts.filter(op=>op.table===table).map(op=>literal(op.row.id)+'::uuid').join(',');
    return `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.${table} t ${exclude?'WHERE id NOT IN ('+exclude+')':''}) intact)`;
  };
  const preserved=`jsonb_build_object(${protectedTables.map(t=>literal(t)+','+digest(t)).join(',')})`;
  const privateDigest=`jsonb_build_object('ai',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM private.ingredient_ai_nutrition_settings t),'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM private.ingredient_ai_nutrition_jobs t),'ledger',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY filename)::text,'')) FROM homecook_deploy.migrations t))`;
  const insert=op=>{const columns=Object.keys(op.row).join(',');return `INSERT INTO public.${op.table}(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::public.${op.table},${json(op.row)});`;};
  const links=p.inserts.filter(op=>op.table==='piece_unit_weights');
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='240s';
DO ${delimiter}
DECLARE v_before jsonb; v_private jsonb; v_cutover uuid;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:household-spoon-weights-20261011',0));
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
LOCK TABLE ${protectedTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
${check("private.ingredient_piece_unit_family('밥숟가락') IS DISTINCT FROM 'household_spoon'",'UNIT_RUNTIME_REQUIRED')}
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='household_spoon_weights_applied' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${pre}
${activeLinks(true)}
${activeVolumes}
RAISE NOTICE 'Household spoon weights already applied; verified postimage, no writes'; RETURN;
END IF;
${pre}
${activeLinks(false)}
${activeVolumes}
${p.inserts.map(op=>check(`EXISTS(SELECT 1 FROM public.${op.table} WHERE id=${literal(op.row.id)}::uuid)`,'ID_CONFLICT')).join('\n')}
SELECT ${preserved} INTO v_before;
SELECT ${privateDigest} INTO v_private;
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
${check('v_cutover IS NULL','WRITER_UNAVAILABLE')}
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${p.inserts.filter(op=>op.table==='nutrition_sources').map(insert).join('\n')}
${p.inserts.filter(op=>op.table==='measurement_source_evidence').map(insert).join('\n')}
${links.map(op=>insert({...op,row:{...op.row,review_status:'pending',is_active:false}})).join('\n')}
${links.map(op=>`UPDATE public.piece_unit_weights SET review_status='approved',is_active=true WHERE id=${literal(op.row.id)}::uuid;`).join('\n')}
${post}
${pre}
${activeLinks(true)}
${activeVolumes}
${check(`v_before IS DISTINCT FROM ${preserved}`,'PRESERVATION_FAILED')}
${check(`v_private IS DISTINCT FROM ${privateDigest}`,'PRIVATE_DATA_CHANGED')}
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('household_spoon_weights_applied','info','household-spoon-weights-20261011',${literal(reviewedBy)}::uuid,'Add seven user-approved estimated weights for explicitly identified level household spoons',${json({operation_checksum:p.operation_checksum,decisions:p.decisions})});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
END;
${delimiter};
COMMIT;\n`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),at=args.indexOf('--reviewer-file');
  if(at<0) throw Error('Use --reviewer-file with a private UUID text file');
  const file=args.includes('--plan')?args[args.indexOf('--plan')+1]:DEFAULT_PLAN;
  process.stdout.write(renderHouseholdSpoonWeights(JSON.parse(readFileSync(file,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));
}
