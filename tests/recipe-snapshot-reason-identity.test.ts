import { describe, expect, it } from "vitest";
import { mapRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import { calculation, reasons, stored } from "./fixtures/recipe-nutrition-quantity-v4";

describe("personal semantic reason identity reader compatibility", () => {
  it.each([...reasons, "UNIT_MEASUREMENT_ESTIMATE_USED"] as const)("reads exact v5 %s without reinterpreting v4 numbers", reason => {
    const original = calculation(reason);
    const next = { ...original, calculation_version: "recipe-nutrition-v5" };
    expect(mapRecipeNutritionSnapshot(stored(next))).toEqual(mapRecipeNutritionSnapshot(stored(original)));
    expect(original.calculation_version).toBe("recipe-nutrition-v4");
    expect(next.values).toBe(original.values);
  });
});
