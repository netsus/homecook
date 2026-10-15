import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sha = (c: string) => c.repeat(64), ref = (c: string) => c.repeat(40);
const temp = mkdtempSync(join(realpathSync("/tmp"), "attestation-successor-owned-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const raw = readFileSync("supabase/migrations/20261014224500_cooked_weight_user_attestation.sql");
const payload = raw.toString("utf8").replace(/^begin;\n/u, "").replace(/\ncommit;\n$/u, "");
let source = readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8");
// Neutralize every web authority in the disposable copy before import. No live HOME/ROOT lookup.
source = source.replace(/^export const ([A-Z0-9_]+_PIN) = [\s\S]*?;(?=\r?\n)/gmu,
  (_text, name: string) => `export const ${name} = Object.freeze({ path: null, sha256: null });`);
for (const [name, value] of Object.entries({
  QUANTITY_V4_RELEASE_SHA: JSON.stringify(ref("b")), QUANTITY_V4_WORKER_OPERATION_ROOT: JSON.stringify(join(temp, "worker")),
  QUANTITY_V4_WORKER_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("2")}" })`,
  QUANTITY_V4_WRITER_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("3")}" })`,
  QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("d")}" })`,
  COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256: JSON.stringify(hash(raw)),
  NUTRITION_VALIDATOR_MIGRATION_SHA256: JSON.stringify(sha("9")),
  NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("8")}" })`,
  COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN: `Object.freeze({ path: null, sha256: "${sha("4")}" })`,
})) {
  const declaration = new RegExp(`^export const ${name} = [^\\r\\n]*;$`, "gmu");
  if ([...source.matchAll(declaration)].length !== 1) throw new Error(`Fixture declaration changed: ${name}`);
  source = source.replace(declaration, () => `export const ${name} = ${value};`);
}
source = source.replace('function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }',
  () => `function prelaunchStateRoot() { return ${JSON.stringify(join(temp, "state"))}; }`);
// Only the fixed DB-authority I/O is injected; the worker receipt parser below is unchanged.
const loaderStart = source.indexOf("export function loadNutritionValidatorMaintenance(repositoryRoot) {");
const loaderEnd = source.indexOf("export function assertCookedWeightAttestationReview", loaderStart);
if (loaderStart < 0 || loaderEnd <= loaderStart) throw new Error("Maintenance loader boundary changed");
source = source.slice(0, loaderStart) + `let ownedMaintenance = null;
export function setOwnedMaintenance(value) { ownedMaintenance = value; }
export function loadNutritionValidatorMaintenance() { return ownedMaintenance; }

` + source.slice(loaderEnd);
const webPath = join(temp, "web.mjs"); writeFileSync(webPath, source, { mode: 0o600 });
const dbPath = join(temp, "database.mjs");
const databaseSource = readFileSync("scripts/lib/prelaunch-database.mjs", "utf8").replace(/from "(\.\/[^"\n]+)"/gu,
  (_text, relative: string) => `from "${pathToFileURL(relative === "./prelaunch-web-deploy.mjs" ? webPath : join(process.cwd(), "scripts/lib", relative)).href}"`);
writeFileSync(dbPath, databaseSource.replace('import("./full-local-security-inventory.mjs")',
  () => `import(${JSON.stringify(pathToFileURL(join(process.cwd(), "scripts/lib/full-local-security-inventory.mjs")).href)})`)
  .replace('new URL("../../docs/security/cooked-weight-user-attestation-source-function-postimages.json", import.meta.url)',
    () => `new URL(${JSON.stringify(pathToFileURL(join(process.cwd(), "docs/security/cooked-weight-user-attestation-source-function-postimages.json")).href)})`), { mode: 0o600 });
const web: typeof import("../scripts/lib/prelaunch-web-deploy.mjs") & { setOwnedMaintenance(value: object | null): void } = await import(pathToFileURL(webPath).href);
const db: typeof import("../scripts/lib/prelaunch-database.mjs") = await import(pathToFileURL(dbPath).href);
const pointer = (name: string, key: string) => ({ path: join(temp, name), sha256: sha(key) });
const operationId = "12345678-1234-4123-8123-123456789abc";
function fixture() {
  const old = Array.from({ length: 219 }, (_, i) => ({ filename: `${20250000000000 + i}_owned.sql`, sha256: sha("0") }));
  const before = [...old, { filename: "20261013190000_recipe_product_only_identity.sql", sha256: "0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75" },
    { filename: web.COOKED_WEIGHT_MIGRATION, sha256: "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0" },
    ...web.QUANTITY_V4_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 }))];
  const migration = { filename: web.COOKED_WEIGHT_ATTESTATION_MIGRATION, sha256: hash(raw), bytes: raw };
  const target = { fixture: true, postgresContainerId: "owned-only" };
  const worker = { credentialGeneration: 48, credentialRowSha256: sha("1"), policyRowSha256: sha("2"), policyStableSha256: sha("3"),
    schemaIdentity: web.QUANTITY_V4_WORKER_SCHEMA_IDENTITY, snapshotDigest: sha("4"), workerPolicyEnabled: true, workerReleaseSha: ref("b") };
  const review = { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE,
    from: ref("a"), to: ref("c"), files: { [`supabase/migrations/${migration.filename}`]: [null, migration.sha256] },
    predecessorBuildId: "owned-e00d", predecessorPlistSha256: sha("1"), closedArtifactSha256: sha("2"), closedReviewSha256: web.CLOSED_R2_REVIEW_PIN.sha256,
    controlSha256: sha("3"), consentGeneration: 1, historicalProofsSha256: sha("4"), testScript: "test:feedback-batch:web",
    approved: { database: true, reader: true, writerOn: false }, allNewShapesOff: true, legacyReaderCompatible: true,
    isolatedEvidenceSha256: sha("5"), readerFlowsSha256: sha("6"), isolatedEvidence: pointer("isolated", "5"), readerFlows: pointer("flows", "6"),
    platformInventory: pointer("platform", "7"), backupReadiness: pointer("backup", "8"), readerEnvironment: {},
    predecessorQuantity: { reviewSha256: sha("2"), writerApprovalSha256: sha("3"), readerFloor: ref("b"), databaseReceipt: pointer("db2", "9"),
      readerReceipt: pointer("reader", "a"), writerReceipt: pointer("writer", "b"), activationEvidence: pointer("activation", "c") },
    database: { before, after: [...structuredClone(before), { filename: migration.filename, sha256: migration.sha256 }], configPath: join(temp, "config"), configSha256: sha("0"),
      targetSha256: hash(JSON.stringify(target)), beforeCatalogSha256: sha("1"), afterCatalogSha256: sha("2"), immutableSha256: sha("3"), afterImmutableSha256: sha("4"),
      attestationPostimageRegistrySha256: hash(readFileSync("docs/security/cooked-weight-user-attestation-source-function-postimages.json")), normalProjectionSha256: web.QUANTITY_V4_PROTECTION.normalProjectionSha256, postimageRegistrySha256: web.QUANTITY_V4_PROTECTION.postimageRegistrySha256,
      beforeColumnsSha256: db.QUANTITY_V4_COLUMNS_AFTER_SHA256, afterColumnsSha256: db.QUANTITY_V4_COLUMNS_AFTER_SHA256,
      beforeScope: { outerSha256: sha("5"), aliasSha256: sha("6") }, afterScope: { outerSha256: sha("7"), aliasSha256: sha("6") },
      attestationScope: { beforeOuterSha256: sha("5"), afterOuterSha256: sha("7"), afterAliasSha256: sha("5") },
      workerCatalogBefore: web.QUANTITY_V4_WORKER_CATALOG_AFTER, workerCatalogAfter: web.QUANTITY_V4_WORKER_CATALOG_AFTER, workerBaseline: worker,
      migrations: [{ filename: migration.filename, rawSha256: migration.sha256, payloadSha256: hash(payload) }] } };
  const beforeObservation = { target, ledger: before, catalogSha256: review.database.beforeCatalogSha256, immutableSha256: review.database.immutableSha256,
    preservedRowsSha256: sha("8"), normalDataSha256: sha("9"), active: false, ledgerAuthority: true, productWriterEnabled: true, cookedWeightWriterEnabled: true,
    quantityWriterEnabled: true, writerEnabled: false, attestationWriterEnabled: false, attestationRowsSha256: null as string | null,
    attestationRowsEmpty: true, attestationTablesPresent: false, attestationScope: { outerSha256: sha("5"), aliasSha256: null as string | null },
    scope: review.database.beforeScope, normalColumnsSha256: db.QUANTITY_V4_COLUMNS_AFTER_SHA256,
    attestationPostimageRegistrySha256: review.database.attestationPostimageRegistrySha256, normalProjectionSha256: review.database.normalProjectionSha256, postimageRegistrySha256: review.database.postimageRegistrySha256,
    worker: { ...worker, catalogFingerprint: web.QUANTITY_V4_WORKER_CATALOG_AFTER, credentialActive: true, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 } };
  const afterObservation = { ...beforeObservation, ledger: review.database.after, catalogSha256: review.database.afterCatalogSha256,
    immutableSha256: review.database.afterImmutableSha256, scope: review.database.afterScope, attestationTablesPresent: true,
    attestationRowsSha256: sha("a"), attestationScope: { outerSha256: sha("7"), aliasSha256: sha("5") } };
  return { review, target, migration, beforeObservation, afterObservation };
}
function engineFixture(commitAckLost = false) {
  const f = fixture(), calls: string[] = [];
  let current = structuredClone(f.beforeObservation), staged = structuredClone(current), attempt: Record<string, unknown> | null = null, actor = "supabase_admin";
  const session = { postgresContext: { searchPath: '"$user", public, extensions', timeZone: "UTC" }, query: vi.fn(async (sql: string) => {
    calls.push(sql); const role = /SET LOCAL ROLE (postgres|supabase_admin);/u.exec(sql)?.[1]; if (role) actor = role;
    if (sql === "RESET ROLE;") actor = "supabase_admin";
    if (sql === "SELECT session_user;") return "supabase_admin";
    if (sql === "SELECT current_user;") return actor;
    if (sql === "SELECT pg_export_snapshot();") return "00000003-00000004-1";
    if (sql.includes("INSERT INTO homecook_deploy.migrations")) staged = structuredClone(f.afterObservation);
    if (sql === "COMMIT;") { current = structuredClone(staged); if (commitAckLost) throw new Error("owned commit acknowledgement lost"); }
    if (sql === "ROLLBACK;") staged = structuredClone(current);
    return "";
  }), close: vi.fn(async () => {}), stop: vi.fn() };
  const adapter = { observe: vi.fn(async (query?: unknown) => structuredClone(query ? staged : current)), migrationSession: vi.fn(() => session),
    backup: vi.fn(async ({ snapshot }: { snapshot: string }) => ({ snapshot, target: f.target, fullArchiveDecoded: true, sha256: sha("b"), rolesSha256: sha("c") })),
    reloadSchema: vi.fn(async () => {}) };
  const journal = { read: vi.fn(async () => attempt), write: vi.fn(async (value: Record<string, unknown>) => { attempt = structuredClone(value); }) };
  const engine = db.createProtectedPrelaunchDatabaseEngine({ review: f.review, reviewSha256: sha("4"), operationId,
    readMigrations: async () => [...f.review.database.before, f.migration], adapter, journal, assertBoundary: vi.fn(async () => {}) });
  return { ...f, calls, session, adapter, journal, engine };
}

function writerFixture(action: "writer-on" | "writer-off", injectFact = false, withQuantityOff = false, on229 = false) {
  const f = fixture(), calls: string[] = [];
  let current = { ...structuredClone(f.afterObservation), quantityWriterEnabled: !withQuantityOff,
    writerEnabled: action === "writer-off", attestationWriterEnabled: action === "writer-off" };
  const maintenance = on229 ? maintenanceFixture(publicationFixture()) : undefined;
  if (maintenance) Object.assign(current, {ledger:maintenance.review.database.after,catalogSha256:maintenance.review.database.afterCatalogSha256,
    stableImmutableSha256:maintenance.review.database.stableImmutableSha256,nutritionValidator:maintenance.review.database.functionAfter,
    attestationRowsEmpty:false,metadataNull:false});
  let staged = structuredClone(current), actor = "supabase_admin", attempt: Record<string, unknown> | null = null;
  const session = { postgresContext: { searchPath: '"$user", public, extensions', timeZone: "UTC" }, query: vi.fn(async (sql: string) => {
    calls.push(sql); const role = /SET LOCAL ROLE (postgres|supabase_admin);/u.exec(sql)?.[1]; if (role) actor = role;
    if (sql === "RESET ROLE;") actor = "supabase_admin";
    if (sql === "SELECT session_user;") return "supabase_admin";
    if (sql === "SELECT current_user;") return actor;
    if (sql.startsWith("UPDATE private.cooked_weight_user_attestation_control")) {
      staged.writerEnabled = sql.includes("SET enabled=true"); staged.attestationWriterEnabled = staged.writerEnabled;
      if (injectFact) staged.attestationRowsSha256 = sha("f");
    }
    if (sql === "COMMIT;") current = structuredClone(staged);
    if (sql === "ROLLBACK;") staged = structuredClone(current);
    return "";
  }), close: vi.fn(async () => {}), stop: vi.fn() };
  const adapter = { observe: vi.fn(async (query?: unknown) => structuredClone(query ? staged : current)), migrationSession: vi.fn(() => session) };
  const journal = { read: vi.fn(async () => attempt), write: vi.fn(async (value: Record<string, unknown>) => { attempt = structuredClone(value); }) };
  const reader = { schema: "homecook.prelaunch-protected-reader.v1", reviewSha256: sha("4"), releaseSha: f.review.to,
    readerFloor: f.review.to, databasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })), backwardCompatible: false, verifiedFlowsSha256: f.review.readerFlowsSha256 };
  const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: sha("4"), releaseSha: f.review.to,
    writerOn: true, safeOff: true, databasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })),
    readerFlowsSha256: f.review.readerFlowsSha256, readerReceiptSha256: null };
  const quantityOffReceipt = withQuantityOff ? { schema: "homecook.prelaunch-protected-writer-attempt.v1", feature: web.QUANTITY_V4_FEATURE,
    status: "committed", action: "writer-off", writerEnabled: false, reviewSha256: f.review.predecessorQuantity.reviewSha256,
    approvalSha256: f.review.predecessorQuantity.writerApprovalSha256, readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256,
    baselineReviewSha256: sha("4"), baselineDatabasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })) } : null;
  const engine = db.createProtectedPrelaunchWriter({ review: f.review, databaseMaintenance: maintenance, reviewSha256: sha("4"), approval, approvalSha256: sha("5"),
    readerReceipt: reader, readerReceiptSha256: sha("6"), operationId, action, adapter, journal, quantityOffReceipt, assertBoundary: vi.fn(async () => {}) });
  return { ...f, engine, calls, session, journal, quantityOffReceipt, maintenance, current: () => current };
}

function personalWriterPlan(phase: string, observation: object, blockOverride?: string) {
  const cli = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8").split("async function runProtectedWriterPhase(")[1];
  const block = blockOverride ?? cli.slice(cli.indexOf('  if (action === "plan") {'), cli.indexOf("  const guardPath ="));
  const f = fixture(), adapter = { observe: vi.fn(async () => observation) }, say = vi.fn();
  const writerAction = phase.includes("off") ? "writer-off" : "writer-on";
  const quantityOffReceipt = { schema: "homecook.prelaunch-protected-writer-attempt.v1", feature: web.QUANTITY_V4_FEATURE,
    status: "committed", action: "writer-off", writerEnabled: false, reviewSha256: f.review.predecessorQuantity.reviewSha256,
    approvalSha256: f.review.predecessorQuantity.writerApprovalSha256, readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256,
    baselineReviewSha256: sha("4"), baselineDatabasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })) };
  const run = new Function("adapter", "review", "writerAction", "phase", "quantityOffReceipt", "assertProtectedPrelaunchObservation", "protectedRolloutPins", "say", "COOKED_WEIGHT_ATTESTATION_FEATURE", "DeploymentError", `
    return (async () => {
      const action="plan", options={protectedPhase:phase}, reader={readerFloor:review.to}, baselineReview=review;
      const quantityCloseOnAttestation=false, productCloseOnWeightBaseline=false, quantityOff=false;
      const workerCheckpoint=undefined, successor=undefined, workerContinuation=null, databaseMaintenance=undefined;
      const cookedWeightProductOffReceipt=()=>null;
      ${block}
    })();`);
  return { promise: run(adapter, f.review, writerAction, phase, quantityOffReceipt, db.assertProtectedPrelaunchObservation,
    web.protectedRolloutPins, say, web.COOKED_WEIGHT_ATTESTATION_FEATURE, web.DeploymentError), adapter, say };
}

function publicationFixture() {
  const f = fixture(), directory = join(temp, "worker", operationId); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const record = { schema: "homecook.prelaunch-protected-db-attempt.v1", feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE, status: "committed", reviewSha256: sha("4"),
    from: f.review.from, to: f.review.to, targetSha256: f.review.database.targetSha256,
    databasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })), catalogSha256: f.review.database.afterCatalogSha256,
    immutableSha256: f.review.database.afterImmutableSha256, writerEnabled: false, readerReady: false, backwardCompatible: false,
    productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true, attestationRowsEmpty: true, rowsPreservedInTransaction: true,
    normalDataSha256: sha("9"), preservedRowsSha256: sha("8"), predecessorQuantity: f.review.predecessorQuantity,
    backup: { fullArchiveDecoded: true, sha256: sha("b"), rolesSha256: sha("c"), target: f.target } };
  const terminal = { path: join(temp, "synthetic-personal-terminal.json"), sha256: hash(JSON.stringify(record)) };
  const save = <T extends object>(path: string, value: T) => {
    const bytes = JSON.stringify(value); writeFileSync(path, bytes, { mode: 0o600 }); return { record: value, pointer: { path, sha256: hash(bytes) } };
  };
  const original = { to: ref("b"), database: { targetSha256: f.review.database.targetSha256 }, workerAuthority: { controlReviewSha256: sha("d"), operationId } };
  const header = { schema: "homecook.youtube-c04-controlled-cutover-journal.v1", reviewSha256: sha("d"), operationId, operationDirectory: directory,
    releaseSha: ref("b"), targetSha256: f.review.database.targetSha256, workerDatabaseReceiptSha256: f.review.predecessorQuantity.databaseReceipt.sha256 };
  const historicalPostRecord = { schema: "homecook.prelaunch-quantity-worker-after.v1", status: "committed", feature: web.QUANTITY_V4_FEATURE,
    releaseSha: ref("b"), targetSha256: f.review.database.targetSha256, consumersReceiptSha256: sha("e"), workerReviewSha256: sha("d"), workerOperationId: operationId,
    workerDatabaseReceiptSha256: header.workerDatabaseReceiptSha256, ledgerCount: 227, catalogFingerprint: web.QUANTITY_V4_WORKER_CATALOG_AFTER,
    normalDataSha256: sha("9"), quantityPolicyEnabled: false, productWriterEnabled: true, weightWriterEnabled: true, workerPolicyEnabled: false,
    queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0, credentialGeneration: 48, workerReleaseSha: ref("b"),
    schemaIdentity: f.review.database.workerBaseline.schemaIdentity, snapshotDigest: f.review.database.workerBaseline.snapshotDigest,
    credentialRowSha256: sha("1"), policyRowSha256: sha("8"), artifactSha256: sha("a"), descriptorSha256: sha("b"), credentialMetadataSha256: sha("c"),
    plistSha256: sha("d"), serviceState: "running", pid: 100, zeroActualAI: true };
  const post = save(join(directory, "post-worker-terminal.json"), historicalPostRecord);
  const origin = save(join(directory, "post-worker-origin.json"), { ...header, state: "verified-policy-disabled", postWorkerTerminal: post.pointer, policyStableSha256: sha("3") });
  const observation = { targetSha256: f.review.database.targetSha256, ledgerCount: 227, catalogFingerprint: web.QUANTITY_V4_WORKER_CATALOG_AFTER,
    credentialGeneration: 48, workerReleaseSha: ref("b"), credentialRowSha256: sha("1"), schemaIdentity: f.review.database.workerBaseline.schemaIdentity,
    snapshotDigest: f.review.database.workerBaseline.snapshotDigest, policyStableSha256: sha("3"), policyRowSha256: sha("2"), policy: { enabled: true, model: "same-model" },
    productWriterEnabled: true, weightWriterEnabled: true, quantityPolicyEnabled: true, workerPolicyEnabled: true,
    queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 };
  const verification = save(join(directory, "activation-verification.json"), { ...header, schema: "homecook.youtube-c04-activation-verification.v1", post: historicalPostRecord,
    observation: { ...observation, workerPolicyEnabled: false, policyRowSha256: sha("8"), policy: { enabled: false, model: "same-model" } } });
  const activation = save(join(directory, "activation-receipt.json"), { ...header, schema: "homecook.youtube-c04-activation-receipt.v1", status: "committed",
    activationVerification: verification.pointer, observation, database: observation });
  const historical = { post: { ...post, origin }, verification, activation, authority: {
    database: { review: original, pointer: f.review.predecessorQuantity.databaseReceipt },
    reader: { pointer: f.review.predecessorQuantity.readerReceipt }, writer: { pointer: f.review.predecessorQuantity.writerReceipt } } };
  const successor = { review: f.review, record, pointer: terminal, guardPointer: terminal, predecessor: historical };
  const current = { ...header, state: "activation-committed", postWorkerTerminal: post.pointer, postWorkerOrigin: origin.pointer,
    activationVerification: verification.pointer, activationReceipt: activation.pointer };
  const currentPath = join(directory, "cutover-journal.json"); save(currentPath, current);
  return { ...f, directory, record, successor, current, currentPath, save, observation, post, origin, verification, activation };
}

function maintenanceFixture(f: ReturnType<typeof publicationFixture>) {
  const review = { ...f.review, feature: web.NUTRITION_VALIDATOR_FEATURE, to: ref("e"), sourceReaderRef: f.review.from, migrationSourceRef: ref("e"),
    readerValidatorSha256: sha("1"), readerPrecedesDatabase: true, approved: { database: true, reader: false, writerOn: false },
    files: { [`supabase/migrations/${web.NUTRITION_VALIDATOR_MIGRATION}`]: [null, sha("9")] },
    predecessorAttestation: { reviewSha256: sha("4"), databaseReceipt: f.successor.pointer, readerReceipt: pointer("personal-reader", "5"),
      writerReceipt: pointer("personal-writer", "6"), readerFloor: f.review.to },
    database: { ...f.review.database, before: f.review.database.after, after: [...f.review.database.after, {filename: web.NUTRITION_VALIDATOR_MIGRATION, sha256: sha("9")}],
      migrations: [{filename: web.NUTRITION_VALIDATOR_MIGRATION, rawSha256: sha("9"), payloadSha256: sha("9")}],
      beforeCatalogSha256: f.review.database.afterCatalogSha256, afterCatalogSha256: sha("f"), immutableSha256: f.review.database.afterImmutableSha256,
      stableImmutableSha256: sha("1"), beforeScope: f.review.database.afterScope,
      attestationScope: {...f.review.database.attestationScope, beforeOuterSha256: f.review.database.attestationScope.afterOuterSha256},
      functionSignature: "public.validate_recipe_nutrition_snapshot_payload(jsonb)",
      functionBefore: {definitionSha256: sha("a"), sourceMd5: "b".repeat(32), metadataSha256: sha("c")},
      functionAfter: {definitionSha256: sha("d"), sourceMd5: "e".repeat(32), metadataSha256: sha("c")} } };
  const record = {...f.record, feature: web.NUTRITION_VALIDATOR_FEATURE, reviewSha256: sha("8"), from: review.from, to: review.to,
    sourceReaderRef: review.from, readerFloor: review.from, databasePlanSha256: hash(JSON.stringify({source: review.database.after, applied: review.database.after})),
    catalogSha256: review.database.afterCatalogSha256, controlsPreservedInTransaction: true, attestationWriterEnabled: true, workerPolicyEnabled: true,
    attestationRowsSha256: sha("9"), predecessorAttestation: review.predecessorAttestation};
  const receipt = pointer("nutrition229.json", "1");
  return {review, record, pointer: receipt, guardPointer: receipt, predecessor: f.successor};
}

describe("exact private attestation227→228 successor, synthetic transports only", () => {
  it("rejects unbound authority before reading any private proof", () => {
    expect(() => web.loadProtectedRolloutReview(process.cwd(), { feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE })).toThrow("핀이 비어");
    expect(web.loadCookedWeightAttestationSuccessor(process.cwd())).toBeNull();
  });
  it("uses fixed existing CLI phases and denies unset profile pins before proof/config access", () => {
    for (const phase of ["attestation-database", "attestation-reconcile", "attestation-reader", "attestation-writer-on", "attestation-writer-off"]) {
      const options = web.parsePrelaunchOptions(["--reviewed-ref", ref("c"), "--reviewed-protected-rollout", "--protected-phase", phase,
        "--db-config", join(temp, "not-read-config"), "--test-script", "test:feedback-batch:web"]);
      expect(options.protectedPhase).toBe(phase);
      expect(() => web.loadProtectedRolloutReview(process.cwd(), { ref: options.ref, phase })).toThrow("핀이 비어");
    }
    expect(() => web.parsePrelaunchOptions(["--ledger-count", "228"])).toThrow();
    expect(() => web.parsePrelaunchOptions(["--reviewed-ref", ref("c"), "--reviewed-protected-rollout", "--protected-phase", "attestation-arbitrary",
      "--db-config", join(temp, "not-read-config"), "--test-script", "test:feedback-batch:web"])).toThrow();
  });
  it("validates one frozen source extension and never broadens legacy column ledger support", () => {
    const f = fixture(); expect(web.assertProtectedRolloutReview(f.review)).toBe(f.review);
    expect(() => db.assertQuantityV4Columns([], 228)).toThrow("ledger");
    expect(db.planProtectedPrelaunchMigrations(f.review, [...f.review.database.before, f.migration]).pending).toEqual([
      { filename: f.migration.filename, sha256: f.migration.sha256, payload, actor: "postgres" }]);
  });
  it.each(["prefix", "extra", "worker", "alias"])("rejects a foreign %s", kind => {
    const f = fixture(); if (kind === "prefix") f.review.database.before[0].sha256 = sha("f");
    if (kind === "extra") f.review.database.after.push({ filename: "20261014230000_unapproved.sql", sha256: sha("a") });
    if (kind === "worker") f.review.database.workerBaseline.credentialGeneration = 49;
    if (kind === "alias") f.review.database.attestationScope.afterAliasSha256 = sha("e");
    expect(() => web.assertProtectedRolloutReview(f.review)).toThrow();
  });
  it("applies only the owned synthetic payload and preserves C03/C01/C04/worker ON with personal OFF", async () => {
    const f = engineFixture(); const record = await f.engine.apply();
    expect(record).toMatchObject({ feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE, status: "committed", writerEnabled: false,
      productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true, attestationRowsEmpty: true, rowsPreservedInTransaction: true });
    expect(f.calls.filter(sql => sql === payload)).toHaveLength(1);
    expect(f.calls.some(sql => sql.startsWith("UPDATE private."))).toBe(false);
    expect(f.calls.find(sql => sql.startsWith("BEGIN"))).toContain("lock_timeout='5s'");
  });
  it("retains unknown commit evidence and reconciles the exact228 image without dispatching SQL twice", async () => {
    const f = engineFixture(true);
    await expect(f.engine.apply()).rejects.toThrow("acknowledgement lost");
    expect(await f.journal.read()).toMatchObject({ status: "unknown", commitDispatched: true, rowsPreservedInTransaction: true,
      feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE, predecessorQuantity: f.review.predecessorQuantity });
    await expect(f.engine.apply()).rejects.toThrow("automatic retry");
    const receipt = await f.engine.reconcile();
    expect(receipt).toMatchObject({ status: "committed", feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE, writerEnabled: false });
    expect(f.calls.filter(sql => sql === payload)).toHaveLength(1);
  });
  it.each(["writer-on", "writer-off"] as const)("locks and mutates only the personal control for %s", async action => {
    const f = writerFixture(action), result = await f.engine.apply();
    expect(result).toMatchObject({ status: "committed", writerEnabled: action === "writer-on", feature: web.COOKED_WEIGHT_ATTESTATION_FEATURE });
    const updates = f.calls.filter(sql => sql.startsWith("UPDATE private."));
    expect(updates).toHaveLength(1); expect(updates[0]).toContain("UPDATE private.cooked_weight_user_attestation_control");
    expect(f.calls.find(sql => sql.startsWith("BEGIN"))).toContain("private.cooked_weight_user_attestation_control WHERE singleton FOR UPDATE");
    expect(f.calls.find(sql => sql.startsWith("BEGIN"))).toContain("private.quantity_input_v4_policy WHERE singleton FOR SHARE");
    expect(f.current().quantityWriterEnabled).toBe(true); expect(f.current().worker.policyRowSha256).toBe(f.afterObservation.worker.policyRowSha256);
  });
  it("permits the existing expiry-only OFF plan while rejecting ON before mutation", async () => {
    const cli = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8").split("async function runProtectedWriterPhase(")[1];
    const plan = cli.slice(cli.indexOf('  if (action === "plan") {'), cli.indexOf("  const guardPath ="));
    const observation = fixture().afterObservation;
    observation.worker.credentialActive = false;
    const oldPlan = plan.replace(' && writerAction === "writer-off"', "");
    const before = personalWriterPlan("writer-on", observation, oldPlan);
    await expect(before.promise).resolves.toBeUndefined(); // Exact previous one-line branch admitted this drift.
    expect(before.say).toHaveBeenCalledOnce();
    const on = personalWriterPlan("writer-on", observation, plan);
    await expect(on.promise).rejects.toThrow("expiry/zero");
    expect(on.say).not.toHaveBeenCalled(); expect(on.adapter.observe).toHaveBeenCalledOnce();
    const off = personalWriterPlan("writer-off", observation, plan);
    await expect(off.promise).resolves.toBeUndefined(); expect(off.say).toHaveBeenCalledOnce();
    expect(observation.writerEnabled).toBe(false); expect(observation.worker.credentialActive).toBe(false);
  });
  it.each(["writer-on", "writer-on-retry"])("does not promote checked C04 OFF into a fresh personal %s plan", async phase => {
    const observation = { ...fixture().afterObservation, quantityWriterEnabled: false };
    const on = personalWriterPlan(phase, observation);
    await expect(on.promise).rejects.toThrow("quantity ON");
    expect(on.say).not.toHaveBeenCalled(); expect(on.adapter.observe).toHaveBeenCalledOnce();
    expect(observation.writerEnabled).toBe(false); expect(observation.quantityWriterEnabled).toBe(false);
    const valid = personalWriterPlan(phase, { ...observation, quantityWriterEnabled: true });
    await expect(valid.promise).resolves.toBeUndefined(); expect(valid.say).toHaveBeenCalledOnce();
  });
  it.each(["writer-off", "writer-on-reconcile"])("retains checked C04 OFF in the non-ON %s plan", async phase => {
    const observation = { ...fixture().afterObservation, quantityWriterEnabled: false };
    const plan = personalWriterPlan(phase, observation);
    await expect(plan.promise).resolves.toBeUndefined(); expect(plan.say).toHaveBeenCalledOnce();
    expect(observation.quantityWriterEnabled).toBe(false); expect(observation.writerEnabled).toBe(false);
  });
  it("denies fresh ON and its retry before any mutation despite the exact C04 OFF receipt", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const f = writerFixture("writer-on", false, true);
      await expect(f.engine.apply()).rejects.toThrow("quantity ON");
      expect(f.calls).toEqual([]); expect(f.journal.write).not.toHaveBeenCalled();
      expect(f.current().writerEnabled).toBe(false); expect(f.current().quantityWriterEnabled).toBe(false);
    }
  });
  it("keeps personal OFF and same-intent ON reconciliation available after checked C04 OFF", async () => {
    const off = writerFixture("writer-off", false, true);
    await expect(off.engine.apply()).resolves.toMatchObject({ status: "committed", writerEnabled: false });
    expect(off.current().quantityWriterEnabled).toBe(false);
    const on = writerFixture("writer-on", false, true);
    on.journal.read.mockResolvedValue({ schema: "homecook.prelaunch-protected-writer-attempt.v1", operationId, reviewSha256: sha("4"), approvalSha256: sha("5"),
      action: "writer-on", readerReceiptSha256: sha("6"), readerFloor: on.review.to, status: "unknown" });
    await expect(on.engine.reconcile()).resolves.toMatchObject({ status: "not_applied", writerEnabled: false, automaticRetryAllowed: false });
    expect(on.calls).toEqual([]); expect(on.current().quantityWriterEnabled).toBe(false);
    on.current().writerEnabled = true; on.current().attestationWriterEnabled = true;
    await expect(on.engine.reconcile()).resolves.toMatchObject({ status: "committed", writerEnabled: true, automaticRetryAllowed: false });
    expect(on.calls).toEqual([]); expect(on.current().quantityWriterEnabled).toBe(false);
    // Reconciliation observes this intent; it does not grant a new operation permission to write ON.
    const retry = writerFixture("writer-on", false, true);
    await expect(retry.engine.apply()).rejects.toThrow("quantity ON"); expect(retry.calls).toEqual([]);
  });
  it("rolls back and preserves the attempt when the personal-control change touches facts", async () => {
    const f = writerFixture("writer-on", true);
    await expect(f.engine.apply()).rejects.toThrow("preserved rows");
    expect(f.calls).toContain("ROLLBACK;"); expect(f.current().writerEnabled).toBe(false);
    expect(f.journal.write).toHaveBeenLastCalledWith(expect.objectContaining({ status: "rolled_back_before_commit" }));
  });
  it("requires the preserved attestation alias rather than treating228 as an allowed ledger number", () => {
    const f = fixture();
    expect(() => db.assertProtectedPrelaunchObservation(f.review, { ...f.afterObservation, attestationScope: { ...f.afterObservation.attestationScope, aliasSha256: sha("e") } }, "after")).toThrow("scope");
    expect(() => db.assertProtectedPrelaunchObservation(f.review, { ...f.afterObservation, ledger: f.review.database.before }, "after")).toThrow("ledger");
  });
  it("consumes the actual source registry exports in the mocked current228 adapter", async () => {
    const f = fixture();
    const metadata = db.QUANTITY_V4_COLUMN_METADATA.map(entry => {
      const table = entry[0], columns = entry[1];
      if (typeof table !== "string" || !Array.isArray(columns)) throw new Error("Fixture column table is malformed");
      return { table, columns: [...columns.map(column => {
        const [name,type,not_null,defaultValue] = column;
        if (typeof name !== "string" || typeof type !== "string" || typeof not_null !== "boolean"
          || defaultValue !== null && typeof defaultValue !== "string") throw new Error("Fixture column is malformed");
        return { name, type: table === "public.product_planner_entries" && name === "quantity_amount" ? "numeric" : type, not_null, default: defaultValue };
      }), { name: db.QUANTITY_V4_NORMAL_COLUMNS.find(row => row.table === table)!.added, type: "jsonb", not_null: false, default: null }] };
    });
    const query = vi.fn(async (sql: string) => {
      if (sql === db.PROTECTED_IMMUTABLE_CATALOG_SQL) return f.review.database.afterImmutableSha256;
      if (sql === db.PROTECTED_CATALOG_SQL) return f.review.database.afterCatalogSha256;
      if (sql === db.QUANTITY_V4_NORMAL_DATA_SQL) return sha("9");
      if (sql === db.QUANTITY_V4_COLUMNS_SQL) return JSON.stringify(metadata);
      if (sql === db.COOKED_WEIGHT_SCOPE_SQL) return JSON.stringify(f.review.database.afterScope);
      if (sql === db.COOKED_WEIGHT_ATTESTATION_SCOPE_SQL) return JSON.stringify(f.afterObservation.attestationScope);
      if (sql === db.QUANTITY_V4_WORKER_STATE_SQL) return JSON.stringify(f.afterObservation.worker);
      if (sql.startsWith("with expected(signature, body_md5")) return JSON.stringify({ required_functions: sql.includes("private.parse_quantity_input_v4(") ? 103 : 10,
        missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0 });
      if (sql.includes("SELECT filename,sha256 FROM homecook_deploy.migrations")) return JSON.stringify(f.review.database.after);
      if (sql.includes("to_regclass(") || sql.includes("pg_get_userbyid(c.relowner)")) return "t";
      if (sql.includes("FROM pg_stat_activity")) return "f";
      if (sql.startsWith("SELECT CASE WHEN count(*)=1")) return sql.includes("private.cooked_weight_user_attestation_control") ? "false" : "true";
      if (sql.startsWith("SELECT NOT EXISTS")) return "t";
      if (sql.includes("FROM private.cooked_weight_user_attestations t")) return sha("a");
      if (sql.includes("encode(sha256")) return sha("8");
      return "";
    });
    const adapter = db.createProtectedPrelaunchAdapter({ inspect: async () => f.target, query,
      session: () => ({ query, close: async () => {}, stop: () => {} }) }, web.COOKED_WEIGHT_ATTESTATION_FEATURE, f.review);
    const observation = await adapter.observe(undefined, "owned-registry-only");
    expect(observation).toMatchObject({ writerEnabled: false, quantityWriterEnabled: true, attestationRowsEmpty: true,
      attestationPostimageRegistrySha256: f.review.database.attestationPostimageRegistrySha256 });
    expect(query.mock.calls.filter(([sql]) => sql.startsWith("with expected(signature, body_md5"))).toHaveLength(2);
    expect(db.assertProtectedPrelaunchObservation(f.review, observation, "after")).toBe(observation);
  });
  it("keeps original227 activation bytes while requiring a committed same-operation publication", () => {
    const f = publicationFixture();
    expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd()).observation.policyRowSha256).toBe(sha("2"));
    f.save(f.currentPath, { ...f.current, state: "activation-outcome-unknown" });
    expect(() => web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd())).toThrow("pending/unknown");
  });
  it("follows the real successor receipt shapes through activation→pause→repair→fresh activation", () => {
    const f = publicationFixture(), binding = web.cookedWeightAttestationSuccessorBinding(f.successor);
    const header = { schema: "homecook.youtube-c04-controlled-cutover-journal.v1", reviewSha256: sha("d"), operationId, operationDirectory: f.directory,
      releaseSha: ref("b"), targetSha256: f.review.database.targetSha256, workerDatabaseReceiptSha256: f.review.predecessorQuantity.databaseReceipt.sha256 };
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uid2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const directory = (name: string) => { const path = join(f.directory, name); mkdirSync(path, { recursive: true, mode: 0o700 }); return path; };
    const on = { ...f.observation, ledgerCount: 228, databaseSuccessor: binding, normalDataSha256: sha("9") };
    const first = f.save(join(directory(`activation-receipts/${uuid}`), "receipt.json"), { ...f.activation.record,
      schema: "homecook.youtube-c04-activation-receipt-successor.v1", databaseSuccessor: binding, predecessorActivationReceipt: f.activation.pointer,
      beforeObservation: f.verification.record.observation, observation: on, database: on, readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256,
      writerReceiptSha256: f.review.predecessorQuantity.writerReceipt.sha256, zeroActualAI: true });
    f.save(f.currentPath, { ...f.current, activationReceipt: first.pointer });
    expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd()).observation.policyRowSha256).toBe(sha("2"));
    const off = { ...on, quantityPolicyEnabled: false, workerPolicyEnabled: false, policyRowSha256: sha("e"), policy: { enabled: false, model: "same-model" } };
    const pause = f.save(join(directory("repair-pauses"), `${uuid}.json`), { ...header, schema: "homecook.youtube-c04-repair-pause-successor.v1", databaseSuccessor: binding,
      status: "quiesced", activationVerification: f.verification.pointer, activationReceipt: first.pointer, activationReconciliation: null,
      beforeObservation: { ...on, quantityPolicyEnabled: false }, observation: off, post: f.post.record,
      previousPostWorkerTerminal: f.post.pointer, previousPostWorkerOrigin: f.origin.pointer, zeroActualAI: true });
    const p2 = f.save(join(directory(`verifications/${uuid}`), "post-worker-terminal.json"), { ...f.post.record,
      schema: "homecook.prelaunch-quantity-worker-after-successor.v1", databaseSuccessor: binding, predecessorRecord: f.post.record, ledgerCount: 228,
      policyRowSha256: sha("e"), pid: 200, normalDataSha256: sha("f") });
    const p2origin = f.save(join(directory(`verifications/${uuid}`), "post-worker-origin.json"), { ...f.origin.record, postWorkerTerminal: p2.pointer,
      databaseSuccessor: binding, successorPredecessorCheckpoint: f.post.pointer, successorPredecessorOrigin: f.origin.pointer,
      previousPostWorkerTerminal: f.post.pointer, previousPostWorkerOrigin: f.origin.pointer,
      repairPause: pause.pointer, activationVerification: f.verification.pointer, activationReceipt: first.pointer, activationReconciliation: null });
    f.save(f.currentPath, { ...f.current, state: "verified-policy-disabled", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      repairPause: pause.pointer, activationReceipt: first.pointer });
    expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd()).observation.policyRowSha256).toBe(sha("e"));
    const uid3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const p3 = f.save(join(directory(`verifications/${uid3}`), "post-worker-terminal.json"), { ...p2.record, pid: 300 });
    const p3origin = f.save(join(directory(`verifications/${uid3}`), "post-worker-origin.json"), { ...p2origin.record, postWorkerTerminal: p3.pointer });
    f.save(f.currentPath, { ...f.current, state: "verified-policy-disabled", postWorkerTerminal: p3.pointer, postWorkerOrigin: p3origin.pointer,
      repairPause: pause.pointer, activationReceipt: first.pointer });
    expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd()).post.record.pid).toBe(300);
    const foreignOrigin = f.save(p3origin.pointer.path, { ...p3origin.record, previousPostWorkerTerminal: p2.pointer, previousPostWorkerOrigin: p2origin.pointer });
    f.save(f.currentPath, { ...f.current, state: "verified-policy-disabled", postWorkerTerminal: p3.pointer, postWorkerOrigin: foreignOrigin.pointer,
      repairPause: pause.pointer, activationReceipt: first.pointer });
    expect(() => web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd())).toThrow("OFF publication");
    const missingDirectory = join(f.directory, "verifications/dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const missingPause = f.save(join(directory("repair-pauses"), `${uid3}.json`), { ...pause.record,
      previousPostWorkerTerminal: { path: join(missingDirectory, "post-worker-terminal.json"), sha256: sha("0") },
      previousPostWorkerOrigin: { path: join(missingDirectory, "post-worker-origin.json"), sha256: sha("0") } });
    f.save(f.currentPath, { ...f.current, state: "repair-quiesced", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      repairPause: missingPause.pointer, activationReceipt: first.pointer });
    expect(() => web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd())).toThrow();
    const offIntent = { ...off, quantityPolicyEnabled: true, normalDataSha256: sha("f") };
    const verification = f.save(join(directory(`activation-verifications/${uid2}`), "verification.json"), { ...header,
      schema: "homecook.youtube-c04-activation-verification-successor.v1", databaseSuccessor: binding, observation: offIntent, post: p2.record,
      authority: { readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256, writerReceiptSha256: f.review.predecessorQuantity.writerReceipt.sha256 }, zeroActualAI: true });
    const nextOn = { ...offIntent, workerPolicyEnabled: true, policyRowSha256: sha("f"), policy: { enabled: true, model: "same-model" } };
    const next = f.save(join(directory(`activation-receipts/${uid2}`), "receipt.json"), { ...first.record, activationVerification: verification.pointer,
      beforeObservation: offIntent, observation: nextOn, database: nextOn, predecessorActivationReceipt: first.pointer });
    f.save(f.currentPath, { ...f.current, state: "activation-committed", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      activationVerification: verification.pointer, activationReceipt: next.pointer });
    const current = web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd());
    expect(current.observation.policyRowSha256).toBe(sha("f"));
    expect(db.assertCookedWeightAttestationCurrentObservation(f.successor, { ...f.afterObservation, worker: { ...f.afterObservation.worker, policyRowSha256: sha("f") } },
      { approvedWorkerPolicy: current.observation })).toBeTruthy();
    const reconcile = f.save(join(directory(`activation-reconciliations/${uid2}`), "receipt.json"), { ...header,
      schema: "homecook.youtube-c04-activation-reconciliation-successor.v1", status: "committed", databaseSuccessor: binding,
      activationVerification: verification.pointer, previousPostWorkerTerminal: p2.pointer, previousPostWorkerOrigin: p2origin.pointer,
      beforeObservation: offIntent, expectedAfter: { workerPolicyEnabled: true, policyStableSha256: offIntent.policyStableSha256,
        credentialRowSha256: offIntent.credentialRowSha256, credentialGeneration: 48, workerReleaseSha: ref("b"),
        targetSha256: f.review.database.targetSha256, ledgerCount: 228, catalogFingerprint: web.QUANTITY_V4_WORKER_CATALOG_AFTER, databaseSuccessor: binding },
      observation: nextOn, zeroActualAI: true });
    const off2 = { ...nextOn, quantityPolicyEnabled: false, workerPolicyEnabled: false, policyRowSha256: sha("7"), policy: { enabled: false, model: "same-model" } };
    const pause2 = f.save(join(directory("repair-pauses"), `${uid2}.json`), { ...pause.record,
      activationVerification: verification.pointer, activationReceipt: null, activationReconciliation: reconcile.pointer,
      beforeObservation: { ...nextOn, quantityPolicyEnabled: false }, observation: off2, post: p2.record,
      previousPostWorkerTerminal: p2.pointer, previousPostWorkerOrigin: p2origin.pointer });
    f.save(f.currentPath, { ...f.current, state: "repair-quiesced", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      repairPause: pause2.pointer, activationVerification: verification.pointer, activationReceipt: null, activationReconciliation: reconcile.pointer });
    expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd()).observation.policyRowSha256).toBe(sha("7"));
    const foreign = f.save(reconcile.pointer.path, { ...reconcile.record, databaseSuccessor: { ...binding, reviewSha256: sha("0") } });
    const foreignPause = f.save(pause2.pointer.path, { ...pause2.record, activationReconciliation: foreign.pointer });
    f.save(f.currentPath, { ...f.current, state: "repair-quiesced", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      repairPause: foreignPause.pointer, activationVerification: verification.pointer, activationReceipt: null, activationReconciliation: foreign.pointer });
    expect(() => web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd())).toThrow("binding");
    f.save(f.currentPath, { ...f.current, state: "activation-committed", postWorkerTerminal: p2.pointer, postWorkerOrigin: p2origin.pointer,
      activationVerification: verification.pointer, activationReceipt: next.pointer });
    expect(f.activation.record.observation.ledgerCount).toBe(227); expect(f.post.record.ledgerCount).toBe(227);
    f.save(next.pointer.path, { ...next.record, databaseSuccessor: { ...binding, migrationSha256: sha("0") } });
    expect(() => web.loadCookedWeightAttestationWorkerContinuation(f.successor, process.cwd())).toThrow("bytes");
  });
  it("reads the producer229 committed readback then pause/resume chain without relabeling its228 anchor", () => {
    const f = publicationFixture(), maintenance = maintenanceFixture(f);
    web.setOwnedMaintenance(maintenance);
    try {
      const binding = web.cookedWeightAttestationSuccessorBinding(f.successor), databaseMaintenance = web.nutritionValidatorMaintenanceBinding(maintenance);
      const directory = (name: string) => {const path=join(f.directory,name);mkdirSync(path,{recursive:true,mode:0o700});return path;};
      const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const on228 = {...f.observation, ledgerCount:228, databaseSuccessor:binding, normalDataSha256:sha("9")};
      const anchor=f.save(join(directory(`activation-receipts/${id}`),"receipt.json"),{...f.activation.record,
        schema:"homecook.youtube-c04-activation-receipt-successor.v1",databaseSuccessor:binding,predecessorActivationReceipt:f.activation.pointer,
        beforeObservation:f.verification.record.observation,observation:on228,database:on228,
        readerReceiptSha256:f.review.predecessorQuantity.readerReceipt.sha256,writerReceiptSha256:f.review.predecessorQuantity.writerReceipt.sha256,zeroActualAI:true});
      const on={...on228,ledgerCount:229,databaseMaintenance,normalDataSha256:sha("a")};
      const readback=f.save(join(directory(`activation-receipts/${id2}`),"receipt.json"),{...anchor.record,databaseMaintenance,
        predecessorActivationReceipt:anchor.pointer,observation:on,database:on});
      f.save(f.currentPath,{...f.current,activationReceipt:readback.pointer});
      expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor,process.cwd()).observation).toEqual(on);
      const off={...on,quantityPolicyEnabled:false,workerPolicyEnabled:false,policyRowSha256:sha("e"),policy:{...on.policy,enabled:false}};
      const pause=f.save(join(directory("repair-pauses"),`${id}.json`),{...f.current,schema:"homecook.youtube-c04-repair-pause-successor.v1",
        status:"quiesced",databaseSuccessor:binding,databaseMaintenance,activationVerification:f.verification.pointer,
        activationReceipt:readback.pointer,activationReconciliation:null,beforeObservation:{...on,quantityPolicyEnabled:false},observation:off,
        post:f.post.record,previousPostWorkerTerminal:f.post.pointer,previousPostWorkerOrigin:f.origin.pointer,zeroActualAI:true});
      const p2=f.save(join(directory(`verifications/${id}`),"post-worker-terminal.json"),{...f.post.record,
        schema:"homecook.prelaunch-quantity-worker-after-successor.v1",databaseSuccessor:binding,databaseMaintenance,predecessorRecord:f.post.record,
        ledgerCount:229,policyRowSha256:off.policyRowSha256,pid:200});
      const origin=f.save(join(directory(`verifications/${id}`),"post-worker-origin.json"),{...f.origin.record,postWorkerTerminal:p2.pointer,
        databaseSuccessor:binding,databaseMaintenance,successorPredecessorCheckpoint:f.post.pointer,successorPredecessorOrigin:f.origin.pointer,
        repairPause:pause.pointer,previousPostWorkerTerminal:f.post.pointer,previousPostWorkerOrigin:f.origin.pointer,
        activationVerification:f.verification.pointer,activationReceipt:readback.pointer,activationReconciliation:null});
      f.save(f.currentPath,{...f.current,state:"verified-policy-disabled",postWorkerTerminal:p2.pointer,postWorkerOrigin:origin.pointer,repairPause:pause.pointer});
      expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor,process.cwd()).observation.policyRowSha256).toBe(sha("e"));
      const intent={...off,quantityPolicyEnabled:true,normalDataSha256:sha("b")};
      const verification=f.save(join(directory(`activation-verifications/${id2}`),"verification.json"),{...f.current,
        schema:"homecook.youtube-c04-activation-verification-successor.v1",databaseSuccessor:binding,databaseMaintenance,post:p2.record,observation:intent,
        authority:{readerReceiptSha256:f.review.predecessorQuantity.readerReceipt.sha256,writerReceiptSha256:f.review.predecessorQuantity.writerReceipt.sha256},zeroActualAI:true});
      const applied={...intent,workerPolicyEnabled:true,policyRowSha256:sha("f"),policy:{...intent.policy,enabled:true}};
      const reconciled=f.save(join(directory(`activation-reconciliations/${id2}`),"receipt.json"),{...f.current,
        schema:"homecook.youtube-c04-activation-reconciliation-successor.v1",status:"committed",databaseSuccessor:binding,databaseMaintenance,
        activationVerification:verification.pointer,beforeObservation:intent,observation:applied,zeroActualAI:true,
        expectedAfter:{workerPolicyEnabled:true,policyStableSha256:intent.policyStableSha256,credentialRowSha256:intent.credentialRowSha256,
          credentialGeneration:48,workerReleaseSha:ref("b"),targetSha256:f.review.database.targetSha256,ledgerCount:229,
          catalogFingerprint:web.QUANTITY_V4_WORKER_CATALOG_AFTER,databaseSuccessor:binding,databaseMaintenance}});
      const pause2=f.save(join(directory("repair-pauses"),`${id2}.json`),{...pause.record,activationVerification:verification.pointer,
        activationReceipt:null,activationReconciliation:reconciled.pointer,post:p2.record,previousPostWorkerTerminal:p2.pointer,previousPostWorkerOrigin:origin.pointer,
        beforeObservation:{...applied,quantityPolicyEnabled:false},observation:{...applied,quantityPolicyEnabled:false,workerPolicyEnabled:false,
          policyRowSha256:sha("7"),policy:{...applied.policy,enabled:false}}});
      f.save(f.currentPath,{...f.current,state:"repair-quiesced",postWorkerTerminal:p2.pointer,postWorkerOrigin:origin.pointer,repairPause:pause2.pointer});
      expect(web.loadCookedWeightAttestationWorkerContinuation(f.successor,process.cwd()).observation.policyRowSha256).toBe(sha("7"));
      const foreignReconcile=f.save(reconciled.pointer.path,{...reconciled.record,databaseMaintenance:{...databaseMaintenance,reviewSha256:sha("f")}});
      const foreignPause=f.save(pause2.pointer.path,{...pause2.record,activationReconciliation:foreignReconcile.pointer});
      f.save(f.currentPath,{...f.current,state:"repair-quiesced",postWorkerTerminal:p2.pointer,postWorkerOrigin:origin.pointer,repairPause:foreignPause.pointer});
      expect(()=>web.loadCookedWeightAttestationWorkerContinuation(f.successor,process.cwd())).toThrow("current229");
      const foreign=f.save(origin.pointer.path,{...origin.record,databaseMaintenance:{...databaseMaintenance,receipt:pointer("foreign","f")}});
      f.save(f.currentPath,{...f.current,state:"verified-policy-disabled",postWorkerTerminal:p2.pointer,postWorkerOrigin:foreign.pointer,repairPause:pause.pointer});
      expect(()=>web.loadCookedWeightAttestationWorkerContinuation(f.successor,process.cwd())).toThrow("origin");
      expect(f.activation.record.observation.ledgerCount).toBe(227); expect(anchor.record.observation.ledgerCount).toBe(228);
    } finally {web.setOwnedMaintenance(null);}
  });
  it("keeps native-shaped229 current data/facts readable without freezing the old snapshot hash", () => {
    const f=publicationFixture(), maintenance=maintenanceFixture(f), value={...f.afterObservation,
      ledger:maintenance.review.database.after,catalogSha256:maintenance.review.database.afterCatalogSha256,
      nutritionValidator:maintenance.review.database.functionAfter,stableImmutableSha256:maintenance.review.database.stableImmutableSha256,
      normalDataSha256:sha("f"),attestationRowsSha256:sha("e"),attestationRowsEmpty:false,metadataNull:false};
    expect(db.assertCookedWeightAttestationCurrentObservation(f.successor,value,{databaseMaintenance:maintenance,quantityWriterState:"on"})).toBe(value);
    expect(()=>db.assertCookedWeightAttestationCurrentObservation(f.successor,{...value,nutritionValidator:maintenance.review.database.functionBefore},{databaseMaintenance:maintenance})).toThrow("postimage");
  });
  it("binds real229 writer intents and rejects old228 unknown before observation or mutation", async () => {
    const f=writerFixture("writer-off",false,false,true);
    const result=await f.engine.apply(); expect(result.databaseMaintenance).toEqual(web.nutritionValidatorMaintenanceBinding(f.maintenance));
    await f.journal.write({...result,status:"unknown",databaseMaintenance:undefined});
    f.calls.splice(0); await expect(f.engine.reconcile()).rejects.toThrow("binding");expect(f.calls).toEqual([]);
    await f.journal.write({...result,status:"unknown"});
    await expect(f.engine.reconcile()).resolves.toMatchObject({status:"committed",writerEnabled:false,databaseMaintenance:result.databaseMaintenance});
    expect(f.calls.some(sql=>sql.startsWith("UPDATE"))).toBe(false);
  });
  it("uses the unchanged C04 OFF authority on228 and preserves the separate personal control", async () => {
    const f = publicationFixture();
    const original = { ...f.review, feature: web.QUANTITY_V4_FEATURE, quantityStage: "worker", from: ref("a"), to: ref("b"),
      predecessorProtected: { reviewSha256: web.COOKED_WEIGHT_ROLLOUT_REVIEW_PIN.sha256, writerApprovalSha256: web.COOKED_WEIGHT_WRITER_REVIEW_PIN.sha256,
        writerEnabled: true, productWriterEnabled: true, readerFloor: ref("a"), databaseReceipt: pointer("c01-db", "1"), readerReceipt: pointer("c01-reader", "2"), writerReceipt: pointer("c01-writer", "3") },
      readerEnvironment: { MUMEOK_QUANTITY_V4_ENABLED: [null, "true"] }, consumersReceipt: pointer("db1", "e"), workerAuthority: { controlReviewSha256: sha("d"), operationId },
      database: { ...f.review.database, source: f.review.database.before, before: f.review.database.before.slice(0,226), after: f.review.database.before,
        afterCatalogSha256: f.review.database.beforeCatalogSha256, afterImmutableSha256: f.review.database.immutableSha256,
        beforeScope: f.review.database.beforeScope, afterScope: f.review.database.beforeScope,
        workerCatalogBefore: web.QUANTITY_V4_WORKER_CATALOG_BEFORE, workerBaseline: { credentialRowSha256: sha("1"), policyRowSha256: sha("8"),
          schemaIdentity: web.QUANTITY_V4_WORKER_SCHEMA_IDENTITY, snapshotDigest: sha("4"), credentialGeneration: 47, workerPolicyEnabled: false, workerReleaseSha: ref("5") },
        migrations: [{ filename: web.QUANTITY_V4_MIGRATIONS[5].filename, rawSha256: web.QUANTITY_V4_MIGRATIONS[5].sha256, payloadSha256: sha("1") }] } };
    const reader = { schema: "homecook.prelaunch-protected-reader.v1", reviewSha256: sha("2"), releaseSha: ref("b"), readerFloor: ref("b"),
      feature: web.QUANTITY_V4_FEATURE, quantityStage: "worker", consumersReceiptSha256: sha("e"), workerReceipt: f.post.pointer, workerReceiptSha256: f.post.pointer.sha256,
      backwardCompatible: false, databasePlanSha256: hash(JSON.stringify({ source: original.database.after, applied: original.database.after })), verifiedFlowsSha256: f.review.readerFlowsSha256 };
    const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: sha("2"), releaseSha: ref("b"), writerOn: true, safeOff: true,
      databasePlanSha256: reader.databasePlanSha256, readerFlowsSha256: f.review.readerFlowsSha256, readerReceiptSha256: null, workerReceiptSha256: null };
    const before = f.verification.record.observation;
    const evidence = { ...f.successor.predecessor, current: f.current, authority: { database: { review: original, pointer: f.review.predecessorQuantity.databaseReceipt },
      reader: { pointer: f.review.predecessorQuantity.readerReceipt }, writer: { pointer: f.review.predecessorQuantity.writerReceipt } },
      verification: { ...f.verification, record: { ...f.verification.record, authority: { readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256,
        writerReceiptSha256: f.review.predecessorQuantity.writerReceipt.sha256 }, service: { loaded: true, state: "running", pid: 100, plistSha256: sha("d") }, zeroActualAI: true } },
      activation: { ...f.activation, record: { ...f.activation.record, beforeObservation: before,
        readerReceiptSha256: f.review.predecessorQuantity.readerReceipt.sha256, writerReceiptSha256: f.review.predecessorQuantity.writerReceipt.sha256,
        service: { loaded: true, state: "running", pid: 100, plistSha256: sha("d") }, zeroActualAI: true } } };
    const successor = { ...f.successor, predecessor: evidence }, calls: string[] = [];
    let actor = "supabase_admin", current = { ...f.afterObservation, writerEnabled: true, attestationWriterEnabled: true };
    const staged = structuredClone(current);
    const session = { postgresContext: { searchPath: '"$user", public, extensions', timeZone: "UTC" }, query: vi.fn(async (sql: string) => {
      calls.push(sql); const role = /SET LOCAL ROLE (postgres|supabase_admin);/u.exec(sql)?.[1]; if (role) actor = role;
      if (sql === "RESET ROLE;") actor = "supabase_admin"; if (sql === "SELECT session_user;") return "supabase_admin"; if (sql === "SELECT current_user;") return actor;
      if (sql.startsWith("UPDATE private.quantity_input_v4_policy")) staged.quantityWriterEnabled = false;
      if (sql === "COMMIT;") current = structuredClone(staged); return "";
    }), close: vi.fn(async () => {}), stop: vi.fn() };
    const engine = db.createProtectedPrelaunchWriter({ review: original, reviewSha256: sha("2"), approval, approvalSha256: sha("3"), readerReceipt: reader, readerReceiptSha256: sha("a"),
      operationId, action: "writer-off", baselineReview: f.review, baselineReviewSha256: sha("4"), attestationSuccessor: successor,
      approvedWorkerPolicy: f.observation, workerCheckpoint: f.post.record, readerWorkerCheckpoint: f.post.record, workerReceipt: f.post.pointer,
      adapter: { observe: async (query?: unknown) => structuredClone(query ? staged : current), migrationSession: () => session },
      journal: { read: async () => null, write: vi.fn(async () => {}) }, assertBoundary: async () => {} });
    const record = await engine.apply();
    expect(record).toMatchObject({ status: "committed", writerEnabled: false, feature: web.QUANTITY_V4_FEATURE, baselineReviewSha256: sha("4") });
    expect(current.attestationWriterEnabled).toBe(true); expect(current.quantityWriterEnabled).toBe(false);
    expect(calls.filter(sql => sql.startsWith("UPDATE private."))).toEqual(["UPDATE private.quantity_input_v4_policy SET enabled=false WHERE singleton AND enabled=true;"]);
  });
  it("requires a receipts-backed current whole policy after enabled/timestamp changes", () => {
    const f = publicationFixture(), binding = web.cookedWeightAttestationSuccessorBinding(f.successor);
    const before = { ...f.observation, ledgerCount: 228, databaseSuccessor: binding, workerPolicyEnabled: false, policyRowSha256: sha("e"), policy: { enabled: false, model: "same-model" } };
    const after = { ...before, workerPolicyEnabled: true, policyRowSha256: sha("f"), policy: { enabled: true, model: "same-model" } };
    expect(web.assertCookedWeightAttestationWorkerTransition(f.successor, before, after, true)).toBe(after);
    expect(db.assertCookedWeightAttestationCurrentObservation(f.successor, { ...f.afterObservation, worker: { ...f.afterObservation.worker, policyRowSha256: sha("f") } },
      { approvedWorkerPolicy: after })).toBeTruthy();
    expect(() => web.assertCookedWeightAttestationWorkerTransition(f.successor, before, { ...after, policy: { enabled: true, model: "foreign-model" } }, true)).toThrow("enabled");
    expect(() => web.assertCookedWeightAttestationWorkerTransition(f.successor, before, { ...after, databaseSuccessor: null }, true)).toThrow("observation");
  });
  it("accepts fresh normal-data changes while refusing new metadata or unreceipted worker policy drift", () => {
    const f = fixture(), successor = { review: f.review };
    expect(db.assertCookedWeightAttestationCurrentObservation(successor, { ...f.afterObservation, normalDataSha256: sha("f") })).toBeTruthy();
    expect(() => db.assertCookedWeightAttestationCurrentObservation(successor, { ...f.afterObservation,
      worker: { ...f.afterObservation.worker, policyRowSha256: sha("f") } })).toThrow("policy");
  });
});

it.each(["B source handoff","current worker","safe OFF"])("keeps the exact current229 fingerprint values regardless of key order for %s", path => {
  const f=publicationFixture(),maintenance=maintenanceFixture(f),image=maintenance.review.database.functionAfter;
  const value={...f.afterObservation,ledger:maintenance.review.database.after,catalogSha256:maintenance.review.database.afterCatalogSha256,
    stableImmutableSha256:maintenance.review.database.stableImmutableSha256,
    nutritionValidator:{sourceMd5:image.sourceMd5,metadataSha256:image.metadataSha256,definitionSha256:image.definitionSha256},
    attestationRowsEmpty:false,metadataNull:false,quantityWriterEnabled:path!=="safe OFF"};
  const currentDatabaseBoundary={databaseMaintenance:maintenance,ddlOnly:false};
  const check=(current:typeof value)=>path==="B source handoff"
    ? db.assertProtectedPrelaunchObservation(f.review,current,"after",currentDatabaseBoundary)
    : db.assertCookedWeightAttestationCurrentObservation(f.successor,current,{databaseMaintenance:maintenance,
      quantityWriterState:path==="safe OFF"?undefined:"on",safeQuantityOff:path==="safe OFF",workerControlTransition:path==="current worker"});
  expect(JSON.stringify(value.nutritionValidator)).not.toBe(JSON.stringify(image));
  expect(()=>check(value)).not.toThrow();
  for(const changed of [{...value.nutritionValidator,sourceMd5:"f".repeat(32)},{...value.nutritionValidator,metadataSha256:sha("f")},
    {...value.nutritionValidator,definitionSha256:sha("f")},{...value.nutritionValidator,extra:"foreign"}])
    expect(()=>check({...value,nutritionValidator:changed})).toThrow("postimage");
});
