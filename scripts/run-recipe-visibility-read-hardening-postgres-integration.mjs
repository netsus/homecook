#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const MIGRATION_PATHS = [
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
  "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
  "supabase/migrations/20260724110000_recipe_managed_image_registry_foundation.sql",
  "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql",
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
  "supabase/migrations/20260724140000_recipe_image_private_storage_boundary.sql",
  "supabase/migrations/20260724150000_recipe_image_upload_compensation.sql",
  "supabase/migrations/20260724160000_recipe_image_cancel_cas.sql",
  "supabase/migrations/20260724170000_recipe_image_cancel_lifecycle_errors.sql",
  "supabase/migrations/20260724180000_recipe_image_attach_cas.sql",
  "supabase/migrations/20260724190000_recipe_manual_create_image_attach.sql",
  "supabase/migrations/20260724200000_recipe_image_stale_scanner_cas.sql",
  "supabase/migrations/20260724210000_recipe_image_terminal_tombstone_scan.sql",
  "supabase/migrations/20260724220000_recipe_image_quarantine_recheck_authority.sql",
  "supabase/migrations/20260724230000_recipe_image_normal_drain_authority.sql",
  "supabase/migrations/20260724240000_recipe_image_expected_owner_signal_authority.sql",
];

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
      `Recipe visibility PostgreSQL command failed: ${path.basename(command)}`,
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
    "POSTGRES_RUNTIME_UNAVAILABLE: recipe visibility real DB gate cannot be skipped.\n",
  );
  process.exitCode = 1;
} else {
  const root = mkdtempSync(
    path.join(
      existsSync("/tmp") ? "/tmp" : tmpdir(),
      "homecook-recipe-visibility-pg-",
    ),
  );
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_recipe_visibility_test";
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

    const serverArgs = [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
    ];
    runRequired(path.join(postgresBin, "psql"), [
      ...serverArgs,
      "-c", `
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create role migration_runner login nosuperuser nocreatedb createrole
          noinherit noreplication nobypassrls;
      `,
    ]);
    runRequired(path.join(postgresBin, "createdb"), [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      "-O", "migration_runner",
      database,
    ]);

    const runnerArgs = [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "migration_runner",
      "-d", database,
      "-v", "ON_ERROR_STOP=1",
    ];
    runRequired(path.join(postgresBin, "psql"), [
      ...runnerArgs,
      "-c", `
        create schema auth authorization migration_runner;
        create schema extensions authorization migration_runner;
        create schema storage authorization migration_runner;
        create extension pgcrypto with schema extensions;
        create or replace function auth.uid()
        returns uuid
        language sql
        stable
        set search_path = pg_catalog
        as $function$
          select nullif(
            current_setting('request.jwt.claim.sub', true),
            ''
          )::uuid
        $function$;
        grant usage on schema auth to anon, authenticated;
        grant execute on function auth.uid() to anon, authenticated;

        create table storage.buckets (
          id text primary key,
          name text not null,
          public boolean not null default false,
          file_size_limit bigint,
          allowed_mime_types text[]
        );
        create table storage.objects (
          id uuid primary key default gen_random_uuid(),
          bucket_id text not null,
          name text not null,
          owner_id text
        );
        alter table storage.objects enable row level security;
        grant usage on schema storage to anon, authenticated, service_role;
        grant select, insert, update, delete on table storage.objects
          to anon, authenticated, service_role;
        create or replace function storage.foldername(name text)
        returns text[]
        language sql
        immutable
        set search_path = pg_catalog
        as $function$
          select string_to_array(name, '/')
        $function$;
        grant execute on function storage.foldername(text)
          to anon, authenticated, service_role;

        insert into storage.buckets (
          id,
          name,
          public,
          file_size_limit,
          allowed_mime_types
        ) values (
          'recipe-images',
          'recipe-images',
          true,
          5242880,
          array['image/jpeg', 'image/png', 'image/webp']
        );

        create policy recipe_images_public_read
          on storage.objects
          for select
          using (bucket_id = 'recipe-images');
        create policy recipe_images_insert_own
          on storage.objects
          for insert
          to authenticated
          with check (
            bucket_id = 'recipe-images'
            and (storage.foldername(name))[1] = auth.uid()::text
          );
        create policy recipe_images_update_own
          on storage.objects
          for update
          to authenticated
          using (
            bucket_id = 'recipe-images'
            and (storage.foldername(name))[1] = auth.uid()::text
          )
          with check (
            bucket_id = 'recipe-images'
            and (storage.foldername(name))[1] = auth.uid()::text
          );
        create policy recipe_images_delete_own
          on storage.objects
          for delete
          to authenticated
          using (
            bucket_id = 'recipe-images'
            and (storage.foldername(name))[1] = auth.uid()::text
          );

        create type public.recipe_source_type
          as enum ('system', 'youtube', 'manual');

        create table public.user_account_lifecycles (
          owner_uuid uuid not null,
          account_generation bigint not null,
          auth_identity_created_at_snapshot timestamptz,
          status text not null,
          required_cleanup_generation bigint not null default 0,
          completed_cleanup_generation bigint not null default 0,
          revision bigint not null default 1,
          updated_at timestamptz not null default now(),
          primary key (owner_uuid, account_generation)
        );
        alter table public.user_account_lifecycles enable row level security;
        revoke all on table public.user_account_lifecycles
          from public, anon, authenticated, service_role;

        create table public.user_session_generation_bindings (
          session_key_hash text not null,
          hmac_key_version integer not null,
          owner_uuid uuid not null,
          expected_account_generation bigint not null,
          auth_identity_created_at_snapshot timestamptz not null,
          revoked_at timestamptz,
          primary key (hmac_key_version, session_key_hash),
          foreign key (owner_uuid, expected_account_generation)
            references public.user_account_lifecycles (
              owner_uuid,
              account_generation
            )
        );
        alter table public.user_session_generation_bindings
          enable row level security;
        revoke all on table public.user_session_generation_bindings
          from public, anon, authenticated, service_role;

        create table public.account_generation_capability_state (
          singleton boolean primary key default true check (singleton),
          state text not null,
          revision bigint not null,
          current_cutover_attempt_id uuid,
          updated_at timestamptz not null default now()
        );
        insert into public.account_generation_capability_state (
          singleton,
          state,
          revision
        ) values (
          true,
          'legacy',
          1
        );
        alter table public.account_generation_capability_state
          enable row level security;
        revoke all on table public.account_generation_capability_state
          from public, anon, authenticated, service_role;

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
               select array_agg(tag.label order by recipe_tag.sort_order, tag.label)
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
      `,
    ]);

    for (let replay = 0; replay < 2; replay += 1) {
      for (const migrationPath of MIGRATION_PATHS) {
        runRequired(path.join(postgresBin, "psql"), [
          ...runnerArgs,
          "-f", migrationPath,
        ]);
      }
    }

    const test = commandResult("pnpm", [
      "exec", "vitest", "run",
      "tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
      "--pool=forks",
      "--maxWorkers=1",
      "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        HOMECOOK_RECIPE_VISIBILITY_PG_INTEGRATION: "1",
        HOMECOOK_RECIPE_VISIBILITY_PGHOST: "127.0.0.1",
        HOMECOOK_RECIPE_VISIBILITY_PGPORT: String(port),
        HOMECOOK_RECIPE_VISIBILITY_PGDATABASE: database,
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
