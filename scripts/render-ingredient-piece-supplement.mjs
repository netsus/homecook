/** Render the reviewed one-row measurement supplement. Never connects to a DB. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundleUrl = new URL('../docs/engineering/data/ingredient-piece-supplement-20261009.json', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const uuid = key => {
  const h = digest(`ingredient-piece-supplement-20261009:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function renderPieceSupplement(reviewer) {
  if (!/^[a-f0-9-]{36}$/iu.test(reviewer)) throw Error('Reviewer UUID required');
  const data = JSON.parse(readFileSync(bundleUrl, 'utf8'));
  if (data.schema !== 'homecook.ingredient-piece-supplement.v1'
    || data.ingredient.id !== '17c42094-d0da-4d2e-a26a-fe553ed1070c'
    || data.ingredient.weight_g !== 18 || data.source.portion.id !== '84529'
    || data.source.portion.fdc_id !== '169251' || data.source.portion.modifier !== 'medium'
    || Number(data.source.portion.amount) !== 1 || Number(data.source.portion.gram_weight) !== 18) {
    throw Error('Reviewed portion mismatch');
  }
  const timestamp = data.reviewed_at;
  if (!Number.isFinite(Date.parse(timestamp))) throw Error('Review timestamp required');
  const shared = {review_status:'approved',is_active:true,reviewed_by:reviewer,reviewed_at:timestamp,decision_reason:data.reason};
  const source = {...shared,id:uuid('source'),provider_code:data.source.provider_code,dataset_name:data.source.dataset_name,source_kind:'measurement_reference',source_version:data.source.source_version,data_basis_date:data.source.data_basis_date,fetched_at:timestamp,freshness_checked_at:timestamp,freshness_status:'current',source_url:data.source.url,license_name:data.source.license,manifest_sha256:digest(JSON.stringify(data))};
  const evidence = {...shared,id:uuid('evidence'),source_id:source.id,evidence_kind:'piece_weight',source_subject:data.ingredient.name,preparation_state:data.ingredient.preparation_state,size_code:'medium',source_observed_unit:'개',source_observed_amount:1,observed_weight_g:18,source_url:data.source.url,source_accessed_at:data.reviewed_date,evidence_fingerprint:digest(JSON.stringify(data.source.portion)),version:1};
  const piece = {...shared,id:uuid('piece'),ingredient_id:data.ingredient.id,evidence_id:evidence.id,size_code:'medium',preparation_state:'as_published',weight_g:18,version:1};
  const rows = [['nutrition_sources',source],['measurement_source_evidence',evidence],['piece_unit_weights',piece]];
  let sql = `BEGIN; SET LOCAL ROLE postgres; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';\n`;
  sql += `DO $piece_preflight$ DECLARE c uuid; BEGIN
    PERFORM pg_advisory_xact_lock(104230921,77101);
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=${literal(reviewer)}::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'REVIEWER_UNAVAILABLE'; END IF;
    IF NOT EXISTS(SELECT 1 FROM ingredients WHERE id=${literal(piece.ingredient_id)}::uuid AND standard_name='양송이버섯') THEN RAISE EXCEPTION 'INGREDIENT_CHANGED'; END IF;
    IF EXISTS(SELECT 1 FROM piece_unit_weights WHERE ingredient_id=${literal(piece.ingredient_id)}::uuid AND is_active AND id<>${literal(piece.id)}::uuid) THEN RAISE EXCEPTION 'PIECE_ALREADY_ASSIGNED'; END IF;
    IF (SELECT count(*) FROM ingredient_nutrition_profiles l JOIN nutrition_profiles p ON p.id=l.nutrition_profile_id JOIN nutrition_source_items si ON si.id=p.source_item_id JOIN nutrition_sources ns ON ns.id=si.source_id WHERE l.ingredient_id=${literal(piece.ingredient_id)}::uuid AND l.is_active AND l.is_primary AND l.review_status='approved' AND l.preparation_state='as_published' AND si.external_name='양송이버섯, 생것' AND p.basis_unit='g' AND p.basis_amount=100 AND p.is_active AND p.review_status='approved' AND si.review_status='approved' AND ns.provider_code='RDA_10_4' AND ns.review_status='approved' AND ns.is_active AND ns.freshness_status='current')<>1 THEN RAISE EXCEPTION 'NUTRITION_IDENTITY_CHANGED'; END IF;
    IF EXISTS(SELECT 1 FROM recipe_ingredients ri JOIN recipes r ON r.id=ri.recipe_id WHERE r.deleted_at IS NULL AND ri.ingredient_id=${literal(piece.ingredient_id)}::uuid AND ri.unit IN ('장','대','모')) THEN RAISE EXCEPTION 'PIECE_UNIT_FAMILY_REVIEW_REQUIRED'; END IF;
    SELECT current_cutover_attempt_id INTO c FROM account_generation_capability_state WHERE singleton AND state='generation_active';
    IF c IS NULL THEN RAISE EXCEPTION 'WRITER_UNAVAILABLE'; END IF;
    PERFORM public.set_account_generation_internal_writer_marker(c,true);
  END $piece_preflight$;\n`;
  for (const [table,row] of rows) {
    const keys=Object.keys(row), json=literal(JSON.stringify(row));
    sql += `INSERT INTO public.${table} (${keys.join(',')}) SELECT ${keys.join(',')} FROM jsonb_populate_record(NULL::public.${table},${json}::jsonb) ON CONFLICT(id) DO NOTHING;\n`;
    sql += `DO $piece_verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.${table} r WHERE id=${literal(row.id)}::uuid AND to_jsonb(r) @> jsonb_strip_nulls(to_jsonb(jsonb_populate_record(NULL::public.${table},${json}::jsonb)))) THEN RAISE EXCEPTION 'PIECE_POSTIMAGE_MISMATCH'; END IF; END $piece_verify$;\n`;
  }
  sql += `DO $piece_finish$ DECLARE c uuid; BEGIN SELECT current_cutover_attempt_id INTO c FROM account_generation_capability_state WHERE singleton; PERFORM public.set_account_generation_internal_writer_marker(c,false); END $piece_finish$; COMMIT;\n`;
  return sql;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/render-ingredient-piece-supplement.mjs <private-reviewer-file>');
  process.stdout.write(renderPieceSupplement(readFileSync(process.argv[2], 'utf8').trim()));
}
