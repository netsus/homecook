#!/usr/bin/env node
// Owned disposable PG17, no network/ports/volumes and no inherited PG credentials.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {V85,V85_BEGIN_SQL,V85_LOCK_SQL,buildV85RegistrationSql} from './lib/youtube-v85-cutover.mjs';
import {DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS} from './lib/youtube-extraction-worker-artifact.mjs';
assert.equal(process.argv.length,2,'No external connection options accepted');
const docker17=true,dockerImage='public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a';
let containerId=null;const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
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
const root = mkdtempSync("/tmp/hc-yv85-");
const data = join(root, "data"), socket = join(root, "s"), database = "homecook_v85_isolated";
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
const literal=v=>`'${String(v).replaceAll("'","''")}'`;
const migration=readFileSync(join(repo,'supabase/migrations/20260812160000_youtube_async_extraction_notification.sql'),'utf8');
const start=migration.indexOf('create or replace function public.rotate_youtube_extraction_worker_credential(');
const end=migration.indexOf('$function$;',start)+'$function$;'.length;
assert.ok(start>0&&end>start,'Exact existing rotation RPC required');
const rotate=migration.slice(start,end);
const snapshot=JSON.parse(readFileSync(join(repo,'tests/fixtures/youtube-fingerprint-recovery-production-contract.json'),'utf8')).snapshotDigest;
const bootstrap=`CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE youtube_extraction_credential_manager NOLOGIN;
CREATE TABLE private.youtube_extraction_current_policy(policy_key text PRIMARY KEY,policy_version bigint,extractor_mode text,pipeline_identity text,result_affecting_options jsonb,
 fingerprint_key_version text,previous_fingerprint_key_version text,previous_fingerprint_valid_until timestamptz,enabled boolean,updated_at timestamptz);
CREATE TABLE private.youtube_extraction_worker_credentials(credential_name text PRIMARY KEY,current_generation bigint,current_jti_hash text,expires_at timestamptz,release_sha text,schema_identity text,allowed_snapshot_digest text,updated_at timestamptz);
CREATE TABLE public.youtube_extraction_jobs(id integer PRIMARY KEY,status text,payload jsonb);
CREATE TABLE public.youtube_extractor_permits(permit_key text PRIMARY KEY,owner_id text,expires_at timestamptz);
CREATE TABLE private.recipe_product_only_write_control(flag boolean);CREATE TABLE private.cooked_batch_weight_evidence_control(flag boolean);
CREATE TABLE private.quantity_input_v4_policy(flag boolean);CREATE TABLE private.cooked_weight_user_attestation_control(flag boolean);
CREATE TABLE public.ordinary_rows(id integer PRIMARY KEY,payload text);
INSERT INTO public.ordinary_rows VALUES(1,'unchanged');
INSERT INTO public.youtube_extraction_jobs SELECT n,'succeeded',jsonb_build_object('fake',n,'fingerprintVersion',CASE WHEN n<=8 THEN '1' ELSE '2' END) FROM generate_series(1,42)n;
INSERT INTO public.youtube_extractor_permits VALUES('primary',NULL,NULL);
INSERT INTO private.recipe_product_only_write_control VALUES(true);INSERT INTO private.cooked_batch_weight_evidence_control VALUES(true);
INSERT INTO private.quantity_input_v4_policy VALUES(true);INSERT INTO private.cooked_weight_user_attestation_control VALUES(true);
${snapshot};${rotate}
REVOKE ALL ON FUNCTION public.rotate_youtube_extraction_worker_credential(bigint,bigint,text,timestamptz,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_youtube_extraction_worker_credential(bigint,bigint,text,timestamptz,text,text,text) TO youtube_extraction_credential_manager;`;
const results=[];async function test(name,fn){await fn();results.push(name);process.stdout.write(`PASS ${name}\n`);}
function credentials(){const iat=Math.floor(Date.now()/1000),metadata={generation:50,jti_sha256:'b'.repeat(64),expires_at:V85.expiresAt,release_sha:V85.releaseSha,schema_identity:V85.schemaIdentity,allowed_snapshot_digest:V85.snapshotDigest};
 const claims={role:'youtube_extraction_worker',scope:'youtube-extraction-worker',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',generation:50,jti_hash:metadata.jti_sha256,release_sha:metadata.release_sha,schema_identity:metadata.schema_identity,allowed_snapshot_digest:metadata.allowed_snapshot_digest,iat,exp:Date.parse(metadata.expires_at)/1000};
 const managerClaims={role:'youtube_extraction_credential_manager',scope:'youtube-extraction-credential-manager',iss:claims.iss,aud:claims.aud,jti_hash:'c'.repeat(64),iat,exp:iat+250};return {claims,metadata,managerClaims};}
async function waitBlocked(base,name){for(let i=0;i<100;i++){if((await base.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${literal(name)} AND wait_event_type='Lock');`))==='t')return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected isolated lock wait');}
try{
    const image = rawCommand("docker", ["image", "inspect", "--format", "{{.Id}}", dockerImage]);
    assert.equal(image.status, 0, "Pinned PostgreSQL17 image must already exist locally; no pull allowed");
    const created = rawCommand("docker", ["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres",
      "--name", `homecook-yv85-disposable-${randomUUID()}`, "--label", "homecook.test=youtube-v85-cutover",
      "--entrypoint", "/bin/sh", dockerImage, "-c", "exec sleep infinity"]);
    assert.equal(created.status, 0, "Could not create owned no-network PostgreSQL17 container");
    containerId = created.stdout.trim(); assert.match(containerId, /^[a-f0-9]{64}$/u);
    const inspected = rawCommand("docker", ["inspect", "--format", "{{json .}}", containerId]);
    assert.equal(inspected.status, 0); const owned = JSON.parse(inspected.stdout);
    assert.equal(owned.Image, image.stdout.trim()); assert.equal(owned.HostConfig.NetworkMode, "none");
    assert.equal(owned.Mounts.length, 0); assert.equal(Object.keys(owned.HostConfig.PortBindings ?? {}).length, 0);
    assert.equal(owned.Config.Labels["homecook.test"], "youtube-v85-cutover");
    bin = dirname(required("/bin/sh", ["-c", "command -v initdb"]).trim());
    assert.ok(bin.startsWith("/"), "Owned container PostgreSQL tools unavailable");
    required("mkdir", ["-m", "700", "-p", root, socket]);
  required(join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth-local=trust", "--auth-host=reject", "--no-locale"]);
  required(join(bin, "pg_ctl"), ["-D", data, "-o", `-p 5432 -h '' -k ${socket}`, "-l", join(root, "postgres.log"), "-w", "start"]);
  started = true;
  required(join(bin, "createdb"), ["-h", socket, "-p", "5432", "-U", "postgres", database]);
  const base=openSession('base');await base.query(bootstrap);
  async function reset(){await base.query(`DELETE FROM private.youtube_extraction_current_policy;DELETE FROM private.youtube_extraction_worker_credentials;
INSERT INTO private.youtube_extraction_current_policy VALUES('primary',3,'i031_codex_vision',${literal(V85.predecessorPipelineIdentity)},${literal(JSON.stringify(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS))}::jsonb,'2',NULL,NULL,false,'2026-01-01T00:00:00Z');
INSERT INTO private.youtube_extraction_worker_credentials VALUES('primary',49,repeat('a',64),${literal(V85.expiresAt)},${literal(V85.predecessorReleaseSha)},${literal(V85.schemaIdentity)},${literal(V85.predecessorSnapshotDigest)},'2026-01-01T00:00:00Z');UPDATE public.youtube_extraction_jobs SET status='succeeded';`);}
  const state=async()=>JSON.parse(await base.query(`SELECT jsonb_build_object('credential',(SELECT to_jsonb(c) FROM private.youtube_extraction_worker_credentials c),'policy',(SELECT to_jsonb(p) FROM private.youtube_extraction_current_policy p),'jobs',(SELECT md5(jsonb_agg(to_jsonb(j)ORDER BY id)::text)FROM public.youtube_extraction_jobs j),'ordinary',(SELECT md5(jsonb_agg(to_jsonb(t))::text)FROM public.ordinary_rows t));`));
  async function locked(s){await s.query(V85_BEGIN_SQL);await s.query(V85_LOCK_SQL);assert.equal(await s.query("SELECT current_generation FROM private.youtube_extraction_worker_credentials;"),'49','Fresh CAS preimage');assert.equal(await s.query("SELECT count(*) FROM public.youtube_extraction_jobs WHERE status IN ('queued','processing');"),'0','Fresh drain');}
  await test('real existing rotation RPC preserves42 V1/V2 jobs and ordinary rows',async()=>{await reset();const before=await state(),s=openSession('rotate');await locked(s);await s.query(buildV85RegistrationSql(credentials()));await s.query('COMMIT;');const after=await state();assert.equal(after.credential.current_generation,50);assert.equal(after.policy.pipeline_identity,V85.pipelineIdentity);assert.equal(after.policy.fingerprint_key_version,'2');assert.equal(after.policy.previous_fingerprint_key_version,null);assert.equal(after.jobs,before.jobs);assert.equal(after.ordinary,before.ordinary);assert.equal(Date.parse(after.credential.expires_at),Date.parse(V85.expiresAt));});
  await test('concurrent loser sees committed50 after exclusive advisory lock and cannot rotate',async()=>{await reset();const a=openSession('winner'),b=openSession('loser');await locked(a);const waiting=b.query(V85_BEGIN_SQL);await waitBlocked(base,b.name);await a.query(buildV85RegistrationSql(credentials()));await a.query('COMMIT;');await waiting;await b.query(V85_LOCK_SQL);assert.equal(await b.query('SELECT current_generation FROM private.youtube_extraction_worker_credentials;'),'50');await b.query('ROLLBACK;');assert.equal((await state()).credential.current_generation,50);});
  await test('late shared-lock enqueue is visible in a fresh READ COMMITTED statement',async()=>{await reset();const enq=openSession('enqueue'),cut=openSession('cutover');await enq.query('BEGIN;SELECT pg_advisory_xact_lock_shared(86120317);UPDATE public.youtube_extraction_jobs SET status=\'queued\' WHERE id=42;');const waiting=cut.query(V85_BEGIN_SQL);await waitBlocked(base,cut.name);await enq.query('COMMIT;');await waiting;await cut.query(V85_LOCK_SQL);assert.equal(await cut.query("SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued';"),'1');await cut.query('ROLLBACK;');assert.equal((await state()).credential.current_generation,49);});
  await test('error after rotation rolls policy and credential back atomically',async()=>{await reset();const before=await state(),s=openSession('rollback');await locked(s);await s.query(buildV85RegistrationSql(credentials()));await assert.rejects(s.query('SELECT 1/0;'));assert.equal(await s.close(),3);assert.deepEqual(await state(),before);});
  await test('commit followed by connection termination is recovered from exact current50',async()=>{await reset();const s=openSession('uncertain');await locked(s);const c=credentials();await s.query(buildV85RegistrationSql(c));await assert.rejects(s.query('COMMIT;SELECT pg_terminate_backend(pg_backend_pid());'));await s.close();const after=await state();assert.equal(after.credential.current_generation,50);assert.equal(after.credential.current_jti_hash,c.metadata.jti_sha256);assert.equal(after.credential.release_sha,V85.releaseSha);assert.equal(after.credential.allowed_snapshot_digest,V85.snapshotDigest);assert.equal(after.policy.enabled,false);});
  await test('manager scope mismatch leaves policy/credential unchanged',async()=>{await reset();const before=await state(),s=openSession('bad-manager');await s.query(V85_BEGIN_SQL);await s.query(V85_LOCK_SQL);const c=credentials();c.managerClaims.scope='foreign';const raw=`SET LOCAL request.jwt.claims=${literal(JSON.stringify(c.managerClaims))};SET LOCAL ROLE youtube_extraction_credential_manager;SELECT public.rotate_youtube_extraction_worker_credential(49,50,repeat('b',64),${literal(V85.expiresAt)},${literal(V85.releaseSha)},${literal(V85.schemaIdentity)},${literal(V85.snapshotDigest)});`;await assert.rejects(s.query(raw));await s.close();assert.deepEqual(await state(),before);});
  await test('stale generation CAS returns false and cannot rewrite existing50 JTI',async()=>{await reset();const a=openSession('first');await locked(a);await a.query(buildV85RegistrationSql(credentials()));await a.query('COMMIT;');const before=await state(),b=openSession('stale');await b.query(V85_BEGIN_SQL);await b.query(V85_LOCK_SQL);const c=credentials();const sql=buildV85RegistrationSql(c).replaceAll(c.metadata.jti_sha256,'d'.repeat(64));const out=await b.query(sql);assert.ok(out.includes('"rotated": false'));await b.query('ROLLBACK;');assert.deepEqual(await state(),before);});
  finalReport={schema:'homecook.youtube-v85-isolated-postgres.v1',major:17,tests:results.length,passed:results.length,skipped:0,network:'none',mounts:0,productionConnections:0,realCredentialsIssued:0,models:0};
}finally{
  for(const s of sessions)s.stop();await Promise.allSettled(sessions.map(s=>s.close()));
  try{if(started)required(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);}finally{
    if(containerId){const r=rawCommand('docker',['rm','-f',containerId]);assert.equal(r.status,0,'Owned container cleanup');assert.notEqual(rawCommand('docker',['inspect',containerId]).status,0);}
    rmSync(root,{recursive:true,force:true});
  }
}
process.stdout.write(JSON.stringify({...finalReport,cleanupCompleted:true})+'\n');
