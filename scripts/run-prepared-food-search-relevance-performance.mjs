#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import {
  cpus,
  platform,
  release,
  tmpdir,
  totalmem,
} from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const REQUIRED_DENOMINATOR = 287_041;
const debugDenominator = Number(
  process.env.HOMECOOK_SEARCH_PERF_DEBUG_DENOMINATOR
    ?? REQUIRED_DENOMINATOR,
);
if (
  !Number.isInteger(debugDenominator)
  || debugDenominator < 30
) {
  throw new Error("invalid isolated debug denominator");
}
const DENOMINATOR = debugDenominator;
const ACTOR_ID = "32000000-0000-4000-8000-000000000001";
const OTHER_ACTOR_ID = "32000000-0000-4000-8000-000000000002";
const SOURCE_ID = "32000000-0000-4000-8000-000000000003";
const FIXTURE_PATH =
  "tests/fixtures/prepared-food-search-relevance-labels.json";
const EVIDENCE_DIRECTORY =
  ".artifacts/prepared-food-search-relevance";
const EVIDENCE_PATH =
  `${EVIDENCE_DIRECTORY}/performance-summary.json`;
const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const MIGRATIONS = [
  "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
  "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
  "supabase/migrations/20260716120000_prepared_food_catalog.sql",
  "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
  "supabase/migrations/20260718090000_community_prepared_food_catalog.sql",
  "supabase/migrations/20260718123000_community_prepared_food_catalog_list_perf.sql",
  "supabase/migrations/20260718133000_community_prepared_food_catalog_anonymized_editable_fix.sql",
  "supabase/migrations/20260725120000_prepared_food_search_relevance_foundation.sql",
];

const PUBLIC_TARGETS = [
  ["연세우유", "생크림빵"],
  ["연세", "크림빵"],
  ["연세베이커리", "우유크림빵"],
  ["서울우유", "담백빵"],
  ["서울", "우유빵"],
  ["서울베이커리", "우유식빵"],
  ["제주다원", "말차케이크"],
  ["제주", "말차케이크"],
  ["제주디저트", "진한말차케이크"],
  ["부산수산", "모둠어묵탕"],
  ["부산", "어묵탕"],
  ["부산바다", "진한어묵탕"],
  ["전주식품", "매콤비빔소스"],
  ["전주", "비빔소스"],
  ["전주맛집", "고추장비빔소스"],
  ["강원농원", "담백감자빵"],
  ["강원", "감자빵"],
  ["강원베이커리", "치즈감자빵"],
  ["담양식품", "숯불떡갈비"],
  ["담양", "떡갈비"],
  ["담양한상", "한우떡갈비"],
  ["통영바다", "시원굴국밥"],
  ["통영", "굴국밥"],
  ["통영수산", "진한굴국밥"],
  ["나주농원", "맑은배주스"],
  ["나주", "배주스"],
  ["나주과원", "착즙배주스"],
  ["안동식품", "달콤찜닭소스"],
  ["안동", "찜닭소스"],
  ["안동한상", "간장찜닭소스"],
];

const MANUAL_TARGETS = [
  ["연세", "크림빵"],
  ["서울", "우유빵"],
  ["제주", "말차케이크"],
  ["부산", "어묵탕"],
  ["전주", "비빔소스"],
  ["강원", "감자빵"],
  ["담양", "떡갈비"],
  ["통영", "굴국밥"],
  ["나주", "배주스"],
  ["안동", "찜닭소스"],
];

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function runRequired(command, args, options = {}) {
  const result = commandResult(command, args, options);
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`required command failed: ${path.basename(command)}`);
  }
  return result.stdout ?? "";
}

function findPostgresBin() {
  const pgConfig = commandResult("pg_config", ["--bindir"]);
  const candidates = pgConfig.status === 0 ? [pgConfig.stdout.trim()] : [];
  for (const root of [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/lib/postgresql",
  ]) {
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
    POSTGRES_TOOLS.every((tool) =>
      existsSync(path.join(directory, tool))
    )
      && commandResult(
        path.join(directory, "postgres"),
        ["--version"],
      ).status === 0
  ) ?? null;
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
    throw new Error("unable to reserve isolated port");
  }
  return port;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(secret, payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function buildBootstrapSql() {
  return `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
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
  default_unit text,
  created_at timestamptz not null default now()
);
create table public.ingredient_synonyms (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id)
    on delete cascade,
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
  created_by uuid references public.users(id) on delete set null,
  save_count integer not null default 0,
  like_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create type public.recipe_ingredient_type as enum ('QUANT', 'TO_TASTE');
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  amount numeric(10,2),
  unit varchar(20),
  ingredient_type public.recipe_ingredient_type not null,
  sort_order integer not null default 0,
  scalable boolean not null default true,
  check (
    (ingredient_type='QUANT' and amount is not null and amount>0
      and unit is not null)
    or
    (ingredient_type='TO_TASTE' and amount is null and unit is null
      and not scalable)
  )
);
create table public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes(id)
    on delete cascade,
  extraction_meta_json jsonb not null default '{}'::jsonb
);
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id)
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
`;
}

function buildPublicSeedSql() {
  const targetValues = PUBLIC_TARGETS.map(
    ([brand, name], index) =>
      `(${index + 1}, ${sqlText(brand)}, ${sqlText(name)})`,
  ).join(",\n");
  return `
set synchronous_commit = off;
set maintenance_work_mem = '1GB';
insert into public.users (
  id, nickname, social_provider, social_id
) values
  ('${ACTOR_ID}', 'search-perf-a', 'google', 'search-perf-a'),
  ('${OTHER_ACTOR_ID}', 'search-perf-b', 'google', 'search-perf-b');
insert into public.nutrition_sources (
  id, provider_code, dataset_name, source_kind, source_version,
  fetched_at, freshness_checked_at, freshness_status, priority_rank,
  source_url, license_name, manifest_sha256, review_status,
  decision_reason, reviewed_by, reviewed_at, is_active
) values (
  '${SOURCE_ID}', 'FIXTURE', 'isolated-search-performance',
  'nutrition_dataset', 'v1', now(), now(), 'current', 1,
  'https://example.test/isolated-search-performance',
  'isolated-test-only', repeat('a', 64), 'approved',
  'isolated performance fixture', '${ACTOR_ID}', now(), true
);
insert into public.nutrition_source_items (
  id, source_id, external_item_key, external_name, source_basis_text,
  source_basis_amount, source_basis_unit, stable_fingerprint,
  review_status, decision_reason, reviewed_by, reviewed_at, provenance_json
)
select
  md5('source-item-' || series)::uuid,
  '${SOURCE_ID}',
  'perf-' || lpad(series::text, 6, '0'),
  '격리 성능 제품 ' || lpad(series::text, 6, '0'),
  '100 g',
  100,
  'g',
  md5('fingerprint-' || series),
  'approved',
  'isolated performance fixture',
  '${ACTOR_ID}',
  now(),
  '{}'::jsonb
from generate_series(1, ${DENOMINATOR}) series;
insert into public.nutrition_profiles (
  id, source_item_id, profile_kind, normalization_method,
  basis_amount, basis_unit, version, review_status, decision_reason,
  reviewed_by, reviewed_at, is_active
)
select
  md5('profile-' || series)::uuid,
  md5('source-item-' || series)::uuid,
  'product_label',
  'as_labeled',
  100,
  'g',
  1,
  'approved',
  'isolated performance fixture',
  '${ACTOR_ID}',
  now(),
  true
from generate_series(1, ${DENOMINATOR}) series;
begin;
set constraints all deferred;
with targets(series, brand, name) as (values
${targetValues}
)
insert into public.food_products (
  id, owner_user_id, visibility, source_type, name, brand,
  external_product_key, current_nutrition_version_id, created_at
)
select
  md5('product-' || series)::uuid,
  null,
  'public',
  'public_dataset',
  coalesce(target.name, '무관 성능제품 ' || lpad(series::text, 6, '0')),
  coalesce(target.brand, '성능제조사 ' || lpad((series % 100)::text, 2, '0')),
  'perf-' || lpad(series::text, 6, '0'),
  md5('version-' || series)::uuid,
  timestamptz '2026-07-25T00:00:00Z'
    - ((series - 1) * interval '1 microsecond')
from generate_series(1, ${DENOMINATOR}) series
left join targets target using (series);
insert into public.food_product_nutrition_versions (
  id, product_id, nutrition_profile_id, version,
  label_basis_text, basis_relations_json, source_item_id
)
select
  md5('version-' || series)::uuid,
  md5('product-' || series)::uuid,
  md5('profile-' || series)::uuid,
  1,
  '100g',
  '[]'::jsonb,
  md5('source-item-' || series)::uuid
from generate_series(1, ${DENOMINATOR}) series;
insert into public.nutrition_values (
  profile_id, nutrient_code, source_nutrient_code, source_unit,
  amount, value_status, source_token
)
select
  md5('profile-' || series)::uuid,
  nutrient.code,
  nutrient.code,
  nutrient.unit,
  nutrient.amount,
  'observed',
  nutrient.amount::text
from generate_series(1, ${DENOMINATOR}) series
cross join lateral (values
  ('energy_kcal', 'kcal', (50 + series % 400)::numeric),
  ('carbohydrate_g', 'g', (1 + series % 70)::numeric),
  ('protein_g', 'g', (1 + series % 30)::numeric),
  ('fat_g', 'g', (1 + series % 20)::numeric),
  ('sodium_mg', 'mg', (1 + series % 500)::numeric)
) nutrient(code, unit, amount);
commit;
insert into public.ingredients (standard_name, category, default_unit)
select
  '검색재료' || lpad(series::text, 6, '0'),
  '격리검색',
  'g'
from generate_series(1, 10000) series;
`;
}

function buildManualSeedSql() {
  const rows = MANUAL_TARGETS.map(
    ([region, product], index) =>
      `(${index + 1}, ${sqlText(region)}, ${sqlText(product)})`,
  ).join(",\n");
  return `
begin;
set constraints all deferred;
with targets(series, region, product_name) as (values
${rows}
), variants as (
  select
    targets.*,
    visibility,
    owner_user_id,
    brand,
    product_name as name,
    kind
  from targets
  cross join lateral (values
    (
      'public'::text,
      '${ACTOR_ID}'::uuid,
      targets.region || '커뮤니티',
      'community'
    ),
    (
      'private'::text,
      '${ACTOR_ID}'::uuid,
      '나만의',
      'mine'
    )
  ) variant(visibility, owner_user_id, brand, kind)
)
insert into public.food_products (
  id, owner_user_id, visibility, source_type, moderation_status,
  name, brand, current_nutrition_version_id, created_at
)
select
  md5(kind || '-product-' || series)::uuid,
  owner_user_id,
  visibility,
  'manual',
  'visible',
  case when kind = 'mine' then region || ' ' || name else name end,
  brand,
  md5(kind || '-version-' || series)::uuid,
  timestamptz '2026-07-25T01:00:00Z'
    - (series * interval '1 microsecond')
from variants;
with targets(series, region, product_name) as (values
${rows}
), kinds as (
  select targets.series, kind
  from targets
  cross join (values ('community'), ('mine')) variant(kind)
)
insert into public.nutrition_profiles (
  id, profile_kind, normalization_method, basis_amount, basis_unit,
  version, review_status, is_active, created_by
)
select
  md5(kind || '-profile-' || series)::uuid,
  'product_label',
  'as_labeled',
  100,
  'g',
  1,
  'self_reported',
  true,
  '${ACTOR_ID}'
from kinds;
with targets(series, region, product_name) as (values
${rows}
), kinds as (
  select targets.series, kind
  from targets
  cross join (values ('community'), ('mine')) variant(kind)
)
insert into public.food_product_nutrition_versions (
  id, product_id, nutrition_profile_id, version,
  label_basis_text, basis_relations_json, created_by
)
select
  md5(kind || '-version-' || series)::uuid,
  md5(kind || '-product-' || series)::uuid,
  md5(kind || '-profile-' || series)::uuid,
  1,
  '100g',
  '[]'::jsonb,
  '${ACTOR_ID}'
from kinds;
with targets(series, region, product_name) as (values
${rows}
), kinds as (
  select targets.series, kind
  from targets
  cross join (values ('community'), ('mine')) variant(kind)
)
insert into public.nutrition_values (
  profile_id, nutrient_code, amount, value_status
)
select
  md5(kind || '-profile-' || series)::uuid,
  nutrient.code,
  nutrient.amount,
  'observed'
from kinds
cross join (values
  ('energy_kcal', 100::numeric),
  ('carbohydrate_g', 10::numeric),
  ('protein_g', 3::numeric),
  ('fat_g', 4::numeric),
  ('sodium_mg', 50::numeric)
) nutrient(code, amount);
commit;
analyze public.food_products;
analyze public.ingredients;
`;
}

function buildSearchSql(entry) {
  const source = entry.source === null ? "null" : sqlText(entry.source);
  const types = `array[${entry.types.map(sqlText).join(",")}]`;
  return `
set role service_role;
set request.jwt.claim.role = 'service_role';
select public.search_food_catalog_ranked(
  '${ACTOR_ID}',
  ${sqlText(entry.q)},
  ${types},
  ${source},
  null,
  null,
  '${"a".repeat(64)}',
  20
)::text;
`;
}

function readLastLine(value) {
  return value.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

async function waitForPostgrest(url, token) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.ok) return;
    } catch {
      // The isolated container is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("isolated PostgREST did not become ready");
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write(
    "POSTGRES_RUNTIME_UNAVAILABLE: relevance performance gate cannot run.\n",
  );
  process.exitCode = 1;
} else {
  const root = mkdtempSync(
    path.join(
      existsSync("/tmp") ? "/tmp" : tmpdir(),
      "homecook-isolated-prepared-food-search-performance-",
    ),
  );
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_prepared_food_search_performance";
  const pgPort = await reservePort();
  const postgrestPort = await reservePort();
  const containerName =
    `homecook-search-perf-${process.pid}-${Date.now()}`;
  let postgresStarted = false;
  let postgrestStarted = false;

  try {
    runRequired(path.join(postgresBin, "initdb"), [
      "-D",
      dataDirectory,
      "-U",
      "postgres",
      "-A",
      "trust",
    ]);
    mkdirSync(socketDirectory);
    runRequired(path.join(postgresBin, "pg_ctl"), [
      "-D",
      dataDirectory,
      "-o",
      `-p ${pgPort} -h 0.0.0.0 -k ${socketDirectory}`,
      "-l",
      path.join(root, "postgres.log"),
      "-w",
      "start",
    ]);
    postgresStarted = true;
    runRequired(path.join(postgresBin, "createdb"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(pgPort),
      "-U",
      "postgres",
      database,
    ]);
    const psqlArgs = [
      "-h",
      "127.0.0.1",
      "-p",
      String(pgPort),
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ];
    const psql = (sql) =>
      runRequired(path.join(postgresBin, "psql"), [
        ...psqlArgs,
        "-c",
        sql,
      ]);

    psql(buildBootstrapSql());
    psql(
      `comment on database ${database} is `
        + "'homecook-isolated-prepared-food-search-performance';",
    );
    for (const migration of MIGRATIONS) {
      runRequired(path.join(postgresBin, "psql"), [
        ...psqlArgs,
        "-f",
        migration,
      ]);
    }

    psql(buildPublicSeedSql());
    psql(buildManualSeedSql());
    runRequired(path.join(postgresBin, "psql"), [
      ...psqlArgs,
      "-f",
      "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...psqlArgs,
      "-f",
      "supabase/migrations/20260725140000_prepared_food_search_ranked_rpc.sql",
    ]);
    psql("analyze public.food_products; analyze public.ingredients;");

    const denominator = JSON.parse(readLastLine(psql(`
      select json_build_object(
        'visible_public',
          count(*) filter (
            where visibility = 'public'
              and source_type = 'public_dataset'
              and moderation_status = 'visible'
              and deleted_at is null
          ),
        'duplicate_external_keys',
          (
            select count(*)
            from (
              select external_product_key
              from public.food_products
              where source_type = 'public_dataset'
              group by external_product_key
              having count(*) > 1
            ) duplicate_groups
          ),
        'missing_current_version',
          count(*) filter (
            where visibility = 'public'
              and source_type = 'public_dataset'
              and current_nutrition_version_id is null
          )
      )
      from public.food_products;
    `)));
    if (
      denominator.visible_public !== DENOMINATOR
      || denominator.duplicate_external_keys !== 0
      || denominator.missing_current_version !== 0
    ) {
      throw new Error(`denominator mismatch: ${JSON.stringify(denominator)}`);
    }

    const representative = fixture.cases.find(
      (entry) => entry.id === "ys-compact",
    );
    const coldDbStartedAt = performance.now();
    psql(buildSearchSql(representative));
    const coldDbMs = performance.now() - coldDbStartedAt;

    let expectedTotal = 0;
    let relevantReturned = 0;
    let returnedTotal = 0;
    const caseResults = [];
    for (const entry of fixture.cases) {
      const payload = JSON.parse(readLastLine(psql(buildSearchSql(entry))));
      const labels = payload.items.map((item) =>
        item.type === "ingredient"
          ? item.standard_name
          : `${item.brand ?? ""} ${item.name ?? ""}`.trim()
      );
      const expected = new Set(entry.expected_labels);
      const matched = labels.filter((label) => expected.has(label));
      const excluded = labels.filter((label) =>
        entry.excluded_labels.includes(label)
      );
      expectedTotal += expected.size;
      relevantReturned += matched.length;
      returnedTotal += labels.length;
      caseResults.push({
        id: entry.id,
        returned: labels.length,
        matched: matched.length,
        expected: expected.size,
        excluded: excluded.length,
        labels,
      });
      if (excluded.length > 0) {
        throw new Error(`excluded label returned for ${entry.id}`);
      }
    }
    const recallAt20 = relevantReturned / expectedTotal;
    const precisionAt20 = relevantReturned / returnedTotal;
    if (recallAt20 < 0.9 || precisionAt20 < 0.75) {
      throw new Error(
        `quality gate failed: Recall@20=${recallAt20}, `
          + `Precision@20=${precisionAt20}; `
          + JSON.stringify(
            caseResults.filter((entry) => entry.returned > entry.matched),
          ),
      );
    }

    for (let warmup = 0; warmup < 5; warmup += 1) {
      psql(buildSearchSql(representative));
    }
    const dbDurations = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const startedAt = performance.now();
      psql(buildSearchSql(representative));
      dbDurations.push(performance.now() - startedAt);
    }
    const dbP95 = percentile95(dbDurations);
    if (dbP95 > 300) {
      throw new Error(`DB p95 gate failed: ${dbP95.toFixed(2)}ms`);
    }

    const explainCases = [
      {
        id: "source-public",
        sql: `
          select id from public.food_products
          where visibility = 'public'
            and moderation_status = 'visible'
            and deleted_at is null
            and public.normalize_food_search_text(
              coalesce(brand::text || ' ', '') || name::text,
              true
            ) % '연세크림빵'
          limit 400
        `,
        indexes: ["food_products_public_search_compact_trgm_idx"],
      },
      {
        id: "source-community",
        sql: `
          select id from public.food_products
          where visibility = 'public'
            and source_type = 'manual'
            and moderation_status = 'visible'
            and deleted_at is null
            and public.normalize_food_search_text(
              coalesce(brand::text || ' ', '') || name::text,
              true
            ) % '연세커뮤니티크림빵'
          limit 400
        `,
        indexes: [
          "food_products_public_search_compact_trgm_idx",
          "food_products_shared_catalog_order_idx",
        ],
      },
      {
        id: "spaced-compound",
        sql: `
          select id from public.food_products
          where visibility = 'public'
            and moderation_status = 'visible'
            and deleted_at is null
            and public.normalize_food_search_text(
              coalesce(brand::text || ' ', '') || name::text,
              true
            ) % '제주말차케이크'
          limit 400
        `,
        indexes: ["food_products_public_search_compact_trgm_idx"],
      },
      {
        id: "short-query",
        sql: `
          select id from public.food_products
          where visibility = 'public'
            and moderation_status = 'visible'
            and deleted_at is null
            and public.food_search_short_ngrams(
              coalesce(brand::text || ' ', '') || name::text
            ) @> array['빵']::text[]
          limit 400
        `,
        indexes: ["food_products_public_search_short_ngram_idx"],
      },
      {
        id: "ingredient-prefix",
        sql: `
          select id from public.ingredients
          where public.normalize_food_search_text(
            standard_name::text,
            false
          ) like '검색재료0001%'
          limit 400
        `,
        indexes: ["ingredients_search_prefix_idx"],
      },
      {
        id: "source-mine-owner-private",
        sql: `
          select id from public.food_products
          where visibility = 'private'
            and owner_user_id = '${ACTOR_ID}'
            and moderation_status = 'visible'
            and deleted_at is null
            and public.normalize_food_search_text(
              coalesce(brand::text || ' ', '') || name::text,
              true
            ) % '나만의안동'
          limit 400
        `,
        indexes: [
          "food_products_private_search_prefix_idx",
          "food_products_private_search_compact_trgm_idx",
          "food_products_owner_catalog_order_idx",
        ],
      },
    ];
    const explainResults = explainCases.map((entry) => {
      const plan = psql(
        `set enable_seqscan = off; `
          + `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${entry.sql};`,
      );
      const matchedIndex =
        entry.indexes.find((index) => plan.includes(index))
        ?? (
          DENOMINATOR === REQUIRED_DENOMINATOR
            ? null
            : "debug-small-denominator-plan"
        );
      if (!matchedIndex) {
        throw new Error(`indexed plan missing for ${entry.id}: ${plan}`);
      }
      return { id: entry.id, index: matchedIndex };
    });
    const legacyExplain = psql(`
      set role service_role;
      set request.jwt.claim.role = 'service_role';
      EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
      select public.list_food_products(
        '${ACTOR_ID}', '연세', 'all', null, null, 20
      );
      EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
      select public.list_food_products(
        '${ACTOR_ID}', '연세', 'manual', null, null, 20
      );
    `);
    if (!legacyExplain.includes("Execution Time")) {
      throw new Error("legacy all/manual EXPLAIN evidence is missing");
    }

    const jwtSecret = randomBytes(32).toString("hex");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const serviceToken = signJwt(jwtSecret, {
      role: "service_role",
      sub: ACTOR_ID,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    });
    const docker = commandResult("docker", [
      "run",
      "--rm",
      "-d",
      "--name",
      containerName,
      "--add-host",
      "host.docker.internal:host-gateway",
      "-p",
      `${postgrestPort}:3000`,
      "-e",
      `PGRST_DB_URI=postgresql://authenticator@host.docker.internal:${pgPort}/${database}`,
      "-e",
      "PGRST_DB_SCHEMAS=public",
      "-e",
      "PGRST_DB_ANON_ROLE=anon",
      "-e",
      `PGRST_JWT_SECRET=${jwtSecret}`,
      "public.ecr.aws/supabase/postgrest:v14.14",
    ]);
    if (docker.status !== 0) {
      throw new Error(`isolated PostgREST failed: ${docker.stderr}`);
    }
    postgrestStarted = true;
    const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;
    await waitForPostgrest(postgrestUrl, serviceToken);

    const routeTest = commandResult(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "tests/prepared-food-search-route-performance.integration.test.ts",
        "--pool=forks",
        "--maxWorkers=1",
        "--testTimeout=120000",
        "--reporter=verbose",
      ],
      {
        env: {
          ...process.env,
          HOMECOOK_PREPARED_FOOD_SEARCH_ROUTE_PERFORMANCE: "1",
          HOMECOOK_PREPARED_FOOD_SEARCH_POSTGREST_URL: postgrestUrl,
          HOMECOOK_PREPARED_FOOD_SEARCH_SERVICE_TOKEN: serviceToken,
          HOMECOOK_PREPARED_FOOD_SEARCH_ACTOR_ID: ACTOR_ID,
        },
      },
    );
    process.stdout.write(routeTest.stdout ?? "");
    process.stderr.write(routeTest.stderr ?? "");
    if (routeTest.status !== 0) {
      throw new Error("route p95 gate failed");
    }
    const routeMatch = (routeTest.stdout ?? "").match(
      /prepared-food-search route cold=([0-9.]+)ms p95=([0-9.]+)ms/,
    );
    const coldRouteMs = Number(routeMatch?.[1]);
    const routeP95 = Number(routeMatch?.[2]);
    if (
      !Number.isFinite(coldRouteMs)
      || !Number.isFinite(routeP95)
      || routeP95 > 600
    ) {
      throw new Error(`route p95 gate failed: ${routeP95}`);
    }

    const postgresVersion = readLastLine(
      runRequired(path.join(postgresBin, "postgres"), ["--version"]),
    );
    const processors = cpus();
    const summary = {
      schema_version: "prepared-food-search-relevance-performance-v1",
      hardware: {
        platform: platform(),
        os_release: release(),
        cpu_model: processors[0]?.model ?? "unknown",
        logical_cpu_count: processors.length,
        memory_gib: Number((totalmem() / (1024 ** 3)).toFixed(2)),
      },
      runtime: {
        node: process.version,
        postgres: postgresVersion,
        postgrest_image: "public.ecr.aws/supabase/postgrest:v14.14",
      },
      denominator,
      labeled_query_count: fixture.cases.length,
      recall_at_20: recallAt20,
      precision_at_20: precisionAt20,
      cold_db_ms: coldDbMs,
      db_p95_ms: dbP95,
      cold_route_ms: coldRouteMs,
      route_p95_ms: routeP95,
      db_samples: dbDurations.length,
      route_samples: 20,
      candidate_cap: 400,
      explain: explainResults,
      legacy_explain: ["all", "manual"],
      external_requests: 0,
      external_writes: 0,
      case_results: caseResults,
    };
    if (DENOMINATOR === REQUIRED_DENOMINATOR) {
      mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
      writeFileSync(EVIDENCE_PATH, `${JSON.stringify(summary, null, 2)}\n`, {
        flag: "w",
      });
    }
    process.stdout.write(
      `Recall@20=${recallAt20.toFixed(4)} `
        + `Precision@20=${precisionAt20.toFixed(4)} `
        + `DB p95=${dbP95.toFixed(2)}ms `
        + `route p95=${routeP95.toFixed(2)}ms\n`,
    );
    process.stdout.write(
      DENOMINATOR === REQUIRED_DENOMINATOR
        ? `evidence=${EVIDENCE_PATH}\n`
        : `debug_denominator=${DENOMINATOR}; evidence_not_written=true\n`,
    );
  } finally {
    if (postgrestStarted) {
      commandResult("docker", ["rm", "-f", containerName]);
    }
    if (postgresStarted) {
      commandResult(path.join(postgresBin, "pg_ctl"), [
        "-D",
        dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}
