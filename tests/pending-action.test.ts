// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  PENDING_ACTION_KEY,
  clearPendingAction,
  parsePendingAction,
  readPendingAction,
  savePendingAction,
} from "@/lib/auth/pending-action";

describe("pending action", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses a stable storage key", () => {
    expect(PENDING_ACTION_KEY).toBe("homecook.pending-recipe-action");
  });

  it("saves and reads a valid pending action", () => {
    savePendingAction({
      type: "like",
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
    });

    expect(readPendingAction()).toEqual({
      type: "like",
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
    });
  });

  it("clears saved pending action", () => {
    savePendingAction({
      type: "save",
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
    });

    clearPendingAction();

    expect(readPendingAction()).toBeNull();
  });

  it("returns null and removes invalid JSON", () => {
    window.localStorage.setItem(PENDING_ACTION_KEY, "{invalid");

    expect(readPendingAction()).toBeNull();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("rejects invalid payload shape", () => {
    window.localStorage.setItem(
      PENDING_ACTION_KEY,
      JSON.stringify({
        type: "unknown",
        recipeId: 3,
        redirectTo: "/recipe/recipe-1",
        createdAt: "later",
      }),
    );

    expect(readPendingAction()).toBeNull();
    expect(parsePendingAction('{"type":"planner","recipeId":"id","redirectTo":"/recipe/id","createdAt":1}')).toEqual({
      type: "planner",
      recipeId: "id",
      redirectTo: "/recipe/id",
      createdAt: 1,
    });
  });
});
