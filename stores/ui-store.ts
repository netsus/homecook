"use client";

import { create } from "zustand";
import type { RefObject } from "react";

export const useActionConfirmationStore = create<{
  message: string | null;
  fallbackFocusRef: RefObject<HTMLElement | null> | null;
  confirmationId: number;
  returnFocusPath: string | null;
  dismiss: () => void;
}>((set) => ({
  message: null,
  fallbackFocusRef: null,
  confirmationId: 0,
  returnFocusPath: null,
  dismiss: () => set({ message: null, fallbackFocusRef: null, returnFocusPath: null }),
}));

export function showActionConfirmation(message: string, fallbackFocusRef?: RefObject<HTMLElement | null>) {
  useActionConfirmationStore.setState((state) => ({
    message,
    fallbackFocusRef: fallbackFocusRef ?? null,
    confirmationId: state.confirmationId + 1,
    returnFocusPath: fallbackFocusRef && typeof window !== "undefined" ? window.location.pathname : null,
  }));
}

import type {
  PendingRecipeAction,
  PendingRecipeActionType,
  RecipeEditorPantryResume,
} from "@/lib/auth/pending-action";
import type { RecipeEditContext } from "@/types/recipe";

type AuthGateOpenPayload =
  | { recipeId: string; type: Exclude<PendingRecipeActionType, "recipe-edit-save" | "recipe-save-as-new" | "recipe-fork" | "planner"> }
  | { recipeId: string; type: "planner"; plannedServings?: number }
  | { editContext?: RecipeEditContext; sourceOwnerUuid?: string | null; sourceAccountGeneration?: number; resumeEditor?: RecipeEditorPantryResume; recipeId: string; type: "recipe-fork" }
  | { editContext: RecipeEditContext; sourceOwnerUuid: string | null; sourceAccountGeneration?: number; recipeId: string; type: "recipe-edit-save" | "recipe-save-as-new" };

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
    const common: Pick<
      PendingRecipeAction,
      "recipeId" | "redirectTo" | "createdAt" | "sourceOwnerUuid" | "sourceAccountGeneration"
    > = {
      recipeId: payload.recipeId,
      redirectTo: `/recipe/${payload.recipeId}`,
      createdAt: Date.now(),
    };

    if ("sourceOwnerUuid" in payload) {
      common.sourceOwnerUuid = payload.sourceOwnerUuid;
    }
    if ("sourceAccountGeneration" in payload) common.sourceAccountGeneration = payload.sourceAccountGeneration;

    const action: PendingRecipeAction = (
      payload.type === "recipe-edit-save" || payload.type === "recipe-save-as-new"
    )
      ? { ...common, type: payload.type, editContext: payload.editContext }
      : payload.type === "recipe-fork"
        ? { ...common, type: payload.type, editContext: payload.editContext, resumeEditor: payload.resumeEditor }
        : payload.type === "planner"
          ? { ...common, type: payload.type, plannedServings: payload.plannedServings }
          : { ...common, type: payload.type };
    set({ isOpen: true, action });
  },
  close: () =>
    set({
      isOpen: false,
      action: null,
    }),
}));
