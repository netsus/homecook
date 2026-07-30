const OAUTH_CALLBACK_PATH = "/auth/callback";

function resolveHttpOrigin(rawUrl: string | null | undefined) {
  const trimmed = rawUrl?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function resolveConfiguredAppOrigin() {
  return (
    resolveHttpOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    resolveHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  );
}

export function buildOAuthCallbackUrl(currentOrigin: string) {
  const origin =
    resolveConfiguredAppOrigin() ??
    resolveHttpOrigin(currentOrigin) ??
    currentOrigin;

  return new URL(OAUTH_CALLBACK_PATH, origin).toString();
}
