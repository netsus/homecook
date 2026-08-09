import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import * as diagnosticsCli from "../scripts/cloudflare-tunnel-diagnostics.mjs";
import * as diagnosticsLogic from "../scripts/lib/cloudflare-tunnel-diagnostics.mjs";

import {
  aggregatePantrySamples,
  classifyPantrySample,
  parseCfRayHeaders,
  parseCloudflaredVersion,
  parseCurlTiming,
  parseLaunchctlPrint,
  parseTrace,
  parseTunnelLog,
  sanitizeForEvidence,
  summarizeProbeSamples,
  validateAnonymousNetworkLabel,
} from "../scripts/lib/cloudflare-tunnel-diagnostics.mjs";
import {
  captureCloudflareTunnelDiagnostics,
  runDiagnosticsCli,
  writeEvidenceFile,
} from "../scripts/cloudflare-tunnel-diagnostics.mjs";

const SECRET_MARKER = "FIXTURE_SECRET_MUST_NOT_ESCAPE";
const UUID_MARKER = "123e4567-e89b-42d3-a456-426614174000";
const EMAIL_MARKER = "owner@example.com";
const JWT_MARKER = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  "signature-part",
].join(".");

function traceFixture(colo = "ICN", ip = "203.0.113.77") {
  return [
    "fl=29f608",
    "h=app.mumeok.kr",
    `ip=${ip}`,
    `colo=${colo}`,
    `token=${SECRET_MARKER}`,
  ].join("\n");
}

function timingFixture(status = 200, totalSeconds = 0.25) {
  return JSON.stringify({
    http_code: status,
    time_connect: 0.02,
    time_starttransfer: 0.2,
    time_total: totalSeconds,
    remote_ip: "203.0.113.77",
    secret: SECRET_MARKER,
  });
}

function createHealthyRunner({
  appTraceIp = "203.0.113.77",
  authenticatedStatus = 200,
  baselineTraceIp = "203.0.113.77",
  capturedAt = "2026-08-09T10:00:00.000Z",
  cfRayMissing = false,
  latestDisconnectedIndex = null as number | null,
  launchState = "running",
  logAgeMs = 1_000,
  timingMissing = false,
} = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const logTimestamp = new Date(Date.parse(capturedAt) - logAgeMs).toISOString();
  const runner = async ({ command, args }: { command: string; args: string[] }) => {
    calls.push({ command, args });
    const target = args.at(-1) ?? "";
    if (command === "cloudflared") {
      return {
        exit_code: 0,
        stdout: "cloudflared version 2026.3.0",
        stderr: "",
        timed_out: false,
      };
    }
    if (command === "launchctl") {
      return {
        exit_code: 0,
        stdout: `state = ${launchState}\narguments = --protocol=quic`,
        stderr: "",
        timed_out: false,
      };
    }
    if (command === "tail") {
      const registered = [0, 1, 2, 3].map((connectionIndex) =>
        `${logTimestamp} INF Registered tunnel connection connIndex=${connectionIndex} location=icn01 protocol=quic`
      );
      if (latestDisconnectedIndex !== null) {
        registered.push(
          `${new Date(Date.parse(logTimestamp) + 1_000).toISOString()} ERR connection closed connIndex=${latestDisconnectedIndex}`,
        );
      }
      return {
        exit_code: 0,
        stdout: registered.join("\n"),
        stderr: "",
        timed_out: false,
      };
    }
    const cfRayHeader = cfRayMissing ? "" : "CF-RAY: safe-ray-ICN\r\n";
    const timing = timingMissing
      ? JSON.stringify({
        http_code: 200,
        time_connect: null,
        time_starttransfer: "",
        time_total: undefined,
      })
      : timingFixture();
    if (target.includes("/cdn-cgi/trace")) {
      const traceIp = target.startsWith("https://app.mumeok.kr")
        ? appTraceIp
        : baselineTraceIp;
      return {
        exit_code: 0,
        stdout: `HTTP/2 200\r\n${cfRayHeader}\r\n${traceFixture("ICN", traceIp)}\n__HC_TIMING__${timing}`,
        stderr: "",
        timed_out: false,
      };
    }
    const authenticated = target.endsWith("/api/v1/pantry");
    const correlationHeader = authenticated
      ? `X-Correlation-Id: ${UUID_MARKER}\r\n`
      : "";
    const status = authenticated ? authenticatedStatus : 200;
    const body = status === 409
      ? '{"error":{"code":"ACCOUNT_SESSION_STALE::409"}}'
      : "{}";
    return {
      exit_code: 0,
      stdout: `HTTP/2 ${status}\r\n${cfRayHeader}${correlationHeader}\r\n${body}\n__HC_TIMING__${timingFixture(status)}`,
      stderr: "",
      timed_out: false,
    };
  };
  return { calls, runner };
}

describe("Cloudflare tunnel diagnostics pure logic", () => {
  it("parses trace, CF-RAY, timing, version and launchctl into allowlisted values", () => {
    expect(parseTrace(traceFixture("ICN"))).toEqual({
      address_family: "ipv4",
      colo: "ICN",
      colo_state: "value",
    });
    expect(parseTrace("ip=2001:db8::1\ncolo=???")).toEqual({
      address_family: "ipv6",
      colo: null,
      colo_state: "unknown",
    });
    expect(parseTrace("fl=test")).toEqual({
      address_family: "unknown",
      colo: null,
      colo_state: "missing",
    });

    expect(parseCfRayHeaders(
      `HTTP/2 200\r\nCF-RAY: 8f00abcd1234-LAX\r\nSet-Cookie: ${SECRET_MARKER}\r\n`,
    )).toEqual({ present: true, colo: "LAX" });
    expect(parseCurlTiming(timingFixture(200, 0.321))).toEqual({
      http_status: 200,
      connect_ms: 20,
      ttfb_ms: 200,
      total_ms: 321,
      malformed: false,
    });
    expect(parseCloudflaredVersion(
      `cloudflared version 2026.3.0 (built ${EMAIL_MARKER}) ${SECRET_MARKER}`,
    )).toEqual({ version: "2026.3.0", available: true });
    expect(parseLaunchctlPrint(
      `state = running\narguments = --protocol=quic\npid = 123\nTOKEN=${SECRET_MARKER}\naddress=203.0.113.77`,
    )).toEqual({ loaded: true, state: "running", configured_protocol: "quic" });
  });

  it("treats malformed trace, timing, version and launchctl input as explicit safe states", () => {
    expect(parseTrace(null)).toEqual({
      address_family: "unknown",
      colo: null,
      colo_state: "missing",
    });
    expect(parseCurlTiming("not-json")).toEqual({
      http_status: null,
      connect_ms: null,
      ttfb_ms: null,
      total_ms: null,
      malformed: true,
    });
    expect(parseCloudflaredVersion("garbled")).toEqual({
      version: null,
      available: false,
    });
    expect(parseLaunchctlPrint("Could not find service")).toEqual({
      loaded: false,
      state: "not_found",
      configured_protocol: null,
    });
  });

  it("groups connIndex 0-3 disconnects into one outage and computes full recovery", () => {
    const log = [
      "2026-08-09T10:00:15.000Z INF Registered tunnel connection connIndex=3 location=icn06 protocol=quic",
      "malformed line that must be ignored",
      "2026-08-09T10:00:01.500Z ERR timeout: no recent network activity connIndex=2",
      "2026-08-09T10:00:00.000Z ERR timeout: no recent network activity connIndex=0",
      "2026-08-09T10:00:01.000Z ERR timeout: no recent network activity connIndex=1",
      "2026-08-09T10:00:02.000Z ERR timeout: no recent network activity connIndex=3",
      "2026-08-09T10:00:03.000Z INF Registered tunnel connection connIndex=0 location=icn01 protocol=quic",
      "2026-08-09T10:00:03.000Z INF Registered tunnel connection connIndex=0 location=lax01 protocol=quic duplicate=true",
      "2026-08-09T10:00:14.000Z INF Registered tunnel connection connIndex=1 location=icn05 protocol=quic",
      "2026-08-09T10:00:14.500Z INF Registered tunnel connection connIndex=2 location=icn01 protocol=quic",
      `cookie=${SECRET_MARKER}; email=${EMAIL_MARKER}; id=${UUID_MARKER}`,
    ].join("\n");

    const parsed = parseTunnelLog(log);

    expect(parsed.malformed_line_count).toBe(2);
    expect(parsed.outages).toEqual([
      {
        disconnected_connection_indexes: [0, 1, 2, 3],
        disconnect_started_at: "2026-08-09T10:00:00.000Z",
        disconnect_completed_at: "2026-08-09T10:00:02.000Z",
        simultaneous_full_outage: true,
        recovered_at: "2026-08-09T10:00:15.000Z",
        recovery_ms: 15_000,
        reconnect_missing_indexes: [],
        tunnel_colo_state: "single",
        tunnel_colos: ["ICN"],
        tunnel_protocols: ["quic"],
      },
    ]);
    expect(parsed.connection_health).toEqual({
      healthy_connection_count: 4,
      healthy_connection_indexes: [0, 1, 2, 3],
      unhealthy_connection_indexes: [],
      unknown_connection_indexes: [],
    });
    expect(parsed.observed_protocols).toEqual(["quic"]);
    expect(JSON.stringify(parsed)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(parsed)).not.toContain(EMAIL_MARKER);
    expect(JSON.stringify(parsed)).not.toContain(UUID_MARKER);
  });

  it("does not misclassify partial or unrecovered groups and distinguishes mixed/missing colo", () => {
    const log = [
      "2026-08-09T10:00:00.000Z ERR connection closed connIndex=0",
      "2026-08-09T10:00:01.000Z ERR connection closed connIndex=1",
      "2026-08-09T10:00:03.000Z INF Registered tunnel connection connIndex=0 location=icn01 protocol=quic",
      "2026-08-09T10:00:04.000Z INF Registered tunnel connection connIndex=1 location=lax02 protocol=http2",
      "2026-08-09T10:01:00.000Z ERR timeout: no recent network activity connIndex=2",
    ].join("\n");

    const parsed = parseTunnelLog(log);

    expect(parsed.outages).toEqual([
      expect.objectContaining({
        disconnected_connection_indexes: [0, 1],
        simultaneous_full_outage: false,
        recovery_ms: 4_000,
        tunnel_colo_state: "mixed",
        tunnel_colos: ["ICN", "LAX"],
        tunnel_protocols: ["http2", "quic"],
      }),
      expect.objectContaining({
        disconnected_connection_indexes: [2],
        simultaneous_full_outage: false,
        recovered_at: null,
        recovery_ms: null,
        reconnect_missing_indexes: [2],
        tunnel_colo_state: "missing",
        tunnel_colos: [],
        tunnel_protocols: [],
      }),
    ]);
    expect(parsed.connection_health).toEqual({
      healthy_connection_count: 2,
      healthy_connection_indexes: [0, 1],
      unhealthy_connection_indexes: [2],
      unknown_connection_indexes: [3],
    });
    expect(parsed.observed_protocols).toEqual(["http2", "quic"]);
  });

  it("tracks connection generations and does not invent a full outage from sequential recovery", () => {
    const log = [0, 1, 2, 3].flatMap((connectionIndex) => [
      `2026-08-09T10:00:0${connectionIndex}.000Z ERR connection closed connIndex=${connectionIndex}`,
      `2026-08-09T10:00:0${connectionIndex}.500Z INF Registered tunnel connection connIndex=${connectionIndex} location=icn01 protocol=quic`,
    ]).join("\n");

    const parsed = parseTunnelLog(log);

    expect(parsed.outages).toHaveLength(4);
    expect(parsed.outages.every(({ simultaneous_full_outage }) =>
      simultaneous_full_outage === false
    )).toBe(true);
    expect(parsed.outages.every(({ reconnect_missing_indexes }) =>
      reconnect_missing_indexes.length === 0
    )).toBe(true);
    expect(parsed.connection_health).toEqual(expect.objectContaining({
      healthy_connection_count: 4,
      healthy_connection_indexes: [0, 1, 2, 3],
    }));
  });

  it("uses explicit scheduled/recorded/failure denominators and nearest-rank percentiles", () => {
    expect(summarizeProbeSamples([
      { success: true, total_ms: 100 },
      { success: false, total_ms: null },
      { success: true, total_ms: 200 },
      { success: true, total_ms: 1_000 },
    ], { expected_count: 5, minimum_latency_samples: 4 })).toEqual({
      scheduled: 5,
      recorded: 4,
      missing: 1,
      completeness: 0.8,
      successes: 3,
      recorded_failures: 1,
      failures_including_missing: 2,
      latency_sample_count: 3,
      latency_samples_complete: false,
      latency_ms: { p50: 200, p95: 1_000, max: 1_000 },
    });
  });

  it("does not coerce absent or empty timing values to zero milliseconds", () => {
    expect(parseCurlTiming(JSON.stringify({
      http_code: 200,
      time_connect: null,
      time_starttransfer: "",
    }))).toEqual({
      http_status: 200,
      connect_ms: null,
      ttfb_ms: null,
      total_ms: null,
      malformed: false,
    });
    expect(summarizeProbeSamples([
      { success: true, total_ms: null },
      { success: true, total_ms: undefined },
      { success: true, total_ms: "" },
    ], { expected_count: 3, minimum_latency_samples: 3 })).toEqual(expect.objectContaining({
      recorded: 3,
      latency_sample_count: 0,
      latency_samples_complete: false,
      latency_ms: { p50: null, p95: null, max: null },
    }));
    expect(aggregatePantrySamples([
      { timed_out: true, http_status: null, total_ms: null },
    ]).by_outcome.transport_timeout_or_52x).toEqual(expect.objectContaining({
      attempted: 1,
      latency_sample_count: 0,
      latency_ms: { p50: null, p95: null, max: null },
    }));
  });

  it("separates pantry transport/52x, auth 409, success and other failures without dropping attempts", () => {
    const rawSamples = [
      { timed_out: true, http_status: null, total_ms: 10_000, error: SECRET_MARKER },
      { transport_error: true, timed_out: false, http_status: null, total_ms: 300 },
      { timed_out: false, http_status: 522, total_ms: 500 },
      {
        timed_out: false,
        http_status: 409,
        total_ms: 120,
        error_code: "ACCOUNT_SESSION_STALE::409",
        correlation_id_hash: `hmac-sha256:${"a".repeat(64)}`,
      },
      { timed_out: false, http_status: 200, total_ms: 80 },
      { timed_out: false, http_status: 500, total_ms: 90, error: EMAIL_MARKER },
    ];

    expect(rawSamples.map(classifyPantrySample)).toEqual([
      "transport_timeout_or_52x",
      "transport_timeout_or_52x",
      "transport_timeout_or_52x",
      "app_auth_409",
      "success",
      "other_failure",
    ]);

    const aggregate = aggregatePantrySamples(rawSamples);
    expect(aggregate.attempted).toBe(6);
    expect(aggregate.by_outcome.transport_timeout_or_52x).toEqual({
      attempted: 3,
      successes: 0,
      failures: 3,
      latency_sample_count: 3,
      latency_ms: { p50: 500, p95: 10_000, max: 10_000 },
    });
    expect(aggregate.by_outcome.app_auth_409).toEqual(expect.objectContaining({
      attempted: 1,
      successes: 0,
      failures: 1,
    }));
    expect(aggregate.by_outcome.success).toEqual(expect.objectContaining({
      attempted: 1,
      successes: 1,
      failures: 0,
    }));
    expect(aggregate.by_outcome.other_failure).toEqual(expect.objectContaining({
      attempted: 1,
      successes: 0,
      failures: 1,
    }));
    expect(aggregate.samples).toHaveLength(6);
    expect(aggregate.samples[3]).toEqual(expect.objectContaining({
      outcome: "app_auth_409",
      error_code: "ACCOUNT_SESSION_STALE",
      correlation_id_present: true,
    }));
    expect(JSON.stringify(aggregate)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(aggregate)).not.toContain(UUID_MARKER);
    expect(JSON.stringify(aggregate)).not.toContain(EMAIL_MARKER);
  });

  it("redacts token, cookie, JWT, email, UUID and full IP recursively", () => {
    const sanitized = sanitizeForEvidence({
      authorization: `Bearer ${SECRET_MARKER}`,
      cookie: `session=${SECRET_MARKER}`,
      jwt: JWT_MARKER,
      email: EMAIL_MARKER,
      uuid: UUID_MARKER,
      uuid_v7: "019fe600-b897-7bd1-bb7b-e6e8282990dc",
      ipv4: "203.0.113.77",
      ipv6: "2001:db8:1234:5678::1",
      ipv6_loopback: "::1",
      nested: [
        `token=${SECRET_MARKER}`,
        "Authorization: Bearer opaque-token-value",
      ],
    }, { secret_markers: [SECRET_MARKER] });
    const serialized = JSON.stringify(sanitized);

    for (const forbidden of [
      SECRET_MARKER,
      JWT_MARKER,
      EMAIL_MARKER,
      UUID_MARKER,
      "019fe600-b897-7bd1-bb7b-e6e8282990dc",
      "203.0.113.77",
      "2001:db8:1234:5678::1",
      "::1",
      "opaque-token-value",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("accepts only short anonymous Wi-Fi/LTE/5G labels", () => {
    expect(validateAnonymousNetworkLabel("wifi-01")).toBe("wifi-01");
    expect(validateAnonymousNetworkLabel("lte-a")).toBe("lte-a");
    expect(validateAnonymousNetworkLabel("5g-02")).toBe("5g-02");
    expect(() => validateAnonymousNetworkLabel("My Home Wi-Fi")).toThrow(/anonymous/u);
    expect(() => validateAnonymousNetworkLabel(EMAIL_MARKER)).toThrow(/anonymous/u);
    expect(() => validateAnonymousNetworkLabel("wifi-my-real-network-name")).toThrow(/anonymous/u);
  });

  it("keeps the parser module free of external I/O", () => {
    const source = readFileSync("scripts/lib/cloudflare-tunnel-diagnostics.mjs", "utf8");

    expect(source).not.toMatch(/node:(?:child_process|fs|http|https|net|tls)/u);
    expect(source).not.toMatch(/\bfetch\s*\(/u);
  });
});

describe("Cloudflare tunnel diagnostics read-only CLI", () => {
  it("rejects non-canonical probe origins before invoking the runner", async () => {
    let invoked = false;

    await expect(captureCloudflareTunnelDiagnostics({
      address_family: "ipv4",
      app_origin: "https://attacker.example",
      captured_at: "2026-08-09T10:00:00.000Z",
      network_label: "wifi-01",
      samples: 1,
    }, {
      runner: async () => {
        invoked = true;
        return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
      },
    })).rejects.toThrow(/canonical app origin/u);
    expect(invoked).toBe(false);
  });

  it("collects through an injectable runner, preserves failures, and emits no fixture secret", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    let pantryPublicCall = 0;
    const runner = async ({ command, args }: { command: string; args: string[] }) => {
      calls.push({ command, args });
      const target = args.at(-1) ?? "";

      if (command === "cloudflared") {
        return {
          exit_code: 0,
          stdout: `cloudflared version 2026.3.0 ${SECRET_MARKER}`,
          stderr: `token=${SECRET_MARKER}`,
          timed_out: false,
        };
      }
      if (command === "launchctl") {
        return {
          exit_code: 0,
          stdout: `state = running\nTOKEN=${SECRET_MARKER}\nuser=${EMAIL_MARKER}`,
          stderr: "",
          timed_out: false,
        };
      }
      if (command === "tail") {
        return {
          exit_code: 0,
          stdout: [
            "2026-08-09T10:00:00.000Z ERR connection closed connIndex=0",
            "2026-08-09T10:00:01.000Z INF Registered tunnel connection connIndex=0 location=icn01",
            `cookie=${SECRET_MARKER}`,
          ].join("\n"),
          stderr: "",
          timed_out: false,
        };
      }
      if (target.includes("/cdn-cgi/trace")) {
        return {
          exit_code: 0,
          stdout: `HTTP/2 200\r\nCF-RAY: ray-secret-ICN\r\n\r\n${traceFixture()}\n__HC_TIMING__${timingFixture()}`,
          stderr: `cookie=${SECRET_MARKER}`,
          timed_out: false,
        };
      }
      if (target === "https://app.mumeok.kr/pantry") {
        pantryPublicCall += 1;
        if (pantryPublicCall === 2) {
          return {
            exit_code: 28,
            stdout: "",
            stderr: `curl timeout ${SECRET_MARKER} 203.0.113.77`,
            timed_out: true,
          };
        }
      }
      if (target === "https://app.mumeok.kr/api/v1/pantry") {
        return {
          exit_code: 0,
          stdout: `HTTP/2 409\r\nCF-RAY: ray-secret-LAX\r\nX-Correlation-Id: ${UUID_MARKER}\r\n\r\n{\"error\":{\"code\":\"ACCOUNT_SESSION_STALE::409\",\"message\":\"${EMAIL_MARKER}\"}}\n__HC_TIMING__${timingFixture(409, 0.12)}`,
          stderr: "",
          timed_out: false,
        };
      }
      return {
        exit_code: 0,
        stdout: `HTTP/2 200\r\nCF-RAY: ray-secret-ICN\r\n\r\n__HC_TIMING__${timingFixture()}`,
        stderr: "",
        timed_out: false,
      };
    };

    const evidence = await captureCloudflareTunnelDiagnostics({
      address_family: "ipv4",
      authenticated_pantry_cookie_file: "/tmp/homecook-test-cookie",
      app_auth_issue_id: "APP-AUTH-42",
      captured_at: "2026-08-09T10:00:00.000Z",
      network_label: "wifi-01",
      samples: 2,
    }, { hmac_key: Buffer.alloc(32, 7), runner });
    const serialized = JSON.stringify(evidence);

    expect(evidence.schema_version).toBe(1);
    expect(evidence.network).toEqual({ label: "wifi-01", address_family: "ipv4" });
    expect(evidence.probes.public_pantry.samples).toHaveLength(2);
    expect(evidence.probes.public_pantry.samples[1]).toEqual(expect.objectContaining({
      success: false,
      timed_out: true,
      http_status: null,
    }));
    expect(evidence.probes.authenticated_pantry.attempted).toBe(2);
    expect(evidence.probes.authenticated_pantry.by_outcome.app_auth_409.attempted).toBe(2);
    expect(evidence.probes.authenticated_pantry.samples[0]).toEqual(expect.objectContaining({
      error_code: "ACCOUNT_SESSION_STALE",
      correlation_id_present: true,
      correlation_id_hash: expect.stringMatching(/^hmac-sha256:[a-f0-9]{64}$/u),
    }));
    expect(evidence.probes.authenticated_pantry.app_auth_issue_id).toBe("APP-AUTH-42");
    expect(evidence.probes.authenticated_pantry.app_auth_issue_linkage_state).toBe("linked");
    expect(serialized.match(new RegExp(SECRET_MARKER, "gu")) ?? []).toHaveLength(0);
    expect(serialized).not.toContain(EMAIL_MARKER);
    expect(serialized).not.toContain(UUID_MARKER);
    expect(serialized).not.toContain("203.0.113.77");

    expect(calls).toContainEqual({ command: "cloudflared", args: ["--version"] });
    expect(calls.some(({ command, args }) =>
      command === "launchctl" && args[0] === "print"
    )).toBe(true);
    expect(calls.some(({ command, args }) =>
      command === "tail" && args[0] === "-n"
    )).toBe(true);
    const commandTranscript = calls
      .map(({ command, args }) => `${command} ${args.join(" ")}`)
      .join("\n");
    expect(commandTranscript).not.toMatch(
      /\b(?:restart|kickstart|bootout|bootstrap|load|unload|delete|update|route|dns)\b/iu,
    );
    expect(commandTranscript).not.toContain(SECRET_MARKER);
  });

  it("fails closed unless connector, probes, timing and authenticated denominators are complete", async () => {
    const capturedAt = "2026-08-09T10:00:00.000Z";
    const healthy = createHealthyRunner({ capturedAt });
    const baseOptions = {
      address_family: "ipv4",
      authenticated_pantry_cookie_file: "/tmp/homecook-test-cookie",
      captured_at: capturedAt,
      network_label: "wifi-01",
      samples: 30,
    };
    const goodEvidence = await captureCloudflareTunnelDiagnostics(
      baseOptions,
      { hmac_key: Buffer.alloc(32, 1), runner: healthy.runner },
    );
    expect(goodEvidence.success).toBe(true);
    const cliHealthy = createHealthyRunner({ capturedAt });
    expect(await runDiagnosticsCli([
      "--network-label", "wifi-01",
      "--address-family", "ipv4",
      "--samples", "30",
      "--authenticated-pantry-cookie-file", "/tmp/homecook-test-cookie",
      "--output", "/tmp/cloudflare-diagnostics-success.json",
    ], {
      now: () => new Date(capturedAt),
      runner: cliHealthy.runner,
      stdout: () => {},
      stderr: () => {},
      writeEvidence: async () => {},
    })).toBe(0);

    const exited = createHealthyRunner({ capturedAt, launchState: "exited" });
    const longLived = createHealthyRunner({ capturedAt, logAgeMs: 10 * 60_000 });
    const disconnected = createHealthyRunner({ capturedAt, latestDisconnectedIndex: 2 });
    const noCfRay = createHealthyRunner({ capturedAt, cfRayMissing: true });
    const noTiming = createHealthyRunner({ capturedAt, timingMissing: true });
    const [exitedEvidence, longLivedEvidence, disconnectedEvidence, noAuthEvidence, shortEvidence, noCfRayEvidence, noTimingEvidence] =
      await Promise.all([
        captureCloudflareTunnelDiagnostics(baseOptions, { runner: exited.runner }),
        captureCloudflareTunnelDiagnostics(baseOptions, { runner: longLived.runner }),
        captureCloudflareTunnelDiagnostics(baseOptions, { runner: disconnected.runner }),
        captureCloudflareTunnelDiagnostics({
          ...baseOptions,
          authenticated_pantry_cookie_file: null,
        }, { runner: createHealthyRunner({ capturedAt }).runner }),
        captureCloudflareTunnelDiagnostics({
          ...baseOptions,
          samples: 29,
        }, { runner: createHealthyRunner({ capturedAt }).runner }),
        captureCloudflareTunnelDiagnostics(baseOptions, { runner: noCfRay.runner }),
        captureCloudflareTunnelDiagnostics(baseOptions, { runner: noTiming.runner }),
      ]);

    expect(longLivedEvidence.success).toBe(true);
    expect(longLivedEvidence.connector.tunnel_log.latest_connection_event_age_ms)
      .toEqual({ "0": 600_000, "1": 600_000, "2": 600_000, "3": 600_000 });
    expect(disconnectedEvidence.connector.tunnel_log.connection_health)
      .toEqual(expect.objectContaining({ unhealthy_connection_indexes: [2] }));

    for (const evidence of [
      exitedEvidence,
      disconnectedEvidence,
      noAuthEvidence,
      shortEvidence,
      noCfRayEvidence,
      noTimingEvidence,
    ]) {
      expect(evidence.success).toBe(false);
    }
  });

  it("requires app and baseline trace address families to match the requested family", async () => {
    const capturedAt = "2026-08-09T10:00:00.000Z";
    const baseOptions = {
      authenticated_pantry_cookie_file: "/tmp/homecook-test-cookie",
      captured_at: capturedAt,
      network_label: "wifi-01",
      samples: 30,
    };
    const ipv6WithIpv4Trace = createHealthyRunner({ capturedAt });
    const unknownAppTrace = createHealthyRunner({ capturedAt, appTraceIp: "" });
    const baselineMismatch = createHealthyRunner({
      baselineTraceIp: "2001:db8::1",
      capturedAt,
    });

    const [ipv6Mismatch, unknown, baseline] = await Promise.all([
      captureCloudflareTunnelDiagnostics({
        ...baseOptions,
        address_family: "ipv6",
      }, { runner: ipv6WithIpv4Trace.runner }),
      captureCloudflareTunnelDiagnostics({
        ...baseOptions,
        address_family: "ipv4",
      }, { runner: unknownAppTrace.runner }),
      captureCloudflareTunnelDiagnostics({
        ...baseOptions,
        address_family: "ipv4",
      }, { runner: baselineMismatch.runner }),
    ]);

    expect(ipv6Mismatch.success).toBe(false);
    expect(ipv6Mismatch.probes.app_trace.samples[0]?.success).toBe(false);
    expect(ipv6Mismatch.probes.app_trace.address_family.complete).toBe(false);
    expect(ipv6Mismatch.probes.app_trace.samples[0]?.trace.address_family).toBe("ipv4");
    expect(unknown.success).toBe(false);
    expect(unknown.probes.app_trace.address_family.complete).toBe(false);
    expect(unknown.probes.app_trace.samples[0]?.trace.address_family).toBe("unknown");
    expect(baseline.success).toBe(false);
    expect(baseline.probes.cloudflare_baseline_trace.address_family.complete).toBe(false);
    expect(baseline.probes.cloudflare_baseline_trace.samples[0]?.trace.address_family)
      .toBe("ipv6");
  });

  it("requires explicit issue linkage when authenticated pantry returns 409", async () => {
    const capturedAt = "2026-08-09T10:00:00.000Z";
    const auth409 = createHealthyRunner({ authenticatedStatus: 409, capturedAt });
    const options = {
      address_family: "ipv4",
      authenticated_pantry_cookie_file: "/tmp/homecook-test-cookie",
      captured_at: capturedAt,
      network_label: "wifi-01",
      samples: 30,
    };
    const evidence = await captureCloudflareTunnelDiagnostics(options, {
      runner: auth409.runner,
    });

    expect(evidence.success).toBe(false);
    expect(evidence.probes.authenticated_pantry).toEqual(expect.objectContaining({
      app_auth_issue_id: null,
      app_auth_issue_linkage_state: "app_auth_issue_linkage_required",
    }));

    const writes: unknown[] = [];
    const cli409 = createHealthyRunner({ authenticatedStatus: 409, capturedAt });
    const exitCode = await runDiagnosticsCli([
      "--network-label", "wifi-01",
      "--address-family", "ipv4",
      "--samples", "30",
      "--authenticated-pantry-cookie-file", "/tmp/homecook-test-cookie",
      "--output", "/tmp/cloudflare-diagnostics-409.json",
    ], {
      now: () => new Date(capturedAt),
      runner: cli409.runner,
      stdout: () => {},
      stderr: () => {},
      writeEvidence: async (_outputPath: string, value: unknown) => writes.push(value),
    });
    expect(exitCode).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expect.objectContaining({ success: false }));
  });

  it("creates a new immutable app/auth linkage artifact without rewriting source evidence", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cloudflare-linkage-"));
    const evidencePath = path.join(root, "capture.json");
    const outputPath = path.join(root, "linkage.json");
    const missingIdOutput = path.join(root, "missing-id.json");
    const missingEvidenceOutput = path.join(root, "missing-evidence.json");
    const directoryEvidenceOutput = path.join(root, "directory-evidence.json");
    const repoInputOutput = path.join(root, "repo-input.json");
    const source = `${JSON.stringify({
      schema_version: 1,
      probes: {
        authenticated_pantry: {
          app_auth_issue_linkage_state: "app_auth_issue_linkage_required",
          by_outcome: { app_auth_409: { attempted: 1 } },
        },
      },
      ignored_secret: SECRET_MARKER,
      ignored_correlation_id: UUID_MARKER,
    })}\n`;
    writeFileSync(evidencePath, source, { encoding: "utf8", mode: 0o600 });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let runnerInvoked = false;
    const dependencies = {
      now: () => new Date("2026-08-09T11:00:00.000Z"),
      runner: async () => {
        runnerInvoked = true;
        return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
      },
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    };

    const exitCode = await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", evidencePath,
      "--app-auth-issue-id", "APP-AUTH-77",
      "--output", outputPath,
    ], dependencies);
    expect(exitCode).toBe(0);
    expect(runnerInvoked).toBe(false);
    expect(readFileSync(evidencePath, "utf8")).toBe(source);
    const linkage = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;
    expect(linkage).toEqual({
      schema_version: 1,
      artifact_type: "cloudflare_tunnel_app_auth_issue_linkage",
      created_at: "2026-08-09T11:00:00.000Z",
      source_evidence_sha256: `sha256:${createHash("sha256").update(source).digest("hex")}`,
      app_auth_issue_id: "APP-AUTH-77",
    });
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", evidencePath,
      "--app-auth-issue-id", "APP-AUTH-77",
      "--output", outputPath,
    ], dependencies)).toBe(1);
    expect(await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", evidencePath,
      "--output", missingIdOutput,
    ], dependencies)).toBe(1);
    expect(existsSync(missingIdOutput)).toBe(false);
    expect(await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", path.join(root, "does-not-exist.json"),
      "--app-auth-issue-id", "APP-AUTH-77",
      "--output", missingEvidenceOutput,
    ], dependencies)).toBe(1);
    expect(existsSync(missingEvidenceOutput)).toBe(false);
    expect(await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", root,
      "--app-auth-issue-id", "APP-AUTH-77",
      "--output", directoryEvidenceOutput,
    ], dependencies)).toBe(1);
    expect(existsSync(directoryEvidenceOutput)).toBe(false);
    expect(await runDiagnosticsCli([
      "link-app-auth-issue",
      "--evidence", path.join(process.cwd(), "package.json"),
      "--app-auth-issue-id", "APP-AUTH-77",
      "--output", repoInputOutput,
    ], dependencies)).toBe(1);
    expect(existsSync(repoInputOutput)).toBe(false);
    expect(readFileSync(evidencePath, "utf8")).toBe(source);
    const allOutput = [...stdout, ...stderr, JSON.stringify(linkage)].join("\n");
    expect(allOutput).not.toContain(SECRET_MARKER);
    expect(allOutput).not.toContain(UUID_MARKER);
  });

  it("enforces exact read-only process arguments and disables hostile curl configuration", async () => {
    const healthy = createHealthyRunner();
    await captureCloudflareTunnelDiagnostics({
      address_family: "ipv4",
      authenticated_pantry_cookie_file: "/tmp/homecook-test-cookie",
      captured_at: "2026-08-09T10:00:00.000Z",
      network_label: "wifi-01",
      samples: 1,
    }, { runner: healthy.runner });
    const curlCalls = healthy.calls.filter(({ command }) => command === "curl");
    expect(curlCalls.length).toBeGreaterThan(0);
    for (const { args } of curlCalls) {
      expect(args[0]).toBe("--disable");
      expect(args).toContain("--request");
      expect(args[args.indexOf("--request") + 1]).toBe("GET");
    }

    const runReadOnlyCommand = diagnosticsCli.runReadOnlyCommand as unknown as (
      runner: unknown,
      command: string,
      args: string[],
    ) => Promise<unknown>;
    let invoked = false;
    await expect(runReadOnlyCommand(async () => {
      invoked = true;
      return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
    }, "launchctl", ["kickstart", "gui/501/com.homecook.cloudflare-tunnel"]))
      .rejects.toThrow(/read-only command allowlist/u);
    await expect(runReadOnlyCommand(async () => {
      invoked = true;
      return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
    }, "curl", [
      "--disable",
      "--request",
      "POST",
      "https://app.mumeok.kr/api/v1/pantry",
    ])).rejects.toThrow(/read-only command allowlist/u);
    await expect(runReadOnlyCommand(async () => {
      invoked = true;
      return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
    }, "curl", ["--config", "/tmp/hostile.curlrc", "https://app.mumeok.kr/cdn-cgi/trace"]))
      .rejects.toThrow(/read-only command allowlist/u);
    expect(invoked).toBe(false);
  });

  it("forces a timed-out allowlisted child from TERM to KILL", async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
      child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
      child.kill = vi.fn();
      const spawnProcess = vi.fn(() => child);
      const createCommandRunner = diagnosticsCli.createCommandRunner as unknown as (
        dependencies: { spawnProcess: typeof spawnProcess; killGraceMs: number },
      ) => (input: { command: string; args: string[]; timeout_ms: number }) => Promise<unknown>;
      const runner = createCommandRunner({ spawnProcess, killGraceMs: 5 });
      const pending = runner({ command: "cloudflared", args: ["--version"], timeout_ms: 10 });

      await vi.advanceTimersByTimeAsync(10);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
      await vi.advanceTimersByTimeAsync(5);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      child.emit("close", null);
      await expect(pending).resolves.toEqual(expect.objectContaining({ timed_out: true }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a fixed repository root when cwd is outside the checkout", async () => {
    const repositoryRoot = process.cwd();
    const outsideCwd = mkdtempSync(path.join(tmpdir(), "cloudflare-diagnostics-cwd-"));
    let invoked = false;
    process.chdir(outsideCwd);
    try {
      const exitCode = await runDiagnosticsCli([
        "--network-label", "wifi-01",
        "--address-family", "ipv4",
        "--samples", "30",
        "--output", path.join(repositoryRoot, ".phase0-evidence", "evidence.json"),
      ], {
        runner: async () => {
          invoked = true;
          return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
        },
        stdout: () => {},
        stderr: () => {},
        writeEvidence: async () => {},
      });
      expect(exitCode).toBe(1);
      expect(invoked).toBe(false);
    } finally {
      process.chdir(repositoryRoot);
    }
  });

  it("hashes correlation IDs per run and validates app/auth issue IDs", () => {
    const createHasher = diagnosticsCli.createRunScopedCorrelationHasher as unknown as (
      key: Buffer,
    ) => (value: string) => string;
    const hashA = createHasher(Buffer.alloc(32, 1))(UUID_MARKER);
    const hashB = createHasher(Buffer.alloc(32, 2))(UUID_MARKER);
    expect(hashA).toMatch(/^hmac-sha256:[a-f0-9]{64}$/u);
    expect(hashB).toMatch(/^hmac-sha256:[a-f0-9]{64}$/u);
    expect(hashA).not.toBe(hashB);
    expect(hashA).not.toContain(UUID_MARKER);

    const validateAppAuthIssueId = diagnosticsLogic.validateAppAuthIssueId as unknown as (
      value: unknown,
    ) => string | null;
    expect(validateAppAuthIssueId("APP-AUTH-42")).toBe("APP-AUTH-42");
    expect(validateAppAuthIssueId(null)).toBeNull();
    expect(() => validateAppAuthIssueId(`APP-AUTH-${SECRET_MARKER}`)).toThrow(/issue ID/u);
    expect(() => validateAppAuthIssueId("https://tracker.example/42")).toThrow(/issue ID/u);
  });

  it("redacts stdout/stderr/evidence on CLI failure and wires the focused package command", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writes: Array<{ outputPath: string; content: string }> = [];

    const exitCode = await runDiagnosticsCli([
      "--network-label", "wifi-01",
      "--address-family", "ipv4",
      "--samples", "30",
      "--output", "/tmp/cloudflare-diagnostics.json",
    ], {
      runner: async () => ({
        exit_code: 1,
        stdout: SECRET_MARKER,
        stderr: `Bearer ${JWT_MARKER} ${EMAIL_MARKER} ${UUID_MARKER} 203.0.113.77`,
        timed_out: false,
      }),
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
      writeEvidence: async (outputPath: string, evidence: unknown) => {
        writes.push({ outputPath, content: JSON.stringify(evidence) });
      },
      now: () => new Date("2026-08-09T10:00:00.000Z"),
    });
    const allOutput = [...stdout, ...stderr, ...writes.map(({ content }) => content)].join("\n");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(exitCode).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toContain('"success":false');
    for (const forbidden of [
      SECRET_MARKER,
      JWT_MARKER,
      EMAIL_MARKER,
      UUID_MARKER,
      "203.0.113.77",
    ]) {
      expect(allOutput).not.toContain(forbidden);
    }
    expect(packageJson.scripts["verify:cloudflare-tunnel-diagnostics"]).toBe(
      "vitest run tests/cloudflare-tunnel-diagnostics.test.ts",
    );
  });

  it("keeps top-level argument failures redacted without running collection", () => {
    const result = spawnSync(process.execPath, [
      "scripts/cloudflare-tunnel-diagnostics.mjs",
      `--unknown=${SECRET_MARKER}`,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cloudflare-tunnel-diagnostics: FAIL (redacted)\n");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET_MARKER);
  });

  it("rejects operational CLI runs with fewer than 30 samples", async () => {
    let invoked = false;
    const exitCode = await runDiagnosticsCli([
      "--network-label", "lte-01",
      "--address-family", "ipv4",
      "--samples", "29",
      "--output", "/tmp/private-cloudflare-diagnostics/evidence.json",
    ], {
      runner: async () => {
        invoked = true;
        return { exit_code: 0, stdout: "", stderr: "", timed_out: false };
      },
      stdout: () => {},
      stderr: () => {},
      writeEvidence: async () => {},
    });

    expect(exitCode).toBe(1);
    expect(invoked).toBe(false);
  });

  it("writes evidence only as a new 0600 file under a 0700 directory", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cloudflare-diagnostics-"));
    const outputPath = path.join(root, "private", "evidence.json");
    await writeEvidenceFile(outputPath, { schema_version: 1, success: true });

    expect(statSync(path.dirname(outputPath)).mode & 0o777).toBe(0o700);
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    await expect(writeEvidenceFile(outputPath, { schema_version: 1, success: true }))
      .rejects.toThrow();
  });
});
