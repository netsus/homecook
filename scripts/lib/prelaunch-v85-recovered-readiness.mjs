import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { recoveryCheck } from './prelaunch-v85-web-recovery.mjs';

// Execute only the exact, already source-verified 06a exported loader. Its surrounding
// Next authentication module is not initialized and no HTTP enqueue is performed.
export async function loadRecoveredReadiness(checkout,env,row) {
  const policySource=readFileSync(join(checkout,'lib/server/youtube-async-extraction.ts'),'utf8');
  const options=policySource.match(/export const YOUTUBE_ASYNC_POLICY_OPTIONS = (Object\.freeze\([\s\S]*?as const\));/u)?.[1];
  const policy=policySource.match(/export const YOUTUBE_ASYNC_POLICY = Object\.freeze\(\{([\s\S]*?)\}\);/u)?.[1];
  recoveryCheck(options&&policy,'06a policy source boundary');
  const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const actualOptions=new Function(transpile(`const result=${options};`)+'return result;')();
  const actualPolicy={policyVersion:Number(policy.match(/policyVersion: (\d+)/u)?.[1]),extractorMode:policy.match(/extractorMode: "([^"]+)"/u)?.[1],resultAffectingOptions:actualOptions};
  const source=readFileSync(join(checkout,'lib/server/youtube-async-extraction-routes.ts'),'utf8');
  const start=source.indexOf('export async function loadYoutubeExtractionEnqueueReadiness('),end=source.indexOf('\nexport const youtubeAsyncExtractionHandlers',start);
  recoveryCheck(start>=0&&end>start,'06a readiness source boundary');
  const artifact=await import(pathToFileURL(join(checkout,'scripts/lib/youtube-extraction-worker-artifact.mjs')).href);
  const names=['readYoutubeExtractionAppDescriptor','readYoutubeExtractionExpectedSchema','sha256File','verifyYoutubeExtractionWorkerArtifact','buildYoutubeExtractionWorkerPolicySnapshotDigest'];
  const loader=new Function(...names,'YOUTUBE_ASYNC_POLICY',transpile(source.slice(start,end).replace(/^export /u,''))+'return loadYoutubeExtractionEnqueueReadiness;')(...names.map(n=>artifact[n]),actualPolicy);
  return loader(async name=>{recoveryCheck(name==='read_youtube_extraction_enqueue_readiness','readiness RPC only');return {data:row,error:null};},env);
}
