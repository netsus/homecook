import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EXTERNAL_PROBE_CONTRACT,
  aggregateExternalProbeWindow,
  composeIncidentTimeline,
  summarizeCloudflareMonitoring,
} from "../scripts/lib/cloudflare-external-probe.mjs";
import { runExternalProbeCli } from "../scripts/cloudflare-external-probe.mjs";

const WINDOW_START = "2026-08-10T00:00:00.000Z";
const WINDOW_END = "2026-08-11T00:00:00.000Z";

type ProbeId = keyof typeof EXTERNAL_PROBE_CONTRACT.probes;

type ProbeEvent = {
  probe_id: ProbeId;
  scheduled_at: string;
  observed_at: string;
  outcome: string;
  http_status: number | null;
  ttfb_ms: number;
  colo: string;
  network_label: string;
  wrapper_valid?: boolean;
  [key: string]: unknown;
};

function expectedStatus(probeId: ProbeId): number {
  return EXTERNAL_PROBE_CONTRACT.probes[probeId].expected_status;
}

function eventFor(
  probeId: ProbeId,
  slot: number,
  overrides: Record<string, unknown> = {},
): ProbeEvent {
  const cadenceSeconds = EXTERNAL_PROBE_CONTRACT.probes[probeId].cadence_seconds;
  const scheduledAt = new Date(Date.parse(WINDOW_START) + slot * cadenceSeconds * 1_000);
  return {
    probe_id: probeId,
    scheduled_at: scheduledAt.toISOString(),
    observed_at: scheduledAt.toISOString(),
    outcome: "response",
    http_status: expectedStatus(probeId),
    ttfb_ms: probeId === "public_pantry" ? 120 : 80,
    colo: "ICN",
    network_label: "wifi-01",
    ...(probeId === "authenticated_pantry_read" ? { wrapper_valid: true } : {}),
    ...overrides,
  };
}

function completeEvents(): ProbeEvent[] {
  return (Object.keys(EXTERNAL_PROBE_CONTRACT.probes) as ProbeId[]).flatMap((probeId) =>
    Array.from(
      { length: EXTERNAL_PROBE_CONTRACT.probes[probeId].expected_samples_24h },
      (_, slot) => eventFor(probeId, slot),
    )
  );
}

describe("provider-neutral external probe contract", () => {
  it("locks the public and authenticated cadence, methods, statuses, timeout, and 24h counts", () => {
    expect(EXTERNAL_PROBE_CONTRACT).toEqual(expect.objectContaining({
      window_seconds: 86_400,
      completeness_threshold: 0.99,
      probes: {
        public_app_root: expect.objectContaining({
          audience: "public",
          method: "GET",
          target: "app_root",
          url: "https://app.mumeok.kr/",
          expected_status: 200,
          cadence_seconds: 60,
          timeout_seconds: 10,
          expected_samples_24h: 1_440,
        }),
        public_pantry: expect.objectContaining({
          audience: "public",
          method: "GET",
          target: "app_pantry",
          url: "https://app.mumeok.kr/pantry",
          expected_status: 200,
          cadence_seconds: 60,
          timeout_seconds: 10,
          expected_samples_24h: 1_440,
        }),
        public_auth_health: expect.objectContaining({
          audience: "public",
          method: "HEAD",
          target: "auth_health",
          url: "https://auth.mumeok.kr/auth/v1/health",
          expected_status: 401,
          cadence_seconds: 60,
          timeout_seconds: 10,
          expected_samples_24h: 1_440,
        }),
        authenticated_pantry_read: expect.objectContaining({
          audience: "authenticated",
          method: "GET",
          target: "test_account_pantry_read",
          expected_status: 200,
          expected_wrapper: "success_data_error",
          cadence_seconds: 300,
          expected_samples_24h: 288,
        }),
      },
    }));
    expect(JSON.stringify(EXTERNAL_PROBE_CONTRACT)).not.toMatch(
      /credential|session|cookie|token|authorization/iu,
    );
  });

  it("keeps public and authenticated denominators independent with a complete 24h window", () => {
    const aggregate = aggregateExternalProbeWindow({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events: completeEvents(),
    });

    expect(aggregate.public).toEqual(expect.objectContaining({
      scheduled: 4_320,
      successes: 4_320,
      failures: 0,
      completeness: 1,
      gate_pass: true,
    }));
    expect(aggregate.authenticated).toEqual(expect.objectContaining({
      scheduled: 288,
      successes: 288,
      failures: 0,
      completeness: 1,
      gate_pass: true,
    }));
  });

  it("counts missing, late, and invalid events as failures without moving them between denominators", () => {
    const events = completeEvents();
    events.splice(events.findIndex((event) =>
      event.probe_id === "public_app_root" && event.scheduled_at === WINDOW_START
    ), 1);
    const late = events.find((event) =>
      event.probe_id === "public_pantry" && event.scheduled_at === WINDOW_START
    )!;
    late.observed_at = "2026-08-10T00:00:11.000Z";
    const invalid = events.find((event) =>
      event.probe_id === "authenticated_pantry_read" && event.scheduled_at === WINDOW_START
    )!;
    Object.assign(invalid, { credential: "must-not-escape" });

    const aggregate = aggregateExternalProbeWindow({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events,
    });

    expect(aggregate.public).toEqual(expect.objectContaining({
      scheduled: 4_320,
      missing: 1,
      late: 1,
      invalid: 0,
      failures: 2,
    }));
    expect(aggregate.authenticated).toEqual(expect.objectContaining({
      scheduled: 288,
      missing: 0,
      late: 0,
      invalid: 1,
      failures: 1,
    }));
    expect(JSON.stringify(aggregate)).not.toContain("must-not-escape");
  });

  it("pages on two consecutive public timeout/52x results without requiring authenticated success", () => {
    const events = completeEvents();
    for (const event of events) {
      if (event.probe_id === "authenticated_pantry_read") {
        event.http_status = 500;
        event.wrapper_valid = false;
      }
      if (
        event.probe_id === "public_app_root"
        && [0, 1].includes(
          Math.round((Date.parse(event.scheduled_at) - Date.parse(WINDOW_START)) / 60_000),
        )
      ) {
        event.outcome = "timeout";
        event.http_status = null;
      }
    }

    const aggregate = aggregateExternalProbeWindow({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events,
    });

    expect(aggregate.alerts.critical).toContain("public_timeout_or_52x_consecutive_2");
    expect(aggregate.public.failures).toBe(2);
    expect(aggregate.authenticated.failures).toBe(288);
    expect(aggregate.public_paging_ready).toBe(true);

    const authOnlyFailureEvents = completeEvents().map((event) =>
      event.probe_id === "authenticated_pantry_read"
        ? { ...event, http_status: 500, wrapper_valid: false }
        : event
    );
    const authOnlyFailure = aggregateExternalProbeWindow({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events: authOnlyFailureEvents,
    });
    expect(authOnlyFailure.alerts.critical).not.toContain(
      "public_timeout_or_52x_consecutive_2",
    );
    expect(authOnlyFailure.public_paging_ready).toBe(true);
  });

  it("warns on Korean pantry p95 over 500ms and diagnoses ten LAX samples on two network labels", () => {
    const events = completeEvents();
    let wifiSamples = 0;
    let lteSamples = 0;
    for (const event of events) {
      if (event.probe_id === "public_pantry") event.ttfb_ms = 600;
      if (event.probe_id === "public_app_root" && wifiSamples < 10) {
        event.network_label = "wifi-01";
        event.colo = "LAX";
        wifiSamples += 1;
      } else if (event.probe_id === "public_app_root" && lteSamples < 10) {
        event.network_label = "lte-01";
        event.colo = "LAX";
        lteSamples += 1;
      }
    }

    const aggregate = aggregateExternalProbeWindow({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events,
    });

    expect(aggregate.public_pantry_ttfb_ms.p95).toBe(600);
    expect(aggregate.alerts.warning).toContain("korean_pantry_ttfb_p95_over_500ms");
    expect(aggregate.alerts.diagnostic).toContain("lax_consecutive_10_two_networks");
  });

  it("composes one allowlisted incident timeline with zero raw secret, IP, headers, body, or path", () => {
    const fixtures = [
      "raw-token-value",
      "cookie-value",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature",
      "person@example.com",
      "123e4567-e89b-42d3-a456-426614174000",
      "203.0.113.42",
      "/Users/private/evidence.json",
      "x-secret-header",
      "private-response-body",
    ];
    const timeline = composeIncidentTimeline({
      local_events: [{
        timestamp: "2026-08-10T00:00:00.000Z",
        source: "local_connector",
        kind: "connector_health",
        severity: "critical",
        status: "connector_down",
        token: fixtures[0],
        raw_ip: fixtures[5],
        path: fixtures[6],
      }],
      external_events: [{
        timestamp: "2026-08-10T00:01:00.000Z",
        source: "external_public",
        kind: "probe_result",
        severity: "critical",
        status: "timeout",
        error: "TIMEOUT",
        colo: "LAX",
        network_label: "lte-01",
        cookie: fixtures[1],
        jwt: fixtures[2],
        email: fixtures[3],
        uuid: fixtures[4],
        headers: fixtures[7],
        body: fixtures[8],
      }],
    });
    const serialized = JSON.stringify(timeline);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toEqual({
      timestamp: "2026-08-10T00:00:00.000Z",
      source: "local_connector",
      kind: "connector_health",
      severity: "critical",
      status: "connector_down",
      error: "NONE",
      colo: "MISSING",
      network_label: null,
    });
    for (const fixture of fixtures) expect(serialized).not.toContain(fixture);
  });

  it("projects the combined local/external timeline into the lifecycle optional summary", () => {
    const summary = summarizeCloudflareMonitoring({
      local_health: {
        state: "warning",
        incident_events: [{
          timestamp: "2026-08-10T00:00:00.000Z",
          source: "local_connector",
          kind: "connector_health",
          severity: "warning",
          status: "reconnect_slow",
          error: "RECONNECT_SLOW",
          colo: "ICN",
          network_label: null,
          raw_log: "must-not-escape",
        }],
      },
      external_aggregate: {
        incident_timeline: [{
          timestamp: "2026-08-10T00:01:00.000Z",
          source: "external_public",
          kind: "probe_result",
          severity: "diagnostic",
          status: "unexpected_status",
          error: "UNEXPECTED_STATUS",
          colo: "LAX",
          network_label: "wifi-01",
          response_body: "must-not-escape",
        }],
      },
    });

    expect(summary).toEqual({
      schema: "homecook.cloudflare-monitoring-summary",
      version: 1,
      status: "warning",
      incident_count: 2,
      critical_count: 0,
      warning_count: 1,
      diagnostic_count: 1,
    });
    expect(JSON.stringify(summary)).not.toContain("must-not-escape");
  });

  it("aggregates stdin JSON without accepting secret CLI arguments or leaking invalid input", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const input = JSON.stringify({
      window_start: WINDOW_START,
      window_end: WINDOW_END,
      events: [{
        ...eventFor("public_app_root", 0),
        response_body: "must-not-escape",
      }],
    });
    const exitCode = await runExternalProbeCli(["aggregate"], {
      readStdin: async () => input,
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    });

    expect(exitCode).toBe(1);
    expect(stdout.join("")).not.toContain("must-not-escape");
    expect(stderr.join("")).not.toContain("must-not-escape");

    const rejected = await runExternalProbeCli(["aggregate", "--token", "must-not-escape"], {
      readStdin: async () => "{}",
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    });
    expect(rejected).toBe(1);
    expect(stderr.at(-1)).toBe("cloudflare-external-probe: FAIL (redacted)\n");
  });

  it("wires focused verification and stdin-only aggregation scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["verify:cloudflare-external-probe"]).toBe(
      "vitest run tests/cloudflare-external-probe.test.ts",
    );
    expect(packageJson.scripts["aggregate:cloudflare-external-probe"]).toBe(
      "node scripts/cloudflare-external-probe.mjs aggregate",
    );
    expect(packageJson.scripts["aggregate:cloudflare-external-probe"])
      .not.toMatch(/token|cookie|secret|credential/iu);
  });
});
