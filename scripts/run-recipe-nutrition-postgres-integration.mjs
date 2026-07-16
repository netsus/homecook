#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildRecipeNutritionPostgresVitestArgs } from "./lib/recipe-nutrition-postgres-runner-options.mjs";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function hasPostgresTools(directory) {
  return POSTGRES_TOOLS.every((tool) => existsSync(path.join(directory, tool)));
}

function findPostgresBin() {
  const pgConfig = commandResult("pg_config", ["--bindir"]);
  const candidates = [];
  if (pgConfig.status === 0) candidates.push(pgConfig.stdout.trim());
  for (const root of ["/usr/lib/postgresql", "/opt/homebrew/bin", "/usr/local/bin"]) {
    if (!existsSync(root)) continue;
    if (root.endsWith("postgresql")) {
      candidates.push(...readdirSync(root)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .map((version) => path.join(root, version, "bin")));
    } else {
      candidates.push(root);
    }
  }
  return candidates.find((candidate) => hasPostgresTools(candidate)) ?? null;
}

function runRequired(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`PostgreSQL integration command failed: ${path.basename(command)}`);
  }
  return result;
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
    if (port === null) throw new Error("Unable to reserve a PostgreSQL test port");
    if (port !== 5432) return port;
  }
}

function runFixtureFallback() {
  process.stdout.write(
    "POSTGRES_RUNTIME_UNAVAILABLE: running static recipe nutrition gates; isolated PostgreSQL remains required before push.\n",
  );
  const result = commandResult(
    "pnpm",
    ["exec", "vitest", "run", "tests/recipe-nutrition-rls.test.ts", "tests/recipe-nutrition-snapshot.test.ts"],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
}

const postgresBin = findPostgresBin();
if (postgresBin === null) {
  runFixtureFallback();
} else {
  const clusterTmpRoot = existsSync("/tmp") ? "/tmp" : tmpdir();
  const root = mkdtempSync(path.join(clusterTmpRoot, "hcn-recipe-pg-"));
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_recipe_nutrition_test";
  const port = await reservePort();
  let started = false;

  try {
    runRequired(path.join(postgresBin, "initdb"), [
      "-D", dataDirectory,
      "-U", "postgres",
      "-A", "trust",
    ]);
    mkdirSync(socketDirectory);
    runRequired(path.join(postgresBin, "pg_ctl"), [
      "-D", dataDirectory,
      "-o", `-p ${port} -h 127.0.0.1 -k ${socketDirectory}`,
      "-l", path.join(root, "postgres.log"),
      "-w",
      "start",
    ]);
    started = true;
    runRequired(path.join(postgresBin, "createdb"), [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      database,
    ]);

    const bootstrapSql = `
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  social_provider text not null,
  social_id text not null
);
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  standard_name text not null unique,
  category text not null,
  default_unit text
);
create table public.ingredient_synonyms (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  synonym text not null,
  unique (ingredient_id, synonym)
);
create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  source text not null,
  actor_user_id uuid,
  message_summary text,
  metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info', 'warn', 'error', 'critical'))
);
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  base_servings integer not null default 2 check (base_servings > 0),
  updated_at timestamptz not null default now()
);
create type public.recipe_ingredient_type as enum ('QUANT', 'TO_TASTE');
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  amount numeric(10, 2),
  unit varchar(20),
  ingredient_type public.recipe_ingredient_type not null,
  sort_order integer not null default 0,
  scalable boolean not null default true,
  check (
    (ingredient_type = 'QUANT' and amount is not null and amount > 0 and unit is not null)
    or (ingredient_type = 'TO_TASTE' and amount is null and unit is null and not scalable)
  )
);
create table public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  extraction_meta_json jsonb not null default '{}'::jsonb
);
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id)
);
grant usage on schema public to anon, authenticated, service_role;
`;
    const connectionArgs = [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      "-d", database,
      "-v", "ON_ERROR_STOP=1",
    ];
    runRequired(path.join(postgresBin, "psql"), [...connectionArgs, "-c", bootstrapSql]);
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-c", `comment on database ${database} is 'homecook-isolated-local-v1';`,
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-f", "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-f", "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
    ]);

    const test = commandResult(
      "pnpm",
      buildRecipeNutritionPostgresVitestArgs(),
      {
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
          HOMECOOK_RECIPE_NUTRITION_PG_INTEGRATION: "1",
          HOMECOOK_RECIPE_NUTRITION_PGHOST: "127.0.0.1",
          HOMECOOK_RECIPE_NUTRITION_PGPORT: String(port),
          HOMECOOK_RECIPE_NUTRITION_PGDATABASE: database,
        },
      },
    );
    process.exitCode = test.status ?? 1;
  } finally {
    if (started) {
      commandResult(path.join(postgresBin, "pg_ctl"), [
        "-D", dataDirectory,
        "-m", "fast",
        "-w",
        "stop",
      ]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}
