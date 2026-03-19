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
  normalizePlanResponse,
  normalizeReview,
  parseClaudeInvocationMetadata,
  parseCodexInvocationMetadata,
  parseStructuredOutput,
  resolveContextFiles,
} from "./lib/agent-plan-loop.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_MAX_ROUNDS = 3;
const PLAN_SCHEMA_PATH = join(__dirname, "schemas", "agent-plan.schema.json");
const REVIEW_SCHEMA_PATH = join(
  __dirname,
  "schemas",
  "agent-plan-review.schema.json",
);
const CODEX_CONFIG_PATH = resolve(process.env.HOME ?? "~", ".codex", "config.toml");
const CLAUDE_SETTINGS_PATH = resolve(
  process.env.HOME ?? "~",
  ".claude",
  "settings.json",
);

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/agent-plan-loop.mjs --goal <text> [options]",
      "",
      "Options:",
      "  --goal <text>               Planning request text",
      "  --goal-file <path>          Read planning request text from a file",
      "  --workpack <slice>          Include docs/workpacks/<slice>/README.md and acceptance.md (if present)",
      "  --context-file <path>       Additional context file (repeatable)",
      "  --max-rounds <n>            Maximum Claude/Codex review rounds (default: 3)",
      "  --output-dir <path>         Output directory for prompts, reviews, and summaries",
      "  --codex-model <model>       Optional Codex CLI model override",
      "  --codex-effort <level>      Optional Codex reasoning effort (low|medium|high|xhigh)",
      "  --claude-model <model>      Optional Claude CLI model override",
      "  --claude-effort <level>     Optional Claude effort (low|medium|high)",
      "  --help                      Show this help text",
      "",
      "Example:",
      '  pnpm agent:plan-loop -- --goal "Slice 03 plan draft" --workpack 03-recipe-like',
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = {
    contextFiles: [],
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

  throw new Error("A planning request is required via --goal or --goal-file.");
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

function buildContextBundle(filePaths) {
  return filePaths
    .map((filePath) => {
      const relativePath = filePath.replace(`${process.cwd()}/`, "");
      const content = readRequiredFile(filePath);
      return `### ${relativePath}\n\n${content}`;
    })
    .join("\n\n---\n\n");
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
    : resolve(".artifacts", "agent-plan-loop", timestampSlug());

  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, "prompts"), { recursive: true });
  mkdirSync(join(target, "plans"), { recursive: true });
  mkdirSync(join(target, "reviews"), { recursive: true });

  return target;
}

function buildCodexDraftPrompt({ goal, contextBundle, workpack }) {
  const workpackLine = workpack
    ? `- Target workpack: ${workpack}`
    : "- Target workpack: not specified";

  return [
    "You are the planning editor for this repository.",
    "Create an implementation plan that is anchored to the repository documents below.",
    "Do not invent new APIs, statuses, or workflow rules that are not supported by the provided docs.",
    "If the docs conflict, surface that conflict in assumptions or open questions instead of guessing.",
    "Return JSON that matches the provided schema exactly.",
    "",
    "Goal:",
    goal,
    "",
    "Constraints:",
    "- Keep the plan practical and execution-ready.",
    "- Include explicit validation and review steps.",
    "- Mention the key source documents inside the markdown plan.",
    workpackLine,
    "",
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function buildClaudeReviewPrompt({ goal, contextBundle, planResponse, round }) {
  return [
    "You are the adversarial plan reviewer for this repository.",
    "Review the current plan against the repository documents below.",
    "Focus on source-of-truth alignment, missing validation, scope drift, hidden blockers, and handoff risks.",
    "Do not rewrite the whole plan. Only report the changes needed to approve it.",
    "Return JSON that matches the provided schema exactly.",
    "",
    `Round: ${round}`,
    "Goal:",
    goal,
    "",
    "Current Plan Metadata:",
    JSON.stringify(
      {
        title: planResponse.title,
        summary: planResponse.summary,
        assumptions: planResponse.assumptions,
        open_questions: planResponse.open_questions,
        out_of_scope: planResponse.out_of_scope,
        sources_used: planResponse.sources_used,
      },
      null,
      2,
    ),
    "",
    "Current Plan Markdown:",
    planResponse.plan_markdown,
    "",
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function buildCodexRevisionPrompt({
  goal,
  contextBundle,
  planResponse,
  review,
  round,
}) {
  return [
    "You are revising the current implementation plan.",
    "Apply the required review feedback without changing the core user goal.",
    "If a requested change conflicts with the provided repository documents, keep the plan aligned to the docs and explain the conflict in open_questions or assumptions.",
    "Return JSON that matches the provided schema exactly.",
    "",
    `Revision Round: ${round}`,
    "Goal:",
    goal,
    "",
    "Current Plan Metadata:",
    JSON.stringify(
      {
        title: planResponse.title,
        summary: planResponse.summary,
        assumptions: planResponse.assumptions,
        open_questions: planResponse.open_questions,
        out_of_scope: planResponse.out_of_scope,
        sources_used: planResponse.sources_used,
      },
      null,
      2,
    ),
    "",
    "Current Plan Markdown:",
    planResponse.plan_markdown,
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
    "Repository Context:",
    contextBundle,
  ].join("\n");
}

function buildCodexFinalReviewPrompt({
  goal,
  contextBundle,
  planResponse,
  claudeReview,
  round,
}) {
  return [
    "You are performing the final Codex sanity review before implementation starts.",
    "Approve only if the plan is actionable and aligned with the provided repository documents.",
    "If you request changes, keep them concrete and limited to what still blocks execution.",
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
    "Current Plan Metadata:",
    JSON.stringify(
      {
        title: planResponse.title,
        summary: planResponse.summary,
        assumptions: planResponse.assumptions,
        open_questions: planResponse.open_questions,
        out_of_scope: planResponse.out_of_scope,
        sources_used: planResponse.sources_used,
      },
      null,
      2,
    ),
    "",
    "Current Plan Markdown:",
    planResponse.plan_markdown,
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
}) {
  const args = [
    "exec",
    "-C",
    workingDirectory,
    "-s",
    "read-only",
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

  // Pipe the full prompt through stdin so large context bundles do not hit argv limits.
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

function writePlanArtifacts(outputDir, name, planResponse) {
  writeFileSync(
    join(outputDir, "plans", `${name}.json`),
    `${JSON.stringify(planResponse, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, "plans", `${name}.md`),
    `${planResponse.plan_markdown.trim()}\n`,
  );
}

function writeReviewArtifacts(outputDir, name, review) {
  writeFileSync(
    join(outputDir, "reviews", `${name}.json`),
    `${JSON.stringify(review, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, "reviews", `${name}.md`),
    formatReviewMarkdown(review),
  );
}

function writePrompt(outputDir, name, prompt) {
  writeFileSync(join(outputDir, "prompts", `${name}.txt`), `${prompt}\n`);
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
      currentPlanPath: state.currentPlanPath,
      finalSummaryPath: state.finalSummaryPath,
      entries: state.entries,
      lastUpdated: new Date().toISOString(),
    }),
  );
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
  return issues.map((issue) => `${issue.id}: ${issue.title}`).join("; ");
}

function formatScopedIssueLines(agent, issues) {
  if (!issues || issues.length === 0) {
    return [`- ${agent}: none`];
  }

  return issues.map((issue) => `- ${agent} ${issue.id}: ${issue.title}`);
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

function buildFinalSummary({
  goal,
  outputDir,
  finalStatus,
  roundsCompleted,
  finalPlan,
  lastClaudeReview,
  lastCodexReview,
  agentConfig,
}) {
  const summary = {
    goal,
    status: finalStatus,
    rounds_completed: roundsCompleted,
    final_plan_title: finalPlan?.title ?? null,
    final_plan_summary: finalPlan?.summary ?? null,
    final_plan_path: finalPlan
      ? join(outputDir, "plans", "current-plan.md")
      : null,
    claude_last_decision: lastClaudeReview?.decision ?? null,
    codex_last_decision: lastCodexReview?.decision ?? null,
    claude_required_changes: lastClaudeReview?.required_changes ?? [],
    codex_required_changes: lastCodexReview?.required_changes ?? [],
    open_questions: finalPlan?.open_questions ?? [],
    out_of_scope: finalPlan?.out_of_scope ?? [],
    pingpong_log_path: join(outputDir, "pingpong-log.md"),
    resolved_agent_config: agentConfig,
  };

  writeFileSync(
    join(outputDir, "final-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  const markdown = [
    `# Agent Plan Loop Summary`,
    "",
    `- Goal: ${goal}`,
    `- Status: ${finalStatus}`,
    `- Rounds Completed: ${roundsCompleted}`,
    `- Final Plan Title: ${finalPlan?.title ?? "n/a"}`,
    `- Final Plan Summary: ${finalPlan?.summary ?? "n/a"}`,
    `- Ping-Pong Log: [pingpong-log](pingpong-log.md)`,
    "",
    "## Agent Config",
    "",
    `- Codex: model=${formatAgentSetting(agentConfig?.codex?.model, agentConfig?.codex?.modelSource)}, effort=${formatAgentSetting(agentConfig?.codex?.effort, agentConfig?.codex?.effortSource)}`,
    `- Claude: model=${formatAgentSetting(agentConfig?.claude?.model, agentConfig?.claude?.modelSource)}, effort=${formatAgentSetting(agentConfig?.claude?.effort, agentConfig?.claude?.effortSource)}`,
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
    "## Open Questions",
    "",
    ...formatStringListLines(finalPlan?.open_questions),
    "",
    "## Final Plan",
    "",
    finalPlan?.plan_markdown ?? "No final plan was produced.",
    "",
  ].join("\n");

  writeFileSync(join(outputDir, "final-summary.md"), `${markdown.trim()}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const goal = resolveGoal(options);
  const maxRounds = Number.parseInt(options.maxRounds ?? `${DEFAULT_MAX_ROUNDS}`, 10);
  if (!Number.isInteger(maxRounds) || maxRounds <= 0) {
    throw new Error("--max-rounds must be a positive integer.");
  }

  const outputDir = resolveOutputDir(options);
  const contextFiles = resolveContextFiles({
    workpack: options.workpack ?? null,
    contextFiles: options.contextFiles ?? [],
  });
  const contextBundle = buildContextBundle(contextFiles);
  const codexDefaultConfig = readCodexDefaultConfig();
  const claudeDefaultConfig = readClaudeDefaultConfig();

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
        model: options.codexModel ?? codexDefaultConfig.model ?? "default",
        modelSource: options.codexModel
          ? "requested"
          : codexDefaultConfig.model
            ? "configured"
            : "default",
        effort: options.codexEffort ?? codexDefaultConfig.effort ?? "default",
        effortSource: options.codexEffort
          ? "requested"
          : codexDefaultConfig.effort
            ? "configured"
            : "default",
      },
      claude: {
        model: options.claudeModel ?? claudeDefaultConfig.model ?? "pending",
        modelSource: options.claudeModel
          ? "requested"
          : claudeDefaultConfig.model
            ? "configured"
            : "pending",
        effort: options.claudeEffort ?? claudeDefaultConfig.effort ?? "default",
        effortSource: options.claudeEffort
          ? "requested"
          : claudeDefaultConfig.effort
            ? "configured"
            : "default",
      },
    },
    currentPlanPath: null,
    finalSummaryPath: null,
    entries: [],
  };
  writePingPongLog(outputDir, pingPongState);

  const draftPrompt = buildCodexDraftPrompt({
    goal,
    contextBundle,
    workpack: options.workpack ?? null,
  });
  writePrompt(outputDir, "00-codex-draft", draftPrompt);

  const initialPlanOutputPath = join(outputDir, "plans", "00-codex-draft.raw.json");
  const codexDraftResult = runCodex({
    prompt: draftPrompt,
    schemaPath: PLAN_SCHEMA_PATH,
    outputPath: initialPlanOutputPath,
    workingDirectory: process.cwd(),
    model: options.codexModel,
    effort: options.codexEffort,
  });
  const initialPlan = normalizePlanResponse(
    parseStructuredOutput(codexDraftResult.output),
  );
  pingPongState.agentConfig.codex.model =
    codexDraftResult.metadata.model ?? pingPongState.agentConfig.codex.model;
  pingPongState.agentConfig.codex.effort =
    codexDraftResult.metadata.effort ?? pingPongState.agentConfig.codex.effort;
  if (codexDraftResult.metadata.model) {
    pingPongState.agentConfig.codex.modelSource = "resolved";
  }
  if (codexDraftResult.metadata.effort) {
    pingPongState.agentConfig.codex.effortSource = "resolved";
  }

  writePlanArtifacts(outputDir, "00-codex-draft", initialPlan);
  pingPongState.currentPlanPath = "plans/00-codex-draft.md";
  addPingPongEntry(outputDir, pingPongState, {
    heading: "00. Codex Draft",
    kind: "plan",
    agent: "codex",
    model: pingPongState.agentConfig.codex.model,
    modelSource: pingPongState.agentConfig.codex.modelSource,
    effort: pingPongState.agentConfig.codex.effort,
    effortSource: pingPongState.agentConfig.codex.effortSource,
    round: 0,
    promptPath: "prompts/00-codex-draft.txt",
    artifactPath: "plans/00-codex-draft.md",
    rawOutputPath: "plans/00-codex-draft.raw.json",
    title: initialPlan.title,
    summary: initialPlan.summary,
    openQuestionCount: initialPlan.open_questions.length,
  });

  let currentPlan = initialPlan;
  let lastClaudeReview = null;
  let lastCodexReview = createSyntheticRevisionReview(
    "codex",
    "Initial draft created. Awaiting Claude review.",
  );
  let finalStatus = "needs_revision";
  let previousRequiredIssueSignatures = new Set();
  let roundsCompleted = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsCompleted = round;
    pingPongState.roundsCompleted = round;
    writePingPongLog(outputDir, pingPongState);

    const claudeReviewPrompt = buildClaudeReviewPrompt({
      goal,
      contextBundle,
      planResponse: currentPlan,
      round,
    });
    writePrompt(outputDir, `${String(round).padStart(2, "0")}-claude-review`, claudeReviewPrompt);
    const claudeReviewOutputPath = join(
      outputDir,
      "reviews",
      `${String(round).padStart(2, "0")}-claude-review.raw.json`,
    );

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
    lastClaudeReview = normalizeReview(
      "claude",
      parseStructuredOutput(claudeReviewResult.output),
    );
    writeReviewArtifacts(
      outputDir,
      `${String(round).padStart(2, "0")}-claude-review`,
      lastClaudeReview,
    );
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${String(round).padStart(2, "0")}. Claude Review`,
      kind: "review",
      agent: "claude",
      model: pingPongState.agentConfig.claude.model,
      modelSource: pingPongState.agentConfig.claude.modelSource,
      effort: pingPongState.agentConfig.claude.effort,
      effortSource: pingPongState.agentConfig.claude.effortSource,
      round,
      promptPath: `prompts/${String(round).padStart(2, "0")}-claude-review.txt`,
      artifactPath: `reviews/${String(round).padStart(2, "0")}-claude-review.md`,
      rawOutputPath: `reviews/${String(round).padStart(2, "0")}-claude-review.raw.json`,
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
      const codexReviewPrompt = buildCodexFinalReviewPrompt({
        goal,
        contextBundle,
        planResponse: currentPlan,
        claudeReview: lastClaudeReview,
        round,
      });
      writePrompt(
        outputDir,
        `${String(round).padStart(2, "0")}-codex-final-review`,
        codexReviewPrompt,
      );

      const codexReviewOutputPath = join(
        outputDir,
        "reviews",
        `${String(round).padStart(2, "0")}-codex-final-review.raw.json`,
      );
      const codexReviewResult = runCodex({
        prompt: codexReviewPrompt,
        schemaPath: REVIEW_SCHEMA_PATH,
        outputPath: codexReviewOutputPath,
        workingDirectory: process.cwd(),
        model: options.codexModel,
        effort: options.codexEffort,
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
      lastCodexReview = normalizeReview(
        "codex",
        parseStructuredOutput(codexReviewResult.output),
      );
      writeReviewArtifacts(
        outputDir,
        `${String(round).padStart(2, "0")}-codex-final-review`,
        lastCodexReview,
      );
      addPingPongEntry(outputDir, pingPongState, {
        heading: `${String(round).padStart(2, "0")}. Codex Final Review`,
        kind: "review",
        agent: "codex",
        model: pingPongState.agentConfig.codex.model,
        modelSource: pingPongState.agentConfig.codex.modelSource,
        effort: pingPongState.agentConfig.codex.effort,
        effortSource: pingPongState.agentConfig.codex.effortSource,
        round,
        promptPath: `prompts/${String(round).padStart(2, "0")}-codex-final-review.txt`,
        artifactPath: `reviews/${String(round).padStart(2, "0")}-codex-final-review.md`,
        rawOutputPath: `reviews/${String(round).padStart(2, "0")}-codex-final-review.raw.json`,
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
    } else {
      lastCodexReview = createSyntheticRevisionReview(
        "codex",
        "Codex revision is required before final approval because Claude still has required changes.",
      );
      addPingPongEntry(outputDir, pingPongState, {
        heading: `${String(round).padStart(2, "0")}. Codex Final Review Skipped`,
        kind: "note",
        agent: "codex",
        model: pingPongState.agentConfig.codex.model,
        modelSource: pingPongState.agentConfig.codex.modelSource,
        effort: pingPongState.agentConfig.codex.effort,
        effortSource: pingPongState.agentConfig.codex.effortSource,
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
      heading: `${String(round).padStart(2, "0")}. Round Status`,
      kind: "round_status",
      round,
      roundStatus: roundState.status,
      shouldContinue: roundState.shouldContinue,
      requiredIssueCount: roundState.requiredIssueSignatures.size,
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

    const revisionPrompt = buildCodexRevisionPrompt({
      goal,
      contextBundle,
      planResponse: currentPlan,
      review: reviewToAddress,
      round,
    });
    writePrompt(
      outputDir,
      `${String(round).padStart(2, "0")}-codex-revision`,
      revisionPrompt,
    );

    const revisionOutputPath = join(
      outputDir,
      "plans",
      `${String(round).padStart(2, "0")}-codex-revision.raw.json`,
    );
    const codexRevisionResult = runCodex({
      prompt: revisionPrompt,
      schemaPath: PLAN_SCHEMA_PATH,
      outputPath: revisionOutputPath,
      workingDirectory: process.cwd(),
      model: options.codexModel,
      effort: options.codexEffort,
    });
    pingPongState.agentConfig.codex.model =
      codexRevisionResult.metadata.model ?? pingPongState.agentConfig.codex.model;
    pingPongState.agentConfig.codex.effort =
      codexRevisionResult.metadata.effort ?? pingPongState.agentConfig.codex.effort;
    if (codexRevisionResult.metadata.model) {
      pingPongState.agentConfig.codex.modelSource = "resolved";
    }
    if (codexRevisionResult.metadata.effort) {
      pingPongState.agentConfig.codex.effortSource = "resolved";
    }
    currentPlan = normalizePlanResponse(
      parseStructuredOutput(codexRevisionResult.output),
    );
    writePlanArtifacts(
      outputDir,
      `${String(round).padStart(2, "0")}-codex-revision`,
      currentPlan,
    );
    pingPongState.currentPlanPath = `plans/${String(round).padStart(2, "0")}-codex-revision.md`;
    addPingPongEntry(outputDir, pingPongState, {
      heading: `${String(round).padStart(2, "0")}. Codex Revision`,
      kind: "plan",
      agent: "codex",
      model: pingPongState.agentConfig.codex.model,
      modelSource: pingPongState.agentConfig.codex.modelSource,
      effort: pingPongState.agentConfig.codex.effort,
      effortSource: pingPongState.agentConfig.codex.effortSource,
      round,
      promptPath: `prompts/${String(round).padStart(2, "0")}-codex-revision.txt`,
      artifactPath: `plans/${String(round).padStart(2, "0")}-codex-revision.md`,
      rawOutputPath: `plans/${String(round).padStart(2, "0")}-codex-revision.raw.json`,
      title: currentPlan.title,
      summary: currentPlan.summary,
      openQuestionCount: currentPlan.open_questions.length,
      basedOn: `${reviewToAddress.agent}:${reviewToAddress.decision}`,
    });
  }

  writePlanArtifacts(outputDir, "current-plan", currentPlan);
  pingPongState.currentPlanPath = "plans/current-plan.md";
  pingPongState.status = finalStatus;
  pingPongState.roundsCompleted = roundsCompleted;
  buildFinalSummary({
    goal,
    outputDir,
    finalStatus,
    roundsCompleted,
    finalPlan: currentPlan,
    lastClaudeReview,
    lastCodexReview,
    agentConfig: pingPongState.agentConfig,
  });
  pingPongState.finalSummaryPath = "final-summary.md";
  writePingPongLog(outputDir, pingPongState);

  process.stdout.write(
    [
      `Agent plan loop complete.`,
      `Status: ${finalStatus}`,
      `Rounds: ${roundsCompleted}`,
      `Summary: ${join(outputDir, "final-summary.md")}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  const targetPath = resolve(".artifacts", "agent-plan-loop", "last-error.log");
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(
    targetPath,
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
