// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MealRecipeSnapshotScreen } from "@/components/planner/meal-recipe-snapshot-screen";

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
