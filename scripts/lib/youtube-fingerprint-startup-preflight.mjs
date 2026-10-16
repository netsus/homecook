import { join } from 'node:path';
import { readClosedR2PrivateBytes } from './prelaunch-web-deploy.mjs';
import { readFingerprintRecoveryAuthority, fingerprintWorkerSuccessor } from './youtube-fingerprint-recovery-authority.mjs';
import { V74_ACTIVATION_SHA256, V74_OPERATION_DIRECTORY } from './prelaunch-youtube-v74-cutover.mjs';
import { fingerprintRecoveryHash } from './youtube-fingerprint-recovery.mjs';
import { assertYoutubeEnqueueRuntimeSecrets } from './youtube-enqueue-runtime-preflight.mjs';

// Startup validates the last bound policy version. The deployment's DB observer
// separately checks the actual current policy; no startup impersonation/RPC grant.
export function assertStartupYoutubeFingerprint({ repositoryRoot, env, read = file => readClosedR2PrivateBytes(file,repositoryRoot,524288) }) {
  if (env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION !== '1') return {status:'disabled'};
  const recovery=readFingerprintRecoveryAuthority(read);
  let current='1';
  if (recovery) {
    const raw=read(join(V74_OPERATION_DIRECTORY,'activation.json'));
    if (fingerprintRecoveryHash(raw)!==V74_ACTIVATION_SHA256) throw new Error('YouTube fingerprint startup authority unavailable');
    const proof=JSON.parse(raw);
    fingerprintWorkerSuccessor(proof.after.worker,recovery,proof.origin,V74_ACTIVATION_SHA256);
    current=(recovery.compensation??recovery.receipt).after.policy.fingerprint_key_version;
  }
  return assertYoutubeEnqueueRuntimeSecrets({env,readiness:{currentFingerprintKeyVersion:current,
    previousFingerprintKeyVersion:null,previousFingerprintValidUntil:null}});
}
