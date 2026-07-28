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
    } else candidates.push(root);
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
  process.stderr.write("POSTGRES_RUNTIME_UNAVAILABLE: prepared food catalog real DB gate cannot be skipped.\n");
  process.exitCode = 1;
} else {
  const root = mkdtempSync(path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), "hcn-product-pg-"));
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_product_catalog_test";
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
create schema storage;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table auth.users (
  id uuid primary key,
  created_at timestamptz not null,
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select pg_catalog.string_to_array(p_name, '/')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create type public.social_provider_type as enum ('kakao', 'naver', 'google');
create table public.users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text,
  profile_image_url text,
  social_provider public.social_provider_type not null,
  social_id text not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.ingredients (
  id uuid primary key default gen_random_uuid(), standard_name text not null unique,
  category text not null, default_unit text,
  created_at timestamptz not null default now()
);
create table public.ingredient_synonyms (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  synonym text not null, unique (ingredient_id, synonym)
);
create table public.operational_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  severity text not null default 'info', source text not null, actor_user_id uuid,
  target_user_id uuid,
  message_summary text, metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info', 'warn', 'error', 'critical'))
);
create type public.recipe_source_type as enum ('system', 'youtube', 'manual');
create table public.recipes (
  id uuid primary key default gen_random_uuid(), title text not null,
  description text, thumbnail_url text,
  base_servings integer not null default 2 check (base_servings > 0),
  tags text[] not null default '{}'::text[],
  source_type public.recipe_source_type not null default 'system',
  created_by uuid references public.users(id) on delete set null,
  view_count integer not null default 0,
  save_count integer not null default 0,
  like_count integer not null default 0,
  plan_count integer not null default 0,
  cook_count integer not null default 0,
  created_at timestamptz not null default now(),
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
create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number integer not null,
  instruction text not null
);
create table public.recipe_step_cooking_methods (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.recipe_steps(id) on delete cascade,
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
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  source text not null default 'system_suggested',
  confidence numeric(4, 3) not null default 1,
  visibility text not null default 'public',
  review_status text not null default 'approved',
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (recipe_id, tag_id)
);
create table public.meals (
  id uuid primary key default gen_random_uuid(), recipe_id uuid not null references public.recipes(id)
);
create table public.meal_plan_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.recipe_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.recipe_book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.recipe_books(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade
);
create table public.recipe_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade
);
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
`;
    runRequired(path.join(postgresBin, "psql"), [...args, "-c", bootstrap]);
    runRequired(path.join(postgresBin, "psql"), [...args, "-c", `comment on database ${database} is 'homecook-isolated-product-catalog-v1';`]);
    for (const migration of [
      "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
      "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
      "supabase/migrations/20260716120000_prepared_food_catalog.sql",
      "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
      "supabase/migrations/20260718090000_community_prepared_food_catalog.sql",
      "supabase/migrations/20260718123000_community_prepared_food_catalog_list_perf.sql",
      "supabase/migrations/20260718133000_community_prepared_food_catalog_anonymized_editable_fix.sql",
    ]) runRequired(path.join(postgresBin, "psql"), [...args, "-f", migration]);
    for (const migration of [
      "supabase/migrations/20260723140000_account_session_generation_foundation.sql",
      "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
      "supabase/migrations/20260723180000_recipe_visibility_guard_public_schema_usage.sql",
    ]) {
      runRequired(path.join(postgresBin, "psql"), [
        ...args,
        "--single-transaction",
        "-f",
        migration,
      ]);
    }

    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "-c",
      `
        insert into public.ingredients (standard_name, category, default_unit)
        select
          '검색재료' || lpad(series::text, 6, '0'),
          '격리검색',
          'g'
        from generate_series(1, 10000) as series;
      `,
    ]);

    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "-f",
      "supabase/migrations/20260725120000_prepared_food_search_relevance_foundation.sql",
    ]);
    runRequired("node", [
      "scripts/apply-prepared-food-search-indexes-concurrently.mjs",
      "--apply",
      "--allow-isolated-test",
    ], {
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        PREPARED_FOOD_SEARCH_DATABASE_URL:
          `postgresql://postgres@127.0.0.1:${port}/${database}`,
      },
    });
    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "--single-transaction",
      "-f",
      "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "-c",
      `
        do $$
        begin
          if (
            select count(*)
            from pg_catalog.pg_index index_state
            join pg_catalog.pg_class index_class
              on index_class.oid = index_state.indexrelid
            where index_class.relname = any (array[
              'ingredients_search_prefix_idx',
              'ingredients_search_compact_trgm_idx',
              'ingredients_search_short_ngram_idx',
              'food_products_public_search_prefix_idx',
              'food_products_public_search_compact_trgm_idx',
              'food_products_public_search_short_ngram_idx',
              'food_products_private_search_prefix_idx',
              'food_products_private_search_compact_trgm_idx',
              'food_products_private_search_short_ngram_idx'
            ])
              and index_state.indisready
              and index_state.indisvalid
          ) <> 9 then
            raise exception 'CONCURRENT_PREBUILD_INDEX_COUNT_MISMATCH';
          end if;
        end
        $$;

        drop index
          public.ingredients_search_prefix_idx,
          public.ingredients_search_compact_trgm_idx,
          public.ingredients_search_short_ngram_idx,
          public.food_products_public_search_prefix_idx,
          public.food_products_public_search_compact_trgm_idx,
          public.food_products_public_search_short_ngram_idx,
          public.food_products_private_search_prefix_idx,
          public.food_products_private_search_compact_trgm_idx,
          public.food_products_private_search_short_ngram_idx;
      `,
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "--single-transaction",
      "-f",
      "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...args,
      "--single-transaction",
      "-f",
      "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
    ]);
    for (let replay = 0; replay < 2; replay += 1) {
      runRequired(path.join(postgresBin, "psql"), [
        ...args,
        "--single-transaction",
        "-f",
        "supabase/migrations/20260725140000_prepared_food_search_ranked_rpc.sql",
      ]);
    }
    for (let replay = 0; replay < 2; replay += 1) {
      runRequired(path.join(postgresBin, "psql"), [
        ...args,
        "--single-transaction",
        "-f",
        "supabase/migrations/20260725145000_prepared_food_search_hosted_compatibility.sql",
      ]);
    }
    for (let replay = 0; replay < 2; replay += 1) {
      runRequired(path.join(postgresBin, "psql"), [
        ...args,
        "-f",
        "supabase/migrations/20260725150000_community_food_visibility_lifecycle_guard.sql",
      ]);
    }

    const integrationEnv = {
      ...process.env,
      PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
      HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION: "1",
      HOMECOOK_PRODUCT_CATALOG_PGHOST: "127.0.0.1",
      HOMECOOK_PRODUCT_CATALOG_PGPORT: String(port),
      HOMECOOK_PRODUCT_CATALOG_PGDATABASE: database,
      HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PG_INTEGRATION: "1",
      HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGHOST: "127.0.0.1",
      HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGPORT: String(port),
      HOMECOOK_COMMUNITY_PRODUCT_CATALOG_PGDATABASE: database,
      HOMECOOK_ACCOUNT_VISIBILITY_NEUTRAL_PG_INTEGRATION: "1",
    };
    runRequired("pnpm", [
      "exec", "vitest", "run",
      "tests/account-visibility-neutral-preservation-postgres.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: integrationEnv,
    });
    const test = commandResult("pnpm", [
      "exec", "vitest", "run",
      "tests/prepared-food-catalog-postgres.integration.test.ts",
      "tests/community-prepared-food-catalog-postgres.integration.test.ts",
      "tests/prepared-food-search-indexes-postgres.integration.test.ts",
      "tests/prepared-food-search-relevance-postgres.integration.test.ts",
      "tests/recipe-visibility-quarantine-surfaces-postgres.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: integrationEnv,
    });
    process.exitCode = test.status ?? 1;
  } finally {
    if (started) commandResult(path.join(postgresBin, "pg_ctl"), ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}
