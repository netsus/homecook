const PREVIEW_REQUIRED_ENV = [
  "HOMECOOK_MARKETING_PREVIEW_NAMESPACE",
  "HOMECOOK_MARKETING_PREVIEW_ORIGIN",
  "ALLOWED_MARKETING_ORIGINS",
  "MARKETING_PAID_ATTRIBUTION_ORIGINS",
  "MARKETING_CAMPAIGN_END_AT",
  "MARKETING_LEAD_PROTECTION_READY",
  "MARKETING_TURNSTILE_ACTION",
  "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES",
  "MARKETING_TURNSTILE_SECRET",
  "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY",
  "DATA_SUPABASE_URL",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
  "HOMECOOK_PREVIEW_APP_PORT",
  "HOMECOOK_PREVIEW_SUPABASE_API_PORT",
  "HOMECOOK_PREVIEW_SUPABASE_DB_PORT",
  "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT",
  "HOMECOOK_PREVIEW_COMPOSE_PROJECT",
  "HOMECOOK_PREVIEW_DB_VOLUME",
  "HOMECOOK_PREVIEW_STORAGE_VOLUME",
];

const SECRET_KEYS = new Set([
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
  "MARKETING_TURNSTILE_SECRET",
]);

const RESERVED_NAMESPACE_FRAGMENT = /\b(?:master|production|prod|cwj)\b/iu;
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/u;
const PREVIEW_TURNSTILE_ACTION = "marketing_validation_lead_submit";
const PLACEHOLDER_VALUE_PATTERN = /^(?:change-me|changeme|replace-with-|todo\b|<)/iu;
const EDGE_EVIDENCE_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function pushError(errors, field, code, message) {
  if (!errors.some((error) => error.field === field && error.code === code)) {
    errors.push({ field, code, message });
  }
}

function readRequiredEnv(env, key, errors) {
  const value = env[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    pushError(errors, key, "required", `${key} is required.`);
    return null;
  }
  return value.trim();
}

function parseOriginList(raw, field, errors) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    pushError(errors, field, "required", `${field} is required.`);
    return [];
  }
  const values = raw.split(",").map((value) => value.trim());
  if (values.some((value) => value.length === 0)) {
    pushError(errors, field, "invalid_origin_list", `${field} must not contain empty origins.`);
    return [];
  }
  const unique = new Set();
  for (const value of values) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      pushError(errors, field, "invalid_origin", `${field} contains an invalid origin.`);
      continue;
    }
    if (
      !["http:", "https:"].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.origin !== value
    ) {
      pushError(errors, field, "invalid_origin", `${field} contains an invalid origin.`);
      continue;
    }
    unique.add(value);
  }
  return [...unique].sort();
}

function parsePort(env, field, errors) {
  const value = readRequiredEnv(env, field, errors);
  if (value === null) return null;
  if (!/^\d+$/u.test(value)) {
    pushError(errors, field, "invalid_port", `${field} must be a numeric port.`);
    return null;
  }
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    pushError(errors, field, "invalid_port", `${field} must be between 1024 and 65535.`);
    return null;
  }
  return port;
}

function parseHostnameList(raw, field, errors) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    pushError(errors, field, "required", `${field} is required.`);
    return [];
  }
  const values = raw.split(",").map((value) => value.trim().toLowerCase());
  if (values.some((value) => value.length === 0)) {
    pushError(errors, field, "invalid_hostname_list", `${field} must not contain empty hostnames.`);
    return [];
  }
  const unique = new Set();
  for (const value of values) {
    if (!HOSTNAME_PATTERN.test(value)) {
      pushError(errors, field, "invalid_hostname", `${field} contains an invalid hostname.`);
      continue;
    }
    unique.add(value);
  }
  return [...unique].sort();
}

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/\.+$/u, "");
}

export function redactPreviewSecrets(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (SECRET_KEYS.has(key) && typeof value === "string" && value.length > 0) {
        return [key, "[redacted]"];
      }
      if (key === "DATA_SUPABASE_URL" && typeof value === "string" && value.length > 0) {
        try {
          const parsed = new URL(value);
          if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
            return [key, "[redacted]"];
          }
          return [key, parsed.origin];
        } catch {
          return [key, "[redacted]"];
        }
      }
      return [key, value];
    }),
  );
}

export function isValidMarketingEdgeEvidence(value) {
  return typeof value === "string" && EDGE_EVIDENCE_PATTERN.test(value.trim());
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   now?: Date,
 *   reservedComposeProjects?: string[],
 *   reservedPorts?: number[],
 *   reservedVolumes?: string[],
 * }} [options]
 */
export function evaluateMarketingPreviewContract({
  env,
  now = new Date(),
  reservedComposeProjects = [],
  reservedPorts = [],
  reservedVolumes = [],
} = {}) {
  const errors = [];
  const safeEnv = env ?? {};

  for (const key of PREVIEW_REQUIRED_ENV) {
    readRequiredEnv(safeEnv, key, errors);
  }

  for (const key of [
    "DATA_SUPABASE_PUBLISHABLE_KEY",
    "DATA_SUPABASE_SECRET_KEY",
    "MARKETING_TURNSTILE_SECRET",
    "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY",
  ]) {
    const value = safeEnv[key]?.trim() ?? "";
    if (value && PLACEHOLDER_VALUE_PATTERN.test(value)) {
      pushError(errors, key, "placeholder_value", `${key} must be replaced before preview use.`);
    }
  }

  const namespace = safeEnv.HOMECOOK_MARKETING_PREVIEW_NAMESPACE?.trim() ?? "";
  const previewOrigin = safeEnv.HOMECOOK_MARKETING_PREVIEW_ORIGIN?.trim() ?? "";
  const allowedOrigins = parseOriginList(
    safeEnv.ALLOWED_MARKETING_ORIGINS,
    "ALLOWED_MARKETING_ORIGINS",
    errors,
  );
  const paidOrigins = parseOriginList(
    safeEnv.MARKETING_PAID_ATTRIBUTION_ORIGINS,
    "MARKETING_PAID_ATTRIBUTION_ORIGINS",
    errors,
  );
  const hostnames = parseHostnameList(
    safeEnv.MARKETING_TURNSTILE_ALLOWED_HOSTNAMES,
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES",
    errors,
  );

  if (namespace && RESERVED_NAMESPACE_FRAGMENT.test(namespace)) {
    pushError(
      errors,
      "HOMECOOK_MARKETING_PREVIEW_NAMESPACE",
      "reserved_namespace",
      "Preview namespace must not look like production, CWJ, or master.",
    );
  }

  const composeProject = safeEnv.HOMECOOK_PREVIEW_COMPOSE_PROJECT?.trim() ?? "";
  if (composeProject && reservedComposeProjects.includes(composeProject)) {
    pushError(
      errors,
      "HOMECOOK_PREVIEW_COMPOSE_PROJECT",
      "reserved_compose_project",
      "Preview compose project must not reuse an operating project name.",
    );
  }

  for (const [field, value] of [
    ["HOMECOOK_PREVIEW_DB_VOLUME", safeEnv.HOMECOOK_PREVIEW_DB_VOLUME?.trim() ?? ""],
    ["HOMECOOK_PREVIEW_STORAGE_VOLUME", safeEnv.HOMECOOK_PREVIEW_STORAGE_VOLUME?.trim() ?? ""],
  ]) {
    if (value && reservedVolumes.includes(value)) {
      pushError(errors, field, "reserved_volume", `${field} must not reuse an operating volume.`);
    }
  }

  let parsedPreviewOrigin = null;
  if (previewOrigin) {
    try {
      parsedPreviewOrigin = new URL(previewOrigin);
      if (parsedPreviewOrigin.origin !== previewOrigin) {
        pushError(
          errors,
          "HOMECOOK_MARKETING_PREVIEW_ORIGIN",
          "invalid_origin",
          "Preview origin must be an exact origin string.",
        );
      }
      if (parsedPreviewOrigin.protocol !== "https:") {
        pushError(
          errors,
          "HOMECOOK_MARKETING_PREVIEW_ORIGIN",
          "https_required",
          "Public preview origin must use HTTPS.",
        );
      }
    } catch {
      pushError(
        errors,
        "HOMECOOK_MARKETING_PREVIEW_ORIGIN",
        "invalid_origin",
        "Preview origin must be a valid absolute origin.",
      );
    }
  }

  if (previewOrigin && allowedOrigins.length > 0 && !allowedOrigins.includes(previewOrigin)) {
    pushError(
      errors,
      "ALLOWED_MARKETING_ORIGINS",
      "missing_preview_origin",
      "Allowed origins must include the preview origin.",
    );
  }
  if (previewOrigin && paidOrigins.length > 0 && !paidOrigins.includes(previewOrigin)) {
    pushError(
      errors,
      "MARKETING_PAID_ATTRIBUTION_ORIGINS",
      "missing_preview_origin",
      "Paid attribution origins must include the preview origin.",
    );
  }

  for (const [field, origins] of [
    ["ALLOWED_MARKETING_ORIGINS", allowedOrigins],
    ["MARKETING_PAID_ATTRIBUTION_ORIGINS", paidOrigins],
  ]) {
    for (const origin of origins) {
      const hostname = normalizeHostname(new URL(origin).hostname);
      if (hostname === "app.mumeok.kr" || hostname === "auth.mumeok.kr") {
        pushError(
          errors,
          field,
          "production_origin_forbidden",
          `${field} must not include production origins.`,
        );
      }
    }
  }

  const dataSupabaseUrl = safeEnv.DATA_SUPABASE_URL?.trim() ?? "";
  if (dataSupabaseUrl) {
    try {
      const parsed = new URL(dataSupabaseUrl);
      if (
        !["http:", "https:"].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.pathname !== "/"
        || parsed.search
        || parsed.hash
        || parsed.origin !== dataSupabaseUrl
      ) {
        pushError(
          errors,
          "DATA_SUPABASE_URL",
          "invalid_url",
          "Preview Supabase URL must be an exact credential-free origin.",
        );
      }
      if (!isLoopbackHostname(parsed.hostname)) {
        pushError(
          errors,
          "DATA_SUPABASE_URL",
          "loopback_required",
          "Preview Supabase URL must stay on localhost or 127.0.0.1.",
        );
      }
    } catch {
      pushError(
        errors,
        "DATA_SUPABASE_URL",
        "invalid_url",
        "Preview Supabase URL must be a valid absolute URL.",
      );
    }
  }

  const ports = [
    ["HOMECOOK_PREVIEW_APP_PORT", parsePort(safeEnv, "HOMECOOK_PREVIEW_APP_PORT", errors)],
    ["HOMECOOK_PREVIEW_SUPABASE_API_PORT", parsePort(safeEnv, "HOMECOOK_PREVIEW_SUPABASE_API_PORT", errors)],
    ["HOMECOOK_PREVIEW_SUPABASE_DB_PORT", parsePort(safeEnv, "HOMECOOK_PREVIEW_SUPABASE_DB_PORT", errors)],
    ["HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT", parsePort(safeEnv, "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT", errors)],
  ];
  const seenPorts = new Map();
  for (const [field, port] of ports) {
    if (port === null) continue;
    if (reservedPorts.includes(port)) {
      pushError(errors, field, "reserved_port", `${field} must not reuse an operating port.`);
    }
    const previous = seenPorts.get(port);
    if (previous) {
      pushError(errors, field, "duplicate_port", `${field} duplicates ${previous}.`);
    } else {
      seenPorts.set(port, field);
    }
  }

  const campaignEndAt = safeEnv.MARKETING_CAMPAIGN_END_AT?.trim() ?? "";
  let campaignOpen = false;
  if (campaignEndAt) {
    const parsed = new Date(campaignEndAt);
    if (Number.isNaN(parsed.getTime())) {
      pushError(
        errors,
        "MARKETING_CAMPAIGN_END_AT",
        "invalid_date",
        "Campaign end must be an ISO timestamp.",
      );
    } else if (parsed.getTime() <= now.getTime()) {
      pushError(
        errors,
        "MARKETING_CAMPAIGN_END_AT",
        "campaign_closed",
        "Campaign end must stay in the future for lead capture.",
      );
    } else {
      campaignOpen = true;
    }
  }

  const leadReady = safeEnv.MARKETING_LEAD_PROTECTION_READY?.trim() === "1";
  const edgeEvidence = (
    safeEnv.MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE
    ?? safeEnv.MARKETING_EDGE_RULE_EVIDENCE
    ?? ""
  ).trim();
  if (leadReady && !edgeEvidence) {
    pushError(
      errors,
      "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE",
      "required",
      "A reviewed edge rule evidence digest is required before lead capture.",
    );
  } else if (leadReady && !isValidMarketingEdgeEvidence(edgeEvidence)) {
    pushError(
      errors,
      "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE",
      "invalid_evidence",
      "Edge rule evidence must be a reviewed SHA-256 digest.",
    );
  }
  const turnstileAction = safeEnv.MARKETING_TURNSTILE_ACTION?.trim() ?? "";
  if (turnstileAction && turnstileAction !== PREVIEW_TURNSTILE_ACTION) {
    pushError(
      errors,
      "MARKETING_TURNSTILE_ACTION",
      "invalid_turnstile_action",
      "Turnstile action must stay on the approved marketing submit action.",
    );
  }
  for (const hostname of hostnames) {
    if (hostname === "app.mumeok.kr" || hostname === "auth.mumeok.kr") {
      pushError(
        errors,
        "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES",
        "production_hostname_forbidden",
        "Turnstile hostnames must stay on preview hosts.",
      );
    }
  }
  if (parsedPreviewOrigin && hostnames.length > 0 && !hostnames.includes(normalizeHostname(parsedPreviewOrigin.hostname))) {
    pushError(
      errors,
      "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES",
      "missing_preview_hostname",
      "Turnstile hostnames must include the preview hostname.",
    );
  }

  const leadGateErrors = errors.filter((error) => (
    error.field.startsWith("MARKETING_")
    || error.field.startsWith("DATA_SUPABASE_")
    || error.field === "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY"
    || error.field === "ALLOWED_MARKETING_ORIGINS"
    || error.field === "MARKETING_PAID_ATTRIBUTION_ORIGINS"
  ));
  const leadGateOpen = leadReady && campaignOpen && leadGateErrors.length === 0;

  return {
    ok: errors.length === 0,
    leadGateOpen,
    allowedOrigins,
    paidOrigins,
    turnstileAllowedHostnames: hostnames,
    redactedEnv: redactPreviewSecrets({
      DATA_SUPABASE_URL: safeEnv.DATA_SUPABASE_URL,
      DATA_SUPABASE_PUBLISHABLE_KEY: safeEnv.DATA_SUPABASE_PUBLISHABLE_KEY,
      DATA_SUPABASE_SECRET_KEY: safeEnv.DATA_SUPABASE_SECRET_KEY,
      MARKETING_TURNSTILE_SECRET: safeEnv.MARKETING_TURNSTILE_SECRET,
    }),
    errors,
  };
}

export { PREVIEW_TURNSTILE_ACTION };
