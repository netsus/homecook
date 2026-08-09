#!/usr/bin/env node

import { open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLocalConnectorHealth,
  validateMetricsEndpoint,
} from "./lib/cloudflare-tunnel-health.mjs";

const DEFAULT_METRICS_ENDPOINT = "http://127.0.0.1:20241/metrics";
const DEFAULT_LOG_PATH = "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log";
const MAX_INPUT_BYTES = 1_048_576;

async function defaultReadMetrics(endpoint) {
  const response = await fetch(endpoint, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Metrics endpoint failed.");
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_INPUT_BYTES) {
    throw new Error("Metrics response is too large.");
  }
  return raw;
}

async function defaultReadLog(logPath) {
  if (typeof logPath !== "string" || !path.isAbsolute(logPath) || logPath.includes("\0")) {
    throw new Error("Tunnel log path must be absolute.");
  }
  const handle = await open(logPath, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error("Tunnel log must be a regular file.");
    const length = Math.min(stats.size, MAX_INPUT_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, stats.size - length));
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function runHealthCli(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  try {
    if (!Array.isArray(argv) || argv.length !== 0) {
      throw new Error("This CLI accepts no arguments.");
    }
    const env = dependencies.env ?? process.env;
    const metricsEndpoint = validateMetricsEndpoint(
      env.CLOUDFLARE_TUNNEL_METRICS_ENDPOINT ?? DEFAULT_METRICS_ENDPOINT,
    );
    const logPath = env.CLOUDFLARE_TUNNEL_LOG_PATH ?? DEFAULT_LOG_PATH;
    const [metricsRaw, logRaw] = await Promise.all([
      (dependencies.readMetrics ?? defaultReadMetrics)(metricsEndpoint),
      (dependencies.readLog ?? defaultReadLog)(logPath),
    ]);
    const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const health = buildLocalConnectorHealth({
      captured_at: capturedAt,
      metrics_raw: metricsRaw,
      log_raw: logRaw,
    });
    stdout(`${JSON.stringify(health)}\n`);
    return ["healthy", "warning"].includes(health.state) ? 0 : 1;
  } catch {
    stderr("cloudflare-tunnel-health: FAIL (redacted)\n");
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await runHealthCli(process.argv.slice(2));
