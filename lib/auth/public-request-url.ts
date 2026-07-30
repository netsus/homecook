function parseConfiguredOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolvePublicRequestUrl(
  requestUrl: URL,
  configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
) {
  const publicOrigin = parseConfiguredOrigin(configuredOrigin);
  if (!publicOrigin) {
    return requestUrl;
  }

  return new URL(
    `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`,
    publicOrigin,
  );
}
