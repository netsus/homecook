import { createHash } from "node:crypto";
import { isIP } from "node:net";

const VERSION_COMPONENT = "(?:0|[1-9][0-9]{0,8})";
const VERSION_PATTERN = new RegExp(`^(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})\\.(${VERSION_COMPONENT})$`, "u");
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MODE_PATTERN = /^[0-7]{4}$/u;
const PLATFORM_PATTERN = /^(?:darwin|linux)-(?:arm64|x64)$/u;
const CHECK_NAMES = Object.freeze([
  "snapshot", "management_mode", "token_path_mode", "config",
  "tunnel_connections", "dns", "udp_7844", "tcp_7844",
  "management_api_https", "update_gate",
]);
const SENSITIVE_FLAGS = Object.freeze(["--token-file", "--token", "--config", "--metrics"]);
const CHECK_ERROR_CODES = Object.freeze({
  snapshot: new Set(["SNAPSHOT_INCOMPLETE"]),
  management_mode: new Set(["MANAGEMENT_MODE_UNKNOWN"]),
  token_path_mode: new Set(["TOKEN_PATH_MODE_UNSAFE"]),
  config: new Set(["CONFIG_MISSING", "CONFIG_VALIDATOR_UNAVAILABLE"]),
  tunnel_connections: new Set(["CONNECTION_STATE_UNAVAILABLE"]),
  dns: new Set(["TIMEOUT", "OUTPUT_LIMIT", "COMMAND_MISSING", "MALFORMED_OUTPUT"]),
  udp_7844: new Set(["QUIC_PROBE_UNAVAILABLE", "QUIC_PROBE_FAILED", "QUIC_TARGET_MISMATCH"]),
  tcp_7844: new Set(["TIMEOUT", "OUTPUT_LIMIT", "COMMAND_MISSING", "DNS_REQUIRED"]),
  management_api_https: new Set(["TIMEOUT", "OUTPUT_LIMIT", "COMMAND_MISSING"]),
  update_gate: new Set(["UNKNOWN", "STALE_METADATA", "OUTDATED", "UNSUPPORTED"]),
});

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

export function parseCloudflaredArguments(args) {
  if (!Array.isArray(args) || !args.every((argument) => typeof argument === "string")) {
    return { success: false, mode: "unknown", token_file: null, token: null,
      config: null, metrics: null, inline_token_present: false };
  }
  const values = Object.fromEntries(SENSITIVE_FLAGS.map((flag) => [flag, []]));
  let malformed = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const exactFlag = SENSITIVE_FLAGS.find((flag) => argument === flag);
    const equalsFlag = SENSITIVE_FLAGS.find((flag) => argument.startsWith(`${flag}=`));
    if (exactFlag) {
      const value = args[index + 1];
      if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
        malformed = true;
      } else {
        values[exactFlag].push(value);
        index += 1;
      }
    } else if (equalsFlag) {
      const value = argument.slice(equalsFlag.length + 1);
      if (value.length === 0) malformed = true;
      else values[equalsFlag].push(value);
    }
  }
  if (SENSITIVE_FLAGS.some((flag) => values[flag].length > 1)) malformed = true;
  const tokenFile = values["--token-file"][0] ?? null;
  const token = values["--token"][0] ?? null;
  const config = values["--config"][0] ?? null;
  const metrics = values["--metrics"][0] ?? null;
  if (tokenFile !== null && !tokenFile.startsWith("/")) malformed = true;
  if (config !== null && !config.startsWith("/")) malformed = true;
  if (metrics !== null && !/^127\.0\.0\.1:2024[1-5]$/u.test(metrics)) malformed = true;
  const managementCount = Number(tokenFile !== null) + Number(token !== null) + Number(config !== null);
  if (managementCount > 1) malformed = true;
  const mode = malformed ? "unknown" : tokenFile !== null || token !== null
    ? "remotely-managed" : config !== null ? "locally-managed" : "unknown";
  return {
    success: !malformed,
    mode,
    token_file: tokenFile,
    token,
    config,
    metrics,
    inline_token_present: token !== null,
  };
}

export function classifyManagementMode(args, {
  config_exists: configExists = false,
  local_ingress_config: localIngressConfig = false,
} = {}) {
  const parsed = parseCloudflaredArguments(args);
  if (!parsed.success) return { mode: "unknown", success: false, config_required: false };
  if (parsed.mode === "remotely-managed") {
    return { mode: "remotely-managed", success: true, config_required: false };
  }
  if (parsed.mode === "locally-managed") {
    return {
      mode: "locally-managed",
      success: configExists === true && localIngressConfig === true,
      config_required: true,
    };
  }
  return { mode: "unknown", success: false, config_required: false };
}

export function extractManagedPaths(args) {
  const parsed = parseCloudflaredArguments(args);
  return {
    token_file: parsed.success ? parsed.token_file : null,
    config: parsed.success ? parsed.config : null,
    metrics: parsed.success ? parsed.metrics : null,
    inline_token_present: parsed.inline_token_present,
    success: parsed.success,
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

export function isCanonicalCloudflaredVersion(value) {
  return parseVersion(value) !== null;
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
  const buildSamples = [];
  const connectionSamples = [];
  let buildMetricLines = 0;
  let connectionMetricLines = 0;
  const connectionLocations = new Map();
  const edgeLocations = new Set();
  let serverSamplesValid = true;
  for (const line of text.split(/\r?\n/u)) {
    if (/^(?:cloudflared_)?build_info(?:\{|\s)/u.test(line)) {
      buildMetricLines += 1;
      const build = line.match(/^(?:cloudflared_)?build_info\{[^}]*version="([^"]+)"[^}]*\}\s+1(?:\.0+)?$/u);
      if (build) buildSamples.push(build[1]);
    }
    if (/^cloudflared_tunnel_ha_connections(?:\{|\s)/u.test(line)) {
      connectionMetricLines += 1;
      const connection = line.match(/^cloudflared_tunnel_ha_connections(?:\{[^}]*\})?\s+([0-9]+)(?:\.0+)?$/u);
      if (connection) connectionSamples.push(connection[1]);
    }
    if (!/^cloudflared_tunnel_server_locations\{/u.test(line)) continue;
    if (!/\}\s+1(?:\.0+)?$/u.test(line)) {
      serverSamplesValid = false;
      continue;
    }
    const connectionId = line.match(/(?:\{|,)connection_id="([^"]+)"/u)?.[1];
    const edgeLocation = line.match(/(?:\{|,)edge_location="([^"]+)"/u)?.[1];
    if (!connectionId || !edgeLocation || connectionLocations.has(connectionId)) {
      serverSamplesValid = false;
      continue;
    }
    connectionLocations.set(connectionId, edgeLocation);
    edgeLocations.add(edgeLocation);
  }
  const version = buildSamples.length === 1 ? buildSamples[0] : null;
  const connectionValue = connectionSamples.length === 1 ? connectionSamples[0] : null;
  const activeConnections = connectionValue && Number.isSafeInteger(Number(connectionValue))
    ? Number(connectionValue) : null;
  const parsedVersion = parseVersion(version) ? version : null;
  const activeEdgeLocations = edgeLocations.size;
  const activeConnectionIds = connectionLocations.size;
  const connectionIdsConsistent = activeConnections !== null
    && serverSamplesValid
    && activeConnectionIds === activeConnections;
  const samplesValid = buildMetricLines === 1
    && buildSamples.length === 1
    && connectionMetricLines === 1
    && connectionSamples.length === 1
    && serverSamplesValid;
  return {
    success: samplesValid && parsedVersion !== null && activeConnections !== null
      && activeConnections === 4 && connectionIdsConsistent && activeEdgeLocations >= 2,
    version: parsedVersion,
    active_connections: activeConnections,
    active_edge_locations: activeEdgeLocations,
    active_connection_ids: activeConnectionIds,
    connection_ids_consistent: connectionIdsConsistent,
    samples_valid: samplesValid,
  };
}

export function hashEvidenceValue(value) {
  return `sha256:${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
}

function normalizeError(value, checkName, { present, success }) {
  if (!present) return "CHECK_FAILED";
  if (success) return value === null ? null : "CHECK_FAILED";
  return CHECK_ERROR_CODES[checkName]?.has(value) ? value : "CHECK_FAILED";
}

function normalizeLatency(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) / 1_000 : null;
}

function normalizeTargets(targets, checkName) {
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => {
    const declaredSuccess = target?.success === true;
    const error = normalizeError(target?.error, checkName, {
      present: target !== null && typeof target === "object" && Object.hasOwn(target, "error"),
      success: declaredSuccess,
    });
    return {
      hostname: [
        ...Object.keys(CLOUDFLARE_TUNNEL_ENDPOINTS),
        "api.cloudflare.com",
        "loopback",
      ].includes(target?.hostname) ? target.hostname : "unknown",
      address_family: ["ipv4", "ipv6", "n/a"].includes(target?.address_family)
        ? target.address_family : "n/a",
      protocol: ["dns", "quic", "tcp", "https", "metrics"].includes(target?.protocol)
        ? target.protocol : "unknown",
      port: Number.isInteger(target?.port) && target.port > 0 ? target.port : null,
      attempted: target?.attempted === true,
      success: declaredSuccess && error === null,
      latency_ms: normalizeLatency(target?.latency_ms),
      error,
    };
  });
}

function normalizeCheck(value = {}, checkName) {
  const declaredSuccess = value?.success === true;
  const targets = normalizeTargets(value?.targets, checkName);
  let error = normalizeError(value?.error, checkName, {
    present: value !== null && typeof value === "object" && Object.hasOwn(value, "error"),
    success: declaredSuccess,
  });
  if (declaredSuccess && targets.some((target) => !target.success)) error = "CHECK_FAILED";
  return {
    attempted: value.attempted === true,
    success: declaredSuccess && error === null,
    latency_ms: normalizeLatency(value.latency_ms),
    error,
    targets,
  };
}

function projectBinary(value) {
  return {
    path_hash: SHA256_PATTERN.test(value?.path_hash ?? "") ? value.path_hash : null,
    version: parseVersion(value?.version) ? value.version : null,
    sha256: SHA256_PATTERN.test(value?.sha256 ?? "") ? value.sha256 : null,
    mode: MODE_PATTERN.test(value?.mode ?? "") ? value.mode : null,
    arguments_sha256: SHA256_PATTERN.test(value?.arguments_sha256 ?? "")
      ? value.arguments_sha256 : null,
  };
}

function containsRawIp(value) {
  const candidates = String(value).split(/[\s/,[\]()=]+/u).flatMap((part) => {
    const bracketless = part.replace(/^\[|\]$/gu, "");
    const ipv4WithPort = bracketless.match(/^((?:[0-9]{1,3}\.){3}[0-9]{1,3}):[0-9]+$/u)?.[1];
    return ipv4WithPort ? [bracketless, ipv4WithPort] : [bracketless];
  });
  return candidates.some((candidate) => isIP(candidate) !== 0);
}

function containsSensitiveShape(value) {
  return /(?:token|config|secret|credential|cookie|jwt)/iu.test(value)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(value)
    || containsRawIp(value)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value);
}

function projectSnapshot(snapshot) {
  return {
    plist: {
      path_hash: SHA256_PATTERN.test(snapshot?.plist?.path_hash ?? "")
        ? snapshot.plist.path_hash : null,
      sha256: SHA256_PATTERN.test(snapshot?.plist?.sha256 ?? "") ? snapshot.plist.sha256 : null,
      mode: MODE_PATTERN.test(snapshot?.plist?.mode ?? "") ? snapshot.plist.mode : null,
    },
    candidate_binary: projectBinary(snapshot?.candidate_binary),
    running_binary: projectBinary(snapshot?.running_binary),
    token_file_path_hash: SHA256_PATTERN.test(snapshot?.token_file_path_hash ?? "")
      ? snapshot.token_file_path_hash : null,
    token_file_mode: MODE_PATTERN.test(snapshot?.token_file_mode ?? "")
      ? snapshot.token_file_mode : null,
    launchd_state: snapshot?.launchd_state === "running" ? "running" : "unavailable",
    tunnel_state: snapshot?.tunnel_state === "connected" ? "connected" : "unavailable",
    tunnel: {
      required_connections: 4,
      active_connections: Number.isInteger(snapshot?.tunnel?.active_connections)
        ? snapshot.tunnel.active_connections : null,
      required_edge_locations: 2,
      active_edge_locations: Number.isInteger(snapshot?.tunnel?.active_edge_locations)
        ? snapshot.tunnel.active_edge_locations : null,
      replica_state: snapshot?.tunnel?.replica_state === "healthy" ? "healthy" : "unavailable",
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
    && SHA256_PATTERN.test(candidate?.path_hash ?? "")
    && SHA256_PATTERN.test(running?.path_hash ?? "")
    && SHA256_PATTERN.test(candidate?.arguments_sha256 ?? "")
    && SHA256_PATTERN.test(running?.arguments_sha256 ?? "")
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
      error: isSnapshotComplete ? null : "SNAPSHOT_INCOMPLETE" }, "snapshot"),
    management_mode: normalizeCheck({ attempted: true, success: managementModeSuccess,
      latency_ms: 0, error: managementModeSuccess ? null : "MANAGEMENT_MODE_UNKNOWN" }, "management_mode"),
    token_path_mode: normalizeCheck({ attempted: tokenRequired,
      success: tokenRequired ? tokenPathModeSafe : true,
      latency_ms: tokenRequired ? 0 : null,
      error: tokenRequired && !tokenPathModeSafe ? "TOKEN_PATH_MODE_UNSAFE" : null }, "token_path_mode"),
    config: normalizeCheck(suppliedChecks.config, "config"),
    tunnel_connections: normalizeCheck(suppliedChecks.tunnel_connections, "tunnel_connections"),
    dns: normalizeCheck(suppliedChecks.dns, "dns"),
    udp_7844: normalizeCheck(suppliedChecks.udp_7844, "udp_7844"),
    tcp_7844: normalizeCheck(suppliedChecks.tcp_7844, "tcp_7844"),
    management_api_https: normalizeCheck(suppliedChecks.management_api_https, "management_api_https"),
    update_gate: normalizeCheck(suppliedChecks.update_gate, "update_gate"),
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
    platform: PLATFORM_PATTERN.test(platform ?? "") ? platform : "unknown",
    success: allChecksPass,
    management_mode: ["remotely-managed", "locally-managed"].includes(managementMode)
      ? managementMode : "unknown",
    snapshot: projectSnapshot(snapshot),
    checks,
  };
}
