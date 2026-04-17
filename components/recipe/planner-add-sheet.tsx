"use client";

import React from "react";

import { ModalFooterActions } from "@/components/shared/modal-footer-actions";
import { ModalHeader } from "@/components/shared/modal-header";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
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

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** `YYYY-MM-DD` → `M/D` (D4: compact chip format) */
function formatDateLabel(dateKey: string) {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}/${d}`;
}

/** `YYYY-MM-DD` → `요일` 2자 (locale-independent, UTC 기준) */
function formatWeekdayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return WEEKDAY_KO[date.getUTCDay()];
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
  const canSubmit =
    sheetState === "ready" &&
    Boolean(selectedDate) &&
    Boolean(selectedColumnId) &&
    servings >= 1;

  const dateChips = selectableDates.map((dateKey) => ({
    value: dateKey,
    topLabel: formatWeekdayLabel(dateKey),
    bottomLabel: formatDateLabel(dateKey),
  }));

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
        {/* Header — D2: no eyebrow · D3: icon-only close */}
        <div className="mb-5">
          <ModalHeader
            closeDisabled={isSubmitting}
            onClose={onClose}
            title="플래너에 추가"
            titleId="planner-add-sheet-title"
          />
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
              <div className="h-10 animate-pulse rounded-[12px] bg-white/60" key={i} />
            ))}
          </div>
        ) : (
          /* Ready / Submitting state */
          <div className="flex flex-col gap-5">
            {/* Date selector — D4: chip = 요일 + M/D */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                날짜
              </p>
              <SelectionChipRail
                ariaLabel="날짜 선택"
                chips={dateChips}
                disabled={isSubmitting}
                onSelect={onSelectDate}
                selectedValue={selectedDate}
              />
            </div>

            {/* Column (meal slot) selector */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                끼니
              </p>
              <div aria-label="끼니 선택" className="grid grid-cols-4 gap-2" role="group">
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
                      ]
                        .filter(Boolean)
                        .join(" ")}
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
              <NumericStepperCompact
                disabled={isSubmitting}
                min={1}
                onChange={onChangeServings}
                unit="인분"
                value={servings}
              />
            </div>

            {/* Submit error */}
            {errorMessage && sheetState === "ready" ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}

            {/* Actions */}
            <ModalFooterActions
              cancelDisabled={isSubmitting}
              confirmDisabled={!canSubmit || isSubmitting}
              confirmLabel={isSubmitting ? "추가 중…" : "플래너에 추가"}
              onCancel={onClose}
              onConfirm={onSubmit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
