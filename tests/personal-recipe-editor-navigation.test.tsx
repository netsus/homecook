import { describe, expect, it } from "vitest";

import { getRecipeEditorContextPolicy } from "@/lib/personal-recipe-editor";

describe("personal recipe editor navigation contract", () => {
  it("keeps planner-add as the only context with an automatic Meal side effect", () => {
    expect(getRecipeEditorContextPolicy("planner-add")).toMatchObject({
      cancelDestination: "planner-origin",
      mealSideEffect: "create-after-recipe",
      plannerContextRequired: true,
      primaryIdentity: "new-private",
    });

    for (const context of [
      "personal-create",
      "personal-edit",
      "public-fork",
    ] as const) {
      expect(getRecipeEditorContextPolicy(context)).toMatchObject({
        mealSideEffect: "none",
        plannerContextRequired: false,
      });
    }
  });

  it("preserves same-id edit and immutable public fork semantics", () => {
    expect(getRecipeEditorContextPolicy("personal-edit")).toMatchObject({
      cancelDestination: "current-recipe-detail",
      primaryIdentity: "same-private",
      secondaryIdentity: "new-private",
      sourceMutation: "current-private-only",
    });
    expect(getRecipeEditorContextPolicy("public-fork")).toMatchObject({
      cancelDestination: "source-recipe-detail",
      primaryIdentity: "new-private",
      secondaryIdentity: "none",
      sourceMutation: "never",
    });
  });

  it("reserves personal-create without inventing an active entry route", () => {
    expect(getRecipeEditorContextPolicy("personal-create")).toMatchObject({
      activeEntry: false,
      cancelDestination: "invoker",
      primaryIdentity: "new-private",
    });
  });
});
