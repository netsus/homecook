import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient,
}));

vi.mock("@/lib/supabase/auth-env", () => ({
  getAuthSupabaseEnv: () => ({
    publishableKey: "auth-publishable",
    url: "https://auth.example.com",
  }),
}));

const AUTH_METHODS = [
  "getSession",
  "getUserIdentities",
  "linkIdentity",
  "onAuthStateChange",
  "signInWithOAuth",
  "signInWithPassword",
  "signUp",
] as const;

describe("browser Auth-only Supabase facade", () => {
  beforeEach(() => {
    vi.resetModules();
    createBrowserClient.mockReset();
  });

  it("exposes only bound Auth methods and no raw client capability", async () => {
    const auth = Object.fromEntries(
      AUTH_METHODS.map((method) => [
        method,
        vi.fn(function (this: unknown) {
          return this === auth ? method : "unbound";
        }),
      ]),
    );
    createBrowserClient.mockReturnValue({
      auth,
      functions: { invoke: vi.fn() },
      realtime: { channel: vi.fn() },
      rpc: vi.fn(),
      storage: { from: vi.fn() },
    });

    const { getAuthSupabaseBrowserClient } = await import(
      "@/lib/supabase/browser"
    );
    const facade = getAuthSupabaseBrowserClient();
    type Facade = ReturnType<typeof getAuthSupabaseBrowserClient>;
    type ForbiddenCapability = Extract<
      keyof Facade,
      "from" | "functions" | "realtime" | "rpc" | "storage"
    >;

    expectTypeOf<ForbiddenCapability>().toEqualTypeOf<never>();
    expect(Object.keys(facade)).toEqual(["auth"]);
    expect(Object.keys(facade.auth).sort()).toEqual([...AUTH_METHODS].sort());
    expect(facade).not.toHaveProperty("storage");
    expect(facade).not.toHaveProperty("rpc");
    expect(facade).not.toHaveProperty("functions");
    expect(facade).not.toHaveProperty("realtime");

    for (const method of AUTH_METHODS) {
      expect((facade.auth[method] as () => string)()).toBe(method);
    }
  });

  it("allows only the configured Auth origin and /auth/v1 path before network", async () => {
    const networkFetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", networkFetch);
    createBrowserClient.mockReturnValue({
      auth: Object.fromEntries(
        AUTH_METHODS.map((method) => [method, vi.fn()]),
      ),
    });

    const { getAuthSupabaseBrowserClient } = await import(
      "@/lib/supabase/browser"
    );
    getAuthSupabaseBrowserClient();
    const options = createBrowserClient.mock.calls[0]?.[2] as {
      auth?: unknown;
      cookies?: unknown;
      global?: { fetch?: typeof fetch };
      isSingleton?: unknown;
    };
    const authFetch = options.global?.fetch;

    expect(authFetch).toBeTypeOf("function");
    expect(options).not.toHaveProperty("auth");
    expect(options).not.toHaveProperty("cookies");
    expect(options).not.toHaveProperty("isSingleton");

    for (const url of [
      "https://auth.example.com/auth/v1/authorize?provider=google",
      "https://auth.example.com/auth/v1/user/identities/authorize",
      "https://auth.example.com/auth/v1/token?grant_type=refresh_token",
    ]) {
      await expect(authFetch?.(url)).resolves.toBeInstanceOf(Response);
    }
    expect(networkFetch).toHaveBeenCalledTimes(3);

    for (const url of [
      "https://auth.example.com/storage/v1/object/recipe-images/x",
      "https://auth.example.com/rest/v1/users",
      "https://auth.example.com/functions/v1/unsafe",
      "https://auth.example.com.evil/auth/v1/token",
      "https://other.example.com/auth/v1/token",
    ]) {
      await expect(authFetch?.(url)).rejects.toThrow(/auth-only/i);
    }
    expect(networkFetch).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });
});
