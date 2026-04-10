import { describe, expect, it } from "vitest";

import {
  buildSlice05PerformanceDataset,
  SLICE_05_PERFORMANCE_DEFAULTS,
} from "../scripts/lib/slice-05-performance-fixture.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("slice 05 performance fixture", () => {
  it("builds deterministic long-run planner data for repeated range shifts", () => {
    const dataset = buildSlice05PerformanceDataset({
      baseDate: "2026-04-09",
      recipeCount: 24,
    });

    expect(dataset.columns.map((column) => column.name)).toEqual([
      "아침",
      "점심",
      "간식",
      "저녁",
    ]);
    expect(dataset.recipes).toHaveLength(24);
    expect(dataset.meals).toHaveLength(286);
    expect(dataset.scenario.initialRangeStartDate).toBe("2026-04-09");
    expect(dataset.scenario.initialRangeEndDate).toBe("2026-04-15");
    expect(dataset.scenario.initialMealCount).toBe(36);
    expect(dataset.scenario.shifts).toHaveLength(
      SLICE_05_PERFORMANCE_DEFAULTS.shiftDirections.length,
    );
    expect(
      dataset.scenario.shifts.every((shift) => shift.expectedMealCount > 0),
    ).toBe(true);
    expect(dataset.scenario.lastColumnName).toBe("저녁");
    expect(dataset.scenario.loginButtonLabel).toBe("다른 테스트 계정으로 시작");
    expect(
      [
        ...dataset.columns.map((column) => column.id),
        ...dataset.recipes.map((recipe) => recipe.id),
        ...dataset.meals.map((meal) => meal.id),
      ].every((id) => UUID_PATTERN.test(id)),
    ).toBe(true);
  });
});
