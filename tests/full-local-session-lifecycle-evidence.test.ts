import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProductionCanaryStageFailure } from "../scripts/lib/full-local-session-production-canary.mjs";

import {
  ALLOWED_PHASES,
  EXPECTED_BASELINE_LIVE_ROOT,
  REFRESH_LIFECYCLE_JSON_SCRIPT,
  SESSION_SECURITY_CONTRACT_SCRIPT,
  assertEvidencePhaseReady,
  buildMigrationHeadSql,
  buildSessionLifecycleEvidence,
  collectCloudflareMonitoringSummary,
  computeLiveDirtyDiffSha256,
  formatSessionLifecycleEvidenceFailure,
  normalizeRuntimeStatus,
  parseCanaryObservationJson,
  parseProductionCanaryGateFailureStage,
  parseGoTruePolicyGateJson,
  parseMigrationHeadSqlOutput,
  parseRefreshLifecycleGateJson,
  resolveExpectedLiveRoot,
  loadPriorT65Evidence,
  runEvidenceCommand,
  validateEvidenceOutputPath,
  validateLiveRoot,
  validateSessionLifecycleEvidence,
  validateLaunchAgentProvenance,
  writeSessionLifecycleEvidence,
} from "../scripts/capture-full-local-session-lifecycle-evidence.mjs";

function createEvidence(overrides: Record<string, unknown> = {}) {
  return buildSessionLifecycleEvidence({
    capturedAt: "2026-08-08T12:00:00.000Z",
    canonicalBaseSha: "a".repeat(40),
    fullLocalStatus: "PASS",
    gotrueImageDigest: `sha256:${"b".repeat(64)}`,
    implementationSha: "c".repeat(40),
    launchAgentStatus: "NOT_CONFIGURED",
    liveBranch: "docs/full-local-production-operator-checklist",
    liveDirty: true,
    liveDirtyDiffSha256: `sha256:${"d".repeat(64)}`,
    liveHeadSha: "e".repeat(40),
    macProductionStatus: "PASS",
    migrationHead: "20260803093000_full_local_read_only_request_authority.sql",
    migrationHeadSource: "database_catalog_marker",
    phase: "baseline",
    productionDomainContractGate: "PASS",
    ...overrides,
  });
}

function localHealthPayload(overrides: Record<string, unknown> = {}) {
  return {
    schema: "homecook.cloudflare-tunnel-health",
    version: 1,
    captured_at: "2026-08-10T00:03:00.000Z",
    state: "healthy",
    connector: {
      healthy_connections: 4,
      expected_connections: 4,
      connection_state: "healthy",
      metrics_valid: true,
      log_event_count: 4,
    },
    degraded_duration_ms: null,
    reconnect_ms: { count: 0, p50: null, p95: null, max: null },
    signals: { critical: [], warning: [], diagnostic: [] },
    incident_events: [],
    ...overrides,
  };
}

function createGitFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "session-lifecycle-evidence-"));
  execFileSync("git", ["init", "-q"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: rootDir });
  writeFileSync(path.join(rootDir, "tracked.txt"), "before\n", "utf8");
  execFileSync("git", ["add", "tracked.txt"], { cwd: rootDir });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: rootDir });
  return rootDir;
}

describe("full-local session lifecycle evidence contract", () => {
  it("keeps the canonical raw lifecycle gate separate from the evidence JSON wrapper", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["verify:full-local-session-refresh-lifecycle"]).toBe(
      "pnpm exec vitest run tests/full-local-session-authority.test.ts tests/full-local-auth-db-foundation.test.ts tests/full-local-request-authority-migration.test.ts tests/hybrid-session-authority-bootstrap.test.ts tests/hybrid-session-authority-gateway.test.ts && pnpm test:full-local-auth-db-foundation:postgres && pnpm test:full-local-production:runtime",
    );
    expect(packageJson.scripts["verify:full-local-session-refresh-lifecycle:json"]).toBe(
      "node scripts/verify-full-local-session-production-canary.mjs --refresh-lifecycle-gate --json",
    );
    expect(packageJson.scripts["verify:full-local-session-refresh-lifecycle:raw"]).toBeUndefined();
    expect(REFRESH_LIFECYCLE_JSON_SCRIPT).toBe(
      "verify:full-local-session-refresh-lifecycle:json",
    );
    expect(packageJson.scripts["verify:full-local-session-security-contracts"]).toBe(
      "node scripts/validate-security-function-authorization.mjs --contract-only",
    );
    expect(SESSION_SECURITY_CONTRACT_SCRIPT).toBe(
      "verify:full-local-session-security-contracts",
    );
  });

  it("redacts every top-level CLI failure without echoing raw arguments", () => {
    const result = spawnSync(process.execPath, [
      "scripts/capture-full-local-session-lifecycle-evidence.mjs",
      "oauth_code=must-not-escape",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("session-lifecycle-evidence: FAIL (redacted)\n");
    expect(result.stderr).not.toContain("must-not-escape");
  });

  it("accepts only an exact allowlisted production canary failure stage", () => {
    expect(parseProductionCanaryGateFailureStage(
      "full-local-session-production-canary: FAIL stage=youtube_extract\n",
    )).toBe("youtube_extract");
    expect(parseProductionCanaryGateFailureStage(
      "full-local-session-production-canary: FAIL (redacted)\n",
    )).toBeNull();
    expect(parseProductionCanaryGateFailureStage(
      "full-local-session-production-canary: FAIL stage=oauth_code=must-not-escape\n",
    )).toBeNull();
    expect(parseProductionCanaryGateFailureStage(
      "noise\nfull-local-session-production-canary: FAIL stage=youtube_extract\n",
    )).toBeNull();
    expect(parseProductionCanaryGateFailureStage(
      "full-local-session-production-canary: FAIL stage=youtube_extract",
    )).toBeNull();

    expect(formatSessionLifecycleEvidenceFailure(
      new ProductionCanaryStageFailure("youtube_extract"),
    )).toBe("session-lifecycle-evidence: FAIL stage=youtube_extract\n");
    expect(formatSessionLifecycleEvidenceFailure(
      new Error("oauth_code=must-not-escape"),
    )).toBe("session-lifecycle-evidence: FAIL (redacted)\n");
  });

  it("keeps the four planned phases exact", () => {
    expect(ALLOWED_PHASES).toEqual([
      "baseline",
      "milestone-a-t65",
      "milestone-a-24h",
      "milestone-b-7d",
    ]);
  });

  it("accepts only the exact canonical implementation root as the live checkout", () => {
    const implementationRoot = realpathSync(
      mkdtempSync(path.join(tmpdir(), "implementation-root-")),
    );
    const otherRoot = mkdtempSync(path.join(tmpdir(), "other-live-root-"));
    const aliasParent = mkdtempSync(path.join(tmpdir(), "live-root-alias-"));
    const liveRootAlias = path.join(aliasParent, "live-root");
    const expectedRootAlias = path.join(aliasParent, "expected-root");
    symlinkSync(implementationRoot, liveRootAlias, "dir");
    symlinkSync(implementationRoot, expectedRootAlias, "dir");

    expect(validateLiveRoot(
      implementationRoot,
      { expectedLiveRoot: implementationRoot },
    )).toBe(implementationRoot);
    expect(() => validateLiveRoot(
      liveRootAlias,
      { expectedLiveRoot: implementationRoot },
    )).toThrow(/existing directory/u);
    expect(() => validateLiveRoot(
      "homecook-full-local-restore",
      { expectedLiveRoot: implementationRoot },
    )).toThrow(/absolute/u);
    expect(() => validateLiveRoot(
      otherRoot,
      { expectedLiveRoot: implementationRoot },
    )).toThrow(/exact live root/u);
    expect(() => validateLiveRoot(
      implementationRoot,
      { expectedLiveRoot: expectedRootAlias },
    )).toThrow(/existing directory/u);
  });

  it("requires an explicit absolute expected live root", () => {
    const liveRoot = mkdtempSync(path.join(tmpdir(), "canonical-live-root-"));

    expect(() => validateLiveRoot(liveRoot)).toThrow(/expected live root must be an absolute path/u);
    expect(() => validateLiveRoot(
      liveRoot,
      { expectedLiveRoot: "relative-live-root" },
    )).toThrow(/expected live root must be an absolute path/u);
  });

  it("resolves the expected live root by evidence phase", () => {
    const implementationRoot = realpathSync(
      mkdtempSync(path.join(tmpdir(), "resolver-implementation-root-")),
    );
    const aliasParent = mkdtempSync(path.join(tmpdir(), "resolver-live-root-alias-"));
    const implementationAlias = path.join(aliasParent, "implementation-root");
    symlinkSync(implementationRoot, implementationAlias, "dir");

    expect(EXPECTED_BASELINE_LIVE_ROOT).toBe(
      "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
    );
    expect(resolveExpectedLiveRoot({
      implementationRoot: implementationAlias,
      phase: "baseline",
    })).toBe(EXPECTED_BASELINE_LIVE_ROOT);
    expect(resolveExpectedLiveRoot({
      implementationRoot: implementationAlias,
      phase: "milestone-a-t65",
    })).toBe(implementationRoot);
    expect(resolveExpectedLiveRoot({
      implementationRoot: implementationAlias,
      phase: "milestone-a-24h",
    })).toBe(implementationRoot);
    expect(resolveExpectedLiveRoot({
      implementationRoot: implementationAlias,
      phase: "milestone-b-7d",
    })).toBe(implementationRoot);
    expect(() => resolveExpectedLiveRoot({
      implementationRoot,
      phase: "invalid-phase",
    })).toThrow(/Unsupported evidence phase/u);
  });

  it("accepts only the phase-matched evidence output path under the implementation checkout", () => {
    const implementationRoot = mkdtempSync(path.join(tmpdir(), "evidence-implementation-"));
    const expected = path.join(
      realpathSync(implementationRoot),
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/baseline.json",
    );

    expect(validateEvidenceOutputPath("baseline", expected, implementationRoot)).toBe(expected);
    expect(() => validateEvidenceOutputPath(
      "baseline",
      path.join(implementationRoot, "baseline.json"),
      implementationRoot,
    )).toThrow(/exact evidence output/u);
    expect(() => validateEvidenceOutputPath(
      "baseline",
      path.join(implementationRoot, "../outside.json"),
      implementationRoot,
    )).toThrow(/exact evidence output/u);
  });

  it("hashes dirty tracked and untracked content without returning raw paths or contents", () => {
    const rootDir = createGitFixture();
    writeFileSync(path.join(rootDir, "tracked.txt"), "authorization=Bearer secret-value\n", "utf8");
    writeFileSync(path.join(rootDir, "untracked.env"), "REFRESH_TOKEN=private-value\n", "utf8");
    symlinkSync("tracked.txt", path.join(rootDir, "untracked-link"));
    mkdirSync(path.join(rootDir, "untracked-directory"));

    const first = computeLiveDirtyDiffSha256(rootDir);
    const second = computeLiveDirtyDiffSha256(rootDir);

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(second).toBe(first);
    expect(first).not.toContain("tracked.txt");
    expect(first).not.toContain("secret-value");
    expect(first).not.toContain("private-value");
  });

  it("changes the dirty fingerprint when an untracked regular file changes", () => {
    const rootDir = createGitFixture();
    const untrackedPath = path.join(rootDir, "untracked.txt");
    writeFileSync(untrackedPath, "one\n", "utf8");
    const before = computeLiveDirtyDiffSha256(rootDir);
    writeFileSync(untrackedPath, "two\n", "utf8");

    expect(computeLiveDirtyDiffSha256(rootDir)).not.toBe(before);
  });

  it("does not read an untracked symlink target while fingerprinting", () => {
    const rootDir = createGitFixture();
    const outsidePath = path.join(mkdtempSync(path.join(tmpdir(), "evidence-outside-")), "secret");
    writeFileSync(outsidePath, "outside-secret-one\n", "utf8");
    symlinkSync(outsidePath, path.join(rootDir, "outside-link"));
    const before = computeLiveDirtyDiffSha256(rootDir);
    writeFileSync(outsidePath, "outside-secret-two\n", "utf8");

    expect(computeLiveDirtyDiffSha256(rootDir)).toBe(before);
  });

  it("normalizes required container and launch agent health without exposing raw command output", () => {
    expect(normalizeRuntimeStatus({
      containers: [
        { service: "postgres", running: true, health: "healthy" },
        { service: "auth", running: true, health: "healthy" },
        { service: "postgrest", running: true, health: null },
        { service: "postgrest-probe", running: true, health: "healthy" },
        { service: "storage", running: true, health: "healthy" },
        { service: "api-gateway", running: true, health: "healthy" },
        { service: "auth-proxy", running: true, health: "healthy" },
      ],
      expectedVolumesPresent: true,
      fullLocalLaunchAgent: "not-found",
      macProductionLaunchAgent: "running",
    })).toEqual({
      fullLocalStatus: "PASS",
      launchAgentStatus: "NOT_CONFIGURED",
      macProductionStatus: "PASS",
    });
  });

  it("fails runtime status closed for a missing or unhealthy required service", () => {
    expect(normalizeRuntimeStatus({
      containers: [{ service: "postgres", running: true, health: "unhealthy" }],
      expectedVolumesPresent: false,
      fullLocalLaunchAgent: "failed",
      macProductionLaunchAgent: "failed",
    })).toEqual({
      fullLocalStatus: "BLOCKED",
      launchAgentStatus: "BLOCKED",
      macProductionStatus: "BLOCKED",
    });
  });

  it("does not accept a missing health status for a service that declares a healthcheck", () => {
    expect(normalizeRuntimeStatus({
      containers: [
        { service: "postgres", running: true, health: "healthy" },
        { service: "auth", running: true, health: null },
        { service: "postgrest", running: true, health: null },
        { service: "postgrest-probe", running: true, health: "healthy" },
        { service: "storage", running: true, health: "healthy" },
        { service: "api-gateway", running: true, health: "healthy" },
        { service: "auth-proxy", running: true, health: "healthy" },
      ],
      expectedVolumesPresent: true,
      fullLocalLaunchAgent: "not-found",
      macProductionLaunchAgent: "running",
    }).fullLocalStatus).toBe("BLOCKED");
  });

  it("builds the exact schema with nullable pre-policy incident timestamps", () => {
    const evidence = createEvidence();

    expect(validateSessionLifecycleEvidence(evidence)).toEqual([]);
    expect(evidence).toEqual(expect.objectContaining({
      schema_version: 1,
      phase: "baseline",
      runtime: expect.objectContaining({
        app_origin: "https://app.mumeok.kr",
        auth_origin: "https://auth.mumeok.kr",
      }),
      incident: expect.objectContaining({
        binding_created_at: null,
        binding_expires_at: null,
        first_stale_at: null,
      }),
      verification: expect.objectContaining({
        production_domain_contract_gate: "PASS",
        refresh_lifecycle_gate: "NOT_RUN",
        account_session_stale_count: 0,
      }),
    }));
  });

  it("accepts a projected Cloudflare monitoring summary as an optional root field", () => {
    const legacyEvidence = createEvidence();
    const monitoring = {
      schema: "homecook.cloudflare-monitoring-summary",
      version: 1,
      status: "warning",
      incident_count: 2,
      critical_count: 0,
      warning_count: 1,
      diagnostic_count: 1,
    };
    const evidence = createEvidence({ cloudflareMonitoring: monitoring });

    expect(validateSessionLifecycleEvidence(legacyEvidence)).toEqual([]);
    expect(Object.keys(legacyEvidence)).not.toContain("cloudflare_monitoring");
    expect(validateSessionLifecycleEvidence(evidence)).toEqual([]);
    expect(evidence).toEqual(expect.objectContaining({
      cloudflare_monitoring: monitoring,
    }));

    const degraded = createEvidence({
      cloudflareMonitoring: {
        ...monitoring,
        status: "degraded",
        incident_count: 0,
        warning_count: 0,
        diagnostic_count: 0,
      },
    });
    expect(validateSessionLifecycleEvidence(degraded)).toEqual([]);

    const unsafe = createEvidence({
      cloudflareMonitoring: { ...monitoring, response_body: "must-not-be-accepted" },
    });
    expect(validateSessionLifecycleEvidence(unsafe)).toContain(
      "unexpected key cloudflare_monitoring.response_body",
    );

    const inconsistent = createEvidence({
      cloudflareMonitoring: { ...monitoring, incident_count: 3 },
    });
    expect(validateSessionLifecycleEvidence(inconsistent)).toContain(
      "cloudflare_monitoring.incident_count must equal severity counts.",
    );

    const contradictory = createEvidence({
      cloudflareMonitoring: {
        ...monitoring,
        status: "healthy",
        incident_count: 1,
        critical_count: 1,
        warning_count: 0,
        diagnostic_count: 0,
      },
    });
    expect(validateSessionLifecycleEvidence(contradictory)).toContain(
      "cloudflare_monitoring.status must match severity counts.",
    );

    const emptyCritical = createEvidence({
      cloudflareMonitoring: {
        ...monitoring,
        status: "critical",
        incident_count: 0,
        critical_count: 0,
        warning_count: 0,
        diagnostic_count: 0,
      },
    });
    expect(validateSessionLifecycleEvidence(emptyCritical)).toContain(
      "cloudflare_monitoring.status must match severity counts.",
    );
  });

  it("collects an optional redacted local monitoring summary on the actual capture path", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const summary = collectCloudflareMonitoringSummary({
      implementationRoot: "/repo/homecook",
      commandRunner: (command: string, args: string[]) => {
        calls.push({ command, args });
        const stdout = JSON.stringify(localHealthPayload({
          state: "warning",
          connector: {
            healthy_connections: 3,
            expected_connections: 4,
            connection_state: "degraded",
            metrics_valid: true,
            log_event_count: 5,
          },
          degraded_duration_ms: 60_001,
          signals: {
            critical: [],
            warning: ["connector_below_4_over_60s"],
            diagnostic: [],
          },
          incident_events: [{
            timestamp: "2026-08-10T00:03:00.000Z",
            source: "local_connector",
            kind: "connector_health",
            severity: "warning",
            status: "connector_degraded",
            error: "CONNECTOR_DEGRADED",
            colo: "ICN",
            network_label: null,
          }],
        }));
        const stderr = "provider-secret-must-not-escape";
        return {
          pid: 0,
          status: 0,
          signal: null,
          stdout,
          stderr,
          output: [null, stdout, stderr],
        };
      },
    });

    expect(calls).toEqual([{
      command: process.execPath,
      args: ["/repo/homecook/scripts/cloudflare-tunnel-health.mjs"],
    }]);
    expect(summary).toEqual({
      schema: "homecook.cloudflare-monitoring-summary",
      version: 1,
      status: "warning",
      incident_count: 1,
      critical_count: 0,
      warning_count: 1,
      diagnostic_count: 0,
    });
    expect(JSON.stringify(summary)).not.toMatch(/must-not-escape|provider|credential|session/iu);

    const criticalSummary = collectCloudflareMonitoringSummary({
      implementationRoot: "/repo/homecook",
      commandRunner: () => {
        const stdout = JSON.stringify(localHealthPayload({
          state: "critical",
          connector: {
            healthy_connections: 0,
            expected_connections: 4,
            connection_state: "down",
            metrics_valid: true,
            log_event_count: 4,
          },
          signals: { critical: ["connector_down"], warning: [], diagnostic: [] },
          incident_events: [{
            timestamp: "2026-08-10T00:03:00.000Z",
            source: "local_connector",
            kind: "connector_health",
            severity: "critical",
            status: "connector_down",
            error: "CONNECTOR_DOWN",
            colo: "MISSING",
            network_label: null,
          }],
        }));
        const stderr = "cloudflare-tunnel-health: FAIL (redacted)\n";
        return {
          pid: 0,
          status: 1,
          signal: null,
          stdout,
          stderr,
          output: [null, stdout, stderr],
        };
      },
    });
    expect(criticalSummary).toEqual(expect.objectContaining({
      status: "critical",
      critical_count: 1,
    }));

    const healthyPayload = JSON.stringify(localHealthPayload());
    for (const processResult of [
      { status: 2, signal: null },
      { status: null, signal: "SIGKILL" },
      { status: 1, signal: null },
    ] satisfies Array<{ status: number | null; signal: NodeJS.Signals | null }>) {
      expect(collectCloudflareMonitoringSummary({
        implementationRoot: "/repo/homecook",
        commandRunner: () => ({
          pid: 0,
          ...processResult,
          stdout: healthyPayload,
          stderr: "must-not-escape",
          output: [null, healthyPayload, "must-not-escape"],
        }),
      })).toBeNull();
    }

    expect(collectCloudflareMonitoringSummary({
      implementationRoot: "/repo/homecook",
      commandRunner: () => ({
        pid: 0,
        status: 0,
        signal: null,
        stdout: JSON.stringify({
          schema: "homecook.cloudflare-tunnel-health",
          version: 1,
          state: "critical",
          incident_events: [],
        }),
        stderr: "",
        output: [null, "", ""],
      }),
    })).toBeNull();

    const degradedPayload = localHealthPayload({
      state: "degraded",
      connector: {
        healthy_connections: 3,
        expected_connections: 4,
        connection_state: "degraded",
        metrics_valid: true,
        log_event_count: 5,
      },
      degraded_duration_ms: 20_000,
    });
    expect(collectCloudflareMonitoringSummary({
      implementationRoot: "/repo/homecook",
      commandRunner: () => ({
        pid: 0,
        status: 1,
        signal: null,
        stdout: JSON.stringify(degradedPayload),
        stderr: "",
        output: [null, "", ""],
      }),
    })).toEqual({
      schema: "homecook.cloudflare-monitoring-summary",
      version: 1,
      status: "degraded",
      incident_count: 0,
      critical_count: 0,
      warning_count: 0,
      diagnostic_count: 0,
    });

    const invalidPayloads = [
      {
        schema: "homecook.cloudflare-tunnel-health",
        version: 1,
        state: "healthy",
        incident_events: [],
      },
      { ...localHealthPayload(), credential: "must-not-escape" },
      {
        ...localHealthPayload(),
        incident_events: [{
          timestamp: "2026-08-10T00:00:00.000Z",
          source: "local_connector",
          kind: "connector_health",
          severity: "warning",
          status: "reconnect_slow",
          error: "RECONNECT_SLOW",
          colo: "ICN",
          network_label: null,
          raw_log: "must-not-escape",
        }],
      },
      {
        ...localHealthPayload(),
        connector: {
          healthy_connections: 3,
          expected_connections: 4,
          connection_state: "degraded",
          metrics_valid: true,
          log_event_count: 5,
        },
      },
    ];
    for (const payload of invalidPayloads) {
      expect(collectCloudflareMonitoringSummary({
        implementationRoot: "/repo/homecook",
        commandRunner: () => ({
          pid: 0,
          status: payload.state === "healthy" ? 0 : 1,
          signal: null,
          stdout: JSON.stringify(payload),
          stderr: "must-not-escape",
          output: [null, "", "must-not-escape"],
        }),
      })).toBeNull();
    }

    const source = readFileSync("scripts/capture-full-local-session-lifecycle-evidence.mjs", "utf8");
    expect(source).toMatch(/cloudflareMonitoring:\s*collectCloudflareMonitoringSummary/u);
  });

  it("refuses milestone evidence while a required verification gate is not PASS", () => {
    const evidence = createEvidence({
      phase: "milestone-a-t65",
      verification: {
        authority_static_contracts: "PASS",
        docker_refresh_smoke: "PASS",
        postgres_integration: "PASS",
        refresh_lifecycle_gate: "PASS",
        security_function_gate: "PASS",
      },
    });

    expect(() => assertEvidencePhaseReady(evidence)).toThrow(/t65_canary.*PASS/u);
  });

  it("parses each refresh lifecycle sub-gate independently", () => {
    expect(parseRefreshLifecycleGateJson(JSON.stringify({
      authority_static_contracts: "PASS",
      docker_refresh_smoke: "PASS",
      postgres_integration: "PASS",
      refresh_lifecycle_gate: "PASS",
      status: "PASS",
    }))).toEqual({
      authority_static_contracts: "PASS",
      docker_refresh_smoke: "PASS",
      postgres_integration: "PASS",
      refresh_lifecycle_gate: "PASS",
    });
    expect(() => parseRefreshLifecycleGateJson(JSON.stringify({
      authority_static_contracts: "PASS",
      postgres_integration: "PASS",
      refresh_lifecycle_gate: "PASS",
      status: "PASS",
    }))).toThrow(/docker_refresh_smoke/u);
  });

  it("validates the exact pinned GoTrue policy result instead of trusting exit code", () => {
    const valid = {
      auth_health: "PASS",
      image_digest: "sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf",
      inactivity_rejection: "PASS",
      multi_device: "PASS",
      refresh_reuse_interval_seconds: 10,
      refresh_rotation: "PASS",
      rendered_env: "PASS",
      status: "PASS",
      timebox_rejection: "PASS",
    };

    expect(parseGoTruePolicyGateJson(JSON.stringify(valid))).toEqual("PASS");
    expect(() => parseGoTruePolicyGateJson(JSON.stringify({
      ...valid,
      image_digest: `sha256:${"2".repeat(64)}`,
    }))).toThrow(/image_digest/u);
  });

  it("parses the four canary results and observation counters for the exact implementation", () => {
    const implementationSha = "c".repeat(40);
    expect(parseCanaryObservationJson(JSON.stringify({
      account_session_stale_count: 0,
      canary_results: {
        pantry_read: "PASS",
        planner_read: "PASS",
        planner_write: "PASS",
        youtube_extract: "PASS",
      },
      implementation_sha: implementationSha,
      incident: {
        binding_created_at: null,
        binding_expires_at: null,
        first_stale_at: "2026-08-08T10:00:00.000Z",
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
    }), {
      implementationSha,
      phase: "milestone-a-t65",
    })).toEqual(expect.objectContaining({
      accountSessionStaleCount: 0,
      staleTokenMutationCount: 0,
      t65Canary: "PASS",
    }));
  });

  it("does not treat a later-phase canary as the prior T+65 gate", () => {
    const implementationSha = "c".repeat(40);
    const parsed = parseCanaryObservationJson(JSON.stringify({
      account_session_stale_count: 0,
      canary_results: {
        pantry_read: "PASS",
        planner_read: "PASS",
        planner_write: "PASS",
        youtube_extract: "PASS",
      },
      implementation_sha: implementationSha,
      incident: {
        binding_created_at: "2026-08-09T00:00:00.000Z",
        binding_expires_at: "2026-08-10T02:00:00.000Z",
        first_stale_at: null,
      },
      phase: "milestone-a-24h",
      safety_checks: {
        binding_expiry_monotonic: "PASS",
        logout_new_token_read: "BLOCKED",
        logout_new_token_write: "BLOCKED",
        logout_old_token_read: "BLOCKED",
        logout_old_token_write: "BLOCKED",
        phase_time_boundary: "PASS",
        planner_write_cleanup: "PASS",
        stale_counts_since_deploy: "PASS",
      },
      stale_token_mutation_count: 0,
      status: "PASS",
    }), {
      implementationSha,
      phase: "milestone-a-24h",
    });

    expect(parsed.t65Canary).toBeUndefined();
  });

  it("inherits T+65 only from the exact validated prior evidence file", () => {
    const implementationRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "prior-t65-root-")));
    const implementationSha = "c".repeat(40);
    const outputPath = path.join(
      implementationRoot,
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/milestone-a-t65.json",
    );
    const evidence = createEvidence({
      implementationSha,
      observation: {
        accountSessionStaleCount: 0,
        bindingCreatedAt: "2026-08-09T00:00:00.000Z",
        bindingExpiresAt: "2026-08-09T02:00:00.000Z",
        canaryResults: {
          pantry_read: "PASS",
          planner_read: "PASS",
          planner_write: "PASS",
          youtube_extract: "PASS",
        },
        firstStaleAt: null,
        staleTokenMutationCount: 0,
        t65Canary: "PASS",
      },
      phase: "milestone-a-t65",
      verification: {
        authority_static_contracts: "PASS",
        docker_refresh_smoke: "PASS",
        postgres_integration: "PASS",
        refresh_lifecycle_gate: "PASS",
        security_function_gate: "PASS",
      },
    });
    writeSessionLifecycleEvidence({ evidence, implementationRoot, outputPath });

    expect(loadPriorT65Evidence({ implementationRoot, implementationSha })).toBe("PASS");
    expect(() => loadPriorT65Evidence({
      implementationRoot,
      implementationSha: "d".repeat(40),
    })).toThrow(/prior T\+65 evidence/u);

    const missingRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "missing-prior-t65-")));
    expect(() => loadPriorT65Evidence({
      implementationRoot: missingRoot,
      implementationSha,
    })).toThrow(/prior T\+65 evidence/u);

    const aliasParent = realpathSync(mkdtempSync(path.join(tmpdir(), "prior-t65-alias-")));
    const aliasRoot = path.join(aliasParent, "implementation-root");
    symlinkSync(implementationRoot, aliasRoot, "dir");
    expect(() => loadPriorT65Evidence({
      implementationRoot: aliasRoot,
      implementationSha,
    })).toThrow(/prior T\+65 evidence/u);

    const symlinkFileRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "prior-t65-file-link-")));
    const symlinkOutputPath = path.join(
      symlinkFileRoot,
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/milestone-a-t65.json",
    );
    mkdirSync(path.dirname(symlinkOutputPath), { recursive: true });
    symlinkSync(outputPath, symlinkOutputPath);
    expect(() => loadPriorT65Evidence({
      implementationRoot: symlinkFileRoot,
      implementationSha,
    })).toThrow(/prior T\+65 evidence/u);
  });

  it("accepts only one safe migration filename from the read-only SQL result", () => {
    expect(parseMigrationHeadSqlOutput(
      '{"migration_head":"20260811120000_full_local_session_observability.sql","source":"database_catalog_marker"}\n',
    )).toEqual({
      migrationHead: "20260811120000_full_local_session_observability.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(parseMigrationHeadSqlOutput(
      '{"migration_head":"20260809110000_full_local_request_transaction_and_youtube_scope.sql","source":"database_catalog_marker"}\n',
    )).toEqual({
      migrationHead: "20260809110000_full_local_request_transaction_and_youtube_scope.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(parseMigrationHeadSqlOutput(
      '{"migration_head":"20260809100000_full_local_session_refresh_authority.sql","source":"database_catalog_marker"}\n',
    )).toEqual({
      migrationHead: "20260809100000_full_local_session_refresh_authority.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(parseMigrationHeadSqlOutput(
      '{"migration_head":"20260803093000_full_local_read_only_request_authority.sql","source":"database_catalog_marker"}\n',
    )).toEqual({
      migrationHead: "20260803093000_full_local_read_only_request_authority.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(() => parseMigrationHeadSqlOutput(
      '{"migration_head":"20260803093000_full_local_read_only_request_authority.sql","source":"database_catalog_marker"}\nsecret=value\n',
    )).toThrow(/single safe migration filename/u);
    expect(() => parseMigrationHeadSqlOutput(
      '{"migration_head":"20260803093000_full_local_read_only_request_authority.sql","source":"checkout_guess"}\n',
    )).toThrow(/database_catalog_marker/u);
  });

  it("reports the 120000 migration head only after observability and authorization contracts", () => {
    const sql = buildMigrationHeadSql();
    const readOnlyMarker = sql.indexOf("current_setting(''transaction_read_only'') = ''on''");
    const recordV2Marker = sql.indexOf("/rpc/record_full_local_session_authority_v2");
    const refreshMarker = sql.indexOf("assert_and_renew_full_local_session_authority_v2");
    const youtubeScopeMarker = sql.indexOf("v_scope = ''youtube-extraction''");
    const authorizationGate = sql.indexOf("authorization_ready");
    const currentHead = sql.indexOf(
      "20260811120000_full_local_session_observability.sql",
    );
    const previousMarker = sql.indexOf("v_request_nbf := coalesce(");

    expect(readOnlyMarker).toBeGreaterThanOrEqual(0);
    expect(recordV2Marker).toBeGreaterThanOrEqual(0);
    expect(refreshMarker).toBeGreaterThan(readOnlyMarker);
    expect(refreshMarker).toBeGreaterThanOrEqual(0);
    expect(youtubeScopeMarker).toBeGreaterThan(refreshMarker);
    expect(authorizationGate).toBeGreaterThan(youtubeScopeMarker);
    expect(currentHead).toBeGreaterThan(authorizationGate);
    expect(previousMarker).toBeGreaterThan(refreshMarker);
    expect(sql).toContain("public.read_full_local_session_observation()");
    expect(sql).toContain("public.record_full_local_session_stale_observation(text)");
    expect(sql).toContain("private.full_local_session_observability");
    expect(sql).toContain("20260811120000_full_local_session_observability.sql");
    expect(sql).toContain("20260809110000_full_local_request_transaction_and_youtube_scope.sql");
    expect(sql).toContain("20260809100000_full_local_session_refresh_authority.sql");
    expect(sql).toMatch(
      /when \(select observability_ready from observability_gate\)[\s\S]*then '20260811120000_full_local_session_observability\.sql'/u,
    );
    expect(sql).toContain("begin transaction read only;");
    expect(sql).toContain("rollback;");
  });

  it("requires product catalog completeness before reporting a migration head", () => {
    const sql = buildMigrationHeadSql();

    expect(sql).toContain("public.recipe_content_snapshots");
    expect(sql).toContain("public.meals.recipe_content_snapshot_id");
    expect(sql).toContain("public.cooking_session_meal_claims");
    expect(sql).toContain("public.food_product_ingredient_links");
    expect(sql).toContain("public.shopping_meal_snapshot_clone_tokens");
    expect(sql).toContain("public.recipe_change_previews");
    expect(sql).toContain(
      "public.read_recipe_snapshot_entrypoint_context(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid)",
    );
    expect(sql).toContain(
      "public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)",
    );
    expect(sql).toContain("public.select_pantry_effective_ingredients(uuid)");
    expect(sql).toContain("public.list_product_planner_entries(uuid,date,date,uuid)");
    expect(sql).toMatch(/where migration_head is not null[\s\S]*catalog/iu);
  });

  it("requires the post-deploy app LaunchAgent to target the exact implementation checkout", () => {
    const implementationRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "launch-agent-root-")));
    const output = [
      "state = running",
      `working directory = ${implementationRoot}`,
      "arguments = {",
      "  /opt/homebrew/bin/node",
      `  ${implementationRoot}/scripts/start-local-mac-production.mjs`,
      "}",
    ].join("\n");

    expect(() => validateLaunchAgentProvenance({
      implementationRoot,
      launchctlOutput: output,
      phase: "milestone-a-t65",
    })).not.toThrow();
    expect(() => validateLaunchAgentProvenance({
      implementationRoot,
      launchctlOutput: output.replace(implementationRoot, "/tmp/stale-checkout"),
      phase: "milestone-a-t65",
    })).toThrow(/implementation checkout/u);
    expect(() => validateLaunchAgentProvenance({
      implementationRoot,
      launchctlOutput: "state = running\nworking directory = /tmp/dirty-live-root",
      phase: "baseline",
    })).not.toThrow();
  });

  it("keeps fixed stdin commands in Buffer mode without an invalid encoding", () => {
    const result = runEvidenceCommand(
      process.execPath,
      ["-e", "process.stdin.pipe(process.stdout)"],
      { input: "fixed-read-only-sql" },
    );

    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(String(result.stdout)).toBe("fixed-read-only-sql");
  });

  it.each([
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature"],
    ["email", "person@example.com"],
    ["UUID", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"],
    ["secret", "oauth_code=top-secret"],
  ])("rejects %s-like sensitive string values", (_label, liveBranch) => {
    const evidence = createEvidence({ liveBranch });

    expect(validateSessionLifecycleEvidence(evidence)).toEqual(
      expect.arrayContaining([expect.stringMatching(/sensitive|live_branch/u)]),
    );
  });

  it("rejects unexpected keys and malformed hashes", () => {
    const evidence = createEvidence({
      liveDirtyDiffSha256: "sha256:not-a-digest",
    }) as Record<string, unknown>;
    evidence.raw_diff = "must never be persisted";

    expect(validateSessionLifecycleEvidence(evidence)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unexpected key.*raw_diff/u),
        expect.stringMatching(/live_dirty_diff_sha256/u),
      ]),
    );
  });

  it("creates evidence once with owner-only permissions and refuses overwrite", () => {
    const implementationRoot = mkdtempSync(path.join(tmpdir(), "evidence-write-"));
    const outputPath = path.join(
      realpathSync(implementationRoot),
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/baseline.json",
    );

    writeSessionLifecycleEvidence({ evidence: createEvidence(), implementationRoot, outputPath });

    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(outputPath, "utf8")).not.toContain("access_token");
    expect(() => writeSessionLifecycleEvidence({
      evidence: createEvidence(),
      implementationRoot,
      outputPath,
    })).toThrow(/already exists/u);
  });

  it("rejects a symlinked output ancestor before writing outside the implementation root", () => {
    const implementationRoot = mkdtempSync(path.join(tmpdir(), "evidence-link-root-"));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "evidence-link-outside-"));
    symlinkSync(outsideRoot, path.join(implementationRoot, "docs"));
    const outputPath = path.join(
      realpathSync(implementationRoot),
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/baseline.json",
    );

    expect(() => writeSessionLifecycleEvidence({
      evidence: createEvidence(),
      implementationRoot,
      outputPath,
    })).toThrow(/symbolic link/u);
    expect(() => readFileSync(path.join(
      outsideRoot,
      "workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/baseline.json",
    ))).toThrow();
  });

  it("refuses to follow an existing final output symlink", () => {
    const implementationRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "evidence-final-link-")));
    const outputPath = path.join(
      implementationRoot,
      "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/baseline.json",
    );
    const outsidePath = path.join(mkdtempSync(path.join(tmpdir(), "evidence-final-outside-")), "target.json");
    writeFileSync(outsidePath, "unchanged\n", "utf8");
    mkdirSync(path.dirname(outputPath), { recursive: true });
    symlinkSync(outsidePath, outputPath);

    expect(() => writeSessionLifecycleEvidence({
      evidence: createEvidence(),
      implementationRoot,
      outputPath,
    })).toThrow(/already exists/u);
    expect(readFileSync(outsidePath, "utf8")).toBe("unchanged\n");
  });
});
