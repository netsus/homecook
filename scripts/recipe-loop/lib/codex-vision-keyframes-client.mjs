// Codex Vision keyframe client for recipe-loop.
// It keeps the old codex-vision path intact and adds a new two-stage flow:
// 1) a smaller model selects useful frames, 2) the final model extracts recipes from text + selected images.

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  defaultExtractFrames,
  extractJsonFromText,
  frameManifestHash,
  hashKey,
  hashText,
  runCodexExec,
  videoIdFromUrl,
} from "./codex-vision-client.mjs";

const PROJECT_ROOT = process.cwd();
const PROVIDER = "codex-vision-keyframes";
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/codex-vision-keyframes");
const CLIENT_VERSION = "codex-vision-keyframes-client-v1";
const SELECTOR_PROMPT_VERSION = "keyframe-selector-v1";
const FINAL_PROMPT_VERSION = "keyframe-final-v1";
const DEFAULT_FINAL_MODEL = "gpt-5.4";
const DEFAULT_SELECTOR_MODEL = "gpt-5.4-mini";
const DEFAULT_MAX_FRAMES = 120;
const DEFAULT_STORYBOARD_MAX_FRAMES = 0;
const DEFAULT_SELECTOR_CANDIDATE_LIMIT = 96;
const DEFAULT_KEYFRAME_TOTAL_LIMIT = 60;
const DEFAULT_KEYFRAMES_PER_RECIPE = 8;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  await cp(from, to, { recursive: true });
}

async function writeFailure(resultDir, error, extra = {}) {
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    path.join(resultDir, "failure.json"),
    JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...extra,
    }, null, 2) + "\n",
    "utf8",
  );
}

function frameBasename(frame) {
  return path.basename(frame?.path ?? "");
}

function frameDisplayLine(frame, index) {
  const score = frame.scene_score === null || frame.scene_score === undefined ? "" : `, scene_score=${frame.scene_score}`;
  return `- ${index + 1}. file=${frameBasename(frame)}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, reason=${frame.reason ?? "unknown"}${score}`;
}

function sampleEvenly(frames, limit) {
  if (!Number.isFinite(limit) || limit <= 0 || frames.length <= limit) return frames;
  if (limit === 1) return [frames[0]];

  const selected = [];
  const seen = new Set();
  for (let index = 0; index < limit; index += 1) {
    const frameIndex = Math.round((index * (frames.length - 1)) / (limit - 1));
    const frame = frames[frameIndex];
    const key = frame?.path ?? String(frameIndex);
    if (!seen.has(key)) {
      selected.push(frame);
      seen.add(key);
    }
  }

  for (const frame of frames) {
    if (selected.length >= limit) break;
    const key = frame?.path ?? String(selected.length);
    if (!seen.has(key)) {
      selected.push(frame);
      seen.add(key);
    }
  }
  return selected;
}

function buildSelectorPrompt({ sourceText, candidateFrames, totalLimit, perRecipeLimit }) {
  return [
    "너는 요리 영상 레시피 추출을 돕는 프레임 선별 담당자다.",
    "첨부 이미지는 같은 유튜브 영상에서 시간순으로 뽑은 후보 프레임이다.",
    "최종 레시피를 작성하지 말고, 최종 모델이 실제로 봐야 할 프레임 파일명만 고른다.",
    "",
    "선별 기준:",
    "1. 제목/설명란/댓글/자막에서 보이는 각 요리 후보를 먼저 떠올린다.",
    "2. 재료 카드, 재료가 놓인 장면, 재료 투입 장면, 양념 배합, 핵심 조리 단계가 보이는 프레임을 우선한다.",
    "3. 완성샷만 반복되는 프레임, 얼굴/잡담/광고/이벤트 장면은 제외한다.",
    "4. 비슷한 장면이 많으면 가장 정보가 많은 프레임만 남긴다.",
    "5. 파일명은 아래 목록의 file 값을 정확히 복사한다.",
    `6. selectedFrames는 전체 최대 ${totalLimit}개, 같은 recipeHint당 최대 ${perRecipeLimit}개로 제한한다.`,
    "",
    "출력은 설명 없이 JSON만 한다.",
    "스키마:",
    "{",
    "  \"recipeHints\": [{ \"title\": \"요리 후보명\", \"reason\": \"짧은 이유\" }],",
    "  \"selectedFrames\": [{ \"file\": \"frame_0001_00000.000.jpg\", \"recipeHint\": \"요리 후보명\", \"reason\": \"재료/단계 근거\" }]",
    "}",
    "",
    "텍스트 소스:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "후보 프레임 목록:",
    ...candidateFrames.map(frameDisplayLine),
  ].join("\n");
}

function buildFinalPrompt({ prompt, sourceText, selectedFrames, selectorJson }) {
  const selectedFrameLines = selectedFrames.map((frame, index) => frameDisplayLine(frame, index));
  return [
    prompt,
    "",
    "추가 입력: 아래 첨부 이미지는 프레임 선별 모델이 고른 핵심 프레임이다.",
    "이 프레임들은 최종 근거를 찾기 위한 책갈피일 뿐이며, selector JSON 자체를 정답처럼 믿지 않는다.",
    "최종 판단은 제목, 설명란, 댓글, 자막/발화, 첨부 프레임의 실제 화면을 함께 보고 한다.",
    "",
    "중요한 우선순위:",
    "1. 설명란/댓글/자막/발화에 재료명과 수량이 명시되면 그 값을 화면 추정보다 우선한다.",
    "2. 화면에서만 보이는 수량은 amountBasis를 visual-estimate로 둔다.",
    "3. '초록색 줄기채소', '노란색 긴 재료' 같은 추상 이름은 최후의 수단이다. 제목/설명/자막/화면이 구체 재료를 가리키면 오이, 달걀말이, 쯔유처럼 구체명으로 쓴다.",
    "4. 다중 레시피 영상은 제목/타임라인 후보와 프레임 구간을 대조해서 recipes[]를 분리한다.",
    "5. 영상에 없는 재료나 단계를 요리 상식으로 추가하지 않는다.",
    "",
    "선택 프레임 목록:",
    ...selectedFrameLines,
    "",
    "selector JSON(참고용, 최종 추출 결과 아님):",
    JSON.stringify(selectorJson, null, 2),
    "",
    "텍스트 소스 원문 재확인:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "위 정보를 바탕으로 기존 스키마의 JSON만 출력한다.",
  ].join("\n");
}

function buildCodexVisionKeyframesCacheKey({
  model,
  selectorModel,
  prompt,
  cacheText,
  frameManifest,
  candidateManifest,
  keyframeTotalLimit,
  keyframesPerRecipe,
  selectorCandidateLimit,
}) {
  return hashKey({
    provider: PROVIDER,
    model,
    selectorModel,
    promptHash: hashText(prompt),
    cacheTextHash: hashText(cacheText),
    frameManifest,
    candidateManifest,
    keyframeTotalLimit,
    keyframesPerRecipe,
    selectorCandidateLimit,
    clientVersion: CLIENT_VERSION,
    selectorPromptVersion: SELECTOR_PROMPT_VERSION,
    finalPromptVersion: FINAL_PROMPT_VERSION,
  });
}

function frameLookup(frames) {
  const byFile = new Map();
  const byPath = new Map();
  frames.forEach((frame, index) => {
    byFile.set(frameBasename(frame), frame);
    byPath.set(frame.path, frame);
    byFile.set(String(index + 1), frame);
    if (frame.index !== undefined && frame.index !== null) byFile.set(String(frame.index), frame);
  });
  return { byFile, byPath };
}

function selectedFrameFile(entry) {
  if (typeof entry === "string") return entry;
  if (!isObject(entry)) return null;
  return entry.file ?? entry.filename ?? entry.path ?? entry.frame ?? entry.frameFile ?? null;
}

function selectedFrameRecipe(entry) {
  if (!isObject(entry)) return "전체";
  return String(entry.recipeHint ?? entry.recipe ?? entry.title ?? entry.dish ?? "전체").trim() || "전체";
}

function normalizeSelectedFrames(selectorJson, candidateFrames, { totalLimit, perRecipeLimit }) {
  const rawEntries = Array.isArray(selectorJson?.selectedFrames)
    ? selectorJson.selectedFrames
    : (Array.isArray(selectorJson?.frames) ? selectorJson.frames : []);
  const { byFile, byPath } = frameLookup(candidateFrames);
  const selected = [];
  const seenPaths = new Set();
  const recipeCounts = new Map();

  for (const entry of rawEntries) {
    const rawFile = selectedFrameFile(entry);
    if (!rawFile) continue;
    const file = path.basename(String(rawFile));
    const frame = byFile.get(file) ?? byPath.get(String(rawFile)) ?? byFile.get(String(rawFile));
    if (!frame || seenPaths.has(frame.path)) continue;

    const recipe = selectedFrameRecipe(entry);
    const count = recipeCounts.get(recipe) ?? 0;
    if (count >= perRecipeLimit) continue;

    selected.push(frame);
    seenPaths.add(frame.path);
    recipeCounts.set(recipe, count + 1);
    if (selected.length >= totalLimit) break;
  }

  if (selected.length === 0) {
    throw new Error("Codex Vision keyframes selector가 사용할 수 있는 프레임을 하나도 고르지 못했습니다.");
  }
  return selected;
}

export function createCodexVisionKeyframesClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_CODEX_VISION_MODEL || DEFAULT_FINAL_MODEL;
  const selectorModel = options.selectorModel || process.env.RECIPE_LOOP_CODEX_VISION_SELECTOR_MODEL || DEFAULT_SELECTOR_MODEL;
  const cacheDir = options.cacheDir || CACHE_DIR;
  const frameOptions = {
    mode: options.frameMode || "scene",
    maxFrames: positiveInt(options.maxFrames, DEFAULT_MAX_FRAMES),
    storyboardMaxFrames: Number(options.storyboardMaxFrames ?? DEFAULT_STORYBOARD_MAX_FRAMES),
    sceneDetail: options.sceneDetail || "dense",
    sceneSelection: options.sceneSelection || "balanced",
    interval: Number(options.interval ?? 10),
  };
  const selectorCandidateLimit = positiveInt(options.selectorCandidateLimit, DEFAULT_SELECTOR_CANDIDATE_LIMIT);
  const keyframeTotalLimit = positiveInt(options.keyframeTotalLimit, DEFAULT_KEYFRAME_TOTAL_LIMIT);
  const keyframesPerRecipe = positiveInt(options.keyframesPerRecipe, DEFAULT_KEYFRAMES_PER_RECIPE);
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
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
      if (!Array.isArray(frames) || frames.length === 0) throw new Error("Codex Vision keyframes 프레임 추출 결과가 비었습니다.");

      const candidateFrames = sampleEvenly(frames, selectorCandidateLimit);
      const manifestHash = frameManifestHash(frames);
      const candidateManifestHash = frameManifestHash(candidateFrames);
      const resultKey = buildCodexVisionKeyframesCacheKey({
        model,
        selectorModel,
        prompt,
        cacheText,
        frameManifest: manifestHash,
        candidateManifest: candidateManifestHash,
        keyframeTotalLimit,
        keyframesPerRecipe,
        selectorCandidateLimit,
      });
      const resultDir = path.join(cacheDir, resultKey);
      const finalJsonPath = path.join(resultDir, "final.json");

      if (!options.noCache && !options.refreshFinal && existsSync(finalJsonPath)) {
        const cached = JSON.parse(await readFile(finalJsonPath, "utf8"));
        return {
          json: cached.json,
          cached: true,
          model,
          provider: PROVIDER,
          meta: {
            ...(cached.meta ?? {}),
            provider: PROVIDER,
            cached: true,
            frameCacheHit: frameResult.frameCacheHit,
            visionCacheHit: true,
            codexVisionKeyframesCacheDir: resultDir,
          },
        };
      }

      await mkdir(resultDir, { recursive: true });
      await copyIfExists(path.join(frameResult.frameDir, "frames.json"), path.join(resultDir, "frames.json"));
      await copyIfExists(path.join(frameResult.frameDir, "extraction_stats.json"), path.join(resultDir, "extraction_stats.json"));

      let stage = "selector";
      try {
        const selectorPrompt = buildSelectorPrompt({
          sourceText: cacheText,
          candidateFrames,
          totalLimit: keyframeTotalLimit,
          perRecipeLimit: keyframesPerRecipe,
        });
        const selectorPromptPath = path.join(resultDir, "selector.prompt.md");
        const selectorRawPath = path.join(resultDir, "selector.raw.md");
        const selectorLogPath = path.join(resultDir, "selector.log");
        const selectorJsonPath = path.join(resultDir, "selector.json");
        await writeFile(selectorPromptPath, selectorPrompt, "utf8");

        let selectorJson;
        if (!options.noCache && existsSync(selectorJsonPath)) {
          selectorJson = JSON.parse(await readFile(selectorJsonPath, "utf8"));
        } else {
          const selectorRaw = await codexExec({
            prompt: selectorPrompt,
            images: candidateFrames.map((frame) => frame.path),
            model: selectorModel,
            codexEffort: options.selectorEffort ?? options.codexEffort,
            outputPath: selectorRawPath,
            logPath: selectorLogPath,
            timeoutMs,
          });
          await writeFile(selectorRawPath, selectorRaw, "utf8");
          selectorJson = extractJsonFromText(selectorRaw);
          await writeFile(selectorJsonPath, JSON.stringify(selectorJson, null, 2) + "\n", "utf8");
        }

        const selectedFrames = normalizeSelectedFrames(selectorJson, candidateFrames, {
          totalLimit: keyframeTotalLimit,
          perRecipeLimit: keyframesPerRecipe,
        });
        const selectedFrameHash = frameManifestHash(selectedFrames);
        await writeFile(
          path.join(resultDir, "selected_frames.json"),
          JSON.stringify({
            selectedFrameHash,
            selectedFrameCount: selectedFrames.length,
            selectedFrames: selectedFrames.map((frame) => ({
              index: frame.index,
              timestamp_sec: frame.timestamp_sec,
              timestamp: frame.timestamp,
              file: frameBasename(frame),
              path: frame.path,
              reason: frame.reason ?? null,
              scene_score: frame.scene_score ?? null,
            })),
          }, null, 2) + "\n",
          "utf8",
        );

        stage = "final";
        const finalPrompt = buildFinalPrompt({ prompt, sourceText: cacheText, selectedFrames, selectorJson });
        const finalPromptPath = path.join(resultDir, "final.prompt.md");
        const finalRawPath = path.join(resultDir, "final.raw.md");
        const finalLogPath = path.join(resultDir, "final.log");
        await writeFile(finalPromptPath, finalPrompt, "utf8");

        const finalRaw = await codexExec({
          prompt: finalPrompt,
          images: selectedFrames.map((frame) => frame.path),
          model,
          codexEffort: options.codexEffort,
          outputPath: finalRawPath,
          logPath: finalLogPath,
          timeoutMs,
        });
        await writeFile(finalRawPath, finalRaw, "utf8");

        const json = extractJsonFromText(finalRaw);
        if (!isObject(json) || !Array.isArray(json.recipes)) {
          throw new Error("Codex Vision keyframes 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
        }

        const meta = {
          provider: PROVIDER,
          model,
          selectorModel,
          clientVersion: CLIENT_VERSION,
          selectorPromptVersion: SELECTOR_PROMPT_VERSION,
          finalPromptVersion: FINAL_PROMPT_VERSION,
          cached: false,
          usedVisual: true,
          frameCount: frames.length,
          candidateFrameCount: candidateFrames.length,
          selectedFrameCount: selectedFrames.length,
          selectedFrameHash,
          frameMode: frameOptions.mode,
          frameCacheHit: frameResult.frameCacheHit,
          visionCacheHit: false,
          frameCacheDir: frameResult.frameDir,
          codexVisionKeyframesCacheDir: resultDir,
          extractionStats: frameResult.extractionStats ?? {},
        };
        await writeFile(finalJsonPath, JSON.stringify({ key: resultKey, model, selectorModel, json, meta }, null, 2) + "\n", "utf8");
        await writeFile(
          path.join(resultDir, "run_meta.json"),
          JSON.stringify({
            key: resultKey,
            videoId,
            videoUrl,
            model,
            selectorModel,
            frameOptions,
            selectorCandidateLimit,
            keyframeTotalLimit,
            keyframesPerRecipe,
            promptHash: hashText(prompt),
            cacheTextHash: hashText(cacheText),
            frameManifestHash: manifestHash,
            candidateManifestHash,
            ...meta,
          }, null, 2) + "\n",
          "utf8",
        );
        return { json, cached: false, model, provider: PROVIDER, meta };
      } catch (error) {
        await writeFailure(resultDir, error, {
          provider: PROVIDER,
          stage,
          model,
          selectorModel,
          frameCacheDir: frameResult.frameDir,
          frameCount: frames.length,
          candidateFrameCount: candidateFrames.length,
        });
        throw error;
      }
    },
  };
}
