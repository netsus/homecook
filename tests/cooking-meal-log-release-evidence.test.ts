import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FULL_DB_LANES,
  REQUIRED_ARTIFACT_FILES,
  assertRunnableSummary,
  buildQueryCountPayload,
  createAttemptDirectory,
  parseVitestTextSummary,
  validateEvidenceAttempt,
  writeEvidenceArtifact,
  writeEvidenceManifest,
} from "../scripts/lib/cooking-meal-log-release-evidence.mjs";

const headSha = "a".repeat(40);
const generatedAt = "2026-08-20T12:00:00.000Z";
const attemptId = "cml14-proof-20260820t120000z";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "cml14-evidence-test-"));
  roots.push(root);
  return root;
}

function baseArtifact(
  artifactType: string,
  payload: Record<string, unknown> = {},
) {
  return {
    schema_version: "cooking-meal-log-release-evidence-v1",
    artifact_type: artifactType,
    attempt_id: attemptId,
    head_sha: headSha,
    generated_at: generatedAt,
    profile: "full",
    passed: 1,
    skipped: 0,
    pending: 0,
    failed: 0,
    payload,
  };
}

function createValidAttempt() {
  const root = createRoot();
  const attemptDir = createAttemptDirectory({
    artifactRoot: root,
    attemptId,
  });

  writeEvidenceArtifact(attemptDir, "db-security.json", baseArtifact(
    "db-security",
    {
      lanes: FULL_DB_LANES.map((id) => ({
        id,
        passed: 1,
        skipped: 0,
        pending: 0,
        failed: 0,
      })),
    },
  ));
  writeEvidenceArtifact(attemptDir, "security.json", baseArtifact(
    "security",
    { isolated_local: true, remote_access: 0 },
  ));
  writeEvidenceArtifact(attemptDir, "performance.json", baseArtifact(
    "performance",
    {
      denominator: 287_041,
      recall_at_20: 0.95,
      precision_at_20: 0.8,
      db_p95_ms: 250,
      route_p95_ms: 500,
    },
  ));
  writeEvidenceArtifact(attemptDir, "query-count.json", baseArtifact(
    "query-count",
    {
      checks: [
        {
          surface: "food-catalog-search",
          list1_query_count: 1,
          list20_query_count: 1,
          item_level_n_plus_one: 0,
        },
      ],
    },
  ));
  writeEvidenceArtifact(attemptDir, "rollback.json", baseArtifact(
    "rollback",
    { current_and_previous: true, seeded_v2_drain: true },
  ));
  writeEvidenceManifest(attemptDir, {
    attemptId,
    headSha,
    generatedAt,
    profile: "full",
  });

  return { root, attemptDir };
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
    const created = createAttemptDirectory({ artifactRoot: root, attemptId });

    expect(created).toBe(join(root, attemptId));
    expect(() => createAttemptDirectory({ artifactRoot: root, attemptId }))
      .toThrow(/already exists/i);
    expect(() => createAttemptDirectory({
      artifactRoot: root,
      attemptId: "../escape",
    })).toThrow(/attempt id/i);
  });

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

  it("produces deterministic query-count evidence from bounded route calls", () => {
    const payload = buildQueryCountPayload({
      sources: [
        {
          surface: "food-catalog-search",
          sourcePath: "app/api/v1/food-catalog/search/route.ts",
          sourceText: 'const result = await db.rpc("search_food_catalog_ranked", {});',
          callPattern: /db\.rpc\("search_food_catalog_ranked"/gu,
        },
      ],
    });

    expect(payload.checks).toEqual([
      expect.objectContaining({
        surface: "food-catalog-search",
        list1_query_count: 1,
        list20_query_count: 1,
        item_level_n_plus_one: 0,
      }),
    ]);
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
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"artifact_count":5');
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

    expect(runner).toContain(
      'HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST =\n  "tests/meal-log-core-postgres.integration.test.ts"',
    );
    expect(runner).toContain(
      'await import("./run-isolated-local-supabase-runtime-gate.mjs")',
    );
    expect(integration).toContain("HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID");
    expect(integration).toContain("`supabase_db_${isolatedProjectId}`");
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
});
