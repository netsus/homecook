import { describe, expect, it } from "vitest";

import {
  buildDemoPantryBundleItemRows,
  buildDemoPantryItemRows,
  DEMO_PANTRY_BUNDLES,
  DEMO_PANTRY_INGREDIENTS,
  DEMO_PANTRY_INGREDIENT_IDS,
} from "../scripts/lib/local-demo-pantry-fixture.mjs";

describe("local demo pantry fixture", () => {
  it("seeds pantry ingredients that match the demo recipe", () => {
    expect(DEMO_PANTRY_INGREDIENT_IDS).toEqual([
      "550e8400-e29b-41d4-a716-446655440013",
      "550e8400-e29b-41d4-a716-446655440014",
      "550e8400-e29b-41d4-a716-446655440010",
      "550e8400-e29b-41d4-a716-446655440011",
    ]);

    expect(buildDemoPantryItemRows("user-1")).toEqual([
      expect.objectContaining({
        id: "660e8400-e29b-41d4-a716-446655440401",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440013",
        user_id: "user-1",
      }),
      expect.objectContaining({
        id: "660e8400-e29b-41d4-a716-446655440402",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440014",
        user_id: "user-1",
      }),
      expect.objectContaining({
        id: "660e8400-e29b-41d4-a716-446655440403",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440010",
        user_id: "user-1",
      }),
      expect.objectContaining({
        id: "660e8400-e29b-41d4-a716-446655440404",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440011",
        user_id: "user-1",
      }),
    ]);
  });

  it("seeds bundle baseline rows for the pantry bundle picker", () => {
    expect(DEMO_PANTRY_INGREDIENTS.map((ingredient) => ingredient.standard_name)).toEqual([
      "양파",
      "대파",
      "소고기",
      "김치",
      "돼지고기",
      "소금",
    ]);
    expect(DEMO_PANTRY_BUNDLES).toEqual([
      {
        id: "660e8400-e29b-41d4-a716-446655440501",
        name: "조미료 모음",
        display_order: 1,
      },
      {
        id: "660e8400-e29b-41d4-a716-446655440502",
        name: "김치찌개 모음",
        display_order: 2,
      },
    ]);
    expect(buildDemoPantryBundleItemRows()).toEqual([
      expect.objectContaining({
        bundle_id: "660e8400-e29b-41d4-a716-446655440501",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440015",
      }),
      expect.objectContaining({
        bundle_id: "660e8400-e29b-41d4-a716-446655440502",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440013",
      }),
      expect.objectContaining({
        bundle_id: "660e8400-e29b-41d4-a716-446655440502",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440014",
      }),
      expect.objectContaining({
        bundle_id: "660e8400-e29b-41d4-a716-446655440502",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440010",
      }),
      expect.objectContaining({
        bundle_id: "660e8400-e29b-41d4-a716-446655440502",
        ingredient_id: "550e8400-e29b-41d4-a716-446655440011",
      }),
    ]);
  });
});
