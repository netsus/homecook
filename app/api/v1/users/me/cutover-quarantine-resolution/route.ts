import { fail } from "@/lib/api/response";
import { recordOperationalEvent, type OperationalEventsDbClient } from "@/lib/server/admin-events";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

import {
  executeAccountQuarantineResolution,
  failClosedQuarantineResolution,
  readVerifiedAccountGenerationReplaySession,
  readVerifiedAccountGenerationSession,
} from "../_account-generation-active";
import {
  createAccountLifecycleMaintenanceResponse,
  createCapabilityUnavailableResponse,
  createLegacyHiddenResponse,
  parseQuarantineResolutionRequest,
  readAccountGenerationCapability,
  readRequiredIdempotencyKey,
} from "../_account-generation";

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    const verifiedReplaySession =
      await readVerifiedAccountGenerationReplaySession(routeClient);
    if (!verifiedReplaySession.ok) {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  const serviceRoleClient = createServiceRoleClient();
  if (!serviceRoleClient) {
    if (user) {
      await recordOperationalEvent(null, {
        event_type: "account_quarantine_resolution_failure",
        severity: "critical",
        source: "account",
        actor_user_id: user.id,
        target_user_id: user.id,
        request,
        http_status: 500,
        error_code: "ACCOUNT_QUARANTINE_CONFIGURATION_ERROR",
        message_summary: "Account quarantine resolution service role is unavailable",
      });
    }

    return fail("INTERNAL_ERROR", "계정 복구를 처리하지 못했어요.", 500);
  }

  const capability = await readAccountGenerationCapability(serviceRoleClient);
  if (!capability.ok) {
    return createCapabilityUnavailableResponse();
  }

  if (capability.state === "legacy") {
    return createLegacyHiddenResponse();
  }

  if (capability.state === "cutover_maintenance") {
    return createAccountLifecycleMaintenanceResponse();
  }

  if (!user) {
    return fail(
      "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED",
      "고객 지원을 통한 계정 복구가 필요해요.",
      409,
    );
  }

  const idempotencyKey = readRequiredIdempotencyKey(request);
  if (!idempotencyKey.ok) {
    return idempotencyKey.response;
  }

  const parsedRequest = await parseQuarantineResolutionRequest(request);
  if (!parsedRequest.ok) {
    return parsedRequest.response;
  }

  const verifiedSession = await readVerifiedAccountGenerationSession(routeClient);
  if (!verifiedSession.ok) {
    return failClosedQuarantineResolution({
      action: parsedRequest.action,
      dbClient: serviceRoleClient as unknown as OperationalEventsDbClient,
      request,
      userId: user.id,
    });
  }

  return executeAccountQuarantineResolution({
    action: parsedRequest.action,
    dbClient: serviceRoleClient,
    idempotencyKey: idempotencyKey.idempotencyKey,
    nickname: parsedRequest.nickname,
    request,
    sessionAuthority: verifiedSession.sessionAuthority,
  });
}
