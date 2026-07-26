import { describe, expect, it } from "vitest";

import { createManagedRecipeImageUploadResponse } from
  "@/lib/server/recipe-image-managed-response";
import type { ManagedRecipeImageUploadResult } from
  "@/lib/server/recipe-image-managed-upload";

async function readResponse(result: ManagedRecipeImageUploadResult) {
  const response = createManagedRecipeImageUploadResponse(result);
  return {
    body: await response.json(),
    response,
  };
}

describe("managed recipe image upload response", () => {
  it("returns the official object identity and short read URL on success", async () => {
    const { body, response } = await readResponse({
      kind: "succeeded",
      objectId: "11111111-1111-4111-8111-111111111111",
      readUrl: "https://storage.invalid/private.png?token=signed",
      readUrlExpiresAt: "2026-07-26T03:05:00.000Z",
      state: "uploaded_unlinked",
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        image_object_id: "11111111-1111-4111-8111-111111111111",
        read_url: "https://storage.invalid/private.png?token=signed",
        read_url_expires_at: "2026-07-26T03:05:00.000Z",
        state: "uploaded_unlinked",
      },
      error: null,
    });
  });

  it("returns an opaque in-progress replay with a positive Retry-After", async () => {
    const { body, response } = await readResponse({
      kind: "live_replay",
      retryAfterSeconds: 23,
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(body).toEqual({
      success: true,
      data: null,
      error: null,
    });
  });

  it("does not reveal whether upload limiting came from quota or backlog", async () => {
    const { body, response } = await readResponse({
      kind: "limited",
      retryAfterSeconds: 60,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "IMAGE_UPLOAD_LIMITED",
        fields: [],
        message: "잠시 후 이미지 업로드를 다시 시도해 주세요.",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/quota|backlog/i);
  });

  it.each([
    { kind: "live_replay", retryAfterSeconds: 0 },
    { kind: "live_replay", retryAfterSeconds: 1.5 },
    { kind: "limited", retryAfterSeconds: -1 },
    { kind: "limited", retryAfterSeconds: Number.MAX_SAFE_INTEGER + 1 },
  ] as const)("fails closed on malformed $kind retry delay", async (result) => {
    const { body, response } = await readResponse(result);

    expect(response.status).toBe(500);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("maps takeover byte conflicts to the official conflict response", async () => {
    const { body, response } = await readResponse({ kind: "conflict" });

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "IMAGE_UPLOAD_CONFLICT" },
    });
  });

  it.each([
    {
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "같은 요청 키가 다른 요청에 이미 사용됐어요.",
    },
    {
      code: "ACCOUNT_GENERATION_STALE",
      message: "계정 상태를 다시 확인해 주세요.",
    },
    {
      code: "ACCOUNT_SESSION_STALE",
      message: "세션을 다시 확인해 주세요.",
    },
    {
      code: "IMAGE_UPLOAD_CONFLICT",
      message: "이미지 업로드 상태가 변경됐어요. 다시 시도해 주세요.",
    },
    {
      code: "IMAGE_EXPIRED",
      message: "이미지 업로드가 만료됐어요. 다시 업로드해 주세요.",
    },
  ] as const)("maps reservation rejection $code without internal detail", async ({
    code,
    message,
  }) => {
    const { body, response } = await readResponse({
      code,
      kind: "rejected",
    });

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code,
        fields: [],
        message,
      },
    });
  });

  it("maps durable terminal upload replay to the expired response", async () => {
    const { body, response } = await readResponse({
      kind: "terminal",
      objectId: "11111111-1111-4111-8111-111111111111",
      state: "verified_not_found",
      terminalResult: "verified_not_found",
    });

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "IMAGE_EXPIRED" },
    });
    expect(JSON.stringify(body)).not.toContain(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it.each([
    "invalid_input",
    "reservation_failed",
    "invalid_reservation",
    "storage_upload_failed",
    "storage_upload_timeout",
    "takeover_verification_failed",
    "storage_finalize_failed",
    "storage_compensation_failed",
    "read_url_failed",
  ] as const)("fails closed without exposing internal reason %s", async (reason) => {
    const { body, response } = await readResponse({
      kind: "failed",
      reason,
    });

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        fields: [],
        message: "이미지를 업로드하지 못했어요.",
      },
    });
    expect(JSON.stringify(body)).not.toContain(reason);
  });
});
