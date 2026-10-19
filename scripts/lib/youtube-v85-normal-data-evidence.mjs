import { createHash } from 'node:crypto';

export const V85_DATA_SUCCESSOR = Object.freeze({
  priorSha256: 'd3979df6deca56efa906655fef86d29b1ec96e9e473f69625486e6a40594212e',
  priorCanonicalSha256: '426161623cbf6f7a1452ca48355fad45b20d7ca727ad4cc0c544076ce822a5db',
  priorNormalSha256: '17d6d3792943b8648abc4e0150d13af53835061a94aa4e0828d4d7e00fa1bbde',
  priorPreservedSha256: '6ffc2c740671e97fe0eae7e594562de0729ce765ee3cac160de58abe14b47adc',
  acceptedNormalSha256: '8cc1d4eec34783f0fdecc60c4b9a4d62d52fc02acb0f70a8958737c1b203503b',
  acceptedTablesSha256: '4e7aaeb21489b86b67edee4bb10cb8637b1420af135be522ebfe779cc7766d80',
  toolBase: '9e6c5c8163fac47816477a3733d61bda37b269b9',
  filename: 'normal-data-successor-plan-20261019.json',
  markerFilename: 'normal-data-successor-publication-20261019.json',
  account: 'approved-normal-data-successor-20261019-sha256',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = ok => { if (!ok) throw new Error('v85: exact normal-data table evidence differs'); };
export const V85_NORMAL_TABLES = Object.freeze([
  "public.ingredient_nutrition_profiles",
  "public.measurement_source_evidence",
  "public.meal_log_entries",
  "public.product_planner_entries",
  "public.recipe_ingredients",
  "public.recipes",
  "public.recipe_sources",
  "public.recipe_steps",
  "public.recipe_step_cooking_methods",
  "public.recipe_tags",
  "public.tags",
  "public.recipe_change_previews",
  "public.food_products",
  "public.food_product_nutrition_versions",
  "public.food_product_ingredient_links",
  "public.ingredients",
  "public.nutrient_definitions",
  "public.nutrition_sources",
  "public.nutrition_source_items",
  "public.nutrition_profiles",
  "public.nutrition_values",
  "public.measurement_conversion_profiles",
  "public.ingredient_conversion_assignments",
  "public.piece_unit_weights",
  "public.meals",
  "public.meal_plan_columns",
  "public.cooking_sessions",
  "public.cooking_session_meals",
  "public.cooking_session_meal_claims",
  "public.leftover_dishes",
  "public.cooked_batch_quantity_events",
  "public.recipe_content_snapshots",
  "public.recipe_nutrition_snapshots",
  "private.cooked_batch_weight_evidence",
  "public.mutation_idempotency_keys",
  "private.youtube_saved_recipe_result_mutations",
  "public.pantry_items",
  "public.shopping_lists",
  "public.shopping_list_recipes",
  "public.shopping_list_items",
  "public.shopping_meal_snapshot_clone_tokens"
]);

export function v85NormalTableProjection(tables) {
  check(Array.isArray(tables) && tables.length === 41);
  for (const [i, entry] of tables.entries()) check(entry && Object.keys(entry).join(',') === 'table,count,sha256'
    && entry.table === V85_NORMAL_TABLES[i] && Number.isSafeInteger(entry.count) && entry.count >= 0
    && /^[a-f0-9]{64}$/u.test(entry.sha256));
  // PostgreSQL jsonb text for this fixed ASCII array, including its comma spaces.
  return hash('[' + tables.map(e => `[${JSON.stringify(e.table)}, ${JSON.stringify(e.sha256)}]`).join(', ') + ']');
}
export function assertV85AcceptedNormalTables(tables) {
  check(v85NormalTableProjection(tables) === V85_DATA_SUCCESSOR.acceptedNormalSha256
    && hash(JSON.stringify(tables)) === V85_DATA_SUCCESSOR.acceptedTablesSha256);
}
export async function readV85NormalTables(query) {
  const { RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL } = await import('./prelaunch-database.mjs');
  const prefix = 'SELECT encode(sha256(convert_to((', suffix = ")::text,'UTF8')),'hex');";
  check(RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL.startsWith(prefix) && RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL.endsWith(suffix));
  const expression = RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL.slice(prefix.length, -suffix.length);
  const actualTables = [...expression.matchAll(/jsonb_build_array\('(public|private)\.([a-z_]+)',/gu)].map(m => `${m[1]}.${m[2]}`);
  check(JSON.stringify(actualTables) === JSON.stringify(V85_NORMAL_TABLES));
  const counts = V85_NORMAL_TABLES.map(table => `jsonb_build_array('${table}',(SELECT count(*) FROM ${table}))`).join(',');
  const sql = `WITH projection AS MATERIALIZED (SELECT ${expression} AS data)
SELECT jsonb_build_object('normalDataSha256',encode(sha256(convert_to(data::text,'UTF8')),'hex'),
'tables',data,'counts',jsonb_build_array(${counts})) FROM projection;`;
  const value = JSON.parse((await query(sql)).trim());
  const tables = value.tables.map(([table, sha256], i) => ({ table, count: value.counts[i]?.[1], sha256 }));
  check(value.counts.length === 41 && value.counts.every(([table], i) => table === V85_NORMAL_TABLES[i])
    && v85NormalTableProjection(tables) === value.normalDataSha256);
  return { tables, normalDataSha256: value.normalDataSha256 };
}
