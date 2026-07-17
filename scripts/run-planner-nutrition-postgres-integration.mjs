#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  cleanupPlannerNutritionPostgresCluster,
  runPlannerNutritionPostgresLifecycle,
} from "./lib/planner-nutrition-postgres-lifecycle.mjs";

const REQUIRED_TOOLS = ["postgres", "initdb", "pg_ctl", "createdb", "psql"];
const REQUIRED_MAJOR = 17;

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, { cwd: process.cwd(), encoding: "utf8", ...options });
}

function postgresVersion(directory) {
  const result = command(path.join(directory, "postgres"), ["--version"]);
  const match = result.status === 0 ? result.stdout.match(/PostgreSQL\)\s+(\d+)\.(\d+)/) : null;
  return match ? { major: Number(match[1]), version: `${match[1]}.${match[2]}` } : null;
}

function findPostgres17Bin() {
  const candidates = [
    process.env.HOMECOOK_POSTGRES17_BIN,
    "/opt/homebrew/opt/postgresql@17/bin",
    "/usr/local/opt/postgresql@17/bin",
    "/usr/lib/postgresql/17/bin",
  ].filter(Boolean);

  for (const cellarRoot of ["/opt/homebrew/Cellar/postgresql@17", "/usr/local/Cellar/postgresql@17"]) {
    if (!existsSync(cellarRoot)) continue;
    candidates.push(...readdirSync(cellarRoot)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => path.join(cellarRoot, version, "bin")));
  }

  const pgConfig = command("pg_config", ["--bindir"]);
  if (pgConfig.status === 0) candidates.push(pgConfig.stdout.trim());

  for (const directory of [...new Set(candidates)]) {
    if (!REQUIRED_TOOLS.every((tool) => existsSync(path.join(directory, tool)))) continue;
    const version = postgresVersion(directory);
    if (version?.major === REQUIRED_MAJOR) return { directory, version: version.version };
  }
  return null;
}

function required(commandName, args, options = {}) {
  const result = command(commandName, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`PostgreSQL integration command failed: ${path.basename(commandName)}`);
  }
  return result;
}

async function reserveNonDefaultPort() {
  while (true) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : null;
    await new Promise((resolve) => server.close(resolve));
    if (port !== null && port !== 5432) return port;
  }
}

const runtime = findPostgres17Bin();
if (!runtime) {
  process.stderr.write(
    "POSTGRES_17_RUNTIME_UNAVAILABLE: planner nutrition requires an isolated PostgreSQL 17 runtime.\n",
  );
  process.exitCode = 1;
} else {
  process.exitCode = await runPlannerNutritionPostgresLifecycle({
    createRoot: () => mkdtempSync(
      path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), "hcn-planner-nutrition-pg17-"),
    ),
    reservePort: reserveNonDefaultPort,
    run: async ({ root, port, state }) => {
      const data = path.join(root, "data");
      const socket = path.join(root, "socket");
      const database = "homecook_planner_nutrition_test";
      if (port === 5432) throw new Error("Planner nutrition PostgreSQL port must not be 5432");

      process.stdout.write(`Planner nutrition PostgreSQL ${runtime.version} on isolated port ${port}\n`);
      required(path.join(runtime.directory, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust"]);
      mkdirSync(socket);
      state.startAttempted = true;
      required(path.join(runtime.directory, "pg_ctl"), [
        "-D", data,
        "-o", `-p ${port} -h 127.0.0.1 -k ${socket}`,
        "-l", path.join(root, "postgres.log"),
        "-w", "start",
      ]);
      state.started = true;
      required(path.join(runtime.directory, "createdb"), [
        "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", database,
      ]);
      const psqlArgs = [
        "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database,
        "-v", "ON_ERROR_STOP=1",
      ];
      const bootstrap = `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table public.operational_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  severity text not null default 'info', source text not null, actor_user_id uuid,
  message_summary text, metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info', 'warn', 'error', 'critical'))
);
grant usage on schema public to anon, authenticated, service_role;
`;
      required(path.join(runtime.directory, "psql"), [...psqlArgs, "-c", bootstrap]);
      required(path.join(runtime.directory, "psql"), [
        ...psqlArgs,
        "-c", `comment on database ${database} is 'homecook-isolated-planner-nutrition-pg17';`,
      ]);
      for (const migration of [
        "supabase/migrations/20260301000000_core_schema_bootstrap.sql",
        "supabase/migrations/20260610170000_recipe_book_cover_metadata.sql",
        "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
        "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
        "supabase/migrations/20260716120000_prepared_food_catalog.sql",
        "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
      ]) {
        required(path.join(runtime.directory, "psql"), [...psqlArgs, "-f", migration]);
      }

      const test = command("pnpm", [
        "exec", "vitest", "run", "tests/planner-nutrition-postgres.integration.test.ts",
        "--pool=forks", "--maxWorkers=1", "--testTimeout=60000",
      ], {
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${runtime.directory}${path.delimiter}${process.env.PATH ?? ""}`,
          HOMECOOK_PLANNER_NUTRITION_PG_INTEGRATION: "1",
          HOMECOOK_PLANNER_NUTRITION_PGHOST: "127.0.0.1",
          HOMECOOK_PLANNER_NUTRITION_PGPORT: String(port),
          HOMECOOK_PLANNER_NUTRITION_PGDATABASE: database,
          HOMECOOK_PLANNER_NUTRITION_PG_VERSION: runtime.version,
        },
      });
      return test.status ?? 1;
    },
    cleanup: ({ root, state }) => cleanupPlannerNutritionPostgresCluster({
      root,
      dataDirectory: path.join(root, "data"),
      pgCtlPath: path.join(runtime.directory, "pg_ctl"),
      lifecycleState: state,
    }),
  });
}
