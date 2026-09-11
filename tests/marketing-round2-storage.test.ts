import { mkdtemp, realpath, chmod, writeFile, readFile, rm, mkdir, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, statfs: vi.fn(actual.statfs), rename: vi.fn(actual.rename) };
});

const modulePath = '../lib/server/marketing-round2-storage';
let root: string;
let storage: Awaited<ReturnType<typeof import('../lib/server/marketing-round2-storage')['createRound2FileStorage']>>;
let clock = Date.parse('2026-09-11T00:00:00Z');
const repositoryRoot = process.cwd();
const initial = { version: 1, collection_enabled: false, lead_enabled: false, consent_generation: 1 } as const;
const ip = '192.0.2.1';
const participationId = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'r2-storage-')));
  await chmod(root, 0o700);
  await writeFile(join(root, 'state.json'), JSON.stringify({ version: 1, counters: {} }), { mode: 0o600 });
  await writeFile(join(root, 'control.json'), JSON.stringify(initial), { mode: 0o600 });
  clock = Date.parse('2026-09-11T00:00:00Z');
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

async function setup() {
  const storageModule = await import(modulePath).catch(() => ({}));
  expect(storageModule).toHaveProperty('createRound2FileStorage');
  storage = storageModule.createRound2FileStorage({ rateStateDir: root, controlPath: join(root, 'control.json'), repositoryRoot, rateSecret: 'a'.repeat(64), now: () => clock });
  return storage;
}

describe('r2 owner-only persistent storage', () => {
  it('requires an existing exact control and serializes its writer under a retained lease', async () => {
    await setup();
    expect(await storage.readControl()).toEqual(initial);
    const lease = await storage.acquireControlLease();
    await expect(storage.acquireControlLease()).rejects.toMatchObject({ code: 'ROUND2_UNAVAILABLE' });
    await lease.writeControl({ ...initial, consent_generation: 2 });
    await expect(lease.writeControl(initial)).rejects.toMatchObject({ code: 'ROUND2_UNAVAILABLE' });
    expect(await lease.readControl()).toMatchObject({ consent_generation: 2 });
    await lease.release();
    await expect(lease.readControl()).rejects.toMatchObject({ code: 'ROUND2_UNAVAILABLE' });
    const next = await storage.acquireControlLease();
    await next.release();
  });

  it('persists only HMAC counters and preserves limits across adapter restarts', async () => {
    await setup();
    for (let i = 0; i < 20; i++) await storage.consumeRate({ ip, buckets: ['ip', 'bootstrap'] });
    await setup();
    await expect(storage.consumeRate({ ip, buckets: ['ip', 'bootstrap'] })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 60 });
    const text = await readFile(join(root, 'state.json'), 'utf8');
    expect(text).not.toContain(ip);
    const state = JSON.parse(text);
    expect(Object.keys(state.counters).every((key) => /^[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(Object.values(state.counters).map((v) => (v as {count:number}).count).sort((a,b)=>a-b)).toEqual([20, 21]);
    expect((await stat(join(root,'state.json'))).mode & 0o777).toBe(0o600);
  });

  it('saturates rejected buckets, increments others and returns the longest delay', async () => {
    await setup();
    for(let i=0;i<5;i++) await storage.consumeRate({ ip, participationId, buckets:['lead_ip','lead_participation'] });
    clock += 10_000;
    await expect(storage.consumeRate({ ip, participationId, buckets:['ip','lead_ip','lead_participation'] })).rejects.toMatchObject({code:'RATE_LIMITED',retryAfter:3590});
    const counts = Object.values(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters).map((v)=>(v as {count:number}).count).sort((a,b)=>a-b);
    expect(counts).toEqual([1,5,6]);
    clock += 3_590_000;
    await expect(storage.consumeRate({ip,participationId,buckets:['ip','lead_ip','lead_participation']})).resolves.toBeUndefined();
    expect(Object.keys(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters)).toHaveLength(3);
  });

  it('enforces the remaining IP and participation buckets independently', async () => {
    await setup();
    for(let i=0;i<60;i++) await storage.consumeRate({ip,participationId,buckets:['ip','participation']});
    await expect(storage.consumeRate({ip,participationId,buckets:['ip','participation']})).rejects.toMatchObject({code:'RATE_LIMITED',retryAfter:60});
    for(let i=0;i<10;i++) await storage.consumeRate({ip,buckets:['lead_ip']});
    await expect(storage.consumeRate({ip,buckets:['lead_ip']})).rejects.toMatchObject({code:'RATE_LIMITED',retryAfter:3600});
  },20_000);

  it.each(['missing','malformed','unknown','duplicate','oversize','insecure','symlink'])('fails closed for %s state without repairing it', async(kind) => {
    await setup(); const path=join(root,'state.json');
    if(kind==='missing') await rm(path);
    if(kind==='malformed') await writeFile(path,'{');
    if(kind==='unknown') await writeFile(path,JSON.stringify({version:1,counters:{},extra:true}));
    if(kind==='duplicate') await writeFile(path,'{"version":1,"counters":{},"version":1}');
    if(kind==='oversize') await writeFile(path,' '.repeat(4*1024*1024+1));
    if(kind==='insecure') await chmod(path,0o644);
    if(kind==='symlink') {await rm(path);await symlink(join(root,'control.json'),path);}
    await expect(storage.consumeRate({ip,buckets:['ip']})).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  });

  it('refuses orphan locks without age-based theft', async () => {
    await setup(); await mkdir(join(root,'rate.lock'),{mode:0o700});
    await expect(storage.consumeRate({ip,buckets:['ip']})).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
    expect((await stat(join(root,'rate.lock'))).isDirectory()).toBe(true);
  });

  it('refuses directory permissions, foreign owner and repository-contained paths',async()=>{
    await setup(); await chmod(root,0o755);
    await expect(storage.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
    await chmod(root,0o700);
    vi.spyOn(process,'getuid').mockReturnValue((process.getuid?.() ?? 0)+1);
    await expect(storage.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
    vi.restoreAllMocks();
    const {createRound2FileStorage}=await import(modulePath);
    const inside=createRound2FileStorage({rateStateDir:root,controlPath:join(root,'control.json'),repositoryRoot:root,rateSecret:'a'.repeat(64)});
    await expect(inside.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  });

  it('fails closed on backwards clock without wiping live counters',async()=>{
    await setup(); await storage.consumeRate({ip,buckets:['lead_ip']}); clock-=3_600_000;
    await expect(storage.consumeRate({ip,buckets:['lead_ip']})).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
    expect(Object.keys(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters)).toHaveLength(1);
  });
});

it('rejects network filesystems and changed lease owners without releasing their locks',async()=>{
  await setup();
  const filesystem=await import('node:fs/promises');
  const original=await filesystem.statfs(root);
  vi.mocked(filesystem.statfs).mockResolvedValueOnce({...original,type:0x6969});
  await expect(storage.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  vi.restoreAllMocks();
  const lease=await storage.acquireControlLease();
  await writeFile(join(root,'control.json.lock','owner'),'b'.repeat(64));
  await expect(lease.release()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  expect((await stat(join(root,'control.json.lock'))).isDirectory()).toBe(true);
});

it.each([
  '{"version":1,"collection_enabled":false,"lead_enabled":false,"consent_generation":0}',
  '{"version":1,"collection_enabled":false,"lead_enabled":false,"consent_generation":1,"extra":true}',
  '{"version":1,"collection_enabled":false,"lead_enabled":false,"consent_generation":1,"consent_generation":2}',
])('rejects malformed control exact shape %s',async(text)=>{
  await setup();await writeFile(join(root,'control.json'),text);
  await expect(storage.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
});

it('refuses a symlink directory component and crosses the UTC day without retaining expired counters',async()=>{
  const {createRound2FileStorage}=await import(modulePath);
  await mkdir(join(root,'actual'),{mode:0o700});
  await symlink(join(root,'actual'),join(root,'alias'));
  const alias=createRound2FileStorage({rateStateDir:join(root,'alias'),controlPath:join(root,'alias','control.json'),repositoryRoot,rateSecret:'a'.repeat(64)});
  await expect(alias.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  await setup();clock=Date.parse('2026-09-11T23:59:59Z');
  await storage.consumeRate({ip,buckets:['ip','lead_ip']});
  clock+=1000;
  await storage.consumeRate({ip,buckets:['ip','lead_ip']});
  expect(Object.values(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters)).toEqual(expect.arrayContaining([{count:1,window_end:clock/1000+60},{count:1,window_end:clock/1000+3600}]));
  expect(Object.keys(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters)).toHaveLength(2);
});

it('enforces one shared counter under multiple real Node processes and retains a crashed control lease',async()=>{
  const {transpileModule,ModuleKind,ScriptTarget}=await import('typescript');
  const {execFile}=await import('node:child_process');
  const {promisify}=await import('node:util');
  const exec=promisify(execFile);
  const compiled=join(root,'compiled');await mkdir(join(compiled,'server'),{recursive:true,mode:0o700});
  for(const [source,destination]of[['lib/marketing-round2.ts','marketing-round2.js'],['lib/server/marketing-round2-storage.ts','server/marketing-round2-storage.js']]){
    await writeFile(join(compiled,destination),transpileModule(await readFile(join(repositoryRoot,source),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText);
  }
  const factory=`const {createRound2FileStorage}=require(${JSON.stringify(join(compiled,'server/marketing-round2-storage.js'))});const s=createRound2FileStorage(${JSON.stringify({rateStateDir:root,controlPath:join(root,'control.json'),repositoryRoot,rateSecret:'a'.repeat(64)})});`;
  const jobs=Array.from({length:4},()=>exec(process.execPath,['-e',`${factory}(async()=>{const out=[];let retries=0;for(let i=0;i<8;i++){try{await s.consumeRate({ip:'192.0.2.1',buckets:['bootstrap']});out.push('ok')}catch(e){if(e.code==='ROUND2_UNAVAILABLE' && retries++<50){await new Promise(r=>setTimeout(r,25));i--;continue;}out.push(e.code)}}process.stdout.write(JSON.stringify(out));})();`]));
  const results=(await Promise.all(jobs)).flatMap(({stdout})=>JSON.parse(stdout) as string[]);
  expect(results.filter(v=>v==='ok')).toHaveLength(20);
  expect(results.filter(v=>v==='RATE_LIMITED')).toHaveLength(12);
  const counts=Object.values(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters).map(v=>(v as {count:number}).count);
  expect(counts).toEqual([20]);
  await exec(process.execPath,['-e',`${factory}s.acquireControlLease().then(()=>process.exit(0));`]);
  await setup();
  await expect(storage.acquireControlLease()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
},15_000);

it('accepts an exact 4MiB valid state and refuses to acknowledge a failed atomic replace',async()=>{
  await setup();
  const path=join(root,'state.json');
  const empty=JSON.stringify({version:1,counters:{}});
  await writeFile(path,empty+' '.repeat(4*1024*1024-empty.length));
  await expect(storage.consumeRate({ip,buckets:['ip']})).resolves.toBeUndefined();
  const before=await readFile(path,'utf8');
  const filesystem=await import('node:fs/promises');
  vi.mocked(filesystem.rename).mockRejectedValueOnce(new Error('isolated simulated write failure'));
  await expect(storage.consumeRate({ip,buckets:['ip']})).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
  expect(await readFile(path,'utf8')).toBe(before);
  await expect(storage.consumeRate({ip,buckets:['ip']})).resolves.toBeUndefined();
});

it('rejects a consent generation beyond the SQL signed integer bound',async()=>{
  await setup();
  await writeFile(join(root,'control.json'),JSON.stringify({...initial,consent_generation:2147483648}));
  await expect(storage.readControl()).rejects.toMatchObject({code:'ROUND2_UNAVAILABLE'});
});

it('uses the clock after lock acquisition when waiting crosses a fixed-window boundary',async()=>{
  await setup();
  await mkdir(join(root,'rate.lock'),{mode:0o700});
  const pending=storage.consumeRate({ip,buckets:['ip']});
  await new Promise(resolve=>setTimeout(resolve,75));
  clock+=60_000;
  await rm(join(root,'rate.lock'),{recursive:true});
  await pending;
  expect(Object.values(JSON.parse(await readFile(join(root,'state.json'),'utf8')).counters)).toEqual([{count:1,window_end:clock/1000+60}]);
});
