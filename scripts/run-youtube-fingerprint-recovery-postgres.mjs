#!/usr/bin/env node
// Disposable native PostgreSQL only: Unix socket, no TCP, no inherited PG settings.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINGERPRINT_RECOVERY_STATE_SQL, transitionFingerprintPolicy, classifyFingerprintReconciliation } from "./lib/youtube-fingerprint-recovery.mjs";

const docker17 = process.argv.length === 3 && process.argv[2] === "--docker17";
assert.ok(process.argv.length === 2 || docker17, "Only --docker17 is supported; no external connection options");
const dockerImage = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
let containerId = null;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recoverySource = join(repo, "scripts/lib/youtube-fingerprint-recovery.mjs");
const moduleSha256 = createHash("sha256").update(readFileSync(recoverySource)).digest("hex");
const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const rawCommand = (file, args) => spawnSync(file, args, { env, encoding: "utf8", timeout: 30000 });
const command = (file, args) => containerId
  ? rawCommand("docker", ["exec", containerId, file, ...args]) : rawCommand(file, args);
const required = (file, args) => {
  const result = command(file, args);
  assert.equal(result.status, 0, `Isolated PostgreSQL command failed: ${file}: ${result.stderr}`);
  return result.stdout;
};
const pgConfig = docker17 ? { status: 1 } : command("pg_config", ["--bindir"]);
let bin = docker17 ? null : [pgConfig.status === 0 ? pgConfig.stdout.trim() : "", "/opt/homebrew/opt/postgresql@15/bin", "/usr/local/bin"]
  .find(candidate => candidate && ["initdb", "pg_ctl", "createdb", "psql"].every(tool => existsSync(join(candidate, tool))));
assert.ok(docker17 || bin, "Native PostgreSQL tools required; never fall back to a configured DB");
const root = mkdtempSync("/tmp/hc-yfp-");
const data = join(root, "data"), socket = join(root, "s"), database = "homecook_fingerprint_isolated";
mkdirSync(socket, { mode: 0o700 });
const connection = ["-h", socket, "-p", "5432", "-U", "postgres", "-d", database, "-XAtqw", "-v", "ON_ERROR_STOP=1"];
const sessions = [];
let started = false;
let sequence = 0;
let finalReport;

function openSession(label) {
  const name = `yfp-${++sequence}-${label}`;
  const child = containerId
    ? spawn("docker", ["exec", "-i", "-e", `PGAPPNAME=${name}`, containerId, join(bin, "psql"), ...connection], { env, stdio: ["pipe", "pipe", "pipe"] })
    : spawn(join(bin, "psql"), connection, { env: { ...env, PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"] });
  let pending, buffer = "", stderr = "", exited = false;
  const closed = new Promise(resolveClosed => {
    child.on("error", () => { exited = true; pending?.reject(new Error("Isolated psql failed")); resolveClosed(null); });
    child.on("close", code => {
      exited = true;
      const known = stderr.match(/POLICY_CHANGED|RATE_LIMITED|VALIDATION_ERROR|ENQUEUE_UNAUTHORIZED|duplicate key value/iu)?.[0] ?? "SQL_ERROR";
      pending?.reject(new Error(`Isolated psql: ${known}`, { cause: new Error(stderr) })); resolveClosed(code);
    });
  });
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-16000); });
  child.stdout.on("data", bytes => {
    buffer += bytes.toString();
    if (buffer.length > 4 * 1024 * 1024) { pending?.reject(new Error("Isolated output bound")); child.kill(); return; }
    if (pending && buffer.includes(`${pending.marker}\n`)) {
      const position = buffer.indexOf(`${pending.marker}\n`), task = pending;
      pending = undefined; task.resolve(buffer.slice(0, position).trim());
      buffer = buffer.slice(position + task.marker.length + 1);
    }
  });
  const session = {
    name,
    query(sql) {
      assert.ok(!pending && !exited, "Isolated session unavailable");
      const marker = `yfp_${randomUUID().replaceAll("-", "")}`;
      let timer;
      return new Promise((resolveQuery, reject) => {
        timer = setTimeout(() => { child.kill(); reject(new Error("Isolated SQL time budget")); }, 15000);
        pending = { marker, resolve: resolveQuery, reject };
        child.stdin.write(`${sql}\nSELECT '${marker}';\n`);
      }).finally(() => clearTimeout(timer));
    },
    async close() { if (!exited) child.stdin.end(); return closed; },
    stop() { if (!exited) child.kill(); },
  };
  sessions.push(session); return session;
}
const literal = text => `'${String(text).replaceAll("'", "''")}'`;
const uuid = n => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = uuid(10), admin = uuid(20), retainedOwner = uuid(30), legacyV2Owner = uuid(40);
const originalV2Count = 33;
const fingerprint = text => createHash("sha256").update(`fake-test:${text}`).digest("hex");
const fixture = JSON.parse(readFileSync(join(repo, "tests/fixtures/youtube-fingerprint-recovery-production-contract.json"), "utf8"));
const pins = { enqueue: "27f2e32dbf5062e4d1697c4fee51a400b08896188644a159bf8282e721d961c9",
  snapshotDigest: "8589919e7e4b0347b3a7d6c1b88b87a1a1d14ff2a2099b882846169e817c6f9b",
  activeDedupeIndex: "5473a66a36f7059cbfa991d3e85c5ebd8d94c53a210f9ffb3ca05489c105f4aa" };
for (const [key, pin] of Object.entries(pins)) assert.equal(createHash("sha256").update(fixture[key]).digest("hex"), pin, `Contract pin: ${key}`);

const bootstrap = `
CREATE SCHEMA private; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.users(id uuid PRIMARY KEY);
CREATE TABLE public.admin_members(user_id uuid PRIMARY KEY REFERENCES public.users(id));
CREATE TABLE public.youtube_extraction_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users(id),
 youtube_video_id varchar(20) NOT NULL,request_fingerprint text NOT NULL,request_fingerprint_key_version text NOT NULL,
 release_policy_key text NOT NULL,policy_version bigint NOT NULL,policy_snapshot_digest text NOT NULL,
 extractor_mode text NOT NULL,pipeline_identity text NOT NULL,result_affecting_options jsonb NOT NULL DEFAULT '{}',
 submission_mode text NOT NULL,status text NOT NULL DEFAULT 'queued',attempt_count integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 3,available_at timestamptz NOT NULL DEFAULT now(),
 progress_attempt integer NOT NULL DEFAULT 0,progress_stage text NOT NULL DEFAULT 'queued',
 progress_stage_started_at timestamptz,progress_updated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 completion_delivery_key text UNIQUE,extraction_session_id uuid,
 CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),CHECK(policy_snapshot_digest ~ '^[0-9a-f]{64}$'),
 CHECK(status IN ('queued','processing','succeeded','failed')),
 CHECK((status IN ('queued','processing') AND completed_at IS NULL) OR (status IN ('succeeded','failed') AND completed_at IS NOT NULL)));
CREATE TABLE private.youtube_extraction_current_policy(policy_key text PRIMARY KEY,policy_version bigint NOT NULL,
 extractor_mode text NOT NULL,pipeline_identity text NOT NULL,result_affecting_options jsonb NOT NULL,
 fingerprint_key_version text NOT NULL,previous_fingerprint_key_version text,previous_fingerprint_valid_until timestamptz,
 enabled boolean NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE private.youtube_extraction_worker_credentials(credential_name text PRIMARY KEY,current_generation bigint NOT NULL);
CREATE TABLE public.youtube_extractor_permits(permit_key text PRIMARY KEY,owner_id text,expires_at timestamptz);
CREATE TABLE public.ordinary_fixture(id integer PRIMARY KEY,value text NOT NULL);
-- Only catalog readiness is stubbed. Enqueue's real authenticated-claims guard remains intact.
CREATE FUNCTION private.assert_youtube_extraction_catalog_ready() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
${fixture.snapshotDigest};
${fixture.enqueue};
${fixture.activeDedupeIndex};
INSERT INTO public.users VALUES (${literal(owner)}),(${literal(admin)}),(${literal(retainedOwner)}),(${literal(legacyV2Owner)});
INSERT INTO public.admin_members VALUES (${literal(admin)});
INSERT INTO private.youtube_extraction_worker_credentials VALUES ('fixture',49);
INSERT INTO public.youtube_extractor_permits VALUES ('primary',NULL,NULL);
INSERT INTO public.ordinary_fixture VALUES(1,'unchanged');
`;

const policyDigest = `(SELECT private.youtube_extraction_policy_snapshot_digest(extractor_mode,pipeline_identity,result_affecting_options,policy_version) FROM private.youtube_extraction_current_policy WHERE policy_key='primary')`;
const claims = user => `SELECT set_config('request.jwt.claims',${literal(JSON.stringify({ role: "authenticated", sub: user }))},false);`;
const enqueueSql = (user, video, version = "2") => `${claims(user)}
 SELECT public.enqueue_youtube_extraction_job(${literal(video)},3,${policyDigest},${literal(version)},${literal(fingerprint(video))},NULL,NULL,'background_notify');`;
const enqueue = async (session, user, video, version = "2") => JSON.parse((await session.query(enqueueSql(user, video, version))).split("\n").at(-1));
const state = async session => JSON.parse(await session.query(FINGERPRINT_RECOVERY_STATE_SQL));
const protectedSql = `SELECT jsonb_build_object(
 'oldFortyOne',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]') FROM public.youtube_extraction_jobs j WHERE user_id IN (${literal(retainedOwner)},${literal(legacyV2Owner)})),
 'credentials',(SELECT jsonb_agg(to_jsonb(c)) FROM private.youtube_extraction_worker_credentials c),
 'permit',(SELECT jsonb_agg(to_jsonb(p)) FROM public.youtube_extractor_permits p),
 'ordinary',(SELECT jsonb_agg(to_jsonb(o)) FROM public.ordinary_fixture o));`;
const observer = async query => JSON.parse(await query(protectedSql));
const results = [];
async function test(name, run) { await run(); results.push(name); process.stdout.write(`PASS ${name}\n`); }
async function waitFor(query, predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (predicate(await query())) return; await new Promise(resolveWait => setTimeout(resolveWait, 25)); }
  throw new Error(`Expected concurrent wait not observed: ${label}`);
}
async function guardedSession(label) {
  const session = openSession(label);
  const safe = await session.query(`SELECT current_database()=${literal(database)} AND inet_server_addr() IS NULL
    AND current_setting('data_directory')=${literal(data)} AND current_setting('unix_socket_directories')=${literal(socket)}
    AND current_setting('listen_addresses')='';`);
  assert.equal(safe, "t", "Private no-TCP target identity"); return session;
}

try {
  if (docker17) {
    const image = rawCommand("docker", ["image", "inspect", "--format", "{{.Id}}", dockerImage]);
    assert.equal(image.status, 0, "Pinned PostgreSQL17 image must already exist locally; no pull allowed");
    const created = rawCommand("docker", ["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres",
      "--name", `homecook-yfp17-disposable-${randomUUID()}`, "--label", "homecook.test=youtube-fingerprint-recovery",
      "--entrypoint", "/bin/sh", dockerImage, "-c", "exec sleep infinity"]);
    assert.equal(created.status, 0, "Could not create owned no-network PostgreSQL17 container");
    containerId = created.stdout.trim(); assert.match(containerId, /^[a-f0-9]{64}$/u);
    const inspected = rawCommand("docker", ["inspect", "--format", "{{json .}}", containerId]);
    assert.equal(inspected.status, 0); const owned = JSON.parse(inspected.stdout);
    assert.equal(owned.Image, image.stdout.trim()); assert.equal(owned.HostConfig.NetworkMode, "none");
    assert.equal(owned.Mounts.length, 0); assert.equal(Object.keys(owned.HostConfig.PortBindings ?? {}).length, 0);
    assert.equal(owned.Config.Labels["homecook.test"], "youtube-fingerprint-recovery");
    bin = dirname(required("/bin/sh", ["-c", "command -v initdb"]).trim());
    assert.ok(bin.startsWith("/"), "Owned container PostgreSQL tools unavailable");
    required("mkdir", ["-m", "700", "-p", root, socket]);
  }
  required(join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth-local=trust", "--auth-host=reject", "--no-locale"]);
  required(join(bin, "pg_ctl"), ["-D", data, "-o", `-p 5432 -h '' -k ${socket}`, "-l", join(root, "postgres.log"), "-w", "start"]);
  started = true;
  required(join(bin, "createdb"), ["-h", socket, "-p", "5432", "-U", "postgres", database]);
  const base = await guardedSession("base"); await base.query(bootstrap);
  async function reset(version = "1") {
    await base.query(`TRUNCATE public.youtube_extraction_jobs; DELETE FROM private.youtube_extraction_current_policy;
      INSERT INTO private.youtube_extraction_current_policy VALUES('primary',3,'codex_cli',repeat('a',64),'{"singleRecipeOnly":true}',${literal(version)},NULL,NULL,true,'2026-01-01T00:00:00Z');
      INSERT INTO public.youtube_extraction_jobs(id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,
       release_policy_key,policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,submission_mode,status,completed_at,created_at,completion_delivery_key,extraction_session_id)
      SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,${literal(retainedOwner)},'old-'||n,md5(n::text)||md5(n::text),'1',
       'primary',3,${policyDigest},'codex_cli',repeat('a',64),'{}','background_notify',CASE WHEN n=8 THEN 'failed' ELSE 'succeeded' END,
       '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','old-delivery-'||n,gen_random_uuid() FROM generate_series(1,8) AS n;
      INSERT INTO public.youtube_extraction_jobs(id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,
       release_policy_key,policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,submission_mode,status,completed_at,created_at,completion_delivery_key,extraction_session_id)
      SELECT ('80000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,${literal(legacyV2Owner)},'legacy-v2-'||n,md5('v2-'||n)||md5('v2-'||n),'2',
       'primary',3,${policyDigest},'codex_cli',repeat('a',64),'{}','background_notify',CASE WHEN n<=24 THEN 'succeeded' ELSE 'failed' END,
       '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','legacy-v2-delivery-'||n,gen_random_uuid() FROM generate_series(1,33) AS n;`);
  }
  const change = async (session, expected, direction = "apply", observePreserved = observer) => {
    const journal = [];
    const record = await transitionFingerprintPolicy({ session, expected, direction, observePreserved, publish: async (phase, value) => { journal.push({ phase, value }); } });
    return { record, journal };
  };
  await test("exact enqueue/digest/index definitions installed", async () => {
    for (const [key, query] of Object.entries({ enqueue: "pg_get_functiondef('public.enqueue_youtube_extraction_job(text,bigint,text,text,text,text,text,text)'::regprocedure)",
      snapshotDigest: "pg_get_functiondef('private.youtube_extraction_policy_snapshot_digest(text,text,jsonb,bigint)'::regprocedure)",
      activeDedupeIndex: "pg_get_indexdef('public.youtube_extraction_jobs_active_dedupe_uidx'::regclass)" })) {
      const actual = await base.query(`SELECT encode(sha256(convert_to(${query},'UTF8')),'hex');`);
      assert.equal(actual, pins[key], `Installed definition ${key}`);
    }
  });
  await test("exact enqueue claims guard rejects a service-role claim", async () => {
    const session = await guardedSession("unauthorized");
    await assert.rejects(session.query(`SELECT set_config('request.jwt.claims',${literal(JSON.stringify({ role: "service_role", sub: owner }))},false);
      SELECT public.enqueue_youtube_extraction_job('unauthorized',3,repeat('a',64),'1',repeat('b',64),NULL,NULL,'background_notify');`), /ENQUEUE_UNAUTHORIZED/u);
    assert.equal(await base.query("SELECT count(*) FROM public.youtube_extraction_jobs;"), "0");
  });
  await test("unexpired held permit rejects transition even with no active job", async () => {
    await reset(); await base.query("UPDATE public.youtube_extractor_permits SET owner_id='fake-worker',expires_at=clock_timestamp()+interval '1 hour';");
    const expected = await state(base); assert.equal(expected.activeCount, 0); assert.equal(expected.permitHeld, true);
    await assert.rejects(change(await guardedSession("permit-reject"), expected), /rejected-before-commit/u);
    assert.equal((await state(base)).policy.fingerprint_key_version, "1");
    await base.query("UPDATE public.youtube_extractor_permits SET owner_id=NULL,expires_at=NULL;");
  });
  await test("V1 active rejects with original V1 eight and V2 thirty-three preserved", async () => {
    await reset(); const before = await observer(base.query); await enqueue(base, owner, "active-v1", "1");
    const session = await guardedSession("active-reject");
    await assert.rejects(change(session, await state(base)), /rejected-before-commit/u);
    assert.equal((await state(base)).policy.fingerprint_key_version, "1"); assert.deepEqual(await observer(base.query), before);
  });
  await test("slow V1 enqueue race is visible after exclusive lock with fresh RC snapshot", async () => {
    await reset(); const expected = await state(base), before = await observer(base.query);
    const writer = await guardedSession("slow-writer"), transition = await guardedSession("slow-transition");
    await writer.query("BEGIN;"); await enqueue(writer, owner, "late-v1", "1");
    const pending = change(transition, expected); const rejected = assert.rejects(pending, /rejected-before-commit/u);
    await waitFor(() => base.query(`SELECT wait_event_type||':'||wait_event FROM pg_stat_activity WHERE application_name=${literal(transition.name)};`), value => value === "Lock:advisory", "exclusive advisory lock");
    await writer.query("COMMIT;"); await rejected;
    assert.equal((await state(base)).activeCount, 1); assert.equal((await state(base)).policy.fingerprint_key_version, "1");
    assert.deepEqual(await observer(base.query), before);
  });
  await test("stale full-row CAS rejects without changing policy", async () => {
    await reset(); const expected = await state(base);
    await base.query("UPDATE private.youtube_extraction_current_policy SET updated_at=updated_at+interval '1 second';");
    await assert.rejects(change(await guardedSession("cas"), expected), /rejected-before-commit/u);
    assert.equal((await state(base)).policy.fingerprint_key_version, "1");
  });
  await test("transition holds four table locks and preserves old41/ordinary/credentials/permit", async () => {
    await reset(); const expected = await state(base), before = await observer(base.query);
    const session = await guardedSession("success");
    const changed = await change(session, expected, "apply", async query => {
      assert.equal(await query("SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND mode='ShareRowExclusiveLock' AND granted;"), "4");
      return observer(query);
    });
    assert.equal(changed.record.after.policy.fingerprint_key_version, "2"); assert.deepEqual(await observer(base.query), before);
    assert.equal(changed.record.before.v2Count, originalV2Count); assert.equal(changed.record.after.v2Count, originalV2Count);
    assert.equal(before.oldFortyOne.length, 41);
    assert.equal(await base.query("SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2' AND status='succeeded';"), "24");
    assert.equal(await base.query("SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2' AND status='failed';"), "9");
    assert.deepEqual(changed.journal.map(row => row.phase), ["intent", "commit-dispatch", "committed"]);
    assert.equal(changed.record.before.jobsSha256, changed.record.after.jobsSha256);
  });
  await test("stale V1 after switch returns POLICY_CHANGED and inserts nothing", async () => {
    const before = await state(base); await assert.rejects(enqueue(await guardedSession("stale"), owner, "stale-v1", "1"), /POLICY_CHANGED/u);
    assert.equal((await state(base)).jobsSha256, before.jobsSha256);
  });
  await test("overlapping V2 double enqueue deduplicates to one job", async () => {
    const first = await guardedSession("double-first"), second = await guardedSession("double-second");
    await first.query("BEGIN;"); const one = await enqueue(first, owner, "double-v2");
    const pending = enqueue(second, owner, "double-v2");
    await waitFor(() => base.query(`SELECT wait_event_type||':'||wait_event FROM pg_stat_activity WHERE application_name=${literal(second.name)};`), value => value === "Lock:advisory", "per-owner dedupe lock");
    await first.query("COMMIT;"); const two = await pending;
    assert.equal(two.job_id, one.job_id); assert.equal(two.deduplicated, true);
    assert.equal(await base.query("SELECT count(*) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2';"), String(originalV2Count + 1));
  });
  await test("terminal resubmission creates a new job without rewriting the completed one", async () => {
    const session = await guardedSession("resubmit"), original = await enqueue(session, owner, "double-v2");
    await base.query(`UPDATE public.youtube_extraction_jobs SET status='failed',completed_at=clock_timestamp() WHERE id=${literal(original.job_id)};`);
    const old = await base.query(`SELECT to_jsonb(j) FROM public.youtube_extraction_jobs j WHERE id=${literal(original.job_id)};`);
    const next = await enqueue(session, owner, "double-v2"); assert.notEqual(next.job_id, original.job_id); assert.equal(next.deduplicated, false);
    assert.equal(await base.query(`SELECT to_jsonb(j) FROM public.youtube_extraction_jobs j WHERE id=${literal(original.job_id)};`), old);
  });
  await test("daily quota counts V1 and V2 together; admin daily exception preserves active cap", async () => {
    await reset("2");
    const normal = await guardedSession("quota-normal");
    for (let n = 0; n < 10; n++) {
      await base.query(`UPDATE private.youtube_extraction_current_policy SET fingerprint_key_version=${literal(n % 2 ? "2" : "1")};`);
      const job = await enqueue(normal, owner, `quota-${n}`, n % 2 ? "2" : "1");
      await base.query(`UPDATE public.youtube_extraction_jobs SET status='failed',completed_at=clock_timestamp() WHERE id=${literal(job.job_id)};`);
    }
    await base.query("UPDATE private.youtube_extraction_current_policy SET fingerprint_key_version='2';");
    await assert.rejects(enqueue(normal, owner, "eleventh"), /RATE_LIMITED/u);
    const adminSession = await guardedSession("quota-admin");
    for (let n = 0; n < 11; n++) { const job = await enqueue(adminSession, admin, `admin-${n}`);
      await base.query(`UPDATE public.youtube_extraction_jobs SET status='failed',completed_at=clock_timestamp() WHERE id=${literal(job.job_id)};`); }
    await enqueue(adminSession, admin, "active-admin-1"); await enqueue(adminSession, admin, "active-admin-2");
    await assert.rejects(enqueue(adminSession, admin, "active-admin-3"), /RATE_LIMITED/u);
  });
  await test("new V2 terminal beyond original33 rejects compensation and forces forward fix", async () => {
    await reset(); const applied = await change(await guardedSession("apply-for-compensation"), await state(base));
    const job = await enqueue(base, owner, "terminal-v2");
    await base.query(`UPDATE public.youtube_extraction_jobs SET status='failed',completed_at=clock_timestamp() WHERE id=${literal(job.job_id)};`);
    const observed = await state(base); assert.equal(observed.v2Count, originalV2Count + 1);
    assert.equal(classifyFingerprintReconciliation({ expected: applied.record.before, dispatch: applied.record, observed }), "committed-with-new-work");
    await assert.rejects(change(await guardedSession("terminal-compensation"), observed, "compensate"), /rejected-before-commit/u);
    assert.equal((await state(base)).policy.fingerprint_key_version, "2");
  });
  await test("compensation with only original33 V2 restores only policy version/time", async () => {
    await reset(); await change(await guardedSession("empty-apply"), await state(base));
    const before = await state(base); const restored = await change(await guardedSession("empty-compensate"), before, "compensate");
    assert.equal(restored.record.after.policy.fingerprint_key_version, "1"); assert.equal(restored.record.before.jobsSha256, restored.record.after.jobsSha256);
  });
  assert.equal(createHash("sha256").update(readFileSync(recoverySource)).digest("hex"), moduleSha256, "Recovery module changed during validation");
  const serverVersion = await base.query("SHOW server_version;");
  if (docker17) assert.match(serverVersion, /^17\./u, "Pinned container must run PostgreSQL17");
  finalReport = { passed: results.length, failed: 0, isolated: true, serverVersion,
    execution: docker17 ? "owned Docker; no network/mount/port; existing pinned image" : "native",
    ...(docker17 ? { image: dockerImage } : {}),
    transport: "private Unix socket; no TCP", originalHistory: { v1Terminal: 8, v2Terminal: originalV2Count, v2Succeeded: 24, v2Failed: 9, fullRowsPreserved: 41 }, contractPins: pins, moduleSha256,
    limitations: ["Synthetic tables/data", "Catalog assertion stubbed", "No PostgREST/production RLS/real authentication validation", "No worker or model call", "No production state read or mutation"] };
} finally {
  for (const session of sessions) session.stop();
  await Promise.allSettled(sessions.map(session => session.close()));
  try {
    if (started) required(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"]);
  } finally {
    try {
      if (containerId) {
        const removed = rawCommand("docker", ["rm", "-f", containerId]);
        assert.equal(removed.status, 0, "Owned disposable container cleanup failed");
        assert.notEqual(rawCommand("docker", ["inspect", containerId]).status, 0, "Owned container remains after cleanup");
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
}
process.stdout.write(JSON.stringify({ ...finalReport, cleanupCompleted: true }) + "\n");
