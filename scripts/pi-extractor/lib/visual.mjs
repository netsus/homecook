import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { addAllowedRead, recordRead, recordWrite } from "./access-guard.mjs";
import { parsePiRawOutput } from "./schema.mjs";

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function optionalNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSectionTime(seconds) {
  const safe = Math.max(0, Math.floor(optionalNumber(seconds, 0)));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  return [hh, mm, ss].map((part) => String(part).padStart(2, "0")).join(":");
}

function relative(projectRoot, filePath) {
  return path.relative(projectRoot, filePath);
}

function safeFileSegment(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9가-힣_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "unknown";
}

function commandError(message, details) {
  const error = new Error(message);
  error.commandExecution = details;
  return error;
}

export async function executeCommand(command, { cwd, timeoutMs }) {
  const [bin, ...args] = command;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(bin, args, {
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
      reject(commandError(error.message, {
        code: error.code ?? null,
        signal: null,
        killed: false,
        timedOut,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 20000),
        command,
        timeoutMs,
      }));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      reject(commandError(`Command failed: ${command.join(" ")}`, {
        code,
        signal,
        killed: timedOut,
        timedOut,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 20000),
        command,
        timeoutMs,
      }));
    });
  });
}

export function buildVisualPiCommand({
  piBin = process.env.PI_BIN || "pi",
  model,
  provider = null,
  thinking = null,
  framePaths,
}) {
  const prompt = [
    "아래 이미지는 같은 유튜브 레시피 영상에서 추출한 프레임이다.",
    "보이는 음식/재료/화면 자막/계량 단서만 JSON으로 답한다.",
    "추측 레시피 지식으로 채우지 말고, 보이지 않으면 빈 배열을 쓴다.",
    "스키마: {\"observed\":[\"재료 또는 음식\"],\"onscreenText\":[\"화면 글자\"],\"quantityCues\":[\"계량 단서\"],\"confidence\":0.0}",
  ].join("\n");
  const command = [
    piBin,
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-session",
    "--mode",
    "json",
    "--print",
    "--no-tools",
  ];
  if (provider) command.push("--provider", provider);
  if (model) command.push("--model", model);
  if (thinking) command.push("--thinking", thinking);
  command.push(...framePaths.map((filePath) => `@${filePath}`), prompt);
  return command;
}

export function buildVisualEstimatePiCommand({
  piBin = process.env.PI_BIN || "pi",
  model,
  provider = null,
  thinking = null,
  target,
  framePaths,
}) {
  const frameRefs = framePaths.map((filePath, index) => `frame:${target.candidateId}:${safeFileSegment(target.ingredient)}:${index + 1} = ${path.basename(filePath)}`);
  const prompt = [
    "아래 이미지는 같은 유튜브 레시피 영상에서 재료 하나의 양을 추정하기 위해 뽑은 프레임이다.",
    `대상 재료: ${target.ingredient}`,
    `candidateId: ${target.candidateId}`,
    `targetId: ${target.targetId}`,
    `프레임 참조: ${frameRefs.join(" / ")}`,
    target.textCues?.length ? `텍스트 단서: ${target.textCues.join(" / ")}` : "텍스트 단서: 없음",
    "",
    "해야 할 일:",
    "- 이 프레임 묶음에서 대상 재료의 양만 추정한다.",
    "- 계량컵, 숟가락, 병, 손, 그릇, 팬, 채워진 정도, 붓는/바르는 동작 같은 기준이 보일 때만 amount/unit을 채운다.",
    "- 기준 물체나 target 재료가 보이지 않으면 amount, unit, amountBasis는 null이다.",
    "- 일반 레시피 지식이나 정답 추측으로 채우지 않는다.",
    "- confidence는 0~1이며 visual-estimate는 보통 낮게 둔다.",
    "",
    "출력은 설명 없이 JSON 객체 하나만 반환한다. 스키마:",
    JSON.stringify({
      ingredient: target.ingredient,
      amount: "약 1 또는 null",
      unit: "큰술 또는 null",
      amountBasis: "visual-estimate 또는 null",
      confidence: 0.45,
      evidence: [`frame:${target.candidateId}:${safeFileSegment(target.ingredient)}:1`],
      reason: "기준 물체/채워진 정도/붓거나 바르는 동작을 근거로 한 짧은 설명",
      uncertainties: ["불확실한 점"],
    }, null, 2),
  ].join("\n");
  const command = [
    piBin,
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-session",
    "--mode",
    "json",
    "--print",
    "--no-tools",
  ];
  if (provider) command.push("--provider", provider);
  if (model) command.push("--model", model);
  if (thinking) command.push("--thinking", thinking);
  command.push(...framePaths.map((filePath) => `@${filePath}`), prompt);
  return { command, prompt };
}

function normalizeVisualOutput(value) {
  const parsed = parsePiRawOutput(value) ?? {};
  return {
    observed: uniqueStrings(Array.isArray(parsed.observed) ? parsed.observed : []),
    onscreenText: uniqueStrings(Array.isArray(parsed.onscreenText) ? parsed.onscreenText : []),
    quantityCues: uniqueStrings(Array.isArray(parsed.quantityCues) ? parsed.quantityCues : []),
    confidence: Math.max(0, Math.min(1, optionalNumber(parsed.confidence, 0.5))),
  };
}

function candidateTimeWindow(candidate, secondsPerCandidate) {
  const range = candidate.timeRange ?? {};
  const rangeStart = optionalNumber(range.startSec, 0);
  const rangeEnd = optionalNumber(range.endSec, rangeStart + secondsPerCandidate);
  const available = Math.max(4, rangeEnd - rangeStart);
  const duration = Math.min(secondsPerCandidate, available);
  const start = rangeStart + Math.max(0, (available - duration) * 0.35);
  const end = start + duration;
  return { start, end };
}

async function findClipFile(cacheDir) {
  const entries = await readdir(cacheDir);
  const clip = entries.find((entry) => entry.startsWith("clip.") && !entry.endsWith(".part"));
  return clip ? path.join(cacheDir, clip) : null;
}

async function findFrameFiles(cacheDir) {
  const entries = await readdir(cacheDir);
  return entries
    .filter((entry) => /^frame-\d+\.jpg$/u.test(entry))
    .sort()
    .map((entry) => path.join(cacheDir, entry));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalizeRange(range, durationSeconds = null) {
  const start = Number(range?.startSec);
  const end = Number(range?.endSec);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return { startSec: Math.max(0, start), endSec: Math.max(start + 1, end), basis: range.basis ?? "target-cue" };
  }
  const duration = Number(durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    return { startSec: 0, endSec: duration, basis: "duration-fallback" };
  }
  return { startSec: 0, endSec: 60, basis: "unknown-duration-fallback" };
}

function targetRanges(target, sourcePacket, { sweepFrames = 6 } = {}) {
  const preferred = Array.isArray(target.preferredTimeRanges) ? target.preferredTimeRanges : [];
  if (preferred.length > 0) {
    return preferred.map((range) => normalizeRange(range, sourcePacket?.video?.durationSeconds));
  }
  if (target.fallbackPolicy === "description-only-sweep") {
    const base = normalizeRange(target.candidateTimeRange, sourcePacket?.video?.durationSeconds);
    const start = base.startSec;
    const end = base.endSec;
    const span = Math.max(1, end - start);
    const count = Math.max(1, sweepFrames);
    return Array.from({ length: count }, (_, index) => {
      const anchor = count === 1 ? start + span / 2 : start + (span * index) / (count - 1);
      return {
        startSec: Math.max(start, anchor - 2),
        endSec: Math.min(end, anchor + 2),
        basis: "description-only-sweep",
      };
    });
  }
  return [];
}

async function downloadRangeClip({
  sourcePacket,
  target,
  range,
  cacheDir,
  ytDlpBin,
  projectRoot,
  timeoutMs,
  executeCommandFn,
  manifest,
}) {
  const url = sourcePacket?.video?.url;
  if (!url) throw new Error("source packet has no YouTube URL");
  const section = `*${formatSectionTime(range.startSec)}-${formatSectionTime(range.endSec)}`;
  const downloadCommand = [
    ytDlpBin,
    "--quiet",
    "--no-warnings",
    "--force-overwrites",
    "--download-sections",
    section,
    "--force-keyframes-at-cuts",
    "-f",
    "bv*[height<=360]+ba/b[height<=360]/worst",
    "-o",
    path.join(cacheDir, "clip.%(ext)s"),
    url,
  ];
  const downloadPath = path.join(cacheDir, "download-command.json");
  recordWrite(manifest, downloadPath, `visual-target-download-command:${target.targetId}`);
  await writeJson(downloadPath, { command: downloadCommand, section, range });
  await executeCommandFn(downloadCommand, { cwd: projectRoot, timeoutMs });
  const clipPath = await findClipFile(cacheDir);
  if (!clipPath || !existsSync(clipPath)) throw new Error(`visual clip not created for ${target.targetId}`);
  recordWrite(manifest, clipPath, `visual-target-clip:${target.targetId}`);
  return clipPath;
}

async function extractFramesWithRecipeLoopExtractor({
  clipPath,
  target,
  range,
  frameDir,
  projectRoot,
  timeoutMs,
  frameExtractorScript,
  frameExtractorPythonBin,
  framesPerRange,
  executeCommandFn,
  manifest,
}) {
  const duration = Math.max(1, Number(range.endSec) - Number(range.startSec));
  const interval = Math.max(0.5, duration / Math.max(1, framesPerRange));
  const command = [
    frameExtractorPythonBin,
    frameExtractorScript,
    clipPath,
    "--video-id",
    `${target.candidateId}-${safeFileSegment(target.ingredient)}`,
    "--out-dir",
    frameDir,
    "--mode",
    "interval",
    "--max-frames",
    String(framesPerRange),
    "--interval",
    String(interval),
  ];
  const commandPath = path.join(frameDir, "extract-video-frames-command.json");
  recordWrite(manifest, commandPath, `visual-target-frame-extractor-command:${target.targetId}`);
  addAllowedRead(manifest, clipPath);
  recordRead(manifest, clipPath, `visual-target-clip-input:${target.targetId}`);
  await writeJson(commandPath, { command, interval, reusedExtractor: "scripts/recipe-loop/extract-video-frames.py" });
  await executeCommandFn(command, { cwd: projectRoot, timeoutMs });
  const framesJsonPath = path.join(frameDir, "frames.json");
  addAllowedRead(manifest, framesJsonPath);
  recordRead(manifest, framesJsonPath, `visual-target-frames-json:${target.targetId}`);
  const frames = JSON.parse(await readFile(framesJsonPath, "utf8"));
  return frames.map((frame) => path.resolve(frame.path));
}

async function collectTargetVisual({
  target,
  sourcePacket,
  projectRoot,
  cacheRoot,
  manifest,
  ytDlpBin,
  frameExtractorScript,
  frameExtractorPythonBin,
  framesPerRange,
  descriptionOnlySweepFrames,
  timeoutMs,
  executeCommandFn,
}) {
  const ranges = targetRanges(target, sourcePacket, { sweepFrames: descriptionOnlySweepFrames });
  const targetDir = path.join(cacheRoot, target.candidateId, safeFileSegment(target.ingredient));
  await mkdir(targetDir, { recursive: true });
  if (ranges.length === 0) {
    return {
      targetId: target.targetId,
      candidateId: target.candidateId,
      ingredient: target.ingredient,
      ranges: [],
      frames: [],
      error: {
        reasonCode: "description_only_target_no_matching_frame",
        message: "target has no preferred or fallback time range",
      },
    };
  }

  const frameEntries = [];
  for (const [rangeIndex, range] of ranges.entries()) {
    const rangeDir = path.join(targetDir, `range-${String(rangeIndex + 1).padStart(2, "0")}`);
    await mkdir(rangeDir, { recursive: true });
    const clipPath = await downloadRangeClip({
      sourcePacket,
      target,
      range,
      cacheDir: rangeDir,
      ytDlpBin,
      projectRoot,
      timeoutMs,
      executeCommandFn,
      manifest,
    });
    const framePaths = await extractFramesWithRecipeLoopExtractor({
      clipPath,
      target,
      range,
      frameDir: rangeDir,
      projectRoot,
      timeoutMs,
      frameExtractorScript,
      frameExtractorPythonBin,
      framesPerRange,
      executeCommandFn,
      manifest,
    });
    for (const [frameIndex, framePath] of framePaths.entries()) {
      recordWrite(manifest, framePath, `visual-target-frame:${target.targetId}`);
      addAllowedRead(manifest, framePath);
      recordRead(manifest, framePath, `visual-target-frame-input:${target.targetId}`);
      frameEntries.push({
        ref: `frame:${target.candidateId}:${safeFileSegment(target.ingredient)}:${frameEntries.length + 1}`,
        targetId: target.targetId,
        candidateId: target.candidateId,
        ingredient: target.ingredient,
        rangeIndex,
        frameIndex,
        range,
        path: relative(projectRoot, framePath),
        observed: [],
        onscreenText: [],
        quantityCues: [],
        confidence: null,
      });
    }
  }

  return {
    targetId: target.targetId,
    candidateId: target.candidateId,
    ingredient: target.ingredient,
    ranges,
    frames: frameEntries,
    error: null,
  };
}

function normalizeVisualEstimateOutput(value, target, frameEntries) {
  const parsed = parsePiRawOutput(value) ?? {};
  const amount = cleanString(parsed.amount);
  const unit = cleanString(parsed.unit);
  const basis = parsed.amountBasis === "visual-estimate" && amount && unit ? "visual-estimate" : null;
  const frameRefs = frameEntries.map((frame) => frame.ref);
  const evidence = uniqueStrings(Array.isArray(parsed.evidence) ? parsed.evidence : []);
  return {
    targetId: target.targetId,
    candidateId: target.candidateId,
    ingredient: target.ingredient,
    amount: basis ? amount : null,
    unit: basis ? unit : null,
    amountBasis: basis,
    confidence: Math.max(0, Math.min(1, optionalNumber(parsed.confidence, basis ? 0.4 : 0.2))),
    evidence: basis ? uniqueStrings([...evidence, ...frameRefs]) : evidence.filter((entry) => String(entry).startsWith("frame:")),
    reason: cleanString(parsed.reason) ?? (basis ? "visual estimate from target frames" : "description-only target, no matching frame evidence"),
    uncertainties: uniqueStrings(Array.isArray(parsed.uncertainties) ? parsed.uncertainties : []),
  };
}

function pickBalancedEntries(entries, maxEntries) {
  if (!Number.isFinite(Number(maxEntries)) || Number(maxEntries) <= 0 || entries.length <= Number(maxEntries)) return entries;
  const limit = Math.max(1, Math.floor(Number(maxEntries)));
  if (limit === 1) return [entries[Math.floor(entries.length / 2)]];
  return Array.from({ length: limit }, (_, index) => {
    const pickedIndex = Math.round((entries.length - 1) * index / (limit - 1));
    return entries[pickedIndex];
  });
}

async function collectCandidateVisual({
  candidate,
  sourcePacket,
  projectRoot,
  cacheRoot,
  manifest,
  model,
  provider,
  thinking,
  ytDlpBin,
  ffmpegBin,
  frameCount,
  secondsPerCandidate,
  timeoutMs,
  executeCommandFn,
  executePiFn,
}) {
  const cacheDir = path.join(cacheRoot, candidate.candidateId);
  await mkdir(cacheDir, { recursive: true });
  const { start, end } = candidateTimeWindow(candidate, secondsPerCandidate);
  const section = `*${formatSectionTime(start)}-${formatSectionTime(end)}`;
  const url = sourcePacket?.video?.url;
  if (!url) throw new Error("source packet has no YouTube URL");

  const downloadCommand = [
    ytDlpBin,
    "--quiet",
    "--no-warnings",
    "--force-overwrites",
    "--download-sections",
    section,
    "--force-keyframes-at-cuts",
    "-f",
    "bv*[height<=360]+ba/b[height<=360]/worst",
    "-o",
    path.join(cacheDir, "clip.%(ext)s"),
    url,
  ];
  const downloadPath = path.join(cacheDir, "download-command.json");
  recordWrite(manifest, downloadPath, `visual-download-command:${candidate.candidateId}`);
  await writeJson(downloadPath, { command: downloadCommand, section });
  await executeCommandFn(downloadCommand, { cwd: projectRoot, timeoutMs });
  const clipPath = await findClipFile(cacheDir);
  if (!clipPath || !existsSync(clipPath)) throw new Error(`visual clip not created for ${candidate.candidateId}`);
  recordWrite(manifest, clipPath, `visual-clip:${candidate.candidateId}`);

  const framePattern = path.join(cacheDir, "frame-%02d.jpg");
  const interval = Math.max(1, Math.ceil((end - start) / frameCount));
  const ffmpegCommand = [
    ffmpegBin,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    clipPath,
    "-vf",
    `fps=1/${interval},scale=384:-1`,
    "-frames:v",
    String(frameCount),
    framePattern,
  ];
  const ffmpegPath = path.join(cacheDir, "ffmpeg-command.json");
  recordWrite(manifest, ffmpegPath, `visual-ffmpeg-command:${candidate.candidateId}`);
  addAllowedRead(manifest, clipPath);
  recordRead(manifest, clipPath, `visual-clip-input:${candidate.candidateId}`);
  await writeJson(ffmpegPath, { command: ffmpegCommand, interval });
  await executeCommandFn(ffmpegCommand, { cwd: projectRoot, timeoutMs });
  const framePaths = await findFrameFiles(cacheDir);
  if (framePaths.length === 0) throw new Error(`visual frames not created for ${candidate.candidateId}`);

  for (const framePath of framePaths) {
    recordWrite(manifest, framePath, `visual-frame:${candidate.candidateId}`);
    addAllowedRead(manifest, framePath);
    recordRead(manifest, framePath, `visual-frame-input:${candidate.candidateId}`);
  }

  const visualCommand = buildVisualPiCommand({
    model,
    provider,
    thinking,
    framePaths,
  });
  const commandPath = path.join(cacheDir, "visual-pi-command.json");
  recordWrite(manifest, commandPath, `visual-pi-command:${candidate.candidateId}`);
  await writeJson(commandPath, { command: visualCommand });
  const piResult = await executePiFn(visualCommand, { cwd: projectRoot, timeoutMs });
  const rawPath = path.join(cacheDir, "visual-pi-raw-response.json");
  recordWrite(manifest, rawPath, `visual-pi-raw-response:${candidate.candidateId}`);
  await writeFile(rawPath, JSON.stringify(piResult, null, 2) + "\n", "utf8");
  const visual = normalizeVisualOutput(piResult);
  return {
    candidateId: candidate.candidateId,
    timeRange: candidate.timeRange,
    frames: framePaths.map((framePath, index) => ({
      ref: `frame:${candidate.candidateId}:${index + 1}`,
      path: relative(projectRoot, framePath),
      observed: visual.observed,
      onscreenText: visual.onscreenText,
      quantityCues: visual.quantityCues,
      confidence: visual.confidence,
      rawRef: relative(projectRoot, rawPath),
    })),
    observed: visual.observed,
    onscreenText: visual.onscreenText,
    quantityCues: visual.quantityCues,
    error: null,
  };
}

export async function collectVisualLedger({
  sourcePacket,
  candidateLedger,
  visualTargetLedger = null,
  projectRoot,
  cacheRoot,
  manifest,
  model,
  provider = null,
  thinking = null,
  ytDlpBin = process.env.YT_DLP_BIN || "yt-dlp",
  ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg",
  frameCount = 2,
  framesPerRange = frameCount,
  descriptionOnlySweepFrames = 6,
  secondsPerCandidate = 30,
  maxCandidates = null,
  allowFallbackRanges = false,
  frameExtractorScript = path.join(projectRoot, "scripts/recipe-loop/extract-video-frames.py"),
  frameExtractorPythonBin = process.env.PYTHON_BIN || "python3",
  timeoutMs = 120000,
  executeCommandFn = executeCommand,
  executePiFn,
}) {
  await mkdir(cacheRoot, { recursive: true });
  const candidates = [];
  const targets = [];
  const errors = [];
  const limit = maxCandidates === null || maxCandidates === undefined
    ? candidateLedger.candidates.length
    : Number(maxCandidates);

  if (visualTargetLedger?.targets?.length) {
    const targetLimit = maxCandidates === null || maxCandidates === undefined
      ? visualTargetLedger.targets.length
      : Number(maxCandidates);
    for (const [index, target] of visualTargetLedger.targets.entries()) {
      if (index >= targetLimit) {
        targets.push({
          targetId: target.targetId,
          candidateId: target.candidateId,
          ingredient: target.ingredient,
          ranges: [],
          frames: [],
          skipped: true,
        });
        continue;
      }
      try {
        targets.push(await collectTargetVisual({
          target,
          sourcePacket,
          projectRoot,
          cacheRoot,
          manifest,
          ytDlpBin,
          frameExtractorScript,
          frameExtractorPythonBin,
          framesPerRange,
          descriptionOnlySweepFrames,
          timeoutMs,
          executeCommandFn,
        }));
      } catch (error) {
        const entry = {
          targetId: target.targetId,
          candidateId: target.candidateId,
          ingredient: target.ingredient,
          reasonCode: target.fallbackPolicy === "description-only-sweep"
            ? "description_only_target_no_matching_frame"
            : "visual_target_frame_collection_failed",
          message: error instanceof Error ? error.message : String(error),
          commandExecution: error?.commandExecution ?? null,
        };
        errors.push(entry);
        targets.push({
          targetId: target.targetId,
          candidateId: target.candidateId,
          ingredient: target.ingredient,
          ranges: [],
          frames: [],
          error: entry,
        });
        const failurePath = path.join(cacheRoot, target.candidateId, safeFileSegment(target.ingredient), "visual-failure.json");
        recordWrite(manifest, failurePath, `visual-target-failure:${target.targetId}`);
        await writeJson(failurePath, entry);
      }
    }

    for (const candidate of candidateLedger.candidates) {
      const candidateTargets = targets.filter((target) => target.candidateId === candidate.candidateId);
      const candidateFrames = candidateTargets.flatMap((target) => target.frames ?? []);
      candidates.push({
        candidateId: candidate.candidateId,
        timeRange: candidate.timeRange,
        frames: candidateFrames,
        observed: [],
        onscreenText: [],
        quantityCues: [],
        targetCount: candidateTargets.length,
      });
    }

    const collectedFrameCount = targets.reduce((sum, target) => sum + (target.frames?.length ?? 0), 0);
    const collectionStatus = errors.length > 0
      ? collectedFrameCount > 0 ? "partial" : "failed"
      : collectedFrameCount > 0 ? "completed" : "skipped";

    return {
      schemaVersion: 1,
      kind: "visual-ledger",
      videoId: sourcePacket?.video?.videoId ?? null,
      collectionStatus,
      note: "Frames were sampled per visual target using scripts/recipe-loop/extract-video-frames.py; amount estimation is stored in visual-estimates.json.",
      frameCount,
      framesPerRange,
      descriptionOnlySweepFrames,
      errors,
      targets,
      candidates,
    };
  }

  if (!executePiFn) throw new Error("executePiFn is required for visual ledger collection");

  for (const [index, candidate] of candidateLedger.candidates.entries()) {
    if (index >= limit) {
      candidates.push({
        candidateId: candidate.candidateId,
        timeRange: candidate.timeRange,
        frames: [],
        observed: [],
        onscreenText: [],
        quantityCues: [],
        skipped: true,
      });
      continue;
    }
    if (!allowFallbackRanges && candidate.timeRange?.basis === "even-split-fallback") {
      candidates.push({
        candidateId: candidate.candidateId,
        timeRange: candidate.timeRange,
        frames: [],
        observed: [],
        onscreenText: [],
        quantityCues: [],
        skipped: true,
        skipReason: "time-range-even-split-fallback",
      });
      continue;
    }
    try {
      candidates.push(await collectCandidateVisual({
        candidate,
        sourcePacket,
        projectRoot,
        cacheRoot,
        manifest,
        model,
        provider,
        thinking,
        ytDlpBin,
        ffmpegBin,
        frameCount,
        secondsPerCandidate,
        timeoutMs,
        executeCommandFn,
        executePiFn,
      }));
    } catch (error) {
      const entry = {
        candidateId: candidate.candidateId,
        message: error instanceof Error ? error.message : String(error),
        commandExecution: error?.commandExecution ?? null,
      };
      errors.push(entry);
      candidates.push({
        candidateId: candidate.candidateId,
        timeRange: candidate.timeRange,
        frames: [],
        observed: [],
        onscreenText: [],
        quantityCues: [],
        error: entry,
      });
      const failurePath = path.join(cacheRoot, candidate.candidateId, "visual-failure.json");
      recordWrite(manifest, failurePath, `visual-failure:${candidate.candidateId}`);
      await writeJson(failurePath, entry);
    }
  }

  const collectedFrameCount = candidates.reduce((sum, candidate) => sum + candidate.frames.length, 0);
  const collectionStatus = errors.length > 0
    ? candidates.some((candidate) => candidate.frames.length > 0) ? "partial" : "failed"
    : collectedFrameCount > 0 ? "completed" : "skipped";

  return {
    schemaVersion: 1,
    kind: "visual-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    collectionStatus,
    note: "Frames were sampled from the public YouTube video and analyzed by Pi image input; use only observed/onscreen cues as visual evidence.",
    frameCount,
    secondsPerCandidate,
    errors,
    candidates,
  };
}

export async function collectVisualEstimates({
  visualTargetLedger,
  visualLedger,
  projectRoot,
  cacheRoot,
  manifest,
  model,
  provider = null,
  thinking = null,
  timeoutMs = 120000,
  maxFramesPerEstimate = 6,
  executePiFn,
}) {
  if (!executePiFn) throw new Error("executePiFn is required for visual estimate collection");
  const visualEstimates = [];
  const uncertainties = [];
  const errors = [];
  const targetEntries = visualLedger?.targets ?? [];

  for (const target of visualTargetLedger?.targets ?? []) {
    const targetVisual = targetEntries.find((entry) => entry.targetId === target.targetId);
    const frameEntries = targetVisual?.frames ?? [];
    if (frameEntries.length === 0) {
      const estimate = {
        targetId: target.targetId,
        candidateId: target.candidateId,
        ingredient: target.ingredient,
        amount: null,
        unit: null,
        amountBasis: null,
        confidence: 0.15,
        evidence: [],
        reason: targetVisual?.error?.reasonCode === "description_only_target_no_matching_frame"
          ? "description-only target, no matching frame evidence"
          : "target frame evidence was not collected",
        uncertainties: [targetVisual?.error?.reasonCode ?? "visual_target_no_frame_evidence"],
      };
      visualEstimates.push(estimate);
      uncertainties.push(`${target.ingredient}: ${estimate.reason}`);
      continue;
    }

    const selectedFrameEntries = pickBalancedEntries(frameEntries, maxFramesPerEstimate);
    const framePaths = selectedFrameEntries.map((frame) => path.resolve(projectRoot, frame.path));
    for (const framePath of framePaths) {
      addAllowedRead(manifest, framePath);
      recordRead(manifest, framePath, `visual-estimate-frame-input:${target.targetId}`);
    }
    const targetCacheDir = path.join(cacheRoot, target.candidateId, safeFileSegment(target.ingredient));
    await mkdir(targetCacheDir, { recursive: true });
    const { command, prompt } = buildVisualEstimatePiCommand({
      model,
      provider,
      thinking,
      target,
      framePaths,
    });
    const promptPath = path.join(targetCacheDir, "visual-estimate-prompt.txt");
    const commandPath = path.join(targetCacheDir, "visual-estimate-command.json");
    recordWrite(manifest, promptPath, `visual-estimate-prompt:${target.targetId}`);
    recordWrite(manifest, commandPath, `visual-estimate-command:${target.targetId}`);
    await writeFile(promptPath, `${prompt}\n`, "utf8");
    await writeJson(commandPath, { command });
    try {
      const piResult = await executePiFn(command, { cwd: projectRoot, timeoutMs });
      const rawPath = path.join(targetCacheDir, "visual-estimate-raw-response.json");
      recordWrite(manifest, rawPath, `visual-estimate-raw-response:${target.targetId}`);
      await writeFile(rawPath, JSON.stringify(piResult, null, 2) + "\n", "utf8");
      const estimate = normalizeVisualEstimateOutput(piResult, target, selectedFrameEntries);
      estimate.rawRef = relative(projectRoot, rawPath);
      visualEstimates.push(estimate);
      if (estimate.uncertainties.length) uncertainties.push(...estimate.uncertainties.map((item) => `${target.ingredient}: ${item}`));
    } catch (error) {
      const entry = {
        targetId: target.targetId,
        candidateId: target.candidateId,
        ingredient: target.ingredient,
        reasonCode: "visual_amount_estimator_failed",
        message: error instanceof Error ? error.message : String(error),
        piExecution: error?.piExecution ?? null,
      };
      errors.push(entry);
      visualEstimates.push({
        targetId: target.targetId,
        candidateId: target.candidateId,
        ingredient: target.ingredient,
        amount: null,
        unit: null,
        amountBasis: null,
        confidence: 0.1,
        evidence: selectedFrameEntries.map((frame) => frame.ref),
        reason: "visual amount estimator failed",
        uncertainties: [entry.reasonCode],
      });
      const failurePath = path.join(targetCacheDir, "visual-estimate-failure.json");
      recordWrite(manifest, failurePath, `visual-estimate-failure:${target.targetId}`);
      await writeJson(failurePath, entry);
    }
  }

  return {
    schemaVersion: 1,
    kind: "visual-estimates",
    videoId: visualTargetLedger?.videoId ?? null,
    visualEstimates,
    uncertainties: uniqueStrings(uncertainties),
    errors,
  };
}
