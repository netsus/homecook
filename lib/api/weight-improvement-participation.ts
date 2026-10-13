import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import { isParticipationRecord, isWeightImprovementParticipation } from "@/lib/weight-improvement-participation";
import type { WeightImprovementMutation } from "@/types/weight-improvement-participation";

export interface WeightImprovementApiError extends Error { code: string; status: number; }
export function isWeightImprovementApiError(error: unknown): error is WeightImprovementApiError {
  return error instanceof Error && "code" in error && typeof error.code === "string" && "status" in error && typeof error.status === "number";
}
const endpoint = "/api/v1/users/me/weight-improvement-participation";
async function request(init?: RequestInit) {
  const response = await fetch(endpoint, withE2EAuthOverrideHeaders({ cache: "no-store", ...init }));
  const payload: unknown = await response.json();
  if (response.ok && isParticipationRecord(payload) && payload.success === true && isWeightImprovementParticipation(payload.data)) return payload.data;
  const error = isParticipationRecord(payload) && isParticipationRecord(payload.error) ? payload.error : null;
  throw Object.assign(new Error(typeof error?.message === "string" ? error.message : "참여 정보를 확인하지 못했어요."), {
    code: typeof error?.code === "string" ? error.code : "INVALID_RESPONSE", status: response.status,
  });
}
export function fetchWeightImprovementParticipation() { return request(); }
export function mutateWeightImprovementParticipation(input: WeightImprovementMutation, key: string) {
  return request({ method: "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) });
}
