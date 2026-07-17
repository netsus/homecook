import { describe, expect, it } from "vitest";

import {
  aggregatePlannerNutritionEntries,
  type PlannerNutritionEntryProjection,
} from "@/lib/server/planner-nutrition-summary";

const CORE = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

function completeValues(amount = 10) {
  return Object.fromEntries(CORE.map((code) => [code, {
    amount,
    known_amount: null,
    status: "complete" as const,
    display_mode: "total" as const,
  }])) as PlannerNutritionEntryProjection["values"];
}

function entry(
  id: string,
  overrides: Partial<PlannerNutritionEntryProjection> = {},
): PlannerNutritionEntryProjection {
  return {
    storage_key: `recipe:${id}`,
    plan_date: "2026-07-17",
    column_id: "column-a",
    values: completeValues(),
    calculation_quality: "direct",
    warnings: [],
    sources: [],
    ...overrides,
  };
}

describe("planner nutrition aggregate", () => {
  it("keeps an empty scope unavailable instead of inventing zero", () => {
    const result = aggregatePlannerNutritionEntries([]);

    expect(Object.keys(result.values)).toEqual(CORE);
    for (const value of Object.values(result.values)) {
      expect(value).toEqual({
        amount: null,
        known_amount: null,
        status: "unavailable",
        display_mode: null,
      });
    }
    expect(result).toMatchObject({
      basis: { amount: 1, unit: "range" },
      calculation_status: "unavailable",
      calculation_quality: null,
      incomplete_entry_count: 0,
      warnings: [],
      sources: [],
    });
  });

  it("preserves an observed complete zero as a real zero", () => {
    const result = aggregatePlannerNutritionEntries([
      entry("zero", { values: completeValues(0) }),
    ]);

    expect(result.values.energy_kcal).toEqual({
      amount: 0,
      known_amount: null,
      status: "complete",
      display_mode: "total",
    });
    expect(result.calculation_status).toBe("complete");
    expect(result.incomplete_entry_count).toBe(0);
  });

  it("returns a known minimum when complete, partial, and unavailable inputs mix", () => {
    const partialValues = completeValues(5);
    partialValues.energy_kcal = {
      amount: null,
      known_amount: 3,
      status: "partial",
      display_mode: "minimum",
    };
    partialValues.protein_g = {
      amount: null,
      known_amount: null,
      status: "unavailable",
      display_mode: null,
    };
    const unavailableValues = completeValues(0);
    unavailableValues.energy_kcal = {
      amount: null,
      known_amount: null,
      status: "unavailable",
      display_mode: null,
    };

    const result = aggregatePlannerNutritionEntries([
      entry("complete", { values: completeValues(10) }),
      entry("partial", { values: partialValues }),
      entry("unavailable", { values: unavailableValues }),
    ]);

    expect(result.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 13,
      status: "partial",
      display_mode: "minimum",
    });
    expect(result.values.protein_g).toEqual({
      amount: null,
      known_amount: 10,
      status: "partial",
      display_mode: "minimum",
    });
    expect(result.incomplete_entry_count).toBe(2);
    expect(result.calculation_status).toBe("partial");
  });

  it("merges quality independently from completeness", () => {
    expect(aggregatePlannerNutritionEntries([
      entry("a", { calculation_quality: "direct" }),
      entry("b", { calculation_quality: "direct" }),
    ]).calculation_quality).toBe("direct");

    expect(aggregatePlannerNutritionEntries([
      entry("a", { calculation_quality: "estimated" }),
      entry("b", { calculation_quality: "estimated" }),
    ]).calculation_quality).toBe("estimated");

    expect(aggregatePlannerNutritionEntries([
      entry("a", { calculation_quality: "direct" }),
      entry("b", { calculation_quality: "estimated" }),
    ]).calculation_quality).toBe("mixed");

    const unavailable = completeValues();
    for (const code of CORE) {
      unavailable[code] = {
        amount: null,
        known_amount: null,
        status: "unavailable",
        display_mode: null,
      };
    }
    expect(aggregatePlannerNutritionEntries([
      entry("none", { values: unavailable, calculation_quality: "direct" }),
    ]).calculation_quality).toBeNull();
  });

  it("dedupes warnings and exact six-field source tuples in stable null-first order", () => {
    const sourceNullVersion = {
      provider: "provider",
      dataset: "dataset",
      source_version: null,
      data_basis_date: null,
      license: null,
      source_url: null,
      raw_provider_row: "must-not-leak",
    };
    const sourceV1 = {
      provider: "provider",
      dataset: "dataset",
      source_version: "v1",
      data_basis_date: null,
      license: "public",
      source_url: "https://example.test/source",
    };
    const unsafe = {
      ...sourceV1,
      source_version: "unsafe",
      source_url: "https://example.test/source?serviceKey=secret",
    };

    const result = aggregatePlannerNutritionEntries([
      entry("a", {
        warnings: ["Z_WARNING", "A_WARNING"],
        sources: [sourceV1, sourceNullVersion, unsafe],
      }),
      entry("b", {
        warnings: ["A_WARNING"],
        sources: [sourceV1],
      }),
    ]);

    expect(result.warnings).toEqual(["A_WARNING", "Z_WARNING"]);
    expect(result.sources).toEqual([
      {
        provider: "provider",
        dataset: "dataset",
        source_version: null,
        data_basis_date: null,
        license: null,
        source_url: null,
      },
      sourceV1,
    ]);
    expect(Object.keys(result.sources[0]!)).toEqual([
      "provider",
      "dataset",
      "source_version",
      "data_basis_date",
      "license",
      "source_url",
    ]);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
