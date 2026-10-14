import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPinnedLocalDockerTarget } from "./local-supabase-isolated-runtime.mjs";
import { parseFullLocalProductionConfig, selectFullLocalProductionResources } from "./full-local-production-resources.mjs";
import { createRecordingDockerAdapter, durableJson } from "./marketing-round2-controlled-deploy.mjs";
import { assertProtectedWriterReview, assertProtectedRolloutReview, assertCookedWeightProductOff, readClosedR2PrivateBytes, COOKED_WEIGHT_FEATURE, COOKED_WEIGHT_MIGRATION, protectedImmutableSha256 } from "./prelaunch-web-deploy.mjs";

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
const PROTECTED_DATA_TABLES = ["auth.users", "auth.identities", "public.marketing_validation_sessions", "public.marketing_validation_events", "public.marketing_round2_participations", "public.marketing_round2_events", "public.marketing_round2_lead_requests", "public.youtube_extraction_jobs", "public.youtube_saved_recipe_results", "public.youtube_extractor_permits"];
const PROTECTED_LEDGER_SQL = "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;";
const PROTECTED_WRITER_SQL = "SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.recipe_product_only_write_control;";
const COOKED_WEIGHT_WRITER_SQL = "SELECT CASE WHEN count(*)=1 AND bool_and(singleton) THEN bool_or(enabled)::text ELSE 'invalid' END FROM private.cooked_batch_weight_evidence_control;";

export function createProtectedPrelaunchAdapter(base, feature = "recipe-product-source") {
  if (!["recipe-product-source", COOKED_WEIGHT_FEATURE].includes(feature)) throw new Error("Unknown protected adapter feature");
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
      if (feature === COOKED_WEIGHT_FEATURE) {
        const exists = (await query("SELECT to_regclass('private.cooked_batch_weight_evidence_control') IS NOT NULL;")).trim() === "t";
        const weightControl = exists ? (await query(COOKED_WEIGHT_WRITER_SQL)).trim() : "false";
        if (!["true", "false"].includes(weightControl)) throw new Error("C01 control singleton differs");
        Object.assign(result, { productWriterEnabled: result.writerEnabled, writerEnabled: weightControl === "true",
          stableImmutableSha256: (await query(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL)).trim(), scope: JSON.parse((await query(COOKED_WEIGHT_SCOPE_SQL)).trim()) });
      }
      return result;
    },
  };
}

/** @param {{ repositoryRoot: string, operationDirectory: string, guardPath: string, operationId: string, previousNotAppliedSha256?: string }} options */
export function createProtectedPrelaunchJournal({ repositoryRoot, operationDirectory, guardPath, operationId, previousNotAppliedSha256 = undefined }) {
  const attemptPath = path.join(operationDirectory, "attempt.json");
  const read = () => {
    try { return JSON.parse(readClosedR2PrivateBytes(guardPath, repositoryRoot, 524288)); }
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
  return createProtectedPrelaunchAdapter(base, review.feature);
}

export async function createProtectedPrelaunchDatabase({ repositoryRoot, configPath, operationDirectory, operationId, guardPath, review, reviewSha256, assertBoundary, checkCancelled, readMigrations: readCandidate, previousNotAppliedSha256 }) {
  const readMigrations = readCandidate ?? (async () => {
    const migrations = await readPrelaunchMigrationFiles(repositoryRoot);
    return Promise.all(migrations.map(async row => ({ ...row, bytes: await readFile(path.join(repositoryRoot, "supabase/migrations", row.filename)) })));
  });
  planProtectedPrelaunchMigrations(review, await readMigrations()); // Exact source bytes before Docker/config operations.
  const adapter = await openProtectedPrelaunchTarget({ repositoryRoot, configPath, backupDirectory: path.join(operationDirectory, "backup"), review });
  const journal = createProtectedPrelaunchJournal({ repositoryRoot, operationDirectory, operationId, guardPath, previousNotAppliedSha256 });
  const engine = createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary, checkCancelled });
  return { ...engine, observe: () => adapter.observe(undefined, `${review.feature === COOKED_WEIGHT_FEATURE ? "protected-c01" : "protected-c03"}-${operationId}`), adapter, journal };
}

export function createProtectedPrelaunchWriter({ review, reviewSha256, approval, approvalSha256, readerReceipt, readerReceiptSha256, operationId, action, adapter, journal, assertBoundary,
  baselineReview = review, baselineReviewSha256 = reviewSha256, productOffReceipt = null }) {
  assertProtectedWriterReview(approval, review, reviewSha256);
  const productCloseOnWeightBaseline = review.feature === "recipe-product-source" && baselineReview.feature === COOKED_WEIGHT_FEATURE;
  if (productCloseOnWeightBaseline) {
    assertProtectedRolloutReview(baselineReview);
    if (action !== "writer-off" || baselineReview.predecessorProtected.reviewSha256 !== reviewSha256 || !SHA.test(baselineReviewSha256)) throw new Error("Only original C03 safe OFF may use the exact successor C01 baseline");
  } else if (!same(baselineReview, review) || baselineReviewSha256 !== reviewSha256) throw new Error("Writer cannot replace its approved baseline");
  if (!SHA.test(approvalSha256) || !SHA.test(readerReceiptSha256) || (approval.readerReceiptSha256 !== null && approval.readerReceiptSha256 !== readerReceiptSha256) || readerReceipt?.reviewSha256 !== reviewSha256
    || readerReceipt.readerFloor !== review.to || readerReceipt.releaseSha !== review.to || readerReceipt.backwardCompatible !== false
    || readerReceipt.databasePlanSha256 !== approval.databasePlanSha256 || readerReceipt.verifiedFlowsSha256 !== approval.readerFlowsSha256 || !["writer-on", "writer-off"].includes(action)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(operationId ?? "")) {
    throw new Error("Protected writer approval/reader floor/action differs");
  }
  review = structuredClone(review); baselineReview = structuredClone(baselineReview); productOffReceipt = structuredClone(productOffReceipt);
  const enabled = action === "writer-on", applicationName = `protected-writer-${operationId}`;
  const cookedWeight = review.feature === COOKED_WEIGHT_FEATURE;
  const controlKey = productCloseOnWeightBaseline ? "productWriterEnabled" : "writerEnabled";
  const binding = () => { const result = { schema: "homecook.prelaunch-protected-writer-attempt.v1", reviewSha256, approvalSha256, operationId,
    applicationName, from: review.from, to: review.to, action, readerReceiptSha256, readerFloor: readerReceipt.readerFloor, backwardCompatible: false };
    if (productCloseOnWeightBaseline) Object.assign(result, { baselineReviewSha256, baselineDatabasePlanSha256: digest(JSON.stringify({ source: baselineReview.database.after, applied: baselineReview.database.after })) });
    return result;
  };
  const check = observation => {
    if (typeof observation[controlKey] !== "boolean") throw new Error("Protected writer control observation is invalid");
    if (productCloseOnWeightBaseline) return assertProtectedPrelaunchObservation(baselineReview, { ...observation, writerEnabled: false, productWriterEnabled: true }, "after");
    return assertProtectedPrelaunchObservation(review, { ...observation, writerEnabled: false }, "after", { productOffReceipt, reviewSha256 });
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
        session = adapter.session(applicationName);
        await session.query(cookedWeight
          ? "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SELECT pg_advisory_xact_lock(104230921,77101); SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR UPDATE;"
          : "BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SELECT pg_advisory_xact_lock(104230921,77101); LOCK TABLE private.recipe_product_only_write_control IN EXCLUSIVE MODE; LOCK TABLE public.recipe_ingredients IN SHARE ROW EXCLUSIVE MODE;");
        if (productCloseOnWeightBaseline) await session.query("SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE;");
        const locked = await adapter.observe(sql => session.query(sql), applicationName); check(locked);
        if (locked[controlKey] !== before[controlKey]) throw new Error("Protected writer changed before lock");
        await assertBoundary();
        await session.query(cookedWeight
          ? `UPDATE private.cooked_batch_weight_evidence_control SET enabled=${enabled} WHERE singleton AND enabled=${!enabled};`
          : `UPDATE private.recipe_product_only_write_control SET enabled=${enabled} WHERE singleton AND enabled=${!enabled};`);
        const post = await adapter.observe(sql => session.query(sql), applicationName); check(post);
        if (post[controlKey] !== enabled || post.preservedRowsSha256 !== locked.preservedRowsSha256
          || (productCloseOnWeightBaseline && post.writerEnabled !== locked.writerEnabled)) throw new Error("Protected control transition or preserved rows differ");
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
        || attempt.readerFloor !== review.to || !["applying_precommit", "commit_dispatch_guard", "unknown", "rolled_back_before_commit"].includes(attempt.status)) {
        throw new Error("Protected writer reconcile binding differs");
      }
      await assertBoundary();
      const observation = await adapter.observe(undefined, applicationName); check(observation);
      const closedAfterUnknown = enabled && observation[controlKey] === false && safeOffReceipt;
      if (closedAfterUnknown && (safeOffReceipt.status !== "committed" || safeOffReceipt.action !== "writer-off"
        || safeOffReceipt.approvalSha256 !== approvalSha256 || safeOffReceipt.readerReceiptSha256 !== readerReceiptSha256
        || safeOffReceipt.readerFloor !== review.to || safeOffReceipt.writerEnabled !== false)) throw new Error("Protected safe OFF supersession proof differs");
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
  const validRows = rows => Array.isArray(rows) && rows.length > 0
    && rows.every(row => row && Object.keys(row).sort().join() === "filename,sha256" && FILE.test(row.filename) && SHA.test(row.sha256))
    && new Set(rows.map(row => row.filename.slice(0, 14))).size === rows.length
    && same(rows.map(row => row.filename), rows.map(row => row.filename).sort());
  if (!validRows(before) || !validRows(after) || after.length <= before.length || !same(after.slice(0, before.length), before)
    || !Array.isArray(specs) || specs.length !== after.length - before.length || !same(records(migrations), after)) {
    throw new Error("Protected migration source/ledger must be the exact approved ordered prefix and extension");
  }
  const pending = migrations.slice(before.length).map((migration, index) => {
    const spec = specs[index];
    if (!spec || spec.filename !== migration.filename || spec.rawSha256 !== migration.sha256 || !SHA.test(spec.payloadSha256)
      || Object.keys(spec).sort().join() !== "filename,payloadSha256,rawSha256" || !Buffer.isBuffer(migration.bytes)
      || digest(migration.bytes) !== spec.rawSha256) throw new Error("Protected migration exact raw bytes differ");
    const sql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(migration.bytes);
    const cookedWeight = review.feature === COOKED_WEIGHT_FEATURE;
    if (cookedWeight && (before.length !== 220 || after.length !== 221 || specs.length !== 1 || migration.filename !== COOKED_WEIGHT_MIGRATION)) throw new Error("C01 only accepts its exact220 to221 migration");
    const envelope = cookedWeight ? sql.replace(/^-- Local draft only\. No historical batch\/meal\/snapshot UPDATE and no learning collection\.\r?\n/u, "") : sql;
    if (!/^begin;\r?\n/iu.test(envelope) || !/\r?\ncommit;\r?\n$/iu.test(envelope)) throw new Error("Protected migration outer transaction wrapper differs");
    const payload = envelope.replace(/^begin;\r?\n/iu, "").replace(/\r?\ncommit;\r?\n$/iu, "");
    if (digest(payload) !== spec.payloadSha256) throw new Error("Protected migration exact payload bytes differ");
    assertProtectedSqlOperatorBoundary(payload);
    return { filename: migration.filename, sha256: migration.sha256, payload };
  });
  return { before, after, pending };
}

/** @param {{productOffReceipt?: unknown, reviewSha256?: string}} [independent] */
export function assertProtectedPrelaunchObservation(review, observation, phase, independent = {}) {
  const { productOffReceipt = null, reviewSha256 } = independent;
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
  return observation;
}

export function classifyProtectedPrelaunchOutcome(review, observation) {
  try { assertProtectedPrelaunchObservation(review, observation, "after"); return "committed"; } catch { /* Compare only approved images. */ }
  try { assertProtectedPrelaunchObservation(review, observation, "before"); return "not_applied"; } catch { return "unknown"; }
}

// Existing controlled-adapter/session/backup boundaries are supplied explicitly for isolated fixtures.
// This is not an arbitrary SQL/path/catalog runner: expected images and source bytes precede all I/O.
export function createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary, checkCancelled = () => {} }) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(operationId ?? "")
    || !SHA.test(reviewSha256) || review?.schema !== "homecook.prelaunch-protected-rollout-review.v1"
    || !["recipe-product-source", COOKED_WEIGHT_FEATURE].includes(review.feature) || review.approved?.database !== true || review.approved.writerOn !== false
    || review.allNewShapesOff !== true || review.legacyReaderCompatible !== true || !SHA.test(review.isolatedEvidenceSha256)) {
    throw new Error("Protected database exact approval/OFF/legacy compatibility evidence required");
  }
  // Neither the caller nor later observations may replace the reviewed expectations.
  if (review.feature === COOKED_WEIGHT_FEATURE) assertProtectedRolloutReview(review);
  review = structuredClone(review);
  const applicationName = `${review.feature === COOKED_WEIGHT_FEATURE ? "protected-c01" : "protected-c03"}-${operationId}`;
  async function prepare() {
    const plan = planProtectedPrelaunchMigrations(review, await readMigrations());
    await assertBoundary();
    const observation = await adapter.observe(undefined, applicationName);
    assertProtectedPrelaunchObservation(review, observation, "before");
    return { plan, observation };
  }
  const binding = () => ({ schema: "homecook.prelaunch-protected-db-attempt.v1", reviewSha256, operationId, applicationName, from: review.from, to: review.to });
  const receipt = (backup, preservedRowsSha256) => {
    const result = { ...binding(), status: "committed", targetSha256: review.database.targetSha256,
      databasePlanSha256: digest(JSON.stringify({ source: review.database.after, applied: review.database.after })),
      catalogSha256: review.database.afterCatalogSha256, immutableSha256: protectedImmutableSha256(review),
      writerEnabled: false, readerReady: false, backwardCompatible: false, backup, preservedRowsSha256, rowsPreservedInTransaction: true };
    if (review.feature === COOKED_WEIGHT_FEATURE) Object.assign(result, { feature: COOKED_WEIGHT_FEATURE, productWriterEnabled: true,
      stableImmutableSha256: review.database.stableImmutableSha256, predecessorProtected: review.predecessorProtected });
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
      let commitDispatched = false;
      let guardCreated = false;
      try {
        await journal.write({ ...binding(), status: "applying_precommit", target: observation.target }, true);
        guardCreated = true;
        session = adapter.migrationSession(applicationName);
        const { searchPath, timeZone } = session.postgresContext ?? {};
        if (typeof searchPath !== "string" || typeof timeZone !== "string") throw new Error("Protected migration postgres context unavailable");
        await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='180s'; SET LOCAL idle_in_transaction_session_timeout='180s'; SET LOCAL standard_conforming_strings=on; SELECT pg_advisory_xact_lock(104230921,77101); LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE; SET LOCAL ROLE postgres; SELECT set_config('search_path',${literal(searchPath)},true),set_config('TimeZone',${literal(timeZone)},true);`);
        if (review.feature === COOKED_WEIGHT_FEATURE) await session.query("SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE;");
        const query = sql => session.query(sql);
        const locked = assertProtectedPrelaunchObservation(review, await adapter.observe(query, applicationName), "before");
        preservedRowsSha256 = locked.preservedRowsSha256;
        const snapshot = (await session.query("SELECT pg_export_snapshot();")).trim();
        if (!/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/u.test(snapshot)) throw new Error("Protected backup snapshot identity invalid");
        backup = await adapter.backup({ snapshot, timeout: 160000, target: observation.target });
        if (!backup || backup.fullArchiveDecoded !== true || !SHA.test(backup.sha256) || !SHA.test(backup.rolesSha256)
          || !same(backup.target, observation.target) || backup.snapshot !== snapshot) throw new Error("Protected full snapshot/roles backup evidence differs");
        const backedUp = assertProtectedPrelaunchObservation(review, await adapter.observe(query, applicationName), "before");
        if (backedUp.preservedRowsSha256 !== preservedRowsSha256) throw new Error("Protected rows changed in the locked backup snapshot");
        await assertBoundary();
        checkCancelled();
        // Payload/catalog work remains postgres; only ledger writes use its existing owner.
        for (const row of plan.pending) {
          await session.query(row.payload);
          await session.query(`SET LOCAL ROLE supabase_admin; INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES (${literal(row.filename)},${literal(row.sha256)}); SET LOCAL ROLE postgres;`);
        }
        const post = assertProtectedPrelaunchObservation(review, await adapter.observe(query, applicationName), "after");
        if (post.preservedRowsSha256 !== preservedRowsSha256) throw new Error("Protected rows changed inside SQL/ledger transaction");
        await assertBoundary();
        checkCancelled();
        await journal.write({ ...binding(), status: "commit_dispatch_guard", target: observation.target, backup, preservedRowsSha256 });
        commitDispatched = true;
        await session.query("COMMIT;");
        await session.close();
        await adapter.reloadSchema(operationId);
        await assertBoundary();
        assertProtectedPrelaunchObservation(review, await adapter.observe(undefined, applicationName), "after");
        const result = receipt(backup, preservedRowsSha256);
        await journal.write(result);
        return result;
      } catch (error) {
        if (!guardCreated) throw error;
        let rolledBack = false;
        if (session && !commitDispatched) {
          try { await session.query("ROLLBACK;"); await session.close(); rolledBack = true; } catch { session.stop(); }
        } else if (session) session.stop();
        const status = rolledBack ? "rolled_back_before_commit" : "unknown";
        await journal.write({ ...binding(), status, target: observation.target, commitDispatched, backup: backup ?? null, preservedRowsSha256: preservedRowsSha256 ?? null });
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
      const outcome = classifyProtectedPrelaunchOutcome(review, await adapter.observe(undefined, applicationName));
      if (outcome === "unknown") throw new Error("Protected commit outcome remains unknown; retain guard and backup");
      if (outcome === "committed" && (!attempt.backup || attempt.backup.fullArchiveDecoded !== true
        || !SHA.test(attempt.backup.sha256) || !SHA.test(attempt.backup.rolesSha256)
        || !same(attempt.backup.target, attempt.target))) throw new Error("Protected committed outcome has no bound full backup");
      if (outcome === "committed" && (!attempt.commitDispatched && attempt.status !== "commit_dispatch_guard" || !SHA.test(attempt.preservedRowsSha256))) {
        throw new Error("Protected committed reconcile lacks the verified commit intent/row preservation binding");
      }
      if (outcome === "committed") {
        await adapter.reloadSchema(operationId);
        await assertBoundary();
        assertProtectedPrelaunchObservation(review, await adapter.observe(undefined, applicationName), "after");
      }
      const result = outcome === "committed" ? receipt(attempt.backup, attempt.preservedRowsSha256) : { ...binding(), status: "not_applied", targetSha256: review.database.targetSha256,
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
