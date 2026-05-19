"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebEmptyState,
  WebErrorState,
  WebIconButton,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  createDefaultPlannerRange,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { usePlannerStore } from "@/stores/planner-store";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";
type MealAddSheetState = {
  columnId: string;
  dateKey: string;
  slotName: string;
} | null;

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;
const WEEK_PAGE_INDEX_CURRENT = 1;
const WEEK_SCROLL_SETTLE_MS = 96;

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
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

function formatRangeLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} ~ ${formatDateLabel(endDate)}`;
}

function formatCompactDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
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

function buildMealMap(meals: PlannerMealData[]) {
  const mealMap = new Map<string, PlannerMealData[]>();

  meals.forEach((meal) => {
    const key = `${meal.plan_date}:${meal.column_id}`;
    const current = mealMap.get(key) ?? [];
    mealMap.set(key, [...current, meal]);
  });

  return mealMap;
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

function getPlannerMealStatusLabel(status: PlannerMealData["status"]) {
  if (status === "shopping_done") {
    return "장보기 완료";
  }

  if (status === "cook_done") {
    return "요리 완료";
  }

  return "등록";
}

function findPlannerColumn(
  columns: PlannerColumnData[],
  preferredName: string,
) {
  return (
    columns.find((column) => column.name.includes(preferredName)) ??
    columns[0] ??
    null
  );
}

function getPlannerPrimaryColumn(columns: PlannerColumnData[]) {
  return (
    columns.find((column) => column.name.includes("저녁")) ??
    columns.at(-1) ??
    null
  );
}

function WebProfileButton() {
  return (
    <Link
      aria-label="마이페이지"
      className="web-profile-button"
      href="/mypage"
      prefetch={false}
    >
      <UserIcon />
    </Link>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11 4.5L6.5 9l4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 4.5L11.5 9 7 13.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
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

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10.2 10.2L13 13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.75 17c.65-2.65 2.46-4 5.25-4s4.6 1.35 5.25 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
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
  mealsByDateAndColumn,
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
  mealsByDateAndColumn: Map<string, PlannerMealData[]>;
  plannerBodyMotionStyle: React.CSSProperties;
  rangeContextLabel: string;
  rangeEndDate: string;
  rangeStartDate: string;
  resetRange: () => Promise<void>;
  runPlannerAction: (action: Promise<void>) => void;
  screenState: "loading" | "ready" | "empty" | "error" | "read-only";
  shiftRange: (dayDelta: number) => Promise<void>;
  shoppingListLinks: Array<{ id: string; title: string }>;
  todayKey: string;
}) {
  const primaryColumn = getPlannerPrimaryColumn(columns);
  const lunchColumn = findPlannerColumn(columns, "점심");
  const quickDateKey = dateKeys.includes(todayKey) ? todayKey : dateKeys[0];
  const weekendDateKey = dateKeys.at(-1) ?? quickDateKey;
  const recentMeals = [...meals]
    .sort((a, b) => `${b.plan_date}:${b.id}`.localeCompare(`${a.plan_date}:${a.id}`))
    .slice(0, 4);
  const canShowGrid = screenState === "ready" || screenState === "empty";

  return (
    <WebShell className="web-planner" wide>
      <WebTopNav
        activeId="planner"
        items={WEB_NAV_ITEMS}
        rightSlot={<WebProfileButton />}
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
          <div className="web-planner-actions" aria-label="플래너 작업">
            <WebIconButton
              aria-label="이전 주"
              onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
            >
              <ChevronLeftIcon />
            </WebIconButton>
            {!isCurrentRange ? (
              <WebButton
                onClick={() => runPlannerAction(resetRange())}
                variant="tertiary"
              >
                이번주로
              </WebButton>
            ) : null}
            <WebIconButton
              aria-label="다음 주"
              onClick={() => runPlannerAction(shiftRange(RANGE_SHIFT_DAYS))}
            >
              <ChevronRightIcon />
            </WebIconButton>
            <Link className="web-button web-button-secondary" href="/cooking/ready">
              요리 준비
            </Link>
            <Link className="web-button web-button-primary" href="/shopping/flow">
              장보기 미리보기
            </Link>
          </div>
        </header>

        <div className="web-planner-layout">
          <aside className="web-planner-side" aria-label="플래너 요약">
            <section className="web-planner-side-section">
              <p className="web-planner-side-label">이번 주 요약</p>
              <div className="web-planner-stat-list">
                <div className="web-planner-stat">
                  <span>등록된 끼니</span>
                  <strong>{mealStats.total}개</strong>
                </div>
                <div className="web-planner-stat web-planner-stat-success">
                  <span><i className="web-planner-dot web-planner-dot-cooked" />요리 완료</span>
                  <strong>{mealStats.cookDone}개</strong>
                </div>
                <div className="web-planner-stat web-planner-stat-warning">
                  <span><i className="web-planner-dot web-planner-dot-shopped" />장본 끼니</span>
                  <strong>{mealStats.shoppingDone}개</strong>
                </div>
                <div className="web-planner-stat">
                  <span><i className="web-planner-dot web-planner-dot-registered" />등록</span>
                  <strong>{mealStats.registered}개</strong>
                </div>
              </div>
            </section>

            <section className="web-planner-side-section">
              <p className="web-planner-side-label">빠른 추가</p>
              <div className="web-planner-quick-list">
                {primaryColumn && quickDateKey ? (
                  <Link
                    className="web-planner-quick"
                    href={getMealAddHrefForSlot(quickDateKey, primaryColumn)}
                  >
                    <PlusIcon />
                    오늘 {primaryColumn.name}
                  </Link>
                ) : null}
                {lunchColumn && weekendDateKey ? (
                  <Link
                    className="web-planner-quick"
                    href={getMealAddHrefForSlot(weekendDateKey, lunchColumn)}
                  >
                    <PlusIcon />
                    주말 {lunchColumn.name}
                  </Link>
                ) : null}
                <Link className="web-planner-quick" href="/menu-add">
                  <SearchIcon />
                  레시피 검색
                </Link>
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
                      className="web-planner-shopping-link"
                      href={`/shopping/lists/${shoppingList.id}`}
                      key={shoppingList.id}
                    >
                      {shoppingList.title}
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
                description={errorMessage ?? "잠시 후 다시 시도해주세요."}
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
                {screenState === "empty" ? (
                  <WebEmptyState
                    action={
                      primaryColumn && quickDateKey ? (
                        <Link
                          className="web-button web-button-secondary"
                          href={getMealAddHrefForSlot(quickDateKey, primaryColumn)}
                        >
                          첫 식사 추가
                        </Link>
                      ) : null
                    }
                    className="web-planner-empty-callout"
                    description="표의 빈 칸에서 바로 식사를 추가할 수 있어요."
                    title="아직 등록된 식사가 없어요"
                  />
                ) : null}

                <div className="web-planner-grid">
                  <div className="web-planner-corner" aria-hidden="true" />
                  {dateKeys.map((dateKey) => {
                    const isToday = dateKey === todayKey;

                    return (
                      <div
                        className={[
                          "web-planner-head",
                          isToday ? "web-planner-head-today" : "",
                        ].join(" ")}
                        key={dateKey}
                      >
                        <span>{formatWeekdayLabel(dateKey)}</span>
                        <strong>{formatCompactDateLabel(dateKey)}</strong>
                      </div>
                    );
                  })}

                  {columns.map((column) => (
                    <React.Fragment key={column.id}>
                      <div className="web-planner-time">{column.name}</div>
                      {dateKeys.map((dateKey) => {
                        const slotKey = `${dateKey}:${column.id}`;
                        const slotMeals = mealsByDateAndColumn.get(slotKey) ?? [];
                        const visibleMeals = slotMeals.slice(0, 2);
                        const overflowCount = Math.max(0, slotMeals.length - visibleMeals.length);
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
                            {visibleMeals.map((meal) => (
                              <Link
                                className={[
                                  "web-planner-meal",
                                  `web-planner-meal-${getPlannerMealStatusClass(meal.status)}`,
                                ].join(" ")}
                                href={mealHref}
                                key={meal.id}
                              >
                                <span
                                  aria-hidden="true"
                                  className="web-planner-meal-thumb"
                                  style={
                                    meal.recipe_thumbnail_url
                                      ? {
                                          backgroundImage: `url(${meal.recipe_thumbnail_url})`,
                                        }
                                      : undefined
                                  }
                                />
                                <span className="web-planner-meal-copy">
                                  <span className="web-planner-meal-title">
                                    {meal.recipe_title}
                                  </span>
                                  <span className="web-planner-meal-meta">
                                    {meal.planned_servings}인분 · {getPlannerMealStatusLabel(meal.status)}
                                  </span>
                                </span>
                              </Link>
                            ))}
                            {overflowCount > 0 ? (
                              <Link className="web-planner-more" href={mealHref}>
                                +{overflowCount}개 더 보기
                              </Link>
                            ) : null}
                            <Link
                              aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                              className={[
                                "web-planner-add",
                                slotMeals.length > 0 ? "web-planner-add-compact" : "",
                              ].join(" ")}
                              href={addHref}
                            >
                              <PlusIcon />
                              <span>{slotMeals.length > 0 ? "추가" : "식사 추가"}</span>
                            </Link>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                <div className="web-planner-legend" aria-label="식사 상태 범례">
                  <span><i className="web-planner-dot web-planner-dot-registered" />등록</span>
                  <span><i className="web-planner-dot web-planner-dot-shopped" />장보기 완료</span>
                  <span><i className="web-planner-dot web-planner-dot-cooked" />요리 완료</span>
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
  const searchParams = useSearchParams();
  const rangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const rangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const columns = usePlannerStore((state) => state.columns);
  const meals = usePlannerStore((state) => state.meals);
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
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => todayKey);
  const mobileDayCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const webDayCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const mealStats = useMemo(() => {
    let cookDone = 0;
    let shoppingDone = 0;
    meals.forEach((m) => {
      if (m.status === "cook_done") cookDone++;
      else if (m.status === "shopping_done") shoppingDone++;
    });
    return {
      total: meals.length,
      cookDone,
      shoppingDone,
      registered: meals.length - cookDone - shoppingDone,
    };
  }, [meals]);
  const shoppingListLinks = useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        title: string;
        dates: string[];
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
      };

      if (!existing.dates.includes(meal.plan_date)) {
        existing.dates.push(meal.plan_date);
      }

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

  const recenterWeekStripViewport = useCallback(() => {
    const viewport = getActiveWeekStripViewport();

    if (!viewport) {
      return;
    }

    const targetLeft = viewport.clientWidth * WEEK_PAGE_INDEX_CURRENT;
    isRecenteringWeekStripRef.current = true;
    viewport.scrollLeft = targetLeft;
    window.requestAnimationFrame(() => {
      isRecenteringWeekStripRef.current = false;
    });
  }, [getActiveWeekStripViewport]);

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

    runPlannerAction(loadPlanner());
  }, [authState, loadPlanner]);

  useLayoutEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    recenterWeekStripViewport();
  }, [authState, rangeEndDate, rangeStartDate, recenterWeekStripViewport]);

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
  }

  function closeMealAddSheet() {
    setMealAddSheet(null);
  }

  function getMealAddHref(target: "search" | "recipebook" | "pantry" | "leftover" | "manual" | "youtube") {
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

    if (target === "search" || target === "recipebook" || target === "pantry" || target === "leftover") {
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
      <ContentState
        className="md:px-7"
        description="플래너 접근 권한과 현재 세션을 확인하고 있어요."
        eyebrow="세션 확인"
        tone="loading"
        title="로그인 상태를 확인하고 있어요"
      />
    );
  }

  if (authState === "unauthorized") {
    return (
      <ContentState
        className="-mt-5 md:mt-0"
        description="플래너를 사용하려면 로그인해주세요. 로그인 후에는 다시 플래너 화면으로 돌아옵니다."
        eyebrow="플래너 접근"
        safeBottomPadding
        tone="gate"
        title="이 화면은 로그인이 필요해요"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              로그인하면 원래 보던 주간 범위로 바로 복귀해요.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
              데스크톱과 모바일 모두 같은 헤더와 상태 셸 톤으로 접근을 안내합니다.
            </p>
          </div>
          <SocialLoginButtons nextPath="/planner" />
          <Link
            className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  return (
    <>
      {shouldRenderAppView ? (
        <div className="min-h-screen bg-[#F8F9FA] pb-[128px] text-[#212529] lg:hidden">
        <div className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center border-b border-[#DEE2E6] bg-white px-4">
          <div className="min-w-8 flex-1" aria-hidden="true" />
          <h1 className="flex-1 text-center text-[18px] font-bold leading-none text-[#212529]">
            플래너
          </h1>
          <div className="min-w-8 flex-1" aria-hidden="true" />
        </div>

        <section className="border-b border-[#F1F3F5] bg-white px-5 py-4">
          <p className="mb-3 text-[20px] font-bold leading-[1.25] text-[#212529]">
            {mealStats.total}개 음식 계획 중
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[var(--radius-control)] bg-[#E8F8E0] p-3">
              <p className="text-[11px] font-semibold text-[#51CF66]">요리 완료</p>
              <p className="mt-0.5 text-[20px] font-bold leading-none text-[#51CF66]">
                {mealStats.cookDone}개
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-[#FFEBEB] p-3">
              <p className="text-[11px] font-semibold text-[#FF6B6B]">장보기 완료</p>
              <p className="mt-0.5 text-[20px] font-bold leading-none text-[#FF6B6B]">
                {mealStats.shoppingDone}개
              </p>
            </div>
            <div className="rounded-[var(--radius-control)] bg-[#F8F9FA] p-3">
              <p className="text-[11px] font-semibold text-[#495057]">등록</p>
              <p className="mt-0.5 text-[20px] font-bold leading-none text-[#212529]">
                {mealStats.registered}개
              </p>
            </div>
          </div>
          {shoppingListLinks.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {shoppingListLinks.map((shoppingList) => (
                <Link
                  className="inline-flex min-h-9 items-center justify-center rounded-full border border-[var(--brand)] bg-[var(--brand-soft)] px-3 text-[12px] font-bold text-[var(--brand)]"
                  href={`/shopping/lists/${shoppingList.id}`}
                  key={shoppingList.id}
                  style={{ color: "var(--brand)" }}
                >
                  {shoppingList.title} 보기
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section
          className="sticky top-[52px] z-20 border-b border-[#DEE2E6] bg-white px-3.5 py-3"
          data-testid="planner-week-shell"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              aria-label="이전 주"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[#DEE2E6] bg-[#F8F9FA] text-[17px] leading-none text-[#495057]"
              onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
              type="button"
            >
              ‹
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-[14px] font-semibold text-[#212529]">
              {rangeContextLabel} {formatMobileWeekRangeLabel(rangeStartDate, rangeEndDate)}
            </p>
            <button
              aria-label="다음 주"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[#DEE2E6] bg-[#F8F9FA] text-[17px] leading-none text-[#495057]"
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
                              "relative flex h-[54px] w-full min-w-0 flex-col items-center justify-center gap-px rounded-[var(--radius-card)] text-center transition-colors",
                              isSelected
                                ? "border-2 border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-[0_2px_8px_var(--brand-shadow-color)]"
                                : "border border-[#DEE2E6] bg-white text-[#495057]",
                            ].join(" ")}
                            onClick={() => handleDateChipClick(page.key, dateKey)}
                            type="button"
                          >
                            {isToday ? (
                              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
                            ) : null}
                            <span className="text-[10px] font-semibold leading-none">
                              {formatWeekdayLabel(dateKey)}
                            </span>
                            <span className="text-[19px] font-semibold leading-none">
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
                className="min-h-36 border border-[#DEE2E6]"
                key={index}
                style={{ borderRadius: 12 }}
              />
            ))}
          </div>
        ) : null}

        {screenState === "error" ? (
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
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
            className="space-y-3 px-4 py-4"
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
                mealsByDateAndColumn.has(`${dateKey}:${col.id}`),
              ).length;

              return (
                <article
                  aria-label={`${formatDateLabel(dateKey)} 식단 카드`}
                  className={[
                    "scroll-mt-[164px] overflow-hidden rounded-[var(--radius-card)] bg-white",
                    isSelected
                      ? "border-2 border-[var(--brand)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                      : "border border-[#DEE2E6]",
                  ].join(" ")}
                  data-testid={`planner-day-card-${dateKey}`}
                  key={dateKey}
                  ref={(node) => {
                    mobileDayCardRefs.current[dateKey] = node;
                  }}
                >
                  <div className="flex items-center border-b border-[#F1F3F5] px-4 py-3">
                    <span
                      className={[
                        "mr-2.5 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold",
                        isToday ? "bg-[var(--brand)] text-white" : "bg-[#F8F9FA] text-[#212529]",
                      ].join(" ")}
                    >
                      {formatWeekdayLabel(dateKey)}
                    </span>
                    <p className="flex-1 text-[16px] font-semibold text-[#212529]">
                      {formatCompactDateLabel(dateKey)}
                    </p>
                    <span className="text-[12px] text-[#868E96]">
                      {dayMealCount}/{columns.length}
                    </span>
                  </div>

                  <div>
                    {columns.map((column, columnIndex) => {
                      const slotKey = `${dateKey}:${column.id}`;
                      const slotMeals = mealsByDateAndColumn.get(slotKey) ?? [];
                      const visibleMeals = slotMeals.slice(0, 2);

                      return (
                        <div
                          className={[
                            "flex items-center gap-2 px-2.5 py-1.5",
                            columnIndex < columns.length - 1 ? "border-b border-[#F1F3F5]" : "",
                          ].join(" ")}
                          key={slotKey}
                        >
                          <div className="w-[34px] shrink-0 text-[12px] font-bold text-[#212529]">
                            {column.name}
                          </div>

                          {visibleMeals.length > 0 ? (
                            <>
                              <Link
                                className={[
                                  "grid min-h-[46px] min-w-0 flex-1 gap-[5px]",
                                  visibleMeals.length > 1
                                    ? "grid-cols-2"
                                    : "grid-cols-1",
                                ].join(" ")}
                                href={`/planner/${dateKey}/${column.id}?slot=${encodeURIComponent(column.name)}`}
                              >
                                {visibleMeals.map((meal, mealIndex) => (
                                  <span
                                    className="relative flex h-[46px] min-w-0 items-center overflow-hidden rounded-[var(--radius-control)] bg-[#F8F9FA] text-[#212529]"
                                    key={`${meal.id}-${mealIndex}`}
                                  >
                                    {meal.recipe_thumbnail_url ? (
                                      <Image
                                        alt=""
                                        className="h-[46px] w-[34px] shrink-0 object-cover"
                                        height={46}
                                        src={meal.recipe_thumbnail_url}
                                        unoptimized
                                        width={34}
                                      />
                                    ) : (
                                      <span className="flex h-[46px] w-[34px] shrink-0 items-center justify-center bg-[var(--brand-soft)] text-[14px] font-bold text-[var(--brand)]">
                                        {column.name.charAt(0)}
                                      </span>
                                    )}
                                    <span className="min-w-0 flex-1 px-1.5">
                                      <span
                                        className={`block truncate text-[12px] font-extrabold ${meal.is_leftover ? "text-[var(--brand-deep)]" : "text-[#212529]"}`}
                                      >
                                        {meal.recipe_title}
                                      </span>
                                      {meal.is_leftover ? (
                                        <span aria-label="남은요리 식사" className="sr-only">
                                          남은요리
                                        </span>
                                      ) : null}
                                      <span className="mt-px block text-[10px] text-[#868E96]">
                                        {meal.planned_servings}인분
                                      </span>
                                    </span>
                                    {mealIndex === 1 && slotMeals.length > 2 ? (
                                      <span className="absolute bottom-1 right-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-extrabold text-[#495057]">
                                        +{slotMeals.length - 2}
                                      </span>
                                    ) : null}
                                  </span>
                                ))}
                              </Link>
                              <button
                                aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-[#4DABF7] bg-[#E8F5FF] text-[20px] font-semibold leading-none text-[#4DABF7]"
                                onClick={() => openMealAddSheet(dateKey, column)}
                                type="button"
                              >
                                +
                              </button>
                            </>
                          ) : (
                            <button
                              aria-label={`${formatCompactDateLabel(dateKey)} ${column.name} 식사 추가`}
                              className="flex h-[38px] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-[#DEE2E6] bg-[#F8F9FA] text-[20px] font-semibold leading-none text-[#4DABF7]"
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
          className="fixed bottom-[92px] right-4 z-20 inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full bg-[#212529] px-[18px] text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.10)]"
          href="/shopping/flow"
          style={{ color: "#FFFFFF" }}
        >
          장보기
        </Link>

        {mealAddSheet ? (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/42"
            onClick={closeMealAddSheet}
          >
            <div
              aria-labelledby="planner-meal-add-title"
              aria-modal="true"
              className="min-h-[364px] w-full max-w-[480px] rounded-t-[var(--radius-sheet)] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)] max-[360px]:min-h-[375px]"
              data-testid="planner-meal-add-sheet"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="flex justify-center pb-4">
                <div className="h-1 w-9 rounded-full bg-[#DEE2E6]" />
              </div>
              <div className="mb-4 flex items-center gap-3">
                <h2
                  className="min-w-0 flex-1 text-[20px] font-bold text-[#212529]"
                  id="planner-meal-add-title"
                >
                  {formatCompactDateLabel(mealAddSheet.dateKey)} {mealAddSheet.slotName} · 식사 추가
                </h2>
                <button
                  aria-label="닫기"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8F9FA] text-[24px] leading-none text-[#495057]"
                  onClick={closeMealAddSheet}
                  type="button"
                >
                  ×
                </button>
              </div>
              <Link
                className="mb-4 flex h-10 w-full items-center gap-2 rounded-[var(--radius-control)] bg-[#F8F9FA] px-3 text-left text-[14px] text-[#868E96]"
                href={getMealAddHref("search")}
                onClick={closeMealAddSheet}
                style={{ color: "#868E96" }}
              >
                <span className="text-[18px]" aria-hidden="true">⌕</span>
                <span>레시피 검색</span>
              </Link>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  ["recipebook", "📖", "레시피북에서 추가"],
                  ["pantry", "🧊", "팬트리 기반 추천"],
                  ["leftover", "🍱", "남은요리에서 추가"],
                  ["youtube", "🎬", "유튜브에서 가져오기"],
                  ["manual", "✏️", "직접 등록"],
                ].map(([target, icon, label]) => (
                  <Link
                    className="flex min-h-[58px] items-center gap-2.5 rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white px-3 text-left text-[13px] font-semibold text-[#212529]"
                    href={getMealAddHref(
                      target as "search" | "recipebook" | "pantry" | "leftover" | "manual" | "youtube",
                    )}
                    key={target}
                    onClick={closeMealAddSheet}
                  >
                    <span className="text-[20px]" aria-hidden="true">
                      {icon}
                    </span>
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}

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
            mealsByDateAndColumn={mealsByDateAndColumn}
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
    </>
  );
}
