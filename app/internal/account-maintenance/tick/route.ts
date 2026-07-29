import { fail, ok } from "@/lib/api/response";
import { createRecipeImageStorageMaintenancePhases } from
  "@/lib/account-maintenance/recipe-image-storage-phases";
import {
  isMaintenanceWorkerAuthorized,
  runAccountMaintenanceTick,
} from "@/lib/account-maintenance/tick";
import { createManagedRecipeImageStorageAdapter } from
  "@/lib/server/recipe-image-managed-storage";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MANAGED_READ_URL_TTL_SECONDS = 300;
const MANAGED_TAKEOVER_READ_TIMEOUT_MS = 10_000;

function createAccountMaintenanceDependencies() {
  let serviceRoleClient;
  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return null;
  }
  if (!serviceRoleClient) {
    return null;
  }

  const storageAdapter = createManagedRecipeImageStorageAdapter({
    client: serviceRoleClient,
    signedUrlTtlSeconds: MANAGED_READ_URL_TTL_SECONDS,
    takeoverReadTimeoutMs: MANAGED_TAKEOVER_READ_TIMEOUT_MS,
  });

  return createRecipeImageStorageMaintenancePhases({
    dbClient: serviceRoleClient,
    storage: {
      checkObjectPresence: storageAdapter.checkObjectPresence,
      deleteObject: storageAdapter.deleteObject,
    },
  });
}

export async function POST(request: Request) {
  const configuredSecret =
    process.env.HOMECOOK_MAINTENANCE_WORKER_SECRET;

  if (!configuredSecret) {
    return fail(
      "INTERNAL_ERROR",
      "Maintenance worker authentication is unavailable.",
      503,
    );
  }

  if (
    !isMaintenanceWorkerAuthorized(
      request.headers.get("authorization"),
      configuredSecret,
    )
  ) {
    return fail("UNAUTHORIZED", "Unauthorized.", 401);
  }

  const dependencies = createAccountMaintenanceDependencies();
  if (!dependencies) {
    return fail(
      "INTERNAL_ERROR",
      "Maintenance worker configuration is unavailable.",
      503,
    );
  }

  const result = await runAccountMaintenanceTick(dependencies);

  return ok({
    feature_state: result.featureState,
    status: result.status,
    blocked_at: result.blockedAt,
    phases: result.phases,
  });
}
