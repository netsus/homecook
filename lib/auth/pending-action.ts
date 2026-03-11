export type PendingRecipeActionType = "like" | "save" | "planner";

export interface PendingRecipeAction {
  type: PendingRecipeActionType;
  recipeId: string;
  redirectTo: string;
  createdAt: number;
}

export const PENDING_ACTION_KEY = "homecook.pending-recipe-action";

export function savePendingAction(action: PendingRecipeAction) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
}

export function readPendingAction() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_ACTION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PendingRecipeAction;
  } catch {
    window.localStorage.removeItem(PENDING_ACTION_KEY);
    return null;
  }
}

export function clearPendingAction() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_ACTION_KEY);
}
