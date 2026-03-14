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

    expect(useAuthGateStore.getState()).toMatchObject({
      isOpen: true,
      action: {
        recipeId: "recipe-1",
        type: "planner",
        redirectTo: "/recipe/recipe-1",
      },
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
});
