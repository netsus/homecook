import { describe, expect, it, vi } from "vitest";
import { estimateCookedWeight, readCookedWeightEstimate, type CookingWeightSession } from "@/lib/server/cooked-batch-weight-estimate";
import type { RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";

const ingredient = (patch: Partial<RecipeNutritionIngredientInput> = {}): RecipeNutritionIngredientInput => ({
  id: "row", ingredient_id: "ingredient", amount: 200, unit: "g", ingredient_type: "QUANT", scalable: true, preparation_state: "raw", ...patch,
});
const source = { id: "evidence", provider: "catalog", dataset: "weights", source_version: "1", data_basis_date: null, license: "public", source_url: "https://example.invalid", review_status: "approved", freshness_status: "current", is_active: true };
const volume = ingredient({ amount: 30, unit: "ml", conversion_assignment: {
  id: "assignment", ingredient_id: "ingredient", preparation_state: "raw", review_status: "approved", is_active: true,
  profile: { code: "density", basis_volume_ml: 15, representative_weight_g: 10, is_active: true },
  evidence: { normalized_g_per_15ml: 10, review_status: "approved", is_active: true, source },
} });
const snapshot = { id: "pin", recipe_id: "recipe", owner_user_id: "owner", base_servings: 2, ingredients_json: [ingredient()] };
const session: CookingWeightSession = { id: "session", user_id: "owner", recipe_id: "recipe", contract_version: "snapshot_v2", cooking_servings: 4, recipe_content_snapshot_id: "pin", recipe_content_snapshots: snapshot };
function client(data: unknown = session, error: unknown = null) {
  const query = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  return { from: vi.fn(() => ({ select: vi.fn(() => query) })), query };
}

describe("finished cooking weight estimate", () => {
  it("applies 75 percent after scaling each ingredient, preserving fixed quantities", () => {
    expect(estimateCookedWeight([ingredient(), ingredient({ amount: 100, scalable: false })], 2, 4)).toBe(375);
    expect(estimateCookedWeight([ingredient({ amount: 0.2, unit: "kg" })], 2, 2)).toBe(150);
  });
  it("uses approved density and piece-weight evidence without assuming ml equals g", () => {
    const piece = ingredient({ amount: 2, unit: "개", piece_weight: { id: "piece", ingredient_id: "ingredient", size_code: "medium", preparation_state: "raw", weight_g: 80, review_status: "approved", is_active: true, evidence: { review_status: "approved", is_active: true, source } } });
    expect(estimateCookedWeight([volume, piece], 2, 2)).toBe(135);
    expect(estimateCookedWeight([ingredient({ unit: "ml" })], 2, 2)).toBeNull();
  });
  it("never returns a known partial sum when any quantitative row lacks a conversion", () => {
    for (const unknown of [ingredient({ unit: "봉" }), ingredient({ amount: null }), ingredient({ amount: 0 }), ingredient({ amount: -1 })]) {
      expect(estimateCookedWeight([ingredient(), unknown], 2, 2)).toBeNull();
    }
    expect(estimateCookedWeight([], 2, 2)).toBeNull();
  });
  it("keeps optional to-taste ingredients excluded and never treats a product as its generic ingredient", () => {
    expect(estimateCookedWeight([ingredient(), ingredient({ ingredient_type: "TO_TASTE", amount: null, unit: null, scalable: false })], 2, 2)).toBe(150);
    expect(estimateCookedWeight([{ ...volume, food_product_id: "product", food_product_nutrition_version_id: "pinned-version" }], 2, 2)).toBeNull();
  });
  it.each([[0, 2], [2, 0], [2, Infinity]])("rejects invalid servings %s/%s", (base, cooking) => {
    expect(estimateCookedWeight([ingredient()], base, cooking)).toBeNull();
  });
  it("uses only the owner's session pin, not current recipe ingredients", async () => {
    const db = client(); const weightClient = { from: vi.fn() };
    expect(await readCookedWeightEstimate({ client: db, weightClient, ownerId: "owner", sessionId: "session" })).toBe(300);
    expect(db.from).toHaveBeenCalledExactlyOnceWith("cooking_sessions");
    expect(db.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(weightClient.from).not.toHaveBeenCalled();
  });
  it.each([{ user_id: "other" }, { recipe_content_snapshot_id: "different" }, { recipe_content_snapshots: { ...snapshot, owner_user_id: "other" } }])("refuses a mismatched owner or snapshot before conversion lookup", async (change) => {
    const weightClient = { from: vi.fn() };
    expect(await readCookedWeightEstimate({ client: client({ ...session, ...change }), weightClient, ownerId: "owner", sessionId: "session" })).toBeNull();
    expect(weightClient.from).not.toHaveBeenCalled();
  });
  it("does not hide a failed authorized session read as missing weight", async () => {
    const failure = { publicCode: "ACCOUNT_SESSION_STALE", publicStatus: 409 };
    await expect(readCookedWeightEstimate({ client: client(null, failure), weightClient: null, ownerId: "owner", sessionId: "session" })).rejects.toBe(failure);
  });
});
