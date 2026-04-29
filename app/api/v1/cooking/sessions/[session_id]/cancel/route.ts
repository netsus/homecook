import { fail, ok } from "@/lib/api/response";
import { isUuid } from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { CookingSessionCancelData, CookingSessionStatus } from "@/types/cooking";

interface RouteContext {
  params: Promise<{
    session_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  status: CookingSessionStatus;
}

interface SessionUpdateRow {
  id: string;
  status: "cancelled";
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface SessionsSelectQuery {
  eq(column: string, value: string): SessionsSelectQuery;
  maybeSingle(): MaybeSingleResult<SessionRow>;
}

interface SessionsUpdateQuery {
  eq(column: string, value: string): SessionsUpdateQuery;
  select(columns: string): SessionsUpdateQuery;
  maybeSingle(): MaybeSingleResult<SessionUpdateRow>;
}

interface CookingSessionsTable {
  select(columns: string): SessionsSelectQuery;
  update(value: { status: "cancelled" }): SessionsUpdateQuery;
}

interface CookingCancelDbClient {
  from(table: "cooking_sessions"): CookingSessionsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function POST(_request: Request, context: RouteContext) {
  const { session_id: sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    CookingCancelDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "요리 세션을 취소하지 못했어요."),
      500,
    );
  }

  const sessionResult = await dbClient
    .from("cooking_sessions")
    .select("id, user_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) {
    return fail("INTERNAL_ERROR", "요리 세션을 취소하지 못했어요.", 500);
  }

  if (!sessionResult.data) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  if (sessionResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 요리 세션만 취소할 수 있어요.", 403);
  }

  if (sessionResult.data.status === "cancelled") {
    return ok<CookingSessionCancelData>({
      session_id: sessionResult.data.id,
      status: "cancelled",
    });
  }

  if (sessionResult.data.status === "completed") {
    return fail("CONFLICT", "완료된 요리 세션은 취소할 수 없어요.", 409);
  }

  const updateResult = await dbClient
    .from("cooking_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .select("id, status")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "요리 세션을 취소하지 못했어요.", 500);
  }

  return ok<CookingSessionCancelData>({
    session_id: updateResult.data.id,
    status: "cancelled",
  });
}
