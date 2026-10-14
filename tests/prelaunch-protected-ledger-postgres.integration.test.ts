import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import * as controlled from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { createProtectedPrelaunchAdapter, createProtectedPrelaunchDatabaseEngine, createProtectedPrelaunchJournal,
  PROTECTED_CATALOG_SQL, PROTECTED_IMMUTABLE_CATALOG_SQL, COOKED_WEIGHT_SCOPE_SQL, COOKED_WEIGHT_STABLE_IMMUTABLE_SQL } from "../scripts/lib/prelaunch-database.mjs";
import { assertCookedWeightEvidenceSourceFunctionInventoryResult, buildCookedWeightEvidenceSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult, buildRecipeProductSourceFunctionInventorySql } from "../scripts/lib/full-local-security-inventory.mjs";

import { CLOSED_R2_REVIEW_PIN, PROTECTED_ROLLOUT_REVIEW_PIN, PROTECTED_WRITER_REVIEW_PIN } from "../scripts/lib/prelaunch-web-deploy.mjs";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function rehearseProtectedLedger(cookedWeight: boolean) {
  const fixtureDirectory = process.env.HOMECOOK_PROTECTED_LEDGER_FIXTURE_DIRECTORY;
  if (!fixtureDirectory) throw new Error("An explicit reviewed schema-only fixture directory is required");
  const archive = readFileSync(join(fixtureDirectory, "current-schema.dump"));
  const roles = readFileSync(join(fixtureDirectory, "current-roles.sql"), "utf8");
  expect(hash(archive)).toBe("5447e5ae08359feb9750676820968daf2edcf0ed57b64997e718ccc8d8dae790");
  expect(hash(roles)).toBe("a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
  expect(roles).not.toMatch(/\bpassword\s+[^;]+/iu);
  const ledgerDirectory = cookedWeight ? process.env.HOMECOOK_COOKED_WEIGHT_LEDGER_FIXTURE_DIRECTORY : fixtureDirectory;
  if (!ledgerDirectory) throw new Error("C01 requires explicit reviewed220 ledger metadata");
  const beforeCount = cookedWeight ? 220 : 219;
  const beforeLedger = JSON.parse(readFileSync(join(ledgerDirectory, "before-observation.json"), "utf8")).ledger as { filename: string; sha256: string }[];
  expect(beforeLedger).toHaveLength(beforeCount);
  const filename = cookedWeight ? "20261013233000_cooked_batch_weight_evidence.sql" : "20261013190000_recipe_product_only_identity.sql";
  const bytes = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url));
  expect(hash(bytes)).toBe(cookedWeight ? "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0" : "0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75");
  const envelope = cookedWeight ? bytes.toString("utf8").replace(/^-- Local draft only\. No historical batch\/meal\/snapshot UPDATE and no learning collection\.\n/u, "") : bytes.toString("utf8");
  const payload = envelope.replace(/^begin;\n/u, "").replace(/\ncommit;\n$/u, "");
  const migration = { filename, sha256: hash(bytes), bytes };
  const afterLedger = [...beforeLedger, { filename: migration.filename, sha256: migration.sha256 }];
  const operationId = randomUUID(), directory = mkdtempSync(join(realpathSync("/tmp"), "protected-ledger-pg-"));
  const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
  const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
  for (const key of ["DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "PGPASSWORD"]) delete env[key];
  let container = "";
  let engine: ReturnType<typeof createProtectedPrelaunchDatabaseEngine> | undefined;
  const report: Record<string, unknown> = { status: "FAIL", operationId, productionAccess: false, restoredApplicationRows: 0,
    network: "none", image, approvedProductionReviewChanged: false, fixtureCatalogIsNotProductionExpectation: true, feature: cookedWeight ? "cooked-weight-evidence" : "recipe-product-source" };
  const run = (args: string[], options: Record<string, unknown> = {}) => {
    const result = spawnSync("docker", args, { env, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, ...options });
    if (result.status !== 0) throw new Error("Owned isolated ledger fixture command failed; output withheld");
    return result.stdout?.trim();
  };
  const owned = () => {
    const current = JSON.parse(run(["inspect", container]))[0];
    expect(current.Config.Labels["homecook.protected-ledger-test"]).toBe(operationId);
    expect(current.Config.Image).toBe(image); expect(current.HostConfig.NetworkMode).toBe("none");
    expect(current.HostConfig.PortBindings).toEqual({}); expect(current.Mounts).toEqual([]);
    return current;
  };
  const sql = (statement: string, role = "postgres", database = "postgres") => {
    owned();
    return run(["exec", "-i", container, "psql", "-h", "/var/run/postgresql", "-U", role, "-d", database, "-XAtq", "-v", "ON_ERROR_STOP=1"], { input: statement });
  };
  try {
    run(["image", "inspect", image]);
    const bootstrap = "install -d -m 700 -o 100 -g 101 /tmp/ledgerpg /var/run/postgresql; exec gosu postgres /bin/sh -ec 'initdb -D /tmp/ledgerpg -U supabase_admin --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 --auth-local=trust --auth-host=reject >/tmp/initdb.log 2>&1; exec postgres -D /tmp/ledgerpg -h \"\" -k /var/run/postgresql -c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault'";
    container = run(["run", "--platform", "linux/arm64", "--pull=never", "--no-healthcheck", "-d", "--name", `hc-protected-ledger-${operationId.slice(0, 12)}`,
      "--label", `homecook.protected-ledger-test=${operationId}`, "--network", "none", "--entrypoint", "/bin/sh", image, "-ec", bootstrap]);
    let ready = false;
    for (let i = 0; i < 40; i++) { try { sql("SELECT 1;", "supabase_admin"); ready = true; break; } catch { await delay(250); } }
    expect(ready).toBe(true);
    sql(roles.replace(/^CREATE ROLE supabase_admin;\n/mu, ""), "supabase_admin");
    owned();
    run(["exec", "-i", container, "pg_restore", "-h", "/var/run/postgresql", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--clean", "--if-exists", "--exit-on-error"], { input: archive });
    sql("DO $$ DECLARE t record; n bigint; BEGIN FOR t IN SELECT ns.nspname,c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' LOOP EXECUTE format('SELECT count(*) FROM %I.%I',t.nspname,t.relname) INTO n; IF n<>0 THEN RAISE EXCEPTION 'Schema-only fixture contains rows'; END IF; END LOOP; END $$;", "supabase_admin");
    if (cookedWeight) {
      const c03 = readFileSync(new URL("../supabase/migrations/20261013190000_recipe_product_only_identity.sql", import.meta.url));
      expect(hash(c03)).toBe("0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75");
      sql(`SET SESSION AUTHORIZATION postgres; ${c03.toString("utf8")}`);
      sql("UPDATE private.recipe_product_only_write_control SET enabled=true WHERE singleton;");
    }
    sql(`INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES ${beforeLedger.map(row => `(${literal(row.filename)},${literal(row.sha256)})`).join(",")};`, "supabase_admin");
    expect(sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='homecook_deploy.migrations'::regclass;")).toBe("supabase_admin");
    expect(sql("SELECT has_table_privilege('postgres','homecook_deploy.migrations','SELECT'),has_table_privilege('postgres','homecook_deploy.migrations','INSERT'),has_table_privilege('postgres','homecook_deploy.migrations','UPDATE'),has_table_privilege('postgres','homecook_deploy.migrations','DELETE');")).toBe("t|f|f|f");
    Object.assign(report, { actualLedgerOwner: "supabase_admin", postgresLedgerSelectOnly: true, ledgerBefore: beforeCount });
    const context = JSON.parse(sql("SELECT jsonb_build_object('searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));"));
    expect(context.timeZone).toBe("UTC");
    expect(JSON.parse(sql("SELECT jsonb_build_object('searchPath',current_setting('search_path'));", "supabase_admin")).searchPath).not.toBe(context.searchPath);
    const target = { postgresContainerId: container, image, fixtureOwner: operationId, network: "none" };
    const ledgerInsert = `INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES (${literal(migration.filename)},${literal(migration.sha256)});`;
    const localContext = `SELECT set_config('search_path',${literal(context.searchPath)},true),set_config('TimeZone',${literal(context.timeZone)},true);`;
    const beforeCatalog = sql(PROTECTED_CATALOG_SQL), immutable = sql(PROTECTED_IMMUTABLE_CATALOG_SQL);
    // Owned isolated postimage only, prepared before execution; never replace the actual approved135d expectation.
    const probes = cookedWeight ? [PROTECTED_CATALOG_SQL, PROTECTED_IMMUTABLE_CATALOG_SQL, COOKED_WEIGHT_STABLE_IMMUTABLE_SQL, COOKED_WEIGHT_SCOPE_SQL] : [PROTECTED_CATALOG_SQL];
    const projected = sql(`BEGIN; SET LOCAL ROLE postgres; ${localContext} ${payload} SET LOCAL ROLE supabase_admin; ${ledgerInsert} SET LOCAL ROLE postgres; ${probes.join(" ")} ROLLBACK;`, "supabase_admin").split("\n").slice(-probes.length);
    const afterCatalog = projected[0], afterImmutable = cookedWeight ? projected[1] : immutable;
    const stableImmutable = cookedWeight ? sql(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL) : null;
    const beforeScope = cookedWeight ? JSON.parse(sql(COOKED_WEIGHT_SCOPE_SQL)) : null;
    const afterScope = cookedWeight ? JSON.parse(projected[3]) : null;
    if (cookedWeight) { expect(projected[2]).toBe(stableImmutable); expect(beforeScope.aliasSha256).toBe(null); expect(afterScope.aliasSha256).toBe(beforeScope.outerSha256); }

    expect(sql(PROTECTED_CATALOG_SQL)).toBe(beforeCatalog);
    const backupDirectory = join(directory, "backup"); mkdirSync(backupDirectory, { mode: 0o700 });
    const rolesAtPayload: unknown[] = [], notifications: string[] = [];
    const base = {
      inspect: async () => { owned(); return target; },
      query: async (statement: string) => sql(`BEGIN READ ONLY; ${statement} COMMIT;`),
      session: (name: string) => { owned(); return controlled.openRecordingSession(container, env, name); },
      migrationSession: (name: string) => {
        owned();
        const session = controlled.openProtectedMigrationSession(container, env, name);
        return { ...session, postgresContext: JSON.parse(sql("SELECT jsonb_build_object('searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));")),
          query: async (statement: string) => {
            if (statement === payload) rolesAtPayload.push(JSON.parse(await session.query("SELECT jsonb_build_object('role',current_user,'searchPath',current_setting('search_path'),'timeZone',current_setting('TimeZone'));")));
            return session.query(statement);
          } };
      },
      backup: (options: { snapshot: string; timeout: number; target: unknown }) => controlled.backupRecordingSnapshot({ ...options, run, container, directory: backupDirectory }),
      reloadSchema: async (id: string) => {
        expect(id).toBe(operationId);
        const session = base.session(`r2-reload-${id}`);
        try { notifications.push(await session.query("BEGIN; SELECT current_user; NOTIFY pgrst, 'reload schema'; COMMIT;")); await session.close(); }
        finally { session.stop(); }
      },
    };
    const adapter = createProtectedPrelaunchAdapter(base, cookedWeight ? "cooked-weight-evidence" : "recipe-product-source");
    const observation = await adapter.observe(undefined, "fixture-before");
    const review = { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: cookedWeight ? "cooked-weight-evidence" : "recipe-product-source", from: "a".repeat(40), to: "b".repeat(40),
      approved: { database: true, reader: true, writerOn: false }, allNewShapesOff: true, legacyReaderCompatible: true, isolatedEvidenceSha256: hash("owned fixture only"),
      database: { before: beforeLedger, after: afterLedger, targetSha256: hash(JSON.stringify(target)), beforeCatalogSha256: beforeCatalog, afterCatalogSha256: afterCatalog,
        immutableSha256: immutable, migrations: [{ filename: migration.filename, rawSha256: migration.sha256, payloadSha256: hash(payload) }] } };
    if (cookedWeight) {
      const pointer = (name: string) => ({ path: `/private/owned-${name}.json`, sha256: hash(name) });
      Object.assign(review, { files: { [`supabase/migrations/${filename}`]: [null, migration.sha256] },
        predecessorBuildId: "owned-c03-reader", predecessorPlistSha256: hash("owned-before-plist"), closedArtifactSha256: hash("owned-marker"),
        closedReviewSha256: CLOSED_R2_REVIEW_PIN.sha256, controlSha256: hash("owned-r2-control"), consentGeneration: 1, historicalProofsSha256: hash("owned-history"),
        testScript: "test:feedback-batch:web", isolatedEvidence: { path: "/private/owned-isolated.json", sha256: review.isolatedEvidenceSha256 },
        readerFlowsSha256: hash("reader-flow"), readerFlows: pointer("reader-flow"), platformInventory: pointer("inventory"), backupReadiness: pointer("backup"),
        predecessorProtected: { reviewSha256: PROTECTED_ROLLOUT_REVIEW_PIN.sha256, writerApprovalSha256: PROTECTED_WRITER_REVIEW_PIN.sha256,
          databaseReceipt: pointer("c03-database"), readerReceipt: pointer("c03-reader"), writerReceipt: pointer("c03-on"), readerFloor: "a".repeat(40), writerEnabled: true },
        readerEnvironment: { HOMECOOK_COOKED_WEIGHT_EVIDENCE: [null, "1"] } });
      Object.assign(review.database, { configPath: "/private/owned-no-actual-config.env", configSha256: hash("owned-config"),
        afterImmutableSha256: afterImmutable, stableImmutableSha256: stableImmutable,
        scopeTransition: { beforeOuterSha256: beforeScope.outerSha256, afterOuterSha256: afterScope.outerSha256, afterAliasSha256: afterScope.aliasSha256 } });
    }
    const journal = createProtectedPrelaunchJournal({ repositoryRoot: process.cwd(), operationDirectory: directory, guardPath: join(directory, "fixture-guard.json"), operationId });
    engine = createProtectedPrelaunchDatabaseEngine({ review, reviewSha256: hash(JSON.stringify(review)), operationId,
      readMigrations: async () => [...beforeLedger, migration], adapter, journal, assertBoundary: async () => { owned(); } });
    const result = await engine.apply();
    expect(result).toMatchObject({ status: "committed", writerEnabled: false, readerReady: false });
    expect(rolesAtPayload).toEqual([{ role: "postgres", ...context }]);
    expect(notifications).toEqual(["postgres"]);
    const after = await adapter.observe(undefined, `protected-c03-${operationId}`);
    expect(after.ledger).toEqual(afterLedger); expect(after.catalogSha256).toBe(afterCatalog); expect(after.immutableSha256).toBe(afterImmutable);
    expect(after.preservedRowsSha256).toBe(observation.preservedRowsSha256); expect(after.writerEnabled).toBe(false);
    expect(sql("SELECT has_table_privilege('postgres','homecook_deploy.migrations','INSERT'),pg_get_userbyid(relowner) FROM pg_class WHERE oid='homecook_deploy.migrations'::regclass;")).toBe("f|supabase_admin");
    if (cookedWeight) {
      expect(after.productWriterEnabled).toBe(true);
      expect(assertCookedWeightEvidenceSourceFunctionInventoryResult(JSON.parse(sql(buildCookedWeightEvidenceSourceFunctionInventorySql()))).required_functions).toBe(15);
      expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true }))), { includeCookedWeightEvidenceFunctions: true }).required_functions).toBe(38);
    } else expect(assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql()))).required_functions).toBe(24);
    expect(result.backup.fullArchiveDecoded).toBe(true);
    sql("CREATE DATABASE fixture_backup_restore;", "supabase_admin");
    run(["exec", "-i", container, "pg_restore", "-h", "/var/run/postgresql", "-U", "supabase_admin", "-d", "fixture_backup_restore", "--exit-on-error"], { input: readFileSync(result.backup.path) });
    expect(sql("SELECT count(*) FROM homecook_deploy.migrations;", "supabase_admin", "fixture_backup_restore")).toBe(String(beforeCount));
    if (cookedWeight) {
      expect(sql("SELECT enabled FROM private.recipe_product_only_write_control;", "supabase_admin", "fixture_backup_restore")).toBe("t");
      expect(sql("SELECT to_regclass('private.cooked_batch_weight_evidence_control') IS NULL;", "supabase_admin", "fixture_backup_restore")).toBe("t");
    } else expect(sql("SELECT to_regclass('private.recipe_product_only_write_control') IS NULL;", "supabase_admin", "fixture_backup_restore")).toBe("t");
    Object.assign(report, { status: "PASS", actualLedgerOwner: "supabase_admin", postgresLedgerSelectOnly: true, ledgerBefore: beforeCount, ledgerAfter: after.ledger.length,
      migrationSha256: hash(bytes), payloadSha256: hash(payload), beforeCatalog, afterCatalog, immutable, afterImmutable, stableImmutable, beforeScope, afterScope, productWriterEnabled: cookedWeight ? true : false, payloadContext: rolesAtPayload[0], fullSnapshotDecoded: true, fullSnapshotRestored: true,
      backupSha256: result.backup.sha256, rolesSha256: result.backup.rolesSha256, notificationRole: "postgres", writerEnabled: false, readerReady: false });
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Owned fixture failure";
    if (engine) {
      report.ledgerAfterFailure = sql("SELECT count(*) FROM homecook_deploy.migrations;");
      report.controlAbsentAfterFailure = sql(cookedWeight ? "SELECT to_regclass('private.cooked_batch_weight_evidence_control') IS NULL;" : "SELECT to_regclass('private.recipe_product_only_write_control') IS NULL;") === "t";
      report.attemptAfterFailure = await createProtectedPrelaunchJournal({ repositoryRoot: process.cwd(), operationDirectory: directory,
        guardPath: join(directory, "fixture-guard.json"), operationId }).read();
      try { report.reconciledAfterFailure = (await engine.reconcile()).status; }
      catch { report.reconciledAfterFailure = "unknown"; }
    }
    throw error;
  } finally {
    if (container) { owned(); run(["rm", "-f", container]); report.cleanup = true; }
    const reportPath = join(realpathSync("/tmp"), `mumeok-${cookedWeight ? "c01" : "c03"}-ledger-session-${operationId}-report.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    process.stdout.write(`Owned ledger fixture report: ${reportPath}\n`);
  }
}
it.skipIf(process.env.HOMECOOK_PROTECTED_LEDGER_ISOLATED_PG !== "1")("uses the actual admin-owned219 ledger and postgres payload through one protected transaction and a full snapshot backup", () => rehearseProtectedLedger(false), 300000);
it.skipIf(process.env.HOMECOOK_COOKED_WEIGHT_LEDGER_ISOLATED_PG !== "1")("uses admin-owned220, preserves C03 ON, and applies C01 OFF with snapshot backup/restore and atomic221 through the full engine", () => rehearseProtectedLedger(true), 300000);
