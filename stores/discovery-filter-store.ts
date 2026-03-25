"use client";

import { create } from "zustand";

interface DiscoveryFilterState {
  appliedIngredientIds: string[];
  setAppliedIngredientIds: (ingredientIds: string[]) => void;
  resetAppliedIngredientIds: () => void;
}

function dedupeIngredientIds(ingredientIds: string[]) {
  return Array.from(new Set(ingredientIds));
}

export const useDiscoveryFilterStore = create<DiscoveryFilterState>((set) => ({
  appliedIngredientIds: [],
  setAppliedIngredientIds: (ingredientIds) =>
    set({
      appliedIngredientIds: dedupeIngredientIds(ingredientIds),
    }),
  resetAppliedIngredientIds: () =>
    set({
      appliedIngredientIds: [],
    }),
}));
