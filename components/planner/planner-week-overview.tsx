"use client";

import React from "react";
import { formatKoreaCompactDate, formatKoreaWeekday } from "@/lib/korean-date";
import type { PlannerMealData } from "@/types/planner";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

export function PlannerWeekOverview({ dateKeys, meals, productEntries = [], selectedDate, today, loading, onSelect, onShiftWeek }: {
  dateKeys: string[];
  meals: PlannerMealData[];
  productEntries?: ProductPlannerEntryData[];
  selectedDate: string;
  today: string;
  loading: boolean;
  onSelect: (date: string) => void;
  onShiftWeek: (days: number) => void | Promise<void>;
}) {
  return <section aria-label="한 주 요리계획" className="mb-6 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)]">
    <div className="flex items-center justify-between border-b border-[var(--surface-subtle)] px-2">
      <button aria-label="이전 주" className="h-11 w-11 rounded-xl text-xl focus-visible:ring-2 focus-visible:ring-[var(--brand)]" onClick={() => onShiftWeek(-7)} type="button">‹</button>
      <span className="text-sm font-medium">{dateKeys.length ? `${formatKoreaCompactDate(dateKeys[0])} – ${formatKoreaCompactDate(dateKeys[dateKeys.length - 1])}` : "이번 주"}</span>
      <button aria-label="다음 주" className="h-11 w-11 rounded-xl text-xl focus-visible:ring-2 focus-visible:ring-[var(--brand)]" onClick={() => onShiftWeek(7)} type="button">›</button>
    </div>
    <ol>{dateKeys.map(date => {
      const titles = [...meals.filter(meal => meal.plan_date === date).map(meal => meal.recipe_title), ...productEntries.filter(entry => entry.plan_date === date).map(entry => entry.product_name)];
      const summary = titles.length ? `${titles[0]}${titles.length > 1 ? ` 외 ${titles.length - 1}개` : ""}` : "";
      return <li className="border-b border-[var(--surface-subtle)] last:border-0" key={date}>
        <button aria-label={`${formatKoreaCompactDate(date)} ${formatKoreaWeekday(date)} 선택`} aria-describedby={`planner-overview-summary-${date}`} aria-current={date === selectedDate ? "date" : undefined} aria-pressed={date === selectedDate} className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)] ${date === selectedDate ? "bg-[var(--brand-soft)] text-[var(--brand-primary-text)]" : "text-[var(--foreground)] hover:bg-[var(--surface-fill)]"}`} onClick={() => onSelect(date)} type="button">
          <span className="w-12 shrink-0 font-medium">{formatKoreaWeekday(date)} {Number(date.slice(8))}</span>
          {date === today ? <span className="rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 text-xs text-[var(--brand-primary-text)]">오늘</span> : null}
          {loading ? <><span id={`planner-overview-summary-${date}`} className="sr-only">확인 중</span><span aria-hidden="true" className="h-4 flex-1 animate-pulse rounded bg-[var(--surface-subtle)]" /></> : <span id={`planner-overview-summary-${date}`} className={`min-w-0 flex-1 truncate font-normal ${titles.length ? "" : "text-[var(--text-2)]"}`}>{summary}</span>}
          {!loading && titles.length ? <span className="shrink-0 text-xs font-normal">{titles.length}개</span> : <span aria-hidden="true">›</span>}
        </button>
      </li>;
    })}</ol>
  </section>;
}
