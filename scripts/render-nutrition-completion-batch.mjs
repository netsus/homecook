#!/usr/bin/env node
// Offline renderer: inspect/verify the emitted transaction before executing it.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_PLAN = new URL('../docs/engineering/data/nutrition-completion-batch-20261010.json', import.meta.url);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const literal = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${literal(JSON.stringify(v))}::jsonb`;
const tables = ['nutrition_sources', 'nutrition_source_items', 'nutrition_profiles', 'nutrition_values', 'ingredient_nutrition_profiles', 'ingredient_catalog_entries', 'ingredients'];
const codes = ['energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg', 'sugars_g', 'fiber_g', 'saturated_fat_g'];
const keys = (table, row) => table === 'nutrition_values' ? { profile_id: row.profile_id, nutrient_code: row.nutrient_code } : table === 'ingredient_catalog_entries' ? { ingredient_id: row.ingredient_id } : { id: row.id };
const where = (key) => Object.entries(key).map(([k,v]) => `t.${k}::text=${literal(v)}`).join(' AND ');
const assert = (condition, error) => `IF ${condition} THEN RAISE EXCEPTION '${error}'; END IF;`;
const actual = (table, key) => `(SELECT to_jsonb(t) FROM public.${table} t WHERE ${where(key)})`;
export function validateCompletionPlan(plan) {
  const { operation_checksum, ...body } = plan;
  if (hash(body) !== operation_checksum) throw Error('COMPLETION_CHECKSUM');
  if (plan.schema !== 'homecook.nutrition-completion-batch.v1' || plan.decisions.length !== 11 || new Set(plan.decisions.map(d=>d.ingredient_id)).size !== 11) throw Error('COMPLETION_SCOPE');
  for (const op of [...plan.inserts, ...plan.updates, ...plan.preconditions]) {
    if (!tables.includes(op.table)) throw Error('COMPLETION_TABLE');
    for (const k of Object.keys(op.row ?? op.after ?? op.key)) if (!/^[a-z_][a-z_0-9]*$/.test(k)) throw Error('COMPLETION_COLUMN');
    for (const k of Object.keys(op.key ?? {})) if (!['id','ingredient_id','profile_id','nutrient_code'].includes(k)) throw Error('COMPLETION_KEY');
  }
  if (plan.updates.some(op=>!['ingredient_catalog_entries','ingredient_nutrition_profiles'].includes(op.table))) throw Error('COMPLETION_IMMUTABLE_SOURCE');
  for(const op of plan.updates) {
    const allowed=op.table==='ingredient_catalog_entries'?['definition','review_version']:['is_active','is_primary','review_status','decision_reason','reviewed_by','reviewed_at','superseded_by_id'];
    if(Object.keys(op.after).some(k=>!allowed.includes(k))) throw Error('COMPLETION_UPDATE_SCOPE');
  }
  if(plan.inserts.some(op=>!tables.slice(0,5).includes(op.table))) throw Error('COMPLETION_INSERT_SCOPE');
  const profiles=plan.inserts.filter(op=>op.table==='nutrition_profiles');
  if(profiles.length!==8 || profiles.some(op=>op.row.profile_kind!=='ingredient_source' || op.row.review_status!=='approved')) throw Error('COMPLETION_PROFILE_SCOPE');
  const values=plan.inserts.filter(op=>op.table==='nutrition_values').map(op=>op.row);
  if(values.length!==64 || values.filter(v=>v.amount===null).length!==6) throw Error('COMPLETION_VALUES_SCOPE');
  for(const {row:p} of profiles) if(JSON.stringify(values.filter(v=>v.profile_id===p.id).map(v=>v.nutrient_code).sort())!==JSON.stringify([...codes].sort())) throw Error('COMPLETION_NUTRIENT_SET');
  for(const v of values) if((v.amount===null)!==(v.value_status==='missing') || (v.amount!==null&&(!Number.isFinite(v.amount)||v.amount<0))) throw Error('COMPLETION_VALUE');
  for(const d of plan.decisions) {
    if(!d.definition_scope || !d.source_evidence || !plan.expected_links.some(l=>l.ingredient_id===d.ingredient_id&&l.after[0]===d.link_id)) throw Error('COMPLETION_DEFINITION');
    if(d.source_evidence.profile_kind==='product_label') {
      if(d.profile_id===d.source_evidence.source_profile_id) throw Error('COMPLETION_PRODUCT_DIRECT_LINK');
      for(const v of d.source_evidence.captured_values) {
        const copied=values.find(n=>n.profile_id===d.profile_id&&n.nutrient_code===v.nutrient_code);
        if(!copied||copied.amount!==v.amount||copied.value_status!==v.value_status||copied.source_token!==v.source_token) throw Error('COMPLETION_MIXED_PROFILE');
      }
      const copiedProfile=profiles.find(p=>p.row.id===d.profile_id)?.row;
      if(copiedProfile?.basis_unit!==d.source_evidence.basis.unit || copiedProfile?.basis_amount!==d.source_evidence.basis.amount) throw Error('COMPLETION_BASIS');
    }
  }
  return plan;
}
export function renderCompletionSql(input,{reviewedBy}={}) {
  validateCompletionPlan(input);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewedBy??'')) throw Error('COMPLETION_REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$completion_'+p.operation_checksum+'$';
  if(JSON.stringify(p).includes(delimiter)) throw Error('COMPLETION_DELIMITER');
  const post=p.inserts.map(op=>assert(`${actual(op.table,keys(op.table,op.row))} IS DISTINCT FROM ${json(op.row)}`,'COMPLETION_POSTIMAGE')).concat(p.updates.map(op=>assert(`NOT coalesce(${actual(op.table,op.key)} @> ${json(op.after)},false)`,'COMPLETION_UPDATE_POSTIMAGE'))).join('\n');
  const links=(which)=>p.expected_links.map(l=>assert(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.ingredient_nutrition_profiles WHERE ingredient_id=${literal(l.ingredient_id)}::uuid AND is_active AND is_primary AND review_status='approved') IS DISTINCT FROM ${json(l[which])}`,'COMPLETION_LINK_DRIFT')).join('\n');
  const precondition=(op)=>{
    const expression=op.table==='nutrition_values'?`(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY nutrient_code),'')) FROM public.nutrition_values t WHERE ${where(op.key)})`:`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE ${where(op.key)})`;
    return assert(`${expression} IS DISTINCT FROM ${literal(op.md5)}`,'COMPLETION_SOURCE_DRIFT');
  };
  const pre=p.preconditions.map(precondition).join('\n');
  const stablePre=p.preconditions.filter(op=>!['ingredient_catalog_entries','ingredient_nutrition_profiles'].includes(op.table)).map(precondition).join('\n');
  const protectedTables=[...tables,'ingredient_synonyms','ingredient_catalog_groups','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','pantry_items','piece_unit_weights','measurement_source_evidence','ingredient_conversion_assignments'];
  const digest=(table)=>{
    const ins=p.inserts.filter(op=>op.table===table).map(op=>`(${where(keys(table,op.row))})`).join(' OR ')||'false';
    const cases=p.updates.filter(op=>op.table===table).map(op=>`WHEN ${where(op.key)} THEN to_jsonb(t)-ARRAY[${[...Object.keys(op.after), ...(table==='ingredient_catalog_entries'?['updated_at']:[])].map(literal).join(',')}]::text[]`).join(' ');
    const row=cases?`CASE ${cases} ELSE to_jsonb(t) END`:'to_jsonb(t)';
    return `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5((${row})::text) h FROM public.${table} t WHERE NOT (${ins})) intact)`;
  };
  const preservation=protectedTables.map(t=>`${literal(t)},${digest(t)}`).join(',');
  const insert=(op)=>{const cols=Object.keys(op.row).join(',');return `INSERT INTO public.${op.table}(${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.${op.table},${json(op.row)});`;};
  const update=(op,omitSuper=false)=>{const after={...op.after};if(omitSuper)delete after.superseded_by_id;return `UPDATE public.${op.table} t SET ${Object.keys(after).map(k=>`${k}=(SELECT ${k} FROM jsonb_populate_record(NULL::public.${op.table},${json(after)}))`).join(',')} WHERE ${where(op.key)};`;};
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='240s';
DO ${delimiter}
DECLARE v_cutover uuid; v_preserved jsonb;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:nutrition-completion-20261010',0));
-- Catalog validation requires READ COMMITTED after acquiring this shared graph lock.
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
-- Freeze all audited relations so READ COMMITTED preservation checks cannot race writers.
LOCK TABLE ${protectedTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='nutrition_completion_batch_applied' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${stablePre}
${links('after')}
RAISE NOTICE 'Completion already applied; verified postimage, no writes'; RETURN;
END IF;
${pre}
${links('before')}
SELECT jsonb_build_object(${preservation}) INTO v_preserved;
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
IF v_cutover IS NULL THEN RAISE EXCEPTION 'COMPLETION_WRITER_UNAVAILABLE'; END IF;
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${p.updates.filter(op=>op.table==='ingredient_nutrition_profiles').map(op=>update(op,true)).join('\n')}
${[...p.inserts].sort((a,b)=>tables.indexOf(a.table)-tables.indexOf(b.table)).map(insert).join('\n')}
${p.updates.map(op=>update(op)).join('\n')}
${post}
${links('after')}
IF v_preserved IS DISTINCT FROM jsonb_build_object(${preservation}) THEN RAISE EXCEPTION 'COMPLETION_PRESERVATION_FAILED'; END IF;
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('nutrition_completion_batch_applied','info','nutrition-completion-20261010',${literal(reviewedBy)}::uuid,'Link explicit representative whole profiles and preserve original sources and history',${json({operation_checksum:p.operation_checksum,counts:p.counts,decisions:p.decisions,policy:p.policy})});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
PERFORM pg_notify('pgrst','reload schema');
END;
${delimiter};
COMMIT;\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);const at=args.indexOf('--reviewer-file');
  if(at<0)throw Error('Use --reviewer-file with a private UUID text file');
  const plan=args.includes('--plan')?args[args.indexOf('--plan')+1]:DEFAULT_PLAN;
  process.stdout.write(renderCompletionSql(JSON.parse(readFileSync(plan,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));
}
