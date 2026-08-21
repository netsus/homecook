import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function parseEnvExample(text: string) {
  return Object.fromEntries(
    text
      .split(/\r?\n/u)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/u.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

describe("local-only Supabase environment boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const name of [
      "AUTH_SUPABASE_EXPECTED_ISSUER",
      "AUTH_SUPABASE_JWKS_URL",
      "AUTH_SUPABASE_SECRET_KEY",
      "DATA_SUPABASE_PUBLISHABLE_KEY",
      "DATA_SUPABASE_SECRET_KEY",
      "DATA_SUPABASE_URL",
      "HOMECOOK_AUTH_AUTHORITY",
      "HOMECOOK_DATA_AUTHORITY",
      "LOCAL_SUPABASE_INTERNAL_URL",
      "LOCAL_SUPABASE_SECRET_KEY",
      "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_AUTH_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fails closed when either runtime authority is missing", async () => {
    const { getAuthAuthority } = await import("@/lib/supabase/auth-env");
    const { getDataAuthority } = await import("@/lib/supabase/data-env");

    expect(() => getAuthAuthority()).toThrow(/HOMECOOK_AUTH_AUTHORITY.*local/iu);
    expect(() => getDataAuthority()).toThrow(/HOMECOOK_DATA_AUTHORITY.*local/iu);
  });

  it.each(["remote", "local-shadow", "hosted", "typo"])(
    "rejects forbidden authority %s",
    async (authority) => {
      process.env.HOMECOOK_AUTH_AUTHORITY = authority;
      process.env.HOMECOOK_DATA_AUTHORITY = authority;

      const { getAuthAuthority } = await import("@/lib/supabase/auth-env");
      const { getDataAuthority } = await import("@/lib/supabase/data-env");

      expect(() => getAuthAuthority()).toThrow(/local-only|local only|local이어야/iu);
      expect(() => getDataAuthority()).toThrow(/local-only|local only|local이어야/iu);
    },
  );

  it("does not accept legacy or hosted Supabase public values", async () => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-publishable";

    const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseEnv()).toThrow(/NEXT_PUBLIC_AUTH_SUPABASE_URL/iu);
    expect(hasAuthSupabasePublicEnv()).toBe(false);

    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "publishable";
    expect(() => getAuthSupabaseEnv()).toThrow(/hosted|Cloud|local-only/iu);
  });

  it.each([
    "http://127.0.0.1.:54321",
    "http://127.0.0.1%2e:54321",
    "https://project.supabase.co.",
    "https://project.supabase.co%2E",
    "https://project.supabase.in.",
    "https://project.supabase.in%2e",
    "http://localhost.:54321",
    "http://localhost%2E:54321",
    "https://auth.mumeok.kr.",
    "https://auth.mumeok.kr%2e",
  ])("rejects trailing-dot Auth hostname %s", async (url) => {
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseEnv()).toThrow(/hostname.*trailing dot/iu);
    expect(hasAuthSupabasePublicEnv()).toBe(false);
  });

  it.each([
    "http://127.0.0.1.:54481",
    "http://127.0.0.1%2e:54481",
    "http://localhost.:54481",
    "http://localhost%2E:54481",
    "https://project.supabase.co.:443",
    "https://project.supabase.co%2e:443",
    "https://auth.mumeok.kr.:443",
    "https://auth.mumeok.kr%2E:443",
  ])("rejects trailing-dot internal Auth hostname %s", async (url) => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = url;

    const { getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseServerEnv()).toThrow(
      /LOCAL_SUPABASE_INTERNAL_URL.*hostname.*trailing dot/iu,
    );
  });

  it("allows browser Auth env without the server-only Auth authority", async () => {
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const {
      getAuthIssuer,
      getAuthSupabaseEnv,
      hasAuthSupabasePublicEnv,
    } = await import("@/lib/supabase/auth-env");

    expect(getAuthIssuer()).toBe("http://127.0.0.1:54321/auth/v1");
    expect(getAuthSupabaseEnv()).toEqual({
      issuer: "http://127.0.0.1:54321/auth/v1",
      jwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
      publishableKey: "local-publishable",
      url: "http://127.0.0.1:54321",
    });
    expect(hasAuthSupabasePublicEnv()).toBe(true);
  });

  it.each([undefined, "remote"])(
    "keeps the server Auth env fail-closed for authority %s",
    async (authority) => {
      if (authority) {
        process.env.HOMECOOK_AUTH_AUTHORITY = authority;
      }
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
      process.env.LOCAL_SUPABASE_INTERNAL_URL = "http://127.0.0.1:54481";

      const { getAuthSupabaseServerEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseServerEnv()).toThrow(
        /HOMECOOK_AUTH_AUTHORITY.*local|local-only/iu,
      );
    },
  );

  it("allows HTTP only for exact loopback Auth and Data origins", async () => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.HOMECOOK_DATA_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = "http://localhost:54321";
    process.env.DATA_SUPABASE_URL = "http://[::1]:54321";
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY = "local-data-publishable";

    const { getAuthSupabaseEnv, getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );
    const { getDataSupabaseEnv } = await import("@/lib/supabase/data-env");

    expect(getAuthSupabaseEnv()).toMatchObject({
      issuer: "http://127.0.0.1:54321/auth/v1",
      url: "http://127.0.0.1:54321",
    });
    expect(getAuthSupabaseServerEnv().url).toBe("http://localhost:54321");
    expect(getDataSupabaseEnv()).toEqual({
      authority: "local",
      publishableKey: "local-data-publishable",
      url: "http://[::1]:54321",
    });
  });

  it.each([
    "http://192.168.0.36:54321",
    "http://auth.mumeok.kr",
    "https://project.supabase.co",
  ])("rejects non-local Auth origin %s", async (url) => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getAuthSupabaseEnv } = await import("@/lib/supabase/auth-env");

    expect(() => getAuthSupabaseEnv()).toThrow(/loopback|HTTPS|hosted|Cloud|local-only/iu);
  });

  it("allows an explicit self-hosted HTTPS Auth origin with a loopback server origin", async () => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "https://auth.mumeok.kr";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = "http://127.0.0.1:54481";

    const { getAuthSupabaseEnv, getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(getAuthSupabaseEnv().url).toBe("https://auth.mumeok.kr");
    expect(getAuthSupabaseServerEnv().url).toBe("http://127.0.0.1:54481");

    process.env.LOCAL_SUPABASE_INTERNAL_URL = "http://[::1]:54481";
    expect(getAuthSupabaseServerEnv().url).toBe("http://[::1]:54481");
  });

  it("rejects non-loopback Data origins in every runtime mode", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.HOMECOOK_DATA_AUTHORITY = "local";
    process.env.DATA_SUPABASE_URL = "http://192.168.0.36:54321";
    process.env.DATA_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getDataSupabaseEnv } = await import("@/lib/supabase/data-env");

    expect(() => getDataSupabaseEnv()).toThrow(/loopback/iu);
  });

  it("uses only the local Auth secret and never falls back to legacy remote secrets", async () => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.HOMECOOK_DATA_AUTHORITY = "local";
    process.env.AUTH_SUPABASE_SECRET_KEY = "legacy-auth-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-service-secret";

    const { getAuthSupabaseSecretKey } = await import("@/lib/supabase/auth-env");

    expect(getAuthSupabaseSecretKey()).toBeNull();
    process.env.LOCAL_SUPABASE_SECRET_KEY = "local-secret";
    expect(getAuthSupabaseSecretKey()).toBe("local-secret");
  });

  it("loads the complete .env.example through the real Auth and Data parsers", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      ...parseEnvExample(readFileSync(".env.example", "utf8")),
    };

    const { getAuthSupabaseEnv, getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );
    const { getDataSupabaseEnv } = await import("@/lib/supabase/data-env");

    expect(getAuthSupabaseEnv()).toMatchObject({
      issuer: "http://127.0.0.1:54321/auth/v1",
      url: "http://127.0.0.1:54321",
    });
    expect(getAuthSupabaseServerEnv().url).toBe("http://127.0.0.1:54481");
    expect(getDataSupabaseEnv()).toMatchObject({
      authority: "local",
      url: "http://127.0.0.1:54321",
    });
  });
});
