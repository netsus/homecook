// Codex Vision client for recipe-loop.
// It matches the Gemini client shape: generate({ prompt, videoUrl, cacheText }) -> { json, cached, model }.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/codex-vision");
const CLIENT_VERSION = "codex-vision-client-v1";
const FRAME_EXTRACTOR_VERSION = "extract-video-frames-v2";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_MAX_FRAMES = 80;
const DEFAULT_STORYBOARD_MAX_FRAMES = 0;
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_FINAL_VISUAL_NOTES_MAX_CHARS = 12_000;
const VISUAL_NOTE_SECTION_LIMITS = [
  { re: /시간순|observation/i, maxLines: 3 },
  { re: /보이는\s*재료|ingredients/i, maxLines: 10 },
  { re: /도구|조리\s*동작|tools?|action/i, maxLines: 4 },
  { re: /자막|글자|text|caption/i, maxLines: 8 },
  { re: /불확실|uncertain/i, maxLines: 3 },
];
const IMPORTANT_VISUAL_NOTE_RE = /(새우|통새우|쯔유|들기름|참기름|액젓|된장|고추장|고춧가루|간장|진간장|다진\s*마늘|마늘|맛술|알룰로스|루스|후추|소금|스프|우삼겹|샤브|소곱창|곱창|부추|통깨|깨소금|미나리|마늘쫑|마늘종|항정|열무|동치미|육수)/;

function hashKey(parts, length = 24) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, length);
}

function hashText(text, length = 24) {
  return createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, length);
}

function videoIdFromUrl(videoUrl) {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
  return null;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function extractJsonFromText(text) {
  const raw = String(text ?? "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  candidates.push(raw);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Codex Vision JSON 파싱 실패: ${lastError?.message ?? "unknown"}`);
}

export function buildCodexVisionCacheKey({
  model,
  prompt,
  cacheText,
  frameManifestHash,
  clientVersion = CLIENT_VERSION,
}) {
  return hashKey({
    provider: "codex-vision",
    model,
    promptHash: hashText(prompt),
    cacheTextHash: hashText(cacheText),
    frameManifestHash,
    clientVersion,
  });
}

function buildFrameCacheKey({ videoUrl, videoId, frameOptions }) {
  return hashKey({
    videoUrl,
    videoId,
    frameOptions,
    extractorVersion: FRAME_EXTRACTOR_VERSION,
  });
}

function frameManifestHash(frames) {
  return hashKey(
    frames.map((frame) => ({
      index: frame.index,
      timestamp_sec: frame.timestamp_sec,
      timestamp: frame.timestamp,
      reason: frame.reason,
      scene_score: frame.scene_score ?? null,
      file: path.basename(frame.path ?? ""),
    })),
  );
}

function buildFrameAnalysisPrompt({ batch, sourceText }) {
  const frameLines = batch.map((frame) => {
    const score = frame.scene_score === null || frame.scene_score === undefined ? "" : `, scene_score=${frame.scene_score}`;
    return `- ${path.basename(frame.path)}: ${frame.timestamp} (${frame.reason}${score})`;
  });
  return [
    "첨부 이미지는 같은 요리 영상에서 시간순으로 추출한 프레임입니다.",
    "화면에서 실제로 보이는 재료, 도구, 조리 동작, 자막/글자, 불확실한 점만 기록하세요.",
    "보이지 않는 음성이나 맛 설명은 추측하지 마세요.",
    "요리 상식으로 빈칸을 채우지 말고, 실제 화면 근거와 불확실한 점을 분리하세요.",
    "",
    "프레임 목록:",
    ...frameLines,
    "",
    "텍스트 소스 요약용 원문:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "출력 형식:",
    "1. 시간순 관찰",
    "2. 보이는 재료",
    "3. 보이는 도구와 조리 동작",
    "4. 화면 자막/글자",
    "5. 불확실한 점",
  ].join("\n");
}

function buildFinalExtractionPrompt({ prompt, visualNotes }) {
  return [
    prompt,
    "",
    "추가 시각 분석 메모:",
    visualNotes || "(프레임 분석 메모 없음)",
    "",
    "위 기존 추출 프롬프트의 '영상을 직접 시청할 수 있다'는 말은 이 프레임 분석 메모를 시각 근거로 사용한다는 뜻이다.",
    "아래 텍스트 소스와 프레임 분석 메모를 함께 사용해 recipes JSON만 출력하세요.",
    "프레임 메모는 시각 근거이며, 설명란/자막/댓글의 명시 수량이 있으면 그 값을 우선하세요.",
    "프레임 메모에 `... 된장 ...`, `소곱창`, `깨소금`처럼 일부만 판독된 구체 재료 단어가 있으면 해당 단어는 근거로 사용하되, 판독되지 않은 나머지 문장은 추측하지 마세요.",
    "프레임 메모에도 텍스트 소스에도 없는 재료나 단계를 요리 상식으로 추가하지 마세요.",
  ].join("\n");
}

function visualNoteSectionLimit(sectionTitle) {
  const match = VISUAL_NOTE_SECTION_LIMITS.find(({ re }) => re.test(sectionTitle));
  return match?.maxLines ?? 8;
}

function compactVisualNoteBatch(batchText) {
  const output = [];
  let sectionTitle = "";
  let keptSectionLines = 0;
  for (const rawLine of String(batchText ?? "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^##\s*Batch\b/i.test(trimmed)) {
      output.push(trimmed);
      sectionTitle = "";
      keptSectionLines = 0;
      continue;
    }
    if (/^(?:\*\*)?\d+\.\s*/.test(trimmed) || /^\*\*\d+\.\s*/.test(trimmed)) {
      sectionTitle = trimmed.replace(/\*+/g, "");
      keptSectionLines = 0;
      output.push(trimmed);
      continue;
    }
    const limit = visualNoteSectionLimit(sectionTitle);
    if (keptSectionLines < limit || IMPORTANT_VISUAL_NOTE_RE.test(trimmed)) {
      output.push(line);
      keptSectionLines += 1;
    }
  }
  return output.join("\n");
}

function prioritizeImportantVisualNoteLines(lines) {
  const prioritized = [];
  const usedIndexes = new Set();
  lines.forEach((line, index) => {
    if (/^##\s*Batch\b/i.test(line.trim())) {
      prioritized.push(line);
      usedIndexes.add(index);
    }
  });
  lines.forEach((line, index) => {
    if (!usedIndexes.has(index) && IMPORTANT_VISUAL_NOTE_RE.test(line)) {
      prioritized.push(line);
      usedIndexes.add(index);
    }
  });
  lines.forEach((line, index) => {
    if (!usedIndexes.has(index)) prioritized.push(line);
  });
  return prioritized;
}

function trimVisualNoteTextToMax(text, maxChars) {
  if (text.length <= maxChars) return text;
  const batches = text.split(/\n(?=##\s*Batch\b)/i).filter((batch) => batch.trim());
  if (batches.length === 0) return text.slice(0, maxChars);
  const perBatchBudget = Math.max(400, Math.floor(maxChars / batches.length));
  const trimmed = batches.map((batch) => {
    if (batch.length <= perBatchBudget) return batch;
    const lines = prioritizeImportantVisualNoteLines(batch.split(/\r?\n/));
    const kept = [];
    let used = 0;
    for (const line of lines) {
      if (used + line.length + 1 > perBatchBudget) break;
      kept.push(line);
      used += line.length + 1;
    }
    kept.push("- (이하 시각 메모는 final 입력 길이 제한으로 생략)");
    return kept.join("\n");
  }).join("\n\n");
  return trimmed.length <= maxChars ? trimmed : trimmed.slice(0, maxChars);
}

export function compactVisualNotesForFinal(visualNotes, maxChars = DEFAULT_FINAL_VISUAL_NOTES_MAX_CHARS) {
  const raw = String(visualNotes ?? "");
  if (raw.length <= maxChars) return raw;
  const compacted = raw
    .split(/\n(?=##\s*Batch\b)/i)
    .filter((batch) => batch.trim())
    .map(compactVisualNoteBatch)
    .join("\n\n");
  return trimVisualNoteTextToMax(compacted, maxChars);
}

function buildRepairPrompt(rawOutput) {
  return [
    "아래 응답에서 JSON 객체만 복구하세요.",
    "출력은 설명 없이 JSON만이어야 합니다.",
    "스키마는 { \"recipes\": [...] } 입니다.",
    "",
    rawOutput,
  ].join("\n");
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  await cp(from, to, { recursive: true });
}

function batchSignature(batch, batchSize) {
  return {
    batchSize,
    frameHash: hashKey(batch.map((frame) => ({
      index: frame.index,
      timestamp_sec: frame.timestamp_sec,
      file: path.basename(frame.path ?? ""),
    }))),
  };
}

async function readReusableBatchOutput(outputPath, metaPath, expectedSignature) {
  if (!existsSync(outputPath)) return null;
  const output = await readFile(outputPath, "utf8").catch(() => null);
  if (typeof output !== "string" || output.trim().length === 0) return null;
  if (existsSync(metaPath)) {
    const meta = await readFile(metaPath, "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
    if (!meta) return null;
    if (meta?.batchSize !== expectedSignature.batchSize || meta?.frameHash !== expectedSignature.frameHash) return null;
  }
  return output;
}

function commandToString(command, args) {
  return [command, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

async function runCommand(command, args, { input = "", cwd = PROJECT_ROOT, timeoutMs = DEFAULT_TIMEOUT_MS, logPath = null } = {}) {
  await mkdir(path.dirname(logPath ?? path.join(PROJECT_ROOT, ".tmp-log")), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settled = true;
      if (logPath) writeFile(logPath, output, "utf8").catch(() => {});
      reject(new Error(`명령 시간이 초과되었습니다: ${commandToString(command, args)}${logPath ? ` 로그: ${logPath}` : ""}`));
    }, timeoutMs);

    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { output += data.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (logPath) await writeFile(logPath, output, "utf8").catch(() => {});
      if (code !== 0) {
        reject(new Error(`명령 실패(${code}): ${commandToString(command, args)}${logPath ? ` 로그: ${logPath}` : ""}`));
        return;
      }
      resolve(output);
    });
    child.stdin.end(input);
  });
}

async function runCodexExec({ prompt, images = [], model, codexEffort = null, outputPath, logPath, timeoutMs }) {
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    "-m",
    model,
    "-C",
    PROJECT_ROOT,
    "--output-last-message",
    outputPath,
  ];
  if (codexEffort) args.push("-c", `model_reasoning_effort="${codexEffort}"`);
  for (const imagePath of images) args.push("--image", imagePath);
  args.push("-");
  await runCommand("codex", args, { input: prompt, cwd: PROJECT_ROOT, timeoutMs, logPath });
  if (existsSync(outputPath)) return readFile(outputPath, "utf8");
  return readFile(logPath, "utf8");
}

async function defaultExtractFrames({
  videoUrl,
  videoId,
  cacheDir,
  frameOptions,
  timeoutMs,
  runCommandImpl = runCommand,
}) {
  if (!videoUrl) throw new Error("codex-vision provider는 videoUrl이 필요합니다.");

  const key = buildFrameCacheKey({ videoUrl, videoId, frameOptions });
  const frameDir = path.join(cacheDir, "_frames", key);
  const framesPath = path.join(frameDir, "frames.json");
  const statsPath = path.join(frameDir, "extraction_stats.json");
  const logPath = path.join(frameDir, "extract-video-frames.log");

  if (existsSync(framesPath) && existsSync(statsPath)) {
    const frames = JSON.parse(await readFile(framesPath, "utf8"));
    const extractionStats = JSON.parse(await readFile(statsPath, "utf8"));
    return { frameCacheHit: true, frameDir, frames, extractionStats };
  }

  await mkdir(frameDir, { recursive: true });
  const scriptPath = path.join(PROJECT_ROOT, "scripts/recipe-loop/extract-video-frames.py");
  const args = [
    scriptPath,
    videoUrl,
    "--video-id",
    videoId ?? "unknown",
    "--out-dir",
    frameDir,
    "--mode",
    frameOptions.mode,
    "--max-frames",
    String(frameOptions.maxFrames),
    "--storyboard-max-frames",
    String(frameOptions.storyboardMaxFrames),
    "--scene-detail",
    frameOptions.sceneDetail,
    "--scene-selection",
    frameOptions.sceneSelection,
    "--interval",
    String(frameOptions.interval),
  ];
  await runCommandImpl("python3", args, { cwd: PROJECT_ROOT, timeoutMs, logPath });
  const frames = JSON.parse(await readFile(framesPath, "utf8"));
  const extractionStats = JSON.parse(await readFile(statsPath, "utf8"));
  return { frameCacheHit: false, frameDir, frames, extractionStats };
}

async function writeFailure(resultDir, error, extra = {}) {
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    path.join(resultDir, "failure.json"),
    JSON.stringify({
      message: error.message,
      stack: error.stack,
      ...extra,
    }, null, 2) + "\n",
    "utf8",
  );
}

export function createCodexVisionClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_CODEX_VISION_MODEL || DEFAULT_MODEL;
  const cacheDir = options.cacheDir || CACHE_DIR;
  const frameOptions = {
    mode: options.frameMode || "scene",
    maxFrames: Number(options.maxFrames ?? DEFAULT_MAX_FRAMES),
    storyboardMaxFrames: Number(options.storyboardMaxFrames ?? DEFAULT_STORYBOARD_MAX_FRAMES),
    sceneDetail: options.sceneDetail || "dense",
    sceneSelection: options.sceneSelection || "balanced",
    interval: Number(options.interval ?? 10),
  };
  const batchSize = Number(options.batchSize ?? DEFAULT_BATCH_SIZE);
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const codexExec = options.codexExec ?? runCodexExec;
  const extractFrames = options.extractFrames ?? defaultExtractFrames;

  return {
    async generate({ prompt, videoUrl = null, cacheText = "" }) {
      const videoId = videoIdFromUrl(videoUrl) ?? hashText(videoUrl, 12);
      const frameResult = await extractFrames({
        videoUrl,
        videoId,
        cacheDir,
        frameOptions,
        timeoutMs,
        runCommandImpl: options.runCommand,
      });
      const frames = frameResult.frames ?? [];
      if (!Array.isArray(frames) || frames.length === 0) throw new Error("Codex Vision 프레임 추출 결과가 비었습니다.");

      const manifestHash = frameManifestHash(frames);
      const resultKey = buildCodexVisionCacheKey({ model, prompt, cacheText, frameManifestHash: manifestHash });
      const resultDir = path.join(cacheDir, resultKey);
      const finalJsonPath = path.join(resultDir, "final.json");

      if (!options.noCache && !options.refreshFinal && existsSync(finalJsonPath)) {
        const cached = JSON.parse(await readFile(finalJsonPath, "utf8"));
        return {
          json: cached.json,
          cached: true,
          model,
          provider: "codex-vision",
          meta: {
            provider: "codex-vision",
            usedVisual: true,
            frameCount: frames.length,
            frameMode: frameOptions.mode,
            codexBatchCount: cached.meta?.codexBatchCount ?? Math.ceil(frames.length / batchSize),
            codexBatchCacheHits: cached.meta?.codexBatchCacheHits ?? 0,
            frameCacheHit: frameResult.frameCacheHit,
            visionCacheHit: true,
            codexVisionCacheDir: resultDir,
            visualNotesCharCount: cached.meta?.visualNotesCharCount ?? null,
            finalVisualNotesCharCount: cached.meta?.finalVisualNotesCharCount ?? null,
            finalVisualNotesCompacted: cached.meta?.finalVisualNotesCompacted ?? null,
          },
        };
      }

      await mkdir(path.join(resultDir, "batch_reports"), { recursive: true });
      await copyIfExists(path.join(frameResult.frameDir, "frames.json"), path.join(resultDir, "frames.json"));
      await copyIfExists(path.join(frameResult.frameDir, "extraction_stats.json"), path.join(resultDir, "extraction_stats.json"));

      const batchOutputs = [];
      const batches = chunk(frames, batchSize);
      let batchCacheHits = 0;
      try {
        for (let index = 0; index < batches.length; index += 1) {
          const batchNo = String(index + 1).padStart(3, "0");
          const batchMarkdownPath = path.join(resultDir, "batch_reports", `batch_${batchNo}.md`);
          const batchMetaPath = path.join(resultDir, "batch_reports", `batch_${batchNo}.meta.json`);
          const signature = batchSignature(batches[index], batchSize);
          const reusableBatchOutput = options.noCache
            ? null
            : await readReusableBatchOutput(batchMarkdownPath, batchMetaPath, signature);
          if (reusableBatchOutput !== null) {
            batchOutputs.push(reusableBatchOutput);
            batchCacheHits += 1;
            continue;
          }

          const outputPath = path.join(resultDir, "batch_reports", `batch_${batchNo}.last-message.md`);
          const logPath = path.join(resultDir, "batch_reports", `batch_${batchNo}.log`);
          const batchPrompt = buildFrameAnalysisPrompt({ batch: batches[index], sourceText: cacheText });
          const output = await codexExec({
            prompt: batchPrompt,
            images: batches[index].map((frame) => frame.path),
            model,
            codexEffort: options.codexEffort,
            outputPath,
            logPath,
            timeoutMs,
          });
          await writeFile(batchMarkdownPath, output, "utf8");
          await writeFile(batchMetaPath, JSON.stringify(signature, null, 2) + "\n", "utf8");
          batchOutputs.push(output);
        }

        const visualNotes = batchOutputs.map((output, index) => `## Batch ${index + 1}\n\n${output}`).join("\n\n");
        await writeFile(path.join(resultDir, "visual_notes.md"), visualNotes, "utf8");
        const finalVisualNotes = compactVisualNotesForFinal(visualNotes);
        await writeFile(path.join(resultDir, "visual_notes.final.md"), finalVisualNotes, "utf8");

        const finalRawPath = path.join(resultDir, "final.raw.md");
        const finalLogPath = path.join(resultDir, "final.log");
        const finalRaw = await codexExec({
          prompt: buildFinalExtractionPrompt({ prompt, visualNotes: finalVisualNotes }),
          images: [],
          model,
          codexEffort: options.codexEffort,
          outputPath: finalRawPath,
          logPath: finalLogPath,
          timeoutMs,
        });
        await writeFile(finalRawPath, finalRaw, "utf8");

        let json;
        try {
          json = extractJsonFromText(finalRaw);
        } catch (parseError) {
          const repairRawPath = path.join(resultDir, "repair.raw.md");
          const repairLogPath = path.join(resultDir, "repair.log");
          await writeFile(
            path.join(resultDir, "parse_failure_before_repair.json"),
            JSON.stringify({ message: parseError.message }, null, 2) + "\n",
            "utf8",
          );
          const repairRaw = await codexExec({
            prompt: buildRepairPrompt(finalRaw),
            images: [],
            model,
            codexEffort: options.codexEffort,
            outputPath: repairRawPath,
            logPath: repairLogPath,
            timeoutMs,
          });
          await writeFile(repairRawPath, repairRaw, "utf8");
          json = extractJsonFromText(repairRaw);
        }

        if (!isObject(json) || !Array.isArray(json.recipes)) {
          throw new Error("Codex Vision 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
        }

        const meta = {
          provider: "codex-vision",
          model,
          clientVersion: CLIENT_VERSION,
          cached: false,
          usedVisual: true,
          frameCount: frames.length,
          frameMode: frameOptions.mode,
          codexBatchCount: batches.length,
          codexBatchCacheHits: batchCacheHits,
          frameCacheHit: frameResult.frameCacheHit,
          visionCacheHit: false,
          frameCacheDir: frameResult.frameDir,
          codexVisionCacheDir: resultDir,
          visualNotesCharCount: visualNotes.length,
          finalVisualNotesCharCount: finalVisualNotes.length,
          finalVisualNotesCompacted: finalVisualNotes.length < visualNotes.length,
          extractionStats: frameResult.extractionStats ?? {},
        };
        await writeFile(finalJsonPath, JSON.stringify({ key: resultKey, model, json, meta }, null, 2) + "\n", "utf8");
        await writeFile(
          path.join(resultDir, "run_meta.json"),
          JSON.stringify({
            key: resultKey,
            videoId,
            videoUrl,
            model,
            frameOptions,
            batchSize,
            promptHash: hashText(prompt),
            cacheTextHash: hashText(cacheText),
            frameManifestHash: manifestHash,
            ...meta,
          }, null, 2) + "\n",
          "utf8",
        );
        return { json, cached: false, model, provider: "codex-vision", meta };
      } catch (error) {
        await writeFailure(resultDir, error, {
          provider: "codex-vision",
          model,
          frameCacheDir: frameResult.frameDir,
          frameCount: frames.length,
        });
        throw error;
      }
    },
  };
}
