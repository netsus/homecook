import { execFileSync } from "node:child_process";
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

import {
  ALLOWED_PHASES,
  EXPECTED_LIVE_ROOT,
  assertEvidencePhaseReady,
  buildSessionLifecycleEvidence,
  computeLiveDirtyDiffSha256,
  normalizeRuntimeStatus,
  parseCanaryObservationJson,
  parseGoTruePolicyGateJson,
  parseMigrationHeadSqlOutput,
  parseRefreshLifecycleGateJson,
  validateEvidenceOutputPath,
  validateLiveRoot,
  validateSessionLifecycleEvidence,
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
    phase: "baseline",
    productionDomainContractGate: "PASS",
    ...overrides,
  });
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
  it("keeps the four planned phases exact", () => {
    expect(ALLOWED_PHASES).toEqual([
      "baseline",
      "milestone-a-t65",
      "milestone-a-24h",
      "milestone-b-7d",
    ]);
  });

  it("accepts only the exact canonical live checkout realpath", () => {
    expect(validateLiveRoot(EXPECTED_LIVE_ROOT)).toBe(EXPECTED_LIVE_ROOT);
    expect(() => validateLiveRoot("homecook-full-local-restore")).toThrow(/absolute/u);
    expect(() => validateLiveRoot(path.dirname(EXPECTED_LIVE_ROOT))).toThrow(/exact live root/u);
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

  it("accepts only one safe migration filename from the read-only SQL result", () => {
    expect(parseMigrationHeadSqlOutput(
      "20260803093000_full_local_read_only_request_authority.sql\n",
    )).toBe("20260803093000_full_local_read_only_request_authority.sql");
    expect(() => parseMigrationHeadSqlOutput(
      "20260803093000_full_local_read_only_request_authority.sql\nsecret=value\n",
    )).toThrow(/single safe migration filename/u);
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
