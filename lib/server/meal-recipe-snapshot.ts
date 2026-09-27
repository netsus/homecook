import { toCookingModeIngredient, toCookingModeStep, type CookingIngredientRow, type CookingStepRow } from "@/lib/server/cooking";
import type { MealRecipeSnapshotData } from "@/types/meal-recipe-snapshot";

export interface MealRecipeSnapshotRow {
  id: string;
  user_id: string;
  recipe_id: string;
  recipe_content_snapshot_id: string | null;
  planned_servings: number;
  recipe_content_snapshots: MealContentSnapshot | MealContentSnapshot[] | null;
}

interface MealContentSnapshot {
  id: string;
  recipe_id: string;
  owner_user_id: string | null;
  title: string;
  base_servings: number;
  ingredients_json: Array<Omit<CookingIngredientRow, "ingredients"> & { standard_name?: string }>;
  steps_json: CookingStepRow[];
}

export function projectMealRecipeSnapshot(row: MealRecipeSnapshotRow, ownerId: string, names: Map<string, string>): MealRecipeSnapshotData | null {
  const snapshot = Array.isArray(row.recipe_content_snapshots) ? row.recipe_content_snapshots[0] : row.recipe_content_snapshots;
  if (row.user_id !== ownerId || !snapshot || !row.recipe_content_snapshot_id
    || snapshot.id !== row.recipe_content_snapshot_id || snapshot.recipe_id !== row.recipe_id
    || (snapshot.owner_user_id !== null && snapshot.owner_user_id !== ownerId)
    || !(snapshot.base_servings > 0) || !(row.planned_servings > 0)
    || !Array.isArray(snapshot.ingredients_json) || !Array.isArray(snapshot.steps_json)) return null;
  return {
    meal_id: row.id, recipe_id: row.recipe_id, snapshot_id: snapshot.id,
    title: snapshot.title, planned_servings: row.planned_servings,
    ingredients: [...snapshot.ingredients_json].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((ingredient) => toCookingModeIngredient({
      row: { ...ingredient, scalable: ingredient.scalable ?? true, ingredients: { standard_name: ingredient.standard_name || names.get(ingredient.ingredient_id) || "재료" } },
      baseServings: snapshot.base_servings, cookingServings: row.planned_servings,
    })),
    steps: [...snapshot.steps_json].sort((a, b) => a.step_number - b.step_number).map(toCookingModeStep),
  };
}
