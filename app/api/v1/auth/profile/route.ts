import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

interface ProfileRequestBody {
  nickname?: string;
}

function normalizeNickname(value: string | undefined) {
  return value?.trim() ?? "";
}

export async function PATCH(request: Request) {
  let body: ProfileRequestBody;

  try {
    body = (await request.json()) as ProfileRequestBody;
  } catch {
    return fail("INVALID_REQUEST", "요청 본문을 확인해주세요.", 400, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const nickname = normalizeNickname(body.nickname);

  if (nickname.length < 2 || nickname.length > 30) {
    return fail("INVALID_REQUEST", "닉네임은 2~30자여야 해요.", 400, [
      { field: "nickname", reason: "length" },
    ]);
  }

  if (!hasSupabasePublicEnv()) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const supabase = await createRouteHandlerClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? supabase) as unknown as UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "프로필을 저장하지 못했어요."),
      500,
    );
  }

  const { data, error } = await dbClient
    .from("users")
    .update({
      nickname,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id, nickname, email, profile_image_url")
    .maybeSingle();

  if (error || !data) {
    return fail("INTERNAL_ERROR", "프로필을 저장하지 못했어요.", 500);
  }

  try {
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "프로필을 저장하지 못했어요."),
      500,
    );
  }

  return ok({
    id: data.id,
    nickname: data.nickname,
    email: data.email,
    profile_image_url: data.profile_image_url,
    is_new_user: normalizeNickname(data.nickname).length === 0,
  });
}
