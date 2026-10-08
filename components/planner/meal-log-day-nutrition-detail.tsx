"use client";
import React, { useId, useRef, useState } from "react";
import { AppBackButton } from "@/components/shared/app-back-button";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { MealLogNutritionChart } from "@/components/planner/meal-log-nutrition-chart";
import { MEAL_LOG_MACROS, formatMealLogNumber, mealLogAxisMaximum, mealLogMacroShares, mealLogNutritionNotice, type MealLogMetric } from "@/lib/planner/meal-log-nutrition-presentation";
import type { MealLogDayData, MealLogEntry } from "@/types/meal-log";

export function MealLogDayNutritionDetail({ day, onClose, onEntry, active = true }: { active?: boolean; day: MealLogDayData; onClose: () => void; onEntry: (entry: MealLogEntry) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const chartDescriptionId = useId();
  const [metric, setMetric] = useState<MealLogMetric>("calories_kcal");
  const [help, setHelp] = useState(false);
  useDialogBoundary({ active, dialogRef: panel, onClose });
  const macro = MEAL_LOG_MACROS.find(item => item.key === metric);
  const label = macro?.label ?? "열량";
  const unit = macro ? "g" : "kcal";
  const sections = [
    ...day.active_columns.map(column => day.active_sections.find(section => section.meal_plan_column_id === column.id) ?? { slot_name_snapshot: column.name, entries: [], subtotal: null }),
    ...day.deleted_column_sections,
  ];
  const maximum = mealLogAxisMaximum(sections.map(section => section.entries.length ? section.subtotal?.[metric] ?? null : null));
  const contributors = [...day.entries].sort((a, b) => (b.nutrition[metric] ?? -1) - (a.nutrition[metric] ?? -1));
  return <div ref={panel} role="dialog" aria-modal={active ? true : undefined} aria-label="하루 영양 상세" tabIndex={-1} className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] outline-none">
    <div className="mx-auto max-w-3xl px-5 py-4">
      <header className="flex items-center gap-3"><AppBackButton ariaLabel="식사 기록으로 돌아가기" onClick={onClose} /><h2 className="flex-1 text-xl font-semibold">{Number(day.date.slice(5, 7))}월 {Number(day.date.slice(8, 10))}일</h2><button type="button" className="h-11 w-11 rounded-full border" aria-label="영양 계산 기준" aria-expanded={help} onClick={() => setHelp(!help)}>ⓘ</button></header>
      <section aria-label="하루 영양 합계" className="mt-6 rounded-2xl bg-[var(--ui-sky-50)] p-5 text-[var(--ui-slate-800)]">
        <MealLogNutritionChart nutrition={day.day_total} compact summaryLabels />
      </section>
      {help ? <p className="mt-4 rounded-xl bg-[var(--surface-fill)] p-4 text-sm leading-6">색상 비율은 탄수화물·단백질 1g당 4kcal, 지방 1g당 9kcal로 계산해요. 막대 전체 길이는 기록된 열량이며 식품 표기 열량과 환산값은 다를 수 있어요. 영양소를 선택하면 g으로 비교해요.</p> : null}
      <div role="group" aria-label="비교할 영양정보" className="my-7 grid grid-cols-4 rounded-xl bg-[var(--surface-fill)] p-1">{[{ key: "calories_kcal", label: "열량" }, ...MEAL_LOG_MACROS].map(item => <button key={item.key} type="button" aria-pressed={metric === item.key} className={`min-h-11 rounded-lg text-sm font-medium ${metric === item.key ? "bg-[var(--surface)] shadow-sm" : ""}`} onClick={() => setMetric(item.key as MealLogMetric)}>{item.label}</button>)}</div>
      <h3 className="mb-5 text-lg font-medium">끼니별 {label}</h3>
      <p id={chartDescriptionId} className="sr-only">{sections.map(section => {
        const value = section.subtotal?.[metric];
        const notice = section.subtotal ? mealLogNutritionNotice(section.subtotal) : null;
        const amount = !section.entries.length ? "기록 없음" : value === null || value === undefined ? "정보 없음" : `${formatMealLogNumber(value)}${unit}${notice ? ` (${notice})` : ""}`;
        return `${section.slot_name_snapshot}: ${amount}`;
      }).join(". ")}</p>
      <div aria-label={`끼니별 ${label} 그래프`} aria-describedby={chartDescriptionId} role="img" className="space-y-5">
        {sections.map((section, index) => {
          const value = section.subtotal?.[metric] ?? null;
          const shares = section.subtotal ? mealLogMacroShares(section.subtotal) : null;
          const noRecord = !section.entries.length;
          const notice = section.subtotal ? mealLogNutritionNotice(section.subtotal) : null;
          return <div key={`${section.slot_name_snapshot}-${index}`} className="grid grid-cols-[88px_1fr] items-center gap-3">
            <div className="text-sm"><p className="font-medium">{section.slot_name_snapshot}</p>{!noRecord && value !== null ? <p className="mt-1 tabular-nums">{formatMealLogNumber(value)} {unit}</p> : null}</div>
            <div className="min-w-0 border-l border-[var(--line-strong)] py-2">{noRecord ? <span className="pl-3 text-sm text-[var(--text-2)]">기록 없음</span> : value === null ? <span className="pl-3 text-sm text-[var(--text-2)]">정보 없음</span> : <><div className="flex h-7 overflow-hidden rounded-r" style={{ width: `${Math.max(0, value) / maximum * 100}%`, background: macro?.color ?? "var(--ui-slate-200)" }}>{!macro && shares ? MEAL_LOG_MACROS.map((part, partIndex) => <span key={part.key} style={{ width: `${shares[partIndex] * 100}%`, background: part.color }} />) : null}</div>{notice ? <span className="pl-2 text-xs text-[var(--text-2)]">{notice}</span> : null}</>}</div>
          </div>;
        })}
        <div aria-hidden="true" className="ml-[100px] flex justify-between border-t border-[var(--line-strong)] pt-2 text-xs tabular-nums">{[0, 1, 2, 3, 4].map(tick => <span key={tick}>{new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(maximum * tick / 4)}</span>)}</div><p className="text-right text-xs text-[var(--text-2)]">{unit}</p>
      </div>
      <section className="mt-8"><h3 className="text-lg font-medium">{macro ? `${label}을 섭취한 음식` : "기록한 음식"}</h3><ul className="mt-3 divide-y divide-[var(--line-strong)]">{contributors.map(entry => <li key={entry.id}><button data-meal-log-contributor={entry.id} type="button" className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left" onClick={() => onEntry(entry)}><span className="min-w-0"><span className="block font-medium">{entry.display_name}</span><span className="text-sm text-[var(--text-2)]">{entry.slot_name_snapshot}</span>{entry.nutrition.contains_ai_estimate ? <span className="block text-xs text-[var(--text-2)]">{mealLogNutritionNotice(entry.nutrition)}</span> : null}</span><span className="shrink-0 tabular-nums">{formatMealLogNumber(entry.nutrition[metric])}{entry.nutrition[metric] !== null ? ` ${unit}` : ""} ›</span></button></li>)}</ul></section>
    </div>
  </div>;
}
