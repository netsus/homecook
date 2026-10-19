import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backupRecordingSnapshot} from '../scripts/lib/marketing-round2-controlled-deploy.mjs';
import {startCookingFenceMonitor} from '../scripts/lib/cooking-maintenance-cut.mjs';

test('snapshot commands await actual child exit while admission containment timer remains live',async()=>{
 const root=await mkdtemp(join(await realpath(tmpdir()),'hc-cooking-responsive-'));
 await mkdir(join(root,'backup'),{mode:0o700});
 const calls=[];let lost=false,closedWhileChildRunning=false,running=false;
 const monitor=startCookingFenceMonitor({assertHeld(){if(lost)throw new Error('owned synthetic fence lost');},closeIngress(){if(running)closedWhileChildRunning=true;}});
 const lose=setTimeout(()=>{lost=true;},80);
 try{
  const run=(args,options)=>new Promise((resolve,reject)=>{
   calls.push(args.slice(2));running=true;
   const isDump=args.includes('pg_dump'),isRoles=args.includes('pg_dumpall');
   const bytes=isDump?'synthetic dump':isRoles?'synthetic roles':'';
   const child=spawn(process.execPath,['-e',`setTimeout(()=>{process.stdout.write(${JSON.stringify(bytes)});},${isDump?700:10})`],options);
   child.stderr?.resume();child.once('error',reject);child.once('close',code=>{running=false;if(code===0)resolve();else reject(new Error('child failed'));});
  });
  const metadata=await backupRecordingSnapshot({run,container:'owned-fixture',directory:join(root,'backup'),snapshot:'0001-0001-1',timeout:5000,target:{synthetic:true}});
  assert.equal(calls.length,4);assert(monitor.error);assert.equal(closedWhileChildRunning,true);
  assert.equal(await readFile(metadata.path,'utf8'),'synthetic dump');
  assert.equal(metadata.bytes,14);
  assert.deepEqual(calls.map(args=>args.includes('pg_dump')?'dump':args.includes('pg_dumpall')?'roles':args.includes('--list')?'list':'decode'),['dump','roles','list','decode']);
 }finally{clearTimeout(lose);monitor.stop();await rm(root,{recursive:true,force:true});}
});
