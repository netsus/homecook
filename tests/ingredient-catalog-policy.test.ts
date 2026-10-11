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

const RETIRED_UNUSED_IDS = [
  "290ff750-add0-455f-a407-325b71e2d51f",
  "ef4fa64d-94f6-5328-a5c2-fef92ef26ed8",
];

const PRIOR_INACTIVE_IDS: readonly string[] = INACTIVE_INGREDIENT_IDS.filter(
  (id) => !RETIRED_UNUSED_IDS.includes(id),
);

describe("ingredient catalog policy", () => {
  it("hides 25 removed RDA variants and two retired ingredients while keeping base ingredients selectable", () => {
    expect(INACTIVE_INGREDIENT_IDS).toHaveLength(27);
    expect(new Set(INACTIVE_INGREDIENT_IDS).size).toBe(27);
    expect(isSelectableIngredientId("b530cbdf-7d78-4dca-b43e-7b43a9114084")).toBe(false);
    expect(isSelectableIngredientId("47528b57-dc5b-4391-878a-1ded89521a60")).toBe(false);
    expect(isSelectableIngredientId("550e8400-e29b-41d4-a716-446655440014")).toBe(true);
    expect(isSelectableIngredientId("46b7df4c-e85d-53b3-bd12-fb4ffff049c3")).toBe(true);
    expect(INACTIVE_INGREDIENT_NAMES).toHaveLength(27);
    expect(new Set(INACTIVE_INGREDIENT_NAMES).size).toBe(27);
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
    expect([...originalIds].filter((id) => id !== "cdf20482-adc3-48dc-a48f-a7658fed61d2").sort()).toEqual([...PRIOR_INACTIVE_IDS].sort());
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261010120000_ingredient_exclusion_recovery_selection.sql"), "utf8");
    const helper = sql.match(/create or replace function public\.is_selectable_catalog_ingredient\(p_id uuid\)[\s\S]*?\$function\$;/i)?.[0];
    expect(helper).toBeDefined();
    const ids = helper?.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g) ?? [];
    expect(ids).toHaveLength(25);
    expect([...ids].sort()).toEqual([...PRIOR_INACTIVE_IDS].sort());
  });

  it("retires only the two unused identities without hiding seafood stock coins", () => {
    for (const id of RETIRED_UNUSED_IDS) expect(isSelectableIngredientId(id)).toBe(false);
    expect(isSelectableIngredientName("화이트크림")).toBe(false);
    expect(isSelectableIngredientName("해물육수(액체)")).toBe(false);
    expect(isSelectableIngredientName("해물육수코인")).toBe(true);
    expect(isSelectableIngredientName("생크림")).toBe(true);
  });

  it("adds exactly the two retired IDs in SQL and retains function authority guards", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261011140000_retire_unused_ingredients.sql"), "utf8");
    const helper = sql.match(/create or replace function public\.is_selectable_catalog_ingredient\(p_id uuid\)[\s\S]*?\$function\$;/i)?.[0];
    expect(helper).toBeDefined();
    const ids = helper?.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g) ?? [];
    expect(ids).toHaveLength(27);
    expect([...ids].sort()).toEqual([...INACTIVE_INGREDIENT_IDS].sort());
    expect(ids.filter((id) => !PRIOR_INACTIVE_IDS.includes(id)).sort()).toEqual([...RETIRED_UNUSED_IDS].sort());
    expect(sql).toContain("if md5(v_definition) is distinct from");
    expect(sql).toContain("if v_after is distinct from v_before");
    expect(sql).not.toMatch(/(?:delete\s+from|drop\s+function|grant\s|revoke\s)/i);
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
