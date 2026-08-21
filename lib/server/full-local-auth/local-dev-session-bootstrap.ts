import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import {
  bootstrapAuthCallbackAccountGenerationIdentity,
  readAuthCallbackAccountGenerationCapability,
} from "@/lib/server/account-generation/auth-callback";
import {
  prepareFullLocalSessionAuthority,
  recordFullLocalSessionAuthority,
} from "@/lib/server/full-local-auth/session-authority";
import { getAuthAuthority } from "@/lib/supabase/auth-env";
import {
  createAuthCallbackOperationsClient,
  createAuthRouteHandlerClient,
} from "@/lib/supabase/server";

export type LocalDevSessionBootstrapResult =
  | { ok: true }
  | {
      ok: false;
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE" | "ACCOUNT_SESSION_STALE";
      message: string;
    };

function staleResult(): LocalDevSessionBootstrapResult {
  return {
    ok: false,
    code: "ACCOUNT_SESSION_STALE",
    message: "로컬 세션 준비를 완료하지 못했어요. 다시 로그인해 주세요.",
  };
}

function maintenanceResult(): LocalDevSessionBootstrapResult {
  return {
    ok: false,
    code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    message: "로컬 세션 준비가 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
  };
}

export async function bootstrapLocalDevSessionAuthority(): Promise<LocalDevSessionBootstrapResult> {
  if (!isLocalDevAuthEnabled() || getAuthAuthority() !== "local") {
    return staleResult();
  }

  const routeClient = await createAuthRouteHandlerClient();
  const sessionResult = await routeClient.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  if (sessionResult.error || !accessToken) {
    return staleResult();
  }

  const authResult = await routeClient.auth.getUser(accessToken);
  const user = authResult.data.user;
  if (authResult.error || !user || typeof user.created_at !== "string") {
    return staleResult();
  }

  const serviceRoleClient = createAuthCallbackOperationsClient();
  if (!serviceRoleClient) {
    return maintenanceResult();
  }

  const capability = await readAuthCallbackAccountGenerationCapability(
    serviceRoleClient,
  );
  if (!capability.ok) {
    return maintenanceResult();
  }
  if (capability.state !== "generation_active") {
    return capability.state === "cutover_maintenance"
      ? maintenanceResult()
      : staleResult();
  }

  const prepared = await prepareFullLocalSessionAuthority({
    accessToken,
    client: serviceRoleClient,
    user,
  });
  if (!prepared.ok) {
    return prepared.reason === "maintenance"
      ? maintenanceResult()
      : staleResult();
  }

  const bootstrap = await bootstrapAuthCallbackAccountGenerationIdentity(
    serviceRoleClient,
    prepared.accountBootstrap,
  );
  if (!bootstrap.ok) {
    return staleResult();
  }

  const recorded = await recordFullLocalSessionAuthority({
    client: serviceRoleClient,
    record: prepared.record,
  });
  if (!recorded.ok) {
    return staleResult();
  }

  return { ok: true };
}
