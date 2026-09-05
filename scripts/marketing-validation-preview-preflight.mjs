#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertExactLoopbackHttpOrigin } from "./lib/local-only-supabase-operator-env.mjs";
import {
  evaluateMarketingPreviewContract,
  isValidMarketingEdgeEvidence,
  PREVIEW_TURNSTILE_ACTION,
  redactPreviewSecrets,
} from "./lib/marketing-validation-preview-contract.mjs";

/**
 * @typedef {Record<string, string | undefined>} PreviewEnv
 * @typedef {{ label: string, host: string, port: number }} ListenerEntry
 */

export const PRODUCTION_APP_ORIGIN = "https://app.mumeok.kr";
export const PRODUCTION_AUTH_ORIGIN = "https://auth.mumeok.kr";
export const RESERVED_PRODUCTION_ORIGINS = Object.freeze([
  PRODUCTION_APP_ORIGIN,
  PRODUCTION_AUTH_ORIGIN,
]);
export const RESERVED_PRODUCTION_HOSTNAMES = Object.freeze([
  "app.mumeok.kr",
  "auth.mumeok.kr",
]);
export const RESERVED_FULL_LOCAL_COMPOSE_PROJECTS = Object.freeze([
  "homecook-full-local-isolated",
]);
export const RESERVED_FULL_LOCAL_VOLUMES = Object.freeze([
  "homecook-full-local-postgres",
  "homecook-full-local-storage",
]);
export const RESERVED_PORTS = Object.freeze([
  3000,
  3100,
  54320,
  54321,
  54322,
  54323,
  54324,
  54325,
  54326,
  54481,
  54482,
]);
export const RESERVED_SUPABASE_PORTS = Object.freeze([
  54320,
  54321,
  54322,
  54323,
  54324,
  54325,
  54326,
  54481,
  54482,
]);
export const SUPABASE_LOOPBACK_URL_KEYS = Object.freeze([
  "DATA_SUPABASE_URL",
  "LOCAL_SUPABASE_INTERNAL_URL",
  "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const FORBIDDEN_EXTERNAL_LISTENER_PATTERN = /supabase|postgrest|postgres|studio|pgmeta|kong|api-gateway|auth/iu;

function readEnvValue(env, name) {
  const value = env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function pushBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code);
}

function parsePort(raw) {
  if (!/^\d+$/u.test(raw)) return null;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function parseOrigin(raw) {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * @param {PreviewEnv} env
 */
function normalizePreviewEnv(env) {
  const helperEnv = { ...env };
  helperEnv.HOMECOOK_MARKETING_PREVIEW_ORIGIN = (
    readEnvValue(env, "HOMECOOK_MARKETING_PREVIEW_ORIGIN")
    || readEnvValue(env, "MARKETING_PREVIEW_PUBLIC_ORIGIN")
  );
  helperEnv.HOMECOOK_PREVIEW_COMPOSE_PROJECT = (
    readEnvValue(env, "HOMECOOK_PREVIEW_COMPOSE_PROJECT")
    || readEnvValue(env, "FULL_LOCAL_COMPOSE_PROJECT_NAME")
  );
  helperEnv.HOMECOOK_PREVIEW_DB_VOLUME = (
    readEnvValue(env, "HOMECOOK_PREVIEW_DB_VOLUME")
    || readEnvValue(env, "FULL_LOCAL_POSTGRES_VOLUME_NAME")
  );
  helperEnv.HOMECOOK_PREVIEW_STORAGE_VOLUME = (
    readEnvValue(env, "HOMECOOK_PREVIEW_STORAGE_VOLUME")
    || readEnvValue(env, "FULL_LOCAL_STORAGE_VOLUME_NAME")
  );

  const dataSupabaseUrl = parseOrigin(readEnvValue(env, "DATA_SUPABASE_URL"));
  if (!readEnvValue(env, "HOMECOOK_PREVIEW_SUPABASE_API_PORT") && dataSupabaseUrl?.port) {
    helperEnv.HOMECOOK_PREVIEW_SUPABASE_API_PORT = dataSupabaseUrl.port;
  }

  return helperEnv;
}

/**
 * @param {string[]} blockers
 * @param {{ field: string, code: string }} error
 */
function mapContractErrorToBlockers(blockers, error) {
  const key = `${error.field}:${error.code}`;
  const mapping = {
    "HOMECOOK_MARKETING_PREVIEW_NAMESPACE:required": "PREVIEW_NAMESPACE_MISSING",
    "HOMECOOK_MARKETING_PREVIEW_NAMESPACE:reserved_namespace": "PREVIEW_NAMESPACE_RESERVED",
    "HOMECOOK_MARKETING_PREVIEW_ORIGIN:required": "PREVIEW_ORIGIN_MISSING",
    "HOMECOOK_MARKETING_PREVIEW_ORIGIN:invalid_origin": "PREVIEW_ORIGIN_INVALID",
    "HOMECOOK_MARKETING_PREVIEW_ORIGIN:https_required": "PREVIEW_HTTPS_REQUIRED",
    "ALLOWED_MARKETING_ORIGINS:required": "ALLOWED_ORIGINS_MISSING",
    "ALLOWED_MARKETING_ORIGINS:invalid_origin_list": "ALLOWED_ORIGINS_INVALID",
    "ALLOWED_MARKETING_ORIGINS:invalid_origin": "ALLOWED_ORIGINS_INVALID",
    "ALLOWED_MARKETING_ORIGINS:missing_preview_origin": "PREVIEW_ORIGIN_NOT_ALLOWLISTED",
    "ALLOWED_MARKETING_ORIGINS:production_origin_forbidden": "ALLOWED_ORIGINS_INCLUDE_PRODUCTION",
    "MARKETING_PAID_ATTRIBUTION_ORIGINS:required": "PAID_ATTRIBUTION_ORIGINS_MISSING",
    "MARKETING_PAID_ATTRIBUTION_ORIGINS:invalid_origin_list": "PAID_ATTRIBUTION_ORIGINS_INVALID",
    "MARKETING_PAID_ATTRIBUTION_ORIGINS:invalid_origin": "PAID_ATTRIBUTION_ORIGINS_INVALID",
    "MARKETING_PAID_ATTRIBUTION_ORIGINS:missing_preview_origin": "PREVIEW_ORIGIN_NOT_PAID_ALLOWLISTED",
    "MARKETING_PAID_ATTRIBUTION_ORIGINS:production_origin_forbidden": "PAID_ATTRIBUTION_ORIGINS_INCLUDE_PRODUCTION",
    "MARKETING_CAMPAIGN_END_AT:required": "CAMPAIGN_END_MISSING",
    "MARKETING_CAMPAIGN_END_AT:invalid_date": "CAMPAIGN_END_INVALID",
    "MARKETING_CAMPAIGN_END_AT:campaign_closed": "CAMPAIGN_CLOSED",
    "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE:required": "LEAD_GATE_EDGE_EVIDENCE_MISSING",
    "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE:invalid_evidence": "LEAD_GATE_EDGE_EVIDENCE_INVALID",
    "MARKETING_TURNSTILE_ACTION:required": "TURNSTILE_ACTION_MISSING",
    "MARKETING_TURNSTILE_ACTION:invalid_turnstile_action": "TURNSTILE_ACTION_INVALID",
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES:required": "LEAD_GATE_TURNSTILE_HOSTNAMES_MISSING",
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES:invalid_hostname_list": "LEAD_GATE_TURNSTILE_HOSTNAMES_INVALID",
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES:invalid_hostname": "LEAD_GATE_TURNSTILE_HOSTNAMES_INVALID",
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES:production_hostname_forbidden": "TURNSTILE_HOSTNAME_PRODUCTION_FORBIDDEN",
    "MARKETING_TURNSTILE_ALLOWED_HOSTNAMES:missing_preview_hostname": "LEAD_GATE_PREVIEW_HOSTNAME_NOT_ALLOWED",
    "MARKETING_TURNSTILE_SECRET:required": "LEAD_GATE_TURNSTILE_SECRET_MISSING",
    "MARKETING_TURNSTILE_SECRET:placeholder_value": "LEAD_GATE_TURNSTILE_SECRET_PLACEHOLDER",
    "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY:required": "LEAD_GATE_TURNSTILE_SITE_KEY_MISSING",
    "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY:placeholder_value": "LEAD_GATE_TURNSTILE_SITE_KEY_PLACEHOLDER",
    "DATA_SUPABASE_URL:required": "DATA_SUPABASE_URL_MISSING",
    "DATA_SUPABASE_URL:invalid_url": "SUPABASE_URL_INVALID",
    "DATA_SUPABASE_URL:loopback_required": "SUPABASE_URL_NOT_LOOPBACK",
    "DATA_SUPABASE_PUBLISHABLE_KEY:required": "DATA_SUPABASE_PUBLISHABLE_KEY_MISSING",
    "DATA_SUPABASE_PUBLISHABLE_KEY:placeholder_value": "DATA_SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER",
    "DATA_SUPABASE_SECRET_KEY:required": "DATA_SUPABASE_SECRET_KEY_MISSING",
    "DATA_SUPABASE_SECRET_KEY:placeholder_value": "DATA_SUPABASE_SECRET_KEY_PLACEHOLDER",
    "HOMECOOK_PREVIEW_APP_PORT:required": "APP_PORT_MISSING",
    "HOMECOOK_PREVIEW_APP_PORT:invalid_port": "APP_PORT_INVALID",
    "HOMECOOK_PREVIEW_APP_PORT:reserved_port": "APP_PORT_RESERVED",
    "HOMECOOK_PREVIEW_APP_PORT:duplicate_port": "PREVIEW_PORTS_NOT_UNIQUE",
    "HOMECOOK_PREVIEW_SUPABASE_API_PORT:required": "SUPABASE_API_PORT_MISSING",
    "HOMECOOK_PREVIEW_SUPABASE_API_PORT:invalid_port": "SUPABASE_API_PORT_INVALID",
    "HOMECOOK_PREVIEW_SUPABASE_API_PORT:reserved_port": "SUPABASE_API_PORT_RESERVED",
    "HOMECOOK_PREVIEW_SUPABASE_API_PORT:duplicate_port": "PREVIEW_PORTS_NOT_UNIQUE",
    "HOMECOOK_PREVIEW_SUPABASE_DB_PORT:required": "SUPABASE_DB_PORT_MISSING",
    "HOMECOOK_PREVIEW_SUPABASE_DB_PORT:invalid_port": "SUPABASE_DB_PORT_INVALID",
    "HOMECOOK_PREVIEW_SUPABASE_DB_PORT:reserved_port": "SUPABASE_DB_PORT_RESERVED",
    "HOMECOOK_PREVIEW_SUPABASE_DB_PORT:duplicate_port": "PREVIEW_PORTS_NOT_UNIQUE",
    "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT:required": "SUPABASE_STUDIO_PORT_MISSING",
    "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT:invalid_port": "SUPABASE_STUDIO_PORT_INVALID",
    "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT:reserved_port": "SUPABASE_STUDIO_PORT_RESERVED",
    "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT:duplicate_port": "PREVIEW_PORTS_NOT_UNIQUE",
    "HOMECOOK_PREVIEW_COMPOSE_PROJECT:required": "COMPOSE_PROJECT_MISSING",
    "HOMECOOK_PREVIEW_COMPOSE_PROJECT:reserved_compose_project": "COMPOSE_PROJECT_COLLISION",
    "HOMECOOK_PREVIEW_DB_VOLUME:required": "POSTGRES_VOLUME_MISSING",
    "HOMECOOK_PREVIEW_DB_VOLUME:reserved_volume": "POSTGRES_VOLUME_COLLISION",
    "HOMECOOK_PREVIEW_STORAGE_VOLUME:required": "STORAGE_VOLUME_MISSING",
    "HOMECOOK_PREVIEW_STORAGE_VOLUME:reserved_volume": "STORAGE_VOLUME_COLLISION",
  };
  pushBlocker(blockers, mapping[key] ?? "PREVIEW_CONTRACT_INVALID");
}

function isReservedOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase().replace(/\.+$/u, "");
    return RESERVED_PRODUCTION_HOSTNAMES.includes(hostname);
  } catch {
    return false;
  }
}

function isExternalListenerHost(host) {
  return !LOOPBACK_HOSTS.has(host);
}

/**
 * @param {string} raw
 * @returns {ListenerEntry[]}
 */
export function parseLsofListenerInventory(raw) {
  const listeners = [];
  const seen = new Set();
  let command = "unknown";
  for (const line of raw.split(/\r?\n/u)) {
    if (line.startsWith("c")) {
      command = line.slice(1).trim() || "unknown";
      continue;
    }
    if (!line.startsWith("n")) continue;
    const endpoint = line.slice(1).trim();
    const separator = endpoint.lastIndexOf(":");
    if (separator <= 0) continue;
    const host = endpoint.slice(0, separator);
    const port = parsePort(endpoint.slice(separator + 1));
    if (port === null) continue;
    const key = `${command}\u0000${host}\u0000${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    listeners.push({ label: command, host, port });
  }
  return listeners;
}

function readListenerInventoryFromLsof() {
  try {
    return parseLsofListenerInventory(execFileSync(
      "lsof",
      ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "cfn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   blockers: string[],
 *   listenerInventory: ListenerEntry[] | null | undefined,
 *   previewAppPort: number | null,
 *   protectedPorts: number[],
 *   summary: {
 *     checks: {
 *       listener_inventory: {
 *         provided: boolean,
 *         ok: boolean,
 *         manual_verification_required: boolean,
 *         external_listener_count: number,
 *         allowed_external_listener_count: number,
 *         forbidden_external_listener_count: number,
 *         unrelated_external_listener_count: number,
 *         allowed_external_listeners: ListenerEntry[],
 *         forbidden_external_listeners: ListenerEntry[],
 *         unrelated_external_listeners: ListenerEntry[],
 *       }
 *     }
 *   }
 * }} options
 */
function evaluateListenerInventory({
  blockers,
  listenerInventory,
  previewAppPort,
  protectedPorts,
  summary,
}) {
  const listenerSummary = summary.checks.listener_inventory;
  if (listenerInventory === null || listenerInventory === undefined) {
    pushBlocker(blockers, "LISTENER_INVENTORY_MISSING");
    listenerSummary.manual_verification_required = true;
    listenerSummary.ok = false;
    return;
  }

  if (!Array.isArray(listenerInventory)) {
    pushBlocker(blockers, "LISTENER_INVENTORY_INVALID");
    listenerSummary.ok = false;
    return;
  }

  listenerSummary.provided = true;
  listenerSummary.manual_verification_required = false;
  listenerSummary.ok = true;

  for (const entry of listenerInventory) {
    if (
      !entry
      || typeof entry !== "object"
      || typeof entry.host !== "string"
      || typeof entry.label !== "string"
      || !Number.isInteger(entry.port)
    ) {
      pushBlocker(blockers, "LISTENER_INVENTORY_INVALID");
      listenerSummary.ok = false;
      continue;
    }

    if (!isExternalListenerHost(entry.host)) continue;
    listenerSummary.external_listener_count += 1;

    const isAllowedPreviewApp = previewAppPort !== null
      && entry.port === previewAppPort
      && !FORBIDDEN_EXTERNAL_LISTENER_PATTERN.test(entry.label);
    if (isAllowedPreviewApp) {
      listenerSummary.allowed_external_listener_count += 1;
      listenerSummary.allowed_external_listeners.push(entry);
      continue;
    }

    if (
      protectedPorts.includes(entry.port)
      || FORBIDDEN_EXTERNAL_LISTENER_PATTERN.test(entry.label)
    ) {
      listenerSummary.forbidden_external_listener_count += 1;
      listenerSummary.forbidden_external_listeners.push(entry);
      listenerSummary.ok = false;
      pushBlocker(blockers, "SUPABASE_EXTERNAL_LISTENER_FORBIDDEN");
      continue;
    }

    listenerSummary.unrelated_external_listener_count += 1;
    listenerSummary.unrelated_external_listeners.push(entry);
  }
}

/**
 * @param {{
 *   env?: PreviewEnv,
 *   listenerInventory?: ListenerEntry[] | null,
 *   now?: Date,
 * }} [options]
 */
export function collectMarketingValidationPreviewPreflight({
  env = process.env,
  listenerInventory = null,
  now = new Date(),
} = {}) {
  const normalizedEnv = normalizePreviewEnv(env);
  const contract = evaluateMarketingPreviewContract({
    env: normalizedEnv,
    now,
    reservedComposeProjects: RESERVED_FULL_LOCAL_COMPOSE_PROJECTS,
    reservedPorts: RESERVED_PORTS,
    reservedVolumes: RESERVED_FULL_LOCAL_VOLUMES,
  });

  const blockers = [];
  for (const error of contract.errors) {
    mapContractErrorToBlockers(blockers, error);
  }

  const previewOriginUrl = parseOrigin(
    readEnvValue(normalizedEnv, "HOMECOOK_MARKETING_PREVIEW_ORIGIN"),
  );
  if (previewOriginUrl && isReservedOrigin(previewOriginUrl.origin)) {
    pushBlocker(blockers, "PREVIEW_ORIGIN_PRODUCTION_FORBIDDEN");
  }

  if (readEnvValue(env, "HOMECOOK_DATA_AUTHORITY") !== "local") {
    pushBlocker(blockers, "SUPABASE_DATA_AUTHORITY_NOT_LOCAL");
  }
  if (readEnvValue(env, "HOMECOOK_AUTH_AUTHORITY") !== "local") {
    pushBlocker(blockers, "SUPABASE_AUTH_AUTHORITY_NOT_LOCAL");
  }

  const checkedSupabaseUrlKeys = [];
  for (const key of SUPABASE_LOOPBACK_URL_KEYS) {
    const value = readEnvValue(env, key);
    if (!value) continue;
    checkedSupabaseUrlKeys.push(key);
    try {
      assertExactLoopbackHttpOrigin(value, { label: key });
    } catch {
      pushBlocker(blockers, "SUPABASE_URL_NOT_LOOPBACK");
    }
  }

  const edgeEvidence = readEnvValue(env, "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE")
    || readEnvValue(env, "MARKETING_EDGE_RULE_EVIDENCE");
  const edgeEvidenceValid = isValidMarketingEdgeEvidence(edgeEvidence);
  const leadGateEnabled = readEnvValue(env, "MARKETING_LEAD_PROTECTION_READY") === "1";

  const previewAppPort = parsePort(
    readEnvValue(normalizedEnv, "HOMECOOK_PREVIEW_APP_PORT"),
  );
  const protectedPorts = [
    ...RESERVED_SUPABASE_PORTS,
    parsePort(readEnvValue(normalizedEnv, "HOMECOOK_PREVIEW_SUPABASE_API_PORT")),
    parsePort(readEnvValue(normalizedEnv, "HOMECOOK_PREVIEW_SUPABASE_DB_PORT")),
    parsePort(readEnvValue(normalizedEnv, "HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT")),
  ].filter((port) => port !== null);
  const summary = {
    schema: "homecook.marketing-validation-preview-preflight",
    version: 1,
    ready: false,
    blockers,
    checks: {
      preview_origin: {
        ok: previewOriginUrl !== null && !isReservedOrigin(previewOriginUrl.origin),
        value: previewOriginUrl?.origin ?? null,
        hostname: previewOriginUrl?.hostname ?? null,
      },
      contract: {
        ok: contract.ok,
        error_count: contract.errors.length,
      },
      allowed_origins: {
        ok: !blockers.includes("ALLOWED_ORIGINS_MISSING")
          && !blockers.includes("ALLOWED_ORIGINS_INVALID")
          && !blockers.includes("ALLOWED_ORIGINS_INCLUDE_PRODUCTION")
          && !blockers.includes("PREVIEW_ORIGIN_NOT_ALLOWLISTED"),
        count: contract.allowedOrigins.length,
        includes_preview_origin: previewOriginUrl !== null
          && contract.allowedOrigins.includes(previewOriginUrl.origin),
        includes_production_origin: contract.allowedOrigins.some((origin) => (
          isReservedOrigin(origin)
        )),
      },
      paid_attribution_origins: {
        ok: !blockers.includes("PAID_ATTRIBUTION_ORIGINS_MISSING")
          && !blockers.includes("PAID_ATTRIBUTION_ORIGINS_INVALID")
          && !blockers.includes("PAID_ATTRIBUTION_ORIGINS_INCLUDE_PRODUCTION")
          && !blockers.includes("PREVIEW_ORIGIN_NOT_PAID_ALLOWLISTED"),
        count: contract.paidOrigins.length,
        includes_preview_origin: previewOriginUrl !== null
          && contract.paidOrigins.includes(previewOriginUrl.origin),
      },
      campaign_window: {
        ok: !blockers.includes("CAMPAIGN_END_MISSING")
          && !blockers.includes("CAMPAIGN_END_INVALID")
          && !blockers.includes("CAMPAIGN_CLOSED"),
      },
      lead_gate: {
        enabled: leadGateEnabled,
        ok: contract.leadGateOpen && !blockers.includes("LEAD_GATE_EDGE_EVIDENCE_MISSING"),
        secret_configured: readEnvValue(env, "MARKETING_TURNSTILE_SECRET").length > 0,
        site_key_configured: readEnvValue(env, "NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY").length > 0,
        turnstile_hostnames_configured: contract.turnstileAllowedHostnames.length > 0,
        preview_hostname_covered: previewOriginUrl !== null
          && contract.turnstileAllowedHostnames.includes(
            previewOriginUrl.hostname.toLowerCase().replace(/\.+$/u, ""),
          ),
        edge_evidence_configured: edgeEvidenceValid,
        approved_action: readEnvValue(normalizedEnv, "MARKETING_TURNSTILE_ACTION")
          === PREVIEW_TURNSTILE_ACTION,
      },
      supabase: {
        ok: !blockers.includes("SUPABASE_DATA_AUTHORITY_NOT_LOCAL")
          && !blockers.includes("SUPABASE_AUTH_AUTHORITY_NOT_LOCAL")
          && !blockers.includes("SUPABASE_URL_NOT_LOOPBACK")
          && !blockers.includes("SUPABASE_URL_INVALID")
          && !blockers.includes("DATA_SUPABASE_URL_MISSING")
          && !blockers.includes("DATA_SUPABASE_PUBLISHABLE_KEY_MISSING")
          && !blockers.includes("DATA_SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER")
          && !blockers.includes("DATA_SUPABASE_SECRET_KEY_MISSING")
          && !blockers.includes("DATA_SUPABASE_SECRET_KEY_PLACEHOLDER"),
        authority_local: readEnvValue(env, "HOMECOOK_DATA_AUTHORITY") === "local"
          && readEnvValue(env, "HOMECOOK_AUTH_AUTHORITY") === "local",
        url_keys: checkedSupabaseUrlKeys,
      },
      namespace: {
        ok: !blockers.includes("PREVIEW_NAMESPACE_MISSING")
          && !blockers.includes("PREVIEW_NAMESPACE_RESERVED")
          && !blockers.includes("COMPOSE_PROJECT_MISSING")
          && !blockers.includes("COMPOSE_PROJECT_COLLISION")
          && !blockers.includes("POSTGRES_VOLUME_MISSING")
          && !blockers.includes("POSTGRES_VOLUME_COLLISION")
          && !blockers.includes("STORAGE_VOLUME_MISSING")
          && !blockers.includes("STORAGE_VOLUME_COLLISION")
          && !blockers.includes("APP_PORT_MISSING")
          && !blockers.includes("APP_PORT_INVALID")
          && !blockers.includes("APP_PORT_RESERVED")
          && !blockers.includes("SUPABASE_API_PORT_MISSING")
          && !blockers.includes("SUPABASE_API_PORT_INVALID")
          && !blockers.includes("SUPABASE_API_PORT_RESERVED")
          && !blockers.includes("SUPABASE_DB_PORT_MISSING")
          && !blockers.includes("SUPABASE_DB_PORT_INVALID")
          && !blockers.includes("SUPABASE_DB_PORT_RESERVED")
          && !blockers.includes("SUPABASE_STUDIO_PORT_MISSING")
          && !blockers.includes("SUPABASE_STUDIO_PORT_INVALID")
          && !blockers.includes("SUPABASE_STUDIO_PORT_RESERVED")
          && !blockers.includes("PREVIEW_PORTS_NOT_UNIQUE"),
      },
      listener_inventory: {
        provided: false,
        ok: false,
        manual_verification_required: true,
        external_listener_count: 0,
        allowed_external_listener_count: 0,
        forbidden_external_listener_count: 0,
        unrelated_external_listener_count: 0,
        allowed_external_listeners: [],
        forbidden_external_listeners: [],
        unrelated_external_listeners: [],
      },
      redacted_env: redactPreviewSecrets(contract.redactedEnv),
    },
  };

  evaluateListenerInventory({
    blockers,
    listenerInventory,
    previewAppPort,
    protectedPorts,
    summary,
  });

  summary.ready = blockers.length === 0;
  return summary;
}

/**
 * @param {{
 *   argv?: string[],
 *   env?: PreviewEnv,
 *   listenerInventory?: ListenerEntry[] | null,
 *   now?: Date,
 *   stdout?: (chunk: string) => void,
 *   stderr?: (chunk: string) => void,
 *   exit?: (code: number) => never,
 * }} [options]
 */
export function runMarketingValidationPreviewPreflightCli({
  argv = process.argv.slice(2),
  env = process.env,
  listenerInventory = undefined,
  now = new Date(),
  stdout = (chunk) => process.stdout.write(chunk),
  stderr = (chunk) => process.stderr.write(chunk),
  exit = (code) => process.exit(code),
} = {}) {
  if (argv.some((token) => token !== "--json")) {
    stderr("marketing-validation-preview-preflight: FAIL (redacted)\n");
    exit(1);
    return null;
  }

  const resolvedListenerInventory = listenerInventory === undefined
    ? readListenerInventoryFromLsof()
    : listenerInventory;
  const summary = collectMarketingValidationPreviewPreflight({
    env,
    listenerInventory: resolvedListenerInventory,
    now,
  });
  stdout(`${JSON.stringify(summary)}\n`);
  if (!summary.ready) {
    stderr("marketing-validation-preview-preflight: FAIL (redacted)\n");
    exit(1);
  }
  return summary;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runMarketingValidationPreviewPreflightCli();
}
