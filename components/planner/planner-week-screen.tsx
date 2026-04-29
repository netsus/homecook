"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
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
const PLANNER_CTA_CLASS =
  "min-h-[40px] rounded-[var(--radius-md)] border border-transparent px-2 py-2 text-[11px] font-medium leading-none tracking-[-0.01em] sm:px-3 sm:text-[12px]";

const STATUS_META: Record<
  MealStatus,
  { label: string; shortLabel: string; className: string }
> = {
  registered: {
    label: "식사 등록 완료",
    shortLabel: "등록",
    className: "bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand-deep)]",
  },
  shopping_done: {
    label: "장보기 완료",
    shortLabel: "장보기",
    className: "bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] text-[var(--olive)]",
  },
  cook_done: {
    label: "요리 완료",
    shortLabel: "요리",
    className: "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-[var(--foreground)]",
  },
};

const SLOT_EMOJI: Record<string, string> = {
  아침: "🌅",
  점심: "☀️",
  간식: "🍪",
  저녁: "🌙",
};

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
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const mealsByDateAndColumn = useMemo(() => buildMealMap(meals), [meals]);
  const todayKey = getTodayDateKey();
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
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <section className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--panel)] px-[clamp(14px,3.6vw,22px)] py-[clamp(12px,3vw,16px)] shadow-[var(--shadow-2)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--olive)]">
              Planner Week
            </p>
            <h2 className="mt-1 text-[clamp(1.45rem,5vw,1.9rem)] font-bold tracking-[-0.025em] text-[var(--foreground)]">
              식단 플래너
            </h2>
          </div>
          <div
            aria-label="플래너 보조 작업"
            className="grid w-full grid-cols-3 gap-1 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-1 md:ml-6 md:w-auto md:min-w-[17rem]"
            role="group"
          >
            {CTA_BUTTONS.map((label) => {
              if (label === "장보기") {
                return (
                  <Link
                    className={`${PLANNER_CTA_CLASS} flex items-center justify-center bg-[var(--brand)] text-[var(--surface)] shadow-[0_8px_18px_color-mix(in_srgb,var(--brand)_18%,transparent)]`}
                    href="/shopping/flow"
                    key={label}
                  >
                    {label}
                  </Link>
                );
              }
              if (label === "요리하기") {
                return (
                  <Link
                    className={`${PLANNER_CTA_CLASS} flex items-center justify-center bg-[var(--brand)] text-[var(--surface)] shadow-[0_8px_18px_color-mix(in_srgb,var(--brand)_18%,transparent)]`}
                    href="/cooking/ready"
                    key={label}
                  >
                    {label}
                  </Link>
                );
              }
              return (
                <button
                  key={label}
                  aria-disabled="true"
                  className={`${PLANNER_CTA_CLASS} bg-[var(--surface)] text-[var(--muted)] opacity-72`}
                  disabled
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {screenState === "ready" || screenState === "empty" ? (
        <section className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <p className="text-[clamp(1.1rem,4vw,1.25rem)] font-bold tracking-[-0.02em] text-[var(--foreground)]">
            {isCurrentRange ? "이번 주 " : ""}{mealStats.total}끼 계획 중
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[10px] bg-[var(--brand-soft)] p-3">
              <p className="text-[11px] font-semibold text-[var(--brand-deep)]">요리 완료</p>
              <p className="text-[20px] font-bold text-[var(--brand-deep)]">{mealStats.cookDone}끼</p>
            </div>
            <div className="rounded-[10px] bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] p-3">
              <p className="text-[11px] font-semibold text-[var(--olive)]">장보기 완료</p>
              <p className="text-[20px] font-bold text-[var(--olive)]">{mealStats.shoppingDone}끼</p>
            </div>
            <div className="rounded-[10px] bg-[var(--surface-fill)] p-3">
              <p className="text-[11px] font-semibold text-[var(--muted)]">등록</p>
              <p className="text-[20px] font-bold text-[var(--foreground)]">{mealStats.registered}끼</p>
            </div>
          </div>
          {shoppingListLinks.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {shoppingListLinks.map((shoppingList) => (
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--olive)] bg-[color-mix(in_srgb,var(--olive)_8%,transparent)] px-4 py-2 text-[12px] font-bold text-[var(--olive)]"
                  href={`/shopping/lists/${shoppingList.id}`}
                  key={shoppingList.id}
                >
                  {shoppingList.title} 보기
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        className="sticky top-2 z-20 rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--panel)] px-[clamp(12px,3vw,16px)] py-[clamp(11px,3vw,16px)] shadow-[var(--shadow-2)] backdrop-blur"
        data-testid="planner-week-shell"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-[var(--olive)] sm:text-[12px]">
                {rangeContextLabel}
              </p>
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] sm:text-[11px]">
                식사 {meals.length}건
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--olive)]">
                  현재 범위
                </p>
                <h3 className="mt-1 text-[clamp(1.15rem,4vw,1.45rem)] font-bold tracking-[-0.02em] text-[var(--foreground)]">
                  {formatRangeLabel(rangeStartDate, rangeEndDate)}
                </h3>
              </div>
              {isDesktopViewport ? (
                <div className="flex items-center gap-2">
                  <button
                    className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-[12px]"
                    onClick={() => runPlannerAction(shiftRange(-RANGE_SHIFT_DAYS))}
                    type="button"
                  >
                    이전 주
                  </button>
                  {!isCurrentRange ? (
                    <button
                      className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-[12px]"
                      onClick={() => runPlannerAction(resetRange())}
                      type="button"
                    >
                      이번주로 가기
                    </button>
                  ) : null}
                  <button
                    className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-[12px]"
                    onClick={() => runPlannerAction(shiftRange(RANGE_SHIFT_DAYS))}
                    type="button"
                  >
                    다음 주
                  </button>
                </div>
              ) : !isCurrentRange ? (
                <button
                  className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] sm:min-h-10 sm:px-4 sm:text-[12px]"
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
                  <ol className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-[var(--muted)] sm:gap-2 sm:text-[11px]">
                    {page.dateKeys.map((dateKey) => (
                      <li key={dateKey} className="list-none">
                        <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-1 py-1.5 sm:px-1.5 sm:py-2">
                          <p>{formatWeekdayLabel(dateKey)}</p>
                          <p className="mt-0.5 text-[clamp(0.84rem,3vw,0.94rem)] font-semibold text-[var(--foreground)]">
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
            <Skeleton
              key={index}
              className="min-h-36 border border-[var(--line)] shadow-[var(--shadow-1)]"
              style={{ borderRadius: "var(--radius-xl)" }}
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
          className="space-y-2 sm:space-y-2.5"
          data-testid="planner-week-body"
          style={plannerBodyMotionStyle}
        >
          {screenState === "empty" ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadow-1)]">
              <p className="text-sm text-[var(--muted)]">아직 등록된 식사가 없어요.</p>
            </div>
          ) : null}

          {dateKeys.map((dateKey) => {
            const isToday = dateKey === todayKey;
            const dayMealCount = columns.filter((col) =>
              mealsByDateAndColumn.has(`${dateKey}:${col.id}`),
            ).length;

            return (
              <article
                key={dateKey}
                aria-label={`${formatDateLabel(dateKey)} 식단 카드`}
                className={`overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] ${
                  isToday
                    ? "border-2 border-[var(--brand)] shadow-[var(--shadow-2)]"
                    : "border border-[var(--line)]"
                }`}
              >
                {/* Day header */}
                <div
                  className={`flex items-center px-4 py-3 ${
                    isToday
                      ? "border-b border-[var(--surface-subtle)] bg-[var(--brand-soft)]"
                      : "border-b border-[var(--surface-subtle)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold ${
                      isToday
                        ? "bg-[var(--brand)] text-[var(--surface)]"
                        : "bg-[var(--surface-fill)] text-[var(--foreground)]"
                    }`}
                  >
                    {formatWeekdayLabel(dateKey)}
                  </span>
                  <div className="ml-2.5 min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[var(--foreground)]">
                      {formatDateLabel(dateKey)}
                      {isToday ? (
                        <span className="ml-1 text-[12px] font-semibold text-[var(--brand)]">
                          오늘
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-[12px] text-[var(--text-3)]">
                    {dayMealCount}/{columns.length}
                  </span>
                </div>

                {/* Slot rows */}
                <div className="divide-y divide-[var(--surface-subtle)]">
                  {columns.map((column) => {
                    const slotKey = `${dateKey}:${column.id}`;
                    const slotMeals = mealsByDateAndColumn.get(slotKey) ?? [];
                    const meal = slotMeals[0] ?? null;

                    return (
                      <Link
                        key={slotKey}
                        className="flex min-h-[44px] items-center px-4 py-2.5"
                        href={`/planner/${dateKey}/${column.id}?slot=${encodeURIComponent(column.name)}`}
                      >
                        {/* Emoji + slot name */}
                        <div className="w-12 shrink-0 text-center">
                          <span className="text-[18px] leading-none">
                            {SLOT_EMOJI[column.name] ?? "🍽️"}
                          </span>
                          <p className="mt-0.5 text-[12px] font-semibold text-[var(--text-3)]">
                            {column.name}
                          </p>
                        </div>

                        {meal ? (
                          <>
                            {/* Thumbnail */}
                            {meal.recipe_thumbnail_url ? (
                              <img
                                alt=""
                                className="ml-1 mr-2.5 h-11 w-11 rounded-[var(--radius-sm)] object-cover"
                                src={meal.recipe_thumbnail_url}
                              />
                            ) : (
                              <div className="ml-1 mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-fill)]">
                                <span className="text-xl">
                                  {SLOT_EMOJI[column.name] ?? "🍽️"}
                                </span>
                              </div>
                            )}
                            {/* Meal info */}
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-[14px] font-semibold leading-tight ${meal.is_leftover ? "text-[var(--olive)]" : "text-[var(--foreground)]"}`}
                              >
                                {meal.recipe_title}
                                {slotMeals.length > 1 ? (
                                  <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">
                                    +{slotMeals.length - 1}
                                  </span>
                                ) : null}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span
                                  aria-label={STATUS_META[meal.status].label}
                                  className={`inline-flex shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold tracking-[-0.02em] ${STATUS_META[meal.status].className}`}
                                >
                                  {STATUS_META[meal.status].shortLabel}
                                </span>
                                <span className="text-[11px] text-[var(--text-3)]">
                                  {meal.planned_servings}인분
                                </span>
                              </div>
                            </div>
                            {/* Chevron */}
                            <svg
                              className="ml-2 shrink-0 text-[var(--text-3)]"
                              fill="none"
                              height="14"
                              viewBox="0 0 8 14"
                              width="8"
                            >
                              <path
                                d="M1 1l6 6-6 6"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="2"
                              />
                            </svg>
                          </>
                        ) : (
                          <span className="ml-3 flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--line)] text-[13px] text-[var(--text-3)]">
                            + 식사 추가
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {/* Floating shopping CTA */}
      {(screenState === "ready" || screenState === "empty") ? (
        <div className="fixed bottom-[88px] right-4 z-40">
          <Link
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--foreground)] px-[18px] py-3 text-[14px] font-bold shadow-[0_4px_12px_rgba(0,0,0,0.10)]"
            href="/shopping/flow"
            style={{ color: "var(--surface)" }}
          >
            🛒 장보기 목록 만들기
          </Link>
        </div>
      ) : null}
    </div>
  );
}
