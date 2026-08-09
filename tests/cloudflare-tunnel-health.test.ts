import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildLocalConnectorHealth,
  validateMetricsEndpoint,
} from "../scripts/lib/cloudflare-tunnel-health.mjs";
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

    const down = buildLocalConnectorHealth({
      captured_at: "2026-08-10T00:03:00.000Z",
      metrics_raw: metrics(0),
      log_raw: simultaneousLog,
    });
    expect(down.signals.critical).toContain("connector_down");
    expect(down.connector.connection_state).toBe("down");
    expect(down.state).toBe("critical");
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
        CLOUDFLARE_TUNNEL_LOG_PATH: "/fixture/cloudflared.log",
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
