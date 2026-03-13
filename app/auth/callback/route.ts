import { NextResponse } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";

export function resolveNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  try {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectUrl = new URL(nextPath, requestUrl.origin);

    if (error) {
      redirectUrl.searchParams.set("authError", "oauth_failed");
    }

    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }
}
