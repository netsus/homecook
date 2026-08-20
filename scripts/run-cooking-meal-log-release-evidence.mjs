#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import {
  EVIDENCE_SCHEMA_VERSION,
  FULL_DB_LANES,
  assertRunnableSummary,
  buildLaneEnvironment,
  createAttemptDirectory,
  parseVitestJsonSummary,
  parseVitestTextSummary,
  writeEvidenceArtifact,
  writeEvidenceManifest,
} from "./lib/cooking-meal-log-release-evidence.mjs";

const repositoryRoot = process.cwd();
const defaultArtifactRoot = join(
  repositoryRoot,
  ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts",
);
const performanceSourcePath = join(
  repositoryRoot,
  ".artifacts/prepared-food-search-relevance/performance-summary.json",
);

const dbRunners = [
  [
    "account-session-generation",
    "scripts/run-account-session-generation-postgres-integration.mjs",
  ],
  [
    "recipe-visibility-read-hardening",
    "scripts/run-recipe-visibility-read-hardening-postgres-integration.mjs",
  ],
  [
    "recipe-snapshot-authority",
    "scripts/run-recipe-snapshot-authority-postgres-integration.mjs",
  ],
  [
    "personal-recipe-customization-write-core",
    "scripts/run-personal-recipe-customization-write-core-postgres-integration.mjs",
  ],
  [
    "recipe-content-snapshot-future-propagation",
    "scripts/run-recipe-content-snapshot-future-propagation-postgres-integration.mjs",
  ],
  [
    "cooked-batch-weight-ledger",
    "scripts/run-cooked-batch-weight-ledger-postgres-integration.mjs",
  ],
  ["meal-log-core", "scripts/run-meal-log-core-postgres-integration.mjs"],
  [
    "legacy-product-compat",
    "scripts/run-legacy-product-compat-postgres-integration.mjs",
  ],
];

function parseArgs(argv) {
  const args = {
    artifactRoot: defaultArtifactRoot,
    attemptId: null,
    dryRun: false,
    headSha: null,
    profile: "full",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--") continue;
    if (value === "--artifact-root") args.artifactRoot = resolve(next);
    if (value === "--attempt-id") args.attemptId = next;
    if (value === "--head-sha") args.headSha = next;
    if (value === "--profile") args.profile = next;
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (value.startsWith("--")) index += 1;
  }
  return args;
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: buildLaneEnvironment({ ambient: process.env }),
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function writeCreateOnly(filePath, value) {
  writeFileSync(filePath, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function runCaptured({
  attemptDir,
  command,
  args,
  label,
  env = buildLaneEnvironment({ ambient: process.env }),
  timeoutMs = 900_000,
}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeCreateOnly(join(attemptDir, "raw", `${label}.log`), output);
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`${label}: command timed out`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: command failed with status ${result.status}`);
  }
  return { output, startedAt };
}

function runVitestJson({ attemptDir, extraEnv = {}, files, label }) {
  const rawPath = join(attemptDir, "raw", `${label}.json`);
  runCaptured({
    attemptDir,
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      ...files,
      "--pool=forks",
      "--maxWorkers=1",
      "--reporter=json",
      `--outputFile=${rawPath}`,
    ],
    label,
    env: buildLaneEnvironment({ ambient: process.env, extra: extraEnv }),
  });
  const summary = parseVitestJsonSummary(readFileSync(rawPath, "utf8"));
  assertRunnableSummary(summary, label);
  return summary;
}

function envelope({
  artifactType,
  attemptId,
  generatedAt,
  headSha,
  profile,
  summary,
  payload,
}) {
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    artifact_type: artifactType,
    attempt_id: attemptId,
    head_sha: headSha,
    generated_at: generatedAt,
    profile,
    ...summary,
    payload,
  };
}

function produceDbEvidence({
  attemptDir,
  attemptId,
  generatedAt,
  headSha,
  profile,
}) {
  const selected = profile === "proof" ? dbRunners.slice(0, 1) : dbRunners;
  const lanes = selected.map(([id, scriptPath]) => {
    const result = runCaptured({
      attemptDir,
      command: process.execPath,
      args: [scriptPath],
      label: `db-${id}`,
    });
    const summary = parseVitestTextSummary(result.output);
    assertRunnableSummary(summary, `db-${id}`);
    return { id, ...summary };
  });
  const summary = lanes.reduce(
    (total, lane) => ({
      passed: total.passed + lane.passed,
      skipped: total.skipped + lane.skipped,
      pending: total.pending + lane.pending,
      failed: total.failed + lane.failed,
    }),
    { passed: 0, skipped: 0, pending: 0, failed: 0 },
  );
  writeEvidenceArtifact(attemptDir, "db-security.json", envelope({
    artifactType: "db-security",
    attemptId,
    generatedAt,
    headSha,
    profile,
    summary,
    payload: {
      lanes,
      pinned_isolated_local: true,
      remote_linked_cloud_access: 0,
    },
  }));
}

function produceSecurityEvidence({
  attemptDir,
  attemptId,
  generatedAt,
  headSha,
  profile,
}) {
  let summary;
  let payload;
  if (profile === "proof") {
    summary = runVitestJson({
      attemptDir,
      files: ["tests/recipe-visibility-security-function-inventory.test.ts"],
      label: "security-proof",
    });
    payload = {
      proof_only: true,
      isolated_local: true,
      mutation_inventory: [
        "proof:recipe-visibility-security-function-inventory",
      ],
      authorization_inventory_classified: summary.passed,
      data_api_negatives: 1,
      remote_access: 0,
    };
  } else {
    const result = runCaptured({
      attemptDir,
      command: "pnpm",
      args: ["verify:security-functions:release"],
      label: "security-release",
      timeoutMs: 1_200_000,
    });
    const checked = Number(
      result.output.match(/"anon_mutation_signatures_checked"\s*:\s*(\d+)/u)?.[1]
        ?? 0,
    );
    if (checked <= 0) {
      throw new Error("security-release: nonzero mutation evidence is missing");
    }
    const mutationInventory = [...new Set(
      [...result.output.matchAll(/"signature"\s*:\s*"([^"]+)"/gu)]
        .map((match) => match[1]),
    )];
    const classified = Number(
      result.output.match(/valid for local;\s*(\d+)\s+additive/iu)?.[1]
        ?? 0,
    );
    const dataApiNegatives = [
      ...result.output.matchAll(/"status"\s*:\s*406/gu),
    ].length;
    if (
      mutationInventory.length <= 0
      || classified <= 0
      || dataApiNegatives <= 0
    ) {
      throw new Error("security-release: semantic safety inventory is missing");
    }
    summary = { passed: checked, skipped: 0, pending: 0, failed: 0 };
    payload = {
      isolated_local: true,
      anon_mutation_signatures_checked: checked,
      mutation_inventory: mutationInventory,
      authorization_inventory_classified: classified,
      data_api_negatives: dataApiNegatives,
      remote_access: 0,
    };
  }
  writeEvidenceArtifact(attemptDir, "security.json", envelope({
    artifactType: "security",
    attemptId,
    generatedAt,
    headSha,
    profile,
    summary,
    payload,
  }));
}

function producePerformanceEvidence({
  attemptDir,
  attemptId,
  generatedAt,
  headSha,
  profile,
}) {
  let summary;
  let payload;
  if (profile === "proof") {
    summary = runVitestJson({
      attemptDir,
      files: ["tests/prepared-food-search-performance-runner.test.ts"],
      label: "performance-proof",
    });
    payload = { proof_only: true, runner_contract_tested: true };
  } else {
    const result = runCaptured({
      attemptDir,
      command: "pnpm",
      args: ["perf:prepared-food-search-relevance"],
      label: "performance-full",
      timeoutMs: 1_200_000,
    });
    if (!existsSync(performanceSourcePath)) {
      throw new Error("performance-full: summary artifact is missing");
    }
    if (statSync(performanceSourcePath).mtimeMs + 1_000 < result.startedAt) {
      throw new Error("performance-full: stale summary artifact rejected");
    }
    payload = JSON.parse(readFileSync(performanceSourcePath, "utf8"));
    const passed = Number(payload.labeled_query_count ?? 0);
    summary = { passed, skipped: 0, pending: 0, failed: 0 };
    assertRunnableSummary(summary, "performance-full");
    writeCreateOnly(
      join(attemptDir, "raw", "performance-source.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  }
  writeEvidenceArtifact(attemptDir, "performance.json", envelope({
    artifactType: "performance",
    attemptId,
    generatedAt,
    headSha,
    profile,
    summary,
    payload,
  }));
}

function produceQueryCountEvidence({
  attemptDir,
  attemptId,
  generatedAt,
  headSha,
  profile,
}) {
  const measurementPath = join(
    attemptDir,
    "raw/query-count-measurement.json",
  );
  const summary = runVitestJson({
    attemptDir,
    extraEnv: {
      HOMECOOK_CML14_QUERY_COUNT: "1",
      HOMECOOK_CML14_QUERY_COUNT_OUTPUT: measurementPath,
    },
    files: ["tests/cooking-meal-log-query-count.integration.test.ts"],
    label: "query-count",
  });
  const payload = JSON.parse(readFileSync(measurementPath, "utf8"));
  if (payload.measurement_kind !== "actual-route-service-boundary") {
    throw new Error("query-count: actual route measurement is missing");
  }
  assertRunnableSummary(summary, "query-count");
  writeEvidenceArtifact(attemptDir, "query-count.json", envelope({
    artifactType: "query-count",
    attemptId,
    generatedAt,
    headSha,
    profile,
    summary,
    payload,
  }));
}

function produceRollbackEvidence({
  attemptDir,
  attemptId,
  generatedAt,
  headSha,
  profile,
}) {
  const summary = runVitestJson({
    attemptDir,
    files: [
      "tests/cooking-version-dispatch-compat.test.ts",
      "tests/compatibility-tombstone-gates.test.ts",
      "tests/snapshot-v2-session-attempts.test.ts",
      "tests/snapshot-v2-complete.test.ts",
      "tests/legacy-product-compat.test.ts",
    ],
    label: "rollback",
  });
  writeEvidenceArtifact(attemptDir, "rollback.json", envelope({
    artifactType: "rollback",
    attemptId,
    generatedAt,
    headSha,
    profile,
    summary,
    payload: {
      current_and_previous: true,
      seeded_v2_drain: true,
      tombstone_fail_closed: true,
    },
  }));
}

const args = parseArgs(process.argv.slice(2));
if (!args.attemptId || !args.headSha) {
  throw new Error("--attempt-id and --head-sha are required");
}
if (!new Set(["proof", "full"]).has(args.profile)) {
  throw new Error("--profile must be proof or full");
}
const actualHead = gitOutput(["rev-parse", "HEAD"]);
if (actualHead !== args.headSha) {
  throw new Error("--head-sha must equal the current exact HEAD");
}
if (args.dryRun) {
  process.stdout.write(`${JSON.stringify({
    attempt_id: args.attemptId,
    artifact_root: args.artifactRoot,
    db_lanes: args.profile === "full" ? FULL_DB_LANES : FULL_DB_LANES.slice(0, 1),
    head_sha: args.headSha,
    profile: args.profile,
  })}\n`);
  process.exit(0);
}
if (gitOutput(["status", "--porcelain"]) !== "") {
  throw new Error("evidence production requires a clean worktree");
}

const attemptStartedAt = new Date().toISOString();
const attemptDir = createAttemptDirectory({
  artifactRoot: args.artifactRoot,
  attemptId: args.attemptId,
});
mkdirSync(join(attemptDir, "raw"), { mode: 0o700 });

const productionContext = {
  attemptDir,
  attemptId: args.attemptId,
  generatedAt: attemptStartedAt,
  headSha: args.headSha,
  profile: args.profile,
};
produceDbEvidence(productionContext);
produceSecurityEvidence(productionContext);
producePerformanceEvidence(productionContext);
produceQueryCountEvidence(productionContext);
produceRollbackEvidence(productionContext);
writeEvidenceManifest(attemptDir, {
  attemptId: args.attemptId,
  headSha: args.headSha,
  generatedAt: attemptStartedAt,
  profile: args.profile,
});

process.stdout.write(`${JSON.stringify({
  attempt_dir: attemptDir,
  attempt_id: args.attemptId,
  head_sha: args.headSha,
  profile: args.profile,
})}\n`);
