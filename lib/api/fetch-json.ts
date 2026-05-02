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

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, withQaFixtureOverrideHeaders(init));
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
}
