import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { resolveNextPath } from "@/lib/auth/callback";
import {
  parsePostAuthNextCookie,
  POST_AUTH_NEXT_COOKIE,
} from "@/lib/auth/post-auth-next";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

function getFailurePath(nextPath: string) {
  return nextPath === "/" ? "/login" : nextPath;
}

function buildFailureRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = new URL(getFailurePath(nextPath), requestUrl.origin);
  redirectUrl.searchParams.set("authError", "oauth_failed");

  return redirectUrl;
}

function clearPostAuthNextCookie(response: NextResponse) {
  response.cookies.set(POST_AUTH_NEXT_COOKIE, "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const cookieNextPath = parsePostAuthNextCookie(
    cookieStore.get(POST_AUTH_NEXT_COOKIE)?.value,
  );
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next") ?? cookieNextPath);
  const oauthError = requestUrl.searchParams.get("error");

  if (!code) {
    if (oauthError) {
      return clearPostAuthNextCookie(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    return clearPostAuthNextCookie(
      NextResponse.redirect(new URL(nextPath, requestUrl.origin)),
    );
  }

  try {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectUrl = new URL(nextPath, requestUrl.origin);

    if (error) {
      return clearPostAuthNextCookie(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    const authResult = await supabase.auth.getUser();
    const user = authResult.data.user;

    if (!user) {
      return clearPostAuthNextCookie(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    const dbClient = (createServiceRoleClient() ?? supabase) as unknown as UserBootstrapDbClient;
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);

    return clearPostAuthNextCookie(NextResponse.redirect(redirectUrl));
  } catch {
    return clearPostAuthNextCookie(
      NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
    );
  }
}
