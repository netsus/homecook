import { describe, expect, it, vi } from "vitest";
import { refreshIngredientAiRecipeNutrition } from "@/lib/server/ingredient-ai-nutrition-refresh";

const JOB = "00000000-0000-4000-8000-000000000001";
const RECIPE = "00000000-0000-4000-8000-000000000002";
const UPDATED = "2026-10-08T00:00:00+00:00";
const SOURCE = { provider: "HOMECOOK_AI_ESTIMATE", dataset: "AI nutrition estimate", source_version: "v1",
  data_basis_date: null, license: "AI-generated estimate", source_url: "https://example.test/ai-nutrition" };
const VALUES = ["carbohydrate_g", "energy_kcal", "fat_g", "protein_g", "sodium_mg"]
  .map((nutrient_code) => ({ nutrient_code, amount: 100, value_status: "estimated" }));

function bundle() {
  return {
    job_id: JOB, recipe_id: RECIPE,
    recipe: { id: RECIPE, base_servings: 2, updated_at: UPDATED, created_by: "owner-1" },
    recipe_ingredients: [{ id: "ri-1", recipe_id: RECIPE, ingredient_id: "ingredient-1", amount: 50,
      unit: "g", ingredient_type: "QUANT", scalable: true, sort_order: 0 }],
    ingredient_nutrition_profiles: [{ id: "link-1", ingredient_id: "ingredient-1", nutrition_profile_id: "profile-1",
      preparation_state: "raw", review_status: "approved", is_active: true, is_primary: true,
      nutrition_profiles: { id: "profile-1", source_item_id: "item-1", profile_kind: "ingredient_source",
        normalization_method: "mass_100g", basis_amount: 100, basis_unit: "g", review_status: "approved", is_active: true,
        nutrition_values: VALUES, nutrition_source_items: { id: "item-1", source_id: "source-1", review_status: "approved",
          nutrition_sources: { id: "source-1", provider_code: SOURCE.provider, dataset_name: SOURCE.dataset,
            source_version: SOURCE.source_version, data_basis_date: null, license_name: SOURCE.license,
            source_url: SOURCE.source_url, review_status: "approved", freshness_status: "current", is_active: true } } } }],
    ingredient_conversion_assignments: [], piece_unit_weights: [], product_predecessors: [] as unknown[],
    input_guard: { recipe_ingredients: [{ id: "ri-1", ingredient_id: "ingredient-1", amount: 50, unit: "g",
      ingredient_type: "QUANT", scalable: true, sort_order: 0,
      nutrition_candidates: [{ link_id: "link-1", profile_id: "profile-1", source_item_id: "item-1", source_id: "source-1",
        preparation_state: "raw", normalization_method: "mass_100g", basis_amount: 100, basis_unit: "g",
        nutrition_values: VALUES, source: SOURCE }], conversion_candidates: [],
      selected_nutrition_link_id: "link-1", selected_conversion_assignment_id: null }] },
  };
}

function rpcClient(input: unknown = bundle()) {
  return { rpc: vi.fn(async (name: string, _args: Record<string, unknown>) => {
    void _args;
    if (name === "get_ingredient_ai_recipe_refresh_input") return { data: input, error: null };
    if (name === "write_ingredient_ai_recipe_refresh") return { data: { snapshot_id: "snapshot-1", created: true, is_current: true }, error: null };
    throw Error(`Unexpected external RPC: ${name}`);
  }) };
}

const options = { jobId: JOB, recipeId: RECIPE, calculatedAt: "2026-10-08T01:00:00Z" };

describe("job-scoped AI recipe refresh", () => {
  it("reuses the calculator using only two narrow RPCs and never acknowledges jobs", async () => {
    const input = bundle();
    const client = rpcClient(input);
    await expect(refreshIngredientAiRecipeNutrition(client, options)).resolves.toEqual({ snapshot_id: "snapshot-1", created: true, is_current: true });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(["get_ingredient_ai_recipe_refresh_input", "write_ingredient_ai_recipe_refresh"]);
    expect(client.rpc.mock.calls[1][1]).toMatchObject({ p_job_id: JOB, p_recipe_id: RECIPE,
      p_expected_recipe_updated_at: UPDATED, p_input_guard: input.input_guard,
      p_snapshot: { calculation_version: "recipe-nutrition-v2", calculation_quality: "estimated",
        scalable_values: { energy_kcal: 50 }, warnings: ["AI_NUTRITION_ESTIMATE_USED"], calculated_at: options.calculatedAt } });
  });

  it("rejects a different job/recipe bundle before calculation or write", async () => {
    for (const field of ["job_id", "recipe_id"] as const) {
      const input = bundle(); input[field] = "00000000-0000-4000-8000-000000000099";
      const client = rpcClient(input);
      await expect(refreshIngredientAiRecipeNutrition(client, options)).rejects.toMatchObject({ code: "AI_NUTRITION_REFRESH_INVALID_BUNDLE" });
      expect(client.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects SQL/JS guard drift instead of using the supplied guard to mask it", async () => {
    const input = bundle(); input.input_guard.recipe_ingredients[0].amount = 99;
    const client = rpcClient(input);
    await expect(refreshIngredientAiRecipeNutrition(client, options)).rejects.toMatchObject({ code: "AI_NUTRITION_REFRESH_GUARD_MISMATCH" });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps an unavailable product pin instead of falling back to generic AI", async () => {
    const input = bundle();
    const pins = { food_product_id: "product-1", food_product_nutrition_version_id: "version-1" };
    Object.assign(input.recipe_ingredients[0], pins);
    Object.assign(input.input_guard.recipe_ingredients[0], pins, { product_predecessor: null });
    input.product_predecessors = [{ id: "ri-1", product_predecessor: null }];
    const client = rpcClient(input);
    await refreshIngredientAiRecipeNutrition(client, options);
    expect(client.rpc.mock.calls[1][1]).toMatchObject({ p_snapshot: { calculation_status: "unavailable", sources: [],
      warnings: ["NUTRITION_PROFILE_MISSING"] }, p_input_guard: { recipe_ingredients: [expect.objectContaining({ ...pins, product_predecessor: null })] } });
  });

  it("fails before the read RPC on invalid identifiers", async () => {
    const client = rpcClient();
    await expect(refreshIngredientAiRecipeNutrition(client, { ...options, jobId: "" })).rejects.toMatchObject({ code: "AI_NUTRITION_REFRESH_INVALID_INPUT" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each(["AI_NUTRITION_DISABLED", "AI_NUTRITION_REFRESH_NOT_PENDING"])("preserves %s without writes or acknowledgement", async (message) => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message } })) };
    await expect(refreshIngredientAiRecipeNutrition(client, options)).rejects.toMatchObject({ code: message });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves a stale-write error so the runtime can retry the pending recipe", async () => {
    const client = { rpc: vi.fn(async (name: string) => name === "get_ingredient_ai_recipe_refresh_input"
      ? { data: bundle(), error: null } : { data: null, error: { message: "RECIPE_NUTRITION_INPUT_STALE" } }) };
    await expect(refreshIngredientAiRecipeNutrition(client, options)).rejects.toMatchObject({ code: "RECIPE_NUTRITION_INPUT_STALE" });
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });
});
