import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  isUuid,
  parseRecipeFutureImpactRequest,
  projectRecipeFutureImpactData,
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

  const { id: recipeId } = await context.params;
  if (!isUuid(recipeId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }
  const parsed = parseRecipeFutureImpactRequest(body);
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

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "레시피 변경 영향을 확인하지 못했어요.", 500);
  }

  const result = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "preview_recipe_future_plan_impact",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_recipe_id: recipeId,
      p_base_recipe_revision: parsed.value.baseRecipeRevision,
      p_draft: parsed.value.draft,
    },
  );
  if (!result.ok) {
    return result.response;
  }

  const data = projectRecipeFutureImpactData(result.data);
  return data
    ? ok(data)
    : fail("INTERNAL_ERROR", "레시피 변경 영향을 확인하지 못했어요.", 500);
}
