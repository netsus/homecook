import { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { calculateRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-calculator";
import {
  buildFailClosedRecipeNutritionCalculation,
  rollbackFoodSafetyRecipeNutritionBackfill,
  runFoodSafetyRecipeNutritionBackfill,
} from "@/scripts/lib/recipe-nutrition-backfill.mjs";

const recipes = [
  { id: "recipe-a", base_servings: 2, updated_at: "2026-07-16T00:00:00.000Z" },
  { id: "recipe-b", base_servings: 4, updated_at: "2026-07-16T00:00:01.000Z" },
];
const ingredients = [
  {
    id: "ingredient-row-a",
    recipe_id: "recipe-a",
    ingredient_id: "ingredient-a",
    amount: 100,
    unit: "g",
    ingredient_type: "QUANT",
    scalable: true,
    sort_order: 0,
  },
  {
    id: "ingredient-row-b",
    recipe_id: "recipe-b",
    ingredient_id: "ingredient-b",
    amount: null,
    unit: null,
    ingredient_type: "TO_TASTE",
    scalable: false,
    sort_order: 0,
  },
];

function repository() {
  return {
    listScopeRecipeIds: vi.fn(async () => recipes.map(({ id: recipe_id }) => ({ recipe_id }))),
    loadRecipes: vi.fn(async () => recipes),
    loadIngredients: vi.fn(async () => ingredients),
    loadCurrentSnapshots: vi.fn(async () => [{ recipe_id: "recipe-a", id: "previous-a" }]),
    writeSnapshot: vi.fn(async (recipeId: string) => ({
      snapshot_id: `applied-${recipeId}`,
      created: true,
      is_current: true,
    })),
    restoreCurrent: vi.fn(async () => ({ is_current: true })),
  };
}

describe("FoodSafety-30 recipe nutrition backfill", () => {
  it("keeps the standalone operator calculation exactly equal to the server fail-closed calculator", () => {
    const recipe = recipes[0];
    const recipeIngredients = ingredients.filter((row) => row.recipe_id === recipe.id);
    const expected = calculateRecipeNutrition({
      recipe_id: recipe.id,
      recipe_version: recipe.updated_at,
      base_servings: recipe.base_servings,
      ingredients: recipeIngredients.map((row) => ({
        id: row.id,
        ingredient_id: row.ingredient_id,
        amount: row.amount,
        unit: row.unit,
        ingredient_type: row.ingredient_type as "QUANT" | "TO_TASTE",
        scalable: row.scalable,
        preparation_state: null,
        size_code: null,
        edible_state: null,
        conversion_assignment: null,
        piece_weight: null,
      })),
    });

    expect(buildFailClosedRecipeNutritionCalculation(recipe, recipeIngredients)).toEqual(expected);
  });

  it("dry-runs a bounded exact scope without any snapshot write", async () => {
    const repo = repository();
    const result = await runFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      mode: "dry-run",
      batchSize: 2,
      afterRecipeId: null,
      calculatedAt: "2026-07-16T01:00:00.000Z",
    });

    expect(result).toEqual({
      scope: "foodsafety-30",
      mode: "dry-run",
      candidate_count: 2,
      processed_count: 0,
      next_cursor: "recipe-b",
      checkpoints: [],
    });
    expect(repo.loadRecipes).not.toHaveBeenCalled();
    expect(repo.writeSnapshot).not.toHaveBeenCalled();
  });

  it("applies a batch with replay-safe checkpoints and no unbounded row loading", async () => {
    const repo = repository();
    const onCheckpoint = vi.fn(async () => undefined);
    const result = await runFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      mode: "apply",
      batchSize: 2,
      afterRecipeId: null,
      calculatedAt: "2026-07-16T01:00:00.000Z",
      onCheckpoint,
    });

    expect(repo.loadRecipes).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
    expect(repo.loadIngredients).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
    expect(repo.loadCurrentSnapshots).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
    expect(repo.writeSnapshot).toHaveBeenCalledTimes(2);
    expect(onCheckpoint).toHaveBeenNthCalledWith(1, [{
      recipe_id: "recipe-a",
      previous_snapshot_id: "previous-a",
      applied_snapshot_id: "applied-recipe-a",
    }]);
    expect(onCheckpoint).toHaveBeenNthCalledWith(2, [
      {
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        applied_snapshot_id: "applied-recipe-a",
      },
      {
        recipe_id: "recipe-b",
        previous_snapshot_id: null,
        applied_snapshot_id: "applied-recipe-b",
      },
    ]);
    expect(result).toMatchObject({
      scope: "foodsafety-30",
      mode: "apply",
      candidate_count: 2,
      processed_count: 2,
      next_cursor: "recipe-b",
      checkpoints: [
        {
          recipe_id: "recipe-a",
          previous_snapshot_id: "previous-a",
          applied_snapshot_id: "applied-recipe-a",
        },
        {
          recipe_id: "recipe-b",
          previous_snapshot_id: null,
          applied_snapshot_id: "applied-recipe-b",
        },
      ],
    });
  });

  it("rolls back only an unchanged applied current and never deletes snapshot history", async () => {
    const repo = repository();
    repo.loadCurrentSnapshots.mockResolvedValue([
      { recipe_id: "recipe-a", id: "applied-recipe-a" },
      { recipe_id: "recipe-b", id: "applied-recipe-b" },
    ]);
    const checkpoints = [
      {
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        applied_snapshot_id: "applied-recipe-a",
      },
      {
        recipe_id: "recipe-b",
        previous_snapshot_id: null,
        applied_snapshot_id: "applied-recipe-b",
      },
    ];

    const result = await rollbackFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      checkpoints,
    });

    expect(result).toEqual({ scope: "foodsafety-30", mode: "rollback", processed_count: 2 });
    expect(repo.restoreCurrent.mock.calls).toEqual([
      ["recipe-b", null],
      ["recipe-a", "previous-a"],
    ]);
    expect(repo).not.toHaveProperty("deleteSnapshot");
  });

  it("rejects oversized batches and rollback drift before writes", async () => {
    const repo = repository();
    await expect(runFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      mode: "apply",
      batchSize: 31,
      afterRecipeId: null,
    })).rejects.toMatchObject({ code: "INVALID_BACKFILL_BATCH_SIZE" });

    repo.loadCurrentSnapshots.mockResolvedValue([
      { recipe_id: "recipe-a", id: "newer-unrelated-current" },
    ]);
    await expect(rollbackFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      checkpoints: [{
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        applied_snapshot_id: "applied-recipe-a",
      }],
    })).rejects.toMatchObject({ code: "BACKFILL_CURRENT_DRIFT" });
    expect(repo.restoreCurrent).not.toHaveBeenCalled();
  });

  it("exposes a secret-safe operator CLI and blocks writes without two explicit gates", () => {
    const help = spawnSync(process.execPath, ["scripts/recipe-nutrition-backfill.mjs", "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("recipe-dry-run");
    expect(help.stdout).toContain("meal-apply");

    const rejected = spawnSync(process.execPath, [
      "scripts/recipe-nutrition-backfill.mjs",
      "recipe-apply",
      "--checkpoint",
      "/tmp/homecook-recipe-nutrition-checkpoint.json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr.trim()).toBe("WRITE_APPROVAL_REQUIRED");
    expect(rejected.stderr).not.toMatch(/service_role|api[_-]?key|token|cookie/i);

    const missingCheckpoint = spawnSync(process.execPath, [
      "scripts/recipe-nutrition-backfill.mjs",
      "recipe-apply",
      "--allow-write",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED: "1",
      },
    });
    expect(missingCheckpoint.status).toBe(1);
    expect(missingCheckpoint.stderr.trim()).toBe("BACKFILL_CHECKPOINT_REQUIRED");
  });
});
