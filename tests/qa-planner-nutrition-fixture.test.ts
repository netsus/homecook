import { beforeEach, describe, expect, it } from "vitest";

import {
  createQaFixtureMeal,
  deleteQaFixtureMeal,
  getQaFixtureMealsBySlot,
  getQaFixturePlannerData,
  getQaFixturePlannerNutrition,
  resetQaFixtureState,
  updateQaFixtureMealServings,
} from "@/lib/mock/recipes";

const START_DATE = "2026-07-13";
const END_DATE = "2026-07-19";
const BREAKFAST_COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const BREAKFAST_MEAL_ID = "550e8400-e29b-41d4-a716-446655440060";

function breakfastNutrition() {
  return getQaFixturePlannerNutrition(START_DATE, END_DATE).days
    .find((day) => day.plan_date === START_DATE)!
    .columns.find((column) => column.column_id === BREAKFAST_COLUMN_ID)!
    .nutrition;
}

describe("central QA planner nutrition fixture consistency", () => {
  beforeEach(() => {
    resetQaFixtureState();
  });

  it("uses the same recipe/product storage identities, counts, quantities, and visible slot entries", () => {
    const planner = getQaFixturePlannerData(START_DATE, END_DATE);
    const nutrition = getQaFixturePlannerNutrition(START_DATE, END_DATE);
    const meal = getQaFixtureMealsBySlot(START_DATE, BREAKFAST_COLUMN_ID);

    expect(nutrition.summary.recipe_entry_count).toBe(planner.meals.length);
    expect(nutrition.summary.product_entry_count).toBe(planner.product_entries.length);
    expect(planner.product_entries).toHaveLength(2);
    expect(meal.items.map((entry) => entry.id)).toEqual([BREAKFAST_MEAL_ID]);
    expect(meal.product_entries.map((entry) => entry.id)).toEqual([
      "550e8400-e29b-41d4-a716-446655440070",
    ]);

    const breakfastProduct = planner.product_entries.find(
      (entry) => entry.id === "550e8400-e29b-41d4-a716-446655440070",
    )!;
    expect(breakfastProduct.quantity).toEqual({ amount: 2, unit: "serving" });
    expect(breakfastProduct.nutrition.basis).toEqual(breakfastProduct.quantity);
    expect(breakfastProduct.nutrition.calculation_quality).toBe("direct");
    expect(breakfastNutrition().values.energy_kcal.amount).toBe(580);
  });

  it("fails closed unavailable product quality without downgrading calculable direct products or mixed aggregates", () => {
    const planner = getQaFixturePlannerData(START_DATE, END_DATE);
    const nutrition = getQaFixturePlannerNutrition(START_DATE, END_DATE);

    const calculableProduct = planner.product_entries.find(
      (entry) => entry.id === "550e8400-e29b-41d4-a716-446655440070",
    )!;
    expect(calculableProduct.nutrition.calculation_status).toBe("partial");
    expect(calculableProduct.nutrition.calculation_quality).toBe("direct");

    const unavailableProduct = planner.product_entries.find(
      (entry) => entry.id === "550e8400-e29b-41d4-a716-446655440073",
    )!;
    expect(unavailableProduct.nutrition.calculation_status).toBe("unavailable");
    expect(unavailableProduct.nutrition.calculation_quality).toBeNull();

    expect(breakfastNutrition().calculation_quality).toBe("mixed");
    expect(nutrition.summary.nutrition.calculation_quality).toBe("mixed");
  });

  it("recalculates the same recipe identity after serving update and removes it after delete", () => {
    expect(
      updateQaFixtureMealServings({ mealId: BREAKFAST_MEAL_ID, plannedServings: 3 }).ok,
    ).toBe(true);
    expect(breakfastNutrition().values.energy_kcal.amount).toBe(790);

    expect(deleteQaFixtureMeal(BREAKFAST_MEAL_ID).ok).toBe(true);
    const afterDelete = getQaFixturePlannerNutrition(START_DATE, END_DATE);
    expect(afterDelete.summary.recipe_entry_count).toBe(2);
    expect(breakfastNutrition().values.energy_kcal.amount).toBe(160);
  });

  it("counts a newly created null-pin recipe meal as unavailable instead of inventing zero", () => {
    const created = createQaFixtureMeal({
      planDate: START_DATE,
      columnId: BREAKFAST_COLUMN_ID,
      plannedServings: 1,
      leftoverDishId: null,
    });
    expect(created.ok).toBe(true);

    const nutrition = getQaFixturePlannerNutrition(START_DATE, END_DATE);
    expect(nutrition.summary.recipe_entry_count).toBe(4);
    expect(breakfastNutrition().incomplete_entry_count).toBe(2);
    expect(breakfastNutrition().values.energy_kcal.status).toBe("partial");
    expect(breakfastNutrition().values.energy_kcal.known_amount).toBe(580);
  });
});
