// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeNutritionCard } from "@/components/recipe/recipe-nutrition-card";
import { buildRecipeNutritionDisplay } from "@/lib/nutrition/recipe-nutrition-display";
import type { RecipeNutrition, RecipeNutritionValue } from "@/types/recipe";

const COMPLETE_VALUES = {
  energy_kcal: value(800),
  carbohydrate_g: value(100),
  protein_g: value(40),
  fat_g: value(20),
  sodium_mg: value(1_200),
};

afterEach(() => {
  cleanup();
});

function value(amount: number): RecipeNutritionValue {
  return {
    amount,
    known_amount: amount,
    status: "complete",
    display_mode: "total",
  };
}

function buildNutrition(
  overrides: Partial<RecipeNutrition> = {},
): RecipeNutrition {
  return {
    basis: { amount: 2, unit: "serving" },
    base_servings: 2,
    values: COMPLETE_VALUES,
    scalable_values: {
      energy_kcal: 600,
      carbohydrate_g: 80,
      protein_g: 32,
      fat_g: 16,
      sodium_mg: 900,
    },
    fixed_values: {
      energy_kcal: 200,
      carbohydrate_g: 20,
      protein_g: 8,
      fat_g: 4,
      sodium_mg: 300,
    },
    calculation_status: "complete",
    calculation_quality: "direct",
    availability_reason: null,
    reflected_ingredient_count: 4,
    target_ingredient_count: 4,
    warnings: [],
    sources: [],
    snapshot_id: "snapshot-1",
    calculated_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function renderCard(
  nutrition: RecipeNutrition,
  {
    isRefreshing = false,
    onRetry = vi.fn(),
    selectedServings = 4,
  }: {
    isRefreshing?: boolean;
    onRetry?: () => void;
    selectedServings?: number;
  } = {},
) {
  render(
    <RecipeNutritionCard
      isRefreshing={isRefreshing}
      nutrition={nutrition}
      onRetry={onRetry}
      selectedServings={selectedServings}
    />,
  );
}

describe("recipe nutrition display", () => {
  it("renders calories and macros as a graph while keeping per-serving calories visible", () => {
    renderCard(buildNutrition());

    expect(screen.getByLabelText("레시피 영양성분")).toBeTruthy();
    expect(screen.queryByText("직접 계산")).toBeNull();
    expect(screen.queryByText("예상값")).toBeNull();
    expect(screen.queryByText("1인분 기준 예상 영양")).toBeNull();
    expect(screen.getByText("4인분")).toBeTruthy();
    expect(screen.getByText("1,400 kcal")).toBeTruthy();
    expect(screen.getByText(/1인분 400 kcal/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "탄수화물 단백질 지방 비율" })).toBeTruthy();
    expect(screen.getByText("탄")).toBeTruthy();
    expect(screen.getByText("단")).toBeTruthy();
    expect(screen.getByText("지")).toBeTruthy();
    expect(screen.getByText("180 g")).toBeTruthy();
    expect(screen.getByText("72 g")).toBeTruthy();
    expect(screen.getByText("36 g")).toBeTruthy();
  });

  it("moves sodium and optional nutrients behind nutrition details", async () => {
    renderCard(
      buildNutrition({
        values: {
          ...COMPLETE_VALUES,
          sugars_g: value(12),
          fiber_g: {
            amount: null,
            known_amount: null,
            status: "unavailable",
            display_mode: null,
          },
        },
        scalable_values: {
          ...buildNutrition().scalable_values,
          sugars_g: 8,
        },
        fixed_values: {
          ...buildNutrition().fixed_values,
          sugars_g: 4,
        },
      }),
    );

    expect(screen.queryByRole("table", { name: "예상 영양성분" })).toBeNull();

    await userEvent.click(screen.getByText("영양성분 더 보기"));

    const optionalTable = screen.getByRole("table", { name: "추가 영양성분" });
    const sodium = within(optionalTable).getByRole("row", { name: /나트륨/ });
    expect(within(sodium).getByText("600 mg")).toBeTruthy();
    expect(within(sodium).getByText("2,100 mg")).toBeTruthy();

    const sugars = within(optionalTable).getByRole("row", { name: /당류/ });
    expect(within(sugars).getByText("6 g")).toBeTruthy();
    expect(within(sugars).getByText("20 g")).toBeTruthy();
    expect(within(optionalTable).queryByRole("row", { name: /식이섬유/ })).toBeNull();
  });

  it("keeps partial values truthful in the graph and detail table", async () => {
    renderCard(
      buildNutrition({
        calculation_status: "partial",
        calculation_quality: "estimated",
        values: {
          ...COMPLETE_VALUES,
          energy_kcal: {
            amount: null,
            known_amount: 500,
            status: "partial",
            display_mode: "minimum",
          },
          sodium_mg: {
            amount: null,
            known_amount: 730,
            status: "partial",
            display_mode: "minimum",
          },
        },
        scalable_values: {
          energy_kcal: 400,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
          sodium_mg: 680,
        },
        fixed_values: {
          energy_kcal: 100,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 50,
        },
      }),
    );

    expect(screen.queryByText("환산값 포함 · 예상치")).toBeNull();
    expect(screen.getByText("최소 900 kcal")).toBeTruthy();
    expect(screen.getByText(/1인분 최소 250 kcal/)).toBeTruthy();

    await userEvent.click(screen.getByText("영양성분 더 보기"));
    const sodium = screen.getByRole("row", { name: /나트륨/ });
    expect(within(sodium).getByText("최소 365 mg")).toBeTruthy();
    expect(within(sodium).getByText("최소 1,410 mg")).toBeTruthy();
  });

  it("does not render the old explanatory warning copy", () => {
    renderCard(buildNutrition({ warnings: ["UNIT_CONVERSION_MISSING"] }));

    expect(screen.queryByText(/재료 양은 손질 후/)).toBeNull();
    expect(screen.queryByText(/조리 과정에서 달라지는 영양 손실/)).toBeNull();
    expect(screen.queryByText(/재료 단위를 무게로 정확히/)).toBeNull();
    expect(screen.queryByText("UNIT_CONVERSION_MISSING")).toBeNull();
  });

  it("shows normal preparing and retry states without inventing zero values", async () => {
    renderCard(
      buildNutrition({
        values: unavailableValues(),
        scalable_values: undefined,
        fixed_values: undefined,
        calculation_status: "unavailable",
        calculation_quality: null,
        availability_reason: "missing",
        reflected_ingredient_count: undefined,
        target_ingredient_count: undefined,
      }),
    );

    expect(screen.getByText("영양 정보를 준비하고 있어요")).toBeTruthy();
    expect(screen.queryByText(/0 kcal/)).toBeNull();
    cleanup();

    const onRetry = vi.fn();
    renderCard(
      buildNutrition({
        values: unavailableValues(),
        scalable_values: undefined,
        fixed_values: undefined,
        calculation_status: "unavailable",
        calculation_quality: null,
        availability_reason: "temporarily_unavailable",
      }),
      { onRetry },
    );

    await userEvent.click(screen.getByRole("button", { name: "영양 정보 다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a card-only skeleton while nutrition is refreshing", () => {
    renderCard(
      buildNutrition({ availability_reason: "temporarily_unavailable" }),
      { isRefreshing: true },
    );

    expect(screen.getByTestId("recipe-nutrition-loading-skeleton")).toBeTruthy();
    expect(screen.queryByText("400 kcal")).toBeNull();
  });

  it("fails closed for a missing vector key instead of filling it with zero", () => {
    const display = buildRecipeNutritionDisplay(
      buildNutrition({
        fixed_values: {
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 300,
        },
      }),
      4,
    );

    expect(display.nutrients[0]).toMatchObject({
      code: "energy_kcal",
      perServingText: "400 kcal",
      selectedTotalText: "정보 준비 중",
    });
  });

  it("fails closed when base servings is absent or invalid", () => {
    for (const baseServings of [undefined, 0, Number.NaN]) {
      const display = buildRecipeNutritionDisplay(
        buildNutrition({ base_servings: baseServings }),
        4,
      );

      expect(display.hasValidBaseServings).toBe(false);
      expect(display.nutrients.every((nutrient) => (
        nutrient.perServingText === "정보 준비 중" &&
        nutrient.selectedTotalText === "정보 준비 중"
      ))).toBe(true);
    }
  });
});

function unavailableValues(): Record<string, RecipeNutritionValue> {
  return Object.fromEntries(
    Object.keys(COMPLETE_VALUES).map((code) => [
      code,
      {
        amount: null,
        known_amount: null,
        status: "unavailable",
        display_mode: null,
      },
    ]),
  );
}
