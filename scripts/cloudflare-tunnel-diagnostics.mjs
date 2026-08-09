#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chmod, mkdir, realpath, stat, writeFile } from "node:fs/promises";
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
  validateAnonymousNetworkLabel,
} from "./lib/cloudflare-tunnel-diagnostics.mjs";

const TIMING_MARKER = "__HC_TIMING__";
const DEFAULT_APP_ORIGIN = "https://app.mumeok.kr";
const DEFAULT_BASELINE_ORIGIN = "https://www.cloudflare.com";
const DEFAULT_TUNNEL_LOG = "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log";
const DEFAULT_LAUNCH_AGENT_LABEL = "com.homecook.cloudflare-tunnel";
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

export function defaultRunner({ command, args, timeout_ms = 15_000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
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
      clearTimeout(timer);
      resolve(resultShape({ timedOut }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(resultShape({ exitCode: code ?? 1, stdout, stderr, timedOut }));
    });
  });
}

async function runReadOnly(runner, command, args, timeoutMs = 15_000) {
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

function curlArgs(url, addressFamily, { cookieFile = null, discardBody = false } = {}) {
  const args = [
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

function parseProbeResult(result, { trace = false } = {}) {
  const { response, timing: timingRaw } = splitCurlOutput(result.stdout);
  const timing = parseCurlTiming(timingRaw);
  const status = timing.http_status;
  return {
    success: result.exit_code === 0 && status !== null && status >= 200 && status <= 299,
    timed_out: result.timed_out,
    http_status: status,
    connect_ms: timing.connect_ms,
    ttfb_ms: timing.ttfb_ms,
    total_ms: timing.total_ms,
    cf_ray: parseCfRayHeaders(response),
    ...(trace ? { trace: parseTrace(response) } : {}),
  };
}

function parseAuthenticatedPantryResult(result) {
  const { response, timing: timingRaw } = splitCurlOutput(result.stdout);
  const timing = parseCurlTiming(timingRaw);
  return {
    transport_error: result.exit_code !== 0,
    timed_out: result.timed_out,
    http_status: timing.http_status,
    connect_ms: timing.connect_ms,
    ttfb_ms: timing.ttfb_ms,
    total_ms: timing.total_ms,
    error_code: extractErrorCode(response),
    correlation_id: /^x-correlation-id:\s*\S+/imu.test(response) ? "present" : null,
  };
}

function commandSucceeded(result) {
  return result.exit_code === 0 && !result.timed_out;
}

function allProbeSamplesSucceeded(samples) {
  return samples.every(({ success }) => success === true);
}

export async function captureCloudflareTunnelDiagnostics(options, { runner = defaultRunner } = {}) {
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
  const appOrigin = options?.app_origin ?? DEFAULT_APP_ORIGIN;
  const baselineOrigin = options?.baseline_origin ?? DEFAULT_BASELINE_ORIGIN;
  const authenticatedPantryCookieFile = options?.authenticated_pantry_cookie_file ?? null;
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
    runReadOnly(runner, "cloudflared", ["--version"]),
    runReadOnly(runner, "launchctl", ["print", launchTarget]),
    runReadOnly(runner, "tail", ["-n", "500", options?.tunnel_log_path ?? DEFAULT_TUNNEL_LOG]),
  ]);

  const appTraceSamples = [];
  const baselineTraceSamples = [];
  const publicPantrySamples = [];
  const authenticatedPantrySamples = [];
  const rawCollectionResults = [versionResult, launchctlResult, logResult];

  for (let index = 0; index < samples; index += 1) {
    const [appTraceResult, baselineTraceResult, publicPantryResult] = await Promise.all([
      runReadOnly(runner, "curl", curlArgs(`${appOrigin}/cdn-cgi/trace`, addressFamily)),
      runReadOnly(runner, "curl", curlArgs(`${baselineOrigin}/cdn-cgi/trace`, addressFamily)),
      runReadOnly(runner, "curl", curlArgs(`${appOrigin}/pantry`, addressFamily, {
        discardBody: true,
      })),
    ]);
    rawCollectionResults.push(appTraceResult, baselineTraceResult, publicPantryResult);
    appTraceSamples.push(parseProbeResult(appTraceResult, { trace: true }));
    baselineTraceSamples.push(parseProbeResult(baselineTraceResult, { trace: true }));
    publicPantrySamples.push(parseProbeResult(publicPantryResult));

    if (authenticatedPantryCookieFile) {
      const authenticatedPantryResult = await runReadOnly(
        runner,
        "curl",
        curlArgs(`${appOrigin}/api/v1/pantry`, addressFamily, {
          cookieFile: authenticatedPantryCookieFile,
        }),
      );
      rawCollectionResults.push(authenticatedPantryResult);
      authenticatedPantrySamples.push(parseAuthenticatedPantryResult(authenticatedPantryResult));
    }
  }

  const authenticatedPantry = aggregatePantrySamples(authenticatedPantrySamples);
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
    && tunnelLog.connection_health.healthy_connection_count === 4;
  const evidence = {
    schema_version: 1,
    success: collectionCommandsSucceeded
      && publicProbesSucceeded
      && authenticatedProbeSucceeded
      && connectorHealthy,
    captured_at: capturedAt,
    network: { label: networkLabel, address_family: addressFamily },
    connector: {
      cloudflared,
      launch_agent: launchAgent,
      tunnel_log: tunnelLog,
    },
    probes: {
      app_trace: {
        samples: appTraceSamples,
        summary: summarizeProbeSamples(appTraceSamples, {
          expected_count: samples,
          minimum_latency_samples: samples,
        }),
        colo: summarizeColos(appTraceSamples),
      },
      cloudflare_baseline_trace: {
        samples: baselineTraceSamples,
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
  const relativeOutput = path.relative(process.cwd(), options.output);
  if (relativeOutput === "" || (!relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput))) {
    throw new Error("--output must be outside the repository.");
  }
  return options;
}

export async function writeEvidenceFile(outputPath, evidence) {
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
  const canonicalRepository = await realpath(process.cwd());
  const repositoryRelative = path.relative(canonicalRepository, canonicalDirectory);
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

export async function runDiagnosticsCli(argv, dependencies = {}) {
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
