import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type {
  YoutubeSavedRecipeEditableContent,
  YoutubeSavedRecipeListData,
  YoutubeSavedRecipeResult,
} from "@/types/youtube-saved-recipe";

const basePath = "/api/v1/recipes/youtube/saved-drafts";

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fetchJson<T>(path, withE2EAuthOverrideHeaders(init ?? {})), error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: isApiFetchError(error)
        ? { code: error.code, message: error.message, fields: error.fields }
        : { code: "NETWORK_ERROR", message: "연결을 확인한 뒤 다시 시도해 주세요.", fields: [] },
    };
  }
}

export function fetchYoutubeSavedRecipes() {
  return request<YoutubeSavedRecipeListData>(basePath);
}

export function fetchYoutubeSavedRecipe(id: string) {
  return request<YoutubeSavedRecipeResult>(`${basePath}/${encodeURIComponent(id)}`);
}

export function ensureYoutubeSavedRecipe(extractionId: string, idempotencyKey: string) {
  return request<YoutubeSavedRecipeResult>(basePath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ extraction_id: extractionId }),
  });
}

export function createYoutubeSavedRecipe(
  extractionId: string,
  content: YoutubeSavedRecipeEditableContent,
  idempotencyKey: string,
) {
  return request<YoutubeSavedRecipeResult>(basePath, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ extraction_id: extractionId, content }),
  });
}

export function updateYoutubeSavedRecipe(
  id: string,
  revision: number,
  content: YoutubeSavedRecipeEditableContent,
  idempotencyKey: string,
) {
  return request<YoutubeSavedRecipeResult>(`${basePath}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ expected_revision: revision, content }),
  });
}
