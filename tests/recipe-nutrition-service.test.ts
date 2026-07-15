import { describe, expect, it, vi } from "vitest";

import {
  RecipeNutritionServiceError,
  recalculateRecipeNutritionSnapshot,
} from "@/lib/server/recipe-nutrition-service";

function maybeSingleResult(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return query;
}

function ingredientResult(data: unknown[], error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error })),
  };
  return query;
}

describe("recipe nutrition snapshot service", () => {
  it("creates a deterministic unavailable snapshot when formal preparation metadata is absent", async () => {
    const recipeQuery = maybeSingleResult({
      id: "recipe-1",
      base_servings: 2,
      updated_at: "2026-07-16T00:00:00.000Z",
    });
    const ingredientsQuery = ingredientResult([{
      id: "recipe-ingredient-1",
      ingredient_id: "ingredient-1",
      amount: 100,
      unit: "g",
      ingredient_type: "QUANT",
      scalable: true,
      sort_order: 0,
    }]);
    const rpc = vi.fn(async (_name: string, args: { p_snapshot: Record<string, unknown> }) => ({
      data: {
        snapshot_id: "snapshot-1",
        created: true,
        is_current: true,
        captured: args.p_snapshot,
      },
      error: null,
    }));
    const from = vi.fn((table: string) => {
      if (table === "recipes") return recipeQuery;
      if (table === "recipe_ingredients") return ingredientsQuery;
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await recalculateRecipeNutritionSnapshot(
      { from, rpc } as never,
      "recipe-1",
      { calculatedAt: "2026-07-16T00:01:00.000Z" },
    );

    expect(result).toMatchObject({ snapshot_id: "snapshot-1", created: true, is_current: true });
    expect(rpc).toHaveBeenCalledOnce();
    const snapshotPayload = rpc.mock.calls[0][1].p_snapshot;
    expect(snapshotPayload).toMatchObject({
      calculation_status: "unavailable",
      calculation_quality: null,
      reflected_ingredient_count: 0,
      target_ingredient_count: 1,
      sources: [],
      scalable_values: {},
      fixed_values: {},
      calculated_at: "2026-07-16T00:01:00.000Z",
    });
    expect(snapshotPayload).not.toHaveProperty("nutrition_profile_id");
    expect(snapshotPayload).not.toHaveProperty("source_calculation_hash");
    expect(from.mock.calls.map(([table]) => table)).toEqual(["recipes", "recipe_ingredients"]);
  });

  it("fails before writing when recipe identity or persisted quantities are invalid", async () => {
    const invalidCases = [
      {
        recipe: { id: "recipe-2", base_servings: 0, updated_at: "2026-07-16T00:00:00.000Z" },
        ingredients: [],
        code: "INVALID_RECIPE_NUTRITION_INPUT",
      },
      {
        recipe: { id: "recipe-3", base_servings: 2, updated_at: "2026-07-16T00:00:00.000Z" },
        ingredients: [{
          id: "recipe-ingredient-3",
          ingredient_id: "ingredient-3",
          amount: Number.NaN,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 0,
        }],
        code: "INVALID_RECIPE_NUTRITION_INPUT",
      },
    ];

    for (const invalidCase of invalidCases) {
      const recipeQuery = maybeSingleResult(invalidCase.recipe);
      const ingredientsQuery = ingredientResult(invalidCase.ingredients);
      const rpc = vi.fn();
      const from = vi.fn((table: string) =>
        table === "recipes" ? recipeQuery : ingredientsQuery
      );

      await expect(recalculateRecipeNutritionSnapshot(
        { from, rpc } as never,
        invalidCase.recipe.id,
      )).rejects.toEqual(expect.objectContaining<Partial<RecipeNutritionServiceError>>({
        code: invalidCase.code,
      }));
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("fails closed on read or writer errors without returning raw database details", async () => {
    const recipeQuery = maybeSingleResult(null, { message: "private row payload" });
    const ingredientsQuery = ingredientResult([]);
    const from = vi.fn((table: string) =>
      table === "recipes" ? recipeQuery : ingredientsQuery
    );

    await expect(recalculateRecipeNutritionSnapshot(
      { from, rpc: vi.fn() } as never,
      "recipe-4",
    )).rejects.toEqual(expect.objectContaining({
      code: "RECIPE_NUTRITION_INPUT_READ_FAILED",
      message: "RECIPE_NUTRITION_INPUT_READ_FAILED",
    }));
  });
});
