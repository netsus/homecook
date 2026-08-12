#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const POSTGRES_TOOLS = ["initdb", "pg_ctl", "createdb", "psql"];
const POSTGREST_IMAGE = "public.ecr.aws/supabase/postgrest:v14.14";
const POSTGREST_PLATFORM = process.arch === "arm64" ? "linux/arm64" : "linux/amd64";
const jwtSecret = "homecook-yta-postgrest-test-secret-2026";
const authenticatorPassword = "authenticator-password";

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
    throw new Error(`YouTube async extraction command failed: ${command}`);
  }
  return result;
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
      candidates.push(
        ...readdirSync(formulaRoot)
          .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
          .map((version) => path.join(formulaRoot, version, "bin")),
      );
    }
  }

  return candidates.find((directory) =>
    POSTGRES_TOOLS.every((tool) => existsSync(path.join(directory, tool)))
      && commandResult(path.join(directory, "postgres"), ["--version"]).status === 0
  ) ?? null;
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
  if (!port) throw new Error("Unable to reserve port");
  return port;
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(claims) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = createHmac("sha256", jwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${signature}`;
}

async function waitForPostgrest(url, token) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = commandResult("curl", [
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "-H",
      `Authorization: Bearer ${token}`,
      "-H",
      "Content-Type: application/json",
      "-X",
      "POST",
      `${url}/rpc/claim_youtube_extraction_job`,
      "-d",
      "{\"worker_id\":\"worker-alpha\",\"allowed_snapshot_digest\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"lease_seconds\":120}",
    ]);
    if ((response.stdout ?? "").trim().match(/^[1-5][0-9]{2}$/u)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for PostgREST");
}

function bootstrapSql() {
  return `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_admin nologin bypassrls;
    create role supabase_auth_admin nologin;
    create role authenticator noinherit login password '${authenticatorPassword}';
    grant anon, authenticated, service_role, supabase_admin, supabase_auth_admin to authenticator;

    create schema auth;
    create schema extensions;
    create schema private;
    create extension pgcrypto with schema extensions;

    create table auth.users (
      id uuid primary key,
      created_at timestamptz not null,
      email text
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $function$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
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

    grant usage on schema auth to anon, authenticated, service_role, authenticator;
    grant execute on function auth.uid() to anon, authenticated, service_role, authenticator;
    grant execute on function auth.role() to anon, authenticated, service_role, authenticator;
    grant usage on schema public to anon, authenticated, service_role, authenticator;

    create table public.users (
      id uuid primary key references auth.users(id) on delete cascade,
      nickname text not null,
      social_provider text not null,
      social_id text not null
    );

    create table public.ingredients (
      id uuid primary key default gen_random_uuid(),
      standard_name varchar(100) not null unique,
      category varchar(50) not null,
      default_unit varchar(20)
    );
    create table public.ingredient_synonyms (
      id uuid primary key default gen_random_uuid(),
      ingredient_id uuid not null references public.ingredients(id) on delete cascade,
      synonym varchar(100) not null,
      unique (ingredient_id, synonym)
    );
    create table public.cooking_methods (
      id uuid primary key default gen_random_uuid(),
      code varchar(20) not null unique,
      label varchar(20) not null,
      color_key varchar(20) not null default 'unassigned',
      is_system boolean not null default true,
      display_order integer not null default 0
    );
    create table public.youtube_transcript_cache (
      id uuid primary key default gen_random_uuid(), youtube_video_id varchar(20) not null,
      language text not null, source_provider text not null, source_kind text not null,
      transcript_text text not null, segments_json jsonb not null default '[]'::jsonb,
      expires_at timestamptz not null, created_at timestamptz not null default now(),
      last_used_at timestamptz not null default now(),
      unique (youtube_video_id, language, source_provider)
    );
    create table public.youtube_transcript_fetch_events (
      id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id),
      youtube_video_id varchar(20) not null, provider text not null,
      cache_hit boolean not null default false, status text not null, reason text,
      estimated_cost_microusd integer not null default 0, created_at timestamptz not null default now()
    );
    create table public.youtube_llm_extraction_cache (
      id uuid primary key default gen_random_uuid(), youtube_video_id varchar(20) not null,
      source_hash text not null, schema_version text not null, model text not null,
      source_kinds text[] not null default '{}', result_json jsonb not null,
      expires_at timestamptz not null, created_at timestamptz not null default now(),
      last_used_at timestamptz not null default now(),
      unique (youtube_video_id, source_hash, schema_version, model)
    );
    create table public.youtube_llm_extraction_events (
      id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id),
      youtube_video_id varchar(20) not null, provider text not null, model text,
      cache_hit boolean not null default false, status text not null, reason text,
      input_tokens integer not null default 0, output_tokens integer not null default 0,
      estimated_cost_microusd integer not null default 0, created_at timestamptz not null default now()
    );
    create table public.youtube_visual_extraction_cache (
      id uuid primary key default gen_random_uuid(), youtube_video_id varchar(20) not null,
      provider text not null, schema_version text not null, visual_request_hash text not null,
      result_json jsonb not null, expires_at timestamptz not null,
      created_at timestamptz not null default now(), last_used_at timestamptz not null default now(),
      unique (youtube_video_id, provider, schema_version, visual_request_hash)
    );
    create table public.youtube_visual_extraction_events (
      id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id),
      youtube_video_id varchar(20) not null, provider text not null, model text,
      cache_hit boolean not null default false, event_type text not null, status text not null,
      reason text, input_tokens integer not null default 0, output_tokens integer not null default 0,
      estimated_cost_microusd integer not null default 0, created_at timestamptz not null default now()
    );
    alter table public.youtube_transcript_cache enable row level security;
    alter table public.youtube_transcript_fetch_events enable row level security;
    alter table public.youtube_llm_extraction_cache enable row level security;
    alter table public.youtube_llm_extraction_events enable row level security;
    alter table public.youtube_visual_extraction_cache enable row level security;
    alter table public.youtube_visual_extraction_events enable row level security;

    create table public.recipes (
      id uuid primary key default gen_random_uuid(),
      created_by uuid references public.users(id) on delete set null,
      title text not null default '',
      base_servings integer not null default 1
    );

    create table public.youtube_extraction_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.users(id) on delete cascade,
      youtube_url text not null,
      youtube_video_id varchar(20) not null,
      video_title text,
      channel_title text,
      thumbnail_url text,
      provider_version text,
      source_providers text[] not null default '{}'::text[],
      classification_status varchar(20) not null,
      classification_reasons text[] not null default '{}'::text[],
      raw_source_text text,
      extraction_meta_json jsonb not null default '{}'::jsonb,
      draft_json jsonb not null default '{}'::jsonb,
      extraction_methods text[] not null default '{}'::text[],
      status varchar(20) not null default 'draft',
      recipe_id uuid references public.recipes(id) on delete set null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      session_kind varchar(20) not null default 'single',
      parent_extraction_session_id uuid
        references public.youtube_extraction_sessions(id) on delete cascade,
      parent_candidate_id text,
      constraint youtube_extraction_sessions_status_check
        check (status in ('draft', 'consumed', 'expired')),
      constraint youtube_extraction_sessions_classification_check
        check (classification_status in ('recipe', 'uncertain', 'non_recipe')),
      constraint youtube_extraction_sessions_session_kind_check
        check (session_kind in ('single', 'multi_parent', 'candidate_child'))
    );
    alter table public.youtube_extraction_sessions enable row level security;
    create policy youtube_extraction_sessions_select_own
      on public.youtube_extraction_sessions
      for select
      using (auth.uid() = user_id);

    create table public.youtube_extraction_candidates (
      id uuid primary key default gen_random_uuid(),
      extraction_session_id uuid not null
        references public.youtube_extraction_sessions(id) on delete cascade,
      candidate_id text not null,
      status varchar(20) not null default 'draft',
      child_extraction_session_id uuid
        references public.youtube_extraction_sessions(id) on delete set null,
      recipe_id uuid references public.recipes(id) on delete set null,
      title text not null,
      start_ms integer,
      end_ms integer,
      confidence numeric,
      draft_ingredient_ids_json jsonb not null default '[]'::jsonb,
      source_meta_json jsonb not null default '{}'::jsonb,
      promoted_at timestamptz,
      registered_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint youtube_extraction_candidates_status_check
        check (status in ('draft', 'promoted', 'registered', 'skipped', 'expired')),
      constraint youtube_extraction_candidates_unique
        unique (extraction_session_id, candidate_id)
    );
    alter table public.youtube_extraction_candidates enable row level security;
    create policy youtube_extraction_candidates_select_own
      on public.youtube_extraction_candidates
      for select
      using (
        exists (
          select 1
          from public.youtube_extraction_sessions as s
          where s.id = youtube_extraction_candidates.extraction_session_id
            and s.user_id = auth.uid()
        )
      );
  `;
}

const postgresBin = findPostgresBin();
if (!postgresBin) {
  process.stderr.write("POSTGRES_RUNTIME_UNAVAILABLE: youtube async extraction integration cannot run.\n");
  process.exitCode = 1;
} else {
  const root = mkdtempSync(path.join(existsSync("/tmp") ? "/tmp" : tmpdir(), "homecook-yta-pg-"));
  const dataDirectory = path.join(root, "data");
  const socketDirectory = path.join(root, "socket");
  const database = "homecook_yta_test";
  const pgPort = await reservePort();
  const postgrestPort = await reservePort();
  const postgrestContainer = `homecook-yta-postgrest-${Date.now()}`;
  let postgresStarted = false;
  let postgrestStarted = false;

  try {
    runRequired(path.join(postgresBin, "initdb"), [
      "-D",
      dataDirectory,
      "-U",
      "postgres",
      "--auth-local=trust",
      "--auth-host=scram-sha-256",
    ]);
    runRequired("mkdir", ["-p", socketDirectory]);
    runRequired(path.join(postgresBin, "pg_ctl"), [
      "-D",
      dataDirectory,
      "-o",
      `-p ${pgPort} -h '0.0.0.0' -k ${socketDirectory}`,
      "-l",
      path.join(root, "postgres.log"),
      "-w",
      "start",
    ]);
    postgresStarted = true;
    runRequired(path.join(postgresBin, "createdb"), [
      "-h",
      socketDirectory,
      "-p",
      String(pgPort),
      "-U",
      "postgres",
      database,
    ]);

    const connectionArgs = [
      "-h",
      socketDirectory,
      "-p",
      String(pgPort),
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ];

    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-c",
      bootstrapSql(),
    ]);
    runRequired(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-f",
      "supabase/migrations/20260812160000_youtube_async_extraction_notification.sql",
    ]);

    const allowedSnapshotDigest = commandResult(path.join(postgresBin, "psql"), [
      ...connectionArgs,
      "-At",
      "-q",
      "-c",
      `select private.youtube_extraction_policy_snapshot_digest(
        extractor_mode,
        pipeline_identity,
        result_affecting_options,
        policy_version
      )
      from private.youtube_extraction_current_policy
      where policy_key = 'primary';`,
    ]).stdout.trim().split("\n").at(-1);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const workerToken = signJwt({
      role: "youtube_extraction_worker",
      scope: "youtube-extraction-worker",
      iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction",
      jti_hash: "a".repeat(64),
      release_sha: "1111111111111111111111111111111111111111",
      schema_identity: "youtube-extraction-worker-schema-v1",
      allowed_snapshot_digest: allowedSnapshotDigest,
      generation: 7,
      exp: nowSeconds + 3600,
    });
    const invalidWorkerToken = signJwt({
      role: "youtube_extraction_worker",
      scope: "wrong-scope",
      iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction",
      jti_hash: "a".repeat(64),
      release_sha: "1111111111111111111111111111111111111111",
      schema_identity: "youtube-extraction-worker-schema-v1",
      allowed_snapshot_digest: allowedSnapshotDigest,
      generation: 7,
      exp: nowSeconds + 3600,
    });
    const managerToken = signJwt({
      role: "youtube_extraction_credential_manager",
      scope: "youtube-extraction-credential-manager",
      iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction",
      exp: nowSeconds + 240,
    });
    const ownerAToken = signJwt({
      role: "authenticated",
      sub: "70000000-0000-4000-8000-000000000001",
      iss: "https://auth.local",
      aud: "authenticated",
      exp: nowSeconds + 3600,
    });
    const ownerBToken = signJwt({
      role: "authenticated",
      sub: "70000000-0000-4000-8000-000000000002",
      iss: "https://auth.local",
      aud: "authenticated",
      exp: nowSeconds + 3600,
    });

    const dockerCheck = commandResult("docker", ["version", "--format", "{{.Server.Version}}"]);
    if (dockerCheck.status === 0) {
      runRequired("docker", [
        "run",
        "--platform",
        POSTGREST_PLATFORM,
        "-d",
        "--name",
        postgrestContainer,
        "--add-host",
        "host.docker.internal:host-gateway",
        "-p",
        `${postgrestPort}:3000`,
        "-e",
        `PGRST_DB_URI=postgresql://authenticator:${authenticatorPassword}@host.docker.internal:${pgPort}/${database}`,
        "-e",
        "PGRST_DB_SCHEMAS=public",
        "-e",
        "PGRST_DB_ANON_ROLE=anon",
        "-e",
        `PGRST_JWT_SECRET=${jwtSecret}`,
        POSTGREST_IMAGE,
      ]);
      postgrestStarted = true;
      try {
        await waitForPostgrest(`http://127.0.0.1:${postgrestPort}`, workerToken);
      } catch (error) {
        const logs = commandResult("docker", ["logs", postgrestContainer]);
        process.stderr.write(logs.stdout ?? "");
        process.stderr.write(logs.stderr ?? "");
        commandResult("docker", ["rm", "-f", postgrestContainer]);
        postgrestStarted = false;
        process.stderr.write(
          `POSTGREST_STARTUP_SKIPPED: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }

    const test = commandResult("pnpm", [
      "exec",
      "vitest",
      "run",
      "tests/youtube-extraction-policy-postgres.integration.test.ts",
      "tests/youtube-extraction-security-postgrest.integration.test.ts",
      "--pool=forks",
      "--maxWorkers=1",
      "--testTimeout=30000",
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? ""}`,
        HOMECOOK_YTA_PG_INTEGRATION: "1",
        HOMECOOK_YTA_PGHOST: socketDirectory,
        HOMECOOK_YTA_PGPORT: String(pgPort),
        HOMECOOK_YTA_PGDATABASE: database,
        HOMECOOK_YTA_MIGRATION_PATH:
          "supabase/migrations/20260812160000_youtube_async_extraction_notification.sql",
        HOMECOOK_YTA_POSTGREST_INTEGRATION: postgrestStarted ? "1" : "0",
        HOMECOOK_YTA_POSTGREST_URL: `http://127.0.0.1:${postgrestPort}`,
        HOMECOOK_YTA_WORKER_JWT: workerToken,
        HOMECOOK_YTA_INVALID_WORKER_JWT: invalidWorkerToken,
        HOMECOOK_YTA_MANAGER_JWT: managerToken,
        HOMECOOK_YTA_OWNER_A_JWT: ownerAToken,
        HOMECOOK_YTA_OWNER_B_JWT: ownerBToken,
      },
    });
    process.exitCode = test.status ?? 1;
  } finally {
    if (postgrestStarted) {
      commandResult("docker", ["rm", "-f", postgrestContainer]);
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
