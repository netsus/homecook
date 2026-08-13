#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertRecipeSnapshotAuthorityMergedExactSource,
  buildRecipeSnapshotAuthorityGitEnvironment,
  assertRecipeSnapshotAuthorityRemoteVerificationResult,
  buildRecipeSnapshotAuthorityRemotePsqlRequest,
  buildRecipeSnapshotAuthorityRemoteVerificationPlan,
  parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment,
} from "./lib/recipe-snapshot-authority-remote-verifier.mjs";
import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write(
    "FORBIDDEN: remote recipe-snapshot verification is historical under the local-only contract.\n",
  );
  process.exit(1);
}

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

function runStatus(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`${command} failed without exposing captured output`);
  }
  return result.status;
}

function assertMergedExactSource(repositoryRoot) {
  const gitEnvironment = buildRecipeSnapshotAuthorityGitEnvironment({
    baseEnvironment: process.env,
  });
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const trackedStatus = run(
    "git",
    ["status", "--short", "--untracked-files=no"],
    { cwd: repositoryRoot, env: gitEnvironment },
  );
  const graftsPath = run(
    "git",
    ["rev-parse", "--git-path", "info/grafts"],
    { cwd: repositoryRoot, env: gitEnvironment },
  );
  const resolvedGraftsPath = isAbsolute(graftsPath)
    ? graftsPath
    : resolve(repositoryRoot, graftsPath);
  const legacyGrafts = existsSync(resolvedGraftsPath)
    ? readFileSync(resolvedGraftsPath, "utf8").trim()
    : "";

  return assertRecipeSnapshotAuthorityMergedExactSource({
    head,
    originMaster,
    isAncestorOfOriginMaster:
      runStatus(
        "git",
        [
          "--no-replace-objects",
          "merge-base",
          "--is-ancestor",
          head,
          originMaster,
        ],
        { cwd: repositoryRoot, env: gitEnvironment },
      ) === 0,
    legacyGrafts,
    trackedStatus,
  });
}

const mode = readOption("--mode");
const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const plan = buildRecipeSnapshotAuthorityRemoteVerificationPlan({ mode });
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
      mergeSha,
    }, null, json ? 2 : 0)}\n`);
    process.exit(0);
  }

  const linkedRoot = resolveSecurityFunctionLinkedRoot({
    requireEnvironment: false,
  });
  const databaseEnvironment =
    parseRecipeSnapshotAuthorityLinkedDatabaseEnvironment({
      output: run(
        "pnpm",
        ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
        { cwd: linkedRoot },
      ),
    });
  const request = buildRecipeSnapshotAuthorityRemotePsqlRequest({
    baseEnvironment: process.env,
    databaseEnvironment,
    planSql: plan.sql,
  });
  const rawResult = run("psql", request.args, {
    cwd: linkedRoot,
    input: request.input,
    env: request.environment,
  });
  const result = JSON.parse(rawResult);
  assertRecipeSnapshotAuthorityRemoteVerificationResult(result);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: plan.mode,
    mergeSha,
    result,
  }, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `recipe snapshot authority remote verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
