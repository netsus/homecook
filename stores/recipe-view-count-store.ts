"use client";

import { create } from "zustand";

interface RecipeViewCountState {
  counts: Record<string, number | null>;
  track: (recipeId: string) => void;
  record: (recipeId: string, viewCount: number) => void;
}

// Only remember IDs opened from public discovery, never entire recipe/account data.
// This is tab memory, not persisted storage or a client-side counter increment.
export const useRecipeViewCountStore = create<RecipeViewCountState>((set) => ({
  counts: {},
  track: (recipeId) => set((state) => {
    const counts = { ...state.counts };
    const current = counts[recipeId] ?? null;
    delete counts[recipeId];
    counts[recipeId] = current;
    while (Object.keys(counts).length > 100) delete counts[Object.keys(counts)[0]];
    return { counts };
  }),
  record: (recipeId, viewCount) => set((state) => {
    if (!Object.hasOwn(state.counts, recipeId) || !Number.isSafeInteger(viewCount) || viewCount < 0) return state;
    return { counts: { ...state.counts, [recipeId]: Math.max(state.counts[recipeId] ?? 0, viewCount) } };
  }),
}));
