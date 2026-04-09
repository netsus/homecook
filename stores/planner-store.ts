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
  errorMessage: string | null;
  loadPlanner: () => Promise<void>;
  shiftRange: (dayDelta: number) => void;
  resetRange: () => void;
}

function buildInitialState() {
  const { endDate, startDate } = createDefaultPlannerRange();

  return {
    rangeStartDate: startDate,
    rangeEndDate: endDate,
    columns: [] as PlannerColumnData[],
    meals: [] as PlannerMealData[],
    screenState: "loading" as PlannerScreenState,
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
  loadPlanner: async () => {
    const { rangeEndDate, rangeStartDate } = get();

    set({
      errorMessage: null,
      screenState: "loading",
    });

    try {
      const data = await fetchPlanner(rangeStartDate, rangeEndDate);
      set({
        columns: data.columns,
        meals: data.meals,
        screenState: resolveNextScreenState(data.meals),
        errorMessage: null,
      });
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        throw error;
      }

      set({
        errorMessage: resolveErrorMessage(error),
        screenState: "error",
      });
    }
  },
  shiftRange: (dayDelta) => {
    const { rangeEndDate, rangeStartDate } = get();
    const nextRange = shiftPlannerRange(
      {
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      },
      dayDelta,
    );

    set({
      rangeStartDate: nextRange.startDate,
      rangeEndDate: nextRange.endDate,
    });
  },
  resetRange: () => {
    const { endDate, startDate } = createDefaultPlannerRange();

    set({
      rangeStartDate: startDate,
      rangeEndDate: endDate,
    });
  },
}));

export function resetPlannerStore() {
  usePlannerStore.setState(buildInitialState());
}
