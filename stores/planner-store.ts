"use client";

import { create } from "zustand";

import {
  createDefaultPlannerRange,
  createPlannerColumn,
  deletePlannerColumn,
  fetchPlanner,
  isPlannerApiError,
  shiftPlannerRange,
  updatePlannerColumn,
} from "@/lib/api/planner";
import type {
  PlannerColumnData,
  PlannerColumnUpdateBody,
  PlannerMealData,
} from "@/types/planner";

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
  feedbackMessage: string | null;
  isMutating: boolean;
  loadPlanner: () => Promise<void>;
  shiftRange: (dayDelta: number) => void;
  clearFeedback: () => void;
  addColumn: (name: string) => Promise<void>;
  renameColumn: (columnId: string, name: string) => Promise<void>;
  reorderColumn: (columnId: string, sortOrder: number) => Promise<void>;
  removeColumn: (columnId: string) => Promise<void>;
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
    feedbackMessage: null as string | null,
    isMutating: false,
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

async function readPlannerData(rangeStartDate: string, rangeEndDate: string) {
  const data = await fetchPlanner(rangeStartDate, rangeEndDate);

  return {
    columns: data.columns,
    meals: data.meals,
    screenState: resolveNextScreenState(data.meals),
  };
}

export const usePlannerStore = create<PlannerStoreState>((set, get) => ({
  ...buildInitialState(),
  loadPlanner: async () => {
    const { rangeEndDate, rangeStartDate } = get();

    set({
      errorMessage: null,
      feedbackMessage: null,
      screenState: "loading",
    });

    try {
      const nextState = await readPlannerData(rangeStartDate, rangeEndDate);
      set({
        ...nextState,
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
  clearFeedback: () => {
    set({ feedbackMessage: null });
  },
  addColumn: async (name) => {
    const normalizedName = name.trim();

    if (!normalizedName) {
      set({ feedbackMessage: "컬럼 이름을 입력해주세요." });
      return;
    }

    set({
      isMutating: true,
      feedbackMessage: null,
    });

    try {
      await createPlannerColumn({ name: normalizedName });

      const { rangeEndDate, rangeStartDate } = get();
      const nextState = await readPlannerData(rangeStartDate, rangeEndDate);

      set({
        ...nextState,
        isMutating: false,
      });
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        set({ isMutating: false });
        throw error;
      }

      set({
        feedbackMessage: resolveErrorMessage(error),
        isMutating: false,
      });
    }
  },
  renameColumn: async (columnId, name) => {
    const normalizedName = name.trim();

    if (!normalizedName) {
      set({ feedbackMessage: "컬럼 이름을 입력해주세요." });
      return;
    }

    set({
      isMutating: true,
      feedbackMessage: null,
    });

    try {
      await updatePlannerColumn(columnId, { name: normalizedName });

      set((state) => ({
        columns: state.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                name: normalizedName,
              }
            : column,
        ),
        isMutating: false,
      }));
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        set({ isMutating: false });
        throw error;
      }

      set({
        feedbackMessage: resolveErrorMessage(error),
        isMutating: false,
      });
    }
  },
  reorderColumn: async (columnId, sortOrder) => {
    set({
      isMutating: true,
      feedbackMessage: null,
    });

    try {
      await updatePlannerColumn(columnId, { sort_order: sortOrder });

      const { rangeEndDate, rangeStartDate } = get();
      const nextState = await readPlannerData(rangeStartDate, rangeEndDate);

      set({
        ...nextState,
        isMutating: false,
      });
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        set({ isMutating: false });
        throw error;
      }

      set({
        feedbackMessage: resolveErrorMessage(error),
        isMutating: false,
      });
    }
  },
  removeColumn: async (columnId) => {
    set({
      isMutating: true,
      feedbackMessage: null,
    });

    try {
      await deletePlannerColumn(columnId);

      const { rangeEndDate, rangeStartDate } = get();
      const nextState = await readPlannerData(rangeStartDate, rangeEndDate);

      set({
        ...nextState,
        isMutating: false,
      });
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        set({ isMutating: false });
        throw error;
      }

      set({
        feedbackMessage: resolveErrorMessage(error),
        isMutating: false,
      });
    }
  },
}));

export function resetPlannerStore() {
  usePlannerStore.setState(buildInitialState());
}

export function getPlannerColumnBySort(
  columns: PlannerColumnData[],
  targetSortOrder: number,
) {
  return columns.find((column) => column.sort_order === targetSortOrder) ?? null;
}

export function buildPlannerColumnUpdatePayload(
  payload: PlannerColumnUpdateBody,
) {
  const nextPayload: PlannerColumnUpdateBody = {};

  if (typeof payload.name === "string") {
    nextPayload.name = payload.name;
  }

  if (typeof payload.sort_order === "number") {
    nextPayload.sort_order = payload.sort_order;
  }

  return nextPayload;
}
