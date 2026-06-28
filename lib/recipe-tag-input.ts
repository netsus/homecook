const RECIPE_TAG_MAX_LENGTH = 12;
export const REVIEWED_RECIPE_TAG_LIMIT = 8;

export type RecipeTagInputReason =
  | "empty"
  | "blocked"
  | "max_length"
  | "too_many"
  | "duplicate";

export interface RecipeTagInputResult {
  label: string | null;
  key: string | null;
  reason: RecipeTagInputReason | null;
}

const RECIPE_TAG_ERROR_MESSAGES: Record<RecipeTagInputReason, string> = {
  blocked: "태그에는 링크나 홍보 문구를 넣을 수 없어요.",
  duplicate: "이미 추가한 태그예요.",
  empty: "태그를 입력해 주세요.",
  max_length: "태그는 12자까지 입력할 수 있어요.",
  too_many: "태그는 8개까지 추가할 수 있어요.",
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeRecipeTagKey(value: string) {
  return collapseWhitespace(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/gu, "");
}

function getRecipeTagInputErrorMessage(reason: RecipeTagInputReason) {
  return RECIPE_TAG_ERROR_MESSAGES[reason];
}

export function normalizeRecipeTagInput(rawValue: unknown): RecipeTagInputResult {
  if (typeof rawValue !== "string") {
    return { label: null, key: null, reason: "empty" };
  }

  const label = collapseWhitespace(collapseWhitespace(rawValue).replace(/^#+\s*/u, ""));
  if (!label) {
    return { label: null, key: null, reason: "empty" };
  }

  if (/(?:https?:\/\/|www\.|@|광고|협찬|구매|판매|쿠폰|링크)/iu.test(label)) {
    return { label: null, key: null, reason: "blocked" };
  }

  if (Array.from(label).length > RECIPE_TAG_MAX_LENGTH) {
    return { label: null, key: null, reason: "max_length" };
  }

  return {
    label,
    key: normalizeRecipeTagKey(label),
    reason: null,
  };
}

export function addReviewedRecipeTag(currentTags: string[], rawValue: unknown) {
  if (currentTags.length >= REVIEWED_RECIPE_TAG_LIMIT) {
    return {
      error: getRecipeTagInputErrorMessage("too_many"),
      tags: currentTags,
    };
  }

  const normalized = normalizeRecipeTagInput(rawValue);
  if (normalized.reason || !normalized.label || !normalized.key) {
    return {
      error: getRecipeTagInputErrorMessage(normalized.reason ?? "empty"),
      tags: currentTags,
    };
  }

  const currentKeys = new Set(currentTags.map((tag) => normalizeRecipeTagKey(tag)));
  if (currentKeys.has(normalized.key)) {
    return {
      error: getRecipeTagInputErrorMessage("duplicate"),
      tags: currentTags,
    };
  }

  return {
    error: null,
    tags: [...currentTags, normalized.label],
  };
}

export function buildReviewedRecipeTagsPayload({
  isDirty,
  tags,
}: {
  isDirty: boolean;
  tags: string[];
}) {
  return isDirty ? tags : undefined;
}
