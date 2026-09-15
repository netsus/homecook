import { fail } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { createCookedBatchInternalClient, createRouteHandlerClient } from "@/lib/supabase/server";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";

export async function authorizeMealLogRequest() {
  const routeClient = await createRouteHandlerClient();
  const auth = await routeClient.auth.getUser();
  const user = auth.data.user;
  if (!user) return { ok: false as const, response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401) };
  try {
    const bootstrapClient = routeClient as unknown as UserBootstrapDbClient;
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (error) {
    return {
      ok: false as const,
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(error, "식사 기록을 준비하지 못했어요."),
        500,
      ),
    };
  }
  const verified = await readVerifiedAccountGenerationSession(routeClient);
  if (!verified.ok || verified.sessionAuthority.ownerUuid !== user.id) {
    return { ok: false as const, response: fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409) };
  }
  const client = createCookedBatchInternalClient();
  if (!client) return { ok: false as const, response: fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500) };
  return { ok: true as const, client, authorityArgs: buildSessionAuthorityRpcArgs(verified.sessionAuthority) };
}

export async function readMealLogJson(request: Request) {
  try { return { ok: true as const, value: await request.json() as unknown }; }
  catch { return { ok: false as const, response: fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_json" }]) }; }
}
