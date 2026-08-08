import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled, uneatQaFixtureLeftover } from "@/lib/mock/recipes";
import {
  isUuid,
  toLeftoverMutationData,
} from "@/lib/server/leftovers";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { LeftoverMutationData } from "@/types/leftover";

interface RouteContext {
  params: Promise<{
    leftover_id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface LeftoverMutationDbClient {
  rpc(
    name: "mutate_legacy_leftover_status",
    args: { p_action: "uneat"; p_leftover_id: string; p_now: string },
  ): PromiseLike<{
    data: (LeftoverMutationData & { transitioned: boolean })
      | { error_code: "RESOURCE_NOT_FOUND" | "FORBIDDEN" | "CONFLICT" }
      | null;
    error: QueryError | null;
  }>;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
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

    const fixtureResult = uneatQaFixtureLeftover(leftoverId);

    if (!fixtureResult.ok) {
      return fail(fixtureResult.code, fixtureResult.message, fixtureResult.status);
    }

    return ok(fixtureResult.data);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = routeClient as unknown as
    LeftoverMutationDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "남은 요리를 덜먹음 처리하지 못했어요."),
      500,
    );
  }

  const mutationResult = await dbClient.rpc("mutate_legacy_leftover_status", {
    p_action: "uneat",
    p_leftover_id: leftoverId,
    p_now: new Date().toISOString(),
  });
  if (mutationResult.error || !mutationResult.data) {
    return fail("INTERNAL_ERROR", "남은 요리를 덜먹음 처리하지 못했어요.", 500);
  }
  if ("error_code" in mutationResult.data) {
    if (mutationResult.data.error_code === "RESOURCE_NOT_FOUND") {
      return fail("RESOURCE_NOT_FOUND", "남은 요리를 찾을 수 없어요.", 404);
    }
    if (mutationResult.data.error_code === "FORBIDDEN") {
      return fail("FORBIDDEN", "내 남은 요리만 수정할 수 있어요.", 403);
    }
    return fail("CONFLICT", "중량 기록이 있는 요리는 전용 기록 화면에서 변경해 주세요.", 409);
  }

  return ok(toLeftoverMutationData(mutationResult.data));
}
