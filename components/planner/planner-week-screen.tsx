"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { createDefaultPlannerRange, isPlannerApiError } from "@/lib/api/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { usePlannerStore } from "@/stores/planner-store";
import type { MealStatus, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;
const SWIPE_THRESHOLD_PX = 44;
const SWIPE_PREVIEW_OFFSET_PX = 22;
const SWIPE_MAX_DRAG_PX = 84;
const CONTENT_DRAG_RATIO = 0.18;
const CTA_BUTTONS = ["장보기", "요리하기", "남은요리"] as const;
type SwipeDirection = -1 | 0 | 1;

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

function clampSwipeOffset(deltaX: number) {
  return Math.max(-SWIPE_MAX_DRAG_PX, Math.min(SWIPE_MAX_DRAG_PX, deltaX));
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
  const [isWeekStripDragging, setIsWeekStripDragging] = useState(false);
  const [weekStripOffset, setWeekStripOffset] = useState(0);
  const [refreshDirection, setRefreshDirection] = useState<SwipeDirection>(0);

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const defaultRange = createDefaultPlannerRange();
  const isCurrentRange =
    rangeStartDate === defaultRange.startDate && rangeEndDate === defaultRange.endDate;
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureSourceRef = useRef<"pointer" | "touch" | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const rangeContextLabel = getRangeContextLabel(rangeStartDate, defaultRange.startDate);

  function runPlannerAction(action: Promise<void>) {
    void action.catch((error) => {
      if (isPlannerApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    });
  }

  function resetWeekStripGesture() {
    swipeStartRef.current = null;
    gestureSourceRef.current = null;
    activePointerIdRef.current = null;
    setIsWeekStripDragging(false);
    setWeekStripOffset(0);
  }

  function beginWeekStripGesture(
    source: "pointer" | "touch",
    clientX: number,
    clientY: number,
  ) {
    if (gestureSourceRef.current && gestureSourceRef.current !== source) {
      return;
    }

    if (isRefreshing || screenState === "loading") {
      return;
    }

    gestureSourceRef.current = source;
    swipeStartRef.current = {
      x: clientX,
      y: clientY,
    };
    setIsWeekStripDragging(true);
    setWeekStripOffset(0);
  }

  function updateWeekStripGesture(
    source: "pointer" | "touch",
    clientX: number,
    clientY: number,
  ) {
    if (gestureSourceRef.current !== source) {
      return false;
    }

    const swipeStart = swipeStartRef.current;

    if (!swipeStart) {
      return false;
    }

    const deltaX = clientX - swipeStart.x;
    const deltaY = clientY - swipeStart.y;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalSwipe) {
      setWeekStripOffset(clampSwipeOffset(deltaX));
    }

    return isHorizontalSwipe;
  }

  function completeWeekStripGesture(
    source: "pointer" | "touch",
    clientX: number,
    clientY: number,
  ) {
    if (gestureSourceRef.current !== source) {
      return;
    }

    const swipeStart = swipeStartRef.current;
    gestureSourceRef.current = null;
    swipeStartRef.current = null;
    setIsWeekStripDragging(false);

    if (!swipeStart) {
      setWeekStripOffset(0);
      return;
    }

    const deltaX = clientX - swipeStart.x;
    const deltaY = clientY - swipeStart.y;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
      setWeekStripOffset(0);
      return;
    }

    const nextDirection: SwipeDirection = deltaX < 0 ? 1 : -1;
    setRefreshDirection(nextDirection);
    setWeekStripOffset(nextDirection === 1 ? -SWIPE_PREVIEW_OFFSET_PX : SWIPE_PREVIEW_OFFSET_PX);
    runPlannerAction(
      shiftRange(nextDirection === 1 ? RANGE_SHIFT_DAYS : -RANGE_SHIFT_DAYS),
    );
  }

  function handleWeekStripPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    completeWeekStripGesture("pointer", event.clientX, event.clientY);
  }

  function handleWeekStripPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginWeekStripGesture("pointer", event.clientX, event.clientY);
  }

  function handleWeekStripPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateWeekStripGesture("pointer", event.clientX, event.clientY);
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

  function handleWeekStripTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    beginWeekStripGesture("touch", touch.clientX, touch.clientY);
  }

  function handleWeekStripTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    const isHorizontalSwipe = updateWeekStripGesture("touch", touch.clientX, touch.clientY);

    if (isHorizontalSwipe) {
      event.preventDefault();
    }
  }

  function handleWeekStripTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];

    if (!touch) {
      resetWeekStripGesture();
      return;
    }

    completeWeekStripGesture("touch", touch.clientX, touch.clientY);
  }

  useEffect(() => {
    if (isRefreshing) {
      return;
    }

    if (refreshDirection === 0 && weekStripOffset === 0) {
      return;
    }

    const resetMotion = window.requestAnimationFrame(() => {
      setWeekStripOffset(0);
      setRefreshDirection(0);
    });

    return () => {
      window.cancelAnimationFrame(resetMotion);
    };
  }, [isRefreshing, refreshDirection, weekStripOffset]);

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

  const plannerBodyOffset = isWeekStripDragging
    ? weekStripOffset * CONTENT_DRAG_RATIO
    : refreshDirection === 0
      ? 0
      : refreshDirection === 1
        ? -14
        : 14;
  const weekStripMotionStyle = {
    opacity: isRefreshing ? 0.92 : 1,
    transform: `translateX(${weekStripOffset}px)`,
    transition: isWeekStripDragging
      ? "none"
      : "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 180ms ease",
  } as const;
  const plannerBodyMotionStyle = {
    opacity: isRefreshing ? 0.92 : 1,
    transform: `translateX(${plannerBodyOffset}px)`,
    transition: isWeekStripDragging
      ? "none"
      : "transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease",
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
      <div className="-mt-5 glass-panel rounded-[20px] p-4 md:mt-0 md:p-8">
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
      <section className="glass-panel rounded-[clamp(22px,6vw,28px)] px-[clamp(14px,4vw,24px)] py-[clamp(14px,4vw,24px)]">
        <div className="flex flex-col gap-[clamp(12px,3vw,18px)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                Planner Week
              </p>
              <h2 className="mt-1.5 text-[clamp(1.9rem,8vw,2.7rem)] font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
                식단 플래너
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              {CTA_BUTTONS.map((label) => (
                <button
                  key={label}
                  aria-disabled="true"
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] opacity-60 sm:min-h-10 sm:px-4 sm:text-sm"
                  disabled
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[clamp(18px,5vw,24px)] border border-[var(--line)] bg-white/78 px-[clamp(12px,3.5vw,18px)] py-[clamp(12px,3.5vw,18px)]">
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
                  {!isCurrentRange ? (
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
                className="touch-pan-x select-none"
                onKeyDown={handleWeekStripKeyDown}
                onPointerCancel={() => {
                  resetWeekStripGesture();
                }}
                onPointerDown={handleWeekStripPointerDown}
                onPointerMove={handleWeekStripPointerMove}
                onPointerUp={handleWeekStripPointerEnd}
                onTouchCancel={resetWeekStripGesture}
                onTouchEnd={handleWeekStripTouchEnd}
                onTouchMove={handleWeekStripTouchMove}
                onTouchStart={handleWeekStripTouchStart}
                tabIndex={0}
              >
                <ol
                  className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-[var(--muted)] sm:gap-2 sm:text-xs"
                  style={weekStripMotionStyle}
                >
                  {dateKeys.map((dateKey) => (
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
              </div>
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
