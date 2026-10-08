import React from "react";
import { formatMealLogNumber, MEAL_LOG_MACROS, mealLogMacroShares } from "@/lib/planner/meal-log-nutrition-presentation";
import type { MealLogNutritionEvidence } from "@/types/meal-log";

export function MealLogMacroBar({ nutrition, thin = false }: { nutrition: MealLogNutritionEvidence; thin?: boolean }) {
  const shares = mealLogMacroShares(nutrition);
  if (!shares) return nutrition.calculation_status !== "complete" ? <p className="text-xs text-[var(--text-2)]">일부 영양 정보 없음</p> : null;
  const qualifier = nutrition.calculation_status === "partial" ? "확인된 탄단지 기준" : null;
  return <><div aria-label={(qualifier ? `${qualifier} · ` : "") + MEAL_LOG_MACROS.map(macro => `${macro.label} ${formatMealLogNumber(nutrition[macro.key])}g`).join(" · ")} role="img" className="flex w-full overflow-hidden rounded-full" style={{ height: thin ? 4 : 12 }}>{MEAL_LOG_MACROS.map((macro, index) => <span aria-hidden="true" key={macro.key} style={{ background: macro.color, width: `${shares[index] * 100}%` }} />)}</div>{qualifier ? <p className="mt-1 text-xs text-[var(--text-2)]">{qualifier}</p> : null}</>;
}

/** Compact totals; comparison charts belong in the day-detail view. */
export function MealLogNutritionChart({ nutrition, compact = false, hideCalories = false, summaryLabels = false }: { nutrition: MealLogNutritionEvidence; compact?: boolean; hideCalories?: boolean; summaryLabels?: boolean }) {
  return <div>
    {!hideCalories ? <p className={`${compact ? "text-2xl" : "text-3xl"} font-semibold tabular-nums`}>{formatMealLogNumber(nutrition.calories_kcal)}{nutrition.calories_kcal !== null ? <span className="ml-1 text-base font-normal">kcal</span> : null}</p> : null}
    {!compact ? <div className="mt-4"><MealLogMacroBar nutrition={nutrition} /></div> : null}
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">{MEAL_LOG_MACROS.map(macro => <div key={macro.key}>
      <dt className="text-[var(--text-2)]">{summaryLabels ? <><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full" style={{ background: macro.color }} /><span aria-label={macro.label}>{macro.short}</span></> : macro.label}</dt>
      <dd className={`mt-1 font-normal tabular-nums ${summaryLabels ? "text-lg text-[var(--ui-slate-800)]" : ""}`}>{formatMealLogNumber(nutrition[macro.key])}{nutrition[macro.key] !== null ? <span className={summaryLabels ? "ml-0.5 text-sm text-[var(--text-2)]" : undefined}>g</span> : null}</dd>
    </div>)}</dl>
    {compact && nutrition.calculation_status !== "complete" ? <p className="mt-3 text-xs text-[var(--text-2)]">확인된 정보 기준</p> : null}
  </div>;
}
