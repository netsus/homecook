"use client";

import { create } from "zustand";

import type {
  PendingRecipeAction,
  PendingRecipeActionType,
} from "@/lib/auth/pending-action";
import type { RecipeEditContext } from "@/types/recipe";

type AuthGateOpenPayload =
  | { recipeId: string; type: Exclude<PendingRecipeActionType, "recipe-edit-save"> }
  | { editContext: RecipeEditContext; recipeId: string; type: "recipe-edit-save" };

interface AuthGateState {
  isOpen: boolean;
  action: PendingRecipeAction | null;
  open: (payload: AuthGateOpenPayload) => void;
  close: () => void;
}

export const useAuthGateStore = create<AuthGateState>((set) => ({
  isOpen: false,
  action: null,
  open: (payload) => {
    const common = {
      recipeId: payload.recipeId,
      redirectTo: `/recipe/${payload.recipeId}`,
      createdAt: Date.now(),
    };
    const action: PendingRecipeAction = payload.type === "recipe-edit-save"
      ? { ...common, type: payload.type, editContext: payload.editContext }
      : { ...common, type: payload.type };
    set({ isOpen: true, action });
  },
  close: () =>
    set({
      isOpen: false,
      action: null,
    }),
}));
