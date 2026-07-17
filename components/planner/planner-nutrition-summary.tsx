"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { AppCenterDialog } from "@/components/shared/app-overlay";
import {
  buildPlannerNutritionWarningMessages,
  formatPlannerNutritionEnergy,
  formatPlannerNutritionQuality,
  formatPlannerNutritionValue,
  PLANNER_NUTRITION_LABELS,
} from "@/lib/planner/planner-nutrition-presentation";
import {
  PLANNER_NUTRITION_CORE_CODES,
  type PlannerNutritionAggregate,
  type PlannerNutritionDaySummary,
} from "@/types/planner-nutrition";
import type { PlannerNutritionRequestStatus } from "@/components/planner/use-planner-nutrition-summary";

interface SharedSummaryProps {
  error: string | null;
  isRefreshing: boolean;
  nutrition: PlannerNutritionAggregate | null;
  onRetry: () => void;
  status: PlannerNutritionRequestStatus;
}

export function PlannerWeekNutritionSummary({
  days,
  error,
  isRefreshing,
  nutrition,
  onRetry,
  status,
}: SharedSummaryProps & { days: PlannerNutritionDaySummary[] }) {
  const showInitialLoading = status === "loading" && nutrition === null;
  const showEmpty = status === "empty";

  return (
    <section
      aria-busy={isRefreshing || showInitialLoading}
      aria-label={`${days.length}일 계획 영양`}
      className="rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 py-2.5"
      data-testid="planner-week-nutrition-summary"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-[var(--text-3)]">계획 영양</p>
          {showInitialLoading ? (
            <p className="mt-1 text-[14px] font-bold text-[var(--text-3)]">불러오는 중</p>
          ) : showEmpty || nutrition === null ? (
            <p className="mt-1 text-[14px] font-bold text-[var(--text-2)]">
              계획 영양 정보 없음
            </p>
          ) : (
            <p className="mt-1 truncate text-[16px] font-extrabold text-[var(--foreground)]">
              {formatPlannerNutritionEnergy(nutrition.values.energy_kcal)}
            </p>
          )}
        </div>

        {nutrition && nutrition.incomplete_entry_count > 0 ? (
          <span className="shrink-0 rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--brand-primary-text)]">
            {nutrition.incomplete_entry_count}개 확인 필요
          </span>
        ) : null}
      </div>

      {status === "error" ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-2 text-[12px] text-[var(--text-3)]">
          <span>{error ?? "계획 영양을 불러오지 못했어요."}</span>
          <button
            className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 font-bold text-[var(--brand-primary-text)]"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function PlannerDayNutritionSummary({
  nutrition,
}: {
  nutrition: PlannerNutritionAggregate | null;
}) {
  if (!nutrition) {
    return (
      <span className="text-[11px] font-bold text-[var(--text-3)]">
        영양 정보 준비 중
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] font-bold text-[var(--text-3)]">
      <span>{formatPlannerNutritionEnergy(nutrition.values.energy_kcal)}</span>
      {nutrition.incomplete_entry_count > 0 ? (
        <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[var(--brand-primary-text)]">
          {nutrition.incomplete_entry_count}개 확인 필요
        </span>
      ) : null}
    </span>
  );
}

function WarningDialog({
  messages,
  onClose,
}: {
  messages: string[];
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <AppCenterDialog
      ariaLabelledBy="planner-nutrition-warning-title"
      closeButtonRef={closeButtonRef}
      onClose={onClose}
      title="계획 영양 확인 안내"
    >
      <ul className="space-y-2 text-sm leading-relaxed text-[var(--text-2)]">
        {messages.map((message) => (
          <li className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3" key={message}>
            {message}
          </li>
        ))}
      </ul>
    </AppCenterDialog>
  );
}

export function MealNutritionSummary({
  error,
  isRefreshing,
  nutrition,
  onRetry,
  status,
}: SharedSummaryProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  const warningButtonRef = useRef<HTMLButtonElement>(null);
  const messages = buildPlannerNutritionWarningMessages(nutrition?.warnings ?? []);

  const closeWarnings = useCallback(() => {
    setWarningOpen(false);
    warningButtonRef.current?.focus();
  }, []);

  if (status === "loading" && nutrition === null) {
    return (
      <section
        aria-busy="true"
        aria-label="계획 영양 불러오는 중"
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4"
        data-testid="meal-nutrition-summary"
      >
        <p className="text-sm font-bold text-[var(--text-3)]">계획 영양 불러오는 중</p>
      </section>
    );
  }

  if (status === "empty" || nutrition === null) {
    return (
      <section
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4"
        data-testid="meal-nutrition-summary"
      >
        <p className="text-[13px] font-extrabold text-[var(--text-3)]">계획 영양</p>
        <p className="mt-1 text-[15px] font-bold text-[var(--foreground)]">
          계획 영양 정보 없음
        </p>
      </section>
    );
  }

  return (
    <>
      <section
        aria-busy={isRefreshing}
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-[0_1px_3px_var(--shadow-color-subtle)]"
        data-testid="meal-nutrition-summary"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-extrabold text-[var(--text-3)]">계획 영양</p>
            <p className="mt-1 text-[13px] font-bold text-[var(--text-2)]">
              {formatPlannerNutritionQuality(nutrition.calculation_quality)}
            </p>
          </div>
          {nutrition.incomplete_entry_count > 0 ? (
            <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--brand-primary-text)]">
              {nutrition.incomplete_entry_count}개 확인 필요
            </span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          {PLANNER_NUTRITION_CORE_CODES.map((code) => (
            <div className={code === "energy_kcal" ? "col-span-2 sm:col-span-1" : ""} key={code}>
              <dt className="text-[11px] font-bold text-[var(--text-3)]">
                {PLANNER_NUTRITION_LABELS[code]}
              </dt>
              <dd className="mt-0.5 text-[14px] font-extrabold text-[var(--foreground)]">
                {formatPlannerNutritionValue(code, nutrition.values[code])}
              </dd>
            </div>
          ))}
        </dl>

        {messages.length > 0 ? (
          <button
            aria-label={`확인 필요 안내 ${messages.length}개 보기`}
            className="mt-4 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 text-[13px] font-bold text-[var(--brand-primary-text)]"
            onClick={() => setWarningOpen(true)}
            ref={warningButtonRef}
            type="button"
          >
            확인 필요 안내 보기
          </button>
        ) : null}

        {status === "error" ? (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--text-3)]">
            <span>{error ?? "계획 영양을 불러오지 못했어요."}</span>
            <button
              className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 font-bold text-[var(--brand-primary-text)]"
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}
      </section>

      {warningOpen ? <WarningDialog messages={messages} onClose={closeWarnings} /> : null}
    </>
  );
}
