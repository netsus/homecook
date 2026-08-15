import { fail, ok } from "@/lib/api/response";
import { parseCookingStandaloneCompleteBody } from "@/lib/server/cooking";
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
  CookingStandaloneCompleteBody,
  CookingStandaloneCompleteData,
} from "@/types/cooking";

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

async function readStandaloneCompleteBody(request: Request) {
  try {
    return (await request.json()) as CookingStandaloneCompleteBody;
  } catch {
    return null;
  }
}

function isStandaloneCompleteData(
  value: unknown,
): value is CookingStandaloneCompleteData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as Record<string, unknown>;
  return typeof data.leftover_dish_id === "string"
    && Number.isSafeInteger(data.pantry_removed)
    && Number.isSafeInteger(data.cook_count);
}

export async function POST(request: Request) {
  const body = await readStandaloneCompleteBody(request);

  if (!body) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingStandaloneCompleteBody(body);

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
    return fail("INTERNAL_ERROR", "독립 요리를 완료하지 못했어요.", 500);
  }

  const result = await callFuturePropagationRpc(
    serviceClient as FuturePropagationRpcClient,
    "complete_standalone_cooking",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_recipe_id: parsed.data.recipe_id,
      p_cooking_servings: parsed.data.cooking_servings,
      p_consumed_ingredient_ids: parsed.data.consumed_ingredient_ids,
      p_idempotency_key: idempotency.key,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  return isStandaloneCompleteData(result.data)
    ? ok<CookingStandaloneCompleteData>(result.data)
    : fail("INTERNAL_ERROR", "독립 요리를 완료하지 못했어요.", 500);
}
