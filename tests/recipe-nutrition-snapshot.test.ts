import { describe, expect, it, vi } from "vitest";

import type { RecipeNutritionCalculation } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { RecipeNutritionSnapshotRow } from "@/lib/server/recipe-nutrition-snapshot";
import {
  mapRecipeNutritionSnapshot,
  validateRecipeNutritionSnapshot,
  writeRecipeNutritionSnapshot,
} from "@/lib/server/recipe-nutrition-snapshot";

const SOURCE = {
  provider: "식품의약품안전처",
  dataset: "식품영양성분DB정보",
  source_version: "2025-12-05",
  data_basis_date: null,
  license: "이용허락범위 제한 없음",
  source_url: "https://www.data.go.kr/data/15127578/openapi.do",
};
const INPUT_GUARD = { recipe_ingredients: [] };

function completeCalculation(): RecipeNutritionCalculation {
  const values = {
    energy_kcal: { amount: 100, known_amount: null, status: "complete", display_mode: "total" },
    carbohydrate_g: { amount: 20, known_amount: null, status: "complete", display_mode: "total" },
    protein_g: { amount: 10, known_amount: null, status: "complete", display_mode: "total" },
    fat_g: { amount: 5, known_amount: null, status: "complete", display_mode: "total" },
    sodium_mg: { amount: 50, known_amount: null, status: "complete", display_mode: "total" },
  } as const;

  return {
    basis: { amount: 2, unit: "serving" },
    base_servings: 2,
    values,
    scalable_values: {
      energy_kcal: 80,
      carbohydrate_g: 15,
      protein_g: 8,
      fat_g: 4,
      sodium_mg: 40,
    },
    fixed_values: {
      energy_kcal: 20,
      carbohydrate_g: 5,
      protein_g: 2,
      fat_g: 1,
      sodium_mg: 10,
    },
    calculation_status: "complete",
    calculation_quality: "direct",
    reflected_ingredient_count: 1,
    target_ingredient_count: 1,
    missing_reasons: [],
    warnings: [],
    sources: [SOURCE],
    input_hash: "a".repeat(64),
    calculation_version: "recipe-nutrition-v1",
    rounding_policy_version: "display-v1",
  };
}

function optionalOnlyCalculation(): RecipeNutritionCalculation {
  const calculation = completeCalculation();
  calculation.values = {
    energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    carbohydrate_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    protein_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    fat_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    sodium_mg: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    sugars_g: { amount: 3, known_amount: null, status: "complete", display_mode: "total" },
  };
  calculation.scalable_values = { sugars_g: 3 };
  calculation.fixed_values = { sugars_g: 0 };
  calculation.calculation_status = "partial";
  calculation.calculation_quality = "direct";
  return calculation;
}

describe("recipe nutrition snapshot writer", () => {
  it("accepts the official single-authority payload and sends only immutable snapshot fields", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        snapshot_id: "snapshot-1",
        created: true,
        is_current: true,
      },
      error: null,
    }));
    const calculation = completeCalculation();

    const result = await writeRecipeNutritionSnapshot({ rpc }, "recipe-1", calculation, {
      calculatedAt: "2026-07-16T00:00:00.000Z",
      expectedRecipeVersion: "2026-07-16T00:00:00.000Z",
      inputGuard: INPUT_GUARD,
    });

    expect(result).toEqual({ snapshot_id: "snapshot-1", created: true, is_current: true });
    expect(rpc).toHaveBeenCalledWith("write_recipe_nutrition_snapshot", {
      p_recipe_id: "recipe-1",
      p_expected_recipe_updated_at: "2026-07-16T00:00:00.000Z",
      p_input_guard: INPUT_GUARD,
      p_snapshot: {
        base_servings: 2,
        input_hash: "a".repeat(64),
        calculation_version: "recipe-nutrition-v1",
        scalable_values: calculation.scalable_values,
        fixed_values: calculation.fixed_values,
        nutrient_status: calculation.values,
        calculation_status: "complete",
        calculation_quality: "direct",
        reflected_ingredient_count: 1,
        target_ingredient_count: 1,
        missing_reasons: [],
        warnings: [],
        sources: [SOURCE],
        calculated_at: "2026-07-16T00:00:00.000Z",
      },
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("nutrition_profile_id");
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("source_calculation_hash");
  });

  it("rejects vector mismatches and non-finite values before the database write", () => {
    const invalid = completeCalculation();
    invalid.fixed_values.energy_kcal = Number.POSITIVE_INFINITY;

    expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
      expect.objectContaining({ code: "INVALID_SNAPSHOT_VECTOR" }),
    );

    invalid.fixed_values.energy_kcal = 19;
    expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
      expect.objectContaining({ code: "SNAPSHOT_VECTOR_SUM_MISMATCH" }),
    );
  });

  it("rejects source extra fields, auth query data, internal paths, raw rows and secrets", () => {
    const unsafeCases: unknown[] = [
      { ...SOURCE, reviewed_by: "user-1" },
      { ...SOURCE, source_url: "https://example.test/data?serviceKey=secret" },
      { ...SOURCE, source_url: "https://user:password@example.test/data" },
      { ...SOURCE, source_url: "https://example.test/data?X-Amz-Signature=secret" },
      ...[
        "password",
        "pass",
        "subscription-key",
        "subscription_key",
        "access_key",
        "access-key",
        "accesskey",
        "client_credential",
        "private-token",
      ].map((key) => ({
        ...SOURCE,
        source_url: `https://example.test/data?${key}=redacted-value`,
      })),
      { ...SOURCE, source_url: "https://example.test/data#access_token=secret" },
      { ...SOURCE, source_url: "file:///private/provider/raw.json" },
      { ...SOURCE, source_url: "/internal/storage/raw.json" },
      { ...SOURCE, dataset: "raw_provider_row" },
    ];

    for (const source of unsafeCases) {
      const invalid = completeCalculation();
      invalid.sources = [source as typeof SOURCE];
      expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
        expect.objectContaining({ code: "UNSAFE_SNAPSHOT_SOURCE" }),
      );
    }
  });

  it("rejects nutrient keys outside the official core and optional eight", () => {
    const invalid = completeCalculation();
    (invalid.values as Record<string, unknown>).arbitrary_nutrient = {
      amount: 1,
      known_amount: null,
      status: "complete",
      display_mode: "total",
    };
    (invalid.scalable_values as Record<string, unknown>).arbitrary_nutrient = 1;
    (invalid.fixed_values as Record<string, unknown>).arbitrary_nutrient = 0;

    expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
      expect.objectContaining({ code: "INVALID_SNAPSHOT_NUTRIENT_STATUS" }),
    );
  });

  it("rejects arbitrary warning or missing-reason text and status/provenance contradictions", () => {
    const arbitraryWarning = completeCalculation();
    arbitraryWarning.warnings = ["secret=/private/provider/key"];

    const arbitraryReason = completeCalculation();
    arbitraryReason.missing_reasons = ["RAW_PROVIDER_ROW:/internal/secret"];

    const directWithEstimatedWarning = completeCalculation();
    directWithEstimatedWarning.warnings = ["REPRESENTATIVE_VOLUME_CONVERSION_USED"];

    const unavailableWithSources = completeCalculation();
    unavailableWithSources.values = Object.fromEntries(
      Object.keys(unavailableWithSources.values).map((code) => [code, {
        amount: null,
        known_amount: null,
        status: "unavailable",
        display_mode: null,
      }]),
    ) as RecipeNutritionCalculation["values"];
    unavailableWithSources.scalable_values = {};
    unavailableWithSources.fixed_values = {};
    unavailableWithSources.calculation_status = "unavailable";
    unavailableWithSources.calculation_quality = null;

    for (const invalid of [
      arbitraryWarning,
      arbitraryReason,
      directWithEstimatedWarning,
      unavailableWithSources,
    ]) {
      expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
        expect.objectContaining({ code: "INVALID_SNAPSHOT_STATUS" }),
      );
    }
  });

  it("accepts optional-only partial data and rejects an overall status that contradicts nutrients", () => {
    expect(() => validateRecipeNutritionSnapshot(optionalOnlyCalculation())).not.toThrow();

    const contradictory = completeCalculation();
    contradictory.calculation_status = "partial";
    expect(() => validateRecipeNutritionSnapshot(contradictory)).toThrowError(
      expect.objectContaining({ code: "INVALID_SNAPSHOT_STATUS" }),
    );
  });

  it("requires canonical exact-tuple dedupe and null-first Unicode ordinal source ordering", () => {
    const invalid = completeCalculation();
    invalid.sources = [
      { ...SOURCE, provider: "a-provider", data_basis_date: "2026-01-01" },
      { ...SOURCE, provider: "Z-provider", data_basis_date: null },
      { ...SOURCE, provider: "Z-provider", data_basis_date: null },
    ];

    expect(() => validateRecipeNutritionSnapshot(invalid)).toThrowError(
      expect.objectContaining({ code: "NON_CANONICAL_SNAPSHOT_SOURCES" }),
    );
  });

  it("projects only the pinned snapshot payload without rebuilding live source relations", () => {
    const row: RecipeNutritionSnapshotRow = {
      id: "snapshot-1",
      base_servings: 2,
      scalable_values_json: completeCalculation().scalable_values,
      fixed_values_json: completeCalculation().fixed_values,
      nutrient_status_json: completeCalculation().values,
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings_json: [],
      sources_json: [SOURCE],
      calculated_at: "2026-07-16T00:00:00.000Z",
    };

    expect(mapRecipeNutritionSnapshot(row)).toEqual({
      basis: { amount: 2, unit: "serving" },
      base_servings: 2,
      values: row.nutrient_status_json,
      scalable_values: row.scalable_values_json,
      fixed_values: row.fixed_values_json,
      calculation_status: "complete",
      calculation_quality: "direct",
      availability_reason: null,
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings: [],
      sources: [SOURCE],
      snapshot_id: "snapshot-1",
      calculated_at: "2026-07-16T00:00:00.000Z",
    });
  });

  it("projects optional-only partial data without downgrading it to unavailable", () => {
    const calculation = optionalOnlyCalculation();
    const row: RecipeNutritionSnapshotRow = {
      id: "snapshot-optional",
      base_servings: calculation.base_servings,
      scalable_values_json: calculation.scalable_values,
      fixed_values_json: calculation.fixed_values,
      nutrient_status_json: calculation.values,
      calculation_status: "partial",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings_json: [],
      sources_json: [SOURCE],
      calculated_at: "2026-07-16T00:00:00.000Z",
    };

    expect(mapRecipeNutritionSnapshot(row)).toMatchObject({
      calculation_status: "partial",
      calculation_quality: "direct",
      values: { sugars_g: expect.objectContaining({ amount: 3, status: "complete" }) },
      sources: [SOURCE],
    });
  });

  it("throws for semantically malformed persisted rows so the API can fail closed", () => {
    const calculation = completeCalculation();
    const valid: RecipeNutritionSnapshotRow = {
      id: "snapshot-malformed",
      base_servings: 2,
      scalable_values_json: calculation.scalable_values,
      fixed_values_json: calculation.fixed_values,
      nutrient_status_json: calculation.values,
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings_json: [],
      sources_json: [SOURCE],
      calculated_at: "2026-07-16T00:00:00.000Z",
    };
    const extraVector = structuredClone(valid);
    (extraVector.scalable_values_json as Record<string, number>).unknown = 1;
    const contradictoryStatus = structuredClone(valid);
    contradictoryStatus.calculation_status = "partial";
    const invalidWarning = structuredClone(valid);
    invalidWarning.warnings_json = ["MISSING_INGREDIENT_NUTRITION"];
    const duplicateSources = structuredClone(valid);
    duplicateSources.sources_json = [SOURCE, SOURCE];
    const extraValueField = structuredClone(valid);
    (extraValueField.nutrient_status_json.energy_kcal as unknown as Record<string, unknown>).raw = true;

    for (const row of [
      extraVector,
      contradictoryStatus,
      invalidWarning,
      duplicateSources,
      extraValueField,
    ]) {
      expect(() => mapRecipeNutritionSnapshot(row)).toThrowError(
        expect.objectContaining({ code: "INVALID_SNAPSHOT_PROJECTION" }),
      );
    }
  });
});
