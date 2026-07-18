import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  FoodProductCreateInput,
  FoodProductData,
  FoodProductListData,
  FoodProductListSource,
  FoodProductPatchInput,
  FoodProductReportCreateInput,
} from "@/types/food-product";

export interface FoodProductApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function apiError(response: Response, payload: ApiResponse<unknown> | null) {
  const error = new Error(
    payload?.error?.message ?? "완제품 요청을 처리하지 못했어요.",
  ) as FoodProductApiError;
  error.status = response.status;
  error.code = payload?.error?.code ?? "UNKNOWN_ERROR";
  error.fields = payload?.error?.fields ?? [];
  return error;
}

async function requestFoodProduct<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, withE2EAuthOverrideHeaders(init));
  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    const error = new Error("서버 응답을 해석하지 못했어요.") as FoodProductApiError;
    error.status = response.status;
    error.code = "INVALID_RESPONSE";
    error.fields = [];
    throw error;
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw apiError(response, payload);
  }

  return payload.data;
}

export function isFoodProductApiError(error: unknown): error is FoodProductApiError {
  return Boolean(
    error instanceof Error &&
      "status" in error &&
      "code" in error &&
      "fields" in error,
  );
}

export async function fetchFoodProducts({
  cursor,
  limit = 20,
  q = "",
  source = "all",
}: {
  cursor?: string | null;
  limit?: number;
  q?: string;
  source?: FoodProductListSource;
}) {
  const params = new URLSearchParams({ limit: String(limit), source });
  if (q.trim()) params.set("q", q.trim());
  if (cursor) params.set("cursor", cursor);

  return requestFoodProduct<FoodProductListData>(
    `/api/v1/food-products?${params.toString()}`,
  );
}

export async function createFoodProduct(body: FoodProductCreateInput) {
  const data = await requestFoodProduct<{ product: FoodProductData }>(
    "/api/v1/food-products",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return data.product;
}

export async function updateFoodProduct(productId: string, body: FoodProductPatchInput) {
  const data = await requestFoodProduct<{ product: FoodProductData }>(
    `/api/v1/food-products/${productId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return data.product;
}

export async function deleteFoodProduct(productId: string) {
  return requestFoodProduct<{ deleted: true }>(`/api/v1/food-products/${productId}`, {
    method: "DELETE",
  });
}

export async function reportFoodProduct(
  productId: string,
  body: FoodProductReportCreateInput,
) {
  return requestFoodProduct<{ reported: true }>(
    `/api/v1/food-products/${productId}/report`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
