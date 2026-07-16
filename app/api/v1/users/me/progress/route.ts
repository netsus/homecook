import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { readUserProgress, type UserProgressDbClient } from "@/lib/server/user-progress";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { UserProgressData } from "@/types/user-progress";

export async function GET() {
  let routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>;
  try {
    routeClient = await createRouteHandlerClient();
  } catch {
    return fail("INTERNAL_ERROR", "사용자 진도를 불러오지 못했어요.", 500);
  }
  let authResult;
  try {
    authResult = await routeClient.auth.getUser();
  } catch {
    return fail("INTERNAL_ERROR", "사용자 진도를 불러오지 못했어요.", 500);
  }
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  let dbClient: UserProgressDbClient & UserBootstrapDbClient;
  try {
    dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
      UserProgressDbClient & UserBootstrapDbClient;
  } catch {
    return fail("INTERNAL_ERROR", "사용자 진도를 불러오지 못했어요.", 500);
  }

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "사용자 진도를 불러오지 못했어요."),
      500,
    );
  }

  const progressResult = await readUserProgress(dbClient, user.id);

  if (progressResult.error || !progressResult.data) {
    return fail("INTERNAL_ERROR", "사용자 진도를 불러오지 못했어요.", 500);
  }

  return ok<UserProgressData>(progressResult.data);
}
