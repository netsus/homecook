import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  PantryAddData,
  PantryBundleListData,
  PantryDeleteData,
  PantryListData,
} from "@/types/pantry";
import type { IngredientListData } from "@/types/recipe";

export interface PantryApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createPantryApiError({
  status,
  code,
  fields,
  message,
}: {
  status: number;
  code: string;
  fields: ApiError["fields"];
  message: string;
}) {
  const error = new Error(message) as PantryApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;

  return error;
}

async function requestPantry<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createPantryApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createPantryApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export function isPantryApiError(error: unknown): error is PantryApiError {
  if (!(error instanceof Error)) {
    return false;
  }

  return "status" in error && "code" in error && "fields" in error;
}

export async function fetchPantryList(params?: { q?: string; category?: string }) {
  const searchParams = new URLSearchParams();

  if (params?.q) {
    searchParams.set("q", params.q);
  }

  if (params?.category) {
    searchParams.set("category", params.category);
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/v1/pantry?${queryString}` : "/api/v1/pantry";

  return requestPantry<PantryListData>(url);
}

export async function addPantryItems(ingredientIds: string[]) {
  return requestPantry<PantryAddData>("/api/v1/pantry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ingredient_ids: ingredientIds }),
  });
}

export async function deletePantryItems(ingredientIds: string[]) {
  return requestPantry<PantryDeleteData>("/api/v1/pantry", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ingredient_ids: ingredientIds }),
  });
}

export async function fetchPantryBundles() {
  return requestPantry<PantryBundleListData>("/api/v1/pantry/bundles");
}

export async function fetchIngredients(params?: { q?: string; category?: string }) {
  const searchParams = new URLSearchParams();

  if (params?.q) {
    searchParams.set("q", params.q);
  }

  if (params?.category) {
    searchParams.set("category", params.category);
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/v1/ingredients?${queryString}` : "/api/v1/ingredients";

  return requestPantry<IngredientListData>(url);
}
