import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createIsolatedSupabaseProject, readPinnedLocalDockerTarget, assertNoIsolatedDockerResources, assertOwnedDockerResources, assertPinnedSupabaseCliVersion, buildSupabaseCliArgs, buildIsolatedSupabaseStartArgs, removeIsolatedDockerResources } from "../scripts/lib/local-supabase-isolated-runtime.mjs";
import { ABSENCE_SQL, ORIGINAL_CHECK_SQL, POSTIMAGE_SQL, LEGACY_ROWS_SQL, LEGACY_CATALOG_SQL, LEDGER_VALID_SQL, readRecordingDeploymentBundle, recordingPrestate, hash, openRecordingSession, backupRecordingSnapshot, applyRecordingDatabase, classifyRecordingOutcome } from "../scripts/lib/marketing-round2-controlled-deploy.mjs";

it.skipIf(process.env.R2_CONTROLLED_DB_INTEGRATION !== "1")("full snapshot backup/restore, exact forward transaction, faults and unknown readback in a fresh owned database", async () => {
  const isolated=await createIsolatedSupabaseProject(process.cwd());
  const env: NodeJS.ProcessEnv={...await isolated.buildCommandEnv(process.env,{dockerHost:readPinnedLocalDockerTarget().docker_host}),NODE_ENV:"test"};
  const container=`supabase_db_${isolated.projectId}`;
  const directory=await mkdtemp(join(tmpdir(),"r2-controlled-"));
  const bundle=readRecordingDeploymentBundle(process.cwd());
  let started=false;
  function run(args: string[],options: Record<string,unknown>={}){
    const r=spawnSync("docker",args,{env,encoding:"utf8",timeout:120000,maxBuffer:8*1024*1024,...options});
    if(r.status!==0)throw new Error(`Isolated database operation failed: ${r.stderr?.match(/ERROR:[^\n]*/)?.[0] ?? "output withheld"}`);return r.stdout?.trim();
  }
  const query=async(sql: string)=>run(["exec","-i",container,"psql","-U","postgres","-d","postgres","-XAtq","-v","ON_ERROR_STOP=1"],{input:sql})!;
  try{
    expect(isolated.projectId).toMatch(/^hcg_/);
    expect(isolated.projectId).not.toContain("homecook-full-local");
    const version=spawnSync("corepack",["pnpm",...buildSupabaseCliArgs(["--version"],{workdir:isolated.rootDir})],{env,encoding:"utf8"});
    expect(version.status).toBe(0);assertPinnedSupabaseCliVersion(version.stdout);
    assertNoIsolatedDockerResources(isolated.projectId,{env});
    for(const migration of bundle.migrations)await unlink(join(isolated.rootDir,"supabase/migrations",migration.filename));
    started=true;
    const start=spawnSync("corepack",["pnpm",...buildIsolatedSupabaseStartArgs(isolated.rootDir)],{cwd:isolated.rootDir,env,encoding:"utf8",timeout:240000,maxBuffer:16*1024*1024});
    expect(start.status,"fresh isolated start").toBe(0);assertOwnedDockerResources(isolated.projectId,{env});
    await query("INSERT INTO public.marketing_validation_sessions(id,campaign_key,creative_key,audience_key,attribution_status,viewed_at,retention_until) VALUES(gen_random_uuid(),'backup-sentinel','sentinel','sentinel','organic',now(),now()+interval '1 day');");
    const target={projectId:isolated.projectId,container};
    const prestate=await recordingPrestate(query);
    const legacyBefore=await query(LEGACY_ROWS_SQL),catalogBefore=await query(LEGACY_CATALOG_SQL);
    const probe=openRecordingSession(container,env,`r2-probe-${randomUUID()}`);
    await probe.query("BEGIN;");
    await probe.query(bundle.migrations[0].payload);
    const originalCheckHash=await probe.query(ORIGINAL_CHECK_SQL);
    await probe.query(bundle.migrations[1].payload);await probe.query(bundle.migrations[2].payload);
    const postimage=await probe.query(POSTIMAGE_SQL);
    await probe.query("ROLLBACK;");await probe.close();
    expect(await query(ABSENCE_SQL)).toBe("t");
    let receipt: unknown;
    let lastJournal: Record<string,unknown>={};
    let backupIndex=0;
    let faultAt=0;
    let loseCommit=false;
    const adapter={
      inspect:async()=>target,query,
      session:(applicationName: string)=>{
        const actual=openRecordingSession(container,env,applicationName);
        let count=0;
        return {...actual,query:async(sql: string,timeout?: number)=>{
          const result=await actual.query(sql,timeout);
          if((bundle.migrations.some(m=>m.payload===sql)||sql.includes("INSERT INTO marketing_round2_deploy.receipt"))&&++count===faultAt)throw new Error("injected after SQL/ledger");
          if(sql==="COMMIT;"&&loseCommit){await actual.close();throw new Error("lost COMMIT response");}
          return result;
        }};
      },
      backup:async(options: {snapshot:string;timeout:number;target:unknown})=>{
        const blocked=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-XAtq","-v","ON_ERROR_STOP=1"],{env,encoding:"utf8",timeout:3000,input:"BEGIN; SET LOCAL lock_timeout='100ms'; UPDATE public.marketing_validation_sessions SET campaign_key='must-not-write'; COMMIT;"});
        expect(blocked.status).not.toBe(0);
        expect(await query(LEGACY_ROWS_SQL)).toBe(legacyBefore); // SHARE still permits SELECT.
        const backupDir=join(directory,`backup-${backupIndex++}`);await mkdir(backupDir,{mode:0o700});
        const result=await backupRecordingSnapshot({...options,run,container,directory:backupDir});
        expect(result.fullArchiveDecoded).toBe(true);return result;
      },
      observe:async({expected,applicationName}: {expected:unknown;applicationName:string})=>{
        const exists=await query("SELECT to_regclass('marketing_round2_deploy.receipt') IS NOT NULL;")==="t";
        const active=await query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${applicationName}');`)==="t";
        receipt=exists?JSON.parse(await query("SELECT receipt FROM marketing_round2_deploy.receipt;")):null;
        return {target,active,ledger:receipt,postimage:exists?await query(POSTIMAGE_SQL):null,prestateMatches:!exists&&hash(JSON.stringify(await recordingPrestate(query)))===hash(JSON.stringify(prestate)),expected};
      },
    };
    const manifest={operationId:randomUUID(),candidateSha:"a".repeat(40),toolSha:"b".repeat(40),target,prestateHash:hash(JSON.stringify(prestate)),postimage,originalCheckHash,migrations:bundle.migrations.map(({filename,rawSha256,payloadSha256})=>({filename,rawSha256,payloadSha256}))};
    for(faultAt of [1,2,3,4]){
      await expect(applyRecordingDatabase({manifest,bundle,adapter,journal:async (record: Record<string,unknown>)=>{lastJournal=record;}})).rejects.toThrow(/reconcile/);
      expect(lastJournal.state).toBe("unknown");
      // Own psql connection closure must be observed before not-applied is asserted.
      let observed=await adapter.observe(lastJournal as never);
      for(let i=0;observed.active&&i<20;i++){await new Promise(r=>setTimeout(r,50));observed=await adapter.observe(lastJournal as never);}
      expect(classifyRecordingOutcome({target,planHash:hash(JSON.stringify(manifest)),postimage},observed)).toBe("not-applied");
      expect(await query(LEGACY_ROWS_SQL)).toBe(legacyBefore);
      expect(await query(ABSENCE_SQL)).toBe("t");
    }
    faultAt=0;loseCommit=true;
    await expect(applyRecordingDatabase({manifest,bundle,adapter,journal:async (record: Record<string,unknown>)=>{lastJournal=record;}})).rejects.toThrow(/reconcile/);
    expect(lastJournal.state).toBe("unknown");
    const observed=await adapter.observe(lastJournal as never);
    expect(classifyRecordingOutcome(lastJournal.expected,observed)).toBe("committed");
    expect(await query(LEDGER_VALID_SQL)).toBe("t");
    expect(await query(LEGACY_ROWS_SQL)).toBe(legacyBefore);expect(await query(LEGACY_CATALOG_SQL)).toBe(catalogBefore);
    expect(observed.postimage).toBe(postimage);
    const backup=(lastJournal.expected as {backup:{path:string}}).backup;
    // Restore the full raw archive into a new database in this owned isolated cluster.
    await query("CREATE DATABASE r2_backup_restore;");
    run(["exec","-i",container,"pg_restore","-U","supabase_admin","-d","r2_backup_restore","--exit-on-error"],{input:await readFile(backup.path)});
    expect(run(["exec","-i",container,"psql","-U","postgres","-d","r2_backup_restore","-XAtq"],{input:LEGACY_ROWS_SQL})).toBe(legacyBefore);
    expect(run(["exec","-i",container,"psql","-U","postgres","-d","r2_backup_restore","-XAtq"],{input:ABSENCE_SQL})).toBe("t");
    await writeFile(".omx/artifacts/r22-controlled-deploy/isolated-evidence.json",JSON.stringify({projectId:isolated.projectId,originalCheckHash,postimage,prestate,prestateHash:manifest.prestateHash,fullRawBackupRestored:true,restoreRole:"supabase_admin",rolesRestore:"existing roles in same fresh isolated cluster",sqlFaults:[1,2,3,"ledger"],shareFenceBlocksWrites:true,shareFenceAllowsReads:true,lostCommitReconciled:true,legacyPreserved:true,productionAccess:0})+"\n");
  }finally{
    if(started)removeIsolatedDockerResources(isolated.projectId,{env});
    assertNoIsolatedDockerResources(isolated.projectId,{env});await isolated.removeFiles();await rm(directory,{recursive:true,force:true});
  }
},300000);
