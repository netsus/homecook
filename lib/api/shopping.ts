import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  ShoppingListCreateBody,
  ShoppingListDetail,
  ShoppingListItemSummary,
  ShoppingListItemUpdateBody,
  ShoppingListReorderBody,
  ShoppingListReorderData,
  ShoppingListSummary,
  ShoppingPreviewData,
  ShoppingShareTextData,
} from "@/types/shopping";

export interface ShoppingApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createShoppingApiError({
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
  const error = new Error(message) as ShoppingApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;

  return error;
}

async function requestShopping<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createShoppingApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createShoppingApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export function isShoppingApiError(error: unknown): error is ShoppingApiError {
  if (!(error instanceof Error)) {
    return false;
  }

  return "status" in error && "code" in error && "fields" in error;
}

export async function fetchShoppingPreview() {
  return requestShopping<ShoppingPreviewData>("/api/v1/shopping/preview");
}

export async function createShoppingList(body: ShoppingListCreateBody) {
  return requestShopping<ShoppingListSummary>("/api/v1/shopping/lists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchShoppingListDetail(listId: string) {
  return requestShopping<ShoppingListDetail>(`/api/v1/shopping/lists/${listId}`);
}

export async function updateShoppingListItem(
  listId: string,
  itemId: string,
  body: ShoppingListItemUpdateBody,
) {
  return requestShopping<ShoppingListItemSummary>(`/api/v1/shopping/lists/${listId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function reorderShoppingListItems(listId: string, body: ShoppingListReorderBody) {
  return requestShopping<ShoppingListReorderData>(`/api/v1/shopping/lists/${listId}/items/reorder`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchShoppingShareText(listId: string) {
  return requestShopping<ShoppingShareTextData>(`/api/v1/shopping/lists/${listId}/share-text`);
}
