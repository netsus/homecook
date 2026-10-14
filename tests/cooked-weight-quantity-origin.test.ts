import { describe, expect, it } from "vitest";
import { snapshotIngredients } from "@/lib/server/cooked-batch-weight-estimate";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import type { QuantityInputSnapshot } from "@/types/quantity-input";

const ingredient = "78000000-0000-4000-8000-000000000001";
const product = "78000000-0000-4000-8000-000000000003";
const version = "78000000-0000-4000-8000-000000000004";
const evidence = "78000000-0000-4000-8000-000000000005";
const snapshotId = "78000000-0000-4000-8000-000000000006";
function quantity(patch: Partial<QuantityInputSnapshot> = {}): QuantityInputSnapshot {
  return { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", numerator: "1", denominator: "3",
    normalized: { amount: 200 / 3, unit: "g" }, display_quantity: { amount: 200 / 3, unit: "g" },
    source_versions: [version], evidence_ids: [], quality: "direct", reason: null, batch_basis: null, ...patch };
}
function source(input: unknown = { ...quantity(), context_sha256: "a".repeat(64) }) {
  return { row_key: "78000000-0000-4000-8000-000000000020", ingredient_id: null,
    food_product_id: product, food_product_nutrition_version_id: version, source_kind: "food_product",
    amount: 200 / 3, unit: "g", ingredient_type: "QUANT", scalable: true, quantity_input: input };
}
function predict(row: Record<string, unknown>, cookingServings = 4) {
  const rows = snapshotIngredients([row]);
  expect(rows).not.toBeNull();
  const methods = [{ code: "MIX", label: "섞기", color_key: "green", category_code: null }];
  const step = { step_number: 1, instruction: "재료를 섞어요", heat_level: null, cooking_methods: methods };
  return predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings, ingredients: rows!, snapshotSteps: [step],
    cookingSteps: [{ ...step, cooking_method: methods[0], ingredients_used: [], duration_seconds: null, duration_text: null }] });
}
describe("C04 frozen quantity provenance in C01 prediction", () => {
  it("preserves the original package fraction, fixed pair and conversion version through the snapshot parser", () => {
    const raw = source(); const before = JSON.stringify(raw);
    expect(snapshotIngredients([raw])?.[0]).toHaveProperty("quantity_input", raw.quantity_input);
    const output = predict(raw);
    expect(output.prediction.totalGrams).toBeCloseTo(400 / 3);
    expect(output.prediction.input?.rows[0]).toMatchObject({ sourceKind: "food_product", sourceId: product, sourceVersion: version,
      amount: 2 / 3, unit: "package", grams: 400 / 3, quantityOrigin: "planned",
      gramsEvidence: { kind: "product_relation", status: "confirmed", evidenceId: version, version, quality: "exact" } });
    expect(output.rawRows[0]).toMatchObject({ amount: 200 / 3, unit: "g" });
    expect(output.prediction.learningEligible).toBe(false);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it.each(["direct", "estimated"] as const)("keeps ingredient piece conversion provenance and %s quality", quality => {
    const raw = { ...source(quantity({ raw_value: "1", raw_unit: "개", numerator: "1", denominator: "1", quality,
      normalized: { amount: 100, unit: "g" }, display_quantity: { amount: 100, unit: "g" }, source_versions: ["piece-v1"], evidence_ids: [evidence] })),
      ingredient_id: ingredient, food_product_id: null, food_product_nutrition_version_id: null, amount: 100 };
    expect(predict(raw).prediction.input?.rows[0]).toMatchObject({ sourceKind: "ingredient", sourceVersion: null,
      amount: 2, unit: "개", grams: 200, quantityOrigin: "planned",
      gramsEvidence: { kind: "ingredient_conversion", status: "confirmed", evidenceId: evidence, version: "piece-v1", quality: quality === "direct" ? "exact" : "estimated" } });
  });

  it("uses only the recorded density version for a frozen volume-to-mass conversion", () => {
    const raw = { ...source(quantity({ raw_value: "10", raw_unit: "ml", numerator: "10", denominator: "1",
      normalized: { amount: 12, unit: "g" }, display_quantity: { amount: 12, unit: "g" }, source_versions: ["density-v1"], evidence_ids: [evidence] })),
      ingredient_id: ingredient, food_product_id: null, food_product_nutrition_version_id: null, amount: 12 };
    const result = predict(raw).prediction.input?.rows[0];
    expect(result).toMatchObject({ amount: 20, unit: "ml", grams: 24,
      gramsEvidence: { kind: "ingredient_conversion", version: "density-v1", quality: "exact" }, quantityOrigin: "planned" });
  });

  it.each([
    quantity({ source_versions: [ingredient] }),
    quantity({ normalized: { amount: 99, unit: "g" } }),
    quantity({ normalized: null, quality: "unavailable", reason: "PRODUCT_PHYSICAL_BASIS_UNAVAILABLE" }),
    quantity({ numerator: "2" }),
    quantity({ raw_value: "1", numerator: "9".repeat(400), denominator: "9".repeat(400) }),
    quantity({ batch_basis: { batch_id: snapshotId, revision: 4, cooking_servings: 2, finished_weight_g: 200, weight_source: "measured" } }),
    { ...quantity(), context_sha256: "not-a-context-hash" },
    { ...quantity(), unexpected_claim: true },
    { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", normalized: { amount: 200 / 3, unit: "g" }, source_versions: [version] },
    null,
  ])("does not promote incomplete or mismatched metadata to confirmed direct mass: %j", input => {
    const output = predict(source(input));
    expect(output.prediction.totalGrams).toBeNull();
    expect(output.prediction.input?.rows[0].gramsEvidence?.status).not.toBe("confirmed");
    expect(output.prediction.input?.rows[0].quantityOrigin).toBe("planned");
  });

  it("does not borrow g from direct volume without a recorded density or from multiple ambiguous versions", () => {
    const volume = { ...source(quantity({ raw_value: "10", raw_unit: "ml", numerator: "10", denominator: "1",
      normalized: { amount: 10, unit: "ml" }, display_quantity: { amount: 10, unit: "ml" }, source_versions: [], evidence_ids: [] })),
      ingredient_id: ingredient, food_product_id: null, food_product_nutrition_version_id: null, amount: 10, unit: "ml" };
    expect(predict(volume).prediction.totalGrams).toBeNull();
    const converted = { ...source(quantity({ source_versions: ["piece-v1", "density-v2"], evidence_ids: [evidence] })),
      ingredient_id: ingredient, food_product_id: null, food_product_nutrition_version_id: null };
    expect(predict(converted).prediction.totalGrams).toBeNull();
  });

  it.each(["g", "kg", " G ", " KG "])("preserves legacy %s direct mass with no new metadata keys", unit => {
    const raw = { ...source(), ingredient_id: ingredient, food_product_id: null, food_product_nutrition_version_id: null,
      amount: unit.trim().toLowerCase() === "kg" ? .1 : 100, unit };
    Reflect.deleteProperty(raw, "quantity_input");
    expect(snapshotIngredients([raw])?.[0]).not.toHaveProperty("quantity_input");
    const output = predict(raw);
    expect(output.prediction.totalGrams).toBe(200);
    expect(output.prediction.input?.rows[0].gramsEvidence).toEqual({ kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" });
    expect(output.rawRows[0].unit).toBe(unit);
  });

  it("keeps explicit SI conversion as direct mass while preserving the original kg input", () => {
    const raw = { ...source(quantity({ raw_value: "0.1", raw_unit: "kg", numerator: "1", denominator: "10", normalized: { amount: 100, unit: "g" },
      display_quantity: { amount: 100, unit: "g" }, source_versions: [], evidence_ids: [] })), ingredient_id: ingredient,
      food_product_id: null, food_product_nutrition_version_id: null, amount: 100 };
    expect(predict(raw).prediction.input?.rows[0]).toMatchObject({ amount: .2, unit: "kg", grams: 200,
      gramsEvidence: { kind: "direct_mass", version: null }, quantityOrigin: "planned" });
  });
});
