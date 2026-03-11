import { describe, expect, it } from "vitest";

import { formatScaledIngredient } from "@/lib/recipe";

describe("formatScaledIngredient", () => {
  it("scales quant ingredients by servings", () => {
    expect(
      formatScaledIngredient(
        {
          id: "1",
          ingredient_id: "i1",
          standard_name: "김치",
          amount: 200,
          unit: "g",
          ingredient_type: "QUANT",
          display_text: "김치 200g",
          scalable: true,
          sort_order: 1,
        },
        2,
        3,
      ),
    ).toBe("김치 300g");
  });

  it("keeps to-taste text as-is", () => {
    expect(
      formatScaledIngredient(
        {
          id: "2",
          ingredient_id: "i2",
          standard_name: "소금",
          amount: null,
          unit: null,
          ingredient_type: "TO_TASTE",
          display_text: "소금 약간",
          scalable: false,
          sort_order: 2,
        },
        2,
        4,
      ),
    ).toBe("소금 약간");
  });
});
