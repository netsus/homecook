#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assertRecipeVisibilityLocalVerificationResult,
  buildRecipeVisibilityLocalPsqlRequest,
  buildRecipeVisibilityLocalVerificationPlan,
  parseRecipeVisibilityLocalDatabaseEnvironment,
} from "./lib/recipe-visibility-read-hardening-local-verifier.mjs";

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
    throw new Error(`${command} failed without exposing captured output`);
  }
  return result.stdout.trim();
}

const mode = readOption("--mode") ?? "local-read-only";
const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const plan = buildRecipeVisibilityLocalVerificationPlan({ mode });

try {
  const databaseEnvironment = parseRecipeVisibilityLocalDatabaseEnvironment({
    output: run("pnpm", ["dlx", "supabase", "status", "-o", "env"], {
      cwd: process.cwd(),
    }),
  });

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: plan.mode,
      readOnly: plan.readOnly,
      requiresLocalSupabase: plan.requiresLocalSupabase,
      requiresMergedOriginMaster: plan.requiresMergedOriginMaster,
      requiresCleanTrackedTree: plan.requiresCleanTrackedTree,
    }, null, json ? 2 : 0)}\n`);
    process.exit(0);
  }

  const request = buildRecipeVisibilityLocalPsqlRequest({
    databaseUrl: databaseEnvironment.databaseUrl,
    planSql: plan.sql,
  });
  const rawResult = run("psql", request.args, {
    cwd: process.cwd(),
    input: request.input,
    env: request.environment,
  });
  const result = JSON.parse(rawResult);
  assertRecipeVisibilityLocalVerificationResult(result);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: plan.mode,
    result,
  }, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `recipe visibility local verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
