"use client";

import { create } from "zustand";

import {
  createDefaultPlannerRange,
  fetchPlanner,
  isPlannerApiError,
  shiftPlannerRange,
} from "@/lib/api/planner";
import type { PlannerColumnData, PlannerMealData } from "@/types/planner";

export type PlannerScreenState =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "read-only";

interface PlannerStoreState {
  rangeStartDate: string;
  rangeEndDate: string;
  columns: PlannerColumnData[];
  meals: PlannerMealData[];
  screenState: PlannerScreenState;
  isRefreshing: boolean;
  errorMessage: string | null;
  loadPlanner: (rangeOverride?: { startDate: string; endDate: string }) => Promise<void>;
  shiftRange: (dayDelta: number) => Promise<void>;
  resetRange: () => Promise<void>;
}

function buildInitialState() {
  const { endDate, startDate } = createDefaultPlannerRange();

  return {
    rangeStartDate: startDate,
    rangeEndDate: endDate,
    columns: [] as PlannerColumnData[],
    meals: [] as PlannerMealData[],
    screenState: "loading" as PlannerScreenState,
    isRefreshing: false,
    errorMessage: null as string | null,
  };
}

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "요청을 처리하지 못했어요.";
}

function resolveNextScreenState(meals: PlannerMealData[]): PlannerScreenState {
  return meals.length > 0 ? "ready" : "empty";
}

export const usePlannerStore = create<PlannerStoreState>((set, get) => ({
  ...buildInitialState(),
  loadPlanner: async (rangeOverride) => {
    const {
      columns,
      meals,
      rangeEndDate,
      rangeStartDate,
      screenState,
    } = get();
    const requestedRange = rangeOverride ?? {
      endDate: rangeEndDate,
      startDate: rangeStartDate,
    };
    const hasVisibleContent =
      columns.length > 0 || meals.length > 0 || screenState === "empty";

    set({
      errorMessage: null,
      isRefreshing: hasVisibleContent,
      screenState: hasVisibleContent ? screenState : "loading",
    });

    try {
      const data = await fetchPlanner(requestedRange.startDate, requestedRange.endDate);
      set({
        columns: data.columns,
        meals: data.meals,
        rangeStartDate: requestedRange.startDate,
        rangeEndDate: requestedRange.endDate,
        screenState: resolveNextScreenState(data.meals),
        isRefreshing: false,
        errorMessage: null,
      });
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        set({ isRefreshing: false });
        throw error;
      }

      set({
        errorMessage: resolveErrorMessage(error),
        isRefreshing: false,
        screenState: hasVisibleContent ? screenState : "error",
      });
    }
  },
  shiftRange: async (dayDelta) => {
    const { rangeEndDate, rangeStartDate } = get();
    const nextRange = shiftPlannerRange(
      {
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      },
      dayDelta,
    );

    await get().loadPlanner(nextRange);
  },
  resetRange: async () => {
    const { endDate, startDate } = createDefaultPlannerRange();
    const { rangeEndDate, rangeStartDate } = get();

    if (rangeStartDate === startDate && rangeEndDate === endDate) {
      return;
    }

    await get().loadPlanner({
      startDate,
      endDate,
    });
  },
}));

export function resetPlannerStore() {
  usePlannerStore.setState(buildInitialState());
}
