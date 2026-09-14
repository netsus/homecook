import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, cp, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

function wire(url:string, init:RequestInit={}) {
  return new Promise<Response>((resolve,reject)=>{
    const request=httpRequest(url,{method:init.method??'GET',headers:init.headers as Record<string,string>},incoming=>{
      const chunks:Buffer[]=[];incoming.on('data',chunk=>chunks.push(Buffer.from(chunk)));incoming.on('error',reject);incoming.on('end',()=>{
        const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers)){if(Array.isArray(value))for(const item of value)headers.append(key,item);else if(value!==undefined)headers.set(key,value);}
        resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode,headers}));
      });
    });request.on('error',reject);request.end(init.body as string|undefined);
  });
}
const run = promisify(execFile);
let child: ChildProcess | undefined;
let temporary: string | undefined;
afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child?.kill('SIGKILL'); resolve(); }, 3000);
      child!.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (temporary) await rm(temporary, { recursive:true, force:true });
});
it('serves the authenticated operator flow through real Next dev behind forwarded HTTPS, without Siteverify', async () => {
  temporary = await realpath(await mkdtemp(join(tmpdir(),'r2-preflight-next-')));
  const fixture=join(temporary,'app-fixture'), privateDir=join(temporary,'private');
  await mkdir(join(fixture,'app','%5F_ops','r2-preflight'),{recursive:true});
  await mkdir(join(fixture,'lib','server'),{recursive:true});
  await mkdir(privateDir,{mode:0o700});
  await cp(join(process.cwd(),'lib/server/marketing-round2-preflight.ts'),join(fixture,'lib/server/marketing-round2-preflight.ts'));
  await cp(join(process.cwd(),'app/%5F_ops/r2-preflight/route.ts'),join(fixture,'app/%5F_ops/r2-preflight/route.ts'));
  await symlink(join(process.cwd(),'node_modules'),join(fixture,'node_modules'));
  const inherited = createRequire(join(process.cwd(),'package.json'));
  await writeFile(join(fixture,'package.json'),JSON.stringify({private:true,scripts:{dev:'next dev'},dependencies:Object.fromEntries(['next','react','react-dom'].map(name=>[name,inherited(name+'/package.json').version])),devDependencies:{typescript:inherited('typescript/package.json').version}}));
  await writeFile(join(fixture,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2017',lib:['dom','esnext'],strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',jsx:'preserve',baseUrl:'.',paths:{'@/*':['./*']}},include:['**/*.ts']}));
  await writeFile(join(fixture,'.gitignore'),'node_modules\n.next\n');
  for(const args of [['init','--quiet'],['add','.'],['-c','user.name=Isolated Fixture','-c','user.email=isolated@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Create isolated Next preflight fixture']])await run('git',args,{cwd:fixture});
  const releaseSha=(await run('git',['rev-parse','HEAD'],{cwd:fixture})).stdout.trim();
  const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(new Error('port unavailable'));server.close(()=>resolve(address.port));});});
  const credential='isolated-operator-credential-'+'a'.repeat(40);
  const armPath=join(privateDir,'arm.json'); const buildId='isolated-next-dev';
  const now=Date.now();await writeFile(armPath,JSON.stringify({version:1,credential_sha256:createHash('sha256').update(credential).digest('hex'),issued_at:now,expires_at:now+600000,release_sha:releaseSha,build_id:buildId,origin:'https://app.mumeok.kr'}),{mode:0o600});
  child=spawn(process.execPath,[join(process.cwd(),'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:fixture,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',MUMEOK_ROUND2_PREFLIGHT_ARM_PATH:armPath,NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY:'isolated-fake-site-key',MUMEOK_ROUND2_TURNSTILE_SECRET_KEY:'isolated-fake-secret'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout?.on('data',chunk=>{output+=String(chunk);});child.stderr?.on('data',chunk=>{output+=String(chunk);});
  const url=`http://127.0.0.1:${port}/__ops/r2-preflight`;
  let ready=false;
  for(let i=0;i<160;i++){if(child.exitCode!==null)throw new Error('isolated Next exited: '+output);try{await wire(url);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  expect(ready).toBe(true);
  await mkdir(join(fixture,'.next'),{recursive:true});await writeFile(join(fixture,'.next','BUILD_ID'),buildId);
  const proxyHeaders={host:'app.mumeok.kr','x-forwarded-proto':'https'};
  const login=await wire(url,{headers:proxyHeaders});expect(login.status,output).toBe(200);expect(await login.text()).toContain('type="password"');
  const auth=await wire(url,{method:'POST',headers:{...proxyHeaders,origin:'https://app.mumeok.kr','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({op:'authenticate',credential})});expect(auth.status).toBe(200);
  const cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const widgets=await wire(url,{headers:{...proxyHeaders,cookie}});expect(widgets.status).toBe(200);const html=await widgets.text();expect(html).toContain('class="cf-turnstile"');expect(html).toContain('isolated-fake-site-key');
  expect((await wire(url,{headers:{host:'app.mumeok.kr','x-forwarded-proto':'http'}})).status).toBe(404);
  expect((await wire(url,{headers:{host:'evil.test','x-forwarded-proto':'https'}})).status).toBe(404);
  expect((await wire(url,{method:'POST',headers:{...proxyHeaders,origin:'https://evil.test','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({op:'authenticate',credential})})).status).toBe(404);
  expect(output).not.toContain(credential);
},60000);
