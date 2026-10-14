import { mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import * as deploy from "../scripts/lib/prelaunch-web-deploy.mjs";
import { assertProtectedPrelaunchObservation, planProtectedPrelaunchMigrations, createProtectedPrelaunchDatabaseEngine, createProtectedPrelaunchWriter } from "../scripts/lib/prelaunch-database.mjs";

const sha = (c: string) => c.repeat(64), ref = (c: string) => c.repeat(40);
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const pointer = (name: string, c: string) => ({ path: `/private/${name}.json`, sha256: sha(c) });
function fixture() {
  const before = Array.from({ length: 220 }, (_, i) => ({ filename: `${20250000000000 + i}_fixture.sql`, sha256: sha("a") }));
  const payload = "SELECT 1;";
  const bytes = Buffer.from(`-- Local draft only. No historical batch/meal/snapshot UPDATE and no learning collection.\nbegin;\n${payload}\ncommit;\n`);
  const migration = { filename: "20261013233000_cooked_batch_weight_evidence.sql", sha256: hash(bytes), bytes };
  const target = { postgresContainerId: "owned-only", fixture: true };
  const review = { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: "cooked-weight-evidence", from: ref("c"), to: ref("d"),
    files: { [`supabase/migrations/${migration.filename}`]: [null, migration.sha256], "lib/supabase/fixture.ts": [sha("0"), sha("1")] },
    predecessorBuildId: "fixture-c03-reader", predecessorPlistSha256: sha("1"), closedArtifactSha256: sha("2"),
    closedReviewSha256: deploy.CLOSED_R2_REVIEW_PIN.sha256, controlSha256: sha("3"), consentGeneration: 1, historicalProofsSha256: sha("4"),
    testScript: "test:feedback-batch:web", approved: { database: true, reader: true, writerOn: false }, allNewShapesOff: true, legacyReaderCompatible: true,
    isolatedEvidenceSha256: sha("5"), readerFlowsSha256: sha("6"), isolatedEvidence: pointer("isolated", "5"), readerFlows: pointer("reader", "6"),
    platformInventory: pointer("platform", "7"), backupReadiness: pointer("backup", "8"),
    predecessorProtected: { reviewSha256: deploy.PROTECTED_ROLLOUT_REVIEW_PIN.sha256, writerApprovalSha256: deploy.PROTECTED_WRITER_REVIEW_PIN.sha256,
      databaseReceipt: pointer("c03-database", "9"), readerReceipt: pointer("c03-reader", "a"), writerReceipt: pointer("c03-on", "b"),
      readerFloor: ref("c"), writerEnabled: true }, readerEnvironment: { HOMECOOK_COOKED_WEIGHT_EVIDENCE: [null, "1"] },
    database: { before, after: [...before, { filename: migration.filename, sha256: migration.sha256 }], targetSha256: hash(JSON.stringify(target)),
      configPath: "/private/config.env", configSha256: sha("a"), beforeCatalogSha256: sha("b"), afterCatalogSha256: sha("c"), immutableSha256: sha("d"),
      afterImmutableSha256: sha("e"), stableImmutableSha256: sha("f"),
      scopeTransition: { beforeOuterSha256: sha("1"), afterOuterSha256: sha("2"), afterAliasSha256: sha("1") },
      migrations: [{ filename: migration.filename, rawSha256: migration.sha256, payloadSha256: hash(payload) }] } };
  const scope: { outerSha256: string; aliasSha256: string | null } = { outerSha256: sha("1"), aliasSha256: null };
  const observation = { target, ledger: review.database.before, catalogSha256: review.database.beforeCatalogSha256,
    immutableSha256: review.database.immutableSha256, stableImmutableSha256: review.database.stableImmutableSha256,
    scope, productWriterEnabled: true, writerEnabled: false,
    preservedRowsSha256: sha("9"), active: false };
  return { review, target, observation, before, payload, migration };
}

describe("fixed C01 authority, independent C03 history and unchanged whole immutable guard", () => {
  it("binds the exact reviewed C01 source separately from the original C03 authority", () => {
    expect(deploy.COOKED_WEIGHT_ROLLOUT_REVIEW_PIN).toEqual({
      path: "/Users/cwj/.homecook/operations/mumeok-beta-c01-20261014-HhhiQC/approved-cooked-weight-rollout-review.json",
      sha256: "3d6f179bcdb964835f25e2c03376d560cd9d6b4de6e8b522b1007e4350f1f7f4",
    });
    expect(deploy.COOKED_WEIGHT_WRITER_REVIEW_PIN).toEqual({
      path: "/Users/cwj/.homecook/operations/mumeok-beta-c01-20261014-HhhiQC/approved-cooked-weight-writer-review.json",
      sha256: "48f34663f05d475c4c67780eeabadee209a70fd1dd384942b95863a32b92879b",
    });
  });
  it("accepts only the C01 transition with exact predecessor C03 ON/floor and separate writer authority", () => {
    expect(deploy.assertProtectedRolloutReview(fixture().review)).toMatchObject({ feature: "cooked-weight-evidence" });
    for (const mutate of [
      (r: ReturnType<typeof fixture>["review"]) => { r.predecessorProtected.writerEnabled = false; },
      (r: ReturnType<typeof fixture>["review"]) => { Object.assign(r.predecessorProtected, { reviewSha256: sha("0") }); },
      (r: ReturnType<typeof fixture>["review"]) => { r.database.scopeTransition.afterAliasSha256 = sha("3"); },
      (r: ReturnType<typeof fixture>["review"]) => { r.approved.writerOn = true; },
      (r: ReturnType<typeof fixture>["review"]) => { r.readerEnvironment.HOMECOOK_COOKED_WEIGHT_EVIDENCE[1] = "0"; },
    ]) { const value = fixture().review; mutate(value); expect(() => deploy.assertProtectedRolloutReview(value)).toThrow(); }
  });
  it("does not widen the C03 auth exception or R2/script source allowlist for C01", () => {
    for (const path of ["lib/server/hybrid-auth/public-read-policy-runtime.mjs", "lib/server/hybrid-auth/fixture.ts", "scripts/operator.mjs", "app/api/v1/marketing/fixture.ts"]) {
      const review = fixture().review;
      Object.assign(review, { files: { [path]: [sha("0"), sha("1")] } });
      expect(() => deploy.assertProtectedRolloutReview(review)).toThrow();
    }
  });
  it("handles only the fixed C01 comment envelope without weakening transaction or host controls", () => {
    const f = fixture();
    expect(planProtectedPrelaunchMigrations(f.review, [...f.before, f.migration]).pending[0].payload).toBe(f.payload);
    const wrong = { ...f.migration, filename: "20261013233000_other_feature.sql" };
    const review = structuredClone(f.review);
    review.database.after[220].filename = wrong.filename; review.database.migrations[0].filename = wrong.filename;
    expect(() => planProtectedPrelaunchMigrations(review, [...f.before, wrong])).toThrow();
  });
  it("compares whole before/after digests and the unchanged immutable remainder plus exact outer/alias", () => {
    const f = fixture();
    expect(assertProtectedPrelaunchObservation(f.review, f.observation, "before")).toBe(f.observation);
    const after = { ...f.observation, ledger: f.review.database.after, catalogSha256: f.review.database.afterCatalogSha256,
      immutableSha256: f.review.database.afterImmutableSha256, scope: { outerSha256: sha("2"), aliasSha256: sha("1") } };
    expect(assertProtectedPrelaunchObservation(f.review, after, "after")).toBe(after);
    for (const change of [{ productWriterEnabled: false }, { stableImmutableSha256: sha("0") },
      { immutableSha256: f.review.database.immutableSha256 }, { scope: { outerSha256: sha("2"), aliasSha256: sha("3") } }, { writerEnabled: true }]) {
      expect(() => assertProtectedPrelaunchObservation(f.review, { ...after, ...change }, "after")).toThrow();
    }
  });
});


function engineFixture() {
  const f = fixture(), reviewSha256 = hash(JSON.stringify(f.review)), operationId = "12345678-1234-4123-8123-123456789abc";
  let current = f.observation, staged = current, attempt: Record<string, unknown> | null = null;
  const calls: string[] = [];
  const session = { postgresContext: { searchPath: "public, extensions", timeZone: "UTC" }, query: vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("BEGIN")) staged = structuredClone(current);
    if (sql === "SELECT pg_export_snapshot();") return "00000003-00000004-1";
    if (sql === f.payload) staged = { ...staged, catalogSha256: f.review.database.afterCatalogSha256,
      immutableSha256: f.review.database.afterImmutableSha256, scope: { outerSha256: sha("2"), aliasSha256: sha("1") } };
    if (sql.includes("INSERT INTO homecook_deploy")) staged.ledger = f.review.database.after;
    if (sql.startsWith("UPDATE private.cooked_batch_weight_evidence_control")) staged.writerEnabled = sql.includes("SET enabled=true");
    if (sql.startsWith("UPDATE private.recipe_product_only_write_control")) staged.productWriterEnabled = sql.includes("SET enabled=true");
    if (sql === "COMMIT;") current = staged;
    if (sql === "ROLLBACK;") staged = current;
    return "";
  }), close: vi.fn(async () => {}), stop: vi.fn() };
  const adapter = { observe: vi.fn(async (query?: unknown) => structuredClone(query ? staged : current)),
    migrationSession: vi.fn(() => session), session: vi.fn(() => session),
    backup: vi.fn(async ({ snapshot }: { snapshot: string }) => ({ snapshot, target: f.target, fullArchiveDecoded: true, sha256: sha("7"), rolesSha256: sha("8") })),
    reloadSchema: vi.fn(async () => {}) };
  const journal = { read: vi.fn(async () => attempt), write: vi.fn(async (record: Record<string, unknown>) => { attempt = structuredClone(record); }) };
  const options = { review: f.review, reviewSha256, operationId, readMigrations: async () => [...f.before, f.migration], adapter, journal, assertBoundary: vi.fn(async () => {}) };
  return { ...f, ...options, session, calls, engine: createProtectedPrelaunchDatabaseEngine(options),
    getCurrent: () => current, getAttempt: () => attempt, resetJournal: () => { attempt = null; } };
}

describe("C01 reuse of the controlled transaction and independent writer lifecycle", () => {
  it("keeps C03 ON across the snapshot, exact payload/ledger, commit and schema reload", async () => {
    const f = engineFixture();
    expect(await f.engine.apply()).toMatchObject({ status: "committed", immutableSha256: f.review.database.afterImmutableSha256, writerEnabled: false });
    expect(f.getCurrent()).toMatchObject({ productWriterEnabled: true, writerEnabled: false });
    expect(f.adapter.session).not.toHaveBeenCalled(); expect(f.adapter.migrationSession).toHaveBeenCalledTimes(1);
    expect(f.adapter.reloadSchema).toHaveBeenCalledWith(f.operationId);
    expect(f.calls.some(sql => sql.includes("private.recipe_product_only_write_control") && sql.includes("FOR SHARE"))).toBe(true);
  });
  it("reconciles a lost commit acknowledgment without repeating payload or backup", async () => {
    const f = engineFixture(), query = f.session.query.getMockImplementation()!;
    f.session.query.mockImplementation(async sql => { const value = await query(sql); if (sql === "COMMIT;") throw new Error("owned mock lost acknowledgment"); return value; });
    await expect(f.engine.apply()).rejects.toThrow("lost acknowledgment");
    expect(f.getAttempt()?.status).toBe("unknown");
    expect(await f.engine.reconcile()).toMatchObject({ status: "committed", writerEnabled: false });
    expect(f.calls.filter(sql => sql === f.payload)).toHaveLength(1); expect(f.adapter.backup).toHaveBeenCalledTimes(1);
    expect(f.getCurrent().productWriterEnabled).toBe(true);
  });
  it("changes only C01 control at ON and safe OFF and keeps both reader/source floors", async () => {
    const f = engineFixture(); await f.engine.apply(); f.resetJournal();
    const reader = { schema: "homecook.prelaunch-protected-reader.v1", reviewSha256: f.reviewSha256, readerFloor: f.review.to, releaseSha: f.review.to,
      databasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })), verifiedFlowsSha256: f.review.readerFlowsSha256, backwardCompatible: false };
    const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: f.reviewSha256, releaseSha: f.review.to,
      databasePlanSha256: reader.databasePlanSha256, readerReceiptSha256: hash(JSON.stringify(reader)), readerFlowsSha256: reader.verifiedFlowsSha256, writerOn: true, safeOff: true };
    for (const action of ["writer-on", "writer-off"]) {
      const writer = createProtectedPrelaunchWriter({ ...f, approval, approvalSha256: hash(JSON.stringify(approval)), readerReceipt: reader,
        readerReceiptSha256: hash(JSON.stringify(reader)), action });
      expect(await writer.apply()).toMatchObject({ writerEnabled: action === "writer-on", readerFloor: f.review.to });
      expect(f.getCurrent().productWriterEnabled).toBe(true); f.resetJournal();
    }
    expect(f.calls.some(sql => sql.startsWith("UPDATE private.recipe_product_only_write_control"))).toBe(false);
    expect(f.calls.some(sql => sql.includes("cooked_batch_weight_evidence_control") && sql.includes("FOR UPDATE"))).toBe(true);
    expect(f.getCurrent().writerEnabled).toBe(false);
  });
});

it("preserves C03 safe OFF on the approved221 baseline without changing C01 or allowing old C03 ON", async () => {
  const f = engineFixture(); await f.engine.apply(); f.resetJournal(); f.getCurrent().writerEnabled = true;
  const product = structuredClone(f.review);
  product.feature = "recipe-product-source"; product.from = ref("a"); product.to = product.predecessorProtected.readerFloor;
  product.database.before = f.before.slice(0, 219); product.database.after = f.before;
  product.database.afterCatalogSha256 = f.review.database.beforeCatalogSha256;
  const reader = { schema: "homecook.prelaunch-protected-reader.v1", reviewSha256: deploy.PROTECTED_ROLLOUT_REVIEW_PIN.sha256,
    readerFloor: product.to, releaseSha: product.to, backwardCompatible: false, verifiedFlowsSha256: product.readerFlowsSha256,
    databasePlanSha256: hash(JSON.stringify({ source: product.database.after, applied: product.database.after })) };
  const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: reader.reviewSha256, releaseSha: product.to,
    databasePlanSha256: reader.databasePlanSha256, readerFlowsSha256: reader.verifiedFlowsSha256, readerReceiptSha256: hash(JSON.stringify(reader)), writerOn: true, safeOff: true };
  const options = { ...f, review: product, reviewSha256: reader.reviewSha256, approval, approvalSha256: deploy.PROTECTED_WRITER_REVIEW_PIN.sha256,
    readerReceipt: reader, readerReceiptSha256: hash(JSON.stringify(reader)), baselineReview: f.review, baselineReviewSha256: f.reviewSha256 };
  expect(() => createProtectedPrelaunchWriter({ ...options, action: "writer-on" })).toThrow("Only original C03 safe OFF");
  const writer = createProtectedPrelaunchWriter({ ...options, action: "writer-off" });
  const off = await writer.apply();
  expect(off).toMatchObject({ status: "committed", writerEnabled: false, readerFloor: product.to, baselineReviewSha256: f.reviewSha256 });
  expect(f.getCurrent()).toMatchObject({ productWriterEnabled: false, writerEnabled: true });
  expect(() => assertProtectedPrelaunchObservation(f.review, { ...f.getCurrent(), writerEnabled: false }, "after")).toThrow();
  expect(assertProtectedPrelaunchObservation(f.review, { ...f.getCurrent(), writerEnabled: false }, "after", { productOffReceipt: off, reviewSha256: f.reviewSha256 })).toMatchObject({ productWriterEnabled: false });
  for (const change of [{ approvalSha256: sha("0") }, { baselineReviewSha256: sha("0") }, { writerEnabled: true }, { status: "unknown" }]) {
    expect(() => deploy.assertCookedWeightProductOff({ ...off, ...change }, f.review, f.reviewSha256)).toThrow();
  }
  expect(f.calls.some(sql => sql.startsWith("UPDATE private.cooked_batch_weight_evidence_control"))).toBe(false);
});

it("keeps a C01 first-reader fence separate from C03 ON and retains the original C03 fence", () => {
  const f = fixture(), old = deploy.protectedReaderFenceSql({ feature: "recipe-product-source" });
  const weight = deploy.protectedReaderFenceSql(f.review);
  expect(old.check).toBe("SELECT count(*)=1 AND bool_and(singleton) AND NOT bool_or(enabled) FROM private.recipe_product_only_write_control;");
  expect(weight.begin).toContain("private.recipe_product_only_write_control WHERE singleton FOR SHARE");
  expect(weight.begin).toContain("LOCK TABLE private.cooked_batch_weight_evidence_control IN SHARE MODE");
  expect(weight.check).toContain("NOT bool_or(enabled) FROM private.cooked_batch_weight_evidence_control");
  expect(weight.check).toContain("bool_or(enabled) FROM private.recipe_product_only_write_control");
});


it("selects only an exact feature ref from copied private pins and never treats unknown C01 OFF as C03 OFF", async () => {
  const root = mkdtempSync(join(realpathSync("/tmp"), "c01-pin-selection-"));
  try {
    const f = fixture(), product = structuredClone(f.review);
    product.feature = "recipe-product-source"; product.to = f.review.from; product.from = ref("a");
    const productBytes = Buffer.from(`${JSON.stringify(product)}\n`), productPath = join(root, "c03.json");
    Object.assign(f.review.predecessorProtected, { reviewSha256: hash(productBytes) });
    const weightBytes = Buffer.from(`${JSON.stringify(f.review)}\n`), weightPath = join(root, "c01.json");
    writeFileSync(productPath, productBytes, { mode: 0o600 }); writeFileSync(weightPath, weightBytes, { mode: 0o600 });
    let source = readFileSync(new URL("../scripts/lib/prelaunch-web-deploy.mjs", import.meta.url), "utf8");
    source = source.replace(/export const PROTECTED_ROLLOUT_REVIEW_PIN = Object\.freeze\([^\n]+/u,
      `export const PROTECTED_ROLLOUT_REVIEW_PIN = Object.freeze(${JSON.stringify({ path: productPath, sha256: hash(productBytes) })});`);
    source = source.replace(/export const COOKED_WEIGHT_ROLLOUT_REVIEW_PIN = Object\.freeze\([^\n]+/u,
      `export const COOKED_WEIGHT_ROLLOUT_REVIEW_PIN = Object.freeze(${JSON.stringify({ path: weightPath, sha256: hash(weightBytes) })});`);
    const modulePath = join(root, "pins.mjs"); writeFileSync(modulePath, source);
    const copied = await import(pathToFileURL(modulePath).href);
    expect(copied.loadProtectedRolloutReview(process.cwd(), { ref: product.to, phase: "writer-off" }).feature).toBe("recipe-product-source");
    expect(copied.loadProtectedRolloutReview(process.cwd(), { ref: f.review.to, phase: "writer-off" }).feature).toBe("cooked-weight-evidence");
    expect(() => copied.loadProtectedRolloutReview(process.cwd(), { ref: ref("e"), phase: "writer-off" })).toThrow("exact approved reader reference");
    expect(() => copied.loadProtectedRolloutReview(process.cwd(), { feature: "other-private-control" })).toThrow("arbitrary protected feature");
    const unapprovedSource = source.replace(/export const COOKED_WEIGHT_ROLLOUT_REVIEW_PIN = Object\.freeze\([^\n]+/u,
      "export const COOKED_WEIGHT_ROLLOUT_REVIEW_PIN = Object.freeze({ path: null, sha256: null });");
    const unapprovedPath = join(root, "unapproved.mjs"); writeFileSync(unapprovedPath, unapprovedSource);
    const unapproved = await import(pathToFileURL(unapprovedPath).href);
    expect(() => unapproved.loadProtectedRolloutReview(process.cwd(), { feature: "cooked-weight-evidence" })).toThrow("핀이 비어");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("keeps both features OFF and the prior floor when C03 closes during committed C01 reader-pending", async () => {
  const f = engineFixture(), db = await f.engine.apply();
  expect(db).toMatchObject({ writerEnabled: false, readerReady: false, predecessorProtected: f.review.predecessorProtected });
  const off = { schema: "homecook.prelaunch-protected-writer-attempt.v1", status: "committed", action: "writer-off", writerEnabled: false,
    reviewSha256: deploy.PROTECTED_ROLLOUT_REVIEW_PIN.sha256, approvalSha256: deploy.PROTECTED_WRITER_REVIEW_PIN.sha256,
    readerFloor: f.review.predecessorProtected.readerFloor, target: f.target, baselineReviewSha256: f.reviewSha256,
    baselineDatabasePlanSha256: hash(JSON.stringify({ source: f.review.database.after, applied: f.review.database.after })) };
  f.getCurrent().productWriterEnabled = false;
  expect(() => deploy.assertCookedWeightFirstReader(f.review, off, f.reviewSha256)).toThrow("first-reader proof assumes C03 ON");
  expect(f.getCurrent()).toMatchObject({ writerEnabled: false, productWriterEnabled: false });
  expect(f.getAttempt()).toMatchObject({ status: "committed", readerReady: false });
  expect(f.calls.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  expect(f.review.predecessorProtected.readerFloor).toBe(ref("c"));
  expect(deploy.protectedRolloutPaths("/private", f.review).databaseGuardPath).not.toBe(deploy.protectedRolloutPaths("/private", { feature: "recipe-product-source" }).databaseGuardPath);
});

it("keeps C01 DB/writer boundary environments unchanged and adds only its gate at first reader activation", () => {
  const f = fixture(), previous = { Label: "com.homecook.production", WorkingDirectory: "/before", ProgramArguments: ["/node", "/before/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
    EnvironmentVariables: { MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false", KEEP: "fixture" } };
  const evidence = { currentControlSha256: f.review.controlSha256, currentProofsSha256: f.review.historicalProofsSha256, currentGeneration: 1 };
  expect(() => deploy.assertProtectedRolloutEnvironment({ review: f.review, before: previous, after: previous, ...evidence })).not.toThrow();
  const next = deploy.protectedReaderPlist(f.review, previous, "/candidate");
  expect(() => deploy.assertProtectedRolloutEnvironment({ review: f.review, before: previous, after: next, ...evidence, readerActivation: true })).not.toThrow();
  expect(previous.EnvironmentVariables).not.toHaveProperty("HOMECOOK_COOKED_WEIGHT_EVIDENCE");
  expect(() => deploy.assertProtectedRolloutEnvironment({ review: f.review, before: next, after: next, ...evidence })).not.toThrow();
  expect(() => deploy.assertProtectedRolloutEnvironment({ review: f.review, before: previous, after: next, ...evidence })).toThrow();
});
