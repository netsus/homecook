import { describe, expect, it } from "vitest";
import {
  assertFrontendScope,
  classifyPrelaunchScope,
  prelaunchVerificationScripts,
  prelaunchVerificationEnvironment,
  runPrelaunchVerification,
  parsePrelaunchOptions,
  prepareDatabaseDeployment,
  shouldRequireDatabaseRecovery,
  retargetPlist,
  deployTransaction,
  productionEnvironment,
  assertRollbackTarget,
  createCancellation,
  prelaunchBuildEnvironment,
  parsePrelaunchArgs,
  restartLaunchAgent,
  prelaunchSourceAncestry,
} from "../scripts/lib/prelaunch-web-deploy.mjs";

const basePackage = { scripts: { build: "next build" }, dependencies: { next: "15.0.0" } };
const plist = {
  Label: "com.homecook.production",
  WorkingDirectory: "/old",
  ProgramArguments: ["/node", "/old/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
  EnvironmentVariables: { PRIVATE_KEY: "secret-do-not-print" },
  StandardOutPath: "/logs/app.log",
};

describe("prelaunch web deployment", () => {
  it("allows web server and shared component changes", () => {
    expect(() => assertFrontendScope(["lib/marketing/marketing-validation-client-session.ts", "components/youtube-extraction/youtube-extraction-notification-center.tsx"], basePackage, basePackage)).not.toThrow();
    expect(() => assertFrontendScope(["lib/marketing/marketing-validation-session.ts"], basePackage, basePackage)).not.toThrow();
    expect(() => assertFrontendScope(["components/youtube-extraction/server.ts"], basePackage, basePackage)).not.toThrow();
  });
  it("requires exact reviewed commit SHA and ancestry from the current live commit", () => {
    const sha = "a".repeat(40);
    expect(prelaunchSourceAncestry("--reviewed-ref", sha, "live", sha)).toEqual(["live", sha]);
    expect(prelaunchSourceAncestry("--ref", "origin/master", "live", sha)).toEqual([sha, "origin/master"]);
    for (const ref of ["master", "aaaaaaa", "a".repeat(39), "a".repeat(41)]) {
      expect(() => prelaunchSourceAncestry("--reviewed-ref", ref, "live", sha)).toThrow();
    }
    expect(() => prelaunchSourceAncestry("--reviewed-ref", sha, "live", "b".repeat(40))).toThrow();
  });
  it("accepts pnpm's optional separator after the action", () => {
    expect(parsePrelaunchArgs(["deploy", "--", "--ref", "abc"])).toEqual({ action: "deploy", args: ["--ref", "abc"] });
    expect(parsePrelaunchArgs(["plan", "--ref", "abc"])).toEqual({ action: "plan", args: ["--ref", "abc"] });
    expect(parsePrelaunchArgs(["status", "--"])).toEqual({ action: "status", args: [] });
    expect(parsePrelaunchArgs(["deploy", "--", "--", "--ref", "abc"]).args).toEqual(["--", "--ref", "abc"]);
  });
  it("accepts landing assets and additional dependency with its lockfile", () => {
    expect(() => assertFrontendScope(["app/beta/page.tsx", "app/globals.css", "components/marketing/funnel.tsx", "public/assets/funnel/hero.png", "docs/guide.md", "tests/ui.test.ts", "package.json", "pnpm-lock.yaml"], basePackage, { ...basePackage, dependencies: { ...basePackage.dependencies, "@radix-ui/react-icons": "^1.3.2" } })).not.toThrow();
  });
  it.each(["scripts/start-production.mjs", "infra/db.sql", "worker/start.ts", ".npmrc", "supabase/config.toml"])("rejects infrastructure/runtime change %s", (path) => {
    expect(() => assertFrontendScope([path], basePackage, basePackage)).toThrow("허용");
  });
  it("preserves build commands, allows existing dependency upgrades, and rejects unpaired lockfiles", () => {
    expect(() => assertFrontendScope(["package.json", "pnpm-lock.yaml"], basePackage, { ...basePackage, scripts: { build: "evil" } })).toThrow();
    expect(() => assertFrontendScope(["package.json", "pnpm-lock.yaml"], basePackage, { ...basePackage, dependencies: { next: "16" } })).not.toThrow();
    expect(() => assertFrontendScope(["package.json"], basePackage, { ...basePackage, dependencies: { ...basePackage.dependencies, icons: "1" } })).toThrow();
  });
  it("allows operational command changes that are not executed by deployment", () => {
    const next = { ...basePackage, scripts: { ...basePackage.scripts, "deploy:dev:landing": "node scripts/deploy-prelaunch-web.mjs deploy", "deploy:dev:status": "node scripts/deploy-prelaunch-web.mjs status", "deploy:dev:rollback": "node scripts/deploy-prelaunch-web.mjs rollback" } };
    expect(() => assertFrontendScope(["scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "package.json"], basePackage, next)).not.toThrow();
    expect(() => assertFrontendScope(["package.json"], basePackage, { ...next, scripts: { ...next.scripts, "deploy:dev:landing": "custom operator command" } })).not.toThrow();
    expect(() => assertFrontendScope(["package.json"], basePackage, { ...next, scripts: { ...next.scripts, postinstall: "custom lifecycle (installation ignores scripts)" } })).not.toThrow();
  });
  it("classifies web/API, immutable migrations, and operational docs independently", () => {
    expect(classifyPrelaunchScope(["app/api/signup/route.ts", "lib/auth.ts", "next.config.ts", ".env.example", "supabase/migrations/20260905120000_add.sql", ".github/workflows/ci.yml", "docs/a.md"], basePackage, basePackage)).toEqual({ web: ["app/api/signup/route.ts", "lib/auth.ts", "next.config.ts", ".env.example"], database: ["supabase/migrations/20260905120000_add.sql"], support: [".github/workflows/ci.yml", "docs/a.md"], api: ["app/api/signup/route.ts", "lib/auth.ts"] });
  });
  it("permits marketing validation operational tools without allowing service runtime scripts", () => {
    const files = ["scripts/marketing-validation-production-readiness.mjs", "scripts/marketing-validation-preview-preflight.mjs", "scripts/marketing-validation-preview-smoke.mjs", "scripts/lib/marketing-validation-operations.mjs", "scripts/lib/marketing-validation-preview-contract.mjs"];
    expect(classifyPrelaunchScope(files, basePackage, basePackage).support).toEqual(files);
    for (const file of ["scripts/full-local-production-runtime.mjs", "scripts/worker-start.mjs", "scripts/lib/start-production-runtime.mjs"]) expect(() => classifyPrelaunchScope([file], basePackage, basePackage)).toThrow();
  });
  it("allows the CI path filter alongside web changes without treating it as runtime code", () => {
    expect(classifyPrelaunchScope(["app/beta/page.tsx", "scripts/ci-path-filter.mjs"], basePackage, basePackage)).toEqual({
      web: ["app/beta/page.tsx"],
      database: [],
      support: ["scripts/ci-path-filter.mjs"],
      api: [],
    });
  });
  it.each(["scripts/ci-path-filter-extra.mjs", "scripts/lib/ci-path-filter.mjs", "scripts/arbitrary.mjs"])("does not extend the CI exception to %s", (file) => {
    expect(() => classifyPrelaunchScope([file], basePackage, basePackage)).toThrow("허용");
  });
  it("defaults to origin/master and rejects ambiguous, duplicate or unknown options", () => {
    expect(parsePrelaunchOptions([])).toEqual({ ref: "origin/master", refOption: "--ref" });
    expect(parsePrelaunchOptions(["--env-file", "/private/env", "--ref", "abc", "--db-config", "/private/db", "--db-baseline", "/private/baseline.json"])).toEqual({ ref: "abc", refOption: "--ref", envFile: "/private/env", dbConfig: "/private/db", dbBaseline: "/private/baseline.json" });
    for (const args of [["--ref"], ["--token", "SECRET"], ["--ref", "a", "--reviewed-ref", "b"], ["--env-file", "x", "--env-file", "y"], ["--db-baseline", "x"]]) expect(() => parsePrelaunchOptions(args)).toThrow();
  });
  it("requires an explicit old-app compatibility flag for database deployment", () => {
    expect(parsePrelaunchOptions(["--db-config", "/private/db", "--db-compatible"]).dbCompatible).toBe(true);
    expect(() => parsePrelaunchOptions(["--db-compatible"])).toThrow();
    expect(() => parsePrelaunchOptions(["--db-config", "/private/db", "--db-compatible", "--db-compatible"])).toThrow();
  });
  it("automatically selects product tests for API changes and rejects missing or unsafe verification hooks", () => {
    const api = { api: ["app/api/route.ts"] };
    const manifest = { scripts: { "test:product": "vitest run", "marketing:preview:preflight": "node check.mjs" } };
    expect(prelaunchVerificationScripts(api, manifest)).toEqual(["test:product"]);
    expect(prelaunchVerificationScripts({ api: [] }, manifest)).toEqual([]);
    expect(prelaunchVerificationScripts(api, manifest, "marketing:preview:preflight")).toEqual(["test:product", "marketing:preview:preflight"]);
    expect(prelaunchVerificationScripts(api, manifest, "test:product")).toEqual(["test:product"]);
    expect(() => prelaunchVerificationScripts(api, { scripts: {} })).toThrow("test:product");
    for (const hook of ["test:missing", "test:product; echo secret", "marketing:retention:purge", "test:product --flag"]) expect(() => prelaunchVerificationScripts(api, manifest, hook)).toThrow();
    expect(parsePrelaunchOptions(["--verify-script", "test:product"]).verifyScript).toBe("test:product");
  });
  it("runs unit tests with React test mode while preserving production settings for operational verification", () => {
    const environment = { NODE_ENV: "production", MARKETING_TURNSTILE_SECRET: "private-value", HOMECOOK_AUTH_AUTHORITY: "local" };
    for (const script of ["test", "test:product", "test:harness"]) expect(prelaunchVerificationEnvironment(script, environment)).toEqual({ ...environment, NODE_ENV: "test" });
    for (const script of ["verify:production-domain-contract", "marketing:preview:preflight"]) expect(prelaunchVerificationEnvironment(script, environment)).toEqual(environment);
    expect(environment.NODE_ENV).toBe("production");
  });
  it("never mutates the running web after a required API verification fails", async () => {
    const actions: string[] = [];
    const ops = adapter();
    await expect(deployTransaction({ ...ops, prepare: () => runPrelaunchVerification({ scripts: ["test:product", "verify:extra"], run: async (script) => { actions.push(script); throw new Error("test failure"); } }) })).rejects.toThrow("준비 실패");
    expect(actions).toEqual(["test:product"]);
    expect(ops.actions).toEqual([]);
  });
  it("requires both manifest and lockfile for development dependency changes", () => {
    expect(() => assertFrontendScope(["package.json"], basePackage, { ...basePackage, devDependencies: { tool: "2" } })).toThrow("함께");
  });
  it("does not touch the database adapter for web-only releases", async () => {
    let opened = false;
    await expect(prepareDatabaseDeployment({ required: false, open: () => { opened = true; throw new Error(); } })).resolves.toBeNull();
    expect(opened).toBe(false);
  });
  it("stops before database apply on isolated gate failure and always closes the adapter", async () => {
    const actions: string[] = [];
    await expect(prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ pending: ["migration"], migrationMode: "additive" }), apply: async () => { actions.push("apply"); }, verify: async () => {}, close: async () => { actions.push("close"); } }), gate: async () => { actions.push("gate"); throw new Error("secret"); } })).rejects.toThrow();
    expect(actions).toEqual(["gate", "close"]);
  });
  it("records committed database state before a failing post-commit verification", async () => {
    const actions: string[] = [];
    const record = { changed: true, applied: ["migration"], backupPath: "/private/backup" };
    await expect(prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ migrationMode: "additive" }), apply: async () => record, verify: async () => { throw new Error("unavailable"); }, close: async () => { actions.push("close"); } }), gate: async () => {}, onApplied: async (value) => { expect(value).toEqual({ ...record, backwardCompatible: true }); actions.push("record"); } })).rejects.toThrow();
    expect(actions).toEqual(["record", "close"]);
  });
  it.each(["committed", "uncertain"])("retains %s database outcomes after an adapter error without marking uncertain rollback safe", async (outcome) => {
    const databaseState = { changed: true, applied: ["migration"], backupPath: "/private/db-backup", outcome };
    const recorded: unknown[] = [];
    const failure = Object.assign(new Error("private database error"), { databaseState });
    await expect(prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ migrationMode: "additive" }), apply: async () => { throw failure; }, verify: async () => {}, close: async () => {} }), gate: async () => {}, onApplied: async (value) => { recorded.push(value); } })).rejects.toBe(failure);
    expect(recorded).toEqual([{ ...databaseState, backwardCompatible: outcome === "committed" }]);
  });
  it.each([
    { outcome: "rolled_back", changed: false, requiresRecovery: false, compatible: true },
    { outcome: "uncertain", changed: true, requiresRecovery: true, compatible: false },
  ])("keeps $outcome evidence without unnecessarily blocking the next corrected deployment", async ({ outcome, changed, requiresRecovery, compatible }) => {
    const databaseState = { changed, applied: [], attempted: ["migration.sql"], backupPath: "/private/db-backup", outcome };
    const failure = Object.assign(new Error("private database error"), { databaseState });
    let savedEvidence: unknown;
    let recoveryExists = false;
    await expect(prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ migrationMode: "additive" }), apply: async () => { throw failure; }, verify: async () => {}, close: async () => {} }), gate: async () => {}, onApplied: async (record) => { savedEvidence = record; recoveryExists = shouldRequireDatabaseRecovery(record); } })).rejects.toBe(failure);
    expect(savedEvidence).toEqual({ ...databaseState, backwardCompatible: compatible });
    expect(recoveryExists).toBe(requiresRecovery);
  });
  it("preserves recovery policy for normal unchanged or committed database deployments", () => {
    expect(shouldRequireDatabaseRecovery({ changed: false, applied: [], backupPath: null })).toBe(true);
    expect(shouldRequireDatabaseRecovery({ changed: true, outcome: "committed" })).toBe(true);
    expect(shouldRequireDatabaseRecovery({ changed: true, outcome: "rolled_back" })).toBe(true);
  });
  it("explains a missing database baseline before running a gate or applying SQL", async () => {
    await expect(prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ baselineRequired: true, migrationMode: "additive" }), close: async () => {} }), gate: async () => { throw new Error("must not run"); } })).rejects.toThrow("--db-baseline");
  });
  it("never activates an app after a failed database apply", async () => {
    const actions: string[] = [];
    const step = (name: string) => async () => { actions.push(name); };
    await expect(deployTransaction({ prepare: async () => { await prepareDatabaseDeployment({ required: true, compatibilityConfirmed: true, open: () => ({ plan: async () => ({ pending: ["migration"], migrationMode: "additive" }), apply: async () => { actions.push("db-apply"); throw new Error("secret"); }, verify: step("db-verify"), close: step("db-close") }), gate: step("db-gate") }); }, activate: step("activate"), verify: step("verify"), restore: step("restore"), verifyRestored: step("verifyRestored") })).rejects.toThrow("준비 실패");
    expect(actions).toEqual(["db-gate", "db-apply", "db-close"]);
  });
  it("preserves all launch settings except checkout paths without mutating original", () => {
    const next = retargetPlist(plist, "/new");
    expect(next).toEqual({ ...plist, WorkingDirectory: "/new", ProgramArguments: ["/node", "/new/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"] });
    expect(plist.WorkingDirectory).toBe("/old");
  });
  it.each([
    { ...plist, Label: "com.homecook.worker" },
    { ...plist, ProgramArguments: ["/node", "/old/scripts/start-production.mjs", "-H", "0.0.0.0", "-p", "3100"] },
    { ...plist, ProgramArguments: ["/node", "/old/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3000"] },
  ])("rejects other services or listeners", (input) => {
    expect(() => retargetPlist(input, "/new")).toThrow();
  });
  it("keeps operating-system and plist settings but drops caller deployment overrides", () => {
    expect(productionEnvironment({ ...plist, EnvironmentVariables: { NODE_ENV: "production", FROM_PLIST: "keep" } }, {
      HOME: "/home", PATH: "/bin", TMPDIR: "/tmp", NODE_ENV: "development", HOMECOOK_RELEASE_ID: "wrong", QA_SEED: "wrong",
    })).toEqual({ HOME: "/home", PATH: "/:/bin", TMPDIR: "/tmp", NODE_ENV: "production", FROM_PLIST: "keep" });
  });
  it("only rolls back the exact web deployed by this tool", () => {
    const state = { checkout: "/new", buildId: "new", targetPlistHash: "new-hash", previousCwd: "/old", previousBuildId: "old", previousPlistHash: "old-hash" };
    expect(() => assertRollbackTarget({ cwd: "/new", buildId: "new", plistHash: "new-hash" }, state, false)).not.toThrow();
    expect(() => assertRollbackTarget({ cwd: "/other", buildId: "new", plistHash: "new-hash" }, state, false)).toThrow();
    expect(() => assertRollbackTarget({ cwd: "/new", buildId: "changed", plistHash: "new-hash" }, state, false)).toThrow();
    expect(() => assertRollbackTarget({ cwd: "/new", buildId: "new", plistHash: "changed" }, state, false)).toThrow();
    expect(() => assertRollbackTarget({ cwd: "/old", buildId: "old", plistHash: "old-hash" }, state, false)).toThrow();
    expect(() => assertRollbackTarget({ cwd: "/old", buildId: "old", plistHash: "old-hash" }, state, true)).not.toThrow();
  });
  it("deduplicates cancellation and waits for owned process cleanup", async () => {
    const cancellation = createCancellation();
    let finish!: () => void;
    let stops = 0;
    cancellation.track(() => { stops += 1; return new Promise<void>((resolve) => { finish = resolve; }); });
    const first = cancellation.request();
    const second = cancellation.request();
    expect(first).toBe(second);
    expect(() => cancellation.check()).toThrow("취소");
    let settled = false;
    void cancellation.drain().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await cancellation.drain();
    expect(stops).toBe(1);
  });
  it("restores and verifies the prior web even after cancellation during activation", async () => {
    const cancellation = createCancellation();
    const ops = adapter();
    await expect(deployTransaction({ ...ops, activate: async () => { await ops.activate(); await cancellation.request(); }, verify: async () => cancellation.check() })).rejects.toThrow("이전 웹 복구 완료");
    expect(ops.actions).toEqual(["prepare", "activate", "restore", "verifyRestored"]);
  });
  it("assigns a different build ID per release instead of inheriting an old ID", () => {
    const configured = { ...plist, EnvironmentVariables: { HOMECOOK_RELEASE_BUILD_ID: "old-fixed-id" } };
    const first = prelaunchBuildEnvironment(configured, "abcdef012345-first");
    const second = prelaunchBuildEnvironment(configured, "abcdef012345-second");
    expect(first.HOMECOOK_RELEASE_BUILD_ID).toBe("prelaunch-abcdef012345-first");
    expect(second.HOMECOOK_RELEASE_BUILD_ID).not.toBe(first.HOMECOOK_RELEASE_BUILD_ID);
  });
  it("waits for launchd unloading and retries only its transient bootstrap error", async () => {
    const calls: string[] = [];
    const loaded = [true, true, false];
    const codes = [5, 5, 0];
    await restartLaunchAgent({
      isLoaded: async () => { calls.push("inspect"); return loaded.shift() ?? false; },
      bootout: async () => { calls.push("bootout"); },
      writePlist: async () => { calls.push("write"); },
      bootstrap: async () => { calls.push("bootstrap"); return codes.shift(); },
      wait: async () => { calls.push("wait"); },
    });
    expect(calls).toEqual(["inspect", "bootout", "inspect", "wait", "inspect", "write", "bootstrap", "wait", "bootstrap", "wait", "bootstrap"]);
  });
  it("bounds bootstrap retries and does not retry permanent errors", async () => {
    for (const code of [5, 13]) {
      let starts = 0;
      let writes = 0;
      await expect(restartLaunchAgent({ isLoaded: async () => false, bootout: async () => {}, writePlist: async () => { writes += 1; }, bootstrap: async () => { starts += 1; return code; }, wait: async () => {} })).rejects.toThrow("웹 등록");
      expect(starts).toBe(code === 5 ? 20 : 1);
      expect(writes).toBe(1);
    }
  });
  it("does not rewrite the plist if launchd never unloads the old service", async () => {
    let writes = 0;
    await expect(restartLaunchAgent({ isLoaded: async () => true, bootout: async () => {}, writePlist: async () => { writes += 1; }, bootstrap: async () => 0, wait: async () => {} })).rejects.toThrow("종료");
    expect(writes).toBe(0);
  });
  function adapter(failures: string[] = []) {
    const actions: string[] = [];
    const step = (name: string) => async () => {
      actions.push(name);
      if (failures.includes(name)) throw new Error("secret-do-not-print");
    };
    return { actions, prepare: step("prepare"), activate: step("activate"), verify: step("verify"), restore: step("restore"), verifyRestored: step("verifyRestored") };
  }
  it("prepares and verifies before completing the switch", async () => {
    const ops = adapter();
    await deployTransaction(ops);
    expect(ops.actions).toEqual(["prepare", "activate", "verify"]);
  });
  it("never switches a service when preparation fails and hides raw command errors", async () => {
    const ops = adapter(["prepare"]);
    await expect(deployTransaction(ops)).rejects.toThrow("준비 실패");
    expect(ops.actions).toEqual(["prepare"]);
  });
  it.each(["activate", "verify"])("restores previous web if %s fails", async (failure) => {
    const ops = adapter([failure]);
    await expect(deployTransaction(ops)).rejects.toThrow("이전 웹 복구 완료");
    expect(ops.actions.slice(-2)).toEqual(["restore", "verifyRestored"]);
  });
  it.each(["restore", "verifyRestored"])("reports %s failure without exposing child command output", async (failure) => {
    const ops = adapter(["verify", failure]);
    await expect(deployTransaction(ops)).rejects.toThrow(/^웹 교체 실패, 자동 복구도 실패/);
  });
});
