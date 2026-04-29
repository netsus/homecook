import { fail, ok } from "@/lib/api/response";
import { parseCookingStandaloneCompleteBody } from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  createRouteHandlerClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type {
  CookingStandaloneCompleteBody,
  CookingStandaloneCompleteData,
} from "@/types/cooking";

interface QueryError {
  message: string;
}

interface StandaloneRpcErrorData {
  error_code: "RESOURCE_NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR";
  message?: string;
}

type StandaloneRpcData = CookingStandaloneCompleteData | StandaloneRpcErrorData;

interface StandaloneRpcResult {
  data: StandaloneRpcData | null;
  error: QueryError | null;
}

interface StandaloneCompleteDbClient {
  rpc(
    fn: "complete_standalone_cooking",
    args: {
      p_recipe_id: string;
      p_user_id: string;
      p_cooking_servings: number;
      p_consumed_ingredient_ids: string[];
    },
  ): Promise<StandaloneRpcResult>;
}

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

function isRpcErrorData(data: StandaloneRpcData): data is StandaloneRpcErrorData {
  return "error_code" in data;
}

function failForRpcError(data: StandaloneRpcErrorData) {
  if (data.error_code === "RESOURCE_NOT_FOUND") {
    return fail("RESOURCE_NOT_FOUND", data.message ?? "레시피를 찾을 수 없어요.", 404);
  }

  if (data.error_code === "FORBIDDEN") {
    return fail("FORBIDDEN", data.message ?? "내 요리 기록만 완료할 수 있어요.", 403);
  }

  return fail("VALIDATION_ERROR", data.message ?? "요청 값을 확인해주세요.", 422);
}

export async function POST(request: Request) {
  const body = await readStandaloneCompleteBody(request);

  if (!body) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingStandaloneCompleteBody(body);

  if (!parsed.data) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    StandaloneCompleteDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "독립 요리를 완료하지 못했어요."),
      500,
    );
  }

  const completeResult = await dbClient.rpc("complete_standalone_cooking", {
    p_recipe_id: parsed.data.recipe_id,
    p_user_id: user.id,
    p_cooking_servings: parsed.data.cooking_servings,
    p_consumed_ingredient_ids: parsed.data.consumed_ingredient_ids,
  });

  if (completeResult.error || !completeResult.data) {
    return fail("INTERNAL_ERROR", "독립 요리를 완료하지 못했어요.", 500);
  }

  if (isRpcErrorData(completeResult.data)) {
    return failForRpcError(completeResult.data);
  }

  return ok<CookingStandaloneCompleteData>(completeResult.data);
}
