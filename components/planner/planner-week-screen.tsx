"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { LegacyProductPlanSection } from "@/components/planner/legacy-product-plan-section";
import {
  MealLogUnavailableState,
  PlannerSegmentTabs,
} from "@/components/planner/planner-shell-segments";
import { ContentState } from "@/components/shared/content-state";
import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { Skeleton } from "@/components/ui/skeleton";
import { WebTopNav } from "@/components/web";
import { deleteProductPlannerEntry } from "@/lib/api/product-planner-entry";
import {
  createDefaultPlannerRange,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  formatKoreaCompactDate,
  formatKoreaDate,
  formatKoreaWeekday,
} from "@/lib/korean-date";
import {
  buildPlannerShellHref,
  readPlannerShellLocation,
  type PlannerShellSegment,
} from "@/lib/planner/planner-shell-navigation";
import {
  clearPlannerWeekReturnContext,
  readPlannerWeekReturnContext,
} from "@/lib/planner/planner-week-return-context";
import { buildPlannerMealStatusStats } from "@/lib/planner-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { usePlannerStore } from "@/stores/planner-store";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
}

const RANGE_SHIFT_DAYS = 7;

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateKeys(startDate: string, endDate: string) {
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dateKeys: string[] = [];

  while (cursor <= end) {
    dateKeys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dateKeys;
}

function buildWeekRangeForDate(dateKey: string) {
  const selected = new Date(`${dateKey}T00:00:00.000Z`);
  const mondayOffset = (selected.getUTCDay() + 6) % 7;
  const start = new Date(selected);
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    endDate: end.toISOString().slice(0, 10),
    startDate: start.toISOString().slice(0, 10),
  };
}

function getPlannerRangeKey(range: { endDate: string; startDate: string }) {
  return `${range.startDate}:${range.endDate}`;
}

function formatDateLabel(dateKey: string) {
  return formatKoreaDate(dateKey, { day: "numeric", month: "long" });
}

function formatCompactDateLabel(dateKey: string) {
  return formatKoreaCompactDate(dateKey);
}

function formatWeekdayLabel(dateKey: string) {
  return formatKoreaWeekday(dateKey, "short");
}

function formatRangeLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} ~ ${formatDateLabel(endDate)}`;
}

function getStatusLabel(status: PlannerMealData["status"]) {
  if (status === "shopping_done") return "장보기 완료";
  if (status === "cook_done") return "요리 완료";
  return "등록";
}

function getStatusStyles(status: PlannerMealData["status"]) {
  if (status === "shopping_done") {
    return "border-l-[var(--planner-status-shopping)]";
  }
  if (status === "cook_done") {
    return "border-l-[var(--planner-status-cooked)]";
  }
  return "border-l-[var(--planner-status-registered)]";
}

function getOverviewDates(dateKeys: string[], selectedDate: string) {
  if (dateKeys.length <= 2) return dateKeys;
  const selectedIndex = Math.max(0, dateKeys.indexOf(selectedDate));
  const startIndex = Math.min(selectedIndex, dateKeys.length - 2);
  return dateKeys.slice(startIndex, startIndex + 2);
}

function PlannerMealActions({
  column,
  meal,
}: {
  column: PlannerColumnData;
  meal: PlannerMealData;
}) {
  const detailHref = `/planner/${meal.plan_date}/${meal.column_id}?slot=${encodeURIComponent(column.name)}`;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {meal.status === "registered" ? (
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-[16px] text-sm font-bold [word-break:keep-all] text-[var(--text-inverse)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
          href="/shopping/flow"
        >
          장보기
        </Link>
      ) : null}
      {meal.status === "shopping_done" ? (
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-[16px] text-sm font-bold [word-break:keep-all] text-[var(--text-inverse)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
          href={detailHref}
        >
          요리하기
        </Link>
      ) : null}
      <Link
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-[16px] text-sm font-bold [word-break:keep-all] text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        href={detailHref}
      >
        상세
      </Link>
    </div>
  );
}

function PlannerDayOverview({
  columns,
  dateKey,
  meals,
  selected,
}: {
  columns: PlannerColumnData[];
  dateKey: string;
  meals: PlannerMealData[];
  selected: boolean;
}) {
  const plannedColumnIds = new Set(
    meals.filter((meal) => meal.plan_date === dateKey).map((meal) => meal.column_id),
  );
  const labels = columns.map((column) => column.name).join("/");

  return (
    <div
      className={[
        "min-w-0 rounded-[var(--radius-control)] border px-[12px] py-2.5",
        selected
          ? "border-[var(--brand)] bg-[var(--brand-soft)]"
          : "border-[var(--line-strong)] bg-[var(--surface)]",
      ].join(" ")}
    >
      <p className="text-sm font-extrabold [word-break:keep-all] text-[var(--foreground)]">
        {formatWeekdayLabel(dateKey)} {formatCompactDateLabel(dateKey)}
      </p>
      <p
        className="mt-1 flex flex-wrap gap-x-[4px] gap-y-1 text-xs text-[var(--text-2)]"
        title={labels}
      >
        {columns.length > 0
          ? columns.map((column, index) => (
              <span
                className="[overflow-wrap:anywhere] [word-break:keep-all]"
                key={column.id}
              >
                {column.name}{index < columns.length - 1 ? " ·" : ""}
              </span>
            ))
          : "끼니 설정 없음"}
      </p>
      <span className="sr-only">
        {plannedColumnIds.size}/{columns.length}개 끼니 계획
      </span>
    </div>
  );
}

function PlannerLoadingState({ columnCount }: { columnCount: number }) {
  return (
    <div aria-busy="true" className="space-y-3" data-testid="planner-loading-state">
      {Array.from({ length: Math.max(1, Math.min(columnCount, 5)) }).map(
        (_, index) => (
          <Skeleton
            className="min-h-24 border border-[var(--line-strong)]"
            key={index}
            style={{ borderRadius: 12 }}
          />
        ),
      )}
    </div>
  );
}

export function PlannerWeekScreen({
  initialAuthenticated = false,
}: PlannerWeekScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayKey = getTodayDateKey();
  const initialLocation = useMemo(
    () => readPlannerShellLocation(searchParams, todayKey),
    // The first URL is the initialization source. Later navigation is synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const rangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const rangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const columns = usePlannerStore((state) => state.columns);
  const meals = usePlannerStore((state) => state.meals);
  const productEntries = usePlannerStore((state) => state.productEntries);
  const screenState = usePlannerStore((state) => state.screenState);
  const isRefreshing = usePlannerStore((state) => state.isRefreshing);
  const errorMessage = usePlannerStore((state) => state.errorMessage);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [activeSegment, setActiveSegment] =
    useState<PlannerShellSegment>(initialLocation.segment);
  const [selectedDateKey, setSelectedDateKey] = useState(initialLocation.date);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [legacyDeleteError, setLegacyDeleteError] = useState<string | null>(null);
  const panelScrollPositions = useRef<Record<PlannerShellSegment, number>>({
    log: 0,
    plan: 0,
  });
  const [dateRailElement, setDateRailElement] =
    useState<HTMLOListElement | null>(null);
  const previousSegmentRef = useRef(activeSegment);
  const hasLoadedPlannerRef = useRef(false);
  const pendingNavigationRef = useRef<{
    date: string;
    segment: PlannerShellSegment;
  } | null>(null);
  const requestedRangeRef = useRef<string | null>(null);
  const selectedDateTitleRef = useRef<HTMLHeadingElement | null>(null);

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const selectedDate = dateKeys.includes(selectedDateKey)
    ? selectedDateKey
    : dateKeys[0] ?? selectedDateKey;
  const overviewDates = useMemo(
    () => getOverviewDates(dateKeys, selectedDate),
    [dateKeys, selectedDate],
  );
  const selectedMeals = useMemo(
    () => meals.filter((meal) => meal.plan_date === selectedDate),
    [meals, selectedDate],
  );
  const mealsByColumn = useMemo(() => {
    const result = new Map<string, PlannerMealData[]>();
    selectedMeals.forEach((meal) => {
      result.set(meal.column_id, [...(result.get(meal.column_id) ?? []), meal]);
    });
    return result;
  }, [selectedMeals]);
  const mealStats = useMemo(
    () => buildPlannerMealStatusStats(selectedMeals),
    [selectedMeals],
  );
  const defaultRange = createDefaultPlannerRange();
  const isCurrentRange =
    rangeStartDate === defaultRange.startDate && rangeEndDate === defaultRange.endDate;

  const navigateShell = useCallback(
    (
      location: { date: string; segment: PlannerShellSegment },
      method: "push" | "replace" = "push",
    ) => {
      const href = buildPlannerShellHref(
        new URLSearchParams(searchParams.toString()),
        location,
      );
      pendingNavigationRef.current = location;
      router[method](href);
    },
    [router, searchParams],
  );
  const handleRestoreConsumed = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("restore");
    next.delete("productEntryId");
    const query = next.toString();
    router.replace(query ? `/planner?${query}` : "/planner");
  }, [router, searchParams]);
  const requestPlannerRange = useCallback(
    async (range: { endDate: string; startDate: string }) => {
      requestedRangeRef.current = getPlannerRangeKey(range);
      try {
        await loadPlanner(range);
      } catch (error) {
        if (isPlannerApiError(error) && error.status === 401) {
          hasLoadedPlannerRef.current = false;
          setAuthState("unauthorized");
        }
      }
    },
    [loadPlanner],
  );

  function handleSegmentSelect(segment: PlannerShellSegment) {
    if (segment === activeSegment) return;
    panelScrollPositions.current[activeSegment] = window.scrollY;
    previousSegmentRef.current = activeSegment;
    setActiveSegment(segment);
    navigateShell({ date: selectedDate, segment });
  }

  function handleDateSelect(dateKey: string) {
    setSelectedDateKey(dateKey);
    navigateShell({ date: dateKey, segment: activeSegment });
  }

  async function loadRange(startDate: string, endDate: string, date: string) {
    setSelectedDateKey(date);
    const request = requestPlannerRange({ startDate, endDate });
    navigateShell({ date, segment: activeSegment });
    await request;
  }

  function retryPlannerLoad() {
    const location = readPlannerShellLocation(searchParams, selectedDateKey);
    const range =
      location.date >= rangeStartDate && location.date <= rangeEndDate
        ? { endDate: rangeEndDate, startDate: rangeStartDate }
        : buildWeekRangeForDate(location.date);
    void requestPlannerRange(range);
  }

  function shiftRange(dayDelta: number) {
    const nextRange = shiftPlannerRange(
      { endDate: rangeEndDate, startDate: rangeStartDate },
      dayDelta,
    );
    void loadRange(nextRange.startDate, nextRange.endDate, nextRange.startDate);
  }

  function resetRange() {
    const range = createDefaultPlannerRange();
    const nextDate =
      todayKey >= range.startDate && todayKey <= range.endDate
        ? todayKey
        : range.startDate;
    void loadRange(range.startDate, range.endDate, nextDate);
  }

  async function handleLegacyProductDelete(entryId: string) {
    setDeletingProductId(entryId);
    setLegacyDeleteError(null);
    try {
      await deleteProductPlannerEntry(entryId);
      await loadPlanner();
    } catch (error) {
      if (
        error instanceof Error &&
        "status" in error &&
        (error as Error & { status: number }).status === 401
      ) {
        const next = new URLSearchParams(searchParams.toString());
        next.set("restore", "legacy-product-delete");
        next.set("productEntryId", entryId);
        router.replace(`/planner?${next.toString()}`);
        hasLoadedPlannerRef.current = false;
        setAuthState("unauthorized");
        return;
      }
      setLegacyDeleteError(
        error instanceof Error ? error.message : "완제품 계획을 삭제하지 못했어요.",
      );
      throw error;
    } finally {
      setDeletingProductId(null);
    }
  }

  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();
    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState(initialAuthenticated ? "authenticated" : "unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    if (!initialAuthenticated) {
      void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
        if (mounted) setAuthState(data.session ? "authenticated" : "unauthorized");
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (mounted) setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  useEffect(() => {
    if (
      authState !== "authenticated" ||
      activeSegment !== "plan" ||
      hasLoadedPlannerRef.current
    ) {
      return;
    }
    hasLoadedPlannerRef.current = true;

    const returnContext = readPlannerWeekReturnContext();
    if (returnContext) {
      clearPlannerWeekReturnContext();
      setSelectedDateKey(returnContext.selectedDate);
      void requestPlannerRange({
        endDate: returnContext.endDate,
        startDate: returnContext.startDate,
      });
      return;
    }

    const initialRange =
      initialLocation.date >= rangeStartDate && initialLocation.date <= rangeEndDate
        ? { endDate: rangeEndDate, startDate: rangeStartDate }
        : buildWeekRangeForDate(initialLocation.date);
    void requestPlannerRange(initialRange);
    // The first authenticated plan-panel entry owns the initial request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment, authState, requestPlannerRange]);

  useEffect(() => {
    const location = readPlannerShellLocation(searchParams, selectedDate);
    const pendingNavigation = pendingNavigationRef.current;
    if (pendingNavigation) {
      if (
        location.date !== pendingNavigation.date ||
        location.segment !== pendingNavigation.segment
      ) {
        return;
      }
      pendingNavigationRef.current = null;
    }

    if (location.segment !== activeSegment) {
      previousSegmentRef.current = activeSegment;
      setActiveSegment(location.segment);
    }
    if (location.date !== selectedDateKey) {
      setSelectedDateKey(location.date);
    }

    if (
      authState !== "authenticated" ||
      location.segment !== "plan" ||
      !hasLoadedPlannerRef.current ||
      (location.date >= rangeStartDate && location.date <= rangeEndDate)
    ) {
      return;
    }

    const nextRange = buildWeekRangeForDate(location.date);
    if (requestedRangeRef.current === getPlannerRangeKey(nextRange)) return;
    void requestPlannerRange(nextRange);
  }, [
    activeSegment,
    authState,
    rangeEndDate,
    rangeStartDate,
    requestPlannerRange,
    searchParams,
    selectedDate,
    selectedDateKey,
  ]);

  useLayoutEffect(() => {
    if (previousSegmentRef.current === activeSegment) return;
    const target = panelScrollPositions.current[activeSegment];
    previousSegmentRef.current = activeSegment;
    window.requestAnimationFrame(() => window.scrollTo({ top: target }));
  }, [activeSegment]);

  useLayoutEffect(() => {
    const rail = dateRailElement;
    const selectedButton = rail?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!rail || !selectedButton) return;

    const selectedItem = selectedButton.parentElement;
    const selectedLeft = selectedItem?.offsetLeft ?? selectedButton.offsetLeft;
    const selectedRight = selectedLeft
      + (selectedItem?.offsetWidth ?? selectedButton.offsetWidth);
    const visibleLeft = rail.scrollLeft;
    const visibleRight = visibleLeft + rail.clientWidth;

    if (selectedLeft < visibleLeft) {
      rail.scrollLeft = selectedLeft;
    } else if (selectedRight > visibleRight) {
      rail.scrollLeft = selectedRight - rail.clientWidth;
    }
  }, [dateKeys, dateRailElement, selectedDate]);

  if (authState === "checking") {
    return (
      <div
        aria-busy="true"
        className="min-h-screen bg-[var(--surface)]"
        data-testid="planner-auth-checking-shell"
      />
    );
  }

  if (authState === "unauthorized") {
    const query = searchParams.toString();
    const nextPath = query ? `/planner?${query}` : "/planner";

    return (
      <>
        <ContentState
          description="로그인 후 선택한 보기와 날짜로 돌아와 계획을 계속 관리할 수 있어요."
          eyebrow="플래너 접근"
          safeBottomPadding
          title="이 화면은 로그인이 필요해요"
          titleLevel={1}
          tone="gate"
        >
          <div className="space-y-3">
            <SocialLoginButtons nextPath={nextPath} />
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              href="/"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </ContentState>
        <div className="lg:hidden">
          <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" />
        </div>
      </>
    );
  }

  const segmentControl = (
    <PlannerSegmentTabs
      activeSegment={activeSegment}
      onSelect={handleSegmentSelect}
    />
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--surface-fill)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:pb-12">
      <div className="hidden lg:block">
        <WebTopNav
          activeId="planner"
          rightSlot={<ProfileSummaryButton autoLoad isAuthenticated variant="web" />}
        />
      </div>
      <div
        className="sticky top-0 z-30 border-b border-[var(--line-strong)] bg-[var(--surface)] lg:static"
        data-testid="planner-shell-header"
      >
        <div className="mx-auto flex min-h-[52px] max-w-5xl items-center justify-between px-[16px] lg:min-h-[64px]">
          <div>
            <p className="hidden text-xs font-bold text-[var(--brand)] lg:block">PLANNER</p>
            <h1 className="text-lg font-extrabold text-[var(--foreground)]">플래너</h1>
          </div>
          <div className="lg:hidden">
            <ProfileSummaryButton autoLoad isAuthenticated variant="mobile" />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-[16px] pb-[12px]">{segmentControl}</div>
      </div>

      {activeSegment === "log" ? (
        <MealLogUnavailableState />
      ) : (
        <div
          aria-labelledby="planner-plan-tab"
          className="mx-auto max-w-5xl px-[16px] py-4 lg:py-6"
          id="planner-plan-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <section
            aria-label="주간 이동"
            className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-[12px] lg:p-4"
            data-testid="planner-week-shell"
          >
            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-[8px]">
              <button
                aria-label="이전 주"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] text-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                onClick={() => shiftRange(-RANGE_SHIFT_DAYS)}
                type="button"
              >
                ‹
              </button>
              <div className="min-w-0 text-center">
                <p className="text-sm font-extrabold [word-break:keep-all] lg:text-base">
                  {formatRangeLabel(rangeStartDate, rangeEndDate)}
                </p>
                <button
                  className="mt-1 min-h-11 rounded-[var(--radius-control)] px-[12px] text-xs font-bold [word-break:keep-all] text-[var(--brand)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:text-[var(--text-3)]"
                  disabled={isCurrentRange}
                  onClick={resetRange}
                  type="button"
                >
                  이번 주
                </button>
              </div>
              <button
                aria-label="다음 주"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] text-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                onClick={() => shiftRange(RANGE_SHIFT_DAYS)}
                type="button"
              >
                ›
              </button>
            </div>

            <ol
              aria-label="주간 날짜"
              className="mt-2 flex snap-x snap-mandatory gap-[4px] overflow-x-auto overscroll-x-contain pb-1"
              data-testid="planner-week-date-rail"
              ref={setDateRailElement}
            >
              {dateKeys.map((dateKey) => {
                const selected = dateKey === selectedDate;
                return (
                  <li className="w-[44px] shrink-0 snap-start" key={dateKey}>
                    <button
                      aria-current={selected ? "date" : undefined}
                      aria-label={`${formatCompactDateLabel(dateKey)} ${formatWeekdayLabel(dateKey)} 선택`}
                      className={[
                        "flex min-h-[44px] w-[44px] flex-col items-center justify-center rounded-[var(--radius-control)] px-[2px] py-[4px] text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
                        selected
                          ? "bg-[var(--brand)] text-[var(--text-inverse)]"
                          : "text-[var(--text-2)]",
                      ].join(" ")}
                      onClick={() => handleDateSelect(dateKey)}
                      type="button"
                    >
                      <span className="text-[10px] font-semibold leading-none">
                        {formatWeekdayLabel(dateKey)}
                      </span>
                      <span className="mt-1 text-sm font-extrabold leading-none">
                        {dateKey.slice(8)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div
              aria-label="이틀 계획 개요"
              className="mt-3 grid grid-cols-2 gap-[8px]"
              data-testid="planner-two-day-overview"
            >
              {overviewDates.map((dateKey) => (
                <PlannerDayOverview
                  columns={columns}
                  dateKey={dateKey}
                  key={dateKey}
                  meals={meals}
                  selected={dateKey === selectedDate}
                />
              ))}
            </div>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-bold text-[var(--text-inverse)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
              href="/shopping/flow"
            >
              장보기
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
              href="/leftovers"
            >
              남은요리
            </Link>
          </div>

          <section
            aria-busy={isRefreshing}
            aria-labelledby="selected-planner-date-title"
            className="mt-4"
            data-testid="planner-week-body"
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-[var(--brand)]">선택한 날짜</p>
                <h2
                  className="mt-1 text-xl font-extrabold"
                  id="selected-planner-date-title"
                  ref={selectedDateTitleRef}
                  tabIndex={-1}
                >
                  {formatWeekdayLabel(selectedDate)} {formatDateLabel(selectedDate)}
                </h2>
              </div>
              <p className="text-xs text-[var(--text-2)]">
                등록 {mealStats.registered} · 장보기 완료 {mealStats.shoppingDone} · 요리 완료 {mealStats.cookDone}
              </p>
            </div>

            {screenState === "loading" ? (
              <PlannerLoadingState columnCount={columns.length} />
            ) : null}

            {screenState === "error" ? (
              <ContentState
                actionLabel="다시 시도"
                description={errorMessage ?? "잠시 후 다시 시도해 주세요."}
                onAction={retryPlannerLoad}
                tone="error"
                title="플래너를 불러오지 못했어요"
              />
            ) : null}

            {errorMessage && screenState !== "error" ? (
              <div
                className="mb-3 rounded-[var(--radius-control)] border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm"
                role="alert"
              >
                <p>{errorMessage}</p>
                <button
                  className="mt-2 min-h-11 font-bold text-[var(--brand)]"
                  onClick={retryPlannerLoad}
                  type="button"
                >
                  다시 시도
                </button>
              </div>
            ) : null}

            {screenState === "ready" ||
            screenState === "empty" ||
            screenState === "read-only" ? (
              <div className="space-y-3">
                {columns.length === 0 ? (
                  <p className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--text-2)]">
                    표시할 끼니 설정이 없어요.
                  </p>
                ) : null}
                {columns.map((column) => {
                  const columnMeals = mealsByColumn.get(column.id) ?? [];
                  return (
                    <article
                      aria-labelledby={`planner-column-${column.id}`}
                      className="min-w-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-[16px]"
                      key={column.id}
                    >
                      <h3
                        className="text-sm font-extrabold [overflow-wrap:anywhere] [word-break:keep-all]"
                        id={`planner-column-${column.id}`}
                      >
                        {column.name}
                      </h3>
                      {columnMeals.length === 0 ? (
                        <p className="mt-3 min-h-11 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-3 text-sm text-[var(--text-3)]">
                          비어 있음
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {columnMeals.map((meal) => (
                            <div
                              className={[
                                "min-w-0 rounded-[var(--radius-control)] border border-l-4 border-[var(--line-strong)] bg-[var(--surface-fill)] p-[12px]",
                                getStatusStyles(meal.status),
                              ].join(" ")}
                              data-testid={`planner-meal-${meal.id}`}
                              key={meal.id}
                            >
                              <div className="flex min-w-0 items-center gap-[12px]">
                                {meal.recipe_thumbnail_url ? (
                                  <Image
                                    alt=""
                                    className="h-11 w-11 shrink-0 rounded-[var(--radius-control)] object-cover"
                                    height={44}
                                    src={meal.recipe_thumbnail_url}
                                    unoptimized
                                    width={44}
                                  />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] font-bold text-[var(--brand)]"
                                  >
                                    {column.name.charAt(0)}
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <Link
                                    className="text-sm font-bold [overflow-wrap:anywhere] [word-break:keep-all] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                                    href={`/planner/${meal.plan_date}/${meal.column_id}?slot=${encodeURIComponent(column.name)}`}
                                    title={meal.recipe_title}
                                  >
                                    {meal.recipe_title}
                                  </Link>
                                  <p className="mt-1 text-xs [word-break:keep-all] text-[var(--text-2)]">
                                    {meal.planned_servings}인분 · {getStatusLabel(meal.status)}
                                    {meal.is_leftover ? " · 남은 요리" : ""}
                                  </p>
                                </div>
                              </div>
                              <PlannerMealActions column={column} meal={meal} />
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>

          <div className="mt-4">
            {legacyDeleteError ? (
              <p className="mb-3 text-sm text-[var(--danger)]" role="alert">
                {legacyDeleteError}
              </p>
            ) : null}
            <LegacyProductPlanSection
              entries={productEntries}
              fallbackFocusRef={selectedDateTitleRef}
              isDeleting={deletingProductId !== null}
              onDelete={handleLegacyProductDelete}
              onRestoreConsumed={handleRestoreConsumed}
              restoreDeleteEntryId={
                searchParams.get("restore") === "legacy-product-delete"
                  ? searchParams.get("productEntryId")
                  : null
              }
              selectedDate={selectedDate}
            />
          </div>
        </div>
      )}

      <div className="lg:hidden">
        <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" />
      </div>
    </div>
  );
}
