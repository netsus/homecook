import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { createServer, request as httpsRequest, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMarketingRound2Handler } from "@/lib/server/marketing-round2";
import { createRound2PageContext, readRound2Cookie, serializeRound2Cookie } from "@/lib/server/marketing-round2-context";
import { checkRound2LeadReadiness, readRound2RuntimeConfig, resolveRound2TrustedIp, type Round2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";
import { createRound2FileStorage } from "@/lib/server/marketing-round2-storage";
import { createRound2TurnstileVerifier } from "@/lib/server/marketing-round2-turnstile";
import { CAMPAIGN_START, type Round2SuccessData, type Round2Topic } from "@/lib/marketing-round2";
import type { Round2Command, Round2RpcResult } from "@/types/marketing-round2";

const enabled = process.env.R2_HTTP_INTEGRATION === "1";
const origin = "https://localhost:3443";
const route = "/api/v1/marketing/round2";
const secretNames = ["page", "cookie", "bootstrap", "event", "email", "receipt", "rate"] as const;
type WireResponse = { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: { data: Round2SuccessData; error: { code: string } | null } };

/** The required isolated runner opts in explicitly; ordinary unit runs never touch Docker or a DB. */
describe.skipIf(!enabled)("r2 actual HTTPS + isolated SDK RPC + file control", () => {
  let dataUrl: string;
  let token: string;
  let dbNamespace: string;
  let directory: string | undefined;
  let server: Server | undefined;
  let ca: Buffer;
  let config: Round2RuntimeConfig;
  let storage: ReturnType<typeof createRound2FileStorage>;
  let rpcCalls: number;
  let providerCalls: number;
  let executeRpc: (command: Round2Command) => Promise<Round2RpcResult>;
  let executeHook: ((command: Round2Command) => Promise<Round2RpcResult>) | undefined;

  beforeAll(() => {
    dataUrl = process.env.R2_HTTP_DATA_URL ?? "";
    token = process.env.R2_HTTP_SERVICE_ROLE_KEY ?? "";
    dbNamespace = process.env.R2_HTTP_EXPECTED_DB_NAMESPACE ?? "";
    const identity = JSON.parse(process.env.R2_HTTP_TARGET_IDENTITY_JSON ?? "null");
    // The runner creates and verifies these resources before exposing the ephemeral JWT.
    expect(dbNamespace).toMatch(/^hcg_[0-9]+_[a-z0-9]+$/);
    expect(identity).toMatchObject({ projectId: dbNamespace, dataApiUrl: dataUrl, cliVersion: "2.110.0" });
    expect(identity.migrationSha256).toMatch(/^[a-f0-9]{64}$/);
    const url = new URL(dataUrl);
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toMatch(/^[1-9][0-9]+$/);
    expect(Number(url.port)).toBeLessThanOrEqual(65535);
    expect(url.username + url.password + url.search + url.hash).toBe("");
    expect(url.pathname).toBe("/");
    expect(token.split(".").length).toBe(3);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    expect(claims.role).toBe("service_role");
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(claims.exp).toBeLessThan(Date.now() / 1000 + 7200);
  });

  beforeEach(async () => {
    rpcCalls = 0; providerCalls = 0; executeHook = undefined;
    directory = await realpath(await mkdtemp(join(tmpdir(), "r2-http-")));
    await chmod(directory, 0o700);
    const namespace = `r2-${dbNamespace.replaceAll("_", "-")}`;
    const fixture = join(directory, namespace);
    await mkdir(fixture, { mode: 0o700 });
    const rate = join(fixture, "rate");
    await mkdir(rate, { mode: 0o700 });
    const controlPath = join(fixture, "control.json");
    await writeFile(join(rate, "state.json"), JSON.stringify({ version: 1, counters: {} }), { mode: 0o600 });
    await writeFile(controlPath, JSON.stringify({ version: 1, collection_enabled: true, lead_enabled: true, consent_generation: 1 }), { mode: 0o600 });
    const vars: Record<string, string> = {
      NODE_ENV: "test", MUMEOK_ROUND2_PROFILE: "isolated", MUMEOK_ROUND2_ENABLED: "true", MUMEOK_ROUND2_LEADS_ENABLED: "true",
      MUMEOK_ROUND2_RATE_STATE_DIR: rate, MUMEOK_ROUND2_CONTROL_PATH: controlPath,
      MUMEOK_ROUND2_ISOLATED_IDENTITY_PATH: join(fixture, "identity.json"), DATA_SUPABASE_URL: dataUrl,
      MUMEOK_ROUND2_TURNSTILE_SECRET_KEY: randomBytes(32).toString("base64url"),
    };
    for (const name of secretNames) vars[`MUMEOK_ROUND2_${name.toUpperCase()}_SECRET`] = randomBytes(32).toString("base64url");
    config = readRound2RuntimeConfig(vars);
    await writeFile(vars.MUMEOK_ROUND2_ISOLATED_IDENTITY_PATH, JSON.stringify({
      version: 1, profile: "isolated", namespace, origin, hostname: "localhost", db_origin: dataUrl,
      rate_state_dir: rate, control_path: controlPath,
      secret_fingerprints: Object.fromEntries(secretNames.map(name => [name, createHash("sha256").update(config.secrets[name]).digest("hex")])),
    }), { mode: 0o600 });
    storage = createRound2FileStorage({ rateStateDir: rate, controlPath, repositoryRoot: process.cwd(), rateSecret: config.secrets.rate });
    const client = createClient(dataUrl, token, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { "x-homecook-internal-scope": "marketing-round2" },
        // The isolated fixture exposes bare PostgREST, without the production /rest/v1 proxy.
        fetch: async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          if (url.origin !== new URL(dataUrl).origin || url.pathname !== "/rest/v1/rpc/marketing_round2_apply") throw new Error("Unexpected isolated SDK destination");
          url.pathname = "/rpc/marketing_round2_apply";
          return fetch(url, init);
        },
      },
    });
    executeRpc = async command => {
      rpcCalls++;
      const result = await client.rpc("marketing_round2_apply", { p_command: command }).abortSignal(AbortSignal.timeout(12000));
      return { status: result.status, data: result.data, error: result.error ? { code: result.error.code, message: result.error.message } : null };
    };
    // The fake provider verification completed one second before dispatch; this also
    // avoids mistaking sub-second host/isolated-VM clock skew for a future verification.
    const verifyTurnstile = createRound2TurnstileVerifier({ secret: config.turnstileSecret, hostname: "localhost", now: () => Date.now() - 1000, fetch: async (input, init) => {
      expect(String(input)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      const body = init!.body as URLSearchParams;
      expect(body.has("remoteip")).toBe(false);
      expect(body.get("idempotency_key")).toMatch(/^[a-f0-9-]{36}$/);
      providerCalls++;
      return Response.json({ success: true, hostname: "localhost", action: body.get("response"), challenge_ts: new Date().toISOString() });
    } });
    const handle = createMarketingRound2Handler({
      config, readControl: storage.readControl, consumeRate: storage.consumeRate, acquireControlLease: storage.acquireControlLease,
      trustedIp: request => resolveRound2TrustedIp(request, config),
      leadReadiness: async () => checkRound2LeadReadiness(config, await storage.readControl()),
      execute: command => executeHook ? executeHook(command) : executeRpc(command), verifyTurnstile,
    });
    const keyPath = join(directory, "server.key");
    const certPath = join(directory, "server.crt");
    const opensslConfig = join(directory, "openssl.cnf");
    await writeFile(opensslConfig, "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n", { mode: 0o600 });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", keyPath, "-out", certPath, "-config", opensslConfig], { stdio: "ignore" });
    ca = await readFile(certPath);
    server = createServer({ key: await readFile(keyPath), cert: ca }, async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const method = incoming.method ?? "POST";
        const headers = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2) headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        const response = await handle(new Request(`${origin}${incoming.url}`, { method, headers, ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }) }));
        outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end("fixture transport failure"); }
    });
    // EADDRINUSE fails this test. Never kill or reuse an existing listener.
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(3443, "127.0.0.1", resolve); });
  }, 20000);

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function send(body: unknown, cookie?: string, headers: Record<string, string> = {}, method = "POST"): Promise<WireResponse> {
    return new Promise((resolve, reject) => {
      const request = httpsRequest({ hostname: "127.0.0.1", servername: "localhost", port: 3443, path: route, method, ca,
        headers: { host: "localhost:3443", origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers } }, response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); try { resolve({ status: response.statusCode!, headers: response.headers, text, json: JSON.parse(text) }); } catch { reject(new Error(`Non-JSON fixture HTTP response (${response.statusCode})`)); } });
      });
      request.on("error", reject);
      request.setTimeout(30000, () => request.destroy(new Error("Fixture HTTPS request timeout")));
      request.end(method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body));
    });
  }
  function action(topic: Round2Topic, name: string, rest: Record<string, unknown> = {}) {
    return { action: name, topic, event_id: randomUUID(), round_version: "r2.1", honeypot: "", ...rest };
  }
  async function bootstrap(topic: Round2Topic) {
    const body = action(topic, "bootstrap", { bootstrap_intent: "create_or_resume", bootstrap_key: randomBytes(32).toString("base64url"), page_context: createRound2PageContext(topic, "", config.secrets.page, Date.now() / 1000) });
    const response = await send(body);
    expect(response.status, response.json.error?.code).toBe(200);
    const cookies = response.headers["set-cookie"] as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(`__Secure-mumeok_r2_${topic}=`);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", `Path=${route}`, "Max-Age="]) expect(cookies[0]).toContain(attribute);
    expect(response.json.data.state).toEqual({ example: "not_started", survey: "not_started", lead: "not_started" });
    return { response, cookie: cookies[0].split(";")[0], body };
  }
  async function setControl(change: Record<string, boolean | number>) {
    const lease = await storage.acquireControlLease();
    try { await lease.writeControl({ ...await lease.readControl(), ...change }); } finally { await lease.release(); }
  }

  it("restores both topic cookies and preserves independent example/survey completion through real commits", async () => {
    for (const topic of ["recording", "homeflow"] as const) {
      const { cookie, response } = await bootstrap(topic);
      const resumed = await send(action(topic, "bootstrap", { bootstrap_intent: "cookie_resume" }), cookie);
      expect(resumed.status).toBe(200);
      expect(resumed.json.data.participation_id).toBe(response.json.data.participation_id);
      expect(resumed.json.data.revision).toBe(1);
      expect((await send(action(topic, "activity_start", { activity: "survey" }), cookie)).status).toBe(200);
      const survey = await send(action(topic, "survey_submit", { survey_version: `r2.1-${topic}`, answers: { q1: "none", q2: "other", q3: "none", q4: "no" } }), cookie);
      expect(survey.status, survey.json.error?.code).toBe(200);
      expect(survey.json.data.state).toEqual({ example: "not_started", survey: "completed", lead: "not_started" });
      expect((await send(action(topic, "activity_start", { activity: "example" }), cookie)).status).toBe(200);
      const finished = await send(action(topic, "example_complete"), cookie);
      expect(finished.status).toBe(200);
      expect(finished.json.data.state).toEqual({ example: "completed", survey: "completed", lead: "not_started" });
      expect((await send(action(topic, "menu_return", { from_activity: "example" }), cookie)).json.data.revision).toBe(finished.json.data.revision);
      expect(finished.text).not.toMatch(/email|digest|utm_|bootstrap_key|answers/);
    }
    expect(providerCalls).toBe(0);
    expect(rpcCalls).toBeGreaterThan(20);
  }, 30000);

  it("returns the real lead receipt without a second provider call and reapplies gate/generation on replay", async () => {
    const { cookie } = await bootstrap("recording");
    expect((await send(action("recording", "activity_start", { activity: "lead" }), cookie)).status).toBe(200);
    const body = action("recording", "lead_submit", { email: "preview@example.com", consent: true, consent_version: "mumeok-r2-beta-notice-20260911", purpose: "beta_open_notice", consent_generation: 1, turnstile_token: "mumeok_r2_recording" });
    const first = await send(body, cookie);
    expect(first.status, first.json.error?.code).toBe(200);
    expect(first.json.data.state).toEqual({ example: "not_started", survey: "not_started", lead: "completed" });
    expect(first.json.data.receipt).toEqual({ event_id: body.event_id, status: "received" });
    const replay: Record<string, unknown> = { ...body };
    delete replay.turnstile_token;
    const second = await send(replay, cookie);
    expect(second.status).toBe(200);
    expect(second.json.data).toEqual(first.json.data);
    expect(providerCalls).toBe(1);
    await setControl({ lead_enabled: false });
    expect((await send(replay, cookie)).json.error?.code).toBe("LEAD_CAPTURE_NOT_READY");
    await setControl({ lead_enabled: true, consent_generation: 2 });
    expect((await send(replay, cookie)).json.error?.code).toBe("CONSENT_REFRESH_REQUIRED");
    expect(providerCalls).toBe(1);
  }, 30000);

  it("reconciles a genuinely committed apply after its response is lost and releases only with matching event proof", async () => {
    const { cookie } = await bootstrap("recording");
    const body = action("recording", "activity_start", { activity: "example" });
    let lost = false;
    executeHook = async command => {
      const result = await executeRpc(command);
      if (command.op === "apply" && !lost && !result.error) { lost = true; throw new Error("Fixture discards a committed RPC response"); }
      return result;
    };
    expect((await send(body, cookie)).status).toBe(503);
    expect(lost).toBe(true);
    await expect(stat(`${config.controlPath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
    const retried = await send(body, cookie);
    expect(retried.status).toBe(200);
    expect(retried.json.data.revision).toBe(2);
    expect(retried.json.data.state.example).toBe("started");
  }, 30000);

  it("holds the real control lease when apply has no established outcome and blocks a writer", async () => {
    const { cookie } = await bootstrap("recording");
    executeHook = async command => { if (command.op === "apply") throw new Error("Fixture transport loses dispatch outcome"); return executeRpc(command); };
    expect((await send(action("recording", "activity_start", { activity: "example" }), cookie)).status).toBe(503);
    expect((await stat(`${config.controlPath}.lock`)).isDirectory()).toBe(true);
    await expect(storage.acquireControlLease()).rejects.toThrow();
    // This fixture never dispatched an apply; after its owned HTTPS collector closes,
    // afterEach removes only its own temporary files, not any external orphan lease.
  }, 30000);

  it("expires a valid signed expired cookie and never clears the other topic", async () => {
    const { cookie } = await bootstrap("recording");
    const claims = readRound2Cookie(cookie, "recording", config.secrets.cookie, Date.now() / 1000)!;
    const iat = Date.parse(CAMPAIGN_START) / 1000;
    const expired = serializeRound2Cookie({ ...claims, iat, exp: iat + 1 }, config.secrets.cookie, iat).split(";")[0];
    const response = await send(action("recording", "menu_return", { from_activity: "example" }), expired);
    expect(response.status).toBe(410);
    expect(response.json.error?.code).toBe("PARTICIPATION_EXPIRED");
    const cleared = response.headers["set-cookie"] as string[];
    expect(cleared[0]).toContain("Max-Age=0");
    expect(cleared[0]).not.toContain("homeflow");
  }, 30000);

  it("keeps exact HTTP error precedence while disabled or preview even with missing keys", async () => {
    config.enabled = false; config.secrets.page = "";
    const body = action("recording", "menu_return", { from_activity: "lead" });
    expect((await send(body, undefined, {}, "GET")).status).toBe(405);
    expect((await send(body, undefined, { origin: "https://example.com" })).status).toBe(403);
    expect((await send(body, undefined, { "content-type": "text/plain" })).status).toBe(415);
    expect((await send("x".repeat(8193))).status).toBe(413);
    expect((await send(body)).json.error?.code).toBe("ROUND2_DISABLED");
    config.enabled = true; config.localPreview = true;
    expect((await send(body)).json.error?.code).toBe("ROUND2_DISABLED");
    config.localPreview = false;
    expect((await send(body)).json.error?.code).toBe("ROUND2_UNAVAILABLE");
    expect(rpcCalls).toBe(0); expect(providerCalls).toBe(0);
  }, 30000);
});
