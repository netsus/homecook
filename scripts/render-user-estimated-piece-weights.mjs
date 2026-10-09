/** Offline append-only SQL for the three user-approved estimated piece weights. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundleUrl = new URL('../docs/engineering/data/user-estimated-piece-weights-20261010.json', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const uuid = key => {
  const h = digest(`user-estimated-piece-weights-20261010:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const protectedTables = [
  'ingredients', 'ingredient_catalog_entries', 'ingredient_synonyms',
  'ingredient_nutrition_profiles', 'nutrition_source_items', 'nutrition_profiles', 'nutrition_values',
  'recipes', 'recipe_ingredients', 'recipe_content_snapshots', 'recipe_nutrition_snapshots',
  'meals', 'meal_log_entries', 'pantry_items', 'youtube_extraction_sessions', 'leftover_dishes',
];
export function estimatedPieceRows(reviewer, data = JSON.parse(readFileSync(bundleUrl, 'utf8'))) {
  if (!uuidPattern.test(reviewer)) throw Error('Reviewer UUID required');
  const expected = [
    ['81dd8c7e-319a-5f81-bf3e-4bd21b06d1d5', '월계수잎', '장', 0.5],
    ['78deadf1-4645-5854-9abc-39cffe996567', '깻잎', '장', 1],
    ['7588611d-b21a-46b7-8023-e9408bf84a6b', '통후추', '알', 0.067],
  ];
  if (data.schema !== 'homecook.user-estimated-piece-weights.v1'
      || data.reviewer !== '__PRIVATE_REVIEWER_UUID__'
      || data.source.provider_code !== 'HOMECOOK_USER_STANDARD'
      || !data.source.dataset_name.includes('사용자 승인 AI 추정 중량')
      || data.items.length !== 3
      || !Object.values(data.policy).every(value => value === true)
      || !Number.isFinite(Date.parse(data.reviewed_at))) throw Error('Reviewed estimate policy mismatch');
  for (const [index, item] of data.items.entries()) {
    if (JSON.stringify([item.ingredient_id, item.standard_name, item.observed_unit, item.weight_g]) !== JSON.stringify(expected[index])
        || item.observed_amount !== 1 || item.size_code !== 'medium' || item.preparation_state !== 'as_published'
        || !uuidPattern.test(item.expected_nutrition.profile_id) || !uuidPattern.test(item.expected_nutrition.source_item_id)
        || item.expected_nutrition.basis_amount !== 100 || item.expected_nutrition.basis_unit !== 'g'
        || !item.decision_reason.includes('사용자 승인 AI 추정 중량')) throw Error('Reviewed portion mismatch');
  }
  if (JSON.stringify(data.items[1].original_user_report.weight_range_g) !== '[7,10]'
      || data.items[1].original_user_report.amount !== 10 || data.items[1].original_user_report.approximate_weight_g !== 10
      || data.items[2].original_user_report.amount !== 3 || data.items[2].original_user_report.approximate_weight_g !== 0.2) {
    throw Error('Original user estimate mismatch');
  }
  const timestamp = data.reviewed_at;
  const shared = { review_status: 'approved', is_active: true, reviewed_by: reviewer, reviewed_at: timestamp, created_at: timestamp, superseded_by_id: null };
  const source = { ...shared, id: uuid('source'), ...data.source, source_kind: 'measurement_reference', fetched_at: timestamp,
    freshness_checked_at: timestamp, freshness_status: 'current', priority_rank: null, license_url: null, manifest_sha256: digest(JSON.stringify(data)) };
  const rows = [['nutrition_sources', source]];
  for (const item of data.items) {
    const evidence = { ...shared, id: uuid(`evidence:${item.ingredient_id}`), source_id: source.id, source_item_id: null,
      evidence_kind: 'piece_weight', source_subject: item.standard_name, preparation_state: item.preparation_state, size_code: item.size_code,
      source_observed_unit: item.observed_unit, source_observed_amount: 1, observed_volume_ml: null, normalized_g_per_15ml: null,
      observed_weight_g: item.weight_g, source_url: source.source_url, source_accessed_at: source.data_basis_date,
      evidence_fingerprint: digest(JSON.stringify(item)), decision_reason: item.decision_reason, version: 1 };
    const piece = { ...shared, id: uuid(`piece:${item.ingredient_id}`), ingredient_id: item.ingredient_id, evidence_id: evidence.id,
      size_code: item.size_code, preparation_state: item.preparation_state, weight_g: item.weight_g, decision_reason: item.decision_reason, version: 1 };
    rows.push(['measurement_source_evidence', evidence], ['piece_unit_weights', piece]);
  }
  return { data, rows };
}
export function renderUserEstimatedPieceWeights(reviewer) {
  const { data, rows } = estimatedPieceRows(reviewer);
  const targets = ['nutrition_sources', 'measurement_source_evidence', 'piece_unit_weights'];
  const snapshotSelect = [...protectedTables, ...targets].map(table => {
    const ids = rows.filter(([name]) => name === table).map(([, row]) => `${literal(row.id)}::uuid`);
    const filter = ids.length ? ` WHERE id NOT IN (${ids.join(',')})` : '';
    return `SELECT ${literal(table)} AS table_name, count(*) AS row_count, encode(sha256(convert_to(coalesce(string_agg(row_hash,'|' ORDER BY row_hash),''),'UTF8')),'hex') AS contents FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS row_hash FROM public.${table} r${filter}) hashed_rows`;
  }).join('\nUNION ALL\n');
  let sql = `BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE postgres; SET LOCAL standard_conforming_strings=on; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $estimated_piece_preflight$ DECLARE c uuid; BEGIN
  PERFORM pg_advisory_xact_lock(104230921,77101);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=${literal(reviewer)}::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'REVIEWER_UNAVAILABLE'; END IF;
  SELECT current_cutover_attempt_id INTO c FROM public.account_generation_capability_state WHERE singleton AND state='generation_active';
  IF c IS NULL THEN RAISE EXCEPTION 'WRITER_UNAVAILABLE'; END IF;
  PERFORM public.set_account_generation_internal_writer_marker(c,true);
END $estimated_piece_preflight$;
CREATE TEMP TABLE estimated_piece_protected_before ON COMMIT DROP AS ${snapshotSelect};
`;
  for (const item of data.items) {
    const nutrition = item.expected_nutrition;
    sql += `DO $estimated_piece_identity$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.ingredients i JOIN public.ingredient_catalog_entries ce ON ce.ingredient_id=i.id WHERE i.id=${literal(item.ingredient_id)}::uuid AND i.standard_name=${literal(item.standard_name)} AND ce.presentation='base' AND ce.review_state='reviewed') THEN RAISE EXCEPTION 'INGREDIENT_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.piece_unit_weights WHERE ingredient_id=${literal(item.ingredient_id)}::uuid AND is_active AND id<>${literal(uuid(`piece:${item.ingredient_id}`))}::uuid) THEN RAISE EXCEPTION 'PIECE_ALREADY_ASSIGNED'; END IF;
  IF (SELECT count(*) FROM public.ingredient_nutrition_profiles l JOIN public.nutrition_profiles p ON p.id=l.nutrition_profile_id JOIN public.nutrition_source_items si ON si.id=p.source_item_id JOIN public.nutrition_sources ns ON ns.id=si.source_id
    WHERE l.ingredient_id=${literal(item.ingredient_id)}::uuid AND l.is_active AND l.is_primary AND l.review_status='approved' AND l.preparation_state='as_published'
    AND p.id=${literal(nutrition.profile_id)}::uuid AND p.profile_kind='ingredient_source' AND p.basis_unit='g' AND p.basis_amount=100 AND p.is_active AND p.review_status='approved'
    AND si.id=${literal(nutrition.source_item_id)}::uuid AND si.external_name=${literal(nutrition.external_name)} AND si.review_status='approved'
    AND ns.provider_code=${literal(nutrition.provider_code)} AND ns.source_kind='nutrition_dataset' AND ns.review_status='approved' AND ns.is_active AND ns.freshness_status='current')<>1 THEN RAISE EXCEPTION 'NUTRITION_IDENTITY_CHANGED'; END IF;
END $estimated_piece_identity$;
`;
  }
  for (const [table, row] of rows) {
    const json = literal(JSON.stringify(row));
    const expected = `to_jsonb(jsonb_populate_record(NULL::public.${table},${json}::jsonb))`;
    sql += `DO $estimated_piece_preimage$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} r WHERE id=${literal(row.id)}::uuid AND to_jsonb(r) IS DISTINCT FROM ${expected}) THEN RAISE EXCEPTION 'ESTIMATE_PREIMAGE_MISMATCH'; END IF; END $estimated_piece_preimage$;
INSERT INTO public.${table} SELECT * FROM jsonb_populate_record(NULL::public.${table},${json}::jsonb) ON CONFLICT(id) DO NOTHING;
DO $estimated_piece_postimage$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.${table} r WHERE id=${literal(row.id)}::uuid AND to_jsonb(r)=${expected}) THEN RAISE EXCEPTION 'ESTIMATE_POSTIMAGE_MISMATCH'; END IF; END $estimated_piece_postimage$;
`;
  }
  sql += `DO $estimated_piece_preservation$ BEGIN
IF EXISTS(SELECT 1 FROM ((${snapshotSelect}) EXCEPT SELECT * FROM estimated_piece_protected_before) difference) THEN RAISE EXCEPTION 'PROTECTED_DATA_CHANGED'; END IF;
END $estimated_piece_preservation$;
DO $estimated_piece_finish$ DECLARE c uuid; BEGIN SELECT current_cutover_attempt_id INTO c FROM public.account_generation_capability_state WHERE singleton; PERFORM public.set_account_generation_internal_writer_marker(c,false); END $estimated_piece_finish$;
COMMIT;
`;
  return sql;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/render-user-estimated-piece-weights.mjs <private-reviewer-file>');
  process.stdout.write(renderUserEstimatedPieceWeights(readFileSync(process.argv[2], 'utf8').trim()));
}
