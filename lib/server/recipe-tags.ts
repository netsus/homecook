export type RecipeTagKind = "semantic" | "source" | "user";
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
  ingredientNames: string[];
  stepTexts: string[];
  cookingMethodLabels: string[];
}

const RECIPE_TAG_MAX_LENGTH = 12;
const REVIEWED_TAG_LIMIT = 8;
const SUGGESTED_TAG_LIMIT = 6;

const SEMANTIC_TAG_LABELS = [
  "자취요리",
  "초보가능",
  "원팬요리",
  "에어프라이어",
  "전자레인지",
  "밀프렙",
  "고단백",
  "다이어트",
  "저당",
  "한식",
  "국물요리",
  "밑반찬",
  "디저트",
  "매콤",
  "바삭",
  "간단요리",
  "15분컷",
  "혼밥",
  "도시락",
  "냉털요리",
  "해장요리",
  "안주",
  "아이반찬",
  "채식",
  "비건",
  "저탄수",
  "글루텐프리",
  "양식",
  "일식",
  "중식",
  "분식",
  "면요리",
  "밥요리",
  "구이",
  "볶음요리",
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
  const text = [title, ingredients, steps, methods].join(" ");
  const tags: RecipeTagWrite[] = [];
  const seen = new Set<string>();
  const ingredientCount = input.ingredientNames.filter((name) => name.trim()).length;
  const stepCount = input.stepTexts.filter((step) => step.trim()).length;

  if (input.sourceType === "youtube") {
    pushSuggestedTag(tags, seen, "유튜브레시피", 0.99);
  }

  if (includesAny(text, ["김치", "된장", "고추장", "간장", "찌개", "국물", "나물", "불고기"])) {
    pushSuggestedTag(tags, seen, "한식", 0.92);
  }

  if (includesAny(text, ["찌개", "국물", "전골", "육수", "보글"])) {
    pushSuggestedTag(tags, seen, "국물요리", 0.9);
  }

  if (includesAny(text, ["매콤", "매운", "고춧가루", "고추장", "청양고추", "불닭"])) {
    pushSuggestedTag(tags, seen, "매콤", 0.9);
  }

  if (includesAny(text, ["초보", "쉬운", "간단", "간편"]) || (ingredientCount <= 6 && stepCount <= 4)) {
    pushSuggestedTag(tags, seen, "초보가능", 0.84);
  }

  if (includesAny(ingredients, ["닭가슴살", "계란", "두부", "소고기", "돼지고기", "연어", "참치"])) {
    pushSuggestedTag(tags, seen, "고단백", 0.82);
  }

  if (includesAny(text, ["에어프라이어", "에프"])) {
    pushSuggestedTag(tags, seen, "에어프라이어", 0.92);
  }

  if (includesAny(text, ["전자레인지", "렌지", "레인지"])) {
    pushSuggestedTag(tags, seen, "전자레인지", 0.92);
  }

  if (includesAny(text, ["한 팬", "한팬", "원팬", "팬 하나"])) {
    pushSuggestedTag(tags, seen, "원팬요리", 0.88);
  }

  if (includesAny(text, ["다이어트", "저칼로리", "칼로리"])) {
    pushSuggestedTag(tags, seen, "다이어트", 0.86);
  }

  if (includesAny(text, ["밑반찬", "반찬", "무침", "조림", "절임"])) {
    pushSuggestedTag(tags, seen, "밑반찬", 0.84);
  }

  if (includesAny(text, ["디저트", "베이킹", "케이크", "쿠키", "푸딩"])) {
    pushSuggestedTag(tags, seen, "디저트", 0.9);
  }

  if (includesAny(text, ["바삭", "튀김", "튀기", "크리스피"])) {
    pushSuggestedTag(tags, seen, "바삭", 0.86);
  }

  return tags;
}

export function toRecipeTagLabels(tags: RecipeTagWrite[]) {
  return tags.map((tag) => tag.label);
}
