import { parseTunnelLog } from "./cloudflare-tunnel-diagnostics.mjs";
import { parseTunnelMetrics } from "./cloudflare-tunnel-preflight.mjs";

const METRICS_ENDPOINT_PATTERN = /^http:\/\/127\.0\.0\.1:(2024[1-5])\/metrics$/u;

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
    if (outage.recovered_at !== null) return false;
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
