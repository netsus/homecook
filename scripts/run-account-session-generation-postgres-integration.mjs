#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function findPostgresBin() {
  const pgConfig = commandResult("pg_config", ["--bindir"]);
  const candidates = pgConfig.status === 0 ? [pgConfig.stdout.trim()] : [];

  for (const root of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql"]) {
    if (!existsSync(root)) continue;
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
      const formulaRoot = path.join(cellar, formula);
      candidates.push(
        ...readdirSync(formulaRoot)
          .sort((left, right) =>
            right.localeCompare(left, undefined, { numeric: true })
          )
          .map((version) => path.join(formulaRoot, version, "bin")),
      );
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
    throw new Error(
      `Account generation PostgreSQL command failed: ${path.basename(command)}`,
    );
  }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (port === null || port === 5432) {
    throw new Error("Unable to reserve isolated PostgreSQL port");
  }
  return port;
}

const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write(
    "POSTGRES_RUNTIME_UNAVAILABLE: account generation real DB gate cannot be skipped.\n",
  );
  process.exitCode = 1;
} else {
  const root = mkdtempSync(
    path.join(
      existsSync("/tmp") ? "/tmp" : tmpdir(),
      "homecook-account-generation-pg-",
    ),
  );
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_account_generation_test";
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
      "-w", "start",
    ]);
    started = true;
    runRequired(path.join(postgresBin, "createdb"), [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      database,
    ]);

    const connectionArgs = [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      "-d", database,
      "-v", "ON_ERROR_STOP=1",
    ];
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-c", `
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create role supabase_auth_admin nologin;
        create schema auth;
        create schema extensions;
        create extension pgcrypto with schema extensions;
        create table auth.users (
          id uuid primary key,
          created_at timestamptz not null,
          email text,
          raw_app_meta_data jsonb not null default '{}'::jsonb,
          raw_user_meta_data jsonb not null default '{}'::jsonb
        );
        create or replace function auth.uid()
        returns uuid
        language sql
        stable
        as $function$
          select null::uuid
        $function$;
        create schema storage;
        create table storage.objects (
          id uuid primary key default gen_random_uuid(),
          bucket_id text not null,
          name text not null
        );
        alter table storage.objects enable row level security;
        create or replace function storage.foldername(p_name text)
        returns text[]
        language sql
        immutable
        as $function$
          select pg_catalog.string_to_array(p_name, '/')
        $function$;
        create type public.social_provider_type
          as enum ('kakao', 'naver', 'google');
        create table public.users (
          id uuid primary key,
          nickname varchar(30) not null,
          email varchar(255),
          profile_image_url text,
          social_provider public.social_provider_type not null,
          social_id varchar(255) not null,
          settings_json jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          deleted_at timestamptz
        );
        grant select, insert, update, delete on public.users to service_role;
        create table public.account_generation_legacy_delete_fixture (
          owner_uuid uuid primary key,
          fail_cleanup boolean not null default false
        );
        create table public.pantry_items (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null,
          label text not null
        );
        grant select, insert, update, delete on public.pantry_items
          to service_role;
        create or replace function public.delete_user_private_data(p_user_id uuid)
        returns jsonb
        language plpgsql
        security definer
        set search_path = pg_catalog, public, pg_temp
        as $function$
        declare
          v_fail_cleanup boolean;
        begin
          select fixture.fail_cleanup
            into v_fail_cleanup
          from public.account_generation_legacy_delete_fixture as fixture
          where fixture.owner_uuid = p_user_id
          for update;

          if coalesce(v_fail_cleanup, false) then
            raise exception 'forced legacy cleanup failure';
          end if;

          delete from public.account_generation_legacy_delete_fixture
          where owner_uuid = p_user_id;
          delete from public.users where id = p_user_id;

          return jsonb_build_object(
            'deleted', true,
            'user_deleted', found,
            'preserved_recipe_count', 0
          );
        end;
        $function$;
      `,
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-f",
      "supabase/migrations/20260723140000_account_session_generation_foundation.sql",
    ]);

    const test = commandResult("pnpm", [
      "exec", "vitest", "run",
      "tests/account-session-generation-postgres.integration.test.ts",
      "--pool=forks",
      "--maxWorkers=1",
      "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        HOMECOOK_ACCOUNT_GENERATION_PG_INTEGRATION: "1",
        HOMECOOK_ACCOUNT_GENERATION_PGHOST: "127.0.0.1",
        HOMECOOK_ACCOUNT_GENERATION_PGPORT: String(port),
        HOMECOOK_ACCOUNT_GENERATION_PGDATABASE: database,
      },
    });
    process.exitCode = test.status ?? 1;
  } finally {
    if (started) {
      commandResult(path.join(postgresBin, "pg_ctl"), [
        "-D", dataDirectory,
        "-m", "fast",
        "-w", "stop",
      ]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}
