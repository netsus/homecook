import type { RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";

interface ProductPin {
  id: string;
  ingredient_id: string;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
}

export interface RecipeProductNutritionClient {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

type ProductPredecessor = {
  nutrition: NonNullable<RecipeNutritionIngredientInput["nutrition"]>;
  basis_relations: NonNullable<RecipeNutritionIngredientInput["product_basis_relations"]>;
};

/** Read the saved version, never the product's current version or generic food. */
export async function hydrateRecipeProductNutrition(
  client: RecipeProductNutritionClient,
  ingredients: ProductPin[],
  hydrated: RecipeNutritionIngredientInput[],
  ownerUserId?: string | null,
) {
  const pins = ingredients.filter((ingredient) =>
    ingredient.food_product_id || ingredient.food_product_nutrition_version_id
  );
  const predecessors = new Map<string, ProductPredecessor | null>();
  if (pins.length === 0) return { ingredients: hydrated, predecessors };
  if (pins.some((pin) => !pin.food_product_id || !pin.food_product_nutrition_version_id)) {
    throw new Error("INVALID_RECIPE_PRODUCT_PIN");
  }
  const result = await client.rpc("read_recipe_product_nutrition_predecessors", {
    p_owner_uuid: ownerUserId ?? null,
    p_ingredients: pins.map((pin) => ({
      id: pin.id,
      ingredient_id: pin.ingredient_id,
      food_product_id: pin.food_product_id,
      food_product_nutrition_version_id: pin.food_product_nutrition_version_id,
    })),
  });
  if (result.error || !Array.isArray(result.data) || result.data.length !== pins.length) {
    throw new Error("RECIPE_PRODUCT_NUTRITION_READ_FAILED");
  }
  for (const [index, row] of result.data.entries()) {
    if (!row || row.id !== pins[index].id || !Object.hasOwn(row, "product_predecessor")) {
      throw new Error("RECIPE_PRODUCT_NUTRITION_READ_FAILED");
    }
    predecessors.set(row.id, row.product_predecessor);
  }
  const pinsById = new Map(pins.map((pin) => [pin.id, pin]));
  return {
    predecessors,
    ingredients: hydrated.map((ingredient) => {
      const pin = pinsById.get(ingredient.id);
      if (!pin) return ingredient;
      const product = predecessors.get(ingredient.id);
      return {
        ...ingredient,
        food_product_id: pin.food_product_id,
        food_product_nutrition_version_id: pin.food_product_nutrition_version_id,
        preparation_state: product?.nutrition.link.preparation_state ?? null,
        nutrition: product?.nutrition,
        product_basis_relations: product?.basis_relations,
        conversion_assignment: null,
        piece_weight: null,
      };
    }),
  };
}

export function addRecipeProductNutritionGuard(
  guard: Record<string, unknown>,
  pins: ProductPin[],
  predecessors: Map<string, ProductPredecessor | null>,
) {
  const pinsById = new Map(pins.map((pin) => [pin.id, pin]));
  return {
    ...guard,
    recipe_ingredients: (guard.recipe_ingredients as Array<Record<string, unknown>>).map((row) => {
      const pin = pinsById.get(row.id as string);
      return pin && predecessors.has(pin.id) ? {
        ...row,
        food_product_id: pin.food_product_id,
        food_product_nutrition_version_id: pin.food_product_nutrition_version_id,
        product_predecessor: predecessors.get(pin.id),
      } : row;
    }),
  };
}
