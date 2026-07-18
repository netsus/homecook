import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/recipe-nutrition-backfill.mjs`,
).href;

async function loadBackfill(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

type InventoryArtifact = {
  schema_version: string;
  scope: string;
  query_version: string;
  row_count: number;
  rows: Array<Record<string, unknown>>;
  checksum: string;
};

type InventoryLoadResult = {
  inventory: InventoryArtifact;
  operation_counts: OperationCounts;
};

type OperationCounts = {
  inventory_page_reads: number;
  recipe_reads: number;
  ingredient_reads: number;
  predecessor_reads: number;
  current_snapshot_reads: number;
  snapshot_write_calls: number;
  restore_write_calls: number;
};

type BatchResult = {
  scope: string;
  mode: string;
  denominator_count?: number;
  candidate_count: number;
  processed_count: number;
  writes_committed?: number;
  next_cursor: string | null;
  calculation_status_counts: {
    complete: number;
    partial: number;
    unavailable: number;
  };
  missing_reason_counts: Record<string, number>;
  warnings_json?: string[];
  source_count?: number;
  source_fingerprints?: string[];
  secret_count?: number;
  conflict_count?: number;
  multiple_current_count?: number;
  operation_counts?: OperationCounts;
  checkpoints: Array<Record<string, unknown>>;
  inventory_checksum?: string;
  unclassified_count?: number;
};

type RollbackResult = {
  scope: string;
  mode: string;
  processed_count: number;
  writes_committed: number;
  operation_counts: OperationCounts;
  inventory_checksum: string;
};

function requireFunction<T extends (...args: never[]) => unknown>(
  module: Record<string, unknown>,
  name: string,
): T {
  expect(module[name], `missing all-recipe recalculation behavior: ${name}`).toBeTypeOf("function");
  return module[name] as T;
}

function inventoryRows() {
  return [
    {
      recipe_id: "recipe-b",
      base_servings: 4,
      updated_at: "2026-07-18T01:00:00.000Z",
    },
    {
      recipe_id: "recipe-a",
      base_servings: 2,
      updated_at: "2026-07-18T00:00:00.000Z",
    },
  ];
}

function predecessorSource() {
  return {
    id: "source-a",
    review_status: "approved",
    freshness_status: "current",
    is_active: true,
    provider: "mfds",
    dataset: "fixture nutrition",
    source_version: "2026-07-18",
    data_basis_date: null,
    license: "test-only",
    source_url: "https://example.test/nutrition",
  };
}

function predecessors() {
  return new Map([
    ["ingredient-a", {
      nutrition_candidates: [{
        ingredientId: "ingredient-a",
        preparationState: "raw-edible",
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
            source_item_id: "source-item-a",
            normalization_method: "mass_100g",
            basis_amount: 100,
            basis_unit: "g" as const,
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
          source: predecessorSource(),
        },
      }],
      conversion_candidates: [],
      piece_weight: null,
    }],
    ["ingredient-b", {
      nutrition_candidates: [],
      conversion_candidates: [],
      piece_weight: null,
    }],
  ]);
}

function repository(overrides: Record<string, unknown> = {}) {
  const recipes = [
    { id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
    { id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
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

  return {
    deriveSnapshotId: vi.fn((recipeId: string) => `applied-${recipeId}`),
    listAllRecipeInventoryPage: vi.fn(async ({
      afterRecipeId,
      limit,
    }: {
      afterRecipeId: string | null;
      limit: number;
    }) => inventoryRows()
      .slice()
      .sort((left, right) => left.recipe_id.localeCompare(right.recipe_id))
      .filter((row) => afterRecipeId === null || row.recipe_id > afterRecipeId)
      .slice(0, limit)),
    loadRecipes: vi.fn(async () => recipes),
    loadIngredients: vi.fn(async () => ingredients),
    loadPredecessors: vi.fn(async () => predecessors()),
    loadCurrentSnapshots: vi.fn(async () => [{ recipe_id: "recipe-a", id: "previous-a" }]),
    writeSnapshot: vi.fn(async (recipeId: string) => ({
      snapshot_id: `applied-${recipeId}`,
      created: true,
      is_current: true,
    })),
    restoreCurrent: vi.fn(async () => ({ is_current: true })),
    ...overrides,
  };
}

describe("all recipe nutrition recalculation", () => {
  it("builds a stable all-public-recipes inventory checksum independent of input order", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "buildAllRecipeNutritionInventoryArtifact",
    );

    const forward = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never) as Record<string, unknown>;
    const reverse = buildInventoryArtifact({
      recipes: inventoryRows().slice().reverse(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never) as Record<string, unknown>;

    expect(forward).toMatchObject({
      schema_version: "all-recipe-nutrition-inventory-v1",
      scope: "all-public-recipes",
      query_version: "all-recipes-inventory-sql-v1",
      row_count: 2,
      rows: [
        expect.objectContaining({ recipe_id: "recipe-a" }),
        expect.objectContaining({ recipe_id: "recipe-b" }),
      ],
    });
    expect(reverse.checksum).toBe(forward.checksum);
  });

  it("exports the bounded inventory loader and fails closed on overlapping pages", async () => {
    const backfill = await loadBackfill();
    const loadInventory = requireFunction<(input: unknown) => Promise<InventoryLoadResult>>(
      backfill,
      "loadAllRecipeNutritionInventory",
    );
    const repo = repository();
    repo.listAllRecipeInventoryPage
      .mockResolvedValueOnce([
        { recipe_id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
      ])
      .mockResolvedValueOnce([
        { recipe_id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
      ]);

    await expect(loadInventory({
      repository: repo,
      queryVersion: "all-recipes-inventory-sql-v1",
      pageSize: 1,
    } as never)).rejects.toMatchObject({ code: "ALL_RECIPE_INVENTORY_INVALID" });

    expect(repo.listAllRecipeInventoryPage.mock.calls).toEqual([
      [{ afterRecipeId: null, limit: 1 }],
      [{ afterRecipeId: "recipe-a", limit: 1 }],
    ]);
  });

  it("fails closed when the live all-public-recipes inventory checksum drifts before any write", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "buildAllRecipeNutritionInventoryArtifact",
    );
    const runRecalculation = requireFunction<(input: unknown) => Promise<BatchResult>>(
      backfill,
      "runAllRecipeNutritionRecalculation",
    );

    const repo = repository();
    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    repo.listAllRecipeInventoryPage
      .mockResolvedValueOnce([
        { recipe_id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
        { recipe_id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
      ])
      .mockResolvedValueOnce([
        { recipe_id: "recipe-c", base_servings: 1, updated_at: "2026-07-18T02:00:00.000Z" },
      ]);

    await expect(runRecalculation({
      repository: repo,
      inventory,
      mode: "dry-run",
      batchSize: 2,
      inventoryPageSize: 2,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never)).rejects.toMatchObject({ code: "ALL_RECIPE_INVENTORY_DRIFT" });

    expect(repo.loadRecipes).not.toHaveBeenCalled();
    expect(repo.writeSnapshot).not.toHaveBeenCalled();
  });

  it("rejects duplicate or non-canonical inventory rows instead of silently changing the denominator", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "buildAllRecipeNutritionInventoryArtifact",
    );
    const validateInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "validateAllRecipeNutritionInventoryArtifact",
    );

    expect(() => buildInventoryArtifact({
      recipes: [
        ...inventoryRows(),
        {
          recipe_id: "recipe-a",
          base_servings: 3,
          updated_at: "2026-07-18T09:00:00.000Z",
        },
      ],
      query_version: "all-recipes-inventory-sql-v1",
    } as never)).toThrowError(
      expect.objectContaining({ code: "ALL_RECIPE_INVENTORY_DUPLICATE_ID" }),
    );

    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never) as Record<string, unknown>;
    const tampered = {
      ...inventory,
      rows: [...(inventory.rows as Array<Record<string, unknown>>)].reverse(),
    };

    expect(() => validateInventoryArtifact(tampered as never)).toThrowError(
      expect.objectContaining({ code: "ALL_RECIPE_INVENTORY_INVALID" }),
    );
  });

  it("keeps paging bounded and reports same-input replay as zero committed writes", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "buildAllRecipeNutritionInventoryArtifact",
    );
    const runRecalculation = requireFunction<(input: unknown) => Promise<BatchResult>>(
      backfill,
      "runAllRecipeNutritionRecalculation",
    );

    const repo = repository();
    repo.deriveSnapshotId.mockImplementation((recipeId: string) =>
      recipeId === "recipe-a" ? "previous-a" : `applied-${recipeId}`
    );
    repo.listAllRecipeInventoryPage
      .mockResolvedValueOnce([
        { recipe_id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
      ])
      .mockResolvedValueOnce([
        { recipe_id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
      ])
      .mockResolvedValueOnce([]);
    repo.writeSnapshot.mockImplementation(async (recipeId: string) => ({
      snapshot_id: recipeId === "recipe-a" ? "previous-a" : "applied-recipe-b",
      created: false,
      is_current: true,
    }));

    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    const result = await runRecalculation({
      repository: repo,
      inventory,
      mode: "apply",
      batchSize: 2,
      inventoryPageSize: 1,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);

    expect(repo.listAllRecipeInventoryPage.mock.calls).toEqual([
      [{ afterRecipeId: null, limit: 1 }],
      [{ afterRecipeId: "recipe-a", limit: 1 }],
      [{ afterRecipeId: "recipe-b", limit: 1 }],
    ]);
    expect(result).toMatchObject({
      scope: "all-public-recipes",
      processed_count: 2,
      writes_committed: 1,
      checkpoints: [
        {
          recipe_id: "recipe-b",
          previous_snapshot_id: null,
          applied_snapshot_id: "applied-recipe-b",
          state: "applied",
        },
      ],
    });
  });

  it("rolls back only unchanged current rows and restores previous-null without deleting history", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(
      backfill,
      "buildAllRecipeNutritionInventoryArtifact",
    );
    const rollbackRecalculation = requireFunction<(input: unknown) => Promise<RollbackResult>>(
      backfill,
      "rollbackAllRecipeNutritionRecalculation",
    );

    const repo = repository();
    repo.loadCurrentSnapshots.mockResolvedValue([
      { recipe_id: "recipe-a", id: "applied-recipe-a" },
      { recipe_id: "recipe-b", id: "applied-recipe-b" },
    ]);

    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    const result = await rollbackRecalculation({
      repository: repo,
      inventory,
      checkpoints: [
        {
          recipe_id: "recipe-a",
          previous_snapshot_id: "previous-a",
          expected_input_hash: "a".repeat(64),
          applied_snapshot_id: "applied-recipe-a",
          state: "applied",
        },
        {
          recipe_id: "recipe-b",
          previous_snapshot_id: null,
          expected_input_hash: "b".repeat(64),
          applied_snapshot_id: "applied-recipe-b",
          state: "applied",
        },
      ],
    } as never);

    expect(result).toEqual({
      scope: "all-public-recipes",
      mode: "rollback",
      processed_count: 2,
      writes_committed: 2,
      operation_counts: {
        inventory_page_reads: 1,
        recipe_reads: 0,
        ingredient_reads: 0,
        predecessor_reads: 0,
        current_snapshot_reads: 1,
        snapshot_write_calls: 0,
        restore_write_calls: 2,
      },
      inventory_checksum: inventory.checksum,
    });
    expect(repo.restoreCurrent.mock.calls).toEqual([
      ["recipe-b", null, "applied-recipe-b"],
      ["recipe-a", "previous-a", "applied-recipe-a"],
    ]);
    expect(repo).not.toHaveProperty("deleteSnapshot");
  });

  it("allows zero-candidate quantitative ingredients to remain partial/unavailable instead of treating them as conflicts", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(backfill, "buildAllRecipeNutritionInventoryArtifact");
    const runRecalculation = requireFunction<(input: unknown) => Promise<BatchResult>>(backfill, "runAllRecipeNutritionRecalculation");

    const repo = repository({
      loadIngredients: vi.fn(async () => [{
        id: "ingredient-row-b",
        recipe_id: "recipe-b",
        ingredient_id: "ingredient-b",
        amount: 80,
        unit: "g",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }]),
      loadRecipes: vi.fn(async () => [
        { id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
      ]),
      listAllRecipeInventoryPage: vi.fn(async () => [
        { recipe_id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
      ]),
      loadCurrentSnapshots: vi.fn(async () => []),
    });
    const inventory = buildInventoryArtifact({
      recipes: [{ recipe_id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" }],
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    const result = await runRecalculation({
      repository: repo,
      inventory,
      mode: "apply",
      batchSize: 1,
      inventoryPageSize: 10,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);

    expect(result.conflict_count).toBe(0);
    expect(result.multiple_current_count).toBe(0);
    expect(result.calculation_status_counts).toMatchObject({ unavailable: 1 });
  });

  it("measures multiple eligible predecessors and fails closed before writes in apply mode", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(backfill, "buildAllRecipeNutritionInventoryArtifact");
    const runRecalculation = requireFunction<(input: unknown) => Promise<BatchResult>>(backfill, "runAllRecipeNutritionRecalculation");

    const duplicatePredecessors = predecessors();
    duplicatePredecessors.set("ingredient-a", {
      nutrition_candidates: [
        ...duplicatePredecessors.get("ingredient-a")!.nutrition_candidates,
        {
          ...duplicatePredecessors.get("ingredient-a")!.nutrition_candidates[0],
          nutrition: {
            ...duplicatePredecessors.get("ingredient-a")!.nutrition_candidates[0].nutrition,
            link: {
              ...duplicatePredecessors.get("ingredient-a")!.nutrition_candidates[0].nutrition.link,
              id: "link-a-2",
            },
          },
        },
      ],
      conversion_candidates: [],
      piece_weight: null,
    });
    const repo = repository({
      loadPredecessors: vi.fn(async () => duplicatePredecessors),
    });
    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    await expect(runRecalculation({
      repository: repo,
      inventory,
      mode: "apply",
      batchSize: 2,
      inventoryPageSize: 10,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never)).rejects.toMatchObject({ code: "ALL_RECIPE_CONFLICT_DETECTED" });

    const dryRun = await runRecalculation({
      repository: repo,
      inventory,
      mode: "dry-run",
      batchSize: 2,
      inventoryPageSize: 10,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);
    expect(dryRun.multiple_current_count).toBeGreaterThan(0);
    expect(repo.writeSnapshot).not.toHaveBeenCalled();
  });

  it("measures operation counts deterministically and never re-reads predecessors per ingredient", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(backfill, "buildAllRecipeNutritionInventoryArtifact");
    const runRecalculation = requireFunction<(input: unknown) => Promise<BatchResult>>(backfill, "runAllRecipeNutritionRecalculation");

    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);
    const firstRepo = repository();
    const secondRepo = repository();

    const first = await runRecalculation({
      repository: firstRepo,
      inventory,
      mode: "dry-run",
      batchSize: 2,
      inventoryPageSize: 1,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);
    const second = await runRecalculation({
      repository: secondRepo,
      inventory,
      mode: "dry-run",
      batchSize: 2,
      inventoryPageSize: 1,
      afterRecipeId: null,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);

    expect(first.operation_counts).toEqual(second.operation_counts);
    expect(first.operation_counts).toMatchObject({
      inventory_page_reads: 3,
      recipe_reads: 1,
      ingredient_reads: 1,
      predecessor_reads: 1,
      current_snapshot_reads: 0,
      snapshot_write_calls: 0,
    });
  });

  it("aggregates canonical warnings_json and prefix-based missing_reason_counts without inventing new enums", async () => {
    const backfill = await loadBackfill();
    const buildInventoryArtifact = requireFunction<(input: unknown) => InventoryArtifact>(backfill, "buildAllRecipeNutritionInventoryArtifact");
    const runLifecycle = requireFunction<(input: unknown) => Promise<BatchResult>>(
      backfill,
      "runAllRecipeNutritionRecalculationLifecycle",
    );

    const repo = repository({
      loadRecipes: vi.fn(async (recipeIds: string[]) => [
        { id: "recipe-a", base_servings: 2, updated_at: "2026-07-18T00:00:00.000Z" },
        { id: "recipe-b", base_servings: 4, updated_at: "2026-07-18T01:00:00.000Z" },
      ].filter((row) => recipeIds.includes(row.id))),
      loadIngredients: vi.fn(async (recipeIds: string[]) => [
        {
          id: "ingredient-row-a",
          recipe_id: "recipe-a",
          ingredient_id: "ingredient-b",
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
      ].filter((row) => recipeIds.includes(row.recipe_id))),
    });
    const inventory = buildInventoryArtifact({
      recipes: inventoryRows(),
      query_version: "all-recipes-inventory-sql-v1",
    } as never);

    const result = await runLifecycle({
      repository: repo,
      inventory,
      mode: "dry-run",
      batchSize: 1,
      inventoryPageSize: 1,
      calculatedAt: "2026-07-18T03:00:00.000Z",
    } as never);

    expect(result.warnings_json).toEqual([
      "NUTRITION_PROFILE_MISSING",
      "TO_TASTE_EXCLUDED",
    ]);
    expect(result.missing_reason_counts).toEqual({
      NUTRITION_PROFILE_MISSING: 1,
      TO_TASTE_EXCLUDED: 1,
    });
    expect(result.unclassified_count).toBe(0);
  });
});
