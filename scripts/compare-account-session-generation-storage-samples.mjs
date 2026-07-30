#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assertAccountGenerationRemoteVerificationResult,
  assertAccountGenerationMergedExactSource,
  compareAccountGenerationJointStorageInventoryEnvelopes,
  readAccountGenerationJointStorageInventoryEnvelope,
} from "./lib/account-session-generation-remote-verifier.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.stderr?.trim() || "no diagnostic output"}`,
    );
  }
  return result.stdout.trim();
}

function assertMergedOriginMaster(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], { cwd: repositoryRoot });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
  });
  const trackedStatus = run("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
  });
  return assertAccountGenerationMergedExactSource({
    head,
    originMaster,
    trackedStatus,
  });
}

const firstPath = readOption("--first");
const forbiddenSecondPath = readOption("--second");
const json = process.argv.includes("--json");

try {
  if (forbiddenSecondPath) {
    throw new Error("--second is no longer allowed; compare CLI always captures the live second sample itself");
  }
  if (!firstPath) {
    throw new Error("compare CLI requires --first <path>");
  }

  const repositoryRoot = process.cwd();
  const mergeSha = assertMergedOriginMaster(repositoryRoot);
  const firstEnvelope = readAccountGenerationJointStorageInventoryEnvelope({
    filePath: firstPath,
  });

  const liveSecond = spawnSync(
    process.execPath,
    [
      "scripts/verify-account-session-generation-remote.mjs",
      "--mode",
      "joint-storage-inventory-sample",
      "--json",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  if (![0, 1].includes(liveSecond.status ?? -1)) {
    throw new Error(
      `live second sample exited unexpectedly: ${liveSecond.stderr?.trim() || "no diagnostic output"}`,
    );
  }
  if (liveSecond.stderr?.trim()) {
    throw new Error(
      `live second sample wrote stderr: ${liveSecond.stderr.trim()}`,
    );
  }

  let secondEnvelope;
  try {
    secondEnvelope = JSON.parse(liveSecond.stdout.trim());
  } catch (error) {
    throw new Error(
      `live second sample did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!secondEnvelope || typeof secondEnvelope !== "object" || Array.isArray(secondEnvelope)) {
    throw new Error("live second sample must return a JSON object envelope");
  }
  if (secondEnvelope.mode !== "joint-storage-inventory-sample") {
    throw new Error("live second sample returned an unexpected mode");
  }
  if (typeof secondEnvelope.ok !== "boolean") {
    throw new Error("live second sample must include boolean ok");
  }
  if ((liveSecond.status === 0) !== secondEnvelope.ok) {
    throw new Error("live second sample exit status must match JSON ok");
  }
  if (secondEnvelope.mergeSha !== mergeSha) {
    throw new Error(
      "live second storage inventory sample must match current origin/master mergeSha",
    );
  }
  assertAccountGenerationRemoteVerificationResult({
    mode: secondEnvelope.mode,
    result: secondEnvelope.result,
  });

  const comparison = compareAccountGenerationJointStorageInventoryEnvelopes({
    firstEnvelope,
    secondEnvelope,
  });

  process.stdout.write(`${JSON.stringify(comparison, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `account generation storage sample compare failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
