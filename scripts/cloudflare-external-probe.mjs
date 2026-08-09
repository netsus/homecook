#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXTERNAL_PROBE_CONTRACT,
  aggregateExternalProbeWindow,
} from "./lib/cloudflare-external-probe.mjs";

const MAX_STDIN_BYTES = 16 * 1_024 * 1_024;

async function defaultReadStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_STDIN_BYTES) throw new Error("stdin exceeds the limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runExternalProbeCli(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  try {
    if (!Array.isArray(argv) || argv.length !== 1 || !["contract", "aggregate"].includes(argv[0])) {
      throw new Error("Expected exactly one safe subcommand.");
    }
    if (argv[0] === "contract") {
      stdout(`${JSON.stringify(EXTERNAL_PROBE_CONTRACT)}\n`);
      return 0;
    }
    const raw = await (dependencies.readStdin ?? defaultReadStdin)();
    if (Buffer.byteLength(raw, "utf8") > MAX_STDIN_BYTES) {
      throw new Error("stdin exceeds the limit.");
    }
    const aggregate = aggregateExternalProbeWindow(JSON.parse(raw));
    stdout(`${JSON.stringify(aggregate)}\n`);
    return aggregate.public.gate_pass ? 0 : 1;
  } catch {
    stderr("cloudflare-external-probe: FAIL (redacted)\n");
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await runExternalProbeCli(process.argv.slice(2));
