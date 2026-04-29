import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  RecipeBookCreateData,
  RecipeBookDeleteData,
  RecipeBookListData,
  RecipeBookUpdateData,
} from "@/types/recipe";
import type { ShoppingListHistoryData } from "@/types/shopping";

export interface UserProfileData {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  social_provider: "kakao" | "naver" | "google";
  settings: {
    screen_wake_lock: boolean;
  };
}

export interface MypageApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createMypageApiError({
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
  const error = new Error(message) as MypageApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;

  return error;
}

async function requestMypage<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createMypageApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createMypageApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export function isMypageApiError(error: unknown): error is MypageApiError {
  return error instanceof Error && "status" in error && "code" in error;
}

export async function fetchUserProfile() {
  return requestMypage<UserProfileData>("/api/v1/users/me");
}

export async function fetchRecipeBooks() {
  return requestMypage<RecipeBookListData>("/api/v1/recipe-books");
}

export async function createRecipeBook(name: string) {
  return requestMypage<RecipeBookCreateData>("/api/v1/recipe-books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function renameRecipeBook(bookId: string, name: string) {
  return requestMypage<RecipeBookUpdateData>(`/api/v1/recipe-books/${bookId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteRecipeBook(bookId: string) {
  return requestMypage<RecipeBookDeleteData>(`/api/v1/recipe-books/${bookId}`, {
    method: "DELETE",
  });
}

export async function fetchShoppingHistory(params?: {
  cursor?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();

  if (params?.cursor) {
    searchParams.set("cursor", params.cursor);
  }

  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/v1/shopping/lists?${queryString}`
    : "/api/v1/shopping/lists";

  return requestMypage<ShoppingListHistoryData>(url);
}
