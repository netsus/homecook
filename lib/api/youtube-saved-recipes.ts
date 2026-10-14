import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import { QUANTITY_CONTRACT_HEADER, QUANTITY_INPUT_VERSION } from "@/types/quantity-input";
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

export function fetchYoutubeSavedRecipe(id: string, quantityContract = false) {
  if (!quantityContract) return request<YoutubeSavedRecipeResult>(`${basePath}/${encodeURIComponent(id)}`);
  return request<YoutubeSavedRecipeResult>(`${basePath}/${encodeURIComponent(id)}`, {
    headers: { [QUANTITY_CONTRACT_HEADER]: QUANTITY_INPUT_VERSION },
  });
}

export function ensureYoutubeSavedRecipe(extractionId: string, idempotencyKey: string, quantityContract = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
  if (quantityContract) headers[QUANTITY_CONTRACT_HEADER] = QUANTITY_INPUT_VERSION;
  return request<YoutubeSavedRecipeResult>(basePath, {
    method: "POST",
    headers,
    body: JSON.stringify({ extraction_id: extractionId }),
  });
}

export function createYoutubeSavedRecipe(
  extractionId: string,
  content: YoutubeSavedRecipeEditableContent,
  idempotencyKey: string,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
  if (content.ingredients.some(row => "quantity_input" in row)) headers[QUANTITY_CONTRACT_HEADER] = QUANTITY_INPUT_VERSION;
  return request<YoutubeSavedRecipeResult>(basePath, {
    method: "POST",
    headers,
    body: JSON.stringify({ extraction_id: extractionId, content }),
  });
}

export function updateYoutubeSavedRecipe(
  id: string,
  revision: number,
  content: YoutubeSavedRecipeEditableContent,
  idempotencyKey: string,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
  if (content.ingredients.some(row => "quantity_input" in row)) headers[QUANTITY_CONTRACT_HEADER] = QUANTITY_INPUT_VERSION;
  return request<YoutubeSavedRecipeResult>(`${basePath}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ expected_revision: revision, content }),
  });
}
