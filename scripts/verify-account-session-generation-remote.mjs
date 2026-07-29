#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assessAccountGenerationJointActivationPreflightResult,
  assertAccountGenerationMergedExactSource,
  assertAccountGenerationRemoteVerificationResult,
  buildAccountGenerationRemotePsqlRequest,
  buildAccountGenerationRemoteVerificationPlan,
  parseAccountGenerationLinkedDatabaseEnvironment,
} from "./lib/account-session-generation-remote-verifier.mjs";
import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";

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

const mode = readOption("--mode");
const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const plan = buildAccountGenerationRemoteVerificationPlan({ mode });
const repositoryRoot = process.cwd();

try {
  const mergeSha = plan.requiresMergedOriginMaster
    ? assertMergedOriginMaster(repositoryRoot)
    : null;

  if (dryRun) {
    const output = {
      ok: true,
      mode: plan.mode,
      readOnly: plan.readOnly,
      requiresMergedOriginMaster: plan.requiresMergedOriginMaster,
      mergeSha,
    };
    process.stdout.write(`${JSON.stringify(output, null, json ? 2 : 0)}\n`);
    process.exit(0);
  }

  const linkedRoot = resolveSecurityFunctionLinkedRoot({
    requireEnvironment: false,
  });
  const databaseEnvironment = parseAccountGenerationLinkedDatabaseEnvironment({
    output:
    run(
      "pnpm",
      ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
      { cwd: linkedRoot },
    ),
  });
  const psqlRequest = buildAccountGenerationRemotePsqlRequest({
    baseEnvironment: process.env,
    databaseEnvironment,
    planSql: plan.sql,
  });
  const rawResult = run(
    "psql",
    psqlRequest.args,
    {
      cwd: linkedRoot,
      env: psqlRequest.environment,
      input: psqlRequest.input,
    },
  );
  const result = JSON.parse(rawResult);
  assertAccountGenerationRemoteVerificationResult({ mode, result });

  const output = { ok: true, mode, mergeSha, result };
  if (mode === "joint-activation-preflight") {
    output.assessment = assessAccountGenerationJointActivationPreflightResult(result);
    output.ok = false;
    process.stdout.write(`${JSON.stringify(output, null, json ? 2 : 0)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(output, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `account generation remote verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
