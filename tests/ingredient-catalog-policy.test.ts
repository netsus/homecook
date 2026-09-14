import { describe, expect, it } from "vitest";

import {
  INACTIVE_INGREDIENT_IDS,
  INACTIVE_INGREDIENT_NAMES,
  isSelectableIngredientId,
  isSelectableIngredientName,
  normalizeIngredientCatalogName,
} from "@/lib/ingredient-catalog-policy";

describe("ingredient catalog policy", () => {
  it("hides the 26 user-removed RDA variants while keeping base ingredients selectable", () => {
    expect(INACTIVE_INGREDIENT_IDS).toHaveLength(26);
    expect(isSelectableIngredientId("b530cbdf-7d78-4dca-b43e-7b43a9114084")).toBe(false);
    expect(isSelectableIngredientId("47528b57-dc5b-4391-878a-1ded89521a60")).toBe(false);
    expect(isSelectableIngredientId("550e8400-e29b-41d4-a716-446655440014")).toBe(true);
    expect(isSelectableIngredientId("46b7df4c-e85d-53b3-bd12-fb4ffff049c3")).toBe(true);
    expect(INACTIVE_INGREDIENT_NAMES).toHaveLength(26);
    expect(isSelectableIngredientName("생 돼지고기 갈비")).toBe(false);
    expect(isSelectableIngredientName("돼지고기 갈비")).toBe(true);
  });

  it.each([
    ["갯기름나물 (데친것)", "데친 갯기름나물"],
    ["파프리카 · 빨간색 (생것)", "빨간 파프리카"],
    ["돼지고기 · 갈비 (구운것(팬))", "팬에 구운 돼지고기 갈비"],
    ["당근 · 뿌리 (삶은것)", "삶은 당근 뿌리"],
    ["갯기름나물 · 노지 · 어린잎 (생것)", "노지 어린잎 갯기름나물"],
    ["갯기름나물 · 하우스 (데친것)", "데친 하우스 갯기름나물"],
    ["양파", "양파"],
  ])("normalizes %s to the natural catalog name %s", (input, expected) => {
    expect(normalizeIngredientCatalogName(input)).toBe(expected);
  });
});
