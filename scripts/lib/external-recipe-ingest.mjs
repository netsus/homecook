import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const FOODSERVICE_RECIPE_SERVICE_ID = "COOKRCP01";
export const FOODSERVICE_RECIPE_ENDPOINT = "https://openapi.foodsafetykorea.go.kr/api";

export const RECIPE_PILOT_BUCKETS = [
  { key: "soup_stew", label: "한식 국/찌개/탕", min: 4, max: 5 },
  { key: "rice_noodle_main", label: "밥/면/일품", min: 4, max: 5 },
  { key: "side_stir_grill", label: "반찬/볶음/구이", min: 4, max: 5 },
  { key: "quick_simple", label: "간단/30분 이내", min: 3, max: 4 },
  { key: "protein_diet_salad", label: "고단백/다이어트/샐러드", min: 3, max: 4 },
  { key: "snack_dessert", label: "간식/디저트", min: 2, max: 3 },
  { key: "reserve", label: "예비 슬롯", min: 2, max: 4 },
];

export const DEFAULT_COOKING_METHODS = [
  { code: "slice", label: "썰기" },
  { code: "mince", label: "다지기" },
  { code: "thaw", label: "해동" },
  { code: "pre_season", label: "밑간" },
  { code: "pickle", label: "절이기" },
  { code: "boil", label: "끓이기" },
  { code: "parboil", label: "삶기" },
  { code: "blanch", label: "데치기" },
  { code: "steam", label: "찌기" },
  { code: "stir_fry", label: "볶기" },
  { code: "grill", label: "굽기" },
  { code: "pan_fry", label: "부치기" },
  { code: "deep_fry", label: "튀기기" },
  { code: "mix", label: "섞기" },
  { code: "toss", label: "무치기" },
  { code: "braise", label: "조리기" },
  { code: "reduce", label: "졸이기" },
  { code: "microwave", label: "전자레인지" },
  { code: "oven_bake", label: "오븐굽기" },
  { code: "air_fryer", label: "에어프라이어" },
];

export const COOKING_METHOD_SYNONYMS = [
  { code: "boil", label: "끓이기", patterns: [/끓/u, /국물/u, /탕/u, /찌개/u] },
  { code: "parboil", label: "삶기", patterns: [/삶/u] },
  { code: "blanch", label: "데치기", patterns: [/데치/u] },
  { code: "steam", label: "찌기", patterns: [/찌기|쪄/u] },
  { code: "stir_fry", label: "볶기", patterns: [/볶/u] },
  { code: "grill", label: "굽기", patterns: [/굽|구워|노릇/u] },
  { code: "deep_fry", label: "튀기기", patterns: [/튀기/u] },
  { code: "pan_fry", label: "부치기", patterns: [/부치|전/u] },
  { code: "toss", label: "무치기", patterns: [/무치|버무리/u] },
  { code: "braise", label: "조리기", patterns: [/조리/u] },
  { code: "reduce", label: "졸이기", patterns: [/졸/u] },
  { code: "microwave", label: "전자레인지", patterns: [/전자레인지|전자렌지/u] },
  { code: "oven_bake", label: "오븐굽기", patterns: [/오븐/u] },
  { code: "air_fryer", label: "에어프라이어", patterns: [/에어프라이어/u] },
  { code: "mix", label: "섞기", patterns: [/섞/u] },
];

const SYSTEM_TAGS = new Set([
  "한식",
  "국물요리",
  "밑반찬",
  "디저트",
  "면요리",
  "샐러드",
  "한그릇요리",
  "매콤",
  "고단백",
  "다이어트",
  "30분이내",
  "간단요리",
]);

export function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--" || !token.startsWith("--")) continue;

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = nextToken;
    index += 1;
  }

  return args;
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringOrNull(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") return String(value);

  return null;
}

export function stringOrEmpty(value) {
  return stringOrNull(value) ?? "";
}

export function normalizeText(value) {
  return stringOrEmpty(value)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foldText(value) {
  return normalizeText(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function stableId(value) {
  return sha256(stableStringify(value)).slice(0, 24);
}

export function parsePositiveInteger(value, defaultValue) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value.endsWith("\n") ? value : `${value}\n`);
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function parseDotEnv(text) {
  const env = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    env[key] = value;
  }

  return env;
}

export async function readLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return parseDotEnv(await readFile(".env.local", "utf8"));
}

export function envValue(name, localEnv) {
  return process.env[name] || localEnv[name] || "";
}

function publicDataKeySortValue(name) {
  if (name === "DATA_GO_KR_API_KEY") return 10;

  const match = name.match(/^DATA_GO_KR_API_KEY(\d+)$/);
  return match ? 10 + Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function resolveFoodSafetyKeyOptions(localEnv) {
  const allNames = [...new Set([...Object.keys(localEnv), ...Object.keys(process.env)])];
  const keyNames = allNames
    .filter((name) => name === "FOODSAFETYKOREA_API_KEY" || /^DATA_GO_KR_API_KEY\d*$/.test(name))
    .sort((left, right) => {
      if (left === "FOODSAFETYKOREA_API_KEY") return -1;
      if (right === "FOODSAFETYKOREA_API_KEY") return 1;

      return publicDataKeySortValue(left) - publicDataKeySortValue(right);
    });

  return keyNames.flatMap((keySource) => {
    const key = envValue(keySource, localEnv);

    return key ? [{ key, keySource }] : [];
  });
}

export function buildFoodSafetyRecipeUrl({ key, startIndex, endIndex }) {
  return [
    FOODSERVICE_RECIPE_ENDPOINT,
    encodeURIComponent(key),
    FOODSERVICE_RECIPE_SERVICE_ID,
    "json",
    String(startIndex),
    String(endIndex),
  ].join("/");
}

export function parseFoodSafetyRecipeResponse(payload) {
  const root = payload?.[FOODSERVICE_RECIPE_SERVICE_ID];
  const rows = Array.isArray(root?.row) ? root.row : [];
  const result = root?.RESULT ?? {};
  const totalCount = Number(root?.total_count ?? root?.TOTAL_COUNT ?? rows.length);

  return {
    rows,
    resultCode: stringOrNull(result.CODE),
    resultMessage: stringOrNull(result.MSG),
    totalCount: Number.isFinite(totalCount) ? totalCount : rows.length,
  };
}

export function normalizeRecipeTitle(value) {
  return normalizeText(value)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function recipeSourceId(row) {
  return stringOrNull(row.RCP_SEQ) ?? stableId(row);
}

export function normalizeRecipePartsText(value) {
  return normalizeText(value)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[●○◆◇■□▶▷]/g, " ")
    .replace(/(?:재료|양념|소스|육수|고명)\s*[:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const QUANTITY_UNIT_PATTERN =
  /(?:(?:\d+(?:\.\d+)?|\d+\/\d+|[½⅓⅔¼¾])\s*(?:g|kg|ml|l|L|개|장|컵|큰술|작은술|스푼|술|T|t|Ts|Ts\.|줌|쪽|대|알|봉|캔|팩|포|줄기|마리|토막|꼬집|cm)?|(?:반|한|두|세|네)\s*(?:개|장|컵|큰술|작은술|스푼|술|줌|쪽|대|알|봉|캔|팩|포|줄기|마리|토막|꼬집)|(?:약간|조금|적당량))/giu;
const LEADING_PREP_PATTERN =
  /^(다진|간|채 썬|채썬|송송 썬|송송썬|썬|자른|깐|삶은|데친|불린|볶은|구운|냉동|냉장)\s+/u;
const SECTION_MARKER_PATTERN = /^[●○◆◇■□▶▷•·\-\s]+/u;
const SECTION_LABEL_WITH_COLON_PATTERN = /^([가-힣A-Za-z0-9\s/·&()]{1,28})\s*[:：]\s*(.*)$/u;
const SECTION_LABEL_WITHOUT_COLON_PATTERN =
  /^([가-힣A-Za-z0-9\s/·&()]{0,18}(?:주재료|필수\s*재료|재료|양념장|양념|소스|드레싱|육수|고명|장식|곁들임(?:채소)?|채소준비|절임물|반죽|필링|밑간|국물))\s+(.+)$/u;
const SECTION_LABEL_KEYWORD_PATTERN =
  /(?:주재료|필수\s*재료|재료|양념장|양념|소스|드레싱|육수|고명|장식|곁들임|채소준비|절임물|반죽|필링|밑간|국물)/u;
const SECTION_LABEL_ONLY_PATTERN =
  /^(?:주재료|필수\s*재료|재료|양념장|양념|소스|드레싱|육수|고명|장식|곁들임(?:채소)?|채소준비|절임물|반죽|필링|밑간|국물)$/u;
const INGREDIENT_TEXT_HINT_PATTERN = /(?:\d|약간|조금|적당량|취향|,|，|、|;|；|\(|\))/u;

export function splitIngredientParts(value) {
  return splitIngredientPartsWithLabels(value).map((part) => part.text);
}

export function normalizeComponentLabel(value) {
  const label = normalizeText(value)
    .replace(SECTION_MARKER_PATTERN, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:의)?\s*재료$/u, " 재료")
    .trim();

  return label.length > 0 ? label : null;
}

function stripBracketedComponentLabel(line) {
  const match = /^\[([^\]]+)\]\s*(.*)$/u.exec(line);
  if (!match) return { componentLabel: null, text: line };

  const label = normalizeComponentLabel(match[1]);
  if (!label || !SECTION_LABEL_KEYWORD_PATTERN.test(label)) {
    return { componentLabel: null, text: normalizeText(match[2]) };
  }

  return {
    componentLabel: label,
    text: normalizeText(match[2]),
  };
}

function splitComponentLabelFromLine(line) {
  const bracketed = stripBracketedComponentLabel(line);
  if (bracketed.componentLabel) return bracketed;

  const markerStripped = normalizeText(line).replace(SECTION_MARKER_PATTERN, "").trim();
  const colonMatch = SECTION_LABEL_WITH_COLON_PATTERN.exec(markerStripped);
  if (colonMatch && SECTION_LABEL_KEYWORD_PATTERN.test(colonMatch[1])) {
    return {
      componentLabel: normalizeComponentLabel(colonMatch[1]),
      text: normalizeText(colonMatch[2]),
    };
  }

  const noColonMatch = SECTION_LABEL_WITHOUT_COLON_PATTERN.exec(markerStripped);
  if (noColonMatch && SECTION_LABEL_KEYWORD_PATTERN.test(noColonMatch[1])) {
    return {
      componentLabel: normalizeComponentLabel(noColonMatch[1]),
      text: normalizeText(noColonMatch[2]),
    };
  }

  return { componentLabel: null, text: markerStripped };
}

function isStandaloneComponentLabel(line) {
  const label = normalizeComponentLabel(line);

  return Boolean(label && label.length <= 16 && SECTION_LABEL_ONLY_PATTERN.test(label));
}

function splitPartText(value) {
  return normalizeText(value)
    .split(/[,;，、；]|(?:\s+-\s+)|(?:\s{2,})/u)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0 && !/^\d+[.)]?$/.test(part));
}

export function splitIngredientPartsWithLabels(value, { title } = {}) {
  const raw = stringOrEmpty(value).normalize("NFKC").replace(/\u00a0/g, " ");
  const titleKey = foldText(title);
  const parts = [];
  let currentComponentLabel = null;

  for (const rawLine of raw.split(/\r?\n+/u)) {
    const line = normalizeText(rawLine);
    if (!line) continue;
    if (titleKey && foldText(line) === titleKey) continue;

    const { componentLabel, text } = splitComponentLabelFromLine(line);
    if (componentLabel) currentComponentLabel = componentLabel;

    if (!text) continue;
    if (!INGREDIENT_TEXT_HINT_PATTERN.test(text) && isStandaloneComponentLabel(text)) {
      currentComponentLabel = normalizeComponentLabel(text);
      continue;
    }

    for (const part of splitPartText(text)) {
      parts.push({
        text: part,
        component_label: currentComponentLabel,
      });
    }
  }

  return parts;
}

export function parseIngredientPart(part, componentLabel = null) {
  const original = normalizeText(part);
  const amountMatches = [...original.matchAll(QUANTITY_UNIT_PATTERN)].map((match) => match[0].trim());
  const amountText = amountMatches.join(" ") || null;
  const name = original
    .replace(QUANTITY_UNIT_PATTERN, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_PREP_PATTERN, "")
    .replace(/^(및|와|과)\s+/u, "")
    .trim();

  return {
    display_text: original,
    parsed_name: name,
    amount_text: amountText,
    component_label: componentLabel,
  };
}

export function buildIngredientLookup({ ingredients = [], ingredient_synonyms = [] }) {
  const exact = new Map();
  const synonyms = new Map();

  for (const ingredient of ingredients) {
    const id = stringOrNull(ingredient.id);
    const standardName = stringOrNull(ingredient.standard_name);
    if (!id || !standardName) continue;

    exact.set(foldText(standardName), { id, standard_name: standardName, match_kind: "standard_name" });
  }

  for (const synonymRow of ingredient_synonyms) {
    const synonym = stringOrNull(synonymRow.synonym);
    const nested = isRecord(synonymRow.ingredients) ? synonymRow.ingredients : {};
    const ingredientId = stringOrNull(synonymRow.ingredient_id) ?? stringOrNull(nested.id);
    const standardName = stringOrNull(synonymRow.standard_name) ?? stringOrNull(nested.standard_name);
    if (!synonym || !ingredientId || !standardName) continue;

    synonyms.set(foldText(synonym), {
      id: ingredientId,
      standard_name: standardName,
      synonym,
      match_kind: "synonym",
    });
  }

  return { exact, synonyms };
}

export function resolveIngredientName(name, lookup) {
  const folded = foldText(name);
  if (!folded) return null;

  const exactMatch = lookup.exact.get(folded);
  if (exactMatch) return exactMatch;

  const synonymMatch = lookup.synonyms.get(folded);
  if (synonymMatch) return synonymMatch;

  const candidates = [...lookup.exact.entries()]
    .filter(([key]) => key.length >= 2 && folded.includes(key))
    .sort((left, right) => right[0].length - left[0].length);

  if (candidates.length > 0) {
    return { ...candidates[0][1], match_kind: "contained_standard_name" };
  }

  return null;
}

export function inferStepComponentLabel(instruction, componentLabels = []) {
  const text = normalizeText(instruction);
  if (!text || componentLabels.length === 0) return null;

  const foldedText = foldText(text);
  const direct = componentLabels
    .filter(Boolean)
    .find((label) => {
      const foldedLabel = foldText(label);

      return foldedLabel.length >= 2 && foldedText.includes(foldedLabel);
    });
  if (direct) return direct;

  const sectionKeywords = [
    ["소스", /소스/u],
    ["드레싱", /드레싱/u],
    ["양념장", /양념장/u],
    ["양념", /양념/u],
    ["육수", /육수/u],
    ["고명", /고명/u],
    ["반죽", /반죽/u],
    ["필링", /필링/u],
    ["밑간", /밑간/u],
  ];

  for (const [keyword, pattern] of sectionKeywords) {
    if (!pattern.test(text)) continue;

    const label = componentLabels.find((componentLabel) => pattern.test(componentLabel) || componentLabel.includes(keyword));
    if (label) return label;
  }

  return null;
}

export function extractFoodSafetySteps(row, { componentLabels = [] } = {}) {
  const steps = [];

  for (let index = 1; index <= 20; index += 1) {
    const key = `MANUAL${String(index).padStart(2, "0")}`;
    const text = normalizeText(row[key]);
    if (!text) continue;

    steps.push({
      step_number: steps.length + 1,
      instruction: text.replace(/^\d+\.\s*/u, "").trim(),
      source_key: key,
      image_url: stringOrNull(row[`MANUAL_IMG${String(index).padStart(2, "0")}`]),
      component_label: inferStepComponentLabel(text, componentLabels),
    });
  }

  return steps;
}

export function normalizeCookingMethodLabel(value) {
  const raw = normalizeText(value);
  if (!raw || raw === "기타") return null;

  const direct = DEFAULT_COOKING_METHODS.find((method) => method.label === raw);
  if (direct) return direct;

  return COOKING_METHOD_SYNONYMS.find((method) =>
    method.patterns.some((pattern) => pattern.test(raw)),
  ) ?? null;
}

export function inferCookingMethod(row, steps) {
  const direct = normalizeCookingMethodLabel(row.RCP_WAY2);
  if (direct) {
    return { ...direct, source: "RCP_WAY2" };
  }

  const stepText = steps.map((step) => step.instruction).join(" ");
  const inferred = COOKING_METHOD_SYNONYMS.find((method) =>
    method.patterns.some((pattern) => pattern.test(stepText)),
  );

  return inferred ? { code: inferred.code, label: inferred.label, source: "steps" } : null;
}

export function inferPilotBucket(row, resolvedIngredients, tags, method) {
  const title = normalizeRecipeTitle(row.RCP_NM);
  const category = normalizeText(row.RCP_PAT2);
  const haystack = [title, category, tags.join(" "), method?.label ?? ""].join(" ");

  if (/후식|디저트|간식|빵|케이크|푸딩|과자|쿠키|젤리/u.test(haystack)) return "snack_dessert";
  if (/국|찌개|탕|전골|스프|국물/u.test(haystack)) return "soup_stew";
  if (/밥|면|국수|파스타|일품|덮밥|비빔밥|볶음밥/u.test(haystack)) return "rice_noodle_main";
  if (/샐러드|닭가슴살|두부|계란|달걀|고단백|다이어트/u.test(haystack)) {
    return "protein_diet_salad";
  }
  if (/반찬|볶|구이|무침|조림|부침/u.test(haystack)) return "side_stir_grill";
  if (/간단|30분|10분|전자레인지|에어프라이어/u.test(haystack)) return "quick_simple";

  return "reserve";
}

export function inferTagCandidates(row, resolvedIngredients, method) {
  const tags = new Set(["공공레시피", "식약처레시피"]);
  const category = normalizeText(row.RCP_PAT2);
  const title = normalizeRecipeTitle(row.RCP_NM);
  const hashTag = normalizeText(row.HASH_TAG);
  const haystack = `${title} ${category} ${hashTag} ${method?.label ?? ""}`;

  if (/국|찌개|탕|전골|국물/u.test(haystack)) tags.add("국물요리");
  if (/반찬|무침|조림/u.test(haystack)) tags.add("밑반찬");
  if (/밥|면|일품|덮밥|비빔/u.test(haystack)) tags.add("한그릇요리");
  if (/후식|디저트|간식|푸딩|케이크|젤리/u.test(haystack)) tags.add("디저트");
  if (/면|국수|파스타/u.test(haystack)) tags.add("면요리");
  if (/샐러드/u.test(haystack)) tags.add("샐러드");
  if (/매운|고추|고춧가루|청양/u.test(haystack)) tags.add("매콤");
  if (resolvedIngredients.some((ingredient) => /닭가슴살|두부|계란|달걀|소고기|돼지고기/.test(ingredient.target?.standard_name ?? ""))) {
    tags.add("고단백");
  }
  if (/다이어트|저염|저당|샐러드/u.test(haystack)) tags.add("다이어트");
  if (/한식|밥|국|찌개|반찬|김치/u.test(haystack)) tags.add("한식");
  if (/전자레인지|에어프라이어|간단/u.test(haystack)) tags.add("간단요리");

  return [...tags].filter((tag) => SYSTEM_TAGS.has(tag) || tag.endsWith("레시피"));
}

export function normalizeFoodSafetyRecipeRow(row, { ingredientLookup }) {
  const sourceId = recipeSourceId(row);
  const title = normalizeRecipeTitle(row.RCP_NM);
  const rawIngredientParts = splitIngredientPartsWithLabels(row.RCP_PARTS_DTLS, { title });
  const parsedIngredients = rawIngredientParts.map((part) => parseIngredientPart(part.text, part.component_label));
  const resolvedIngredients = parsedIngredients.map((ingredient, index) => {
    const target = resolveIngredientName(ingredient.parsed_name, ingredientLookup);

    return {
      sort_order: index + 1,
      ...ingredient,
      target,
      resolved: Boolean(target),
    };
  });
  const componentLabels = [...new Set(resolvedIngredients.map((ingredient) => ingredient.component_label).filter(Boolean))];
  const steps = extractFoodSafetySteps(row, { componentLabels });
  const method = inferCookingMethod(row, steps);
  const tagCandidates = inferTagCandidates(row, resolvedIngredients, method);
  const bucket = inferPilotBucket(row, resolvedIngredients, tagCandidates, method);
  const resolvedIngredientCount = resolvedIngredients.filter((ingredient) => ingredient.resolved).length;
  const unresolvedIngredientCount = resolvedIngredients.length - resolvedIngredientCount;
  const resolvedRatio = resolvedIngredients.length > 0 ? resolvedIngredientCount / resolvedIngredients.length : 0;
  const amountQualityRatio =
    resolvedIngredients.length > 0
      ? resolvedIngredients.filter((ingredient) => ingredient.amount_text || /약간|적당량|취향/u.test(ingredient.display_text)).length /
        resolvedIngredients.length
      : 0;
  const riskFlags = [];

  if (!title) riskFlags.push("missing_title");
  if (resolvedIngredientCount < 3) riskFlags.push("fewer_than_3_resolved_ingredients");
  if (steps.length < 2) riskFlags.push("fewer_than_2_steps");
  if (!method) riskFlags.push("unresolved_cooking_method");
  if (unresolvedIngredientCount > 0) riskFlags.push("unresolved_ingredients");
  if (/광고|협찬|구매|판매|http|www\./iu.test(`${title} ${row.RCP_PARTS_DTLS ?? ""}`)) {
    riskFlags.push("promotion_or_link_text");
  }
  if (/^[ㄱ-ㅎㅏ-ㅣa-z0-9\s]{1,8}$/iu.test(title)) riskFlags.push("fixture_like_title");

  const ingredientScore = Math.round(Math.min(30, resolvedRatio * 22 + amountQualityRatio * 8));
  const stepScore = Math.round(Math.min(25, (steps.length >= 2 ? 15 : steps.length * 5) + (method ? 10 : 0)));
  const homeFitScore = /특수|전문|분자|수비드|훈연/u.test(`${title} ${row.RCP_PARTS_DTLS ?? ""}`) ? 8 : 20;
  const coverageScore = bucket === "reserve" ? 8 : 15;
  const duplicateNoiseScore = riskFlags.some((flag) => ["promotion_or_link_text", "fixture_like_title"].includes(flag)) ? 0 : 10;
  const score = ingredientScore + stepScore + homeFitScore + coverageScore + duplicateNoiseScore;

  return {
    candidate_id: `foodsafety-cookrcp:${sourceId}`,
    source_provider: "foodsafety-cookrcp",
    source_recipe_id: sourceId,
    title,
    category: normalizeText(row.RCP_PAT2),
    cooking_method_source_label: normalizeText(row.RCP_WAY2),
    cooking_method: method,
    bucket,
    thumbnail_url: stringOrNull(row.ATT_FILE_NO_MAIN),
    image_url: stringOrNull(row.ATT_FILE_NO_MK),
    raw_ingredient_text: stringOrNull(row.RCP_PARTS_DTLS),
    ingredients: resolvedIngredients,
    steps,
    tag_candidates: tagCandidates,
    nutrition: {
      serving_weight: stringOrNull(row.INFO_WGT),
      calories: stringOrNull(row.INFO_ENG),
      carbohydrates: stringOrNull(row.INFO_CAR),
      protein: stringOrNull(row.INFO_PRO),
      fat: stringOrNull(row.INFO_FAT),
      sodium: stringOrNull(row.INFO_NA),
    },
    risk_flags: riskFlags,
    blocked: riskFlags.some((flag) =>
      [
        "missing_title",
        "fewer_than_3_resolved_ingredients",
        "fewer_than_2_steps",
        "unresolved_cooking_method",
        "promotion_or_link_text",
      ].includes(flag),
    ),
    score_breakdown: {
      ingredient_mapping: ingredientScore,
      step_clarity_method: stepScore,
      home_fit: homeFitScore,
      category_theme_coverage: coverageScore,
      duplicate_noise_risk: duplicateNoiseScore,
    },
    score,
    raw_payload: row,
  };
}

export function selectPilotCandidates(candidates, targetCount = 30) {
  const selected = [];
  const selectedIds = new Set();
  const eligible = candidates
    .filter((candidate) => !candidate.blocked)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;

      return left.title.localeCompare(right.title, "ko-KR");
    });

  for (const bucket of RECIPE_PILOT_BUCKETS.filter((item) => item.key !== "reserve")) {
    const bucketCandidates = eligible.filter((candidate) => candidate.bucket === bucket.key);
    for (const candidate of bucketCandidates.slice(0, bucket.min)) {
      if (selected.length >= targetCount) break;
      selected.push({ ...candidate, pilot_selection_reason: `${bucket.label} 최소 구성` });
      selectedIds.add(candidate.candidate_id);
    }
  }

  for (const candidate of eligible) {
    if (selected.length >= targetCount) break;
    if (selectedIds.has(candidate.candidate_id)) continue;

    selected.push({ ...candidate, pilot_selection_reason: "점수순 예비 슬롯" });
    selectedIds.add(candidate.candidate_id);
  }

  return selected;
}

export function buildRecipeRiskReport(candidates, selected) {
  const duplicateTitleCounts = new Map();
  for (const candidate of candidates) {
    const key = foldText(candidate.title);
    if (!key) continue;
    duplicateTitleCounts.set(key, (duplicateTitleCounts.get(key) ?? 0) + 1);
  }

  const duplicateTitleCount = [...duplicateTitleCounts.values()].filter((count) => count > 1).length;
  const unresolvedIngredientNames = new Map();

  for (const candidate of candidates) {
    for (const ingredient of candidate.ingredients) {
      if (ingredient.resolved) continue;

      const name = ingredient.parsed_name || ingredient.display_text;
      unresolvedIngredientNames.set(name, (unresolvedIngredientNames.get(name) ?? 0) + 1);
    }
  }

  return {
    summary: {
      source_row_count: candidates.length,
      candidate_recipe_count: candidates.length,
      blocked_count: candidates.filter((candidate) => candidate.blocked).length,
      pilot_selected_count: selected.length,
      duplicate_normalized_title_count: duplicateTitleCount,
      unresolved_ingredient_name_count: unresolvedIngredientNames.size,
      unresolved_cooking_method_count: candidates.filter((candidate) => !candidate.cooking_method).length,
      weak_step_count: candidates.filter((candidate) => candidate.steps.length < 2).length,
      production_db_writes: 0,
    },
    unresolved_ingredient_names: [...unresolvedIngredientNames.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko-KR"))
      .map(([name, count]) => ({ name, count })),
    bucket_counts: Object.fromEntries(
      RECIPE_PILOT_BUCKETS.map((bucket) => [
        bucket.key,
        candidates.filter((candidate) => candidate.bucket === bucket.key).length,
      ]),
    ),
    risk_flag_counts: countBy(candidates.flatMap((candidate) => candidate.risk_flags)),
  };
}

export function countBy(values) {
  const counts = {};

  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "ko-KR")));
}

export function escapeHtml(value) {
  return stringOrEmpty(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
