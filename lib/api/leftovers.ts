import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type {
  LeftoverDishStatus,
  LeftoverListData,
  LeftoverMutationData,
} from "@/types/leftover";

interface LeftoverApiError extends Error {
  status: number;
  code: string;
}

function createLeftoverApiError({
  status,
  code,
  message,
}: {
  status: number;
  code: string;
  message: string;
}) {
  const error = new Error(message) as LeftoverApiError;
  error.status = status;
  error.code = code;
  return error;
}

export function isLeftoverApiError(error: unknown): error is LeftoverApiError {
  if (!(error instanceof Error)) {
    return false;
  }

  return "status" in error && "code" in error;
}

export async function fetchLeftovers(
  status: LeftoverDishStatus = "leftover",
): Promise<LeftoverListData> {
  const params = new URLSearchParams({ status });
  const response = await fetch(
    `/api/v1/leftovers?${params.toString()}`,
    withE2EAuthOverrideHeaders(),
  );

  let payload: ApiResponse<LeftoverListData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<LeftoverListData>;
  } catch {
    throw createLeftoverApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createLeftoverApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export async function eatLeftover(
  leftoverId: string,
): Promise<LeftoverMutationData> {
  const response = await fetch(
    `/api/v1/leftovers/${leftoverId}/eat`,
    withE2EAuthOverrideHeaders({ method: "POST" }),
  );

  let payload: ApiResponse<LeftoverMutationData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<LeftoverMutationData>;
  } catch {
    throw createLeftoverApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createLeftoverApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export async function uneatLeftover(
  leftoverId: string,
): Promise<LeftoverMutationData> {
  const response = await fetch(
    `/api/v1/leftovers/${leftoverId}/uneat`,
    withE2EAuthOverrideHeaders({ method: "POST" }),
  );

  let payload: ApiResponse<LeftoverMutationData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<LeftoverMutationData>;
  } catch {
    throw createLeftoverApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createLeftoverApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}
