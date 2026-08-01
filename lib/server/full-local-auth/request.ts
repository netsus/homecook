const WINDOW_MS = 60_000;
const MAX_STARTS_PER_WINDOW = 10;
const startsByClient = new Map<string, { count: number; windowStartedAt: number }>();

export function isSameOriginPost(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

export function consumeAuthFlowStartLimit(request: Request, now = Date.now()) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const current = startsByClient.get(forwarded);
  if (startsByClient.size >= 10_000 && !current) {
    for (const [key, value] of startsByClient) {
      if (now - value.windowStartedAt >= WINDOW_MS) {
        startsByClient.delete(key);
      }
    }
    if (startsByClient.size >= 10_000) {
      return false;
    }
  }
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    startsByClient.set(forwarded, { count: 1, windowStartedAt: now });
    return true;
  }
  if (current.count >= MAX_STARTS_PER_WINDOW) {
    return false;
  }
  current.count += 1;
  return true;
}
