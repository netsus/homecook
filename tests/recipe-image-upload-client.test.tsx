// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelRecipeImage,
  uploadRecipeImage,
} from "@/lib/api/manual-recipe";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    status: init.status,
    statusText: init.statusText,
  });
}

describe("manual recipe image client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the upload Idempotency-Key and accepts the managed object response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440030",
          state: "uploaded_unlinked",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
        },
        error: null,
      }, { status: 201 }),
    );

    const file = new File(["image"], "recipe.png", { type: "image/png" });
    const result = await uploadRecipeImage(file, {
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440099",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/recipes/images");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.body).toBeInstanceOf(FormData);
    expect(new Headers(requestInit?.headers).get("Idempotency-Key")).toBe(
      "550e8400-e29b-41d4-a716-446655440099",
    );
    expect(result).toEqual({
      success: true,
      data: {
        image_object_id: "550e8400-e29b-41d4-a716-446655440030",
        state: "uploaded_unlinked",
        read_url: "https://signed.example.com/private.png",
        read_url_expires_at: "2026-07-29T03:05:00.000Z",
      },
      error: null,
    });
  });

  it("surfaces in-progress replay through Retry-After without inventing a payload", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: null,
          error: null,
        },
        {
          headers: { "Retry-After": "19" },
          status: 202,
        },
      ),
    );

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
      { idempotencyKey: "550e8400-e29b-41d4-a716-446655440100" },
    );

    expect(result).toEqual({
      success: true,
      data: null,
      error: null,
      in_progress: true,
      retry_after_seconds: 19,
    });
  });

  it("rejects a response that mixes managed and legacy fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440031",
          state: "uploaded_unlinked",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
          thumbnail_url: "https://cdn.example.com/legacy.png",
          storage_path: "recipe-images/user/legacy.png",
        },
        error: null,
      }, { status: 201 }),
    );

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
      { idempotencyKey: "550e8400-e29b-41d4-a716-446655440101" },
    );

    expect(result).toEqual({
      success: false,
      data: null,
      error: {
        code: "INVALID_RESPONSE",
        fields: [],
        message: "서버 응답을 해석하지 못했어요.",
      },
    });
  });

  it("rejects the legacy thumbnail response so an uncancellable write cannot succeed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          thumbnail_url: "https://cdn.example.com/legacy.png",
          storage_path: "recipe-images/user/legacy.png",
        },
        error: null,
      }, { status: 201 }),
    );

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
      { idempotencyKey: "550e8400-e29b-41d4-a716-446655440102" },
    );

    expect(result).toMatchObject({
      success: false,
      data: null,
      error: { code: "INVALID_RESPONSE" },
    });
  });

  it.each([
    {
      name: "200 managed success",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440030",
          state: "uploaded_unlinked",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
        },
        error: null,
      }, { status: 200 }),
    },
    {
      name: "202 truthy non-boolean success",
      response: jsonResponse(
        { success: "yes", data: null, error: null },
        { headers: { "Retry-After": "3" }, status: 202 },
      ),
    },
    {
      name: "202 wrapper with simultaneous error",
      response: jsonResponse(
        {
          success: true,
          data: null,
          error: { code: "CONFLICT", message: "conflict", fields: [] },
        },
        { headers: { "Retry-After": "3" }, status: 202 },
      ),
    },
    {
      name: "201 arbitrary managed state",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440030",
          state: "attached_private",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
        },
        error: null,
      }, { status: 201 }),
    },
    {
      name: "201 non-UUID object id",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "not-a-uuid",
          state: "uploaded_unlinked",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
        },
        error: null,
      }, { status: 201 }),
    },
    {
      name: "201 success wrapper with simultaneous error",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440030",
          state: "uploaded_unlinked",
          read_url: "https://signed.example.com/private.png",
          read_url_expires_at: "2026-07-29T03:05:00.000Z",
        },
        error: { code: "CONFLICT", message: "conflict", fields: [] },
      }, { status: 201 }),
    },
    {
      name: "400 malformed error wrapper",
      response: jsonResponse({
        success: false,
        data: { unexpected: true },
        error: { code: "VALIDATION_ERROR", message: "bad", fields: [] },
      }, { status: 400 }),
    },
  ])("rejects invalid upload protocol case: $name", async ({ response }) => {
    fetchMock.mockResolvedValue(response);

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
    );

    expect(result).toMatchObject({
      success: false,
      data: null,
      error: { code: "INVALID_RESPONSE" },
    });
  });

  it.each([
    { status: 409, code: "IDEMPOTENCY_CONFLICT" },
    { status: 422, code: "IMAGE_MIME_MISMATCH" },
    { status: 503, code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
  ])("preserves a strict upload error wrapper for HTTP $status", async ({ status, code }) => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: false,
      data: null,
      error: { code, message: "업로드 실패", fields: [] },
    }, { status }));

    const result = await uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
    );

    expect(result).toEqual({
      success: false,
      data: null,
      error: { code, message: "업로드 실패", fields: [] },
    });
  });

  it("rejects invalid JSON and maps a fetch rejection to NETWORK_ERROR", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{", { status: 201 }))
      .mockRejectedValueOnce(new TypeError("offline"));

    await expect(uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
    )).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" },
    });
    await expect(uploadRecipeImage(
      new File(["image"], "recipe.png", { type: "image/png" }),
    )).resolves.toMatchObject({
      success: false,
      error: { code: "NETWORK_ERROR" },
    });
  });

  it("uses a fresh cancel key on every managed image cancel call", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440050",
          state: "cleanup_pending",
        },
        error: null,
      }),
    );
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440201")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440202");

    await cancelRecipeImage("550e8400-e29b-41d4-a716-446655440050");
    await cancelRecipeImage("550e8400-e29b-41d4-a716-446655440050");

    const firstCall = fetchMock.mock.calls[0];
    const secondCall = fetchMock.mock.calls[1];
    expect(firstCall?.[0]).toBe(
      "/api/v1/recipes/images/550e8400-e29b-41d4-a716-446655440050/cancel",
    );
    expect(secondCall?.[0]).toBe(
      "/api/v1/recipes/images/550e8400-e29b-41d4-a716-446655440050/cancel",
    );
    expect(new Headers(firstCall?.[1]?.headers).get("Idempotency-Key")).toBe(
      "550e8400-e29b-41d4-a716-446655440201",
    );
    expect(new Headers(secondCall?.[1]?.headers).get("Idempotency-Key")).toBe(
      "550e8400-e29b-41d4-a716-446655440202",
    );
  });

  it.each([
    {
      name: "202 success",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440050",
          state: "cleanup_pending",
        },
        error: null,
      }, { status: 202 }),
    },
    {
      name: "200 arbitrary state",
      response: jsonResponse({
        success: true,
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440050",
          state: "uploaded_unlinked",
        },
        error: null,
      }, { status: 200 }),
    },
    {
      name: "200 truthy non-boolean success",
      response: jsonResponse({
        success: "yes",
        data: {
          image_object_id: "550e8400-e29b-41d4-a716-446655440050",
          state: "cleanup_pending",
        },
        error: null,
      }, { status: 200 }),
    },
  ])("rejects invalid cancel protocol case: $name", async ({ response }) => {
    fetchMock.mockResolvedValue(response);

    const result = await cancelRecipeImage(
      "550e8400-e29b-41d4-a716-446655440050",
    );

    expect(result).toMatchObject({
      success: false,
      data: null,
      error: { code: "INVALID_RESPONSE" },
    });
  });

  it("preserves a strict 409 cancel error wrapper", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: false,
      data: null,
      error: {
        code: "IMAGE_CANCEL_CONFLICT",
        message: "취소할 수 없어요.",
        fields: [],
      },
    }, { status: 409 }));

    await expect(cancelRecipeImage(
      "550e8400-e29b-41d4-a716-446655440050",
    )).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "IMAGE_CANCEL_CONFLICT",
        message: "취소할 수 없어요.",
        fields: [],
      },
    });
  });

  it("rejects invalid cancel JSON and maps a cancel fetch rejection to NETWORK_ERROR", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{", { status: 200 }))
      .mockRejectedValueOnce(new TypeError("offline"));

    await expect(cancelRecipeImage(
      "550e8400-e29b-41d4-a716-446655440050",
    )).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" },
    });
    await expect(cancelRecipeImage(
      "550e8400-e29b-41d4-a716-446655440050",
    )).resolves.toMatchObject({
      success: false,
      error: { code: "NETWORK_ERROR" },
    });
  });
});
