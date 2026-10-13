import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRound2FileStorage } from "@/lib/server/marketing-round2-storage";
import { createMarketingRound2Handler, type Round2HandlerConfig } from "@/lib/server/marketing-round2";
import { createPrelaunchDatabaseEngine } from "../scripts/lib/prelaunch-database.mjs";
import {
  acquireClosedR2ControlLease, assertClosedR2CompensationTarget, assertClosedR2ContinuationOptions, assertClosedR2Database, assertClosedR2Environment, assertClosedR2LiveMarker, assertClosedR2LiveUnchanged, assertClosedR2MaintenanceFence, assertClosedR2PredecessorState,
  assertClosedR2Retry, assertClosedR2Review, assertClosedR2Rollback, assertRound2InheritanceBoundaries,
  assertClosedR2Source, closedR2RollbackPlist, deployTransaction, loadClosedR2Review, parsePrelaunchOptions, prelaunchVerificationEnvironment, retargetPlist, verifyClosedR2Control,
} from "../scripts/lib/prelaunch-web-deploy.mjs";

const roots: string[] = [];
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repository = process.cwd();
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "closed-r2-fixture-"));
  roots.push(root);
  const controlPath = join(root, "control.json"), readinessPath = join(root, "historical-readiness.json"), receiptPath = join(root, "pause.json");
  const control = { version: 1, collection_enabled: false, lead_enabled: false, consent_generation: 1 };
  const bytes = JSON.stringify(control);
  writeFileSync(controlPath, bytes, { mode: 0o600 });
  const proofNames = ["turnstile_live", "db_migration", "db_authority", "privacy_consent", "retention_runbook", "operator_approval"];
  const proxyNames = ["direct_access_denial", "header_overwrite", "launch_binding"];
  const pointers: Record<string, { path: string; sha256: string }> = {};
  for (const name of [...proofNames, ...proxyNames]) {
    const path = join(root, `${name}.json`), value = JSON.stringify({ name, historical: true });
    writeFileSync(path, value, { mode: 0o600 }); pointers[name] = { path, sha256: hash(value) };
  }
  writeFileSync(readinessPath, JSON.stringify({ version: 1, release_sha: "a".repeat(40), historical: true,
    proofs: Object.fromEntries(proofNames.map(name => [name, pointers[name]])), proxy: Object.fromEntries(proxyNames.map(name => [name, pointers[name]])) }), { mode: 0o600 });
  writeFileSync(receiptPath, JSON.stringify({ approvedAction: "pause collection and leads only; no automatic reactivation", target: controlPath,
    after: control, afterSha256: hash(bytes), databaseWrites: 0, serviceRestarts: 0, credentialChanges: 0, consentGenerationChanged: false }), { mode: 0o600 });
  const previous = { Label: "com.homecook.production", WorkingDirectory: "/previous", ProgramArguments: ["/node", "/previous/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
    EnvironmentVariables: { NODE_ENV: "production", MUMEOK_ROUND2_PROFILE: "production", MUMEOK_ROUND2_ENABLED: "true", MUMEOK_ROUND2_LEADS_ENABLED: "true",
      MUMEOK_ROUND2_CONTROL_PATH: controlPath, MUMEOK_ROUND2_READINESS_PATH: readinessPath, MUMEOK_ROUND2_RELEASE_SHA: "a".repeat(40), MUMEOK_ROUND2_REPOSITORY_ROOT: "/previous", DATA_SUPABASE_URL: "http://127.0.0.1:54321" } };
  const patch = { MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false" };
  const envBytes = "MUMEOK_ROUND2_ENABLED=false\nMUMEOK_ROUND2_LEADS_ENABLED=false\n";
  const originalBytes = Buffer.from(JSON.stringify(previous));
  const source = [{ filename: "20261013010000_fixture.sql", sha256: hash("fixture SQL") }];
  const databasePlan = { baselineRequired: false, pending: [], source, applied: source };
  const review = { schema: "homecook.prelaunch-closed-r2-review.v1", testScript: "test:product", from: "a".repeat(40), to: "b".repeat(40), predecessorBuildId: "old-build", predecessorPlistSha256: hash(originalBytes),
    files: { "app/privacy/page.tsx": [hash("old privacy"), hash("approved privacy")], "app/page.tsx": [hash("old home entry"), hash("explicit disabled home entry")],
      "components/home/home-screen.tsx": [hash("old R2 banners"), hash("hide explicit disabled banners")] }, pause: { path: receiptPath, sha256: hash(readFileSync(receiptPath)) },
    controlPath, controlSha256: hash(bytes), consentGeneration: 1, envPatchSha256: hash(envBytes), databasePlanSha256: hash(JSON.stringify({ source, applied: source })), historicalReadiness: { path: readinessPath, sha256: hash(readFileSync(readinessPath)) } };
  const next = retargetPlist(closedR2RollbackPlist(previous), "/next");
  return { root, previous, next, patch, originalBytes, review, control, controlPath, pointers, envBytes, databasePlan };
}

describe("closed R2 F01 review boundary", () => {
  it("keeps the actual production pin empty and unusable", () => {
    expect(() => loadClosedR2Review(repository)).toThrow("검토 핀이 비어");
    const run = spawnSync(process.execPath, ["scripts/deploy-prelaunch-web.mjs", "plan", "--", "--reviewed-r2-closed-maintenance", "--reviewed-ref", "b".repeat(40),
      "--env-file", "/private/never-read.env", "--test-script", "test:product", "--already-applied-db", "--db-config", "/private/never-read-db.env"], { cwd: repository, encoding: "utf8", env: prelaunchVerificationEnvironment("test", process.env) });
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("검토 핀이 비어");
  });
  it("requires exact closed source/env/test and read-only DB arguments without other readiness modes", () => {
    const args = ["--reviewed-r2-closed-maintenance", "--reviewed-ref", "b".repeat(40), "--env-file", "/private/false-only.env", "--test-script", "test:product", "--already-applied-db", "--db-config", "/private/readonly.env"];
    expect(parsePrelaunchOptions(args).reviewedClosedR2Maintenance).toBe(true);
    for (const extra of [["--db-config", "/private/db"], ["--skip-automated-tests"], ["--verify-script", "verify:other"], ["--reviewed-feedback-readiness", "--already-applied-db", "--db-config", "/private/db"]]) {
      expect(() => parsePrelaunchOptions([...args, ...extra])).toThrow();
    }
    expect(() => parsePrelaunchOptions(["--reviewed-r2-closed-maintenance"])).toThrow("정확한");
  });
  it("accepts only the exact privacy/home byte diff and final source/plist pair", () => {
    const { review } = fixture();
    const input = { review, liveSha: review.from, releaseSha: review.to, files: Object.keys(review.files), digests: review.files, predecessorPlistSha256: review.predecessorPlistSha256, predecessorBuildId: review.predecessorBuildId };
    expect(() => assertClosedR2Source(input)).not.toThrow();
    expect(() => assertClosedR2Source({ ...input, liveSha: "c".repeat(40) })).toThrow("source");
    expect(() => assertClosedR2Source({ ...input, predecessorPlistSha256: hash("other plist") })).toThrow("source");
    expect(() => assertClosedR2Source({ ...input, digests: { "app/privacy/page.tsx": [hash("old privacy"), hash("unreviewed")] } })).toThrow("byte");
    expect(() => assertClosedR2Source({ ...input, files: [...input.files, "app/privacy/other.tsx"] })).toThrow("파일");
    expect(() => assertClosedR2Review({ ...review, files: { ...review.files, "lib/server/marketing-round2.ts": [hash("old"), hash("new")] } })).toThrow("F01");
  });
  it("limits initial F01 to the twelve exact reviewed paths and requires all three existing product byte pairs", () => {
    const { review } = fixture();
    const paths = ["app/privacy/page.tsx", "app/page.tsx", "components/home/home-screen.tsx", "tests/home-screen.test.tsx", "tests/launch-readiness-legal-seo.test.tsx",
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md", "docs/요구사항기준선-v1.7.36.md", "docs/화면정의서-v1.5.40.md", "docs/engineering/gabia-direct-domain-20261012.md",
      "docs/engineering/mumeok-beta-f01-privacy-reconciliation-20261013.md", "docs/engineering/mumeok-beta-v9-progress-20261013.md", "docs/유저flow맵-v1.3.38.md"];
    const files = Object.fromEntries(paths.map(path => [path, [hash(`before ${path}`), hash(`reviewed ${path}`)]]));
    expect(() => assertClosedR2Review({ ...review, files })).not.toThrow();
    for (const path of ["app/privacy/page.tsx", "app/page.tsx", "components/home/home-screen.tsx"]) {
      const missing = { ...files }; delete missing[path];
      expect(() => assertClosedR2Review({ ...review, files: missing })).toThrow("F01");
      expect(() => assertClosedR2Review({ ...review, files: { ...files, [path]: [files[path][0], null] } })).toThrow("삭제");
    }
    for (const path of ["app/privacy/other.tsx", "components/home/home-shell.tsx", "tests/home-banner.test.tsx", "app/layout.tsx", "components/marketing/recording-landing.tsx",
      "docs/engineering/unreviewed.md", "docs/유저flow맵-v1.3.39.md"]) {
      expect(() => assertClosedR2Review({ ...review, files: { ...files, [path]: [hash("old"), hash("new")] } })).toThrow("F01");
    }
  });
  it("allows only the two false flags and preserves every original active binding", () => {
    const { review, previous, next, patch } = fixture();
    const input = { review, previous, next, patch, envPatchSha256: review.envPatchSha256 };
    expect(() => assertClosedR2Environment(input)).not.toThrow();
    expect(next.EnvironmentVariables.MUMEOK_ROUND2_REPOSITORY_ROOT).toBe(previous.WorkingDirectory);
    for (const key of ["MUMEOK_ROUND2_ENABLED", "MUMEOK_ROUND2_LEADS_ENABLED", "DATA_SUPABASE_URL", "MUMEOK_ROUND2_REPOSITORY_ROOT"]) {
      expect(() => assertClosedR2Environment({ ...input, next: { ...next, EnvironmentVariables: { ...next.EnvironmentVariables, [key]: "changed" } } })).toThrow("환경");
    }
    expect(() => assertClosedR2Environment({ ...input, patch: { ...patch, MUMEOK_ROUND2_CONTROL_PATH: "/other" } })).toThrow("두 기존");
    expect(() => assertClosedR2Environment({ ...input, patch: { ...patch, MUMEOK_ROUND2_ENABLED: "true" } })).toThrow("false");
  });
  it("rereads actual source/build/plist before swap rather than relying on an earlier clean checkout", () => {
    const live = { ref: "a".repeat(40), cwd: "/fixture", buildId: "fixture-build", bytes: Buffer.from("fixture plist") };
    expect(() => assertClosedR2LiveUnchanged(live, { ...live })).not.toThrow();
    for (const field of ["ref", "cwd", "buildId"]) expect(() => assertClosedR2LiveUnchanged(live, { ...live, [field]: "changed" })).toThrow("실제 웹");
    expect(() => assertClosedR2LiveUnchanged(live, { ...live, bytes: Buffer.from("changed plist") })).toThrow("실제 웹");
  });
  it.each(["deploy", "rollback"])("leaves a foreign live web untouched when %s activation guard rejects before switch", async mode => {
    const predecessor = { ref: "a".repeat(40), cwd: "/before", buildId: "before-build", bytes: Buffer.from("before plist") };
    const candidate = { ref: "b".repeat(40), cwd: "/prepared", buildId: "prepared-build", bytes: Buffer.from("prepared plist") };
    const before = mode === "deploy" ? predecessor : candidate, prepared = mode === "deploy" ? candidate : predecessor;
    const target = { ...prepared, plistSha256: hash(prepared.bytes) };
    const foreign = { ref: "c".repeat(40), cwd: "/foreign", buildId: "foreign-build", bytes: Buffer.from("foreign plist") };
    let actual = before;
    const switchWeb = vi.fn();
    await expect(deployTransaction({
      prepare: async () => { actual = foreign; },
      activate: async () => { assertClosedR2LiveUnchanged(before, actual); switchWeb(mode); },
      verify: async () => {},
      restore: async () => { assertClosedR2CompensationTarget({ actual, before, target, closedPreviousPlistSha256: hash("closed before plist") }); switchWeb("restore"); },
      verifyRestored: async () => {},
    })).rejects.toThrow();
    expect(switchWeb).not.toHaveBeenCalled();
    expect(actual).toBe(foreign);
    expect(() => assertClosedR2CompensationTarget({ actual: prepared, before, target, closedPreviousPlistSha256: hash("closed before plist") })).not.toThrow();
    expect(() => assertClosedR2CompensationTarget({ actual: before, before, target, closedPreviousPlistSha256: hash("closed before plist") })).not.toThrow();
    const closed = { ...before, bytes: Buffer.from("closed before plist") };
    expect(() => assertClosedR2CompensationTarget({ actual: closed, before, target, closedPreviousPlistSha256: hash(closed.bytes) })).not.toThrow();
  });
  it("verifies approved false/false generation without rewriting control or history", () => {
    const { review, controlPath, control } = fixture();
    const before = readFileSync(controlPath);
    expect(verifyClosedR2Control(review, repository)).toEqual(control);
    expect(readFileSync(controlPath)).toEqual(before);
    for (const field of ["collection_enabled", "lead_enabled", "consent_generation"]) {
      writeFileSync(controlPath, JSON.stringify({ ...control, [field]: field === "consent_generation" ? 0 : true }), { mode: 0o600 });
      expect(() => verifyClosedR2Control(review, repository)).toThrow("generation");
    }
  });
  it("rejects a symlink, loose mode or altered receipt/history", () => {
    const { review, root, controlPath } = fixture();
    const linked = join(root, "linked.json"); symlinkSync(controlPath, linked);
    expect(() => verifyClosedR2Control({ ...review, controlPath: linked }, repository)).toThrow();
    chmodSync(controlPath, 0o644);
    expect(() => verifyClosedR2Control(review, repository)).toThrow("권한");
    chmodSync(controlPath, 0o600);
    writeFileSync(review.pause.path, JSON.stringify({ passed: true }), { mode: 0o600 });
    expect(() => verifyClosedR2Control(review, repository)).toThrow("receipt");
    const other = fixture();
    writeFileSync(other.review.historicalReadiness.path, "{}", { mode: 0o600 });
    expect(() => verifyClosedR2Control(other.review, repository)).toThrow("readiness");
  });
  it("pins all six historical proof bytes and three proxy proof bytes", () => {
    const f = fixture();
    for (const pointer of Object.values(f.pointers)) {
      const original = readFileSync(pointer.path);
      writeFileSync(pointer.path, "altered proof", { mode: 0o600 });
      expect(() => verifyClosedR2Control(f.review, repository)).toThrow("proof bytes");
      writeFileSync(pointer.path, original, { mode: 0o600 });
    }
  });
});

describe("existing control lease interoperability", () => {
  it("excludes the actual runtime writer using the same lock and never writes control", async () => {
    const { review, controlPath, root } = fixture();
    const storage = createRound2FileStorage({ repositoryRoot: repository, controlPath, rateStateDir: root, rateSecret: "fixture-only-rate-secret-32-characters" });
    const before = readFileSync(controlPath);
    const lease = await acquireClosedR2ControlLease(review, repository);
    expect(readFileSync(join(`${controlPath}.lock`, "owner"), "utf8")).toMatch(/^[a-f0-9]{64}$/);
    await expect(storage.acquireControlLease()).rejects.toThrow();
    expect(lease.verify().consent_generation).toBe(1);
    await lease.release();
    expect(existsSync(`${controlPath}.lock`)).toBe(false);
    expect(readFileSync(controlPath)).toEqual(before);
    const writer = await storage.acquireControlLease();
    await expect(acquireClosedR2ControlLease(review, repository)).rejects.toThrow();
    await writer.release();
  });
  it("does not release a changed owner or take over an existing lock", async () => {
    const { review, controlPath } = fixture();
    const lease = await acquireClosedR2ControlLease(review, repository);
    writeFileSync(join(`${controlPath}.lock`, "owner"), "c".repeat(64), { mode: 0o600 });
    await expect(lease.release()).rejects.toThrow("다른 control lease");
    expect(existsSync(`${controlPath}.lock`)).toBe(true);
    await expect(acquireClosedR2ControlLease(review, repository)).rejects.toThrow();
  });
});

describe("closed continuation uses existing boundaries and read-only database verification", () => {
  it("allows ordinary reviewed web updates but rejects protected/SQL/environment changes", () => {
    const f = fixture(), previous = closedR2RollbackPlist(f.previous), next = retargetPlist(previous, "/next");
    const options = { refOption: "--reviewed-ref", ref: "c".repeat(40), alreadyAppliedDb: true, dbConfig: "/private/readonly.env" };
    expect(() => assertClosedR2ContinuationOptions(options)).not.toThrow();
    expect(() => assertRound2InheritanceBoundaries({ previous, next, files: ["components/recipes/recipe-detail.tsx", "lib/auth/pending-action.ts", "app/api/v1/recipes/[id]/route.ts"] })).not.toThrow();
    for (const file of ["app/privacy/page.tsx", "lib/server/marketing-round2.ts", "lib/server/full-local-auth/runtime.ts", "supabase/migrations/20261013000000_new.sql", "infra/worker.yml", "scripts/start-production.mjs"]) {
      expect(() => assertRound2InheritanceBoundaries({ previous, next, files: [file] })).toThrow("보호");
    }
    expect(() => assertRound2InheritanceBoundaries({ previous, next, files: [], databaseDeployment: true })).toThrow("보호");
    expect(() => assertRound2InheritanceBoundaries({ previous, next: { ...next, EnvironmentVariables: { ...next.EnvironmentVariables, MUMEOK_ROUND2_ENABLED: "true" } }, files: [] })).toThrow("키");
    for (const extra of [{ envFile: "/private/patch" }, { dbCompatible: true }, { dbBaseline: "/private/baseline" }, { alreadyAppliedDb: false }, { reviewedFeedbackReadiness: true }, { skipAutomatedTests: true }, { refOption: "--ref" }]) {
      expect(() => assertClosedR2ContinuationOptions({ ...options, ...extra })).toThrow();
    }
  });
  it("verifies only unchanged applied ledger/source and never enters backup/apply", async () => {
    const f = fixture();
    const backup = vi.fn(), transact = vi.fn();
    const engine = createPrelaunchDatabaseEngine({ readMigrations: async () => f.databasePlan.source, adapter: {
      inspect: async () => ({ id: "fixture-container", volume: "fixture-volume" }),
      readState: async () => ({ exists: true, applied: f.databasePlan.applied, supabaseVersions: [] }), backup, transact,
    } });
    const plan = await engine.verify();
    expect(() => assertClosedR2Database(f.review, plan)).not.toThrow();
    expect(backup).not.toHaveBeenCalled(); expect(transact).not.toHaveBeenCalled();
    for (const change of [{ pending: ["new.sql"] }, { baselineRequired: true }, { source: [] }, { applied: [] }]) {
      expect(() => assertClosedR2Database(f.review, { ...plan, ...change })).toThrow("DB");
    }
    const changed = [{ ...plan.source[0], sha256: hash("different SQL") }];
    expect(() => assertClosedR2Database(f.review, { ...plan, source: changed, applied: changed })).toThrow("DB");
  });
});

describe("explicit disabled runtime fence", () => {
  const headersCases: Record<string, string>[] = [{}, { cookie: "__Secure-mumeok_r2_recording=fixture" }, { "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "198.51.100.2" }];
  it.each(headersCases)("returns disabled before all control/IP/provider/database dependencies even with active control: %j", async headers => {
    const config: Round2HandlerConfig = { enabled: false, leadsEnabled: true, localPreview: false, origin: "https://app.mumeok.kr", hostname: "app.mumeok.kr",
      secrets: { page: "fixture", cookie: "fixture", bootstrap: "fixture", event: "fixture", email: "fixture", receipt: "fixture", rate: "fixture" } };
    const deps = { config, readControl: vi.fn(async () => ({ version: 1 as const, collection_enabled: true, lead_enabled: true, consent_generation: 1 })),
      consumeRate: vi.fn(async () => {}), trustedIp: vi.fn(async () => "198.51.100.3"), leadReadiness: vi.fn(async () => {}),
      acquireControlLease: vi.fn(), execute: vi.fn(), verifyTurnstile: vi.fn() };
    const handle = createMarketingRound2Handler(deps);
    const request = (method = "POST", origin = config.origin, body = '{"action":"lead_submit"}') => new Request(`${config.origin}/api/v1/marketing/round2`, {
      method, headers: { host: "app.mumeok.kr", origin, "content-type": "application/json", ...headers }, ...(method === "POST" ? { body } : {}),
    });
    const response = await handle(request());
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("ROUND2_DISABLED");
    expect((await handle(request("GET"))).status).toBe(405);
    expect((await handle(request("POST", "https://evil.example"))).status).toBe(403);
    expect((await handle(request("POST", config.origin, "x".repeat(8193)))).status).toBe(413);
    for (const spy of [deps.readControl, deps.consumeRate, deps.trustedIp, deps.leadReadiness, deps.acquireControlLease, deps.execute, deps.verifyTurnstile]) expect(spy).not.toHaveBeenCalled();
  });
});

describe("closed rollback exact predecessor", () => {
  function input() {
    const f = fixture();
    const rollbackPlist = closedR2RollbackPlist(f.previous), rollbackBytes = Buffer.from(JSON.stringify(rollbackPlist));
    const state = { ref: f.review.to, checkout: "/next", buildId: "new-build", targetPlistHash: hash("new plist"), previousCwd: "/previous", previousBuildId: "old-build", previousPlistHash: hash(f.originalBytes),
      closedR2: { schema: "homecook.prelaunch-closed-r2-state.v1", kind: "f01", activationAuthorized: false, from: f.review.from, to: f.review.to, controlSha256: f.review.controlSha256, consentGeneration: 1, rollbackPlistSha256: hash(rollbackBytes) } };
    return { ...f, state, live: { ref: f.review.to, cwd: "/next", buildId: "new-build", plistHash: state.targetPlistHash, plist: f.next }, rollbackPlist, rollbackBytes, originalPlist: f.previous, recovering: false };
  }
  it("preserves original audit bytes while restoring only a closed predecessor", () => {
    const f = input();
    expect(() => assertClosedR2Rollback(f)).not.toThrow();
    expect(f.originalPlist.EnvironmentVariables.MUMEOK_ROUND2_ENABLED).toBe("true");
    expect(f.rollbackPlist.EnvironmentVariables.MUMEOK_ROUND2_ENABLED).toBe("false");
    for (const value of [f.state.previousPlistHash, f.state.closedR2.rollbackPlistSha256]) {
      expect(() => assertClosedR2Rollback({ ...f, recovering: true, live: { ref: f.review.from, cwd: "/previous", buildId: "old-build", plistHash: value,
        plist: value === f.state.previousPlistHash ? f.originalPlist : f.rollbackPlist } })).not.toThrow();
    }
  });
  it("rejects reactivation, foreign web/build, generation drift and altered rollback bytes", () => {
    const f = input();
    expect(() => assertClosedR2Rollback({ ...f, rollbackPlist: f.originalPlist, rollbackBytes: f.originalBytes })).toThrow("false");
    expect(() => assertClosedR2Rollback({ ...f, live: { ...f.live, buildId: "other" } })).toThrow("다른 배포");
    expect(() => assertClosedR2Rollback({ ...f, state: { ...f.state, closedR2: { ...f.state.closedR2, consentGeneration: 0 } } })).toThrow("검토");
    expect(() => assertClosedR2Rollback({ ...f, rollbackBytes: Buffer.from("changed") })).toThrow("plist");
    expect(() => assertClosedR2Rollback({ ...f, state: { ...f.state, previousCwd: "/foreign" } })).toThrow("cwd/build");
    expect(() => assertClosedR2Rollback({ ...f, live: { ...f.live, plist: { ...f.next, ProgramArguments: ["/unknown"] } } })).toThrow("실제 웹 plist");
  });
  it("compensates a failed activation with the closed predecessor while keeping the writer excluded", async () => {
    const f = input();
    const storage = createRound2FileStorage({ repositoryRoot: repository, controlPath: f.controlPath, rateStateDir: f.root, rateSecret: "fixture-only-rate-secret-32-characters" });
    let live = f.originalPlist;
    let lease: Awaited<ReturnType<typeof acquireClosedR2ControlLease>> | undefined;
    try {
      await expect(deployTransaction({
        prepare: async () => { lease = await acquireClosedR2ControlLease(f.review, repository); },
        activate: async () => { lease?.verify(); live = f.next; },
        verify: async () => { throw new Error("fixture smoke failed"); },
        restore: async () => { lease?.verify(); live = f.rollbackPlist; },
        verifyRestored: async () => { await expect(storage.acquireControlLease()).rejects.toThrow(); lease?.verify(); },
      })).rejects.toThrow("복구");
      expect(live.EnvironmentVariables.MUMEOK_ROUND2_ENABLED).toBe("false");
      expect(live.EnvironmentVariables.MUMEOK_ROUND2_LEADS_ENABLED).toBe("false");
      expect(verifyClosedR2Control(f.review, repository).consent_generation).toBe(1);
    } finally { await lease?.release(); }
    expect(existsSync(`${f.controlPath}.lock`)).toBe(false);
  });
});

describe("live release marker independent fence", () => {
  function input() {
    const f = fixture();
    const rollbackPlist = closedR2RollbackPlist(f.previous);
    const marker = { schema: "homecook.prelaunch-closed-r2-state.v1", kind: "f01", activationAuthorized: false, reviewSha256: hash("fixture review"), databasePlanSha256: f.review.databasePlanSha256,
      from: f.review.from, to: f.review.to, checkout: "/next", buildId: "new-build", targetPlistSha256: hash(JSON.stringify(f.next)),
      previousCwd: "/previous", previousBuildId: "old-build", previousPlistSha256: f.review.predecessorPlistSha256,
      pauseReceiptSha256: f.review.pause.sha256, controlSha256: f.review.controlSha256, consentGeneration: 1,
      historicalReadinessSha256: f.review.historicalReadiness.sha256, rollbackPlistSha256: hash(JSON.stringify(rollbackPlist)) };
    const markerSha256 = hash(JSON.stringify(marker));
    const state = { ref: marker.to, checkout: marker.checkout, buildId: marker.buildId, targetPlistHash: marker.targetPlistSha256,
      previousCwd: marker.previousCwd, previousBuildId: marker.previousBuildId, previousPlistHash: marker.previousPlistSha256, closedR2: { ...marker, artifactSha256: markerSha256 } };
    return { ...f, marker, markerSha256, state, reviewSha256: marker.reviewSha256,
      live: { ref: marker.to, cwd: marker.checkout, buildId: marker.buildId, plistHash: marker.targetPlistSha256, plist: f.next }, rollbackPlist };
  }
  it("binds the live marker even when a replacement state omits or changes closedR2", () => {
    const f = input();
    expect(() => assertClosedR2LiveMarker(f)).not.toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, state: {} })).toThrow("상태");
    expect(() => assertClosedR2LiveMarker({ ...f, state: { ...f.state, closedR2: null } })).toThrow();
    for (const state of [f.state, { ...f.state, closedR2: null }, { ...f.state, closedR2: { ...f.state.closedR2, activationAuthorized: true } }]) {
      expect(() => assertClosedR2MaintenanceFence(state, { reviewedFeedbackReadiness: true })).toThrow();
    }
    for (const field of ["ref", "checkout", "buildId", "targetPlistHash", "previousCwd", "previousBuildId", "previousPlistHash"]) {
      expect(() => assertClosedR2LiveMarker({ ...f, state: { ...f.state, [field]: "foreign" } })).toThrow();
    }
    expect(() => assertClosedR2LiveMarker({ ...f, markerSha256: hash("other artifact") })).toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, reviewSha256: hash("other review") })).toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, live: { ...f.live, plistHash: hash("true plist") } })).toThrow();
  });
  it("keeps the same marker fence on closed rollback and only permits original flags for recorded interrupted recovery", () => {
    const f = input();
    const state = { ...f.state, closedR2: { ...f.state.closedR2, rolledBack: true } };
    const live = { ref: f.marker.from, cwd: "/previous", buildId: "old-build", plistHash: f.marker.rollbackPlistSha256, plist: f.rollbackPlist };
    expect(() => assertClosedR2LiveMarker({ ...f, state, live })).not.toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, state })).toThrow();
    const original = { ...live, plistHash: f.marker.previousPlistSha256, plist: f.previous };
    expect(() => assertClosedR2LiveMarker({ ...f, state, live: original })).toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, live: original, recovering: true })).not.toThrow();
    expect(() => assertClosedR2LiveMarker({ ...f, live: { ...f.live, plist: f.previous } })).toThrow("flag");
  });
  it("permits only the same reviewed F01 retry from its recorded closed predecessor", () => {
    const f = input(), state = { ...f.state, closedR2: { ...f.state.closedR2, rolledBack: true } };
    const live = { ref: f.review.from, cwd: "/previous", buildId: "old-build", plistHash: f.marker.rollbackPlistSha256, plist: f.rollbackPlist };
    const retry = { state, live, review: f.review, originalBytes: f.originalBytes };
    expect(() => assertClosedR2Retry(retry)).not.toThrow();
    for (const change of [{ state: {} }, { state: { ...state, closedR2: { ...state.closedR2, rolledBack: false } } },
      { originalBytes: Buffer.from("changed backup") }, { live: { ...live, ref: "c".repeat(40) } }, { live: { ...live, plistHash: f.marker.previousPlistSha256, plist: f.previous } },
      { review: { ...f.review, to: "c".repeat(40) } }]) expect(() => assertClosedR2Retry({ ...retry, ...change })).toThrow("재시도");
  });
  it("restores the immediate prior marker/state across two continuations and repeated exact F01 retries", () => {
    const f = input();
    let prior = f.state;
    let marker = f.marker;
    let priorPlist = f.next;
    for (const target of ["c".repeat(40), "d".repeat(40)]) {
      const previousBytes = Buffer.from(JSON.stringify(prior)), markerBytes = Buffer.from(JSON.stringify(marker));
      const next = retargetPlist(priorPlist, `/release-${target[0]}`);
      const nextMarker = { ...marker, kind: "continuation", from: marker.to, to: target, checkout: next.WorkingDirectory, buildId: `build-${target[0]}`,
        targetPlistSha256: hash(JSON.stringify(next)), previousCwd: prior.checkout, previousBuildId: prior.buildId, previousPlistSha256: prior.targetPlistHash,
        rollbackPlistSha256: prior.targetPlistHash, previousStateSha256: hash(previousBytes), previousArtifactSha256: hash(markerBytes) };
      const state = { ref: target, checkout: nextMarker.checkout, buildId: nextMarker.buildId, targetPlistHash: nextMarker.targetPlistSha256,
        previousCwd: nextMarker.previousCwd, previousBuildId: nextMarker.previousBuildId, previousPlistHash: nextMarker.previousPlistSha256,
        closedR2: { ...nextMarker, artifactSha256: hash(JSON.stringify(nextMarker)) } };
      expect(() => assertClosedR2LiveMarker({ ...f, state, marker: nextMarker, markerSha256: state.closedR2.artifactSha256,
        live: { ref: target, cwd: state.checkout, buildId: state.buildId, plistHash: state.targetPlistHash, plist: next } })).not.toThrow();
      const restore = { state, previousBytes, markerBytes, plist: priorPlist, plistSha256: prior.targetPlistHash, review: f.review, reviewSha256: f.reviewSha256 };
      expect(assertClosedR2PredecessorState(restore)).toEqual(prior);
      expect(() => assertClosedR2PredecessorState({ ...restore, previousBytes: Buffer.from("changed") })).toThrow("bytes");
      expect(() => assertClosedR2PredecessorState({ ...restore, markerBytes: Buffer.from("changed") })).toThrow("bytes");
      prior = state; marker = nextMarker; priorPlist = next;
    }
    const rolledBack = { ...f.state, closedR2: { ...f.state.closedR2, rolledBack: true } };
    const previousBytes = Buffer.from(JSON.stringify(rolledBack)), markerBytes = Buffer.from(JSON.stringify(f.marker));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const state = { ...f.state, closedR2: { ...f.state.closedR2, kind: "f01-retry", previousStateSha256: hash(previousBytes), previousArtifactSha256: hash(markerBytes) } };
      const restore = { state, previousBytes, markerBytes, plist: f.rollbackPlist, plistSha256: f.marker.rollbackPlistSha256, review: f.review, reviewSha256: f.reviewSha256 };
      expect(assertClosedR2PredecessorState(restore)).toEqual(rolledBack);
      expect(() => assertClosedR2PredecessorState({ ...restore, plist: f.previous, plistSha256: f.marker.previousPlistSha256 })).toThrow();
      expect(readFileSync(f.controlPath, "utf8")).toBe(JSON.stringify(f.control));
    }
  });
});
