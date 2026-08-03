import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { RecipeFutureImpact } from "@/components/recipe/recipe-future-impact-dialog";
import type { ApiResponse } from "@/types/api";

export interface RecipeFutureImpactApiError extends Error { status: number; code: string }
async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, withE2EAuthOverrideHeaders(init));
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || !payload.success || !payload.data) {
    const error = new Error(payload.error?.message ?? "요청을 처리하지 못했어요.") as RecipeFutureImpactApiError;
    error.status = response.status; error.code = payload.error?.code ?? "UNKNOWN_ERROR"; throw error;
  }
  return payload.data;
}

export type RecipeFutureDraft = { title: string; description?: string | null; base_servings: number; ingredients: unknown[]; steps: unknown[] };
export function fetchRecipeFutureImpact(recipeId: string, baseRecipeRevision: number, draft: RecipeFutureDraft) {
  return request<RecipeFutureImpact>(`/api/v1/recipes/${recipeId}/future-plan-impact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ base_recipe_revision: baseRecipeRevision, draft }) });
}
export function patchRecipeWithFutureStrategy(recipeId: string, input: { baseRecipeRevision: number; draft: RecipeFutureDraft; futurePlanStrategy: "keep" | "replace_all"; impactToken: string; imageObjectId: string | null }, idempotencyKey = crypto.randomUUID()) {
  return request<{ id: string; revision: number }>(`/api/v1/recipes/${recipeId}`, { method: "PATCH", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ base_recipe_revision: input.baseRecipeRevision, draft: input.draft, future_plan_strategy: input.futurePlanStrategy, impact_token: input.impactToken, image_object_id: input.imageObjectId }) });
}
