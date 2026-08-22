// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPersonalRecipeFromSource,
  isPersonalRecipeApiError,
} from "@/lib/api/personal-recipe";

describe("personal recipe api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the approved personal-derived recipe body with a stable idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: { id: "recipe-created", revision: 13 },
        error: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPersonalRecipeFromSource({
      baseRecipeRevision: 12,
      draft: {
        title: "내 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      imageObjectId: null,
      originRecipeId: "recipe-source",
    }, "550e8400-e29b-41d4-a716-446655440099");

    expect(result).toEqual({ id: "recipe-created", revision: 13 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/recipes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440099",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          origin_recipe_id: "recipe-source",
          base_recipe_revision: 12,
          draft: {
            title: "내 김치찌개",
            description: null,
            base_servings: 2,
            ingredients: [],
            steps: [],
          },
          image_object_id: null,
        }),
      }),
    );
  });

  it("surfaces the approved API error contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        data: null,
        error: {
          code: "ACCOUNT_SESSION_STALE",
          message: "세션이 만료되었어요.",
          fields: [],
        },
      }),
    }));

    await expect(
      createPersonalRecipeFromSource({
        baseRecipeRevision: 12,
        draft: {
          title: "내 김치찌개",
          description: null,
          base_servings: 2,
          ingredients: [],
          steps: [],
        },
        imageObjectId: null,
        originRecipeId: "recipe-source",
      }, "550e8400-e29b-41d4-a716-446655440099"),
    ).rejects.toSatisfy((error: unknown) =>
      isPersonalRecipeApiError(error)
      && error.status === 409
      && error.code === "ACCOUNT_SESSION_STALE");
  });
});
