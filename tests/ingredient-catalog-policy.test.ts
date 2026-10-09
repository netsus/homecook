import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INACTIVE_INGREDIENT_IDS,
  INACTIVE_INGREDIENT_NAMES,
  isSelectableIngredientId,
  isSelectableIngredientName,
  normalizeIngredientCatalogName,
} from "@/lib/ingredient-catalog-policy";

describe("ingredient catalog policy", () => {
  it("hides the remaining 25 user-removed RDA variants while keeping base ingredients selectable", () => {
    expect(INACTIVE_INGREDIENT_IDS).toHaveLength(25);
    expect(new Set(INACTIVE_INGREDIENT_IDS).size).toBe(25);
    expect(isSelectableIngredientId("b530cbdf-7d78-4dca-b43e-7b43a9114084")).toBe(false);
    expect(isSelectableIngredientId("47528b57-dc5b-4391-878a-1ded89521a60")).toBe(false);
    expect(isSelectableIngredientId("550e8400-e29b-41d4-a716-446655440014")).toBe(true);
    expect(isSelectableIngredientId("46b7df4c-e85d-53b3-bd12-fb4ffff049c3")).toBe(true);
    expect(INACTIVE_INGREDIENT_NAMES).toHaveLength(25);
    expect(new Set(INACTIVE_INGREDIENT_NAMES).size).toBe(25);
    expect(isSelectableIngredientName("생 돼지고기 갈비")).toBe(false);
    expect(isSelectableIngredientName("돼지고기 갈비")).toBe(true);
  });

  it("restores only the reviewed raw pork shoulder cut while retaining cooked variants", () => {
    expect(isSelectableIngredientId("cdf20482-adc3-48dc-a48f-a7658fed61d2")).toBe(true);
    expect(isSelectableIngredientName("돼지고기 앞다리 수육용")).toBe(true);
    expect(isSelectableIngredientName("삶은 돼지고기 앞다리 수육용")).toBe(false);
    for (const id of INACTIVE_INGREDIENT_IDS) expect(isSelectableIngredientId(id)).toBe(false);
    for (const name of INACTIVE_INGREDIENT_NAMES) expect(isSelectableIngredientName(name)).toBe(false);
  });

  it("retains the original migration and applies exactly one reviewed SQL selection recovery", () => {
    const legacySql = readFileSync(join(process.cwd(), "supabase/migrations/20260919001000_ingredient_search_normalization.sql"), "utf8");
    const original = legacySql.match(/create or replace function public\.is_selectable_catalog_ingredient\(p_id uuid\)[\s\S]*?\$function\$;/i)?.[0];
    const originalIds = original?.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g) ?? [];
    expect(originalIds).toHaveLength(26);
    expect([...originalIds].filter((id) => id !== "cdf20482-adc3-48dc-a48f-a7658fed61d2").sort()).toEqual([...INACTIVE_INGREDIENT_IDS].sort());
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261010010000_ingredient_exclusion_recovery_selection.sql"), "utf8");
    const helper = sql.match(/create or replace function public\.is_selectable_catalog_ingredient\(p_id uuid\)[\s\S]*?\$function\$;/i)?.[0];
    expect(helper).toBeDefined();
    const ids = helper?.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g) ?? [];
    expect(ids).toHaveLength(25);
    expect([...ids].sort()).toEqual([...INACTIVE_INGREDIENT_IDS].sort());
  });

  it.each([
    ["갯기름나물 (데친것)", "데친 갯기름나물"],
    ["파프리카 · 빨간색 (생것)", "빨간 파프리카"],
    ["돼지고기 · 갈비 (구운것(팬))", "팬에 구운 돼지고기 갈비"],
    ["당근 · 뿌리 (삶은것)", "삶은 당근 뿌리"],
    ["갯기름나물 · 노지 · 어린잎 (생것)", "노지 어린잎 갯기름나물"],
    ["갯기름나물 · 하우스 (데친것)", "데친 하우스 갯기름나물"],
    ["고사리 (말린것, 삶은것)", "말린 뒤 삶은 고사리"],
    ["고사리 (말린것, 데친것)", "말린 뒤 데친 고사리"],
    ["토란대 (삶아서 말린것, 삶은것)", "삶아 말린 뒤 삶은 토란대"],
    ["토란대 (삶아서 말린것, 데친것)", "삶아 말린 뒤 데친 토란대"],
    ["당근 (생것, 삶은것)", "생것을 삶은 당근"],
    ["고사리 (생것)", "고사리"],
    ["고사리 (말린것)", "말린 고사리"],
    ["고사리 (삶은것)", "삶은 고사리"],
    ["양파", "양파"],
  ])("normalizes %s to the natural catalog name %s", (input, expected) => {
    expect(normalizeIngredientCatalogName(input)).toBe(expected);
  });
});
