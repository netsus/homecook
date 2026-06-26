import type {
  RecipeIngredient,
  RecipeStep,
  RecipeStepCookingMethod,
  RecipeUserStatus,
} from "@/types/recipe";
import {
  normalizeRecipeSectionLabel,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";

interface SavedBookRow {
  book_id: string;
}

interface RecipeIngredientsRow {
  id: string;
  ingredient_id: string;
  amount: number | string | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  component_label?: string | null;
  scalable: boolean;
  sort_order: number;
  ingredients:
    | { standard_name?: string | null }
    | Array<{ standard_name?: string | null }>
    | null;
}

interface RecipeStepsRow {
  id: string;
  step_number: number;
  instruction: string;
  component_label?: string | null;
  ingredients_used: RecipeStep["ingredients_used"] | null;
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  cooking_methods:
    | RecipeStepCookingMethod
    | Array<RecipeStepCookingMethod | null>
    | null;
  recipe_step_cooking_methods?:
    | Array<{
        position?: number | null;
        cooking_methods:
          | RecipeStepCookingMethod
          | Array<RecipeStepCookingMethod | null>
          | null;
      }>
    | null;
}

export function mapRecipeUserStatus(
  likedIds: Array<{ id: string }> | null | undefined,
  savedBooks: SavedBookRow[] | null | undefined,
): RecipeUserStatus {
  return {
    is_liked: Boolean(likedIds?.length),
    is_saved: Boolean(savedBooks?.length),
    saved_book_ids: savedBooks?.map((item) => item.book_id) ?? [],
  };
}

export function normalizeRecipeIngredients(
  rows: RecipeIngredientsRow[] | null | undefined,
): RecipeIngredient[] {
  return (
    rows?.map((item) => {
      const componentLabel = normalizeRecipeSectionLabel(item.component_label);
      return {
        id: item.id,
        ingredient_id: item.ingredient_id,
        standard_name:
          Array.isArray(item.ingredients) && item.ingredients[0]
            ? item.ingredients[0].standard_name ?? ""
            : !Array.isArray(item.ingredients)
              ? item.ingredients?.standard_name ?? ""
              : "",
        amount: item.amount === null ? null : Number(item.amount),
        unit: item.unit,
        ingredient_type: item.ingredient_type,
        component_label: componentLabel,
        display_text: stripMatchingSectionPrefix(item.display_text, componentLabel),
        scalable: item.scalable,
        sort_order: item.sort_order,
      };
    }) ?? []
  );
}

export function normalizeRecipeSteps(
  rows: RecipeStepsRow[] | null | undefined,
): RecipeStep[] {
  return (
    rows?.map((item) => {
      const componentLabel = normalizeRecipeSectionLabel(item.component_label);
      const cookingMethods = normalizeStepCookingMethods(item);
      return {
        id: item.id,
        step_number: item.step_number,
        component_label: componentLabel,
        instruction:
          stripMatchingSectionPrefix(item.instruction, componentLabel) ??
          item.instruction,
        cooking_method: cookingMethods[0] ?? null,
        cooking_methods: cookingMethods,
        ingredients_used: Array.isArray(item.ingredients_used)
          ? item.ingredients_used
          : [],
        heat_level: item.heat_level,
        duration_seconds: item.duration_seconds,
        duration_text: item.duration_text,
      };
    }) ?? []
  );
}

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStepCookingMethods(row: RecipeStepsRow) {
  const orderedMethods = (row.recipe_step_cooking_methods ?? [])
    .slice()
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((item) => firstJoin(item.cooking_methods))
    .filter((method): method is RecipeStepCookingMethod => Boolean(method));

  const legacyMethod = firstJoin(row.cooking_methods);
  const methods = orderedMethods.length > 0
    ? orderedMethods
    : legacyMethod
      ? [legacyMethod]
      : [];
  const seen = new Set<string>();

  return methods.filter((method) => {
    const key = method.id || method.code || method.label;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
