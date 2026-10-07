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

  it.each([
    {
      name: "참깨",
      aliases: ["참깨", "깨"],
      wrongName: "멥쌀떡, 송편, 깨",
      wrongComponents: ["멥쌀떡", "송편", "깨"],
      correctName: "참깨, 흰색, 말린것",
      correctKey: "677",
    },
    {
      name: "두부",
      aliases: ["두부"],
      wrongName: "두부, 동두부, 동결건조",
      wrongComponents: ["두부", "동두부", "동결건조"],
      correctName: "두부",
      correctKey: "565",
    },
    {
      name: "양상추",
      aliases: ["양상추"],
      wrongName: "햄버거, 소고기패티, 토마토, 양상추, 양파",
      wrongComponents: ["햄버거", "소고기패티", "토마토", "양상추", "양파"],
      correctName: "상추, 결구(양상추), 녹색, 생것",
      correctKey: "1027",
    },
  ])("keeps $name candidates tied to the food and preparation despite polluted aliases", async ({
    name, aliases, wrongName, wrongComponents, correctName, correctKey,
  }) => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    // Existing source names may already have been imported as ingredient aliases.
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: name,
        ingredient_name: name,
        normalized_names: [...aliases, wrongName, wrongName.replaceAll(/[^가-힣]/g, "")],
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        nutrients: {},
      }] },
      candidates: [
        sourceCandidate({
          external_item_key: "wrong",
          external_name: wrongName,
          name_components: wrongComponents,
          match_scope_names: [name],
          source_state: wrongComponents.slice(1).join(" "),
        }),
        sourceCandidate({
          external_item_key: correctKey,
          external_name: correctName,
          name_components: correctName.split(/[,/]/),
          source_state: correctName.split(/[,/]/).slice(1).join(" "),
        }),
      ],
    });

    expect(report.rows[0]).toMatchObject({
      classification: "needs_review",
      review_decision: null,
      candidates: [{ external_item_key: correctKey }],
    });
    expect(report.rows[0].candidates).toHaveLength(1);
  });

  it.each([
    ["두부", "두부", "565"],
    ["참깨", "참깨, 흰색, 말린것", "677"],
  ])("retains same-source nutrient completion for %s", async (name, externalName, key) => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: name,
        ingredient_name: name,
        normalized_names: [name],
        basis_amount: 100,
        basis_unit: "g",
        current_source_provider: "농촌진흥청",
        current_external_name: externalName,
        issue_codes: ["NUTRIENT_VALUE_MISSING"],
        missing_nutrients: ["fiber_g"],
        nutrients: core,
      }] },
      candidates: [sourceCandidate({
        external_item_key: key,
        external_name: externalName,
        name_components: externalName.split(/[,/]/),
        source_state: externalName.split(/[,/]/).slice(1).join(" "),
      })],
    });

    expect(report.rows[0]).toMatchObject({
      classification: "approved_replacement",
      review_decision: { external_item_key: key },
    });
  });

  it.each([
    ["청양고추", "고추, 청양고추, 생것", ["청양고추"]],
    ["오트밀", "귀리, 오트밀", ["오트밀"]],
    ["백김치", "김치, 백김치", ["백김치"]],
    ["말린 녹두", "녹두, 말린것", ["말린 녹두", "녹두, 말린것"]],
    ["국내산 동부모싯잎송편", "멥쌀떡, 모싯잎송편, 동부(국내산)", ["멥쌀떡, 모싯잎송편, 동부(국내산)"]],
    ["수입산 동부모싯잎송편", "멥쌀떡, 모싯잎송편, 동부(수입산)", ["멥쌀떡, 모싯잎송편, 동부(수입산)"]],
    ["현미가래떡", "멥쌀떡, 가래떡, 현미", ["멥쌀떡, 가래떡, 현미"]],
    ["흑미가래떡", "멥쌀떡, 가래떡, 흑미", ["멥쌀떡, 가래떡, 흑미"]],
    ["검정콩송편", "멥쌀떡, 송편, 검정콩", ["멥쌀떡, 송편, 검정콩"]],
    ["검정콩백설기", "멥쌀떡, 백설기, 검정콩", ["멥쌀떡, 백설기, 검정콩"]],
    ["인절미 찹쌀떡 팥고물", "찹쌀떡, 인절미, 팥고물", ["찹쌀떡, 인절미, 팥고물"]],
    ["개피떡", "멥쌀떡, 개피떡(바람떡)", ["멥쌀떡, 개피떡(바람떡)"]],
  ])("preserves existing non-composite subtype and source-alias matches for %s", async (
    name, externalName, aliases,
  ) => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: name,
        ingredient_name: name,
        normalized_names: aliases,
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        nutrients: {},
      }] },
      candidates: [sourceCandidate({
        external_name: externalName,
        name_components: externalName.split(/[,/]/),
        source_state: externalName.split(/[,/]/).slice(1).join(" "),
      })],
    });

    expect(report.rows[0].classification).toBe("needs_review");
    expect(report.rows[0].candidates).toHaveLength(1);
  });

  it("rejects rice-cake toppings even when the full source name is an imported alias", async () => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const externalName = "찹쌀떡, 인절미, 콩고물";
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: "soybean-powder",
        ingredient_name: "콩고물",
        normalized_names: ["콩고물", externalName],
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        nutrients: {},
      }] },
      candidates: [sourceCandidate({
        external_name: externalName,
        name_components: externalName.split(/[,/]/),
        match_scope_names: ["콩고물"],
      })],
    });

    expect(report.rows[0].classification).toBe("no_compatible_source");
    expect(report.rows[0].candidates).toHaveLength(0);
  });

  it.each([
    ["초코칩", "과자, 쿠키, 초코칩", ["초코칩", "과자, 쿠키, 초코칩"], "no_compatible_source"],
    ["초코칩쿠키", "과자, 쿠키, 초코칩", ["과자, 쿠키, 초코칩"], "needs_review"],
    ["쿠키", "과자, 쿠키, 초코칩", ["쿠키"], "needs_review"],
    ["비스킷", "과자, 비스킷, 하드", ["비스킷"], "needs_review"],
    ["비스킷 과자 소프트", "과자, 비스킷, 소프트", ["과자, 비스킷, 소프트"], "needs_review"],
  ])("distinguishes cookie fillings from the whole food for %s", async (
    name, externalName, aliases, classification,
  ) => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: name,
        ingredient_name: name,
        normalized_names: aliases,
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        nutrients: {},
      }] },
      candidates: [sourceCandidate({
        external_name: externalName,
        name_components: externalName.split(/[,/]/),
        match_scope_names: [name],
      })],
    });

    expect(report.rows[0].classification).toBe(classification);
    expect(report.rows[0].candidates).toHaveLength(classification === "needs_review" ? 1 : 0);
  });

  it.each([
    ["햄버거", "햄버거, 소고기패티, 토마토, 양상추, 양파"],
    ["송편", "멥쌀떡, 송편, 깨"],
    ["동결두부", "동결두부"],
    ["동두부", "두부, 동두부, 동결건조"],
    ["멥쌀떡, 송편, 깨", "멥쌀떡, 송편, 깨"],
  ])("allows an explicit whole-food request for %s", async (name, externalName) => {
    const candidateModule = await loadModule();
    const buildReport = candidateModule.buildNutritionGapCandidateReport as (
      input: Record<string, unknown>,
    ) => CandidateReport;
    const report = buildReport({
      inventory: { rows: [{
        ingredient_id: name,
        ingredient_name: name,
        normalized_names: [name],
        issue_codes: ["NUTRITION_PROFILE_MISSING"],
        nutrients: {},
      }] },
      candidates: [sourceCandidate({
        external_name: externalName,
        name_components: externalName.split(/[,/]/),
        source_state: externalName.split(/[,/]/).slice(1).join(" "),
      })],
    });

    expect(report.rows[0].classification).toBe("needs_review");
    expect(report.rows[0].candidates).toHaveLength(1);
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
