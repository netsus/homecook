import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const cli=readFileSync('scripts/deploy-prelaunch-web.mjs','utf8');
const start=cli.indexOf('function currentProtectedPhase('),end=cli.indexOf('\nfunction ',start+1);
assert(start>0&&end>start);
const fn=cli.slice(start,end);
function observe({live,ancestor=false,loadError=null}){
 const review={from:'old-web',to:'cooking-candidate',legacyReader:{buildId:'old-build',plistSha256:'old-plist'}};
 let loaded=0;
 const context={repository:'/owned',readCookingExperienceAttempt:()=>({review,record:{status:'committed'}}),
  loadCurrentDatabaseMaintenance:()=>{loaded++;if(loadError)throw loadError;},
  spawnSync:(binary,args,options)=>{assert.equal(binary,'git');assert.deepEqual(Array.from(args),['-C','/owned','merge-base','--is-ancestor','cooking-candidate',live.ref]);assert.equal(options.stdio,'ignore');return {status:ancestor?0:1};},
  approvedSourceAncestor:()=>{throw new Error('Historical v74 authority must not be retargeted');},
  hash:bytes=>bytes,cookingExperiencePhaseStatus:(_attempt,readerCompatible,legacyReaderCurrent)=>({readerCompatible,legacyReaderCurrent}),
 };
 const result=runInNewContext(`(${fn})`,context)(live);return {result,loaded};
}
test('committed235 with exact old reader remains a pending compatible handoff without opening historical232 authority',()=>{
 const {result,loaded}=observe({live:{ref:'old-web',buildId:'old-build',bytes:'old-plist'}});
 assert.equal(loaded,1);assert.equal(result.readerCompatible,false);assert.equal(result.legacyReaderCurrent,true);
});
test('candidate descendant is compatible; unrelated or changed legacy bytes cannot become compatible',()=>{
 assert.equal(observe({live:{ref:'new-web'},ancestor:true}).result.readerCompatible,true);
 for(const live of [{ref:'foreign-web',buildId:'old-build',bytes:'old-plist'},{ref:'old-web',buildId:'wrong',bytes:'old-plist'},{ref:'old-web',buildId:'old-build',bytes:'wrong'}]){
  const {result}=observe({live});assert.equal(result.readerCompatible,false);assert.equal(result.legacyReaderCurrent,false);
 }
});
test('unresolved or foreign committed235 proof still fails before source compatibility',()=>{
 assert.throws(()=>observe({live:{ref:'old-web'},loadError:new Error('foreign235')}),/foreign235/u);
});

const ancestryStart=cli.indexOf('function approvedSourceAncestor('),ancestryEnd=cli.indexOf('\nfunction v85Authority()',ancestryStart);
const ancestryFn=cli.slice(ancestryStart,ancestryEnd);
test('historical v74 handoff validates its unchanged232 predecessor under committed235',()=>{
 const prior={pointer:{path:'original232',sha256:'original-hash'},review:{database:{after:Array(232).fill('original-ledger')}}};
 let checked=false;
 const context={repository:'/owned',V74_WEB_HANDOFF_SHA256:'pinned',V74_OPERATION_DIRECTORY:'/private/owned',V74_WEB_PREDECESSOR:'v74-before',V74_RELEASE:'v74-after',
  spawnSync:(_binary,args)=>({status:args.includes('v74-before')||args.includes('v74-after')?0:1}),
  readClosedR2PrivateBytes:()=>JSON.stringify({schema:'original-proof'}),hash:()=> 'pinned',join:(...parts)=>parts.join('/'),
  loadCurrentDatabaseMaintenance:()=>({pointer:{path:'new235'},review:{database:{after:Array(235)}},cookingPredecessor:prior}),
  assertV74WebHandoff:({maintenance,ledger})=>{assert.equal(maintenance,prior.pointer);assert.equal(ledger,prior.review.database.after);checked=true;},
  verifiedV74Source:()=>{assert(checked);},DeploymentError:Error,
 };
 assert.equal(runInNewContext(`(${ancestryFn})`,context)('old-ancestor','old-live'),true);assert(checked);
 context.loadCurrentDatabaseMaintenance=()=>{throw new Error('unknown235');};
 assert.throws(()=>runInNewContext(`(${ancestryFn})`,context)('old-ancestor','old-live'),/unknown235/u);
});
