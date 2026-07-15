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

function listResult(data: unknown[], error: unknown = null) {
  let result = { data, error };
  const query = {
    select: vi.fn((columns: string) => {
      void columns;
      return query;
    }),
    in: vi.fn((column: string, values: string[]) => {
      void column;
      void values;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      void column;
      void value;
      return query;
    }),
    order: vi.fn((column: string, options: { ascending: boolean }) => {
      void column;
      void options;
      return query;
    }),
    range: vi.fn((from: number, to: number) => {
      result = { data: data.slice(from, to + 1), error };
      return query;
    }),
    then(
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const coreValues = [
  ["energy_kcal", 100],
  ["carbohydrate_g", 20],
  ["protein_g", 10],
  ["fat_g", 5],
  ["sodium_mg", 50],
].map(([nutrient_code, amount]) => ({
  nutrient_code,
  amount,
  value_status: "observed",
}));

function approvedNutritionLink({
  id = "link-1",
  ingredientId = "ingredient-1",
  profileId = "profile-1",
  preparationState = "raw-edible",
  active = true,
  normalizationMethod = "mass_100g",
  basisAmount = 100,
  basisUnit = "g",
}: {
  id?: string;
  ingredientId?: string;
  profileId?: string;
  preparationState?: string;
  active?: boolean;
  normalizationMethod?: "mass_100g" | "volume_100ml";
  basisAmount?: number;
  basisUnit?: "g" | "ml";
} = {}) {
  return {
    id,
    ingredient_id: ingredientId,
    nutrition_profile_id: profileId,
    preparation_state: preparationState,
    review_status: active ? "approved" : "revoked",
    is_active: active,
    is_primary: active,
    nutrition_profiles: {
      id: profileId,
      source_item_id: `item-${profileId}`,
      profile_kind: "ingredient_source",
      normalization_method: normalizationMethod,
      basis_amount: basisAmount,
      basis_unit: basisUnit,
      review_status: "approved",
      is_active: true,
      nutrition_values: coreValues,
      nutrition_source_items: {
        id: `item-${profileId}`,
        source_id: `source-${profileId}`,
        review_status: "approved",
        nutrition_sources: {
          id: `source-${profileId}`,
          provider_code: "mfds",
          dataset_name: "fixture nutrition",
          source_version: "2026-07-16",
          data_basis_date: null,
          license_name: "test-only",
          source_url: "https://example.test/nutrition",
          review_status: "approved",
          freshness_status: "current",
          is_active: true,
        },
      },
    },
  };
}

function approvedConversionAssignment({
  id = "assignment-1",
  preparationState = "raw-edible",
  active = true,
}: {
  id?: string;
  preparationState?: string;
  active?: boolean;
} = {}) {
  return {
    id,
    ingredient_id: "ingredient-1",
    conversion_profile_id: "conversion-profile-1",
    evidence_id: `evidence-${id}`,
    preparation_state: preparationState,
    review_status: active ? "approved" : "revoked",
    is_active: active,
    measurement_conversion_profiles: {
      id: "conversion-profile-1",
      code: "VOLUME_G15",
      basis_volume_ml: 15,
      representative_weight_g: 15,
      is_active: true,
    },
    measurement_source_evidence: {
      id: `evidence-${id}`,
      source_id: `measurement-source-${id}`,
      evidence_kind: "volume_weight",
      preparation_state: preparationState,
      review_status: "approved",
      is_active: true,
      nutrition_sources: {
        id: `measurement-source-${id}`,
        provider_code: "rda",
        dataset_name: "fixture measurement",
        source_version: "2026-07-16",
        data_basis_date: null,
        license_name: "test-only",
        source_url: "https://example.test/measurement",
        review_status: "approved",
        freshness_status: "current",
        is_active: true,
      },
    },
  };
}

function serviceClient({
  recipeId = "recipe-1",
  ingredients = [{
    id: "recipe-ingredient-1",
    ingredient_id: "ingredient-1",
    amount: 100,
    unit: "g",
    ingredient_type: "QUANT",
    scalable: true,
    sort_order: 0,
  }],
  nutritionLinks = [approvedNutritionLink()],
  conversionAssignments = [],
}: {
  recipeId?: string;
  ingredients?: unknown[];
  nutritionLinks?: unknown[];
  conversionAssignments?: unknown[];
} = {}) {
  const recipeQuery = maybeSingleResult({
    id: recipeId,
    base_servings: 2,
    updated_at: "2026-07-16T00:00:00.000Z",
  });
  const ingredientsQuery = ingredientResult(ingredients);
  const linksQuery = listResult(nutritionLinks);
  const assignmentsQuery = listResult(conversionAssignments);
  const rpc = vi.fn(async (_name: string, args: {
    p_snapshot: Record<string, unknown>;
    p_input_guard: Record<string, unknown>;
  }) => ({
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
    if (table === "ingredient_nutrition_profiles") return linksQuery;
    if (table === "ingredient_conversion_assignments") return assignmentsQuery;
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, rpc, recipeQuery, ingredientsQuery, linksQuery, assignmentsQuery };
}

describe("recipe nutrition snapshot service", () => {
  it("hydrates the only eligible predecessor chain across unspecified states in bounded queries", async () => {
    const { from, rpc } = serviceClient();

    const result = await recalculateRecipeNutritionSnapshot(
      { from, rpc } as never,
      "recipe-1",
      { calculatedAt: "2026-07-16T00:01:00.000Z" },
    );

    expect(result).toMatchObject({ snapshot_id: "snapshot-1", created: true, is_current: true });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_expected_recipe_updated_at: "2026-07-16T00:00:00.000Z",
    });
    const snapshotPayload = rpc.mock.calls[0][1].p_snapshot;
    expect(snapshotPayload).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      sources: [expect.objectContaining({
        provider: "mfds",
        dataset: "fixture nutrition",
      })],
      scalable_values: expect.objectContaining({ energy_kcal: 100 }),
      fixed_values: expect.objectContaining({ energy_kcal: 0 }),
      calculated_at: "2026-07-16T00:01:00.000Z",
    });
    expect(snapshotPayload).not.toHaveProperty("nutrition_profile_id");
    expect(snapshotPayload).not.toHaveProperty("source_calculation_hash");
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "recipes",
      "recipe_ingredients",
      "ingredient_nutrition_profiles",
      "ingredient_conversion_assignments",
    ]);
  });

  it.each([
    ["zero eligible chains", []],
    ["one inactive chain", [approvedNutritionLink({ active: false })]],
    ["one malformed normalized basis", [approvedNutritionLink({ basisAmount: 90 })]],
    ["multiple eligible state chains", [
      approvedNutritionLink(),
      approvedNutritionLink({
        id: "link-2",
        profileId: "profile-2",
        preparationState: "cooked",
      }),
    ]],
  ])("fails closed for %s without choosing a first row", async (_label, nutritionLinks) => {
    const { from, rpc } = serviceClient({ nutritionLinks });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "unavailable",
      calculation_quality: null,
      reflected_ingredient_count: 0,
      target_ingredient_count: 1,
      sources: [],
    });
  });

  it("selects the direct profile by the recipe unit when mass and volume candidates both exist", async () => {
    const massLink = approvedNutritionLink();
    const volumeLink = approvedNutritionLink({
      id: "link-volume",
      profileId: "profile-volume",
      preparationState: "liquid",
      normalizationMethod: "volume_100ml",
      basisUnit: "ml",
    });
    const massClient = serviceClient({
      nutritionLinks: [massLink, volumeLink],
    });
    const volumeClient = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 100,
        unit: "ml",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      nutritionLinks: [massLink, volumeLink],
    });

    await recalculateRecipeNutritionSnapshot(
      { from: massClient.from, rpc: massClient.rpc } as never,
      "recipe-1",
    );
    await recalculateRecipeNutritionSnapshot(
      { from: volumeClient.from, rpc: volumeClient.rpc } as never,
      "recipe-1",
    );

    expect(massClient.rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "direct",
      scalable_values: expect.objectContaining({ energy_kcal: 100 }),
    });
    expect(volumeClient.rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "direct",
      scalable_values: expect.objectContaining({ energy_kcal: 100 }),
    });
  });

  it("falls back from no direct volume profile to one mass profile plus one conversion", async () => {
    const { from, rpc } = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 1,
        unit: "tbsp",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      nutritionLinks: [approvedNutritionLink()],
      conversionAssignments: [approvedConversionAssignment()],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "estimated",
      scalable_values: expect.objectContaining({ energy_kcal: 15 }),
    });
  });

  it("hydrates all canonical ingredients with one link query and one conversion query", async () => {
    const { from, rpc, linksQuery, assignmentsQuery } = serviceClient({
      ingredients: [
        {
          id: "recipe-ingredient-1",
          ingredient_id: "ingredient-1",
          amount: 100,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 0,
        },
        {
          id: "recipe-ingredient-2",
          ingredient_id: "ingredient-2",
          amount: 50,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 1,
        },
      ],
      nutritionLinks: [
        approvedNutritionLink(),
        approvedNutritionLink({
          id: "link-2",
          ingredientId: "ingredient-2",
          profileId: "profile-2",
        }),
      ],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(linksQuery.in).toHaveBeenCalledOnce();
    expect(linksQuery.in).toHaveBeenCalledWith("ingredient_id", ["ingredient-1", "ingredient-2"]);
    expect(linksQuery.select.mock.calls[0][0]).toContain("id, ingredient_id");
    expect(linksQuery.select.mock.calls[0][0]).toContain("nutrition_values(");
    expect(assignmentsQuery.in).toHaveBeenCalledOnce();
    expect(assignmentsQuery.select.mock.calls[0][0]).toContain("id, ingredient_id");
    expect(assignmentsQuery.select.mock.calls[0][0]).toContain("measurement_source_evidence(");
    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      reflected_ingredient_count: 2,
      target_ingredient_count: 2,
    });
  });

  it("passes a canonical input guard so the writer can reject predecessor races", async () => {
    const { from, rpc } = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      nutritionLinks: [approvedNutritionLink()],
      conversionAssignments: [approvedConversionAssignment()],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_input_guard).toEqual({
      recipe_ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
        nutrition_candidates: [{
          link_id: "link-1",
          profile_id: "profile-1",
          source_item_id: "item-profile-1",
          source_id: "source-profile-1",
          preparation_state: "raw-edible",
          normalization_method: "mass_100g",
          basis_amount: 100,
          basis_unit: "g",
          nutrition_values: [
            { nutrient_code: "carbohydrate_g", amount: 20, value_status: "observed" },
            { nutrient_code: "energy_kcal", amount: 100, value_status: "observed" },
            { nutrient_code: "fat_g", amount: 5, value_status: "observed" },
            { nutrient_code: "protein_g", amount: 10, value_status: "observed" },
            { nutrient_code: "sodium_mg", amount: 50, value_status: "observed" },
          ],
          source: {
            provider: "mfds",
            dataset: "fixture nutrition",
            source_version: "2026-07-16",
            data_basis_date: null,
            license: "test-only",
            source_url: "https://example.test/nutrition",
          },
        }],
        conversion_candidates: [{
          assignment_id: "assignment-1",
          profile_id: "conversion-profile-1",
          evidence_id: "evidence-assignment-1",
          source_id: "measurement-source-assignment-1",
          preparation_state: "raw-edible",
          profile_code: "VOLUME_G15",
          basis_volume_ml: 15,
          representative_weight_g: 15,
          evidence_preparation_state: "raw-edible",
          source: {
            provider: "rda",
            dataset: "fixture measurement",
            source_version: "2026-07-16",
            data_basis_date: null,
            license: "test-only",
            source_url: "https://example.test/measurement",
          },
        }],
        selected_nutrition_link_id: "link-1",
        selected_conversion_assignment_id: null,
      }],
    });
  });

  it("filters eligible predecessors server-side and paginates beyond the PostgREST row cap", async () => {
    const fillerRows = Array.from({ length: 999 }, (_, index) => ({
      id: `ineligible-${index}`,
    }));
    const { from, rpc, linksQuery, assignmentsQuery } = serviceClient({
      ingredients: [
        {
          id: "recipe-ingredient-1",
          ingredient_id: "ingredient-1",
          amount: 100,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 0,
        },
        {
          id: "recipe-ingredient-2",
          ingredient_id: "ingredient-2",
          amount: 100,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 1,
        },
      ],
      nutritionLinks: [
        approvedNutritionLink(),
        ...fillerRows,
        approvedNutritionLink({
          id: "link-after-cap",
          ingredientId: "ingredient-2",
          profileId: "profile-after-cap",
        }),
      ],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(linksQuery.eq.mock.calls).toEqual([
      ["review_status", "approved"],
      ["is_active", true],
      ["is_primary", true],
      ["review_status", "approved"],
      ["is_active", true],
      ["is_primary", true],
    ]);
    expect(linksQuery.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(assignmentsQuery.eq.mock.calls).toEqual([
      ["review_status", "approved"],
      ["is_active", true],
    ]);
    expect(assignmentsQuery.range).toHaveBeenCalledWith(0, 999);
    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      reflected_ingredient_count: 2,
      target_ingredient_count: 2,
    });
  });

  it("uses exactly one approved conversion compatible with the selected nutrition state", async () => {
    const { from, rpc } = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 1,
        unit: "tbsp",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      conversionAssignments: [approvedConversionAssignment()],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "estimated",
      scalable_values: expect.objectContaining({ energy_kcal: 15 }),
      warnings: ["REPRESENTATIVE_VOLUME_CONVERSION_USED"],
      sources: [
        expect.objectContaining({ provider: "mfds" }),
        expect.objectContaining({ provider: "rda" }),
      ],
    });
  });

  it.each([
    ["no conversion", []],
    ["multiple compatible conversions", [
      approvedConversionAssignment(),
      approvedConversionAssignment({ id: "assignment-2" }),
    ]],
    ["conversion for another preparation state", [
      approvedConversionAssignment({ preparationState: "cooked" }),
    ]],
  ])("fails closed for %s instead of guessing a volume path", async (_label, conversionAssignments) => {
    const { from, rpc } = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 1,
        unit: "tbsp",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      conversionAssignments,
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "unavailable",
      reflected_ingredient_count: 0,
      warnings: ["UNIT_CONVERSION_MISSING"],
      sources: [],
    });
  });

  it("counts conversion candidates across all states before checking nutrition compatibility", async () => {
    const { from, rpc } = serviceClient({
      ingredients: [{
        id: "recipe-ingredient-1",
        ingredient_id: "ingredient-1",
        amount: 1,
        unit: "tbsp",
        ingredient_type: "QUANT",
        scalable: true,
        sort_order: 0,
      }],
      conversionAssignments: [
        approvedConversionAssignment(),
        approvedConversionAssignment({
          id: "assignment-cooked",
          preparationState: "cooked",
        }),
      ],
    });

    await recalculateRecipeNutritionSnapshot({ from, rpc } as never, "recipe-1");

    expect(rpc.mock.calls[0][1].p_snapshot).toMatchObject({
      calculation_status: "unavailable",
      calculation_quality: null,
      reflected_ingredient_count: 0,
      warnings: ["UNIT_CONVERSION_MISSING"],
      sources: [],
    });
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
