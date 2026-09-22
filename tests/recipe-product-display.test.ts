import { describe, expect, it, vi } from "vitest";

import { normalizeRecipeIngredients } from "@/lib/recipe-detail";
import { formatScaledIngredient } from "@/lib/recipe";
import { toCookingModeIngredient } from "@/lib/server/cooking";
import { readRecipeProductLabels } from "@/lib/server/recipe-product-labels";

const ingredient = {
  id: "row-1", ingredient_id: "milk", amount: 100, unit: "g",
  ingredient_type: "QUANT" as const, display_text: "브랜드 · 우유 100g 100g",
  scalable: true, sort_order: 0, ingredients: { standard_name: "우유" },
  food_product_id: "product-1", food_product_nutrition_version_id: "version-1",
};

describe("recipe product identity display", () => {
  it("rereads brand names with the request client and appends the scaled amount only once", async () => {
    const inIds = vi.fn(async () => ({
      data: [{ id: "product-1", name: "우유 100g", brand: "브랜드" }], error: null,
    }));
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ in: inIds })) })) };
    const rows = await readRecipeProductLabels(client, [ingredient]);
    const [normalized] = normalizeRecipeIngredients(rows);
    expect(inIds).toHaveBeenCalledWith("id", ["product-1"]);
    expect(normalized).toMatchObject({
      standard_name: "브랜드 · 우유 100g", food_product_id: "product-1",
      food_product_nutrition_version_id: "version-1",
    });
    expect(formatScaledIngredient(normalized!, 2, 3)).toBe("브랜드 · 우유 100g 150g");
    expect(toCookingModeIngredient({ row: rows[0]!, baseServings: 2, cookingServings: 3 }))
      .toMatchObject({ standard_name: "브랜드 · 우유 100g", display_text: "브랜드 · 우유 100g 150g", amount: 150 });
  });

  it("uses the pinned product name in a cooking snapshot without a live catalog lookup", () => {
    expect(toCookingModeIngredient({
      row: { ...ingredient, food_product_name: "원래 우유", food_product_brand: "원래 브랜드" },
      baseServings: 2, cookingServings: 4,
    })).toMatchObject({ standard_name: "원래 브랜드 · 원래 우유", display_text: "원래 브랜드 · 원래 우유 200g" });
  });

  it("never substitutes an inaccessible product from another authority", async () => {
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({
      in: vi.fn(async () => ({ data: [], error: null })),
    })) })) };
    const [normalized] = normalizeRecipeIngredients(await readRecipeProductLabels(client, [ingredient]));
    expect(normalized?.standard_name).toBe("우유");
    expect(normalized?.food_product_id).toBe("product-1");
  });

  it("does not hide a product lookup failure or add lookups for generic ingredients", async () => {
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({
      in: vi.fn(async () => ({ data: null, error: new Error("offline") })),
    })) })) };
    await expect(readRecipeProductLabels(client, [ingredient])).rejects.toThrow("RECIPE_PRODUCT_LABEL_READ_FAILED");
    client.from.mockClear();
    await expect(readRecipeProductLabels(client, [{ food_product_id: null }])).resolves.toEqual([{ food_product_id: null }]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
