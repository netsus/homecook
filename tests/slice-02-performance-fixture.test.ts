import { describe, expect, it } from "vitest";

import {
  PERF_ALLOWED_CATEGORIES,
  buildSlice02PerformanceDataset,
} from "../scripts/lib/slice-02-performance-fixture.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("slice 02 performance fixture", () => {
  it("builds deterministic bulk ingredients, synonyms, recipes, and filter scenarios", () => {
    const dataset = buildSlice02PerformanceDataset({
      ingredientCount: 24,
      recipeCount: 12,
      sharedFilterMatchCount: 5,
    });

    expect(dataset.ingredients).toHaveLength(24);
    expect(dataset.synonyms).toHaveLength(24);
    expect(dataset.recipes).toHaveLength(12);
    expect(dataset.recipeIngredients.length).toBeGreaterThan(12);

    expect(
      dataset.ingredients.every((ingredient) =>
        PERF_ALLOWED_CATEGORIES.includes(ingredient.category),
      ),
    ).toBe(true);

    expect(dataset.scenario.searchQuery).toBe("성능재료 00");
    expect(dataset.scenario.filterIngredientNames).toHaveLength(2);

    const filterIngredientIds = new Set(dataset.scenario.filterIngredientIds);
    const matchedRecipes = dataset.recipes.filter((recipe) => {
      const ingredientIds = dataset.recipeIngredients
        .filter((row) => row.recipe_id === recipe.id)
        .map((row) => row.ingredient_id);

      return dataset.scenario.filterIngredientIds.every((ingredientId) =>
        ingredientIds.includes(ingredientId),
      );
    });

    expect(matchedRecipes).toHaveLength(5);
    expect(
      matchedRecipes.every((recipe) =>
        recipe.title.startsWith(dataset.scenario.recipeTitlePrefix),
      ),
    ).toBe(true);

    expect(
      dataset.synonyms.every((synonym) =>
        dataset.ingredients.some((ingredient) => ingredient.id === synonym.ingredient_id),
      ),
    ).toBe(true);
    expect(filterIngredientIds.size).toBe(dataset.scenario.filterIngredientIds.length);
    expect(
      [
        ...dataset.ingredients.map((ingredient) => ingredient.id),
        ...dataset.recipes.map((recipe) => recipe.id),
        ...dataset.recipeIngredients.map((row) => row.id),
        ...dataset.scenario.filterIngredientIds,
      ].every((id) => UUID_PATTERN.test(id)),
    ).toBe(true);
  });
});
