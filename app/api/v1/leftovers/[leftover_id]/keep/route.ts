import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled, keepQaFixtureLeftover } from "@/lib/mock/recipes";
import {
  describeLegacyLeftoverMutationError,
  isUuid,
  parseLegacyLeftoverMutation,
} from "@/lib/server/leftovers";
import { callCookedBatchRpc } from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest } from "@/lib/server/cooked-batch-route";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";

interface RouteContext {
  params: Promise<{
    leftover_id: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { leftover_id: leftoverId } = await context.params;

  if (!isUuid(leftoverId)) {
    return fail("RESOURCE_NOT_FOUND", "남은 요리를 찾을 수 없어요.", 404);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const fixtureResult = keepQaFixtureLeftover(leftoverId);

    if (!fixtureResult.ok) {
      return fail(fixtureResult.code, fixtureResult.message, fixtureResult.status);
    }

    return ok(fixtureResult.data);
  }

  const authorized = await authorizeCookedBatchRequest();
  if (!authorized.ok) return authorized.response;
  const { routeClient, user } = authorized;

  const dbClient: UserBootstrapDbClient = routeClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "계속 보관으로 표시하지 못했어요."),
      500,
    );
  }

  const reviewedAt = new Date().toISOString();
  const mutationResult = await callCookedBatchRpc(
    authorized.client,
    "mutate_legacy_leftover_status",
    {
      ...authorized.authorityArgs,
      p_action: "keep",
      p_leftover_id: leftoverId,
      p_now: reviewedAt,
    },
  );
  if (!mutationResult.ok) return mutationResult.response;
  const mutationData = parseLegacyLeftoverMutation(mutationResult.data, "keep");
  if (!mutationData) {
    return fail("INTERNAL_ERROR", "계속 보관으로 표시하지 못했어요.", 500);
  }
  if ("error_code" in mutationData) {
    const error = describeLegacyLeftoverMutationError(mutationData.error_code, "keep");
    return fail(error.code, error.message, error.status);
  }

  return ok(mutationData);
}
