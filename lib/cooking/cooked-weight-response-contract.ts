/** Display-format opt-in only. Never a consent or write-authority signal. */
export const COOKED_WEIGHT_RESPONSE_HEADER = "X-Homecook-Cooked-Weight-Contract";
export const COOKED_WEIGHT_RESPONSE_VERSION = "evidence-v1";

export function wantsCookedWeightEvidence(request: Request): boolean {
  return request.headers.get(COOKED_WEIGHT_RESPONSE_HEADER) === COOKED_WEIGHT_RESPONSE_VERSION;
}

export function cookedWeightResponseHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set(COOKED_WEIGHT_RESPONSE_HEADER, COOKED_WEIGHT_RESPONSE_VERSION);
  return headers;
}
