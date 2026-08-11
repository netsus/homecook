import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import {
  HybridLifecycleMaintenanceError,
  HybridSessionAuthorityError,
  createHybridAuthorityMarker,
  createHybridAuthorityFetch,
} from "@/lib/server/hybrid-auth/gateway";
import {
  createRemoteRefreshAuthorityFetch,
  recordHybridSessionAuthorityBootstrap,
} from "@/lib/server/hybrid-auth/bootstrap";
import { createHybridShadowReadFetch } from "@/lib/server/hybrid-auth/shadow-read";
import {
  beginHybridAuthorityResponseBoundary,
} from "@/lib/server/hybrid-auth/route-error-context";
import {
  readSessionAuthorityFailureReason,
  type SessionAuthorityFailureReason,
} from "@/lib/server/hybrid-auth/session-observability";
import {
  prepareFullLocalSessionAuthority,
  readFullLocalSessionControl,
  recordFullLocalSessionAuthority,
} from "@/lib/server/full-local-auth/session-authority";
import {
  buildLegacyAuthCallbackProfile,
  ensurePublicUserRow,
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import type { HybridPublicReadScope } from
  "@/lib/server/hybrid-auth/public-read-policy";
import {
  getAuthAuthority,
  getAuthServiceRoleKey,
  getAuthSupabaseEnv,
  getAuthSupabaseServerEnv,
  getDataServiceRoleKey,
  getDataSupabaseEnv,
  getLocalDataServiceRoleKey,
  getLocalShadowDataEnv,
} from "@/lib/supabase/env";

function requireHmacSecret(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} 환경 변수는 32 bytes 이상이어야 해요.`);
  }

  return value;
}

async function createAuthServerClient({
  allowCookieWrites,
}: {
  allowCookieWrites: boolean;
}) {
  const cookieStore = await cookies();
  const { url, anonKey } = getAuthSupabaseEnv();
  const dataEnv = getDataSupabaseEnv();
  const shadowFetch = dataEnv.authority === "local-shadow"
    ? createLocalShadowReadFetch()
    : undefined;
  const refreshFetch = dataEnv.authority === "local"
    ? createRemoteRefreshAuthorityFetch({
        auth: {
          publishableKey: anonKey,
          url,
        },
        bootstrap: async ({ accessToken, user }) => {
          const client = createAuthRefreshInternalDataClient();
          if (!client) {
            return { ok: false as const, reason: "maintenance" as const };
          }

          return bootstrapAuthRefreshSessionAuthority({
            accessToken,
            client,
            user,
          });
        },
      })
    : undefined;
  const authFetch = shadowFetch ?? refreshFetch;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (!allowCookieWrites) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              return;
            }

            return;
          }

          cookieStore.set(name, value, options);
        });
      },
    },
    ...(authFetch ? { global: { fetch: authFetch } } : {}),
  });
}

type LocalAuthorityClient = { rpc: unknown };

function createAssertSessionAuthority(
  authorityClient: LocalAuthorityClient,
) {
  return async ({
    accessTokenExpiresAt,
    binding,
    authCutoverEpoch,
    lastTokenIssuedAt,
    sessionId,
    sessionIssuedAt,
    verifiedAt,
  }: Parameters<
    NonNullable<
      Parameters<typeof createHybridAuthorityFetch>[0]["assertSessionAuthority"]
    >
  >[0]) => {
    const rpc = authorityClient.rpc as (
      functionName: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: unknown }>;
    const localAuthority = getAuthAuthority() === "local";
    if (
      localAuthority
      && (
        !Number.isSafeInteger(authCutoverEpoch)
        || Number(authCutoverEpoch) <= 0
        || typeof sessionIssuedAt !== "string"
      )
    ) {
      throw new HybridSessionAuthorityError("auth_unavailable");
    }
    const { error } = await rpc.call(
      authorityClient,
      localAuthority
        ? "assert_and_renew_full_local_session_authority_v2"
        : "assert_hybrid_remote_session_authority",
      localAuthority
        ? {
            p_access_token_expires_at: accessTokenExpiresAt,
            p_binding_expires_at: binding.binding_expires_at,
            p_issuer: binding.issuer,
            p_owner_uuid: binding.owner_uuid,
            p_identity_created_at: binding.identity_created_at,
            p_session_id: sessionId,
            p_session_key_hash: binding.session_key_hash,
            p_hmac_key_version: binding.hmac_key_version,
            p_auth_cutover_epoch: authCutoverEpoch,
            p_last_token_issued_at: lastTokenIssuedAt,
            p_session_issued_at: sessionIssuedAt,
            p_verified_at: verifiedAt,
          }
        : {
            p_issuer: binding.issuer,
            p_owner_uuid: binding.owner_uuid,
            p_identity_created_at: binding.identity_created_at,
            p_session_key_hash: binding.session_key_hash,
            p_hmac_key_version: binding.hmac_key_version,
          },
    );
    if (error) {
      const message = String(
        (error as { message?: unknown; details?: unknown; hint?: unknown })
          ?.message
          ?? (error as { details?: unknown })?.details
          ?? (error as { hint?: unknown })?.hint
          ?? "",
      );
      if (
        message.includes(
          createHybridAuthorityMarker(new HybridLifecycleMaintenanceError()),
        )
        || message.includes("ACCOUNT_LIFECYCLE_MAINTENANCE")
      ) {
        throw new HybridLifecycleMaintenanceError();
      }
      throw new HybridSessionAuthorityError(
        readSessionAuthorityFailureReason(error),
      );
    }
  };
}

function createGuardedLocalFetch({
  authorityClient,
  getAccessToken,
  anonymousPublicReadScope,
}: {
  authorityClient: LocalAuthorityClient;
  getAccessToken: () => Promise<string | null>;
  anonymousPublicReadScope?: HybridPublicReadScope;
}) {
  const authEnv = getAuthSupabaseEnv();
  const localAuthority = getAuthAuthority() === "local";
  const observabilityClient = localAuthority
    ? createSessionObservabilityInternalRpcClient()
    : null;
  return createHybridAuthorityFetch({
    getAccessToken,
    auth: {
      issuer: authEnv.issuer,
      url: authEnv.url,
      publishableKey: authEnv.anonKey,
    },
    attestationSecret: requireHmacSecret(
      "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
    ),
    ...(localAuthority ? {
      resolveSessionBindingKey: async () => {
        const result = await readFullLocalSessionControl(authorityClient as {
          rpc: (functionName: string, args?: Record<string, unknown>) => PromiseLike<{
            data?: unknown;
            error?: unknown;
          }>;
        });
        if (!result.ok) {
          throw new HybridSessionAuthorityError();
        }
        const keyVersion = result.control.hmac_key_version;
        return {
          authCutoverEpoch: result.control.cutover_epoch,
          keyVersion,
          secret: requireHmacSecret(
            `HOMECOOK_SESSION_GENERATION_HMAC_KEY_V${keyVersion}`,
          ),
        };
      },
    } : {
      sessionBindingSecret: requireHmacSecret(
        "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      ),
    }),
    assertSessionAuthority: createAssertSessionAuthority(authorityClient),
    ...(observabilityClient ? {
      recordSessionAuthorityFailure: async (
        reason: SessionAuthorityFailureReason,
      ) => {
        const result = await observabilityClient.rpc(
          "record_full_local_session_stale_observation",
          { p_reason: reason },
        );
        if (result.error) {
          throw result.error;
        }
      },
    } : {}),
    anonymousPublicReadScope,
  });
}

function createLocalShadowReadFetch() {
  const localEnv = getLocalShadowDataEnv();
  const localServiceRoleKey = getLocalDataServiceRoleKey();
  if (!localServiceRoleKey) {
    throw new Error(
      "local-shadow Data authority에는 DATA_SUPABASE_SECRET_KEY가 필요해요.",
    );
  }
  const authorityClient = createRequestAuthorityInternalClient({
    key: localServiceRoleKey,
    url: localEnv.url,
  });
  if (!authorityClient) {
    throw new Error(
      "local-shadow Data authority에는 scoped authority client가 필요해요.",
    );
  }

  return createHybridShadowReadFetch({
    localDataUrl: localEnv.url,
    localFetch: async (input, init) => {
      const request = new Request(input, init);
      const authorization = request.headers.get("authorization") ?? "";
      const accessToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : null;
      const guardedFetch = createGuardedLocalFetch({
        authorityClient,
        getAccessToken: async () => accessToken,
      });
      return guardedFetch(input, init);
    },
  });
}

function bindClientMember(
  client: object,
  property: PropertyKey,
) {
  const value = Reflect.get(client, property);
  return typeof value === "function" ? value.bind(client) : value;
}

function attachLocalDataAuthority<TAuthClient extends object>(
  authClient: TAuthClient,
  anonymousPublicReadScope?: HybridPublicReadScope,
): TAuthClient {
  const dataEnv = getDataSupabaseEnv();
  if (dataEnv.authority !== "local") {
    return authClient;
  }
  const authorityClient = createRequestAuthorityInternalClient();
  if (!authorityClient) {
    throw new Error(
      "local Data authority에는 DATA_SUPABASE_SECRET_KEY가 필요해요.",
    );
  }

  const authorityFetch = createGuardedLocalFetch({
    authorityClient,
    getAccessToken: async () => {
      const auth = Reflect.get(authClient, "auth") as {
        getSession(): Promise<{
          data: { session: { access_token?: string } | null };
          error: unknown;
        }>;
      };
      const result = await auth.getSession();
      return result.error ? null : result.data.session?.access_token ?? null;
    },
    anonymousPublicReadScope,
  });
  const dataClient = createClient(dataEnv.url, dataEnv.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: authorityFetch,
    },
  });
  const dataMembers = new Set<PropertyKey>([
    "from",
    "functions",
    "realtime",
    "rpc",
    "schema",
    "storage",
  ]);

  return new Proxy(authClient, {
    get(target, property) {
      return dataMembers.has(property)
        ? bindClientMember(dataClient, property)
        : bindClientMember(target, property);
    },
  }) as TAuthClient;
}

export async function createAuthRouteHandlerClient() {
  return createAuthServerClient({ allowCookieWrites: true });
}

export async function createAuthServerComponentClient() {
  return createAuthServerClient({ allowCookieWrites: false });
}

/**
 * Compatibility facade: browser and SSR Auth stay on the selected public HTTPS
 * origin. In `local` Data mode, Data/RPC/Storage members are delegated to a
 * request-scoped local client guarded by session liveness and HMAC attestation.
 */
export async function createRouteHandlerClient(options?: {
  anonymousPublicReadScope?: HybridPublicReadScope;
}) {
  beginHybridAuthorityResponseBoundary();
  const authClient = await createAuthRouteHandlerClient();
  return attachLocalDataAuthority(
    authClient,
    options?.anonymousPublicReadScope,
  );
}

export async function createDataRouteHandlerClient() {
  return createRouteHandlerClient();
}

export async function createServerComponentClient() {
  const authClient = await createAuthServerComponentClient();
  return attachLocalDataAuthority(authClient);
}

export async function createServerDataComponentClient() {
  return createServerComponentClient();
}

export function createDataServiceRoleClient() {
  const { url } = getDataSupabaseEnv();
  const serviceRoleKey = getDataServiceRoleKey();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type LocalInternalScope =
  | "account-lifecycle"
  | "admin-data"
  | "auth-callback"
  | "auth-flow"
  | "auth-refresh"
  | "future-meal-write"
  | "not-found-feedback"
  | "operational-event"
  | "recipe-future-propagation"
  | "recipe-image"
  | "request-authority"
  | "session-observability"
  | "session-logout"
  | "shopping-create"
  | "snapshot-v2-session"
  | "youtube-extraction"
  | "youtube-ingredient-registration";

function createScopedDataServiceRoleClient(
  scope: LocalInternalScope,
  override?: { key: string; url: string },
) {
  const { url } = override ?? getDataSupabaseEnv();
  const serviceRoleKey = override?.key ?? getDataServiceRoleKey();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-homecook-internal-scope": scope,
      },
    },
  });
}

function exactInternalFrom(
  client: NonNullable<ReturnType<typeof createScopedDataServiceRoleClient>>,
  allowedTables: ReadonlySet<string>,
) {
  return (table: string) => {
    if (!allowedTables.has(table)) {
      throw new Error(`Internal Data scope denied table: ${table}`);
    }
    return client.from(table);
  };
}

function createRequestAuthorityInternalClient(
  override?: { key: string; url: string },
) {
  return createScopedDataServiceRoleClient("request-authority", override);
}

/**
 * Legacy internal helper. It is deliberately Data-scoped and never falls back
 * from a missing local secret to a user client.
 */
export function createServiceRoleClient() {
  return createDataServiceRoleClient();
}

const RECIPE_FUTURE_PROPAGATION_READ_TABLES = new Set([
  "ingredient_conversion_assignments",
  "ingredient_nutrition_profiles",
]);

export function createRecipeFuturePropagationInternalClient() {
  const client = createScopedDataServiceRoleClient(
    "recipe-future-propagation",
  );
  if (!client) {
    return null;
  }
  return {
    from: exactInternalFrom(client, RECIPE_FUTURE_PROPAGATION_READ_TABLES),
    rpc: client.rpc.bind(client),
  };
}

function createScopedInternalRpcClient(scope: LocalInternalScope) {
  const client = createScopedDataServiceRoleClient(scope);
  return client ? { rpc: client.rpc.bind(client) } : null;
}

export function createSnapshotV2SessionInternalClient() {
  return createScopedInternalRpcClient("snapshot-v2-session");
}

// Cooked-batch RPCs share the already isolated snapshot-v2 session scope.
// Keep this as an alias so the scope factory remains single-source.
export const createCookedBatchInternalClient =
  createSnapshotV2SessionInternalClient;

export function createFutureMealWriteInternalClient() {
  return createScopedInternalRpcClient("future-meal-write");
}

export function createShoppingCreateInternalClient() {
  return createScopedInternalRpcClient("shopping-create");
}

export function createAuthCallbackInternalDataClient() {
  const client = createScopedDataServiceRoleClient("auth-callback");
  if (!client) {
    return null;
  }
  if (getDataSupabaseEnv().authority !== "local") {
    return client;
  }
  return {
    rpc: client.rpc.bind(client),
  };
}

export function createAuthFlowInternalDataClient() {
  const client = createScopedDataServiceRoleClient("auth-flow");
  return client ? { rpc: client.rpc.bind(client) } : null;
}

export const createAuthCallbackOperationsClient =
  createAuthCallbackInternalDataClient;

type LegacyAuthCallbackUser = Parameters<
  typeof buildLegacyAuthCallbackProfile
>[0];

type LegacyAuthCallbackBootstrapResult =
  | {
      ok: true;
      nickname: string;
    }
  | {
      ok: false;
      reason: "account_conflict";
    }
  | {
      ok: false;
      reason: "maintenance";
      errorCode: "ACCOUNT_LIFECYCLE_MAINTENANCE";
    }
  | {
      ok: false;
      reason: "stale";
      errorCode: "ACCOUNT_SESSION_STALE";
    }
  | {
      ok: false;
      reason: "unexpected";
      errorCode: null;
    };

function classifyLegacyAuthCallbackError(
  error: unknown,
): Extract<LegacyAuthCallbackBootstrapResult, { ok: false }> {
  if (!error || typeof error !== "object") {
    return { ok: false, reason: "unexpected", errorCode: null };
  }
  const candidate = error as Record<string, unknown>;
  const detail = ["code", "message", "details", "hint"]
    .map((key) => candidate[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (detail.includes("ACCOUNT_LIFECYCLE_MAINTENANCE")) {
    return {
      ok: false,
      reason: "maintenance",
      errorCode: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    };
  }
  if (detail.includes("ACCOUNT_SESSION_STALE")) {
    return {
      ok: false,
      reason: "stale",
      errorCode: "ACCOUNT_SESSION_STALE",
    };
  }
  return { ok: false, reason: "unexpected", errorCode: null };
}

export async function bootstrapLegacyAuthCallbackIdentity(
  client: NonNullable<ReturnType<typeof createAuthCallbackInternalDataClient>>,
  user: LegacyAuthCallbackUser,
): Promise<LegacyAuthCallbackBootstrapResult> {
  if (getDataSupabaseEnv().authority !== "local") {
    const dbClient = client as unknown as UserBootstrapDbClient;
    const lookupClient = client as unknown as {
      from(table: "users"): {
        select(columns: string): {
          eq(column: string, value: string): {
            is(column: string, value: null): {
              maybeSingle(): PromiseLike<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
    const existing = await lookupClient
      .from("users")
      .select("id")
      .eq("email", user.email ?? "")
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) {
      throw new Error(existing.error.message);
    }
    if (existing.data && existing.data.id !== user.id) {
      return { ok: false as const, reason: "account_conflict" as const };
    }
    const userRow = await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
    return {
      ok: true as const,
      nickname: userRow.nickname,
    };
  }

  const profile = buildLegacyAuthCallbackProfile(user);
  let result;
  try {
    result = await client.rpc(
      "bootstrap_legacy_auth_callback_identity",
      {
        p_email: profile.email,
        p_nickname: profile.nickname,
        p_owner_uuid: profile.ownerUuid,
        p_profile_image_url: profile.profileImageUrl,
        p_social_id: profile.socialId,
        p_social_provider: profile.socialProvider,
      },
    );
  } catch (error) {
    return classifyLegacyAuthCallbackError(error);
  }
  if (result.error) {
    return classifyLegacyAuthCallbackError(result.error);
  }
  if (!result.data || typeof result.data !== "object") {
    return { ok: false, reason: "unexpected", errorCode: null };
  }
  const data = result.data as {
    nickname?: unknown;
    status?: unknown;
  };
  if (data.status === "account_conflict") {
    return { ok: false as const, reason: "account_conflict" as const };
  }
  if (data.status !== "ok" || typeof data.nickname !== "string") {
    return { ok: false, reason: "unexpected", errorCode: null };
  }
  return {
    ok: true as const,
    nickname: data.nickname,
  };
}

export function createAuthRefreshInternalDataClient() {
  return createScopedDataServiceRoleClient("auth-refresh");
}

export function createSessionLogoutInternalDataClient() {
  return createScopedDataServiceRoleClient("session-logout");
}

export function createSessionObservabilityInternalRpcClient() {
  return createScopedInternalRpcClient("session-observability");
}

export function createSessionAuthorityInternalRpcClient() {
  return createScopedInternalRpcClient("request-authority");
}

export function createRecipeImageInternalClient() {
  const client = createScopedDataServiceRoleClient("recipe-image");
  return client
    ? {
        from: exactInternalFrom(client, new Set(["operational_events"])),
        rpc: client.rpc.bind(client),
        storage: client.storage,
      }
    : null;
}

export function createAccountLifecycleInternalRpcClient() {
  const client = createScopedDataServiceRoleClient("account-lifecycle");
  return client
    ? {
        from: exactInternalFrom(client, new Set(["operational_events"])),
        rpc: client.rpc.bind(client),
      }
    : null;
}

export function createYoutubeIngredientRegistrationInternalRpcClient() {
  const client = createScopedDataServiceRoleClient(
    "youtube-ingredient-registration",
  );
  return client
    ? {
        rpc: client.rpc.bind(client),
      }
    : null;
}

const YOUTUBE_EXTRACTION_TABLES = new Set([
  "youtube_extraction_sessions",
  "youtube_extraction_candidates",
  "youtube_transcript_cache",
  "youtube_transcript_fetch_events",
  "youtube_llm_extraction_cache",
  "youtube_llm_extraction_events",
  "youtube_visual_extraction_cache",
  "youtube_visual_extraction_events",
  "cooking_methods",
]);

export function createYoutubeExtractionInternalClient() {
  const client = createScopedDataServiceRoleClient("youtube-extraction");
  return client
    ? {
        from: exactInternalFrom(client, YOUTUBE_EXTRACTION_TABLES),
      }
    : null;
}

const ADMIN_DATA_TABLES = new Set([
  "admin_audit_logs",
  "admin_members",
  "meals",
  "operational_events",
  "pantry_items",
  "recipe_books",
  "shopping_lists",
  "users",
]);

export function createAdminDataInternalClient() {
  const client = createScopedDataServiceRoleClient("admin-data");
  return client
    ? {
        from: exactInternalFrom(client, ADMIN_DATA_TABLES),
      }
    : null;
}

export function createNotFoundFeedbackInternalClient() {
  const client = createScopedDataServiceRoleClient("not-found-feedback");
  return client
    ? {
        rpc: client.rpc.bind(client),
      }
    : null;
}

export function createOperationalEventInternalClient() {
  const client = createScopedDataServiceRoleClient("operational-event");
  return client
    ? {
        rpc: client.rpc.bind(client),
      }
    : null;
}

export async function bootstrapAuthCallbackSessionAuthority({
  accessToken,
  client,
  user,
}: {
  accessToken: string | undefined;
  client: NonNullable<ReturnType<typeof createAuthCallbackInternalDataClient>>;
  user: {
    id: string;
    created_at?: string;
  };
}) {
  if (getAuthAuthority() === "local") {
    return { ok: true as const };
  }
  if (getDataSupabaseEnv().authority !== "local") {
    return { ok: true as const };
  }
  if (!accessToken || !user.created_at) {
    return { ok: false as const, reason: "stale" as const };
  }

  const authEnv = getAuthSupabaseEnv();
  return recordHybridSessionAuthorityBootstrap({
    accessToken,
    dbClient: client,
    expectedIssuer: authEnv.issuer,
    sessionBindingSecret: requireHmacSecret(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
    ),
    user: {
      id: user.id,
      created_at: user.created_at,
    },
  });
}

async function bootstrapAuthRefreshSessionAuthority({
  accessToken,
  client,
  user,
}: {
  accessToken: string;
  client: NonNullable<ReturnType<typeof createAuthRefreshInternalDataClient>>;
  user: { id: string; created_at: string };
}) {
  if (getAuthAuthority() !== "local") {
    return bootstrapAuthCallbackSessionAuthority({ accessToken, client, user });
  }
  const prepared = await prepareFullLocalSessionAuthority({
    accessToken,
    client,
    user,
  });
  if (!prepared.ok) {
    return prepared;
  }
  return recordFullLocalSessionAuthority({
    client,
    record: prepared.record,
  });
}

/**
 * Keeps legacy service-key behavior only while the authoritative Data plane
 * is remote. At local cutover this returns null instead of bypassing local RLS.
 */
export function createRemoteCompatibilityServiceRoleClient() {
  return getDataSupabaseEnv().authority === "local"
    ? null
    : createDataServiceRoleClient();
}

export function createAuthServiceRoleClient() {
  const { url } = getAuthSupabaseServerEnv();
  const serviceRoleKey = getAuthServiceRoleKey();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createPublicDataClient() {
  const { url, anonKey } = getDataSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getServerAuthUser() {
  const supabase = await createAuthServerComponentClient();
  const authResult = await supabase.auth.getUser();

  return authResult.data.user ?? null;
}
