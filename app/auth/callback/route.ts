import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { resolveNextPath } from "@/lib/auth/callback";
import {
  AUTH_PROVIDER_ATTEMPT_COOKIE,
  clearAuthProviderAttemptCookie,
  parseAuthProviderCookie,
  setLastAuthProviderCookie,
} from "@/lib/auth/provider-cookies";
import {
  normalizeAuthProviderId,
  type AuthProviderId,
} from "@/lib/auth/providers";
import {
  parsePostAuthNextCookie,
  POST_AUTH_NEXT_COOKIE,
} from "@/lib/auth/post-auth-next";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { recordOperationalEventFromServiceRole } from "@/lib/server/admin-events";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

function getFailurePath(nextPath: string) {
  return nextPath === "/" ? "/login" : nextPath;
}

function buildFailureRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = new URL(getFailurePath(nextPath), requestUrl.origin);
  redirectUrl.searchParams.set("authError", "oauth_failed");

  return redirectUrl;
}

function buildProviderMismatchRedirectUrl({
  attemptedProvider,
  expectedProvider,
  nextPath,
  requestUrl,
}: {
  attemptedProvider: AuthProviderId | null;
  expectedProvider: AuthProviderId;
  nextPath: string;
  requestUrl: URL;
}) {
  const redirectUrl = new URL("/login", requestUrl.origin);
  redirectUrl.searchParams.set("authError", "provider_mismatch");
  redirectUrl.searchParams.set("expectedProvider", expectedProvider);

  if (attemptedProvider) {
    redirectUrl.searchParams.set("attemptedProvider", attemptedProvider);
  }

  if (nextPath !== "/") {
    redirectUrl.searchParams.set("next", nextPath);
  }

  return redirectUrl;
}

function buildNicknameOnboardingRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = new URL("/onboarding/nickname", requestUrl.origin);
  redirectUrl.searchParams.set("next", nextPath);

  return redirectUrl;
}

function shouldCollectNickname(userRow: { nickname?: unknown }) {
  return typeof userRow.nickname === "string" && userRow.nickname.trim().length === 0;
}

function clearPostAuthNextCookie(response: NextResponse) {
  response.cookies.set(POST_AUTH_NEXT_COOKIE, "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}

function clearAuthFlowCookies(response: NextResponse) {
  clearPostAuthNextCookie(response);
  clearAuthProviderAttemptCookie(response);

  return response;
}

function rememberLastAuthProvider(
  response: NextResponse,
  provider: AuthProviderId | null,
) {
  if (provider) {
    setLastAuthProviderCookie(response, provider);
  }

  return response;
}

interface ActiveUserProviderRow {
  id: string;
  social_provider: AuthProviderId;
}

interface ActiveUserProviderQuery {
  eq(column: string, value: string): ActiveUserProviderQuery;
  is(column: string, value: null): ActiveUserProviderQuery;
  maybeSingle(): PromiseLike<{
    data: ActiveUserProviderRow | null;
    error: { message: string } | null;
  }>;
}

interface ActiveUserProviderDbClient {
  from(table: "users"): {
    select(columns: string): ActiveUserProviderQuery;
  };
}

async function findActiveUserProviderByEmail(
  dbClient: ActiveUserProviderDbClient,
  email: string,
) {
  const result = await dbClient
    .from("users")
    .select("id, social_provider")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function resolveAttemptedProvider({
  cookieProvider,
  queryProvider,
  userAppProvider,
  userMetadataProvider,
}: {
  cookieProvider: string | undefined;
  queryProvider: string | null;
  userAppProvider: unknown;
  userMetadataProvider: unknown;
}) {
  return (
    normalizeAuthProviderId(queryProvider)
    ?? parseAuthProviderCookie(cookieProvider)
    ?? normalizeAuthProviderId(userAppProvider)
    ?? normalizeAuthProviderId(userMetadataProvider)
  );
}

async function recordAuthFailure(request: Request, errorCode: string) {
  await recordOperationalEventFromServiceRole({
    event_type: "auth_failure",
    severity: "warn",
    source: "auth",
    request,
    http_status: 401,
    error_code: errorCode,
    message_summary: "OAuth callback authentication failed",
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const cookieNextPath = parsePostAuthNextCookie(
    cookieStore.get(POST_AUTH_NEXT_COOKIE)?.value,
  );
  const cookieAttemptedProvider = cookieStore.get(AUTH_PROVIDER_ATTEMPT_COOKIE)?.value;
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next") ?? cookieNextPath);
  const oauthError = requestUrl.searchParams.get("error");

  if (!code) {
    if (oauthError) {
      await recordAuthFailure(request, "OAUTH_PROVIDER_ERROR");
      return clearAuthFlowCookies(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    return clearAuthFlowCookies(
      NextResponse.redirect(new URL(nextPath, requestUrl.origin)),
    );
  }

  try {
    const supabase = await createRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectUrl = new URL(nextPath, requestUrl.origin);

    if (error) {
      await recordAuthFailure(request, "OAUTH_EXCHANGE_FAILED");
      return clearAuthFlowCookies(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    const authResult = await supabase.auth.getUser();
    const user = authResult.data.user;

    if (!user) {
      await recordAuthFailure(request, "OAUTH_USER_MISSING");
      return clearAuthFlowCookies(
        NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
      );
    }

    const serviceRoleClient = createServiceRoleClient();
    const dbClient = (serviceRoleClient ?? supabase) as unknown as UserBootstrapDbClient;
    const attemptedProvider = resolveAttemptedProvider({
      cookieProvider: cookieAttemptedProvider,
      queryProvider: requestUrl.searchParams.get("attemptedProvider"),
      userAppProvider: user.app_metadata?.provider,
      userMetadataProvider: user.user_metadata?.provider,
    });

    if (user.email && serviceRoleClient) {
      const existingUserProvider = await findActiveUserProviderByEmail(
        serviceRoleClient as unknown as ActiveUserProviderDbClient,
        user.email,
      );

      if (
        existingUserProvider
        && attemptedProvider
        && existingUserProvider.social_provider !== attemptedProvider
      ) {
        await supabase.auth.signOut();

        return clearAuthFlowCookies(
          NextResponse.redirect(
            buildProviderMismatchRedirectUrl({
              attemptedProvider,
              expectedProvider: existingUserProvider.social_provider,
              nextPath,
              requestUrl,
            }),
          ),
        );
      }
    }

    const userRow = await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);

    if (shouldCollectNickname(userRow)) {
      return rememberLastAuthProvider(
        clearAuthFlowCookies(
          NextResponse.redirect(
            buildNicknameOnboardingRedirectUrl(requestUrl, nextPath),
          ),
        ),
        attemptedProvider,
      );
    }

    return rememberLastAuthProvider(
      clearAuthFlowCookies(NextResponse.redirect(redirectUrl)),
      attemptedProvider,
    );
  } catch {
    await recordAuthFailure(request, "OAUTH_CALLBACK_UNHANDLED");
    return clearAuthFlowCookies(
      NextResponse.redirect(buildFailureRedirectUrl(requestUrl, nextPath)),
    );
  }
}
