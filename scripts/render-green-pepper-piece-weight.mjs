/** Offline, append-only service portion derived from an official recipe. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { protectedTables } from './render-user-estimated-piece-weights.mjs';
const url = new URL('../docs/engineering/data/green-pepper-piece-weight-20261010.json', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const uuid = key => { const h = hash(`green-pepper-piece-weight-20261010:${key}`); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
export function greenPepperRows(reviewer) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(reviewer)) throw Error('Reviewer UUID required');
  const data = JSON.parse(readFileSync(url, 'utf8')), i = data.ingredient, s = data.source;
  if (data.schema !== 'homecook.green-pepper-piece-weight.v1' || i.id !== 'a12cd429-b500-42d2-ac17-e53123f7356a' || i.weight_g !== 15 || i.observed_amount !== 1 || i.observed_unit !== '개' || i.preparation_state !== 'as_published' || s.provider_code !== 'HOMECOOK_USER_STANDARD' || s.excerpt_sha256 !== hash(s.quoted_excerpt) || s.quoted_excerpt !== '풋고추 15g(1 개)') throw Error('Reviewed portion mismatch');
  const shared = {review_status:'approved',is_active:true,reviewed_by:reviewer,reviewed_at:data.reviewed_at,created_at:data.reviewed_at,superseded_by_id:null,decision_reason:s.decision_reason};
  const source = {...shared,id:uuid('source'),provider_code:s.provider_code,dataset_name:s.dataset_name,source_kind:s.source_kind,source_version:s.source_version,data_basis_date:s.data_basis_date,source_url:s.source_url,license_name:s.license_name,license_url:null,priority_rank:null,fetched_at:data.reviewed_at,freshness_checked_at:data.reviewed_at,freshness_status:'current',manifest_sha256:hash(JSON.stringify(data))};
  const evidence = {...shared,id:uuid('evidence'),source_id:source.id,source_item_id:null,evidence_kind:'piece_weight',source_subject:i.name,preparation_state:'as_published',size_code:'medium',source_observed_unit:'개',source_observed_amount:1,observed_weight_g:15,observed_volume_ml:null,normalized_g_per_15ml:null,source_url:s.source_url,source_accessed_at:'2026-10-10',evidence_fingerprint:hash(JSON.stringify({excerpt:s.quoted_excerpt,sha256:s.excerpt_sha256,ingredient:i})),version:1};
  const piece = {...shared,id:uuid('piece'),ingredient_id:i.id,evidence_id:evidence.id,size_code:'medium',preparation_state:'as_published',weight_g:15,version:1};
  return {data,rows:[['nutrition_sources',source],['measurement_source_evidence',evidence],['piece_unit_weights',piece]]};
}
export function renderGreenPepperPieceWeight(reviewer) {
  const {data,rows}=greenPepperRows(reviewer), i=data.ingredient;
  const snapshot=[...protectedTables,'nutrition_sources','measurement_source_evidence','piece_unit_weights'].map(table=>{
    const ids=rows.filter(([name])=>name===table).map(([,row])=>`${literal(row.id)}::uuid`);
    return `SELECT ${literal(table)} AS table_name,count(*) AS row_count,encode(sha256(convert_to(coalesce(string_agg(row_hash,'|' ORDER BY row_hash),''),'UTF8')),'hex') AS content_hash FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') row_hash FROM public.${table} r${ids.length?` WHERE id NOT IN (${ids.join(',')})`:''}) hashes`;
  }).join('\nUNION ALL\n');
  let sql=`BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE postgres; SET LOCAL standard_conforming_strings=on; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $pepper_preflight$ DECLARE c uuid; BEGIN
  PERFORM pg_advisory_xact_lock(104230921,77101);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=${literal(reviewer)}::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'REVIEWER_UNAVAILABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ingredients ing JOIN public.ingredient_catalog_entries ce ON ce.ingredient_id=ing.id WHERE ing.id=${literal(i.id)}::uuid AND ing.standard_name='고추' AND ce.presentation='umbrella' AND ce.review_state='reviewed') THEN RAISE EXCEPTION 'PEPPER_IDENTITY_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.piece_unit_weights WHERE ingredient_id=${literal(i.id)}::uuid AND is_active AND id<>${literal(uuid('piece'))}::uuid) THEN RAISE EXCEPTION 'PIECE_ALREADY_ASSIGNED'; END IF;
  IF (SELECT count(*) FROM public.ingredient_nutrition_profiles l JOIN public.nutrition_profiles p ON p.id=l.nutrition_profile_id JOIN public.nutrition_source_items si ON si.id=p.source_item_id JOIN public.nutrition_sources ns ON ns.id=si.source_id
    WHERE l.id=${literal(i.expected_nutrition_link_id)}::uuid AND l.ingredient_id=${literal(i.id)}::uuid AND l.is_primary AND l.is_active AND l.review_status='approved' AND l.preparation_state='as_published'
      AND p.id=${literal(i.expected_nutrition_profile_id)}::uuid AND p.profile_kind='ingredient_source' AND p.basis_amount=100 AND p.basis_unit='g' AND p.is_active AND p.review_status='approved'
      AND si.id=${literal(i.expected_source_item_id)}::uuid AND si.external_name=${literal(i.expected_external_name)} AND si.review_status='approved' AND si.preparation_state='as_published'
      AND ns.provider_code='RDA_10_4' AND ns.is_active AND ns.review_status='approved' AND ns.freshness_status='current')<>1 THEN RAISE EXCEPTION 'PEPPER_NUTRITION_CHANGED'; END IF;
  SELECT current_cutover_attempt_id INTO c FROM public.account_generation_capability_state WHERE singleton AND state='generation_active';
  IF c IS NULL THEN RAISE EXCEPTION 'WRITER_UNAVAILABLE'; END IF;
  PERFORM public.set_account_generation_internal_writer_marker(c,true);
END $pepper_preflight$;
CREATE TEMP TABLE green_pepper_protected_before ON COMMIT DROP AS ${snapshot};
`;
  for(const [table,row] of rows){
    const json=literal(JSON.stringify(row)), expected=`to_jsonb(jsonb_populate_record(NULL::public.${table},${json}::jsonb))`;
    sql+=`DO $pepper_preimage$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} r WHERE id=${literal(row.id)}::uuid AND to_jsonb(r) IS DISTINCT FROM ${expected}) THEN RAISE EXCEPTION 'PEPPER_PREIMAGE_MISMATCH'; END IF; END $pepper_preimage$;
INSERT INTO public.${table} SELECT * FROM jsonb_populate_record(NULL::public.${table},${json}::jsonb) ON CONFLICT(id) DO NOTHING;
DO $pepper_postimage$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.${table} r WHERE id=${literal(row.id)}::uuid AND to_jsonb(r)=${expected}) THEN RAISE EXCEPTION 'PEPPER_POSTIMAGE_MISMATCH'; END IF; END $pepper_postimage$;
`;
  }
  sql+=`DO $pepper_preserve$ BEGIN IF EXISTS(SELECT 1 FROM ((${snapshot}) EXCEPT SELECT * FROM green_pepper_protected_before) diff) THEN RAISE EXCEPTION 'PEPPER_PROTECTED_DATA_CHANGED'; END IF; END $pepper_preserve$;
DO $pepper_finish$ DECLARE c uuid; BEGIN SELECT current_cutover_attempt_id INTO c FROM public.account_generation_capability_state WHERE singleton; PERFORM public.set_account_generation_internal_writer_marker(c,false); END $pepper_finish$;
COMMIT;
`;
  return sql;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3)throw Error('Usage: node scripts/render-green-pepper-piece-weight.mjs <private-reviewer-file>');
  process.stdout.write(renderGreenPepperPieceWeight(readFileSync(process.argv[2],'utf8').trim()));
}
