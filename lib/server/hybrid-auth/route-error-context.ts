import { AsyncLocalStorage } from "node:async_hooks";

export type HybridAuthorityPublicCode =
  | "ACCOUNT_LIFECYCLE_MAINTENANCE"
  | "ACCOUNT_SESSION_STALE";

interface HybridAuthorityResponseStore {
  failure: HybridAuthorityPublicCode | null;
}

const hybridAuthorityResponseStorage =
  new AsyncLocalStorage<HybridAuthorityResponseStore>();

export function beginHybridAuthorityResponseBoundary() {
  hybridAuthorityResponseStorage.enterWith({ failure: null });
}

export function recordHybridAuthorityFailure(
  failure: HybridAuthorityPublicCode,
) {
  const store = hybridAuthorityResponseStorage.getStore();
  if (store && !store.failure) {
    store.failure = failure;
  }
}

export function consumeHybridAuthorityFailure() {
  const store = hybridAuthorityResponseStorage.getStore();
  const failure = store?.failure ?? null;
  if (store) {
    store.failure = null;
  }
  return failure;
}

export async function recordHybridAuthorityFailureResponse(
  response: Response,
) {
  if (response.status !== 409 && response.status !== 503) {
    return response;
  }

  const marker = response.headers.get("x-homecook-hybrid-authority-error");
  if (marker?.includes("ACCOUNT_LIFECYCLE_MAINTENANCE")) {
    recordHybridAuthorityFailure("ACCOUNT_LIFECYCLE_MAINTENANCE");
    return response;
  }
  if (marker?.includes("ACCOUNT_SESSION_STALE")) {
    recordHybridAuthorityFailure("ACCOUNT_SESSION_STALE");
    return response;
  }

  try {
    const body = await response.clone().json() as {
      code?: unknown;
      error?: { code?: unknown };
    };
    const code = body.code ?? body.error?.code;
    if (
      code === "ACCOUNT_LIFECYCLE_MAINTENANCE"
      || code === "ACCOUNT_SESSION_STALE"
    ) {
      recordHybridAuthorityFailure(code);
    }
  } catch {
    // A non-JSON 409/503 is not a hybrid authority contract response.
  }

  return response;
}
