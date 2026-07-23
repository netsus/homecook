import type {
  AccountQuarantineGateState,
} from "@/components/auth/account-quarantine-screen";
import {
  bootstrapAuthCallbackAccountGenerationIdentity,
  readAuthCallbackAccountGenerationCapability,
} from "@/lib/server/account-generation/auth-callback";
import {
  readVerifiedAccountGenerationReplaySession,
  readVerifiedAccountGenerationSession,
} from "@/lib/server/account-generation/session-authority";
import { readQaFixtureAccountQuarantineGate } from
  "@/lib/server/account-generation/quarantine-fixture";
import {
  createServerComponentClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export interface AccountQuarantineGateResult {
  state: AccountQuarantineGateState;
  hasSession: boolean;
}

const NO_SESSION: AccountQuarantineGateResult = {
  state: "unauthorized",
  hasSession: false,
};

function mapBootstrapError(
  errorCode: string | null,
): AccountQuarantineGateState {
  if (
    errorCode === "ACCOUNT_DELETING"
    || errorCode === "ACCOUNT_DELETION_PENDING"
  ) {
    return "cleanup-pending";
  }

  if (
    errorCode === "ACCOUNT_GENERATION_STALE"
    || errorCode === "ACCOUNT_SESSION_STALE"
  ) {
    return "unauthorized";
  }

  if (errorCode === "ACCOUNT_CUTOVER_UNCLASSIFIED") {
    return "auth-absent";
  }

  return errorCode === "ACCOUNT_CUTOVER_QUARANTINED"
    ? "auth-present"
    : "error";
}

export async function readAccountQuarantineGate():
Promise<AccountQuarantineGateResult> {
  const fixtureGate = await readQaFixtureAccountQuarantineGate();
  if (fixtureGate) {
    return fixtureGate;
  }

  if (!hasSupabasePublicEnv()) {
    return {
      state: process.env.NODE_ENV === "production"
        ? "error"
        : "not-applicable",
      hasSession: false,
    };
  }

  const serviceRoleClient = createServiceRoleClient();
  if (!serviceRoleClient) {
    return { state: "error", hasSession: false };
  }

  const capability = await readAuthCallbackAccountGenerationCapability(
    serviceRoleClient,
  );
  if (!capability.ok) {
    return { state: "error", hasSession: false };
  }

  if (capability.state === "legacy") {
    return { state: "not-applicable", hasSession: false };
  }

  if (capability.state === "cutover_maintenance") {
    return { state: "maintenance", hasSession: false };
  }

  try {
    const routeClient = await createServerComponentClient();
    const sessionResult = await routeClient.auth.getSession();
    const hasSession = Boolean(
      !sessionResult.error && sessionResult.data.session?.access_token,
    );
    if (!hasSession) {
      return NO_SESSION;
    }

    const verifiedSession = await readVerifiedAccountGenerationSession(
      routeClient,
    );
    if (!verifiedSession.ok) {
      const replaySession = await readVerifiedAccountGenerationReplaySession(
        routeClient,
      );
      return replaySession.ok
        ? { state: "auth-absent", hasSession: true }
        : { state: "unauthorized", hasSession: true };
    }

    const bootstrapResult =
      await bootstrapAuthCallbackAccountGenerationIdentity(
        serviceRoleClient,
        verifiedSession.sessionAuthority,
      );
    return bootstrapResult.ok
      ? { state: "not-applicable", hasSession: true }
      : {
          state: mapBootstrapError(bootstrapResult.errorCode),
          hasSession: true,
        };
  } catch {
    return { state: "error", hasSession: false };
  }
}
