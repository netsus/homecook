import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createRecordingDockerAdapter } from './marketing-round2-controlled-deploy.mjs';
import { createProtectedPrelaunchAdapter,assertCookedWeightAttestationCurrentObservation } from './prelaunch-database.mjs';
import { loadCookedWeightAttestationSuccessor,loadCurrentDatabaseMaintenance,loadCookedWeightAttestationWorkerContinuation,readClosedR2PrivateBytes } from './prelaunch-web-deploy.mjs';
import { assertV74WorkerSuccessor,V74_ACTIVATION_SHA256,V74_OPERATION_DIRECTORY } from './prelaunch-youtube-v74-cutover.mjs';
import { readFingerprintRecoveryAuthority } from './youtube-fingerprint-recovery-authority.mjs';
import { openDedicatedAdminSession } from '../youtube-resolution-controlled-db.mjs';
import { assertRecoveryDatabase,recoveryCheck } from './prelaunch-v85-web-recovery.mjs';
import { verifyOperatingYoutubeEnqueueRuntime } from './youtube-enqueue-runtime-preflight-ops.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');

export async function createV85WebRecoveryObserver(repository) {
  const successor=loadCookedWeightAttestationSuccessor(repository),maintenance=loadCurrentDatabaseMaintenance(repository);
  const continuation=loadCookedWeightAttestationWorkerContinuation(successor,repository);
  const read=file=>readClosedR2PrivateBytes(file,repository,524288);
  const bytes=read(join(V74_OPERATION_DIRECTORY,'activation.json'));
  recoveryCheck(hash(bytes)===V74_ACTIVATION_SHA256,'original v74 authority');
  const proof=JSON.parse(bytes),origin={personalSuccessor:successor.pointer,databaseMaintenance:maintenance.pointer,c04Activation:continuation.activation.pointer,c04Post:continuation.post.pointer};
  assertV74WorkerSuccessor({proof,origin,baseline:successor.review.database.workerBaseline,approvedPolicy:continuation.observation});
  const fingerprintRecovery=readFingerprintRecoveryAuthority(read),approvedWorkerSuccessor={proof,origin,fingerprintRecovery};
  const root=join(homedir(),'.homecook/prelaunch-web');
  const base=await createRecordingDockerAdapter({configPath:join(homedir(),'.homecook/config/full-local-production.env'),backupDirectory:root});
  const target=await base.inspect();
  recoveryCheck(target.database.systemIdentifier==='7669475895419854882'&&target.database.major===17,'fixed local PostgreSQL17');
  const adapter=createProtectedPrelaunchAdapter(base,maintenance.review.feature,maintenance.review,maintenance);
  return {proof,maintenance,async verifyHistoricalKey(plist,readiness){
    const ids=Object.keys(fingerprintRecovery.receipt.before.originalJobs);
    recoveryCheck(ids.length===41&&ids.every(id=>/^[a-f0-9-]{36}$/u.test(id)),'original fingerprint history IDs');
    const rows=JSON.parse(await base.query(`SELECT coalesce(json_agg(json_build_object('user_id',user_id,'youtube_video_id',youtube_video_id,'extractor_mode',extractor_mode,'pipeline_identity',pipeline_identity,'policy_version',policy_version,'result_affecting_options',result_affecting_options,'fingerprint',request_fingerprint) ORDER BY id),'[]'::json) FROM public.youtube_extraction_jobs WHERE request_fingerprint_key_version='2' AND id IN (${ids.map(id=>`'${id}'::uuid`).join(',')});`));
    const result=verifyOperatingYoutubeEnqueueRuntime({codeRoot:plist.WorkingDirectory,plist,readiness,rows});
    recoveryCheck(result.compared===33&&result.matched===33&&result.secretDisclosed===false,'original V2 HMAC reproduced');
    return result;
  },async observe(){
    const session=openDedicatedAdminSession(target.postgresContainerId,'youtube-resolution-v85-web-recovery');
    try {
      await session.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL ROLE postgres; SET LOCAL search_path=public,extensions; SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='60s';");
      const full=await adapter.observe(sql=>session.query(sql),'youtube-resolution-v85-web-recovery');
      assertCookedWeightAttestationCurrentObservation(successor,full,{quantityWriterState:'on',approvedWorkerSuccessor,approvedWorkerPolicy:continuation.observation,databaseMaintenance:maintenance});
      const jobsHash=(await session.query("SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.youtube_extraction_jobs j;")).trim();
      const readiness=JSON.parse((await session.query(`SELECT set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true); SELECT public.read_youtube_extraction_enqueue_readiness();`)).trim().split('\n').at(-1));
      assertRecoveryDatabase(full,jobsHash);
      await session.query('COMMIT;');recoveryCheck(await session.close()===0,'read-only observation close');
      const guardHashes=Object.fromEntries(readdirSync(root).filter(n=>n.endsWith('-guard.json')||n==='database-state.json').sort().map(n=>[n,hash(read(join(root,n)))]));
      return {full,jobsHash,readiness,guardHashes,authoritySha256:hash(JSON.stringify({origin,fingerprintRecovery:fingerprintRecovery.pointer}))};
    }finally{session.stop();}
  }};
}
