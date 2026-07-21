import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/generate-nutrition-review-html.mjs`,
).href;

async function loadModule(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

describe("nutrition review HTML", () => {
  it("keeps a 100-unit nutrition basis intact", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.formatNutritionBasisLabel).toBeTypeOf("function");
    const formatBasis = reviewModule.formatNutritionBasisLabel as (
      amount: number | null,
      unit: string | null,
    ) => string;

    expect(formatBasis(100, "g")).toBe("100g");
    expect(formatBasis(100, "ml")).toBe("100ml");
    expect(formatBasis(null, null)).toBe("");
  });

  it("assigns blockers to P0, core nutrient gaps to P1, and optional-only gaps to P2", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.classifyNutritionReviewPriority).toBeTypeOf("function");
    const classify = reviewModule.classifyNutritionReviewPriority as (row: {
      issue_codes: string[];
      missing_nutrients: string[];
    }) => string;

    expect(classify({ issue_codes: ["UNIT_CONVERSION_MISSING"], missing_nutrients: [] }))
      .toBe("P0");
    expect(classify({ issue_codes: ["NUTRIENT_VALUE_MISSING"], missing_nutrients: ["protein_g"] }))
      .toBe("P1");
    expect(classify({ issue_codes: ["NUTRIENT_VALUE_MISSING"], missing_nutrients: ["fiber_g"] }))
      .toBe("P2");
  });

  it("freezes only nutrition-gap targets into a deterministic 90+5 review inventory", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.buildNutritionGapInventory).toBeTypeOf("function");
    const buildInventory = reviewModule.buildNutritionGapInventory as (input: {
      generatedAt: string;
      rows: Array<Record<string, unknown>>;
    }) => {
      target_count: number;
      partial_nutrient_count: number;
      missing_profile_count: number;
      production_db_writes: number;
      inventory_checksum: string;
      rows: Array<Record<string, unknown>>;
    };
    const rows = [
      {
        ingredient_id: "ingredient-optional",
        ingredient_name: "선택 영양 누락",
        basis_amount: 100,
        basis_unit: "g",
        issue_codes: ["NUTRIENT_VALUE_MISSING"],
        missing_nutrients: ["fiber_g", "sugars_g"],
        nutrients: { energy_kcal: 20, sodium_mg: 3 },
      },
      {
        ingredient_id: "ingredient-no-profile",
        ingredient_name: "프로필 없음",
        basis_amount: null,
        basis_unit: null,
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        missing_nutrients: [],
        nutrients: {},
      },
      {
        ingredient_id: "ingredient-conversion-only",
        ingredient_name: "환산만 누락",
        basis_amount: 100,
        basis_unit: "g",
        issue_codes: ["UNIT_CONVERSION_MISSING"],
        missing_nutrients: [],
        nutrients: { energy_kcal: 10 },
      },
    ];

    const first = buildInventory({ generatedAt: "2026-07-21T10:00:00.000Z", rows });
    const second = buildInventory({ generatedAt: "2026-07-21T11:00:00.000Z", rows: [...rows].reverse() });

    expect(first.target_count).toBe(2);
    expect(first.partial_nutrient_count).toBe(1);
    expect(first.missing_profile_count).toBe(1);
    expect(first.production_db_writes).toBe(0);
    expect(first.rows.map((row) => row.ingredient_id)).toEqual([
      "ingredient-no-profile",
      "ingredient-optional",
    ]);
    expect(first.inventory_checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(second.inventory_checksum).toBe(first.inventory_checksum);
  });

  it("renders three counted tabs, blank missing values, visible review controls, and page-level scrolling", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.renderNutritionReviewHtml).toBeTypeOf("function");
    const render = reviewModule.renderNutritionReviewHtml as (input: {
      generatedAt: string;
      rows: Array<Record<string, unknown>>;
    }) => string;
    const rows = [
      {
        ingredient_id: "ingredient-p0",
        ingredient_name: "설탕",
        basis_label: "100g",
        issue_codes: ["UNIT_CONVERSION_MISSING"],
        missing_nutrients: [],
        nutrients: { energy_kcal: 386, protein_g: 0 },
      },
      {
        ingredient_id: "ingredient-p1",
        ingredient_name: "프로필 없음",
        basis_label: "",
        issue_codes: ["NUTRIENT_VALUE_MISSING"],
        missing_nutrients: ["energy_kcal"],
        nutrients: {},
      },
      {
        ingredient_id: "ingredient-p2",
        ingredient_name: "선택 영양 누락",
        basis_label: "100g",
        issue_codes: ["NUTRIENT_VALUE_MISSING"],
        missing_nutrients: ["fiber_g"],
        nutrients: { energy_kcal: 20 },
      },
    ];

    const html = render({ generatedAt: "2026-07-21T10:00:00.000Z", rows });

    expect(html).toContain("검수 대상 <strong>3</strong>개");
    expect(html).toMatch(/data-priority="P0"[^>]*>[\s\S]*?P0[\s\S]*?36|data-priority="P0"/);
    expect(html).toContain("data-count=\"1\"");
    expect(html).toContain("승인");
    expect(html).toContain("수정 필요");
    expect(html).toContain("보류");
    expect(html).toContain("overflow-y: auto");
    expect(html).not.toContain("max-height:");
    expect(html).not.toMatch(/th\s*\{[\s\S]*?position:\s*sticky/);
    expect(html).not.toContain("상세 열기");
    expect(html).not.toContain("누락 영양소");
  });
});
