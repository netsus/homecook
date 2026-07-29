import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import { revokeCurrentHybridSessionAuthority } from "@/lib/server/hybrid-auth/logout";
import { createAuthRouteHandlerClient } from "@/lib/supabase/server";
import type { UserLogoutData } from "@/types/user";

export async function POST(request: Request) {
  if (isQaFixtureModeEnabled()) {
    if (readE2EAuthOverrideHeader(request.headers) !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok<UserLogoutData>({ logged_out: true });
  }

  const supabase = await createAuthRouteHandlerClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const revokeResult = await revokeCurrentHybridSessionAuthority(supabase);
  if (!revokeResult.ok) {
    return fail(
      "ACCOUNT_SESSION_STALE",
      "세션을 다시 확인해 주세요.",
      409,
    );
  }
  const signOutResult = await supabase.auth.signOut({ scope: "local" });

  if (signOutResult.error) {
    return fail("INTERNAL_ERROR", "로그아웃하지 못했어요.", 500);
  }

  return ok<UserLogoutData>({ logged_out: true });
}
