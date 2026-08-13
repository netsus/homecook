import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const createServerClient = vi.fn();
const createClient = vi.fn();
const createHybridAuthorityFetch = vi.fn();
const createRemoteRefreshAuthorityFetch = vi.fn();
const getSupabaseEnv = vi.fn();
const getAuthAuthority = vi.fn();
const getAuthSupabaseServerEnv = vi.fn();
const getServiceRoleKey = vi.fn();
const getLocalShadowDataEnv = vi.fn();
const getLocalDataServiceRoleKey = vi.fn();
const createHybridShadowReadFetch = vi.fn();
const cookieGetAll = vi.fn();
const cookieSet = vi.fn();

function readAllMigrationSql() {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");

  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n\n");
}

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/server/hybrid-auth/gateway", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/hybrid-auth/gateway")
  >("@/lib/server/hybrid-auth/gateway");
  return {
    ...actual,
    createHybridAuthorityFetch,
  };
});

vi.mock("@/lib/server/hybrid-auth/bootstrap", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/hybrid-auth/bootstrap")
  >("@/lib/server/hybrid-auth/bootstrap");
  return {
    ...actual,
    createRemoteRefreshAuthorityFetch,
  };
});

vi.mock("@/lib/server/hybrid-auth/shadow-read", () => ({
  createHybridShadowReadFetch,
}));

vi.mock("@/lib/supabase/env", () => ({
  getAuthAuthority,
  getAuthSupabaseEnv: getSupabaseEnv,
  getAuthSupabaseServerEnv,
  getDataSupabaseEnv: getSupabaseEnv,
  getAuthServiceRoleKey: getServiceRoleKey,
  getDataServiceRoleKey: getServiceRoleKey,
  getLocalDataServiceRoleKey,
  getLocalShadowDataEnv,
}));

describe("supabase server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    cookies.mockReset();
    createServerClient.mockReset();
    createClient.mockReset();
    createHybridAuthorityFetch.mockReset();
    createRemoteRefreshAuthorityFetch.mockReset();
    getSupabaseEnv.mockReset();
    getAuthAuthority.mockReset();
    getAuthSupabaseServerEnv.mockReset();
    getServiceRoleKey.mockReset();
    getLocalDataServiceRoleKey.mockReset();
    getLocalShadowDataEnv.mockReset();
    createHybridShadowReadFetch.mockReset();
    cookieGetAll.mockReset();
    cookieSet.mockReset();

    cookies.mockResolvedValue({
      getAll: cookieGetAll,
      set: cookieSet,
    });
    cookieGetAll.mockReturnValue([]);
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:54321",
      anonKey: "anon-key",
      authority: "local",
      issuer: "http://127.0.0.1:54321/auth/v1",
      jwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
    });
    getAuthAuthority.mockReturnValue("local");
    getAuthSupabaseServerEnv.mockReturnValue({
      url: "http://127.0.0.1:54321",
      anonKey: "anon-key",
      issuer: "http://127.0.0.1:54321/auth/v1",
      jwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
    });
    getServiceRoleKey.mockReturnValue(null);
    getLocalDataServiceRoleKey.mockReturnValue(null);
    createHybridShadowReadFetch.mockReturnValue(vi.fn());
    createHybridAuthorityFetch.mockImplementation(() => vi.fn());
    createRemoteRefreshAuthorityFetch.mockImplementation(() => vi.fn());
    process.env.HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1 =
      "0123456789abcdef0123456789abcdef";
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1 =
      "abcdef0123456789abcdef0123456789";
  });

  it("does not throw when server-page auth reads trigger cookie writes", async () => {
    cookieSet.mockImplementation(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    });

    createServerClient.mockImplementation((_url, _anonKey, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: "sb-access-token",
              value: "next-token",
              options: { path: "/" },
            },
          ]);

          return {
            data: {
              user: {
                id: "user-1",
              },
            },
          };
        },
      },
    }));

    const { getServerAuthUser } = await import("@/lib/supabase/server");

    await expect(getServerAuthUser()).resolves.toEqual({
      id: "user-1",
    });
  });

  it("keeps SSR Auth on the public origin and uses loopback only for the local admin client", async () => {
    getAuthAuthority.mockReturnValue("local");
    getSupabaseEnv.mockReturnValue({
      url: "https://auth.mumeok.kr",
      anonKey: "local-publishable",
      issuer: "https://auth.mumeok.kr/auth/v1",
      jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
    });
    getAuthSupabaseServerEnv.mockReturnValue({
      url: "http://127.0.0.1:54481",
      anonKey: "local-publishable",
      issuer: "https://auth.mumeok.kr/auth/v1",
      jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
    });
    getServiceRoleKey.mockReturnValue("local-secret-key");
    createServerClient.mockReturnValue({ auth: {} });
    createClient.mockReturnValue({ auth: { admin: {} } });

    const server = await import("@/lib/supabase/server");
    await server.createAuthRouteHandlerClient();
    server.createAuthServiceRoleClient();

    expect(createServerClient).toHaveBeenCalledWith(
      "https://auth.mumeok.kr",
      "local-publishable",
      expect.any(Object),
    );
    expect(createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54481",
      "local-secret-key",
      expect.any(Object),
    );
  });

  it("keeps the real server fetch path local and never starts local-shadow", async () => {
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:54321",
      anonKey: "local-publishable",
      authority: "local",
      issuer: "https://auth.mumeok.kr/auth/v1",
      jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
    });
    createClient.mockReturnValue({ rpc: vi.fn() });
    createServerClient.mockReturnValue({ auth: {} });

    const { createAuthRouteHandlerClient } =
      await import("@/lib/supabase/server");
    await createAuthRouteHandlerClient();

    expect(createHybridShadowReadFetch).not.toHaveBeenCalled();
    expect(createServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "local-publishable",
      expect.any(Object),
    );
  });

  it("injects superseded-session recovery only for route handlers and dedupes refreshes for 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      getAuthAuthority.mockReturnValue("local");
      getSupabaseEnv.mockReturnValue({
        url: "https://auth.mumeok.kr",
        anonKey: "local-publishable",
        authority: "local",
        issuer: "https://auth.mumeok.kr/auth/v1",
        jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
      });
      getServiceRoleKey.mockReturnValue("local-service-secret");

      const refreshSession = vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "replacement-token",
          },
        },
        error: null,
      });
      createServerClient.mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: "original-token" } },
            error: null,
          }),
          refreshSession,
        },
      });
      createClient.mockImplementation((_url, _key, options) => {
        if (options?.global?.headers?.["x-homecook-internal-scope"]) {
          return { rpc: vi.fn(), from: vi.fn(), storage: {} };
        }
        return { from: vi.fn(), rpc: vi.fn(), storage: {} };
      });

      const server = await import("@/lib/supabase/server");
      await server.createRouteHandlerClient();

      const routeGatewayArgs = createHybridAuthorityFetch.mock.calls.at(-1)?.[0];
      if (!routeGatewayArgs?.recoverSupersededSession) {
        throw new Error("missing route recovery callback");
      }

      const sharedRecovery = routeGatewayArgs.recoverSupersededSession;
      const tenConcurrent = await Promise.all(
        Array.from({ length: 10 }, () => sharedRecovery({
          currentAccessToken: "original-token",
          sessionKeyHash: "hash-1",
        })),
      );
      expect(tenConcurrent).toEqual(Array(10).fill("replacement-token"));
      expect(refreshSession).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(9_000);
      await expect(sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-1",
      })).resolves.toBe("replacement-token");
      expect(refreshSession).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-1",
      })).resolves.toBe("replacement-token");
      expect(refreshSession).toHaveBeenCalledTimes(2);

      await server.createServerComponentClient();
      const componentGatewayArgs = createHybridAuthorityFetch.mock.calls.at(-1)?.[0];
      expect(componentGatewayArgs?.recoverSupersededSession).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      "refresh rejects",
      () => Promise.reject(new Error("refresh failed")),
    ],
    [
      "refresh returns same token",
      () => Promise.resolve({
        data: { session: { access_token: "original-token" } },
        error: null,
      }),
    ],
    [
      "refresh returns error payload",
      () => Promise.resolve({
        data: { session: null },
        error: new Error("refresh error"),
      }),
    ],
  ])(
    "drops failed superseded-session cache entries immediately when %s",
    async (_label, refreshImpl) => {
      vi.useFakeTimers();
      try {
        getAuthAuthority.mockReturnValue("local");
        getSupabaseEnv.mockReturnValue({
          url: "https://auth.mumeok.kr",
          anonKey: "local-publishable",
          authority: "local",
          issuer: "https://auth.mumeok.kr/auth/v1",
          jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
        });
        getServiceRoleKey.mockReturnValue("local-service-secret");
        const refreshSession = vi.fn()
          .mockImplementationOnce(refreshImpl)
          .mockResolvedValue({
            data: { session: { access_token: "replacement-token" } },
            error: null,
          });
        createServerClient.mockReturnValue({
          auth: {
            getSession: vi.fn().mockResolvedValue({
              data: { session: { access_token: "original-token" } },
              error: null,
            }),
            refreshSession,
          },
        });
        createClient.mockImplementation((_url, _key, options) => {
          if (options?.global?.headers?.["x-homecook-internal-scope"]) {
            return { rpc: vi.fn(), from: vi.fn(), storage: {} };
          }
          return { from: vi.fn(), rpc: vi.fn(), storage: {} };
        });

        const server = await import("@/lib/supabase/server");
        await server.createRouteHandlerClient();
        const sharedRecovery =
          createHybridAuthorityFetch.mock.calls.at(-1)?.[0]?.recoverSupersededSession;
        if (!sharedRecovery) {
          throw new Error("missing route recovery callback");
        }

        await expect(sharedRecovery({
          currentAccessToken: "original-token",
          sessionKeyHash: "hash-immediate-drop",
        })).resolves.toBeNull();
        await expect(sharedRecovery({
          currentAccessToken: "original-token",
          sessionKeyHash: "hash-immediate-drop",
        })).resolves.toBe("replacement-token");
        expect(refreshSession).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("fails closed when the superseded-session cache is already at 256 distinct keys", async () => {
    vi.useFakeTimers();
    try {
      getAuthAuthority.mockReturnValue("local");
      getSupabaseEnv.mockReturnValue({
        url: "https://auth.mumeok.kr",
        anonKey: "local-publishable",
        authority: "local",
        issuer: "https://auth.mumeok.kr/auth/v1",
        jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
      });
      getServiceRoleKey.mockReturnValue("local-service-secret");
      const refreshSession = vi.fn().mockResolvedValue({
        data: { session: { access_token: "replacement-token" } },
        error: null,
      });
      createServerClient.mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: "original-token" } },
            error: null,
          }),
          refreshSession,
        },
      });
      createClient.mockImplementation((_url, _key, options) => {
        if (options?.global?.headers?.["x-homecook-internal-scope"]) {
          return { rpc: vi.fn(), from: vi.fn(), storage: {} };
        }
        return { from: vi.fn(), rpc: vi.fn(), storage: {} };
      });

      const server = await import("@/lib/supabase/server");
      await server.createRouteHandlerClient();
      const sharedRecovery =
        createHybridAuthorityFetch.mock.calls.at(-1)?.[0]?.recoverSupersededSession;
      if (!sharedRecovery) {
        throw new Error("missing route recovery callback");
      }

      const warmPromises = Array.from({ length: 256 }, (_, index) =>
        sharedRecovery({
          currentAccessToken: "original-token",
          sessionKeyHash: `hash-${index}`,
        })
      );
      await expect(Promise.all(warmPromises)).resolves.toEqual(
        Array(256).fill("replacement-token"),
      );
      await expect(sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-overflow",
      })).resolves.toBeNull();
      expect(refreshSession).toHaveBeenCalledTimes(256);

      await vi.advanceTimersByTimeAsync(10_000);
      await expect(sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-overflow",
      })).resolves.toBe("replacement-token");
      expect(refreshSession).toHaveBeenCalledTimes(257);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an expired recovery rejection delete its newer replacement entry", async () => {
    vi.useFakeTimers();
    try {
      getAuthAuthority.mockReturnValue("local");
      getSupabaseEnv.mockReturnValue({
        url: "https://auth.mumeok.kr",
        anonKey: "local-publishable",
        authority: "local",
        issuer: "https://auth.mumeok.kr/auth/v1",
        jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
      });
      getServiceRoleKey.mockReturnValue("local-service-secret");

      let rejectExpired!: (error: Error) => void;
      let resolveReplacement!: (value: unknown) => void;
      const refreshSession = vi.fn()
        .mockImplementationOnce(() => new Promise((_resolve, reject) => {
          rejectExpired = reject;
        }))
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveReplacement = resolve;
        }))
        .mockResolvedValue({
          data: { session: { access_token: "unexpected-third-token" } },
          error: null,
        });
      createServerClient.mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: "original-token" } },
            error: null,
          }),
          refreshSession,
        },
      });
      createClient.mockImplementation((_url, _key, options) => {
        if (options?.global?.headers?.["x-homecook-internal-scope"]) {
          return { rpc: vi.fn(), from: vi.fn(), storage: {} };
        }
        return { from: vi.fn(), rpc: vi.fn(), storage: {} };
      });

      const server = await import("@/lib/supabase/server");
      await server.createRouteHandlerClient();
      const sharedRecovery =
        createHybridAuthorityFetch.mock.calls.at(-1)?.[0]?.recoverSupersededSession;
      if (!sharedRecovery) {
        throw new Error("missing route recovery callback");
      }

      const expired = sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-late-rejection",
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const replacement = sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-late-rejection",
      });
      rejectExpired(new Error("expired refresh failed late"));
      await expect(expired).resolves.toBeNull();

      const joinedReplacement = sharedRecovery({
        currentAccessToken: "original-token",
        sessionKeyHash: "hash-late-rejection",
      });
      expect(refreshSession).toHaveBeenCalledTimes(2);
      resolveReplacement({
        data: { session: { access_token: "replacement-token" } },
        error: null,
      });
      await expect(replacement).resolves.toBe("replacement-token");
      await expect(joinedReplacement).resolves.toBe("replacement-token");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not share a cached recovery across different old tokens in one session", async () => {
    vi.useFakeTimers();
    try {
      getAuthAuthority.mockReturnValue("local");
      getSupabaseEnv.mockReturnValue({
        url: "https://auth.mumeok.kr",
        anonKey: "local-publishable",
        authority: "local",
        issuer: "https://auth.mumeok.kr/auth/v1",
        jwksUrl: "https://auth.mumeok.kr/auth/v1/.well-known/jwks.json",
      });
      getServiceRoleKey.mockReturnValue("local-service-secret");
      const refreshSession = vi.fn()
        .mockResolvedValueOnce({
          data: { session: { access_token: "replacement-token-1" } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { session: { access_token: "replacement-token-2" } },
          error: null,
        });
      createServerClient.mockReturnValue({
        auth: {
          getSession: vi.fn(),
          refreshSession,
        },
      });
      createClient.mockImplementation((_url, _key, options) => {
        if (options?.global?.headers?.["x-homecook-internal-scope"]) {
          return { rpc: vi.fn(), from: vi.fn(), storage: {} };
        }
        return { from: vi.fn(), rpc: vi.fn(), storage: {} };
      });

      const server = await import("@/lib/supabase/server");
      await server.createRouteHandlerClient();
      const sharedRecovery =
        createHybridAuthorityFetch.mock.calls.at(-1)?.[0]?.recoverSupersededSession;
      if (!sharedRecovery) {
        throw new Error("missing route recovery callback");
      }

      await expect(sharedRecovery({
        currentAccessToken: "old-token-1",
        sessionKeyHash: "same-session-key-hash",
      })).resolves.toBe("replacement-token-1");
      await expect(sharedRecovery({
        currentAccessToken: "old-token-2",
        sessionKeyHash: "same-session-key-hash",
      })).resolves.toBe("replacement-token-2");
      expect(refreshSession).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds each local internal responsibility to an exact gateway scope", async () => {
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:8000",
      anonKey: "local-publishable",
      authority: "local",
      issuer: "https://remote.example/auth/v1",
      jwksUrl: "https://remote.example/auth/v1/.well-known/jwks.json",
    });
    getServiceRoleKey.mockReturnValue("local-service-secret");
    const client = {
      from: vi.fn(),
      rpc: vi.fn(),
      storage: {},
    };
    createClient.mockReturnValue(client);

    const server = await import("@/lib/supabase/server");
    const callbackClient = server.createAuthCallbackOperationsClient();
    server.createAuthRefreshInternalDataClient();
    server.createSessionLogoutInternalDataClient();
    const observabilityClient =
      server.createSessionObservabilityInternalRpcClient();
    const imageClient = server.createRecipeImageInternalClient();
    const recipeFutureClient =
      server.createRecipeFuturePropagationInternalClient();
    const snapshotV2SessionClient =
      server.createSnapshotV2SessionInternalClient();
    const futureMealClient = server.createFutureMealWriteInternalClient();
    const shoppingCreateClient = server.createShoppingCreateInternalClient();
    const lifecycleClient = server.createAccountLifecycleInternalRpcClient();
    server.createYoutubeIngredientRegistrationInternalRpcClient();
    const youtubeExtractionClient = server.createYoutubeExtractionInternalClient();
    const adminClient = server.createAdminDataInternalClient();
    const feedbackClient = server.createNotFoundFeedbackInternalClient();
    const eventClient = server.createOperationalEventInternalClient();

    expect(createClient.mock.calls.map((call) =>
      call[2]?.global?.headers?.["x-homecook-internal-scope"])).toEqual([
      "auth-callback",
      "auth-refresh",
      "session-logout",
      "session-observability",
      "recipe-image",
      "recipe-future-propagation",
      "snapshot-v2-session",
      "future-meal-write",
      "shopping-create",
      "account-lifecycle",
      "youtube-ingredient-registration",
      "youtube-extraction",
      "admin-data",
      "not-found-feedback",
      "operational-event",
    ]);
    expect(() => imageClient?.from("users")).toThrow(
      "Internal Data scope denied table: users",
    );
    expect(() => recipeFutureClient?.from("recipes")).toThrow(
      "Internal Data scope denied table: recipes",
    );
    expect(() => recipeFutureClient?.from("ingredient_nutrition_profiles"))
      .not.toThrow();
    expect(snapshotV2SessionClient).toEqual({ rpc: expect.any(Function) });
    expect(futureMealClient).toEqual({ rpc: expect.any(Function) });
    expect(shoppingCreateClient).toEqual({ rpc: expect.any(Function) });
    expect(() => lifecycleClient?.from("recipes")).toThrow(
      "Internal Data scope denied table: recipes",
    );
    expect(() => youtubeExtractionClient?.from("users")).toThrow(
      "Internal Data scope denied table: users",
    );
    expect(() => youtubeExtractionClient?.from("youtube_extraction_sessions"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_extraction_candidates"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_transcript_cache"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_transcript_fetch_events"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_llm_extraction_cache"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_llm_extraction_events"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_visual_extraction_cache"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("youtube_visual_extraction_events"))
      .not.toThrow();
    expect(() => youtubeExtractionClient?.from("cooking_methods"))
      .not.toThrow();
    expect(youtubeExtractionClient).toEqual({
      from: expect.any(Function),
    });
    expect(callbackClient).not.toHaveProperty("from");
    expect(callbackClient).toEqual({ rpc: expect.any(Function) });
    expect(() => adminClient?.from("recipes")).toThrow(
      "Internal Data scope denied table: recipes",
    );
    expect(feedbackClient).toEqual({ rpc: expect.any(Function) });
    expect(eventClient).toEqual({ rpc: expect.any(Function) });
    expect(observabilityClient).toEqual({ rpc: expect.any(Function) });
  });

  it("never exposes the legacy callback table facade under local-only authority", async () => {
    getServiceRoleKey.mockReturnValue("local-service-secret");
    const client = {
      from: vi.fn(),
      rpc: vi.fn(),
      storage: {},
    };
    createClient.mockReturnValue(client);

    const server = await import("@/lib/supabase/server");
    const callbackClient = server.createAuthCallbackInternalDataClient();

    expect(callbackClient).not.toHaveProperty("from");
    expect(callbackClient).toEqual({ rpc: expect.any(Function) });
  });

  it("executes local legacy callback bootstrap through RPC without exposing from", async () => {
    getSupabaseEnv.mockReturnValue({
      url: "http://127.0.0.1:8000",
      anonKey: "local-publishable",
      authority: "local",
      issuer: "https://remote.example/auth/v1",
      jwksUrl: "https://remote.example/auth/v1/.well-known/jwks.json",
    });
    getServiceRoleKey.mockReturnValue("local-service-secret");
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "ok", nickname: "집밥러" },
      error: null,
    });
    const client = {
      from: vi.fn(),
      rpc,
      storage: {},
    };
    createClient.mockReturnValue(client);

    const server = await import("@/lib/supabase/server");
    const callbackClient = server.createAuthCallbackOperationsClient();
    if (!callbackClient) {
      throw new Error("callback client missing");
    }
    const result = await server.bootstrapLegacyAuthCallbackIdentity(
      callbackClient,
      {
        id: "71000000-0000-4000-8000-000000000001",
        email: " Cook@Example.COM ",
        app_metadata: { provider: "google" },
        user_metadata: {
          nickname: "집밥러",
          sub: "google-remote-sub",
        },
      },
    );

    expect(result).toEqual({ ok: true, nickname: "집밥러" });
    expect(callbackClient).toEqual({ rpc: expect.any(Function) });
    expect(client.from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "bootstrap_legacy_auth_callback_identity",
      {
        p_email: "cook@example.com",
        p_nickname: "집밥러",
        p_owner_uuid: "71000000-0000-4000-8000-000000000001",
        p_profile_image_url: null,
        p_social_id: "google-remote-sub",
        p_social_provider: "google",
      },
    );
  });

  it.each([
    [
      {
        code: "55000",
        message: "ACCOUNT_LIFECYCLE_MAINTENANCE",
      },
      {
        ok: false,
        reason: "maintenance",
        errorCode: "ACCOUNT_LIFECYCLE_MAINTENANCE",
      },
    ],
    [
      {
        code: "55000",
        details: "ACCOUNT_SESSION_STALE",
        message: "legacy callback rejected",
      },
      {
        ok: false,
        reason: "stale",
        errorCode: "ACCOUNT_SESSION_STALE",
      },
    ],
    [
      {
        code: "XX000",
        message: "unexpected database failure",
      },
      {
        ok: false,
        reason: "unexpected",
        errorCode: null,
      },
    ],
  ])(
    "preserves local legacy callback RPC authority classification for %#",
    async (rpcError, expected) => {
      getSupabaseEnv.mockReturnValue({
        url: "http://127.0.0.1:8000",
        anonKey: "local-publishable",
        authority: "local",
        issuer: "https://remote.example/auth/v1",
        jwksUrl: "https://remote.example/auth/v1/.well-known/jwks.json",
      });
      getServiceRoleKey.mockReturnValue("local-service-secret");
      const client = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: rpcError,
        }),
        storage: {},
      };
      createClient.mockReturnValue(client);

      const server = await import("@/lib/supabase/server");
      const callbackClient = server.createAuthCallbackOperationsClient();
      if (!callbackClient) {
        throw new Error("callback client missing");
      }

      await expect(server.bootstrapLegacyAuthCallbackIdentity(
        callbackClient,
        {
          id: "71000000-0000-4000-8000-000000000001",
          email: "cook@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { sub: "google-remote-sub" },
        },
      )).resolves.toEqual(expected);
      expect(callbackClient).toEqual({ rpc: expect.any(Function) });
      expect(client.from).not.toHaveBeenCalled();
    },
  );
});

describe("supabase schema migrations", () => {
  it("defines the documented pantry_items table for pantry match recommendations", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.pantry_items\s*\(/i);
    expect(sql).toMatch(/user_id uuid not null references public\.users\(id\)/i);
    expect(sql).toMatch(/ingredient_id uuid not null references public\.ingredients\(id\)/i);
    expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*ingredient_id\s*\)/i);
  });

  it("defines the documented pantry bundle tables for pantry core", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.ingredient_bundles\s*\(/i);
    expect(sql).toMatch(/name varchar\(50\) not null/i);
    expect(sql).toMatch(/display_order integer not null default 0/i);
    expect(sql).toMatch(/create table if not exists public\.ingredient_bundle_items\s*\(/i);
    expect(sql).toMatch(/bundle_id uuid not null references public\.ingredient_bundles\(id\)/i);
    expect(sql).toMatch(/ingredient_id uuid not null references public\.ingredients\(id\)/i);
    expect(sql).toMatch(/unique\s*\(\s*bundle_id\s*,\s*ingredient_id\s*\)/i);
  });

  it("defines the documented shopping list tables for slice09 creation", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.shopping_lists\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.shopping_list_recipes\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.shopping_list_items\s*\(/i);
    expect(sql).toMatch(/shopping_list_id uuid not null references public\.shopping_lists\(id\)/i);
    expect(sql).toMatch(/added_to_pantry boolean not null default false/i);
    expect(sql).toMatch(/unique\s*\(\s*shopping_list_id\s*,\s*ingredient_id\s*\)/i);
    expect(sql).toMatch(/unique\s*\(\s*shopping_list_id\s*,\s*recipe_id\s*\)/i);
  });

  it("defines recipe image storage bucket and owner-scoped policies", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/insert into storage\.buckets\s*\(/i);
    expect(sql).toMatch(/'recipe-images'/i);
    expect(sql).toMatch(/allowed_mime_types\s*=\s*array\['image\/jpeg',\s*'image\/png',\s*'image\/webp'\]/i);
    expect(sql).toMatch(/create policy recipe_images_public_read/i);
    expect(sql).toMatch(/create policy recipe_images_insert_own/i);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i);
  });

  it("persists YouTube session thumbnail and draft tags in the registration RPC", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create or replace function public\.register_youtube_recipe_from_session/i);
    expect(sql).toMatch(/thumbnail_url,\s*tags/i);
    expect(sql).toMatch(/nullif\(v_session\.thumbnail_url,\s*''\)/i);
    expect(sql).toMatch(/v_session\.draft_json\s*->\s*'tags'/i);
  });

  it("defines public recipe tag search and HOME theme policy functions", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create or replace function public\.find_recipe_ids_by_public_tags/i);
    expect(sql).toMatch(/rt\.visibility = 'public'/i);
    expect(sql).toMatch(/rt\.review_status = 'approved'/i);
    expect(sql).toMatch(/t\.normalized_key = p_tag/i);
    expect(sql).toMatch(/t\.label ilike/i);
    expect(sql).toMatch(/create or replace function public\.list_public_recipe_tags/i);
    expect(sql).toMatch(/t\.is_system = true\s+or t\.usage_count > 0/i);
    expect(sql).toMatch(/create or replace function public\.list_home_theme_recipes/i);
    expect(sql).toMatch(/t\.is_system = true/i);
    expect(sql).toMatch(/t\.theme_eligible = true/i);
    expect(sql).toMatch(/t\.kind in \('semantic', 'source'\)/i);
    expect(sql).toMatch(/add column if not exists slug text/i);
  });

  it("defines recipe tag backfill dry-run and usage reconcile policy functions", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create or replace function public\.dry_run_recipe_tag_projection_backfill/i);
    expect(sql).toMatch(/legacy_projection_only/i);
    expect(sql).toMatch(/create or replace function public\.reconcile_recipe_tag_usage_counts/i);
    expect(sql).toMatch(/rt\.visibility = 'public'/i);
    expect(sql).toMatch(/rt\.review_status = 'approved'/i);
    expect(sql).toMatch(/grant execute on function public\.dry_run_recipe_tag_projection_backfill\(integer\) to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.reconcile_recipe_tag_usage_counts\(boolean\) to service_role/i);
  });

  it("defines atomic launch-readiness RPCs with auth boundary checks", () => {
    const sql = readAllMigrationSql();

    expect(sql).toMatch(/create or replace function public\.complete_shopping_list/i);
    expect(sql).toMatch(/create or replace function public\.create_shopping_list_from_payload/i);
    expect(sql).toMatch(/create or replace function public\.create_manual_recipe/i);
    expect(sql).toMatch(/auth\.uid\(\) is not null and auth\.uid\(\) <> p_user_id/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/grant execute on function public\.complete_shopping_list\(uuid, uuid, uuid\[\]\)/i);
    expect(sql).toMatch(/grant execute on function public\.create_shopping_list_from_payload/i);
    expect(sql).toMatch(/grant execute on function public\.create_manual_recipe/i);
  });
});
