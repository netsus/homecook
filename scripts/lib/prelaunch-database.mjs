import { assertV85Successor } from "./youtube-v85-cutover.mjs";
import { assertV74WorkerSuccessor, V74_ACTIVATION_SHA256 } from "./prelaunch-youtube-v74-cutover.mjs";
import { createHash } from "node:crypto";
import { fingerprintWorkerSuccessor, assertFingerprintCurrentPolicy } from "./youtube-fingerprint-recovery-authority.mjs";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPinnedLocalDockerTarget } from "./local-supabase-isolated-runtime.mjs";
import { parseFullLocalProductionConfig, selectFullLocalProductionResources } from "./full-local-production-resources.mjs";
import { createRecordingDockerAdapter, durableJson } from "./marketing-round2-controlled-deploy.mjs";
import { assertProtectedWriterReview, assertProtectedRolloutReview, assertCookedWeightProductOff, readClosedR2PrivateBytes, COOKED_WEIGHT_FEATURE, COOKED_WEIGHT_MIGRATION, protectedImmutableSha256,
  QUANTITY_V4_FEATURE, QUANTITY_V4_MIGRATIONS, QUANTITY_V4_PROTECTION, QUANTITY_V4_WORKER_CATALOG_AFTER, assertQuantityV4WorkerCheckpoint, assertQuantityV4WorkerPublicationPair, assertQuantityV4ActiveWorkerContinuation, COOKED_WEIGHT_ATTESTATION_FEATURE, COOKED_WEIGHT_ATTESTATION_MIGRATION, COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256,
  assertCookedWeightAttestationReview, assertCookedWeightAttestationPredecessor, loadCookedWeightAttestationSuccessor, cookedWeightAttestationSuccessorBinding,
  RECIPE_REQUEST_ROLE_FEATURE, RECIPE_REQUEST_ROLE_MIGRATION, RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256, RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN, assertRecipeRequestRoleReview,
  RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER, RECIPE_SAVE_RECOVERY_MIGRATIONS, RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256, RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN, assertRecipeSaveRecoveryReview, loadCurrentDatabaseMaintenance,
  NUTRITION_VALIDATOR_FEATURE, NUTRITION_VALIDATOR_MIGRATION, NUTRITION_VALIDATOR_MIGRATION_SHA256, NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN,
  assertNutritionValidatorReview, nutritionValidatorMaintenanceBinding, assertProtectedWriterDatabaseBoundary } from "./prelaunch-web-deploy.mjs";
import { loadQuantityV4DatabaseReceipt, loadQuantityV4ReaderWriterReceipts } from "./prelaunch-web-deploy.mjs";

const FILE = /^([0-9]{14})_[A-Za-z0-9_-]+\.sql$/u;
const SHA = /^[a-f0-9]{64}$/u;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => `'${String(value).replace(/'/gu, "''")}'`;
const records = (rows) => rows.map(({ filename, sha256 }) => ({ filename, sha256 }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const catalogFunctions = predicate => `(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p') AND ${predicate})`;
const catalogRelations = predicate => `(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind,c.reloptions,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum),'[]'::jsonb) FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)),'[]'::jsonb) FROM pg_index i WHERE i.indrelid=c.oid),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(pol.polname,pol.polcmd,pol.polpermissive,(SELECT array_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END) FROM unnest(pol.polroles) role_id),pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid)) ORDER BY pol.polname),'[]'::jsonb) FROM pg_policy pol WHERE pol.polrelid=c.oid),
 CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND ${predicate})`;
const catalogDigest = expression => `SELECT encode(sha256(convert_to((${expression})::text,'UTF8')),'hex');`;
const catalogRoles = `jsonb_build_array((SELECT coalesce(jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil) ORDER BY rolname),'[]'::jsonb) FROM pg_roles),(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)),'[]'::jsonb) FROM pg_auth_members))`;
// Fixed semantic catalog queries. A review never supplies a query, identifier or runtime postimage.
export const PROTECTED_CATALOG_SQL = catalogDigest(`jsonb_build_array(${catalogFunctions("n.nspname IN ('public','private','auth')")},${catalogRelations("n.nspname IN ('public','private','auth','homecook_deploy','marketing_round2_deploy')")},(SELECT coalesce(jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl) ORDER BY nspname),'[]'::jsonb) FROM pg_namespace WHERE nspname IN ('public','private','auth','homecook_deploy','marketing_round2_deploy')),${catalogRoles})`);
export const PROTECTED_IMMUTABLE_CATALOG_SQL = catalogDigest(`jsonb_build_array(${catalogFunctions("n.nspname='private' AND (p.proname LIKE 'marketing_round2_%' OR p.proname LIKE 'verify_full_local_internal_scope%' OR p.proname LIKE '%bootstrap%' OR p.proname LIKE 'verify_full_local_youtube%') OR n.nspname='public' AND (p.proname LIKE 'marketing_round2_%' OR p.proname LIKE 'youtube_%')")},${catalogRelations("n.nspname='auth' OR n.nspname='marketing_round2_deploy' OR n.nspname='public' AND (c.relname LIKE 'marketing_%' OR c.relname LIKE 'youtube_%')")},${catalogRoles})`);
// Keep the whole query above. Only this one C01-authorized outer is removed from the additional unchanged-remainder query.
export const COOKED_WEIGHT_STABLE_IMMUTABLE_SQL = PROTECTED_IMMUTABLE_CATALOG_SQL.replace(
  "OR p.proname LIKE 'verify_full_local_youtube%') OR n.nspname='public'",
  "OR p.proname LIKE 'verify_full_local_youtube%') AND NOT (p.proname='verify_full_local_internal_scope' AND p.pronargs=0) OR n.nspname='public'",
);
const cookedWeightScopeDigest = name => `(SELECT encode(sha256(convert_to(jsonb_build_array(replace(pg_get_functiondef(p.oid),'CREATE OR REPLACE FUNCTION private.verify_scope_pre_cooked_weight_evidence_20261013()','CREATE OR REPLACE FUNCTION private.verify_full_local_internal_scope()'),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text,'UTF8')),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure('private.${name}()') AND p.prokind='f')`;
export const COOKED_WEIGHT_SCOPE_SQL = `SELECT jsonb_build_object('outerSha256',${cookedWeightScopeDigest("verify_full_local_internal_scope")},'aliasSha256',${cookedWeightScopeDigest("verify_scope_pre_cooked_weight_evidence_20261013")});`;
const attestationScopeDigest = name => `(SELECT encode(sha256(convert_to(jsonb_build_array(replace(pg_get_functiondef(p.oid),'CREATE OR REPLACE FUNCTION private.verify_scope_pre_weight_attestation_20261014()','CREATE OR REPLACE FUNCTION private.verify_full_local_internal_scope()'),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text,'UTF8')),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure('private.${name}()') AND p.prokind='f')`;
export const COOKED_WEIGHT_ATTESTATION_SCOPE_SQL = `SELECT jsonb_build_object('outerSha256',${attestationScopeDigest("verify_full_local_internal_scope")},'aliasSha256',${attestationScopeDigest("verify_scope_pre_weight_attestation_20261014")});`;
const PROTECTED_DATA_TABLES = ["auth.users", "auth.identities", "public.marketing_validation_sessions", "public.marketing_validation_events", "public.marketing_round2_participations", "public.marketing_round2_events", "public.marketing_round2_lead_requests", "public.youtube_extraction_jobs", "public.youtube_saved_recipe_results", "public.youtube_extractor_permits"];
const PROTECTED_LEDGER_SQL = "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;";
const PROTECTED_WRITER_SQL = "SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.recipe_product_only_write_control;";
const COOKED_WEIGHT_WRITER_SQL = "SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.cooked_batch_weight_evidence_control;";
const QUANTITY_V4_WRITER_SQL = "SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.quantity_input_v4_policy;";
// Source-derived proposal. Exact live metadata and the root protection PIN remain required.
// These five tables alone gain a nullable column; every old column remains in the projection.
export const QUANTITY_V4_NORMAL_COLUMNS = Object.freeze([
  Object.freeze({ table: "public.ingredient_nutrition_profiles", added: "quantity_v4_metadata", columns: "id,ingredient_id,nutrition_profile_id,preparation_state,match_method,confidence_score,candidate_rank,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,superseded_by_id,created_at" }),
  Object.freeze({ table: "public.measurement_source_evidence", added: "quantity_v4_metadata", columns: "id,source_id,source_item_id,evidence_kind,source_subject,preparation_state,size_code,source_observed_unit,source_observed_amount,observed_volume_ml,observed_weight_g,normalized_g_per_15ml,source_url,source_accessed_at,evidence_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active,superseded_by_id,created_at" }),
  Object.freeze({ table: "public.meal_log_entries", added: "quantity_input", columns: "id,owner_user_id,account_generation,revision,consumed_at,consumed_local_date,timezone_name_snapshot,meal_plan_column_id,slot_name_snapshot,source_type,cooked_batch_id,food_product_id,food_product_nutrition_version_id,ingredient_id,ingredient_nutrition_profile_id,conversion_evidence_id,actual_amount,actual_unit,display_name_snapshot,display_brand_snapshot,nutrition_evidence_json,active_consumption_event_id,deleted_at,created_at,updated_at" }),
  Object.freeze({ table: "public.product_planner_entries", added: "quantity_input", columns: "id,user_id,plan_date,column_id,product_id,product_nutrition_version_id,quantity_amount,quantity_unit,product_name_snapshot,product_brand_snapshot,created_at,updated_at" }),
  Object.freeze({ table: "public.recipe_ingredients", added: "quantity_input", columns: "id,recipe_id,ingredient_id,amount,unit,ingredient_type,display_text,sort_order,scalable,component_label,food_product_id,food_product_nutrition_version_id,source_kind" }),
]);
// Root checked all five predecessor column sets read-only; post metadata is the fixed SQL projection.
export const QUANTITY_V4_COLUMN_METADATA = Object.freeze([
  Object.freeze(["public.ingredient_nutrition_profiles",[["id","uuid",true,"gen_random_uuid()"],["ingredient_id","uuid",true,null],["nutrition_profile_id","uuid",true,null],["preparation_state","text",true,null],["match_method","character varying(30)",true,null],["confidence_score","numeric(5,4)",false,null],["candidate_rank","integer",false,null],["is_primary","boolean",true,"false"],["review_status","character varying(20)",true,null],["decision_reason","text",false,null],["reviewed_by","uuid",false,null],["reviewed_at","timestamp with time zone",false,null],["version","integer",true,null],["is_active","boolean",true,"false"],["superseded_by_id","uuid",false,null],["created_at","timestamp with time zone",true,"now()"]]]),
  Object.freeze(["public.meal_log_entries",[["id","uuid",true,null],["owner_user_id","uuid",true,null],["account_generation","bigint",true,null],["revision","bigint",true,"1"],["consumed_at","timestamp with time zone",false,null],["consumed_local_date","date",true,null],["timezone_name_snapshot","text",true,null],["meal_plan_column_id","uuid",false,null],["slot_name_snapshot","text",true,null],["source_type","text",true,null],["cooked_batch_id","uuid",false,null],["food_product_id","uuid",false,null],["food_product_nutrition_version_id","uuid",false,null],["ingredient_id","uuid",false,null],["ingredient_nutrition_profile_id","uuid",false,null],["conversion_evidence_id","uuid",false,null],["actual_amount","numeric",true,null],["actual_unit","text",true,null],["display_name_snapshot","text",true,null],["display_brand_snapshot","text",false,null],["nutrition_evidence_json","jsonb",true,null],["active_consumption_event_id","uuid",false,null],["deleted_at","timestamp with time zone",false,null],["created_at","timestamp with time zone",true,"clock_timestamp()"],["updated_at","timestamp with time zone",true,"clock_timestamp()"]]]),
  Object.freeze(["public.measurement_source_evidence",[["id","uuid",true,"gen_random_uuid()"],["source_id","uuid",true,null],["source_item_id","uuid",false,null],["evidence_kind","character varying(20)",true,null],["source_subject","text",true,null],["preparation_state","text",true,null],["size_code","character varying(20)",false,null],["source_observed_unit","text",true,null],["source_observed_amount","numeric(12,4)",true,null],["observed_volume_ml","numeric(12,4)",false,null],["observed_weight_g","numeric(12,4)",true,null],["normalized_g_per_15ml","numeric(12,4)",false,null],["source_url","text",true,null],["source_accessed_at","date",true,null],["evidence_fingerprint","text",true,null],["review_status","character varying(20)",true,null],["decision_reason","text",false,null],["reviewed_by","uuid",false,null],["reviewed_at","timestamp with time zone",false,null],["version","integer",true,null],["is_active","boolean",true,"false"],["superseded_by_id","uuid",false,null],["created_at","timestamp with time zone",true,"now()"]]]),
  Object.freeze(["public.product_planner_entries",[["id","uuid",true,"gen_random_uuid()"],["user_id","uuid",true,null],["plan_date","date",true,null],["column_id","uuid",true,null],["product_id","uuid",true,null],["product_nutrition_version_id","uuid",true,null],["quantity_amount","numeric(12,4)",true,null],["quantity_unit","character varying(20)",true,null],["product_name_snapshot","character varying(200)",true,null],["product_brand_snapshot","character varying(200)",false,null],["created_at","timestamp with time zone",true,"now()"],["updated_at","timestamp with time zone",true,"now()"]]]),
  Object.freeze(["public.recipe_ingredients",[["id","uuid",true,"gen_random_uuid()"],["recipe_id","uuid",true,null],["ingredient_id","uuid",false,null],["amount","numeric",false,null],["unit","character varying(20)",false,null],["ingredient_type","recipe_ingredient_type",true,null],["display_text","character varying(200)",false,null],["sort_order","integer",true,"0"],["scalable","boolean",true,"true"],["component_label","text",false,null],["food_product_id","uuid",false,null],["food_product_nutrition_version_id","uuid",false,null],["source_kind","text",false,null]]]),
]);
export const QUANTITY_V4_COLUMNS_BEFORE_SHA256 = digest(JSON.stringify(QUANTITY_V4_COLUMN_METADATA));
export const QUANTITY_V4_COLUMNS_AFTER_SHA256 = digest(JSON.stringify(QUANTITY_V4_COLUMN_METADATA.map(([table, columns]) =>
  [table, [...columns.map(column => table === 'public.product_planner_entries' && column[0] === 'quantity_amount'
    ? [column[0], 'numeric', column[2], column[3]] : column),
    [QUANTITY_V4_NORMAL_COLUMNS.find(row => row.table === table).added, 'jsonb', false, null]]])));

export function quantityV4ColumnFingerprint(metadata) {
  return digest(JSON.stringify([...metadata].sort((a,b) => a.table.localeCompare(b.table))
    .map(row => [row.table, row.columns.map(column => [column.name, column.type, column.not_null, column.default])])));
}
const QUANTITY_V4_WHOLE_DATA_TABLES = Object.freeze([
  "public.recipes", "public.recipe_sources", "public.recipe_steps", "public.recipe_step_cooking_methods", "public.recipe_tags", "public.tags", "public.recipe_change_previews",
  "public.food_products", "public.food_product_nutrition_versions", "public.food_product_ingredient_links", "public.ingredients", "public.nutrient_definitions", "public.nutrition_sources", "public.nutrition_source_items", "public.nutrition_profiles", "public.nutrition_values", "public.measurement_conversion_profiles", "public.ingredient_conversion_assignments", "public.piece_unit_weights",
  "public.meals", "public.meal_plan_columns", "public.cooking_sessions", "public.cooking_session_meals", "public.cooking_session_meal_claims", "public.leftover_dishes", "public.cooked_batch_quantity_events", "public.recipe_content_snapshots", "public.recipe_nutrition_snapshots", "private.cooked_batch_weight_evidence", "public.mutation_idempotency_keys", "private.youtube_saved_recipe_result_mutations",
  "public.pantry_items", "public.shopping_lists", "public.shopping_list_recipes", "public.shopping_list_items", "public.shopping_meal_snapshot_clone_tokens",
]);
// Hash the same canonical rows before sorting, retaining every duplicate. A chunk
// aggregates at most 16384 fixed 32-byte hashes, rather than the table's full JSON.
const quantityRowDigest = source => `(WITH row_hashes AS MATERIALIZED (
 SELECT sha256(convert_to(to_jsonb(t)::text,'UTF8')) AS row_hash FROM ${source} t
), numbered AS (
 SELECT row_hash,row_number() OVER (ORDER BY row_hash) AS row_number FROM row_hashes
), chunks AS (
 SELECT (row_number-1)/16384 AS chunk_index,count(*) AS row_count,
 encode(sha256(string_agg(row_hash,''::bytea ORDER BY row_number)),'hex') AS chunk_sha256
 FROM numbered GROUP BY (row_number-1)/16384
)
SELECT encode(sha256(convert_to(jsonb_build_array('quantity-v4-row-sha256-chunks-v1',
 coalesce(sum(row_count),0)::bigint,coalesce(jsonb_agg(jsonb_build_array(chunk_index,row_count,chunk_sha256)
 ORDER BY chunk_index),'[]'::jsonb))::text,'UTF8')),'hex') FROM chunks)`;
export const QUANTITY_V4_NORMAL_DATA_SQL = catalogDigest(`jsonb_build_array(${[
  ...QUANTITY_V4_NORMAL_COLUMNS.map(row => `jsonb_build_array(${literal(row.table)},${quantityRowDigest(`(SELECT ${row.columns} FROM ${row.table})`)})`),
  ...QUANTITY_V4_WHOLE_DATA_TABLES.map(table => `jsonb_build_array(${literal(table)},${quantityRowDigest(table)})`),
].join(",")})`);
// Only this exact successor excludes its one new nullable HTTP fingerprint from historical row preservation.
export const RECIPE_SAVE_RECEIPT_COLUMNS = Object.freeze(["id", "owner_uuid", "account_generation", "operation_scope", "key_hash", "payload_hash", "state", "terminal_result", "durable_result", "result_reference", "attempt_token", "attempts", "lease_expires_at", "reserved_byte_size", "quota_reserved_at", "quota_released_at", "created_at", "updated_at"]);
export const RECIPE_SAVE_NORMAL_DATA_SQL = catalogDigest(`jsonb_build_array(${[
  ...QUANTITY_V4_NORMAL_COLUMNS.map(row => `jsonb_build_array(${literal(row.table)},${quantityRowDigest(`(SELECT ${row.columns} FROM ${row.table})`)})`),
  ...QUANTITY_V4_WHOLE_DATA_TABLES.map(table => `jsonb_build_array(${literal(table)},${quantityRowDigest(table === "public.mutation_idempotency_keys"
    ? `(SELECT ${RECIPE_SAVE_RECEIPT_COLUMNS.join(",")} FROM public.mutation_idempotency_keys)` : table)})`),
].join(",")})`);
// Metadata-only232 changes no row shape: preserve every current column, including receipt19 and raw quantities.
export const RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL = catalogDigest(`jsonb_build_array(${[
  ...QUANTITY_V4_NORMAL_COLUMNS.map(row => `jsonb_build_array(${literal(row.table)},${quantityRowDigest(row.table)})`),
  ...QUANTITY_V4_WHOLE_DATA_TABLES.map(table => `jsonb_build_array(${literal(table)},${quantityRowDigest(table)})`),
].join(",")})`);
export const RECIPE_SAVE_RECEIPT_METADATA_SQL = `SELECT encode(sha256(convert_to(jsonb_build_array(
 (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.mutation_idempotency_keys'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 (SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) ORDER BY conname)
  FROM pg_constraint WHERE conrelid='public.mutation_idempotency_keys'::regclass))::text,'UTF8')),'hex');`;
export const RECIPE_SAVE_RECEIPT_NULL_SQL = "SELECT NOT EXISTS(SELECT 1 FROM public.mutation_idempotency_keys WHERE recipe_future_http_request_fingerprint IS NOT NULL);";
export const QUANTITY_V4_COLUMNS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'columns',columns) ORDER BY n.nspname,c.relname),'[]'::jsonb)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) columns
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) metadata
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('ingredient_nutrition_profiles','measurement_source_evidence','meal_log_entries','product_planner_entries','recipe_ingredients');`;

export function assertQuantityV4Columns(metadata, ledgerCount) {
  if (!Array.isArray(metadata) || metadata.length !== 5 || ![221, 226, 227].includes(ledgerCount)
    || new Set(metadata.map(row => row.table)).size !== 5) throw new Error("C04 fixed five-table metadata/ledger differs");
  return assertQuantityV4ColumnSet(metadata, ledgerCount !== 221);
}

function assertQuantityV4ColumnSet(metadata, present) {
  for (const spec of QUANTITY_V4_NORMAL_COLUMNS) {
    const row = metadata.find(item => item.table === spec.table);
    const names = present ? [...spec.columns.split(","), spec.added] : spec.columns.split(",");
    if (!row || !Array.isArray(row.columns) || !same(row.columns.map(column => column.name).sort(), names.sort())) throw new Error("C04 complete original column list differs; unknown columns must not be excluded");
    if (present) {
      const added = row.columns.find(column => column.name === spec.added);
      if (added.type !== "jsonb" || added.not_null !== false || added.default !== null) throw new Error("C04 added column type/nullability/default differs");
    }
  }
  const expected = present ? QUANTITY_V4_COLUMNS_AFTER_SHA256 : QUANTITY_V4_COLUMNS_BEFORE_SHA256;
  if (quantityV4ColumnFingerprint(metadata) !== expected) throw new Error('C04 complete column type/default/nullability fingerprint differs');
  return metadata;
}
function assertAttestationColumns(metadata, ledgerCount, review, databaseMaintenance) {
  const maintenance = [NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature) ? review : databaseMaintenance?.review;
  if (maintenance) assertProtectedRolloutReview(maintenance); else assertCookedWeightAttestationReview(review);
  if (!(maintenance?.feature === RECIPE_REQUEST_ROLE_FEATURE ? [231,232] : maintenance?.feature === RECIPE_SAVE_RECOVERY_FEATURE ? [229,231] : maintenance ? [228,229] : [227,228]).includes(ledgerCount) || !Array.isArray(metadata) || metadata.length !== 5
    || new Set(metadata.map(row => row.table)).size !== 5) throw new Error("Personal attestation exact current columns/ledger differs");
  return assertQuantityV4ColumnSet(metadata, true);
}

export function assertQuantityV4ProtectionPrepared(review) {
  if (typeof QUANTITY_V4_NORMAL_DATA_SQL !== "string" || !QUANTITY_V4_NORMAL_DATA_SQL.trim()
    || !SHA.test(QUANTITY_V4_PROTECTION?.normalProjectionSha256 ?? "") || !SHA.test(QUANTITY_V4_PROTECTION?.postimageRegistrySha256 ?? "")
    || digest(QUANTITY_V4_NORMAL_DATA_SQL) !== QUANTITY_V4_PROTECTION.normalProjectionSha256
    || review.database.normalProjectionSha256 !== (review.feature === RECIPE_REQUEST_ROLE_FEATURE ? digest(RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL) : review.feature === RECIPE_SAVE_RECOVERY_FEATURE ? digest(RECIPE_SAVE_NORMAL_DATA_SQL) : QUANTITY_V4_PROTECTION.normalProjectionSha256)
    || review.database.postimageRegistrySha256 !== QUANTITY_V4_PROTECTION.postimageRegistrySha256) {
    throw new Error("C04 fixed normal-data projection/postimage registry is unbound; no target/config I/O permitted");
  }
}
export const QUANTITY_V4_WORKER_STATE_SQL = `WITH prior AS MATERIALIZED (SELECT coalesce(current_setting('request.jwt.claims',true),'') value),
 claims AS MATERIALIZED (SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true) FROM prior),
 readiness AS MATERIALIZED (SELECT public.read_youtube_extraction_enqueue_readiness() value FROM claims),
 restored AS MATERIALIZED (SELECT set_config('request.jwt.claims',prior.value,true),readiness.value FROM prior,readiness)
 SELECT jsonb_build_object('catalogFingerprint',(SELECT value->>'catalog_fingerprint' FROM restored),
 'queued',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued'),
 'processing',(SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='processing'),
 'permitHeld',EXISTS(SELECT 1 FROM public.youtube_extractor_permits WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp()),
 'activeEnqueueSessions',(SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state<>'idle' AND query ~ 'enqueue_youtube_extraction_job'),
 'credentialGeneration',(SELECT current_generation FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
 'workerReleaseSha',(SELECT release_sha FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
 'schemaIdentity',(SELECT schema_identity FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
 'snapshotDigest',(SELECT allowed_snapshot_digest FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
 'credentialActive',(SELECT expires_at>clock_timestamp() FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'),
 'workerPolicyEnabled',(SELECT enabled FROM private.youtube_extraction_current_policy WHERE policy_key='primary'),
 'credentialRowSha256',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM private.youtube_extraction_worker_credentials t WHERE credential_name='primary'),
 'policyRowSha256',(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy t WHERE policy_key='primary'),
 'policyStableSha256',(SELECT encode(sha256(convert_to((to_jsonb(policy)-'enabled'-'updated_at')::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy policy WHERE policy_key='primary'));`;

export const NUTRITION_VALIDATOR_CONTROLS_SQL = `SELECT encode(sha256(convert_to(jsonb_build_array(
 (SELECT to_jsonb(t) FROM private.recipe_product_only_write_control t),
 (SELECT to_jsonb(t) FROM private.cooked_batch_weight_evidence_control t),
 (SELECT to_jsonb(t) FROM private.quantity_input_v4_policy t),
 (SELECT to_jsonb(t) FROM private.cooked_weight_user_attestation_control t))::text,'UTF8')),'hex');`;
export const NUTRITION_VALIDATOR_FUNCTION_SQL = `SELECT jsonb_build_object(
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'sourceMd5',md5(btrim(p.prosrc,chr(10))),
 'metadataSha256',encode(sha256(convert_to(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict,pg_get_function_result(p.oid),pg_get_function_identity_arguments(p.oid),(SELECT lanname FROM pg_language WHERE oid=p.prolang))::text,'UTF8')),'hex'))
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.validate_recipe_nutrition_snapshot_payload(jsonb)');`;

export const RECIPE_SAVE_FUNCTION_SIGNATURES = RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER;
export const RECIPE_SAVE_FUNCTIONS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('signature',s.signature,
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'sourceMd5',md5(btrim(p.prosrc,chr(10))),
 'metadataSha256',encode(sha256(convert_to(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict,pg_get_function_result(p.oid),pg_get_function_identity_arguments(p.oid),(SELECT lanname FROM pg_language WHERE oid=p.prolang))::text,'UTF8')),'hex')) ORDER BY s.signature COLLATE "C"),'[]'::jsonb)
 FROM unnest(ARRAY[${RECIPE_SAVE_FUNCTION_SIGNATURES.map(literal).join(",")}]) s(signature) JOIN pg_proc p ON p.oid=to_regprocedure(s.signature);`;

export function createProtectedPrelaunchAdapter(base, feature = "recipe-product-source", review = /** @type {Record<string, any> | undefined} */ (undefined), databaseMaintenance = /** @type {ReturnType<typeof loadNutritionValidatorMaintenance> | undefined} */ (undefined)) {
  if (!["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature)) throw new Error("Unknown protected adapter feature");
  if ([QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature)) assertQuantityV4ProtectionPrepared(review);
  const observationReview = databaseMaintenance?.review ?? review;
  if (databaseMaintenance) assertQuantityV4ProtectionPrepared(observationReview);
  const requestRole = feature === RECIPE_REQUEST_ROLE_FEATURE || databaseMaintenance?.review.feature === RECIPE_REQUEST_ROLE_FEATURE;
  const recipeSave = requestRole || feature === RECIPE_SAVE_RECOVERY_FEATURE || databaseMaintenance?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE;
  const normalProjection = requestRole ? RECIPE_REQUEST_ROLE_NORMAL_DATA_SQL : recipeSave ? RECIPE_SAVE_NORMAL_DATA_SQL : QUANTITY_V4_NORMAL_DATA_SQL;
  return {
    ...base,
    async observe(sessionQuery, applicationName) {
      const target = await base.inspect();
      const query = sessionQuery ?? (sql => base.query(sql));
      const immutable = { catalog: (await query(PROTECTED_IMMUTABLE_CATALOG_SQL)).trim(), rows: [] };
      for (const table of PROTECTED_DATA_TABLES) {
        const exists = (await query(`SELECT to_regclass(${literal(table)}) IS NOT NULL;`)).trim() === "t";
        immutable.rows.push([table, exists ? (await query(`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM ${table} t;`)).trim() : "absent"]);
      }
      const controlExists = (await query("SELECT to_regclass('private.recipe_product_only_write_control') IS NOT NULL;")).trim() === "t";
      const control = controlExists ? (await query(PROTECTED_WRITER_SQL)).trim() : "false";
      if (!["true", "false"].includes(control)) throw new Error("Protected writer control singleton differs");
      // Inside the owned session exclude only itself. Reconcile excludes no session.
      const active = (await query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${literal(applicationName)}${sessionQuery ? " AND pid<>pg_backend_pid()" : ""});`)).trim() === "t";
      const result = { target, ledger: JSON.parse((await query(PROTECTED_LEDGER_SQL)).trim()), catalogSha256: (await query(PROTECTED_CATALOG_SQL)).trim(),
        immutableSha256: immutable.catalog, preservedRowsSha256: digest(JSON.stringify(immutable.rows)), writerEnabled: control === "true", active };
      if ([COOKED_WEIGHT_ATTESTATION_FEATURE,NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE,RECIPE_REQUEST_ROLE_FEATURE].includes(feature)) {
        result.fingerprintPolicy = JSON.parse((await query("SELECT to_jsonb(p) FROM private.youtube_extraction_current_policy p WHERE policy_key='primary';")).trim());
      }
      if (feature === COOKED_WEIGHT_FEATURE) {
        const exists = (await query("SELECT to_regclass('private.cooked_batch_weight_evidence_control') IS NOT NULL;")).trim() === "t";
        const weightControl = exists ? (await query(COOKED_WEIGHT_WRITER_SQL)).trim() : "false";
        if (!["true", "false"].includes(weightControl)) throw new Error("C01 control singleton differs");
        Object.assign(result, { productWriterEnabled: result.writerEnabled, writerEnabled: weightControl === "true",
          stableImmutableSha256: (await query(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)).trim(), scope: JSON.parse((await query(COOKED_WEIGHT_SCOPE_SQL)).trim()) });
      }
      if ([QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature)) {
        const exists = (await query("SELECT to_regclass('private.quantity_input_v4_policy') IS NOT NULL;")).trim() === "t";
        const quantity = exists ? (await query(QUANTITY_V4_WRITER_SQL)).trim() : "false";
        const weight = (await query(COOKED_WEIGHT_WRITER_SQL)).trim();
        if (!["true", "false"].includes(quantity) || !["true", "false"].includes(weight)) throw new Error("C04/C01 control singleton differs");
        let normalData;
        if (sessionQuery) normalData = await sessionQuery(normalProjection);
        else {
          if (typeof base.session !== "function") throw new Error("C04 normal-data read session required");
          const session = base.session("protected-c04-normal-data");
          try {
            await session.query("BEGIN READ ONLY; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';", 5000);
            normalData = await session.query(normalProjection, 33000);
            await session.query("COMMIT;", 5000);
            await session.close();
          } finally { session.stop(); }
        }
        const normalDataSha256 = normalData.trim();
        if (!SHA.test(normalDataSha256)) throw new Error("C04 normal historical-column projection invalid");
        const metadata = JSON.parse((await query(QUANTITY_V4_COLUMNS_SQL)).trim());
        const columns = [COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature)
          ? assertAttestationColumns(metadata, result.ledger.length, observationReview, databaseMaintenance) : assertQuantityV4Columns(metadata, result.ledger.length);
        let metadataNull = true;
        if (result.ledger.length !== 221) for (const spec of QUANTITY_V4_NORMAL_COLUMNS) {
          metadataNull = (await query(`SELECT NOT EXISTS(SELECT 1 FROM ${spec.table} WHERE ${spec.added} IS NOT NULL);`)).trim() === "t" && metadataNull;
        }
        const ledgerCutoff = requestRole ? RECIPE_SAVE_RECOVERY_MIGRATIONS[1].filename : recipeSave ? NUTRITION_VALIDATOR_MIGRATION : feature === NUTRITION_VALIDATOR_FEATURE || databaseMaintenance ? COOKED_WEIGHT_ATTESTATION_MIGRATION
          : review.quantityStage === "consumers" ? COOKED_WEIGHT_MIGRATION : QUANTITY_V4_MIGRATIONS[4].filename;
        const ledgerPreservedRowsSha256 = (await query(`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY filename),'[]'::jsonb)::text,'UTF8')),'hex') FROM homecook_deploy.migrations t WHERE filename<=${literal(ledgerCutoff)};`)).trim();
        if (!SHA.test(ledgerPreservedRowsSha256)) throw new Error("C04 original deployment ledger rows invalid");
        const ledgerAuthority = (await query("SELECT pg_get_userbyid(c.relowner)='supabase_admin' AND has_table_privilege('postgres',c.oid,'SELECT') AND NOT has_table_privilege('postgres',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') FROM pg_class c WHERE c.oid='homecook_deploy.migrations'::regclass;")).trim() === "t";
        Object.assign(result, { productWriterEnabled: result.writerEnabled, cookedWeightWriterEnabled: weight === "true", writerEnabled: quantity === "true", ledgerAuthority,
          normalDataSha256, normalColumnsSha256: quantityV4ColumnFingerprint(columns), metadataNull, ledgerPreservedRowsSha256,
          preservedRowsSha256: digest(JSON.stringify([result.preservedRowsSha256, normalDataSha256, ledgerPreservedRowsSha256])),
          normalProjectionSha256: observationReview.database.normalProjectionSha256, postimageRegistrySha256: observationReview.database.postimageRegistrySha256,
          scope: JSON.parse((await query(COOKED_WEIGHT_SCOPE_SQL)).trim()), worker: JSON.parse((await query(QUANTITY_V4_WORKER_STATE_SQL)).trim()) });
      }
      if ([COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature)) {
        const exists = (await query("SELECT to_regclass('private.cooked_weight_user_attestation_control') IS NOT NULL;")).trim() === "t";
        const enabled = exists ? (await query("SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.cooked_weight_user_attestation_control;")).trim() : "false";
        if (!["true", "false"].includes(enabled)) throw new Error("Personal attestation control singleton differs");
        const factsExist = (await query("SELECT to_regclass('private.cooked_weight_user_attestations') IS NOT NULL;")).trim() === "t";
        const facts = factsExist ? (await query("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM private.cooked_weight_user_attestations t;")).trim() : null;
        const empty = factsExist ? (await query("SELECT NOT EXISTS(SELECT 1 FROM private.cooked_weight_user_attestations);")).trim() === "t" : true;
        const registry = await readFile(new URL("../../docs/security/cooked-weight-user-attestation-source-function-postimages.json", import.meta.url));
        if (digest(registry) !== observationReview.database.attestationPostimageRegistrySha256) throw new Error("Personal attestation exact source registry bytes differ");
        const inventory = await import("./full-local-security-inventory.mjs");
        const options = { includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true, includeCookedWeightAttestationFunctions: result.ledger.length === 228 || [229,231,232].includes(result.ledger.length) && ([NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature) || Boolean(databaseMaintenance)), includeRecipeSaveRecoveryFunctions: recipeSave && [231,232].includes(result.ledger.length), includeRecipeRequestRoleFunctions: requestRole && result.ledger.length === 232 };
        inventory.assertRecipeProductSourceFunctionInventoryResult(JSON.parse((await query(inventory.buildRecipeProductSourceFunctionInventorySql(options))).trim()), options);
        if (options.includeCookedWeightAttestationFunctions) {
          if (typeof inventory.buildCookedWeightAttestationSourceFunctionInventorySql !== "function"
            || typeof inventory.assertCookedWeightAttestationSourceFunctionInventoryResult !== "function") throw new Error("Personal attestation reviewed source registry dependency is not installed");
          inventory.assertCookedWeightAttestationSourceFunctionInventoryResult(JSON.parse((await query(inventory.buildCookedWeightAttestationSourceFunctionInventorySql({includeRecipeSaveRecoveryFunctions: options.includeRecipeSaveRecoveryFunctions, includeRecipeRequestRoleFunctions: options.includeRecipeRequestRoleFunctions}))).trim()));
        }
        Object.assign(result, { quantityWriterEnabled: result.writerEnabled, writerEnabled: enabled === "true",
          attestationPostimageRegistrySha256: digest(registry), attestationWriterEnabled: enabled === "true", attestationRowsSha256: facts, attestationRowsEmpty: empty, attestationTablesPresent: exists && factsExist,
          attestationScope: JSON.parse((await query(COOKED_WEIGHT_ATTESTATION_SCOPE_SQL)).trim()) });
      }
      if ([NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(feature) || databaseMaintenance) {
        result.nutritionValidator = JSON.parse((await query(NUTRITION_VALIDATOR_FUNCTION_SQL)).trim());
        result.controlsSha256 = (await query(NUTRITION_VALIDATOR_CONTROLS_SQL)).trim();
        result.stableImmutableSha256 = (await query(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)).trim();
      }
      if (recipeSave) {
        const registry = await readFile(new URL("../../docs/security/recipe-save-recovery-source-function-postimages.json", import.meta.url));
        if (digest(registry) !== RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256 || observationReview.database.recipePostimageRegistrySha256 !== digest(registry)) throw new Error("Recipe-save exact source registry bytes differ");
        result.recipeFunctions = JSON.parse((await query(RECIPE_SAVE_FUNCTIONS_SQL)).trim());
        result.receiptColumnsSha256 = (await query(RECIPE_SAVE_RECEIPT_METADATA_SQL)).trim();
        result.receiptColumnInitiallyNull = result.ledger.length === 231 ? (await query(RECIPE_SAVE_RECEIPT_NULL_SQL)).trim() === "t" : null;
        result.recipeScope = JSON.parse((await query(RECIPE_SAVE_SCOPE_SQL)).trim());
        result.recipePostimageRegistrySha256 = digest(registry);
        if (requestRole) {
          const requestRegistry = await readFile(new URL("../../docs/security/recipe-future-request-role-source-function-postimage.json", import.meta.url));
          if (digest(requestRegistry) !== RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256 || observationReview.database.requestRolePostimageRegistrySha256 !== digest(requestRegistry)) throw new Error("Recipe request-role exact postimage bytes differ");
          result.requestRolePostimageRegistrySha256 = digest(requestRegistry);
        }
      }
      return result;
    },
  };
}

/** @param {{ repositoryRoot: string, operationDirectory: string, guardPath: string, operationId: string, previousNotAppliedSha256?: string }} options */
export function createProtectedPrelaunchJournal({ repositoryRoot, operationDirectory, guardPath, operationId, previousNotAppliedSha256 = undefined }) {
  const attemptPath = path.join(operationDirectory, "attempt.json");
  const read = () => {
    try {
      const record = JSON.parse(readClosedR2PrivateBytes(guardPath, repositoryRoot, 524288));
      if (record.schema === "homecook.prelaunch-protected-db-attempt.v1" && [QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(record.feature)
        && record.journalFile !== "attempt.json") throw new Error("C04 durable DB journal locator differs");
      return record;
    }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  return {
    read: async () => {
      const previous = read();
      if (previousNotAppliedSha256 && previous?.status === "not_applied" && previous.operationId !== operationId
        && digest(readClosedR2PrivateBytes(guardPath, repositoryRoot, 524288)) === previousNotAppliedSha256) return null;
      return previous;
    },
    async write(value, exclusive = false) {
      if (value.operationId !== operationId) throw new Error("Protected durable attempt operation differs");
      if (value.schema === "homecook.prelaunch-protected-db-attempt.v1" && [QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(value.feature)
        && value.journalFile !== "attempt.json") throw new Error("C04 durable DB journal locator differs");
      const bound = { ...value, operationDirectory };
      if (!exclusive) {
        const previous = read();
        if (!previous || previous.operationId !== operationId || previous.operationDirectory !== operationDirectory
          || previous.reviewSha256 !== value.reviewSha256) throw new Error("Protected durable guard ownership differs");
      }
      // The global guard is create-only before session dispatch. Persist unknowns rather than deleting it.
      if (exclusive && previousNotAppliedSha256) {
        const bytes = readClosedR2PrivateBytes(guardPath, repositoryRoot, 524288), previous = JSON.parse(bytes);
        if (digest(bytes) !== previousNotAppliedSha256 || previous.status !== "not_applied" || previous.reviewSha256 !== value.reviewSha256
          || previous.from !== value.from || previous.to !== value.to || previous.operationId === operationId) throw new Error("Protected explicit retry predecessor differs");
        await durableJson(path.join(operationDirectory, "previous-not-applied.json"), previous, true);
        await durableJson(guardPath, bound);
      } else if (exclusive) await durableJson(guardPath, bound, true);
      await durableJson(attemptPath, bound);
      if (!exclusive) await durableJson(guardPath, bound);
      if (["committed", "not_applied", "closed_after_unknown"].includes(value.status)) {
        const receiptPath = path.join(operationDirectory, "receipt.json");
        try {
          const previous = JSON.parse(readClosedR2PrivateBytes(receiptPath, repositoryRoot, 524288));
          if (!same(previous, bound)) throw new Error("Protected terminal receipt bytes differ");
        } catch (error) { if (error.code !== "ENOENT") throw error; await durableJson(receiptPath, bound, true); }
      }
    },
  };
}

export async function openProtectedPrelaunchTarget({ repositoryRoot, configPath, backupDirectory, review }) {
  if ([QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature)) assertQuantityV4ProtectionPrepared(review);
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) assertCookedWeightAttestationReview(review);
  if (review.feature === NUTRITION_VALIDATOR_FEATURE) assertNutritionValidatorReview(review);
  if (review.feature === RECIPE_SAVE_RECOVERY_FEATURE) assertRecipeSaveRecoveryReview(review);
  if (review.feature === RECIPE_REQUEST_ROLE_FEATURE) assertRecipeRequestRoleReview(review);
  const configBytes = readClosedR2PrivateBytes(configPath, repositoryRoot, 65536);
  if (configPath !== review.database.configPath || digest(configBytes) !== review.database.configSha256) throw new Error("Protected database config path/bytes differ from approval");
  const config = parseFullLocalProductionConfig(configBytes.toString("utf8"));
  if (config.FULL_LOCAL_BACKUP_READINESS_PATH !== review.backupReadiness.path
    || digest(readClosedR2PrivateBytes(review.backupReadiness.path, repositoryRoot, 524288)) !== review.backupReadiness.sha256
    || digest(readClosedR2PrivateBytes(review.platformInventory.path, repositoryRoot, 524288)) !== review.platformInventory.sha256) {
    throw new Error("Protected platform backup/current inventory bindings differ");
  }
  const base = await createRecordingDockerAdapter({ configPath, backupDirectory });
  const target = await base.inspect();
  if (digest(JSON.stringify(target)) !== review.database.targetSha256) throw new Error("Protected database identity differs from approved config target");
  const { loadFullLocalBackupReadiness } = await import("../full-local-production-runtime.mjs");
  await loadFullLocalBackupReadiness({ config }, target); // Existing authenticated platform/USB/restore verifier; no materialization or service action.
  return createProtectedPrelaunchAdapter(base, review.feature, review);
}

// Worker CLI only: consume code-bound DB authority and observe fixed queries, never caller SQL/config/path.
export async function observeQuantityV4WorkerBoundary({ repositoryRoot, stage, quantityWriterState = "off" }) {
  if (!["off", "on"].includes(quantityWriterState) || (quantityWriterState === "on" && stage !== "worker")) throw new Error("C04 worker observation requires its exact OFF/ON stage");
  const readerWriter = quantityWriterState === "on" ? loadQuantityV4ReaderWriterReceipts(repositoryRoot) : null;
  const authority = loadQuantityV4DatabaseReceipt(repositoryRoot, stage);
  const successor = loadCookedWeightAttestationSuccessor(repositoryRoot);
  const databaseMaintenance = loadCurrentDatabaseMaintenance(repositoryRoot);
  if (databaseMaintenance && stage !== "worker") throw new Error("Nutrition229 cannot authorize consumers/quiesce47");
  if (successor && stage !== "worker") throw new Error("Personal attestation successor cannot retarget consumer226/quiesce47");
  const review = databaseMaintenance?.review ?? successor?.review ?? authority.review;
  const adapter = await openProtectedPrelaunchTarget({ repositoryRoot, configPath: review.database.configPath,
    backupDirectory: path.dirname(authority.pointer.path), review });
  const observation = await adapter.observe(undefined, "protected-c04-worker-boundary");
  if (successor) {
    assertCookedWeightAttestationCurrentObservation(successor, observation, { quantityWriterState, workerControlTransition: true, databaseMaintenance });
    const normalized = { ...observation, writerEnabled: observation.quantityWriterEnabled };
    return { authority, observation: normalized, adapter: { ...adapter, observe: async (query, name) => {
      const current = await adapter.observe(query, name);
      assertCookedWeightAttestationCurrentObservation(successor, current, { quantityWriterState, workerControlTransition: true, databaseMaintenance });
      return { ...current, writerEnabled: current.quantityWriterEnabled };
    } }, readerWriter, successor, successorBinding: cookedWeightAttestationSuccessorBinding(successor),
      databaseMaintenance, maintenanceBinding: nutritionValidatorMaintenanceBinding(databaseMaintenance) };
  }
  // Quiesce/CAS has its own original control review. Do not retarget consumer prestate to those later row timestamps.
  if (digest(JSON.stringify(observation.target)) !== review.database.targetSha256 || !same(observation.ledger, review.database.after)
    || observation.catalogSha256 !== review.database.afterCatalogSha256 || observation.immutableSha256 !== protectedImmutableSha256(review)
    || !isDeepStrictEqual(observation.scope, review.database.afterScope) || observation.ledgerAuthority !== true || observation.active !== false
    || observation.productWriterEnabled !== true || observation.cookedWeightWriterEnabled !== true || observation.writerEnabled !== (quantityWriterState === "on")
    || observation.normalProjectionSha256 !== review.database.normalProjectionSha256 || observation.postimageRegistrySha256 !== review.database.postimageRegistrySha256
    || !SHA.test(observation.normalDataSha256)) throw new Error("C04 worker current DB authority/target/catalog/scope/OFF/data differs");
  return { authority, observation, adapter, readerWriter, successor: null, successorBinding: null };
}

export async function createProtectedPrelaunchDatabase({ repositoryRoot, configPath, operationDirectory, operationId, guardPath, review, reviewSha256, assertBoundary, checkCancelled, readMigrations: readCandidate, previousNotAppliedSha256, workerCheckpoint = /** @type {Record<string, unknown> | undefined} */ (undefined) }) {
  const readMigrations = readCandidate ?? (async () => {
    const migrations = await readPrelaunchMigrationFiles(repositoryRoot);
    return Promise.all(migrations.map(async row => ({ ...row, bytes: await readFile(path.join(repositoryRoot, "supabase/migrations", row.filename)) })));
  });
  planProtectedPrelaunchMigrations(review, await readMigrations()); // Exact source bytes before Docker/config operations.
  const adapter = await openProtectedPrelaunchTarget({ repositoryRoot, configPath, backupDirectory: path.join(operationDirectory, "backup"), review });
  const journal = createProtectedPrelaunchJournal({ repositoryRoot, operationDirectory, operationId, guardPath, previousNotAppliedSha256 });
  const engine = createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary, checkCancelled, workerCheckpoint });
  return { ...engine, observe: () => adapter.observe(undefined, `${review.feature === QUANTITY_V4_FEATURE ? "protected-c04" : review.feature === COOKED_WEIGHT_FEATURE ? "protected-c01" : "protected-c03"}-${operationId}`), adapter, journal };
}

export function createProtectedPrelaunchWriter({ review, reviewSha256, approval, approvalSha256, readerReceipt, readerReceiptSha256, operationId, action, adapter, journal, assertBoundary,
  baselineReview = review, baselineReviewSha256 = reviewSha256, productOffReceipt = null, workerCheckpoint = /** @type {Record<string, unknown> | undefined} */ (undefined),
  readerWorkerCheckpoint = /** @type {Record<string, unknown> | undefined} */ (undefined), workerPolicyRepair = /** @type {Record<string, any> | undefined} */ (undefined), workerReceipt = /** @type {{path:string,sha256:string} | undefined} */ (undefined),
  attestationSuccessor = /** @type {ReturnType<typeof loadCookedWeightAttestationSuccessor> | undefined} */ (undefined), approvedWorkerSuccessor = null, approvedWorkerPolicy = /** @type {{policyRowSha256: string, workerPolicyEnabled: boolean} | null} */ (null),
  databaseMaintenance = /** @type {ReturnType<typeof loadNutritionValidatorMaintenance> | undefined} */ (undefined),
  quantityOffReceipt = /** @type {{schema:string,feature:string,status:string,action:string,writerEnabled:boolean,reviewSha256:string,approvalSha256:string,readerReceiptSha256:string,baselineReviewSha256:string,baselineDatabasePlanSha256:string} | null} */ (null) }) {
  assertProtectedWriterReview(approval, review, reviewSha256);
  const productCloseOnWeightBaseline = review.feature === "recipe-product-source" && baselineReview.feature === COOKED_WEIGHT_FEATURE;
  const quantityCloseOnAttestationBaseline = review.feature === QUANTITY_V4_FEATURE && baselineReview.feature === COOKED_WEIGHT_ATTESTATION_FEATURE;
  const personal = review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE;
  if (quantityCloseOnAttestationBaseline) {
    if (action !== "writer-off" || !attestationSuccessor || !same(attestationSuccessor.review, baselineReview)
      || !same(attestationSuccessor.predecessor.authority.database.review, review)) throw new Error("Only original C04 safe OFF may use its checked personal successor");
  }
  if (productCloseOnWeightBaseline) {
    assertProtectedRolloutReview(baselineReview);
    if (action !== "writer-off" || baselineReview.predecessorProtected.reviewSha256 !== reviewSha256 || !SHA.test(baselineReviewSha256)) throw new Error("Only original C03 safe OFF may use the exact successor C01 baseline");
  } else if (!quantityCloseOnAttestationBaseline && (!same(baselineReview, review) || baselineReviewSha256 !== reviewSha256)) throw new Error("Writer cannot replace its approved baseline");
  if (!SHA.test(approvalSha256) || !SHA.test(readerReceiptSha256) || (approval.readerReceiptSha256 !== null && approval.readerReceiptSha256 !== readerReceiptSha256) || readerReceipt?.reviewSha256 !== reviewSha256
    || readerReceipt.readerFloor !== review.to || readerReceipt.releaseSha !== review.to || readerReceipt.backwardCompatible !== false
    || readerReceipt.databasePlanSha256 !== approval.databasePlanSha256 || readerReceipt.verifiedFlowsSha256 !== approval.readerFlowsSha256 || !["writer-on", "writer-off"].includes(action)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(operationId ?? "")) {
    throw new Error("Protected writer approval/reader floor/action differs");
  }
  if (databaseMaintenance) nutritionValidatorMaintenanceBinding(databaseMaintenance);
  databaseMaintenance = structuredClone(databaseMaintenance);
  review = structuredClone(review); baselineReview = structuredClone(baselineReview); productOffReceipt = structuredClone(productOffReceipt);
  workerCheckpoint = structuredClone(workerCheckpoint);
  readerWorkerCheckpoint = structuredClone(readerWorkerCheckpoint); workerPolicyRepair = structuredClone(workerPolicyRepair); workerReceipt = structuredClone(workerReceipt);
  const enabled = action === "writer-on", applicationName = `protected-writer-${operationId}`;
  const cookedWeight = review.feature === COOKED_WEIGHT_FEATURE;
  const quantity = review.feature === QUANTITY_V4_FEATURE;
  if (quantity) {
    if (review.quantityStage !== "worker" || readerReceipt.feature !== QUANTITY_V4_FEATURE || readerReceipt.quantityStage !== "worker"
      || readerReceipt.consumersReceiptSha256 !== review.consumersReceipt.sha256 || !SHA.test(readerReceipt.workerReceiptSha256 ?? "")
      || readerReceipt.workerReceipt?.sha256 !== readerReceipt.workerReceiptSha256 || !SHA.test(workerReceipt?.sha256 ?? "")
      || (approval.workerReceiptSha256 !== null && approval.workerReceiptSha256 !== workerReceipt.sha256)) throw new Error("C04 writer requires the final227 reader/worker checkpoint");
    assertQuantityV4WorkerCheckpoint(review, workerCheckpoint, "after");
    assertQuantityV4WorkerPublicationPair(review, readerWorkerCheckpoint, workerCheckpoint, workerPolicyRepair);
  }
  const controlKey = quantityCloseOnAttestationBaseline ? "quantityWriterEnabled" : productCloseOnWeightBaseline ? "productWriterEnabled" : "writerEnabled";
  const binding = () => { const result = { schema: "homecook.prelaunch-protected-writer-attempt.v1", reviewSha256, approvalSha256, operationId,
    applicationName, from: review.from, to: review.to, action, readerReceiptSha256, readerFloor: readerReceipt.readerFloor, backwardCompatible: false };
    if (productCloseOnWeightBaseline) Object.assign(result, { baselineReviewSha256, baselineDatabasePlanSha256: digest(JSON.stringify({ source: baselineReview.database.after, applied: baselineReview.database.after })) });
    if (quantity) Object.assign(result, { feature: QUANTITY_V4_FEATURE, workerReceipt, workerReceiptSha256: workerReceipt.sha256 });
    if (personal) Object.assign(result, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE, predecessorQuantity: review.predecessorQuantity });
    if (quantityCloseOnAttestationBaseline) Object.assign(result, { baselineReviewSha256, baselineDatabasePlanSha256: digest(JSON.stringify({ source: baselineReview.database.after, applied: baselineReview.database.after })),
      databaseSuccessor: cookedWeightAttestationSuccessorBinding(attestationSuccessor) });
    return { ...result, ...(databaseMaintenance ? { databaseMaintenance: nutritionValidatorMaintenanceBinding(databaseMaintenance) } : {}) };
  };
  const check = (observation, reconciliation = false) => {
    if (typeof observation[controlKey] !== "boolean") throw new Error("Protected writer control observation is invalid");
    if (personal && enabled && !reconciliation && observation.quantityWriterEnabled !== true) throw new Error("Personal attestation fresh writer ON requires quantity ON");
    if (quantityCloseOnAttestationBaseline) return assertProtectedPrelaunchObservation(review, { ...observation, writerEnabled: observation.quantityWriterEnabled }, "after",
      { attestationSuccessor, safeQuantityOff: true, approvedWorkerPolicy, approvedWorkerSuccessor, databaseMaintenance });
    if (personal && observation.quantityWriterEnabled === false) {
      if (!quantityOffReceipt || quantityOffReceipt.feature !== QUANTITY_V4_FEATURE || quantityOffReceipt.status !== "committed" || quantityOffReceipt.action !== "writer-off"
        || quantityOffReceipt.writerEnabled !== false || quantityOffReceipt.reviewSha256 !== review.predecessorQuantity.reviewSha256
        || quantityOffReceipt.approvalSha256 !== review.predecessorQuantity.writerApprovalSha256
        || quantityOffReceipt.readerReceiptSha256 !== review.predecessorQuantity.readerReceipt.sha256
        || quantityOffReceipt.baselineReviewSha256 !== reviewSha256 || quantityOffReceipt.baselineDatabasePlanSha256 !== digest(JSON.stringify({ source: review.database.after, applied: review.database.after }))
        || !same(quantityOffReceipt.databaseMaintenance ?? null, nutritionValidatorMaintenanceBinding(databaseMaintenance))) throw new Error("Personal attestation cannot adopt unreceipted quantity OFF");
    }
    if (productCloseOnWeightBaseline) return assertProtectedPrelaunchObservation(baselineReview, { ...observation, writerEnabled: false, productWriterEnabled: true }, "after");
    return assertProtectedPrelaunchObservation(review, { ...observation, writerEnabled: false }, "after", { productOffReceipt, reviewSha256, workerCheckpoint, safeQuantityOff: quantity && !enabled, safeAttestationOff: personal && !enabled, approvedWorkerPolicy, approvedWorkerSuccessor, quantityOffReceipt, databaseMaintenance });
  };
  return {
    async apply() {
      if (await journal.read()) throw new Error("Protected writer attempt exists; reconcile without automatic reactivation");
      await assertBoundary();
      const before = await adapter.observe(undefined, applicationName); check(before);
      if (before[controlKey] === enabled) throw new Error("Protected writer already has requested state; no new control write permitted");
      let session;
      let guardCreated = false;
      let commitDispatched = false;
      try {
        await journal.write({ ...binding(), status: "applying_precommit", target: before.target }, true);
        guardCreated = true;
        if (quantity || personal) {
          if (typeof adapter.migrationSession !== "function") throw new Error("C04 writer fixed admin session required");
          session = adapter.migrationSession(applicationName);
          const { searchPath, timeZone } = session.postgresContext ?? {};
          if (typeof searchPath !== "string" || typeof timeZone !== "string"
            || (await session.query("SELECT session_user;")).trim() !== "supabase_admin") throw new Error("C04 writer original admin session/context required");
          await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL ROLE postgres; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true); SELECT pg_advisory_xact_lock(104230921,77101); SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE; SELECT singleton FROM private.quantity_input_v4_policy WHERE singleton FOR ${personal ? "SHARE" : "UPDATE"};${personal ? " SELECT singleton FROM private.cooked_weight_user_attestation_control WHERE singleton FOR UPDATE;" : ""}`);
          await session.query("RESET ROLE;");
          if ((await session.query("SELECT current_user;")).trim() !== "supabase_admin") throw new Error("C04 original writer lock role differs");
          await session.query("LOCK TABLE private.youtube_extraction_current_policy IN SHARE MODE; LOCK TABLE private.youtube_extraction_worker_credentials IN SHARE MODE;");
          await session.query(`SET LOCAL ROLE postgres; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true);`);
          if ((await session.query("SELECT current_user;")).trim() !== "postgres") throw new Error("C04 writer observation role restoration differs");
        } else {
          session = adapter.session(applicationName);
          await session.query(cookedWeight
            ? "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SELECT pg_advisory_xact_lock(104230921,77101); SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR UPDATE;"
            : "BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SELECT pg_advisory_xact_lock(104230921,77101); LOCK TABLE private.recipe_product_only_write_control IN EXCLUSIVE MODE; LOCK TABLE public.recipe_ingredients IN SHARE ROW EXCLUSIVE MODE;");
        }
        if (productCloseOnWeightBaseline) await session.query("SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE;");
        const locked = await adapter.observe(sql => session.query(sql), applicationName); check(locked);
        if (locked[controlKey] !== before[controlKey]) throw new Error("Protected writer changed before lock");
        await assertBoundary();
        await session.query(personal
          ? `UPDATE private.cooked_weight_user_attestation_control SET enabled=${enabled},updated_at=clock_timestamp() WHERE singleton AND enabled=${!enabled};`
          : quantity
          ? `UPDATE private.quantity_input_v4_policy SET enabled=${enabled} WHERE singleton AND enabled=${!enabled};`
          : cookedWeight
          ? `UPDATE private.cooked_batch_weight_evidence_control SET enabled=${enabled} WHERE singleton AND enabled=${!enabled};`
          : `UPDATE private.recipe_product_only_write_control SET enabled=${enabled} WHERE singleton AND enabled=${!enabled};`);
        const post = await adapter.observe(sql => session.query(sql), applicationName); check(post);
        if (post[controlKey] !== enabled || post.preservedRowsSha256 !== locked.preservedRowsSha256
          || (productCloseOnWeightBaseline && post.writerEnabled !== locked.writerEnabled)
          || ((personal || quantityCloseOnAttestationBaseline) && (post.attestationRowsSha256 !== locked.attestationRowsSha256
            || (quantityCloseOnAttestationBaseline && post.attestationWriterEnabled !== locked.attestationWriterEnabled)
            || (personal && post.quantityWriterEnabled !== locked.quantityWriterEnabled)))
          || ((quantity || personal) && (enabled ? !same(post.worker, locked.worker)
            : post.worker.credentialRowSha256 !== locked.worker.credentialRowSha256 || post.worker.policyRowSha256 !== locked.worker.policyRowSha256))) throw new Error("Protected control transition or preserved rows/worker authority differ");
        await assertBoundary();
        await journal.write({ ...binding(), status: "commit_dispatch_guard", target: before.target });
        commitDispatched = true;
        await session.query("COMMIT;"); await session.close();
        const after = await adapter.observe(undefined, applicationName); check(after);
        if (after[controlKey] !== enabled) throw new Error("Protected writer commit readback differs");
        const result = { ...binding(), status: "committed", target: before.target, writerEnabled: enabled };
        await journal.write(result); return result;
      } catch (error) {
        if (!guardCreated) throw error;
        let rolledBack = false;
        if (session && !commitDispatched) { try { await session.query("ROLLBACK;"); await session.close(); rolledBack = true; } catch { session.stop(); } }
        else if (session) session.stop();
        await journal.write({ ...binding(), status: rolledBack ? "rolled_back_before_commit" : "unknown", target: before.target, commitDispatched });
        throw Object.assign(error instanceof Error ? error : new Error("Protected writer outcome unknown"), { writerState: { unknown: !rolledBack, readerFloor: readerReceipt.readerFloor, automaticRetryAllowed: false } });
      }
    },
    async reconcile({ safeOffReceipt } = {}) {
      const attempt = await journal.read();
      if (!attempt || attempt.schema !== binding().schema || attempt.operationId !== operationId || attempt.reviewSha256 !== reviewSha256
        || attempt.approvalSha256 !== approvalSha256 || attempt.action !== action || attempt.readerReceiptSha256 !== readerReceiptSha256
        || !same(attempt.databaseMaintenance ?? null, binding().databaseMaintenance ?? null)
        || attempt.readerFloor !== review.to || !["applying_precommit", "commit_dispatch_guard", "unknown", "rolled_back_before_commit"].includes(attempt.status)) {
        throw new Error("Protected writer reconcile binding differs");
      }
      assertProtectedWriterDatabaseBoundary(attempt, databaseMaintenance);
      await assertBoundary();
      const observation = await adapter.observe(undefined, applicationName); check(observation, true);
      const closedAfterUnknown = enabled && observation[controlKey] === false && safeOffReceipt;
      if (closedAfterUnknown && (safeOffReceipt.status !== "committed" || safeOffReceipt.action !== "writer-off"
        || safeOffReceipt.approvalSha256 !== approvalSha256 || safeOffReceipt.readerReceiptSha256 !== readerReceiptSha256
        || safeOffReceipt.readerFloor !== review.to || safeOffReceipt.writerEnabled !== false
        || !same(safeOffReceipt.databaseMaintenance ?? null, binding().databaseMaintenance ?? null))) throw new Error("Protected safe OFF supersession proof differs");
      const result = { ...binding(), status: closedAfterUnknown ? "closed_after_unknown" : observation[controlKey] === enabled ? "committed" : "not_applied", target: observation.target,
        writerEnabled: observation[controlKey], automaticRetryAllowed: false };
      await journal.write(result); return result;
    },
  };
}

export function planPrelaunchMigrations(migrations, state, baseline) {
  const source = records(migrations);
  for (const row of source) {
    if (!FILE.test(row.filename) || !SHA.test(row.sha256)) throw new Error("Invalid migration filename or checksum");
  }
  if (new Set(source.map((row) => row.filename.slice(0, 14))).size !== source.length) throw new Error("Duplicate migration version");
  let applied = state.applied;
  if (!state.exists) {
    if (!baseline) return { pending: source.map((row) => row.filename), baselineRequired: true, applied: [], source };
    if (baseline.schema !== "homecook.prelaunch-db-baseline.v1" || baseline.verified !== true || !Array.isArray(baseline.applied)) throw new Error("Explicit verified database baseline required");
    applied = records(baseline.applied);
    if (state.supabaseVersions.length && !same([...state.supabaseVersions].sort(), applied.map((row) => row.filename.slice(0, 14)).sort())) throw new Error("Supabase migration history differs from verified baseline");
  }
  for (const [index, row] of applied.entries()) {
    const found = source.find((entry) => entry.filename === row.filename);
    if (!found) throw new Error("Previously applied migration missing/deleted from candidate");
    if (found.sha256 !== row.sha256) throw new Error("Previously applied migration checksum changed");
    if (source[index]?.filename !== row.filename) throw new Error("Applied migration history must be an ordered prefix");
  }
  const pending = migrations.slice(applied.length);
  for (const migration of pending) validatePrelaunchMigrationSql(migration.sql);
  // Pattern eligibility only: the CLI separately requires verified old-app compatibility.
  return { pending: pending.map((row) => row.filename), baselineRequired: false, migrationMode: "additive", applied: records(applied), source };
}

// This deliberately narrow scanner is a deployment guard, not an arbitrary-SQL sandbox.
// Procedural/dynamic SQL and data rewrites use the separate reviewed DB procedure.
export function validatePrelaunchMigrationSql(sql) {
  const statements = [];
  let start = 0;
  let masked = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end;
      masked += " ";
    } else if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("Unclosed SQL comment");
      masked += " ";
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      const quoteStart = i;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        // Escape-string variants have server-setting-dependent parsing; keep this lane simple.
        if (sql[i] === "\\" && sql[i + 1] === "'") throw new Error("Escaped SQL strings require reviewed database deployment");
        i++;
      }
      if (!closed) throw new Error("Unclosed SQL literal");
      masked += quote === '"' ? sql.slice(quoteStart, i - 1).toUpperCase() : " LITERAL ";
    } else if (sql[i] === "$" || sql[i] === "\\") {
      throw new Error("Procedural SQL and psql commands require reviewed database deployment");
    } else if (sql[i] === ";") {
      if (masked.trim()) statements.push({ text: sql.slice(start, i + 1), tokens: masked.toUpperCase().trim() });
      masked = ""; start = ++i;
    } else { masked += sql[i++]; }
  }
  if (masked.trim()) throw new Error("Migration statements must end with semicolon");
  if (statements[0]?.tokens === "BEGIN" && statements.at(-1)?.tokens === "COMMIT") { statements.shift(); statements.pop(); }
  if (!statements.length) throw new Error("Empty additive migration");
  for (const { tokens } of statements) {
    if (/\b(HOMECOOK_DEPLOY|SUPABASE_MIGRATIONS|CONCURRENTLY|DROP|TRUNCATE|DELETE|UPDATE|PROGRAM|COMMIT|ROLLBACK|VACUUM|TABLESPACE|TEMP|TEMPORARY|UNLOGGED)\b/u.test(tokens)) throw new Error("Destructive or transaction-unsafe SQL requires reviewed database deployment");
    if (!/^(CREATE TABLE\s|CREATE (UNIQUE )?INDEX\s|ALTER TABLE\s)/u.test(tokens)) throw new Error("Only additive table/index migrations are supported by quick database deployment");
    if (tokens.startsWith("ALTER TABLE") && (!/\bADD\s+(COLUMN\s+|CONSTRAINT\s+)/u.test(tokens) || /\b(ALTER|RENAME|OWNER|DISABLE|ENABLE|SET|RESET|ATTACH|DETACH|INHERIT|VALIDATE)\b/u.test(tokens.slice("ALTER TABLE".length)))) throw new Error("Only ADD COLUMN / ADD CONSTRAINT supported for ALTER TABLE");
    if (/\b(CREATE TABLE.*\bAS\b|SELECT|EXECUTE|FUNCTION|CALL)\b/u.test(tokens)) throw new Error("Query or executable SQL requires reviewed database deployment");
  }
  return statements.map((statement) => statement.text).join("\n");
}

export function createPrelaunchDatabaseEngine({ readMigrations, adapter, readBaseline = async () => undefined, checkCancelled = () => {} }) {
  let plannedFingerprint;
  async function snapshot() {
    const migrations = await readMigrations();
    const identity = await adapter.inspect();
    const state = await adapter.readState(identity);
    const baseline = await readBaseline();
    const plan = planPrelaunchMigrations(migrations, state, baseline);
    const fingerprint = digest(JSON.stringify({ identity, state, source: plan.source, applied: plan.applied }));
    return { migrations, identity, state, plan, fingerprint };
  }
  return {
    async plan() {
      const current = await snapshot();
      plannedFingerprint = current.fingerprint;
      return current.plan;
    },
    async apply() {
      const current = await snapshot();
      if (plannedFingerprint && plannedFingerprint !== current.fingerprint) throw new Error("Database target/history/source changed after plan; plan again");
      if (current.plan.baselineRequired) throw new Error("Explicit verified database baseline required before first migration");
      const pending = current.migrations.filter((row) => current.plan.pending.includes(row.filename)).map((row) => ({ ...row, sql: validatePrelaunchMigrationSql(row.sql) }));
      if (!pending.length && current.state.exists) return { changed: false, applied: [], backupPath: null };
      checkCancelled();
      const backupPath = await adapter.backup(current.identity);
      const afterBackup = await snapshot();
      if (current.fingerprint !== afterBackup.fingerprint) throw new Error("Database target identity/history/source changed during backup");
      checkCancelled();
      const attempted = pending.map((row) => row.filename);
      let committed = false;
      try {
        await adapter.transact(current.identity, current.state, current.plan.applied, pending);
        committed = true;
        plannedFingerprint = undefined;
        const verified = await snapshot();
        if (verified.plan.pending.length || !verified.state.exists || !same(verified.identity, current.identity)) throw new Error("Database migration verification failed");
        return { changed: true, applied: attempted, backupPath, outcome: "committed" };
      } catch (error) {
        // Preserve recovery evidence even if the acknowledgement or post-commit check fails.
        const rolledBack = !committed && error?.transactionRolledBack === true;
        throw Object.assign(error instanceof Error ? error : new Error("Database migration outcome requires inspection"), {
          databaseState: { changed: !rolledBack, applied: committed ? attempted : [], attempted, backupPath, outcome: committed ? "committed" : rolledBack ? "rolled_back" : "uncertain" },
        });
      }
    },
    async verify() {
      const current = await snapshot();
      if (current.plan.baselineRequired || current.plan.pending.length) throw new Error("Database has pending or unverified migration history");
      return current.plan;
    },
    async close() {},
  };
}

// Exact human-reviewed procedure, deliberately separate from the unchanged additive scanner.
// The CLI cannot reach this kernel until its protected pin and concrete C03 contracts are approved.
function assertProtectedSqlOperatorBoundary(sql) {
  const fail = () => { throw new Error("Protected migration transaction/psql command must remain operator-owned"); };
  let words = [], previousIdentifier = null;
  const statement = () => {
    const first = words[0], second = words[1];
    if (["BEGIN", "END", "ABORT", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE"].includes(first)
      || (["START", "PREPARE"].includes(first) && second === "TRANSACTION")
      || (first === "SET" && (second === "TRANSACTION" || (second === "SESSION" && words[2] === "CHARACTERISTICS")))
      || (["SET", "RESET"].includes(first) && (words.includes("STANDARD_CONFORMING_STRINGS") || words.includes("BACKSLASH_QUOTE") || second === "ALL"))) fail();
    words = [];
  };
  // The same nested-comment and doubled-quote rules as the additive scanner.
  // Dollar bodies are data here; their internal BEGIN/END are not outer transactions.
  for (let i = 0; i < sql.length;) {
    if (/\s/u.test(sql[i])) { i++; continue; }
    if (sql.startsWith("--", i)) {
      i += 2; while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") i++;
    } else if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) fail();
    } else if ((sql[i] === "U" || sql[i] === "u") && sql.startsWith('&"', i + 1)) {
      throw new Error("Protected migration Unicode quoted identifiers are unsupported");
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i], escaped = quote === "'" && /[eE]/u.test(sql[i - 1] ?? "") && !/[A-Za-z0-9_$\u0080-\uFFFF]/u.test(sql[i - 2] ?? "");
      let closed = false, identifier = ""; i++;
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { identifier += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        if (quote === '"') identifier += sql[i];
        i++;
      }
      if (!closed) fail();
      words.push(quote === '"' ? identifier.toUpperCase() : "_LITERAL_");
      previousIdentifier = quote === '"' ? identifier.toUpperCase() : null;
    } else if (sql[i] === "$") {
      const delimiter = /^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/u.exec(sql.slice(i))?.[0];
      if (!delimiter) { i++; continue; }
      const end = sql.indexOf(delimiter, i + delimiter.length);
      if (end < 0) fail();
      words.push("_DOLLAR_BODY_"); previousIdentifier = null; i = end + delimiter.length;
    } else if (sql[i] === "\\") fail(); // Includes inline \gexec, \!, \i, \copy, etc.
    else if (sql[i] === ";") { statement(); previousIdentifier = null; i++; }
    else {
      const word = /^[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_$\u0080-\uFFFF]*/u.exec(sql.slice(i))?.[0];
      if (word) { words.push(word.toUpperCase()); previousIdentifier = word.toUpperCase(); i += word.length; }
      else {
        if (sql[i] === "(" && previousIdentifier === "SET_CONFIG") fail();
        previousIdentifier = null; i++;
      }
    }
  }
  statement();
}

export function planProtectedPrelaunchMigrations(review, migrations) {
  const before = review?.database?.before;
  const after = review?.database?.after;
  const specs = review?.database?.migrations;
  const quantity = review.feature === QUANTITY_V4_FEATURE, attestation = review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE, maintenance = [NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature);
  if (quantity || attestation || maintenance) assertProtectedRolloutReview(review);
  const source = quantity ? review.database.source : after;
  const validRows = rows => Array.isArray(rows) && rows.length > 0
    && rows.every(row => row && Object.keys(row).sort().join() === "filename,sha256" && FILE.test(row.filename) && SHA.test(row.sha256))
    && new Set(rows.map(row => row.filename.slice(0, 14))).size === rows.length
    && same(rows.map(row => row.filename), rows.map(row => row.filename).sort());
  if (!validRows(before) || !validRows(after) || after.length <= before.length || !same(after.slice(0, before.length), before)
    || !Array.isArray(specs) || specs.length !== after.length - before.length || !same(records(migrations), source)) {
    throw new Error("Protected migration source/ledger must be the exact approved ordered prefix and extension");
  }
  if (quantity) for (const row of migrations.slice(221)) {
    if (!Buffer.isBuffer(row.bytes) || digest(row.bytes) !== row.sha256) throw new Error("C04 full six-file source bytes differ");
  }
  const pending = migrations.slice(before.length, after.length).map((migration, index) => {
    const spec = specs[index];
    if (!spec || spec.filename !== migration.filename || spec.rawSha256 !== migration.sha256 || !SHA.test(spec.payloadSha256)
      || Object.keys(spec).sort().join() !== "filename,payloadSha256,rawSha256" || !Buffer.isBuffer(migration.bytes)
      || digest(migration.bytes) !== spec.rawSha256) throw new Error("Protected migration exact raw bytes differ");
    const sql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(migration.bytes);
    const cookedWeight = review.feature === COOKED_WEIGHT_FEATURE;
    if (review.feature === NUTRITION_VALIDATOR_FEATURE && (before.length !== 228 || after.length !== 229 || specs.length !== 1
      || migration.filename !== NUTRITION_VALIDATOR_MIGRATION || spec.rawSha256 !== NUTRITION_VALIDATOR_MIGRATION_SHA256)) throw new Error("Nutrition validator only accepts exact228 to229 source");
    if (review.feature === RECIPE_REQUEST_ROLE_FEATURE && (before.length !== 231 || after.length !== 232 || specs.length !== 1
      || migration.filename !== RECIPE_REQUEST_ROLE_MIGRATION.filename || spec.rawSha256 !== RECIPE_REQUEST_ROLE_MIGRATION.sha256)) throw new Error("Recipe request-role only accepts exact231 to232 single source");
    if (review.feature === RECIPE_SAVE_RECOVERY_FEATURE && (before.length !== 229 || after.length !== 231 || specs.length !== 2
      || migration.filename !== RECIPE_SAVE_RECOVERY_MIGRATIONS[index].filename || spec.rawSha256 !== RECIPE_SAVE_RECOVERY_MIGRATIONS[index].sha256)) throw new Error("Recipe-save only accepts exact229 to231 ordered pair");
    if (attestation && (before.length !== 227 || after.length !== 228 || specs.length !== 1
      || migration.filename !== COOKED_WEIGHT_ATTESTATION_MIGRATION || spec.rawSha256 !== COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256)) throw new Error("Personal attestation only accepts its exact227 to228 source");
    if (cookedWeight && (before.length !== 220 || after.length !== 221 || specs.length !== 1 || migration.filename !== COOKED_WEIGHT_MIGRATION)) throw new Error("C01 only accepts its exact220 to221 migration");
    const quantitySpec = quantity ? QUANTITY_V4_MIGRATIONS.find(row => row.filename === migration.filename) : null;
    if (quantity && (!quantitySpec || quantitySpec.sha256 !== spec.rawSha256 || !sql.startsWith(quantitySpec.prefix))) throw new Error("C04 fixed raw source/envelope differs");
    const envelope = quantity ? sql.slice(quantitySpec.prefix.length) : cookedWeight ? sql.replace(/^-- Local draft only\. No historical batch\/meal\/snapshot UPDATE and no learning collection\.\r?\n/u, "") : sql;
    if (!/^begin;\r?\n/iu.test(envelope) || !/\r?\ncommit;\r?\n$/iu.test(envelope)) throw new Error("Protected migration outer transaction wrapper differs");
    const payload = envelope.replace(/^begin;\r?\n/iu, "").replace(/\r?\ncommit;\r?\n$/iu, "");
    if (digest(payload) !== spec.payloadSha256) throw new Error("Protected migration exact payload bytes differ");
    assertProtectedSqlOperatorBoundary(payload);
    return { filename: migration.filename, sha256: migration.sha256, payload, ...(quantity ? { actor: quantitySpec.actor } : attestation || maintenance ? { actor: "postgres" } : {}) };
  });
  return { before, after, pending };
}

/** @param {{productOffReceipt?: unknown, reviewSha256?: string, workerCheckpoint?: any, ddlOnly?: boolean, safeQuantityOff?: boolean, activeWorkerContinuation?: ReturnType<typeof import("./prelaunch-web-deploy.mjs").loadQuantityV4ActiveWorkerContinuation>}} [independent] */
export function assertProtectedPrelaunchObservation(review, observation, phase, independent = {}) {
  const { productOffReceipt = null, reviewSha256, workerCheckpoint, ddlOnly = false, safeQuantityOff = false, activeWorkerContinuation } = independent;
  if (review?.feature === NUTRITION_VALIDATOR_FEATURE) return assertNutritionValidatorObservation(review, observation, phase);
  if (review?.feature === RECIPE_REQUEST_ROLE_FEATURE) return assertRecipeRequestRoleObservation(review, observation, phase);
  if (review?.feature === RECIPE_SAVE_RECOVERY_FEATURE) return assertRecipeSaveRecoveryObservation(review, observation, phase);
  if (independent.databaseMaintenance && review?.feature === COOKED_WEIGHT_ATTESTATION_FEATURE && phase === "after" && !ddlOnly) {
    return assertCookedWeightAttestationCurrentObservation(independent.databaseMaintenance.predecessor, observation,
      { safeQuantityOff: safeQuantityOff || independent.safeAttestationOff,
        quantityWriterState: independent.quantityOffReceipt || safeQuantityOff ? undefined : "on",
        approvedWorkerPolicy: independent.approvedWorkerPolicy, approvedWorkerSuccessor: independent.approvedWorkerSuccessor, databaseMaintenance: independent.databaseMaintenance });
  }
  if (activeWorkerContinuation && (review?.feature !== QUANTITY_V4_FEATURE || phase !== "after" || ddlOnly || safeQuantityOff)) throw new Error("Active worker authority is only for ordinary after-state continuation");
  if (independent.attestationSuccessor) {
    const successor = independent.attestationSuccessor;
    if (review.feature !== QUANTITY_V4_FEATURE || phase !== "after" || ddlOnly) throw new Error("Personal successor is only a current C04 boundary");
    assertCookedWeightAttestationPredecessor(successor.review, successor.predecessor);
    if (!isDeepStrictEqual(successor.predecessor.authority.database.review, review)) throw new Error("Personal successor cannot replace original C04 review");
    assertCookedWeightAttestationCurrentObservation(successor, observation, { safeQuantityOff, quantityWriterState: safeQuantityOff ? undefined : "on", approvedWorkerPolicy: independent.approvedWorkerPolicy, approvedWorkerSuccessor: independent.approvedWorkerSuccessor, databaseMaintenance: independent.databaseMaintenance });
    return observation;
  }
  const database = review?.database;
  if (!["before", "after"].includes(phase) || !database || !SHA.test(database.targetSha256)
    || !SHA.test(database.beforeCatalogSha256) || !SHA.test(database.afterCatalogSha256) || !SHA.test(database.immutableSha256)) {
    throw new Error("Protected database approved target/catalog pins required");
  }
  const expectedLedger = database[phase];
  const expectedCatalog = phase === "before" ? database.beforeCatalogSha256 : database.afterCatalogSha256;
  if (digest(JSON.stringify(observation?.target)) !== database.targetSha256 || !same(observation.ledger, expectedLedger)
    || observation.catalogSha256 !== expectedCatalog || observation.immutableSha256 !== protectedImmutableSha256(review, phase)
    || !SHA.test(observation.preservedRowsSha256) || observation.writerEnabled !== false || observation.active !== false) {
    throw new Error("Protected database target/ledger/catalog/immutable/OFF observation differs");
  }
  if (review.feature === COOKED_WEIGHT_FEATURE) {
    const scope = database.scopeTransition;
    let expectedProduct = true;
    if (phase === "after" && productOffReceipt) { assertCookedWeightProductOff(productOffReceipt, review, reviewSha256); expectedProduct = false; }
    if (!SHA.test(database.afterImmutableSha256) || !SHA.test(database.stableImmutableSha256)
      || observation.stableImmutableSha256 !== database.stableImmutableSha256 || observation.productWriterEnabled !== expectedProduct
      || !scope || observation.scope?.outerSha256 !== (phase === "before" ? scope.beforeOuterSha256 : scope.afterOuterSha256)
      || observation.scope?.aliasSha256 !== (phase === "before" ? null : scope.afterAliasSha256)
      || scope.afterAliasSha256 !== scope.beforeOuterSha256) throw new Error("C01 stable immutable/C03 ON/exact outer and predecessor alias differ");
  }
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) {
    if (observation.productWriterEnabled !== true || observation.cookedWeightWriterEnabled !== true || observation.quantityWriterEnabled !== true && !(independent.quantityOffReceipt && observation.quantityWriterEnabled === false)
      || observation.ledgerAuthority !== true || !SHA.test(observation.normalDataSha256)
      || observation.normalProjectionSha256 !== database.normalProjectionSha256 || observation.postimageRegistrySha256 !== database.postimageRegistrySha256
      || observation.attestationPostimageRegistrySha256 !== database.attestationPostimageRegistrySha256
      || observation.normalColumnsSha256 !== database.afterColumnsSha256 || !isDeepStrictEqual(observation.scope, database[phase === "before" ? "beforeScope" : "afterScope"])
      || observation.attestationScope?.outerSha256 !== database.attestationScope[phase === "before" ? "beforeOuterSha256" : "afterOuterSha256"]
      || observation.attestationScope?.aliasSha256 !== (phase === "before" ? null : database.attestationScope.afterAliasSha256)
      || (phase === "after" && (observation.attestationTablesPresent !== true || !SHA.test(observation.attestationRowsSha256)))
      || (ddlOnly && phase === "after" && observation.attestationRowsEmpty !== true)) throw new Error("Personal attestation original controls/data/facts/scope differ");
    assertAttestationWorker(review, observation.worker, safeQuantityOff || independent.safeAttestationOff, false, independent.approvedWorkerPolicy);
  }
  if (review.feature === QUANTITY_V4_FEATURE) {
    if (observation.productWriterEnabled !== true || observation.cookedWeightWriterEnabled !== true || observation.ledgerAuthority !== true
      || !SHA.test(observation.normalDataSha256) || observation.normalProjectionSha256 !== database.normalProjectionSha256
      || observation.postimageRegistrySha256 !== database.postimageRegistrySha256 || !isDeepStrictEqual(observation.scope, database[phase === "before" ? "beforeScope" : "afterScope"])
      || observation.normalColumnsSha256 !== database[phase === "before" ? "beforeColumnsSha256" : "afterColumnsSha256"]
      || (!safeQuantityOff && observation.worker?.credentialActive !== true)
      || observation.worker?.catalogFingerprint !== database[phase === "before" ? "workerCatalogBefore" : "workerCatalogAfter"]) throw new Error("C04 C03/C01 ON/ledger authority/data projection/scope/catalog/credential differs");
    const expected = activeWorkerContinuation ? assertQuantityV4ActiveWorkerContinuation(review, activeWorkerContinuation) : workerCheckpoint ?? database.workerBaseline;
    if (activeWorkerContinuation) {
      if (observation.worker.queued !== 0 || observation.worker.processing !== 0 || observation.worker.permitHeld !== false
        || observation.worker.activeEnqueueSessions !== 0 || observation.worker.policyStableSha256 !== expected.policyStableSha256) throw new Error("C04 active worker fresh zero/stable policy differs");
    } else if (workerCheckpoint && !safeQuantityOff) {
      assertQuantityV4WorkerCheckpoint(review, workerCheckpoint, workerCheckpoint.serviceState === "stopped" ? "before" : "after");
      if ((ddlOnly && phase === "before" && observation.normalDataSha256 !== workerCheckpoint.normalDataSha256)
        || observation.worker.queued !== 0 || observation.worker.processing !== 0 || observation.worker.permitHeld !== false
        || observation.worker.activeEnqueueSessions !== 0) throw new Error("C04 worker fresh queue/permit/enqueue state differs");
    } else if (!safeQuantityOff && review.quantityStage === "worker") throw new Error("C04 worker fresh checkpoint required");
    if (ddlOnly && observation.metadataNull !== true) throw new Error("C04 DDL preparation may not populate the new metadata columns");
    if (!safeQuantityOff) for (const key of ["credentialGeneration", "credentialRowSha256", "policyRowSha256", "schemaIdentity", "snapshotDigest", "workerPolicyEnabled", "workerReleaseSha"]) {
      if (observation.worker[key] !== expected[key]) throw new Error("C04 worker fresh credential/policy prestate differs");
    }
  }
  return observation;
}

function assertAttestationWorker(review, worker, safeOff = false, workerControlTransition = false,
  approvedPolicy = /** @type {{policyRowSha256: string, workerPolicyEnabled: boolean} | null} */ (null), approvedSuccessor = null) {
  if (!worker || worker.catalogFingerprint !== QUANTITY_V4_WORKER_CATALOG_AFTER) throw new Error("Personal attestation worker critical catalog differs");
  const originalWorker = approvedSuccessor ? assertV74WorkerSuccessor({ ...approvedSuccessor, baseline: review.database.workerBaseline, approvedPolicy }) : null;
  const fingerprintWorker = originalWorker ? fingerprintWorkerSuccessor(originalWorker, approvedSuccessor.fingerprintRecovery,
    approvedSuccessor.origin, V74_ACTIVATION_SHA256) : null;
  const successorWorker = approvedSuccessor?.v85?.proof ? assertV85Successor({authority:approvedSuccessor.v85,worker:fingerprintWorker,
    policy:(approvedSuccessor.fingerprintRecovery.compensation??approvedSuccessor.fingerprintRecovery.receipt).after.policy,
    origin:approvedSuccessor.origin,recovery:approvedSuccessor.fingerprintRecovery}) : fingerprintWorker;
  for (const key of ["credentialGeneration", "credentialRowSha256", "policyRowSha256", "policyStableSha256", "schemaIdentity", "snapshotDigest", "workerPolicyEnabled", "workerReleaseSha"]) {
    // Only the original controlled worker CLI checks the enabled/timestamp whole-row transition.
    // Its fixed observer retains the exact stable policy, credential and critical catalog here.
    if (workerControlTransition && ["policyRowSha256", "workerPolicyEnabled"].includes(key)) continue;
    const expected = successorWorker ? successorWorker[key] : approvedPolicy && ["policyRowSha256", "workerPolicyEnabled"].includes(key) ? approvedPolicy[key] : review.database.workerBaseline[key];
    if (worker[key] !== expected) throw new Error("Personal attestation original worker credential/policy differs");
  }
  if (!safeOff && (worker.credentialActive !== true || worker.queued !== 0 || worker.processing !== 0
    || worker.permitHeld !== false || worker.activeEnqueueSessions !== 0)) throw new Error("Personal attestation fresh worker expiry/zero state differs");
}

export function assertCookedWeightAttestationCurrentObservation(successor, observation, { quantityWriterState = /** @type {"off" | "on" | undefined} */ (undefined), safeQuantityOff = false, workerControlTransition = false, approvedWorkerSuccessor = null, approvedWorkerPolicy = /** @type {{policyRowSha256: string, workerPolicyEnabled: boolean} | null} */ (null), databaseMaintenance = /** @type {ReturnType<typeof loadNutritionValidatorMaintenance> | undefined} */ (undefined) } = {}) {
  assertCookedWeightAttestationReview(successor.review);
  const review = successor.review;
  if (databaseMaintenance) {
    nutritionValidatorMaintenanceBinding(databaseMaintenance);
    if (databaseMaintenance.predecessor.pointer.sha256 !== successor.pointer.sha256
      || !same((databaseMaintenance.nutritionPredecessor ?? databaseMaintenance).review.database.before, review.database.after)) throw new Error("Nutrition current229 original228 predecessor differs");
  }
  const database = databaseMaintenance?.review.database ?? review.database;
  if (digest(JSON.stringify(observation.target)) !== database.targetSha256 || !same(observation.ledger, database.after)
    || observation.catalogSha256 !== database.afterCatalogSha256 || observation.immutableSha256 !== database.afterImmutableSha256
    || !isDeepStrictEqual(observation.scope, database.afterScope) || observation.ledgerAuthority !== true || observation.active !== false
    || observation.productWriterEnabled !== true || observation.cookedWeightWriterEnabled !== true
    || observation.normalColumnsSha256 !== database.afterColumnsSha256 || observation.normalProjectionSha256 !== database.normalProjectionSha256
    || observation.postimageRegistrySha256 !== database.postimageRegistrySha256 || !SHA.test(observation.normalDataSha256)
    || observation.attestationPostimageRegistrySha256 !== database.attestationPostimageRegistrySha256
    || observation.attestationScope?.outerSha256 !== database.attestationScope.afterOuterSha256
    || observation.attestationScope?.aliasSha256 !== database.attestationScope.afterAliasSha256
    || observation.attestationTablesPresent !== true || !SHA.test(observation.attestationRowsSha256)
    || typeof observation.attestationWriterEnabled !== "boolean") throw new Error("Personal attestation checked current228 target/catalog/source/facts differs");
  if (databaseMaintenance && (observation.stableImmutableSha256 !== database.stableImmutableSha256
    || !isDeepStrictEqual(observation.nutritionValidator, database.functionAfter))) throw new Error("Nutrition current229 exact function postimage differs");
  if (databaseMaintenance?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE) assertRecipeSaveRecoveryCurrentFields(databaseMaintenance.review,observation);
  if (databaseMaintenance?.review.feature === RECIPE_REQUEST_ROLE_FEATURE) assertRecipeRequestRoleCurrentFields(databaseMaintenance.review,observation);
  const quantity = observation.quantityWriterEnabled ?? observation.writerEnabled;
  if (typeof quantity !== "boolean" || (quantityWriterState && quantity !== (quantityWriterState === "on"))) throw new Error("Personal attestation current quantity state differs");
  assertAttestationWorker(review, observation.worker, safeQuantityOff || workerControlTransition, workerControlTransition, approvedWorkerPolicy, approvedWorkerSuccessor);
  if(approvedWorkerSuccessor?.v85?.proof) {
    const after=approvedWorkerSuccessor.v85.proof.after;
    if(!isDeepStrictEqual(observation.fingerprintPolicy,after.full.fingerprintPolicy)||observation.worker.policyRowSha256!==after.worker.policyRowSha256
      ||observation.worker.policyStableSha256!==after.worker.policyStableSha256)throw new Error('v85 exact live full policy differs');
  } else assertFingerprintCurrentPolicy(approvedWorkerSuccessor?.fingerprintRecovery, observation.fingerprintPolicy, observation.worker);
  return observation;
}

export function assertNutritionValidatorObservation(review, observation, phase) {
  assertNutritionValidatorReview(review);
  const db = review.database;
  if (!["before", "after"].includes(phase) || digest(JSON.stringify(observation?.target)) !== db.targetSha256
    || !same(observation.ledger, db[phase]) || observation.catalogSha256 !== db[phase === "before" ? "beforeCatalogSha256" : "afterCatalogSha256"]
    || observation.immutableSha256 !== db.immutableSha256 || observation.stableImmutableSha256 !== db.stableImmutableSha256 || observation.ledgerAuthority !== true || observation.active !== false
    || !same(observation.scope, db.afterScope) || observation.attestationScope?.outerSha256 !== db.attestationScope.afterOuterSha256
    || observation.attestationScope?.aliasSha256 !== db.attestationScope.afterAliasSha256
    || observation.normalColumnsSha256 !== db.afterColumnsSha256 || observation.normalProjectionSha256 !== db.normalProjectionSha256
    || observation.postimageRegistrySha256 !== db.postimageRegistrySha256 || observation.attestationPostimageRegistrySha256 !== db.attestationPostimageRegistrySha256
    || !isDeepStrictEqual(observation.nutritionValidator, db[phase === "before" ? "functionBefore" : "functionAfter"])
    || ![observation.productWriterEnabled, observation.cookedWeightWriterEnabled, observation.quantityWriterEnabled, observation.attestationWriterEnabled, observation.writerEnabled, observation.attestationTablesPresent].every(value => value === true)
    || !["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256"].every(key => SHA.test(observation[key] ?? ""))) {
    throw new Error("Nutrition exact current228/229 function/data/all-controls-ON observation differs");
  }
  assertAttestationWorker(review, observation.worker);
  return observation;
}

export function classifyProtectedPrelaunchOutcome(review, observation, independent) {
  try { assertProtectedPrelaunchObservation(review, observation, "after", independent); return "committed"; } catch { /* Compare only approved images. */ }
  try { assertProtectedPrelaunchObservation(review, observation, "before", independent); return "not_applied"; } catch { return "unknown"; }
}

// Existing controlled-adapter/session/backup boundaries are supplied explicitly for isolated fixtures.
// This is not an arbitrary SQL/path/catalog runner: expected images and source bytes precede all I/O.
export function createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary, checkCancelled = () => {}, workerCheckpoint = /** @type {Record<string, unknown> | undefined} */ (undefined) }) {
  const requestRole = review?.feature === RECIPE_REQUEST_ROLE_FEATURE;
  const recipeSave = review?.feature === RECIPE_SAVE_RECOVERY_FEATURE;
  const maintenance = requestRole || recipeSave || review?.feature === NUTRITION_VALIDATOR_FEATURE;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(operationId ?? "")
    || !SHA.test(reviewSha256) || review?.schema !== "homecook.prelaunch-protected-rollout-review.v1"
    || !["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature) || review.approved?.database !== true || review.approved.writerOn !== false
    || (maintenance ? review.readerPrecedesDatabase !== true || reviewSha256 !== (requestRole ? RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN : recipeSave ? RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN : NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN).sha256
      : review.allNewShapesOff !== true || review.legacyReaderCompatible !== true) || !SHA.test(review.isolatedEvidenceSha256)) {
    throw new Error("Protected database exact approval/OFF/legacy compatibility evidence required");
  }
  // Neither the caller nor later observations may replace the reviewed expectations.
  if ([COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature)) assertProtectedRolloutReview(review);
  review = structuredClone(review);
  workerCheckpoint = structuredClone(workerCheckpoint);
  const quantity = review.feature === QUANTITY_V4_FEATURE, attestation = review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE;
  if (quantity && review.quantityStage === "worker") assertQuantityV4WorkerCheckpoint(review, workerCheckpoint, "before");
  const independent = { workerCheckpoint, ddlOnly: quantity || attestation || maintenance };
  const check = (observation, phase) => assertProtectedPrelaunchObservation(review, observation, phase, independent);
  const applicationName = `${attestation ? "protected-attestation" : quantity ? `protected-c04-${review.quantityStage}` : review.feature === COOKED_WEIGHT_FEATURE ? "protected-c01" : "protected-c03"}-${operationId}`;
  async function prepare() {
    const plan = planProtectedPrelaunchMigrations(review, await readMigrations());
    await assertBoundary();
    const observation = await adapter.observe(undefined, applicationName);
    check(observation, "before");
    return { plan, observation };
  }
  const binding = () => ({ schema: "homecook.prelaunch-protected-db-attempt.v1", reviewSha256, operationId, applicationName, from: review.from, to: review.to,
    ...(quantity ? { feature: QUANTITY_V4_FEATURE, quantityStage: review.quantityStage, journalFile: "attempt.json" } : {}),
    ...(attestation ? { feature: COOKED_WEIGHT_ATTESTATION_FEATURE, journalFile: "attempt.json", predecessorQuantity: review.predecessorQuantity } : {}),
    ...(maintenance ? { feature: review.feature, journalFile: "attempt.json", ...(requestRole ? {predecessorRecipeSave:review.predecessorRecipeSave} : recipeSave ? {predecessorNutrition:review.predecessorNutrition} : {predecessorAttestation: review.predecessorAttestation}),
      sourceReaderRef: review.sourceReaderRef, readerFloor: review.sourceReaderRef } : {}) });
  const receipt = (backup, preservedRowsSha256, normalDataSha256, attestationRowsSha256, controlsSha256) => {
    const result = { ...binding(), status: "committed", targetSha256: review.database.targetSha256,
      databasePlanSha256: digest(JSON.stringify({ source: review.database.after, applied: review.database.after })),
      catalogSha256: review.database.afterCatalogSha256, immutableSha256: protectedImmutableSha256(review),
      writerEnabled: false, readerReady: false, backwardCompatible: false, backup, preservedRowsSha256, rowsPreservedInTransaction: true };
    if (review.feature === COOKED_WEIGHT_FEATURE) Object.assign(result, { feature: COOKED_WEIGHT_FEATURE, productWriterEnabled: true,
      stableImmutableSha256: review.database.stableImmutableSha256, predecessorProtected: review.predecessorProtected });
    if (attestation) Object.assign(result, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE, productWriterEnabled: true, cookedWeightWriterEnabled: true,
      quantityWriterEnabled: true, predecessorQuantity: review.predecessorQuantity, normalDataSha256, attestationRowsEmpty: true, rowsPreservedInTransaction: true });
    if (recipeSave) Object.assign(result,{receiptColumnInitiallyNull:true,predecessorNutrition:review.predecessorNutrition});
    if (requestRole) Object.assign(result,{requestRoleCorrected:true,predecessorRecipeSave:review.predecessorRecipeSave});
    if (maintenance) Object.assign(result, { writerEnabled: true, readerReady: true, sourceReaderRef: review.sourceReaderRef,
      readerFloor: review.sourceReaderRef, ...(requestRole ? {} : recipeSave ? {recipeSaveRecoveryWritesEnabled:true} : {validatorV4WritesEnabled:true}), productWriterEnabled: true, cookedWeightWriterEnabled: true,
      quantityWriterEnabled: true, attestationWriterEnabled: true, workerPolicyEnabled: true, ...(recipeSave || requestRole ? {} : {predecessorAttestation: review.predecessorAttestation}),
      normalDataSha256, attestationRowsSha256, controlsSha256, controlsPreservedInTransaction: true });
    if (quantity) Object.assign(result, { productWriterEnabled: true, cookedWeightWriterEnabled: true, predecessorProtected: review.predecessorProtected,
      normalDataSha256, metadataNull: true, interstageDataContinuityAsserted: false,
      normalProjectionSha256: review.database.normalProjectionSha256, postimageRegistrySha256: review.database.postimageRegistrySha256,
      ...(review.quantityStage === "worker" ? { consumersReceiptSha256: review.consumersReceipt.sha256 } : {}) });
    return result;
  };
  return {
    async plan() {
      if (await journal.read()) throw new Error("Protected database attempt already exists; reconcile before a new attempt");
      const { plan } = await prepare();
      return { source: plan.after, applied: plan.before, pending: plan.pending.map(row => row.filename), mutationPerformed: false };
    },
    async apply() {
      if (await journal.read()) throw new Error("Protected database attempt already exists; automatic retry is prohibited");
      if (typeof adapter.migrationSession !== "function") throw new Error("Protected migration session required; generic postgres fallback prohibited");
      const { plan, observation } = await prepare();
      checkCancelled();
      let session;
      let backup;
      let preservedRowsSha256;
      let normalDataSha256;
      let attestationRowsSha256;
      let controlsSha256;
      let rowsPreservedInTransaction = false;
      let commitDispatched = false;
      let guardCreated = false;
      try {
        await journal.write({ ...binding(), status: "applying_precommit", target: observation.target }, true);
        guardCreated = true;
        session = adapter.migrationSession(applicationName);
        const { searchPath, timeZone } = session.postgresContext ?? {};
        if (typeof searchPath !== "string" || typeof timeZone !== "string") throw new Error("Protected migration postgres context unavailable");
        await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='180s'; SET LOCAL idle_in_transaction_session_timeout='180s'; SET LOCAL standard_conforming_strings=on; SELECT pg_advisory_xact_lock(104230921,77101); LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE; SET LOCAL ROLE postgres; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true);`);
        if ([COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature)) await session.query("SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE;");
        if (quantity || attestation || maintenance) {
          await session.query("SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE;");
          if (attestation || maintenance || review.quantityStage === "worker") {
            // The policy/credential tables grant postgres SELECT only. Lock through the original
            // fixed admin session, then restore the existing postgres observation context.
            if ((await session.query("SELECT session_user;")).trim() !== "supabase_admin") throw new Error("C04 worker locks require the original admin session");
            await session.query("RESET ROLE;");
            if ((await session.query("SELECT current_user;")).trim() !== "supabase_admin") throw new Error("C04 original worker lock role differs");
            await session.query("LOCK TABLE private.quantity_input_v4_policy IN SHARE MODE; LOCK TABLE private.youtube_extraction_current_policy IN SHARE MODE; LOCK TABLE private.youtube_extraction_worker_credentials IN SHARE MODE; LOCK TABLE public.youtube_extraction_jobs IN SHARE ROW EXCLUSIVE MODE; LOCK TABLE public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE;");
            await session.query(`SET LOCAL ROLE postgres; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true);`);
            if ((await session.query("SELECT current_user;")).trim() !== "postgres") throw new Error("C04 worker observation role restoration differs");
          }
        }
        if (maintenance) await session.query("SELECT singleton FROM private.cooked_weight_user_attestation_control WHERE singleton FOR SHARE;");
        const query = sql => session.query(sql);
        const locked = check(await adapter.observe(query, applicationName), "before");
        preservedRowsSha256 = locked.preservedRowsSha256;
        normalDataSha256 = locked.normalDataSha256;
        if (maintenance) { attestationRowsSha256 = locked.attestationRowsSha256; controlsSha256 = locked.controlsSha256; }
        const snapshot = (await session.query("SELECT pg_export_snapshot();")).trim();
        if (!/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/u.test(snapshot)) throw new Error("Protected backup snapshot identity invalid");
        backup = await adapter.backup({ snapshot, timeout: 160000, target: observation.target });
        if (!backup || backup.fullArchiveDecoded !== true || !SHA.test(backup.sha256) || !SHA.test(backup.rolesSha256)
          || !same(backup.target, observation.target) || backup.snapshot !== snapshot) throw new Error("Protected full snapshot/roles backup evidence differs");
        const backedUp = check(await adapter.observe(query, applicationName), "before");
        if (backedUp.preservedRowsSha256 !== preservedRowsSha256 || ((quantity || attestation || maintenance) && backedUp.normalDataSha256 !== normalDataSha256)
          || maintenance && (backedUp.attestationRowsSha256 !== attestationRowsSha256 || backedUp.controlsSha256 !== controlsSha256)) throw new Error("Protected rows changed in the locked backup snapshot");
        await assertBoundary();
        checkCancelled();
        // Payload/catalog work remains postgres; only ledger writes use its existing owner.
        for (const row of plan.pending) {
          if (quantity || maintenance) {
            await session.query(`SET LOCAL ROLE ${row.actor}; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true);`);
            if ((await session.query("SELECT current_user;")).trim() !== row.actor) throw new Error("C04 exact payload actor differs");
          }
          await session.query(row.payload);
          if ((quantity || maintenance) && (await session.query("SELECT current_user;")).trim() !== row.actor) throw new Error("C04 payload role restoration differs");
          await session.query(`SET LOCAL ROLE supabase_admin; INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES (${literal(row.filename)},${literal(row.sha256)}); SET LOCAL ROLE postgres;`);
        }
        const post = check(await adapter.observe(query, applicationName), "after");
        if (post.preservedRowsSha256 !== preservedRowsSha256 || ((quantity || attestation || maintenance) && post.normalDataSha256 !== normalDataSha256)
          || maintenance && (post.attestationRowsSha256 !== attestationRowsSha256 || post.controlsSha256 !== controlsSha256)) throw new Error("Protected rows changed inside SQL/ledger transaction");
        rowsPreservedInTransaction = true;
        await assertBoundary();
        checkCancelled();
        await journal.write({ ...binding(), status: "commit_dispatch_guard", target: observation.target, backup, preservedRowsSha256, ...(quantity || attestation || maintenance ? { normalDataSha256, rowsPreservedInTransaction } : {}),
          ...(maintenance ? { attestationRowsSha256, controlsSha256, controlsPreservedInTransaction: rowsPreservedInTransaction } : {}) });
        commitDispatched = true;
        await session.query("COMMIT;");
        await session.close();
        await adapter.reloadSchema(operationId);
        await assertBoundary();
        check(await adapter.observe(undefined, applicationName), "after");
        const result = receipt(backup, preservedRowsSha256, normalDataSha256, attestationRowsSha256, controlsSha256);
        await journal.write(result);
        return result;
      } catch (error) {
        if (!guardCreated) throw error;
        let rolledBack = false;
        if (session && !commitDispatched) {
          try { await session.query("ROLLBACK;"); await session.close(); rolledBack = true; } catch { session.stop(); }
        } else if (session) session.stop();
        const status = rolledBack ? "rolled_back_before_commit" : "unknown";
        await journal.write({ ...binding(), status, target: observation.target, commitDispatched, backup: backup ?? null, preservedRowsSha256: preservedRowsSha256 ?? null,
          ...(quantity || attestation || maintenance ? { normalDataSha256: normalDataSha256 ?? null, rowsPreservedInTransaction } : {}),
          ...(maintenance ? { attestationRowsSha256: attestationRowsSha256 ?? null, controlsSha256: controlsSha256 ?? null, controlsPreservedInTransaction: rowsPreservedInTransaction } : {}) });
        throw Object.assign(error instanceof Error ? error : new Error("Protected database outcome requires inspection"), {
          databaseState: { changed: !rolledBack, outcome: status, backup, automaticRetryAllowed: false },
        });
      }
    },
    async reconcile() {
      const attempt = await journal.read();
      if (!attempt || attempt.schema !== binding().schema || attempt.reviewSha256 !== reviewSha256
        || attempt.operationId !== operationId || attempt.applicationName !== applicationName
        || attempt.from !== review.from || attempt.to !== review.to || !["applying_precommit", "commit_dispatch_guard", "unknown", "rolled_back_before_commit"].includes(attempt.status)
        || digest(JSON.stringify(attempt.target)) !== review.database.targetSha256) throw new Error("Protected reconcile attempt binding differs");
      planProtectedPrelaunchMigrations(review, await readMigrations());
      await assertBoundary();
      if (maintenance && (attempt.feature !== review.feature || attempt.sourceReaderRef !== review.sourceReaderRef
        || !same(requestRole ? attempt.predecessorRecipeSave : recipeSave ? attempt.predecessorNutrition : attempt.predecessorAttestation, requestRole ? review.predecessorRecipeSave : recipeSave ? review.predecessorNutrition : review.predecessorAttestation))) throw new Error("Nutrition reconcile original source/228 intent differs");
      if (attestation && (attempt.feature !== COOKED_WEIGHT_ATTESTATION_FEATURE || !isDeepStrictEqual(attempt.predecessorQuantity, review.predecessorQuantity))) throw new Error("Personal attestation reconcile original predecessor differs");
      if (quantity && (attempt.feature !== QUANTITY_V4_FEATURE || attempt.quantityStage !== review.quantityStage)) throw new Error("C04 reconcile stage differs");
      if ((quantity || attestation || maintenance) && attempt.journalFile !== "attempt.json") throw new Error("C04 reconcile journal locator differs");
      const observed = await adapter.observe(undefined, applicationName);
      // Reconcile reads a closed attempt. It is not admission for another transaction:
      // ordinary writes after rollback/COMMIT cannot rewrite the original snapshot proof.
      const outcome = quantity && observed.metadataNull !== true ? "unknown"
        : classifyProtectedPrelaunchOutcome(review, observed, quantity ? { workerCheckpoint } : independent);
      if ((quantity || attestation || maintenance) && outcome === "not_applied") {
        const originalIntent = attempt.rowsPreservedInTransaction === true && SHA.test(attempt.normalDataSha256 ?? "")
          && SHA.test(attempt.preservedRowsSha256 ?? "") && attempt.backup?.fullArchiveDecoded === true
          && SHA.test(attempt.backup.sha256 ?? "") && SHA.test(attempt.backup.rolesSha256 ?? "") && same(attempt.backup.target, attempt.target);
        const rollbackEvidence = attempt.commitDispatched === false
          && (attempt.rowsPreservedInTransaction === false || (attempt.rowsPreservedInTransaction === true && originalIntent));
        const beforeProof = (attempt.status === "rolled_back_before_commit" && rollbackEvidence)
          || (attempt.status === "applying_precommit" && attempt.commitDispatched === undefined && attempt.rowsPreservedInTransaction === undefined)
          || (attempt.status === "commit_dispatch_guard" && attempt.commitDispatched === undefined && originalIntent)
          || (attempt.status === "unknown" && (rollbackEvidence || (attempt.commitDispatched === true && originalIntent)));
        if (!beforeProof) throw new Error("C04 not-applied reconcile lacks original rollback/dispatch intent evidence");
      }
      if (outcome === "unknown") throw new Error("Protected commit outcome remains unknown; retain guard and backup");
      if (outcome === "committed" && (!attempt.backup || attempt.backup.fullArchiveDecoded !== true
        || !SHA.test(attempt.backup.sha256) || !SHA.test(attempt.backup.rolesSha256)
        || !same(attempt.backup.target, attempt.target))) throw new Error("Protected committed outcome has no bound full backup");
      if (outcome === "committed" && (!attempt.commitDispatched && attempt.status !== "commit_dispatch_guard" || !SHA.test(attempt.preservedRowsSha256))) {
        throw new Error("Protected committed reconcile lacks the verified commit intent/row preservation binding");
      }
      if ((quantity || attestation || maintenance) && outcome === "committed" && (!SHA.test(attempt.normalDataSha256) || attempt.rowsPreservedInTransaction !== true)) throw new Error("C04 committed reconcile lacks original normal-data transaction evidence");
      if (maintenance && outcome === "committed" && (!SHA.test(attempt.attestationRowsSha256 ?? "")
        || !SHA.test(attempt.controlsSha256 ?? "") || attempt.controlsPreservedInTransaction !== true)) throw new Error("Nutrition committed reconcile lacks original facts/control preservation intent");
      if (outcome === "committed") {
        await adapter.reloadSchema(operationId);
        await assertBoundary();
        check(await adapter.observe(undefined, applicationName), "after");
      }
      const result = outcome === "committed" ? receipt(attempt.backup, attempt.preservedRowsSha256, attempt.normalDataSha256, attempt.attestationRowsSha256, attempt.controlsSha256) : { ...binding(), status: "not_applied", targetSha256: review.database.targetSha256,
        backup: attempt.backup ?? null, automaticRetryAllowed: false };
      await journal.write(result);
      return result;
    },
  };
}

async function privateFile(file, repositoryRoot) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error("Database configuration/baseline must be an owner-only regular file");
  const resolved = await realpath(file);
  const repo = await realpath(repositoryRoot);
  if (resolved.startsWith(`${repo}${path.sep}`)) throw new Error("Database configuration/baseline must be outside repository");
  return readFile(file, "utf8");
}

export async function readPrelaunchMigrationFiles(repositoryRoot) {
    const directory = path.join(repositoryRoot, "supabase/migrations");
    const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    return Promise.all(names.map(async (filename) => {
      if (!FILE.test(filename)) throw new Error("Unsafe migration filename");
      const file = path.join(directory, filename);
      if (!(await lstat(file)).isFile()) throw new Error("Migration must be a regular file");
      const bytes = await readFile(file);
      let sql;
      try { sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("Migration must be valid UTF-8"); }
      return { filename, sha256: digest(bytes), sql };
    }));
  }

/** @param {{ repositoryRoot: string, configPath: string, backupRoot: string, baselinePath?: string, logFd?: number, checkCancelled?: () => void }} options */
export function createPrelaunchDatabase({ repositoryRoot, configPath, backupRoot, baselinePath, checkCancelled }) {
  let dockerEnv;
  function run(args, options = {}) {
    const result = spawnSync("docker", args, { env: dockerEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options });
    if (result.status !== 0) throw Object.assign(new Error(`Database ${args[0]} operation failed; database output withheld`), {
      processStatus: result.status,
      processInterrupted: Boolean(result.error || result.signal),
    });
    return result.stdout;
  }
  function psql(identity, sql) {
    return run(["exec", "-i", identity.postgresContainerId, "psql", "--username", "supabase_admin", "--dbname", "postgres", "--no-psqlrc", "--no-align", "--tuples-only", "--quiet", "--set", "ON_ERROR_STOP=1"], { input: sql });
  }
  const adapter = {
    async inspect() {
      const config = parseFullLocalProductionConfig(await privateFile(configPath, repositoryRoot));
      if (!dockerEnv) {
        const pinned = readPinnedLocalDockerTarget();
        dockerEnv = { ...process.env, DOCKER_HOST: pinned.docker_host };
        delete dockerEnv.DOCKER_CONTEXT;
        delete dockerEnv.DOCKER_TLS_VERIFY;
        delete dockerEnv.DOCKER_CERT_PATH;
      }
      const ids = run(["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${config.FULL_LOCAL_COMPOSE_PROJECT_NAME}`]).trim().split(/\s+/u).filter(Boolean);
      if (!ids.length) throw new Error("No exact configured database container");
      const containers = JSON.parse(run(["inspect", ...ids]));
      const volumes = JSON.parse(run(["volume", "inspect", config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]));
      const selected = selectFullLocalProductionResources({ config, containers, volumes });
      const container = containers.find((item) => item.Id === selected.postgresContainerId);
      const mounts = container.Mounts.filter((mount) => mount.Destination === "/var/lib/postgresql/data");
      if (mounts.length !== 1 || mounts[0].Type !== "volume" || mounts[0].Name !== selected.postgresVolumeName || mounts[0].RW !== true) throw new Error("Database volume mount identity mismatch");
      return selected;
    },
    async readState(identity) {
      const available = JSON.parse(psql(identity, "SELECT json_build_object('exists',to_regclass('homecook_deploy.migrations') IS NOT NULL,'supabase',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL);"));
      const applied = available.exists ? JSON.parse(psql(identity, "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;")) : [];
      const supabaseVersions = available.supabase ? JSON.parse(psql(identity, "SELECT coalesce(json_agg(version ORDER BY version),'[]'::json) FROM supabase_migrations.schema_migrations;")) : [];
      return { exists: available.exists, applied, supabaseVersions };
    },
    async backup(identity) {
      await mkdir(backupRoot, { recursive: true, mode: 0o700 });
      const stat = await lstat(backupRoot);
      const resolved = await realpath(backupRoot);
      const repo = await realpath(repositoryRoot);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid() || resolved === repo || resolved.startsWith(`${repo}${path.sep}`)) throw new Error("Backup root must be owner-only directory outside repository");
      const directory = await mkdtemp(path.join(resolved, "prelaunch-db-"));
      const dump = path.join(directory, "postgres.dump");
      const fd = openSync(dump, "wx", 0o600);
      try { run(["exec", identity.postgresContainerId, "pg_dump", "--username", "supabase_admin", "--dbname", "postgres", "--format=c"], { stdio: ["ignore", fd, "pipe"] }); }
      finally { closeSync(fd); }
      const readFd = openSync(dump, "r");
      try { run(["exec", "-i", identity.postgresContainerId, "pg_restore", "--list"], { stdio: [readFd, "pipe", "pipe"] }); }
      finally { closeSync(readFd); }
      const bytes = await readFile(dump);
      if (!bytes.length) throw new Error("Empty database backup");
      await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({ schema: "homecook.prelaunch-db-backup.v1", createdAt: new Date().toISOString(), sha256: digest(bytes), bytes: bytes.length, postgresContainerId: identity.postgresContainerId })}\n`, { flag: "wx", mode: 0o600 });
      return dump;
    },
    async transact(identity, expectedState, baselineRows, pending) {
      const expectedRows = JSON.stringify(expectedState.applied);
      const expectedSupabase = JSON.stringify(expectedState.supabaseVersions);
      const insert = (row) => `INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES (${literal(row.filename)},${literal(row.sha256)});`;
      const sql = [
        "BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL standard_conforming_strings=on;",
        "SELECT pg_advisory_xact_lock(104230921,77101);",
        `DO $guard$ BEGIN IF (to_regclass('homecook_deploy.migrations') IS NOT NULL) <> ${expectedState.exists ? "true" : "false"} THEN RAISE EXCEPTION 'Migration history changed'; END IF; END $guard$;`,
        `DO $guard$ DECLARE versions jsonb := '[]'::jsonb; BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN EXECUTE 'SELECT coalesce(jsonb_agg(version ORDER BY version), ''[ ]''::jsonb) FROM supabase_migrations.schema_migrations' INTO versions; END IF; IF versions <> ${literal(expectedSupabase)}::jsonb THEN RAISE EXCEPTION 'Supabase migration history changed'; END IF; END $guard$;`,
        "CREATE SCHEMA IF NOT EXISTS homecook_deploy; REVOKE ALL ON SCHEMA homecook_deploy FROM PUBLIC;",
        "CREATE TABLE IF NOT EXISTS homecook_deploy.migrations(filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON homecook_deploy.migrations FROM PUBLIC;",
        "DO $acl$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON SCHEMA homecook_deploy FROM %I',role_name); EXECUTE format('REVOKE ALL ON homecook_deploy.migrations FROM %I',role_name); END IF; END LOOP; END $acl$;",
        `DO $guard$ BEGIN IF (SELECT coalesce(jsonb_agg(t ORDER BY filename),'[]'::jsonb) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t) <> ${literal(expectedRows)}::jsonb THEN RAISE EXCEPTION 'Migration history changed'; END IF; END $guard$;`,
        ...(!expectedState.exists ? baselineRows.map(insert) : []),
        ...pending.flatMap((row) => [row.sql, insert(row)]),
        "NOTIFY pgrst, 'reload schema'; COMMIT;",
      ].join("\n");
      try { psql(identity, sql); }
      catch (error) {
        // ON_ERROR_STOP exit 3 is a server SQL error: this single transaction's
        // connection closes without COMMIT. Transport failures remain uncertain.
        if (error.processStatus === 3 && error.processInterrupted === false) error.transactionRolledBack = true;
        throw error;
      }
    },
  };
  return createPrelaunchDatabaseEngine({ readMigrations: () => readPrelaunchMigrationFiles(repositoryRoot), adapter, checkCancelled, readBaseline: async () => {
    if (!baselinePath) return undefined;
    return JSON.parse(await privateFile(baselinePath, repositoryRoot));
  } });
}


export const RECIPE_SAVE_SCOPE_SQL = `SELECT jsonb_build_object('outerSha256',
 encode(sha256(convert_to(jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text,'UTF8')),'hex'),
 'aliasSha256',(SELECT encode(sha256(convert_to(jsonb_build_array(replace(pg_get_functiondef(a.oid),'CREATE OR REPLACE FUNCTION private.verify_scope_pre_recipe_future_http_replay_20261014()','CREATE OR REPLACE FUNCTION private.verify_full_local_internal_scope()'),pg_get_userbyid(a.proowner),a.proacl,a.proconfig,a.prosecdef,a.provolatile,a.proparallel,a.proleakproof,a.proisstrict)::text,'UTF8')),'hex') FROM pg_proc a WHERE a.oid=to_regprocedure('private.verify_scope_pre_recipe_future_http_replay_20261014()')))
 FROM pg_proc p WHERE p.oid=to_regprocedure('private.verify_full_local_internal_scope()');`;
export function assertRecipeSaveRecoveryCurrentFields(review,observation) {
  const db=review.database;
  if (observation.recipePostimageRegistrySha256 !== RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256
    || !isDeepStrictEqual(observation.recipeFunctions,db.recipeFunctionsAfter) || observation.receiptColumnsSha256 !== db.receiptColumnsAfterSha256
    || !isDeepStrictEqual(observation.recipeScope,{outerSha256:db.recipeScope.afterOuterSha256,aliasSha256:db.recipeScope.afterAliasSha256})) throw new Error("Recipe-save current231 exact function/receipt/scope differs");
}
export function assertRecipeSaveRecoveryObservation(review,observation,phase) {
  assertRecipeSaveRecoveryReview(review);const db=review.database,before=phase==="before";
  if (!["before","after"].includes(phase) || digest(JSON.stringify(observation?.target))!==db.targetSha256
    || !isDeepStrictEqual(observation.ledger,db[phase]) || observation.catalogSha256!==db[before?"beforeCatalogSha256":"afterCatalogSha256"]
    || observation.immutableSha256!==db[before?"immutableSha256":"afterImmutableSha256"] || observation.stableImmutableSha256!==db.stableImmutableSha256
    || !isDeepStrictEqual(observation.scope,db[before?"beforeScope":"afterScope"]) || observation.ledgerAuthority!==true || observation.active!==false
    || observation.normalColumnsSha256!==db.afterColumnsSha256 || observation.normalProjectionSha256!==db.normalProjectionSha256
    || observation.postimageRegistrySha256!==db.postimageRegistrySha256 || observation.attestationPostimageRegistrySha256!==db.attestationPostimageRegistrySha256
    || observation.recipePostimageRegistrySha256!==RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256 || !isDeepStrictEqual(observation.recipeFunctions,db[before?"recipeFunctionsBefore":"recipeFunctionsAfter"])
    || observation.receiptColumnsSha256!==db[before?"receiptColumnsBeforeSha256":"receiptColumnsAfterSha256"] || !before&&observation.receiptColumnInitiallyNull!==true
    || !["productWriterEnabled","cookedWeightWriterEnabled","quantityWriterEnabled","attestationWriterEnabled","writerEnabled","attestationTablesPresent"].every(key=>observation[key]===true)
    || !["normalDataSha256","preservedRowsSha256","attestationRowsSha256","controlsSha256"].every(key=>SHA.test(observation[key]??""))) throw new Error("Recipe-save exact229/231 observation differs");
  if (!before) assertRecipeSaveRecoveryCurrentFields(review,observation);
  assertAttestationWorker(review,observation.worker);return observation;
}

export function assertRecipeRequestRoleCurrentFields(review,observation) {
  const db=review.database;
  if (observation.requestRolePostimageRegistrySha256!==RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256
    || observation.recipePostimageRegistrySha256!==RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256
    || !isDeepStrictEqual(observation.recipeFunctions,db.recipeFunctionsAfter) || observation.receiptColumnsSha256!==db.receiptColumnsAfterSha256
    || !isDeepStrictEqual(observation.recipeScope,{outerSha256:db.recipeScope.afterOuterSha256,aliasSha256:db.recipeScope.afterAliasSha256})) throw new Error("Recipe request-role current232 exact function/receipt/scope differs");
}
export function assertRecipeRequestRoleObservation(review,observation,phase) {
  assertRecipeRequestRoleReview(review);const db=review.database,before=phase==="before";
  if (!["before","after"].includes(phase) || digest(JSON.stringify(observation?.target))!==db.targetSha256
    || !isDeepStrictEqual(observation.ledger,db[phase]) || observation.catalogSha256!==db[before?"beforeCatalogSha256":"afterCatalogSha256"]
    || observation.immutableSha256!==db[before?"immutableSha256":"afterImmutableSha256"] || observation.stableImmutableSha256!==db.stableImmutableSha256
    || !isDeepStrictEqual(observation.scope,db[before?"beforeScope":"afterScope"]) || observation.ledgerAuthority!==true || observation.active!==false
    || observation.attestationScope?.outerSha256!==db[before?"beforeScope":"afterScope"].outerSha256
    || observation.attestationScope?.aliasSha256!==db.attestationScope.afterAliasSha256
    || !isDeepStrictEqual(observation.recipeScope,{outerSha256:db[before?"beforeScope":"afterScope"].outerSha256,aliasSha256:db.recipeScope.afterAliasSha256})
    || observation.normalColumnsSha256!==db.afterColumnsSha256 || observation.normalProjectionSha256!==db.normalProjectionSha256
    || observation.postimageRegistrySha256!==db.postimageRegistrySha256 || observation.attestationPostimageRegistrySha256!==db.attestationPostimageRegistrySha256
    || observation.requestRolePostimageRegistrySha256!==RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256 || observation.recipePostimageRegistrySha256!==RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256
    || !isDeepStrictEqual(observation.recipeFunctions,db[before?"recipeFunctionsBefore":"recipeFunctionsAfter"])
    || !isDeepStrictEqual(observation.nutritionValidator,db.functionAfter) || observation.receiptColumnsSha256!==db.receiptColumnsAfterSha256
    || !["productWriterEnabled","cookedWeightWriterEnabled","quantityWriterEnabled","attestationWriterEnabled","writerEnabled","attestationTablesPresent"].every(key=>observation[key]===true)
    || !["normalDataSha256","preservedRowsSha256","attestationRowsSha256","controlsSha256"].every(key=>SHA.test(observation[key]??""))) throw new Error("Recipe request-role exact231/232 observation differs");
  if (!before) assertRecipeRequestRoleCurrentFields(review,observation);
  assertAttestationWorker(review,observation.worker);return observation;
}
