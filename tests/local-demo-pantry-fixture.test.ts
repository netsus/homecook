import { describe, expect, it } from "vitest";

import {
  buildDemoPantryItemRows,
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
});
