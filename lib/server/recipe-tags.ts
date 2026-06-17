export type RecipeTagKind = "semantic" | "ingredient" | "method" | "source" | "user";
export type RecipeTagSource = "system_suggested" | "user_reviewed" | "provider" | "backfill" | "admin";
export type RecipeTagVisibility = "public" | "public_pending" | "private";
export type RecipeTagReviewStatus = "approved" | "pending" | "rejected";

export interface RecipeTagSeed {
  label: string;
  normalized_key: string;
  kind: Extract<RecipeTagKind, "semantic" | "source">;
  theme_eligible: true;
}

export interface RecipeTagWrite {
  label: string;
  normalized_key: string;
  kind: RecipeTagKind;
  source: RecipeTagSource;
  confidence: number;
  visibility: RecipeTagVisibility;
  review_status: RecipeTagReviewStatus;
  theme_eligible: boolean;
  is_system: boolean;
}

export interface RecipeTagValidationField {
  field: "tags";
  reason: "invalid_array" | "empty" | "blocked" | "max_length" | "too_many" | "duplicate";
}

export interface RecipeTagSuggestionInput {
  sourceType?: "manual" | "system" | "youtube";
  title: string;
  baseServings?: number | null;
  totalTimeMinutes?: number | null;
  ingredientNames: string[];
  stepTexts: string[];
  cookingMethodLabels: string[];
  providerTags?: string[];
}

const RECIPE_TAG_MAX_LENGTH = 12;
const REVIEWED_TAG_LIMIT = 8;
const SUGGESTED_TAG_LIMIT = 6;

const SEMANTIC_TAG_LABELS = [
  "자취요리",
  "초보가능",
  "밀프렙",
  "도시락반찬",
  "냉털요리",
  "아이반찬",
  "술안주",
  "캠핑요리",
  "10분컷",
  "30분이내",
  "간단요리",
  "원팬요리",
  "에어프라이어",
  "전자레인지",
  "불없이",
  "노오븐",
  "고단백",
  "다이어트",
  "저당",
  "저탄수",
  "채식한끼",
  "발효한끼",
  "한식",
  "국물요리",
  "밑반찬",
  "디저트",
  "K디저트",
  "면요리",
  "분식",
  "샐러드",
  "한그릇요리",
  "해장요리",
  "매콤",
  "바삭",
  "밥도둑",
] as const;

export const P0_RECIPE_TAG_SEEDS: RecipeTagSeed[] = [
  ...SEMANTIC_TAG_LABELS.map((label) => ({
    label,
    normalized_key: normalizeRecipeTagKey(label),
    kind: "semantic" as const,
    theme_eligible: true as const,
  })),
  {
    label: "유튜브레시피",
    normalized_key: "유튜브레시피",
    kind: "source",
    theme_eligible: true,
  },
];

export const P1_RECIPE_TAG_CANDIDATES = [
  "유명셰프요리",
  "SNS화제",
  "검증된레시피",
] as const;

const SYSTEM_TAG_BY_KEY = new Map(
  P0_RECIPE_TAG_SEEDS.map((tag) => [tag.normalized_key, tag]),
);

function collapseWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function stripHashPrefix(value: string) {
  return value.replace(/^#+/u, "");
}

export function normalizeRecipeTagKey(value: string) {
  return collapseWhitespace(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/gu, "");
}

function normalizeRecipeTagLabel(rawValue: unknown) {
  if (typeof rawValue !== "string") {
    return { label: null, field: { field: "tags", reason: "empty" } satisfies RecipeTagValidationField };
  }

  const label = stripHashPrefix(collapseWhitespace(rawValue));
  if (!label) {
    return { label: null, field: { field: "tags", reason: "empty" } satisfies RecipeTagValidationField };
  }

  if (/(?:https?:\/\/|www\.|@|광고|협찬|구매|판매|쿠폰|링크)/iu.test(label)) {
    return { label: null, field: { field: "tags", reason: "blocked" } satisfies RecipeTagValidationField };
  }

  if (Array.from(label).length > RECIPE_TAG_MAX_LENGTH) {
    return { label: null, field: { field: "tags", reason: "max_length" } satisfies RecipeTagValidationField };
  }

  return { label, field: null };
}

function createRecipeTagWrite({
  label,
  source,
  confidence,
}: {
  label: string;
  source: RecipeTagSource;
  confidence: number;
}): RecipeTagWrite {
  const normalizedKey = normalizeRecipeTagKey(label);
  const systemTag = SYSTEM_TAG_BY_KEY.get(normalizedKey);

  if (systemTag) {
    return {
      label: systemTag.label,
      normalized_key: systemTag.normalized_key,
      kind: systemTag.kind,
      source,
      confidence,
      visibility: "public",
      review_status: "approved",
      theme_eligible: systemTag.theme_eligible,
      is_system: true,
    };
  }

  return {
    label,
    normalized_key: normalizedKey,
    kind: "user",
    source,
    confidence,
    visibility: source === "user_reviewed" ? "public_pending" : "private",
    review_status: "pending",
    theme_eligible: false,
    is_system: false,
  };
}

export function normalizeReviewedRecipeTagLabels(rawTags: unknown): {
  fields: RecipeTagValidationField[];
  tags: RecipeTagWrite[];
} {
  if (!Array.isArray(rawTags)) {
    return {
      fields: [{ field: "tags", reason: "invalid_array" }],
      tags: [],
    };
  }

  if (rawTags.length > REVIEWED_TAG_LIMIT) {
    return {
      fields: [{ field: "tags", reason: "too_many" }],
      tags: [],
    };
  }

  const fields: RecipeTagValidationField[] = [];
  const seen = new Set<string>();
  const tags: RecipeTagWrite[] = [];

  for (const rawTag of rawTags) {
    const normalized = normalizeRecipeTagLabel(rawTag);
    if (normalized.field) {
      fields.push(normalized.field);
      continue;
    }

    const key = normalizeRecipeTagKey(normalized.label);
    if (seen.has(key)) {
      fields.push({ field: "tags", reason: "duplicate" });
      continue;
    }

    seen.add(key);
    tags.push(createRecipeTagWrite({
      label: normalized.label,
      source: "user_reviewed",
      confidence: 1,
    }));
  }

  return fields.length > 0 ? { fields, tags: [] } : { fields, tags };
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function excludesAny(text: string, values: string[]) {
  return values.every((value) => !text.includes(value));
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasExplicitVegetarianEvidence(text: string, ingredientText: string) {
  const animalSignals = [
    "소고기",
    "쇠고기",
    "돼지고기",
    "삼겹살",
    "목살",
    "닭",
    "닭고기",
    "닭가슴살",
    "계란",
    "달걀",
    "우유",
    "버터",
    "치즈",
    "생선",
    "연어",
    "참치",
    "고등어",
    "새우",
    "오징어",
    "멸치",
    "젓갈",
  ];

  if (!excludesAny(ingredientText, animalSignals)) {
    return false;
  }

  return includesAny(text, ["채식", "비건", "베지", "식물성", "두부", "버섯", "채소", "샐러드"]);
}

function pushSuggestedTag(tags: RecipeTagWrite[], seen: Set<string>, label: string, confidence: number) {
  if (tags.length >= SUGGESTED_TAG_LIMIT) {
    return;
  }

  const key = normalizeRecipeTagKey(label);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  tags.push(createRecipeTagWrite({
    label,
    source: "system_suggested",
    confidence,
  }));
}

export function buildSuggestedRecipeTags(input: RecipeTagSuggestionInput): RecipeTagWrite[] {
  const title = input.title.toLocaleLowerCase("ko-KR");
  const ingredients = input.ingredientNames.join(" ").toLocaleLowerCase("ko-KR");
  const steps = input.stepTexts.join(" ").toLocaleLowerCase("ko-KR");
  const methods = input.cookingMethodLabels.join(" ").toLocaleLowerCase("ko-KR");
  const providerTags = (input.providerTags ?? []).join(" ").toLocaleLowerCase("ko-KR");
  const evidenceText = [title, ingredients, steps, methods].join(" ");
  const text = [evidenceText, providerTags].join(" ");
  const tags: RecipeTagWrite[] = [];
  const seen = new Set<string>();
  const ingredientCount = input.ingredientNames.filter((name) => name.trim()).length;
  const stepCount = input.stepTexts.filter((step) => step.trim()).length;
  const baseServings = input.baseServings;
  const totalTimeMinutes = input.totalTimeMinutes;

  if (input.sourceType === "youtube") {
    pushSuggestedTag(tags, seen, "유튜브레시피", 0.99);
  }

  if (
    includesAny(evidenceText, ["자취", "혼밥"])
    || (
      isPositiveNumber(baseServings)
      && baseServings <= 2
      && ingredientCount > 0
      && ingredientCount <= 6
      && stepCount > 0
      && stepCount <= 4
      && (!isPositiveNumber(totalTimeMinutes) || totalTimeMinutes <= 30)
    )
  ) {
    pushSuggestedTag(tags, seen, "자취요리", 0.88);
  }

  if (
    (isPositiveNumber(totalTimeMinutes) && totalTimeMinutes <= 10)
    || includesAny(evidenceText, ["10분", "십분", "10분컷"])
  ) {
    pushSuggestedTag(tags, seen, "10분컷", 0.91);
  } else if (
    (isPositiveNumber(totalTimeMinutes) && totalTimeMinutes <= 30)
    || includesAny(evidenceText, ["30분", "삼십분", "30분이내", "30분 이내"])
  ) {
    pushSuggestedTag(tags, seen, "30분이내", 0.86);
  }

  if (includesAny(evidenceText, ["전자레인지", "렌지", "레인지"])) {
    pushSuggestedTag(tags, seen, "전자레인지", 0.92);
  }

  if (includesAny(evidenceText, ["에어프라이어", "에프"])) {
    pushSuggestedTag(tags, seen, "에어프라이어", 0.92);
  }

  if (includesAny(evidenceText, ["불 없이", "불없이", "불을 쓰지", "가스불 없이"])) {
    pushSuggestedTag(tags, seen, "불없이", 0.86);
  }

  if (includesAny(evidenceText, ["노오븐", "오븐 없이", "오븐없이"])) {
    pushSuggestedTag(tags, seen, "노오븐", 0.86);
  }

  if (includesAny(evidenceText, ["한 팬", "한팬", "원팬", "팬 하나"])) {
    pushSuggestedTag(tags, seen, "원팬요리", 0.88);
  }

  if (includesAny(evidenceText, ["한그릇", "한 그릇", "덮밥", "비빔밥", "볶음밥", "계란밥"])) {
    pushSuggestedTag(tags, seen, "한그릇요리", 0.84);
  }

  if (includesAny(text, ["김치", "된장", "고추장", "간장", "찌개", "국물", "나물", "불고기"])) {
    pushSuggestedTag(tags, seen, "한식", 0.92);
  }

  if (includesAny(text, ["찌개", "국물", "전골", "육수", "보글"])) {
    pushSuggestedTag(tags, seen, "국물요리", 0.9);
  }

  if (includesAny(evidenceText, ["밑반찬", "반찬", "무침", "조림", "절임"])) {
    pushSuggestedTag(tags, seen, "밑반찬", 0.84);
  }

  if (includesAny(text, ["디저트", "베이킹", "케이크", "쿠키", "푸딩", "빵"])) {
    pushSuggestedTag(tags, seen, "디저트", 0.9);
  }

  if (includesAny(text, ["약과", "떡", "호떡", "인절미", "식혜", "수정과", "경단"])) {
    pushSuggestedTag(tags, seen, "K디저트", 0.9);
  }

  if (includesAny(text, ["국수", "면", "라면", "우동", "소바", "파스타", "냉면"])) {
    pushSuggestedTag(tags, seen, "면요리", 0.86);
  }

  if (includesAny(text, ["떡볶이", "김밥", "순대", "라볶이", "어묵", "튀김만두"])) {
    pushSuggestedTag(tags, seen, "분식", 0.88);
  }

  if (includesAny(evidenceText, ["샐러드", "드레싱", "채소볼"])) {
    pushSuggestedTag(tags, seen, "샐러드", 0.88);
  }

  if (includesAny(text, ["해장", "숙취", "콩나물국", "북엇국", "황태국"])) {
    pushSuggestedTag(tags, seen, "해장요리", 0.9);
  }

  if (includesAny(text, ["매콤", "매운", "고춧가루", "고추장", "청양고추", "불닭"])) {
    pushSuggestedTag(tags, seen, "매콤", 0.9);
  }

  if (includesAny(text, ["바삭", "튀김", "튀기", "크리스피"])) {
    pushSuggestedTag(tags, seen, "바삭", 0.86);
  }

  if (includesAny(text, ["밥도둑", "장조림", "제육", "양념장", "짭짤"])) {
    pushSuggestedTag(tags, seen, "밥도둑", 0.84);
  }

  if (includesAny(text, ["초보", "쉬운", "간단", "간편"]) || (ingredientCount <= 6 && stepCount <= 4)) {
    pushSuggestedTag(tags, seen, "초보가능", 0.84);
  }

  if (includesAny(evidenceText, ["간단", "간편", "뚝딱"])) {
    pushSuggestedTag(tags, seen, "간단요리", 0.82);
  }

  if (includesAny(ingredients, ["닭가슴살", "계란", "달걀", "두부", "소고기", "돼지고기", "연어", "참치"])) {
    pushSuggestedTag(tags, seen, "고단백", 0.82);
  }

  if (includesAny(evidenceText, ["다이어트", "저칼로리", "칼로리", "식단관리", "식단 관리"])) {
    pushSuggestedTag(tags, seen, "다이어트", 0.86);
  }

  if (includesAny(evidenceText, ["저당", "무설탕", "설탕 없이", "설탕없이", "당 줄"])) {
    pushSuggestedTag(tags, seen, "저당", 0.88);
  }

  if (includesAny(evidenceText, ["저탄수", "키토", "탄수화물 줄", "탄수 줄"])) {
    pushSuggestedTag(tags, seen, "저탄수", 0.88);
  }

  if (hasExplicitVegetarianEvidence(evidenceText, ingredients)) {
    pushSuggestedTag(tags, seen, "채식한끼", 0.84);
  }

  if (includesAny(evidenceText, ["김치", "된장", "고추장", "간장", "청국장", "요거트", "발효"])) {
    pushSuggestedTag(tags, seen, "발효한끼", 0.8);
  }

  if (includesAny(evidenceText, ["밀프렙", "meal prep", "소분", "냉동보관", "대량 조리"])) {
    pushSuggestedTag(tags, seen, "밀프렙", 0.86);
  }

  if (includesAny(evidenceText, ["도시락반찬", "도시락 반찬", "도시락"]) || (includesAny(evidenceText, ["도시락"]) && includesAny(evidenceText, ["반찬"]))) {
    pushSuggestedTag(tags, seen, "도시락반찬", 0.84);
  }

  if (includesAny(evidenceText, ["냉털", "냉장고 털", "남은 재료", "자투리"])) {
    pushSuggestedTag(tags, seen, "냉털요리", 0.84);
  }

  if (includesAny(evidenceText, ["아이반찬", "아이 반찬", "아기반찬", "유아식", "어린이"]) && excludesAny(evidenceText, ["매운", "매콤", "청양고추", "고추장", "고춧가루"])) {
    pushSuggestedTag(tags, seen, "아이반찬", 0.86);
  }

  if (includesAny(evidenceText, ["술안주", "안주", "맥주", "소주", "와인", "막걸리"])) {
    pushSuggestedTag(tags, seen, "술안주", 0.86);
  }

  if (includesAny(evidenceText, ["캠핑", "바베큐", "바비큐", "캠핑장", "그릴"])) {
    pushSuggestedTag(tags, seen, "캠핑요리", 0.86);
  }

  return tags;
}

export function toRecipeTagLabels(tags: RecipeTagWrite[]) {
  return tags.map((tag) => tag.label);
}
