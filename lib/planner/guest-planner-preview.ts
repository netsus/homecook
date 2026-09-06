import type { MealLogDayData, MealLogEntry, MealLogNutritionEvidence } from "@/types/meal-log";
import type { PlannerData } from "@/types/planner";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

// Public, illustrative content from the landing experience. Never written to a user's store or API.
const EXAMPLES = [
  { name: "그릭요거트 볼", slot: "아침", grams: 250, calories: 420, carbs: 48, protein: 22, fat: 16, sodium: 140, image: "/assets/funnel/food/greek-yogurt-bowl.png" },
  { name: "닭가슴살 현미밥", slot: "점심", grams: 400, calories: 700, carbs: 98, protein: 50, fat: 22, sodium: 760, image: "/assets/funnel/food/chicken-brown-rice-bowl.png" },
  { name: "제육볶음", slot: "저녁", grams: 320, calories: 487, carbs: 31, protein: 39, fat: 22, sodium: 680, image: "/assets/funnel/food/recipe-jeyuk-thumbnail.png" },
] as const;

function columns() {
  return EXAMPLES.map((food, index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    name: food.slot,
    sort_order: index,
  }));
}

export function createGuestPlannerData(date: string): PlannerData {
  const activeColumns = columns();
  return {
    columns: activeColumns,
    meals: EXAMPLES.map((food, index) => ({
      id: `preview-meal-${index + 1}`,
      recipe_id: `preview-recipe-${index + 1}`,
      recipe_title: food.name,
      recipe_thumbnail_url: food.image,
      plan_date: date,
      column_id: activeColumns[index].id,
      planned_servings: 1,
      status: (["registered", "shopping_done", "cook_done"] as const)[index],
      is_leftover: false,
    })),
    product_entries: [],
  };
}

export function createGuestPlannerNutrition(): PlannerMealNutritionViewMap {
  return Object.fromEntries(EXAMPLES.map((food, index) => [
    `preview-meal-${index + 1}`,
    {
      plannedServings: 1,
      totalWeightGrams: food.grams,
      values: Object.fromEntries(Object.entries({ energy_kcal: food.calories, carbohydrate_g: food.carbs, protein_g: food.protein, fat_g: food.fat, sodium_mg: food.sodium }).map(([key, amount]) => [key, { amount, known_amount: null, status: "complete", display_mode: "total" }])),
    },
  ]));
}

export function createGuestMealLogDay(date: string): MealLogDayData {
  const activeColumns = columns();
  const entries: MealLogEntry[] = EXAMPLES.map((food, index) => ({
    id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    revision: 1,
    consumed_at: null,
    consumed_local_date: date,
    timezone_name_snapshot: "Asia/Seoul",
    meal_plan_column_id: activeColumns[index].id,
    slot_name_snapshot: food.slot,
    source: { type: "cooked_batch", id: `40000000-0000-4000-8000-00000000000${index + 1}` },
    quantity: { amount: food.grams, unit: "g" },
    display_name: food.name,
    display_brand: null,
    nutrition: { calculation_status: "complete", calories_kcal: food.calories, carbohydrate_g: food.carbs, protein_g: food.protein, fat_g: food.fat, sodium_mg: food.sodium },
    created_at: `${date}T00:00:00.000Z`,
    updated_at: `${date}T00:00:00.000Z`,
  }));
  const total: MealLogNutritionEvidence = { calculation_status: "complete", calories_kcal: 1607, carbohydrate_g: 177, protein_g: 111, fat_g: 60, sodium_mg: 1580 };
  return {
    date,
    active_columns: activeColumns,
    active_sections: entries.map((entry, index) => ({
      meal_plan_column_id: activeColumns[index].id,
      slot_name_snapshot: activeColumns[index].name,
      sort_order: index,
      entries: [entry],
      subtotal: { ...entry.nutrition },
      incomplete_count: 0,
    })),
    deleted_column_sections: [],
    entries,
    day_total: { ...total, incomplete_count: 0 },
  };
}
