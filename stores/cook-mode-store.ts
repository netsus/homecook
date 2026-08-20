import { create } from "zustand";

import {
  cancelCookingSession,
  completeCookingSession,
  fetchCookMode,
  isCookingApiError,
} from "@/lib/api/cooking";
import type {
  CookingSessionCookModeData,
} from "@/types/cooking";

export type CookModeScreenState =
  | "loading"
  | "ready"
  | "error"
  | "not_found"
  | "completing"
  | "cancelling"
  | "completed"
  | "cancelled";

interface CookModeStoreState {
  screenState: CookModeScreenState;
  sessionId: string | null;
  data: CookingSessionCookModeData | null;
  errorMessage: string | null;
  errorCode: string | null;
  completionAttempt: { key: string; payload: string } | null;
  loadCookMode: (sessionId: string) => Promise<void>;
  complete: (consumedIngredientIds: string[]) => Promise<void>;
  cancel: () => Promise<void>;
}

function buildInitialState() {
  return {
    screenState: "loading" as CookModeScreenState,
    sessionId: null as string | null,
    data: null as CookingSessionCookModeData | null,
    errorMessage: null as string | null,
    errorCode: null as string | null,
    completionAttempt: null as { key: string; payload: string } | null,
  };
}

export const useCookModeStore = create<CookModeStoreState>((set, get) => ({
  ...buildInitialState(),

  loadCookMode: async (sessionId: string) => {
    set({
      screenState: "loading",
      sessionId,
      errorMessage: null,
      errorCode: null,
      completionAttempt: null,
    });

    try {
      const data = await fetchCookMode(sessionId);
      set({ screenState: "ready", data });
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        throw error;
      }

      if (isCookingApiError(error) && error.status === 404) {
        set({
          screenState: "not_found",
          errorMessage: error.message,
          errorCode: error.code,
        });
        return;
      }

      set({
        screenState: "error",
        errorMessage:
          error instanceof Error ? error.message : "요리모드를 불러오지 못했어요.",
        errorCode: isCookingApiError(error) ? error.code : null,
      });
    }
  },

  complete: async (consumedIngredientIds: string[]) => {
    const { sessionId } = get();
    if (!sessionId) return;

    const payload = JSON.stringify({
      consumed_ingredient_ids: consumedIngredientIds,
    });
    const previousAttempt = get().completionAttempt;
    const completionAttempt = previousAttempt?.payload === payload
      ? previousAttempt
      : { key: crypto.randomUUID(), payload };

    set({ screenState: "completing", completionAttempt });

    try {
      await completeCookingSession(sessionId, {
        consumed_ingredient_ids: consumedIngredientIds,
      }, completionAttempt.key);
      set({ screenState: "completed", completionAttempt: null });
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        set({ screenState: "ready" });
        throw error;
      }

      if (isCookingApiError(error) && error.status === 409) {
        set({
          screenState: "error",
          errorMessage: error.message,
          errorCode: error.code,
        });
        return;
      }

      set({
        screenState: "error",
        errorMessage:
          error instanceof Error ? error.message : "요리 완료에 실패했어요.",
        errorCode: isCookingApiError(error) ? error.code : null,
      });
    }
  },

  cancel: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    set({ screenState: "cancelling" });

    try {
      await cancelCookingSession(sessionId);
      set({ screenState: "cancelled" });
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        set({ screenState: "ready" });
        throw error;
      }

      set({
        screenState: "error",
        errorMessage:
          error instanceof Error ? error.message : "요리 취소에 실패했어요.",
        errorCode: isCookingApiError(error) ? error.code : null,
      });
    }
  },
}));

export function resetCookModeStore() {
  useCookModeStore.setState(buildInitialState());
}
