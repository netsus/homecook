import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import {
  type AccountGenerationBootstrapErrorCode,
  bootstrapAuthCallbackAccountGenerationIdentity,
  readAuthCallbackAccountGenerationCapability,
} from "@/lib/server/account-generation/auth-callback";
import {
  prepareFullLocalSessionAuthority,
  recordFullLocalSessionAuthority,
} from "@/lib/server/full-local-auth/session-authority";
import { getAuthAuthority } from "@/lib/supabase/auth-env";
import {
  createLocalDevSessionBootstrapInternalClient,
  createAuthRouteHandlerClient,
} from "@/lib/supabase/server";

type LocalDevSessionBootstrapErrorCode =
  | AccountGenerationBootstrapErrorCode
  | "ACCOUNT_LIFECYCLE_MAINTENANCE";

export type LocalDevSessionBootstrapResult =
  | { ok: true }
  | {
      ok: false;
      code: LocalDevSessionBootstrapErrorCode;
      message: string;
    };

const SAFE_ERROR_MESSAGES: Record<LocalDevSessionBootstrapErrorCode, string> = {
  ACCOUNT_CUTOVER_QUARANTINED: "계정 복구가 필요해요.",
  ACCOUNT_CUTOVER_UNCLASSIFIED: "계정 상태를 다시 확인해 주세요.",
  ACCOUNT_DELETING: "계정 삭제가 진행 중이에요.",
  ACCOUNT_DELETION_PENDING: "계정 삭제를 마무리하고 있어요.",
  ACCOUNT_GENERATION_STALE: "계정 상태를 다시 확인해 주세요.",
  ACCOUNT_LIFECYCLE_MAINTENANCE:
    "로컬 세션 준비가 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
  ACCOUNT_SESSION_STALE:
    "로컬 세션 준비를 완료하지 못했어요. 다시 로그인해 주세요.",
};

function failResult(
  code: LocalDevSessionBootstrapErrorCode,
): LocalDevSessionBootstrapResult {
  return {
    ok: false,
    code,
    message: SAFE_ERROR_MESSAGES[code],
  };
}

function maintenanceResult(): LocalDevSessionBootstrapResult {
  return failResult("ACCOUNT_LIFECYCLE_MAINTENANCE");
}

function staleResult(): LocalDevSessionBootstrapResult {
  return failResult("ACCOUNT_SESSION_STALE");
}

export async function bootstrapLocalDevSessionAuthority(): Promise<LocalDevSessionBootstrapResult> {
  let authAuthority: ReturnType<typeof getAuthAuthority>;
  try {
    authAuthority = getAuthAuthority();
  } catch {
    return maintenanceResult();
  }

  if (!isLocalDevAuthEnabled() || authAuthority !== "local") {
    return staleResult();
  }

  let accessToken: string | undefined;
  let user:
    | {
        id: string;
        created_at?: string;
      }
    | null
    | undefined;
  try {
    const routeClient = await createAuthRouteHandlerClient();
    const sessionResult = await routeClient.auth.getSession();
    accessToken = sessionResult.data.session?.access_token;
    if (sessionResult.error || !accessToken) {
      return staleResult();
    }

    const authResult = await routeClient.auth.getUser(accessToken);
    user = authResult.data.user;
    if (authResult.error || !user || typeof user.created_at !== "string") {
      return staleResult();
    }
  } catch {
    return staleResult();
  }

  let serviceRoleClient: ReturnType<
    typeof createLocalDevSessionBootstrapInternalClient
  >;
  try {
    serviceRoleClient = createLocalDevSessionBootstrapInternalClient();
  } catch {
    return maintenanceResult();
  }
  if (!serviceRoleClient) {
    return maintenanceResult();
  }

  let capability: Awaited<
    ReturnType<typeof readAuthCallbackAccountGenerationCapability>
  >;
  try {
    capability = await readAuthCallbackAccountGenerationCapability(
      serviceRoleClient,
    );
  } catch {
    return maintenanceResult();
  }
  if (!capability.ok) {
    return maintenanceResult();
  }
  if (capability.state !== "generation_active") {
    return capability.state === "cutover_maintenance"
      ? maintenanceResult()
      : staleResult();
  }

  let prepared: Awaited<ReturnType<typeof prepareFullLocalSessionAuthority>>;
  try {
    prepared = await prepareFullLocalSessionAuthority({
      accessToken,
      client: serviceRoleClient,
      user,
    });
  } catch {
    return maintenanceResult();
  }
  if (!prepared.ok) {
    return prepared.reason === "maintenance"
      ? maintenanceResult()
      : staleResult();
  }

  let bootstrap: Awaited<
    ReturnType<typeof bootstrapAuthCallbackAccountGenerationIdentity>
  >;
  try {
    bootstrap = await bootstrapAuthCallbackAccountGenerationIdentity(
      serviceRoleClient,
      prepared.accountBootstrap,
    );
  } catch {
    return maintenanceResult();
  }
  if (!bootstrap.ok) {
    return bootstrap.errorCode ? failResult(bootstrap.errorCode) : staleResult();
  }

  let recorded: Awaited<ReturnType<typeof recordFullLocalSessionAuthority>>;
  try {
    recorded = await recordFullLocalSessionAuthority({
      client: serviceRoleClient,
      record: prepared.record,
    });
  } catch {
    return maintenanceResult();
  }
  if (!recorded.ok) {
    return staleResult();
  }

  return { ok: true };
}
