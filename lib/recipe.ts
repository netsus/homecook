import type { RecipeCardItem, RecipeIngredient, RecipeSortKey } from "@/types/recipe";

const SORT_KEYS: RecipeSortKey[] = [
  "view_count",
  "like_count",
  "save_count",
  "plan_count",
];

export function parseRecipeSortKey(value: string | null): RecipeSortKey {
  return SORT_KEYS.includes(value as RecipeSortKey)
    ? (value as RecipeSortKey)
    : "view_count";
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatRecipeSourceLabel(sourceType: RecipeCardItem["source_type"]) {
  switch (sourceType) {
    case "system":
      return "집밥 추천";
    case "youtube":
      return "유튜브";
    case "manual":
      return "직접 등록";
    default:
      return sourceType;
  }
}

export function formatScaledIngredient(
  ingredient: RecipeIngredient,
  baseServings: number,
  selectedServings: number,
) {
  if (
    ingredient.amount === null ||
    ingredient.unit === null ||
    !ingredient.scalable
  ) {
    return ingredient.display_text ?? ingredient.standard_name;
  }

  const scaled = (ingredient.amount / baseServings) * selectedServings;
  const normalized =
    Number.isInteger(scaled) || Number.isNaN(scaled)
      ? scaled.toString()
      : scaled.toFixed(1).replace(/\.0$/, "");

  return `${ingredient.standard_name} ${normalized}${ingredient.unit}`;
}
