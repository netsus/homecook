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

const TRAILING_DOT_CONTROL_CASES = [
  ["literal tab numeric port", ".\t:54321"],
  ["literal CR numeric port", ".\r:54321"],
  ["literal LF numeric port", ".\n:54321"],
  ["encoded tab numeric port", "%2e\t:54321"],
  ["encoded CR numeric port", "%2E\r:54321"],
  ["encoded LF numeric port", "%2e\n:54321"],
  ["literal tab empty port", ".\t:"],
  ["literal CR empty port", ".\r:"],
  ["literal LF empty port", ".\n:"],
  ["encoded tab empty port", "%2e\t:"],
  ["encoded CR empty port", "%2E\r:"],
  ["encoded LF empty port", "%2e\n:"],
] as const;

const UNICODE_DOT_ENCODINGS = [
  ["U+3002", "\u3002"],
  ["U+3002 encoded", "%E3%80%82"],
  ["U+FF0E", "\uFF0E"],
  ["U+FF0E encoded", "%EF%BC%8E"],
  ["U+FF61", "\uFF61"],
  ["U+FF61 encoded", "%EF%BD%A1"],
] as const;
const RAW_PORT_VARIANTS = [
  ["without port", ""],
  ["numeric port", ":54321"],
  ["empty port", ":"],
] as const;
const UNICODE_TRAILING_DOT_CASES = UNICODE_DOT_ENCODINGS.flatMap(
  ([dotName, dot]) => RAW_PORT_VARIANTS.map(
    ([portName, port]) => [`${dotName} ${portName}`, `${dot}${port}`] as const,
  ),
);
const RAW_EDGE_WHITESPACE_CASES = [
  ["leading space", " ", ""],
  ["trailing space", "", " "],
  ["leading tab", "\t", ""],
  ["trailing tab", "", "\t"],
  ["leading CR", "\r", ""],
  ["trailing CR", "", "\r"],
  ["leading LF", "\n", ""],
  ["trailing LF", "", "\n"],
] as const;
const NONCANONICAL_SCHEME_FORMS = [
  ["opaque", "http:"],
  ["single slash", "http:/"],
  ["triple slash", "http:///"],
  ["backslashes", "http:\\\\"],
  ["mixed slash", "http:/\\"],
] as const;
const NONCANONICAL_PORT_VARIANTS = [
  ["numeric port", ":54321"],
  ["empty port", ":"],
] as const;
const NONCANONICAL_UNICODE_AUTH_URL_CASES = NONCANONICAL_SCHEME_FORMS.flatMap(
  ([formName, prefix]) => UNICODE_DOT_ENCODINGS.flatMap(
    ([dotName, dot]) => NONCANONICAL_PORT_VARIANTS.map(
      ([portName, port]) => [
        `${formName} ${dotName} ${portName}`,
        `${prefix}127.0.0.1${dot}${port}`,
      ] as const,
    ),
  ),
);
const NONLOWERCASE_AUTH_URL_CASES = [
  ["uppercase HTTP", "HTTP://127.0.0.1:54321"],
  ["mixed HTTP", "Http://127.0.0.1:54321"],
  ["mixed HTTPS", "hTtPs://auth.mumeok.kr"],
] as const;

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
    "http://127.0.0.1.:",
    "http://127.0.0.1%2e:",
    "https://project.supabase.co.",
    "https://project.supabase.co%2E",
    "https://project.supabase.co.:",
    "https://project.supabase.co%2e:",
    "https://project.supabase.in.",
    "https://project.supabase.in%2e",
    "http://localhost.:54321",
    "http://localhost%2E:54321",
    "http://localhost.:",
    "http://localhost%2e:",
    "https://auth.mumeok.kr.",
    "https://auth.mumeok.kr%2e",
    "https://auth.mumeok.kr.:",
    "https://auth.mumeok.kr%2E:",
  ])("rejects trailing-dot Auth hostname %s", async (url) => {
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseEnv()).toThrow(/hostname.*trailing dot/iu);
    expect(hasAuthSupabasePublicEnv()).toBe(false);
  });

  it.each(TRAILING_DOT_CONTROL_CASES)(
    "rejects public Auth raw control boundary %s",
    async (_name, suffix) => {
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL =
        `https://project.supabase.co${suffix}`;
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";

      const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseEnv()).toThrow(
        /ASCII control|whitespace/iu,
      );
      expect(hasAuthSupabasePublicEnv()).toBe(false);
    },
  );

  it.each(UNICODE_TRAILING_DOT_CASES)(
    "rejects public Auth Unicode trailing dot %s",
    async (_name, suffix) => {
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL =
        `https://auth.mumeok.kr${suffix}`;
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";

      const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseEnv()).toThrow(/hostname.*trailing dot/iu);
      expect(hasAuthSupabasePublicEnv()).toBe(false);
    },
  );

  it.each(RAW_EDGE_WHITESPACE_CASES)(
    "rejects public Auth raw URL %s",
    async (_name, prefix, suffix) => {
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL =
        `${prefix}http://127.0.0.1:54321${suffix}`;
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";

      const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseEnv()).toThrow(
        /ASCII control|whitespace/iu,
      );
      expect(hasAuthSupabasePublicEnv()).toBe(false);
    },
  );

  it.each([
    ...NONCANONICAL_UNICODE_AUTH_URL_CASES,
    ...NONLOWERCASE_AUTH_URL_CASES,
  ])("rejects public Auth noncanonical URL %s", async (_name, url) => {
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";

    const { getAuthSupabaseEnv, hasAuthSupabasePublicEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseEnv()).toThrow(
      /exact lowercase http:\/\/ or https:\/\//iu,
    );
    expect(hasAuthSupabasePublicEnv()).toBe(false);
  });

  it.each([
    "http://127.0.0.1.:54481",
    "http://127.0.0.1%2e:54481",
    "http://127.0.0.1.:",
    "http://127.0.0.1%2E:",
    "http://localhost.:54481",
    "http://localhost%2E:54481",
    "http://localhost.:",
    "http://localhost%2e:",
    "https://project.supabase.co.:443",
    "https://project.supabase.co%2e:443",
    "https://project.supabase.co.:",
    "https://project.supabase.co%2E:",
    "https://auth.mumeok.kr.:443",
    "https://auth.mumeok.kr%2E:443",
    "https://auth.mumeok.kr.:",
    "https://auth.mumeok.kr%2e:",
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

  it.each(TRAILING_DOT_CONTROL_CASES)(
    "rejects internal Auth raw control boundary %s",
    async (_name, suffix) => {
      process.env.HOMECOOK_AUTH_AUTHORITY = "local";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";
      process.env.LOCAL_SUPABASE_INTERNAL_URL = `http://127.0.0.1${suffix}`;

      const { getAuthSupabaseServerEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseServerEnv()).toThrow(
        /LOCAL_SUPABASE_INTERNAL_URL.*(?:ASCII control|whitespace)/iu,
      );
    },
  );

  it.each(UNICODE_TRAILING_DOT_CASES)(
    "rejects internal Auth Unicode trailing dot %s",
    async (_name, suffix) => {
      process.env.HOMECOOK_AUTH_AUTHORITY = "local";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";
      process.env.LOCAL_SUPABASE_INTERNAL_URL = `http://127.0.0.1${suffix}`;

      const { getAuthSupabaseServerEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseServerEnv()).toThrow(
        /LOCAL_SUPABASE_INTERNAL_URL.*hostname.*trailing dot/iu,
      );
    },
  );

  it.each(RAW_EDGE_WHITESPACE_CASES)(
    "rejects internal Auth raw URL %s",
    async (_name, prefix, suffix) => {
      process.env.HOMECOOK_AUTH_AUTHORITY = "local";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
      process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY =
        "local-publishable";
      process.env.LOCAL_SUPABASE_INTERNAL_URL =
        `${prefix}http://127.0.0.1:54481${suffix}`;

      const { getAuthSupabaseServerEnv } = await import(
        "@/lib/supabase/auth-env"
      );

      expect(() => getAuthSupabaseServerEnv()).toThrow(
        /LOCAL_SUPABASE_INTERNAL_URL.*(?:ASCII control|whitespace)/iu,
      );
    },
  );

  it.each([
    ...NONCANONICAL_UNICODE_AUTH_URL_CASES,
    ...NONLOWERCASE_AUTH_URL_CASES,
  ])("rejects internal Auth noncanonical URL %s", async (_name, url) => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = url;

    const { getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(() => getAuthSupabaseServerEnv()).toThrow(
      /LOCAL_SUPABASE_INTERNAL_URL.*exact lowercase http:\/\/ or https:\/\//iu,
    );
  });

  it("preserves canonical lowercase HTTP, HTTPS, and bracketed IPv6", async () => {
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "https://auth.mumeok.kr";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = "https://[::1]:54481";

    const { getAuthSupabaseEnv, getAuthSupabaseServerEnv } = await import(
      "@/lib/supabase/auth-env"
    );

    expect(getAuthSupabaseEnv().url).toBe("https://auth.mumeok.kr");
    expect(getAuthSupabaseServerEnv().url).toBe("https://[::1]:54481");

    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.LOCAL_SUPABASE_INTERNAL_URL = "http://localhost:54481";
    expect(getAuthSupabaseEnv().url).toBe("http://127.0.0.1:54321");
    expect(getAuthSupabaseServerEnv().url).toBe("http://localhost:54481");
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
