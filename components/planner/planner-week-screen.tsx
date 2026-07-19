"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { MealAddOptionsSheet } from "@/components/planner/meal-add-options-sheet";
import type { MealAddPickerMode } from "@/components/planner/meal-add-options-sheet";
import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
import {
  PlannerDayNutritionSummary,
  PlannerWeekNutritionSummary,
} from "@/components/planner/planner-nutrition-summary";
import { usePlannerNutritionSummary } from "@/components/planner/use-planner-nutrition-summary";
import { ContentState } from "@/components/shared/content-state";
import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebErrorState,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  formatKoreaCompactDate,
  formatKoreaDate,
  formatKoreaWeekday,
} from "@/lib/korean-date";
import {
  createDefaultPlannerRange,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { buildReturnHref } from "@/lib/navigation/return-context";
import {
  clearPlannerWeekReturnContext,
  readPlannerWeekReturnContext,
  savePlannerWeekReturnContext,
} from "@/lib/planner/planner-week-return-context";
import { buildPlannerMealStatusStats } from "@/lib/planner-stats";
import {
  formatProductQuantity,
  mergePlannerEntries,
  type PlannerDisplayEntry,
} from "@/lib/planner/product-planner-entry-presentation";
import { usePlannerStore } from "@/stores/planner-store";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";
import type { PlannerNutritionAggregate } from "@/types/planner-nutrition";

type AuthState = "checking" | "authenticated" | "unauthorized";
type MealAddSheetState = {
  columnId: string;
  dateKey: string;
  slotName: string;
} | null;

function isMealAddPickerMode(value: string | null): value is MealAddPickerMode {
  return (
    value === "search" ||
    value === "recipebook" ||
    value === "pantry" ||
    value === "leftover"
  );
}

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;
const WEEK_PAGE_INDEX_CURRENT = 1;
const WEEK_SCROLL_SETTLE_MS = 96;

function getTodayDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDateKeys(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dateKeys: string[] = [];

  while (start <= end) {
    dateKeys.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return dateKeys;
}

function formatDateLabel(dateKey: string) {
  return formatKoreaDate(dateKey, {
    month: "long",
    day: "numeric",
  });
}

function formatWeekdayLabel(dateKey: string) {
  return formatKoreaWeekday(dateKey, "short");
}

function formatRangeLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} ~ ${formatDateLabel(endDate)}`;
}

function formatCompactDateLabel(dateKey: string) {
  return formatKoreaCompactDate(dateKey);
}

function formatMobileWeekRangeLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
}

function getRangeContextLabel(startDate: string, defaultStartDate: string) {
  if (startDate === defaultStartDate) {
    return "이번 주";
  }

  return startDate > defaultStartDate ? "다음주에요" : "지난주에요";
}

function buildPlannerEntryMap(
  meals: PlannerMealData[],
  productEntries: ProductPlannerEntryData[],
) {
  const entryMap = new Map<string, PlannerDisplayEntry[]>();
  mergePlannerEntries(meals, productEntries).forEach((entry) => {
    const value = entry.entry_type === "recipe" ? entry.recipe : entry.product;
    const key = `${value.plan_date}:${value.column_id}`;
    entryMap.set(key, [...(entryMap.get(key) ?? []), entry]);
  });
  return entryMap;
}

function getPlannerMealStatusClass(status: PlannerMealData["status"]) {
  if (status === "shopping_done") {
    return "shopped";
  }

  if (status === "cook_done") {
    return "cooked";
  }

  return "registered";
}

function getPlannerMealStatusAriaLabel(status: PlannerMealData["status"]) {
  if (status === "shopping_done") {
    return "장보기 완료";
  }

  if (status === "cook_done") {
    return "요리 완료";
  }

  return "식사 등록 완료";
}

function getMobilePlannerMealStatusAccentClass(status: PlannerMealData["status"]) {
  if (status === "shopping_done") {
    return "border-l-[var(--planner-status-shopping)]";
  }

  if (status === "cook_done") {
    return "border-l-[var(--planner-status-cooked)]";
  }

  return "border-l-[var(--planner-status-registered)]";
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PlannerWeekWebView({
  columns,
  dateKeys,
  errorMessage,
  getMealAddHrefForSlot,
  isCurrentRange,
  isRefreshing,
  loadPlanner,
  mealStats,
  meals,
  nutritionByDate,
  nutritionSummary,
  entriesByDateAndColumn,
  plannerBodyMotionStyle,
  rangeContextLabel,
  rangeEndDate,
  rangeStartDate,
  resetRange,
  runPlannerAction,
  screenState,
  shiftRange,
  shoppingListLinks,
  todayKey,
}: {
  columns: PlannerColumnData[];
  dateKeys: string[];
  errorMessage: string | null;
  getMealAddHrefForSlot: (dateKey: string, column: PlannerColumnData) => string;
  isCurrentRange: boolean;
  isRefreshing: boolean;
  loadPlanner: () => Promise<void>;
  mealStats: {
    cookDone: number;
    registered: number;
    shoppingDone: number;
    total: number;
  };
  meals: PlannerMealData[];
  nutritionByDate: Map<string, PlannerNutritionAggregate>;
  nutritionSummary: React.ReactNode;
  entriesByDateAndColumn: Map<string, PlannerDisplayEntry[]>;
  plannerBodyMotionStyle: React.CSSProperties;
  rangeContextLabel: string;
  rangeEndDate: string;
  rangeStartDate: string;
  resetRange: () => Promise<void>;
  runPlannerAction: (action: Promise<void>) => void;
  screenState: "loading" | "ready" | "empty" | "error" | "read-only";
  shiftRange: (dayDelta: number) => Promise<void>;
  shoppingListLinks: Array<{
    id: string;
    status: "in_progress" | "completed";
    title: string;
  }>;
  todayKey: string;
}) {
  const recentMeals = [...meals]
    .sort((a, b) => `${b.plan_date}:${b.id}`.localeCompare(`${a.plan_date}:${a.id}`))
    .slice(0, 4);
  const canShowGrid = screenState === "ready" || screenState === "empty";
  const webColumnMinWidth = columns.length >= 5 ? 172 : 160;
  const webPlannerGridStyle = {
    gridTemplateColumns: `minmax(92px, 112px) repeat(${Math.max(columns.length, 1)}, minmax(${webColumnMinWidth}px, 1fr))`,
    minWidth:
      columns.length >= 5
        ? `${112 + columns.length * webColumnMinWidth}px`
        : undefined,
  } as React.CSSProperties;

  return (
    <WebShell className="web-planner" wide>
      <WebTopNav
        activeId="planner"
        rightSlot={<ProfileSummaryButton autoLoad isAuthenticated variant="web" />}
      />
      <div className="web-screen web-planner-screen">
        <header className="web-planner-page-head">
          <div>
            <p className="web-planner-eyebrow">{rangeContextLabel}</p>
            <h1 className="web-planner-title">주간 플래너</h1>
            <p className="web-planner-subtitle">
              {formatRangeLabel(rangeStartDate, rangeEndDate)}
            </p>
          </div>
          <div className="web-planner-actions" aria-label="플래너 작업" role="group">
            <WebButton
              aria-label="이전 주"
              onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
              variant="secondary"
            >
              {"< 이전 주"}
            </WebButton>
            <WebButton
              aria-label="이번 주"
              disabled={isCurrentRange}
              onClick={() => runPlannerAction(resetRange())}
              variant="secondary"
            >
              이번 주
            </WebButton>
            <WebButton
              aria-label="다음 주"
              onClick={() => runPlannerAction(shiftRange(RANGE_SHIFT_DAYS))}
              variant="secondary"
            >
              {"다음 주 >"}
            </WebButton>
            <Link className="web-button web-button-primary" href="/shopping/flow">
              장보기
            </Link>
          </div>
        </header>

        <div className="web-planner-layout">
          <aside className="web-planner-side" aria-label="플래너 요약">
            <section className="web-planner-side-section">
              <p className="web-planner-side-label">이번 주 요약</p>
              <div className="web-planner-stat-list">
                <div className="web-planner-stat web-planner-stat-registered">
                  <span><i className="web-planner-dot web-planner-dot-registered" />등록</span>
                  <strong>{mealStats.registered}개</strong>
                </div>
                <div className="web-planner-stat web-planner-stat-warning">
                  <span><i className="web-planner-dot web-planner-dot-shopped" />장보기</span>
                  <strong>{mealStats.shoppingDone}개</strong>
                </div>
                <div className="web-planner-stat web-planner-stat-success">
                  <span><i className="web-planner-dot web-planner-dot-cooked" />요리 완료</span>
                  <strong>{mealStats.cookDone}개</strong>
                </div>
              </div>
            </section>

            <section className="web-planner-side-section">
              <p className="web-planner-side-label">최근 계획</p>
              {recentMeals.length > 0 ? (
                <div className="web-planner-recent-list">
                  {recentMeals.map((meal) => (
                    <Link
                      className="web-planner-recent"
                      href={`/planner/${meal.plan_date}/${meal.column_id}`}
                      key={meal.id}
                    >
                      <span
                        aria-hidden="true"
                        className="web-planner-recent-thumb"
                        style={
                          meal.recipe_thumbnail_url
                            ? { backgroundImage: `url(${meal.recipe_thumbnail_url})` }
                            : undefined
                        }
                      />
                      <span className="web-planner-recent-copy">
                        <span>{meal.recipe_title}</span>
                        <small>
                          {formatCompactDateLabel(meal.plan_date)} · {meal.planned_servings}인분
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="web-planner-side-empty">
                  아직 최근 계획이 없어요.
                </p>
              )}
            </section>

            {shoppingListLinks.length > 0 ? (
              <section className="web-planner-side-section">
                <p className="web-planner-side-label">장보기 목록</p>
                <div className="web-planner-shopping-list">
                  {shoppingListLinks.map((shoppingList) => (
                    <Link
                      aria-label={`${shoppingList.title} 보기`}
                      className="web-planner-shopping-link"
                      href={`/shopping/lists/${shoppingList.id}`}
                      key={shoppingList.id}
                    >
                      <span className="web-planner-shopping-title">
                        {shoppingList.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className={[
                          "web-planner-shopping-status",
                          shoppingList.status === "completed"
                            ? "web-planner-shopping-status-complete"
                            : "web-planner-shopping-status-active",
                        ].join(" ")}
                      >
                        {shoppingList.status === "completed" ? "✓ 완료" : "진행 중"}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>

          <section
            aria-busy={isRefreshing}
            aria-label="주간 플래너 본문"
            className="web-planner-main"
            data-testid="planner-week-shell"
          >
            {nutritionSummary}

            {screenState === "loading" ? (
              <div className="web-planner-skeleton-grid">
                {Array.from({ length: 12 }).map((_, index) => (
                  <WebSkeleton height={104} key={index} />
                ))}
              </div>
            ) : null}

            {screenState === "error" ? (
              <WebErrorState
                action={
                  <WebButton onClick={() => runPlannerAction(loadPlanner())}>
                    다시 시도
                  </WebButton>
                }
                description={errorMessage ?? "잠시 후 다시 시도해 주세요."}
                title="플래너를 불러오지 못했어요"
              />
            ) : null}

            {canShowGrid ? (
              <section
                aria-label="주간 식단 표"
                className="web-planner-table-wrap"
                data-testid="planner-week-body"
                style={plannerBodyMotionStyle}
              >
                <div className="web-planner-grid" style={webPlannerGridStyle}>
                  <div className="web-planner-corner" aria-hidden="true" />
                  {columns.map((column) => (
                    <div className="web-planner-column-head" key={column.id}>
                      {column.name}
                    </div>
                  ))}

                  {dateKeys.map((dateKey) => {
                    const isToday = dateKey === todayKey;

                    return (
                      <div
                        className="web-planner-date-row"
                        data-testid={`web-planner-date-row-${dateKey}`}
                        key={dateKey}
                      >
                        <div
                            className={[
                            "web-planner-date-row-head",
                            isToday ? "web-planner-date-row-head-today" : "",
                          ].join(" ")}
                        >
                          <span>{formatWeekdayLabel(dateKey)}</span>
                          <strong>{formatCompactDateLabel(dateKey)}</strong>
                          <PlannerDayNutritionSummary
                            nutrition={nutritionByDate.get(dateKey) ?? null}
                          />
                        </div>

                        {columns.map((column) => {
                          const slotKey = `${dateKey}:${column.id}`;
                          const slotEntries = entriesByDateAndColumn.get(slotKey) ?? [];
                          const visibleEntries = slotEntries.slice(0, 2);
                          const overflowCount = Math.max(0, slotEntries.length - visibleEntries.length);
                          const addHref = getMealAddHrefForSlot(dateKey, column);
                          const mealHref = `/planner/${dateKey}/${column.id}?slot=${encodeURIComponent(column.name)}`;
                          const isToday = dateKey === todayKey;

                          return (
                            <div
                              className={[
                                "web-planner-cell",
                                isToday ? "web-planner-cell-today" : "",
                              ].join(" ")}
                              key={slotKey}
                            >
                              {visibleEntries.map((entry) =>
                                entry.entry_type === "recipe" ? (
                                  <Link
                                    className={[
                                      "web-planner-meal",
                                      `web-planner-meal-${getPlannerMealStatusClass(entry.recipe.status)}`,
                                    ].join(" ")}
                                    href={mealHref}
                                    key={entry.key}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="web-planner-meal-thumb"
                                      style={
                                        entry.recipe.recipe_thumbnail_url
                                          ? { backgroundImage: `url(${entry.recipe.recipe_thumbnail_url})` }
                                          : undefined
                                      }
                                    />
                                    <span className="web-planner-meal-copy">
                                      <span className="web-planner-meal-title">{entry.recipe.recipe_title}</span>
                                      <span className="web-planner-meal-meta">
                                        <span>{entry.recipe.planned_servings}인분</span>
                                        <span aria-label={getPlannerMealStatusAriaLabel(entry.recipe.status)} className="sr-only">
                                          {getPlannerMealStatusAriaLabel(entry.recipe.status)}
                                        </span>
                                      </span>
                                    </span>
                                  </Link>
                                ) : (
                                  <Link
                                    className="web-planner-meal border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)]"
                                    data-testid={`planner-web-product-${entry.product.id}`}
                                    href={mealHref}
                                    key={entry.key}
                                  >
                                    <span className="shrink-0 rounded-full bg-[var(--brand-primary-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--brand-primary-text)]">완제품</span>
                                    <span className="web-planner-meal-copy">
                                      <span className="web-planner-meal-title">{entry.product.product_name}</span>
                                      <span className="web-planner-meal-meta">
                                        <span>{formatProductQuantity(entry.product.quantity)}</span>
                                      </span>
                                    </span>
                                  </Link>
                                ),
                              )}
                              {overflowCount > 0 ? (
                                <Link className="web-planner-more" href={mealHref}>
                                  +{overflowCount}개 더 보기
                                </Link>
                              ) : null}
                              <Link
                                aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                                className={[
                                  "web-planner-add",
                                  slotEntries.length > 0 ? "web-planner-add-compact" : "",
                                ].join(" ")}
                                href={addHref}
                              >
                                <PlusIcon />
                                <span>{slotEntries.length > 0 ? "추가" : "식사 추가"}</span>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <div className="web-planner-legend" aria-label="식사 상태 범례">
                  <span><i className="web-planner-border-swatch web-planner-border-swatch-registered" />등록</span>
                  <span><i className="web-planner-border-swatch web-planner-border-swatch-shopped" />장보기 완료</span>
                  <span><i className="web-planner-border-swatch web-planner-border-swatch-cooked" />요리 완료</span>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </WebShell>
  );
}

export function PlannerWeekScreen({
  initialAuthenticated = false,
}: PlannerWeekScreenProps) {
  const isDesktopViewport = useDesktopViewport();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const rangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const columns = usePlannerStore((state) => state.columns);
  const meals = usePlannerStore((state) => state.meals);
  const productEntries = usePlannerStore((state) => state.productEntries);
  const screenState = usePlannerStore((state) => state.screenState);
  const isRefreshing = usePlannerStore((state) => state.isRefreshing);
  const errorMessage = usePlannerStore((state) => state.errorMessage);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);
  const resetRange = usePlannerStore((state) => state.resetRange);
  const shiftRange = usePlannerStore((state) => state.shiftRange);
  const todayKey = getTodayDateKey();

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [mealAddSheet, setMealAddSheet] = useState<MealAddSheetState>(null);
  const [mealAddPickerMode, setMealAddPickerMode] =
    useState<MealAddPickerMode | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => todayKey);
  const mobileDayCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const webDayCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const handleNutritionUnauthorized = useCallback(() => {
    savePlannerWeekReturnContext({
      version: 1,
      startDate: rangeStartDate,
      endDate: rangeEndDate,
      selectedDate: dateKeys.includes(selectedDateKey)
        ? selectedDateKey
        : rangeStartDate,
      columnId: mealAddSheet?.columnId ?? null,
      slotName: mealAddSheet?.slotName ?? null,
    });
    setAuthState("unauthorized");
  }, [dateKeys, mealAddSheet, rangeEndDate, rangeStartDate, selectedDateKey]);
  const nutritionRequest = usePlannerNutritionSummary({
    enabled: authState === "authenticated",
    endDate: rangeEndDate,
    onUnauthorized: handleNutritionUnauthorized,
    startDate: rangeStartDate,
  });

  const entriesByDateAndColumn = useMemo(
    () => buildPlannerEntryMap(meals, productEntries),
    [meals, productEntries],
  );
  const mealStats = useMemo(() => buildPlannerMealStatusStats(meals), [meals]);
  const nutritionByDate = useMemo(
    () =>
      new Map(
        (nutritionRequest.data?.days ?? []).map((day) => [
          day.plan_date,
          day.nutrition,
        ]),
      ),
    [nutritionRequest.data],
  );
  const nutritionSummary = (
    <PlannerWeekNutritionSummary
      days={nutritionRequest.data?.days ?? []}
      error={nutritionRequest.error}
      isRefreshing={nutritionRequest.isRefreshing}
      nutrition={nutritionRequest.data?.summary.nutrition ?? null}
      onRetry={() => void nutritionRequest.retry()}
      status={nutritionRequest.status}
    />
  );
  const shoppingListLinks = useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        title: string;
        dates: string[];
        statuses: PlannerMealData["status"][];
      }
    >();

    meals.forEach((meal) => {
      if (!meal.shopping_list_id) {
        return;
      }

      const existing = grouped.get(meal.shopping_list_id) ?? {
        id: meal.shopping_list_id,
        title: meal.shopping_list_title?.trim() || "",
        dates: [],
        statuses: [],
      };

      if (!existing.dates.includes(meal.plan_date)) {
        existing.dates.push(meal.plan_date);
      }
      existing.statuses.push(meal.status);

      if (!existing.title && meal.shopping_list_title?.trim()) {
        existing.title = meal.shopping_list_title.trim();
      }

      grouped.set(meal.shopping_list_id, existing);
    });

    return [...grouped.values()].map((entry) => {
      const sortedDates = [...entry.dates].sort();
      const firstDate = sortedDates[0];
      const lastDate = sortedDates.at(-1);
      const fallbackTitle =
        firstDate && lastDate && firstDate !== lastDate
          ? `${formatDateLabel(firstDate)} ~ ${formatDateLabel(lastDate)} 장보기`
          : firstDate
            ? `${formatDateLabel(firstDate)} 장보기`
            : "장보기 목록";

      return {
        id: entry.id,
        status: (
          entry.statuses.length > 0 &&
          entry.statuses.every((status) => status !== "registered")
            ? "completed"
            : "in_progress"
        ) as "completed" | "in_progress",
        title: entry.title || fallbackTitle,
      };
    });
  }, [meals]);
  const defaultRange = createDefaultPlannerRange();
  const isCurrentRange =
    rangeStartDate === defaultRange.startDate && rangeEndDate === defaultRange.endDate;
  const mobileWeekStripViewportRef = useRef<HTMLDivElement | null>(null);
  const webWeekStripViewportRef = useRef<HTMLDivElement | null>(null);
  const weekStripSettleTimerRef = useRef<number | null>(null);
  const isWeekStripInteractingRef = useRef(false);
  const isRecenteringWeekStripRef = useRef(false);
  const weekStripInteractionTokenRef = useRef(0);
  const getActiveWeekStripViewport = useCallback(
    () => (isDesktopViewport ? webWeekStripViewportRef.current : mobileWeekStripViewportRef.current),
    [isDesktopViewport],
  );
  const rangeContextLabel = getRangeContextLabel(rangeStartDate, defaultRange.startDate);
  const weekPages = useMemo(() => {
    const previousRange = shiftPlannerRange(
      {
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      },
      -RANGE_SHIFT_DAYS,
    );
    const nextRange = shiftPlannerRange(
      {
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      },
      RANGE_SHIFT_DAYS,
    );

    return [
      {
        key: "prev",
        dateKeys: buildDateKeys(previousRange.startDate, previousRange.endDate),
      },
      {
        key: "current",
        dateKeys,
      },
      {
        key: "next",
        dateKeys: buildDateKeys(nextRange.startDate, nextRange.endDate),
      },
    ] as const;
  }, [dateKeys, rangeEndDate, rangeStartDate]);

  function runPlannerAction(action: Promise<void>) {
    void action.catch((error) => {
      if (isPlannerApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    });
  }

  function clearWeekStripSettleTimer() {
    if (weekStripSettleTimerRef.current === null) {
      return;
    }

    window.clearTimeout(weekStripSettleTimerRef.current);
    weekStripSettleTimerRef.current = null;
  }

  function commitSettledWeekStripPage() {
    const viewport = getActiveWeekStripViewport();

    if (!viewport) {
      return;
    }

    const pageWidth = viewport.clientWidth;

    if (pageWidth <= 0) {
      return;
    }

    const pageIndex = Math.round(viewport.scrollLeft / pageWidth);

    if (pageIndex === WEEK_PAGE_INDEX_CURRENT) {
      return;
    }

    runPlannerAction(
      shiftRange(pageIndex > WEEK_PAGE_INDEX_CURRENT ? RANGE_SHIFT_DAYS : -RANGE_SHIFT_DAYS),
    );
  }

  function scheduleWeekStripCommit() {
    if (isRecenteringWeekStripRef.current || isRefreshing) {
      return;
    }

    clearWeekStripSettleTimer();
    weekStripSettleTimerRef.current = window.setTimeout(() => {
      if (isWeekStripInteractingRef.current) {
        scheduleWeekStripCommit();
        return;
      }

      commitSettledWeekStripPage();
    }, WEEK_SCROLL_SETTLE_MS);
  }

  function handleWeekStripScroll() {
    if (!getActiveWeekStripViewport()) {
      return;
    }

    scheduleWeekStripCommit();
  }

  function handleWeekStripInteractionStart() {
    weekStripInteractionTokenRef.current += 1;
    isWeekStripInteractingRef.current = true;
    clearWeekStripSettleTimer();
  }

  function handleWeekStripInteractionEnd() {
    isWeekStripInteractingRef.current = false;
    scheduleWeekStripCommit();
  }

  function handleWeekStripKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      runPlannerAction(shiftRange(RANGE_SHIFT_DAYS));
      return;
    }

    if (event.key === "Home" && !isCurrentRange) {
      event.preventDefault();
      runPlannerAction(resetRange());
    }
  }

  function focusPlannerDate(dateKey: string) {
    const dayCardRefs = isDesktopViewport ? webDayCardRefs : mobileDayCardRefs;

    setSelectedDateKey(dateKey);
    dayCardRefs.current[dateKey]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleDateChipClick(pageKey: "prev" | "current" | "next", dateKey: string) {
    if (pageKey === "prev") {
      runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS));
      return;
    }

    if (pageKey === "next") {
      runPlannerAction(shiftRange(RANGE_SHIFT_DAYS));
      return;
    }

    focusPlannerDate(dateKey);
  }

  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (!mounted) {
          return;
        }

        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    const returnContext = readPlannerWeekReturnContext();
    if (!returnContext) {
      runPlannerAction(loadPlanner());
      return;
    }

    clearPlannerWeekReturnContext();
    setSelectedDateKey(returnContext.selectedDate);
    if (returnContext.columnId && returnContext.slotName) {
      setMealAddSheet({
        columnId: returnContext.columnId,
        dateKey: returnContext.selectedDate,
        slotName: returnContext.slotName,
      });
    }
    runPlannerAction(loadPlanner({
      startDate: returnContext.startDate,
      endDate: returnContext.endDate,
    }));
  }, [authState, loadPlanner]);

  useLayoutEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    let cancelled = false;
    let frameId: number | null = null;
    const interactionTokenAtStart = weekStripInteractionTokenRef.current;
    let waitedForViewportAvailability = false;

    const recenterWeekStripViewport = (attempt: number) => {
      if (cancelled) {
        return;
      }

      if (weekStripInteractionTokenRef.current !== interactionTokenAtStart) {
        isRecenteringWeekStripRef.current = false;
        return;
      }

      const viewport = getActiveWeekStripViewport();

      if (!viewport || viewport.clientWidth <= 0) {
        waitedForViewportAvailability = true;
        if (attempt < 8) {
          frameId = window.requestAnimationFrame(() => {
            recenterWeekStripViewport(attempt + 1);
          });
        }
        return;
      }

      if (isWeekStripInteractingRef.current) {
        if (attempt < 8) {
          frameId = window.requestAnimationFrame(() => {
            recenterWeekStripViewport(attempt + 1);
          });
        }
        return;
      }

      const targetLeft = viewport.clientWidth * WEEK_PAGE_INDEX_CURRENT;
      if (
        waitedForViewportAvailability &&
        viewport.scrollLeft !== 0 &&
        viewport.scrollLeft !== targetLeft
      ) {
        isRecenteringWeekStripRef.current = false;
        return;
      }
      if (viewport.scrollLeft === targetLeft) {
        isRecenteringWeekStripRef.current = false;
        return;
      }
      isRecenteringWeekStripRef.current = true;
      viewport.scrollLeft = targetLeft;
      frameId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        isRecenteringWeekStripRef.current = false;
      });
    };

    recenterWeekStripViewport(0);

    return () => {
      cancelled = true;
      isRecenteringWeekStripRef.current = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [authState, getActiveWeekStripViewport, rangeEndDate, rangeStartDate]);

  useEffect(() => {
    return () => {
      clearWeekStripSettleTimer();
    };
  }, []);

  useEffect(() => {
    if (!dateKeys.includes(selectedDateKey)) {
      setSelectedDateKey(dateKeys.includes(todayKey) ? todayKey : dateKeys[0]);
    }
  }, [dateKeys, selectedDateKey, todayKey]);

  useEffect(() => {
    if (
      searchParams.get("restore") !== "meal-add-modal" &&
      searchParams.get("returnSurface") !== "planner.meal-add-modal"
    ) {
      return;
    }

    const dateKey = searchParams.get("date");
    const columnId = searchParams.get("columnId");
    if (!dateKey || !columnId) return;

    setSelectedDateKey(dateKey);
    setMealAddSheet({
      columnId,
      dateKey,
      slotName: searchParams.get("slot") ?? "",
    });
    const source = searchParams.get("source");
    setMealAddPickerMode(isMealAddPickerMode(source) ? source : null);
  }, [searchParams]);

  const plannerBodyMotionStyle = {
    opacity: isRefreshing ? 0.97 : 1,
    transform: "translateX(0px)",
    transition: "opacity 180ms ease",
  } as const;

  function buildMenuAddQuery({
    columnId,
    dateKey,
    slotName,
  }: {
    columnId: string;
    dateKey: string;
    slotName: string;
  }) {
    const params = new URLSearchParams({
      columnId,
      date: dateKey,
      slot: slotName,
    });

    return params.toString();
  }

  function buildMealAddReturnPath(state: NonNullable<MealAddSheetState>) {
    return `/planner?${buildMenuAddQuery(state)}`;
  }

  function buildMealAddTargetHref(
    targetPath: string,
    state: NonNullable<MealAddSheetState>,
  ) {
    return buildReturnHref(targetPath, {
      restore: "meal-add-modal",
      returnSurface: "planner.meal-add-modal",
      returnTo: buildMealAddReturnPath(state),
    });
  }

  function openMealAddSheet(dateKey: string, column: { id: string; name: string }) {
    setMealAddSheet({
      columnId: column.id,
      dateKey,
      slotName: column.name,
    });
    setMealAddPickerMode(null);
  }

  function closeMealAddSheet() {
    setMealAddPickerMode(null);
    setMealAddSheet(null);
  }

  function openMealAddPicker(mode: MealAddPickerMode) {
    setMealAddPickerMode(mode);
  }

  function closeMealAddPicker() {
    setMealAddPickerMode(null);
  }

  async function handleMealAddComplete() {
    const completedTarget = mealAddSheet;

    setMealAddPickerMode(null);
    setMealAddSheet(null);

    if (completedTarget) {
      const slotSuffix = completedTarget.slotName
        ? `?slot=${encodeURIComponent(completedTarget.slotName)}`
        : "";

      router.replace(
        `/planner/${completedTarget.dateKey}/${completedTarget.columnId}${slotSuffix}`,
      );
      return;
    }

    try {
      await loadPlanner();
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    }
  }

  function getMealAddHref(target: "search" | "recipebook" | "pantry" | "leftover" | "manual" | "youtube" | "product") {
    if (!mealAddSheet) {
      return "/planner";
    }

    const baseQuery = buildMenuAddQuery(mealAddSheet);

    if (target === "manual") {
      return buildMealAddTargetHref(`/menu/add/manual?${baseQuery}`, mealAddSheet);
    }

    if (target === "youtube") {
      return buildMealAddTargetHref(`/menu/add/youtube?${baseQuery}`, mealAddSheet);
    }

    if (target === "search" || target === "recipebook" || target === "pantry" || target === "leftover" || target === "product") {
      return buildMealAddTargetHref(
        `/menu-add?${baseQuery}&source=${target}`,
        mealAddSheet,
      );
    }

    return buildMealAddTargetHref(`/menu-add?${baseQuery}`, mealAddSheet);
  }

  function getMealAddHrefForSlot(dateKey: string, column: { id: string; name: string }) {
    const state = {
      columnId: column.id,
      dateKey,
      slotName: column.name,
    };

    return buildMealAddTargetHref(
      `/menu-add?${buildMenuAddQuery(state)}`,
      state,
    );
  }

  if (authState === "checking") {
    return (
      <>
        <div
          aria-busy="true"
          className="min-h-screen bg-[var(--surface)] md:min-h-[calc(100dvh-96px)]"
          data-testid="planner-auth-checking-shell"
        />
        {!isDesktopViewport ? (
          <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" />
        ) : null}
      </>
    );
  }

  if (authState === "unauthorized") {
    const queryString = searchParams.toString();
    const nextPath = queryString ? `/planner?${queryString}` : "/planner";

    return (
      <>
        <ContentState
          description="로그인 후 보던 주간 범위로 돌아와 식단을 계속 관리할 수 있어요."
          eyebrow="플래너 접근"
          safeBottomPadding
          title="이 화면은 로그인이 필요해요"
          titleLevel={1}
          tone="gate"
        >
          <div className="space-y-3">
            <SocialLoginButtons nextPath={nextPath} />
            <Link
              className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              href="/"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </ContentState>
        {!isDesktopViewport ? (
          <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" />
        ) : null}
      </>
    );
  }

  const shouldRenderWebView = isDesktopViewport;
  const shouldRenderAppView = !isDesktopViewport;

  return (
    <>
      {shouldRenderAppView ? (
        <div className="min-h-screen bg-[var(--surface-fill)] pb-[128px] text-[var(--foreground)] lg:hidden">
        <div
          className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-between border-b border-[var(--line-strong)] bg-[var(--surface)] px-4"
          style={{ borderBottomWidth: "0.5px" }}
        >
          <h1 className="text-[18px] font-bold leading-none text-[var(--brand)]">
            주간 플래너
          </h1>
          <ProfileSummaryButton autoLoad isAuthenticated variant="mobile" />
        </div>

        <section className="border-b border-[var(--surface-subtle)] bg-[var(--surface)] px-5 py-4 max-[359px]:px-4 max-[359px]:py-2.5">
          <p className="mb-1 text-[20px] font-bold leading-[1.25] text-[var(--foreground)] max-[359px]:text-[18px]">
            {formatMobileWeekRangeLabel(rangeStartDate, rangeEndDate)}
          </p>
          <div className="mt-3 max-[359px]:mt-2">
            <p className="mb-2 text-[13px] font-extrabold leading-[1.35] text-[var(--foreground)] max-[359px]:mb-1.5 max-[359px]:text-[12px]">
              이번 주 요약
            </p>
            <div className="grid grid-cols-3 gap-2 max-[359px]:gap-1.5">
              <div className="rounded-[var(--radius-control)] bg-[var(--planner-status-registered-soft)] p-3 text-center max-[359px]:flex max-[359px]:items-center max-[359px]:justify-between max-[359px]:gap-1.5 max-[359px]:p-2">
                <p className="text-[13px] font-bold leading-[1.15] text-[var(--planner-status-registered)] max-[359px]:text-[11px]">
                  등록
                </p>
                <p className="mt-1 text-[22px] font-bold leading-none text-[var(--planner-status-registered-strong)] max-[359px]:mt-0 max-[359px]:text-[16px]">
                  {mealStats.registered}개
                </p>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--planner-status-shopping-soft)] p-3 text-center max-[359px]:flex max-[359px]:items-center max-[359px]:justify-between max-[359px]:gap-1.5 max-[359px]:p-2">
                <p className="text-[13px] font-bold leading-[1.15] text-[var(--planner-status-shopping)] max-[359px]:text-[11px]">
                  장보기
                </p>
                <p className="mt-1 text-[22px] font-bold leading-none text-[var(--planner-status-shopping)] max-[359px]:mt-0 max-[359px]:text-[16px]">
                  {mealStats.shoppingDone}개
                </p>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--planner-status-cooked-soft)] p-3 text-center max-[359px]:flex max-[359px]:items-center max-[359px]:justify-between max-[359px]:gap-1.5 max-[359px]:p-2">
                <p className="text-[13px] font-bold leading-[1.15] text-[var(--planner-status-cooked)] max-[359px]:text-[11px]">
                  요리 완료
                </p>
                <p className="mt-1 text-[22px] font-bold leading-none text-[var(--planner-status-cooked)] max-[359px]:mt-0 max-[359px]:text-[16px]">
                  {mealStats.cookDone}개
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 max-[359px]:mt-2.5">{nutritionSummary}</div>
          {shoppingListLinks.length > 0 ? (
            <Link
              className="mt-3 flex min-h-10 items-center justify-between rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 text-[14px] font-bold text-[var(--foreground)] max-[359px]:mt-2 max-[359px]:px-2.5 max-[359px]:text-[13px]"
              href={buildReturnHref("/mypage", {
                restore: "shopping-history-tab",
                returnSurface: "planner.week",
                returnTo: "/planner",
              })}
            >
              <span>이번 주 장보기 기록 {shoppingListLinks.length}개</span>
              <span className="text-[13px] font-extrabold text-[var(--brand)]">
                캘린더 보기
              </span>
            </Link>
          ) : null}
        </section>

        <section
          className="sticky top-[52px] z-20 border-b border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-3 max-[359px]:px-3 max-[359px]:py-2"
          data-testid="planner-week-shell"
        >
          <div className="mb-2 grid grid-cols-[30px_minmax(0,1fr)_30px] items-center gap-2 max-[359px]:mb-1.5 max-[359px]:gap-1.5">
            <button
              aria-label="이전 주"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-fill)] text-[17px] leading-none text-[var(--text-2)]"
              onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
              type="button"
            >
              ‹
            </button>
            <div className="flex min-w-0 justify-center">
              <button
                aria-label="이번 주로 이동"
                className={[
                  "inline-flex h-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border px-3 text-[12px] font-bold",
                  isCurrentRange
                    ? "border-[var(--line-strong)] bg-[var(--surface-fill)] text-[var(--text-3)]"
                    : "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]",
                ].join(" ")}
                disabled={isCurrentRange}
                onClick={() => runPlannerAction(resetRange())}
                type="button"
              >
                이번 주
              </button>
            </div>
            <button
              aria-label="다음 주"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-fill)] text-[17px] leading-none text-[var(--text-2)]"
              onClick={() => runPlannerAction(shiftRange(RANGE_SHIFT_DAYS))}
              type="button"
            >
              ›
            </button>
          </div>
          <p className="sr-only" id="planner-week-strip-hint-mobile">
            주간 날짜 스트립을 좌우로 넘기면 이전 주 또는 다음 주로 이동할 수 있어요.
          </p>
          <div
            aria-describedby="planner-week-strip-hint-mobile"
            aria-busy={isRefreshing}
            aria-label="주간 날짜 스트립"
            className="scrollbar-hide overflow-x-auto overscroll-x-contain snap-x snap-mandatory touch-pan-x"
            data-testid="planner-week-strip-viewport"
            onKeyDown={handleWeekStripKeyDown}
            onMouseDown={handleWeekStripInteractionStart}
            onMouseLeave={handleWeekStripInteractionEnd}
            onMouseUp={handleWeekStripInteractionEnd}
            onScroll={handleWeekStripScroll}
            onTouchCancel={handleWeekStripInteractionEnd}
            onTouchEnd={handleWeekStripInteractionEnd}
            onTouchStart={handleWeekStripInteractionStart}
            ref={mobileWeekStripViewportRef}
            tabIndex={0}
          >
            <div className="flex">
              {weekPages.map((page) => (
                <section
                  className="min-w-full snap-center snap-always"
                  data-testid={`planner-week-strip-page-${page.key}`}
                  key={page.key}
                >
                  <ol className="grid grid-cols-7 gap-1">
                    {page.dateKeys.map((dateKey) => {
                      const isToday = page.key === "current" && dateKey === todayKey;
                      const isSelected = page.key === "current" && dateKey === selectedDateKey;

                      return (
                        <li className="list-none" key={dateKey}>
                          <button
                            aria-current={isSelected ? "date" : undefined}
                            aria-label={`${formatCompactDateLabel(dateKey)} ${formatWeekdayLabel(dateKey)} 식단으로 이동`}
                          className={[
                              "relative flex h-[54px] w-full min-w-0 flex-col items-center justify-center gap-px rounded-[var(--radius-card)] text-center transition-colors max-[359px]:h-[48px]",
                              isSelected
                                ? "border-2 border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-[0_2px_8px_var(--brand-shadow-color)]"
                                : "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-2)]",
                            ].join(" ")}
                            onClick={() => handleDateChipClick(page.key, dateKey)}
                            type="button"
                          >
                            {isToday ? (
                              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
                            ) : null}
                            <span className="text-[10px] font-semibold leading-none max-[359px]:text-[11px]">
                              {formatWeekdayLabel(dateKey)}
                            </span>
                            <span className="text-[19px] font-semibold leading-none max-[359px]:text-[17px]">
                              {dateKey.slice(8)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </section>

        {screenState === "loading" ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                className="min-h-36 border border-[var(--line-strong)]"
                key={index}
                style={{ borderRadius: 12 }}
              />
            ))}
          </div>
        ) : null}

        {screenState === "error" ? (
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해 주세요."}
            onAction={() => {
              runPlannerAction(loadPlanner());
            }}
            tone="error"
            title="플래너를 불러오지 못했어요"
          />
        ) : null}

        {screenState === "ready" || screenState === "empty" ? (
          <section
            aria-busy={isRefreshing}
            className="space-y-3 px-4 py-4 max-[359px]:space-y-2.5 max-[359px]:px-3 max-[359px]:py-3"
            data-testid="planner-week-body"
            style={plannerBodyMotionStyle}
          >
            {screenState === "empty" ? (
              <p className="sr-only">아직 등록된 식사가 없어요.</p>
            ) : null}

            {dateKeys.map((dateKey) => {
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDateKey;
              const dayMealCount = columns.filter((col) =>
                entriesByDateAndColumn.has(`${dateKey}:${col.id}`),
              ).length;

              return (
                <article
                  aria-label={`${formatDateLabel(dateKey)} 식단 카드`}
                  className={[
                    "scroll-mt-[164px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]",
                    isSelected
                      ? "border-2 border-[var(--brand)] shadow-[0_2px_8px_var(--shadow-color-soft)]"
                      : "border border-[var(--line-strong)]",
                  ].join(" ")}
                  data-testid={`planner-day-card-${dateKey}`}
                  key={dateKey}
                  ref={(node) => {
                    mobileDayCardRefs.current[dateKey] = node;
                  }}
                >
                  <div className="flex items-center border-b border-[var(--surface-subtle)] px-4 py-3 max-[359px]:px-3 max-[359px]:py-2.5">
                    <span
                      className={[
                        "mr-2.5 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold max-[359px]:mr-2 max-[359px]:h-7 max-[359px]:w-7 max-[359px]:text-[12px]",
                        isToday ? "bg-[var(--brand-contrast)] text-[var(--text-inverse)]" : "bg-[var(--surface-fill)] text-[var(--foreground)]",
                      ].join(" ")}
                    >
                      {formatWeekdayLabel(dateKey)}
                    </span>
                    <p className="flex-1 text-[16px] font-semibold text-[var(--foreground)] max-[359px]:text-[15px]">
                      {formatCompactDateLabel(dateKey)}
                    </p>
                    <span className="text-[12px] text-[var(--text-3)] max-[359px]:text-[11px]">
                      <span className="sr-only">
                        {dayMealCount}/{columns.length} 끼니 계획
                      </span>
                      <PlannerDayNutritionSummary
                        nutrition={nutritionByDate.get(dateKey) ?? null}
                      />
                    </span>
                  </div>

                  <div>
                    {columns.map((column, columnIndex) => {
                      const slotKey = `${dateKey}:${column.id}`;
                      const slotEntries = entriesByDateAndColumn.get(slotKey) ?? [];
                      const visibleEntries = slotEntries.slice(0, 2);

                      return (
                        <div
                          className={[
                            "flex items-center gap-2 px-2.5 py-1.5",
                            columnIndex < columns.length - 1 ? "border-b border-[var(--surface-subtle)]" : "",
                          ].join(" ")}
                          key={slotKey}
                        >
                          <div className="w-[34px] shrink-0 text-[12px] font-bold text-[var(--foreground)]">
                            {column.name}
                          </div>

                          {visibleEntries.length > 0 ? (
                            <>
                              <Link
                                className={[
                                  "mobile-planner-slot-meals min-w-0 flex-1",
                                  visibleEntries.length > 1
                                    ? "mobile-planner-slot-meals-multiple"
                                    : "",
                                ].join(" ")}
                                data-testid={`planner-mobile-slot-${dateKey}-${column.id}`}
                                href={`/planner/${dateKey}/${column.id}?slot=${encodeURIComponent(column.name)}`}
                              >
                                {visibleEntries.map((entry, entryIndex) => {
                                  if (entry.entry_type === "product") {
                                    return (
                                      <span
                                        className="mobile-planner-meal-card relative min-w-0 overflow-hidden border border-l-4 border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--foreground)]"
                                        data-testid={`planner-mobile-product-${entry.product.id}`}
                                        key={entry.key}
                                      >
                                        <span className="shrink-0 rounded-full bg-[var(--brand-primary-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--brand-primary-text)]">완제품</span>
                                        <span className="mobile-planner-meal-copy min-w-0 flex-1">
                                          <span className="mobile-planner-meal-title block text-[var(--foreground)]">{entry.product.product_name}</span>
                                          <span className="mt-px block truncate text-[10px] text-[var(--text-3)]">{formatProductQuantity(entry.product.quantity)}</span>
                                        </span>
                                        {entryIndex === 1 && slotEntries.length > 2 ? (
                                          <span aria-label={`외 ${slotEntries.length - 2}개 더 있음`} className="mobile-planner-overflow-badge absolute">+{slotEntries.length - 2}</span>
                                        ) : null}
                                      </span>
                                    );
                                  }

                                  const meal = entry.recipe;
                                  return (
                                    <span
                                      className={[
                                        "mobile-planner-meal-card relative min-w-0 overflow-hidden border border-l-4 border-[var(--line-strong)] bg-[var(--surface-fill)] text-[var(--foreground)]",
                                        getMobilePlannerMealStatusAccentClass(meal.status),
                                      ].join(" ")}
                                      data-testid={`planner-mobile-meal-${meal.id}`}
                                      key={entry.key}
                                    >
                                      {meal.recipe_thumbnail_url ? (
                                        <Image alt="" className="mobile-planner-meal-thumb shrink-0 object-cover" height={50} src={meal.recipe_thumbnail_url} unoptimized width={38} />
                                      ) : (
                                        <span className="mobile-planner-meal-thumb flex shrink-0 items-center justify-center bg-[var(--brand-soft)] text-[13px] font-bold text-[var(--brand)]">{column.name.charAt(0)}</span>
                                      )}
                                      <span className="mobile-planner-meal-copy min-w-0 flex-1">
                                        <span className={`mobile-planner-meal-title block ${meal.is_leftover ? "text-[var(--brand-deep)]" : "text-[var(--foreground)]"}`}>{meal.recipe_title}</span>
                                        {meal.is_leftover ? <span aria-label="남은 요리 식사" className="sr-only">남은 요리</span> : null}
                                        <span className="mt-px flex min-w-0 items-center gap-1">
                                          <span className="truncate text-[10px] text-[var(--text-3)]">{meal.planned_servings}인분</span>
                                          <span aria-label={getPlannerMealStatusAriaLabel(meal.status)} className="sr-only">{getPlannerMealStatusAriaLabel(meal.status)}</span>
                                        </span>
                                      </span>
                                      {entryIndex === 1 && slotEntries.length > 2 ? (
                                        <span aria-label={`외 ${slotEntries.length - 2}개 더 있음`} className="mobile-planner-overflow-badge absolute">+{slotEntries.length - 2}</span>
                                      ) : null}
                                    </span>
                                  );
                                })}
                              </Link>
                              <button
                                aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] bg-transparent text-[20px] font-semibold leading-none text-[var(--text-3)]"
                                onClick={() => openMealAddSheet(dateKey, column)}
                                type="button"
                              >
                                +
                              </button>
                            </>
                          ) : (
                            <button
                              aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                              className="flex h-[38px] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] bg-transparent text-[20px] font-semibold leading-none text-[var(--text-3)]"
                              onClick={() => openMealAddSheet(dateKey, column)}
                              type="button"
                            >
                              +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        <Link
          className="fixed bottom-[92px] right-4 z-20 inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full bg-[var(--brand)] px-[18px] text-[14px] font-bold text-[var(--text-inverse)] shadow-[0_4px_12px_var(--brand-shadow-color-strong)] transition-transform duration-150 active:scale-95"
          href="/shopping/flow"
          style={{ color: "var(--text-inverse)" }}
        >
          장보기
        </Link>

          <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" />
        </div>
      ) : null}

      {shouldRenderWebView ? (
        <div className="hidden lg:block">
          <PlannerWeekWebView
            columns={columns}
            dateKeys={dateKeys}
            errorMessage={errorMessage}
            getMealAddHrefForSlot={getMealAddHrefForSlot}
            isCurrentRange={isCurrentRange}
            isRefreshing={isRefreshing}
            loadPlanner={loadPlanner}
            mealStats={mealStats}
            meals={meals}
            nutritionByDate={nutritionByDate}
            nutritionSummary={nutritionSummary}
            entriesByDateAndColumn={entriesByDateAndColumn}
            plannerBodyMotionStyle={plannerBodyMotionStyle}
            rangeContextLabel={rangeContextLabel}
            rangeEndDate={rangeEndDate}
            rangeStartDate={rangeStartDate}
            resetRange={resetRange}
            runPlannerAction={runPlannerAction}
            screenState={screenState}
            shiftRange={shiftRange}
            shoppingListLinks={shoppingListLinks}
            todayKey={todayKey}
          />
        </div>
      ) : null}

      {mealAddSheet && !mealAddPickerMode ? (
        <MealAddOptionsSheet
          onClose={closeMealAddSheet}
          onPickerSelect={openMealAddPicker}
          routeHrefFor={(mode) => getMealAddHref(mode)}
          targetLabel={`${formatCompactDateLabel(mealAddSheet.dateKey)} ${mealAddSheet.slotName}`}
          testId="planner-meal-add-sheet"
          title="식사 추가"
        />
      ) : null}

      {mealAddSheet && mealAddPickerMode ? (
        <MealAddPickerFlow
          columnId={mealAddSheet.columnId}
          entryMode={mealAddPickerMode}
          key={`${mealAddSheet.dateKey}-${mealAddSheet.columnId}-${mealAddPickerMode}`}
          onClose={closeMealAddPicker}
          onComplete={handleMealAddComplete}
          planDate={mealAddSheet.dateKey}
          slotName={mealAddSheet.slotName}
        />
      ) : null}
    </>
  );
}
