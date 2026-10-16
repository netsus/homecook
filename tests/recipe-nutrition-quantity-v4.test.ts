import { describe, expect, it } from "vitest";
import { createRecipeNutritionSnapshotPayload, mapRecipeNutritionSnapshot, validateRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import { reasons, calculation, stored } from "./fixtures/recipe-nutrition-quantity-v4";
import { buildPlannerNutritionWarningMessages } from "@/lib/planner/planner-nutrition-presentation";


describe("exact v4 quantity reasons in immutable nutrition snapshots", () => {
  it.each([...reasons, "UNIT_MEASUREMENT_ESTIMATE_USED"])("gives %s a specific Korean planner explanation", code => {
    const messages = buildPlannerNutritionWarningMessages([code]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toContain(code);
    expect(messages[0]).not.toBe("일부 계획 영양을 확인해 주세요.");
    expect(messages[0]).toMatch(/[가-힣]/);
  });
  it.each(reasons)("preserves actual producer reason %s through payload and stored projection", reason => {
    const result = calculation(reason);
    expect(result).toMatchObject({ calculation_status: "partial", reflected_ingredient_count: 1, target_ingredient_count: 2,
      warnings: [reason], missing_reasons: [`${reason}:unknown-row`] });
    expect(result.values.energy_kcal).toMatchObject({ amount: null, known_amount: 1000 / 7, status: "partial", display_mode: "minimum" });
    const payload = createRecipeNutritionSnapshotPayload(result);
    expect(payload).toMatchObject({ warnings: [reason], missing_reasons: [`${reason}:unknown-row`] });
    expect(mapRecipeNutritionSnapshot(stored(result))).toMatchObject({ warnings: [reason], values: result.values });
  });
  it.each([false, true])("classifies actual average measurement as estimated with known contribution=%s", withKnown => {
    const result = calculation("UNIT_MEASUREMENT_ESTIMATE_USED", withKnown);
    expect(result.calculation_quality).toBe(withKnown ? "mixed" : "estimated");
    expect(createRecipeNutritionSnapshotPayload(result).warnings).toEqual(["UNIT_MEASUREMENT_ESTIMATE_USED"]);
    expect(mapRecipeNutritionSnapshot(stored(result)).calculation_quality).toBe(result.calculation_quality);
    expect(() => validateRecipeNutritionSnapshot({ ...result, calculation_quality: "direct" })).toThrow();
  });
  it.each([...reasons, "UNIT_MEASUREMENT_ESTIMATE_USED"] as const)("requires the exact write version for %s", reason => {
    const result = calculation(reason);
    for (const version of ["recipe-nutrition-v3", "snapshot-projection-v1", "recipe-nutrition-v4-future"]) {
      expect(() => validateRecipeNutritionSnapshot({ ...result, calculation_version: version })).toThrow();
    }
  });
  it.each(["DENSITY_REQUIRED_EXTRA", "UNIT_UNKNOWN", "", "UNIT_MEASUREMENT_ESTIMATE_USED:row"])("rejects unrecognized warning %s on write and stored read", warning => {
    const result = calculation("DENSITY_REQUIRED");
    const invalid = { ...result, warnings: [warning] };
    expect(() => validateRecipeNutritionSnapshot(invalid)).toThrow();
    expect(() => mapRecipeNutritionSnapshot(stored(invalid))).toThrow();
  });
  it("does not permit an estimate warning as a missing reason or duplicate failure reasons", () => {
    const result = calculation("DENSITY_REQUIRED");
    for (const missing of [["UNIT_MEASUREMENT_ESTIMATE_USED:unknown-row"], ["DENSITY_REQUIRED:unknown-row", "DENSITY_REQUIRED:unknown-row"]]) {
      expect(() => validateRecipeNutritionSnapshot({ ...result, missing_reasons: missing })).toThrow();
    }
  });
});
