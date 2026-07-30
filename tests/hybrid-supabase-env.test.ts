import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("hybrid Supabase environment boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.AUTH_SUPABASE_EXPECTED_ISSUER;
    delete process.env.AUTH_SUPABASE_JWKS_URL;
    delete process.env.DATA_SUPABASE_URL;
    delete process.env.DATA_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.DATA_SUPABASE_SECRET_KEY;
    delete process.env.HOMECOOK_DATA_AUTHORITY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("keeps the legacy remote-only environment as the default compatibility mode", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://remote.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "remote-publishable";

    const { getAuthSupabaseEnv } = await import("@/lib/supabase/auth-env");
    const { getDataAuthority, getDataSupabaseEnv } = await import(
      "@/lib/supabase/data-env"
    );

    expect(getDataAuthority()).toBe("remote");
    expect(getAuthSupabaseEnv()).toMatchObject({
      url: "https://remote.example.supabase.co",
      publishableKey: "remote-publishable",
      issuer: "https://remote.example.supabase.co/auth/v1",
    });
    expect(getDataSupabaseEnv()).toMatchObject({
      url: "https://remote.example.supabase.co",
      publishableKey: "remote-publishable",
      authority: "remote",
    });
  });

  it("requires explicit remote Auth and loopback local Data values in local mode", async () => {
    process.env.HOMECOOK_DATA_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL
      = "https://remote.example.supabase.co";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY
      = "remote-publishable";
    process.env.AUTH_SUPABASE_EXPECTED_ISSUER
      = "https://remote.example.supabase.co/auth/v1";
    process.env.AUTH_SUPABASE_JWKS_URL
      = "https://remote.example.supabase.co/auth/v1/.well-known/jwks.json";
    process.env.DATA_SUPABASE_URL = "http://127.0.0.1:8000";
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getAuthSupabaseEnv } = await import("@/lib/supabase/auth-env");
    const { getDataSupabaseEnv } = await import("@/lib/supabase/data-env");

    expect(getAuthSupabaseEnv()).toMatchObject({
      url: "https://remote.example.supabase.co",
      issuer: "https://remote.example.supabase.co/auth/v1",
      jwksUrl:
        "https://remote.example.supabase.co/auth/v1/.well-known/jwks.json",
    });
    expect(getDataSupabaseEnv()).toEqual({
      authority: "local",
      url: "http://127.0.0.1:8000",
      publishableKey: "local-publishable",
    });
  });

  it("keeps local-shadow responses and writes remote while exposing a read-only local target", async () => {
    process.env.HOMECOOK_DATA_AUTHORITY = "local-shadow";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL
      = "https://remote.example.supabase.co";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY
      = "remote-publishable";
    process.env.DATA_SUPABASE_URL = "http://127.0.0.1:8000";
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const {
      getDataSupabaseEnv,
      getLocalShadowDataSupabaseEnv,
    } = await import("@/lib/supabase/data-env");

    expect(getDataSupabaseEnv()).toEqual({
      authority: "local-shadow",
      url: "https://remote.example.supabase.co",
      publishableKey: "remote-publishable",
    });
    expect(getLocalShadowDataSupabaseEnv()).toEqual({
      url: "http://127.0.0.1:8000",
      publishableKey: "local-publishable",
    });
  });

  it("fails closed when local production Data is not loopback", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.HOMECOOK_DATA_AUTHORITY = "local";
    process.env.DATA_SUPABASE_URL = "http://192.168.0.36:8000";
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getDataSupabaseEnv } = await import("@/lib/supabase/data-env");

    expect(() => getDataSupabaseEnv()).toThrow(/loopback/i);
  });

  it("rejects an issuer override that does not exactly match remote Auth", async () => {
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL
      = "https://remote.example.supabase.co";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY
      = "remote-publishable";
    process.env.AUTH_SUPABASE_EXPECTED_ISSUER
      = "https://other.example.supabase.co/auth/v1";

    const { getAuthSupabaseEnv } = await import("@/lib/supabase/auth-env");

    expect(() => getAuthSupabaseEnv()).toThrow(/issuer/i);
  });
});
