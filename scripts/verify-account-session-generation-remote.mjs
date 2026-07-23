#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assertAccountGenerationRemoteVerificationResult,
  buildAccountGenerationRemoteVerificationPlan,
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

function parseDatabaseEnvironment(output) {
  const environment = { ...process.env };
  let matched = 0;

  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(
      /^export ([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|(\S+))$/u,
    );
    if (!match) continue;
    environment[match[1]] = match[2] ?? match[3] ?? match[4];
    matched += 1;
  }

  if (matched === 0) {
    throw new Error("linked Supabase database environment was not found");
  }
  return environment;
}

function assertMergedOriginMaster(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], { cwd: repositoryRoot });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
  });
  if (head !== originMaster) {
    throw new Error(
      "post-merge dark-ship verification requires HEAD to equal origin/master",
    );
  }
  return head;
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
  const databaseEnvironment = parseDatabaseEnvironment(
    run(
      "pnpm",
      ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
      { cwd: linkedRoot },
    ),
  );
  const rawResult = run(
    "psql",
    ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", plan.sql],
    { cwd: linkedRoot, env: databaseEnvironment },
  );
  const result = JSON.parse(rawResult);
  assertAccountGenerationRemoteVerificationResult({ mode, result });

  const output = { ok: true, mode, mergeSha, result };
  process.stdout.write(`${JSON.stringify(output, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `account generation remote verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
