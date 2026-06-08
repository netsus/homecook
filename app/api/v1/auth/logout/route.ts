import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { UserLogoutData } from "@/types/user";

export async function POST(request: Request) {
  if (isQaFixtureModeEnabled()) {
    if (readE2EAuthOverrideHeader(request.headers) !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok<UserLogoutData>({ logged_out: true });
  }

  const supabase = await createRouteHandlerClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const signOutResult = await supabase.auth.signOut();

  if (signOutResult.error) {
    return fail("INTERNAL_ERROR", "로그아웃하지 못했어요.", 500);
  }

  return ok<UserLogoutData>({ logged_out: true });
}
