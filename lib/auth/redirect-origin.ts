const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function readPublicAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return value && value.length > 0 ? value : null;
}

function normalizeRedirectOrigin(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (!HTTP_PROTOCOLS.has(url.protocol)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAuthRedirectOrigin(requestUrl: URL) {
  return normalizeRedirectOrigin(readPublicAppUrl())
    ?? normalizeRedirectOrigin(requestUrl.origin)
    ?? "http://localhost:3000";
}

export function buildSameAppRedirectUrl(pathname: string, requestUrl: URL) {
  return new URL(pathname, resolveAuthRedirectOrigin(requestUrl));
}
