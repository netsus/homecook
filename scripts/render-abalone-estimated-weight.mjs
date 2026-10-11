#!/usr/bin/env node
// Fixed-scope offline renderer. Production execution and backup are separate operations.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_PLAN = new URL('../docs/engineering/data/abalone-estimated-weight-plan-20261011.json', import.meta.url);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const ingredientId='ddf68557-ec77-5047-93c6-d0cb6c292c6d';
const oldId='dece2077-458a-44ae-bbd4-878ae72f596f';
const oldEvidenceId='a36d83d4-75a5-4461-b6b3-c1f8490b24eb';
const oldSourceId='e0be219a-2645-4ee1-914f-a6e7f757537c';
const sourceUrl='https://github.com/netsus/homecook/blob/master/docs/engineering/data/abalone-estimated-weight-plan-20261011.json';
const insertTables = ['nutrition_sources','measurement_source_evidence','piece_unit_weights'];
const metadataKeys = () => ['review_status','is_active','superseded_by_id','reviewed_by','reviewed_at','decision_reason'];
const rowFor = (plan,table,id) => plan.inserts.find(op=>op.table===table && op.row.id===id)?.row;
function requireCondition(condition,reason) { if(!condition) throw Error('ABALONE_ESTIMATE_'+reason); }
export function validateAbaloneEstimatedWeight(plan) {
  const {operation_checksum,...body}=plan;
  requireCondition(hash(body)===operation_checksum,'CHECKSUM');
  requireCondition(plan.schema==='homecook.abalone-estimated-weight.v1' && plan.decisions.length===1 && plan.inserts.length===3 && plan.updates.length===1 && plan.preconditions.length===4,'SCOPE');
  requireCondition(same(plan.inserts.map(op=>op.table),insertTables) && new Set(plan.inserts.map(op=>op.row.id)).size===3,'INSERT');
  for(const op of plan.inserts) requireCondition(uuid(op.row.id) && Object.keys(op.row).every(k=>/^[a-z_][a-z_0-9]*$/.test(k)) && op.row.review_status==='approved' && op.row.is_active===true && op.row.reviewed_by==='__PRIVATE_REVIEWER__' && op.row.superseded_by_id===null,'INSERT');
  const d=plan.decisions[0],source=plan.inserts[0].row,e=plan.inserts[1].row,link=plan.inserts[2].row,update=plan.updates[0];
  requireCondition(d.ingredient_id===ingredientId && d.ingredient_name==='전복' && d.table==='piece_unit_weights' && d.old_link_id===oldId && d.old_evidence_id===oldEvidenceId && d.old_source_id===oldSourceId,'SCOPE');
  requireCondition(d.previous_weight_g===100 && d.applied_weight_g===50 && d.unit==='개' && d.preparation_state==='as_published','VALUES');
  const raw={amount:1,unit:'개',weight_g:50,method:'user_approved_ai_estimate',actually_measured:false,official_reference:false,excluded_parts:['껍데기','입'],organ_handling:'recipe_specific',size_meaning:'service_default_not_physical_standard'};
  requireCondition(same(d.raw_source_observation,raw),'RAW_OBSERVATION');
  requireCondition(source.id===d.new_source_id && source.id!==oldSourceId && source.provider_code==='HOMECOOK_USER_STANDARD' && source.dataset_name==='사용자 승인 AI 추정 중량 20261011 · 전복' && source.source_kind==='measurement_reference' && source.source_url===sourceUrl && source.manifest_sha256===hash(raw) && source.freshness_status==='current' && source.priority_rank===null && source.data_basis_date==='2026-10-11','SOURCE');
  requireCondition(['사용자 승인 AI 추정 중량','껍데기·입을 제외','내장 포함 여부는 레시피별','공식 계량자료나 실제 측정값이 아니며','medium은 서비스 기본 크기 코드','실제 측정 g 입력을 우선'].every(term=>d.limitation.includes(term)) && source.decision_reason===d.limitation,'PROVENANCE');
  requireCondition(e.id===d.new_evidence_id && e.id!==oldEvidenceId && e.source_id===source.id && e.source_subject==='전복' && e.source_item_id===null && e.preparation_state==='as_published' && e.evidence_kind==='piece_weight' && e.source_observed_amount===1 && e.source_observed_unit==='개' && e.observed_weight_g===50 && e.observed_volume_ml===null && e.normalized_g_per_15ml===null && e.size_code==='medium' && e.source_url===source.source_url && e.evidence_fingerprint===hash(raw) && e.decision_reason===d.limitation,'EVIDENCE');
  requireCondition(link.id===d.new_link_id && link.id!==oldId && link.ingredient_id===ingredientId && link.evidence_id===e.id && link.preparation_state==='as_published' && link.version===2 && link.weight_g===50 && link.size_code==='medium' && link.decision_reason===d.limitation,'LINK');
  requireCondition(d.old_link_payload.id===oldId && d.old_link_payload.ingredient_id===ingredientId && d.old_link_payload.evidence_id===oldEvidenceId && d.old_link_payload.weight_g===100 && d.old_link_payload.version===1 && d.old_link_payload.size_code==='medium' && d.old_link_payload.preparation_state==='as_published','OLD_PAYLOAD');
  requireCondition(update.table==='piece_unit_weights' && update.id===oldId && same(Object.keys(update.after).sort(),metadataKeys().sort()) && update.after.review_status==='superseded' && update.after.is_active===false && update.after.superseded_by_id===link.id && update.after.reviewed_by==='__PRIVATE_REVIEWER__','UPDATE_SCOPE');
  const expected=[['ingredients',ingredientId],['piece_unit_weights',oldId],['measurement_source_evidence',oldEvidenceId],['nutrition_sources',oldSourceId]];
  requireCondition(same(plan.preconditions.map(op=>[op.table,op.id]),expected) && plan.preconditions.every(op=>/^[a-f0-9]{32}$/.test(op.md5) && op.md5!=='0'.repeat(32)),'PREIMAGE');
  return plan;
}
export function renderAbaloneEstimatedWeight(input,{reviewedBy}={}) {
  validateAbaloneEstimatedWeight(input);
  requireCondition(uuid(reviewedBy),'REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$abalone_'+p.operation_checksum+'$';
  requireCondition(!JSON.stringify(p).includes(delimiter),'DELIMITER');
  const check=(condition,error)=>`IF ${condition} THEN RAISE EXCEPTION 'ABALONE_ESTIMATE_${error}'; END IF;`;
  const actual=(table,id)=>`(SELECT to_jsonb(t) FROM public.${table} t WHERE id=${literal(id)}::uuid)`;
  const castRow=(table,row)=>`(SELECT to_jsonb(t) FROM jsonb_populate_record(NULL::public.${table},${json(row)}) t)`;
  const pre=ops=>ops.map(op=>check(`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE id=${literal(op.id)}::uuid) IS DISTINCT FROM ${literal(op.md5)}`,'PREIMAGE_DRIFT')).join('\n');
  const stable=p.preconditions.filter(op=>!p.updates.some(u=>u.table===op.table&&u.id===op.id));
  const activeLinks=after=>p.decisions.map(d=>check(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.${d.table} WHERE ingredient_id=${literal(d.ingredient_id)}::uuid AND preparation_state='as_published' ${d.table==='piece_unit_weights'?"AND size_code='medium'":''} AND is_active AND review_status='approved') IS DISTINCT FROM ${json([after?d.new_link_id:d.old_link_id])}`,'ACTIVE_LINK_DRIFT')).join('\n');
  const post=p.inserts.map(op=>check(`${actual(op.table,op.row.id)} IS DISTINCT FROM ${castRow(op.table,op.row)}`,'POSTIMAGE')).concat(p.updates.map(op=>check(`NOT coalesce(${actual(op.table,op.id)} @> (${castRow(op.table,op.after)} - ARRAY[${Object.keys(rowFor(p,op.table,op.after.superseded_by_id)).filter(k=>!Object.hasOwn(op.after,k)).map(literal).join(',')}]::text[]),false)`,'OLD_LINK_POSTIMAGE'))).join('\n');
  const oldPayloads=p.decisions.map(d=>{const remove=`ARRAY[${metadataKeys(d.table).map(literal).join(',')}]::text[]`;return check(`(${actual(d.table,d.old_link_id)}-${remove}) IS DISTINCT FROM (${castRow(d.table,d.old_link_payload)}-${remove})`,'OLD_PAYLOAD_CHANGED');}).join('\n');
  const protectedTables=['nutrition_sources','measurement_source_evidence','piece_unit_weights','ingredient_conversion_assignments','measurement_conversion_profiles','ingredients','ingredient_synonyms','ingredient_catalog_entries','nutrition_source_items','nutrition_profiles','nutrition_values','ingredient_nutrition_profiles','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','pantry_items','youtube_extraction_sessions','leftover_dishes'];
  const digest=table=>{
    const exclude=p.inserts.filter(op=>op.table===table).map(op=>literal(op.row.id)+'::uuid').join(',');
    const cases=p.updates.filter(op=>op.table===table).map(op=>`WHEN id=${literal(op.id)}::uuid THEN to_jsonb(t)-ARRAY[${metadataKeys(table).map(literal).join(',')}]::text[]`).join(' ');
    return `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5((${cases?'CASE '+cases+' ELSE to_jsonb(t) END':'to_jsonb(t)'})::text) h FROM public.${table} t ${exclude?'WHERE id NOT IN ('+exclude+')':''}) intact)`;
  };
  const preserved=`jsonb_build_object(${protectedTables.map(t=>literal(t)+','+digest(t)).join(',')})`;
  const privateDigest=`jsonb_build_object('ai',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM private.ingredient_ai_nutrition_settings t),'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM private.ingredient_ai_nutrition_jobs t),'ledger',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY filename)::text,'')) FROM homecook_deploy.migrations t))`;
  const insert=op=>{const columns=Object.keys(op.row).join(',');return `INSERT INTO public.${op.table}(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::public.${op.table},${json(op.row)});`;};
  const update=op=>`UPDATE public.${op.table} SET ${Object.keys(op.after).map(k=>`${k}=(SELECT ${k} FROM jsonb_populate_record(NULL::public.${op.table},${json(op.after)}))`).join(',')} WHERE id=${literal(op.id)}::uuid;`;
  const links=p.inserts.filter(op=>['piece_unit_weights','ingredient_conversion_assignments'].includes(op.table));
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='240s';
DO ${delimiter}
DECLARE v_before jsonb; v_private jsonb; v_cutover uuid;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:abalone-estimated-weight-20261011',0));
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
LOCK TABLE ${protectedTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='abalone_estimated_weight_applied' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${oldPayloads}
${pre(stable)}
${activeLinks(true)}
RAISE NOTICE 'Abalone estimate already applied; verified postimage, no writes'; RETURN;
END IF;
${pre(p.preconditions)}
${activeLinks(false)}
${p.inserts.map(op=>check(`EXISTS(SELECT 1 FROM public.${op.table} WHERE id=${literal(op.row.id)}::uuid)`,'ID_CONFLICT')).join('\n')}
SELECT ${preserved} INTO v_before;
SELECT ${privateDigest} INTO v_private;
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
${check('v_cutover IS NULL','WRITER_UNAVAILABLE')}
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${p.inserts.filter(op=>op.table==='nutrition_sources').map(insert).join('\n')}
${p.inserts.filter(op=>op.table==='measurement_source_evidence').map(insert).join('\n')}
${links.map(op=>insert({...op,row:{...op.row,review_status:'pending',is_active:false}})).join('\n')}
${p.updates.map(update).join('\n')}
${links.map(op=>update({table:op.table,id:op.row.id,after:{review_status:'approved',is_active:true}})).join('\n')}
${post}
${oldPayloads}
${pre(stable)}
${activeLinks(true)}
${check(`v_before IS DISTINCT FROM ${preserved}`,'PRESERVATION_FAILED')}
${check(`v_private IS DISTINCT FROM ${privateDigest}`,'PRIVATE_DATA_CHANGED')}
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('abalone_estimated_weight_applied','info','abalone-estimated-weight-20261011',${literal(reviewedBy)}::uuid,'Apply user-approved AI estimate of 50g edible portion per abalone',${json({operation_checksum:p.operation_checksum,decisions:p.decisions})});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
END;
${delimiter};
COMMIT;\n`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),at=args.indexOf('--reviewer-file');
  if(at<0) throw Error('Use --reviewer-file with a private UUID text file');
  const file=args.includes('--plan')?args[args.indexOf('--plan')+1]:DEFAULT_PLAN;
  process.stdout.write(renderAbaloneEstimatedWeight(JSON.parse(readFileSync(file,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));
}
