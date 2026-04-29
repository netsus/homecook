import { create } from "zustand";

import {
  createCookingSession,
  fetchCookingReady,
  isCookingApiError,
} from "@/lib/api/cooking";
import type { CookingReadyRecipe } from "@/types/cooking";

export type CookingReadyScreenState =
  | "loading"
  | "ready"
  | "empty"
  | "error";

interface CookingReadyStoreState {
  screenState: CookingReadyScreenState;
  dateRange: { start: string; end: string } | null;
  recipes: CookingReadyRecipe[];
  errorMessage: string | null;
  creatingRecipeId: string | null;
  loadReady: () => Promise<void>;
  startSession: (recipe: CookingReadyRecipe) => Promise<string>;
}

function buildInitialState() {
  return {
    screenState: "loading" as CookingReadyScreenState,
    dateRange: null as { start: string; end: string } | null,
    recipes: [] as CookingReadyRecipe[],
    errorMessage: null as string | null,
    creatingRecipeId: null as string | null,
  };
}

export const useCookingReadyStore = create<CookingReadyStoreState>(
  (set) => ({
    ...buildInitialState(),

    loadReady: async () => {
      set({ screenState: "loading", errorMessage: null });

      try {
        const data = await fetchCookingReady();

        set({
          screenState: data.recipes.length > 0 ? "ready" : "empty",
          dateRange: data.date_range,
          recipes: data.recipes,
          errorMessage: null,
        });
      } catch (error) {
        if (isCookingApiError(error) && error.status === 401) {
          throw error;
        }

        set({
          screenState: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "레시피를 불러오지 못했어요.",
        });
      }
    },

    startSession: async (recipe: CookingReadyRecipe) => {
      set({ creatingRecipeId: recipe.recipe_id });

      try {
        const data = await createCookingSession({
          recipe_id: recipe.recipe_id,
          meal_ids: recipe.meal_ids,
          cooking_servings: recipe.total_servings,
        });

        set({ creatingRecipeId: null });

        return data.session_id;
      } catch (error) {
        set({ creatingRecipeId: null });
        throw error;
      }
    },
  }),
);

export function resetCookingReadyStore() {
  useCookingReadyStore.setState(buildInitialState());
}
