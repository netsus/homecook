import { describe, expect, it } from "vitest";

import {
  evaluateMarketingPreviewContract,
  PREVIEW_TURNSTILE_ACTION,
  redactPreviewSecrets,
} from "../scripts/lib/marketing-validation-preview-contract.mjs";

const NOW = new Date("2026-09-04T09:00:00.000Z");

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    HOMECOOK_MARKETING_PREVIEW_NAMESPACE: "marketing-validation-preview",
    HOMECOOK_MARKETING_PREVIEW_ORIGIN: "https://beta-preview.mumeok.kr",
    ALLOWED_MARKETING_ORIGINS: "https://beta-preview.mumeok.kr,https://preview.mumeok.kr",
    MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://beta-preview.mumeok.kr",
    MARKETING_CAMPAIGN_END_AT: "2026-09-30T00:00:00.000Z",
    MARKETING_LEAD_PROTECTION_READY: "0",
    MARKETING_TURNSTILE_ACTION: PREVIEW_TURNSTILE_ACTION,
    MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "beta-preview.mumeok.kr,preview.mumeok.kr",
    MARKETING_TURNSTILE_SECRET: "turnstile-secret-value",
    NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "preview-site-key",
    DATA_SUPABASE_URL: "http://127.0.0.1:55431",
    DATA_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    DATA_SUPABASE_SECRET_KEY: "service-role-secret",
    HOMECOOK_PREVIEW_APP_PORT: "3301",
    HOMECOOK_PREVIEW_SUPABASE_API_PORT: "55431",
    HOMECOOK_PREVIEW_SUPABASE_DB_PORT: "55432",
    HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT: "55433",
    HOMECOOK_PREVIEW_COMPOSE_PROJECT: "marketing-validation-preview",
    HOMECOOK_PREVIEW_DB_VOLUME: "marketing-validation-preview-postgres",
    HOMECOOK_PREVIEW_STORAGE_VOLUME: "marketing-validation-preview-storage",
    ...overrides,
  };
}

function evaluate(env: Record<string, string | undefined>) {
  return evaluateMarketingPreviewContract({
    env,
    now: NOW,
    reservedComposeProjects: ["homecook-full-local-isolated", "homecook-production", "cwj-homecook"],
    reservedPorts: [3000, 54320, 54321, 54322, 54323, 54324, 54325, 54326, 54481, 54482],
    reservedVolumes: ["homecook-full-local-postgres", "homecook-full-local-storage"],
  });
}

describe("marketing validation preview ops contract", () => {
  it("keeps the preview namespace isolated from production, CWJ, and master naming", () => {
    expect(evaluate(validEnv())).toMatchObject({
      ok: true,
      leadGateOpen: false,
      errors: [],
    });

    const result = evaluate(validEnv({
      HOMECOOK_MARKETING_PREVIEW_NAMESPACE: "master-cwj-preview",
      HOMECOOK_PREVIEW_COMPOSE_PROJECT: "master-cwj-preview",
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "HOMECOOK_MARKETING_PREVIEW_NAMESPACE",
          code: "reserved_namespace",
        }),
      ]),
    );
  });

  it("requires a loopback Supabase URL and preview-only origin allowlists", () => {
    const valid = evaluate(validEnv());
    expect(valid.allowedOrigins).toEqual([
      "https://beta-preview.mumeok.kr",
      "https://preview.mumeok.kr",
    ]);

    const result = evaluate(validEnv({
      DATA_SUPABASE_URL: "https://app.mumeok.kr",
      ALLOWED_MARKETING_ORIGINS: "https://app.mumeok.kr,https://beta-preview.mumeok.kr",
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "DATA_SUPABASE_URL", code: "loopback_required" }),
        expect.objectContaining({ field: "ALLOWED_MARKETING_ORIGINS", code: "production_origin_forbidden" }),
      ]),
    );
  });

  it("requires HTTPS for the public preview origin", () => {
    const result = evaluate(validEnv({
      HOMECOOK_MARKETING_PREVIEW_ORIGIN: "http://beta-preview.mumeok.kr",
      ALLOWED_MARKETING_ORIGINS: "http://beta-preview.mumeok.kr",
      MARKETING_PAID_ATTRIBUTION_ORIGINS: "http://beta-preview.mumeok.kr",
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      field: "HOMECOOK_MARKETING_PREVIEW_ORIGIN",
      code: "https_required",
    }));
  });

  it("keeps preview ports, compose project, and volumes disjoint from operating resources", () => {
    const result = evaluate(validEnv({
      HOMECOOK_PREVIEW_APP_PORT: "3000",
      HOMECOOK_PREVIEW_SUPABASE_API_PORT: "54321",
      HOMECOOK_PREVIEW_COMPOSE_PROJECT: "homecook-full-local-isolated",
      HOMECOOK_PREVIEW_DB_VOLUME: "homecook-full-local-postgres",
      HOMECOOK_PREVIEW_STORAGE_VOLUME: "homecook-full-local-storage",
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_APP_PORT", code: "reserved_port" }),
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_SUPABASE_API_PORT", code: "reserved_port" }),
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_COMPOSE_PROJECT", code: "reserved_compose_project" }),
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_DB_VOLUME", code: "reserved_volume" }),
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_STORAGE_VOLUME", code: "reserved_volume" }),
      ]),
    );
  });

  it("fails closed when required env is missing and keeps lead capture default-off", () => {
    const defaultClosed = evaluate(validEnv());
    expect(defaultClosed.leadGateOpen).toBe(false);
    expect(defaultClosed.errors).toEqual([]);

    const missing = evaluate(validEnv({
      DATA_SUPABASE_SECRET_KEY: undefined,
      HOMECOOK_PREVIEW_SUPABASE_DB_PORT: undefined,
    }));

    expect(missing.ok).toBe(false);
    expect(missing.leadGateOpen).toBe(false);
    expect(missing.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "DATA_SUPABASE_SECRET_KEY", code: "required" }),
        expect.objectContaining({ field: "HOMECOOK_PREVIEW_SUPABASE_DB_PORT", code: "required" }),
      ]),
    );
  });

  it("opens lead capture only when campaign end and Turnstile contract are explicitly valid", () => {
    const open = evaluate(validEnv({ MARKETING_LEAD_PROTECTION_READY: "1" }));
    expect(open.ok).toBe(true);
    expect(open.leadGateOpen).toBe(true);

    const result = evaluate(validEnv({
      MARKETING_LEAD_PROTECTION_READY: "1",
      MARKETING_CAMPAIGN_END_AT: "2026-08-31T00:00:00.000Z",
      MARKETING_TURNSTILE_ACTION: "wrong_action",
      MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "app.mumeok.kr",
    }));

    expect(result.ok).toBe(false);
    expect(result.leadGateOpen).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "MARKETING_CAMPAIGN_END_AT", code: "campaign_closed" }),
        expect.objectContaining({ field: "MARKETING_TURNSTILE_ACTION", code: "invalid_turnstile_action" }),
        expect.objectContaining({ field: "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES", code: "production_hostname_forbidden" }),
      ]),
    );
  });

  it("redacts secrets before surfacing a preview contract snapshot", () => {
    expect(
      redactPreviewSecrets({
        DATA_SUPABASE_SECRET_KEY: "service-role-secret",
        MARKETING_TURNSTILE_SECRET: "turnstile-secret-value",
        DATA_SUPABASE_URL: "http://127.0.0.1:55431",
      }),
    ).toEqual({
      DATA_SUPABASE_SECRET_KEY: "[redacted]",
      MARKETING_TURNSTILE_SECRET: "[redacted]",
      DATA_SUPABASE_URL: "http://127.0.0.1:55431",
    });
  });

  it("rejects copy-paste placeholder credentials before preview use", () => {
    const result = evaluate(validEnv({
      DATA_SUPABASE_SECRET_KEY: "replace-with-preview-secret-key",
      NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "replace-with-preview-site-key",
    }));

    expect(result.ok).toBe(false);
    expect(result.leadGateOpen).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "DATA_SUPABASE_SECRET_KEY", code: "placeholder_value" }),
      expect.objectContaining({ field: "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY", code: "placeholder_value" }),
    ]));
  });
});
