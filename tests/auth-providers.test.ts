import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  getSupabaseAuthProvider,
  normalizeAuthProviderId,
  parseEnabledAuthProviders,
} from "@/lib/auth/providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth providers", () => {
  it("uses all production social providers when env is missing", () => {
    expect(parseEnabledAuthProviders()).toEqual(["kakao", "naver", "google"]);
  });

  it("filters, normalizes, and preserves allowed providers", () => {
    expect(parseEnabledAuthProviders("NAVER, google, unknown, kakao")).toEqual([
      "naver",
      "google",
      "kakao",
    ]);
  });

  it("uses all production social providers when parsed list is empty", () => {
    expect(parseEnabledAuthProviders("unknown")).toEqual(["kakao", "naver", "google"]);
  });

  it("uses all production social providers for the legacy google-only env", () => {
    expect(parseEnabledAuthProviders("google")).toEqual(["kakao", "naver", "google"]);
  });

  it("normalizes Supabase custom OAuth provider ids into product provider ids", () => {
    expect(normalizeAuthProviderId("custom:kakao")).toBe("kakao");
    expect(normalizeAuthProviderId("custom:naver")).toBe("naver");
    expect(normalizeAuthProviderId("google")).toBe("google");
    expect(normalizeAuthProviderId("custom:unknown")).toBeNull();
    expect(normalizeAuthProviderId("toString")).toBeNull();
    expect(normalizeAuthProviderId("__proto__")).toBeNull();
  });

  it("uses the Supabase built-in Kakao provider by default", () => {
    expect(getSupabaseAuthProvider("kakao")).toBe("kakao");
  });

  it("keeps an explicit custom Kakao provider override for compatibility", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER", "custom:kakao");

    expect(getSupabaseAuthProvider("kakao")).toBe("custom:kakao");
  });

  it("keeps Naver on the custom provider", () => {
    expect(getSupabaseAuthProvider("naver")).toBe("custom:naver");
  });

  it("enables manual identity linking in local Supabase", () => {
    const config = readFileSync("supabase/config.toml", "utf8");

    expect(config).toMatch(/enable_manual_linking\s*=\s*true/);
  });
});
