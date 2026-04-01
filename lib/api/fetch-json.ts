import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));
  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? "요청을 처리하지 못했어요.");
  }

  return json.data;
}
