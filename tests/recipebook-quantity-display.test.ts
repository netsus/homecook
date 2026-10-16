import { describe, expect, it } from "vitest";
import { formatScaledIngredient } from "@/lib/recipe";
import type { RecipeIngredient } from "@/types/recipe";

function ingredient(raw: string, unit: string): RecipeIngredient {
  const [numerator, denominator = "1"] = raw.split("/");
  return { id: "row", ingredient_id: "milk", standard_name: "재료", amount: Number(numerator) / Number(denominator),
    unit, ingredient_type: "QUANT", display_text: null, scalable: true, sort_order: 1,
    quantity_input: { schema_version: "quantity-v4", raw_value: raw, raw_unit: unit, numerator, denominator,
      normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED", evidence_ids: [], source_versions: [], batch_basis: null } };
}

describe("recipebook quantity presentation", () => {
  it.each([["1/3", "L"], ["1/7", "kg"], ["1/10000", "L"]])("preserves original %s %s at base servings without changing its data", (raw, unit) => {
    const row = ingredient(raw, unit); const before = structuredClone(row);
    expect(formatScaledIngredient(row, 2, 2)).toBe(`재료 ${raw}${unit}`);
    expect(row).toEqual(before);
  });
  it("uses display precision only when scaled or converted and retains raw input", () => {
    const row = ingredient("1/7", "kg");
    expect(formatScaledIngredient(row, 2, 3)).toBe("재료 0.214kg");
    const converted = { ...ingredient("1/3", "L"), amount: 1000 / 3, unit: "ml" };
    expect(formatScaledIngredient(converted, 2, 2)).toBe("재료 333.333mL");
    expect(converted.quantity_input?.raw_value).toBe("1/3");
    expect(formatScaledIngredient({ ...row, scalable: false }, 2, 3)).toBe("재료 1/7kg");
  });
  it("preserves product version, original package and to-taste/legacy behavior", () => {
    const product = { ...ingredient("1/3", "package"), food_product_id: "product", food_product_nutrition_version_id: "version" };
    expect(formatScaledIngredient(product, 2, 2)).toBe("재료 1/3팩");
    expect(formatScaledIngredient(product, 2, 3)).toBe("재료 0.5팩");
    expect(product.food_product_nutrition_version_id).toBe("version");
    expect(formatScaledIngredient({ ...product, ingredient_type: "TO_TASTE", display_text: "약간" }, 2, 3)).toBe("약간");
    expect(formatScaledIngredient({ ...ingredient("1", "g"), quantity_input: undefined, amount: 100 }, 2, 3)).toBe("재료 150g");
  });
});
