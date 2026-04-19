import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";

export const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
export const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
export const E2E_AUTH_OVERRIDE_HEADER = "x-homecook-e2e-auth";

export type E2EAuthOverrideState = "authenticated" | "guest";

function normalizeE2EAuthOverride(
  value: string | null | undefined,
): E2EAuthOverrideState | null {
  if (value === "authenticated" || value === "guest") {
    return value;
  }

  return null;
}

export function readE2EAuthOverrideState() {
  if (typeof window === "undefined" || !isQaFixtureClientModeEnabled()) {
    return null;
  }

  return normalizeE2EAuthOverride(window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY));
}

export function readE2EAuthOverride() {
  const value = readE2EAuthOverrideState();

  if (value === "authenticated") {
    return true;
  }

  if (value === "guest") {
    return false;
  }

  return null;
}

export function readE2EAuthOverrideHeader(headers: Headers) {
  return normalizeE2EAuthOverride(headers.get(E2E_AUTH_OVERRIDE_HEADER));
}

export function readE2EAuthOverrideCookie(cookieStore: {
  get(name: string): { value: string } | undefined;
} | null | undefined) {
  if (!isQaFixtureClientModeEnabled() || !cookieStore) {
    return null;
  }

  return normalizeE2EAuthOverride(cookieStore.get(E2E_AUTH_OVERRIDE_COOKIE)?.value);
}

function writeE2EAuthOverrideCookie(override: E2EAuthOverrideState | null) {
  if (typeof document === "undefined") {
    return;
  }

  if (!override) {
    document.cookie = `${E2E_AUTH_OVERRIDE_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    return;
  }

  document.cookie = `${E2E_AUTH_OVERRIDE_COOKIE}=${override}; path=/; SameSite=Lax`;
}

export function persistE2EAuthOverrideState(override: E2EAuthOverrideState | null) {
  if (typeof window !== "undefined") {
    if (override) {
      window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, override);
    } else {
      window.localStorage.removeItem(E2E_AUTH_OVERRIDE_KEY);
    }
  }

  writeE2EAuthOverrideCookie(override);
}

export function withE2EAuthOverrideHeaders(init?: RequestInit): RequestInit {
  if (!isQaFixtureClientModeEnabled()) {
    return init ?? {};
  }

  const override = readE2EAuthOverrideState();

  if (!override) {
    return init ?? {};
  }

  const headers = new Headers(init?.headers);
  headers.set(E2E_AUTH_OVERRIDE_HEADER, override);

  return {
    ...init,
    headers,
  };
}
