import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
const ORIGIN = 'https://app.mumeok.kr';
const COOKIE = '__Host-r2-preflight';
const ACTIONS = ['mumeok_r2_recording', 'mumeok_r2_homeflow'] as const;
type Action = typeof ACTIONS[number];
type Arm = {
    version: 1;
    credential_sha256: string;
    issued_at: number;
    expires_at: number;
    release_sha: string;
    build_id: string;
    origin: typeof ORIGIN;
};
type Grant = {
    action: Action;
    nonce_hash: string;
    used: boolean;
};
type State = {
    arm_hash: string;
    session_hash?: string;
    csrf_hash?: string;
    attempts: Record<Action, number>;
    grants: Grant[];
    proofs: Record<string, unknown>[];
    ingress_attempts: number;
    ingress_nonce_hash?: string;
    ingress: IngressObservation[];
};
type Options = {
    armPath?: string;
    releaseIdentity: () => Promise<{
        releaseSha: string;
        buildId: string;
    }>;
    siteKey: string;
    secret: string;
    now?: () => number;
    fetch?: typeof fetch;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
function equal(a: string, b: string) { return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function reject(): never { throw new Error('preflight closed'); }
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'x-robots-tag': 'noindex, nofollow' };
const closed = () => new Response(null, { status: 404, headers });
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
async function privateFile(path: string) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.() || stat.nlink !== 1 || stat.size > 65536)
            reject();
        return await handle.readFile('utf8');
    }
    finally {
        await handle.close();
    }
}
async function readArm(options: Options, now: number) {
    const path = options.armPath;
    if (!path || !isAbsolute(path) || resolve(path) !== path)
        reject();
    const directory = dirname(path);
    const stat = await lstat(directory);
    const actual = await realpath(directory);
    const inside = relative(process.cwd(), actual);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.() || actual !== directory || !(inside === '..' || inside.startsWith('..' + sep)))
        reject();
    const raw = await privateFile(path);
    const arm: unknown = JSON.parse(raw);
    if (!exact(arm, ['version', 'credential_sha256', 'issued_at', 'expires_at', 'release_sha', 'build_id', 'origin']) || arm.version !== 1 || arm.origin !== ORIGIN ||
        typeof arm.credential_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(arm.credential_sha256) ||
        typeof arm.release_sha !== 'string' || !/^[a-f0-9]{40}$/.test(arm.release_sha) || typeof arm.build_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(arm.build_id) ||
        !Number.isSafeInteger(arm.issued_at) || !Number.isSafeInteger(arm.expires_at) || Number(arm.issued_at) > now || Number(arm.expires_at) <= now || Number(arm.expires_at) - Number(arm.issued_at) > 900000 || Number(arm.expires_at) <= Number(arm.issued_at))
        reject();
    const identity = await options.releaseIdentity();
    if (!options.fetch && [options.siteKey, options.secret].some(key => /^[123]x0{8}/.test(key)))
        reject();
    if (identity.releaseSha !== arm.release_sha || identity.buildId !== arm.build_id || !options.siteKey || !options.secret)
        reject();
    return { arm: arm as Arm, armHash: digest(raw), path };
}
async function saveState(path: string, state: State) {
    const temporary = `${path}.${random()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
        await file.writeFile(JSON.stringify(state));
        await file.sync();
    }
    finally {
        await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try {
        await directory.sync();
    }
    finally {
        await directory.close();
    }
}
async function locked<T>(path: string, armHash: string, callback: (state: State, save: () => Promise<void>) => Promise<T>) {
    const lock = `${path}.lock`;
    // Never steal a stale lock: a process crash has an unknown result and closes this arm.
    await mkdir(lock, { mode: 0o700 });
    try {
        let state: State;
        try {
            state = JSON.parse(await privateFile(`${path}.state`));
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
            state = { arm_hash: armHash, attempts: { mumeok_r2_recording: 0, mumeok_r2_homeflow: 0 }, grants: [], proofs: [], ingress_attempts: 0, ingress: [] };
        }
        if (!Number.isInteger(state.ingress_attempts) || state.ingress_attempts < 0 || state.ingress_attempts > 3 || !Array.isArray(state.ingress) || state.arm_hash !== armHash || !ACTIONS.every(a => Number.isInteger(state.attempts?.[a]) && state.attempts[a] >= 0 && state.attempts[a] <= 3) || !Array.isArray(state.grants) || !Array.isArray(state.proofs))
            reject();
        return await callback(state, () => saveState(`${path}.state`, state));
    }
    finally {
        await rmdir(lock);
    }
}
async function body(request: Request) {
    if (request.headers.get('content-type') !== 'application/json')
        reject();
    const reader = request.body?.getReader();
    if (!reader)
        reject();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            bytes += part.value.length;
            if (bytes > 8192) {
                await reader.cancel();
                reject();
            }
            chunks.push(part.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function session(request: Request, state: State) {
    const cookies = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
    if (cookies.length !== 1)
        reject();
    const value = cookies[0].slice(COOKIE.length + 1);
    if (!/^[a-f0-9]{64}$/.test(value) || !state.session_hash || !equal(digest(value), state.session_hash))
        reject();
}
function loginPage() {
    const nonce = random();
    return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>R2 운영자 인증</title><h1>운영자 인증</h1><form id="login" autocomplete="off"><label>일회성 인증값 <input id="credential" type="password" autocomplete="off" required maxlength="256"></label><button type="submit">인증</button></form><p id="status"></p><script nonce="${nonce}">document.getElementById('login').addEventListener('submit',async event=>{event.preventDefault();const input=document.getElementById('credential');let credential=input.value;input.value='';try{const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'authenticate',credential})});credential='';if(response.ok)location.reload();else document.getElementById('status').textContent='인증할 수 없습니다.';}catch{document.getElementById('status').textContent='인증할 수 없습니다.';}finally{credential='';}});</script></html>`,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`}});
}
export type IngressObservation = {version:1;arm_sha256:string;release_sha:string;build_id:string;nonce:string;ip_hmac:string;observed_at:string;observation_only:true};
/** Exact IP text is ephemeral, as returned by the same client's /cdn-cgi/trace. Never persist it. */
export function preflightIngressDigest(credentialHash:string, armHash:string, nonce:string, ip:string) {
    if (![credentialHash,armHash,nonce].every(v=>/^[a-f0-9]{64}$/.test(v)) || !isIP(ip)) reject();
    return createHmac('sha256',Buffer.from(credentialHash,'hex')).update(JSON.stringify(['r2-ingress-v1',armHash,nonce,ip])).digest('hex');
}
/** Requires both actual HTTP observations and a fresh same-client trace IP; presence flags cannot pass. */
export function verifyPreflightIngressPair(input:{credentialHash:string;armHash:string;releaseSha:string;buildId:string;traceIp:string;normal:IngressObservation;spoofed:IngressObservation}) {
    const observations=[input.normal,input.spoofed];
    if (input.normal.nonce===input.spoofed.nonce || input.traceIp==='192.0.2.123') reject();
    for(const observation of observations) {
        if (!exact(observation,['version','arm_sha256','release_sha','build_id','nonce','ip_hmac','observed_at','observation_only']) || observation.version!==1 || observation.arm_sha256!==input.armHash || observation.release_sha!==input.releaseSha || observation.build_id!==input.buildId || observation.observation_only!==true || !Number.isFinite(Date.parse(observation.observed_at))) reject();
        if(!equal(observation.ip_hmac,preflightIngressDigest(input.credentialHash,input.armHash,observation.nonce,input.traceIp))) reject();
    }
    if(equal(input.spoofed.ip_hmac,preflightIngressDigest(input.credentialHash,input.armHash,input.spoofed.nonce,'192.0.2.123'))) reject();
    const verificationHmac = createHmac('sha256', Buffer.from(input.credentialHash, 'hex'))
        .update(JSON.stringify(['r2-ingress-verified-v1', input.armHash, input.releaseSha, input.buildId, input.normal, input.spoofed])).digest('hex');
    return {version:1 as const,arm_sha256:input.armHash,release_sha:input.releaseSha,build_id:input.buildId,reserved_probe:'192.0.2.123' as const,normal:input.normal,spoofed:input.spoofed,verification_hmac:verificationHmac};
}
function page(siteKey: string, csrf: string, grants: {
    action: Action;
    nonce: string;
}[], ingressNonce: string | null) {
    const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const scriptNonce = random();
    const config = JSON.stringify({ csrf, grants, ingress_nonce: ingressNonce }).replaceAll('<', '\\u003c');
    const widgets = grants.map((g, i) => `<section><h2>${g.action}</h2><div class="cf-turnstile" data-sitekey="${escape(siteKey)}" data-action="${g.action}" data-cdata="${g.nonce}" data-callback="verified${i}" data-response-field="false"></div><p id="status${i}">운영자가 정상 위젯을 완료해 주세요.</p></section>`).join('');
    const callbacks = grants.map((_, i) => `window.verified${i}=token=>{verification=verification.then(async()=>{let result;try{result=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'verify',csrf:config.csrf,...config.grants[${i}],token})});document.getElementById('status${i}').textContent=result.ok?'검증 기록 완료. 수집은 자동 활성화되지 않습니다.':'검증 실패 또는 사용 횟수 소진';}catch{document.getElementById('status${i}').textContent='검증 결과 불명';}finally{token=null;}});};`).join('');
    return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>R2 운영자 사전검증</title><h1>비수집 사전검증</h1><p>고객 DB에 기록하지 않습니다. 각 주제 최대 3회입니다. 다음 시도는 새로고침하세요.</p>${widgets}<script id="preflight-config" type="application/json">${config}</script><script nonce="${scriptNonce}">const config=JSON.parse(document.getElementById('preflight-config').textContent);let verification=Promise.resolve();${callbacks}</script><script nonce="${scriptNonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></html>`, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': `default-src 'none'; script-src 'nonce-${scriptNonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}
export function createPreflightHandler(options: Options) {
    const now = options.now ?? Date.now;
    return async (request: Request): Promise<Response> => {
        try {
            const url = new URL(request.url);
            // Next constructs an internal URL behind the TLS proxy; the exact Host and
            // forwarded HTTPS boundary identify the public origin, never the internal URL host.
            const forwardedProto = request.headers.get('x-forwarded-proto');
            const secureTransport = forwardedProto === null ? url.protocol === 'https:' : forwardedProto === 'https';
            if (!secureTransport || url.pathname !== '/__ops/r2-preflight' || url.search || request.headers.get('host') !== 'app.mumeok.kr' || !['GET', 'POST'].includes(request.method))
                return closed();
            if (request.method === 'POST' && (request.headers.get('origin') !== ORIGIN || request.headers.get('sec-fetch-site') !== 'same-origin'))
                return closed();
            const { arm, armHash, path } = await readArm(options, now());
            const value = request.method === 'POST' ? await body(request) : null;
            return await locked(path, armHash, async (state, save) => {
                if (now() >= arm.expires_at)
                    reject();
                if (request.method === 'POST' && exact(value, ['op', 'credential']) && value.op === 'authenticate') {
                    if (typeof value.credential !== 'string' || value.credential.length < 32 || value.credential.length > 256 || !equal(digest(value.credential), arm.credential_sha256))
                        reject();
                    const cookie = random();
                    state.session_hash = digest(cookie);
                    state.grants = [];
                    delete state.csrf_hash;
                    await save();
                    return Response.json({ authenticated: true }, { headers: { ...headers, 'set-cookie': `${COOKIE}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(1, Math.floor((arm.expires_at - now()) / 1000))}` } });
                }
                if (request.method === 'GET') {
                    try { session(request, state); } catch { return loginPage(); }
                } else session(request, state);
                if (request.method === 'GET') {
                    const csrf = random();
                    state.csrf_hash = digest(csrf);
                    const grants = ACTIONS.filter(a => state.attempts[a] < 3).map(action => ({ action, nonce: random() }));
                    state.grants = grants.map(g => ({ action: g.action, nonce_hash: digest(g.nonce), used: false }));
                    const ingressNonce = state.ingress_attempts < 3 ? random() : null;
                    if (ingressNonce) state.ingress_nonce_hash = digest(ingressNonce); else delete state.ingress_nonce_hash;
                    await save();
                    return page(options.siteKey, csrf, grants, ingressNonce);
                }
                if (exact(value, ['op', 'csrf', 'nonce']) && value.op === 'ingress') {
                    if (typeof value.csrf !== 'string' || !state.csrf_hash || !equal(digest(value.csrf), state.csrf_hash) || typeof value.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(value.nonce) || !state.ingress_nonce_hash || !equal(digest(value.nonce), state.ingress_nonce_hash) || state.ingress_attempts >= 3) reject();
                    state.ingress_attempts++; delete state.ingress_nonce_hash; await save();
                    const ip = request.headers.get('cf-connecting-ip') ?? '';
                    if (!isIP(ip)) reject();
                    const observation: IngressObservation = {version:1, arm_sha256:armHash, release_sha:arm.release_sha, build_id:arm.build_id, nonce:value.nonce, ip_hmac:preflightIngressDigest(arm.credential_sha256,armHash,value.nonce,ip), observed_at:new Date(now()).toISOString(), observation_only:true};
                    state.ingress.push(observation); await save();
                    return Response.json(observation,{headers});
                }
                if (!exact(value, ['op', 'csrf', 'action', 'nonce', 'token']) || value.op !== 'verify' || typeof value.csrf !== 'string' || !state.csrf_hash || !equal(digest(value.csrf), state.csrf_hash) || typeof value.action !== 'string' || !ACTIONS.includes(value.action as Action) || typeof value.nonce !== 'string' || typeof value.token !== 'string' || value.token.length < 1 || value.token.length > 2048)
                    reject();
                const action = value.action as Action;
                const grant = state.grants.find(g => g.action === action && equal(g.nonce_hash, digest(value.nonce as string)) && !g.used);
                if (!grant || state.attempts[action] >= 3)
                    reject();
                grant.used = true;
                state.attempts[action]++;
                await save(); // Durable reservation before the external effect; errors still consume an attempt.
                const response = await (options.fetch ?? fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: options.secret, response: value.token }), signal: AbortSignal.timeout(5000), redirect: 'error' });
                const result: unknown = await response.json();
                if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result))
                    reject();
                const verified = result as Record<string, unknown>;
                const challenge = typeof verified.challenge_ts === 'string' ? Date.parse(verified.challenge_ts) : NaN;
                if (verified.success !== true || verified.hostname !== 'app.mumeok.kr' || verified.action !== action || verified.cdata !== value.nonce || !Number.isFinite(challenge) || challenge < now() - 300000 || challenge > now() + 30000)
                    reject();
                // Recheck arm and live source after Siteverify: a deployment or expiry invalidates the proof.
                if ((await readArm(options, now())).armHash !== armHash)
                    reject();
                state.proofs.push({ arm_sha256: armHash, provider: options.fetch ? 'provider_mock' : 'provider_live', release_sha: arm.release_sha, build_id: arm.build_id, action, hostname: 'app.mumeok.kr', verified_at: new Date(now()).toISOString(), secret_sha256: digest(options.secret), sitekey_sha256: digest(options.siteKey), ingress: { cf_connecting_ip_present: request.headers.has('cf-connecting-ip'), forwarded_for_present: request.headers.has('x-forwarded-for'), cf_ray_present: request.headers.has('cf-ray'), observation_only: true } });
                await save();
                return Response.json({ verified: true }, { headers });
            });
        }
        catch {
            return closed();
        }
    };
}
/** Runtime wiring only: no database/client/business readiness imports or collection side effects. */
export function handlePreflight(request: Request) {
    return createPreflightHandler({ armPath: process.env.MUMEOK_ROUND2_PREFLIGHT_ARM_PATH, siteKey: process.env.NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY ?? '', secret: process.env.MUMEOK_ROUND2_TURNSTILE_SECRET_KEY ?? '', releaseIdentity: async () => {
            const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), timeout: 2000, maxBuffer: 1024 });
            return { releaseSha: stdout.trim(), buildId: (await readFile(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')).trim() };
        } })(request);
}
