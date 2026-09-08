import { describe, expect, it } from "vitest";
import { createGuestMealLogDay, createGuestPlannerData, createGuestPlannerNutrition } from "@/lib/planner/guest-planner-preview";

describe("public planner preview data", () => {
  it("keeps example rows separate from real account data", () => {
    const preview = createGuestPlannerData("2026-09-07");
    expect(preview.columns).toHaveLength(3);
    expect(preview.meals).toHaveLength(3);
    expect(preview.meals.every((meal) => meal.id.startsWith("preview-"))).toBe(true);
    expect(preview.product_entries).toEqual([]);
  });
  it("returns independent illustrative data for the requested date", () => {
    const first = createGuestMealLogDay("2026-09-07");
    expect(first.date).toBe("2026-09-07");
    expect(first.entries).toHaveLength(3);
    expect(first.day_total.calories_kcal).toBe(1607);
    expect(first.entries.every((entry) => entry.quantity.unit === "g")).toBe(true);
    first.entries.splice(0);
    expect(createGuestMealLogDay("2026-09-08").entries).toHaveLength(3);
  });
  it("provides display-only nutrition matching the guest meals", () => {
    const meals = createGuestPlannerData("2026-09-07").meals;
    const values = createGuestPlannerNutrition();
    expect(values[meals[0].id].values.energy_kcal.amount).toBe(420);
    expect(meals.map((meal) => values[meal.id].totalWeightGrams)).toEqual([250, 400, 320]);
    expect(values[meals[2].id].values.protein_g.amount).toBe(39);
  });
});
