#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const fullLocalMode = process.argv.includes("--full-local");

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
        create role authenticator noinherit login;
        grant anon, authenticated to authenticator;
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
        create or replace function auth.role()
        returns text
        language sql
        stable
        as $function$
          select coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
          )
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
        create type public.recipe_source_type
          as enum ('system', 'youtube', 'manual');
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
        create table public.admin_members (
          user_id uuid primary key,
          granted_by uuid
        );
        create table public.admin_audit_logs (
          id uuid primary key default gen_random_uuid(),
          actor_admin_user_id uuid
        );
        grant select, insert, update, delete on public.users to service_role;
        create table public.recipes (
          id uuid primary key default gen_random_uuid(),
          title varchar(200) not null,
          description text,
          thumbnail_url text,
          base_servings integer not null default 2,
          tags text[] not null default '{}'::text[],
          source_type public.recipe_source_type not null,
          created_by uuid,
          view_count integer not null default 0,
          like_count integer not null default 0,
          save_count integer not null default 0,
          plan_count integer not null default 0,
          cook_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table public.recipe_sources (
          id uuid primary key,
          recipe_id uuid not null unique
            references public.recipes(id) on delete cascade,
          youtube_url text,
          youtube_video_id varchar(20),
          extraction_meta_json jsonb not null default '{}'::jsonb
        );
        create table public.recipe_ingredients (
          id uuid primary key,
          recipe_id uuid not null
            references public.recipes(id) on delete cascade,
          ingredient_id uuid not null
        );
        create table public.recipe_steps (
          id uuid primary key,
          recipe_id uuid not null
            references public.recipes(id) on delete cascade,
          step_number integer not null,
          instruction text not null
        );
        create table public.recipe_step_cooking_methods (
          id uuid primary key,
          step_id uuid not null
            references public.recipe_steps(id) on delete cascade,
          method_id uuid not null,
          position integer not null
        );
        create table public.tags (
          id uuid primary key default gen_random_uuid(),
          normalized_key text not null unique,
          label text not null,
          slug text,
          kind text not null,
          is_system boolean not null default false,
          theme_eligible boolean not null default false,
          usage_count integer not null default 0,
          created_by uuid,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table public.recipe_tags (
          recipe_id uuid not null
            references public.recipes(id) on delete cascade,
          tag_id uuid not null
            references public.tags(id) on delete cascade,
          source text not null default 'system_suggested',
          confidence numeric(4, 3) not null default 1,
          visibility text not null default 'public',
          review_status text not null default 'approved',
          sort_order integer not null default 0,
          created_by uuid,
          created_at timestamptz not null default now(),
          primary key (recipe_id, tag_id)
        );
        alter table public.tags enable row level security;
        alter table public.recipe_tags enable row level security;
        create or replace function public.build_recipe_tag_payload(
          p_tags text[],
          p_source text default 'system_suggested'
        )
        returns jsonb
        language sql
        stable
        set search_path = pg_catalog
        as $function$
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'label',
                tag.label,
                'source',
                coalesce(nullif(p_source, ''), 'system_suggested')
              )
              order by tag.ordinality
            ),
            '[]'::jsonb
          )
          from unnest(coalesce(p_tags, '{}'::text[]))
            with ordinality as tag(label, ordinality)
          where btrim(coalesce(tag.label, '')) <> ''
        $function$;
        create or replace function public.set_recipe_tags(
          p_recipe_id uuid,
          p_tags jsonb,
          p_actor_user_id uuid default null,
          p_source text default 'system_suggested'
        )
        returns void
        language plpgsql
        security definer
        set search_path = pg_catalog, public, pg_temp
        as $function$
        begin
          update public.recipes
             set tags = coalesce((
               select array_agg(
                 tag.label order by recipe_tag.sort_order, tag.label
               )
               from public.recipe_tags as recipe_tag
               join public.tags as tag
                 on tag.id = recipe_tag.tag_id
               where recipe_tag.recipe_id = p_recipe_id
             ), '{}'::text[])
           where id = p_recipe_id;
        end;
        $function$;
        revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
          from public, anon, authenticated;
        grant execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
          to service_role;
        grant usage on schema public to anon, authenticated, service_role;
        grant select on table
          public.recipes,
          public.recipe_sources,
          public.recipe_ingredients,
          public.recipe_steps,
          public.recipe_step_cooking_methods,
          public.tags,
          public.recipe_tags
        to anon, authenticated;
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
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-f",
      "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
    ]);
    if (fullLocalMode) {
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260801150000_full_local_account_bootstrap.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260801151000_full_local_request_authority.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260803090000_full_local_session_issue_time_precision.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260803091000_full_local_optional_nbf_authority.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260803092000_recipe_future_internal_scope.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260803093000_full_local_read_only_request_authority.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260809100000_full_local_session_refresh_authority.sql",
      ]);
      runRequired(path.join(postgresBin, "psql"), [
        ...connectionArgs,
        "-f",
        "supabase/migrations/20260809110000_full_local_request_transaction_and_youtube_scope.sql",
      ]);
    }

    const test = commandResult("pnpm", [
      "exec", "vitest", "run",
      fullLocalMode
        ? "tests/full-local-auth-db-foundation-postgres.integration.test.ts"
        : "tests/account-session-generation-postgres.integration.test.ts",
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
        HOMECOOK_FULL_LOCAL_AUTH_DB_PG_INTEGRATION: fullLocalMode ? "1" : "0",
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
