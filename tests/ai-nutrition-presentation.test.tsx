// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealAddRecipePreview } from "@/components/planner/meal-add-recipe-preview";
import { MOCK_RECIPE_DETAIL } from "@/lib/mock/recipes";
import { RecipeNutritionCard } from "@/components/recipe/recipe-nutrition-card";
import { PlannedMealCard } from "@/components/planner/planned-meal-card";
import { MealPinnedNutrition } from "@/components/planner/meal-pinned-nutrition";
import { MealNutritionSummary, PlannerDayNutritionSummary, PlannerWeekNutritionSummary } from "@/components/planner/planner-nutrition-summary";
import { MealLogMacroBar, MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
import { isMealLogNutritionEvidence } from "@/lib/server/meal-log";
import { projectMealLogNutritionPreview } from "@/lib/server/meal-log-nutrition-preview";
import type { RecipeNutrition } from "@/types/recipe";
import type { PlannerNutritionAggregate } from "@/types/planner-nutrition";

const previewApi = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api/recipe", () => ({ fetchRecipePreview: previewApi.fetch }));

const warning = "AI_NUTRITION_ESTIMATE_USED";
const value = { amount: 100, known_amount: 100, status: "complete" as const, display_mode: "total" as const };
const values = { energy_kcal: value, carbohydrate_g: value, protein_g: value, fat_g: value, sodium_mg: value };
const recipe: RecipeNutrition = {
  basis: { amount: 1, unit: "serving" }, base_servings: 1, values,
  scalable_values: { energy_kcal: 100, carbohydrate_g: 100, protein_g: 100, fat_g: 100, sodium_mg: 100 },
  fixed_values: { energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 },
  calculation_status: "complete", calculation_quality: "direct", availability_reason: null,
  warnings: [warning], sources: [],
};
const planner: PlannerNutritionAggregate = { basis: { amount: 1, unit: "range" }, values,
  calculation_status: "complete", calculation_quality: "direct", incomplete_entry_count: 0,
  warnings: [warning], sources: [] };
const historicalMeal = { calculation_status: "complete" as const, calories_kcal: 100, carbohydrate_g: 10, protein_g: 5, fat_g: 3, sodium_mg: 4 };
const meal = { ...historicalMeal, contains_ai_estimate: true };
afterEach(cleanup);

describe("AI nutrition provenance is separate from completeness and quantity conversion", () => {
  it.each(["app", "web"] as const)("labels complete %s recipe estimates without changing numbers", variant => {
    render(<RecipeNutritionCard nutrition={recipe} selectedServings={1} onRetry={vi.fn()} variant={variant} />);
    expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
    expect(screen.getByText("100 kcal")).toBeTruthy();
  });
  it("does not describe partial AI recipe values as only verified values", () => {
    render(<RecipeNutritionCard nutrition={{ ...recipe, calculation_status: "partial" }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.getByText(/^AI 추정값 포함/)).toBeTruthy();
    expect(screen.getByText(/일부 영양정보가 빠진 추정값/)).toBeTruthy();
    expect(screen.queryByText(/확인된 값만/)).toBeNull();
  });
  it("does not call ordinary quantity conversion an AI estimate", () => {
    render(<RecipeNutritionCard nutrition={{ ...recipe, warnings: [], calculation_quality: "estimated" }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.queryByText(/AI 추정/)).toBeNull();
  });
  it.each(["meal", "day", "week"])("keeps the AI label visible in the %s aggregate", kind => {
    const props = { nutrition: planner, error: null, isRefreshing: false, onRetry: vi.fn(), status: "ready" as const };
    render(kind === "meal" ? <MealNutritionSummary {...props} /> : kind === "day" ? <PlannerDayNutritionSummary nutrition={planner} /> : <PlannerWeekNutritionSummary {...props} days={[]} />);
    expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
  });
  it("reads the pinned-plan provenance flag and does not claim verified-only chart values", () => {
    render(<MealPinnedNutrition nutrition={{ plannedServings: 1, values, containsAiEstimate: true }} servings={1} title="식사" />);
    expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /확인된/ })).toBeNull();
  });
  it.each([true, false])("labels a saved meal/chart and preview bar (complete=%s)", complete => {
    const nutrition = { ...meal, calculation_status: complete ? "complete" as const : "partial" as const };
    const view = render(<MealLogNutritionChart nutrition={nutrition} compact />);
    expect(screen.getByText(/AI 추정값 포함/)).toBeTruthy();
    expect(screen.queryByText("확인된 정보 기준")).toBeNull();
    if (!complete) expect(screen.getByText(/일부 영양정보가 빠진 추정값/)).toBeTruthy();
    view.unmount();
    render(<MealLogMacroBar nutrition={nutrition} thin />);
    expect(screen.getByText(/AI 추정값 포함/)).toBeTruthy();
  });
  it("leaves historical evidence without the optional flag unlabelled", () => {
    const historical = historicalMeal;
    render(<MealLogNutritionChart nutrition={historical} />);
    expect(screen.queryByText(/AI 추정/)).toBeNull();
  });
  it("accepts only an optional boolean evidence flag and preserves it in the preview", () => {
    const historical = historicalMeal;
    expect(isMealLogNutritionEvidence(historical)).toBe(true);
    expect(isMealLogNutritionEvidence(meal)).toBe(true);
    expect(isMealLogNutritionEvidence({ ...meal, contains_ai_estimate: false })).toBe(true);
    for (const invalid of [null, undefined, 1, "true"]) {
      expect(isMealLogNutritionEvidence({ ...meal, contains_ai_estimate: invalid })).toBe(false);
    }
    expect(isMealLogNutritionEvidence({ ...meal, unknown_flag: true })).toBe(false);
    const input = { source: { type: "ingredient" as const, id: "11111111-1111-4111-8111-111111111111" }, quantity: { amount: 100, unit: "g" } };
    expect(projectMealLogNutritionPreview(meal, input)?.nutrition).toEqual(meal);
  });
});


it("shows pinned AI evidence in the actual plan card and hides it for stale servings", () => {
  const handlers = { onOpen: vi.fn(), onRecipe: vi.fn(), onDelete: vi.fn(), onStepDown: vi.fn(), onStepUp: vi.fn(), onAction: vi.fn(), onShopping: vi.fn() };
  const item = { id: "meal", recipe_id: "recipe", recipe_title: "볶음밥", recipe_thumbnail_url: null, planned_servings: 1, status: "registered" as const, is_leftover: false, revision: 1 };
  const props = { meal: item, nutrition: { plannedServings: 1, values, containsAiEstimate: true }, detailed: false, conflictError: null, isPending: false, ...handlers };
  const view = render(<PlannedMealCard {...props} />);
  expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
  view.rerender(<PlannedMealCard {...props} meal={{ ...item, planned_servings: 2 }} />);
  expect(screen.queryByText(/AI 추정값 포함/)).toBeNull();
});


it("labels AI values in the add-to-plan recipe preview", async () => {
  previewApi.fetch.mockResolvedValue({ ...MOCK_RECIPE_DETAIL, nutrition: { ...recipe, calculation_status: "partial" } });
  render(<MealAddRecipePreview recipeId="recipe" servings={1} />);
  expect(await screen.findByText(/AI 추정값 포함/)).toBeTruthy();
  expect(screen.getByText(/일부 영양정보가 빠진 추정값/)).toBeTruthy();
});
