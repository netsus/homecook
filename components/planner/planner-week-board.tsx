"use client";

import Link from "next/link";
import React from "react";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { formatKoreaCompactDate, formatKoreaWeekday } from "@/lib/korean-date";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";

interface PlannerWeekBoardProps {
  columns: PlannerColumnData[];
  meals: PlannerMealData[];
  selectedDate: string;
  today: string;
  disabled: boolean;
  onMealOpen?: (meal: PlannerMealData) => void;
  onAdd: (dateKey: string, column: PlannerColumnData) => void;
  onDayRef: (dateKey: string, element: HTMLElement | null) => void;
}

function detailHref(date: string, column: PlannerColumnData, mealId?: string) {
  const query = new URLSearchParams({ slot: column.name });
  if (mealId) query.set("mealId", mealId);
  return buildReturnHref(`/planner/${date}/${column.id}?${query}`, {
    returnSurface: "planner.week", returnTo: `/planner?${new URLSearchParams({ date })}`,
  });
}

function WeekMeal({ meal, column, onMealOpen }: { meal: PlannerMealData; column: PlannerColumnData; onMealOpen?: (meal: PlannerMealData) => void }) {
  const status = meal.status === "cook_done" ? "요리 완료" : meal.status === "shopping_done" ? "장보기 완료" : meal.shopping_list_id ? "장보기 중" : "등록";
  const style = meal.status === "cook_done" ? "bg-rose-50 text-rose-700" : meal.status === "shopping_done" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--brand-soft)] text-[var(--brand-primary-text)]";
  const content = <>
    <span className="min-w-0 flex-1"><span className="block text-base font-medium leading-snug [overflow-wrap:anywhere]">{meal.recipe_title}</span><span className="mt-1 block text-sm font-normal text-[var(--text-2)]">{meal.planned_servings}인분{meal.is_leftover ? " · 남은 요리" : ""}</span></span>
    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-normal ${style}`}>{status}</span>
    <span aria-hidden="true" className="text-lg text-[var(--text-2)]">›</span>
  </>;
  const className = "flex min-h-16 w-full items-center gap-3 rounded-lg px-1 py-3 text-left focus-visible:ring-2 focus-visible:ring-[var(--brand)] hover:bg-[var(--surface-fill)]";
  return <div data-testid={`planner-meal-${meal.id}`}>{onMealOpen ? <button aria-label={meal.recipe_title} className={className} onClick={() => onMealOpen(meal)} type="button">{content}</button> : <Link aria-label={meal.recipe_title} className={className} href={detailHref(meal.plan_date, column, meal.id)}>{content}</Link>}</div>;
}

export function PlannerWeekBoard({ columns, meals, selectedDate, today, disabled, onMealOpen, onAdd, onDayRef }: PlannerWeekBoardProps) {
  return <article aria-labelledby={`planner-day-heading-${selectedDate}`} className="min-w-0 scroll-mt-4 rounded-2xl bg-[var(--surface)] px-4 py-4" data-testid={`planner-day-card-${selectedDate}`} ref={element => onDayRef(selectedDate, element)}>
    <h2 aria-current={selectedDate === today ? "date" : undefined} className="mb-3 text-lg font-semibold" id={`planner-day-heading-${selectedDate}`} tabIndex={-1}>{formatKoreaCompactDate(selectedDate)} ({formatKoreaWeekday(selectedDate)})</h2>
    {columns.length === 0 ? <p className="py-4 text-sm text-[var(--text-2)]">표시할 끼니 설정이 없어요.</p> : null}
    <div data-testid={`web-planner-date-row-${selectedDate}`}>{columns.map(column => {
      const slotMeals = meals.filter(meal => meal.plan_date === selectedDate && meal.column_id === column.id);
      return <section aria-label={column.name} className="border-b border-[var(--surface-subtle)] py-3 last:border-0" key={column.id}>
        <div className="flex items-center justify-between gap-3"><h3 className="min-w-0"><Link className="inline-flex min-h-11 items-center gap-2 text-base font-medium focus-visible:ring-2 focus-visible:ring-[var(--brand)]" href={detailHref(selectedDate, column)}>{column.name}<span aria-hidden="true" className="font-normal text-[var(--text-2)]">›</span></Link></h3>
          <button aria-label={`${formatKoreaCompactDate(selectedDate)} ${column.name} 식사 추가`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] text-2xl font-normal text-[var(--brand-primary-text)] shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:opacity-50" disabled={disabled} onClick={() => onAdd(selectedDate, column)} type="button">+</button>
        </div>
        {slotMeals.length ? <div className="divide-y divide-[var(--surface-subtle)]">{slotMeals.map(meal => <WeekMeal column={column} key={meal.id} meal={meal} onMealOpen={onMealOpen} />)}</div> : null}
      </section>;
    })}</div>
  </article>;
}
