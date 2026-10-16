#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFingerprintRecovery, applyFingerprintRecovery, reconcileFingerprintRecovery, compensateFingerprintRecovery, authorizeFingerprintPlan, recoverFingerprintReceipt } from './lib/youtube-fingerprint-recovery-ops.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [action,...args]=process.argv.slice(2);
async function main() {
  if(action==='--help') { process.stdout.write('prepare --candidate SHA --output PRIVATE_JSON | authorize-plan|apply|retry-apply|compensate|recover-receipt|recover-compensation-receipt --plan PRIVATE_JSON --plan-sha256 SHA256 --confirm preserve-v1-eight-and-enable-future-v2 | reconcile. Every operating action requires separate user approval.\n');return; }
  const options={root},names={'--candidate':'candidate','--output':'output','--plan':'planPath','--plan-sha256':'planSha256','--confirm':'confirmation'};
  const seen=new Set();
  for(let n=0;n<args.length;n+=2){const key=names[args[n]],value=args[n+1];if(!key||!value||value.startsWith('--')||seen.has(key))throw new Error('invalid-options');seen.add(key);options[key]=value;}
  const expected=action==='prepare'?['candidate','output']:action==='reconcile'?[]:['confirmation','planPath','planSha256'];
  if(!['prepare','authorize-plan','apply','retry-apply','reconcile','compensate','recover-receipt','recover-compensation-receipt'].includes(action)||JSON.stringify([...seen].sort())!==JSON.stringify(expected.sort()))throw new Error('invalid-options');
  const fn={prepare:prepareFingerprintRecovery,apply:applyFingerprintRecovery,reconcile:reconcileFingerprintRecovery,compensate:compensateFingerprintRecovery,
    'authorize-plan':authorizeFingerprintPlan,
    'retry-apply':value=>applyFingerprintRecovery({...value,retry:true}),'recover-receipt':recoverFingerprintReceipt,
    'recover-compensation-receipt':value=>recoverFingerprintReceipt({...value,compensation:true})}[action];
  process.stdout.write(JSON.stringify(await fn(options))+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{
  const code=/^fingerprint (?:operation|recovery|authority): [a-z0-9-]+$/u.test(error.message)?error.message:'private diagnostic withheld';
  console.error(`Fingerprint operation stopped (${code}). ${action==='prepare'?'Read-only preparation did not finish; no operating change was requested.':'Use the read-only reconcile command before retry.'}`);
  process.exitCode=1;
});
