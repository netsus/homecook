import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
const SERVICE='homecook-youtube-fingerprint-recovery-v1',ACCOUNT='approved-plan-sha256';
const KEYCHAIN=join(homedir(),'Library/Keychains/login.keychain-db');
export function readFingerprintPlanApproval() {
  const r=spawnSync('/usr/bin/security',['find-generic-password','-s',SERVICE,'-a',ACCOUNT,'-w',KEYCHAIN],{encoding:'utf8',timeout:10000});
  if(r.status!==0 || !/^[a-f0-9]{64}$/u.test(r.stdout.trim()))throw new Error('Fingerprint independent approval anchor unavailable');
  return r.stdout.trim();
}
export function registerFingerprintPlanApproval(sha256) {
  if(!/^[a-f0-9]{64}$/u.test(sha256))throw new Error('Fingerprint approval hash invalid');
  // Create-only, never -U. An existing different authorization cannot be replaced.
  const r=spawnSync('/usr/bin/security',['add-generic-password','-s',SERVICE,'-a',ACCOUNT,'-w',sha256,KEYCHAIN],{encoding:'utf8',timeout:10000});
  if(r.status!==0 && readFingerprintPlanApproval()!==sha256)throw new Error('Fingerprint approval anchor registration rejected');
  if(readFingerprintPlanApproval()!==sha256)throw new Error('Fingerprint approval anchor mismatch');
  return {approvedPlanBound:true};
}
