import type { CookedBatchProjection } from "@/types/cooking";

export type CookedBatchAction =
  | "set_finished_weight"
  | "mark_unrecoverable"
  | "discard"
  | "adjust"
  | "close"
  | "cancel_current";

export type CookedBatchMutationRequest =
  | { action: "set_finished_weight"; finished_weight_g: number; expected_revision: number }
  | { action: "mark_unrecoverable"; expected_revision: number }
  | { action: "discard"; discarded_g: number; reason: string; expected_revision: number }
  | { action: "adjust"; delta_g: number; reason: string; expected_revision: number }
  | { action: "close"; closure_reason: "consumed" | "discarded" | "mixed"; expected_revision: number }
  | { action: "cancel_current"; reverses_event_id: string; expected_revision: number };

export interface CookedBatchOperation {
  fingerprint: string;
  key: string;
}

export const DEPLETED_REASON_LABELS = {
  consumed: "다 먹음",
  discarded: "모두 버림",
  mixed: "먹음·버림으로 소진",
  consumed_unweighed: "무게 없이 다 먹음",
  discarded_unweighed: "무게 없이 모두 버림",
  mixed_unweighed: "무게 없이 먹고 버림",
} as const;

export function mergeCookedBatchPages(
  current: CookedBatchProjection[],
  next: CookedBatchProjection[],
) {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...next.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export function nextCookedBatchOperation(
  current: CookedBatchOperation | null,
  request: CookedBatchMutationRequest,
): CookedBatchOperation {
  const fingerprint = JSON.stringify(stableValue(request));
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, key: crypto.randomUUID() };
}

export function getCookedBatchActions(batch: CookedBatchProjection): CookedBatchAction[] {
  if (batch.revision === null || batch.batch_status === null || batch.weight_status === null) {
    return [];
  }
  if (batch.batch_status === "depleted") {
    return batch.current_unweighed_closure_event_id ? ["cancel_current"] : [];
  }
  if (batch.weight_status === "known") return ["adjust", "discard"];
  if (batch.weight_status === "missing") {
    return ["set_finished_weight", "mark_unrecoverable", "close"];
  }
  return ["close"];
}
