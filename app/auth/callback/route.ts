import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import {
  AUTH_PROVIDER_ATTEMPT_COOKIE,
  clearAuthProviderAttemptCookie,
  setLastAuthProviderCookie,
} from "@/lib/auth/provider-cookies";
import {
  hasExplicitlyInvalidEmailEvidence,
  hasVerifiedEmailEvidence,
  resolveActualAuthProvider,
} from "@/lib/auth/provider-resolution";
import { expireSupabaseAuthCookies } from "@/lib/auth/session-cookies";
import {
  parsePostAuthNextCookie,
  POST_AUTH_NEXT_COOKIE,
} from "@/lib/auth/post-auth-next";
import {
  bootstrapAuthCallbackAccountGenerationIdentity,
  readAuthCallbackAccountGenerationCapability,
} from "@/lib/server/account-generation/auth-callback";
import {
  deriveVerifiedAccountGenerationSessionAuthority,
} from "@/lib/server/account-generation/session-authority";
import { recordOperationalEventFromServiceRole } from "@/lib/server/admin-events";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  normalizeUserEmail,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

type AuthFailureCode =
  | "email_required"
  | "account_conflict"
  | "oauth_failed"
  | "provider_resolution_failed"
  | "ACCOUNT_CUTOVER_QUARANTINED"
  | "ACCOUNT_CUTOVER_UNCLASSIFIED"
  | "ACCOUNT_DELETING"
  | "ACCOUNT_DELETION_PENDING"
  | "ACCOUNT_GENERATION_STALE"
  | "ACCOUNT_LIFECYCLE_MAINTENANCE"
  | "ACCOUNT_SESSION_STALE";

interface ActiveUserRow {
  id: string;
  social_provider: "google" | "naver" | "kakao";
}

interface ActiveUserQuery {
  eq(column: string, value: string): ActiveUserQuery;
  is(column: string, value: null): ActiveUserQuery;
  maybeSingle(): PromiseLike<{
    data: ActiveUserRow | null;
    error: { message: string } | null;
  }>;
}

interface ActiveUserDbClient {
  from(table: "users"): { select(columns: string): ActiveUserQuery };
}

function getFailurePath(nextPath: string) {
  return nextPath === "/" ? "/login" : nextPath;
}

function buildFailureRedirectUrl(
  requestUrl: URL,
  nextPath: string,
  code: AuthFailureCode,
) {
  const pathname = code === "account_conflict"
    || code === "provider_resolution_failed"
    || code === "email_required"
    || code === "ACCOUNT_CUTOVER_QUARANTINED"
    || code === "ACCOUNT_CUTOVER_UNCLASSIFIED"
    || code === "ACCOUNT_DELETING"
    || code === "ACCOUNT_DELETION_PENDING"
    || code === "ACCOUNT_GENERATION_STALE"
    || code === "ACCOUNT_LIFECYCLE_MAINTENANCE"
    || code === "ACCOUNT_SESSION_STALE"
    ? "/login"
    : getFailurePath(nextPath);
  const redirectUrl = new URL(pathname, requestUrl.origin);
  redirectUrl.searchParams.set("authError", code);

  if (pathname === "/login" && nextPath !== "/") {
    redirectUrl.searchParams.set("next", nextPath);
  }

  return redirectUrl;
}

function buildNicknameOnboardingRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = new URL("/onboarding/nickname", requestUrl.origin);
  redirectUrl.searchParams.set("next", nextPath);
  return redirectUrl;
}

function buildAccountQuarantineRedirectUrl(
  requestUrl: URL,
  nextPath: string,
) {
  const redirectUrl = new URL("/account-quarantine", requestUrl.origin);
  redirectUrl.searchParams.set("next", nextPath);
  return redirectUrl;
}

function shouldCollectNickname(userRow: { nickname?: unknown }) {
  return typeof userRow.nickname === "string" && userRow.nickname.trim().length === 0;
}

function clearAuthFlowCookies(response: NextResponse) {
  response.cookies.set(POST_AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  clearAuthProviderAttemptCookie(response);
  return response;
}

async function clearPartialSession(
  supabase: { auth: { signOut(): PromiseLike<unknown> } },
  response: NextResponse,
  request: Request,
  cookieStore: { getAll(): Array<{ name: string }> },
) {
  try {
    await supabase.auth.signOut();
  } catch {
    // The response still expires every incoming Supabase auth cookie below.
  }

  return expireSupabaseAuthCookies(response, request, cookieStore);
}

async function findActiveUserByEmail(dbClient: ActiveUserDbClient, email: string) {
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

async function recordAuthFailure(request: Request, errorCode: string) {
  await recordOperationalEventFromServiceRole({
    event_type: "auth_failure",
    severity: "warn",
    source: "auth",
    request,
    http_status: 401,
    error_code: errorCode,
    message_summary: "OAuth callback failed",
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const nextPath = resolveNextPath(
    requestUrl.searchParams.get("next")
      ?? parsePostAuthNextCookie(cookieStore.get(POST_AUTH_NEXT_COOKIE)?.value),
  );
  const code = requestUrl.searchParams.get("code");
  let supabase: Awaited<ReturnType<typeof createRouteHandlerClient>> | null = null;

  if (!code) {
    if (requestUrl.searchParams.get("error")) {
      await recordAuthFailure(request, "OAUTH_PROVIDER_ERROR");
      return clearAuthFlowCookies(NextResponse.redirect(
        buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
      ));
    }

    return clearAuthFlowCookies(
      NextResponse.redirect(new URL(nextPath, requestUrl.origin)),
    );
  }

  try {
    supabase = await createRouteHandlerClient();
    const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeResult.error) {
      await recordAuthFailure(request, "OAUTH_EXCHANGE_FAILED");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
        )),
        request,
        cookieStore,
      );
    }

    const exchangedAccessToken = exchangeResult.data?.session?.access_token;
    const authResult = exchangedAccessToken
      ? await supabase.auth.getUser(exchangedAccessToken)
      : await supabase.auth.getUser();
    const user = authResult.data.user;
    if (authResult.error || !user) {
      await recordAuthFailure(request, "OAUTH_USER_MISSING");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
        )),
        request,
        cookieStore,
      );
    }

    const actualProvider = resolveActualAuthProvider({
      queryAttempt: requestUrl.searchParams.get("attemptedProvider"),
      cookieAttempt: cookieStore.get(AUTH_PROVIDER_ATTEMPT_COOKIE)?.value,
      identities: user.identities,
      userMetadata: user.user_metadata,
    });
    if (!actualProvider) {
      await recordAuthFailure(request, "PROVIDER_RESOLUTION_FAILED");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "provider_resolution_failed"),
        )),
        request,
        cookieStore,
      );
    }

    const email = normalizeUserEmail(user.email);
    if (
      !email
      || hasExplicitlyInvalidEmailEvidence(user.identities, actualProvider)
      || !hasVerifiedEmailEvidence({
        identities: user.identities,
        provider: actualProvider,
        userEmailConfirmedAt: user.email_confirmed_at,
        userMetadata: user.user_metadata,
      })
    ) {
      await recordAuthFailure(request, "EMAIL_REQUIRED");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "email_required"),
        )),
        request,
        cookieStore,
      );
    }

    const serviceRoleClient = createServiceRoleClient();
    if (!serviceRoleClient) {
      await recordAuthFailure(request, "SERVICE_ROLE_UNAVAILABLE");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
        )),
        request,
        cookieStore,
      );
    }

    const capability = await readAuthCallbackAccountGenerationCapability(
      serviceRoleClient,
    );
    if (!capability.ok) {
      await recordAuthFailure(request, "ACCOUNT_GENERATION_CAPABILITY_UNAVAILABLE");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
        )),
        request,
        cookieStore,
      );
    }

    if (capability.state === "cutover_maintenance") {
      await recordAuthFailure(request, "ACCOUNT_LIFECYCLE_MAINTENANCE");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(
            requestUrl,
            nextPath,
            "ACCOUNT_LIFECYCLE_MAINTENANCE",
          ),
        )),
        request,
        cookieStore,
      );
    }

    if (capability.state === "generation_active") {
      const sessionAuthority = exchangedAccessToken
        ? deriveVerifiedAccountGenerationSessionAuthority({
            accessToken: exchangedAccessToken,
            user,
          })
        : null;
      if (!sessionAuthority) {
        await recordAuthFailure(request, "ACCOUNT_SESSION_STALE");
        return clearPartialSession(
          supabase,
          clearAuthFlowCookies(NextResponse.redirect(
            buildFailureRedirectUrl(requestUrl, nextPath, "ACCOUNT_SESSION_STALE"),
          )),
          request,
          cookieStore,
        );
      }

      const bootstrapResult =
        await bootstrapAuthCallbackAccountGenerationIdentity(
          serviceRoleClient,
          sessionAuthority,
        );
      if (!bootstrapResult.ok) {
        const errorCode = bootstrapResult.errorCode ?? "ACCOUNT_SESSION_STALE";
        await recordAuthFailure(request, errorCode);
        if (errorCode === "ACCOUNT_CUTOVER_QUARANTINED") {
          const response = clearAuthFlowCookies(NextResponse.redirect(
            buildAccountQuarantineRedirectUrl(requestUrl, nextPath),
          ));
          setLastAuthProviderCookie(response, actualProvider);
          return response;
        }

        return clearPartialSession(
          supabase,
          clearAuthFlowCookies(NextResponse.redirect(
            buildFailureRedirectUrl(requestUrl, nextPath, errorCode),
          )),
          request,
          cookieStore,
        );
      }

      const redirectUrl = shouldCollectNickname(bootstrapResult)
        ? buildNicknameOnboardingRedirectUrl(requestUrl, nextPath)
        : new URL(nextPath, requestUrl.origin);
      const response = clearAuthFlowCookies(NextResponse.redirect(redirectUrl));
      setLastAuthProviderCookie(response, actualProvider);
      return response;
    }

    const existingUser = await findActiveUserByEmail(
      serviceRoleClient as unknown as ActiveUserDbClient,
      email,
    );
    if (existingUser && existingUser.id !== user.id) {
      await recordAuthFailure(request, "ACCOUNT_CONFLICT");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "account_conflict"),
        )),
        request,
        cookieStore,
      );
    }

    const normalizedUser = { ...user, email };
    const dbClient = serviceRoleClient as unknown as UserBootstrapDbClient;
    const userRow = await ensurePublicUserRow(dbClient, normalizedUser);
    await ensureUserBootstrapState(dbClient, user.id);

    const redirectUrl = shouldCollectNickname(userRow)
      ? buildNicknameOnboardingRedirectUrl(requestUrl, nextPath)
      : new URL(nextPath, requestUrl.origin);
    const response = clearAuthFlowCookies(NextResponse.redirect(redirectUrl));
    setLastAuthProviderCookie(response, actualProvider);
    return response;
  } catch {
    await recordAuthFailure(request, "OAUTH_CALLBACK_UNHANDLED");
    const response = clearAuthFlowCookies(NextResponse.redirect(
      buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
    ));

    return supabase
      ? clearPartialSession(supabase, response, request, cookieStore)
      : expireSupabaseAuthCookies(response, request, cookieStore);
  }
}
