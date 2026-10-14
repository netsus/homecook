import { describe, expect, it } from "vitest";
import fixtureData from "@/qa/fixtures/slices-01-05.json";
import { estimateCookedWeight } from "@/lib/server/cooked-batch-weight-estimate";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import type { RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { CookingModeStep } from "@/types/cooking";

const snapshotId = "550e8400-e29b-41d4-a716-446655440001";
const methodId = "550e8400-e29b-41d4-a716-446655440002";
const ingredientId = "550e8400-e29b-41d4-a716-446655440003";
function ingredient(patch: Partial<RecipeNutritionIngredientInput> = {}): RecipeNutritionIngredientInput {
  return { id: "row-1", ingredient_id: ingredientId, amount: 100, unit: "g", scalable: true, ingredient_type: "QUANT", preparation_state: null, ...patch };
}
function step(code = "MIX", instruction = "재료를 섞는다", heat: string | null = null) {
  const raw = { step_number: 1, instruction, cooking_method_id: methodId, heat_level: heat };
  const projected: CookingModeStep = { step_number: 1, instruction, cooking_method: { code, label: code, color_key: "neutral" },
    ingredients_used: [], heat_level: heat, duration_seconds: null, duration_text: null };
  return { raw, projected };
}
function mapped(rows = [ingredient()], context = step()) {
  return predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings: 4, ingredients: rows,
    snapshotSteps: [context.raw], cookingSteps: [context.projected] });
}

describe("existing snapshot weight mapping", () => {
  it("scales once and computes only structured nonheated MIX with explicit assumptions", () => {
    const result = mapped([ingredient(), ingredient({ id: "row-2", amount: 25, scalable: false })]);
    expect(result.prediction.totalGrams).toBe(225);
    expect(result.prediction.input?.rows.map(row => row.quantityOrigin)).toEqual(["planned", "planned"]);
    expect(result.prediction.assumptions).toEqual(["mix_tags_imply_no_heat", "all_declared_inputs_retained", "unreported_drainage_leftovers_container_added_media_unknown"]);
    expect(result.rawRows.map(row => row.amount)).toEqual([100, 25]);
    expect(result.methodSteps[0].status).toBe("inferred");
    expect(result.prediction.learningEligible).toBe(false);
    expect(Object.isFrozen(result.prediction.assumptions)).toBe(true);
  });
  it.each(["G", " g ", "kg", " KG "])("preserves raw unit %s while using canonical direct-mass proof", unit => {
    const amount = unit.trim().toLowerCase() === "kg" ? 0.1 : 100;
    const result = mapped([ingredient({ amount, unit })]);
    expect(result.prediction.totalGrams).toBe(200);
    expect(result.rawRows[0].unit).toBe(unit);
    expect(result.prediction.input?.rows[0].gramsEvidence?.kind).toBe("direct_mass");
  });
  it.each([
    ["BOIL", "국을 끓인다"], ["STIR_FRY", "볶는다"], ["BOIL", "쌀을 익힌다"], ["REHEAT", "이미 익힌 음식을 데운다"],
  ])("keeps %s unknown without a matching licensed yield/closed-boundary fact", (code, instruction) => {
    const result = mapped([ingredient()], step(code, instruction));
    expect(result.prediction.totalGrams).toBeNull();
    expect(result.prediction.input?.segments[0].method.status).toBe("inferred");
    expect(result.prediction.assumptions).toEqual([]);
  });
  it.each(["재료를 가열하며 섞는다", "물기를 짜 내고 섞는다", "물을 더 추가해 섞는다"])("uses conflicting text only as a negative veto: %s", instruction => {
    const result = mapped([ingredient()], step("MIX", instruction));
    expect(result.prediction.totalGrams).toBeNull();
    expect(result.methodSteps[0].conflicts.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain(instruction);
  });
  it("does not interpret absent, empty, untagged, unmatched or heated steps as no heat", () => {
    const context = step();
    const missing = predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings: 4, ingredients: [ingredient()] });
    expect(missing.prediction.totalGrams).toBeNull();
    for (const raw of [{ ...context.raw, instruction: "" }, { ...context.raw, cooking_method_id: null },
      { ...context.raw, step_number: 2 }, { ...context.raw, heat_level: undefined }]) {
      expect(predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings: 4, ingredients: [ingredient()], snapshotSteps: [raw], cookingSteps: [context.projected] }).prediction.totalGrams).toBeNull();
    }
    expect(mapped([ingredient()], step("MIX", "섞는다", "low")).prediction.totalGrams).toBeNull();
  });
  it("preserves an existing primary method when the additive plural list is empty, but rejects malformed plural IDs", () => {
    const context = step();
    const run = (ids: unknown) => predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings: 4, ingredients: [ingredient()],
      snapshotSteps: [{ ...context.raw, cooking_method_ids: ids }], cookingSteps: [context.projected] });
    expect(run([]).prediction.totalGrams).toBe(200);
    expect(run([null]).prediction.totalGrams).toBeNull();
    expect(run("invalid").prediction.totalGrams).toBeNull();
  });
  it("accepts only identical ordered frozen method projections without inventing method IDs", () => {
    const context = step();
    const methods = [{ code: "MIX", label: "섞기", color_key: "green", category_code: null }];
    const raw = { step_number: 1, instruction: "원문 125g을 섞는다", heat_level: null, cooking_methods: methods };
    const projected = { ...context.projected, instruction: raw.instruction, cooking_methods: methods };
    const run = (source: unknown[] = [raw], current: CookingModeStep[] = [projected]) => predictSnapshotWeight({
      snapshotId, baseServings: 2, cookingServings: 4, ingredients: [ingredient()], snapshotSteps: source, cookingSteps: current });
    const before = JSON.stringify(raw);
    const result = run();
    expect(result.prediction.totalGrams).toBe(200);
    expect(result.methodSteps[0].methodIds).toEqual([]);
    expect(result.methodSteps[0].status).toBe("inferred");
    expect(result.methodSteps[0].evidenceRef).toBe(`snapshot:${snapshotId}:step:1:frozen-methods:${JSON.stringify([["MIX", "섞기", "green", null]])}`);
    expect(run()).toEqual(result);
    expect(JSON.stringify(raw)).toBe(before);
    for (const source of [{ ...raw, cooking_methods: [] }, { ...raw, cooking_methods: undefined },
      { ...raw, cooking_method_id: "invalid" }, { ...raw, cooking_method_ids: [null] },
      { ...raw, heat_level: "low" }, { ...raw, instruction: "가열하며 섞는다" }]) expect(run([source]).prediction.totalGrams).toBeNull();
    for (const changed of [{ code: "BOIL", label: "섞기", color_key: "green", category_code: null },
      { ...methods[0], label: "다른 표기" }, { ...methods[0], color_key: "orange" }])
      expect(run([raw], [{ ...projected, cooking_methods: [changed] }]).prediction.totalGrams).toBeNull();
    const second = { code: "MIX", label: "혼합", color_key: "orange", category_code: null };
    expect(run([{ ...raw, cooking_methods: [...methods, second] }], [{ ...projected, cooking_methods: [second, ...methods] }]).prediction.totalGrams).toBeNull();
    expect(run([raw, { ...raw, step_number: 2 }], [{ ...projected, step_number: 2 }, projected]).prediction.totalGrams).toBeNull();
  });
  it("does not return a partial total for unknown units or to-taste rows", () => {
    for (const second of [ingredient({ id: "row-2", amount: null, unit: null, ingredient_type: "TO_TASTE" }), ingredient({ id: "row-2", unit: "cup" })]) {
      expect(mapped([ingredient(), second]).prediction.totalGrams).toBeNull();
    }
  });
  it("compares representative existing field shapes with the old coefficient without claiming accuracy", () => {
    const cases = [
      { name: "soup", rows: [ingredient(), ingredient({ id: "water", amount: 300 })], context: step("BOIL", "국을 끓인다"), old: 600, next: null },
      { name: "stir-fry", rows: [ingredient(), ingredient({ id: "oil", amount: 10 })], context: step("STIR_FRY", "볶는다"), old: 165, next: null },
      { name: "rice", rows: [ingredient(), ingredient({ id: "water", amount: 300 })], context: step("BOIL", "쌀을 익힌다"), old: 600, next: null },
      { name: "already-cooked", rows: [ingredient({ preparation_state: "cooked" })], context: step("REHEAT", "데운다"), old: 150, next: null },
      { name: "product-mix", rows: [ingredient({ food_product_id: "550e8400-e29b-41d4-a716-446655440004", food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440005" })], context: step(), old: 150, next: 200 },
      { name: "mix", rows: [ingredient(), ingredient({ id: "row-2", amount: 25, scalable: false })], context: step(), old: 168.75, next: 225 },
      { name: "to-taste", rows: [ingredient(), ingredient({ id: "row-2", amount: null, unit: null, ingredient_type: "TO_TASTE" })], context: step(), old: 150, next: null },
    ];
    for (const fixture of cases) {
      expect(estimateCookedWeight(fixture.rows, 2, 4), fixture.name).toBe(fixture.old);
      expect(mapped(fixture.rows, fixture.context).prediction.totalGrams, fixture.name).toBe(fixture.next);
    }
    expect(cases.filter(fixture => fixture.next !== null)).toHaveLength(2);
    expect(cases.filter(fixture => fixture.old !== null)).toHaveLength(7);
  });
  it("leaves the existing Kimchi-stew QA fixture unknown with its unresolved piece and to-taste rows", () => {
    const rows: RecipeNutritionIngredientInput[] = fixtureData.recipe.ingredients.map(row => ({ id: row.id, ingredient_id: row.ingredientId,
      amount: row.amount, unit: row.unit, scalable: row.scalable, ingredient_type: row.ingredientType === "TO_TASTE" ? "TO_TASTE" : "QUANT", preparation_state: null }));
    const raw = fixtureData.recipe.steps.map(row => ({ step_number: row.stepNumber, cooking_method_id: row.cookingMethodId, instruction: row.instruction, heat_level: row.heatLevel }));
    const projected: CookingModeStep[] = fixtureData.recipe.steps.map(row => {
      const method = fixtureData.cookingMethods.find(item => item.id === row.cookingMethodId)!;
      return { step_number: row.stepNumber, instruction: row.instruction, cooking_method: { code: method.code, label: method.label, color_key: method.colorKey },
        ingredients_used: row.ingredientsUsed, heat_level: row.heatLevel, duration_seconds: row.durationSeconds, duration_text: row.durationText };
    });
    const result = predictSnapshotWeight({ snapshotId, baseServings: 2, cookingServings: 4, ingredients: rows, snapshotSteps: raw, cookingSteps: projected });
    expect(result.prediction.totalGrams).toBeNull();
    expect(result.prediction.reasons.some(reason => reason.code === "quantity_conversion_missing")).toBe(true);
    expect(result.prediction.reasons.some(reason => reason.code === "unquantified_ingredient")).toBe(true);
    expect(estimateCookedWeight(rows, 2, 4)).toBeNull();
  });
  it("uses an exact pinned product mass basis without borrowing ingredient conversions", () => {
    const product = ingredient({ ingredient_id: null, food_product_id: "550e8400-e29b-41d4-a716-446655440004", food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440005" });
    expect(mapped([product]).prediction.totalGrams).toBe(200);
    expect(mapped([product]).prediction.input?.rows[0].sourceVersion).toBe(product.food_product_nutrition_version_id);
    expect(mapped([{ ...product, unit: "mL" }]).prediction.totalGrams).toBeNull();
  });
  it("uses the measurement evidence ID, never its dataset source ID", () => {
    const evidenceId = "550e8400-e29b-41d4-a716-446655440006";
    const sourceId = "550e8400-e29b-41d4-a716-446655440007";
    const conversion = {
      id: "550e8400-e29b-41d4-a716-446655440008", ingredient_id: ingredientId,
      preparation_state: "raw", review_status: "approved", is_active: true,
      profile: { code: "fixture", basis_volume_ml: 15, representative_weight_g: 12, is_active: true },
      evidence: {
        id: evidenceId, normalized_g_per_15ml: 12, review_status: "approved", is_active: true,
        source: { id: sourceId, review_status: "approved", freshness_status: "current", is_active: true,
          provider: "synthetic", dataset: "fixture", source_version: "fixture-v1", data_basis_date: null,
          license: "fixture", source_url: "https://example.invalid/fixture" },
      },
    };
    const row = ingredient({ amount: 15, unit: "ml", preparation_state: "raw", conversion_assignment: conversion });
    const result = mapped([row]);
    expect(result.prediction.totalGrams).toBe(24);
    expect(result.prediction.input?.rows[0].gramsEvidence).toEqual({ kind: "ingredient_conversion", status: "confirmed",
      evidenceId, version: "fixture-v1", quality: "estimated" });
    for (const id of [undefined, "not-an-evidence-id"]) {
      const unresolved = mapped([{ ...row, conversion_assignment: { ...conversion, evidence: { ...conversion.evidence, id } } }]);
      expect(unresolved.prediction.totalGrams).toBeNull();
      expect(unresolved.prediction.input?.rows[0].gramsEvidence).toBeNull();
      expect(unresolved.rawRows[0]).toEqual(result.rawRows[0]);
    }
  });
});
