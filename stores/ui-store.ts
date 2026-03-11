"use client";

import { create } from "zustand";

import type {
  PendingRecipeAction,
  PendingRecipeActionType,
} from "@/lib/auth/pending-action";

interface AuthGateState {
  isOpen: boolean;
  action: PendingRecipeAction | null;
  open: (payload: { recipeId: string; type: PendingRecipeActionType }) => void;
  close: () => void;
}

export const useAuthGateStore = create<AuthGateState>((set) => ({
  isOpen: false,
  action: null,
  open: ({ recipeId, type }) =>
    set({
      isOpen: true,
      action: {
        recipeId,
        type,
        redirectTo: `/recipe/${recipeId}`,
        createdAt: Date.now(),
      },
    }),
  close: () =>
    set({
      isOpen: false,
      action: null,
    }),
}));
