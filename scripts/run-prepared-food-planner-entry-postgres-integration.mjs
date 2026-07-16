#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, { cwd: process.cwd(), encoding: "utf8", ...options });
}

function findPostgresBin() {
  const pgConfig = command("pg_config", ["--bindir"]);
  const candidates = pgConfig.status === 0 ? [pgConfig.stdout.trim()] : [];
  for (const root of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql"]) {
    if (!existsSync(root)) continue;
    if (root.endsWith("postgresql")) {
      candidates.push(...readdirSync(root).map((version) => path.join(root, version, "bin")));
    } else candidates.push(root);
  }
  const cellar = "/opt/homebrew/Cellar";
  if (existsSync(cellar)) {
    for (const formula of readdirSync(cellar).filter((name) => name.startsWith("postgresql"))) {
      const root = path.join(cellar, formula);
      candidates.push(...readdirSync(root)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .map((version) => path.join(root, version, "bin")));
    }
  }
  return candidates.find((directory) =>
    TOOLS.every((tool) => existsSync(path.join(directory, tool)))
      && command(path.join(directory, "postgres"), ["--version"]).status === 0
  ) ?? null;
}

function required(commandName, args, options = {}) {
  const result = command(commandName, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`PostgreSQL integration command failed: ${path.basename(commandName)}`);
  }
}

async function reservePort() {
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

const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write("POSTGRES_RUNTIME_UNAVAILABLE: prepared food planner entry real DB gate cannot be skipped.\n");
  process.exitCode = 1;
} else {
  const root = mkdtempSync(path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), "hcn-product-entry-pg-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const database = "homecook_product_entry_test";
  const port = await reservePort();
  let started = false;
  try {
    required(path.join(postgresBin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust"]);
    mkdirSync(socket);
    required(path.join(postgresBin, "pg_ctl"), [
      "-D", data,
      "-o", `-p ${port} -h 127.0.0.1 -k ${socket}`,
      "-l", path.join(root, "postgres.log"), "-w", "start",
    ]);
    started = true;
    required(path.join(postgresBin, "createdb"), [
      "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", database,
    ]);
    const args = [
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
    required(path.join(postgresBin, "psql"), [...args, "-c", bootstrap]);
    required(path.join(postgresBin, "psql"), [
      ...args, "-c", `comment on database ${database} is 'homecook-isolated-product-entry-v1';`,
    ]);
    for (const migration of [
      "supabase/migrations/20260301000000_core_schema_bootstrap.sql",
      "supabase/migrations/20260610170000_recipe_book_cover_metadata.sql",
      "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
      "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
      "supabase/migrations/20260716120000_prepared_food_catalog.sql",
      "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
    ]) required(path.join(postgresBin, "psql"), [...args, "-f", migration]);

    const test = command("pnpm", [
      "exec", "vitest", "run", "tests/prepared-food-planner-entry-postgres.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        HOMECOOK_PRODUCT_ENTRY_PG_INTEGRATION: "1",
        HOMECOOK_PRODUCT_ENTRY_PGHOST: "127.0.0.1",
        HOMECOOK_PRODUCT_ENTRY_PGPORT: String(port),
        HOMECOOK_PRODUCT_ENTRY_PGDATABASE: database,
      },
    });
    process.exitCode = test.status ?? 1;
  } finally {
    if (started) command(path.join(postgresBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}
