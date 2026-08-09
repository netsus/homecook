import { validateAnonymousNetworkLabel } from "./cloudflare-tunnel-diagnostics.mjs";

const PUBLIC_PROBE_IDS = Object.freeze([
  "public_app_root",
  "public_pantry",
  "public_auth_health",
]);
const AUTHENTICATED_PROBE_ID = "authenticated_pantry_read";
const PUBLIC_EVENT_KEYS = Object.freeze([
  "probe_id",
  "scheduled_at",
  "observed_at",
  "outcome",
  "http_status",
  "ttfb_ms",
  "colo",
  "network_label",
]);
const AUTHENTICATED_EVENT_KEYS = Object.freeze([...PUBLIC_EVENT_KEYS, "wrapper_valid"]);
const ALLOWED_SOURCES = new Set([
  "local_connector",
  "external_public",
  "external_authenticated",
]);
const ALLOWED_KINDS = new Set(["connector_health", "probe_result"]);
const ALLOWED_SEVERITIES = new Set(["critical", "warning", "diagnostic"]);
const ALLOWED_STATUSES = new Set([
  "expected",
  "timeout",
  "cloudflare_52x",
  "unexpected_status",
  "invalid_wrapper",
  "late",
  "invalid",
  "missing",
  "connector_down",
  "connector_degraded",
  "simultaneous_disconnect",
  "reconnect_slow",
  "pantry_ttfb_slow",
  "lax_persistent",
]);
const ALLOWED_ERRORS = new Set([
  "NONE",
  "TIMEOUT",
  "CLOUDFLARE_52X",
  "UNEXPECTED_STATUS",
  "INVALID_WRAPPER",
  "LATE",
  "INVALID_EVENT",
  "MISSING_EVENT",
  "CONNECTOR_DOWN",
  "CONNECTOR_DEGRADED",
  "RECONNECT_SLOW",
]);

export const EXTERNAL_PROBE_CONTRACT = Object.freeze({
  schema: "homecook.cloudflare-external-probe-contract",
  version: 1,
  window_seconds: 86_400,
  completeness_threshold: 0.99,
  probes: Object.freeze({
    public_app_root: Object.freeze({
      audience: "public",
      method: "GET",
      target: "app_root",
      url: "https://app.mumeok.kr/",
      expected_status: 200,
      cadence_seconds: 60,
      timeout_seconds: 10,
      expected_samples_24h: 1_440,
    }),
    public_pantry: Object.freeze({
      audience: "public",
      method: "GET",
      target: "app_pantry",
      url: "https://app.mumeok.kr/pantry",
      expected_status: 200,
      cadence_seconds: 60,
      timeout_seconds: 10,
      expected_samples_24h: 1_440,
    }),
    public_auth_health: Object.freeze({
      audience: "public",
      method: "HEAD",
      target: "auth_health",
      url: "https://auth.mumeok.kr/auth/v1/health",
      expected_status: 401,
      cadence_seconds: 60,
      timeout_seconds: 10,
      expected_samples_24h: 1_440,
    }),
    authenticated_pantry_read: Object.freeze({
      audience: "authenticated",
      method: "GET",
      target: "test_account_pantry_read",
      expected_status: 200,
      expected_wrapper: "success_data_error",
      cadence_seconds: 300,
      timeout_seconds: 10,
      expected_samples_24h: 288,
    }),
  }),
});

function utcTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
    ? timestamp
    : null;
}

function normalizeColo(value) {
  const candidate = typeof value === "string" ? value.toUpperCase() : "";
  if (candidate === "ICN" || candidate === "LAX") return candidate;
  return /^[A-Z]{3}$/u.test(candidate) ? "OTHER" : "MISSING";
}

function normalizeNetworkLabel(value) {
  try {
    return validateAnonymousNetworkLabel(value);
  } catch {
    return null;
  }
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function latencySummary(values) {
  const normalized = values.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    count: normalized.length,
    p50: nearestRank(normalized, 0.5),
    p95: nearestRank(normalized, 0.95),
    max: normalized.length === 0 ? null : Math.max(...normalized),
  };
}

function classifyEvent(event, probe, windowStartMs, windowEndMs) {
  const expectedKeys = probe.audience === "authenticated"
    ? AUTHENTICATED_EVENT_KEYS
    : PUBLIC_EVENT_KEYS;
  if (Object.keys(event).length !== expectedKeys.length
    || !expectedKeys.every((key) => Object.hasOwn(event, key))) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  const observedAt = utcTimestamp(event.observed_at);
  const scheduledAt = utcTimestamp(event.scheduled_at);
  if (observedAt === null || scheduledAt === null || observedAt < scheduledAt
    || observedAt < windowStartMs || observedAt > windowEndMs) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  if (normalizeNetworkLabel(event.network_label) === null) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  if (!["timeout", "response"].includes(event.outcome)) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  if (event.outcome === "timeout") return { status: "timeout", error: "TIMEOUT" };
  if (!Number.isInteger(event.http_status) || event.http_status < 100 || event.http_status > 599) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  if (!Number.isFinite(event.ttfb_ms) || event.ttfb_ms < 0) {
    return { status: "invalid", error: "INVALID_EVENT" };
  }
  if (observedAt - scheduledAt > probe.timeout_seconds * 1_000) {
    return { status: "late", error: "LATE" };
  }
  if (event.http_status >= 520 && event.http_status <= 529) {
    return { status: "cloudflare_52x", error: "CLOUDFLARE_52X" };
  }
  if (event.http_status !== probe.expected_status) {
    return { status: "unexpected_status", error: "UNEXPECTED_STATUS" };
  }
  if (probe.audience === "authenticated" && event.wrapper_valid !== true) {
    return { status: "invalid_wrapper", error: "INVALID_WRAPPER" };
  }
  return { status: "expected", error: "NONE" };
}

function projectTimelineEvent(value) {
  const timestamp = utcTimestamp(value?.timestamp) === null ? null : value.timestamp;
  if (timestamp === null || !ALLOWED_SOURCES.has(value?.source)) return null;
  const source = value.source;
  const kind = ALLOWED_KINDS.has(value?.kind) ? value.kind : "probe_result";
  const severity = ALLOWED_SEVERITIES.has(value?.severity) ? value.severity : "diagnostic";
  const status = ALLOWED_STATUSES.has(value?.status) ? value.status : "invalid";
  const error = ALLOWED_ERRORS.has(value?.error) ? value.error : "NONE";
  return {
    timestamp,
    source,
    kind,
    severity,
    status,
    error,
    colo: normalizeColo(value?.colo),
    network_label: normalizeNetworkLabel(value?.network_label),
  };
}

/**
 * @param {{
 *   local_events?: Array<Record<string, unknown>>,
 *   external_events?: Array<Record<string, unknown>>
 * }} [input]
 */
export function composeIncidentTimeline({ local_events: local = [], external_events: external = [] } = {}) {
  return [...(Array.isArray(local) ? local : []), ...(Array.isArray(external) ? external : [])]
    .map(projectTimelineEvent)
    .filter((event) => event !== null)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function summarizeCloudflareMonitoring({
  local_health: localHealth,
  external_aggregate: externalAggregate,
} = {}) {
  const timeline = composeIncidentTimeline({
    local_events: localHealth?.incident_events,
    external_events: externalAggregate?.incident_timeline,
  });
  const criticalCount = timeline.filter(({ severity }) => severity === "critical").length;
  const warningCount = timeline.filter(({ severity }) => severity === "warning").length;
  const diagnosticCount = timeline.filter(({ severity }) => severity === "diagnostic").length;
  const status = criticalCount > 0
    ? "critical"
    : warningCount > 0
      ? "warning"
      : ["healthy", "degraded"].includes(localHealth?.state)
        ? localHealth.state
        : externalAggregate !== undefined
          ? "healthy"
          : "unknown";
  return {
    schema: "homecook.cloudflare-monitoring-summary",
    version: 1,
    status,
    incident_count: timeline.length,
    critical_count: criticalCount,
    warning_count: warningCount,
    diagnostic_count: diagnosticCount,
  };
}

function slotIndex(event, probe, windowStartMs) {
  const scheduledAt = utcTimestamp(event?.scheduled_at);
  if (scheduledAt === null) return null;
  const offset = scheduledAt - windowStartMs;
  const cadenceMs = probe.cadence_seconds * 1_000;
  if (offset < 0 || offset >= EXTERNAL_PROBE_CONTRACT.window_seconds * 1_000) return null;
  if (offset % cadenceMs !== 0) return null;
  const index = offset / cadenceMs;
  return index < probe.expected_samples_24h ? index : null;
}

function aggregateSlots(probeId, slots) {
  const statuses = slots.map((slot) => slot?.status ?? "missing");
  const count = (status) => statuses.filter((value) => value === status).length;
  const successes = count("expected");
  const missing = count("missing");
  const late = count("late");
  const invalid = count("invalid");
  const failures = slots.length - successes;
  const completeness = (slots.length - missing - late - invalid) / slots.length;
  const responseFailures = count("timeout") + count("cloudflare_52x")
    + count("unexpected_status") + count("invalid_wrapper");
  const completenessPass = completeness >= EXTERNAL_PROBE_CONTRACT.completeness_threshold;
  const responseQualityPass = responseFailures === 0;
  return {
    probe_id: probeId,
    scheduled: slots.length,
    successes,
    failures,
    missing,
    late,
    invalid,
    timeout_or_52x: count("timeout") + count("cloudflare_52x"),
    unexpected_status: count("unexpected_status"),
    invalid_wrapper: count("invalid_wrapper"),
    completeness,
    completeness_pass: completenessPass,
    response_quality_pass: responseQualityPass,
    gate_pass: completenessPass && responseQualityPass,
  };
}

function mergeAudience(summaries) {
  const totals = summaries.reduce((result, summary) => {
    for (const key of ["scheduled", "successes", "failures", "missing", "late", "invalid"]) {
      result[key] += summary[key];
    }
    return result;
  }, { scheduled: 0, successes: 0, failures: 0, missing: 0, late: 0, invalid: 0 });
  const completeness = totals.scheduled === 0
    ? 0
    : (totals.scheduled - totals.missing - totals.late - totals.invalid) / totals.scheduled;
  return {
    ...totals,
    completeness,
    endpoint_completeness_pass: summaries.every(({ completeness_pass: pass }) => pass),
    response_quality_pass: summaries.every(({ response_quality_pass: pass }) => pass),
    gate_pass: summaries.every(({ gate_pass: pass }) => pass),
  };
}

function criticalTransportIndexes(slots) {
  const indexes = new Set();
  for (let index = 1; index < slots.length; index += 1) {
    if (
      ["timeout", "cloudflare_52x"].includes(slots[index - 1]?.status)
      && ["timeout", "cloudflare_52x"].includes(slots[index]?.status)
    ) {
      indexes.add(index);
    }
  }
  return indexes;
}

function maxConsecutiveLax(slots, networkLabel) {
  let current = 0;
  let maximum = 0;
  for (const slot of slots) {
    if (slot?.network_label !== networkLabel) continue;
    current = slot.colo === "LAX" ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

export function aggregateExternalProbeWindow(input = {}) {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.keys(input).length !== 3
    || !["window_start", "window_end", "events"].every((key) => Object.hasOwn(input, key))
    || typeof input.window_start !== "string"
    || typeof input.window_end !== "string"
    || !Array.isArray(input.events)
  ) {
    throw new Error("Invalid aggregate envelope.");
  }
  const {
    window_start: windowStart,
    window_end: windowEnd,
    events,
  } = input;
  const windowStartMs = utcTimestamp(windowStart);
  const windowEndMs = utcTimestamp(windowEnd);
  if (
    windowStartMs === null
    || windowEndMs === null
    || windowEndMs - windowStartMs !== EXTERNAL_PROBE_CONTRACT.window_seconds * 1_000
  ) {
    throw new Error("The aggregation window must be exactly 24 hours.");
  }
  const slotsByProbe = Object.fromEntries(Object.entries(EXTERNAL_PROBE_CONTRACT.probes)
    .map(([probeId, probe]) => [probeId, Array(probe.expected_samples_24h).fill(null)]));
  let rejectedEventCount = 0;

  for (const event of events) {
    const probe = EXTERNAL_PROBE_CONTRACT.probes[event?.probe_id];
    if (!probe || event === null || typeof event !== "object" || Array.isArray(event)) {
      rejectedEventCount += 1;
      continue;
    }
    const index = slotIndex(event, probe, windowStartMs);
    if (index === null) {
      rejectedEventCount += 1;
      continue;
    }
    const slots = slotsByProbe[event.probe_id];
    if (slots[index] !== null) {
      rejectedEventCount += 1;
      slots[index] = {
        status: "invalid",
        error: "INVALID_EVENT",
        scheduled_at: event.scheduled_at,
        observed_at: event.scheduled_at,
        colo: "MISSING",
        network_label: null,
        ttfb_ms: null,
      };
      continue;
    }
    const classification = classifyEvent(event, probe, windowStartMs, windowEndMs);
    if (classification.status === "invalid") rejectedEventCount += 1;
    const observedAtMs = utcTimestamp(event.observed_at);
    slots[index] = {
      ...classification,
      scheduled_at: event.scheduled_at,
      observed_at: observedAtMs !== null
        && observedAtMs >= windowStartMs
        && observedAtMs <= windowEndMs
        ? event.observed_at
        : event.scheduled_at,
      colo: normalizeColo(event.colo),
      network_label: normalizeNetworkLabel(event.network_label),
      ttfb_ms: classification.status === "expected" ? event.ttfb_ms : null,
    };
  }

  let byProbe = Object.fromEntries(Object.entries(slotsByProbe)
    .map(([probeId, slots]) => [probeId, aggregateSlots(probeId, slots)]));
  let publicSummary = mergeAudience(PUBLIC_PROBE_IDS.map((probeId) => byProbe[probeId]));
  let authenticatedSummary = mergeAudience([byProbe[AUTHENTICATED_PROBE_ID]]);
  if (rejectedEventCount > 0) {
    byProbe = Object.fromEntries(Object.entries(byProbe)
      .map(([probeId, summary]) => [probeId, { ...summary, gate_pass: false }]));
    publicSummary = { ...publicSummary, gate_pass: false };
    authenticatedSummary = { ...authenticatedSummary, gate_pass: false };
  }
  const criticalIndexesByProbe = Object.fromEntries(PUBLIC_PROBE_IDS.map((probeId) => [
    probeId,
    criticalTransportIndexes(slotsByProbe[probeId]),
  ]));
  const critical = Object.values(criticalIndexesByProbe).some((indexes) => indexes.size > 0)
    ? ["public_timeout_or_52x_consecutive_2"]
    : [];
  const pantryTtfb = latencySummary(slotsByProbe.public_pantry
    .filter((slot) => slot?.status === "expected")
    .map((slot) => slot.ttfb_ms));
  const warning = pantryTtfb.p95 !== null && pantryTtfb.p95 > 500
    ? ["korean_pantry_ttfb_p95_over_500ms"]
    : [];
  const laxLabels = new Set();
  for (const probeId of PUBLIC_PROBE_IDS) {
    const slots = slotsByProbe[probeId];
    const labels = new Set(slots.flatMap((slot) => slot?.network_label ? [slot.network_label] : []));
    for (const label of labels) {
      if (maxConsecutiveLax(slots, label) >= 10) laxLabels.add(label);
    }
  }
  const diagnostic = laxLabels.size >= 2 ? ["lax_consecutive_10_two_networks"] : [];
  const externalTimeline = [];
  for (const [probeId, slots] of Object.entries(slotsByProbe)) {
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const status = slot?.status ?? "missing";
      if (status === "expected") continue;
      const scheduledAt = new Date(
        windowStartMs + index * EXTERNAL_PROBE_CONTRACT.probes[probeId].cadence_seconds * 1_000,
      ).toISOString();
      externalTimeline.push({
        timestamp: slot?.observed_at ?? scheduledAt,
        source: EXTERNAL_PROBE_CONTRACT.probes[probeId].audience === "public"
          ? "external_public"
          : "external_authenticated",
        kind: "probe_result",
        severity: criticalIndexesByProbe[probeId]?.has(index) ? "critical" : "warning",
        status,
        error: slot?.error ?? "MISSING_EVENT",
        colo: slot?.colo ?? "MISSING",
        network_label: slot?.network_label ?? null,
      });
    }
  }
  if (warning.includes("korean_pantry_ttfb_p95_over_500ms")) {
    externalTimeline.push({
      timestamp: windowEnd,
      source: "external_public",
      kind: "probe_result",
      severity: "warning",
      status: "pantry_ttfb_slow",
      error: "NONE",
      colo: "MISSING",
      network_label: null,
    });
  }
  if (diagnostic.includes("lax_consecutive_10_two_networks")) {
    externalTimeline.push({
      timestamp: windowEnd,
      source: "external_public",
      kind: "probe_result",
      severity: "diagnostic",
      status: "lax_persistent",
      error: "NONE",
      colo: "LAX",
      network_label: null,
    });
  }

  return {
    schema: "homecook.cloudflare-external-probe-aggregate",
    version: 1,
    window_start: windowStart,
    window_end: windowEnd,
    by_probe: byProbe,
    public: publicSummary,
    authenticated: authenticatedSummary,
    public_paging_ready: publicSummary.gate_pass && rejectedEventCount === 0,
    public_pantry_ttfb_ms: pantryTtfb,
    alerts: { critical, warning, diagnostic },
    rejected_event_count: rejectedEventCount,
    incident_timeline: composeIncidentTimeline({ external_events: externalTimeline }),
  };
}
