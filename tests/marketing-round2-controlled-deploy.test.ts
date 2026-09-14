import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as deploy from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { createMarketingRound2Handler } from "@/lib/server/marketing-round2";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";
import { preflightIngressDigest, verifyPreflightIngressPair } from "@/lib/server/marketing-round2-preflight";

describe("reviewed R2 bundle", () => {
  it("locks exactly four raw files and removes only their transaction wrapper bytes", () => {
    expect(deploy).toHaveProperty("readRecordingDeploymentBundle");
    const bundle = deploy.readRecordingDeploymentBundle(process.cwd());
    expect(bundle.migrations).toHaveLength(4);
    expect(bundle.migrations.map((m: { payloadSha256: string }) => m.payloadSha256)).toEqual([
      "4ec3982dd76957185ddf6bedfada315932d6916f77391413df0471d5b5978eb0",
      "83e5843ebce996a1ec8806fa263cd482c6259818e248de85beba3fca09896016",
      "8edfcd54d17d0e4eb4b016da6518c79a8582d22d06fe6dbb796121a1600f846e",
      "450a384116c67e0f0f280f3d7e68023a9be8b579d1af7d755b4561380ec4328c",
    ]);
    for (const migration of bundle.migrations) {
      const raw = readFileSync(`supabase/migrations/${migration.filename}`);
      expect(Buffer.from(migration.payload)).toEqual(raw.subarray(7, raw.length - 8));
      expect(() => deploy.reviewedPayload(migration.filename, Buffer.concat([raw, Buffer.from("SELECT 1;\n")]))).toThrow();
      expect(() => deploy.reviewedPayload("unknown.sql", raw)).toThrow();
    }
  });
  it("refuses partial or ambiguous outcomes; only exact receipt and postimage is committed", () => {
    expect(deploy).toHaveProperty("classifyRecordingOutcome");
    const expected = { planHash: "a".repeat(64), postimage: "b".repeat(64), target: { id: "expected" }, immutableScopeHash: "c".repeat(64) };
    expect(deploy.classifyRecordingOutcome(expected, { target: expected.target, ledger: expected, postimage: expected.postimage, immutableScopeHash: expected.immutableScopeHash, active: false, prestateMatches: false })).toBe("committed");
    expect(deploy.classifyRecordingOutcome(expected, { target: expected.target, ledger: null, postimage: null, immutableScopeHash: expected.immutableScopeHash, active: false, prestateMatches: true })).toBe("not-applied");
    for (const observed of [
      { target: expected.target, ledger: null, active: true, prestateMatches: true },
      { target: expected.target, ledger: null, active: false, prestateMatches: false },
      { target: {}, ledger: expected, postimage: expected.postimage, active: false },
      { target: expected.target, ledger: { ...expected, planHash: "c".repeat(64) }, postimage: expected.postimage, active: false },
    ]) expect(deploy.classifyRecordingOutcome(expected, observed)).toBe("unknown");
  });
  it("keeps a changed preserved inner function unknown even when the mutable postimage and ledger match",()=>{
    const expected={planHash:"a".repeat(64),postimage:"b".repeat(64),target:{id:"expected"},immutableScopeHash:"c".repeat(64)};
    expect(deploy.classifyRecordingOutcome(expected,{target:expected.target,ledger:expected,postimage:expected.postimage,immutableScopeHash:"d".repeat(64),active:false,prestateMatches:false})).toBe("unknown");
  });
  it("adds only the R2 exact branch to the immutable deployed outer source",()=>{
    const source=execFileSync("git",["show","6abe9f0aa63668515bffbeb82afaae5c4ba55234:supabase/migrations/20260906020000_meal_log_runtime_authority.sql"],{encoding:"utf8"});
    const original=source.split("as $function$")[1].split("$function$")[0];
    expect(deploy.hash(original)).toBe(deploy.PREDECESSOR_SCOPE_SHA);
    const sql=readFileSync("supabase/migrations/20260911130000_marketing_round2_scope_compat.sql","utf8");
    const body=sql.split("as $function$")[1].split("$function$")[0];
    const branch="  if v_scope = 'marketing-round2' and v_method = 'POST'\n    and v_path = '/rpc/marketing_round2_apply' then return; end if;\n";
    expect(body.split(branch)).toHaveLength(2);expect(body.replace(branch,"")).toBe(original);
    expect(sql).not.toMatch(/alter function public\.|create or replace function private\.verify_full_local_internal_scope_pre_legacy_compat/i);
    expect(deploy.POSTIMAGE_SQL).not.toContain("verify_full_local_internal_scope_pre_legacy_compat");
    expect(deploy.IMMUTABLE_SCOPE_SQL).toContain("verify_full_local_internal_scope_pre_legacy_compat");
  });
  it("rejects arbitrary app/lib paths outside the exact approved source inventory", () => {
    const allowed=["app/beta/r2/homeflow/page.tsx","lib/marketing-round2.ts"];
    expect(()=>deploy.assertRecordingScope([{path:allowed[0]}],allowed)).not.toThrow();
    for(const path of ["app/api/admin/route.ts","lib/server/auth.ts","infra/secret.env","scripts/deploy-prelaunch-web.mjs"]){
      expect(()=>deploy.assertRecordingScope([{path}],allowed)).toThrow(/Unapproved/);
    }
    expect(()=>deploy.assertRecordingScope([{path:allowed[0]},{path:allowed[0]}],allowed)).toThrow(/Duplicate/);
  });
  it("requires exact target, timeout, SQL bundle and operation-owned fresh paths", () => {
    const bundle=deploy.readRecordingDeploymentBundle(process.cwd());
    const operationId="11111111-1111-4111-8111-111111111111";
    const manifest={schema:"homecook.r2-controlled.v1",operationId,predecessor:deploy.RECORDING_PREDECESSOR,candidateSha:"a".repeat(40),candidateTree:"b".repeat(40),toolSha:"c".repeat(40),bundleSha256:bundle.bundleSha256,
      migrations:bundle.migrations.map(({filename,rawSha256,payloadSha256})=>({filename,rawSha256,payloadSha256})),limits:deploy.RECORDING_LIMITS,
      target:{composeProject:"homecook-full-local-isolated",postgresVolumeName:"homecook-full-local-postgres"},prestateHash:"d".repeat(64),postimage:"e".repeat(64),originalCheckHash:"f".repeat(64),immutableScopeHash:"c".repeat(64),
      changes:bundle.migrations.map(m=>({path:`supabase/migrations/${m.filename}`,before:null,after:m.rawSha256})),
      evidence:Object.fromEntries(["review","isolated","oldWebCompatibility"].map(name=>[name,{path:`/private/${name}`,sha256:"f".repeat(64)}])),
      operationDirectory:join(homedir(),".homecook/prelaunch-web/r2-operations",operationId),preparedCheckout:join(homedir(),".homecook/prelaunch-web/releases",`r2-${operationId}`,"checkout"),
      configPath:"/private/config",controlPath:"/private/control",envPath:"/private/env",envSha256:"a".repeat(64),predecessorPlistHash:"b".repeat(64),buildId:`r2-${operationId}`,
    };
    expect(deploy.validateRecordingManifest(manifest,bundle)).toMatch(/^[a-f0-9]{64}$/);
    for(const change of [
      {target:{...manifest.target,postgresVolumeName:"another-volume"}},{limits:{lockMs:5000,pauseMs:120001}},
      {candidateSha:"HEAD"},{bundleSha256:"0".repeat(64)},{migrations:manifest.migrations.slice(0,2)},
      {changes:[...manifest.changes,{path:"supabase/migrations/unknown.sql",before:null,after:"a".repeat(64)}]},
      {operationDirectory:"/private/old-backup"},{preparedCheckout:"/private/old-release"},
    ])expect(()=>deploy.validateRecordingManifest({...manifest,...change},bundle)).toThrow();
  });
  it("stages a closed web release only after exact database readback", async()=>{
    const receipt={planHash:"a"};
    const activate=vi.fn(),restore=vi.fn(),prepare=vi.fn(),verify=vi.fn();
    const options={receipt,readback:async()=>receipt,assertClosed:async()=>{},prepare,activate,verify,restore,verifyRestored:vi.fn()};
    await deploy.stageRecordingWeb(options);expect(activate).toHaveBeenCalledOnce();expect(restore).not.toHaveBeenCalled();
    activate.mockClear();
    await expect(deploy.stageRecordingWeb({...options,readback:async()=>null})).rejects.toThrow(/receipt/);
    expect(activate).not.toHaveBeenCalled();
    await expect(deploy.stageRecordingWeb({...options,assertClosed:async()=>{throw new Error("collection open");}})).rejects.toThrow(/collection/);
    expect(activate).not.toHaveBeenCalled();
  });
  it("restores only the web on a known committed DB and never on unknown readback",async()=>{
    const receipt={planHash:"a"};const restore=vi.fn();let reads=0;
    const options={receipt,readback:async()=>receipt,assertClosed:async()=>{},prepare:vi.fn(),activate:vi.fn(),verify:async()=>{throw new Error("web failure");},restore,verifyRestored:vi.fn()};
    await expect(deploy.stageRecordingWeb(options)).rejects.toThrow();expect(restore).toHaveBeenCalledOnce();restore.mockClear();
    await expect(deploy.stageRecordingWeb({...options,readback:async()=>++reads>=3?null:receipt})).rejects.toThrow();expect(restore).not.toHaveBeenCalled();
  });
  it("never enables from mock/stale provider evidence or a different release/key",()=>{
    expect(deploy).toHaveProperty("assertRecordingLiveProof");
    const now=Date.now(),secret="test-secret",sitekey="test-sitekey";
    const manifest={candidateSha:"a".repeat(40),buildId:"build-1"};
    const state={proofs:["mumeok_r2_recording","mumeok_r2_homeflow"].map(action=>({provider:"provider_live",release_sha:manifest.candidateSha,build_id:manifest.buildId,hostname:"app.mumeok.kr",action,verified_at:new Date(now).toISOString(),secret_sha256:deploy.hash(secret),sitekey_sha256:deploy.hash(sitekey)}))};
    expect(()=>deploy.assertRecordingLiveProof({manifest,state,secret,sitekey,now})).not.toThrow();
    for(const change of [{provider:"provider_mock"},{release_sha:"b".repeat(40)},{build_id:"old"},{secret_sha256:"0".repeat(64)},{verified_at:new Date(now-900001).toISOString()}]){
      expect(()=>deploy.assertRecordingLiveProof({manifest,state:{proofs:state.proofs.map(p=>({...p,...change}))},secret,sitekey,now})).toThrow();
    }
  });
  it("keeps production DB/provider calls at zero with env flags on and private collection control off",async()=>{
    const execute=vi.fn(),verifyTurnstile=vi.fn(),trustedIp=vi.fn(),acquireControlLease=vi.fn();
    const handle=createMarketingRound2Handler({
      config:readRound2RuntimeConfig({NODE_ENV:"production",MUMEOK_ROUND2_ENABLED:"true",MUMEOK_ROUND2_LEADS_ENABLED:"true"}),
      readControl:async()=>({version:1,collection_enabled:false,lead_enabled:false,consent_generation:1}),
      execute,verifyTurnstile,trustedIp,acquireControlLease,consumeRate:vi.fn(),leadReadiness:vi.fn(),now:()=>Date.parse("2026-09-12T00:00:00Z"),
    });
    const response=await handle(new Request("https://app.mumeok.kr/api/v1/marketing/round2",{method:"POST",headers:{host:"app.mumeok.kr",origin:"https://app.mumeok.kr","content-type":"application/json","sec-fetch-site":"same-origin"},body:JSON.stringify({action:"bootstrap",bootstrap_intent:"cookie_resume",topic:"recording",event_id:"11111111-1111-4111-8111-111111111111",round_version:"r2.1",honeypot:""})}));
    expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("ROUND2_DISABLED");
    for(const effect of [execute,verifyTurnstile,trustedIp,acquireControlLease])expect(effect).not.toHaveBeenCalled();
  });
  it("rejects concurrent invocation of the same operation and releases its mutex on handled failures",async()=>{
    const directory=await realpath(await mkdtemp(join(tmpdir(),"r2-invocation-")));
    let finish:()=>void=()=>{},entered:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const first=deploy.withRecordingInvocation(directory,async()=>{entered();await new Promise<void>(resolve=>{finish=resolve;});});
    try{
      await started;
      await expect(deploy.withRecordingInvocation(directory,async()=>{})).rejects.toThrow();
      finish();await first;
      await expect(deploy.withRecordingInvocation(directory,async()=>{throw new Error("handled failure");})).rejects.toThrow(/handled failure/);
      await expect(deploy.withRecordingInvocation(directory,async()=>"next")).resolves.toBe("next");
    }finally{finish();await first;await rm(directory,{recursive:true,force:true});}
  });
  it("requires signed trace-checked ingress receipts from this staged arm rather than file hashes or passed:true",()=>{
    const now=Date.now(),credentialHash="a".repeat(64),armHash="b".repeat(64),releaseSha="c".repeat(40),buildId="r2-test";
    const traceIp="203.0.113.7";
    const observation=(nonce:string)=>({version:1 as const,arm_sha256:armHash,release_sha:releaseSha,build_id:buildId,nonce,ip_hmac:preflightIngressDigest(credentialHash,armHash,nonce,traceIp),observed_at:new Date(now).toISOString(),observation_only:true as const});
    const normal=observation("d".repeat(64)),spoofed=observation("e".repeat(64));
    const proof=verifyPreflightIngressPair({credentialHash,armHash,releaseSha,buildId,traceIp,normal,spoofed});
    const input={manifest:{candidateSha:releaseSha,buildId},state:{arm_hash:armHash,ingress:[normal,spoofed]},arm:{credential_sha256:credentialHash,release_sha:releaseSha,build_id:buildId},armHash,proof,now};
    expect(()=>deploy.assertRecordingIngressProof(input)).not.toThrow();
    for(const fake of [{passed:true},{...proof,verification_hmac:"0".repeat(64)},{...proof,normal:{...normal,ip_hmac:"0".repeat(64)}},{...proof,spoofed:normal}]){
      expect(()=>deploy.assertRecordingIngressProof({...input,proof:fake})).toThrow();
    }
    expect(()=>deploy.assertRecordingIngressProof({...input,state:{...input.state,ingress:[normal]}})).toThrow();
    expect(()=>deploy.assertRecordingIngressProof({...input,now:now+900001})).toThrow();
  });
  it("uses actual loopback HTTP with the public Host/TLS headers for staged SSR probes",async()=>{
    const server=createServer((request,response)=>{
      expect(request.headers.host).toBe("app.mumeok.kr");expect(request.headers["x-forwarded-proto"]).toBe("https");
      response.end("exact-build");
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();
    if(!address||typeof address==="string")throw new Error("No local test port");
    try{expect(await deploy.probeRecordingWeb(address.port,"/beta/r2/recording")).toEqual({status:200,body:Buffer.from("exact-build")});}
    finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
