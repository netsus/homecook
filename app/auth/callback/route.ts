import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import { createRouteHandlerClient } from "@/lib/supabase/server";

function getFailurePath(nextPath: string) {
  return nextPath === "/" ? "/login" : nextPath;
}

function buildFailureRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = new URL(getFailurePath(nextPath), requestUrl.origin);
  redirectUrl.searchParams.set("authError", "oauth_failed");

  return redirectUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));
  const oauthError = requestUrl.searchParams.get("error");

  if (!code) {
    if (oauthError) {
      return NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath));
    }

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  try {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectUrl = new URL(nextPath, requestUrl.origin);

    if (error) {
      return NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath));
    }

    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath));
  }
}
