import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPreflightEvidence,
  classifyManagementMode,
  evaluateReleaseGate,
  parseDnsOutput,
  redactArguments,
} from "../scripts/lib/cloudflare-tunnel-preflight.mjs";
import {
  CHECK_INVOCATIONS,
  collectCloudflareTunnelPreflight,
  createPreflightRunner,
  runAllowedPreflightCommand,
  runPreflightCli,
  writePreflightEvidence,
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

async function privateRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "homecook-cloudflare-preflight-"));
  createdRoots.push(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

function successResult(stdout = "") {
  return { exit_code: 0, stdout, stderr: "", timed_out: false };
}

function failedResult(stderr = "blocked") {
  return { exit_code: 1, stdout: "", stderr, timed_out: false };
}

function successfulChecks(): Record<string, CheckResult> {
  return {
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
    binary_path_hash: `sha256:${"a".repeat(64)}`,
    binary_version: "2026.5.2",
    binary_sha256: `sha256:${"b".repeat(64)}`,
    plist_sha256: `sha256:${"c".repeat(64)}`,
    arguments_sha256: `sha256:${"d".repeat(64)}`,
    token_file_path_hash: `sha256:${"e".repeat(64)}`,
    token_file_mode: "0600",
    launchd_state: "running",
    tunnel_state: "running",
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("management mode and release gate", () => {
  it("treats token-file execution as remotely-managed even when config is present", () => {
    expect(classifyManagementMode([
      "tunnel",
      "--config",
      "/private/local.yml",
      "run",
      "--token-file",
      "/private/token",
    ], { config_exists: true, local_ingress_config: true })).toEqual({
      mode: "remotely-managed",
      success: true,
      config_required: false,
    });
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
      verified_at: "2026-08-07T12:59:59.000Z",
      platform: TEST_PLATFORM,
    }, TEST_PLATFORM, "2026-08-09T13:00:00.000Z")).toMatchObject({
      success: false,
      error: "STALE_METADATA",
    });
  });
});

describe("pure parsing and evidence projection", () => {
  it("requires valid DNS addresses but never returns the raw addresses", () => {
    expect(parseDnsOutput("198.41.192.1\n2606:4700:a0::1\n")).toEqual({
      success: true,
      address_count: 2,
    });
    expect(parseDnsOutput("not-an-address\n")).toEqual({
      success: false,
      address_count: 0,
    });
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
    expect(evidence.checks.token_path_mode).toEqual({
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
    expect(seen.filter(({ command }) => command === "nc").every(({ args }) =>
      args.at(-1) === "7844"
      && ["region1.v2.argotunnel.com", "region2.v2.argotunnel.com"].includes(args.at(-2) ?? "")
    )).toBe(true);
    expect(seen.find(({ command }) => command === "curl")?.args).toContain("HEAD");
    expect(seen.find(({ command }) => command === "curl")?.args.at(-1)).toBe(
      "https://api.cloudflare.com/client/v4/",
    );
  });

  it.each([
    ["cloudflared", ["tunnel", "diag"]],
    ["nc", ["-vz", "-w", "3", "example.com", "7844"]],
    ["nc", ["-vz", "-w", "3", "region1.v2.argotunnel.com", "22"]],
    ["curl", ["--request", "POST", "https://api.cloudflare.com/client/v4/"]],
    ["curl", ["--request", "HEAD", "http://api.cloudflare.com/client/v4/"]],
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

  function happyRunner(paths: Awaited<ReturnType<typeof fixturePaths>>) {
    const invocations: Array<{ command: string; args: string[] }> = [];
    const runner = vi.fn(async ({ command, args }) => {
      invocations.push({ command, args });
      if (command === "plutil") {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: [
            paths.binaryPath,
            "tunnel",
            "run",
            "--token-file",
            paths.tokenPath,
          ],
        }));
      }
      if (command === paths.binaryPath && args[0] === "--version") {
        return successResult("cloudflared version 2026.5.2");
      }
      if (command === "launchctl") {
        return successResult("state = running\npid = 123\n");
      }
      if (command === "dig") {
        return successResult("198.41.192.1\n2606:4700:a0::1\n");
      }
      return successResult();
    });
    return { runner, invocations };
  }

  it("snapshots a remotely-managed tunnel without reading token-file contents or invoking diag", async () => {
    const paths = await fixturePaths();
    const base = happyRunner(paths);
    const runner = vi.fn(async (invocation) => {
      if (invocation.command === "plutil") {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: [
            paths.binaryPath,
            "tunnel",
            "--config",
            paths.tokenPath,
            "run",
            "--token-file",
            paths.tokenPath,
          ],
        }));
      }
      return base.runner(invocation);
    });
    const readTextFile = vi.fn(async () => {
      throw new Error("token-file content access forbidden");
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, { runner, readTextFile });

    expect(evidence.success).toBe(true);
    expect(evidence.management_mode).toBe("remotely-managed");
    expect(evidence.snapshot.token_file_mode).toBe("0600");
    expect(JSON.stringify(evidence)).not.toContain(paths.tokenPath);
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(base.invocations.filter(({ args }) => args.join(" ").includes("tunnel diag"))).toHaveLength(0);
    expect(base.invocations.filter(({ command }) => command === paths.binaryPath)).toEqual([
      { command: paths.binaryPath, args: ["--version"] },
    ]);
  });

  it("fails token safety for non-0600 mode without reading or exposing contents", async () => {
    const paths = await fixturePaths({ tokenMode: 0o644 });
    const { runner } = happyRunner(paths);
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, { runner });
    expect(evidence.success).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });

  it("validates local ingress only for a clearly locally-managed tunnel", async () => {
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
    const invocations: Array<{ command: string; args: string[] }> = [];
    const runner = vi.fn(async ({ command, args }) => {
      invocations.push({ command, args });
      if (command === "plutil") {
        return successResult(JSON.stringify({
          Label: "com.homecook.cloudflare-tunnel",
          Program: paths.binaryPath,
          ProgramArguments: [
            paths.binaryPath,
            "tunnel",
            `--config=${configPath}`,
            "run",
            "homecook",
          ],
        }));
      }
      if (command === paths.binaryPath && args[0] === "--version") {
        return successResult("cloudflared version 2026.5.2");
      }
      if (command === "launchctl") return successResult("state = running\npid = 123\n");
      if (command === "dig") return successResult("198.41.192.1\n");
      return successResult();
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, { runner });
    expect(evidence.success).toBe(true);
    expect(evidence.management_mode).toBe("locally-managed");
    expect(evidence.checks.config).toMatchObject({ attempted: true, success: true });
    expect(invocations.filter(({ args }) => args.includes("validate"))).toEqual([{
      command: paths.binaryPath,
      args: ["tunnel", "--config", configPath, "ingress", "validate"],
    }]);
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
      if (failure === "dns" && command === "dig") return failedResult();
      if (failure === "malformed-dns" && command === "dig") return successResult("garbage");
      if (failure === "udp" && command === "nc" && args.includes("-u")) return failedResult();
      if (failure === "tcp" && command === "nc" && !args.includes("-u")) return failedResult();
      if (failure === "management" && command === "curl") return failedResult();
      if (failure === "timeout" && command === "nc" && args.includes("-u")) {
        return { exit_code: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER, timed_out: true };
      }
      if (failure === "missing-command" && command === "dig") throw new Error("ENOENT");
      return base.runner(invocation);
    });
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: paths.plistPath,
      output: path.join(paths.root, "evidence", "preflight.json"),
      stable_release: {
        version: "2026.5.2",
        verified_at: "2026-08-09T13:00:00.000Z",
        platform: TEST_PLATFORM,
      },
      captured_at: "2026-08-09T13:01:00.000Z",
      platform: TEST_PLATFORM,
    }, { runner });
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

  it("keeps stdout/stderr fixed and returns 0 only after successful evidence write", async () => {
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
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      stdout,
      stderr,
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
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      writeEvidence: vi.fn().mockRejectedValue(new Error(SECRET_MARKER)),
      stdout,
      stderr,
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
    ], { runner, stderr, stdout: vi.fn(), platform: TEST_PLATFORM });
    expect(exitCode).toBe(1);
    expect(runner).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("cloudflare-tunnel-preflight: FAIL (redacted)\n");
  });

  it("writes a fail-closed verdict when the plist snapshot is unavailable", async () => {
    const paths = await fixturePaths();
    const { runner } = happyRunner(paths);
    const output = path.join(paths.root, "missing-plist-evidence", "preflight.json");
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exitCode = await runPreflightCli([
      "--plist", path.join(paths.root, "missing.plist"),
      "--output", output,
      "--stable-version", "2026.5.2",
      "--stable-verified-at", "2026-08-09T13:00:00.000Z",
      "--stable-platform", TEST_PLATFORM,
    ], {
      runner,
      now: () => new Date("2026-08-09T13:01:00.000Z"),
      platform: TEST_PLATFORM,
      stdout,
      stderr,
    });
    expect(exitCode).toBe(1);
    const evidence = JSON.parse(await readFile(output, "utf8"));
    expect(evidence.success).toBe(false);
    expect(evidence.checks.snapshot.error).toBe("SNAPSHOT_INCOMPLETE");
    expect(JSON.stringify(evidence)).not.toContain(SECRET_MARKER);
  });
});
