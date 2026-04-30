import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { UserDeleteData, UserProfileData } from "@/types/user";

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

interface UserDeleteRow {
  id: string;
  deleted_at: string | null;
}

interface UserProfileRequestBody {
  nickname?: unknown;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface UsersSelectQuery {
  eq(column: string, value: string): UsersSelectQuery;
  maybeSingle(): MaybeSingleResult<UserProfileRow>;
}

interface UsersUpdateProfileQuery {
  eq(column: string, value: string): UsersUpdateProfileQuery;
  select(columns: string): UsersUpdateProfileQuery;
  maybeSingle(): MaybeSingleResult<UserProfileRow>;
}

interface UsersDeleteQuery {
  eq(column: string, value: string): UsersDeleteQuery;
  select(columns: string): UsersDeleteQuery;
  maybeSingle(): MaybeSingleResult<UserDeleteRow>;
}

interface UsersTable {
  select(columns: string): UsersSelectQuery;
  update(values: {
    nickname: string;
    updated_at: string;
  }): UsersUpdateProfileQuery;
  update(values: {
    deleted_at: string;
    updated_at: string;
  }): UsersDeleteQuery;
}

interface UsersMeDbClient {
  from(table: "users"): UsersTable;
}

function readScreenWakeLock(settings: Record<string, unknown> | null) {
  return typeof settings?.screen_wake_lock === "boolean" ? settings.screen_wake_lock : false;
}

function toUserProfileData(row: UserProfileRow): UserProfileData {
  return {
    id: row.id,
    nickname: row.nickname,
    email: row.email,
    profile_image_url: row.profile_image_url,
    social_provider: row.social_provider,
    settings: {
      screen_wake_lock: readScreenWakeLock(row.settings_json),
    },
  };
}

function normalizeNickname(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRequestRecord(value: unknown): value is UserProfileRequestBody {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function createAuthedUsersMeDbClient(fallbackMessage: string) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      dbClient: null,
      user: null,
    };
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    UsersMeDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, fallbackMessage),
        500,
      ),
      dbClient: null,
      user: null,
    };
  }

  return {
    response: null,
    dbClient,
    user,
  };
}

export async function GET() {
  const { response, dbClient, user } =
    await createAuthedUsersMeDbClient("내 정보를 불러오지 못했어요.");

  if (response) {
    return response;
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

  return ok(toUserProfileData(userResult.data));
}

export async function PATCH(request: Request) {
  let body: UserProfileRequestBody;

  try {
    body = (await request.json()) as UserProfileRequestBody;
  } catch {
    return fail("INVALID_REQUEST", "요청 본문을 확인해주세요.", 400, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  if (!isRequestRecord(body)) {
    return fail("INVALID_REQUEST", "요청 본문을 확인해주세요.", 400, [
      { field: "body", reason: "invalid_object" },
    ]);
  }

  const nickname = normalizeNickname(body.nickname);

  if (nickname.length < 2 || nickname.length > 30) {
    return fail("VALIDATION_ERROR", "닉네임은 2~30자여야 해요.", 422, [
      { field: "nickname", reason: "length" },
    ]);
  }

  const { response, dbClient, user } =
    await createAuthedUsersMeDbClient("닉네임을 저장하지 못했어요.");

  if (response) {
    return response;
  }

  const updateResult = await dbClient
    .from("users")
    .update({
      nickname,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id, nickname, email, profile_image_url, social_provider, settings_json")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "닉네임을 저장하지 못했어요.", 500);
  }

  return ok(toUserProfileData(updateResult.data));
}

export async function DELETE() {
  const { response, dbClient, user } =
    await createAuthedUsersMeDbClient("회원 탈퇴를 처리하지 못했어요.");

  if (response) {
    return response;
  }

  const deleteResult = await dbClient
    .from("users")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id, deleted_at")
    .maybeSingle();

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "회원 탈퇴를 처리하지 못했어요.", 500);
  }

  return ok<UserDeleteData>({ deleted: true });
}
