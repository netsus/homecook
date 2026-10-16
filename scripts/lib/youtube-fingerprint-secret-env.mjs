import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const FINGERPRINT_V2_ENV = 'HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2';
export function fingerprintV2SecretPath(home = homedir()) {
  return join(home, '.homecook/youtube-extraction/fingerprint-hmac-v2');
}
// One fixed file, one environment variable. No generic dotenv or plist patch path.
/** @param {{repositoryRoot: string, env?: Record<string,string|undefined>, home?: string}} options */
export function loadFingerprintV2SecretEnv({ repositoryRoot, env = process.env, home = homedir() }) {
  if (env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION !== '1') return {};
  const file = fingerprintV2SecretPath(home), directory = resolve(file, '..');
  const fail = () => { throw new Error('YouTube fingerprint secret file is unavailable or unsafe'); };
  let info;
  try { info = lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return {}; fail(); }
  const outside = relative(realpathSync(repositoryRoot), file);
  if (!isAbsolute(file) || !(outside.startsWith(`..${sep}`) || isAbsolute(outside))
    || realpathSync(directory) !== directory) fail();
  const parent = lstatSync(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o777) !== 0o700
    || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o600 || info.size > 4096) fail();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (opened.ino !== info.ino || opened.dev !== info.dev || !opened.isFile() || opened.nlink!==1
      || opened.uid!==process.getuid() || (opened.mode&0o777)!==0o600 || opened.size>4096) fail();
    const buffer=Buffer.alloc(4097);let size=0;
    while(size<buffer.length){const count=readSync(fd,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}
    if(size>4096)fail();
    const value = buffer.subarray(0,size).toString('utf8').trim();
    if (Buffer.byteLength(value, 'utf8') < 32 || /[\r\n\0]/u.test(value)
      || env[FINGERPRINT_V2_ENV] !== undefined && env[FINGERPRINT_V2_ENV].trim() !== value) fail();
    return { [FINGERPRINT_V2_ENV]: value };
  } finally { closeSync(fd); }
}
