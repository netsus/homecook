"use client";

import React, { useEffect, useRef, useState } from "react";
import { AppBottomSheet } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

interface PlannerDateControlsProps {
  date: string;
  today: string;
  onDateSelect: (date: string) => void;
  actions?: React.ReactNode;
}

type CalendarView = "days" | "months" | "years";
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
function calendarDate(year: number, month: number, day: number) {
  const value = new Date(0);
  value.setUTCFullYear(year, month, day);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }

function CalendarSheet({ date, today, onSelect, onClose }: {
  date: string; today: string; onSelect: (date: string) => void; onClose: () => void;
}) {
  const [cursor, setCursor] = useState({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
  const [view, setView] = useState<CalendarView>("days");
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLButtonElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  useDialogBoundary({ dialogRef: panelRef, onClose, initialFocusRef: headingRef });
  const { year, month } = cursor;
  const first = calendarDate(year, month, 1);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = calendarDate(year, month + 1, 0).getUTCDate();
  const yearStart = Math.floor(year / 12) * 12;

  useEffect(() => {
    if (!focusDate) return;
    dayRefs.current.get(focusDate)?.focus({ preventScroll: true });
    setFocusDate(null);
  }, [focusDate, cursor]);

  function shift(direction: number) {
    const next = view === "days" ? calendarDate(year, month + direction, 1)
      : calendarDate(year + direction * (view === "years" ? 12 : 1), month, 1);
    if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) return;
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }
  function moveDay(event: React.KeyboardEvent<HTMLButtonElement>, key: string) {
    const current = new Date(`${key}T00:00:00Z`);
    const weekday = (current.getUTCDay() + 6) % 7;
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday } as Record<string, number>)[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    current.setUTCDate(current.getUTCDate() + delta);
    if (current.getUTCFullYear() < 1 || current.getUTCFullYear() > 9999) return;
    setCursor({ year: current.getUTCFullYear(), month: current.getUTCMonth() });
    setFocusDate(dateKey(current));
  }
  const previousLabel = view === "days" ? "이전 달" : view === "months" ? "이전 해" : "이전 연도 범위";
  const nextLabel = view === "days" ? "다음 달" : view === "months" ? "다음 해" : "다음 연도 범위";
  return <AppBottomSheet ariaLabelledBy="planner-calendar-title" title="날짜 선택" panelRef={panelRef} onClose={onClose} panelClassName="sm:max-w-sm" bodyClassName="pb-[calc(16px+env(safe-area-inset-bottom))]">
    <div className="mb-3 flex items-center justify-between">
      <button aria-label={previousLabel} className="h-11 w-11 rounded-xl text-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] hover:bg-[var(--ui-sky-50)]" onClick={() => shift(-1)} type="button">‹</button>
      <button aria-label={view === "days" ? "월 선택" : view === "months" ? "연도 선택" : "월 선택으로 돌아가기"} className="min-h-11 rounded-xl px-3 text-base font-extrabold text-[var(--ui-slate-800)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] hover:bg-[var(--ui-sky-50)]" ref={headingRef} onClick={() => setView(view === "days" ? "months" : view === "months" ? "years" : "months")} type="button">
        {view === "days" ? `${year}년 ${month + 1}월` : view === "months" ? `${year}년` : `${yearStart}–${yearStart + 11}년`} <span aria-hidden="true" className="text-[var(--ui-slate-400)]">⌄</span>
      </button>
      <button aria-label={nextLabel} className="h-11 w-11 rounded-xl text-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] hover:bg-[var(--ui-sky-50)]" onClick={() => shift(1)} type="button">›</button>
    </div>
    {view === "days" ? <>
      <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-xs text-[var(--ui-slate-400)]">{WEEKDAYS.map(day => <span className="py-2" key={day}>{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1" aria-label={`${year}년 ${month + 1}월 날짜`}>
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1; const key = dateKey(calendarDate(year, month, day));
          return <button aria-label={`${year}년 ${month + 1}월 ${day}일`} aria-pressed={key === date} aria-current={key === today ? "date" : undefined} className={`min-h-11 rounded-xl text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] ${key === date ? "bg-[var(--ui-sky-100)] text-[var(--ui-sky-800)]" : key === today ? "font-extrabold text-[var(--ui-sky-700)] underline decoration-[var(--ui-sky-400)] underline-offset-4" : "text-[var(--ui-slate-700)] hover:bg-[var(--ui-sky-50)]"}`} key={key} ref={node => { if (node) dayRefs.current.set(key, node); else dayRefs.current.delete(key); }} onKeyDown={event => moveDay(event, key)} onClick={() => onSelect(key)} type="button">{day}</button>;
        })}
      </div>
    </> : <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 12 }, (_, index) => {
        const value = view === "months" ? index : yearStart + index;
        const selected = view === "months" ? value === month : value === year;
        return <button className={`min-h-12 rounded-xl text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] ${selected ? "bg-[var(--ui-sky-100)] text-[var(--ui-sky-800)]" : "text-[var(--ui-slate-700)] hover:bg-[var(--ui-sky-50)]"}`} disabled={view === "years" && (value < 1 || value > 9999)} key={value} onClick={() => {
          setCursor(view === "months" ? { year, month: value } : { year: value, month });
          setView(view === "months" ? "days" : "months");
          headingRef.current?.focus({ preventScroll: true });
        }} type="button">{view === "months" ? `${value + 1}월` : `${value}년`}</button>;
      })}
    </div>}
  </AppBottomSheet>;
}

export function PlannerDateControls({ date, today, onDateSelect, actions }: PlannerDateControlsProps) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const selectRef = useRef(onDateSelect);
  selectRef.current = onDateSelect;
  useEffect(() => {
    if (open || !pendingDate) return;
    // Close/unlock and restore the button focus before the planner scrolls to the date.
    const frame = requestAnimationFrame(() => { setPendingDate(null); selectRef.current(pendingDate); });
    return () => cancelAnimationFrame(frame);
  }, [open, pendingDate]);
  return <>
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-1 px-4 py-2 lg:py-3">
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="달력에서 날짜 선택" aria-haspopup="dialog" aria-expanded={open} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--ui-slate-300)] bg-[var(--ui-white)] shadow-sm px-2 text-xs font-bold text-[var(--ui-slate-800)] focus-visible:ring-2 focus-visible:ring-[var(--ui-sky-400)] sm:px-3 sm:text-sm" onClick={() => { setPendingDate(null); setOpen(true); }} type="button">
          <svg aria-hidden="true" className="h-4 w-4 text-[var(--ui-sky-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></svg>
          <span>{Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</span><span aria-hidden="true" className="text-[var(--ui-slate-400)]">⌄</span>
        </button>
        <button className="min-h-11 min-w-11 rounded-xl border border-[var(--brand-accent)] bg-[var(--brand-accent)] px-3 text-xs font-bold text-[var(--text-inverse)] shadow-sm hover:bg-[var(--brand-accent-hover)]" onClick={() => onDateSelect(today)} type="button">오늘</button>
      </div>
      {actions}
    </div>
    {open ? <CalendarSheet date={date} today={today} onClose={() => setOpen(false)} onSelect={key => { setPendingDate(key); setOpen(false); }} /> : null}
  </>;
}
