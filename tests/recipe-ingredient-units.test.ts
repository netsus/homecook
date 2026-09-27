import { describe, expect, it } from "vitest";
import { getRecipeIngredientUnitOptions, isRecipeIngredientUnitAllowed } from "@/lib/recipe-ingredient-units";

describe("recipe ingredient unit choices", () => {
  it("offers existing nutrition unit families and preserves original legacy text", () => {
    expect(getRecipeIngredientUnitOptions({ unit: "줌" })).toEqual([
      "g", "ml", "kg", "l", "개", "장", "대", "모", "큰술", "작은술", "컵", "줌",
    ]);
    expect(getRecipeIngredientUnitOptions({ unit: "g" }).filter((unit) => unit === "g")).toHaveLength(1);
    expect(getRecipeIngredientUnitOptions({ unit: null })).not.toContain("");
  });

  it("never adds a different or invented product basis unit", () => {
    expect(getRecipeIngredientUnitOptions({ unit: "ml", food_product_id: "product" })).toEqual(["ml"]);
    expect(getRecipeIngredientUnitOptions({ unit: null, food_product_id: "product" })).toEqual([]);
  });

  it("accepts supported units but allows legacy text only from a trusted source row", () => {
    for (const unit of ["g", "ml", "kg", "l", "개", "장", "대", "모", "tbsp", "tsp", "큰술", "작은술", "컵", "스푼"]) {
      expect(isRecipeIngredientUnitAllowed(unit)).toBe(true);
    }
    expect(isRecipeIngredientUnitAllowed("임의단위")).toBe(false);
    expect(isRecipeIngredientUnitAllowed("줌", ["줌"])).toBe(true);
    expect(isRecipeIngredientUnitAllowed("줌", ["g"])).toBe(false);
    for (const unit of [null, undefined, 5, "", " "]) expect(isRecipeIngredientUnitAllowed(unit)).toBe(false);
  });
});
