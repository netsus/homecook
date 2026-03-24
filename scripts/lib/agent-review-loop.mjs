import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { normalizeReview } from "./agent-loop-core.mjs";

const FIX_STATUSES = new Set(["passed", "failed", "skipped"]);
export const MAX_INLINE_REVIEW_BYTES = 50_000;
export const DEFAULT_REVIEW_LOOP_CONTEXT_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/workpacks/README.md",
  "docs/engineering/agent-review-loop.md",
  "docs/engineering/subagents.md",
  "docs/engineering/agent-workflow-overview.md",
  "scripts/agent-review-loop.mjs",
  "scripts/lib/agent-review-loop.mjs",
  "scripts/lib/agent-loop-core.mjs",
  "scripts/schemas/agent-plan-review.schema.json",
  "scripts/schemas/agent-review-fix.schema.json",
  "tests/agent-review-loop.test.ts",
];

export class ReviewLoopError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ReviewLoopError";
    this.code = options.code ?? "review_loop_error";
    this.stage = options.stage ?? null;
    this.details = options.details ?? null;
  }
}

/**
 * @typedef {{ filePath: string; reason: string }} OmittedReviewTarget
 */

/**
 * @typedef {{
 *   command: string;
 *   status: "passed" | "failed";
 *   exitCode: number;
 *   artifactPath: string;
 * }} VerificationCommandResult
 */

/**
 * @typedef {{
 *   status: "passed" | "failed" | "skipped";
 *   results: VerificationCommandResult[];
 * }} VerificationRunResult
 */

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.flatMap((entry, index) => {
    if (entry === null || entry === undefined) {
      return [];
    }

    if (typeof entry !== "string") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }

    const trimmed = entry.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

function uniqueResolvedPaths(paths) {
  return [...new Set(paths.map((filePath) => resolve(filePath)))];
}

/**
 * @param {{ workingDirectory: string, workpack?: string | null, extraContextFiles?: string[] }} options
 * @returns {string[]}
 */
export function resolveReviewLoopContextFiles({
  workingDirectory,
  workpack = null,
  extraContextFiles = [],
}) {
  const resolvedWorkingDirectory = resolve(workingDirectory);
  const basePaths = DEFAULT_REVIEW_LOOP_CONTEXT_FILES.map((filePath) =>
    resolve(resolvedWorkingDirectory, filePath),
  );
  const workpackPaths = workpack
    ? [
        resolve(resolvedWorkingDirectory, "docs", "workpacks", workpack, "README.md"),
        resolve(resolvedWorkingDirectory, "docs", "workpacks", workpack, "acceptance.md"),
      ]
    : [];
  const extraPaths = extraContextFiles.map((filePath) =>
    resolve(resolvedWorkingDirectory, filePath),
  );
  const allPaths = uniqueResolvedPaths([...basePaths, ...workpackPaths, ...extraPaths]);

  for (const filePath of allPaths) {
    if (!existsSync(filePath)) {
      throw new Error(`Context file not found: ${filePath}`);
    }
  }

  return allPaths;
}

export function buildReviewLoopContextBundle(filePaths, workingDirectory) {
  const resolvedWorkingDirectory = resolve(workingDirectory);

  return filePaths
    .map((filePath) => {
      const content = readFileSync(filePath, "utf8").trim();
      const relativePath = relative(resolvedWorkingDirectory, filePath) || filePath;
      return `### ${relativePath}\n\n${content}`;
    })
    .join("\n\n---\n\n");
}

export function normalizeFixResponse(response) {
  const normalized = ensureObject(response, "fix response");
  const verificationStatus = ensureNonEmptyString(
    normalized.verification_status,
    "fix response.verification_status",
  ).toLowerCase();

  if (!FIX_STATUSES.has(verificationStatus)) {
    throw new Error(
      "fix response.verification_status must be passed, failed, or skipped.",
    );
  }

  return {
    summary: ensureNonEmptyString(normalized.summary, "fix response.summary"),
    files_changed: ensureStringArray(
      normalized.files_changed,
      "fix response.files_changed",
    ),
    tests_run: ensureStringArray(normalized.tests_run, "fix response.tests_run"),
    verification_status: verificationStatus,
    remaining_risks: ensureStringArray(
      normalized.remaining_risks,
      "fix response.remaining_risks",
    ),
  };
}

export function formatFixMarkdown(fix) {
  const lines = [
    `- Summary: ${fix.summary}`,
    `- Verification Status: ${fix.verification_status}`,
  ];

  lines.push("- Files Changed:");
  if (fix.files_changed.length === 0) {
    lines.push("  - none");
  } else {
    for (const filePath of fix.files_changed) {
      lines.push(`  - ${filePath}`);
    }
  }

  lines.push("- Tests Run:");
  if (fix.tests_run.length === 0) {
    lines.push("  - none");
  } else {
    for (const command of fix.tests_run) {
      lines.push(`  - ${command}`);
    }
  }

  lines.push("- Remaining Risks:");
  if (fix.remaining_risks.length === 0) {
    lines.push("  - none");
  } else {
    for (const risk of fix.remaining_risks) {
      lines.push(`  - ${risk}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function runGitCommand(workingDirectory, args) {
  const result = spawnSync("git", args, {
    cwd: workingDirectory,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed.`);
  }

  return result.stdout.trimEnd();
}

function runGitBufferCommand(workingDirectory, args) {
  const result = spawnSync("git", args, {
    cwd: workingDirectory,
    encoding: null,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr =
      result.stderr instanceof Buffer
        ? result.stderr.toString("utf8")
        : String(result.stderr ?? "");
    const stdout =
      result.stdout instanceof Buffer
        ? result.stdout.toString("utf8")
        : String(result.stdout ?? "");
    throw new Error(stderr || stdout || `git ${args.join(" ")} failed.`);
  }

  return Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? "");
}

export function normalizeReviewTargetSpec(options = {}) {
  if (options && typeof options === "object" && options.mode === "working_tree") {
    return {
      mode: "working_tree",
      label: "working tree diff against HEAD",
    };
  }

  if (options && typeof options === "object" && options.mode === "commit_range") {
    const baseRef =
      typeof options.baseRef === "string" ? options.baseRef.trim() : "";
    const headRef =
      typeof options.headRef === "string" ? options.headRef.trim() : "";
    const rangeNotation =
      options.rangeNotation === ".." || options.rangeNotation === "..."
        ? options.rangeNotation
        : "...";

    if (baseRef.length === 0 || headRef.length === 0) {
      throw new Error("commit_range review targets require baseRef and headRef.");
    }

    return {
      mode: "commit_range",
      baseRef,
      headRef,
      rangeNotation,
      label: `commit range ${baseRef}${rangeNotation}${headRef}`,
    };
  }

  const commitRange =
    typeof options.commitRange === "string" ? options.commitRange.trim() : "";
  const baseRef = typeof options.baseRef === "string" ? options.baseRef.trim() : "";
  const headRef = typeof options.headRef === "string" ? options.headRef.trim() : "";

  if (commitRange.length > 0 && (baseRef.length > 0 || headRef.length > 0)) {
    throw new Error("Use either --commit-range or --base-ref/--head-ref, not both.");
  }

  if (commitRange.length > 0) {
    const match = commitRange.match(/^(.+?)(\.\.\.?)(.+)$/);
    if (!match) {
      throw new Error(
        "--commit-range must look like <base>..<head> or <base>...<head>.",
      );
    }

    return {
      mode: "commit_range",
      baseRef: match[1].trim(),
      headRef: match[3].trim(),
      rangeNotation: match[2],
      label: `commit range ${match[1].trim()}${match[2]}${match[3].trim()}`,
    };
  }

  if (baseRef.length > 0 || headRef.length > 0) {
    if (baseRef.length === 0 || headRef.length === 0) {
      throw new Error("--base-ref and --head-ref must be provided together.");
    }

    return {
      mode: "commit_range",
      baseRef,
      headRef,
      rangeNotation: "...",
      label: `commit range ${baseRef}...${headRef}`,
    };
  }

  return {
    mode: "working_tree",
    label: "working tree diff against HEAD",
  };
}

function buildGitDiffRangeArg(reviewTarget) {
  if (reviewTarget.mode !== "commit_range") {
    return null;
  }

  return `${reviewTarget.baseRef}${reviewTarget.rangeNotation}${reviewTarget.headRef}`;
}

function listTrackedDiffFiles(workingDirectory, reviewTarget) {
  const rangeArg = buildGitDiffRangeArg(reviewTarget);
  const diffArgs = ["diff", "--name-only", "--relative"];

  if (rangeArg) {
    diffArgs.push(rangeArg);
  } else {
    diffArgs.push("HEAD");
  }

  diffArgs.push("--");
  const output = runGitCommand(workingDirectory, diffArgs);

  return output
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listUntrackedFiles(workingDirectory) {
  const output = runGitCommand(workingDirectory, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);

  return output
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function classifyInlineTarget(filePath, maxInlineBytes) {
  const stats = statSync(filePath);
  if (stats.size > maxInlineBytes) {
    return {
      include: false,
      reason: "too large",
    };
  }

  const buffer = readFileSync(filePath);
  if (buffer.includes(0)) {
    return {
      include: false,
      reason: "binary",
    };
  }

  return {
    include: true,
    reason: null,
  };
}

function blobExists(workingDirectory, blobSpec) {
  const result = spawnSync("git", ["cat-file", "-e", blobSpec], {
    cwd: workingDirectory,
    encoding: "utf8",
  });

  return result.status === 0;
}

function classifyBlobTarget(workingDirectory, blobSpec, relativePath, maxInlineBytes) {
  const size = Number.parseInt(
    runGitCommand(workingDirectory, ["cat-file", "-s", blobSpec]),
    10,
  );

  if (!Number.isFinite(size)) {
    throw new Error(`Unable to determine blob size for deleted target: ${relativePath}`);
  }

  if (size > maxInlineBytes) {
    return {
      include: false,
      reason: "too large",
    };
  }

  const buffer = runGitBufferCommand(workingDirectory, ["show", blobSpec]);
  if (buffer.includes(0)) {
    return {
      include: false,
      reason: "binary",
    };
  }

  return {
    include: true,
    reason: null,
  };
}

function classifyTrackedTarget({
  workingDirectory,
  relativePath,
  maxInlineBytes,
  reviewTarget,
}) {
  const absolutePath = resolve(workingDirectory, relativePath);

  if (reviewTarget.mode === "working_tree" && existsSync(absolutePath)) {
    return classifyInlineTarget(absolutePath, maxInlineBytes);
  }

  if (reviewTarget.mode === "commit_range") {
    const headBlobSpec = `${reviewTarget.headRef}:${relativePath}`;
    const baseBlobSpec = `${reviewTarget.baseRef}:${relativePath}`;
    const blobSpec = blobExists(workingDirectory, headBlobSpec)
      ? headBlobSpec
      : baseBlobSpec;

    return classifyBlobTarget(
      workingDirectory,
      blobSpec,
      relativePath,
      maxInlineBytes,
    );
  }

  return classifyBlobTarget(
    workingDirectory,
    `HEAD:${relativePath}`,
    relativePath,
    maxInlineBytes,
  );
}

function buildUntrackedFileDiff(relativePath, content) {
  const lines = content.split("\n");
  const body = lines.map((line) => `+${line}`).join("\n");

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
  ].join("\n");
}

function buildOmittedTargetNote(filePath, reason) {
  return `# review target omitted: ${filePath} (${reason})`;
}

function createEmptyReviewTargetError(reviewTarget) {
  return new ReviewLoopError(
    `No review targets found for ${reviewTarget.label}.`,
    {
    code: "empty_review_target",
    stage: "collect_review_targets",
    },
  );
}

function isEmptyReviewTargetError(error) {
  return (
    (error instanceof ReviewLoopError && error.code === "empty_review_target") ||
    (error instanceof Error &&
      /No review targets found against HEAD\./i.test(error.message))
  );
}

export function collectReviewTargets({
  workingDirectory,
  maxInlineBytes = MAX_INLINE_REVIEW_BYTES,
  reviewTarget: requestedReviewTarget = normalizeReviewTargetSpec(),
}) {
  const reviewTarget = normalizeReviewTargetSpec(requestedReviewTarget);
  const trackedFiles = listTrackedDiffFiles(workingDirectory, reviewTarget);
  const untrackedFiles =
    reviewTarget.mode === "working_tree" ? listUntrackedFiles(workingDirectory) : [];

  if (trackedFiles.length === 0 && untrackedFiles.length === 0) {
    throw createEmptyReviewTargetError(reviewTarget);
  }

  const segments = [];
  const includedPaths = [];
  const omittedTargets = [];

  for (const relativePath of trackedFiles) {
    const classification = classifyTrackedTarget({
      workingDirectory,
      relativePath,
      maxInlineBytes,
      reviewTarget,
    });
    if (!classification.include) {
      omittedTargets.push({
        filePath: relativePath,
        reason: classification.reason,
      });
      segments.push(buildOmittedTargetNote(relativePath, classification.reason));
      continue;
    }

    const rangeArg = buildGitDiffRangeArg(reviewTarget);
    const diffArgs = ["diff", "--no-ext-diff", "--submodule=diff", "--relative"];
    if (rangeArg) {
      diffArgs.push(rangeArg);
    } else {
      diffArgs.push("HEAD");
    }
    diffArgs.push("--", relativePath);
    const diff = runGitCommand(workingDirectory, diffArgs);

    if (diff.trim().length > 0) {
      segments.push(diff);
      includedPaths.push(relativePath);
    }
  }

  for (const relativePath of untrackedFiles) {
    const absolutePath = resolve(workingDirectory, relativePath);
    const classification = classifyInlineTarget(absolutePath, maxInlineBytes);

    if (!classification.include) {
      omittedTargets.push({
        filePath: relativePath,
        reason: classification.reason,
      });
      segments.push(buildOmittedTargetNote(relativePath, classification.reason));
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    segments.push(buildUntrackedFileDiff(relativePath, content));
    includedPaths.push(relativePath);
  }

  const diffText = segments.filter(Boolean).join("\n\n").trim();
  if (diffText.length === 0) {
    throw createEmptyReviewTargetError();
  }

  return {
    diffText: `${diffText}\n`,
    includedPaths,
    omittedTargets,
    trackedFiles,
    untrackedFiles,
    reviewTarget,
  };
}

export function assertActionableReviewTargets(targets) {
  ensureObject(targets, "review targets");

  if (!Array.isArray(targets.includedPaths)) {
    throw new Error("review targets.includedPaths must be an array.");
  }

  if (targets.includedPaths.length > 0) {
    return targets;
  }

  throw new ReviewLoopError(
    "All current review targets were omitted from inline review. Human review is required before approval.",
    {
      code: "all_review_targets_omitted",
      stage: "collect_review_targets",
      details: {
        omittedTargets: Array.isArray(targets.omittedTargets) ? targets.omittedTargets : [],
      },
    },
  );
}

function buildVerificationArtifact(artifactPath, command, result) {
  const stdout = typeof result.stdout === "string" ? result.stdout.trimEnd() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trimEnd() : "";
  const exitCode = typeof result.status === "number" ? result.status : 1;

  return [
    `# Verification`,
    "",
    `- Artifact: ${artifactPath}`,
    `- Command: ${command}`,
    `- Exit Code: ${exitCode}`,
    "",
    "## Stdout",
    "",
    stdout.length > 0 ? stdout : "(empty)",
    "",
    "## Stderr",
    "",
    stderr.length > 0 ? stderr : "(empty)",
    "",
  ].join("\n");
}

function normalizeVerificationPhase(phase) {
  if (typeof phase !== "string" || phase.trim().length === 0) {
    return "post-fix";
  }

  return phase.trim();
}

export function runVerificationCommands({
  commands,
  workingDirectory,
  outputDir,
  round,
  phase = "post-fix",
}) {
  const normalizedPhase = normalizeVerificationPhase(phase);
  const verificationDir = join(outputDir, "verification", normalizedPhase);
  mkdirSync(verificationDir, { recursive: true });

  if (!commands || commands.length === 0) {
    return {
      status: "skipped",
      results: [],
    };
  }

  const results = [];
  let status = "passed";

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const result = spawnSync(command, {
      cwd: workingDirectory,
      encoding: "utf8",
      shell: true,
    });
    const relativePath = `${String(round).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}.txt`;
    const artifactPath = `verification/${normalizedPhase}/${relativePath}`;
    writeFileSync(
      join(verificationDir, relativePath),
      `${buildVerificationArtifact(artifactPath, command, result).trim()}\n`,
    );

    const exitCode = typeof result.status === "number" ? result.status : 1;
    const commandStatus = exitCode === 0 ? "passed" : "failed";
    if (commandStatus === "failed") {
      status = "failed";
    }

    results.push({
      command,
      status: commandStatus,
      exitCode,
      artifactPath,
    });
  }

  return {
    status,
    results,
  };
}

export function createVerificationFailureReview(results) {
  const failedResults = results.filter((result) => result.status === "failed");

  return normalizeReview("codex", {
    decision: "revise",
    summary:
      "Verification commands are still failing for the current diff and must be fixed before approval.",
    blocker_status: "non-blocker",
    required_changes: failedResults.map((result, index) => ({
      id: `verification-${index + 1}`,
      title: "Fix failing verification command",
      details: `The verification command \`${result.command}\` exited with code ${result.exitCode}.`,
      file_path: null,
      line: null,
      source_refs: [result.artifactPath],
    })),
    recommended_changes: [],
    unresolved_questions: [],
  });
}

export function runApprovalVerificationGate({
  commands,
  workingDirectory,
  outputDir,
  round,
}) {
  const verification = runVerificationCommands({
    commands,
    workingDirectory,
    outputDir,
    round,
    phase: "approval-gate",
  });

  return {
    verification,
    approvalReview:
      verification.status === "failed"
        ? createVerificationFailureReview(verification.results)
        : null,
  };
}

export function collectCurrentReviewTargetSnapshot({
  workingDirectory,
  collectTargets = collectReviewTargets,
  reviewTarget = normalizeReviewTargetSpec(),
}) {
  try {
    const currentTargets = collectTargets({
      workingDirectory,
      reviewTarget,
    });

    return {
      diffText: currentTargets.diffText,
      omittedTargets: currentTargets.omittedTargets,
      isEmpty: false,
    };
  } catch (error) {
    if (isEmptyReviewTargetError(error)) {
      return {
        diffText:
          reviewTarget.mode === "working_tree"
            ? "# No review targets remain against HEAD.\n"
            : `# No review targets remain for ${reviewTarget.label}.\n`,
        omittedTargets: [],
        isEmpty: true,
      };
    }

    throw error;
  }
}

function buildFailureMarkdown(summary) {
  return [
    "# Agent Review Loop Failure",
    "",
    `- Stage: ${summary.stage}`,
    `- Code: ${summary.code}`,
    `- Message: ${summary.message}`,
    `- Goal: ${summary.goal ?? "unknown"}`,
    "",
    "## Artifact Paths",
    "",
    ...(Object.entries(summary.artifact_paths).length === 0
      ? ["- none"]
      : Object.entries(summary.artifact_paths).map(
          ([key, value]) => `- ${key}: ${value}`,
        )),
    "",
    "## Details",
    "",
    summary.details
      ? "```json\n" + JSON.stringify(summary.details, null, 2) + "\n```"
      : "none",
    "",
  ].join("\n");
}

/**
 * @param {{
 *   outputDir: string;
 *   goal?: string | null;
 *   stage: string;
 *   code: string;
 *   message: string;
 *   artifactPaths?: Record<string, string>;
 *   details?: unknown;
 * }} options
 */
export function writeFailureArtifacts({
  outputDir,
  goal,
  stage,
  code,
  message,
  artifactPaths = {},
  details = null,
}) {
  mkdirSync(outputDir, { recursive: true });

  const summary = {
    goal: goal ?? null,
    stage,
    code,
    message,
    artifact_paths: artifactPaths,
    details,
  };

  writeFileSync(
    join(outputDir, "failure-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, "failure-summary.md"),
    `${buildFailureMarkdown(summary).trim()}\n`,
  );

  return summary;
}

/**
 * @param {{
 *   goal: string;
 *   finalStatus: string;
 *   roundsCompleted: number;
 *   currentTargetPath: string;
 *   omittedReviewTargets?: OmittedReviewTarget[];
 *   lastClaudeReview: any;
 *   lastCodexReview: any;
 *   lastFix: any;
 *   lastVerification: VerificationRunResult | null;
 *   verifyCommands: string[];
 *   agentConfig: any;
 * }} options
 */
export function buildReviewLoopSummary({
  goal,
  finalStatus,
  roundsCompleted,
  currentTargetPath,
  omittedReviewTargets = [],
  lastClaudeReview,
  lastCodexReview,
  lastFix,
  lastVerification,
  verifyCommands,
  agentConfig,
}) {
  const unresolvedQuestions = [
    ...new Set([
      ...(lastClaudeReview?.unresolved_questions ?? []),
      ...(lastCodexReview?.unresolved_questions ?? []),
    ]),
  ];

  return {
    goal,
    status: finalStatus,
    rounds_completed: roundsCompleted,
    current_target_path: currentTargetPath,
    omitted_review_targets: omittedReviewTargets,
    claude_last_decision: lastClaudeReview?.decision ?? null,
    codex_last_decision: lastCodexReview?.decision ?? null,
    claude_required_changes: lastClaudeReview?.required_changes ?? [],
    codex_required_changes: lastCodexReview?.required_changes ?? [],
    unresolved_questions: unresolvedQuestions,
    verification_status: lastVerification?.status ?? "skipped",
    verification_commands: verifyCommands,
    last_fix: lastFix ?? null,
    pingpong_log_path: "pingpong-log.md",
    resolved_agent_config: agentConfig,
  };
}

/**
 * @param {{
 *   finalStatus: string;
 *   omittedReviewTargets?: OmittedReviewTarget[];
 * }} options
 */
export function enforceOmittedTargetApprovalGate({
  finalStatus,
  omittedReviewTargets = [],
}) {
  if (finalStatus === "approved" && omittedReviewTargets.length > 0) {
    return "needs_revision";
  }

  return finalStatus;
}

/**
 * @param {{
 *   finalStatus: string;
 *   omittedReviewTargets?: OmittedReviewTarget[];
 *   verificationStatus?: "passed" | "failed" | "skipped";
 *   verifyCommands?: string[];
 * }} options
 */
export function evaluateFinalApprovalGate({
  finalStatus,
  omittedReviewTargets = [],
  verificationStatus = "skipped",
  verifyCommands = [],
}) {
  const reasons = [];
  let status = finalStatus;

  if (status === "approved" && verifyCommands.length > 0 && verificationStatus !== "passed") {
    status = "needs_revision";
    reasons.push(`verification_status=${verificationStatus}`);
  }

  if (status === "approved" && omittedReviewTargets.length > 0) {
    status = "needs_revision";
    reasons.push(`${omittedReviewTargets.length} review target(s) remain omitted from inline review`);
  }

  return {
    status,
    reasons,
  };
}

export function mergeStableAgentReview(
  currentReview,
  candidateReview,
  options = {},
) {
  if (options.synthetic) {
    return currentReview;
  }

  return candidateReview ?? currentReview;
}
