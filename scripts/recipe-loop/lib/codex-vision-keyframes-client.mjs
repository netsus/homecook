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
const CANDIDATE_SPLITTER_VERSION = "candidate-splitter-v2";
const SEGMENT_PROMPT_VERSION = "keyframe-segment-plan-v3";
const SEGMENT_SELECTOR_PROMPT_VERSION = "keyframe-segment-selector-v2";
const FINAL_PROMPT_VERSION = "keyframe-final-v2";
const TIMELINE_PARENT_RANGE_VERSION = "timeline-parent-range-v1";
const BUNDLE_CHILD_SEGMENT_VERSION = "bundle-child-segment-v2";
const SOURCE_CUE_PACKET_VERSION = "source-cue-packet-v1";
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
const MAX_CANDIDATE_HINTS = 16;
const SOURCE_BLOCK_RE = /^\[SOURCE:\s*([^\]]+)\]\s*$/;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/;
const TIMESTAMP_RE = /(?:^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*[~-]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?/;
const CANDIDATE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const JOINER_RE = /\s+(?:와|과|그리고)\s+/;
const NOISE_CANDIDATE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|재료|ingredients?|instructions?|레시피|recipe|시식|먹방|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|주방용품|용품|bgm|music|음악|문의|email|인스타|instagram|facebook|camera|equipment|브이로그|vlog|집밥)(?:$|[\s:：\-\/|ㅣ&＆+·ㆍ])/i;
const INGREDIENT_PAIR_RE = /^(?:소금|후추|마늘|버터|설탕|간장|된장|고추장|식초|기름|참기름|들기름|깨|통깨|물|육수|대파|쪽파|양파)(?:\s*(?:와|과|&|\/|\+)\s*)(?:소금|후추|마늘|버터|설탕|간장|된장|고추장|식초|기름|참기름|들기름|깨|통깨|물|육수|대파|쪽파|양파)$/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|꼬치|야끼|치즈|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;
const GENERIC_RECIPE_LABEL_RE = /(?:레시피|recipe|요리|만드는\s*법|how\s*to)(?:\s*)$/i;
const FRAME_FILE_TIMESTAMP_RE = /_(\d+(?:\.\d+)?)(?:\.[^.]+)$/;
const FRAME_TIMESTAMP_TOLERANCE_SEC = 0.075;
const TIMELINE_RANGE_CONFIDENCE_THRESHOLD = 0.75;
const LAST_RANGE_TAIL_WARNING_SEC = 7 * 60;
const SOURCE_CUE_IDENTITY_LIMIT = 5;
const SOURCE_CUE_TIMELINE_LIMIT = 3;
const SOURCE_CUE_LOCAL_SNIPPET_LIMIT = 3;
const SOURCE_CUE_COOKING_SNIPPET_LIMIT = 5;
const SOURCE_CUE_UNCERTAINTY_LIMIT = 3;
const SOURCE_CUE_SNIPPET_MAX_CHARS = 160;
const SOURCE_CUE_PACKET_MAX_CHARS = 1200;
const SOURCE_CUE_LOCAL_WINDOW_LINES = 3;
const SOURCE_CUE_COOKING_RE = /(양념|소스|간|고명|밥물|무침|볶|굽|끓|삶|비비|올리|졸이)/u;
const SOURCE_CUE_NOISE_RE = /(구독|좋아요|댓글\s*이벤트|이벤트|공지|알림|협찬|광고|할인|쿠폰|공구|공동구매|구매처|판매처|쇼핑|배송|택배|링크|https?:\/\/|www\.|인스타|instagram|email|메일|문의|BGM|music|음악|노래|camera|equipment|촬영장비)/i;

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

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyOf(value) {
  return compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function clippedCompact(value, maxChars = SOURCE_CUE_SNIPPET_MAX_CHARS) {
  const text = compact(value);
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…` : text;
}

function pushUniqueLimited(list, value, limit, keyFn = (entry) => JSON.stringify(entry)) {
  if (list.length >= limit) return;
  const key = keyFn(value);
  if (!key || list.some((entry) => keyFn(entry) === key)) return;
  list.push(value);
}

function sourceBlocks(sourceText) {
  const blocks = [];
  let current = { name: "unknown", lines: [] };
  for (const line of String(sourceText ?? "").split(/\r?\n/)) {
    const match = line.match(SOURCE_BLOCK_RE);
    if (match) {
      if (current.lines.length > 0) blocks.push(current);
      current = { name: match[1].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) blocks.push(current);
  return blocks;
}

function stripCandidateText(text) {
  return compact(text)
    .replace(TIMESTAMP_RE, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/[🍯🔌🍱🍚🌿👀🔥🎁💚💖📢👉✅✔️✨⏰✉️🎧]/g, " ")
    .replace(LIST_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,:：\-–—]+|[,:：\-–—]+$/g, "")
    .trim();
}

function isPlausibleCandidate(text, { trustedHint = false } = {}) {
  const cleaned = stripCandidateText(text);
  if (cleaned.length < (trustedHint ? 1 : 2) || cleaned.length > 80) return false;
  if (/https?:\/\//i.test(cleaned) || NOISE_CANDIDATE_RE.test(cleaned)) return false;
  if (/^[\d\s:~\-.,]+$/.test(cleaned)) return false;
  if (INGREDIENT_PAIR_RE.test(cleaned)) return false;
  if (GENERIC_RECIPE_LABEL_RE.test(cleaned) && !DISH_WORD_RE.test(cleaned)) return false;
  if (trustedHint) return /[\p{L}]/u.test(cleaned) && DISH_WORD_RE.test(cleaned);
  return /[\p{L}]/u.test(cleaned) && DISH_WORD_RE.test(cleaned);
}

function splitCandidateText(text, { trustedHint = false } = {}) {
  const cleaned = stripCandidateText(text);
  if (!cleaned) return [];
  const splitBySeparator = cleaned.split(CANDIDATE_SEPARATOR_RE).map(stripCandidateText).filter(Boolean);
  const separatorParts = splitBySeparator.length > 1 ? splitBySeparator : [cleaned];
  const parts = separatorParts.flatMap((part) => {
    const particleMatch = part.match(/^(.+?)(?:와|과)\s+(.+)$/u);
    if (particleMatch) return [particleMatch[1], particleMatch[2]].map(stripCandidateText).filter(Boolean);
    const joined = part.split(JOINER_RE).map(stripCandidateText).filter(Boolean);
    return joined.length > 1 ? joined : [part];
  });
  const plausible = parts.filter((part) => isPlausibleCandidate(part, { trustedHint }));
  if (plausible.length >= 2) return plausible;
  return isPlausibleCandidate(cleaned, { trustedHint }) ? [cleaned] : [];
}

function splitLooseBundleText(text) {
  const cleaned = stripCandidateText(text);
  if (!cleaned) return [];
  const separatorParts = cleaned.split(CANDIDATE_SEPARATOR_RE).map(stripCandidateText).filter(Boolean);
  const initialParts = separatorParts.length > 1 ? separatorParts : [cleaned];
  return initialParts.flatMap((part) => {
    const particleMatch = part.match(/^(.+?)(?:와|과)\s+(.+)$/u);
    if (particleMatch) return [particleMatch[1], particleMatch[2]].map(stripCandidateText).filter(Boolean);
    const joined = part.split(JOINER_RE).map(stripCandidateText).filter(Boolean);
    return joined.length > 1 ? joined : [part];
  }).filter(Boolean);
}

function hasBundleCandidateShape(text) {
  return splitLooseBundleText(text).length >= 2;
}

function evidenceStrengthFor(evidence) {
  const sources = new Set(evidence.map((item) => item.source));
  if (sources.has("recipe_candidate_hints") && sources.has("description_timeline")) return "title+timeline";
  if (sources.has("recipe_candidate_hints")) return "title_only";
  if (sources.has("description_timeline")) return "timeline_only";
  if (sources.has("author_comment") || [...sources].some((source) => source.startsWith("transcript"))) return "comment_or_caption";
  return "weak_text";
}

function firstFiniteTimeHint(evidence) {
  for (const item of evidence) {
    if (Number.isFinite(item.timeHintSec)) return item.timeHintSec;
  }
  return null;
}

function outputRoleForCandidate(candidate) {
  if (candidate?.bundleRole === "parent") return "bundle_parent";
  if (candidate?.candidateStatus === "weak_hint") return "recipe";
  return "recipe";
}

function addCandidate(candidates, byKey, titleHint, evidence, {
  splitFromBundle = false,
  bundleText = null,
  bundleRole = null,
} = {}) {
  const cleaned = stripCandidateText(titleHint);
  if (!cleaned) return;
  const key = keyOf(cleaned);
  if (!key) return;
  const existing = byKey.get(key);
  if (existing) {
    existing.sourceEvidence.push(...evidence);
    existing.evidenceStrength = evidenceStrengthFor(existing.sourceEvidence);
    existing.splitFromBundle = existing.splitFromBundle || splitFromBundle;
    existing.bundleText = existing.bundleText ?? bundleText;
    existing.bundleSourceText = existing.bundleSourceText ?? bundleText;
    existing.bundleRole = existing.bundleRole ?? bundleRole;
    existing.timeHintSec = existing.timeHintSec ?? firstFiniteTimeHint(evidence);
    return;
  }
  if (candidates.length >= MAX_CANDIDATE_HINTS) return;
  const sourceEvidence = [...evidence];
  const candidate = {
    candidateId: `cand-${String(candidates.length + 1).padStart(2, "0")}`,
    titleHint: cleaned,
    sourceEvidence,
    timeHintSec: firstFiniteTimeHint(sourceEvidence),
    evidenceStrength: evidenceStrengthFor(sourceEvidence),
    candidateStatus: "confirmed_hint",
    splitFromBundle,
    bundleText,
    bundleSourceText: bundleText,
    bundleRole,
    bundleParentId: null,
    bundleMemberIds: [],
    outputRole: bundleRole === "parent" ? "bundle_parent" : "recipe",
    notes: null,
  };
  byKey.set(key, candidate);
  candidates.push(candidate);
}

function candidateMatchesBundlePart(candidateTitle, bundlePart) {
  const candidateKey = keyOf(candidateTitle);
  const partKey = keyOf(bundlePart);
  if (!candidateKey || !partKey || partKey.length < 2) return false;
  if (candidateKey === partKey) return true;
  if (candidateKey.length >= 3 && partKey.includes(candidateKey)) return true;
  if (partKey.length >= 3 && candidateKey.includes(partKey)) return true;

  const partHasDishWord = titleHasDishWord(bundlePart);
  const candidateHasDishWord = titleHasDishWord(candidateTitle);
  if (!partHasDishWord && candidateHasDishWord && candidateKey.startsWith(partKey)) return true;

  const candidateTokens = titleMatchTokens(candidateTitle);
  const partTokens = titleMatchTokens(bundlePart);
  return candidateTokens.some((token) => (
    token.length >= 3
    && titleHasDishWord(token)
    && partKey.includes(token)
  )) || partTokens.some((token) => (
    token.length >= 3
    && titleHasDishWord(token)
    && candidateKey.includes(token)
  ));
}

function linkBundleCandidateGraph(candidates) {
  for (const parent of candidates) {
    if (parent.bundleRole !== "parent") continue;
    const bundleSourceText = parent.bundleSourceText ?? parent.bundleText ?? parent.titleHint;
    const parts = splitLooseBundleText(bundleSourceText);
    if (parts.length < 2) continue;

    const memberIds = [];
    for (const part of parts) {
      const matches = candidates.filter((candidate) => (
        candidate.candidateId !== parent.candidateId
        && candidate.bundleRole !== "parent"
        && candidateMatchesBundlePart(candidate.titleHint, part)
      ));
      for (const match of matches) memberIds.push(match.candidateId);
    }

    const uniqueMemberIds = [...new Set(memberIds)];
    if (uniqueMemberIds.length === 0) continue;
    parent.bundleMemberIds = uniqueMemberIds;
    parent.bundleSourceText = bundleSourceText;
    for (const memberId of uniqueMemberIds) {
      const member = candidates.find((candidate) => candidate.candidateId === memberId);
      if (!member) continue;
      member.bundleParentId = member.bundleParentId ?? parent.candidateId;
      member.bundleSourceText = member.bundleSourceText ?? bundleSourceText;
    }
  }

  for (const candidate of candidates) {
    candidate.outputRole = outputRoleForCandidate(candidate);
  }
}

function timelineCandidateEvidence(line, source) {
  const timeMatch = line.match(TIMESTAMP_RE);
  const timeHintSec = timeMatch ? parseTimeSec(timeMatch[1]) : null;
  return {
    source: source === "description" ? "description_timeline" : source,
    text: compact(line).slice(0, 220),
    timeHintSec,
  };
}

export function buildCandidateHintsFromSourceText(sourceText) {
  const candidates = [];
  const byKey = new Map();
  const warnings = [];
  const blocks = sourceBlocks(sourceText);

  for (const block of blocks) {
    if (block.name === "recipe_candidate_hints") {
      for (const line of block.lines) {
        const raw = stripCandidateText(line);
        if (!raw) continue;
        const parts = splitCandidateText(raw, { trustedHint: true });
        const splitFromBundle = parts.length > 1;
        const bundleText = hasBundleCandidateShape(raw) ? raw : null;
        for (const part of parts) {
          addCandidate(candidates, byKey, part, [{
            source: "recipe_candidate_hints",
            text: raw.slice(0, 220),
          }], { splitFromBundle, bundleText, bundleRole: splitFromBundle ? "member" : null });
        }
      }
    }
  }

  for (const block of blocks) {
    const isTimelineSource = block.name === "description" || block.name.startsWith("transcript") || block.name === "author_comment";
    if (!isTimelineSource) continue;
    for (const line of block.lines) {
      if (!TIMESTAMP_RE.test(line)) {
        TIMESTAMP_RE.lastIndex = 0;
        continue;
      }
      TIMESTAMP_RE.lastIndex = 0;
      const raw = stripCandidateText(line);
      const parts = splitCandidateText(raw, { trustedHint: false });
      const splitFromBundle = parts.length > 1;
      const bundleText = hasBundleCandidateShape(raw) ? raw : null;
      const bundleRole = splitFromBundle ? "member" : (bundleText ? "parent" : null);
      for (const part of parts) {
        addCandidate(candidates, byKey, part, [timelineCandidateEvidence(line, block.name)], {
          splitFromBundle,
          bundleText,
          bundleRole,
        });
      }
    }
  }

  if (candidates.length === 0) {
    const fallbackText = stripCandidateText(sourceText).split(/[.!?\n]/)[0] ?? "";
    const parts = splitCandidateText(fallbackText, { trustedHint: false });
    const splitFromBundle = parts.length > 1;
    const bundleText = hasBundleCandidateShape(fallbackText) ? fallbackText : null;
    const bundleRole = splitFromBundle ? "member" : (bundleText ? "parent" : null);
    for (const part of parts) {
      addCandidate(candidates, byKey, part, [{
        source: "source_text_fallback",
        text: fallbackText.slice(0, 220),
      }], { splitFromBundle, bundleText, bundleRole });
    }
  }

  if (candidates.length === 0) {
    warnings.push("source text에서 recipe candidate hint를 찾지 못해 전체 segment hint로 fallback합니다.");
    addCandidate(candidates, byKey, "전체 레시피", [{
      source: "fallback",
      text: "candidate hint unavailable",
    }], {});
    candidates[0].candidateStatus = "weak_hint";
    candidates[0].evidenceStrength = "weak_text";
  }

  linkBundleCandidateGraph(candidates);

  return {
    recipeCandidates: candidates.map((candidate) => ({
      ...candidate,
      sourceEvidence: candidate.sourceEvidence.slice(0, 8),
    })),
    candidateCountPolicy: "source-inferred",
    splitterVersion: CANDIDATE_SPLITTER_VERSION,
    warnings,
  };
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
    "5. 파일명은 아래 후보 프레임 목록의 file 값을 한 글자도 바꾸지 말고 정확히 복사한다. 새 파일명이나 새 번호를 만들지 않는다.",
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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function timelineFallback({ timelineConfidence, parsedTimelineEntries, lastKeyframeSec, fallbackReason }) {
  return {
    rangeSource: "llm_planner_fallback",
    timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
    timelineConfidence,
    parsedTimelineEntries,
    fallbackReason,
    lastKeyframeSec,
    tailWarning: null,
    parentRanges: [],
  };
}

function parseDescriptionTimelineEntries(sourceText) {
  const entries = [];
  const seen = new Set();
  for (const block of sourceBlocks(sourceText)) {
    if (block.name !== "description") continue;
    for (const line of block.lines) {
      const match = line.match(TIMESTAMP_RE);
      if (!match) continue;
      const startSec = parseTimeSec(match[1]);
      const title = stripCandidateText(line);
      if (!Number.isFinite(startSec) || !title) continue;
      const hasPlausibleTitle = isPlausibleCandidate(title, { trustedHint: false })
        || splitCandidateText(title, { trustedHint: false }).length > 0;
      if (!hasPlausibleTitle) continue;
      const key = `${startSec}:${keyOf(title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        time: match[1],
        startSec,
        title,
        text: compact(line).slice(0, 220),
      });
    }
  }
  return entries.sort((a, b) => a.startSec - b.startSec || a.title.localeCompare(b.title));
}

function titleMatchTokens(value) {
  const cleaned = stripCandidateText(value);
  const tokens = new Set([keyOf(cleaned)]);
  for (const part of cleaned.split(CANDIDATE_SEPARATOR_RE)) {
    const partKey = keyOf(part);
    if (partKey.length >= 2) tokens.add(partKey);
    for (const token of part.split(/[^\p{L}\p{N}]+/gu)) {
      const tokenKey = keyOf(token);
      if (tokenKey.length >= 2) tokens.add(tokenKey);
    }
  }
  return [...tokens].filter((token) => token.length >= 2);
}

function titleHasDishWord(value) {
  return DISH_WORD_RE.test(stripCandidateText(value));
}

function titleMatchesTimelineRange(candidateTitle, rangeTitle) {
  const candidateKey = keyOf(candidateTitle);
  const rangeKey = keyOf(rangeTitle);
  if (!candidateKey || !rangeKey) return false;
  if (candidateKey.length >= 3 && rangeKey.includes(candidateKey)) return true;
  if (rangeKey.length >= 3 && candidateKey.includes(rangeKey)) return true;
  return titleMatchTokens(rangeTitle).some((token) => token.length >= 2 && candidateKey.includes(token));
}

export function buildTimelineParentRangePlan({ sourceText, lastKeyframeSec }) {
  const parsedTimelineEntries = parseDescriptionTimelineEntries(sourceText);
  const safeLastKeyframeSec = Number.isFinite(lastKeyframeSec) && lastKeyframeSec > 0 ? lastKeyframeSec : 0;
  const timelineConfidence = parsedTimelineEntries.length >= 2 ? 0.95 : (parsedTimelineEntries.length === 1 ? 0.6 : 0);

  if (parsedTimelineEntries.length === 0) {
    return timelineFallback({
      timelineConfidence,
      parsedTimelineEntries,
      lastKeyframeSec: safeLastKeyframeSec,
      fallbackReason: "no_description_timeline_found",
    });
  }

  if (timelineConfidence < TIMELINE_RANGE_CONFIDENCE_THRESHOLD) {
    return timelineFallback({
      timelineConfidence,
      parsedTimelineEntries,
      lastKeyframeSec: safeLastKeyframeSec,
      fallbackReason: "description_timeline_confidence_below_threshold",
    });
  }

  if (safeLastKeyframeSec <= parsedTimelineEntries[0].startSec) {
    return timelineFallback({
      timelineConfidence: 0.4,
      parsedTimelineEntries,
      lastKeyframeSec: safeLastKeyframeSec,
      fallbackReason: "last_keyframe_before_description_timeline",
    });
  }

  const parentRanges = parsedTimelineEntries
    .map((entry, index) => {
      const next = parsedTimelineEntries[index + 1];
      return {
        parentRangeId: `range-${String(index + 1).padStart(2, "0")}`,
        title: entry.title,
        time: entry.time,
        startSec: entry.startSec,
        endSec: next ? next.startSec : safeLastKeyframeSec,
        textEvidence: entry.text,
      };
    })
    .filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && range.startSec < range.endSec);

  if (parentRanges.length === 0) {
    return timelineFallback({
      timelineConfidence: 0.4,
      parsedTimelineEntries,
      lastKeyframeSec: safeLastKeyframeSec,
      fallbackReason: "description_timeline_ranges_invalid",
    });
  }

  const lastRange = parentRanges[parentRanges.length - 1];
  const lastRangeDuration = lastRange.endSec - lastRange.startSec;
  const tailWarning = lastRangeDuration > LAST_RANGE_TAIL_WARNING_SEC
    ? `last parent range duration ${lastRangeDuration.toFixed(1)}s exceeds ${LAST_RANGE_TAIL_WARNING_SEC}s`
    : null;

  return {
    rangeSource: "description_timeline",
    timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
    timelineConfidence,
    parsedTimelineEntries,
    fallbackReason: null,
    lastKeyframeSec: safeLastKeyframeSec,
    tailWarning,
    parentRanges,
  };
}

function findTimelineRangeForCandidate(candidate, parentRanges) {
  const timeHint = Number(candidate?.timeHintSec);
  if (Number.isFinite(timeHint)) {
    const byTime = parentRanges.find((range, index) => {
      const isLast = index === parentRanges.length - 1;
      return timeHint >= range.startSec && (timeHint < range.endSec || (isLast && timeHint <= range.endSec));
    });
    if (byTime) return byTime;
  }

  return parentRanges.find((range) => titleMatchesTimelineRange(candidate?.titleHint, range.title)) ?? null;
}

function applyTimelineParentRanges(segmentPlan, timelineRangePlan, candidatePlan) {
  if (timelineRangePlan.rangeSource !== "description_timeline") {
    return {
      ...segmentPlan,
      ...timelineRangePlan,
    };
  }

  const candidatesById = new Map(candidatePlan.recipeCandidates.map((candidate) => [candidate.candidateId, candidate]));
  let appliedCount = 0;
  const segments = segmentPlan.segments.map((segment) => {
    const candidate = candidatesById.get(segment.candidateId);
    const parentRange = findTimelineRangeForCandidate(candidate, timelineRangePlan.parentRanges);
    if (!parentRange) {
      return {
        ...segment,
        rangeSource: "llm_planner_fallback",
        fallbackReason: "candidate_not_matched_to_description_timeline",
      };
    }

    appliedCount += 1;
    const evidenceLine = `description_timeline: ${parentRange.time} ${parentRange.title}`;
    const textEvidence = segment.textEvidence.includes(evidenceLine)
      ? segment.textEvidence
      : [...segment.textEvidence, evidenceLine].slice(0, 8);
    return {
      ...segment,
      startSec: parentRange.startSec,
      endSec: parentRange.endSec,
      rangeSource: "description_timeline",
      fallbackReason: null,
      parentRangeId: parentRange.parentRangeId,
      parentRangeTitle: parentRange.title,
      parentRangeStartSec: parentRange.startSec,
      parentRangeEndSec: parentRange.endSec,
      textEvidence,
    };
  }).sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  if (appliedCount === 0) {
    return {
      ...segmentPlan,
      rangeSource: "llm_planner_fallback",
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      timelineConfidence: timelineRangePlan.timelineConfidence,
      parsedTimelineEntries: timelineRangePlan.parsedTimelineEntries,
      fallbackReason: "no_segment_matched_to_description_timeline",
      lastKeyframeSec: timelineRangePlan.lastKeyframeSec,
      tailWarning: timelineRangePlan.tailWarning,
      parentRanges: timelineRangePlan.parentRanges,
    };
  }

  return {
    ...segmentPlan,
    ...timelineRangePlan,
    segments,
  };
}

function segmentIdsByCandidate(segments) {
  const byCandidate = new Map();
  for (const segment of segments) {
    const current = byCandidate.get(segment.candidateId) ?? [];
    current.push(segment.segmentId);
    byCandidate.set(segment.candidateId, current);
  }
  return byCandidate;
}

function rebalanceFrameBudgets(segments, totalFrameLimit) {
  const frameBudgetTotal = segments.reduce((sum, segment) => sum + segment.frameBudget, 0);
  if (frameBudgetTotal <= totalFrameLimit) return segments;

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
    throw new Error(`bundle child segment frameBudget 재분배가 상한(${totalFrameLimit})을 맞추지 못했습니다.`);
  }
  return segments;
}

function applyBundleChildSegments(segmentPlan, candidatePlan, { totalFrameLimit }) {
  const candidatesById = new Map(candidatePlan.recipeCandidates.map((candidate) => [candidate.candidateId, candidate]));
  const originalSegmentCandidateIds = new Set(segmentPlan.segments.map((segment) => segment.candidateId));
  const segments = [];
  const expandedParents = [];

  for (const segment of segmentPlan.segments) {
    const parent = candidatesById.get(segment.candidateId);
    const memberIds = Array.isArray(parent?.bundleMemberIds) ? parent.bundleMemberIds : [];
    const members = memberIds
      .map((memberId) => candidatesById.get(memberId))
      .filter((member) => member && !originalSegmentCandidateIds.has(member.candidateId));
    if (members.length === 0) {
      segments.push(segment);
      continue;
    }

    expandedParents.push({
      parentId: parent.candidateId,
      parentTitle: parent.titleHint,
      memberIds: members.map((member) => member.candidateId),
    });
    const baseBudget = Math.max(1, Math.floor(segment.frameBudget / members.length));
    let remainingBudget = Math.max(0, segment.frameBudget - (baseBudget * members.length));

    for (const member of members) {
      const segmentId = safeSegmentId(`${segment.segmentId}-${member.candidateId}`, `${segment.segmentId}-child`);
      const evidenceLine = `bundle_child: ${member.titleHint} from ${parent.titleHint}`;
      const textEvidence = segment.textEvidence.includes(evidenceLine)
        ? segment.textEvidence
        : [...segment.textEvidence, evidenceLine].slice(0, 8);
      const frameBudget = baseBudget + (remainingBudget > 0 ? 1 : 0);
      remainingBudget = Math.max(0, remainingBudget - 1);
      segments.push({
        ...segment,
        segmentId,
        candidateId: member.candidateId,
        titleHint: member.titleHint,
        candidateStatus: member.candidateStatus,
        evidenceStrength: member.evidenceStrength,
        outputRole: member.outputRole ?? outputRoleForCandidate(member),
        sourceEvidence: member.sourceEvidence ?? [],
        textEvidence,
        frameBudget,
        bundleParentId: parent.candidateId,
        bundleParentTitle: parent.titleHint,
        bundleSourceText: parent.bundleSourceText ?? parent.bundleText ?? parent.titleHint,
        bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
        notes: segment.notes ? `${segment.notes} / bundle child evidence` : "bundle child evidence",
      });
    }
  }

  if (expandedParents.length === 0) {
    return {
      ...segmentPlan,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      bundleChildSegmentApplied: false,
      bundleChildSegmentParents: [],
    };
  }

  rebalanceFrameBudgets(segments, totalFrameLimit);
  segments.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.segmentId.localeCompare(b.segmentId));

  const idsByCandidate = segmentIdsByCandidate(segments);
  const expandedParentIds = new Set(expandedParents.map((entry) => entry.parentId));
  const coverage = candidatePlan.recipeCandidates.map((candidate) => {
    const segmentIds = idsByCandidate.get(candidate.candidateId) ?? [];
    const original = (segmentPlan.coverage ?? []).find((entry) => entry.candidateId === candidate.candidateId);
    if (expandedParentIds.has(candidate.candidateId)) {
      const childSegmentIds = (candidate.bundleMemberIds ?? []).flatMap((memberId) => idsByCandidate.get(memberId) ?? []);
      return {
        candidateId: candidate.candidateId,
        titleHint: candidate.titleHint,
        status: "supporting",
        outputRole: candidate.outputRole ?? outputRoleForCandidate(candidate),
        segmentIds: childSegmentIds,
        dropReason: null,
      };
    }
    if (candidate.bundleParentId && segmentIds.length > 0) {
      return {
        candidateId: candidate.candidateId,
        titleHint: candidate.titleHint,
        status: "covered",
        outputRole: candidate.outputRole ?? outputRoleForCandidate(candidate),
        segmentIds,
        dropReason: null,
      };
    }
    if (segmentIds.length > 0) {
      const outputRole = candidate.outputRole ?? outputRoleForCandidate(candidate);
      return {
        candidateId: candidate.candidateId,
        titleHint: candidate.titleHint,
        status: outputRole === "bundle_parent" || original?.status === "supporting" ? "supporting" : "covered",
        outputRole,
        segmentIds,
        dropReason: null,
      };
    }
    return {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      status: original?.status ?? "uncovered",
      outputRole: candidate.outputRole ?? outputRoleForCandidate(candidate),
      segmentIds: original?.segmentIds ?? [],
      dropReason: original?.dropReason ?? null,
    };
  });

  return {
    ...segmentPlan,
    segments,
    coverage,
    bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
    bundleChildSegmentApplied: true,
    bundleChildSegmentParents: expandedParents,
    warnings: [
      ...(segmentPlan.warnings ?? []),
      ...expandedParents.map((entry) => `bundle child segments expanded: ${entry.parentId} -> ${entry.memberIds.join(",")}`),
    ],
  };
}

function extractSegmentPlanJson(segmentRaw, { maxFrameSec } = {}) {
  try {
    return { rawPlan: extractJsonFromText(segmentRaw), warnings: [] };
  } catch (error) {
    const replacement = Number.isFinite(maxFrameSec) && maxFrameSec > 0 ? Math.ceil(maxFrameSec) : 0;
    const sanitized = String(segmentRaw ?? "")
      .replace(/:\s*(?:Infinity|inf)\b/gi, `: ${replacement}`)
      .replace(/:\s*NaN\b/g, `: ${replacement}`);
    if (sanitized === segmentRaw) throw error;
    const rawPlan = extractJsonFromText(sanitized);
    return {
      rawPlan: {
        ...rawPlan,
        warnings: [
          ...(Array.isArray(rawPlan?.warnings) ? rawPlan.warnings : []),
          `segment plan non-finite numeric value was sanitized to ${replacement}`,
        ],
      },
      warnings: [`segment plan non-finite numeric value was sanitized to ${replacement}`],
    };
  }
}

function buildSegmentPlanPrompt({ sourceText, frames, candidatePlan, segmentMaxCount, segmentFrameTotalLimit }) {
  return [
    "너는 다중 요리 영상의 레시피별 시간 구간을 나누는 담당자다.",
    "최종 레시피를 작성하지 말고, source-derived candidate hint별로 어떤 시간 구간과 프레임을 우선 볼지 JSON으로만 나눈다.",
    "",
    "중요 규칙:",
    "1. recipeCandidates는 정답이 아니라 힌트다. 충분한 근거가 없으면 coverage status를 supporting 또는 dropped로 남길 수 있다.",
    "2. 정답 파일, 채점 결과, validation/holdout 정답은 절대 보지 않는다.",
    "3. candidateId는 아래 recipeCandidates의 candidateId 중 하나를 정확히 복사한다.",
    "4. 소스/토핑/플레이팅만 따로 나온 짧은 장면은 별도 recipe가 아니라 supporting 또는 관련 candidate의 연속 구간으로 본다.",
    "5. 묶음 타임라인 안에 여러 candidate가 있으면 같은 parent range를 공유해도 되지만, selected frame은 candidate별로 고를 수 있게 segment를 나눈다.",
    `6. segments는 최대 ${segmentMaxCount}개, frameBudget 총합은 최대 ${segmentFrameTotalLimit}이다.`,
    "7. coverage에는 모든 recipeCandidates의 covered/supporting/dropped 여부와 이유를 남긴다.",
    "8. startSec/endSec는 반드시 유한한 숫자만 쓴다. 끝 구간도 Infinity, inf, NaN을 쓰지 말고 전체 프레임 manifest의 마지막 timestamp를 사용한다.",
    "",
    "출력은 설명 없이 JSON만 한다.",
    "스키마:",
    "{",
    "  \"segments\": [",
    "    {",
    "      \"segmentId\": \"seg-01\",",
    "      \"candidateId\": \"cand-01\",",
    "      \"titleHint\": \"요리 후보명\",",
    "      \"startSec\": 0,",
    "      \"endSec\": 30,",
    "      \"timeEvidence\": [\"짧은 근거\"],",
    "      \"frameBudget\": 8,",
    "      \"notes\": \"짧은 메모\"",
    "    }",
    "  ],",
    "  \"coverage\": [",
    "    { \"candidateId\": \"cand-01\", \"titleHint\": \"요리 후보명\", \"status\": \"covered\", \"segmentIds\": [\"seg-01\"], \"dropReason\": null }",
    "  ],",
    "  \"warnings\": []",
    "}",
    "",
    "recipeCandidates JSON:",
    JSON.stringify(candidatePlan, null, 2),
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

function normalizeCoverage(rawCoverage, segments, candidatePlan) {
  const segmentIdsByCandidate = new Map();
  for (const segment of segments) {
    const list = segmentIdsByCandidate.get(segment.candidateId) ?? [];
    list.push(segment.segmentId);
    segmentIdsByCandidate.set(segment.candidateId, list);
  }

  const rawByCandidate = new Map();
  if (Array.isArray(rawCoverage)) {
    for (const raw of rawCoverage) {
      if (!isObject(raw)) continue;
      const candidateId = String(raw.candidateId ?? "").trim();
      if (candidateId) rawByCandidate.set(candidateId, raw);
    }
  }

  const coverage = [];
  const warnings = [];
  for (const candidate of candidatePlan.recipeCandidates) {
    const raw = rawByCandidate.get(candidate.candidateId);
    const segmentIds = Array.isArray(raw?.segmentIds)
      ? raw.segmentIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : (segmentIdsByCandidate.get(candidate.candidateId) ?? []);
    const rawStatus = String(raw?.status ?? "").trim();
    const rawNormalizedStatus = ["covered", "supporting", "dropped", "uncovered"].includes(rawStatus)
      ? rawStatus
      : (segmentIds.length > 0 ? "covered" : "uncovered");
    const outputRole = candidate.outputRole ?? outputRoleForCandidate(candidate);
    const status = outputRole === "bundle_parent" && rawNormalizedStatus === "covered"
      ? "supporting"
      : rawNormalizedStatus;
    if (segmentIds.length === 0 && status !== "dropped" && status !== "supporting") {
      warnings.push(`${candidate.candidateId}(${candidate.titleHint}) coverage가 segment 없이 남았습니다.`);
    }
    coverage.push({
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      status,
      outputRole,
      segmentIds,
      dropReason: raw?.dropReason ? String(raw.dropReason).trim() : null,
    });
  }

  return { coverage, warnings };
}

function normalizeSegmentPlan(rawPlan, { maxCount, maxFrameSec, totalFrameLimit, perSegmentMaxFrames, overlapToleranceSec, candidatePlan }) {
  const rawSegments = Array.isArray(rawPlan?.segments) ? rawPlan.segments : [];
  if (rawSegments.length === 0) throw new Error("segment plan은 segments 배열을 1개 이상 포함해야 합니다.");
  if (rawSegments.length > maxCount) throw new Error(`segment plan segments 개수가 상한(${maxCount})을 넘었습니다.`);
  const candidatesById = new Map(candidatePlan.recipeCandidates.map((candidate) => [candidate.candidateId, candidate]));

  const segments = rawSegments.map((raw, index) => {
    if (!isObject(raw)) throw new Error(`segment ${index + 1}이 object가 아닙니다.`);
    const fallbackId = `seg-${String(index + 1).padStart(2, "0")}`;
    const segmentId = safeSegmentId(raw.segmentId, fallbackId);
    const candidateId = String(raw.candidateId ?? "").trim();
    if (!candidateId) throw new Error(`${segmentId} candidateId가 비었습니다.`);
    const candidate = candidatesById.get(candidateId);
    if (!candidate) throw new Error(`${segmentId} candidateId(${candidateId})는 recipeCandidates에 없습니다.`);
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

    const frameBudget = Math.min(positiveInt(raw.frameBudget, DEFAULT_SEGMENT_MIN_FRAMES), perSegmentMaxFrames);
    return {
      segmentId,
      candidateId,
      titleHint,
      startSec,
      endSec,
      candidateStatus: candidate.candidateStatus,
      evidenceStrength: candidate.evidenceStrength,
      outputRole: candidate.outputRole ?? outputRoleForCandidate(candidate),
      sourceEvidence: candidate.sourceEvidence ?? [],
      textEvidence: normalizeTextEvidence(raw.textEvidence ?? raw.timeEvidence),
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

  const segmentWarnings = [];
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const overlap = previous.endSec - current.startSec;
    if (overlap > overlapToleranceSec) {
      segmentWarnings.push(`${previous.segmentId}와 ${current.segmentId}의 overlap(${overlap.toFixed(1)}초)이 허용치를 넘었습니다.`);
    }
  }

  const normalizedCoverage = normalizeCoverage(rawPlan?.coverage, segments, candidatePlan);
  return {
    segments,
    coverage: normalizedCoverage.coverage,
    warnings: [
      ...segmentWarnings,
      ...normalizedCoverage.warnings,
      ...(Array.isArray(rawPlan?.warnings) ? rawPlan.warnings.map((warning) => String(warning ?? "").trim()).filter(Boolean) : []),
    ],
  };
}

function sourceCueTextValues(candidate, segments = []) {
  return [
    candidate.titleHint,
    candidate.bundleText,
    candidate.bundleSourceText,
    ...(Array.isArray(candidate.sourceEvidence) ? candidate.sourceEvidence.map((item) => item?.text) : []),
    ...segments.flatMap((segment) => [
      segment.titleHint,
      segment.bundleParentTitle,
      segment.notes,
      ...(Array.isArray(segment.textEvidence) ? segment.textEvidence : []),
      ...(Array.isArray(segment.sourceEvidence) ? segment.sourceEvidence.map((item) => item?.text) : []),
    ]),
  ].filter(Boolean);
}

function sourceCueAliasTokens(candidate, segments = []) {
  const tokens = new Set();
  for (const value of sourceCueTextValues(candidate, segments)) {
    const cleaned = stripCandidateText(value);
    if (!cleaned) continue;
    for (const token of titleMatchTokens(cleaned)) tokens.add(token);
    for (const part of splitLooseBundleText(cleaned)) {
      for (const token of titleMatchTokens(part)) tokens.add(token);
    }
  }
  return [...tokens].filter((token) => token.length >= 2);
}

function lineMatchesAlias(line, aliases) {
  const lineKey = keyOf(stripCandidateText(line));
  if (!lineKey) return false;
  return aliases.some((alias) => alias.length >= 2 && (lineKey.includes(alias) || (lineKey.length >= 4 && alias.includes(lineKey))));
}

function sourceCueAllowsLocalWindow(sourceName) {
  return sourceName === "description" || sourceName === "author_comment" || sourceName === "recipe_candidate_hints";
}

function sourceCueSnippet(source, text) {
  return { source, text: clippedCompact(text) };
}

function isSourceCueNoise(sourceName, line) {
  const text = compact(line);
  if (!text) return true;
  if (SOURCE_CUE_NOISE_RE.test(text)) return true;
  if (sourceName === "recipe_candidate_hints" && NOISE_CANDIDATE_RE.test(stripCandidateText(text))) return true;
  return false;
}

function packetTextSize(packet) {
  return [
    packet.identityCues.join(" "),
    packet.timelineCues.join(" "),
    packet.localSourceSnippets.map((entry) => entry.text).join(" "),
    packet.cookingCueSnippets.map((entry) => entry.text).join(" "),
    packet.uncertainty.map((entry) => `${entry.reason} ${entry.text ?? ""}`).join(" "),
  ].join(" ").length;
}

function trimCuePacketBudget(packet) {
  while (packetTextSize(packet) > SOURCE_CUE_PACKET_MAX_CHARS) {
    if (packet.uncertainty.length) {
      packet.uncertainty.pop();
    } else if (packet.localSourceSnippets.length) {
      packet.localSourceSnippets.pop();
    } else if (packet.cookingCueSnippets.length) {
      packet.cookingCueSnippets.pop();
    } else if (packet.timelineCues.length) {
      packet.timelineCues.pop();
    } else if (packet.identityCues.length) {
      packet.identityCues.pop();
    } else {
      break;
    }
  }
  return packet;
}

function segmentIdsForCandidate(segmentPlan, candidateId) {
  return (Array.isArray(segmentPlan?.segments) ? segmentPlan.segments : [])
    .filter((segment) => segment.candidateId === candidateId)
    .map((segment) => segment.segmentId);
}

function segmentsForCandidate(segmentPlan, candidateId) {
  return (Array.isArray(segmentPlan?.segments) ? segmentPlan.segments : [])
    .filter((segment) => segment.candidateId === candidateId);
}

export function buildSourceCuePacketsFromSourceText(sourceText, candidatePlan, segmentPlan) {
  const candidates = Array.isArray(candidatePlan?.recipeCandidates) ? candidatePlan.recipeCandidates : [];
  const blocks = sourceBlocks(sourceText);
  const aliasesByCandidate = new Map();
  const packets = [];

  for (const candidate of candidates) {
    const segments = segmentsForCandidate(segmentPlan, candidate.candidateId);
    aliasesByCandidate.set(candidate.candidateId, sourceCueAliasTokens(candidate, segments));
  }

  for (const candidate of candidates) {
    const segments = segmentsForCandidate(segmentPlan, candidate.candidateId);
    const aliases = aliasesByCandidate.get(candidate.candidateId) ?? [];
    const segmentIds = segmentIdsForCandidate(segmentPlan, candidate.candidateId);
    const packet = {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      segmentIds,
      identityCues: [],
      timelineCues: [],
      localSourceSnippets: [],
      cookingCueSnippets: [],
      uncertainty: [],
    };

    for (const evidence of Array.isArray(candidate.sourceEvidence) ? candidate.sourceEvidence : []) {
      const source = String(evidence?.source ?? "source").trim() || "source";
      const text = clippedCompact(evidence?.text);
      if (!text || isSourceCueNoise(source, text)) continue;
      pushUniqueLimited(packet.identityCues, `${source}: ${text}`, SOURCE_CUE_IDENTITY_LIMIT);
      if (TIMESTAMP_RE.test(text)) {
        pushUniqueLimited(packet.timelineCues, `${source}: ${text}`, SOURCE_CUE_TIMELINE_LIMIT);
      }
    }

    for (const segment of segments) {
      for (const textEvidence of Array.isArray(segment.textEvidence) ? segment.textEvidence : []) {
        const text = clippedCompact(textEvidence);
        if (!text || isSourceCueNoise("segment_text_evidence", text)) continue;
        if (TIMESTAMP_RE.test(text) || Number.isFinite(segment.startSec)) {
          pushUniqueLimited(packet.timelineCues, `segment_text_evidence: ${text}`, SOURCE_CUE_TIMELINE_LIMIT);
        }
      }
    }

    for (const block of blocks) {
      let localWindow = 0;
      for (const rawLine of block.lines) {
        const line = compact(rawLine);
        if (!line) {
          localWindow = 0;
          continue;
        }
        if (isSourceCueNoise(block.name, line)) continue;

        const matched = lineMatchesAlias(line, aliases);
        if (!matched && localWindow > 0) {
          const matchesOtherCandidate = [...aliasesByCandidate.entries()]
            .some(([candidateId, otherAliases]) => candidateId !== candidate.candidateId && lineMatchesAlias(line, otherAliases));
          if (matchesOtherCandidate) localWindow = 0;
        }
        const local = matched || localWindow > 0;
        if (!local) continue;

        const snippet = sourceCueSnippet(block.name, line);
        pushUniqueLimited(packet.localSourceSnippets, snippet, SOURCE_CUE_LOCAL_SNIPPET_LIMIT, (entry) => `${entry.source}:${entry.text}`);
        if (TIMESTAMP_RE.test(line)) {
          pushUniqueLimited(packet.timelineCues, `${block.name}: ${snippet.text}`, SOURCE_CUE_TIMELINE_LIMIT);
        }
        if (SOURCE_CUE_COOKING_RE.test(line)) {
          pushUniqueLimited(packet.cookingCueSnippets, snippet, SOURCE_CUE_COOKING_SNIPPET_LIMIT, (entry) => `${entry.source}:${entry.text}`);
        }
        if (block.name.startsWith("transcript") && line.length > SOURCE_CUE_SNIPPET_MAX_CHARS) {
          pushUniqueLimited(
            packet.uncertainty,
            { source: block.name, reason: "long_transcript_line", text: snippet.text },
            SOURCE_CUE_UNCERTAINTY_LIMIT,
            (entry) => `${entry.source}:${entry.reason}:${entry.text}`,
          );
        }
        if (matched && sourceCueAllowsLocalWindow(block.name)) {
          localWindow = SOURCE_CUE_LOCAL_WINDOW_LINES;
        } else if (localWindow > 0) {
          localWindow -= 1;
        }
      }
    }

    packets.push(trimCuePacketBudget(packet));
  }

  return {
    version: SOURCE_CUE_PACKET_VERSION,
    packets,
  };
}

function formatSourceCuePacket(packet) {
  const lineGroup = (label, values) => {
    if (!values?.length) return [`${label}: (없음)`];
    return [
      `${label}:`,
      ...values.map((value) => `- ${typeof value === "string" ? value : `${value.source}: ${value.text ?? value.reason}`}`),
    ];
  };
  return [
    `sourceCuePacket: ${packet.candidateId} / ${packet.titleHint}`,
    `segmentIds: ${packet.segmentIds.length ? packet.segmentIds.join(", ") : "(없음)"}`,
    ...lineGroup("identityCues", packet.identityCues),
    ...lineGroup("timelineCues", packet.timelineCues),
    ...lineGroup("localSourceSnippets", packet.localSourceSnippets),
    ...lineGroup("cookingCueSnippets", packet.cookingCueSnippets),
    ...lineGroup("uncertainty", packet.uncertainty.map((entry) => ({
      source: entry.source,
      text: `${entry.reason}${entry.text ? `: ${entry.text}` : ""}`,
    }))),
  ].join("\n");
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
    `candidateId: ${segment.candidateId}`,
    `titleHint: ${segment.titleHint}`,
    `candidateStatus: ${segment.candidateStatus}`,
    `evidenceStrength: ${segment.evidenceStrength}`,
    `time: ${segment.startSec}-${segment.endSec}`,
    `textEvidence: ${segment.textEvidence.length ? segment.textEvidence.join(" / ") : "(없음)"}`,
    `sourceEvidence: ${(segment.sourceEvidence ?? []).map((item) => `${item.source}: ${item.text}`).join(" / ") || "(없음)"}`,
    `frameBudget: ${budget}`,
    "",
    "선별 기준:",
    "1. 이 candidate/segment의 근거만 판단한다. 다른 candidate의 재료, 토핑, 플레이팅을 섞지 않는다.",
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

function buildSegmentedFinalPrompt({ prompt, sourceText, candidatePlan, segmentPlan, segmentKeyframes, sourceCuePacketPlan = null }) {
  const sourceCuePacketByCandidate = new Map(
    Array.isArray(sourceCuePacketPlan?.packets)
      ? sourceCuePacketPlan.packets.map((packet) => [packet.candidateId, packet])
      : [],
  );
  const coverageByCandidate = new Map((segmentPlan.coverage ?? []).map((entry) => [entry.candidateId, entry]));
  const candidateRole = (candidate) => coverageByCandidate.get(candidate.candidateId)?.outputRole
    ?? candidate.outputRole
    ?? outputRoleForCandidate(candidate);
  const candidateCoverageStatus = (candidate) => coverageByCandidate.get(candidate.candidateId)?.status ?? "uncovered";
  const outputCandidateLines = candidatePlan.recipeCandidates
    .filter((candidate) => candidateRole(candidate) === "recipe" && candidateCoverageStatus(candidate) === "covered")
    .map((candidate) => {
      const coverage = coverageByCandidate.get(candidate.candidateId);
      const segments = coverage?.segmentIds?.length ? coverage.segmentIds.join(", ") : "(없음)";
      return `- ${candidate.candidateId}: titleHint=${candidate.titleHint}, role=recipe, status=${coverage?.status ?? "uncovered"}, segments=[${segments}]`;
    });
  const supportOnlyCandidateLines = candidatePlan.recipeCandidates
    .filter((candidate) => (
      !["dropped", "uncovered"].includes(candidateCoverageStatus(candidate))
      && (candidateRole(candidate) !== "recipe" || candidateCoverageStatus(candidate) !== "covered")
    ))
    .map((candidate) => {
      const coverage = coverageByCandidate.get(candidate.candidateId);
      const role = candidateRole(candidate);
      const segments = coverage?.segmentIds?.length ? coverage.segmentIds.join(", ") : "(없음)";
      return `- ${candidate.candidateId}: titleHint=${candidate.titleHint}, role=${role}, status=${coverage?.status ?? "uncovered"}, segments=[${segments}]`;
    });
  const segmentBlocks = segmentKeyframes.segments.map((entry) => {
    const sourceCuePacket = sourceCuePacketByCandidate.get(entry.candidateId);
    return [
      `[SEGMENT ${entry.segmentId}]`,
      `candidateId: ${entry.candidateId}`,
      `titleHint: ${entry.titleHint}`,
      `candidateStatus: ${entry.candidateStatus}`,
      `evidenceStrength: ${entry.evidenceStrength}`,
      `outputRole: ${entry.outputRole ?? "recipe"}`,
      `bundleParentId: ${entry.bundleParentId ?? "(없음)"}`,
      `bundleParentTitle: ${entry.bundleParentTitle ?? "(없음)"}`,
      `time: ${entry.startSec}-${entry.endSec}`,
      `textEvidence: ${entry.textEvidence.length ? entry.textEvidence.join(" / ") : "(없음)"}`,
      ...(sourceCuePacket ? ["", formatSourceCuePacket(sourceCuePacket)] : []),
      "selectedFrames:",
      ...entry.selectedFrames.map((frame, index) => `- ${index + 1}. file=${frame.file}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, frameReason=${frame.reason ?? "unknown"}, selectionReason=${frame.selectionReason ?? "unknown"}`),
    ].join("\n");
  }).join("\n\n");

  const coverageLines = (segmentPlan.coverage ?? []).map((entry) => {
    const segments = entry.segmentIds.length ? entry.segmentIds.join(", ") : "(없음)";
    const reason = entry.dropReason ? `, dropReason=${entry.dropReason}` : "";
    return `- ${entry.candidateId}: titleHint=${entry.titleHint}, status=${entry.status}, outputRole=${entry.outputRole ?? "recipe"}, segments=[${segments}]${reason}`;
  });

  return [
    prompt,
    "",
    "추가 입력: 아래는 source-derived candidate hint를 먼저 만든 뒤, candidate/segment별로 고른 핵심 프레임 묶음이다.",
    "candidate, segment plan, selected frames는 책갈피일 뿐이며 정답이 아니다.",
    "최종 판단은 제목, 설명란, 댓글, 자막/발화, 첨부 프레임의 실제 화면을 함께 보고 한다.",
    "",
    "중요한 우선순위:",
    "1. candidate는 힌트다. 충분한 근거가 없으면 별도 recipe로 만들지 않는다.",
    "2. confirmed_hint라도 화면/자막/설명란 근거가 부족하면 무리하게 recipe로 만들지 않는다.",
    "3. 각 candidate/SEGMENT의 재료와 단계를 다른 candidate로 섞지 않는다.",
    "4. 같은 요리의 연속 구간으로 보일 때만 하나의 recipe로 합친다.",
    "5. 소스, 토핑, 플레이팅만 따로 나온 segment는 별도 recipe로 만들지 말고 관련 recipe의 재료/단계에 합친다.",
    "6. 설명란/댓글/자막/발화에 재료명과 수량이 명시되면 화면 추정보다 우선한다.",
    "7. 화면에서만 보이는 수량은 amountBasis를 visual-estimate로 둔다.",
    "8. '초록색 줄기채소', '노란색 긴 재료' 같은 추상 이름은 최후의 수단이다.",
    "9. 영상에 없는 재료나 단계를 요리 상식으로 추가하지 않는다.",
    "10. Output recipe candidates는 recipes[] 출력 후보이고, Support-only candidates는 구간/별칭 참고용이다. Support-only candidate를 recipes[] title로 직접 출력하지 않는다.",
    ...(sourceCuePacketPlan ? [
      "11. sourceCuePacket은 후보별 원문 책갈피다. 정답이 아니라, 설명란/댓글/자막에서 근거를 다시 찾기 위한 작은 단서로만 쓴다.",
      "12. sourceCuePacket의 localSourceSnippets와 cookingCueSnippets에 명시 재료, 수량, 조리 동작이 있으면 먼저 대조하되 이벤트/구매/BGM성 문구는 무시한다.",
    ] : []),
    "",
    "Output recipe candidates:",
    ...(outputCandidateLines.length ? outputCandidateLines : ["- (없음)"]),
    "",
    "Support-only candidates:",
    ...(supportOnlyCandidateLines.length ? supportOnlyCandidateLines : ["- (없음)"]),
    "",
    "candidate hints JSON:",
    JSON.stringify(candidatePlan, null, 2),
    "",
    "Candidate coverage checklist:",
    ...(coverageLines.length ? coverageLines : ["- (coverage 없음)"]),
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
  candidatePlanHash,
  frameOptions,
  segmentOptions,
  sourceCuePackets,
}) {
  const keyPayload = {
    provider: PROVIDER,
    keyframeMode: "segmented",
    model,
    selectorModel,
    segmentModel,
    promptHash: hashText(prompt),
    cacheTextHash: hashText(cacheText),
    frameManifest,
    candidatePlanHash,
    frameOptions,
    segmentOptions,
    clientVersion: CLIENT_VERSION,
    candidateSplitterVersion: CANDIDATE_SPLITTER_VERSION,
    timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
    bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
    segmentPromptVersion: SEGMENT_PROMPT_VERSION,
    segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
    finalPromptVersion: FINAL_PROMPT_VERSION,
  };
  if (sourceCuePackets) keyPayload.sourceCuePacketVersion = SOURCE_CUE_PACKET_VERSION;
  return hashKey(keyPayload);
}

function frameLookup(frames) {
  const byFile = new Map();
  const byPath = new Map();
  const byTimestamp = new Map();
  frames.forEach((frame, index) => {
    byFile.set(frameBasename(frame), frame);
    byPath.set(frame.path, frame);
    byFile.set(String(index + 1), frame);
    if (frame.index !== undefined && frame.index !== null) byFile.set(String(frame.index), frame);
    const timestampKey = frameTimestampKey(frameTimestampSec(frame));
    if (timestampKey) byTimestamp.set(timestampKey, frame);
  });
  return { byFile, byPath, byTimestamp };
}

function frameTimestampKey(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp.toFixed(3) : null;
}

function timestampFromFrameFileName(fileName) {
  const match = path.basename(String(fileName ?? "")).match(FRAME_FILE_TIMESTAMP_RE);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function nearestFrameByTimestamp(frames, targetTimestamp) {
  if (!Number.isFinite(targetTimestamp)) return null;
  let nearest = null;
  let nearestDelta = Infinity;
  for (const frame of frames) {
    const timestamp = frameTimestampSec(frame);
    if (!Number.isFinite(timestamp)) continue;
    const delta = Math.abs(timestamp - targetTimestamp);
    if (delta < nearestDelta) {
      nearest = frame;
      nearestDelta = delta;
    }
  }
  return nearestDelta <= FRAME_TIMESTAMP_TOLERANCE_SEC ? nearest : null;
}

function resolveSelectedFrame(rawFile, candidateFrames, lookup) {
  const file = path.basename(String(rawFile));
  const exact = lookup.byFile.get(file) ?? lookup.byPath.get(String(rawFile)) ?? lookup.byFile.get(String(rawFile));
  if (exact) return exact;

  const timestamp = timestampFromFrameFileName(file);
  const timestampKey = frameTimestampKey(timestamp);
  return (timestampKey ? lookup.byTimestamp.get(timestampKey) : null)
    ?? nearestFrameByTimestamp(candidateFrames, timestamp);
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
  const lookup = frameLookup(candidateFrames);
  const selected = [];
  const seenPaths = new Set();
  const recipeCounts = new Map();

  for (const entry of rawEntries) {
    const rawFile = selectedFrameFile(entry);
    if (!rawFile) continue;
    const frame = resolveSelectedFrame(rawFile, candidateFrames, lookup);
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
  sourceCuePackets = false,
}) {
  let stage = "candidate-split";
  const candidatePlan = buildCandidateHintsFromSourceText(cacheText);
  const candidatePlanHash = hashText(canonicalJson(candidatePlan.recipeCandidates));
  const resultKey = buildCodexVisionSegmentedKeyframesCacheKey({
    model,
    selectorModel,
    segmentModel,
    prompt,
    cacheText,
    frameManifest: manifestHash,
    candidatePlanHash,
    frameOptions,
    segmentOptions,
    sourceCuePackets,
  });
  const resultDir = path.join(cacheDir, resultKey);
  const finalJsonPath = path.join(resultDir, "final.json");
  const sourceCueMeta = sourceCuePackets
    ? {
      sourceCuePacketsEnabled: true,
      sourceCuePacketVersion: SOURCE_CUE_PACKET_VERSION,
    }
    : {};

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
        candidateSplitterVersion: CANDIDATE_SPLITTER_VERSION,
        timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
        bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
        ...sourceCueMeta,
        candidatePlanHash,
        candidateCount: candidatePlan.recipeCandidates.length,
        frameCacheHit: frameResult.frameCacheHit,
        visionCacheHit: true,
        codexVisionKeyframesCacheDir: resultDir,
      },
    };
  }

  await mkdir(resultDir, { recursive: true });
  await copyIfExists(path.join(frameResult.frameDir, "frames.json"), path.join(resultDir, "frames.json"));
  await copyIfExists(path.join(frameResult.frameDir, "extraction_stats.json"), path.join(resultDir, "extraction_stats.json"));
  await writeFile(path.join(resultDir, "recipe-candidates.json"), JSON.stringify({
    ...candidatePlan,
    candidatePlanHash,
  }, null, 2) + "\n", "utf8");

  let segmentPlan = null;
  let segmentKeyframes = null;
  let sourceCuePacketPlan = null;
  try {
    stage = "segment-plan";
    const maxFrameSec = maxFrameTimestampSec(frames);
    const segmentPrompt = buildSegmentPlanPrompt({
      sourceText: cacheText,
      frames,
      candidatePlan,
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

      const { rawPlan } = extractSegmentPlanJson(segmentRaw, {
        maxFrameSec,
      });
      stage = "segment-normalize";
      segmentPlan = normalizeSegmentPlan(rawPlan, {
        maxCount: segmentOptions.maxCount,
        maxFrameSec,
        totalFrameLimit: segmentOptions.frameTotalLimit,
        perSegmentMaxFrames: segmentOptions.maxFrames,
        overlapToleranceSec: segmentOptions.overlapToleranceSec,
        candidatePlan,
      });
      segmentPlan = applyTimelineParentRanges(
        segmentPlan,
        buildTimelineParentRangePlan({ sourceText: cacheText, lastKeyframeSec: maxFrameSec }),
        candidatePlan,
      );
      segmentPlan = applyBundleChildSegments(segmentPlan, candidatePlan, {
        totalFrameLimit: segmentOptions.frameTotalLimit,
      });
      await writeFile(segmentJsonPath, JSON.stringify(segmentPlan, null, 2) + "\n", "utf8");
    }

    sourceCuePacketPlan = sourceCuePackets
      ? buildSourceCuePacketsFromSourceText(cacheText, candidatePlan, segmentPlan)
      : null;

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
      const rawSelectorEntries = Array.isArray(selectorJson.selectedFrames) ? selectorJson.selectedFrames : [];
      const selectorLookup = frameLookup(candidateFrames);
      const rawEntryByFramePath = new Map();
      for (const entry of rawSelectorEntries) {
        const rawFile = selectedFrameFile(entry);
        if (!rawFile) continue;
        const frame = resolveSelectedFrame(rawFile, candidateFrames, selectorLookup);
        if (frame) rawEntryByFramePath.set(frame.path, entry);
      }
      const selectedForJson = selectedFrames.map((frame) => {
        const rawEntry = rawEntryByFramePath.get(frame.path);
        return {
          index: frame.index,
          timestamp_sec: frame.timestamp_sec,
          timestamp: frame.timestamp,
          file: frameBasename(frame),
          path: frame.path,
          reason: frame.reason ?? null,
          selectionReason: isObject(rawEntry) ? (rawEntry.reason ?? null) : null,
          scene_score: frame.scene_score ?? null,
          candidateId: segment.candidateId,
          titleHint: segment.titleHint,
          bundleParentId: segment.bundleParentId ?? null,
          bundleParentTitle: segment.bundleParentTitle ?? null,
          candidateStatus: segment.candidateStatus,
          evidenceStrength: segment.evidenceStrength,
          outputRole: segment.outputRole ?? "recipe",
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
      selectedFramesWithSegment.push(...selectedFrames.map((frame) => {
        const selectedFrame = selectedForJson.find((entry) => entry.path === frame.path);
        return { frame, segment, selectedFrame };
      }));
    }

    const finalSelectedFrames = dedupeFrames(selectedFramesWithSegment.map((entry) => entry.frame));
    const selectedFrameHash = frameManifestHash(finalSelectedFrames);
    const coveredCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "covered").length;
    const droppedCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "dropped").length;
    const supportingCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "supporting").length;
    segmentKeyframes = {
      candidatePlanHash,
      selectedFrameHash,
      selectedFrameCount: finalSelectedFrames.length,
      segmentSelectedFrameCount: selectedFramesWithSegment.length,
      candidateCount: candidatePlan.recipeCandidates.length,
      coveredCandidateCount,
      droppedCandidateCount,
      supportingCandidateCount,
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      segments: segmentEntries,
    };
    await writeFile(path.join(resultDir, "segment-keyframes.json"), JSON.stringify(segmentKeyframes, null, 2) + "\n", "utf8");
    await writeFile(
      path.join(resultDir, "selected_frames.json"),
      JSON.stringify({
        selectedFrameHash,
        selectedFrameCount: finalSelectedFrames.length,
        keyframeMode: "segmented",
        selectedFrames: selectedFramesWithSegment.map(({ frame, segment, selectedFrame }) => ({
          index: frame.index,
          timestamp_sec: frame.timestamp_sec,
          timestamp: frame.timestamp,
          file: frameBasename(frame),
          path: frame.path,
          reason: frame.reason ?? null,
          selectionReason: selectedFrame?.selectionReason ?? null,
          scene_score: frame.scene_score ?? null,
          segmentId: segment.segmentId,
          candidateId: segment.candidateId,
          titleHint: segment.titleHint,
          bundleParentId: segment.bundleParentId ?? null,
          bundleParentTitle: segment.bundleParentTitle ?? null,
          outputRole: segment.outputRole ?? "recipe",
        })),
      }, null, 2) + "\n",
      "utf8",
    );

    stage = "final";
    const finalPrompt = buildSegmentedFinalPrompt({
      prompt,
      sourceText: cacheText,
      candidatePlan,
      segmentPlan,
      segmentKeyframes,
      sourceCuePacketPlan,
    });
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
      candidateSplitterVersion: CANDIDATE_SPLITTER_VERSION,
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      ...sourceCueMeta,
      segmentPromptVersion: SEGMENT_PROMPT_VERSION,
      segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
      finalPromptVersion: FINAL_PROMPT_VERSION,
      cached: false,
      usedVisual: true,
      frameCount: frames.length,
      candidateFrameCount,
      candidateCount: candidatePlan.recipeCandidates.length,
      coveredCandidateCount,
      droppedCandidateCount,
      supportingCandidateCount,
      segmentCount: segmentPlan.segments.length,
      selectedFrameCount: finalSelectedFrames.length,
      segmentSelectedFrameCount: selectedFramesWithSegment.length,
      candidatePlanHash,
      selectedFrameHash,
      segmentPlanHash: hashText(JSON.stringify(segmentPlan)),
      segmentKeyframesHash: hashText(JSON.stringify(segmentKeyframes)),
      ...(sourceCuePacketPlan ? { sourceCuePacketHash: hashText(JSON.stringify(sourceCuePacketPlan)) } : {}),
      warnings: [
        ...(candidatePlan.warnings ?? []),
        ...(segmentPlan.warnings ?? []),
      ],
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
        candidatePlanHash,
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
      candidateSplitterVersion: CANDIDATE_SPLITTER_VERSION,
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      ...sourceCueMeta,
      candidatePlan,
      candidatePlanHash,
      ...(sourceCuePacketPlan ? { sourceCuePacketHash: hashText(JSON.stringify(sourceCuePacketPlan)) } : {}),
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
  const sourceCuePackets = Boolean(options.sourceCuePackets);
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
          sourceCuePackets,
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
