import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

interface QueryError {
  message: string;
}

interface UserProfileRow {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  social_provider: "kakao" | "naver" | "google";
  settings_json: Record<string, unknown> | null;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface UsersSelectQuery {
  eq(column: string, value: string): UsersSelectQuery;
  maybeSingle(): MaybeSingleResult<UserProfileRow>;
}

interface UsersTable {
  select(columns: string): UsersSelectQuery;
}

interface UsersMeDbClient {
  from(table: "users"): UsersTable;
}

function readScreenWakeLock(settings: Record<string, unknown> | null) {
  return typeof settings?.screen_wake_lock === "boolean" ? settings.screen_wake_lock : false;
}

export async function GET() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    UsersMeDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "내 정보를 불러오지 못했어요."),
      500,
    );
  }

  const userResult = await dbClient
    .from("users")
    .select("id, nickname, email, profile_image_url, social_provider, settings_json")
    .eq("id", user.id)
    .maybeSingle();

  if (userResult.error) {
    return fail("INTERNAL_ERROR", "내 정보를 불러오지 못했어요.", 500);
  }

  if (!userResult.data) {
    return fail("RESOURCE_NOT_FOUND", "사용자 정보를 찾을 수 없어요.", 404);
  }

  return ok({
    id: userResult.data.id,
    nickname: userResult.data.nickname,
    email: userResult.data.email,
    profile_image_url: userResult.data.profile_image_url,
    social_provider: userResult.data.social_provider,
    settings: {
      screen_wake_lock: readScreenWakeLock(userResult.data.settings_json),
    },
  });
}
