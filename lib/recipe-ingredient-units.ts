import { COOKING_UNIT_OPTIONS } from "@/lib/recipe-units";

// These unit families are already understood by recipe-nutrition-calculator.
// Selecting a different unit never converts or guesses the ingredient amount.
export const RECIPE_INGREDIENT_UNIT_OPTIONS = [
  ...COOKING_UNIT_OPTIONS, "kg", "l", "개", "알", "통", "장", "대", "줄기", "모", "줌", "꼬집", "큰술", "작은술", "컵",
] as const;

const supportedUnits = new Set<string>([
  ...RECIPE_INGREDIENT_UNIT_OPTIONS,
  "tbsp", "tsp", "cup", "piece", "pieces", "handful", "handfuls", "pinch", "pinches", "T", "t",
  "스푼", "밥숟갈", "숟갈", "숟가락", "왕큰술", "티스푼",
]);

export function getRecipeIngredientUnitOptions(ingredient: {
  unit: string | null;
  food_product_id?: string | null;
}) {
  if (ingredient.food_product_id) return ingredient.unit ? [ingredient.unit] : [];
  const options: string[] = [...RECIPE_INGREDIENT_UNIT_OPTIONS];
  if (ingredient.unit && !options.includes(ingredient.unit)) options.push(ingredient.unit);
  return options;
}

// Server callers must obtain these units from persisted source rows, never from
// the submitted draft. This preserves legacy units without accepting new text.
export function isRecipeIngredientUnitAllowed(
  unit: unknown,
  trustedSourceUnits: readonly (string | null)[] = [],
) {
  return typeof unit === "string" && unit.trim().length > 0
    && (supportedUnits.has(unit) || trustedSourceUnits.includes(unit));
}
