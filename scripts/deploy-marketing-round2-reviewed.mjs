#!/usr/bin/env node
// Operational entrypoint. Tests import the pure/helper module, never this CLI.
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { createServer } from "node:net";
import { hash, RECORDING_PREDECESSOR, RECORDING_SOURCE_ANCHOR, RECORDING_OWN_PATHS, assertRecordingScope, readRecordingDeploymentBundle, validateRecordingManifest, verifyRecordingEvidence, privatePath, readPrivateJson, durableJson, createRecordingDockerAdapter, applyRecordingDatabase, classifyRecordingOutcome, stageRecordingWeb, recordingPrestate, assertRecordingLiveProof, assertRecordingIngressProof, withRecordingInvocation, probeRecordingWeb } from "./lib/marketing-round2-controlled-deploy.mjs";
import { applyEnvironmentPatch, readEnvironmentPatch } from "./lib/prelaunch-environment.mjs";
import { retargetPlist, productionEnvironment, restartLaunchAgent } from "./lib/prelaunch-web-deploy.mjs";

const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const deployRoot=join(homedir(),".homecook/prelaunch-web");
const plistPath=join(homedir(),"Library/LaunchAgents/com.homecook.production.plist");
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
function command(bin,args,options={}){
  const result=spawnSync(bin,args,{encoding:"utf8",timeout:5000,maxBuffer:8*1024*1024,...options});
  requireValue(result.status===0,`R2 ${bin==='git'?'source':'local operation'} failed; output withheld`);
  return result.stdout?.trim();
}
const git=(args,cwd=repository)=>command("git",["-C",cwd,...args]);
const decode=bytes=>JSON.parse(command("/usr/bin/plutil",["-convert","json","-o","-","--","-"],{input:bytes}));
const encode=value=>command("/usr/bin/plutil",["-convert","xml1","-o","-","--","-"],{input:JSON.stringify(value)});
const same=isDeepStrictEqual;
async function live(){
  const bytes=await fs.readFile(plistPath); const plist=decode(bytes);
  retargetPlist(plist,plist.WorkingDirectory);
  requireValue(!git(["status","--porcelain","--untracked-files=no"],plist.WorkingDirectory),"Live source is dirty");
  return {bytes,plist,sha:git(["rev-parse","HEAD"],plist.WorkingDirectory),buildId:(await fs.readFile(join(plist.WorkingDirectory,".next/BUILD_ID"),"utf8")).trim()};
}
async function assertCandidate(manifest){
  requireValue(git(["rev-parse","HEAD"])===manifest.toolSha && !git(["status","--porcelain","--untracked-files=no"]),"Runner commit/tree changed");
  requireValue(git(["rev-parse",`${manifest.candidateSha}^{tree}`])===manifest.candidateTree,"Candidate tree changed");
  git(["merge-base","--is-ancestor",RECORDING_PREDECESSOR,manifest.candidateSha]);
  git(["merge-base","--is-ancestor",RECORDING_SOURCE_ANCHOR,manifest.candidateSha]);
  const anchorPaths=command("git",["-C",repository,"diff","--name-only","--no-renames","-z",RECORDING_PREDECESSOR,RECORDING_SOURCE_ANCHOR]).split("\0").filter(Boolean);
  assertRecordingScope(manifest.changes,anchorPaths);
  const paths=command("git",["-C",repository,"diff","--name-only","--no-renames","-z",RECORDING_PREDECESSOR,manifest.candidateSha]).split("\0").filter(Boolean);
  requireValue(same([...paths].sort(),manifest.changes.map(r=>r.path).sort()),"Candidate diff differs from reviewed manifest");
  for(const row of manifest.changes){
    // A caller-authored passed:true file cannot authorize different application/tool bytes.
    const authority=RECORDING_OWN_PATHS.includes(row.path)?manifest.toolSha:RECORDING_SOURCE_ANCHOR;
    const anchored=spawnSync("git",["-C",repository,"show",`${authority}:${row.path}`],{timeout:5000,maxBuffer:32*1024*1024});
    requireValue(row.after===null?anchored.status!==0:anchored.status===0&&hash(anchored.stdout)===row.after,"Candidate bytes differ from exact source/tool authority");
    for(const [ref,expected] of [[RECORDING_PREDECESSOR,row.before],[manifest.candidateSha,row.after]]){
      const result=spawnSync("git",["-C",repository,"show",`${ref}:${row.path}`],{maxBuffer:32*1024*1024,timeout:5000});
      requireValue(expected===null?result.status!==0:result.status===0&&hash(result.stdout)===expected,"Reviewed source bytes changed");
    }
  }
  const sourceBundle=readRecordingDeploymentBundle(repository);
  for(const migration of sourceBundle.migrations){
    const bytes=spawnSync("git",["-C",repository,"show",`${manifest.candidateSha}:supabase/migrations/${migration.filename}`],{timeout:5000}).stdout;
    requireValue(hash(bytes)===migration.rawSha256,"Candidate SQL differs from reviewed runner SQL");
  }
  await verifyRecordingEvidence(manifest);
  await privatePath(manifest.envPath);
  requireValue(hash(await fs.readFile(manifest.envPath))===manifest.envSha256,"Private environment changed");
}
async function closedControl(manifest){
  const control=await readPrivateJson(manifest.controlPath);
  requireValue(control.version===1 && control.collection_enabled===false && control.lead_enabled===false && Number.isSafeInteger(control.consent_generation)&&control.consent_generation>0,"R2 collection and leads must remain closed");
  return control;
}
async function acquireLocks(manifest,planHash,resume){
  await privatePath(deployRoot,true); await privatePath(dirname(manifest.controlPath),true);
  const locks=[join(deployRoot,"deploy.lock"),`${manifest.controlPath}.lock`];
  const created=[];
  try{for(const directory of locks){
    if(resume){
      await privatePath(directory,true);
      requireValue(same(await readPrivateJson(join(directory,"r2-owner.json")),{operationId:manifest.operationId,planHash}),"Lease belongs to another operation; no takeover");
    }else{
      await fs.mkdir(directory,{mode:0o700});
      await durableJson(join(directory,"r2-owner.json"),{operationId:manifest.operationId,planHash},true);
      created.push(directory);
    }
  }}catch(error){
    // No DB dispatch yet: remove only leases created by this invocation, never an existing lock.
    for(const directory of created.reverse()){await fs.unlink(join(directory,"r2-owner.json"));await fs.rmdir(directory);}throw error;
  }
  return async()=>{
    for(const directory of [...locks].reverse()){
      requireValue(same(await readPrivateJson(join(directory,"r2-owner.json")),{operationId:manifest.operationId,planHash}),"Lease identity changed");
      await fs.unlink(join(directory,"r2-owner.json")); await fs.rmdir(directory);
    }
  };
}
async function atomicBytes(path,bytes){
  const temp=`${path}.r2-${process.pid}`;
  const handle=await fs.open(temp,"wx",0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  await fs.rename(temp,path);
  const directory=await fs.open(dirname(path),"r");try{await directory.sync();}finally{await directory.close();}
}
async function switchWeb(bytes){
  const domain=`gui/${process.getuid()}`,service=`${domain}/com.homecook.production`;
  await restartLaunchAgent({
    isLoaded:async()=>spawnSync("/bin/launchctl",["print",service],{stdio:"ignore"}).status===0,
    bootout:async()=>{command("/bin/launchctl",["bootout",service],{stdio:"ignore"});},
    writePlist:()=>atomicBytes(plistPath,bytes),
    bootstrap:async()=>spawnSync("/bin/launchctl",["bootstrap",domain,plistPath],{stdio:"ignore"}).status,
    wait:delay,
  });
}
async function smoke(checkout,buildId,recording=true,port=3100){
  const manifestPath=`/_next/static/${buildId}/_buildManifest.js`;
  const expected=hash(await fs.readFile(join(checkout,".next/static",buildId,"_buildManifest.js")));
  for(let i=0;i<30;i++){
    try{
      for(const path of ["/beta?ad_variant=a",...(recording?["/beta/r2/recording","/beta/r2/homeflow"]:[]),manifestPath]){
        const response=await probeRecordingWeb(port,path);
        requireValue(response.status===200,"Web GET not ready");
        if(path===manifestPath)requireValue(hash(response.body)===expected,"Live build mismatch");
      }
      return;
    }catch{await delay(500);}
  }
  throw new Error("Exact web GET/build smoke failed");
}
async function previewWeb(manifest,plist){
  const listener=createServer();
  await new Promise((resolveListening,reject)=>{listener.once("error",reject);listener.listen(0,"127.0.0.1",resolveListening);});
  const port=listener.address().port;
  await new Promise((resolveClosed,reject)=>listener.close(error=>error?reject(error):resolveClosed()));
  const child=spawn(plist.ProgramArguments[0],[join(manifest.preparedCheckout,"scripts/start-production.mjs"),"-H","127.0.0.1","-p",String(port)],{cwd:manifest.preparedCheckout,env:productionEnvironment(plist),detached:true,stdio:"ignore"});
  let failed=false;
  child.once("error",()=>{failed=true;});
  const stopped=new Promise(resolveStopped=>child.once("close",resolveStopped));
  const stop=()=>{if(child.pid){try{process.kill(-child.pid,"SIGKILL");}catch{/* Only this owned preview group. */}}};
  const interrupted=()=>{stop();process.exit(130);};
  process.once("SIGINT",interrupted);process.once("SIGTERM",interrupted);
  try{await smoke(manifest.preparedCheckout,manifest.buildId,true,port);requireValue(!failed&&child.exitCode===null&&child.signalCode===null,"Owned preview exited");}
  finally{stop();await stopped;process.off("SIGINT",interrupted);process.off("SIGTERM",interrupted);}
}
async function prepareWeb(manifest){
  const previous=await live();
  requireValue(previous.sha===manifest.predecessor && hash(previous.bytes)===manifest.predecessorPlistHash,"Live predecessor drift");
  await closedControl(manifest);
  // The coordinator prepares the final candidate once. Stage never rebuilds or changes its SHA.
  const checkout=manifest.preparedCheckout;
  requireValue(git(["rev-parse","HEAD"],checkout)===manifest.candidateSha && !git(["status","--porcelain","--untracked-files=no"],checkout),"Prepared candidate source changed");
  requireValue((await fs.readFile(join(checkout,".next/BUILD_ID"),"utf8")).trim()===manifest.buildId,"Prepared build identity changed");
  const patch=readEnvironmentPatch(manifest.envPath,repository);
  requireValue(patch.MUMEOK_ROUND2_ENABLED==="true" && patch.MUMEOK_ROUND2_LEADS_ENABLED==="true" && patch.MUMEOK_ROUND2_RELEASE_SHA===manifest.candidateSha && patch.MUMEOK_ROUND2_CONTROL_PATH===manifest.controlPath && patch.MUMEOK_ROUND2_REPOSITORY_ROOT===checkout,"Final environment/release identity mismatch");
  const builtEnvironment=await readPrivateJson(join(manifest.operationDirectory,"build-receipt.json"));
  requireValue(builtEnvironment.candidateSha===manifest.candidateSha && builtEnvironment.buildId===manifest.buildId && builtEnvironment.envSha256===manifest.envSha256,"Build must attest the same private environment");
  requireValue(hash(await fs.readFile(join(checkout,".next/static",manifest.buildId,"_buildManifest.js")))===builtEnvironment.buildManifestSha256,"Prepared build manifest changed");
  // Only after exact build proof: merge private runtime vars into the new checkout/plist.
  const next=retargetPlist(applyEnvironmentPatch(checkout,previous.plist,patch),checkout);
  await previewWeb(manifest,next);
  return {previous,next,bytes:encode(next)};
}
async function buildWeb(manifest){
  const previous=await live();
  requireValue(previous.sha===manifest.predecessor&&hash(previous.bytes)===manifest.predecessorPlistHash,"Live predecessor drift");
  await closedControl(manifest);
  const checkout=manifest.preparedCheckout,release=dirname(checkout);
  await fs.mkdir(release,{mode:0o700}); // Exclusive operation-owned release; never replace an old checkout.
  command("git",["-C",repository,"worktree","add","--detach",checkout,manifest.candidateSha],{timeout:30000,stdio:"ignore"});
  for(const path of [".env.production.local",".env.local",".env.production",".env","infra/full-local-supabase/.env.production.local"]){
    try{
      const source=join(previous.plist.WorkingDirectory,path);const info=await fs.lstat(source);
      requireValue(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid(),"Source environment ownership mismatch");
      await fs.mkdir(dirname(join(checkout,path)),{recursive:true,mode:0o700});
      await fs.writeFile(join(checkout,path),await fs.readFile(source),{flag:"wx",mode:0o600});
    }catch(error){if(error.code!=="ENOENT")throw error;}
  }
  const patch=readEnvironmentPatch(manifest.envPath,repository);
  const next=retargetPlist(applyEnvironmentPatch(checkout,previous.plist,patch),checkout);
  const env={...productionEnvironment(next),HOMECOOK_RELEASE_BUILD_ID:manifest.buildId,CI:"true"};
  command("corepack",["pnpm","install","--frozen-lockfile","--prod=false","--ignore-scripts"],{cwd:checkout,env,timeout:300000,stdio:"ignore"});
  const script="import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';import {prepareStartProductionRuntimeEnv} from './scripts/lib/start-production-runtime.mjs';const require=createRequire(import.meta.url);const env=prepareStartProductionRuntimeEnv({repositoryRoot:process.cwd()});process.exit(spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{env,stdio:'ignore'}).status??1);";
  command(next.ProgramArguments[0],["--input-type=module","-e",script],{cwd:checkout,env,timeout:300000,stdio:"ignore"});
  requireValue((await fs.readFile(join(checkout,".next/BUILD_ID"),"utf8")).trim()===manifest.buildId,"Build ID mismatch");
  await durableJson(join(manifest.operationDirectory,"build-receipt.json"),{candidateSha:manifest.candidateSha,buildId:manifest.buildId,envSha256:manifest.envSha256,buildManifestSha256:hash(await fs.readFile(join(checkout,".next/static",manifest.buildId,"_buildManifest.js")))},true);
}
async function enable(manifest,record,adapter){
  const control=await closedControl(manifest);
  const active=await live();
  requireValue(active.sha===manifest.candidateSha && active.buildId===manifest.buildId,"Enable must use the staged release");
  const observation=await adapter.observe({...record,expected:record.expected});
  requireValue(classifyRecordingOutcome(record.expected,observation)==="committed","DB receipt drift");
  const proof=await readPrivateJson(join(manifest.operationDirectory,"enable-proof.json"));
  requireValue(proof.candidateSha===manifest.candidateSha && proof.buildId===manifest.buildId && proof.consentGeneration===control.consent_generation && proof.planHash===record.planHash,"Enable proof release mismatch");
  // The existing runtime owns readiness validation. No substitute shape or bypass is installed.
  const env=productionEnvironment(active.plist);
  const readiness=await readPrivateJson(env.MUMEOK_ROUND2_READINESS_PATH);
  requireValue(readiness.release_sha===manifest.candidateSha && readiness.consent_generation===control.consent_generation && hash(await fs.readFile(env.MUMEOK_ROUND2_READINESS_PATH))===proof.readinessSha256,"Readiness changed after operator verification");
  requireValue(readiness.version===1&&readiness.profile==="production"&&readiness.origin==="https://app.mumeok.kr"&&readiness.hostname==="app.mumeok.kr"&&Number.isFinite(Date.parse(readiness.verified_at))&&readiness.proxy?.header==="cf-connecting-ip"&&readiness.proxy?.binding==="loopback-only"&&readiness.proxy?.ingress==="cloudflare-tunnel","Production readiness contract mismatch");
  const seen=new Set();
  for(const key of ["page","cookie","bootstrap","event","email","receipt","rate","turnstile"]){
    const value=env[key==="turnstile"?"MUMEOK_ROUND2_TURNSTILE_SECRET_KEY":`MUMEOK_ROUND2_${key.toUpperCase()}_SECRET`];
    requireValue(typeof value==="string"&&value.length>=32&&!seen.has(value)&&readiness.secret_fingerprints?.[key]===hash(value),"Production secret fingerprint mismatch");seen.add(value);
  }
  for(const key of ["turnstile_live","db_migration","db_authority","privacy_consent","retention_runbook","operator_approval"]){
    const value=readiness.proofs?.[key]; requireValue(value?.path && value.sha256,"Readiness proof missing");
    await privatePath(value.path); requireValue(hash(await fs.readFile(value.path))===value.sha256,"Readiness proof drift");
  }
  for(const key of ["direct_access_denial","header_overwrite","launch_binding"]){
    const value=readiness.proxy?.[key];requireValue(value?.path&&value.sha256,"Ingress proof missing");
    await privatePath(value.path);requireValue(hash(await fs.readFile(value.path))===value.sha256,"Ingress proof drift");
  }
  await privatePath(proof.providerStatePath);
  const provider=await readPrivateJson(proof.providerStatePath);
  requireValue(proof.providerStatePath===`${env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH}.state`,"Provider proof is not the staged arm state");
  requireValue(hash(await fs.readFile(proof.providerStatePath))===proof.providerStateSha256,"Provider proof changed");
  assertRecordingLiveProof({manifest,state:provider,secret:env.MUMEOK_ROUND2_TURNSTILE_SECRET_KEY,sitekey:env.NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY});
  const armPath=env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH;
  const arm=await readPrivateJson(armPath);
  const ingress=await readPrivateJson(readiness.proxy.header_overwrite.path);
  assertRecordingIngressProof({manifest,state:provider,arm,armHash:hash(await fs.readFile(armPath)),proof:ingress});
  for(const kind of ["direct_access_denial","launch_binding"]){
    const observed=await readPrivateJson(readiness.proxy[kind].path);
    requireValue(observed.kind===kind&&observed.candidateSha===manifest.candidateSha&&observed.buildId===manifest.buildId&&observed.result==="verified"&&observed.operatorVerified===true,"Exact operator ingress/binding observation required");
  }
  await durableJson(manifest.controlPath,{...control,collection_enabled:true,lead_enabled:true});
}

async function main(){
  const [action,flag,file,...extra]=process.argv.slice(2);
  if(action==="--help"){
    process.stdout.write("R2 전용: plan | prepare-web | apply-db | reconcile-db | stage-web | enable --manifest /private/manifest.json\nprepare-web은 동일 최종SHA/env를 한 번 빌드하고 stage-web은 수집control을 닫은 채 교체합니다. 운영자 implicit widget/Siteverify 실제완료 전 enable은 불가합니다. 키 값은 인수가 아닙니다.\n");return;
  }
  requireValue(["plan","prepare-web","apply-db","reconcile-db","stage-web","enable"].includes(action)&&flag==="--manifest"&&file&&extra.length===0,"Only an exact private manifest is accepted");
  requireValue(process.platform==="darwin","Production CLI requires macOS");
  const manifest=await readPrivateJson(file),bundle=readRecordingDeploymentBundle(repository);
  const planHash=validateRecordingManifest(manifest,bundle);
  await privatePath(manifest.operationDirectory,true); await assertCandidate(manifest);
  const operate=async()=>{
  if(action==="prepare-web"){
    const release=await acquireLocks(manifest,planHash,false);
    try{await buildWeb(manifest);}finally{await release();}
    process.stdout.write(JSON.stringify({operationId:manifest.operationId,action,result:"complete",candidateSha:manifest.candidateSha})+"\n");return;
  }
  const backupDirectory=join(manifest.operationDirectory,"db-backup");
  const journalPath=join(manifest.operationDirectory,"journal.json");
  let existing;
  try{existing=await readPrivateJson(journalPath);}catch(error){if(error.code!=="ENOENT")throw error;}
  if(action==="apply-db"&&!existing)await fs.mkdir(backupDirectory,{mode:0o700});
  const adapter=await createRecordingDockerAdapter({configPath:manifest.configPath,backupDirectory:action==="plan"?manifest.operationDirectory:backupDirectory});
  requireValue(same(await adapter.inspect(),manifest.target),"Production target changed");
  if(action==="plan"){
    const current=await live();requireValue(current.sha===manifest.predecessor&&hash(current.bytes)===manifest.predecessorPlistHash,"Live predecessor drift");await closedControl(manifest);
    requireValue(hash(JSON.stringify(await recordingPrestate(sql=>adapter.query(sql))))===manifest.prestateHash,"Read-only prestate differs from manifest");
    process.stdout.write(JSON.stringify({operationId:manifest.operationId,candidateSha:manifest.candidateSha,planHash,bundleSha256:bundle.bundleSha256,changes:manifest.changes.length,operation:"plan-only"})+"\n");return;
  }
  const release=await acquireLocks(manifest,planHash,action!=="apply-db"||Boolean(existing));
  if(action==="apply-db"){
    if(existing){
      requireValue(existing.planHash===planHash && existing.state==="committed"&&existing.expected,"Existing/unknown operation requires reconcile");
      requireValue(classifyRecordingOutcome(existing.expected,await adapter.observe(existing))==="committed","Existing receipt drift");
      process.stdout.write(JSON.stringify({operationId:manifest.operationId,action,result:"exact-committed-no-op"})+"\n");return;
    }
    const current=await live();requireValue(current.sha===manifest.predecessor&&hash(current.bytes)===manifest.predecessorPlistHash,"Live predecessor drift");await closedControl(manifest);
    try{await fs.lstat(journalPath);throw new Error("Existing journal; reconcile instead of reapply");}catch(error){if(error.code!=="ENOENT")throw error;}
    const receipt=await applyRecordingDatabase({manifest,bundle,adapter,journal:record=>durableJson(journalPath,record)});
    await durableJson(join(manifest.operationDirectory,"receipt.json"),receipt,true);
    await adapter.reloadSchema(manifest.operationId);
  }else{
    const record=await readPrivateJson(journalPath);requireValue(record.planHash===planHash,"Journal belongs to another manifest");
    if(action==="reconcile-db"){
      const expected=record.expected??{planHash,target:manifest.target,postimage:manifest.postimage};
      const observed=await adapter.observe({...record,expected});
      const state=classifyRecordingOutcome(expected,observed);
      requireValue(state!=="unknown","Outcome unknown; leases remain held");
      await durableJson(journalPath,{...record,state});
      if(state==="committed"){await durableJson(join(manifest.operationDirectory,"receipt.json"),expected);await adapter.reloadSchema(manifest.operationId);}
      else await release();
    }else{
      requireValue(record.state==="committed"&&record.expected,"Committed database required");
      const readback=async()=>{const o=await adapter.observe(record);requireValue(classifyRecordingOutcome(record.expected,o)==="committed","Database readback drift");return o.ledger;};
      if(action==="stage-web"){
        let web;
        await stageRecordingWeb({receipt:record.expected,readback,assertClosed:()=>closedControl(manifest),
          prepare:async()=>{web=await prepareWeb(manifest);await durableJson(join(manifest.operationDirectory,"web-state.json"),{previousSha:web.previous.sha,previousBuildId:web.previous.buildId,previousPlistSha256:hash(web.previous.bytes),nextPlistSha256:hash(web.bytes),candidateSha:manifest.candidateSha,buildId:manifest.buildId},true);await atomicBytes(join(manifest.operationDirectory,"previous.plist"),web.previous.bytes);},
          activate:async()=>{requireValue(hash(await fs.readFile(plistPath))===manifest.predecessorPlistHash,"Plist drift before switch");await switchWeb(web.bytes);},
          verify:()=>smoke(manifest.preparedCheckout,manifest.buildId),restore:()=>switchWeb(web.previous.bytes),verifyRestored:()=>smoke(web.previous.plist.WorkingDirectory,web.previous.buildId,false),
        });
      }else{await enable(manifest,record,adapter);await release();}
    }
  }
  process.stdout.write(JSON.stringify({operationId:manifest.operationId,action,result:"complete",candidateSha:manifest.candidateSha})+"\n");
  };
  if(action==="plan")await operate();else await withRecordingInvocation(manifest.operationDirectory,operate);
}
main().catch(()=>{process.stderr.write("R2 전용 작업 중단: 비공개 journal과 target을 확인하세요. 잠금·백업을 보존하며 자동 DB 복원/재시도를 하지 않습니다.\n");process.exitCode=1;});
