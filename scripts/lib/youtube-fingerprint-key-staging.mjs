import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readClosedR2PrivateBytes } from './prelaunch-web-deploy.mjs';
import { fingerprintV2SecretPath, loadFingerprintV2SecretEnv, FINGERPRINT_V2_ENV } from './youtube-fingerprint-secret-env.mjs';
import { PLATFORM_BACKUP_KEYCHAIN_ACCOUNT, PLATFORM_BACKUP_KEYCHAIN_SERVICE } from './full-local-platform-backup.mjs';
import { privatePath } from './marketing-round2-controlled-deploy.mjs';
export const FINGERPRINT_KEY_BACKUP = '/Volumes/HomecookOffMac/homecook-backup/youtube-fingerprint-v2-20261017.key.enc.json';
const FORMAT='homecook.youtube-fingerprint-key-backup.v1';
const aad=Buffer.from(FORMAT+'\nversion=2\npurpose=enqueue-deduplication','utf8');
const encryptionKey=backupKey=>createHash('sha256').update(FORMAT+'\0','utf8').update(backupKey,'utf8').digest();
export function sealFingerprintKey(secret,backupKey,iv=randomBytes(12)) {
  if (Buffer.byteLength(secret.trim(),'utf8')<32 || Buffer.byteLength(backupKey,'utf8')<24 || iv.length!==12) throw new Error('Fingerprint backup input invalid');
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(backupKey),iv);cipher.setAAD(aad);
  return {format:FORMAT,version:'2',iv:iv.toString('base64'),ciphertext:Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function openFingerprintKey(backup,backupKey) {
  if (backup?.format!==FORMAT || backup.version!=='2' || Buffer.byteLength(backupKey,'utf8')<24) throw new Error('Fingerprint backup invalid');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(backupKey),Buffer.from(backup.iv,'base64'));
  decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(backup.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(backup.ciphertext,'base64')),decipher.final()]).toString('utf8');
}
function backupKeyFromKeychain() {
  const r=spawnSync('/usr/bin/security',['find-generic-password','-s',PLATFORM_BACKUP_KEYCHAIN_SERVICE,'-a',PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,'-w'],{encoding:'utf8',timeout:10000});
  if(r.status!==0 || !r.stdout || Buffer.byteLength(r.stdout.trim(),'utf8')<24)throw new Error('Existing backup key unavailable');
  return r.stdout.trim();
}
function exclusiveWrite(path,value) {
  const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,value);fsyncSync(fd);}finally{closeSync(fd);}
  const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}
export function verifyStagedFingerprintKey(root) {
  const key=loadFingerprintV2SecretEnv({repositoryRoot:root,env:{HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION:'1'}})[FINGERPRINT_V2_ENV];
  if(!key)throw new Error('Staged fingerprint key missing');
  const backup=JSON.parse(readClosedR2PrivateBytes(FINGERPRINT_KEY_BACKUP,root,16384));
  const recovered=openFingerprintKey(backup,backupKeyFromKeychain());
  const a=Buffer.from(key),b=Buffer.from(recovered);
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Fingerprint recovery backup differs');
  return {keyConfigured:true,recoveryBackupVerified:true,keyValueDisclosed:false};
}
// Approval is checked by the CLI before invoking this function. Never replaces an existing key.
export async function stageFingerprintKey(root,{resume=false}={}) {
  // Both approved existing directories must already be private. No chmod/mkdir fallback.
  const file=fingerprintV2SecretPath();
  await privatePath(dirname(file),true);await privatePath(dirname(FINGERPRINT_KEY_BACKUP),true);
  if(existsSync(file))return verifyStagedFingerprintKey(root);
  if(!resume&&existsSync(FINGERPRINT_KEY_BACKUP))throw new Error('Encrypted key already exists; explicit same-key resume required');
  const backupKey=backupKeyFromKeychain();
  let secret;
  if(resume) secret=openFingerprintKey(JSON.parse(readClosedR2PrivateBytes(FINGERPRINT_KEY_BACKUP,root,16384)),backupKey);
  else {
    secret=randomBytes(32).toString('base64url');
    const envelope=sealFingerprintKey(secret,backupKey);
    // Validate parent security without reading unrelated backup/user data.
    const fd=openSync(dirname(FINGERPRINT_KEY_BACKUP),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);closeSync(fd);
    exclusiveWrite(FINGERPRINT_KEY_BACKUP,JSON.stringify(envelope)+'\n');
  }
  exclusiveWrite(file,secret+'\n');
  return verifyStagedFingerprintKey(root);
}
