export const POST_AUTH_NEXT_COOKIE = "homecook-post-auth-next";

export function createPostAuthNextCookie(nextPath: string) {
  return `${POST_AUTH_NEXT_COOKIE}=${encodeURIComponent(nextPath)}; Path=/; Max-Age=600; SameSite=Lax`;
}

export function parsePostAuthNextCookie(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}
