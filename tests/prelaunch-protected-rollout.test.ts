import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { cpSync, mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createProtectedPrelaunchDatabaseEngine, createProtectedPrelaunchJournal, createProtectedPrelaunchWriter, planProtectedPrelaunchMigrations, validatePrelaunchMigrationSql } from "../scripts/lib/prelaunch-database.mjs";
import { CLOSED_R2_REVIEW_PIN, PROTECTED_ROLLOUT_REVIEW_PIN, PROTECTED_WRITER_REVIEW_PIN, assertProtectedClosedR2Marker, assertProtectedWriterReview, assertProtectedReaderRollback, assertProtectedReaderCompensation, assertProtectedRolloutEnvironment,
  assertProtectedRolloutReview, assertProtectedRolloutSource, classifyPrelaunchScope, parsePrelaunchOptions, protectedRolloutReaderReceipt, protectedRolloutStatus, retargetPlist } from "../scripts/lib/prelaunch-web-deploy.mjs";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const approvedRolloutPin = { path: "/Users/cwj/.homecook/operations/mumeok-beta-c03-20261014-MeZKNX/approved-rollout-review.json", sha256: "0112e9ba64f6765a24fe64a891bd96fe2fb6edc19a314d398d0b5a7fbbdb2b6f" };
const approvedWriterPin = { path: "/Users/cwj/.homecook/operations/mumeok-beta-c03-20261014-MeZKNX/approved-writer-review.json", sha256: "87d989c6ca9c50da8cb93ec0c0da4af95d1f30941a9ed2255d67e3ccdea663c4" };
const ref = (character: string) => character.repeat(40);
const sha = (character: string) => character.repeat(64);

function fixture() {
  const existing = { filename: "20261012010000_existing.sql", sha256: hash("approved predecessor") };
  const payload = "CREATE FUNCTION public.recipe_fixture() RETURNS integer LANGUAGE sql AS 'SELECT 1';";
  const bytes = Buffer.from(`begin;\n${payload}\ncommit;\n`);
  const migration = { filename: "20261013010000_fixture.sql", sha256: hash(bytes), bytes };
  const before = [existing], after = [existing, { filename: migration.filename, sha256: migration.sha256 }];
  const target = { postgresContainerId: "owned-fixture", postgresVolumeName: "owned-volume", systemIdentifier: "fixture-system", major: 17 };
  const previous = { Label: "com.homecook.production", WorkingDirectory: "/previous", ProgramArguments: ["/node", "/previous/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
    EnvironmentVariables: { MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false", MUMEOK_ROUND2_CONTROL_PATH: "/private/control.json",
      MUMEOK_ROUND2_RELEASE_SHA: ref("c"), MUMEOK_ROUND2_REPOSITORY_ROOT: "/historical", MUMEOK_ROUND2_READINESS_PATH: "/private/historical.json" } };
  const live = { ref: ref("a"), buildId: "previous-build", bytes: Buffer.from("previous plist"), plist: previous };
  const review = { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: "recipe-product-source", from: live.ref, to: ref("b"),
    predecessorBuildId: live.buildId, predecessorPlistSha256: hash(live.bytes), closedArtifactSha256: sha("c"), closedReviewSha256: CLOSED_R2_REVIEW_PIN.sha256,
    controlSha256: sha("d"), consentGeneration: 1, historicalProofsSha256: sha("e"), testScript: "test:feedback-batch:web",
    files: { "lib/supabase/fixture.ts": [sha("a"), sha("b")], [`supabase/migrations/${migration.filename}`]: [null, migration.sha256] },
    approved: { database: true, reader: true, writerOn: false }, allNewShapesOff: true, legacyReaderCompatible: true,
    isolatedEvidenceSha256: sha("f"), readerFlowsSha256: sha("0"), isolatedEvidence: { path: "/private/isolated.json", sha256: sha("f") },
    readerFlows: { path: "/private/reader-flows.json", sha256: sha("0") }, platformInventory: { path: "/private/current.json", sha256: sha("7") },
    backupReadiness: { path: "/private/readiness.json", sha256: sha("8") }, database: { before, after, targetSha256: hash(JSON.stringify(target)), configPath: "/private/db.env", configSha256: sha("9"),
      beforeCatalogSha256: sha("1"), afterCatalogSha256: sha("2"), immutableSha256: sha("3"),
      migrations: [{ filename: migration.filename, rawSha256: migration.sha256, payloadSha256: hash(payload) }] } };
  const calls: string[] = [];
  let ledger = before, catalogSha256 = review.database.beforeCatalogSha256;
  let stagedLedger = before, stagedCatalog = catalogSha256;
  let attempt: Record<string, unknown> | null = null;
  const observation = () => ({ target, ledger, catalogSha256, immutableSha256: review.database.immutableSha256, preservedRowsSha256: sha("6"), writerEnabled: false, active: false });
  const session = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("BEGIN")) { stagedLedger = ledger; stagedCatalog = catalogSha256; }
      if (sql === "SELECT pg_export_snapshot();") return "00000003-00000004-1";
      if (sql === payload) stagedCatalog = review.database.afterCatalogSha256;
      if (sql.startsWith("INSERT INTO homecook_deploy.migrations")) stagedLedger = after;
      if (sql === "COMMIT;") { ledger = stagedLedger; catalogSha256 = stagedCatalog; }
      if (sql === "ROLLBACK;") { stagedLedger = ledger; stagedCatalog = catalogSha256; }
      return "";
    }), close: vi.fn(async () => {}), stop: vi.fn(),
  };
  const adapter = {
    observe: vi.fn(async (query?: (sql: string) => Promise<string>) => ({ ...observation(),
      ...(query ? { ledger: stagedLedger, catalogSha256: stagedCatalog } : {}) })),
    session: vi.fn(() => session),
    backup: vi.fn(async ({ snapshot }: { snapshot: string }) => { calls.push("backup"); return { snapshot, target, sha256: sha("4"), rolesSha256: sha("5"), fullArchiveDecoded: true }; }),
    reloadSchema: vi.fn(async () => { calls.push("reload"); }),
  };
  const journal = { read: vi.fn(async () => attempt), write: vi.fn(async (value: Record<string, unknown>, exclusive = false) => {
    if (exclusive && attempt) throw new Error("create-only attempt exists");
    attempt = structuredClone(value); calls.push(`journal:${value.status}`);
  }) };
  const assertBoundary = vi.fn(async () => { calls.push("boundary"); });
  const readMigrations = vi.fn(async () => [existing, migration]);
  const reviewSha256 = hash(JSON.stringify(review));
  const operationId = "12345678-1234-4123-8123-123456789abc";
  const engine = createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary });
  return { review, reviewSha256, operationId, engine, target, adapter, session, journal, assertBoundary, readMigrations, observation,
    live, previous, payload, existing, migration, calls, getAttempt: () => attempt };
}

describe("protected rollout CLI authority", () => {
  it("loads a copied private pinned review and rejects changed bytes without changing the approved pin", async () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "protected-pin-"));
    try {
      const review = fixture().review, reviewPath = join(root, "review.json"), modulePath = join(root, "prelaunch-web-deploy.mjs");
      const bytes = JSON.stringify(review);
      writeFileSync(reviewPath, bytes, { mode: 0o600 });
      const source = readFileSync(join(process.cwd(), "scripts/lib/prelaunch-web-deploy.mjs"), "utf8");
      const pattern = /export const PROTECTED_ROLLOUT_REVIEW_PIN = Object\.freeze\(\{[^}]*\}\);/u;
      expect(source.match(pattern)?.length).toBe(1);
      writeFileSync(modulePath, source.replace(pattern, `export const PROTECTED_ROLLOUT_REVIEW_PIN = Object.freeze(${JSON.stringify({ path: reviewPath, sha256: hash(bytes) })});`), { mode: 0o600 });
      const copied = await import(pathToFileURL(modulePath).href);
      expect(copied.loadProtectedRolloutReview(process.cwd())).toEqual(review);
      writeFileSync(reviewPath, JSON.stringify({ ...review, to: ref("d") }));
      expect(() => copied.loadProtectedRolloutReview(process.cwd())).toThrow("bytes");
      expect(PROTECTED_ROLLOUT_REVIEW_PIN).toEqual(approvedRolloutPin);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("denies an empty approval pin in the existing pnpm path before private state access", () => {
    const home = mkdtempSync(join(tmpdir(), "protected-cli-"));
    try {
      const checkout = join(home, "checkout");
      mkdirSync(join(checkout, "lib/server"), { recursive: true });
      cpSync(join(process.cwd(), "scripts"), join(checkout, "scripts"), { recursive: true });
      cpSync(join(process.cwd(), "lib/server/youtube-extraction-worker-timing.json"), join(checkout, "lib/server/youtube-extraction-worker-timing.json"));
      const modulePath = join(checkout, "scripts/lib/prelaunch-web-deploy.mjs");
      const source = readFileSync(modulePath, "utf8");
      const pattern = /export const PROTECTED_ROLLOUT_REVIEW_PIN = Object\.freeze\(\{[^}]*\}\);/u;
      expect(source.match(pattern)?.length).toBe(1);
      writeFileSync(modulePath, source.replace(pattern, "export const PROTECTED_ROLLOUT_REVIEW_PIN = Object.freeze({ path: null, sha256: null });"));
      const command = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).scripts["deploy:dev"];
      writeFileSync(join(checkout, "package.json"), JSON.stringify({ private: true, scripts: { "deploy:dev": command } }));
      const result = spawnSync("pnpm", ["deploy:dev", "--", "--reviewed-protected-rollout", "--protected-phase", "database",
        "--reviewed-ref", "b".repeat(40), "--db-config", "/private/not-a-real-config.env", "--test-script", "test:feedback-batch:web"], {
        // Shared, already installed dependencies are intentional in this fixture.
        // pnpm 11 otherwise attempts an unrelated install before invoking the CLI.
        cwd: checkout, encoding: "utf8", env: { ...process.env, HOME: home, HOMECOOK_DEPLOY_REPOSITORY: process.cwd(), pnpm_config_verify_deps_before_run: "false" },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("보호 전환 승인 핀이 비어");
      expect(existsSync(join(home, ".homecook"))).toBe(false);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
  it("keeps exact human-approved pins and rejects competing modes or write-ON options", () => {
    expect(PROTECTED_ROLLOUT_REVIEW_PIN).toEqual(approvedRolloutPin);
    expect(PROTECTED_WRITER_REVIEW_PIN).toEqual(approvedWriterPin);
    const args = ["--reviewed-protected-rollout", "--protected-phase", "database", "--reviewed-ref", ref("b"), "--db-config", "/private/no.env", "--test-script", "test:feedback-batch:web"];
    expect(parsePrelaunchOptions(args).reviewedProtectedRollout).toBe(true);
    for (const extra of [["--env-file", "/private/no.env"], ["--db-compatible"], ["--already-applied-db"], ["--skip-automated-tests"], ["--reviewed-r2-closed-maintenance"], ["--db-baseline", "/private/no.json"]]) {
      expect(() => parsePrelaunchOptions([...args, ...extra])).toThrow();
    }
    expect(parsePrelaunchOptions(args.map(value => value === "database" ? "writer-on" : value)).protectedPhase).toBe("writer-on");
    expect(() => parsePrelaunchOptions(["--protected-phase", "reader"])).toThrow();
  });
});

describe("separate writer authority and protected closed marker", () => {
  async function writerFixture() {
    const f = fixture(), databaseReceipt = await f.engine.apply();
    const reader = protectedRolloutReaderReceipt({ review: f.review, reviewSha256: f.reviewSha256, databaseReceipt,
      live: { ref: f.review.to, buildId: "reader-build", bytes: Buffer.from("reader plist") }, verifiedFlowsSha256: f.review.readerFlowsSha256 });
    const readerSha = hash(JSON.stringify(reader));
    const approval = { schema: "homecook.prelaunch-protected-writer-review.v1", rolloutReviewSha256: f.reviewSha256,
      releaseSha: f.review.to, databasePlanSha256: databaseReceipt.databasePlanSha256, readerReceiptSha256: readerSha, readerFlowsSha256: f.review.readerFlowsSha256, writerOn: true, safeOff: true };
    let enabled = false, staged = false, writerAttempt: Record<string, unknown> | null = null;
    const session = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("BEGIN")) staged = enabled;
      if (sql.startsWith("UPDATE private.recipe_product_only_write_control")) staged = sql.includes("SET enabled=true");
      if (sql === "COMMIT;") enabled = staged;
      if (sql === "ROLLBACK;") staged = enabled;
      return "";
    }), close: vi.fn(async () => {}), stop: vi.fn() };
    const adapter = { ...f.adapter, session: vi.fn(() => session), observe: vi.fn(async (query?: (sql: string) => Promise<string>) => ({ ...f.observation(), writerEnabled: query ? staged : enabled })) };
    const journal = { read: vi.fn(async () => writerAttempt), write: vi.fn(async (value: Record<string, unknown>) => { writerAttempt = structuredClone(value); }) };
    const input = { review: f.review, reviewSha256: f.reviewSha256, approval, approvalSha256: hash(JSON.stringify(approval)), readerReceipt: reader,
      readerReceiptSha256: readerSha, operationId: f.operationId, action: "writer-on", adapter, journal, assertBoundary: f.assertBoundary };
    return { ...f, databaseReceipt, reader, readerSha, approval, session, adapter, journal, input, getAttempt: () => writerAttempt };
  }
  it("requires the separate approved ON and exact ready reader; first DB approval never enables writes", async () => {
    const { input, approval, review, reviewSha256, adapter } = await writerFixture();
    expect(() => assertProtectedWriterReview({ ...approval, rolloutReviewSha256: sha("a") }, review, reviewSha256)).toThrow();
    expect(() => assertProtectedWriterReview({ ...approval, sql: "UPDATE arbitrary" }, review, reviewSha256)).toThrow();
    expect(() => createProtectedPrelaunchWriter({ ...input, readerReceiptSha256: sha("a") })).toThrow();
    expect(() => createProtectedPrelaunchWriter({ ...input, readerReceipt: { ...input.readerReceipt, readerFloor: review.from } })).toThrow();
    expect(adapter.session).not.toHaveBeenCalled();
    expect(review.approved.writerOn).toBe(false);
  });
  it("supports an explicit conditional ON approval for the fixed source/DB/flows without learning a live catalog", async () => {
    const { input, approval, review, reviewSha256 } = await writerFixture();
    const conditional = { ...approval, readerReceiptSha256: null };
    expect(() => assertProtectedWriterReview(conditional, review, reviewSha256)).not.toThrow();
    expect(() => createProtectedPrelaunchWriter({ ...input, approval: conditional })).not.toThrow();
    expect(() => createProtectedPrelaunchWriter({ ...input, approval: conditional, readerReceipt: { ...input.readerReceipt, verifiedFlowsSha256: sha("a") } })).toThrow();
  });
  it("executes only the fixed control transition and retains floor after safe OFF", async () => {
    const { input, session, journal, review } = await writerFixture();
    const on = await createProtectedPrelaunchWriter(input).apply();
    expect(on).toMatchObject({ writerEnabled: true, readerFloor: review.to, backwardCompatible: false });
    expect(session.query).toHaveBeenCalledWith("UPDATE private.recipe_product_only_write_control SET enabled=true WHERE singleton AND enabled=false;");
    journal.read.mockResolvedValue(null);
    const off = await createProtectedPrelaunchWriter({ ...input, action: "writer-off" }).apply();
    expect(off).toMatchObject({ writerEnabled: false, readerFloor: review.to, backwardCompatible: false });
    expect(session.query).toHaveBeenCalledWith("UPDATE private.recipe_product_only_write_control SET enabled=false WHERE singleton AND enabled=true;");
  });
  it("preserves an unknown ON floor and reconciles without sending a second UPDATE", async () => {
    const { input, session, getAttempt, review } = await writerFixture();
    const query = session.query.getMockImplementation()!;
    session.query.mockImplementation(async sql => { const result = await query(sql); if (sql === "COMMIT;") throw new Error("ack lost"); return result; });
    const engine = createProtectedPrelaunchWriter(input);
    await expect(engine.apply()).rejects.toMatchObject({ writerState: { unknown: true, readerFloor: review.to, automaticRetryAllowed: false } });
    expect(getAttempt()?.readerFloor).toBe(review.to);
    const writes = session.query.mock.calls.length;
    expect(await engine.reconcile()).toMatchObject({ status: "committed", writerEnabled: true, readerFloor: review.to });
    expect(session.query.mock.calls.length).toBe(writes);
  });
  it("records safe OFF after an unknown ON without claiming ON never committed or lowering floor", async () => {
    const { input, session, journal, readerSha, review } = await writerFixture();
    const query = session.query.getMockImplementation()!;
    session.query.mockImplementation(async sql => { const result = await query(sql); if (sql === "COMMIT;") throw new Error("ack lost"); return result; });
    const engine = createProtectedPrelaunchWriter(input);
    await expect(engine.apply()).rejects.toThrow();
    const onAttempt = await journal.read();
    const unknown = structuredClone(onAttempt);
    // A separately approved OFF has completed; retain the old unknown ON journal for reconciliation.
    session.query.mockImplementation(query);
    journal.read.mockResolvedValue(null);
    const off = await createProtectedPrelaunchWriter({ ...input, action: "writer-off" }).apply();
    journal.read.mockResolvedValue(unknown);
    expect(await engine.reconcile({ safeOffReceipt: { ...off, readerReceiptSha256: readerSha } })).toMatchObject({ status: "closed_after_unknown", writerEnabled: false, readerFloor: review.to });
  });
  it("binds the new DB and reader marker while preserving initial historical R2 authority", async () => {
    const { review, reviewSha256, databaseReceipt, reader, readerSha, previous } = await writerFixture();
    const databaseSha = hash(JSON.stringify(databaseReceipt));
    const closedReview = { pause: { sha256: sha("9") }, controlSha256: review.controlSha256, consentGeneration: 1, historicalReadiness: { sha256: sha("8") } };
    const marker = { schema: "homecook.prelaunch-closed-r2-state.v1", activationAuthorized: false, kind: "protected-reader", from: review.from, to: review.to,
      checkout: "/next", buildId: reader.buildId, targetPlistSha256: reader.plistSha256, previousCwd: "/previous", previousBuildId: review.predecessorBuildId,
      previousPlistSha256: review.predecessorPlistSha256, previousArtifactSha256: sha("a"), previousStateSha256: sha("b"), reviewSha256: CLOSED_R2_REVIEW_PIN.sha256,
      pauseReceiptSha256: closedReview.pause.sha256, controlSha256: closedReview.controlSha256, consentGeneration: 1,
      historicalReadinessSha256: closedReview.historicalReadiness.sha256, databasePlanSha256: databaseReceipt.databasePlanSha256,
      protectedRollout: { reviewSha256, databaseReceiptSha256: databaseSha, readerReceiptSha256: readerSha } };
    const markerSha256 = hash(JSON.stringify(marker));
    const state = { ref: marker.to, checkout: marker.checkout, buildId: marker.buildId, targetPlistHash: marker.targetPlistSha256,
      previousCwd: marker.previousCwd, previousBuildId: marker.previousBuildId, previousPlistHash: marker.previousPlistSha256, closedR2: { ...marker, artifactSha256: markerSha256 } };
    const input = { state, marker, markerSha256, live: { ref: marker.to, cwd: marker.checkout, buildId: marker.buildId, plistHash: marker.targetPlistSha256, plist: retargetPlist(previous, "/next") },
      closedReview, rollout: review, reviewSha256, databaseReceipt, databaseReceiptSha256: databaseSha, readerReceipt: reader, readerReceiptSha256: readerSha };
    expect(() => assertProtectedClosedR2Marker(input)).not.toThrow();
    expect(() => assertProtectedClosedR2Marker({ ...input, databaseReceipt: { ...databaseReceipt, catalogSha256: sha("a") } })).toThrow();
    expect(() => assertProtectedClosedR2Marker({ ...input, readerReceipt: { ...reader, readerFloor: review.from } })).toThrow();
    expect(() => assertProtectedClosedR2Marker({ ...input, live: { ...input.live, plist: { ...input.live.plist, EnvironmentVariables: { ...input.live.plist.EnvironmentVariables, MUMEOK_ROUND2_ENABLED: "true" } } } })).toThrow();
    expect(() => assertProtectedClosedR2Marker({ ...input, state: { ...state, closedR2: undefined } })).toThrow();
  });
  it("reports committed DB with reader pending and blocks normal inheritance until the real floor is ready", async () => {
    const { review, reviewSha256, databaseReceipt, reader } = await writerFixture();
    const input = { review, reviewSha256, guard: databaseReceipt, reader: null, writer: null, readerCompatible: false };
    expect(protectedRolloutStatus(input)).toMatchObject({ phase: "committed", appliedLedgerCount: review.database.after.length,
      databasePlanSha256: databaseReceipt.databasePlanSha256, readerPending: true, readerFloor: null, normalDeploymentAllowed: false });
    expect(protectedRolloutStatus({ ...input, reader, readerCompatible: true })).toMatchObject({ readerPending: false, readerFloor: review.to, normalDeploymentAllowed: true });
    expect(protectedRolloutStatus({ ...input, reader, readerCompatible: false })).toMatchObject({ readerPending: true, readerFloor: review.to, normalDeploymentAllowed: false });
    expect(protectedRolloutStatus({ ...input, guard: { ...databaseReceipt, status: "unknown" } })).toMatchObject({ appliedLedgerCount: null, databasePlanSha256: null, normalDeploymentAllowed: false });
    expect(protectedRolloutStatus({ ...input, reader, readerCompatible: true, writer: { status: "unknown", writerEnabled: true } })).toMatchObject({ recordedWriterEnabled: null, normalDeploymentAllowed: false });
    expect(protectedRolloutStatus({ ...input, reader, readerCompatible: true, writer: { status: "committed", writerEnabled: false } })).toMatchObject({ readerFloor: review.to, recordedWriterEnabled: false });
  });
});

describe("private durable attempt ownership", () => {
  it("preserves a not-applied receipt before an explicit same-review retry and refuses a modified predecessor", async () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "protected-journal-"));
    try {
      const first = join(root, "first"), next = join(root, "next");
      const { mkdirSync } = await import("node:fs"); mkdirSync(first, { mode: 0o700 }); mkdirSync(next, { mode: 0o700 });
      const guardPath = join(root, "guard.json"), firstId = "12345678-1234-4123-8123-123456789abc", nextId = "98765432-1234-4123-8123-123456789abc";
      const prior = { schema: "homecook.prelaunch-protected-db-attempt.v1", operationId: firstId, reviewSha256: sha("a"), from: ref("a"), to: ref("b"), status: "not_applied" };
      const one = createProtectedPrelaunchJournal({ repositoryRoot: process.cwd(), operationDirectory: first, guardPath, operationId: firstId });
      await one.write(prior, true);
      const previousNotAppliedSha256 = hash(readFileSync(guardPath));
      const retry = createProtectedPrelaunchJournal({ repositoryRoot: process.cwd(), operationDirectory: next, guardPath, operationId: nextId, previousNotAppliedSha256 });
      expect(await retry.read()).toBe(null);
      await retry.write({ ...prior, operationId: nextId, status: "applying_precommit" }, true);
      expect(JSON.parse(readFileSync(join(next, "previous-not-applied.json"), "utf8")).operationId).toBe(firstId);
      expect(JSON.parse(readFileSync(join(first, "receipt.json"), "utf8")).status).toBe("not_applied");
      const modified = createProtectedPrelaunchJournal({ repositoryRoot: process.cwd(), operationDirectory: first, guardPath, operationId: firstId, previousNotAppliedSha256 });
      await expect(modified.write(prior, true)).rejects.toThrow("predecessor");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("exact protected source, environment and reader floor", () => {
  it("allows first-reader compensation only under an actual OFF lock before floor publication, never over a foreign live", () => {
    const before = { ref: ref("a"), cwd: "/before", buildId: "before", bytes: Buffer.from("before") };
    const target = { ref: ref("b"), cwd: "/target", buildId: "target", plistSha256: hash("target") };
    const input = { before, target, actual: before, floorPublished: false, offLocked: true, closedPreviousPlistSha256: hash("before") };
    expect(() => assertProtectedReaderCompensation(input)).not.toThrow();
    expect(() => assertProtectedReaderCompensation({ ...input, floorPublished: true })).toThrow("floor");
    expect(() => assertProtectedReaderCompensation({ ...input, offLocked: false })).toThrow("OFF");
    expect(() => assertProtectedReaderCompensation({ ...input, actual: { ...before, ref: ref("c") } })).toThrow("다른 실제 웹");
  });
  it("accepts the exact approved source only, with no implicit protected path exemption", () => {
    const { review, live } = fixture();
    const input = { review, live, releaseSha: review.to, files: Object.keys(review.files), digests: review.files, closedArtifactSha256: review.closedArtifactSha256 };
    expect(() => assertProtectedRolloutSource(input)).not.toThrow();
    for (const change of [{ releaseSha: ref("d") }, { live: { ...live, ref: ref("d") } }, { live: { ...live, buildId: "foreign" } },
      { live: { ...live, bytes: Buffer.from("changed plist") } }, { closedArtifactSha256: sha("d") }, { files: [...input.files, "lib/auth/unapproved.ts"] },
      { digests: { ...review.files, "lib/supabase/fixture.ts": [sha("a"), sha("c")] } }]) {
      expect(() => assertProtectedRolloutSource({ ...input, ...change })).toThrow();
    }
    expect(() => assertProtectedRolloutReview({ ...review, allNewShapesOff: false })).toThrow("신형");
    expect(() => assertProtectedRolloutReview({ ...review, approved: { ...review.approved, writerOn: true } })).toThrow("ON");
    for (const path of ["app/api/v1/marketing/round2/route.ts", "lib/server/marketing-round2.ts", "lib/server/full-local-auth/scope.ts"]) {
      expect(() => assertProtectedRolloutReview({ ...review, files: { ...review.files, [path]: [sha("a"), sha("b")] } })).toThrow("runtime");
    }
  });
  it("checks the complete C03 candidate path fixture with only the two exact source exceptions", () => {
    const { review, live } = fixture();
    // Complete 87cd→1c676 candidate paths; byte hashes and authority are isolated fixture values.
    const paths = [
      "app/api/v1/cooking/sessions/route.ts", "app/api/v1/food-catalog/search/route.ts",
      "app/api/v1/recipes/[id]/cook-mode/route.ts", "app/api/v1/recipes/[id]/route.ts",
      "app/api/v1/recipes/pantry-match/route.ts", "app/api/v1/recipes/route.ts",
      "app/api/v1/shopping/lists/[list_id]/route.ts", "app/api/v1/shopping/lists/route.ts",
      "app/api/v1/users/me/route.ts", "components/auth/login-gate-modal.tsx",
      "components/cooking/consumed-ingredient-sheet.tsx", "components/cooking/cook-mode-step-model.ts",
      "components/cooking/cook-mode-whole-board.tsx", "components/recipe/manual-recipe-create-screen.tsx",
      "components/recipe/personal-recipe-editor-shell.tsx", "components/recipe/recipe-detail-personal-editor.tsx",
      "components/recipe/recipe-detail-screen.tsx", "components/recipe/recipe-food-catalog-picker.tsx",
      "components/recipe/recipe-future-impact-dialog.tsx", "components/recipe/recipe-ingredient-add-modal.tsx",
      "components/shopping/shopping-detail-screen.tsx", "docs/api문서-v1.2.43.md",
      "docs/db설계-v1.3.38.md", "docs/engineering/mumeok-beta-product-contract-20261014.md",
      "docs/security/recipe-product-source-function-postimages.json", "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.36.md", "docs/유저flow맵-v1.3.38.md",
      "docs/화면정의서-v1.5.40.md", "lib/api/food-catalog-search.ts",
      "lib/api/mypage.ts", "lib/auth/pending-action.ts",
      "lib/nutrition/product-quantity.ts", "lib/nutrition/recipe-nutrition-calculator.ts",
      "lib/recipe-detail.ts", "lib/recipe-editor-ingredients.ts",
      "lib/recipe-ingredient-source.ts", "lib/recipe-ingredient-units.ts",
      "lib/recipe.ts", "lib/server/account-generation/profile-subject.ts",
      "lib/server/cooked-batch-weight-estimate.ts", "lib/server/cooking.ts",
      "lib/server/food-catalog-pantry-source.ts", "lib/server/hybrid-auth/public-read-policy-runtime.mjs",
      "lib/server/meal-recipe-snapshot.ts", "lib/server/recipe-content-snapshot-future-propagation.ts",
      "lib/server/recipe-ingredient-search.ts", "lib/server/recipe-nutrition-service.ts",
      "lib/server/recipe-product-labels.ts", "lib/server/recipe-product-nutrition.ts",
      "lib/server/recipe-product-quantity.ts", "lib/server/recipe-snapshot-entrypoint.ts",
      "lib/server/youtube-import.ts", "scripts/lib/full-local-security-inventory.mjs",
      "stores/ui-store.ts", "supabase/migrations/20261013190000_recipe_product_only_identity.sql",
      "tests/08b-pantry-match.backend.test.ts", "tests/cook-session-start.backend.test.ts",
      "tests/cooked-batch-weight-estimate.test.ts", "tests/cooking-product-row-consumers.test.tsx",
      "tests/e2e/helpers/recipe-product-ui-fixture.ts", "tests/e2e/recipe-pantry-product-selection-local.spec.ts",
      "tests/e2e/recipe-product-ui-local.spec.ts", "tests/food-catalog-pantry-source-route.test.ts",
      "tests/food-catalog-pantry-source.test.ts", "tests/food-catalog-search-client.test.tsx",
      "tests/hybrid-public-read-policy.test.ts", "tests/meal-recipe-snapshot.test.ts",
      "tests/pending-action.test.ts", "tests/profile-subject-route.test.ts",
      "tests/profile-subject.test.ts", "tests/recipe-api-contracts.test.ts",
      "tests/recipe-detail-ingredient-edit.test.tsx", "tests/recipe-detail-personal-actions.test.tsx",
      "tests/recipe-detail-screen.test.tsx", "tests/recipe-editor-ingredients.test.ts",
      "tests/recipe-food-catalog-picker.test.tsx", "tests/recipe-future-impact-dialog.test.tsx",
      "tests/recipe-future-impact-flow.test.tsx", "tests/recipe-ingredient-search.test.ts",
      "tests/recipe-manual-product-selection.test.tsx", "tests/recipe-product-display.test.ts",
      "tests/recipe-product-only-contract.test.ts", "tests/recipe-product-only-postgres.integration.test.ts",
      "tests/recipe-product-quantity.test.ts", "tests/recipe-product-source-security-inventory.test.ts",
      "tests/recipe-public-product-boundary.test.ts", "tests/recipe-tags-search.test.ts",
      "tests/shopping-detail.backend.test.ts", "tests/shopping-preview.backend.test.ts",
      "tests/sql/recipe-product-only-fixture.sql", "tests/sql/recipe-product-only-verify.sql",
      "types/cooking.ts", "types/food-product.ts",
      "types/recipe.ts", "types/shopping.ts",
      "types/user.ts",
    ];
    expect(paths).toHaveLength(97);
    const files = Object.fromEntries(paths.map(path => [path, [path.startsWith("supabase/") ? null : sha("a"), sha("b")]]));
    const actual = { ...review, files };
    const input = { review: actual, live, releaseSha: actual.to, files: paths, digests: files, closedArtifactSha256: actual.closedArtifactSha256 };
    expect(() => assertProtectedRolloutSource(input)).not.toThrow();
    for (const path of ["scripts/lib/full-local-security-inventory.mjs", "lib/server/hybrid-auth/public-read-policy-runtime.mjs"]) {
      for (const pair of [[null, sha("b")], [sha("a"), null], ["not-a-sha", sha("b")]]) {
        expect(() => assertProtectedRolloutReview({ ...actual, files: { ...files, [path]: pair } })).toThrow();
      }
      expect(() => assertProtectedRolloutSource({ ...input, review: { ...actual, files: { ...files, [path]: [sha("a"), sha("c")] } } })).toThrow("전체 source");
    }
    for (const path of ["scripts/lib/full-local-security-inventory-other.mjs", "scripts/lib/sub/full-local-security-inventory.mjs",
      "scripts/deploy-prelaunch-web.mjs", "lib/server/hybrid-auth/public-read-policy-runtime-copy.mjs",
      "lib/server/hybrid-auth/session-authority.ts", "lib/server/full-local-auth/scope.ts", "lib/server/marketing-round2.ts",
      "app/api/v1/marketing/round2/route.ts"]) {
      expect(() => assertProtectedRolloutReview({ ...actual, files: { ...files, [path]: [sha("a"), sha("b")] } })).toThrow();
    }
    expect(() => assertProtectedRolloutReview({ ...actual, feature: "unapproved-feature" })).toThrow("source pair");
    const manifest = { scripts: { build: "next build" } };
    expect(() => classifyPrelaunchScope(["scripts/lib/full-local-security-inventory.mjs"], manifest, manifest)).toThrow("서버 구성");
  });
  it("preserves false flags, generation, original proofs and every runtime setting", () => {
    const { review, previous } = fixture();
    const after = retargetPlist(previous, "/next");
    const input = { review, before: previous, after, currentControlSha256: review.controlSha256, currentProofsSha256: review.historicalProofsSha256, currentGeneration: 1 };
    expect(() => assertProtectedRolloutEnvironment(input)).not.toThrow();
    for (const key of ["MUMEOK_ROUND2_ENABLED", "MUMEOK_ROUND2_LEADS_ENABLED", "MUMEOK_ROUND2_RELEASE_SHA", "MUMEOK_ROUND2_READINESS_PATH", "MUMEOK_ROUND2_CONTROL_PATH"]) {
      expect(() => assertProtectedRolloutEnvironment({ ...input, after: { ...after, EnvironmentVariables: { ...after.EnvironmentVariables, [key]: "changed" } } })).toThrow();
    }
    for (const change of [{ currentGeneration: 0 }, { currentGeneration: 2 }, { currentControlSha256: sha("a") }, { currentProofsSha256: sha("a") }]) {
      expect(() => assertProtectedRolloutEnvironment({ ...input, ...change })).toThrow();
    }
  });
  it("requires a bound DB commit and exact reader flows, then prohibits pre-reader rollback without using row counts", async () => {
    const { review, reviewSha256, engine } = fixture();
    const databaseReceipt = await engine.apply();
    const input = { review, reviewSha256, databaseReceipt, live: { ref: review.to, buildId: "reader-build", bytes: Buffer.from("reader plist") }, verifiedFlowsSha256: review.readerFlowsSha256 };
    const receipt = protectedRolloutReaderReceipt(input);
    expect(receipt).toMatchObject({ readerFloor: review.to, backwardCompatible: false });
    expect(() => protectedRolloutReaderReceipt({ ...input, live: { ...input.live, ref: review.from } })).toThrow();
    expect(() => protectedRolloutReaderReceipt({ ...input, verifiedFlowsSha256: sha("a") })).toThrow();
    expect(() => protectedRolloutReaderReceipt({ ...input, databaseReceipt: { ...databaseReceipt, databasePlanSha256: sha("a") } })).toThrow();
    expect(() => assertProtectedReaderRollback({ receipt, targetSha: review.from, isDescendant: false })).toThrow("reader floor");
    expect(() => assertProtectedReaderRollback({ receipt, targetSha: ref("c"), isDescendant: true })).not.toThrow();
  });
});

describe("protected DB atomic kernel with isolated adapter", () => {
  it("keeps the generic SQL scanner rejecting reviewed function SQL and allows only exact protected bytes", () => {
    const { review, existing, migration, payload } = fixture();
    expect(() => validatePrelaunchMigrationSql(payload)).toThrow("Only additive");
    expect(planProtectedPrelaunchMigrations(review, [existing, migration]).pending[0].payload).toBe(payload);
    expect(() => planProtectedPrelaunchMigrations(review, [existing, { ...migration, bytes: Buffer.from("foreign SQL") }])).toThrow("raw");
    expect(() => planProtectedPrelaunchMigrations({ ...review, database: { ...review.database, migrations: [{ ...review.database.migrations[0], payloadSha256: sha("a") }] } }, [existing, migration])).toThrow("payload");
    expect(() => planProtectedPrelaunchMigrations(review, [migration, existing])).toThrow("prefix");
    expect(() => planProtectedPrelaunchMigrations(review, [{ ...existing, sha256: sha("a") }, migration])).toThrow("prefix");
  });
  it.each(["COMMIT;", "ROLLBACK;", "\\gexec\n", "-- reviewed comment\nCOMMIT;", "SELECT 1;\n/* note */\nROLLBACK;",
    "SELECT 'SELECT 1' \\gexec", "SELECT 1 \\! echo LOCAL_PROBE_ONLY\n;", "/* nested /* inner */ comment */ BEGIN WORK;",
    "START /* comment */ TRANSACTION;", "END WORK;", "ABORT AND CHAIN;", "COMMIT AND CHAIN;", "ROLLBACK AND NO CHAIN;",
    "PREPARE TRANSACTION 'fixture';", "COMMIT PREPARED 'fixture';", "ROLLBACK PREPARED 'fixture';", "SAVEPOINT fixture;",
    "RELEASE SAVEPOINT fixture;", "ROLLBACK TO SAVEPOINT fixture;", "SET TRANSACTION READ WRITE;",
    "SET LOCAL STANDARD_CONFORMING_STRINGS=off;", "RESET STANDARD_CONFORMING_STRINGS;", "RESET ALL;",
    "SELECT pg_catalog.set_config /* operator dialect */ ('standard_conforming_strings','off',false);",
    "-- CR comment\rCOMMIT;", "SELECT 1; /* unterminated", "SELECT 'unterminated", "DO $fn$ unterminated"
  ])("rejects transaction/psql control even if its bytes were added to a proposed bundle: %s", payload => {
    const { review, existing, migration } = fixture();
    const bytes = Buffer.from(`begin;\n${payload}\ncommit;\n`);
    const changed = { ...migration, bytes, sha256: hash(bytes) };
    const proposed = { ...review, database: { ...review.database,
      after: [existing, { filename: changed.filename, sha256: changed.sha256 }],
      migrations: [{ filename: changed.filename, rawSha256: changed.sha256, payloadSha256: hash(payload) }] } };
    expect(() => planProtectedPrelaunchMigrations(proposed, [existing, changed])).toThrow("operator-owned");
  });
  it.each([String.raw`SELECT U&"fixture";`, String.raw`SELECT u&"fixture\006eame";`])("rejects unsupported Unicode quoted identifiers without interpreting their names", payload => {
    const { review, existing, migration } = fixture();
    const bytes = Buffer.from(`begin;\n${payload}\ncommit;\n`), changed = { ...migration, bytes, sha256: hash(bytes) };
    const proposed = { ...review, database: { ...review.database, after: [existing, { filename: changed.filename, sha256: changed.sha256 }],
      migrations: [{ filename: changed.filename, rawSha256: changed.sha256, payloadSha256: hash(payload) }] } };
    expect(() => planProtectedPrelaunchMigrations(proposed, [existing, changed])).toThrow("Unicode quoted identifiers are unsupported");
  });
  it.each([
    "-- BEGIN; COMMIT; \\gexec\nSELECT 1; /* ROLLBACK; */",
    "SELECT 'COMMIT; \\gexec', E'escaped\\\'COMMIT;', 'single''quote ROLLBACK;';",
    "CREATE FUNCTION public.fixture() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN RAISE NOTICE 'COMMIT; \\gexec'; END; $fn$;",
    "DO $$ BEGIN PERFORM 1; END; $$; SELECT \"COMMIT\" FROM (SELECT 1 AS \"COMMIT\") t;",
    "SELECT \"set_config\" FROM (SELECT 1 AS \"set_config\") t;",
    String.raw`SELECT U&'fixture\006eame', 'U&"fixture"'; /* U&"fixture" */ DO $$ BEGIN RAISE NOTICE 'U&"fixture"'; END; $$;`,
  ])("allows quoted/comment/dollar-body text without transaction false positives", payload => {
    const { review, existing, migration } = fixture();
    const bytes = Buffer.from(`begin;\n${payload}\ncommit;\n`), changed = { ...migration, bytes, sha256: hash(bytes) };
    const proposed = { ...review, database: { ...review.database, after: [existing, { filename: changed.filename, sha256: changed.sha256 }],
      migrations: [{ filename: changed.filename, rawSha256: changed.sha256, payloadSha256: hash(payload) }] } };
    expect(planProtectedPrelaunchMigrations(proposed, [existing, changed]).pending[0].payload).toBe(payload);
  });
  it("passes the reviewed attempt UUID through the real adapter reload and committed-reconcile contracts", async () => {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), "protected-reload-"));
    const sql: string[] = [], spawned = vi.fn();
    let reloadFailure = false;
    vi.doMock("../scripts/lib/local-supabase-isolated-runtime.mjs", () => ({ readPinnedLocalDockerTarget: () => ({ docker_host: "unix:///fixture-only.sock" }) }));
    vi.doMock("../scripts/lib/full-local-production-resources.mjs", async importOriginal => ({
      ...await importOriginal<typeof import("../scripts/lib/full-local-production-resources.mjs")>(),
      selectFullLocalProductionResources: () => ({ postgresContainerId: "owned-unit", postgresImage: "fixture-image", postgresVolumeName: "homecook-full-local-postgres" }),
    }));
    vi.doMock("node:child_process", async importOriginal => ({
      ...await importOriginal<typeof import("node:child_process")>(),
      spawnSync: (command: string, args: string[]) => {
        if (command !== "docker") throw new Error("Fixture rejects non-Docker dispatch");
        const output = args[0] === "ps" ? "owned-unit" : args[0] === "inspect"
          ? [{ Id: "owned-unit", Image: "fixture-image-id", Mounts: [{ Destination: "/var/lib/postgresql/data", Type: "volume", Name: "homecook-full-local-postgres", RW: true }] }]
          : args[0] === "volume" ? [{ Name: "homecook-full-local-postgres", Labels: {} }]
          : args[0] === "image" ? [{ Id: "fixture-image-id" }] : args[0] === "exec" ? { systemIdentifier: "fixture-only" } : null;
        if (output === null) throw new Error("Fixture rejects unexpected Docker operation");
        return { status: 0, stdout: typeof output === "string" ? output : JSON.stringify(output) };
      },
      spawn: (command: string, args: string[]) => {
        spawned(command, args);
        const child = new EventEmitter(), stdout = new PassThrough(), stderr = new PassThrough();
        return Object.assign(child, { stdout, stderr, kill: () => child.emit("close", 0), stdin: {
          write(input: string, callback?: (error?: Error) => void) {
            sql.push(input);
            const marker = /SELECT '(r2_[a-f0-9]+)';/u.exec(input)?.[1];
            if (!marker) throw new Error("Fixture query marker missing");
            queueMicrotask(() => { if (reloadFailure) child.emit("close", 1); else stdout.write(`${marker}\n`); }); callback?.();
          },
          end() { queueMicrotask(() => child.emit("close", 0)); },
        } });
      },
    }));
    vi.resetModules();
    try {
      const configPath = join(directory, "config.env");
      writeFileSync(configPath, "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-full-local-isolated\nFULL_LOCAL_POSTGRES_VOLUME_NAME=homecook-full-local-postgres\n", { mode: 0o600 });
      const { createRecordingDockerAdapter } = await import("../scripts/lib/marketing-round2-controlled-deploy.mjs");
      const actual = await createRecordingDockerAdapter({ configPath, backupDirectory: directory });
      await actual.inspect();
      await expect(actual.reloadSchema(undefined)).rejects.toThrow("Invalid reload operation");
      expect(spawned).not.toHaveBeenCalled();
      const input = fixture(), reload = vi.spyOn(actual, "reloadSchema");
      const engineFor = (value: ReturnType<typeof fixture>) => createProtectedPrelaunchDatabaseEngine({ review: value.review, reviewSha256: value.reviewSha256,
        operationId: value.operationId, readMigrations: value.readMigrations, adapter: { ...value.adapter, reloadSchema: actual.reloadSchema },
        journal: value.journal, assertBoundary: value.assertBoundary });
      const unapplied = fixture(), unappliedEngine = engineFor(unapplied);
      unapplied.adapter.backup.mockRejectedValueOnce(new Error("fixture backup unavailable"));
      await expect(unappliedEngine.apply()).rejects.toThrow("fixture backup unavailable");
      expect(await unappliedEngine.reconcile()).toMatchObject({ status: "not_applied" });
      expect(reload).not.toHaveBeenCalled(); expect(sql).toHaveLength(0);
      const engine = engineFor(input);
      expect(await engine.apply()).toMatchObject({ status: "committed" });
      expect(reload).toHaveBeenCalledWith(input.operationId);
      expect(spawned).toHaveBeenCalledWith("docker", expect.arrayContaining([`PGAPPNAME=r2-reload-${input.operationId}`, "owned-unit"]));
      expect(sql).toHaveLength(1);
      expect(sql[0]).toContain("NOTIFY pgrst, 'reload schema'; COMMIT;");
      const recovery = fixture();
      const recoveringEngine = engineFor(recovery);
      reload.mockClear(); reloadFailure = true;
      await expect(recoveringEngine.apply()).rejects.toThrow("Committed DB retained; schema reload requires verification");
      const unknown = structuredClone(recovery.getAttempt());
      expect(unknown?.status).toBe("unknown");
      const observe = recovery.adapter.observe.getMockImplementation()!;
      for (const change of [{ active: true }, { target: { ...recovery.target, postgresContainerId: "foreign-fixture" } },
        { ledger: recovery.review.database.before }, { catalogSha256: sha("f") }]) {
        recovery.adapter.observe.mockResolvedValue({ ...recovery.observation(), ...change });
        await expect(recoveringEngine.reconcile()).rejects.toThrow("remains unknown");
        expect(reload).toHaveBeenCalledTimes(1); expect(recovery.getAttempt()).toEqual(unknown);
      }
      recovery.adapter.observe.mockImplementation(observe);
      await expect(recoveringEngine.reconcile()).rejects.toThrow("Committed DB retained; schema reload requires verification");
      expect(recovery.getAttempt()).toEqual(unknown);
      reloadFailure = false;
      expect(await recoveringEngine.reconcile()).toMatchObject({ status: "committed", writerEnabled: false, readerReady: false });
      expect(reload.mock.calls).toEqual([[recovery.operationId], [recovery.operationId], [recovery.operationId]]);
      expect(recovery.calls.filter(call => call === recovery.payload)).toHaveLength(1);
      expect(recovery.calls.filter(call => call.startsWith("INSERT INTO homecook_deploy"))).toHaveLength(1);
      expect(recovery.calls.filter(call => call === "COMMIT;")).toHaveLength(1);
      expect(recovery.adapter.backup).toHaveBeenCalledTimes(1);
      expect(sql).toHaveLength(4); // All NOTIFY requests use only the mocked transport.

    } finally {
      vi.doUnmock("node:child_process");
      vi.doUnmock("../scripts/lib/local-supabase-isolated-runtime.mjs");
      vi.doUnmock("../scripts/lib/full-local-production-resources.mjs");
      vi.resetModules(); rmSync(directory, { recursive: true, force: true });
    }
  });
  it("plans without backup/writes and applies SQL+ledger atomically after the full snapshot", async () => {
    const { engine, adapter, calls, payload, journal, review } = fixture();
    expect(await engine.plan()).toMatchObject({ mutationPerformed: false, pending: [review.database.migrations[0].filename] });
    expect(adapter.backup).not.toHaveBeenCalled(); expect(journal.write).not.toHaveBeenCalled();
    const receipt = await engine.apply();
    expect(receipt).toMatchObject({ status: "committed", writerEnabled: false, readerReady: false, backwardCompatible: false });
    expect(calls.indexOf("backup")).toBeLessThan(calls.indexOf(payload));
    expect(calls.findIndex(call => call.startsWith("INSERT INTO homecook_deploy"))).toBeGreaterThan(calls.indexOf(payload));
    expect(calls.indexOf("journal:commit_dispatch_guard")).toBeLessThan(calls.indexOf("COMMIT;"));
    expect(calls.indexOf("COMMIT;")).toBeLessThan(calls.indexOf("reload"));
    const backupCalls = adapter.backup.mock.calls.length;
    await expect(engine.apply()).rejects.toThrow("retry");
    expect(adapter.backup.mock.calls.length).toBe(backupCalls);
  });
  it.each(["target", "ledger", "catalog", "immutable", "writer", "active"] as const)("rejects a changed %s before backup or session creation", async (change) => {
    const { engine, adapter, observation } = fixture();
    const before = observation();
    const changes = { target: { target: { ...before.target, systemIdentifier: "foreign" } }, ledger: { ledger: [] }, catalog: { catalogSha256: sha("a") },
      immutable: { immutableSha256: sha("a") }, writer: { writerEnabled: true }, active: { active: true } };
    adapter.observe.mockResolvedValue({ ...before, ...changes[change] });
    await expect(engine.apply()).rejects.toThrow("observation");
    expect(adapter.session).not.toHaveBeenCalled(); expect(adapter.backup).not.toHaveBeenCalled();
  });
  it("rolls back confirmed pre-commit failures and never switches or downgrades a web", async () => {
    const { engine, adapter, getAttempt, session } = fixture();
    adapter.backup.mockRejectedValueOnce(new Error("backup failed"));
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { changed: false, outcome: "rolled_back_before_commit", automaticRetryAllowed: false } });
    expect(session.query).toHaveBeenCalledWith("ROLLBACK;");
    expect(getAttempt()?.status).toBe("rolled_back_before_commit");
    expect(adapter.reloadSchema).not.toHaveBeenCalled();
  });
  it("retains an unknown guard after lost COMMIT acknowledgement and reconciles with no second apply", async () => {
    const { engine, session, adapter, getAttempt } = fixture();
    const query = session.query.getMockImplementation()!;
    session.query.mockImplementation(async sql => { const result = await query(sql); if (sql === "COMMIT;") throw new Error("ack lost"); return result; });
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { changed: true, outcome: "unknown", automaticRetryAllowed: false } });
    expect(getAttempt()?.status).toBe("unknown"); expect(session.query).not.toHaveBeenCalledWith("ROLLBACK;");
    const queries = session.query.mock.calls.length, backups = adapter.backup.mock.calls.length;
    expect(await engine.reconcile()).toMatchObject({ status: "committed", writerEnabled: false });
    expect(session.query.mock.calls.length).toBe(queries); expect(adapter.backup.mock.calls.length).toBe(backups);
  });
  it("keeps mixed postimage and a still-active session unknown without changing the journal", async () => {
    const { engine, adapter, observation, session, getAttempt } = fixture();
    session.query.mockImplementation(async sql => { if (sql.startsWith("BEGIN") || sql === "ROLLBACK;") throw new Error("connection unknown"); return ""; });
    await expect(engine.apply()).rejects.toThrow();
    const before = structuredClone(getAttempt());
    adapter.observe.mockResolvedValue({ ...observation(), active: true });
    await expect(engine.reconcile()).rejects.toThrow("remains unknown");
    expect(getAttempt()).toEqual(before);
    adapter.observe.mockResolvedValue({ ...observation(), catalogSha256: sha("f") });
    await expect(engine.reconcile()).rejects.toThrow("remains unknown");
    expect(getAttempt()).toEqual(before);
    expect(adapter.reloadSchema).not.toHaveBeenCalled();
  });
  it("does not learn a postimage from the mutated caller review or observed live catalog", async () => {
    const { engine, review, session, observation } = fixture();
    review.database.afterCatalogSha256 = sha("a");
    await expect(engine.apply()).rejects.toThrow("observation");
    expect(session.query).toHaveBeenCalledWith("ROLLBACK;");
    expect(observation().ledger).toEqual(review.database.before);
  });
  it("rejects a snapshot backup with missing roles/full archive evidence before any SQL payload", async () => {
    const { engine, adapter, calls, payload, target } = fixture();
    adapter.backup.mockResolvedValueOnce({ snapshot: "00000003-00000004-1", target, sha256: sha("4"), rolesSha256: "", fullArchiveDecoded: false });
    await expect(engine.apply()).rejects.toThrow("backup evidence");
    expect(calls).not.toContain(payload);
    expect(calls).toContain("ROLLBACK;");
  });
  it("keeps the ledger at the original prefix after a payload/ledger transaction failure", async () => {
    const { engine, session, observation, review } = fixture();
    const query = session.query.getMockImplementation()!;
    session.query.mockImplementation(async sql => { if (sql.startsWith("INSERT INTO")) throw new Error("ledger rejected"); return query(sql); });
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { outcome: "rolled_back_before_commit" } });
    expect(observation().ledger).toEqual(review.database.before);
    expect(session.query).not.toHaveBeenCalledWith("COMMIT;");
  });
  it("denies a foreign reconcile operation before reading the DB again", async () => {
    const { engine, session, journal, adapter, getAttempt } = fixture();
    session.query.mockImplementation(async () => { throw new Error("unknown connection"); });
    await expect(engine.apply()).rejects.toThrow();
    await journal.write({ ...getAttempt(), operationId: "98765432-1234-4123-8123-123456789abc" });
    const observations = adapter.observe.mock.calls.length;
    await expect(engine.reconcile()).rejects.toThrow("binding");
    expect(adapter.observe.mock.calls.length).toBe(observations);
    expect(adapter.reloadSchema).not.toHaveBeenCalled();
  });
  it("classifies a confirmed unapplied image without allowing an automatic retry", async () => {
    const { engine, adapter } = fixture();
    adapter.backup.mockRejectedValueOnce(new Error("backup failed"));
    await expect(engine.apply()).rejects.toThrow();
    expect(await engine.reconcile()).toMatchObject({ status: "not_applied", automaticRetryAllowed: false });
    expect(adapter.reloadSchema).not.toHaveBeenCalled();
    await expect(engine.apply()).rejects.toThrow("retry");
  });
  it("does not adopt nullable-only OFF evidence or guess an approval for writer ON", () => {
    const { review, reviewSha256, operationId, adapter, journal, assertBoundary, readMigrations } = fixture();
    for (const change of [{ allNewShapesOff: false }, { legacyReaderCompatible: false }, { approved: { ...review.approved, writerOn: true } }]) {
      expect(() => createProtectedPrelaunchDatabaseEngine({ review: { ...review, ...change }, reviewSha256, operationId, adapter, journal, assertBoundary, readMigrations })).toThrow("evidence");
    }
    expect(adapter.observe).not.toHaveBeenCalled();
  });
  it("detects boundary changes during backup before executing SQL", async () => {
    const { engine, assertBoundary, calls, payload } = fixture();
    assertBoundary.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("live changed"));
    await expect(engine.apply()).rejects.toThrow("live changed");
    expect(calls).not.toContain(payload);
    expect(calls).toContain("ROLLBACK;");
  });
});
