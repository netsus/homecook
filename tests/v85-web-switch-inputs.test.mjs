import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { restartLaunchAgent, deployTransaction, assertClosedR2CompensationTarget, assertProtectedReaderRollback } from '../scripts/lib/prelaunch-web-deploy.mjs';
import { guardRound2EightKeyRestart, assertRound2EightKeyFence, ROUND2_ROTATION_NAMES as names } from '../scripts/lib/round2-eight-key-rotation-fence.mjs';
const cli=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
const nextKeys=Object.fromEntries(names.map((n,i)=>[n,'fixture-next-'+i])),oldKeys=Object.fromEntries(names.map((n,i)=>[n,'fixture-old-'+i]));
const fence={version:1,purpose:'round2-eight-key-incident-20261017',approved_fingerprints:Object.fromEntries(names.map(n=>[n,hash(nextKeys[n])])),denied_fingerprints:Object.fromEntries(names.map(n=>[n,hash(oldKeys[n])]))};
const serialize=p=>execFileSync('/usr/bin/plutil',['-convert','xml1','-o','-','--','-'],{input:JSON.stringify(p),encoding:'utf8'}).trim();
const parse=bytes=>JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{input:bytes,encoding:'utf8'}));
const plist=cwd=>({WorkingDirectory:cwd,EnvironmentVariables:{...nextKeys,MUMEOK_ROUND2_ENABLED:'false',MUMEOK_ROUND2_LEADS_ENABLED:'false',UNCHANGED:'fixture-한국어'}});
function switching(){
 let installed=Buffer.from(serialize(plist('/before'))),loaded=true,stops=0,starts=0,tamper=false;const written=[];
 const deps={restartLaunchAgent,guardRound2EightKeyRestart,assertRound2RestartFence:env=>assertRound2EightKeyFence(env,fence),parsePlist:parse,
  service:'fixture-service',domain:'fixture-domain',plistPath:'/fixture.plist',logFd:42,DeploymentError:Error,delay:async()=>{},
  readFileSync:()=>tamper?Buffer.from('changed after write'):installed,
  atomicWrite:(_path,bytes)=>{written.push(bytes);installed=Buffer.from(bytes);},
  command:(_bin,args)=>{assert.equal(args[0],'bootout');loaded=false;stops++;},
  spawnSync:(_bin,args)=>{if(args[0]==='print')return {status:loaded?0:1};assert.equal(args[0],'bootstrap');loaded=true;starts++;return {status:0};}};
 const source=cli.slice(cli.indexOf('async function switchWeb(bytes)'),cli.indexOf('\nasync function verifyAppliedDatabase'));
 const switchWeb=new Function(...Object.keys(deps),source+';return switchWeb;')(...Object.values(deps));
 return {switchWeb,installed:()=>installed,counts:()=>({stops,starts}),written,tamper:()=>{tamper=true;}};
}
for(const type of ['string','Buffer'])test('actual switchWeb normal deploy and Buffer compensation with '+type+' XML input',async()=>{
 const h=switching(),newXml=serialize(plist('/next')),previous=Buffer.from(serialize(plist('/before')));
 const input=type==='string'?newXml:Buffer.from(newXml);
 await assert.rejects(deployTransaction({prepare:async()=>{},activate:()=>h.switchWeb(input),verify:async()=>{throw Error('forced new-web verification failure');},
  restore:()=>h.switchWeb(previous),verifyRestored:async()=>{assert.deepEqual(h.installed(),previous);}}),/이전 웹 복구 완료/);
 assert.deepEqual(h.counts(),{stops:2,starts:2});assert.equal(h.written.every(Buffer.isBuffer),true);
 for(const p of h.written){const v=parse(p);assertRound2EightKeyFence(v.EnvironmentVariables,fence);assert.equal(v.EnvironmentVariables.UNCHANGED,'fixture-한국어');}
});
for(const type of ['string','Buffer'])test('actual switchWeb detects changed installed bytes before bootstrap for '+type,async()=>{
 const h=switching();h.tamper();const xml=serialize(plist('/next'));
 await assert.rejects(h.switchWeb(type==='string'?xml:Buffer.from(xml)),/R2_ROTATION_INSTALLED_TARGET_CHANGED/);
 assert.equal(h.counts().starts,0);
});
test('old-key target is rejected before stopping the healthy service',async()=>{
 const h=switching(),p=plist('/next');p.EnvironmentVariables[names[0]]=oldKeys[names[0]];
 await assert.rejects(h.switchWeb(serialize(p)));assert.deepEqual(h.counts(),{stops:0,starts:0});
});
function compensation(mode){
 const predecessor='1'.repeat(40),release='2'.repeat(40),floor='e'.repeat(40),from='06a3369f5c5e1c3ca49045f370f0ce12f049c805',to='15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9';
 const proofBytes=Buffer.from('{"fixture":"reviewed-handoff"}'),maintenance={pointer:{sha256:'fixture-authority'},review:{sourceReaderRef:floor,migrationSourceRef:'d'.repeat(40),database:{after:['fixture-ledger']}}};
 const previous=Buffer.from('fixture-new-eight-before'),next=Buffer.from('fixture-new-eight-target'),live={ref:from,cwd:'/before',buildId:'before',bytes:previous};
 const state={ref:to,checkout:'/target',buildId:'target',targetPlistHash:hash(next),closedR2:{from}};let started=0,validated=0;
 const deps={repository:'/fixture',V74_WEB_PREDECESSOR:predecessor,V74_RELEASE:release,V74_WEB_HANDOFF_SHA256:mode==='missing-proof'?null:hash(proofBytes),V74_OPERATION_DIRECTORY:'/operation',hash,join:(...v)=>v.join('/'),DeploymentError:Error,
  readClosedR2PrivateBytes:path=>path.endsWith('web-handoff.json')?(mode==='changed-proof'?Buffer.from('{}'):proofBytes):Buffer.from(JSON.stringify({schema:'homecook.prelaunch-protected-reader.v1',backwardCompatible:false,readerFloor:floor})),
  loadCurrentDatabaseMaintenance:()=>maintenance,
  assertV74WebHandoff:input=>{assert.deepEqual(input,{proof:JSON.parse(proofBytes),maintenance:maintenance.pointer,ledger:maintenance.review.database.after});if(mode==='invalid-authority')throw Error('invalid authority');validated++;},verifiedV74Source:()=>{},
  spawnSync:(_bin,args)=>{const [a,b]=args.slice(-2);return {status:(a===floor&&b===predecessor)||(a===release&&b===from&&mode!=='wrong-descendant')?0:1};},
  protectedReader:false,closedLease:{verify:()=>{}},readerFence:null,closedRollbackBytes:previous,live,state,rollout:{feature:'fixture'},protectedReaderReceiptPath:'/receipt',
  current:()=>({ref:to,cwd:'/target',buildId:'target',bytes:next}),assertClosedR2CompensationTarget,
  preserveClosedR2PredecessorMarker:async()=>{},closedReview:{},assertProtectedReaderRollback,
  switchWeb:async bytes=>{assert.ok(Buffer.isBuffer(bytes));assert.deepEqual(bytes,previous);started++;},
  git:()=>{throw Error('unreviewed raw ancestry shortcut');}};
 const ancestor=cli.slice(cli.indexOf('function approvedSourceAncestor('),cli.indexOf('\nfunction v85Authority()'));
 const start=cli.indexOf('    restore: async () => {',cli.indexOf('async function deploy(options)'));
 const body=cli.slice(start,cli.indexOf('\n    verifyRestored:',start));
 const restore=new Function(...Object.keys(deps),ancestor+';return ({'+body+'}).restore;')(...Object.values(deps));
 return {restore,started:()=>started,validated:()=>validated};
}
test('actual restore accepts only the existing pinned handoff for both maintenance and reader floor',async()=>{
 const h=compensation('valid');await h.restore();assert.equal(h.started(),1);assert.equal(h.validated(),2);
});
for(const mode of ['missing-proof','changed-proof','invalid-authority','wrong-descendant'])test('actual restore refuses '+mode+' without touching service',async()=>{
 const h=compensation(mode);await assert.rejects(h.restore());assert.equal(h.started(),0);
});
