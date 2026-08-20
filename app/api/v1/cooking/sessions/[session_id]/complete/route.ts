import { fail, ok } from "@/lib/api/response";
import {
  isUuid,
  parseCookingSessionCompleteBody,
} from "@/lib/server/cooking";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  getLegacyCookingIdempotencyPhase,
  readOptionalLegacyIdempotencyKey,
} from
  "@/lib/server/legacy-product-compat";
import {
  createRouteHandlerClient,
  createSnapshotV2SessionInternalClient,
} from "@/lib/supabase/server";
import type {
  CookingSessionCompleteBody,
  CookingSessionCompleteData,
} from "@/types/cooking";

interface RouteContext {
  params: Promise<{
    session_id: string;
  }>;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

async function readCompleteBody(request: Request) {
  try {
    return (await request.json()) as CookingSessionCompleteBody;
  } catch {
    return null;
  }
}

function isCompleteData(value: unknown): value is CookingSessionCompleteData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as Record<string, unknown>;
  return typeof data.session_id === "string"
    && data.status === "completed"
    && Number.isSafeInteger(data.meals_updated)
    && typeof data.leftover_dish_id === "string"
    && Number.isSafeInteger(data.pantry_removed)
    && Number.isSafeInteger(data.cook_count);
}

export async function POST(request: Request, context: RouteContext) {
  const { session_id: sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const body = await readCompleteBody(request);

  if (!body) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingSessionCompleteBody(body);

  if (!parsed.data) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const idempotency = readOptionalLegacyIdempotencyKey(request);
  if (!idempotency.ok) {
    return fail("INVALID_IDEMPOTENCY_KEY", "요청 키를 확인해 주세요.", 400, [
      { field: "Idempotency-Key", reason: "invalid_uuid" },
    ]);
  }
  if (
    idempotency.key === null
    && getLegacyCookingIdempotencyPhase() === "required"
  ) {
    return fail("IDEMPOTENCY_KEY_REQUIRED", "요청 키가 필요해요.", 428, [
      { field: "Idempotency-Key", reason: "required" },
    ]);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
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
    return fail("INTERNAL_ERROR", "요리 세션을 완료하지 못했어요.", 500);
  }

  const result = await callFuturePropagationRpc(
    serviceClient as FuturePropagationRpcClient,
    "complete_cooking_session",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_session_id: sessionId,
      p_consumed_ingredient_ids: parsed.data.consumed_ingredient_ids,
      p_idempotency_key: idempotency.key,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  return isCompleteData(result.data)
    ? ok<CookingSessionCompleteData>(result.data)
    : fail("INTERNAL_ERROR", "요리 세션을 완료하지 못했어요.", 500);
}
