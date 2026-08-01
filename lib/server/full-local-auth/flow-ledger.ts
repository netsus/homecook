import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_FLOW_COOKIE_NAME = "__Host-homecook-auth-flow";
export const AUTH_FLOW_TTL_SECONDS = 900;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const PROVIDERS = new Set(["google", "kakao", "custom:naver"] as const);
const FLOW_KINDS = new Set(["login", "link"] as const);
const AUTHORITIES = new Set(["remote", "local"] as const);
const TERMINAL_REASONS = new Set([
  "success",
  "error",
  "cancelled",
  "expired",
  "cutover_rejected",
] as const);

export type AuthFlowProvider = "google" | "kakao" | "custom:naver";
export type AuthFlowKind = "login" | "link";
export type AuthAuthority = "remote" | "local";
export type AuthFlowTerminalReason =
  | "success"
  | "error"
  | "cancelled"
  | "expired"
  | "cutover_rejected";

interface AuthFlowCookiePayload {
  v: 1;
  n: string;
  f: AuthFlowKind;
  a: AuthAuthority;
  e: number;
  x: number;
}

interface AuthFlowRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data?: unknown; error?: unknown }>;
}

export interface AuthFlowLedgerAttempt {
  provider: AuthFlowProvider;
  flow_kind: AuthFlowKind;
  authority: AuthAuthority;
  cutover_epoch: number;
  expires_at: string;
  terminal_at: string | null;
  terminal_reason: AuthFlowTerminalReason | null;
}

export interface AuthFlowOutstandingResult {
  expiredCount: number;
  outstandingCount: number;
}

function requireHmacSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Auth flow HMAC secret은 32 bytes 이상이어야 해요.");
  }
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function attemptHash(nonce: string, secret: string) {
  return hmac(`homecook-auth-flow-attempt:v1:${nonce}`, secret);
}

function encodePayload(payload: AuthFlowCookiePayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function decodePayload(value: string): AuthFlowCookiePayload | null {
  try {
    const candidate = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AuthFlowCookiePayload>;
    if (
      candidate.v !== 1
      || typeof candidate.n !== "string"
      || candidate.n.length < 32
      || !FLOW_KINDS.has(candidate.f as AuthFlowKind)
      || !AUTHORITIES.has(candidate.a as AuthAuthority)
      || !isPositiveSafeInteger(candidate.e)
      || !isPositiveSafeInteger(candidate.x)
    ) {
      return null;
    }
    return candidate as AuthFlowCookiePayload;
  } catch {
    return null;
  }
}

export function parseAuthFlowCookie({
  cookieValue,
  hmacSecret,
  now = () => new Date(),
}: {
  cookieValue: string;
  hmacSecret: string;
  now?: () => Date;
}):
  | { ok: true; payload: AuthFlowCookiePayload }
  | { ok: false; reason: "invalid" | "expired" } {
  try {
    requireHmacSecret(hmacSecret);
    const [encodedPayload, suppliedSignature, extra] = cookieValue.split(".");
    if (
      !encodedPayload
      || !suppliedSignature
      || extra !== undefined
      || !HASH_PATTERN.test(suppliedSignature)
    ) {
      return { ok: false, reason: "invalid" };
    }
    const expectedSignature = hmac(
      `homecook-auth-flow-cookie:v1:${encodedPayload}`,
      hmacSecret,
    );
    if (!timingSafeEqual(
      Buffer.from(suppliedSignature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    )) {
      return { ok: false, reason: "invalid" };
    }
    const payload = decodePayload(encodedPayload);
    if (!payload) {
      return { ok: false, reason: "invalid" };
    }
    if (payload.x < Math.floor(now().getTime() / 1_000)) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

function isAttempt(value: unknown): value is AuthFlowLedgerAttempt {
  if (!value || typeof value !== "object") {
    return false;
  }
  const attempt = value as Record<string, unknown>;
  return PROVIDERS.has(attempt.provider as AuthFlowProvider)
    && FLOW_KINDS.has(attempt.flow_kind as AuthFlowKind)
    && AUTHORITIES.has(attempt.authority as AuthAuthority)
    && isPositiveSafeInteger(attempt.cutover_epoch)
    && typeof attempt.expires_at === "string"
    && Number.isFinite(Date.parse(attempt.expires_at))
    && (attempt.terminal_at === null
      || (typeof attempt.terminal_at === "string"
        && Number.isFinite(Date.parse(attempt.terminal_at))))
    && (attempt.terminal_reason === null
      || TERMINAL_REASONS.has(attempt.terminal_reason as AuthFlowTerminalReason));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export class AuthFlowLedgerStore {
  readonly #authority: AuthAuthority;
  readonly #client: AuthFlowRpcClient;
  readonly #cutoverEpoch: number;
  readonly #hmacSecret: string;
  readonly #now: () => Date;
  readonly #randomNonce: () => string;

  constructor({
    authority,
    client,
    cutoverEpoch,
    hmacSecret,
    now = () => new Date(),
    randomNonce = () => randomBytes(32).toString("base64url"),
  }: {
    authority: AuthAuthority;
    client: AuthFlowRpcClient;
    cutoverEpoch: number;
    hmacSecret: string;
    now?: () => Date;
    randomNonce?: () => string;
  }) {
    requireHmacSecret(hmacSecret);
    if (!AUTHORITIES.has(authority)) {
      throw new Error("Auth authority는 remote 또는 local이어야 해요.");
    }
    if (!isPositiveSafeInteger(cutoverEpoch)) {
      throw new Error("Auth flow cutover epoch는 양의 정수여야 해요.");
    }
    this.#authority = authority;
    this.#client = client;
    this.#cutoverEpoch = cutoverEpoch;
    this.#hmacSecret = hmacSecret;
    this.#now = now;
    this.#randomNonce = randomNonce;
  }

  async start({
    flowKind,
    provider,
  }: {
    flowKind: AuthFlowKind;
    provider: AuthFlowProvider;
  }) {
    if (!FLOW_KINDS.has(flowKind) || !PROVIDERS.has(provider)) {
      throw new Error("허용된 Auth provider와 flow kind가 필요해요.");
    }
    const issuedAt = this.#now();
    const expiresAt = new Date(
      issuedAt.getTime() + AUTH_FLOW_TTL_SECONDS * 1_000,
    );
    const nonce = this.#randomNonce();
    if (nonce.length < 32) {
      throw new Error("Auth flow nonce가 너무 짧아요.");
    }
    const payload: AuthFlowCookiePayload = {
      v: 1,
      n: nonce,
      f: flowKind,
      a: this.#authority,
      e: this.#cutoverEpoch,
      x: Math.floor(expiresAt.getTime() / 1_000),
    };
    const encodedPayload = encodePayload(payload);
    const signature = hmac(
      `homecook-auth-flow-cookie:v1:${encodedPayload}`,
      this.#hmacSecret,
    );
    const { error } = await this.#client.rpc("insert_auth_flow_attempt", {
      p_attempt_hash: attemptHash(nonce, this.#hmacSecret),
      p_authority: this.#authority,
      p_cutover_epoch: this.#cutoverEpoch,
      p_expires_at: expiresAt.toISOString(),
      p_flow_kind: flowKind,
      p_issued_at: issuedAt.toISOString(),
      p_provider: provider,
    });
    if (error) {
      throw new Error("Auth flow ledger를 시작하지 못했어요.");
    }
    return Object.freeze({
      cookieValue: `${encodedPayload}.${signature}`,
      expiresAt: expiresAt.toISOString(),
      maxAge: AUTH_FLOW_TTL_SECONDS,
    });
  }

  #verifiedCookie(cookieValue: string) {
    const parsed = parseAuthFlowCookie({
      cookieValue,
      hmacSecret: this.#hmacSecret,
      now: this.#now,
    });
    if (!parsed.ok) {
      return parsed;
    }
    if (
      parsed.payload.a !== this.#authority
      || parsed.payload.e !== this.#cutoverEpoch
    ) {
      return { ok: false as const, reason: "cutover_rejected" as const };
    }
    return parsed;
  }

  async read(cookieValue: string): Promise<
    | { ok: true; attempt: AuthFlowLedgerAttempt }
    | { ok: false; reason: "invalid" | "expired" | "cutover_rejected" | "unavailable" | "mismatch" }
  > {
    const parsed = this.#verifiedCookie(cookieValue);
    if (!parsed.ok) {
      return parsed;
    }
    try {
      const { data, error } = await this.#client.rpc("read_auth_flow_attempt", {
        p_attempt_hash: attemptHash(parsed.payload.n, this.#hmacSecret),
        p_flow_kind: parsed.payload.f,
      });
      if (error) {
        return { ok: false, reason: "unavailable" };
      }
      if (
        !isAttempt(data)
        || data.flow_kind !== parsed.payload.f
        || data.authority !== parsed.payload.a
        || data.cutover_epoch !== parsed.payload.e
        || Math.floor(Date.parse(data.expires_at) / 1_000) !== parsed.payload.x
      ) {
        return { ok: false, reason: "mismatch" };
      }
      return { ok: true, attempt: data };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  async terminal(
    cookieValue: string,
    terminalReason: AuthFlowTerminalReason,
  ): Promise<
    | { ok: true; terminalReason: AuthFlowTerminalReason }
    | { ok: false; reason: "invalid" | "expired" | "cutover_rejected" | "unavailable" }
  > {
    if (!TERMINAL_REASONS.has(terminalReason)) {
      return { ok: false, reason: "invalid" };
    }
    const parsed = terminalReason === "cutover_rejected"
      ? parseAuthFlowCookie({
        cookieValue,
        hmacSecret: this.#hmacSecret,
        now: this.#now,
      })
      : this.#verifiedCookie(cookieValue);
    if (!parsed.ok) {
      return parsed;
    }
    try {
      const { data, error } = await this.#client.rpc(
        "terminal_auth_flow_attempt",
        {
          p_attempt_hash: attemptHash(parsed.payload.n, this.#hmacSecret),
          p_flow_kind: parsed.payload.f,
          p_now: this.#now().toISOString(),
          p_terminal_reason: terminalReason,
        },
      );
      const actualReason = data && typeof data === "object"
        ? (data as { terminal_reason?: unknown }).terminal_reason
        : null;
      return error || !TERMINAL_REASONS.has(actualReason as AuthFlowTerminalReason)
        ? { ok: false, reason: "unavailable" }
        : { ok: true, terminalReason: actualReason as AuthFlowTerminalReason };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  async outstanding(cutoverStartedAt: Date): Promise<
    | { ok: true; result: AuthFlowOutstandingResult }
    | { ok: false; reason: "invalid" | "unavailable" }
  > {
    if (
      !Number.isFinite(cutoverStartedAt.getTime())
      || cutoverStartedAt.getTime() > this.#now().getTime() + 5_000
    ) {
      return { ok: false, reason: "invalid" };
    }
    try {
      const { data, error } = await this.#client.rpc(
        "expire_and_count_remote_auth_flows",
        {
          p_cutover_started_at: cutoverStartedAt.toISOString(),
          p_now: this.#now().toISOString(),
        },
      );
      const counts = data && typeof data === "object"
        ? data as Record<string, unknown>
        : null;
      if (
        error
        || !counts
        || !isNonNegativeSafeInteger(counts.expired_count)
        || !isNonNegativeSafeInteger(counts.outstanding_count)
      ) {
        return { ok: false, reason: "unavailable" };
      }
      return {
        ok: true,
        result: {
          expiredCount: counts.expired_count,
          outstandingCount: counts.outstanding_count,
        },
      };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
}
