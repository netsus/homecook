import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/nutrition-gap-candidates.mjs`,
).href;

async function loadModule(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

const core = {
  energy_kcal: 80,
  carbohydrate_g: 2,
  protein_g: 8,
  fat_g: 4,
  sodium_mg: 5,
};

type CandidateReportRow = {
  ingredient_id: string;
  classification: string;
  candidates: Array<{ external_item_key: string }>;
  review_decision: null | {
    decision: string;
    external_item_key: string;
    reason_code: string;
  };
};

type CandidateReport = Record<string, unknown> & {
  rows: CandidateReportRow[];
};

function sourceCandidate(overrides: Record<string, unknown>) {
  return {
    provider_code: "RDA_10_4",
    provider_label: "농촌진흥청 10.4",
    provider_rank: 2,
    source_version: "10.4",
    external_item_key: "RDA-TOFU",
    external_name: "두부, 생것",
    name_components: ["두부", "생것"],
    source_state: "생것",
    basis: { amount: 100, unit: "g" },
    values: {
      ...core,
      sugars_g: 0.7,
      fiber_g: 1.2,
      saturated_fat_g: 0.8,
    },
    ...overrides,
  };
}

describe("nutrition gap candidate report", () => {
  it("auto-approves only the same current source item when known values match and missing values are added", async () => {
    const candidateModule = await loadModule();
    expect(candidateModule.buildNutritionGapCandidateReport).toBeTypeOf("function");
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const inventory = {
      inventory_checksum: "inventory-sha",
      rows: [
        {
          ingredient_id: "eggplant-safe",
          ingredient_name: "가지",
          normalized_names: ["가지"],
          basis_amount: 100,
          basis_unit: "g",
          current_source_provider: "농촌진흥청",
          current_external_name: "가지, 생것",
          issue_codes: ["NUTRIENT_VALUE_MISSING"],
          missing_nutrients: ["sugars_g", "fiber_g", "saturated_fat_g"],
          nutrients: core,
        },
        {
          ingredient_id: "eggplant-changed",
          ingredient_name: "가지",
          normalized_names: ["가지"],
          basis_amount: 100,
          basis_unit: "g",
          current_source_provider: "농촌진흥청",
          current_external_name: "가지, 생것",
          issue_codes: ["NUTRIENT_VALUE_MISSING"],
          missing_nutrients: ["sugars_g", "fiber_g", "saturated_fat_g"],
          nutrients: core,
        },
      ],
    };
    const matchingCandidates = [
      sourceCandidate({
        external_item_key: "RDA-EGGPLANT-RAW",
        external_name: "가지, 생것",
        name_components: ["가지", "생것"],
        source_state: "생것",
      }),
      sourceCandidate({
        external_item_key: "RDA-EGGPLANT-BOILED",
        external_name: "가지, 삶은것",
        name_components: ["가지", "삶은것"],
        source_state: "삶은것",
        values: { ...core, energy_kcal: 75, sugars_g: 0.5, fiber_g: 1.8, saturated_fat_g: 0.7 },
      }),
    ];

    const safeReport = buildReport({
      inventory: { ...inventory, rows: [inventory.rows[0]] },
      candidates: matchingCandidates,
      generatedAt: "2026-07-21T00:00:00.000Z",
    });
    const changedReport = buildReport({
      inventory: { ...inventory, rows: [inventory.rows[1]] },
      candidates: [
        sourceCandidate({
          external_item_key: "RDA-EGGPLANT-RAW",
          external_name: "가지, 생것",
          name_components: ["가지", "생것"],
          source_state: "생것",
          values: {
            ...core,
            protein_g: 9,
            sugars_g: 0.7,
            fiber_g: 1.2,
            saturated_fat_g: 0.8,
          },
        }),
        matchingCandidates[1],
      ],
      generatedAt: "2026-07-21T00:00:00.000Z",
    });

    expect(safeReport.classification_counts).toMatchObject({
      approved_replacement: 1,
      needs_review: 0,
    });
    expect(safeReport.rows[0]).toMatchObject({
      classification: "approved_replacement",
      review_decision: {
        decision: "approve_candidate",
        external_item_key: "RDA-EGGPLANT-RAW",
        reason_code: "CURRENT_SOURCE_ITEM_VALUES_MATCH_AND_MISSING_VALUES_ADDED",
      },
    });
    expect(safeReport.rows[0].candidates[0]).toMatchObject({
      external_item_key: "RDA-EGGPLANT-RAW",
    });
    expect(changedReport.rows[0]).toMatchObject({
      classification: "needs_review",
      review_decision: null,
    });
  });

  it("classifies all targets without field-splicing or auto-approval", async () => {
    const candidateModule = await loadModule();
    expect(candidateModule.buildNutritionGapCandidateReport).toBeTypeOf("function");
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const inventory = {
      inventory_checksum: "inventory-sha",
      rows: [
        {
          ingredient_id: "tofu",
          ingredient_name: "두부",
          normalized_names: ["두부", "tofu"],
          basis_amount: 100,
          basis_unit: "g",
          issue_codes: ["NUTRIENT_VALUE_MISSING"],
          missing_nutrients: ["sugars_g", "fiber_g", "saturated_fat_g"],
          nutrients: core,
        },
        {
          ingredient_id: "salt",
          ingredient_name: "소금",
          normalized_names: ["소금"],
          basis_amount: 100,
          basis_unit: "g",
          issue_codes: ["NUTRIENT_VALUE_MISSING"],
          missing_nutrients: ["fiber_g"],
          nutrients: core,
        },
        {
          ingredient_id: "cream",
          ingredient_name: "화이트크림",
          normalized_names: ["화이트크림"],
          basis_amount: null,
          basis_unit: null,
          issue_codes: ["NUTRITION_PROFILE_MISSING"],
          missing_nutrients: [],
          nutrients: {},
        },
      ],
    };
    const candidates = [
      sourceCandidate({}),
      sourceCandidate({
        external_item_key: "RDA-SALT",
        external_name: "소금",
        name_components: ["소금"],
        values: core,
      }),
    ];

    const report = buildReport({
      inventory,
      candidates,
      generatedAt: "2026-07-21T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      target_count: 3,
      unclassified_count: 0,
      production_db_writes: 0,
      classification_counts: {
        approved_replacement: 0,
        needs_review: 1,
        keep_current: 1,
        no_compatible_source: 1,
      },
    });
    expect(report.rows.find((row) => row.ingredient_id === "tofu")).toMatchObject({
      classification: "needs_review",
      candidates: [{
        external_item_key: "RDA-TOFU",
        values: { sugars_g: 0.7, fiber_g: 1.2, saturated_fat_g: 0.8 },
      }],
    });
    expect(report.rows.every((row) => row.classification !== "approved_replacement"))
      .toBe(true);
  });

  it("renders current and candidate nutrients inline with page-level scrolling", async () => {
    const candidateModule = await loadModule();
    expect(candidateModule.renderNutritionGapCandidateHtml).toBeTypeOf("function");
    const render = candidateModule.renderNutritionGapCandidateHtml as (
      report: Record<string, unknown>,
    ) => string;
    const html = render({
      generated_at: "2026-07-21T00:00:00.000Z",
      target_count: 1,
      classification_counts: {
        approved_replacement: 1,
        needs_review: 0,
        keep_current: 0,
        no_compatible_source: 0,
      },
      rows: [{
        ingredient_id: "tofu",
        ingredient_name: "두부",
        classification: "approved_replacement",
        current: { basis_label: "100g", values: core },
        candidates: [sourceCandidate({})],
        review_decision: {
          decision: "approve_candidate",
          external_item_key: "RDA-TOFU",
          reason_code: "CURRENT_SOURCE_ITEM_VALUES_MATCH_AND_MISSING_VALUES_ADDED",
        },
      }],
    });

    expect(html).toContain("두부, 생것");
    expect(html).toContain("현재 → 후보");
    expect(html).toContain("승인 후보");
    expect(html).toContain("현재 유지");
    expect(html).toContain("보류");
    expect(html).toContain('data-tab="approved_replacement"');
    expect(html).toContain("승인 완료 1");
    expect(html).toContain("자동 승인: 현재 원본·기존값 일치, 누락값만 보완");
    expect(html).toContain("overflow-y: auto");
    expect(html).not.toContain("max-height:");
    expect(html).not.toContain("상세 열기");
  });

  it("renders each candidate's declared 100g or 100ml basis instead of hardcoding 100g", async () => {
    const candidateModule = await loadModule();
    const render = candidateModule.renderNutritionGapCandidateHtml as (
      report: Record<string, unknown>,
    ) => string;
    const html = render({
      generated_at: "2026-07-22T00:00:00.000Z",
      target_count: 1,
      classification_counts: {
        approved_replacement: 1,
        needs_review: 0,
        keep_current: 0,
        no_compatible_source: 0,
      },
      rows: [{
        ingredient_id: "orange-juice",
        ingredient_name: "오렌지즙",
        classification: "approved_replacement",
        current: { basis_label: "100g", values: core },
        candidates: [sourceCandidate({ basis: { amount: 100, unit: "ml" } })],
        review_decision: null,
      }],
    });

    expect(html).toContain("basis.textContent=candidate?fmtBasis(candidate.basis)");
    expect(html).not.toContain('basis.textContent=candidate?"100g"');
  });

  it("requires an explicit preparation marker when the canonical ingredient names a state", async () => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const inventory = {
      inventory_checksum: "inventory-sha",
      rows: [{
        ingredient_id: "dried-shrimp",
        ingredient_name: "건새우",
        normalized_names: ["건새우", "새우"],
        basis_amount: 100,
        basis_unit: "g",
        issue_codes: ["NUTRIENT_VALUE_MISSING"],
        missing_nutrients: ["fiber_g"],
        nutrients: core,
      }],
    };
    const report = buildReport({
      inventory,
      generatedAt: "2026-07-21T00:00:00.000Z",
      candidates: [
        sourceCandidate({
          external_item_key: "SHRIMP-FRIED",
          external_name: "새우, 볶은것",
          name_components: ["새우", "볶은것"],
          source_state: "볶은것",
        }),
        sourceCandidate({
          external_item_key: "SHRIMP-DRIED",
          external_name: "새우, 말린것",
          name_components: ["새우", "말린것"],
          source_state: "말린것",
        }),
      ],
    });

    expect(report.rows[0].candidates).toHaveLength(1);
    expect(report.rows[0].candidates[0].external_item_key).toBe("SHRIMP-DRIED");
  });
});
