import { create } from "zustand";

import {
  completeStandaloneCooking,
  fetchStandaloneCookMode,
  isCookingApiError,
} from "@/lib/api/cooking";
import type { CookingStandaloneCookModeData } from "@/types/cooking";

export type StandaloneCookModeScreenState =
  | "loading"
  | "ready"
  | "error"
  | "not_found"
  | "completing"
  | "completed";

interface StandaloneCookModeStoreState {
  screenState: StandaloneCookModeScreenState;
  recipeId: string | null;
  servings: number;
  data: CookingStandaloneCookModeData | null;
  errorMessage: string | null;
  errorCode: string | null;
  completionAttempt: { key: string; payload: string } | null;
  loadStandaloneCookMode: (recipeId: string, servings: number) => Promise<void>;
  complete: (consumedIngredientIds: string[]) => Promise<void>;
}

function buildInitialState() {
  return {
    screenState: "loading" as StandaloneCookModeScreenState,
    recipeId: null as string | null,
    servings: 1,
    data: null as CookingStandaloneCookModeData | null,
    errorMessage: null as string | null,
    errorCode: null as string | null,
    completionAttempt: null as { key: string; payload: string } | null,
  };
}

export const useStandaloneCookModeStore = create<StandaloneCookModeStoreState>(
  (set, get) => ({
    ...buildInitialState(),

    loadStandaloneCookMode: async (recipeId: string, servings: number) => {
      const current = get();
      set({
        screenState: "loading",
        recipeId,
        servings,
        errorMessage: null,
        errorCode: null,
        completionAttempt:
          current.recipeId === recipeId && current.servings === servings
            ? current.completionAttempt
            : null,
      });

      try {
        const data = await fetchStandaloneCookMode(recipeId, servings);
        set({ screenState: "ready", data });
      } catch (error) {
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
            error instanceof Error
              ? error.message
              : "요리모드를 불러오지 못했어요.",
          errorCode: isCookingApiError(error) ? error.code : null,
        });
      }
    },

    complete: async (consumedIngredientIds: string[]) => {
      const { recipeId, servings } = get();
      if (!recipeId) return;

      const body = {
        recipe_id: recipeId,
        cooking_servings: servings,
        consumed_ingredient_ids: consumedIngredientIds,
      };
      const payload = JSON.stringify(body);
      const previousAttempt = get().completionAttempt;
      const completionAttempt = previousAttempt?.payload === payload
        ? previousAttempt
        : { key: crypto.randomUUID(), payload };

      set({ screenState: "completing", completionAttempt });

      try {
        await completeStandaloneCooking(body, completionAttempt.key);
        set({ screenState: "completed", completionAttempt: null });
      } catch (error) {
        if (isCookingApiError(error) && error.status === 401) {
          set({ screenState: "ready" });
          throw error;
        }

        set({
          screenState: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "요리 완료에 실패했어요.",
          errorCode: isCookingApiError(error) ? error.code : null,
        });
      }
    },
  }),
);

export function resetStandaloneCookModeStore() {
  useStandaloneCookModeStore.setState(buildInitialState());
}
