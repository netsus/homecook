#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCloudflaredVersion,
  parseLaunchctlPrint,
} from "./lib/cloudflare-tunnel-diagnostics.mjs";
import {
  buildPreflightEvidence,
  classifyManagementMode,
  evaluateReleaseGate,
  extractManagedPaths,
  hashEvidenceValue,
  parseDnsOutput,
  redactArguments,
} from "./lib/cloudflare-tunnel-preflight.mjs";
import { writeEvidenceFile } from "./cloudflare-tunnel-diagnostics.mjs";

const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const DEFAULT_PLIST = "/Users/cwj/Library/LaunchAgents/com.homecook.cloudflare-tunnel.plist";
const LAUNCH_AGENT_LABEL = "com.homecook.cloudflare-tunnel";
const TUNNEL_HOSTNAMES = Object.freeze([
  "region1.v2.argotunnel.com",
  "region2.v2.argotunnel.com",
]);
const MANAGEMENT_API_URL = "https://api.cloudflare.com/client/v4/";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1_024;

function invocation(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return Object.freeze({ command, args: Object.freeze(args), timeout_ms: timeoutMs });
}

export const CHECK_INVOCATIONS = Object.freeze({
  dns: Object.freeze(TUNNEL_HOSTNAMES.flatMap((hostname) => [
    invocation("dig", ["+short", "A", hostname]),
    invocation("dig", ["+short", "AAAA", hostname]),
  ])),
  udp_7844: Object.freeze(TUNNEL_HOSTNAMES.map((hostname) =>
    invocation("nc", ["-u", "-v", "-z", "-w", "3", hostname, "7844"])
  )),
  tcp_7844: Object.freeze(TUNNEL_HOSTNAMES.map((hostname) =>
    invocation("nc", ["-v", "-z", "-w", "3", hostname, "7844"])
  )),
  management_api_https: Object.freeze([
    invocation("curl", [
      "--disable",
      "--request",
      "HEAD",
      "--silent",
      "--show-error",
      "--output",
      "/dev/null",
      "--max-time",
      "5",
      MANAGEMENT_API_URL,
    ]),
  ]),
});

function sameInvocation(left, right) {
  return left.command === right.command
    && JSON.stringify(left.args) === JSON.stringify(right.args)
    && left.timeout_ms === right.timeout_ms;
}

function isConnectivityInvocation(candidate) {
  return Object.values(CHECK_INVOCATIONS).flat().some((allowed) =>
    sameInvocation(candidate, allowed)
  );
}

function isInternalSnapshotInvocation({ command, args, timeout_ms: timeoutMs }) {
  if (timeoutMs !== DEFAULT_TIMEOUT_MS || !Array.isArray(args)) {
    return false;
  }
  if (command === "plutil") {
    return args.length === 5
      && JSON.stringify(args.slice(0, 4)) === JSON.stringify(["-convert", "json", "-o", "-"])
      && path.isAbsolute(args[4]);
  }
  if (command === "launchctl") {
    return args.length === 2
      && args[0] === "print"
      && /^gui\/[1-9][0-9]*\/com\.homecook\.cloudflare-tunnel$/u.test(args[1]);
  }
  if (path.isAbsolute(command) && args.length === 1 && args[0] === "--version") {
    return true;
  }
  return path.isAbsolute(command)
    && args.length === 5
    && args[0] === "tunnel"
    && args[1] === "--config"
    && path.isAbsolute(args[2])
    && args[3] === "ingress"
    && args[4] === "validate";
}

function assertInvocationAllowed(candidate) {
  if (!isConnectivityInvocation(candidate) && !isInternalSnapshotInvocation(candidate)) {
    throw new Error("Command rejected by the preflight read-only allowlist.");
  }
}

function resultShape({
  exitCode = 1,
  stdout = "",
  stderr = "",
  timedOut = false,
  outputOverflow = false,
} = {}) {
  return {
    exit_code: Number.isInteger(exitCode) ? exitCode : 1,
    stdout: String(stdout ?? ""),
    stderr: String(stderr ?? ""),
    timed_out: timedOut === true,
    output_overflow: outputOverflow === true,
  };
}

export function createPreflightRunner({
  spawnProcess = spawn,
  killGraceMs = 1_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  return (candidate) => {
    assertInvocationAllowed(candidate);
    return new Promise((resolve) => {
      const child = spawnProcess(candidate.command, candidate.args, {
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let outputOverflow = false;
      let outputBytes = 0;
      let settled = false;
      let killTimer = null;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimer(timeoutTimer);
        if (killTimer !== null) clearTimer(killTimer);
        resolve(result);
      };
      const timeoutTimer = setTimer(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimer(() => {
          if (!settled) child.kill("SIGKILL");
        }, killGraceMs);
      }, candidate.timeout_ms);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      const capture = (channel, chunk) => {
        if (outputOverflow) return;
        outputBytes += Buffer.byteLength(chunk, "utf8");
        if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
          outputOverflow = true;
          child.kill("SIGTERM");
          killTimer = setTimer(() => {
            if (!settled) child.kill("SIGKILL");
          }, killGraceMs);
          return;
        }
        if (channel === "stdout") stdout += chunk;
        else stderr += chunk;
      };
      child.stdout.on("data", (chunk) => capture("stdout", chunk));
      child.stderr.on("data", (chunk) => capture("stderr", chunk));
      child.on("error", () => finish(resultShape({ timedOut })));
      child.on("close", (code) => finish(resultShape({
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut,
        outputOverflow,
      })));
    });
  };
}

export const defaultRunner = createPreflightRunner();

async function runNormalized(runner, candidate) {
  assertInvocationAllowed(candidate);
  try {
    const result = await runner(candidate);
    return {
      ...resultShape({
        exitCode: result?.exit_code,
        stdout: result?.stdout,
        stderr: result?.stderr,
        timedOut: result?.timed_out,
        outputOverflow: result?.output_overflow,
      }),
      command_missing: false,
    };
  } catch {
    return { ...resultShape(), command_missing: true };
  }
}

export async function runAllowedPreflightCommand(runner, candidate) {
  if (!isConnectivityInvocation(candidate)) {
    throw new Error("Command rejected by the connectivity allowlist.");
  }
  return runNormalized(runner, candidate);
}

function failureCode(results, { malformed = false } = {}) {
  if (results.some((result) => result.timed_out)) return "TIMEOUT";
  if (results.some((result) => result.output_overflow)) return "OUTPUT_LIMIT";
  if (results.some((result) => result.command_missing)) return "COMMAND_MISSING";
  if (malformed) return "MALFORMED_OUTPUT";
  return results.every((result) => result.exit_code === 0) ? null : "CHECK_FAILED";
}

async function runCheck(runner, name, { now = Date.now } = {}) {
  const startedAt = now();
  const results = await Promise.all(CHECK_INVOCATIONS[name].map((candidate) =>
    runAllowedPreflightCommand(runner, candidate)
  ));
  let malformed = false;
  let success = results.every((result) =>
    result.exit_code === 0
    && !result.timed_out
    && !result.output_overflow
    && !result.command_missing
  );
  if (name === "dns") {
    malformed = results.some((result) => result.exit_code === 0 && !parseDnsOutput(result.stdout).success);
    success = success && !malformed;
  }
  return {
    attempted: true,
    success,
    latency_ms: Math.max(0, now() - startedAt),
    error: success ? null : failureCode(results, { malformed }),
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

function isOutsideRepository(canonicalPath) {
  const relativePath = path.relative(REPOSITORY_ROOT, canonicalPath);
  return relativePath !== ""
    && (relativePath.startsWith("..") || path.isAbsolute(relativePath));
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function isClearLocalIngressConfig(raw) {
  const text = String(raw ?? "");
  return /^\s*tunnel\s*:\s*\S+/mu.test(text)
    && /^\s*ingress\s*:\s*$/mu.test(text)
    && /^\s*-\s+hostname\s*:\s*\S+/mu.test(text);
}

async function inspectTokenFile(tokenFilePath) {
  if (typeof tokenFilePath !== "string" || !path.isAbsolute(tokenFilePath)) {
    return { safe: false, path_hash: null, mode: null };
  }
  try {
    const canonicalPath = await realpath(tokenFilePath);
    const tokenStats = await stat(canonicalPath);
    const mode = (tokenStats.mode & 0o777).toString(8).padStart(4, "0");
    return {
      safe: tokenStats.isFile()
        && isOutsideRepository(canonicalPath)
        && tokenStats.uid === process.getuid()
        && mode === "0600",
      path_hash: hashEvidenceValue(canonicalPath),
      mode,
    };
  } catch {
    return { safe: false, path_hash: null, mode: null };
  }
}

async function collectSnapshot(options, runner, { readTextFile = readFile } = {}) {
  const plistPath = await realpath(options.plist_path);
  const plistStats = await stat(plistPath);
  if (!plistStats.isFile()) throw new Error("Plist must be a regular file.");
  const plistSha256 = await hashFile(plistPath);
  const plistResult = await runNormalized(
    runner,
    invocation("plutil", ["-convert", "json", "-o", "-", plistPath]),
  );
  if (plistResult.exit_code !== 0 || plistResult.timed_out) {
    throw new Error("Plist parsing failed.");
  }
  let plist;
  try {
    plist = JSON.parse(plistResult.stdout);
  } catch {
    throw new Error("Plist output was malformed.");
  }
  const programArguments = Array.isArray(plist?.ProgramArguments)
    ? plist.ProgramArguments.filter((item) => typeof item === "string")
    : [];
  const configuredBinary = typeof plist?.Program === "string"
    ? plist.Program
    : programArguments[0];
  if (!path.isAbsolute(configuredBinary ?? "") || programArguments.length === 0) {
    throw new Error("Plist program arguments are incomplete.");
  }
  if (plist.Label !== LAUNCH_AGENT_LABEL) {
    throw new Error("Unexpected launch agent label.");
  }
  const binaryPath = await realpath(configuredBinary);
  const binaryStats = await stat(binaryPath);
  if (!binaryStats.isFile() || (binaryStats.mode & 0o111) === 0) {
    throw new Error("Configured binary is not executable.");
  }
  const versionResult = await runNormalized(runner, invocation(configuredBinary, ["--version"]));
  const parsedVersion = versionResult.exit_code === 0
    ? parseCloudflaredVersion(versionResult.stdout)
    : { available: false, version: null };
  const launchctlResult = await runNormalized(runner, invocation("launchctl", [
    "print",
    `gui/${process.getuid()}/${LAUNCH_AGENT_LABEL}`,
  ]));
  const launchd = launchctlResult.exit_code === 0
    ? parseLaunchctlPrint(launchctlResult.stdout)
    : { loaded: false, state: "unavailable" };
  const tunnelState = launchd.loaded
    && launchd.state === "running"
    && /^\s*pid\s*=\s*[1-9][0-9]*\s*$/mu.test(launchctlResult.stdout)
    ? "running"
    : launchd.loaded ? "not_running" : "unavailable";
  const managedPaths = extractManagedPaths(programArguments);
  const initialManagement = classifyManagementMode(programArguments);
  const inspectLocalConfig = initialManagement.mode !== "remotely-managed";
  const configStats = inspectLocalConfig && managedPaths.config
    ? await safeStat(managedPaths.config)
    : null;
  const configExists = configStats?.isFile() === true;
  const configContents = configExists ? await readTextFile(managedPaths.config, "utf8") : "";
  const localIngressConfig = configExists && isClearLocalIngressConfig(configContents);
  const management = initialManagement.mode === "remotely-managed"
    ? initialManagement
    : classifyManagementMode(programArguments, {
      config_exists: configExists,
      local_ingress_config: localIngressConfig,
    });
  const token = await inspectTokenFile(managedPaths.token_file);
  const redactedArguments = redactArguments(programArguments);
  const snapshot = {
    complete: parsedVersion.available && launchd.loaded,
    binary_path_hash: hashEvidenceValue(binaryPath),
    binary_version: parsedVersion.version,
    binary_sha256: await hashFile(binaryPath),
    plist_sha256: plistSha256,
    arguments_sha256: hashEvidenceValue(JSON.stringify(redactedArguments)),
    token_file_path_hash: token.path_hash,
    token_file_mode: token.mode,
    launchd_state: launchd.state,
    tunnel_state: tunnelState,
    stable_metadata_sha256: hashEvidenceValue(JSON.stringify(options.stable_release)),
  };
  return {
    snapshot,
    management,
    tokenSafe: token.safe && !managedPaths.inline_token_present,
    configPath: managedPaths.config,
    configExists,
    localIngressConfig,
    binaryPath: configuredBinary,
  };
}

function incompleteSnapshot(stableRelease) {
  return {
    complete: false,
    binary_path_hash: null,
    binary_version: null,
    binary_sha256: null,
    plist_sha256: null,
    arguments_sha256: null,
    token_file_path_hash: null,
    token_file_mode: null,
    launchd_state: "unavailable",
    tunnel_state: "unavailable",
    stable_metadata_sha256: hashEvidenceValue(JSON.stringify(stableRelease)),
  };
}

async function configCheck(snapshotState, runner, now) {
  if (snapshotState.management.mode === "remotely-managed") {
    return { attempted: false, success: true, latency_ms: null, error: null };
  }
  if (
    snapshotState.management.mode !== "locally-managed"
    || !snapshotState.configExists
    || !snapshotState.localIngressConfig
    || !path.isAbsolute(snapshotState.configPath ?? "")
  ) {
    return { attempted: false, success: false, latency_ms: null, error: "CONFIG_MISSING" };
  }
  const startedAt = now();
  const result = await runNormalized(runner, invocation(snapshotState.binaryPath, [
    "tunnel",
    "--config",
    snapshotState.configPath,
    "ingress",
    "validate",
  ]));
  const success = result.exit_code === 0 && !result.timed_out && !result.command_missing;
  return {
    attempted: true,
    success,
    latency_ms: Math.max(0, now() - startedAt),
    error: success ? null : failureCode([result]),
  };
}

export async function collectCloudflareTunnelPreflight(options, dependencies = {}) {
  const runner = dependencies.runner ?? defaultRunner;
  const now = dependencies.monotonicNow ?? Date.now;
  const platform = options.platform ?? `${process.platform}-${process.arch}`;
  let snapshotState;
  try {
    snapshotState = await collectSnapshot(options, runner, {
      readTextFile: dependencies.readTextFile,
    });
  } catch {
    snapshotState = {
      snapshot: incompleteSnapshot(options.stable_release),
      management: { mode: "unknown", success: false },
      tokenSafe: false,
      configPath: null,
      configExists: false,
      localIngressConfig: false,
      binaryPath: null,
    };
  }
  const [dns, udp, tcp, managementApi, config] = await Promise.all([
    runCheck(runner, "dns", { now }),
    runCheck(runner, "udp_7844", { now }),
    runCheck(runner, "tcp_7844", { now }),
    runCheck(runner, "management_api_https", { now }),
    configCheck(snapshotState, runner, now),
  ]);
  const releaseGate = evaluateReleaseGate(
    snapshotState.snapshot.binary_version,
    options.stable_release,
    platform,
    options.captured_at,
  );
  return buildPreflightEvidence({
    timestamp: options.captured_at,
    platform,
    management_mode: snapshotState.management.mode,
    management_mode_success: snapshotState.management.success,
    snapshot: snapshotState.snapshot,
    token_path_mode_safe: snapshotState.tokenSafe,
    checks: {
      dns,
      udp_7844: udp,
      tcp_7844: tcp,
      management_api_https: managementApi,
      config,
      update_gate: {
        attempted: true,
        success: releaseGate.success,
        latency_ms: 0,
        error: releaseGate.error,
      },
    },
  });
}

function canonicalizeProspectivePath(targetPath) {
  let existingAncestor = path.resolve(targetPath);
  const missingSegments = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  return path.join(realpathSync(existingAncestor), ...missingSegments);
}

function assertOutputOutsideRepository(outputPath) {
  const canonicalOutput = canonicalizeProspectivePath(outputPath);
  if (!isOutsideRepository(canonicalOutput)) {
    throw new Error("--output must be outside the repository.");
  }
}

function parseArgs(argv) {
  const options = { plist_path: DEFAULT_PLIST };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    switch (argument) {
      case "--plist":
        options.plist_path = value;
        index += 1;
        break;
      case "--output":
        options.output = value;
        index += 1;
        break;
      case "--stable-version":
        options.stable_version = value;
        index += 1;
        break;
      case "--stable-verified-at":
        options.stable_verified_at = value;
        index += 1;
        break;
      case "--stable-platform":
        options.stable_platform = value;
        index += 1;
        break;
      default:
        throw new Error("Unsupported preflight argument.");
    }
  }
  for (const [name, value] of Object.entries({
    plist: options.plist_path,
    output: options.output,
  })) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
      throw new Error(`--${name} must be an absolute path.`);
    }
  }
  assertOutputOutsideRepository(options.output);
  if (!/^\d+\.\d+\.\d+$/u.test(options.stable_version ?? "")) {
    throw new Error("Verified stable version is required.");
  }
  if (!Number.isFinite(Date.parse(options.stable_verified_at ?? ""))) {
    throw new Error("Verified stable timestamp is required.");
  }
  if (!/^(?:darwin|linux)-(?:arm64|x64)$/u.test(options.stable_platform ?? "")) {
    throw new Error("Verified stable platform is required.");
  }
  return options;
}

export async function writePreflightEvidence(outputPath, evidence) {
  return writeEvidenceFile(outputPath, evidence);
}

export async function runPreflightCli(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  const writeEvidence = dependencies.writeEvidence ?? writePreflightEvidence;
  try {
    const options = parseArgs(argv);
    const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const platform = dependencies.platform ?? `${process.platform}-${process.arch}`;
    const evidence = await collectCloudflareTunnelPreflight({
      plist_path: options.plist_path,
      output: options.output,
      captured_at: capturedAt,
      platform,
      stable_release: {
        version: options.stable_version,
        verified_at: options.stable_verified_at,
        platform: options.stable_platform,
      },
    }, { runner: dependencies.runner ?? defaultRunner });
    await writeEvidence(options.output, evidence);
    stdout(`${JSON.stringify({
      schema: evidence.schema,
      version: evidence.version,
      success: evidence.success,
      evidence_written: true,
    })}\n`);
    if (!evidence.success) {
      stderr("cloudflare-tunnel-preflight: FAIL (redacted)\n");
      return 1;
    }
    return 0;
  } catch {
    stderr("cloudflare-tunnel-preflight: FAIL (redacted)\n");
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await runPreflightCli(process.argv.slice(2));
}
