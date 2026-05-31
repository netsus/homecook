"use client";

import React from "react";

import {
  AppBottomSheet,
  AppModalFooterActions,
  AppStepper,
} from "@/components/shared/app-overlay";
import { ModalFooterActions } from "@/components/shared/modal-footer-actions";
import { ModalHeader } from "@/components/shared/modal-header";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebChip,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
} from "@/components/web";
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
  const shouldScrollMealColumns = columns.length > 4;
  const mealColumnGroupClass = shouldScrollMealColumns
    ? "scrollbar-hide mb-4 flex gap-2 overflow-x-auto pb-1"
    : [
        "mb-4 grid gap-2",
        columns.length === 4 ? "grid-cols-4" : "grid-cols-3",
      ].join(" ");

  if (variant === "recipe-detail") {
    return (
      <>
      {!isDesktopViewport ? (
        <AppBottomSheet
          ariaLabelledBy="planner-add-sheet-title-mobile"
          closeDisabled={isSubmitting}
          description="날짜와 끼니를 선택해 주세요"
          footer={
            !isError && !isLoading ? (
              <AppModalFooterActions
                cancelDisabled={isSubmitting}
                confirmAriaLabel={isSubmitting ? "추가 중…" : "플래너에 추가"}
                confirmDisabled={!canSubmit || isSubmitting}
                confirmLabel={
                  isSubmitting
                    ? "추가 중…"
                    : `${selectedDateShort} ${selectedColumnName}에 추가`
                }
                onCancel={onClose}
                onConfirm={onSubmit}
              />
            ) : null
          }
          onClose={onClose}
          title="플래너에 추가"
        >
          {isError ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-[14px] leading-5 text-[var(--wave1-text-2)]">
                {errorMessage ?? "플래너 정보를 불러오지 못했어요."}
              </p>
              <button
                className="min-h-[var(--control-height-md)] rounded-[var(--radius-control)] bg-[var(--wave1-mint-contrast)] px-5 text-[14px] font-bold text-[var(--text-inverse)]"
                onClick={onRetryLoad}
                type="button"
              >
                다시 시도
              </button>
            </div>
          ) : isLoading ? (
            <div
              aria-label="플래너 정보 불러오는 중"
              className="flex flex-col gap-4 py-8"
            >
              {[1, 2, 3].map((i) => (
                <div
                  className="h-10 animate-pulse rounded-[var(--radius-control)] bg-[var(--wave1-surface-fill)]"
                  key={i}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {recipePreview ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--wave1-border)] bg-[var(--wave1-surface-fill)] p-3">
                  <div
                    aria-hidden="true"
                    className="flex h-[var(--control-height-lg)] w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[26px]"
                    style={{ background: recipePreview.background }}
                  >
                    {recipePreview.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-[var(--wave1-ink)]">
                      {recipePreview.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--wave1-text-2)]">
                      {recipePreview.meta}
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--wave1-text-2)]">
                  날짜
                </div>
                <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
                  {selectableDates.map((dateKey) => {
                    const isSelected = dateKey === selectedDate;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "shrink-0 rounded-[var(--radius-chip)] border px-3 py-2 text-[13px] transition-colors",
                          isSelected
                            ? "border-[var(--wave1-ink)] bg-[var(--wave1-ink)] font-bold text-[var(--text-inverse)]"
                            : "border-[var(--wave1-border)] bg-[var(--surface)] font-medium text-[var(--wave1-text-2)]",
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
              </div>

              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--wave1-text-2)]">
                  끼니
                </div>
                <div aria-label="끼니 선택" className={mealColumnGroupClass} role="group">
                  {columns.map((column) => {
                    const isSelected = column.id === selectedColumnId;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "min-h-[var(--control-height-md)] rounded-[var(--radius-control)] border px-2 text-[14px] transition-colors",
                          shouldScrollMealColumns ? "min-w-[76px] shrink-0" : "min-w-0",
                          isSelected
                            ? "border-[var(--wave1-mint-contrast)] bg-[var(--wave1-mint-soft)] font-semibold text-[var(--wave1-mint-contrast)]"
                            : "border-[var(--wave1-border)] bg-[var(--surface)] font-medium text-[var(--wave1-text-2)]",
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
              </div>

              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--wave1-text-2)]">
                  인분
                </div>
                <AppStepper
                  disabled={isSubmitting}
                  label="인분 조절"
                  min={1}
                  onChange={onChangeServings}
                  unit="인분"
                  value={servings}
                  variant="compact"
                />
              </div>

              {errorMessage && sheetState === "ready" ? (
                <p className="text-[13px] font-semibold text-[var(--danger-strong)]">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          )}
        </AppBottomSheet>
      ) : null}
      {isDesktopViewport ? (
        <WebModal onBackdropClick={onClose}>
          <WebDialog
            aria-labelledby="planner-add-sheet-title-desktop"
            size="wide"
          >
            <WebDialogHeader>
              <div>
                <WebDialogTitle id="planner-add-sheet-title-desktop">
                  플래너에 추가
                </WebDialogTitle>
                <p className="web-modal-copy">날짜와 끼니를 선택해 주세요</p>
              </div>
              <WebIconButton
                aria-label="닫기"
                disabled={isSubmitting}
                onClick={onClose}
              >
                <CloseIcon />
              </WebIconButton>
            </WebDialogHeader>

            {isError ? (
              <WebDialogBody>
                <div className="web-modal-panel web-modal-panel-error">
                  <p className="web-modal-copy">
                    {errorMessage ?? "플래너 정보를 불러오지 못했어요."}
                  </p>
                  <WebButton className="mt-3" onClick={onRetryLoad} size="sm">
                    다시 시도
                  </WebButton>
                </div>
              </WebDialogBody>
            ) : isLoading ? (
              <WebDialogBody>
                <div
                  aria-label="플래너 정보 불러오는 중"
                  className="flex flex-col gap-3"
                >
                  {[1, 2, 3].map((i) => (
                    <div className="web-skeleton h-10" key={i} />
                  ))}
                </div>
              </WebDialogBody>
            ) : (
              <>
                <WebDialogBody>
                  {recipePreview ? (
                    <div className="web-modal-preview">
                      <div
                        aria-hidden="true"
                        className="web-modal-preview-thumb"
                        style={{ background: recipePreview.background }}
                      >
                        {recipePreview.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="web-modal-preview-title">
                          {recipePreview.title}
                        </div>
                        <div className="web-modal-preview-meta">
                          {recipePreview.meta}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <p className="web-modal-section-label">날짜</p>
                  <div
                    aria-label="날짜 선택"
                    className="web-planner-date-grid mb-5"
                    role="group"
                  >
                    {selectableDates.map((dateKey, index) => {
                      const isSelected = dateKey === selectedDate;
                      const isToday = index === 0;

                      return (
                        <WebChip
                          active={isSelected}
                          className="web-planner-date-cell"
                          disabled={isSubmitting}
                          key={dateKey}
                          onClick={() => onSelectDate(dateKey)}
                        >
                          {isToday ? (
                            <span className="web-planner-date-today">오늘</span>
                          ) : null}
                          <span className="web-planner-date-weekday">
                            {formatWeekdayLabel(dateKey)}
                          </span>
                          <span className="web-planner-date-day">
                            {formatDateLabel(dateKey)}
                          </span>
                        </WebChip>
                      );
                    })}
                  </div>

                  <p className="web-modal-section-label">끼니</p>
                  <div
                    aria-label="끼니 선택"
                    className="web-modal-chip-grid mb-5"
                    role="group"
                  >
                    {columns.map((column) => {
                      const isSelected = column.id === selectedColumnId;

                      return (
                        <WebChip
                          active={isSelected}
                          disabled={isSubmitting}
                          key={column.id}
                          onClick={() => onSelectColumn(column.id)}
                        >
                          {column.name}
                        </WebChip>
                      );
                    })}
                  </div>

                  <p className="web-modal-section-label">인분</p>
                  <div className="web-modal-stepper-row">
                    <span className="web-modal-copy">인분 조절</span>
                    <div className="web-stepper">
                      <button
                        aria-label="인분 줄이기"
                        disabled={isSubmitting || servings <= 1}
                        onClick={() => onChangeServings(Math.max(1, servings - 1))}
                        type="button"
                      >
                        -
                      </button>
                      <span>{servings}인분</span>
                      <button
                        aria-label="인분 늘리기"
                        disabled={isSubmitting}
                        onClick={() => onChangeServings(servings + 1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {errorMessage && sheetState === "ready" ? (
                    <p className="web-modal-panel web-modal-panel-error mt-4">
                      {errorMessage}
                    </p>
                  ) : null}
                </WebDialogBody>
                <WebDialogFooter>
                  <span className="web-modal-footer-note">
                    {selectedDateShort} {selectedColumnName}
                  </span>
                  <WebButton
                    disabled={isSubmitting}
                    onClick={onClose}
                    variant="tertiary"
                  >
                    취소
                  </WebButton>
                  <WebButton
                    disabled={!canSubmit || isSubmitting}
                    onClick={onSubmit}
                  >
                    {isSubmitting ? "추가 중..." : "플래너에 추가"}
                  </WebButton>
                </WebDialogFooter>
              </>
            )}
          </WebDialog>
        </WebModal>
      ) : null}
      </>
    );
  }

  return (
    <div
      aria-labelledby="planner-add-sheet-title"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 lg:items-center lg:justify-center"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] pb-6 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)] lg:border-t-2 lg:border-t-[var(--brand)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2 lg:hidden">
          <div className="h-1 w-9 rounded-[var(--radius-badge)] bg-[var(--line)]" />
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
              className="rounded-[var(--radius-md)] bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)]"
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
                        "rounded-[var(--radius-control)] border px-2 py-2.5 text-sm transition-colors",
                        isSelected
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] font-bold text-[var(--brand-deep)]"
                          : "border-[var(--line)] bg-[var(--surface)] font-medium text-[var(--text-2)]",
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
