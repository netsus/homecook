"use client";

import React from "react";

import type { PlannerColumnData } from "@/types/planner";

export type PlannerAddSheetState = "loading-columns" | "ready" | "submitting" | "error";

interface PlannerAddSheetProps {
  isOpen: boolean;
  sheetState: PlannerAddSheetState;
  columns: PlannerColumnData[];
  selectableDates: string[];
  selectedDate: string;
  selectedColumnId: string;
  servings: number;
  errorMessage: string | null;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  onSelectColumn: (columnId: string) => void;
  onChangeServings: (value: number) => void;
  onSubmit: () => void;
  onRetryLoad: () => void;
}

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatWeekdayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

/** 선택된 날짜 확인 텍스트: `요일 M월 D일` (예: `목 4월 17일`) */
function formatSelectedDateLabel(dateKey: string) {
  if (!dateKey) return "";
  return `${formatWeekdayLabel(dateKey)} ${formatDateLabel(dateKey)}`;
}

export function PlannerAddSheet({
  isOpen,
  sheetState,
  columns,
  selectableDates,
  selectedDate,
  selectedColumnId,
  servings,
  errorMessage,
  onClose,
  onSelectDate,
  onSelectColumn,
  onChangeServings,
  onSubmit,
  onRetryLoad,
}: PlannerAddSheetProps) {
  if (!isOpen) {
    return null;
  }

  const isSubmitting = sheetState === "submitting";
  const isLoading = sheetState === "loading-columns";
  const isError = sheetState === "error";
  const canSubmit = sheetState === "ready" && Boolean(selectedDate) && Boolean(selectedColumnId) && servings >= 1;

  return (
    <div
      aria-labelledby="planner-add-sheet-title"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end bg-black/50 p-4 md:items-center md:justify-center"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="glass-panel w-full max-w-lg rounded-[20px] px-5 py-6 md:px-6"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              플래너에 추가
            </p>
            <h2
              className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]"
              id="planner-add-sheet-title"
            >
              플래너에 추가
            </h2>
          </div>
          <button
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:bg-white/60"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <svg fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Error state */}
        {isError ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-[var(--muted)]">
              {errorMessage ?? "플래너 정보를 불러오지 못했어요."}
            </p>
            <button
              className="rounded-[12px] bg-[var(--olive)] px-5 py-2.5 text-sm font-semibold text-white"
              onClick={onRetryLoad}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : isLoading ? (
          /* Loading state */
          <div aria-label="플래너 정보 불러오는 중" className="flex flex-col gap-4 py-8">
            {[1, 2, 3].map((i) => (
              <div
                className="h-10 animate-pulse rounded-[12px] bg-white/60"
                key={i}
              />
            ))}
          </div>
        ) : (
          /* Ready / Submitting state */
          <div className="flex flex-col gap-5">
            {/* Date selector */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                날짜
              </p>
              <div
                aria-label="날짜 선택"
                className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
                role="group"
              >
                {selectableDates.map((dateKey) => {
                  const isSelected = dateKey === selectedDate;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={[
                        "flex min-w-[52px] flex-col items-center rounded-[14px] px-2.5 py-2.5 text-center transition-colors",
                        isSelected
                          ? "bg-[var(--olive)] text-white"
                          : "bg-white/60 text-[var(--foreground)] hover:bg-white/80",
                        isSubmitting ? "opacity-60" : "",
                      ].join(" ")}
                      disabled={isSubmitting}
                      key={dateKey}
                      onClick={() => onSelectDate(dateKey)}
                      type="button"
                    >
                      <span className="text-[10px] font-semibold leading-tight">
                        {formatWeekdayLabel(dateKey)}
                      </span>
                      <span className="mt-0.5 text-xs font-bold leading-tight">
                        {formatDateLabel(dateKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected date confirmation label */}
            {selectedDate ? (
              <p
                aria-live="polite"
                className="mt-[-8px] text-xs font-medium text-[var(--olive)]"
              >
                {formatSelectedDateLabel(selectedDate)}
              </p>
            ) : null}

            {/* Column (meal slot) selector */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                끼니
              </p>
              <div
                aria-label="끼니 선택"
                className="grid grid-cols-4 gap-2"
                role="group"
              >
                {columns.map((col) => {
                  const isSelected = col.id === selectedColumnId;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={[
                        "rounded-[14px] px-2 py-3 text-sm font-semibold transition-colors",
                        isSelected
                          ? "bg-[var(--olive)] text-white"
                          : "bg-white/60 text-[var(--foreground)] hover:bg-white/80",
                        isSubmitting ? "opacity-60" : "",
                      ].join(" ")}
                      disabled={isSubmitting}
                      key={col.id}
                      onClick={() => onSelectColumn(col.id)}
                      type="button"
                    >
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Servings stepper */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                계획 인분
              </p>
              <div className="flex items-center gap-3 rounded-[14px] bg-white/60 px-4 py-3">
                <button
                  aria-label="인분 줄이기"
                  className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--line)] bg-white text-lg font-medium disabled:opacity-40"
                  disabled={isSubmitting || servings <= 1}
                  onClick={() => onChangeServings(Math.max(1, servings - 1))}
                  type="button"
                >
                  −
                </button>
                <span
                  aria-label={`${servings}인분`}
                  aria-live="polite"
                  className="min-w-16 text-center text-lg font-semibold"
                >
                  {servings}인분
                </span>
                <button
                  aria-label="인분 늘리기"
                  className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--line)] bg-white text-lg font-medium disabled:opacity-40"
                  disabled={isSubmitting}
                  onClick={() => onChangeServings(servings + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            {/* Submit error */}
            {errorMessage && sheetState === "ready" ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)] hover:bg-white/80 disabled:opacity-40"
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
              >
                취소
              </button>
              <button
                className="flex-[2] rounded-[14px] bg-[var(--olive)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
                disabled={!canSubmit || isSubmitting}
                onClick={onSubmit}
                type="button"
              >
                {isSubmitting ? "추가 중…" : "플래너에 추가"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
