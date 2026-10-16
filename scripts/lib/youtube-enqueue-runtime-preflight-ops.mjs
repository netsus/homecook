import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionEnvironment } from './prelaunch-web-deploy.mjs';

// Run exactly the production env-file loader in its own process, so a caller's
// copied env object cannot accidentally omit dotenv values or contaminate HOME.
export function verifyOperatingYoutubeEnqueueRuntime({codeRoot,plist,readiness,rows=null}) {
  const runtime=JSON.stringify(pathToFileURL(join(codeRoot,'scripts/lib/start-production-runtime.mjs')).href);
  const preflight=JSON.stringify(pathToFileURL(join(codeRoot,'scripts/lib/youtube-enqueue-runtime-preflight.mjs')).href);
  const recovery=JSON.stringify(pathToFileURL(join(codeRoot,'scripts/lib/youtube-fingerprint-recovery.mjs')).href);
  const script=`import {readFileSync} from 'node:fs';
import {prepareStartProductionRuntimeEnv} from ${runtime};
import {assertYoutubeEnqueueRuntimeSecrets} from ${preflight};
import {verifyExistingV2Fingerprints} from ${recovery};
const input=JSON.parse(readFileSync(0,'utf8'));
const env=prepareStartProductionRuntimeEnv({repositoryRoot:process.cwd()});
const ready=assertYoutubeEnqueueRuntimeSecrets({env,readiness:input.readiness});
if(ready.status!=='ready')throw new Error('enqueue disabled');
process.stdout.write(JSON.stringify(input.rows?verifyExistingV2Fingerprints(env,input.rows):ready));`;
  const result=spawnSync(plist.ProgramArguments[0],['--input-type=module','-e',script],{
    cwd:plist.WorkingDirectory,env:productionEnvironment(plist),input:JSON.stringify({readiness,rows}),
    encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
  if(result.status!==0)throw new Error('YouTube production enqueue preflight failed; private output withheld');
  return JSON.parse(result.stdout);
}
