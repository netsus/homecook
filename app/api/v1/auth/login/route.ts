import { fail, ok } from "@/lib/api/response";
import {
  AUTH_PROVIDER_META,
  type AuthProviderId,
} from "@/lib/auth/providers";
import { createRouteHandlerClient } from "@/lib/supabase/server";

interface LoginRequestBody {
  provider?: string;
  access_token?: string;
}

function isAuthProviderId(value: string): value is AuthProviderId {
  return value in AUTH_PROVIDER_META;
}

function normalizeProfileImage(userMetadata: Record<string, unknown> | undefined) {
  const image = userMetadata?.avatar_url ?? userMetadata?.picture;
  return typeof image === "string" ? image : null;
}

function normalizeNickname(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: LoginRequestBody;

  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return fail("INVALID_REQUEST", "요청 본문을 확인해주세요.", 400, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const provider = body.provider?.trim().toLowerCase() ?? "";
  const accessToken = body.access_token?.trim() ?? "";
  const fields = [];

  if (!isAuthProviderId(provider)) {
    fields.push({ field: "provider", reason: "unsupported" });
  }

  if (!accessToken) {
    fields.push({ field: "access_token", reason: "required" });
  }

  if (fields.length > 0) {
    return fail("INVALID_REQUEST", "요청 값을 확인해주세요.", 400, fields);
  }

  const supabase = await createRouteHandlerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider,
    token: accessToken,
    access_token: accessToken,
  });
  const session = data.session;
  const user = data.user;

  if (error || !session || !user) {
    return fail("INVALID_REQUEST", "로그인 세션을 확인하지 못했어요.", 400, [
      { field: "access_token", reason: "session_not_found" },
    ]);
  }

  const nickname = normalizeNickname(user.user_metadata?.nickname);
  const isNewUser = nickname.length === 0;

  return ok({
    token: session.access_token,
    refresh_token: session.refresh_token,
    user: {
      id: user.id,
      nickname,
      email: user.email ?? null,
      profile_image_url: normalizeProfileImage(user.user_metadata),
      is_new_user: isNewUser,
    },
  });
}
