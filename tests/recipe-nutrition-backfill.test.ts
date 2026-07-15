import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  calculateRecipeNutrition,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import {
  buildRecipeNutritionCalculation,
  sanitizeRecipeNutritionBackfillReport,
  rollbackFoodSafetyRecipeNutritionBackfill,
  runFoodSafetyRecipeNutritionBackfill,
} from "@/scripts/lib/recipe-nutrition-backfill.mjs";
import {
  ensureMealPinBackfillCheckpoint,
  readMealPinBackfillCheckpoint,
  readRecipeNutritionCheckpoint,
  writeMealPinBackfillCheckpoint,
  writeRecipeNutritionCheckpoint,
} from "@/scripts/lib/recipe-nutrition-checkpoint.mjs";

const recipes = [
  { id: "recipe-a", base_servings: 2, updated_at: "2026-07-16T00:00:00.000Z" },
  { id: "recipe-b", base_servings: 4, updated_at: "2026-07-16T00:00:01.000Z" },
];
const VALID_INPUT_HASH = "a".repeat(64);
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

const predecessorSource = {
  id: "source-a",
  review_status: "approved",
  freshness_status: "current",
  is_active: true,
  provider: "mfds",
  dataset: "fixture nutrition",
  source_version: "2026-07-16",
  data_basis_date: null,
  license: "test-only",
  source_url: "https://example.test/nutrition",
};

function predecessors(): Map<string, Pick<
  RecipeNutritionIngredientInput,
  "preparation_state" | "nutrition" | "conversion_assignment" | "piece_weight"
>> {
  return new Map([[
    "ingredient-a",
    {
      preparation_state: "raw-edible",
      nutrition: {
        link: {
          id: "link-a",
          review_status: "approved",
          is_active: true,
          is_primary: true,
          preparation_state: "raw-edible",
        },
        profile: {
          id: "profile-a",
          basis_amount: 100,
          basis_unit: "g",
          review_status: "approved",
          is_active: true,
          values: Object.fromEntries([
            ["energy_kcal", 100],
            ["carbohydrate_g", 20],
            ["protein_g", 10],
            ["fat_g", 5],
            ["sodium_mg", 50],
          ].map(([code, amount]) => [code, { amount, value_status: "observed" }])),
        },
        source: predecessorSource,
      },
      conversion_assignment: null,
      piece_weight: null,
    },
  ]]);
}

function repository() {
  return {
    deriveSnapshotId: vi.fn((recipeId: string) => `applied-${recipeId}`),
    assertExactScope: vi.fn(async () => undefined),
    listScopeRecipeIds: vi.fn(async () => recipes.map(({ id: recipe_id }) => ({ recipe_id }))),
    loadRecipes: vi.fn(async () => recipes),
    loadIngredients: vi.fn(async () => ingredients),
    loadPredecessors: vi.fn(async () => predecessors()),
    loadCurrentSnapshots: vi.fn(async () => [{ recipe_id: "recipe-a", id: "previous-a" }]),
    assertScopeRecipeIds: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async (recipeId: string) => ({
      snapshot_id: `applied-${recipeId}`,
      created: true,
      is_current: true,
    })),
    restoreCurrent: vi.fn(async () => ({ is_current: true })),
  };
}

describe("FoodSafety-30 recipe nutrition backfill", () => {
  it("keeps the standalone operator calculation exactly equal to the hydrated server calculator", () => {
    const recipe = recipes[0];
    const recipeIngredients = ingredients.filter((row) => row.recipe_id === recipe.id);
    const expected = calculateRecipeNutrition({
      recipe_id: recipe.id,
      recipe_version: recipe.updated_at,
      base_servings: recipe.base_servings,
      ingredients: [{
        id: recipeIngredients[0].id,
        ingredient_id: recipeIngredients[0].ingredient_id,
        amount: recipeIngredients[0].amount,
        unit: recipeIngredients[0].unit,
        ingredient_type: "QUANT",
        scalable: recipeIngredients[0].scalable,
        size_code: null,
        ...predecessors().get("ingredient-a")!,
      }],
    });

    expect(buildRecipeNutritionCalculation(
      recipe,
      recipeIngredients,
      predecessors(),
      calculateRecipeNutrition,
    )).toEqual(expected);
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
      calculation_status_counts: { complete: 1, partial: 0, unavailable: 1 },
      missing_reason_counts: {
        TO_TASTE_EXCLUDED: 1,
      },
      source_count: 1,
      secret_count: 0,
      checkpoints: [],
    });
    expect(repo.loadRecipes).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
    expect(repo.loadIngredients).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
    expect(repo.loadPredecessors).toHaveBeenCalledOnce();
    expect(repo.loadPredecessors).toHaveBeenCalledWith(["ingredient-a", "ingredient-b"]);
    expect(repo.loadCurrentSnapshots).not.toHaveBeenCalled();
    expect(repo.writeSnapshot).not.toHaveBeenCalled();
    expect(repo.assertExactScope).toHaveBeenCalledOnce();
  });

  it("fails closed before listing a batch when the canonical FoodSafety scope is not exactly 30", async () => {
    const repo = repository();
    repo.assertExactScope.mockRejectedValue(new Error("scope count mismatch"));

    await expect(runFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      mode: "dry-run",
      batchSize: 2,
      afterRecipeId: null,
    })).rejects.toMatchObject({ code: "INVALID_BACKFILL_SCOPE" });

    expect(repo.listScopeRecipeIds).not.toHaveBeenCalled();
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
      expected_input_hash: expect.any(String),
      applied_snapshot_id: "applied-recipe-a",
      state: "planned",
    }]);
    expect(onCheckpoint).toHaveBeenNthCalledWith(2, [
      {
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        expected_input_hash: expect.any(String),
        applied_snapshot_id: "applied-recipe-a",
        state: "applied",
      },
    ]);
    expect(onCheckpoint).toHaveBeenNthCalledWith(3, [
      {
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        expected_input_hash: expect.any(String),
        applied_snapshot_id: "applied-recipe-a",
        state: "applied",
      },
      {
        recipe_id: "recipe-b",
        previous_snapshot_id: null,
        expected_input_hash: expect.any(String),
        applied_snapshot_id: "applied-recipe-b",
        state: "planned",
      },
    ]);
    expect(onCheckpoint).toHaveBeenNthCalledWith(4, [
      {
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        expected_input_hash: expect.any(String),
        applied_snapshot_id: "applied-recipe-a",
        state: "applied",
      },
      {
        recipe_id: "recipe-b",
        previous_snapshot_id: null,
        expected_input_hash: expect.any(String),
        applied_snapshot_id: "applied-recipe-b",
        state: "applied",
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
          expected_input_hash: expect.any(String),
          applied_snapshot_id: "applied-recipe-a",
          state: "applied",
        },
        {
          recipe_id: "recipe-b",
          previous_snapshot_id: null,
          expected_input_hash: expect.any(String),
          applied_snapshot_id: "applied-recipe-b",
          state: "applied",
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
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "applied-recipe-a",
        state: "applied",
      },
      {
        recipe_id: "recipe-b",
        previous_snapshot_id: null,
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "applied-recipe-b",
        state: "applied",
      },
    ];

    const result = await rollbackFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      checkpoints,
    });

    expect(result).toEqual({ scope: "foodsafety-30", mode: "rollback", processed_count: 2 });
    expect(repo.restoreCurrent.mock.calls).toEqual([
      ["recipe-b", null, "applied-recipe-b"],
      ["recipe-a", "previous-a", "applied-recipe-a"],
    ]);
    expect(repo).not.toHaveProperty("deleteSnapshot");
    expect(repo.assertScopeRecipeIds).toHaveBeenCalledWith(["recipe-a", "recipe-b"]);
  });

  it("recovers an RPC success that crashed before the planned journal was finalized", async () => {
    const repo = repository();
    repo.loadCurrentSnapshots.mockResolvedValue([{
      recipe_id: "recipe-a",
      id: "applied-after-crash",
    }]);

    const result = await rollbackFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      checkpoints: [{
        recipe_id: "recipe-a",
        previous_snapshot_id: "previous-a",
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "applied-after-crash",
        state: "planned",
      }],
    });

    expect(result).toEqual({ scope: "foodsafety-30", mode: "rollback", processed_count: 1 });
    expect(repo.restoreCurrent).toHaveBeenCalledWith(
      "recipe-a",
      "previous-a",
      "applied-after-crash",
    );
  });

  it("compensates earlier current switches in reverse order when a later recipe write fails", async () => {
    const repo = repository();
    const threeRecipes = [
      ...recipes,
      { id: "recipe-c", base_servings: 1, updated_at: "2026-07-16T00:00:02.000Z" },
    ];
    repo.listScopeRecipeIds.mockResolvedValue(
      threeRecipes.map(({ id: recipe_id }) => ({ recipe_id })),
    );
    repo.loadRecipes.mockResolvedValue(threeRecipes);
    repo.loadIngredients.mockResolvedValue(ingredients);
    repo.writeSnapshot
      .mockResolvedValueOnce({ snapshot_id: "applied-recipe-a", created: true, is_current: true })
      .mockResolvedValueOnce({ snapshot_id: "applied-recipe-b", created: true, is_current: true })
      .mockRejectedValueOnce(new Error("injected third write failure"));

    await expect(runFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      mode: "apply",
      batchSize: 3,
      afterRecipeId: null,
    })).rejects.toMatchObject({ code: "BACKFILL_APPLY_FAILED" });

    expect(repo.restoreCurrent.mock.calls).toEqual([
      ["recipe-b", null, "applied-recipe-b"],
      ["recipe-a", "previous-a", "applied-recipe-a"],
    ]);
  });

  it("rejects a checkpoint outside the canonical FoodSafety-30 scope before reading or restoring current rows", async () => {
    const repo = repository();
    repo.assertScopeRecipeIds.mockRejectedValue(new Error("outside scope"));

    await expect(rollbackFoodSafetyRecipeNutritionBackfill({
      repository: repo,
      checkpoints: [{
        recipe_id: "arbitrary-recipe",
        previous_snapshot_id: "previous-arbitrary",
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "applied-arbitrary",
        state: "applied",
      }],
    })).rejects.toMatchObject({ code: "INVALID_BACKFILL_SCOPE" });

    expect(repo.loadCurrentSnapshots).not.toHaveBeenCalled();
    expect(repo.restoreCurrent).not.toHaveBeenCalled();
  });

  it("removes raw cursors and checkpoint identifiers from stdout reports", () => {
    const report = sanitizeRecipeNutritionBackfillReport({
      scope: "foodsafety-30",
      mode: "apply",
      candidate_count: 2,
      processed_count: 2,
      next_cursor: "raw-recipe-id",
      checkpoints: [{
        recipe_id: "recipe-a",
        previous_snapshot_id: "snapshot-before",
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "snapshot-after",
        state: "applied",
      }],
    });

    expect(report).toEqual({
      scope: "foodsafety-30",
      mode: "apply",
      candidate_count: 2,
      processed_count: 2,
      has_next_cursor: true,
    });
    expect(JSON.stringify(report)).not.toMatch(/raw-recipe-id|recipe-a|snapshot-before|snapshot-after/);
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
        expected_input_hash: VALID_INPUT_HASH,
        applied_snapshot_id: "applied-recipe-a",
        state: "applied",
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

    const missingMealCheckpoint = spawnSync(process.execPath, [
      "scripts/recipe-nutrition-backfill.mjs",
      "meal-apply",
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
    expect(missingMealCheckpoint.status).toBe(1);
    expect(missingMealCheckpoint.stderr.trim()).toBe("BACKFILL_CHECKPOINT_REQUIRED");

    const remoteWrite = spawnSync(process.execPath, [
      "scripts/recipe-nutrition-backfill.mjs",
      "meal-apply",
      "--checkpoint",
      "/tmp/homecook-meal-pin-checkpoint.json",
      "--allow-write",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://production.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
      },
    });
    expect(remoteWrite.status).toBe(1);
    expect(remoteWrite.stderr.trim()).toBe("LOCAL_OPERATOR_ENV_REQUIRED");
  });

  it("writes checkpoint files atomically as owner-only regular files and rejects unsafe paths or scope", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-recipe-checkpoint-"));
    const checkpointPath = join(root, "checkpoint.json");
    const checkpoints = [{
      recipe_id: "recipe-a",
      previous_snapshot_id: "previous-a",
      expected_input_hash: VALID_INPUT_HASH,
      applied_snapshot_id: "applied-a",
      state: "applied",
    }];
    try {
      writeRecipeNutritionCheckpoint(checkpointPath, checkpoints);
      expect(statSync(checkpointPath).mode & 0o777).toBe(0o600);
      expect(readRecipeNutritionCheckpoint(checkpointPath)).toEqual(checkpoints);
      expect(readFileSync(checkpointPath, "utf8")).toContain(
        '"schema_version": "recipe-nutrition-backfill-checkpoint-v3"',
      );

      const mealCheckpointPath = join(root, "meal-checkpoint.json");
      expect(ensureMealPinBackfillCheckpoint(mealCheckpointPath)).toBeNull();
      writeMealPinBackfillCheckpoint(mealCheckpointPath, "meal-cursor-a");
      expect(readMealPinBackfillCheckpoint(mealCheckpointPath)).toBe("meal-cursor-a");

      const symlinkPath = join(root, "linked.json");
      symlinkSync(checkpointPath, symlinkPath);
      expect(() => writeRecipeNutritionCheckpoint(symlinkPath, checkpoints)).toThrowError(
        expect.objectContaining({ code: "INVALID_BACKFILL_CHECKPOINT_PATH" }),
      );

      const directoryPath = join(root, "directory-target");
      mkdirSync(directoryPath);
      expect(() => writeRecipeNutritionCheckpoint(directoryPath, checkpoints)).toThrowError(
        expect.objectContaining({ code: "INVALID_BACKFILL_CHECKPOINT_PATH" }),
      );

      const invalidScopePath = join(root, "invalid-scope.json");
      writeFileSync(invalidScopePath, JSON.stringify({
        schema_version: "recipe-nutrition-backfill-checkpoint-v3",
        scope: "arbitrary-scope",
        checkpoints,
      }), { mode: 0o600 });
      expect(() => readRecipeNutritionCheckpoint(invalidScopePath)).toThrowError(
        expect.objectContaining({ code: "INVALID_BACKFILL_CHECKPOINT" }),
      );

      expect(() => writeRecipeNutritionCheckpoint(
        "/tmp/unsafe-parent-checkpoint.json",
        checkpoints,
      )).toThrowError(expect.objectContaining({ code: "INVALID_BACKFILL_CHECKPOINT_PATH" }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
