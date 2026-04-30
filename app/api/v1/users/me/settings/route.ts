import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { UserSettingsData } from "@/types/user";

interface QueryError {
  message: string;
}

interface SettingsRow {
  settings_json: Record<string, unknown> | null;
}

interface UserSettingsRequestBody {
  screen_wake_lock?: unknown;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface UsersSettingsSelectQuery {
  eq(column: string, value: string): UsersSettingsSelectQuery;
  maybeSingle(): MaybeSingleResult<SettingsRow>;
}

interface UsersSettingsUpdateQuery {
  eq(column: string, value: string): UsersSettingsUpdateQuery;
  select(columns: string): UsersSettingsUpdateQuery;
  maybeSingle(): MaybeSingleResult<SettingsRow>;
}

interface UsersSettingsTable {
  select(columns: string): UsersSettingsSelectQuery;
  update(values: {
    settings_json: Record<string, unknown>;
    updated_at: string;
  }): UsersSettingsUpdateQuery;
}

interface UserSettingsDbClient {
  from(table: "users"): UsersSettingsTable;
}

function normalizeSettings(settings: Record<string, unknown> | null) {
  return settings && typeof settings === "object" ? settings : {};
}

function readScreenWakeLock(settings: Record<string, unknown> | null) {
  return typeof settings?.screen_wake_lock === "boolean" ? settings.screen_wake_lock : false;
}

function isRequestRecord(value: unknown): value is UserSettingsRequestBody {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function PATCH(request: Request) {
  let body: UserSettingsRequestBody;

  try {
    body = (await request.json()) as UserSettingsRequestBody;
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

  if (
    "screen_wake_lock" in body &&
    typeof body.screen_wake_lock !== "boolean"
  ) {
    return fail("VALIDATION_ERROR", "설정 값을 확인해주세요.", 422, [
      { field: "screen_wake_lock", reason: "boolean" },
    ]);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    UserSettingsDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "설정을 저장하지 못했어요."),
      500,
    );
  }

  const currentResult = await dbClient
    .from("users")
    .select("settings_json")
    .eq("id", user.id)
    .maybeSingle();

  if (currentResult.error || !currentResult.data) {
    return fail("INTERNAL_ERROR", "설정을 저장하지 못했어요.", 500);
  }

  const nextSettings = {
    ...normalizeSettings(currentResult.data.settings_json),
    ...(typeof body.screen_wake_lock === "boolean"
      ? { screen_wake_lock: body.screen_wake_lock }
      : {}),
  };

  const updateResult = await dbClient
    .from("users")
    .update({
      settings_json: nextSettings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("settings_json")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "설정을 저장하지 못했어요.", 500);
  }

  return ok<UserSettingsData>({
    settings: {
      screen_wake_lock: readScreenWakeLock(updateResult.data.settings_json),
    },
  });
}
