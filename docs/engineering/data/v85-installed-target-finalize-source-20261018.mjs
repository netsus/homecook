import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, lstatSync, unlinkSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquirePrelaunchDeployLock, acquireClosedR2ControlLease, loadClosedR2Review, readClosedR2PrivateBytes, restartLaunchAgent } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/prelaunch-web-deploy.mjs';
import { guardRound2EightKeyRestart, assertRound2EightKeyFence, preserveRound2RotationState } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/round2-eight-key-rotation-fence.mjs';
import { durableJson } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/marketing-round2-controlled-deploy.mjs';
import { readUnstartedLaunchAgent } from '/private/tmp/homecook-v85-reader-attempt-closeout-20261018/scripts/lib/v85-unstarted-web-closeout.mjs';
import { verifyReaderRepairCompensationPreflight, readReaderRepairAuthority, readerRepairEnvironment, READER_REPAIR as R } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/v85-web-reader-repair.mjs';
const HOME=homedir(), root=join(HOME,'.homecook/prelaunch-web'), plist=join(HOME,'Library/LaunchAgents/com.homecook.production.plist');
const read=p=>readClosedR2PrivateBytes(p,R.executor,524288), hash=b=>createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('V85_INSTALLED_BOOTSTRAP_'+c);};
const env=readerRepairEnvironment(), service=`gui/${process.getuid()}/com.homecook.production`, bootstrapDirectory=join(root,'v85-installed-target-bootstrap-20261018'),directory=join(root,'v85-installed-target-finalize-20261018');
const pins={state:'2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f',recovery:'e572a73fa3b0fdd8f783fd2c9320ecbe2e4a289b12b6f8bf9e573cddd3ebfc2f',plist:'f39ce0690e6ab6630355aff021092ac4213d7447c6199cc8e01e026f2d523cba',build:'prelaunch-15b1a36f9b4c-DVzl4n',tool:'aa477759f46dd1973593a50867070e98f0ab68c9'};
const run=(bin,args,options={})=>{const x=spawnSync(bin,args,{env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,...options});check(x.status===0,'READ_ONLY_PROOF');return x.stdout.trim();};
const loaded=()=>spawnSync('/bin/launchctl',['print',service],{env,stdio:'ignore'}).status===0;
const noListener=()=>{const x=spawnSync('/usr/sbin/lsof',['-nP','-iTCP:3100','-sTCP:LISTEN','-t'],{env,encoding:'utf8'});check(x.status===1&&x.stdout.trim()==='','LISTENER_PRESENT');};
function unchanged(expectedState=pins.state, active=true){
 const worker=spawnSync('/bin/launchctl',['print',`gui/${process.getuid()}/com.homecook.youtube-extraction-worker`],{env,encoding:'utf8'});check(worker.status===0&&/\bpid = 49750\b/u.test(worker.stdout)&&/\bstate = running\b/u.test(worker.stdout),'WORKER_CHANGED');
 check(run('/usr/bin/git',['-C','/private/tmp/homecook-v85-reader-attempt-closeout-20261018','rev-parse','HEAD'])==='e057c61d164396a0bde9373ef57dd9db09c5a281','PLIST_READER_SOURCE');
 check(run('/usr/bin/git',['-C','/private/tmp/homecook-v85-reader-attempt-closeout-20261018','status','--porcelain'])==='','PLIST_READER_DIRTY');
 check(hash(read(join(root,'state.json')))===expectedState&&hash(read(active?join(root,'recovery.json'):join(directory,'recovery.json')))===pins.recovery,'RECORD_DRIFT');
 const bytes=readUnstartedLaunchAgent(plist), p=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{input:bytes}));
 check(hash(bytes)===pins.plist,'PLIST_DRIFT');
 const record=JSON.parse(read(active?join(root,'recovery.json'):join(directory,'recovery.json')));
 check(record.ref===R.target&&record.buildId===pins.build&&record.targetPlistHash===pins.plist&&p.WorkingDirectory===record.checkout,'EXACT_TARGET');
 check(run('/usr/bin/git',['-C',record.checkout,'rev-parse','HEAD'])===R.target&&run('/usr/bin/git',['-C',record.checkout,'status','--porcelain','--untracked-files=no'])==='','TARGET_SOURCE');
 check(readFileSync(join(record.checkout,'.next/BUILD_ID'),'utf8').trim()===pins.build,'BUILD');
 check(run('/usr/bin/git',['-C',R.executor,'rev-parse','HEAD'])===pins.tool&&run('/usr/bin/git',['-C',R.executor,'status','--porcelain'])==='','EXECUTOR_SOURCE');
 assertRound2EightKeyFence(p.EnvironmentVariables,JSON.parse(read(join(root,'round2-eight-key-rotation-fence.json'))));
 check(['MUMEOK_ROUND2_ENABLED','MUMEOK_ROUND2_LEADS_ENABLED'].every(k=>p.EnvironmentVariables[k]==='false'),'OFF');
 readReaderRepairAuthority(); return {bytes,p,record};
}
const expectedProcesses=[{pid:39019,ppid:1,start:'Sun Oct 18 11:06:56 2026'},{pid:39025,ppid:39019,start:'Sun Oct 18 11:06:57 2026'}];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function runtime(actual){
 const script=`import importlib.util,json,sys\nfrom pathlib import Path\nimport urllib.request,urllib.error\ns=importlib.util.spec_from_file_location('r2apply',sys.argv[1]);a=importlib.util.module_from_spec(s);s.loader.exec_module(a)\ncwd=Path(sys.argv[2]);rows=a.census(cwd);f=json.loads(a.stage.private_file(Path.home()/'.homecook/prelaunch-web/round2-eight-key-rotation-fence.json'))\nfor row in rows:a.require(a.process_fingerprints(row,cwd)==f['approved_fingerprints'],'STARTUP_EIGHT')\na.require(a.census(cwd)==rows,'PROCESS_CHANGED')\no=urllib.request.build_opener(urllib.request.ProxyHandler({}));r=urllib.request.Request('http://127.0.0.1:3100/api/v1/marketing/round2',data=b'{}',method='POST',headers={'Host':'app.mumeok.kr','Origin':'https://app.mumeok.kr','Content-Type':'application/json'})\ntry:o.open(r,timeout=5);raise RuntimeError('R2_NOT_OFF')\nexcept urllib.error.HTTPError as e:a.require(e.code==503 and json.loads(e.read(8192)).get('error',{}).get('code')=='ROUND2_DISABLED','R2_NOT_OFF')\nprint(json.dumps(rows))`;
 const rows=JSON.parse(run('/usr/bin/python3',['-B','-c',script,join(R.frozen,'scripts/round2-eight-key-user-apply.py'),actual.record.checkout]));check(same(rows,expectedProcesses),'RUNTIME_CHANGED');return rows;
}
async function http(actual){
 for(const p of ['/','/login','/privacy'])check((await fetch('http://127.0.0.1:3100'+p,{signal:AbortSignal.timeout(5000)})).status===200,'PUBLIC_HTTP');
 const r=await fetch('http://127.0.0.1:3100/_next/static/'+pins.build+'/_buildManifest.js',{signal:AbortSignal.timeout(5000)});
 check(r.ok&&hash(Buffer.from(await r.arrayBuffer()))===hash(readFileSync(join(actual.record.checkout,'.next/static',pins.build,'_buildManifest.js'))),'MANIFEST');
}
function fullDatabase(){
 const url=p=>JSON.stringify(pathToFileURL(join(R.frozen,p)).href);
 const code=`import{readV85Authority}from ${url('scripts/lib/youtube-v85-cutover.mjs')};import{readClosedR2PrivateBytes}from ${url('scripts/lib/prelaunch-web-deploy.mjs')};import{verifyV85AuthSuccessorWebBoundary}from ${url('scripts/youtube-v85-controlled-cutover.mjs')};const a=readV85Authority(p=>readClosedR2PrivateBytes(p,${JSON.stringify(R.frozen)},524288));await verifyV85AuthSuccessorWebBoundary(a);process.stdout.write('DB232_43_49_THREE_ANCHORS_UNCHANGED');`;
 check(run(join(HOME,'.nvm/versions/node/v22.19.0/bin/node'),['--input-type=module','-e',code])==='DB232_43_49_THREE_ANCHORS_UNCHANGED','FULL_DATABASE');
}
function syncDirectory(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function createBytes(path,bytes){const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(directory);check(read(path).equals(bytes),'ARCHIVE');}
async function main(){
 const [action]=process.argv.slice(2);check(['plan','apply'].includes(action)&&process.argv.length===3,'ACTION');
 const lock=await acquirePrelaunchDeployLock();let lease;
 try{
  lease=await acquireClosedR2ControlLease(loadClosedR2Review(R.executor),R.executor);
  const actual=unchanged();check(loaded(),'SERVICE_NOT_LOADED');check(!existsSync(directory),'EXISTING_FINALIZATION');check(!existsSync(join(bootstrapDirectory,'started.json')),'EXISTING_STARTED_RECEIPT');
  const bootstrapIntentBytes=read(join(bootstrapDirectory,'intent.json')),bootstrapIntent=JSON.parse(bootstrapIntentBytes);
  check(bootstrapIntent.scriptSha256==='68b9dc6c5bd460d1840b910bb200af9042b59278c63842954e4c9085d60bc7ae'&&bootstrapIntent.plist===pins.plist&&bootstrapIntent.recovery===pins.recovery&&bootstrapIntent.tool===pins.tool,'BOOTSTRAP_INTENT');
  const beforeBytes=read(join(root,'state.json')),recoveryBytes=read(join(root,'recovery.json'));const current=JSON.parse(beforeBytes),record=JSON.parse(recoveryBytes);
  const prior=read(join(record.checkout,'../previous-closed-state.json'));
  check(prior.equals(Buffer.from(JSON.stringify(current)+'\n'))&&hash(prior)===record.closedR2.previousStateSha256,'EXACT_PREDECESSOR');
  for(const file of [record.backup,join(record.checkout,'../closed-rollback.plist')])check(hash(read(file))==='7cc55b987327bd7eab11d44225e86af122481c701ce5dc153dc8284a00ce40d4','NEW_KEY_BACKUP');
  const markerBytes=read(join(record.checkout,'../round2-closed-maintenance.json')),marker={...record.closedR2};delete marker.artifactSha256;
  check(hash(markerBytes)===record.closedR2.artifactSha256&&same(JSON.parse(markerBytes),marker),'EXACT_PREPARED_MARKER');
  const target=preserveRound2RotationState(current,record),targetBytes=Buffer.from(JSON.stringify(target)),targetSha256=hash(targetBytes);
  check(target.ref===R.target&&target.buildId===pins.build&&same(target.round2EightKeyRotation,current.round2EightKeyRotation),'TARGET_STATE');
  runtime(actual);await http(actual);fullDatabase();unchanged();runtime(actual);lease.verify();
  const intent={schema:'homecook.v85-installed-target-finalize.v1',scriptSha256:hash(readFileSync(new URL(import.meta.url))),bootstrapIntentSha256:hash(bootstrapIntentBytes),...pins,targetStateSha256:targetSha256,processes:expectedProcesses,webRef:R.target,capsule:R.capsule,databaseWrites:0,credentialChanges:0,serviceRestarts:0,plistWrites:0};
  if(action==='plan'){console.log(JSON.stringify({ready:true,...intent}));return;}
  mkdirSync(directory,{mode:0o700});await durableJson(join(directory,'intent.json'),intent,true);
  createBytes(join(directory,'state-before.json'),beforeBytes);createBytes(join(directory,'recovery.json'),recoveryBytes);createBytes(join(directory,'state-after.json'),targetBytes);
  unchanged();runtime(actual);lease.verify();check(!existsSync(join(bootstrapDirectory,'started.json')),'EXISTING_STARTED_RECEIPT');
  const stateFile=join(root,'state.json'),old=lstatSync(stateFile),temporary=join(directory,'state-publication.json');
  createBytes(temporary,targetBytes);check(lstatSync(stateFile).ino===old.ino&&read(stateFile).equals(beforeBytes),'PRE_PUBLICATION_DRIFT');
  renameSync(temporary,stateFile);syncDirectory(root);syncDirectory(directory);check(read(stateFile).equals(targetBytes),'PUBLICATION');
  // The same full preimage must still hold after metadata publication and before removing pending recovery.
  unchanged(targetSha256);runtime(actual);await http(actual);fullDatabase();unchanged(targetSha256);runtime(actual);lease.verify();
  check(read(join(directory,'recovery.json')).equals(recoveryBytes),'ARCHIVE_CHANGED');
  const recoveryFile=join(root,'recovery.json'),active=lstatSync(recoveryFile);
  check(read(recoveryFile).equals(recoveryBytes)&&lstatSync(recoveryFile).ino===active.ino,'RECOVERY_CHANGED');
  unlinkSync(recoveryFile);syncDirectory(root);
  unchanged(targetSha256,false);runtime(actual);lease.verify();check(!existsSync(recoveryFile),'RECOVERY_REAPPEARED');
  const result={webTransitioned:true,webRef:R.target,buildId:pins.build,stateSha256:targetSha256,processes:expectedProcesses,actualStartupEightMatch:true,round2Off:true,publicHttp200:true,dbLedger:232,jobs:43,workerGeneration:49,workerPid:49750,originalAuthoritiesPreserved:true,credentialIssued:false,recoveryPending:false,serviceRestarts:0,plistWrites:0};
  await durableJson(join(bootstrapDirectory,'started.json'),{...result,bootstrapIntentSha256:hash(bootstrapIntentBytes),verificationContinuationScriptSha256:intent.scriptSha256,initialProbeClientMismatch:true},true);
  await durableJson(join(directory,'complete.json'),{...intent,...result,phase:'complete'},true);
  console.log(JSON.stringify(result));
 }finally{try{if(lease)await lease.release();}finally{await lock.release();}}
}
main().catch(e=>{console.error(e.message?.startsWith('V85_INSTALLED_BOOTSTRAP_')?e.message:'V85_INSTALLED_FINALIZE_STOPPED');process.exitCode=1;});
