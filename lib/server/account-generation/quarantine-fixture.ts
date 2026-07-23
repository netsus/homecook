import { cookies } from "next/headers";

import type {
  AccountQuarantineGateState,
} from "@/components/auth/account-quarantine-screen";
import type {
  AccountQuarantineGateResult,
} from "@/lib/server/account-generation/quarantine-gate";

const QUARANTINE_FIXTURE_COOKIE =
  "homecook.qa-account-quarantine-state";
const E2E_AUTH_OVERRIDE_COOKIE = "homecook.e2e-auth-override";
const FIXTURE_STATES = new Set<AccountQuarantineGateState>([
  "loading",
  "auth-present",
  "auth-absent",
  "maintenance",
  "pending",
  "replay",
  "cleanup-pending",
  "conflict",
  "unauthorized",
  "error",
]);

function isQaFixtureModeEnabled() {
  return process.env.NODE_ENV !== "production"
    && process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1";
}

export async function readQaFixtureAccountQuarantineGate():
Promise<AccountQuarantineGateResult | null> {
  if (!isQaFixtureModeEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const fixtureState = cookieStore.get(QUARANTINE_FIXTURE_COOKIE)?.value;
  if (
    fixtureState
    && FIXTURE_STATES.has(fixtureState as AccountQuarantineGateState)
  ) {
    return {
      state: fixtureState as AccountQuarantineGateState,
      hasSession: fixtureState !== "unauthorized",
    };
  }

  const authOverride = cookieStore.get(E2E_AUTH_OVERRIDE_COOKIE)?.value;
  return authOverride === "authenticated" || authOverride === "guest"
    ? { state: "not-applicable", hasSession: false }
    : null;
}
