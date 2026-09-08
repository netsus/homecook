import React from "react";
import { formatPlannerNutritionValue, PLANNER_NUTRITION_LABELS } from "@/lib/planner/planner-nutrition-presentation";
import { PLANNER_NUTRITION_CORE_CODES } from "@/types/planner-nutrition";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

export function MealPinnedNutrition({ nutrition, servings, title }: {
  nutrition?: PlannerMealNutritionViewMap[string];
  servings: number;
  title: string;
}) {
  const matches = nutrition?.plannedServings === servings;
  return (
    <section aria-label={`${title} 계획 영양정보`} className="mt-3 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] p-3">
      <h2 className="text-sm font-extrabold">레시피 영양정보</h2>
      <p className="mt-1 text-xs text-[var(--text-2)]">등록한 계획 기준 · {servings}인분 · 예상 영양</p>
      {!matches ? <p className="mt-3 text-sm text-[var(--text-2)]">{nutrition ? "영양 정보를 다시 확인하고 있어요." : "영양 정보 준비 중"}</p> : (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLANNER_NUTRITION_CORE_CODES.map((code) => {
            const value = nutrition.values[code];
            return <div className="rounded-lg bg-[var(--surface-fill)] p-2" key={code}>
              <dt className="text-xs text-[var(--text-2)]">{PLANNER_NUTRITION_LABELS[code]}</dt>
              <dd className="mt-1 text-sm font-extrabold text-[var(--brand-contrast)]">{value ? formatPlannerNutritionValue(code, value) : "정보 준비 중"}</dd>
            </div>;
          })}
        </dl>
      )}
    </section>
  );
}
