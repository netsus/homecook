import { mkdtemp, writeFile, readFile, chmod, rm, mkdir, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreflightHandler, preflightIngressDigest, verifyPreflightIngressPair } from '@/lib/server/marketing-round2-preflight';
const origin = 'https://app.mumeok.kr';
const sha = 'a'.repeat(40);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'r2-ops-')));
    dirs.push(directory);
    await chmod(directory, 0o700);
    const now = Date.now();
    const armPath = join(directory, 'arm.json');
    const arm = { version: 1, credential_sha256: hash('x'.repeat(48)), issued_at: now - 1000, expires_at: now + 600000, release_sha: sha, build_id: 'test-build', origin };
    await writeFile(armPath, JSON.stringify(arm), { mode: 0o600 });
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
        const form = init?.body as URLSearchParams;
        return Response.json({ success: true, hostname: 'app.mumeok.kr', action: form.get('response')?.startsWith('home') ? 'mumeok_r2_homeflow' : 'mumeok_r2_recording', cdata: form.get('response')?.split(':')[1], challenge_ts: new Date(now).toISOString() });
    });
    const options = { armPath, releaseIdentity: async () => ({ releaseSha: sha, buildId: 'test-build' }), siteKey: 'site-public', secret: 'test-secret', fetch: fetcher, now: () => now };
    const handler = createPreflightHandler(options);
    const req = (body?: unknown, cookie?: string) => new Request(origin + '/__ops/r2-preflight', { method: body ? 'POST' : 'GET', headers: { host: 'app.mumeok.kr', origin, 'sec-fetch-site': 'same-origin', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    async function login() { const res = await handler(req({ op: 'authenticate', credential: 'x'.repeat(48) })); expect(res.status).toBe(200); return res.headers.get('set-cookie')!.split(';')[0]; }
    async function grants(cookie: string) { const res = await handler(req(undefined, cookie)); const html = await res.text(); const parsed = JSON.parse(html.match(/id="preflight-config" type="application\/json">([^<]+)/)![1]); return { html, ...parsed }; }
    return { directory, armPath, arm, options, handler, req, login, grants, fetcher };
}
describe('non-collecting operator preflight', () => {
    it('defaults to 404 when unarmed and offers password form only under a valid arm', async () => { const f = await fixture(); expect((await createPreflightHandler({ ...f.options, armPath: undefined })(f.req())).status).toBe(404); const login = await f.handler(f.req()); expect(login.status).toBe(200); expect(await login.text()).toContain('type="password"'); expect(f.fetcher).not.toHaveBeenCalled(); });
    it('returns only operation-bound ingress HMAC with durable three-use quota', async () => {
        const f = await fixture(); const cookie = await f.login();
        for (let i = 0; i < 3; i++) {
            const g = await f.grants(cookie); expect(g.ingress_nonce).toMatch(/^[a-f0-9]{64}$/);
            const request = f.req({op:'ingress',csrf:g.csrf,nonce:g.ingress_nonce}, cookie);
            request.headers.set('cf-connecting-ip','198.51.100.42');
            const response = await f.handler(request); expect(response.status).toBe(200);
            const receipt = await response.json(); expect(receipt.observation_only).toBe(true); expect(receipt.ip_hmac).toMatch(/^[a-f0-9]{64}$/);
            const {createHmac} = await import('node:crypto');
            expect(receipt.ip_hmac).toBe(createHmac('sha256',Buffer.from(f.arm.credential_sha256,'hex')).update(JSON.stringify(['r2-ingress-v1',hash(JSON.stringify(f.arm)),g.ingress_nonce,'198.51.100.42'])).digest('hex'));
            expect(JSON.stringify(receipt)).not.toContain('198.51.100.42');
            expect((await f.handler(f.req({op:'ingress',csrf:g.csrf,nonce:g.ingress_nonce},cookie))).status).toBe(404);
        }
        const state = await readFile(f.armPath+'.state','utf8'); expect(state).not.toContain('198.51.100.42'); expect(f.fetcher).not.toHaveBeenCalled();
        const res = await createPreflightHandler(f.options)(f.req(undefined,cookie)); expect(await res.text()).toContain('"ingress_nonce":null');
    });
    it('checks both normal and reserved fake-header observations against the ephemeral trace IP', async()=>{
        const f=await fixture();const cookie=await f.login();const receipts=[];
        for(let i=0;i<2;i++) {const g=await f.grants(cookie);const request=f.req({op:'ingress',csrf:g.csrf,nonce:g.ingress_nonce},cookie);request.headers.set('cf-connecting-ip','198.51.100.42');receipts.push(await (await f.handler(request)).json());}
        const input={credentialHash:f.arm.credential_sha256,armHash:hash(JSON.stringify(f.arm)),releaseSha:sha,buildId:'test-build',traceIp:'198.51.100.42',normal:receipts[0],spoofed:receipts[1]};
        const proof=verifyPreflightIngressPair(input);expect(JSON.stringify(proof)).not.toContain(input.traceIp);
        const {createHmac}=await import('node:crypto');
        expect(proof.verification_hmac).toBe(createHmac('sha256',Buffer.from(input.credentialHash,'hex')).update(JSON.stringify(['r2-ingress-verified-v1',input.armHash,input.releaseSha,input.buildId,input.normal,input.spoofed])).digest('hex'));
        expect(JSON.stringify(proof)).not.toContain(input.credentialHash);
        expect(()=>verifyPreflightIngressPair({...input,spoofed:{...input.spoofed,ip_hmac:preflightIngressDigest(input.credentialHash,input.armHash,input.spoofed.nonce,'192.0.2.123')}})).toThrow();
        expect(()=>verifyPreflightIngressPair({...input,normal:{...input.normal,ip_hmac:'a'.repeat(64)}})).toThrow();
        expect(()=>verifyPreflightIngressPair({...input,spoofed:input.normal})).toThrow();
        expect(()=>verifyPreflightIngressPair({...input,releaseSha:'b'.repeat(40)})).toThrow();
        expect(()=>verifyPreflightIngressPair({...input,spoofed:{passed:true} as never})).toThrow();
    });
    it('rejects ingress without authentication, CSRF, a hex grant or a single IP', async()=>{
        const f=await fixture(); const cookie=await f.login(); const g=await f.grants(cookie);
        for(const body of [{op:'ingress',csrf:'wrong',nonce:g.ingress_nonce},{op:'ingress',csrf:g.csrf,nonce:'not-hex'}])expect((await f.handler(f.req(body,cookie))).status).toBe(404);
        expect((await f.handler(f.req({op:'ingress',csrf:g.csrf,nonce:g.ingress_nonce}))).status).toBe(404);
        const request=f.req({op:'ingress',csrf:g.csrf,nonce:g.ingress_nonce},cookie);request.headers.set('cf-connecting-ip','198.51.100.42, 192.0.2.1');expect((await f.handler(request)).status).toBe(404);expect(f.fetcher).not.toHaveBeenCalled();
    });
    it('rejects noncanonical, symlinked and inside-root dotdot-name arm paths',async()=>{
        const f=await fixture();
        for(const armPath of [f.directory+'/./arm.json',f.directory+'/../'+f.directory.split('/').at(-1)+'/arm.json'])expect((await createPreflightHandler({...f.options,armPath})(f.req())).status).toBe(404);
        const link=f.directory+'-link';await symlink(f.directory,link);dirs.push(link);expect((await createPreflightHandler({...f.options,armPath:link+'/arm.json'})(f.req())).status).toBe(404);
        const evil=join(f.directory,'..evil');await mkdir(evil,{mode:0o700});await writeFile(join(evil,'arm.json'),JSON.stringify(f.arm),{mode:0o600});
        const cwd=vi.spyOn(process,'cwd').mockReturnValue(f.directory);
        try {expect((await createPreflightHandler({...f.options,armPath:join(evil,'arm.json')})(f.req())).status).toBe(404);}finally{cwd.mockRestore();}
    });
    it('rejects wrong credentials, origin, expired arm, unsafe permissions and identity mismatch', async () => { const f = await fixture(); expect((await f.handler(f.req({ op: 'authenticate', credential: 'wrong' }))).status).toBe(404); const req = f.req({ op: 'authenticate', credential: 'x'.repeat(48) }); req.headers.set('origin', 'https://evil.test'); expect((await f.handler(req)).status).toBe(404); for (const override of [{ expires_at: f.arm.issued_at - 1 }, { expires_at: Date.now() + 3600000 }, { release_sha: 'b'.repeat(40) }, { build_id: 'other' }]) {
        await writeFile(f.armPath, JSON.stringify({ ...f.arm, ...override }));
        expect((await f.handler(f.req({ op: 'authenticate', credential: 'x'.repeat(48) }))).status).toBe(404);
    } await writeFile(f.armPath, JSON.stringify(f.arm)); await chmod(f.armPath, 0o644); expect((await f.handler(f.req({ op: 'authenticate', credential: 'x'.repeat(48) }))).status).toBe(404); });
    it('requires CSRF, consumes each nonce once and persists exact sanitized proof', async () => { const f = await fixture(); const cookie = await f.login(); const g = await f.grants(cookie); expect(g.html).toContain('class="cf-turnstile"'); const item = g.grants[0]; const body = { op: 'verify', csrf: g.csrf, action: item.action, nonce: item.nonce, token: 'record:' + item.nonce }; expect((await f.handler(f.req({ ...body, csrf: 'wrong' }, cookie))).status).toBe(404); expect(f.fetcher).not.toHaveBeenCalled(); expect((await f.handler(f.req(body, cookie))).status).toBe(200); expect((await f.handler(f.req(body, cookie))).status).toBe(404); const state = await readFile(join(f.directory, 'arm.json.state'), 'utf8'); expect(state).not.toContain('test-secret'); expect(state).not.toContain(body.token); expect(state).not.toContain('x'.repeat(48)); expect(state).toContain('provider_mock'); expect(state).toContain(sha); });
    it('fails closed on provider failure, wrong hostname/action/cdata and an existing unknown lock', async () => {
        for (const result of [{ success: false }, { success: true, hostname: 'evil.test' }, { success: true, hostname: 'app.mumeok.kr', action: 'other' }, { success: true, hostname: 'app.mumeok.kr', action: 'mumeok_r2_recording', cdata: 'wrong' }]) {
            const f = await fixture();
            const cookie = await f.login();
            const g = await f.grants(cookie);
            const item = g.grants[0];
            f.fetcher.mockImplementationOnce(async () => Response.json(result));
            expect((await f.handler(f.req({ op: 'verify', csrf: g.csrf, ...item, token: 'record:' + item.nonce }, cookie))).status).toBe(404);
            const state = JSON.parse(await readFile(join(f.directory, 'arm.json.state'), 'utf8'));
            expect(state.proofs).toHaveLength(0);
            expect(state.attempts.mumeok_r2_recording).toBe(1);
        }
        const f = await fixture();
        await mkdir(f.armPath + '.lock');
        expect((await f.handler(f.req({ op: 'authenticate', credential: 'x'.repeat(48) }))).status).toBe(404);
        expect(f.fetcher).not.toHaveBeenCalled();
    });
    it('rejects arm drift during provider execution and never persists its proof', async () => {
        const f = await fixture();
        const cookie = await f.login();
        const g = await f.grants(cookie);
        const item = g.grants[0];
        f.fetcher.mockImplementationOnce(async () => { await writeFile(f.armPath, JSON.stringify({ ...f.arm, build_id: 'other' })); return Response.json({ success: true, hostname: 'app.mumeok.kr', action: item.action, cdata: item.nonce, challenge_ts: new Date(f.options.now()).toISOString() }); });
        expect((await f.handler(f.req({ op: 'verify', csrf: g.csrf, ...item, token: 'record:' + item.nonce }, cookie))).status).toBe(404);
        expect(f.fetcher).toHaveBeenCalledTimes(1);
        expect(JSON.parse(await readFile(f.armPath + '.state', 'utf8')).proofs).toHaveLength(0);
    });
    it('keeps secret, raw IP and token outside HTML, responses and persisted state', async () => {
        const f = await fixture();
        const cookie = await f.login();
        const g = await f.grants(cookie);
        const item = g.grants[1];
        const token = 'home:' + item.nonce;
        const request = f.req({ op: 'verify', csrf: g.csrf, ...item, token }, cookie);
        request.headers.set('cf-connecting-ip', '198.51.100.42');
        request.headers.set('x-forwarded-for', '198.51.100.42');
        const response = await f.handler(request);
        expect(response.status).toBe(200);
        const all = g.html + await response.text() + await readFile(f.armPath + '.state', 'utf8');
        for (const privateValue of ['198.51.100.42', token, 'test-secret', 'x'.repeat(48)])
            expect(all).not.toContain(privateValue);
        const [providerUrl, providerInit] = f.fetcher.mock.calls[0];
        expect(providerUrl).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        expect((providerInit?.body as URLSearchParams).has('remoteip')).toBe(false);
    });
    it('caps auth body and rejects cross-site, query credentials, missing CSRF and added fields', async () => {
        const f = await fixture();
        for (const change of [(r: Request) => r.headers.delete('sec-fetch-site'), (r: Request) => r.headers.set('sec-fetch-site', 'cross-site')]) {
            const r = f.req({ op: 'authenticate', credential: 'x'.repeat(48) });
            change(r);
            expect((await f.handler(r)).status).toBe(404);
        }
        expect((await f.handler(f.req({ op: 'authenticate', credential: 'x'.repeat(9000) }))).status).toBe(404);
        expect((await f.handler(f.req({ op: 'authenticate', credential: 'x'.repeat(48), extra: true }))).status).toBe(404);
        expect((await f.handler(new Request(origin + '/__ops/r2-preflight?credential=redacted'))).status).toBe(404);
        expect(f.fetcher).not.toHaveBeenCalled();
    });
    it('rechecks expiry and source after the provider without emitting a proof', async () => {
        const f = await fixture();
        const cookie = await f.login();
        const g = await f.grants(cookie);
        const item = g.grants[0];
        f.options.releaseIdentity = async () => ({ releaseSha: 'b'.repeat(40), buildId: 'test-build' });
        expect((await createPreflightHandler(f.options)(f.req({ op: 'verify', csrf: g.csrf, ...item, token: 'record:' + item.nonce }, cookie))).status).toBe(404);
        expect(f.fetcher).not.toHaveBeenCalled();
    });
    it('persists three-attempt quota per action across restart, with concurrent replay blocked', async () => { const f = await fixture(); const cookie = await f.login(); for (let n = 0; n < 3; n++) {
        const g = await f.grants(cookie);
        const item = g.grants.find((v: {
            action: string;
        }) => v.action === 'mumeok_r2_recording');
        const body = { op: 'verify', csrf: g.csrf, ...item, token: 'record:' + item.nonce };
        const replies = await Promise.all([f.handler(f.req(body, cookie)), f.handler(f.req(body, cookie))]);
        expect(replies.filter(r => r.status === 200)).toHaveLength(1);
    } const handler = createPreflightHandler(f.options); const page = await handler(f.req(undefined, cookie)); expect(await page.text()).not.toContain('data-action="mumeok_r2_recording"'); expect(f.fetcher).toHaveBeenCalledTimes(3); });
});
