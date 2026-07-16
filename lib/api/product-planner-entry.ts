import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  ProductPlannerEntryCreateBody,
  ProductPlannerEntryData,
  ProductPlannerEntryDeleteData,
  ProductPlannerEntryPatchBody,
} from "@/types/product-planner-entry";

export interface ProductPlannerEntryApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createApiError(response: Response, payload: ApiResponse<unknown> | null) {
  const error = new Error(
    payload?.error?.message ?? "완제품 계획 요청을 처리하지 못했어요.",
  ) as ProductPlannerEntryApiError;
  error.status = response.status;
  error.code = payload?.error?.code ?? "UNKNOWN_ERROR";
  error.fields = payload?.error?.fields ?? [];
  return error;
}

async function requestEntry<T>(path: string, init: RequestInit) {
  const response = await fetch(path, withE2EAuthOverrideHeaders(init));
  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    const error = new Error("서버 응답을 해석하지 못했어요.") as ProductPlannerEntryApiError;
    error.status = response.status;
    error.code = "INVALID_RESPONSE";
    error.fields = [];
    throw error;
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createApiError(response, payload);
  }

  return payload.data;
}

export function isProductPlannerEntryApiError(
  error: unknown,
): error is ProductPlannerEntryApiError {
  return Boolean(
    error instanceof Error &&
      "status" in error &&
      "code" in error &&
      "fields" in error,
  );
}

export async function createProductPlannerEntry(body: ProductPlannerEntryCreateBody) {
  const data = await requestEntry<{ entry: ProductPlannerEntryData }>(
    "/api/v1/product-planner-entries",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return data.entry;
}

export async function updateProductPlannerEntryQuantity(
  entryId: string,
  body: ProductPlannerEntryPatchBody,
) {
  const data = await requestEntry<{ entry: ProductPlannerEntryData }>(
    `/api/v1/product-planner-entries/${entryId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return data.entry;
}

export async function deleteProductPlannerEntry(entryId: string) {
  return requestEntry<ProductPlannerEntryDeleteData>(
    `/api/v1/product-planner-entries/${entryId}`,
    { method: "DELETE" },
  );
}
