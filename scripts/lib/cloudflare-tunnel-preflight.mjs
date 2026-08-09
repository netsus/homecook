import { createHash } from "node:crypto";
import { isIP } from "node:net";

const VERSION_PATTERN = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const CHECK_NAMES = Object.freeze([
  "snapshot",
  "management_mode",
  "token_path_mode",
  "config",
  "dns",
  "udp_7844",
  "tcp_7844",
  "management_api_https",
  "update_gate",
]);
const SNAPSHOT_KEYS = Object.freeze([
  "binary_path_hash",
  "binary_version",
  "binary_sha256",
  "plist_sha256",
  "arguments_sha256",
  "token_file_path_hash",
  "token_file_mode",
  "launchd_state",
  "tunnel_state",
  "stable_metadata_sha256",
]);

function findFlagValue(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      return typeof args[index + 1] === "string" ? args[index + 1] : null;
    }
    if (args[index]?.startsWith(`${flag}=`)) {
      return args[index].slice(flag.length + 1) || null;
    }
  }
  return null;
}

function hasFlag(args, flag) {
  return args.some((argument) => argument === flag || argument.startsWith(`${flag}=`));
}

export function classifyManagementMode(
  args,
  { config_exists: configExists = false, local_ingress_config: localIngressConfig = false } = {},
) {
  const normalizedArgs = Array.isArray(args) ? args.filter((item) => typeof item === "string") : [];
  if (hasFlag(normalizedArgs, "--token-file") || hasFlag(normalizedArgs, "--token")) {
    return { mode: "remotely-managed", success: true, config_required: false };
  }
  if (hasFlag(normalizedArgs, "--config")) {
    return {
      mode: "locally-managed",
      success: configExists === true && localIngressConfig === true,
      config_required: true,
    };
  }
  return { mode: "unknown", success: false, config_required: false };
}

export function extractManagedPaths(args) {
  const normalizedArgs = Array.isArray(args) ? args : [];
  return {
    token_file: findFlagValue(normalizedArgs, "--token-file"),
    config: findFlagValue(normalizedArgs, "--config"),
    inline_token_present: hasFlag(normalizedArgs, "--token"),
  };
}

export function redactArguments(args) {
  const normalizedArgs = Array.isArray(args) ? args : [];
  const redacted = [];
  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = String(normalizedArgs[index]);
    if (argument === "--token") {
      redacted.push(argument, "[redacted-token]");
      index += 1;
      continue;
    }
    if (argument.startsWith("--token=")) {
      redacted.push("--token=[redacted-token]");
      continue;
    }
    if (argument === "--token-file" || argument === "--config") {
      redacted.push(argument, "[redacted-path]");
      index += 1;
      continue;
    }
    if (argument.startsWith("--token-file=")) {
      redacted.push("--token-file=[redacted-path]");
      continue;
    }
    if (argument.startsWith("--config=")) {
      redacted.push("--config=[redacted-path]");
      continue;
    }
    redacted.push(argument.startsWith("/") ? "[redacted-path]" : argument);
  }
  return redacted;
}

export function parseDnsOutput(raw) {
  const addresses = String(raw ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => isIP(line) !== 0);
  return { success: addresses.length > 0, address_count: addresses.length };
}

function parseVersion(value) {
  const match = typeof value === "string" ? value.match(VERSION_PATTERN) : null;
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * @param {string | null} currentVersion
 * @param {{ version?: string, verified_at?: string, platform?: string } | null} metadata
 * @param {string} platform
 * @param {string | null} [capturedAt]
 */
export function evaluateReleaseGate(currentVersion, metadata, platform, capturedAt = null) {
  const current = parseVersion(currentVersion);
  const stable = parseVersion(metadata?.version);
  const verifiedAt = Date.parse(metadata?.verified_at ?? "");
  if (
    current === null
    || stable === null
    || !Number.isFinite(verifiedAt)
    || typeof platform !== "string"
    || metadata?.platform !== platform
  ) {
    return { success: false, error: "UNKNOWN" };
  }
  if (capturedAt !== null) {
    const capturedAtMs = Date.parse(capturedAt);
    const metadataAgeMs = capturedAtMs - verifiedAt;
    if (
      !Number.isFinite(capturedAtMs)
      || metadataAgeMs < -5 * 60 * 1_000
      || metadataAgeMs > 24 * 60 * 60 * 1_000
    ) {
      return { success: false, error: "STALE_METADATA" };
    }
  }
  const comparison = compareVersions(current, stable);
  if (comparison < 0) {
    return { success: false, error: "OUTDATED" };
  }
  if (comparison > 0) {
    return { success: false, error: "UNSUPPORTED" };
  }
  return { success: true, error: null };
}

export function hashEvidenceValue(value) {
  return `sha256:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
}

function normalizeError(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value)
    ? value
    : value === null || value === undefined
      ? null
      : "CHECK_FAILED";
}

function normalizeLatency(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) / 1_000 : null;
}

function normalizeCheck(value = {}) {
  return {
    attempted: value.attempted === true,
    success: value.success === true,
    latency_ms: normalizeLatency(value.latency_ms),
    error: normalizeError(value.error),
  };
}

function snapshotComplete(snapshot, { tokenRequired }) {
  return snapshot?.complete === true
    && SHA256_PATTERN.test(snapshot.binary_path_hash ?? "")
    && VERSION_PATTERN.test(snapshot.binary_version ?? "")
    && SHA256_PATTERN.test(snapshot.binary_sha256 ?? "")
    && SHA256_PATTERN.test(snapshot.plist_sha256 ?? "")
    && SHA256_PATTERN.test(snapshot.arguments_sha256 ?? "")
    && (!tokenRequired || (
      SHA256_PATTERN.test(snapshot.token_file_path_hash ?? "")
      && typeof snapshot.token_file_mode === "string"
    ))
    && typeof snapshot.launchd_state === "string"
    && typeof snapshot.tunnel_state === "string";
}

function projectSnapshot(snapshot) {
  return Object.fromEntries(SNAPSHOT_KEYS.map((key) => {
    const value = snapshot?.[key];
    return [key, typeof value === "string" ? value : null];
  }));
}

export function buildPreflightEvidence({
  timestamp,
  platform,
  management_mode: managementMode,
  management_mode_success: managementModeSuccess,
  snapshot,
  token_path_mode_safe: tokenPathModeSafe,
  checks: suppliedChecks = {},
}) {
  const tokenRequired = managementMode === "remotely-managed";
  const isSnapshotComplete = snapshotComplete(snapshot, { tokenRequired });
  const configCheck = normalizeCheck(suppliedChecks.config);
  const checks = {
    snapshot: normalizeCheck({
      attempted: true,
      success: isSnapshotComplete,
      latency_ms: 0,
      error: isSnapshotComplete ? null : "SNAPSHOT_INCOMPLETE",
    }),
    management_mode: normalizeCheck({
      attempted: true,
      success: managementModeSuccess,
      latency_ms: 0,
      error: managementModeSuccess ? null : "MANAGEMENT_MODE_UNKNOWN",
    }),
    token_path_mode: normalizeCheck({
      attempted: tokenRequired,
      success: tokenRequired ? tokenPathModeSafe : true,
      latency_ms: tokenRequired ? 0 : null,
      error: tokenRequired && !tokenPathModeSafe ? "TOKEN_PATH_MODE_UNSAFE" : null,
    }),
    config: configCheck,
    dns: normalizeCheck(suppliedChecks.dns),
    udp_7844: normalizeCheck(suppliedChecks.udp_7844),
    tcp_7844: normalizeCheck(suppliedChecks.tcp_7844),
    management_api_https: normalizeCheck(suppliedChecks.management_api_https),
    update_gate: normalizeCheck(suppliedChecks.update_gate),
  };
  const configApplicable = managementMode === "locally-managed";
  const allChecksPass = CHECK_NAMES.every((name) => {
    const check = checks[name];
    if (name === "config" && !configApplicable) {
      return check.success && !check.attempted;
    }
    if (name === "token_path_mode" && !tokenRequired) {
      return check.success && !check.attempted;
    }
    return check.success && check.attempted;
  });
  const normalizedTimestamp = new Date(timestamp).toISOString();
  return {
    schema: "homecook.cloudflare-tunnel-preflight",
    version: 1,
    timestamp: normalizedTimestamp,
    platform: typeof platform === "string" ? platform : "unknown",
    success: allChecksPass
      && snapshot?.launchd_state === "running"
      && snapshot?.tunnel_state === "running",
    management_mode: ["remotely-managed", "locally-managed"].includes(managementMode)
      ? managementMode
      : "unknown",
    snapshot: projectSnapshot(snapshot),
    checks,
  };
}
