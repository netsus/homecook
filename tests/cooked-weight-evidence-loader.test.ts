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
  it("falls back for known mass with missing method context and propagates actual session read errors", async () => {
    const reader = client(source());
    const result = await readSnapshotWeightPrediction({ client: reader, weightClient: null, ownerId: owner, sessionId });
    expect(result?.prediction.totalGrams).toBe(225);
    expect(result?.prediction.modelVersion).toBe("ingredient-mass-75-v1");
    const failure = new Error("READ_FAILED");
    await expect(readSnapshotWeightPrediction({ client: client(null, failure), weightClient: null, ownerId: owner, sessionId })).rejects.toBe(failure);
  });
  it("keeps a nullable .125 product row, original step and saved-version mass proof through the actual hydrator", async () => {
    const product = "550e8400-e29b-41d4-a716-446655440006";
    const version = "550e8400-e29b-41d4-a716-446655440007";
    const rowKey = "550e8400-e29b-41d4-a716-446655440008";
    const raw = { ingredient_id: null, source_kind: "food_product", row_key: rowKey, food_product_id: product,
      food_product_nutrition_version_id: version, amount: .125, unit: "package", scalable: false, ingredient_type: "QUANT" };
    const original = { ...step, instruction: "0.125팩을 섞는다. 원문 그대로", ingredients_used: [{ row_key: rowKey, ingredient_id: null, amount: .125, unit: "package" }] };
    const value = { ...source(), cooking_servings: 4, recipe_content_snapshots: { ...source().recipe_content_snapshots, ingredients_json: [raw], steps_json: [original] } };
    const before = JSON.stringify(value);
    const reader = client(value);
    reader.rpc.mockResolvedValue({ data: [{ id: rowKey, product_predecessor: { nutrition: null,
      basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "g" } }] } }], error: null });
    const result = await readSnapshotWeightPrediction({ client: reader, weightClient: null, ownerId: owner, sessionId,
      cookingSteps: [{ ...projectedStep, instruction: original.instruction }] });
    expect(result?.prediction.totalGrams).toBe(25);
    expect(result?.rawRows).toEqual([{ rowKey, amount: .125, unit: "package", scalable: false }]);
    expect(result?.prediction.input?.rows[0]).toMatchObject({ rowKey, sourceKind: "food_product", sourceId: product, sourceVersion: version,
      amount: .125, grams: 25, gramsEvidence: { evidenceId: version, version } });
    expect(reader.rpc).toHaveBeenCalledExactlyOnceWith("read_recipe_product_nutrition_predecessors", { p_owner_uuid: owner,
      p_ingredients: [{ id: rowKey, ingredient_id: null, food_product_id: product, food_product_nutrition_version_id: version }] });
    expect(JSON.stringify(value)).toBe(before);
    expect(loaders.load).not.toHaveBeenCalled();
    reader.rpc.mockResolvedValue({ data: [{ id: rowKey, product_predecessor: null }], error: null });
    expect((await readSnapshotWeightPrediction({ client: reader, weightClient: null, ownerId: owner, sessionId,
      cookingSteps: [{ ...projectedStep, instruction: original.instruction }] }))?.prediction.totalGrams).toBeNull();
  });
  it("reattaches the frozen C04 conversion after the actual generic hydrator reconstructs the row", async () => {
    const real = await vi.importActual<typeof import("@/scripts/lib/recipe-nutrition-predecessor.mjs")>("@/scripts/lib/recipe-nutrition-predecessor.mjs");
    loaders.load.mockResolvedValue(new Map());
    loaders.hydrate.mockImplementationOnce(real.hydrateRecipeNutritionIngredients);
    const metadata = { schema_version: "quantity-v4", raw_value: "2", raw_unit: "개", numerator: "2", denominator: "1",
      normalized: { amount: 200, unit: "g" }, display_quantity: { amount: 200, unit: "g" }, quality: "estimated", reason: null,
      evidence_ids: ["550e8400-e29b-41d4-a716-446655440019"], source_versions: ["piece-v1"], batch_basis: null, context_sha256: "a".repeat(64) };
    const value = source();
    const row = { ...value.recipe_content_snapshots.ingredients_json[0], amount: 200, quantity_input: metadata };
    const input = { ...value, recipe_content_snapshots: { ...value.recipe_content_snapshots, ingredients_json: [row] } };
    const before = JSON.stringify(input);
    const result = await readSnapshotWeightPrediction({ client: client(input), weightClient: { from: () => null }, ownerId: owner, sessionId,
      cookingSteps: [projectedStep] });
    expect(result?.prediction.totalGrams).toBe(200);
    expect(result?.prediction.input?.rows[0]).toMatchObject({ amount: 2, unit: "개", quantityOrigin: "planned", grams: 200,
      gramsEvidence: { kind: "ingredient_conversion", version: "piece-v1", quality: "estimated" } });
    expect(result?.rawRows[0]).toMatchObject({ amount: 200, unit: "g" });
    expect(JSON.stringify(input)).toBe(before);
  });
  it("does not attach a frozen conversion to a different hydrated row or product version", async () => {
    for (const patch of [{ id: "other-row" }, { food_product_id: ingredient, food_product_nutrition_version_id: pin }]) {
      loaders.hydrate.mockImplementationOnce(rows => rows.map((row: Record<string, unknown>) => ({ ...row, ...patch })));
      expect(await readSnapshotWeightPrediction({ client: client(source()), weightClient: { from: () => null }, ownerId: owner, sessionId,
        cookingSteps: [projectedStep] })).toBeNull();
    }
  });
});


it.each([undefined, { schema_version: "quantity-v4", raw_value: "broken", context_sha256: "not-a-hash" }])(
  "keeps frozen prediction inputs and MIX method when optional raw metadata is invalid: %j", async quantity_input => {
    const value = source();
    const before = JSON.stringify(value);
    const metadataRow = { ...value.recipe_content_snapshots.ingredients_json[0], row_key: ingredient,
      standard_name: "재료", quantity_input };
    const methods = { rpc: vi.fn().mockResolvedValue({ data: { session_id: sessionId, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
      recipe: { id: ingredient, title: "요리", base_servings: 2, cooking_servings: 2, ingredients: [metadataRow],
        steps: [{ ...projectedStep, cooking_methods: [projectedStep.cooking_method] }] }, pantry_candidates: [] }, error: null }) };
    const result = await readSnapshotWeightPrediction({ client: client(value), weightClient: { from: () => null }, ownerId: owner, sessionId,
      methodClient: methods, authorityArgs: { p_owner_uuid: owner } });
    expect(result?.prediction.totalGrams).toBe(300);
    expect(result?.rawRows).toEqual([{ rowKey: "fixed-row", amount: 300, unit: "g", scalable: true }]);
    expect(result?.prediction.input?.rows[0]).toMatchObject({ amount: 300, grams: 300, quantityOrigin: "planned" });
    expect(JSON.stringify(value)).toBe(before);
  },
);

it("does not turn malformed frozen proof into a legacy mass input or lose structured methods", async () => {
  const value = source();
  const frozen = { ...value.recipe_content_snapshots.ingredients_json[0], quantity_input: { schema_version: "quantity-v4", raw_value: "broken" } };
  const input = { ...value, recipe_content_snapshots: { ...value.recipe_content_snapshots, ingredients_json: [frozen] } };
  const before = JSON.stringify(input);
  const methods = { rpc: vi.fn().mockResolvedValue({ data: { session_id: sessionId, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
    recipe: { id: ingredient, title: "요리", base_servings: 2, cooking_servings: 2,
      ingredients: [{ ...frozen, row_key: ingredient, standard_name: "재료" }],
      steps: [{ ...projectedStep, cooking_methods: [projectedStep.cooking_method] }] }, pantry_candidates: [] }, error: null }) };
  const direct = await readSnapshotWeightPrediction({ client: client(input), weightClient: null, ownerId: owner, sessionId, cookingSteps: [projectedStep] });
  const projected = await readSnapshotWeightPrediction({ client: client(input), weightClient: null, ownerId: owner, sessionId,
    methodClient: methods, authorityArgs: { p_owner_uuid: owner } });
  expect(projected).toEqual(direct);
  expect(projected?.prediction.totalGrams).toBeNull();
  expect(JSON.stringify(input)).toBe(before);
});
