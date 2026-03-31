import type { ApiError, ApiResponse } from "@/types/api";
import type {
  PlannerColumnCreateBody,
  PlannerColumnData,
  PlannerColumnUpdateBody,
  PlannerData,
} from "@/types/planner";

interface PlannerApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createPlannerApiError({
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
  const error = new Error(message) as PlannerApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;

  return error;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, dayDelta: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);

  return formatDateKey(date);
}

async function requestPlanner<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);

  if (response.status === 204) {
    return null as T;
  }

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createPlannerApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createPlannerApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export function isPlannerApiError(error: unknown): error is PlannerApiError {
  if (!(error instanceof Error)) {
    return false;
  }

  return "status" in error && "code" in error && "fields" in error;
}

export function createDefaultPlannerRange(baseDate = new Date()) {
  const startDate = new Date(baseDate);
  startDate.setDate(startDate.getDate() - 7);

  const endDate = new Date(baseDate);
  endDate.setDate(endDate.getDate() + 7);

  return {
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(endDate),
  };
}

export function shiftPlannerRange(
  range: { startDate: string; endDate: string },
  dayDelta: number,
) {
  return {
    startDate: shiftDateKey(range.startDate, dayDelta),
    endDate: shiftDateKey(range.endDate, dayDelta),
  };
}

export async function fetchPlanner(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  return requestPlanner<PlannerData>(`/api/v1/planner?${params.toString()}`);
}

export async function createPlannerColumn(body: PlannerColumnCreateBody) {
  return requestPlanner<PlannerColumnData>("/api/v1/planner/columns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function updatePlannerColumn(
  columnId: string,
  body: PlannerColumnUpdateBody,
) {
  return requestPlanner<PlannerColumnData>(`/api/v1/planner/columns/${columnId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function deletePlannerColumn(columnId: string) {
  await requestPlanner<null>(`/api/v1/planner/columns/${columnId}`, {
    method: "DELETE",
  });
}
