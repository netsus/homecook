"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  createDefaultPlannerRange,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { usePlannerStore } from "@/stores/planner-store";
import type { MealStatus, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;
const WEEK_PAGE_INDEX_CURRENT = 1;
const WEEK_SCROLL_SETTLE_MS = 96;
const CTA_BUTTONS = ["장보기", "요리하기", "남은요리"] as const;

const STATUS_META: Record<
  MealStatus,
  { label: string; shortLabel: string; className: string }
> = {
  registered: {
    label: "식사 등록 완료",
    shortLabel: "등록",
    className: "bg-[color:rgba(255,108,60,0.12)] text-[var(--brand-deep)]",
  },
  shopping_done: {
    label: "장보기 완료",
    shortLabel: "장보기",
    className: "bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]",
  },
  cook_done: {
    label: "요리 완료",
    shortLabel: "요리",
    className: "bg-[color:rgba(30,30,30,0.08)] text-[var(--foreground)]",
  },
};

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

function readDesktopViewportMatch() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(min-width: 768px)").matches;
}

export function PlannerWeekScreen({
  initialAuthenticated = false,
}: PlannerWeekScreenProps) {
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

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [isDesktopViewport, setIsDesktopViewport] = useState(readDesktopViewportMatch);

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const defaultRange = createDefaultPlannerRange();
  const isCurrentRange =
    rangeStartDate === defaultRange.startDate && rangeEndDate === defaultRange.endDate;
  const weekStripViewportRef = useRef<HTMLDivElement | null>(null);
  const weekStripSettleTimerRef = useRef<number | null>(null);
  const isWeekStripInteractingRef = useRef(false);
  const isRecenteringWeekStripRef = useRef(false);
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

  function recenterWeekStripViewport() {
    const viewport = weekStripViewportRef.current;

    if (!viewport) {
      return;
    }

    const targetLeft = viewport.clientWidth * WEEK_PAGE_INDEX_CURRENT;
    isRecenteringWeekStripRef.current = true;
    viewport.scrollLeft = targetLeft;
    window.requestAnimationFrame(() => {
      isRecenteringWeekStripRef.current = false;
    });
  }

  function commitSettledWeekStripPage() {
    const viewport = weekStripViewportRef.current;

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
    if (!weekStripViewportRef.current) {
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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

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
  }, [authState, rangeEndDate, rangeStartDate]);

  useEffect(() => {
    return () => {
      clearWeekStripSettleTimer();
    };
  }, []);

  const plannerBodyMotionStyle = {
    opacity: isRefreshing ? 0.97 : 1,
    transform: "translateX(0px)",
    transition: "opacity 180ms ease",
  } as const;

  if (authState === "checking") {
    return (
      <div className="glass-panel rounded-[20px] p-6">
        <p className="text-sm text-[var(--muted)]">로그인 상태를 확인하고 있어요...</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="-mt-5 action-safe-bottom-panel glass-panel rounded-[20px] p-4 md:mt-0 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
          Planner Access
        </p>
        <h2 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-[var(--foreground)] md:mt-3 md:text-2xl">
          이 화면은 로그인이 필요해요
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-[var(--muted)] md:mt-3">
          플래너를 사용하려면 로그인해주세요. 로그인 후에는 다시 플래너 화면으로 돌아옵니다.
        </p>
        <div className="mt-2 md:mt-6">
          <SocialLoginButtons nextPath="/planner" />
        </div>
        <div className="mt-2 md:mt-4">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="glass-panel rounded-[clamp(22px,6vw,28px)] px-[clamp(14px,4vw,24px)] py-[clamp(13px,3.8vw,20px)]">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
              Planner Week
            </p>
            <h2 className="mt-1 text-[clamp(1.75rem,7vw,2.35rem)] font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
              식단 플래너
            </h2>
          </div>
          <div
            aria-label="플래너 보조 작업"
            className="grid w-full grid-cols-3 gap-1 rounded-[18px] border border-[var(--line)] bg-white/76 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] md:ml-6 md:w-auto md:min-w-[18rem]"
            role="group"
          >
            {CTA_BUTTONS.map((label) => (
              <button
                key={label}
                aria-disabled="true"
                className="min-h-[44px] rounded-[14px] border border-transparent bg-[var(--surface)] px-2 py-2 text-[12px] font-semibold leading-none tracking-[-0.01em] text-[var(--muted)] opacity-70 sm:px-3 sm:text-[13px]"
                disabled
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="glass-panel sticky top-2 z-20 rounded-[clamp(18px,5vw,24px)] border border-[var(--line)] bg-white/88 px-[clamp(12px,3.5vw,18px)] py-[clamp(12px,3.5vw,18px)] shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur"
        data-testid="planner-week-shell"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[var(--olive)] sm:text-[13px]">
                {rangeContextLabel}
              </p>
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--muted)] sm:text-[12px]">
                식사 {meals.length}건
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                  현재 범위
                </p>
                <h3 className="mt-1 text-[clamp(1.35rem,5.6vw,1.85rem)] font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                  {formatRangeLabel(rangeStartDate, rangeEndDate)}
                </h3>
              </div>
              {isDesktopViewport ? (
                <div className="flex items-center gap-2">
                  <button
                    className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                    onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
                    type="button"
                  >
                    이전 주
                  </button>
                  {!isCurrentRange ? (
                    <button
                      className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                      onClick={() => runPlannerAction(resetRange())}
                      type="button"
                    >
                      이번주로 가기
                    </button>
                  ) : null}
                  <button
                    className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                    onClick={() => runPlannerAction(shiftRange(RANGE_SHIFT_DAYS))}
                    type="button"
                  >
                    다음 주
                  </button>
                </div>
              ) : !isCurrentRange ? (
                <button
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-sm"
                  onClick={() => runPlannerAction(resetRange())}
                  type="button"
                >
                  이번주로 가기
                </button>
              ) : null}
            </div>
          </div>

          <p className="sr-only" id="planner-week-strip-hint">
            주간 날짜 스트립을 좌우로 넘기면 이전 주 또는 다음 주로 이동할 수 있어요.
          </p>
          <div
            aria-describedby="planner-week-strip-hint"
            aria-busy={isRefreshing}
            aria-label="주간 날짜 스트립"
            className="scrollbar-hide overflow-x-auto overscroll-x-contain snap-x snap-mandatory touch-pan-x"
            data-testid="planner-week-strip-viewport"
            onKeyDown={handleWeekStripKeyDown}
            onScroll={handleWeekStripScroll}
            onMouseDown={handleWeekStripInteractionStart}
            onMouseUp={handleWeekStripInteractionEnd}
            onMouseLeave={handleWeekStripInteractionEnd}
            ref={weekStripViewportRef}
            tabIndex={0}
            onTouchCancel={handleWeekStripInteractionEnd}
            onTouchEnd={handleWeekStripInteractionEnd}
            onTouchStart={handleWeekStripInteractionStart}
          >
            <div className="flex">
              {weekPages.map((page) => (
                <section
                  key={page.key}
                  className="min-w-full snap-center snap-always"
                  data-testid={`planner-week-strip-page-${page.key}`}
                >
                  <ol className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-[var(--muted)] sm:gap-2 sm:text-xs">
                    {page.dateKeys.map((dateKey) => (
                      <li key={dateKey} className="list-none">
                        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-1 py-2 sm:px-1.5">
                          <p>{formatWeekdayLabel(dateKey)}</p>
                          <p className="mt-0.5 text-[clamp(0.9rem,3.2vw,0.98rem)] text-[var(--foreground)]">
                            {dateKey.slice(8)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {screenState === "loading" ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="glass-panel min-h-36 animate-pulse rounded-[20px] bg-white/70"
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
          title="플래너를 불러오지 못했어요"
        />
      ) : null}

      {screenState === "ready" || screenState === "empty" ? (
        <section
          aria-busy={isRefreshing}
          className="space-y-2.5 sm:space-y-3"
          data-testid="planner-week-body"
          style={plannerBodyMotionStyle}
        >
          {screenState === "empty" ? (
            <div className="glass-panel rounded-[18px] px-4 py-3">
              <p className="text-sm text-[var(--muted)]">아직 등록된 식사가 없어요.</p>
            </div>
          ) : null}

          {dateKeys.map((dateKey) => (
            <article
              key={dateKey}
              aria-label={`${formatDateLabel(dateKey)} 식단 카드`}
              className="glass-panel rounded-[clamp(20px,5vw,24px)] px-[clamp(12px,3.5vw,18px)] py-[clamp(12px,3.5vw,18px)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[12px] bg-[var(--foreground)] px-2.5 text-[13px] font-bold text-white sm:min-h-10 sm:min-w-10 sm:text-sm">
                    {formatWeekdayLabel(dateKey)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[clamp(1.1rem,4.8vw,1.45rem)] font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                      {formatDateLabel(dateKey)}
                    </p>
                  </div>
                </div>
                <button
                  aria-disabled="true"
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-[var(--line)] text-lg text-[var(--muted)] opacity-55 sm:min-h-10 sm:min-w-10"
                  disabled
                  type="button"
                >
                  ⋯
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {columns.map((column) => {
                  const slotKey = `${dateKey}:${column.id}`;
                  const slotMeals = mealsByDateAndColumn.get(slotKey) ?? [];
                  const meal = slotMeals[0] ?? null;

                  return (
                    <section
                      key={slotKey}
                      className={`rounded-[15px] border px-[clamp(9px,2.6vw,12px)] py-[clamp(9px,2.6vw,12px)] ${
                        meal?.is_leftover
                          ? "border-[color:rgba(46,166,122,0.2)] bg-[color:rgba(46,166,122,0.08)]"
                          : "border-[var(--line)] bg-[var(--surface)]"
                      }`}
                    >
                      <h4 className="text-[12px] font-bold text-[var(--foreground)] sm:text-[13px]">
                        {column.name}
                      </h4>
                      {meal ? (
                        <>
                          <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-4 text-[var(--foreground)] sm:text-[13px]">
                            {meal.recipe_title}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--muted)] sm:text-[11px]">
                            <span>{meal.planned_servings}인분</span>
                            <span
                              aria-label={STATUS_META[meal.status].label}
                              className={`inline-flex rounded-full px-1.5 py-0.5 font-semibold ${STATUS_META[meal.status].className}`}
                            >
                              {STATUS_META[meal.status].shortLabel}
                            </span>
                            {slotMeals.length > 1 ? (
                              <span className="font-medium text-[var(--muted)]">
                                +{slotMeals.length - 1}
                              </span>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-[var(--muted)] sm:text-[13px]">
                          비어 있음
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
