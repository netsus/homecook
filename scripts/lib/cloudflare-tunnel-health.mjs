import { parseTunnelLog } from "./cloudflare-tunnel-diagnostics.mjs";
import { parseTunnelMetrics } from "./cloudflare-tunnel-preflight.mjs";

const METRICS_ENDPOINT_PATTERN = /^http:\/\/127\.0\.0\.1:(2024[1-5])\/metrics$/u;
const LOCAL_HEALTH_KEYS = Object.freeze([
  "schema",
  "version",
  "captured_at",
  "state",
  "connector",
  "degraded_duration_ms",
  "reconnect_ms",
  "signals",
  "incident_events",
]);
const CONNECTOR_KEYS = Object.freeze([
  "healthy_connections",
  "expected_connections",
  "connection_state",
  "metrics_valid",
  "log_event_count",
]);
const RECONNECT_KEYS = Object.freeze(["count", "p50", "p95", "max"]);
const SIGNAL_KEYS = Object.freeze(["critical", "warning", "diagnostic"]);
const INCIDENT_KEYS = Object.freeze([
  "timestamp",
  "source",
  "kind",
  "severity",
  "status",
  "error",
  "colo",
  "network_label",
]);
const INCIDENT_CONTRACT = Object.freeze({
  connector_down: Object.freeze({
    severity: "critical",
    error: "CONNECTOR_DOWN",
    signal_group: "critical",
    signal: "connector_down",
  }),
  connector_degraded: Object.freeze({
    severity: "warning",
    error: "CONNECTOR_DEGRADED",
    signal_group: "warning",
    signal: "connector_below_4_over_60s",
  }),
  simultaneous_disconnect: Object.freeze({
    severity: "diagnostic",
    error: "NONE",
    signal_group: "diagnostic",
    signal: "simultaneous_disconnect",
  }),
  reconnect_slow: Object.freeze({
    severity: "warning",
    error: "RECONNECT_SLOW",
    signal_group: "warning",
    signal: "reconnect_over_15s",
  }),
});
const SIGNAL_CONTRACT = Object.freeze({
  critical: new Set(["connector_down"]),
  warning: new Set(["connector_below_4_over_60s", "reconnect_over_15s"]),
  diagnostic: new Set(["simultaneous_disconnect"]),
});

function exactObjectKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function utcIsoTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validOptionalDuration(value) {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function validSignalList(value, allowed) {
  return Array.isArray(value)
    && new Set(value).size === value.length
    && value.every((signal) => allowed.has(signal));
}

export function validateLocalConnectorHealth(value) {
  if (!exactObjectKeys(value, LOCAL_HEALTH_KEYS)
    || value.schema !== "homecook.cloudflare-tunnel-health"
    || value.version !== 1
    || !utcIsoTimestamp(value.captured_at)
    || !["healthy", "degraded", "warning", "critical", "unknown"].includes(value.state)
    || !exactObjectKeys(value.connector, CONNECTOR_KEYS)
    || !exactObjectKeys(value.reconnect_ms, RECONNECT_KEYS)
    || !exactObjectKeys(value.signals, SIGNAL_KEYS)
    || !Array.isArray(value.incident_events)
    || !validOptionalDuration(value.degraded_duration_ms)) {
    return false;
  }

  const { connector, reconnect_ms: reconnect, signals } = value;
  if (connector.expected_connections !== 4
    || typeof connector.metrics_valid !== "boolean"
    || !Number.isSafeInteger(connector.log_event_count)
    || connector.log_event_count < 0
    || !["healthy", "degraded", "down", "unknown"].includes(connector.connection_state)
    || !(connector.healthy_connections === null
      || (Number.isInteger(connector.healthy_connections)
        && connector.healthy_connections >= 0
        && connector.healthy_connections <= 4))
    || !Number.isSafeInteger(reconnect.count)
    || reconnect.count < 0
    || ![reconnect.p50, reconnect.p95, reconnect.max].every(validOptionalDuration)
    || !validSignalList(signals.critical, SIGNAL_CONTRACT.critical)
    || !validSignalList(signals.warning, SIGNAL_CONTRACT.warning)
    || !validSignalList(signals.diagnostic, SIGNAL_CONTRACT.diagnostic)) {
    return false;
  }
  if ((reconnect.count === 0 && [reconnect.p50, reconnect.p95, reconnect.max].some((item) => item !== null))
    || (reconnect.count > 0 && [reconnect.p50, reconnect.p95, reconnect.max].some((item) => item === null))
    || (reconnect.count === 1
      && !(reconnect.p50 === reconnect.p95 && reconnect.p95 === reconnect.max))
    || (reconnect.count > 0 && !(reconnect.p50 <= reconnect.p95 && reconnect.p95 <= reconnect.max))) {
    return false;
  }

  const connectionState = connector.healthy_connections === null
    ? "unknown"
    : connector.healthy_connections === 0
      ? "down"
      : connector.healthy_connections < 4
        ? "degraded"
        : "healthy";
  if (connector.connection_state !== connectionState
    || connector.metrics_valid !== (connector.healthy_connections !== null)) {
    return false;
  }

  const expectedSignals = {
    critical: connector.healthy_connections === 0 ? ["connector_down"] : [],
    warning: [
      ...(connector.healthy_connections !== null
        && connector.healthy_connections > 0
        && connector.healthy_connections < 4
        && value.degraded_duration_ms !== null
        && value.degraded_duration_ms > 60_000
        ? ["connector_below_4_over_60s"] : []),
      ...(reconnect.p95 !== null && reconnect.p95 > 15_000 ? ["reconnect_over_15s"] : []),
    ],
  };
  if (JSON.stringify(signals.critical) !== JSON.stringify(expectedSignals.critical)
    || JSON.stringify(signals.warning) !== JSON.stringify(expectedSignals.warning)) {
    return false;
  }
  const expectedState = signals.critical.length > 0
    ? "critical"
    : !connector.metrics_valid
      ? "unknown"
      : signals.warning.length > 0
        ? "warning"
        : connectionState;
  if (value.state !== expectedState) return false;

  const eventSignals = new Set();
  const incidentIdentities = new Set();
  let slowReconnectIncidentCount = 0;
  const capturedAtMs = Date.parse(value.captured_at);
  for (const event of value.incident_events) {
    if (!exactObjectKeys(event, INCIDENT_KEYS)
      || !utcIsoTimestamp(event.timestamp)
      || Date.parse(event.timestamp) < capturedAtMs - 86_400_000
      || Date.parse(event.timestamp) > capturedAtMs
      || event.source !== "local_connector"
      || event.kind !== "connector_health"
      || !["ICN", "LAX", "OTHER", "MISSING"].includes(event.colo)
      || event.network_label !== null) {
      return false;
    }
    const contract = INCIDENT_CONTRACT[event.status];
    if (!contract || event.severity !== contract.severity || event.error !== contract.error) {
      return false;
    }
    const identity = JSON.stringify(INCIDENT_KEYS.map((key) => event[key]));
    if (incidentIdentities.has(identity)) return false;
    incidentIdentities.add(identity);
    if (!signals[contract.signal_group].includes(contract.signal)) return false;
    if (event.status === "reconnect_slow") slowReconnectIncidentCount += 1;
    eventSignals.add(contract.signal);
  }
  return slowReconnectIncidentCount <= reconnect.count
    && [...signals.critical, ...signals.warning, ...signals.diagnostic]
      .every((signal) => eventSignals.has(signal));
}

export function localConnectorHealthExitCode(value) {
  if (!validateLocalConnectorHealth(value)) return null;
  return ["healthy", "warning"].includes(value.state) ? 0 : 1;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function summarizeDurations(values) {
  const durations = values.map(finiteNonNegative).filter((value) => value !== null);
  return {
    count: durations.length,
    p50: nearestRank(durations, 0.5),
    p95: nearestRank(durations, 0.95),
    max: durations.length === 0 ? null : Math.max(...durations),
  };
}

function normalizeColo(value) {
  if (value === "ICN" || value === "LAX") return value;
  return typeof value === "string" && /^[A-Z]{3}$/u.test(value) ? "OTHER" : "MISSING";
}

export function validateMetricsEndpoint(value) {
  if (typeof value !== "string" || !METRICS_ENDPOINT_PATTERN.test(value)) {
    throw new Error("A fixed 127.0.0.1 loopback metrics endpoint is required.");
  }
  return value;
}

function localTimeline(
  recoveredOutages,
  simultaneousOutages,
  healthyConnections,
  capturedAt,
  reconnectThresholdMs,
  degradedDurationMs,
) {
  const events = [];
  if (healthyConnections === 0) {
    events.push({
      timestamp: capturedAt,
      source: "local_connector",
      kind: "connector_health",
      severity: "critical",
      status: "connector_down",
      error: "CONNECTOR_DOWN",
      colo: "MISSING",
      network_label: null,
    });
  }
  if (
    healthyConnections !== null
    && healthyConnections > 0
    && healthyConnections < 4
    && degradedDurationMs !== null
    && degradedDurationMs > 60_000
  ) {
    events.push({
      timestamp: capturedAt,
      source: "local_connector",
      kind: "connector_health",
      severity: "warning",
      status: "connector_degraded",
      error: "CONNECTOR_DEGRADED",
      colo: "MISSING",
      network_label: null,
    });
  }
  for (const outage of simultaneousOutages) {
    events.push({
      timestamp: outage.disconnect_completed_at,
      source: "local_connector",
      kind: "connector_health",
      severity: "diagnostic",
      status: "simultaneous_disconnect",
      error: "NONE",
      colo: normalizeColo(outage.tunnel_colos?.[0]),
      network_label: null,
    });
  }
  for (const outage of recoveredOutages) {
    if (outage.recovery_ms !== null && outage.recovery_ms > reconnectThresholdMs) {
      events.push({
        timestamp: outage.recovered_at,
        source: "local_connector",
        kind: "connector_health",
        severity: "warning",
        status: "reconnect_slow",
        error: "RECONNECT_SLOW",
        colo: normalizeColo(outage.tunnel_colos?.[0]),
        network_label: null,
      });
    }
  }
  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function buildLocalConnectorHealth({
  captured_at: capturedAt,
  metrics_raw: metricsRaw,
  log_raw: logRaw,
} = {}) {
  const capturedAtMs = Date.parse(capturedAt ?? "");
  if (!Number.isFinite(capturedAtMs) || new Date(capturedAtMs).toISOString() !== capturedAt) {
    throw new Error("captured_at must be a UTC ISO-8601 timestamp.");
  }
  const metrics = parseTunnelMetrics(typeof metricsRaw === "string" ? metricsRaw : "");
  const tunnelLog = parseTunnelLog(typeof logRaw === "string" ? logRaw : "");
  const rawConnectionCount = metrics.active_connections;
  const connectionCountInRange = Number.isInteger(rawConnectionCount)
    && rawConnectionCount >= 0
    && rawConnectionCount <= 4;
  const metricsValid = metrics.version !== null
    && connectionCountInRange
    && metrics.samples_valid === true
    && metrics.connection_ids_consistent === true
    && (rawConnectionCount < 4 || metrics.success === true);
  const healthyConnections = metricsValid ? rawConnectionCount : null;
  const windowStartMs = capturedAtMs - 86_400_000;
  const timestampInWindow = (value) => {
    const timestamp = Date.parse(value ?? "");
    return Number.isFinite(timestamp) && timestamp >= windowStartMs && timestamp <= capturedAtMs;
  };
  const recoveredOutages = tunnelLog.outages.filter((outage) =>
    outage.recovered_at !== null && timestampInWindow(outage.recovered_at)
  );
  const simultaneousOutages = tunnelLog.outages.filter((outage) =>
    outage.simultaneous_full_outage && timestampInWindow(outage.disconnect_completed_at)
  );
  const openOutages = tunnelLog.outages.filter((outage) => {
    const recoveredAt = Date.parse(outage.recovered_at ?? "");
    if (Number.isFinite(recoveredAt) && recoveredAt <= capturedAtMs) return false;
    const disconnectedAt = Date.parse(outage.disconnect_started_at);
    return Number.isFinite(disconnectedAt) && disconnectedAt <= capturedAtMs;
  });
  const recoveredDurations = recoveredOutages
    .map((outage) => outage.recovery_ms)
    .filter((value) => value !== null);
  const reconnectMs = summarizeDurations(recoveredDurations);
  const openOutageDurations = openOutages
    .map((outage) => capturedAtMs - Date.parse(outage.disconnect_started_at))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const degradedDurationMs = openOutageDurations.length === 0
    ? null
    : Math.max(...openOutageDurations);
  const critical = [];
  const warning = [];
  const diagnostic = [];
  if (healthyConnections === 0) critical.push("connector_down");
  if (
    healthyConnections !== null
    && healthyConnections > 0
    && healthyConnections < 4
    && degradedDurationMs !== null
    && degradedDurationMs > 60_000
  ) {
    warning.push("connector_below_4_over_60s");
  }
  if (reconnectMs.p95 !== null && reconnectMs.p95 > 15_000) {
    warning.push("reconnect_over_15s");
  }
  if (simultaneousOutages.length > 0) {
    diagnostic.push("simultaneous_disconnect");
  }
  const connectionState = healthyConnections === null
    ? "unknown"
    : healthyConnections === 0
      ? "down"
      : healthyConnections < 4
        ? "degraded"
        : "healthy";
  const state = critical.length > 0
    ? "critical"
    : !metricsValid
      ? "unknown"
      : warning.length > 0
      ? "warning"
      : connectionState;

  return {
    schema: "homecook.cloudflare-tunnel-health",
    version: 1,
    captured_at: capturedAt,
    state,
    connector: {
      healthy_connections: healthyConnections,
      expected_connections: 4,
      connection_state: connectionState,
      metrics_valid: metricsValid,
      log_event_count: tunnelLog.parsed_event_count,
    },
    degraded_duration_ms: degradedDurationMs,
    reconnect_ms: reconnectMs,
    signals: { critical, warning, diagnostic },
    incident_events: localTimeline(
      recoveredOutages,
      simultaneousOutages,
      healthyConnections,
      capturedAt,
      15_000,
      degradedDurationMs,
    ),
  };
}
