import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  isUuid,
  projectSnapshotV2CookModeData,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createSnapshotV2SessionInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
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

  const serviceClient = createSnapshotV2SessionInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }
  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "read_snapshot_v2_cook_mode",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_session_id: sessionId,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectSnapshotV2CookModeData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
}
