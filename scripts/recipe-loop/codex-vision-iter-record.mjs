#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DECISIONS,
  PROTECTED_SPLITS,
  PROTECTED_TEMPLATE,
  appendJsonLine,
  assertNoSecretLikeText,
  buildManifest,
  fileInfo,
  isCanaryOk,
  iterationName,
  readJson,
  readJsonl,
  regenerateRunDocs,
  repoRelative,
  sha256File,
  writeJsonAtomic,
  writeTextAtomic,
} from "./lib/codex-vision-history.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const DEFAULT_DATA_ROOT = path.join(repoRoot, "notebooks/recipe_loop_data");
const PROTECTED_SPLIT_MESSAGE = PROTECTED_TEMPLATE;

function printHelp() {
  process.stdout.write(`Usage:
node scripts/recipe-loop/codex-vision-iter-record.mjs \\
  --run-dir notebooks/recipe_loop_runs/codex-vision-keyframes-20260628 \\
  --iteration 1 \\
  --split train \\
  --id fTlTpSJtrEs \\
  --out-tag codex-vision-keyframes-smoke-20260627 \\
  --decision accepted \\
  --decision-reason "current baseline으로 채택"

Options:
  --data-root <path>          Defaults to notebooks/recipe_loop_data
  --hypothesis <text>         Train-only freeform
  --change-summary <text>     Train-only freeform
  --decision-reason <text>    Train-only freeform
  --next-action <text>        Train-only freeform
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`unexpected positional argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "ids") {
      throw new Error("MVP supports --id only; --ids is not allowed");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function requireString(args, key) {
  const value = args[key];
  if (!value) throw new Error(`missing required --${key}`);
  return String(value);
}

function parseIteration(value) {
  const iteration = Number(value);
  if (!Number.isInteger(iteration) || iteration <= 0) {
    throw new Error("--iteration must be a positive integer");
  }
  return iteration;
}

function canaryStatus(canaryLeak) {
  return {
    ok: isCanaryOk(canaryLeak),
    status: canaryLeak?.status ?? "missing",
    hitCount: Number(canaryLeak?.hit_count ?? 0),
  };
}

function summaryPaths({ dataRoot, split, outTag }) {
  const splitDir = path.join(dataRoot, split);
  return {
    deterministic: path.join(splitDir, `_grade_summary.${outTag}.json`),
    semantic: path.join(splitDir, `_semantic_summary.${outTag}.json`),
  };
}

function readAggregate(summaryPath) {
  const summary = readJson(summaryPath);
  if (!summary.aggregate) throw new Error(`summary missing aggregate: ${summaryPath}`);
  return summary.aggregate;
}

function countResult(resultJson) {
  const recipes = Array.isArray(resultJson.recipes) ? resultJson.recipes : [];
  return {
    recipeCount: recipes.length,
    ingredientCount: recipes.reduce((sum, recipe) => sum + (Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0), 0),
    stepCount: recipes.reduce((sum, recipe) => sum + (Array.isArray(recipe.steps) ? recipe.steps.length : 0), 0),
  };
}

function cacheArtifactInfo(cacheDir, cwd) {
  const files = [
    "run_meta.json",
    "selected_frames.json",
    "selector.json",
    "final.json",
    "selector.prompt.md",
    "final.prompt.md",
    "selector.raw.md",
    "final.raw.md",
  ];
  const result = {
    path: cacheDir ? repoRelative(cacheDir, cwd) : null,
    exists: Boolean(cacheDir && fs.existsSync(cacheDir)),
    files: {},
  };
  for (const fileName of files) {
    const filePath = cacheDir ? path.join(cacheDir, fileName) : null;
    result.files[fileName] = fileInfo(filePath, cwd);
  }
  return result;
}

function buildArtifactIndex({ dataRoot, split, id, outTag, deterministicPath, semanticPath, resultPath, resultJson, cwd }) {
  const cacheDir = resultJson?.meta?.codexVisionKeyframesCacheDir ?? null;
  return {
    dataRoot: repoRelative(dataRoot, cwd),
    resultJson: fileInfo(resultPath, cwd),
    deterministicSummary: fileInfo(deterministicPath, cwd),
    semanticSummary: fileInfo(semanticPath, cwd),
    split,
    id,
    outTag,
    cacheDir: cacheArtifactInfo(cacheDir, cwd),
  };
}

function weakestCasesFromSemantic(summaryPath, { protectedSplit, limit = 3 }) {
  if (protectedSplit) return [];
  const summary = readJson(summaryPath);
  const cases = Array.isArray(summary.perVideo)
    ? summary.perVideo.flatMap((video) => (Array.isArray(video.cases) ? video.cases : []))
    : [];
  return cases
    .filter((item) => typeof item.case_score === "number")
    .sort((a, b) => a.case_score - b.case_score)
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      caseScore: item.case_score,
      reason: item.reason,
    }));
}

function normalizeResult({ detAggregate, semAggregate, resultJson }) {
  const counts = resultJson ? countResult(resultJson) : {};
  return {
    recipeCount: counts.recipeCount ?? null,
    ingredientCount: counts.ingredientCount ?? null,
    stepCount: counts.stepCount ?? null,
    deterministic: {
      ingredientF1: detAggregate.ingredientF1 ?? null,
      amountMatchRate: detAggregate.amountMatchRate ?? null,
      stepCoverage: detAggregate.stepCoverage ?? null,
    },
    semantic: {
      averageScore: semAggregate.averageScore ?? null,
      bottom2Mean: semAggregate.bottomKMeanScore ?? null,
      minCaseScore: semAggregate.minCaseScore ?? null,
    },
  };
}

function defaultBackfillText(value, fallback) {
  return value && String(value).trim() ? String(value) : fallback;
}

function buildFeedback(entry) {
  const weakest = Array.isArray(entry.weakestCases) && entry.weakestCases.length > 0
    ? entry.weakestCases.map((item) => `- ${item.title}: ${item.caseScore}점 - ${item.reason}`).join("\n")
    : "- 상세 weakest case 없음";
  return `# 다음 Codex Vision Keyframes 실험 입력

## 현재 iteration

- iteration: ${entry.iteration}
- decision: ${entry.decision}
- outTag: ${entry.outTag}
- semantic average: ${entry.result.semantic.averageScore ?? "n/a"}
- min case: ${entry.result.semantic.minCaseScore ?? "n/a"}

## 이번 판단

${entry.decisionReason}

## 약한 케이스

${weakest}

## 다음 액션

${entry.nextAction}
`;
}

export function recordIteration(options) {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date().toISOString();
  const runDir = path.resolve(cwd, options.runDir);
  const dataRoot = path.resolve(cwd, options.dataRoot ?? DEFAULT_DATA_ROOT);
  const iteration = parseIteration(options.iteration);
  const split = String(options.split);
  const id = String(options.id);
  const outTag = String(options.outTag);
  const protectedSplit = PROTECTED_SPLITS.has(split);
  const freeform = {
    hypothesis: options.hypothesis,
    changeSummary: options.changeSummary,
    decisionReason: options.decisionReason,
    nextAction: options.nextAction,
  };

  if (!id || id.includes(",") || /\s/.test(id)) {
    throw new Error("MVP supports exactly one --id value");
  }
  if (!DECISIONS.has(options.decision)) {
    throw new Error(`invalid decision: ${options.decision}`);
  }
  if (protectedSplit && Object.values(freeform).some((value) => value && String(value).trim())) {
    throw new Error("protected split records do not accept freeform text");
  }
  assertNoSecretLikeText(freeform);

  const iterDir = path.join(runDir, iterationName(iteration));
  if (fs.existsSync(iterDir)) {
    throw new Error(`iteration already exists: ${repoRelative(iterDir, cwd)}`);
  }
  const historyPath = path.join(runDir, "history.jsonl");
  const duplicate = readJsonl(historyPath).some((item) => item.iteration === iteration);
  if (duplicate) {
    throw new Error(`history already contains iteration ${iteration}`);
  }
  fs.mkdirSync(iterDir, { recursive: true });

  try {
    const runId = path.basename(runDir);
    const manifestPath = path.join(runDir, "run-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      writeJsonAtomic(manifestPath, buildManifest({ runId, createdAt: now }));
    }

    const paths = summaryPaths({ dataRoot, split, outTag });
    const detAggregate = readAggregate(paths.deterministic);
    const semAggregate = readAggregate(paths.semantic);
    const detCanary = canaryStatus(detAggregate.canaryLeak);
    const semCanary = canaryStatus(semAggregate.canaryLeak);
    const canaryOk = detCanary.ok && semCanary.ok;

    const resultPath = path.join(dataRoot, split, id, "runs", outTag, "result.json");
    const resultJson = protectedSplit ? null : readJson(resultPath);
    const artifactIndex = buildArtifactIndex({
      dataRoot,
      split,
      id,
      outTag,
      deterministicPath: paths.deterministic,
      semanticPath: paths.semantic,
      resultPath: protectedSplit ? null : resultPath,
      resultJson,
      cwd,
    });

    const summary = {
      schemaVersion: 1,
      split,
      id,
      outTag,
      result: normalizeResult({ detAggregate, semAggregate, resultJson }),
      guardStatus: {
        protectedSplitMode: protectedSplit ? "aggregate-only" : "not_applicable",
        deterministicCanaryLeakOk: detCanary.ok,
        semanticCanaryLeakOk: semCanary.ok,
        agentFacingScanOk: true,
      },
    };

    const decision = canaryOk ? options.decision : "blocked";
    const decisionReason = protectedSplit
      ? PROTECTED_SPLIT_MESSAGE
      : defaultBackfillText(options.decisionReason, "backfilled: decision reason unavailable");
    const hypothesis = protectedSplit
      ? PROTECTED_SPLIT_MESSAGE
      : defaultBackfillText(options.hypothesis, "backfilled: exact hypothesis unavailable");
    const changeSummary = protectedSplit
      ? PROTECTED_SPLIT_MESSAGE
      : defaultBackfillText(options.changeSummary, "backfilled: change details unavailable");
    const nextAction = protectedSplit
      ? PROTECTED_SPLIT_MESSAGE
      : defaultBackfillText(options.nextAction, "backfilled: next action unavailable");

    const artifactIndexPath = path.join(iterDir, "artifact-index.json");
    writeJsonAtomic(path.join(iterDir, "input.json"), {
      schemaVersion: 1,
      split,
      id,
      outTag,
      hypothesis,
      changeSummary,
      requestedDecision: options.decision,
      decisionReason,
      nextAction,
    });
    writeJsonAtomic(artifactIndexPath, artifactIndex);
    writeJsonAtomic(path.join(iterDir, "summary.json"), summary);

    const weakestCases = canaryOk ? weakestCasesFromSemantic(paths.semantic, { protectedSplit }) : [];
    const entry = {
      schemaVersion: 1,
      runId,
      iteration,
      createdAt: now,
      provider: "codex-vision-keyframes",
      split,
      ids: [id],
      outTag,
      hypothesis,
      changeSummary,
      result: summary.result,
      guardStatus: summary.guardStatus,
      baselineRef: options.baselineOutTag
        ? { outTag: options.baselineOutTag, semanticAverage: Number(options.baselineSemanticAverage) || null }
        : null,
      decision,
      decisionReason: canaryOk ? decisionReason : "canary guard failed; blocked without detailed report",
      weakestCases,
      nextAction,
      artifactIndexHash: `sha256:${sha256File(artifactIndexPath)}`,
      artifactDir: repoRelative(iterDir, cwd),
    };

    writeJsonAtomic(path.join(iterDir, "05_decision.json"), {
      schemaVersion: 1,
      decision: entry.decision,
      reason: entry.decisionReason,
      guardStatus: entry.guardStatus,
      outTag,
    });
    writeTextAtomic(path.join(iterDir, "feedback_for_next_iter.md"), buildFeedback(entry));

    appendJsonLine(historyPath, entry);
    regenerateRunDocs(runDir);
    return { entry, runDir, iterDir };
  } catch (error) {
    writeTextAtomic(path.join(iterDir, "record-failed.log"), `${error.stack || error.message}\n`);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const result = recordIteration({
    runDir: requireString(args, "run-dir"),
    dataRoot: args["data-root"],
    iteration: requireString(args, "iteration"),
    split: requireString(args, "split"),
    id: requireString(args, "id"),
    outTag: requireString(args, "out-tag"),
    hypothesis: args.hypothesis,
    changeSummary: args["change-summary"],
    decision: requireString(args, "decision"),
    decisionReason: args["decision-reason"],
    nextAction: args["next-action"],
    baselineOutTag: args["baseline-out-tag"],
    baselineSemanticAverage: args["baseline-semantic-average"],
  });
  process.stdout.write(`recorded ${repoRelative(result.iterDir)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
