import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {readClosedR2PrivateBytes} from './prelaunch-web-deploy.mjs';

export const REGISTERED_RESUME=Object.freeze({
  base:'8455d9f8a04fa8700487385b119c5abcec495ed7',
  capsule:'32f795fc861433623036289c7db689f3c4ed2e91be5b1f54e4a90578bd658d40',
  executor:'/private/tmp/homecook-v85-registered-resume-20261019',
  binding:'/private/tmp/homecook-v85-registered-resume-binding-20261019',
  frozen:'/private/tmp/homecook-v85-reader-recovery-pr-20261018',
  manifest:'scripts/manifests/v85-registered-resume-source-20261019.json',
});
const R=REGISTERED_RESUME,ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const registeredResumeFiles=Object.freeze(['scripts/youtube-v85-controlled-cutover.mjs','scripts/round2-eight-key-user-apply.py',
  'scripts/lib/v85-worker-lifecycle.mjs','scripts/lib/v85-registered-resume-source.mjs',
  'tests/v85-registered-resume-lifecycle.test.ts','tests/v85-web-only-census.test.py',
  'tests/youtube-v85-readonly-adapter.test.ts',
  'docs/engineering/v85-registered50-resume-repair-20261019.md','docs/sync/CURRENT_SOURCE_OF_TRUTH.md'].sort());
const check=(ok,reason)=>{if(!ok)throw new Error('v85: registered50 source '+reason);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,args,bytes=false)=>{
  const r=spawnSync('/usr/bin/git',['-C',root,...args],{encoding:bytes?undefined:'utf8',timeout:15000,maxBuffer:2*1024*1024});
  check(r.status===0,'read failed');return bytes?r.stdout:r.stdout.trim();
};
export const registeredResumeRoot=()=>ROOT===R.executor;
export const registeredResumeInvocation=()=>registeredResumeRoot()&&process.argv.length===3
  &&resolve(process.argv[1])===join(R.executor,'scripts/youtube-v85-controlled-cutover.mjs')
  &&['resume','reconcile'].includes(process.argv[2]);

export function assertRegisteredResumePin(pin,observed){
  check(pin?.schema==='homecook.v85-registered-resume-source.v1'&&pin.baseRef===R.base
    &&/^[a-f0-9]{40}$/u.test(pin.executorRef)&&pin.executorRef!==R.base&&/^[a-f0-9]{40}$/u.test(pin.executorTree),'pin identity');
  check(same(Object.keys(pin).sort(),['schema','baseRef','executorRef','executorTree','files'].sort())
    &&same(Object.keys(pin.files).sort(),registeredResumeFiles)&&same(pin.files,observed.files),'complete finite file set');
  for(const pair of Object.values(pin.files))check(Array.isArray(pair)&&pair.length===2&&pair[1]!==null&&pair[0]!==pair[1]
    &&pair.every(v=>v===null||/^[a-f0-9]{64}$/u.test(v)),'file digest');
  check(observed.executorRef===pin.executorRef&&observed.executorTree===pin.executorTree&&observed.executorParent===R.base
    &&observed.executorClean&&observed.executorOwned&&observed.bindingClean&&observed.bindingOwned
    &&Array.isArray(observed.executorUntracked)&&observed.executorUntracked.length===0
    &&Array.isArray(observed.bindingUntracked)&&observed.bindingUntracked.length===0
    &&observed.bindingParent===pin.executorRef&&same(observed.bindingDiff,[R.manifest]),'exact executor and binding ancestry');
  return pin;
}
export function verifyRegisteredResumeSource(plan){
  check(registeredResumeInvocation(),'resume/reconcile only at fixed executor');
  const pinPath=join(R.binding,R.manifest),stat=lstatSync(pinPath);
  check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===process.getuid()&&stat.size<=65536,'regular owned binding manifest');
  const pinBytes=readFileSync(pinPath),pin=JSON.parse(pinBytes);
  check(pinBytes.equals(git(R.binding,['show',`HEAD:${R.manifest}`],true)),'committed binding bytes');
  const paths=git(R.executor,['diff','--name-only',R.base,'HEAD']).split('\n').filter(Boolean).sort();
  const files=Object.fromEntries(paths.map(file=>[file,[R.base,'HEAD'].map(ref=>
    git(R.executor,['ls-tree',ref,'--',file])?hash(git(R.executor,['show',`${ref}:${file}`],true)):null)]));
  const oneParent=root=>{const parts=git(root,['rev-list','--parents','-n','1','HEAD']).split(' ');check(parts.length===2,'single parent');return parts[1];};
  assertRegisteredResumePin(pin,{executorRef:git(R.executor,['rev-parse','HEAD']),executorTree:git(R.executor,['rev-parse','HEAD^{tree}']),
    executorParent:oneParent(R.executor),executorClean:git(R.executor,['status','--porcelain','--untracked-files=all'])==='',
    executorUntracked:git(R.executor,['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean),executorOwned:realpathSync(git(R.executor,['rev-parse','--show-toplevel']))===R.executor,
    files,bindingParent:oneParent(R.binding),bindingDiff:git(R.binding,['diff','--name-only',pin.executorRef,'HEAD']).split('\n').filter(Boolean),
    bindingClean:git(R.binding,['status','--porcelain','--untracked-files=all'])==='',bindingUntracked:git(R.binding,['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean),
    bindingOwned:realpathSync(git(R.binding,['rev-parse','--show-toplevel']))===R.binding});
  check(git(R.frozen,['rev-parse','HEAD'])===R.base&&git(R.frozen,['status','--porcelain','--untracked-files=all'])===''
    &&git(R.frozen,['ls-files','--others','--exclude-standard'])==='','immutable approved executor');
  const operation=join(homedir(),'.homecook/operations/youtube-v85-gen50-20261017');
  const bytes=readClosedR2PrivateBytes(join(operation,'normal-data-successor-plan-20261019.json'),ROOT,524288);
  check(hash(bytes)===R.capsule&&same(JSON.parse(bytes),plan)&&plan.dataSuccessor?.toolRef===R.base,'original four-approval capsule');
  return {executorRef:pin.executorRef,bindingRef:git(R.binding,['rev-parse','HEAD']),planSha256:R.capsule,
    sourceManifestSha256:hash(readFileSync(pinPath)),registered50Only:true,mayIssue:false,mayRegister:false};
}
