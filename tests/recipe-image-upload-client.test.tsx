import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelRecipeImageUpload,
  uploadRecipeImage,
} from "@/lib/api/manual-recipe";

describe("manual recipe managed image API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a stable idempotency key with a managed upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            image_object_id: "11111111-1111-4111-8111-111111111111",
            state: "uploaded_unlinked",
            read_url: "https://cdn.test/private.jpg?token=signed",
            read_url_expires_at: "2026-07-29T04:20:00.000Z",
          },
          error: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const file = new File(["image"], "recipe.jpg", { type: "image/jpeg" });

    await uploadRecipeImage(file, {
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("cancels by object ID without exposing a storage path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            image_object_id: "11111111-1111-4111-8111-111111111111",
            state: "cleanup_pending",
          },
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await cancelRecipeImageUpload(
      "11111111-1111-4111-8111-111111111111",
      { idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/recipes/images/11111111-1111-4111-8111-111111111111/cancel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      }),
    );
  });

  it("preserves the server retry delay for an in-progress replay", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: null, error: null }),
        {
          status: 202,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "23",
          },
        },
      ),
    );

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.jpg", { type: "image/jpeg" }),
      { idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    );

    expect(result).toMatchObject({
      success: true,
      data: null,
      http_status: 202,
      retry_after_seconds: 23,
    });
  });
});
