import { LAST_AUTH_PROVIDER_COOKIE } from "@/lib/auth/provider-cookies";
import { normalizeAuthProviderId, type AuthProviderId } from "@/lib/auth/providers";

export const LAST_AUTH_PROVIDER_KEY = "homecook:last-auth-provider:v1";

function readCookie() {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LAST_AUTH_PROVIDER_COOKIE}=`))
    ?.slice(LAST_AUTH_PROVIDER_COOKIE.length + 1);
  const provider = normalizeAuthProviderId(raw ? decodeURIComponent(raw) : null);
  if (raw && !provider) clearCompatibilityCookie();
  return provider;
}

function clearCompatibilityCookie() {
  if (typeof document !== "undefined") {
    document.cookie = `${LAST_AUTH_PROVIDER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

export function readLastAuthProvider(): AuthProviderId | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_AUTH_PROVIDER_KEY);
  const local = normalizeAuthProviderId(raw);
  if (raw && !local) window.localStorage.removeItem(LAST_AUTH_PROVIDER_KEY);
  if (local) return local;
  const cookie = readCookie();
  if (cookie) window.localStorage.setItem(LAST_AUTH_PROVIDER_KEY, cookie);
  return cookie;
}

export function syncLastAuthProviderFromCookie(): AuthProviderId | null {
  const provider = readCookie();
  if (provider && typeof window !== "undefined") {
    window.localStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider);
  }
  return provider;
}

export function clearLastAuthProvider() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LAST_AUTH_PROVIDER_KEY);
  clearCompatibilityCookie();
}
