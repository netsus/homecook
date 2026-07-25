#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertMergedExactSource,
  buildPreparedFoodSearchIndexReleasePlan,
} from "./lib/prepared-food-search-index-release.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function runRequired(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `${command} failed: ${result.stderr?.trim() || result.error?.message || "no diagnostic output"}`,
    );
  }
  return result.stdout.trim();
}

function assertMergedOriginMaster(repositoryRoot) {
  runRequired("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
  });
  return assertMergedExactSource({
    head: runRequired("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
    }),
    originMaster: runRequired("git", ["rev-parse", "origin/master"], {
      cwd: repositoryRoot,
    }),
    trackedStatus: runRequired(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { cwd: repositoryRoot },
    ),
  });
}

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
);
const apply = process.argv.includes("--apply");
const allowIsolatedTest = process.argv.includes("--allow-isolated-test");
const requestedMode = readOption("--mode");
const releaseMode = requestedMode ?? (allowIsolatedTest ? "isolated-test" : null);
const releasePlan = apply
  ? buildPreparedFoodSearchIndexReleasePlan({ mode: releaseMode })
  : null;
const databaseUrl = process.env.PREPARED_FOOD_SEARCH_DATABASE_URL ?? "";
const migrationSql = readFileSync(migrationPath, "utf8");
const canonicalCreateCount =
  migrationSql.match(/create index if not exists/gi)?.length ?? 0;
const concurrentSql = migrationSql.replaceAll(
  /create index if not exists/gi,
  "create index concurrently if not exists",
);
const concurrentCreateCount =
  concurrentSql.match(/create index concurrently if not exists/gi)?.length ?? 0;
const connection = databaseUrl ? new URL(databaseUrl) : null;
const sslMode = connection
  ? (connection.searchParams.get("sslmode")
      ?? (releasePlan?.requiresTls ? "require" : "disable"))
  : null;
const psqlEnvironment = {
  ...process.env,
  ...(connection
    ? {
        PGHOST: connection.hostname,
        PGPORT: connection.port || "5432",
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
        PGDATABASE: decodeURIComponent(connection.pathname.replace(/^\//u, "")),
        PGSSLMODE: sslMode,
      }
    : {}),
};

if (canonicalCreateCount !== 9 || concurrentCreateCount !== canonicalCreateCount) {
  throw new Error("prepared food search index migration must contain exactly nine canonical indexes");
}
if (!apply) {
  process.stdout.write(
    `prepared food search concurrent index plan is valid (${concurrentCreateCount} indexes)\n`,
  );
  process.exit(0);
}
if (!databaseUrl) {
  throw new Error("PREPARED_FOOD_SEARCH_DATABASE_URL is required for --apply");
}
if (allowIsolatedTest && releaseMode !== "isolated-test") {
  throw new Error(
    "--allow-isolated-test cannot be combined with a production release mode",
  );
}
const releaseSha = releasePlan.requiresMergedOriginMaster
  ? assertMergedOriginMaster(process.cwd())
  : null;
if (
  releasePlan.requiresTls
  && !new Set(["require", "verify-ca", "verify-full"]).has(sslMode)
) {
  throw new Error("post-merge release requires TLS for the database connection");
}
if (
  !releasePlan.allowsLocalDatabase
  && new Set(["localhost", "127.0.0.1", "::1"]).has(connection.hostname)
) {
  throw new Error("post-merge release refuses a local database target");
}

if (releasePlan.requiresIsolatedSentinel) {
  const sentinel = spawnSync(
    "psql",
    [
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select pg_catalog.shobj_description(oid, 'pg_database') from pg_catalog.pg_database where datname = current_database();",
    ],
    {
      encoding: "utf8",
      env: psqlEnvironment,
    },
  );
  if (
    sentinel.status !== 0
    || sentinel.stdout.trim() !== "homecook-isolated-product-catalog-v1"
  ) {
    throw new Error(
      `concurrent index apply target is not the approved isolated database (${sentinel.status}:${JSON.stringify(sentinel.stdout.trim())}:${JSON.stringify(sentinel.stderr.trim())})`,
    );
  }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), "homecook-search-index-"));
const transformedMigration = path.join(tempRoot, "concurrent-indexes.sql");
try {
  writeFileSync(transformedMigration, concurrentSql, { mode: 0o600 });
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", transformedMigration],
    {
      encoding: "utf8",
      env: psqlEnvironment,
    },
  );
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stderr ?? "");
    throw new Error("prepared food search concurrent index apply failed");
  }
  process.stdout.write(
    `prepared food search concurrent indexes applied (${concurrentCreateCount} indexes; source=${releaseSha ?? "isolated-test"})\n`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
