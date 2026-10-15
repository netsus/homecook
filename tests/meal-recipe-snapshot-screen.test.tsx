// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MealRecipeSnapshotScreen } from "@/components/planner/meal-recipe-snapshot-screen";
import type { CookingModeIngredient } from "@/types/cooking";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api/fetch-json", () => ({ fetchJson: mocks.fetch, isApiFetchError: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

it("keeps separately stored heat and duration visible in the saved recipe", async () => {
  mocks.fetch.mockResolvedValue({ meal_id: "meal", recipe_id: "recipe", snapshot_id: "pin", title: "저장한 찌개", planned_servings: 2, ingredients: [],
    steps: [{ step_number: 1, instruction: "끓여 주세요.", component_label: "국물", heat_level: "medium", duration_text: "10분", duration_seconds: 600 }] });
  render(<MealRecipeSnapshotScreen mealId="meal" />);
  expect(await screen.findByText("중불 · 10분")).toBeTruthy();
  expect(screen.getByRole("link", { name: "최신 레시피 보기" }).getAttribute("href")).toBe("/recipe/recipe");
  expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
});

const quantityRow: CookingModeIngredient = { ingredient_id: "salt", standard_name: "소금", amount: null, unit: null,
  ingredient_type: "QUANT", scalable: true, display_text: null };
it.each([
  { row: quantityRow, known: null, unknown: true },
  { row: { ...quantityRow, amount: 0, unit: "g" }, known: "0g", unknown: false },
  { row: { ...quantityRow, amount: 2 }, known: "2", unknown: true },
  { row: { ...quantityRow, unit: "g" }, known: "g", unknown: true },
  { row: { ...quantityRow, component_label: "고명" }, known: null, unknown: true },
  { row: { ...quantityRow, amount: 1, unit: "g", scalable: false, component_label: "고명" }, known: "1g", unknown: false },
  { row: { ...quantityRow, ingredient_type: "TO_TASTE" as const, component_label: "고명" }, known: "적당량", unknown: false },
])("shows only incomplete quantities as unconfirmed: $known", async ({ row, known, unknown }) => {
  mocks.fetch.mockResolvedValue({ meal_id: "meal", recipe_id: "recipe", snapshot_id: "pin", title: "저장한 재료 확인", planned_servings: 3,
    ingredients: [row], steps: [] });
  render(<MealRecipeSnapshotScreen mealId="meal" />);
  await screen.findByRole("heading", { name: "저장한 재료 확인" });
  const ingredients = within(screen.getByRole("region", { name: "재료" }));
  if (known !== null) expect(ingredients.getByText(known, { exact: true })).toBeTruthy();
  expect(Boolean(ingredients.queryByText("분량 확인 필요"))).toBe(unknown);
});

it("places exact B08 guidance with the unchanged stored instructions without claiming original servings", async () => {
  const instruction = "물 400mL를 넣고 180도에서 10분 동안 2번 나눠 조리해요.";
  mocks.fetch.mockResolvedValue({ meal_id: "meal", recipe_id: "recipe", snapshot_id: "pin", title: "저장한 조리법 확인", planned_servings: 3,
    ingredients: [{ ...quantityRow, amount: 600, unit: "mL", standard_name: "물" }],
    steps: [{ step_number: 1, instruction, heat_level: null, duration_text: null, duration_seconds: null, component_label: null }] });
  render(<MealRecipeSnapshotScreen mealId="meal" />);
  await screen.findByRole("heading", { name: "저장한 조리법 확인" });
  const steps = within(screen.getByRole("region", { name: "만들기" }));
  expect(steps.getByText("재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다")).toBeTruthy();
  expect(steps.getByText(instruction, { exact: true })).toBeTruthy();
  expect(screen.getByText("600mL", { exact: true })).toBeTruthy();
  expect(screen.getByText("이 계획에 저장한 내용 · 3인분")).toBeTruthy();
  expect(screen.queryByText(/원본.*인분/u)).toBeNull(); expect(screen.queryByRole("spinbutton")).toBeNull();
});

it.each([
  { amount: 1 / 3, unit: "L", display: "1/3L" },
  { amount: 3 / 14, unit: "kg", display: "0.214kg" },
])("uses the projected v4 quantity label without exposing a long decimal: $display", async ({ amount, unit, display }) => {
  const row = { ...quantityRow, standard_name: "고정 재료", amount, unit, display_text: `고정 재료 ${display}`,
    quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "L", numerator: "1", denominator: "3",
      normalized: { amount: 1000 / 3, unit: "ml" }, display_quantity: { amount: 1 / 3, unit: "L" }, quality: "direct", reason: null,
      evidence_ids: [], source_versions: [], batch_basis: null, context_sha256: "a".repeat(64) } };
  mocks.fetch.mockResolvedValue({ meal_id: "meal", recipe_id: "recipe", snapshot_id: "pin", title: "원량 유지", planned_servings: 3,
    ingredients: [row], steps: [] });
  render(<MealRecipeSnapshotScreen mealId="meal" />);
  await screen.findByRole("heading", { name: "원량 유지" });
  const ingredients = screen.getByRole("region", { name: "재료" });
  expect(within(ingredients).getByText(display, { exact: true })).toBeTruthy();
  expect(ingredients.textContent).not.toContain(String(amount));
  expect(ingredients.textContent).not.toContain(`${unit}${unit}`);
});
