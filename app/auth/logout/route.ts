import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  expireAuthFlowCookie,
  expireSupabaseAuthCookies,
} from "@/lib/auth/session-cookies";
import { resolveNextPath } from "@/lib/auth/callback";
import { buildSameAppRedirectUrl } from "@/lib/auth/redirect-origin";
import { executeHybridLogout } from "@/lib/server/hybrid-auth/logout";
import { createAuthRouteHandlerClient } from "@/lib/supabase/server";

function buildLogoutFailureRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = buildSameAppRedirectUrl("/login", requestUrl);
  redirectUrl.searchParams.set("authError", "ACCOUNT_SESSION_STALE");
  if (nextPath !== "/") {
    redirectUrl.searchParams.set("next", nextPath);
  }
  return redirectUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));
  const cookieStore = await cookies();
  const supabase = await createAuthRouteHandlerClient();

  const logoutResult = await executeHybridLogout(supabase);
  if (!logoutResult.ok) {
    return expireAuthFlowCookie(
      expireSupabaseAuthCookies(
        NextResponse.redirect(buildLogoutFailureRedirectUrl(requestUrl, nextPath)),
        request,
        cookieStore,
      ),
    );
  }

  return expireAuthFlowCookie(
    NextResponse.redirect(buildSameAppRedirectUrl(nextPath, requestUrl)),
  );
}
