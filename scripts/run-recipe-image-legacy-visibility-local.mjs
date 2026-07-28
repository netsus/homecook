#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const LOCAL_ONLY_ENV = "HOMECOOK_STORAGE_LIVE_LOCAL_ONLY";
const LIVE_TEST_PATH = "tests/recipe-image-legacy-visibility-storage.live.test.ts";
const LIVE_TEST_NAME = "copies private/public bytes and swaps read projections";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    json: false,
  };
  for (const token of argv) {
    if (token === "--") continue;
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }
  return options;
}

function parseSupabaseStatusEnv(output) {
  return Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/u))
      .filter((match) => Boolean(match))
      .map((match) => [match[1], match[2]]),
  );
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

function requireLocalOptIn() {
  if (process.env[LOCAL_ONLY_ENV] !== "1") {
    throw new Error(`${LOCAL_ONLY_ENV}=1 is required for local legacy image migration`);
  }
}

function assertLocalUrl({ rawValue, label, protocol, hostname, port }) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a local Supabase URL`);
  }

  if (
    url.protocol !== protocol
    || url.hostname !== hostname
    || url.port !== port
  ) {
    throw new Error(`${label} must point to local Supabase ${hostname}:${port}`);
  }

  return rawValue;
}

function buildLocalStorageEnvironment() {
  const statusEnv = parseSupabaseStatusEnv(
    run("pnpm", ["dlx", "supabase", "status", "-o", "env"], {
      cwd: process.cwd(),
    }),
  );
  const storageUrl = assertLocalUrl({
    rawValue: statusEnv.API_URL,
    label: "API_URL",
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "54321",
  });
  const serviceRoleKey = statusEnv.SERVICE_ROLE_KEY;
  const databaseUrl = assertLocalUrl({
    rawValue: statusEnv.DB_URL,
    label: "DB_URL",
    protocol: "postgresql:",
    hostname: "127.0.0.1",
    port: "54322",
  });
  if (!storageUrl || !serviceRoleKey || !databaseUrl) {
    throw new Error("local Supabase Storage environment is incomplete");
  }

  return {
    ...process.env,
    HOMECOOK_STORAGE_LIVE_DB_URL: databaseUrl,
    HOMECOOK_STORAGE_LIVE_LOCAL_ONLY: "1",
    HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY: serviceRoleKey,
    HOMECOOK_STORAGE_LIVE_URL: storageUrl,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  requireLocalOptIn();
  const environment = buildLocalStorageEnvironment();
  const plan = {
    ok: true,
    command: "vitest",
    localOnly: true,
    testPath: LIVE_TEST_PATH,
    testName: LIVE_TEST_NAME,
    effect:
      "copies local fixture legacy image bytes, finalizes managed projections, and keeps old paths",
  };

  if (options.dryRun) {
    process.stdout.write(
      options.json
        ? `${JSON.stringify(plan, null, 2)}\n`
        : `Legacy image local migration dry-run: ${LIVE_TEST_PATH}\n`,
    );
    return;
  }

  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      LIVE_TEST_PATH,
      "-t",
      LIVE_TEST_NAME,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error("local legacy image migration failed");
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
