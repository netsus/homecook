import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, chmodSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";

// Only these nine C04 declarations are authority inputs in the disposable graph.
const WEB_AUTHORITY_DEFAULTS = {
  QUANTITY_V4_RELEASE_SHA: "null", QUANTITY_V4_PROTECTION: "null",
  QUANTITY_V4_CONSUMERS_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WRITER_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_BEFORE_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_AFTER_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: "Object.freeze({ path: null, sha256: null })",
  QUANTITY_V4_WORKER_OPERATION_ROOT: "null",
};
function webFixtureSource(source: string, overrides: Partial<Record<keyof typeof WEB_AUTHORITY_DEFAULTS, string>> = {}) {
  for (const name of Object.keys(overrides)) if (!Object.hasOwn(WEB_AUTHORITY_DEFAULTS, name)) throw new Error("Unknown fixture authority");
  for (const [name, value] of Object.entries(WEB_AUTHORITY_DEFAULTS)) {
    const declaration = new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu");
    if ([...source.matchAll(declaration)].length !== 1) throw new Error(`Expected exactly one fixture declaration: ${name}`);
    source = source.replace(declaration, () => `export const ${name} = ${value};`);
  }
  for (const [name, value] of Object.entries(overrides)) {
    const declaration = new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu");
    source = source.replace(declaration, () => `export const ${name} = ${value};`);
  }
  for (const [name, value] of Object.entries({ ...WEB_AUTHORITY_DEFAULTS, ...overrides })) {
    const declarations = source.match(new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu"));
    if (declarations?.length !== 1 || declarations[0] !== `export const ${name} = ${value};`) throw new Error("Fixture authority was not isolated");
  }
  return source;
}
function fixtureStateRoot(source: string, stateRoot: string) {
  const original = 'function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }';
  if (source.split(original).length !== 2) throw new Error("Fixture state-root declaration changed");
  return source.replace(original, () => `function prelaunchStateRoot() { return ${JSON.stringify(stateRoot)}; }`);
}
function databaseFixtureSource(source: string, webPath: string) {
  let webImports = 0;
  const result = source.replace(/from "(\.\/[^"\n]+)"/gu, (_, name: string) => {
    if (name === "./prelaunch-web-deploy.mjs") webImports++;
    return `from "${pathToFileURL(name === "./prelaunch-web-deploy.mjs" ? webPath : join(process.cwd(), "scripts/lib", name)).href}"`;
  });
  if (webImports !== 2 || result.includes('from "./prelaunch-web-deploy.mjs"')) throw new Error("Fixture DB authority imports changed");
  return result;
}
const nullGraphDirectory = mkdtempSync(join(realpathSync("/tmp"), "c04-null-authority-"));
afterAll(() => rmSync(nullGraphDirectory, { recursive: true, force: true }));
async function nullWebModules() {
  try {
    const webPath = join(nullGraphDirectory, "web.mjs"), databasePath = join(nullGraphDirectory, "database.mjs");
    writeFileSync(webPath, fixtureStateRoot(webFixtureSource(readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8")), join(nullGraphDirectory, "state")), { mode: 0o600 });
    writeFileSync(databasePath, databaseFixtureSource(readFileSync("scripts/lib/prelaunch-database.mjs", "utf8"), webPath), { mode: 0o600 });
    return { web: await import(pathToFileURL(webPath).href), database: await import(pathToFileURL(databasePath).href) };
  } catch (error) { rmSync(nullGraphDirectory, { recursive: true, force: true }); throw error; }
}
const isolated = await nullWebModules();
const deploy: typeof import("../scripts/lib/prelaunch-web-deploy.mjs") = isolated.web;
const { assertProtectedPrelaunchObservation, assertQuantityV4ProtectionPrepared, classifyProtectedPrelaunchOutcome,
  createProtectedPrelaunchAdapter, createProtectedPrelaunchDatabaseEngine, createProtectedPrelaunchJournal, createProtectedPrelaunchWriter,
  openProtectedPrelaunchTarget, planProtectedPrelaunchMigrations, QUANTITY_V4_NORMAL_DATA_SQL, QUANTITY_V4_NORMAL_COLUMNS, assertQuantityV4Columns,
  QUANTITY_V4_COLUMN_METADATA, QUANTITY_V4_COLUMNS_BEFORE_SHA256, QUANTITY_V4_COLUMNS_AFTER_SHA256 }: typeof import("../scripts/lib/prelaunch-database.mjs") = isolated.database;

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sha = (c: string) => c.repeat(64), ref = (c: string) => c.repeat(40);
const pointer = (name: string, c: string) => ({ path: `/private/${name}.json`, sha256: sha(c) });
const operationId = "12345678-1234-4123-8123-123456789abc";
type Migration = { filename: string; sha256: string; bytes?: Buffer; payload?: string; actor?: string };
type PlannedMigration = { filename: string; sha256: string; payload: string; actor?: string };

function fixture(stage: "consumers" | "worker" = "consumers") {
  const old = Array.from({ length: 219 }, (_, i) => ({ filename: `${20250000000000 + i}_fixture.sql`, sha256: sha("0") }));
  const before221 = [...old,
    { filename: "20261013190000_recipe_product_only_identity.sql", sha256: "0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75" },
    { filename: deploy.COOKED_WEIGHT_MIGRATION, sha256: "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0" }];
  const rows = deploy.QUANTITY_V4_MIGRATIONS.map(spec => {
    const bytes = readFileSync(join(process.cwd(), "supabase/migrations", spec.filename));
    const envelope = bytes.toString("utf8").slice(spec.prefix.length);
    const payload = envelope.replace(/^begin;\n/iu, "").replace(/\ncommit;\n$/iu, "");
    return { filename: spec.filename, sha256: spec.sha256, bytes, payload, actor: spec.actor };
  });
  const source = [...before221, ...rows.map(({ filename, sha256 }) => ({ filename, sha256 }))];
  const target = { fixture: true, postgresContainerId: "owned-mock-only" };
  const workerBaseline = { credentialGeneration: 47, credentialRowSha256: sha("1"), policyRowSha256: sha("2"),
    schemaIdentity: deploy.QUANTITY_V4_WORKER_SCHEMA_IDENTITY, snapshotDigest: sha("4"), workerPolicyEnabled: false, workerReleaseSha: ref("5") };
  const beforeCount = stage === "consumers" ? 221 : 226, afterCount = stage === "consumers" ? 226 : 227;
  const review = { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: deploy.QUANTITY_V4_FEATURE, quantityStage: stage,
    from: ref("a"), to: ref("b"), files: Object.fromEntries(rows.map(row => [`supabase/migrations/${row.filename}`, [null, row.sha256]])),
    predecessorBuildId: "fixture-c01-reader", predecessorPlistSha256: sha("1"), closedArtifactSha256: sha("2"),
    closedReviewSha256: deploy.CLOSED_R2_REVIEW_PIN.sha256, controlSha256: sha("3"), consentGeneration: 1, historicalProofsSha256: sha("4"),
    testScript: "test:feedback-batch:web", approved: { database: true, reader: stage === "worker", writerOn: false }, allNewShapesOff: true, legacyReaderCompatible: true,
    isolatedEvidenceSha256: sha("5"), readerFlowsSha256: sha("6"), isolatedEvidence: pointer("isolated", "5"), readerFlows: pointer("reader", "6"),
    platformInventory: pointer("platform", "7"), backupReadiness: pointer("backup", "8"),
    predecessorProtected: { reviewSha256: deploy.COOKED_WEIGHT_ROLLOUT_REVIEW_PIN.sha256, writerApprovalSha256: deploy.COOKED_WEIGHT_WRITER_REVIEW_PIN.sha256,
      databaseReceipt: pointer("c01-database", "9"), readerReceipt: pointer("c01-reader", "a"), writerReceipt: pointer("c01-on", "b"),
      readerFloor: ref("a"), writerEnabled: true, productWriterEnabled: true },
    readerEnvironment: { MUMEOK_QUANTITY_V4_ENABLED: [null, "true"] }, consumersReceipt: pointer("consumers-terminal", "c"),
    workerAuthority: { controlReviewSha256: sha("1"), operationId },
    database: { source, before: source.slice(0, beforeCount), after: source.slice(0, afterCount), targetSha256: hash(JSON.stringify(target)),
      configPath: "/private/config.env", configSha256: sha("a"), beforeCatalogSha256: sha("b"), afterCatalogSha256: sha("c"), immutableSha256: sha("d"),
      afterImmutableSha256: sha("e"), normalProjectionSha256: sha("f"), postimageRegistrySha256: sha("0"),
      beforeColumnsSha256: stage === "consumers" ? QUANTITY_V4_COLUMNS_BEFORE_SHA256 : QUANTITY_V4_COLUMNS_AFTER_SHA256,
      afterColumnsSha256: QUANTITY_V4_COLUMNS_AFTER_SHA256,
      beforeScope: { outerSha256: sha("1"), aliasSha256: sha("2") }, afterScope: { outerSha256: sha("1"), aliasSha256: sha("2") },
      workerCatalogBefore: deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE,
      workerCatalogAfter: stage === "worker" ? deploy.QUANTITY_V4_WORKER_CATALOG_AFTER : deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE,
      workerBaseline, migrations: rows.slice(stage === "worker" ? 5 : 0, stage === "worker" ? 6 : 5)
        .map(row => ({ filename: row.filename, rawSha256: row.sha256, payloadSha256: hash(row.payload) })) } };
  const observation = { target, ledger: review.database.before, catalogSha256: review.database.beforeCatalogSha256,
    immutableSha256: review.database.immutableSha256, preservedRowsSha256: sha("3"), normalDataSha256: sha("4"), active: false, ledgerAuthority: true,
    productWriterEnabled: true, cookedWeightWriterEnabled: true, writerEnabled: false, scope: review.database.beforeScope,
    normalProjectionSha256: review.database.normalProjectionSha256, postimageRegistrySha256: review.database.postimageRegistrySha256,
    normalColumnsSha256: review.database.beforeColumnsSha256, metadataNull: true,
    worker: { ...workerBaseline, catalogFingerprint: deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE, credentialActive: true, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 } };
  const checkpoint = { schema: "homecook.prelaunch-quantity-worker-before.v1", status: "committed", feature: deploy.QUANTITY_V4_FEATURE,
    releaseSha: review.to, targetSha256: review.database.targetSha256, consumersReceiptSha256: review.consumersReceipt.sha256,
    ledgerCount: 226, catalogFingerprint: deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE, quantityPolicyEnabled: false,
    productWriterEnabled: true, weightWriterEnabled: true, ...workerBaseline, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0,
    artifactSha256: sha("5"), descriptorSha256: sha("6"), credentialMetadataSha256: sha("7"), plistSha256: sha("8"), serviceState: "stopped", pid: null, zeroActualAI: true,
    workerReviewSha256: review.workerAuthority.controlReviewSha256, workerOperationId: operationId, workerDatabaseReceiptSha256: null,
    normalDataSha256: observation.normalDataSha256 };
  const migrations: Migration[] = [...before221, ...rows];
  return { review, target, rows, migrations, observation, checkpoint };
}

function engineFixture(stage: "consumers" | "worker" = "consumers", workerReviewSha256?: string) {
  const f = fixture(stage);
  if (workerReviewSha256) { f.review.workerAuthority.controlReviewSha256 = workerReviewSha256; f.checkpoint.workerReviewSha256 = workerReviewSha256; }
  const calls: string[] = [], payloadRoles: string[] = [];
  let current = structuredClone(f.observation), staged = structuredClone(current), actor = "supabase_admin", pendingIndex = 0;
  let attempt: Record<string, unknown> | null = null;
  const plan = planProtectedPrelaunchMigrations(f.review, f.migrations);
  const session = { postgresContext: { searchPath: '"$user", public, extensions', timeZone: "UTC" },
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("BEGIN")) staged = structuredClone(current);
      const role = /SET LOCAL ROLE (postgres|supabase_admin);/u.exec(sql)?.[1];
      if (role) actor = role;
      if (sql === "RESET ROLE;") actor = "supabase_admin";
      if (sql === "SELECT session_user;") return "supabase_admin";
      if (sql === "SELECT current_user;") return actor;
      if (sql === "SELECT pg_export_snapshot();") return "00000003-00000004-1";
      if (sql.startsWith("UPDATE private.quantity_input_v4_policy")) staged.writerEnabled = sql.includes("SET enabled=true");
      if (plan.pending.some((row: PlannedMigration) => row.payload === sql)) { payloadRoles.push(actor); }
      if (sql.includes("INSERT INTO homecook_deploy.migrations")) {
        pendingIndex++;
        staged.ledger = f.review.database.source.slice(0, f.review.database.before.length + pendingIndex);
        actor = "postgres";
        if (pendingIndex === plan.pending.length) {
          staged.catalogSha256 = f.review.database.afterCatalogSha256;
          staged.immutableSha256 = f.review.database.afterImmutableSha256;
          staged.normalColumnsSha256 = f.review.database.afterColumnsSha256;
          staged.worker.catalogFingerprint = f.review.database.workerCatalogAfter;
        }
      }
      if (sql === "COMMIT;") { current = structuredClone(staged); actor = "supabase_admin"; }
      if (sql === "ROLLBACK;") { staged = structuredClone(current); actor = "supabase_admin"; }
      return "";
    }), close: vi.fn(async () => {}), stop: vi.fn() };
  const adapter = { observe: vi.fn(async (query?: unknown) => structuredClone(query ? staged : current)),
    migrationSession: vi.fn(() => session), session: vi.fn(() => session),
    backup: vi.fn(async ({ snapshot }: { snapshot: string }) => ({ snapshot, target: f.target, fullArchiveDecoded: true, sha256: sha("7"), rolesSha256: sha("8") })),
    reloadSchema: vi.fn(async () => {}) };
  const journal = { read: vi.fn(async () => attempt), write: vi.fn(async (record: Record<string, unknown>) => { attempt = structuredClone(record); }) };
  const options = { review: f.review, reviewSha256: hash(JSON.stringify(f.review)), operationId, readMigrations: vi.fn(async () => f.migrations),
    adapter, journal, assertBoundary: vi.fn(async () => {}), workerCheckpoint: stage === "worker" ? f.checkpoint : undefined };
  return { ...f, ...options, calls, payloadRoles, plan, session, getCurrent: () => current, getAttempt: () => attempt,
    setCurrent: (value: typeof current) => { current = value; }, engine: createProtectedPrelaunchDatabaseEngine(options) };
}

function policyRepairFixture(directory: string, reconciled = false) {
  const f = fixture("worker"), opdir = join(directory, operationId), uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const control = { schema: "homecook.youtube-c04-controlled-cutover-review.v1", releaseSha: f.review.to, targetSha256: f.review.database.targetSha256,
    operationId, operationRoot: directory, generationBefore: 47, generationAfter: 48, ledgerBefore: 226, ledgerAfter: 227,
    catalogBefore: deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE, catalogAfter: deploy.QUANTITY_V4_WORKER_CATALOG_AFTER,
    migrationSha256: deploy.QUANTITY_V4_MIGRATIONS[5].sha256, schemaIdentity: f.checkpoint.schemaIdentity,
    artifactSha256: f.checkpoint.artifactSha256, descriptorSha256: f.checkpoint.descriptorSha256, expectedSchemaSha256: sha("b"),
    snapshotDigest: f.checkpoint.snapshotDigest, preReceiptSha256: null, postReceiptSha256: null };
  const bytes = (value: object) => `${JSON.stringify(value, null, 2)}\n`;
  const controlPointer = { path: join(directory, "worker-review.json"), sha256: hash(bytes(control)) };
  f.review.workerAuthority.controlReviewSha256 = controlPointer.sha256;
  const previous = { ...f.checkpoint, schema: "homecook.prelaunch-quantity-worker-after.v1", ledgerCount: 227,
    catalogFingerprint: deploy.QUANTITY_V4_WORKER_CATALOG_AFTER, credentialGeneration: 48, credentialRowSha256: sha("a"),
    workerReviewSha256: controlPointer.sha256, workerReleaseSha: f.review.to, workerDatabaseReceiptSha256: sha("c"), serviceState: "running", pid: 12345 };
  const later = { ...previous, policyRowSha256: sha("d"), normalDataSha256: sha("e"), pid: 22345 };
  const previousPointer = { path: join(opdir, "post-worker-terminal.json"), sha256: hash(bytes(previous)) };
  const laterPointer = { path: join(opdir, "verifications", uuid, "post-worker-terminal.json"), sha256: hash(bytes(later)) };
  const header = { reviewSha256: controlPointer.sha256, operationId, operationDirectory: opdir,
    releaseSha: f.review.to, targetSha256: f.review.database.targetSha256, workerDatabaseReceiptSha256: previous.workerDatabaseReceiptSha256 };
  const earlierOrigin = { ...header, schema: "homecook.youtube-c04-controlled-cutover-journal.v1", state: "verified-policy-disabled",
    policyStableSha256: sha("f"), postWorkerTerminal: previousPointer };
  const previousOriginPointer = { path: join(opdir, "post-worker-origin.json"), sha256: hash(bytes(earlierOrigin)) };
  const observation = { targetSha256: previous.targetSha256, ledgerCount: 227, catalogFingerprint: previous.catalogFingerprint,
    credentialGeneration: 48, credentialRowSha256: previous.credentialRowSha256, workerReleaseSha: previous.workerReleaseSha,
    schemaIdentity: previous.schemaIdentity, snapshotDigest: previous.snapshotDigest, policyStableSha256: sha("f"),
    policyRowSha256: previous.policyRowSha256, workerPolicyEnabled: false, quantityPolicyEnabled: true, productWriterEnabled: true,
    weightWriterEnabled: true, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 };
  const service = { loaded: true, state: "running", pid: 32345, plistSha256: previous.plistSha256 };
  const verified = { ...header, schema: "homecook.youtube-c04-activation-verification.v1", observation, post: previous,
    authority: { readerReceiptSha256: sha("1"), writerReceiptSha256: sha("3") }, service, zeroActualAI: true };
  const verificationPointer = { path: join(opdir, "activation-verification.json"), sha256: hash(bytes(verified)) };
  const afterActivation = { ...observation, workerPolicyEnabled: true, policyRowSha256: sha("4") };
  const activated = { ...header, schema: "homecook.youtube-c04-activation-receipt.v1", status: "committed",
    activationVerification: verificationPointer, beforeObservation: observation, observation: afterActivation, database: afterActivation,
    ...verified.authority, service, zeroActualAI: true };
  const activationPointer = { path: join(opdir, "activation-receipt.json"), sha256: hash(bytes(activated)) };
  const reconciledObservation = { ...afterActivation, quantityPolicyEnabled: false };
  const reconciliation = { ...header, schema: "homecook.youtube-c04-activation-reconciliation.v1", status: "committed",
    activationVerification: verificationPointer, previousPostWorkerTerminal: previousPointer, previousPostWorkerOrigin: previousOriginPointer,
    beforeObservation: observation, observation: reconciledObservation, zeroActualAI: true,
    expectedAfter: { workerPolicyEnabled: true, policyStableSha256: sha("f"), credentialRowSha256: previous.credentialRowSha256,
      credentialGeneration: 48, workerReleaseSha: f.review.to, targetSha256: previous.targetSha256, ledgerCount: 227, catalogFingerprint: previous.catalogFingerprint } };
  const reconciliationPointer = { path: join(opdir, "activation-reconciliations", uuid, "receipt.json"), sha256: hash(bytes(reconciliation)) };
  const paused = { ...header, schema: "homecook.youtube-c04-repair-pause.v1", status: "quiesced", activationVerification: verificationPointer,
    activationReceipt: reconciled ? null : activationPointer, activationReconciliation: reconciled ? reconciliationPointer : null,
    previousPostWorkerTerminal: previousPointer, previousPostWorkerOrigin: previousOriginPointer, post: previous,
    beforeObservation: { ...afterActivation, quantityPolicyEnabled: false },
    observation: { ...observation, quantityPolicyEnabled: false, policyRowSha256: later.policyRowSha256 },
    service: { loaded: false, plistSha256: previous.plistSha256 }, zeroActualAI: true };
  const pausePointer = { path: join(opdir, "repair-pauses", `${uuid}.json`), sha256: hash(bytes(paused)) };
  const laterOrigin = { ...earlierOrigin, postWorkerTerminal: laterPointer, repairPause: pausePointer,
    activationVerification: verificationPointer, activationReceipt: paused.activationReceipt, activationReconciliation: paused.activationReconciliation,
    previousPostWorkerTerminal: previousPointer, previousPostWorkerOrigin: previousOriginPointer };
  const laterOriginPointer = { path: join(opdir, "verifications", uuid, "post-worker-origin.json"), sha256: hash(bytes(laterOrigin)) };
  const repair = { earlierOrigin, laterOrigin,
    previous: { record: previous, pointer: previousPointer, origin: { record: earlierOrigin, pointer: previousOriginPointer } },
    verification: { record: verified, pointer: verificationPointer }, pause: { record: paused, pointer: pausePointer },
    activation: reconciled ? null : { record: activated, pointer: activationPointer },
    reconciliation: reconciled ? { record: reconciliation, pointer: reconciliationPointer } : null };
  const files: Array<[string, object]> = [[controlPointer.path, control], [previousPointer.path, previous], [previousOriginPointer.path, earlierOrigin],
    [laterPointer.path, later], [laterOriginPointer.path, laterOrigin], [verificationPointer.path, verified], [pausePointer.path, paused],
    [reconciled ? reconciliationPointer.path : activationPointer.path, reconciled ? reconciliation : activated],
    [join(opdir, "cutover-journal.json"), { ...laterOrigin, postWorkerOrigin: laterOriginPointer }]];
  return { review: f.review, previous, later, repair, controlPointer, files, bytes };
}

function activeContinuationFixture(directory = "/owned-active-fixture") {
  const f = policyRepairFixture(directory);
  const post = f.repair.previous;
  const before = { ...f.repair.verification.record.observation, policy: { enabled: false, pipelineIdentity: "same-model" } };
  const after = { ...f.repair.activation!.record.observation, policy: { enabled: true, pipelineIdentity: "same-model" } };
  const verification = { ...structuredClone(f.repair.verification), record: { ...structuredClone(f.repair.verification.record), observation: before } };
  const activation = { ...structuredClone(f.repair.activation!), record: { ...f.repair.activation!.record,
    beforeObservation: structuredClone(before), observation: after, database: structuredClone(after) } };
  const current = { ...f.repair.earlierOrigin, state: "activation-committed", postWorkerTerminal: post.pointer,
    postWorkerOrigin: post.origin.pointer, activationVerification: verification.pointer, activationReceipt: activation.pointer };
  const authority = { database: { review: f.review, record: { status: "committed" },
    guardPointer: { path: join(directory, "db-guard.json"), sha256: post.record.workerDatabaseReceiptSha256 },
    pointer: { path: join(directory, "db.json"), sha256: post.record.workerDatabaseReceiptSha256 } },
    reader: { record: { readerFloor: f.review.to, workerReceipt: post.pointer }, pointer: { path: join(directory, "reader.json"), sha256: verification.record.authority.readerReceiptSha256 } },
    writer: { record: { status: "committed", readerFloor: f.review.to, workerReceipt: post.pointer }, pointer: { path: join(directory, "writer.json"), sha256: verification.record.authority.writerReceiptSha256 } },
    approval: { readerReceiptSha256: null }, readerWorker: post, writerWorker: post };
  const pre = { record: { ...fixture("worker").checkpoint, workerReviewSha256: f.controlPointer.sha256 },
    pointer: { path: join(directory, operationId, "pre-worker-checkpoint.json"), sha256: "" },
    origin: { record: { ...f.repair.earlierOrigin, state: "quiesced", workerDatabaseReceiptSha256: null, preWorkerCheckpoint: {path:"",sha256:""} },
      pointer: { path: join(directory, operationId, "pre-worker-origin.json"), sha256: "" } } };
  pre.pointer.sha256 = hash(f.bytes(pre.record)); pre.origin.record.preWorkerCheckpoint = pre.pointer;
  pre.origin.pointer.sha256 = hash(f.bytes(pre.origin.record));
  return { ...f, evidence: { current, pre, post, verification, activation, authority } };
}

describe("C04 active worker authority for an ordinary UI continuation", () => {
  it("consumes an exact committed activation without changing its OFF publication or historical PID", () => {
    const f = activeContinuationFixture(), original = structuredClone(f.evidence);
    expect(deploy.assertQuantityV4ActiveWorkerContinuation(f.review, f.evidence)).toEqual(f.evidence.activation.record.observation);
    expect(f.evidence).toEqual(original);
  });
  it.each(["activation-not-applied", "activation-outcome-unknown", "activation-commit-intent", "verified-policy-disabled"])("denies %s even with a historical committed receipt", state => {
    const f = activeContinuationFixture(); f.evidence.current.state = state;
    expect(() => deploy.assertQuantityV4ActiveWorkerContinuation(f.review, f.evidence)).toThrow();
  });
  it.each(["source", "DB2", "verification", "reader", "writer", "policy", "stable", "credential", "queue", "permit", "enqueue", "zeroAI", "post"])("rejects a forged %s binding", kind => {
    const f = activeContinuationFixture(), e = f.evidence, receipt = e.activation.record;
    if (kind === "source") receipt.releaseSha = ref("e");
    if (kind === "DB2") receipt.workerDatabaseReceiptSha256 = sha("e");
    if (kind === "verification") receipt.activationVerification = pointer("foreign", "e");
    if (kind === "reader") receipt.readerReceiptSha256 = sha("e");
    if (kind === "writer") receipt.writerReceiptSha256 = sha("e");
    if (kind === "policy") receipt.observation.policy.pipelineIdentity = "different-model";
    if (kind === "stable") receipt.observation.policyStableSha256 = sha("e");
    if (kind === "credential") receipt.observation.credentialRowSha256 = sha("e");
    if (kind === "queue") receipt.observation.queued = 1;
    if (kind === "permit") receipt.observation.permitHeld = true;
    if (kind === "enqueue") receipt.observation.activeEnqueueSessions = 1;
    if (kind === "zeroAI") receipt.zeroActualAI = false;
    if (kind === "post") e.verification.record.post.pid++;
    expect(() => deploy.assertQuantityV4ActiveWorkerContinuation(f.review, e)).toThrow();
  });
  it("uses committed ON whole/stable hashes for fresh DB readback while preserving the existing OFF gate", () => {
    const f = activeContinuationFixture(), base = fixture("worker"), after = structuredClone(base.observation);
    Object.assign(after, { ledger: f.review.database.after, catalogSha256: f.review.database.afterCatalogSha256,
      immutableSha256: f.review.database.afterImmutableSha256, normalColumnsSha256: f.review.database.afterColumnsSha256, scope: f.review.database.afterScope });
    Object.assign(after.worker, f.evidence.activation.record.observation, { credentialActive: true });
    after.writerEnabled = false;
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { activeWorkerContinuation: f.evidence })).not.toThrow();
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { workerCheckpoint: f.evidence.post.record })).toThrow();
    after.worker.policyRowSha256 = sha("e");
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { activeWorkerContinuation: f.evidence })).toThrow();
  });
  it("allows new business rows/quantity metadata without rewriting the historical activation transaction snapshot", () => {
    const f = activeContinuationFixture(), base = fixture("worker"), original = structuredClone(f.evidence);
    const after = { ...base.observation, ledger: f.review.database.after, catalogSha256: f.review.database.afterCatalogSha256,
      immutableSha256: f.review.database.afterImmutableSha256, normalColumnsSha256: f.review.database.afterColumnsSha256,
      scope: f.review.database.afterScope, normalDataSha256: sha("f"), metadataNull: false,
      worker: { ...base.observation.worker, ...f.evidence.activation.record.observation, credentialActive: true } };
    expect(after.normalDataSha256).not.toBe(f.evidence.post.record.normalDataSha256);
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { activeWorkerContinuation: f.evidence })).not.toThrow();
    expect(f.evidence).toEqual(original);
    after.worker.credentialRowSha256 = sha("e");
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { activeWorkerContinuation: f.evidence })).toThrow();
  });
  it("loads exact immutable activation bytes in an owned graph, rejects substitution, and keeps strict OFF loading separate", async () => {
    const directory = mkdtempSync(join(realpathSync("/tmp"), "c04-active-origin-unit-")); chmodSync(directory, 0o700);
    try {
      const f = activeContinuationFixture(directory), e = f.evidence;
      const save = (path: string, value: object) => { mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 }); writeFileSync(path, f.bytes(value), { mode: 0o600 }); };
      e.verification.pointer.sha256 = hash(f.bytes(e.verification.record));
      e.activation.record.activationVerification = { ...e.verification.pointer };
      e.activation.pointer.sha256 = hash(f.bytes(e.activation.record));
      e.current.activationReceipt = { ...e.activation.pointer }; e.current.activationVerification = { ...e.verification.pointer };
      Object.assign(e.current, { preWorkerCheckpoint: e.pre.pointer, preWorkerOrigin: e.pre.origin.pointer });
      for (const [path, value] of [[f.controlPointer.path, f.files[0][1]], [e.post.pointer.path, e.post.record],
        [e.pre.pointer.path, e.pre.record], [e.pre.origin.pointer.path, e.pre.origin.record],
        [e.post.origin.pointer.path, e.post.origin.record], [e.verification.pointer.path, e.verification.record], [e.activation.pointer.path, e.activation.record],
        [join(directory, operationId, "cutover-journal.json"), e.current]] as Array<[string, object]>) save(path, value);
      const modulePath = join(directory, "web.mjs"), source = readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8");
      writeFileSync(modulePath, fixtureStateRoot(webFixtureSource(source, {
        QUANTITY_V4_RELEASE_SHA: JSON.stringify(f.review.to),
        QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: `Object.freeze(${JSON.stringify(f.controlPointer)})`, QUANTITY_V4_WORKER_OPERATION_ROOT: JSON.stringify(directory),
      }), join(directory, "state")), { mode: 0o600 });
      const bound = await import(pathToFileURL(modulePath).href);
      const start = source.indexOf("export function loadQuantityV4ActiveWorkerContinuation("), end = source.indexOf("export function assertQuantityV4WorkerCheckpoint(", start);
      const loader = new Function("closedR2Require", "QUANTITY_V4_FEATURE", "QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN", "QUANTITY_V4_WORKER_OPERATION_ROOT", "isAbsolute", "join", "QUANTITY_V4_RELEASE_SHA", "CLOSED_R2_SHA",
        "readClosedR2PrivateBytes", "loadQuantityV4ReaderWriterReceipts", "isDeepStrictEqual", "loadQuantityV4WorkerCheckpointEvidence", "assertQuantityV4WorkerPublicationPair",
        "readQuantityV4PolicyRepairFile", "assertQuantityV4ActiveWorkerContinuation", source.slice(start, end).replace("export function", "function") + ";return loadQuantityV4ActiveWorkerContinuation;")(
        (condition: boolean, message: string) => { if (!condition) throw new Error(message); }, bound.QUANTITY_V4_FEATURE, f.controlPointer, directory,
        (path: string) => path.startsWith("/"), join, f.review.to, /^[a-f0-9]{64}$/u, bound.readClosedR2PrivateBytes,
        () => ({ ...e.authority, writerWorker: e.post }), isDeepStrictEqual, bound.loadQuantityV4WorkerCheckpointEvidence, bound.assertQuantityV4WorkerPublicationPair,
        (pointer: {path: string; sha256: string}, kind: string) => {
          const expected = kind === "verification" ? e.verification.pointer : e.activation.pointer;
          if (!isDeepStrictEqual(pointer, expected)) throw new Error("Foreign fixed publication");
          const bytes = bound.readClosedR2PrivateBytes(pointer.path, process.cwd());
          if (hash(bytes) !== pointer.sha256) throw new Error("Immutable bytes differ");
          return { pointer, record: JSON.parse(bytes) };
        }, bound.assertQuantityV4ActiveWorkerContinuation);
      expect(loader(process.cwd(), f.review).activation.record).toEqual(e.activation.record);
      expect(() => bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after")).toThrow("not OFF verified");
      save(e.activation.pointer.path, { ...e.activation.record, status: "unknown" });
      expect(() => loader(process.cwd(), f.review)).toThrow("Immutable bytes");
      save(join(directory, operationId, "cutover-journal.json"), { ...e.current, state: "verified-policy-disabled" });
      expect(loader(process.cwd(), f.review)).toBeNull();
      save(join(directory, operationId, "cutover-journal.json"), { ...e.current, state: "activation-outcome-unknown" });
      expect(() => loader(process.cwd(), f.review)).toThrow("denies");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

it("isolates all nine authority initializers even when the source is already bound", () => {
  const original = readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8");
  const marker = "/synthetic-unreadable-c04-authority/never-open";
  const bound = original.replace(/^export const (QUANTITY_V4_[A-Z_]+) = [^\r\n]*;$/gmu, (line, name: string) => {
    if (!Object.hasOwn(WEB_AUTHORITY_DEFAULTS, name)) return line;
    const value = name === "QUANTITY_V4_RELEASE_SHA" ? JSON.stringify(ref("d"))
      : name === "QUANTITY_V4_PROTECTION" ? JSON.stringify({ normalProjectionSha256: sha("7"), postimageRegistrySha256: sha("8") })
      : name === "QUANTITY_V4_WORKER_OPERATION_ROOT" ? JSON.stringify(`${marker}/operations`)
      : `Object.freeze(${JSON.stringify({ path: `${marker}/review.json`, sha256: sha("7") })})`;
    return `export const ${name} = ${value};`;
  });
  expect(bound).toContain(marker);
  const isolated = webFixtureSource(bound);
  expect(isolated).toBe(webFixtureSource(original)); expect(isolated).not.toContain(marker);
  expect(() => webFixtureSource(bound.replace(/^export const QUANTITY_V4_RELEASE_SHA = .*;$/mu, ""))).toThrow("exactly one");
  expect(() => webFixtureSource(`${bound}\nexport const QUANTITY_V4_RELEASE_SHA = null;`)).toThrow("exactly one");
  expect(() => webFixtureSource(bound.replace(/^export const QUANTITY_V4_RELEASE_SHA = .*;$/mu, "export const QUANTITY_V4_RELEASE_SHA =\n null;"))).toThrow("exactly one");
});

describe("C04 scope fingerprints", () => {
  it.each(["before", "after"] as const)("compares exact fields without depending on JSON key order (%s)", phase => {
    const f = fixture(), expected = f.review.database[phase === "before" ? "beforeScope" : "afterScope"];
    const observed = { ...f.observation,
      ...(phase === "after" ? { ledger: f.review.database.after, catalogSha256: f.review.database.afterCatalogSha256,
        immutableSha256: f.review.database.afterImmutableSha256, normalColumnsSha256: f.review.database.afterColumnsSha256 } : {}),
      scope: { aliasSha256: expected.aliasSha256, outerSha256: expected.outerSha256 },
    };
    expect(() => assertProtectedPrelaunchObservation(f.review, observed, phase)).not.toThrow();
    for (const scope of [{ outerSha256: expected.outerSha256 }, { ...observed.scope, extra: "unreviewed" },
      { ...observed.scope, aliasSha256: sha("e") }, { ...observed.scope, outerSha256: null }]) {
      expect(() => assertProtectedPrelaunchObservation(f.review, { ...observed, scope }, phase)).toThrow("C04 C03/C01");
    }
  });
});

describe("C04 unbound authority and exact5+1 source projection", () => {
  it("denies unbound C04 pins before any private path/target access", async () => {
    for (const pin of [deploy.QUANTITY_V4_CONSUMERS_REVIEW_PIN, deploy.QUANTITY_V4_WORKER_REVIEW_PIN, deploy.QUANTITY_V4_WRITER_REVIEW_PIN,
      deploy.QUANTITY_V4_WORKER_BEFORE_PIN, deploy.QUANTITY_V4_WORKER_AFTER_PIN]) expect(pin).toEqual({ path: null, sha256: null });
    expect(deploy.QUANTITY_V4_RELEASE_SHA).toBeNull(); expect(deploy.QUANTITY_V4_PROTECTION).toBeNull(); expect(QUANTITY_V4_NORMAL_DATA_SQL).toContain("nutrition_evidence_json");
    for (const phase of ["database", "worker-database", "reader", "writer-on"]) expect(() => deploy.loadProtectedRolloutReview("/nonexistent-repository", { feature: deploy.QUANTITY_V4_FEATURE, phase })).toThrow("no private I/O");
    expect(() => deploy.loadProtectedRolloutReview("/nonexistent-repository", { ref: ref("b"), phase: "worker-database" })).toThrow("no private I/O");
    const f = fixture("worker");
    expect(() => deploy.loadQuantityV4WorkerCheckpoint(f.review, "/nonexistent-repository", "before")).toThrow("no private I/O");
    expect(() => assertQuantityV4ProtectionPrepared(f.review)).toThrow("no target/config I/O");
    const inspect = vi.fn();
    expect(() => createProtectedPrelaunchAdapter({ inspect }, deploy.QUANTITY_V4_FEATURE, f.review)).toThrow("unbound");
    expect(inspect).not.toHaveBeenCalled();
    await expect(openProtectedPrelaunchTarget({ repositoryRoot: "/nonexistent-repository", configPath: "/missing/private.env", backupDirectory: "/missing", review: f.review })).rejects.toThrow("no target/config I/O");
    expect(() => deploy.loadQuantityV4DatabaseReceipt("/nonexistent-repository", "consumers")).toThrow("no private I/O");
    expect(() => deploy.loadQuantityV4DatabaseReceipt("/nonexistent-repository", "worker")).toThrow("no private I/O");
    expect(() => deploy.loadQuantityV4ReaderWriterReceipts("/nonexistent-repository")).toThrow("no private I/O");
  });
  it("selects only the three added worker phases without opening ordinary additive deployment", () => {
    for (const phase of ["worker-database", "worker-database-retry", "worker-reconcile"]) {
      expect(deploy.quantityV4StageForPhase(phase)).toBe("worker");
      expect(deploy.parsePrelaunchOptions(["--reviewed-protected-rollout", "--reviewed-ref", ref("a"), "--db-config", "/private/config.env", "--test-script", "test:feedback-batch:web", "--protected-phase", phase])).toMatchObject({ protectedPhase: phase });
      expect(() => deploy.parsePrelaunchOptions(["--protected-phase", phase])).toThrow();
    }
    expect(() => deploy.quantityV4StageForPhase("admin-sql")).toThrow();
  });
  it("pins all six real raw/payload bytes but applies only5postgres then1admin", () => {
    const a = fixture(), b = fixture("worker");
    expect(deploy.assertProtectedRolloutReview(a.review)).toBe(a.review);
    const first = planProtectedPrelaunchMigrations(a.review, a.migrations), last = planProtectedPrelaunchMigrations(b.review, b.migrations);
    expect(first.before).toHaveLength(221); expect(first.after).toHaveLength(226);
    expect(first.pending.map((row: PlannedMigration) => row.actor)).toEqual(Array(5).fill("postgres"));
    expect(last.before).toHaveLength(226); expect(last.after).toHaveLength(227);
    expect(last.pending.map((row: PlannedMigration) => row.actor)).toEqual(["supabase_admin"]);
    for (const row of a.rows) expect(hash(row.bytes)).toBe(row.sha256);
    const changed = a.migrations.map(row => ({ ...row }));
    changed[226] = { ...a.rows[5], bytes: Buffer.from("unreviewed future admin payload") };
    expect(() => planProtectedPrelaunchMigrations(a.review, changed)).toThrow("full six-file");
  });
  it("rejects omissions, C05, changed C01, role override and historical projection drift", () => {
    const f = fixture();
    expect(() => planProtectedPrelaunchMigrations(f.review, f.migrations.slice(0, 226))).toThrow();
    expect(() => planProtectedPrelaunchMigrations(f.review, [...f.migrations, { filename: "20261014230000_weight_improvement_participation.sql", sha256: sha("e") }])).toThrow();
    const changed = structuredClone(f.review); changed.database.source[220].sha256 = sha("1");
    expect(() => deploy.assertProtectedRolloutReview(changed)).toThrow();
    const override = structuredClone(f.review); Object.assign(override.database.migrations[0], { actor: "supabase_admin" });
    expect(() => planProtectedPrelaunchMigrations(override, f.migrations)).toThrow("raw bytes");
    const wrong = structuredClone(f.review); wrong.database.after = wrong.database.source.slice(0, 227);
    expect(() => deploy.assertProtectedRolloutReview(wrong)).toThrow("stage projections");
  });
  it("requires C01 actual ON authority and C03 ON without enabling either as a side effect", () => {
    const f = fixture();
    for (const key of ["writerEnabled", "productWriterEnabled"] as const) {
      const changed = structuredClone(f.review); changed.predecessorProtected[key] = false;
      expect(() => deploy.assertProtectedRolloutReview(changed)).toThrow("actual writer ON");
    }
    const off = { ...f.observation, cookedWeightWriterEnabled: false };
    expect(() => assertProtectedPrelaunchObservation(f.review, off, "before")).toThrow("C03/C01 ON");
    expect(classifyProtectedPrelaunchOutcome(f.review, off)).toBe("unknown");
  });
});

describe("the existing global deploy lock shared by two CLI callers", () => {
  it("keeps old lock creation/error/removal semantics and refuses another CLI until owner release", async () => {
    const directory = mkdtempSync(join(realpathSync("/tmp"), "c04-shared-lock-unit-")), stateRoot = join(directory, "state"), modulePath = join(directory, "deploy.mjs");
    mkdirSync(stateRoot, { mode: 0o700 });
    const original = readFileSync(join(process.cwd(), "scripts/lib/prelaunch-web-deploy.mjs"), "utf8");
    writeFileSync(modulePath, fixtureStateRoot(webFixtureSource(original), stateRoot));
    const url = pathToFileURL(modulePath).href;
    const first = spawn(process.execPath, ["--input-type=module", "-e", `import {acquirePrelaunchDeployLock} from ${JSON.stringify(url)}; const lock=acquirePrelaunchDeployLock(); process.stdout.write('held\\n'); for await(const input of process.stdin){break;} lock.release();`], { stdio: ["pipe", "pipe", "pipe"] });
    try {
      await once(first.stdout, "data");
      const blocked = spawnSync(process.execPath, ["--input-type=module", "-e", `import {acquirePrelaunchDeployLock} from ${JSON.stringify(url)}; acquirePrelaunchDeployLock();`], { encoding: "utf8" });
      expect(blocked.status).not.toBe(0); expect(blocked.stderr).toContain("배포 잠금이 있습니다");
      const complete = once(first, "exit"); first.stdin.end("release\n"); expect((await complete)[0]).toBe(0);
      const copy = await import(url), lock = copy.acquirePrelaunchDeployLock();
      expect(existsSync(join(stateRoot, "deploy.lock"))).toBe(true); lock.release(); lock.release();
      expect(existsSync(join(stateRoot, "deploy.lock"))).toBe(false);
      expect(() => { const failing = copy.acquirePrelaunchDeployLock(); try { throw new Error("fixture CLI exception"); } finally { failing.release(); } }).toThrow("fixture CLI exception");
      expect(existsSync(join(stateRoot, "deploy.lock"))).toBe(false);
      const owner = copy.acquirePrelaunchDeployLock(); renameSync(join(stateRoot, "deploy.lock"), join(stateRoot, "previous-lock")); mkdirSync(join(stateRoot, "deploy.lock"));
      expect(() => owner.release()).toThrow("소유자가 달라"); expect(existsSync(join(stateRoot, "deploy.lock"))).toBe(true);
      // The predecessor must stay fixed after this change is committed.
      const oldCli = execFileSync("git", ["show", "4385861d96a81bdf69a57e7240d7729cbb7835bd:scripts/deploy-prelaunch-web.mjs"], { encoding: "utf8" });
      expect(oldCli).toContain('try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new DeploymentError("배포 잠금이 있습니다. 다른 배포 종료 여부를 확인하세요."); }');
      expect(original).toContain('try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new DeploymentError("배포 잠금이 있습니다. 다른 배포 종료 여부를 확인하세요."); }');
      expect(oldCli).toContain("rmdirSync(lock);"); expect(original).toContain("rmdirSync(lock);");
    } finally { first.stdin.end(); if (first.exitCode === null) first.kill(); rmSync(directory, { recursive: true, force: true }); }
  });
});

describe("C04 staged transaction and no replay on unknown", () => {
  it.each(["consumers", "worker"] as const)("executes the exact %s actor sequence with separate backup and ledger owner", async stage => {
    const f = engineFixture(stage), result = await f.engine.apply();
    expect(result).toMatchObject({ status: "committed", feature: deploy.QUANTITY_V4_FEATURE, quantityStage: stage, readerReady: false, writerEnabled: false,
      productWriterEnabled: true, cookedWeightWriterEnabled: true, rowsPreservedInTransaction: true });
    expect(f.payloadRoles).toEqual(stage === "consumers" ? Array(5).fill("postgres") : ["supabase_admin"]);
    expect(f.calls.filter(sql => sql.includes("INSERT INTO homecook_deploy.migrations"))).toHaveLength(stage === "consumers" ? 5 : 1);
    expect(f.calls.filter(sql => sql.includes("INSERT INTO homecook_deploy.migrations")).every(sql => sql.startsWith("SET LOCAL ROLE supabase_admin;") && sql.endsWith("SET LOCAL ROLE postgres;"))).toBe(true);
    expect(f.getCurrent().ledger).toHaveLength(stage === "consumers" ? 226 : 227);
    expect(f.adapter.backup).toHaveBeenCalledTimes(1); expect(f.adapter.session).not.toHaveBeenCalled();
    expect(f.adapter.reloadSchema).toHaveBeenCalledWith(operationId);
    expect(f.calls.some(sql => sql.includes("UPDATE private."))).toBe(false);
    expect(f.calls[0]).toContain("LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE");
  });
  it.each(["consumers", "worker"] as const)("reconciles %s lost commit acknowledgment without repeating payload/backup", async stage => {
    const f = engineFixture(stage), query = f.session.query.getMockImplementation()!;
    f.session.query.mockImplementation(async sql => { const result = await query(sql); if (sql === "COMMIT;") throw new Error("owned mock lost acknowledgment"); return result; });
    await expect(f.engine.apply()).rejects.toThrow("lost acknowledgment");
    expect(f.getAttempt()?.status).toBe("unknown");
    const payloadCount = f.payloadRoles.length;
    await expect(f.engine.apply()).rejects.toThrow("automatic retry");
    expect(await f.engine.reconcile()).toMatchObject({ status: "committed", quantityStage: stage, writerEnabled: false });
    expect(f.payloadRoles).toHaveLength(payloadCount); expect(f.adapter.backup).toHaveBeenCalledTimes(1);
  });
  it("retains unknown on mixed ledger/catalog and rejects foreign journal stage", async () => {
    const f = engineFixture("worker"), query = f.session.query.getMockImplementation()!;
    f.session.query.mockImplementation(async sql => { const result = await query(sql); if (sql === "COMMIT;") throw new Error("unknown"); return result; });
    await expect(f.engine.apply()).rejects.toThrow();
    const foreign = structuredClone(f.getCurrent()); foreign.catalogSha256 = sha("0"); f.setCurrent(foreign);
    await expect(f.engine.reconcile()).rejects.toThrow("remains unknown");
    expect(f.getAttempt()?.status).toBe("unknown");
    f.journal.read.mockResolvedValue({ ...f.getAttempt(), quantityStage: "consumers" });
    await expect(f.engine.reconcile()).rejects.toThrow("stage differs");
  });
  it("rolls back before commit when the required payload role is not restored", async () => {
    const f = engineFixture("worker"), query = f.session.query.getMockImplementation()!;
    let payloadFinished = false;
    f.session.query.mockImplementation(async sql => { const result = await query(sql);
      if (sql === f.plan.pending[0].payload) payloadFinished = true;
      if (sql === "SELECT current_user;" && payloadFinished) return "youtube_extraction_worker_rpc_owner";
      return result;
    });
    await expect(f.engine.apply()).rejects.toThrow("role restoration");
    expect(f.getCurrent().ledger).toHaveLength(226); expect(f.getAttempt()?.status).toBe("rolled_back_before_commit");
    expect(f.calls).toContain("ROLLBACK;"); expect(f.calls).not.toContain("COMMIT;");
  });
  it("locks worker tables through the verified original admin session and observes through postgres", async () => {
    const f = engineFixture("worker"), query = f.session.query.getMockImplementation()!;
    const lockActors: string[] = [], observedActors: string[] = [];
    f.session.query.mockImplementation(async sql => { if (sql.startsWith("LOCK TABLE private.quantity_input_v4_policy")) lockActors.push(await query("SELECT current_user;")); return query(sql); });
    const observe = f.adapter.observe.getMockImplementation()!;
    f.adapter.observe.mockImplementation(async tx => { if (tx) observedActors.push(await query("SELECT current_user;")); return observe(tx); });
    await f.engine.apply();
    expect(lockActors).toEqual(["supabase_admin"]); expect(observedActors).toEqual(["postgres", "postgres", "postgres"]);
    expect(f.payloadRoles).toEqual(["supabase_admin"]);
    expect(f.calls.indexOf("SELECT session_user;")).toBeLessThan(f.calls.indexOf("RESET ROLE;"));
    const unrelated = engineFixture("consumers"); await unrelated.engine.apply();
    expect(unrelated.calls).not.toContain("RESET ROLE;");
    expect(unrelated.calls.some(sql => sql.startsWith("LOCK TABLE private.quantity_input_v4_policy"))).toBe(false);
  });
  it.each(["foreign-session", "lock-failure"] as const)("rolls back and closes %s without grants or payload dispatch", async failure => {
    const f = engineFixture("worker"), query = f.session.query.getMockImplementation()!;
    let rollbackActor = "";
    f.session.query.mockImplementation(async sql => {
      if (failure === "foreign-session" && sql === "SELECT session_user;") return "postgres";
      if (failure === "lock-failure" && sql.startsWith("LOCK TABLE private.quantity_input_v4_policy")) throw new Error("owned lock failure");
      const result = await query(sql); if (sql === "ROLLBACK;") rollbackActor = await query("SELECT current_user;"); return result;
    });
    await expect(f.engine.apply()).rejects.toThrow(failure === "foreign-session" ? "original admin session" : "owned lock failure");
    expect(f.getAttempt()?.status).toBe("rolled_back_before_commit"); expect(f.getCurrent().ledger).toHaveLength(226);
    expect(f.payloadRoles).toHaveLength(0); expect(f.adapter.backup).not.toHaveBeenCalled();
    expect(rollbackActor).toBe("supabase_admin"); expect(f.session.close).toHaveBeenCalledTimes(1);
    expect(f.calls).not.toContain("COMMIT;");
  });
  it.each([false, true])("preserves transaction proof across normal post-COMMIT activity (lost acknowledgment=%s)", async lostAcknowledgment => {
    const f = engineFixture("worker"), query = f.session.query.getMockImplementation()!;
    const originalData = f.checkpoint.normalDataSha256;
    f.session.query.mockImplementation(async sql => {
      const result = await query(sql);
      if (sql === "COMMIT;") {
        const current = structuredClone(f.getCurrent()); current.normalDataSha256 = sha("9"); current.preservedRowsSha256 = sha("8"); f.setCurrent(current);
        if (lostAcknowledgment) throw new Error("owned committed acknowledgment lost");
      }
      return result;
    });
    if (lostAcknowledgment) {
      await expect(f.engine.apply()).rejects.toThrow("acknowledgment lost");
      expect(f.getAttempt()).toMatchObject({ status: "unknown", normalDataSha256: originalData, rowsPreservedInTransaction: true });
      const attempt = structuredClone(f.getAttempt());
      f.journal.read.mockResolvedValue({ ...attempt, rowsPreservedInTransaction: false });
      await expect(f.engine.reconcile()).rejects.toThrow("transaction evidence");
      expect(f.adapter.reloadSchema).not.toHaveBeenCalled();
      f.journal.read.mockImplementation(async () => f.getAttempt());
      expect(await f.engine.reconcile()).toMatchObject({ status: "committed", normalDataSha256: originalData, rowsPreservedInTransaction: true });
    } else expect(await f.engine.apply()).toMatchObject({ status: "committed", normalDataSha256: originalData, rowsPreservedInTransaction: true });
    expect(f.getCurrent().normalDataSha256).toBe(sha("9")); expect(f.payloadRoles).toEqual(["supabase_admin"]);
    expect(f.adapter.backup).toHaveBeenCalledTimes(1);
  });
  it("rejects admission drift and normal-data mutation within the owned transaction", async () => {
    const admission = engineFixture("worker"), before = structuredClone(admission.getCurrent()); before.normalDataSha256 = sha("9"); admission.setCurrent(before);
    await expect(admission.engine.apply()).rejects.toThrow("fresh queue/permit/enqueue");
    expect(admission.adapter.backup).not.toHaveBeenCalled(); expect(admission.payloadRoles).toHaveLength(0);
    const f = engineFixture("worker"), observe = f.adapter.observe.getMockImplementation()!;
    f.adapter.observe.mockImplementation(async tx => { const result = await observe(tx); if (tx && result.ledger.length === 227) result.normalDataSha256 = sha("9"); return result; });
    await expect(f.engine.apply()).rejects.toThrow("rows changed inside");
    expect(f.getCurrent().ledger).toHaveLength(226); expect(f.getAttempt()?.status).toBe("rolled_back_before_commit");
    expect(f.getAttempt()?.rowsPreservedInTransaction).toBe(false); expect(f.calls).not.toContain("COMMIT;");
  });
  it("rolls back historical data drift inside the transaction", async () => {
    const f = engineFixture(), observe = f.adapter.observe.getMockImplementation()!;
    f.adapter.observe.mockImplementation(async query => { const result = await observe(query); if (result.ledger.length === 226) result.preservedRowsSha256 = sha("0"); return result; });
    await expect(f.engine.apply()).rejects.toThrow("rows changed");
    expect(f.getCurrent().ledger).toHaveLength(221); expect(f.getAttempt()?.status).toBe("rolled_back_before_commit");
  });
});

describe("C04 worker checkpoints never replace fresh state or final227 reader", () => {
  it("checks all original columns, added SQL NULL semantics and whole historical JSON without wildcard stripping", () => {
    const metadata = QUANTITY_V4_COLUMN_METADATA.map(([table, columns]) => ({ table: String(table),
      columns: (columns as Array<[string, string, boolean, string | null]>).map(([name, type, not_null, defaultValue]) => ({ name, type, not_null, default: defaultValue })) }));
    expect(assertQuantityV4Columns(metadata, 221)).toBe(metadata);
    const after = metadata.map(row => ({ ...row, columns: [...row.columns.map(column => row.table === "public.product_planner_entries" && column.name === "quantity_amount"
      ? { ...column, type: "numeric" } : column), { name: QUANTITY_V4_NORMAL_COLUMNS.find(spec => spec.table === row.table)!.added, type: "jsonb", not_null: false, default: null }] }));
    expect(assertQuantityV4Columns(after, 226)).toBe(after);
    const unknown = structuredClone(metadata); unknown[0].columns.push({ name: "unknown_source_column", type: "text", not_null: false, default: null });
    expect(() => assertQuantityV4Columns(unknown, 221)).toThrow("unknown columns");
    const required = structuredClone(after); required[0].columns.at(-1)!.not_null = true;
    expect(() => assertQuantityV4Columns(required, 226)).toThrow("nullability");
    expect(() => assertQuantityV4Columns(metadata.slice(1), 221)).toThrow();
    expect(QUANTITY_V4_NORMAL_DATA_SQL).toContain("public.recipe_content_snapshots t");
    expect(QUANTITY_V4_NORMAL_DATA_SQL).toContain("private.cooked_batch_weight_evidence t");
    expect(QUANTITY_V4_NORMAL_DATA_SQL).toContain("public.mutation_idempotency_keys t");
    expect(QUANTITY_V4_NORMAL_DATA_SQL).not.toMatch(/jsonb_strip_nulls|jsonb_set|updated_at\s*-/u);
  });
  it("requires exact checkpoint fields and rejects stale generation/queue/target observations", () => {
    const f = fixture("worker");
    expect(deploy.assertQuantityV4WorkerCheckpoint(f.review, f.checkpoint, "before")).toBe(f.checkpoint);
    expect(() => deploy.assertQuantityV4WorkerCheckpoint(f.review, { ...f.checkpoint, token: "forbidden" }, "before")).toThrow();
    for (const update of [{ queued: 1 }, { processing: 1 }, { permitHeld: true }, { activeEnqueueSessions: 1 }, { credentialGeneration: 48 }, { credentialRowSha256: sha("0") }, { credentialActive: false }]) {
      const changed = { ...f.observation, worker: { ...f.observation.worker, ...update } };
      expect(() => assertProtectedPrelaunchObservation(f.review, changed, "before", { workerCheckpoint: f.checkpoint })).toThrow();
    }
    expect(() => assertProtectedPrelaunchObservation(f.review, { ...f.observation, ledgerAuthority: false }, "before", { workerCheckpoint: f.checkpoint })).toThrow();
    expect(() => assertProtectedPrelaunchObservation(f.review, { ...f.observation, target: { foreign: true } }, "before", { workerCheckpoint: f.checkpoint })).toThrow();
    expect(() => createProtectedPrelaunchDatabaseEngine({ ...engineFixture("worker"), workerCheckpoint: undefined })).toThrow("checkpoint");
  });
  it("does not publish a reader floor or permit ordinary deployment at226 or worker-not-applied", async () => {
    const f = engineFixture(), guard = await f.engine.apply();
    expect(deploy.protectedRolloutStatus({ review: f.review, reviewSha256: f.reviewSha256, guard, reader: null, writer: null })).toMatchObject({ appliedLedgerCount: 226, readerPending: true, readerFloor: null, normalDeploymentAllowed: false });
    const worker = engineFixture("worker");
    const notApplied = { schema: "homecook.prelaunch-protected-db-attempt.v1", from: worker.review.from, to: worker.review.to, reviewSha256: worker.reviewSha256, status: "not_applied" };
    expect(deploy.protectedRolloutStatus({ review: worker.review, reviewSha256: worker.reviewSha256, guard: notApplied, reader: null, writer: null })).toMatchObject({ appliedLedgerCount: 226, normalDeploymentAllowed: false });
    expect(() => deploy.protectedRolloutReaderReceipt({ review: f.review, reviewSha256: f.reviewSha256, databaseReceipt: guard,
      live: { ref: f.review.to, buildId: "candidate", bytes: Buffer.from("plist") }, verifiedFlowsSha256: f.review.readerFlowsSha256 })).toThrow();
  });
  it("keeps future reader/control observations separate from DDL NULL preparation", () => {
    const f = fixture(), after = { ...f.observation, ledger: f.review.database.after, catalogSha256: f.review.database.afterCatalogSha256,
      immutableSha256: f.review.database.afterImmutableSha256, normalColumnsSha256: f.review.database.afterColumnsSha256, metadataNull: false };
    expect(assertProtectedPrelaunchObservation(f.review, after, "after")).toBe(after);
    expect(() => assertProtectedPrelaunchObservation(f.review, after, "after", { ddlOnly: true })).toThrow("may not populate");
  });
  it("keeps C04 writer and reader OFF until a root-bound final worker receipt exists", () => {
    const f = engineFixture("worker");
    const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", databasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })),
      readerFlowsSha256: f.review.readerFlowsSha256, readerReceiptSha256: null, releaseSha: f.review.to, rolloutReviewSha256: f.reviewSha256, safeOff: true, writerOn: true, workerReceiptSha256: null };
    expect(() => deploy.assertProtectedWriterReview(approval, f.review, f.reviewSha256)).toThrow("root-bound");
    expect(() => createProtectedPrelaunchWriter({ ...f, approval, approvalSha256: sha("a"), readerReceipt: {}, readerReceiptSha256: sha("b"), action: "writer-on" })).toThrow();
    expect(deploy.protectedReaderFenceSql(f.review).begin).toContain("private.quantity_input_v4_policy IN SHARE MODE");
    expect(deploy.protectedReaderFenceSql(f.review).check).toContain("NOT bool_or(enabled)");
  });
  it("uses only the C04 control in a copied, explicitly bound synthetic fixture and preserves both predecessor controls", async () => {
    const directory = mkdtempSync(join(realpathSync("/tmp"), "c04-bound-control-unit-"));
    try {
      // Like the existing pin tests: bind only this disposable module, never repository authority.
      const webSource = readFileSync(join(process.cwd(), "scripts/lib/prelaunch-web-deploy.mjs"), "utf8");
      const webPath = join(directory, "web.mjs"), databasePath = join(directory, "database.mjs"), terminalSha = sha("9");
      const operationRoot = join(directory, "operations");
      writeFileSync(webPath, fixtureStateRoot(webFixtureSource(webSource, {
        QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: `Object.freeze(${JSON.stringify({ path: join(directory, "original-worker-review.json"), sha256: sha("1") })})`,
        QUANTITY_V4_WORKER_OPERATION_ROOT: JSON.stringify(operationRoot),
      }), join(directory, "state")));
      writeFileSync(databasePath, databaseFixtureSource(readFileSync("scripts/lib/prelaunch-database.mjs", "utf8"), webPath));
      const boundWeb = await import(pathToFileURL(webPath).href), boundDatabase = await import(pathToFileURL(databasePath).href);
      const f = engineFixture("worker"), databaseReceipt = await f.engine.apply();
      const workerAfter = { ...f.checkpoint, schema: "homecook.prelaunch-quantity-worker-after.v1", ledgerCount: 227,
        catalogFingerprint: deploy.QUANTITY_V4_WORKER_CATALOG_AFTER, serviceState: "running", pid: 12345,
        credentialGeneration: 48, credentialRowSha256: sha("a"), workerReleaseSha: f.review.to, workerDatabaseReceiptSha256: hash(JSON.stringify(databaseReceipt)) };
      const operationDirectory = join(operationRoot, operationId);
      const control = { schema: "homecook.youtube-c04-controlled-cutover-review.v1", releaseSha: f.review.to, targetSha256: f.review.database.targetSha256,
        operationId, operationRoot, generationBefore: 47, generationAfter: 48, ledgerBefore: 226, ledgerAfter: 227,
        catalogBefore: deploy.QUANTITY_V4_WORKER_CATALOG_BEFORE, catalogAfter: deploy.QUANTITY_V4_WORKER_CATALOG_AFTER,
        migrationSha256: deploy.QUANTITY_V4_MIGRATIONS[5].sha256, schemaIdentity: workerAfter.schemaIdentity, artifactSha256: workerAfter.artifactSha256,
        descriptorSha256: workerAfter.descriptorSha256, expectedSchemaSha256: sha("b"), snapshotDigest: workerAfter.snapshotDigest,
        preReceiptSha256: null, postReceiptSha256: null };
      const controlledJournal = { schema: "homecook.youtube-c04-controlled-cutover-journal.v1", reviewSha256: f.review.workerAuthority.controlReviewSha256,
        operationId, operationDirectory, releaseSha: f.review.to, targetSha256: f.review.database.targetSha256, state: "verified-policy-disabled", policyStableSha256: sha("f"),
        workerDatabaseReceiptSha256: workerAfter.workerDatabaseReceiptSha256,
        postWorkerTerminal: { path: `${operationDirectory}/post-worker-terminal.json`, sha256: terminalSha } };
      expect(boundWeb.assertQuantityV4WorkerAuthority(f.review, control, controlledJournal, workerAfter, "after", operationDirectory)).toBe(workerAfter);
      expect(() => boundWeb.assertQuantityV4WorkerAuthority(f.review, control, { ...controlledJournal, state: "unknown" }, workerAfter, "after", operationDirectory)).toThrow("controlled journal");
      expect(() => boundWeb.assertQuantityV4WorkerAuthority(f.review, control, { ...controlledJournal, workerDatabaseReceiptSha256: sha("c") }, workerAfter, "after", operationDirectory)).toThrow("controlled journal");
      expect(() => boundWeb.assertQuantityV4WorkerAuthority(f.review, { ...control, postReceiptSha256: sha("c") }, controlledJournal, workerAfter, "after", operationDirectory)).toThrow("controlled journal");
      const repairPath = `${operationDirectory}/verifications/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/post-worker-terminal.json`;
      expect(boundWeb.assertQuantityV4WorkerAuthority(f.review, control,
        { ...controlledJournal, postWorkerTerminal: { path: repairPath, sha256: terminalSha } }, workerAfter, "after", operationDirectory)).toBe(workerAfter);
      expect(() => boundWeb.assertQuantityV4WorkerAuthority(f.review, control,
        { ...controlledJournal, postWorkerTerminal: { path: `${operationDirectory}/../foreign/post-worker-terminal.json`, sha256: terminalSha } }, workerAfter, "after", operationDirectory)).toThrow("controlled journal");
      const current = structuredClone(f.getCurrent());
      Object.assign(current.worker, { credentialGeneration: 48, credentialRowSha256: sha("a"), workerReleaseSha: f.review.to }); f.setCurrent(current);
      const reader = boundWeb.protectedRolloutReaderReceipt({ review: f.review, reviewSha256: f.reviewSha256, databaseReceipt,
        databaseReceiptSha256: workerAfter.workerDatabaseReceiptSha256, workerReceiptSha256: terminalSha,
        workerReceipt: controlledJournal.postWorkerTerminal,
        live: { ref: f.review.to, buildId: "fixture-final-reader", bytes: Buffer.from("fixture plist") }, verifiedFlowsSha256: f.review.readerFlowsSha256, workerCheckpoint: workerAfter });
      const readerBefore = structuredClone(reader);
      const repairedWorker = { ...workerAfter, pid: 22345, normalDataSha256: sha("c") }, repairedPointer = { path: repairPath, sha256: sha("d") };
      expect(boundWeb.assertQuantityV4WorkerPublicationPair(f.review, workerAfter, repairedWorker)).toBe(repairedWorker);
      expect(boundWeb.assertQuantityV4WorkerProcess(repairedWorker, { plistSha256: repairedWorker.plistSha256, serviceState: "running", pid: 22345 })).toMatchObject({ pid: 22345 });
      expect(() => boundWeb.assertQuantityV4WorkerProcess(repairedWorker, { plistSha256: repairedWorker.plistSha256, serviceState: "running", pid: 12345 })).toThrow("PID differs");
      for (const update of [{ workerReviewSha256: sha("e") }, { workerDatabaseReceiptSha256: sha("e") }, { artifactSha256: sha("e") }, { plistSha256: sha("e") }]) {
        expect(() => boundWeb.assertQuantityV4WorkerPublicationPair(f.review, workerAfter, { ...repairedWorker, ...update })).toThrow();
      }
      const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: f.reviewSha256, releaseSha: f.review.to,
        databasePlanSha256: reader.databasePlanSha256, readerReceiptSha256: hash(JSON.stringify(reader)), readerFlowsSha256: f.review.readerFlowsSha256,
        safeOff: true, writerOn: true, workerReceiptSha256: null };
      const writes = [];
      for (const action of ["writer-on", "writer-off"]) {
        if (action === "writer-off") {
          const live = structuredClone(f.getCurrent());
          Object.assign(live.worker, { queued: 7, processing: 1, permitHeld: true, activeEnqueueSessions: 1,
            credentialActive: false, workerPolicyEnabled: true, policyRowSha256: sha("b") }); f.setCurrent(live);
        }
        let attempt: Record<string, unknown> | null = null;
        const journal = { read: async () => attempt, write: async (value: Record<string, unknown>) => { attempt = value; } };
        const writer = boundDatabase.createProtectedPrelaunchWriter({ review: f.review, reviewSha256: f.reviewSha256, approval,
          approvalSha256: hash(JSON.stringify(approval)), readerReceipt: reader, readerReceiptSha256: approval.readerReceiptSha256,
          operationId, action, adapter: f.adapter, journal, assertBoundary: async () => {}, workerCheckpoint: repairedWorker,
          readerWorkerCheckpoint: workerAfter, workerReceipt: repairedPointer });
        const receipt = await writer.apply(); writes.push(receipt);
        if (action === "writer-on") {
          expect(receipt.workerReceipt).toEqual(repairedPointer);
          expect(boundWeb.assertQuantityV4ReaderWriterWorkerEvidence(f.review, reader, receipt, workerAfter.workerDatabaseReceiptSha256,
            { record: workerAfter, pointer: controlledJournal.postWorkerTerminal }, { record: repairedWorker, pointer: repairedPointer })).toBe(repairedWorker);
          const currentP3 = { ...repairedWorker, pid: 32345 };
          expect(boundWeb.assertQuantityV4WorkerPublicationPair(f.review, repairedWorker, currentP3)).toBe(currentP3);
          expect(reader).toEqual(readerBefore); // P1 is an immutable publication, never rewritten to P2/P3.
        }
      }
      expect(writes.map(value => value.writerEnabled)).toEqual([true, false]);
      expect(f.calls.filter(sql => sql.startsWith("UPDATE private."))).toEqual([
        "UPDATE private.quantity_input_v4_policy SET enabled=true WHERE singleton AND enabled=false;",
        "UPDATE private.quantity_input_v4_policy SET enabled=false WHERE singleton AND enabled=true;",
      ]);
      expect(f.getCurrent()).toMatchObject({ productWriterEnabled: true, cookedWeightWriterEnabled: true });
      expect(f.getCurrent().worker).toMatchObject({ queued: 7, processing: 1, credentialActive: false, workerPolicyEnabled: true, policyRowSha256: sha("b") });
      expect(deploy.QUANTITY_V4_WORKER_AFTER_PIN).toEqual({ path: null, sha256: null });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});


describe("C04 policy pause repair consumes exact immutable lineage", () => {
  it.each([false, true])("accepts only the complete activation/pause chain (reconciliation=%s)", reconciled => {
    const f = policyRepairFixture("/fixture/c04-operations", reconciled);
    expect(() => deploy.assertQuantityV4WorkerPublicationPair(f.review, f.previous, f.later)).toThrow("immutable activation/pause");
    expect(deploy.assertQuantityV4WorkerPublicationPair(f.review, f.previous, f.later, f.repair)).toBe(f.later);
    const read = { workerReceipt: f.repair.previous.pointer, workerReceiptSha256: f.repair.previous.pointer.sha256 };
    const writePointer = f.repair.laterOrigin.postWorkerTerminal;
    const write = { workerReceipt: writePointer, workerReceiptSha256: writePointer.sha256 };
    expect(deploy.assertQuantityV4ReaderWriterWorkerEvidence(f.review, read, write, f.later.workerDatabaseReceiptSha256,
      f.repair.previous, { record: f.later, pointer: writePointer, origin: { record: f.repair.laterOrigin }, policyRepair: f.repair })).toBe(f.later);
    expect(f.previous.pid).toBe(12345); expect(f.later.pid).toBe(22345);
    const changed = structuredClone(f.repair); changed.pause.record.observation.policyStableSha256 = sha("0");
    expect(() => deploy.assertQuantityV4WorkerPublicationPair(f.review, f.previous, f.later, changed)).toThrow("stable policy");
  });
  it("rejects foreign/mixed/unknown/null/not-applied and incomplete stable chains", () => {
    const f = policyRepairFixture("/fixture/c04-operations");
    const mutations = [
      (r: typeof f.repair) => { r.pause.record.status = "drain_pending"; },
      (r: typeof f.repair) => { r.pause.record.reviewSha256 = sha("0"); },
      (r: typeof f.repair) => { r.pause.record.workerDatabaseReceiptSha256 = sha("0"); },
      (r: typeof f.repair) => { r.pause.record.beforeObservation.policyRowSha256 = sha("0"); },
      (r: typeof f.repair) => { r.laterOrigin.policyStableSha256 = sha("0"); },
      (r: typeof f.repair) => { r.verification.record.post.artifactSha256 = sha("0"); },
      (r: typeof f.repair) => { r.pause.record.previousPostWorkerOrigin = { ...r.pause.record.previousPostWorkerOrigin, sha256: sha("0") }; },
      (r: typeof f.repair) => { r.previous.record.credentialRowSha256 = sha("0"); },
      (r: typeof f.repair) => { r.pause.record.service.loaded = true; },
      (r: typeof f.repair) => { r.activation = null; r.laterOrigin.activationReceipt = null; r.pause.record.activationReceipt = null; },
    ];
    for (const [index, mutate] of mutations.entries()) { const changed = structuredClone(f.repair); mutate(changed);
      expect(() => deploy.assertQuantityV4WorkerPublicationPair(f.review, f.previous, f.later, changed), `mutation ${index}`).toThrow(); }
    const uncertain = policyRepairFixture("/fixture/c04-operations", true);
    uncertain.repair.reconciliation!.record.status = "not_applied";
    expect(() => deploy.assertQuantityV4WorkerPublicationPair(uncertain.review, uncertain.previous, uncertain.later, uncertain.repair)).toThrow("durable OFF");
  });
  it.each([false, true])("loads private fixed origins/receipts without recursive discovery (reconciliation=%s)", async reconciled => {
    const directory = mkdtempSync(join(realpathSync("/tmp"), "c04-policy-origin-unit-")); chmodSync(directory, 0o700);
    try {
      const f = policyRepairFixture(directory, reconciled);
      for (const [path, value] of f.files) { mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 }); writeFileSync(path, f.bytes(value), { mode: 0o600 }); }
      const modulePath = join(directory, "web.mjs"), source = readFileSync(join(process.cwd(), "scripts/lib/prelaunch-web-deploy.mjs"), "utf8");
      writeFileSync(modulePath, fixtureStateRoot(webFixtureSource(source, {
        QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: `Object.freeze(${JSON.stringify(f.controlPointer)})`,
        QUANTITY_V4_WORKER_OPERATION_ROOT: JSON.stringify(directory),
      }), join(directory, "state")));
      const bound = await import(pathToFileURL(modulePath).href);
      const evidence = bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after");
      expect(evidence.record).toEqual(f.later); expect(evidence.origin.record).toEqual(f.repair.laterOrigin);
      expect(evidence.policyRepair.previous.record).toEqual(f.previous);
      const p3 = { ...f.later, pid: 32345, normalDataSha256: sha("1") };
      const p3Directory = join(directory, operationId, "verifications", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      mkdirSync(p3Directory, { recursive: true, mode: 0o700 });
      const p3Pointer = { path: join(p3Directory, "post-worker-terminal.json"), sha256: hash(f.bytes(p3)) };
      const p3Origin = { ...f.repair.laterOrigin, postWorkerTerminal: p3Pointer };
      writeFileSync(p3Pointer.path, f.bytes(p3), { mode: 0o600 });
      const p3OriginPath = join(p3Directory, "post-worker-origin.json");
      writeFileSync(p3OriginPath, f.bytes(p3Origin), { mode: 0o600 });
      const p3Evidence = bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after", true, p3Pointer);
      expect(p3Evidence.policyRepair.previous.pointer).toEqual(f.repair.previous.pointer); // Reuse pause's P1 basis, never the latest PID publication.
      expect(bound.assertQuantityV4WorkerPublicationPair(f.review, f.previous, p3Evidence.record,
        { ...p3Evidence.policyRepair, earlierOrigin: f.repair.earlierOrigin })).toEqual(p3);
      writeFileSync(p3OriginPath, f.bytes({ ...p3Origin, previousPostWorkerTerminal: evidence.pointer, previousPostWorkerOrigin: evidence.origin.pointer }));
      expect(() => bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after", true, p3Pointer)).toThrow("publication links");
      writeFileSync(p3OriginPath, f.bytes(p3Origin));

      const databasePath = join(directory, "database.mjs");
      writeFileSync(databasePath, databaseFixtureSource(readFileSync("scripts/lib/prelaunch-database.mjs", "utf8"), modulePath));
      const boundDatabase = await import(pathToFileURL(databasePath).href), engine = engineFixture("worker", f.controlPointer.sha256), receipt = await engine.engine.apply();
      const reader = bound.protectedRolloutReaderReceipt({ review: f.review, reviewSha256: hash(JSON.stringify(f.review)), databaseReceipt: receipt,
        databaseReceiptSha256: f.previous.workerDatabaseReceiptSha256, workerReceiptSha256: f.repair.previous.pointer.sha256,
        workerReceipt: f.repair.previous.pointer, workerCheckpoint: f.previous,
        live: { ref: f.review.to, buildId: "immutable-P1", bytes: Buffer.from("fixture plist") }, verifiedFlowsSha256: f.review.readerFlowsSha256 });
      const actual = structuredClone(engine.getCurrent()); actual.normalDataSha256 = f.later.normalDataSha256;
      Object.assign(actual.worker, { credentialGeneration: 48, credentialRowSha256: f.later.credentialRowSha256,
        policyRowSha256: f.later.policyRowSha256, workerReleaseSha: f.review.to }); engine.setCurrent(actual);
      const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: hash(JSON.stringify(f.review)), releaseSha: f.review.to,
        databasePlanSha256: reader.databasePlanSha256, readerReceiptSha256: hash(JSON.stringify(reader)), readerFlowsSha256: f.review.readerFlowsSha256,
        safeOff: true, writerOn: true, workerReceiptSha256: null };
      let attempt: Record<string, unknown> | null = null;
      const options = { review: f.review, reviewSha256: approval.rolloutReviewSha256, approval, approvalSha256: hash(JSON.stringify(approval)),
        readerReceipt: reader, readerReceiptSha256: approval.readerReceiptSha256, operationId, action: "writer-on", adapter: engine.adapter,
        journal: { read: async () => attempt, write: async (value: Record<string, unknown>) => { attempt = value; } }, assertBoundary: async () => {},
        workerCheckpoint: evidence.record, readerWorkerCheckpoint: f.previous, workerReceipt: evidence.pointer };
      expect(() => boundDatabase.createProtectedPrelaunchWriter(options)).toThrow("immutable activation/pause");
      const query = engine.session.query.getMockImplementation()!, locks: string[] = [], writes: string[] = [];
      engine.session.query.mockImplementation(async sql => {
        if (sql.startsWith("LOCK TABLE private.youtube_extraction_current_policy")) locks.push(await query("SELECT current_user;"));
        if (sql.startsWith("UPDATE private.quantity_input_v4_policy")) writes.push(await query("SELECT current_user;"));
        return query(sql);
      });
      engine.adapter.session.mockClear(); engine.adapter.migrationSession.mockClear();
      const writer = boundDatabase.createProtectedPrelaunchWriter({ ...options, workerPolicyRepair: { ...evidence.policyRepair, earlierOrigin: f.repair.earlierOrigin } });
      const committed = await writer.apply();
      expect(engine.adapter.session).not.toHaveBeenCalled(); expect(engine.adapter.migrationSession).toHaveBeenCalledTimes(1);
      expect(locks).toEqual(["supabase_admin"]); expect(writes).toEqual(["postgres"]); expect(committed.workerReceipt).toEqual(evidence.pointer); expect(committed.writerEnabled).toBe(true);
      expect(reader.workerReceipt).toEqual(f.repair.previous.pointer); expect(actual.worker.workerPolicyEnabled).toBe(false);
      expect(engine.calls.filter(sql => sql.startsWith("UPDATE private."))).toEqual(["UPDATE private.quantity_input_v4_policy SET enabled=true WHERE singleton AND enabled=false;"]);
      for (const failure of ["foreign-session", "missing-context", "lock-failure"]) {
        const failed = { ...options, action: "writer-off", workerPolicyRepair: { ...evidence.policyRepair, earlierOrigin: f.repair.earlierOrigin } };
        let failedAttempt: Record<string, unknown> | null = null;
        failed.journal = { read: async () => failedAttempt, write: async value => { failedAttempt = value; } };
        const failedAdapter = { ...engine.adapter, migrationSession: () => ({ ...engine.session,
          postgresContext: failure === "missing-context" ? undefined : engine.session.postgresContext,
          query: async (sql: string) => {
            if (failure === "foreign-session" && sql === "SELECT session_user;") return "postgres";
            if (failure === "lock-failure" && sql.startsWith("LOCK TABLE private.youtube_extraction_current_policy")) throw new Error("owned writer lock failure");
            return engine.session.query(sql);
          },
        }) };
        const off = boundDatabase.createProtectedPrelaunchWriter({ ...failed, adapter: failedAdapter });
        await expect(off.apply()).rejects.toThrow(failure === "lock-failure" ? "owned writer lock failure" : "original admin session/context");
        expect(failedAttempt!.status).toBe("rolled_back_before_commit"); expect(engine.getCurrent().writerEnabled).toBe(true);
      }


      const historical = bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after", true, f.repair.previous.pointer);
      expect(historical.record).toEqual(f.previous); expect(historical.policyRepair).toBeUndefined();
      expect(bound.assertQuantityV4WorkerPublicationPair(f.review, historical.record, evidence.record,
        { ...evidence.policyRepair, earlierOrigin: historical.origin.record })).toEqual(f.later);
      const pausePath = f.repair.pause.pointer.path, validBytes = readFileSync(pausePath);
      writeFileSync(pausePath, f.bytes({ ...f.repair.pause.record, status: "drain_pending" }));
      expect(() => bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after")).toThrow("immutable bytes");
      writeFileSync(pausePath, validBytes); chmodSync(pausePath, 0o644);
      expect(() => bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after")).toThrow("권한");
      chmodSync(pausePath, 0o600);
      const badOrigin = { ...f.repair.laterOrigin, repairPause: { ...f.repair.pause.pointer, path: join(directory, "foreign.json") } };
      const originPath = join(directory, operationId, "verifications", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "post-worker-origin.json");
      writeFileSync(originPath, f.bytes(badOrigin));
      expect(() => bound.loadQuantityV4WorkerCheckpointEvidence(f.review, process.cwd(), "after", true, f.repair.laterOrigin.postWorkerTerminal)).toThrow("publication path");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe("C04 real durable producer and strict loader roundtrip", () => {
  it("keeps commit/catch proof bytes in the real journal and strict two-stage loader", async () => {
    const directory=realpathSync(mkdtempSync(join(realpathSync("/tmp"),"c04-receipt-interop-")));
    const stateRoot=join(directory,"state");mkdirSync(stateRoot,{mode:0o700});
    const bytes=(v:unknown)=>`${JSON.stringify(v,null,2)}\n`;
    const prepared=async(stage:"consumers"|"worker",parent?:{review:ReturnType<typeof fixture>["review"];pointer:{path:string;sha256:string}})=>{
      const f=engineFixture(stage);
      if(parent){f.review.consumersReceipt=parent.pointer;f.checkpoint.consumersReceiptSha256=parent.pointer.sha256;f.review.database.beforeCatalogSha256=parent.review.database.afterCatalogSha256;
        f.review.database.immutableSha256=parent.review.database.afterImmutableSha256;
        const current=structuredClone(f.getCurrent());current.catalogSha256=f.review.database.beforeCatalogSha256;current.immutableSha256=f.review.database.immutableSha256;f.setCurrent(current);}
      const paths=deploy.protectedRolloutPaths(stateRoot,f.review);mkdirSync(paths.operationRoot,{mode:0o700});const operationDirectory=join(paths.operationRoot,operationId);mkdirSync(operationDirectory,{mode:0o700});
      const journal=createProtectedPrelaunchJournal({repositoryRoot:process.cwd(),operationDirectory,operationId,guardPath:paths.databaseGuardPath});
      const engine=createProtectedPrelaunchDatabaseEngine({...f,journal,reviewSha256:hash(JSON.stringify(f.review))});
      if(stage==="worker") {const query=f.session.query.getMockImplementation()!;
        f.session.query.mockImplementation(async sql=>{const result=await query(sql);if(sql==="COMMIT;"){const after=structuredClone(f.getCurrent());after.normalDataSha256=sha("9");after.preservedRowsSha256=sha("8");f.setCurrent(after);throw new Error("ordinary lost acknowledgment");}return result;});
        await expect(engine.apply()).rejects.toThrow("lost acknowledgment");
        const unknown=JSON.parse(readFileSync(paths.databaseGuardPath,"utf8"));expect(unknown).toMatchObject({status:"unknown",commitDispatched:true,rowsPreservedInTransaction:true,normalDataSha256:sha("4"),preservedRowsSha256:sha("3")});
        await expect(engine.reconcile()).resolves.toMatchObject({status:"committed",rowsPreservedInTransaction:true,normalDataSha256:sha("4"),preservedRowsSha256:sha("3")});
      } else await expect(engine.apply()).resolves.toMatchObject({status:"committed",rowsPreservedInTransaction:true});
      const receiptPath=join(operationDirectory,"receipt.json"), receipt=readFileSync(receiptPath);
      expect(receipt.equals(readFileSync(paths.databaseGuardPath))).toBe(true);
      expect(JSON.parse(receipt.toString()).journalFile).toBe("attempt.json");
      await expect(journal.write({ ...JSON.parse(receipt.toString()), journalFile: "foreign.json" })).rejects.toThrow("journal locator");
      const reviewPath=join(directory,`${stage}-review.json`),reviewBytes=bytes(f.review);writeFileSync(reviewPath,reviewBytes,{mode:0o600});
      return {...f,paths,receiptPath,receipt,reviewPath,reviewSha256:hash(reviewBytes),pointer:{path:receiptPath,sha256:hash(receipt)}};
    };
    try{
      const consumers=await prepared("consumers"),worker=await prepared("worker",consumers);
      // The engine and journal bound the same hash of each exact review before publication.
      // fixture engine defaults hash compact JSON, so publish compact review bytes for the code pin.
      for(const f of [consumers,worker]){const compact=JSON.stringify(f.review);writeFileSync(f.reviewPath,compact,{mode:0o600});f.reviewSha256=hash(compact);}
      const moduleSource = fixtureStateRoot(webFixtureSource(readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8"), {
        QUANTITY_V4_RELEASE_SHA: JSON.stringify(worker.review.to),
        QUANTITY_V4_PROTECTION: JSON.stringify({normalProjectionSha256:hash(QUANTITY_V4_NORMAL_DATA_SQL),postimageRegistrySha256:sha("0")}),
        QUANTITY_V4_CONSUMERS_REVIEW_PIN: `Object.freeze(${JSON.stringify({path:consumers.reviewPath,sha256:consumers.reviewSha256})})`,
        QUANTITY_V4_WORKER_REVIEW_PIN: `Object.freeze(${JSON.stringify({path:worker.reviewPath,sha256:worker.reviewSha256})})`,
        QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: `Object.freeze(${JSON.stringify({path:join(directory,"original-worker-review.json"),sha256:sha("1")})})`,
        QUANTITY_V4_WORKER_OPERATION_ROOT: JSON.stringify(join(directory,"worker-operations")),
      }), stateRoot);
      const modulePath=join(directory,"bound-review-copy.mjs");writeFileSync(modulePath,moduleSource,{mode:0o600});
      const loader=await import(pathToFileURL(modulePath).href);
      expect(loader.loadQuantityV4DatabaseReceipt(process.cwd(),"consumers").pointer).toEqual(consumers.pointer);
      const loaded=loader.loadQuantityV4DatabaseReceipt(process.cwd(),"worker");expect(loaded.pointer).toEqual(worker.pointer);
      expect(loaded.record).toMatchObject({status:"committed",rowsPreservedInTransaction:true,normalDataSha256:sha("4"),preservedRowsSha256:sha("3")});
      // Execute the original C04 boundary with transport injected and no personal successor.
      const databaseSource=readFileSync(join(process.cwd(),"scripts/lib/prelaunch-database.mjs"),"utf8");
      const boundarySource=databaseSource.slice(databaseSource.indexOf("export async function observeQuantityV4WorkerBoundary("),databaseSource.indexOf("export async function createProtectedPrelaunchDatabase("));
      const open=vi.fn(async()=>worker.adapter);
      const boundary=new Function("loadCookedWeightAttestationSuccessor","loadQuantityV4DatabaseReceipt","loadQuantityV4ReaderWriterReceipts","openProtectedPrelaunchTarget","digest","same","isDeepStrictEqual","SHA","protectedImmutableSha256","path",
        boundarySource.replace("export async function","async function")+";return observeQuantityV4WorkerBoundary;")(
          ()=>null,loader.loadQuantityV4DatabaseReceipt,()=>{throw new Error("ON authority not exercised in OFF fixture");},open,hash,
          (a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),isDeepStrictEqual,/^[a-f0-9]{64}$/u,deploy.protectedImmutableSha256,await import("node:path"));
      const reordered = structuredClone(worker.getCurrent());
      reordered.scope = { aliasSha256: reordered.scope.aliasSha256, outerSha256: reordered.scope.outerSha256 }; worker.setCurrent(reordered);
      const connected=await boundary({repositoryRoot:process.cwd(),stage:"worker"});
      expect(connected.authority.pointer).toEqual(worker.pointer);expect(connected.observation.normalDataSha256).toBe(sha("9"));
      expect(open).toHaveBeenCalledTimes(1);
      for (const scope of [{ outerSha256: reordered.scope.outerSha256 }, { ...reordered.scope, extra: "unreviewed" },
        { ...reordered.scope, aliasSha256: sha("e") }]) {
        // Simulate malformed transport data, outside the typed observation contract.
        worker.setCurrent({ ...structuredClone(reordered), scope: scope as unknown as typeof reordered.scope });
        await expect(boundary({ repositoryRoot: process.cwd(), stage: "worker" })).rejects.toThrow("DB authority/target/catalog/scope/OFF/data differs");
      }
      worker.setCurrent(reordered);
      const observed=structuredClone(worker.getCurrent());observed.catalogSha256=sha("f");worker.setCurrent(observed);
      await expect(boundary({repositoryRoot:process.cwd(),stage:"worker"})).rejects.toThrow("DB authority/target/catalog/scope/OFF/data differs");
      observed.catalogSha256=worker.review.database.afterCatalogSha256;worker.setCurrent(observed);

      const wrongLocator={...JSON.parse(worker.receipt.toString()),journalFile:"foreign.json"};
      for(const path of [worker.paths.databaseGuardPath,worker.receiptPath])writeFileSync(path,bytes(wrongLocator),{mode:0o600});
      expect(()=>loader.loadQuantityV4DatabaseReceipt(process.cwd(),"worker")).toThrow("locator differs");
      for(const path of [worker.paths.databaseGuardPath,worker.receiptPath])writeFileSync(path,worker.receipt,{mode:0o600});
      const invalid=JSON.parse(worker.receipt.toString());invalid.rowsPreservedInTransaction=false;
      for(const path of [worker.paths.databaseGuardPath,worker.receiptPath])writeFileSync(path,bytes(invalid),{mode:0o600});
      expect(()=>loader.loadQuantityV4DatabaseReceipt(process.cwd(),"worker")).toThrow("terminal authority/source/stage/OFF/data differs");
      for(const path of [worker.paths.databaseGuardPath,worker.receiptPath])writeFileSync(path,worker.receipt,{mode:0o600});
      expect(loader.loadQuantityV4DatabaseReceipt(process.cwd(),"worker").pointer).toEqual(worker.pointer);
      const unknown={...JSON.parse(worker.receipt.toString()),status:"unknown"};writeFileSync(worker.paths.databaseGuardPath,bytes(unknown),{mode:0o600});
      expect(()=>loader.loadQuantityV4DatabaseReceipt(process.cwd(),"worker")).toThrow();
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
});


describe("C04 read-only before reconciliation keeps admission separate", () => {
  it("classifies a confirmed rollback after ordinary activity without retargeting its original checkpoint", async () => {
    const f=engineFixture("worker"),query=f.session.query.getMockImplementation()!;
    f.session.query.mockImplementation(async sql=>{if(sql===f.plan.pending[0].payload)throw new Error("owned precommit SQL failure");return query(sql);});
    await expect(f.engine.apply()).rejects.toThrow("precommit SQL failure");
    expect(f.getAttempt()).toMatchObject({journalFile:"attempt.json",status:"rolled_back_before_commit",commitDispatched:false,rowsPreservedInTransaction:false});
    const originalCheckpoint=structuredClone(f.checkpoint),current=structuredClone(f.getCurrent());current.normalDataSha256=sha("9");current.preservedRowsSha256=sha("8");f.setCurrent(current);
    expect(classifyProtectedPrelaunchOutcome(f.review,current,{workerCheckpoint:f.checkpoint,ddlOnly:true})).toBe("unknown");
    expect(await f.engine.reconcile()).toMatchObject({status:"not_applied",journalFile:"attempt.json",automaticRetryAllowed:false});
    expect(f.checkpoint).toEqual(originalCheckpoint);expect(f.getCurrent().normalDataSha256).toBe(sha("9"));
    expect(f.payloadRoles).toHaveLength(0);expect(f.adapter.backup).toHaveBeenCalledTimes(1);expect(f.calls).not.toContain("COMMIT;");
    await expect(f.engine.apply()).rejects.toThrow("automatic retry");
    expect(()=>assertProtectedPrelaunchObservation(f.review,current,"before",{workerCheckpoint:f.checkpoint,ddlOnly:true})).toThrow();
  });
  it("rejects mixed rollback/intent and changed metadata/source/control/inactive evidence", async () => {
    const f=engineFixture("worker"),query=f.session.query.getMockImplementation()!;
    f.session.query.mockImplementation(async sql=>{if(sql===f.plan.pending[0].payload)throw new Error("owned failure");return query(sql);});
    await expect(f.engine.apply()).rejects.toThrow("owned failure");
    const attempt=structuredClone(f.getAttempt()),current=structuredClone(f.getCurrent());current.normalDataSha256=sha("9");current.preservedRowsSha256=sha("8");f.setCurrent(current);
    for(const update of [{commitDispatched:true},{rowsPreservedInTransaction:undefined},{status:"unknown",commitDispatched:true,rowsPreservedInTransaction:false}, {journalFile:"foreign.json"}]){
      f.journal.read.mockResolvedValue({...attempt,...update});await expect(f.engine.reconcile()).rejects.toThrow();
    }
    f.journal.read.mockImplementation(async()=>f.getAttempt());
    for(const update of [{metadataNull:false},{active:true},{catalogSha256:sha("0")},{productWriterEnabled:false},{normalColumnsSha256:sha("0")}]){
      f.setCurrent({...current,...update});await expect(f.engine.reconcile()).rejects.toThrow("remains unknown");
    }
    f.setCurrent({...current,worker:{...current.worker,queued:1}});await expect(f.engine.reconcile()).rejects.toThrow("remains unknown");
    expect(f.adapter.reloadSchema).not.toHaveBeenCalled();expect(f.getAttempt()?.status).toBe("rolled_back_before_commit");
  });
});

describe("C04 normal projection read session", () => {
  it.each(["outside", "locked", "timeout"])("keeps the fixed read budget and session boundary (%s)", async mode => {
    const directory = realpathSync(mkdtempSync(join(realpathSync("/tmp"), "c04-normal-read-")));
    try {
      const protection = { normalProjectionSha256: hash(QUANTITY_V4_NORMAL_DATA_SQL), postimageRegistrySha256: sha("e") };
      const webPath = join(directory, "web.mjs"), databasePath = join(directory, "database.mjs");
      writeFileSync(webPath, fixtureStateRoot(webFixtureSource(readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8"), {
        QUANTITY_V4_PROTECTION: `Object.freeze(${JSON.stringify(protection)})`,
      }), join(directory, "state")), { mode: 0o600 });
      writeFileSync(databasePath, databaseFixtureSource(readFileSync("scripts/lib/prelaunch-database.mjs", "utf8"), webPath), { mode: 0o600 });
      const database = await import(pathToFileURL(databasePath).href), f = fixture();
      Object.assign(f.review.database, protection);
      const fixedMetadata = QUANTITY_V4_COLUMN_METADATA as readonly (readonly [string, [string, string, boolean, string | null][]])[];
      const columns = fixedMetadata.map(([table, values]) => ({
        table, columns: values.map(([name, type, not_null, value]) => ({ name, type, not_null, default: value })),
      }));
      const observeQuery = vi.fn(async (sql: string) => {
        if (sql === database.QUANTITY_V4_NORMAL_DATA_SQL) {
          if (mode !== "locked") throw new Error("normal projection must not use generic 5s reads");
          return f.observation.normalDataSha256;
        }
        if (sql === database.QUANTITY_V4_COLUMNS_SQL) return JSON.stringify(columns);
        if (sql === database.COOKED_WEIGHT_SCOPE_SQL) return JSON.stringify(f.observation.scope);
        if (sql === database.QUANTITY_V4_WORKER_STATE_SQL) return JSON.stringify(f.observation.worker);
        if (sql.includes("SELECT filename,sha256 FROM homecook_deploy.migrations")) return JSON.stringify(f.review.database.before);
        if (sql.includes("to_regclass(") || sql.includes("has_table_privilege(")) return "t";
        if (sql.includes("pg_stat_activity")) return "f";
        if (sql.endsWith("FROM private.quantity_input_v4_policy;")) return "false";
        if (sql.endsWith("FROM private.recipe_product_only_write_control;") || sql.endsWith("FROM private.cooked_batch_weight_evidence_control;")) return "true";
        return sha("d");
      });
      const session = {
        query: vi.fn(async (sql: string, timeout: number) => {
          expect(timeout).toBe(sql === database.QUANTITY_V4_NORMAL_DATA_SQL ? 33000 : 5000);
          if (sql !== database.QUANTITY_V4_NORMAL_DATA_SQL) return "";
          if (mode === "timeout") throw new Error("owned normal read timeout");
          return f.observation.normalDataSha256;
        }), close: vi.fn(async () => {}), stop: vi.fn(),
      };
      const base = { inspect: vi.fn(async () => f.observation.target), query: observeQuery, session: vi.fn(() => session) };
      const adapter = database.createProtectedPrelaunchAdapter(base, deploy.QUANTITY_V4_FEATURE, f.review);
      if (mode === "timeout") {
        await expect(adapter.observe(undefined, "owned-normal-read")).rejects.toThrow("owned normal read timeout");
        expect(session.query.mock.calls.map(([sql]) => sql)).toEqual([
          "BEGIN READ ONLY; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';", database.QUANTITY_V4_NORMAL_DATA_SQL,
        ]);
        expect(session.close).not.toHaveBeenCalled(); expect(session.stop).toHaveBeenCalledOnce();
      } else {
        await expect(adapter.observe(mode === "locked" ? observeQuery : undefined, "owned-normal-read"))
          .resolves.toMatchObject({ normalDataSha256: f.observation.normalDataSha256 });
        if (mode === "locked") {
          expect(base.session).not.toHaveBeenCalled();
          expect(observeQuery.mock.calls.filter(([sql]) => sql === database.QUANTITY_V4_NORMAL_DATA_SQL)).toHaveLength(1);
          expect(observeQuery.mock.calls.some(([sql]) => /BEGIN|SET LOCAL|COMMIT/u.test(sql))).toBe(false);
        } else {
          expect(base.session).toHaveBeenCalledExactlyOnceWith("protected-c04-normal-data");
          expect(session.query.mock.calls).toEqual([
            ["BEGIN READ ONLY; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';", 5000],
            [database.QUANTITY_V4_NORMAL_DATA_SQL, 33000], ["COMMIT;", 5000],
          ]);
          expect(session.close).toHaveBeenCalledOnce(); expect(session.stop).toHaveBeenCalledOnce();
        }
      }
      expect(base.inspect).toHaveBeenCalledOnce();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
