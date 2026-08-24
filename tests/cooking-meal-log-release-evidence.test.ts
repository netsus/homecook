import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FULL_DB_LANES,
  FULL_DB_LANE_PARTITION_SKIPS,
  REQUIRED_ARTIFACT_FILES,
  ROLLBACK_INVARIANTS,
  assertRunnableSummary,
  buildLaneEnvironment,
  createAttemptDirectory,
  measureQueryCountGrowth,
  normalizePartitionedLaneSummary,
  projectPerformanceEvidencePayload,
  parseVitestTextSummary,
  validateEvidenceAttempt,
  validateGitBinding,
  writeEvidenceArtifact,
  writeEvidenceManifest,
} from "../scripts/lib/cooking-meal-log-release-evidence.mjs";

const headSha = "a".repeat(40);
const generatedAt = "2026-08-20T12:00:00.000Z";
const attemptId = "cml14-proof-20260820t120000z";
const roots: string[] = [];

type MutableArtifact = {
  artifact_type: string;
  generated_at: string;
  payload: Record<string, unknown>;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "cml14-evidence-test-")),
  );
  roots.push(root);
  return root;
}

function canonicalAttemptRoot(repositoryRoot: string) {
  return join(
    repositoryRoot,
    ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts",
  );
}

function runProducerSymlinkFixture(
  variant: "artifacts-component" | "slice-component" | "canonical-root",
) {
  const repositoryRoot = createRoot();
  const externalRoot = createRoot();
  const artifactRoot = canonicalAttemptRoot(repositoryRoot);

  if (variant === "artifacts-component") {
    symlinkSync(externalRoot, join(repositoryRoot, ".artifacts"), "dir");
  } else if (variant === "slice-component") {
    mkdirSync(join(repositoryRoot, ".artifacts"));
    symlinkSync(
      externalRoot,
      join(repositoryRoot, ".artifacts/cooking-meal-log-cross-slice-release-qa"),
      "dir",
    );
  } else {
    mkdirSync(join(artifactRoot, ".."), { recursive: true });
    symlinkSync(externalRoot, artifactRoot, "dir");
  }

  let error: unknown = null;
  try {
    createAttemptDirectory({ repositoryRoot, artifactRoot, attemptId });
  } catch (caught) {
    error = caught;
  }
  return {
    externalEntries: readdirSync(externalRoot),
    rejected: error instanceof Error,
  };
}

function baseArtifact(
  artifactType: string,
  payload: Record<string, unknown> = {},
  identity: { attemptId?: string; headSha?: string } = {},
) {
  return {
    schema_version: "cooking-meal-log-release-evidence-v1",
    artifact_type: artifactType,
    attempt_id: identity.attemptId ?? attemptId,
    head_sha: identity.headSha ?? headSha,
    generated_at: generatedAt,
    profile: "full",
    passed: 1,
    skipped: 0,
    pending: 0,
    failed: 0,
    payload,
  };
}

function createValidAttempt({
  artifactAttemptId = attemptId,
  artifactHeadSha = headSha,
  directoryAttemptId = attemptId,
  root = createRoot(),
}: {
  artifactAttemptId?: string;
  artifactHeadSha?: string;
  directoryAttemptId?: string;
  root?: string;
} = {}) {
  const artifactRoot = canonicalAttemptRoot(root);
  const attemptDir = createAttemptDirectory({
    repositoryRoot: root,
    artifactRoot,
    attemptId: directoryAttemptId,
  });
  const identity = {
    attemptId: artifactAttemptId,
    headSha: artifactHeadSha,
  };

  writeEvidenceArtifact(attemptDir, "db-security.json", baseArtifact(
    "db-security",
    {
      lanes: FULL_DB_LANES.map((id) => ({
        id,
        passed: 1,
        skipped: 0,
        pending: 0,
        failed: 0,
        partition_skipped: FULL_DB_LANE_PARTITION_SKIPS[
          id as keyof typeof FULL_DB_LANE_PARTITION_SKIPS
        ],
      })),
      pinned_isolated_local: true,
      remote_linked_cloud_access: 0,
    },
    identity,
  ));
  writeEvidenceArtifact(attemptDir, "security.json", baseArtifact(
    "security",
    {
      isolated_local: true,
      remote_access: 0,
      mutation_inventory: ["public.example(uuid)"],
      authorization_inventory_classified: 1,
      data_api_negatives: 1,
    },
    identity,
  ));
  writeEvidenceArtifact(attemptDir, "performance.json", baseArtifact(
    "performance",
    {
      denominator: 287_041,
      recall_at_20: 0.95,
      precision_at_20: 0.8,
      db_p95_ms: 250,
      route_p95_ms: 500,
      external_requests: 0,
      external_writes: 0,
    },
    identity,
  ));
  writeEvidenceArtifact(attemptDir, "query-count.json", baseArtifact(
    "query-count",
    {
      measurement_kind: "actual-route-service-boundary",
      checks: [
        {
          surface: "food-catalog-search",
          list1_query_count: 1,
          list20_query_count: 1,
          item_level_n_plus_one: 0,
        },
      ],
    },
    identity,
  ));
  writeEvidenceArtifact(attemptDir, "rollback.json", baseArtifact(
    "rollback",
    {
      current_and_previous: true,
      seeded_v2_drain: true,
      tombstone_fail_closed: true,
    },
    identity,
  ));
  writeEvidenceManifest(attemptDir, {
    attemptId: artifactAttemptId,
    headSha: artifactHeadSha,
    generatedAt,
    profile: "full",
  });

  return { root, artifactRoot, attemptDir };
}

function runGit(repositoryRoot: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function createValidatorRepository() {
  const temporaryRoot = createRoot();
  runGit(temporaryRoot, ["init", "--quiet"]);
  writeFileSync(join(temporaryRoot, ".gitignore"), ".artifacts/\n");
  runGit(temporaryRoot, ["add", ".gitignore"]);
  runGit(temporaryRoot, [
    "-c",
    "user.name=Homecook Test",
    "-c",
    "user.email=homecook-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "test fixture",
  ]);
  const repositoryRoot = runGit(temporaryRoot, [
    "rev-parse",
    "--show-toplevel",
  ]);
  return {
    headSha: runGit(repositoryRoot, ["rev-parse", "HEAD"]),
    repositoryRoot,
  };
}

function runFinalValidator(
  variant: "attempt-symlink" | "canonical-root-symlink" | "basename-mismatch",
) {
  const validatorPath = join(
    process.cwd(),
    "scripts/validate-cooking-meal-log-release-evidence.mjs",
  );
  const { headSha: fixtureHeadSha, repositoryRoot } =
    createValidatorRepository();
  const canonicalRoot = join(
    repositoryRoot,
    ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts",
  );
  let attemptDir: string;

  if (variant === "canonical-root-symlink") {
    const externalRoot = createRoot();
    const externalAttempt = createValidAttempt({
      artifactHeadSha: fixtureHeadSha,
      root: externalRoot,
    });
    attemptDir = externalAttempt.attemptDir;
    mkdirSync(join(canonicalRoot, ".."), { recursive: true });
    symlinkSync(externalAttempt.artifactRoot, canonicalRoot, "dir");
    attemptDir = join(canonicalRoot, attemptId);
  } else if (variant === "attempt-symlink") {
    const externalRoot = createRoot();
    const externalAttempt = createValidAttempt({
      artifactHeadSha: fixtureHeadSha,
      root: externalRoot,
    }).attemptDir;
    mkdirSync(canonicalRoot, { recursive: true });
    attemptDir = join(canonicalRoot, attemptId);
    symlinkSync(externalAttempt, attemptDir, "dir");
  } else {
    mkdirSync(canonicalRoot, { recursive: true });
    attemptDir = createValidAttempt({
      artifactAttemptId: attemptId,
      artifactHeadSha: fixtureHeadSha,
      directoryAttemptId: "different-attempt-id",
      root: canonicalRoot,
    }).attemptDir;
  }

  return spawnSync(
    process.execPath,
    [
      validatorPath,
      "--attempt-dir",
      attemptDir,
      "--attempt-id",
      attemptId,
      "--expected-head",
      fixtureHeadSha,
      "--profile",
      "full",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

function rehashManifest(attemptDir: string, fileName: string) {
  const manifestPath = join(attemptDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bytes = readFileSync(join(attemptDir, fileName));
  const entry = manifest.artifacts.find(
    (candidate: { file: string }) => candidate.file === fileName,
  );
  entry.bytes = bytes.byteLength;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("cooking meal-log release evidence safety", () => {
  it("creates one attempt directory and rejects traversal or reuse", () => {
    const root = createRoot();
    const artifactRoot = canonicalAttemptRoot(root);
    const created = createAttemptDirectory({
      repositoryRoot: root,
      artifactRoot,
      attemptId,
    });

    expect(created).toBe(join(artifactRoot, attemptId));
    expect(() => createAttemptDirectory({
      repositoryRoot: root,
      artifactRoot,
      attemptId,
    }))
      .toThrow(/already exists/i);
    expect(() => createAttemptDirectory({
      repositoryRoot: root,
      artifactRoot,
      attemptId: "../escape",
    })).toThrow(/attempt id/i);
  });

  it.each([
    "artifacts-component",
    "slice-component",
    "canonical-root",
  ] as const)(
    "rejects producer %s symlink before external target mutation",
    (variant) => {
      expect(runProducerSymlinkFixture(variant)).toEqual({
        externalEntries: [],
        rejected: true,
      });
    },
  );

  it("parses nonzero Vitest counts and rejects skipped-only success", () => {
    const parsed = parseVitestTextSummary(`
 Test Files  1 passed (1)
      Tests  3 passed | 1 skipped (4)
`);
    expect(parsed).toEqual({ passed: 3, skipped: 1, pending: 0, failed: 0 });
    expect(() => assertRunnableSummary(parsed, "mixed")).toThrow(/skipped/i);
    expect(() => assertRunnableSummary(
      { passed: 0, skipped: 219, pending: 0, failed: 0 },
      "skipped-only",
    )).toThrow(/passed.*greater than zero/i);
    expect(assertRunnableSummary(
      { passed: 3, skipped: 0, pending: 0, failed: 0 },
      "green",
    )).toBeUndefined();
  });

  it("normalizes only the exact mode-partition skip count", () => {
    expect(normalizePartitionedLaneSummary({
      expectedPartitionSkipped: 65,
      label: "snapshot-partitions",
      summary: { passed: 114, skipped: 65, pending: 0, failed: 0 },
    })).toEqual({
      passed: 114,
      skipped: 0,
      pending: 0,
      failed: 0,
      partition_skipped: 65,
    });
    expect(() => normalizePartitionedLaneSummary({
      expectedPartitionSkipped: 65,
      label: "snapshot-partitions",
      summary: { passed: 114, skipped: 66, pending: 0, failed: 0 },
    })).toThrow(/partition skipped count mismatch/i);
    expect(() => normalizePartitionedLaneSummary({
      expectedPartitionSkipped: 65,
      label: "snapshot-partitions",
      summary: { passed: 113, skipped: 65, pending: 0, failed: 1 },
    })).toThrow(/failed/i);
  });

  it("projects the full search summary into the canonical performance payload", () => {
    expect(projectPerformanceEvidencePayload({
      schema_version: "prepared-food-search-relevance-performance-v1",
      denominator: { visible_public: 287_041 },
      labeled_query_count: 54,
      recall_at_20: 1,
      precision_at_20: 0.921,
      db_p95_ms: 40,
      route_p95_ms: 21,
      external_requests: 0,
      external_writes: 0,
      hardware: { platform: "darwin" },
    })).toEqual({
      source_schema_version:
        "prepared-food-search-relevance-performance-v1",
      denominator: 287_041,
      labeled_query_count: 54,
      recall_at_20: 1,
      precision_at_20: 0.921,
      db_p95_ms: 40,
      route_p95_ms: 21,
      external_requests: 0,
      external_writes: 0,
    });
    expect(() => projectPerformanceEvidencePayload({
      schema_version: "prepared-food-search-relevance-performance-v1",
      denominator: 287_041,
    })).toThrow(/shape mismatch/i);
  });

  it("derives query growth from actual measured boundary callbacks", async () => {
    const constant = await measureQueryCountGrowth({
      surface: "constant",
      execute: async (_size: number, recordQuery: () => void) => {
        recordQuery();
      },
    });
    expect(constant).toMatchObject({
      list1_query_count: 1,
      list20_query_count: 1,
      item_level_n_plus_one: 0,
    });

    const loop = await measureQueryCountGrowth({
      surface: "loop-regression",
      execute: async (size: number, recordQuery: () => void) => {
        for (let index = 0; index < size; index += 1) recordQuery();
      },
    });
    expect(loop).toMatchObject({
      list1_query_count: 1,
      list20_query_count: 20,
      item_level_n_plus_one: 19,
    });

    const callback = await measureQueryCountGrowth({
      surface: "callback-regression",
      execute: async (size: number, recordQuery: () => void) => {
        Array.from({ length: size }).forEach(() => recordQuery());
      },
    });
    expect(callback.item_level_n_plus_one).toBe(19);
  });

  it("builds a minimal lane environment and removes hostile ambient overrides", () => {
    const environment = buildLaneEnvironment({
      ambient: {
        PATH: "/safe/bin",
        HOME: "/safe/home",
        DATABASE_URL: "postgres://remote.invalid",
        PGHOST: "remote.invalid",
        SUPABASE_ACCESS_TOKEN: "secret",
        HOMECOOK_ISOLATED_RUNTIME_SKIP_RESET: "1",
        HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_MIGRATIONS: "/tmp/evil.sql",
        HOMECOOK_RECIPE_SNAPSHOT_ACTIVE_SECURITY_TEST_NAME_PATTERN: ".*",
      },
      extra: {
        HOMECOOK_CML14_QUERY_COUNT_OUTPUT: "/tmp/query.json",
      },
    });

    expect(environment).toEqual({
      PATH: "/safe/bin",
      HOME: "/safe/home",
      HOMECOOK_CML14_QUERY_COUNT_OUTPUT: "/tmp/query.json",
    });
    const producer = readFileSync(
      join(process.cwd(), "scripts/run-cooking-meal-log-release-evidence.mjs"),
      "utf8",
    );
    expect(producer).not.toContain("env = process.env");
    expect(producer).toContain("buildLaneEnvironment({ ambient: process.env");
  });

  it("binds validation to the repository head, clean tree, and canonical attempt root", () => {
    const repositoryRoot = createRoot();
    const bindingAttemptId = "attempt-a1";
    const attemptDir = join(
      repositoryRoot,
      ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts",
      bindingAttemptId,
    );
    mkdirSync(attemptDir, { recursive: true });
    expect(() => validateGitBinding({
      repositoryRoot,
      attemptDir,
      expectedAttemptId: bindingAttemptId,
      expectedHeadSha: headSha,
      actualHeadSha: headSha,
      statusOutput: "",
    })).not.toThrow();
    expect(() => validateGitBinding({
      repositoryRoot,
      attemptDir,
      expectedAttemptId: bindingAttemptId,
      expectedHeadSha: headSha,
      actualHeadSha: "b".repeat(40),
      statusOutput: "",
    })).toThrow(/current git head/i);
    expect(() => validateGitBinding({
      repositoryRoot,
      attemptDir,
      expectedAttemptId: bindingAttemptId,
      expectedHeadSha: headSha,
      actualHeadSha: headSha,
      statusOutput: " M tracked.ts",
    })).toThrow(/clean worktree/i);
    const outsideAttempt = join(createRoot(), "outside-attempt");
    mkdirSync(outsideAttempt);
    expect(() => validateGitBinding({
      repositoryRoot,
      attemptDir: outsideAttempt,
      expectedAttemptId: "outside-attempt",
      expectedHeadSha: headSha,
      actualHeadSha: headSha,
      statusOutput: "",
    })).toThrow(/canonical root/i);
  });

  it("accepts a complete exact-head full attempt", () => {
    const { attemptDir } = createValidAttempt();

    expect(validateEvidenceAttempt({
      attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toMatchObject({ artifact_count: REQUIRED_ARTIFACT_FILES.length });
  });

  it("ships producer and final-validator CLIs and validates by explicit attempt", () => {
    const { attemptDir } = createValidAttempt();
    const producerPath = join(
      process.cwd(),
      "scripts/run-cooking-meal-log-release-evidence.mjs",
    );
    const validatorPath = join(
      process.cwd(),
      "scripts/validate-cooking-meal-log-release-evidence.mjs",
    );
    expect(existsSync(producerPath)).toBe(true);
    expect(existsSync(validatorPath)).toBe(true);

    const result = spawnSync(
      process.execPath,
      [
        validatorPath,
        "--attempt-dir",
        attemptDir,
        "--attempt-id",
        attemptId,
        "--expected-head",
        headSha,
        "--profile",
        "full",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /canonical attempt root|repository|clean worktree|current git HEAD/i,
    );
  });

  it("requires the producer to run from the verified Git repository root", () => {
    const producerPath = join(
      process.cwd(),
      "scripts/run-cooking-meal-log-release-evidence.mjs",
    );
    const { headSha: fixtureHeadSha, repositoryRoot } =
      createValidatorRepository();
    const nestedDirectory = join(repositoryRoot, "nested");
    mkdirSync(nestedDirectory);

    const result = spawnSync(
      process.execPath,
      [
        producerPath,
        "--attempt-id",
        attemptId,
        "--head-sha",
        fixtureHeadSha,
        "--profile",
        "proof",
        "--dry-run",
      ],
      { cwd: nestedDirectory, encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/repository root/i);
  });

  it.each([
    "attempt-symlink",
    "canonical-root-symlink",
    "basename-mismatch",
  ] as const)("rejects final-validator %s path substitution", (variant) => {
    const result = runFinalValidator(variant);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/attempt|canonical|directory|symlink/i);
  });

  it("runs meal-log PostgreSQL through the pinned isolated Supabase owner", () => {
    const runner = readFileSync(
      join(process.cwd(), "scripts/run-meal-log-core-postgres-integration.mjs"),
      "utf8",
    );
    const integration = readFileSync(
      join(process.cwd(), "tests/meal-log-core-postgres.integration.test.ts"),
      "utf8",
    );
    const isolatedRunner = readFileSync(
      join(process.cwd(), "scripts/run-isolated-local-supabase-runtime-gate.mjs"),
      "utf8",
    );

    expect(runner).toContain(
      'HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST =\n  "tests/meal-log-core-postgres.integration.test.ts"',
    );
    expect(runner).toContain(
      'await import("./run-isolated-local-supabase-runtime-gate.mjs")',
    );
    expect(integration).toContain("HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID");
    expect(integration).toContain("`supabase_db_${isolatedProjectId}`");
    expect(isolatedRunner).toContain(
      "HOMECOOK_MEAL_LOG_PG: process.env.HOMECOOK_MEAL_LOG_PG ?? \"0\"",
    );
  });

  it("rejects stale head, missing files, skipped evidence, and proof profile", () => {
    const stale = createValidAttempt();
    expect(() => validateEvidenceAttempt({
      attemptDir: stale.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: "b".repeat(40),
      expectedProfile: "full",
    })).toThrow(/head_sha/i);

    const missing = createValidAttempt();
    rmSync(join(missing.attemptDir, "rollback.json"));
    expect(() => validateEvidenceAttempt({
      attemptDir: missing.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/missing artifact/i);

    const skipped = createValidAttempt();
    const dbPath = join(skipped.attemptDir, "db-security.json");
    const db = JSON.parse(readFileSync(dbPath, "utf8"));
    db.skipped = 1;
    writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`);
    rehashManifest(skipped.attemptDir, "db-security.json");
    expect(() => validateEvidenceAttempt({
      attemptDir: skipped.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/skipped/i);

    const partitionDrift = createValidAttempt();
    const partitionDbPath = join(
      partitionDrift.attemptDir,
      "db-security.json",
    );
    const partitionDb = JSON.parse(
      readFileSync(partitionDbPath, "utf8"),
    );
    partitionDb.payload.lanes[2].partition_skipped = 64;
    writeFileSync(
      partitionDbPath,
      `${JSON.stringify(partitionDb, null, 2)}\n`,
    );
    rehashManifest(partitionDrift.attemptDir, "db-security.json");
    expect(() => validateEvidenceAttempt({
      attemptDir: partitionDrift.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/partition skipped count mismatch/i);

    const proof = createValidAttempt();
    for (const file of REQUIRED_ARTIFACT_FILES) {
      const artifactPath = join(proof.attemptDir, file);
      const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
      artifact.profile = "proof";
      writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
      rehashManifest(proof.attemptDir, file);
    }
    expect(() => validateEvidenceAttempt({
      attemptDir: proof.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/profile/i);
  });

  it("rejects threshold, N+1, and manifest-integrity failures", () => {
    const performance = createValidAttempt();
    const performancePath = join(performance.attemptDir, "performance.json");
    const performanceArtifact = JSON.parse(readFileSync(performancePath, "utf8"));
    performanceArtifact.payload.route_p95_ms = 601;
    writeFileSync(
      performancePath,
      `${JSON.stringify(performanceArtifact, null, 2)}\n`,
    );
    rehashManifest(performance.attemptDir, "performance.json");
    expect(() => validateEvidenceAttempt({
      attemptDir: performance.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/route p95/i);

    const query = createValidAttempt();
    const queryPath = join(query.attemptDir, "query-count.json");
    const queryArtifact = JSON.parse(readFileSync(queryPath, "utf8"));
    queryArtifact.payload.checks[0].list20_query_count = 3;
    writeFileSync(queryPath, `${JSON.stringify(queryArtifact, null, 2)}\n`);
    rehashManifest(query.attemptDir, "query-count.json");
    expect(() => validateEvidenceAttempt({
      attemptDir: query.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/query count/i);

    const manifest = createValidAttempt();
    writeFileSync(
      join(manifest.attemptDir, "rollback.json"),
      `${JSON.stringify(baseArtifact("rollback", { tampered: true }), null, 2)}\n`,
    );
    expect(() => validateEvidenceAttempt({
      attemptDir: manifest.attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/manifest (?:byte count|sha256)/i);
  });

  it("rejects semantic payload bypasses even when the manifest is rehashed", () => {
    const cases: Array<{
      file: string;
      mutate: (artifact: MutableArtifact) => void;
      message: RegExp;
    }> = [
      {
        file: "db-security.json",
        mutate: (artifact) => { artifact.artifact_type = "rollback"; },
        message: /artifact_type/i,
      },
      {
        file: "db-security.json",
        mutate: (artifact) => { artifact.payload.pinned_isolated_local = false; },
        message: /pinned_isolated_local/i,
      },
      {
        file: "db-security.json",
        mutate: (artifact) => { artifact.payload.remote_linked_cloud_access = 1; },
        message: /remote_linked_cloud_access/i,
      },
      {
        file: "security.json",
        mutate: (artifact) => { artifact.payload.isolated_local = false; },
        message: /isolated_local/i,
      },
      {
        file: "security.json",
        mutate: (artifact) => { artifact.payload.remote_access = 1; },
        message: /remote_access/i,
      },
      {
        file: "security.json",
        mutate: (artifact) => { artifact.payload.mutation_inventory = []; },
        message: /mutation_inventory/i,
      },
      {
        file: "performance.json",
        mutate: (artifact) => { artifact.payload.external_requests = 1; },
        message: /external access/i,
      },
      ...ROLLBACK_INVARIANTS.map((invariant) => ({
        file: "rollback.json",
        mutate: (artifact: MutableArtifact) => {
          artifact.payload[invariant] = false;
        },
        message: new RegExp(invariant, "i"),
      })),
    ];

    for (const testCase of cases) {
      const { attemptDir } = createValidAttempt();
      const artifactPath = join(attemptDir, testCase.file);
      const artifact = JSON.parse(
        readFileSync(artifactPath, "utf8"),
      ) as MutableArtifact;
      testCase.mutate(artifact);
      writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
      rehashManifest(attemptDir, testCase.file);
      expect(() => validateEvidenceAttempt({
        attemptDir,
        expectedAttemptId: attemptId,
        expectedHeadSha: headSha,
        expectedProfile: "full",
      }), testCase.file).toThrow(testCase.message);
    }
  });

  it("requires one shared generated_at across manifest and every artifact", () => {
    const { attemptDir } = createValidAttempt();
    const artifactPath = join(attemptDir, "security.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    artifact.generated_at = "2026-08-20T12:00:01.000Z";
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    rehashManifest(attemptDir, "security.json");

    expect(() => validateEvidenceAttempt({
      attemptDir,
      expectedAttemptId: attemptId,
      expectedHeadSha: headSha,
      expectedProfile: "full",
    })).toThrow(/generated_at.*manifest/i);
  });
});
