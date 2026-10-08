"use client";

import React from "react";

import type { MealListItemData } from "@/types/meal";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";
import { formatPlannerNutritionValue, plannerAiEstimateNotice } from "@/lib/planner/planner-nutrition-presentation";

const statusLabels = { registered: "등록", shopping_done: "장보기 완료", cook_done: "요리 완료" };
const statusColors = { registered: "bg-[var(--brand-soft)] text-[var(--brand)]", shopping_done: "bg-[var(--success-soft)] text-[var(--success)]", cook_done: "bg-[var(--surface-fill)] text-[var(--text-2)]" };

export function PlannedMealCard({ meal, nutrition, detailed, conflictError, isPending, onOpen, onRecipe, onDelete, onStepDown, onStepUp, onAction, onShopping }: {
  meal: MealListItemData;
  nutrition?: PlannerMealNutritionViewMap[string];
  detailed: boolean;
  conflictError: string | null;
  isPending: boolean;
  onOpen: () => void;
  onRecipe: () => void;
  onDelete: () => void;
  onStepDown: () => void;
  onStepUp: () => void;
  onAction: () => void;
  onShopping: () => void;
}) {
  const matches = nutrition?.plannedServings === meal.planned_servings;
  const aiNotice = matches && nutrition ? plannerAiEstimateNotice(nutrition.values, nutrition.containsAiEstimate) : null;
  const energy = matches ? nutrition?.values.energy_kcal : undefined;
  const perServingEnergy = energy ? {
    ...energy,
    amount: energy.amount === null ? null : energy.amount / meal.planned_servings,
    known_amount: energy.known_amount === null ? null : energy.known_amount / meal.planned_servings,
  } : null;
  const actionLabel = meal.status === "cook_done" ? "완성한 음식 보기" : meal.status === "shopping_done" ? "요리 시작" : meal.shopping_list_id ? "장보기 이어가기" : "장보기";
  return <article aria-label={`${meal.recipe_title} 식사 카드`} className="min-w-0 border-b border-[var(--line)] py-5 last:border-0">
    <div className="flex items-start gap-3">
      {meal.recipe_thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" src={meal.recipe_thumbnail_url} />
      ) : null}
      <div className="min-w-0 flex-1">
        {detailed ? <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words text-2xl font-semibold leading-snug">{meal.recipe_title}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-normal ${statusColors[meal.status]}`}>{statusLabels[meal.status]}</span></div> : <button className="flex min-h-11 w-full items-center justify-between gap-3 text-left" data-testid={`meal-recipe-link-${meal.id}`} onClick={onOpen} type="button"><span className="min-w-0 flex-1 break-words text-lg font-semibold">{meal.recipe_title}</span><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-normal ${statusColors[meal.status]}`}>{statusLabels[meal.status]}</span><span aria-hidden="true" className="text-lg text-[var(--text-2)]">›</span></button>}
      </div>
    </div>
    <>
      <div aria-label="인분 조절" className="my-5 flex items-center justify-between gap-3 py-2" role="group">
        <span className="text-sm font-medium">계획 인분</span>
        <div className="flex items-center gap-3">
          <button aria-label="인분 감소" className="h-11 w-11 rounded-xl border border-[var(--line-strong)] disabled:opacity-40" disabled={meal.planned_servings <= 1 || isPending} onClick={onStepDown} type="button">−</button>
          <span aria-live="polite" className="min-w-12 text-center text-lg font-medium">{meal.planned_servings}인분</span>
          <button aria-label="인분 증가" className="h-11 w-11 rounded-xl border border-[var(--line-strong)] text-[var(--brand)] disabled:opacity-40" disabled={isPending} onClick={onStepUp} type="button">+</button>
        </div>
      </div>
      <section aria-label={`${meal.recipe_title} 계획 영양정보`} className="pb-2">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm font-medium">예상 영양 · {meal.planned_servings}인분</span>
          <span className="text-right"><span className="block text-lg font-normal tabular-nums">{energy ? formatPlannerNutritionValue("energy_kcal", energy) : "정보 준비 중"}</span>{perServingEnergy ? <span className="text-sm font-normal text-[var(--text-2)]">1인분 {formatPlannerNutritionValue("energy_kcal", perServingEnergy)}</span> : null}</span>
        </div>
        {aiNotice ? <p className="mt-2 text-xs text-[var(--brand-primary-text)]">{aiNotice}</p> : null}
        {matches && nutrition ? <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">{([['carbohydrate_g', '탄수화물'], ['protein_g', '단백질'], ['fat_g', '지방']] as const).map(([code, label]) => <div key={code}><dt className="font-normal text-[var(--text-2)]">{label}</dt><dd className="mt-1 font-normal">{nutrition.values[code] ? formatPlannerNutritionValue(code, nutrition.values[code]) : '정보 없음'}</dd></div>)}</dl> : null}
      </section>
      {detailed ? <>
      <button className="my-3 flex min-h-14 w-full items-center justify-between gap-3 text-left font-medium" data-testid={`meal-recipe-link-${meal.id}`} onClick={onRecipe} type="button">이 계획의 레시피 · 재료와 만들기 <span aria-hidden="true">›</span></button>
      {meal.shopping_list_id && meal.status !== "registered" ? <button className="mb-3 flex min-h-11 w-full items-center justify-between text-left font-medium text-[var(--brand)]" onClick={onShopping} type="button">장보기 기록 보기 <span aria-hidden="true">›</span></button> : null}
      </> : null}
    </>
    <button aria-busy={isPending} aria-label={meal.status === "shopping_done" ? `${meal.recipe_title} 요리 시작` : actionLabel} className={`mt-4 min-h-11 w-full rounded-xl border px-4 py-3 text-sm font-medium disabled:opacity-40 ${meal.status === "shopping_done" ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]' : 'border-[var(--brand)] text-[var(--brand)]'}`} disabled={isPending} onClick={onAction} type="button">{isPending ? <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}{actionLabel}</button>
    {detailed ? <button aria-label={`${meal.recipe_title} 이 계획에서 삭제`} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--danger-border)] px-4 py-3 text-sm font-medium text-[var(--danger)] disabled:opacity-40" data-testid={`meal-delete-${meal.id}`} disabled={isPending} onClick={onDelete} type="button">이 계획에서 삭제</button> : null}
    {conflictError ? <p className="mt-3 text-sm text-[var(--danger-strong)]" role="alert">{conflictError}</p> : null}
  </article>;
}
