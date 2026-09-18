"use client";

import { create } from "zustand";

export const useActionConfirmationStore = create<{
  message: string | null;
  dismiss: () => void;
}>((set) => ({
  message: null,
  dismiss: () => set({ message: null }),
}));

export function showActionConfirmation(message: string) {
  useActionConfirmationStore.setState({ message });
}

import type {
  PendingRecipeAction,
  PendingRecipeActionType,
} from "@/lib/auth/pending-action";
import type { RecipeEditContext } from "@/types/recipe";

type AuthGateOpenPayload =
  | { recipeId: string; type: Exclude<PendingRecipeActionType, "recipe-edit-save" | "recipe-save-as-new" | "recipe-fork"> }
  | { editContext?: RecipeEditContext; sourceOwnerUuid?: string | null; recipeId: string; type: "recipe-fork" }
  | { editContext: RecipeEditContext; sourceOwnerUuid: string | null; recipeId: string; type: "recipe-edit-save" | "recipe-save-as-new" };

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
      ...("sourceOwnerUuid" in payload ? { sourceOwnerUuid: payload.sourceOwnerUuid } : {}),
    };
    const action: PendingRecipeAction = (
      payload.type === "recipe-edit-save" || payload.type === "recipe-save-as-new"
    )
      ? { ...common, type: payload.type, editContext: payload.editContext }
      : payload.type === "recipe-fork"
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
