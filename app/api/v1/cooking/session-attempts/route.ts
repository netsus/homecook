import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  parseSnapshotV2StartRequest,
  projectSnapshotV2StartData,
  readRequiredIdempotencyKey,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createSnapshotV2SessionInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }
  const parsed = parseSnapshotV2StartRequest(body);
  if (!parsed.ok) {
    return fail(
      "VALIDATION_ERROR",
      "요청 값을 확인해 주세요.",
      422,
      parsed.fields,
    );
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
    return fail("INTERNAL_ERROR", "요리 세션을 시작하지 못했어요.", 500);
  }

  const planner = parsed.value.mode === "planner" ? parsed.value : null;
  const standalone = parsed.value.mode === "standalone" ? parsed.value : null;
  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "start_snapshot_v2_cooking_session",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_idempotency_key: idempotency.key,
      p_mode: parsed.value.mode,
      p_meal_ids: planner?.mealIds ?? null,
      p_expected_meal_revisions: planner?.expectedMealRevisions ?? null,
      p_recipe_id: standalone?.recipeId ?? null,
      p_expected_recipe_revision: standalone?.expectedRecipeRevision ?? null,
      p_cooking_servings: standalone?.cookingServings ?? null,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectSnapshotV2StartData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "요리 세션을 시작하지 못했어요.", 500);
}
