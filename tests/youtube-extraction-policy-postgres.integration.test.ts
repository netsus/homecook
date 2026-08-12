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
  memberships: string[];
  rpc_signatures: string[];
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

function workerClaims(allowedSnapshotDigest: string) {
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
  };
}

function managerClaims() {
  return {
    role: "youtube_extraction_credential_manager",
    scope: "youtube-extraction-credential-manager",
    iss: managerIssuer,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 3600,
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
            'public.youtube_extraction_jobs',
            'public.youtube_extractor_permits'
          )
        ),
        'roles', (
          select json_agg(rolname order by rolname)
          from pg_catalog.pg_roles
          where rolname like 'youtube_extraction%'
        ),
        'memberships', (
          select json_agg(
            member_role.rolname || '->' || granted_role.rolname
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
              'read_youtube_extraction_job_projection',
              'read_youtube_extraction_session_projection',
              'release_youtube_extractor_permit',
              'resolve_youtube_extraction_job_draft',
              'rotate_youtube_extraction_worker_credential',
              'start_youtube_extraction_attempt'
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
            'private.youtube_extraction_worker_credentials'
          ]) as relation_name
          where has_table_privilege(role_name, relation_name, 'SELECT,INSERT,UPDATE,DELETE')
        ),
        'enqueue_owner_minimum',
          has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'public.youtube_extraction_jobs', 'SELECT,INSERT')
          and not has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'public.youtube_extraction_jobs', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          and has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'private.youtube_extraction_current_policy', 'SELECT')
          and not has_table_privilege('youtube_extraction_enqueue_rpc_owner', 'private.youtube_extraction_current_policy', 'INSERT,UPDATE,DELETE'),
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
    const resolved = runAsJson(
      "youtube_extraction_worker",
      workerClaims(snapshotDigest),
      `select public.resolve_youtube_extraction_job_draft(
        '${claim.job_id}'::uuid,
        '${workerId}',
        ${claim.lease_generation as number},
        'finalizeFence01',
        '{"draft":{"title":"김치찌개","ingredients":[],"steps":[]}}'::jsonb
      )::text;`,
    );
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
    expect(lastLine(psql(`
      select count(*)::text
      from public.youtube_extraction_sessions
      where source_job_id = '${claim.job_id}'::uuid
        and user_id = '${ownerA}'::uuid;
    `))).toBe("1");
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

    expect(delivered).toEqual({ updated: 1 });
    expect(seen).toEqual({ updated: 1 });
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
