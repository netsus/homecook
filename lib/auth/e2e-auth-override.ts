export const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

export function readE2EAuthOverride() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY);

  if (value === "authenticated") {
    return true;
  }

  if (value === "guest") {
    return false;
  }

  return null;
}
