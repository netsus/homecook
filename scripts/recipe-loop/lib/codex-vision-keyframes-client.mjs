// Codex Vision keyframe client for recipe-loop.
// It keeps the old codex-vision path intact and adds a new two-stage flow:
// 1) a smaller model selects useful frames, 2) the final model extracts recipes from text + selected images.

import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
const CLIENT_VERSION = "codex-vision-keyframes-client-v4-single-fast12";
const SELECTOR_PROMPT_VERSION = "keyframe-selector-v3-single-visual-evidence";
const CANDIDATE_SPLITTER_VERSION = "candidate-splitter-v5";
const SEGMENT_PROMPT_VERSION = "keyframe-segment-plan-v4";
const SEGMENT_PLAN_COMPATIBLE_REUSE_VERSION = "segment-plan-compatible-reuse-v1";
const SEGMENT_SELECTOR_PROMPT_VERSION = "keyframe-segment-selector-v5";
const SEGMENT_SELECTOR_COMPATIBLE_REUSE_VERSION = "segment-selector-compatible-reuse-v1";
const SEGMENT_SELECTOR_DETERMINISTIC_SELECTION_VERSION = "segment-selector-deterministic-selection-v1";
const FINAL_RAW_RECOVERY_VERSION = "final-raw-recovery-v1";
const SEGMENT_BRIDGE_FRAME_VERSION = "segment-bridge-frame-v1";
const SEGMENT_PHASE_ANCHOR_FRAME_VERSION = "segment-phase-anchor-frame-v2";
const FINAL_PROMPT_VERSION = "keyframe-final-v32-single-four-source";
const MODEL_SOURCE_BOUNDARY_VERSION = "model-source-boundary-v1";
const ONSCREEN_TEXT_PRIORITY_VERSION = "onscreen-text-priority-v1";
const VISUAL_IDENTITY_GUARD_VERSION = "visual-identity-guard-ledger-repair-v2-dehardcoded";
const SEGMENTED_REPAIR_PROMPT_VERSION = "keyframe-source-gap-repair-v7-dehardcoded";
const SEGMENTED_REPAIR_PATCH_PROMPT_VERSION = "keyframe-source-gap-patch-repair-v7-dehardcoded";
const SEGMENTED_REPAIR_TARGETED_PATCH_PROMPT_VERSION = "keyframe-source-gap-targeted-patch-repair-v7-dehardcoded";
const SEGMENTED_REPAIR_VERIFIED_PATCH_PROMPT_VERSION = "keyframe-source-gap-patch-verified-repair-v8-dehardcoded";
const TIMELINE_PARENT_RANGE_VERSION = "timeline-parent-range-v1";
const BUNDLE_CHILD_SEGMENT_VERSION = "bundle-child-segment-v2";
const DESCRIPTION_MENU_PARENT_RANGE_VERSION = "description-menu-parent-range-v1";
const FINAL_INPUT_POLICY_VERSION = "final-input-policy-v1";
const SEGMENTED_FINAL_BASE_PROMPT_POLICY_VERSION = "segmented-final-base-prompt-policy-v1";
const SOURCE_CUE_PACKET_VERSION = "source-cue-packet-v5";
const RECIPE_EVIDENCE_LEDGER_VERSION = "recipe-evidence-ledger-v3";
const VISUAL_FRAME_LEDGER_VERSION = "visual-frame-ledger-v10-dehardcoded";
const VISUAL_FRAME_LEDGER_RAW_RECOVERY_VERSION = "visual-frame-ledger-raw-recovery-v1";
const VISUAL_FRAME_LEDGER_BATCH_CONTEXT_VERSION = "visual-frame-ledger-batch-context-v1";
const VISUAL_FRAME_LEDGER_FALLBACK_VERSION = "visual-frame-ledger-fallback-v1";
const VISUAL_FRAME_LEDGER_TIMEOUT_CAP_MS = 5 * 60 * 1000;
const RECIPE_MUST_CONSIDER_FACTS_VERSION = "recipe-must-consider-facts-v8";
const TITLE_VISUAL_BRIDGE_FACTS_VERSION = "title-visual-bridge-facts-v6-dehardcoded";
const EVIDENCE_PACKET_SOURCE_CUE_BRIDGE_VERSION = "evidence-packet-source-cue-bridge-v6";
const PER_SEGMENT_TITLE_NORMALIZATION_VERSION = "per-segment-title-normalization-v1";
const PER_SEGMENT_SOURCE_TIME_FILTER_VERSION = "per-segment-source-time-filter-v1";
const PER_SEGMENT_BASE_SOURCE_STRIP_VERSION = "per-segment-base-source-strip-v1";
const PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION = "per-segment-visual-ledger-source-mention-filter-v1";
const PER_SEGMENT_SOURCE_TIME_FILTER_MARGIN_SEC = 25;
const DEFAULT_FINAL_MODEL = "gpt-5.4";
const DEFAULT_SELECTOR_MODEL = "gpt-5.4-mini";
const DEFAULT_SEGMENT_MODEL = "gpt-5.4-mini";
const DEFAULT_MAX_FRAMES = 120;
const DEFAULT_STORYBOARD_MAX_FRAMES = 0;
const DEFAULT_SELECTOR_CANDIDATE_LIMIT = 96;
const DEFAULT_KEYFRAME_TOTAL_LIMIT = 60;
const DEFAULT_KEYFRAMES_PER_RECIPE = 8;
const SINGLE_FAST_FRAME_MODE = "hybrid";
const SINGLE_FAST_INTERVAL_SEC = 4;
const SINGLE_FAST_HYBRID_ANCHOR_BUDGET = 36;
const SINGLE_FAST_SELECTOR_CANDIDATE_LIMIT = 12;
const SINGLE_FAST_KEYFRAME_TOTAL_LIMIT = 8;
const DEFAULT_KEYFRAME_MODE = "global";
const DEFAULT_SEGMENT_PADDING_SEC = 8;
const DEFAULT_SEGMENT_MIN_FRAMES = 8;
const DEFAULT_SEGMENT_MAX_FRAMES = 24;
const DEFAULT_SEGMENT_MAX_COUNT = 12;
const DEFAULT_SEGMENT_FRAME_TOTAL_LIMIT = 64;
const DEFAULT_SEGMENT_OVERLAP_TOLERANCE_SEC = 15;
const DEFAULT_SEGMENT_SELECTOR_CANDIDATE_LIMIT = null;
const DEFAULT_SEGMENTED_FINAL_MODE = "combined";
const SEGMENTED_FINAL_MODES = new Set(["combined", "per-segment"]);
const DEFAULT_SEGMENTED_REPAIR_MODE = "none";
const SEGMENTED_REPAIR_MODES = new Set(["none", "source-gap", "source-gap-patch", "source-gap-patch-targeted", "source-gap-patch-verified"]);
const DEFAULT_SEGMENT_BRIDGE_FRAMES = false;
const DEFAULT_SEGMENT_PHASE_ANCHOR_FRAMES = false;
const DEFAULT_VISUAL_FRAME_LEDGER_BATCH_SIZE = 0;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_CANDIDATE_HINTS = 16;
const SOURCE_BLOCK_RE = /^\[SOURCE:\s*([^\]]+)\]\s*$/;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/;
const TIMESTAMP_RE = /(?:^|[\s[])((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)(?:\])?(?:\s*[~-]\s*\[?(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\]?){0,1}/;
const CANDIDATE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const JOINER_RE = /\s+(?:와|과|그리고)\s+/;
const MENU_HEADING_RE = /^\*?\s*(?:메뉴|menus?|menu list)\s*\*?\s*[:：]?\s*$/iu;
const DESCRIPTION_MENU_STOP_RE = /^(?:\*?\s*(?:재료|ingredients?|ingredient|만들기|조리|레시피|recipe|instructions?|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|bgm|music|음악|문의|email|인스타|instagram)\s*\*?\s*[:：]?|\[[^\]]{2,100}\]|https?:\/\/)/iu;
const NOISE_CANDIDATE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|재료|ingredients?|instructions?|레시피|recipe|시식|먹방|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|주방용품|용품|bgm|music|음악|문의|email|인스타|instagram|facebook|camera|equipment|브이로그|vlog|집밥)(?:$|[\s:：\-\/|ㅣ&＆+·ㆍ])/i;
const INGREDIENT_PAIR_RE = /^(?:소금|후추|마늘|버터|설탕|간장|된장|고추장|식초|기름|참기름|들기름|깨|통깨|물|육수|대파|쪽파|양파)(?:\s*(?:와|과|&|\/|\+)\s*)(?:소금|후추|마늘|버터|설탕|간장|된장|고추장|식초|기름|참기름|들기름|깨|통깨|물|육수|대파|쪽파|양파)$/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|생채|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|꼬치|갈비|맥적|야끼|치즈|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;
const GENERIC_RECIPE_LABEL_RE = /(?:레시피|recipe|요리|만드는\s*법|how\s*to)(?:\s*)$/i;
const FRAME_FILE_TIMESTAMP_RE = /_(\d+(?:\.\d+)?)(?:\.[^.]+)$/;
const FRAME_TIMESTAMP_TOLERANCE_SEC = 0.075;
const TIMELINE_RANGE_CONFIDENCE_THRESHOLD = 0.75;
const LAST_RANGE_TAIL_WARNING_SEC = 7 * 60;
const SOURCE_CUE_IDENTITY_LIMIT = 5;
const SOURCE_CUE_TIMELINE_LIMIT = 3;
const SOURCE_CUE_LOCAL_SNIPPET_LIMIT = 4;
const SOURCE_CUE_COOKING_SNIPPET_LIMIT = 5;
const SOURCE_CUE_UNCERTAINTY_LIMIT = 3;
const SOURCE_CUE_SNIPPET_MAX_CHARS = 160;
const SOURCE_CUE_PACKET_MAX_CHARS = 1200;
const SOURCE_CUE_LOCAL_WINDOW_LINES = 3;
const SOURCE_CUE_SEASONING_RE = /(양념|소스|밑간|간(?:을|이|은|만|맞|해|하|해서|하고|한다|보기|보며|$|[\s,.，。])|고명|밥물|국물|육수|해장|매운|고추|고춧가루|고추장|고추기름|마늘|대파|향채|향신|토마토소스|면\s*삶|무침|비비|올리|졸이|코팅|계란|달걀|전분|튀김옷|참기름|깨|통깨|마무리|곁들|수분)/u;
const COOKING_ACTION_VERB_RE = /(?:^|[^\p{L}])(?:볶(?:아|고|는|는다|다가|지|으|습니다|아요|게|으면|아서|기\s*(?:전|전에|위해))|굽(?:고|는|는다|지|습니다|어요|어|기\s*(?:전|전에|위해))|끓(?:이|여|고|는|인다|입니다|였|여서|지|기\s*(?:전|전에|위해))|삶(?:아|고|는|는다|습니다|기\s*(?:전|전에|위해))|튀기(?:고|는|지|면|기\s*(?:전|전에|위해))|무치(?:고|는|면|기\s*(?:전|전에|위해))|섞(?:고|어|는다|습니다)|넣(?:고|어|는다|습니다)|부치(?:고|는|면)|익히(?:고|는|면|기)|졸(?:이|여|고|는|인다|입니다)|비비(?:고|는|면)|올리(?:고|는|면))/u;
const SOURCE_CUE_COOKING_RE = new RegExp(`${SOURCE_CUE_SEASONING_RE.source}|${COOKING_ACTION_VERB_RE.source}`, "u");
const SOURCE_CUE_NOISE_RE = /(구독|좋아요|댓글\s*이벤트|이벤트|공지|알림|협찬|광고|할인|쿠폰|공구|공동구매|구매처|판매처|쇼핑|배송|택배|링크|https?:\/\/|www\.|인스타|instagram|email|메일|문의|BGM|music|음악|노래|camera|equipment|촬영장비)/i;
const EVIDENCE_CUE_CORE_SEASONING_RE = /^(?:액젓|쯔유|들기름|참기름|된장|간장|진간장|고추장|고춧가루|맛술|알룰로스|스프|육수|동치미\s*육수|열무김치)$/u;
const EVIDENCE_CUE_GENERIC_LOW_PRIORITY_RE = /^(?:소금|후추|물)$/u;
const RECIPE_LEDGER_EVIDENCE_ITEM_LIMIT = 12;
const RECIPE_LEDGER_PROMPT_SOURCE_LIMIT = 4;
const RECIPE_LEDGER_PROMPT_SELECTOR_LIMIT = 1;
const RECIPE_LEDGER_PROMPT_TEXT_MAX_CHARS = 120;
const RECIPE_LEDGER_PROMPT_RECIPE_BUDGET_CHARS = 520;
const RECIPE_LEDGER_PROMPT_TOTAL_BUDGET_CHARS = 2800;
const RECIPE_LEDGER_SOURCE_TEXT_MAX_CHARS = 220;
const RECIPE_LEDGER_AMOUNT_RE = /(?:\d+(?:\.\d+)?\s*)?(?:큰술|작은술|숟가락|스푼|컵|봉|팩|줌|개|장|줄|대|마리|알|g|kg|ml|l|L|T|t|그램|킬로|리터)/u;
const VISUAL_FRAME_LEDGER_PROMPT_TOTAL_BUDGET_CHARS = 4200;
const VISUAL_FRAME_LEDGER_TEXT_MAX_CHARS = 160;
const RECIPE_MUST_CONSIDER_FACTS_TOTAL_BUDGET_CHARS = 3600;
const RECIPE_MUST_CONSIDER_FACTS_TEXT_MAX_CHARS = 140;
const RECIPE_MUST_CONSIDER_SOURCE_FACT_LIMIT = 8;
const RECIPE_MUST_CONSIDER_VISUAL_FACT_LIMIT = 8;
const RECIPE_MUST_CONSIDER_UNCERTAINTY_LIMIT = 3;
const SEGMENTED_REPAIR_PATCH_LIMIT = 16;
const SEGMENTED_REPAIR_VERIFIED_EVIDENCE_SOURCE_RE = /(transcript|자막|caption|source\s*cue|sourceCuePacket|ledger|evidence\s*ledger|selected\s*frame|frame|source\s*text|description|설명|comment|댓글)/i;
const SEGMENTED_REPAIR_WEAK_EVIDENCE_RE = /(근거\s*약|불확실|추정|아마|maybe|uncertain|guess|not\s*sure)/i;
const STEP_EVIDENCE_STOP_TOKENS = new Set([
  "transcript",
  "sourcecuepacket",
  "ledger",
  "selectedframe",
  "source",
  "text",
  "자막",
  "설명",
  "근거",
  "넣고",
  "넣는다",
  "넣어",
  "볶고",
  "볶는다",
  "끓이고",
  "끓인다",
  "굽고",
  "굽는다",
  "섞고",
  "섞는다",
  "한다",
  "해주세요",
  "해준다",
  "마무리",
  "준비",
]);
const KOREAN_PARTICLE_SUFFIX_RE = /(으로|에서|에게|부터|까지|처럼|보다|하고|이나|거나|와|과|을|를|이|가|은|는|에|도|만|의|로)$/u;
const SEGMENT_BRIDGE_FRAME_MIN_GAP_SEC = 9;
const SEGMENT_BRIDGE_FRAME_MAX_PER_SEGMENT = 1;
const SEGMENT_PHASE_ANCHOR_MIN_DURATION_SEC = 45;
const SEGMENT_PHASE_ANCHOR_TARGET_RATIO = 0.6;
const SEGMENT_PHASE_ANCHOR_NEAR_SEC = 10;
const LOW_INFO_SELECTION_RE = /(완성|플레이팅|최종|종료|담기|finished|plating|final|end)/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonTextCandidates(text) {
  const raw = String(text ?? "").trim();
  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  candidates.push(raw);
  return candidates;
}

function balanceJsonClosures(text) {
  const stack = [];
  let out = "";
  let inString = false;
  let escaped = false;

  for (const char of String(text ?? "")) {
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      out += char;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      out += char;
      continue;
    }

    if (char === "}") {
      if (stack.at(-1) === "[") {
        stack.pop();
        out += "]";
        continue;
      }
      if (stack.at(-1) === "{") stack.pop();
      out += char;
      continue;
    }

    if (char === "]") {
      if (stack.at(-1) === "{") {
        stack.pop();
        out += "}";
        continue;
      }
      if (stack.at(-1) === "[") stack.pop();
      out += char;
      continue;
    }

    out += char;
  }

  while (stack.length > 0) {
    const open = stack.pop();
    out += open === "{" ? "}" : "]";
  }
  return out;
}

function extractJsonFromTextWithClosureRepair(text) {
  try {
    return extractJsonFromText(text);
  } catch (originalError) {
    for (const candidate of jsonTextCandidates(text)) {
      const repaired = balanceJsonClosures(candidate);
      if (repaired === candidate) continue;
      try {
        return JSON.parse(repaired);
      } catch {
        // Try the next candidate, then rethrow the original parse error.
      }
    }
    throw originalError;
  }
}

async function readRecoveredFinalRawJson(rawPath) {
  if (!existsSync(rawPath)) return null;
  try {
    const raw = await readFile(rawPath, "utf8");
    const json = extractJsonFromText(raw);
    if (!isObject(json) || !Array.isArray(json.recipes)) return null;
    return { raw, json };
  } catch {
    return null;
  }
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

function booleanOption(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function keyframeModeFrom(value) {
  const mode = String(value ?? DEFAULT_KEYFRAME_MODE).trim() || DEFAULT_KEYFRAME_MODE;
  if (!["global", "segmented"].includes(mode)) {
    throw new Error(`지원하지 않는 keyframe mode입니다: ${mode}. 사용 가능: global, segmented`);
  }
  return mode;
}

function segmentedFinalModeFrom(value) {
  const mode = String(value ?? DEFAULT_SEGMENTED_FINAL_MODE).trim() || DEFAULT_SEGMENTED_FINAL_MODE;
  if (!SEGMENTED_FINAL_MODES.has(mode)) {
    throw new Error(`지원하지 않는 segmented final mode입니다: ${mode}. 사용 가능: ${[...SEGMENTED_FINAL_MODES].join(", ")}`);
  }
  return mode;
}

function segmentedRepairModeFrom(value) {
  const mode = String(value ?? DEFAULT_SEGMENTED_REPAIR_MODE).trim() || DEFAULT_SEGMENTED_REPAIR_MODE;
  if (!SEGMENTED_REPAIR_MODES.has(mode)) {
    throw new Error(`지원하지 않는 segmented repair mode입니다: ${mode}. 사용 가능: ${[...SEGMENTED_REPAIR_MODES].join(", ")}`);
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
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
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

function fallbackWeakRecipeTitleFromSourceText(sourceText) {
  for (const block of sourceBlocks(sourceText)) {
    if (block.name !== "recipe_candidate_hints") continue;
    const cleanedLines = block.lines.map(stripCandidateText).filter(Boolean);
    for (const line of block.lines) {
      const cleaned = stripCandidateText(line);
      if (!cleaned) continue;
      const pairMatch = cleaned.match(/^(.{1,18}?)(?:와|과)\s*(.{1,18}?)(?:을|를|은|는|이|가|로|으로|\s|$)/u);
      if (!pairMatch) continue;
      const left = stripCandidateText(pairMatch[1]);
      const right = stripCandidateText(pairMatch[2]);
      if (!left || !right || left.length > 12 || right.length > 12) continue;
      return `${left} ${right} 요리`;
    }
    for (let index = 0; index < cleanedLines.length - 1; index += 1) {
      const left = cleanedLines[index];
      const next = cleanedLines[index + 1];
      const rightMatch = next.match(/^(.{1,18}?)(?:을|를|은|는|이|가|로|으로|\s|$)/u);
      const right = rightMatch ? stripCandidateText(rightMatch[1]) : "";
      if (!left || !right || left.length > 12 || right.length > 12) continue;
      if (titleHasDishWord(left) || titleHasDishWord(right)) continue;
      return `${left} ${right} 요리`;
    }
  }

  return null;
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

function descriptionMenuRowsFromBlocks(blocks) {
  const rows = [];
  for (const block of blocks) {
    if (block.name !== "description") continue;
    let inMenu = false;
    let collected = 0;
    for (const rawLine of block.lines) {
      const line = compact(rawLine);
      if (MENU_HEADING_RE.test(line)) {
        inMenu = true;
        collected = 0;
        continue;
      }
      if (!inMenu) continue;
      if (!line) {
        if (collected > 0) break;
        continue;
      }
      if (MENU_HEADING_RE.test(line) || DESCRIPTION_MENU_STOP_RE.test(line)) break;
      const title = stripCandidateText(line);
      if (!title || NOISE_CANDIDATE_RE.test(title)) {
        if (collected > 0) break;
        continue;
      }
      const parts = splitLooseBundleText(title).filter(Boolean);
      if (parts.length > 0) {
        rows.push({
          rowIndex: rows.length,
          title,
          parts,
          source: block.name,
          text: line,
        });
        collected += 1;
      }
    }
  }
  return rows;
}

function addDescriptionMenuBundleParents(candidates, byKey, blocks) {
  for (const row of descriptionMenuRowsFromBlocks(blocks)) {
    if (row.parts.length < 2) continue;
    const matchedMembers = row.parts
      .map((part) => candidates.find((candidate) => (
        candidate.bundleRole !== "parent"
        && candidateMatchesBundlePart(candidate.titleHint, part)
      )))
      .filter(Boolean);
    const uniqueMemberIds = [...new Set(matchedMembers.map((candidate) => candidate.candidateId))];
    if (uniqueMemberIds.length < 2) continue;
    addCandidate(candidates, byKey, row.title, [{
      source: "description_menu",
      text: row.text.slice(0, 220),
    }], {
      splitFromBundle: false,
      bundleText: row.title,
      bundleRole: "parent",
    });
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

  addDescriptionMenuBundleParents(candidates, byKey, blocks);

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
    const weakTitle = fallbackWeakRecipeTitleFromSourceText(sourceText);
    warnings.push(weakTitle
      ? "source text에서 강한 recipe candidate hint를 찾지 못해 제목의 핵심 재료쌍으로 weak segment hint를 만들었습니다."
      : "source text에서 recipe candidate hint를 찾지 못해 전체 segment hint로 fallback합니다.");
    addCandidate(candidates, byKey, weakTitle ?? "전체 레시피", [{
      source: "fallback",
      text: weakTitle ? `weak title fallback: ${weakTitle}` : "candidate hint unavailable",
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

function buildSelectorPrompt({ sourceText, candidateFrames, totalLimit, perRecipeLimit, singleRecipeOnly = false }) {
  if (singleRecipeOnly) {
    return [
      "너는 단일 요리 영상의 핵심 프레임과 화면 글자 근거를 고르는 담당자다.",
      "첨부 이미지는 같은 영상에서 시간순으로 뽑은 후보 프레임이다. 최종 레시피를 작성하지 않는다.",
      "재료명·분량·단위가 적힌 화면 자막, 재료 투입, 조리 상태 변화를 우선한다.",
      "이벤트·광고·BGM·구독·구매 문구와 얼굴/잡담/완성샷 반복은 제외한다.",
      "파일명은 후보 목록의 file 값을 정확히 복사하고 새 파일명을 만들지 않는다.",
      `selectedFrames는 최대 ${totalLimit}개다. 시간축 앞·중간·끝의 실제 공정 근거를 고르게 남긴다.`,
      "observed, onscreenText, quantityCues에는 실제 화면에서 읽거나 확인한 원문만 넣고 추측하지 않는다.",
      "confidence는 0~1이다. 화면 글자가 없으면 세 배열을 비우고 confidence는 null로 둔다.",
      "",
      "출력은 설명 없이 JSON만 한다.",
      "스키마:",
      "{",
      "  \"selectedFrames\": [{",
      "    \"file\": \"frame_0001_00000.000.jpg\",",
      "    \"reason\": \"재료/단계/화면 자막 근거\",",
      "    \"visualEvidence\": {",
      "      \"observed\": [\"양파\"],",
      "      \"onscreenText\": [\"양파 1/2개\"],",
      "      \"quantityCues\": [\"양파 1/2개\"],",
      "      \"confidence\": 0.9",
      "    }",
      "  }]",
      "}",
      "",
      "텍스트 소스:",
      sourceText || "(텍스트 소스 없음)",
      "",
      "후보 프레임 목록:",
      ...candidateFrames.map(frameDisplayLine),
    ].join("\n");
  }

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

function formatVisualEvidenceLine(frame, index) {
  const evidence = frame.visualEvidence ?? { observed: [], onscreenText: [], quantityCues: [], confidence: null };
  return [
    `- ${index + 1}. file=${frameBasename(frame)}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, resolutionSource=${frame.resolutionSource ?? "none"}`,
    `  observed=${JSON.stringify(evidence.observed)}`,
    `  onscreenText=${JSON.stringify(evidence.onscreenText)}`,
    `  quantityCues=${JSON.stringify(evidence.quantityCues)}`,
    `  confidence=${evidence.confidence ?? "null"}`,
  ].join("\n");
}

function buildFinalPrompt({ prompt, sourceText, selectedFrames, selectorJson, singleRecipeOnly = false }) {
  const selectedFrameLines = selectedFrames.map((frame, index) => frameDisplayLine(frame, index));
  if (singleRecipeOnly) {
    return [
      prompt,
      "",
      "추가 입력: selector가 고른 실제 프레임과 그 프레임에 연결된 화면 근거다.",
      "화면 근거는 resolutionSource가 exact 또는 unique-timestamp인 항목만 사용한다.",
      "설명란·작성자 댓글의 명시 분량 > 발화 자막 > 화면 자막 > 시각 추정 순서를 지킨다.",
      "amountBasis=onscreen은 같은 프레임의 onscreenText 또는 quantityCues에 재료명과 수량이 함께 있을 때만 쓴다.",
      "영상에 없는 재료·단계는 요리 상식으로 추가하지 않고 recipes[]에는 정확히 한 레시피만 출력한다.",
      "",
      "선택 프레임 화면 근거:",
      ...selectedFrames.map(formatVisualEvidenceLine),
      "",
      "텍스트 소스 원문 재확인:",
      sourceText || "(텍스트 소스 없음)",
      "",
      "위 정보를 바탕으로 기존 스키마의 JSON만 출력한다.",
    ].join("\n");
  }

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

function formatMsTimestamp(ms) {
  const totalSeconds = Math.max(0, Number(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
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

function findCandidateIdsForMenuPart(candidates, part) {
  return candidates
    .filter((candidate) => (
      candidate.outputRole !== "bundle_parent"
      && candidate.bundleRole !== "parent"
      && candidateMatchesBundlePart(candidate.titleHint, part)
    ))
    .map((candidate) => candidate.candidateId);
}

export function buildDescriptionMenuParentRangePlan({ sourceText, lastKeyframeSec, candidatePlan }) {
  const safeLastKeyframeSec = Number.isFinite(lastKeyframeSec) && lastKeyframeSec > 0 ? lastKeyframeSec : null;
  const candidates = Array.isArray(candidatePlan?.recipeCandidates) ? candidatePlan.recipeCandidates : [];
  const rows = descriptionMenuRowsFromBlocks(sourceBlocks(sourceText))
    .map((row) => {
      const memberIds = [...new Set(row.parts.flatMap((part) => findCandidateIdsForMenuPart(candidates, part)))];
      return { ...row, memberIds };
    })
    .filter((row) => row.memberIds.length > 0);

  if (!safeLastKeyframeSec || rows.length === 0) {
    return {
      rangeSource: "llm_planner_fallback",
      descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
      fallbackReason: rows.length === 0 ? "no_description_menu_rows_found" : "last_keyframe_unavailable",
      parentRanges: [],
    };
  }

  const rowDuration = safeLastKeyframeSec / rows.length;
  const parentRanges = rows.map((row, index) => {
    const startSec = index === 0 ? 0 : rowDuration * index;
    const endSec = index === rows.length - 1 ? safeLastKeyframeSec : rowDuration * (index + 1);
    return {
      parentRangeId: `description-menu-${String(index + 1).padStart(2, "0")}`,
      rowIndex: index,
      rowCount: rows.length,
      title: row.title,
      parts: row.parts,
      memberIds: row.memberIds,
      source: row.source,
      text: row.text,
      startSec,
      endSec,
      rangeSource: "description_menu",
    };
  });

  return {
    rangeSource: "description_menu",
    descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
    fallbackReason: null,
    lastKeyframeSec: safeLastKeyframeSec,
    parentRanges,
  };
}

export function applyDescriptionMenuParentRanges(segmentPlan, menuRangePlan) {
  if (menuRangePlan.rangeSource !== "description_menu" || !Array.isArray(menuRangePlan.parentRanges) || menuRangePlan.parentRanges.length === 0) {
    return {
      ...segmentPlan,
      descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
      descriptionMenuParentRangeApplied: false,
      descriptionMenuParentRangeFallbackReason: menuRangePlan.fallbackReason ?? "description_menu_parent_range_unavailable",
      descriptionMenuParentRanges: menuRangePlan.parentRanges ?? [],
    };
  }

  const rangeByCandidateId = new Map();
  for (const range of menuRangePlan.parentRanges) {
    for (const memberId of range.memberIds ?? []) {
      rangeByCandidateId.set(memberId, range);
    }
  }

  let appliedCount = 0;
  const segments = segmentPlan.segments.map((segment) => {
    if (segment.rangeSource === "description_timeline") return segment;
    const parentRange = rangeByCandidateId.get(segment.candidateId);
    if (!parentRange) return segment;
    appliedCount += 1;
    const evidenceLine = `description_menu_parent_range: ${parentRange.title}`;
    const textEvidence = segment.textEvidence.includes(evidenceLine)
      ? segment.textEvidence
      : [...segment.textEvidence, evidenceLine].slice(0, 8);
    return {
      ...segment,
      startSec: parentRange.startSec,
      endSec: parentRange.endSec,
      rangeSource: "description_menu",
      fallbackReason: null,
      parentRangeId: parentRange.parentRangeId,
      parentRangeTitle: parentRange.title,
      parentRangeStartSec: parentRange.startSec,
      parentRangeEndSec: parentRange.endSec,
      descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
      textEvidence,
    };
  }).sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.segmentId.localeCompare(b.segmentId));

  return {
    ...segmentPlan,
    descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
    descriptionMenuParentRangeApplied: appliedCount > 0,
    descriptionMenuParentRangeAppliedCount: appliedCount,
    descriptionMenuParentRanges: menuRangePlan.parentRanges,
    segments,
    warnings: [
      ...(segmentPlan.warnings ?? []),
      ...(appliedCount > 0 ? [`description menu parent range를 ${appliedCount}개 segment에 적용했습니다.`] : []),
    ],
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

function normalizeSegmentPlanPromptForReuse(prompt) {
  return String(prompt ?? "").replace(
    /(segments는 최대 \d+개, frameBudget 총합은 최대 )\d+(\s*이다\.)/g,
    "$1<FRAME_TOTAL_LIMIT>$2",
  );
}

function segmentFrameBudgetTotal(segmentPlan) {
  return (Array.isArray(segmentPlan?.segments) ? segmentPlan.segments : []).reduce((total, segment) => {
    const budget = Number(segment?.frameBudget);
    return total + (Number.isFinite(budget) && budget > 0 ? budget : 0);
  }, 0);
}

async function findReusableSegmentPlan({ cacheDir, resultDir, segmentPrompt, segmentOptions }) {
  const normalizedPrompt = normalizeSegmentPlanPromptForReuse(segmentPrompt);
  let entries = [];
  try {
    entries = await readdir(cacheDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const currentResultDir = path.resolve(resultDir);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const candidateDir = path.join(cacheDir, entry.name);
    if (path.resolve(candidateDir) === currentResultDir) continue;

    const promptPath = path.join(candidateDir, "segment-plan.prompt.md");
    const jsonPath = path.join(candidateDir, "segment-plan.json");
    if (!existsSync(promptPath) || !existsSync(jsonPath)) continue;

    const candidatePrompt = await readFile(promptPath, "utf8");
    if (normalizeSegmentPlanPromptForReuse(candidatePrompt) !== normalizedPrompt) continue;

    const segmentPlan = JSON.parse(await readFile(jsonPath, "utf8"));
    const segmentCount = Array.isArray(segmentPlan?.segments) ? segmentPlan.segments.length : 0;
    if (segmentCount === 0 || segmentCount > segmentOptions.maxCount) continue;

    const frameBudgetTotal = segmentFrameBudgetTotal(segmentPlan);

    return {
      sourceDir: candidateDir,
      segmentPlan,
      segmentCount,
      frameBudgetTotal,
      requiresNormalization: frameBudgetTotal > segmentOptions.frameTotalLimit,
      mode: "compatible-prompt",
    };
  }
  return null;
}

function normalizeSegmentSelectorPromptForReuse(prompt) {
  return String(prompt ?? "")
    .split("\n")
    .filter((line) => !line.startsWith("textEvidence:") && !line.startsWith("- segment_text_evidence:"))
    .join("\n");
}

async function findReusableSegmentSelector({ cacheDir, resultDir, selectorPrefix, segmentSelectorPrompt, candidateFrames }) {
  const normalizedPrompt = normalizeSegmentSelectorPromptForReuse(segmentSelectorPrompt);
  const selectorLookup = frameLookup(candidateFrames);
  let entries = [];
  try {
    entries = await readdir(cacheDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const currentResultDir = path.resolve(resultDir);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const candidateDir = path.join(cacheDir, entry.name);
    if (path.resolve(candidateDir) === currentResultDir) continue;

    const promptPath = path.join(candidateDir, `${selectorPrefix}.prompt.md`);
    const jsonPath = path.join(candidateDir, `${selectorPrefix}.json`);
    if (!existsSync(promptPath) || !existsSync(jsonPath)) continue;

    const candidatePrompt = await readFile(promptPath, "utf8");
    if (normalizeSegmentSelectorPromptForReuse(candidatePrompt) !== normalizedPrompt) continue;

    const selectorJson = JSON.parse(await readFile(jsonPath, "utf8"));
    const selectedFiles = (Array.isArray(selectorJson?.selectedFrames) ? selectorJson.selectedFrames : [])
      .map(selectedFrameFile)
      .filter(Boolean);
    if (selectedFiles.length === 0) continue;
    const selectedFramesAllAvailable = selectedFiles.every((file) =>
      Boolean(resolveSelectedFrame(file, candidateFrames, selectorLookup)));
    if (!selectedFramesAllAvailable) continue;

    return {
      sourceDir: candidateDir,
      selectorJson,
      selectedFrameCount: selectedFiles.length,
      mode: "compatible-prompt",
    };
  }
  return null;
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
    const normalizedSegmentIds = segmentIdsByCandidate.get(candidate.candidateId) ?? [];
    const rawSegmentIds = Array.isArray(raw?.segmentIds)
      ? raw.segmentIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];
    const segmentIds = normalizedSegmentIds.length > 0 ? normalizedSegmentIds : rawSegmentIds;
    const rawStatus = String(raw?.status ?? "").trim();
    let rawNormalizedStatus = ["covered", "supporting", "dropped", "uncovered"].includes(rawStatus)
      ? rawStatus
      : (segmentIds.length > 0 ? "covered" : "uncovered");
    if (normalizedSegmentIds.length > 0 && (rawNormalizedStatus === "dropped" || rawNormalizedStatus === "uncovered")) {
      warnings.push(`${candidate.candidateId}(${candidate.titleHint}) coverage 상태를 segment 존재 기준 covered로 보정했습니다.`);
      rawNormalizedStatus = "covered";
    }
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

function segmentTitleMatchesCandidate(candidate, titleHint) {
  if (!candidate || !compact(titleHint)) return false;
  return titleMatchesTimelineRange(candidate.titleHint, titleHint)
    || titleMatchesTimelineRange(titleHint, candidate.titleHint);
}

function resolveSegmentCandidate({ rawCandidateId, titleHint, segmentId, candidatesById, candidates, warnings }) {
  const byId = candidatesById.get(rawCandidateId);
  const titleMatches = candidates.filter((candidate) => segmentTitleMatchesCandidate(candidate, titleHint));

  if (byId && segmentTitleMatchesCandidate(byId, titleHint)) {
    return byId;
  }

  if (titleMatches.length === 1) {
    const remapped = titleMatches[0];
    if (rawCandidateId && rawCandidateId !== remapped.candidateId) {
      warnings.push(`${segmentId} candidateId ${rawCandidateId}를 titleHint(${titleHint}) 기준 ${remapped.candidateId}로 보정했습니다.`);
    }
    return remapped;
  }

  if (byId) return byId;
  return null;
}

function minimumFrameBudgetForSegment(segment, segmentCount) {
  if (
    segmentCount === 1
    && segment?.candidateStatus === "weak_hint"
    && segment?.evidenceStrength === "weak_text"
  ) {
    return 12;
  }
  return DEFAULT_SEGMENT_MIN_FRAMES;
}

export function normalizeSegmentPlan(rawPlan, { maxCount, maxFrameSec, totalFrameLimit, perSegmentMaxFrames, overlapToleranceSec, candidatePlan }) {
  const segmentShapeWarnings = [];
  const candidates = Array.isArray(candidatePlan?.recipeCandidates) ? candidatePlan.recipeCandidates : [];
  let rawSegments = (Array.isArray(rawPlan?.segments) ? rawPlan.segments : []).filter((raw, index) => {
    if (!isObject(raw)) return true;
    const hasSegmentTiming = raw.startSec !== undefined || raw.start !== undefined || raw.start_time !== undefined
      || raw.endSec !== undefined || raw.end !== undefined || raw.end_time !== undefined;
    const looksLikeCoverageRow = !hasSegmentTiming
      && Array.isArray(raw.segmentIds)
      && String(raw.status ?? "").trim();
    if (looksLikeCoverageRow) {
      const fallbackId = `segments[${index}]`;
      segmentShapeWarnings.push(`${raw.segmentId ?? fallbackId} coverage 형태의 행이 segments에 섞여 있어 제외했습니다.`);
      return false;
    }
    return true;
  });
  if (rawSegments.length === 0 && candidates.length === 1 && maxFrameSec > 0) {
    const [candidate] = candidates;
    rawSegments = [{
      segmentId: "seg-01",
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint || "전체 레시피",
      startSec: 0,
      endSec: maxFrameSec,
      frameBudget: Math.min(perSegmentMaxFrames, totalFrameLimit),
      notes: "segment planner가 모든 후보를 drop해 전체 영상 구간으로 fallback했습니다.",
    }];
    segmentShapeWarnings.push("segment plan이 빈 배열이라 단일 후보를 전체 영상 fallback segment로 보정했습니다.");
  }
  if (rawSegments.length === 0) throw new Error("segment plan은 segments 배열을 1개 이상 포함해야 합니다.");
  if (rawSegments.length > maxCount) throw new Error(`segment plan segments 개수가 상한(${maxCount})을 넘었습니다.`);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const remapWarnings = [];

  const segments = rawSegments.map((raw, index) => {
    if (!isObject(raw)) throw new Error(`segment ${index + 1}이 object가 아닙니다.`);
    const fallbackId = `seg-${String(index + 1).padStart(2, "0")}`;
    const segmentId = safeSegmentId(raw.segmentId, fallbackId);
    const rawCandidateId = String(raw.candidateId ?? "").trim();
    if (!rawCandidateId) throw new Error(`${segmentId} candidateId가 비었습니다.`);
    const titleHint = String(raw.titleHint ?? raw.title ?? raw.recipeHint ?? "").trim();
    if (!titleHint) throw new Error(`${segmentId} titleHint가 비었습니다.`);
    const candidate = resolveSegmentCandidate({
      rawCandidateId,
      titleHint,
      segmentId,
      candidatesById,
      candidates,
      warnings: remapWarnings,
    });
    if (!candidate) throw new Error(`${segmentId} candidateId(${rawCandidateId})는 recipeCandidates에 없습니다.`);
    const candidateId = candidate.candidateId;
    const bundleParent = candidate.bundleParentId ? candidatesById.get(candidate.bundleParentId) : null;

    const startSec = parseTimeSec(raw.startSec ?? raw.start ?? raw.start_time);
    const endSecRaw = parseTimeSec(raw.endSec ?? raw.end ?? raw.end_time);
    if (startSec === null || endSecRaw === null) {
      throw new Error(`${segmentId} startSec/endSec는 숫자여야 합니다.`);
    }
    if (startSec < 0 || endSecRaw < 0) throw new Error(`${segmentId} startSec/endSec는 음수일 수 없습니다.`);
    const endSec = maxFrameSec > 0 && endSecRaw > maxFrameSec ? maxFrameSec : endSecRaw;
    if (startSec >= endSec) throw new Error(`${segmentId} startSec는 endSec보다 작아야 합니다.`);

    const minimumFrameBudget = minimumFrameBudgetForSegment(candidate, rawSegments.length);
    const frameBudget = Math.min(
      Math.max(positiveInt(raw.frameBudget, DEFAULT_SEGMENT_MIN_FRAMES), minimumFrameBudget),
      perSegmentMaxFrames,
    );
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
      bundleParentId: raw.bundleParentId ?? candidate.bundleParentId ?? null,
      bundleParentTitle: raw.bundleParentTitle ?? bundleParent?.titleHint ?? null,
      bundleSourceText: raw.bundleSourceText ?? candidate.bundleSourceText ?? bundleParent?.bundleSourceText ?? bundleParent?.bundleText ?? null,
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
      ...segmentShapeWarnings,
      ...remapWarnings,
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
  return sourceName === "description" || sourceName === "author_comment";
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

function evidencePacketMatchKeys(packet) {
  return [packet?.titleHint, ...(Array.isArray(packet?.aliases) ? packet.aliases : [])]
    .flatMap((value) => [value, ...splitLooseBundleText(value)])
    .map((value) => keyOf(stripCandidateText(value)))
    .filter((value) => value.length >= 2);
}

function evidencePacketStrongMatchKeys(packet) {
  return [packet?.titleHint, ...(Array.isArray(packet?.aliases) ? packet.aliases : [])]
    .map(compact)
    .filter((value) => value && !CANDIDATE_SEPARATOR_RE.test(value))
    .map((value) => keyOf(stripCandidateText(value)))
    .filter((value) => value.length >= 2);
}

function evidencePacketHasBundledAlias(packet) {
  return [packet?.titleHint, ...(Array.isArray(packet?.aliases) ? packet.aliases : [])]
    .map(compact)
    .some((value) => value && CANDIDATE_SEPARATOR_RE.test(value));
}

function candidateSpecificEvidenceKeys(candidate) {
  return [
    candidate?.titleHint,
    ...(Array.isArray(candidate?.sourceEvidence)
      ? candidate.sourceEvidence
        .filter((entry) => entry?.source === "recipe_candidate_hints")
        .map((entry) => entry?.text)
      : []),
  ]
    .flatMap((value) => [value, ...String(value ?? "").split(/\s+/u)])
    .map((value) => keyOf(stripCandidateText(value)))
    .filter((value) => value.length >= 2);
}

function evidenceCueMatchKeys(cue) {
  return [
    cue?.text,
    cue?.normalizedText,
  ]
    .map((value) => keyOf(value))
    .filter((value) => value.length >= 2);
}

function evidencePacketHasCandidateSpecificCue(evidencePacket, candidate) {
  const candidateKeys = candidateSpecificEvidenceKeys(candidate);
  if (candidateKeys.length === 0) return false;
  const cues = [
    ...(Array.isArray(evidencePacket?.ingredientCues) ? evidencePacket.ingredientCues : []),
    ...(Array.isArray(evidencePacket?.stepCues) ? evidencePacket.stepCues : []),
  ];
  return cues.some((cue) => evidenceCueMatchKeys(cue).some((cueKey) => (
    candidateKeys.some((candidateKey) => (
      candidateKey.includes(cueKey)
      || cueKey.includes(candidateKey)
    ))
  )));
}

function candidateEvidenceMatchKeys(candidate, segments) {
  const values = [
    candidate?.titleHint,
    candidate?.bundleText,
    candidate?.bundleSourceText,
    ...(Array.isArray(candidate?.sourceEvidence) ? candidate.sourceEvidence.map((entry) => entry?.text) : []),
    ...(segments ?? []).map((segment) => segment?.titleHint),
    ...(segments ?? []).flatMap((segment) => Array.isArray(segment?.textEvidence) ? segment.textEvidence : []),
  ];
  return values
    .flatMap((value) => [value, ...splitLooseBundleText(value)])
    .map((value) => keyOf(stripCandidateText(value)))
    .filter((value) => value.length >= 2);
}

function keyPairMatchScore(leftKey, rightKey, exactScore, containsScore) {
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return exactScore;
  if (leftKey.length >= 4 && rightKey.includes(leftKey)) return containsScore;
  if (rightKey.length >= 4 && leftKey.includes(rightKey)) return containsScore;
  return 0;
}

function evidencePacketCandidateMatchScore(packet, candidate, segments) {
  const candidateKeys = candidateEvidenceMatchKeys(candidate, segments);
  const candidateSpecificKeys = candidateSpecificEvidenceKeys(candidate);
  const packetKeys = evidencePacketMatchKeys(packet);
  const packetStrongKeys = evidencePacketStrongMatchKeys(packet);
  let score = 0;

  for (const packetKey of packetStrongKeys) {
    for (const candidateKey of candidateSpecificKeys) {
      score = Math.max(score, keyPairMatchScore(packetKey, candidateKey, 100, 90));
    }
  }
  for (const packetKey of packetStrongKeys) {
    for (const candidateKey of candidateKeys) {
      score = Math.max(score, keyPairMatchScore(packetKey, candidateKey, 80, 70));
    }
  }
  for (const packetKey of packetKeys) {
    for (const candidateKey of candidateKeys) {
      score = Math.max(score, keyPairMatchScore(packetKey, candidateKey, 30, 20));
    }
  }

  return score;
}

function evidencePacketByCandidateId(evidencePacketBundle, candidates, segmentPlan) {
  const packets = Array.isArray(evidencePacketBundle?.packets) ? evidencePacketBundle.packets : [];
  if (!packets.length) return new Map();
  const byCandidateId = new Map();
  for (const candidate of candidates) {
    const segments = segmentsForCandidate(segmentPlan, candidate.candidateId);
    let bestPacket = null;
    let bestScore = 0;
    for (const packet of packets) {
      const score = evidencePacketCandidateMatchScore(packet, candidate, segments);
      if (score > bestScore) {
        bestPacket = packet;
        bestScore = score;
      }
    }
    if (bestPacket) byCandidateId.set(candidate.candidateId, bestPacket);
  }
  return byCandidateId;
}

function evidenceCueTimestamp(cue) {
  const ref = (Array.isArray(cue?.refs) ? cue.refs : []).find((entry) => Number.isFinite(entry?.startMs));
  return ref ? formatMsTimestamp(ref.startMs) : null;
}

function evidenceCueSource(cue) {
  const ref = Array.isArray(cue?.refs) ? cue.refs[0] : null;
  return ref?.source ? `evidence_packet:${ref.source}` : "evidence_packet";
}

function evidenceCueText(kind, cue) {
  const text = clippedCompact(cue?.text);
  if (!text) return null;
  const timestamp = evidenceCueTimestamp(cue);
  const prefix = timestamp ? `[${timestamp}] ` : "";
  return `${prefix}${kind}/source: ${text}`;
}

function evidenceCueCandidatePriority(cue, candidate, kind = "ingredient") {
  const cueText = compact(cue?.text);
  const cueKey = keyOf(cueText);
  let priority = 0;
  if (!cueKey) return priority;

  for (const candidateKey of candidateSpecificEvidenceKeys(candidate)) {
    if (candidateKey.includes(cueKey) || cueKey.includes(candidateKey)) {
      priority += 100;
      break;
    }
  }

  if (kind === "ingredient" && EVIDENCE_CUE_CORE_SEASONING_RE.test(cueText)) priority += 45;
  if (kind === "ingredient" && EVIDENCE_CUE_GENERIC_LOW_PRIORITY_RE.test(cueText)) priority -= 35;
  return priority;
}

function evidenceCueTimestampMs(cue) {
  const ref = (Array.isArray(cue?.refs) ? cue.refs : []).find((entry) => Number.isFinite(entry?.startMs));
  return Number.isFinite(ref?.startMs) ? ref.startMs : Number.POSITIVE_INFINITY;
}

function sortEvidenceCuesForLocalBridge(cues, candidate, kind = "ingredient") {
  return [...(Array.isArray(cues) ? cues : [])].sort((left, right) => {
    const priorityDelta = evidenceCueCandidatePriority(left, candidate, kind) - evidenceCueCandidatePriority(right, candidate, kind);
    if (priorityDelta !== 0) return priorityDelta;
    return evidenceCueTimestampMs(left) - evidenceCueTimestampMs(right);
  });
}

function pushPriorityUniqueLimited(list, value, limit, keyFn = (entry) => entry) {
  const key = keyFn(value);
  const existingIndex = list.findIndex((entry) => keyFn(entry) === key);
  if (existingIndex >= 0) {
    const [existing] = list.splice(existingIndex, 1);
    list.unshift(existing);
    return false;
  }
  list.unshift(value);
  while (list.length > limit) list.pop();
  return true;
}

function appendEvidencePacketCues(packet, evidencePacket, { candidate = null } = {}) {
  if (!evidencePacket) return { packet, applied: false, skipped: false };
  if (evidencePacketHasBundledAlias(evidencePacket) && !evidencePacketHasCandidateSpecificCue(evidencePacket, candidate)) {
    packet.evidencePacketBridge = {
      version: EVIDENCE_PACKET_SOURCE_CUE_BRIDGE_VERSION,
      sourceCandidateId: evidencePacket.candidateId ?? null,
      titleHint: evidencePacket.titleHint ?? null,
      skipped: true,
      reason: "no_candidate_specific_cue",
    };
    return { packet, applied: false, skipped: true };
  }
  for (const cue of sortEvidenceCuesForLocalBridge(evidencePacket.ingredientCues, candidate, "ingredient")) {
    const text = evidenceCueText("ingredient", cue);
    if (!text) continue;
    pushPriorityUniqueLimited(packet.localSourceSnippets, { source: evidenceCueSource(cue), text }, SOURCE_CUE_LOCAL_SNIPPET_LIMIT, (entry) => `${entry.source}:${entry.text}`);
  }
  for (const cue of evidencePacket.amountCues ?? []) {
    if (cue?.kind && cue.kind !== "amount") continue;
    const text = evidenceCueText("amount", cue);
    if (!text) continue;
    pushPriorityUniqueLimited(packet.localSourceSnippets, { source: evidenceCueSource(cue), text }, SOURCE_CUE_LOCAL_SNIPPET_LIMIT, (entry) => `${entry.source}:${entry.text}`);
  }
  for (const cue of evidencePacket.stepCues ?? []) {
    const text = evidenceCueText("step", cue);
    if (!text) continue;
    pushPriorityUniqueLimited(packet.cookingCueSnippets, { source: evidenceCueSource(cue), text }, SOURCE_CUE_COOKING_SNIPPET_LIMIT, (entry) => `${entry.source}:${entry.text}`);
  }
  packet.evidencePacketBridge = {
    version: EVIDENCE_PACKET_SOURCE_CUE_BRIDGE_VERSION,
    sourceCandidateId: evidencePacket.candidateId ?? null,
    titleHint: evidencePacket.titleHint ?? null,
    skipped: false,
  };
  return { packet, applied: true, skipped: false };
}

export function buildSourceCuePacketsFromSourceText(sourceText, candidatePlan, segmentPlan, { evidencePacketBundle = null } = {}) {
  const candidates = Array.isArray(candidatePlan?.recipeCandidates) ? candidatePlan.recipeCandidates : [];
  const blocks = sourceBlocks(sourceText);
  const aliasesByCandidate = new Map();
  const evidencePacketsByCandidate = evidencePacketByCandidateId(evidencePacketBundle, candidates, segmentPlan);
  const packets = [];
  let evidencePacketBridgeCount = 0;
  let evidencePacketBridgeSkippedCount = 0;

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
      const blockAliases = block.name === "recipe_candidate_hints"
        ? candidateSpecificEvidenceKeys(candidate)
        : aliases;
      for (const rawLine of block.lines) {
        const line = compact(rawLine);
        if (!line) {
          localWindow = 0;
          continue;
        }
        if (isSourceCueNoise(block.name, line)) continue;

        const matched = lineMatchesAlias(line, blockAliases);
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

    const bridgeResult = appendEvidencePacketCues(packet, evidencePacketsByCandidate.get(candidate.candidateId), { candidate });
    if (bridgeResult.applied) evidencePacketBridgeCount += 1;
    if (bridgeResult.skipped) evidencePacketBridgeSkippedCount += 1;
    packets.push(trimCuePacketBudget(packet));
  }

  return {
    version: SOURCE_CUE_PACKET_VERSION,
    ...(evidencePacketsByCandidate.size ? {
      evidencePacketSourceCueBridgeVersion: EVIDENCE_PACKET_SOURCE_CUE_BRIDGE_VERSION,
      evidencePacketBridgeMatchedCount: evidencePacketsByCandidate.size,
      evidencePacketBridgeCount,
      evidencePacketBridgeSkippedCount,
    } : {}),
    packets,
  };
}

function clippedLedgerText(value, maxChars = RECIPE_LEDGER_SOURCE_TEXT_MAX_CHARS) {
  const text = compact(value);
  return text.length > maxChars ? text.slice(0, maxChars).trimEnd() : text;
}

function sourceKindFromName(sourceName) {
  const source = String(sourceName ?? "").trim();
  if (source === "description" || source === "description_timeline") return "description";
  if (source === "recipe_candidate_hints") return "recipe_candidate_hints";
  if (source === "author_comment") return "author_comment";
  if (source.startsWith("transcript")) return "caption";
  if (source === "segment_text_evidence") return "segment_text_evidence";
  if (source === "selected_frame") return "selected_frame";
  return source || "source";
}

function recipeLedgerKindForText(text, fallback = "identity") {
  const value = compact(text);
  if (RECIPE_LEDGER_AMOUNT_RE.test(value)) return "ingredient_or_amount";
  if (SOURCE_CUE_COOKING_RE.test(value)) return "cooking_action";
  if (TIMESTAMP_RE.test(value)) return "timeline";
  return fallback;
}

function isNegatedCookingText(text) {
  return /(볶|튀기|굽|끓이|삶|졸이|무치|섞|넣|부치|익히)\s*지\s*(?:않|말)|(?:볶|튀기|굽|끓이|삶|졸이|무치|섞|넣|부치|익히)(?:는\s*)?것(?:은|을)?\s*(?:아니|말)/u.test(compact(text));
}

function sourceCuePriority(item) {
  if (isNegatedCookingText(item?.text)) return 0;
  if (item?.sourceKind === "recipe_candidate_hints") return 1;
  if (item?.sourceKind === "caption") return 2;
  if (item?.sourceKind === "segment_text_evidence") return 3;
  return 4;
}

function isRecipeLedgerNoise(sourceName, line) {
  const text = compact(line);
  if (!text) return true;
  return isSourceCueNoise(sourceName, text);
}

export function isLedgerTextAllowedSubstring(text, allowedTexts) {
  const needle = compact(text);
  if (!needle) return false;
  return allowedTexts.some((allowed) => compact(allowed).includes(needle));
}

function recipeLedgerSourceLineEntries(sourceText) {
  return sourceBlocks(sourceText).flatMap((block, blockIndex) => block.lines.map((line, lineIndex) => ({
    source: block.name,
    sourceKind: sourceKindFromName(block.name),
    blockIndex,
    lineIndex,
    text: line,
  })));
}

function timestampFromLedgerLine(line) {
  const match = String(line ?? "").match(TIMESTAMP_RE);
  return match ? parseTimeSec(match[1]) : null;
}

function lineTimeWithinSegment(line, segment) {
  const timestampSec = timestampFromLedgerLine(line);
  if (!Number.isFinite(timestampSec)) return false;
  return timestampSec >= segment.startSec && timestampSec <= segment.endSec;
}

function buildLedgerLineage(item) {
  if (item.sourceKind === "selected_frame") {
    return `${item.frameFile ?? "selected_frame"}@${item.timestampSec ?? "?"}s`;
  }
  if (item.sourceKind === "segment_text_evidence") {
    return `${item.sourceKind}#${item.segmentId}:${item.lineIndex ?? "?"}`;
  }
  if (Number.isInteger(item.blockIndex) && Number.isInteger(item.lineIndex)) {
    return `${item.sourceKind}#${item.blockIndex}:${item.lineIndex}`;
  }
  if (Number.isInteger(item.evidenceIndex)) {
    return `${item.sourceKind}#${item.evidenceIndex}`;
  }
  return `${item.sourceKind}${item.segmentId ? `#${item.segmentId}` : ""}`;
}

function pushRecipeLedgerEvidenceItem(recipe, state, item, allowedText) {
  const text = clippedLedgerText(item.text);
  if (!text || isRecipeLedgerNoise(item.sourceKind, text)) {
    state.droppedCueCount += 1;
    return;
  }
  if (!isLedgerTextAllowedSubstring(text, [allowedText])) {
    state.droppedCueCount += 1;
    recipe.warnings.push(`dropped non-substring cue from ${item.sourceKind}`);
    return;
  }
  const normalizedItem = {
    ...item,
    text,
    lineage: buildLedgerLineage(item),
  };
  const key = [
    normalizedItem.basis,
    normalizedItem.sourceKind,
    normalizedItem.segmentId ?? "",
    normalizedItem.frameFile ?? "",
    normalizedItem.text,
  ].join("\u0000");
  if (recipe._seenEvidence.has(key)) {
    state.droppedCueCount += 1;
    return;
  }
  if (recipe.evidenceItems.length >= RECIPE_LEDGER_EVIDENCE_ITEM_LIMIT) {
    state.droppedCueCount += 1;
    return;
  }
  recipe._seenEvidence.add(key);
  recipe.evidenceItems.push(normalizedItem);
}

function promptCueText(value) {
  return clippedLedgerText(value, RECIPE_LEDGER_PROMPT_TEXT_MAX_CHARS);
}

function promptCueLineLength(cue) {
  return `[${cue.kind}/${cue.basis}/${cue.lineage}] ${cue.text}`.length + 4;
}

function addPromptCue(recipe, cue, state, perRecipeState) {
  const text = promptCueText(cue.text);
  if (!text) return false;
  const normalizedCue = { ...cue, text };
  const lineLength = promptCueLineLength(normalizedCue);
  if (perRecipeState.charCount + lineLength > RECIPE_LEDGER_PROMPT_RECIPE_BUDGET_CHARS) {
    state.droppedCueCount += 1;
    state.truncatedByBudget = true;
    return false;
  }
  if (state.promptTextChars + lineLength > RECIPE_LEDGER_PROMPT_TOTAL_BUDGET_CHARS) {
    state.droppedCueCount += 1;
    state.truncatedByBudget = true;
    return false;
  }
  recipe.promptCues.push(normalizedCue);
  perRecipeState.charCount += lineLength;
  state.promptTextChars += lineLength;
  return true;
}

function buildPromptCuesForRecipe(recipe, state) {
  const perRecipeState = { charCount: 0 };
  const sourceItems = recipe.evidenceItems
    .filter((item) => item.basis === "source" && ["ingredient_or_amount", "cooking_action"].includes(item.kind))
    .sort((a, b) => sourceCuePriority(a) - sourceCuePriority(b));
  const selectorItems = recipe.evidenceItems
    .filter((item) => item.basis === "selector_inference" && item.kind === "visual_context");

  let sourceCount = 0;
  for (const item of sourceItems) {
    if (sourceCount >= RECIPE_LEDGER_PROMPT_SOURCE_LIMIT) break;
    if (addPromptCue(recipe, {
      kind: item.kind,
      basis: item.basis,
      sourceKind: item.sourceKind,
      text: item.text,
      lineage: item.lineage,
    }, state, perRecipeState)) {
      sourceCount += 1;
    }
  }

  if (sourceCount < RECIPE_LEDGER_PROMPT_SOURCE_LIMIT) {
    let selectorCount = 0;
    for (const item of selectorItems) {
      if (selectorCount >= RECIPE_LEDGER_PROMPT_SELECTOR_LIMIT) break;
      if (addPromptCue(recipe, {
        kind: item.kind,
        basis: item.basis,
        sourceKind: item.sourceKind,
        text: item.text,
        lineage: item.lineage,
      }, state, perRecipeState)) {
        selectorCount += 1;
      }
    }
  }
}

function cleanLedgerRecipe(recipe) {
  const cleaned = { ...recipe };
  delete cleaned._seenEvidence;
  return cleaned;
}

export function summarizeRecipeEvidenceLedger(ledger) {
  const evidenceItems = (ledger.recipes ?? []).flatMap((recipe) => recipe.evidenceItems ?? []);
  const promptCues = (ledger.recipes ?? []).flatMap((recipe) => recipe.promptCues ?? []);
  const cueCountByBasis = evidenceItems.reduce((acc, item) => {
    const basis = item.basis ?? "unknown";
    acc[basis] = (acc[basis] ?? 0) + 1;
    return acc;
  }, {});
  return {
    recipeEvidenceLedgerRecipeCount: ledger.recipes?.length ?? 0,
    ledgerTextChars: evidenceItems.reduce((sum, item) => sum + String(item.text ?? "").length, 0),
    promptLedgerTextChars: promptCues.reduce((sum, item) => sum + String(item.text ?? "").length, 0),
    cueCountByBasis,
    droppedCueCount: ledger.stats?.droppedCueCount ?? 0,
    truncatedByBudget: Boolean(ledger.stats?.truncatedByBudget),
  };
}

export function buildRecipeEvidenceLedger({ sourceText = "", candidatePlan, segmentPlan, segmentKeyframes, generatedFrom = {} }) {
  const coverageByCandidate = new Map((segmentPlan?.coverage ?? []).map((entry) => [entry.candidateId, entry]));
  const segmentsById = new Map((segmentPlan?.segments ?? []).map((segment) => [segment.segmentId, segment]));
  const keyframeSegmentsById = new Map((segmentKeyframes?.segments ?? []).map((segment) => [segment.segmentId, segment]));
  const captionLines = recipeLedgerSourceLineEntries(sourceText)
    .filter((entry) => entry.sourceKind === "caption");
  const state = {
    droppedCueCount: 0,
    truncatedByBudget: false,
    promptTextChars: 0,
  };
  const recipes = [];

  for (const candidate of Array.isArray(candidatePlan?.recipeCandidates) ? candidatePlan.recipeCandidates : []) {
    const coverage = coverageByCandidate.get(candidate.candidateId);
    const outputRole = coverage?.outputRole ?? candidate.outputRole ?? outputRoleForCandidate(candidate);
    if (outputRole !== "recipe" || coverage?.status !== "covered") continue;

    const segmentIds = Array.isArray(coverage.segmentIds) ? coverage.segmentIds : [];
    const segments = segmentIds.map((segmentId) => segmentsById.get(segmentId)).filter(Boolean);
    const keyframeSegments = segmentIds.map((segmentId) => keyframeSegmentsById.get(segmentId)).filter(Boolean);
    const timeValues = segments.flatMap((segment) => [segment.startSec, segment.endSec]).filter(Number.isFinite);
    const recipe = {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      outputRole,
      segmentIds,
      timeRangeSec: timeValues.length
        ? { start: Math.min(...timeValues), end: Math.max(...timeValues) }
        : null,
      evidenceItems: [],
      promptCues: [],
      warnings: [],
      _seenEvidence: new Set(),
    };

    for (const [index, evidence] of (Array.isArray(candidate.sourceEvidence) ? candidate.sourceEvidence : []).entries()) {
      const source = String(evidence?.source ?? "source").trim() || "source";
      const text = evidence?.text ?? "";
      pushRecipeLedgerEvidenceItem(recipe, state, {
        kind: recipeLedgerKindForText(text),
        basis: "source",
        sourceKind: sourceKindFromName(source),
        source,
        text,
        evidenceIndex: index,
        timeHintSec: Number.isFinite(evidence?.timeHintSec) ? evidence.timeHintSec : null,
        segmentId: segmentIds[0] ?? null,
      }, text);
    }

    for (const segment of segments) {
      for (const [index, textEvidence] of (Array.isArray(segment.textEvidence) ? segment.textEvidence : []).entries()) {
        pushRecipeLedgerEvidenceItem(recipe, state, {
          kind: recipeLedgerKindForText(textEvidence),
          basis: "source",
          sourceKind: "segment_text_evidence",
          source: "segment_text_evidence",
          text: textEvidence,
          lineIndex: index,
          segmentId: segment.segmentId,
        }, textEvidence);
      }

      for (const entry of captionLines) {
        if (!lineTimeWithinSegment(entry.text, segment)) continue;
        const kind = recipeLedgerKindForText(entry.text);
        if (kind === "identity" || kind === "timeline") {
          state.droppedCueCount += 1;
          continue;
        }
        pushRecipeLedgerEvidenceItem(recipe, state, {
          kind,
          basis: "source",
          sourceKind: entry.sourceKind,
          source: entry.source,
          text: entry.text,
          blockIndex: entry.blockIndex,
          lineIndex: entry.lineIndex,
          timestampSec: timestampFromLedgerLine(entry.text),
          segmentId: segment.segmentId,
        }, entry.text);
      }
    }

    for (const segment of keyframeSegments) {
      for (const selectedFrame of Array.isArray(segment.selectedFrames) ? segment.selectedFrames : []) {
        if (!selectedFrame?.selectionReason) continue;
        pushRecipeLedgerEvidenceItem(recipe, state, {
          kind: "visual_context",
          basis: "selector_inference",
          sourceKind: "selected_frame",
          source: "selected_frame",
          text: selectedFrame.selectionReason,
          frameFile: selectedFrame.file,
          timestampSec: Number.isFinite(selectedFrame.timestamp_sec) ? selectedFrame.timestamp_sec : frameTimestampSec(selectedFrame),
          segmentId: segment.segmentId,
        }, selectedFrame.selectionReason);
      }
    }

    buildPromptCuesForRecipe(recipe, state);
    recipes.push(cleanLedgerRecipe(recipe));
  }

  const ledger = {
    version: RECIPE_EVIDENCE_LEDGER_VERSION,
    generatedFrom,
    recipes,
    warnings: [],
    stats: {
      droppedCueCount: state.droppedCueCount,
      truncatedByBudget: state.truncatedByBudget,
      promptTextChars: state.promptTextChars,
    },
  };
  ledger.stats = {
    ...ledger.stats,
    ...summarizeRecipeEvidenceLedger(ledger),
  };
  return ledger;
}

function formatRecipeEvidenceLedgerPrompt(ledger) {
  const blocks = (ledger?.recipes ?? [])
    .filter((recipe) => Array.isArray(recipe.promptCues) && recipe.promptCues.length > 0)
    .map((recipe) => [
      `- candidateId: ${recipe.candidateId} / titleHint: ${recipe.titleHint} / segments: ${recipe.segmentIds.length ? recipe.segmentIds.join(", ") : "(없음)"}`,
      "  promptCues:",
      ...recipe.promptCues.map((cue) => `  - [${cue.kind}/${cue.basis}/${cue.lineage}] ${cue.text}`),
    ].join("\n"));
  if (!blocks.length) return null;
  return [
    "Recipe evidence ledger:",
    "이 ledger는 정답이 아니라 체크리스트다. basis=source cue를 basis=selector_inference보다 우선하고, ledger에 없는 내용을 요리 상식으로 추가하지 않는다.",
    "source text가 애매하거나 자동자막이 깨졌으면 확정 재료로 단정하지 않는다. visual-only 수량 추정은 계속 amountBasis: \"visual-estimate\"를 사용한다.",
    ...blocks,
  ].join("\n");
}

function visualLedgerText(value, maxChars = VISUAL_FRAME_LEDGER_TEXT_MAX_CHARS) {
  return clippedLedgerText(value, maxChars);
}

function visualLedgerStringList(value, maxItems = 6) {
  if (Array.isArray(value)) {
    return value.map((item) => visualLedgerText(item)).filter(Boolean).slice(0, maxItems);
  }
  const text = visualLedgerText(value);
  return text ? [text] : [];
}

function visualLedgerAllowedFrameSet(finalInputSegmentKeyframes) {
  const allowed = new Set();
  for (const segment of finalInputSegmentKeyframes?.segments ?? []) {
    for (const frame of segment.selectedFrames ?? []) {
      if (!frame?.file) continue;
      allowed.add(`${segment.segmentId}\u0000${frame.file}`);
      allowed.add(`\u0000${frame.file}`);
    }
  }
  return allowed;
}

function visualLedgerCandidateIndex(finalInputSegmentKeyframes) {
  const byCandidate = new Map();
  for (const segment of finalInputSegmentKeyframes?.segments ?? []) {
    const current = byCandidate.get(segment.candidateId) ?? {
      candidateId: segment.candidateId,
      titleHint: segment.titleHint,
      segmentIds: [],
      frameFiles: new Set(),
    };
    current.segmentIds.push(segment.segmentId);
    for (const frame of segment.selectedFrames ?? []) {
      if (frame?.file) current.frameFiles.add(frame.file);
    }
    byCandidate.set(segment.candidateId, current);
  }
  return byCandidate;
}

function visualLedgerFrameFiles(value, allowedFiles, maxItems = 8) {
  const rawValues = Array.isArray(value) ? value : [value];
  const files = [];
  const seen = new Set();
  for (const rawValue of rawValues) {
    const file = path.basename(String(rawValue ?? "").trim());
    if (!file || seen.has(file)) continue;
    if (allowedFiles?.size && !allowedFiles.has(file)) continue;
    seen.add(file);
    files.push(file);
    if (files.length >= maxItems) break;
  }
  return files;
}

function normalizeVisualLedgerRecipes(rawLedger, finalInputSegmentKeyframes) {
  const candidateIndex = visualLedgerCandidateIndex(finalInputSegmentKeyframes);
  const rawRecipes = Array.isArray(rawLedger?.recipes)
    ? rawLedger.recipes
    : (Array.isArray(rawLedger?.recipeObservations) ? rawLedger.recipeObservations : []);
  const recipes = [];
  const seen = new Set();
  for (const rawRecipe of rawRecipes) {
    if (!isObject(rawRecipe)) continue;
    const candidateId = compact(rawRecipe.candidateId ?? "");
    if (!candidateId || !candidateIndex.has(candidateId) || seen.has(candidateId)) continue;
    const candidate = candidateIndex.get(candidateId);
    seen.add(candidateId);
    recipes.push({
      candidateId,
      titleHint: visualLedgerText(rawRecipe.titleHint ?? rawRecipe.recipeTitle ?? candidate.titleHint),
      segmentIds: Array.isArray(rawRecipe.segmentIds)
        ? rawRecipe.segmentIds.map((segmentId) => compact(segmentId)).filter(Boolean)
        : candidate.segmentIds,
      observedIngredients: visualLedgerStringList(rawRecipe.observedIngredients ?? rawRecipe.visibleIngredients ?? rawRecipe.ingredients, 12),
      cookingTransitions: visualLedgerStringList(rawRecipe.cookingTransitions ?? rawRecipe.stepTransitions ?? rawRecipe.steps, 10),
      sauceBrothSeasoningCues: visualLedgerStringList(rawRecipe.sauceBrothSeasoningCues ?? rawRecipe.seasoningCues ?? rawRecipe.sauceCues, 10),
      keyFrameFiles: visualLedgerFrameFiles(rawRecipe.keyFrameFiles ?? rawRecipe.frameFiles ?? rawRecipe.frames, candidate.frameFiles, 10),
      uncertainties: visualLedgerStringList(rawRecipe.uncertainties ?? rawRecipe.uncertainty, 10),
    });
  }
  return recipes;
}

function normalizeVisualFrameLedger(rawLedger, finalInputSegmentKeyframes) {
  const recipes = normalizeVisualLedgerRecipes(rawLedger, finalInputSegmentKeyframes);
  const rawFrames = Array.isArray(rawLedger?.frames)
    ? rawLedger.frames
    : (Array.isArray(rawLedger?.observations) ? rawLedger.observations : []);
  const allowedFrames = visualLedgerAllowedFrameSet(finalInputSegmentKeyframes);
  const frames = [];
  const seen = new Set();

  for (const rawFrame of rawFrames) {
    if (!isObject(rawFrame)) continue;
    const frameFile = path.basename(String(rawFrame.frameFile ?? rawFrame.file ?? rawFrame.filename ?? ""));
    if (!frameFile) continue;
    const segmentId = compact(rawFrame.segmentId ?? rawFrame.segment ?? "");
    const allowedKey = `${segmentId}\u0000${frameFile}`;
    const fallbackAllowedKey = `\u0000${frameFile}`;
    if (!allowedFrames.has(allowedKey) && !allowedFrames.has(fallbackAllowedKey)) continue;
    const key = allowedKey;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push({
      segmentId,
      candidateId: compact(rawFrame.candidateId ?? ""),
      titleHint: visualLedgerText(rawFrame.titleHint ?? rawFrame.recipeTitle ?? ""),
      frameFile,
      timestamp: visualLedgerText(rawFrame.timestamp ?? rawFrame.timestampSec ?? rawFrame.time ?? ""),
      visibleIngredients: visualLedgerStringList(rawFrame.visibleIngredients ?? rawFrame.ingredients),
      cookingState: visualLedgerText(rawFrame.cookingState ?? rawFrame.state ?? rawFrame.scene),
      sauceBrothSeasoningCues: visualLedgerStringList(rawFrame.sauceBrothSeasoningCues ?? rawFrame.seasoningCues ?? rawFrame.sauceCues),
      uncertainties: visualLedgerStringList(rawFrame.uncertainties ?? rawFrame.uncertainty),
    });
  }

  return {
    version: VISUAL_FRAME_LEDGER_VERSION,
    recipes,
    frames,
    warnings: visualLedgerStringList(rawLedger?.warnings, 12),
    stats: {
      recipeCount: recipes.length,
      frameCount: frames.length,
      observedIngredientCueCount: recipes.reduce((sum, recipe) => sum + recipe.observedIngredients.length, 0),
      cookingTransitionCueCount: recipes.reduce((sum, recipe) => sum + recipe.cookingTransitions.length, 0),
      recipeSauceBrothSeasoningCueCount: recipes.reduce((sum, recipe) => sum + recipe.sauceBrothSeasoningCues.length, 0),
      visibleIngredientCueCount: frames.reduce((sum, frame) => sum + frame.visibleIngredients.length, 0),
      sauceBrothSeasoningCueCount: frames.reduce((sum, frame) => sum + frame.sauceBrothSeasoningCues.length, 0),
      uncertaintyCount: frames.reduce((sum, frame) => sum + frame.uncertainties.length, 0)
        + recipes.reduce((sum, recipe) => sum + recipe.uncertainties.length, 0),
    },
  };
}

function summarizeVisualFrameLedger(ledger) {
  return {
    ...(ledger?.rawRecovered ? {
      visualFrameLedgerRawRecovered: true,
      visualFrameLedgerRawRecoveryVersion: ledger.rawRecoveryVersion ?? VISUAL_FRAME_LEDGER_RAW_RECOVERY_VERSION,
    } : { visualFrameLedgerRawRecovered: false }),
    visualFrameLedgerBatchMode: Boolean(ledger?.batchMode),
    ...(ledger?.batchMode ? {
      visualFrameLedgerBatchSize: ledger.batchSize ?? null,
      visualFrameLedgerBatchCount: ledger.batchCount ?? 0,
      visualFrameLedgerBatchContextVersion: ledger.batchContextVersion ?? VISUAL_FRAME_LEDGER_BATCH_CONTEXT_VERSION,
    } : {}),
    visualFrameLedgerRecipeCount: ledger?.stats?.recipeCount ?? 0,
    visualFrameLedgerFrameCount: ledger?.stats?.frameCount ?? 0,
    visualFrameLedgerObservedIngredientCueCount: ledger?.stats?.observedIngredientCueCount ?? 0,
    visualFrameLedgerCookingTransitionCueCount: ledger?.stats?.cookingTransitionCueCount ?? 0,
    visualFrameLedgerRecipeSauceBrothSeasoningCueCount: ledger?.stats?.recipeSauceBrothSeasoningCueCount ?? 0,
    visualFrameLedgerVisibleIngredientCueCount: ledger?.stats?.visibleIngredientCueCount ?? 0,
    visualFrameLedgerSauceBrothSeasoningCueCount: ledger?.stats?.sauceBrothSeasoningCueCount ?? 0,
    visualFrameLedgerUncertaintyCount: ledger?.stats?.uncertaintyCount ?? 0,
    ...(ledger?.fallbackVersion ? { visualFrameLedgerFallbackVersion: ledger.fallbackVersion } : {}),
    ...(ledger?.callTimeoutMs ? { visualFrameLedgerCallTimeoutMs: ledger.callTimeoutMs } : {}),
    ...(ledger?.partialFailureCount ? { visualFrameLedgerPartialFailureCount: ledger.partialFailureCount } : {}),
    ...(ledger?.skippedBatchCount ? { visualFrameLedgerSkippedBatchCount: ledger.skippedBatchCount } : {}),
  };
}

function visualFrameLedgerTimeoutMs(timeoutMs) {
  return Math.min(positiveInt(timeoutMs, DEFAULT_TIMEOUT_MS), VISUAL_FRAME_LEDGER_TIMEOUT_CAP_MS);
}

function emptyVisualFrameLedger(finalInputSegmentKeyframes, warning, extra = {}) {
  const ledger = normalizeVisualFrameLedger({
    recipes: [],
    frames: [],
    warnings: warning ? [warning] : [],
  }, finalInputSegmentKeyframes);
  return {
    ...ledger,
    fallbackVersion: VISUAL_FRAME_LEDGER_FALLBACK_VERSION,
    ...extra,
  };
}

async function writeVisualFrameLedgerFailureArtifact(filePath, failure) {
  await writeFile(
    filePath,
    JSON.stringify({
      version: VISUAL_FRAME_LEDGER_FALLBACK_VERSION,
      failedAt: new Date().toISOString(),
      ...failure,
    }, null, 2) + "\n",
    "utf8",
  );
}

async function readRecoveredVisualFrameLedger(rawPath, finalInputSegmentKeyframes) {
  if (!existsSync(rawPath)) return null;
  try {
    const raw = await readFile(rawPath, "utf8");
    const rawLedger = extractJsonFromTextWithClosureRepair(raw);
    if (!isObject(rawLedger) || !Array.isArray(rawLedger.recipes)) return null;
    const ledger = normalizeVisualFrameLedger(rawLedger, finalInputSegmentKeyframes);
    const expectedCandidateIds = new Set(
      (finalInputSegmentKeyframes?.segments ?? [])
        .filter((segment) => (segment.outputRole ?? "recipe") === "recipe")
        .map((segment) => segment.candidateId)
        .filter(Boolean),
    );
    if (expectedCandidateIds.size > 0 && ledger.recipes.length === 0) return null;
    return {
      ...ledger,
      rawRecovered: true,
      rawRecoveryVersion: VISUAL_FRAME_LEDGER_RAW_RECOVERY_VERSION,
    };
  } catch {
    return null;
  }
}

function appendUnique(target, values, limit = 20) {
  const seen = new Set(target);
  for (const value of values ?? []) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    target.push(text);
    if (target.length >= limit) break;
  }
  return target;
}

function selectedFramesForLedgerSegments(finalSelectedFrames, segments) {
  const wanted = new Set();
  for (const segment of segments ?? []) {
    for (const frame of segment.selectedFrames ?? []) {
      if (frame.path) wanted.add(frame.path);
      if (frame.file) wanted.add(path.basename(frame.file));
    }
  }
  return finalSelectedFrames.filter((frame) => wanted.has(frame.path) || wanted.has(path.basename(frame.path)));
}

function batchCandidateIds(segments) {
  return new Set((segments ?? []).map((segment) => compact(segment.candidateId ?? "")).filter(Boolean));
}

function filterSourceCuePacketPlanForCandidates(sourceCuePacketPlan, candidateIds) {
  if (!sourceCuePacketPlan || !candidateIds?.size) return sourceCuePacketPlan;
  return {
    ...sourceCuePacketPlan,
    packets: (sourceCuePacketPlan.packets ?? []).filter((packet) => candidateIds.has(packet.candidateId)),
  };
}

function filterRecipeEvidenceLedgerForCandidates(recipeEvidenceLedgerPlan, candidateIds) {
  if (!recipeEvidenceLedgerPlan || !candidateIds?.size) return recipeEvidenceLedgerPlan;
  return {
    ...recipeEvidenceLedgerPlan,
    recipes: (recipeEvidenceLedgerPlan.recipes ?? []).filter((recipe) => candidateIds.has(recipe.candidateId)),
  };
}

function buildVisualLedgerBatchSourceText(segments) {
  const lines = ["[SOURCE: visual_ledger_batch_context]"];
  for (const segment of segments ?? []) {
    lines.push(
      `segmentId=${segment.segmentId}`,
      `candidateId=${segment.candidateId}`,
      `titleHint=${segment.titleHint}`,
      `time=${segment.startSec}-${segment.endSec}`,
      `textEvidence=${Array.isArray(segment.textEvidence) && segment.textEvidence.length ? segment.textEvidence.join(" / ") : "(없음)"}`,
      "",
    );
  }
  return lines.join("\n").trim();
}

function mergeVisualFrameLedgers(ledgers, finalInputSegmentKeyframes, { batchSize = 0 } = {}) {
  const recipesByCandidate = new Map();
  const framesByKey = new Map();
  const warnings = [];
  let rawRecovered = false;
  let partialFailureCount = 0;
  let skippedBatchCount = 0;
  let fallbackVersion = null;
  let callTimeoutMs = null;

  for (const ledger of ledgers ?? []) {
    if (ledger?.rawRecovered) rawRecovered = true;
    if (ledger?.fallbackVersion) fallbackVersion = ledger.fallbackVersion;
    if (ledger?.callTimeoutMs) callTimeoutMs = ledger.callTimeoutMs;
    partialFailureCount += Number(ledger?.partialFailureCount ?? 0);
    skippedBatchCount += Number(ledger?.skippedBatchCount ?? 0);
    appendUnique(warnings, ledger?.warnings ?? [], 20);
    for (const recipe of ledger?.recipes ?? []) {
      const candidateId = compact(recipe.candidateId ?? "");
      if (!candidateId) continue;
      if (!recipesByCandidate.has(candidateId)) {
        recipesByCandidate.set(candidateId, {
          candidateId,
          titleHint: recipe.titleHint ?? "",
          segmentIds: [],
          observedIngredients: [],
          cookingTransitions: [],
          sauceBrothSeasoningCues: [],
          keyFrameFiles: [],
          uncertainties: [],
        });
      }
      const merged = recipesByCandidate.get(candidateId);
      if (!merged.titleHint && recipe.titleHint) merged.titleHint = recipe.titleHint;
      appendUnique(merged.segmentIds, recipe.segmentIds ?? [], 20);
      appendUnique(merged.observedIngredients, recipe.observedIngredients ?? [], 12);
      appendUnique(merged.cookingTransitions, recipe.cookingTransitions ?? [], 10);
      appendUnique(merged.sauceBrothSeasoningCues, recipe.sauceBrothSeasoningCues ?? [], 10);
      appendUnique(merged.keyFrameFiles, recipe.keyFrameFiles ?? [], 10);
      appendUnique(merged.uncertainties, recipe.uncertainties ?? [], 10);
    }
    for (const frame of ledger?.frames ?? []) {
      const frameFile = path.basename(String(frame.frameFile ?? ""));
      if (!frameFile) continue;
      const key = `${frame.segmentId ?? ""}\u0000${frameFile}`;
      if (framesByKey.has(key)) continue;
      framesByKey.set(key, frame);
    }
  }

  const merged = normalizeVisualFrameLedger({
    recipes: [...recipesByCandidate.values()],
    frames: [...framesByKey.values()],
    warnings,
  }, finalInputSegmentKeyframes);
  return {
    ...merged,
    batchMode: true,
    batchSize,
    batchCount: ledgers.length,
    batchContextVersion: VISUAL_FRAME_LEDGER_BATCH_CONTEXT_VERSION,
    ...(fallbackVersion ? { fallbackVersion } : {}),
    ...(callTimeoutMs ? { callTimeoutMs } : {}),
    ...(partialFailureCount ? { partialFailureCount } : {}),
    ...(skippedBatchCount ? { skippedBatchCount } : {}),
    ...(rawRecovered ? {
      rawRecovered: true,
      rawRecoveryVersion: VISUAL_FRAME_LEDGER_RAW_RECOVERY_VERSION,
    } : {}),
  };
}

function formatVisualFrameLedgerPrompt(ledger) {
  const lines = [];
  let charCount = 0;
  for (const recipe of ledger?.recipes ?? []) {
    const parts = [
      `- ${recipe.candidateId} ${recipe.titleHint || "(제목 없음)"} segments=${recipe.segmentIds?.join(", ") || "(없음)"}`,
      recipe.keyFrameFiles.length ? `keyFrames=${recipe.keyFrameFiles.join(", ")}` : null,
      recipe.observedIngredients.length ? `observed=${recipe.observedIngredients.join(", ")}` : null,
      recipe.cookingTransitions.length ? `transitions=${recipe.cookingTransitions.join(" / ")}` : null,
      recipe.sauceBrothSeasoningCues.length ? `sauce/broth/seasoning=${recipe.sauceBrothSeasoningCues.join(", ")}` : null,
      recipe.uncertainties.length ? `uncertain=${recipe.uncertainties.join(", ")}` : null,
    ].filter(Boolean);
    const line = parts.join(" | ");
    if (charCount + line.length > VISUAL_FRAME_LEDGER_PROMPT_TOTAL_BUDGET_CHARS) break;
    lines.push(line);
    charCount += line.length + 1;
  }
  for (const frame of ledger?.frames ?? []) {
    const parts = [
      `- ${frame.segmentId || "?"}/${frame.candidateId || "?"} ${frame.titleHint || "(제목 없음)"} ${frame.frameFile}@${frame.timestamp || "?"}`,
      frame.visibleIngredients.length ? `visible=${frame.visibleIngredients.join(", ")}` : null,
      frame.cookingState ? `state=${frame.cookingState}` : null,
      frame.sauceBrothSeasoningCues.length ? `sauce/broth/seasoning=${frame.sauceBrothSeasoningCues.join(", ")}` : null,
      frame.uncertainties.length ? `uncertain=${frame.uncertainties.join(", ")}` : null,
    ].filter(Boolean);
    const line = parts.join(" | ");
    if (charCount + line.length > VISUAL_FRAME_LEDGER_PROMPT_TOTAL_BUDGET_CHARS) break;
    lines.push(line);
    charCount += line.length + 1;
  }
  if (!lines.length) return null;
  return [
    "Visual frame ledger:",
    "이 ledger는 정답이 아니라 선택 프레임을 다시 읽기 위한 시각 체크리스트다. source text, sourceCuePacket, Recipe evidence ledger가 명명한 재료·양념·조리 동작을 지우거나 다른 재료로 바꾸는 근거로 쓰지 않는다.",
    "observed/visible은 화면에 보이는 후보, transitions는 조리 상태 전환, sauce/broth/seasoning은 소스·국물·양념 단서, uncertain은 불확실한 관찰이다.",
    "source concrete preservation: source text/sourceCuePacket/Recipe evidence ledger가 열무김치, 동치미 육수, 마늘쫑, 연어, 달걀말이처럼 구체 재료명을 주면 visual ledger의 generic observed나 uncertain 표현 때문에 그 이름을 삭제하거나 더 약한 이름으로 바꾸지 않는다.",
    "visual uncertainty is not a veto: uncertain은 '삭제' 지시가 아니라 source와 frame을 다시 확인하라는 표시다. source 근거가 강한 구체명은 amount를 null로 두더라도 재료명은 보존한다.",
    "색·모양·질감만으로 적힌 observed/visible/uncertain 단서는 final에서 구체 재료명으로 확정하지 않는다. source text나 여러 프레임의 강한 근거가 있을 때만 확정한다.",
    "작은 양념/향미 베이스도 관찰 대상이다. 흰색/크림형 소스, 다진 향채, 붉은 가루·장·기름, 갈색 액체, 향미유, 소금/설탕처럼 소량이지만 맛을 만드는 단서는 sauce/broth/seasoning이나 uncertainties에 남긴다.",
    "단백질 정체성도 따로 관찰한다. 해산물/조개/새우/오징어/생선으로 보이는 단서는 meat/pork/beef/chicken으로 바꾸지 말고, 확실하지 않으면 uncertainties에 남긴다.",
    "protein species guard: 포장 라벨, 화면 자막, source text가 소고기/돼지고기/닭고기처럼 축종을 직접 주지 않으면 색이나 모양만으로 특정 축종을 observedIngredients에 확정하지 않는다. 이때는 고기, 고기류, 단백질 재료처럼 보수적으로 적고 uncertainties에 남긴다.",
    "국물/소스 액체 베이스도 관찰한다. 물, 육수, 면수, 토마토소스+물처럼 묽어지는 흐름, 끓는 국물, 졸임 액체가 보이면 sauce/broth/seasoning에 남긴다.",
    "liquid heat guard: 국물/육수/소스 액체가 보인다는 사실만으로 끓임이나 데움 상태를 확정하지 않는다. 냄비, 불, 기포, 김, source의 끓임 동사가 보일 때만 heated/boiling 단서로 적고, 아니면 단순 액체/국물로 둔다.",
    ...lines,
  ].join("\n");
}

function visualFrameLedgerForCandidate(ledger, candidateId) {
  if (!ledger) return null;
  return {
    ...ledger,
    recipes: (ledger.recipes ?? []).filter((recipe) => recipe.candidateId === candidateId),
    frames: (ledger.frames ?? []).filter((frame) => frame.candidateId === candidateId),
  };
}

function isSourceMentionDerivedVisualCue(value) {
  return /(?:\b(?:caption|transcript|subtitle|voiceover|spoken)\b|자막|발화|대사|나레이션|내레이션|언급|말함|말한다|말하는)/iu
    .test(String(value ?? ""));
}

function filterSourceMentionStringList(values) {
  let droppedCount = 0;
  const filtered = (values ?? []).filter((value) => {
    const drop = isSourceMentionDerivedVisualCue(value);
    if (drop) droppedCount += 1;
    return !drop;
  });
  return { values: filtered, droppedCount };
}

function filterVisualFrameLedgerSourceMentionsForPrompt(ledger) {
  if (!ledger) return { ledger, droppedCount: 0 };
  let droppedCount = 0;
  const filterList = (values) => {
    const result = filterSourceMentionStringList(values);
    droppedCount += result.droppedCount;
    return result.values;
  };
  const filterText = (value) => {
    if (!isSourceMentionDerivedVisualCue(value)) return value;
    droppedCount += 1;
    return "";
  };
  return {
    ledger: {
      ...ledger,
      recipes: (ledger.recipes ?? []).map((recipe) => ({
        ...recipe,
        observedIngredients: filterList(recipe.observedIngredients),
        cookingTransitions: filterList(recipe.cookingTransitions),
        sauceBrothSeasoningCues: filterList(recipe.sauceBrothSeasoningCues),
        uncertainties: filterList(recipe.uncertainties),
      })),
      frames: (ledger.frames ?? []).map((frame) => ({
        ...frame,
        visibleIngredients: filterList(frame.visibleIngredients),
        cookingState: filterText(frame.cookingState),
        sauceBrothSeasoningCues: filterList(frame.sauceBrothSeasoningCues),
        uncertainties: filterList(frame.uncertainties),
      })),
      sourceMentionFilter: {
        version: PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION,
        droppedCount,
      },
    },
    droppedCount,
  };
}

function mustConsiderFactText(value) {
  return clippedLedgerText(value, RECIPE_MUST_CONSIDER_FACTS_TEXT_MAX_CHARS);
}

function pushMustConsiderFact(list, fact, maxItems) {
  if (list.length >= maxItems) return false;
  const text = mustConsiderFactText(fact?.text);
  if (!text) return false;
  const normalized = {
    kind: compact(fact.kind ?? "fact"),
    basis: compact(fact.basis ?? "unknown"),
    text,
  };
  const key = `${normalized.kind}\u0000${normalized.basis}\u0000${keyOf(normalized.text)}`;
  if (list.some((entry) => `${entry.kind}\u0000${entry.basis}\u0000${keyOf(entry.text)}` === key)) return false;
  list.push(normalized);
  return true;
}

function recipeMustConsiderCandidateOrder(recipeEvidenceLedger, visualFrameLedger) {
  const ordered = [];
  const seen = new Set();
  const push = (candidateId, titleHint) => {
    const normalizedId = compact(candidateId);
    if (!normalizedId || seen.has(normalizedId)) return;
    seen.add(normalizedId);
    ordered.push({ candidateId: normalizedId, titleHint: compact(titleHint) });
  };
  for (const recipe of recipeEvidenceLedger?.recipes ?? []) push(recipe.candidateId, recipe.titleHint);
  for (const recipe of visualFrameLedger?.recipes ?? []) push(recipe.candidateId, recipe.titleHint);
  for (const frame of visualFrameLedger?.frames ?? []) push(frame.candidateId, frame.titleHint);
  return ordered;
}

function buildTitleVisualBridgeFacts(titleHint, visualTexts) {
  const title = compact(titleHint);
  const visualText = compact(visualTexts.join(" "));
  const facts = [];
  const push = (text) => facts.push({
    kind: "title_visual_bridge",
    basis: "title+visual",
    text,
  });

  if (/(김밥|말이|초밥)/u.test(title) && /(말이|롤|단면|흰색|밥|쌀|곡물|층)/u.test(visualText)) {
    push("제목은 말이형 밥 요리이고 화면에 말이/단면/흰색 층 단서가 있다. 프레임에서 곡물층이 확인되면 밥을 재료와 말기 단계에 포함하되, 바깥 wrapper는 source/onscreen/강한 화면 근거가 없으면 납작어묵·김·피 같은 구체 재료로 단정하지 않는다.");
  }
  if (/(파스타|국수|면|우동|라면|소바|냉면)/u.test(title) && /(면|noodle|스파게티|긴|삶|끓)/iu.test(visualText)) {
    push("제목은 면 요리이고 화면에 면/삶기/합치기 단서가 있다. 보이는 면 재료와 면 삶기, 소스나 국물에 합치는 단계를 빠뜨리지 않는다.");
  }

  if (/(해장|볶이|매운|고추)/u.test(title) && /(붉|빨간|매운|고추|국물|소스|양념|졸)/u.test(visualText)) {
    push("제목과 화면 모두 붉은/매운 베이스를 시사한다. source/onscreen 근거 없이 토마토소스·고추장 같은 특정 소스로 단정하지 말고, 불확실하면 붉은/매운 양념 베이스처럼 generic하게 보존한다.");
  }

  if (/(오꼬|오코노미|오코노미야키|야끼|전|부침)/u.test(title) && /(반죽|부침|팬|뒤집|소스|마요|가쓰오|토핑)/u.test(visualText)) {
    push("제목은 부침/오코노미 계열이고 화면에 반죽·부침·토핑 단서가 있다. 반죽 베이스, 팬 부침, 소스/마요/가루·가쓰오류 마무리 단서를 각각 점검한다.");
  }

  if (/(콘치즈|치즈|옥수수|콘)/u.test(title) && /(하얀|크림|마요|치즈|꾸덕|옥수수|버터)/u.test(visualText)) {
    push("제목은 옥수수/치즈 계열이고 화면에 하얀 크림성 베이스나 꾸덕한 질감 단서가 있다. 정확히 마요네즈인지 치즈인지 불확실하면 삭제하지 말고 크림/마요 베이스처럼 generic하게 남긴다.");
  }

  return facts.slice(0, 3);
}

export function buildRecipeMustConsiderFacts({ recipeEvidenceLedger = null, visualFrameLedger = null } = {}) {
  const evidenceByCandidate = new Map((recipeEvidenceLedger?.recipes ?? []).map((recipe) => [recipe.candidateId, recipe]));
  const visualRecipesByCandidate = new Map((visualFrameLedger?.recipes ?? []).map((recipe) => [recipe.candidateId, recipe]));
  const visualFramesByCandidate = new Map();
  for (const frame of visualFrameLedger?.frames ?? []) {
    if (!frame.candidateId) continue;
    const list = visualFramesByCandidate.get(frame.candidateId) ?? [];
    list.push(frame);
    visualFramesByCandidate.set(frame.candidateId, list);
  }

  const recipes = [];
  let textChars = 0;
  let truncatedByBudget = false;
  const addTextBudget = (text) => {
    const length = String(text ?? "").length;
    if (textChars + length > RECIPE_MUST_CONSIDER_FACTS_TOTAL_BUDGET_CHARS) {
      truncatedByBudget = true;
      return false;
    }
    textChars += length;
    return true;
  };

  for (const candidate of recipeMustConsiderCandidateOrder(recipeEvidenceLedger, visualFrameLedger)) {
    const evidenceRecipe = evidenceByCandidate.get(candidate.candidateId);
    const visualRecipe = visualRecipesByCandidate.get(candidate.candidateId);
    const visualFrames = visualFramesByCandidate.get(candidate.candidateId) ?? [];
    const sourceFacts = [];
    const visualFacts = [];
    const bridgeFacts = [];
    const uncertainties = [];

    const sourceItems = [
      ...(evidenceRecipe?.evidenceItems ?? []).filter((item) => item.basis === "source"),
      ...(evidenceRecipe?.promptCues ?? []).filter((cue) => cue.basis === "source"),
    ]
      .filter((item) => ["ingredient_or_amount", "cooking_action", "visual_context"].includes(item.kind))
      .sort((a, b) => sourceCuePriority(a) - sourceCuePriority(b));
    for (const item of sourceItems) {
      if (sourceFacts.length >= RECIPE_MUST_CONSIDER_SOURCE_FACT_LIMIT) break;
      const text = mustConsiderFactText(item.text);
      if (!text || !addTextBudget(text)) break;
      pushMustConsiderFact(sourceFacts, {
        kind: item.kind,
        basis: item.sourceKind ? `source:${item.sourceKind}` : "source",
        text,
      }, RECIPE_MUST_CONSIDER_SOURCE_FACT_LIMIT);
    }

    const visualInputs = [
      ...(visualRecipe?.observedIngredients ?? []).map((text) => ({ kind: "observed_ingredient", text })),
      ...(visualRecipe?.sauceBrothSeasoningCues ?? []).map((text) => ({ kind: "sauce_broth_seasoning", text })),
      ...(visualRecipe?.cookingTransitions ?? []).map((text) => ({ kind: "cooking_transition", text })),
      ...visualFrames.flatMap((frame) => [
        ...(frame.visibleIngredients ?? []).map((text) => ({ kind: "visible_ingredient", text })),
        ...(frame.sauceBrothSeasoningCues ?? []).map((text) => ({ kind: "frame_sauce_broth_seasoning", text })),
        frame.cookingState ? { kind: "frame_cooking_state", text: frame.cookingState } : null,
      ].filter(Boolean)),
    ];
    for (const item of visualInputs) {
      if (visualFacts.length >= RECIPE_MUST_CONSIDER_VISUAL_FACT_LIMIT) break;
      const text = mustConsiderFactText(item.text);
      if (!text || !addTextBudget(text)) break;
      pushMustConsiderFact(visualFacts, {
        kind: item.kind,
        basis: "visual",
        text,
      }, RECIPE_MUST_CONSIDER_VISUAL_FACT_LIMIT);
    }

    const bridgeInputs = buildTitleVisualBridgeFacts(candidate.titleHint, [
      ...sourceFacts.map((fact) => fact.text),
      ...visualFacts.map((fact) => fact.text),
    ]);
    for (const item of bridgeInputs) {
      const text = mustConsiderFactText(item.text);
      if (!text || !addTextBudget(text)) break;
      pushMustConsiderFact(bridgeFacts, {
        ...item,
        text,
      }, 3);
    }

    const uncertaintyInputs = [
      ...(visualRecipe?.uncertainties ?? []),
      ...visualFrames.flatMap((frame) => frame.uncertainties ?? []),
    ];
    for (const textValue of uncertaintyInputs) {
      if (uncertainties.length >= RECIPE_MUST_CONSIDER_UNCERTAINTY_LIMIT) break;
      const text = mustConsiderFactText(textValue);
      if (!text || !addTextBudget(text)) break;
      pushMustConsiderFact(uncertainties, {
        kind: "uncertainty",
        basis: "visual",
        text,
      }, RECIPE_MUST_CONSIDER_UNCERTAINTY_LIMIT);
    }

    if (!sourceFacts.length && !visualFacts.length && !bridgeFacts.length && !uncertainties.length) continue;
    recipes.push({
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint || evidenceRecipe?.titleHint || visualRecipe?.titleHint || "",
      sourceFacts,
      visualFacts,
      bridgeFacts,
      uncertainties,
    });
  }

  return {
    version: RECIPE_MUST_CONSIDER_FACTS_VERSION,
    recipes,
    stats: {
      recipeCount: recipes.length,
      sourceFactCount: recipes.reduce((sum, recipe) => sum + recipe.sourceFacts.length, 0),
      visualFactCount: recipes.reduce((sum, recipe) => sum + recipe.visualFacts.length, 0),
      bridgeFactCount: recipes.reduce((sum, recipe) => sum + recipe.bridgeFacts.length, 0),
      uncertaintyCount: recipes.reduce((sum, recipe) => sum + recipe.uncertainties.length, 0),
      textChars,
      truncatedByBudget,
    },
  };
}

function summarizeRecipeMustConsiderFacts(facts) {
  const recipes = facts?.recipes ?? [];
  return {
    recipeMustConsiderFactsVersion: facts?.version ?? RECIPE_MUST_CONSIDER_FACTS_VERSION,
    titleVisualBridgeFactsVersion: TITLE_VISUAL_BRIDGE_FACTS_VERSION,
    recipeMustConsiderFactsRecipeCount: recipes.length,
    recipeMustConsiderSourceFactCount: recipes.reduce((sum, recipe) => sum + (recipe.sourceFacts?.length ?? 0), 0),
    recipeMustConsiderVisualFactCount: recipes.reduce((sum, recipe) => sum + (recipe.visualFacts?.length ?? 0), 0),
    recipeMustConsiderBridgeFactCount: recipes.reduce((sum, recipe) => sum + (recipe.bridgeFacts?.length ?? 0), 0),
    recipeMustConsiderUncertaintyCount: recipes.reduce((sum, recipe) => sum + (recipe.uncertainties?.length ?? 0), 0),
    recipeMustConsiderFactTextChars: recipes.reduce((sum, recipe) => (
      sum
      + (recipe.sourceFacts ?? []).reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
      + (recipe.visualFacts ?? []).reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
      + (recipe.bridgeFacts ?? []).reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
      + (recipe.uncertainties ?? []).reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
    ), 0),
    recipeMustConsiderFactsTruncatedByBudget: Boolean(facts?.stats?.truncatedByBudget),
  };
}

function formatRecipeMustConsiderFactsPrompt(facts) {
  const blocks = (facts?.recipes ?? []).map((recipe) => {
    const lines = [
      `- candidateId: ${recipe.candidateId} / titleHint: ${recipe.titleHint || "(제목 없음)"}`,
    ];
    if (recipe.sourceFacts?.length) {
      lines.push("  source facts:");
      lines.push(...recipe.sourceFacts.map((fact) => `  - [${fact.kind}/${fact.basis}] ${fact.text}`));
    }
    if (recipe.visualFacts?.length) {
      lines.push("  visual facts:");
      lines.push(...recipe.visualFacts.map((fact) => `  - [${fact.kind}/${fact.basis}] ${fact.text}`));
    }
    if (recipe.bridgeFacts?.length) {
      lines.push("  bridge facts:");
      lines.push(...recipe.bridgeFacts.map((fact) => `  - [${fact.kind}/${fact.basis}] ${fact.text}`));
    }
    if (recipe.uncertainties?.length) {
      lines.push("  uncertainties:");
      lines.push(...recipe.uncertainties.map((fact) => `  - ${fact.text}`));
    }
    return lines.join("\n");
  });
  if (!blocks.length) return null;
  return [
    "Recipe must-consider facts:",
    "이 목록은 정답지가 아니라 final 누락 방지 체크리스트다. source facts가 visual facts보다 우선한다.",
    "final JSON을 쓰기 직전에 각 recipe에 대해 source facts의 명시 재료/양념/동작과 visual facts의 소스·국물·양념·전환 단서를 빠뜨리지 않았는지 확인한다.",
    "source concrete name preservation: source facts에 구체 재료명/양념명/국물명/고명명이 있으면 visual facts의 generic 이름이나 uncertainties 때문에 삭제하거나 약화하지 않는다. 분량이 불확실하면 amount=null로 두고 source_note에 불확실성을 적는다.",
    "bridge facts는 제목 단독 추정이 아니라 제목과 visual facts가 함께 가리키는 경우에만 쓰는 보조 점검표다. bridge facts만으로 화면/source에 없는 재료를 추가하지 않는다.",
    "uncertainties는 확정 재료로 단정하지 말고, 근거가 약하면 generic 이름이나 null amount로 보수적으로 남긴다. 단 source facts가 이미 구체명을 준 경우 uncertainties는 삭제 근거가 아니라 재확인 메모다.",
    "목록에 없는 재료나 단계를 요리 상식만으로 추가하지 않는다.",
    ...blocks,
  ].join("\n");
}

function recipeMustConsiderFactsForCandidate(facts, candidateId) {
  if (!facts) return null;
  const recipes = (facts.recipes ?? []).filter((recipe) => recipe.candidateId === candidateId);
  return {
    ...facts,
    recipes,
    stats: {
      recipeCount: recipes.length,
      sourceFactCount: recipes.reduce((sum, recipe) => sum + recipe.sourceFacts.length, 0),
      visualFactCount: recipes.reduce((sum, recipe) => sum + recipe.visualFacts.length, 0),
      bridgeFactCount: recipes.reduce((sum, recipe) => sum + recipe.bridgeFacts.length, 0),
      uncertaintyCount: recipes.reduce((sum, recipe) => sum + recipe.uncertainties.length, 0),
      textChars: recipes.reduce((sum, recipe) => (
        sum
        + recipe.sourceFacts.reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
        + recipe.visualFacts.reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
        + recipe.bridgeFacts.reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
        + recipe.uncertainties.reduce((inner, fact) => inner + String(fact.text ?? "").length, 0)
      ), 0),
      truncatedByBudget: Boolean(facts.stats?.truncatedByBudget),
    },
  };
}

function selectedFrameTimeWindow(selectedFrames, marginSec = PER_SEGMENT_SOURCE_TIME_FILTER_MARGIN_SEC) {
  const times = (selectedFrames ?? [])
    .map((frame) => parseTimeSec(frame?.timestamp_sec ?? frame?.timestamp))
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return {
    startSec: Math.max(0, min - marginSec),
    endSec: max + marginSec,
    minSelectedSec: min,
    maxSelectedSec: max,
    marginSec,
  };
}

function isTimedCaptionCue(value) {
  const source = String(value?.source ?? value?.sourceKind ?? "").toLowerCase();
  const text = String(value?.text ?? value?.reason ?? value ?? "");
  return source.includes("caption")
    || source.includes("transcript")
    || /^\s*\[?(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\]?/.test(text);
}

function timestampFromCueLike(value) {
  const direct = Number(value?.timestampSec ?? value?.timeSec);
  if (Number.isFinite(direct)) return direct;
  if (!isTimedCaptionCue(value)) return null;
  const text = String(value?.text ?? value?.reason ?? value ?? "");
  return timestampFromLedgerLine(text);
}

function cueWithinSelectedFrameWindow(cue, window) {
  if (!window) return true;
  if (String(cue?.source ?? "").startsWith("evidence_packet")) return true;
  const timestampSec = timestampFromCueLike(cue);
  if (!Number.isFinite(timestampSec)) return true;
  return timestampSec >= window.startSec && timestampSec <= window.endSec;
}

function filterSourceCuePacketForTimeWindow(packet, window) {
  if (!packet || !window) return { packet, droppedCount: 0 };
  let droppedCount = 0;
  const filterTimed = (values) => (values ?? []).filter((value) => {
    const keep = cueWithinSelectedFrameWindow(value, window);
    if (!keep) droppedCount += 1;
    return keep;
  });
  return {
    packet: {
      ...packet,
      localSourceSnippets: filterTimed(packet.localSourceSnippets),
      cookingCueSnippets: filterTimed(packet.cookingCueSnippets),
      sourceTimeFilter: {
        version: PER_SEGMENT_SOURCE_TIME_FILTER_VERSION,
        ...window,
        droppedCount,
      },
    },
    droppedCount,
  };
}

function filterRecipeEvidenceLedgerForTimeWindow(ledger, window) {
  if (!ledger || !window) return { ledger, droppedCount: 0 };
  let droppedCount = 0;
  const recipes = (ledger.recipes ?? []).map((recipe) => {
    const filterTimed = (values) => (values ?? []).filter((value) => {
      const keep = cueWithinSelectedFrameWindow(value, window);
      if (!keep) droppedCount += 1;
      return keep;
    });
    return {
      ...recipe,
      evidenceItems: filterTimed(recipe.evidenceItems),
      promptCues: filterTimed(recipe.promptCues),
    };
  });
  return {
    ledger: {
      ...ledger,
      recipes,
      sourceTimeFilter: {
        version: PER_SEGMENT_SOURCE_TIME_FILTER_VERSION,
        ...window,
        droppedCount,
      },
    },
    droppedCount,
  };
}

function filterRecipeMustConsiderFactsForTimeWindow(facts, window) {
  if (!facts || !window) return { facts, droppedCount: 0 };
  let droppedCount = 0;
  const recipes = (facts.recipes ?? []).map((recipe) => ({
    ...recipe,
    sourceFacts: (recipe.sourceFacts ?? []).filter((fact) => {
      const keep = cueWithinSelectedFrameWindow(fact, window);
      if (!keep) droppedCount += 1;
      return keep;
    }),
  }));
  return {
    facts: {
      ...facts,
      recipes,
      sourceTimeFilter: {
        version: PER_SEGMENT_SOURCE_TIME_FILTER_VERSION,
        ...window,
        droppedCount,
      },
    },
    droppedCount,
  };
}

function filterRecipeMustConsiderSourceMentionsForPrompt(facts) {
  if (!facts) return { facts, droppedCount: 0 };
  let droppedCount = 0;
  const filterFacts = (values) => (values ?? []).filter((fact) => {
    const drop = isSourceMentionDerivedVisualCue(fact?.text);
    if (drop) droppedCount += 1;
    return !drop;
  });
  const recipes = (facts.recipes ?? []).map((recipe) => ({
    ...recipe,
    visualFacts: filterFacts(recipe.visualFacts),
    uncertainties: filterFacts(recipe.uncertainties),
  }));
  return {
    facts: {
      ...facts,
      recipes,
      sourceMentionFilter: {
        version: PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION,
        droppedCount,
      },
    },
    droppedCount,
  };
}

function targetSourceTextForPerSegment(sourceText, window) {
  if (!window) return { text: sourceText, droppedLineCount: 0 };
  let droppedLineCount = 0;
  const blocks = sourceBlocks(sourceText).map((block) => {
    const sourceKind = sourceKindFromName(block.name);
    if (sourceKind !== "caption") return block;
    const lines = block.lines.filter((line) => {
      const timestampSec = timestampFromLedgerLine(line);
      const keep = Number.isFinite(timestampSec) && timestampSec >= window.startSec && timestampSec <= window.endSec;
      if (!keep) droppedLineCount += 1;
      return keep;
    });
    return { ...block, lines };
  }).filter((block) => block.lines.length > 0);
  return {
    text: blocks.flatMap((block) => [`[SOURCE: ${block.name}]`, ...block.lines]).join("\n"),
    droppedLineCount,
  };
}

function sanitizeSegmentedFinalBasePrompt(prompt) {
  const original = String(prompt ?? "");
  const sourceBounded = original
    .replace(
      /이 영상을 직접 시청할 수 있다\.\s*/gu,
      "이 호출에서는 외부 영상 페이지를 열지 말고 제공된 텍스트 소스와 첨부 프레임만 사용한다. ",
    )
    .replace(
      /이 영상을 직접 볼 수 있다\.\s*/gu,
      "이 호출에서는 외부 영상 페이지를 열지 말고 제공된 텍스트 소스와 첨부 프레임만 사용한다. ",
    );
  const sanitized = sourceBounded.replace(
    /\nEvidence packets:\n[\s\S]*?\n\n규칙:/u,
    [
      "",
      "[SEGMENTED_FINAL_NOTE: legacy Evidence packets removed. Use Output recipe candidates, segment frames, sourceCuePacket, and Recipe evidence ledger as the final extraction boundary.]",
      "",
      "규칙:",
    ].join("\n"),
  );
  return {
    prompt: sanitized,
    legacyEvidencePacketsRemoved: sanitized !== sourceBounded,
    sourceBoundaryNormalized: sourceBounded !== original,
  };
}

function stripPerSegmentBasePromptSource(prompt) {
  return String(prompt ?? "").replace(
    /\n텍스트 소스:\n[\s\S]*?\n\n규칙:/u,
    [
      "",
      "텍스트 소스: (per-segment final에서는 target 시간창으로 필터링한 source를 아래 '텍스트 소스 원문 재확인' 섹션에만 제공한다.)",
      "",
      "규칙:",
    ].join("\n"),
  );
}

function modelSourceBoundaryLines(contextLabel) {
  return [
    `source boundary (${MODEL_SOURCE_BOUNDARY_VERSION}, ${contextLabel}):`,
    "- 외부 웹 검색, YouTube 검색, 브라우저 탐색, 검색엔진 사용을 하지 않는다.",
    "- Do not use web search, browser search, YouTube lookup, or external pages.",
    "- 이 호출에서 사용할 수 있는 근거는 prompt 안의 source text, sourceCuePacket, Recipe evidence ledger, selected frames, 첨부 이미지뿐이다.",
    "- 영상 URL이나 영상 제목을 검색해서 재료·단계·분량을 보완하지 않는다.",
    "- 로컬 정답지, 평가용 split 정답, 이전 추출/채점 결과 파일은 추출 중 절대 보지 않는다.",
  ];
}

function onscreenTextPriorityLines(contextLabel) {
  return [
    `onscreen text priority (${ONSCREEN_TEXT_PRIORITY_VERSION}, ${contextLabel}):`,
    "- 첨부된 selected frame 안의 한국어 자막, 화면 글자, 재료 포장명, 양념 라벨을 먼저 읽고 재료·양념·조리 전환 근거로 사용한다.",
    "- 화면 자막에 구체 재료명이나 양념명(예: 소스, 장류, 기름, 향채, 국물 베이스)이 보이면 selectionReason보다 우선해 ingredients와 steps에 반영한다.",
    "- 흐린 글자나 확실하지 않은 화면 단서는 구체 재료명으로 과확정하지 말고 generic 이름 또는 uncertainty로 남긴다.",
    "- 이벤트, 광고, BGM, 구매 안내, 댓글 유도 문구처럼 요리 재료·단계가 아닌 화면 글자는 무시한다.",
  ];
}

function visualIdentityGuardLines(contextLabel) {
  return [
    `visual identity guard (${VISUAL_IDENTITY_GUARD_VERSION}, ${contextLabel}):`,
    "- 말이류/김밥류는 조립 프레임과 단면 프레임을 함께 보고 속재료를 식별한다.",
    "- 넓고 납작한 주황색 생선살처럼 보이는 속재료는 얇은 당근채로 쉽게 바꾸지 않는다. 확실하면 연어/생선살로, 불확실하면 '주황색 생선살로 보이는 속재료'처럼 보수적으로 적는다.",
    "- 노란 직사각형 달걀말이/오믈렛처럼 보이는 속재료는 얇은 단무지로 쉽게 바꾸지 않는다. 확실하면 달걀말이/계란으로, 불확실하면 '노란 달걀류 속재료'처럼 보수적으로 적는다.",
    "- 솥밥/덮밥/고기 토핑류에서 고기 표면에 붉은색·갈색 양념 코팅, 소스층, 양념 자막/오버레이가 보이면 plain grilled meat로 단순화하지 말고 양념 베이스와 양념/코팅 단계를 남긴다.",
    "- 정확한 양념명이 불확실하면 특정 장류를 단정하지 말고 '붉은/갈색 양념 베이스' 또는 '양념한 고기'처럼 generic하게 보존한다.",
  ];
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
    candidateLimit: maxFrames,
    widened,
  };
}

function buildSegmentSelectorPrompt({ sourceText, segment, candidateFrames, sourceCuePacket = null }) {
  const budget = segment.frameBudget;
  const sourceCueLines = sourceCuePacket
    ? ["", "candidate source cue packet:", formatSourceCuePacket(sourceCuePacket)]
    : [];
  const bundleLines = segment.bundleParentTitle || segment.bundleSourceText
    ? [
      `bundleParentTitle: ${segment.bundleParentTitle ?? "(없음)"}`,
      `bundleSourceText: ${segment.bundleSourceText ?? "(없음)"}`,
      "bundleTargetRule: 이 segment가 묶음 레시피의 child라면 titleHint가 현재 타깃 요리다. bundleParentTitle/sourceText의 다른 요리 프레임을 타깃 근거로 섞지 않는다.",
    ]
    : [];
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
    ...bundleLines,
    `textEvidence: ${segment.textEvidence.length ? segment.textEvidence.join(" / ") : "(없음)"}`,
    `sourceEvidence: ${(segment.sourceEvidence ?? []).map((item) => `${item.source}: ${item.text}`).join(" / ") || "(없음)"}`,
    `frameBudget: ${budget}`,
    ...sourceCueLines,
    "",
    "선별 기준:",
    "1. 이 candidate/segment의 근거만 판단한다. 다른 candidate의 재료, 토핑, 플레이팅을 섞지 않는다.",
    "2. 완성샷보다 재료 카드, 계량, 양념 배합, 재료 투입, 조리 상태 전환 장면을 우선한다.",
    "3. 계란물·전분·튀김옷처럼 재료에 코팅을 입히는 장면, 별도 팬에서 먼저 굽거나 볶는 분리 조리 장면을 놓치지 않는다.",
    "4. 된장, 쯔유, 액젓, 고춧가루, 설탕, 물, 소스, 미나리, 우삼겹, 스프처럼 작은 장면으로 지나가는 핵심 재료를 놓치지 않는다.",
    "5. 참기름, 깨, 통깨, 고명, 삶은 계란, 곁들임처럼 마지막에 짧게 보이는 마무리 재료도 실제 조리/담기 장면이면 포함한다.",
    "6. 소스/국물/양념의 색, 농도, 재료 투입 전후 상태가 바뀌는 전환 프레임은 중복 완성샷보다 우선한다.",
    "7. 끓는 국물, 붉은 양념, 소스 베이스, 향채/매운 재료가 처음 드러나는 프레임을 완성/서빙 장면 여러 장보다 우선한다.",
    "8. candidate source cue packet이 있으면 그 안의 localSourceSnippets/cookingCueSnippets를 프레임 선택용 책갈피로 쓴다.",
    "9. source cue에 나온 밑간, 기름 코팅, 향채 볶음, 매운 양념 베이스, 물/수분, 마무리 고명 단서가 실제 화면에 보이면 우선 포함한다.",
    "10. source cue는 정답이 아니므로, cue가 이 candidate 화면과 맞지 않으면 억지로 고르지 않는다.",
    "11. 비슷한 완성샷·서빙샷이 여러 장이면 하나만 남기고 조리 중간 상태 전환 프레임을 고른다.",
    "12. shared segment rule: 같은 시간 구간에 둘 이상의 레시피가 붙어 있으면 titleHint와 직접 맞는 재료/양념/조리 상태 프레임을 먼저 고른다.",
    "13. sibling contamination guard: 현재 titleHint와 다른 형제 요리의 프레임을 핵심 근거로 고르지 않는다.",
    "14. final mixed plating frame은 타깃 재료/완성 형태가 함께 보일 때만 보조로 고르고, 그 전에 early/mid cooking frame을 먼저 채운다.",
    "15. 파일명은 아래 목록의 file 값을 정확히 복사한다.",
    `16. selectedFrames는 최대 ${budget}개다.`,
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

function buildFinalInputSegmentFilter({ segmentEntries, candidatePlan, segmentPlan }) {
  const candidatesById = new Map((candidatePlan.recipeCandidates ?? []).map((candidate) => [candidate.candidateId, candidate]));
  const coverageByCandidate = new Map((segmentPlan.coverage ?? []).map((entry) => [entry.candidateId, entry]));
  const coveredRecipeIds = new Set(
    (segmentPlan.coverage ?? [])
      .filter((entry) => entry.status === "covered" && (entry.outputRole ?? "recipe") === "recipe")
      .map((entry) => entry.candidateId),
  );
  const omittedSegments = [];
  const includedSegments = [];

  for (const segment of segmentEntries) {
    const candidate = candidatesById.get(segment.candidateId);
    const coverage = coverageByCandidate.get(segment.candidateId);
    const outputRole = coverage?.outputRole ?? segment.outputRole ?? candidate?.outputRole ?? outputRoleForCandidate(candidate);
    const memberIds = Array.isArray(candidate?.bundleMemberIds) ? candidate.bundleMemberIds : [];
    const hasCoveredChild = memberIds.some((memberId) => coveredRecipeIds.has(memberId));
    if (outputRole === "bundle_parent" && hasCoveredChild) {
      omittedSegments.push({
        segmentId: segment.segmentId,
        candidateId: segment.candidateId,
        titleHint: segment.titleHint,
        outputRole,
        omittedReason: "bundle_parent_has_covered_child_recipe",
        coveredChildCandidateIds: memberIds.filter((memberId) => coveredRecipeIds.has(memberId)),
      });
      continue;
    }
    includedSegments.push(segment);
  }

  return {
    version: FINAL_INPUT_POLICY_VERSION,
    includedSegments,
    omittedSegments,
  };
}

function buildSegmentedFinalPrompt({
  prompt,
  sourceText,
  candidatePlan,
  segmentPlan,
  segmentKeyframes,
  sourceCuePacketPlan = null,
  recipeEvidenceLedger = null,
  visualFrameLedger = null,
  recipeMustConsiderFacts = null,
}) {
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
  const recipeEvidenceLedgerPrompt = formatRecipeEvidenceLedgerPrompt(recipeEvidenceLedger);
  const visualFrameLedgerPrompt = formatVisualFrameLedgerPrompt(visualFrameLedger);
  const recipeMustConsiderFactsPrompt = formatRecipeMustConsiderFactsPrompt(recipeMustConsiderFacts);
  const sanitizedBasePrompt = sanitizeSegmentedFinalBasePrompt(prompt);

  return [
    sanitizedBasePrompt.prompt,
    "",
    ...modelSourceBoundaryLines("segmented-final"),
    ...onscreenTextPriorityLines("segmented-final"),
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
    "11. 첨부 프레임에서 계란물·전분·튀김옷 코팅, 별도 팬 조리, 향채 볶음, 양념 베이스, 물/수분 투입, 참기름·깨·고명·삶은 계란 같은 마무리 장면이 보이면 steps와 ingredients에 빠짐없이 반영한다.",
    "12. selector의 selectionReason이 짧거나 틀릴 수 있으므로, 프레임 안 자막/오버레이 글자와 실제 화면을 직접 읽어 양념층·코팅·마무리 재료를 재확인한다.",
    "13. recipe identity anchor: sourceCuePacket, Recipe evidence ledger, source text에 국물/육수, 소스 베이스, 향채/향신, 매운 양념, 면 삶기 단서가 있으면 ingredients와 steps에서 빠뜨리지 않는다. 단, 근거가 없으면 요리 상식으로 추가하지 않는다.",
    "14. source-priority rule: sourceCuePacket이나 Recipe evidence ledger의 basis=source 항목에 구체 재료명, 양념명, 조리 동작이 있으면 visual ledger보다 우선한다. Visual frame ledger는 source 신호를 지우거나 다른 재료로 바꾸는 근거가 아니다.",
    "14-1. negated source action preservation rule: source text나 Recipe evidence ledger에 '볶지 않고', '튀기지 않고', '끓이지 않고', '굽지 않고'처럼 특정 조리 동작을 하지 말라는 표현이 있으면, visual/selector 추정만으로 그 반대 동작을 steps에 쓰지 않는다.",
    "14-2. source concrete name preservation rule: sourceCuePacket/Recipe evidence ledger/source text가 구체 재료명이나 양념명을 주면, visual ledger의 generic observed 또는 uncertain 표현 때문에 그 이름을 삭제하거나 약한 이름으로 바꾸지 않는다. 예: 열무김치->열무, 동치미 육수->국물, 마늘쫑->초록 재료, 연어/달걀말이->색깔 속재료로 약화하지 않는다.",
    "15. visual uncertainty rule: 색·모양·질감만으로 보이는 단서(예: 노란 절임 재료, 넓적한 재료, 초록색 채소)는 source text나 여러 프레임의 강한 근거가 없으면 구체 재료명으로 확정하지 않는다.",
    "15-1. visual uncertainty is not a veto: visual ledger uncertainties는 source 구체명을 제거하라는 뜻이 아니다. source 근거가 강하면 amount를 null 또는 visual-estimate로 두더라도 구체 재료명과 source_note를 보존한다.",
    "16. visible seasoning base policy: 소량이라도 맛을 만드는 양념/향미 베이스가 프레임에 보이면 ingredients와 steps에서 생략하지 않는다. 예: 흰색/크림형 소스, 다진 향채, 붉은 가루·장·기름, 갈색 액체, 향미유, 소금/설탕.",
    "17. 정확한 양념명이 불확실하지만 붉은 국물+고추/향채+매운 제목처럼 강한 시각/텍스트 근거가 있으면 '매운 양념 베이스'처럼 generic ingredient로 적고 amountBasis는 visual-estimate 또는 null로 둔다.",
    "18. 옥수수+치즈, 면+붉은 국물처럼 큰 재료만 적고 끝내지 않는다. visible creamy/aromatic/spicy base가 있으면 조리 단계에 '베이스를 볶거나 끓인다'는 흐름을 남긴다.",
    "19. protein identity guard: source text, selected frame, visual ledger에 해산물/조개/새우/오징어/생선 단서가 있으면 meat/pork/beef/chicken/고기로 바꾸지 않는다. 단백질이 불확실하면 '해산물로 보이는 재료' 또는 '단백질 재료'처럼 보수적으로 적고 uncertainty를 유지한다.",
    "20. liquid base preservation rule: visual ledger나 frames에 국물/소스 액체, 끓는 물성, 묽어지는 소스, 졸임 액체가 보이면 ingredients에 물/육수/면수/소스액 중 가장 보수적인 이름을 넣고 steps에 액체 베이스 형성 단계를 남긴다.",
    "20-1. protein species guard: source text, 화면 자막, 포장 라벨이 소고기/돼지고기/닭고기처럼 축종을 직접 주지 않으면 visual-only 관찰만으로 축종을 확정하지 않는다. 이때는 고기, 고기류, 단백질 재료처럼 보수적으로 쓰고 source_note에 불확실성을 남긴다.",
    "20-2. liquid heat guard: 국물/육수/소스 액체가 보인다는 사실만으로 끓임/데움 단계를 만들지 않는다. 냄비, 불, 기포, 김, source의 끓임 동사가 target 근거에 있을 때만 끓인다/데운다를 쓴다.",
    "21. spicy red base rule: 붉은 소스/국물 + 고추/향채/볶이/해장/매운 단서가 함께 있으면 정확한 장류를 단정하지 않더라도 '매운 양념 베이스'를 generic ingredient/step으로 남긴다.",
    "22. creamy/mayo base preservation rule: visual ledger나 frames에 하얀 크림성 재료, 마요/크림형 베이스, 꾸덕한 치즈/크림 질감이 보이면 ingredients와 steps에서 삭제하지 않는다. 정확히 마요네즈인지 치즈인지 불확실하면 '크림/마요 베이스'처럼 generic하게 남긴다.",
    "23. step granularity rule: 여러 공정을 한 단계에 압축하지 않는다. 손질, 밑간, 향미 베이스 볶기, 소스/국물 끓이기, 주재료 투입, 면/밥 합치기, 마무리는 가능하면 별도 단계로 나눈다.",
    "24. title-implied ingredient guard: 요리명에 들어간 형식 단어를 재료로 자동 추가하지 않는다. 김밥은 형태/카테고리일 수 있으므로 김 시트가 화면/source에 없으면 김을 추가하지 않는다. 다만 source text나 title hint가 구체 재료 정체성을 주면 그 정체성은 유지한다.",
    "25. 파스타, 치즈, 꼬치 같은 title token도 source text나 이미지 근거 없이 ingredients에 넣지 않는다. 다만 실제 면/치즈/꼬치가 보이거나 source에 명시되면 그 근거로 추가한다.",
    "26. wrapper uncertainty guard: visual ledger나 uncertainties에 바깥층, 피, wrapper, 김, 어묵, 전, 또띠아 같은 감싸는 재료가 불확실하다고 있으면 ingredients에 구체 wrapper를 넣지 않는다. source/onscreen/강한 화면 근거 없이 납작어묵, 김, 피, 전으로 확정하지 않는다.",
    "27. segmented final 단계에서는 Output recipe candidates, segment별 선택 프레임, sourceCuePacket, Recipe evidence ledger가 recipe 경계의 기준이다. base prompt에서 제거된 legacy Evidence packets를 복원하거나 추정하지 않는다.",
    "27-1. shared segment ownership guard: 같은 시간대에 둘 이상의 recipe가 붙어 있으면 현재 candidate의 sourceCuePacket, target selected frames, Recipe evidence ledger에 직접 연결된 재료만 현재 recipe에 넣는다. 다른 candidate title/sourceCuePacket에서만 강한 재료, 고명, 플레이팅은 가져오지 않는다.",
    ...(sourceCuePacketPlan ? [
      "28. sourceCuePacket은 후보별 원문 책갈피다. 정답이 아니라, 설명란/댓글/자막에서 근거를 다시 찾기 위한 작은 단서로만 쓴다.",
      "29. sourceCuePacket의 localSourceSnippets와 cookingCueSnippets에 명시 재료, 수량, 조리 동작이 있으면 먼저 대조하되 이벤트/구매/BGM성 문구는 무시한다.",
    ] : []),
    ...(recipeEvidenceLedgerPrompt ? [
      "30. Recipe evidence ledger는 후보별 작은 근거 장부다. 정답지가 아니라 재확인 체크리스트로만 쓰며, basis=source를 selector_inference보다 우선한다.",
      "31. Recipe evidence ledger에 없는 재료나 단계를 요리 상식만으로 새로 추가하지 않는다.",
    ] : []),
    ...(visualFrameLedgerPrompt ? [
      "32. Visual frame ledger는 선택 프레임을 다시 읽은 시각 체크리스트다. ledger에 적힌 소스/국물/양념 단서는 images에서 재확인해 ingredients와 steps에 반영한다.",
      "33. Visual frame ledger의 uncertainties는 불확실한 관찰이므로 확정 재료명으로 단정하지 않는다. observedIngredients도 색·모양 표현이면 source 근거 없이는 확정 재료로 바꾸지 않는다.",
    ] : []),
    ...(recipeMustConsiderFactsPrompt ? [
      "34. Recipe must-consider facts는 final 직전 누락 점검표다. source facts와 visual facts를 비교해 핵심 재료, 양념 베이스, 액체/국물, 조리 전환이 빠지지 않았는지 확인한다.",
      "35. must-consider facts에 있어도 근거가 불확실하거나 visual-only이면 구체 재료명으로 과확정하지 말고 generic 이름 또는 uncertainty를 유지한다.",
      "36. bridge facts는 제목과 화면 단서가 함께 맞을 때만 쓰는 보조 단서다. 제목만으로 재료를 추가하지 말고, 화면/source가 확인한 재료와 단계만 출력한다.",
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
    ...(recipeEvidenceLedgerPrompt ? [
      "",
      recipeEvidenceLedgerPrompt,
    ] : []),
    ...(visualFrameLedgerPrompt ? [
      "",
      visualFrameLedgerPrompt,
    ] : []),
    ...(recipeMustConsiderFactsPrompt ? [
      "",
      recipeMustConsiderFactsPrompt,
    ] : []),
    "",
    "텍스트 소스 원문 재확인:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "위 정보를 바탕으로 기존 스키마의 JSON만 출력한다.",
  ].join("\n");
}

function safeArtifactId(value) {
  return String(value ?? "unknown").replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function normalizePerSegmentRecipeTitle(segmentJson, segmentEntry) {
  const titleHint = String(segmentEntry?.titleHint ?? "").trim();
  if (!titleHint || !isObject(segmentJson) || !Array.isArray(segmentJson.recipes) || segmentJson.recipes.length !== 1) {
    return {
      json: segmentJson,
      titleNormalized: false,
      titleBeforeNormalization: null,
    };
  }

  const recipe = segmentJson.recipes[0];
  if (!isObject(recipe)) {
    return {
      json: segmentJson,
      titleNormalized: false,
      titleBeforeNormalization: null,
    };
  }

  const titleBeforeNormalization = recipe.title ?? null;
  if (titleBeforeNormalization === titleHint) {
    return {
      json: segmentJson,
      titleNormalized: false,
      titleBeforeNormalization,
    };
  }

  return {
    json: {
      ...segmentJson,
      recipes: [
        {
          ...recipe,
          title: titleHint,
        },
      ],
    },
    titleNormalized: true,
    titleBeforeNormalization,
  };
}

function sourceCuePacketPlanForCandidate(sourceCuePacketPlan, candidateId) {
  if (!sourceCuePacketPlan) return null;
  return {
    ...sourceCuePacketPlan,
    packets: (sourceCuePacketPlan.packets ?? []).filter((packet) => packet.candidateId === candidateId),
  };
}

function recipeEvidenceLedgerForCandidate(recipeEvidenceLedger, candidateId) {
  if (!recipeEvidenceLedger) return null;
  return {
    ...recipeEvidenceLedger,
    recipes: (recipeEvidenceLedger.recipes ?? []).filter((recipe) => recipe.candidateId === candidateId),
  };
}

function buildPerSegmentFinalPrompt({
  prompt,
  sourceText,
  segmentEntry,
  selectedFrames,
  sourceCuePacketPlan = null,
  recipeEvidenceLedger = null,
  visualFrameLedger = null,
  recipeMustConsiderFacts = null,
}) {
  const sanitizedBasePrompt = sanitizeSegmentedFinalBasePrompt(prompt);
  const perSegmentBasePrompt = stripPerSegmentBasePromptSource(sanitizedBasePrompt.prompt);
  const sourceCuePacket = (sourceCuePacketPlan?.packets ?? []).find((packet) => packet.candidateId === segmentEntry.candidateId);
  const recipeEvidenceLedgerPrompt = formatRecipeEvidenceLedgerPrompt(recipeEvidenceLedger);
  const visualFrameLedgerPrompt = formatVisualFrameLedgerPrompt(visualFrameLedger);
  const recipeMustConsiderFactsPrompt = formatRecipeMustConsiderFactsPrompt(recipeMustConsiderFacts);

  return [
    perSegmentBasePrompt,
    "",
    ...modelSourceBoundaryLines("per-segment-final"),
    ...onscreenTextPriorityLines("per-segment-final"),
    "",
    "추가 입력: 이번 호출은 per-segment final extraction이다.",
    "전체 영상 중 아래 target candidate 하나만 레시피 JSON으로 만든다.",
    "",
    "target candidate:",
    `- segmentId: ${segmentEntry.segmentId}`,
    `- candidateId: ${segmentEntry.candidateId}`,
    `- titleHint: ${segmentEntry.titleHint}`,
    `- candidateStatus: ${segmentEntry.candidateStatus}`,
    `- evidenceStrength: ${segmentEntry.evidenceStrength}`,
    `- outputRole: ${segmentEntry.outputRole ?? "recipe"}`,
    `- time: ${segmentEntry.startSec}-${segmentEntry.endSec}`,
    `- textEvidence: ${segmentEntry.textEvidence?.length ? segmentEntry.textEvidence.join(" / ") : "(없음)"}`,
    "",
    "per-segment final 규칙:",
    "1. recipes[]에는 target candidate 하나만 출력한다.",
    "1-1. recipes[0].title은 반드시 위 target candidate의 titleHint 문자열과 완전히 같아야 한다. 번역, 축약, 오타 수정, 설명 단어 추가, 더 자연스러운 제목 만들기를 하지 않는다.",
    "2. 다른 segment/candidate의 재료, 소스, 고명, 단계는 가져오지 않는다.",
    "2-1. visual ledger의 색/모양 단서나 generic 재료가 target source text에 없고 target frame에서도 직접 투입 장면이 약하면 ingredients로 승격하지 않는다. 필요한 경우 source_note에 불확실성만 남긴다.",
    "3. 설명란/댓글/자막/발화에 명시된 재료명과 수량은 화면 추정보다 우선한다.",
    "4. 화면에서만 보이는 수량은 amountBasis를 visual-estimate로 둔다.",
    "5. 첨부 프레임에서 보이지 않고 텍스트에도 없는 재료나 단계를 요리 상식으로 추가하지 않는다.",
    "6. '초록색 줄기채소', '노란색 긴 재료' 같은 추상 이름은 최후의 수단이다. 제목, 자막, 설명란, 화면 자막을 다시 확인해 실제 재료명을 우선한다.",
    "7. 계란물·전분·튀김옷 코팅, 별도 팬 조리, 향채 볶음, 양념 베이스, 물/수분 투입, 참기름·깨·고명·삶은 계란 같은 짧은 장면도 target 구간이면 반영한다.",
    "8. sourceCuePacket과 Recipe evidence ledger는 정답지가 아니라 target 근거 체크리스트다. basis=source 항목에 구체 재료명, 양념명, 조리 동작이 있으면 visual ledger보다 우선한다.",
    "8-1. source text나 Recipe evidence ledger에 '볶지 않고', '튀기지 않고', '끓이지 않고', '굽지 않고'처럼 특정 조리 동작을 하지 말라는 표현이 있으면, visual/selector 추정만으로 그 반대 동작을 steps에 쓰지 않는다.",
    "8-2. source concrete name preservation rule: sourceCuePacket/Recipe evidence ledger/target source text가 구체 재료명이나 양념명을 주면, visual ledger의 generic observed 또는 uncertain 표현 때문에 그 이름을 삭제하거나 약한 이름으로 바꾸지 않는다. 예: 열무김치->열무, 동치미 육수->국물, 마늘쫑->초록 재료, 연어/달걀말이->색깔 속재료로 약화하지 않는다.",
    "9. visual ledger의 색·모양·질감 단서를 source 근거 없이 구체 재료명으로 확정하지 않는다. visual ledger는 source 신호를 지우거나 다른 재료로 바꾸는 근거가 아니다.",
    "9-1. visual uncertainty is not a veto: visual ledger uncertainties는 source 구체명을 제거하라는 뜻이 아니다. source 근거가 강하면 amount를 null 또는 visual-estimate로 두더라도 구체 재료명과 source_note를 보존한다.",
    "10. 작은 양념/향미 베이스가 보이면 생략하지 않는다. 정확한 재료명이 불확실하면 '매운 양념 베이스', '크림/마요 베이스', '향미 베이스' 같은 generic 표현을 쓰고 amountBasis는 visual-estimate 또는 null로 둔다.",
    "11. 해산물/조개/새우/오징어/생선 단서가 있으면 고기류로 바꾸지 않는다. 불확실하면 '해산물로 보이는 재료'처럼 보수적으로 적는다.",
    "12. 국물/소스 액체가 보이면 물/육수/면수/소스액 중 보수적인 이름을 ingredients에 넣고, 액체 베이스를 만드는 단계를 분리한다.",
    "12-1. protein species guard: target source text, 화면 자막, 포장 라벨이 소고기/돼지고기/닭고기처럼 축종을 직접 주지 않으면 visual-only 관찰만으로 축종을 확정하지 않는다. 이때는 고기, 고기류, 단백질 재료처럼 보수적으로 쓴다.",
    "12-2. liquid heat guard: 국물/육수/소스 액체가 보인다는 사실만으로 끓임/데움 단계를 만들지 않는다. 냄비, 불, 기포, 김, source의 끓임 동사가 target 근거에 있을 때만 끓인다/데운다를 쓴다.",
    "13. 붉은 소스/국물과 고추/볶이/해장/매운 단서가 함께 있으면 '매운 양념 베이스'를 generic하게 남긴다.",
    "14. 하얀 크림성 재료, 마요/크림형 베이스, 꾸덕한 치즈/크림 질감이 보이면 삭제하지 않는다. 이름이 불확실하면 '크림/마요 베이스'처럼 generic하게 남긴다.",
    "15. 여러 공정을 한 단계에 압축하지 않는다. 손질, 밑간, 향미 베이스, 소스/국물, 주재료 투입, 마무리는 가능하면 분리한다.",
    "16. 요리명에 들어간 형식 단어를 재료로 자동 확정하지 않는다. 김밥이면 김 시트가 보일 때만 김을 추가한다. 다만 source text나 title hint가 구체 재료 정체성을 주면 그 정체성은 유지한다.",
    "17. wrapper uncertainty guard: visual ledger나 uncertainties에 바깥층, 피, wrapper, 김, 어묵, 전, 또띠아 같은 감싸는 재료가 불확실하다고 있으면 ingredients에 구체 wrapper를 넣지 않는다.",
    "18. Recipe must-consider facts가 있으면 target final 직전 누락 점검표로 사용한다. 핵심 재료, 양념 베이스, 액체/국물, 조리 전환이 빠지지 않았는지 확인한다.",
    "19. bridge facts는 제목과 화면 단서가 함께 맞을 때만 쓰는 보조 단서다. 제목만으로 재료를 추가하지 말고, 화면/source가 확인한 재료와 단계만 출력한다.",
    "19-1. shared segment ownership guard: 같은 시간대에 둘 이상의 recipe가 붙어 있으면 현재 candidate의 sourceCuePacket, target selected frames, Recipe evidence ledger에 직접 연결된 재료만 현재 recipe에 넣는다. 다른 candidate title/sourceCuePacket에서만 강한 재료, 고명, 플레이팅은 가져오지 않는다.",
    `20. per-segment base source strip(${PER_SEGMENT_BASE_SOURCE_STRIP_VERSION}): 위 base prompt의 전체 텍스트 소스는 제거됐고, 아래 '텍스트 소스 원문 재확인'에는 target 시간창으로 필터링된 source만 있다.`,
    `20-1. visual ledger source-mention filter(${PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION}): final input에서 non-visual source-derived wording은 제거됐다. 남은 visual ledger는 화면 관찰 보조 단서로만 쓴다.`,
    "21. 출력은 기존 스키마의 JSON만 한다. 설명 문장은 JSON 밖에 쓰지 않는다.",
    "",
    "target selected frames:",
    ...selectedFrames.map((frame, index) => `- ${index + 1}. file=${frame.file}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, frameReason=${frame.reason ?? "unknown"}, selectionReason=${frame.selectionReason ?? "unknown"}`),
    ...(sourceCuePacket ? [
      "",
      formatSourceCuePacket(sourceCuePacket),
    ] : []),
    ...(recipeEvidenceLedgerPrompt ? [
      "",
      recipeEvidenceLedgerPrompt,
    ] : []),
    ...(visualFrameLedgerPrompt ? [
      "",
      visualFrameLedgerPrompt,
    ] : []),
    ...(recipeMustConsiderFactsPrompt ? [
      "",
      recipeMustConsiderFactsPrompt,
    ] : []),
    "",
    "텍스트 소스 원문 재확인:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "위 target candidate 하나에 대해서만 { \"recipes\": [ ... ] } JSON을 출력한다.",
  ].join("\n");
}

async function runPerSegmentFinalExtraction({
  prompt,
  sourceText,
  resultDir,
  model,
  codexExec,
  options,
  timeoutMs,
  finalInputSegmentKeyframes,
  finalSelectedFramesWithSegment,
  sourceCuePacketPlan,
  recipeEvidenceLedgerPlan,
  visualFrameLedgerPlan,
  recipeMustConsiderFactsPlan,
}) {
  const recipes = [];
  const results = [];
  const perSegmentPrompts = [];

  for (const segmentEntry of finalInputSegmentKeyframes.segments) {
    const outputRole = segmentEntry.outputRole ?? "recipe";
    if (outputRole !== "recipe") continue;

    const segmentFramesWithMeta = finalSelectedFramesWithSegment.filter(({ segment }) => segment.segmentId === segmentEntry.segmentId);
    const selectedFramesForPrompt = segmentEntry.selectedFrames ?? [];
    const segmentFrames = dedupeFrames(segmentFramesWithMeta.map((entry) => entry.frame));
    const sourceTimeWindow = selectedFrameTimeWindow(selectedFramesForPrompt);
    const targetSourceTextResult = targetSourceTextForPerSegment(sourceText, sourceTimeWindow);
    const sourceCueFilterResult = filterSourceCuePacketForTimeWindow(
      sourceCuePacketPlanForCandidate(sourceCuePacketPlan, segmentEntry.candidateId),
      sourceTimeWindow,
    );
    const evidenceLedgerFilterResult = filterRecipeEvidenceLedgerForTimeWindow(
      recipeEvidenceLedgerForCandidate(recipeEvidenceLedgerPlan, segmentEntry.candidateId),
      sourceTimeWindow,
    );
    const mustConsiderFilterResult = filterRecipeMustConsiderFactsForTimeWindow(
      recipeMustConsiderFactsForCandidate(recipeMustConsiderFactsPlan, segmentEntry.candidateId),
      sourceTimeWindow,
    );
    const visualLedgerSourceMentionFilterResult = filterVisualFrameLedgerSourceMentionsForPrompt(
      visualFrameLedgerForCandidate(visualFrameLedgerPlan, segmentEntry.candidateId),
    );
    const mustConsiderSourceMentionFilterResult = filterRecipeMustConsiderSourceMentionsForPrompt(
      mustConsiderFilterResult.facts,
    );
    const artifactId = safeArtifactId(segmentEntry.segmentId);
    const segmentPrompt = buildPerSegmentFinalPrompt({
      prompt,
      sourceText: targetSourceTextResult.text,
      segmentEntry,
      selectedFrames: selectedFramesForPrompt,
      sourceCuePacketPlan: sourceCueFilterResult.packet,
      recipeEvidenceLedger: evidenceLedgerFilterResult.ledger,
      visualFrameLedger: visualLedgerSourceMentionFilterResult.ledger,
      recipeMustConsiderFacts: mustConsiderSourceMentionFilterResult.facts,
    });
    const segmentPromptPath = path.join(resultDir, `final-${artifactId}.prompt.md`);
    const segmentRawPath = path.join(resultDir, `final-${artifactId}.raw.md`);
    const segmentLogPath = path.join(resultDir, `final-${artifactId}.log`);
    const segmentJsonPath = path.join(resultDir, `final-${artifactId}.json`);
    await writeFile(segmentPromptPath, segmentPrompt, "utf8");

    const segmentRaw = await codexExec({
      prompt: segmentPrompt,
      images: segmentFrames.map((frame) => frame.path),
      model,
      codexEffort: options.codexEffort,
      outputPath: segmentRawPath,
      logPath: segmentLogPath,
      timeoutMs,
    });
    await writeFile(segmentRawPath, segmentRaw, "utf8");

    const parsedSegmentJson = extractJsonFromText(segmentRaw);
    const normalizedSegmentJson = normalizePerSegmentRecipeTitle(parsedSegmentJson, segmentEntry);
    const segmentJson = normalizedSegmentJson.json;
    if (!isObject(segmentJson) || !Array.isArray(segmentJson.recipes)) {
      throw new Error(`Codex Vision keyframes per-segment final JSON은 ${segmentEntry.segmentId}에서 { recipes: [...] } 형식이어야 합니다.`);
    }
    if (segmentJson.recipes.length === 0) {
      throw new Error(`Codex Vision keyframes per-segment final이 ${segmentEntry.segmentId}(${segmentEntry.titleHint}) 레시피를 비워 반환했습니다.`);
    }

    recipes.push(...segmentJson.recipes);
    const summary = {
      segmentId: segmentEntry.segmentId,
      candidateId: segmentEntry.candidateId,
      titleHint: segmentEntry.titleHint,
      imageCount: segmentFrames.length,
      recipeCount: segmentJson.recipes.length,
      promptPath: path.basename(segmentPromptPath),
      rawPath: path.basename(segmentRawPath),
      logPath: path.basename(segmentLogPath),
      jsonPath: path.basename(segmentJsonPath),
      perSegmentTitleNormalizationVersion: PER_SEGMENT_TITLE_NORMALIZATION_VERSION,
      titleNormalized: normalizedSegmentJson.titleNormalized,
      titleBeforeNormalization: normalizedSegmentJson.titleBeforeNormalization,
      sourceTimeFilterVersion: PER_SEGMENT_SOURCE_TIME_FILTER_VERSION,
      sourceTimeFilterWindow: sourceTimeWindow,
      sourceTimeFilterDroppedCount: (
        sourceCueFilterResult.droppedCount
        + evidenceLedgerFilterResult.droppedCount
        + mustConsiderFilterResult.droppedCount
        + targetSourceTextResult.droppedLineCount
      ),
      perSegmentBaseSourceStripVersion: PER_SEGMENT_BASE_SOURCE_STRIP_VERSION,
      visualLedgerSourceMentionFilterVersion: PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION,
      visualLedgerSourceMentionDroppedCount: visualLedgerSourceMentionFilterResult.droppedCount,
      recipeMustConsiderSourceMentionDroppedCount: mustConsiderSourceMentionFilterResult.droppedCount,
      sourceTimeFilterDroppedSourceTextLineCount: targetSourceTextResult.droppedLineCount,
    };
    results.push(summary);
    perSegmentPrompts.push(`- ${segmentEntry.segmentId} / ${segmentEntry.candidateId} / ${segmentEntry.titleHint}: ${path.basename(segmentPromptPath)}`);
    await writeFile(segmentJsonPath, JSON.stringify({
      ...summary,
      json: segmentJson,
    }, null, 2) + "\n", "utf8");
  }

  const json = { recipes };
  const finalPrompt = [
    "per-segment final extraction aggregate",
    "각 recipe segment별 prompt/raw/log/json 파일을 별도로 저장했다.",
    "",
    "segment prompts:",
    ...(perSegmentPrompts.length ? perSegmentPrompts : ["- (없음)"]),
  ].join("\n");
  const finalRaw = JSON.stringify(json, null, 2);
  await writeFile(path.join(resultDir, "final.prompt.md"), finalPrompt, "utf8");
  await writeFile(path.join(resultDir, "final.raw.md"), finalRaw + "\n", "utf8");
  await writeFile(path.join(resultDir, "final.log"), `per-segment final calls: ${results.length}\n`, "utf8");

  return {
    json,
    finalModeMeta: {
      perSegmentFinalCount: results.length,
      perSegmentTitleNormalizationVersion: PER_SEGMENT_TITLE_NORMALIZATION_VERSION,
      perSegmentTitleNormalizedCount: results.filter((result) => result.titleNormalized).length,
      perSegmentSourceTimeFilterVersion: PER_SEGMENT_SOURCE_TIME_FILTER_VERSION,
      perSegmentSourceTimeFilterDroppedCount: results.reduce((sum, result) => sum + (result.sourceTimeFilterDroppedCount ?? 0), 0),
      perSegmentBaseSourceStripVersion: PER_SEGMENT_BASE_SOURCE_STRIP_VERSION,
      perSegmentVisualLedgerSourceMentionFilterVersion: PER_SEGMENT_VISUAL_LEDGER_SOURCE_MENTION_FILTER_VERSION,
      perSegmentVisualLedgerSourceMentionDroppedCount: results.reduce((sum, result) => sum + (result.visualLedgerSourceMentionDroppedCount ?? 0), 0),
      perSegmentRecipeMustConsiderSourceMentionDroppedCount: results.reduce((sum, result) => sum + (result.recipeMustConsiderSourceMentionDroppedCount ?? 0), 0),
      perSegmentFinalResults: results,
    },
  };
}

function buildVisualFrameLedgerPrompt({
  sourceText,
  finalInputSegmentKeyframes,
  sourceCuePacketPlan = null,
  recipeEvidenceLedger = null,
}) {
  const sourceCuePacketByCandidate = new Map(
    Array.isArray(sourceCuePacketPlan?.packets)
      ? sourceCuePacketPlan.packets.map((packet) => [packet.candidateId, packet])
      : [],
  );
  const segmentBlocks = (finalInputSegmentKeyframes?.segments ?? []).map((segment) => {
    const sourceCuePacket = sourceCuePacketByCandidate.get(segment.candidateId);
    return [
      `[SEGMENT ${segment.segmentId}]`,
      `candidateId: ${segment.candidateId}`,
      `titleHint: ${segment.titleHint}`,
      `time: ${segment.startSec}-${segment.endSec}`,
      `textEvidence: ${segment.textEvidence?.length ? segment.textEvidence.join(" / ") : "(없음)"}`,
      ...(sourceCuePacket ? ["", formatSourceCuePacket(sourceCuePacket)] : []),
      "selectedFrames:",
      ...(segment.selectedFrames ?? []).map((frame, index) => `- ${index + 1}. frameFile=${frame.file}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, selectionReason=${frame.selectionReason ?? "unknown"}`),
    ].join("\n");
  }).join("\n\n");
  const recipeEvidenceLedgerPrompt = formatRecipeEvidenceLedgerPrompt(recipeEvidenceLedger);

  return [
    "너는 요리 영상의 선택 프레임을 읽어 최종 레시피 추출용 visual frame ledger를 만드는 담당자다.",
    "레시피 JSON을 만들지 말고, 첨부 이미지에서 보이는 재료와 조리 상태를 레시피 후보별로 짧게 관찰한다.",
    "",
    ...modelSourceBoundaryLines("visual-frame-ledger"),
    ...visualIdentityGuardLines("visual-frame-ledger"),
    "",
    "중요 규칙:",
    "1. 로컬 정답지와 이전 채점 결과를 보지 않는다.",
    "2. 화면에 보이지 않고 source text에도 없는 재료를 요리 상식으로 추가하지 않는다.",
    "3. 확실하지 않은 재료는 observedIngredients가 아니라 uncertainties에 둔다.",
    "4. 소스/국물/양념의 색, 농도, 끓는 상태, 재료 투입 전후 변화는 sauceBrothSeasoningCues에 적는다.",
    "5. '초록색 재료', '노란색 긴 재료', '넓적한 재료'처럼 추상 이름이 필요하면 uncertainties에 적고, 실제 재료명으로 단정하지 않는다.",
    "6. source text나 Recipe evidence ledger가 명명한 재료·양념·조리 동작을 visual 관찰만으로 지우거나 다른 재료로 바꾸지 않는다.",
    "7. 소량의 향미 베이스도 관찰한다. 흰색/크림형 소스, 다진 향채, 붉은 가루·장·기름, 갈색 액체, 향미유가 보이면 sauceBrothSeasoningCues에 남긴다.",
    "8. 해산물/조개/새우/오징어/생선으로 보이는 단백질 단서는 observedIngredients 또는 uncertainties에 그 정체성을 보존한다. 고기류로 바꾸지 않는다.",
    "9. protein species guard: 포장 라벨, 화면 자막, source text가 소고기/돼지고기/닭고기처럼 축종을 직접 주지 않으면 색이나 모양만으로 특정 축종을 observedIngredients에 확정하지 않는다. 이때는 고기, 고기류, 단백질 재료처럼 보수적으로 적고 uncertainties에 남긴다.",
    "10. 국물/소스 액체, 물/육수/면수, 묽어지는 흐름, 졸임 액체가 보이면 sauceBrothSeasoningCues에 남긴다.",
    "11. liquid heat guard: 국물/육수/소스 액체가 보인다는 사실만으로 끓임이나 데움 상태를 확정하지 않는다. 냄비, 불, 기포, 김, source의 끓임 동사가 보일 때만 heated/boiling 단서로 적고, 아니면 단순 액체/국물로 둔다.",
    "12. 완성샷보다 재료 투입, 볶기, 소스/국물 형성 같은 조리 전환 프레임을 keyFrameFiles에 우선 넣는다. 단, 끓임 프레임은 liquid heat guard를 통과할 때만 고른다.",
    "13. 요리명에 들어간 형식 단어를 재료로 자동 확정하지 않는다. 예: 김밥이라고 해서 김을 넣지 말고, 김 시트가 실제로 보이는지 확인한다.",
    "14. 파스타, 치즈, 꼬치 같은 title token도 화면/source 근거가 있을 때만 observedIngredients에 넣는다.",
    "15. 각 output recipe candidate마다 recipes[] 항목을 하나씩 만든다.",
    "14. 출력은 설명 없이 JSON만 한다.",
    "",
    "출력 스키마:",
    "{",
    "  \"recipes\": [",
    "    {",
    "      \"candidateId\": \"cand-01\",",
    "      \"titleHint\": \"해장파스타\",",
    "      \"segmentIds\": [\"seg-01\"],",
    "      \"observedIngredients\": [\"스파게티면\", \"해산물\"],",
    "      \"cookingTransitions\": [\"면을 삶음\", \"붉은 국물 베이스에 재료가 합쳐짐\"],",
    "      \"sauceBrothSeasoningCues\": [\"붉은 국물\", \"소스와 물이 섞인 상태\"],",
    "      \"keyFrameFiles\": [\"frame_0097_00472.215.jpg\", \"frame_0100_00486.972.jpg\"],",
    "      \"uncertainties\": [\"정확한 고추 종류는 화면만으로 불확실\"]",
    "    }",
    "  ],",
    "  \"warnings\": []",
    "}",
    "",
    "segment별 선택 프레임 목록:",
    segmentBlocks || "(없음)",
    ...(recipeEvidenceLedgerPrompt ? [
      "",
      recipeEvidenceLedgerPrompt,
    ] : []),
    "",
    "텍스트 소스 원문:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "위 segment별 선택 프레임과 첨부 이미지만 근거로 JSON만 출력한다.",
  ].join("\n");
}

async function runVisualFrameLedgerPass({
  sourceText,
  resultDir,
  segmentModel,
  codexExec,
  options,
  timeoutMs,
  finalInputSegmentKeyframes,
  finalSelectedFrames,
  sourceCuePacketPlan,
  recipeEvidenceLedgerPlan,
  batchSize = 0,
}) {
  const ledgerPrompt = buildVisualFrameLedgerPrompt({
    sourceText,
    finalInputSegmentKeyframes,
    sourceCuePacketPlan,
    recipeEvidenceLedger: recipeEvidenceLedgerPlan,
  });
  const ledgerPromptPath = path.join(resultDir, "visual-frame-ledger.prompt.md");
  const ledgerRawPath = path.join(resultDir, "visual-frame-ledger.raw.md");
  const ledgerLogPath = path.join(resultDir, "visual-frame-ledger.log");
  const ledgerJsonPath = path.join(resultDir, "visual-frame-ledger.json");
  if (!options.noCache && existsSync(ledgerJsonPath)) {
    return JSON.parse(await readFile(ledgerJsonPath, "utf8"));
  }
  await writeFile(ledgerPromptPath, ledgerPrompt, "utf8");

  if (batchSize > 0) {
    const batchLedgers = [];
    const segments = finalInputSegmentKeyframes?.segments ?? [];
    const ledgerCallTimeoutMs = visualFrameLedgerTimeoutMs(timeoutMs);
    for (let index = 0; index < segments.length; index += batchSize) {
      const batchNo = Math.floor(index / batchSize) + 1;
      const batchSegments = segments.slice(index, index + batchSize);
      const batchCandidateIdSet = batchCandidateIds(batchSegments);
      const batchSourceCuePacketPlan = filterSourceCuePacketPlanForCandidates(sourceCuePacketPlan, batchCandidateIdSet);
      const batchRecipeEvidenceLedgerPlan = filterRecipeEvidenceLedgerForCandidates(recipeEvidenceLedgerPlan, batchCandidateIdSet);
      const batchKey = `visual-frame-ledger.batch-${String(batchNo).padStart(2, "0")}`;
      const batchSegmentKeyframes = {
        ...finalInputSegmentKeyframes,
        segments: batchSegments,
      };
      const batchPrompt = buildVisualFrameLedgerPrompt({
        sourceText: buildVisualLedgerBatchSourceText(batchSegments),
        finalInputSegmentKeyframes: batchSegmentKeyframes,
        sourceCuePacketPlan: batchSourceCuePacketPlan,
        recipeEvidenceLedger: batchRecipeEvidenceLedgerPlan,
      });
      const batchPromptPath = path.join(resultDir, `${batchKey}.prompt.md`);
      const batchRawPath = path.join(resultDir, `${batchKey}.raw.md`);
      const batchLogPath = path.join(resultDir, `${batchKey}.log`);
      const batchJsonPath = path.join(resultDir, `${batchKey}.json`);
      const batchFailurePath = path.join(resultDir, `${batchKey}.failure.json`);
      await writeFile(batchPromptPath, batchPrompt, "utf8");

      let batchLedger;
      if (!options.noCache && existsSync(batchJsonPath)) {
        batchLedger = JSON.parse(await readFile(batchJsonPath, "utf8"));
      } else {
        try {
          const recoveredBatch = (!options.noCache && !options.refreshFinal)
            ? await readRecoveredVisualFrameLedger(batchRawPath, batchSegmentKeyframes)
            : null;
          if (recoveredBatch) {
            batchLedger = recoveredBatch;
          } else {
            const batchFrames = selectedFramesForLedgerSegments(finalSelectedFrames, batchSegments);
            const batchRaw = await codexExec({
              prompt: batchPrompt,
              images: batchFrames.map((frame) => frame.path),
              model: segmentModel,
              codexEffort: options.segmentEffort ?? options.selectorEffort ?? options.codexEffort,
              outputPath: batchRawPath,
              logPath: batchLogPath,
              timeoutMs: ledgerCallTimeoutMs,
            });
            await writeFile(batchRawPath, batchRaw, "utf8");
            const rawBatchLedger = extractJsonFromTextWithClosureRepair(batchRaw);
            batchLedger = normalizeVisualFrameLedger(rawBatchLedger, batchSegmentKeyframes);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await writeVisualFrameLedgerFailureArtifact(batchFailurePath, {
            batchKey,
            batchNo,
            batchSize,
            skipped: false,
            reason: "visual_frame_ledger_batch_failed",
            candidateIds: [...batchCandidateIdSet],
            message,
            stack: error instanceof Error ? error.stack : undefined,
            promptPath: path.basename(batchPromptPath),
            rawPath: path.basename(batchRawPath),
            logPath: path.basename(batchLogPath),
          });
          batchLedger = emptyVisualFrameLedger(batchSegmentKeyframes, `${batchKey} failed: ${message}`, {
            batchMode: true,
            batchSize,
            batchCount: 1,
            fallbackVersion: VISUAL_FRAME_LEDGER_FALLBACK_VERSION,
            callTimeoutMs: ledgerCallTimeoutMs,
            partialFailureCount: 1,
          });
        }
        await writeFile(batchJsonPath, JSON.stringify(batchLedger, null, 2) + "\n", "utf8");
      }
      batchLedgers.push(batchLedger);
    }

    const mergedLedger = mergeVisualFrameLedgers(batchLedgers, finalInputSegmentKeyframes, { batchSize });
    await writeFile(ledgerJsonPath, JSON.stringify(mergedLedger, null, 2) + "\n", "utf8");
    return mergedLedger;
  }

  const recoveredLedger = (!options.noCache && !options.refreshFinal)
    ? await readRecoveredVisualFrameLedger(ledgerRawPath, finalInputSegmentKeyframes)
    : null;
  if (recoveredLedger) {
    await writeFile(ledgerJsonPath, JSON.stringify(recoveredLedger, null, 2) + "\n", "utf8");
    return recoveredLedger;
  }

  const ledgerRaw = await codexExec({
    prompt: ledgerPrompt,
    images: finalSelectedFrames.map((frame) => frame.path),
    model: segmentModel,
    codexEffort: options.segmentEffort ?? options.selectorEffort ?? options.codexEffort,
    outputPath: ledgerRawPath,
    logPath: ledgerLogPath,
    timeoutMs: visualFrameLedgerTimeoutMs(timeoutMs),
  }).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await writeVisualFrameLedgerFailureArtifact(path.join(resultDir, "visual-frame-ledger.failure.json"), {
      skipped: false,
      reason: "visual_frame_ledger_failed",
      message,
      stack: error instanceof Error ? error.stack : undefined,
      promptPath: path.basename(ledgerPromptPath),
      rawPath: path.basename(ledgerRawPath),
      logPath: path.basename(ledgerLogPath),
    });
    return null;
  });
  if (ledgerRaw === null) {
    const ledger = emptyVisualFrameLedger(finalInputSegmentKeyframes, "visual-frame-ledger failed and was replaced by empty fallback ledger", {
      fallbackVersion: VISUAL_FRAME_LEDGER_FALLBACK_VERSION,
      callTimeoutMs: visualFrameLedgerTimeoutMs(timeoutMs),
      partialFailureCount: 1,
    });
    await writeFile(ledgerJsonPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
    return ledger;
  }
  await writeFile(ledgerRawPath, ledgerRaw, "utf8");

  let ledger;
  try {
    const rawLedger = extractJsonFromTextWithClosureRepair(ledgerRaw);
    ledger = normalizeVisualFrameLedger(rawLedger, finalInputSegmentKeyframes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeVisualFrameLedgerFailureArtifact(path.join(resultDir, "visual-frame-ledger.failure.json"), {
      skipped: false,
      reason: "visual_frame_ledger_parse_failed",
      message,
      stack: error instanceof Error ? error.stack : undefined,
      promptPath: path.basename(ledgerPromptPath),
      rawPath: path.basename(ledgerRawPath),
      logPath: path.basename(ledgerLogPath),
    });
    ledger = emptyVisualFrameLedger(finalInputSegmentKeyframes, `visual-frame-ledger parse failed: ${message}`, {
      fallbackVersion: VISUAL_FRAME_LEDGER_FALLBACK_VERSION,
      callTimeoutMs: visualFrameLedgerTimeoutMs(timeoutMs),
      partialFailureCount: 1,
    });
  }
  await writeFile(ledgerJsonPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  return ledger;
}

function buildSegmentedRepairPrompt({
  sourceText,
  currentJson,
  candidatePlan,
  segmentPlan,
  finalInputSegmentKeyframes,
  sourceCuePacketPlan = null,
  recipeEvidenceLedger = null,
  visualFrameLedger = null,
  recipeMustConsiderFacts = null,
}) {
  const outputCandidateLines = (segmentPlan.coverage ?? [])
    .filter((entry) => entry.status === "covered" && (entry.outputRole ?? "recipe") === "recipe")
    .map((entry) => `- ${entry.candidateId}: titleHint=${entry.titleHint}, segments=[${entry.segmentIds?.join(", ") || "(없음)"}]`);
  const sourceCueBlocks = (sourceCuePacketPlan?.packets ?? [])
    .map(formatSourceCuePacket)
    .join("\n\n");
  const recipeEvidenceLedgerPrompt = formatRecipeEvidenceLedgerPrompt(recipeEvidenceLedger);
  const visualFrameLedgerPrompt = formatVisualFrameLedgerPrompt(visualFrameLedger);
  const recipeMustConsiderFactsPrompt = formatRecipeMustConsiderFactsPrompt(recipeMustConsiderFacts);
  const segmentBlocks = (finalInputSegmentKeyframes.segments ?? [])
    .map((entry) => [
      `[SEGMENT ${entry.segmentId}]`,
      `candidateId: ${entry.candidateId}`,
      `titleHint: ${entry.titleHint}`,
      `outputRole: ${entry.outputRole ?? "recipe"}`,
      `time: ${entry.startSec}-${entry.endSec}`,
      `textEvidence: ${entry.textEvidence?.length ? entry.textEvidence.join(" / ") : "(없음)"}`,
      "selectedFrames:",
      ...(entry.selectedFrames ?? []).map((frame, index) => `- ${index + 1}. file=${frame.file}, timestamp=${frame.timestamp ?? frame.timestamp_sec ?? "?"}, frameReason=${frame.reason ?? "unknown"}, selectionReason=${frame.selectionReason ?? "unknown"}`),
    ].join("\n"))
    .join("\n\n");

  return [
    "너는 요리 영상 레시피 추출 결과를 보수적으로 고치는 source-gap repair pass다.",
    ...modelSourceBoundaryLines("segmented-repair"),
    ...onscreenTextPriorityLines("segmented-repair"),
    ...visualIdentityGuardLines("segmented-repair"),
    "",
    "이미 만든 combined final JSON을 완전히 새로 쓰지 말고, sourceCuePacket, Recipe evidence ledger, selected frames, source text와 대조해 명확히 빠진 재료/단계만 고친다.",
    "",
    "핵심 규칙:",
    "1. recipe 수를 바꾸지 않는다.",
    "2. 새 recipe를 만들지 않는다.",
    "3. recipe title은 명백히 틀린 경우가 아니면 유지한다.",
    "4. sourceCuePacket, Recipe evidence ledger, selected frames, source text 중 최소 하나에 근거가 있을 때만 재료/단계를 추가하거나 수정한다.",
    "4-1. source text나 Recipe evidence ledger에 '볶지 않고', '튀기지 않고', '끓이지 않고', '굽지 않고'처럼 특정 조리 동작을 하지 말라는 표현이 있으면, visual/selector 추정만으로 그 반대 동작을 patch하지 않는다.",
    "5. 요리 상식만으로 재료, 수량, 단계를 추가하지 않는다.",
    "6. 확실하지 않은 수량은 기존 값을 유지하거나, 화면 근거만 있으면 amountBasis를 visual-estimate로 둔다.",
    "7. 이미 충분히 맞는 recipe는 건드리지 않는다.",
    "8. 특히 밑간, 유지류, 양념 베이스, 물/수분, 채소/사리, 국물/소스 베이스, 크림/마요 베이스, 마무리 고명 누락만 점검한다.",
    "9. selected frame의 화면 자막/오버레이 글자에 구체 재료명·양념명·조리 동작이 보이면 누락 점검 대상으로 본다.",
    "10. Recipe must-consider facts가 있으면 누락 점검표로 사용하되, 근거가 약한 항목은 과확정하지 않는다.",
    "11. bridge facts는 제목과 화면 단서가 함께 맞을 때만 쓰는 보조 단서다. 제목만으로 patch를 만들지 않는다.",
    "12. wrapper uncertainty guard: visual ledger나 uncertainties가 wrapper를 불확실하다고 표시하면 납작어묵, 김, 피, 전 같은 구체 wrapper patch를 만들지 않는다.",
    "13. creamy/mayo base preservation: 하얀 크림성 재료가 보이지만 이름이 불확실하면 삭제하지 말고 '크림/마요 베이스' 같은 generic patch만 허용한다.",
    "14. 출력은 기존 스키마의 { \"recipes\": [...] } JSON만 한다.",
    "",
    "Output recipe candidates:",
    ...(outputCandidateLines.length ? outputCandidateLines : ["- (없음)"]),
    "",
    "current combined final JSON:",
    JSON.stringify(currentJson, null, 2),
    "",
    "candidate hints JSON:",
    JSON.stringify(candidatePlan, null, 2),
    "",
    "Candidate coverage checklist:",
    JSON.stringify(segmentPlan.coverage ?? [], null, 2),
    "",
    "segment별 선택 프레임:",
    segmentBlocks || "(없음)",
    ...(sourceCueBlocks ? [
      "",
      "sourceCuePackets:",
      sourceCueBlocks,
    ] : []),
    ...(recipeEvidenceLedgerPrompt ? [
      "",
      recipeEvidenceLedgerPrompt,
    ] : []),
    ...(visualFrameLedgerPrompt ? [
      "",
      visualFrameLedgerPrompt,
    ] : []),
    ...(recipeMustConsiderFactsPrompt ? [
      "",
      recipeMustConsiderFactsPrompt,
    ] : []),
    "",
    "텍스트 소스 원문 재확인:",
    sourceText || "(텍스트 소스 없음)",
    "",
    "위 근거만 사용해 recipe 수를 유지한 { \"recipes\": [...] } JSON만 출력한다.",
  ].join("\n");
}

async function runSegmentedRepairPass({
  sourceText,
  resultDir,
  model,
  codexExec,
  options,
  timeoutMs,
  currentJson,
  candidatePlan,
  segmentPlan,
  finalInputSegmentKeyframes,
  finalSelectedFrames,
  sourceCuePacketPlan,
  recipeEvidenceLedgerPlan,
  visualFrameLedgerPlan,
  recipeMustConsiderFactsPlan,
}) {
  const repairPrompt = buildSegmentedRepairPrompt({
    sourceText,
    currentJson,
    candidatePlan,
    segmentPlan,
    finalInputSegmentKeyframes,
    sourceCuePacketPlan,
    recipeEvidenceLedger: recipeEvidenceLedgerPlan,
    visualFrameLedger: visualFrameLedgerPlan,
    recipeMustConsiderFacts: recipeMustConsiderFactsPlan,
  });
  const repairPromptPath = path.join(resultDir, "repair.prompt.md");
  const repairRawPath = path.join(resultDir, "repair.raw.md");
  const repairLogPath = path.join(resultDir, "repair.log");
  const repairJsonPath = path.join(resultDir, "repair.json");
  await writeFile(repairPromptPath, repairPrompt, "utf8");

  const repairRaw = await codexExec({
    prompt: repairPrompt,
    images: finalSelectedFrames.map((frame) => frame.path),
    model,
    codexEffort: options.codexEffort,
    outputPath: repairRawPath,
    logPath: repairLogPath,
    timeoutMs,
  });
  await writeFile(repairRawPath, repairRaw, "utf8");

  const repairedJson = extractJsonFromText(repairRaw);
  if (!isObject(repairedJson) || !Array.isArray(repairedJson.recipes)) {
    throw new Error("Codex Vision keyframes source-gap repair JSON은 { recipes: [...] } 형식이어야 합니다.");
  }
  const beforeCount = Array.isArray(currentJson.recipes) ? currentJson.recipes.length : 0;
  if (repairedJson.recipes.length !== beforeCount) {
    throw new Error(`Codex Vision keyframes source-gap repair가 recipe 수를 변경했습니다: ${beforeCount} -> ${repairedJson.recipes.length}`);
  }

  await writeFile(repairJsonPath, JSON.stringify({
    repairPromptVersion: SEGMENTED_REPAIR_PROMPT_VERSION,
    recipeCountBefore: beforeCount,
    recipeCountAfter: repairedJson.recipes.length,
    json: repairedJson,
  }, null, 2) + "\n", "utf8");

  return {
    json: repairedJson,
    repairMeta: {
      segmentedRepairApplied: true,
      segmentedRepairPromptVersion: SEGMENTED_REPAIR_PROMPT_VERSION,
      segmentedRepairRecipeCountBefore: beforeCount,
      segmentedRepairRecipeCountAfter: repairedJson.recipes.length,
    },
  };
}

function buildSegmentedRepairPatchPrompt({
  sourceText,
  currentJson,
  candidatePlan,
  segmentPlan,
  finalInputSegmentKeyframes,
  sourceCuePacketPlan = null,
  recipeEvidenceLedger = null,
  visualFrameLedger = null,
  recipeMustConsiderFacts = null,
  targeted = false,
  verified = false,
}) {
  const includeTargetedChecklist = targeted || verified;
  const base = buildSegmentedRepairPrompt({
    sourceText,
    currentJson,
    candidatePlan,
    segmentPlan,
    finalInputSegmentKeyframes,
    sourceCuePacketPlan,
    recipeEvidenceLedger,
    visualFrameLedger,
    recipeMustConsiderFacts,
  });
  return [
    "너는 요리 영상 레시피 추출 결과를 보수적으로 고치는 source-gap patch repair pass다.",
    ...modelSourceBoundaryLines("segmented-repair-patch"),
    ...onscreenTextPriorityLines("segmented-repair-patch"),
    ...visualIdentityGuardLines("segmented-repair-patch"),
    "",
    "중요: 최종 JSON 전체를 다시 쓰지 않는다. 작은 patch 목록만 출력한다.",
    "",
    "출력 스키마:",
    "{",
    "  \"patches\": [",
    "    {",
    "      \"recipeTitle\": \"요리 A\",",
    "      \"operation\": \"addIngredient\",",
    ...(includeTargetedChecklist ? ["      \"targetedGap\": \"missing-seasoning-base\","] : []),
    "      \"ingredient\": { \"name\": \"양파\", \"amount\": \"1\", \"unit\": \"개\", \"amountBasis\": \"visual-estimate\" },",
    "      \"evidence\": \"sourceCuePacket/ledger/selected frame의 구체 근거\",",
    ...(verified ? [
      "      \"evidenceSources\": [\"transcript\"],",
      "      \"directEvidenceQuote\": \"양파 1개\",",
      "      \"crossRecipeRisk\": false,",
    ] : []),
    "      \"confidence\": \"high\"",
    "    },",
    "    {",
    "      \"recipeTitle\": \"요리 A\",",
    "      \"operation\": \"addStepAfter\",",
    ...(includeTargetedChecklist ? ["      \"targetedGap\": \"missing-step-transition\","] : []),
    "      \"afterStepIndex\": 2,",
    "      \"step\": \"양념한 닭고기에 채소를 넣고 함께 볶는다.\",",
    "      \"evidence\": \"selected frame 또는 source text 근거\",",
    ...(verified ? [
      "      \"evidenceSources\": [\"selectedFrame\", \"transcript\"],",
      "      \"directEvidenceQuote\": \"채소를 넣고 볶는다\",",
      "      \"crossRecipeRisk\": false,",
    ] : []),
    "      \"confidence\": \"high\"",
    "    }",
    "  ]",
    "}",
    "",
    "patch 규칙:",
    "1. operation은 addIngredient, adjustAmount, addStepAfter, replaceStep 중 하나만 쓴다.",
    "2. afterStepIndex와 stepIndex는 0부터 시작하는 index다.",
    "3. confidence가 low이면 출력하지 않는다.",
    "4. evidence에는 sourceCuePacket, Recipe evidence ledger, selected frame, source text 중 어떤 근거인지 적는다.",
    "5. 확실한 근거가 없으면 patch를 만들지 않는다.",
    "6. 전체 patches는 최대 16개다.",
    "7. JSON 밖에 설명을 쓰지 않는다.",
    "8. zero-patch guard: Recipe must-consider facts/source facts/visual facts에 current JSON에 없는 구체 재료·양념·국물·조리 전환이 있고 근거가 high-confidence이면 빈 patches 대신 작은 patch를 출력한다.",
    "9. empty patches는 모든 source-backed/onscreen-backed missing fact가 이미 current JSON에 있거나 근거가 약한 경우에만 허용한다.",
    ...(verified ? [
      "",
      "verified evidence gate:",
      "- confidence는 high인 patch만 출력한다.",
      "- Recipe must-consider facts의 source facts는 visual facts보다 우선한다.",
      "- source facts에 재료명, 계량, 조리 동작이 직접 있으면 directEvidenceQuote에 그 짧은 문구를 옮기고 patch 후보로 본다.",
      "- evidenceSources에는 transcript, description, sourceCuePacket, ledger, selectedFrame, sourceText 중 실제 근거 출처만 적는다.",
      "- directEvidenceQuote에는 재료명이나 단계 핵심어가 직접 보이는 짧은 근거 문구를 적는다.",
      "- 다른 레시피에 속할 가능성이 있으면 crossRecipeRisk를 true로 두거나 patch를 만들지 않는다.",
      "- 재료 patch는 evidence/directEvidenceQuote에 재료명이 직접 없으면 만들지 않는다.",
      "- 단계 patch는 step의 핵심 재료나 핵심 동작이 evidence/directEvidenceQuote에 없으면 만들지 않는다.",
    ] : []),
    ...(includeTargetedChecklist ? [
      "",
      "low-confidence target checklist:",
      "- current JSON 재료 수가 적거나 sourceCuePacket/ledger에 있는 양념·소스·물·향채가 current JSON에 없으면 우선 patch 후보로 본다.",
      "- selected frame reason에 양념, 소스, 물, 국물, 향채, 밑간, 볶음, 끓임, 마무리 고명이 있는데 current JSON에 없으면 patch 후보로 본다.",
      "- 해장/국물/매운 요리 계열에서는 seasoning base, liquid/broth, aromatic, step transition을 특히 확인한다.",
      "- targetedGap은 missing-seasoning-base, missing-liquid-or-broth, missing-aromatic, missing-step-transition, missing-finishing, missing-amount 중 하나로 쓴다.",
      "- targetedGap이 있어도 evidence가 없으면 patch를 만들지 않는다.",
    ] : []),
    "",
    "참고 자료:",
    base,
    "",
    "위 자료를 보고 { \"patches\": [...] } JSON만 출력한다.",
  ].join("\n");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function patchEvidenceText(patch) {
  return compact(patch?.evidence ?? patch?.basis ?? patch?.reason ?? "");
}

function patchConfidence(patch) {
  return compact(patch?.confidence ?? "medium").toLowerCase();
}

function patchDirectEvidenceText(patch) {
  return compact(patch?.directEvidenceQuote ?? patch?.quote ?? patch?.sourceQuote ?? "");
}

function patchEvidenceSourceText(patch) {
  if (Array.isArray(patch?.evidenceSources)) {
    return patch.evidenceSources.map((source) => compact(source)).filter(Boolean).join(" ");
  }
  return compact(patch?.evidenceSource ?? patch?.source ?? "");
}

function patchCombinedEvidenceText(patch) {
  return compact([
    patchEvidenceText(patch),
    patchDirectEvidenceText(patch),
    patchEvidenceSourceText(patch),
  ].filter(Boolean).join(" "));
}

function patchHasCrossRecipeRisk(patch) {
  const value = patch?.crossRecipeRisk;
  if (value === true) return true;
  const normalized = compact(value).toLowerCase();
  return ["true", "yes", "high", "높음"].includes(normalized);
}

function normalizeEvidenceToken(value) {
  return keyOf(value).replace(KOREAN_PARTICLE_SUFFIX_RE, "");
}

function evidenceTokens(value) {
  return compact(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeEvidenceToken)
    .filter((token) => token.length >= 2 && !STEP_EVIDENCE_STOP_TOKENS.has(token));
}

function evidenceMentionsName(evidence, name) {
  const target = keyOf(name);
  if (!target) return false;
  const evidenceKey = keyOf(evidence);
  if (evidenceKey.includes(target)) return true;
  const normalizedTarget = normalizeEvidenceToken(name);
  return evidenceTokens(evidence).some((token) => token === normalizedTarget || token.includes(normalizedTarget) || normalizedTarget.includes(token));
}

function evidenceSupportsStep(evidence, step) {
  const evidenceKey = keyOf(evidence);
  return evidenceTokens(step).some((token) => evidenceKey.includes(token));
}

function verifiedPatchRejectReason(patch, operation) {
  const confidence = patchConfidence(patch);
  const evidence = patchCombinedEvidenceText(patch);
  if (confidence !== "high") return "verified_confidence_not_high";
  if (!evidence || evidence.length < 12) return "verified_evidence_too_short";
  if (SEGMENTED_REPAIR_WEAK_EVIDENCE_RE.test(evidence)) return "verified_weak_evidence_language";
  if (patchHasCrossRecipeRisk(patch)) return "verified_cross_recipe_risk";
  if (!SEGMENTED_REPAIR_VERIFIED_EVIDENCE_SOURCE_RE.test(evidence)) return "verified_missing_evidence_source";

  if (operation === "addIngredient") {
    const ingredientName = patch?.ingredient?.name;
    if (!evidenceMentionsName(evidence, ingredientName)) return "verified_ingredient_not_in_evidence";
  } else if (operation === "adjustAmount") {
    const ingredientName = patch?.ingredientName ?? patch?.name ?? patch?.ingredient?.name;
    if (!evidenceMentionsName(evidence, ingredientName)) return "verified_ingredient_not_in_evidence";
  } else if (operation === "addStepAfter" || operation === "replaceStep") {
    const step = patch?.step ?? patch?.replacementStep;
    if (!evidenceSupportsStep(evidence, step)) return "verified_step_not_supported_by_evidence";
  }

  return null;
}

function findRecipeForPatch(recipes, patch) {
  const targetKey = keyOf(patch?.recipeTitle ?? patch?.title ?? patch?.recipe ?? "");
  if (!targetKey) return null;
  return recipes.find((recipe) => {
    const titleKey = keyOf(recipe?.title ?? "");
    return titleKey === targetKey || titleKey.includes(targetKey) || targetKey.includes(titleKey);
  }) ?? null;
}

function hasIngredient(ingredients, name) {
  const targetKey = keyOf(name);
  if (!targetKey) return true;
  return ingredients.some((ingredient) => {
    const ingredientKey = keyOf(ingredient?.name ?? "");
    return ingredientKey === targetKey || ingredientKey.includes(targetKey) || targetKey.includes(ingredientKey);
  });
}

function hasStep(steps, step) {
  const targetKey = keyOf(step);
  if (!targetKey) return true;
  return steps.some((entry) => {
    const stepKey = keyOf(entry);
    return stepKey === targetKey || stepKey.includes(targetKey) || targetKey.includes(stepKey);
  });
}

function rejectPatch(rejected, patch, reason) {
  rejected.push({
    operation: patch?.operation ?? null,
    recipeTitle: patch?.recipeTitle ?? patch?.title ?? patch?.recipe ?? null,
    reason,
  });
}

function applySegmentedRepairPatches(currentJson, patchJson, { verified = false } = {}) {
  const nextJson = cloneJson(currentJson);
  const recipes = Array.isArray(nextJson.recipes) ? nextJson.recipes : [];
  const patches = (Array.isArray(patchJson?.patches) ? patchJson.patches : []).slice(0, SEGMENTED_REPAIR_PATCH_LIMIT);
  const applied = [];
  const rejected = [];

  for (const patch of patches) {
    if (!isObject(patch)) {
      rejectPatch(rejected, patch, "invalid_patch");
      continue;
    }
    const operation = compact(patch.operation);
    const evidence = patchEvidenceText(patch);
    const confidence = patchConfidence(patch);
    if (!evidence) {
      rejectPatch(rejected, patch, "missing_evidence");
      continue;
    }
    if (confidence === "low") {
      rejectPatch(rejected, patch, "low_confidence");
      continue;
    }
    const recipe = findRecipeForPatch(recipes, patch);
    if (!recipe) {
      rejectPatch(rejected, patch, "recipe_not_found");
      continue;
    }
    if (verified) {
      const verifiedRejectReason = verifiedPatchRejectReason(patch, operation);
      if (verifiedRejectReason) {
        rejectPatch(rejected, patch, verifiedRejectReason);
        continue;
      }
    }
    recipe.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    recipe.steps = Array.isArray(recipe.steps) ? recipe.steps : [];

    if (operation === "addIngredient") {
      const ingredient = patch.ingredient;
      if (!isObject(ingredient) || !compact(ingredient.name)) {
        rejectPatch(rejected, patch, "invalid_ingredient");
        continue;
      }
      if (hasIngredient(recipe.ingredients, ingredient.name)) {
        rejectPatch(rejected, patch, "duplicate_ingredient");
        continue;
      }
      recipe.ingredients.push({
        name: compact(ingredient.name),
        ...(ingredient.nameAliases ? { nameAliases: ingredient.nameAliases } : {}),
        amount: ingredient.amount ?? null,
        unit: ingredient.unit ?? null,
        amountBasis: ingredient.amountBasis ?? ingredient.basis ?? null,
        optional: Boolean(ingredient.optional ?? false),
        groupLabel: ingredient.groupLabel ?? null,
      });
      applied.push({ operation, recipeTitle: recipe.title, ingredientName: ingredient.name });
      continue;
    }

    if (operation === "adjustAmount") {
      const ingredientName = patch.ingredientName ?? patch.name ?? patch.ingredient?.name;
      const ingredientKey = keyOf(ingredientName);
      const ingredient = recipe.ingredients.find((entry) => {
        const entryKey = keyOf(entry?.name ?? "");
        return entryKey === ingredientKey || entryKey.includes(ingredientKey) || ingredientKey.includes(entryKey);
      });
      if (!ingredient) {
        rejectPatch(rejected, patch, "ingredient_not_found");
        continue;
      }
      const before = {
        amount: ingredient.amount ?? null,
        unit: ingredient.unit ?? null,
        amountBasis: ingredient.amountBasis ?? null,
      };
      if (patch.amount !== undefined) ingredient.amount = patch.amount;
      if (patch.unit !== undefined) ingredient.unit = patch.unit;
      if (patch.amountBasis !== undefined) ingredient.amountBasis = patch.amountBasis;
      applied.push({ operation, recipeTitle: recipe.title, ingredientName, before, after: {
        amount: ingredient.amount ?? null,
        unit: ingredient.unit ?? null,
        amountBasis: ingredient.amountBasis ?? null,
      } });
      continue;
    }

    if (operation === "addStepAfter") {
      const step = compact(patch.step);
      if (!step) {
        rejectPatch(rejected, patch, "invalid_step");
        continue;
      }
      if (hasStep(recipe.steps, step)) {
        rejectPatch(rejected, patch, "duplicate_step");
        continue;
      }
      const rawIndex = Number(patch.afterStepIndex);
      const afterIndex = Number.isFinite(rawIndex)
        ? Math.max(-1, Math.min(recipe.steps.length - 1, Math.floor(rawIndex)))
        : recipe.steps.length - 1;
      recipe.steps.splice(afterIndex + 1, 0, step);
      applied.push({ operation, recipeTitle: recipe.title, afterStepIndex: afterIndex, step });
      continue;
    }

    if (operation === "replaceStep") {
      const step = compact(patch.step ?? patch.replacementStep);
      const rawIndex = Number(patch.stepIndex);
      const stepIndex = Number.isFinite(rawIndex) ? Math.floor(rawIndex) : -1;
      if (!step || stepIndex < 0 || stepIndex >= recipe.steps.length) {
        rejectPatch(rejected, patch, "invalid_replace_step");
        continue;
      }
      if (hasStep(recipe.steps, step)) {
        rejectPatch(rejected, patch, "duplicate_step");
        continue;
      }
      const before = recipe.steps[stepIndex];
      recipe.steps[stepIndex] = step;
      applied.push({ operation, recipeTitle: recipe.title, stepIndex, before, after: step });
      continue;
    }

    rejectPatch(rejected, patch, "unsupported_operation");
  }

  if ((Array.isArray(currentJson.recipes) ? currentJson.recipes.length : 0) !== recipes.length) {
    throw new Error("source-gap patch repair 적용 중 recipe 수가 변경되었습니다.");
  }

  return {
    json: nextJson,
    patches,
    applied,
    rejected,
    truncatedPatchCount: Array.isArray(patchJson?.patches) && patchJson.patches.length > SEGMENTED_REPAIR_PATCH_LIMIT
      ? patchJson.patches.length - SEGMENTED_REPAIR_PATCH_LIMIT
      : 0,
  };
}

async function runSegmentedRepairPatchPass({
  sourceText,
  resultDir,
  model,
  codexExec,
  options,
  timeoutMs,
  currentJson,
  candidatePlan,
  segmentPlan,
  finalInputSegmentKeyframes,
  finalSelectedFrames,
  sourceCuePacketPlan,
  recipeEvidenceLedgerPlan,
  visualFrameLedgerPlan,
  recipeMustConsiderFactsPlan,
  targeted = false,
  verified = false,
}) {
  const repairPromptVersion = verified
    ? SEGMENTED_REPAIR_VERIFIED_PATCH_PROMPT_VERSION
    : targeted
    ? SEGMENTED_REPAIR_TARGETED_PATCH_PROMPT_VERSION
    : SEGMENTED_REPAIR_PATCH_PROMPT_VERSION;
  const repairPrompt = buildSegmentedRepairPatchPrompt({
    sourceText,
    currentJson,
    candidatePlan,
    segmentPlan,
    finalInputSegmentKeyframes,
    sourceCuePacketPlan,
    recipeEvidenceLedger: recipeEvidenceLedgerPlan,
    visualFrameLedger: visualFrameLedgerPlan,
    recipeMustConsiderFacts: recipeMustConsiderFactsPlan,
    targeted,
    verified,
  });
  const repairPromptPath = path.join(resultDir, "repair.prompt.md");
  const repairRawPath = path.join(resultDir, "repair.raw.md");
  const repairLogPath = path.join(resultDir, "repair.log");
  const repairPatchesPath = path.join(resultDir, "repair-patches.json");
  const repairJsonPath = path.join(resultDir, "repair.json");
  await writeFile(repairPromptPath, repairPrompt, "utf8");

  const repairRaw = await codexExec({
    prompt: repairPrompt,
    images: finalSelectedFrames.map((frame) => frame.path),
    model,
    codexEffort: options.codexEffort,
    outputPath: repairRawPath,
    logPath: repairLogPath,
    timeoutMs,
  });
  await writeFile(repairRawPath, repairRaw, "utf8");

  const patchJson = extractJsonFromText(repairRaw);
  if (!isObject(patchJson) || !Array.isArray(patchJson.patches)) {
    throw new Error("Codex Vision keyframes source-gap patch repair JSON은 { patches: [...] } 형식이어야 합니다.");
  }
  const patchResult = applySegmentedRepairPatches(currentJson, patchJson, { verified });
  await writeFile(repairPatchesPath, JSON.stringify({
    repairPromptVersion,
    targeted,
    verified,
    patchLimit: SEGMENTED_REPAIR_PATCH_LIMIT,
    ...patchResult,
    json: undefined,
  }, null, 2) + "\n", "utf8");
  await writeFile(repairJsonPath, JSON.stringify({
    repairPromptVersion,
    targeted,
    verified,
    recipeCountBefore: currentJson.recipes.length,
    recipeCountAfter: patchResult.json.recipes.length,
    appliedPatchCount: patchResult.applied.length,
    rejectedPatchCount: patchResult.rejected.length,
    truncatedPatchCount: patchResult.truncatedPatchCount,
    json: patchResult.json,
  }, null, 2) + "\n", "utf8");

  return {
    json: patchResult.json,
    repairMeta: {
      segmentedRepairApplied: true,
      segmentedRepairPromptVersion: repairPromptVersion,
      segmentedRepairTargetedPatch: targeted,
      segmentedRepairVerifiedPatch: verified,
      segmentedRepairRecipeCountBefore: currentJson.recipes.length,
      segmentedRepairRecipeCountAfter: patchResult.json.recipes.length,
      segmentedRepairPatchCount: patchResult.patches.length,
      segmentedRepairAppliedPatchCount: patchResult.applied.length,
      segmentedRepairRejectedPatchCount: patchResult.rejected.length,
      segmentedRepairTruncatedPatchCount: patchResult.truncatedPatchCount,
    },
  };
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
  frameOptions,
  singleRecipeOnly,
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
    frameOptions,
    singleRecipeOnly,
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
  segmentedFinalMode,
  segmentedRepairMode,
  segmentBridgeFrames,
  segmentPhaseAnchorFrames,
  segmentSelectorAutoSelect,
  sourceCuePackets,
  evidencePacketBundle,
  recipeEvidenceLedger,
  recipeEvidenceLedgerPrompt,
  visualFrameLedgerPrompt,
  visualFrameLedgerBatchSize,
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
    descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
    bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
    finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
    segmentedFinalBasePromptPolicyVersion: SEGMENTED_FINAL_BASE_PROMPT_POLICY_VERSION,
    segmentBridgeFrameVersion: SEGMENT_BRIDGE_FRAME_VERSION,
    segmentBridgeFrames,
    segmentPhaseAnchorFrameVersion: SEGMENT_PHASE_ANCHOR_FRAME_VERSION,
    segmentPhaseAnchorFrames,
    segmentSelectorAutoSelect,
    segmentedFinalMode,
    segmentedRepairMode,
    segmentPromptVersion: SEGMENT_PROMPT_VERSION,
    segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
    finalPromptVersion: FINAL_PROMPT_VERSION,
    modelSourceBoundaryVersion: MODEL_SOURCE_BOUNDARY_VERSION,
    onscreenTextPriorityVersion: ONSCREEN_TEXT_PRIORITY_VERSION,
    visualIdentityGuardVersion: VISUAL_IDENTITY_GUARD_VERSION,
  };
  if (segmentedRepairMode === "source-gap") keyPayload.segmentedRepairPromptVersion = SEGMENTED_REPAIR_PROMPT_VERSION;
  if (segmentedRepairMode === "source-gap-patch") keyPayload.segmentedRepairPromptVersion = SEGMENTED_REPAIR_PATCH_PROMPT_VERSION;
  if (segmentedRepairMode === "source-gap-patch-targeted") keyPayload.segmentedRepairPromptVersion = SEGMENTED_REPAIR_TARGETED_PATCH_PROMPT_VERSION;
  if (segmentedRepairMode === "source-gap-patch-verified") keyPayload.segmentedRepairPromptVersion = SEGMENTED_REPAIR_VERIFIED_PATCH_PROMPT_VERSION;
  if (sourceCuePackets) {
    keyPayload.sourceCuePacketVersion = SOURCE_CUE_PACKET_VERSION;
    if (evidencePacketBundle?.packets?.length) {
      keyPayload.evidencePacketSourceCueBridgeVersion = EVIDENCE_PACKET_SOURCE_CUE_BRIDGE_VERSION;
      keyPayload.evidencePacketHash = hashText(JSON.stringify(evidencePacketBundle.packets));
    }
  }
  if (recipeEvidenceLedger) {
    keyPayload.recipeEvidenceLedgerVersion = RECIPE_EVIDENCE_LEDGER_VERSION;
    keyPayload.recipeEvidenceLedgerPromptEnabled = Boolean(recipeEvidenceLedgerPrompt);
  }
  if (visualFrameLedgerPrompt) {
    keyPayload.visualFrameLedgerVersion = VISUAL_FRAME_LEDGER_VERSION;
    keyPayload.visualFrameLedgerBatchSize = visualFrameLedgerBatchSize ?? 0;
    if ((visualFrameLedgerBatchSize ?? 0) > 0) {
      keyPayload.visualFrameLedgerBatchContextVersion = VISUAL_FRAME_LEDGER_BATCH_CONTEXT_VERSION;
    }
  }
  if (recipeEvidenceLedgerPrompt || visualFrameLedgerPrompt) {
    keyPayload.recipeMustConsiderFactsVersion = RECIPE_MUST_CONSIDER_FACTS_VERSION;
    keyPayload.titleVisualBridgeFactsVersion = TITLE_VISUAL_BRIDGE_FACTS_VERSION;
  }
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

function resolveSelectedFrame(rawFile, candidateFrames, lookup) {
  const file = path.basename(String(rawFile));
  const exact = lookup.byFile.get(file) ?? lookup.byPath.get(String(rawFile)) ?? lookup.byFile.get(String(rawFile));
  if (exact) return { frame: exact, resolutionSource: "exact", evidenceAllowed: true };

  const timestamp = timestampFromFrameFileName(file);
  if (!Number.isFinite(timestamp)) return null;
  const matches = candidateFrames
    .map((frame) => ({ frame, delta: Math.abs((frameTimestampSec(frame) ?? Infinity) - timestamp) }))
    .filter((entry) => entry.delta <= FRAME_TIMESTAMP_TOLERANCE_SEC)
    .sort((a, b) => a.delta - b.delta);
  if (matches.length === 0) return null;
  return {
    frame: matches[0].frame,
    resolutionSource: matches.length === 1 ? "unique-timestamp" : "ambiguous-timestamp",
    evidenceAllowed: matches.length === 1,
  };
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

function normalizedTextArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => compact(item)).filter(Boolean))];
}

function normalizeVisualEvidence(value, allowed) {
  if (!allowed || !isObject(value)) {
    return { observed: [], onscreenText: [], quantityCues: [], confidence: null };
  }
  const confidence = Number(value.confidence);
  return {
    observed: normalizedTextArray(value.observed),
    onscreenText: normalizedTextArray(value.onscreenText),
    quantityCues: normalizedTextArray(value.quantityCues),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
  };
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
    const resolved = resolveSelectedFrame(rawFile, candidateFrames, lookup);
    const frame = resolved?.frame;
    if (!frame || seenPaths.has(frame.path)) continue;

    const recipe = selectedFrameRecipe(entry);
    const count = recipeCounts.get(recipe) ?? 0;
    if (count >= perRecipeLimit) continue;

    selected.push({
      ...frame,
      selectionReason: compact(isObject(entry) ? entry.reason : "") || null,
      resolutionSource: resolved.resolutionSource,
      visualEvidence: normalizeVisualEvidence(isObject(entry) ? entry.visualEvidence : null, resolved.evidenceAllowed),
    });
    seenPaths.add(frame.path);
    recipeCounts.set(recipe, count + 1);
    if (selected.length >= totalLimit) break;
  }

  if (selected.length === 0) {
    throw new Error("Codex Vision keyframes selector가 사용할 수 있는 프레임을 하나도 고르지 못했습니다.");
  }
  return selected;
}

function selectedFrameEvidenceSummary(selectedFrames) {
  const evidenceRows = selectedFrames.map((frame) => frame.visualEvidence ?? {});
  return {
    selectedFrameCount: selectedFrames.length,
    cueBearingFrameCount: evidenceRows.filter((evidence) => (
      (evidence.onscreenText?.length ?? 0) > 0 || (evidence.quantityCues?.length ?? 0) > 0
    )).length,
    observedCueCount: evidenceRows.reduce((sum, evidence) => sum + (evidence.observed?.length ?? 0), 0),
    onscreenCueCount: evidenceRows.reduce((sum, evidence) => sum + (evidence.onscreenText?.length ?? 0), 0),
    quantityCueCount: evidenceRows.reduce((sum, evidence) => sum + (evidence.quantityCues?.length ?? 0), 0),
  };
}

function sourceAvailability(sourceText, evidenceSummary) {
  const text = String(sourceText ?? "");
  return {
    description: text.includes("[SOURCE: description]"),
    authorComment: text.includes("[SOURCE: author_comment]"),
    transcript: text.includes("[SOURCE: transcript("),
    onscreen: evidenceSummary.onscreenCueCount > 0 || evidenceSummary.quantityCueCount > 0,
  };
}

function validateOnscreenAmountEvidence(json, selectedFrames) {
  const cueTexts = selectedFrames.flatMap((frame) => [
    ...(frame.visualEvidence?.onscreenText ?? []),
    ...(frame.visualEvidence?.quantityCues ?? []),
  ]);
  const conflicts = [];

  for (const [recipeIndex, recipe] of (json.recipes ?? []).entries()) {
    for (const [ingredientIndex, ingredient] of (recipe.ingredients ?? []).entries()) {
      if (ingredient?.amountBasis !== "onscreen") continue;
      const ingredientKey = keyOf(ingredient.name);
      const amountKey = keyOf(ingredient.amount);
      const supportingCue = cueTexts.find((text) => {
        const cueKey = keyOf(text);
        return ingredientKey && cueKey.includes(ingredientKey) && (!amountKey || cueKey.includes(amountKey));
      });
      if (supportingCue) continue;

      conflicts.push({
        recipeIndex,
        ingredientIndex,
        ingredientName: ingredient.name ?? null,
        amount: ingredient.amount ?? null,
        unit: ingredient.unit ?? null,
        rejectedBasis: "onscreen",
        reason: "canonical selected frame의 onscreenText/quantityCues에 재료명과 분량이 함께 연결되지 않음",
      });
      ingredient.amount = null;
      ingredient.unit = null;
      ingredient.amountBasis = null;
    }
  }

  return { json, conflicts };
}

function frameTime(frame) {
  const timestamp = frameTimestampSec(frame);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function selectedFrameReasonFor(frame, rawEntryByFramePath) {
  const rawEntry = rawEntryByFramePath.get(frame.path);
  return compact(isObject(rawEntry) ? rawEntry.reason : frame.reason);
}

function isLowInfoSelectedFrame(frame, rawEntryByFramePath) {
  return LOW_INFO_SELECTION_RE.test(selectedFrameReasonFor(frame, rawEntryByFramePath));
}

function bridgeFrameReason(prevFrame, nextFrame) {
  return `bridge-frame: ${frameBasename(prevFrame)}와 ${frameBasename(nextFrame)} 사이의 조리 상태 전환 보강`;
}

function bridgeCandidateBetween(prevFrame, nextFrame, candidateFrames, selectedPaths) {
  const prevTime = frameTime(prevFrame);
  const nextTime = frameTime(nextFrame);
  if (prevTime === null || nextTime === null) return null;
  const start = Math.min(prevTime, nextTime);
  const end = Math.max(prevTime, nextTime);
  if (end - start < SEGMENT_BRIDGE_FRAME_MIN_GAP_SEC) return null;
  const midpoint = (start + end) / 2;
  let best = null;
  let bestDelta = Infinity;
  for (const frame of candidateFrames) {
    if (selectedPaths.has(frame.path)) continue;
    const timestamp = frameTime(frame);
    if (timestamp === null || timestamp <= start || timestamp >= end) continue;
    const delta = Math.abs(timestamp - midpoint);
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }
  return best;
}

function augmentSelectedFramesWithBridgeFrames(selectedFrames, candidateFrames, rawEntryByFramePath, totalLimit) {
  const selectedPaths = new Set(selectedFrames.map((frame) => frame.path));
  const chronological = [...selectedFrames].sort((a, b) => (frameTime(a) ?? 0) - (frameTime(b) ?? 0));
  const bridgeReasonByPath = new Map();
  let nextSelectedFrames = [...selectedFrames];

  for (let index = 0; index < chronological.length - 1; index += 1) {
    if (bridgeReasonByPath.size >= SEGMENT_BRIDGE_FRAME_MAX_PER_SEGMENT) break;
    const bridgeFrame = bridgeCandidateBetween(chronological[index], chronological[index + 1], candidateFrames, selectedPaths);
    if (!bridgeFrame) continue;

    if (nextSelectedFrames.length >= totalLimit) {
      const removableIndex = nextSelectedFrames.findLastIndex((frame) => isLowInfoSelectedFrame(frame, rawEntryByFramePath));
      if (removableIndex === -1) continue;
      selectedPaths.delete(nextSelectedFrames[removableIndex].path);
      nextSelectedFrames.splice(removableIndex, 1);
    }

    nextSelectedFrames.push(bridgeFrame);
    selectedPaths.add(bridgeFrame.path);
    bridgeReasonByPath.set(bridgeFrame.path, bridgeFrameReason(chronological[index], chronological[index + 1]));
  }

  return {
    selectedFrames: nextSelectedFrames.sort((a, b) => (frameTime(a) ?? 0) - (frameTime(b) ?? 0)),
    bridgeReasonByPath,
  };
}

function phaseAnchorFrameReason(segment, targetSec) {
  return `phase-anchor-frame: ${segment.segmentId} ${SEGMENT_PHASE_ANCHOR_TARGET_RATIO.toFixed(2)} 지점(${targetSec.toFixed(1)}초) 근처의 중후반 조리 전환 보강`;
}

function phaseAnchorCandidate(segment, selectedFrames, candidateFrames, selectedPaths) {
  const startSec = Number(segment?.startSec);
  const endSec = Number(segment?.endSec);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  const durationSec = endSec - startSec;
  if (durationSec < SEGMENT_PHASE_ANCHOR_MIN_DURATION_SEC) return null;

  const targetSec = startSec + durationSec * SEGMENT_PHASE_ANCHOR_TARGET_RATIO;
  const hasNearbySelected = selectedFrames.some((frame) => {
    const timestamp = frameTime(frame);
    return timestamp !== null && Math.abs(timestamp - targetSec) <= SEGMENT_PHASE_ANCHOR_NEAR_SEC;
  });
  if (hasNearbySelected) return null;
  const alreadyHasLateCoverage = selectedFrames.some((frame) => {
    const timestamp = frameTime(frame);
    return timestamp !== null && timestamp >= targetSec;
  });
  if (alreadyHasLateCoverage) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const frame of candidateFrames) {
    if (selectedPaths.has(frame.path)) continue;
    const timestamp = frameTime(frame);
    if (timestamp === null || timestamp < startSec || timestamp > endSec) continue;
    const delta = Math.abs(timestamp - targetSec);
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }

  if (!best) return null;
  return { frame: best, targetSec };
}

function augmentSelectedFramesWithPhaseAnchorFrames(selectedFrames, candidateFrames, rawEntryByFramePath, segment, totalLimit) {
  const selectedPaths = new Set(selectedFrames.map((frame) => frame.path));
  const phaseAnchorReasonByPath = new Map();
  let nextSelectedFrames = [...selectedFrames];
  const anchor = phaseAnchorCandidate(segment, nextSelectedFrames, candidateFrames, selectedPaths);
  if (!anchor) {
    return {
      selectedFrames: nextSelectedFrames.sort((a, b) => (frameTime(a) ?? 0) - (frameTime(b) ?? 0)),
      phaseAnchorReasonByPath,
    };
  }

  if (nextSelectedFrames.length >= totalLimit) {
    const removableIndex = nextSelectedFrames.findLastIndex((frame) => isLowInfoSelectedFrame(frame, rawEntryByFramePath));
    if (removableIndex === -1) {
      return {
        selectedFrames: nextSelectedFrames.sort((a, b) => (frameTime(a) ?? 0) - (frameTime(b) ?? 0)),
        phaseAnchorReasonByPath,
      };
    }
    selectedPaths.delete(nextSelectedFrames[removableIndex].path);
    nextSelectedFrames.splice(removableIndex, 1);
  }

  nextSelectedFrames.push(anchor.frame);
  selectedPaths.add(anchor.frame.path);
  phaseAnchorReasonByPath.set(anchor.frame.path, phaseAnchorFrameReason(segment, anchor.targetSec));

  return {
    selectedFrames: nextSelectedFrames.sort((a, b) => (frameTime(a) ?? 0) - (frameTime(b) ?? 0)),
    phaseAnchorReasonByPath,
  };
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
  recipeEvidenceLedger = false,
  recipeEvidenceLedgerPrompt = false,
  visualFrameLedgerPrompt = false,
  visualFrameLedgerBatchSize = DEFAULT_VISUAL_FRAME_LEDGER_BATCH_SIZE,
  segmentedFinalMode = DEFAULT_SEGMENTED_FINAL_MODE,
  segmentedRepairMode = DEFAULT_SEGMENTED_REPAIR_MODE,
  segmentBridgeFrames = DEFAULT_SEGMENT_BRIDGE_FRAMES,
  segmentPhaseAnchorFrames = DEFAULT_SEGMENT_PHASE_ANCHOR_FRAMES,
  segmentSelectorAutoSelect = false,
  evidencePacketBundle = null,
}) {
  if (segmentedFinalMode !== "combined" && segmentedRepairMode !== "none") {
    throw new Error("segmented repair mode는 combined final에서만 지원합니다.");
  }
  let stage = "candidate-split";
  const recipeEvidenceLedgerEnabled = Boolean(recipeEvidenceLedger || recipeEvidenceLedgerPrompt);
  const recipeEvidenceLedgerPromptEnabled = recipeEvidenceLedgerEnabled && Boolean(recipeEvidenceLedgerPrompt);
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
    segmentedFinalMode,
    segmentedRepairMode,
    segmentBridgeFrames,
    segmentPhaseAnchorFrames,
    segmentSelectorAutoSelect,
    sourceCuePackets,
    evidencePacketBundle,
    recipeEvidenceLedger: recipeEvidenceLedgerEnabled,
    recipeEvidenceLedgerPrompt: recipeEvidenceLedgerPromptEnabled,
    visualFrameLedgerPrompt,
    visualFrameLedgerBatchSize,
  });
  const resultDir = path.join(cacheDir, resultKey);
  const finalJsonPath = path.join(resultDir, "final.json");
  const sourceCueMeta = sourceCuePackets
    ? {
      sourceCuePacketsEnabled: true,
      sourceCuePacketVersion: SOURCE_CUE_PACKET_VERSION,
    }
    : {};
  const recipeEvidenceLedgerBaseMeta = recipeEvidenceLedgerEnabled
    ? {
      recipeEvidenceLedgerEnabled: true,
      recipeEvidenceLedgerPromptEnabled,
      recipeEvidenceLedgerVersion: RECIPE_EVIDENCE_LEDGER_VERSION,
    }
    : {};
  const visualFrameLedgerBaseMeta = visualFrameLedgerPrompt
    ? {
      visualFrameLedgerPromptEnabled: true,
      visualFrameLedgerVersion: VISUAL_FRAME_LEDGER_VERSION,
      visualFrameLedgerBatchSize,
      ...(visualFrameLedgerBatchSize > 0 ? { visualFrameLedgerBatchContextVersion: VISUAL_FRAME_LEDGER_BATCH_CONTEXT_VERSION } : {}),
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
        descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
        bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
        segmentedFinalBasePromptPolicyVersion: SEGMENTED_FINAL_BASE_PROMPT_POLICY_VERSION,
        finalPromptVersion: FINAL_PROMPT_VERSION,
        modelSourceBoundaryVersion: MODEL_SOURCE_BOUNDARY_VERSION,
        segmentBridgeFrameVersion: SEGMENT_BRIDGE_FRAME_VERSION,
        segmentBridgeFrames,
        segmentPhaseAnchorFrameVersion: SEGMENT_PHASE_ANCHOR_FRAME_VERSION,
        segmentPhaseAnchorFrames,
        segmentedFinalMode,
        segmentedRepairMode,
        ...sourceCueMeta,
        ...recipeEvidenceLedgerBaseMeta,
        ...visualFrameLedgerBaseMeta,
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
  let descriptionMenuParentRangePlan = null;
  let sourceCuePacketPlan = null;
  let recipeEvidenceLedgerPlan = null;
  let recipeEvidenceLedgerStats = {};
  let visualFrameLedgerPlan = null;
  let visualFrameLedgerStats = {};
  let recipeMustConsiderFactsPlan = null;
  let recipeMustConsiderFactsStats = {};
  let segmentPlanCacheReuse = null;
  const segmentSelectorCacheReuses = [];
  const segmentSelectorDeterministicSelections = [];
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
      const reusableSegmentPlan = options.noCache
        ? null
        : await findReusableSegmentPlan({
          cacheDir,
          resultDir,
          segmentPrompt,
          segmentOptions,
        });

      let rawSegmentPlan;
      if (reusableSegmentPlan) {
        segmentPlanCacheReuse = {
          version: SEGMENT_PLAN_COMPATIBLE_REUSE_VERSION,
          mode: reusableSegmentPlan.mode,
          sourceDir: reusableSegmentPlan.sourceDir,
          segmentCount: reusableSegmentPlan.segmentCount,
          frameBudgetTotal: reusableSegmentPlan.frameBudgetTotal,
          requiresNormalization: reusableSegmentPlan.requiresNormalization,
        };
        rawSegmentPlan = reusableSegmentPlan.segmentPlan;
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
        rawSegmentPlan = rawPlan;
      }
      stage = "segment-normalize";
      segmentPlan = normalizeSegmentPlan(rawSegmentPlan, {
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
      descriptionMenuParentRangePlan = buildDescriptionMenuParentRangePlan({
        sourceText: cacheText,
        lastKeyframeSec: maxFrameSec,
        candidatePlan,
      });
      segmentPlan = applyDescriptionMenuParentRanges(segmentPlan, descriptionMenuParentRangePlan);
      if (segmentPlanCacheReuse) {
        segmentPlan = {
          ...segmentPlan,
          warnings: [
            ...(Array.isArray(segmentPlan?.warnings) ? segmentPlan.warnings : []),
            `segment plan reused from compatible cache: ${path.basename(segmentPlanCacheReuse.sourceDir)}`,
          ],
        };
      }
      await writeFile(segmentJsonPath, JSON.stringify(segmentPlan, null, 2) + "\n", "utf8");
    }

    sourceCuePacketPlan = sourceCuePackets
      ? buildSourceCuePacketsFromSourceText(cacheText, candidatePlan, segmentPlan, { evidencePacketBundle })
      : null;
    const sourceCuePacketByCandidate = new Map(
      Array.isArray(sourceCuePacketPlan?.packets)
        ? sourceCuePacketPlan.packets.map((packet) => [packet.candidateId, packet])
        : [],
    );

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
        maxFrames: segmentOptions.selectorCandidateLimit,
        maxFrameSec,
      });
      const candidateFrames = candidateResult.candidates;
      candidateFrameCount += candidateFrames.length;
      const segmentSelectorPrompt = buildSegmentSelectorPrompt({
        sourceText: cacheText,
        segment,
        candidateFrames,
        sourceCuePacket: sourceCuePacketByCandidate.get(segment.candidateId) ?? null,
      });
      const selectorPrefix = `segment-${segment.segmentId}.selector`;
      const selectorPromptPath = path.join(resultDir, `${selectorPrefix}.prompt.md`);
      const selectorRawPath = path.join(resultDir, `${selectorPrefix}.raw.md`);
      const selectorLogPath = path.join(resultDir, `${selectorPrefix}.log`);
      const selectorJsonPath = path.join(resultDir, `${selectorPrefix}.json`);
      await writeFile(selectorPromptPath, segmentSelectorPrompt, "utf8");

      let selectorJson;
      if (!options.noCache && existsSync(selectorJsonPath)) {
        selectorJson = JSON.parse(await readFile(selectorJsonPath, "utf8"));
      } else if (segmentSelectorAutoSelect && candidateFrames.length <= segment.frameBudget) {
        selectorJson = {
          selectedFrames: candidateFrames.map((frame) => ({
            file: path.basename(frame.path),
            reason: "candidate frame count is within frameBudget; selected deterministically",
          })),
        };
        segmentSelectorDeterministicSelections.push({
          segmentId: segment.segmentId,
          candidateFrameCount: candidateFrames.length,
          frameBudget: segment.frameBudget,
        });
        await writeFile(selectorJsonPath, JSON.stringify(selectorJson, null, 2) + "\n", "utf8");
      } else {
        const reusableSelector = options.noCache
          ? null
          : await findReusableSegmentSelector({
            cacheDir,
            resultDir,
            selectorPrefix,
            segmentSelectorPrompt,
            candidateFrames,
          });
        if (reusableSelector) {
          selectorJson = reusableSelector.selectorJson;
          segmentSelectorCacheReuses.push({
            segmentId: segment.segmentId,
            mode: reusableSelector.mode,
            sourceDir: reusableSelector.sourceDir,
            selectedFrameCount: reusableSelector.selectedFrameCount,
          });
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
        }
        await writeFile(selectorJsonPath, JSON.stringify(selectorJson, null, 2) + "\n", "utf8");
      }

      const rawSelectorEntries = Array.isArray(selectorJson.selectedFrames) ? selectorJson.selectedFrames : [];
      const selectorLookup = frameLookup(candidateFrames);
      const rawEntryByFramePath = new Map();
      for (const entry of rawSelectorEntries) {
        const rawFile = selectedFrameFile(entry);
        if (!rawFile) continue;
        const frame = resolveSelectedFrame(rawFile, candidateFrames, selectorLookup)?.frame;
        if (frame) rawEntryByFramePath.set(frame.path, entry);
      }
      const normalizedSelectedFrames = normalizeSelectedFrames(selectorJson, candidateFrames, {
        totalLimit: segment.frameBudget,
        perRecipeLimit: segment.frameBudget,
      });
      const bridgeResult = segmentBridgeFrames
        ? augmentSelectedFramesWithBridgeFrames(
          normalizedSelectedFrames,
          candidateFrames,
          rawEntryByFramePath,
          segment.frameBudget,
        )
        : { selectedFrames: normalizedSelectedFrames, bridgeReasonByPath: new Map() };
      const phaseAnchorResult = segmentPhaseAnchorFrames
        ? augmentSelectedFramesWithPhaseAnchorFrames(
          bridgeResult.selectedFrames,
          candidateFrames,
          rawEntryByFramePath,
          segment,
          segment.frameBudget,
        )
        : { selectedFrames: bridgeResult.selectedFrames, phaseAnchorReasonByPath: new Map() };
      const selectedFrames = phaseAnchorResult.selectedFrames;
      const selectedForJson = selectedFrames.map((frame) => {
        const rawEntry = rawEntryByFramePath.get(frame.path);
        const bridgeReason = bridgeResult.bridgeReasonByPath.get(frame.path);
        const phaseAnchorReason = phaseAnchorResult.phaseAnchorReasonByPath.get(frame.path);
        const selectionReason = phaseAnchorReason ?? bridgeReason ?? (isObject(rawEntry) ? (rawEntry.reason ?? null) : null);
        const selectionSource = phaseAnchorReason ? "phase-anchor-frame" : (bridgeReason ? "bridge-frame" : "selector");
        return {
          index: frame.index,
          timestamp_sec: frame.timestamp_sec,
          timestamp: frame.timestamp,
          file: frameBasename(frame),
          path: frame.path,
          reason: frame.reason ?? null,
          selectionReason,
          bridgeFrame: Boolean(bridgeReason),
          phaseAnchorFrame: Boolean(phaseAnchorReason),
          selectionSource,
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
        candidateFrameLimit: candidateResult.candidateLimit,
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

    const coveredCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "covered").length;
    const droppedCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "dropped").length;
    const supportingCandidateCount = (segmentPlan.coverage ?? []).filter((entry) => entry.status === "supporting").length;
    const finalInputSegmentFilter = buildFinalInputSegmentFilter({
      segmentEntries,
      candidatePlan,
      segmentPlan,
    });
    const finalIncludedSegmentIds = new Set(finalInputSegmentFilter.includedSegments.map((segment) => segment.segmentId));
    const finalSelectedFramesWithSegment = selectedFramesWithSegment.filter(({ segment }) => finalIncludedSegmentIds.has(segment.segmentId));
    const finalSelectedFrames = dedupeFrames(finalSelectedFramesWithSegment.map((entry) => entry.frame));
    const selectedFrameHash = frameManifestHash(finalSelectedFrames);
    const segmentKeyframesBase = {
      candidatePlanHash,
      selectedFrameHash,
      selectedFrameCount: finalSelectedFrames.length,
      segmentSelectedFrameCount: finalSelectedFramesWithSegment.length,
      candidateCount: candidatePlan.recipeCandidates.length,
      coveredCandidateCount,
      droppedCandidateCount,
      supportingCandidateCount,
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
      segmentBridgeFrameVersion: SEGMENT_BRIDGE_FRAME_VERSION,
      segmentBridgeFrames,
      segmentPhaseAnchorFrameVersion: SEGMENT_PHASE_ANCHOR_FRAME_VERSION,
      segmentPhaseAnchorFrames,
      finalPromptSegmentCount: finalInputSegmentFilter.includedSegments.length,
      finalOmittedSegmentCount: finalInputSegmentFilter.omittedSegments.length,
      finalOmittedSegments: finalInputSegmentFilter.omittedSegments,
    };
    segmentKeyframes = {
      ...segmentKeyframesBase,
      segments: segmentEntries,
    };
    const finalInputSegmentKeyframes = {
      ...segmentKeyframesBase,
      segments: finalInputSegmentFilter.includedSegments,
    };
    await writeFile(path.join(resultDir, "segment-keyframes.json"), JSON.stringify(segmentKeyframes, null, 2) + "\n", "utf8");
    await writeFile(path.join(resultDir, "final-input-segment-keyframes.json"), JSON.stringify(finalInputSegmentKeyframes, null, 2) + "\n", "utf8");
    await writeFile(
      path.join(resultDir, "selected_frames.json"),
      JSON.stringify({
        selectedFrameHash,
        selectedFrameCount: finalSelectedFrames.length,
        keyframeMode: "segmented",
        finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
        finalPromptSegmentCount: finalInputSegmentFilter.includedSegments.length,
        finalOmittedSegmentCount: finalInputSegmentFilter.omittedSegments.length,
        finalOmittedSegments: finalInputSegmentFilter.omittedSegments,
        selectedFrames: finalSelectedFramesWithSegment.map(({ frame, segment, selectedFrame }) => ({
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

    if (recipeEvidenceLedgerEnabled) {
      recipeEvidenceLedgerPlan = buildRecipeEvidenceLedger({
        sourceText: cacheText,
        candidatePlan,
        segmentPlan,
        segmentKeyframes: finalInputSegmentKeyframes,
        generatedFrom: {
          candidatePlanHash,
          segmentPlanHash: hashText(JSON.stringify(segmentPlan)),
          segmentKeyframesHash: hashText(JSON.stringify(finalInputSegmentKeyframes)),
          selectedFrameHash,
        },
      });
      const ledgerSummary = summarizeRecipeEvidenceLedger(recipeEvidenceLedgerPlan);
      recipeEvidenceLedgerStats = {
        ...ledgerSummary,
        promptLedgerTextChars: recipeEvidenceLedgerPromptEnabled
          ? ledgerSummary.promptLedgerTextChars
          : 0,
      };
      await writeFile(
        path.join(resultDir, "recipe-evidence-ledger.json"),
        JSON.stringify(recipeEvidenceLedgerPlan, null, 2) + "\n",
        "utf8",
      );
    }

    if (visualFrameLedgerPrompt) {
      stage = "visual-frame-ledger";
      visualFrameLedgerPlan = await runVisualFrameLedgerPass({
        sourceText: cacheText,
        resultDir,
        segmentModel,
        codexExec,
        options,
        timeoutMs,
        finalInputSegmentKeyframes,
        finalSelectedFrames,
        sourceCuePacketPlan,
        recipeEvidenceLedgerPlan: recipeEvidenceLedgerPromptEnabled ? recipeEvidenceLedgerPlan : null,
        batchSize: visualFrameLedgerBatchSize,
      });
      visualFrameLedgerStats = summarizeVisualFrameLedger(visualFrameLedgerPlan);
    }

    if (recipeEvidenceLedgerPlan || visualFrameLedgerPlan) {
      recipeMustConsiderFactsPlan = buildRecipeMustConsiderFacts({
        recipeEvidenceLedger: recipeEvidenceLedgerPromptEnabled ? recipeEvidenceLedgerPlan : null,
        visualFrameLedger: visualFrameLedgerPlan,
      });
      recipeMustConsiderFactsStats = summarizeRecipeMustConsiderFacts(recipeMustConsiderFactsPlan);
      await writeFile(
        path.join(resultDir, "recipe-must-consider-facts.json"),
        JSON.stringify(recipeMustConsiderFactsPlan, null, 2) + "\n",
        "utf8",
      );
    }

    stage = "final";
    let json;
    let finalModeMeta = {};
    if (segmentedFinalMode === "per-segment") {
      const perSegmentResult = await runPerSegmentFinalExtraction({
        prompt,
        sourceText: cacheText,
        resultDir,
        model,
        codexExec,
        options,
        timeoutMs,
        finalInputSegmentKeyframes,
        finalSelectedFramesWithSegment,
        sourceCuePacketPlan,
        recipeEvidenceLedgerPlan: recipeEvidenceLedgerPromptEnabled ? recipeEvidenceLedgerPlan : null,
        visualFrameLedgerPlan,
        recipeMustConsiderFactsPlan,
      });
      json = perSegmentResult.json;
      finalModeMeta = perSegmentResult.finalModeMeta;
    } else {
      const finalPrompt = buildSegmentedFinalPrompt({
        prompt,
        sourceText: cacheText,
        candidatePlan,
        segmentPlan,
        segmentKeyframes: finalInputSegmentKeyframes,
        sourceCuePacketPlan,
        recipeEvidenceLedger: recipeEvidenceLedgerPromptEnabled ? recipeEvidenceLedgerPlan : null,
        visualFrameLedger: visualFrameLedgerPlan,
        recipeMustConsiderFacts: recipeMustConsiderFactsPlan,
      });
      const finalPromptPath = path.join(resultDir, "final.prompt.md");
      const finalRawPath = path.join(resultDir, "final.raw.md");
      const finalLogPath = path.join(resultDir, "final.log");
      await writeFile(finalPromptPath, finalPrompt, "utf8");

      const recoveredFinalRaw = (!options.noCache && !options.refreshFinal)
        ? await readRecoveredFinalRawJson(finalRawPath)
        : null;
      if (recoveredFinalRaw) {
        json = recoveredFinalRaw.json;
        finalModeMeta = {
          ...finalModeMeta,
          finalRawRecovered: true,
          finalRawRecoveryVersion: FINAL_RAW_RECOVERY_VERSION,
        };
      } else {
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

        json = extractJsonFromText(finalRaw);
      }
      if (!isObject(json) || !Array.isArray(json.recipes)) {
        throw new Error("Codex Vision keyframes segmented 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
      }
      if (segmentedRepairMode === "source-gap" || segmentedRepairMode === "source-gap-patch" || segmentedRepairMode === "source-gap-patch-targeted" || segmentedRepairMode === "source-gap-patch-verified") {
        stage = "repair";
        const repairOptions = {
          sourceText: cacheText,
          resultDir,
          model,
          codexExec,
          options,
          timeoutMs,
          currentJson: json,
          candidatePlan,
          segmentPlan,
          finalInputSegmentKeyframes,
          finalSelectedFrames,
          sourceCuePacketPlan,
          recipeEvidenceLedgerPlan: recipeEvidenceLedgerPromptEnabled ? recipeEvidenceLedgerPlan : null,
          visualFrameLedgerPlan,
          recipeMustConsiderFactsPlan,
          targeted: segmentedRepairMode === "source-gap-patch-targeted",
          verified: segmentedRepairMode === "source-gap-patch-verified",
        };
        const repairResult = segmentedRepairMode === "source-gap-patch" || segmentedRepairMode === "source-gap-patch-targeted" || segmentedRepairMode === "source-gap-patch-verified"
          ? await runSegmentedRepairPatchPass(repairOptions)
          : await runSegmentedRepairPass(repairOptions);
        json = repairResult.json;
        finalModeMeta = {
          ...finalModeMeta,
          ...repairResult.repairMeta,
        };
      }
    }

    const meta = {
      provider: PROVIDER,
      keyframeMode: "segmented",
      segmentedFinalMode,
      segmentedRepairMode,
      model,
      selectorModel,
      segmentModel,
      clientVersion: CLIENT_VERSION,
      candidateSplitterVersion: CANDIDATE_SPLITTER_VERSION,
      timelineParentRangeVersion: TIMELINE_PARENT_RANGE_VERSION,
      descriptionMenuParentRangeVersion: DESCRIPTION_MENU_PARENT_RANGE_VERSION,
      bundleChildSegmentVersion: BUNDLE_CHILD_SEGMENT_VERSION,
      finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
      segmentedFinalBasePromptPolicyVersion: SEGMENTED_FINAL_BASE_PROMPT_POLICY_VERSION,
      segmentBridgeFrameVersion: SEGMENT_BRIDGE_FRAME_VERSION,
      segmentBridgeFrames,
      segmentPhaseAnchorFrameVersion: SEGMENT_PHASE_ANCHOR_FRAME_VERSION,
      segmentPhaseAnchorFrames,
      segmentedFinalLegacyEvidencePacketsRemoved: sanitizeSegmentedFinalBasePrompt(prompt).legacyEvidencePacketsRemoved,
      ...sourceCueMeta,
      ...recipeEvidenceLedgerBaseMeta,
      ...visualFrameLedgerBaseMeta,
      segmentPromptVersion: SEGMENT_PROMPT_VERSION,
      segmentSelectorPromptVersion: SEGMENT_SELECTOR_PROMPT_VERSION,
      finalPromptVersion: FINAL_PROMPT_VERSION,
      modelSourceBoundaryVersion: MODEL_SOURCE_BOUNDARY_VERSION,
      onscreenTextPriorityVersion: ONSCREEN_TEXT_PRIORITY_VERSION,
      visualIdentityGuardVersion: VISUAL_IDENTITY_GUARD_VERSION,
      ...(segmentedRepairMode === "source-gap" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_PATCH_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch-targeted" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_TARGETED_PATCH_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch-verified" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_VERIFIED_PATCH_PROMPT_VERSION } : {}),
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
      segmentSelectedFrameCount: finalSelectedFramesWithSegment.length,
      totalSegmentSelectedFrameCount: selectedFramesWithSegment.length,
      finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
      finalPromptSegmentCount: finalInputSegmentFilter.includedSegments.length,
      finalOmittedSegmentCount: finalInputSegmentFilter.omittedSegments.length,
      finalOmittedSegmentIds: finalInputSegmentFilter.omittedSegments.map((segment) => segment.segmentId),
      candidatePlanHash,
      selectedFrameHash,
      segmentPlanHash: hashText(JSON.stringify(segmentPlan)),
      segmentKeyframesHash: hashText(JSON.stringify(segmentKeyframes)),
      ...(segmentPlanCacheReuse ? {
        segmentPlanCacheReused: true,
        segmentPlanCacheReuseVersion: segmentPlanCacheReuse.version,
        segmentPlanCacheReuseMode: segmentPlanCacheReuse.mode,
        segmentPlanCacheReuseSourceDir: segmentPlanCacheReuse.sourceDir,
        segmentPlanCacheReuseSegmentCount: segmentPlanCacheReuse.segmentCount,
        segmentPlanCacheReuseFrameBudgetTotal: segmentPlanCacheReuse.frameBudgetTotal,
        segmentPlanCacheReuseRequiredNormalization: segmentPlanCacheReuse.requiresNormalization,
      } : { segmentPlanCacheReused: false }),
      segmentSelectorCacheReuseVersion: SEGMENT_SELECTOR_COMPATIBLE_REUSE_VERSION,
      segmentSelectorCacheReuseCount: segmentSelectorCacheReuses.length,
      segmentSelectorCacheReuses,
      segmentSelectorDeterministicSelectionVersion: SEGMENT_SELECTOR_DETERMINISTIC_SELECTION_VERSION,
      segmentSelectorDeterministicSelectionEnabled: segmentSelectorAutoSelect,
      segmentSelectorDeterministicSelectionCount: segmentSelectorDeterministicSelections.length,
      segmentSelectorDeterministicSelections,
      segmentSelectorCandidateLimit: segmentOptions.selectorCandidateLimit,
      ...finalModeMeta,
      ...(sourceCuePacketPlan ? {
        sourceCuePacketHash: hashText(JSON.stringify(sourceCuePacketPlan)),
        ...(sourceCuePacketPlan.evidencePacketSourceCueBridgeVersion ? {
          evidencePacketSourceCueBridgeVersion: sourceCuePacketPlan.evidencePacketSourceCueBridgeVersion,
          evidencePacketBridgeMatchedCount: sourceCuePacketPlan.evidencePacketBridgeMatchedCount ?? 0,
          evidencePacketBridgeCount: sourceCuePacketPlan.evidencePacketBridgeCount ?? 0,
          evidencePacketBridgeSkippedCount: sourceCuePacketPlan.evidencePacketBridgeSkippedCount ?? 0,
        } : {}),
      } : {}),
      ...(recipeEvidenceLedgerPlan ? {
        recipeEvidenceLedgerHash: hashText(JSON.stringify(recipeEvidenceLedgerPlan)),
        ...recipeEvidenceLedgerStats,
      } : {}),
      ...(visualFrameLedgerPlan ? {
        visualFrameLedgerHash: hashText(JSON.stringify(visualFrameLedgerPlan)),
        ...visualFrameLedgerStats,
      } : {}),
      ...(recipeMustConsiderFactsPlan ? {
        recipeMustConsiderFactsHash: hashText(JSON.stringify(recipeMustConsiderFactsPlan)),
        ...recipeMustConsiderFactsStats,
      } : {}),
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
      finalInputPolicyVersion: FINAL_INPUT_POLICY_VERSION,
      segmentedFinalBasePromptPolicyVersion: SEGMENTED_FINAL_BASE_PROMPT_POLICY_VERSION,
      segmentBridgeFrameVersion: SEGMENT_BRIDGE_FRAME_VERSION,
      segmentBridgeFrames,
      segmentPhaseAnchorFrameVersion: SEGMENT_PHASE_ANCHOR_FRAME_VERSION,
      segmentPhaseAnchorFrames,
      segmentedFinalLegacyEvidencePacketsRemoved: sanitizeSegmentedFinalBasePrompt(prompt).legacyEvidencePacketsRemoved,
      segmentedFinalMode,
      segmentedRepairMode,
      finalPromptVersion: FINAL_PROMPT_VERSION,
      modelSourceBoundaryVersion: MODEL_SOURCE_BOUNDARY_VERSION,
      onscreenTextPriorityVersion: ONSCREEN_TEXT_PRIORITY_VERSION,
      visualIdentityGuardVersion: VISUAL_IDENTITY_GUARD_VERSION,
      ...(segmentedRepairMode === "source-gap" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_PATCH_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch-targeted" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_TARGETED_PATCH_PROMPT_VERSION } : {}),
      ...(segmentedRepairMode === "source-gap-patch-verified" ? { segmentedRepairPromptVersion: SEGMENTED_REPAIR_VERIFIED_PATCH_PROMPT_VERSION } : {}),
      ...sourceCueMeta,
      ...recipeEvidenceLedgerBaseMeta,
      ...visualFrameLedgerBaseMeta,
      candidatePlan,
      candidatePlanHash,
      ...(sourceCuePacketPlan ? {
        sourceCuePacketHash: hashText(JSON.stringify(sourceCuePacketPlan)),
        ...(sourceCuePacketPlan.evidencePacketSourceCueBridgeVersion ? {
          evidencePacketSourceCueBridgeVersion: sourceCuePacketPlan.evidencePacketSourceCueBridgeVersion,
          evidencePacketBridgeMatchedCount: sourceCuePacketPlan.evidencePacketBridgeMatchedCount ?? 0,
          evidencePacketBridgeCount: sourceCuePacketPlan.evidencePacketBridgeCount ?? 0,
          evidencePacketBridgeSkippedCount: sourceCuePacketPlan.evidencePacketBridgeSkippedCount ?? 0,
        } : {}),
      } : {}),
      ...(recipeEvidenceLedgerPlan ? {
        recipeEvidenceLedgerHash: hashText(JSON.stringify(recipeEvidenceLedgerPlan)),
        ...recipeEvidenceLedgerStats,
      } : {}),
      ...(visualFrameLedgerPlan ? {
        visualFrameLedgerHash: hashText(JSON.stringify(visualFrameLedgerPlan)),
        ...visualFrameLedgerStats,
      } : {}),
      ...(recipeMustConsiderFactsPlan ? {
        recipeMustConsiderFactsHash: hashText(JSON.stringify(recipeMustConsiderFactsPlan)),
        ...recipeMustConsiderFactsStats,
      } : {}),
      frameCacheDir: frameResult.frameDir,
      frameCount: frames.length,
      segmentPlan,
      segmentSelectorCacheReuses,
      segmentSelectorDeterministicSelections,
      descriptionMenuParentRangePlan,
      segmentKeyframes,
      visualFrameLedgerPlan,
      recipeMustConsiderFactsPlan,
    });
    throw error;
  }
}

export function createCodexVisionKeyframesClient(options = {}) {
  const model = options.model || process.env.RECIPE_LOOP_CODEX_VISION_MODEL || DEFAULT_FINAL_MODEL;
  const selectorModel = options.selectorModel || process.env.RECIPE_LOOP_CODEX_VISION_SELECTOR_MODEL || DEFAULT_SELECTOR_MODEL;
  const segmentModel = options.segmentModel || process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_MODEL || DEFAULT_SEGMENT_MODEL;
  const singleRecipeOnly = Boolean(options.singleRecipeOnly);
  const requestedKeyframeMode = keyframeModeFrom(options.keyframeMode ?? process.env.RECIPE_LOOP_CODEX_VISION_KEYFRAME_MODE);
  const keyframeMode = singleRecipeOnly ? "global" : requestedKeyframeMode;
  const segmentedFinalMode = segmentedFinalModeFrom(options.segmentedFinalMode ?? process.env.RECIPE_LOOP_CODEX_VISION_SEGMENTED_FINAL_MODE);
  const segmentedRepairMode = segmentedRepairModeFrom(options.segmentedRepairMode ?? process.env.RECIPE_LOOP_CODEX_VISION_SEGMENTED_REPAIR_MODE);
  const cacheDir = options.cacheDir || CACHE_DIR;
  const frameOptions = {
    mode: options.frameMode || (singleRecipeOnly ? SINGLE_FAST_FRAME_MODE : "scene"),
    maxFrames: positiveInt(options.maxFrames, DEFAULT_MAX_FRAMES),
    storyboardMaxFrames: Number(options.storyboardMaxFrames ?? DEFAULT_STORYBOARD_MAX_FRAMES),
    sceneDetail: options.sceneDetail || "dense",
    sceneSelection: options.sceneSelection || "balanced",
    interval: Number(options.interval ?? (singleRecipeOnly ? SINGLE_FAST_INTERVAL_SEC : 10)),
    hybridAnchorBudget: positiveInt(
      options.hybridAnchorBudget,
      singleRecipeOnly ? SINGLE_FAST_HYBRID_ANCHOR_BUDGET : 72,
    ),
  };
  const selectorCandidateLimit = positiveInt(
    options.selectorCandidateLimit,
    singleRecipeOnly ? SINGLE_FAST_SELECTOR_CANDIDATE_LIMIT : DEFAULT_SELECTOR_CANDIDATE_LIMIT,
  );
  const keyframeTotalLimit = positiveInt(
    options.keyframeTotalLimit,
    singleRecipeOnly ? SINGLE_FAST_KEYFRAME_TOTAL_LIMIT : DEFAULT_KEYFRAME_TOTAL_LIMIT,
  );
  const keyframesPerRecipe = positiveInt(options.keyframesPerRecipe, DEFAULT_KEYFRAMES_PER_RECIPE);
  const segmentOptions = {
    paddingSec: nonNegativeNumber(options.segmentPaddingSec, DEFAULT_SEGMENT_PADDING_SEC),
    minFrames: positiveInt(options.segmentMinFrames, DEFAULT_SEGMENT_MIN_FRAMES),
    maxFrames: positiveInt(options.segmentMaxFrames, DEFAULT_SEGMENT_MAX_FRAMES),
    maxCount: positiveInt(options.segmentMaxCount, DEFAULT_SEGMENT_MAX_COUNT),
    frameTotalLimit: positiveInt(options.segmentFrameTotalLimit, DEFAULT_SEGMENT_FRAME_TOTAL_LIMIT),
    overlapToleranceSec: positiveNumber(options.segmentOverlapToleranceSec, DEFAULT_SEGMENT_OVERLAP_TOLERANCE_SEC),
  };
  segmentOptions.selectorCandidateLimit = Math.max(
    segmentOptions.maxFrames,
    positiveInt(options.segmentSelectorCandidateLimit, DEFAULT_SEGMENT_SELECTOR_CANDIDATE_LIMIT ?? segmentOptions.maxFrames),
  );
  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const sourceCuePackets = Boolean(options.sourceCuePackets);
  const recipeEvidenceLedgerPrompt = Boolean(options.recipeEvidenceLedgerPrompt);
  const recipeEvidenceLedger = Boolean(options.recipeEvidenceLedger || recipeEvidenceLedgerPrompt);
  const visualFrameLedgerPrompt = Boolean(options.visualFrameLedgerPrompt);
  const visualFrameLedgerBatchSize = Math.floor(nonNegativeNumber(
    options.visualFrameLedgerBatchSize ?? process.env.RECIPE_LOOP_CODEX_VISION_VISUAL_FRAME_LEDGER_BATCH_SIZE,
    DEFAULT_VISUAL_FRAME_LEDGER_BATCH_SIZE,
  ));
  const segmentBridgeFrames = booleanOption(
    options.segmentBridgeFrames ?? process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_BRIDGE_FRAMES,
    DEFAULT_SEGMENT_BRIDGE_FRAMES,
  );
  const segmentPhaseAnchorFrames = booleanOption(
    options.segmentPhaseAnchorFrames ?? process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_PHASE_ANCHOR_FRAMES,
    DEFAULT_SEGMENT_PHASE_ANCHOR_FRAMES,
  );
  const segmentSelectorAutoSelect = booleanOption(
    options.segmentSelectorAutoSelect ?? process.env.RECIPE_LOOP_CODEX_VISION_SEGMENT_SELECTOR_AUTO_SELECT,
    false,
  );
  const codexExec = options.codexExec ?? runCodexExec;
  const extractFrames = options.extractFrames ?? defaultExtractFrames;

  return {
    async generate({ prompt, videoUrl = null, cacheText = "", evidencePacketBundle = null }) {
      const totalStartedAt = Date.now();
      const videoId = videoIdFromUrl(videoUrl) ?? hashText(videoUrl, 12);
      const frameStartedAt = Date.now();
      const frameResult = await extractFrames({
        videoUrl,
        videoId,
        cacheDir,
        frameOptions,
        timeoutMs,
        runCommandImpl: options.runCommand,
      });
      const frameExtractMs = Date.now() - frameStartedAt;
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
          recipeEvidenceLedger,
          recipeEvidenceLedgerPrompt,
          visualFrameLedgerPrompt,
          visualFrameLedgerBatchSize,
          segmentedFinalMode,
          segmentedRepairMode,
          segmentBridgeFrames,
          segmentPhaseAnchorFrames,
          segmentSelectorAutoSelect,
          evidencePacketBundle,
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
        frameOptions,
        singleRecipeOnly,
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
          singleRecipeOnly,
        });
        const selectorPromptPath = path.join(resultDir, "selector.prompt.md");
        const selectorRawPath = path.join(resultDir, "selector.raw.md");
        const selectorLogPath = path.join(resultDir, "selector.log");
        const selectorJsonPath = path.join(resultDir, "selector.json");
        await writeFile(selectorPromptPath, selectorPrompt, "utf8");

        let selectorJson;
        let modelCallCount = 0;
        const selectorStartedAt = Date.now();
        if (!options.noCache && existsSync(selectorJsonPath)) {
          selectorJson = JSON.parse(await readFile(selectorJsonPath, "utf8"));
        } else {
          modelCallCount += 1;
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
        const selectorMs = Date.now() - selectorStartedAt;

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
              reason: frame.selectionReason ?? frame.reason ?? null,
              scene_score: frame.scene_score ?? null,
              resolutionSource: frame.resolutionSource ?? null,
              visualEvidence: frame.visualEvidence ?? {
                observed: [],
                onscreenText: [],
                quantityCues: [],
                confidence: null,
              },
            })),
          }, null, 2) + "\n",
          "utf8",
        );

        stage = "final";
        const finalPrompt = buildFinalPrompt({
          prompt,
          sourceText: cacheText,
          selectedFrames,
          selectorJson,
          singleRecipeOnly,
        });
        const finalPromptPath = path.join(resultDir, "final.prompt.md");
        const finalRawPath = path.join(resultDir, "final.raw.md");
        const finalLogPath = path.join(resultDir, "final.log");
        await writeFile(finalPromptPath, finalPrompt, "utf8");

        const finalStartedAt = Date.now();
        modelCallCount += 1;
        const finalRaw = await codexExec({
          prompt: finalPrompt,
          images: selectedFrames.map((frame) => frame.path),
          model,
          codexEffort: options.codexEffort,
          outputPath: finalRawPath,
          logPath: finalLogPath,
          timeoutMs,
        });
        const finalMs = Date.now() - finalStartedAt;
        await writeFile(finalRawPath, finalRaw, "utf8");

        const rawJson = extractJsonFromText(finalRaw);
        if (!isObject(rawJson) || !Array.isArray(rawJson.recipes)) {
          throw new Error("Codex Vision keyframes 최종 JSON은 { recipes: [...] } 형식이어야 합니다.");
        }
        if (singleRecipeOnly && rawJson.recipes.length !== 1) {
          throw new Error(`SINGLE_RECIPE_CONTRACT: expected exactly 1 recipe, received ${rawJson.recipes.length}`);
        }
        const validation = validateOnscreenAmountEvidence(rawJson, selectedFrames);
        const json = validation.json;
        await writeFile(
          path.join(resultDir, "source-conflicts.json"),
          JSON.stringify({ conflictCount: validation.conflicts.length, conflicts: validation.conflicts }, null, 2) + "\n",
          "utf8",
        );

        const evidenceSummary = selectedFrameEvidenceSummary(selectedFrames);
        const extractionStats = frameResult.extractionStats ?? {};
        const availability = sourceAvailability(cacheText, evidenceSummary);
        const totalFreshMs = Date.now() - totalStartedAt;

        const meta = {
          provider: PROVIDER,
          model,
          selectorModel,
          keyframeMode,
          requestedKeyframeMode,
          singleRecipeOnly,
          singleRecipeProfile: singleRecipeOnly ? "fast12-v3" : null,
          clientVersion: CLIENT_VERSION,
          selectorPromptVersion: SELECTOR_PROMPT_VERSION,
          finalPromptVersion: FINAL_PROMPT_VERSION,
          cached: false,
          usedVisual: true,
          frameCount: frames.length,
          candidateFrameCount: candidateFrames.length,
          selectorCandidateLimit,
          selectorInputImageCount: candidateFrames.length,
          selectedFrameCount: selectedFrames.length,
          selectedFrameHash,
          frameMode: frameOptions.mode,
          interval: frameOptions.interval,
          hybridAnchorBudget: frameOptions.hybridAnchorBudget,
          modelCallCount,
          frame_extract_ms: frameExtractMs,
          selector_ms: selectorMs,
          final_ms: finalMs,
          total_fresh_ms: totalFreshMs,
          selectedFrameEvidenceSummary: evidenceSummary,
          sourceAvailability: availability,
          sourceConflictCount: validation.conflicts.length,
          sceneCandidateCount: extractionStats.scene_candidate_count ?? extractionStats.scene_candidates ?? null,
          intervalAnchorCount: extractionStats.interval_anchor_count ?? 0,
          hybridDedupedCount: extractionStats.hybrid_deduped_count ?? 0,
          timelineCoverageRatio: extractionStats.timeline_coverage_ratio ?? null,
          lastFrameSec: extractionStats.last_frame_sec ?? null,
          durationSec: extractionStats.duration_sec ?? null,
          frameCacheHit: frameResult.frameCacheHit,
          visionCacheHit: false,
          frameCacheDir: frameResult.frameDir,
          codexVisionKeyframesCacheDir: resultDir,
          extractionStats,
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
