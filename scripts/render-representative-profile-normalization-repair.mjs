#!/usr/bin/env node
// Offline renderer: inspect/verify the emitted transaction before executing it.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_PLAN = new URL('../docs/engineering/data/representative-profile-normalization-repair-20261010.json', import.meta.url);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const literal = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${literal(JSON.stringify(v))}::jsonb`;
const tables = ['nutrition_sources', 'nutrition_source_items', 'nutrition_profiles', 'nutrition_values', 'ingredient_nutrition_profiles', 'ingredient_catalog_entries', 'ingredients'];
const codes = ['energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg', 'sugars_g', 'fiber_g', 'saturated_fat_g'];
const keys = (table, row) => table === 'nutrition_values' ? { profile_id: row.profile_id, nutrient_code: row.nutrient_code } : table === 'ingredient_catalog_entries' ? { ingredient_id: row.ingredient_id } : { id: row.id };
const where = (key) => Object.entries(key).map(([k,v]) => `t.${k}=${literal(v)}${k==='nutrient_code'?'':'::uuid'}`).join(' AND ');
const assert = (condition, error) => `IF ${condition} THEN RAISE EXCEPTION '${error}'; END IF;`;
const actual = (table, key) => `(SELECT to_jsonb(t) FROM public.${table} t WHERE ${where(key)})`;
export function validateNormalizationRepairPlan(plan) {
  const { operation_checksum, ...body } = plan;
  if (hash(body) !== operation_checksum) throw Error('NORMALIZATION_REPAIR_CHECKSUM');
  const targets = ['3908377a-cb50-473a-bbdf-b1104ad2d2cd','5570fc99-26b5-54b1-b7db-3aba236f8f8f','775026fb-a00e-44f0-995d-dfc5599463b1','b486109e-e04e-409a-924f-638dc78258e4','e10a1b06-34ec-5078-9f92-bf6e548afb35','e2b1373c-2ec5-43d7-b49f-e2a2282a0330'];
  if (plan.schema !== 'homecook.representative-profile-normalization-repair.v1'
    || JSON.stringify(plan.decisions.map(d=>d.ingredient_id).sort()) !== JSON.stringify(targets)
    || plan.inserts.length!==60 || plan.updates.length!==12 || plan.expected_links.length!==6) throw Error('NORMALIZATION_REPAIR_SCOPE');
  for (const op of [...plan.inserts,...plan.updates,...plan.preconditions]) {
    if(!tables.includes(op.table) || Object.keys(op.row??op.after??{}).some(k=>!/^[a-z_][a-z_0-9]*$/.test(k))
      || Object.keys(op.key??{}).some(k=>!['id','profile_id','nutrient_code'].includes(k))) throw Error('NORMALIZATION_REPAIR_TABLE');
  }
  if(plan.inserts.some(op=>!['nutrition_profiles','nutrition_values','ingredient_nutrition_profiles'].includes(op.table))
    || plan.updates.some(op=>!['ingredient_nutrition_profiles','nutrition_profiles'].includes(op.table))) throw Error('NORMALIZATION_REPAIR_IMMUTABLE_SOURCE');
  for(const op of plan.updates) {
    const allowed=['is_active','review_status','superseded_by_id','reviewed_by','reviewed_at','decision_reason',...(op.table==='ingredient_nutrition_profiles'?['is_primary']:[])];
    if(Object.keys(op.after).sort().join(',')!==allowed.sort().join(',')) throw Error('NORMALIZATION_REPAIR_UPDATE_SCOPE');
  }
  if(plan.updates.filter(op=>op.table==='nutrition_profiles').length!==6||plan.updates.filter(op=>op.table==='ingredient_nutrition_profiles').length!==6) throw Error('NORMALIZATION_REPAIR_UPDATE_SCOPE');
  if(plan.inserts.filter(op=>op.table==='nutrition_profiles').length!==6
    ||plan.inserts.filter(op=>op.table==='ingredient_nutrition_profiles').length!==6
    ||plan.inserts.filter(op=>op.table==='nutrition_values').length!==48) throw Error('NORMALIZATION_REPAIR_INSERT_SCOPE');
  for(const d of plan.decisions) {
    const profile=plan.inserts.find(op=>op.table==='nutrition_profiles'&&op.row.id===d.profile_id)?.row;
    const link=plan.inserts.find(op=>op.table==='ingredient_nutrition_profiles'&&op.row.id===d.link_id)?.row;
    const update=plan.updates.find(op=>op.table==='ingredient_nutrition_profiles'&&op.key.id===d.old_link_id);
    const profileUpdate=plan.updates.find(op=>op.table==='nutrition_profiles'&&op.key.id===d.old_profile_id);
    if(!profileUpdate||profileUpdate.after.superseded_by_id!==d.profile_id||profileUpdate.after.review_status!=='superseded'||profileUpdate.after.is_active!==false) throw Error('NORMALIZATION_REPAIR_PROFILE_TRANSITION');
    const expected=plan.expected_links.find(row=>row.ingredient_id===d.ingredient_id);
    const method=d.basis_unit==='g'?'mass_100g':d.basis_unit==='ml'?'volume_100ml':null;
    if(!profile||profile.profile_kind!=='ingredient_source'||profile.review_status!=='approved'||!profile.is_active
      ||profile.id===d.old_profile_id||profile.source_item_id!==d.source_item_id||profile.version!==d.old_profile_version+1
      ||profile.basis_amount!==100||d.basis_amount!==100||profile.basis_unit!==d.basis_unit
      ||!method||d.basis_unit!==(d.ingredient_id==='775026fb-a00e-44f0-995d-dfc5599463b1'?'ml':'g')||profile.normalization_method!==method||d.normalization_method!==method) throw Error('NORMALIZATION_REPAIR_PROFILE');
    if(!link||link.id===d.old_link_id||link.ingredient_id!==d.ingredient_id||link.nutrition_profile_id!==d.profile_id
      ||link.version!==d.old_link_version+1||link.preparation_state!==d.preparation_state
      ||!link.is_primary||!link.is_active||link.review_status!=='approved'
      ||!link.decision_reason.startsWith('user_approved_representative:')
      ||!update||update.after.superseded_by_id!==d.link_id||update.after.review_status!=='superseded'
      ||update.after.is_active!==false||update.after.is_primary!==false
      ||JSON.stringify(expected?.before)!==JSON.stringify([d.old_link_id])||JSON.stringify(expected?.after)!==JSON.stringify([d.link_id])) throw Error('NORMALIZATION_REPAIR_LINK');
    const copied=plan.inserts.filter(op=>op.table==='nutrition_values'&&op.row.profile_id===d.profile_id).map(op=>op.row);
    if(JSON.stringify(copied.map(v=>v.nutrient_code).sort())!==JSON.stringify([...codes].sort())
      ||JSON.stringify(d.captured_values.map(v=>v.nutrient_code).sort())!==JSON.stringify([...codes].sort())) throw Error('NORMALIZATION_REPAIR_NUTRIENTS');
    for(const value of d.captured_values) {
      const target=copied.find(v=>v.nutrient_code===value.nutrient_code);
      if(value.profile_id!==d.old_profile_id||JSON.stringify({...value,profile_id:d.profile_id})!==JSON.stringify(target)) throw Error('NORMALIZATION_REPAIR_VALUES');
    }
    if(!d.link_source_name||d.link_source_name.length>100) throw Error('NORMALIZATION_REPAIR_SOURCE_NAME');
    for(const [table,key] of [['nutrition_profiles',{id:d.old_profile_id}],['nutrition_values',{profile_id:d.old_profile_id}],['nutrition_source_items',{id:d.source_item_id}],['nutrition_sources',{id:d.source_id}],['ingredient_nutrition_profiles',{id:d.old_link_id}],['ingredients',{id:d.ingredient_id}]]) {
      if(!plan.preconditions.some(op=>op.table===table&&JSON.stringify(op.key)===JSON.stringify(key)&&/^[a-f0-9]{32}$/.test(op.md5))) throw Error('NORMALIZATION_REPAIR_SOURCE_GUARD');
    }
  }
  return plan;
}
export function renderNormalizationRepairSql(input,{reviewedBy}={}) {
  validateNormalizationRepairPlan(input);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewedBy??'')) throw Error('NORMALIZATION_REPAIR_REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$completion_'+p.operation_checksum+'$';
  if(JSON.stringify(p).includes(delimiter)) throw Error('NORMALIZATION_REPAIR_DELIMITER');
  const wholeProfiles=p.decisions.map(d=>assert(`(SELECT jsonb_agg(to_jsonb(v)-'profile_id' ORDER BY nutrient_code) FROM public.nutrition_values v WHERE profile_id=${literal(d.old_profile_id)}::uuid) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(v)-'profile_id' ORDER BY nutrient_code) FROM public.nutrition_values v WHERE profile_id=${literal(d.profile_id)}::uuid)`, 'NORMALIZATION_REPAIR_WHOLE_PROFILE_CHANGED')).join('\n');
  const exclusiveReferences=p.decisions.map(d=>assert(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.ingredient_nutrition_profiles WHERE nutrition_profile_id=${literal(d.old_profile_id)}::uuid) IS DISTINCT FROM ${json([d.old_link_id])} OR EXISTS(SELECT 1 FROM public.food_product_nutrition_versions WHERE nutrition_profile_id=${literal(d.old_profile_id)}::uuid)`, 'NORMALIZATION_REPAIR_SHARED_PROFILE')).join('\n');
  const privateGuard=`jsonb_build_object('ai',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM private.ingredient_ai_nutrition_settings t),'jobs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM private.ingredient_ai_nutrition_jobs t),'ledger',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY filename)::text,'')) FROM homecook_deploy.migrations t))`;
  const post=p.inserts.map(op=>assert(`${actual(op.table,keys(op.table,op.row))} IS DISTINCT FROM ${json(op.row)}`,'NORMALIZATION_REPAIR_POSTIMAGE')).concat(p.updates.map(op=>assert(`NOT coalesce(${actual(op.table,op.key)} @> ${json(op.after)},false)`,'NORMALIZATION_REPAIR_UPDATE_POSTIMAGE'))).join('\n');
  const links=(which)=>p.expected_links.map(l=>assert(`(SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]'::jsonb) FROM public.ingredient_nutrition_profiles WHERE ingredient_id=${literal(l.ingredient_id)}::uuid AND is_active AND is_primary AND review_status='approved') IS DISTINCT FROM ${json(l[which])}`,'NORMALIZATION_REPAIR_LINK_DRIFT')).join('\n');
  const precondition=(op)=>{
    const expression=op.table==='nutrition_values'?`(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY nutrient_code),'')) FROM public.nutrition_values t WHERE ${where(op.key)})`:`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE ${where(op.key)})`;
    return assert(`${expression} IS DISTINCT FROM ${literal(op.md5)}`,'NORMALIZATION_REPAIR_SOURCE_DRIFT');
  };
  const pre=p.preconditions.map(precondition).join('\n');
  const stablePre=p.preconditions.filter(op=>!['nutrition_profiles','ingredient_catalog_entries','ingredient_nutrition_profiles'].includes(op.table)).map(precondition).join('\n');
  const protectedTables=[...tables,'ingredient_synonyms','ingredient_catalog_groups','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','pantry_items','piece_unit_weights','measurement_source_evidence','ingredient_conversion_assignments'];
  const digest=(table)=>{
    const ins=p.inserts.filter(op=>op.table===table).map(op=>`(${where(keys(table,op.row))})`).join(' OR ')||'false';
    const cases=p.updates.filter(op=>op.table===table).map(op=>`WHEN ${where(op.key)} THEN to_jsonb(t)-ARRAY[${[...Object.keys(op.after), ...(table==='ingredient_catalog_entries'?['updated_at']:[])].map(literal).join(',')}]::text[]`).join(' ');
    const row=cases?`CASE ${cases} ELSE to_jsonb(t) END`:'to_jsonb(t)';
    return `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5((${row})::text) h FROM public.${table} t WHERE NOT (${ins})) intact)`;
  };
  const preservation=protectedTables.map(t=>`${literal(t)},${digest(t)}`).join(',');
  const insert=(op)=>{const cols=Object.keys(op.row).join(',');return `INSERT INTO public.${op.table}(${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.${op.table},${json(op.row)});`;};
  // This is the exact approved-source alias pattern used by
  // apply_reviewed_ingredient_nutrition. Remove only rows created here so source
  // labels do not become broad, ambiguous public search synonyms.
  const temporaryAliases=p.decisions.map(d=>`
IF NOT EXISTS(SELECT 1 FROM public.nutrition_profiles profile JOIN public.nutrition_source_items item ON item.id=profile.source_item_id WHERE profile.id=${literal(d.profile_id)}::uuid AND item.external_name=${literal(d.link_source_name)}) THEN RAISE EXCEPTION 'NORMALIZATION_REPAIR_SOURCE_NAME_DRIFT'; END IF;
v_created_alias_id:=NULL;
INSERT INTO public.ingredient_synonyms(ingredient_id,synonym)
SELECT ${literal(d.ingredient_id)}::uuid,${literal(d.link_source_name)}
WHERE NOT EXISTS(SELECT 1 FROM public.ingredients WHERE id=${literal(d.ingredient_id)}::uuid AND lower(btrim(standard_name))=lower(btrim(${literal(d.link_source_name)})))
ON CONFLICT(ingredient_id,synonym) DO NOTHING RETURNING id INTO v_created_alias_id;
IF v_created_alias_id IS NOT NULL THEN v_created_alias_ids:=array_append(v_created_alias_ids,v_created_alias_id); END IF;`).join('\n');
  const update=(op)=>{const after=op.after;return `UPDATE public.${op.table} t SET ${Object.keys(after).map(k=>`${k}=(SELECT ${k} FROM jsonb_populate_record(NULL::public.${op.table},${json(after)}))`).join(',')} WHERE ${where(op.key)};`;};
  const replacingIds=new Set(p.updates.filter(op=>op.table==='ingredient_nutrition_profiles').map(op=>op.after.superseded_by_id));
  const linksToInsert=p.inserts.filter(op=>op.table==='ingredient_nutrition_profiles');
  // Preserve the existing reviewed function's transition order: insert a pending
  // replacement, supersede the old link once, then approve the replacement.
  const insertLinks=linksToInsert.map(op=>insert(replacingIds.has(op.row.id)?{...op,row:{...op.row,review_status:'pending',is_active:false,is_primary:false}}:op)).join('\n');
  const insertProfiles=p.inserts.filter(op=>op.table==='nutrition_profiles').map(op=>insert({...op,row:{...op.row,review_status:'pending',is_active:false}})).join('\n');
  const approveProfiles=p.inserts.filter(op=>op.table==='nutrition_profiles').map(op=>update({table:op.table,key:{id:op.row.id},after:{review_status:'approved',is_active:true}})).join('\n');
  const approveLinks=linksToInsert.filter(op=>replacingIds.has(op.row.id)).map(op=>update({table:op.table,key:{id:op.row.id},after:{review_status:'approved',is_active:true,is_primary:true}})).join('\n');
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='240s';
DO ${delimiter}
DECLARE v_cutover uuid; v_preserved jsonb; v_private_before jsonb; v_created_alias_id uuid; v_created_alias_ids uuid[]:='{}';
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:representative-profile-normalization-repair-20261010',0));
-- Catalog validation requires READ COMMITTED after acquiring this shared graph lock.
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
-- Freeze all audited relations so READ COMMITTED preservation checks cannot race writers.
LOCK TABLE ${protectedTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='representative_profile_normalization_repaired' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${wholeProfiles}
${stablePre}
${links('after')}
RAISE NOTICE 'Normalization repair already applied; verified postimage, no writes'; RETURN;
END IF;
${pre}
${links('before')}
${exclusiveReferences}
IF (SELECT count(*)<>1 OR bool_or(enabled) FROM private.ingredient_ai_nutrition_settings) THEN RAISE EXCEPTION 'NORMALIZATION_REPAIR_AI_ENABLED'; END IF;
SELECT ${privateGuard} INTO v_private_before;
SELECT jsonb_build_object(${preservation}) INTO v_preserved;
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
IF v_cutover IS NULL THEN RAISE EXCEPTION 'NORMALIZATION_REPAIR_WRITER_UNAVAILABLE'; END IF;
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${insertProfiles}
${p.updates.filter(op=>op.table==='nutrition_profiles').map(update).join('\n')}
${approveProfiles}
${p.inserts.filter(op=>op.table==='nutrition_values').map(insert).join('\n')}
${temporaryAliases}
${insertLinks}
${p.updates.filter(op=>op.table==='ingredient_nutrition_profiles').map(update).join('\n')}
${approveLinks}
DELETE FROM public.ingredient_synonyms WHERE id=ANY(v_created_alias_ids);
${post}
${wholeProfiles}
${stablePre}
${links('after')}
IF v_private_before IS DISTINCT FROM ${privateGuard} THEN RAISE EXCEPTION 'NORMALIZATION_REPAIR_PRIVATE_DATA_CHANGED'; END IF;
IF v_preserved IS DISTINCT FROM jsonb_build_object(${preservation}) THEN RAISE EXCEPTION 'NORMALIZATION_REPAIR_PRESERVATION_FAILED'; END IF;
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('representative_profile_normalization_repaired','info','representative-normalization-repair-20261010',${literal(reviewedBy)}::uuid,'Append supported normalization profiles without changing original label values or history',${json({operation_checksum:p.operation_checksum,decisions:p.decisions})});
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
  process.stdout.write(renderNormalizationRepairSql(JSON.parse(readFileSync(plan,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));
}
