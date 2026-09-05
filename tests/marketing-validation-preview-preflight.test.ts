import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  collectMarketingValidationPreviewPreflight,
  parseLsofListenerInventory,
  runMarketingValidationPreviewPreflightCli,
} from "../scripts/marketing-validation-preview-preflight.mjs";

const scriptPath = fileURLToPath(
  new URL("../scripts/marketing-validation-preview-preflight.mjs", import.meta.url),
);
const NOW = new Date("2026-09-04T09:00:00.000Z");

function baseEnvironment(overrides = {}) {
  return {
    ALLOWED_MARKETING_ORIGINS: "https://beta-preview.mumeok.kr,https://preview.mumeok.kr",
    DATA_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    DATA_SUPABASE_SECRET_KEY: "service-role-secret",
    DATA_SUPABASE_URL: "http://127.0.0.1:55431",
    FULL_LOCAL_COMPOSE_PROJECT_NAME: "marketing-validation-preview",
    FULL_LOCAL_POSTGRES_VOLUME_NAME: "marketing-validation-preview-postgres",
    FULL_LOCAL_STORAGE_VOLUME_NAME: "marketing-validation-preview-storage",
    HOMECOOK_AUTH_AUTHORITY: "local",
    HOMECOOK_DATA_AUTHORITY: "local",
    HOMECOOK_MARKETING_PREVIEW_NAMESPACE: "marketing-validation-preview",
    HOMECOOK_MARKETING_PREVIEW_ORIGIN: "https://beta-preview.mumeok.kr",
    HOMECOOK_PREVIEW_APP_PORT: "3301",
    HOMECOOK_PREVIEW_SUPABASE_API_PORT: "55431",
    HOMECOOK_PREVIEW_SUPABASE_DB_PORT: "55432",
    HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT: "55433",
    LOCAL_SUPABASE_INTERNAL_URL: "http://127.0.0.1:55481",
    MARKETING_CAMPAIGN_END_AT: "2026-09-30T00:00:00.000Z",
    MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE: `sha256:${"a".repeat(64)}`,
    MARKETING_LEAD_PROTECTION_READY: "1",
    MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://beta-preview.mumeok.kr",
    MARKETING_TURNSTILE_ACTION: "marketing_validation_lead_submit",
    MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "beta-preview.mumeok.kr,preview.mumeok.kr",
    MARKETING_TURNSTILE_SECRET: "preview-secret-value",
    NEXT_PUBLIC_AUTH_SUPABASE_URL: "http://127.0.0.1:55431",
    NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "preview-site-key",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
    ...overrides,
  };
}

describe("marketing validation preview preflight", () => {
  it("passes an isolated preview contract while keeping secret values redacted", () => {
    const summary = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment(),
      now: NOW,
      listenerInventory: [
        { label: "next-preview", host: "0.0.0.0", port: 3301 },
        { label: "postgrest", host: "127.0.0.1", port: 55431 },
      ],
    });

    expect(summary.ready).toBe(true);
    expect(summary.blockers).toEqual([]);
    expect(summary.checks.preview_origin).toEqual({
      hostname: "beta-preview.mumeok.kr",
      ok: true,
      value: "https://beta-preview.mumeok.kr",
    });
    expect(summary.checks.lead_gate).toMatchObject({
      approved_action: true,
      edge_evidence_configured: true,
      enabled: true,
      ok: true,
      preview_hostname_covered: true,
      secret_configured: true,
      site_key_configured: true,
      turnstile_hostnames_configured: true,
    });
    expect(summary.checks.listener_inventory).toEqual({
      allowed_external_listener_count: 1,
      allowed_external_listeners: [
        { label: "next-preview", host: "0.0.0.0", port: 3301 },
      ],
      external_listener_count: 1,
      forbidden_external_listener_count: 0,
      forbidden_external_listeners: [],
      manual_verification_required: false,
      ok: true,
      provided: true,
      unrelated_external_listener_count: 0,
      unrelated_external_listeners: [],
    });
    expect(summary.checks.redacted_env).toEqual({
      DATA_SUPABASE_PUBLISHABLE_KEY: "[redacted]",
      DATA_SUPABASE_SECRET_KEY: "[redacted]",
      DATA_SUPABASE_URL: "http://127.0.0.1:55431",
      MARKETING_TURNSTILE_SECRET: "[redacted]",
    });
    expect(JSON.stringify(summary)).not.toContain("preview-secret-value");
  });

  it("supports the marketing preview origin alias and rejects the production app origin", () => {
    const aliasPass = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        HOMECOOK_MARKETING_PREVIEW_ORIGIN: undefined,
        MARKETING_PREVIEW_PUBLIC_ORIGIN: "https://beta-preview.mumeok.kr",
      }),
      now: NOW,
      listenerInventory: [],
    });
    expect(aliasPass.ready).toBe(true);

    const production = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        ALLOWED_MARKETING_ORIGINS: "https://app.mumeok.kr,https://beta-preview.mumeok.kr",
        HOMECOOK_MARKETING_PREVIEW_ORIGIN: "https://app.mumeok.kr",
        MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://app.mumeok.kr",
        MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "app.mumeok.kr",
      }),
      now: NOW,
    });

    expect(production.ready).toBe(false);
    expect(production.blockers).toEqual(expect.arrayContaining([
      "ALLOWED_ORIGINS_INCLUDE_PRODUCTION",
      "PAID_ATTRIBUTION_ORIGINS_INCLUDE_PRODUCTION",
      "PREVIEW_ORIGIN_PRODUCTION_FORBIDDEN",
      "TURNSTILE_HOSTNAME_PRODUCTION_FORBIDDEN",
    ]));
  });

  it("rejects non-local authority and non-loopback Supabase URLs", () => {
    const remote = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        DATA_SUPABASE_URL: "https://example.supabase.co",
        HOMECOOK_AUTH_AUTHORITY: "remote",
        HOMECOOK_DATA_AUTHORITY: "remote",
      }),
      now: NOW,
    });

    expect(remote.ready).toBe(false);
    expect(remote.blockers).toEqual(expect.arrayContaining([
      "SUPABASE_AUTH_AUTHORITY_NOT_LOCAL",
      "SUPABASE_DATA_AUTHORITY_NOT_LOCAL",
      "SUPABASE_URL_NOT_LOOPBACK",
    ]));
  });

  it("fails closed when lead capture lacks edge evidence or preview hostname coverage", () => {
    const summary = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE: "",
        MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "preview-other.mumeok.kr",
      }),
      now: NOW,
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "LEAD_GATE_EDGE_EVIDENCE_MISSING",
      "LEAD_GATE_PREVIEW_HOSTNAME_NOT_ALLOWED",
    ]));
  });

  it("rejects placeholder edge evidence and redacts credential-bearing data URLs", () => {
    const summary = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        DATA_SUPABASE_URL: "http://operator:private-token@127.0.0.1:55431/?access_token=private-token",
        MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE: "replace-with-reviewed-edge-rule-evidence",
      }),
      now: NOW,
      listenerInventory: [],
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "LEAD_GATE_EDGE_EVIDENCE_INVALID",
      "SUPABASE_URL_INVALID",
    ]));
    expect(summary.checks.redacted_env.DATA_SUPABASE_URL).toBe("[redacted]");
    expect(JSON.stringify(summary)).not.toContain("private-token");
  });

  it("rejects operating compose, volume, and reserved port reuse", () => {
    const summary = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment({
        FULL_LOCAL_COMPOSE_PROJECT_NAME: "homecook-full-local-isolated",
        FULL_LOCAL_POSTGRES_VOLUME_NAME: "homecook-full-local-postgres",
        FULL_LOCAL_STORAGE_VOLUME_NAME: "homecook-full-local-storage",
        HOMECOOK_PREVIEW_APP_PORT: "3000",
        HOMECOOK_PREVIEW_SUPABASE_API_PORT: "54321",
        HOMECOOK_PREVIEW_SUPABASE_DB_PORT: "54322",
        HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT: "54323",
      }),
      now: NOW,
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "APP_PORT_RESERVED",
      "COMPOSE_PROJECT_COLLISION",
      "POSTGRES_VOLUME_COLLISION",
      "STORAGE_VOLUME_COLLISION",
      "SUPABASE_API_PORT_RESERVED",
      "SUPABASE_DB_PORT_RESERVED",
      "SUPABASE_STUDIO_PORT_RESERVED",
    ]));
  });

  it("allows only the Next preview public port as an external listener", () => {
    const summary = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment(),
      now: NOW,
      listenerInventory: [
        { label: "next-preview", host: "0.0.0.0", port: 3301 },
        { label: "supabase-api", host: "0.0.0.0", port: 55431 },
      ],
    });

    expect(summary.ready).toBe(false);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "SUPABASE_EXTERNAL_LISTENER_FORBIDDEN",
    ]));
    expect(summary.checks.listener_inventory).toEqual({
      allowed_external_listener_count: 1,
      allowed_external_listeners: [
        { label: "next-preview", host: "0.0.0.0", port: 3301 },
      ],
      external_listener_count: 2,
      forbidden_external_listener_count: 1,
      forbidden_external_listeners: [
        { label: "supabase-api", host: "0.0.0.0", port: 55431 },
      ],
      manual_verification_required: false,
      ok: false,
      provided: true,
      unrelated_external_listener_count: 0,
      unrelated_external_listeners: [],
    });
  });

  it("requires listener evidence and ignores unrelated macOS listeners outside protected ports", () => {
    const missing = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment(),
      now: NOW,
    });
    expect(missing.ready).toBe(false);
    expect(missing.blockers).toContain("LISTENER_INVENTORY_MISSING");

    const unrelated = collectMarketingValidationPreviewPreflight({
      env: baseEnvironment(),
      now: NOW,
      listenerInventory: [
        { label: "rapportd", host: "*", port: 49152 },
        { label: "next-preview", host: "*", port: 3301 },
      ],
    });
    expect(unrelated.ready).toBe(true);
    expect(unrelated.checks.listener_inventory).toMatchObject({
      allowed_external_listener_count: 1,
      allowed_external_listeners: [
        { label: "next-preview", host: "*", port: 3301 },
      ],
      forbidden_external_listener_count: 0,
      forbidden_external_listeners: [],
      unrelated_external_listener_count: 1,
      unrelated_external_listeners: [
        { label: "rapportd", host: "*", port: 49152 },
      ],
    });
  });

  it("parses lsof field output without exposing process arguments", () => {
    expect(parseLsofListenerInventory([
      "p13507",
      "ccom.docker.backend",
      "f149",
      "n*:54321",
      "p51057",
      "cnode",
      "f14",
      "n127.0.0.1:4173",
      "",
    ].join("\n"))).toEqual([
      { label: "com.docker.backend", host: "*", port: 54321 },
      { label: "node", host: "127.0.0.1", port: 4173 },
    ]);
  });

  it("writes only redacted CLI output on failure", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn((code: number): never => {
      void code;
      throw new Error("exit");
    });

    expect(() => runMarketingValidationPreviewPreflightCli({
      env: baseEnvironment({
        HOMECOOK_MARKETING_PREVIEW_ORIGIN: "https://app.mumeok.kr",
        MARKETING_TURNSTILE_SECRET: "super-secret-preview-token",
      }),
      now: NOW,
      stderr,
      stdout,
      exit,
    })).toThrow("exit");

    const combinedOutput = `${stdout.mock.calls.map(([chunk]) => chunk).join("")}\n${stderr.mock.calls.map(([chunk]) => chunk).join("")}`;
    expect(combinedOutput).not.toContain("super-secret-preview-token");
    expect(combinedOutput).toContain('"ready":false');
    expect(stderr).toHaveBeenCalledWith("marketing-validation-preview-preflight: FAIL (redacted)\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("returns failing JSON from the executable without echoing secrets", () => {
    const result = spawnSync("node", [scriptPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...baseEnvironment({
          HOMECOOK_MARKETING_PREVIEW_ORIGIN: "https://app.mumeok.kr",
          MARKETING_TURNSTILE_SECRET: "cli-secret-preview-token",
        }),
      },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("cli-secret-preview-token");
    expect(JSON.parse(result.stdout)).toMatchObject({
      blockers: expect.arrayContaining(["PREVIEW_ORIGIN_PRODUCTION_FORBIDDEN"]),
      ready: false,
      schema: "homecook.marketing-validation-preview-preflight",
      version: 1,
    });
    expect(result.stderr).toContain("FAIL (redacted)");
  });
});
