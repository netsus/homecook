"use client";

import Link from "next/link";
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

import { PlannerLoginDialog } from "@/components/planner/planner-login-dialog";
import { createGuestPlannerData, createGuestPlannerNutrition } from "@/lib/planner/guest-planner-preview";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { PlannerWeekBoard } from "@/components/planner/planner-week-board";
import { PlannerWeekNavigation } from "@/components/planner/planner-week-navigation";
import {
  MealAddOptionsSheet,
  type MealAddPickerMode,
  type MealAddRouteMode,
} from "@/components/planner/meal-add-options-sheet";
import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { LegacyProductPlanSection } from "@/components/planner/legacy-product-plan-section";
import { MealLogScreen } from "@/components/planner/meal-log-screen";
import { ContentState } from "@/components/shared/content-state";
import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { Skeleton } from "@/components/ui/skeleton";
import { WebTopNav } from "@/components/web";
import { YoutubeExtractionNotificationTrigger } from "@/components/youtube-extraction/youtube-extraction-notification-center";
import { deleteProductPlannerEntry } from "@/lib/api/product-planner-entry";
import {
  createDefaultPlannerRange,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  formatKoreaCompactDate,
} from "@/lib/korean-date";
import {
  buildPlannerShellHref,
  readPlannerShellLocation,
  type PlannerShellSegment,
} from "@/lib/planner/planner-shell-navigation";
import {
  clearPlannerWeekReturnContext,
  readPlannerWeekReturnContext,
  savePlannerWeekReturnContext,
} from "@/lib/planner/planner-week-return-context";
import { buildPlannerMealStatusStats } from "@/lib/planner-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { resetPlannerStore, usePlannerStore } from "@/stores/planner-store";
import type { PlannerColumnData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";

type PendingShellNavigation = {
  generation: number;
  href: string;
  location: {
    date: string;
    segment: PlannerShellSegment;
  };
  method: "push" | "replace";
};

export interface PlannerWeekScreenProps {
  initialAuthenticated?: boolean;
  initialMealNutrition?: PlannerMealNutritionViewMap;
}

type MealAddTarget = { dateKey: string; columnId: string; slotName: string };

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

function formatCompactDateLabel(dateKey: string) {
  return formatKoreaCompactDate(dateKey);
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
  initialMealNutrition = {},
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

  const storedRangeStartDate = usePlannerStore((state) => state.rangeStartDate);
  const storedRangeEndDate = usePlannerStore((state) => state.rangeEndDate);
  const storedColumns = usePlannerStore((state) => state.columns);
  const storedMeals = usePlannerStore((state) => state.meals);
  const storedProductEntries = usePlannerStore((state) => state.productEntries);
  const storedScreenState = usePlannerStore((state) => state.screenState);
  const storedIsRefreshing = usePlannerStore((state) => state.isRefreshing);
  const storedErrorMessage = usePlannerStore((state) => state.errorMessage);
  const loadPlanner = usePlannerStore((state) => state.loadPlanner);

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const guest = authState !== "authenticated";
  const [guestRange, setGuestRange] = useState(() => buildWeekRangeForDate(initialLocation.date));
  const [loginNextPath, setLoginNextPath] = useState<string | null>(null);
  const rangeStartDate = guest ? guestRange.startDate : storedRangeStartDate;
  const rangeEndDate = guest ? guestRange.endDate : storedRangeEndDate;
  const guestExampleDate = initialLocation.date >= rangeStartDate && initialLocation.date <= rangeEndDate
    ? initialLocation.date : rangeStartDate;
  const guestData = useMemo(() => createGuestPlannerData(guestExampleDate), [guestExampleDate]);
  const columns = guest ? guestData.columns : storedColumns;
  const meals = guest ? guestData.meals : storedMeals;
  const productEntries = guest ? guestData.product_entries : storedProductEntries;
  const screenState = guest ? "ready" : storedScreenState;
  const isRefreshing = guest ? false : storedIsRefreshing;
  const errorMessage = guest ? null : storedErrorMessage;
  const displayedNutrition = guest ? createGuestPlannerNutrition() : initialMealNutrition;
  const [activeSegment, setActiveSegment] =
    useState<PlannerShellSegment>(initialLocation.segment);
  const [selectedDateKey, setSelectedDateKey] = useState(initialLocation.date);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const panelScrollPositions = useRef<Record<PlannerShellSegment, number>>({
    log: 0,
    plan: 0,
  });
  const [mealAddTarget, setMealAddTarget] = useState<MealAddTarget | null>(null);
  const [mealAddMode, setMealAddMode] = useState<MealAddPickerMode | null>(null);
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});
  const logDayRefs = useRef<Record<string, HTMLElement | null>>({});
  const [logReadyWeek, setLogReadyWeek] = useState<string | null>(null);
  const onLogDaysReady = useCallback((week: string) => setLogReadyWeek(week), []);
  const allowScrollDateSyncRef = useRef(false);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const dateAnchorRef = useRef<HTMLDivElement>(null);
  const pendingSegmentDateTopRef = useRef<number | null>(null);
  const pendingDateScrollRef = useRef<string | null>(null);
  const [stickyHeight, setStickyHeight] = useState(70);
  const mealAddBoundaryRef = useRef<HTMLDivElement>(null);
  const restoredAddRef = useRef<string | null>(null);
  const previousSegmentRef = useRef(activeSegment);
  const hasLoadedPlannerRef = useRef(false);
  const navigationGenerationRef = useRef(0);
  const pendingNavigationRef = useRef<PendingShellNavigation | null>(null);
  const latestNavigationRef = useRef<PendingShellNavigation | null>(null);
  const requestedRangeRef = useRef<string | null>(null);
  const selectedDateTitleRef = useRef<HTMLHeadingElement | null>(null);
  const positionedSegmentsRef = useRef<Record<PlannerShellSegment, boolean>>({ plan: false, log: false });
  const currentLogLocationRef = useRef({ date: selectedDateKey, query: searchParams.toString() });
  currentLogLocationRef.current = { date: selectedDateKey, query: searchParams.toString() };
  useEffect(() => {
    if (!guest) return;
    hasLoadedPlannerRef.current = false;
    requestedRangeRef.current = null;
    resetPlannerStore();
  }, [guest]);

  const handleMealLogUnauthorized = useCallback(() => {
    setAuthState("unauthorized");
    const location = currentLogLocationRef.current;
    setLoginNextPath(buildPlannerShellHref(new URLSearchParams(location.query), {
      date: location.date,
      segment: "log",
    }));
  }, []);

  const dateKeys = useMemo(
    () => buildDateKeys(rangeStartDate, rangeEndDate),
    [rangeEndDate, rangeStartDate],
  );
  const selectedDate = activeSegment === "log"
    ? selectedDateKey
    : dateKeys.includes(selectedDateKey)
    ? selectedDateKey
    : dateKeys[0] ?? selectedDateKey;
  const selectedWeekStart = buildWeekRangeForDate(selectedDateKey).startDate;
  useEffect(() => {
    const ready = activeSegment === "plan"
      ? ["ready", "empty", "read-only"].includes(screenState) && columns.length > 0
      : logReadyWeek === selectedWeekStart;
    if (positionedSegmentsRef.current[activeSegment] || authState === "checking" || !ready) return;
    const frame = requestAnimationFrame(() => {
      const target = (activeSegment === "plan" ? dayRefs : logDayRefs).current[selectedDateKey];
      if (!target) return;
      positionedSegmentsRef.current[activeSegment] = true;
      allowScrollDateSyncRef.current = false;
      const desktop = window.matchMedia?.("(min-width: 1024px)").matches;
      target.scrollIntoView?.({ behavior: "auto", block: desktop ? "nearest" : "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSegment, authState, columns.length, screenState, selectedDateKey, selectedWeekStart, logReadyWeek]);

  useEffect(() => {
    const target = pendingDateScrollRef.current;
    if (!target || (activeSegment === "plan" ? !dateKeys.includes(target) : logReadyWeek !== selectedWeekStart)) return;
    const frame = requestAnimationFrame(() => {
      const day = (activeSegment === "plan" ? dayRefs : logDayRefs).current[target];
      if (!day) return;
      pendingDateScrollRef.current = null;
      allowScrollDateSyncRef.current = false;
      day.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSegment, dateKeys, meals, logReadyWeek, selectedWeekStart]);
  const mealStats = useMemo(() => buildPlannerMealStatusStats(meals), [meals]);
  const shoppingLists = useMemo(
    () => [
      ...new Map(
        meals
          .filter((meal) => meal.shopping_list_id)
          .map((meal) => [
            meal.shopping_list_id!,
            {
              id: meal.shopping_list_id!,
              title: meal.shopping_list_title || "장보기 목록",
            },
          ]),
      ).values(),
    ],
    [meals],
  );
  const canAddMeal =
    !isRefreshing &&
    !errorMessage &&
    (screenState === "ready" || screenState === "empty");
  const defaultRange = createDefaultPlannerRange();
  const navigationRange = buildWeekRangeForDate(selectedDateKey);
  const isCurrentRange = navigationRange.startDate === defaultRange.startDate;

  const navigateShell = useCallback(
    (
      location: { date: string; segment: PlannerShellSegment },
      method: "push" | "replace" = "push",
    ) => {
      const currentLocation = readPlannerShellLocation(searchParams, selectedDate);
      const pendingNavigation = pendingNavigationRef.current;
      const latestNavigation = latestNavigationRef.current;
      if (
        !pendingNavigation &&
        currentLocation.date === location.date &&
        currentLocation.segment === location.segment
      ) {
        return;
      }
      if (
        pendingNavigation &&
        latestNavigation?.location.date === location.date &&
        latestNavigation.location.segment === location.segment
      ) {
        return;
      }
      const href = buildPlannerShellHref(
        new URLSearchParams(searchParams.toString()),
        location,
      );
      const navigation = {
        generation: ++navigationGenerationRef.current,
        href,
        location,
        method,
      } satisfies PendingShellNavigation;
      latestNavigationRef.current = navigation;
      if (pendingNavigation) return;
      pendingNavigationRef.current = navigation;
      router[method](href, { scroll: false });
    },
    [router, searchParams, selectedDate],
  );
  useEffect(() => {
    let frame = 0;
    const allow = () => { allowScrollDateSyncRef.current = true; };
    const stop = () => { allowScrollDateSyncRef.current = false; };
    const update = () => {
      frame = 0;
      if (!allowScrollDateSyncRef.current || document.body.style.overflow === "hidden" || (activeSegment === "plan" && isRefreshing)) return;
      const refs = (activeSegment === "plan" ? dayRefs : logDayRefs).current;
      const week = buildWeekRangeForDate(selectedDateKey);
      const candidates = buildDateKeys(week.startDate, week.endDate).flatMap(date => {
        const node = refs[date];
        if (!node?.isConnected) return [];
        const rect = node.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight - 80) - Math.max(rect.top, stickyHeight));
        return [{ date, visible }];
      });
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const target = atBottom ? candidates.at(-1)?.date : candidates.sort((a, b) => b.visible - a.visible)[0]?.date;
      if (!target || target === selectedDateKey || !candidates.some(item => item.visible > 0)) return;
      setSelectedDateKey(target);
      navigateShell({ date: target, segment: activeSegment }, "replace");
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("wheel", allow, { passive: true });
    window.addEventListener("touchmove", allow, { passive: true });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("popstate", stop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", allow);
      window.removeEventListener("touchmove", allow);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("popstate", stop);
    };
  }, [activeSegment, isRefreshing, navigateShell, selectedDateKey, stickyHeight]);

  const handleRestoreConsumed = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("restore");
    next.delete("productEntryId");
    const query = next.toString();
    router.replace(query ? `/planner?${query}` : "/planner");
  }, [router, searchParams]);
  const requestPlannerRange = useCallback(
    async (range: { endDate: string; startDate: string }) => {
      if (guest) { setGuestRange(range); return; }
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
    [guest, loadPlanner],
  );

  function handleSegmentSelect(segment: PlannerShellSegment) {
    if (segment === activeSegment) return;
    pendingDateScrollRef.current = null;
    allowScrollDateSyncRef.current = false;
    if (segment === "log") setLogReadyWeek(null);
    pendingSegmentDateTopRef.current = stickyHeaderRef.current?.getBoundingClientRect().top ?? null;
    panelScrollPositions.current[activeSegment] = window.scrollY;
    previousSegmentRef.current = activeSegment;
    setActiveSegment(segment);
    navigateShell({ date: selectedDateKey, segment });
  }

  function handleDateSelect(dateKey: string) {
    allowScrollDateSyncRef.current = false;
    pendingDateScrollRef.current = null;
    if (activeSegment === "log" && buildWeekRangeForDate(dateKey).startDate !== selectedWeekStart) {
      setLogReadyWeek(null);
      pendingDateScrollRef.current = dateKey;
    }
    if (activeSegment === "plan" && (dateKey < rangeStartDate || dateKey > rangeEndDate)) {
      const range = buildWeekRangeForDate(dateKey);
      pendingDateScrollRef.current = dateKey;
      void loadRange(range.startDate, range.endDate, dateKey);
      return;
    }
    if (dateKey !== selectedDate) {
      setSelectedDateKey(dateKey);
      navigateShell({ date: dateKey, segment: activeSegment });
    }
    if (!pendingDateScrollRef.current) {
      (activeSegment === "plan" ? dayRefs : logDayRefs).current[dateKey]?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function closeMealAdd() {
    clearPlannerWeekReturnContext();
    setMealAddTarget(null);
    setMealAddMode(null);
    if (searchParams.get("restore") === "meal-add-modal") {
      const next = new URLSearchParams(searchParams.toString());
      for (const key of ["restore", "returnSurface", "columnId", "slot", "source"]) {
        next.delete(key);
      }
      router.replace(`/planner?${next.toString()}`);
    }
  }

  const { setReturnFocusTarget: setAddReturnFocus } = useDialogBoundary({
    active:
      mealAddTarget !== null &&
      activeSegment === "plan" &&
      canAddMeal &&
      authState === "authenticated",
    dialogRef: mealAddBoundaryRef,
    fallbackFocusRef: selectedDateTitleRef,
    onClose: closeMealAdd,
  });

  function openMealAdd(dateKey: string, column: PlannerColumnData) {
    if (guest) {
      const next = new URLSearchParams({ date: dateKey, slot: column.name, restore: "meal-add-modal" });
      setLoginNextPath(`/planner?${next.toString()}`);
      return;
    }
    if (!canAddMeal) return;
    const invoker = document.activeElement;
    if (invoker instanceof HTMLElement) setAddReturnFocus(() => invoker);
    setMealAddTarget({ dateKey, columnId: column.id, slotName: column.name });
    setMealAddMode(null);
  }

  function saveMealAddReturn() {
    if (!mealAddTarget) return;
    savePlannerWeekReturnContext({
      version: 1,
      startDate: rangeStartDate,
      endDate: rangeEndDate,
      selectedDate: mealAddTarget.dateKey,
      columnId: mealAddTarget.columnId,
      slotName: mealAddTarget.slotName,
    });
  }

  function mealAddRoute(mode: MealAddRouteMode) {
    if (!mealAddTarget || mode === "product") return "/planner";
    const query = new URLSearchParams({
      date: mealAddTarget.dateKey,
      columnId: mealAddTarget.columnId,
      slot: mealAddTarget.slotName,
    });
    return buildReturnHref(`/menu/add/${mode}?${query.toString()}`, {
      returnTo: `/planner?${query.toString()}`,
      returnSurface: "planner.meal-add-modal",
      restore: "meal-add-modal",
    });
  }

  function completeMealAdd() {
    const target = mealAddTarget;
    saveMealAddReturn();
    setMealAddTarget(null);
    setMealAddMode(null);
    if (target) {
      router.push(
        `/planner/${target.dateKey}/${target.columnId}?slot=${encodeURIComponent(target.slotName)}`,
      );
    }
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
    allowScrollDateSyncRef.current = false;
    pendingDateScrollRef.current = null;
    if (activeSegment === "log") {
      const next = new Date(`${selectedDateKey}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + dayDelta);
      handleDateSelect(next.toISOString().slice(0, 10));
      return;
    }
    const range = shiftPlannerRange({ startDate: rangeStartDate, endDate: rangeEndDate }, dayDelta);
    return loadRange(range.startDate, range.endDate, range.startDate);
  }

  function resetRange() {
    if (activeSegment === "log") { handleDateSelect(todayKey); return; }
    const range = createDefaultPlannerRange();
    void loadRange(range.startDate, range.endDate, todayKey);
  }

  async function handleLegacyProductDelete(entryId: string) {
    setDeletingProductId(entryId);
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
        location.date !== pendingNavigation.location.date ||
        location.segment !== pendingNavigation.location.segment
      ) {
        return;
      }
      pendingNavigationRef.current = null;
      const latestNavigation = latestNavigationRef.current;
      if (
        latestNavigation &&
        latestNavigation.generation > pendingNavigation.generation
      ) {
        pendingNavigationRef.current = latestNavigation;
        router[latestNavigation.method](latestNavigation.href, { scroll: false });
        return;
      }
      latestNavigationRef.current = null;
    }

    if (location.segment !== activeSegment) {
      previousSegmentRef.current = activeSegment;
      setActiveSegment(location.segment);
    }
    if (location.date !== selectedDateKey) {
      setSelectedDateKey(location.date);
    }

    if (guest && location.segment === "plan" && (location.date < rangeStartDate || location.date > rangeEndDate)) {
      setGuestRange(buildWeekRangeForDate(location.date));
      return;
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
    router,
    guest,
    searchParams,
    selectedDate,
    selectedDateKey,
  ]);

  useLayoutEffect(() => {
    if (previousSegmentRef.current === activeSegment) return;
    const previousDateTop = pendingSegmentDateTopRef.current;
    pendingSegmentDateTopRef.current = null;
    previousSegmentRef.current = activeSegment;
    allowScrollDateSyncRef.current = false;
    if (!positionedSegmentsRef.current[activeSegment]) return;
    const frame = requestAnimationFrame(() => {
      const anchor = dateAnchorRef.current;
      const naturalTop = anchor ? anchor.getBoundingClientRect().top + window.scrollY : 0;
      const mobile = !window.matchMedia?.("(min-width: 1024px)").matches;
      const saved = panelScrollPositions.current[activeSegment];
      const top = previousDateTop === null ? saved
        : mobile && previousDateTop <= 1 ? Math.max(saved, naturalTop)
        : Math.max(0, naturalTop - previousDateTop);
      window.scrollTo({ top, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSegment]);

  useLayoutEffect(() => {
    const header = stickyHeaderRef.current;
    if (!header) { setStickyHeight(0); return; }
    const measure = () => {
      const desktop = window.matchMedia?.("(min-width: 1024px)").matches;
      setStickyHeight(desktop ? 0 : header.getBoundingClientRect().height);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    return () => observer?.disconnect();
  }, [activeSegment, authState]);


  useEffect(() => {
    if (authState === "authenticated" && activeSegment === "plan" && canAddMeal) return;
    if (mealAddTarget) clearPlannerWeekReturnContext();
    setMealAddTarget(null);
    setMealAddMode(null);
  }, [activeSegment, authState, canAddMeal, mealAddTarget]);

  useLayoutEffect(() => {
    if (!mealAddTarget || !canAddMeal || activeSegment !== "plan") return;
    mealAddBoundaryRef.current
      ?.querySelector<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      )
      ?.focus();
  }, [activeSegment, canAddMeal, mealAddMode, mealAddTarget]);

  useEffect(() => {
    if (authState !== "authenticated" || !canAddMeal || activeSegment !== "plan") return;
    if (searchParams.get("restore") !== "meal-add-modal") return;
    const date = searchParams.get("date");
    const column = columns.find((item) => item.id === searchParams.get("columnId"))
      ?? columns.find((item) => !searchParams.get("columnId") && item.name === searchParams.get("slot"));
    const key = searchParams.toString();
    if (
      !date ||
      !dateKeys.includes(date) ||
      !column ||
      restoredAddRef.current === key
    ) {
      return;
    }
    restoredAddRef.current = key;
    setMealAddTarget({ dateKey: date, columnId: column.id, slotName: column.name });
    setMealAddMode(null);
  }, [activeSegment, authState, canAddMeal, columns, dateKeys, searchParams]);

  const loginControl = <button className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--brand-contrast)]" onClick={() => setLoginNextPath(buildPlannerShellHref(new URLSearchParams(searchParams.toString()), { date: selectedDate, segment: activeSegment }))} type="button">로그인</button>;

  return (
    <div
      className="min-h-screen overflow-x-clip bg-[var(--surface-fill)] pb-[calc(72px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:pb-12"
      style={{ "--planner-sticky-height": `${stickyHeight}px` } as React.CSSProperties}
    >
      <div className="hidden lg:block">
        <WebTopNav
          activeId="planner"
          className="web-topnav-flow"
          plannerDate={selectedDateKey}
          plannerSegment={activeSegment}
          onPlannerSegmentSelect={handleSegmentSelect}
          rightSlot={guest ? loginControl : <ProfileSummaryButton autoLoad isAuthenticated variant="web" />}
        />
      </div>
      <div className="mx-auto max-w-7xl px-4 pt-3" data-testid="planner-shell-header">
        <div className="flex min-h-11 items-center justify-between lg:sr-only"><h1 id={`planner-${activeSegment}-tab`} className="text-xl font-extrabold">{activeSegment === "plan" ? "요리 계획" : "식사 기록"}</h1><div className="lg:hidden"><YoutubeExtractionNotificationTrigger /></div></div>
        {guest ? <p className="pt-2 text-[11px] text-[var(--text-2)]"><span className="font-bold text-sky-700">예시 플래너</span> · 로그인하면 내 기록을 남길 수 있어요.</p> : null}
      </div>
        <PlannerWeekNavigation
          mode={activeSegment}
          startDate={navigationRange.startDate}
          endDate={navigationRange.endDate}
          selectedDate={selectedDateKey}
          today={todayKey}
          isCurrentWeek={isCurrentRange}
          onDateSelect={handleDateSelect}
          onShiftWeek={shiftRange}
          onCurrentWeek={resetRange}
          dateBarRef={stickyHeaderRef}
          dateAnchorRef={dateAnchorRef}
          actions={activeSegment === "plan" ? <div className="ml-auto flex items-center gap-1">
            <Link className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-sky-200 bg-white px-2 text-[11px] sm:px-3 sm:text-xs font-bold text-sky-700 hover:bg-sky-100" href="/shopping/flow">장보기 <span aria-hidden="true" className="hidden sm:inline">↗</span></Link>
            <Link className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-[11px] sm:px-3 sm:text-xs font-bold text-[var(--text-2)] hover:bg-white" href="/leftovers">남은요리 <span aria-hidden="true" className="hidden sm:inline">↗</span></Link>
          </div> : null}
        />

      {activeSegment === "log" ? (
        <MealLogScreen
          guest={guest}
          showDateNavigation={false}
          onDayRef={(date, node) => { logDayRefs.current[date] = node; }}
          onDaysReady={onLogDaysReady}
          onFoodLoginRequired={(date = selectedDateKey) => { allowScrollDateSyncRef.current = false; router.push(`/login?next=${encodeURIComponent(buildPlannerShellHref(new URLSearchParams(), { date, segment: "log" }))}`); }}
          onLoginRequired={(date = selectedDateKey) => { allowScrollDateSyncRef.current = false; setLoginNextPath(buildPlannerShellHref(new URLSearchParams(searchParams.toString()), { date, segment: "log" })); }}
          date={selectedDate}
          onDateChange={handleDateSelect}
          onUnauthorized={handleMealLogUnauthorized}
        />
      ) : (
        <div
          aria-labelledby="planner-plan-tab"
          className="mx-auto max-w-7xl px-4 py-3 lg:py-4"
          id="planner-plan-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <div aria-label="이번 주 요약" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-2)]">
            <span className="hidden font-bold text-[var(--foreground)] sm:inline">이번 주 요약</span>
            {[
              ["등록", mealStats.registered, "var(--planner-status-registered)"],
              ["장보기 완료", mealStats.shoppingDone, "var(--planner-status-shopping)"],
              ["요리 완료", mealStats.cookDone, "var(--planner-status-cooked)"],
            ].map(([label, count, color]) => <span className="inline-flex items-center gap-1.5" key={label}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: String(color) }} />{label} <strong className="text-[var(--foreground)]">{count}</strong></span>)}
          </div>
          {shoppingLists.length ? (
            <Link
              className="mb-4 flex min-h-11 items-center justify-between rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-bold"
              href={buildReturnHref("/mypage", {
                returnTo: buildPlannerShellHref(new URLSearchParams(), {
                  date: selectedDate,
                  segment: "plan",
                }),
                returnSurface: "planner.week",
                restore: "shopping-history-tab",
              })}
              onClick={() =>
                savePlannerWeekReturnContext({
                  version: 1,
                  startDate: rangeStartDate,
                  endDate: rangeEndDate,
                  selectedDate,
                  columnId: null,
                  slotName: null,
                })
              }
            >
              <span>이번 주 장보기 기록 {shoppingLists.length}개</span>
              <span>캘린더 보기</span>
            </Link>
          ) : null}
          {shoppingLists.length ? <ul aria-label="장보기 기록" className="mb-3 flex flex-wrap gap-x-4 gap-y-1">{shoppingLists.map((list) => <li key={list.id}><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-sky-700" href={`/shopping/lists/${list.id}`}>{list.title}</Link></li>)}</ul> : null}
          <div className="min-w-0">
            <section
              aria-busy={isRefreshing}
              aria-label="주간 플래너 본문"
              className="min-w-0"
              data-testid="planner-week-body"
            >
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
                <div role="alert" className="mb-3 rounded-[var(--radius-control)] border border-[var(--danger)] p-3 text-sm">
                  <p>{errorMessage}</p>
                  <button
                    className="min-h-11 font-bold text-[var(--brand-contrast)]"
                    onClick={retryPlannerLoad}
                    type="button"
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}
              {screenState === "ready" || screenState === "empty" || screenState === "read-only" ? (
                <PlannerWeekBoard
                  dateKeys={dateKeys}
                  columns={columns}
                  meals={meals}
                  nutritionByMeal={displayedNutrition}
                  onMealOpen={guest ? () => setLoginNextPath(buildPlannerShellHref(new URLSearchParams(), { date: selectedDate, segment: "plan" })) : undefined}
                  selectedDate={selectedDate}
                  today={todayKey}
                  disabled={!canAddMeal}
                  onAdd={openMealAdd}
                  onDayRef={(date, element) => {
                    dayRefs.current[date] = element;
                    if (date === selectedDate) {
                      selectedDateTitleRef.current = element?.querySelector("h2") ?? null;
                    }
                  }}
                />
              ) : null}
              <div className="mt-4 empty:hidden">
                {!guest ? <LegacyProductPlanSection
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
                /> : null}
              </div>
            </section>

          </div>
        </div>
      )}
      {loginNextPath ? <PlannerLoginDialog nextPath={loginNextPath} onClose={() => setLoginNextPath(null)} /> : null}
      {mealAddTarget && !guest && activeSegment === "plan" && canAddMeal ? (
        <div ref={mealAddBoundaryRef}>
          {mealAddMode ? (
            <MealAddPickerFlow
              columnId={mealAddTarget.columnId}
              entryMode={mealAddMode}
              key={`${mealAddTarget.dateKey}:${mealAddTarget.columnId}:${mealAddMode}`}
              onClose={() => setMealAddMode(null)}
              onComplete={completeMealAdd}
              planDate={mealAddTarget.dateKey}
              slotName={mealAddTarget.slotName}
            />
          ) : (
            <MealAddOptionsSheet
              title="식사 추가"
              targetLabel={`${formatCompactDateLabel(mealAddTarget.dateKey)} ${mealAddTarget.slotName}`}
              onClose={closeMealAdd}
              onPickerSelect={setMealAddMode}
              routeHrefFor={mealAddRoute}
              onRouteSelect={saveMealAddReturn}
              showProductOption={false}
              testId="planner-meal-add-options-sheet"
            />
          )}
        </div>
      ) : null}
      <div className="lg:hidden">
        <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab={activeSegment === "log" ? "meal-log" : "planner"} plannerDate={selectedDateKey} onTabClick={(tab, event) => {
          if ((tab === "planner" || tab === "meal-log") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            event.preventDefault(); handleSegmentSelect(tab === "meal-log" ? "log" : "plan");
          }
        }} />
      </div>
    </div>
  );
}
