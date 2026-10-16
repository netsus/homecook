// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PENDING_ACTION_KEY,
  clearPendingAction,
  parsePendingAction,
  readPendingAction,
  savePendingAction,
} from "@/lib/auth/pending-action";

describe("pending action", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
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

  it("preserves selected planner servings in the same-tab login intent", () => {
    const action = {
      type: "planner" as const,
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: 123,
      plannedServings: 3,
    };

    expect(savePendingAction(action)).toBe(true);
    expect(readPendingAction()).toEqual(action);
  });

  it.each([0, -1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid planner servings %s before resuming the action",
    (plannedServings) => {
      window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({
        type: "planner",
        recipeId: "recipe-1",
        redirectTo: "/recipe/recipe-1",
        createdAt: 123,
        plannedServings,
      }));

      expect(readPendingAction()).toBeNull();
      expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    },
  );

  it("keeps a strict cook intent with selected servings and the viewed revision", () => {
    const action = { type: "cook", recipeId: "recipe-1", redirectTo: "/recipe/recipe-1", createdAt: 123, cookingServings: 3, recipeRevision: 12 };
    expect(parsePendingAction(JSON.stringify(action), 123)).toEqual(action);
    for (const patch of [{ cookingServings: 0 }, { cookingServings: 1.5 }, { recipeRevision: 0 }, { recipeRevision: "12" },
      { redirectTo: "https://external.invalid" }, { recipeId: "../other" }, { extra: "not-accepted" }, { createdAt: 123 - 15 * 60 * 1000 }]) {
      expect(parsePendingAction(JSON.stringify({ ...action, ...patch }), 123)).toBeNull();
    }
  });
  it("returns null and removes invalid JSON", () => {
    window.sessionStorage.setItem(PENDING_ACTION_KEY, "{invalid");

    expect(readPendingAction()).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("rejects invalid payload shape", () => {
    window.sessionStorage.setItem(
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

  it("does not resume a legacy action shared through local storage", () => {
    const legacyCrossTabAction = JSON.stringify({
      type: "planner",
      recipeId: "recipe-1",
      redirectTo: "/recipe/recipe-1",
      createdAt: Date.now(),
    });
    window.localStorage.setItem(PENDING_ACTION_KEY, legacyCrossTabAction);

    expect(readPendingAction()).toBeNull();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
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
  it("preserves a generation-bound editor-only pantry return without a save intent", () => {
    const action = { type: "recipe-fork" as const, recipeId: "recipe-1", redirectTo: "/recipe/recipe-1", createdAt: 123,
      sourceOwnerUuid: "550e8400-e29b-41d4-a716-446655440071", sourceAccountGeneration: 3,
      resumeEditor: { mode: "edit" as const, rowKey: null },
      editContext: { base_recipe_revision: 12, draft: { title: "보관할 초안", description: null, base_servings: 2, ingredients: [], steps: [] }, image_object_id: null } };
    savePendingAction(action);
    expect(readPendingAction()).toEqual(action);
    for (const change of [
      { sourceOwnerUuid: null }, { sourceAccountGeneration: undefined }, { sourceAccountGeneration: 0 }, { sourceAccountGeneration: 1.5 },
      { resumeEditor: { mode: "save", rowKey: null } }, { resumeEditor: { mode: "edit", rowKey: "550e8400-e29b-41d4-a716-446655440081" } },
      { resumeEditor: { mode: "edit", rowKey: null, autoSave: true } },
    ]) expect(parsePendingAction(JSON.stringify({ ...action, ...change }), 123)).toBeNull();
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

  it("preserves a nullable product row, fixed version and original unit through login return", () => {
    const product = {
      ingredient_id: null, row_key: "79000000-0000-4000-8000-000000000003", source_kind: "food_product" as const,
      food_product_id: "79000000-0000-4000-8000-000000000001", food_product_nutrition_version_id: "79000000-0000-4000-8000-000000000002",
      amount: 0.5, unit: "package", ingredient_type: "QUANT" as const, display_text: "0.5팩", component_label: null, scalable: true,
    };
    const action = { type: "recipe-edit-save" as const, recipeId: "recipe-1", redirectTo: "/recipe/recipe-1", createdAt: 123,
      editContext: { base_recipe_revision: 1, image_object_id: null, draft: { title: "제품 원문", description: null, base_servings: 2, ingredients: [product], steps: [] } } };
    savePendingAction(action);
    expect(readPendingAction()).toEqual(action);
    for (const invalid of [
      { ...product, source_kind: "ingredient" }, { ...product, food_product_nutrition_version_id: null },
      { ...product, row_key: "not-uuid" }, { ...product, owner_uuid: "client-authority" },
      { ...product, transient_basis: { amount: 200, unit: "g" } },
    ]) {
      expect(parsePendingAction(JSON.stringify({ ...action, editContext: { ...action.editContext,
        draft: { ...action.editContext.draft, ingredients: [invalid] } } }))).toBeNull();
    }
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
    window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({
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
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });
});

it("preserves an exact fraction/revision/row in a resume-only quantity read and rejects new authority fields", () => {
  const product = { ingredient_id: null, row_key: "79000000-0000-4000-8000-000000000003", source_kind: "food_product" as const,
    food_product_id: "79000000-0000-4000-8000-000000000001", food_product_nutrition_version_id: "79000000-0000-4000-8000-000000000002",
    amount: 1 / 3, unit: "package", ingredient_type: "QUANT" as const, display_text: "1/3팩 원문", component_label: null, scalable: true,
    quantity_input: { schema_version: "quantity-v4" as const, raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: "79000000-0000-4000-8000-000000000002", expected_context_sha256: "a".repeat(64) } };
  const action = { type: "recipe-fork" as const, recipeId: "recipe-1", redirectTo: "/recipe/recipe-1", createdAt: 123,
    sourceOwnerUuid: "79000000-0000-4000-8000-000000000004", sourceAccountGeneration: 3,
    resumeEditor: { mode: "edit" as const, rowKey: product.row_key, source: "quantity" as const },
    editContext: { base_recipe_revision: 8, image_object_id: null, draft: { title: "분수 초안", description: null, base_servings: 4, ingredients: [product], steps: [] } } };
  expect(parsePendingAction(JSON.stringify(action), 123)).toEqual(action);
  for (const resumeEditor of [{ ...action.resumeEditor, source: "save" }, { ...action.resumeEditor, rowKey: null }, { ...action.resumeEditor, automatic: true }]) {
    expect(parsePendingAction(JSON.stringify({ ...action, resumeEditor }), 123)).toBeNull();
  }
  for (const row of [{ ...product, quantity_input: { ...product.quantity_input, evidence_ids: ["fake"] } },
    { ...product, quantity_input: { ...product.quantity_input, expected_product_nutrition_version_id: "wrong" } }, { ...product, quantity_input: null }]) {
    expect(parsePendingAction(JSON.stringify({ ...action, editContext: { ...action.editContext, draft: { ...action.editContext.draft, ingredients: [row] } } }), 123)).toBeNull();
  }
  expect(parsePendingAction(JSON.stringify({ ...action, sourceAccountGeneration: undefined }), 123)).toBeNull();
  expect(parsePendingAction(JSON.stringify(action), 123 + 15 * 60 * 1000)).toBeNull();
});
