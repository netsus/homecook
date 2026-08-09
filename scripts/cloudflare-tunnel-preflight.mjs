#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream, existsSync, realpathSync, statSync, watch } from "node:fs";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLaunchctlPrint } from "./lib/cloudflare-tunnel-diagnostics.mjs";
import {
  buildPreflightEvidence, CLOUDFLARE_TUNNEL_ENDPOINTS,
  evaluateReleaseGate, hashEvidenceValue, parseDnsOutput,
  isCanonicalCloudflaredVersion, parseCloudflaredArguments, parseTunnelMetrics,
} from "./lib/cloudflare-tunnel-preflight.mjs";
import { writeEvidenceFile } from "./cloudflare-tunnel-diagnostics.mjs";

const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const DEFAULT_PLIST = "/Users/cwj/Library/LaunchAgents/com.homecook.cloudflare-tunnel.plist";
const LAUNCH_AGENT_LABEL = "com.homecook.cloudflare-tunnel";
const MANAGEMENT_API_URL = "https://api.cloudflare.com/client/v4/";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1_024;
const MINIMAL_ENV = Object.freeze({ PATH: "/usr/bin:/bin:/usr/sbin", LANG: "C", LC_ALL: "C" });
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export const DEFAULT_TRUSTED_BINARY_ROOTS = Object.freeze([
  "/opt/homebrew/Cellar/cloudflared",
  "/usr/local/Cellar/cloudflared",
  "/usr/local/bin",
  "/usr/bin",
]);

export const SYSTEM_TOOLS = Object.freeze({
  dig: "/usr/bin/dig", nc: "/usr/bin/nc", curl: "/usr/bin/curl",
  plutil: "/usr/bin/plutil", launchctl: "/bin/launchctl", lsof: "/usr/sbin/lsof",
});

const TUNNEL_HOSTNAMES = Object.freeze(Object.keys(CLOUDFLARE_TUNNEL_ENDPOINTS));

function invocation(command, args, timeoutMs = DEFAULT_TIMEOUT_MS, trust = {}) {
  return Object.freeze({ command, args: Object.freeze(args), timeout_ms: timeoutMs, ...trust });
}

export const CHECK_INVOCATIONS = Object.freeze({
  dns: Object.freeze(TUNNEL_HOSTNAMES.flatMap((hostname) => [
    invocation(SYSTEM_TOOLS.dig, ["+short", "A", hostname]),
    invocation(SYSTEM_TOOLS.dig, ["+short", "AAAA", hostname]),
  ])),
  udp_7844: Object.freeze([]),
  tcp_7844: Object.freeze([]),
  management_api_https: Object.freeze([invocation(SYSTEM_TOOLS.curl, [
    "--disable", "--request", "HEAD", "--silent", "--show-error", "--output", "/dev/null",
    "--max-time", "5", MANAGEMENT_API_URL,
  ])]),
});

export function createTcpInvocation(hostname, addressFamily, address) {
  const family = addressFamily === "ipv4" ? "-4" : addressFamily === "ipv6" ? "-6" : null;
  if (!family || !CLOUDFLARE_TUNNEL_ENDPOINTS[hostname]?.[addressFamily]?.includes(address)) {
    throw new Error("Transport target rejected by the preflight allowlist.");
  }
  return invocation(SYSTEM_TOOLS.nc, [family, "-v", "-z", "-w", "3", address, "7844"]);
}

function metricsInvocation(port) {
  if (!Number.isInteger(port) || port < 20241 || port > 20245) throw new Error("Metrics port rejected.");
  return invocation(SYSTEM_TOOLS.curl, [
    "--disable", "--request", "GET", "--silent", "--show-error", "--max-time", "5",
    `http://127.0.0.1:${port}/metrics`,
  ]);
}

function sameInvocation(left, right) {
  return left.command === right.command && JSON.stringify(left.args) === JSON.stringify(right.args)
    && left.timeout_ms === right.timeout_ms;
}

function isTcpInvocation(candidate) {
  if (candidate.command !== SYSTEM_TOOLS.nc || candidate.timeout_ms !== DEFAULT_TIMEOUT_MS
    || candidate.args.length !== 7 || candidate.args[6] !== "7844") return false;
  const family = candidate.args[0] === "-4" ? "ipv4" : candidate.args[0] === "-6" ? "ipv6" : null;
  const address = candidate.args[5];
  return family !== null && isIP(address) === (family === "ipv4" ? 4 : 6)
    && TUNNEL_HOSTNAMES.some((host) => CLOUDFLARE_TUNNEL_ENDPOINTS[host][family].includes(address));
}

function isMetricsInvocation(candidate) {
  if (candidate.command !== SYSTEM_TOOLS.curl || candidate.timeout_ms !== DEFAULT_TIMEOUT_MS) return false;
  const match = candidate.args.at(-1)?.match(/^http:\/\/127\.0\.0\.1:(2024[1-5])\/metrics$/u);
  return Boolean(match) && JSON.stringify(candidate.args.slice(0, -1)) === JSON.stringify([
    "--disable", "--request", "GET", "--silent", "--show-error", "--max-time", "5",
  ]);
}

function isConnectivityInvocation(candidate) {
  return Object.values(CHECK_INVOCATIONS).flat().some((allowed) => sameInvocation(candidate, allowed))
    || isTcpInvocation(candidate) || isMetricsInvocation(candidate);
}

function isInternalInvocation(candidate) {
  const { command, args, timeout_ms: timeoutMs } = candidate;
  if (timeoutMs !== DEFAULT_TIMEOUT_MS || !Array.isArray(args)) return false;
  if (command === SYSTEM_TOOLS.plutil) return JSON.stringify(args)
    === JSON.stringify(["-convert", "json", "-o", "-", "-"])
    && Buffer.isBuffer(candidate.input)
    && candidate.input.length > 0
    && candidate.input.length <= MAX_COMMAND_OUTPUT_BYTES;
  if (command === SYSTEM_TOOLS.launchctl) return args.length === 2 && args[0] === "print"
    && /^gui\/[1-9][0-9]*\/com\.homecook\.cloudflare-tunnel$/u.test(args[1]);
  if (command === SYSTEM_TOOLS.lsof) return args.every((arg) => typeof arg === "string")
    && args.includes("-a") && args.some((arg) => /^-p[1-9][0-9]*$/u.test(arg));
  return false;
}

function assertInvocationAllowed(candidate) {
  if (!isConnectivityInvocation(candidate) && !isInternalInvocation(candidate)) {
    throw new Error("Command rejected by the preflight read-only allowlist.");
  }
}

function validateSystemExecutable(command) {
  if (!Object.values(SYSTEM_TOOLS).includes(command)) return;
  const canonical = realpathSync(command);
  const stats = statSync(canonical);
  if (canonical !== command || !stats.isFile() || stats.uid !== 0 || (stats.mode & 0o022) !== 0
    || (stats.mode & 0o111) === 0) throw new Error("Untrusted system executable.");
}

function resultShape({ exitCode = 1, stdout = "", stderr = "", timedOut = false,
  outputOverflow = false } = {}) {
  return { exit_code: Number.isInteger(exitCode) ? exitCode : 1, stdout: String(stdout ?? ""),
    stderr: String(stderr ?? ""), timed_out: timedOut === true, output_overflow: outputOverflow === true };
}

export function createPreflightRunner({ spawnProcess = spawn, killGraceMs = 1_000,
  setTimer = setTimeout, clearTimer = clearTimeout, validateExecutable = validateSystemExecutable } = {}) {
  return (candidate) => {
    assertInvocationAllowed(candidate);
    validateExecutable(candidate.command);
    return new Promise((resolve) => {
      const child = spawnProcess(candidate.command, candidate.args, {
        env: MINIMAL_ENV, shell: false,
        stdio: [candidate.input ? "pipe" : "ignore", "pipe", "pipe"],
      });
      if (candidate.input) child.stdin.end(candidate.input);
      let stdout = ""; let stderr = ""; let timedOut = false; let outputOverflow = false;
      let outputBytes = 0; let settled = false; let killTimer = null;
      const finish = (result) => {
        if (settled) return;
        settled = true; clearTimer(timeoutTimer); if (killTimer !== null) clearTimer(killTimer); resolve(result);
      };
      const terminate = () => {
        child.kill("SIGTERM");
        killTimer = setTimer(() => { if (!settled) child.kill("SIGKILL"); }, killGraceMs);
      };
      const timeoutTimer = setTimer(() => { timedOut = true; terminate(); }, candidate.timeout_ms);
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      const capture = (channel, chunk) => {
        if (outputOverflow) return;
        outputBytes += Buffer.byteLength(chunk, "utf8");
        if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) { outputOverflow = true; terminate(); return; }
        if (channel === "stdout") stdout += chunk; else stderr += chunk;
      };
      child.stdout.on("data", (chunk) => capture("stdout", chunk));
      child.stderr.on("data", (chunk) => capture("stderr", chunk));
      child.on("error", () => finish(resultShape({ timedOut })));
      child.on("close", (code) => finish(resultShape({ exitCode: code ?? 1, stdout, stderr,
        timedOut, outputOverflow })));
    });
  };
}

export const defaultRunner = createPreflightRunner();

async function runNormalized(runner, candidate) {
  assertInvocationAllowed(candidate);
  try {
    const result = await runner(candidate);
    return { ...resultShape({ exitCode: result?.exit_code, stdout: result?.stdout,
      stderr: result?.stderr, timedOut: result?.timed_out, outputOverflow: result?.output_overflow }),
    command_missing: result?.command_missing === true };
  } catch { return { ...resultShape(), command_missing: true }; }
}

export async function runAllowedPreflightCommand(runner, candidate) {
  if (!isConnectivityInvocation(candidate)) throw new Error("Command rejected by the connectivity allowlist.");
  return runNormalized(runner, candidate);
}

function failureCode(results, { malformed = false } = {}) {
  if (results.some((result) => result.timed_out)) return "TIMEOUT";
  if (results.some((result) => result.output_overflow)) return "OUTPUT_LIMIT";
  if (results.some((result) => result.command_missing)) return "COMMAND_MISSING";
  if (malformed) return "MALFORMED_OUTPUT";
  return results.every((result) => result.exit_code === 0) ? null : "CHECK_FAILED";
}

function resultPassed(result, { stdoutRequired = false } = {}) {
  const stdoutPresent = typeof result?.stdout === "string"
    ? result.stdout.length > 0 : Buffer.isBuffer(result?.stdout) && result.stdout.length > 0;
  return result?.exit_code === 0 && result?.timed_out !== true
    && result?.output_overflow !== true && result?.command_missing !== true
    && (!stdoutRequired || stdoutPresent);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk)); stream.on("error", reject); stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

function hashBuffer(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashArgumentVector(args) {
  return hashEvidenceValue(JSON.stringify(args));
}

function modeString(stats) { return (stats.mode & 0o777).toString(8).padStart(4, "0"); }
function fileIdentity(stats) {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
}
function sameDeviceAndInode(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function isSafeOwnedFile(stats, { executable = false } = {}) {
  return stats.isFile() && [0, process.getuid()].includes(stats.uid) && (stats.mode & 0o022) === 0
    && (!executable || (stats.mode & 0o111) !== 0);
}
function isSafeOwnedDirectory(stats) {
  return stats.isDirectory() && [0, process.getuid()].includes(stats.uid) && (stats.mode & 0o022) === 0;
}
function isOutsideRepository(canonicalPath) {
  const relative = path.relative(REPOSITORY_ROOT, canonicalPath);
  return relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative));
}
function isWithinTrustedRoot(canonicalPath, trustedRoots) {
  return trustedRoots.some((root) => {
    const canonicalRoot = existsSync(root) ? realpathSync(root) : path.resolve(root);
    const relative = path.relative(canonicalRoot, canonicalPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}
async function safeStat(filePath) { try { return await stat(filePath); } catch { return null; } }
function isClearLocalIngressConfig(raw) {
  const text = String(raw ?? "");
  return /^\s*tunnel\s*:\s*\S+/mu.test(text) && /^\s*ingress\s*:\s*$/mu.test(text)
    && /^\s*-\s+hostname\s*:\s*\S+/mu.test(text);
}

async function inspectTokenFile(tokenFilePath) {
  if (typeof tokenFilePath !== "string" || !path.isAbsolute(tokenFilePath)) {
    return { safe: false, path_hash: null, mode: null };
  }
  try {
    const canonical = await realpath(tokenFilePath); const stats = await stat(canonical); const mode = modeString(stats);
    return { safe: isSafeOwnedFile(stats) && isOutsideRepository(canonical) && stats.uid === process.getuid()
      && mode === "0600", path_hash: hashEvidenceValue(canonical), mode };
  } catch { return { safe: false, path_hash: null, mode: null }; }
}

async function isExactTrustedPath(canonicalPath, trustedPaths) {
  for (const trustedPath of trustedPaths) {
    try {
      if (await realpath(trustedPath) === canonicalPath) return true;
    } catch {
      if (path.resolve(trustedPath) === canonicalPath) return true;
    }
  }
  return false;
}

async function hashFileHandle(fileHandle) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1_024);
  let position = 0;
  while (true) {
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return `sha256:${hash.digest("hex")}`;
}

async function inspectTrustedBinary(binaryPath, expectedSha256, expectedVersion, trustedRoots, {
  openFile = open,
  watchPath = watch,
} = {}) {
  if (!SHA256_PATTERN.test(expectedSha256 ?? "")
    || !isCanonicalCloudflaredVersion(expectedVersion)
    || !path.isAbsolute(binaryPath ?? "")) throw new Error("Verified binary metadata required.");
  const canonical = await realpath(binaryPath);
  const parent = await realpath(path.dirname(canonical));
  let changed = false;
  const markChanged = () => { changed = true; };
  const watchers = [];
  let fileHandle;
  try {
    fileHandle = await openFile(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    for (const target of [parent, canonical]) {
      const watcher = watchPath(target, { persistent: false }, markChanged);
      watcher.on?.("error", markChanged);
      watchers.push(watcher);
    }
    const [parentBefore, pathBefore, fdBefore] = await Promise.all([
      stat(parent), stat(canonical), fileHandle.stat(),
    ]);
    if (path.basename(canonical) !== "cloudflared" || !isOutsideRepository(canonical)
      || !isWithinTrustedRoot(canonical, trustedRoots)
      || !isSafeOwnedDirectory(parentBefore)
      || !isSafeOwnedFile(pathBefore, { executable: true })
      || !isSafeOwnedFile(fdBefore, { executable: true })
      || !sameDeviceAndInode(pathBefore, fdBefore)) throw new Error("Untrusted cloudflared binary.");
    const beforeHash = await hashFileHandle(fileHandle);
    if (beforeHash !== expectedSha256) throw new Error("Binary hash mismatch.");
    const binary = {
      path: canonical,
      path_hash: hashEvidenceValue(canonical),
      version: expectedVersion,
      sha256: beforeHash,
      mode: modeString(fdBefore),
    };
    return {
      binary,
      async verify() {
        const [canonicalAfter, parentAfter, pathAfter, fdAfter, afterHash] = await Promise.all([
          realpath(binaryPath), stat(parent), stat(canonical), fileHandle.stat(), hashFileHandle(fileHandle),
        ]);
        if (changed || canonicalAfter !== canonical
          || fileIdentity(parentBefore) !== fileIdentity(parentAfter)
          || !sameDeviceAndInode(pathAfter, fdAfter)
          || !sameDeviceAndInode(fdBefore, fdAfter)
          || fileIdentity(fdBefore) !== fileIdentity(fdAfter)
          || beforeHash !== afterHash) throw new Error("Binary identity changed during snapshot.");
      },
      async close() {
        for (const watcher of watchers) watcher.close();
        await fileHandle.close();
      },
    };
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    if (fileHandle) await fileHandle.close();
    throw error;
  }
}

function parsePid(raw) { return Number(raw.match(/^\s*pid\s*=\s*([1-9][0-9]*)\s*$/mu)?.[1] ?? 0); }
function parseRunningExecutable(raw) {
  return raw.split(/\r?\n/u).find((line) => line.startsWith("n/"))?.slice(1) ?? null;
}
export function parseKernProcArgs2(raw) {
  const failure = () => ({ success: false, executable_path: null, arguments: [] });
  if (!Buffer.isBuffer(raw) || raw.length < 8 || raw.length > MAX_COMMAND_OUTPUT_BYTES) {
    return failure();
  }
  const argc = raw.readInt32LE(0);
  if (!Number.isInteger(argc) || argc < 1 || argc > 256) return failure();
  const executableTerminator = raw.indexOf(0, 4);
  if (executableTerminator < 5 || raw[executableTerminator + 1] !== 0) return failure();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let executablePath;
  try { executablePath = decoder.decode(raw.subarray(4, executableTerminator)); }
  catch { return failure(); }
  if (executablePath.startsWith("\uFEFF")
    || !path.isAbsolute(executablePath) || path.normalize(executablePath) !== executablePath) return failure();
  let cursor = executableTerminator + 1;
  while (cursor < raw.length && raw[cursor] === 0) cursor += 1;
  const args = [];
  try {
    for (let index = 0; index < argc; index += 1) {
      const terminator = raw.indexOf(0, cursor);
      if (terminator < cursor) return failure();
      const argument = decoder.decode(raw.subarray(cursor, terminator));
      if (argument.startsWith("\uFEFF")) return failure();
      args.push(argument);
      cursor = terminator + 1;
    }
  } catch { return failure(); }
  if (args.length !== argc || args[0].length === 0) return failure();
  return { success: true, executable_path: executablePath, arguments: args };
}
function parseMetricsPort(raw, requested) {
  const ports = [...String(raw ?? "").matchAll(/n127\.0\.0\.1:(2024[1-5])/gu)].map((match) => Number(match[1]));
  if (requested) {
    const match = requested.match(/^127\.0\.0\.1:(2024[1-5])$/u);
    return match && ports.includes(Number(match[1])) ? Number(match[1]) : null;
  }
  return ports.length === 1 ? ports[0] : null;
}

async function unavailableRuntimeArgvReader() {
  return { exit_code: 1, stdout: Buffer.alloc(0), stderr: "", timed_out: false,
    output_overflow: false, command_missing: true };
}

async function collectRuntime(pid, expectedCandidate, configuredArgs, configuredParsed, runner,
  readRuntimeArgv = unavailableRuntimeArgvReader) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("PID unavailable.");
  const executableResult = await runNormalized(runner, invocation(SYSTEM_TOOLS.lsof,
    ["-a", `-p${pid}`, "-d", "txt", "-Fn"]));
  if (!resultPassed(executableResult, { stdoutRequired: true })) {
    throw new Error("Runtime executable unavailable.");
  }
  const executablePath = parseRunningExecutable(executableResult.stdout);
  if (!executablePath) throw new Error("Runtime executable unavailable.");
  const canonical = await realpath(executablePath); const stats = await stat(canonical);
  if (!isSafeOwnedFile(stats, { executable: true })) throw new Error("Runtime executable untrusted.");
  const sha256 = await hashFile(canonical);
  let argvResult;
  try { argvResult = await readRuntimeArgv(pid, { max_bytes: MAX_COMMAND_OUTPUT_BYTES }); }
  catch { argvResult = await unavailableRuntimeArgvReader(); }
  if (!resultPassed(argvResult, { stdoutRequired: true }) || !Buffer.isBuffer(argvResult.stdout)) {
    throw new Error("Runtime arguments unavailable.");
  }
  const parsedRuntime = parseKernProcArgs2(argvResult.stdout);
  const runtimeParsed = parseCloudflaredArguments(parsedRuntime.arguments);
  if (!parsedRuntime.success || !runtimeParsed.success) throw new Error("Runtime arguments malformed.");
  const runtimeArgumentsHash = hashArgumentVector(parsedRuntime.arguments.slice(1));
  const configuredArgumentsHash = hashArgumentVector(configuredArgs.slice(1));
  const canonicalExecutableHash = hashEvidenceValue(canonical);
  const runtimeExecutableHash = hashEvidenceValue(parsedRuntime.executable_path);
  const runtimeArgv0Hash = hashEvidenceValue(parsedRuntime.arguments[0]);
  if (canonical !== expectedCandidate.path || sha256 !== expectedCandidate.sha256
    || canonicalExecutableHash !== expectedCandidate.path_hash
    || parsedRuntime.executable_path !== canonical
    || parsedRuntime.arguments[0] !== canonical
    || runtimeExecutableHash !== expectedCandidate.path_hash
    || runtimeArgv0Hash !== expectedCandidate.path_hash
    || runtimeArgumentsHash !== configuredArgumentsHash
    || JSON.stringify(parsedRuntime.arguments) !== JSON.stringify(configuredArgs)) {
    throw new Error("Runtime identity mismatch.");
  }
  const listeners = await runNormalized(runner, invocation(SYSTEM_TOOLS.lsof,
    ["-a", `-p${pid}`, "-iTCP", "-sTCP:LISTEN", "-Pan", "-Fn"]));
  const metricsPort = resultPassed(listeners, { stdoutRequired: true })
    ? parseMetricsPort(listeners.stdout, configuredParsed.metrics) : null;
  if (!metricsPort) throw new Error("Metrics endpoint unavailable.");
  const metricsResult = await runAllowedPreflightCommand(runner, metricsInvocation(metricsPort));
  const metrics = resultPassed(metricsResult, { stdoutRequired: true })
    ? parseTunnelMetrics(metricsResult.stdout) : { success: false, version: null,
      active_connections: null, active_edge_locations: null };
  if (!metrics.success || metrics.version !== expectedCandidate.version) {
    throw new Error("Tunnel metrics unavailable.");
  }
  return { binary: {
    path: canonical,
    path_hash: hashEvidenceValue(canonical),
    version: metrics.version,
    sha256,
    mode: modeString(stats),
    arguments_sha256: runtimeArgumentsHash,
  }, metrics, port: metricsPort };
}

async function collectSnapshot(options, runner, {
  readTextFile = readFile,
  readRuntimeArgv = unavailableRuntimeArgvReader,
  trustedBinaryRoots = DEFAULT_TRUSTED_BINARY_ROOTS,
  trustedPlistPaths = [DEFAULT_PLIST],
  openFile = open,
  watchPath = watch,
} = {}) {
  const plistPath = await realpath(options.plist_path);
  if (!await isExactTrustedPath(plistPath, trustedPlistPaths)) throw new Error("Untrusted plist path.");
  const parentPath = await realpath(path.dirname(plistPath));
  const parentStats = await stat(parentPath);
  const plistBefore = await stat(plistPath);
  if (!isSafeOwnedDirectory(parentStats) || !isSafeOwnedFile(plistBefore)) {
    throw new Error("Untrusted plist ownership or mode.");
  }
  const plistBytes = await readFile(plistPath);
  const plistAfter = await stat(plistPath);
  const plistHash = hashBuffer(plistBytes);
  if (fileIdentity(plistBefore) !== fileIdentity(plistAfter)
    || plistHash !== options.expected_plist_sha256) throw new Error("Plist identity or hash mismatch.");
  const plistResult = await runNormalized(runner, invocation(SYSTEM_TOOLS.plutil,
    ["-convert", "json", "-o", "-", "-"], DEFAULT_TIMEOUT_MS, { input: plistBytes }));
  if (!resultPassed(plistResult, { stdoutRequired: true })) throw new Error("Plist parsing failed.");
  let plist; try { plist = JSON.parse(plistResult.stdout); } catch { throw new Error("Malformed plist."); }
  const args = Array.isArray(plist?.ProgramArguments)
    && plist.ProgramArguments.every((value) => typeof value === "string")
    ? plist.ProgramArguments : [];
  const configuredBinary = typeof plist?.Program === "string" ? plist.Program : args[0];
  if (plist.Label !== LAUNCH_AGENT_LABEL || args.length === 0 || configuredBinary !== args[0]) {
    throw new Error("Unexpected launch agent configuration.");
  }
  const parsedArguments = parseCloudflaredArguments(args);
  if (!parsedArguments.success || parsedArguments.metrics === null) {
    throw new Error("Invalid cloudflared arguments.");
  }
  const candidateLease = await inspectTrustedBinary(
    configuredBinary,
    options.expected_binary_sha256,
    options.expected_binary_version,
    trustedBinaryRoots,
    { openFile, watchPath },
  );
  try {
    const candidate = candidateLease.binary;
    candidate.arguments_sha256 = hashArgumentVector(args.slice(1));
    const launchctl = await runNormalized(runner, invocation(SYSTEM_TOOLS.launchctl,
      ["print", `gui/${process.getuid()}/${LAUNCH_AGENT_LABEL}`]));
    if (!resultPassed(launchctl, { stdoutRequired: true })) throw new Error("Launchd state unavailable.");
    const launchd = parseLaunchctlPrint(launchctl.stdout);
    const pid = parsePid(launchctl.stdout);
    const runtime = await collectRuntime(pid, candidate, args, parsedArguments, runner, readRuntimeArgv);
    const inspectLocal = parsedArguments.mode === "locally-managed";
    const configStats = inspectLocal && parsedArguments.config
      ? await safeStat(parsedArguments.config) : null;
    const configExists = configStats?.isFile() === true && isSafeOwnedFile(configStats);
    const configContents = configExists ? await readTextFile(parsedArguments.config, "utf8") : "";
    const localIngressConfig = configExists && isClearLocalIngressConfig(configContents);
    const management = parsedArguments.mode === "remotely-managed"
      ? { mode: "remotely-managed", success: true, config_required: false }
      : parsedArguments.mode === "locally-managed"
        ? { mode: "locally-managed", success: configExists && localIngressConfig, config_required: true }
        : { mode: "unknown", success: false, config_required: false };
    const token = await inspectTokenFile(parsedArguments.token_file);
    await candidateLease.verify();
    return {
      snapshot: {
        complete: launchd.loaded && launchd.state === "running" && runtime.metrics.success,
        plist: { path_hash: hashEvidenceValue(plistPath), sha256: plistHash, mode: modeString(plistBefore) },
        candidate_binary: candidate, running_binary: runtime.binary,
        token_file_path_hash: token.path_hash, token_file_mode: token.mode,
        launchd_state: launchd.state, tunnel_state: runtime.metrics.success ? "connected" : "unavailable",
        tunnel: { active_connections: runtime.metrics.active_connections,
          active_edge_locations: runtime.metrics.active_edge_locations, replica_state: "healthy" },
        stable_metadata_sha256: hashEvidenceValue(JSON.stringify(options.stable_release)),
      },
      management, tokenSafe: token.safe && !parsedArguments.inline_token_present,
      configPath: parsedArguments.config, configExists, localIngressConfig,
      candidate,
    };
  } finally { await candidateLease.close(); }
}

function incompleteSnapshot(stableRelease) {
  const emptyBinary = {
    path: null,
    path_hash: null,
    version: null,
    sha256: null,
    mode: null,
    arguments_sha256: null,
  };
  return { complete: false, plist: { path_hash: null, sha256: null, mode: null },
    candidate_binary: emptyBinary, running_binary: emptyBinary,
    token_file_path_hash: null, token_file_mode: null, launchd_state: "unavailable",
    tunnel_state: "unavailable", tunnel: { active_connections: null, active_edge_locations: null,
      replica_state: "unavailable" }, stable_metadata_sha256: hashEvidenceValue(JSON.stringify(stableRelease)) };
}

async function configCheck(state) {
  if (state.management.mode === "remotely-managed") return { attempted: false, success: true,
    latency_ms: null, error: null };
  if (state.management.mode !== "locally-managed" || !state.configExists || !state.localIngressConfig
    || !path.isAbsolute(state.configPath ?? "") || !state.candidate) {
    return { attempted: false, success: false, latency_ms: null, error: "CONFIG_MISSING" };
  }
  return {
    attempted: false,
    success: false,
    latency_ms: null,
    error: "CONFIG_VALIDATOR_UNAVAILABLE",
  };
}

async function dnsCheck(runner, now) {
  const started = now(); const targets = []; const verified = [];
  for (const candidate of CHECK_INVOCATIONS.dns) {
    const hostname = candidate.args[2]; const family = candidate.args[1] === "A" ? "ipv4" : "ipv6";
    const targetStarted = now(); const result = await runAllowedPreflightCommand(runner, candidate);
    const resultReady = resultPassed(result, { stdoutRequired: true });
    const parsed = resultReady ? parseDnsOutput(result.stdout,
      { hostname, address_family: family }) : { success: false, addresses: [] };
    const success = resultReady && parsed.success;
    const missingRequiredOutput = result.exit_code === 0 && result.timed_out !== true
      && result.output_overflow !== true && result.command_missing !== true && !resultReady;
    targets.push({ hostname, address_family: family, protocol: "dns", port: 53, attempted: true,
      success, latency_ms: Math.max(0, now() - targetStarted),
      error: success ? null : failureCode([result], {
        malformed: missingRequiredOutput || resultReady && !parsed.success,
      }) });
    for (const address of parsed.addresses ?? []) verified.push({ hostname, family, address });
  }
  const success = targets.every((target) => target.success);
  return { check: { attempted: true, success, latency_ms: Math.max(0, now() - started),
    error: success ? null : targets.find((target) => !target.success)?.error ?? "CHECK_FAILED", targets }, verified };
}

async function tcpCheck(runner, verified, now) {
  const started = now(); const targets = [];
  for (const endpoint of verified) {
    const targetStarted = now(); const result = await runAllowedPreflightCommand(runner,
      createTcpInvocation(endpoint.hostname, endpoint.family, endpoint.address));
    const success = resultPassed(result);
    targets.push({ hostname: endpoint.hostname, address_family: endpoint.family, protocol: "tcp", port: 7844,
      attempted: true, success, latency_ms: Math.max(0, now() - targetStarted),
      error: success ? null : failureCode([result]) });
  }
  const required = TUNNEL_HOSTNAMES.every((hostname) => ["ipv4", "ipv6"].every((family) =>
    targets.some((target) => target.hostname === hostname && target.address_family === family && target.success)));
  return { attempted: targets.length > 0, success: required, latency_ms: Math.max(0, now() - started),
    error: required ? null : targets.length ? "CHECK_FAILED" : "DNS_REQUIRED", targets };
}

function defaultQuicProbe() {
  return { attempted: false, success: false, latency_ms: null, error: "QUIC_PROBE_UNAVAILABLE", targets: [] };
}

function quicTargetKey(target) {
  if (!target || typeof target !== "object") return null;
  return JSON.stringify([
    target.hostname,
    target.address_family,
    target.address,
    target.protocol,
    target.port,
  ]);
}

const QUIC_AGGREGATE_FIELDS = Object.freeze(["attempted", "success", "latency_ms", "error", "targets"]);
const QUIC_TARGET_FIELDS = Object.freeze([
  "hostname", "address_family", "address", "protocol", "port",
  "attempted", "success", "latency_ms", "error",
]);
const QUIC_FAILURE_CODES = new Set([
  "CHECK_FAILED", "TIMEOUT", "OUTPUT_LIMIT", "COMMAND_MISSING", "MALFORMED_OUTPUT",
]);

function hasExactOwnFields(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).length === fields.length;
}

function validQuicError(success, error) {
  return success ? error === null : typeof error === "string" && QUIC_FAILURE_CODES.has(error);
}

function validQuicTargetShape(target) {
  return hasExactOwnFields(target, QUIC_TARGET_FIELDS)
    && typeof target.attempted === "boolean"
    && typeof target.success === "boolean"
    && Number.isFinite(target.latency_ms) && target.latency_ms >= 0
    && validQuicError(target.success, target.error);
}

async function runValidatedQuicProbe(probe, verifiedEndpoints, now) {
  let supplied;
  try {
    supplied = await probe({ verified_endpoints: verifiedEndpoints.map((endpoint) => ({ ...endpoint })), now });
  } catch {
    return { attempted: true, success: false, latency_ms: null, error: "QUIC_PROBE_FAILED", targets: [] };
  }
  if (probe === defaultQuicProbe) return supplied;
  const expectedTargets = verifiedEndpoints.map(({ hostname, family, address }) => ({
    hostname,
    address_family: family,
    address,
    protocol: "quic",
    port: 7844,
  }));
  const aggregateShapeValid = hasExactOwnFields(supplied, QUIC_AGGREGATE_FIELDS)
    && typeof supplied.attempted === "boolean"
    && typeof supplied.success === "boolean"
    && Number.isFinite(supplied.latency_ms) && supplied.latency_ms >= 0
    && validQuicError(supplied.success, supplied.error)
    && Array.isArray(supplied.targets);
  const suppliedTargets = aggregateShapeValid ? supplied.targets : [];
  const expectedKeys = new Set(expectedTargets.map(quicTargetKey));
  const suppliedKeys = suppliedTargets.map(quicTargetKey);
  const suppliedKeySet = new Set(suppliedKeys);
  const targetsMatch = expectedTargets.length > 0
    && suppliedTargets.length === expectedTargets.length
    && suppliedKeySet.size === suppliedTargets.length
    && suppliedKeys.every((key) => key !== null && expectedKeys.has(key))
    && suppliedTargets.every((target) => validQuicTargetShape(target)
      && target.attempted === true
      && target?.success === true
      && target.error === null);
  if (!aggregateShapeValid || supplied.attempted !== true || supplied.success !== true
    || supplied.error !== null || !targetsMatch) {
    return {
      attempted: supplied?.attempted === true,
      success: false,
      latency_ms: supplied?.latency_ms,
      error: "QUIC_TARGET_MISMATCH",
      targets: [],
    };
  }
  return {
    attempted: true,
    success: true,
    latency_ms: supplied.latency_ms,
    error: null,
    targets: suppliedTargets.map((target) => ({
      hostname: target.hostname,
      address_family: target.address_family,
      protocol: "quic",
      port: 7844,
      attempted: true,
      success: true,
      latency_ms: target.latency_ms,
      error: null,
    })),
  };
}

async function managementCheck(runner, now) {
  const started = now(); const result = await runAllowedPreflightCommand(runner,
    CHECK_INVOCATIONS.management_api_https[0]);
  const success = resultPassed(result);
  const target = { hostname: "api.cloudflare.com", address_family: "n/a", protocol: "https", port: 443,
    attempted: true, success, latency_ms: Math.max(0, now() - started), error: success ? null : failureCode([result]) };
  return { attempted: true, success, latency_ms: target.latency_ms, error: target.error, targets: [target] };
}

export async function collectCloudflareTunnelPreflight(options, dependencies = {}) {
  const runner = dependencies.runner ?? defaultRunner; const now = dependencies.monotonicNow ?? Date.now;
  const platform = options.platform ?? `${process.platform}-${process.arch}`;
  let state;
  try { state = await collectSnapshot(options, runner, {
    readTextFile: dependencies.readTextFile,
    readRuntimeArgv: dependencies.runtimeArgvReader,
    trustedBinaryRoots: dependencies.trustedBinaryRoots,
    trustedPlistPaths: dependencies.trustedPlistPaths,
    openFile: dependencies.openFile,
    watchPath: dependencies.watchPath,
  }); }
  catch { state = { snapshot: incompleteSnapshot(options.stable_release), management: { mode: "unknown", success: false },
    tokenSafe: false, configPath: null, configExists: false, localIngressConfig: false, candidate: null }; }
  const dns = await dnsCheck(runner, now);
  const [tcp, managementApi, config, udp] = await Promise.all([
    tcpCheck(runner, dns.verified, now), managementCheck(runner, now), configCheck(state),
    runValidatedQuicProbe(dependencies.quicProbe ?? defaultQuicProbe, dns.verified, now),
  ]);
  const release = evaluateReleaseGate(state.snapshot.running_binary.version, options.stable_release,
    platform, options.captured_at);
  const metricsReady = state.snapshot.tunnel_state === "connected";
  return buildPreflightEvidence({ timestamp: options.captured_at, platform,
    management_mode: state.management.mode, management_mode_success: state.management.success,
    snapshot: state.snapshot, token_path_mode_safe: state.tokenSafe,
    checks: { dns: dns.check, udp_7844: udp, tcp_7844: tcp, management_api_https: managementApi, config,
      tunnel_connections: { attempted: metricsReady, success: metricsReady, latency_ms: 0,
        error: metricsReady ? null : "CONNECTION_STATE_UNAVAILABLE",
        targets: [{ hostname: "loopback", address_family: "ipv4", protocol: "metrics", port: null,
          attempted: metricsReady, success: metricsReady, latency_ms: 0,
          error: metricsReady ? null : "CONNECTION_STATE_UNAVAILABLE" }] },
      update_gate: { attempted: true, success: release.success, latency_ms: 0, error: release.error } },
  });
}

function canonicalizeProspectivePath(targetPath) {
  let ancestor = path.resolve(targetPath); const missing = [];
  while (!existsSync(ancestor)) { const parent = path.dirname(ancestor); if (parent === ancestor) break;
    missing.unshift(path.basename(ancestor)); ancestor = parent; }
  return path.join(realpathSync(ancestor), ...missing);
}
function assertOutputOutsideRepository(outputPath) {
  if (!isOutsideRepository(canonicalizeProspectivePath(outputPath))) throw new Error("--output must be outside the repository.");
}
function canonicalExistingPath(value) {
  try { return realpathSync(value); } catch { return null; }
}
function parseArgs(argv, { trustedPlistPaths = [DEFAULT_PLIST] } = {}) {
  const options = { plist_path: DEFAULT_PLIST };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]; const value = argv[index + 1];
    const keys = { "--plist": "plist_path", "--output": "output", "--stable-version": "stable_version",
      "--stable-verified-at": "stable_verified_at", "--stable-platform": "stable_platform",
      "--expected-plist-sha256": "expected_plist_sha256",
      "--expected-binary-sha256": "expected_binary_sha256",
      "--expected-binary-version": "expected_binary_version" };
    if (!keys[argument]) throw new Error("Unsupported preflight argument.");
    options[keys[argument]] = value; index += 1;
  }
  const canonicalPlist = canonicalExistingPath(options.plist_path);
  const canonicalTrustedPlists = trustedPlistPaths.map(canonicalExistingPath).filter(Boolean);
  if (!canonicalPlist || !canonicalTrustedPlists.includes(canonicalPlist)) {
    throw new Error("--plist must match an exact trusted canonical path.");
  }
  for (const [name, value] of Object.entries({ plist: options.plist_path, output: options.output })) {
    if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path.`);
  }
  assertOutputOutsideRepository(options.output);
  if (!/^\d+\.\d+\.\d+$/u.test(options.stable_version ?? "")) throw new Error("Verified stable version is required.");
  if (!Number.isFinite(Date.parse(options.stable_verified_at ?? ""))) throw new Error("Verified stable timestamp is required.");
  if (!/^(?:darwin|linux)-(?:arm64|x64)$/u.test(options.stable_platform ?? "")) throw new Error("Verified stable platform is required.");
  if (!SHA256_PATTERN.test(options.expected_plist_sha256 ?? "")) throw new Error("Verified plist hash is required.");
  if (!SHA256_PATTERN.test(options.expected_binary_sha256 ?? "")) throw new Error("Verified binary hash is required.");
  if (!isCanonicalCloudflaredVersion(options.expected_binary_version)) {
    throw new Error("Verified binary version is required.");
  }
  return options;
}

export async function writePreflightEvidence(outputPath, evidence) { return writeEvidenceFile(outputPath, evidence); }

export async function runPreflightCli(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  const writeEvidence = dependencies.writeEvidence ?? writePreflightEvidence;
  try {
    const options = parseArgs(argv, { trustedPlistPaths: dependencies.trustedPlistPaths });
    const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const platform = dependencies.platform ?? `${process.platform}-${process.arch}`;
    const evidence = await collectCloudflareTunnelPreflight({ plist_path: options.plist_path,
      expected_plist_sha256: options.expected_plist_sha256,
      expected_binary_sha256: options.expected_binary_sha256,
      expected_binary_version: options.expected_binary_version,
      output: options.output, captured_at: capturedAt,
      platform, stable_release: { version: options.stable_version, verified_at: options.stable_verified_at,
        platform: options.stable_platform } }, { runner: dependencies.runner ?? defaultRunner,
      quicProbe: dependencies.quicProbe,
      runtimeArgvReader: dependencies.runtimeArgvReader,
      trustedBinaryRoots: dependencies.trustedBinaryRoots,
      trustedPlistPaths: dependencies.trustedPlistPaths,
      openFile: dependencies.openFile,
      watchPath: dependencies.watchPath });
    await writeEvidence(options.output, evidence);
    stdout(`${JSON.stringify({ schema: evidence.schema, version: evidence.version, success: evidence.success,
      evidence_written: true })}\n`);
    if (!evidence.success) { stderr("cloudflare-tunnel-preflight: FAIL (redacted)\n"); return 1; }
    return 0;
  } catch { stderr("cloudflare-tunnel-preflight: FAIL (redacted)\n"); return 1; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await runPreflightCli(process.argv.slice(2));
