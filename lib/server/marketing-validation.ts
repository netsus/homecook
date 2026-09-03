import { ok, fail } from "@/lib/api/response";
import {
  buildQuizOutcome,
  classifyMarketingAttribution,
  isAllowedQuizAnswer,
  MARKETING_AD_VARIANTS,
  MARKETING_VALIDATION_ACTIONS,
  MARKETING_VALIDATION_AUDIENCE_KEY,
  MARKETING_VALIDATION_CAMPAIGN_KEY,
  MARKETING_VALIDATION_CONSENT_VERSION,
  MARKETING_VALIDATION_COOKIE,
  MARKETING_VALIDATION_COOKIE_PATH,
  MARKETING_VALIDATION_COOKIE_TTL_SECONDS,
  MARKETING_VALIDATION_CREATIVE_KEY,
  MARKETING_VALIDATION_MAX_BODY_BYTES,
  MARKETING_VALIDATION_MAX_UTM_LENGTH,
  MARKETING_VALIDATION_TURNSTILE_ACTION,
  normalizeAllowedOrigins,
  readMarketingValidationState,
  resolveMarketingAdVariant,
  validateMarketingTransition,
} from "@/lib/marketing/demand-validation";
import type { ApiErrorField } from "@/types/api";
import type {
  MarketingValidationAction,
  MarketingValidationAdVariant,
  MarketingValidationPersistenceClient,
  MarketingValidationQuizAnswers,
  MarketingValidationResponseData,
  MarketingValidationSessionRecord,
} from "@/types/marketing-validation";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN =
  /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu;

type ParsedBody =
  | {
      action: "view";
      honeypot: "";
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      utm_content: string | null;
      utm_term: string | null;
      ad_variant: MarketingValidationAdVariant;
    }
  | {
      action: "quiz_started" | "result_viewed" | "experience_started" | "experience_completed" | "beta_form_viewed";
      honeypot: "";
    }
  | {
      action: "quiz_completed";
      honeypot: "";
      answers: MarketingValidationQuizAnswers;
    }
  | {
      action: "lead_submitted";
      honeypot: "";
      email: string;
      consent: true;
      turnstile_token: string;
    }
  ;

type ParseBodyResult =
  | { ok: true; value: ParsedBody }
  | {
      ok: false;
      code: "VALIDATION_ERROR";
      fields: ApiErrorField[];
    };

type ParseQuizAnswersResult =
  | {
      ok: true;
      answers: MarketingValidationQuizAnswers;
    }
  | {
      ok: false;
      code: "VALIDATION_ERROR";
      fields: ApiErrorField[];
    };

type LeadGateResult =
  | {
      ok: true;
      allowedOrigins: string[];
      allowedHostnames: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

type TurnstileVerificationResult =
  | {
      ok: true;
      verified_at: string;
    }
  | {
      ok: false;
      code: "TURNSTILE_FAILED";
      message: string;
    };

interface PersistLeadPayload {
  consent_version: string;
  consented_at: string;
  email: string;
  lead_submitted_at: string;
  turnstile_verified_at: string;
}

type AdvancePayload =
  | { occurred_at: string }
  | { occurred_at: string; answers: MarketingValidationQuizAnswers }
  | { occurred_at: string; lead: PersistLeadPayload };

interface MarketingValidationHandlerDependencies {
  now?: () => Date;
  newSessionId?: () => string;
  allowedOrigins: readonly string[];
  paidAttributionOrigins?: readonly string[];
  readSession: (sessionId: string) => Promise<MarketingValidationSessionRecord | null>;
  insertViewSession: (
    input: Extract<ParsedBody, { action: "view" }> & {
      sessionId: string;
      viewed_at: string;
      request_origin: string;
      attribution_status: "paid_allowlisted" | "organic" | "unverified";
    },
  ) => Promise<MarketingValidationSessionRecord>;
  advanceSession: (
    sessionId: string,
    action: Exclude<MarketingValidationAction, "view">,
    payload?: AdvancePayload,
  ) => Promise<MarketingValidationSessionRecord>;
  markDuplicateLead: (
    sessionId: string,
    payload: PersistLeadPayload,
  ) => Promise<MarketingValidationSessionRecord>;
  marketingLeadGate: () => Promise<LeadGateResult>;
  verifyTurnstile: (
    token: string,
    allowedHostnames: readonly string[],
  ) => Promise<TurnstileVerificationResult>;
}

function validateOptionalUtm(field: string, value: unknown, fields: ApiErrorField[]) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    fields.push({ field, reason: "invalid_type" });
    return null;
  }
  const normalized = value.trim() || null;
  if (normalized && normalized.length > MARKETING_VALIDATION_MAX_UTM_LENGTH) {
    fields.push({ field, reason: "too_long" });
  }
  return normalized;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized && normalized.length <= 320 && EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
}

function isUuidV4(value: string) {
  return UUID_V4_PATTERN.test(value);
}

function buildValidationError(fields: ApiErrorField[]): ParseBodyResult {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields,
  };
}

function buildQuizValidationError(fields: ApiErrorField[]): ParseQuizAnswersResult {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields,
  };
}

function validateExactKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
  safeField = "body",
) {
  return Object.keys(body).some((key) => !allowedKeys.includes(key))
    ? [{ field: safeField, reason: "unexpected" }]
    : [];
}

function parseQuizAnswers(value: unknown): ParseQuizAnswersResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildQuizValidationError([{ field: "answers", reason: "required" }]);
  }

  const record = value as Record<string, unknown>;
  const fields: ApiErrorField[] = [];
  const answers: Record<string, string> = {};
  for (const key of ["q1", "q2", "q3", "q4"] as const) {
    if (typeof record[key] !== "string" || !isAllowedQuizAnswer(key, record[key])) {
      fields.push({ field: key, reason: "invalid_enum" });
      continue;
    }
    answers[key] = record[key];
  }
  if (Object.keys(record).some((key) => !["q1", "q2", "q3", "q4"].includes(key))) {
    fields.push({ field: "answers", reason: "unexpected" });
  }

  return fields.length > 0
    ? buildQuizValidationError(fields)
    : {
        ok: true as const,
        answers: answers as unknown as MarketingValidationQuizAnswers,
      };
}

export function parseMarketingValidationBody(
  body: unknown,
  options: { bodyBytes?: number } = {},
): ParseBodyResult {
  if (
    typeof options.bodyBytes === "number"
    && options.bodyBytes > MARKETING_VALIDATION_MAX_BODY_BYTES
  ) {
    return buildValidationError([{ field: "body", reason: "too_large" }]);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return buildValidationError([{ field: "body", reason: "invalid_json" }]);
  }

  const record = body as Record<string, unknown>;
  if (record.honeypot !== "") {
    return buildValidationError([{ field: "honeypot", reason: "must_be_empty" }]);
  }
  if (
    typeof record.action !== "string"
    || !MARKETING_VALIDATION_ACTIONS.includes(record.action as MarketingValidationAction)
  ) {
    return buildValidationError([{ field: "action", reason: "invalid_enum" }]);
  }

  const action = record.action as MarketingValidationAction;
  switch (action) {
    case "view": {
      const fields = validateExactKeys(record, [
        "action",
        "honeypot",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ad_variant",
      ]);
      const utm_source = validateOptionalUtm("utm_source", record.utm_source, fields);
      const utm_medium = validateOptionalUtm("utm_medium", record.utm_medium, fields);
      const utm_campaign = validateOptionalUtm("utm_campaign", record.utm_campaign, fields);
      const utm_content = validateOptionalUtm("utm_content", record.utm_content, fields);
      const utm_term = validateOptionalUtm("utm_term", record.utm_term, fields);
      const candidate = record.ad_variant === undefined || record.ad_variant === null
        ? null
        : record.ad_variant as MarketingValidationAdVariant;
      if (candidate !== null && !MARKETING_AD_VARIANTS.includes(candidate)) {
        fields.push({ field: "ad_variant", reason: "invalid_enum" });
      }
      if (fields.length > 0) return buildValidationError(fields);
      return {
        ok: true,
        value: {
          action,
          honeypot: "",
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term,
          ad_variant: resolveMarketingAdVariant(utm_content, candidate),
        },
      };
    }
    case "quiz_started":
    case "result_viewed":
    case "experience_started":
    case "experience_completed":
    case "beta_form_viewed": {
      const fields = validateExactKeys(record, ["action", "honeypot"]);
      return fields.length > 0
        ? buildValidationError(fields)
        : { ok: true, value: { action, honeypot: "" } };
    }
    case "quiz_completed": {
      const fields = validateExactKeys(record, ["action", "honeypot", "answers"]);
      if (fields.length > 0) return buildValidationError(fields);
      const parsedAnswers = parseQuizAnswers(record.answers);
      if (!parsedAnswers.ok) {
        return parsedAnswers;
      }
      return {
        ok: true,
        value: {
          action,
          honeypot: "",
          answers: parsedAnswers.answers,
        },
      };
    }
    case "lead_submitted": {
      const fields = validateExactKeys(record, [
        "action",
        "honeypot",
        "email",
        "consent",
        "turnstile_token",
      ]);
      const normalizedEmail = normalizeEmail(record.email);
      if (!normalizedEmail) fields.push({ field: "email", reason: "invalid_email" });
      if (record.consent !== true) fields.push({ field: "consent", reason: "required_true" });
      if (typeof record.turnstile_token !== "string" || !record.turnstile_token.trim()) {
        fields.push({ field: "turnstile_token", reason: "required" });
      }
      if (fields.length > 0) {
        return buildValidationError(fields);
      }
      return {
        ok: true,
        value: {
          action,
          honeypot: "",
          email: normalizedEmail!,
          consent: true,
          turnstile_token: (record.turnstile_token as string).trim(),
        },
      };
    }
  }
}

function readEnvValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function parseHostnames(raw: string) {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("MARKETING_TURNSTILE_ALLOWED_HOSTNAMES 형식이 올바르지 않아요.");
  }

  const unique = new Set<string>();
  for (const value of values) {
    if (!/^[a-z0-9.-]+$/u.test(value) || value.endsWith(".")) {
      throw new Error("MARKETING_TURNSTILE_ALLOWED_HOSTNAMES 형식이 올바르지 않아요.");
    }
    unique.add(value);
  }
  return [...unique].sort();
}

function readPaidAttributionOriginsFromEnv(allowedOrigins: readonly string[]) {
  const raw = process.env.MARKETING_PAID_ATTRIBUTION_ORIGINS?.trim();
  if (!raw) {
    return [] as string[];
  }
  const paidOrigins = normalizeAllowedOrigins(raw);
  for (const origin of paidOrigins) {
    if (!allowedOrigins.includes(origin)) {
      throw new Error("MARKETING_PAID_ATTRIBUTION_ORIGINS는 ALLOWED_MARKETING_ORIGINS 부분집합이어야 해요.");
    }
  }
  return paidOrigins;
}

function readAllowedOriginsFromEnv() {
  const raw = readEnvValue("ALLOWED_MARKETING_ORIGINS");
  if (!raw) {
    throw new Error("ALLOWED_MARKETING_ORIGINS 환경 변수가 필요해요.");
  }
  return normalizeAllowedOrigins(raw);
}

function computeRetentionUntilIso() {
  const raw = readEnvValue("MARKETING_CAMPAIGN_END_AT");
  if (!raw) {
    const error = new Error("MARKETING_CAMPAIGN_END_AT 환경 변수가 필요해요.");
    (error as Error & { code: string }).code = "MARKETING_RETENTION_NOT_READY";
    throw error;
  }
  const campaignEndAt = new Date(raw);
  if (Number.isNaN(campaignEndAt.getTime())) {
    const error = new Error("MARKETING_CAMPAIGN_END_AT 형식이 올바르지 않아요.");
    (error as Error & { code: string }).code = "MARKETING_RETENTION_NOT_READY";
    throw error;
  }
  campaignEndAt.setUTCDate(campaignEndAt.getUTCDate() + 180);
  return campaignEndAt.toISOString();
}

export function createMarketingLeadGateFromEnv() {
  return async (): Promise<LeadGateResult> => {
    if (process.env.MARKETING_LEAD_PROTECTION_READY !== "1") {
      return {
        ok: false,
        code: "LEAD_CAPTURE_NOT_READY",
        message: "베타 신청은 아직 열리지 않았어요.",
      };
    }

    const secret = readEnvValue(
      "MARKETING_TURNSTILE_SECRET",
      "TURNSTILE_SECRET_KEY",
      "CLOUDFLARE_TURNSTILE_SECRET_KEY",
    );
    const rawHostnames = readEnvValue("MARKETING_TURNSTILE_ALLOWED_HOSTNAMES");
    const edgeEvidence = readEnvValue(
      "MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE",
      "MARKETING_EDGE_RULE_EVIDENCE",
    );
    if (!secret || !rawHostnames || !edgeEvidence) {
      return {
        ok: false,
        code: "LEAD_CAPTURE_NOT_READY",
        message: "베타 신청은 아직 열리지 않았어요.",
      };
    }

    try {
      return {
        ok: true,
        allowedOrigins: readAllowedOriginsFromEnv(),
        allowedHostnames: parseHostnames(rawHostnames),
      };
    } catch {
      return {
        ok: false,
        code: "LEAD_CAPTURE_NOT_READY",
        message: "베타 신청은 아직 열리지 않았어요.",
      };
    }
  };
}

export function createTurnstileVerifierFromEnv() {
  return async (
    token: string,
    allowedHostnames: readonly string[],
  ): Promise<TurnstileVerificationResult> => {
    const secret = readEnvValue(
      "MARKETING_TURNSTILE_SECRET",
      "TURNSTILE_SECRET_KEY",
      "CLOUDFLARE_TURNSTILE_SECRET_KEY",
    );
    if (!secret) {
      return {
        ok: false,
        code: "TURNSTILE_FAILED",
        message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
      };
    }

    try {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            secret,
            response: token,
          }),
        },
      );
      if (!response.ok) {
        return {
          ok: false,
          code: "TURNSTILE_FAILED",
          message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
        };
      }
      const data = await response.json() as {
        success?: boolean;
        hostname?: string;
        action?: string;
        challenge_ts?: string;
      };
      if (
        data.success !== true
        || typeof data.hostname !== "string"
        || !allowedHostnames.includes(data.hostname)
        || data.action !== MARKETING_VALIDATION_TURNSTILE_ACTION
      ) {
        return {
          ok: false,
          code: "TURNSTILE_FAILED",
          message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
        };
      }

      return {
        ok: true,
        verified_at: typeof data.challenge_ts === "string"
          ? new Date(data.challenge_ts).toISOString()
          : new Date().toISOString(),
      };
    } catch {
      return {
        ok: false,
        code: "TURNSTILE_FAILED",
        message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
      };
    }
  };
}

function toErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }
  const candidate = error as Record<string, unknown>;
  return ["code", "message", "details", "hint"]
    .map((key) => candidate[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function buildSetCookie(sessionId: string, requestUrl: string, now: Date) {
  const secure = new URL(requestUrl).protocol === "https:";
  const expiresAt = new Date(
    now.getTime() + MARKETING_VALIDATION_COOKIE_TTL_SECONDS * 1000,
  ).toUTCString();
  return [
    `${MARKETING_VALIDATION_COOKIE}=${sessionId}`,
    `Path=${MARKETING_VALIDATION_COOKIE_PATH}`,
    `Expires=${expiresAt}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function readCookieSessionId(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === MARKETING_VALIDATION_COOKIE) {
      const value = rest.join("=").trim();
      return isUuidV4(value) ? value : null;
    }
  }
  return null;
}

async function parseRequestBody(request: Request) {
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return buildValidationError([{ field: "body", reason: "invalid_json" }]);
  }

  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return buildValidationError([{ field: "body", reason: "invalid_json" }]);
  }

  return parseMarketingValidationBody(body, {
    bodyBytes: Buffer.byteLength(raw, "utf8"),
  });
}

function buildSuccessData(
  action: MarketingValidationAction,
  session: MarketingValidationSessionRecord,
): MarketingValidationResponseData {
  const data: MarketingValidationResponseData = {
    stage: action,
    state: readMarketingValidationState(session),
  };
  if (action === "quiz_completed") {
    data.quiz_result = session.quiz_result as MarketingValidationResponseData["quiz_result"];
    data.target_qualified = null;
  }
  return data;
}

function buildPersistLeadPayload(email: string, submittedAt: string, verifiedAt: string): PersistLeadPayload {
  return {
    consent_version: MARKETING_VALIDATION_CONSENT_VERSION,
    consented_at: submittedAt,
    email,
    lead_submitted_at: submittedAt,
    turnstile_verified_at: verifiedAt,
  };
}

function failureResponseForError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "MARKETING_RETENTION_NOT_READY") {
    return fail(
      "LEAD_CAPTURE_UNAVAILABLE",
      "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  return fail(
    "LEAD_CAPTURE_UNAVAILABLE",
    "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
    503,
  );
}

export function createMarketingValidationSupabaseAdapter(
  client: MarketingValidationPersistenceClient,
): Pick<
  MarketingValidationHandlerDependencies,
  "readSession" | "insertViewSession" | "advanceSession" | "markDuplicateLead"
> {
  const table = () => client.from("marketing_validation_sessions");

  const readSession = async (sessionId: string) => {
    const result = await table()
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (result.error) {
      throw new Error(toErrorMessage(result.error));
    }
    return result.data;
  };

  const insertViewSession: MarketingValidationHandlerDependencies["insertViewSession"] = async ({
    sessionId,
    viewed_at,
    request_origin,
    attribution_status,
    utm_campaign,
    utm_content,
    utm_medium,
    utm_source,
    utm_term,
    ad_variant,
  }) => {
    void request_origin;
    const result = await table()
      .insert({
        id: sessionId,
        campaign_key: MARKETING_VALIDATION_CAMPAIGN_KEY,
        creative_key: MARKETING_VALIDATION_CREATIVE_KEY,
        audience_key: MARKETING_VALIDATION_AUDIENCE_KEY,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        ad_variant,
        attribution_status,
        viewed_at,
        target_qualified: null,
        lead_submission_status: "none",
        retention_until: computeRetentionUntilIso(),
      })
      .select("*")
      .single();
    if (result.error || !result.data) {
      throw new Error(toErrorMessage(result.error));
    }
    return result.data;
  };

  const updateStage = async (
    sessionId: string,
    guardColumn: keyof MarketingValidationSessionRecord,
    patch: Record<string, unknown>,
  ) => {
    const result = await table()
      .update(patch)
      .eq("id", sessionId)
      .is(String(guardColumn), null)
      .select("*")
      .maybeSingle();
    if (result.error) {
      const detail = toErrorMessage(result.error);
      if (/23505|marketing_validation_sessions_email_unique_idx/iu.test(detail)) {
        const duplicateError = new Error(detail);
        (duplicateError as Error & { code: string }).code =
          "MARKETING_EMAIL_DUPLICATE";
        throw duplicateError;
      }
      throw new Error(detail);
    }
    if (result.data) {
      return result.data;
    }
    const current = await readSession(sessionId);
    if (!current) {
      throw new Error("marketing validation session missing");
    }
    return current;
  };

  const advanceSession: MarketingValidationHandlerDependencies["advanceSession"] = async (
    sessionId,
    action,
    payload,
  ) => {
    switch (action) {
      case "quiz_started":
        return updateStage(sessionId, "quiz_started_at", {
          quiz_started_at: payload?.occurred_at,
          updated_at: payload?.occurred_at,
        });
      case "quiz_completed": {
        const answers = (payload as { answers: MarketingValidationQuizAnswers }).answers;
        const outcome = buildQuizOutcome(answers);
        return updateStage(sessionId, "quiz_completed_at", {
          quiz_completed_at: payload?.occurred_at,
          quiz_answers: answers,
          quiz_result: outcome.quiz_result,
          target_qualified: null,
          updated_at: payload?.occurred_at,
        });
      }
      case "result_viewed":
        return updateStage(sessionId, "result_viewed_at", {
          result_viewed_at: payload?.occurred_at,
          updated_at: payload?.occurred_at,
        });
      case "experience_started":
        return updateStage(sessionId, "experience_started_at", {
          experience_started_at: payload?.occurred_at,
          updated_at: payload?.occurred_at,
        });
      case "experience_completed":
        return updateStage(sessionId, "experience_completed_at", {
          experience_completed_at: payload?.occurred_at,
          updated_at: payload?.occurred_at,
        });
      case "beta_form_viewed":
        return updateStage(sessionId, "beta_form_viewed_at", {
          beta_form_viewed_at: payload?.occurred_at,
          updated_at: payload?.occurred_at,
        });
      case "lead_submitted":
        return updateStage(sessionId, "lead_submitted_at", {
          lead_submitted_at: (payload as { lead: PersistLeadPayload }).lead.lead_submitted_at,
          lead_submission_status: "accepted",
          email: (payload as { lead: PersistLeadPayload }).lead.email,
          consent_version: (payload as { lead: PersistLeadPayload }).lead.consent_version,
          consented_at: (payload as { lead: PersistLeadPayload }).lead.consented_at,
          turnstile_verified_at: (payload as { lead: PersistLeadPayload }).lead.turnstile_verified_at,
          updated_at: (payload as { lead: PersistLeadPayload }).lead.lead_submitted_at,
        });
    }
  };

  const markDuplicateLead: MarketingValidationHandlerDependencies["markDuplicateLead"] = async (
    sessionId,
    payload,
  ) => {
    return updateStage(sessionId, "lead_submitted_at", {
      lead_submitted_at: payload.lead_submitted_at,
      lead_submission_status: "duplicate",
      email: null,
      consent_version: payload.consent_version,
      consented_at: payload.consented_at,
      turnstile_verified_at: payload.turnstile_verified_at,
      updated_at: payload.lead_submitted_at,
    });
  };

  return {
    readSession,
    insertViewSession,
    advanceSession,
    markDuplicateLead,
  };
}

export function createMarketingValidationHandler(
  dependencies: MarketingValidationHandlerDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const newSessionId = dependencies.newSessionId ?? (() => crypto.randomUUID());
  const paidAttributionOrigins = dependencies.paidAttributionOrigins ?? [];

  return async function handleMarketingValidation(request: Request) {
    const allowedOrigins = dependencies.allowedOrigins;
    const requestOrigin = request.headers.get("origin");
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return fail("ORIGIN_NOT_ALLOWED", "허용되지 않은 접근이에요.", 403);
    }

    const parsedBody = await parseRequestBody(request);
    if (!parsedBody.ok) {
      return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsedBody.fields);
    }

    const { value } = parsedBody;
    const requestNow = now();

    try {
      if (value.action === "view") {
        const existingSessionId = readCookieSessionId(request);
        if (existingSessionId) {
          const existingSession = await dependencies.readSession(existingSessionId);
          if (existingSession?.creative_key === MARKETING_VALIDATION_CREATIVE_KEY) {
            return ok(buildSuccessData("view", existingSession));
          }
        }

        const sessionId = newSessionId();
        if (!isUuidV4(sessionId)) {
          return failureResponseForError(new Error("invalid session id"));
        }
        const inserted = await dependencies.insertViewSession({
          ...value,
          attribution_status: classifyMarketingAttribution(
            value,
            requestOrigin,
            paidAttributionOrigins,
          ),
          request_origin: requestOrigin,
          sessionId,
          viewed_at: requestNow.toISOString(),
        });
        const response = ok(buildSuccessData("view", inserted));
        response.headers.set(
          "set-cookie",
          buildSetCookie(sessionId, request.url, requestNow),
        );
        return response;
      }

      const sessionId = readCookieSessionId(request);
      if (!sessionId) {
        return fail("VALIDATION_ERROR", "세션을 다시 시작해 주세요.", 422, [
          { field: "session", reason: "required" },
        ]);
      }

      const session = await dependencies.readSession(sessionId);
      if (!session) {
        return fail("INVALID_TRANSITION", "세션을 다시 시작해 주세요.", 409);
      }
      if (session.creative_key !== MARKETING_VALIDATION_CREATIVE_KEY) {
        return fail("INVALID_TRANSITION", "세션을 다시 시작해 주세요.", 409);
      }

      if (value.action === "lead_submitted" && session.lead_submitted_at) {
        return ok(buildSuccessData("lead_submitted", session));
      }

      const transition = validateMarketingTransition(session, value.action);
      if (!transition.ok) {
        return fail("INVALID_TRANSITION", "순서를 다시 확인해 주세요.", 409);
      }
      if (transition.mode === "replay") {
        return ok(buildSuccessData(value.action, session));
      }

      const occurredAt = requestNow.toISOString();
      switch (value.action) {
        case "quiz_started":
        case "result_viewed":
        case "experience_started":
        case "experience_completed":
        case "beta_form_viewed":
          return ok(buildSuccessData(
            value.action,
            await dependencies.advanceSession(sessionId, value.action, {
              occurred_at: occurredAt,
            }),
          ));
        case "quiz_completed":
          return ok(buildSuccessData(
            value.action,
            await dependencies.advanceSession(sessionId, value.action, {
              occurred_at: occurredAt,
              answers: value.answers,
            }),
          ));
        case "lead_submitted": {
          const gate = await dependencies.marketingLeadGate();
          if (!gate.ok) {
            return fail(gate.code, gate.message, 503);
          }
          if (!gate.allowedOrigins.includes(requestOrigin)) {
            return fail("ORIGIN_NOT_ALLOWED", "허용되지 않은 접근이에요.", 403);
          }
          const verification = await dependencies.verifyTurnstile(
            value.turnstile_token,
            gate.allowedHostnames,
          );
          if (!verification.ok) {
            return fail(verification.code, verification.message, 422);
          }
          const lead = buildPersistLeadPayload(
            value.email,
            occurredAt,
            verification.verified_at,
          );
          try {
            const updated = await dependencies.advanceSession(sessionId, "lead_submitted", {
              occurred_at: occurredAt,
              lead,
            });
            return ok(buildSuccessData("lead_submitted", updated));
          } catch (error) {
            if ((error as { code?: string })?.code === "MARKETING_EMAIL_DUPLICATE") {
              const updated = await dependencies.markDuplicateLead(sessionId, lead);
              return ok(buildSuccessData("lead_submitted", updated));
            }
            throw error;
          }
        }
      }
    } catch (error) {
      return failureResponseForError(error);
    }

    return failureResponseForError(new Error("unreachable"));
  };
}

export function createConfiguredMarketingValidationHandler(
  client: MarketingValidationPersistenceClient,
  allowedOrigins: readonly string[],
  paidAttributionOrigins: readonly string[] = [],
) {
  const persistence = createMarketingValidationSupabaseAdapter(client);
  return createMarketingValidationHandler({
    advanceSession: persistence.advanceSession,
    allowedOrigins,
    insertViewSession: persistence.insertViewSession,
    marketingLeadGate: createMarketingLeadGateFromEnv(),
    markDuplicateLead: persistence.markDuplicateLead,
    paidAttributionOrigins,
    verifyTurnstile: createTurnstileVerifierFromEnv(),
    readSession: persistence.readSession,
  });
}

export {
  buildQuizOutcome,
  normalizeAllowedOrigins,
  validateMarketingTransition,
};

export function readMarketingValidationAllowedOriginsFromEnv() {
  return readAllowedOriginsFromEnv();
}

export function readMarketingPaidAttributionOriginsFromEnv(
  allowedOrigins: readonly string[],
) {
  return readPaidAttributionOriginsFromEnv(allowedOrigins);
}

export type {
  MarketingValidationHandlerDependencies,
};
