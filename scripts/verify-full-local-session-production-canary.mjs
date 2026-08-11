#!/usr/bin/env node

import { fork, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PRODUCTION_CANARY_STAGES,
  ProductionCanaryStageFailure,
  buildRefreshLifecycleGateResult,
  buildProductionCanaryWorkerEnv,
  resolveProductionCanaryWorkerTimeout,
  runProductionCanary,
  validateProductionCanaryAdapterPath,
  validateProductionCanaryResult,
} from "./lib/full-local-session-production-canary.mjs";
import { readFullLocalSessionObservation } from "./lib/full-local-session-observation-reader.mjs";

const currentFile = realpathSync(fileURLToPath(import.meta.url));

const OBSERVATION_RESPONSE_KEYS = Object.freeze([
  "observation",
  "requestId",
  "type",
]);

function hasExactKeys(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function sendIpc(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== "function" || !process.connected) {
      reject(new Error("Production canary IPC is unavailable."));
      return;
    }
    process.send(message, (error) => {
      if (error) reject(new Error("Production canary IPC send failed."));
      else resolve();
    });
  });
}

function createParentBackedObservationReader() {
  let nextRequestId = 1;
  let pending = false;
  return () => new Promise((resolve, reject) => {
    if (pending || nextRequestId > 2) {
      reject(new Error("Production canary observation IPC sequence is invalid."));
      return;
    }
    pending = true;
    const requestId = nextRequestId;
    const onMessage = (message) => {
      pending = false;
      if (!hasExactKeys(message, OBSERVATION_RESPONSE_KEYS)
        || message.type !== "observation-response"
        || message.requestId !== requestId) {
        reject(new Error("Production canary observation IPC response is invalid."));
        return;
      }
      nextRequestId += 1;
      resolve(message.observation);
    };
    process.once("message", onMessage);
    sendIpc({ requestId, type: "observation-request" }).catch(() => {
      process.off("message", onMessage);
      pending = false;
      reject(new Error("Production canary observation IPC request failed."));
    });
  });
}

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
    const result = await runProductionCanary({
      adapter,
      implementationSha: sha,
      observationReader: createParentBackedObservationReader(),
      phase,
      reportStage: (event) => sendIpc({ ...event, type: "stage" }),
    });
    await sendIpc({ ok: true, result, type: "result" });
  } catch {
    await sendIpc({ ok: false, type: "result" }).catch(() => undefined);
    process.exitCode = 1;
  }
}

export function runCanaryInIsolatedWorker({
  adapterPath,
  ambientEnv = process.env,
  implementationSha: sha,
  observationReader = readFullLocalSessionObservation,
  phase,
}) {
  return new Promise((resolve, reject) => {
    let timeoutMs;
    try {
      timeoutMs = resolveProductionCanaryWorkerTimeout({
        configuredTimeout: ambientEnv.FULL_LOCAL_SESSION_CANARY_TIMEOUT_MS,
        phase,
      });
    } catch (error) {
      reject(error);
      return;
    }
    const worker = fork(currentFile, [
      "--adapter-worker",
      "--phase",
      phase,
      "--implementation-sha",
      sha,
    ], {
      env: buildProductionCanaryWorkerEnv(ambientEnv, adapterPath),
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    let activeStage = null;
    let expectedObservationRequestId = 1;
    let expectedStageIndex = 0;
    let observationReadPending = false;
    const rejectClosed = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.kill("SIGKILL");
      reject(error instanceof Error ? error : new Error(error));
    };
    const rejectAtActiveStage = (fallbackMessage) => {
      rejectClosed(activeStage === null
        ? new Error(fallbackMessage)
        : new ProductionCanaryStageFailure(activeStage));
    };
    const timeout = setTimeout(() => {
      rejectAtActiveStage("Production canary worker timed out.");
    }, timeoutMs);
    worker.on("message", (message) => {
      if (settled) return;
      if (message?.type === "stage") {
        if (!hasExactKeys(message, ["stage", "status", "type"])) {
          rejectClosed("Production canary stage IPC is invalid.");
          return;
        }
        const expectedStage = PRODUCTION_CANARY_STAGES[expectedStageIndex];
        const validStart = message.status === "START"
          && activeStage === null
          && message.stage === expectedStage;
        const validPass = message.status === "PASS"
          && activeStage === expectedStage
          && message.stage === expectedStage;
        if (!validStart && !validPass) {
          rejectClosed("Production canary stage IPC is invalid.");
          return;
        }
        if (validStart) activeStage = message.stage;
        else {
          activeStage = null;
          expectedStageIndex += 1;
        }
        return;
      }
      if (hasExactKeys(message, ["requestId", "type"])
        && message.type === "observation-request") {
        if (observationReadPending
          || message.requestId !== expectedObservationRequestId
          || expectedObservationRequestId > 2) {
          rejectClosed("Production canary observation IPC request is invalid.");
          return;
        }
        observationReadPending = true;
        const requestId = expectedObservationRequestId;
        Promise.resolve().then(() => observationReader()).then((observation) => {
          if (settled) return;
          expectedObservationRequestId += 1;
          observationReadPending = false;
          worker.send({
            observation,
            requestId,
            type: "observation-response",
          }, (error) => {
            if (settled) return;
            if (error) {
              rejectClosed("Production canary observation IPC response failed.");
            }
          });
        }).catch(() => {
          rejectAtActiveStage("Production canary observation reader failed closed.");
        });
        return;
      }
      const success = hasExactKeys(message, ["ok", "result", "type"])
        && message.type === "result"
        && message.ok === true;
      const failure = hasExactKeys(message, ["ok", "type"])
        && message.type === "result"
        && message.ok === false;
      if (failure) {
        rejectAtActiveStage("Production canary adapter failed closed.");
        return;
      }
      if (!success
        || observationReadPending
        || expectedObservationRequestId !== 3
        || activeStage !== null
        || expectedStageIndex !== PRODUCTION_CANARY_STAGES.length) {
        rejectClosed("Production canary adapter failed closed.");
        return;
      }
      try {
        const result = validateProductionCanaryResult(message.result, {
          implementationSha: sha,
          phase,
        });
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      } catch {
        rejectClosed("Production canary adapter returned an invalid result.");
      }
    });
    worker.once("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(activeStage === null
          ? new Error(`Production canary worker exited ${code ?? "unknown"}.`)
          : new ProductionCanaryStageFailure(activeStage));
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
  } catch (error) {
    const stage = error instanceof ProductionCanaryStageFailure ? error.stage : null;
    process.stderr.write(stage === null
      ? "full-local-session-production-canary: FAIL (redacted)\n"
      : `full-local-session-production-canary: FAIL stage=${stage}\n`);
    process.exitCode = 1;
  }
}

function isMain() {
  try {
    return currentFile === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) await main();
