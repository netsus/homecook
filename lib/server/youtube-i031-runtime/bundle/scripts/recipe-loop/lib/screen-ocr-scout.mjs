import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCREEN_OCR_POLICY_VERSION = "single-screen-ocr-policy-v1";
export const SCREEN_OCR_TIMELINE_VERSION = "single-screen-ocr-timeline-v1";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VISION_HELPER_PATH = path.resolve(MODULE_DIR, "../macos-vision-ocr.swift");

const VALID_MODES = new Set(["off", "auto", "force"]);
const AMOUNT_PATTERN = /(?:^|\s|[,:;()\[\]])(?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(?:g|kg|mg|ml|l|cc|컵|큰술|작은술|스푼|술|개|장|쪽|알|줌|꼬집|대|줄기|봉|팩|캔)(?=$|\s|[,:;.!?()\[\]])/giu;
const TEMPERATURE_OR_TIME_PATTERN = /(?:°\s*[cf]|도\b|초\b|분\b|시간\b)/iu;
const ACTION_PATTERN = /(?:넣|섞|젓|끓|굽|볶|튀기|데치|삶|썰|다지|자르|버무리|재우|식히|녹이|체치|반죽|발효|익히|가열|졸이|휘핑|fold|mix|stir|boil|bake|cook|fry|slice|chop|whisk|knead)/giu;

function nowMs() {
  return Date.now();
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function comparableText(value) {
  return normalizedText(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+(?=[a-z%])/giu, "")
    .replace(/(?<=\d)\s+(?=[a-z%])/giu, "");
}

function matchCount(text, pattern) {
  return [...String(text ?? "").matchAll(pattern)].length;
}

function isQuantityCue(text) {
  if (TEMPERATURE_OR_TIME_PATTERN.test(text) && !AMOUNT_PATTERN.test(text)) return false;
  AMOUNT_PATTERN.lastIndex = 0;
  return AMOUNT_PATTERN.test(text);
}

function isActionCue(text) {
  ACTION_PATTERN.lastIndex = 0;
  return ACTION_PATTERN.test(text);
}

function sourceMetrics(sourceText) {
  const source = String(sourceText ?? "").normalize("NFKC");
  const text = normalizedText(source);
  AMOUNT_PATTERN.lastIndex = 0;
  ACTION_PATTERN.lastIndex = 0;
  const quantityCueCount = matchCount(text, AMOUNT_PATTERN);
  const actionCueCount = matchCount(text, ACTION_PATTERN);
  const informativeLineCount = source
    .split(/\n+/u)
    .map((line) => line.replace(/^\[SOURCE:[^\]]+\]\s*/u, "").trim())
    .filter((line) => line.length >= 8).length;
  return { textChars: text.length, informativeLineCount, quantityCueCount, actionCueCount };
}

export function classifyScreenOcrNeed({ mode = "off", sourceText = "" } = {}) {
  const normalizedMode = String(mode ?? "off").trim().toLowerCase();
  if (!VALID_MODES.has(normalizedMode)) {
    throw new Error(`SCREEN_OCR_MODE: expected off|auto|force, received ${mode}`);
  }
  const metrics = sourceMetrics(sourceText);
  if (normalizedMode === "off") return { mode: normalizedMode, enabled: false, reason: "mode-off", metrics };
  if (normalizedMode === "force") return { mode: normalizedMode, enabled: true, reason: "mode-force", metrics };
  const sourceRich = metrics.quantityCueCount >= 3
    && metrics.actionCueCount >= 3
    && metrics.informativeLineCount >= 2;
  return {
    mode: normalizedMode,
    enabled: !sourceRich,
    reason: sourceRich ? "source-rich" : "source-poor",
    metrics,
  };
}

function eventFromObservation(observation) {
  const text = normalizedText(observation.text);
  const timestampSec = round(Math.max(0, Number(observation.timestampSec ?? observation.timestamp_sec ?? 0)));
  return {
    startSec: timestampSec,
    endSec: timestampSec,
    text,
    normalizedText: comparableText(text),
    confidence: Math.max(0, Math.min(1, Number(observation.confidence ?? 0))),
    regions: [normalizedText(observation.region || "unknown")],
    quantityCue: isQuantityCue(text),
    actionCue: isActionCue(text),
    representativeFrame: {
      path: String(observation.path ?? ""),
      timestampSec,
    },
  };
}

export function normalizeScreenOcrTimeline({
  observations = [],
  minConfidence = 0.6,
  mergeGapSec = 2,
} = {}) {
  const eligible = observations
    .filter((entry) => entry && Number(entry.confidence ?? 0) >= minConfidence && normalizedText(entry.text).length >= 2)
    .map(eventFromObservation)
    .sort((left, right) => left.startSec - right.startSec
      || left.regions[0].localeCompare(right.regions[0])
      || left.text.localeCompare(right.text));
  const merged = [];
  for (const event of eligible) {
    const previous = merged.at(-1);
    if (
      previous
      && previous.normalizedText === event.normalizedText
      && previous.regions[0] === event.regions[0]
      && event.startSec - previous.endSec <= mergeGapSec
    ) {
      previous.endSec = event.endSec;
      previous.confidence = round(Math.max(previous.confidence, event.confidence));
      continue;
    }
    merged.push({ ...event });
  }
  const events = merged.map((event, index) => ({
    id: `O${String(index + 1).padStart(2, "0")}`,
    startSec: event.startSec,
    endSec: event.endSec,
    text: event.text,
    confidence: round(event.confidence),
    regions: [...new Set(event.regions)],
    quantityCue: event.quantityCue,
    actionCue: event.actionCue,
    representativeFrame: event.representativeFrame,
  }));
  return {
    version: SCREEN_OCR_TIMELINE_VERSION,
    events,
    diagnostics: {
      rawEventCount: observations.length,
      eligibleEventCount: eligible.length,
      dedupedEventCount: events.length,
    },
  };
}

function eventHasFrame(event) {
  return Boolean(event?.representativeFrame?.path && existsSync(event.representativeFrame.path));
}

export function assessScreenOcrEvidence({ events = [], durationSec = null } = {}) {
  const eligible = events.filter((event) => Number(event.confidence ?? 0) >= 0.6 && eventHasFrame(event));
  const quantityCount = eligible.filter((event) => event.quantityCue).length;
  const actionCount = eligible.filter((event) => event.actionCue).length;
  const duration = Math.max(1, Number(durationSec ?? Math.max(...eligible.map((event) => event.endSec), 1)));
  const timeBuckets = new Set(eligible.map((event) => Math.min(2, Math.floor((Number(event.startSec) / duration) * 3))));
  const diagnostics = { eligibleEventCount: eligible.length, quantityCount, actionCount, timeBucketCount: timeBuckets.size };
  if (quantityCount < 2) return { sufficient: false, reason: "insufficient-quantity-evidence", diagnostics };
  if (actionCount < 2) return { sufficient: false, reason: "insufficient-action-evidence", diagnostics };
  if (eligible.length < 4) return { sufficient: false, reason: "insufficient-event-count", diagnostics };
  if (timeBuckets.size < 3) return { sufficient: false, reason: "insufficient-time-spread", diagnostics };
  return { sufficient: true, reason: "sufficient-distributed-evidence", diagnostics };
}

function eventPriority(event, durationSec) {
  const duration = Math.max(1, Number(durationSec ?? 1));
  const bucket = Math.min(2, Math.floor((Number(event.startSec) / duration) * 3));
  const category = event.quantityCue && event.actionCue ? 0 : event.quantityCue ? 1 : event.actionCue ? 2 : 3;
  return { bucket, category };
}

export function selectScreenOcrRepresentativeFrames({ events = [], durationSec = null, limit = 8 } = {}) {
  const maxFrames = Math.max(1, Math.min(8, Math.floor(Number(limit) || 8)));
  const eligible = events
    .filter(eventHasFrame)
    .map((event) => ({ event, ...eventPriority(event, durationSec) }))
    .sort((left, right) => left.bucket - right.bucket
      || left.category - right.category
      || right.event.confidence - left.event.confidence
      || left.event.startSec - right.event.startSec
      || left.event.id.localeCompare(right.event.id));
  const chosen = [];
  const chosenPaths = new Set();
  const take = (entry) => {
    const framePath = entry.event.representativeFrame.path;
    if (chosenPaths.has(framePath) || chosen.length >= maxFrames) return;
    chosenPaths.add(framePath);
    chosen.push(entry.event);
  };
  for (const category of [1, 2, 0, 3]) {
    for (const bucket of [0, 1, 2]) {
      const entry = eligible.find((candidate) => candidate.category === category && candidate.bucket === bucket);
      if (entry) take(entry);
    }
  }
  for (const entry of eligible) take(entry);

  const frames = chosen
    .sort((left, right) => left.representativeFrame.timestampSec - right.representativeFrame.timestampSec || left.id.localeCompare(right.id))
    .map((event, index) => ({
      index: index + 1,
      timestamp_sec: event.representativeFrame.timestampSec,
      timestamp: null,
      path: event.representativeFrame.path,
      reason: "screen-ocr:event",
      selectionReason: "screen OCR event",
      resolutionSource: "screen-ocr-exact",
      completionReason: "screen-ocr-event",
      screenOcrEventIds: [event.id],
      visualEvidence: {
        observed: [],
        onscreenText: [event.text],
        quantityCues: event.quantityCue ? [event.text] : [],
        confidence: event.confidence,
      },
    }));
  return { frames, selectedEventIds: chosen.map((event) => event.id) };
}

function formatTimestamp(value) {
  const seconds = Math.max(0, Number(value ?? 0));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function formatScreenOcrTimelineForPrompt({ events = [] } = {}) {
  if (!events.length) return "";
  const lines = events.map((event) => {
    const range = event.endSec > event.startSec
      ? `${formatTimestamp(event.startSec)}-${formatTimestamp(event.endSec)}`
      : formatTimestamp(event.startSec);
    return `- ${event.id} ${range} [${(event.regions ?? []).join(",")}] ${JSON.stringify(event.text)} (confidence ${Number(event.confidence ?? 0).toFixed(2)})`;
  });
  return [
    "화면 OCR 타임라인 (영상 화면에 실제로 표시된 exact onscreen evidence):",
    ...lines,
    "이 원문과 같은 프레임에서 직접 연결된 재료·양만 amountBasis=onscreen이다. 화면 모양을 보고 추정한 visual-estimate가 아님.",
    "화면 OCR은 추가 근거일 뿐 설명·댓글·발화의 action ledger를 대체하거나 기존 action을 삭제하는 근거가 아니다. OCR에 동작 문구가 적어도 동작 부재로 해석하지 않는다.",
  ].join("\n");
}

export function screenOcrTimelineHash(timeline) {
  const canonical = (timeline?.events ?? []).map((event) => ({
    id: event.id,
    startSec: event.startSec,
    endSec: event.endSec,
    text: event.text,
    confidence: event.confidence,
    regions: event.regions,
    quantityCue: event.quantityCue,
    actionCue: event.actionCue,
    frame: event.representativeFrame ? path.basename(event.representativeFrame.path) : null,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function runProcess(command, args, { cwd = process.cwd(), timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error(`screen OCR process timeout after ${timeoutMs}ms`);
      error.code = "SCREEN_OCR_TIMEOUT";
      reject(error);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export function createMacOSVisionBatchRecognizer({
  cacheRoot,
  helperPath = DEFAULT_VISION_HELPER_PATH,
  platform = process.platform,
  swiftcPath = "/usr/bin/swiftc",
  runProcessImpl = runProcess,
  timeoutMs = 120_000,
} = {}) {
  return async function recognizeBatch(candidates = []) {
    if (platform !== "darwin") {
      const error = new Error("macOS Vision OCR is unavailable on this platform");
      error.code = "SCREEN_OCR_PLATFORM_UNAVAILABLE";
      throw error;
    }
    if (!cacheRoot) throw new Error("screen OCR cacheRoot is required");
    if (!candidates.length) return { observations: [], timingMs: 0 };
    const startedAt = nowMs();
    const helperSource = await readFile(helperPath);
    const helperHash = createHash("sha256").update(helperSource).digest("hex").slice(0, 24);
    const binaryDir = path.join(cacheRoot, "_screen_ocr", "bin", helperHash);
    const binaryPath = path.join(binaryDir, "macos-vision-ocr");
    if (!existsSync(binaryPath)) {
      await mkdir(binaryDir, { recursive: true });
      const temporaryBinaryPath = `${binaryPath}.tmp-${randomUUID()}`;
      const compile = await runProcessImpl(swiftcPath, ["-O", helperPath, "-o", temporaryBinaryPath], {
        cwd: path.dirname(helperPath),
        timeoutMs,
      });
      if (compile.code !== 0 || !existsSync(temporaryBinaryPath)) {
        await rm(temporaryBinaryPath, { force: true });
        const error = new Error(`macOS Vision OCR helper compile failed: ${String(compile.stderr ?? "").slice(0, 500)}`);
        error.code = "SCREEN_OCR_COMPILE_FAILED";
        throw error;
      }
      try {
        await rename(temporaryBinaryPath, binaryPath);
      } catch (error) {
        await rm(temporaryBinaryPath, { force: true });
        if (!existsSync(binaryPath)) throw error;
      }
    }

    const requestDir = path.join(cacheRoot, "_screen_ocr", "requests", randomUUID());
    const inputPath = path.join(requestDir, "input.json");
    const outputPath = path.join(requestDir, "output.json");
    await mkdir(requestDir, { recursive: true });
    const items = candidates.map((candidate, index) => ({
      id: `F${String(index + 1).padStart(3, "0")}`,
      path: String(candidate.path ?? ""),
      region: String(candidate.region ?? candidate.screen_ocr_region ?? "unknown"),
    }));
    await writeFile(inputPath, JSON.stringify({ version: "macos-vision-ocr-input-v1", items }, null, 2) + "\n", "utf8");
    try {
      const execution = await runProcessImpl(binaryPath, [inputPath, outputPath], {
        cwd: path.dirname(helperPath),
        timeoutMs,
      });
      if (execution.code !== 0 || !existsSync(outputPath)) {
        const error = new Error(`macOS Vision OCR helper failed: ${String(execution.stderr ?? "").slice(0, 500)}`);
        error.code = "SCREEN_OCR_EXEC_FAILED";
        throw error;
      }
      const payload = JSON.parse(await readFile(outputPath, "utf8"));
      if (!Array.isArray(payload?.items)) {
        const error = new Error("macOS Vision OCR helper returned invalid JSON");
        error.code = "SCREEN_OCR_INVALID_JSON";
        throw error;
      }
      const candidateById = new Map(items.map((item, index) => [item.id, candidates[index]]));
      const observations = payload.items.flatMap((item) => {
        const candidate = candidateById.get(item.id);
        if (!candidate || !Array.isArray(item.observations)) return [];
        return item.observations
          .filter((observation) => normalizedText(observation.text).length >= 2)
          .map((observation) => ({
            timestampSec: Number(candidate.timestampSec ?? candidate.timestamp_sec ?? 0),
            path: String(candidate.path ?? ""),
            region: String(item.region ?? candidate.region ?? "unknown"),
            text: normalizedText(observation.text),
            confidence: Number(observation.confidence ?? 0),
            boundingBox: observation.boundingBox ?? null,
          }));
      });
      return { observations, timingMs: nowMs() - startedAt };
    } finally {
      await rm(requestDir, { recursive: true, force: true });
    }
  };
}

export async function runScreenOcrScout({
  candidates = [],
  cacheDir,
  cacheKey,
  durationSec = null,
  recognizeBatch,
  minConfidence = 0.6,
  mergeGapSec = 2,
  noCache = false,
} = {}) {
  const startedAt = nowMs();
  const artifactDir = path.join(cacheDir, "_screen_ocr");
  const artifactPath = path.join(artifactDir, `${cacheKey}.json`);
  if (!noCache && existsSync(artifactPath)) {
    const cached = JSON.parse(await readFile(artifactPath, "utf8"));
    return { ...cached, cached: true, timings: { ...cached.timings, totalMs: nowMs() - startedAt } };
  }
  if (typeof recognizeBatch !== "function") {
    return {
      status: "failed",
      cached: false,
      fallbackReason: "recognizer-unavailable",
      events: [],
      timings: { recognitionMs: null, dedupeMs: null, totalMs: nowMs() - startedAt },
      diagnostics: { scannedFrameCount: candidates.length, recognitionCallCount: 0, rawEventCount: 0, dedupedEventCount: 0 },
    };
  }
  try {
    const recognitionStartedAt = nowMs();
    const recognized = await recognizeBatch(candidates);
    const recognitionMs = Number(recognized?.timingMs ?? (nowMs() - recognitionStartedAt));
    const dedupeStartedAt = nowMs();
    const timeline = normalizeScreenOcrTimeline({ observations: recognized?.observations ?? [], minConfidence, mergeGapSec });
    const dedupeMs = nowMs() - dedupeStartedAt;
    const assessment = assessScreenOcrEvidence({ events: timeline.events, durationSec });
    const payload = {
      status: timeline.events.length ? "ok" : "empty",
      cached: false,
      fallbackReason: null,
      version: SCREEN_OCR_POLICY_VERSION,
      timelineVersion: timeline.version,
      timelineHash: screenOcrTimelineHash(timeline),
      events: timeline.events,
      assessment,
      timings: { recognitionMs, dedupeMs, totalMs: nowMs() - startedAt },
      diagnostics: {
        scannedFrameCount: candidates.length,
        recognitionCallCount: candidates.length ? 1 : 0,
        ...timeline.diagnostics,
      },
    };
    if (!noCache) {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    }
    return payload;
  } catch (error) {
    return {
      status: "failed",
      cached: false,
      fallbackReason: "recognizer-failed",
      errorCode: error?.code ?? error?.name ?? "Error",
      events: [],
      timings: { recognitionMs: null, dedupeMs: null, totalMs: nowMs() - startedAt },
      diagnostics: { scannedFrameCount: candidates.length, recognitionCallCount: 1, rawEventCount: 0, dedupedEventCount: 0 },
    };
  }
}
