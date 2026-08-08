import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { eatQaFixtureLeftover, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  isUuid,
  toLeftoverMutationData,
} from "@/lib/server/leftovers";
import { callCookedBatchRpc } from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest } from "@/lib/server/cooked-batch-route";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import type { LeftoverMutationData } from "@/types/leftover";

interface RouteContext {
  params: Promise<{
    leftover_id: string;
  }>;
}

type LeftoverMutationAuthedDbClient =
  UserBootstrapDbClient;

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

    const fixtureResult = eatQaFixtureLeftover(leftoverId);

    if (!fixtureResult.ok) {
      return fail(fixtureResult.code, fixtureResult.message, fixtureResult.status);
    }

    return ok(fixtureResult.data);
  }

  const authorized = await authorizeCookedBatchRequest();
  if (!authorized.ok) return authorized.response;
  const { routeClient, user } = authorized;

  const dbClient = routeClient as unknown as
    LeftoverMutationAuthedDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "남은 요리를 다먹음 처리하지 못했어요."),
      500,
    );
  }

  const eatenAt = new Date().toISOString();
  const mutationResult = await callCookedBatchRpc(
    authorized.client,
    "mutate_legacy_leftover_status",
    {
      ...authorized.authorityArgs,
      p_action: "eat",
      p_leftover_id: leftoverId,
      p_now: eatenAt,
    },
  );
  if (!mutationResult.ok) return mutationResult.response;
  if (!mutationResult.data || typeof mutationResult.data !== "object") {
    return fail("INTERNAL_ERROR", "남은 요리를 다먹음 처리하지 못했어요.", 500);
  }
  const mutationData = mutationResult.data as
    | (LeftoverMutationData & { transitioned: boolean })
    | { error_code: "RESOURCE_NOT_FOUND" | "FORBIDDEN" | "CONFLICT" };
  if ("error_code" in mutationData) {
    if (mutationData.error_code === "RESOURCE_NOT_FOUND") {
      return fail("RESOURCE_NOT_FOUND", "남은 요리를 찾을 수 없어요.", 404);
    }
    if (mutationData.error_code === "FORBIDDEN") {
      return fail("FORBIDDEN", "내 남은 요리만 수정할 수 있어요.", 403);
    }
    return fail("CONFLICT", "중량 기록이 있는 요리는 전용 기록 화면에서 변경해 주세요.", 409);
  }

  return ok(toLeftoverMutationData(mutationData));
}
