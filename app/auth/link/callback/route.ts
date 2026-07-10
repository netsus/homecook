import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import {
  AUTH_PROVIDER_ATTEMPT_COOKIE,
  clearAuthProviderAttemptCookie,
} from "@/lib/auth/provider-cookies";
import { hasProviderIdentity } from "@/lib/auth/provider-resolution";
import { normalizeAuthProviderId } from "@/lib/auth/providers";
import { expireSupabaseAuthCookies } from "@/lib/auth/session-cookies";
import { recordOperationalEventFromServiceRole } from "@/lib/server/admin-events";
import { createRouteHandlerClient } from "@/lib/supabase/server";

type LinkErrorCode = "link_cancelled" | "link_failed" | "link_conflict";
type LinkResultCode = "linked" | "already_linked";

function buildLinkRedirect(
  requestUrl: URL,
  nextPath: string,
  result: { error: LinkErrorCode } | { success: LinkResultCode },
) {
  const redirectUrl = new URL(nextPath, requestUrl.origin);
  if ("error" in result) {
    redirectUrl.searchParams.set("linkError", result.error);
  } else {
    redirectUrl.searchParams.set("linkResult", result.success);
  }
  return redirectUrl;
}

function clearLinkAttemptCookie(response: NextResponse) {
  clearAuthProviderAttemptCookie(response);
  return response;
}

async function recordLinkFailure(request: Request, errorCode: LinkErrorCode) {
  await recordOperationalEventFromServiceRole({
    event_type: "auth_link_failure",
    severity: "warn",
    source: "auth",
    request,
    http_status: 401,
    error_code: errorCode,
    message_summary: "OAuth identity link callback failed",
  });
}

async function restoreOrTerminateSession({
  cookieStore,
  request,
  response,
  session,
  supabase,
}: {
  cookieStore: { getAll(): Array<{ name: string }> };
  request: Request;
  response: NextResponse;
  session: { access_token: string; refresh_token: string };
  supabase: {
    auth: {
      setSession(tokens: { access_token: string; refresh_token: string }): PromiseLike<{
        error: unknown;
      }>;
      signOut(): PromiseLike<unknown>;
    };
  };
}) {
  try {
    const restoreResult = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (!restoreResult.error) {
      return response;
    }
  } catch {
    // Fall through to fail-closed termination.
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // Cookie expiry below is the final fail-closed cleanup.
  }

  return expireSupabaseAuthCookies(response, request, cookieStore);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next") ?? "/mypage");

  try {
    const supabase = await createRouteHandlerClient();
    const beforeResult = await supabase.auth.getUser();
    const beforeUser = beforeResult.data.user;
    if (beforeResult.error || !beforeUser) {
      await recordLinkFailure(request, "link_failed");
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
      ));
    }

    const cookieStore = await cookies();
    const queryProvider = normalizeAuthProviderId(
      requestUrl.searchParams.get("attemptedProvider"),
    );
    const cookieProvider = normalizeAuthProviderId(
      cookieStore.get(AUTH_PROVIDER_ATTEMPT_COOKIE)?.value,
    );
    if (!queryProvider || (cookieProvider && cookieProvider !== queryProvider)) {
      await recordLinkFailure(request, "link_failed");
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
      ));
    }

    if (hasProviderIdentity(beforeUser.identities, queryProvider)) {
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { success: "already_linked" }),
      ));
    }

    const sessionResult = await supabase.auth.getSession();
    const originalSession = sessionResult.data.session;
    if (
      sessionResult.error
      || !originalSession?.access_token
      || !originalSession.refresh_token
    ) {
      await recordLinkFailure(request, "link_failed");
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
      ));
    }

    const code = requestUrl.searchParams.get("code");
    if (!code) {
      const errorCode: LinkErrorCode = requestUrl.searchParams.get("error")
        ? "link_cancelled"
        : "link_failed";
      await recordLinkFailure(request, errorCode);
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { error: errorCode }),
      ));
    }

    let exchangeFailed = false;
    try {
      const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
      exchangeFailed = Boolean(exchangeResult.error);
    } catch {
      exchangeFailed = true;
    }

    if (exchangeFailed) {
      await recordLinkFailure(request, "link_failed");
      return restoreOrTerminateSession({
        cookieStore,
        request,
        response: clearLinkAttemptCookie(NextResponse.redirect(
          buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
        )),
        session: originalSession,
        supabase,
      });
    }

    const afterResult = await supabase.auth.getUser();
    const afterUser = afterResult.data.user;
    if (afterResult.error || !afterUser) {
      await recordLinkFailure(request, "link_failed");
      return restoreOrTerminateSession({
        cookieStore,
        request,
        response: clearLinkAttemptCookie(NextResponse.redirect(
          buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
        )),
        session: originalSession,
        supabase,
      });
    }

    if (afterUser.id !== beforeUser.id) {
      await recordLinkFailure(request, "link_conflict");
      return restoreOrTerminateSession({
        cookieStore,
        request,
        response: clearLinkAttemptCookie(NextResponse.redirect(
          buildLinkRedirect(requestUrl, nextPath, { error: "link_conflict" }),
        )),
        session: originalSession,
        supabase,
      });
    }

    if (!hasProviderIdentity(afterUser.identities, queryProvider)) {
      await recordLinkFailure(request, "link_failed");
      return clearLinkAttemptCookie(NextResponse.redirect(
        buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
      ));
    }

    return clearLinkAttemptCookie(NextResponse.redirect(
      buildLinkRedirect(requestUrl, nextPath, { success: "linked" }),
    ));
  } catch {
    await recordLinkFailure(request, "link_failed");
    return clearLinkAttemptCookie(NextResponse.redirect(
      buildLinkRedirect(requestUrl, nextPath, { error: "link_failed" }),
    ));
  }
}
