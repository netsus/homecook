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
  "supabase/migrations/20260724250000_recipe_image_auth_deletion_readiness_authority.sql",
  "supabase/migrations/20260724260000_recipe_image_auth_deletion_claim_authority.sql",
  "supabase/migrations/20260724270000_recipe_image_auth_deletion_finalize_authority.sql",
  "supabase/migrations/20260724280000_recipe_image_auth_deletion_candidate_authority.sql",
  "supabase/migrations/20260724290000_recipe_image_lifecycle_completion_authority.sql",
  "supabase/migrations/20260724300000_recipe_image_lifecycle_completion_candidate_authority.sql",
  "supabase/migrations/20260724310000_recipe_image_compact_retention_authority.sql",
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
          personal_db_deleted_at timestamptz,
          auth_identity_deleted_at timestamptz,
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

        create table public.auth_identity_deletion_outbox (
          id uuid primary key default gen_random_uuid(),
          owner_uuid uuid not null,
          account_generation bigint not null,
          auth_identity_created_at_snapshot timestamptz not null,
          state text not null,
          terminal_result text,
          attempts integer not null default 0,
          lease_token uuid,
          lease_expires_at timestamptz,
          next_attempt_at timestamptz not null default now(),
          last_error text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (owner_uuid, account_generation)
        );
        alter table public.auth_identity_deletion_outbox
          enable row level security;
        revoke all on table public.auth_identity_deletion_outbox
          from public, anon, authenticated, service_role;

        create or replace function public.claim_auth_identity_deletion_outbox(
          p_outbox_id uuid,
          p_lease_token uuid,
          p_now timestamp with time zone
        )
        returns jsonb
        language plpgsql
        volatile
        security definer
        set search_path = pg_catalog, public, pg_temp
        as $function$
        declare
          v_outbox public.auth_identity_deletion_outbox%rowtype;
        begin
          if p_outbox_id is null or p_lease_token is null or p_now is null then
            raise exception 'auth deletion claim CAS fields are required'
              using errcode = '22023';
          end if;

          select outbox.*
            into v_outbox
          from public.auth_identity_deletion_outbox as outbox
          where outbox.id = p_outbox_id
          for update;

          if v_outbox.id is null
            or not (
              (
                v_outbox.state in ('pending', 'failed')
                and v_outbox.next_attempt_at <= p_now
              )
              or (
                v_outbox.state = 'processing'
                and v_outbox.lease_expires_at <= p_now
              )
            ) then
            raise exception
              'auth deletion outbox claim compare-and-swap failed'
              using errcode = '40001';
          end if;

          update public.auth_identity_deletion_outbox
          set
            state = 'processing',
            attempts = attempts + 1,
            lease_token = p_lease_token,
            lease_expires_at = p_now + interval '120 seconds',
            updated_at = p_now
          where id = p_outbox_id
          returning * into v_outbox;

          return jsonb_build_object(
            'id', v_outbox.id,
            'owner_uuid', v_outbox.owner_uuid,
            'account_generation', v_outbox.account_generation,
            'auth_identity_created_at_snapshot',
              v_outbox.auth_identity_created_at_snapshot,
            'state', v_outbox.state,
            'attempts', v_outbox.attempts,
            'lease_token', v_outbox.lease_token,
            'lease_expires_at', v_outbox.lease_expires_at
          );
        end;
        $function$;

        create or replace function public.finalize_auth_identity_deletion_outbox(
          p_outbox_id uuid,
          p_lease_token uuid,
          p_expected_attempts integer,
          p_terminal_result text,
          p_error text,
          p_now timestamp with time zone
        )
        returns jsonb
        language plpgsql
        volatile
        security definer
        set search_path = pg_catalog, public, pg_temp
        as $function$
        declare
          v_outbox public.auth_identity_deletion_outbox%rowtype;
          v_next_state text;
        begin
          if p_outbox_id is null
            or p_lease_token is null
            or p_expected_attempts is null
            or p_expected_attempts <= 0
            or p_now is null
            or (
              p_terminal_result is null
              and nullif(p_error, '') is null
            )
            or (
              p_terminal_result is not null
              and p_terminal_result not in (
                'deleted',
                'already_absent',
                'identity_replaced'
              )
            ) then
            raise exception 'auth deletion finalize CAS fields are invalid'
              using errcode = '22023';
          end if;

          select outbox.*
            into v_outbox
          from public.auth_identity_deletion_outbox as outbox
          where outbox.id = p_outbox_id
          for update;

          if v_outbox.id is null
            or v_outbox.state <> 'processing'
            or v_outbox.lease_token is distinct from p_lease_token
            or v_outbox.attempts is distinct from p_expected_attempts
            or v_outbox.lease_expires_at < p_now then
            raise exception
              'auth deletion outbox finalize compare-and-swap failed'
              using errcode = '40001';
          end if;

          v_next_state := case
            when p_terminal_result is not null then 'succeeded'
            when v_outbox.attempts >= 10 then 'dead_letter'
            else 'failed'
          end;

          update public.auth_identity_deletion_outbox
          set
            state = v_next_state,
            terminal_result = p_terminal_result,
            lease_token = null,
            lease_expires_at = null,
            next_attempt_at = case
              when v_next_state = 'failed' then p_now + interval '5 minutes'
              else next_attempt_at
            end,
            last_error = p_error,
            updated_at = p_now
          where id = p_outbox_id
          returning * into v_outbox;

          return jsonb_build_object(
            'id', v_outbox.id,
            'state', v_outbox.state,
            'terminal_result', v_outbox.terminal_result,
            'attempts', v_outbox.attempts,
            'next_attempt_at', v_outbox.next_attempt_at
          );
        end;
        $function$;

        revoke execute
          on function public.claim_auth_identity_deletion_outbox(
            uuid,
            uuid,
            timestamp with time zone
          )
          from public, anon, authenticated, service_role;
        revoke execute
          on function public.finalize_auth_identity_deletion_outbox(
            uuid,
            uuid,
            integer,
            text,
            text,
            timestamp with time zone
          )
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
