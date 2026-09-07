"use client";

import React from "react";
import { useWeekSwipePager } from "@/components/planner/use-week-swipe-pager";
import { PlannerDateControls } from "@/components/planner/planner-date-controls";

import { formatKoreaCompactDate, formatKoreaWeekday } from "@/lib/korean-date";

interface PlannerWeekNavigationProps {
  startDate: string;
  endDate: string;
  selectedDate: string;
  today: string;
  isCurrentWeek: boolean;
  onDateSelect: (date: string) => void;
  onShiftWeek: (days: number) => void | Promise<void>;
  onCurrentWeek: () => void;
  mode?: "plan" | "log";
  recordedDates?: string[];
  dateBarRef?: React.Ref<HTMLDivElement>;
  dateAnchorRef?: React.Ref<HTMLDivElement>;
  actions?: React.ReactNode;
}

export function PlannerWeekNavigation({
  startDate, selectedDate, today, isCurrentWeek,
  onDateSelect, onShiftWeek, onCurrentWeek, dateBarRef, dateAnchorRef, actions,
  mode = "plan", recordedDates = [],
}: PlannerWeekNavigationProps) {
  const { railRef, weeks, handlers } = useWeekSwipePager(startDate, onShiftWeek);
  const dateRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const isLog = mode === "log";

  React.useLayoutEffect(() => {
    const rail = railRef.current;
    const selected = dateRefs.current.get(selectedDate);
    if (!rail || !selected) return;
    const railRect = rail.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    if (selectedRect.left < railRect.left) {
      rail.scrollLeft -= railRect.left - selectedRect.left + 4;
    } else if (selectedRect.right > railRect.right) {
      rail.scrollLeft += selectedRect.right - railRect.right + 4;
    }
  }, [railRef, selectedDate, startDate]);

  function handleDateKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!isLog || !["ArrowLeft", "ArrowRight", "Home", "End", " ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    let targetIndex = index;
    if (event.key === "ArrowLeft") targetIndex = Math.max(0, index - 1);
    if (event.key === "ArrowRight") targetIndex = Math.min(6, index + 1);
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = 6;
    const date = weeks[1][targetIndex];
    if (date !== selectedDate) onDateSelect(date);
    dateRefs.current.get(date)?.focus({ preventScroll: true });
  }

  return (
    <section aria-label="주간 이동" className="contents" data-testid="planner-week-shell">
      <PlannerDateControls date={selectedDate} today={today} onDateSelect={onDateSelect} actions={actions} />
      <div aria-hidden="true" className="h-0" ref={dateAnchorRef} />
      <div className="sticky top-0 z-30 bg-[var(--surface-fill)] px-4 py-1.5 lg:static lg:mx-auto lg:max-w-7xl lg:pb-2" ref={dateBarRef} data-testid="planner-sticky-dates">
      <p className="sr-only" id="planner-week-swipe-help">{isLog ? "날짜 줄을 좌우로 넘기면 주가 바뀝니다. 키보드 PageUp, PageDown으로도 주를 이동할 수 있어요." : "날짜 줄을 좌우로 넘기거나 방향키를 누르면 이전 주 또는 다음 주로 이동합니다."}</p>
      <div
        aria-describedby="planner-week-swipe-help"
        aria-label={isLog ? "식사 기록 주간 이동" : "주간 날짜 스트립"}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid={isLog ? "meal-log-week-date-rail" : "planner-week-date-rail"}
        onKeyDown={(event) => {
          if (isLog) {
            if (event.key === "PageUp" || event.key === "PageDown") {
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              onShiftWeek(event.key === "PageUp" ? -7 : 7);
            }
            return;
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            onShiftWeek(event.key === "ArrowLeft" ? -7 : 7);
          } else if (event.key === "Home") {
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            if (!isCurrentWeek) onCurrentWeek();
          }
        }}
        {...handlers}
        ref={railRef}
        tabIndex={0}
      >
        {weeks.map((dates, page) => (
          <ol aria-hidden={page !== 1 ? true : undefined} aria-label={page === 1 ? (isLog ? "식사 기록 날짜 선택" : "주간 날짜") : undefined} className="grid w-full min-w-[340px] shrink-0 snap-center snap-always grid-cols-7 gap-[4px] p-[4px]" key={page} role={isLog ? "radiogroup" : undefined}>
            {dates.map((date, index) => (
              <li className="min-w-0" key={date} role={isLog ? "none" : undefined}>
                <button
                  aria-checked={isLog ? date === selectedDate : undefined}
                  aria-current={page === 1 && date === selectedDate ? "date" : undefined}
                  aria-label={`${formatKoreaCompactDate(date)} ${formatKoreaWeekday(date, "short")}${isLog ? "요일" : ""} 선택${isLog && recordedDates.includes(date) ? ", 기록 있음" : ""}`}
                  className={[
                    "relative flex h-12 w-full flex-col items-center justify-center rounded-lg text-sm font-normal focus-visible:outline-2 focus-visible:outline-[var(--brand)]",
                    date === selectedDate
                      ? isLog || date === today
                        ? "bg-[var(--brand-accent)] text-white"
                        : "bg-[var(--brand-accent)] text-white lg:bg-[var(--surface)] lg:text-[var(--text-2)]"
                      : date === today
                        ? isLog
                          ? "text-[var(--brand-primary-text)] ring-1 ring-inset ring-[var(--brand-border)]"
                          : "text-[var(--brand-primary-text)] ring-1 ring-inset ring-[var(--brand-accent)] lg:bg-[var(--brand-accent)] lg:text-white lg:ring-0"
                        : "bg-[var(--surface)] text-[var(--text-2)]",
                  ].join(" ")}
                  onClick={() => { if (page === 1) onDateSelect(date); }}
                  onKeyDown={(event) => { if (page === 1) handleDateKeyDown(event, index); }}
                  ref={(node) => {
                    if (page !== 1) return;
                    if (node) dateRefs.current.set(date, node);
                    else dateRefs.current.delete(date);
                  }}
                  role={isLog ? "radio" : undefined}
                  tabIndex={page === 1 && (!isLog || date === selectedDate) ? 0 : -1}
                  type="button"
                >
                  <span className="text-[10px] font-normal">{date === today ? "오늘" : formatKoreaWeekday(date, "short")}</span>
                  <span className="text-sm font-extrabold">{Number(date.slice(8))}</span>
                </button>
              </li>
            ))}
          </ol>
        ))}
      </div>
      </div>
    </section>
  );
}
