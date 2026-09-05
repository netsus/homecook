import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import campaignContract from "@/lib/marketing/marketing-validation-campaign.json";
import {
  EDGE_EVIDENCE_DIGEST,
  evaluateMarketingProductionReadiness,
  runMarketingProductionReadinessCli,
  TURNSTILE_SITE_KEY,
} from "../scripts/lib/marketing-validation-production-readiness.mjs";

const NOW = new Date("2026-09-05T09:30:00.000Z");
const CAMPAIGN_END = "2026-09-15T15:00:00.000Z";
const repoRoot = path.resolve(__dirname, "..");

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ALLOWED_MARKETING_ORIGINS: "https://app.mumeok.kr",
    MARKETING_CAMPAIGN_END_AT: CAMPAIGN_END,
    MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE: EDGE_EVIDENCE_DIGEST,
    MARKETING_LEAD_PROTECTION_READY: "0",
    MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://app.mumeok.kr",
    MARKETING_TURNSTILE_ACTION: "marketing_validation_lead_submit",
    MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "app.mumeok.kr",
    MARKETING_TURNSTILE_SECRET: "production-secret-value",
    NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SITE_URL: "https://app.mumeok.kr",
    ...overrides,
  };
}

describe("marketing production readiness", () => {
  it("accepts a staged production configuration while keeping lead capture off", () => {
    const result = evaluateMarketingProductionReadiness({
      env: productionEnv(),
      mode: "staged",
      now: NOW,
    });

    expect(result).toMatchObject({
      blockers: [],
      mode: "staged",
      ready: true,
      retention: {
        campaign_end_at: CAMPAIGN_END,
        retention_days: 180,
        retention_until: "2027-03-14T15:00:00.000Z",
      },
      checks: {
        lead_protection: { configured: false, expected: false, ok: true },
        turnstile: {
          action_ok: true,
          hostname_ok: true,
          secret_configured: true,
          site_key_configured: true,
          widget_readback_ok: true,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("production-secret-value");
    expect(JSON.stringify(result)).not.toContain("production-site-key");
  });

  it("requires lead protection on only for the activation check", () => {
    const staged = evaluateMarketingProductionReadiness({
      env: productionEnv({ MARKETING_LEAD_PROTECTION_READY: "1" }),
      mode: "staged",
      now: NOW,
    });
    const activation = evaluateMarketingProductionReadiness({
      env: productionEnv({ MARKETING_LEAD_PROTECTION_READY: "1" }),
      mode: "activation",
      now: NOW,
    });

    expect(staged.ready).toBe(false);
    expect(staged.blockers).toContain("LEAD_PROTECTION_MUST_STAY_OFF");
    expect(activation.ready).toBe(true);
  });

  it("rejects placeholder security values, unsafe origins, and expired campaigns without leaking input", () => {
    const result = evaluateMarketingProductionReadiness({
      env: productionEnv({
        ALLOWED_MARKETING_ORIGINS: "https://attacker.invalid",
        MARKETING_CAMPAIGN_END_AT: "2026-09-01T00:00:00.000Z",
        MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE: "replace-with-edge-evidence",
        MARKETING_TURNSTILE_ALLOWED_HOSTNAMES: "auth.mumeok.kr",
        MARKETING_TURNSTILE_SECRET: "replace-with-private-secret",
        NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "replace-with-site-key",
      }),
      mode: "staged",
      now: NOW,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "ALLOWED_ORIGIN_MISSING",
      "CAMPAIGN_CLOSED",
      "CAMPAIGN_END_NOT_APPROVED",
      "EDGE_EVIDENCE_INVALID",
      "TURNSTILE_HOSTNAME_INVALID",
      "TURNSTILE_SECRET_INVALID",
      "TURNSTILE_SITE_KEY_INVALID",
    ]));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("replace-with-private-secret");
    expect(serialized).not.toContain("replace-with-site-key");
  });

  it("requires exact production origin sets, the approved campaign end, and a valid evaluator mode", () => {
    const result = evaluateMarketingProductionReadiness({
      env: productionEnv({
        ALLOWED_MARKETING_ORIGINS: "https://app.mumeok.kr,https://attacker.invalid",
        MARKETING_CAMPAIGN_END_AT: "2099-09-15T15:00:00.000Z",
        MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://app.mumeok.kr,https://attacker.invalid",
      }),
      mode: "typo" as "staged",
      now: NOW,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "ALLOWED_ORIGINS_NOT_EXACT",
      "CAMPAIGN_END_NOT_APPROVED",
      "MODE_INVALID",
      "PAID_ORIGINS_NOT_EXACT",
    ]));

    const subsetViolation = evaluateMarketingProductionReadiness({
      env: productionEnv({
        ALLOWED_MARKETING_ORIGINS: "https://app.mumeok.kr",
        MARKETING_PAID_ATTRIBUTION_ORIGINS: "https://app.mumeok.kr,https://attacker.invalid",
      }),
      mode: "staged",
      now: NOW,
    });
    expect(subsetViolation.blockers).toContain("PAID_ORIGIN_NOT_ALLOWED");
  });

  it("emits only redacted JSON and fails closed from the CLI", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn((code: number): never => {
      void code;
      throw new Error("exit");
    });

    expect(() => runMarketingProductionReadinessCli({
      argv: ["--mode", "staged"],
      env: productionEnv({ MARKETING_TURNSTILE_SECRET: "private" }),
      now: NOW,
      stdout,
      stderr,
      exit,
    })).toThrow("exit");

    const output = stdout.mock.calls.map(([chunk]) => chunk).join("");
    expect(output).not.toContain("private");
    expect(JSON.parse(output)).toMatchObject({ ready: false, mode: "staged" });
    expect(stderr).toHaveBeenCalledWith("marketing-production-readiness: FAIL (redacted)\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("binds readiness to the committed Cloudflare readback without recording a secret", () => {
    const edgeEvidence = readFileSync(
      path.join(repoRoot, "docs/engineering/evidence/2026-09-05-marketing-edge-rate-limit-readback.json"),
    );
    const turnstileEvidence = readFileSync(
      path.join(repoRoot, "docs/engineering/evidence/2026-09-05-marketing-turnstile-readback.json"),
      "utf8",
    );
    const edgeDigest = createHash("sha256").update(edgeEvidence).digest("hex");

    expect(`sha256:${edgeDigest}`).toBe(campaignContract.edgeRateLimitEvidenceDigest);
    expect(turnstileEvidence).toContain(`"site_key": "${TURNSTILE_SITE_KEY}"`);
    expect(turnstileEvidence).toContain('"secret_rotated_after_creation": true');
    expect(turnstileEvidence).toContain('"secret_storage": "cloudflare-account-only"');
    expect(turnstileEvidence).not.toMatch(/"secret[_ -]?key"/iu);
  });
});
