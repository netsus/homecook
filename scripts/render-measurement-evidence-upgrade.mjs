#!/usr/bin/env node
// Offline, fixed-scope transaction renderer. Execution and backup are separate operations.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_PLAN = new URL('../docs/engineering/data/measurement-evidence-upgrade-plan-20261011.json', import.meta.url);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const targets = [
  ['청양고추','1e49f4be-6b94-4e7f-a492-a68134881e98',10,'개','1',10,61,'9c922c29-189d-42ba-ae7d-a07ae7edd71f'],
  ['양파','550e8400-e29b-41d4-a716-446655440010',160,'개','1/8',20,64,'9765295b-11e9-4212-902a-e132424458b8'],
  ['두부','550e8400-e29b-41d4-a716-446655440017',300,'모','1/3',100,88,'b53e94ce-dca3-4ab3-b4b0-8d8561d4b295'],
  ['식용유','d6d92b38-853f-43c2-b2e1-2b4a591de334',14,'큰술','1',14,9,'4b335515-5352-43fe-aa2d-0ef05ef5a15d'],
];
const sourceFacts = [
  ['MFDS_RECIPE_CORROBORATION','https://www.foodsafetykorea.go.kr/upload/20170417/20170417053825_1492418305244.pdf','f3ae4dce2cbde7e8024932ee7e87d20bd76230009848dbc7b3813dd4e4e42f6c'],
  ['NISSHIN_MANUFACTURER_APPROX','https://www.nisshin-oillio.com/oil/pdf/book.pdf','3192fc043fc3839ce788b8fe7a19600f50ae68e583f3748971d3881491b25527'],
];
const insertTables = ['nutrition_sources','measurement_source_evidence','piece_unit_weights','ingredient_conversion_assignments'];
const preTables = [...insertTables,'ingredients','measurement_conversion_profiles'];
const metadataKeys = table => ['review_status','is_active','superseded_by_id','reviewed_by','reviewed_at',table === 'ingredient_conversion_assignments' ? 'assignment_reason' : 'decision_reason'];
const rowFor = (plan,table,id) => plan.inserts.find(op=>op.table===table && op.row.id===id)?.row;
function requireCondition(condition,reason) { if(!condition) throw Error('MEASUREMENT_UPGRADE_'+reason); }
export function validateMeasurementEvidenceUpgrade(plan) {
  const {operation_checksum,...body}=plan;
  requireCondition(hash(body)===operation_checksum,'CHECKSUM');
  requireCondition(plan.schema==='homecook.measurement-evidence-upgrade.v1' && plan.decisions.length===4 && plan.inserts.length===10 && plan.updates.length===4 && plan.preconditions.length===15,'SCOPE');
  requireCondition(same(plan.decisions.map(d=>d.ingredient_id),targets.map(t=>t[1])),'SCOPE');
  requireCondition(new Set(plan.inserts.map(op=>op.row.id)).size===10 && new Set(plan.updates.map(op=>op.id)).size===4,'DUPLICATE');
  for(const op of plan.inserts) requireCondition(insertTables.includes(op.table) && uuid(op.row.id) && Object.keys(op.row).every(k=>/^[a-z_][a-z_0-9]*$/.test(k)) && op.row.review_status==='approved' && op.row.is_active===true && op.row.reviewed_by==='__PRIVATE_REVIEWER__' && op.row.superseded_by_id===null,'INSERT');
  for(const op of plan.preconditions) requireCondition(preTables.includes(op.table) && uuid(op.id) && /^[a-f0-9]{32}$/.test(op.md5),'PREIMAGE');
  const sources=plan.inserts.filter(op=>op.table==='nutrition_sources').map(op=>op.row);
  requireCondition(sources.length===2,'SOURCE');
  sources.forEach((s,i)=>requireCondition(s.provider_code===sourceFacts[i][0] && s.source_url===sourceFacts[i][1] && s.manifest_sha256===sourceFacts[i][2] && s.source_kind==='measurement_reference' && s.freshness_status==='current' && s.priority_rank===null && s.data_basis_date===null,'SOURCE'));
  for(const [i,d] of plan.decisions.entries()) {
    const [name,id,grams,unit,amount,rawGrams,page,oldId]=targets[i],oil=i===3,table=oil?'ingredient_conversion_assignments':'piece_unit_weights';
    const e=rowFor(plan,'measurement_source_evidence',d.new_evidence_id),link=rowFor(plan,table,d.new_link_id),update=plan.updates.find(op=>op.table===table&&op.id===oldId),source=sources[oil?1:0];
    requireCondition(d.ingredient_name===name && d.table===table && d.old_link_id===oldId && d.applied_weight_g===grams && d.unit===unit && d.preparation_state==='as_published' && d.applied_volume_ml===(oil?15:null),'VALUES');
    requireCondition(d.raw_source_observation.amount_literal===amount && d.raw_source_observation.unit===unit && d.raw_source_observation.weight_g===rawGrams && d.raw_source_observation.pdf_page_1based===page && d.raw_source_observation.approximate===oil,'RAW_OBSERVATION');
    requireCondition(e && e.source_id===source.id && d.new_source_id===source.id && e.source_subject===name && e.source_item_id===null && e.preparation_state==='as_published' && e.evidence_kind===(oil?'volume_weight':'piece_weight') && e.source_observed_amount===1 && e.source_observed_unit===unit && e.observed_weight_g===grams && e.observed_volume_ml===(oil?15:null) && e.normalized_g_per_15ml===(oil?14:null) && e.size_code===(oil?null:'medium') && e.source_url===source.source_url+'#page='+page && e.decision_reason===d.limitation && d.limitation.includes(oil?'근사값':'정규화'),'EVIDENCE');
    const reasonKey=oil?'assignment_reason':'decision_reason';
    requireCondition(link && link.id!==oldId && link.ingredient_id===id && link.evidence_id===e.id && link.preparation_state==='as_published' && link.version===d.old_link_payload.version+1 && link[reasonKey]===d.limitation,'LINK');
    const numericKeys=oil?['conversion_profile_id','distance_g_per_15ml','candidate_rank','confidence_score']:['weight_g','size_code'];
    requireCondition(numericKeys.every(k=>link[k]===d.old_link_payload[k]) && (oil?link.conversion_profile_id==='71000000-0000-4000-8000-000000000015'&&link.distance_g_per_15ml===1:link.weight_g===grams&&link.size_code==='medium'),'VALUES');
    requireCondition(update && same(Object.keys(update.after).sort(),metadataKeys(table).sort()) && update.after.review_status==='superseded' && update.after.is_active===false && update.after.superseded_by_id===link.id && update.after.reviewed_by==='__PRIVATE_REVIEWER__','UPDATE_SCOPE');
    for(const [t,key] of [[table,oldId],['measurement_source_evidence',d.old_evidence_id],['nutrition_sources',d.old_source_id],['ingredients',id],...(oil?[['measurement_conversion_profiles',link.conversion_profile_id]]:[])]) requireCondition(plan.preconditions.some(op=>op.table===t&&op.id===key),'PREIMAGE');
  }
  return plan;
}
export function renderMeasurementEvidenceUpgrade(input,{reviewedBy}={}) {
  validateMeasurementEvidenceUpgrade(input);
  requireCondition(uuid(reviewedBy),'REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$measurement_'+p.operation_checksum+'$';
  requireCondition(!JSON.stringify(p).includes(delimiter),'DELIMITER');
  const check=(condition,error)=>`IF ${condition} THEN RAISE EXCEPTION 'MEASUREMENT_UPGRADE_${error}'; END IF;`;
  const actual=(table,id)=>`(SELECT to_jsonb(t) FROM public.${table} t WHERE id=${literal(id)}::uuid)`;
  const castRow=(table,row)=>`(SELECT to_jsonb(t) FROM jsonb_populate_record(NULL::public.${table},${json(row)}) t)`;
  const pre=ops=>ops.map(op=>check(`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE id=${literal(op.id)}::uuid) IS DISTINCT FROM ${literal(op.md5)}`,'PREIMAGE_DRIFT')).join('\n');
  const stable=p.preconditions.filter(op=>!p.updates.some(u=>u.table===op.table&&u.id===op.id));
  const activeLinks=after=>p.decisions.map(d=>check(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.${d.table} WHERE ingredient_id=${literal(d.ingredient_id)}::uuid AND preparation_state='as_published' ${d.table==='piece_unit_weights'?"AND size_code='medium'":''} AND is_active AND review_status='approved') IS DISTINCT FROM ${json([after?d.new_link_id:d.old_link_id])}`,'ACTIVE_LINK_DRIFT')).join('\n');
  const post=p.inserts.map(op=>check(`${actual(op.table,op.row.id)} IS DISTINCT FROM ${castRow(op.table,op.row)}`,'POSTIMAGE')).concat(p.updates.map(op=>check(`NOT coalesce(${actual(op.table,op.id)} @> (${castRow(op.table,op.after)} - ARRAY[${Object.keys(rowFor(p,op.table,op.after.superseded_by_id)).filter(k=>!Object.hasOwn(op.after,k)).map(literal).join(',')}]::text[]),false)`,'OLD_LINK_POSTIMAGE'))).join('\n');
  const oldPayloads=p.decisions.map(d=>{const remove=`ARRAY[${metadataKeys(d.table).map(literal).join(',')}]::text[]`;return check(`(${actual(d.table,d.old_link_id)}-${remove}) IS DISTINCT FROM (${castRow(d.table,d.old_link_payload)}-${remove})`,'OLD_PAYLOAD_CHANGED');}).join('\n');
  const protectedTables=['nutrition_sources','measurement_source_evidence','piece_unit_weights','ingredient_conversion_assignments','measurement_conversion_profiles','ingredients','ingredient_synonyms','ingredient_catalog_entries','nutrition_source_items','nutrition_profiles','nutrition_values','ingredient_nutrition_profiles','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries'];
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
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:measurement-evidence-upgrade-20261011',0));
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
LOCK TABLE ${protectedTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='measurement_evidence_upgraded' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${oldPayloads}
${pre(stable)}
${activeLinks(true)}
RAISE NOTICE 'Measurement upgrade already applied; verified postimage, no writes'; RETURN;
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
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('measurement_evidence_upgraded','info','measurement-evidence-upgrade-20261011',${literal(reviewedBy)}::uuid,'Append reviewed measurement references without changing conversion values',${json({operation_checksum:p.operation_checksum,decisions:p.decisions})});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
END;
${delimiter};
COMMIT;\n`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),at=args.indexOf('--reviewer-file');
  if(at<0) throw Error('Use --reviewer-file with a private UUID text file');
  const file=args.includes('--plan')?args[args.indexOf('--plan')+1]:DEFAULT_PLAN;
  process.stdout.write(renderMeasurementEvidenceUpgrade(JSON.parse(readFileSync(file,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));
}
