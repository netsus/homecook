"use client";

import React from "react";

import { ModalFooterActions } from "@/components/shared/modal-footer-actions";
import { ModalHeader } from "@/components/shared/modal-header";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
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
  variant?: "default" | "recipe-detail";
  recipePreview?: {
    title: string;
    meta: string;
    emoji: string;
    background: string;
  };
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
  recipePreview,
  variant = "default",
}: PlannerAddSheetProps) {
  const isDesktopViewport = useDesktopViewport();

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

  const selectedColumnName =
    columns.find((column) => column.id === selectedColumnId)?.name ?? "끼니";
  const selectedDateShort = selectedDate ? formatDateLabel(selectedDate) : "";

  if (variant === "recipe-detail" && isDesktopViewport) {
    return (
      <PlannerAddSheet
        columns={columns}
        errorMessage={errorMessage}
        isOpen={isOpen}
        onChangeServings={onChangeServings}
        onClose={onClose}
        onRetryLoad={onRetryLoad}
        onSelectColumn={onSelectColumn}
        onSelectDate={onSelectDate}
        onSubmit={onSubmit}
        selectableDates={selectableDates}
        selectedColumnId={selectedColumnId}
        selectedDate={selectedDate}
        servings={servings}
        sheetState={sheetState}
        variant="default"
      />
    );
  }

  if (variant === "recipe-detail") {
    return (
      <div
        aria-labelledby="planner-add-sheet-title-mobile"
        aria-modal="true"
        className="fixed inset-0 z-40 flex items-end bg-black/40"
        onClick={onClose}
        role="dialog"
      >
        <div
          className="max-h-[85vh] w-full overflow-y-auto rounded-t-[20px] bg-white pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] md:max-w-lg md:rounded-[20px]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-center pt-2">
            <div className="h-1 w-9 rounded-sm bg-[#DEE2E6]" />
          </div>
          <div className="flex items-center px-5 pb-2 pt-3">
            <h2
              className="flex-1 text-[18px] font-bold leading-tight text-[#212529]"
              id="planner-add-sheet-title-mobile"
            >
              플래너에 추가
            </h2>
            <button
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FA] text-[#495057] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              <CloseIcon />
            </button>
          </div>

          {isError ? (
            <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
              <p className="text-[14px] leading-5 text-[#5F6470]">
                {errorMessage ?? "플래너 정보를 불러오지 못했어요."}
              </p>
              <button
                className="min-h-11 rounded-[10px] bg-[#007A76] px-5 text-[14px] font-bold text-white"
                onClick={onRetryLoad}
                type="button"
              >
                다시 시도
              </button>
            </div>
          ) : isLoading ? (
            <div
              aria-label="플래너 정보 불러오는 중"
              className="flex flex-col gap-4 px-5 py-8"
            >
              {[1, 2, 3].map((i) => (
                <div
                  className="h-10 animate-pulse rounded-[10px] bg-[#F8F9FA]"
                  key={i}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="px-5 pb-4 pt-2">
                {recipePreview ? (
                  <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] p-3">
                    <div
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] text-[26px]"
                      style={{ background: recipePreview.background }}
                    >
                      {recipePreview.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold text-[#212529]">
                        {recipePreview.title}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#5F6470]">
                        {recipePreview.meta}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mb-2 text-[13px] font-semibold text-[#495057]">
                  날짜
                </div>
                <div className="scrollbar-hide mb-4 flex gap-1.5 overflow-x-auto pb-1">
                  {selectableDates.map((dateKey) => {
                    const isSelected = dateKey === selectedDate;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "shrink-0 rounded-full border px-3 py-2 text-[13px] transition-colors",
                          isSelected
                            ? "border-[#212529] bg-[#212529] font-bold text-white"
                            : "border-[#DEE2E6] bg-white font-medium text-[#495057]",
                          isSubmitting ? "opacity-60" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={isSubmitting}
                        key={dateKey}
                        onClick={() => onSelectDate(dateKey)}
                        type="button"
                      >
                        {formatWeekdayLabel(dateKey)} {formatDateLabel(dateKey)}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-2 text-[13px] font-semibold text-[#495057]">
                  끼니
                </div>
                <div aria-label="끼니 선택" className="mb-4 grid grid-cols-3 gap-2" role="group">
                  {columns.map((column) => {
                    const isSelected = column.id === selectedColumnId;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "min-h-11 rounded-[10px] border px-2 text-[14px] transition-colors",
                          isSelected
                            ? "border-[#2AC1BC] bg-[#E8F8F7] font-bold text-[#007A76]"
                            : "border-[#DEE2E6] bg-white font-medium text-[#495057]",
                          isSubmitting ? "opacity-60" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={isSubmitting}
                        key={column.id}
                        onClick={() => onSelectColumn(column.id)}
                        type="button"
                      >
                        {column.name}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-2 text-[13px] font-semibold text-[#495057]">
                  인분
                </div>
                <div className="flex items-center justify-between rounded-[10px] border border-[#DEE2E6] bg-[#F8F9FA] p-2.5">
                  <div className="text-[14px] text-[#495057]">
                    몇 인분 계획할까요?
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      aria-label="인분 줄이기"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#DEE2E6] bg-white text-[18px] text-[#212529] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSubmitting || servings <= 1}
                      onClick={() => onChangeServings(Math.max(1, servings - 1))}
                      type="button"
                    >
                      -
                    </button>
                    <div className="min-w-5 text-center text-[15px] font-bold text-[#212529]">
                      {servings}
                    </div>
                    <button
                      aria-label="인분 늘리기"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#212529] text-[18px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSubmitting}
                      onClick={() => onChangeServings(servings + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>

                {errorMessage && sheetState === "ready" ? (
                  <p className="mt-3 text-[13px] font-semibold text-[#C84C48]">
                    {errorMessage}
                  </p>
                ) : null}
              </div>

              <div className="flex gap-2 border-t border-[#DEE2E6] bg-white px-5 pb-2 pt-3">
                <button
                  className="min-h-11 basis-[88px] rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-4 text-[15px] font-bold text-[#495057] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={onClose}
                  type="button"
                >
                  취소
                </button>
                <button
                  aria-label={isSubmitting ? "추가 중…" : "플래너에 추가"}
                  className="min-h-11 flex-1 rounded-[12px] bg-[#007A76] px-4 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#ADB5BD]"
                  disabled={!canSubmit || isSubmitting}
                  onClick={onSubmit}
                  type="button"
                >
                  {isSubmitting
                    ? "추가 중…"
                    : `${selectedDateShort} ${selectedColumnName}에 추가`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-labelledby="planner-add-sheet-title"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 md:items-center md:justify-center"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] pb-6 shadow-[var(--shadow-3)] md:rounded-[var(--radius-xl)] md:border-t-2 md:border-t-[var(--brand)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
        </div>
        {/* Header — D2: no eyebrow · D3: icon-only close */}
        <div className="mb-4 px-5 pt-3 md:px-6 md:pt-5">
          <ModalHeader
            closeDisabled={isSubmitting}
            description="날짜와 끼니를 선택해 주세요"
            onClose={onClose}
            title="플래너에 추가"
            titleId="planner-add-sheet-title"
          />
        </div>

        {/* Error state */}
        {isError ? (
          <div className="flex flex-col items-center gap-4 px-5 py-8 text-center md:px-6">
            <p className="text-sm text-[var(--muted)]">
              {errorMessage ?? "플래너 정보를 불러오지 못했어요."}
            </p>
            <button
              className="rounded-[var(--radius-md)] bg-[var(--olive)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)]"
              onClick={onRetryLoad}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : isLoading ? (
          /* Loading state */
          <div aria-label="플래너 정보 불러오는 중" className="flex flex-col gap-4 px-5 py-8 md:px-6">
            {[1, 2, 3].map((i) => (
              <div className="h-10 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-fill)]" key={i} />
            ))}
          </div>
        ) : (
          /* Ready / Submitting state */
          <div className="flex flex-col gap-4 px-5 md:px-6">
            {/* Date selector — D4: chip = 요일 + M/D */}
            <div>
              <p className="mb-2 text-[13px] font-semibold text-[var(--text-2)]">
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
              <p className="mb-2 text-[13px] font-semibold text-[var(--text-2)]">
                끼니
              </p>
              <div aria-label="끼니 선택" className="grid grid-cols-4 gap-2" role="group">
                {columns.map((col) => {
                  const isSelected = col.id === selectedColumnId;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={[
                        "rounded-[10px] border px-2 py-2.5 text-sm transition-colors",
                        isSelected
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] font-bold text-[var(--brand-deep)]"
                          : "border-[var(--line)] bg-white font-medium text-[var(--text-2)]",
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
              <p className="mb-2 text-[13px] font-semibold text-[var(--text-2)]">
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
              <p className="text-sm text-[var(--brand-deep)]">{errorMessage}</p>
            ) : null}

            {/* Actions — separated by border-top like prototype footer */}
            <div className="border-t border-[var(--line)] pt-3">
              <ModalFooterActions
                cancelDisabled={isSubmitting}
                confirmDisabled={!canSubmit || isSubmitting}
                confirmLabel={isSubmitting ? "추가 중…" : "플래너에 추가"}
                onCancel={onClose}
                onConfirm={onSubmit}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
