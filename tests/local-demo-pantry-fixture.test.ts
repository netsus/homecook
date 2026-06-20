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
    expect(DEMO_PANTRY_INGREDIENTS.map((ingredient) => ingredient.standard_name)).toContain(
      "고춧가루",
    );
    expect(DEMO_PANTRY_BUNDLES.map((bundle) => bundle.name)).toEqual([
      "기본 양념",
      "한식 장류",
      "자주 쓰는 채소",
      "국/찌개 기본",
      "면/떡/곡류",
      "냉장 단백질",
      "냉동/간편 재료",
      "베이킹/디저트 기본",
    ]);

    const ingredientIds = new Set(DEMO_PANTRY_INGREDIENTS.map((ingredient) => ingredient.id));
    const rowsByBundleId = new Map<string, ReturnType<typeof buildDemoPantryBundleItemRows>>();

    for (const row of buildDemoPantryBundleItemRows()) {
      expect(ingredientIds.has(row.ingredient_id)).toBe(true);
      rowsByBundleId.set(row.bundle_id, [...(rowsByBundleId.get(row.bundle_id) ?? []), row]);
    }

    for (const bundle of DEMO_PANTRY_BUNDLES) {
      const rows = rowsByBundleId.get(bundle.id) ?? [];
      expect(rows.length).toBeGreaterThanOrEqual(5);
      expect(rows.length).toBeLessThanOrEqual(12);
    }
  });
});
