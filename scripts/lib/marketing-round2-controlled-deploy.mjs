import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { constants, closeSync, fsyncSync, openSync, readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { homedir } from "node:os";
import { request as httpRequest } from "node:http";
import { readPinnedLocalDockerTarget } from "./local-supabase-isolated-runtime.mjs";
import { parseFullLocalProductionConfig, selectFullLocalProductionResources } from "./full-local-production-resources.mjs";
import { deployTransaction } from "./prelaunch-web-deploy.mjs";

export const RECORDING_PREDECESSOR = "458ce2daab6cdd91a70504657ce5981a4d4acf3c";
export const RECORDING_SOURCE_ANCHOR = "2c9518583b1d2682fece427cd81903fbbb861a76";
export const PREDECESSOR_SCOPE_SHA = "a176e56ed522ed1f75fa0e3a9bfa89f2c6f90c0dba30133a76046e1ae7c9d7ea";
export const RECORDING_OWN_PATHS = Object.freeze([
  "scripts/deploy-marketing-round2-reviewed.mjs","scripts/lib/marketing-round2-controlled-deploy.mjs",
  "tests/marketing-round2-controlled-deploy.test.ts","tests/marketing-round2-controlled-deploy.integration.test.ts",
  "app/%5F_ops/r2-preflight/route.ts","lib/server/marketing-round2-preflight.ts","tests/marketing-round2-preflight.test.ts",
  "tests/marketing-round2-preflight-next.integration.test.ts",
]);
export function assertRecordingScope(changes,anchorPaths) {
  const allowed=new Set([...anchorPaths,...RECORDING_OWN_PATHS]);
  requireValue(changes.every(row=>allowed.has(row.path)),"Unapproved source path");
  requireValue(new Set(changes.map(row=>row.path)).size===changes.length,"Duplicate source path");
}
export const RECORDING_LIMITS = Object.freeze({ lockMs: 5000, pauseMs: 120000 });
export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const same = isDeepStrictEqual;
function requireValue(condition, message) { if (!condition) throw new Error(message); }
/** @type {[string,number,string,string][]} */
const SPECS = [
  ["20260911100000_marketing_round2.sql",41684,"1a783932ef81041414828e336b1f8c9a75666db44180583add72a4f326324ff8","4ec3982dd76957185ddf6bedfada315932d6916f77391413df0471d5b5978eb0"],
  ["20260911110000_marketing_round2_linear_homeflow.sql",3669,"8487ec85f9f55230d4eb9ec995781efbc22bec6aee4155cf6e1af79b95cdfe0b","83e5843ebce996a1ec8806fa263cd482c6259818e248de85beba3fca09896016"],
  ["20260911120000_marketing_round2_linear_recording.sql",1726,"d0c1a9918e624dd24f97cd355283bbf9cdd12440386846f6f3dce4a0cb8fdcf9","8edfcd54d17d0e4eb4b016da6518c79a8582d22d06fe6dbb796121a1600f846e"],
  ["20260911130000_marketing_round2_scope_compat.sql",2579,"202a663a6ef2ee5fa3e6b61ec4334aeb244b6c30f659ebc51b9968da5d6e8d3d","450a384116c67e0f0f280f3d7e68023a9be8b579d1af7d755b4561380ec4328c"],
];
const LEDGER_SQL = `CREATE SCHEMA marketing_round2_deploy AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA marketing_round2_deploy FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE marketing_round2_deploy.receipt (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), operation_id uuid NOT NULL, plan_hash text NOT NULL, receipt jsonb NOT NULL);
ALTER TABLE marketing_round2_deploy.receipt OWNER TO postgres;
REVOKE ALL ON TABLE marketing_round2_deploy.receipt FROM PUBLIC, anon, authenticated, service_role;`;
export function reviewedPayload(filename, raw) {
  const spec = SPECS.find(entry => entry[0] === filename);
  requireValue(spec && Buffer.isBuffer(raw) && raw.length === spec[1] && hash(raw) === spec[2], "Unreviewed SQL bytes");
  requireValue(raw.subarray(0,7).equals(Buffer.from("begin;\n")) && raw.subarray(-8).equals(Buffer.from("commit;\n")), "Transaction wrapper drift");
  const payload = raw.subarray(7,-8);
  requireValue(hash(payload) === spec[3], "SQL payload drift");
  return { filename, rawSha256: spec[2], payloadSha256: spec[3], payload: payload.toString("utf8") };
}
export function readRecordingDeploymentBundle(repositoryRoot) {
  const migrations = SPECS.map(([name]) => reviewedPayload(name, readFileSync(join(repositoryRoot,"supabase/migrations",name))));
  return { migrations, bundleSha256: hash(migrations.map(m => m.payload).join("\n") + "\n" + LEDGER_SQL) };
}
export function classifyRecordingOutcome(expected, observed) {
  if (!same(expected.target,observed.target) || observed.active !== false) return "unknown";
  if (!SHA.test(expected.immutableScopeHash) || expected.immutableScopeHash !== observed.immutableScopeHash) return "unknown";
  if (same(observed.ledger,expected) && observed.postimage === expected.postimage) return "committed";
  if (observed.ledger === null && observed.prestateMatches === true) return "not-applied";
  return "unknown";
}

/** Reject links at every component and keep operational inputs out of every Git checkout. */
export async function privatePath(file, directory = false) {
  requireValue(isAbsolute(file) && resolve(file) === file, "Private path must be absolute");
  for (let part = file; ; part = dirname(part)) {
    const s = await fs.lstat(part);
    requireValue(!s.isSymbolicLink(), "Private path contains a link");
    try { await fs.lstat(join(directory && part === file ? part : dirname(part), ".git")); throw new Error("Private path is in Git"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (part === dirname(part)) break;
  }
  const s = await fs.lstat(file);
  requireValue(s.uid === process.getuid() && (s.mode & 0o777) === (directory ? 0o700 : 0o600) && (directory ? s.isDirectory() : s.isFile() && s.nlink === 1), "Private ownership/mode mismatch");
  if (!directory) await privatePath(dirname(file),true);
}
export async function readPrivateJson(file) { await privatePath(file); return JSON.parse(await fs.readFile(file,"utf8")); }
export async function durableJson(file, value, exclusive = false) {
  await privatePath(dirname(file),true);
  const temporary = exclusive ? file : `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try { await handle.writeFile(JSON.stringify(value) + "\n"); await handle.sync(); } finally { await handle.close(); }
  if (!exclusive) await fs.rename(temporary,file);
  const parent = await fs.open(dirname(file),"r"); try { await parent.sync(); } finally { await parent.close(); }
}
export async function withRecordingInvocation(directory,operation) {
  await privatePath(directory,true);
  const lock=join(directory,"invocation.lock");
  await fs.mkdir(lock,{mode:0o700}); // Same operation is not permission for a concurrent invocation.
  try{return await operation();}finally{await fs.rmdir(lock);}
}
export function probeRecordingWeb(port,path) {
  requireValue(Number.isInteger(port)&&port>0&&port<=65535&&typeof path==="string"&&path.startsWith("/"),"Invalid loopback probe");
  return new Promise((resolveResponse,reject)=>{
    const request=httpRequest({hostname:"127.0.0.1",port,path,method:"GET",headers:{host:"app.mumeok.kr","x-forwarded-proto":"https"}},response=>{
      const chunks=[];let length=0;
      response.on("data",chunk=>{length+=chunk.length;if(length>4*1024*1024){response.destroy(new Error("Probe body limit"));return;}chunks.push(chunk);});
      response.once("error",reject);
      response.once("end",()=>resolveResponse({status:response.statusCode,body:Buffer.concat(chunks)}));
    });
    request.once("error",reject);request.setTimeout(1500,()=>request.destroy(new Error("Loopback GET timeout")));request.end();
  });
}

export function validateRecordingManifest(manifest,bundle) {
  requireValue(manifest?.schema === "homecook.r2-controlled.v1" && UUID.test(manifest.operationId), "Invalid operation manifest");
  requireValue(manifest.predecessor === RECORDING_PREDECESSOR && COMMIT.test(manifest.candidateSha) && COMMIT.test(manifest.candidateTree) && COMMIT.test(manifest.toolSha), "Exact candidate/tool required");
  requireValue(manifest.bundleSha256 === bundle.bundleSha256 && same(manifest.migrations,bundle.migrations.map(({filename,rawSha256,payloadSha256}) => ({filename,rawSha256,payloadSha256}))), "Reviewed bundle mismatch");
  requireValue(same(manifest.limits,RECORDING_LIMITS), "Fixed 5s lock / 120s pause budget required");
  requireValue(manifest.target?.composeProject === "homecook-full-local-isolated" && manifest.target.postgresVolumeName === "homecook-full-local-postgres", "Wrong production target");
  requireValue(SHA.test(manifest.prestateHash) && SHA.test(manifest.postimage) && SHA.test(manifest.originalCheckHash) && SHA.test(manifest.immutableScopeHash), "Exact pre/post/check/immutable fingerprints required");
  requireValue(Array.isArray(manifest.changes) && manifest.changes.length > 0 && manifest.changes.every(row => typeof row.path === "string" && (row.before === null || SHA.test(row.before)) && (row.after === null || SHA.test(row.after))), "Reviewed exact diff required");
  const sqlChanges = manifest.changes.filter(row => row.path.startsWith("supabase/"));
  requireValue(same(sqlChanges.map(row => row.path).sort(),SPECS.map(([name]) => `supabase/migrations/${name}`).sort()) && sqlChanges.every(row => row.before === null), "Only four exact added SQL files allowed");
  requireValue(manifest.changes.every(row => !/^(infra\/|scripts\/lib\/(?:prelaunch-|full-local-)|scripts\/deploy-prelaunch-web)/.test(row.path)), "Infrastructure/generic deploy changes forbidden");
  for (const name of ["review","isolated","oldWebCompatibility"]) requireValue(typeof manifest.evidence?.[name]?.path === "string" && SHA.test(manifest.evidence[name].sha256), "Required exact evidence missing");
  for (const name of ["operationDirectory","configPath","controlPath","envPath","preparedCheckout"]) requireValue(isAbsolute(manifest[name] ?? ""), "Private/exact operational paths required");
  const root=join(homedir(),".homecook/prelaunch-web");
  requireValue(manifest.operationDirectory===join(root,"r2-operations",manifest.operationId) && manifest.preparedCheckout===join(root,"releases",`r2-${manifest.operationId}`,"checkout"),"Operation-owned fresh paths required");
  requireValue(typeof manifest.buildId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(manifest.buildId) && SHA.test(manifest.envSha256) && SHA.test(manifest.predecessorPlistHash), "Exact web/build/environment required");
  return hash(JSON.stringify(manifest));
}
export async function verifyRecordingEvidence(manifest) {
  for (const [kind,proof] of Object.entries(manifest.evidence)) {
    await privatePath(proof.path);
    const bytes = await fs.readFile(proof.path);
    requireValue(hash(bytes) === proof.sha256, "Evidence bytes changed");
    const value = JSON.parse(bytes.toString("utf8"));
    requireValue(value.kind === kind && value.candidateSha === manifest.candidateSha && value.toolSha === manifest.toolSha && value.bundleSha256 === manifest.bundleSha256 && value.passed === true, "Evidence does not bind this release");
  }
}

// All catalog hashes use semantic definitions, not restore-dependent object OIDs or statistics.
const digestSql = expression => `encode(sha256(convert_to((${expression})::text,'UTF8')),'hex')`;
const functionState = predicate => `(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,(SELECT coalesce(jsonb_agg(jsonb_build_array(d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)) ORDER BY d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)),'[]'::jsonb) FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${predicate})`;
const tableState = predicate => `(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum),'[]'::jsonb) FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)),'[]'::jsonb) FROM pg_index i WHERE i.indrelid=c.oid),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid)) ORDER BY pol.polname),'[]'::jsonb) FROM pg_policy pol WHERE pol.polrelid=c.oid)
 ) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND ${predicate})`;
export const LEGACY_CATALOG_SQL = `SELECT ${digestSql(tableState("n.nspname='public' AND c.relname='marketing_validation_sessions'"))};`;
export const LEGACY_ROWS_SQL = `SELECT jsonb_build_object('count',count(*),'sha256',${digestSql("coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)")}) FROM public.marketing_validation_sessions t;`;
export const SHARED_SQL = `SELECT ${digestSql(functionState("n.nspname='private' AND p.proname='verify_full_local_internal_scope'"))};`;
// The deployed inner delegate differs from fresh fixtures: preserve its complete catalog fingerprint separately.
export const IMMUTABLE_SCOPE_SQL = `SELECT ${digestSql(functionState("n.nspname='private' AND p.proname='verify_full_local_internal_scope_pre_legacy_compat'"))};`;
export const PREDECESSOR_SCOPE_SQL = `SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='private.verify_full_local_internal_scope()'::regprocedure;`;
export const ORIGINAL_CHECK_SQL = `SELECT CASE WHEN count(*)=1 THEN ${digestSql("coalesce(jsonb_agg(jsonb_build_array(pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred,(SELECT coalesce(jsonb_agg(jsonb_build_array(d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)) ORDER BY d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)),'[]'::jsonb) FROM pg_depend d WHERE d.classid='pg_constraint'::regclass AND d.objid=c.oid)) ORDER BY c.conname),'[]'::jsonb)")} ELSE 'invalid' END FROM pg_constraint c WHERE c.conrelid='public.marketing_round2_participations'::regclass AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%marketing_round2_answers%' AND pg_get_constraintdef(c.oid) LIKE '%survey_version%';`;
export const POSTIMAGE_SQL = `SELECT ${digestSql(`jsonb_build_array(${tableState("n.nspname='public' AND c.relname IN ('marketing_round2_participations','marketing_round2_events','marketing_round2_lead_requests')")},${functionState("n.nspname IN ('public','private') AND (p.proname LIKE 'marketing_round2_%' OR p.proname='verify_full_local_internal_scope')")})`)};`;
export const ABSENCE_SQL = `SELECT NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'marketing_round2_%') AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('marketing_round2_participations','marketing_round2_events','marketing_round2_lead_requests')) AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='marketing_round2_deploy');`;
export async function recordingPrestate(query) {
  const result = { absent: await query(ABSENCE_SQL), legacy: await query(LEGACY_CATALOG_SQL), shared: await query(SHARED_SQL), immutableScope: await query(IMMUTABLE_SCOPE_SQL), outerSourceSha: await query(PREDECESSOR_SCOPE_SQL), history: [] };
  for (const table of ["homecook_deploy.migrations","supabase_migrations.schema_migrations"]) {
    const exists = await query(`SELECT to_regclass('${table}') IS NOT NULL;`);
    result.history.push(exists === "t" ? await query(`SELECT ${digestSql("coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)")} FROM ${table} t;`) : "absent");
  }
  return result;
}
export const LEDGER_VALID_SQL = `SELECT (SELECT nspowner='postgres'::regrole FROM pg_namespace WHERE nspname='marketing_round2_deploy')
 AND NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='marketing_round2_deploy' AND a.grantee<>n.nspowner)
 AND (SELECT relowner='postgres'::regrole FROM pg_class WHERE oid='marketing_round2_deploy.receipt'::regclass)
 AND NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='marketing_round2_deploy.receipt'::regclass AND a.grantee<>c.relowner)
 AND (SELECT count(*)=1 FROM marketing_round2_deploy.receipt);`;

/** Real psql session: keep the exported snapshot and SHARE fence alive during pg_dump. */
export function openRecordingSession(container, env, applicationName, database = "postgres") {
  const child = spawn("docker",["exec","-i","-e",`PGAPPNAME=${applicationName}`,container,"psql","-h","/var/run/postgresql","-p","5432","-U","postgres","-d",database,"-XAtq","-v","ON_ERROR_STOP=1"],{env,stdio:["pipe","pipe","pipe"]});
  let pending; let buffer=""; let exited=false;
  const closed = new Promise(resolveClosed => {
    child.once("error",() => { exited=true; pending?.reject(new Error("Database session failed; output withheld")); resolveClosed(null); });
    child.once("close",code => { exited=true; pending?.reject(new Error("Database session closed; outcome requires readback")); resolveClosed(code); });
  });
  child.stderr.on("data",() => {});
  child.stdout.on("data",bytes => {
    buffer += bytes.toString("utf8");
    if (buffer.length > 2*1024*1024) { child.kill(); pending?.reject(new Error("Database output limit")); return; }
    if (pending && buffer.includes(pending.marker+"\n")) {
      const output=buffer.slice(0,buffer.indexOf(pending.marker+"\n")).trim();
      buffer=buffer.slice(buffer.indexOf(pending.marker+"\n")+pending.marker.length+1);
      const task=pending; pending=undefined; task.resolve(output);
    }
  });
  return {
    async query(sql,timeout=120000) {
      requireValue(!pending && !exited,"Database session unavailable");
      const marker=`r2_${randomUUID().replaceAll("-","")}`;
      let timer;
      try { return await new Promise((resolveQuery,reject) => {
        pending={marker,resolve:resolveQuery,reject};
        timer=setTimeout(() => { child.kill(); reject(new Error("Database session budget exceeded")); },Math.max(1,timeout));
        child.stdin.write(`${sql}\nSELECT '${marker}';\n`, error => { if (error) reject(new Error("Database dispatch outcome unknown")); });
      }); } finally { clearTimeout(timer); }
    },
    async close() { child.stdin.end(); return await closed; },
    stop() { child.kill(); },
  };
}

/** The adapter is explicit for disposable tests. The CLI binds only the guarded local Docker adapter. */
export async function applyRecordingDatabase({ manifest, bundle, adapter, journal }) {
  const target=await adapter.inspect();
  requireValue(same(target,manifest.target),"Database identity drift");
  const prestate=await recordingPrestate(sql => adapter.query(sql));
  requireValue(prestate.absent === "t" && hash(JSON.stringify(prestate)) === manifest.prestateHash,"Database prestate drift or already applied");
  requireValue(prestate.outerSourceSha===PREDECESSOR_SCOPE_SHA && prestate.immutableScope===manifest.immutableScopeHash,"Exact deployed outer/immutable inner required");
  const planHash=hash(JSON.stringify(manifest));
  const applicationName=`r2-deploy-${manifest.operationId}`;
  await journal({state:"dispatching",planHash,target,applicationName,prestate});
  const session=adapter.session(applicationName);
  const start=Date.now();
  const remaining=() => { const ms=RECORDING_LIMITS.pauseMs-(Date.now()-start); requireValue(ms>0,"Legacy write pause exceeded 120s"); return ms; };
  const query=sql => session.query(sql,remaining());
  let expected;
  try {
    await query("BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL transaction_timeout='120s'; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SET LOCAL standard_conforming_strings=on; SELECT pg_advisory_xact_lock(104230921,77101); LOCK TABLE public.marketing_validation_sessions IN SHARE MODE;");
    requireValue(same(await recordingPrestate(query),prestate),"Prestate changed before legacy fence");
    const legacyRows=await query(LEGACY_ROWS_SQL);
    const snapshot=await query("SELECT pg_export_snapshot();");
    requireValue(/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/.test(snapshot),"Invalid snapshot identifier");
    const backup=await adapter.backup({snapshot,timeout:remaining(),target});
    remaining();
    requireValue(same(await adapter.inspect(),target),"Database target changed during backup");
    requireValue(same(await recordingPrestate(query),prestate),"Prestate changed during backup");
    for (const [index,migration] of bundle.migrations.entries()) {
      await query(migration.payload);
      if(index===0) requireValue(await query(ORIGINAL_CHECK_SQL)===manifest.originalCheckHash,"Original CHECK definition drift");
    }
    requireValue(await query(LEGACY_ROWS_SQL)===legacyRows && await query(LEGACY_CATALOG_SQL)===prestate.legacy,"Legacy rows/catalog changed");
    const after=await recordingPrestate(query);
    requireValue(same(after.history,prestate.history),"Generic migration history changed");
    requireValue(after.immutableScope===prestate.immutableScope,"Immutable inner scope changed");
    requireValue(await query(POSTIMAGE_SQL)===manifest.postimage,"R2 schema/authority postimage mismatch");
    expected={planHash,target,postimage:manifest.postimage,immutableScopeHash:prestate.immutableScope,operationId:manifest.operationId,candidateSha:manifest.candidateSha,toolSha:manifest.toolSha,bundleSha256:bundle.bundleSha256,migrations:manifest.migrations,backup,legacyRowsHash:hash(legacyRows),legacyCatalog:prestate.legacy};
    await query(`${LEDGER_SQL}\nINSERT INTO marketing_round2_deploy.receipt(singleton,operation_id,plan_hash,receipt) VALUES(true,${literal(manifest.operationId)}::uuid,${literal(planHash)},${literal(JSON.stringify(expected))}::jsonb);`);
    requireValue(await query(LEDGER_VALID_SQL)==="t","Ledger authority mismatch");
    await journal({state:"commit-dispatched",planHash,target,applicationName,prestate,expected});
    await query("COMMIT;");
    await session.close();
    const observed=await adapter.observe({expected,applicationName,prestate});
    requireValue(classifyRecordingOutcome(expected,observed)==="committed","Commit outcome unknown");
    await journal({state:"committed",planHash,target,applicationName,prestate,expected});
    return expected;
  } catch {
    // Never infer rollback from psql exit, timeout, or lost COMMIT acknowledgement.
    session.stop();
    await journal({state:"unknown",planHash,target,applicationName,prestate,...(expected?{expected}:{})});
    throw new Error("R2 database outcome requires reconcile; preserve lease and backup");
  }
}

export async function stageRecordingWeb({receipt,readback,assertClosed,prepare,activate,verify,restore,verifyRestored}) {
  requireValue(same(await readback(),receipt),"Exact DB receipt readback required");
  await assertClosed();
  await deployTransaction({
    prepare:async()=>{await prepare(); await assertClosed(); requireValue(same(await readback(),receipt),"Database changed before web switch");},
    activate,verify:async()=>{await verify(); await assertClosed(); requireValue(same(await readback(),receipt),"Database changed after web switch");},
    restore:async()=>{requireValue(same(await readback(),receipt),"Unknown DB forbids automatic web restore"); await restore();},verifyRestored,
  });
}
export function assertRecordingLiveProof({manifest,state,secret,sitekey,now=Date.now()}) {
  for(const action of ["mumeok_r2_recording","mumeok_r2_homeflow"]){
    requireValue(state.proofs?.some(p=>p.action===action&&p.provider==="provider_live"&&p.release_sha===manifest.candidateSha&&p.build_id===manifest.buildId&&p.hostname==="app.mumeok.kr"&&p.secret_sha256===hash(secret)&&p.sitekey_sha256===hash(sitekey)&&Number.isFinite(Date.parse(p.verified_at))&&Date.parse(p.verified_at)<=now&&Date.parse(p.verified_at)>=now-900000),"Current real operator widget/Siteverify proof required");
  }
}
export function assertRecordingIngressProof({manifest,state,arm,armHash,proof,now=Date.now()}) {
  requireValue(proof?.version===1&&proof.arm_sha256===armHash&&proof.release_sha===manifest.candidateSha&&proof.build_id===manifest.buildId&&proof.reserved_probe==="192.0.2.123","Actual ingress pair proof required");
  requireValue(arm.release_sha===manifest.candidateSha&&arm.build_id===manifest.buildId&&/^[a-f0-9]{64}$/.test(arm.credential_sha256)&&state.arm_hash===armHash,"Ingress arm mismatch");
  for(const receipt of [proof.normal,proof.spoofed]){
    requireValue(receipt&&state.ingress?.some(row=>same(row,receipt))&&receipt.arm_sha256===armHash&&receipt.release_sha===manifest.candidateSha&&receipt.build_id===manifest.buildId&&/^[a-f0-9]{64}$/.test(receipt.nonce)&&/^[a-f0-9]{64}$/.test(receipt.ip_hmac)&&Date.parse(receipt.observed_at)<=now&&Date.parse(receipt.observed_at)>=now-900000,"Ingress receipt missing, stale or changed");
  }
  requireValue(proof.normal.nonce!==proof.spoofed.nonce,"Distinct actual ingress probes required");
  const signature=createHmac("sha256",Buffer.from(arm.credential_sha256,"hex")).update(JSON.stringify(["r2-ingress-verified-v1",armHash,manifest.candidateSha,manifest.buildId,proof.normal,proof.spoofed])).digest("hex");
  requireValue(typeof proof.verification_hmac==="string"&&/^[a-f0-9]{64}$/.test(proof.verification_hmac)&&timingSafeEqual(Buffer.from(signature),Buffer.from(proof.verification_hmac)),"Trace-derived ingress verification signature required");
}

export async function backupRecordingSnapshot({run,container,directory,snapshot,timeout,target}) {
  await privatePath(directory,true);
  const dump=join(directory,"postgres.dump"),roles=join(directory,"roles.sql"),began=Date.now();
  const remaining=()=>{const ms=timeout-(Date.now()-began);requireValue(ms>0,"Backup budget exceeded");return ms;};
  for(const [file,args] of [[dump,["pg_dump","-h","/var/run/postgresql","-p","5432","-U","supabase_admin","-d","postgres","-Fc",`--snapshot=${snapshot}`]],[roles,["pg_dumpall","-h","/var/run/postgresql","-p","5432","-U","supabase_admin","--roles-only","--no-role-passwords"]]]){
    const fd=openSync(file,"wx",0o600);
    try{run(["exec",container,...args],{timeout:remaining(),stdio:["ignore",fd,"pipe"]});fsyncSync(fd);}finally{closeSync(fd);}
  }
  for(const args of [["pg_restore","--list"],["pg_restore","--file=/dev/null"]]){
    const fd=openSync(dump,"r");try{run(["exec","-i",container,...args],{timeout:remaining(),stdio:[fd,"ignore","pipe"]});}finally{closeSync(fd);}
  }
  const bytes=await fs.readFile(dump);requireValue(bytes.length>0,"Empty backup");remaining();
  const metadata={path:dump,sha256:hash(bytes),bytes:bytes.length,rolesSha256:hash(await fs.readFile(roles)),snapshot,target,completedAt:new Date().toISOString(),fullArchiveDecoded:true};
  await durableJson(join(directory,"metadata.json"),metadata,true);return metadata;
}

/** No fallback target, no remote Docker context, no generic migration engine. */
export async function createRecordingDockerAdapter({configPath,backupDirectory}) {
  await privatePath(configPath); await privatePath(backupDirectory,true);
  const config=parseFullLocalProductionConfig(await fs.readFile(configPath,"utf8"));
  requireValue(config.FULL_LOCAL_COMPOSE_PROJECT_NAME==="homecook-full-local-isolated" && config.FULL_LOCAL_POSTGRES_VOLUME_NAME==="homecook-full-local-postgres","Wrong configured production target");
  const env={...process.env,DOCKER_HOST:readPinnedLocalDockerTarget().docker_host};
  delete env.DOCKER_CONTEXT; delete env.DOCKER_TLS_VERIFY; delete env.DOCKER_CERT_PATH;
  requireValue(env.DOCKER_HOST.startsWith("unix://"),"Local Unix Docker required");
  const run=(args,options={})=>{
    const result=spawnSync("docker",args,{env,encoding:"utf8",timeout:5000,maxBuffer:4*1024*1024,...options});
    requireValue(result.status===0,"Local database command failed; output withheld"); return result.stdout?.trim();
  };
  let selected;
  const query=sql=>run(["exec","-i",selected.postgresContainerId,"psql","-h","/var/run/postgresql","-p","5432","-U","postgres","-d","postgres","-XAtq","-v","ON_ERROR_STOP=1"],{input:`BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; ${sql}\nCOMMIT;`});
  return {
    async inspect(){
      const ids=run(["ps","-aq","--filter",`label=com.docker.compose.project=${config.FULL_LOCAL_COMPOSE_PROJECT_NAME}`]).split(/\s+/).filter(Boolean);
      requireValue(ids.length>0,"Configured container absent");
      const containers=JSON.parse(run(["inspect",...ids]));
      const volumes=JSON.parse(run(["volume","inspect",config.FULL_LOCAL_POSTGRES_VOLUME_NAME,config.FULL_LOCAL_STORAGE_VOLUME_NAME]));
      selected=selectFullLocalProductionResources({config,containers,volumes});
      const c=containers.find(row=>row.Id===selected.postgresContainerId);
      const mounts=c.Mounts.filter(m=>m.Destination==="/var/lib/postgresql/data");
      requireValue(mounts.length===1 && mounts[0].Type==="volume" && mounts[0].Name===selected.postgresVolumeName && mounts[0].RW===true,"PGDATA mount mismatch");
      const actual=JSON.parse(run(["image","inspect",selected.postgresImage]))[0];
      requireValue(actual.Id===c.Image,"Actual database image drift");
      const database=JSON.parse(query("SELECT jsonb_build_object('systemIdentifier',(pg_control_system()).system_identifier::text,'database',current_database(),'role',current_user,'major',current_setting('server_version_num')::int/10000,'pgdata',current_setting('data_directory'));"));
      return {...selected,imageId:c.Image,mountSource:mounts[0].Source,volumeLabels:volumes.map(v=>({name:v.Name,labels:v.Labels})),database};
    },
    query:async sql=>query(sql),
    session:applicationName=>openRecordingSession(selected.postgresContainerId,env,applicationName),
    backup:options=>backupRecordingSnapshot({...options,run,container:selected.postgresContainerId,directory:backupDirectory}),
    async reloadSchema(operationId){
      requireValue(UUID.test(operationId),"Invalid reload operation");
      const session=openRecordingSession(selected.postgresContainerId,env,`r2-reload-${operationId}`);
      try{await session.query("BEGIN; SET LOCAL statement_timeout='5s'; NOTIFY pgrst, 'reload schema'; COMMIT;",5000);await session.close();}
      catch{session.stop();throw new Error("Committed DB retained; schema reload requires verification");}
    },
    async observe({applicationName,prestate}){
      const target=await this.inspect();
      const active=query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${literal(applicationName)});`)==="t";
      const exists=query("SELECT to_regclass('marketing_round2_deploy.receipt') IS NOT NULL;")==="t";
      if(exists) requireValue(query(LEDGER_VALID_SQL)==="t","Ledger authority drift");
      const ledger=exists?JSON.parse(query("SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;")):null;
      return {target,active,ledger,immutableScopeHash:query(IMMUTABLE_SCOPE_SQL),postimage:ledger?query(POSTIMAGE_SQL):null,prestateMatches:!ledger && same(await recordingPrestate(sql=>this.query(sql)),prestate)};
    },
  };
}
