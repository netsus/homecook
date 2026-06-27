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
const SEGMENT_PROMPT_VERSION = "keyframe-segment-plan-v1";
const SEGMENT_SELECTOR_PROMPT_VERSION = "keyframe-segment-selector-v1";
const DEFAULT_FINAL_MODEL = "gpt-5.4";
const DEFAULT_SELECTOR_MODEL = "gpt-5.4-mini";
const DEFAULT_SEGMENT_MODEL = "gpt-5.4-mini";
const DEFAULT_MAX_FRAMES = 120;
const DEFAULT_STORYBOARD_MAX_FRAMES = 0;
const DEFAULT_SELECTOR_CANDIDATE_LIMIT = 96;
const DEFAULT_KEYFRAME_TOTAL_LIMIT = 60;
const DEFAULT_KEYFRAMES_PER_RECIPE = 8;
const DEFAULT_KEYFRAME_MODE = "global";
const DEFAULT_SEGMENT_PADDING_SEC = 8;
const DEFAULT_SEGMENT_MIN_FRAMES = 8;
const DEFAULT_SEGMENT_MAX_FRAMES = 24;
const DEFAULT_SEGMENT_MAX_COUNT = 12;
const DEFAULT_SEGMENT_FRAME_TOTAL_LIMIT = 64;
const DEFAULT_SEGMENT_OVERLAP_TOLERANCE_SEC = 15;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function keyframeModeFrom(value) {
  const mode = String(value ?? DEFAULT_KEYFRAME_MODE).trim() || DEFAULT_KEYFRAME_MODE;
  if (!["global", "segmented"].includes(mode)) {
    throw new Error(`지원하지 않는 keyframe mode입니다: ${mode}. 사용 가능: global, segmented`);
  }
  return mode;
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

function frameTimestampSec(frame) {
  const direct = Number(frame?.timestamp_sec);
  if (Number.isFinite(direct)) return direct;

  return parseTimeSec(frame?.timestamp);
}

function parseTimeSec(value) {
  if (value === null || value === undefined || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  const timestamp = String(value ?? "").trim();
  const match = timestamp.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (match) {
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = Number(`0.${match[4] ?? "0"}`);
    return hours * 3600 + minutes * 60 + seconds + fraction;
  }

  const shortMatch = timestamp.match(/^(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (shortMatch) {
    const minutes = Number(shortMatch[1]);
    const seconds = Number(shortMatch[2]);
    const fraction = Number(`0.${shortMatch[3] ?? "0"}`);
    return minutes * 60 + seconds + fraction;
  }

  return null;
}

function maxFrameTimestampSec(frames) {
  return frames.reduce((max, frame) => {
    const timestamp = frameTimestampSec(frame);
    return timestamp === null ? max : Math.max(max, timestamp);
  }, 0);
}

function safeSegmentId(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || fallback;
}

function buildSegmentPlanPrompt({ sourceText, frames, segmentMaxCount, segmentFrameTotalLimit }) {
  return [
    "너는 다중 요리 영상의 레시피별 시간 구간을 나누는 담당자다.",
    "최종 레시피를 작성하지 말고, 어떤 시간 구간이 어떤 레시피 후보인지 JSON으로만 나눈다.",
    "",
    "중요 규칙:",
    "1. 제목, 설명란, 작성자 댓글, 자막/발화, recipe_candidate_hints를 먼저 본다.",
    "2. golden.json, 채점 결과, validation/holdout 정답은 절대 보지 않는다.",
    "3. 소스/토핑/플레이팅만 따로 나온 짧은 장면은 별도 recipe가 아니라 관련 recipe의 연속 구간으로 본다.",
    "4. 같은 레시피가 연속으로 이어지면 하나의 segment로 묶는다.",
    "5. 너무 넓게 잡아 다른 레시피 재료가 섞이지 않게 한다.",
    `6. segments는 최대 ${segmentMaxCount}개, frameBudget 총합은 최대 ${segmentFrameTotalLimit}이다.`,
    "",
    "출력은 설명 없이 JSON만 한다.",
    "스키마:",
    "{",
    "  \"segments\": [",
    "    {",
    "      \"segmentId\": \"seg-01\",",
    "      \"titleHint\": \"요리 후보명\",",
    "      \"startSec\": 0,",
    "      \"endSec\": 30,",
    "      \"confidence\": 0.8,",
    "      \"textEvidence\": [\"짧은 근거\"],",
    "      \"frameBudget\": 8,",
    "      \"notes\": \"짧은 메모\"",
    "    }",
    "  ]",
    "}",
    "",
    "텍스트 소스:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "전체 프레임 manifest:",
    ...frames.map(frameDisplayLine),
  ].join("\n");
}

function normalizeTextEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
}

function normalizeSegmentPlan(rawPlan, { maxCount, maxFrameSec, totalFrameLimit, perSegmentMaxFrames, overlapToleranceSec }) {
  const rawSegments = Array.isArray(rawPlan?.segments) ? rawPlan.segments : [];
  if (rawSegments.length === 0) throw new Error("segment plan은 segments 배열을 1개 이상 포함해야 합니다.");
  if (rawSegments.length > maxCount) throw new Error(`segment plan segments 개수가 상한(${maxCount})을 넘었습니다.`);

  const segments = rawSegments.map((raw, index) => {
    if (!isObject(raw)) throw new Error(`segment ${index + 1}이 object가 아닙니다.`);
    const fallbackId = `seg-${String(index + 1).padStart(2, "0")}`;
    const segmentId = safeSegmentId(raw.segmentId, fallbackId);
    const titleHint = String(raw.titleHint ?? raw.title ?? raw.recipeHint ?? "").trim();
    if (!titleHint) throw new Error(`${segmentId} titleHint가 비었습니다.`);

    const startSec = parseTimeSec(raw.startSec ?? raw.start ?? raw.start_time);
    const endSecRaw = parseTimeSec(raw.endSec ?? raw.end ?? raw.end_time);
    if (startSec === null || endSecRaw === null) {
      throw new Error(`${segmentId} startSec/endSec는 숫자여야 합니다.`);
    }
    if (startSec < 0 || endSecRaw < 0) throw new Error(`${segmentId} startSec/endSec는 음수일 수 없습니다.`);
    const endSec = maxFrameSec > 0 && endSecRaw > maxFrameSec ? maxFrameSec : endSecRaw;
    if (startSec >= endSec) throw new Error(`${segmentId} startSec는 endSec보다 작아야 합니다.`);

    const confidence = Number(raw.confidence);
    const frameBudget = Math.min(positiveInt(raw.frameBudget, DEFAULT_SEGMENT_MIN_FRAMES), perSegmentMaxFrames);
    return {
      segmentId,
      titleHint,
      startSec,
      endSec,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      textEvidence: normalizeTextEvidence(raw.textEvidence),
      frameBudget,
      notes: raw.notes ? String(raw.notes).trim() : null,
    };
  }).sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  const frameBudgetTotal = segments.reduce((sum, segment) => sum + segment.frameBudget, 0);
  if (frameBudgetTotal > totalFrameLimit) {
    let remainingOverage = frameBudgetTotal - totalFrameLimit;
    const adjustable = [...segments].sort((a, b) => b.frameBudget - a.frameBudget);
    while (remainingOverage > 0) {
      const target = adjustable.find((segment) => segment.frameBudget > 1);
      if (!target) break;
      target.frameBudget -= 1;
      target.frameBudgetAdjusted = true;
      remainingOverage -= 1;
      adjustable.sort((a, b) => b.frameBudget - a.frameBudget);
    }
    if (remainingOverage > 0) {
      throw new Error(`segment frameBudget 총합(${frameBudgetTotal})이 상한(${totalFrameLimit})을 넘었습니다.`);
    }
  }

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const overlap = previous.endSec - current.startSec;
    if (overlap > overlapToleranceSec) {
      throw new Error(`${previous.segmentId}와 ${current.segmentId}의 overlap(${overlap.toFixed(1)}초)이 너무 큽니다.`);
    }
  }

  return { segments };
}

function framesInRange(frames, startSec, endSec) {
  return frames.filter((frame) => {
    const timestamp = frameTimestampSec(frame);
    return timestamp !== null && timestamp >= startSec && timestamp <= endSec;
  });
}

function segmentCandidateFrames({ frames, segment, paddingSec, minFrames, maxFrames, maxFrameSec }) {
  const start = Math.max(0, segment.startSec - paddingSec);
  const end = Math.min(maxFrameSec || segment.endSec + paddingSec, segment.endSec + paddingSec);
  let candidates = framesInRange(frames, start, end);
  let widened = false;

  if (candidates.length < minFrames) {
    widened = true;
    const widenedPadding = paddingSec * 3;
    candidates = framesInRange(
      frames,
      Math.max(0, segment.startSec - widenedPadding),
      Math.min(maxFrameSec || segment.endSec + widenedPadding, segment.endSec + widenedPadding),
    );
  }

  if (candidates.length === 0) {
    throw new Error(`${segment.segmentId}(${segment.titleHint}) segment의 프레임 후보가 비었습니다.`);
  }

  return {
    candidates: sampleEvenly(candidates, maxFrames),
    candidateCountBeforeLimit: candidates.length,
    widened,
  };
}

function buildSegmentSelectorPrompt({ sourceText, segment, candidateFrames }) {
  const budget = segment.frameBudget;
  return [
    "너는 요리 영상 레시피 추출을 돕는 구간별 프레임 선별 담당자다.",
    "첨부 이미지는 전체 영상이 아니라 아래 segment 안에서만 뽑은 후보 프레임이다.",
    "최종 레시피를 작성하지 말고, 최종 모델이 이 segment를 이해하기 위해 봐야 할 프레임 파일명만 고른다.",
    "",
    `segmentId: ${segment.segmentId}`,
    `titleHint: ${segment.titleHint}`,
    `time: ${segment.startSec}-${segment.endSec}`,
    `textEvidence: ${segment.textEvidence.length ? segment.textEvidence.join(" / ") : "(없음)"}`,
    `frameBudget: ${budget}`,
    "",
    "선별 기준:",
    "1. 이 segment의 레시피만 판단한다. 다른 segment의 재료, 토핑, 플레이팅을 섞지 않는다.",
    "2. 완성샷보다 재료 카드, 계량, 양념 배합, 재료 투입, 조리 상태 전환 장면을 우선한다.",
    "3. 된장, 쯔유, 액젓, 미나리, 우삼겹, 스프처럼 작은 장면으로 지나가는 핵심 재료를 놓치지 않는다.",
    "4. 비슷한 장면이 많으면 가장 정보가 많은 프레임만 남긴다.",
    "5. 파일명은 아래 목록의 file 값을 정확히 복사한다.",
    `6. selectedFrames는 최대 ${budget}개다.`,
    "",
    "출력은 설명 없이 JSON만 한다.",
    "스키마:",
    "{",
    "  \"selectedFrames\": [{ \"file\": \"frame_0001_00000.000.jpg\", \"reason\": \"재료/단계 근거\" }]",
    "}",
    "",
    "텍스트 소스:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "후보 프레임 목록:",
    ...candidateFrames.map(frameDisplayLine),
  ].join("\n");
}

function dedupeFrames(frames) {
  const selected = [];
  const seen = new Set();
  for (const frame of frames) {
    const key = frame?.path ?? frameBasename(frame);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(frame);
  }
  return selected;
}

function buildSegmentedFinalPrompt({ prompt, sourceText, segmentPlan, segmentKeyframes }) {
  const segmentBlocks = segmentKeyframes.segments.map((entry) => [
    `[SEGMENT ${entry.segmentId}]`,
    `titleHint: ${entry.titleHint}`,
    `time: ${entry.startSec}-${entry.endSec}`,
    `textEvidence: ${entry.textEvidence.length ? entry.textEvidence.join(" / ") : "(없음)"}`,
    "selectedFrames:",
    ...entry.selectedFrames.map((frame, index) => `- ${index + 1}. file=${frame.file}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, reason=${frame.selectionReason ?? frame.reason ?? "unknown"}`),
  ].join("\n")).join("\n\n");

  return [
    prompt,
    "",
    "추가 입력: 아래는 레시피별 시간 구간을 먼저 나눈 뒤, 각 구간 안에서만 고른 핵심 프레임 묶음이다.",
    "segment plan과 selected frames는 책갈피일 뿐이며, 최종 판단은 제목, 설명란, 댓글, 자막/발화, 첨부 프레임의 실제 화면을 함께 보고 한다.",
    "",
    "중요한 우선순위:",
    "1. 각 SEGMENT의 재료와 단계를 다른 SEGMENT로 섞지 않는다.",
    "2. 같은 요리의 연속 구간으로 보일 때만 하나의 recipe로 합친다.",
    "3. 소스, 토핑, 플레이팅만 따로 나온 segment는 별도 recipe로 만들지 말고 관련 recipe의 재료/단계에 합친다.",
    "4. 설명란/댓글/자막/발화에 재료명과 수량이 명시되면 화면 추정보다 우선한다.",
    "5. 화면에서만 보이는 수량은 amountBasis를 visual-estimate로 둔다.",
    "6. '초록색 줄기채소', '노란색 긴 재료' 같은 추상 이름은 최후의 수단이다.",
    "7. 영상에 없는 재료나 단계를 요리 상식으로 추가하지 않는다.",
    "",
    "segment plan JSON:",
    JSON.stringify(segmentPlan, null, 2),
    "",
    "segment별 선택 프레임:",
    segmentBlocks,
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

function buildCodexVisionSegmentedKeyframesCacheKey({
  model,
  selectorModel,
  segmentModel,
  prompt,
  cacheText,
  frameManifest,
  frameOptions,
  segmentOptions,
}) {
  return hashKey({
    provider: PROVIDER,
    keyframeMode: "segmented",
    model,
    selectorModel,
    segmentModel,
    promptHash: hashText(prompt),
    cacheTextHash: hashText(cacheText),
    frameManifest,
    frameOptions,
    segmentOptions,
    clientVersion: CLIENT_VERSION,
    segmentPromptVersion: SEGMENT_PROMPT_VERSION,
    segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
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

async function runSegmentedKeyframesFlow({
  prompt,
  videoUrl,
  cacheText,
  videoId,
  frames,
  frameResult,
  manifestHash,
  cacheDir,
  model,
  selectorModel,
  segmentModel,
  frameOptions,
  segmentOptions,
  codexExec,
  options,
  timeoutMs,
}) {
  const resultKey = buildCodexVisionSegmentedKeyframesCacheKey({
    model,
    selectorModel,
    segmentModel,
    prompt,
    cacheText,
    frameManifest: manifestHash,
    frameOptions,
    segmentOptions,
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
        keyframeMode: "segmented",
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

  let stage = "segment-plan";
  let segmentPlan = null;
  let segmentKeyframes = null;
  try {
    const maxFrameSec = maxFrameTimestampSec(frames);
    const segmentPrompt = buildSegmentPlanPrompt({
      sourceText: cacheText,
      frames,
      segmentMaxCount: segmentOptions.maxCount,
      segmentFrameTotalLimit: segmentOptions.frameTotalLimit,
    });
    const segmentPromptPath = path.join(resultDir, "segment-plan.prompt.md");
    const segmentRawPath = path.join(resultDir, "segment-plan.raw.md");
    const segmentLogPath = path.join(resultDir, "segment-plan.log");
    const segmentJsonPath = path.join(resultDir, "segment-plan.json");
    await writeFile(segmentPromptPath, segmentPrompt, "utf8");

    if (!options.noCache && existsSync(segmentJsonPath)) {
      segmentPlan = JSON.parse(await readFile(segmentJsonPath, "utf8"));
    } else {
      const segmentRaw = await codexExec({
        prompt: segmentPrompt,
        images: [],
        model: segmentModel,
        codexEffort: options.segmentEffort ?? options.selectorEffort ?? options.codexEffort,
        outputPath: segmentRawPath,
        logPath: segmentLogPath,
        timeoutMs,
      });
      await writeFile(segmentRawPath, segmentRaw, "utf8");

      const rawPlan = extractJsonFromText(segmentRaw);
      stage = "segment-normalize";
      segmentPlan = normalizeSegmentPlan(rawPlan, {
        maxCount: segmentOptions.maxCount,
        maxFrameSec,
        totalFrameLimit: segmentOptions.frameTotalLimit,
        perSegmentMaxFrames: segmentOptions.maxFrames,
        overlapToleranceSec: segmentOptions.overlapToleranceSec,
      });
      await writeFile(segmentJsonPath, JSON.stringify(segmentPlan, null, 2) + "\n", "utf8");
    }

    stage = "segment-selector";
    const segmentEntries = [];
    const selectedFramesWithSegment = [];
    let candidateFrameCount = 0;
    for (const segment of segmentPlan.segments) {
      const candidateResult = segmentCandidateFrames({
        frames,
        segment,
        paddingSec: segmentOptions.paddingSec,
        minFrames: segmentOptions.minFrames,
        maxFrames: segmentOptions.maxFrames,
        maxFrameSec,
      });
      const candidateFrames = candidateResult.candidates;
      candidateFrameCount += candidateFrames.length;
      const segmentSelectorPrompt = buildSegmentSelectorPrompt({ sourceText: cacheText, segment, candidateFrames });
      const selectorPrefix = `segment-${segment.segmentId}.selector`;
      const selectorPromptPath = path.join(resultDir, `${selectorPrefix}.prompt.md`);
      const selectorRawPath = path.join(resultDir, `${selectorPrefix}.raw.md`);
      const selectorLogPath = path.join(resultDir, `${selectorPrefix}.log`);
      const selectorJsonPath = path.join(resultDir, `${selectorPrefix}.json`);
      await writeFile(selectorPromptPath, segmentSelectorPrompt, "utf8");

      let selectorJson;
      if (!options.noCache && existsSync(selectorJsonPath)) {
        selectorJson = JSON.parse(await readFile(selectorJsonPath, "utf8"));
      } else {
        const selectorRaw = await codexExec({
          prompt: segmentSelectorPrompt,
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
        totalLimit: segment.frameBudget,
        perRecipeLimit: segment.frameBudget,
      });
      const selectedForJson = selectedFrames.map((frame) => {
        const rawEntry = (Array.isArray(selectorJson.selectedFrames) ? selectorJson.selectedFrames : [])
          .find((entry) => path.basename(String(selectedFrameFile(entry) ?? "")) === frameBasename(frame));
        return {
          index: frame.index,
          timestamp_sec: frame.timestamp_sec,
          timestamp: frame.timestamp,
          file: frameBasename(frame),
          path: frame.path,
          reason: frame.reason ?? null,
          selectionReason: isObject(rawEntry) ? (rawEntry.reason ?? null) : null,
          scene_score: frame.scene_score ?? null,
        };
      });

      segmentEntries.push({
        ...segment,
        paddedStartSec: Math.max(0, segment.startSec - segmentOptions.paddingSec),
        paddedEndSec: Math.min(maxFrameSec || segment.endSec + segmentOptions.paddingSec, segment.endSec + segmentOptions.paddingSec),
        candidateFrameCountBeforeLimit: candidateResult.candidateCountBeforeLimit,
        candidateFrameCount: candidateFrames.length,
        widened: candidateResult.widened,
        selectedFrameCount: selectedForJson.length,
        selectedFrames: selectedForJson,
      });
      selectedFramesWithSegment.push(...selectedFrames.map((frame) => ({ frame, segment })));
    }

    const finalSelectedFrames = dedupeFrames(selectedFramesWithSegment.map((entry) => entry.frame));
    const selectedFrameHash = frameManifestHash(finalSelectedFrames);
    segmentKeyframes = {
      selectedFrameHash,
      selectedFrameCount: finalSelectedFrames.length,
      segmentSelectedFrameCount: selectedFramesWithSegment.length,
      segments: segmentEntries,
    };
    await writeFile(path.join(resultDir, "segment-keyframes.json"), JSON.stringify(segmentKeyframes, null, 2) + "\n", "utf8");
    await writeFile(
      path.join(resultDir, "selected_frames.json"),
      JSON.stringify({
        selectedFrameHash,
        selectedFrameCount: finalSelectedFrames.length,
        keyframeMode: "segmented",
        selectedFrames: selectedFramesWithSegment.map(({ frame, segment }) => ({
          index: frame.index,
          timestamp_sec: frame.timestamp_sec,
          timestamp: frame.timestamp,
          file: frameBasename(frame),
          path: frame.path,
          reason: frame.reason ?? null,
          scene_score: frame.scene_score ?? null,
          segmentId: segment.segmentId,
          titleHint: segment.titleHint,
        })),
      }, null, 2) + "\n",
      "utf8",
    );

    stage = "final";
    const finalPrompt = buildSegmentedFinalPrompt({ prompt, sourceText: cacheText, segmentPlan, segmentKeyframes });
    const finalPromptPath = path.join(resultDir, "final.prompt.md");
    const finalRawPath = path.join(resultDir, "final.raw.md");
    const finalLogPath = path.join(resultDir, "final.log");
    await writeFile(finalPromptPath, finalPrompt, "utf8");

    const finalRaw = await codexExec({
      prompt: finalPrompt,
      images: finalSelectedFrames.map((frame) => frame.path),
      model,
      codexEffort: options.codexEffort,
      outputPath: finalRawPath,
      logPath: finalLogPath,
      timeoutMs,
    });
    await writeFile(finalRawPath, finalRaw, "utf8");

    const json = extractJsonFromText(finalRaw);
    if (!isObject(json) || !Array.isArray(json.recipes)) {
      throw new Error("Codex Vision keyframes segmented 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
    }

    const meta = {
      provider: PROVIDER,
      keyframeMode: "segmented",
      model,
      selectorModel,
      segmentModel,
      clientVersion: CLIENT_VERSION,
      segmentPromptVersion: SEGMENT_PROMPT_VERSION,
      segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
      finalPromptVersion: FINAL_PROMPT_VERSION,
      cached: false,
      usedVisual: true,
      frameCount: frames.length,
      candidateFrameCount,
      segmentCount: segmentPlan.segments.length,
      selectedFrameCount: finalSelectedFrames.length,
      segmentSelectedFrameCount: selectedFramesWithSegment.length,
      selectedFrameHash,
      segmentPlanHash: hashText(JSON.stringify(segmentPlan)),
      segmentKeyframesHash: hashText(JSON.stringify(segmentKeyframes)),
      frameMode: frameOptions.mode,
      frameCacheHit: frameResult.frameCacheHit,
      visionCacheHit: false,
      frameCacheDir: frameResult.frameDir,
      codexVisionKeyframesCacheDir: resultDir,
      extractionStats: frameResult.extractionStats ?? {},
    };
    await writeFile(finalJsonPath, JSON.stringify({ key: resultKey, model, selectorModel, segmentModel, json, meta }, null, 2) + "\n", "utf8");
    await writeFile(
      path.join(resultDir, "run_meta.json"),
      JSON.stringify({
        key: resultKey,
        videoId,
        videoUrl,
        model,
        selectorModel,
        segmentModel,
        frameOptions,
        segmentOptions,
        promptHash: hashText(prompt),
        cacheTextHash: hashText(cacheText),
        frameManifestHash: manifestHash,
        ...meta,
      }, null, 2) + "\n",
      "utf8",
    );
    return { json, cached: false, model, provider: PROVIDER, meta };
  } catch (error) {
    await writeFailure(resultDir, error, {
      provider: PROVIDER,
      keyframeMode: "segmented",
      stage,
      model,
      selectorModel,
      segmentModel,
      frameCacheDir: frameResult.frameDir,
      frameCount: frames.length,
      segmentPlan,
      segmentKeyframes,
    });
    throw error;
  }
}

export function createCodexVisionKeyframesClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_CODEX_VISION_MODEL || DEFAULT_FINAL_MODEL;
  const selectorModel = options.selectorModel || process.env.RECIPE_LOOP_CODEX_VISION_SELECTOR_MODEL || DEFAULT_SELECTOR_MODEL;
  const segmentModel = options.segmentModel || process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_MODEL || DEFAULT_SEGMENT_MODEL;
  const keyframeMode = keyframeModeFrom(options.keyframeMode ?? process.env.RECIPE_LOOP_CODEX_VISION_KEYFRAME_MODE);
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
  const segmentOptions = {
    paddingSec: nonNegativeNumber(options.segmentPaddingSec, DEFAULT_SEGMENT_PADDING_SEC),
    minFrames: positiveInt(options.segmentMinFrames, DEFAULT_SEGMENT_MIN_FRAMES),
    maxFrames: positiveInt(options.segmentMaxFrames, DEFAULT_SEGMENT_MAX_FRAMES),
    maxCount: positiveInt(options.segmentMaxCount, DEFAULT_SEGMENT_MAX_COUNT),
    frameTotalLimit: positiveInt(options.segmentFrameTotalLimit, DEFAULT_SEGMENT_FRAME_TOTAL_LIMIT),
    overlapToleranceSec: positiveNumber(options.segmentOverlapToleranceSec, DEFAULT_SEGMENT_OVERLAP_TOLERANCE_SEC),
  };
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

      const manifestHash = frameManifestHash(frames);
      if (keyframeMode === "segmented") {
        return runSegmentedKeyframesFlow({
          prompt,
          videoUrl,
          cacheText,
          videoId,
          frames,
          frameResult,
          manifestHash,
          cacheDir,
          model,
          selectorModel,
          segmentModel,
          frameOptions,
          segmentOptions,
          codexExec,
          options,
          timeoutMs,
        });
      }

      const candidateFrames = sampleEvenly(frames, selectorCandidateLimit);
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
          keyframeMode,
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
