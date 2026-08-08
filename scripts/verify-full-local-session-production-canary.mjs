#!/usr/bin/env node

import { fork, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildRefreshLifecycleGateResult,
  buildProductionCanaryWorkerEnv,
  runProductionCanary,
  validateProductionCanaryAdapterPath,
  validateProductionCanaryResult,
} from "./lib/full-local-session-production-canary.mjs";

const currentFile = realpathSync(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = argv.filter((argument) => argument !== "--");
  const parsed = {
    adapterWorker: false,
    implementationSha: undefined,
    json: false,
    phase: undefined,
    refreshLifecycleGate: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--adapter-worker") parsed.adapterWorker = true;
    else if (argument === "--json") parsed.json = true;
    else if (argument === "--refresh-lifecycle-gate") parsed.refreshLifecycleGate = true;
    else if (argument === "--phase" && args[index + 1]) {
      parsed.phase = args[index + 1];
      index += 1;
    } else if (argument === "--implementation-sha" && args[index + 1]) {
      parsed.implementationSha = args[index + 1];
      index += 1;
    } else {
      throw new Error("Production canary arguments are invalid.");
    }
  }
  return parsed;
}

function implementationSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const sha = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[a-f0-9]{40}$/u.test(sha)) {
    throw new Error("Production canary implementation SHA is unavailable.");
  }
  return sha;
}

async function runAdapterWorker({ implementationSha: sha, phase }) {
  try {
    const adapterPath = validateProductionCanaryAdapterPath(
      process.env.FULL_LOCAL_SESSION_CANARY_ADAPTER,
    );
    const adapterModule = await import(pathToFileURL(adapterPath).href);
    if (typeof adapterModule.createProductionCanaryAdapter !== "function") {
      throw new Error("Production canary adapter factory is missing.");
    }
    const adapter = await adapterModule.createProductionCanaryAdapter({ phase });
    const result = await runProductionCanary({ adapter, implementationSha: sha, phase });
    process.send?.({ ok: true, result });
  } catch {
    process.send?.({ ok: false });
    process.exitCode = 1;
  }
}

function runCanaryInIsolatedWorker({ adapterPath, implementationSha: sha, phase }) {
  return new Promise((resolve, reject) => {
    const configuredTimeout = process.env.FULL_LOCAL_SESSION_CANARY_TIMEOUT_MS ?? "1200000";
    if (!/^\d+$/u.test(configuredTimeout)) {
      reject(new Error("Production canary worker timeout is invalid."));
      return;
    }
    const timeoutMs = Number(configuredTimeout);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 1_200_000) {
      reject(new Error("Production canary worker timeout is out of range."));
      return;
    }
    const worker = fork(currentFile, [
      "--adapter-worker",
      "--phase",
      phase,
      "--implementation-sha",
      sha,
    ], {
      env: buildProductionCanaryWorkerEnv(process.env, adapterPath),
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.kill("SIGKILL");
      reject(new Error("Production canary worker timed out."));
    }, timeoutMs);
    worker.once("message", (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (message?.ok !== true) {
        reject(new Error("Production canary adapter failed closed."));
        return;
      }
      try {
        resolve(validateProductionCanaryResult(message.result, {
          implementationSha: sha,
          phase,
        }));
      } catch {
        reject(new Error("Production canary adapter returned an invalid result."));
      }
    });
    worker.once("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Production canary worker exited ${code ?? "unknown"}.`));
      }
    });
    worker.once("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Production canary worker failed to start."));
      }
    });
  });
}

function runRefreshLifecycleGate() {
  const result = spawnSync("pnpm", ["verify:full-local-session-refresh-lifecycle"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return buildRefreshLifecycleGateResult(result.status);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.adapterWorker) {
      await runAdapterWorker(args);
      return;
    }
    if (!args.json) {
      throw new Error("Production canary requires --json.");
    }
    const result = args.refreshLifecycleGate
      ? runRefreshLifecycleGate()
      : await runCanaryInIsolatedWorker({
        adapterPath: validateProductionCanaryAdapterPath(
          process.env.FULL_LOCAL_SESSION_CANARY_ADAPTER,
        ),
        implementationSha: implementationSha(),
        phase: args.phase,
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write("full-local-session-production-canary: FAIL (redacted)\n");
    process.exitCode = 1;
  }
}

await main();
