import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXACT_YOUTUBE_CANARY_URL,
  PRODUCTION_CANARY_STAGES,
  buildRefreshLifecycleGateResult,
  buildProductionCanaryWorkerEnv,
  parseProductionCanaryFailureStage,
  runProductionCanary,
  resolveProductionCanaryWorkerTimeout,
  validateProductionCanaryAdapterPath,
  validateProductionCanaryResult,
} from "../scripts/lib/full-local-session-production-canary.mjs";
import { runCanaryInIsolatedWorker } from "../scripts/verify-full-local-session-production-canary.mjs";

function createAdapter(events: string[] = []) {
  const oldSession = { opaque: "old-session-handle" };
  const newSession = { opaque: "new-session-handle" };
  const cleanupHandle = { opaque: "planner-cleanup-handle" };

  return {
    async openSession() {
      events.push("open-session");
      return {
        bindingCreatedAt: "2026-08-09T00:00:00.000Z",
        session: oldSession,
      };
    },
    async readBindingExpiry(session: unknown): Promise<string> {
      events.push(session === oldSession ? "binding-old" : "binding-new");
      return session === oldSession
        ? "2026-08-09T01:00:00.000Z"
        : "2026-08-09T02:00:00.000Z";
    },
    async refreshSession(session: unknown) {
      expect(session).toBe(oldSession);
      events.push("refresh");
      return newSession;
    },
    async plannerRead(session: unknown) {
      events.push(session === newSession ? "planner-read-new" : "planner-read-old");
      return "PASS";
    },
    async plannerWrite(session: unknown) {
      expect(session).toBe(newSession);
      events.push("planner-write");
      return { cleanupHandle, status: "PASS" };
    },
    async plannerCleanup(session: unknown, handle: unknown) {
      expect(session).toBe(newSession);
      expect(handle).toBe(cleanupHandle);
      events.push("planner-cleanup");
      return "PASS";
    },
    async pantryRead(session: unknown) {
      expect(session).toBe(newSession);
      events.push("pantry-read");
      return "PASS";
    },
    async youtubeExtract(session: unknown, input: { url: string }) {
      expect(session).toBe(newSession);
      expect(input).toEqual({ url: EXACT_YOUTUBE_CANARY_URL });
      events.push("youtube-extract");
      return "PASS";
    },
    async logout(session: unknown) {
      expect(session).toBe(newSession);
      events.push("logout");
      return "PASS";
    },
    async plannerReadAfterLogout(session: unknown) {
      events.push(session === oldSession ? "blocked-read-old" : "blocked-read-new");
      return "BLOCKED";
    },
    async plannerWriteAfterLogout(session: unknown) {
      events.push(session === oldSession ? "blocked-write-old" : "blocked-write-new");
      return "BLOCKED";
    },
    async readObservationCounters(): Promise<{
      accountSessionStaleCount: number;
      counterScope: string;
      firstStaleAt: string | null;
      observationStartedAt: string;
      staleTokenMutationCount: number;
    }> {
      events.push("counters");
      return {
        accountSessionStaleCount: 0,
        counterScope: "SINCE_DEPLOY",
        firstStaleAt: null,
        observationStartedAt: "2026-08-09T00:00:00.000Z",
        staleTokenMutationCount: 0,
      };
    },
    async close() {
      events.push("close");
    },
  };
}

describe("full-local production session canary", () => {
  it("allows the T+65 hold window without widening later-phase worker timeouts", () => {
    expect(resolveProductionCanaryWorkerTimeout({
      configuredTimeout: undefined,
      phase: "milestone-a-t65",
    })).toBe(100 * 60 * 1_000);
    expect(resolveProductionCanaryWorkerTimeout({
      configuredTimeout: String(120 * 60 * 1_000),
      phase: "milestone-a-t65",
    })).toBe(120 * 60 * 1_000);
    expect(() => resolveProductionCanaryWorkerTimeout({
      configuredTimeout: String(120 * 60 * 1_000 + 1),
      phase: "milestone-a-t65",
    })).toThrow(/out of range/u);

    for (const phase of ["milestone-a-24h", "milestone-b-7d"]) {
      expect(resolveProductionCanaryWorkerTimeout({
        configuredTimeout: undefined,
        phase,
      })).toBe(20 * 60 * 1_000);
      expect(() => resolveProductionCanaryWorkerTimeout({
        configuredTimeout: String(20 * 60 * 1_000 + 1),
        phase,
      })).toThrow(/out of range/u);
    }
  });

  it("requires an owner-only canonical adapter file and immediate parent directory", () => {
    const parent = realpathSync(mkdtempSync(path.join(tmpdir(), "trusted-canary-adapter-")));
    const adapterPath = path.join(parent, "adapter.mjs");
    writeFileSync(adapterPath, "export const safe = true;\n", "utf8");
    chmodSync(parent, 0o700);
    chmodSync(adapterPath, 0o600);

    expect(validateProductionCanaryAdapterPath(adapterPath)).toBe(adapterPath);
    chmodSync(adapterPath, 0o640);
    expect(() => validateProductionCanaryAdapterPath(adapterPath)).toThrow(/0600/u);
    chmodSync(adapterPath, 0o600);
    chmodSync(parent, 0o755);
    expect(() => validateProductionCanaryAdapterPath(adapterPath)).toThrow(/0700/u);
    chmodSync(parent, 0o700);
    expect(() => validateProductionCanaryAdapterPath(adapterPath, {
      currentUid: (process.getuid?.() ?? 0) + 1,
    })).toThrow(/current user/u);

    const aliasRoot = mkdtempSync(path.join(tmpdir(), "canary-adapter-alias-"));
    const aliasParent = path.join(aliasRoot, "adapter-parent");
    symlinkSync(parent, aliasParent, "dir");
    expect(() => validateProductionCanaryAdapterPath(
      path.join(aliasParent, "adapter.mjs"),
    )).toThrow(/canonical|symbolic/u);
  });

  it("passes only the allowlisted runtime environment to the adapter worker", () => {
    expect(buildProductionCanaryWorkerEnv({
      FULL_LOCAL_SESSION_CANARY_ADAPTER: "/ambient/must-not-win.mjs",
      GH_TOKEN: "github-secret",
      HOME: "/Users/operator",
      LANG: "ko_KR.UTF-8",
      LC_ALL: "C",
      NODE_ENV: "production",
      NODE_OPTIONS: "--require /tmp/ambient-hook.cjs",
      PATH: "/usr/bin:/bin",
      SUPABASE_SERVICE_ROLE_KEY: "app-secret",
      TMPDIR: "/private/tmp",
    }, "/trusted/adapter.mjs")).toEqual({
      FULL_LOCAL_SESSION_CANARY_ADAPTER: "/trusted/adapter.mjs",
      HOME: "/Users/operator",
      LANG: "ko_KR.UTF-8",
      LC_ALL: "C",
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/private/tmp",
    });
  });

  it("runs the protected read/write/cleanup/extraction flow and blocks old/new sessions after logout", async () => {
    const events: string[] = [];
    const stageEvents: string[] = [];
    const result = await runProductionCanary({
      adapter: createAdapter(events),
      implementationSha: "a".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-t65",
      reportStage: async ({ stage, status }) => {
        stageEvents.push(`${stage}:${status}`);
      },
    });

    expect(events).toEqual([
      "open-session",
      "counters",
      "binding-old",
      "refresh",
      "binding-new",
      "planner-read-new",
      "planner-write",
      "planner-cleanup",
      "pantry-read",
      "youtube-extract",
      "logout",
      "blocked-read-old",
      "blocked-write-old",
      "blocked-read-new",
      "blocked-write-new",
      "counters",
      "close",
    ]);
    expect(stageEvents).toEqual(PRODUCTION_CANARY_STAGES.flatMap((stage) => [
      `${stage}:START`,
      `${stage}:PASS`,
    ]));
    expect(result).toEqual({
      account_session_stale_count: 0,
      canary_results: {
        pantry_read: "PASS",
        planner_read: "PASS",
        planner_write: "PASS",
        youtube_extract: "PASS",
      },
      implementation_sha: "a".repeat(40),
      incident: {
        binding_created_at: "2026-08-09T00:00:00.000Z",
        binding_expires_at: "2026-08-09T02:00:00.000Z",
        first_stale_at: null,
      },
      phase: "milestone-a-t65",
      safety_checks: {
        binding_expiry_monotonic: "PASS",
        logout_new_token_read: "BLOCKED",
        logout_new_token_write: "BLOCKED",
        logout_old_token_read: "BLOCKED",
        logout_old_token_write: "BLOCKED",
        planner_write_cleanup: "PASS",
        phase_time_boundary: "PASS",
        stale_counts_since_deploy: "PASS",
      },
      stale_token_mutation_count: 0,
      status: "PASS",
    });
    expect(validateProductionCanaryResult(result, {
      implementationSha: "a".repeat(40),
      phase: "milestone-a-t65",
    })).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/old-session-handle|new-session-handle|cleanup-handle/u);
  });

  it("stops stage reporting at the exact failed operation while still closing the adapter", async () => {
    const events: string[] = [];
    const stageEvents: string[] = [];
    const adapter = createAdapter(events);
    adapter.youtubeExtract = async () => {
      throw new Error("access_token=must-not-escape");
    };

    await expect(runProductionCanary({
      adapter,
      implementationSha: "a".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-t65",
      reportStage: async ({ stage, status }) => {
        stageEvents.push(`${stage}:${status}`);
      },
    })).rejects.toThrow("must-not-escape");

    expect(stageEvents.at(-1)).toBe("youtube_extract:START");
    expect(stageEvents).not.toContain("youtube_extract:PASS");
    expect(events.at(-1)).toBe("close");
  });

  it("fails closed when refreshed binding expiry regresses and still closes the adapter", async () => {
    const events: string[] = [];
    const adapter = createAdapter(events);
    let bindingReadCount = 0;
    adapter.readBindingExpiry = async () => {
      bindingReadCount += 1;
      events.push(`binding-${bindingReadCount}`);
      return bindingReadCount === 1
        ? "2026-08-09T01:00:00.000Z"
        : "2026-08-09T00:30:00.000Z";
    };

    await expect(runProductionCanary({
      adapter,
      implementationSha: "b".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-t65",
    })).rejects.toThrow(/binding expiry/u);
    expect(events.at(-1)).toBe("close");
  });

  it("rejects nonzero stale counters and unexpected output keys", async () => {
    const adapter = createAdapter();
    adapter.readObservationCounters = async () => ({
      accountSessionStaleCount: 1,
      counterScope: "SINCE_DEPLOY",
      firstStaleAt: "2026-08-09T01:30:00.000Z",
      observationStartedAt: "2026-08-09T00:00:00.000Z",
      staleTokenMutationCount: 0,
    });

    await expect(runProductionCanary({
      adapter,
      implementationSha: "c".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-24h",
    })).rejects.toThrow(/account session stale count/u);

    const unscoped = createAdapter();
    unscoped.readObservationCounters = async () => ({
      accountSessionStaleCount: 0,
      counterScope: "ALL_TIME",
      firstStaleAt: null,
      observationStartedAt: "2026-08-09T00:00:00.000Z",
      staleTokenMutationCount: 0,
    });
    await expect(runProductionCanary({
      adapter: unscoped,
      implementationSha: "c".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-24h",
    })).rejects.toThrow(/since deploy/u);

    const result = await runProductionCanary({
      adapter: createAdapter(),
      implementationSha: "c".repeat(40),
      now: () => new Date("2026-08-10T02:00:00.000Z"),
      phase: "milestone-a-24h",
    }) as Record<string, unknown>;
    result.access_token = "must-never-be-accepted";
    expect(() => validateProductionCanaryResult(result, {
      implementationSha: "c".repeat(40),
      phase: "milestone-a-24h",
    })).toThrow(/unexpected key/u);
  });

  it("rejects a T+65 canary before 65 minutes and a 24h canary before its observation window", async () => {
    await expect(runProductionCanary({
      adapter: createAdapter(),
      implementationSha: "d".repeat(40),
      now: () => new Date("2026-08-09T00:30:00.000Z"),
      phase: "milestone-a-t65",
    })).rejects.toThrow(/65 minutes/u);

    const adapter = createAdapter();
    await expect(runProductionCanary({
      adapter,
      implementationSha: "d".repeat(40),
      now: () => new Date("2026-08-09T23:00:00.000Z"),
      phase: "milestone-a-24h",
    })).rejects.toThrow(/24 hours/u);

    const preDeploySessionEvents: string[] = [];
    const preDeploySession = createAdapter(preDeploySessionEvents);
    preDeploySession.readObservationCounters = async () => {
      preDeploySessionEvents.push("counters");
      return {
        accountSessionStaleCount: 0,
        counterScope: "SINCE_DEPLOY",
        firstStaleAt: null,
        observationStartedAt: "2026-08-09T01:00:00.000Z",
        staleTokenMutationCount: 0,
      };
    };
    await expect(runProductionCanary({
      adapter: preDeploySession,
      implementationSha: "d".repeat(40),
      now: () => new Date("2026-08-09T03:00:00.000Z"),
      phase: "milestone-a-t65",
    })).rejects.toThrow(/after deploy observation started/u);
    expect(preDeploySessionEvents).not.toContain("planner-write");
  });

  it("builds the exact refresh lifecycle summary only after the raw gate succeeds", () => {
    expect(buildRefreshLifecycleGateResult(0)).toEqual({
      authority_static_contracts: "PASS",
      docker_refresh_smoke: "PASS",
      postgres_integration: "PASS",
      refresh_lifecycle_gate: "PASS",
      status: "PASS",
    });
    expect(() => buildRefreshLifecycleGateResult(1)).toThrow(/raw refresh lifecycle gate/u);
  });

  it("isolates noisy operator adapter output and gets both observation snapshots only from the parent", async () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-adapter-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
const oldSession = { token: "eyJsecret.old.signature" };
const newSession = { token: "eyJsecret.new.signature" };
export function createProductionCanaryAdapter() {
  console.log("access_token=must-not-escape");
  process.stderr.write("cookie=must-not-escape\\n");
  return {
    openSession: async () => ({ session: oldSession, bindingCreatedAt: "2026-08-01T00:00:00.000Z" }),
    readBindingExpiry: async (session) => session === oldSession ? "2026-08-01T01:00:00.000Z" : "2026-08-01T02:00:00.000Z",
    refreshSession: async () => newSession,
    plannerRead: async () => "PASS",
    plannerWrite: async () => ({ status: "PASS", cleanupHandle: { id: "opaque" } }),
    plannerCleanup: async () => "PASS",
    pantryRead: async () => "PASS",
    youtubeExtract: async (_session, input) => input.url === "${EXACT_YOUTUBE_CANARY_URL}" ? "PASS" : "FAIL",
    logout: async () => "PASS",
    plannerReadAfterLogout: async () => "BLOCKED",
    plannerWriteAfterLogout: async () => "BLOCKED",
    readObservationCounters: async () => { throw new Error("child must not read production observation counters"); },
    close: async () => undefined,
  };
}
`, "utf8");
    chmodSync(adapterPath, 0o600);

    let observationReads = 0;
    const result = await runCanaryInIsolatedWorker({
      adapterPath,
      ambientEnv: process.env,
      implementationSha: "e".repeat(40),
      observationReader: () => {
        observationReads += 1;
        return {
          accountSessionStaleCount: 0,
          counterScope: "SINCE_DEPLOY",
          firstStaleAt: null,
          observationStartedAt: "2026-08-01T00:00:00.000Z",
          staleTokenMutationCount: 0,
        };
      },
      phase: "milestone-a-t65",
    });

    expect(observationReads).toBe(2);
    expect(result).toEqual(expect.objectContaining({
      phase: "milestone-a-t65",
      status: "PASS",
    }));
    expect(JSON.stringify(result)).not.toMatch(/must-not-escape|eyJsecret|access_token|cookie=/u);
  });

  it("kills an unresponsive adapter after a bounded timeout and returns only a redacted failure", () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-hanging-adapter-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
export async function createProductionCanaryAdapter() {
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}
`, "utf8");
    chmodSync(adapterPath, 0o600);
    const startedAt = Date.now();
    const execution = spawnSync(process.execPath, [
      "scripts/verify-full-local-session-production-canary.mjs",
      "--json",
      "--phase",
      "milestone-a-t65",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        FULL_LOCAL_SESSION_CANARY_ADAPTER: adapterPath,
        FULL_LOCAL_SESSION_CANARY_TIMEOUT_MS: "100",
      },
      timeout: 3_000,
    });

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(execution.status).not.toBe(0);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe("full-local-session-production-canary: FAIL (redacted)\n");
  });

  it("fails closed on an out-of-sequence observation IPC request", async () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-invalid-ipc-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
export function createProductionCanaryAdapter() {
  process.send?.({ requestId: 2, type: "observation-request" });
  return {};
}
`, "utf8");
    chmodSync(adapterPath, 0o600);

    await expect(runCanaryInIsolatedWorker({
      adapterPath,
      ambientEnv: process.env,
      implementationSha: "f".repeat(40),
      observationReader: () => { throw new Error("raw output must never escape"); },
      phase: "milestone-a-t65",
    })).rejects.toThrow("Production canary observation IPC request is invalid.");
  });

  it("returns only the allowlisted active stage across the worker boundary", async () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-stage-failure-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
const oldSession = {};
const newSession = {};
export function createProductionCanaryAdapter() {
  return {
    openSession: async () => ({ session: oldSession, bindingCreatedAt: "2026-08-01T00:00:00.000Z" }),
    readBindingExpiry: async (session) => session === oldSession ? "2026-08-01T01:00:00.000Z" : "2026-08-01T02:00:00.000Z",
    refreshSession: async () => newSession,
    plannerRead: async () => "PASS",
    plannerWrite: async () => ({ status: "PASS", cleanupHandle: {} }),
    plannerCleanup: async () => "PASS",
    pantryRead: async () => "PASS",
    youtubeExtract: async () => { throw new Error("access_token=must-not-escape"); },
    logout: async () => "PASS",
    plannerReadAfterLogout: async () => "BLOCKED",
    plannerWriteAfterLogout: async () => "BLOCKED",
    close: async () => undefined,
  };
}
`, "utf8");
    chmodSync(adapterPath, 0o600);

    const failure = await runCanaryInIsolatedWorker({
      adapterPath,
      ambientEnv: process.env,
      implementationSha: "f".repeat(40),
      observationReader: () => ({
        accountSessionStaleCount: 0,
        counterScope: "SINCE_DEPLOY",
        firstStaleAt: null,
        observationStartedAt: "2026-08-01T00:00:00.000Z",
        staleTokenMutationCount: 0,
      }),
      phase: "milestone-a-t65",
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: "Production canary failed at stage youtube_extract.",
      stage: "youtube_extract",
    });
    expect(JSON.stringify(failure)).not.toContain("must-not-escape");
  });

  it("rejects unknown stage IPC and only parses exact redacted stage output", async () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-invalid-stage-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
export function createProductionCanaryAdapter() {
  process.send?.({ stage: "access_token=must-not-escape", status: "START", type: "stage" });
  return {};
}
`, "utf8");
    chmodSync(adapterPath, 0o600);

    await expect(runCanaryInIsolatedWorker({
      adapterPath,
      ambientEnv: process.env,
      implementationSha: "f".repeat(40),
      observationReader: () => { throw new Error("must not run"); },
      phase: "milestone-a-t65",
    })).rejects.toThrow("Production canary stage IPC is invalid.");

    expect(parseProductionCanaryFailureStage(
      "full-local-session-production-canary: FAIL stage=youtube_extract\n",
    )).toBe("youtube_extract");
    expect(parseProductionCanaryFailureStage(
      "full-local-session-production-canary: FAIL stage=access_token=must-not-escape\n",
    )).toBeNull();
    expect(parseProductionCanaryFailureStage(
      "prefix\nfull-local-session-production-canary: FAIL stage=youtube_extract\n",
    )).toBeNull();
    expect(parseProductionCanaryFailureStage(
      "full-local-session-production-canary: FAIL stage=youtube_extract",
    )).toBeNull();
  });

  it("prints a fixed allowlisted stage without echoing a raw adapter failure", () => {
    const fixtureDir = realpathSync(mkdtempSync(path.join(tmpdir(), "production-canary-cli-stage-")));
    const adapterPath = path.join(fixtureDir, "adapter.mjs");
    writeFileSync(adapterPath, `
export function createProductionCanaryAdapter() {
  return {
    openSession: async () => { throw new Error("oauth_code=must-not-escape"); },
    readBindingExpiry: async () => "",
    refreshSession: async () => ({}),
    plannerRead: async () => "PASS",
    plannerWrite: async () => ({ status: "PASS", cleanupHandle: {} }),
    plannerCleanup: async () => "PASS",
    pantryRead: async () => "PASS",
    youtubeExtract: async () => "PASS",
    logout: async () => "PASS",
    plannerReadAfterLogout: async () => "BLOCKED",
    plannerWriteAfterLogout: async () => "BLOCKED",
    close: async () => undefined,
  };
}
`, "utf8");
    chmodSync(adapterPath, 0o600);
    const execution = spawnSync(process.execPath, [
      "scripts/verify-full-local-session-production-canary.mjs",
      "--json",
      "--phase",
      "milestone-a-t65",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        FULL_LOCAL_SESSION_CANARY_ADAPTER: adapterPath,
      },
    });

    expect(execution.status).toBe(1);
    expect(execution.stdout).toBe("");
    expect(execution.stderr).toBe(
      "full-local-session-production-canary: FAIL stage=open_session\n",
    );
    expect(execution.stderr).not.toContain("must-not-escape");
  });
});
