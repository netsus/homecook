import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { YOUTUBE_ASYNC_POLICY } from "@/lib/server/youtube-async-extraction";

const enabled =
  process.env.HOMECOOK_YTA_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_YTA_PGHOST ?? "";
const port = process.env.HOMECOOK_YTA_PGPORT ?? "";
const database = process.env.HOMECOOK_YTA_PGDATABASE ?? "";
const migrationPath = process.env.HOMECOOK_YTA_MIGRATION_PATH ?? "";
const expectedSchemaDocument = JSON.parse(readFileSync(
  "scripts/manifests/youtube-extraction-expected-schema.json",
  "utf8",
)) as {
  tables: string[];
  roles: string[];
  memberships: Array<{
    member: string;
    role: string;
    admin: boolean;
    inherit: boolean;
    set: boolean;
  }>;
  rpc_signatures: string[];
  catalog_fingerprint: string;
};
const expectedSchema = {
  tables: expectedSchemaDocument.tables,
  roles: expectedSchemaDocument.roles,
  memberships: expectedSchemaDocument.memberships,
  rpc_signatures: expectedSchemaDocument.rpc_signatures,
};

const ownerA = "70000000-0000-4000-8000-000000000001";
const ownerB = "70000000-0000-4000-8000-000000000002";
const workerId = "worker-alpha";
const managerIssuer = "https://worker.mumeok.kr";
const audience = "youtube-extraction";
const workerReleaseSha = "1111111111111111111111111111111111111111";
const workerSchemaIdentity = "youtube-extraction-worker-schema-v1";
const workerJtiHash = "a".repeat(64);
const nextWorkerJtiHash = "b".repeat(64);

function psqlResult(sql: string) {
  return spawnSync(
    "psql",
    [
      "-h",
      host,
      "-p",
      port,
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: "" },
    },
  );
}

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

function sqlJson(value: unknown) {
  return `$json$${JSON.stringify(value)}$json$`;
}

function lastLine(stdout: string) {
  return stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";
}

function parseJson(stdout: string) {
  return JSON.parse(lastLine(stdout)) as Record<string, unknown>;
}

function authenticatedClaims(userId: string) {
  return {
    role: "authenticated",
    sub: userId,
    aud: "authenticated",
  };
}

function workerClaims(
  allowedSnapshotDigest: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    role: "youtube_extraction_worker",
    scope: "youtube-extraction-worker",
    iss: managerIssuer,
    aud: audience,
    jti_hash: workerJtiHash,
    release_sha: workerReleaseSha,
    schema_identity: workerSchemaIdentity,
    allowed_snapshot_digest: allowedSnapshotDigest,
    generation: 7,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function managerClaims(overrides: Record<string, unknown> = {}) {
  return {
    role: "youtube_extraction_credential_manager",
    scope: "youtube-extraction-credential-manager",
    iss: managerIssuer,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 240,
    ...overrides,
  };
}

function runAsJson(role: string, claims: Record<string, unknown>, sql: string) {
  return parseJson(psql(`
    begin;
    set local role ${role};
    set local request.jwt.claims = ${sqlJson(claims)};
    ${sql}
    commit;
  `));
}

function policySnapshotDigest() {
  return lastLine(psql(`
    select private.youtube_extraction_policy_snapshot_digest(
      extractor_mode,
      pipeline_identity,
      result_affecting_options,
      policy_version
    )
    from private.youtube_extraction_current_policy
    where policy_key = 'primary';
  `));
}

function enablePolicy() {
  psql(`
    update private.youtube_extraction_current_policy
    set enabled = true,
        updated_at = now()
    where policy_key = 'primary';
  `);
}

function configureWorkerCredential(allowedSnapshotDigest: string) {
  psql(`
    update private.youtube_extraction_worker_credentials
    set current_generation = 7,
        current_jti_hash = '${workerJtiHash}',
        expires_at = now() + interval '1 day',
        release_sha = '${workerReleaseSha}',
        schema_identity = '${workerSchemaIdentity}',
        allowed_snapshot_digest = '${allowedSnapshotDigest}',
        updated_at = now()
    where credential_name = 'primary';
  `);
}

function resetRuntimeState() {
  psql(`
    truncate table public.youtube_extraction_candidates restart identity cascade;
    truncate table public.youtube_extraction_sessions restart identity cascade;
    truncate table public.youtube_extraction_jobs restart identity cascade;
    update public.youtube_extractor_permits
    set owner_id = null,
        permit_generation = 0,
        heartbeat_at = null,
        expires_at = null;
    update private.youtube_extraction_current_policy
    set enabled = false,
        policy_version = ${YOUTUBE_ASYNC_POLICY.policyVersion},
        extractor_mode = '${YOUTUBE_ASYNC_POLICY.extractorMode}',
        pipeline_identity = '${YOUTUBE_ASYNC_POLICY.pipelineIdentity}',
        result_affecting_options = ${sqlJson(YOUTUBE_ASYNC_POLICY.resultAffectingOptions)}::jsonb,
        fingerprint_key_version = '${YOUTUBE_ASYNC_POLICY.fingerprintKeyVersion}',
        previous_fingerprint_key_version = null,
        previous_fingerprint_valid_until = null,
        updated_at = now()
    where policy_key = 'primary';
    update private.youtube_extraction_worker_credentials
    set current_generation = 1,
        current_jti_hash = repeat('0', 64),
        expires_at = now(),
        release_sha = 'bootstrap-disabled',
        schema_identity = 'youtube-extraction-worker-schema-v1',
        allowed_snapshot_digest = repeat('0', 64),
        updated_at = now()
    where credential_name = 'primary';
  `);
}

function insertJob({
  id,
  userId,
  videoId,
  fingerprint,
  status,
  attemptCount = 0,
  maxAttempts = 3,
  leaseOwner = null,
  leaseGeneration = 0,
  availableAtSql = "now() - interval '1 minute'",
  leaseExpiresAtSql = "null",
  completedAtSql = "null",
  deliveryKeySql = "null",
}: {
  id: string;
  userId: string;
  videoId: string;
  fingerprint: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  attemptCount?: number;
  maxAttempts?: number;
  leaseOwner?: string | null;
  leaseGeneration?: number;
  availableAtSql?: string;
  leaseExpiresAtSql?: string;
  completedAtSql?: string;
  deliveryKeySql?: string;
}) {
  psql(`
    insert into public.youtube_extraction_jobs (
      id,
      user_id,
      youtube_video_id,
      request_fingerprint,
      request_fingerprint_key_version,
      release_policy_key,
      policy_version,
      policy_snapshot_digest,
      extractor_mode,
      pipeline_identity,
      result_affecting_options,
      submission_mode,
      status,
      attempt_count,
      max_attempts,
      available_at,
      lease_owner,
      lease_generation,
      lease_expires_at,
      completed_at,
      completion_delivery_key,
      created_at,
      updated_at
    )
    select
      '${id}'::uuid,
      '${userId}'::uuid,
      '${videoId}',
      '${fingerprint}',
      policy.fingerprint_key_version,
      policy.policy_key,
      policy.policy_version,
      private.youtube_extraction_policy_snapshot_digest(
        policy.extractor_mode,
        policy.pipeline_identity,
        policy.result_affecting_options,
        policy.policy_version
      ),
      policy.extractor_mode,
      policy.pipeline_identity,
      policy.result_affecting_options,
      'background_notify',
      '${status}',
      ${attemptCount},
      ${maxAttempts},
      ${availableAtSql},
      ${leaseOwner === null ? "null" : `'${leaseOwner}'`},
      ${leaseGeneration},
      ${leaseExpiresAtSql},
      ${completedAtSql},
      ${deliveryKeySql},
      now() - interval '5 minutes',
      now() - interval '5 minutes'
    from private.youtube_extraction_current_policy as policy
    where policy.policy_key = 'primary';
  `);
}

describe.runIf(enabled).sequential("youtube async extraction PostgreSQL integration", () => {
  beforeAll(() => {
    psql(`
      insert into auth.users (id, created_at, email)
      values
        ('${ownerA}', now(), 'owner-a@example.invalid'),
        ('${ownerB}', now(), 'owner-b@example.invalid')
      on conflict (id) do nothing;

      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${ownerA}', 'owner-a', 'test', 'owner-a'),
        ('${ownerB}', 'owner-b', 'test', 'owner-b')
      on conflict (id) do nothing;
    `);
  });

  beforeEach(() => {
    resetRuntimeState();
  });

  it("creates exact durable queue surfaces and disabled bootstrap policy rows", () => {
    const result = parseJson(psql(`
      select json_build_object(
        'jobs', to_regclass('public.youtube_extraction_jobs') is not null,
        'permits', to_regclass('public.youtube_extractor_permits') is not null,
        'policy', to_regclass('private.youtube_extraction_current_policy') is not null,
        'credentials', to_regclass('private.youtube_extraction_worker_credentials') is not null,
        'active_dedupe_index', to_regclass('public.youtube_extraction_jobs_active_dedupe_uidx') is not null,
        'claim_index', to_regclass('public.youtube_extraction_jobs_claim_idx') is not null,
        'enabled', (select enabled from private.youtube_extraction_current_policy where policy_key = 'primary')
      )::text;
    `));

    expect(result).toEqual({
      jobs: true,
      permits: true,
      policy: true,
      credentials: true,
      active_dedupe_index: true,
      claim_index: true,
      enabled: false,
    });
    expect(policySnapshotDigest()).toBe(YOUTUBE_ASYNC_POLICY.snapshotDigest);
  });

  it("replays the additive migration without duplicate-object failures", () => {
    const replay = spawnSync(
      "psql",
      [
        "-h",
        host,
        "-p",
        port,
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        migrationPath,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PGPASSWORD: "" },
      },
    );

    expect(replay.status, replay.stderr).toBe(0);
  });

  it("uses the dedicated role owners for hardened security definer RPCs", () => {
    const result = parseJson(psql(`
      select json_build_object(
        'enqueue', (
          select pg_get_userbyid(proowner)
          from pg_proc
          where proname = 'enqueue_youtube_extraction_job'
            and pronamespace = 'public'::regnamespace
        ),
        'readiness', (
          select pg_get_userbyid(proowner)
          from pg_proc
          where proname = 'read_youtube_extraction_enqueue_readiness'
            and pronamespace = 'public'::regnamespace
        ),
        'projection', (
          select pg_get_userbyid(proowner)
          from pg_proc
          where proname = 'read_youtube_extraction_job_projection'
            and pronamespace = 'public'::regnamespace
        ),
        'claim', (
          select pg_get_userbyid(proowner)
          from pg_proc
          where proname = 'claim_youtube_extraction_job'
            and pronamespace = 'public'::regnamespace
        ),
        'rotate', (
          select pg_get_userbyid(proowner)
          from pg_proc
          where proname = 'rotate_youtube_extraction_worker_credential'
            and pronamespace = 'public'::regnamespace
        )
      )::text;
    `));

    expect(result).toEqual({
      enqueue: "youtube_extraction_enqueue_rpc_owner",
      readiness: "youtube_extraction_readiness_rpc_owner",
      projection: "youtube_extraction_projection_rpc_owner",
      claim: "youtube_extraction_worker_rpc_owner",
      rotate: "youtube_extraction_credential_manager_rpc_owner",
    });
  });

  it("matches the release expected-schema role, membership, table and RPC inventory", () => {
    const actual = parseJson(psql(`
      select json_build_object(
        'tables', (
          select json_agg(format('%I.%I', schemaname, tablename) order by schemaname, tablename)
          from pg_catalog.pg_tables
          where format('%I.%I', schemaname, tablename) in (
            'private.youtube_extraction_current_policy',
            'private.youtube_extraction_worker_credentials',
            'public.cooking_methods',
            'public.ingredient_synonyms',
            'public.ingredients',
            'public.youtube_extraction_candidates',
            'public.youtube_extraction_jobs',
            'public.youtube_extraction_sessions',
            'public.youtube_extractor_permits',
            'public.youtube_llm_extraction_cache',
            'public.youtube_llm_extraction_events',
            'public.youtube_transcript_cache',
            'public.youtube_transcript_fetch_events',
            'public.youtube_visual_extraction_cache',
            'public.youtube_visual_extraction_events'
          )
        ),
        'roles', (
          select json_agg(rolname order by rolname)
          from pg_catalog.pg_roles
          where rolname like 'youtube_extraction%'
        ),
        'memberships', (
          select json_agg(
            json_build_object(
              'member', member_role.rolname,
              'role', granted_role.rolname,
              'admin', membership.admin_option,
              'inherit', coalesce(
                (pg_catalog.to_jsonb(membership) ->> 'inherit_option')::boolean,
                false
              ),
              'set', coalesce(
                (pg_catalog.to_jsonb(membership) ->> 'set_option')::boolean,
                true
              )
            )
            order by member_role.rolname, granted_role.rolname
          )
          from pg_catalog.pg_auth_members as membership
          join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
          join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
          where member_role.rolname = 'authenticator'
            and granted_role.rolname like 'youtube_extraction%'
        ),
        'rpc_signatures', (
          select json_agg(
            namespace.nspname || '.' || procedure.proname || '('
              || replace(pg_catalog.oidvectortypes(procedure.proargtypes), ', ', ',') || ')'
            order by procedure.proname, procedure.proargtypes::text
          )
          from pg_catalog.pg_proc as procedure
          join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname in (
              'access_youtube_extraction_worker_cache',
              'check_youtube_extraction_worker_pre_request',
              'claim_youtube_extraction_job',
              'claim_youtube_extractor_permit',
              'enqueue_youtube_extraction_job',
              'fail_or_retry_youtube_extraction_job',
              'finalize_youtube_extraction_job',
              'heartbeat_youtube_extraction_job',
              'heartbeat_youtube_extractor_permit',
              'list_youtube_extraction_job_projections',
              'mark_youtube_extraction_jobs_delivered',
              'mark_youtube_extraction_jobs_seen',
              'read_youtube_extraction_enqueue_readiness',
              'read_youtube_extraction_job_projection',
              'read_youtube_extraction_session_projection',
              'read_youtube_extraction_worker_catalog',
              'record_youtube_extraction_worker_event',
              'release_youtube_extractor_permit',
              'requeue_youtube_extraction_job_without_attempt',
              'reserve_youtube_extraction_worker_quota',
              'resolve_youtube_extraction_job_draft',
              'resolve_youtube_extraction_worker_methods',
              'rotate_youtube_extraction_worker_credential',
              'start_youtube_extraction_attempt',
              'update_youtube_extraction_job_title'
            )
        )
      )::text;
    `));

    expect(actual).toEqual(expectedSchema);
  });

  it("keeps API roles table-blind and RPC owners non-login without owner membership edges", () => {
    const result = parseJson(psql(`
      select json_build_object(
        'unsafe_role_count', (
          select count(*)
          from pg_catalog.pg_roles
          where rolname like 'youtube_extraction%'
            and (rolsuper or rolcreatedb or rolcreaterole or rolreplication
              or rolbypassrls or rolcanlogin or rolinherit)
        ),
        'api_table_privilege_count', (
          select count(*)
          from unnest(array[
            'youtube_extraction_worker',
            'youtube_extraction_credential_manager',
            'authenticated',
            'service_role'
          ]) as role_name
          cross join unnest(array[
            'public.youtube_extraction_jobs',
            'public.youtube_extractor_permits',
            'private.youtube_extraction_current_policy',
            'private.youtube_extraction_worker_credentials',
            'public.ingredients',
            'public.ingredient_synonyms',
            'public.cooking_methods',
            'public.youtube_transcript_cache',
            'public.youtube_transcript_fetch_events',
            'public.youtube_llm_extraction_cache',
            'public.youtube_llm_extraction_events',
            'public.youtube_visual_extraction_cache',
            'public.youtube_visual_extraction_events'
          ]) as relation_name
          where has_table_privilege(role_name, relation_name, 'SELECT,INSERT,UPDATE,DELETE')
        ),
        'enqueue_owner_minimum',
          has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'public.youtube_extraction_jobs', 'SELECT,INSERT')
          and not has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'public.youtube_extraction_jobs', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          and has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'private.youtube_extraction_current_policy', 'SELECT')
          and not has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'private.youtube_extraction_current_policy', 'INSERT,UPDATE,DELETE'),
        'enqueue_owner_extra_privilege_count', (
          select count(*)
          from information_schema.role_table_grants
          where grantee = 'youtube_extraction_enqueue_rpc_owner'
            and not (
              (table_schema = 'private' and table_name = 'youtube_extraction_current_policy' and privilege_type = 'SELECT')
              or (table_schema = 'public' and table_name = 'youtube_extraction_jobs' and privilege_type in ('SELECT', 'INSERT'))
            )
        ),
        'enqueue_owner_extra_policy_count', (
          select count(*)
          from pg_catalog.pg_policies
          where 'youtube_extraction_enqueue_rpc_owner' = any(roles)
            and policyname not in (
              'youtube_extraction_current_policy_enqueue_owner_select',
              'youtube_extraction_jobs_enqueue_owner_select',
              'youtube_extraction_jobs_enqueue_owner_insert'
            )
        ),
        'owner_membership_count', (
          select count(*)
          from pg_catalog.pg_auth_members as membership
          join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
          where granted_role.rolname in (
            'youtube_extraction_enqueue_rpc_owner',
            'youtube_extraction_worker_rpc_owner',
            'youtube_extraction_credential_manager_rpc_owner'
          )
        ),
        'admin_membership_count', (
          select count(*)
          from pg_catalog.pg_auth_members as membership
          join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
          where granted_role.rolname in (
            'youtube_extraction_worker',
            'youtube_extraction_credential_manager'
          ) and membership.admin_option
        )
      )::text;
    `));

    expect(result).toEqual({
      unsafe_role_count: 0,
      api_table_privilege_count: 0,
      enqueue_owner_minimum: true,
      enqueue_owner_extra_privilege_count: 0,
      enqueue_owner_extra_policy_count: 0,
      owner_membership_count: 0,
      admin_membership_count: 0,
    });
  });

  it("enqueues with auth.uid ownership and deduplicates an active fingerprint", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();

    const first = runAsJson(
      "authenticated",
      authenticatedClaims(ownerA),
      `select public.enqueue_youtube_extraction_job(
        'abc123def45',
        1,
        '${snapshotDigest}',
        '1',
        repeat('1', 64),
        null,
        null,
        'background_notify'
      )::text;`,
    );
    const duplicate = runAsJson(
      "authenticated",
      authenticatedClaims(ownerA),
      `select public.enqueue_youtube_extraction_job(
        'abc123def45',
        1,
        '${snapshotDigest}',
        '1',
        repeat('1', 64),
        null,
        null,
        'background_notify'
      )::text;`,
    );

    expect(first).toMatchObject({ status: "queued", deduplicated: false });
    expect(duplicate).toMatchObject({ status: "queued", deduplicated: true });
    expect(lastLine(psql(`
      select count(*)::text
      from public.youtube_extraction_jobs
      where user_id = '${ownerA}'::uuid
        and request_fingerprint = repeat('1', 64);
    `))).toBe("1");
  });

  it("deduplicates the active previous fingerprint while writing only the current key", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    const previousDigest = "8".repeat(64);
    const currentDigest = "9".repeat(64);

    psql(`
      update private.youtube_extraction_current_policy
      set previous_fingerprint_key_version = '0',
          previous_fingerprint_valid_until = now() + interval '1 hour'
      where policy_key = 'primary';
    `);
    insertJob({
      id: "70000000-0000-4000-8000-000000000105",
      userId: ownerA,
      videoId: "previous001",
      fingerprint: previousDigest,
      status: "queued",
    });
    psql(`
      update public.youtube_extraction_jobs
      set request_fingerprint_key_version = '0'
      where id = '70000000-0000-4000-8000-000000000105';
    `);

    const deduplicated = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.enqueue_youtube_extraction_job(
        'previous001',
        1,
        '${snapshotDigest}',
        '1',
        '${currentDigest}',
        '0',
        '${previousDigest}',
        'background_notify'
      )::text;
    `);
    const created = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.enqueue_youtube_extraction_job(
        'current001',
        1,
        '${snapshotDigest}',
        '1',
        '${"7".repeat(64)}',
        '0',
        '${"6".repeat(64)}',
        'background_notify'
      )::text;
    `);

    expect(deduplicated).toMatchObject({
      job_id: "70000000-0000-4000-8000-000000000105",
      deduplicated: true,
    });
    expect(created).toMatchObject({ deduplicated: false, status: "queued" });
    expect(psql(`
      select request_fingerprint_key_version
      from public.youtube_extraction_jobs
      where id = '${String(created.job_id)}'::uuid;
    `)).toBe("1");
  });

  it("requires the previous fingerprint version and digest to travel as one complete pair", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    psql(`
      update private.youtube_extraction_current_policy
      set previous_fingerprint_key_version = '0',
          previous_fingerprint_valid_until = now() + interval '1 hour'
      where policy_key = 'primary';
    `);

    const completePair = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.enqueue_youtube_extraction_job(
        'pairAtomic01', 1, '${snapshotDigest}', '1', '${"1".repeat(64)}',
        '0', '${"2".repeat(64)}', 'background_notify'
      )::text;
    `);
    expect(completePair).toMatchObject({ deduplicated: false, status: "queued" });

    expectSqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlJson(authenticatedClaims(ownerA))};
      select public.enqueue_youtube_extraction_job(
        'pairInvalid01', 1, '${snapshotDigest}', '1', '${"3".repeat(64)}',
        null, '${"4".repeat(64)}', 'background_notify'
      );
      commit;
    `, /VALIDATION_ERROR/u);
  });

  it("enforces the approved per-user active and daily enqueue budgets inside the enqueue transaction", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();

    for (let index = 1; index <= 2; index += 1) {
      const digest = index.toString(16).padStart(64, "0");
      const result = runAsJson(
        "authenticated",
        authenticatedClaims(ownerA),
        `select public.enqueue_youtube_extraction_job(
          'budget${index.toString().padStart(5, "0")}',
          1,
          '${snapshotDigest}',
          '1',
          '${digest}',
          null,
          null,
          'background_notify'
        )::text;`,
      );
      expect(result).toMatchObject({ status: "queued", deduplicated: false });
    }

    expectSqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlJson(authenticatedClaims(ownerA))};
      select public.enqueue_youtube_extraction_job(
        'budget00003',
        1,
        '${snapshotDigest}',
        '1',
        '${"3".padStart(64, "0")}',
        null,
        null,
        'background_notify'
      );
      commit;
    `, /RATE_LIMITED/u);

    psql(`
      update public.youtube_extraction_jobs
      set status = 'failed',
          error_code = 'EXTRACTION_FAILED',
          error_message = '추출을 완료하지 못했어요.',
          completed_at = now(),
          completion_delivery_key = 'budget:' || id::text,
          updated_at = now()
      where user_id = '${ownerA}'::uuid;
    `);

    for (let index = 3; index <= 10; index += 1) {
      const digest = index.toString(16).padStart(64, "0");
      const result = runAsJson(
        "authenticated",
        authenticatedClaims(ownerA),
        `select public.enqueue_youtube_extraction_job(
          'budget${index.toString().padStart(5, "0")}',
          1,
          '${snapshotDigest}',
          '1',
          '${digest}',
          null,
          null,
          'background_notify'
        )::text;`,
      );
      expect(result).toMatchObject({ status: "queued", deduplicated: false });
      psql(`
        update public.youtube_extraction_jobs
        set status = 'failed',
            error_code = 'EXTRACTION_FAILED',
            error_message = '추출을 완료하지 못했어요.',
            completed_at = now(),
            completion_delivery_key = 'budget:' || id::text,
            updated_at = now()
        where id = '${String(result.job_id)}'::uuid;
      `);
    }

    expectSqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlJson(authenticatedClaims(ownerA))};
      select public.enqueue_youtube_extraction_job(
        'budget00011',
        1,
        '${snapshotDigest}',
        '1',
        '${"b".padStart(64, "0")}',
        null,
        null,
        'background_notify'
      );
      commit;
    `, /RATE_LIMITED/u);

    expect(lastLine(psql(`
      select count(*)::text
      from public.youtube_extraction_jobs
      where user_id = '${ownerA}'::uuid;
    `))).toBe("10");
  });

  it("rejects a policy snapshot mismatch before any enqueue write", () => {
    enablePolicy();

    expectSqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlJson(authenticatedClaims(ownerA))};
      select public.enqueue_youtube_extraction_job(
        'abc123def45',
        1,
        repeat('9', 64),
        '1',
        repeat('1', 64),
        null,
        null,
        'background_notify'
      );
      commit;
    `, /POLICY_CHANGED/u);

    expect(lastLine(psql(`
      select count(*)::text
      from public.youtube_extraction_jobs
      where user_id = '${ownerA}'::uuid;
    `))).toBe("0");
  });

  it("fails closed across an options-only policy rotation without claiming old work", () => {
    enablePolicy();
    const oldSnapshotDigest = policySnapshotDigest();
    configureWorkerCredential(oldSnapshotDigest);
    insertJob({
      id: "70000000-0000-4000-8000-000000000106",
      userId: ownerA,
      videoId: "oldpolicy01",
      fingerprint: "5".repeat(64),
      status: "queued",
    });

    psql(`
      update private.youtube_extraction_current_policy
      set policy_version = policy_version + 1,
          result_affecting_options = jsonb_set(
            result_affecting_options,
            '{interval}',
            '6'::jsonb
          ),
          updated_at = now()
      where policy_key = 'primary';
    `);
    const newSnapshotDigest = policySnapshotDigest();
    configureWorkerCredential(newSnapshotDigest);

    expectSqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = ${sqlJson(authenticatedClaims(ownerA))};
      select public.enqueue_youtube_extraction_job(
        'newpolicy01',
        1,
        '${oldSnapshotDigest}',
        '1',
        '${"4".repeat(64)}',
        null,
        null,
        'background_notify'
      );
      commit;
    `, /POLICY_CHANGED/);
    expectSqlFailure(`
      begin;
      set local role youtube_extraction_worker;
      set local request.jwt.claims = ${sqlJson(workerClaims(oldSnapshotDigest))};
      select public.claim_youtube_extraction_job(
        '${workerId}',
        '${oldSnapshotDigest}',
        120
      );
      commit;
    `, /YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED/);

    const claim = runAsJson(
      "youtube_extraction_worker",
      workerClaims(newSnapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}',
        '${newSnapshotDigest}',
        120
      )::text;`,
    );
    expect(claim).toEqual({ status: "empty", applied: false });
    expect(psql(`
      select status || ':' || policy_snapshot_digest
      from public.youtube_extraction_jobs
      where id = '70000000-0000-4000-8000-000000000106';
    `)).toBe(`queued:${oldSnapshotDigest}`);
  });

  it("reaps an exhausted stale lease to failed before claiming the next queued job", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);

    insertJob({
      id: "80000000-0000-4000-8000-000000000001",
      userId: ownerA,
      videoId: "staleExhausted01",
      fingerprint: "1".repeat(64),
      status: "processing",
      attemptCount: 3,
      maxAttempts: 3,
      leaseOwner: "worker-old",
      leaseGeneration: 4,
      leaseExpiresAtSql: "now() - interval '2 minutes'",
    });
    insertJob({
      id: "80000000-0000-4000-8000-000000000002",
      userId: ownerA,
      videoId: "queuedReady0001",
      fingerprint: "2".repeat(64),
      status: "queued",
    });

    const claimed = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}',
        '${snapshotDigest}',
        120
      )::text;`,
    );

    expect(claimed).toMatchObject({
      status: "processing",
      job_id: "80000000-0000-4000-8000-000000000002",
    });
    expect(parseJson(psql(`
      select json_build_object(
        'status', status,
        'error_code', error_code
      )::text
      from public.youtube_extraction_jobs
      where id = '80000000-0000-4000-8000-000000000001'::uuid;
    `))).toEqual({
      status: "failed",
      error_code: "ATTEMPTS_EXHAUSTED",
    });
  });

  it("fences stale start attempts by lease generation", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000003",
      userId: ownerA,
      videoId: "leaseFence0001",
      fingerprint: "3".repeat(64),
      status: "queued",
    });

    const claim = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}',
        '${snapshotDigest}',
        120
      )::text;`,
    );
    const permit = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extractor_permit(
        '${workerId}',
        120
      )::text;`,
    );
    const staleStart = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.start_youtube_extraction_attempt(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${(claim.lease_generation as number) - 1},
        ${permit.permit_generation as number}
      )::text;`,
    );

    expect(staleStart).toEqual({ started: false });
    expect(lastLine(psql(`
      select attempt_count::text
      from public.youtube_extraction_jobs
      where id = '${claim.job_id}'::uuid;
    `))).toBe("0");
  });

  it("fences finalize by job and permit generation and replays one source_job session", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000004",
      userId: ownerA,
      videoId: "finalizeFence01",
      fingerprint: "7".repeat(64),
      status: "queued",
    });

    const claim = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}', '${snapshotDigest}', 120
      )::text;`,
    );
    const permit = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extractor_permit('${workerId}', 120)::text;`,
    );
    runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.start_youtube_extraction_attempt(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        ${permit.permit_generation as number}
      )::text;`,
    );
    psql(`
      insert into public.ingredients (id, standard_name, category, default_unit)
      values ('90000000-0000-4000-8000-000000000001', 'kimchi', 'vegetable', 'g')
      on conflict (standard_name) do update set default_unit = excluded.default_unit;
      insert into public.ingredient_synonyms (ingredient_id, synonym)
      select id, 'aged kimchi'
      from public.ingredients
      where standard_name = 'kimchi'
      on conflict (ingredient_id, synonym) do nothing;
      insert into public.cooking_methods (code, label, color_key, is_system, display_order)
      values ('boil', 'Boil', 'red', true, 60)
      on conflict (code) do update set label = excluded.label, color_key = excluded.color_key;
    `);
    const runtimeResult = {
      identity: {
        provider: "codex-vision-keyframes",
        model: "gpt-5.4",
      },
      recipe: {
        title: "Aged kimchi stew",
        ingredients: [{
          name: "aged kimchi",
          amount: "200",
          unit: "g",
          optional: false,
          groupLabel: "stew",
        }],
        steps: ["Boil the aged kimchi."],
      },
      meta: {
        sourceAvailability: {
          description: true,
          authorComment: false,
          transcript: true,
          onscreen: true,
        },
      },
    };
    const methodCountBeforeStaleResolve = lastLine(psql(`
      select count(*)::text from public.cooking_methods;
    `));
    expectSqlFailure(`
      begin;
      set local role youtube_extraction_worker;
      set local request.jwt.claims = ${sqlJson(workerClaims(snapshotDigest))};
      select public.resolve_youtube_extraction_job_draft(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${(claim.lease_generation as number) - 1},
        'finalizeFence01',
        (${sqlJson(runtimeResult)})::jsonb
      );
      commit;
    `, /YOUTUBE_EXTRACTION_JOB_STALE/u);
    expect(lastLine(psql(`select count(*)::text from public.cooking_methods;`)))
      .toBe(methodCountBeforeStaleResolve);
    const resolved = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.resolve_youtube_extraction_job_draft(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        'finalizeFence01',
        (${sqlJson(runtimeResult)})::jsonb
      )::text;`,
    );
    runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.update_youtube_extraction_job_title(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        'Provider metadata title'
      )::text;`,
    );
    const draft = resolved.draft as Record<string, unknown>;
    expect(Object.keys(draft).sort()).toEqual([
      "base_servings",
      "blocking_issues",
      "draft_warnings",
      "extraction_id",
      "extraction_methods",
      "ingredients",
      "multi_recipe_status",
      "new_cooking_methods",
      "primary_candidate_id",
      "recipe_candidates",
      "steps",
      "tags",
      "thumbnail_url",
      "title",
    ]);
    expect(draft).toMatchObject({
      title: "Aged kimchi stew",
      base_servings: 2,
      thumbnail_url: "https://i.ytimg.com/vi/finalizeFence01/hqdefault.jpg",
      tags: [],
      extraction_methods: ["description", "caption"],
      draft_warnings: [],
      blocking_issues: [],
      multi_recipe_status: "single",
      primary_candidate_id: null,
      recipe_candidates: [],
      new_cooking_methods: [],
    });
    expect((draft.ingredients as Array<Record<string, unknown>>)[0]).toMatchObject({
      ingredient_id: "90000000-0000-4000-8000-000000000001",
      standard_name: "kimchi",
      amount: 200,
      unit: "g",
      ingredient_type: "QUANT",
      component_label: "stew",
      resolution_status: "resolved",
      sort_order: 1,
    });
    expect((draft.ingredients as Array<Record<string, unknown>>)[0].draft_ingredient_id)
      .toMatch(/^[0-9a-f-]{36}$/u);
    expect((draft.steps as Array<Record<string, unknown>>)[0]).toMatchObject({
      step_number: 1,
      instruction: "Boil the aged kimchi.",
      cooking_method: {
        code: "boil",
        label: "Boil",
        color_key: "red",
        is_new: false,
      },
      duration_text: null,
      is_incomplete: false,
      missing_fields: [],
    });
    const payload = {
      ...resolved,
      raw_source_text: "private transcript must not persist",
      provider_payload: { token: "must-not-persist" },
      worker_permit_generation: permit.permit_generation,
    };
    const stale = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.finalize_youtube_extraction_job(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        (${sqlJson({ ...payload, worker_permit_generation: 0 })})::jsonb
      )::text;`,
    );
    const finalized = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.finalize_youtube_extraction_job(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        (${sqlJson(payload)})::jsonb
      )::text;`,
    );
    const replay = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.finalize_youtube_extraction_job(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        (${sqlJson(payload)})::jsonb
      )::text;`,
    );

    expect(stale).toEqual({ finalized: false });
    expect(finalized).toMatchObject({ applied: true, finalized: true });
    expect(replay).toMatchObject({ applied: true, finalized: true });
    expect(finalized.extraction_session_id).toBe(draft.extraction_id);
    expect(replay.extraction_session_id).toBe(draft.extraction_id);
    expect(lastLine(psql(`
      select count(*)::text
      from public.youtube_extraction_sessions
      where source_job_id = '${claim.job_id}'::uuid
        and user_id = '${ownerA}'::uuid;
    `))).toBe("1");
    expect(parseJson(psql(`
      select json_build_object(
        'session_id', id,
        'draft_extraction_id', draft_json ->> 'extraction_id',
        'draft_ingredient_id', draft_json #>> '{ingredients,0,draft_ingredient_id}'
      )::text
      from public.youtube_extraction_sessions
      where source_job_id = '${claim.job_id}'::uuid;
    `))).toEqual({
      session_id: draft.extraction_id,
      draft_extraction_id: draft.extraction_id,
      draft_ingredient_id: (draft.ingredients as Array<Record<string, unknown>>)[0].draft_ingredient_id,
    });
    expect(parseJson(psql(`
      select json_build_object(
        'raw_source_is_null', raw_source_text is null,
        'provider_payload_absent', not (extraction_meta_json ? 'provider_payload')
      )::text
      from public.youtube_extraction_sessions
      where source_job_id = '${claim.job_id}'::uuid;
    `))).toEqual({
      raw_source_is_null: true,
      provider_payload_absent: true,
    });
    expect(lastLine(psql(`
      select video_title_snapshot
      from public.youtube_extraction_jobs
      where id = '${claim.job_id}'::uuid;
    `))).toBe("Provider metadata title");
  });

  it("keeps the current permit when a stale release generation is presented", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);

    const permit = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extractor_permit(
        '${workerId}',
        120
      )::text;`,
    );
    const staleRelease = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.release_youtube_extractor_permit(
        '${workerId}',
        ${(permit.permit_generation as number) - 1}
      )::text;`,
    );

    expect(staleRelease).toEqual({
      released: false,
      permit_generation: permit.permit_generation,
    });
    expect(parseJson(psql(`
      select json_build_object(
        'owner_id', owner_id,
        'permit_generation', permit_generation
      )::text
      from public.youtube_extractor_permits
      where permit_key = 'primary';
    `))).toEqual({
      owner_id: workerId,
      permit_generation: permit.permit_generation,
    });
  });

  it("requeues permit contention with bounded jitter without consuming an attempt", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000012",
      userId: ownerA,
      videoId: "permitWait001",
      fingerprint: "c".repeat(64),
      status: "queued",
    });
    const claim = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}', '${snapshotDigest}', 120
      )::text;`,
    );
    const stale = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.requeue_youtube_extraction_job_without_attempt(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${(claim.lease_generation as number) - 1},
        2,
        8
      )::text;`,
    );
    const beforeRequeueMs = Date.now();
    const requeued = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.requeue_youtube_extraction_job_without_attempt(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        2,
        8
      )::text;`,
    );
    const state = parseJson(psql(`
      select json_build_object(
        'status', status,
        'attempt_count', attempt_count,
        'lease_cleared', lease_owner is null and lease_expires_at is null,
        'available_at', available_at
      )::text
      from public.youtube_extraction_jobs
      where id = '${claim.job_id}'::uuid;
    `));
    const delayMs = Date.parse(String(state.available_at)) - beforeRequeueMs;

    expect(stale).toEqual({ applied: false, requeued: false });
    expect(requeued).toMatchObject({ applied: true, requeued: true });
    expect(state).toMatchObject({
      status: "queued",
      attempt_count: 0,
      lease_cleared: true,
    });
    expect(delayMs).toBeGreaterThanOrEqual(1_500);
    expect(delayMs).toBeLessThanOrEqual(8_500);
  });

  it("fences title and worker-data writes by the active lease generation", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000013",
      userId: ownerA,
      videoId: "workerData001",
      fingerprint: "d".repeat(64),
      status: "queued",
    });
    const claim = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.claim_youtube_extraction_job(
        '${workerId}', '${snapshotDigest}', 120
      )::text;`,
    );
    const staleTitle = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.update_youtube_extraction_job_title(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${(claim.lease_generation as number) - 1},
        'stale title'
      )::text;`,
    );
    const title = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.update_youtube_extraction_job_title(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        E'  김치\\n찌개  '
      )::text;`,
    );
    const staleEvent = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.record_youtube_extraction_worker_event(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${(claim.lease_generation as number) - 1},
        'transcript',
        '{"provider":"youtube_public_timedtext","status":"success"}'::jsonb
      )::text;`,
    );

    expect(staleTitle).toEqual({ applied: false, updated: false });
    expect(title).toEqual({ applied: true, updated: true });
    expect(staleEvent).toEqual({ applied: false, recorded: false });
    expect(lastLine(psql(`
      select video_title_snapshot
      from public.youtube_extraction_jobs
      where id = '${claim.job_id}'::uuid;
    `))).toBe("김치 찌개");
  });

  it("runs catalog, method, cache, event and durable quota operations only behind the active fence", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    psql(`
      insert into public.ingredients(id, standard_name, category, default_unit)
      values ('82000000-0000-4000-8000-000000000001', '김치', '기타', 'g')
      on conflict (standard_name) do nothing;
      insert into public.ingredient_synonyms(ingredient_id, synonym)
      select id, '묵은지' from public.ingredients where standard_name = '김치'
      on conflict (ingredient_id, synonym) do nothing;
      insert into public.cooking_methods(code, label, color_key, is_system, display_order)
      values ('boil', '끓이기', 'red', true, 1)
      on conflict (code) do nothing;
    `);
    insertJob({
      id: "80000000-0000-4000-8000-000000000014",
      userId: ownerA,
      videoId: "workerData002",
      fingerprint: "e".repeat(64),
      status: "queued",
    });
    const claim = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.claim_youtube_extraction_job('${workerId}', '${snapshotDigest}', 120)::text;
    `);
    const fence = claim.lease_generation as number;
    const catalog = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.read_youtube_extraction_worker_catalog(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}
      )::text;
    `);
    const methods = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.resolve_youtube_extraction_worker_methods(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, array['끓이기', '뜸들이기']
      )::text;
    `);
    const cache = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.access_youtube_extraction_worker_cache(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'transcript_upsert',
        '{"language":"ko","source_provider":"external_transcript_api","source_kind":"transcript","transcript_text":"safe text","segments_json":[],"expires_at":"2099-01-01T00:00:00Z"}'::jsonb
      )::text;
    `);
    const llmCache = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.access_youtube_extraction_worker_cache(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'llm_upsert',
        '{"source_hash":"${"a".repeat(64)}","schema_version":"single-recipe-four-source-v2","model":"gpt-5.4","source_kinds":["description","caption"],"result_json":{"safe":true},"expires_at":"2099-01-01T00:00:00Z"}'::jsonb
      )::text;
    `);
    const visualCache = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.access_youtube_extraction_worker_cache(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'visual_upsert',
        '{"provider":"codex-vision-keyframes","schema_version":"keyframe-final-v44-explicit-action-clause","visual_request_hash":"${"b".repeat(64)}","result_json":{"safe":true},"expires_at":"2099-01-01T00:00:00Z"}'::jsonb
      )::text;
    `);
    const event = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.record_youtube_extraction_worker_event(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'transcript',
        '{"provider":"youtube_public_timedtext","status":"success"}'::jsonb
      )::text;
    `);
    const paidCacheHit = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.record_youtube_extraction_worker_event(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'transcript',
        '{"provider":"external_transcript_api","cache_hit":true,"status":"success","reason":"cache_hit"}'::jsonb
      )::text;
    `);
    const llmEvent = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.record_youtube_extraction_worker_event(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'llm',
        '{"provider":"codex-vision-keyframes","model":"gpt-5.4","cache_hit":false,"status":"success","reason":"i031_exact_cold_execution","input_tokens":0,"output_tokens":0,"estimated_cost_microusd":0}'::jsonb
      )::text;
    `);
    const visualEvent = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.record_youtube_extraction_worker_event(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'visual',
        '{"provider":"codex-vision-keyframes","model":"gpt-5.4","cache_hit":false,"event_type":"success","status":"success","reason":"i031_exact_cold_execution","input_tokens":0,"output_tokens":0,"estimated_cost_microusd":0}'::jsonb
      )::text;
    `);
    const quota = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.reserve_youtube_extraction_worker_quota(
        '${claim.job_id}'::uuid, '${workerId}', ${fence}, 'external_transcript_api', 1
      )::text;
    `);
    const staleCache = runAsJson("youtube_extraction_worker", workerClaims(snapshotDigest), `
      select public.access_youtube_extraction_worker_cache(
        '${claim.job_id}'::uuid, '${workerId}', ${fence - 1}, 'transcript_touch',
        '{"id":"00000000-0000-4000-8000-000000000001"}'::jsonb
      )::text;
    `);

    expect(catalog).toMatchObject({ applied: true });
    expect(catalog.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ standard_name: "김치" }),
    ]));
    expect(methods).toMatchObject({ applied: true });
    expect(methods.methods).toHaveLength(2);
    expect(cache).toMatchObject({ applied: true });
    expect(llmCache).toMatchObject({ applied: true });
    expect(visualCache).toMatchObject({ applied: true });
    expect(event).toEqual({ applied: true, recorded: true });
    expect(paidCacheHit).toEqual({ applied: true, recorded: true });
    expect(llmEvent).toEqual({ applied: true, recorded: true });
    expect(visualEvent).toEqual({ applied: true, recorded: true });
    expect(quota).toMatchObject({ applied: true, reserved: true, used: 1 });
    expect(staleCache).toEqual({ applied: false });
    expect(lastLine(psql(`
      select count(*)::text from public.youtube_transcript_fetch_events
      where user_id = '${ownerA}'::uuid and reason = 'worker_quota_reserved';
    `))).toBe("1");
  });

  it("derives browser read ownership from auth.uid and exposes readiness without service role", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000015",
      userId: ownerA,
      videoId: "ownerRead001",
      fingerprint: "f".repeat(64),
      status: "queued",
    });
    const readiness = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.read_youtube_extraction_enqueue_readiness()::text;
    `);
    const own = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.read_youtube_extraction_job_projection(
        '80000000-0000-4000-8000-000000000015'::uuid
      )::text;
    `);
    const other = runAsJson("authenticated", authenticatedClaims(ownerB), `
      select coalesce(public.read_youtube_extraction_job_projection(
        '80000000-0000-4000-8000-000000000015'::uuid
      ), 'null'::jsonb)::text;
    `);

    expect(readiness).toMatchObject({
      ready: true,
      release_sha: workerReleaseSha,
      schema_identity: workerSchemaIdentity,
      policy_snapshot_digest: snapshotDigest,
      catalog_fingerprint: expectedSchemaDocument.catalog_fingerprint,
    });
    expect(own).toMatchObject({ id: "80000000-0000-4000-8000-000000000015" });
    expect(other).toEqual(null);
  });

  it("reports the previous fingerprint validity window for active and expired rotations", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);

    psql(`
      update private.youtube_extraction_current_policy
      set previous_fingerprint_key_version = '0',
          previous_fingerprint_valid_until = now() + interval '1 hour'
      where policy_key = 'primary';
    `);
    const active = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.read_youtube_extraction_enqueue_readiness()::text;
    `);
    expect(active.previous_fingerprint_key_version).toBe("0");
    expect(Date.parse(String(active.previous_fingerprint_valid_until))).toBeGreaterThan(Date.now());

    psql(`
      update private.youtube_extraction_current_policy
      set previous_fingerprint_valid_until = now() - interval '1 second'
      where policy_key = 'primary';
    `);
    const expired = runAsJson("authenticated", authenticatedClaims(ownerA), `
      select public.read_youtube_extraction_enqueue_readiness()::text;
    `);
    expect(expired.previous_fingerprint_key_version).toBe("0");
    expect(Date.parse(String(expired.previous_fingerprint_valid_until))).toBeLessThan(Date.now());
  });

  it("fails readiness closed for unexpected async tables and prefixed RPCs", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    psql(`
      create table public.youtube_extraction_shadow (id uuid primary key);
      create function public.youtube_extraction_shadow_rpc()
      returns jsonb
      language sql
      stable
      as $function$ select null::jsonb $function$;
    `);
    try {
      const readiness = runAsJson("authenticated", authenticatedClaims(ownerA), `
        select public.read_youtube_extraction_enqueue_readiness()::text;
      `);
      expect(readiness.ready).toBe(false);
      expect(readiness.catalog_fingerprint).not.toBe(expectedSchemaDocument.catalog_fingerprint);
    } finally {
      psql(`
        drop function if exists public.youtube_extraction_shadow_rpc();
        drop table if exists public.youtube_extraction_shadow;
      `);
    }
  });

  it("fails readiness closed when a target table moves to an arbitrary owner", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    const originalOwner = psql(`
      select pg_catalog.pg_get_userbyid(relation.relowner)
      from pg_catalog.pg_class as relation
      where relation.oid = 'public.youtube_extraction_jobs'::regclass;
    `);
    psql(`
      create role unrelated_release_owner nologin noinherit;
      alter table public.youtube_extraction_jobs owner to unrelated_release_owner;
    `);
    try {
      const readiness = runAsJson("authenticated", authenticatedClaims(ownerA), `
        select public.read_youtube_extraction_enqueue_readiness()::text;
      `);
      expect(readiness.ready).toBe(false);
      expect(readiness.catalog_fingerprint).not.toBe(expectedSchemaDocument.catalog_fingerprint);
    } finally {
      psql(`
        alter table public.youtube_extraction_jobs owner to ${originalOwner};
        drop role unrelated_release_owner;
      `);
    }
  });

  it("fails readiness closed when a worker RPC execute grant drifts", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    psql(`
      grant execute on function public.claim_youtube_extraction_job(text, text, integer)
      to authenticated;
    `);
    try {
      const readiness = runAsJson("authenticated", authenticatedClaims(ownerA), `
        select public.read_youtube_extraction_enqueue_readiness()::text;
      `);
      expect(readiness.ready).toBe(false);
      expect(readiness.catalog_fingerprint).not.toBe(expectedSchemaDocument.catalog_fingerprint);
    } finally {
      psql(`
        revoke execute on function public.claim_youtube_extraction_job(text, text, integer)
        from authenticated;
      `);
    }
  });

  it("fails readiness closed when any principal inherits a restricted worker role", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    psql(`
      grant youtube_extraction_worker_rpc_owner to authenticated;
    `);
    try {
      const readiness = runAsJson("authenticated", authenticatedClaims(ownerA), `
        select public.read_youtube_extraction_enqueue_readiness()::text;
      `);
      expect(readiness.ready).toBe(false);
      expect(readiness.catalog_fingerprint).not.toBe(expectedSchemaDocument.catalog_fingerprint);
    } finally {
      psql(`
        revoke youtube_extraction_worker_rpc_owner from authenticated;
      `);
    }
  });

  it("rejects worker preflight and claim when credential validity is at the 30 minute cutoff", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    insertJob({
      id: "80000000-0000-4000-8000-000000000016",
      userId: ownerA,
      videoId: "credCutoff01",
      fingerprint: "1".repeat(64),
      status: "queued",
    });
    psql(`
      update private.youtube_extraction_worker_credentials
      set expires_at = now() + interval '30 minutes'
      where credential_name = 'primary';
    `);
    const claims = workerClaims(snapshotDigest, {
      exp: Math.floor(Date.now() / 1000) + 29 * 60,
    });

    expectSqlFailure(`
      begin;
      set local role youtube_extraction_worker;
      set local request.jwt.claims = ${sqlJson(claims)};
      select public.check_youtube_extraction_worker_pre_request();
      commit;
    `, /YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED/u);
    expectSqlFailure(`
      begin;
      set local role youtube_extraction_worker;
      set local request.jwt.claims = ${sqlJson(claims)};
      select public.claim_youtube_extraction_job('${workerId}', '${snapshotDigest}', 120);
      commit;
    `, /YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED/u);
    expect(parseJson(psql(`
      select json_build_object(
        'status', status,
        'lease_generation', lease_generation,
        'lease_owner', lease_owner
      )::text
      from public.youtube_extraction_jobs
      where id = '80000000-0000-4000-8000-000000000016'::uuid;
    `))).toEqual({
      status: "queued",
      lease_generation: 0,
      lease_owner: null,
    });
  });

  it("rejects wrong worker authority and enforces manager and claim lifetime cutoffs", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const claimSql = `select public.claim_youtube_extraction_job(
      '${workerId}', '${snapshotDigest}', 120
    )::text;`;

    for (const claims of [
      workerClaims(snapshotDigest, { iss: "https://wrong.example" }),
      workerClaims(snapshotDigest, { aud: "wrong-audience" }),
      workerClaims(snapshotDigest, { exp: nowSeconds + 30 * 60 }),
    ]) {
      expectSqlFailure(`
        begin;
        set local role youtube_extraction_worker;
        set local request.jwt.claims = ${sqlJson(claims)};
        ${claimSql}
        commit;
      `, /YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED/u);
    }
    for (const claims of [
      managerClaims({ iss: "https://wrong.example" }),
      managerClaims({ aud: "wrong-audience" }),
      managerClaims({ exp: nowSeconds + 6 * 60 }),
    ]) {
      expectSqlFailure(`
        begin;
        set local role youtube_extraction_credential_manager;
        set local request.jwt.claims = ${sqlJson(claims)};
        select public.rotate_youtube_extraction_worker_credential(
          7, 8, '${nextWorkerJtiHash}', now() + interval '12 hours',
          '${workerReleaseSha}', '${workerSchemaIdentity}', '${snapshotDigest}'
        );
        commit;
      `, /YOUTUBE_EXTRACTION_CREDENTIAL_MANAGER_UNAUTHORIZED/u);
    }
  });

  it("records delivered and seen independently for the matching owner only", () => {
    insertJob({
      id: "80000000-0000-4000-8000-000000000010",
      userId: ownerA,
      videoId: "deliveredSeenA",
      fingerprint: "4".repeat(64),
      status: "failed",
      attemptCount: 3,
      maxAttempts: 3,
      completedAtSql: "now() - interval '1 minute'",
      deliveryKeySql: "'ytasync:a'",
    });
    insertJob({
      id: "80000000-0000-4000-8000-000000000011",
      userId: ownerB,
      videoId: "deliveredSeenB",
      fingerprint: "5".repeat(64),
      status: "failed",
      attemptCount: 3,
      maxAttempts: 3,
      completedAtSql: "now() - interval '1 minute'",
      deliveryKeySql: "'ytasync:b'",
    });

    const delivered = runAsJson(
      "authenticated",
      authenticatedClaims(ownerA),
      `select public.mark_youtube_extraction_jobs_delivered(
        '${ownerA}'::uuid,
        array['ytasync:a', 'ytasync:b']
      )::text;`,
    );
    const seen = runAsJson(
      "authenticated",
      authenticatedClaims(ownerA),
      `select public.mark_youtube_extraction_jobs_seen(
        '${ownerA}'::uuid,
        array[
          '80000000-0000-4000-8000-000000000010'::uuid,
          '80000000-0000-4000-8000-000000000011'::uuid
        ]
      )::text;`,
    );

    expect(delivered).toEqual({ delivered_count: 1 });
    expect(seen).toEqual({ seen_count: 1 });
    expect(parseJson(psql(`
      select json_agg(
        json_build_object(
          'id', id,
          'delivered', completion_delivered_at is not null,
          'seen', completion_seen_at is not null
        )
        order by id
      )::text
      from public.youtube_extraction_jobs
      where id in (
        '80000000-0000-4000-8000-000000000010'::uuid,
        '80000000-0000-4000-8000-000000000011'::uuid
      );
    `))).toEqual([
      {
        id: "80000000-0000-4000-8000-000000000010",
        delivered: true,
        seen: true,
      },
      {
        id: "80000000-0000-4000-8000-000000000011",
        delivered: false,
        seen: false,
      },
    ]);
  });

  it("rotates worker credentials with compare-and-swap generation control", () => {
    enablePolicy();
    const snapshotDigest = policySnapshotDigest();
    configureWorkerCredential(snapshotDigest);

    const rotated = runAsJson(
      "youtube_extraction_credential_manager",
      managerClaims(),
      `select public.rotate_youtube_extraction_worker_credential(
        7,
        8,
        '${nextWorkerJtiHash}',
        now() + interval '12 hours',
        '${workerReleaseSha}',
        '${workerSchemaIdentity}',
        '${snapshotDigest}'
      )::text;`,
    );
    const stale = runAsJson(
      "youtube_extraction_credential_manager",
      managerClaims(),
      `select public.rotate_youtube_extraction_worker_credential(
        7,
        8,
        '${nextWorkerJtiHash}',
        now() + interval '12 hours',
        '${workerReleaseSha}',
        '${workerSchemaIdentity}',
        '${snapshotDigest}'
      )::text;`,
    );

    expect(rotated).toEqual({ rotated: true, current_generation: 8 });
    expect(stale).toEqual({ rotated: false, current_generation: 7 });
  });

  it("enforces unique source_job_id linkage across extraction sessions", () => {
    insertJob({
      id: "80000000-0000-4000-8000-000000000020",
      userId: ownerA,
      videoId: "sourceJob00001",
      fingerprint: "6".repeat(64),
      status: "queued",
    });

    psql(`
      insert into public.youtube_extraction_sessions (
        id,
        user_id,
        youtube_url,
        youtube_video_id,
        classification_status,
        draft_json,
        expires_at,
        session_kind,
        source_job_id
      ) values (
        '81000000-0000-4000-8000-000000000001'::uuid,
        '${ownerA}'::uuid,
        'https://www.youtube.com/watch?v=sourceJob00001',
        'sourceJob00001',
        'recipe',
        '{}'::jsonb,
        now() + interval '1 day',
        'single',
        '80000000-0000-4000-8000-000000000020'::uuid
      );
    `);

    expectSqlFailure(`
      insert into public.youtube_extraction_sessions (
        id,
        user_id,
        youtube_url,
        youtube_video_id,
        classification_status,
        draft_json,
        expires_at,
        session_kind,
        source_job_id
      ) values (
        '81000000-0000-4000-8000-000000000002'::uuid,
        '${ownerA}'::uuid,
        'https://www.youtube.com/watch?v=sourceJob00001',
        'sourceJob00001',
        'recipe',
        '{}'::jsonb,
        now() + interval '1 day',
        'single',
        '80000000-0000-4000-8000-000000000020'::uuid
      );
    `, /youtube_extraction_sessions_source_job_id_unique/u);
  });
});
