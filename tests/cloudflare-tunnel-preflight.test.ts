import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPreflightEvidence,
  classifyManagementMode,
  evaluateReleaseGate,
  parseCloudflaredArguments,
  parseDnsOutput,
  redactArguments,
} from "../scripts/lib/cloudflare-tunnel-preflight.mjs";
import {
  CHECK_INVOCATIONS,
  collectCloudflareTunnelPreflight,
  createTcpInvocation,
  createPreflightRunner,
  parseKernProcArgs2,
  runAllowedPreflightCommand,
  runPreflightCli,
  writePreflightEvidence,
  SYSTEM_TOOLS,
} from "../scripts/cloudflare-tunnel-preflight.mjs";

const createdRoots: string[] = [];
const SECRET_MARKER = "PHASE1_SECRET_MARKER_DO_NOT_LEAK";
const TEST_PLATFORM = "darwin-arm64";
type CheckResult = {
  attempted: boolean;
  success: boolean;
  latency_ms: number | null;
  error: string | null;
};
type VerifiedEndpoint = {
  hostname: string;
  family: "ipv4" | "ipv6";
  address: string;
};
type QuicTarget = {
  hostname: string;
  address_family: "ipv4" | "ipv6";
  address: string;
  protocol: string;
  port: number;
  attempted: boolean;
  success: boolean;
  latency_ms: number | null;
  error: string | null;
};
type MutableQuicTarget = Partial<Omit<QuicTarget, "error">> & {
  error?: unknown;
} & Record<string, unknown>;
type MutableQuicProbe = {
  attempted?: unknown;
  success?: unknown;
  latency_ms?: unknown;
  error?: unknown;
  targets: MutableQuicTarget[];
} & Record<string, unknown>;

async function privateRoot() {
  const created = await mkdtemp(path.join(tmpdir(), "homecook-cloudflare-preflight-"));
  const root = await realpath(created);
  createdRoots.push(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

function successResult(stdout: string | Buffer = "") {
  return { exit_code: 0, stdout, stderr: "", timed_out: false };
}

function failedResult(stderr = "blocked") {
  return { exit_code: 1, stdout: "", stderr, timed_out: false };
}

function successfulChecks(): Record<string, CheckResult> {
  return {
    tunnel_connections: { attempted: true, success: true, latency_ms: 1, error: null },
    dns: { attempted: true, success: true, latency_ms: 4, error: null },
    udp_7844: { attempted: true, success: true, latency_ms: 5, error: null },
    tcp_7844: { attempted: true, success: true, latency_ms: 6, error: null },
    management_api_https: {
      attempted: true,
      success: true,
      latency_ms: 7,
      error: null,
    },
    config: { attempted: false, success: true, latency_ms: null, error: null },
    update_gate: { attempted: true, success: true, latency_ms: 0, error: null },
  };
}

function completeSnapshot() {
  return {
    complete: true,
    plist: { path_hash: `sha256:${"f".repeat(64)}`, sha256: `sha256:${"c".repeat(64)}`, mode: "0600" },
    candidate_binary: {
      path_hash: `sha256:${"a".repeat(64)}`, version: "2026.5.2",
      sha256: `sha256:${"b".repeat(64)}`, mode: "0755",
      arguments_sha256: `sha256:${"d".repeat(64)}`,
    },
    running_binary: {
      path_hash: `sha256:${"a".repeat(64)}`, version: "2026.5.2",
      sha256: `sha256:${"b".repeat(64)}`, mode: "0755",
      arguments_sha256: `sha256:${"d".repeat(64)}`,
    },
    token_file_path_hash: `sha256:${"e".repeat(64)}`,
    token_file_mode: "0600",
    launchd_state: "running",
    tunnel_state: "connected",
    tunnel: { active_connections: 4, active_edge_locations: 2, replica_state: "healthy" },
  };
}

const FIXTURE_BINARY_SHA256 = `sha256:${createHash("sha256")
  .update("fake-cloudflared-binary", "utf8").digest("hex")}`;
const FIXTURE_PLIST_SHA256 = `sha256:${createHash("sha256")
  .update("fake-plist", "utf8").digest("hex")}`;

function matchingQuicProbe({ verified_endpoints: endpoints }: { verified_endpoints: VerifiedEndpoint[] }) {
  return {
    attempted: true, success: true, latency_ms: 1, error: null,
    targets: endpoints.map(({ hostname, family, address }): QuicTarget => ({
      hostname,
      address_family: family,
      address,
      protocol: "quic",
      port: 7844,
      attempted: true,
      success: true,
      latency_ms: 1,
      error: null,
    })),
  };
}

const successfulQuicProbe = matchingQuicProbe;

function kernProcArgs2Buffer(args: string[], executablePath: string | Buffer = args[0] ?? "") {
  const argc = Buffer.alloc(4);
  argc.writeInt32LE(args.length, 0);
  return Buffer.concat([
    argc,
    Buffer.isBuffer(executablePath) ? executablePath : Buffer.from(executablePath, "utf8"),
    Buffer.from([0, 0]),
    ...args.map((argument) => Buffer.concat([Buffer.from(argument, "utf8"), Buffer.from([0])])),
  ]);
}

function runtimeArgvReader(args: string[], executablePath?: string | Buffer) {
  return vi.fn(async () => successResult(kernProcArgs2Buffer(args, executablePath)));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("management mode and release gate", () => {
  it("rejects conflicting remote and local management flags", () => {
    expect(classifyManagementMode([
      "tunnel",
      "--config",
      "/private/local.yml",
      "run",
      "--token-file",
      "/private/token",
    ], { config_exists: true, local_ingress_config: true })).toMatchObject({
      mode: "unknown",
      success: false,
    });
  });

  it.each([
    ["duplicate separate", ["--token-file", "/private/a", "--token-file", "/private/b"]],
    ["mixed form", ["--token-file", "/private/a", "--token-file=/private/b"]],
    ["missing value", ["--token-file"]],
    ["empty equals", ["--token-file="]],
    ["inline conflict", ["--token-file=/private/a", "--token=secret"]],
    ["duplicate config", ["--config=/private/a", "--config", "/private/b"]],
    ["duplicate metrics", ["--metrics=127.0.0.1:20241", "--metrics", "127.0.0.1:20242"]],
  ])("fails closed for malformed or duplicate sensitive flags: %s", (_case, args) => {
    expect(classifyManagementMode(["tunnel", "run", ...args], {
      config_exists: true,
      local_ingress_config: true,
    })).toMatchObject({ mode: "unknown", success: false });
  });

  it("parses sensitive flags once while preserving spaces and literal quotes", () => {
    expect(parseCloudflaredArguments([
      "tunnel", "run", "--token-file", "/private/token with space", "--metrics=127.0.0.1:20241",
    ])).toMatchObject({
      success: true,
      mode: "remotely-managed",
      token_file: "/private/token with space",
      metrics: "127.0.0.1:20241",
    });
    expect(parseCloudflaredArguments([
      "tunnel", "run", "--token-file=/private/\"quoted\"", "--metrics", "127.0.0.1:20241",
    ])).toMatchObject({ success: true, token_file: "/private/\"quoted\"" });
  });

  it.each([
    ["empty separate", ["--token-file", ""]],
    ["metrics with whitespace", ["--metrics", "127.0.0.1:20241 extra"]],
    ["flag consumed as value", ["--token-file", "--metrics", "127.0.0.1:20241"]],
    ["relative token path", ["--token-file", "relative-token"]],
    ["relative config path", ["--config=relative.yml"]],
  ])("rejects ambiguous sensitive flag values: %s", (_case, args) => {
    expect(parseCloudflaredArguments(["tunnel", "run", ...args]).success).toBe(false);
  });

  it("accepts locally-managed only with an explicit local ingress config", () => {
    expect(classifyManagementMode([
      "tunnel",
      "--config=/private/local.yml",
      "run",
      "homecook",
    ], { config_exists: true, local_ingress_config: true })).toEqual({
      mode: "locally-managed",
      success: true,
      config_required: true,
    });
  });

  it("fails closed when local management is ambiguous or config is missing", () => {
    expect(classifyManagementMode(["tunnel", "run", "homecook"], {
      config_exists: false,
      local_ingress_config: false,
    }).success).toBe(false);
    expect(classifyManagementMode([
      "tunnel",
      "--config",
      "/private/missing.yml",
      "run",
      "homecook",
    ], { config_exists: false, local_ingress_config: false })).toMatchObject({
      mode: "locally-managed",
      success: false,
      config_required: true,
    });
  });

  it("passes only an exact supported stable release verified for this platform", () => {
    expect(evaluateReleaseGate("2026.5.2", {
      version: "2026.5.2",
      verified_at: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM)).toMatchObject({ success: true, error: null });

    expect(evaluateReleaseGate("2026.3.0", {
      version: "2026.5.2",
      verified_at: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM)).toMatchObject({ success: false, error: "OUTDATED" });
    expect(evaluateReleaseGate("2026.6.0", {
      version: "2026.5.2",
      verified_at: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM)).toMatchObject({ success: false, error: "UNSUPPORTED" });
    expect(evaluateReleaseGate("unknown", null, TEST_PLATFORM)).toMatchObject({
      success: false,
      error: "UNKNOWN",
    });
    expect(evaluateReleaseGate("2026.5.2", {
      version: "2026.5.2",
      verified_at: "2026-08-09T13:00:00.000Z",
      platform: "linux-x64",
    }, TEST_PLATFORM)).toEqual({ success: false, error: "UNKNOWN" });
    expect(evaluateReleaseGate("2026.5.2", {
      version: "2026.5.2",
      verified_at: "2026-08-07T12:59:59.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM, "2026-08-09T13:00:00.000Z")).toMatchObject({
      success: false,
      error: "STALE_METADATA",
    });
  });

  it.each([
    ["2026.05.2", "2026.5.2"],
    ["2026.5.02", "2026.5.2"],
    ["9007199254740992.5.2", "9007199254740992.5.2"],
    ["2026.9007199254740992.2", "2026.9007199254740992.2"],
  ])("rejects non-canonical or unsafe version components: %s", (current, stable) => {
    expect(evaluateReleaseGate(current, {
      version: stable,
      verified_at: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM)).toEqual({ success: false, error: "UNKNOWN" });
  });
});

describe("pure parsing and evidence projection", () => {
  it("preserves NUL-delimited argv boundaries including spaces, quotes, and empty arguments", () => {
    const args = [
      "/opt/cloudflared", "tunnel", "run", "--token-file", "/private/token with space",
      "literal-\"quote\"", "",
    ];
    expect(parseKernProcArgs2(kernProcArgs2Buffer(args))).toEqual({
      success: true,
      executable_path: args[0],
      arguments: args,
    });
  });

  it.each([
    ["malformed UTF-8", Buffer.from([0xff])],
    ["empty", ""],
    ["nonabsolute", "cloudflared"],
    ["noncanonical", "/opt/../opt/cloudflared"],
  ])("rejects a %s KERN_PROCARGS2 executable path", (_case, executablePath) => {
    const raw = kernProcArgs2Buffer(["/opt/cloudflared", "tunnel", "run"], executablePath);
    expect(parseKernProcArgs2(raw)).toMatchObject({
      success: false,
      executable_path: null,
      arguments: [],
    });
  });

  it("rejects truncated, malformed, and oversized KERN_PROCARGS2 buffers", () => {
    const valid = kernProcArgs2Buffer(["/opt/cloudflared", "tunnel", "run"]);
    expect(parseKernProcArgs2(valid.subarray(0, valid.length - 1)).success).toBe(false);
    expect(parseKernProcArgs2(Buffer.from([1, 0, 0, 0, 0])).success).toBe(false);
    expect(parseKernProcArgs2(Buffer.alloc(65 * 1_024)).success).toBe(false);
  });

  it("accepts only addresses assigned to the exact official endpoint family", () => {
    expect(parseDnsOutput("198.41.192.167\n", {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
    })).toMatchObject({ success: true, address_count: 1 });
    expect(parseDnsOutput("not-an-address\n", {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
    })).toMatchObject({ success: false, address_count: 0 });
  });

  it("rejects loopback and endpoint IPs that do not match the official hostname family", () => {
    expect(parseDnsOutput("127.0.0.1\n", {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
    })).toMatchObject({ success: false, address_count: 0 });
    expect(parseDnsOutput("198.41.200.13\n", {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
    })).toMatchObject({ success: false, address_count: 0 });
    expect(parseDnsOutput("198.41.192.167\n", {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
    })).toMatchObject({ success: true, address_count: 1 });
  });

  it("redacts token values and all absolute argument paths before hashing", () => {
    const redacted = redactArguments([
      "/opt/homebrew/bin/cloudflared",
      "tunnel",
      "--token",
      SECRET_MARKER,
      "--token-file=/private/token-file",
      "--config",
      "/private/config.yml",
    ]);
    expect(redacted.join(" ")).not.toContain(SECRET_MARKER);
    expect(redacted.join(" ")).not.toContain("/private/");
    expect(redacted).toContain("[redacted-token]");
    expect(redacted).toContain("--token-file=[redacted-path]");
  });

  it.each([
    "dns",
    "udp_7844",
    "tcp_7844",
    "management_api_https",
    "update_gate",
  ])("does not produce a false PASS when %s fails", (checkName) => {
    const checks = successfulChecks();
    checks[checkName as keyof typeof checks] = {
      attempted: true,
      success: false,
      latency_ms: 8,
      error: "CHECK_FAILED",
    };
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks,
    });
    expect(evidence.success).toBe(false);
  });

  it("keeps remotely-managed config absence PASS but locally-managed absence FAIL", () => {
    const remote = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks: successfulChecks(),
    });
    expect(remote.success).toBe(true);

    const localChecks = successfulChecks();
    localChecks.config = {
      attempted: false,
      success: false,
      latency_ms: null,
      error: "CONFIG_MISSING",
    };
    const local = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "locally-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks: localChecks,
    });
    expect(local.success).toBe(false);
  });

  it("does not require a token-file for a valid locally-managed ingress config", () => {
    const localChecks = successfulChecks();
    localChecks.config = {
      attempted: true,
      success: true,
      latency_ms: 2,
      error: null,
    };
    const localSnapshot = {
      ...completeSnapshot(),
      token_file_path_hash: null,
      token_file_mode: null,
    };
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "locally-managed",
      management_mode_success: true,
      snapshot: localSnapshot,
      token_path_mode_safe: false,
      checks: localChecks,
    });
    expect(evidence.success).toBe(true);
    expect(evidence.checks.token_path_mode).toMatchObject({
      attempted: false,
      success: true,
      latency_ms: null,
      error: null,
    });
  });

  it("emits only the strict evidence allowlist and no raw secret-shaped data", () => {
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks: successfulChecks(),
      ignored_raw: {
        stdout: SECRET_MARKER,
        response_body: `cookie=${SECRET_MARKER}`,
        ip: "198.41.192.1",
        uuid: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      },
    } as never);
    expect(Object.keys(evidence)).toEqual([
      "schema",
      "version",
      "timestamp",
      "platform",
      "success",
      "management_mode",
      "snapshot",
      "checks",
    ]);
    expect(JSON.stringify(evidence)).not.toMatch(
      /PHASE1_SECRET|cookie|198\.41\.192\.1|a0eebc99|response_body|stdout/u,
    );
  });

  it("redacts sensitive shapes from binary paths and runtime arguments", () => {
    const snapshot = completeSnapshot();
    (snapshot.candidate_binary as unknown as Record<string, unknown>).path
      = "/tmp/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/cloudflared";
    (snapshot.running_binary as unknown as Record<string, unknown>).path
      = "/tmp/operator@example.test/cloudflared";
    (snapshot.running_binary as unknown as Record<string, unknown>).arguments_redacted
      = ["--metrics", "127.0.0.1:20241"];
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot,
      token_path_mode_safe: true,
      checks: successfulChecks(),
    });
    expect(JSON.stringify(evidence)).not.toMatch(/a0eebc99|operator@|127\.0\.0\.1/u);
  });

  it("serializes path hashes only and removes raw IPv4 and IPv6", () => {
    const snapshot = completeSnapshot();
    (snapshot.candidate_binary as unknown as Record<string, unknown>).path
      = "/Users/operator/bin/cloudflared";
    (snapshot.running_binary as unknown as Record<string, unknown>).path
      = "/opt/2606:4700:a0::1/cloudflared";
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot,
      token_path_mode_safe: true,
      checks: successfulChecks(),
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("/opt/");
    expect(serialized).not.toContain("2606:4700:a0::1");
    expect(evidence.snapshot.candidate_binary).toHaveProperty("path_hash");
    expect(evidence.snapshot.candidate_binary).not.toHaveProperty("path");
  });

  it("normalizes every free-form evidence value that could carry a path or raw IP", () => {
    const snapshot = completeSnapshot();
    snapshot.plist.mode = "/Users/operator/198.41.192.167";
    snapshot.running_binary.mode = "2606:4700:a0::1";
    snapshot.launchd_state = SECRET_MARKER;
    snapshot.tunnel_state = "/private/config.yml";
    snapshot.tunnel.replica_state = "operator@example.test";
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: "/Users/operator/2606:4700:a0::1",
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot,
      token_path_mode_safe: true,
      checks: successfulChecks(),
    });
    expect(JSON.stringify(evidence)).not.toMatch(
      /\/Users\/|\/private\/|198\.41\.192\.167|2606:4700:a0::1|operator@|PHASE1_SECRET/u,
    );
    expect(evidence.platform).toBe("unknown");
  });

  it("maps unknown check and target errors to a closed non-sensitive code", () => {
    const checks = successfulChecks();
    checks.dns = {
      attempted: true,
      success: false,
      latency_ms: 1,
      error: SECRET_MARKER,
      targets: [{
        hostname: "region1.v2.argotunnel.com",
        address_family: "ipv4",
        protocol: "dns",
        port: 53,
        attempted: true,
        success: false,
        latency_ms: 1,
        error: "/Users/operator@example.test/2606:4700:a0::1",
      }],
    } as never;
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks,
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(/PHASE1_SECRET|\/Users\/|operator@|2606:4700:a0::1/u);
    expect(evidence.checks.dns).toMatchObject({ success: false, error: "CHECK_FAILED" });
    expect(evidence.checks.dns.targets[0]).toMatchObject({ success: false, error: "CHECK_FAILED" });
  });

  it.each([
    ["check missing error", (check: Record<string, unknown>) => { delete check.error; }],
    ["check undefined error", (check: Record<string, unknown>) => { check.error = undefined; }],
    ["failed check null error", (check: Record<string, unknown>) => { check.success = false; check.error = null; }],
    ["check wrong error type", (check: Record<string, unknown>) => { check.error = 42; }],
  ])("fails closed for %s", (_case, mutate) => {
    const checks = successfulChecks();
    const check = { ...checks.dns } as Record<string, unknown>;
    mutate(check);
    checks.dns = check as never;
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks,
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.dns).toMatchObject({ success: false, error: "CHECK_FAILED" });
  });

  it.each([
    ["target missing error", (target: Record<string, unknown>) => { delete target.error; }],
    ["target undefined error", (target: Record<string, unknown>) => { target.error = undefined; }],
    ["failed target null error", (target: Record<string, unknown>) => { target.success = false; target.error = null; }],
    ["target wrong error type", (target: Record<string, unknown>) => { target.error = 42; }],
  ])("fails the aggregate check for %s", (_case, mutate) => {
    const checks = successfulChecks();
    const target: Record<string, unknown> = {
      hostname: "region1.v2.argotunnel.com",
      address_family: "ipv4",
      protocol: "dns",
      port: 53,
      attempted: true,
      success: true,
      latency_ms: 1,
      error: null,
    };
    mutate(target);
    checks.dns = { ...checks.dns, targets: [target] } as never;
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks,
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.dns).toMatchObject({ success: false, error: "CHECK_FAILED" });
    expect(evidence.checks.dns.targets[0]).toMatchObject({ success: false, error: "CHECK_FAILED" });
  });
});

describe("bounded allowlisted process runner", () => {
  it("uses exact hostname, port, method, and HTTPS allowlists", async () => {
    const seen: Array<{ command: string; args: string[] }> = [];
    const runner = vi.fn(async ({ command, args }) => {
      seen.push({ command, args });
      return successResult("198.41.192.1\n");
    });
    for (const invocation of Object.values(CHECK_INVOCATIONS).flat()) {
      await runAllowedPreflightCommand(runner, invocation);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(JSON.stringify(seen)).not.toContain("tunnel diag");
    expect(seen.filter(({ command }) => command === SYSTEM_TOOLS.nc)).toHaveLength(0);
    expect(seen.find(({ command }) => command === SYSTEM_TOOLS.curl)?.args).toContain("HEAD");
    expect(seen.find(({ command }) => command === SYSTEM_TOOLS.curl)?.args.at(-1)).toBe(
      "https://api.cloudflare.com/client/v4/",
    );
  });

  it("uses canonical absolute tools and never passes hostnames to transport probes", () => {
    const invocations = [
      ...Object.values(CHECK_INVOCATIONS).flat(),
      createTcpInvocation("region1.v2.argotunnel.com", "ipv4", "198.41.192.167"),
    ];
    expect(invocations.every(({ command }) => path.isAbsolute(command))).toBe(true);
    const transports = invocations.filter(({ args }) => args.at(-1) === "7844");
    expect(transports.length).toBeGreaterThan(0);
    expect(transports.every(({ args }) =>
      !String(args.at(-2)).endsWith("argotunnel.com") && isFinite(Number(args.at(-2).split(".")[0]))
    )).toBe(true);
  });

  it.each([
    ["cloudflared", ["tunnel", "diag"]],
    [SYSTEM_TOOLS.nc, ["-vz", "-w", "3", "example.com", "7844"]],
    [SYSTEM_TOOLS.nc, ["-vz", "-w", "3", "region1.v2.argotunnel.com", "22"]],
    [SYSTEM_TOOLS.curl, ["--request", "POST", "https://api.cloudflare.com/client/v4/"]],
    [SYSTEM_TOOLS.curl, ["--request", "HEAD", "http://api.cloudflare.com/client/v4/"]],
  ])("rejects command or argument bypass: %s %j", async (command, args) => {
    const runner = vi.fn();
    await expect(runAllowedPreflightCommand(runner, {
      command,
      args,
      timeout_ms: 100,
    })).rejects.toThrow(/allowlist/iu);
    expect(runner).not.toHaveBeenCalled();
  });

  it("enforces timeout with SIGTERM followed by SIGKILL", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter & { setEncoding: (value: string) => void };
      stderr: EventEmitter & { setEncoding: (value: string) => void };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.kill = vi.fn();
    const spawnProcess = vi.fn(() => child);
    const timers: Array<() => void> = [];
    const runner = createPreflightRunner({
      spawnProcess: spawnProcess as never,
      setTimer: ((callback: () => void) => {
        timers.push(callback);
        return timers.length as never;
      }) as never,
      clearTimer: vi.fn() as never,
      killGraceMs: 10,
    });

    const resultPromise = runner(CHECK_INVOCATIONS.dns[0]);
    timers[0]();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    timers[1]();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null);
    await expect(resultPromise).resolves.toMatchObject({ timed_out: true, exit_code: 1 });
  });

  it("bounds captured subprocess output and terminates overflow", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter & { setEncoding: (value: string) => void };
      stderr: EventEmitter & { setEncoding: (value: string) => void };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.kill = vi.fn();
    const runner = createPreflightRunner({
      spawnProcess: vi.fn(() => child) as never,
      setTimer: vi.fn(() => 1 as never) as never,
      clearTimer: vi.fn() as never,
    });
    const resultPromise = runner(CHECK_INVOCATIONS.dns[0]);
    child.stdout.emit("data", "x".repeat(70 * 1_024));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", 0);
    await expect(resultPromise).resolves.toMatchObject({
      output_overflow: true,
      exit_code: 0,
    });
  });

  it("spawns trusted tools with a minimal fixed environment", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter & { setEncoding: (value: string) => void };
      stderr: EventEmitter & { setEncoding: (value: string) => void };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.kill = vi.fn();
    const spawnProcess = vi.fn(() => child);
    const runner = createPreflightRunner({
      spawnProcess: spawnProcess as never,
      setTimer: vi.fn(() => 1 as never) as never,
      clearTimer: vi.fn() as never,
    });
    const resultPromise = runner(CHECK_INVOCATIONS.dns[0]);
    child.emit("close", 0);
    await resultPromise;
    expect(spawnProcess).toHaveBeenCalledWith(
      expect.stringMatching(/^\//u),
      expect.any(Array),
      expect.objectContaining({
        shell: false,
        env: { PATH: "/usr/bin:/bin:/usr/sbin", LANG: "C", LC_ALL: "C" },
      }),
    );
  });
});

describe("read-only collection and CLI", () => {
  async function fixturePaths({ tokenMode = 0o600 } = {}) {
    const root = await privateRoot();
    const binaryPath = path.join(root, "cloudflared");
    const plistPath = path.join(root, "cloudflared.plist");
    const tokenPath = path.join(root, "tunnel-token");
    await writeFile(binaryPath, "fake-cloudflared-binary", { mode: 0o700 });
    await writeFile(plistPath, "fake-plist", { mode: 0o600 });
    await writeFile(tokenPath, SECRET_MARKER, { mode: tokenMode });
    return { root, binaryPath, plistPath, tokenPath };
  }

  function happyRunner(paths: Awaited<ReturnType<typeof fixturePaths>>, { runtimeEvidence = true } = {}) {
    const invocations: Array<{ command: string; args: string[] }> = [];
    const runner = vi.fn(async ({ command, args }) => {
      invocations.push({ command, args });
      if (command === SYSTEM_TOOLS.plutil) {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: [
            paths.binaryPath,
            "tunnel",
            "run",
            "--metrics",
            "127.0.0.1:20241",
            "--token-file",
            paths.tokenPath,
          ],
        }));
      }
      if (path.basename(command) === "cloudflared" && args[0] === "--version") {
        return successResult("cloudflared version 2026.5.2");
      }
      if (command === SYSTEM_TOOLS.launchctl) {
        return successResult("state = running\npid = 123\n");
      }
      if (command === SYSTEM_TOOLS.lsof && args.includes("txt")) {
        return runtimeEvidence ? successResult(`p123\nn${paths.binaryPath}\n`) : failedResult();
      }
      if (command === SYSTEM_TOOLS.lsof && args.includes("-iTCP")) {
        return runtimeEvidence ? successResult("p123\nn127.0.0.1:20241\n") : failedResult();
      }
      if (command === SYSTEM_TOOLS.dig) {
        const hostname = args[2];
        if (args[1] === "A") {
          return successResult(hostname.startsWith("region1") ? "198.41.192.167\n" : "198.41.200.13\n");
        }
        return successResult(hostname.startsWith("region1") ? "2606:4700:a0::1\n" : "2606:4700:a8::1\n");
      }
      if (command === SYSTEM_TOOLS.curl && String(args.at(-1)).includes("/metrics")) {
        return runtimeEvidence ? successResult([
          'cloudflared_build_info{version="2026.5.2"} 1',
          "cloudflared_tunnel_ha_connections 4",
          'cloudflared_tunnel_server_locations{connection_id="0",edge_location="icn01"} 1',
          'cloudflared_tunnel_server_locations{connection_id="1",edge_location="icn01"} 1',
          'cloudflared_tunnel_server_locations{connection_id="2",edge_location="nrt01"} 1',
          'cloudflared_tunnel_server_locations{connection_id="3",edge_location="nrt01"} 1',
        ].join("\n")) : failedResult();
      }
      return successResult();
    });
    return { runner, invocations };
  }

  function remoteArguments(paths: Awaited<ReturnType<typeof fixturePaths>>) {
    return [
      paths.binaryPath,
      "tunnel",
      "run",
      "--metrics",
      "127.0.0.1:20241",
      "--token-file",
      paths.tokenPath,
    ];
  }

  function noEventWatchPath() {
    return { on: vi.fn(), close: vi.fn() };
  }

  function validCollectorOptions(paths: Awaited<ReturnType<typeof fixturePaths>>) {
    return {
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    };
  }

  function validCollectorDependencies(paths: Awaited<ReturnType<typeof fixturePaths>>, runner: ReturnType<typeof vi.fn>) {
    return {
      runner,
      quicProbe: successfulQuicProbe,
      runtimeArgvReader: runtimeArgvReader(remoteArguments(paths)),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
      watchPath: noEventWatchPath,
    };
  }

  it("rejects distinct raw argv vectors that collapse to the same ps command string", async () => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const configured = [...remoteArguments(paths), "suffix"];
    const actual = [
      paths.binaryPath, "tunnel", "run", "--metrics", "127.0.0.1:20241",
      "--token-file", `${paths.tokenPath} suffix`,
    ];
    expect(configured.join(" ")).toBe(actual.join(" "));
    const runner = vi.fn(async (candidate) => {
      if (candidate.command === SYSTEM_TOOLS.plutil) {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: configured,
        }));
      }
      return base.runner(candidate);
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      runtimeArgvReader: runtimeArgvReader(actual),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it.each([
    ["raw executable mismatch", (paths: Awaited<ReturnType<typeof fixturePaths>>) => ({
      args: remoteArguments(paths), executablePath: "/attacker/cloudflared",
    })],
    ["argv0 mismatch", (paths: Awaited<ReturnType<typeof fixturePaths>>) => ({
      args: ["/attacker/cloudflared", ...remoteArguments(paths).slice(1)],
      executablePath: paths.binaryPath,
    })],
  ])("rejects KERN_PROCARGS2 %s", async (_case, runtime) => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const raw = runtime(paths);
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      runtimeArgvReader: runtimeArgvReader(raw.args, raw.executablePath),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it("rejects a later duplicate token-file instead of accepting the first value", async () => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const configured = [...remoteArguments(paths), "--token-file", "/private/second-token"];
    const runner = vi.fn(async (candidate) => {
      if (candidate.command === SYSTEM_TOOLS.plutil) {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: configured,
        }));
      }
      return base.runner(candidate);
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      runtimeArgvReader: runtimeArgvReader(configured),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it.each(["replace-restore", "write-restore", "rename-away-back"])(
    "fails when the candidate binary changes during the snapshot: %s",
    async (mutation) => {
      const paths = await fixturePaths();
      const base = happyRunner(paths);
      const backupPath = path.join(paths.root, "cloudflared.snapshot-backup");
      const listeners: Array<() => void> = [];
      const watchPath = vi.fn((_watchedPath, _options, listener) => {
        listeners.push(listener);
        return { close: vi.fn() };
      });
      const runner = vi.fn(async (candidate) => {
        if (candidate.command === SYSTEM_TOOLS.launchctl) {
          if (mutation === "write-restore") {
            await writeFile(paths.binaryPath, "malicious-binary");
            await writeFile(paths.binaryPath, "fake-cloudflared-binary");
          } else {
            await rename(paths.binaryPath, backupPath);
            if (mutation === "replace-restore") {
              await writeFile(paths.binaryPath, "malicious-binary", { mode: 0o700 });
              await rm(paths.binaryPath);
            }
            await rename(backupPath, paths.binaryPath);
          }
          if (mutation !== "write-restore") listeners.forEach((listener) => listener());
        }
        return base.runner(candidate);
      });
      const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
        ...validCollectorDependencies(paths, runner),
        watchPath,
      });
      expect(evidence.success).toBe(false);
      expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
    },
  );

  it("fails when a candidate or parent watcher emits any event", async () => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const listeners: Array<() => void> = [];
    const watchPath = vi.fn((_watchedPath, _options, listener) => {
      listeners.push(listener);
      return { close: vi.fn() };
    });
    const runner = vi.fn(async (candidate) => {
      if (candidate.command === SYSTEM_TOOLS.launchctl) listeners.forEach((listener) => listener());
      return base.runner(candidate);
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      watchPath,
    });
    expect(evidence.success).toBe(false);
  });

  it.each([
    ["aggregate missing error", (probe: MutableQuicProbe) => { delete probe.error; }],
    ["aggregate undefined error", (probe: MutableQuicProbe) => { probe.error = undefined; }],
    ["target missing error", (probe: MutableQuicProbe) => { delete probe.targets[0]?.error; }],
    ["target undefined error", (probe: MutableQuicProbe) => { if (probe.targets[0]) probe.targets[0].error = undefined; }],
    ["aggregate wrong error type", (probe: MutableQuicProbe) => { probe.error = 42; }],
    ["target wrong error type", (probe: MutableQuicProbe) => { if (probe.targets[0]) probe.targets[0].error = 42; }],
    ["failed aggregate null error", (probe: MutableQuicProbe) => { probe.success = false; probe.error = null; }],
    ["failed target null error", (probe: MutableQuicProbe) => {
      if (!probe.targets[0]) return;
      probe.targets[0].success = false;
      probe.targets[0].error = null;
    }],
    ["target unknown failure code", (probe: MutableQuicProbe) => {
      if (!probe.targets[0]) return;
      probe.targets[0].success = false;
      probe.targets[0].error = SECRET_MARKER;
    }],
    ["aggregate extra field", (probe: MutableQuicProbe) => { probe.raw_response = SECRET_MARKER; }],
    ["target extra field", (probe: MutableQuicProbe) => {
      if (probe.targets[0]) probe.targets[0].raw_ip = "198.41.192.167";
    }],
  ])("rejects incomplete or suspicious QUIC result objects: %s", async (_case, mutate) => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      quicProbe: (input: { verified_endpoints: VerifiedEndpoint[] }) => {
        const probe = matchingQuicProbe(input) as unknown as MutableQuicProbe;
        mutate(probe);
        return probe;
      },
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.udp_7844.error).toBe("QUIC_TARGET_MISMATCH");
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });

  it.each(["plutil", "launchctl", "lsof-executable", "lsof-listener", "metrics"])(
    "rejects overflow even when %s output starts with a valid prefix",
    async (kind) => {
      const paths = await fixturePaths();
      const base = happyRunner(paths);
      const runner = vi.fn(async (candidate) => {
        const result = await base.runner(candidate);
        const matches = kind === "plutil" && candidate.command === SYSTEM_TOOLS.plutil
          || kind === "launchctl" && candidate.command === SYSTEM_TOOLS.launchctl
          || kind === "lsof-executable" && candidate.command === SYSTEM_TOOLS.lsof
            && candidate.args.includes("txt")
          || kind === "lsof-listener" && candidate.command === SYSTEM_TOOLS.lsof
            && candidate.args.includes("-iTCP")
          || kind === "metrics" && candidate.command === SYSTEM_TOOLS.curl
            && String(candidate.args.at(-1)).includes("/metrics");
        return matches ? { ...result, output_overflow: true } : result;
      });
      const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
        ...validCollectorDependencies(paths, runner),
      });
      expect(evidence.success).toBe(false);
      expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
    },
  );

  it("rejects overflow from the bounded runtime argv primitive", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      runtimeArgvReader: vi.fn(async () => ({
        ...successResult(kernProcArgs2Buffer(remoteArguments(paths))),
        output_overflow: true,
      })),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it.each([
    ...["plutil", "launchctl", "lsof-executable", "lsof-listener", "metrics"].flatMap((command) =>
      ["timeout", "missing", "truncated"].map((failure) => [command, failure])),
  ])("rejects %s internal output when it is %s", async (kind, failure) => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const runner = vi.fn(async (candidate) => {
      const result = await base.runner(candidate);
      const matches = kind === "plutil" && candidate.command === SYSTEM_TOOLS.plutil
        || kind === "launchctl" && candidate.command === SYSTEM_TOOLS.launchctl
        || kind === "lsof-executable" && candidate.command === SYSTEM_TOOLS.lsof
          && candidate.args.includes("txt")
        || kind === "lsof-listener" && candidate.command === SYSTEM_TOOLS.lsof
          && candidate.args.includes("-iTCP")
        || kind === "metrics" && candidate.command === SYSTEM_TOOLS.curl
          && String(candidate.args.at(-1)).includes("/metrics");
      if (!matches) return result;
      if (failure === "timeout") return { ...result, timed_out: true };
      if (failure === "missing") return { ...result, command_missing: true };
      const stdout = kind === "plutil" ? "{"
        : kind === "launchctl" ? "state = running\n"
          : kind === "metrics" ? 'cloudflared_build_info{version="2026.5.2"} 1\n'
            : "p123\n";
      return { ...result, stdout };
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it.each(["timeout", "missing", "truncated"])(
    "rejects runtime argv primitive output when it is %s",
    async (failure) => {
      const paths = await fixturePaths();
      const { runner } = happyRunner(paths);
      const buffer = kernProcArgs2Buffer(remoteArguments(paths));
      const runtimeReader = vi.fn(async () => {
        if (failure === "timeout") return { ...successResult(buffer), timed_out: true };
        if (failure === "missing") return { ...successResult(buffer), command_missing: true };
        return successResult(buffer.subarray(0, buffer.length - 1));
      });
      const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
        ...validCollectorDependencies(paths, runner),
        runtimeArgvReader: runtimeReader,
      });
      expect(evidence.success).toBe(false);
      expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
    },
  );

  it.each([
    ...["dig", "tcp", "management"].flatMap((command) =>
      ["timeout", "overflow", "missing"].map((failure) => [command, failure])),
  ])("rejects %s connectivity results marked %s", async (kind, failure) => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const runner = vi.fn(async (candidate) => {
      const result = await base.runner(candidate);
      const matches = kind === "dig" && candidate.command === SYSTEM_TOOLS.dig
        || kind === "tcp" && candidate.command === SYSTEM_TOOLS.nc
        || kind === "management" && candidate.command === SYSTEM_TOOLS.curl
          && String(candidate.args.at(-1)).startsWith("https:");
      if (!matches) return result;
      if (failure === "timeout") return { ...result, timed_out: true };
      if (failure === "overflow") return { ...result, output_overflow: true };
      return { ...result, command_missing: true };
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
    });
    expect(evidence.success).toBe(false);
    const checkName = kind === "dig" ? "dns" : kind === "tcp" ? "tcp_7844" : "management_api_https";
    expect(evidence.checks[checkName].success).toBe(false);
  });

  it("reports a closed failure when DNS exits zero without required stdout", async () => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const runner = vi.fn(async (candidate) => candidate.command === SYSTEM_TOOLS.dig
      ? successResult("") : base.runner(candidate));
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.dns).toMatchObject({
      attempted: true,
      success: false,
      error: "MALFORMED_OUTPUT",
    });
  });

  it("snapshots a remotely-managed tunnel without reading token-file contents or invoking diag", async () => {
    const paths = await fixturePaths();
    const { runner, invocations } = happyRunner(paths);
    const readTextFile = vi.fn(async () => {
      throw new Error("token-file content access forbidden");
    });
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      ...validCollectorDependencies(paths, runner),
      readTextFile,
    });

    expect(evidence.success).toBe(true);
    expect(evidence.management_mode).toBe("remotely-managed");
    expect(evidence.snapshot.token_file_mode).toBe("0600");
    expect(JSON.stringify(evidence)).not.toContain(paths.tokenPath);
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(invocations.filter(({ args }) => args.join(" ").includes("tunnel diag"))).toHaveLength(0);
  });

  it("fails closed when actual HA connection metrics and running executable identity are unavailable", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths, { runtimeEvidence: false });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
      watchPath: noEventWatchPath,
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.tunnel_connections).toMatchObject({
      attempted: false,
      success: false,
    });
    expect(evidence.snapshot.running_binary).toBeDefined();
    expect(evidence.snapshot.candidate_binary).toBeDefined();
    expect(evidence.snapshot.plist).toBeDefined();
  });

  it("fails closed when no trusted raw argv primitive is available", async () => {
    const paths = await fixturePaths();
    const { runner, invocations } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight(validCollectorOptions(paths), {
      runner,
      quicProbe: matchingQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });

    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot).toMatchObject({
      attempted: true,
      success: false,
      error: "SNAPSHOT_INCOMPLETE",
    });
    expect(invocations.every(({ command }) => command !== "/bin/ps")).toBe(true);
    expect(invocations.every(({ command }) => path.basename(command) !== "cloudflared")).toBe(true);
  });

  it("never treats UDP netcat exit zero as a QUIC-aware PASS", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.checks.udp_7844).toMatchObject({
      attempted: false,
      success: false,
      error: "QUIC_PROBE_UNAVAILABLE",
    });
    expect(SYSTEM_TOOLS).not.toHaveProperty("ps");
  });

  it("rejects an injected QUIC PASS with an empty target set", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: () => ({ attempted: true, success: true, latency_ms: 1, error: null, targets: [] }),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.udp_7844).toMatchObject({ success: false, error: "QUIC_TARGET_MISMATCH" });
  });

  it.each([
    ["missing", (targets: QuicTarget[]) => targets.slice(1)],
    ["duplicate", (targets: QuicTarget[]) => [targets[0], ...targets]],
    ["address", (targets: QuicTarget[]) => [{ ...targets[0], address: "127.0.0.1" }, ...targets.slice(1)]],
    ["family", (targets: QuicTarget[]) => [{ ...targets[0], address_family: "ipv6" as const }, ...targets.slice(1)]],
    ["hostname", (targets: QuicTarget[]) => [{ ...targets[0], hostname: "region2.v2.argotunnel.com" }, ...targets.slice(1)]],
    ["protocol", (targets: QuicTarget[]) => [{ ...targets[0], protocol: "udp" }, ...targets.slice(1)]],
    ["port", (targets: QuicTarget[]) => [{ ...targets[0], port: 443 }, ...targets.slice(1)]],
    ["latency", (targets: QuicTarget[]) => [{ ...targets[0], latency_ms: -1 }, ...targets.slice(1)]],
  ])("rejects a tampered QUIC target set: %s", async (_case, mutate) => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: (input: { verified_endpoints: VerifiedEndpoint[] }) => {
        const probe = matchingQuicProbe(input);
        return { ...probe, targets: mutate(probe.targets) };
      },
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.udp_7844).toMatchObject({ success: false, error: "QUIC_TARGET_MISMATCH" });
  });

  it("rejects a malformed injected QUIC target without aborting evidence collection", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: () => ({
        attempted: true,
        success: true,
        latency_ms: 1,
        error: null,
        targets: [null],
      }),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.udp_7844).toMatchObject({ success: false, error: "QUIC_TARGET_MISMATCH" });
  });

  it.each([
    ["token-file separate", ["--token-file", "/private/token-A"], ["--token-file", "/private/token-B"]],
    ["token-file equals", ["--token-file=/private/token-A"], ["--token-file=/private/token-B"]],
    ["config separate", ["--config", "/private/config-A.yml"], ["--config", "/private/config-B.yml"]],
    ["config equals", ["--config=/private/config-A.yml"], ["--config=/private/config-B.yml"]],
    ["metrics separate", ["--metrics", "127.0.0.1:20241"], ["--metrics", "127.0.0.1:20242"]],
    ["metrics equals", ["--metrics=127.0.0.1:20241"], ["--metrics=127.0.0.1:20242"]],
  ])("rejects raw argv drift before redaction: %s", async (_case, configuredFlag, runningFlag) => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const configuredArgs = [paths.binaryPath, "tunnel", "run", ...configuredFlag, "--metrics", "127.0.0.1:20241"];
    const runningArgs = [paths.binaryPath, "tunnel", "run", ...runningFlag, "--metrics", "127.0.0.1:20241"];
    const runner = vi.fn(async (invocation) => {
      if (invocation.command === SYSTEM_TOOLS.plutil) {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: configuredArgs,
        }));
      }
      return base.runner(invocation);
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      runtimeArgvReader: runtimeArgvReader(runningArgs),
      quicProbe: matchingQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it("does not execute a plist-selected binary without an externally verified hash", async () => {
    const paths = await fixturePaths();
    const { runner, invocations } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(invocations.filter(({ command }) => command === paths.binaryPath)).toHaveLength(0);
  });

  it("does not execute a hash-matched binary outside trusted installation roots", async () => {
    const paths = await fixturePaths();
    const { runner, invocations } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, { runner, quicProbe: successfulQuicProbe, trustedPlistPaths: [paths.plistPath] });
    expect(evidence.success).toBe(false);
    expect(invocations.filter(({ command }) => command === paths.binaryPath)).toHaveLength(0);
  });

  it("rejects an untrusted plist path and never spawns its selected binary", async () => {
    const paths = await fixturePaths();
    const { runner, invocations } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: matchingQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [path.join(paths.root, "different.plist")],
    });
    expect(evidence.success).toBe(false);
    expect(invocations.some(({ command }) => path.basename(command) === "cloudflared")).toBe(false);
  });

  it("rejects a plist hash mismatch and a writable parent directory", async () => {
    const paths = await fixturePaths();
    await chmod(paths.root, 0o777);
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: `sha256:${"0".repeat(64)}`,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: matchingQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
  });

  it("never executes the candidate binary during a replace-and-restore race", async () => {
    const paths = await fixturePaths();
    const backupPath = path.join(paths.root, "cloudflared.original");
    const base = happyRunner(paths);
    const invocations: Array<{ command: string; args: string[] }> = [];
    const runner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (path.basename(invocation.command) === "cloudflared") {
        await rename(paths.binaryPath, backupPath);
        await writeFile(paths.binaryPath, "malicious-binary", { mode: 0o700 });
        await rm(paths.binaryPath);
        await rename(backupPath, paths.binaryPath);
        return successResult("cloudflared version 2026.5.2");
      }
      return base.runner(invocation);
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      runtimeArgvReader: runtimeArgvReader(remoteArguments(paths)),
      quicProbe: matchingQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
      watchPath: noEventWatchPath,
    });
    expect(invocations.some(({ command }) => path.basename(command) === "cloudflared")).toBe(false);
    expect(evidence.snapshot.running_binary.version).toBe("2026.5.2");
  });

  it("fails token safety for non-0600 mode without reading or exposing contents", async () => {
    const paths = await fixturePaths({ tokenMode: 0o644 });
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });

  it("fails closed for local ingress when no immutable validator is available", async () => {
    const paths = await fixturePaths();
    const configPath = path.join(paths.root, "config.yml");
    await writeFile(configPath, [
      "tunnel: homecook",
      "ingress:",
      "  - hostname: app.example.test",
      "    service: http://127.0.0.1:3000",
      "  - service: http_status:404",
      "",
    ].join("\n"), { mode: 0o600 });
    const base = happyRunner(paths);
    const invocations: Array<{ command: string; args: string[] }> = [];
    const localArguments = [
      paths.binaryPath, "tunnel", `--config=${configPath}`, "run", "homecook",
      "--metrics", "127.0.0.1:20241",
    ];
    const runner = vi.fn(async (invocation) => {
      const { command, args } = invocation;
      invocations.push({ command, args });
      if (command === SYSTEM_TOOLS.plutil) {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: localArguments,
        }));
      }
      return base.runner(invocation);
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      runtimeArgvReader: runtimeArgvReader(localArguments),
      quicProbe: successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
      watchPath: noEventWatchPath,
    });
    expect(evidence.success).toBe(false);
    expect(evidence.management_mode).toBe("locally-managed");
    expect(evidence.checks.config).toMatchObject({
      attempted: false,
      success: false,
      error: "CONFIG_VALIDATOR_UNAVAILABLE",
    });
    expect(invocations.filter(({ args }) => args.includes("validate"))).toHaveLength(0);
    expect(invocations.filter(({ args }) => args.join(" ").includes("tunnel diag"))).toHaveLength(0);
  });

  it.each([
    "dns",
    "udp",
    "tcp",
    "management",
    "timeout",
    "missing-command",
    "malformed-dns",
  ])("fails closed for injected %s failure", async (failure) => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const runner = vi.fn(async (invocation) => {
      const { command, args } = invocation;
      if (failure === "dns" && command === SYSTEM_TOOLS.dig) return failedResult();
      if (failure === "malformed-dns" && command === SYSTEM_TOOLS.dig) return successResult("garbage");
      if (failure === "tcp" && command === SYSTEM_TOOLS.nc) return failedResult();
      if (failure === "management" && command === SYSTEM_TOOLS.curl
        && String(args.at(-1)).startsWith("https:")) return failedResult();
      if (failure === "timeout" && command === SYSTEM_TOOLS.nc) {
        return { exit_code: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER, timed_out: true };
      }
      if (failure === "missing-command" && command === SYSTEM_TOOLS.dig) throw new Error("ENOENT");
      return base.runner(invocation);
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      expected_plist_sha256: FIXTURE_PLIST_SHA256,
      expected_binary_sha256: FIXTURE_BINARY_SHA256,
      expected_binary_version: "2026.5.2",
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, {
      runner,
      quicProbe: failure === "udp"
        ? () => ({ attempted: true, success: false, latency_ms: 1, error: "CHECK_FAILED", targets: [] })
        : successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(evidence.success).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });

  it("writes only a new 0600 file below a private 0700 directory outside the repo", async () => {
    const root = await privateRoot();
    const output = path.join(root, "private-evidence", "preflight.json");
    const evidence = buildPreflightEvidence({
      timestamp: "2026-08-09T13:00:00.000Z",
      platform: TEST_PLATFORM,
      management_mode: "remotely-managed",
      management_mode_success: true,
      snapshot: completeSnapshot(),
      token_path_mode_safe: true,
      checks: successfulChecks(),
    });
    await writePreflightEvidence(output, evidence);
    expect((await stat(path.dirname(output))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    await expect(writePreflightEvidence(output, evidence)).rejects.toThrow();
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(evidence);
  });

  it("keeps the default CLI fail-closed when no safe standalone QUIC probe is available", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const output = path.join(paths.root, "default-quic-evidence", "preflight.json");
    const exitCode = await runPreflightCli([
      "--plist", paths.plistPath,
      "--output", output,
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
      "--expected-plist-sha256", FIXTURE_PLIST_SHA256,
      "--expected-binary-sha256", FIXTURE_BINARY_SHA256,
      "--expected-binary-version", "2026.5.2",
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      stdout: vi.fn(),
      stderr: vi.fn(),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    const evidence = JSON.parse(await readFile(output, "utf8"));
    expect(exitCode).toBe(1);
    expect(evidence.success).toBe(false);
    expect(evidence.checks.udp_7844).toMatchObject({
      attempted: false,
      success: false,
      error: "QUIC_PROBE_UNAVAILABLE",
      targets: [],
    });
  });

  it("keeps stdout/stderr fixed and returns 0 only with a complete validated injected QUIC result", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const stdout = vi.fn();
    const stderr = vi.fn();
    const output = path.join(paths.root, "evidence", "preflight.json");
    const exitCode = await runPreflightCli([
      "--plist", paths.plistPath,
      "--output", output,
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
      "--expected-plist-sha256", FIXTURE_PLIST_SHA256,
      "--expected-binary-sha256", FIXTURE_BINARY_SHA256,
      "--expected-binary-version", "2026.5.2",
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      stdout,
      stderr,
      quicProbe: successfulQuicProbe,
      runtimeArgvReader: runtimeArgvReader(remoteArguments(paths)),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
      watchPath: noEventWatchPath,
    });
    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      '{"schema":"homecook.cloudflare-tunnel-preflight","version":1,"success":true,"evidence_written":true}\n',
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.stringify(stdout.mock.calls)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(SECRET_MARKER);

    const failedWriteExit = await runPreflightCli([
      "--plist", paths.plistPath,
      "--output", path.join(paths.root, "other", "preflight.json"),
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
      "--expected-plist-sha256", FIXTURE_PLIST_SHA256,
      "--expected-binary-sha256", FIXTURE_BINARY_SHA256,
      "--expected-binary-version", "2026.5.2",
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      writeEvidence: vi.fn().mockRejectedValue(new Error(SECRET_MARKER)),
      stdout,
      stderr,
      quicProbe: successfulQuicProbe,
      runtimeArgvReader: runtimeArgvReader(remoteArguments(paths)),
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(failedWriteExit).toBe(1);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(SECRET_MARKER);
  });

  it("rejects repository output before spawning any command", async () => {
    const paths = await fixturePaths();
    const runner = vi.fn();
    const stderr = vi.fn();
    const exitCode = await runPreflightCli([
      "--plist", paths.plistPath,
      "--output", path.join(process.cwd(), "preflight.json"),
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
      "--expected-plist-sha256", FIXTURE_PLIST_SHA256,
      "--expected-binary-sha256", FIXTURE_BINARY_SHA256,
      "--expected-binary-version", "2026.5.2",
    ], { runner, stderr, stdout: vi.fn(), platform: TEST_PLATFORM });
    expect(exitCode).toBe(1);
    expect(runner).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("cloudflare-tunnel-preflight: FAIL (redacted)\n");
  });

  it("writes a fail-closed verdict when the plist snapshot is unavailable", async () => {
    const paths = await fixturePaths();
    const { runner: baseRunner } = happyRunner(paths);
    const runner = vi.fn((candidate) => candidate.command === SYSTEM_TOOLS.plutil
      ? failedResult()
      : baseRunner(candidate));
    const output = path.join(paths.root, "missing-plist-evidence", "preflight.json");
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exitCode = await runPreflightCli([
      "--plist", paths.plistPath,
      "--output", output,
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
      "--expected-plist-sha256", FIXTURE_PLIST_SHA256,
      "--expected-binary-sha256", FIXTURE_BINARY_SHA256,
      "--expected-binary-version", "2026.5.2",
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      stdout,
      stderr,
      quicProbe: successfulQuicProbe,
      trustedBinaryRoots: [paths.root],
      trustedPlistPaths: [paths.plistPath],
    });
    expect(exitCode).toBe(1);
    const evidence = JSON.parse(await readFile(output, "utf8"));
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });
});
