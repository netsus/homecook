import React from "react";
import { formatMealLogEnergy, formatMealLogNumber, MEAL_LOG_MACROS, mealLogMacroShares, mealLogNutritionNotice } from "@/lib/planner/meal-log-nutrition-presentation";
import type { MealLogNutritionEvidence } from "@/types/meal-log";

export function MealLogNutritionNote({ nutrition }: { nutrition: MealLogNutritionEvidence }) {
  const text = mealLogNutritionNotice(nutrition);
  return text ? <p className={nutrition.contains_ai_estimate ? "mt-2 text-xs text-[var(--text-2)]" : "sr-only"}>{text}</p> : null;
}

export function MealLogMacroBar({ nutrition, thin = false, showAiNotice = true }: { nutrition: MealLogNutritionEvidence; thin?: boolean; showAiNotice?: boolean }) {
  const shares = mealLogMacroShares(nutrition);
  const showAi = showAiNotice && nutrition.contains_ai_estimate === true;
  const qualifier = nutrition.contains_ai_estimate
    ? "AI 추정 탄단지 기준"
    : nutrition.calculation_status === "partial" ? "확인된 탄단지 기준" : null;
  return <>
    {showAi ? <MealLogNutritionNote nutrition={nutrition} /> : null}
    {!shares ? (!showAi && nutrition.calculation_status !== "complete" ? <p className="sr-only">일부 영양 정보 없음</p> : null) : <>
      <div aria-label={(qualifier ? qualifier + " · " : "") + MEAL_LOG_MACROS.map(macro => macro.label + " " + formatMealLogNumber(nutrition[macro.key]) + "g").join(" · ")} role="img" className="flex w-full overflow-hidden rounded-full" style={{ height: thin ? 4 : 12 }}>{MEAL_LOG_MACROS.map((macro, index) => <span aria-hidden="true" key={macro.key} style={{ background: macro.color, width: (shares[index] * 100) + "%" }} />)}</div>
      {qualifier ? <p className="sr-only">{qualifier}</p> : null}
    </>}
  </>;
}

/** Compact totals; comparison charts belong in the day-detail view. */
export function MealLogNutritionChart({ nutrition, compact = false, hideCalories = false, summaryLabels = false }: { nutrition: MealLogNutritionEvidence; compact?: boolean; hideCalories?: boolean; summaryLabels?: boolean }) {
  const energyText = formatMealLogEnergy(nutrition);
  return <div>
    {!hideCalories ? <p className={`${compact ? "text-2xl" : "text-3xl"} font-semibold tabular-nums`}>{energyText.endsWith(" kcal") ? <>{energyText.slice(0, -5)}<span className="ml-1 text-base font-normal">kcal</span></> : energyText}</p> : null}
    {!compact ? <div className="mt-4"><MealLogMacroBar nutrition={nutrition} showAiNotice={false} /></div> : null}
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">{MEAL_LOG_MACROS.map(macro => <div key={macro.key}>
      <dt className="text-[var(--text-2)]">{summaryLabels ? <><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full" style={{ background: macro.color }} /><span aria-label={macro.label}>{macro.short}</span></> : macro.label}</dt>
      <dd className={`mt-1 font-normal tabular-nums ${summaryLabels ? "text-lg text-[var(--ui-slate-800)]" : ""}`}>{formatMealLogNumber(nutrition[macro.key])}{nutrition[macro.key] !== null ? <span className={summaryLabels ? "ml-0.5 text-sm text-[var(--text-2)]" : undefined}>g</span> : null}</dd>
    </div>)}</dl>
    <MealLogNutritionNote nutrition={nutrition} />
  </div>;
}
