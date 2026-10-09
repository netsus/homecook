#!/usr/bin/env node
// Offline SQL renderer. It never connects to a database or executes the output.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
export const DEFAULT_PLAN = new URL('docs/engineering/data/ingredient-exclusion-recovery-plan-20261010.json', root);
const tables = ['ingredients', 'ingredient_catalog_entries', 'ingredient_synonyms', 'nutrition_source_items', 'nutrition_profiles', 'nutrition_values', 'ingredient_nutrition_profiles'];
const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const key = (table, row) => table === 'nutrition_values' ? { profile_id: row.profile_id, nutrient_code: row.nutrient_code } : table === 'ingredient_catalog_entries' ? { ingredient_id: row.ingredient_id } : { id: row.id };
const where = (table, row) => Object.entries(key(table, row)).map(([column, value]) => `t.${column}::text=${literal(value)}`).join(' AND ');
const actual = (table, row) => `(SELECT to_jsonb(t) FROM public.${table} t WHERE ${where(table, row)})`;
const comparable = (expression) => `(${expression} - 'search_name' - 'updated_at')`;
const assertion = (condition, code) => `IF ${condition} THEN RAISE EXCEPTION '${code}'; END IF;`;
export function validateRecoveryPlan(plan) {
  const { operation_checksum, ...payload } = plan;
  if (hash(payload) !== operation_checksum) throw Error('RECOVERY_PLAN_CHECKSUM');
  if (plan.schema !== 'homecook.ingredient-exclusion-recovery.v1') throw Error('RECOVERY_SCHEMA');
  if (plan.updates.length !== 9 || plan.deletes.length !== 6) throw Error('RECOVERY_SCOPE');
  for (const op of [...plan.inserts, ...plan.updates, ...plan.deletes]) {
    if (!tables.includes(op.table)) throw Error('RECOVERY_TABLE');
    for (const column of Object.keys(op.row ?? op.after)) if (!/^[a-z_]+$/.test(column)) throw Error('RECOVERY_COLUMN');
  }
  if (plan.updates.some((op) => !['ingredients', 'ingredient_catalog_entries'].includes(op.table)) || plan.deletes.some((op) => op.table !== 'ingredient_synonyms')) throw Error('RECOVERY_IMMUTABLE_DATA');
  for (const op of plan.updates.filter((op) => op.table === 'ingredients')) {
    const before = { ...op.before }; const after = { ...op.after };
    delete before.standard_name; delete before.search_name; delete after.standard_name;
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('RECOVERY_IDENTITY_CHANGED');
  }
  const values = plan.inserts.filter((op) => op.table === 'nutrition_values');
  if (values.length !== 16 || values.filter((op) => op.row.amount === null).length !== 3) throw Error('RECOVERY_NUTRIENT_SCOPE');
  for (const { row } of values) if ((row.amount === null) !== (row.value_status === 'missing') || (row.amount !== null && (!Number.isFinite(row.amount) || row.amount < 0))) throw Error('RECOVERY_NUTRIENT_VALUE');
  return plan;
}
export function renderRecoverySql(input, { reviewedBy } = {}) {
  validateRecoveryPlan(input);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewedBy ?? '')) throw Error('RECOVERY_REVIEWER_REQUIRED');
  const p = JSON.parse(JSON.stringify(input).replaceAll('__PRIVATE_REVIEWER__', reviewedBy));
  const allOps = [...p.updates.map((op) => ({ table: op.table, row: op.after })), ...p.inserts];
  const post = allOps.map(({ table, row }) => assertion(`${comparable(actual(table, row))} IS DISTINCT FROM ${comparable(json(row))}`, 'RECOVERY_POSTIMAGE')).concat(p.deletes.map(({ table, row }) => assertion(`EXISTS(SELECT 1 FROM public.${table} t WHERE ${where(table, row)})`, 'RECOVERY_DELETED_ALIAS_REAPPEARED'))).join('\n');
  const exclude = (table) => [...p.inserts.filter((op) => op.table === table).map((op) => op.row), ...p.updates.filter((op) => op.table === table).map((op) => op.before), ...p.deletes.filter((op) => op.table === table).map((op) => op.row)].map((row) => `(${where(table, row)})`).join(' OR ') || 'false';
  const preservationTables = ['ingredient_catalog_groups', 'recipes', 'recipe_ingredients', 'recipe_nutrition_snapshots', 'recipe_content_snapshots', 'meals', 'meal_log_entries', 'pantry_items', 'piece_unit_weights', 'measurement_source_evidence', 'ingredient_conversion_assignments'];
  const digest = (table) => `(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.${table} t WHERE NOT (${exclude(table)}))`;
  const preserve = preservationTables.map((table) => `${literal(table)},${digest(table)}`).join(',');
  const guards = Object.entries(p.expected_table_checksums).map(([table, checksum]) => {
    if (![...tables, 'nutrition_sources'].includes(table)) throw Error('RECOVERY_GUARD_TABLE');
    return assertion(`(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.${table} t) IS DISTINCT FROM ${literal(checksum)}`, 'RECOVERY_SOURCE_DRIFT');
  }).join('\n');
  // Reconstruct the exact old relation after the patch: ignore appended rows and
  // substitute reviewed preimages for the few renamed/deleted catalog rows.
  // This verifies every old row with two large scans, rather than three.
  const oldRelations = Object.entries(p.expected_table_checksums).map(([table, checksum]) => {
    const beforeRows = [...p.updates.filter((op) => op.table === table).map((op) => op.before), ...p.deletes.filter((op) => op.table === table).map((op) => op.row)];
    const restored = beforeRows.map((row) => `UNION ALL SELECT md5(${json(row)}::text)`).join(' ');
    const restoredDigest = `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.${table} t WHERE NOT (${exclude(table)}) ${restored}) original_rows)`;
    return assertion(`${restoredDigest} IS DISTINCT FROM ${literal(checksum)}`, 'RECOVERY_OLD_RELATION_CHANGED');
  }).join('\n');
  const pre = p.preconditions.map(({ table, row }) => {
    if (!['nutrition_sources', 'ingredient_catalog_groups'].includes(table)) throw Error('RECOVERY_PRECONDITION_TABLE');
    return assertion(`${actual(table, row)} IS DISTINCT FROM ${json(row)}`, 'RECOVERY_EVIDENCE_DRIFT');
  }).concat(p.updates.map(({ table, before }) => assertion(`${actual(table, before)} IS DISTINCT FROM ${json(before)}`, 'RECOVERY_ROW_DRIFT')), p.deletes.map(({ table, row }) => assertion(`${actual(table, row)} IS DISTINCT FROM ${json(row)}`, 'RECOVERY_ALIAS_DRIFT'))).join('\n');
  const insertOrder = ['ingredients', 'ingredient_catalog_entries', 'ingredient_synonyms', 'nutrition_source_items', 'nutrition_profiles', 'nutrition_values', 'ingredient_nutrition_profiles'];
  const inserts = [...p.inserts].sort((a, b) => insertOrder.indexOf(a.table) - insertOrder.indexOf(b.table)).map(({ table, row }) => { const columns = Object.keys(row).join(','); return `INSERT INTO public.${table}(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::public.${table},${json(row)});`; }).join('\n');
  const updates = p.updates.map(({ table, before, after }) => {
    const columns = Object.keys(after).filter((column) => column !== 'id' && column !== 'ingredient_id' && column !== 'created_at');
    return `UPDATE public.${table} t SET (${columns.join(',')})=(SELECT ${columns.join(',')} FROM jsonb_populate_record(NULL::public.${table},${json(after)})) WHERE ${where(table, before)};`;
  }).join('\n');
  const deletes = p.deletes.map(({ table, row }) => `DELETE FROM public.${table} t WHERE ${where(table, row)};`).join('\n');
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE postgres;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='180s';
DO $recovery$
DECLARE v_cutover uuid; v_preserved jsonb;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('homecook:ingredient-exclusion-recovery-20261010',0));
LOCK TABLE ${[...tables, 'nutrition_sources', 'ingredient_catalog_groups'].map((table) => `public.${table}`).join(',')} IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM public.operational_events WHERE event_type='ingredient_exclusion_recovery_applied' AND metadata_json->>'operation_checksum'=${literal(p.operation_checksum)}) THEN
${post}
RAISE NOTICE 'Recovery already applied; verified postimage, no writes'; RETURN;
END IF;
${guards}
${pre}
SELECT jsonb_build_object(${preserve}) INTO v_preserved;
SELECT current_cutover_attempt_id INTO v_cutover FROM public.account_generation_capability_state WHERE singleton AND state='generation_active' FOR KEY SHARE;
IF v_cutover IS NULL THEN RAISE EXCEPTION 'RECOVERY_WRITER_UNAVAILABLE'; END IF;
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,true);
${updates}
${deletes}
${inserts}
${post}
${oldRelations}
IF v_preserved IS DISTINCT FROM jsonb_build_object(${preserve}) THEN RAISE EXCEPTION 'RECOVERY_PRESERVATION_FAILED'; END IF;
INSERT INTO public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
VALUES('ingredient_exclusion_recovery_applied','info','ingredient-exclusion-recovery-20261010',${literal(p.reviewed_by)}::uuid,'Restore reviewed everyday ingredients and exact official nutrition without rewriting history',${json({ operation_checksum: p.operation_checksum, decisions: p.decisions, removed_aliases: p.deletes.map((op) => op.row) })});
PERFORM public.set_account_generation_internal_writer_marker(v_cutover,false);
PERFORM pg_notify('pgrst','reload schema');
END;
$recovery$;
COMMIT;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = JSON.parse(readFileSync(DEFAULT_PLAN, 'utf8'));
  for (const evidence of plan.evidence_files) if (hash(readFileSync(new URL(evidence.path, root), 'utf8')) !== evidence.sha256) throw Error('RECOVERY_EVIDENCE_FILE_HASH');
  const flag = process.argv.indexOf('--reviewer-file');
  if (flag < 0 || !process.argv[flag + 1]) throw Error('RECOVERY_REVIEWER_FILE_REQUIRED');
  const reviewer = JSON.parse(readFileSync(process.argv[flag + 1], 'utf8'));
  if (hash(readFileSync(plan.source_workbook.path)) !== plan.source_workbook.sha256) throw Error('RECOVERY_WORKBOOK_HASH');
  process.stdout.write(renderRecoverySql(plan, { reviewedBy: reviewer.reviewed_by ?? reviewer.patch?.reviewed_by }));
}
