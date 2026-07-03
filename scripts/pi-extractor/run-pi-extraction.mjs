#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from "node:child_process";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  addAllowedRead,
  assertNoForbiddenReads,
  createAccessManifest,
  recordRead,
  recordWrite,
} from "./lib/access-guard.mjs";
import {
  applyVisualEstimateRepair,
  applyGenericCandidateRepair,
  applyGenericRepair,
  buildCandidateLedger,
  buildEvidencePackets,
  buildVisualTargetLedger,
  buildVisualLedger,
  freezePiExtraction,
  hashText,
} from "./lib/artifacts.mjs";
import {
  buildPiRecipeCandidatePrompt,
  buildPiRecipeDetailPrompt,
  buildPiRecipePrompt,
  PROMPT_VERSION,
  sourceToPiPublicPacket,
} from "./lib/prompt.mjs";
import {
  assertValidPiRecipeCandidates,
  assertValidPiRecipeOutput,
  normalizePiRecipeCandidates,
  normalizePiRecipeOutput,
  parsePiRawOutput,
} from "./lib/schema.mjs";
import { collectVisualEstimates, collectVisualLedger, executeCommand as executeVisualCommand } from "./lib/visual.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const BASE_PI_TOOLS = ["youtube_video_details", "youtube_transcript"];
const FETCH_CONTENT_TOOL = "fetch_content";
const DEFAULT_MODEL = process.env.PI_RECIPE_MODEL || "openai-codex/gpt-5.5";

export function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function optionalNumber(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function idsFromArgs(args) {
  return typeof args.ids === "string"
    ? args.ids.split(",").map((item) => item.trim()).filter(Boolean)
    : null;
}

export function buildPiTools({ allowFetchContent = false, sourcePacketOnly = false } = {}) {
  if (sourcePacketOnly) return [];
  return allowFetchContent ? [...BASE_PI_TOOLS, FETCH_CONTENT_TOOL] : [...BASE_PI_TOOLS];
}

export function buildPiCommand({ promptPath, model = DEFAULT_MODEL, provider = null, thinking = null, tools = buildPiTools() }) {
  const command = [
    process.env.PI_BIN || "pi",
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-session",
    "--mode",
    "json",
    "--print",
  ];
  if (tools.length === 0) {
    command.push("--no-tools");
  } else {
    command.push("--no-builtin-tools", "--tools", tools.join(","));
  }
  if (provider) command.push("--provider", provider);
  if (model) command.push("--model", model);
  if (thinking) command.push("--thinking", thinking);
  command.push(`@${promptPath}`);
  return command;
}

async function readJsonTracked(manifest, filePath, reason) {
  const resolved = recordRead(manifest, filePath, reason);
  return JSON.parse(await readFile(resolved, "utf8"));
}

async function readTextTracked(manifest, filePath, reason) {
  const resolved = recordRead(manifest, filePath, reason);
  return readFile(resolved, "utf8");
}

async function writeJsonTracked(manifest, filePath, value, reason) {
  const resolved = recordWrite(manifest, filePath, reason);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeTextTracked(manifest, filePath, value, reason) {
  const resolved = recordWrite(manifest, filePath, reason);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, value, "utf8");
}

function buildCasePaths({ projectRoot, dataRoot, split, id, outTag }) {
  const caseDir = path.join(projectRoot, dataRoot, split, id);
  const outDir = path.join(caseDir, "runs", outTag);
  return {
    caseDir,
    sourcePath: path.join(caseDir, "source.json"),
    outDir,
    promptPath: path.join(outDir, "prompt.txt"),
    sourcePacketPath: path.join(outDir, "source-packet.json"),
    commandPath: path.join(outDir, "pi-command.json"),
    rawPath: path.join(outDir, "pi-raw-response.json"),
    resultPath: path.join(outDir, "result.json"),
    manifestPath: path.join(outDir, "file-access-manifest.json"),
    failurePath: path.join(outDir, "failure.json"),
    candidatePromptPath: path.join(outDir, "candidate-prompt.txt"),
    candidateCommandPath: path.join(outDir, "candidate-command.json"),
    candidateRawPath: path.join(outDir, "candidate-raw-response.json"),
    candidateResultPath: path.join(outDir, "candidate-result.json"),
    candidateLedgerPath: path.join(outDir, "candidate-ledger.json"),
    visualTargetLedgerPath: path.join(outDir, "visual-target-ledger.json"),
    visualLedgerPath: path.join(outDir, "visual-ledger.json"),
    visualEstimatesPath: path.join(outDir, "visual-estimates.json"),
    evidencePacketsPath: path.join(outDir, "evidence-packets.json"),
    cacheManifestPath: path.join(outDir, "cache", "cache-manifest.json"),
    visualCacheRoot: path.join(outDir, "cache", "frames"),
  };
}

function safeFileSegment(value) {
  return String(value ?? "unknown").replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "unknown";
}

function buildDetailPaths(outDir, candidate, index) {
  const prefix = `detail-${String(index + 1).padStart(2, "0")}-${safeFileSegment(candidate.candidateId)}`;
  return {
    promptPath: path.join(outDir, `${prefix}-prompt.txt`),
    commandPath: path.join(outDir, `${prefix}-command.json`),
    rawPath: path.join(outDir, `${prefix}-raw-response.json`),
    resultPath: path.join(outDir, `${prefix}-result.json`),
  };
}

function piCommandNote(piTools) {
  return piTools.length === 0
    ? "All Pi tools are disabled; extraction must use only the provided source packet."
    : "Built-in Pi tools are disabled; only allowlisted YouTube/page extension tools are enabled.";
}

async function writeFailure(manifest, filePath, failure) {
  await writeJsonTracked(manifest, filePath, {
    ...failure,
    failedAt: new Date().toISOString(),
  }, "failure");
}

async function writeCacheManifest(manifest, filePath, value) {
  await writeJsonTracked(manifest, filePath, {
    schemaVersion: 1,
    kind: "pi-cache-manifest",
    createdAt: new Date().toISOString(),
    ...value,
  }, "cache-manifest");
}

async function executePi(command, { cwd, timeoutMs }) {
  const [bin, ...commandArgs] = command;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(bin, commandArgs, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      error.piExecution = {
        code: error.code ?? null,
        signal: null,
        killed: false,
        timedOut,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 20000),
        command,
        timeoutMs,
      };
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      const error = new Error(`Command failed: ${command.join(" ")}\n`);
      error.code = code;
      error.signal = signal;
      error.killed = timedOut;
      error.piExecution = {
        code,
        signal,
        killed: timedOut,
        timedOut,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 20000),
        command,
        timeoutMs,
      };
      reject(error);
    });
  });
}

async function readFixtureOrExecutePi({
  manifest,
  fixturePath,
  fixtureReason,
  command,
  projectRoot,
  timeoutMs,
  executePiFn,
}) {
  if (fixturePath) {
    return readTextTracked(manifest, fixturePath, fixtureReason);
  }
  const piResult = await executePiFn(command, { cwd: projectRoot, timeoutMs });
  return JSON.stringify(piResult, null, 2);
}

function candidatesToRecipeStubs(candidates) {
  return {
    recipes: candidates.map((candidate) => ({
      title: candidate.title,
      candidateId: candidate.candidateId,
      ingredients: candidate.ingredientNames.map((name) => ({
        name,
        amount: null,
        unit: null,
        amountBasis: null,
        confidence: 0.3,
        evidence: candidate.evidence,
      })),
      steps: [],
      uncertainties: candidate.uncertainties,
    })),
    repairLog: [],
  };
}

async function runStagedPiExtractionCase({
  manifest,
  paths,
  sourcePacket,
  allowFetchContent,
  sourcePacketOnly,
  piTools,
  model,
  provider,
  thinking,
  dryRun,
  candidateOnly,
  fastPrompt,
  genericRepair,
  visualFrames,
  visualFrameCount,
  visualFramesPerRange,
  visualSecondsPerCandidate,
  visualMaxCandidates,
  visualAllowFallbackRanges,
  visualTargetMaxRanges,
  visualWindowBeforeSec,
  visualWindowAfterSec,
  visualDescriptionOnlySweep,
  visualDescriptionOnlySweepFrames,
  visualMaxTargetsPerCandidate,
  visualEstimatesEnabled,
  visualEstimateMaxFrames,
  visualTimeoutMs,
  ytDlpBin,
  ffmpegBin,
  frameExtractorScript,
  frameExtractorPythonBin,
  candidateResponseJsonPath,
  detailResponseJsonPath,
  projectRoot,
  timeoutMs,
  executePiFn,
  executeVisualCommandFn,
  collectVisualLedgerFn,
  collectVisualEstimatesFn,
}) {
  manifest.mode = candidateOnly ? "staged-candidate-only" : "staged";
  manifest.stages = [];

  const candidatePrompt = buildPiRecipeCandidatePrompt(sourcePacket, { allowFetchContent, sourcePacketOnly, fastPrompt });
  await writeTextTracked(manifest, paths.candidatePromptPath, `${candidatePrompt}\n`, "candidate-prompt");
  addAllowedRead(manifest, paths.candidatePromptPath);
  const candidateCommand = buildPiCommand({ promptPath: paths.candidatePromptPath, model, provider, thinking, tools: piTools });
  manifest.stages.push({ name: "candidates", command: candidateCommand });
  await writeJsonTracked(manifest, paths.candidateCommandPath, {
    command: candidateCommand,
    note: piCommandNote(piTools),
  }, "candidate-command");

  if (dryRun) {
    manifest.phase = "staged-dry-run-completed";
    return;
  }

  manifest.currentStage = "candidates";
  const candidateRawPayload = await readFixtureOrExecutePi({
    manifest,
    fixturePath: candidateResponseJsonPath,
    fixtureReason: "candidate-fixture-response-json",
    command: candidateCommand,
    projectRoot,
    timeoutMs,
    executePiFn,
  });
  await writeTextTracked(
    manifest,
    paths.candidateRawPath,
    candidateRawPayload.endsWith("\n") ? candidateRawPayload : `${candidateRawPayload}\n`,
    "candidate-raw-response",
  );
  const candidateOutput = applyGenericCandidateRepair({
    candidateOutput: normalizePiRecipeCandidates(parsePiRawOutput(candidateRawPayload)),
    sourcePacket,
  });
  assertValidPiRecipeCandidates(candidateOutput);
  await writeJsonTracked(manifest, paths.candidateResultPath, candidateOutput, "candidate-result");
  const candidateLedger = buildCandidateLedger({ sourcePacket, candidateOutput });
  const visualTargetLedger = buildVisualTargetLedger({
    sourcePacket,
    candidateLedger,
    maxRanges: visualTargetMaxRanges,
    windowBeforeSec: visualWindowBeforeSec,
    windowAfterSec: visualWindowAfterSec,
    descriptionOnlySweep: visualDescriptionOnlySweep,
    maxTargetsPerCandidate: visualMaxTargetsPerCandidate,
  });
  const visualLedger = visualFrames
    ? await collectVisualLedgerFn({
      sourcePacket,
      candidateLedger,
      visualTargetLedger,
      projectRoot,
      cacheRoot: paths.visualCacheRoot,
      manifest,
      model,
      provider,
      thinking,
      ytDlpBin,
      ffmpegBin,
      frameCount: visualFrameCount,
      framesPerRange: visualFramesPerRange,
      secondsPerCandidate: visualSecondsPerCandidate,
      maxCandidates: visualMaxCandidates,
      allowFallbackRanges: visualAllowFallbackRanges,
      frameExtractorScript,
      frameExtractorPythonBin,
      descriptionOnlySweepFrames: visualDescriptionOnlySweepFrames,
      timeoutMs: visualTimeoutMs,
      executeCommandFn: executeVisualCommandFn,
      executePiFn,
    })
    : buildVisualLedger({ sourcePacket, candidateLedger });
  const visualEstimates = visualFrames && visualEstimatesEnabled && !candidateOnly
    ? await collectVisualEstimatesFn({
      visualTargetLedger,
      visualLedger,
      projectRoot,
      cacheRoot: paths.visualCacheRoot,
      manifest,
      model,
      provider,
      thinking,
      timeoutMs: visualTimeoutMs,
      maxFramesPerEstimate: visualEstimateMaxFrames,
      executePiFn,
    })
    : {
      schemaVersion: 1,
      kind: "visual-estimates",
      videoId: sourcePacket?.video?.videoId ?? null,
      visualEstimates: [],
      uncertainties: [],
      errors: [],
      skipped: true,
    };
  const evidencePackets = buildEvidencePackets({ sourcePacket, candidateLedger, visualLedger, visualTargetLedger, visualEstimates });
  await writeJsonTracked(manifest, paths.candidateLedgerPath, candidateLedger, "candidate-ledger");
  await writeJsonTracked(manifest, paths.visualTargetLedgerPath, visualTargetLedger, "visual-target-ledger");
  await writeJsonTracked(manifest, paths.visualLedgerPath, visualLedger, "visual-ledger");
  await writeJsonTracked(manifest, paths.visualEstimatesPath, visualEstimates, "visual-estimates");
  await writeJsonTracked(manifest, paths.evidencePacketsPath, evidencePackets, "evidence-packets");
  await writeCacheManifest(manifest, paths.cacheManifestPath, {
    cachePolicy: "raw responses and ledgers are stored in the run directory",
    promptHashes: {
      candidate: hashText(candidatePrompt),
    },
    rawResponseHashes: {
      candidate: hashText(candidateRawPayload),
    },
    visual: {
      enabled: visualFrames,
      collectionStatus: visualLedger.collectionStatus,
      frameCount: visualLedger.candidates.reduce((sum, candidate) => sum + candidate.frames.length, 0),
      targetCount: visualTargetLedger.targets.length,
      estimateCount: visualEstimates.visualEstimates.length,
      errors: visualLedger.errors ?? [],
    },
  });

  if (candidateOnly) {
    const candidateStubs = candidatesToRecipeStubs(candidateOutput.candidates);
    assertValidPiRecipeOutput(candidateStubs);
    await writeJsonTracked(manifest, paths.resultPath, { videoId: manifest.videoId, ...candidateStubs }, "result");
    manifest.phase = "candidate-only-completed";
    manifest.candidateCount = candidateOutput.candidates.length;
    manifest.recipeCount = candidateOutput.candidates.length;
    manifest.ingredientCount = candidateStubs.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
    manifest.stepCount = 0;
    return;
  }

  const recipes = [];
  const repairLog = [];
  for (const [index, candidate] of candidateOutput.candidates.entries()) {
    const detailPaths = buildDetailPaths(paths.outDir, candidate, index);
    const evidencePacket = evidencePackets.packets.find((packet) => packet.candidateId === candidate.candidateId) ?? null;
    const detailPrompt = buildPiRecipeDetailPrompt(sourcePacket, candidate, {
      allowFetchContent,
      sourcePacketOnly,
      fastPrompt,
      evidencePacket,
    });
    await writeTextTracked(manifest, detailPaths.promptPath, `${detailPrompt}\n`, `detail-prompt:${candidate.candidateId}`);
    addAllowedRead(manifest, detailPaths.promptPath);
    const detailCommand = buildPiCommand({ promptPath: detailPaths.promptPath, model, provider, thinking, tools: piTools });
    manifest.stages.push({ name: "detail", candidateId: candidate.candidateId, command: detailCommand });
    await writeJsonTracked(manifest, detailPaths.commandPath, {
      command: detailCommand,
      note: piCommandNote(piTools),
    }, `detail-command:${candidate.candidateId}`);

    manifest.currentStage = `detail:${candidate.candidateId}`;
    const detailRawPayload = await readFixtureOrExecutePi({
      manifest,
      fixturePath: detailResponseJsonPath,
      fixtureReason: `detail-fixture-response-json:${candidate.candidateId}`,
      command: detailCommand,
      projectRoot,
      timeoutMs,
      executePiFn,
    });
    await writeTextTracked(
      manifest,
      detailPaths.rawPath,
      detailRawPayload.endsWith("\n") ? detailRawPayload : `${detailRawPayload}\n`,
      `detail-raw-response:${candidate.candidateId}`,
    );
    const detailOutput = normalizePiRecipeOutput(parsePiRawOutput(detailRawPayload));
    assertValidPiRecipeOutput(detailOutput);
    const candidateRecipes = detailOutput.recipes.map((recipe) => ({
      ...recipe,
      candidateId: recipe.candidateId ?? candidate.candidateId,
    }));
    recipes.push(...candidateRecipes);
    repairLog.push(...detailOutput.repairLog);
    await writeJsonTracked(
      manifest,
      detailPaths.resultPath,
      { recipes: candidateRecipes, repairLog: detailOutput.repairLog },
      `detail-result:${candidate.candidateId}`,
    );
  }

  const repairedOutput = genericRepair
    ? applyGenericRepair({ output: { recipes, repairLog }, candidateOutput, sourcePacket })
    : { recipes, repairLog };
  const finalOutput = visualEstimatesEnabled
    ? applyVisualEstimateRepair({ output: repairedOutput, visualEstimates })
    : repairedOutput;
  assertValidPiRecipeOutput(finalOutput);
  await writeJsonTracked(manifest, paths.resultPath, { videoId: manifest.videoId, ...finalOutput }, "result");
  manifest.phase = "completed";
  manifest.candidateCount = candidateOutput.candidates.length;
  manifest.recipeCount = finalOutput.recipes.length;
  manifest.ingredientCount = finalOutput.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  manifest.stepCount = finalOutput.recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
}

export async function runPiExtraction(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const dataRoot = options.dataRoot ?? DATA_ROOT;
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : "pi-mvp-latest";
  const splitDir = path.join(projectRoot, dataRoot, split);
  const explicitIds = idsFromArgs(args);
  const ids = explicitIds ?? (await readdir(splitDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const dryRun = args["dry-run"] === true;
  const allowFetchContent = args["allow-fetch-content"] === true;
  const sourcePacketOnly = args["source-packet-only"] === true;
  const staged = args.staged === true;
  const candidateOnly = args["candidate-only"] === true;
  const fastPrompt = args["fast-prompt"] === true;
  const genericRepair = args["generic-repair"] !== false;
  const timeoutMs = optionalNumber(args["timeout-ms"], 20 * 60 * 1000);
  const visualFrames = args["visual-frames"] === true;
  const visualFrameCount = optionalNumber(args["visual-frame-count"], 2);
  const visualFramesPerRange = optionalNumber(args["visual-frames-per-range"], visualFrameCount);
  const visualSecondsPerCandidate = optionalNumber(args["visual-seconds-per-candidate"], 30);
  const visualMaxCandidates = optionalNumber(args["visual-max-candidates"], null);
  const visualAllowFallbackRanges = args["visual-allow-fallback-ranges"] === true;
  const visualTargetMaxRanges = optionalNumber(args["visual-target-max-ranges"], 3);
  const visualWindowBeforeSec = optionalNumber(args["visual-window-before-sec"], 8);
  const visualWindowAfterSec = optionalNumber(args["visual-window-after-sec"], 12);
  const visualDescriptionOnlySweep = args["visual-description-only-sweep"] !== false;
  const visualDescriptionOnlySweepFrames = optionalNumber(args["visual-description-only-sweep-frames"], 6);
  const visualMaxTargetsPerCandidate = optionalNumber(args["visual-max-targets-per-candidate"], 8);
  const visualEstimatesEnabled = args["visual-estimates"] !== false;
  const visualEstimateMaxFrames = optionalNumber(args["visual-estimate-max-frames"], 6);
  const visualTimeoutMs = optionalNumber(args["visual-timeout-ms"], timeoutMs);
  const freezeAfterExtraction = args.freeze === true;
  const piTools = buildPiTools({ allowFetchContent, sourcePacketOnly });
  const responseJsonPath = typeof args["response-json"] === "string" ? path.resolve(projectRoot, args["response-json"]) : null;
  const candidateResponseJsonPath = typeof args["candidate-response-json"] === "string"
    ? path.resolve(projectRoot, args["candidate-response-json"])
    : responseJsonPath;
  const detailResponseJsonPath = typeof args["detail-response-json"] === "string"
    ? path.resolve(projectRoot, args["detail-response-json"])
    : responseJsonPath;
  const maxCaptionSegments = optionalNumber(args["max-caption-segments"], null);
  const maxDescriptionChars = optionalNumber(args["max-description-chars"], 16000);
  const compactSourcePacket = args["compact-source-packet"] === true;
  const maxAuthorComments = optionalNumber(args["max-author-comments"], compactSourcePacket ? 0 : 10);
  const model = typeof args.model === "string" ? args.model : DEFAULT_MODEL;
  const provider = typeof args["pi-provider"] === "string" ? args["pi-provider"] : null;
  const thinking = typeof args.thinking === "string" ? args.thinking : null;
  const ytDlpBin = typeof args["yt-dlp-bin"] === "string" ? args["yt-dlp-bin"] : process.env.YT_DLP_BIN || "yt-dlp";
  const ffmpegBin = typeof args["ffmpeg-bin"] === "string" ? args["ffmpeg-bin"] : process.env.FFMPEG_BIN || "ffmpeg";
  const frameExtractorScript = typeof args["frame-extractor-script"] === "string"
    ? path.resolve(projectRoot, args["frame-extractor-script"])
    : path.join(projectRoot, "scripts/recipe-loop/extract-video-frames.py");
  const frameExtractorPythonBin = typeof args["frame-extractor-python-bin"] === "string"
    ? args["frame-extractor-python-bin"]
    : process.env.PYTHON_BIN || "python3";
  let failures = 0;

  for (const id of ids) {
    const paths = buildCasePaths({ projectRoot, dataRoot, split, id, outTag });
    const allowedReads = [paths.sourcePath];
    if (responseJsonPath) allowedReads.push(responseJsonPath);
    if (candidateResponseJsonPath) allowedReads.push(candidateResponseJsonPath);
    if (detailResponseJsonPath) allowedReads.push(detailResponseJsonPath);
    const manifest = createAccessManifest({ projectRoot, allowedReads });
    Object.assign(manifest, {
      runner: "scripts/pi-extractor/run-pi-extraction.mjs",
      promptVersion: PROMPT_VERSION,
      split,
      videoId: id,
      outTag,
      dryRun,
      staged,
      candidateOnly,
      fastPrompt,
      genericRepair,
      visualFrames,
      visualFrameCount,
      visualSecondsPerCandidate,
      visualMaxCandidates,
      visualAllowFallbackRanges,
      visualTimeoutMs,
      freezeAfterExtraction,
      sourcePacketOnly,
      compactSourcePacket,
      piTools,
      visual: {
        enabled: visualFrames,
        frameCount: visualFrameCount,
        framesPerRange: visualFramesPerRange,
        secondsPerCandidate: visualSecondsPerCandidate,
        maxCandidates: visualMaxCandidates,
        allowFallbackRanges: visualAllowFallbackRanges,
        targetMaxRanges: visualTargetMaxRanges,
        windowBeforeSec: visualWindowBeforeSec,
        windowAfterSec: visualWindowAfterSec,
        descriptionOnlySweep: visualDescriptionOnlySweep,
        descriptionOnlySweepFrames: visualDescriptionOnlySweepFrames,
        maxTargetsPerCandidate: visualMaxTargetsPerCandidate,
        estimatesEnabled: visualEstimatesEnabled,
        estimateMaxFrames: visualEstimateMaxFrames,
        timeoutMs: visualTimeoutMs,
        ytDlpBin,
        ffmpegBin,
        frameExtractorScript,
        frameExtractorPythonBin,
      },
      policy: {
        localFileAccess: visualFrames ? "source-plus-derived-youtube-frames" : "source-only",
        thirdPartyWebSearch: "disabled",
        sameYoutubePageOnly: true,
      },
    });

    try {
      if (!existsSync(paths.sourcePath)) {
        throw new Error(`source 없음: ${paths.sourcePath}`);
      }
      const source = await readJsonTracked(manifest, paths.sourcePath, "source.json");
      const sourcePacket = sourceToPiPublicPacket(source, {
        maxCaptionSegments,
        maxDescriptionChars,
        maxAuthorComments,
        compactSourcePacket,
      });
      await writeJsonTracked(manifest, paths.sourcePacketPath, sourcePacket, "source-packet");
      if (staged) {
        await runStagedPiExtractionCase({
          manifest,
          paths,
          sourcePacket,
          allowFetchContent,
          sourcePacketOnly,
          piTools,
          model,
          provider,
          thinking,
          dryRun,
          candidateOnly,
          fastPrompt,
          genericRepair,
          visualFrames,
          visualFrameCount,
          visualFramesPerRange,
          visualSecondsPerCandidate,
          visualMaxCandidates,
          visualAllowFallbackRanges,
          visualTargetMaxRanges,
          visualWindowBeforeSec,
          visualWindowAfterSec,
          visualDescriptionOnlySweep,
          visualDescriptionOnlySweepFrames,
          visualMaxTargetsPerCandidate,
          visualEstimatesEnabled,
          visualEstimateMaxFrames,
          visualTimeoutMs,
          ytDlpBin,
          ffmpegBin,
          frameExtractorScript,
          frameExtractorPythonBin,
          candidateResponseJsonPath,
          detailResponseJsonPath,
          projectRoot,
          timeoutMs,
          executePiFn: options.executePi ?? executePi,
          executeVisualCommandFn: options.executeVisualCommand ?? executeVisualCommand,
          collectVisualLedgerFn: options.collectVisualLedger ?? collectVisualLedger,
          collectVisualEstimatesFn: options.collectVisualEstimates ?? collectVisualEstimates,
        });
        assertNoForbiddenReads(manifest);
        await writeJsonTracked(manifest, paths.manifestPath, manifest, "file-access-manifest");
        if (dryRun) {
          console.log(`[DRY-RUN] pi staged ${split}/${id}: candidate prompt + manifest 작성`);
        } else {
          console.log(
            `[OK] pi staged ${split}/${id}: 후보 ${manifest.candidateCount}, 레시피 ${manifest.recipeCount}, 재료 ${manifest.ingredientCount}, 단계 ${manifest.stepCount}`,
          );
        }
        continue;
      }
      const prompt = buildPiRecipePrompt(sourcePacket, { allowFetchContent, sourcePacketOnly });
      await writeTextTracked(manifest, paths.promptPath, prompt + "\n", "prompt");
      addAllowedRead(manifest, paths.promptPath);
      const command = buildPiCommand({ promptPath: paths.promptPath, model, provider, thinking, tools: piTools });
      manifest.piCommand = command;
      await writeJsonTracked(manifest, paths.commandPath, {
        command,
        note: piCommandNote(piTools),
      }, "pi-command");

      if (dryRun) {
        manifest.phase = "dry-run-completed";
        assertNoForbiddenReads(manifest);
        await writeJsonTracked(manifest, paths.manifestPath, manifest, "file-access-manifest");
        console.log(`[DRY-RUN] ${split}/${id}: prompt + manifest 작성`);
        continue;
      }

      let rawPayload;
      if (responseJsonPath) {
        rawPayload = await readTextTracked(manifest, responseJsonPath, "fixture-response-json");
      } else {
        const piResult = await (options.executePi ?? executePi)(command, { cwd: projectRoot, timeoutMs });
        rawPayload = JSON.stringify(piResult, null, 2);
      }

      await writeTextTracked(manifest, paths.rawPath, rawPayload.endsWith("\n") ? rawPayload : `${rawPayload}\n`, "pi-raw-response");
      const rawJson = parsePiRawOutput(rawPayload);
      const normalized = normalizePiRecipeOutput(rawJson);
      const finalOutput = genericRepair
        ? applyGenericRepair({ output: normalized, candidateOutput: { candidates: [] }, sourcePacket })
        : normalized;
      assertValidPiRecipeOutput(finalOutput);
      await writeJsonTracked(manifest, paths.resultPath, { videoId: id, ...finalOutput }, "result");
      manifest.phase = "completed";
      manifest.recipeCount = finalOutput.recipes.length;
      manifest.ingredientCount = finalOutput.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
      manifest.stepCount = finalOutput.recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
      await writeCacheManifest(manifest, paths.cacheManifestPath, {
        cachePolicy: "raw responses are stored in the run directory",
        promptHashes: {
          single: hashText(prompt),
        },
        rawResponseHashes: {
          single: hashText(rawPayload),
        },
      });
      assertNoForbiddenReads(manifest);
      await writeJsonTracked(manifest, paths.manifestPath, manifest, "file-access-manifest");
      console.log(`[OK] pi ${split}/${id}: 레시피 ${manifest.recipeCount}, 재료 ${manifest.ingredientCount}, 단계 ${manifest.stepCount}`);
    } catch (error) {
      failures += 1;
      manifest.phase = "failed";
      manifest.error = error instanceof Error ? error.message : String(error);
      await writeFailure(manifest, paths.failurePath, {
        videoId: id,
        split,
        outTag,
        message: manifest.error,
        stack: error instanceof Error ? error.stack : undefined,
        piExecution: error?.piExecution ?? null,
      }).catch(() => undefined);
      await writeJsonTracked(manifest, paths.manifestPath, manifest, "file-access-manifest").catch(() => undefined);
      console.error(`[FAIL] pi ${split}/${id}: ${manifest.error}`);
    }
  }

  let freeze = null;
  if (freezeAfterExtraction && !dryRun) {
    freeze = await freezePiExtraction({ projectRoot, dataRoot, split, outTag, ids });
    console.log(`[OK] freeze ${split}/${outTag}: ${freeze.freeze.completedCount}/${freeze.freeze.caseCount}`);
  }

  return { failures, split, outTag, count: ids.length, freezePath: freeze?.freezePath ?? null };
}

async function main() {
  const result = await runPiExtraction(process.argv.slice(2));
  process.exit(result.failures > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
