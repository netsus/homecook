import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  isUuid,
  projectSnapshotV2CancelData,
  readRequiredIdempotencyKey,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createRouteHandlerClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const idempotency = readRequiredIdempotencyKey(request, "Idempotency-Key");
  if (!idempotency.ok) {
    return idempotency.response;
  }

  const { id: sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const verifiedSession = await readVerifiedAccountGenerationSession(routeClient);
  if (
    !verifiedSession.ok
    || verifiedSession.sessionAuthority.ownerUuid !== user.id
  ) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "요리 세션을 취소하지 못했어요.", 500);
  }
  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "cancel_snapshot_v2_cooking_session",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_session_id: sessionId,
      p_idempotency_key: idempotency.key,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectSnapshotV2CancelData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "요리 세션을 취소하지 못했어요.", 500);
}
