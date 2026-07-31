#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const TEST_FILE = "tests/product-ingredient-link-postgres.integration.test.ts";
const TARGET_MIGRATIONS = [
  "supabase/migrations/20260731110000_product_ingredient_link_contract_runtime.sql",
  "supabase/migrations/20260731111000_product_ingredient_link_account_cleanup.sql",
];
const PRE_TARGET_MIGRATIONS = [
  "supabase/migrations/20260301000000_core_schema_bootstrap.sql",
  "supabase/migrations/20260425000000_08b_add_pantry_items_table.sql",
  "supabase/migrations/20260426090000_09_shopping_tables.sql",
  "supabase/migrations/20260610170000_recipe_book_cover_metadata.sql",
  "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
  "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
  "supabase/migrations/20260716120000_prepared_food_catalog.sql",
  "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
  "supabase/migrations/20260718090000_community_prepared_food_catalog.sql",
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql",
];
const REPLAY_SEED_NAME = "product-link:replay-seed";
const VITEST_BIN = path.join(process.cwd(), "node_modules/.bin/vitest");

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function required(commandName, args, options = {}) {
  const result = command(commandName, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(
      `PostgreSQL integration command failed: ${path.basename(commandName)}`,
    );
  }
}

function findPostgresBin() {
  const candidates = [];

  for (const root of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql"]) {
    if (!existsSync(root)) {
      continue;
    }
    if (root.endsWith("postgresql")) {
      candidates.push(
        ...readdirSync(root).map((version) => path.join(root, version, "bin")),
      );
    } else {
      candidates.push(root);
    }
  }

  const cellar = "/opt/homebrew/Cellar";
  if (existsSync(cellar)) {
    for (const formula of readdirSync(cellar).filter((name) =>
      name.startsWith("postgresql")
    )) {
      const root = path.join(cellar, formula);
      candidates.push(
        ...readdirSync(root)
          .sort((left, right) =>
            right.localeCompare(left, undefined, { numeric: true })
          )
          .map((version) => path.join(root, version, "bin")),
      );
    }
  }

  const pgConfig = command("pg_config", ["--bindir"]);
  if (pgConfig.status === 0) {
    candidates.push(pgConfig.stdout.trim());
  }

  return candidates.find((directory) =>
    TOOLS.every((tool) => existsSync(path.join(directory, tool)))
    && command(path.join(directory, "postgres"), ["--version"]).status === 0
  ) ?? null;
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
    if (port !== null && port !== 5432) {
      return port;
    }
  }
}

const BOOTSTRAP_SQL = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role public_probe nologin;
create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role, public_probe;
create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  source text not null,
  actor_user_id uuid,
  request_path text,
  message_summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info', 'warn', 'error', 'critical'))
);
`;

const ACCOUNT_CLEANUP_COMPAT_SQL = `
create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object('deleted', true, 'user_id', p_user_id)
$$;
revoke all on function public.delete_user_private_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_user_private_data(uuid)
  to service_role;
`;

function replaySeedSql() {
  return `
    insert into public.users (id, nickname, social_provider, social_id)
    values (
      '15000000-0000-4000-8000-000000000001',
      'replay-seed-owner',
      'google',
      'replay-seed-owner'
    );

    ${[
    "set role service_role",
    "set request.jwt.claim.role = 'service_role'",
    `select public.create_manual_food_product(
         '15000000-0000-4000-8000-000000000001',
         '${REPLAY_SEED_NAME}',
         'replay-seed-brand',
         '{"basis":{"amount":100,"unit":"g"},"values":{"energy_kcal":111,"carbohydrate_g":12,"protein_g":7,"fat_g":2,"sodium_mg":33}}'::jsonb
       )`,
  ].join("; ")};
  `;
}

async function runMode(postgresBin, mode) {
  process.stdout.write(`[product-link-pg] start mode=${mode}\n`);
  const root = mkdtempSync(
    path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), `hcn-product-link-${mode}-`),
  );
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const database = `homecook_product_link_${mode}`;
  const port = await reservePort();
  const args = [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ];
  let started = false;

  try {
    required(path.join(postgresBin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust"]);
    mkdirSync(socket);
    required(path.join(postgresBin, "pg_ctl"), [
      "-D",
      data,
      "-o",
      `-p ${port} -h 127.0.0.1 -k ${socket}`,
      "-l",
      path.join(root, "postgres.log"),
      "-w",
      "start",
    ]);
    started = true;

    required(path.join(postgresBin, "createdb"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "postgres",
      database,
    ]);
    required(path.join(postgresBin, "psql"), [...args, "-c", BOOTSTRAP_SQL]);
    process.stdout.write(`[product-link-pg] bootstrapped mode=${mode}\n`);

    for (const migration of PRE_TARGET_MIGRATIONS) {
      required(path.join(postgresBin, "psql"), [...args, "-f", migration]);
      process.stdout.write(`[product-link-pg] applied ${migration} mode=${mode}\n`);
    }

    required(
      path.join(postgresBin, "psql"),
      [...args, "-c", ACCOUNT_CLEANUP_COMPAT_SQL],
    );

    if (mode === "replay") {
      required(path.join(postgresBin, "psql"), [...args, "-c", replaySeedSql()]);
      process.stdout.write(`[product-link-pg] replay seed inserted mode=${mode}\n`);
    }

    for (const migration of TARGET_MIGRATIONS) {
      required(path.join(postgresBin, "psql"), [...args, "-f", migration]);
      process.stdout.write(
        `[product-link-pg] applied ${migration} mode=${mode}\n`,
      );
    }

    const test = command(
      VITEST_BIN,
      [
        "run",
        TEST_FILE,
        "--pool=forks",
        "--maxWorkers=1",
        "--testTimeout=30000",
      ],
      {
        env: {
          ...process.env,
          PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
          HOMECOOK_PRODUCT_LINK_PGHOST: "127.0.0.1",
          HOMECOOK_PRODUCT_LINK_PGPORT: String(port),
          HOMECOOK_PRODUCT_LINK_PGDATABASE: database,
          HOMECOOK_PRODUCT_LINK_PG_INTEGRATION: "1",
          HOMECOOK_PRODUCT_LINK_PGMODE: mode,
          HOMECOOK_PRODUCT_LINK_REPLAY_SEED_NAME: REPLAY_SEED_NAME,
        },
      },
    );
    process.stdout.write(
      `[product-link-pg] vitest status=${test.status ?? "null"} error=${test.error?.code ?? "none"} mode=${mode}\n`,
    );
    process.stdout.write(test.stdout ?? "");
    process.stderr.write(test.stderr ?? "");
    if ((test.status ?? 1) !== 0) {
      process.exitCode = test.status ?? 1;
      return false;
    }
    return true;
  } finally {
    if (started) {
      command(path.join(postgresBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write(
    "POSTGRES_RUNTIME_UNAVAILABLE: product ingredient link real DB gate cannot be skipped.\n",
  );
  process.exitCode = 1;
} else {
  const fresh = await runMode(postgresBin, "fresh");
  if (fresh) {
    const replay = await runMode(postgresBin, "replay");
    process.exitCode = replay ? 0 : 1;
  } else {
    process.exitCode = 1;
  }
}
