import { CAMPAIGN_END, CAMPAIGN_START, RETENTION_UNTIL, ROUND2_ERRORS, ROUND2_UUID_PATTERN, Round2Error, canonicalRound2Json, parseRound2Request, readRound2Body, type Round2ErrorCode, type Round2Request, type Round2SuccessData, type Round2Topic } from "@/lib/marketing-round2";
import { readRound2Cookie, expireRound2Cookie, round2BootstrapDigest, round2Hmac, serializeRound2Cookie, verifyRound2PageContext, type Round2CookieClaims } from "@/lib/server/marketing-round2-context";
import type { MarketingRound2InternalClient, Round2Applied, Round2Command, Round2ControlSnapshot, Round2Inspection, Round2RpcResult } from "@/types/marketing-round2";

export type Round2HandlerConfig = {
  enabled: boolean; leadsEnabled: boolean; localPreview: boolean; origin: string;
  hostname: "app.mumeok.kr" | "localhost";
  secrets: Record<"page" | "cookie" | "bootstrap" | "event" | "email" | "receipt" | "rate", string>;
};
type Control = { version: 1; collection_enabled: boolean; lead_enabled: boolean; consent_generation: number };
type RateInput = { ip: string; participationId?: string; buckets: ("ip" | "bootstrap" | "participation" | "lead_ip" | "lead_participation")[] };
export type Round2HandlerDependencies = {
  config: Round2HandlerConfig;
  now?: () => number;
  readControl: () => Promise<Control>;
  consumeRate: (input: RateInput) => Promise<void>;
  trustedIp: (request: Request) => Promise<string>;
  leadReadiness: () => Promise<void>;
  acquireControlLease: () => Promise<{ readControl(): Promise<Control>; release(): Promise<void> }>;
  execute: MarketingRound2InternalClient["execute"];
  verifyTurnstile: (token: string, event: string, topic: Round2Topic) => Promise<string>;
};

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string { return typeof value === "string" && ROUND2_UUID_PATTERN.test(value); }
function utc(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value)); }
function validateData(value: unknown, command: Round2Command): asserts value is Round2SuccessData {
  if (!exact(value, ["round_version", "topic", "participation_id", "event_id", "revision", "consent_generation", "state", "receipt", "participation_expires_at", "retention_until"]) ||
    value.round_version !== "r2.1" || value.topic !== command.topic || !uuid(value.participation_id) || value.event_id !== command.event_id ||
    (command.participation_id !== null && value.participation_id !== command.participation_id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    value.consent_generation !== command.control.consent_generation || !utc(value.participation_expires_at) || value.retention_until !== RETENTION_UNTIL ||
    !exact(value.state, ["example", "survey", "lead"]) || !Object.values(value.state).every(state => typeof state === "string" && ["not_started", "started", "completed"].includes(state)) ||
    (value.state.lead === "completed" ? !exact(value.receipt, ["event_id", "status"]) || !uuid(value.receipt.event_id) || value.receipt.status !== "received" : value.receipt !== null)) {
    throw new Round2Error("ROUND2_UNAVAILABLE");
  }
}
function validateInspection(value: unknown, command: Round2Command): Round2Inspection {
  if (!exact(value, ["kind", "data", "bootstrap", "replay", "needs_turnstile"]) || value.kind !== "inspected" ||
    !["absent", "same"].includes(String(value.replay)) || typeof value.needs_turnstile !== "boolean") throw new Round2Error("ROUND2_UNAVAILABLE");
  if (value.data !== null) validateData(value.data, command);
  if (value.bootstrap !== null && (!exact(value.bootstrap, ["participation_id", "created_at", "expires_at", "first_attribution"]) || !uuid(value.bootstrap.participation_id) ||
    !utc(value.bootstrap.created_at) || !utc(value.bootstrap.expires_at) || !exact(value.bootstrap.first_attribution, ["first_channel", "utm_source", "utm_medium", "utm_campaign", "utm_content"]))) throw new Round2Error("ROUND2_UNAVAILABLE");
  if ((value.data === null) !== (value.bootstrap === null) || (value.data === null && (command.action !== "bootstrap" || command.bootstrap_intent !== "create_or_resume" || command.participation_id !== null || value.replay !== "absent")) ||
    (value.needs_turnstile && command.action !== "lead_submit")) throw new Round2Error("ROUND2_UNAVAILABLE");
  return value as Round2Inspection;
}
function validateApplied(value: unknown, command: Round2Command): Round2Applied {
  if (!exact(value, ["kind", "data", "cookie_claims"]) || value.kind !== "applied") throw new Round2Error("ROUND2_UNAVAILABLE");
  validateData(value.data, command);
  const claims = value.cookie_claims;
  if (command.action === "bootstrap") {
    if (!exact(claims, ["v", "pid", "topic", "round_version", "iat", "exp"]) || claims.v !== 1 || claims.pid !== value.data.participation_id || claims.topic !== command.topic || claims.round_version !== "r2.1" ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || Number(claims.iat) >= Number(claims.exp) || Number(claims.exp) * 1000 !== Date.parse(value.data.participation_expires_at)) throw new Round2Error("ROUND2_UNAVAILABLE");
  } else if (claims !== null) throw new Round2Error("ROUND2_UNAVAILABLE");
  return value as Round2Applied;
}
function rpcError(result: Round2RpcResult, lead: boolean): Round2Error {
  const code = result.error?.message as Round2ErrorCode;
  if (Object.hasOwn(ROUND2_ERRORS, code) && result.error?.code === `PT${ROUND2_ERRORS[code][0]}` && [409, 410, 422, 503].includes(ROUND2_ERRORS[code][0])) return new Round2Error(code);
  return new Round2Error(lead ? "LEAD_CAPTURE_UNAVAILABLE" : "ROUND2_UNAVAILABLE");
}
function knownRollback(result: Round2RpcResult): boolean {
  return result.status >= 400 && result.status < 600 && !!result.error && /^[A-Z0-9]{5}$/.test(result.error.code ?? "");
}
function controlSnapshot(control: Control, config: Round2HandlerConfig, value: Round2Request, time: number): Round2ControlSnapshot {
  if (!config.enabled || !control.collection_enabled) throw new Round2Error("ROUND2_DISABLED");
  if (time < Date.parse(CAMPAIGN_START) || time >= Date.parse(CAMPAIGN_END)) throw new Round2Error("CAMPAIGN_ENDED");
  if (value.action === "lead_submit") {
    if (!config.leadsEnabled || !control.lead_enabled) throw new Round2Error("LEAD_CAPTURE_NOT_READY");
    if (value.consent_generation !== control.consent_generation) throw new Round2Error("CONSENT_REFRESH_REQUIRED");
  }
  return { collection_enabled: true, lead_enabled: config.leadsEnabled && control.lead_enabled, consent_generation: control.consent_generation,
    checked_at: new Date(time).toISOString(), valid_until: new Date(Math.min(time + 10_000, Date.parse(CAMPAIGN_END))).toISOString() };
}
function buildCommand(value: Round2Request, cookie: Round2CookieClaims | null, config: Round2HandlerConfig, control: Round2ControlSnapshot, time: number): Round2Command {
  const activity = value.action === "activity_start" ? value.activity : value.action === "example_complete" ? "example" : value.action === "survey_submit" ? "survey" : value.action === "lead_submit" ? "lead" : "menu";
  let payload: Record<string, unknown> = {};
  if (value.action === "bootstrap" && value.bootstrap_intent !== "cookie_resume") {
    const context = verifyRound2PageContext(value.page_context, value.topic, config.secrets.page, Math.floor(time / 1000));
    payload = { first_channel: context.first_channel, utm_source: context.utm_source, utm_medium: context.utm_medium, utm_campaign: context.utm_campaign, utm_content: context.utm_content };
  } else if (value.action === "survey_submit") payload = { survey_version: value.survey_version, answers: value.answers };
  else if (value.action === "menu_return") payload = { from_activity: value.from_activity };
  const command: Round2Command = { op: "inspect", action: value.action, event_id: value.event_id, topic: value.topic, round_version: value.round_version,
    participation_id: cookie?.pid ?? null, bootstrap_intent: value.action === "bootstrap" ? value.bootstrap_intent : null,
    bootstrap_digest: value.action === "bootstrap" && value.bootstrap_intent !== "cookie_resume" ? round2BootstrapDigest(config.secrets.bootstrap, value.topic, value.bootstrap_key) : null,
    activity, payload, payload_digest: null, lead: null, control };
  if (value.action === "lead_submit") command.lead = { email_normalized: value.email, email_key: round2Hmac(config.secrets.email, value.email),
    request_digest: round2Hmac(config.secrets.receipt, canonicalRound2Json({ action: value.action, topic: value.topic, round_version: value.round_version, email: value.email, consent: true, consent_version: value.consent_version, purpose: value.purpose, consent_generation: value.consent_generation })),
    consent_version: value.consent_version, purpose: value.purpose, consent_generation: value.consent_generation, turnstile_verified_at: null };
  if (!(value.action === "bootstrap" && value.bootstrap_intent === "cookie_resume")) command.payload_digest = eventDigest(command, config);
  return command;
}
function eventDigest(command: Round2Command, config: Round2HandlerConfig) {
  return round2Hmac(config.secrets.event, canonicalRound2Json({ action: command.action, topic: command.topic, round_version: command.round_version, activity: command.activity, payload: command.payload }));
}
export function round2Failure(error: unknown, lead = false): Response {
  const safe = error instanceof Round2Error ? error : new Round2Error(lead ? "LEAD_CAPTURE_UNAVAILABLE" : "ROUND2_UNAVAILABLE");
  const headers = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer" });
  if (safe.code === "METHOD_NOT_ALLOWED") headers.set("allow", "POST");
  if (safe.retryAfter) headers.set("retry-after", String(safe.retryAfter));
  return Response.json({ success: false, data: null, error: { code: safe.code, message: safe.message, fields: safe.fields } }, { status: safe.status, headers });
}
export function createMarketingRound2Handler(dependencies: Round2HandlerDependencies) {
  const now = dependencies.now ?? Date.now;
  const config = dependencies.config;
  return async (request: Request): Promise<Response> => {
    let topic: Round2Topic | undefined;
    let lead = false;
    try {
      if (request.method !== "POST") throw new Round2Error("METHOD_NOT_ALLOWED");
      if (request.headers.get("origin") !== config.origin || request.headers.get("host") !== new URL(config.origin).host
        || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) throw new Round2Error("ORIGIN_NOT_ALLOWED");
      const raw = await readRound2Body(request);
      if (!config.enabled || config.localPreview) throw new Round2Error("ROUND2_DISABLED");
      const control = await dependencies.readControl();
      if (!control.collection_enabled) throw new Round2Error("ROUND2_DISABLED");
      if (now() < Date.parse(CAMPAIGN_START) || now() >= Date.parse(CAMPAIGN_END)) throw new Round2Error("CAMPAIGN_ENDED");
      const ip = await dependencies.trustedIp(request);
      await dependencies.consumeRate({ ip, buckets: ["ip"] });
      const value = parseRound2Request(raw);
      topic = value.topic;
      lead = value.action === "lead_submit";
      if (value.action === "bootstrap") await dependencies.consumeRate({ ip, buckets: ["bootstrap"] });
      const cookie = readRound2Cookie(request.headers.get("cookie") ?? "", topic, config.secrets.cookie, Math.floor(now() / 1000));
      if (!cookie && (value.action !== "bootstrap" || value.bootstrap_intent === "cookie_resume")) throw new Round2Error("PARTICIPATION_REQUIRED");
      if (cookie) await dependencies.consumeRate({ ip, participationId: cookie.pid, buckets: ["participation"] });
      if (lead) {
        let gateError: unknown;
        try { controlSnapshot(control, config, value, now()); await dependencies.leadReadiness(); } catch (error) { gateError = error; }
        await dependencies.consumeRate({ ip, participationId: cookie!.pid, buckets: ["lead_ip", "lead_participation"] });
        if (gateError) throw gateError;
      }
      const command = buildCommand(value, cookie, config, controlSnapshot(control, config, value, now()), now());
      const result = await dependencies.execute(structuredClone(command));
      if (result.error || result.status !== 200) throw rpcError(result, lead);
      const inspection = validateInspection(result.data, command);
      if (!cookie && inspection.data) await dependencies.consumeRate({ ip, participationId: inspection.data.participation_id, buckets: ["participation"] });
      if (value.action === "bootstrap" && value.bootstrap_intent === "cookie_resume") {
        if (!inspection.bootstrap) throw new Round2Error("PARTICIPATION_EXPIRED");
        command.payload = { ...inspection.bootstrap.first_attribution };
        command.payload_digest = eventDigest(command, config);
      }
      if (value.action === "lead_submit" && inspection.needs_turnstile) {
        if (!value.turnstile_token) throw new Round2Error("VALIDATION_ERROR", ["turnstile_token"]);
        command.lead!.turnstile_verified_at = await dependencies.verifyTurnstile(value.turnstile_token, value.event_id, topic);
      }
      const lease = await dependencies.acquireControlLease();
      let dispatched = false;
      let definitive = false;
      try {
        const fresh = await lease.readControl();
        if (lead) await dependencies.leadReadiness();
        command.control = controlSnapshot(fresh, config, value, now());
        command.op = "apply";
        dispatched = true;
        const appliedResult = await dependencies.execute(command);
        if (appliedResult.error || appliedResult.status !== 200) { definitive = knownRollback(appliedResult); throw rpcError(appliedResult, lead); }
        const applied = validateApplied(appliedResult.data, command);
        if (applied.cookie_claims) {
          try { readRound2Cookie(serializeRound2Cookie(applied.cookie_claims, config.secrets.cookie, Math.floor(now() / 1000)).split(";")[0], topic, config.secrets.cookie, Math.floor(now() / 1000)); }
          catch { throw new Round2Error("ROUND2_UNAVAILABLE"); }
        }
        definitive = true;
        const response = Response.json({ success: true, data: applied.data, error: null }, { headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
        if (applied.cookie_claims) response.headers.set("set-cookie", serializeRound2Cookie(applied.cookie_claims, config.secrets.cookie, Math.floor(now() / 1000)));
        return response;
      } catch (error) {
        if (dispatched && !definitive) {
          try {
            const recovery = { ...command, op: "inspect" as const, control: controlSnapshot(await lease.readControl(), config, value, now()), lead: command.lead ? { ...command.lead, turnstile_verified_at: null } : null };
            const proof = await dependencies.execute(recovery);
            if (!proof.error && proof.status === 200 && validateInspection(proof.data, recovery).replay === "same") definitive = true;
          } catch { /* An absent event or unreadable result is not rollback evidence. Keep the lease. */ }
        }
        throw error;
      } finally {
        if (!dispatched || definitive) await lease.release();
      }
    } catch (error) {
      const response = round2Failure(error, lead);
      if (topic && error instanceof Round2Error && error.code === "PARTICIPATION_EXPIRED") response.headers.set("set-cookie", expireRound2Cookie(topic));
      return response;
    }
  };
}
