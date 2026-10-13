import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSnapshotWeightPrediction, summarizeWeightPrediction } from "@/lib/server/cooked-batch-weight-evidence";
import type { CookingWeightSessionClient } from "@/lib/server/cooked-batch-weight-estimate";
const loaders = vi.hoisted(() => ({ load: vi.fn(), hydrate: vi.fn() }));
vi.mock("@/scripts/lib/recipe-nutrition-predecessor.mjs", () => ({ loadRecipeNutritionPredecessors: loaders.load, hydrateRecipeNutritionIngredients: loaders.hydrate }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const sessionId = "550e8400-e29b-41d4-a716-446655440002";
const pin = "550e8400-e29b-41d4-a716-446655440003";
const ingredient = "550e8400-e29b-41d4-a716-446655440004";
const method = "550e8400-e29b-41d4-a716-446655440005";
const step = { step_number: 1, instruction: "섞는다", cooking_method_id: method, heat_level: null };
const projectedStep = { step_number: 1, instruction: "섞는다", cooking_method: { code: "MIX", label: "섞기", color_key: "green" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null };
function source() {
  return { id: sessionId, user_id: owner, recipe_id: ingredient, status: "in_progress", contract_version: "snapshot_v2", cooking_servings: 2, recipe_content_snapshot_id: pin,
    recipe_content_snapshots: { id: pin, recipe_id: ingredient, owner_user_id: owner, base_servings: 2, ingredients_json: [{ ingredient_id: ingredient, row_key: "fixed-row", amount: 300, unit: "g", scalable: true, ingredient_type: "QUANT" }], steps_json: [step] } };
}
function client(data: unknown, error: unknown = null) {
  type Query = ReturnType<ReturnType<CookingWeightSessionClient["from"]>["select"]>;
  const query: Query = { eq: vi.fn(() => query), maybeSingle: async () => ({ data, error }) };
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  return { from: vi.fn(() => ({ select: vi.fn(() => query) })), rpc };
}
beforeEach(() => { loaders.load.mockReset(); loaders.hydrate.mockReset(); loaders.load.mockResolvedValue({}); loaders.hydrate.mockImplementation(rows => rows); });
describe("server-owned pinned weight input", () => {
  it("joins authoritative methods without promoting planned quantities or sending raw instructions", async () => {
    const value = source(); const reader = client(value); const methods = { rpc: vi.fn().mockResolvedValue({ data: { session_id: sessionId, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
      recipe: { id: ingredient, title: "요리", base_servings: 2, cooking_servings: 2, ingredients: [], steps: [{ ...projectedStep, cooking_methods: [projectedStep.cooking_method] }] }, pantry_candidates: [] }, error: null }) };
    const result = await readSnapshotWeightPrediction({ client: reader, weightClient: { from: () => null }, ownerId: owner, sessionId, methodClient: methods, authorityArgs: { p_owner_uuid: owner } });
    expect(result?.prediction.totalGrams).toBe(300);
    expect(result?.prediction.input?.rows[0].quantityOrigin).toBe("planned");
    expect(result?.prediction.input?.rows[0].rowKey).toBe("fixed-row");
    expect(summarizeWeightPrediction(result!).assumption_codes).toHaveLength(3);
    expect(methods.rpc).toHaveBeenCalledExactlyOnceWith("read_snapshot_v2_cook_mode", { p_owner_uuid: owner, p_session_id: sessionId });
    expect(loaders.load.mock.calls[0][1]).toEqual([ingredient]);
    expect(JSON.stringify(result)).not.toContain('"instruction"');
  });
  it("requires owner, exact recipe/snapshot, status and a single valid joined pin before hydration", async () => {
    for (const data of [{ ...source(), user_id: ingredient }, { ...source(), recipe_content_snapshot_id: ingredient }, { ...source(), recipe_id: pin },
      { ...source(), status: "cancelled" }, { ...source(), recipe_content_snapshots: [source().recipe_content_snapshots, source().recipe_content_snapshots] },
      { ...source(), recipe_content_snapshots: { ...source().recipe_content_snapshots, owner_user_id: ingredient } }]) {
      expect(await readSnapshotWeightPrediction({ client: client(data), weightClient: { from: () => null }, ownerId: owner, sessionId })).toBeNull();
    }
    expect(loaders.load).not.toHaveBeenCalled();
  });
  it("keeps completed receipt preparation independent of today's converter/method access", async () => {
    const methods = { rpc: vi.fn() }; const reader = client({ ...source(), status: "completed" });
    const result = await readSnapshotWeightPrediction({ client: reader, weightClient: { from: () => null }, ownerId: owner, sessionId, methodClient: methods, authorityArgs: { p_owner_uuid: owner } });
    expect(result).not.toBeNull(); expect(loaders.load).not.toHaveBeenCalled(); expect(methods.rpc).not.toHaveBeenCalled(); expect(reader.rpc).not.toHaveBeenCalled();
  });
  it("treats a missing method or conversion as unknown and propagates actual session read errors", async () => {
    const reader = client(source());
    const result = await readSnapshotWeightPrediction({ client: reader, weightClient: null, ownerId: owner, sessionId });
    expect(result?.prediction.totalGrams).toBeNull();
    const failure = new Error("READ_FAILED");
    await expect(readSnapshotWeightPrediction({ client: client(null, failure), weightClient: null, ownerId: owner, sessionId })).rejects.toBe(failure);
  });
});
