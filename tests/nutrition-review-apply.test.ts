import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/nutrition-review-apply.mjs`,
).href;

type CollectedSourceRow = {
  provider_code: string;
  source: { dataset_name: string };
  source_item: {
    external_item_key: string;
    provenance: { origin_provider: string };
  };
};

type ManualResolutionResult = {
  ingredient_name: string;
  source_item: {
    external_item_key: string;
    basis: { amount: number; unit: string };
    values: Record<string, { amount: number | null }>;
  };
};

type FinalizationResult = {
  summary: Record<string, number>;
  entries: Array<{
    ingredient_name: string;
    basis: { amount: number; unit: string };
    values: Record<string, { amount: number | null }>;
  }>;
  final_report: { classification_counts: Record<string, number> };
  payload_checksum: string;
};

async function loadModule(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

const nutrientValues = (overrides: Record<string, number | null> = {}) => ({
  energy_kcal: 20,
  carbohydrate_g: 3,
  protein_g: 2,
  fat_g: 1,
  saturated_fat_g: null,
  sugars_g: null,
  fiber_g: null,
  sodium_mg: 5,
  ...overrides,
});

const sourceValues = (values: Record<string, number | null>) =>
  Object.fromEntries(
    Object.entries(values).map(([code, amount]) => [
      code,
      {
        amount,
        unit: code === "energy_kcal" ? "kcal" : code === "sodium_mg" ? "mg" : "g",
        missing_reason: amount === null ? "blank" : null,
        source_token: amount === null ? "" : String(amount),
        source_nutrient_code: code,
      },
    ]),
  );

function manualResolution(
  ingredientId: string,
  ingredientName: string,
  externalItemKey: string,
  basisUnit: "g" | "ml",
  values: Record<string, number | null>,
) {
  return {
    ingredient_id: ingredientId,
    ingredient_name: ingredientName,
    resolution_kind: "manual_source",
    source: {
      provider_code: "HOMECOOK_REVIEW",
      provider_label: "사용자 지정 검수 출처",
      dataset_name: "사용자 지정 검수 스냅샷",
      source_version: "2026-07-22",
      source_url: "https://example.com/source",
      license_name: "source terms",
      license_url: null,
      priority_rank: 1,
    },
    source_item: {
      external_item_key: externalItemKey,
      external_name: ingredientName,
      preparation_state: "as_published",
      basis: { amount: 100, unit: basisUnit, source_text: `100${basisUnit}` },
      edible_portion: { text: `가식부 100${basisUnit} 기준` },
      values: sourceValues(values),
      provenance: { review_note: "사용자 지정 값" },
    },
  };
}

describe("nutrition review finalization and local apply payload", () => {
  it("collects RDA, integrated NIFS, and MFDS normalized rows with reviewed snapshot attribution", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.collectNormalizedCandidateSourceRows).toBeTypeOf("function");
    const collectNormalizedCandidateSourceRows = reviewModule.collectNormalizedCandidateSourceRows as (
      input: Record<string, unknown>,
    ) => CollectedSourceRow[];
    const row = (key: string, name: string) => ({
      external_item_key: key,
      external_name: name,
      preparation_state: "as_published",
      basis: { amount: 100, unit: "g", source_text: "100g" },
      edible_portion: { text: "가식부 100g 기준" },
      values: sourceValues(nutrientValues()),
      fingerprint: key.padEnd(64, "a").slice(0, 64),
      content_hash: key.padEnd(64, "b").slice(0, 64),
    });
    const commonSource = {
      dataset: "공식 영양 DB",
      source_version: "2026-07-01",
      source_url: "https://example.com/db",
      license: "공공데이터",
      license_url: "https://example.com/license",
    };

    const sources = collectNormalizedCandidateSourceRows({
      bundles: [
        { kind: "rda", bundle: { source: { ...commonSource, provider: "농촌진흥청" }, rows: [row("RDA-1", "가지, 생것")] } },
        {
          kind: "integrated",
          bundle: {
            source: { ...commonSource, provider: "K-FIND" },
            rows: [row("NIFS-1", "다시마류_다시마")],
            staged_rows: [{ foodCd: "NIFS-1", srcNm: "국립수산과학원" }],
          },
        },
        { kind: "mfds", bundle: { source: { ...commonSource, provider: "식품의약품안전처" }, rows: [row("MFDS-1", "표시 제품")] } },
      ],
      snapshotDate: "2026-07-22",
    });

    expect(sources.map((item) => item.provider_code)).toEqual([
      "RDA_10_4",
      "NIFS_KFIND",
      "MFDS",
    ]);
    expect(sources[1]).toMatchObject({
      source: {
        dataset_name: "공식 영양 DB 사용자 검수 스냅샷 2026-07-22",
      },
      source_item: {
        external_item_key: "NIFS-1",
        provenance: { origin_provider: "국립수산과학원" },
      },
    });
  });

  it("builds the six user-specified manual resolutions without changing their declared basis", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.buildUserNutritionManualResolutions).toBeTypeOf("function");
    const buildUserNutritionManualResolutions = reviewModule.buildUserNutritionManualResolutions as (
      input: Record<string, unknown>,
    ) => ManualResolutionResult[];
    const rows = [
      {
        ingredient_id: "b5474e80-2330-42dd-99a2-dd16fd0fbf34",
        ingredient_name: "모시조개",
        current: { values: nutrientValues({ energy_kcal: 61, sodium_mg: null }) },
      },
      { ingredient_id: "d7f3be61-d96c-4bee-b83e-5d2632ea0ce3", ingredient_name: "새송이버섯" },
      { ingredient_id: "b503761d-c935-4e19-b687-1ce24361a50c", ingredient_name: "오렌지 껍질" },
      { ingredient_id: "d2e9328e-456c-4ebc-9bc0-3838a90ea588", ingredient_name: "오렌지즙" },
      { ingredient_id: "9dc0ee0f-7aab-416b-8eb7-4447a8139b0e", ingredient_name: "그릭 요거트" },
      { ingredient_id: "335eff99-f04c-4942-adee-5aea91c32dd9", ingredient_name: "통밀 식빵" },
    ];
    const mushroomValues = nutrientValues({
      energy_kcal: 23,
      carbohydrate_g: 4.8,
      protein_g: 1.78,
      fat_g: 0.15,
      saturated_fat_g: 0,
      sugars_g: 2.63,
      sodium_mg: 0,
    });
    const sourceRows = [{
      provider_code: "MFDS",
      source_item: {
        external_item_key: "P116-702070100-0427",
        external_name: "청년의 품격 새송이버섯",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "가식부 100g 기준" },
        values: sourceValues(mushroomValues),
        fingerprint: "b".repeat(64),
        content_hash: "c".repeat(64),
      },
    }];

    const resolutions = buildUserNutritionManualResolutions({ rows, sourceRows });

    expect(resolutions).toHaveLength(6);
    expect(resolutions.find((item) => item.ingredient_name === "모시조개")?.source_item.values).toMatchObject({
      energy_kcal: { amount: 61 },
      sodium_mg: { amount: 557 },
    });
    expect(resolutions.find((item) => item.ingredient_name === "새송이버섯")?.source_item).toMatchObject({
      external_item_key: "P116-702070100-0427",
      values: {
        energy_kcal: { amount: 23 },
        sugars_g: { amount: 2.63 },
      },
    });
    expect(resolutions.find((item) => item.ingredient_name === "오렌지 껍질")?.source_item.values).toMatchObject({
      energy_kcal: { amount: 97 },
      fiber_g: { amount: 10.6 },
      sodium_mg: { amount: 0 },
    });
    expect(resolutions.find((item) => item.ingredient_name === "오렌지즙")?.source_item).toMatchObject({
      basis: { amount: 100, unit: "ml" },
      values: {
        energy_kcal: { amount: 43 },
        carbohydrate_g: { amount: 10 },
        sugars_g: { amount: 10 },
        fat_g: { amount: 0.1 },
        saturated_fat_g: { amount: 0 },
        protein_g: { amount: 0.6 },
        sodium_mg: { amount: 10 },
      },
    });
    expect(resolutions.find((item) => item.ingredient_name === "그릭 요거트")?.source_item).toMatchObject({
      basis: { amount: 100, unit: "g" },
      values: {
        energy_kcal: { amount: 117 },
        carbohydrate_g: { amount: 5.04 },
        sugars_g: { amount: 4.62 },
        protein_g: { amount: 4.05 },
        fat_g: { amount: 9.19 },
        fiber_g: { amount: 0 },
        saturated_fat_g: { amount: null },
        sodium_mg: { amount: null },
      },
    });
    expect(resolutions.find((item) => item.ingredient_name === "통밀 식빵")?.source_item).toMatchObject({
      basis: { amount: 100, unit: "g" },
      values: {
        energy_kcal: { amount: 259 },
        carbohydrate_g: { amount: 47.14 },
        sugars_g: { amount: 5.49 },
        protein_g: { amount: 9.13 },
        fat_g: { amount: 4.11 },
        fiber_g: { amount: 4.4 },
        saturated_fat_g: { amount: null },
        sodium_mg: { amount: null },
      },
    });
  });

  it("turns one official approval and six manual resolutions into seven append-only apply entries", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.finalizeNutritionReview).toBeTypeOf("function");
    const finalizeNutritionReview = reviewModule.finalizeNutritionReview as (
      input: Record<string, unknown>,
    ) => FinalizationResult;

    const report = {
      schema_version: "nutrition-gap-candidate-report-v1",
      report_checksum: "report-sha",
      rows: [
        {
          ingredient_id: "kombu",
          ingredient_name: "다시마",
          current: { values: nutrientValues() },
          candidates: [{
            provider_code: "NIFS_KFIND",
            provider_label: "국립수산과학원 · K-FIND 통합 DB",
            provider_rank: 1,
            source_version: "2026-07-01",
            external_item_key: "R112-819013990-5402",
            external_name: "다시마류_다시마_전체_삶은것에 소금을 가한것_대표_평균",
            basis: { amount: 100, unit: "g" },
            values: nutrientValues({ energy_kcal: 15, sodium_mg: 4598 }),
          }],
        },
        { ingredient_id: "clam", ingredient_name: "모시조개", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "mushroom", ingredient_name: "새송이버섯", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "zest", ingredient_name: "오렌지 껍질", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "juice", ingredient_name: "오렌지즙", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "greek", ingredient_name: "그릭 요거트", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "bread", ingredient_name: "통밀 식빵", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "keep", ingredient_name: "현재 유지", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "keep2", ingredient_name: "현재 유지 2", current: { values: nutrientValues() }, candidates: [] },
        { ingredient_id: "hold", ingredient_name: "제품 검수 보류", current: { values: nutrientValues() }, candidates: [] },
      ],
    };
    const reviewExport = {
      version: 1,
      report_checksum: "report-sha",
      decisions: {
        kombu: { decision: "approve_candidate", external_item_key: "R112-819013990-5402" },
        clam: { decision: "hold", external_item_key: null },
        mushroom: { decision: "hold", external_item_key: null },
        zest: { decision: "hold", external_item_key: null },
        juice: { decision: "hold", external_item_key: null },
        greek: { decision: "hold", external_item_key: null },
        bread: { decision: "hold", external_item_key: null },
        keep: { decision: "keep_current", external_item_key: null },
        keep2: { decision: "keep_current", external_item_key: null },
        hold: { decision: "hold", external_item_key: null },
      },
    };
    const kombuValues = nutrientValues({ energy_kcal: 15, sodium_mg: 4598 });
    const sourceRows = [{
      provider_code: "NIFS_KFIND",
      source: {
        provider_code: "NIFS_KFIND",
        provider_label: "국립수산과학원 · K-FIND 통합 DB",
        dataset_name: "K-FIND 통합 DB 검수 스냅샷",
        source_version: "2026-07-01",
        source_url: "https://www.data.go.kr/data/15100065/standard.do",
        license_name: "공공누리",
        license_url: "https://www.data.go.kr/ugs/selectPortalPolicyView.do",
        priority_rank: 1,
      },
      source_item: {
        external_item_key: "R112-819013990-5402",
        external_name: "다시마류_다시마_전체_삶은것에 소금을 가한것_대표_평균",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "가식부 100g 기준" },
        values: sourceValues(kombuValues),
        provenance: { origin_provider: "국립수산과학원" },
      },
    }];
    const manualResolutions = [
      manualResolution("clam", "모시조개", "HOMECOOK-MOSIJOGAE-20260722", "g", nutrientValues({ sodium_mg: 557 })),
      manualResolution("mushroom", "새송이버섯", "P116-702070100-0427", "g", nutrientValues({ energy_kcal: 23, sodium_mg: 0 })),
      manualResolution("zest", "오렌지 껍질", "LOGI-ORANGE-ZEST", "g", nutrientValues({ energy_kcal: 97, sodium_mg: 0 })),
      manualResolution("juice", "오렌지즙", "DONSIMON-ORANGE-100", "ml", nutrientValues({ energy_kcal: 43, sodium_mg: 10 })),
      manualResolution("greek", "그릭 요거트", "KURLY-GREEK-YOGURT", "g", nutrientValues({ energy_kcal: 117, sodium_mg: null })),
      manualResolution("bread", "통밀 식빵", "KURLY-WHOLE-WHEAT-BREAD", "g", nutrientValues({ energy_kcal: 259, sodium_mg: null })),
    ];

    const result = finalizeNutritionReview({
      report,
      reviewExport,
      sourceRows,
      manualResolutions,
      reviewedBy: "10000000-0000-4000-8000-000000000001",
      reviewedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(result.summary).toEqual({
      total_count: 10,
      apply_count: 7,
      approved_candidate_count: 1,
      manual_resolution_count: 6,
      keep_current_count: 2,
      hold_count: 1,
    });
    expect(result.entries).toHaveLength(7);
    expect(result.entries.find((entry) => entry.ingredient_name === "오렌지즙")).toMatchObject({
      basis: { amount: 100, unit: "ml" },
      values: {
        energy_kcal: { amount: 43 },
        sodium_mg: { amount: 10 },
      },
    });
    expect(result.final_report.classification_counts).toMatchObject({
      approved_replacement: 7,
      keep_current: 2,
      needs_review: 1,
    });
    expect(result.payload_checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a stale review export and a manual basis other than exactly 100g or 100ml", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.finalizeNutritionReview).toBeTypeOf("function");
    const finalizeNutritionReview = reviewModule.finalizeNutritionReview as (
      input: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(() => finalizeNutritionReview({
      report: { report_checksum: "new", rows: [] },
      reviewExport: { report_checksum: "old", decisions: {} },
      sourceRows: [],
      manualResolutions: [],
      reviewedBy: "10000000-0000-4000-8000-000000000001",
      reviewedAt: "2026-07-22T00:00:00.000Z",
    })).toThrow("REVIEW_CHECKSUM_MISMATCH");

    const invalid = manualResolution("juice", "오렌지즙", "DONSIMON", "ml", nutrientValues());
    invalid.source_item.basis.amount = 200;
    expect(() => finalizeNutritionReview({
      report: {
        report_checksum: "same",
        rows: [{ ingredient_id: "juice", ingredient_name: "오렌지즙", current: { values: nutrientValues() }, candidates: [] }],
      },
      reviewExport: { report_checksum: "same", decisions: { juice: { decision: "hold" } } },
      sourceRows: [],
      manualResolutions: [invalid],
      reviewedBy: "10000000-0000-4000-8000-000000000001",
      reviewedAt: "2026-07-22T00:00:00.000Z",
    })).toThrow("INVALID_NUTRITION_BASIS");
  });

  it("renders a local-only database call without interpolating review JSON as SQL", async () => {
    const reviewModule = await loadModule();
    expect(reviewModule.renderNutritionReviewApplySql).toBeTypeOf("function");
    const renderNutritionReviewApplySql = reviewModule.renderNutritionReviewApplySql as (
      payload: Record<string, unknown>,
    ) => string;
    const sql = renderNutritionReviewApplySql({
      schema_version: "homecook-nutrition-review-apply-v1",
      payload_checksum: "a".repeat(64),
      entries: [],
    });

    expect(sql).toContain("public.apply_reviewed_ingredient_nutrition");
    expect(sql).toContain("decode(");
    expect(sql).not.toContain("homecook-nutrition-review-apply-v1");
  });
});
