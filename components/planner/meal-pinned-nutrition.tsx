import React from "react";
import { formatPlannerNutritionValue } from "@/lib/planner/planner-nutrition-presentation";
import type { PlannerNutritionValue } from "@/types/planner-nutrition";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

const macros = [
  { code: "carbohydrate_g", label: "탄수화물", factor: 4, color: "var(--nutrition-carbohydrate)" },
  { code: "protein_g", label: "단백질", factor: 4, color: "var(--nutrition-protein)" },
  { code: "fat_g", label: "지방", factor: 9, color: "var(--nutrition-fat)" },
] as const;

export function PlannerNutritionChart({ values }: { values: Record<string, PlannerNutritionValue> }) {
  // Only complete values can describe the proportions of the whole meal.
  const complete = macros.every(({ code }) => values[code]?.status === "complete" && typeof values[code].amount === "number" && Number.isFinite(values[code].amount) && values[code].amount! >= 0);
  const energy = complete ? macros.reduce((sum, { code, factor }) => sum + values[code].amount! * factor, 0) : 0;
  return <div className="mt-3">
    <p className="text-xl font-extrabold tabular-nums text-[var(--brand-primary-text)]">{values.energy_kcal ? formatPlannerNutritionValue("energy_kcal", values.energy_kcal) : "열량 정보 준비 중"}</p>
    {energy > 0 ? <div aria-label="탄수화물·단백질·지방의 열량 비율" className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--surface-fill)]" role="img">
      {macros.map(({ code, factor, color }) => <span key={code} style={{ backgroundColor: color, width: `${values[code].amount! * factor / energy * 100}%` }} />)}
    </div> : null}
    <dl className="mt-3 grid grid-cols-3 gap-2">
      {macros.map(({ code, label, color }) => <div className="min-w-0" key={code}>
        <dt className="flex items-center gap-1 text-[11px] text-[var(--text-2)]"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />{label}</dt>
        <dd className="mt-1 text-xs font-bold tabular-nums text-[var(--foreground)]">{values[code] ? formatPlannerNutritionValue(code, values[code]) : "정보 준비 중"}</dd>
      </div>)}
    </dl>
    <p className="mt-2 text-[10px] text-[var(--text-3)]">{energy > 0 ? "탄단지 열량 비율" : "영양 정보가 모두 준비되면 비율을 보여드려요."}</p>
  </div>;
}

export function MealPinnedNutrition({ nutrition, servings, title }: {
  nutrition?: PlannerMealNutritionViewMap[string];
  servings: number;
  title: string;
}) {
  const matches = nutrition?.plannedServings === servings;
  return <section aria-label={`${title} 계획 영양정보`} className="border-t border-[var(--line-strong)] bg-[var(--surface-subtle)] p-3.5">
    <h2 className="text-xs font-bold text-[var(--text-2)]">계획한 {servings}인분의 예상 영양</h2>
    {!matches ? <p className="mt-3 text-sm text-[var(--text-2)]">{nutrition ? "영양 정보를 다시 확인하고 있어요." : "영양 정보 준비 중"}</p> : <PlannerNutritionChart values={nutrition.values} />}
  </section>;
}
