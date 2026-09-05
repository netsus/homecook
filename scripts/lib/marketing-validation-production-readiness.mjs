import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import campaignContract from "../../lib/marketing/marketing-validation-campaign.json" with { type: "json" };
import turnstileReadback from "../../docs/engineering/evidence/2026-09-05-marketing-turnstile-readback.json" with { type: "json" };

const PRODUCTION_ORIGIN = "https://app.mumeok.kr";
const PRODUCTION_HOSTNAME = "app.mumeok.kr";
const TURNSTILE_ACTION = "marketing_validation_lead_submit";
const CAMPAIGN_END_AT = campaignContract.campaignEndAt;
const EDGE_EVIDENCE_DIGEST = campaignContract.edgeRateLimitEvidenceDigest;
const RETENTION_DAYS = campaignContract.retentionDays;
const TURNSTILE_SITE_KEY = campaignContract.turnstileSiteKey;
const PLACEHOLDER_PATTERN = /^(?:change-me|changeme|replace-with-|todo\b|<)/iu;
const edgeReadbackBytes = readFileSync(new URL(
  "../../docs/engineering/evidence/2026-09-05-marketing-edge-rate-limit-readback.json",
  import.meta.url,
));
const turnstileReadbackBytes = readFileSync(new URL(
  "../../docs/engineering/evidence/2026-09-05-marketing-turnstile-readback.json",
  import.meta.url,
));
const edgeReadbackDigest = `sha256:${createHash("sha256").update(edgeReadbackBytes).digest("hex")}`;
const turnstileReadbackDigest = `sha256:${createHash("sha256").update(turnstileReadbackBytes).digest("hex")}`;

function read(env, key) {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pushBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code);
}

function parseOriginList(raw, blockers, invalidCode) {
  if (!raw) {
    pushBlocker(blockers, invalidCode);
    return [];
  }
  const origins = [];
  for (const value of raw.split(",").map((entry) => entry.trim())) {
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:"
        || parsed.username
        || parsed.password
        || parsed.pathname !== "/"
        || parsed.search
        || parsed.hash
        || parsed.origin !== value
      ) {
        pushBlocker(blockers, invalidCode);
        continue;
      }
      origins.push(parsed.origin);
    } catch {
      pushBlocker(blockers, invalidCode);
    }
  }
  return [...new Set(origins)].sort();
}

function configuredSecurityValue(value) {
  return value.length >= 8 && !PLACEHOLDER_PATTERN.test(value);
}

function parseCampaignEnd(raw, now, blockers) {
  if (!raw) {
    pushBlocker(blockers, "CAMPAIGN_END_MISSING");
    return { campaignEndAt: null, retentionUntil: null };
  }
  const campaignEndAt = new Date(raw);
  if (Number.isNaN(campaignEndAt.getTime()) || campaignEndAt.toISOString() !== raw) {
    pushBlocker(blockers, "CAMPAIGN_END_INVALID");
    return { campaignEndAt: null, retentionUntil: null };
  }
  if (campaignEndAt.getTime() <= now.getTime()) {
    pushBlocker(blockers, "CAMPAIGN_CLOSED");
  }
  if (raw !== CAMPAIGN_END_AT) {
    pushBlocker(blockers, "CAMPAIGN_END_NOT_APPROVED");
  }
  const retentionUntil = new Date(campaignEndAt);
  retentionUntil.setUTCDate(retentionUntil.getUTCDate() + RETENTION_DAYS);
  return { campaignEndAt, retentionUntil };
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   mode?: "staged" | "activation",
 *   now?: Date,
 * }} [options]
 */
export function evaluateMarketingProductionReadiness({
  env = process.env,
  mode = "staged",
  now = new Date(),
} = {}) {
  const blockers = [];
  const modeValid = mode === "staged" || mode === "activation";
  if (!modeValid) pushBlocker(blockers, "MODE_INVALID");
  const siteOrigin = read(env, "NEXT_PUBLIC_SITE_URL");
  if (siteOrigin !== PRODUCTION_ORIGIN) pushBlocker(blockers, "SITE_ORIGIN_INVALID");

  const allowedOrigins = parseOriginList(
    read(env, "ALLOWED_MARKETING_ORIGINS"),
    blockers,
    "ALLOWED_ORIGINS_INVALID",
  );
  if (!allowedOrigins.includes(PRODUCTION_ORIGIN)) pushBlocker(blockers, "ALLOWED_ORIGIN_MISSING");

  const paidOrigins = parseOriginList(
    read(env, "MARKETING_PAID_ATTRIBUTION_ORIGINS"),
    blockers,
    "PAID_ORIGINS_INVALID",
  );
  if (!paidOrigins.includes(PRODUCTION_ORIGIN)) pushBlocker(blockers, "PAID_ORIGIN_MISSING");
  const allowedOriginsExact = allowedOrigins.length === 1 && allowedOrigins[0] === PRODUCTION_ORIGIN;
  const paidOriginsExact = paidOrigins.length === 1 && paidOrigins[0] === PRODUCTION_ORIGIN;
  const paidOriginsAllowed = paidOrigins.every((origin) => allowedOrigins.includes(origin));
  if (!allowedOriginsExact) pushBlocker(blockers, "ALLOWED_ORIGINS_NOT_EXACT");
  if (!paidOriginsExact) pushBlocker(blockers, "PAID_ORIGINS_NOT_EXACT");
  if (!paidOriginsAllowed) pushBlocker(blockers, "PAID_ORIGIN_NOT_ALLOWED");

  const { campaignEndAt, retentionUntil } = parseCampaignEnd(
    read(env, "MARKETING_CAMPAIGN_END_AT"),
    now,
    blockers,
  );

  const siteKey = read(env, "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY");
  const secret = read(env, "MARKETING_TURNSTILE_SECRET")
    || read(env, "TURNSTILE_SECRET_KEY")
    || read(env, "CLOUDFLARE_TURNSTILE_SECRET_KEY");
  const action = read(env, "MARKETING_TURNSTILE_ACTION");
  const hostnames = read(env, "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase().replace(/\.+$/u, ""))
    .filter(Boolean);
  const hostnameOk = hostnames.length === 1 && hostnames[0] === PRODUCTION_HOSTNAME;
  const actionOk = action === TURNSTILE_ACTION;
  const siteKeyConfigured = siteKey === campaignContract.turnstileSiteKey;
  const secretConfigured = configuredSecurityValue(secret);
  const turnstileReadbackOk = (
    turnstileReadbackDigest === campaignContract.turnstileReadbackDigest
    && turnstileReadback.site_key === campaignContract.turnstileSiteKey
    && turnstileReadback.configured_hostname === campaignContract.turnstileWidgetHostname
    && turnstileReadback.application_hostname === PRODUCTION_HOSTNAME
    && turnstileReadback.widget_mode === campaignContract.turnstileMode
    && turnstileReadback.pre_clearance === campaignContract.turnstilePreClearance
    && turnstileReadback.secret_rotated_after_creation === true
    && turnstileReadback.secret_storage === "cloudflare-account-only"
  );
  if (!siteKeyConfigured) pushBlocker(blockers, "TURNSTILE_SITE_KEY_INVALID");
  if (!secretConfigured) pushBlocker(blockers, "TURNSTILE_SECRET_INVALID");
  if (!actionOk) pushBlocker(blockers, "TURNSTILE_ACTION_INVALID");
  if (!hostnameOk) pushBlocker(blockers, "TURNSTILE_HOSTNAME_INVALID");
  if (!turnstileReadbackOk) pushBlocker(blockers, "TURNSTILE_READBACK_INVALID");

  const edgeEvidence = read(env, "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE")
    || read(env, "MARKETING_EDGE_RULE_EVIDENCE");
  const edgeEvidenceOk = edgeEvidence === EDGE_EVIDENCE_DIGEST
    && edgeReadbackDigest === EDGE_EVIDENCE_DIGEST;
  if (!edgeEvidenceOk) pushBlocker(blockers, "EDGE_EVIDENCE_INVALID");

  const leadReady = read(env, "MARKETING_LEAD_PROTECTION_READY") === "1";
  const expectedLeadReady = modeValid && mode === "activation";
  if (leadReady !== expectedLeadReady) {
    pushBlocker(
      blockers,
      mode === "activation" ? "LEAD_PROTECTION_MUST_BE_ON" : "LEAD_PROTECTION_MUST_STAY_OFF",
    );
  }

  return {
    schema: "homecook.marketing-validation-production-readiness",
    version: 1,
    mode,
    ready: blockers.length === 0,
    blockers,
    retention: {
      campaign_end_at: campaignEndAt?.toISOString() ?? null,
      retention_days: RETENTION_DAYS,
      retention_until: retentionUntil?.toISOString() ?? null,
    },
    checks: {
      origins: {
        site_origin_ok: siteOrigin === PRODUCTION_ORIGIN,
        allowed_origin_ok: allowedOriginsExact,
        paid_origin_ok: paidOriginsExact && paidOriginsAllowed,
      },
      turnstile: {
        action_ok: actionOk,
        hostname_ok: hostnameOk,
        secret_configured: secretConfigured,
        site_key_configured: siteKeyConfigured,
        widget_readback_ok: turnstileReadbackOk,
      },
      edge_rate_limit: {
        evidence_digest_ok: edgeEvidenceOk,
      },
      lead_protection: {
        configured: leadReady,
        expected: expectedLeadReady,
        ok: leadReady === expectedLeadReady,
      },
    },
  };
}

/**
 * @param {{
 *   argv?: string[],
 *   env?: Record<string, string | undefined>,
 *   now?: Date,
 *   stdout?: (chunk: string) => void,
 *   stderr?: (chunk: string) => void,
 *   exit?: (code: number) => never,
 * }} [options]
 */
export function runMarketingProductionReadinessCli({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  stdout = (chunk) => process.stdout.write(chunk),
  stderr = (chunk) => process.stderr.write(chunk),
  exit = (code) => process.exit(code),
} = {}) {
  if (argv.length !== 2 || argv[0] !== "--mode" || !["staged", "activation"].includes(argv[1])) {
    stderr("usage: marketing-production-readiness --mode <staged|activation>\n");
    exit(1);
    return null;
  }
  const result = evaluateMarketingProductionReadiness({ env, mode: argv[1], now });
  stdout(`${JSON.stringify(result)}\n`);
  if (!result.ready) {
    stderr("marketing-production-readiness: FAIL (redacted)\n");
    exit(1);
  }
  return result;
}

export {
  PRODUCTION_HOSTNAME,
  PRODUCTION_ORIGIN,
  CAMPAIGN_END_AT,
  EDGE_EVIDENCE_DIGEST,
  RETENTION_DAYS,
  TURNSTILE_ACTION,
  TURNSTILE_SITE_KEY,
};
