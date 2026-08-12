import { spawnSync } from "node:child_process";

import { beforeEach, describe, expect, it } from "vitest";

import { YOUTUBE_ASYNC_POLICY } from "@/lib/server/youtube-async-extraction";

const enabled =
  process.env.HOMECOOK_YTA_POSTGREST_INTEGRATION === "1";
const postgrestUrl = process.env.HOMECOOK_YTA_POSTGREST_URL ?? "";
const host = process.env.HOMECOOK_YTA_PGHOST ?? "";
const port = process.env.HOMECOOK_YTA_PGPORT ?? "";
const database = process.env.HOMECOOK_YTA_PGDATABASE ?? "";
const workerToken = process.env.HOMECOOK_YTA_WORKER_JWT ?? "";
const managerToken = process.env.HOMECOOK_YTA_MANAGER_JWT ?? "";
const invalidWorkerToken = process.env.HOMECOOK_YTA_INVALID_WORKER_JWT ?? "";

function psql(sql: string) {
  const result = spawnSync(
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
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

async function postgrest(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${postgrestUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
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
    set enabled = true,
        policy_version = ${YOUTUBE_ASYNC_POLICY.policyVersion},
        extractor_mode = '${YOUTUBE_ASYNC_POLICY.extractorMode}',
        pipeline_identity = '${YOUTUBE_ASYNC_POLICY.pipelineIdentity}',
        result_affecting_options = $policy$${JSON.stringify(YOUTUBE_ASYNC_POLICY.resultAffectingOptions)}$policy$::jsonb,
        fingerprint_key_version = '${YOUTUBE_ASYNC_POLICY.fingerprintKeyVersion}',
        previous_fingerprint_key_version = null,
        previous_fingerprint_valid_until = null,
        updated_at = now()
    where policy_key = 'primary';
    update private.youtube_extraction_worker_credentials
    set current_generation = 7,
        current_jti_hash = repeat('a', 64),
        expires_at = now() + interval '1 day',
        release_sha = '1111111111111111111111111111111111111111',
        schema_identity = 'youtube-extraction-worker-schema-v1',
        allowed_snapshot_digest = private.youtube_extraction_policy_snapshot_digest(
          extractor_mode,
          pipeline_identity,
          result_affecting_options,
          policy_version
        ),
        updated_at = now()
    from private.youtube_extraction_current_policy as policy
    where credential_name = 'primary'
      and policy.policy_key = 'primary';
  `);
}

describe.runIf(enabled).sequential("youtube async extraction PostgREST integration", () => {
  beforeEach(() => {
    resetRuntimeState();
  });

  it("allows the restricted worker JWT to call the allowlisted worker RPC", async () => {
    const { response, payload } = await postgrest(
      "POST",
      "/rpc/claim_youtube_extraction_job",
      workerToken,
      {
        worker_id: "worker-alpha",
        allowed_snapshot_digest: psql(`
          select private.youtube_extraction_policy_snapshot_digest(
            extractor_mode,
            pipeline_identity,
            result_affecting_options,
            policy_version
          )
          from private.youtube_extraction_current_policy
          where policy_key = 'primary';
        `).split("\n").at(-1),
        lease_seconds: 120,
      },
    );

    expect(response.status).toBe(200);
    expect(payload).toEqual({ status: "empty", applied: false });
  });

  it("denies the restricted worker JWT direct table reads", async () => {
    const { response, payload } = await postgrest(
      "GET",
      "/youtube_extraction_jobs?select=id",
      workerToken,
    );

    expect(response.ok).toBe(false);
    expect([401, 403]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/42501|permission|unauthorized/i);
  });

  it("denies the restricted worker JWT access to owner-side enqueue RPCs", async () => {
    const { response, payload } = await postgrest(
      "POST",
      "/rpc/enqueue_youtube_extraction_job",
      workerToken,
      {
        video_id: "abc123def45",
        expected_policy_version: 1,
        expected_policy_snapshot_digest: "0".repeat(64),
        current_key_version: "1",
        current_digest: "1".repeat(64),
        previous_key_version: null,
        previous_digest: null,
        submission_mode: "background_notify",
      },
    );

    expect(response.ok).toBe(false);
    expect([401, 403]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/42501|permission|unauthorized/i);
  });

  it("rejects a worker JWT whose pre-request scope no longer matches the credential gate", async () => {
    const { response, payload } = await postgrest(
      "POST",
      "/rpc/claim_youtube_extraction_job",
      invalidWorkerToken,
      {
        worker_id: "worker-alpha",
        allowed_snapshot_digest: "0".repeat(64),
        lease_seconds: 120,
      },
    );

    expect(response.ok).toBe(false);
    expect([401, 403]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/42501|unauthorized/i);
  });

  it("allows the credential-manager JWT only on the rotation RPC surface", async () => {
    const snapshotDigest = psql(`
      select private.youtube_extraction_policy_snapshot_digest(
        extractor_mode,
        pipeline_identity,
        result_affecting_options,
        policy_version
      )
      from private.youtube_extraction_current_policy
      where policy_key = 'primary';
    `).split("\n").at(-1);

    const rotate = await postgrest(
      "POST",
      "/rpc/rotate_youtube_extraction_worker_credential",
      managerToken,
      {
        expected_generation: 7,
        new_generation: 8,
        new_jti_hash: "b".repeat(64),
        new_expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        release_sha: "1111111111111111111111111111111111111111",
        schema_identity: "youtube-extraction-worker-schema-v1",
        allowed_snapshot_digest: snapshotDigest,
      },
    );
    const claim = await postgrest(
      "POST",
      "/rpc/claim_youtube_extraction_job",
      managerToken,
      {
        worker_id: "worker-alpha",
        allowed_snapshot_digest: snapshotDigest,
        lease_seconds: 120,
      },
    );

    expect(rotate.response.status).toBe(200);
    expect(rotate.payload).toMatchObject({ rotated: true, current_generation: 8 });
    expect(claim.response.ok).toBe(false);
    expect([401, 403]).toContain(claim.response.status);
  });
});
