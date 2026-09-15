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
  const displayedAmount = (code: (typeof macros)[number]["code"]) => {
    const value = values[code];
    const amount = value?.amount ?? value?.known_amount;
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0
      ? amount
      : null;
  };
  const energy = macros.reduce(
    (sum, { code, factor }) => sum + (displayedAmount(code) ?? 0) * factor,
    0,
  );
  const availableLabels = macros
    .filter(({ code }) => displayedAmount(code) !== null)
    .map(({ label }) => label);
  return <div className="mt-3">
    <p className="text-xl font-extrabold tabular-nums text-[var(--brand-primary-text)]">{values.energy_kcal ? formatPlannerNutritionValue("energy_kcal", values.energy_kcal) : "열량 정보 준비 중"}</p>
    <div aria-label={availableLabels.length > 0 ? `확인된 ${availableLabels.join("·")} 열량 비율` : "영양 정보 준비 중인 그래프"} className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--line-strong)]" role="img">
      {macros.map(({ code, factor, color }) => {
        const amount = displayedAmount(code) ?? 0;
        return <span key={code} style={{ backgroundColor: color, width: `${energy > 0 ? amount * factor / energy * 100 : 0}%` }} />;
      })}
    </div>
    <dl className="mt-3 grid grid-cols-3 gap-2">
      {macros.map(({ code, label, color }) => <div className="min-w-0" key={code}>
        <dt className="flex items-center gap-1 text-[11px] text-[var(--text-2)]"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />{label}</dt>
        <dd className="mt-1 text-xs font-bold tabular-nums text-[var(--foreground)]">{values[code] ? formatPlannerNutritionValue(code, values[code]) : "정보 준비 중"}</dd>
      </div>)}
    </dl>
    <p className="mt-2 text-[10px] text-[var(--text-3)]">{energy > 0 ? "확인된 탄단지 열량 비율" : "영양 정보 준비 중"}</p>
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
