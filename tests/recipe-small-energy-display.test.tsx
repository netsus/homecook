// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPlannerNutritionEnergy } from "@/lib/planner/planner-nutrition-presentation";
import { formatProductExpectedEnergy } from "@/lib/planner/product-planner-entry-presentation";
import { MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
import { formatMealLogEnergy } from "@/lib/planner/meal-log-nutrition-presentation";
import { RecipeNutritionCard } from "@/components/recipe/recipe-nutrition-card";
import type { RecipeNutrition } from "@/types/recipe";
const value = (amount: number | null, partial = false) => ({ amount: partial ? null : amount, known_amount: amount, status: amount === null ? "unavailable" as const : partial ? "partial" as const : "complete" as const, display_mode: null });
afterEach(cleanup);
describe("small energy display without changing nutrition", () => {
  it.each([[0, "0 kcal"], [0.5, "5 kcal 미만"], [4.99, "5 kcal 미만"], [5, "5 kcal"], [null, "정보 준비 중"]])("formats %s before rounding", (amount, expected) => {
    expect(formatPlannerNutritionEnergy(value(amount as number | null))).toBe(expected);
  });
  it("qualifies incomplete small energy instead of claiming an upper bound", () => {
    expect(formatPlannerNutritionEnergy(value(0, true))).toBe("확인된 열량 0 kcal");
    expect(formatPlannerNutritionEnergy(value(4, true))).toBe("확인된 열량 5 kcal 미만");
    expect(formatProductExpectedEnergy(value(0.5, true))).toBe("예상 열량 · 확인된 열량 5 kcal 미만");
    expect(formatProductExpectedEnergy(value(4.99))).toBe("예상 열량 5 kcal 미만");
  });
  it("keeps missing meal energy distinct from measured zero", () => {
    const nutrition = { calculation_status: "complete" as const, calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 };
    expect(formatMealLogEnergy(nutrition)).toBe("0 kcal");
    expect(formatMealLogEnergy({ ...nutrition, calories_kcal: null, calculation_status: "unavailable" })).toBe("정보 없음");
  });
  it("renders incomplete recipe totals with a visible qualification", () => {
    const nutrition: RecipeNutrition = { basis: { amount: 1, unit: "serving" }, base_servings: 1, values: { energy_kcal: value(0.5, true) }, scalable_values: { energy_kcal: 0.5 }, fixed_values: { energy_kcal: 0 }, calculation_status: "partial", calculation_quality: "direct", availability_reason: null, warnings: [], sources: [] };
    render(<RecipeNutritionCard nutrition={nutrition} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.getByText("확인된 열량 5 kcal 미만")).toBeTruthy();
    expect(screen.getByText("1인분 확인된 열량 5 kcal 미만")).toBeTruthy();
  });
  it("renders saved meal energy with the unit once and preserves macro values", () => {
    const nutrition = { calculation_status: "partial" as const, calories_kcal: 0.5, carbohydrate_g: 2, protein_g: 1, fat_g: 1, sodium_mg: 0.04 };
    const { container } = render(<MealLogNutritionChart nutrition={nutrition} />);
    expect(screen.getByText("확인된 열량 5 kcal 미만")).toBeTruthy();
    expect(container.textContent).not.toContain("미만kcal");
    expect(nutrition.sodium_mg).toBe(0.04);
  });
  it("uses the final recipe total so ten 4 kcal portions display 40 kcal", () => {
    const nutrition: RecipeNutrition = { basis: { amount: 1, unit: "serving" }, base_servings: 1, values: { energy_kcal: value(4) }, scalable_values: { energy_kcal: 4 }, fixed_values: { energy_kcal: 0 }, calculation_status: "complete", calculation_quality: "direct", availability_reason: null, warnings: [], sources: [] };
    render(<RecipeNutritionCard nutrition={nutrition} selectedServings={10} onRetry={vi.fn()} />);
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "40kcal")).toBeTruthy();
    expect(screen.getByText("1인분 5 kcal 미만")).toBeTruthy();
    expect(nutrition.scalable_values?.energy_kcal).toBe(4);
  });
});

describe("recipe quantity-conversion explanation", () => {
  const nutrition: RecipeNutrition = { basis: { amount: 1, unit: "serving" }, base_servings: 1, values: { energy_kcal: value(10), carbohydrate_g: value(2.5), protein_g: value(0), fat_g: value(0) }, scalable_values: { energy_kcal: 10, carbohydrate_g: 2.5, protein_g: 0, fat_g: 0 }, fixed_values: { energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0 }, calculation_status: "complete", calculation_quality: "estimated", availability_reason: null, warnings: [], sources: [] };
  it.each(["PIECE_WEIGHT_CONVERSION_USED", "REPRESENTATIVE_VOLUME_CONVERSION_USED"])("explains representative weight only when %s was used", warning => {
    render(<RecipeNutritionCard nutrition={{ ...nutrition, warnings: [warning] }} selectedServings={1} onRetry={vi.fn()} />);
    const explanation = screen.getByText("개수·부피로 입력한 재료는 승인된 대표 중량으로 환산했어요. 실제 무게와 다를 수 있어요.");
    expect(explanation.closest("details")).toBeTruthy();
  });
  it("keeps AI nutrition provenance separate from quantity-conversion evidence", () => {
    render(<RecipeNutritionCard nutrition={{ ...nutrition, warnings: ["AI_NUTRITION_ESTIMATE_USED"] }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
    expect(screen.queryByText(/승인된 대표 중량/)).toBeNull();
  });
});
