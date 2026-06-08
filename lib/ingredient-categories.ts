export const ALL_INGREDIENT_CATEGORY = "전체";

export interface IngredientCategoryEntry {
  code: string;
  label: string;
  display_order: number;
  is_active: boolean;
  emoji: string;
}

export const INGREDIENT_CATEGORIES = [
  { code: "vegetable", label: "채소", display_order: 10, is_active: true, emoji: "🥬" },
  { code: "fruit", label: "과일", display_order: 20, is_active: true, emoji: "🍓" },
  { code: "meat", label: "육류", display_order: 30, is_active: true, emoji: "🥩" },
  { code: "seafood", label: "해산물", display_order: 40, is_active: true, emoji: "🐟" },
  { code: "seasoning", label: "양념", display_order: 50, is_active: true, emoji: "🧂" },
  { code: "dairy", label: "유제품", display_order: 60, is_active: true, emoji: "🥛" },
  { code: "grain", label: "곡류", display_order: 70, is_active: true, emoji: "🌾" },
  { code: "other", label: "기타", display_order: 80, is_active: true, emoji: "🥄" },
] as const satisfies readonly IngredientCategoryEntry[];

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number]["label"];

export const INGREDIENT_CATEGORY_LABELS = INGREDIENT_CATEGORIES.map(
  (category) => category.label,
) as IngredientCategory[];

export const INGREDIENT_CATEGORY_OPTIONS = [
  ALL_INGREDIENT_CATEGORY,
  ...INGREDIENT_CATEGORY_LABELS,
] as const;

const INGREDIENT_CATEGORY_BY_LABEL = new Map<string, (typeof INGREDIENT_CATEGORIES)[number]>(
  INGREDIENT_CATEGORIES.map((category) => [category.label, category]),
);

export function getIngredientCategoryByLabel(label: string | null | undefined) {
  if (!label) {
    return undefined;
  }

  return INGREDIENT_CATEGORY_BY_LABEL.get(label.trim());
}

export function isValidIngredientCategory(
  label: string | null | undefined,
): label is IngredientCategory {
  return getIngredientCategoryByLabel(label) !== undefined;
}

export function normalizeIngredientCategoryLabel(
  label: string | null | undefined,
  fallback: IngredientCategory = "기타",
): IngredientCategory {
  return getIngredientCategoryByLabel(label)?.label ?? fallback;
}

export function getIngredientCategoryEmoji(label: string | null | undefined) {
  return getIngredientCategoryByLabel(label)?.emoji ?? getIngredientCategoryByLabel("기타")!.emoji;
}
