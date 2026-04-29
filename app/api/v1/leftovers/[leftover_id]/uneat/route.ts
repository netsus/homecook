import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled, uneatQaFixtureLeftover } from "@/lib/mock/recipes";
import {
  isUuid,
  toLeftoverMutationData,
  type LeftoverDishRow,
} from "@/lib/server/leftovers";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
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

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface LeftoverSelectQuery {
  eq(column: string, value: string): LeftoverSelectQuery;
  maybeSingle(): MaybeSingleResult<LeftoverDishRow>;
}

interface LeftoverUpdateQuery {
  eq(column: string, value: string): LeftoverUpdateQuery;
  select(columns: string): LeftoverUpdateQuery;
  maybeSingle(): MaybeSingleResult<LeftoverMutationData>;
}

interface LeftoverDishesTable {
  select(columns: string): LeftoverSelectQuery;
  update(values: {
    status: "leftover";
    eaten_at: null;
    auto_hide_at: null;
  }): LeftoverUpdateQuery;
}

interface LeftoverMutationDbClient {
  from(table: "leftover_dishes"): LeftoverDishesTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function POST(request: Request, context: RouteContext) {
  const { leftover_id: leftoverId } = await context.params;

  if (!isUuid(leftoverId)) {
    return fail("RESOURCE_NOT_FOUND", "남은요리를 찾을 수 없어요.", 404);
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

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    LeftoverMutationDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "남은요리를 덜먹음 처리하지 못했어요."),
      500,
    );
  }

  const leftoverResult = await dbClient
    .from("leftover_dishes")
    .select("id, user_id, recipe_id, status, cooked_at, eaten_at, auto_hide_at")
    .eq("id", leftoverId)
    .maybeSingle();

  if (leftoverResult.error || !leftoverResult.data) {
    return fail("RESOURCE_NOT_FOUND", "남은요리를 찾을 수 없어요.", 404);
  }

  if (leftoverResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 남은요리만 수정할 수 있어요.", 403);
  }

  if (leftoverResult.data.status === "leftover") {
    return ok(toLeftoverMutationData(leftoverResult.data));
  }

  const updateResult = await dbClient
    .from("leftover_dishes")
    .update({
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    })
    .eq("id", leftoverId)
    .eq("user_id", user.id)
    .select("id, status, eaten_at, auto_hide_at")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "남은요리를 덜먹음 처리하지 못했어요.", 500);
  }

  return ok(toLeftoverMutationData(updateResult.data));
}
