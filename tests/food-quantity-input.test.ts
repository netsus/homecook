import { describe, expect, it } from "vitest";
import { convertIngredientInputAmount, ingredientInputDefaultUnit, ingredientInputUnits } from "@/lib/planner/food-quantity-input";
import type { IngredientQuantityOptions } from "@/types/quantity-input";

const milk: IngredientQuantityOptions = {
  policy_version: "ingredient-units-v4", profile_id: "milk-profile", preparation_state: "raw", default_unit: "mL",
  choices: [
    { unit: "mL", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "L", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null },
    { unit: "kg", normalized: { amount: 1_000, unit: "g" }, quality: "direct", reason: null },
  ],
};
describe("food input units are separate from nutrition normalization", () => {
  it("keeps verified milk mL default despite missing density", () => {
    expect(ingredientInputDefaultUnit(milk)).toBe("mL");
    expect(ingredientInputUnits(milk)).toContain("mL");
    expect(convertIngredientInputAmount(200, "mL", "L", milk)).toBe(0.2);
    expect(convertIngredientInputAmount(200, "mL", "g", milk)).toBeNull();
    expect(milk.choices[0].normalized).toBeNull();
  });
  it("preserves physical mass and requires explicit cross-family evidence", () => {
    expect(convertIngredientInputAmount(500, "g", "kg")).toBe(0.5);
    expect(convertIngredientInputAmount(0.5, "kg", "g")).toBe(500);
    expect(convertIngredientInputAmount(1, "통", "알", milk)).toBeNull();
    const evidenced = { ...milk, choices: milk.choices.map(choice => choice.unit === "mL"
      ? { ...choice, normalized: { amount: 1.03, unit: "g" as const }, quality: "estimated" as const, reason: null }
      : choice) };
    expect(convertIngredientInputAmount(200, "mL", "g", evidenced)).toBe(206);
    expect(convertIngredientInputAmount(206, "g", "mL", evidenced)).toBe(200);
  });
  it("never derives an identity or density from a food name", () => {
    expect(ingredientInputDefaultUnit()).toBe("g");
    expect(convertIngredientInputAmount(200, "ml", "g")).toBeNull();
    expect(convertIngredientInputAmount(0, "g", "kg")).toBeNull();
    expect(convertIngredientInputAmount(Infinity, "g", "kg")).toBeNull();
  });
});
