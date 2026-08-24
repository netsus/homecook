import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  STAGE4_PRIMARY_GUARD_VERIFY_SQL,
  assertStage4DiagnosticAttemptAvailable,
  assertStage4NegativeProbeResult,
  assertStage4OwnedDatabaseContainer,
  assertStage4PreRequestGuardOutput,
  assertStage4ServerEnvironment,
  assertStableProfileIdentity,
  buildStage4DiagnosticOutcome,
  buildStage4FailureResourceSnapshot,
  buildStage4SensitiveCommandError,
  evaluateStage4ImageCache,
  buildConservativeStateMatrix,
  buildStage4ServerEnvironment,
  canPromoteStage4Evidence,
  classifyStage4SeedFailureOutput,
  classifyStage4StartFailure,
  hashStage4ServerTarget,
  pollStage4NegativeProbe,
  requestStage4NegativeProbe,
  runStage4DockerCleanup,
  resolveStage4ServiceProfile,
  resolveStage4RequiredImageTags,
  summarizeStage4Quality,
  pollStage4LocalProfile,
  validateStage4TargetAttestation,
  verifyStage4LocalProfile,
} from "../scripts/lib/cooking-meal-log-stage4-isolated.mjs";
import * as stage4Isolated from "../scripts/lib/cooking-meal-log-stage4-isolated.mjs";
import { RUNTIME_SUPABASE_CLI_PACKAGE } from "../scripts/lib/local-supabase-isolated-runtime.mjs";
import {
  formatLocalSeedOperationError,
  normalizeLocalSeedProviderCode,
  normalizeLocalSeedReasonCode,
} from "../scripts/lib/local-seed-diagnostics.mjs";

const root = process.cwd();
const slice = "cooking-meal-log-cross-slice-release-qa";
const scriptPath = "scripts/capture-cooking-meal-log-stage4-evidence.mjs";
const runnerPath = "scripts/run-cooking-meal-log-stage4-isolated-capture.mjs";
const isolatedHelperPath = "scripts/lib/cooking-meal-log-stage4-isolated.mjs";
const shadowSeedHelperPath =
  "scripts/lib/cooking-meal-log-stage4-shadow-seed.mjs";
const quarantineFixturePath =
  "lib/server/account-generation/quarantine-fixture.ts";
const sharedFixturePath = "lib/mock/qa-fixtures.ts";
const evidenceRoot = `ui/designs/evidence/${slice}`;

const screens = [
  "ACCOUNT_QUARANTINE",
  "HOME",
  "RECIPE_DETAIL",
  "MANUAL_RECIPE_CREATE",
  "PLANNER_WEEK",
  "COOK_MODE",
  "LEFTOVERS",
  "MEAL_LOG",
];

const viewportLabels = ["mobile-default", "mobile-narrow", "desktop"];

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("cooking meal-log Stage 4 real-stack capture harness", () => {
  it("fails closed before browser capture when local session authority is inactive", () => {
    const assertRuntimeAuthority = (
      stage4Isolated as unknown as Record<string, unknown>
    ).assertStage4RuntimeAuthorityOutput;

    expect(assertRuntimeAuthority).toBeTypeOf("function");
    if (typeof assertRuntimeAuthority !== "function") return;

    expect(assertRuntimeAuthority(
      "local|generation_active|https://auth.mumeok.kr/auth/v1\n",
    )).toEqual({
      account_generation_capability: "generation_active",
      auth_authority: "local",
      local_issuer_ready: true,
    });
    expect(() => assertRuntimeAuthority("remote|legacy|\n"))
      .toThrowError(expect.objectContaining({
        code: "local_session_authority_unavailable",
        safeFailure: {
          code: "local_session_authority_unavailable",
          message: "Stage 4 local session authority is not active",
        },
      }));
  });

  it("scopes the account quarantine QA fixture to one loopback support capture", () => {
    const buildCookie = (
      stage4Isolated as unknown as Record<string, unknown>
    ).buildStage4AccountQuarantineFixtureCookie;
    const buildScope = (
      stage4Isolated as unknown as Record<string, unknown>
    ).buildStage4QaFixtureScope;

    expect(buildCookie).toBeTypeOf("function");
    expect(buildScope).toBeTypeOf("function");
    if (typeof buildCookie !== "function" || typeof buildScope !== "function") {
      return;
    }

    expect(buildCookie("http://127.0.0.1:3100")).toEqual({
      name: "homecook.qa-account-quarantine-state",
      sameSite: "Lax",
      secure: false,
      url: "http://127.0.0.1:3100",
      value: "auth-absent",
    });
    expect(buildScope()).toEqual(["ACCOUNT_QUARANTINE:auth-absent"]);
    expect(() => buildCookie("https://example.com")).toThrow(/loopback/iu);
    expect(() => buildCookie("http://127.0.0.1:3100/untrusted"))
      .toThrow(/origin|path/iu);

    const runner = read(runnerPath);
    expect(runner).toContain(
      'HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE: "1"',
    );
    expect(runner).not.toContain('HOMECOOK_ENABLE_QA_FIXTURES: "1"');
    expect(runner).not.toContain("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES");

    const quarantineFixture = read(quarantineFixturePath);
    expect(quarantineFixture).toContain(
      "HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE",
    );
    const sharedFixture = read(sharedFixturePath);
    expect(sharedFixture).toContain("HOMECOOK_ENABLE_QA_FIXTURES");
    expect(sharedFixture).not.toContain(
      "HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE",
    );

    const sharedFixtureRoutes = [
      "app/api/v1/recipes/route.ts",
      "app/api/v1/ingredients/route.ts",
      "app/api/v1/cooking-methods/route.ts",
      "app/api/v1/planner/route.ts",
      "app/api/v1/leftovers/route.ts",
      "app/api/v1/meals/route.ts",
    ];
    for (const routePath of sharedFixtureRoutes) {
      const route = read(routePath);
      expect(route).toMatch(
        /is(?:DiscoveryFilterManualMock|QaFixtureMode)Enabled/u,
      );
      expect(route).not.toContain(
        "HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE",
      );
    }

    const capture = read(scriptPath);
    expect(capture).toContain(
      "guestContext.addCookies([buildStage4AccountQuarantineFixtureCookie(baseUrl)])",
    );
    expect(capture).not.toContain("homecook.e2e-auth-override");
    expect(capture).not.toMatch(/(?:page|context|guestContext)\.route\(/u);
    expect(capture.match(/\.addCookies\(/gu)).toHaveLength(1);
    expect(capture).toContain("target_attestation: targetAttestation");
    expect(capture.indexOf("guestContext.addCookies(["))
      .toBeLessThan(capture.indexOf("await captureScreen({", capture.indexOf("guestContext.addCookies([")));
  });

  it("keeps the proxy event loop live while the bounded browser child runs", async () => {
    const runBrowserCapture = (
      stage4Isolated as unknown as Record<string, unknown>
    ).runStage4BrowserCaptureCommand;
    expect(runBrowserCapture).toBeTypeOf("function");
    if (typeof runBrowserCapture !== "function") return;

    const run = runBrowserCapture as (options: {
      args: string[];
      command: string;
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeoutMs: number;
    }) => Promise<void>;
    let eventLoopTicked = false;
    const running = run({
      args: ["-e", "setTimeout(() => process.exit(0), 80)"],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 1_000,
    });
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        eventLoopTicked = true;
        resolve();
      });
    });
    expect(eventLoopTicked).toBe(true);
    await expect(running).resolves.toBeUndefined();

    await expect(run({
      args: ["-e", "process.exit(7)"],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 1_000,
    })).rejects.toMatchObject({
      code: "browser_capture_failed",
      safeFailure: {
        code: "browser_capture_failed",
        message: "Stage 4 browser capture command failed",
      },
    });
    await expect(run({
      args: [],
      command: "homecook-stage4-command-that-does-not-exist",
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 1_000,
    })).rejects.toMatchObject({
      code: "browser_capture_start_failed",
      safeFailure: {
        code: "browser_capture_start_failed",
        message: "Stage 4 browser capture command failed to start",
      },
    });
    await expect(run({
      args: ["-e", "setInterval(() => {}, 1_000)"],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 50,
    })).rejects.toMatchObject({
      code: "browser_capture_timeout",
      safeFailure: {
        code: "browser_capture_timeout",
        message: "Stage 4 browser capture command timed out",
      },
    });

    const runner = read(runnerPath);
    expect(runner).toContain("await runStage4BrowserCaptureCommand({");
    const captureStart = runner.indexOf(
      "await runStage4BrowserCaptureCommand({",
    );
    const captureEnd = runner.indexOf(
      'phases.push("browser-capture-complete")',
      captureStart,
    );
    const captureBlock = runner.slice(captureStart, captureEnd);
    expect(captureBlock).toContain('command: "pnpm"');
    expect(captureBlock).toContain('"capture:cooking-meal-log-stage4"');
    expect(captureBlock).not.toMatch(/^\s*run\(/mu);
  });

  it("bounds all three browser navigations at sixty seconds", () => {
    const buildNavigationOptions = (
      stage4Isolated as unknown as Record<string, unknown>
    ).buildStage4NavigationOptions;
    expect(buildNavigationOptions).toBeTypeOf("function");
    if (typeof buildNavigationOptions !== "function") return;

    expect((buildNavigationOptions as () => unknown)()).toEqual({
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });

    const capture = read(scriptPath);
    expect(capture.match(/buildStage4NavigationOptions\(\)/gu)).toHaveLength(3);
    expect(capture).not.toMatch(/setDefault(?:Navigation)?Timeout/gu);
  });

  it("parses capture options with or without the pnpm separator", () => {
    const parseCaptureArgs = (
      stage4Isolated as unknown as Record<string, unknown>
    ).parseStage4CaptureArgs;
    expect(parseCaptureArgs).toBeTypeOf("function");
    if (typeof parseCaptureArgs !== "function") return;

    const parse = parseCaptureArgs as (
      argv: string[],
      options?: { env?: Record<string, string | undefined> },
    ) => {
      attemptId: string | null;
      baseUrl: string;
      targetAttestation: string | null;
    };
    const expected = {
      attemptId: "stage4-parser-attempt",
      baseUrl: "http://127.0.0.1:3102",
      targetAttestation: "/tmp/target-attestation.json",
    };
    const options = [
      "--attempt-id",
      expected.attemptId,
      "--base-url",
      expected.baseUrl,
      "--target-attestation",
      expected.targetAttestation,
    ];

    expect(parse(options, { env: {} })).toEqual(expected);
    expect(parse(["--", ...options], { env: {} })).toEqual(expected);
    expect(parse([
      "--unknown-option",
      "ignored-value",
      ...options,
    ], { env: {} })).toEqual(expected);
    expect(parse([
      "--unknown-option",
      ...options,
    ], { env: {} })).toEqual(expected);
    expect(() => parse(["--attempt-id"], { env: {} }))
      .toThrow(/requires a value/u);
  });

  it("links only the repository scripts and QA fixtures into the disposable root", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "homecook-stage4-seed-inputs-"));
    const repositoryRoot = join(tempRoot, "repository");
    const isolatedRoot = join(tempRoot, "isolated");
    const fixtureContents = '{"fixture":"unchanged"}\n';
    mkdirSync(join(repositoryRoot, "scripts"), { recursive: true });
    mkdirSync(join(repositoryRoot, "qa", "fixtures"), { recursive: true });
    mkdirSync(isolatedRoot, { recursive: true });
    writeFileSync(
      join(repositoryRoot, "qa", "fixtures", "slices-01-05.json"),
      fixtureContents,
    );

    const linkSeedInputs = (
      stage4Isolated as unknown as Record<string, unknown>
    ).linkStage4SeedInputs;
    expect(linkSeedInputs).toBeTypeOf("function");
    if (typeof linkSeedInputs !== "function") return;

    try {
      const linked = await (linkSeedInputs as (options: {
        isolatedRoot: string;
        repositoryRoot: string;
      }) => Promise<{ fixtures: string; scripts: string }>)({
        isolatedRoot,
        repositoryRoot,
      });

      expect(linked).toEqual({
        fixtures: join(isolatedRoot, "qa", "fixtures"),
        scripts: join(isolatedRoot, "scripts"),
      });
      expect(lstatSync(linked.scripts).isSymbolicLink()).toBe(true);
      expect(lstatSync(linked.fixtures).isSymbolicLink()).toBe(true);
      expect(readFileSync(
        join(linked.fixtures, "slices-01-05.json"),
        "utf8",
      )).toBe(fixtureContents);
      expect(readFileSync(
        join(repositoryRoot, "qa", "fixtures", "slices-01-05.json"),
        "utf8",
      )).toBe(fixtureContents);

      await expect((linkSeedInputs as (options: {
        isolatedRoot: string;
        repositoryRoot: string;
      }) => Promise<unknown>)({ isolatedRoot, repositoryRoot }))
        .rejects.toThrow(/must be absent/u);

      const runner = read(runnerPath);
      expect(runner.indexOf("await linkStage4SeedInputs({"))
        .toBeLessThan(runner.indexOf("await runStage4ShadowSeedLifecycle({"));
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("uses the shadow seed API before Next without weakening the primary guard", () => {
    const runner = read(runnerPath);
    expect(runner.indexOf("await runStage4ShadowSeedLifecycle({"))
      .toBeLessThan(runner.indexOf("const appPort = await findAppPort"));
    expect(runner.indexOf("await startStage4GuardedDataApi({"))
      .toBeLessThan(runner.indexOf("const appPort = await findAppPort"));
    expect(runner.indexOf("await startStage4GuardedDataProxy({"))
      .toBeLessThan(runner.indexOf("const appPort = await findAppPort"));
    expect(runner).toContain("dataUpstreamUrl: guardedDataApi.url");
    expect(runner).toContain("storageUpstreamUrl: status.API_URL");
    expect(runner).toContain("apiUrl: guardedDataProxy.url");
    expect(runner).not.toContain("x-homecook-internal-scope");
    expect(runner).not.toContain("ALTER ROLE authenticator RESET");
    for (const field of [
      "guarded_data_api_used",
      "negative_probe_passed",
      "primary_guard_unchanged",
      "shadow_seed_api_removed",
      "shadow_seed_api_used",
    ]) {
      expect(runner).toContain(field);
    }
  });

  it("removes the shadow seed API before the exact primary negative probe", () => {
    const runner = read(runnerPath);
    const lifecycle = read(shadowSeedHelperPath);
    expect(lifecycle.indexOf("await removeShadow()"))
      .toBeLessThan(lifecycle.indexOf("await negativeProbe()"));
    expect(read(isolatedHelperPath)).toContain(
      'new URL("/rest/v1/users?select=id&limit=1", apiUrl)',
    );
    expect(runner).toContain("serviceRoleKey: status.SERVICE_ROLE_KEY");
  });

  it("uses exact SQL arguments and only an owned disposable database container", () => {
    expect(STAGE4_PRIMARY_GUARD_VERIFY_SQL).toContain(
      "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request",
    );
    expect(STAGE4_PRIMARY_GUARD_VERIFY_SQL).not.toMatch(
      /ALTER ROLE|NOTIFY|capability|activate/u,
    );

    expect(assertStage4OwnedDatabaseContainer({
      containers: [{
        id: "owned-db-id",
        name: "supabase_db_hcg_1234_abcdef",
        project: "hcg_1234_abcdef",
      }],
      projectId: "hcg_1234_abcdef",
    })).toBe("owned-db-id");
    expect(() => assertStage4OwnedDatabaseContainer({
      containers: [{
        id: "root-db-id",
        name: "supabase_db_hcg_1234_abcdef",
        project: "homecook",
      }],
      projectId: "hcg_1234_abcdef",
    })).toThrow(/owned disposable database/u);
    expect(() => assertStage4OwnedDatabaseContainer({
      containers: [{
        id: "other-db-id",
        name: "supabase_db_other",
        project: "hcg_1234_abcdef",
      }],
      projectId: "hcg_1234_abcdef",
    })).toThrow(/owned disposable database/u);
  });

  it("accepts only the primary guard and the expected negative Data API probe", () => {
    expect(assertStage4PreRequestGuardOutput(
      "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request\n",
    )).toBe(true);
    expect(() => assertStage4PreRequestGuardOutput("secret wrong guard"))
      .toThrow("Stage 4 pre-request guard verification failed");

    expect(assertStage4NegativeProbeResult({
      payload: { code: "55000", message: "ACCOUNT_SESSION_STALE" },
      status: 500,
    })).toBe(true);
    expect(() => assertStage4NegativeProbeResult({
      payload: { code: "55000", message: "provider secret payload" },
      status: 500,
    })).toThrow("Stage 4 primary guard negative probe failed");
    expect(() => assertStage4NegativeProbeResult({
      payload: {
        code: "55000",
        message: "UNRELATED_FAILURE_ACCOUNT_SESSION_STALE",
      },
      status: 500,
    })).toThrow("Stage 4 primary guard negative probe failed");
    expect(() => assertStage4NegativeProbeResult({
      payload: { code: " 55000 ", message: "ACCOUNT_SESSION_STALE" },
      status: 500,
    })).toThrow("Stage 4 primary guard negative probe failed");
  });

  it("keeps every Stage 4 runtime guard source on the public entrypoint", () => {
    const oldGuard = "pgrst.db_pre_request=private.verify_hybrid_request_authority";
    const publicGuard =
      "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request";
    for (const sourcePath of [isolatedHelperPath, shadowSeedHelperPath]) {
      const source = read(sourcePath);
      expect(source).toContain(publicGuard);
      expect(source).not.toContain(oldGuard);
    }
    const runner = read(runnerPath);
    expect(runner).toContain(
      "PGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request",
    );
    expect(runner).not.toContain(
      "PGRST_DB_PRE_REQUEST=private.verify_hybrid_request_authority",
    );
  });

  it("waits through delayed success responses until the primary guard rejects", async () => {
    const responses = [
      { payload: { id: "unguarded" }, status: 200 },
      { payload: { id: "still-unguarded" }, status: 200 },
      {
        payload: {
          code: "55000",
          message: "ACCOUNT_SESSION_STALE",
          raw_code_is_exact: true,
        },
        status: 500,
      },
    ];
    let now = 0;

    await expect(pollStage4NegativeProbe({
      now: () => now,
      probe: async () => responses.shift(),
      sleep: async (durationMs) => {
        now += durationMs;
      },
      timeoutMs: 10_000,
    })).resolves.toEqual({
      attempt_count: 3,
      http_status: 500,
      provider_code: "55000",
      reason_code: "ACCOUNT_SESSION_STALE",
      transport_code: "json_response",
    });
  });

  it.each([
    { expectedDiagnosticCode: "55000", providerCode: " 55000 " },
    { expectedDiagnosticCode: "unknown", providerCode: 55000 },
    { expectedDiagnosticCode: "unknown", providerCode: { toString: () => "55000" } },
  ])(
    "rejects a non-exact provider code through the full request-to-poll path: $providerCode",
    async ({ expectedDiagnosticCode, providerCode }) => {
      await expect(pollStage4NegativeProbe({
        probe: ({ observe, signal }: {
          observe: (value: unknown) => void;
          signal: AbortSignal;
        }) => requestStage4NegativeProbe({
          apiUrl: "http://127.0.0.1:58101",
          fetchImpl: async () => new Response(JSON.stringify({
            code: providerCode,
            message: "ACCOUNT_SESSION_STALE",
          }), { status: 500 }),
          onObservation: observe,
          serviceRoleKey: "local-service-role-key",
          signal,
        }),
        timeoutMs: 10_000,
      })).rejects.toMatchObject({
        code: "negative_probe_unexpected",
        safeFailure: {
          attempt_count: 1,
          last_http_status: 500,
          last_provider_code: expectedDiagnosticCode,
          last_reason_code: "ACCOUNT_SESSION_STALE",
        },
      });
    },
  );

  it("preserves an HTTP 500 status without exposing an invalid response body", async () => {
    const observations: unknown[] = [];
    const result = await requestStage4NegativeProbe({
      apiUrl: "http://127.0.0.1:58101",
      fetchImpl: async () => new Response("raw-provider-secret", { status: 500 }),
      onObservation: (observation) => { observations.push(observation); },
      serviceRoleKey: "local-service-role-key",
    });

    expect(result).toEqual({
      payload: null,
      status: 500,
      transportCode: "invalid_json",
    });
    expect(observations).toEqual([
      { status: 500, transportCode: "http_response" },
      { status: 500, transportCode: "invalid_json" },
    ]);
    expect(JSON.stringify({ observations, result })).not.toContain(
      "raw-provider-secret",
    );
  });

  it("classifies refused, aborted, and other fetch failures without raw output", async () => {
    const cases = [
      {
        error: Object.assign(new TypeError("raw-refused-secret"), {
          cause: { code: "ECONNREFUSED" },
        }),
        transportCode: "connection_refused",
      },
      {
        error: new DOMException("raw-aborted-secret", "AbortError"),
        transportCode: "timeout_aborted",
      },
      {
        error: new TypeError("raw-network-secret"),
        transportCode: "network_error",
      },
    ];

    for (const testCase of cases) {
      const result = await requestStage4NegativeProbe({
        apiUrl: "http://127.0.0.1:58101",
        fetchImpl: async () => { throw testCase.error; },
        serviceRoleKey: "local-service-role-key",
      });
      expect(result).toEqual({
        payload: null,
        status: null,
        transportCode: testCase.transportCode,
      });
      expect(JSON.stringify(result)).not.toContain("raw-");
    }
  });

  it("cancels the response stream when the safe probe body limit is reached", async () => {
    let cancelled = false;
    let reads = 0;
    const result = await requestStage4NegativeProbe({
      apiUrl: "http://127.0.0.1:58101",
      fetchImpl: async () => ({
        body: {
          getReader: () => ({
            cancel: async () => { cancelled = true; },
            read: async () => {
              reads += 1;
              return reads === 1
                ? { done: false, value: new Uint8Array(4_096).fill(123) }
                : { done: false, value: new TextEncoder().encode("raw-secret") };
            },
          }),
        },
        status: 500,
      }) as unknown as Response,
      serviceRoleKey: "local-service-role-key",
    });

    expect(result).toEqual({
      payload: null,
      status: 500,
      transportCode: "invalid_json",
    });
    expect(reads).toBe(1);
    expect(cancelled).toBe(true);
  });

  it("returns only safe timing fields when a primary guard probe times out", async () => {
    let now = 0;

    await expect(pollStage4NegativeProbe({
      intervalMs: 5_000,
      now: () => now,
      probe: async () => ({ payload: { secret: "unguarded" }, status: 200 }),
      sleep: async (durationMs) => {
        now += durationMs;
      },
      timeoutMs: 10_000,
    })).rejects.toMatchObject({
      code: "negative_probe_timeout",
      safeFailure: {
        attempt_count: 2,
        code: "negative_probe_timeout",
        last_http_status: 200,
        last_provider_code: "unknown",
        last_reason_code: "unknown",
      },
    });
  });

  it("fails safely and immediately when the negative probe returns a wrong error", async () => {
    await expect(pollStage4NegativeProbe({
      probe: async () => ({
        payload: { code: "42501", message: "provider secret payload" },
        status: 403,
      }),
      timeoutMs: 10_000,
    })).rejects.toMatchObject({
      code: "negative_probe_unexpected",
      safeFailure: {
        attempt_count: 1,
        code: "negative_probe_unexpected",
        last_http_status: 403,
        last_provider_code: "42501",
        last_reason_code: "unknown",
      },
    });
  });

  it("rejects a reason that only contains the primary guard reason as a substring", async () => {
    await expect(pollStage4NegativeProbe({
      probe: async () => ({
        payload: {
          code: "55000",
          message: "UNRELATED_FAILURE_ACCOUNT_SESSION_STALE",
        },
        status: 500,
      }),
      timeoutMs: 10_000,
    })).rejects.toMatchObject({
      code: "negative_probe_unexpected",
      safeFailure: {
        attempt_count: 1,
        code: "negative_probe_unexpected",
        last_http_status: 500,
        last_provider_code: "55000",
        last_reason_code: "unknown",
      },
    });
  });

  it("rejects an exact guard response that arrives after the total deadline", async () => {
    let now = 0;

    await expect(pollStage4NegativeProbe({
      now: () => now,
      probe: async () => {
        now = 15_001;
        return {
          payload: {
            code: "55000",
            message: "ACCOUNT_SESSION_STALE",
            raw_code_is_exact: true,
          },
          status: 500,
        };
      },
      timeoutMs: 15_000,
    })).rejects.toMatchObject({
      code: "negative_probe_timeout",
      safeFailure: {
        attempt_count: 1,
        code: "negative_probe_timeout",
        last_http_status: 500,
        last_provider_code: "55000",
        last_reason_code: "ACCOUNT_SESSION_STALE",
      },
    });
  });

  it("aborts a slow probe at its remaining total deadline", async () => {
    vi.useFakeTimers();
    let now = 0;
    const attemptSignals: AbortSignal[] = [];

    try {
      const pending = pollStage4NegativeProbe({
        now: () => now,
        probe: async ({
          observe,
          signal,
        }: {
          observe: (value: unknown) => void;
          signal: AbortSignal;
        }) => {
          attemptSignals.push(signal);
          observe({ status: 500, transportCode: "http_response" });
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              now = 10_000;
              reject(new Error("aborted"));
            }, { once: true });
          });
        },
        timeoutMs: 10_000,
      });
      const settled = pending.catch((error) => error);

      await vi.advanceTimersByTimeAsync(10_000);
      const failure = await settled;
      expect(failure).toMatchObject({
        code: "negative_probe_timeout",
        safeFailure: {
          attempt_count: 1,
          code: "negative_probe_timeout",
          last_http_status: 500,
          last_transport_code: "http_response",
        },
      });
      expect(attemptSignals).toHaveLength(1);
      expect(attemptSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("owns every exact automation artifact without route mocks", () => {
    expect(existsSync(join(root, scriptPath))).toBe(true);
    const script = read(scriptPath);
    const automation = JSON.parse(
      read(`docs/workpacks/${slice}/automation-spec.json`),
    );
    const required = automation.frontend.design_authority
      .stage4_evidence_requirements as string[];

    for (const screen of screens) {
      for (const viewport of viewportLabels) {
        const path = `${evidenceRoot}/${screen}-${viewport}.png`;
        expect(required).toContain(path);
        expect(script).toContain(`${screen}-${viewport}.png`);
      }
      expect(required).toContain(`${evidenceRoot}/${screen}-state-matrix.json`);
      expect(script).toContain(`${screen}-state-matrix.json`);
    }
    expect(required).toContain(`${evidenceRoot}/manifest.json`);
    expect(script).toContain("manifest.json");
    expect(script).not.toContain("page.route(");
    expect(script).not.toContain("e2e-auth-override");
    expect(script).not.toContain("mockRoutes");
  });

  it("fails closed on non-local or dirty capture sources and uses both owners", () => {
    const script = read(scriptPath);
    const packageJson = JSON.parse(read("package.json"));

    expect(packageJson.scripts).toMatchObject({
      "capture:cooking-meal-log-stage4":
        "node scripts/capture-cooking-meal-log-stage4-evidence.mjs",
      "capture:cooking-meal-log-stage4:isolated":
        "node scripts/run-cooking-meal-log-stage4-isolated-capture.mjs",
    });
    for (const token of [
      "127.0.0.1",
      "localhost",
      "git status --porcelain",
      "create-only",
      "local-tester@homecook.local",
      "local-other@homecook.local",
      "로컬 테스트 계정으로 시작",
      "다른 테스트 계정으로 시작",
      "source_head_sha",
      "sha256",
      "real_local_stack",
      "fixture_routes: false",
      "owner_boundary",
      "target-attestation",
      "assertStage4ServerEnvironment",
      "assertNoRemoteSupabaseViolations",
      "assertStableProfileIdentity",
      "buildConservativeStateMatrix",
      "canPromoteStage4Evidence",
      "canonical_promotion",
      "summarizeStage4Quality",
      "const stage4Complete = false",
    ]) {
      expect(script).toContain(token);
    }
    expect(script).not.toContain("verifiedStates = [screen.observedState]");
  });

  it("requires a disposable isolated runner instead of the root local stack", () => {
    expect(existsSync(join(root, runnerPath))).toBe(true);
    const runner = read(runnerPath);

    for (const token of [
      "createIsolatedSupabaseProject",
      "buildIsolatedSupabaseStartArgs",
      "assertOwnedDockerResources",
      "assertNoIsolatedDockerResources",
      "migrationSha256",
      "pinned_isolated_local",
      "remote_linked_cloud_access",
      "target-attestation.json",
      "capture:cooking-meal-log-stage4",
      "buildStage4ServerEnvironment",
      "env: serverEnv",
    ]) {
      expect(runner).toContain(token);
    }
    const isolatedHelper = read(isolatedHelperPath);
    for (const token of [
      "HOMECOOK_DATA_AUTHORITY",
      "DATA_SUPABASE_URL",
      "HOMECOOK_AUTH_AUTHORITY",
      "NEXT_PUBLIC_AUTH_SUPABASE_URL",
      "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
      "LOCAL_SUPABASE_INTERNAL_URL",
      "LOCAL_SUPABASE_SECRET_KEY",
    ]) {
      expect(isolatedHelper).toContain(token);
    }
    expect(runner).not.toContain('"supabase", "start"');
    expect(runner).not.toContain("local:reset:demo");
  });

  it("diagnoses disposable service subsets without changing the capture contract", () => {
    const packageJson = JSON.parse(read("package.json"));
    const runner = read(runnerPath);

    expect(packageJson.scripts).toMatchObject({
      "diagnose:cooking-meal-log-stage4:isolated":
        "node scripts/run-cooking-meal-log-stage4-isolated-capture.mjs --diagnostic-only",
    });
    expect(resolveStage4ServiceProfile("db")).toEqual([]);
    expect(resolveStage4ServiceProfile("auth")).toEqual(["gotrue"]);
    expect(resolveStage4ServiceProfile("rest")).toEqual(["postgrest"]);
    expect(resolveStage4ServiceProfile("rest-auth")).toEqual([
      "gotrue",
      "postgrest",
    ]);
    expect(resolveStage4ServiceProfile("gateway")).toEqual([
      "kong",
      "postgrest",
    ]);
    expect(resolveStage4ServiceProfile("api")).toEqual([
      "gotrue",
      "kong",
      "postgrest",
    ]);
    expect(resolveStage4ServiceProfile("storage")).toEqual([
      "gotrue",
      "kong",
      "postgrest",
      "storage-api",
      "imgproxy",
    ]);
    expect(resolveStage4ServiceProfile("full")).toEqual(
      resolveStage4ServiceProfile("storage"),
    );
    expect(() => resolveStage4ServiceProfile("remote"))
      .toThrow(/diagnostic profile/u);
    for (const token of [
      "--diagnostic-only",
      "--diagnostic-profile",
      "stage4-start-diagnostics",
      "diagnostic.json",
      "--yes",
      'if (value === "--") continue;',
      "resolveStage4ServiceProfile",
    ]) {
      expect(runner).toContain(token);
    }
  });

  it("uses the prompt-safe CLI only for Stage 4 isolated startup", () => {
    const runner = read(runnerPath);

    expect(RUNTIME_SUPABASE_CLI_PACKAGE).toBe("supabase@2.110.0");
    expect(stage4Isolated.STAGE4_SUPABASE_CLI_PACKAGE)
      .toBe("supabase@2.109.1");
    expect(stage4Isolated.STAGE4_SUPABASE_CLI_VERSION).toBe("2.109.1");
    expect(stage4Isolated.assertStage4SupabaseCliVersion("2.109.1\n"))
      .toBe("2.109.1");
    expect(() => stage4Isolated.assertStage4SupabaseCliVersion("2.110.0"))
      .toThrow(/2\.109\.1/u);

    expect(runner).toContain("STAGE4_SUPABASE_CLI_PACKAGE");
    expect(runner).toContain("assertStage4SupabaseCliVersion");
    expect(runner).toContain(
      "supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION",
    );
    expect(runner).not.toContain("RUNTIME_SUPABASE_CLI_PACKAGE");
    expect(runner).not.toContain('supabase_cli_version: "2.110.0"');
  });

  it("requires the exact cached Stage 4 service images before disposable startup", () => {
    const images = stage4Isolated.STAGE4_CACHED_DOCKER_IMAGES;
    expect(images).toEqual({
      gotrue: "public.ecr.aws/supabase/gotrue:v2.192.0",
      imgproxy: "public.ecr.aws/supabase/imgproxy:v3.8.0",
      kong: "public.ecr.aws/supabase/kong:2.8.1",
      postgres: "public.ecr.aws/supabase/postgres:17.6.1.143",
      postgrest: "public.ecr.aws/supabase/postgrest:v14.14",
      storage: "public.ecr.aws/supabase/storage-api:v1.62.5",
    });
    expect(resolveStage4RequiredImageTags("db")).toEqual([
      images.postgres,
    ]);
    expect(resolveStage4RequiredImageTags("rest")).toEqual([
      images.postgres,
      images.postgrest,
    ]);
    expect(resolveStage4RequiredImageTags("full")).toEqual([
      images.postgres,
      images.gotrue,
      images.postgrest,
      images.kong,
      images.storage,
      images.imgproxy,
    ]);

    expect(evaluateStage4ImageCache({
      availableImages: [images.postgres],
      profile: "rest",
    })).toEqual({
      available_images: [images.postgres],
      failure: {
        code: "missing_image",
        message: "required Stage 4 Docker image is not cached",
      },
      missing_images: [images.postgrest],
      ready: false,
      required_images: [images.postgres, images.postgrest],
    });
    expect(evaluateStage4ImageCache({
      availableImages: [images.postgrest, images.postgres],
      profile: "rest",
    }).ready).toBe(true);

    const runner = read(runnerPath);
    expect(runner).toMatch(/"docker",\s*\["image", "inspect"/u);
    expect(runner).toContain("missing_image");
    expect(runner).not.toMatch(/docker[^\n]*(pull|tag)/u);
    expect(runner.indexOf("assertStage4CachedImages({"))
      .toBeLessThan(
        runner.indexOf("const isolated = await createIsolatedSupabaseProject"),
      );
    expect(runner.indexOf("readPinnedLocalDockerTarget({"))
      .toBeLessThan(runner.indexOf("await ensureDockerRunning({"));
    expect(runner.indexOf("await ensureDockerRunning({"))
      .toBeLessThan(
        runner.indexOf("availableImages: inspectStage4CachedImages("),
      );
    expect(runner).toContain("{ dockerHost: dockerTarget.docker_host }");
  });

  it("records only sanitized project-owned container state on startup failure", () => {
    const snapshot = buildStage4FailureResourceSnapshot({
      projectId: "hcg_1234_abcdef",
      resources: [
        {
          Config: {
            Env: ["SERVICE_ROLE_KEY=must-not-leak"],
            Image: "secret-registry.example/supabase/postgrest:private",
            Labels: {
              "com.docker.compose.project": "hcg_1234_abcdef",
              "com.docker.compose.service": "postgrest",
            },
          },
          HostConfig: { PortBindings: { "3000/tcp": [{ HostPort: "58101" }] } },
          RestartCount: 3,
          State: {
            Health: { Status: "unhealthy" },
            OOMKilled: false,
            Status: "restarting",
          },
        },
      ],
    });

    expect(snapshot).toEqual({
      collection_status: "passed",
      containers: [
        {
          health: "unhealthy",
          oom_killed: false,
          restart_count: 3,
          service: "postgrest",
          state: "restarting",
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /SERVICE_ROLE_KEY|must-not-leak|secret-registry|58101/u,
    );
    expect(() => buildStage4FailureResourceSnapshot({
      projectId: "hcg_1234_abcdef",
      resources: [
        {
          Config: {
            Labels: {
              "com.docker.compose.project": "homecook",
              "com.docker.compose.service": "postgrest",
            },
          },
          State: { Status: "running" },
        },
      ],
    })).toThrow(/project/u);

    const runner = read(runnerPath);
    expect(runner).toContain("failureResourceSnapshot");
    expect(runner).toContain("failure_resource_snapshot");
    expect(runner).not.toContain("docker logs");
  });

  it("classifies startup failures without retaining raw environment values", () => {
    expect(classifyStage4StartFailure(
      new Error("supabase start timed out after 300000ms SERVICE_ROLE_KEY=secret"),
    )).toEqual({
      code: "start_timeout",
      message: "isolated Supabase startup timed out",
    });
    expect(classifyStage4StartFailure(
      new Error("docker daemon unavailable token=secret"),
    )).toEqual({
      code: "docker_unavailable",
      message: "Docker is unavailable for isolated startup",
    });
    expect(classifyStage4StartFailure(new Error("unexpected secret payload")))
      .toEqual({
        code: "start_failed",
        message: "isolated Supabase startup failed",
      });
  });

  it("never exposes credential-looking Supabase command output", () => {
    const sentinel =
      "eyJhbGciOiJIUzI1NiJ9.disposable-service-role-secret.signature";
    const failed = buildStage4SensitiveCommandError({
      label: "isolated Supabase startup",
      result: {
        error: null,
        status: 1,
        stderr: `SERVICE_ROLE_KEY=${sentinel}`,
        stdout: `ANON_KEY=${sentinel}`,
      },
      timeoutMs: 120_000,
    });
    const timedOut = buildStage4SensitiveCommandError({
      label: "isolated Supabase startup",
      result: {
        error: { code: "ETIMEDOUT" },
        status: null,
        stderr: `JWT_SECRET=${sentinel}`,
        stdout: sentinel,
      },
      timeoutMs: 120_000,
    });

    expect(failed.message).toBe(
      "isolated Supabase startup failed with status 1",
    );
    expect((failed as Error & { code: string }).code)
      .toBe("sensitive_command_failed");
    expect(timedOut.message).toBe(
      "isolated Supabase startup timed out after 120000ms",
    );
    expect((timedOut as Error & { code: string }).code)
      .toBe("sensitive_command_timeout");
    expect(JSON.stringify({ failed, timedOut })).not.toContain(sentinel);
    expect(JSON.stringify([
      classifyStage4StartFailure(failed),
      classifyStage4StartFailure(timedOut),
    ])).not.toContain(sentinel);

    const runner = read(runnerPath);
    expect(runner.indexOf("if (sensitiveOutput)"))
      .toBeLessThan(runner.indexOf("result.stderr?.trim()"));
    expect(runner).toMatch(
      /buildIsolatedSupabaseStartArgs[\s\S]{0,700}sensitiveOutput: true/u,
    );
    for (const label of [
      "isolated Supabase database reset",
      "isolated Supabase status",
      "isolated Supabase demo seed",
      "isolated Supabase cleanup",
    ]) {
      expect(runner).toContain(`sensitiveLabel: "${label}"`);
    }
  });

  it("classifies demo seed failures by phase without retaining raw output", () => {
    const sentinel =
      "eyJhbGciOiJIUzI1NiJ9.disposable-seed-secret.signature";
    const cases = [
      {
        code: "seed_dependency_missing",
        stderr: `ERR_MODULE_NOT_FOUND Cannot find package x ${sentinel}`,
      },
      {
        code: "seed_file_missing",
        stderr: `ENOENT no such file or directory ${sentinel}`,
      },
      {
        code: "seed_target_unreachable",
        stderr: `fetch failed ECONNREFUSED ${sentinel}`,
      },
      {
        code: "seed_schema_missing",
        stderr: `relation public.users does not exist SQLSTATE 42P01 ${sentinel}`,
      },
      {
        code: "seed_auth_failed",
        stderr: `invalid login credentials unauthorized ${sentinel}`,
      },
      {
        code: "seed_auth_failed",
        stderr: `auth user 생성 실패 (${sentinel})`,
      },
      {
        code: "seed_bootstrap_missing",
        stderr: `demo dataset용 recipe book을 찾지 못했어요. ${sentinel}`,
      },
      {
        code: "seed_bootstrap_missing",
        stderr: `planner column을 찾지 못했어요. ${sentinel}`,
      },
      {
        code: "seed_data_operation_failed",
        stderr: `public users 조회 실패 (${sentinel})`,
      },
      {
        code: "seed_core_qa_failed",
        stderr: `qa-seed-slices-01-05 failed ${sentinel}`,
      },
      {
        code: "seed_failed",
        stderr: `unexpected seed failure ${sentinel}`,
      },
    ];

    for (const testCase of cases) {
      const failure = classifyStage4SeedFailureOutput({
        stderr: testCase.stderr,
        stdout: `SERVICE_ROLE_KEY=${sentinel}`,
      });
      expect(failure).toMatchObject({
        code: testCase.code,
        phase: "demo_seed",
      });
      expect(JSON.stringify(failure)).not.toContain(sentinel);
    }

    expect(classifyStage4SeedFailureOutput({
      stderr: sentinel,
      stdout: "",
      timedOut: true,
    })).toMatchObject({
      code: "seed_target_unreachable",
      phase: "demo_seed",
    });

    const runner = read(runnerPath);
    expect(runner).toContain("onPhase: (phase) => phases.push(phase)");
    expect(read(shadowSeedHelperPath)).toContain('onPhase("demo-seed-begin")');
    expect(runner).toContain(
      "sensitiveFailureClassifier: classifyStage4SeedFailureOutput",
    );
  });

  it("preserves the primary failure while cleanup failure forces a failed result", () => {
    const primaryFailure = {
      code: "start_timeout",
      message: "isolated Supabase startup timed out",
    };

    expect(buildStage4DiagnosticOutcome({
      cleanupError: new Error("cleanup leaked SERVICE_ROLE_KEY=secret"),
      diagnosticStatus: "passed",
      primaryFailure,
    })).toEqual({
      cleanupFailure: {
        code: "cleanup_failed",
        message: "isolated Supabase cleanup failed",
      },
      failure: primaryFailure,
      status: "failed",
    });

    expect(buildStage4DiagnosticOutcome({
      cleanupError: new Error("cleanup only token=secret"),
      diagnosticStatus: "passed",
      primaryFailure: null,
    })).toEqual({
      cleanupFailure: {
        code: "cleanup_failed",
        message: "isolated Supabase cleanup failed",
      },
      failure: {
        code: "cleanup_failed",
        message: "isolated Supabase cleanup failed",
      },
      status: "failed",
    });
  });

  it("rejects duplicate diagnostic attempts before disposable lifecycle setup", () => {
    const diagnosticRoot = mkdtempSync(
      join(tmpdir(), "homecook-stage4-diagnostic-test-"),
    );
    try {
      assertStage4DiagnosticAttemptAvailable({
        attemptId: "fresh-attempt",
        diagnosticRoot,
      });
      mkdirSync(join(diagnosticRoot, "duplicate-attempt"));
      expect(() => assertStage4DiagnosticAttemptAvailable({
        attemptId: "duplicate-attempt",
        diagnosticRoot,
      })).toThrow(/already exists/u);

      const runner = read(runnerPath);
      expect(runner.indexOf("assertStage4DiagnosticAttemptAvailable({"))
        .toBeLessThan(
          runner.indexOf("const isolated = await createIsolatedSupabaseProject"),
        );
    } finally {
      rmSync(diagnosticRoot, { force: true, recursive: true });
    }
  });

  it("validates the server-side target attestation before capture", () => {
    const valid = {
      api_url: "http://127.0.0.1:4313",
      app_origin: "http://127.0.0.1:3100",
      auth_api_url: "http://127.0.0.1:58101",
      docker: { containers: 6, networks: 1, volumes: 2 },
      generated_at: "2026-08-21T06:00:00.000Z",
      guarded_data_api_url: "http://127.0.0.1:4314",
      guarded_data_api_used: true,
      guarded_data_proxy_used: true,
      migration_sha256: "a".repeat(64),
      negative_probe_passed: true,
      pinned_isolated_local: true,
      ports: { app: 3100, auth: 58101, base: 58100, data: 4313, guarded: 4314 },
      primary_guard_unchanged: true,
      project_id: "hcg_1234_abcdef",
      qa_fixture_scope: ["ACCOUNT_QUARANTINE:auth-absent"],
      remote_linked_cloud_access: 0,
      server_env_sha256: "b".repeat(64),
      server_env_target: "isolated-supabase",
      shadow_seed_api_removed: true,
      shadow_seed_api_used: true,
      source_head_sha: "c".repeat(40),
      supabase_cli_version: "2.109.1",
    };

    const projected = validateStage4TargetAttestation(valid, valid.app_origin);
    expect(projected).toEqual(valid);
    expect(projected).not.toBe(valid);
    expect(projected.docker).not.toBe(valid.docker);
    expect(projected.ports).not.toBe(valid.ports);
    expect(projected.qa_fixture_scope).not.toBe(valid.qa_fixture_scope);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      qa_fixture_scope: [
        "ACCOUNT_QUARANTINE:auth-absent",
        "HOME:fixture",
      ],
    }, valid.app_origin)).toThrow(/fixture|scope/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      qa_fixture_scope: ["ACCOUNT_QUARANTINE:unauthorized"],
    }, valid.app_origin)).toThrow(/fixture|scope/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      api_url: "https://example.supabase.co",
    }, valid.app_origin)).toThrow(/loopback/u);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      auth_api_url: "https://example.supabase.co",
    }, valid.app_origin)).toThrow(/loopback/u);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      ports: { ...valid.ports, app: 3101 },
    }, valid.app_origin)).toThrow(/app.*port/iu);
    const appDataCollision = {
      ...valid,
      app_origin: valid.api_url,
      ports: { ...valid.ports, app: valid.ports.data },
    };
    expect(() => validateStage4TargetAttestation(
      appDataCollision,
      appDataCollision.app_origin,
    )).toThrow(/distinct|overlap/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      guarded_data_api_url: valid.api_url,
      ports: { ...valid.ports, guarded: valid.ports.data },
    }, valid.app_origin)).toThrow(/guarded.*distinct|overlap/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      guarded_data_api_url: "http://127.0.0.1:58102",
      ports: { ...valid.ports, guarded: 58102 },
    }, valid.app_origin)).toThrow(/guarded.*range|overlap/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      pinned_isolated_local: false,
    }, valid.app_origin)).toThrow(/pinned isolated/u);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      negative_probe_passed: false,
    }, valid.app_origin)).toThrow(/shadow seed/u);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      shadow_seed_api_removed: false,
    }, valid.app_origin)).toThrow(/shadow seed/u);

    for (const [field, value] of [
      ["api_url", "http://user:embedded-secret@127.0.0.1:4313"],
      ["auth_api_url", "http://127.0.0.1:58101/untrusted"],
      ["app_origin", "http://127.0.0.1:3100?raw=payload"],
      ["guarded_data_api_url", "http://127.0.0.1:4314#raw-secret"],
    ] as const) {
      expect(() => validateStage4TargetAttestation({
        ...valid,
        [field]: value,
      }, field === "app_origin" ? value : valid.app_origin), field)
        .toThrow(/origin|credential|path|query|hash/iu);
    }
    expect(() => validateStage4TargetAttestation({
      ...valid,
      raw_secret_payload: "must-never-be-preserved",
    }, valid.app_origin)).toThrow(/schema|unknown/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      docker: { ...valid.docker, raw_secret_payload: "forbidden" },
    }, valid.app_origin)).toThrow(/schema|unknown/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      ports: { ...valid.ports, secret_port: 9999 },
    }, valid.app_origin)).toThrow(/schema|unknown/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      generated_at: "not-an-iso-timestamp",
    }, valid.app_origin)).toThrow(/generated/iu);
    expect(() => validateStage4TargetAttestation({
      ...valid,
      supabase_cli_version: "2.110.0",
    }, valid.app_origin)).toThrow(/CLI/iu);
  });

  it("skips every broad Docker cleanup action when auxiliary identity is contested", () => {
    const contested = Object.assign(
      new Error("Stage 4 auxiliary Docker identity could not be proven"),
      {
        code: "auxiliary_identity_mismatch",
        safeFailure: {
          code: "auxiliary_identity_mismatch",
          message: "Stage 4 auxiliary Docker identity could not be proven",
        },
      },
    );
    const fallbackCleanup = vi.fn();
    const stopCleanup = vi.fn(() => true);
    const verifyCleanup = vi.fn();

    expect(() => runStage4DockerCleanup({
      contestedError: contested,
      fallbackCleanup,
      stopCleanup,
      verifyCleanup,
    })).toThrow(contested);
    expect(stopCleanup).not.toHaveBeenCalled();
    expect(fallbackCleanup).not.toHaveBeenCalled();
    expect(verifyCleanup).not.toHaveBeenCalled();

    expect(buildStage4DiagnosticOutcome({
      cleanupError: contested,
      diagnosticStatus: "passed",
      primaryFailure: null,
    })).toEqual({
      cleanupFailure: contested.safeFailure,
      failure: contested.safeFailure,
      status: "failed",
    });
  });

  it("binds attestation to the exact official isolated Auth and Data environment", () => {
    const env = buildStage4ServerEnvironment({
      ambient: {
        DATA_SUPABASE_URL: "https://remote.example.supabase.co",
        HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE: "1",
        HOMECOOK_ENABLE_QA_FIXTURES: "1",
        NEXT_PUBLIC_AUTH_SUPABASE_URL: "https://remote.example.supabase.co",
        NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES: "1",
      },
      anonKey: "isolated-anon",
      apiUrl: "http://127.0.0.1:4313",
      appOrigin: "http://127.0.0.1:3100",
      authApiUrl: "http://127.0.0.1:58101",
      serviceRoleKey: "isolated-service-role",
    });
    const digest = hashStage4ServerTarget(env);
    const attestation = {
      api_url: "http://127.0.0.1:4313",
      app_origin: "http://127.0.0.1:3100",
      auth_api_url: "http://127.0.0.1:58101",
      docker: { containers: 6, networks: 1, volumes: 2 },
      guarded_data_api_url: "http://127.0.0.1:4314",
      migration_sha256: "a".repeat(64),
      pinned_isolated_local: true,
      ports: { app: 3100, auth: 58101, base: 58100, data: 4313, guarded: 4314 },
      project_id: "hcg_1234_abcdef",
      remote_linked_cloud_access: 0,
      server_env_sha256: digest,
      server_env_target: "isolated-supabase",
      source_head_sha: "c".repeat(40),
    };

    expect(env).toMatchObject({
      DATA_SUPABASE_URL: "http://127.0.0.1:4313",
      HOMECOOK_AUTH_AUTHORITY: "local",
      HOMECOOK_DATA_AUTHORITY: "local",
      HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE: "1",
      LOCAL_SUPABASE_INTERNAL_URL: "http://127.0.0.1:58101",
      NEXT_PUBLIC_AUTH_SUPABASE_URL: "http://127.0.0.1:58101",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58101",
    });
    expect("HOMECOOK_ENABLE_QA_FIXTURES" in env).toBe(false);
    expect("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES" in env).toBe(false);
    expect(assertStage4ServerEnvironment(env, attestation)).toBe(digest);
    expect(() => assertStage4ServerEnvironment({
      ...env,
      DATA_SUPABASE_PUBLISHABLE_KEY: "different-isolated-anon",
    }, attestation)).toThrow(/digest/u);
  });

  it("keeps generic screenshot observations semantically unverified", () => {
    expect(buildConservativeStateMatrix({
      observedStateCandidate: "recipe-only",
      requiredStates: ["loading", "error", "recipe-only"],
    })).toEqual({
      observed_state_candidate: "recipe-only",
      pending_states: ["loading", "error", "recipe-only"],
      verified_states: [],
    });
  });

  it("fails quality status on axe, overflow, or touch-target findings", () => {
    expect(summarizeStage4Quality([{ metrics: {
      horizontal_overflow_px: 1,
      serious_or_critical_axe: [],
      touch_target_failures: [],
    } }])).toMatchObject({ quality_status: "failed" });
    expect(summarizeStage4Quality([{ metrics: {
      horizontal_overflow_px: 0,
      serious_or_critical_axe: [],
      touch_target_failures: [],
    } }])).toEqual({
      axe_serious_or_critical: 0,
      horizontal_overflow_observations: 0,
      quality_status: "passed",
      touch_target_failures: 0,
    });
  });

  it("requires one stable main profile across all viewports", () => {
    expect(assertStableProfileIdentity(null, "a".repeat(64))).toBe("a".repeat(64));
    expect(assertStableProfileIdentity("a".repeat(64), "a".repeat(64)))
      .toBe("a".repeat(64));
    expect(() => assertStableProfileIdentity("a".repeat(64), "b".repeat(64)))
      .toThrow(/changed across viewports/u);
  });

  it("retries only an exact ACCOUNT_SESSION_STALE profile bootstrap conflict", async () => {
    const responses = [
      {
        payload: {
          error: {
            code: "ACCOUNT_SESSION_STALE",
            message: "provider-secret-should-not-escape",
          },
          success: false,
        },
        status: 409,
      },
      {
        payload: {
          data: {
            email: "local-tester@homecook.local",
            id: "00000000-0000-4000-8000-000000000001",
          },
          success: true,
        },
        status: 200,
      },
    ];
    let attempts = 0;
    let now = 0;
    const delays: number[] = [];

    await expect(pollStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      expectedId: "00000000-0000-4000-8000-000000000001",
      getDelayMs: ({ attemptCount }: { attemptCount: number }) => attemptCount * 25,
      probe: async () => {
        attempts += 1;
        return responses.shift();
      },
      now: () => now,
      sleep: async (durationMs: number) => {
        delays.push(durationMs);
        now += durationMs;
      },
    })).resolves.toEqual({
      email: "local-tester@homecook.local",
      id: "00000000-0000-4000-8000-000000000001",
    });
    expect(attempts).toBe(2);
    expect(now).toBe(25);
    expect(delays).toEqual([25]);
  });

  it("fails safely when the retry budget is exhausted by stale profile conflicts", async () => {
    let now = 0;
    const delays: number[] = [];

    const pending = pollStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      getDelayMs: ({ attemptCount }: { attemptCount: number }) => attemptCount * 10,
      probe: async () => ({
        payload: {
          error: {
            code: "ACCOUNT_SESSION_STALE",
            message: "provider-secret-should-not-escape",
          },
          success: false,
        },
        status: 409,
      }),
      maxAttempts: 3,
      now: () => now,
      sleep: async (durationMs: number) => {
        delays.push(durationMs);
        now += durationMs;
      },
      timeoutMs: 1_000,
    });

    await expect(pending).rejects.toMatchObject({
      code: "stage4_local_profile_retry_exhausted",
      safeFailure: {
        attempt_count: 3,
        code: "stage4_local_profile_retry_exhausted",
        last_error_code: "ACCOUNT_SESSION_STALE",
        last_http_status: 409,
      },
    });
    await expect(pending).rejects.not.toThrow(/provider-secret-should-not-escape/u);
    expect(delays).toEqual([10, 20]);
  });

  it("fails immediately for non-retryable profile conflicts", async () => {
    await expect(pollStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      probe: async () => ({
        payload: {
          error: {
            code: "ACCOUNT_DELETION_PENDING",
            message: "provider-secret-should-not-escape",
          },
          success: false,
        },
        status: 409,
      }),
    })).rejects.toMatchObject({
      code: "stage4_local_profile_unexpected",
      safeFailure: {
        attempt_count: 1,
        code: "stage4_local_profile_unexpected",
        last_error_code: "ACCOUNT_DELETION_PENDING",
        last_http_status: 409,
      },
    });
  });

  it.each([
    {
      label: "other http error",
      response: {
        payload: {
          error: { code: "unknown", message: "provider-secret-should-not-escape" },
          success: false,
        },
        status: 500,
      },
      safeFailure: {
        last_error_code: "unknown",
        last_http_status: 500,
      },
    },
    {
      label: "malformed success payload",
      response: {
        payload: { data: { email: "local-tester@homecook.local" }, success: true },
        status: 200,
      },
      safeFailure: {
        last_error_code: "unexpected_profile",
        last_http_status: 200,
      },
    },
    {
      label: "service unavailable",
      response: {
        payload: {
          error: { code: "SERVICE_UNAVAILABLE", message: "provider-secret-should-not-escape" },
          success: false,
        },
        status: 503,
      },
      safeFailure: {
        last_error_code: "SERVICE_UNAVAILABLE",
        last_http_status: 503,
      },
    },
  ])("fails immediately for $label", async ({ response, safeFailure }) => {
    await expect(pollStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      probe: async () => response,
    })).rejects.toMatchObject({
      code: "stage4_local_profile_unexpected",
      safeFailure: {
        attempt_count: 1,
        code: "stage4_local_profile_unexpected",
        ...safeFailure,
      },
    });
  });

  it("preserves exact profile email and id verification", async () => {
    await expect(pollStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      expectedId: "00000000-0000-4000-8000-000000000001",
      probe: async () => ({
        payload: {
          data: {
            email: "local-other@homecook.local",
            id: "00000000-0000-4000-8000-000000000009",
          },
          success: true,
        },
        status: 200,
      }),
    })).rejects.toMatchObject({
      code: "stage4_local_profile_unexpected",
      safeFailure: {
        attempt_count: 1,
        code: "stage4_local_profile_unexpected",
        last_error_code: "unexpected_profile",
        last_http_status: 200,
      },
    });

    const capture = read(scriptPath);
    expect(capture).toContain("pollStage4LocalProfile");
  });

  it("keeps verifyStage4LocalProfile as a bounded wrapper around profile polling", async () => {
    let now = 0;

    await expect(verifyStage4LocalProfile({
      expectedEmail: "local-tester@homecook.local",
      fetchProfile: async () => ({
        payload: {
          data: {
            email: "local-tester@homecook.local",
            id: "00000000-0000-4000-8000-000000000001",
          },
          success: true,
        },
        status: 200,
      }),
      intervalMs: 25,
      now: () => now,
      sleep: async (durationMs: number) => {
        now += durationMs;
      },
    })).resolves.toEqual({
      email: "local-tester@homecook.local",
      id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("keeps partial or quality-failed attempts outside canonical evidence", () => {
    expect(canPromoteStage4Evidence({
      qualityStatus: "passed",
      stage4Complete: false,
    })).toBe(false);
    expect(canPromoteStage4Evidence({
      qualityStatus: "failed",
      stage4Complete: true,
    })).toBe(false);
    expect(canPromoteStage4Evidence({
      qualityStatus: "passed",
      stage4Complete: true,
    })).toBe(true);
  });

  it("classifies seed data operations with allowlisted detail codes only", () => {
    const sentinel = "service-role-secret-sentinel";
    const cases = [
      ["auth users 조회 실패", "seed_auth_failed", "auth_users_list"],
      ["auth user 생성 실패", "seed_auth_failed", "auth_user_create"],
      ["auth user 생성 결과가 비어 있어요", "seed_auth_failed", "auth_user_create"],
      ["auth user 갱신 결과가 비어 있어요", "seed_auth_failed", "auth_user_update"],
      ["public users 조회 실패", "seed_data_operation_failed", "public_user_read"],
      ["public users 생성 실패", "seed_data_operation_failed", "public_user_create"],
      ["recipe_books 조회 실패", "seed_data_operation_failed", "recipe_books_list"],
      ["meal_plan_columns 조회 실패", "seed_data_operation_failed", "planner_columns_list"],
      ["추가 demo recipes upsert 실패", "seed_data_operation_failed", "recipes_upsert"],
      ["추가 demo recipe_likes 생성 실패", "seed_data_operation_failed", "recipe_likes_create"],
      ["추가 demo recipe_book_items 생성 실패", "seed_data_operation_failed", "recipe_book_items_create"],
      ["추가 demo meals 생성 실패", "seed_data_operation_failed", "planner_meals_create"],
      ["demo ingredients 생성 실패", "seed_data_operation_failed", "pantry_ingredients_create"],
      ["demo pantry_items 생성 실패", "seed_data_operation_failed", "pantry_items_create"],
      ["recipes 카운트 갱신 실패", "seed_data_operation_failed", "recipe_counters_update"],
      ["recipe_ingredients 생성 실패", "seed_data_operation_failed", "core_qa_recipe_ingredients_create"],
      ["demo dataset용 recipe book을 찾지 못했어요", "seed_bootstrap_missing", "recipe_book_missing"],
      ["planner column을 찾지 못했어요", "seed_bootstrap_missing", "planner_column_missing"],
      ["이미 5개 컬럼이 있어 QA 플래너 컬럼을 더 만들 수 없습니다", "seed_bootstrap_missing", "planner_columns_limit"],
    ] as const;

    for (const [label, code, detailCode] of cases) {
      const failure = classifyStage4SeedFailureOutput({
        stderr: `${label}: ${sentinel}`,
        stdout: "",
      });
      expect(failure).toMatchObject({
        code,
        detail_code: detailCode,
        phase: "demo_seed",
      });
      expect(JSON.stringify(failure)).not.toContain(sentinel);
    }

    expect(classifyStage4SeedFailureOutput({
      stderr: `알 수 없는 데이터 오류: ${sentinel}`,
      stdout: "",
    })).toMatchObject({
      detail_code: "unknown",
    });
  });

  it("exposes only an allowlisted provider code in opt-in seed diagnostics", () => {
    const sentinel = "provider-payload-service-role-secret-sentinel";
    const error = {
      code: "42501",
      message: sentinel,
    };

    expect(normalizeLocalSeedProviderCode("42501")).toBe("42501");
    expect(normalizeLocalSeedProviderCode("23505")).toBe("23505");
    expect(normalizeLocalSeedProviderCode("pgrst205")).toBe("PGRST205");
    expect(normalizeLocalSeedProviderCode("not-safe-code")).toBe("unknown");

    expect(formatLocalSeedOperationError({
      codesOnly: true,
      error,
      operationLabel: "public users 생성 실패 (dynamic@example.invalid)",
    })).toBe(
      "public users 생성 실패 [provider_code=42501] [reason_code=unknown]",
    );
    expect(formatLocalSeedOperationError({
      codesOnly: false,
      error,
      operationLabel: "public users 생성 실패 (dynamic@example.invalid)",
    })).toBe(`public users 생성 실패 (dynamic@example.invalid): ${sentinel}`);

    const classified = classifyStage4SeedFailureOutput({
      stderr: "public users 생성 실패 [provider_code=PGRST205]",
      stdout: sentinel,
    });
    expect(classified).toMatchObject({
      code: "seed_data_operation_failed",
      detail_code: "public_user_create",
      phase: "demo_seed",
      provider_code: "PGRST205",
      reason_code: "unknown",
    });
    expect(JSON.stringify(classified)).not.toContain(sentinel);

    const runner = read(runnerPath);
    expect(runner).toContain('HOMECOOK_LOCAL_SEED_CODES_ONLY: "1"');
    expect(read("scripts/local-seed-demo-data.mjs")).toContain(
      "formatLocalSeedOperationError",
    );
    expect(read("scripts/qa-seed-slices-01-05.mjs")).toContain(
      "formatLocalSeedOperationError",
    );
  });

  it("classifies only allowlisted seed migration reasons without provider text", () => {
    const cases = [
      [
        "legacy account mutation authority is unavailable",
        "legacy_mutation_unavailable",
      ],
      ["ACCOUNT_LIFECYCLE_MAINTENANCE", "ACCOUNT_LIFECYCLE_MAINTENANCE"],
      ["ACCOUNT_GENERATION_STALE", "ACCOUNT_GENERATION_STALE"],
      ["ACCOUNT_SESSION_STALE", "ACCOUNT_SESSION_STALE"],
      ["ACCOUNT_CUTOVER_UNCLASSIFIED", "ACCOUNT_CUTOVER_UNCLASSIFIED"],
      ["ACCOUNT_CUTOVER_QUARANTINED", "ACCOUNT_CUTOVER_QUARANTINED"],
      ["ACCOUNT_DELETING", "ACCOUNT_DELETING"],
      ["ACCOUNT_DELETION_PENDING", "ACCOUNT_DELETION_PENDING"],
    ] as const;

    for (const [message, reasonCode] of cases) {
      expect(normalizeLocalSeedReasonCode(message)).toBe(reasonCode);

      const formatted = formatLocalSeedOperationError({
        codesOnly: true,
        error: {
          code: "55000",
          message: `${message}: provider-payload@example.invalid 00000000-0000-4000-8000-000000000001 bearer.jwt.sentinel service-role-secret`,
        },
        operationLabel: "public users 생성 실패",
      });
      expect(formatted).toBe(
        `public users 생성 실패 [provider_code=55000] [reason_code=${reasonCode}]`,
      );
      expect(formatted).not.toContain("provider-payload@example.invalid");
      expect(formatted).not.toContain("00000000-0000-4000-8000-000000000001");
      expect(formatted).not.toContain("bearer.jwt.sentinel");
      expect(formatted).not.toContain("service-role-secret");

      const classified = classifyStage4SeedFailureOutput({ stderr: formatted });
      expect(classified).toMatchObject({
        code: "seed_data_operation_failed",
        detail_code: "public_user_create",
        provider_code: "55000",
        reason_code: reasonCode,
      });
      expect(JSON.stringify(classified)).not.toContain("provider-payload@example.invalid");
      expect(JSON.stringify(classified)).not.toContain("00000000-0000-4000-8000-000000000001");
      expect(JSON.stringify(classified)).not.toContain("bearer.jwt.sentinel");
      expect(JSON.stringify(classified)).not.toContain("service-role-secret");
    }

    expect(normalizeLocalSeedReasonCode(
      "legacy account mutation authority is unavailable ACCOUNT_SESSION_STALE",
    )).toBe("legacy_mutation_unavailable");

    const unknown = formatLocalSeedOperationError({
      codesOnly: true,
      error: {
        code: "55000",
        message: "unmapped provider-payload@example.invalid service-role-secret",
      },
      operationLabel: "public users 생성 실패",
    });
    expect(unknown).toBe(
      "public users 생성 실패 [provider_code=55000] [reason_code=unknown]",
    );
    expect(classifyStage4SeedFailureOutput({ stderr: unknown })).toMatchObject({
      reason_code: "unknown",
    });
    expect(unknown).not.toContain("provider-payload@example.invalid");
    expect(unknown).not.toContain("service-role-secret");
  });
});
