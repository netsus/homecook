import {
  normalizeAuthProviderId,
  type AuthProviderId,
} from "@/lib/auth/providers";

export const AUTH_PROVIDER_ATTEMPT_COOKIE = "homecook-auth-provider-attempt";
export const LAST_AUTH_PROVIDER_COOKIE = "homecook-last-auth-provider";

const TEN_MINUTES_SECONDS = 60 * 10;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface CookieResponse {
  cookies: {
    set(
      name: string,
      value: string,
      options: {
        maxAge: number;
        path: string;
        sameSite: "lax";
      },
    ): void;
  };
}

export function createAuthProviderAttemptCookie(provider: AuthProviderId) {
  return [
    `${AUTH_PROVIDER_ATTEMPT_COOKIE}=${provider}`,
    "Path=/",
    `Max-Age=${TEN_MINUTES_SECONDS}`,
    "SameSite=Lax",
  ].join("; ");
}

export function parseAuthProviderCookie(value?: string | null) {
  return normalizeAuthProviderId(value);
}

export function clearAuthProviderAttemptCookie<T extends CookieResponse>(response: T) {
  response.cookies.set(AUTH_PROVIDER_ATTEMPT_COOKIE, "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });

  return response;
}

export function setLastAuthProviderCookie<T extends CookieResponse>(
  response: T,
  provider: AuthProviderId,
) {
  response.cookies.set(LAST_AUTH_PROVIDER_COOKIE, provider, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
