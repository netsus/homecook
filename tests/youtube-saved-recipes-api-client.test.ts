import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureYoutubeSavedRecipe } from "@/lib/api/youtube-saved-recipes";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/mock/qa-fixture-overrides", () => ({
  withQaFixtureOverrideHeaders: (init: RequestInit) => init,
}));

const fetchMock = vi.fn();
const extractionId = "20000000-0000-4000-8000-000000000001";
const idempotencyKey = "60000000-0000-4000-8000-000000000001";
const savedResult = {
  draft_id: "70000000-0000-4000-8000-000000000001",
  revision: 1,
  created_at: "2026-10-11T00:00:00.000Z",
  updated_at: "2026-10-11T00:00:00.000Z",
  content: {
    title: "저장 결과",
    base_servings: 2,
    tags: [],
    ingredients: [],
    steps: [],
  },
  source: {
    extraction_id: extractionId,
    youtube_url: "https://www.youtube.com/watch?v=recipe12345",
    youtube_video_id: "recipe12345",
    thumbnail_url: null,
  },
};

describe("youtube saved recipes API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensures a saved result with the exact endpoint, method, body, and idempotency key", async () => {
    fetchMock.mockResolvedValue(Response.json({
      success: true,
      data: savedResult,
      error: null,
    }));

    await expect(ensureYoutubeSavedRecipe(extractionId, idempotencyKey)).resolves.toEqual({
      success: true,
      data: savedResult,
      error: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/recipes/youtube/saved-drafts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ extraction_id: extractionId }),
        signal: undefined,
      },
    );
  });

  it("returns a network error without replaying the ensure mutation", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(ensureYoutubeSavedRecipe(extractionId, idempotencyKey)).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([502, 503, 504])("does not replay the ensure mutation after an HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(Response.json({
      success: false,
      data: null,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "temporary failure",
        fields: [],
      },
    }, { status }));

    await expect(ensureYoutubeSavedRecipe(extractionId, idempotencyKey)).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
