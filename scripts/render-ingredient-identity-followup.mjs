#!/usr/bin/env node
// Offline-only renderer for the four reviewed food identities.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const DEFAULT_IDENTITY_PLAN = new URL('../docs/engineering/data/ingredient-identity-followup-plan-20261010.json', import.meta.url);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const literal=v=>`'${String(v).replaceAll("'","''")}'`;
const json=v=>`${literal(JSON.stringify(v))}::jsonb`;
const tables=['ingredients','ingredient_catalog_entries','ingredient_synonyms','nutrition_sources','nutrition_source_items','nutrition_profiles','nutrition_values','ingredient_nutrition_profiles'];
const scope=new Map([
  ['e3a4db20-62d6-56f5-a9a5-64950ed10723','c5837bab-9cb1-4a11-b8d2-2f7ffda35717'],
  ['e5ae7caa-1e88-5232-aed9-de25cb369ecf','752dd19c-95ab-4923-b424-ef70f0f7648d'],
  ['2cfcc8dd-d93d-5f8d-aa24-a5e4e36e2893','00a3f614-5aa2-41b3-9c70-40e398fafc52'],
  ['ef4fa64d-94f6-5328-a5c2-fef92ef26ed8',null],
]);
const codes=['energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg','sugars_g','fiber_g','saturated_fat_g'];
const key=(table,row)=>table==='nutrition_values'?{profile_id:row.profile_id,nutrient_code:row.nutrient_code}:table==='ingredient_catalog_entries'?{ingredient_id:row.ingredient_id}:{id:row.id};
const where=k=>Object.entries(k).map(([c,v])=>`t.${c}=${literal(v)}${c==='nutrient_code'?'':'::uuid'}`).join(' AND ');
const actual=(table,k)=>`(SELECT to_jsonb(t) FROM public.${table} t WHERE ${where(k)})`;
const comparable=(table,expr)=>table==='ingredient_catalog_entries'?`(${expr}-'updated_at')`:['ingredients','ingredient_synonyms'].includes(table)?`(${expr}-'search_name')`:expr;
const assertion=(condition,code)=>`IF ${condition} THEN RAISE EXCEPTION '${code}'; END IF;`;
export function validateIdentityFollowupPlan(plan) {
  const {operation_checksum,...body}=plan;
  if(hash(body)!==operation_checksum)throw Error('IDENTITY_CHECKSUM');
  if(plan.schema!=='homecook.ingredient-identity-followup.v1'||plan.decisions.length!==4||new Set(plan.decisions.map(d=>d.ingredient_id)).size!==4)throw Error('IDENTITY_SCOPE');
  if(plan.policy.automatic_ai_enabled!==false||plan.policy.recipe_rows_unchanged!==true||plan.policy.original_rows_immutable!==true)throw Error('IDENTITY_POLICY');
  for(const op of [...plan.inserts,...plan.preconditions]) {
    if(![...tables,'ingredient_catalog_groups'].includes(op.table))throw Error('IDENTITY_TABLE');
    for(const c of Object.keys(op.row??op.key))if(!/^[a-z_][a-z_0-9]*$/.test(c))throw Error('IDENTITY_COLUMN');
    for(const c of Object.keys(op.key??{}))if(!['id','ingredient_id','profile_id','nutrient_code'].includes(c))throw Error('IDENTITY_KEY');
  }
  for(const op of plan.inserts)if(!tables.includes(op.table))throw Error('IDENTITY_INSERT_SCOPE');
  const rows=table=>plan.inserts.filter(op=>op.table===table).map(op=>op.row);
  const expectedCounts={ingredients:4,ingredient_catalog_entries:4,ingredient_synonyms:1,nutrition_sources:1,nutrition_source_items:3,nutrition_profiles:3,nutrition_values:24,ingredient_nutrition_profiles:3};
  for(const [table,count]of Object.entries(expectedCounts))if(rows(table).length!==count)throw Error('IDENTITY_COUNTS');
  const source=rows('nutrition_sources')[0];
  if(source.provider_code!=='HOMECOOK_USER_STANDARD'||source.dataset_name!==plan.dataset_name||source.dataset_name!=='Homecook 제품 라벨 기반 서비스 대표 예시 20261010 · 정체성 보완')throw Error('IDENTITY_SOURCE_DATASET');
  for(const d of plan.decisions) {
    if(!scope.has(d.ingredient_id)||scope.get(d.ingredient_id)!==(d.source?.profile_id??null))throw Error('IDENTITY_SOURCE_SCOPE');
    const ingredient=rows('ingredients').find(i=>i.id===d.ingredient_id);
    const catalog=rows('ingredient_catalog_entries').find(i=>i.ingredient_id===d.ingredient_id);
    if(!ingredient||!catalog||ingredient.standard_name!==d.name||catalog.definition!==d.definition||catalog.representative_ingredient_id!==null)throw Error('IDENTITY_DEFINITION');
    if(!d.source){if(catalog.presentation!=='umbrella'||d.profile_id!==null||rows('ingredient_nutrition_profiles').some(l=>l.ingredient_id===d.ingredient_id))throw Error('IDENTITY_UNRESOLVED_BROTH');continue;}
    const profile=rows('nutrition_profiles').find(p=>p.id===d.profile_id);
    const item=rows('nutrition_source_items').find(i=>i.id===profile?.source_item_id);
    const link=rows('ingredient_nutrition_profiles').find(l=>l.id===d.link_id);
    if(catalog.presentation!=='base'||!profile||!item||!link||profile.profile_kind!=='ingredient_source'||profile.id===d.source.profile_id||link.ingredient_id!==d.ingredient_id||link.nutrition_profile_id!==profile.id||!link.is_active||!link.is_primary||link.review_status!=='approved')throw Error('IDENTITY_LINK');
    if(profile.normalization_method!==(d.source.basis.unit==='g'?'mass_100g':'volume_100ml'))throw Error('IDENTITY_NORMALIZATION');
    if(profile.basis_amount!==d.source.basis.amount||profile.basis_unit!==d.source.basis.unit||item.source_basis_amount!==d.source.basis.amount||item.source_basis_unit!==d.source.basis.unit)throw Error('IDENTITY_BASIS');
    if(item.external_name!==d.name||item.preparation_state!=='as_published'||link.preparation_state!=='as_published'||item.provenance_json.actual_product_identity_claimed!==false||item.provenance_json.original_profile_id!==d.source.profile_id)throw Error('IDENTITY_PROVENANCE');
    const values=rows('nutrition_values').filter(v=>v.profile_id===profile.id);
    if(JSON.stringify(values.map(v=>v.nutrient_code).sort())!==JSON.stringify([...codes].sort()))throw Error('IDENTITY_NUTRIENT_SET');
    for(const v of d.source.values){const copied=values.find(n=>n.nutrient_code===v.nutrient_code);if(!copied||copied.amount!==v.amount||copied.value_status!==v.value_status||copied.source_token!==v.source_token||copied.source_unit!==v.source_unit)throw Error('IDENTITY_MIXED_PROFILE');}
    const fiber=values.find(v=>v.nutrient_code==='fiber_g');if(fiber.amount!==null||fiber.value_status!=='missing')throw Error('IDENTITY_MISSING_FIBER');
  }
  const alias=rows('ingredient_synonyms')[0];if(alias.ingredient_id!=='e3a4db20-62d6-56f5-a9a5-64950ed10723'||alias.synonym!=='어린이치즈')throw Error('IDENTITY_ALIAS_SCOPE');
  const jobs=plan.ai_job_cleanup;
  if(jobs.policy_version!=='ingredient-ai-v1'||jobs.expected_attempt_count!==0||jobs.preserve_existing_jobs!==true||jobs.entries.length!==4||new Set(jobs.entries.map(e=>e.ingredient_id)).size!==4)throw Error('IDENTITY_AI_JOB_SCOPE');
  for(const j of jobs.entries)if(!scope.has(j.ingredient_id)||j.skip_reason!==(scope.get(j.ingredient_id)?'NON_AI_PRIMARY_EXISTS':'CATALOG_SCOPE_EXCLUDED'))throw Error('IDENTITY_AI_JOB_SCOPE');
  return plan;
}
export function renderIdentityFollowupSql(input,{reviewedBy}={}) {
  validateIdentityFollowupPlan(input);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewedBy??''))throw Error('IDENTITY_REVIEWER_REQUIRED');
  const p=JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__',reviewedBy));
  const delimiter='$identity_'+p.operation_checksum+'$';if(JSON.stringify(p).includes(delimiter))throw Error('IDENTITY_DELIMITER');
  const post=p.inserts.map(({table,row})=>assertion(`${comparable(table,actual(table,key(table,row)))} IS DISTINCT FROM ${comparable(table,json(row))}`,'IDENTITY_POSTIMAGE')).concat(p.inserts.filter(op=>['ingredients','ingredient_synonyms'].includes(op.table)).map(({table,row})=>assertion(`EXISTS(SELECT 1 FROM public.${table} t WHERE ${where(key(table,row))} AND search_name IS DISTINCT FROM public.normalize_ingredient_search_name(${table==='ingredients'?'standard_name':'synonym'}))`,'IDENTITY_SEARCH_KEY'))).join('\n');
  const pre=p.preconditions.map(op=>{
    const expression=op.table==='nutrition_values'?`(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY nutrient_code),'')) FROM public.nutrition_values t WHERE ${where(op.key)})`:`(SELECT md5(to_jsonb(t)::text) FROM public.${op.table} t WHERE ${where(op.key)})`;
    return assertion(`${expression} IS DISTINCT FROM ${literal(op.md5)}`,'IDENTITY_SOURCE_DRIFT');
  }).join('\n');
  const names=p.decisions.map(d=>literal(d.name)).join(',');
  const noDuplicate=assertion(`EXISTS(SELECT 1 FROM public.ingredients WHERE public.normalize_ingredient_search_name(standard_name) IN (SELECT public.normalize_ingredient_search_name(n) FROM unnest(ARRAY[${names}]) n))`,'IDENTITY_ALREADY_HAS_TYPED_INGREDIENT');
  const noAliasCollision=assertion(`EXISTS(SELECT 1 FROM public.ingredient_synonyms WHERE public.normalize_ingredient_search_name(synonym)=public.normalize_ingredient_search_name('어린이치즈'))`,'IDENTITY_ALIAS_COLLISION');
  const preservedTables=[...tables,'ingredient_catalog_groups','recipes','recipe_ingredients','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','pantry_items','piece_unit_weights','measurement_source_evidence','ingredient_conversion_assignments'];
  const digest=table=>{
    const excluded=p.inserts.filter(op=>op.table===table).map(op=>`(${where(key(table,op.row))})`).join(' OR ')||'false';
    return `(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.${table} t WHERE NOT (${excluded}))`;
  };
  const preserved=preservedTables.map(t=>`${literal(t)},${digest(t)}`).join(',');
  const jobIds=p.ai_job_cleanup.entries.map(e=>`${literal(e.ingredient_id)}::uuid`).join(',');
  const jobsDigest=`(SELECT md5(coalesce(string_agg(md5(to_jsonb(j)::text),'' ORDER BY md5(to_jsonb(j)::text)),'')) FROM private.ingredient_ai_nutrition_jobs j WHERE ingredient_id NOT IN (${jobIds}))`;
  const disabled=assertion(`(SELECT count(*)<>1 OR bool_or(enabled) OR bool_or(policy_version<>'ingredient-ai-v1') FROM private.ingredient_ai_nutrition_settings)`,'IDENTITY_AI_SETTINGS_DRIFT');
  const reason=`CASE ingredient_id ${p.ai_job_cleanup.entries.map(e=>`WHEN ${literal(e.ingredient_id)}::uuid THEN ${literal(e.skip_reason)}`).join(' ')} END`;
  const jobsPost=status=>assertion(`(SELECT count(*) FROM private.ingredient_ai_nutrition_jobs WHERE ingredient_id IN (${jobIds}))<>4 OR EXISTS(SELECT 1 FROM private.ingredient_ai_nutrition_jobs WHERE ingredient_id IN (${jobIds}) AND (status<>${literal(status)} OR policy_version<>'ingredient-ai-v1' OR attempt_count<>0 OR max_attempts<>3 OR worker_id IS NOT NULL OR lease_token IS NOT NULL OR lease_expires_at IS NOT NULL OR completion_token IS NOT NULL OR context_hash IS NOT NULL OR ingredient_name IS NOT NULL OR prompt_version IS NOT NULL OR model_id IS NOT NULL OR cardinality(pending_recipe_ids)<>0 OR result IS NOT NULL OR last_error_code IS DISTINCT FROM ${status==='queued'?'NULL':reason} OR private.ingredient_ai_nutrition_skip_reason(ingredient_id) IS DISTINCT FROM ${reason}))`,'IDENTITY_AI_JOB_POSTIMAGE');
  const inserts=p.inserts.sort((a,b)=>tables.indexOf(a.table)-tables.indexOf(b.table)).map(({table,row})=>{const columns=Object.keys(row).join(',');return `INSERT INTO public.${table}(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::public.${table},${json(row)});`;}).join('\n');
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='240s';
DO ${delimiter}
DECLARE v_cutover uuid; v_preserved jsonb; v_jobs_before text;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-identity-followup-20261010',0));
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0));
LOCK TABLE ${preservedTables.map(t=>'public.'+t).join(',')},private.ingredient_ai_nutrition_jobs,private.ingredient_ai_nutrition_settings IN SHARE ROW EXCLUSIVE MODE;
${disabled}
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='ingredient_identity_followup_applied' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
${pre}
${jobsPost('skipped')}
RAISE NOTICE 'Identity followup already applied; verified postimage, no writes'; RETURN;
END IF;
${pre}
${noDuplicate}
${noAliasCollision}
IF EXISTS(SELECT 1 FROM private.ingredient_ai_nutrition_jobs WHERE ingredient_id IN (${jobIds})) THEN RAISE EXCEPTION 'IDENTITY_AI_JOB_PREEXISTS'; END IF;
SELECT jsonb_build_object(${preserved}) INTO v_preserved;
v_jobs_before:=${jobsDigest};
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
IF v_cutover IS NULL THEN RAISE EXCEPTION 'IDENTITY_WRITER_UNAVAILABLE'; END IF;
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${inserts}
${post}
${jobsPost('queued')}
UPDATE private.ingredient_ai_nutrition_jobs SET status='skipped',last_error_code=${reason},updated_at=clock_timestamp() WHERE ingredient_id IN (${jobIds}) AND policy_version='ingredient-ai-v1' AND status='queued' AND attempt_count=0;
${jobsPost('skipped')}
${disabled}
IF v_jobs_before IS DISTINCT FROM ${jobsDigest} THEN RAISE EXCEPTION 'IDENTITY_EXISTING_AI_JOBS_CHANGED'; END IF;
IF v_preserved IS DISTINCT FROM jsonb_build_object(${preserved}) THEN RAISE EXCEPTION 'IDENTITY_PRESERVATION_FAILED'; END IF;
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json) VALUES('ingredient_identity_followup_applied','info','ingredient-identity-followup-20261010',${literal(reviewedBy)}::uuid,'Add reviewed typed identities and whole product-reference profiles without rewriting original rows',${json({operation_checksum:p.operation_checksum,counts:p.counts,decisions:p.decisions,policy:p.policy,ai_job_cleanup:p.ai_job_cleanup})});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
PERFORM pg_notify('pgrst','reload schema');
END;
${delimiter};
COMMIT;\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2);const at=args.indexOf('--reviewer-file');if(at<0)throw Error('Use --reviewer-file with a private UUID text file');const file=args.includes('--plan')?args[args.indexOf('--plan')+1]:DEFAULT_IDENTITY_PLAN;process.stdout.write(renderIdentityFollowupSql(JSON.parse(readFileSync(file,'utf8')),{reviewedBy:readFileSync(args[at+1],'utf8').trim()}));}
