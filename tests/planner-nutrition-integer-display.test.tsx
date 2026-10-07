// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { formatPlannerNutritionValue } from "@/lib/planner/planner-nutrition-presentation";
import { MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
afterEach(cleanup);
it("rounds complete and partial nutrient display without altering the source evidence", () => {
  const value = { status: "complete" as const, amount: 3063.8, known_amount: null, display_mode: "total" as const };
  expect(formatPlannerNutritionValue("energy_kcal", value)).toBe("3,064 kcal");
  expect(value.amount).toBe(3063.8);
  expect(formatPlannerNutritionValue("fat_g", { status: "partial", amount: null, known_amount: 14.8, display_mode: "minimum" })).toBe("15 g");
});
it("shows whole-number calories and grams while drawing ratios from precise evidence", () => {
  const nutrition = { calculation_status: "complete" as const, calories_kcal: 258.4, carbohydrate_g: 39.6, protein_g: 6.4, fat_g: 7.4, sodium_mg: 123.4 };
  render(<MealLogNutritionChart nutrition={nutrition} />);
  expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "258kcal")).toBeTruthy();
  expect(screen.getAllByRole("definition").map(element => element.textContent)).toEqual(["40g", "6g", "7g"]);
  const totalMacroEnergy = 39.6 * 4 + 6.4 * 4 + 7.4 * 9;
  const carbohydrateBar = screen.getByRole("img").firstElementChild as HTMLElement;
  expect(Number.parseFloat(carbohydrateBar.style.width)).toBeCloseTo(39.6 * 4 / totalMacroEnergy * 100);
  expect(nutrition.carbohydrate_g).toBe(39.6);
});
