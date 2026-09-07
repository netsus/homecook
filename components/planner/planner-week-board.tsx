"use client";

import Image from "next/image";
import Link from "next/link";
import React, { type CSSProperties } from "react";

import { formatKoreaCompactDate, formatKoreaWeekday } from "@/lib/korean-date";
import {
  formatPlannerNutritionValue,
} from "@/lib/planner/planner-nutrition-presentation";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";
import type { PlannerNutritionCoreCode } from "@/types/planner-nutrition";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

interface PlannerWeekBoardProps {
  dateKeys: string[];
  columns: PlannerColumnData[];
  meals: PlannerMealData[];
  selectedDate: string;
  today: string;
  disabled: boolean;
  nutritionByMeal?: PlannerMealNutritionViewMap;
  onMealOpen?: (meal: PlannerMealData) => void;
  onAdd: (dateKey: string, column: PlannerColumnData) => void;
  onDayRef: (dateKey: string, element: HTMLElement | null) => void;
}

const mealStatus = {
  registered: { label: "등록", color: "var(--planner-status-registered)" },
  shopping_done: { label: "장보기 완료", color: "var(--planner-status-shopping)" },
  cook_done: { label: "요리 완료", color: "var(--planner-status-cooked)" },
};

function WeekMeal({
  meal,
  column,
  nutrition,
  onMealOpen,
}: {
  meal: PlannerMealData;
  column: PlannerColumnData;
  nutrition?: PlannerMealNutritionViewMap[string];
  onMealOpen?: (meal: PlannerMealData) => void;
}) {
  const detailHref = `/planner/${meal.plan_date}/${meal.column_id}?slot=${encodeURIComponent(column.name)}`;
  const status = mealStatus[meal.status];
  const values = Number.isFinite(meal.planned_servings) && meal.planned_servings > 0 && nutrition?.plannedServings === meal.planned_servings
    ? nutrition.values
    : undefined;
  const totalValue = (code: PlannerNutritionCoreCode) => {
    const value = values?.[code];
    return value ? formatPlannerNutritionValue(code, value) : "정보 준비 중";
  };
  const energy = totalValue("energy_kcal");
  const totalEnergy = energy === "정보 준비 중" ? "열량 정보 준비 중" : energy;
  const totalWeight = values && typeof nutrition?.totalWeightGrams === "number"
    && Number.isFinite(nutrition.totalWeightGrams) && nutrition.totalWeightGrams > 0
    ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(nutrition.totalWeightGrams)} g`
    : "무게 계산 준비 중";
  const macros = [
    { code: "carbohydrate_g", short: "탄", label: "탄수화물", factor: 4, color: "#F4D35E" },
    { code: "protein_g", short: "단", label: "단백질", factor: 4, color: "#FF8811" },
    { code: "fat_g", short: "지", label: "지방", factor: 9, color: "#1E555C" },
  ] as const;
  // A partial amount is a minimum, not a proportional share of the whole dish.
  const completeMacros = macros.every(({ code }) => {
    const value = values?.[code];
    return value?.status === "complete" && typeof value.amount === "number"
      && Number.isFinite(value.amount) && value.amount >= 0;
  });
  const macroEnergy = completeMacros
    ? macros.reduce((sum, { code, factor }) => sum + values![code].amount! * factor, 0)
    : 0;
  const nutritionLabel = values
    ? `${totalWeight} · ${totalEnergy} · ${macros.map(({ code, label }) => `${label} ${totalValue(code)}`).join(" · ")}`
    : "영양 정보 준비 중";
  const statusId = `planner-meal-status-${meal.id}`;
  const cardClass = "flex min-h-11 w-full min-w-0 flex-col items-stretch gap-2 rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {meal.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-11 w-10 shrink-0 rounded-md object-cover"
            height={44}
            src={meal.recipe_thumbnail_url}
            unoptimized
            width={40}
          />
        ) : (
          <span aria-hidden="true" className="flex h-11 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand-contrast)]">
            {column.name.charAt(0)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-snug text-[var(--foreground)] [overflow-wrap:anywhere]">
            {meal.recipe_title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs leading-snug text-[var(--text-2)]">
            <span className="whitespace-nowrap">{meal.planned_servings}인분</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
            <span className="whitespace-nowrap" id={statusId}>{status.label}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{totalWeight}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap font-semibold text-slate-800">{totalEnergy}</span>
            {meal.is_leftover ? <span>· 남은 요리</span> : null}
          </span>
        </span>
      </span>
      <span aria-label="전체 탄수화물·단백질·지방" className="block rounded-lg bg-slate-50 px-2 py-2">
        {macroEnergy > 0 ? (
          <span aria-label={`탄단지 열량 비율 · ${macros.map(({ code, label }) => `${label} ${totalValue(code)}`).join(" · ")}`} className="mb-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-200" role="img">
            {macros.map(({ code, factor, color }) => <span key={code} style={{ backgroundColor: color, width: `${values![code].amount! * factor / macroEnergy * 100}%` }} />)}
          </span>
        ) : null}
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-relaxed text-slate-700">
          {macros.map(({ code, short, label, color }) => (
            <span aria-label={`${label} ${totalValue(code)}`} className="whitespace-nowrap" key={code}>
              <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              {short} {totalValue(code)}
            </span>
          ))}
        </span>
      </span>
    </>
  );

  return (
    <div className="min-w-0" data-testid={`planner-meal-${meal.id}`}>
      {onMealOpen ? (
        <button
          title={`${meal.recipe_title} · ${nutritionLabel}`}
          aria-describedby={statusId} aria-label={meal.recipe_title}
          className={cardClass}
          onClick={() => onMealOpen(meal)}
          type="button"
        >
          {content}
        </button>
      ) : (
        <Link aria-describedby={statusId} aria-label={meal.recipe_title} className={cardClass} href={detailHref} title={`${meal.recipe_title} · ${nutritionLabel}`}>
          {content}
        </Link>
      )}
    </div>
  );
}

export function PlannerWeekBoard({
  dateKeys,
  columns,
  meals,
  selectedDate,
  today,
  disabled,
  nutritionByMeal,
  onMealOpen,
  onAdd,
  onDayRef,
}: PlannerWeekBoardProps) {
  const mealsBySlot = new Map<string, PlannerMealData[]>();
  for (const meal of meals) {
    const slotKey = `${meal.plan_date}:${meal.column_id}`;
    const slotMeals = mealsBySlot.get(slotKey) ?? [];
    slotMeals.push(meal);
    mealsBySlot.set(slotKey, slotMeals);
  }

  if (columns.length === 0) {
    return <p className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--text-2)]">표시할 끼니 설정이 없어요.</p>;
  }

  const gridStyle = {
    "--planner-board-columns": `112px repeat(${columns.length}, minmax(160px, 1fr))`,
    "--planner-board-min-width": `${112 + columns.length * 160}px`,
  } as CSSProperties;

  return (
    <div className="min-w-0 max-w-full lg:overflow-x-auto" style={gridStyle}>
      <div className="space-y-3 lg:min-w-[var(--planner-board-min-width)] lg:space-y-0 lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line-strong)]">
        <div className="hidden lg:grid lg:grid-cols-[var(--planner-board-columns)]" aria-hidden="true">
          <div className="flex items-center justify-center border-b border-r border-[var(--line-strong)] bg-[var(--surface-fill)] text-xs font-bold text-[var(--text-2)]">날짜</div>
          {columns.map((column) => <div className="web-planner-column-head min-w-0 px-3 py-3 [overflow-wrap:anywhere]" key={column.id}>{column.name}</div>)}
        </div>
        {dateKeys.map((dateKey) => {
          const isToday = dateKey === today;
          const isSelected = dateKey === selectedDate;
          return (
            <article
              aria-labelledby={`planner-day-heading-${dateKey}`}
              className={[
                "min-w-0 scroll-mt-[calc(var(--planner-sticky-height,180px)+12px)] overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface)] lg:rounded-none lg:border-x-0 lg:border-t-0 lg:last:border-b-0",
                isSelected ? "border-[var(--brand)] lg:border-[var(--line-strong)]" : "border-[var(--line-strong)]",
              ].join(" ")}
              data-testid={`planner-day-card-${dateKey}`}
              key={dateKey}
              ref={(element) => onDayRef(dateKey, element)}
            >
              <div className="lg:grid lg:grid-cols-[var(--planner-board-columns)]" data-testid={`web-planner-date-row-${dateKey}`}>
                <h2
                  className={[
                    "flex min-h-14 items-center gap-1 border-b border-[var(--surface-subtle)] px-4 py-2 text-base font-extrabold lg:flex-col lg:justify-center lg:gap-1 lg:border-b-0 lg:border-r lg:px-2 lg:text-sm",
                    isToday ? "bg-[var(--brand-soft)]" : isSelected ? "bg-[var(--brand-soft)] lg:bg-[var(--surface-fill)]" : "bg-[var(--surface)] lg:bg-[var(--surface-fill)]",
                  ].join(" ")}
                  id={`planner-day-heading-${dateKey}`}
                  aria-current={isToday ? "date" : undefined}
                  tabIndex={-1}
                >
                  {isToday ? <span className="text-xs font-bold text-sky-700">오늘</span> : null}
                  <span className="whitespace-nowrap">{formatKoreaCompactDate(dateKey)} <span className="font-semibold text-[var(--text-2)]">({formatKoreaWeekday(dateKey)})</span></span>
                </h2>
                {columns.map((column) => {
                  const slotMeals = mealsBySlot.get(`${dateKey}:${column.id}`) ?? [];
                  return (
                    <div className="flex min-w-0 items-center gap-2 border-b border-[var(--surface-subtle)] px-3 py-2 last:border-b-0 lg:min-h-[84px] lg:items-center lg:border-b-0 lg:border-r lg:px-3 lg:py-3 lg:last:border-r-0" key={column.id}>
                      <h3 className="w-9 shrink-0 text-xs font-bold text-[var(--foreground)] [overflow-wrap:anywhere] lg:sr-only">{column.name}</h3>
                      {slotMeals.length > 0 ? (
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {slotMeals.map((meal) => (
                            <WeekMeal
                              column={column}
                              key={meal.id}
                              meal={meal}
                              nutrition={nutritionByMeal?.[meal.id]}
                              onMealOpen={onMealOpen}
                            />
                          ))}
                        </div>
                      ) : null}
                      <button
                        aria-label={`${formatKoreaCompactDate(dateKey)} ${column.name} 식사 추가`}
                        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-[var(--brand-primary-text)] shadow-sm hover:border-[var(--brand)] hover:bg-[var(--surface-fill)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none"
                        disabled={disabled}
                        onClick={() => onAdd(dateKey, column)}
                        type="button"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
