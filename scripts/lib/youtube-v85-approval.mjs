import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
const SERVICE='homecook-youtube-v85-gen50-v1',KEYCHAIN=join(homedir(),'Library/Keychains/login.keychain-db');
export function readV85Approval(account='approved-plan-sha256',optionalNormalData=false) {
  if(!['approved-plan-sha256','approved-continuation-sha256','approved-auth-successor-20261018-sha256','approved-normal-data-successor-20261019-sha256','activation-sha256'].includes(account))throw new Error('v85 approval account');
  const r=spawnSync('/usr/bin/security',['find-generic-password','-s',SERVICE,'-a',account,'-w',KEYCHAIN],{encoding:'utf8',timeout:10000});
  if(optionalNormalData===true&&account==='approved-normal-data-successor-20261019-sha256'&&r.status===44)return null;
  if(r.status!==0||!/^[a-f0-9]{64}$/u.test(r.stdout.trim()))throw new Error('v85 independent approval unavailable');
  return r.stdout.trim();
}
export function registerV85Approval(hash,account='approved-plan-sha256') {
  if(!/^[a-f0-9]{64}$/u.test(hash)||!['approved-plan-sha256','approved-continuation-sha256','approved-auth-successor-20261018-sha256','approved-normal-data-successor-20261019-sha256','activation-sha256'].includes(account))throw new Error('v85 approval hash/account');
  const r=spawnSync('/usr/bin/security',['add-generic-password','-s',SERVICE,'-a',account,'-w',hash,KEYCHAIN],{encoding:'utf8',timeout:10000});
  if(r.status!==0&&readV85Approval(account)!==hash)throw new Error('v85 create-only approval rejected');
  if(readV85Approval(account)!==hash)throw new Error('v85 approval mismatch');
}
