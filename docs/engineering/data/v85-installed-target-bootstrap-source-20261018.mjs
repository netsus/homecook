import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquirePrelaunchDeployLock, acquireClosedR2ControlLease, loadClosedR2Review, readClosedR2PrivateBytes, restartLaunchAgent } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/prelaunch-web-deploy.mjs';
import { guardRound2EightKeyRestart, assertRound2EightKeyFence } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/round2-eight-key-rotation-fence.mjs';
import { durableJson } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/marketing-round2-controlled-deploy.mjs';
import { readUnstartedLaunchAgent } from '/private/tmp/homecook-v85-reader-attempt-closeout-20261018/scripts/lib/v85-unstarted-web-closeout.mjs';
import { verifyReaderRepairCompensationPreflight, readReaderRepairAuthority, readerRepairEnvironment, READER_REPAIR as R } from '/private/tmp/homecook-v85-web-reader-repair-20261018/scripts/lib/v85-web-reader-repair.mjs';
const HOME=homedir(), root=join(HOME,'.homecook/prelaunch-web'), plist=join(HOME,'Library/LaunchAgents/com.homecook.production.plist');
const read=p=>readClosedR2PrivateBytes(p,R.executor,524288), hash=b=>createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('V85_INSTALLED_BOOTSTRAP_'+c);};
const env=readerRepairEnvironment(), service=`gui/${process.getuid()}/com.homecook.production`, directory=join(root,'v85-installed-target-bootstrap-20261018');
const pins={state:'2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f',recovery:'e572a73fa3b0fdd8f783fd2c9320ecbe2e4a289b12b6f8bf9e573cddd3ebfc2f',plist:'f39ce0690e6ab6630355aff021092ac4213d7447c6199cc8e01e026f2d523cba',build:'prelaunch-15b1a36f9b4c-DVzl4n',tool:'aa477759f46dd1973593a50867070e98f0ab68c9'};
const run=(bin,args,options={})=>{const x=spawnSync(bin,args,{env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,...options});check(x.status===0,'READ_ONLY_PROOF');return x.stdout.trim();};
const loaded=()=>spawnSync('/bin/launchctl',['print',service],{env,stdio:'ignore'}).status===0;
const noListener=()=>{const x=spawnSync('/usr/sbin/lsof',['-nP','-iTCP:3100','-sTCP:LISTEN','-t'],{env,encoding:'utf8'});check(x.status===1&&x.stdout.trim()==='','LISTENER_PRESENT');};
function unchanged(){
 const worker=spawnSync('/bin/launchctl',['print',`gui/${process.getuid()}/com.homecook.youtube-extraction-worker`],{env,encoding:'utf8'});check(worker.status===0&&/\bpid = 49750\b/u.test(worker.stdout)&&/\bstate = running\b/u.test(worker.stdout),'WORKER_CHANGED');
 check(run('/usr/bin/git',['-C','/private/tmp/homecook-v85-reader-attempt-closeout-20261018','rev-parse','HEAD'])==='e057c61d164396a0bde9373ef57dd9db09c5a281','PLIST_READER_SOURCE');
 check(run('/usr/bin/git',['-C','/private/tmp/homecook-v85-reader-attempt-closeout-20261018','status','--porcelain'])==='','PLIST_READER_DIRTY');
 check(hash(read(join(root,'state.json')))===pins.state&&hash(read(join(root,'recovery.json')))===pins.recovery,'RECORD_DRIFT');
 const bytes=readUnstartedLaunchAgent(plist), p=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{input:bytes}));
 check(hash(bytes)===pins.plist,'PLIST_DRIFT');
 const record=JSON.parse(read(join(root,'recovery.json')));
 check(record.ref===R.target&&record.buildId===pins.build&&record.targetPlistHash===pins.plist&&p.WorkingDirectory===record.checkout,'EXACT_TARGET');
 check(run('/usr/bin/git',['-C',record.checkout,'rev-parse','HEAD'])===R.target&&run('/usr/bin/git',['-C',record.checkout,'status','--porcelain','--untracked-files=no'])==='','TARGET_SOURCE');
 check(readFileSync(join(record.checkout,'.next/BUILD_ID'),'utf8').trim()===pins.build,'BUILD');
 check(run('/usr/bin/git',['-C',R.executor,'rev-parse','HEAD'])===pins.tool&&run('/usr/bin/git',['-C',R.executor,'status','--porcelain'])==='','EXECUTOR_SOURCE');
 assertRound2EightKeyFence(p.EnvironmentVariables,JSON.parse(read(join(root,'round2-eight-key-rotation-fence.json'))));
 check(['MUMEOK_ROUND2_ENABLED','MUMEOK_ROUND2_LEADS_ENABLED'].every(k=>p.EnvironmentVariables[k]==='false'),'OFF');
 readReaderRepairAuthority(); return {bytes,p,record};
}
async function main(){
 const [action]=process.argv.slice(2);check(['plan','apply'].includes(action)&&process.argv.length===3,'ACTION');
 const lock=await acquirePrelaunchDeployLock();let lease;
 try{
  lease=await acquireClosedR2ControlLease(loadClosedR2Review(R.executor),R.executor);
  let actual=unchanged();check(!loaded(),'SERVICE_ALREADY_LOADED');
  noListener();verifyReaderRepairCompensationPreflight();
  const url=p=>JSON.stringify(pathToFileURL(join(R.frozen,p)).href);
  const proof=`import{readV85Authority}from ${url('scripts/lib/youtube-v85-cutover.mjs')};import{readClosedR2PrivateBytes}from ${url('scripts/lib/prelaunch-web-deploy.mjs')};import{verifyV85AuthSuccessorWebBoundary}from ${url('scripts/youtube-v85-controlled-cutover.mjs')};const a=readV85Authority(p=>readClosedR2PrivateBytes(p,${JSON.stringify(R.frozen)},524288));await verifyV85AuthSuccessorWebBoundary(a);process.stdout.write('FULL_DB_AND_THREE_AUTHORITIES_UNCHANGED');`;
  check(run(join(HOME,'.nvm/versions/node/v22.19.0/bin/node'),['--input-type=module','-e',proof])==='FULL_DB_AND_THREE_AUTHORITIES_UNCHANGED','FULL_DATABASE');
  lease.verify();actual=unchanged();check(!loaded(),'SERVICE_CHANGED');noListener();
  const intent={schema:'homecook.v85-installed-target-bootstrap.v1',...pins,webRef:R.target,capsule:R.capsule,scriptSha256:hash(readFileSync(new URL(import.meta.url))),databaseWrites:0,credentialChanges:0,plistWrites:0,action:'bootstrap-existing-exact-reviewed-target'};
  if(action==='plan'){console.log(JSON.stringify({ready:true,...intent}));return;}
  check(!existsSync(directory),'EXISTING_ATTEMPT');mkdirSync(directory,{mode:0o700});await durableJson(join(directory,'intent.json'),intent,true);
  await restartLaunchAgent(guardRound2EightKeyRestart({isLoaded:async()=>loaded(),bootout:async()=>{throw Error('V85_INSTALLED_BOOTSTRAP_NO_STOP');},
   writePlist:async()=>{unchanged();lease.verify();},bootstrap:async()=>{lease.verify();unchanged();check(!loaded(),'SERVICE_BEFORE_BOOTSTRAP');noListener();return spawnSync('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,plist],{env,stdio:'ignore'}).status;},wait:ms=>new Promise(r=>setTimeout(r,ms))},()=>{unchanged();lease.verify();}));
  for(let i=0;i<20;i++){
   try{const response=await fetch('http://127.0.0.1:3100/_next/static/'+pins.build+'/_buildManifest.js',{signal:AbortSignal.timeout(2000)});
    if(response.ok&&hash(Buffer.from(await response.arrayBuffer()))===hash(readFileSync(join(actual.record.checkout,'.next/static',pins.build,'_buildManifest.js'))))break;
   }catch{}
   check(i<19,'HTTP_NOT_READY');await new Promise(r=>setTimeout(r,500));
  }
  unchanged();lease.verify();check(loaded(),'POST_SERVICE');
  const runtimeScript = `import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('r2apply',sys.argv[1]);a=importlib.util.module_from_spec(s);s.loader.exec_module(a)\ncwd=Path(sys.argv[2]);rows=a.census(cwd);f=json.loads(a.stage.private_file(Path.home()/'.homecook/prelaunch-web/round2-eight-key-rotation-fence.json'))\nfor row in rows: a.require(a.process_fingerprints(row,cwd)==f['approved_fingerprints'],'PROCESS_KEYS_NOT_LOADED')\na.require(a.census(cwd)==rows,'PROCESS_CHANGED');print(json.dumps(rows))`;
  const processes=JSON.parse(run('/usr/bin/python3',['-B','-c',runtimeScript,join(R.frozen,'scripts/round2-eight-key-user-apply.py'),actual.record.checkout]));
  const closed=await fetch('http://127.0.0.1:3100/api/v1/marketing/round2',{method:'POST',body:'{}',signal:AbortSignal.timeout(5000),headers:{Host:'app.mumeok.kr',Origin:'https://app.mumeok.kr','Content-Type':'application/json'}});
  check(closed.status===503&&(await closed.json()).error?.code==='ROUND2_DISABLED','R2_RUNTIME_OFF');
  unchanged();lease.verify();

  await durableJson(join(directory,'started.json'),{...intent,started:true,webManifestVerified:true,actualStartupEightMatch:true,round2Off:true,processes,stateAndRecoveryUnchanged:true},true);
  console.log(JSON.stringify({started:true,webRef:R.target,buildId:pins.build,manifestVerified:true,newEightAndOff:true,actualStartupEightMatch:true,round2Off:true,processes,stateAndRecoveryUnchanged:true,databaseWrites:0,credentialChanges:0,plistWrites:0}));
 }finally{try{if(lease)await lease.release();}finally{await lock.release();}}
}
main().catch(e=>{console.error(e.message?.startsWith('V85_INSTALLED_BOOTSTRAP_')?e.message:'V85_INSTALLED_BOOTSTRAP_STOPPED');process.exitCode=1;});
