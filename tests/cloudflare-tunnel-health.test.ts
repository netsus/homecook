import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLocalConnectorHealth,
  validateMetricsEndpoint,
} from "../scripts/lib/cloudflare-tunnel-health.mjs";
import { parseTunnelMetrics } from "../scripts/lib/cloudflare-tunnel-preflight.mjs";
import { runHealthCli } from "../scripts/cloudflare-tunnel-health.mjs";

function metrics(activeConnections: number) {
  const locations = Array.from({ length: activeConnections }, (_, index) =>
    `cloudflared_tunnel_server_locations{connection_id="${index}",edge_location="${index % 2 === 0 ? "icn01" : "icn05"}"} 1`
  );
  return [
    'cloudflared_build_info{version="2026.5.2"} 1',
    `cloudflared_tunnel_ha_connections ${activeConnections}`,
    ...locations,
  ].join("\n");
}

const initialConnections = [0, 1, 2, 3]
  .map((index) =>
    `2026-08-10T00:00:00.000Z INF Registered tunnel connection connIndex=${index} location=icn01 protocol=quic`
  ).join("\n");

describe("Cloudflare local connector health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "http://0.0.0.0:20241/metrics",
    "http://[::]:20241/metrics",
    "http://localhost:20241/metrics",
    "http://host.example:20241/metrics",
    "https://127.0.0.1:20241/metrics",
    "http://127.0.0.1:20240/metrics",
    "http://127.0.0.1:20246/metrics",
    "http://127.0.0.1:20241/private",
  ])("fails closed for a non-allowlisted metrics endpoint: %s", (endpoint) => {
    expect(() => validateMetricsEndpoint(endpoint)).toThrow(/loopback metrics endpoint/u);
  });

  it("accepts only the explicit 127.0.0.1 metrics port allowlist", () => {
    expect(validateMetricsEndpoint("http://127.0.0.1:20241/metrics"))
      .toBe("http://127.0.0.1:20241/metrics");
    expect(validateMetricsEndpoint("http://127.0.0.1:20245/metrics"))
      .toBe("http://127.0.0.1:20245/metrics");
  });

  it("distinguishes connector down, degraded over 60s, simultaneous disconnect, and slow reconnect", () => {
    const simultaneousLog = [
      initialConnections,
      ...[0, 1, 2, 3].map((index) =>
        `2026-08-10T00:01:00.000Z ERR connection closed connIndex=${index}`
      ),
      ...[0, 1, 2, 3].map((index) =>
        `2026-08-10T00:01:${index === 3 ? "16" : "05"}.000Z INF Registered tunnel connection connIndex=${index} location=icn01 protocol=quic`
      ),
      "authorization=Bearer raw-local-secret",
    ].join("\n");
    const recovered = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:02:00.000Z",
      metrics_raw: metrics(4),
      log_raw: simultaneousLog,
    });

    expect(recovered.connector.healthy_connections).toBe(4);
    expect(recovered.connector.connection_state).toBe("healthy");
    expect(recovered.signals.critical).toEqual([]);
    expect(recovered.signals.warning).toContain("reconnect_over_15s");
    expect(recovered.signals.diagnostic).toContain("simultaneous_disconnect");
    expect(recovered.reconnect_ms.p95).toBe(16_000);

    const degraded = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.001Z",
      metrics_raw: metrics(3),
      log_raw: `${initialConnections}\n2026-08-10T00:02:00.000Z ERR connection closed connIndex=3`,
    });
    expect(degraded.signals.warning).toContain("connector_below_4_over_60s");
    expect(degraded.connector.connection_state).toBe("degraded");
    expect(degraded.incident_events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "warning",
        status: "connector_degraded",
      }),
    ]));

    const down = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: metrics(0),
      log_raw: simultaneousLog,
    });
    expect(down.signals.critical).toContain("connector_down");
    expect(down.connector.connection_state).toBe("down");
    expect(down.state).toBe("critical");
  });

  it("fails closed for truncated, inconsistent, or out-of-range tunnel metrics", () => {
    const truncated = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: [
        'cloudflared_build_info{version="2026.5.2"} 1',
        "cloudflared_tunnel_ha_connections 4",
      ].join("\n"),
      log_raw: initialConnections,
    });
    const inconsistent = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: `${metrics(4)}\ncloudflared_tunnel_server_locations{connection_id="extra",edge_location="icn01"} 1`,
      log_raw: initialConnections,
    });
    const outOfRange = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: metrics(5),
      log_raw: initialConnections,
    });

    for (const health of [truncated, inconsistent, outOfRange]) {
      expect(health.connector.metrics_valid).toBe(false);
      expect(health.connector.connection_state).toBe("unknown");
      expect(health.state).toBe("unknown");
    }
  });

  it("excludes reconnect and disconnect incidents older than the explicit 24h window", () => {
    const staleLog = [
      initialConnections.replaceAll("2026-08-10", "2026-08-01"),
      ...[0, 1, 2, 3].map((index) =>
        `2026-08-01T00:01:00.000Z ERR connection closed connIndex=${index}`
      ),
      ...[0, 1, 2, 3].map((index) =>
        `2026-08-01T00:01:16.000Z INF Registered tunnel connection connIndex=${index} location=icn01 protocol=quic`
      ),
    ].join("\n");
    const health = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: metrics(4),
      log_raw: staleLog,
    });

    expect(health.reconnect_ms).toEqual({ count: 0, p50: null, p95: null, max: null });
    expect(health.signals.warning).not.toContain("reconnect_over_15s");
    expect(health.signals.diagnostic).not.toContain("simultaneous_disconnect");
    expect(health.incident_events).toEqual([]);
    expect(health.state).toBe("healthy");
  });

  it("includes recovered outages by recovered_at at the 24h boundary", () => {
    const log = [
      initialConnections.replaceAll("2026-08-10", "2026-08-08"),
      "2026-08-08T23:59:44.000Z ERR connection closed connIndex=3",
      "2026-08-09T00:00:00.000Z INF Registered tunnel connection connIndex=3 location=icn01 protocol=quic",
    ].join("\n");
    const health = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:00:00.000Z",
      metrics_raw: metrics(4),
      log_raw: log,
    });

    expect(health.reconnect_ms).toEqual({ count: 1, p50: 16_000, p95: 16_000, max: 16_000 });
    expect(health.signals.warning).toContain("reconnect_over_15s");
    expect(health.incident_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "reconnect_slow", timestamp: "2026-08-09T00:00:00.000Z" }),
    ]));
  });

  it("keeps an outage open across the cutoff and excludes future outage timestamps", () => {
    const openLog = [
      initialConnections.replaceAll("2026-08-10", "2026-08-08"),
      "2026-08-08T23:00:00.000Z ERR connection closed connIndex=3",
    ].join("\n");
    const openHealth = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:00:00.000Z",
      metrics_raw: metrics(3),
      log_raw: openLog,
    });
    expect(openHealth.degraded_duration_ms).toBe(90_000_000);
    expect(openHealth.signals.warning).toContain("connector_below_4_over_60s");

    const futureLog = [
      initialConnections,
      "2026-08-10T00:00:01.000Z ERR connection closed connIndex=3",
    ].join("\n");
    const futureHealth = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:00:00.000Z",
      metrics_raw: metrics(3),
      log_raw: futureLog,
    });
    expect(futureHealth.degraded_duration_ms).toBeNull();
    expect(futureHealth.signals.warning).not.toContain("connector_below_4_over_60s");
  });

  it("includes simultaneous disconnect at its completed_at cutoff boundary", () => {
    const log = [
      initialConnections.replaceAll("2026-08-10", "2026-08-08"),
      "2026-08-08T23:59:57.000Z ERR connection closed connIndex=0",
      "2026-08-08T23:59:58.000Z ERR connection closed connIndex=1",
      "2026-08-08T23:59:59.000Z ERR connection closed connIndex=2",
      "2026-08-09T00:00:00.000Z ERR connection closed connIndex=3",
      ...[0, 1, 2, 3].map((index) =>
        `2026-08-09T00:00:05.000Z INF Registered tunnel connection connIndex=${index} location=icn01 protocol=quic`
      ),
    ].join("\n");
    const health = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:00:00.000Z",
      metrics_raw: metrics(4),
      log_raw: log,
    });

    expect(health.signals.diagnostic).toContain("simultaneous_disconnect");
    expect(health.incident_events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "simultaneous_disconnect",
        timestamp: "2026-08-09T00:00:00.000Z",
      }),
    ]));
  });

  it("rejects duplicate or conflicting build, HA, and connection-location metrics", () => {
    const cases = [
      `${metrics(4)}\ncloudflared_build_info{version="2026.5.2"} 1`,
      `${metrics(4)}\ncloudflared_tunnel_ha_connections 0`,
      `${metrics(4)}\ncloudflared_tunnel_server_locations{connection_id="0",edge_location="icn01"} 1`,
      `${metrics(4)}\ncloudflared_tunnel_server_locations{connection_id="0",edge_location="lax01"} 1`,
    ];

    for (const metricsRaw of cases) {
      expect(parseTunnelMetrics(metricsRaw).success).toBe(false);
      expect(buildLocalConnectorHealth({
        captured_at: "2026-08-10T00:03:00.000Z",
        metrics_raw: metricsRaw,
        log_raw: initialConnections,
      })).toEqual(expect.objectContaining({
        state: "unknown",
        connector: expect.objectContaining({ metrics_valid: false }),
      }));
    }
  });

  it("never serializes raw metrics, logs, token, cookie, JWT, email, UUID, IP, path, header, or body", () => {
    const fixtures = [
      "raw-local-secret",
      "cookie-value",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature",
      "person@example.com",
      "123e4567-e89b-42d3-a456-426614174000",
      "203.0.113.42",
      "/Users/private/tunnel.log",
      "x-secret-header",
      "private-response-body",
    ];
    const health = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: `${metrics(4)}\n# ${fixtures.join(" ")}`,
      log_raw: `${initialConnections}\n${fixtures.join(" ")}`,
    });
    const serialized = JSON.stringify(health);

    for (const fixture of fixtures) expect(serialized).not.toContain(fixture);
    expect(Object.keys(health)).not.toContain("metrics_raw");
    expect(Object.keys(health)).not.toContain("log_raw");
  });

  it("runs as a read-only CLI with fixed env configuration and redacted failures", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runHealthCli([], {
      env: {
        CLOUDFLARE_TUNNEL_METRICS_ENDPOINT: "http://127.0.0.1:20241/metrics",
        CLOUDFLARE_TUNNEL_LOG_PATH: "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log",
      },
      now: () => new Date("2026-08-10T00:03:00.000Z"),
      readMetrics: async () => metrics(4),
      readLog: async () => `${initialConnections}\nresponse body raw-local-secret`,
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toEqual(expect.objectContaining({
      schema: "homecook.cloudflare-tunnel-health",
      state: "healthy",
    }));
    expect(`${stdout.join("")} ${stderr.join("")}`).not.toContain("raw-local-secret");

    const rejected = await runHealthCli(["--token", "must-not-escape"], {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    });
    expect(rejected).toBe(1);
    expect(stderr.at(-1)).toBe("cloudflare-tunnel-health: FAIL (redacted)\n");
    expect(stderr.join("")).not.toContain("must-not-escape");
  });

  it("uses redirect:error, verifies the final metrics URL, and reads the body as a bounded stream", async () => {
    const endpoint = "http://127.0.0.1:20241/metrics";
    const chunks = [new TextEncoder().encode(metrics(4))];
    let requestInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requestInit = init;
      return {
        ok: true,
        url: endpoint,
        body: {
          getReader: () => ({
            read: async () => ({ done: chunks.length === 0, value: chunks.shift() }),
            cancel: async () => undefined,
          }),
        },
      };
    }));
    const exitCode = await runHealthCli([], {
      env: {
        CLOUDFLARE_TUNNEL_METRICS_ENDPOINT: endpoint,
        CLOUDFLARE_TUNNEL_LOG_PATH: "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log",
      },
      now: () => new Date("2026-08-10T00:03:00.000Z"),
      readLog: async () => initialConnections,
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(requestInit).toEqual(expect.objectContaining({ redirect: "error" }));

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      url: "http://127.0.0.1:20242/metrics",
      text: async () => metrics(4),
    })));
    expect(await runHealthCli([], {
      env: {
        CLOUDFLARE_TUNNEL_METRICS_ENDPOINT: endpoint,
        CLOUDFLARE_TUNNEL_LOG_PATH: "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log",
      },
      readLog: async () => initialConnections,
      stdout: () => undefined,
      stderr: () => undefined,
    })).toBe(1);
  });

  it("cancels an oversized metrics stream before accepting the response", async () => {
    const endpoint = "http://127.0.0.1:20241/metrics";
    let reads = 0;
    let cancelled = false;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      url: endpoint,
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            return { done: false, value: new Uint8Array(600_000) };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    })));

    expect(await runHealthCli([], {
      env: {
        CLOUDFLARE_TUNNEL_METRICS_ENDPOINT: endpoint,
        CLOUDFLARE_TUNNEL_LOG_PATH: "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log",
      },
      readLog: async () => initialConnections,
      stdout: () => undefined,
      stderr: () => undefined,
    })).toBe(1);
    expect(reads).toBe(2);
    expect(cancelled).toBe(true);
  });

  it("rejects arbitrary absolute and symlink tunnel log paths", async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "cloudflare-health-log-"));
    const regularPath = path.join(fixtureRoot, "cloudflared.log");
    const symlinkPath = path.join(fixtureRoot, "cloudflared-link.log");
    writeFileSync(regularPath, initialConnections, "utf8");
    symlinkSync(regularPath, symlinkPath);

    for (const logPath of [regularPath, symlinkPath]) {
      expect(await runHealthCli([], {
        env: {
          CLOUDFLARE_TUNNEL_METRICS_ENDPOINT: "http://127.0.0.1:20241/metrics",
          CLOUDFLARE_TUNNEL_LOG_PATH: logPath,
        },
        readMetrics: async () => metrics(4),
        stdout: () => undefined,
        stderr: () => undefined,
      })).toBe(1);
    }
  });

  it("wires focused verification and a secret-free read-only package command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["verify:cloudflare-tunnel-health"]).toBe(
      "vitest run tests/cloudflare-tunnel-health.test.ts",
    );
    expect(packageJson.scripts["cloudflare:tunnel-health"]).toBe(
      "node scripts/cloudflare-tunnel-health.mjs",
    );
    expect(packageJson.scripts["cloudflare:tunnel-health"]).not.toMatch(/token|cookie|secret/iu);
  });
});
