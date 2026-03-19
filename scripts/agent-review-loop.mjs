#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPingPongLogMarkdown,
  evaluateLoopRound,
  formatAgentSetting,
  formatReviewMarkdown,
  normalizeReview,
  parseClaudeInvocationMetadata,
  parseCodexInvocationMetadata,
  parseStructuredOutput,
} from "./lib/agent-loop-core.mjs";
import {
  assertActionableReviewTargets,
  buildReviewLoopContextBundle,
  buildReviewLoopSummary,
  collectCurrentReviewTargetSnapshot,
  collectReviewTargets,
  evaluateFinalApprovalGate,
  formatFixMarkdown,
  mergeStableAgentReview,
  normalizeFixResponse,
  ReviewLoopError,
  resolveReviewLoopContextFiles,
  runApprovalVerificationGate,
  runVerificationCommands,
  writeFailureArtifacts,
} from "./lib/agent-review-loop.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_MAX_ROUNDS = 3;
const REVIEW_SCHEMA_PATH = join(
  __dirname,
  "schemas",
  "agent-plan-review.schema.json",
);
const FIX_SCHEMA_PATH = join(
  __dirname,
  "schemas",
  "agent-review-fix.schema.json",
);
const CODEX_CONFIG_PATH = resolve(process.env.HOME ?? "~", ".codex", "config.toml");
const CLAUDE_SETTINGS_PATH = resolve(
  process.env.HOME ?? "~",
  ".claude",
  "settings.json",
);
const LAST_ERROR_LOG_PATH = resolve(".artifacts", "agent-review-loop", "last-error.log");

const runFailureContext = {
  outputDir: null,
  goal: null,
  stage: "startup",
  artifactPaths: {},
};

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/agent-review-loop.mjs --goal <text> [options]",
      "",
      "Options:",
      "  --goal <text>               Review loop goal text",
      "  --goal-file <path>          Read review loop goal from a file",
      "  --workpack <slice>          Include docs/workpacks/<slice>/README.md and acceptance.md",
      "  --context-file <path>       Additional context file (repeatable)",
      "  --max-rounds <n>            Maximum Claude/Codex review rounds (default: 3)",
      "  --verify-cmd <command>      Verification command to run after each Codex fix (repeatable)",
      "  --output-dir <path>         Output directory for prompts, reviews, fixes, and summaries",
      "  --codex-model <model>       Optional Codex CLI model override",
      "  --codex-effort <level>      Optional Codex reasoning effort (low|medium|high|xhigh)",
      "  --claude-model <model>      Optional Claude CLI model override",
      "  --claude-effort <level>     Optional Claude effort (low|medium|high)",
      "  --help                      Show this help text",
      "",
      "Example:",
      '  pnpm agent:review-loop -- --goal "Current diff review" --verify-cmd "pnpm test -- agent-review-loop"',
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = {
    contextFiles: [],
    verifyCmds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      continue;
    }

    if (token === "--help") {
      options.help = true;
      continue;
    }

    if (token === "--context-file") {
      options.contextFiles.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--verify-cmd") {
      options.verifyCmds.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (
      token === "--goal" ||
      token === "--goal-file" ||
      token === "--workpack" ||
      token === "--max-rounds" ||
      token === "--output-dir" ||
      token === "--codex-model" ||
      token === "--codex-effort" ||
      token === "--claude-model" ||
      token === "--claude-effort"
    ) {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }

  return value;
}

function resolveGoal(options) {
  if (options.goal && options.goalFile) {
    throw new Error("Use either --goal or --goal-file, not both.");
  }

  if (options.goal) return options.goal.trim();

  if (options.goalFile) {
    return readRequiredFile(resolve(options.goalFile));
  }

  throw new Error("A review loop goal is required via --goal or --goal-file.");
}

function readRequiredFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return readFileSync(filePath, "utf8").trim();
}

function readOptionalFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

function readCodexDefaultConfig() {
  const raw = readOptionalFile(CODEX_CONFIG_PATH);
  if (!raw) {
    return {
      model: null,
      effort: null,
    };
  }

  return {
    model: raw.match(/^model\s*=\s*"([^"]+)"/m)?.[1] ?? null,
    effort: raw.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1] ?? null,
  };
}

function readClaudeDefaultConfig() {
  const raw = readOptionalFile(CLAUDE_SETTINGS_PATH);
  if (!raw) {
    return {
      model: null,
      effort: null,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      model:
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.model === "string"
          ? parsed.model
          : null,
      effort:
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.effortLevel === "string"
          ? parsed.effortLevel
          : null,
    };
  } catch {
    return {
      model: null,
      effort: null,
    };
  }
}

function timestampSlug() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];

  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function resolveOutputDir(options) {
  const target = options.outputDir
    ? resolve(options.outputDir)
    : resolve(".artifacts", "agent-review-loop", timestampSlug());

  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, "prompts"), { recursive: true });
  mkdirSync(join(target, "reviews"), { recursive: true });
  mkdirSync(join(target, "fixes"), { recursive: true });
  mkdirSync(join(target, "targets"), { recursive: true });
  mkdirSync(join(target, "verification"), { recursive: true });

  return target;
}

function buildVerificationContext(verification) {
  if (!verification) {
    return JSON.stringify(
      {
        status: "skipped",
        results: [],
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      status: verification.status,
      results: verification.results.map((result) => ({
        command: result.command,
        status: result.status,
        exit_code: result.exitCode,
        artifact_path: result.artifactPath,
      })),
    },
    null,
    2,
  );
}

function buildClaudeReviewPrompt({
  goal,
  contextBundle,
  targetDiff,
  verification,
  round,
}) {
  return [
    "You are the adversarial code reviewer for this repository.",
    "Review only the current git diff against HEAD that is included below.",
    "Focus on correctness, hidden blockers, missing tests, security, performance, and doc-contract drift.",
    "Prefer concrete required changes over broad rewrites.",
    "Return JSON that matches the provided schema exactly.",
    "",
    `Round: ${round}`,
    "Goal:",
    goal,
    "",
    "Latest Verification Context:",
    buildVerificationContext(verification),
    "",
    "Current Review Target Diff:",
    targetDiff,
    "",
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function buildCodexFixPrompt({
  goal,
  contextBundle,
  targetDiff,
  review,
  verification,
  round,
}) {
  return [
    "You are fixing the current repository diff based on review feedback.",
    "Edit the workspace directly and keep unrelated user changes intact.",
    "Do not revert unrelated edits. Only change what is needed to address the review.",
    "Add or update tests when the review points to missing coverage.",
    "Set verification_status to skipped in your JSON response. The wrapper will overwrite it after running verification commands.",
    "Return JSON that matches the provided schema exactly.",
    "",
    `Fix Round: ${round}`,
    "Goal:",
    goal,
    "",
    "Review To Address:",
    JSON.stringify(
      {
        agent: review.agent,
        decision: review.decision,
        summary: review.summary,
        required_changes: review.required_changes,
        recommended_changes: review.recommended_changes,
        unresolved_questions: review.unresolved_questions,
      },
      null,
      2,
    ),
    "",
    "Latest Verification Context:",
    buildVerificationContext(verification),
    "",
    "Current Review Target Diff:",
    targetDiff,
    "",
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function buildCodexFinalReviewPrompt({
  goal,
  contextBundle,
  targetDiff,
  claudeReview,
  verification,
  round,
}) {
  return [
    "You are performing the final Codex sanity review for the current repository diff.",
    "Approve only if the current diff is ready for a human to commit after review.",
    "If you request changes, keep them concrete and limited to what still blocks merge readiness.",
    "Return JSON that matches the provided schema exactly.",
    "",
    `Final Review Round: ${round}`,
    "Goal:",
    goal,
    "",
    "Claude Approval Context:",
    JSON.stringify(
      {
        decision: claudeReview.decision,
        summary: claudeReview.summary,
        recommended_changes: claudeReview.recommended_changes,
      },
      null,
      2,
    ),
    "",
    "Latest Verification Context:",
    buildVerificationContext(verification),
    "",
    "Current Review Target Diff:",
    targetDiff,
    "",
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function runCodex({
  prompt,
  schemaPath,
  outputPath,
  workingDirectory,
  model,
  effort,
  sandbox,
}) {
  const args = [
    "exec",
    "-C",
    workingDirectory,
    "-s",
    sandbox,
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    "-",
  ];

  if (model) {
    args.splice(1, 0, "--model", model);
  }

  if (effort) {
    args.splice(1, 0, "-c", `model_reasoning_effort=\"${effort}\"`);
  }

  const result = spawnSync("codex", args, {
    input: prompt,
    encoding: "utf8",
    cwd: workingDirectory,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Codex command failed (${result.status}).\n${result.stderr || result.stdout}`,
    );
  }

  return {
    output: readRequiredFile(outputPath),
    metadata: parseCodexInvocationMetadata(result.stderr),
  };
}

function runClaude({
  prompt,
  schemaPath,
  workingDirectory,
  model,
  effort,
  outputPath,
}) {
  const schema = readRequiredFile(schemaPath);
  const args = [
    "-p",
    "--output-format",
    "json",
    "--input-format",
    "text",
    "--json-schema",
    schema,
    "--permission-mode",
    "dontAsk",
  ];

  if (model) {
    args.push("--model", model);
  }

  if (effort) {
    args.push("--effort", effort);
  }

  const result = spawnSync("claude", args, {
    input: prompt,
    encoding: "utf8",
    cwd: workingDirectory,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Claude command failed (${result.status}).\n${result.stderr || result.stdout}`,
    );
  }

  if (outputPath) {
    writeFileSync(outputPath, `${result.stdout.trim()}\n`);
  }

  return {
    output: result.stdout.trim(),
    metadata: parseClaudeInvocationMetadata(result.stdout),
  };
}

function writePrompt(outputDir, name, prompt) {
  const relativePath = `prompts/${name}.txt`;
  writeFileSync(join(outputDir, relativePath), `${prompt}\n`);
  runFailureContext.artifactPaths.last_prompt = relativePath;
}

function writeReviewArtifacts(outputDir, name, review) {
  const jsonRelativePath = `reviews/${name}.json`;
  const markdownRelativePath = `reviews/${name}.md`;
  writeFileSync(
    join(outputDir, jsonRelativePath),
    `${JSON.stringify(review, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, markdownRelativePath),
    formatReviewMarkdown(review),
  );
  runFailureContext.artifactPaths.last_review_json = jsonRelativePath;
  runFailureContext.artifactPaths.last_review_markdown = markdownRelativePath;
}

function writeFixArtifacts(outputDir, name, fix) {
  const jsonRelativePath = `fixes/${name}.json`;
  const markdownRelativePath = `fixes/${name}.md`;
  writeFileSync(
    join(outputDir, jsonRelativePath),
    `${JSON.stringify(fix, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, markdownRelativePath),
    formatFixMarkdown(fix),
  );
  runFailureContext.artifactPaths.last_fix_json = jsonRelativePath;
  runFailureContext.artifactPaths.last_fix_markdown = markdownRelativePath;
}

function writeTargetArtifact(outputDir, name, diffText) {
  const relativePath = `targets/${name}.diff`;
  writeFileSync(join(outputDir, relativePath), diffText);
  runFailureContext.artifactPaths.last_target = relativePath;
}

function writePingPongLog(outputDir, state) {
  writeFileSync(
    join(outputDir, "pingpong-log.md"),
    buildPingPongLogMarkdown({
      goal: state.goal,
      status: state.status,
      roundsCompleted: state.roundsCompleted,
      maxRounds: state.maxRounds,
      workpack: state.workpack,
      agentConfig: state.agentConfig,
      currentArtifactLabel: "current-target",
      currentArtifactPath: state.currentArtifactPath,
      finalSummaryPath: state.finalSummaryPath,
      entries: state.entries,
      lastUpdated: new Date().toISOString(),
    }),
  );
  runFailureContext.artifactPaths.pingpong_log = "pingpong-log.md";
}

function addPingPongEntry(outputDir, state, entry) {
  state.entries.push({
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  });
  writePingPongLog(outputDir, state);
}

function formatIssueTitles(issues) {
  if (!issues || issues.length === 0) return "none";
  return issues
    .map((issue) => {
      const location = issue.file_path
        ? ` (${issue.file_path}${issue.line ? `:${issue.line}` : ""})`
        : "";
      return `${issue.id}: ${issue.title}${location}`;
    })
    .join("; ");
}

function formatScopedIssueLines(agent, issues) {
  if (!issues || issues.length === 0) {
    return [`- ${agent}: none`];
  }

  return issues.map((issue) => {
    const location = issue.file_path
      ? ` (${issue.file_path}${issue.line ? `:${issue.line}` : ""})`
      : "";
    return `- ${agent} ${issue.id}: ${issue.title}${location}`;
  });
}

function formatStringListLines(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }

  return items.map((item) => `- ${item}`);
}

function createSyntheticRevisionReview(agent, summary) {
  return normalizeReview(agent, {
    decision: "revise",
    summary,
    blocker_status: "non-blocker",
    required_changes: [],
    recommended_changes: [],
    unresolved_questions: [],
  });
}

function buildTargetSummary(targets) {
  const parts = [`Included ${targets.includedPaths.length} file(s)`];

  if (targets.omittedTargets.length > 0) {
    parts.push(`omitted ${targets.omittedTargets.length} file(s)`);
  }

  return `${parts.join(", ")}.`;
}

function buildFinalSummary({
  goal,
  outputDir,
  finalStatus,
  roundsCompleted,
  lastClaudeReview,
  lastCodexReview,
  lastFix,
  lastVerification,
  verifyCommands,
  agentConfig,
  currentTargetPath,
  omittedReviewTargets,
}) {
  const summary = buildReviewLoopSummary({
    goal,
    finalStatus,
    roundsCompleted,
    currentTargetPath,
    omittedReviewTargets,
    lastClaudeReview,
    lastCodexReview,
    lastFix,
    lastVerification,
    verifyCommands,
    agentConfig,
  });

  writeFileSync(
    join(outputDir, "final-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  runFailureContext.artifactPaths.final_summary_json = "final-summary.json";

  const markdown = [
    "# Agent Review Loop Summary",
    "",
    `- Goal: ${goal}`,
    `- Status: ${finalStatus}`,
    `- Rounds Completed: ${roundsCompleted}`,
    `- Current Review Target: ${currentTargetPath ? `[current-target](${currentTargetPath})` : "pending"}`,
    `- Ping-Pong Log: [pingpong-log](pingpong-log.md)`,
    "",
    "## Agent Config",
    "",
    `- Codex: model=${formatAgentSetting(agentConfig?.codex?.model, agentConfig?.codex?.modelSource)}, effort=${formatAgentSetting(agentConfig?.codex?.effort, agentConfig?.codex?.effortSource)}`,
    `- Claude: model=${formatAgentSetting(agentConfig?.claude?.model, agentConfig?.claude?.modelSource)}, effort=${formatAgentSetting(agentConfig?.claude?.effort, agentConfig?.claude?.effortSource)}`,
    "",
    "## Verification",
    "",
    `- Status: ${lastVerification?.status ?? "skipped"}`,
    `- Commands Configured: ${verifyCommands.length}`,
    ...formatStringListLines(
      lastVerification?.results?.map(
        (result) =>
          `${result.status}: ${result.command} (exit ${result.exitCode}) -> ${result.artifactPath}`,
      ) ?? [],
    ),
    "",
    "## Last Decisions",
    "",
    `- Claude: ${lastClaudeReview?.decision ?? "n/a"} (${lastClaudeReview?.summary ?? "n/a"})`,
    `- Codex: ${lastCodexReview?.decision ?? "n/a"} (${lastCodexReview?.summary ?? "n/a"})`,
    "",
    "## Outstanding Required Changes",
    "",
    ...formatScopedIssueLines("Claude", lastClaudeReview?.required_changes),
    ...formatScopedIssueLines("Codex", lastCodexReview?.required_changes),
    "",
    "## Omitted Review Targets",
    "",
    ...formatStringListLines(
      summary.omitted_review_targets.map(
        (target) => `${target.filePath} (${target.reason})`,
      ),
    ),
    "",
    "## Unresolved Questions",
    "",
    ...formatStringListLines(summary.unresolved_questions),
    "",
    "## Last Fix",
    "",
    `- Summary: ${summary.last_fix?.summary ?? "No Codex fix was applied."}`,
    `- Verification Status: ${summary.last_fix?.verification_status ?? summary.verification_status}`,
    ...formatStringListLines(
      summary.last_fix?.files_changed?.map((filePath) => `changed: ${filePath}`) ?? [],
    ),
    ...formatStringListLines(
      summary.last_fix?.tests_run?.map((command) => `test: ${command}`) ?? [],
    ),
    ...formatStringListLines(
      summary.last_fix?.remaining_risks?.map((risk) => `risk: ${risk}`) ?? [],
    ),
    "",
  ].join("\n");

  writeFileSync(join(outputDir, "final-summary.md"), `${markdown.trim()}\n`);
  runFailureContext.artifactPaths.final_summary_markdown = "final-summary.md";
}

function setRunStage(stage) {
  runFailureContext.stage = stage;
}

function deriveFailureCode(error) {
  if (error instanceof ReviewLoopError && error.code) {
    return error.code;
  }

  if (error instanceof Error) {
    if (/No review targets found against HEAD/i.test(error.message)) {
      return "empty_review_target";
    }

    if (/Context file not found|File not found/i.test(error.message)) {
      return "missing_context_file";
    }

    if (/Unable to parse structured JSON output/i.test(error.message)) {
      return "structured_output_parse_failure";
    }

    if (/Codex command failed/i.test(error.message)) {
      return "codex_invocation_failure";
    }

    if (/Claude command failed/i.test(error.message)) {
      return "claude_invocation_failure";
    }
  }

  return "fatal_error";
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const outputDir = resolveOutputDir(options);
  runFailureContext.outputDir = outputDir;

  setRunStage("resolve_goal");
  const goal = resolveGoal(options);
  runFailureContext.goal = goal;

  setRunStage("validate_rounds");
  const maxRounds = Number.parseInt(options.maxRounds ?? `${DEFAULT_MAX_ROUNDS}`, 10);
  if (!Number.isInteger(maxRounds) || maxRounds <= 0) {
    throw new Error("--max-rounds must be a positive integer.");
  }

  setRunStage("resolve_context");
  const contextFiles = resolveReviewLoopContextFiles({
    workingDirectory: process.cwd(),
    workpack: options.workpack ?? null,
    extraContextFiles: options.contextFiles ?? [],
  });
  const contextBundle = buildReviewLoopContextBundle(contextFiles, process.cwd());
  const codexDefaultConfig = readCodexDefaultConfig();
  const claudeDefaultConfig = readClaudeDefaultConfig();
  const verifyCommands = options.verifyCmds ?? [];

  writeFileSync(join(outputDir, "goal.md"), `${goal}\n`);
  writeFileSync(
    join(outputDir, "context-files.txt"),
    `${contextFiles.map((filePath) => filePath.replace(`${process.cwd()}/`, "")).join("\n")}\n`,
  );
  writeFileSync(join(outputDir, "context-bundle.md"), `${contextBundle}\n`);

  const pingPongState = {
    goal,
    status: "running",
    roundsCompleted: 0,
    maxRounds,
    workpack: options.workpack ?? null,
    agentConfig: {
      codex: {
        model: options.codexModel ?? codexDefaultConfig.model ?? null,
        modelSource: options.codexModel
          ? "requested"
          : codexDefaultConfig.model
            ? "configured"
            : "default",
        effort: options.codexEffort ?? codexDefaultConfig.effort ?? null,
        effortSource: options.codexEffort
          ? "requested"
          : codexDefaultConfig.effort
            ? "configured"
            : "default",
      },
      claude: {
        model: options.claudeModel ?? claudeDefaultConfig.model ?? null,
        modelSource: options.claudeModel
          ? "requested"
          : claudeDefaultConfig.model
            ? "configured"
            : "pending",
        effort: options.claudeEffort ?? claudeDefaultConfig.effort ?? null,
        effortSource: options.claudeEffort
          ? "requested"
          : claudeDefaultConfig.effort
            ? "configured"
            : "default",
      },
    },
    currentArtifactPath: null,
    finalSummaryPath: null,
    entries: [],
  };
  writePingPongLog(outputDir, pingPongState);

  let lastClaudeReview = null;
  let lastStableClaudeReview = null;
  let lastCodexReview = createSyntheticRevisionReview(
    "codex",
    "Initial review target collected. Awaiting Claude review.",
  );
  let lastStableCodexReview = null;
  let lastFix = null;
  let lastVerification = {
    status: "skipped",
    results: [],
  };
  let finalStatus = "needs_revision";
  let previousRequiredIssueSignatures = new Set();
  let roundsCompleted = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsCompleted = round;
    pingPongState.roundsCompleted = round;

    const roundString = String(round).padStart(2, "0");
    setRunStage("collect_review_targets");
    const targets = collectReviewTargets({
      workingDirectory: process.cwd(),
    });
    const roundTargetPath = `targets/${roundString}-review-target.diff`;
    writeTargetArtifact(outputDir, `${roundString}-review-target`, targets.diffText);
    pingPongState.currentArtifactPath = roundTargetPath;
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${roundString}. Review Target`,
      kind: "target",
      round,
      artifactPath: roundTargetPath,
      summary: buildTargetSummary(targets),
      filesChanged: String(targets.includedPaths.length),
    });
    assertActionableReviewTargets(targets);

    const claudeReviewPrompt = buildClaudeReviewPrompt({
      goal,
      contextBundle,
      targetDiff: targets.diffText,
      verification: lastVerification,
      round,
    });
    writePrompt(outputDir, `${roundString}-claude-review`, claudeReviewPrompt);
    const claudeReviewOutputPath = join(
      outputDir,
      "reviews",
      `${roundString}-claude-review.raw.json`,
    );
    runFailureContext.artifactPaths.last_raw_review = `reviews/${roundString}-claude-review.raw.json`;
    setRunStage("claude_review_invoke");
    const claudeReviewResult = runClaude({
      prompt: claudeReviewPrompt,
      schemaPath: REVIEW_SCHEMA_PATH,
      workingDirectory: process.cwd(),
      model: options.claudeModel,
      effort: options.claudeEffort,
      outputPath: claudeReviewOutputPath,
    });
    pingPongState.agentConfig.claude.model =
      claudeReviewResult.metadata.model ?? pingPongState.agentConfig.claude.model;
    if (claudeReviewResult.metadata.model) {
      pingPongState.agentConfig.claude.modelSource = "resolved";
    }
    setRunStage("claude_review_parse");
    lastClaudeReview = normalizeReview(
      "claude",
      parseStructuredOutput(claudeReviewResult.output),
    );
    lastStableClaudeReview = mergeStableAgentReview(
      lastStableClaudeReview,
      lastClaudeReview,
    );
    writeReviewArtifacts(outputDir, `${roundString}-claude-review`, lastClaudeReview);
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${roundString}. Claude Review`,
      kind: "review",
      agent: "claude",
      model: pingPongState.agentConfig.claude.model,
      modelSource: pingPongState.agentConfig.claude.modelSource,
      effort: pingPongState.agentConfig.claude.effort,
      effortSource: pingPongState.agentConfig.claude.effortSource,
      round,
      promptPath: `prompts/${roundString}-claude-review.txt`,
      artifactPath: `reviews/${roundString}-claude-review.md`,
      rawOutputPath: `reviews/${roundString}-claude-review.raw.json`,
      decision: lastClaudeReview.decision,
      blockerStatus: lastClaudeReview.blocker_status,
      summary: lastClaudeReview.summary,
      requiredChangeCount: lastClaudeReview.required_changes.length,
      requiredChangeTitles: formatIssueTitles(lastClaudeReview.required_changes),
      recommendedChangeCount: lastClaudeReview.recommended_changes.length,
      recommendedChangeTitles: formatIssueTitles(
        lastClaudeReview.recommended_changes,
      ),
    });

    if (
      lastClaudeReview.decision === "approve" &&
      lastClaudeReview.required_changes.length === 0
    ) {
      if (verifyCommands.length > 0) {
        setRunStage("approval_verification");
        const approvalGate = runApprovalVerificationGate({
          commands: verifyCommands,
          workingDirectory: process.cwd(),
          outputDir,
          round,
        });
        lastVerification = approvalGate.verification;

        for (let index = 0; index < lastVerification.results.length; index += 1) {
          const result = lastVerification.results[index];
          addPingPongEntry(outputDir, pingPongState, {
            heading: `${roundString}. Approval Verification ${String(index + 1).padStart(2, "0")}`,
            kind: "verification",
            round,
            verificationStatus: result.status,
            artifactPath: result.artifactPath,
            command: result.command,
            exitCode: result.exitCode,
            summary: `Approval verification command ${index + 1} ${result.status}.`,
          });
        }

        if (approvalGate.approvalReview) {
          lastCodexReview = approvalGate.approvalReview;
          lastStableCodexReview = mergeStableAgentReview(
            lastStableCodexReview,
            lastCodexReview,
            { synthetic: true },
          );
          writeReviewArtifacts(
            outputDir,
            `${roundString}-codex-verification-gate`,
            lastCodexReview,
          );
          addPingPongEntry(outputDir, pingPongState, {
            heading: `${roundString}. Codex Verification Gate`,
            kind: "review",
            agent: "codex",
            round,
            artifactPath: `reviews/${roundString}-codex-verification-gate.md`,
            decision: lastCodexReview.decision,
            blockerStatus: lastCodexReview.blocker_status,
            summary: lastCodexReview.summary,
            requiredChangeCount: lastCodexReview.required_changes.length,
            requiredChangeTitles: formatIssueTitles(lastCodexReview.required_changes),
          });
        }
      }

      if (lastVerification.status === "failed") {
        // The approval verification gate above already converted failures into a revise review.
      } else {
        const codexReviewPrompt = buildCodexFinalReviewPrompt({
          goal,
          contextBundle,
          targetDiff: targets.diffText,
          claudeReview: lastClaudeReview,
          verification: lastVerification,
          round,
        });
        writePrompt(
          outputDir,
          `${roundString}-codex-final-review`,
          codexReviewPrompt,
        );
        const codexReviewOutputPath = join(
          outputDir,
          "reviews",
          `${roundString}-codex-final-review.raw.json`,
        );
        runFailureContext.artifactPaths.last_raw_review = `reviews/${roundString}-codex-final-review.raw.json`;
        setRunStage("codex_final_review_invoke");
        const codexReviewResult = runCodex({
          prompt: codexReviewPrompt,
          schemaPath: REVIEW_SCHEMA_PATH,
          outputPath: codexReviewOutputPath,
          workingDirectory: process.cwd(),
          model: options.codexModel,
          effort: options.codexEffort,
          sandbox: "read-only",
        });
        pingPongState.agentConfig.codex.model =
          codexReviewResult.metadata.model ?? pingPongState.agentConfig.codex.model;
        pingPongState.agentConfig.codex.effort =
          codexReviewResult.metadata.effort ?? pingPongState.agentConfig.codex.effort;
        if (codexReviewResult.metadata.model) {
          pingPongState.agentConfig.codex.modelSource = "resolved";
        }
        if (codexReviewResult.metadata.effort) {
          pingPongState.agentConfig.codex.effortSource = "resolved";
        }
        setRunStage("codex_final_review_parse");
        lastCodexReview = normalizeReview(
          "codex",
          parseStructuredOutput(codexReviewResult.output),
        );
        lastStableCodexReview = mergeStableAgentReview(
          lastStableCodexReview,
          lastCodexReview,
        );
        writeReviewArtifacts(
          outputDir,
          `${roundString}-codex-final-review`,
          lastCodexReview,
        );
        addPingPongEntry(outputDir, pingPongState, {
          heading: `${roundString}. Codex Final Review`,
          kind: "review",
          agent: "codex",
          model: pingPongState.agentConfig.codex.model,
          modelSource: pingPongState.agentConfig.codex.modelSource,
          effort: pingPongState.agentConfig.codex.effort,
          effortSource: pingPongState.agentConfig.codex.effortSource,
          round,
          promptPath: `prompts/${roundString}-codex-final-review.txt`,
          artifactPath: `reviews/${roundString}-codex-final-review.md`,
          rawOutputPath: `reviews/${roundString}-codex-final-review.raw.json`,
          decision: lastCodexReview.decision,
          blockerStatus: lastCodexReview.blocker_status,
          summary: lastCodexReview.summary,
          requiredChangeCount: lastCodexReview.required_changes.length,
          requiredChangeTitles: formatIssueTitles(lastCodexReview.required_changes),
          recommendedChangeCount: lastCodexReview.recommended_changes.length,
          recommendedChangeTitles: formatIssueTitles(
            lastCodexReview.recommended_changes,
          ),
        });
      }
    } else {
      lastCodexReview = createSyntheticRevisionReview(
        "codex",
        "Codex fix is required before final approval because Claude still has required changes.",
      );
      lastStableCodexReview = mergeStableAgentReview(
        lastStableCodexReview,
        lastCodexReview,
        { synthetic: true },
      );
      addPingPongEntry(outputDir, pingPongState, {
        heading: `${roundString}. Codex Final Review Skipped`,
        kind: "note",
        agent: "codex",
        round,
        summary: lastCodexReview.summary,
      });
    }

    const roundState = evaluateLoopRound({
      round,
      maxRounds,
      claudeReview: lastClaudeReview,
      codexReview: lastCodexReview,
      previousRequiredIssueSignatures,
    });
    finalStatus = roundState.status;
    pingPongState.status = finalStatus;
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${roundString}. Round Status`,
      kind: "round_status",
      round,
      roundStatus: roundState.status,
      shouldContinue: roundState.shouldContinue,
      requiredIssueCount: roundState.requiredIssueSignatures.size,
      verificationStatus: lastVerification.status,
    });

    if (!roundState.shouldContinue) {
      break;
    }

    previousRequiredIssueSignatures = roundState.requiredIssueSignatures;

    const reviewToAddress =
      lastClaudeReview.required_changes.length > 0 ||
      lastClaudeReview.decision !== "approve"
        ? lastClaudeReview
        : lastCodexReview;
    const fixPrompt = buildCodexFixPrompt({
      goal,
      contextBundle,
      targetDiff: targets.diffText,
      review: reviewToAddress,
      verification: lastVerification,
      round,
    });
    writePrompt(outputDir, `${roundString}-codex-fix`, fixPrompt);
    const fixOutputPath = join(outputDir, "fixes", `${roundString}-codex-fix.raw.json`);
    runFailureContext.artifactPaths.last_raw_fix = `fixes/${roundString}-codex-fix.raw.json`;
    setRunStage("codex_fix_invoke");
    const codexFixResult = runCodex({
      prompt: fixPrompt,
      schemaPath: FIX_SCHEMA_PATH,
      outputPath: fixOutputPath,
      workingDirectory: process.cwd(),
      model: options.codexModel,
      effort: options.codexEffort,
      sandbox: "workspace-write",
    });
    pingPongState.agentConfig.codex.model =
      codexFixResult.metadata.model ?? pingPongState.agentConfig.codex.model;
    pingPongState.agentConfig.codex.effort =
      codexFixResult.metadata.effort ?? pingPongState.agentConfig.codex.effort;
    if (codexFixResult.metadata.model) {
      pingPongState.agentConfig.codex.modelSource = "resolved";
    }
    if (codexFixResult.metadata.effort) {
      pingPongState.agentConfig.codex.effortSource = "resolved";
    }
    setRunStage("codex_fix_parse");
    lastFix = normalizeFixResponse(parseStructuredOutput(codexFixResult.output));
    writeFixArtifacts(outputDir, `${roundString}-codex-fix`, lastFix);
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${roundString}. Codex Fix`,
      kind: "fix",
      agent: "codex",
      model: pingPongState.agentConfig.codex.model,
      modelSource: pingPongState.agentConfig.codex.modelSource,
      effort: pingPongState.agentConfig.codex.effort,
      effortSource: pingPongState.agentConfig.codex.effortSource,
      round,
      promptPath: `prompts/${roundString}-codex-fix.txt`,
      artifactPath: `fixes/${roundString}-codex-fix.md`,
      rawOutputPath: `fixes/${roundString}-codex-fix.raw.json`,
      summary: lastFix.summary,
      verificationStatus: lastFix.verification_status,
      filesChanged: String(lastFix.files_changed.length),
      testsRun: String(lastFix.tests_run.length),
      basedOn: `${reviewToAddress.agent}:${reviewToAddress.decision}`,
    });

    setRunStage("post_fix_verification");
    lastVerification = runVerificationCommands({
      commands: verifyCommands,
      workingDirectory: process.cwd(),
      outputDir,
      round,
      phase: "post-fix",
    });
    lastFix = {
      ...lastFix,
      verification_status: lastVerification.status,
    };
    writeFixArtifacts(outputDir, `${roundString}-codex-fix`, lastFix);

    if (lastVerification.results.length === 0) {
      addPingPongEntry(outputDir, pingPongState, {
        heading: `${roundString}. Verification Skipped`,
        kind: "verification",
        round,
        verificationStatus: lastVerification.status,
        summary: "No verification commands were configured for this review loop.",
      });
    } else {
      for (let index = 0; index < lastVerification.results.length; index += 1) {
        const result = lastVerification.results[index];
        addPingPongEntry(outputDir, pingPongState, {
          heading: `${roundString}. Verification ${String(index + 1).padStart(2, "0")}`,
          kind: "verification",
          round,
          verificationStatus: result.status,
          artifactPath: result.artifactPath,
          command: result.command,
          exitCode: result.exitCode,
          summary: `Verification command ${index + 1} ${result.status}.`,
        });
      }
    }
  }

  let currentTargetPath = null;
  let omittedReviewTargets = [];
  setRunStage("collect_current_target");
  const currentTargetSnapshot = collectCurrentReviewTargetSnapshot({
    workingDirectory: process.cwd(),
  });
  writeTargetArtifact(outputDir, "current", currentTargetSnapshot.diffText);
  currentTargetPath = "targets/current.diff";
  omittedReviewTargets = currentTargetSnapshot.omittedTargets;
  pingPongState.currentArtifactPath = currentTargetPath;

  const finalApprovalGate = evaluateFinalApprovalGate({
    finalStatus,
    omittedReviewTargets,
    verificationStatus: lastVerification.status,
    verifyCommands,
  });
  if (finalStatus !== finalApprovalGate.status) {
    addPingPongEntry(outputDir, pingPongState, {
      heading: "Final Approval Gate",
      kind: "note",
      agent: "system",
      summary: `Final status downgraded from approved to ${finalApprovalGate.status} because ${finalApprovalGate.reasons.join(", ")}.`,
    });
  }
  finalStatus = finalApprovalGate.status;
  pingPongState.status = finalStatus;
  pingPongState.roundsCompleted = roundsCompleted;
  setRunStage("write_final_summary");
  buildFinalSummary({
    goal,
    outputDir,
    finalStatus,
    roundsCompleted,
    lastClaudeReview: lastStableClaudeReview,
    lastCodexReview: lastStableCodexReview,
    lastFix,
    lastVerification,
    verifyCommands,
    agentConfig: pingPongState.agentConfig,
    currentTargetPath,
    omittedReviewTargets,
  });
  pingPongState.finalSummaryPath = "final-summary.md";
  writePingPongLog(outputDir, pingPongState);

  process.stdout.write(
    [
      "Agent review loop complete.",
      `Status: ${finalStatus}`,
      `Rounds: ${roundsCompleted}`,
      `Summary: ${join(outputDir, "final-summary.md")}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const details =
    error instanceof ReviewLoopError
      ? error.details
      : error instanceof Error
        ? { stack: error.stack ?? error.message }
        : null;
  if (runFailureContext.outputDir) {
    writeFailureArtifacts({
      outputDir: runFailureContext.outputDir,
      goal: runFailureContext.goal,
      stage: runFailureContext.stage,
      code: deriveFailureCode(error),
      message,
      artifactPaths: runFailureContext.artifactPaths,
      details,
    });
  }

  mkdirSync(dirname(LAST_ERROR_LOG_PATH), { recursive: true });
  writeFileSync(
    LAST_ERROR_LOG_PATH,
    [
      `stage=${runFailureContext.stage}`,
      `code=${deriveFailureCode(error)}`,
      `message=${message}`,
      runFailureContext.outputDir
        ? `failure_summary=${join(runFailureContext.outputDir, "failure-summary.md")}`
        : "failure_summary=unavailable",
      error instanceof Error ? error.stack ?? error.message : String(error),
      "",
    ].join("\n"),
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
