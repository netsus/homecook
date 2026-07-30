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
  buildLegacyAuthCallbackProfile,
  ensurePublicUserRow,
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import type { HybridPublicReadScope } from
  "@/lib/server/hybrid-auth/public-read-policy";
import {
  getAuthServiceRoleKey,
  getAuthSupabaseEnv,
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

          return bootstrapAuthCallbackSessionAuthority({
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
    binding,
  }: Parameters<
    NonNullable<
      Parameters<typeof createHybridAuthorityFetch>[0]["assertSessionAuthority"]
    >
  >[0]) => {
    const rpc = authorityClient.rpc as (
      functionName: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: unknown }>;
    const { error } = await rpc.call(
      authorityClient,
      "assert_hybrid_remote_session_authority",
      {
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
      throw new HybridSessionAuthorityError();
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
    sessionBindingSecret: requireHmacSecret(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
    ),
    assertSessionAuthority: createAssertSessionAuthority(authorityClient),
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
 * Compatibility facade: Auth always stays remote. In `local` mode Data/RPC/
 * Storage members are delegated to a request-scoped local client whose fetch
 * is guarded by remote `/auth/v1/user` liveness and HMAC attestation.
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
  | "auth-refresh"
  | "not-found-feedback"
  | "operational-event"
  | "recipe-image"
  | "request-authority"
  | "session-logout"
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
  const { url } = getAuthSupabaseEnv();
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
