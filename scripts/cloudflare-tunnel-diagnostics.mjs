#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, open, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregatePantrySamples,
  parseCfRayHeaders,
  parseCloudflaredVersion,
  parseCurlTiming,
  parseLaunchctlPrint,
  parseTrace,
  parseTunnelLog,
  sanitizeForEvidence,
  summarizeColos,
  summarizeProbeSamples,
  validateAppAuthIssueId,
  validateAnonymousNetworkLabel,
} from "./lib/cloudflare-tunnel-diagnostics.mjs";

const TIMING_MARKER = "__HC_TIMING__";
const DEFAULT_APP_ORIGIN = "https://app.mumeok.kr";
const DEFAULT_BASELINE_ORIGIN = "https://www.cloudflare.com";
const DEFAULT_TUNNEL_LOG = "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log";
const DEFAULT_LAUNCH_AGENT_LABEL = "com.homecook.cloudflare-tunnel";
const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const MINIMUM_AUTHENTICATED_SAMPLES = 30;
const MAX_SOURCE_EVIDENCE_BYTES = 10 * 1_024 * 1_024;
const CURL_WRITE_OUT = `${TIMING_MARKER}{\"http_code\":%{http_code},\"time_connect\":%{time_connect},\"time_starttransfer\":%{time_starttransfer},\"time_total\":%{time_total}}`;
const ADDRESS_FAMILIES = new Set(["ipv4", "ipv6"]);

function resultShape({ exitCode = 1, stdout = "", stderr = "", timedOut = false } = {}) {
  return {
    exit_code: Number.isInteger(exitCode) ? exitCode : 1,
    stdout: String(stdout ?? ""),
    stderr: String(stderr ?? ""),
    timed_out: timedOut === true,
  };
}

function curlArgs(url, addressFamily, { cookieFile = null, discardBody = false } = {}) {
  const args = [
    "--disable",
    "--request",
    "GET",
    addressFamily === "ipv6" ? "--ipv6" : "--ipv4",
    "--silent",
    "--show-error",
    "--max-time",
    "10",
    discardBody ? "--dump-header" : "--include",
    ...(discardBody ? ["-"] : []),
    "--write-out",
    CURL_WRITE_OUT,
  ];
  if (discardBody) {
    args.push("--output", "/dev/null");
  }
  if (cookieFile) {
    args.push("--cookie", cookieFile);
  }
  args.push(url);
  return args;
}

function invocationAllowed(command, args) {
  if (command === "cloudflared") {
    return args.length === 1 && args[0] === "--version";
  }
  if (command === "launchctl") {
    return args.length === 2
      && args[0] === "print"
      && /^gui\/\d+\/com\.homecook\.cloudflare-tunnel$/u.test(args[1]);
  }
  if (command === "tail") {
    return JSON.stringify(args) === JSON.stringify(["-n", "500", DEFAULT_TUNNEL_LOG]);
  }
  if (command !== "curl" || !Array.isArray(args)) {
    return false;
  }
  const url = args.at(-1);
  const addressFamily = args.includes("--ipv6") ? "ipv6" : "ipv4";
  const cookieIndex = args.indexOf("--cookie");
  const cookieFile = cookieIndex < 0 ? null : args[cookieIndex + 1];
  const publicPantryUrl = `${DEFAULT_APP_ORIGIN}/pantry`;
  const authenticatedPantryUrl = `${DEFAULT_APP_ORIGIN}/api/v1/pantry`;
  const traceUrls = new Set([
    `${DEFAULT_APP_ORIGIN}/cdn-cgi/trace`,
    `${DEFAULT_BASELINE_ORIGIN}/cdn-cgi/trace`,
  ]);
  if (traceUrls.has(url)) {
    return cookieFile === null
      && JSON.stringify(args) === JSON.stringify(curlArgs(url, addressFamily));
  }
  if (url === publicPantryUrl) {
    return cookieFile === null
      && JSON.stringify(args) === JSON.stringify(curlArgs(url, addressFamily, { discardBody: true }));
  }
  if (url === authenticatedPantryUrl) {
    return typeof cookieFile === "string"
      && path.isAbsolute(cookieFile)
      && JSON.stringify(args) === JSON.stringify(curlArgs(url, addressFamily, { cookieFile }));
  }
  return false;
}

function assertReadOnlyInvocation(command, args) {
  if (!invocationAllowed(command, args)) {
    throw new Error("Command rejected by the read-only command allowlist.");
  }
}

export function createCommandRunner({
  spawnProcess = spawn,
  killGraceMs = 1_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  return ({ command, args, timeout_ms = 15_000 }) => {
    assertReadOnlyInvocation(command, args);
    return new Promise((resolve) => {
      const child = spawnProcess(command, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let killTimer = null;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(timeoutTimer);
        if (killTimer !== null) {
          clearTimer(killTimer);
        }
        resolve(result);
      };
      const timeoutTimer = setTimer(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimer(() => {
          if (!settled) {
            child.kill("SIGKILL");
          }
        }, killGraceMs);
      }, timeout_ms);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", () => {
        finish(resultShape({ timedOut }));
      });
      child.on("close", (code) => {
        finish(resultShape({ exitCode: code ?? 1, stdout, stderr, timedOut }));
      });
    });
  };
}

export const defaultRunner = createCommandRunner();

export async function runReadOnlyCommand(runner, command, args, timeoutMs = 15_000) {
  assertReadOnlyInvocation(command, args);
  try {
    const result = await runner({ command, args, timeout_ms: timeoutMs });
    return {
      exit_code: Number.isInteger(result?.exit_code) ? result.exit_code : 1,
      stdout: typeof result?.stdout === "string" ? result.stdout : "",
      stderr: typeof result?.stderr === "string" ? result.stderr : "",
      timed_out: result?.timed_out === true,
    };
  } catch {
    return resultShape();
  }
}

function splitCurlOutput(raw) {
  const markerIndex = raw.lastIndexOf(TIMING_MARKER);
  if (markerIndex < 0) {
    return { response: raw, timing: "" };
  }
  return {
    response: raw.slice(0, markerIndex),
    timing: raw.slice(markerIndex + TIMING_MARKER.length).trim(),
  };
}

function extractErrorCode(raw) {
  return raw.match(/(?:^x-error-code:\s*|["']code["']\s*:\s*["'])([A-Z][A-Z0-9_]{1,63})(?:::\d{3})?/imu)?.[1] ?? null;
}

function extractCorrelationId(raw) {
  return raw.match(/^x-correlation-id:\s*([^\r\n]+)\s*$/imu)?.[1]?.trim() ?? null;
}

export function createRunScopedCorrelationHasher(key = randomBytes(32)) {
  if (!(key instanceof Uint8Array) || key.byteLength < 32) {
    throw new Error("Correlation hash key must contain at least 32 bytes.");
  }
  return (value) => {
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }
    return `hmac-sha256:${createHmac("sha256", key).update(value, "utf8").digest("hex")}`;
  };
}

function parseProbeResult(result, { expectedAddressFamily = null, trace = false } = {}) {
  const { response, timing: timingRaw } = splitCurlOutput(result.stdout);
  const timing = parseCurlTiming(timingRaw);
  const status = timing.http_status;
  const parsedTrace = trace ? parseTrace(response) : null;
  const addressFamilyMatchesRequest = trace
    ? parsedTrace.address_family === expectedAddressFamily
    : null;
  return {
    success: result.exit_code === 0
      && status !== null
      && status >= 200
      && status <= 299
      && (!trace || addressFamilyMatchesRequest),
    timed_out: result.timed_out,
    http_status: status,
    connect_ms: timing.connect_ms,
    ttfb_ms: timing.ttfb_ms,
    total_ms: timing.total_ms,
    cf_ray: parseCfRayHeaders(response),
    ...(trace ? {
      address_family_matches_request: addressFamilyMatchesRequest,
      trace: parsedTrace,
    } : {}),
  };
}

function parseAuthenticatedPantryResult(result, hashCorrelationId) {
  const { response, timing: timingRaw } = splitCurlOutput(result.stdout);
  const timing = parseCurlTiming(timingRaw);
  const correlationId = extractCorrelationId(response);
  return {
    transport_error: result.exit_code !== 0,
    timed_out: result.timed_out,
    http_status: timing.http_status,
    connect_ms: timing.connect_ms,
    ttfb_ms: timing.ttfb_ms,
    total_ms: timing.total_ms,
    error_code: extractErrorCode(response),
    correlation_id_hash: correlationId === null ? null : hashCorrelationId(correlationId),
    cf_ray: parseCfRayHeaders(response),
  };
}

function commandSucceeded(result) {
  return result.exit_code === 0 && !result.timed_out;
}

function allProbeSamplesSucceeded(samples) {
  return samples.every(({ success }) => success === true);
}

function probeSampleComplete(sample, { addressFamily = null, trace = false } = {}) {
  return sample.success === true
    && sample.cf_ray?.present === true
    && sample.connect_ms !== null
    && sample.ttfb_ms !== null
    && sample.total_ms !== null
    && (!trace || (
      sample.trace?.colo_state === "value"
      && sample.trace?.address_family === addressFamily
    ));
}

function latestConnectionEventAges(tunnelLog, capturedAtMs) {
  return Object.fromEntries([0, 1, 2, 3].map((connectionIndex) => {
    const timestamp = tunnelLog.latest_connection_event_at?.[String(connectionIndex)];
    const timestampMs = Date.parse(timestamp ?? "");
    const ageMs = capturedAtMs - timestampMs;
    return [String(connectionIndex), Number.isFinite(timestampMs) ? ageMs : null];
  }));
}

function summarizeAddressFamilyCompleteness(samples, requestedAddressFamily) {
  const matchingSamples = samples.filter((sample) =>
    sample.address_family_matches_request === true
  ).length;
  return {
    requested: requestedAddressFamily,
    matching_samples: matchingSamples,
    complete: samples.length > 0 && matchingSamples === samples.length,
  };
}

/**
 * @param {Record<string, unknown>} options
 * @param {{ runner?: typeof defaultRunner, hmac_key?: Uint8Array }} [dependencies]
 */
export async function captureCloudflareTunnelDiagnostics(
  options,
  { runner = defaultRunner, hmac_key: hmacKey } = {},
) {
  const networkLabel = validateAnonymousNetworkLabel(options?.network_label);
  const addressFamily = options?.address_family ?? "ipv4";
  if (!ADDRESS_FAMILIES.has(addressFamily)) {
    throw new Error("Address family must be ipv4 or ipv6.");
  }
  const samples = Number(options?.samples ?? 30);
  if (!Number.isInteger(samples) || samples < 1 || samples > 100) {
    throw new Error("Samples must be an integer between 1 and 100.");
  }
  const capturedAt = options?.captured_at ?? new Date().toISOString();
  const capturedAtMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    throw new Error("Captured time must be a valid ISO timestamp.");
  }
  const appOrigin = options?.app_origin ?? DEFAULT_APP_ORIGIN;
  const baselineOrigin = options?.baseline_origin ?? DEFAULT_BASELINE_ORIGIN;
  const authenticatedPantryCookieFile = options?.authenticated_pantry_cookie_file ?? null;
  const appAuthIssueId = validateAppAuthIssueId(options?.app_auth_issue_id ?? null);
  const hashCorrelationId = createRunScopedCorrelationHasher(hmacKey);
  if (appOrigin !== DEFAULT_APP_ORIGIN) {
    throw new Error("Diagnostics require the canonical app origin.");
  }
  if (baselineOrigin !== DEFAULT_BASELINE_ORIGIN) {
    throw new Error("Diagnostics require the canonical Cloudflare baseline origin.");
  }
  if (
    authenticatedPantryCookieFile !== null
    && (!path.isAbsolute(authenticatedPantryCookieFile) || authenticatedPantryCookieFile.length === 0)
  ) {
    throw new Error("Authenticated pantry cookie file must be an absolute path.");
  }
  const launchTarget = `gui/${typeof process.getuid === "function" ? process.getuid() : 0}/${DEFAULT_LAUNCH_AGENT_LABEL}`;

  const [versionResult, launchctlResult, logResult] = await Promise.all([
    runReadOnlyCommand(runner, "cloudflared", ["--version"]),
    runReadOnlyCommand(runner, "launchctl", ["print", launchTarget]),
    runReadOnlyCommand(runner, "tail", ["-n", "500", DEFAULT_TUNNEL_LOG]),
  ]);

  const appTraceSamples = [];
  const baselineTraceSamples = [];
  const publicPantrySamples = [];
  const authenticatedPantrySamples = [];
  const rawCollectionResults = [versionResult, launchctlResult, logResult];

  for (let index = 0; index < samples; index += 1) {
    const [appTraceResult, baselineTraceResult, publicPantryResult] = await Promise.all([
      runReadOnlyCommand(runner, "curl", curlArgs(`${appOrigin}/cdn-cgi/trace`, addressFamily)),
      runReadOnlyCommand(runner, "curl", curlArgs(`${baselineOrigin}/cdn-cgi/trace`, addressFamily)),
      runReadOnlyCommand(runner, "curl", curlArgs(`${appOrigin}/pantry`, addressFamily, {
        discardBody: true,
      })),
    ]);
    rawCollectionResults.push(appTraceResult, baselineTraceResult, publicPantryResult);
    appTraceSamples.push(parseProbeResult(appTraceResult, {
      expectedAddressFamily: addressFamily,
      trace: true,
    }));
    baselineTraceSamples.push(parseProbeResult(baselineTraceResult, {
      expectedAddressFamily: addressFamily,
      trace: true,
    }));
    publicPantrySamples.push(parseProbeResult(publicPantryResult));

    if (authenticatedPantryCookieFile) {
      const authenticatedPantryResult = await runReadOnlyCommand(
        runner,
        "curl",
        curlArgs(`${appOrigin}/api/v1/pantry`, addressFamily, {
          cookieFile: authenticatedPantryCookieFile,
        }),
      );
      rawCollectionResults.push(authenticatedPantryResult);
      authenticatedPantrySamples.push(parseAuthenticatedPantryResult(
        authenticatedPantryResult,
        hashCorrelationId,
      ));
    }
  }

  const authenticatedPantry = aggregatePantrySamples(authenticatedPantrySamples, {
    app_auth_issue_id: appAuthIssueId,
  });
  const cloudflared = commandSucceeded(versionResult)
    ? parseCloudflaredVersion(versionResult.stdout)
    : { version: null, available: false };
  const launchAgent = commandSucceeded(launchctlResult)
    ? parseLaunchctlPrint(launchctlResult.stdout)
    : { loaded: false, state: "unavailable", configured_protocol: null };
  const tunnelLog = commandSucceeded(logResult)
    ? parseTunnelLog(logResult.stdout)
    : parseTunnelLog("");
  const collectionCommandsSucceeded = rawCollectionResults.every(commandSucceeded);
  const publicProbesSucceeded = [appTraceSamples, baselineTraceSamples, publicPantrySamples]
    .every(allProbeSamplesSucceeded);
  const authenticatedProbeSucceeded = authenticatedPantrySamples.length === 0
    || authenticatedPantry.by_outcome.success.attempted === authenticatedPantrySamples.length;
  const connectorHealthy = cloudflared.available
    && launchAgent.loaded
    && launchAgent.state === "running"
    && tunnelLog.connection_health.healthy_connection_count === 4;
  const publicProbeCompleteness = appTraceSamples.every((sample) =>
    probeSampleComplete(sample, { addressFamily, trace: true })
  ) && baselineTraceSamples.every((sample) =>
    probeSampleComplete(sample, { addressFamily, trace: true })
  ) && publicPantrySamples.every((sample) => probeSampleComplete(sample));
  const authenticatedProbeComplete = authenticatedPantryCookieFile !== null
    && authenticatedPantrySamples.length >= MINIMUM_AUTHENTICATED_SAMPLES
    && authenticatedPantrySamples.every((sample) =>
      sample.cf_ray?.present === true
      && sample.connect_ms !== null
      && sample.ttfb_ms !== null
      && sample.total_ms !== null
    );
  const evidence = {
    schema_version: 1,
    success: collectionCommandsSucceeded
      && publicProbesSucceeded
      && authenticatedProbeSucceeded
      && authenticatedPantry.app_auth_issue_linkage_state !== "app_auth_issue_linkage_required"
      && connectorHealthy
      && publicProbeCompleteness
      && authenticatedProbeComplete,
    captured_at: capturedAt,
    network: { label: networkLabel, address_family: addressFamily },
    connector: {
      cloudflared,
      launch_agent: launchAgent,
      tunnel_log: {
        ...tunnelLog,
        latest_connection_event_age_ms: latestConnectionEventAges(tunnelLog, capturedAtMs),
      },
    },
    probes: {
      app_trace: {
        samples: appTraceSamples,
        address_family: summarizeAddressFamilyCompleteness(appTraceSamples, addressFamily),
        summary: summarizeProbeSamples(appTraceSamples, {
          expected_count: samples,
          minimum_latency_samples: samples,
        }),
        colo: summarizeColos(appTraceSamples),
      },
      cloudflare_baseline_trace: {
        samples: baselineTraceSamples,
        address_family: summarizeAddressFamilyCompleteness(
          baselineTraceSamples,
          addressFamily,
        ),
        summary: summarizeProbeSamples(baselineTraceSamples, {
          expected_count: samples,
          minimum_latency_samples: samples,
        }),
        colo: summarizeColos(baselineTraceSamples),
      },
      public_pantry: {
        samples: publicPantrySamples,
        summary: summarizeProbeSamples(publicPantrySamples, {
          expected_count: samples,
          minimum_latency_samples: samples,
        }),
      },
      authenticated_pantry: {
        configured: authenticatedPantryCookieFile !== null,
        ...authenticatedPantry,
      },
    },
    collection: {
      command_attempts: rawCollectionResults.length,
      command_failures: rawCollectionResults.filter((result) => !commandSucceeded(result)).length,
    },
  };
  return sanitizeForEvidence(evidence, {
    secret_markers: Array.isArray(options?.secret_markers) ? options.secret_markers : [],
  });
}

function parseArgs(argv) {
  const options = {
    address_family: "ipv4",
    app_origin: DEFAULT_APP_ORIGIN,
    baseline_origin: DEFAULT_BASELINE_ORIGIN,
    samples: 30,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--network-label":
        options.network_label = next;
        index += 1;
        break;
      case "--address-family":
        options.address_family = next;
        index += 1;
        break;
      case "--samples":
        options.samples = Number(next);
        index += 1;
        break;
      case "--output":
        options.output = next;
        index += 1;
        break;
      case "--app-origin":
        options.app_origin = next;
        index += 1;
        break;
      case "--baseline-origin":
        options.baseline_origin = next;
        index += 1;
        break;
      case "--authenticated-pantry-cookie-file":
        options.authenticated_pantry_cookie_file = next;
        index += 1;
        break;
      case "--app-auth-issue-id":
        options.app_auth_issue_id = next;
        index += 1;
        break;
      default:
        throw new Error("Unsupported diagnostics argument.");
    }
  }
  if (typeof options.output !== "string" || !path.isAbsolute(options.output)) {
    throw new Error("--output must be an absolute path outside the repository.");
  }
  if (!Number.isInteger(options.samples) || options.samples < 30 || options.samples > 100) {
    throw new Error("Operational diagnostics require between 30 and 100 samples.");
  }
  assertOutputOutsideRepository(options.output);
  validateAppAuthIssueId(options.app_auth_issue_id ?? null);
  return options;
}

function parseLinkageArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--evidence":
        options.evidence_path = next;
        index += 1;
        break;
      case "--app-auth-issue-id":
        options.app_auth_issue_id = next;
        index += 1;
        break;
      case "--output":
        options.output = next;
        index += 1;
        break;
      default:
        throw new Error("Unsupported linkage argument.");
    }
  }
  if (typeof options.evidence_path !== "string" || !path.isAbsolute(options.evidence_path)) {
    throw new Error("--evidence must be an absolute path outside the repository.");
  }
  if (typeof options.output !== "string" || !path.isAbsolute(options.output)) {
    throw new Error("--output must be an absolute path outside the repository.");
  }
  options.app_auth_issue_id = validateAppAuthIssueId(options.app_auth_issue_id);
  assertOutputOutsideRepository(options.output);
  return options;
}

function canonicalizeProspectivePath(targetPath) {
  let existingAncestor = path.resolve(targetPath);
  const missingSegments = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      break;
    }
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  return path.join(realpathSync(existingAncestor), ...missingSegments);
}

function assertOutputOutsideRepository(outputPath) {
  const canonicalOutput = canonicalizeProspectivePath(outputPath);
  assertCanonicalPathOutsideRepository(canonicalOutput, "--output must be outside the repository.");
}

function assertCanonicalPathOutsideRepository(canonicalPath, message) {
  const relativePath = path.relative(REPOSITORY_ROOT, canonicalPath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    throw new Error(message);
  }
}

async function readSourceEvidence(evidencePath) {
  const canonicalEvidencePath = await realpath(evidencePath);
  assertCanonicalPathOutsideRepository(
    canonicalEvidencePath,
    "Source evidence must be outside the repository.",
  );
  const handle = await open(canonicalEvidencePath, "r");
  try {
    const sourceStats = await handle.stat();
    if (!sourceStats.isFile()) {
      throw new Error("Source evidence must be a regular file.");
    }
    if ((sourceStats.mode & 0o077) !== 0) {
      throw new Error("Source evidence must be private.");
    }
    if (sourceStats.size > MAX_SOURCE_EVIDENCE_BYTES) {
      throw new Error("Source evidence exceeds the maximum size.");
    }
    const source = await handle.readFile();
    let evidence;
    try {
      evidence = JSON.parse(source.toString("utf8"));
    } catch {
      throw new Error("Source evidence must be valid JSON.");
    }
    if (evidence?.schema_version !== 1) {
      throw new Error("Source evidence schema is unsupported.");
    }
    const authenticatedPantry = evidence?.probes?.authenticated_pantry;
    const appAuth409Attempts = authenticatedPantry
      ?.by_outcome?.app_auth_409?.attempted;
    if (!Number.isInteger(appAuth409Attempts) || appAuth409Attempts < 1) {
      throw new Error("Source evidence must contain an app_auth_409 attempt.");
    }
    if (authenticatedPantry.app_auth_issue_linkage_state !== "app_auth_issue_linkage_required") {
      throw new Error("Source evidence does not require app/auth issue linkage.");
    }
    return { canonicalEvidencePath, source };
  } finally {
    await handle.close();
  }
}

export async function createAppAuthIssueLinkageArtifact({
  app_auth_issue_id: appAuthIssueId,
  created_at: createdAt,
  evidence_path: evidencePath,
  output,
}) {
  const validatedIssueId = validateAppAuthIssueId(appAuthIssueId);
  if (validatedIssueId === null) {
    throw new Error("App/auth issue ID is required for linkage.");
  }
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    throw new Error("Linkage creation time must be a valid ISO timestamp.");
  }
  assertOutputOutsideRepository(output);
  const { canonicalEvidencePath, source } = await readSourceEvidence(evidencePath);
  if (canonicalizeProspectivePath(output) === canonicalEvidencePath) {
    throw new Error("Linkage output must not replace source evidence.");
  }
  const artifact = {
    schema_version: 1,
    artifact_type: "cloudflare_tunnel_app_auth_issue_linkage",
    created_at: new Date(createdAtMs).toISOString(),
    source_evidence_sha256: `sha256:${createHash("sha256").update(source).digest("hex")}`,
    app_auth_issue_id: validatedIssueId,
  };
  await writeEvidenceFile(output, artifact);
  return artifact;
}

export async function writeEvidenceFile(outputPath, evidence) {
  assertOutputOutsideRepository(outputPath);
  const directory = path.dirname(outputPath);
  const createdPath = await mkdir(directory, { recursive: true, mode: 0o700 });
  if (createdPath === undefined) {
    const directoryStats = await stat(directory);
    if (!directoryStats.isDirectory() || (directoryStats.mode & 0o077) !== 0) {
      throw new Error("Evidence directory must already be private.");
    }
  } else {
    await chmod(directory, 0o700);
  }
  const canonicalDirectory = await realpath(directory);
  const repositoryRelative = path.relative(REPOSITORY_ROOT, canonicalDirectory);
  if (
    repositoryRelative === ""
    || (!repositoryRelative.startsWith("..") && !path.isAbsolute(repositoryRelative))
  ) {
    throw new Error("Evidence must be written outside the repository.");
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

async function runAppAuthIssueLinkageCli(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  try {
    const options = parseLinkageArgs(argv);
    const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const artifact = await createAppAuthIssueLinkageArtifact({
      ...options,
      created_at: createdAt,
    });
    stdout(`${JSON.stringify({
      schema_version: artifact.schema_version,
      artifact_type: artifact.artifact_type,
      linkage_written: true,
    })}\n`);
    return 0;
  } catch {
    stderr("cloudflare-tunnel-diagnostics: FAIL (redacted)\n");
    return 1;
  }
}

export async function runDiagnosticsCli(argv, dependencies = {}) {
  if (argv[0] === "link-app-auth-issue") {
    return runAppAuthIssueLinkageCli(argv.slice(1), dependencies);
  }
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  const writeEvidence = dependencies.writeEvidence ?? writeEvidenceFile;
  try {
    const options = parseArgs(argv);
    const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const evidence = await captureCloudflareTunnelDiagnostics({
      ...options,
      captured_at: capturedAt,
    }, { runner: dependencies.runner ?? defaultRunner });
    await writeEvidence(options.output, evidence);
    stdout(`${JSON.stringify({
      schema_version: evidence.schema_version,
      success: evidence.success,
      evidence_written: true,
    })}\n`);
    if (!evidence.success) {
      stderr("cloudflare-tunnel-diagnostics: FAIL (redacted)\n");
      return 1;
    }
    return 0;
  } catch {
    stderr("cloudflare-tunnel-diagnostics: FAIL (redacted)\n");
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const exitCode = await runDiagnosticsCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
