import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const enabled = Boolean(databaseUrl || projectId);
const container = `supabase_db_${projectId}`;
const expectedSchema = JSON.parse(readFileSync(
  "scripts/manifests/youtube-extraction-expected-schema.json",
  "utf8",
)) as { catalog_fingerprint: string };

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function psqlFile(file: string, variables: Record<string, string> = {}, prefix = "") {
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1", ...variableArgs, "--file=-",
  ], { input: Buffer.concat([Buffer.from(prefix), readFileSync(file)]), encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function lastJson(output: string) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  return JSON.parse(lines.at(-1)!);
}

function psqlFileAsync(file: string, variables: Record<string, string>) {
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
      "-Atq", "-v", "ON_ERROR_STOP=1", ...variableArgs, "--file=-",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk)); child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject); child.once("close", (code) => code === 0
      ? resolve(Buffer.concat(stdout).toString("utf8").trim())
      : reject(new Error(Buffer.concat(stderr).toString("utf8"))));
    child.stdin.end(readFileSync(file));
  });
}

// The gate supplies a newly replayed, uniquely named container. Never connect
// using the supplied URL: a production loopback URL must not redirect this test.
describe.skipIf(!enabled)("YouTube catalog after all current migrations", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);
    const inspected = spawnSync("docker", ["inspect", container], {
      encoding: "utf8", timeout: 10_000,
    });
    expect(inspected.status, inspected.stderr).toBe(0);
    const [state] = JSON.parse(inspected.stdout) as Array<{
      Config: { Labels: Record<string, string> };
      NetworkSettings: { Ports: Record<string, Array<{ HostPort: string }> | null> };
    }>;
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(projectId);
    expect(state.NetworkSettings.Ports["5432/tcp"]?.map((port) => port.HostPort))
      .toContain(new URL(databaseUrl!).port);
    expect(expectedSchema.catalog_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("matches the release manifest and passes the DB catalog assertion", () => {
    const fingerprint = psql(`
      begin read only;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      select public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
      do $check$ begin
        perform private.assert_youtube_extraction_catalog_ready();
      end $check$;
      rollback;
    `);
    // A fresh replay has a disabled policy and bootstrap credential. Its
    // readiness may be false, but its catalog must already match the release.
    expect(fingerprint).toBe(expectedSchema.catalog_fingerprint);
  });

  it("preserves fractional quantities in the installed resolver amount block", () => {
    const definition = psql(`
      select pg_catalog.pg_get_functiondef(
        'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure
      );
    `);
    const start = definition.indexOf("v_amount_text :=");
    const end = definition.indexOf("v_unit :=", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const amountBlock = definition.slice(start, end);
    // Execute the installed SQL itself, without maintaining a second parser.
    // This isolates amount parsing only; full worker/RPC authority and draft
    // persistence remain covered by the separate policy and worker suites.
    const cases: Array<[string, number | null]> = [
      ["1/2", 0.5], ["1/4", 0.25], ["1 / 2", 0.5], ["1 1/2", 1.5],
      ["0.5", 0.5], ["2", 2], ["1/0", null], ["1/2/3", null],
    ];
    const probes = cases.map(([amount, expected]) => {
      const ingredient = JSON.stringify({ amount }).replaceAll("'", "''");
      return `
        do $quantity$
        declare
          v_ingredient jsonb := '${ingredient}'::jsonb;
          v_amount_text text;
          v_amount_match text;
          v_amount_fraction text[];
          v_amount numeric;
        begin
          ${amountBlock}
          if v_amount is distinct from ${expected ?? "null"}::numeric then
            raise exception 'Unexpected amount for %: expected %, received %',
              v_ingredient->>'amount', ${expected ?? "null"}::numeric, v_amount;
          end if;
        end $quantity$;
      `;
    });
    psql(`begin read only;\n${probes.join("\n")}\nrollback;`);
  });

  it("rejects unreviewed RPC body drift and rolls it back", () => {
    psql(`
      begin;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      do $probe$
      declare
        v_signature regprocedure := 'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure;
        v_original text;
        v_changed text;
        v_before text;
      begin
        v_before := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
        v_original := pg_catalog.pg_get_functiondef(v_signature);
        v_changed := replace(v_original, E'\nbegin\n', E'\nbegin\n  perform 1; -- catalog drift probe\n');
        if v_changed = v_original then
          raise exception 'Catalog drift probe did not change the RPC';
        end if;
        execute v_changed;
        if public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint'
          is not distinct from v_before then
          raise exception 'Catalog fingerprint ignored RPC drift';
        end if;
        begin
          perform private.assert_youtube_extraction_catalog_ready();
          raise exception 'Catalog assertion accepted RPC drift';
        exception when sqlstate '55000' then
          if sqlerrm <> 'YOUTUBE_EXTRACTION_SCHEMA_NOT_READY' then
            raise;
          end if;
        end;
      end $probe$;
      rollback;
    `);
    const fingerprint = psql(`
      begin read only;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      select public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
      rollback;
    `);
    expect(fingerprint).toBe(expectedSchema.catalog_fingerprint);
  });

  it("preserves Luna quantity metadata through the real worker resolver fence", () => {
    const workerId = "trial-quantity-worker";
    const jobId = "13000000-0000-4000-8000-000000000001";
    const ownerId = "13000000-0000-4000-8000-000000000002";
    psql(`
      begin;
      update private.youtube_extraction_current_policy set enabled=true,updated_at=clock_timestamp() where policy_key='primary';
      update private.youtube_extraction_worker_credentials credential
      set current_generation=1,current_jti_hash=repeat('a',64),expires_at=clock_timestamp()+interval '2 hours',
          release_sha=repeat('1',40),schema_identity='youtube-extraction-worker-schema-v2',
          allowed_snapshot_digest=private.youtube_extraction_policy_snapshot_digest(
            policy.extractor_mode,policy.pipeline_identity,policy.result_affecting_options,policy.policy_version)
      from private.youtube_extraction_current_policy policy where credential.credential_name='primary' and policy.policy_key='primary';
      delete from public.youtube_extractor_permits;
      insert into public.youtube_extractor_permits(permit_key,permit_generation) values ('primary',0);
      insert into public.users(id,nickname,social_provider,social_id) values ('${ownerId}','trial-quantity','google','trial-quantity') on conflict (id) do nothing;
      insert into public.youtube_extraction_jobs(
        id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,release_policy_key,
        policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,
        submission_mode,status,attempt_count,max_attempts,available_at
      ) select '${jobId}', '${ownerId}', 'trialbridge', repeat('c',64),policy.fingerprint_key_version,'primary',
        policy.policy_version,private.youtube_extraction_policy_snapshot_digest(policy.extractor_mode,policy.pipeline_identity,policy.result_affecting_options,policy.policy_version),
        policy.extractor_mode,policy.pipeline_identity,policy.result_affecting_options,'background_notify','queued',0,3,clock_timestamp()
      from private.youtube_extraction_current_policy policy where policy.policy_key='primary';
      commit;
    `);
    const digest = psql("select allowed_snapshot_digest from private.youtube_extraction_worker_credentials where credential_name='primary';").split("\n").at(-1)!;
    const claims = JSON.stringify({ role: "youtube_extraction_worker", scope: "youtube-extraction-worker",
      iss: "https://worker.mumeok.kr", aud: "youtube-extraction", jti_hash: "a".repeat(64),
      release_sha: "1".repeat(40), schema_identity: "youtube-extraction-worker-schema-v2",
      allowed_snapshot_digest: digest, generation: 1, exp: Math.floor(Date.now()/1000)+3600 }).replaceAll("'", "''");
    const claim = lastJson(psql(`begin; set local role youtube_extraction_worker; set local request.jwt.claims='${claims}'; select public.claim_youtube_extraction_job('${workerId}','${digest}',300)::text; commit;`));
    const permit = lastJson(psql(`begin; set local role youtube_extraction_worker; set local request.jwt.claims='${claims}'; select public.claim_youtube_extractor_permit('${workerId}',300)::text; commit;`));
    const started = lastJson(psql(`begin; set local role youtube_extraction_worker; set local request.jwt.claims='${claims}'; select public.start_youtube_extraction_attempt('${jobId}','${workerId}',${claim.lease_generation},${permit.permit_generation})::text; commit;`));
    expect(started.started).toBe(true);
    expect(lastJson(psqlFile("tests/sql/youtube-luna-trial-quantity-bridge.sql", {
      job_id: jobId, worker_id: workerId, lease_generation: String(claim.lease_generation),
      permit_generation: String(permit.permit_generation), youtube_video_id: "trialbridge",
    }, `select set_config('request.jwt.claims','${claims}',false);\n`)).status).toBe("PASS");
  });

  it("validates the saved-result postimage, canonical authority, and concurrent ensure", async () => {
    expect(lastJson(psqlFile("tests/sql/youtube-saved-recipe-results-verify.sql")).status).toBe("PASS");
    psqlFile("tests/sql/youtube-saved-recipe-results-isolated-authority-fixture.sql");
    expect(lastJson(psqlFile("tests/sql/youtube-saved-recipe-results-authority-verify.sql")).status).toBe("PASS");
    psqlFile("tests/sql/youtube-saved-recipe-results-concurrency-setup.sql");
    const [left, right] = await Promise.all([
      psqlFileAsync("tests/sql/youtube-saved-recipe-results-concurrency-call.sql", { idempotency_key: "62000000-0000-4000-8000-000000000001" }),
      psqlFileAsync("tests/sql/youtube-saved-recipe-results-concurrency-call.sql", { idempotency_key: "62000000-0000-4000-8000-000000000002" }),
    ]);
    const leftId = left.split("\n").map((line) => line.trim()).filter(Boolean).at(-1)!;
    const rightId = right.split("\n").map((line) => line.trim()).filter(Boolean).at(-1)!;
    expect(leftId).toMatch(/^[0-9a-f-]{36}$/u); expect(rightId).toBe(leftId);
    expect(lastJson(psqlFile("tests/sql/youtube-saved-recipe-results-concurrency-assert.sql")).status).toBe("PASS");
  });
});
