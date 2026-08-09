import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import {
  expireAuthFlowCookie,
  expireSupabaseAuthCookies,
  getSupabaseAuthStorageKey,
} from "@/lib/auth/session-cookies";
import { isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import { executeHybridLogout } from "@/lib/server/hybrid-auth/logout";
import { getAuthSupabaseEnv } from "@/lib/supabase/auth-env";
import { createAuthRouteHandlerClient } from "@/lib/supabase/server";
import type { UserLogoutData } from "@/types/user";

function expireLogoutCookies(
  response: NextResponse,
  request: Request,
  cookieStore?: Awaited<ReturnType<typeof cookies>> | null,
  authStorageKey?: string,
) {
  return expireAuthFlowCookie(
    expireSupabaseAuthCookies(response, request, cookieStore, {
      storageKey: authStorageKey,
    }),
  );
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authStorageKey = getSupabaseAuthStorageKey(getAuthSupabaseEnv().url);

  if (isQaFixtureModeEnabled()) {
    if (readE2EAuthOverrideHeader(request.headers) !== "authenticated") {
      return expireLogoutCookies(
        fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
        request,
        cookieStore,
        authStorageKey,
      );
    }

    return expireLogoutCookies(
      ok<UserLogoutData>({ logged_out: true }),
      request,
      cookieStore,
      authStorageKey,
    );
  }

  const supabase = await createAuthRouteHandlerClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return expireLogoutCookies(
      fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      request,
      cookieStore,
      authStorageKey,
    );
  }

  const logoutResult = await executeHybridLogout(supabase);
  if (!logoutResult.ok) {
    return expireLogoutCookies(
      fail(
        logoutResult.error.code,
        logoutResult.error.message,
        logoutResult.error.status,
      ),
      request,
      cookieStore,
      authStorageKey,
    );
  }

  return expireLogoutCookies(
    ok<UserLogoutData>({ logged_out: true }),
    request,
    cookieStore,
    authStorageKey,
  );
}
