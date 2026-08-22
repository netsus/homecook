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

  it("keeps recipe pending actions recipe-scoped until later web slices generalize protected actions", () => {
    expect(
      parsePendingAction(
        JSON.stringify({
          type: "shopping-create",
          redirectTo: "/shopping/flow",
          createdAt: 1,
        }),
      ),
    ).toBeNull();
  });

  it("preserves the internal recipe-delete intent for auth return without widening public action types", () => {
    const action = {
      type: "recipe-delete" as const,
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
    };

    savePendingAction(action);

    expect(readPendingAction()).toEqual(action);
  });

  it("stores public fork login intent without carrying projected draft context", () => {
    const action = {
      type: "recipe-fork" as const,
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
    };

    savePendingAction(action);

    expect(readPendingAction()).toEqual(action);
  });

  it("preserves an exact owner edit draft for the existing recipe return-to-action flow", () => {
    const editContext = {
      base_recipe_revision: 12,
      draft: {
        title: "세션 만료 전 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      image_object_id: "550e8400-e29b-41d4-a716-446655440099",
    };
    const action = {
      type: "recipe-edit-save" as const,
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
      editContext,
    };

    savePendingAction(action);

    expect(readPendingAction()).toEqual(action);
  });

  it("preserves an exact owner draft for the derived save-as-new return flow", () => {
    const editContext = {
      base_recipe_revision: 12,
      draft: {
        title: "세션 만료 전 새 레시피 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      image_object_id: "550e8400-e29b-41d4-a716-446655440099",
    };
    const action = {
      type: "recipe-save-as-new" as const,
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
      editContext,
    };

    savePendingAction(action);

    expect(readPendingAction()).toEqual(action);
  });

  it("rejects a malformed owner edit return context", () => {
    window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({
      type: "recipe-edit-save",
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
      editContext: {
        base_recipe_revision: 12,
        draft: {
          title: "고친 레시피",
          description: null,
          base_servings: 2,
          ingredients: [],
          steps: [],
          guessed_field: true,
        },
        image_object_id: null,
      },
    }));

    expect(readPendingAction()).toBeNull();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });
});
