"use client";

import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";

export interface PersonalRecipeDeleteResult {
  id: string;
  deleted_at: string;
}

export interface PersonalRecipeApiError extends Error {
  status: number;
  code: string;
}

export function isPersonalRecipeApiError(error: unknown): error is PersonalRecipeApiError {
  return error instanceof Error
    && "status" in error
    && typeof error.status === "number"
    && "code" in error
    && typeof error.code === "string";
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, withE2EAuthOverrideHeaders(init));
  const payload = await response.json() as ApiResponse<T>;

  if (!response.ok || !payload.success || !payload.data) {
    const error = new Error(
      payload.error?.message ?? "요청을 처리하지 못했어요.",
    ) as PersonalRecipeApiError;
    error.status = response.status;
    error.code = payload.error?.code ?? "UNKNOWN_ERROR";
    throw error;
  }

  return payload.data;
}

export function deletePersonalRecipe(recipeId: string, idempotencyKey: string) {
  return request<PersonalRecipeDeleteResult>(`/api/v1/recipes/${recipeId}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
