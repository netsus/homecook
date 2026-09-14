import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import { buildSameAppRedirectUrl } from "@/lib/auth/redirect-origin";
import {
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
  readCallbackAuthFlow,
  terminalCallbackAuthFlow,
} from "@/lib/server/full-local-auth/callback-flow";
import { AUTH_FLOW_COOKIE_NAME } from "@/lib/server/full-local-auth/flow-ledger";
import {
  prepareFullLocalSessionAuthority,
  recordFullLocalSessionAuthority,
} from "@/lib/server/full-local-auth/session-authority";
import {
  normalizeUserEmail,
} from "@/lib/server/user-bootstrap";
import {
  bootstrapLegacyAuthCallbackIdentity,
  bootstrapAuthCallbackSessionAuthority,
  createAuthCallbackOperationsClient,
  createAuthRouteHandlerClient,
} from "@/lib/supabase/server";
import { getAuthAuthority } from "@/lib/supabase/auth-env";

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
  const redirectUrl = buildSameAppRedirectUrl(pathname, requestUrl);
  redirectUrl.searchParams.set("authError", code);

  if (pathname === "/login" && nextPath !== "/") {
    redirectUrl.searchParams.set("next", nextPath);
  }

  return redirectUrl;
}

function buildNicknameOnboardingRedirectUrl(requestUrl: URL, nextPath: string) {
  const redirectUrl = buildSameAppRedirectUrl("/onboarding/nickname", requestUrl);
  redirectUrl.searchParams.set("next", nextPath);
  return redirectUrl;
}

function buildAccountQuarantineRedirectUrl(
  requestUrl: URL,
  nextPath: string,
) {
  const redirectUrl = buildSameAppRedirectUrl("/account-quarantine", requestUrl);
  redirectUrl.searchParams.set("next", nextPath);
  return redirectUrl;
}

function shouldCollectNickname(userRow: { nickname?: unknown }) {
  return typeof userRow.nickname === "string" && userRow.nickname.trim().length === 0;
}

function clearAuthFlowCookies(response: NextResponse) {
  response.cookies.set(POST_AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(AUTH_FLOW_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
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
  const authFlowCookie = cookieStore.get(AUTH_FLOW_COOKIE_NAME)?.value;
  const authFlow = await readCallbackAuthFlow({
    cookieValue: authFlowCookie,
    expectedFlowKind: "login",
    providerHint: requestUrl.searchParams.get("attemptedProvider"),
  });
  let supabase: Awaited<ReturnType<typeof createAuthRouteHandlerClient>> | null =
    null;

  if (!authFlow.ok) {
    await recordAuthFailure(request, "AUTH_FLOW_INVALID");
    return clearAuthFlowCookies(NextResponse.redirect(
      buildFailureRedirectUrl(requestUrl, nextPath, "provider_resolution_failed"),
    ));
  }

  if (!code) {
    if (authFlowCookie) {
      await terminalCallbackAuthFlow(authFlowCookie, "error");
    }
    if (requestUrl.searchParams.get("error")) {
      await recordAuthFailure(request, "OAUTH_PROVIDER_ERROR");
      return clearAuthFlowCookies(NextResponse.redirect(
        buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
      ));
    }

    return clearAuthFlowCookies(
      NextResponse.redirect(buildSameAppRedirectUrl(nextPath, requestUrl)),
    );
  }

  let flowSucceeded = false;
  try {
    supabase = await createAuthRouteHandlerClient();
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
      queryAttempt: authFlow.provider,
      cookieAttempt: null,
      identities: user.identities,
      userMetadata: user.user_metadata,
    });
    if (!actualProvider || actualProvider !== authFlow.provider) {
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

    const serviceRoleClient = createAuthCallbackOperationsClient();
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

    const hybridBootstrap = await bootstrapAuthCallbackSessionAuthority({
      accessToken: exchangedAccessToken,
      client: serviceRoleClient,
      user,
    });
    if (!hybridBootstrap.ok) {
      const errorCode = hybridBootstrap.reason === "maintenance"
        ? "ACCOUNT_LIFECYCLE_MAINTENANCE"
        : "ACCOUNT_SESSION_STALE";
      await recordAuthFailure(request, errorCode);
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, errorCode),
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
      const localPrepared = getAuthAuthority() === "local" && exchangedAccessToken
        ? await prepareFullLocalSessionAuthority({
            accessToken: exchangedAccessToken,
            client: serviceRoleClient,
            user,
          })
        : null;
      const sessionAuthority = getAuthAuthority() === "local"
        ? localPrepared?.ok
          ? localPrepared.accountBootstrap
          : null
        : exchangedAccessToken
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

      if (localPrepared?.ok) {
        const localBinding = await recordFullLocalSessionAuthority({
          client: serviceRoleClient,
          record: localPrepared.record,
        });
        if (!localBinding.ok) {
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
      }

      const terminal = authFlowCookie
        ? await terminalCallbackAuthFlow(authFlowCookie, "success")
        : { ok: false as const };
      if (!terminal.ok) {
        await recordAuthFailure(request, "AUTH_FLOW_TERMINAL_FAILED");
        return clearPartialSession(
          supabase,
          clearAuthFlowCookies(NextResponse.redirect(
            buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
          )),
          request,
          cookieStore,
        );
      }
      flowSucceeded = true;

      const redirectUrl = shouldCollectNickname(bootstrapResult)
        ? buildNicknameOnboardingRedirectUrl(requestUrl, nextPath)
        : buildSameAppRedirectUrl(nextPath, requestUrl);
      const response = clearAuthFlowCookies(NextResponse.redirect(redirectUrl));
      setLastAuthProviderCookie(response, actualProvider);
      return response;
    }

    const legacyBootstrap = await bootstrapLegacyAuthCallbackIdentity(
      serviceRoleClient,
      { ...user, email },
    );
    if (!legacyBootstrap.ok) {
      if (legacyBootstrap.reason === "account_conflict") {
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
      if (
        legacyBootstrap.reason === "maintenance"
        || legacyBootstrap.reason === "stale"
      ) {
        await recordAuthFailure(request, legacyBootstrap.errorCode);
        return clearPartialSession(
          supabase,
          clearAuthFlowCookies(NextResponse.redirect(
            buildFailureRedirectUrl(
              requestUrl,
              nextPath,
              legacyBootstrap.errorCode,
            ),
          )),
          request,
          cookieStore,
        );
      }
      throw new Error("legacy callback bootstrap failed");
    }

    const redirectUrl = shouldCollectNickname(legacyBootstrap)
      ? buildNicknameOnboardingRedirectUrl(requestUrl, nextPath)
      : buildSameAppRedirectUrl(nextPath, requestUrl);
    const terminal = authFlowCookie
      ? await terminalCallbackAuthFlow(authFlowCookie, "success")
      : { ok: false as const };
    if (!terminal.ok) {
      await recordAuthFailure(request, "AUTH_FLOW_TERMINAL_FAILED");
      return clearPartialSession(
        supabase,
        clearAuthFlowCookies(NextResponse.redirect(
          buildFailureRedirectUrl(requestUrl, nextPath, "oauth_failed"),
        )),
        request,
        cookieStore,
      );
    }
    flowSucceeded = true;
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
  } finally {
    if (!flowSucceeded && authFlowCookie) {
      await terminalCallbackAuthFlow(authFlowCookie, "error");
    }
  }
}
