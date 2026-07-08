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
  buildGapLedger,
  buildSourceDraft,
  buildVisualTargetLedger,
  buildVisualLedger,
  freezePiExtraction,
  hashText,
  validateFinalVisualEvidenceContract,
} from "./lib/artifacts.mjs";
import {
  buildPiRecipeCandidatePrompt,
  buildPiRecipeDetailPrompt,
  buildPiRecipePrompt,
  PROMPT_VERSION,
  sourceToPiPublicPacket,
} from "./lib/prompt.mjs";
import {
  HOLISTIC_PROMPT_VERSION,
  assertValidHolisticDraft,
  assertValidRecipeBoundaryPlan,
  assertValidVideoUnderstanding,
  auditHolisticDraft,
  auditRecipeUnitConsistency,
  applyRecipeUnitUnderstandingDemotion,
  buildCandidateIntegratedBrief,
  buildFinalOutputFromHolisticAudit,
  buildCandidateFirstHolisticDraftPrompt,
  buildHolisticCandidateLedger,
  buildHolisticDraftPrompt,
  buildHolisticFinalPrompt,
  buildHolisticSourcePacket,
  buildHolisticStoryboardCandidateLedger,
  buildHolisticVisualRepairPrompt,
  buildRecipeBoundaryPlanPrompt,
  buildRecipeUnitUnderstandingState,
  buildRecipeUnitWorkingMemory,
  buildHolisticVisualTargetLedger,
  buildVideoUnderstandingPrompt,
  normalizeHolisticDraft,
  normalizeRecipeBoundaryPlan,
  normalizeVideoUnderstanding,
  recommendHolisticTimelineFrameBudget,
  selectUsableVideoUnderstanding,
} from "./lib/holistic.mjs";
import {
  assertValidCandidateTimelineIndex,
  assertValidVideoTimeline,
  buildCandidateTimelineIndex,
  buildTimelineCandidateLedger,
  buildTimelineFrameLedger,
  buildTimelineFramePlan,
  buildVideoTimelinePrompt,
  framesPerTimelineWindow,
  normalizeVideoTimeline,
  repairVideoTimelineEvidenceRefs,
  timelineAllowedEvidenceRefs,
} from "./lib/timeline.mjs";
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

function truncateLargeStringsForDisk(value, maxTextLength) {
  if (!value || typeof value !== "object") return false;
  let sanitized = false;
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "string" && field.length > maxTextLength) {
      value[key] = `${field.slice(0, maxTextLength)}\n[omitted ${field.length - maxTextLength} chars from Pi trace echo]`;
      sanitized = true;
    } else if (Array.isArray(field)) {
      for (const item of field) {
        if (truncateLargeStringsForDisk(item, maxTextLength)) sanitized = true;
      }
    } else if (field && typeof field === "object") {
      if (truncateLargeStringsForDisk(field, maxTextLength)) sanitized = true;
    }
  }
  return sanitized;
}

function sanitizePiJsonlStdoutForDisk(stdout, maxTextLength = 1200) {
  if (typeof stdout !== "string" || stdout.length === 0) return stdout;
  let sanitized = false;
  const lines = stdout.split("\n").map((line) => {
    if (!line.trim()) return line;
    try {
      const event = JSON.parse(line);
      if (event?.type === "message_update") {
        sanitized = true;
        return "";
      }
      const keepFinalAssistant = event?.type === "message_end" && event?.message?.role === "assistant";
      if (!keepFinalAssistant && truncateLargeStringsForDisk(event, maxTextLength)) {
        sanitized = true;
      }
      return JSON.stringify(event);
    } catch {
      return line;
    }
  });
  return sanitized ? lines.join("\n") : stdout;
}

export function sanitizePiRawPayloadForDisk(rawPayload) {
  try {
    const payload = JSON.parse(rawPayload);
    if (!payload || typeof payload !== "object" || typeof payload.stdout !== "string") {
      return rawPayload;
    }
    const stdout = sanitizePiJsonlStdoutForDisk(payload.stdout);
    if (stdout === payload.stdout) return rawPayload;
    return JSON.stringify({
      ...payload,
      stdout,
      stdoutSanitizedForDisk: true,
    }, null, 2);
  } catch {
    return rawPayload;
  }
}

function rawPayloadForDisk(rawPayload) {
  const sanitized = sanitizePiRawPayloadForDisk(rawPayload);
  return sanitized.endsWith("\n") ? sanitized : `${sanitized}\n`;
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
    holisticSourcePacketPath: path.join(outDir, "holistic-source-packet.json"),
    holisticStoryboardLedgerPath: path.join(outDir, "holistic-storyboard-ledger.json"),
    holisticDraftPromptPath: path.join(outDir, "holistic-draft-prompt.txt"),
    holisticDraftCommandPath: path.join(outDir, "holistic-draft-command.json"),
    holisticDraftRawPath: path.join(outDir, "holistic-draft-raw-response.json"),
    holisticDraftPath: path.join(outDir, "holistic-draft.json"),
    candidateDraftsPath: path.join(outDir, "candidate-drafts.json"),
    candidateDraftsDir: path.join(outDir, "candidate-drafts"),
    holisticVisualRepairPromptPath: path.join(outDir, "holistic-visual-repair-prompt.txt"),
    holisticVisualRepairCommandPath: path.join(outDir, "holistic-visual-repair-command.json"),
    holisticVisualRepairRawPath: path.join(outDir, "holistic-visual-repair-raw-response.json"),
    holisticVisualRepairResultPath: path.join(outDir, "holistic-visual-repair-result.json"),
    holisticEvidenceAuditPath: path.join(outDir, "holistic-evidence-audit.json"),
    holisticVisualNeedsPath: path.join(outDir, "holistic-visual-needs.json"),
    holisticFinalPromptPath: path.join(outDir, "holistic-final-prompt.txt"),
    holisticFinalResultPath: path.join(outDir, "holistic-final-result.json"),
    timelineFramePlanPath: path.join(outDir, "timeline-frame-plan.json"),
    timelineFrameLedgerPath: path.join(outDir, "timeline-frame-ledger.json"),
    videoTimelinePromptPath: path.join(outDir, "video-timeline-prompt.txt"),
    videoTimelineCommandPath: path.join(outDir, "video-timeline-command.json"),
    videoTimelineRawPath: path.join(outDir, "video-timeline-raw-response.json"),
    timelineEvidenceRefRepairPath: path.join(outDir, "timeline-evidence-ref-repair.json"),
    timelineDroppedEventsPath: path.join(outDir, "timeline-dropped-events.json"),
    videoTimelinePath: path.join(outDir, "video-timeline.json"),
    videoUnderstandingPromptPath: path.join(outDir, "video-understanding-prompt.txt"),
    videoUnderstandingCommandPath: path.join(outDir, "video-understanding-command.json"),
    videoUnderstandingRawPath: path.join(outDir, "video-understanding-raw-response.json"),
    videoUnderstandingPath: path.join(outDir, "video-understanding.json"),
    videoUnderstandingUsagePath: path.join(outDir, "video-understanding-usage.json"),
    videoUnderstandingAuditPath: path.join(outDir, "video-understanding-audit.json"),
    videoUnderstandingFailurePath: path.join(outDir, "video-understanding-failure.json"),
    recipeBoundaryPromptPath: path.join(outDir, "recipe-boundary-prompt.txt"),
    recipeBoundaryCommandPath: path.join(outDir, "recipe-boundary-command.json"),
    recipeBoundaryRawPath: path.join(outDir, "recipe-boundary-raw-response.json"),
    recipeBoundaryPlanPath: path.join(outDir, "recipe-boundary-plan.json"),
    recipeBoundaryFailurePath: path.join(outDir, "recipe-boundary-failure.json"),
    recipeUnitWorkingMemoryPath: path.join(outDir, "recipe-unit-working-memory.json"),
    recipeUnitUnderstandingStatePath: path.join(outDir, "recipe-unit-understanding-state.json"),
    recipeUnitDraftSelfAuditPath: path.join(outDir, "recipe-unit-draft-self-audit.json"),
    unitConsistencyAuditPath: path.join(outDir, "unit-consistency-audit.json"),
    unitConsistencySummaryPath: path.join(outDir, "unit-consistency-summary.json"),
    recipeUnitDraftsDir: path.join(outDir, "recipe-unit-drafts"),
    holisticDraftSourcePacketPath: path.join(outDir, "holistic-draft-source-packet.json"),
    candidateTimelineIndexPath: path.join(outDir, "candidate-timeline-index.json"),
    candidatePromptPath: path.join(outDir, "candidate-prompt.txt"),
    candidateCommandPath: path.join(outDir, "candidate-command.json"),
    candidateRawPath: path.join(outDir, "candidate-raw-response.json"),
    candidateResultPath: path.join(outDir, "candidate-result.json"),
    candidateLedgerPath: path.join(outDir, "candidate-ledger.json"),
    sourceDraftPath: path.join(outDir, "source-draft.json"),
    gapLedgerPath: path.join(outDir, "gap-ledger.json"),
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

function emptyVisualEstimates(videoId, reason = "holistic visual estimate targets were not requested") {
  return {
    schemaVersion: 1,
    kind: "visual-estimates",
    videoId,
    visualEstimates: [],
    uncertainties: [reason],
    errors: [],
    skipped: true,
  };
}

function visualLedgerFrameCount(visualLedger) {
  const candidateFrames = (visualLedger?.candidates ?? []).reduce((sum, candidate) => sum + (candidate.frames?.length ?? 0), 0);
  const targetFrames = (visualLedger?.targets ?? []).reduce((sum, target) => sum + (target.frames?.length ?? 0), 0);
  return candidateFrames + targetFrames;
}

function mergeVisualLedgers(sourcePacket, ledgers) {
  const usableLedgers = ledgers.filter(Boolean);
  const errors = usableLedgers.flatMap((ledger) => ledger.errors ?? []);
  return {
    schemaVersion: 1,
    kind: "visual-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    collectionStatus: errors.length > 0 ? "partial" : usableLedgers.some((ledger) => visualLedgerFrameCount(ledger) > 0) ? "completed" : "skipped",
    note: "Merged holistic storyboard frames and target frames for final visual evidence contract.",
    errors,
    candidates: usableLedgers.flatMap((ledger) => ledger.candidates ?? []),
    targets: usableLedgers.flatMap((ledger) => ledger.targets ?? []),
  };
}

function uniqueEntriesByRef(entries) {
  const selected = [];
  const seen = new Set();
  for (const entry of entries ?? []) {
    if (!entry?.ref || seen.has(entry.ref)) continue;
    seen.add(entry.ref);
    selected.push(entry);
  }
  return selected;
}

function eventIdsForCandidate(candidatePacket, candidateTimelineEntry) {
  return new Set([
    ...(candidatePacket?.supportingEvents ?? []),
    ...(candidatePacket?.unclearEvents ?? []),
    ...(candidateTimelineEntry?.supportingEvents ?? []),
    ...(candidateTimelineEntry?.unclearEvents ?? []),
  ].filter(Boolean));
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function boundaryAllowedEvidenceRefs({ sourcePacket, holisticSourcePacket, timelineFrameLedger }) {
  return uniqueStrings([
    ...timelineAllowedEvidenceRefs({ sourcePacket, timelineFrameLedger }),
    ...(holisticSourcePacket?.refs ?? []),
    ...(holisticSourcePacket?.timelineEvents ?? []).flatMap((entry) => [entry.ref, ...(entry.evidence ?? [])]),
    ...(holisticSourcePacket?.videoTimeline?.events ?? []).flatMap((event) => [
      event?.eventId ? `event:${event.eventId}` : null,
      ...(event?.evidence ?? []),
    ]),
    ...(holisticSourcePacket?.candidateSourcePackets ?? []).flatMap((packet) => (
      packet?.sourceEntries ?? []
    ).map((entry) => entry.ref)),
  ]);
}

function buildDryRunRecipeBoundaryPlan(holisticSourcePacket) {
  const candidates = holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [];
  return normalizeRecipeBoundaryPlan({
    recipeUnits: candidates.map((candidate, index) => ({
      recipeUnitId: `r${index + 1}`,
      title: candidate.title ?? `레시피 ${index + 1}`,
      candidateIds: [candidate.candidateId],
      timeRange: candidate.timeRange ?? null,
      dishIdentityEvidence: candidate.sourceEvidence ?? ["title"],
      stageSummary: [],
      reason: "dry-run boundary placeholder; no Pi call was executed",
      confidence: 0.4,
    })),
    skippedCandidates: [],
    uncertainties: ["dry-run recipe boundary plan; not a quality signal"],
  }, {
    videoId: holisticSourcePacket?.video?.videoId ?? null,
    candidates,
  });
}

function mergedCandidateTimeRange(candidates, fallback = null) {
  const starts = candidates
    .map((candidate) => Number(candidate?.timeRange?.startSec))
    .filter(Number.isFinite);
  const ends = candidates
    .map((candidate) => Number(candidate?.timeRange?.endSec))
    .filter(Number.isFinite);
  return {
    startSec: starts.length ? Math.min(...starts) : fallback?.startSec ?? null,
    endSec: ends.length ? Math.max(...ends) : fallback?.endSec ?? null,
    basis: "recipe-boundary-merged-candidates",
  };
}

function buildRecipeUnitHolisticSourcePacket(holisticSourcePacket, recipeBoundaryPlan) {
  const candidatePackets = holisticSourcePacket?.candidateSourcePackets ?? [];
  const timelineCandidates = holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [];
  const candidatePacketById = new Map(candidatePackets.map((packet) => [packet.candidateId, packet]));
  const timelineCandidateById = new Map(timelineCandidates.map((candidate) => [candidate.candidateId, candidate]));
  const entryByRef = new Map((holisticSourcePacket?.entries ?? []).map((entry) => [entry.ref, entry]));
  const titleEntry = entryByRef.get("title") ?? null;
  const recipeUnitPackets = [];
  const recipeUnitTimelineCandidates = [];

  for (const [unitIndex, unit] of (recipeBoundaryPlan?.recipeUnits ?? []).entries()) {
    const sourcePackets = unit.candidateIds.map((candidateId) => candidatePacketById.get(candidateId)).filter(Boolean);
    const sourceTimelineCandidates = unit.candidateIds.map((candidateId) => timelineCandidateById.get(candidateId)).filter(Boolean);
    const supportingEvents = uniqueStrings([
      ...sourcePackets.flatMap((packet) => packet.supportingEvents ?? []),
      ...sourceTimelineCandidates.flatMap((candidate) => candidate.supportingEvents ?? []),
    ]);
    const unclearEvents = uniqueStrings([
      ...sourcePackets.flatMap((packet) => packet.unclearEvents ?? []),
      ...sourceTimelineCandidates.flatMap((candidate) => candidate.unclearEvents ?? []),
    ]);
    const excludedEvents = uniqueStrings(sourceTimelineCandidates.flatMap((candidate) => candidate.excludedEvents ?? []));
    const sourceEntries = uniqueEntriesByRef([
      titleEntry,
      ...sourcePackets.flatMap((packet) => packet.sourceEntries ?? []),
      ...(holisticSourcePacket?.timelineEvents ?? []).filter((entry) => (
        [...supportingEvents, ...unclearEvents].some((eventId) => entry.ref === `event:${eventId}`)
      )),
    ].filter(Boolean));
    const timeRange = unit.timeRange ?? mergedCandidateTimeRange(sourceTimelineCandidates);
    const recipeSourceCandidateIds = unit.candidateIds;
    recipeUnitPackets.push({
      candidateId: unit.recipeUnitId,
      recipeSourceCandidateIds,
      title: unit.title,
      timeRange,
      supportingEvents,
      unclearEvents,
      sourceEntries,
      boundaryReason: unit.reason ?? null,
      boundaryEvidence: unit.dishIdentityEvidence ?? [],
      stageSummary: unit.stageSummary ?? [],
    });
    recipeUnitTimelineCandidates.push({
      candidateId: unit.recipeUnitId,
      recipeSourceCandidateIds,
      title: unit.title,
      sourceEvidence: unit.dishIdentityEvidence ?? [],
      timeRange,
      supportingEvents,
      excludedEvents,
      unclearEvents,
      orderBasis: "recipe-boundary-plan",
      confidence: unit.confidence ?? 0.4,
      boundaryReason: unit.reason ?? null,
      order: unitIndex,
    });
  }

  return {
    ...holisticSourcePacket,
    candidateTimelineIndex: {
      ...(holisticSourcePacket?.candidateTimelineIndex ?? {}),
      candidates: recipeUnitTimelineCandidates,
      recipeBoundaryPlanApplied: true,
      skippedCandidates: recipeBoundaryPlan?.skippedCandidates ?? [],
      summary: {
        candidateCount: recipeUnitTimelineCandidates.length,
        sourceCandidateCount: timelineCandidates.length,
        skippedCandidateCount: recipeBoundaryPlan?.skippedCandidates?.length ?? 0,
        recipeBoundaryPlanApplied: true,
      },
    },
    candidateSourcePackets: recipeUnitPackets,
    recipeBoundaryPlan: {
      schemaVersion: recipeBoundaryPlan?.schemaVersion ?? 1,
      kind: recipeBoundaryPlan?.kind ?? "recipe-boundary-plan",
      recipeUnits: (recipeBoundaryPlan?.recipeUnits ?? []).map((unit) => ({
        recipeUnitId: unit.recipeUnitId,
        title: unit.title,
        candidateIds: unit.candidateIds,
        timeRange: unit.timeRange,
        stageSummary: unit.stageSummary,
        confidence: unit.confidence,
      })),
      skippedCandidates: recipeBoundaryPlan?.skippedCandidates ?? [],
      uncertainties: recipeBoundaryPlan?.uncertainties ?? [],
    },
  };
}

function buildCandidateScopedHolisticSourcePacket(holisticSourcePacket, candidatePacket, candidateTimelineEntry) {
  const eventIds = eventIdsForCandidate(candidatePacket, candidateTimelineEntry);
  const eventRefs = new Set([...eventIds].map((eventId) => `event:${eventId}`));
  const sourceEntries = candidatePacket?.sourceEntries ?? [];
  const entries = uniqueEntriesByRef([
    (holisticSourcePacket?.entries ?? []).find((entry) => entry.ref === "title"),
    ...sourceEntries,
    ...(holisticSourcePacket?.timelineEvents ?? []).filter((entry) => eventRefs.has(entry.ref)),
  ].filter(Boolean));
  const timelineEvents = entries.filter((entry) => entry.type === "timeline-event");
  const videoTimelineEvents = (holisticSourcePacket?.videoTimeline?.events ?? [])
    .filter((event) => eventIds.has(event.eventId));
  const scopedDescription = entries
    .filter((entry) => entry.type === "description")
    .map((entry) => entry.text)
    .filter(Boolean)
    .join("\n");
  return {
    ...holisticSourcePacket,
    video: {
      ...(holisticSourcePacket?.video ?? {}),
      description: scopedDescription,
    },
    entries,
    refs: entries.map((entry) => entry.ref),
    storyboard: [],
    videoTimeline: holisticSourcePacket?.videoTimeline ? {
      ...holisticSourcePacket.videoTimeline,
      events: videoTimelineEvents,
      summary: {
        ...(holisticSourcePacket.videoTimeline.summary ?? {}),
        eventCount: videoTimelineEvents.length,
        candidateScoped: true,
      },
    } : null,
    timelineEvents,
    candidateTimelineIndex: {
      ...(holisticSourcePacket?.candidateTimelineIndex ?? {}),
      candidates: candidateTimelineEntry ? [candidateTimelineEntry] : [],
      summary: {
        candidateCount: candidateTimelineEntry ? 1 : 0,
        candidateFirstScoped: true,
      },
    },
    candidateSourcePackets: candidatePacket ? [candidatePacket] : [],
  };
}

function candidateUnderstandingAuditForPrompt(videoUnderstandingAudit, candidateId, recipeSourceCandidateIds = []) {
  const sourceCandidateIdSet = new Set(recipeSourceCandidateIds);
  const storyAudits = (videoUnderstandingAudit?.storyAudits ?? [])
    .filter((story) => story?.candidateId === candidateId || sourceCandidateIdSet.has(story?.candidateId))
    .filter((story) => (story.supportedRefs ?? []).length > 0);
  if (storyAudits.length === 0) return null;
  return {
    schemaVersion: videoUnderstandingAudit.schemaVersion ?? 1,
    kind: "candidate-understanding-audit",
    candidateId,
    recipeSourceCandidateIds,
    summary: {
      storyCount: storyAudits.length,
      sourceBackedStoryCount: storyAudits.length,
      source: "video-understanding-audit",
      rawUnderstandingInjected: false,
    },
    storyAudits,
  };
}

function buildCandidateDraftPaths(paths, candidateId, index, { recipeBoundaryPlanEnabled = false } = {}) {
  const dir = path.join(
    recipeBoundaryPlanEnabled ? paths.recipeUnitDraftsDir : paths.candidateDraftsDir,
    `${String(index + 1).padStart(2, "0")}-${safeFileSegment(candidateId)}`,
  );
  return {
    dir,
    promptPath: path.join(dir, "prompt.txt"),
    commandPath: path.join(dir, "command.json"),
    rawPath: path.join(dir, "raw-response.json"),
    draftPath: path.join(dir, "draft.json"),
    failurePath: path.join(dir, "failure.json"),
  };
}

function candidateFirstSummarySkeleton({
  sourcePacket,
  maxCandidates,
  perCandidateTimeoutMs,
  totalTimeoutMs,
  recipeBoundaryPlanEnabled = false,
  recipeBoundaryPlan = null,
  recipeUnitWorkingMemoryEnabled = false,
  recipeUnitWorkingMemory = null,
  recipeUnitUnderstandingStateEnabled = false,
  recipeUnitUnderstandingState = null,
  recipeUnitUnderstandingStatePromptGuardEnabled = false,
  recipeUnitUnderstandingStatePromptMaxDeltaBytes = 4000,
}) {
  return {
    schemaVersion: 1,
    kind: "candidate-first-drafts",
    videoId: sourcePacket?.video?.videoId ?? null,
    mode: recipeBoundaryPlanEnabled ? "recipe-boundary-candidate-first-holistic-draft" : "candidate-first-holistic-draft",
    recipeBoundaryPlanEnabled,
    recipeUnitWorkingMemoryEnabled,
    recipeUnitUnderstandingStateEnabled,
    recipeUnitUnderstandingStatePromptGuardEnabled,
    recipeBoundaryPlanSummary: recipeBoundaryPlan ? {
      recipeUnitCount: recipeBoundaryPlan.recipeUnits?.length ?? 0,
      skippedCandidateCount: recipeBoundaryPlan.skippedCandidates?.length ?? 0,
      uncertainties: recipeBoundaryPlan.uncertainties ?? [],
    } : null,
    recipeUnitWorkingMemorySummary: recipeUnitWorkingMemory?.summary ?? null,
    recipeUnitUnderstandingStateSummary: recipeUnitUnderstandingState?.summary ?? null,
    budget: {
      maxCandidates,
      perCandidateTimeoutMs,
      totalTimeoutMs,
      recipeUnitUnderstandingStatePromptMaxDeltaBytes,
    },
    candidates: [],
    assembly: {
      recipeCount: 0,
      expectedRecipeCount: 0,
      mismatch: false,
    },
    errors: [],
  };
}

function assertCandidateDraftReadyForAssembly(draft, candidateId) {
  assertValidHolisticDraft(draft);
  if (draft.recipes.length !== 1) {
    throw new Error(`candidate_first_recipe_count_mismatch:${candidateId}: expected 1 recipe, got ${draft.recipes.length}`);
  }
  const recipe = draft.recipes[0];
  if (recipe.candidateId !== candidateId) {
    throw new Error(`candidate_first_candidate_id_mismatch:${candidateId}: got ${recipe.candidateId}`);
  }
  return recipe;
}

async function runCandidateFirstHolisticDraft({
  manifest,
  paths,
  sourcePacket,
  holisticSourcePacket,
  videoUnderstandingAudit,
  piTools,
  model,
  provider,
  thinking,
  dryRun,
  projectRoot,
  timeoutMs,
  executePiFn,
  maxCandidates,
  perCandidateTimeoutMs,
  totalTimeoutMs,
  recipeBoundaryPlanEnabled = false,
  recipeBoundaryPlan = null,
  recipeUnitWorkingMemoryEnabled = false,
  recipeUnitWorkingMemory = null,
  recipeUnitUnderstandingStateEnabled = false,
  recipeUnitUnderstandingState = null,
  recipeUnitUnderstandingStatePromptGuardEnabled = false,
  recipeUnitUnderstandingStatePromptMaxDeltaBytes = 4000,
}) {
  const candidatePackets = holisticSourcePacket?.candidateSourcePackets ?? [];
  const timelineCandidates = holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [];
  const summary = candidateFirstSummarySkeleton({
    sourcePacket,
    maxCandidates,
    perCandidateTimeoutMs,
    totalTimeoutMs,
    recipeBoundaryPlanEnabled,
    recipeBoundaryPlan,
    recipeUnitWorkingMemoryEnabled,
    recipeUnitWorkingMemory,
    recipeUnitUnderstandingStateEnabled,
    recipeUnitUnderstandingState,
    recipeUnitUnderstandingStatePromptGuardEnabled,
    recipeUnitUnderstandingStatePromptMaxDeltaBytes,
  });
  if (candidatePackets.length === 0) {
    summary.errors.push({
      code: "candidate_first_no_candidates",
      message: "candidateSourcePackets가 없어 candidate-first draft를 실행할 수 없다.",
    });
    await writeJsonTracked(manifest, paths.candidateDraftsPath, summary, "candidate-drafts-summary");
    throw new Error("candidate_first_no_candidates");
  }
  if (candidatePackets.length > maxCandidates) {
    summary.errors.push({
      code: "candidate_first_budget_exceeded",
      message: `candidate count ${candidatePackets.length} exceeds max ${maxCandidates}`,
    });
    await writeJsonTracked(manifest, paths.candidateDraftsPath, summary, "candidate-drafts-summary");
    throw new Error("candidate_first_budget_exceeded");
  }

  const startedAt = Date.now();
  const assembledRecipes = [];
  const promptParts = [];
  const rawParts = [];
  for (const [index, candidatePacket] of candidatePackets.entries()) {
    const candidateId = candidatePacket.candidateId;
    const candidateTimelineEntry = timelineCandidates.find((candidate) => candidate.candidateId === candidateId) ?? null;
    const candidatePaths = buildCandidateDraftPaths(paths, candidateId, index, { recipeBoundaryPlanEnabled });
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = totalTimeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      const failure = {
        candidateId,
        code: "candidate_first_budget_exceeded",
        message: "candidate-first total timeout budget was exhausted before this candidate",
      };
      summary.errors.push(failure);
      await writeJsonTracked(manifest, candidatePaths.failurePath, failure, `candidate-draft-failure:${candidateId}`);
      break;
    }
    const candidateTimeoutMs = Math.min(perCandidateTimeoutMs, remainingMs, timeoutMs);
    const candidateScopedSourcePacket = buildCandidateScopedHolisticSourcePacket(
      holisticSourcePacket,
      candidatePacket,
      candidateTimelineEntry,
    );
    const candidateUnderstandingAudit = candidateUnderstandingAuditForPrompt(
      videoUnderstandingAudit,
      candidateId,
      candidatePacket.recipeSourceCandidateIds ?? [],
    );
    const baseCandidatePrompt = buildCandidateFirstHolisticDraftPrompt(candidateScopedSourcePacket, {
      understandingAudit: candidateUnderstandingAudit,
      recipeUnitWorkingMemory: recipeUnitWorkingMemoryEnabled ? recipeUnitWorkingMemory : null,
    });
    const candidatePromptBytesBeforeUnderstandingState = Buffer.byteLength(baseCandidatePrompt, "utf8");
    let candidatePrompt = baseCandidatePrompt;
    let candidateIntegratedBriefPayload = null;
    let candidatePromptBytesAfterUnderstandingState = candidatePromptBytesBeforeUnderstandingState;
    let candidatePromptDeltaBytes = 0;
    let candidateIntegratedBriefInjected = false;
    let candidateIntegratedBriefBudgetExceeded = false;
    let candidateIntegratedBriefTruncated = false;
    let candidateIntegratedBriefFailOpen = false;
    let candidateIntegratedBriefBytes = 0;
    let candidateIntegratedBriefMaxBytes = 0;
    let candidateIntegratedBriefSource = null;
    let recipeUnitUnderstandingStatePromptInjected = false;
    let recipeUnitUnderstandingStatePromptBudgetExceeded = false;
    let recipeUnitUnderstandingStatePromptTruncated = false;
    let recipeUnitUnderstandingStatePromptFailOpen = false;
    let recipeUnitUnderstandingStatePromptBytes = 0;
    if (recipeUnitUnderstandingStateEnabled && recipeUnitUnderstandingStatePromptGuardEnabled) {
      const recipeUnitUnderstandingStatePayloadMaxBytes = Math.max(
        500,
        recipeUnitUnderstandingStatePromptMaxDeltaBytes - 2600,
      );
      candidateIntegratedBriefMaxBytes = recipeUnitUnderstandingStatePayloadMaxBytes;
      candidateIntegratedBriefPayload = buildCandidateIntegratedBrief({
        recipeUnitUnderstandingState,
        candidateId,
        recipeSourceCandidateIds: candidatePacket.recipeSourceCandidateIds ?? [],
        videoUnderstandingAudit,
        maxBytes: recipeUnitUnderstandingStatePayloadMaxBytes,
      });
      candidateIntegratedBriefBytes = candidateIntegratedBriefPayload?.bytes ?? 0;
      candidateIntegratedBriefTruncated = candidateIntegratedBriefPayload?.truncated === true;
      candidateIntegratedBriefSource = candidateIntegratedBriefPayload?.source ?? null;
      const promptWithUnderstandingState = candidateIntegratedBriefPayload?.brief
        ? buildCandidateFirstHolisticDraftPrompt(candidateScopedSourcePacket, {
          candidateIntegratedBrief: candidateIntegratedBriefPayload.brief,
          recipeUnitWorkingMemory: recipeUnitWorkingMemoryEnabled ? recipeUnitWorkingMemory : null,
        })
        : baseCandidatePrompt;
      candidatePromptBytesAfterUnderstandingState = Buffer.byteLength(promptWithUnderstandingState, "utf8");
      candidatePromptDeltaBytes = candidatePromptBytesAfterUnderstandingState - candidatePromptBytesBeforeUnderstandingState;
      candidateIntegratedBriefBudgetExceeded = candidateIntegratedBriefPayload?.budgetExceeded === true
        || candidatePromptDeltaBytes > recipeUnitUnderstandingStatePromptMaxDeltaBytes;
      if (candidateIntegratedBriefPayload?.brief && !candidateIntegratedBriefBudgetExceeded) {
        candidatePrompt = promptWithUnderstandingState;
        candidateIntegratedBriefInjected = true;
      } else {
        candidateIntegratedBriefFailOpen = true;
      }
      recipeUnitUnderstandingStatePromptInjected = candidateIntegratedBriefInjected;
      recipeUnitUnderstandingStatePromptBytes = candidateIntegratedBriefBytes;
      recipeUnitUnderstandingStatePromptBudgetExceeded = candidateIntegratedBriefBudgetExceeded;
      recipeUnitUnderstandingStatePromptTruncated = candidateIntegratedBriefTruncated;
      recipeUnitUnderstandingStatePromptFailOpen = candidateIntegratedBriefFailOpen;
    }
    promptParts.push(candidatePrompt);
    await writeTextTracked(manifest, candidatePaths.promptPath, `${candidatePrompt}\n`, `candidate-draft-prompt:${candidateId}`);
    addAllowedRead(manifest, candidatePaths.promptPath);
    const candidateCommand = buildPiCommand({
      promptPath: candidatePaths.promptPath,
      model,
      provider,
      thinking,
      tools: piTools,
    });
    manifest.stages.push({ name: "candidate-holistic-draft", candidateId, command: candidateCommand });
    await writeJsonTracked(manifest, candidatePaths.commandPath, {
      command: candidateCommand,
      note: piCommandNote(piTools),
      mode: recipeBoundaryPlanEnabled ? "recipe-boundary-candidate-first-holistic-draft" : "candidate-first-holistic-draft",
      candidateId,
      recipeSourceCandidateIds: candidatePacket.recipeSourceCandidateIds ?? [],
      timeoutMs: candidateTimeoutMs,
    }, `candidate-draft-command:${candidateId}`);
    const summaryEntry = {
      candidateId,
      recipeSourceCandidateIds: candidatePacket.recipeSourceCandidateIds ?? [],
      title: candidatePacket.title ?? candidateTimelineEntry?.title ?? null,
      status: dryRun ? "planned" : "pending",
      promptPath: path.relative(paths.outDir, candidatePaths.promptPath),
      commandPath: path.relative(paths.outDir, candidatePaths.commandPath),
      rawPath: path.relative(paths.outDir, candidatePaths.rawPath),
      draftPath: path.relative(paths.outDir, candidatePaths.draftPath),
      failurePath: path.relative(paths.outDir, candidatePaths.failurePath),
      sourceEntryCount: candidatePacket.sourceEntries?.length ?? 0,
      understandingAuditStoryCount: candidateUnderstandingAudit?.storyAudits?.length ?? 0,
      recipeUnitWorkingMemoryEnabled,
      recipeUnitWorkingMemoryBytes: recipeUnitWorkingMemoryEnabled
        ? Buffer.byteLength(JSON.stringify((recipeUnitWorkingMemory?.units ?? []).find((unit) => unit.recipeUnitId === candidateId) ?? {}), "utf8")
        : 0,
      recipeUnitWorkingMemoryPromptBytes: recipeUnitWorkingMemoryEnabled
        ? Buffer.byteLength(candidatePrompt.match(/\[RECIPE_UNIT_WORKING_MEMORY\][\s\S]*?\n\[CANDIDATE_SCOPED_HOLISTIC_SOURCE_PACKET\]/u)?.[0] ?? "", "utf8")
        : 0,
      recipeUnitUnderstandingStateEnabled,
      recipeUnitUnderstandingStatePromptGuardEnabled,
      recipeUnitUnderstandingStateBytes: recipeUnitUnderstandingStateEnabled
        ? Buffer.byteLength(JSON.stringify((recipeUnitUnderstandingState?.units ?? []).find((unit) => unit.recipeUnitId === candidateId) ?? {}), "utf8")
        : 0,
      recipeUnitUnderstandingStatePromptInjected,
      recipeUnitUnderstandingStatePromptBytes,
      recipeUnitUnderstandingStatePromptSection: candidateIntegratedBriefInjected ? "CANDIDATE_INTEGRATED_BRIEF" : null,
      candidateIntegratedBriefInjected,
      candidateIntegratedBriefBytes,
      candidateIntegratedBriefMaxBytes,
      candidateIntegratedBriefSource,
      candidateIntegratedBriefBudgetExceeded,
      candidateIntegratedBriefTruncated,
      candidateIntegratedBriefFailOpen,
      candidatePromptBytesBeforeUnderstandingState,
      candidatePromptBytesAfterUnderstandingState,
      candidatePromptActualBytes: Buffer.byteLength(candidatePrompt, "utf8"),
      candidatePromptDeltaBytes,
      recipeUnitUnderstandingStatePromptMaxDeltaBytes,
      recipeUnitUnderstandingStatePromptBudgetExceeded,
      recipeUnitUnderstandingStatePromptTruncated,
      recipeUnitUnderstandingStatePromptFailOpen,
      recipeCount: 0,
      timeoutMs: candidateTimeoutMs,
      reason: null,
    };
    summary.candidates.push(summaryEntry);
    if (dryRun) continue;

    try {
      manifest.currentStage = `candidate-holistic-draft:${candidateId}`;
      const candidateRawPayload = await readFixtureOrExecutePi({
        manifest,
        fixturePath: null,
        fixtureReason: `candidate-draft-fixture-response-json:${candidateId}`,
        command: candidateCommand,
        projectRoot,
        timeoutMs: candidateTimeoutMs,
        executePiFn,
      });
      rawParts.push(candidateRawPayload);
      await writeTextTracked(
        manifest,
        candidatePaths.rawPath,
        rawPayloadForDisk(candidateRawPayload),
        `candidate-draft-raw-response:${candidateId}`,
      );
      const candidateDraft = normalizeHolisticDraft(candidateRawPayload);
      const recipe = assertCandidateDraftReadyForAssembly(candidateDraft, candidateId);
      if ((candidatePacket.recipeSourceCandidateIds ?? []).length > 0) {
        recipe.recipeSourceCandidateIds = candidatePacket.recipeSourceCandidateIds;
      }
      assembledRecipes.push(recipe);
      await writeJsonTracked(manifest, candidatePaths.draftPath, candidateDraft, `candidate-draft-result:${candidateId}`);
      summaryEntry.status = "drafted";
      summaryEntry.recipeCount = candidateDraft.recipes.length;
    } catch (error) {
      summaryEntry.status = "failed";
      summaryEntry.reason = error instanceof Error ? error.message : String(error);
      const failure = {
        candidateId,
        code: "candidate_first_candidate_failed",
        message: summaryEntry.reason,
        stack: error instanceof Error ? error.stack : undefined,
        piExecution: error?.piExecution ?? null,
      };
      summary.errors.push(failure);
      await writeJsonTracked(manifest, candidatePaths.failurePath, failure, `candidate-draft-failure:${candidateId}`);
      break;
    }
  }

  summary.assembly.expectedRecipeCount = candidatePackets.length;
  summary.assembly.recipeCount = assembledRecipes.length;
  summary.assembly.mismatch = !dryRun && summary.assembly.recipeCount !== summary.assembly.expectedRecipeCount;
  if (summary.assembly.mismatch) {
    summary.errors.push({
      code: "candidate_first_assembly_mismatch",
      message: `assembled recipe count ${summary.assembly.recipeCount} did not match candidate count ${summary.assembly.expectedRecipeCount}`,
    });
  }
  await writeJsonTracked(manifest, paths.candidateDraftsPath, summary, "candidate-drafts-summary");
  if (dryRun) {
    return {
      draft: null,
      summary,
      promptText: promptParts.join("\n\n--- candidate draft prompt ---\n\n"),
      rawPayload: rawParts.join("\n"),
    };
  }
  if (summary.errors.length > 0) {
    throw new Error(summary.errors.map((entry) => entry.code).join(","));
  }
  const draft = normalizeHolisticDraft({
    recipes: assembledRecipes,
    globalUncertainties: summary.errors.map((entry) => entry.message),
  });
  assertValidHolisticDraft(draft);
  return {
    draft,
    summary,
    promptText: promptParts.join("\n\n--- candidate draft prompt ---\n\n"),
    rawPayload: rawParts.join("\n"),
  };
}

function buildStoryboardVisualTargetLedger({ sourcePacket, storyboardCandidateLedger, frameBudget }) {
  const candidates = storyboardCandidateLedger.candidates ?? [];
  const framesPerCandidate = Math.max(1, Math.ceil(Math.max(1, frameBudget) / Math.max(1, candidates.length)));
  return {
    ledger: {
      schemaVersion: 1,
      kind: "visual-target-ledger",
      videoId: sourcePacket?.video?.videoId ?? null,
      targets: candidates.map((candidate, index) => ({
        targetId: `${candidate.candidateId}:storyboard`,
        candidateId: candidate.candidateId,
        targetType: "candidate_visual_recall",
        ingredient: `storyboard-${index + 1}`,
        reason: "holistic draft needs a lightweight storyboard for this recipe timeline section",
        sourceEvidence: candidate.evidence ?? ["title"],
        textCues: [candidate.title, candidate.titleHint, sourcePacket?.video?.title].filter(Boolean),
        preferredTimeRanges: [],
        candidateTimeRange: candidate.timeRange,
        fallbackPolicy: "candidate-visual-recall-sweep",
      })),
      skippedTargets: [],
      summary: {
        totalTargets: candidates.length,
        skippedTargets: 0,
        visualTargetAllowedCount: candidates.length,
      },
    },
    framesPerCandidate,
  };
}

async function runHolisticPiExtractionCase({
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
  visualFrames,
  visualFrameCount,
  visualFramesPerRange,
  visualSecondsPerCandidate,
  visualAllowFallbackRanges,
  visualDescriptionOnlySweepFrames,
  visualMaxFramesPerTarget,
  visualEstimatesEnabled,
  visualEstimateMaxFrames,
  visualTimeoutMs,
  holisticResponseJsonPath,
  holisticRepairResponseJsonPath,
  holisticVideoTimelineResponseJsonPath,
  holisticUnderstandingResponseJsonPath,
  holisticRecipeBoundaryResponseJsonPath,
  holisticStoryboardFrameCount,
  holisticTimelineUnderstanding,
  holisticVideoTimelineLedger,
  holisticIntegratedUnderstanding,
  holisticVideoTimelineMaxSegments,
  holisticVideoTimelineMaxWindowsPerSegment,
  holisticVideoTimelineMaxTotalFrames,
  holisticTimelineFrameBudget,
  holisticStoryboardMaxCandidates,
  holisticMaxTargetsPerRecipe,
  holisticMaxTotalTargets,
  holisticVisualTargetMaxWindowSec,
  holisticVisualRepairEnabled,
  holisticCandidateFirstDraft,
  holisticRecipeBoundaryPlan,
  holisticRecipeUnitWorkingMemory,
  holisticRecipeUnitUnderstandingState,
  holisticRecipeUnitUnderstandingStatePromptGuard,
  holisticRecipeUnitUnderstandingStatePromptMaxDeltaBytes,
  holisticCandidateFirstMaxCandidates,
  holisticCandidateFirstDraftTimeoutMs,
  holisticCandidateFirstTotalTimeoutMs,
  holisticVideoUnderstandingTimeoutMs,
  ytDlpBin,
  ffmpegBin,
  frameExtractorScript,
  frameExtractorPythonBin,
  projectRoot,
  timeoutMs,
  executePiFn,
  executeVisualCommandFn,
  collectVisualLedgerFn,
  collectVisualEstimatesFn,
}) {
  manifest.mode = "holistic-draft";
  manifest.promptVersion = HOLISTIC_PROMPT_VERSION;
  manifest.stages = [];

  const effectiveStoryboardFrameBudget = holisticTimelineUnderstanding
    ? recommendHolisticTimelineFrameBudget(sourcePacket, {
      enableTimelineUnderstanding: true,
      configuredFrameBudget: holisticTimelineFrameBudget,
    })
    : holisticStoryboardFrameCount;
  const storyboardCandidateLedger = buildHolisticStoryboardCandidateLedger(sourcePacket, {
    maxCandidates: holisticStoryboardMaxCandidates,
    enableTimelineUnderstanding: holisticTimelineUnderstanding,
    frameBudget: effectiveStoryboardFrameBudget,
    coarseAsWholeRecipeCandidate: holisticVideoTimelineLedger && !holisticCandidateFirstDraft,
  });
  const candidateFirstDraftActive = holisticCandidateFirstDraft
    && holisticVideoTimelineLedger
    && storyboardCandidateLedger.candidates.length > 1;
  const recipeBoundaryPlanActive = holisticRecipeBoundaryPlan && candidateFirstDraftActive;
  const multiCandidateTimelineLedgerFallback = holisticVideoTimelineLedger
    && storyboardCandidateLedger.candidates.length > 1
    && !candidateFirstDraftActive;
  const effectiveHolisticVideoTimelineLedger = holisticVideoTimelineLedger && !multiCandidateTimelineLedgerFallback;
  const shouldRunHolisticIntegratedUnderstanding = holisticIntegratedUnderstanding;
  const effectiveHolisticIntegratedUnderstanding = holisticIntegratedUnderstanding
    && !multiCandidateTimelineLedgerFallback
    && !candidateFirstDraftActive;
  const effectiveHolisticMaxTargetsPerRecipe = multiCandidateTimelineLedgerFallback
    ? Math.max(holisticMaxTargetsPerRecipe, 3)
    : holisticMaxTargetsPerRecipe;
  const effectiveHolisticMaxTotalTargets = multiCandidateTimelineLedgerFallback
    ? Math.max(holisticMaxTotalTargets, 12)
    : holisticMaxTotalTargets;
  const effectiveHolisticVisualRepairEnabled = multiCandidateTimelineLedgerFallback
    ? true
    : holisticVisualRepairEnabled;
  let storyboardFramesPerCandidate = 1;
  let storyboardLedger = null;
  let timelineFramePlan = null;
  let timelineFrameLedger = null;
  let videoTimeline = null;
  let candidateTimelineIndex = null;
  let videoUnderstanding = null;
  let videoUnderstandingUsage = null;
  let videoUnderstandingAudit = null;
  let videoUnderstandingPrompt = null;
  let videoUnderstandingRawPayload = null;
  let recipeBoundaryPrompt = null;
  let recipeBoundaryRawPayload = null;
  let recipeBoundaryPlan = null;

  if (effectiveHolisticVideoTimelineLedger) {
    timelineFramePlan = buildTimelineFramePlan(sourcePacket, {
      maxSegments: holisticVideoTimelineMaxSegments,
      maxWindowsPerSegment: holisticVideoTimelineMaxWindowsPerSegment,
      maxTotalFrames: holisticVideoTimelineMaxTotalFrames ?? effectiveStoryboardFrameBudget,
    });
    await writeJsonTracked(manifest, paths.timelineFramePlanPath, timelineFramePlan, "timeline-frame-plan");
    const timelineCandidateLedger = buildTimelineCandidateLedger(timelineFramePlan);
    storyboardFramesPerCandidate = framesPerTimelineWindow(timelineFramePlan);
    storyboardLedger = dryRun || !visualFrames
      ? buildVisualLedger({ sourcePacket, candidateLedger: timelineCandidateLedger })
      : await collectVisualLedgerFn({
        sourcePacket,
        candidateLedger: timelineCandidateLedger,
        projectRoot,
        cacheRoot: path.join(paths.visualCacheRoot, "video-timeline-ledger"),
        manifest,
        model,
        provider,
        thinking,
        ytDlpBin,
        ffmpegBin,
        frameCount: storyboardFramesPerCandidate,
        framesPerRange: 1,
        secondsPerCandidate: visualSecondsPerCandidate,
        maxCandidates: null,
        allowFallbackRanges: true,
        frameExtractorScript,
        frameExtractorPythonBin,
        timeoutMs: visualTimeoutMs,
        executeCommandFn: executeVisualCommandFn,
        executePiFn,
      });
    timelineFrameLedger = buildTimelineFrameLedger({
      sourcePacket,
      timelineFramePlan,
      visualLedger: storyboardLedger,
    });
    await writeJsonTracked(manifest, paths.timelineFrameLedgerPath, timelineFrameLedger, "timeline-frame-ledger");
    const videoTimelinePrompt = buildVideoTimelinePrompt({
      sourcePacket,
      recipeCandidateLedger: storyboardCandidateLedger,
      timelineFramePlan,
      timelineFrameLedger,
    });
    await writeTextTracked(manifest, paths.videoTimelinePromptPath, `${videoTimelinePrompt}\n`, "video-timeline-prompt");
    addAllowedRead(manifest, paths.videoTimelinePromptPath);
    const videoTimelineCommand = buildPiCommand({ promptPath: paths.videoTimelinePromptPath, model, provider, thinking, tools: piTools });
    manifest.stages.push({ name: "video-timeline", command: videoTimelineCommand });
    await writeJsonTracked(manifest, paths.videoTimelineCommandPath, {
      command: videoTimelineCommand,
      note: piCommandNote(piTools),
      mode: "video-timeline",
    }, "video-timeline-command");
    const videoTimelineAllowedEvidenceRefs = timelineAllowedEvidenceRefs({ sourcePacket, timelineFrameLedger });
    if (dryRun) {
      videoTimeline = normalizeVideoTimeline({ events: [], errors: ["dry-run"] }, { videoId: sourcePacket?.video?.videoId ?? null });
    } else {
      manifest.currentStage = "video-timeline";
      const videoTimelineRawPayload = await readFixtureOrExecutePi({
        manifest,
        fixturePath: holisticVideoTimelineResponseJsonPath,
        fixtureReason: "video-timeline-fixture-response-json",
        command: videoTimelineCommand,
        projectRoot,
        timeoutMs,
        executePiFn,
      });
      await writeTextTracked(
        manifest,
        paths.videoTimelineRawPath,
        rawPayloadForDisk(videoTimelineRawPayload),
        "video-timeline-raw-response",
      );
      videoTimeline = normalizeVideoTimeline(videoTimelineRawPayload, {
        videoId: sourcePacket?.video?.videoId ?? null,
        sourcePacket,
      });
    }
    const timelineEvidenceRefRepair = repairVideoTimelineEvidenceRefs(videoTimeline, {
      allowedEvidenceRefs: videoTimelineAllowedEvidenceRefs,
    });
    videoTimeline = timelineEvidenceRefRepair.timeline;
    manifest.holisticVideoTimelineEvidenceRefRepairSummary = timelineEvidenceRefRepair.repairLog.summary;
    manifest.holistic.videoTimelineEvidenceRefRepair = timelineEvidenceRefRepair.repairLog.summary;
    await writeJsonTracked(
      manifest,
      paths.timelineEvidenceRefRepairPath,
      timelineEvidenceRefRepair.repairLog,
      "timeline-evidence-ref-repair",
    );
    await writeJsonTracked(
      manifest,
      paths.timelineDroppedEventsPath,
      {
        schemaVersion: 1,
        kind: "timeline-dropped-events",
        videoId: videoTimeline.videoId ?? null,
        summary: {
          droppedEventCount: timelineEvidenceRefRepair.droppedEvents.length,
        },
        events: timelineEvidenceRefRepair.droppedEvents,
      },
      "timeline-dropped-events",
    );
    if (!dryRun) {
      assertValidVideoTimeline(videoTimeline, {
        allowedCandidateIds: storyboardCandidateLedger.candidates.map((candidate) => candidate.candidateId),
        allowedEvidenceRefs: videoTimelineAllowedEvidenceRefs,
      });
    }
    await writeJsonTracked(manifest, paths.videoTimelinePath, videoTimeline, "video-timeline");
    candidateTimelineIndex = buildCandidateTimelineIndex({
      recipeCandidateLedger: storyboardCandidateLedger,
      videoTimeline,
    });
    assertValidCandidateTimelineIndex(candidateTimelineIndex);
    await writeJsonTracked(manifest, paths.candidateTimelineIndexPath, candidateTimelineIndex, "candidate-timeline-index");
  } else {
    const storyboardTargets = buildStoryboardVisualTargetLedger({
      sourcePacket,
      storyboardCandidateLedger,
      frameBudget: effectiveStoryboardFrameBudget,
    });
    storyboardFramesPerCandidate = storyboardTargets.framesPerCandidate;
    storyboardLedger = dryRun || !visualFrames
      ? buildVisualLedger({ sourcePacket, candidateLedger: storyboardCandidateLedger })
      : await collectVisualLedgerFn({
        sourcePacket,
        candidateLedger: storyboardCandidateLedger,
        visualTargetLedger: storyboardTargets.ledger,
        projectRoot,
        cacheRoot: path.join(paths.visualCacheRoot, "holistic-storyboard"),
        manifest,
        model,
        provider,
        thinking,
        ytDlpBin,
        ffmpegBin,
        frameCount: storyboardFramesPerCandidate,
        framesPerRange: 1,
        secondsPerCandidate: visualSecondsPerCandidate,
        maxCandidates: null,
        allowFallbackRanges: true,
        frameExtractorScript,
        frameExtractorPythonBin,
        descriptionOnlySweepFrames: storyboardTargets.framesPerCandidate,
        maxFramesPerTarget: storyboardTargets.framesPerCandidate,
        timeoutMs: visualTimeoutMs,
        executeCommandFn: executeVisualCommandFn,
        executePiFn,
      });
  }

  await writeJsonTracked(manifest, paths.holisticStoryboardLedgerPath, storyboardLedger, "holistic-storyboard-ledger");
  manifest.holisticStoryboardCandidateCount = storyboardCandidateLedger.candidates.length;
  manifest.holisticStoryboardFrameBudget = effectiveStoryboardFrameBudget;
  manifest.holisticStoryboardFramesPerCandidate = storyboardFramesPerCandidate;
  manifest.holisticTimelineUnderstandingEnabled = holisticTimelineUnderstanding;
  manifest.holisticVideoTimelineLedgerRequested = holisticVideoTimelineLedger;
  manifest.holisticVideoTimelineLedgerEnabled = effectiveHolisticVideoTimelineLedger;
  manifest.holisticVideoTimelineLedgerFallback = multiCandidateTimelineLedgerFallback;
  manifest.holisticIntegratedUnderstandingRequested = holisticIntegratedUnderstanding;
  manifest.holisticIntegratedUnderstandingStageEnabled = shouldRunHolisticIntegratedUnderstanding;
  manifest.holisticIntegratedUnderstandingEnabled = effectiveHolisticIntegratedUnderstanding;
  manifest.holisticVideoUnderstandingTimeoutCount = 0;
  manifest.holisticVideoUnderstandingFailureCount = 0;
  manifest.holisticCandidateFirstDraftRequested = holisticCandidateFirstDraft;
  manifest.holisticCandidateFirstDraftEnabled = candidateFirstDraftActive;
  manifest.holisticRecipeBoundaryPlanRequested = holisticRecipeBoundaryPlan;
  manifest.holisticRecipeBoundaryPlanEnabled = recipeBoundaryPlanActive;
  manifest.holisticRecipeUnitWorkingMemoryRequested = holisticRecipeUnitWorkingMemory;
  manifest.holisticRecipeUnitWorkingMemoryEnabled = false;
  manifest.holisticRecipeUnitUnderstandingStateRequested = holisticRecipeUnitUnderstandingState;
  manifest.holisticRecipeUnitUnderstandingStateEnabled = false;
  manifest.holistic.videoTimelineLedgerEffective = effectiveHolisticVideoTimelineLedger;
  manifest.holistic.videoTimelineLedgerFallback = multiCandidateTimelineLedgerFallback;
  manifest.holistic.integratedUnderstandingStageEnabled = shouldRunHolisticIntegratedUnderstanding;
  manifest.holistic.integratedUnderstandingEffective = effectiveHolisticIntegratedUnderstanding;
  manifest.holistic.videoUnderstandingTimeoutMs = holisticVideoUnderstandingTimeoutMs;
  manifest.holistic.videoUnderstandingTimeoutCount = 0;
  manifest.holistic.videoUnderstandingFailureCount = 0;
  manifest.holistic.candidateFirstDraft = {
    requested: holisticCandidateFirstDraft,
    enabled: candidateFirstDraftActive,
    maxCandidates: holisticCandidateFirstMaxCandidates,
    perCandidateTimeoutMs: holisticCandidateFirstDraftTimeoutMs,
    totalTimeoutMs: holisticCandidateFirstTotalTimeoutMs,
  };
  manifest.holistic.recipeBoundaryPlan = {
    requested: holisticRecipeBoundaryPlan,
    enabled: recipeBoundaryPlanActive,
  };
  manifest.holistic.recipeUnitWorkingMemory = {
    requested: holisticRecipeUnitWorkingMemory,
    enabled: false,
  };
  manifest.holistic.recipeUnitUnderstandingState = {
    requested: holisticRecipeUnitUnderstandingState,
    enabled: false,
  };
  manifest.holistic.visualRepairEffective = effectiveHolisticVisualRepairEnabled;
  const holisticSourcePacket = buildHolisticSourcePacket(sourcePacket, storyboardLedger, {
    includeStoryboardEntries: !effectiveHolisticVideoTimelineLedger,
    videoTimeline,
    candidateTimelineIndex,
  });
  let holisticDraftSourcePacket = holisticSourcePacket;
  let recipeUnitWorkingMemory = null;
  let recipeUnitUnderstandingState = null;
  await writeJsonTracked(manifest, paths.holisticSourcePacketPath, holisticSourcePacket, "holistic-source-packet");
  if (shouldRunHolisticIntegratedUnderstanding) {
    videoUnderstandingPrompt = buildVideoUnderstandingPrompt(holisticSourcePacket, {
      timelineMode: effectiveHolisticVideoTimelineLedger,
    });
    await writeTextTracked(manifest, paths.videoUnderstandingPromptPath, `${videoUnderstandingPrompt}\n`, "video-understanding-prompt");
    addAllowedRead(manifest, paths.videoUnderstandingPromptPath);
    const videoUnderstandingCommand = buildPiCommand({
      promptPath: paths.videoUnderstandingPromptPath,
      model,
      provider,
      thinking,
      tools: piTools,
    });
    manifest.stages.push({ name: "video-understanding", command: videoUnderstandingCommand });
    await writeJsonTracked(manifest, paths.videoUnderstandingCommandPath, {
      command: videoUnderstandingCommand,
      note: piCommandNote(piTools),
      mode: "video-understanding",
      timeoutMs: holisticVideoUnderstandingTimeoutMs,
    }, "video-understanding-command");
    if (dryRun) {
      videoUnderstanding = normalizeVideoUnderstanding({
        globalStory: "dry-run video understanding placeholder",
        dishStories: [],
        uncertainties: ["dry-run"],
      }, { videoId: sourcePacket?.video?.videoId ?? null });
    } else {
      manifest.currentStage = "video-understanding";
      try {
        videoUnderstandingRawPayload = await readFixtureOrExecutePi({
          manifest,
          fixturePath: holisticUnderstandingResponseJsonPath,
          fixtureReason: "video-understanding-fixture-response-json",
          command: videoUnderstandingCommand,
          projectRoot,
          timeoutMs: holisticVideoUnderstandingTimeoutMs,
          executePiFn,
        });
        await writeTextTracked(
          manifest,
          paths.videoUnderstandingRawPath,
          rawPayloadForDisk(videoUnderstandingRawPayload),
          "video-understanding-raw-response",
        );
        videoUnderstanding = normalizeVideoUnderstanding(videoUnderstandingRawPayload, {
          videoId: sourcePacket?.video?.videoId ?? null,
        });
        assertValidVideoUnderstanding(videoUnderstanding);
      } catch (error) {
        if (!error?.piExecution) throw error;
        const timedOut = error.piExecution.timedOut === true;
        const reason = timedOut ? "video_understanding_timeout" : "video_understanding_failed";
        const failure = {
          schemaVersion: 1,
          kind: "video-understanding-failure",
          videoId: sourcePacket?.video?.videoId ?? null,
          reason,
          message: error instanceof Error ? error.message : String(error),
          piExecution: error.piExecution,
        };
        await writeJsonTracked(manifest, paths.videoUnderstandingFailurePath, failure, "video-understanding-failure");
        manifest.holisticVideoUnderstandingFailure = {
          reason,
          timedOut,
          timeoutMs: holisticVideoUnderstandingTimeoutMs,
        };
        manifest.holisticVideoUnderstandingFailureCount = 1;
        manifest.holisticVideoUnderstandingTimeoutCount = timedOut ? 1 : 0;
        manifest.holistic.videoUnderstandingFailureCount = 1;
        manifest.holistic.videoUnderstandingTimeoutCount = timedOut ? 1 : 0;
        manifest.holistic.videoUnderstandingFailure = manifest.holisticVideoUnderstandingFailure;
        videoUnderstanding = normalizeVideoUnderstanding({
          globalStory: "",
          dishStories: [],
          uncertainties: [reason],
        }, {
          videoId: sourcePacket?.video?.videoId ?? null,
        });
      }
      if (!videoUnderstanding) {
        videoUnderstanding = normalizeVideoUnderstanding({
          globalStory: "",
          dishStories: [],
          uncertainties: ["video_understanding_unavailable"],
        }, {
          videoId: sourcePacket?.video?.videoId ?? null,
        });
      }
      assertValidVideoUnderstanding(videoUnderstanding);
    }
    if (manifest.holisticVideoUnderstandingFailure) {
      videoUnderstandingUsage = {
        schemaVersion: 1,
        kind: "video-understanding-usage",
        usable: false,
        acceptedStoryCount: 0,
        rejectedStoryCount: 0,
        rejectedStories: [],
        allowedRefCount: 0,
        candidateScoped: Boolean(holisticSourcePacket?.candidateTimelineIndex?.candidates?.length),
        reason: manifest.holisticVideoUnderstandingFailure.reason,
      };
      videoUnderstandingAudit = {
        schemaVersion: 1,
        kind: "video-understanding-audit",
        summary: {
          storyCount: 0,
          orientationStoryCount: 0,
          logOnlyStoryCount: 0,
          allowedRefCount: 0,
          candidateScoped: Boolean(holisticSourcePacket?.candidateTimelineIndex?.candidates?.length),
          candidateInjectionDisabled: true,
          failureReason: manifest.holisticVideoUnderstandingFailure.reason,
        },
        storyAudits: [],
      };
    } else {
      const selectedVideoUnderstanding = selectUsableVideoUnderstanding(videoUnderstanding, holisticSourcePacket, {
        forceLogOnly: !effectiveHolisticIntegratedUnderstanding,
        logOnlyReason: candidateFirstDraftActive
          ? "candidate_first_uses_audit_only"
          : multiCandidateTimelineLedgerFallback
          ? "multi_candidate_understanding_injection_disabled"
          : "understanding_injection_disabled",
      });
      videoUnderstanding = selectedVideoUnderstanding.understanding;
      videoUnderstandingUsage = selectedVideoUnderstanding.usage;
      videoUnderstandingAudit = selectedVideoUnderstanding.audit;
    }
    manifest.holisticIntegratedUnderstandingUsable = videoUnderstandingUsage.usable;
    manifest.holisticVideoUnderstandingUsage = videoUnderstandingUsage;
    manifest.holisticVideoUnderstandingAudit = videoUnderstandingAudit?.summary ?? null;
    manifest.holistic.integratedUnderstandingUsable = videoUnderstandingUsage.usable;
    manifest.holistic.videoUnderstandingUsage = videoUnderstandingUsage;
    manifest.holistic.videoUnderstandingAudit = videoUnderstandingAudit?.summary ?? null;
    await writeJsonTracked(manifest, paths.videoUnderstandingPath, videoUnderstanding, "video-understanding");
    await writeJsonTracked(manifest, paths.videoUnderstandingUsagePath, videoUnderstandingUsage, "video-understanding-usage");
    await writeJsonTracked(manifest, paths.videoUnderstandingAuditPath, videoUnderstandingAudit, "video-understanding-audit");
  }
  if (recipeBoundaryPlanActive) {
    recipeBoundaryPrompt = buildRecipeBoundaryPlanPrompt(holisticSourcePacket, {
      videoUnderstandingAudit,
    });
    await writeTextTracked(manifest, paths.recipeBoundaryPromptPath, `${recipeBoundaryPrompt}\n`, "recipe-boundary-prompt");
    addAllowedRead(manifest, paths.recipeBoundaryPromptPath);
    const recipeBoundaryCommand = buildPiCommand({
      promptPath: paths.recipeBoundaryPromptPath,
      model,
      provider,
      thinking,
      tools: [],
    });
    manifest.stages.push({ name: "recipe-boundary-plan", command: recipeBoundaryCommand });
    await writeJsonTracked(manifest, paths.recipeBoundaryCommandPath, {
      command: recipeBoundaryCommand,
      note: piCommandNote([]),
      mode: "recipe-boundary-plan",
      candidateCount: holisticSourcePacket?.candidateTimelineIndex?.candidates?.length ?? 0,
    }, "recipe-boundary-command");
    try {
      const boundaryCandidates = holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [];
      if (dryRun) {
        recipeBoundaryPlan = buildDryRunRecipeBoundaryPlan(holisticSourcePacket);
      } else {
        manifest.currentStage = "recipe-boundary-plan";
        recipeBoundaryRawPayload = await readFixtureOrExecutePi({
          manifest,
          fixturePath: holisticRecipeBoundaryResponseJsonPath,
          fixtureReason: "recipe-boundary-fixture-response-json",
          command: recipeBoundaryCommand,
          projectRoot,
          timeoutMs,
          executePiFn,
        });
        await writeTextTracked(
          manifest,
          paths.recipeBoundaryRawPath,
          rawPayloadForDisk(recipeBoundaryRawPayload),
          "recipe-boundary-raw-response",
        );
        recipeBoundaryPlan = normalizeRecipeBoundaryPlan(recipeBoundaryRawPayload, {
          videoId: sourcePacket?.video?.videoId ?? null,
          candidates: boundaryCandidates,
        });
      }
      assertValidRecipeBoundaryPlan(recipeBoundaryPlan, {
        allowedCandidateIds: boundaryCandidates.map((candidate) => candidate.candidateId),
        allowedEvidenceRefs: boundaryAllowedEvidenceRefs({ sourcePacket, holisticSourcePacket, timelineFrameLedger }),
      });
      await writeJsonTracked(manifest, paths.recipeBoundaryPlanPath, recipeBoundaryPlan, "recipe-boundary-plan");
      holisticDraftSourcePacket = buildRecipeUnitHolisticSourcePacket(holisticSourcePacket, recipeBoundaryPlan);
      manifest.holisticRecipeBoundaryPlanSummary = {
        recipeUnitCount: recipeBoundaryPlan.recipeUnits.length,
        skippedCandidateCount: recipeBoundaryPlan.skippedCandidates.length,
        sourceCandidateCount: boundaryCandidates.length,
        uncertainties: recipeBoundaryPlan.uncertainties,
      };
      manifest.holistic.recipeBoundaryPlan.summary = manifest.holisticRecipeBoundaryPlanSummary;
    } catch (error) {
      const failure = {
        code: "recipe_boundary_plan_failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      await writeJsonTracked(manifest, paths.recipeBoundaryFailurePath, failure, "recipe-boundary-failure");
      throw new Error(failure.message);
    }
  }
  if (recipeBoundaryPlanActive && holisticRecipeUnitWorkingMemory) {
    recipeUnitWorkingMemory = buildRecipeUnitWorkingMemory(holisticDraftSourcePacket, {
      videoUnderstandingAudit,
    });
    await writeJsonTracked(
      manifest,
      paths.recipeUnitWorkingMemoryPath,
      recipeUnitWorkingMemory,
      "recipe-unit-working-memory",
    );
    manifest.holisticRecipeUnitWorkingMemoryEnabled = true;
    manifest.holisticRecipeUnitWorkingMemorySummary = recipeUnitWorkingMemory.summary;
    manifest.holistic.recipeUnitWorkingMemory = {
      requested: true,
      enabled: true,
      summary: recipeUnitWorkingMemory.summary,
    };
  }
  if (recipeBoundaryPlanActive && holisticRecipeUnitUnderstandingState) {
    if (!recipeUnitWorkingMemory) {
      recipeUnitWorkingMemory = buildRecipeUnitWorkingMemory(holisticDraftSourcePacket, {
        videoUnderstandingAudit,
      });
      await writeJsonTracked(
        manifest,
        paths.recipeUnitWorkingMemoryPath,
        recipeUnitWorkingMemory,
        "recipe-unit-working-memory",
      );
      manifest.holisticRecipeUnitWorkingMemoryEnabled = true;
      manifest.holisticRecipeUnitWorkingMemorySummary = recipeUnitWorkingMemory.summary;
      manifest.holistic.recipeUnitWorkingMemory = {
        requested: holisticRecipeUnitWorkingMemory,
        enabled: true,
        summary: recipeUnitWorkingMemory.summary,
      };
    }
    recipeUnitUnderstandingState = buildRecipeUnitUnderstandingState({
      recipeUnitWorkingMemory,
      holisticSourcePacket: holisticDraftSourcePacket,
      videoUnderstanding,
      videoUnderstandingAudit,
    });
    await writeJsonTracked(
      manifest,
      paths.recipeUnitUnderstandingStatePath,
      recipeUnitUnderstandingState,
      "recipe-unit-understanding-state",
    );
    manifest.holisticRecipeUnitUnderstandingStateEnabled = true;
    manifest.holisticRecipeUnitUnderstandingStateSummary = recipeUnitUnderstandingState.summary;
    manifest.holistic.recipeUnitUnderstandingState = {
      requested: true,
      enabled: true,
      summary: recipeUnitUnderstandingState.summary,
    };
  }
  await writeJsonTracked(
    manifest,
    paths.holisticDraftSourcePacketPath,
    holisticDraftSourcePacket,
    "holistic-draft-source-packet",
  );
  let holisticDraftPrompt = "";
  let holisticRawPayload = "";
  let candidateFirstSummary = null;
  let draft = null;
  if (candidateFirstDraftActive) {
    const draftDirLabel = recipeBoundaryPlanActive ? "recipe-unit-drafts/<recipeUnitId>" : "candidate-drafts/<candidateId>";
    const assemblyPrompt = [
      recipeBoundaryPlanActive ? "recipe-boundary candidate-first holistic draft mode" : "candidate-first holistic draft mode",
      `후보별 prompt/raw/draft는 ${draftDirLabel}/ 아래에 저장된다.`,
      "이 파일은 기존 cache hash와 디버깅 경로 호환을 위한 조립 메모다.",
    ].join("\n");
    await writeTextTracked(manifest, paths.holisticDraftPromptPath, `${assemblyPrompt}\n`, "holistic-draft-prompt");
    await writeJsonTracked(manifest, paths.holisticDraftCommandPath, {
      note: `candidate-first mode writes one command per draft unit under ${draftDirLabel}/command.json`,
      mode: recipeBoundaryPlanActive ? "recipe-boundary-candidate-first-holistic-draft" : "candidate-first-holistic-draft",
      allowFetchContent,
      sourcePacketOnly,
      recipeBoundaryPlanEnabled: recipeBoundaryPlanActive,
    }, "holistic-draft-command");
    const candidateFirstResult = await runCandidateFirstHolisticDraft({
      manifest,
      paths,
      sourcePacket,
      holisticSourcePacket: holisticDraftSourcePacket,
      videoUnderstandingAudit,
      piTools,
      model,
      provider,
      thinking,
      dryRun,
      projectRoot,
      timeoutMs,
      executePiFn,
      maxCandidates: holisticCandidateFirstMaxCandidates,
      perCandidateTimeoutMs: holisticCandidateFirstDraftTimeoutMs,
      totalTimeoutMs: holisticCandidateFirstTotalTimeoutMs,
      recipeBoundaryPlanEnabled: recipeBoundaryPlanActive,
      recipeBoundaryPlan,
      recipeUnitWorkingMemoryEnabled: Boolean(recipeUnitWorkingMemory),
      recipeUnitWorkingMemory,
      recipeUnitUnderstandingStateEnabled: Boolean(recipeUnitUnderstandingState) && holisticRecipeUnitUnderstandingStatePromptGuard,
      recipeUnitUnderstandingState,
      recipeUnitUnderstandingStatePromptGuardEnabled: Boolean(recipeUnitUnderstandingState) && holisticRecipeUnitUnderstandingStatePromptGuard,
      recipeUnitUnderstandingStatePromptMaxDeltaBytes: holisticRecipeUnitUnderstandingStatePromptMaxDeltaBytes,
    });
    holisticDraftPrompt = candidateFirstResult.promptText;
    holisticRawPayload = candidateFirstResult.rawPayload;
    candidateFirstSummary = candidateFirstResult.summary;
    manifest.holisticCandidateFirstDraftSummary = {
      candidateCount: candidateFirstSummary.candidates.length,
      draftedCount: candidateFirstSummary.candidates.filter((candidate) => candidate.status === "drafted").length,
      errorCount: candidateFirstSummary.errors.length,
      assembly: candidateFirstSummary.assembly,
    };
    if (dryRun) {
      manifest.phase = "holistic-dry-run-completed";
      return;
    }
    draft = candidateFirstResult.draft;
    await writeTextTracked(
      manifest,
      paths.holisticDraftRawPath,
      rawPayloadForDisk(holisticRawPayload),
      "holistic-draft-raw-response",
    );
    await writeJsonTracked(manifest, paths.holisticDraftPath, draft, "holistic-draft");
  } else {
    holisticDraftPrompt = buildHolisticDraftPrompt(holisticDraftSourcePacket, {
      timelineMode: effectiveHolisticVideoTimelineLedger,
      videoUnderstanding: videoUnderstandingUsage?.usable && effectiveHolisticIntegratedUnderstanding ? videoUnderstanding : null,
      understandingAudit: videoUnderstandingUsage?.usable && effectiveHolisticIntegratedUnderstanding ? videoUnderstandingAudit : null,
    });
    await writeTextTracked(manifest, paths.holisticDraftPromptPath, `${holisticDraftPrompt}\n`, "holistic-draft-prompt");
    addAllowedRead(manifest, paths.holisticDraftPromptPath);
    const holisticCommand = buildPiCommand({ promptPath: paths.holisticDraftPromptPath, model, provider, thinking, tools: piTools });
    manifest.stages.push({ name: "holistic-draft", command: holisticCommand });
    await writeJsonTracked(manifest, paths.holisticDraftCommandPath, {
      command: holisticCommand,
      note: piCommandNote(piTools),
      mode: "holistic-draft",
      allowFetchContent,
      sourcePacketOnly,
    }, "holistic-draft-command");

    if (dryRun) {
      manifest.phase = "holistic-dry-run-completed";
      return;
    }

    manifest.currentStage = "holistic-draft";
    holisticRawPayload = await readFixtureOrExecutePi({
      manifest,
      fixturePath: holisticResponseJsonPath,
      fixtureReason: "holistic-fixture-response-json",
      command: holisticCommand,
      projectRoot,
      timeoutMs,
      executePiFn,
    });
    await writeTextTracked(
      manifest,
      paths.holisticDraftRawPath,
      rawPayloadForDisk(holisticRawPayload),
      "holistic-draft-raw-response",
    );
    draft = normalizeHolisticDraft(holisticRawPayload);
    assertValidHolisticDraft(draft);
    await writeJsonTracked(manifest, paths.holisticDraftPath, draft, "holistic-draft");
  }

  const candidateLedger = buildHolisticCandidateLedger({ draft, sourcePacket });
  await writeJsonTracked(manifest, paths.candidateLedgerPath, candidateLedger, "candidate-ledger");
  const visualTargetLedger = buildHolisticVisualTargetLedger({
    draft,
    sourcePacket,
    maxTargetsPerRecipe: effectiveHolisticMaxTargetsPerRecipe,
    maxTotalTargets: effectiveHolisticMaxTotalTargets,
    maxWindowSec: holisticVisualTargetMaxWindowSec,
    includeSparseRecallTargets: !effectiveHolisticVideoTimelineLedger,
    amountTargetsOnly: effectiveHolisticVideoTimelineLedger,
  });
  await writeJsonTracked(manifest, paths.holisticVisualNeedsPath, visualTargetLedger, "holistic-visual-needs");
  await writeJsonTracked(manifest, paths.visualTargetLedgerPath, visualTargetLedger, "visual-target-ledger");

  const targetVisualLedger = visualFrames && visualTargetLedger.targets.length > 0
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
      maxCandidates: effectiveHolisticMaxTotalTargets,
      allowFallbackRanges: visualAllowFallbackRanges,
      frameExtractorScript,
      frameExtractorPythonBin,
      descriptionOnlySweepFrames: visualDescriptionOnlySweepFrames,
      maxFramesPerTarget: visualMaxFramesPerTarget,
      timeoutMs: visualTimeoutMs,
      executeCommandFn: executeVisualCommandFn,
      executePiFn,
    })
    : buildVisualLedger({ sourcePacket, candidateLedger });
  await writeJsonTracked(manifest, paths.visualLedgerPath, targetVisualLedger, "visual-ledger");

  const visualEstimates = visualFrames && visualEstimatesEnabled && visualTargetLedger.targets.length > 0
    ? await collectVisualEstimatesFn({
      visualTargetLedger,
      visualLedger: targetVisualLedger,
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
    : emptyVisualEstimates(sourcePacket?.video?.videoId ?? null);
  await writeJsonTracked(manifest, paths.visualEstimatesPath, visualEstimates, "visual-estimates");

  let repairDraft = draft;
  let repairPrompt = null;
  let repairRawPayload = null;
  const shouldRunVisualRepair = effectiveHolisticVisualRepairEnabled && visualFrames && visualLedgerFrameCount(targetVisualLedger) > 0;
  const visualRepairTimeoutMs = Math.max(timeoutMs, visualTimeoutMs, 6 * 60 * 1000);
  if (shouldRunVisualRepair) {
    repairPrompt = buildHolisticVisualRepairPrompt({
      draft,
      holisticSourcePacket,
      visualLedger: targetVisualLedger,
    });
    await writeTextTracked(manifest, paths.holisticVisualRepairPromptPath, `${repairPrompt}\n`, "holistic-visual-repair-prompt");
    addAllowedRead(manifest, paths.holisticVisualRepairPromptPath);
    const repairCommand = buildPiCommand({ promptPath: paths.holisticVisualRepairPromptPath, model, provider, thinking, tools: piTools });
    manifest.stages.push({ name: "holistic-visual-repair", command: repairCommand });
    await writeJsonTracked(manifest, paths.holisticVisualRepairCommandPath, {
      command: repairCommand,
      note: piCommandNote(piTools),
      mode: "holistic-visual-repair",
    }, "holistic-visual-repair-command");
    manifest.currentStage = "holistic-visual-repair";
    repairRawPayload = await readFixtureOrExecutePi({
      manifest,
      fixturePath: holisticRepairResponseJsonPath,
      fixtureReason: "holistic-repair-fixture-response-json",
      command: repairCommand,
      projectRoot,
      timeoutMs: visualRepairTimeoutMs,
      executePiFn,
    });
    await writeTextTracked(
      manifest,
      paths.holisticVisualRepairRawPath,
      rawPayloadForDisk(repairRawPayload),
      "holistic-visual-repair-raw-response",
    );
    repairDraft = normalizeHolisticDraft(repairRawPayload);
    assertValidHolisticDraft(repairDraft);
    await writeJsonTracked(manifest, paths.holisticVisualRepairResultPath, repairDraft, "holistic-visual-repair-result");
  }

  const auditVisualLedger = mergeVisualLedgers(sourcePacket, [storyboardLedger, targetVisualLedger]);
  const audit = auditHolisticDraft({
    draft: repairDraft,
    holisticSourcePacket,
    visualLedger: auditVisualLedger,
    visualEstimates,
  });
  await writeJsonTracked(manifest, paths.holisticEvidenceAuditPath, audit, "holistic-evidence-audit");
  let finalOutput = buildFinalOutputFromHolisticAudit(audit);
  let recipeUnitDraftSelfAudit = null;
  if (recipeUnitUnderstandingState) {
    const demotionResult = applyRecipeUnitUnderstandingDemotion(finalOutput, recipeUnitUnderstandingState);
    finalOutput = demotionResult.output;
    recipeUnitDraftSelfAudit = demotionResult.selfAudit;
    await writeJsonTracked(
      manifest,
      paths.recipeUnitDraftSelfAuditPath,
      recipeUnitDraftSelfAudit,
      "recipe-unit-draft-self-audit",
    );
    manifest.holisticRecipeUnitDraftSelfAuditSummary = recipeUnitDraftSelfAudit?.summary ?? null;
    if (recipeUnitDraftSelfAudit?.summary?.failedAfterDemotion) {
      throw new Error("recipe_unit_draft_self_audit_failed");
    }
  }
  let unitConsistencyAudit = null;
  if (recipeBoundaryPlanActive && recipeBoundaryPlan) {
    unitConsistencyAudit = auditRecipeUnitConsistency(finalOutput, { recipeBoundaryPlan });
    const warningCodeCounts = unitConsistencyAudit.warnings.reduce((counts, warning) => {
      const code = warning.code ?? "unknown";
      counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {});
    const unitConsistencySummary = {
      schemaVersion: 1,
      kind: "unit-consistency-summary",
      videoId: unitConsistencyAudit.videoId,
      ...unitConsistencyAudit.summary,
      warningCodeCounts,
    };
    await writeJsonTracked(manifest, paths.unitConsistencyAuditPath, unitConsistencyAudit, "unit-consistency-audit");
    await writeJsonTracked(manifest, paths.unitConsistencySummaryPath, unitConsistencySummary, "unit-consistency-summary");
    manifest.holisticUnitConsistencySummary = unitConsistencySummary;
  }
  const finalPrompt = buildHolisticFinalPrompt({ draft: repairDraft, audit, visualEstimates });
  await writeTextTracked(manifest, paths.holisticFinalPromptPath, `${finalPrompt}\n`, "holistic-final-prompt");
  const contract = validateFinalVisualEvidenceContract(finalOutput, {
    visualLedger: auditVisualLedger,
    visualEstimates,
    auditMode: false,
  });
  assertValidPiRecipeOutput(contract.output);
  await writeJsonTracked(manifest, paths.holisticFinalResultPath, contract.output, "holistic-final-result");
  await writeJsonTracked(manifest, paths.resultPath, { videoId: manifest.videoId, ...contract.output }, "result");
  await writeCacheManifest(manifest, paths.cacheManifestPath, {
    cachePolicy: "holistic raw response, storyboard ledger, target ledgers, and final audit are stored in the run directory",
    promptHashes: {
      ...(videoUnderstandingPrompt ? { videoUnderstanding: hashText(videoUnderstandingPrompt) } : {}),
      ...(recipeBoundaryPrompt ? { recipeBoundaryPlan: hashText(recipeBoundaryPrompt) } : {}),
      holisticDraft: hashText(holisticDraftPrompt),
      holisticFinal: hashText(finalPrompt),
    },
    rawResponseHashes: {
      ...(videoUnderstandingRawPayload ? { videoUnderstanding: hashText(videoUnderstandingRawPayload) } : {}),
      ...(recipeBoundaryRawPayload ? { recipeBoundaryPlan: hashText(recipeBoundaryRawPayload) } : {}),
      holisticDraft: hashText(holisticRawPayload),
      ...(repairRawPayload ? { holisticVisualRepair: hashText(repairRawPayload) } : {}),
    },
    visualRepair: {
      enabled: shouldRunVisualRepair,
      promptHash: repairPrompt ? hashText(repairPrompt) : null,
      defaultDisabledByTimelineLedger: effectiveHolisticVideoTimelineLedger && !effectiveHolisticVisualRepairEnabled,
    },
    visual: {
      enabled: visualFrames,
      storyboardFrameCount: visualLedgerFrameCount(storyboardLedger),
      storyboardFrameBudget: effectiveStoryboardFrameBudget,
      storyboardFramesPerCandidate,
      storyboardCandidateCount: storyboardCandidateLedger.candidates.length,
      timelineUnderstandingEnabled: holisticTimelineUnderstanding,
      videoTimelineLedgerRequested: holisticVideoTimelineLedger,
      videoTimelineLedgerEnabled: effectiveHolisticVideoTimelineLedger,
      videoTimelineLedgerFallback: multiCandidateTimelineLedgerFallback,
      candidateFirstDraftRequested: holisticCandidateFirstDraft,
      candidateFirstDraftEnabled: candidateFirstDraftActive,
      recipeBoundaryPlanRequested: holisticRecipeBoundaryPlan,
      recipeBoundaryPlanEnabled: recipeBoundaryPlanActive,
      recipeBoundaryPlanSummary: recipeBoundaryPlan ? {
        recipeUnitCount: recipeBoundaryPlan.recipeUnits.length,
        skippedCandidateCount: recipeBoundaryPlan.skippedCandidates.length,
        uncertainties: recipeBoundaryPlan.uncertainties,
      } : null,
      recipeUnitWorkingMemoryRequested: holisticRecipeUnitWorkingMemory,
      recipeUnitWorkingMemoryEnabled: Boolean(recipeUnitWorkingMemory),
      recipeUnitWorkingMemorySummary: recipeUnitWorkingMemory?.summary ?? null,
      recipeUnitUnderstandingStateRequested: holisticRecipeUnitUnderstandingState,
      recipeUnitUnderstandingStateEnabled: Boolean(recipeUnitUnderstandingState),
      recipeUnitUnderstandingStatePromptGuardEnabled: Boolean(recipeUnitUnderstandingState) && holisticRecipeUnitUnderstandingStatePromptGuard,
      recipeUnitUnderstandingStatePromptMaxDeltaBytes: holisticRecipeUnitUnderstandingStatePromptMaxDeltaBytes,
      recipeUnitUnderstandingStateSummary: recipeUnitUnderstandingState?.summary ?? null,
      recipeUnitDraftSelfAuditSummary: recipeUnitDraftSelfAudit?.summary ?? null,
      candidateFirstDraftSummary: candidateFirstSummary ? {
        candidateCount: candidateFirstSummary.candidates.length,
        draftedCount: candidateFirstSummary.candidates.filter((candidate) => candidate.status === "drafted").length,
        errorCount: candidateFirstSummary.errors.length,
        assembly: candidateFirstSummary.assembly,
      } : null,
      integratedUnderstandingRequested: holisticIntegratedUnderstanding,
      integratedUnderstandingStageEnabled: shouldRunHolisticIntegratedUnderstanding,
      integratedUnderstandingEnabled: effectiveHolisticIntegratedUnderstanding,
      integratedUnderstandingUsable: videoUnderstandingUsage?.usable ?? null,
      videoUnderstandingUsage: videoUnderstandingUsage ? {
        acceptedStoryCount: videoUnderstandingUsage.acceptedStoryCount,
        rejectedStoryCount: videoUnderstandingUsage.rejectedStoryCount,
        reason: videoUnderstandingUsage.reason,
      } : null,
      videoUnderstandingAudit: videoUnderstandingAudit?.summary ?? null,
      videoUnderstandingSummary: videoUnderstanding ? {
        dishStoryCount: videoUnderstanding.dishStories.length,
        hasGlobalStory: Boolean(videoUnderstanding.globalStory),
      } : null,
      timelineFramePlanSummary: timelineFramePlan?.summary ?? null,
      videoTimelineSummary: videoTimeline?.summary ?? null,
      candidateTimelineIndexSummary: candidateTimelineIndex?.summary ?? null,
      timelineSource: storyboardCandidateLedger.summary?.timelineSource ?? null,
      targetFrameCount: visualLedgerFrameCount(targetVisualLedger),
      targetCount: visualTargetLedger.targets.length,
      skippedTargetCount: visualTargetLedger.skippedTargets?.length ?? 0,
      estimateCount: visualEstimates.visualEstimates.length,
      errors: auditVisualLedger.errors ?? [],
    },
    evidenceAudit: audit.summary,
  });

  manifest.phase = "completed";
  manifest.recipeCount = contract.output.recipes.length;
  manifest.ingredientCount = contract.output.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  manifest.stepCount = contract.output.recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
  manifest.visualEvidenceContractFailureCount = contract.failureCount;
  manifest.visualEvidenceContractWarnings = contract.warnings;
  manifest.needsInvestigation = contract.failureCount > 0;
  manifest.holisticEvidenceAudit = audit.summary;
  manifest.holisticVisualTargetCount = visualTargetLedger.targets.length;
  manifest.holisticVisualEstimateCount = visualEstimates.visualEstimates.length;
  manifest.holisticVisualRepairEnabled = shouldRunVisualRepair;
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
  visualMaxTotalTargetsPerCase,
  visualMaxFramesPerTarget,
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
    rawPayloadForDisk(candidateRawPayload),
    "candidate-raw-response",
  );
  const candidateOutput = applyGenericCandidateRepair({
    candidateOutput: normalizePiRecipeCandidates(parsePiRawOutput(candidateRawPayload)),
    sourcePacket,
  });
  assertValidPiRecipeCandidates(candidateOutput);
  await writeJsonTracked(manifest, paths.candidateResultPath, candidateOutput, "candidate-result");
  const candidateLedger = buildCandidateLedger({ sourcePacket, candidateOutput });
  const sourceDraft = buildSourceDraft({ sourcePacket, candidateLedger });
  const gapLedger = buildGapLedger({ sourceDraft });
  const visualTargetLedger = buildVisualTargetLedger({
    sourcePacket,
    candidateLedger,
    gapLedger,
    maxRanges: visualTargetMaxRanges,
    windowBeforeSec: visualWindowBeforeSec,
    windowAfterSec: visualWindowAfterSec,
    descriptionOnlySweep: visualDescriptionOnlySweep,
    maxTargetsPerCandidate: visualMaxTargetsPerCandidate,
    maxTotalTargetsPerCase: visualMaxTotalTargetsPerCase,
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
      maxFramesPerTarget: visualMaxFramesPerTarget,
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
  const evidencePackets = buildEvidencePackets({
    sourcePacket,
    candidateLedger,
    visualLedger,
    visualTargetLedger,
    visualEstimates,
    sourceDraft,
    gapLedger,
  });
  await writeJsonTracked(manifest, paths.candidateLedgerPath, candidateLedger, "candidate-ledger");
  await writeJsonTracked(manifest, paths.sourceDraftPath, sourceDraft, "source-draft");
  await writeJsonTracked(manifest, paths.gapLedgerPath, gapLedger, "gap-ledger");
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
      maxFramesPerTarget: visualMaxFramesPerTarget,
      targetCount: visualTargetLedger.targets.length,
      skippedTargetCount: visualTargetLedger.skippedTargets?.length ?? 0,
      gapAllowedTargetCount: gapLedger.summary.visualTargetAllowedCount,
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
      rawPayloadForDisk(detailRawPayload),
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
  const contract = validateFinalVisualEvidenceContract(finalOutput, {
    visualLedger,
    visualEstimates,
    auditMode: false,
  });
  assertValidPiRecipeOutput(contract.output);
  await writeJsonTracked(manifest, paths.resultPath, { videoId: manifest.videoId, ...contract.output }, "result");
  manifest.phase = "completed";
  manifest.candidateCount = candidateOutput.candidates.length;
  manifest.recipeCount = contract.output.recipes.length;
  manifest.ingredientCount = contract.output.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  manifest.stepCount = contract.output.recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0);
  manifest.visualEvidenceContractFailureCount = contract.failureCount;
  manifest.visualEvidenceContractWarnings = contract.warnings;
  manifest.needsInvestigation = contract.failureCount > 0;
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
  const mode = typeof args.mode === "string" ? args.mode : staged ? "staged" : "single";
  if (!["single", "staged", "holistic-draft"].includes(mode)) {
    throw new Error(`unknown pi extraction mode: ${mode}`);
  }
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
  const visualMaxTargetsPerCandidate = optionalNumber(args["visual-max-targets-per-candidate"], 4);
  const visualMaxTotalTargetsPerCase = optionalNumber(args["visual-max-total-targets-per-case"], 16);
  const visualEstimatesEnabled = args["visual-estimates"] !== false;
  const visualEstimateMaxFrames = optionalNumber(args["visual-estimate-max-frames"], 6);
  const visualMaxFramesPerTarget = optionalNumber(args["visual-max-frames-per-target"], visualEstimateMaxFrames);
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
  const holisticResponseJsonPath = typeof args["holistic-response-json"] === "string"
    ? path.resolve(projectRoot, args["holistic-response-json"])
    : responseJsonPath;
  const holisticRepairResponseJsonPath = typeof args["holistic-repair-response-json"] === "string"
    ? path.resolve(projectRoot, args["holistic-repair-response-json"])
    : null;
  const holisticVideoTimelineResponseJsonPath = typeof args["holistic-video-timeline-response-json"] === "string"
    ? path.resolve(projectRoot, args["holistic-video-timeline-response-json"])
    : null;
  const holisticUnderstandingResponseJsonPath = typeof args["holistic-understanding-response-json"] === "string"
    ? path.resolve(projectRoot, args["holistic-understanding-response-json"])
    : null;
  const holisticRecipeBoundaryResponseJsonPath = typeof args["holistic-recipe-boundary-response-json"] === "string"
    ? path.resolve(projectRoot, args["holistic-recipe-boundary-response-json"])
    : null;
  const maxCaptionSegments = optionalNumber(args["max-caption-segments"], null);
  const maxDescriptionChars = optionalNumber(args["max-description-chars"], 16000);
  const compactSourcePacket = args["compact-source-packet"] === true;
  const maxAuthorComments = optionalNumber(args["max-author-comments"], compactSourcePacket ? 0 : 10);
  const holisticStoryboardFrameCountArg = optionalNumber(args["holistic-storyboard-frame-count"], null);
  const holisticStoryboardFrameCount = holisticStoryboardFrameCountArg ?? 8;
  const holisticVideoTimelineLedger = args["holistic-enable-video-timeline-ledger"] === true;
  const holisticTimelineUnderstanding = args["holistic-enable-timeline-understanding"] === true || holisticVideoTimelineLedger;
  const holisticIntegratedUnderstanding = args["holistic-enable-integrated-understanding"] === true;
  const holisticTimelineFrameBudget = optionalNumber(args["holistic-timeline-frame-budget"], holisticStoryboardFrameCountArg);
  const holisticStoryboardMaxCandidates = optionalNumber(args["holistic-storyboard-max-candidates"], 8);
  const holisticVideoTimelineMaxSegments = optionalNumber(args["holistic-video-timeline-max-segments"], 8);
  const holisticVideoTimelineMaxWindowsPerSegment = optionalNumber(args["holistic-video-timeline-max-windows-per-segment"], 3);
  const holisticVideoTimelineMaxTotalFrames = optionalNumber(args["holistic-video-timeline-max-total-frames"], holisticTimelineFrameBudget);
  const holisticMaxTargetsPerRecipe = optionalNumber(
    args["holistic-max-targets-per-recipe"],
    holisticVideoTimelineLedger ? 2 : 3,
  );
  const holisticMaxTotalTargets = optionalNumber(
    args["holistic-max-total-targets"],
    holisticVideoTimelineLedger ? 4 : 12,
  );
  const holisticVisualTargetMaxWindowSec = optionalNumber(args["holistic-visual-target-max-window-sec"], 16);
  const holisticVisualRepairEnabled = holisticVideoTimelineLedger
    ? args["holistic-enable-visual-repair"] === true
    : args["holistic-disable-visual-repair"] !== true;
  const holisticCandidateFirstDraft = args["holistic-enable-candidate-first-draft"] === true;
  const holisticRecipeBoundaryPlan = args["holistic-enable-recipe-boundary-plan"] === true;
  const holisticRecipeUnitWorkingMemory = args["holistic-enable-recipe-unit-working-memory"] === true;
  const holisticRecipeUnitUnderstandingState = args["holistic-enable-recipe-unit-understanding-state"] === true;
  const holisticRecipeUnitUnderstandingStatePromptGuardExplicit = args["holistic-enable-recipe-unit-understanding-state-prompt-guard"] === true;
  const holisticRecipeUnitUnderstandingStatePromptGuardDisabled = args["holistic-disable-recipe-unit-understanding-state-prompt-guard"] === true;
  const holisticRecipeUnitUnderstandingStatePromptGuardDefault = holisticRecipeUnitUnderstandingState
    && holisticCandidateFirstDraft
    && holisticRecipeBoundaryPlan;
  const holisticRecipeUnitUnderstandingStatePromptGuard = !holisticRecipeUnitUnderstandingStatePromptGuardDisabled
    && (holisticRecipeUnitUnderstandingStatePromptGuardExplicit || holisticRecipeUnitUnderstandingStatePromptGuardDefault);
  const holisticRecipeUnitUnderstandingStatePromptMaxDeltaBytes = optionalNumber(
    args["holistic-recipe-unit-understanding-state-prompt-max-delta-bytes"],
    4000,
  );
  const holisticCandidateFirstMaxCandidates = optionalNumber(args["holistic-candidate-first-max-candidates"], 8);
  const holisticCandidateFirstDraftTimeoutMs = optionalNumber(
    args["holistic-candidate-first-draft-timeout-ms"],
    75 * 1000,
  );
  const holisticCandidateFirstTotalTimeoutMs = optionalNumber(
    args["holistic-candidate-first-total-timeout-ms"],
    600 * 1000,
  );
  const holisticVideoUnderstandingTimeoutMs = optionalNumber(
    args["holistic-video-understanding-timeout-ms"],
    Math.min(timeoutMs, 120 * 1000),
  );
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
    if (holisticResponseJsonPath) allowedReads.push(holisticResponseJsonPath);
    if (holisticRepairResponseJsonPath) allowedReads.push(holisticRepairResponseJsonPath);
    if (holisticVideoTimelineResponseJsonPath) allowedReads.push(holisticVideoTimelineResponseJsonPath);
    if (holisticUnderstandingResponseJsonPath) allowedReads.push(holisticUnderstandingResponseJsonPath);
    if (holisticRecipeBoundaryResponseJsonPath) allowedReads.push(holisticRecipeBoundaryResponseJsonPath);
    const manifest = createAccessManifest({ projectRoot, allowedReads });
    Object.assign(manifest, {
      runner: "scripts/pi-extractor/run-pi-extraction.mjs",
      promptVersion: mode === "holistic-draft" ? HOLISTIC_PROMPT_VERSION : PROMPT_VERSION,
      split,
      videoId: id,
      outTag,
      dryRun,
      mode,
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
      holistic: {
        enabled: mode === "holistic-draft",
        storyboardFrameCount: holisticStoryboardFrameCount,
        timelineUnderstandingEnabled: holisticTimelineUnderstanding,
        videoTimelineLedgerEnabled: holisticVideoTimelineLedger,
        integratedUnderstandingEnabled: holisticIntegratedUnderstanding,
        timelineFrameBudget: holisticTimelineFrameBudget,
        storyboardMaxCandidates: holisticStoryboardMaxCandidates,
        videoTimelineMaxSegments: holisticVideoTimelineMaxSegments,
        videoTimelineMaxWindowsPerSegment: holisticVideoTimelineMaxWindowsPerSegment,
        videoTimelineMaxTotalFrames: holisticVideoTimelineMaxTotalFrames,
        maxTargetsPerRecipe: holisticMaxTargetsPerRecipe,
        maxTotalTargets: holisticMaxTotalTargets,
        visualTargetMaxWindowSec: holisticVisualTargetMaxWindowSec,
        visualRepairEnabled: holisticVisualRepairEnabled,
        candidateFirstDraftEnabled: holisticCandidateFirstDraft,
        recipeBoundaryPlanEnabled: holisticRecipeBoundaryPlan,
        candidateFirstMaxCandidates: holisticCandidateFirstMaxCandidates,
        candidateFirstDraftTimeoutMs: holisticCandidateFirstDraftTimeoutMs,
        candidateFirstTotalTimeoutMs: holisticCandidateFirstTotalTimeoutMs,
      },
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
        maxTotalTargetsPerCase: visualMaxTotalTargetsPerCase,
        maxFramesPerTarget: visualMaxFramesPerTarget,
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
      if (mode === "holistic-draft") {
        await runHolisticPiExtractionCase({
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
          visualFrames,
          visualFrameCount,
          visualFramesPerRange,
          visualSecondsPerCandidate,
          visualAllowFallbackRanges,
          visualDescriptionOnlySweepFrames,
          visualMaxFramesPerTarget,
          visualEstimatesEnabled,
          visualEstimateMaxFrames,
          visualTimeoutMs,
          holisticResponseJsonPath,
          holisticRepairResponseJsonPath,
          holisticVideoTimelineResponseJsonPath,
          holisticUnderstandingResponseJsonPath,
          holisticRecipeBoundaryResponseJsonPath,
          holisticStoryboardFrameCount,
          holisticTimelineUnderstanding,
          holisticVideoTimelineLedger,
          holisticIntegratedUnderstanding,
          holisticVideoTimelineMaxSegments,
          holisticVideoTimelineMaxWindowsPerSegment,
          holisticVideoTimelineMaxTotalFrames,
          holisticTimelineFrameBudget,
          holisticStoryboardMaxCandidates,
          holisticMaxTargetsPerRecipe,
          holisticMaxTotalTargets,
          holisticVisualTargetMaxWindowSec,
          holisticVisualRepairEnabled,
          holisticCandidateFirstDraft,
          holisticRecipeBoundaryPlan,
          holisticRecipeUnitWorkingMemory,
          holisticRecipeUnitUnderstandingState,
          holisticRecipeUnitUnderstandingStatePromptGuard,
          holisticRecipeUnitUnderstandingStatePromptMaxDeltaBytes,
          holisticCandidateFirstMaxCandidates,
          holisticCandidateFirstDraftTimeoutMs,
          holisticCandidateFirstTotalTimeoutMs,
          holisticVideoUnderstandingTimeoutMs,
          ytDlpBin,
          ffmpegBin,
          frameExtractorScript,
          frameExtractorPythonBin,
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
          console.log(`[DRY-RUN] pi holistic ${split}/${id}: holistic prompt + manifest 작성`);
        } else {
          console.log(
            `[OK] pi holistic ${split}/${id}: 레시피 ${manifest.recipeCount}, 재료 ${manifest.ingredientCount}, 단계 ${manifest.stepCount}, visual target ${manifest.holisticVisualTargetCount ?? 0}`,
          );
        }
        continue;
      }
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
          visualMaxTotalTargetsPerCase,
          visualMaxFramesPerTarget,
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

      await writeTextTracked(manifest, paths.rawPath, rawPayloadForDisk(rawPayload), "pi-raw-response");
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
