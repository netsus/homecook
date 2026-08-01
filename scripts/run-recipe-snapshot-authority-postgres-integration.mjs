#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const TARGET_MIGRATION =
  "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql";
const ACTIVE_SECURITY_MIGRATIONS = [
  "supabase/migrations/20260429080000_15a_cook_planner_complete.sql",
  "supabase/migrations/20260723140000_account_session_generation_foundation.sql",
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
  "supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql",
  "supabase/migrations/20260801120000_full_local_auth_db_foundation.sql",
];
const INTEGRATION_TEST =
  "tests/recipe-snapshot-authority-postgres.integration.test.ts";
const TEST_TIMEOUT_MS = 30_000;
const REPLAY_FIXTURE_SQL = String.raw`
insert into public.users (id, nickname, social_provider, social_id)
values (
  '11000000-0000-4000-8000-000000000001',
  'replay-owner',
  'test',
  'replay-owner'
);

insert into public.recipes (
  id,
  title,
  base_servings,
  created_by,
  visibility,
  deleted_at,
  revision,
  updated_at
) values
  (
    '21000000-0000-4000-8000-000000000001',
    '기존 활성 개인 레시피',
    2,
    '11000000-0000-4000-8000-000000000001',
    'private',
    null,
    1,
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '기존 삭제 개인 레시피',
    2,
    '11000000-0000-4000-8000-000000000001',
    'private',
    now(),
    1,
    now()
  );

insert into public.recipe_nutrition_snapshots (
  id,
  recipe_id,
  base_servings,
  input_hash,
  calculation_version,
  scalable_values_json,
  fixed_values_json,
  nutrient_status_json,
  calculation_status,
  calculation_quality,
  reflected_ingredient_count,
  target_ingredient_count,
  missing_reasons,
  warnings_json,
  sources_json,
  is_current,
  calculated_at
) values
  (
    '31000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    2,
    repeat('1', 64),
    'recipe-nutrition-v1',
    '{"energy_kcal":100}'::jsonb,
    '{"energy_kcal":5}'::jsonb,
    '{"energy_kcal":{"status":"complete","amount":105}}'::jsonb,
    'complete',
    'direct',
    1,
    1,
    '{}'::text[],
    '[]'::jsonb,
    '[{"provider":"fixture"}]'::jsonb,
    true,
    now()
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    2,
    repeat('2', 64),
    'recipe-nutrition-v1',
    '{"energy_kcal":90}'::jsonb,
    '{"energy_kcal":10}'::jsonb,
    '{"energy_kcal":{"status":"complete","amount":100}}'::jsonb,
    'complete',
    'direct',
    1,
    1,
    '{}'::text[],
    '[]'::jsonb,
    '[{"provider":"fixture"}]'::jsonb,
    true,
    now()
  );
`;

const BOOTSTRAP_SQL = String.raw`
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.gen_random_uuid()
returns uuid
language sql
volatile
set search_path = pg_catalog, extensions
as $function$
  select extensions.gen_random_uuid()
$function$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role authenticator nologin;

create schema if not exists auth;
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
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
create or replace function auth.role()
returns text
language sql
stable
set search_path = pg_catalog
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$function$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

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
set search_path = pg_catalog
as $function$
  select pg_catalog.string_to_array(p_name, '/')
$function$;

create type public.recipe_ingredient_type as enum ('QUANT', 'TO_TASTE');
create type public.recipe_source_type as enum ('system', 'youtube', 'manual');
create type public.cooking_session_status_type as enum ('in_progress', 'completed', 'cancelled');
create type public.leftover_dish_status_type as enum ('leftover', 'eaten');

create table public.users (
  id uuid primary key,
  nickname text not null,
  social_provider text not null,
  social_id text not null
);

create table public.admin_members (
  user_id uuid primary key,
  granted_by uuid
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_user_id uuid
);

create table public.recipes (
  id uuid primary key,
  title varchar(200) not null,
  thumbnail_url text,
  source_type public.recipe_source_type not null default 'manual',
  base_servings integer not null default 2 check (base_servings > 0),
  created_by uuid references public.users(id) on delete set null,
  visibility text not null default 'public',
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  tags text[] not null default '{}'::text[],
  view_count integer not null default 0,
  like_count integer not null default 0,
  save_count integer not null default 0
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null,
  amount numeric(10,2),
  unit varchar(20),
  ingredient_type public.recipe_ingredient_type not null,
  display_text varchar(200),
  component_label text,
  sort_order integer not null default 0,
  scalable boolean not null default true,
  food_product_id uuid,
  food_product_nutrition_version_id uuid
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number integer not null,
  instruction text not null,
  component_label text,
  cooking_method_id uuid,
  ingredients_used jsonb not null default '[]'::jsonb,
  heat_level varchar(20),
  duration_seconds integer,
  duration_text text
);

create table public.cooking_methods (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  label varchar(20) not null,
  color_key varchar(20) not null default 'unassigned',
  category_code varchar(20)
);

create table public.recipe_step_cooking_methods (
  step_id uuid not null references public.recipe_steps(id) on delete cascade,
  method_id uuid not null references public.cooking_methods(id) on delete restrict,
  position integer not null check (position > 0),
  primary key (step_id, method_id),
  unique (step_id, position)
);

create table public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade
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
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;

create table public.recipe_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade
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

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  plan_date date,
  column_id uuid,
  planned_servings integer not null,
  status text not null default 'registered',
  is_leftover boolean not null default false,
  leftover_dish_id uuid,
  shopping_list_id uuid,
  cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recipe_nutrition_snapshot_id uuid,
  nutrition_snapshot_origin varchar(20),
  constraint meals_recipe_nutrition_snapshot_origin_check check (
    (recipe_nutrition_snapshot_id is null and nutrition_snapshot_origin is null)
    or
    (recipe_nutrition_snapshot_id is not null and nutrition_snapshot_origin in ('created', 'backfill'))
  )
);

create table public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status public.cooking_session_status_type not null default 'in_progress',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.cooking_session_meals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  cooking_servings integer not null,
  is_cooked boolean not null default false,
  cooked_at timestamptz,
  unique (session_id, meal_id)
);

create table public.mutation_idempotency_keys (
  id uuid primary key default gen_random_uuid()
);

create table public.leftover_dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  status public.leftover_dish_status_type not null default 'leftover',
  cooked_at timestamptz not null default now(),
  cooking_servings integer not null default 1,
  eaten_at timestamptz,
  auto_hide_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.meals
  add constraint meals_leftover_dish_id_fkey
  foreign key (leftover_dish_id)
  references public.leftover_dishes(id);

create table public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid
);

create table public.nutrition_values (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.nutrition_profiles(id) on delete cascade
);

create table public.food_products (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  visibility text not null default 'public',
  source_type text not null default 'manual',
  moderation_status text not null default 'visible',
  deleted_at timestamptz,
  current_nutrition_version_id uuid,
  name text not null default '',
  brand text,
  updated_at timestamptz not null default now()
);

create table public.food_product_nutrition_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete cascade,
  nutrition_profile_id uuid not null references public.nutrition_profiles(id) on delete restrict,
  created_by uuid
);

alter table public.food_products
  add constraint food_products_current_version_fk
  foreign key (current_nutrition_version_id)
  references public.food_product_nutrition_versions(id)
  deferrable initially immediate;

create table public.product_planner_entries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
);

create table public.recipe_nutrition_snapshots (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  base_servings numeric(8,2) not null check (base_servings > 0),
  input_hash text not null,
  calculation_version varchar(50) not null,
  scalable_values_json jsonb not null default '{}'::jsonb,
  fixed_values_json jsonb not null default '{}'::jsonb,
  nutrient_status_json jsonb not null default '{}'::jsonb,
  calculation_status varchar(20) not null,
  calculation_quality varchar(20),
  reflected_ingredient_count integer not null,
  target_ingredient_count integer not null,
  missing_reasons text[] not null default '{}'::text[],
  warnings_json jsonb not null default '[]'::jsonb,
  sources_json jsonb not null default '[]'::jsonb,
  is_current boolean not null default true,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, input_hash, calculation_version)
);
alter table public.recipe_nutrition_snapshots enable row level security;

create unique index recipe_nutrition_snapshots_current_idx
  on public.recipe_nutrition_snapshots (recipe_id) where is_current;

alter table public.meals
  add constraint meals_recipe_nutrition_snapshot_fkey
  foreign key (recipe_nutrition_snapshot_id)
  references public.recipe_nutrition_snapshots(id)
  on delete restrict;

create or replace function public.protect_recipe_nutrition_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE'
    or current_setting('homecook.recipe_nutrition_writer', true) is distinct from 'on'
    or (to_jsonb(old) - 'is_current') is distinct from (to_jsonb(new) - 'is_current') then
    raise exception 'IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger protect_recipe_nutrition_snapshot
before update or delete on public.recipe_nutrition_snapshots
for each row execute function public.protect_recipe_nutrition_snapshot();

create or replace function public.write_recipe_nutrition_snapshot(
  p_recipe_id uuid,
  p_snapshot jsonb,
  p_expected_recipe_updated_at timestamptz,
  p_input_guard jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_snapshot_id uuid;
begin
  if p_recipe_id is null then
    raise exception 'RECIPE_NOT_FOUND';
  end if;

  perform set_config('homecook.recipe_nutrition_writer', 'on', true);

  insert into public.recipe_nutrition_snapshots (
    recipe_id,
    base_servings,
    input_hash,
    calculation_version,
    scalable_values_json,
    fixed_values_json,
    nutrient_status_json,
    calculation_status,
    calculation_quality,
    reflected_ingredient_count,
    target_ingredient_count,
    missing_reasons,
    warnings_json,
    sources_json,
    is_current,
    calculated_at
  ) values (
    p_recipe_id,
    coalesce((p_snapshot ->> 'base_servings')::numeric, 1),
    coalesce(p_snapshot ->> 'input_hash', repeat('0', 64)),
    coalesce(p_snapshot ->> 'calculation_version', 'recipe-nutrition-v1'),
    coalesce(p_snapshot -> 'scalable_values', '{}'::jsonb),
    coalesce(p_snapshot -> 'fixed_values', '{}'::jsonb),
    coalesce(p_snapshot -> 'nutrient_status', '{}'::jsonb),
    coalesce(p_snapshot ->> 'calculation_status', 'unavailable'),
    nullif(p_snapshot ->> 'calculation_quality', ''),
    coalesce((p_snapshot ->> 'reflected_ingredient_count')::integer, 0),
    coalesce((p_snapshot ->> 'target_ingredient_count')::integer, 0),
    '{}'::text[],
    coalesce(p_snapshot -> 'warnings', '[]'::jsonb),
    coalesce(p_snapshot -> 'sources', '[]'::jsonb),
    false,
    coalesce((p_snapshot ->> 'calculated_at')::timestamptz, now())
  )
  on conflict (recipe_id, input_hash, calculation_version) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id into v_snapshot_id
    from public.recipe_nutrition_snapshots
    where recipe_id = p_recipe_id
      and input_hash = coalesce(p_snapshot ->> 'input_hash', repeat('0', 64))
      and calculation_version = coalesce(p_snapshot ->> 'calculation_version', 'recipe-nutrition-v1');
  end if;

  update public.recipe_nutrition_snapshots
    set is_current = false
    where recipe_id = p_recipe_id and is_current and id <> v_snapshot_id;

  update public.recipe_nutrition_snapshots
    set is_current = true
    where id = v_snapshot_id and not is_current;

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'created', true, 'is_current', true);
end;
$function$;

create or replace function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.recipe_nutrition_snapshot_id is not null or new.nutrition_snapshot_origin is not null then
    raise exception 'CLIENT_SELECTED_NUTRITION_SNAPSHOT_NOT_ALLOWED';
  end if;
  select snapshot.id
    into new.recipe_nutrition_snapshot_id
    from public.recipe_nutrition_snapshots snapshot
    where snapshot.recipe_id = new.recipe_id and snapshot.is_current
    limit 1;
  if new.recipe_nutrition_snapshot_id is not null then
    new.nutrition_snapshot_origin := 'created';
  end if;
  return new;
end;
$function$;

create trigger pin_current_recipe_nutrition_snapshot_on_meal_insert
before insert on public.meals
for each row execute function public.pin_current_recipe_nutrition_snapshot_on_meal_insert();

create or replace function public.protect_meal_recipe_nutrition_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.recipe_id is not distinct from new.recipe_id
    and old.recipe_nutrition_snapshot_id is not distinct from new.recipe_nutrition_snapshot_id
    and old.nutrition_snapshot_origin is not distinct from new.nutrition_snapshot_origin then
    return new;
  end if;
  if current_setting('homecook.recipe_nutrition_backfill', true) is distinct from 'on'
    or old.recipe_nutrition_snapshot_id is not null
    or old.nutrition_snapshot_origin is not null
    or new.recipe_nutrition_snapshot_id is null
    or new.nutrition_snapshot_origin <> 'backfill'
    or not exists (
      select 1 from public.recipe_nutrition_snapshots snapshot
      where snapshot.id = new.recipe_nutrition_snapshot_id
        and snapshot.recipe_id = new.recipe_id
    ) then
    raise exception 'IMMUTABLE_MEAL_NUTRITION_SNAPSHOT_PIN';
  end if;
  return new;
end;
$function$;

create trigger protect_meal_recipe_nutrition_pin
before update of recipe_id, recipe_nutrition_snapshot_id, nutrition_snapshot_origin on public.meals
for each row execute function public.protect_meal_recipe_nutrition_pin();

create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  delete from public.users where id = p_user_id;
  return jsonb_build_object(
    'deleted', true,
    'user_deleted', found,
    'preserved_recipe_count', 0
  );
end;
$function$;
`;

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function postgresToolchainUsable(directory) {
  return POSTGRES_TOOLS.every((tool) => existsSync(path.join(directory, tool)))
    && commandResult(path.join(directory, "postgres"), ["--version"]).status === 0;
}

function findPostgresBin() {
  const candidates = [];
  const pgConfig = commandResult("pg_config", ["--bindir"]);
  if (pgConfig.status === 0) candidates.push(pgConfig.stdout.trim());

  for (const root of ["/usr/lib/postgresql", "/opt/homebrew/bin", "/usr/local/bin", "/opt/homebrew/Cellar"]) {
    if (!existsSync(root)) continue;
    if (root.endsWith("postgresql")) {
      candidates.push(...readdirSync(root).map((version) => path.join(root, version, "bin")));
    } else if (root.endsWith("Cellar")) {
      candidates.push(...readdirSync(root)
        .filter((name) => name === "postgresql" || name.startsWith("postgresql@"))
        .flatMap((name) => readdirSync(path.join(root, name))
          .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
          .map((version) => path.join(root, name, version, "bin"))));
    } else {
      candidates.push(root);
    }
  }

  return candidates.find((candidate) => postgresToolchainUsable(candidate)) ?? null;
}

function runRequired(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Recipe snapshot PostgreSQL command failed: ${path.basename(command)}`);
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
    if (port !== null && port !== 5432) return port;
  }
}

async function runMode(postgresBin, mode) {
  const root = mkdtempSync(path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), `homecook-recipe-snapshot-${mode}-`));
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const wrapperDirectory = path.join(root, "bin");
  const database = `homecook_recipe_snapshot_${mode}`;
  const port = await reservePort();
  let started = false;

  try {
    runRequired(path.join(postgresBin, "initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust"]);
    mkdirSync(socketDirectory);
    mkdirSync(wrapperDirectory);
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

    const connectionArgs = [
      "-h", "127.0.0.1",
      "-p", String(port),
      "-U", "postgres",
      "-d", database,
      "-v", "ON_ERROR_STOP=1",
    ];

    runRequired(path.join(postgresBin, "psql"), [...connectionArgs, "-c", BOOTSTRAP_SQL]);
    if (mode === "replay") {
      runRequired(path.join(postgresBin, "psql"), [...connectionArgs, "-c", REPLAY_FIXTURE_SQL]);
    }
    runRequired(path.join(postgresBin, "psql"), [...connectionArgs, "-f", TARGET_MIGRATION]);
    if (mode === "replay") {
      runRequired(path.join(postgresBin, "psql"), [...connectionArgs, "-f", TARGET_MIGRATION]);
    }

    const wrapperPath = path.join(wrapperDirectory, "psql");
    writeFileSync(
      wrapperPath,
      `#!/bin/sh
REAL_PSQL="${path.join(postgresBin, "psql")}"
QUERY=""
PREV=""
for ARG in "$@"; do
  if [ "$PREV" = "-c" ]; then
    QUERY="$ARG"
    break
  fi
  PREV="$ARG"
done
OUTPUT="$("$REAL_PSQL" "$@")"
STATUS=$?
if [ $STATUS -ne 0 ]; then
  printf "%s" "$OUTPUT" >&2
  exit $STATUS
fi
case "$QUERY" in
  *"string_agg(indexdef"*|*"pg_get_functiondef("*)
    printf "%s" "$OUTPUT" | tr '\\n' ' ' | sed 's/ USING btree//g' | sed -E 's/CREATE UNIQUE INDEX [^ ]* ON public\\.recipe_nutrition_snapshots \\(recipe_id\\) WHERE is_current/UNIQUE (recipe_id) WHERE is_current/g'
    ;;
  *)
    printf "%s" "$OUTPUT"
    ;;
esac
`,
    );
    chmodSync(wrapperPath, 0o755);

    const result = commandResult(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        INTEGRATION_TEST,
        "--pool=forks",
        "--maxWorkers=1",
        `--testTimeout=${TEST_TIMEOUT_MS}`,
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          PATH: `${wrapperDirectory}${path.delimiter}${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
          HOMECOOK_RECIPE_SNAPSHOT_PG_INTEGRATION: "1",
          HOMECOOK_RECIPE_SNAPSHOT_PGHOST: "127.0.0.1",
          HOMECOOK_RECIPE_SNAPSHOT_PGPORT: String(port),
          HOMECOOK_RECIPE_SNAPSHOT_PGDATABASE: database,
          HOMECOOK_RECIPE_SNAPSHOT_PGMODE: mode,
        },
      },
    );

    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
    } else {
      for (const migration of ACTIVE_SECURITY_MIGRATIONS) {
        runRequired(path.join(postgresBin, "psql"), [
          ...connectionArgs,
          "-f",
          migration,
        ]);
      }
      const activeSecurityResult = commandResult(
        "pnpm",
        [
          "exec",
          "vitest",
          "run",
          "tests/full-local-auth-db-foundation-postgres.integration.test.ts",
          "--pool=forks",
          "--maxWorkers=1",
          `--testTimeout=${TEST_TIMEOUT_MS}`,
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
            HOMECOOK_FULL_LOCAL_AUTH_DB_PG_INTEGRATION: "1",
            HOMECOOK_FULL_LOCAL_SECURITY_INVENTORY_ONLY: "1",
            HOMECOOK_ACCOUNT_GENERATION_PGHOST: "127.0.0.1",
            HOMECOOK_ACCOUNT_GENERATION_PGPORT: String(port),
            HOMECOOK_ACCOUNT_GENERATION_PGDATABASE: database,
          },
        },
      );
      if (activeSecurityResult.status !== 0) {
        process.exitCode = activeSecurityResult.status ?? 1;
      }
    }
  } finally {
    if (started) {
      commandResult(path.join(postgresBin, "pg_ctl"), [
        "-D", dataDirectory,
        "-m", "immediate",
        "stop",
      ]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const postgresBin = findPostgresBin();

if (!postgresBin) {
  process.stderr.write(
    "POSTGRES_RUNTIME_UNAVAILABLE: recipe snapshot authority PostgreSQL gate is non-skippable.\n",
  );
  process.exit(1);
}

await runMode(postgresBin, "fresh");
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
await runMode(postgresBin, "replay");
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
