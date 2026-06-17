import type { PlannerMealData } from "@/types/planner";

export interface PlannerMealStatusStats {
  cookDone: number;
  registered: number;
  shoppingDone: number;
  total: number;
}

export interface MypageRecordStats {
  cooking: number;
  planner: number;
  shopping: number;
}

export function buildPlannerMealStatusStats(
  meals: readonly Pick<PlannerMealData, "status">[],
): PlannerMealStatusStats {
  let cookDone = 0;
  let registered = 0;
  let shoppingDone = 0;

  meals.forEach((meal) => {
    if (meal.status === "cook_done") {
      cookDone += 1;
      return;
    }

    if (meal.status === "shopping_done") {
      shoppingDone += 1;
      return;
    }

    registered += 1;
  });

  return {
    cookDone,
    registered,
    shoppingDone,
    total: meals.length,
  };
}

export function buildMypageRecordStats(
  stats: PlannerMealStatusStats,
): MypageRecordStats {
  return {
    cooking: stats.cookDone,
    planner: stats.total,
    shopping: stats.shoppingDone,
  };
}
