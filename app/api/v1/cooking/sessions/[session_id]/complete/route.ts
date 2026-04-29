import { fail, ok } from "@/lib/api/response";
import {
  isUuid,
  parseCookingSessionCompleteBody,
} from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  CookingSessionCompleteBody,
  CookingSessionCompleteData,
} from "@/types/cooking";

interface RouteContext {
  params: Promise<{
    session_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface CompleteRpcErrorData {
  error_code: "RESOURCE_NOT_FOUND" | "FORBIDDEN" | "CONFLICT";
  message?: string;
}

type CompleteRpcData = CookingSessionCompleteData | CompleteRpcErrorData;

interface CompleteRpcResult {
  data: CompleteRpcData | null;
  error: QueryError | null;
}

interface CookingCompleteDbClient {
  rpc(
    fn: "complete_cooking_session",
    args: {
      p_session_id: string;
      p_user_id: string;
      p_consumed_ingredient_ids: string[];
    },
  ): Promise<CompleteRpcResult>;
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

function isRpcErrorData(data: CompleteRpcData): data is CompleteRpcErrorData {
  return "error_code" in data;
}

function failForRpcError(data: CompleteRpcErrorData) {
  if (data.error_code === "RESOURCE_NOT_FOUND") {
    return fail("RESOURCE_NOT_FOUND", data.message ?? "요리 세션을 찾을 수 없어요.", 404);
  }

  if (data.error_code === "FORBIDDEN") {
    return fail("FORBIDDEN", data.message ?? "내 요리 세션만 완료할 수 있어요.", 403);
  }

  return fail("CONFLICT", data.message ?? "완료할 수 없는 요리 세션이에요.", 409);
}

export async function POST(request: Request, context: RouteContext) {
  const { session_id: sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const body = await readCompleteBody(request);

  if (!body) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingSessionCompleteBody(body);

  if (!parsed.data) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    CookingCompleteDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "요리 세션을 완료하지 못했어요."),
      500,
    );
  }

  const completeResult = await dbClient.rpc("complete_cooking_session", {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_consumed_ingredient_ids: parsed.data.consumed_ingredient_ids,
  });

  if (completeResult.error || !completeResult.data) {
    return fail("INTERNAL_ERROR", "요리 세션을 완료하지 못했어요.", 500);
  }

  if (isRpcErrorData(completeResult.data)) {
    return failForRpcError(completeResult.data);
  }

  return ok<CookingSessionCompleteData>(completeResult.data);
}
