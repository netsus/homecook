#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", ...options });
}

function findPostgresBin() {
  const pgConfig = commandResult("pg_config", ["--bindir"]);
  const candidates = pgConfig.status === 0 ? [pgConfig.stdout.trim()] : [];
  for (const root of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql"]) {
    if (!existsSync(root)) continue;
    if (root.endsWith("postgresql")) {
      candidates.push(...readdirSync(root).map((version) => path.join(root, version, "bin")));
    } else {
      candidates.push(root);
    }
  }
  const cellar = "/opt/homebrew/Cellar";
  if (existsSync(cellar)) {
    for (const formula of readdirSync(cellar).filter((name) => name.startsWith("postgresql"))) {
      const formulaRoot = path.join(cellar, formula);
      candidates.push(...readdirSync(formulaRoot)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .map((version) => path.join(formulaRoot, version, "bin")));
    }
  }
  return candidates.find((directory) =>
    POSTGRES_TOOLS.every((tool) => existsSync(path.join(directory, tool)))
      && commandResult(path.join(directory, "postgres"), ["--version"]).status === 0
  ) ?? null;
}

function runRequired(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`PostgreSQL integration command failed: ${path.basename(command)}`);
  }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (port === null || port === 5432) throw new Error("Unable to reserve isolated PostgreSQL port");
  return port;
}

const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write("POSTGRES_RUNTIME_UNAVAILABLE: public prepared food import requires isolated PostgreSQL.\n");
  process.exitCode = 1;
} else {
  const root = mkdtempSync(path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), "hcn-public-prepared-food-pg-"));
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_public_prepared_food_import_test";
  const port = await reservePort();
  let started = false;
  try {
    runRequired(path.join(postgresBin, "initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust"]);
    mkdirSync(socketDirectory);
    runRequired(path.join(postgresBin, "pg_ctl"), [
      "-D", dataDirectory,
      "-o", `-p ${port} -h 127.0.0.1 -k ${socketDirectory}`,
      "-l", path.join(root, "postgres.log"), "-w", "start",
    ]);
    started = true;
    runRequired(path.join(postgresBin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", database]);
    const args = ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
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
create table public.users (
  id uuid primary key default gen_random_uuid(), nickname text not null,
  social_provider text not null, social_id text not null
);
create table public.ingredients (
  id uuid primary key default gen_random_uuid(), standard_name text not null unique,
  category text not null, default_unit text
);
create table public.ingredient_synonyms (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  synonym text not null, unique (ingredient_id, synonym)
);
create table public.operational_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  severity text not null default 'info', source text not null, actor_user_id uuid,
  message_summary text, metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info', 'warn', 'error', 'critical'))
);
create table public.recipes (
  id uuid primary key default gen_random_uuid(), title text not null,
  base_servings integer not null default 2 check (base_servings > 0),
  updated_at timestamptz not null default now()
);
create type public.recipe_ingredient_type as enum ('QUANT', 'TO_TASTE');
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id), amount numeric(10,2),
  unit varchar(20), ingredient_type public.recipe_ingredient_type not null,
  sort_order integer not null default 0, scalable boolean not null default true,
  check ((ingredient_type='QUANT' and amount is not null and amount>0 and unit is not null)
    or (ingredient_type='TO_TASTE' and amount is null and unit is null and not scalable))
);
create table public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  extraction_meta_json jsonb not null default '{}'::jsonb
);
create table public.meals (
  id uuid primary key default gen_random_uuid(), recipe_id uuid not null references public.recipes(id)
);
grant usage on schema public to anon, authenticated, service_role;
`;
    runRequired(path.join(postgresBin, "psql"), [...args, "-c", bootstrap]);
    runRequired(path.join(postgresBin, "psql"), [...args, "-c", `comment on database ${database} is 'homecook-isolated-product-catalog-v1';`]);
    for (const migration of [
      "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
      "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
      "supabase/migrations/20260716120000_prepared_food_catalog.sql",
      "supabase/migrations/20260717093000_public_prepared_food_catalog_import.sql",
    ]) {
      runRequired(path.join(postgresBin, "psql"), [...args, "-f", migration]);
    }

    const test = commandResult("pnpm", [
      "exec", "vitest", "run", "tests/public-prepared-food-import-postgres.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=120000",
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION: "1",
        HOMECOOK_PRODUCT_CATALOG_PGHOST: "127.0.0.1",
        HOMECOOK_PRODUCT_CATALOG_PGPORT: String(port),
        HOMECOOK_PRODUCT_CATALOG_PGDATABASE: database,
      },
    });
    process.exitCode = test.status ?? 1;
  } finally {
    if (started) {
      commandResult(path.join(postgresBin, "pg_ctl"), ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}
