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
  it("shows complete values per serving and scales only the scalable vector", () => {
    renderCard(buildNutrition());

    expect(
      screen.getByRole("heading", { name: "1인분 기준 예상 영양" }),
    ).toBeTruthy();
    expect(screen.getByText("직접 계산")).toBeTruthy();

    const energy = screen.getByRole("row", { name: /열량/ });
    expect(within(energy).getByText("400 kcal")).toBeTruthy();
    expect(within(energy).getByText("1,400 kcal")).toBeTruthy();
    expect(within(energy).queryByText("1,600 kcal")).toBeNull();
  }, 10_000);

  it("labels estimated and mixed quality as an estimate", () => {
    const estimated = buildNutrition({ calculation_quality: "estimated" });
    const { rerender } = render(
      <RecipeNutritionCard
        nutrition={estimated}
        onRetry={vi.fn()}
        selectedServings={2}
      />,
    );

    expect(screen.getByText("환산값 포함 · 예상치")).toBeTruthy();
    expect(
      screen.getByText("재료 투입량과 일반 계량값을 기준으로 계산한 예상치예요."),
    ).toBeTruthy();

    rerender(
      <RecipeNutritionCard
        nutrition={buildNutrition({ calculation_quality: "mixed" })}
        onRetry={vi.fn()}
        selectedServings={2}
      />,
    );
    expect(screen.getByText("직접값과 환산값 혼합 · 예상치")).toBeTruthy();
  });

  it("shows partial nutrients as minimum values and reports reflected ingredients", () => {
    renderCard(
      buildNutrition({
        calculation_status: "partial",
        calculation_quality: "estimated",
        reflected_ingredient_count: 2,
        target_ingredient_count: 4,
        values: {
          ...COMPLETE_VALUES,
          energy_kcal: {
            amount: null,
            known_amount: 500,
            status: "partial",
            display_mode: "minimum",
          },
        },
        scalable_values: {
          energy_kcal: 400,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
          sodium_mg: 900,
        },
        fixed_values: {
          energy_kcal: 100,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 300,
        },
        warnings: ["UNIT_CONVERSION_MISSING"],
      }),
    );

    const energy = screen.getByRole("row", { name: /열량/ });
    expect(within(energy).getByText("최소 250 kcal")).toBeTruthy();
    expect(within(energy).getByText("최소 900 kcal")).toBeTruthy();
    expect(screen.getByText("재료 4개 중 2개 반영")).toBeTruthy();
    expect(
      screen.getByText("일부 값은 확인된 재료만 합친 최소값이에요."),
    ).toBeTruthy();
  });

  it("uses the locked partial sodium example without scaling the fixed part", () => {
    renderCard(
      buildNutrition({
        calculation_status: "partial",
        values: {
          ...COMPLETE_VALUES,
          sodium_mg: {
            amount: null,
            known_amount: 730,
            status: "partial",
            display_mode: "minimum",
          },
        },
        scalable_values: {
          energy_kcal: 600,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
          sodium_mg: 680,
        },
        fixed_values: {
          energy_kcal: 200,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 50,
        },
      }),
    );

    const sodium = screen.getByRole("row", { name: /나트륨/ });
    expect(within(sodium).getByText("최소 365 mg")).toBeTruthy();
    expect(within(sodium).getByText("최소 1,410 mg")).toBeTruthy();
  });

  it("treats a missing snapshot as a normal preparing state without retry", () => {
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
        warnings: ["RECIPE_NUTRITION_SNAPSHOT_MISSING"],
      }),
    );

    expect(screen.getByText("영양 정보를 준비하고 있어요")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "영양 정보 다시 시도" }),
    ).toBeNull();
    expect(screen.queryByText(/0 kcal/)).toBeNull();
  });

  it("treats a normally read unavailable snapshot as preparing without retry", () => {
    renderCard(
      buildNutrition({
        values: unavailableValues(),
        scalable_values: {},
        fixed_values: {},
        calculation_status: "unavailable",
        calculation_quality: null,
        availability_reason: null,
      }),
    );

    expect(screen.getByText("정확히 계산할 수 있는 재료 정보가 아직 부족해요.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "영양 정보 다시 시도" }),
    ).toBeNull();
  });

  it("offers nutrition-only retry for a temporary failure", async () => {
    const onRetry = vi.fn();
    renderCard(
      buildNutrition({
        values: unavailableValues(),
        scalable_values: undefined,
        fixed_values: undefined,
        calculation_status: "unavailable",
        calculation_quality: null,
        availability_reason: "temporarily_unavailable",
        warnings: [],
      }),
      { onRetry },
    );

    expect(
      screen.getByText("영양 정보를 잠시 불러오지 못했어요"),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "영양 정보 다시 시도" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a card-only skeleton while nutrition is refreshing", () => {
    renderCard(
      buildNutrition({ availability_reason: "temporarily_unavailable" }),
      { isRefreshing: true },
    );

    expect(
      screen.getByTestId("recipe-nutrition-loading-skeleton"),
    ).toBeTruthy();
    expect(screen.queryByText("400 kcal")).toBeNull();
  });

  it("never converts nullable or unavailable nutrients into zero", () => {
    renderCard(
      buildNutrition({
        calculation_status: "partial",
        values: {
          ...COMPLETE_VALUES,
          sodium_mg: {
            amount: null,
            known_amount: null,
            status: "unavailable",
            display_mode: null,
          },
        },
        scalable_values: {
          energy_kcal: 600,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
        },
        fixed_values: {
          energy_kcal: 200,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
        },
      }),
    );

    const sodium = screen.getByRole("row", { name: /나트륨/ });
    expect(within(sodium).getAllByText("정보 준비 중")).toHaveLength(2);
    expect(within(sodium).queryByText(/0 mg/)).toBeNull();
  });

  it("keeps an observed complete zero as a real value", () => {
    renderCard(
      buildNutrition({
        values: {
          ...COMPLETE_VALUES,
          sodium_mg: value(0),
        },
        scalable_values: {
          energy_kcal: 600,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
          sodium_mg: 0,
        },
        fixed_values: {
          energy_kcal: 200,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 0,
        },
      }),
    );

    const sodium = screen.getByRole("row", { name: /나트륨/ });
    expect(within(sodium).getAllByText("0 mg")).toHaveLength(2);
  });

  it("shows only the six public source fields and hides extra provider data", () => {
    const sourceWithSecret = {
      provider: "식품영양 공공DB",
      dataset: "국가표준식품성분표",
      source_version: "2026.1",
      data_basis_date: "2026-01-01",
      license: "공공누리 제1유형",
      source_url: "https://example.com/nutrition",
      api_key: "do-not-render",
      raw_provider_row: "private-row",
    };

    renderCard(buildNutrition({ sources: [sourceWithSecret] }));

    expect(screen.getByText(/식품영양 공공DB/)).toBeTruthy();
    expect(screen.getByText(/2026-01-01/)).toBeTruthy();
    expect(screen.getByText(/공공누리 제1유형/)).toBeTruthy();
    expect(screen.queryByText(/do-not-render/)).toBeNull();
    expect(screen.queryByText(/private-row/)).toBeNull();
    const sourceLink = screen.getByRole("link", { name: "원문" });
    expect(sourceLink.getAttribute("href")).toBe("https://example.com/nutrition");
    expect(sourceLink.className).toContain("min-h-11");
    expect(sourceLink.className).toContain("min-w-11");
  });

  it("shows only observed optional nutrients inside an accessible expandable section", async () => {
    renderCard(
      buildNutrition({
        values: {
          ...COMPLETE_VALUES,
          sugars_g: value(12),
          saturated_fat_g: {
            amount: null,
            known_amount: 6,
            status: "partial",
            display_mode: "minimum",
          },
          fiber_g: {
            amount: null,
            known_amount: null,
            status: "unavailable",
            display_mode: null,
          },
        },
        scalable_values: {
          energy_kcal: 600,
          carbohydrate_g: 80,
          protein_g: 32,
          fat_g: 16,
          sodium_mg: 900,
          sugars_g: 8,
          saturated_fat_g: 4,
        },
        fixed_values: {
          energy_kcal: 200,
          carbohydrate_g: 20,
          protein_g: 8,
          fat_g: 4,
          sodium_mg: 300,
          sugars_g: 4,
        },
      }),
    );

    const optionalSummary = screen.getByText("영양성분 더 보기");
    const optionalDetails = optionalSummary.closest("details");
    expect(optionalDetails?.hasAttribute("open")).toBe(false);
    expect(screen.getByTestId("optional-nutrition-disclosure-icon")).toBeTruthy();

    await userEvent.click(optionalSummary);
    expect(optionalDetails?.hasAttribute("open")).toBe(true);

    const sugars = screen.getByRole("row", { name: /당류/ });
    expect(within(sugars).getByText("6 g")).toBeTruthy();
    expect(within(sugars).getByText("20 g")).toBeTruthy();

    const saturatedFat = screen.getByRole("row", { name: /포화지방/ });
    expect(within(saturatedFat).getByText("최소 3 g")).toBeTruthy();
    expect(within(saturatedFat).getByText("정보 준비 중")).toBeTruthy();
    expect(screen.queryByRole("row", { name: /식이섬유/ })).toBeNull();

    const coreTable = screen.getByRole("table", { name: "예상 영양성분" });
    for (const coreLabel of ["열량", "탄수화물", "단백질", "지방", "나트륨"]) {
      expect(within(coreTable).getByRole("row", { name: new RegExp(coreLabel) })).toBeTruthy();
    }
  });

  it("keeps an observed optional zero but hides absent optional values", async () => {
    renderCard(
      buildNutrition({
        values: {
          ...COMPLETE_VALUES,
          sugars_g: value(0),
        },
        scalable_values: {
          ...buildNutrition().scalable_values,
          sugars_g: 0,
        },
        fixed_values: {
          ...buildNutrition().fixed_values,
          sugars_g: 0,
        },
      }),
    );

    await userEvent.click(screen.getByText("영양성분 더 보기"));
    const sugars = screen.getByRole("row", { name: /당류/ });
    expect(within(sugars).getAllByText("0 g")).toHaveLength(2);
    expect(screen.queryByRole("row", { name: /포화지방/ })).toBeNull();
    expect(screen.queryByRole("row", { name: /식이섬유/ })).toBeNull();
  });

  it.each([
    ["NUTRITION_PROFILE_MISSING", "영양 정보가 연결되지 않은 재료가 있어 일부 값이 빠질 수 있어요."],
    ["NUTRIENT_VALUE_MISSING", "연결된 재료에 일부 영양성분 값이 없어 해당 값은 최소치일 수 있어요."],
    ["UNIT_CONVERSION_MISSING", "재료 단위를 무게로 정확히 바꾸지 못해 일부 값이 빠질 수 있어요."],
    ["TO_TASTE_EXCLUDED", "‘약간’, ‘적당량’처럼 양이 정해지지 않은 재료는 계산에서 제외했어요."],
    ["REPRESENTATIVE_VOLUME_CONVERSION_USED", "부피 단위는 승인된 계량값으로 무게를 환산해 계산했어요."],
    ["PIECE_WEIGHT_CONVERSION_USED", "개수 단위는 승인된 재료 무게 기준으로 바꿔 계산했어요."],
    ["UNKNOWN_WARNING", "일부 영양값에는 추가 확인이 필요한 계산 조건이 있어요."],
  ])("maps %s to truthful user copy without exposing the raw code", (warning, copy) => {
    renderCard(buildNutrition({ warnings: [warning] }));

    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByText(warning)).toBeNull();
  });

  it("explains edible input amounts and the cooking-loss limitation in plain Korean", () => {
    renderCard(buildNutrition());

    expect(
      screen.getByText("재료 양은 손질 후 실제 요리에 넣는 먹을 수 있는 부분 기준이에요."),
    ).toBeTruthy();
    expect(
      screen.getByText("조리 과정에서 달라지는 영양 손실은 반영하지 않았어요."),
    ).toBeTruthy();
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
