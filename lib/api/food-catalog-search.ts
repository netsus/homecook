import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type { FoodProductData } from "@/types/food-product";

export type FoodCatalogSearchType = "ingredient" | "food_product";
export type FoodCatalogSearchSource = "public" | "community" | "mine";

export interface FoodCatalogIngredientData {
  type: "ingredient";
  id: string;
  standard_name: string;
  category: string;
  default_unit: string;
}

export type FoodCatalogProductData = FoodProductData & {
  type: "food_product";
};

export type FoodCatalogSearchItem =
  | FoodCatalogIngredientData
  | FoodCatalogProductData;

export interface FoodCatalogSearchData {
  items: FoodCatalogSearchItem[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface FoodCatalogSearchApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function apiError(
  response: Response,
  payload: ApiResponse<unknown> | null,
) {
  const error = new Error(
    payload?.error?.message ?? "검색 요청을 처리하지 못했어요.",
  ) as FoodCatalogSearchApiError;
  error.status = response.status;
  error.code = payload?.error?.code ?? "UNKNOWN_ERROR";
  error.fields = payload?.error?.fields ?? [];
  return error;
}

export function isFoodCatalogSearchApiError(
  error: unknown,
): error is FoodCatalogSearchApiError {
  return Boolean(
    error instanceof Error
      && "status" in error
      && "code" in error
      && "fields" in error,
  );
}

export async function fetchFoodCatalogSearch({
  cursor,
  limit = 20,
  q = "",
  source,
  types,
  signal,
}: {
  cursor?: string | null;
  limit?: number;
  q?: string;
  source?: FoodCatalogSearchSource | null;
  types: FoodCatalogSearchType[];
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    limit: String(limit),
    types: types.join(","),
  });
  if (q.trim()) params.set("q", q.trim());
  if (source) params.set("source", source);
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(
    `/api/v1/food-catalog/search?${params.toString()}`,
    withE2EAuthOverrideHeaders({ signal }),
  );
  let payload: ApiResponse<FoodCatalogSearchData> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<FoodCatalogSearchData>;
  } catch {
    const error = new Error(
      "서버 응답을 해석하지 못했어요.",
    ) as FoodCatalogSearchApiError;
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
