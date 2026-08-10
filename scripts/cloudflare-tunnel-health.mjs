#!/usr/bin/env node

import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLocalConnectorHealth,
  localConnectorHealthExitCode,
  validateMetricsEndpoint,
} from "./lib/cloudflare-tunnel-health.mjs";

const DEFAULT_METRICS_ENDPOINT = "http://127.0.0.1:20241/metrics";
const DEFAULT_LOG_PATH = "/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log";
const MAX_INPUT_BYTES = 1_048_576;

async function defaultReadMetrics(endpoint) {
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || response.url !== endpoint || response.body === null) {
    throw new Error("Metrics endpoint failed.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new Error("Metrics response is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The bounded read has already failed closed.
    }
    throw error;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateLogPath(logPath) {
  if (logPath !== DEFAULT_LOG_PATH || logPath.includes("\0")) {
    throw new Error("Tunnel log path is not allowlisted.");
  }
  return logPath;
}

async function defaultReadLog(logPath) {
  validateLogPath(logPath);
  const canonicalPath = await realpath(logPath);
  if (canonicalPath !== logPath) throw new Error("Tunnel log path is not canonical.");
  const before = await lstat(logPath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Tunnel log must be a regular file.");
  const handle = await open(logPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    const after = await lstat(logPath);
    if (
      !stats.isFile()
      || after.isSymbolicLink()
      || stats.dev !== before.dev
      || stats.ino !== before.ino
      || stats.dev !== after.dev
      || stats.ino !== after.ino
    ) {
      throw new Error("Tunnel log identity changed.");
    }
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
    validateLogPath(logPath);
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
    const exitCode = localConnectorHealthExitCode(health);
    if (exitCode === null) throw new Error("Invalid local health summary.");
    stdout(`${JSON.stringify(health)}\n`);
    return exitCode;
  } catch {
    stderr("cloudflare-tunnel-health: FAIL (redacted)\n");
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await runHealthCli(process.argv.slice(2));
