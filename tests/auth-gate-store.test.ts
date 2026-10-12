import { beforeEach, describe, expect, it } from "vitest";

import { useAuthGateStore } from "@/stores/ui-store";

describe("auth gate store", () => {
  beforeEach(() => {
    useAuthGateStore.setState({
      isOpen: false,
      action: null,
    });
  });

  it("opens with the recipe-specific redirect path", () => {
    useAuthGateStore.getState().open({
      recipeId: "recipe-1",
      type: "planner",
    });

    const action = useAuthGateStore.getState().action;
    expect(action).toEqual({
      recipeId: "recipe-1",
      type: "planner",
      redirectTo: "/recipe/recipe-1",
      createdAt: expect.any(Number),
    });
    expect(Object.hasOwn(action!, "sourceOwnerUuid")).toBe(false);
  });

  it("preserves an explicit null source owner for a recipe fork", () => {
    useAuthGateStore.getState().open({
      recipeId: "recipe-1",
      sourceOwnerUuid: null,
      type: "recipe-fork",
    });

    expect(useAuthGateStore.getState().action).toEqual({
      recipeId: "recipe-1",
      type: "recipe-fork",
      redirectTo: "/recipe/recipe-1",
      createdAt: expect.any(Number),
      sourceOwnerUuid: null,
      editContext: undefined,
    });
  });

  it("closes and clears action state", () => {
    useAuthGateStore.getState().open({
      recipeId: "recipe-1",
      type: "like",
    });

    useAuthGateStore.getState().close();

    expect(useAuthGateStore.getState()).toMatchObject({
      isOpen: false,
      action: null,
    });
  });

  it("stores the internal recipe-delete auth return intent on the same recipe path", () => {
    useAuthGateStore.getState().open({
      recipeId: "recipe-1",
      type: "recipe-delete",
    });

    expect(useAuthGateStore.getState()).toMatchObject({
      isOpen: true,
      action: {
        recipeId: "recipe-1",
        type: "recipe-delete",
        redirectTo: "/recipe/recipe-1",
      },
    });
  });
});
