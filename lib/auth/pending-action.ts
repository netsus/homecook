export type PendingRecipeActionType = "like" | "save" | "planner";

export interface PendingRecipeAction {
  type: PendingRecipeActionType;
  recipeId: string;
  redirectTo: string;
  createdAt: number;
}

export const PENDING_ACTION_KEY = "homecook.pending-recipe-action";

export function parsePendingAction(raw: string) {
  try {
    const value = JSON.parse(raw) as Partial<PendingRecipeAction>;

    if (
      (value.type === "like" ||
        value.type === "save" ||
        value.type === "planner") &&
      typeof value.recipeId === "string" &&
      typeof value.redirectTo === "string" &&
      Number.isFinite(value.createdAt)
    ) {
      return value as PendingRecipeAction;
    }
  } catch {
    return null;
  }

  return null;
}

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

  const action = parsePendingAction(raw);

  if (!action) {
    window.localStorage.removeItem(PENDING_ACTION_KEY);
  }

  return action;
}

export function clearPendingAction() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_ACTION_KEY);
}
