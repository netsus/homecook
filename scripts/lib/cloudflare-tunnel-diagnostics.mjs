const TRACE_COLO_PATTERN = /^[A-Z]{3}$/u;
const ANONYMOUS_NETWORK_LABEL_PATTERN = /^(?:wifi|lte|5g)-[a-z0-9]{1,8}$/u;
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\b/u;
const CONNECTION_INDEX_PATTERN = /\bconnIndex[=:]\s*([0-3])\b/iu;
const LOCATION_PATTERN = /\blocation[=:]\s*([a-z]{3})[a-z0-9-]*\b/iu;
const PROTOCOL_PATTERN = /(?:\bprotocol[=:]\s*|--protocol(?:=|\s+))(auto|quic|http2)\b/iu;
const DISCONNECT_PATTERN = /(?:timeout: no recent network activity|connection (?:closed|disconnected)|registered tunnel connection.*(?:closed|lost))/iu;
const RECONNECT_PATTERN = /\bRegistered tunnel connection\b/iu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?\b/gu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const IPV6_PATTERN = /(?<![A-Za-z0-9])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![A-Za-z0-9])/giu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:access[_-]?token|refresh[_-]?token|authorization|bearer|cookie|set-cookie|client[_-]?secret|password|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu;
const SENSITIVE_KEY_PATTERN = /^(?:.*_)?(?:authorization|bearer|cookie|jwt|email|uuid|token|secret|password|(?:ip|ipv4|ipv6)(?:_address)?|correlation[_-]?id)$/iu;
const PANTRY_OUTCOMES = Object.freeze([
  "transport_timeout_or_52x",
  "app_auth_409",
  "success",
  "other_failure",
]);
const CORRELATION_HASH_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/u;
const APP_AUTH_ISSUE_ID_PATTERN = /^APP-AUTH-[1-9][0-9]{0,9}$/u;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value) {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && value.trim().length === 0)
  ) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function secondsToMilliseconds(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number * 1_000 * 1_000) / 1_000;
}

function normalizeHttpStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function redactString(value, secretMarkers) {
  let redacted = value;
  for (const marker of secretMarkers) {
    if (typeof marker === "string" && marker.length > 0) {
      redacted = redacted.split(marker).join("[redacted]");
    }
  }
  return redacted
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "[redacted-bearer]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(UUID_PATTERN, "[redacted-uuid]")
    .replace(IPV4_PATTERN, "[redacted-ip]")
    .replace(IPV6_PATTERN, "[redacted-ip]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted-secret]");
}

/**
 * @param {unknown} value
 * @param {{ secret_markers?: string[] }} [options]
 */
export function sanitizeForEvidence(value, { secret_markers = [] } = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForEvidence(item, { secret_markers }));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? item === null || item === undefined ? item : "[redacted]"
        : sanitizeForEvidence(item, { secret_markers }),
    ]));
  }
  return typeof value === "string" ? redactString(value, secret_markers) : value;
}

export function validateAnonymousNetworkLabel(value) {
  if (typeof value !== "string" || !ANONYMOUS_NETWORK_LABEL_PATTERN.test(value)) {
    throw new Error("Network label must be an anonymous wifi/lte/5g label.");
  }
  return value;
}

export function parseTrace(raw) {
  const fields = new Map();
  for (const line of asText(raw).split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }

  const ip = fields.get("ip") ?? "";
  const addressFamily = /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(ip)
    ? "ipv4"
    : ip.includes(":")
      ? "ipv6"
      : "unknown";
  const rawColo = fields.get("colo");
  if (rawColo === undefined || rawColo.length === 0) {
    return { address_family: addressFamily, colo: null, colo_state: "missing" };
  }
  const colo = rawColo.toUpperCase();
  if (!TRACE_COLO_PATTERN.test(colo)) {
    return { address_family: addressFamily, colo: null, colo_state: "unknown" };
  }
  return { address_family: addressFamily, colo, colo_state: "value" };
}

export function parseCfRayHeaders(raw) {
  const match = asText(raw).match(/^cf-ray:\s*[^\r\n]*-([a-z]{3})\s*$/imu);
  return match
    ? { present: true, colo: match[1].toUpperCase() }
    : { present: false, colo: null };
}

export function parseCurlTiming(raw) {
  try {
    const parsed = JSON.parse(asText(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("timing payload must be an object");
    }
    return {
      http_status: normalizeHttpStatus(parsed.http_code ?? parsed.response_code),
      connect_ms: secondsToMilliseconds(parsed.time_connect),
      ttfb_ms: secondsToMilliseconds(parsed.time_starttransfer),
      total_ms: secondsToMilliseconds(parsed.time_total),
      malformed: false,
    };
  } catch {
    return {
      http_status: null,
      connect_ms: null,
      ttfb_ms: null,
      total_ms: null,
      malformed: true,
    };
  }
}

export function parseCloudflaredVersion(raw) {
  const match = asText(raw).match(/\bcloudflared\s+version\s+([0-9]+(?:\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?)/iu);
  return match
    ? { version: match[1], available: true }
    : { version: null, available: false };
}

export function parseLaunchctlPrint(raw) {
  const text = asText(raw);
  if (/could not find service|service not found|not found/iu.test(text)) {
    return { loaded: false, state: "not_found", configured_protocol: null };
  }
  const state = text.match(/^\s*state\s*=\s*([a-z_-]+)\s*$/imu)?.[1]?.toLowerCase() ?? "unknown";
  const configuredProtocol = text.match(PROTOCOL_PATTERN)?.[1]?.toLowerCase() ?? null;
  return { loaded: text.trim().length > 0, state, configured_protocol: configuredProtocol };
}

function parseTunnelEvent(line, sequence) {
  const timestampMatch = line.match(TIMESTAMP_PATTERN);
  const connectionMatch = line.match(CONNECTION_INDEX_PATTERN);
  if (!timestampMatch || !connectionMatch) {
    return null;
  }
  const timestampMs = Date.parse(timestampMatch[1]);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  const type = DISCONNECT_PATTERN.test(line)
    ? "disconnect"
    : RECONNECT_PATTERN.test(line)
      ? "reconnect"
      : null;
  if (!type) {
    return null;
  }
  const locationMatch = type === "reconnect" ? line.match(LOCATION_PATTERN) : null;
  const protocolMatch = type === "reconnect" ? line.match(PROTOCOL_PATTERN) : null;
  return {
    sequence,
    timestamp: new Date(timestampMs).toISOString(),
    timestamp_ms: timestampMs,
    connection_index: Number(connectionMatch[1]),
    type,
    colo: locationMatch ? locationMatch[1].toUpperCase() : null,
    protocol: protocolMatch ? protocolMatch[1].toLowerCase() : null,
  };
}

export function parseTunnelLog(raw) {
  const events = [];
  let malformedLineCount = 0;
  asText(raw).split(/\r?\n/u).forEach((line, sequence) => {
    if (line.trim().length === 0) {
      return;
    }
    const event = parseTunnelEvent(line, sequence);
    if (event) {
      events.push(event);
    } else {
      malformedLineCount += 1;
    }
  });
  events.sort((left, right) =>
    left.timestamp_ms - right.timestamp_ms || left.sequence - right.sequence
  );

  const outages = [];
  const downConnections = new Set();
  let incident = null;
  const finishIncident = (recoveredAtMs = null) => {
    const disconnectedIndexes = [...incident.disconnected_indexes].sort((left, right) => left - right);
    const missingIndexes = recoveredAtMs === null ? [...downConnections].sort((left, right) => left - right) : [];
    const reconnects = [...incident.reconnects.values()];
    const colos = [...new Set(reconnects.flatMap((event) => event.colo ? [event.colo] : []))].sort();
    const protocols = [...new Set(
      reconnects.flatMap((event) => event.protocol ? [event.protocol] : []),
    )].sort();
    outages.push({
      disconnected_connection_indexes: disconnectedIndexes,
      disconnect_started_at: new Date(incident.started_at_ms).toISOString(),
      disconnect_completed_at: new Date(incident.disconnect_completed_at_ms).toISOString(),
      simultaneous_full_outage: incident.simultaneous_full_outage,
      recovered_at: recoveredAtMs === null ? null : new Date(recoveredAtMs).toISOString(),
      recovery_ms: recoveredAtMs === null ? null : recoveredAtMs - incident.started_at_ms,
      reconnect_missing_indexes: missingIndexes,
      tunnel_colo_state: colos.length === 0 ? "missing" : colos.length === 1 ? "single" : "mixed",
      tunnel_colos: colos,
      tunnel_protocols: protocols,
    });
    incident = null;
  };

  for (const event of events) {
    if (event.type === "disconnect") {
      if (downConnections.has(event.connection_index)) {
        continue;
      }
      if (downConnections.size === 0) {
        incident = {
          started_at_ms: event.timestamp_ms,
          disconnect_completed_at_ms: event.timestamp_ms,
          disconnected_indexes: new Set(),
          reconnects: new Map(),
          simultaneous_full_outage: false,
        };
      }
      downConnections.add(event.connection_index);
      incident.disconnected_indexes.add(event.connection_index);
      incident.disconnect_completed_at_ms = event.timestamp_ms;
      if (downConnections.size === 4) {
        incident.simultaneous_full_outage = true;
      }
      continue;
    }

    if (!downConnections.has(event.connection_index)) {
      continue;
    }
    downConnections.delete(event.connection_index);
    incident.reconnects.set(event.connection_index, event);
    if (downConnections.size === 0) {
      finishIncident(event.timestamp_ms);
    }
  }
  if (incident) {
    finishIncident();
  }

  const latestByIndex = new Map();
  for (const event of events) {
    latestByIndex.set(event.connection_index, event);
  }
  const healthyIndexes = [];
  const unhealthyIndexes = [];
  const unknownIndexes = [];
  for (let connectionIndex = 0; connectionIndex <= 3; connectionIndex += 1) {
    const latest = latestByIndex.get(connectionIndex);
    if (!latest) {
      unknownIndexes.push(connectionIndex);
    } else if (latest.type === "reconnect") {
      healthyIndexes.push(connectionIndex);
    } else {
      unhealthyIndexes.push(connectionIndex);
    }
  }
  const observedProtocols = [...new Set(
    events.flatMap((event) => event.protocol ? [event.protocol] : []),
  )].sort();

  return {
    parsed_event_count: events.length,
    malformed_line_count: malformedLineCount,
    connection_health: {
      healthy_connection_count: healthyIndexes.length,
      healthy_connection_indexes: healthyIndexes,
      unhealthy_connection_indexes: unhealthyIndexes,
      unknown_connection_indexes: unknownIndexes,
    },
    observed_protocols: observedProtocols,
    latest_connection_event_at: Object.fromEntries(
      [0, 1, 2, 3].map((connectionIndex) => [
        String(connectionIndex),
        latestByIndex.get(connectionIndex)?.timestamp ?? null,
      ]),
    ),
    outages,
  };
}

function nearestRank(values, percentile) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function summarizeLatencyValues(values) {
  return {
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

export function summarizeProbeSamples(
  samples,
  { expected_count = samples.length, minimum_latency_samples = 1 } = {},
) {
  const normalizedSamples = Array.isArray(samples) ? samples : [];
  const scheduled = Math.max(0, Number.isInteger(expected_count) ? expected_count : 0);
  const recorded = normalizedSamples.length;
  const missing = Math.max(0, scheduled - recorded);
  const successes = normalizedSamples.filter(({ success }) => success === true).length;
  const latencyValues = normalizedSamples
    .filter(({ success }) => success === true)
    .map(({ total_ms: totalMs }) => finiteNumber(totalMs))
    .filter((value) => value !== null);
  return {
    scheduled,
    recorded,
    missing,
    completeness: scheduled === 0 ? 1 : Math.min(recorded, scheduled) / scheduled,
    successes,
    recorded_failures: recorded - successes,
    failures_including_missing: recorded - successes + missing,
    latency_sample_count: latencyValues.length,
    latency_samples_complete: latencyValues.length >= minimum_latency_samples,
    latency_ms: summarizeLatencyValues(latencyValues),
  };
}

export function classifyPantrySample(sample) {
  const status = normalizeHttpStatus(sample?.http_status);
  if (
    sample?.transport_error === true
    || sample?.timed_out === true
    || (status !== null && status >= 520 && status <= 529)
  ) {
    return "transport_timeout_or_52x";
  }
  if (status === 409) {
    return "app_auth_409";
  }
  if (status !== null && status >= 200 && status <= 299) {
    return "success";
  }
  return "other_failure";
}

function normalizeErrorCode(value) {
  const candidate = asText(value).split("::", 1)[0].trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{1,63}$/u.test(candidate) ? candidate : null;
}

function normalizePantrySample(sample) {
  const outcome = classifyPantrySample(sample);
  const correlationIdHash = typeof sample?.correlation_id_hash === "string"
    && CORRELATION_HASH_PATTERN.test(sample.correlation_id_hash)
    ? sample.correlation_id_hash
    : null;
  return {
    outcome,
    success: outcome === "success",
    transport_error: sample?.transport_error === true,
    timed_out: sample?.timed_out === true,
    http_status: normalizeHttpStatus(sample?.http_status),
    connect_ms: finiteNumber(sample?.connect_ms),
    ttfb_ms: finiteNumber(sample?.ttfb_ms),
    total_ms: finiteNumber(sample?.total_ms),
    error_code: normalizeErrorCode(sample?.error_code),
    correlation_id_present: correlationIdHash !== null,
    correlation_id_hash: correlationIdHash,
    cf_ray: sample?.cf_ray?.present === true
      ? { present: true, colo: TRACE_COLO_PATTERN.test(sample.cf_ray.colo) ? sample.cf_ray.colo : null }
      : { present: false, colo: null },
  };
}

export function validateAppAuthIssueId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !APP_AUTH_ISSUE_ID_PATTERN.test(value)) {
    throw new Error("App/auth issue ID must match APP-AUTH-<positive integer>.");
  }
  return value;
}

export function aggregatePantrySamples(samples, { app_auth_issue_id = null } = {}) {
  const normalizedSamples = (Array.isArray(samples) ? samples : []).map(normalizePantrySample);
  const byOutcome = Object.fromEntries(PANTRY_OUTCOMES.map((outcome) => {
    const matching = normalizedSamples.filter((sample) => sample.outcome === outcome);
    const latencyValues = matching
      .map(({ total_ms: totalMs }) => finiteNumber(totalMs))
      .filter((value) => value !== null);
    return [outcome, {
      attempted: matching.length,
      successes: outcome === "success" ? matching.length : 0,
      failures: outcome === "success" ? 0 : matching.length,
      latency_sample_count: latencyValues.length,
      latency_ms: summarizeLatencyValues(latencyValues),
    }];
  }));
  return {
    attempted: normalizedSamples.length,
    app_auth_issue_id: byOutcome.app_auth_409.attempted > 0
      ? validateAppAuthIssueId(app_auth_issue_id)
      : null,
    by_outcome: byOutcome,
    samples: normalizedSamples,
  };
}

export function summarizeColos(samples) {
  const values = [...new Set((Array.isArray(samples) ? samples : [])
    .flatMap((sample) => sample?.trace?.colo ? [sample.trace.colo] : []))].sort();
  const missing = (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample?.trace?.colo_state !== "value").length;
  return {
    state: values.length > 1 ? "mixed" : values.length === 1 ? "single" : "missing",
    values,
    missing,
  };
}
