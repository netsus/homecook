#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assertPreparedFoodSearchMergedExactSource,
  assertPreparedFoodSearchRemoteVerificationResult,
  buildPreparedFoodSearchPsqlRequest,
  buildPreparedFoodSearchRemoteVerificationPlan,
} from "./lib/prepared-food-search-remote-verifier.mjs";

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

function assertApprovedRemoteDatabase(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("PREPARED_FOOD_SEARCH_DATABASE_URL is required");
  }

  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.endsWith(".local")
  ) {
    throw new Error("post-merge read-only verification refuses a local target");
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode && !["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("post-merge read-only verification requires TLS");
  }
}

function readApprovedActorId() {
  const actorId = process.env.PREPARED_FOOD_SEARCH_ACTOR_ID?.trim() ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      actorId,
    )
  ) {
    throw new Error(
      "PREPARED_FOOD_SEARCH_ACTOR_ID must be an approved UUID smoke actor",
    );
  }
  return actorId;
}

function assertMergedExactSource(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], { cwd: repositoryRoot });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
  });
  const trackedStatus = run(
    "git",
    ["status", "--short", "--untracked-files=no"],
    { cwd: repositoryRoot },
  );

  return assertPreparedFoodSearchMergedExactSource({
    head,
    originMaster,
    trackedStatus,
  });
}

const mode = readOption("--mode");
const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const plan = buildPreparedFoodSearchRemoteVerificationPlan({ mode });
const repositoryRoot = process.cwd();

try {
  const mergeSha = assertMergedExactSource(repositoryRoot);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: plan.mode,
      readOnly: plan.readOnly,
      requiresMergedOriginMaster: plan.requiresMergedOriginMaster,
      requiresCleanTrackedTree: plan.requiresCleanTrackedTree,
      expectedIndexCount: plan.expectedIndexCount,
      mergeSha,
    }, null, json ? 2 : 0)}\n`);
    process.exit(0);
  }

  const databaseUrl = process.env.PREPARED_FOOD_SEARCH_DATABASE_URL;
  assertApprovedRemoteDatabase(databaseUrl);
  const actorId = readApprovedActorId();
  const request = buildPreparedFoodSearchPsqlRequest({
    actorId,
    databaseUrl,
    environment: process.env,
    planSql: plan.sql,
  });
  const rawResult = run(
    "psql",
    request.args,
    {
      cwd: repositoryRoot,
      input: request.input,
      env: request.environment,
    },
  );
  const result = JSON.parse(rawResult);
  assertPreparedFoodSearchRemoteVerificationResult(result);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: plan.mode,
    mergeSha,
    result,
  }, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `prepared food search remote verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
