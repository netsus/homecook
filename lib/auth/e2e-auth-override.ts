import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";

export const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
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
