/** Invalidate views after an acknowledged mutation; no food data is cached here. */
export const COOKED_BATCH_CHANGED_EVENT = "homecook:cooked-batch-changed";

export function notifyCookedBatchChanged(batchId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOKED_BATCH_CHANGED_EVENT, { detail: { batchId } }));
  }
}

export function readChangedCookedBatchId(event: Event): string | null {
  const id = (event as CustomEvent<{ batchId?: unknown }>).detail?.batchId;
  return typeof id === "string" && id.length > 0 ? id : null;
}
