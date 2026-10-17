import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ROUND2_ROTATION_NAMES as names} from '../scripts/lib/round2-eight-key-rotation-fence.mjs';
import {ROTATION_BRIDGE as R,ROTATION_EVIDENCE_PIN,assertRotationEvidenceDigests,assertPinnedRound2ClosedMarkerRotationBridge,assertRound2ClosedMarkerRotationBridge as bridge,assertRotationBridgeToolBinding,confirmRotationBridgeTool} from '../scripts/lib/round2-closed-marker-rotation-bridge.mjs';
import {parsePrelaunchOptions} from '../scripts/lib/prelaunch-web-deploy.mjs';
const bytes=value=>Buffer.from(JSON.stringify(value)),hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const old=Object.fromEntries(names.map((name,i)=>[name,`fixture-old-${i}-never-a-secret`])),next=Object.fromEntries(names.map((name,i)=>[name,`fixture-new-${i}-never-a-secret`]));
  const beforePlist={WorkingDirectory:'/fixture/06a',ProgramArguments:['fixture-node','fixture-start'],EnvironmentVariables:{...old,MUMEOK_ROUND2_ENABLED:'false',MUMEOK_ROUND2_LEADS_ENABLED:'false',AUTH_KEY:'fixture-unchanged'}};
  const plist={...structuredClone(beforePlist),EnvironmentVariables:{...beforePlist.EnvironmentVariables,...next}},beforePlistBytes=bytes(beforePlist),candidate=hash(bytes(plist));
  const fence={version:1,purpose:'round2-eight-key-incident-20261017',denied_fingerprints:Object.fromEntries(names.map(n=>[n,hash(old[n])])),approved_fingerprints:Object.fromEntries(names.map(n=>[n,hash(next[n])]))};
  const fenceBytes=bytes(fence),controlBytes=bytes({collection_enabled:false,lead_enabled:false});
  const receiptBytes=bytes({version:1,status:'staged_not_applied',source_plist_sha256:hash(beforePlistBytes),candidate_plist_sha256:candidate,control_sha256:hash(controlBytes),collection_enabled:false,lead_enabled:false});
  const marker={targetPlistSha256:hash(beforePlistBytes),schema:'fixture-unchanged-historical-marker'};
  const before={ref:R.web,buildId:R.build,checkout:'/fixture/06a',targetPlistHash:hash(beforePlistBytes),closedR2:marker,unrelated:'fixture-preserved'};
  const rotation={version:1,fenceSha256:hash(fenceBytes),candidatePlistSha256:candidate,stageReceiptSha256:hash(receiptBytes),collectionEnabled:false,leadEnabled:false,reactivationReady:false};
  const state={...before,targetPlistHash:candidate,round2EightKeyRotation:rotation},beforeBytes=bytes(before),afterBytes=bytes(state);
  const journalBytes=bytes({version:1,phase:'committed',startup_eight_match:true,collector_disabled_verified:true,reactivation_ready:false,state_before_sha256:hash(beforeBytes),state_after_sha256:hash(afterBytes),stage_receipt_sha256:hash(receiptBytes),source_sha256:hash(beforePlistBytes),candidate_sha256:candidate,fence_sha256:hash(fenceBytes)});
  return {state,stateBytes:afterBytes,marker,live:{ref:R.web,buildId:R.build,cwd:'/fixture/06a',plistHash:candidate,plist},authority:{planSha256:R.capsule,plan:{webRef:R.target,round2Binding:{marker:rotation,fenceSha256:hash(fenceBytes),controlSha256:hash(controlBytes)}}},beforeBytes,afterBytes,receiptBytes,journalBytes,fenceBytes,controlBytes,armExists:false,beforePlistBytes,beforePlist};
}
test('explicit bridge proves historical and actual hashes separately without changing live/state/evidence',()=>{
  const f=fixture(),before=JSON.stringify(f),result=bridge(f);
  assert.deepEqual(result,{historicalPlistSha256:f.marker.targetPlistSha256,actualPlistSha256:f.live.plistHash});
  assert.notEqual(result.historicalPlistSha256,result.actualPlistSha256);assert.equal(JSON.stringify(f),before);
});
const mutateJSON=(f,key,mutate)=>{const value=JSON.parse(f[key]);mutate(value);f[key]=bytes(value);};
for(const field of ['beforeBytes','afterBytes','receiptBytes','journalBytes','fenceBytes','controlBytes','stateBytes','beforePlistBytes']){
  test(`missing or forged ${field} is rejected`,()=>{for(const v of [undefined,Buffer.from('{}')]){const f=fixture();f[field]=v;assert.throws(()=>bridge(f),/BRIDGE_INVALID/);}});
}
for(const [label,mutate] of Object.entries({
  wrongCapsule:f=>{f.authority.planSha256='a'.repeat(64);},wrongTarget:f=>{f.authority.plan.webRef='a'.repeat(40);},
  oldLiveHash:f=>{f.live.plistHash=f.marker.targetPlistSha256;},otherLiveHash:f=>{f.live.plistHash='a'.repeat(64);},
  unrelatedSetting:f=>{f.live.plist.EnvironmentVariables.AUTH_KEY='fixture-changed';},argumentChange:f=>{f.live.plist.ProgramArguments.push('fixture-arg');},
  oldKey:f=>{f.live.plist.EnvironmentVariables[names[0]]=f.beforePlist.EnvironmentVariables[names[0]];},
  enabled:f=>{f.live.plist.EnvironmentVariables.MUMEOK_ROUND2_ENABLED='true';},armed:f=>{f.armExists=true;},
  stateExtra:f=>{f.state.extra='fixture';},historicalMarker:f=>{f.marker.targetPlistSha256='a'.repeat(64);},
  uncommitted:f=>mutateJSON(f,'journalBytes',v=>{v.phase='installed';}),unverified:f=>mutateJSON(f,'journalBytes',v=>{v.startup_eight_match=false;}),
  journalRetarget:f=>mutateJSON(f,'journalBytes',v=>{v.state_before_sha256='a'.repeat(64);}),
  collectorOn:f=>mutateJSON(f,'controlBytes',v=>{v.collection_enabled=true;}),
  matchingExtraState:f=>{f.state.unrelated='fixture-changed';f.afterBytes=bytes(f.state);f.stateBytes=f.afterBytes;mutateJSON(f,'journalBytes',v=>{v.state_after_sha256=hash(f.afterBytes);});},
  matchingSettingHash:f=>{f.live.plist.EnvironmentVariables.AUTH_KEY='fixture-changed';f.live.plistHash=hash(bytes(f.live.plist));},
}))test(`bridge rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>bridge(f),/BRIDGE_INVALID/);});

test('independently pinned exact event rejects a self-consistent replacement proof',()=>{
  assert.doesNotThrow(()=>bridge(fixture()));
  assert.throws(()=>assertPinnedRound2ClosedMarkerRotationBridge(fixture()),/BRIDGE_INVALID/);
  assert.doesNotThrow(()=>assertRotationEvidenceDigests({...ROTATION_EVIDENCE_PIN}));
  for(const key of Object.keys(ROTATION_EVIDENCE_PIN))assert.throws(()=>assertRotationEvidenceDigests({...ROTATION_EVIDENCE_PIN,[key]:'a'.repeat(64)}));
});
function tool(){return {toolRef:'a'.repeat(40),requestedToolRef:'a'.repeat(40),targetRef:R.target,capsuleSha256:R.capsule,clean:true,ownRepository:true,untrackedPaths:[],digests:Object.fromEntries(['scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs','scripts/lib/round2-closed-marker-rotation-bridge.mjs','tests/round2-closed-marker-rotation-bridge.test.mjs'].map(p=>[p,[null,'b'.repeat(64)]]))};}
test('exact tool source is separate from the unchanged target and capsule',()=>{
  const t=tool();assert.equal(assertRotationBridgeToolBinding(t).targetRef,R.target);
  for(const change of [{requestedToolRef:'c'.repeat(40)},{targetRef:t.toolRef},{capsuleSha256:'c'.repeat(64)},{clean:false},{ownRepository:false},{digests:{...t.digests,'lib/server/unreviewed.ts':[null,'c'.repeat(64)]}},{digests:{...t.digests,'scripts/lib/other.mjs':[null,'c'.repeat(64)]}},{digests:{}}])assert.throws(()=>assertRotationBridgeToolBinding({...t,...change}));
  const parsed=parsePrelaunchOptions(['--reviewed-ref',R.target,'--rotation-bridge-tool-ref',t.toolRef]);assert.equal(parsed.rotationBridgeToolRef,t.toolRef);
});
test('nonTTY or rejection cannot approve or perform any operation; exact source is displayed before confirmation',async()=>{
  const review=assertRotationBridgeToolBinding(tool()),tty={platform:'darwin',stdinTTY:true,stdoutTTY:true,stderrTTY:true},events=[];
  const display=v=>events.push(v),confirm=async()=>{events.push('confirm');return 'V85-BRIDGE';};
  for(const field of ['stdinTTY','stdoutTTY','stderrTTY'])await assert.rejects(confirmRotationBridgeTool(review,{...tty,[field]:false},display,confirm));
  assert.deepEqual(events,[]);
  await assert.rejects(confirmRotationBridgeTool(review,tty,display,async()=> 'CANCEL'));
  events.length=0;await confirmRotationBridgeTool(review,tty,display,confirm);
  assert.equal(events[0].toolRef,tool().toolRef);assert.equal(events[0].capsuleSha256,R.capsule);assert.equal(events[1],'confirm');
});
test('untracked execution helpers are rejected even if a caller reports tracked files clean',()=>{
  assert.throws(()=>assertRotationBridgeToolBinding({...tool(),untrackedPaths:['scripts/lib/fixture-untracked-helper.mjs']}));
  const source=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8').slice(readFileSync('scripts/deploy-prelaunch-web.mjs','utf8').indexOf('async function reviewRotationBridgeTool'));
  assert.match(source,/clean:git\(\['status','--porcelain'\]\)/);
  assert.match(source,/untrackedPaths:git\(\['ls-files','--others','--exclude-standard'\]\)/);
});
test('actual deployment wires explicit proof and user gate before any logs, locks or service changes',()=>{
  const source=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8'),main=source.slice(source.indexOf('async function main()'));
  assert.match(source,/rotationBridge: closedMarkerRotationBridge\(recorded.state,marker,live\)/);
  const gate=main.indexOf("if(action==='deploy')await reviewRotationBridgeTool(action,options)");
  assert.ok(gate>0&&gate<main.indexOf('mkdirSync(join(root, "releases")')&&gate<main.indexOf('const lock = acquirePrelaunchDeployLock()'));
  const common=readFileSync('scripts/lib/prelaunch-web-deploy.mjs','utf8');assert.match(common,/actualPlistSha256 \?\? marker.targetPlistSha256/);
  assert.doesNotMatch(source,/live\.plistHash\s*=/);
});
