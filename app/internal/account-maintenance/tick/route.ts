import { fail, ok } from "@/lib/api/response";
import {
  isMaintenanceWorkerAuthorized,
  runAccountMaintenanceTick,
} from "@/lib/account-maintenance/tick";

export const runtime = "nodejs";

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

  const result = await runAccountMaintenanceTick();

  return ok({
    feature_state: result.featureState,
    status: result.status,
    blocked_at: result.blockedAt,
    phases: result.phases,
  });
}
