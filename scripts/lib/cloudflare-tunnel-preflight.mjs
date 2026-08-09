import { createHash } from "node:crypto";
import { isIP } from "node:net";

const VERSION_COMPONENT = "(?:0|[1-9][0-9]{0,8})";
const VERSION_PATTERN = new RegExp(`^(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})$`, "u");
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const CHECK_NAMES = Object.freeze([
  "snapshot", "management_mode", "token_path_mode", "config",
  "tunnel_connections", "dns", "udp_7844", "tcp_7844",
  "management_api_https", "update_gate",
]);

export const CLOUDFLARE_TUNNEL_ENDPOINTS = Object.freeze({
  "region1.v2.argotunnel.com": Object.freeze({
    ipv4: Object.freeze([
      "198.41.192.167", "198.41.192.67", "198.41.192.57", "198.41.192.107",
      "198.41.192.27", "198.41.192.7", "198.41.192.227", "198.41.192.47",
      "198.41.192.37", "198.41.192.77",
    ]),
    ipv6: Object.freeze(Array.from({ length: 10 }, (_, index) => `2606:4700:a0::${index + 1}`)),
  }),
  "region2.v2.argotunnel.com": Object.freeze({
    ipv4: Object.freeze([
      "198.41.200.13", "198.41.200.193", "198.41.200.33", "198.41.200.233",
      "198.41.200.53", "198.41.200.63", "198.41.200.113", "198.41.200.73",
      "198.41.200.43", "198.41.200.23",
    ]),
    ipv6: Object.freeze(Array.from({ length: 10 }, (_, index) => `2606:4700:a8::${index + 1}`)),
  }),
});

function findFlagValue(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) return typeof args[index + 1] === "string" ? args[index + 1] : null;
    if (args[index]?.startsWith(`${flag}=`)) return args[index].slice(flag.length + 1) || null;
  }
  return null;
}

function hasFlag(args, flag) {
  return args.some((argument) => argument === flag || argument.startsWith(`${flag}=`));
}

export function classifyManagementMode(args, {
  config_exists: configExists = false,
  local_ingress_config: localIngressConfig = false,
} = {}) {
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
    metrics: findFlagValue(normalizedArgs, "--metrics"),
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
    } else if (argument.startsWith("--token=")) {
      redacted.push("--token=[redacted-token]");
    } else if (["--token-file", "--config", "--metrics"].includes(argument)) {
      redacted.push(argument, "[redacted-path]");
      index += 1;
    } else if (argument.startsWith("--token-file=")) {
      redacted.push("--token-file=[redacted-path]");
    } else if (argument.startsWith("--config=")) {
      redacted.push("--config=[redacted-path]");
    } else if (argument.startsWith("--metrics=")) {
      redacted.push("--metrics=[redacted-endpoint]");
    } else {
      redacted.push(argument.startsWith("/") ? "[redacted-path]"
        : containsSensitiveShape(argument) ? "[redacted-value]" : argument);
    }
  }
  return redacted;
}

export function parseDnsOutput(raw, { hostname, address_family: family } = {}) {
  const allowed = CLOUDFLARE_TUNNEL_ENDPOINTS[hostname]?.[family];
  const expectedIpVersion = family === "ipv4" ? 4 : family === "ipv6" ? 6 : 0;
  const addresses = !allowed ? [] : [...new Set(String(raw ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => isIP(line) === expectedIpVersion && allowed.includes(line)))];
  return { success: addresses.length > 0, address_count: addresses.length, addresses };
}

function parseVersion(value) {
  const match = typeof value === "string" ? value.match(VERSION_PATTERN) : null;
  if (!match) return null;
  const components = match.slice(1).map(Number);
  return components.every((component) => Number.isSafeInteger(component)) ? components : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
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
  if (!current || !stable || !Number.isFinite(verifiedAt)
    || typeof platform !== "string" || metadata?.platform !== platform) {
    return { success: false, error: "UNKNOWN" };
  }
  if (capturedAt !== null) {
    const capturedAtMs = Date.parse(capturedAt);
    const age = capturedAtMs - verifiedAt;
    if (!Number.isFinite(capturedAtMs) || age < -300_000 || age > 86_400_000) {
      return { success: false, error: "STALE_METADATA" };
    }
  }
  const comparison = compareVersions(current, stable);
  if (comparison < 0) return { success: false, error: "OUTDATED" };
  if (comparison > 0) return { success: false, error: "UNSUPPORTED" };
  return { success: true, error: null };
}

export function parseTunnelMetrics(raw) {
  const text = String(raw ?? "");
  const version = text.match(/^cloudflared_build_info\{[^\n}]*version="([^"]+)"[^\n}]*\}\s+1(?:\.0+)?$/mu)?.[1]
    ?? text.match(/^build_info\{[^\n}]*version="([^"]+)"[^\n}]*\}\s+1(?:\.0+)?$/mu)?.[1]
    ?? null;
  const connectionValue = text.match(/^cloudflared_tunnel_ha_connections(?:\{[^\n}]*\})?\s+([0-9]+)(?:\.0+)?$/mu)?.[1];
  const activeConnections = connectionValue && Number.isSafeInteger(Number(connectionValue))
    ? Number(connectionValue) : null;
  const connectionIds = new Set();
  const edgeLocations = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!/^cloudflared_tunnel_server_locations\{/u.test(line) || !/\}\s+1(?:\.0+)?$/u.test(line)) continue;
    const connectionId = line.match(/(?:\{|,)connection_id="([^"]+)"/u)?.[1];
    const edgeLocation = line.match(/(?:\{|,)edge_location="([^"]+)"/u)?.[1];
    if (connectionId && edgeLocation) {
      connectionIds.add(connectionId);
      edgeLocations.add(edgeLocation);
    }
  }
  const parsedVersion = parseVersion(version) ? version : null;
  const activeEdgeLocations = edgeLocations.size;
  return {
    success: parsedVersion !== null && activeConnections !== null
      && activeConnections >= 4 && connectionIds.size >= 4 && activeEdgeLocations >= 2,
    version: parsedVersion,
    active_connections: activeConnections,
    active_edge_locations: activeEdgeLocations,
  };
}

export function hashEvidenceValue(value) {
  return `sha256:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
}

function normalizeError(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value)
    ? value : value === null || value === undefined ? null : "CHECK_FAILED";
}

function normalizeLatency(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) / 1_000 : null;
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => ({
    hostname: typeof target?.hostname === "string" ? target.hostname : "unknown",
    address_family: ["ipv4", "ipv6", "n/a"].includes(target?.address_family)
      ? target.address_family : "n/a",
    protocol: ["dns", "quic", "tcp", "https", "metrics"].includes(target?.protocol)
      ? target.protocol : "unknown",
    port: Number.isInteger(target?.port) && target.port > 0 ? target.port : null,
    attempted: target?.attempted === true,
    success: target?.success === true,
    latency_ms: normalizeLatency(target?.latency_ms),
    error: normalizeError(target?.error),
  }));
}

function normalizeCheck(value = {}) {
  return {
    attempted: value.attempted === true,
    success: value.success === true,
    latency_ms: normalizeLatency(value.latency_ms),
    error: normalizeError(value.error),
    targets: normalizeTargets(value.targets),
  };
}

function projectBinary(value) {
  return {
    path: typeof value?.path === "string" ? sanitizeEvidencePath(value.path) : null,
    version: parseVersion(value?.version) ? value.version : null,
    sha256: SHA256_PATTERN.test(value?.sha256 ?? "") ? value.sha256 : null,
    mode: typeof value?.mode === "string" ? value.mode : null,
    arguments_redacted: Array.isArray(value?.arguments_redacted)
      ? value.arguments_redacted.map((item) => {
        const argument = String(item);
        return argument.startsWith("/") || containsSensitiveShape(argument)
          ? "[redacted-value]" : argument;
      }) : [],
  };
}

function containsSensitiveShape(value) {
  return /(?:token|config|secret|credential|cookie|jwt)/iu.test(value)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(value)
    || /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/u.test(value)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value);
}

function sanitizeEvidencePath(value) {
  if (!value.startsWith("/")) return null;
  return containsSensitiveShape(value) ? `[redacted]/${value.split("/").at(-1)}` : value;
}

function projectSnapshot(snapshot) {
  return {
    plist: {
      path_hash: SHA256_PATTERN.test(snapshot?.plist?.path_hash ?? "")
        ? snapshot.plist.path_hash : null,
      sha256: SHA256_PATTERN.test(snapshot?.plist?.sha256 ?? "") ? snapshot.plist.sha256 : null,
      mode: typeof snapshot?.plist?.mode === "string" ? snapshot.plist.mode : null,
    },
    candidate_binary: projectBinary(snapshot?.candidate_binary),
    running_binary: projectBinary(snapshot?.running_binary),
    token_file_path_hash: SHA256_PATTERN.test(snapshot?.token_file_path_hash ?? "")
      ? snapshot.token_file_path_hash : null,
    token_file_mode: typeof snapshot?.token_file_mode === "string" ? snapshot.token_file_mode : null,
    launchd_state: typeof snapshot?.launchd_state === "string" ? snapshot.launchd_state : "unavailable",
    tunnel_state: typeof snapshot?.tunnel_state === "string" ? snapshot.tunnel_state : "unavailable",
    tunnel: {
      required_connections: 4,
      active_connections: Number.isInteger(snapshot?.tunnel?.active_connections)
        ? snapshot.tunnel.active_connections : null,
      required_edge_locations: 2,
      active_edge_locations: Number.isInteger(snapshot?.tunnel?.active_edge_locations)
        ? snapshot.tunnel.active_edge_locations : null,
      replica_state: typeof snapshot?.tunnel?.replica_state === "string"
        ? snapshot.tunnel.replica_state : "unavailable",
    },
    stable_metadata_sha256: SHA256_PATTERN.test(snapshot?.stable_metadata_sha256 ?? "")
      ? snapshot.stable_metadata_sha256 : null,
  };
}

function snapshotComplete(snapshot, { tokenRequired }) {
  const candidate = snapshot?.candidate_binary;
  const running = snapshot?.running_binary;
  return snapshot?.complete === true
    && SHA256_PATTERN.test(snapshot?.plist?.sha256 ?? "")
    && SHA256_PATTERN.test(candidate?.sha256 ?? "")
    && SHA256_PATTERN.test(running?.sha256 ?? "")
    && parseVersion(candidate?.version) !== null
    && parseVersion(running?.version) !== null
    && typeof candidate?.path === "string" && typeof running?.path === "string"
    && (!tokenRequired || (SHA256_PATTERN.test(snapshot?.token_file_path_hash ?? "")
      && snapshot?.token_file_mode === "0600"))
    && snapshot?.launchd_state === "running"
    && snapshot?.tunnel_state === "connected"
    && snapshot?.tunnel?.active_connections >= 4
    && snapshot?.tunnel?.active_edge_locations >= 2;
}

export function buildPreflightEvidence({
  timestamp, platform, management_mode: managementMode,
  management_mode_success: managementModeSuccess, snapshot,
  token_path_mode_safe: tokenPathModeSafe, checks: suppliedChecks = {},
}) {
  const tokenRequired = managementMode === "remotely-managed";
  const isSnapshotComplete = snapshotComplete(snapshot, { tokenRequired });
  const checks = {
    snapshot: normalizeCheck({ attempted: true, success: isSnapshotComplete, latency_ms: 0,
      error: isSnapshotComplete ? null : "SNAPSHOT_INCOMPLETE" }),
    management_mode: normalizeCheck({ attempted: true, success: managementModeSuccess,
      latency_ms: 0, error: managementModeSuccess ? null : "MANAGEMENT_MODE_UNKNOWN" }),
    token_path_mode: normalizeCheck({ attempted: tokenRequired,
      success: tokenRequired ? tokenPathModeSafe : true,
      latency_ms: tokenRequired ? 0 : null,
      error: tokenRequired && !tokenPathModeSafe ? "TOKEN_PATH_MODE_UNSAFE" : null }),
    config: normalizeCheck(suppliedChecks.config),
    tunnel_connections: normalizeCheck(suppliedChecks.tunnel_connections),
    dns: normalizeCheck(suppliedChecks.dns),
    udp_7844: normalizeCheck(suppliedChecks.udp_7844),
    tcp_7844: normalizeCheck(suppliedChecks.tcp_7844),
    management_api_https: normalizeCheck(suppliedChecks.management_api_https),
    update_gate: normalizeCheck(suppliedChecks.update_gate),
  };
  const allChecksPass = CHECK_NAMES.every((name) => {
    const check = checks[name];
    if (name === "config" && managementMode !== "locally-managed") return check.success && !check.attempted;
    if (name === "token_path_mode" && !tokenRequired) return check.success && !check.attempted;
    return check.success && check.attempted;
  });
  return {
    schema: "homecook.cloudflare-tunnel-preflight",
    version: 1,
    timestamp: new Date(timestamp).toISOString(),
    platform: typeof platform === "string" ? platform : "unknown",
    success: allChecksPass,
    management_mode: ["remotely-managed", "locally-managed"].includes(managementMode)
      ? managementMode : "unknown",
    snapshot: projectSnapshot(snapshot),
    checks,
  };
}
