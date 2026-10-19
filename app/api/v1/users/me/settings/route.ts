import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { UserSettingsData } from "@/types/user";

interface UserSettingsRequestBody {
  screen_wake_lock?: unknown;
}

// Consumed users columns only; JSON remains untrusted until read below.
export type UserSettingsDbClient = Pick<SupabaseClient<{
  public: {
    Tables: { users: {
      Row: { id: string; settings_json: unknown; updated_at: string };
      Insert: never;
      Update: { settings_json: Record<string, unknown>; updated_at: string };
      Relationships: [];
    } };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

function normalizeSettings(settings: unknown) {
  return settings && typeof settings === "object" ? settings : {};
}

function readScreenWakeLock(settings: unknown) {
  if (!settings || typeof settings !== "object" || !("screen_wake_lock" in settings)) return false;
  return typeof settings?.screen_wake_lock === "boolean" ? settings.screen_wake_lock : false;
}

function isRequestRecord(value: unknown): value is UserSettingsRequestBody {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readQaFixtureAuth(request: Request) {
  return readE2EAuthOverrideHeader(request.headers);
}

export async function PATCH(request: Request) {
  let body: UserSettingsRequestBody;

  try {
    body = (await request.json()) as UserSettingsRequestBody;
  } catch {
    return fail("INVALID_REQUEST", "요청 본문을 확인해 주세요.", 400, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  if (!isRequestRecord(body)) {
    return fail("INVALID_REQUEST", "요청 본문을 확인해 주세요.", 400, [
      { field: "body", reason: "invalid_object" },
    ]);
  }

  if (
    "screen_wake_lock" in body &&
    typeof body.screen_wake_lock !== "boolean"
  ) {
    return fail("VALIDATION_ERROR", "설정 값을 확인해 주세요.", 422, [
      { field: "screen_wake_lock", reason: "boolean" },
    ]);
  }

  if (isQaFixtureModeEnabled()) {
    if (readQaFixtureAuth(request) !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok<UserSettingsData>({
      settings: {
        screen_wake_lock: body.screen_wake_lock === true,
      },
    });
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient: UserSettingsDbClient = routeClient;

  try {
    await ensurePublicUserRow(routeClient, user);
    await ensureUserBootstrapState(routeClient, user.id);
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

  const nextSettings: Record<string, unknown> = {
    ...normalizeSettings(currentResult.data.settings_json),
  };
  if (typeof body.screen_wake_lock === "boolean") {
    nextSettings.screen_wake_lock = body.screen_wake_lock;
  }

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
