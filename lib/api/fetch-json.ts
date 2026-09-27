import { withQaFixtureOverrideHeaders } from "@/lib/mock/qa-fixture-overrides";
import type { ApiError, ApiResponse } from "@/types/api";

export class ApiFetchError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];

  constructor({
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
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function isApiFetchError(error: unknown): error is ApiFetchError {
  return error instanceof ApiFetchError;
}

// Some GETs (including recipe detail view counts) have side effects.
const RETRYABLE_READ_PATHS = new Set([
  "/api/v1/recipes", "/api/v1/recipes/themes", "/api/v1/ingredients",
  "/api/v1/tags", "/api/v1/cooking-methods",
]);

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const isRead = (init?.method ?? "GET").toUpperCase() === "GET";
  const canRetry = isRead && RETRYABLE_READ_PATHS.has(input.split(/[?#]/u)[0]);
  for (let attempt = 0; ; attempt += 1) {
    // Reads get a deadline; only explicitly safe reads get a second attempt.
    const timeout = isRead ? AbortSignal.timeout(10_000) : null;
    const signal = timeout
      ? init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
      : init?.signal;
    try {
      const response = await fetch(input, withQaFixtureOverrideHeaders({ ...init, signal }));
      if ([502, 503, 504].includes(response.status)) {
        const failure = await response.json().catch(() => null) as ApiResponse<T> | null;
        throw new ApiFetchError({ status: response.status, code: failure?.error?.code ?? "SERVICE_UNAVAILABLE", fields: failure?.error?.fields ?? [],
          message: "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요." });
      }
      const json = (await response.json()) as ApiResponse<T>;
      if (!response.ok || !json.success || !json.data) {
        throw new ApiFetchError({
          status: response.status,
          code: json.error?.code ?? "UNKNOWN_ERROR",
          fields: json.error?.fields ?? [],
          message: json.error?.message ?? "요청을 처리하지 못했어요.",
        });
      }
      return json.data;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      const transportFailure = error instanceof TypeError
        || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
      const temporaryFailure = transportFailure
        || (isApiFetchError(error) && [502, 503, 504].includes(error.status));
      if (canRetry && attempt === 0 && temporaryFailure) continue;
      if (transportFailure) {
        throw new ApiFetchError({ status: 0, code: "NETWORK_ERROR", fields: [],
          message: "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요." });
      }
      throw error;
    }
  }
}
