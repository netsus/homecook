import { fail, ok } from "@/lib/api/response";

import type { ManagedRecipeImageUploadResult } from
  "./recipe-image-managed-upload";

function validRetryAfter(seconds: number) {
  return Number.isSafeInteger(seconds) && seconds > 0;
}

function internalFailure() {
  return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
}

export function createManagedRecipeImageUploadResponse(
  result: ManagedRecipeImageUploadResult,
) {
  if (result.kind === "succeeded") {
    return ok({
      image_object_id: result.objectId,
      read_url: result.readUrl,
      read_url_expires_at: result.readUrlExpiresAt,
      state: result.state,
    }, { status: 201 });
  }

  if (result.kind === "live_replay") {
    return validRetryAfter(result.retryAfterSeconds)
      ? ok(null, {
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
          },
          status: 202,
        })
      : internalFailure();
  }

  if (result.kind === "limited") {
    if (!validRetryAfter(result.retryAfterSeconds)) {
      return internalFailure();
    }
    const response = fail(
      "IMAGE_UPLOAD_LIMITED",
      "잠시 후 이미지 업로드를 다시 시도해 주세요.",
      429,
    );
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
    return response;
  }

  if (result.kind === "conflict") {
    return fail(
      "IMAGE_UPLOAD_CONFLICT",
      "이미지 업로드 상태가 변경됐어요. 다시 시도해 주세요.",
      409,
    );
  }

  if (result.kind === "terminal") {
    return fail(
      "IMAGE_EXPIRED",
      "이미지 업로드가 만료됐어요. 다시 업로드해 주세요.",
      409,
    );
  }

  return internalFailure();
}
