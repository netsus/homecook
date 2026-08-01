import {
  decodeRemoteJwt,
  validateRemoteJwtClaims,
} from "@/lib/server/hybrid-auth/jwt-guard";
import { createSessionLivenessBinding } from "@/lib/server/hybrid-auth/session-authority";
import type {
  AccountGenerationBootstrapSessionAuthority,
} from "@/lib/server/account-generation/session-authority";

interface RpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data?: unknown; error?: unknown }>;
}

export interface LocalControl {
  authority: "local";
  cutover_epoch: number;
  flows_open: true;
  hmac_key_version: number;
  local_issuer: string;
}

export interface FullLocalSessionRecord extends Record<string, unknown> {
  p_access_token_expires_at: string;
  p_auth_cutover_epoch: number;
  p_binding_expires_at: string;
  p_hmac_key_version: number;
  p_identity_created_at: string;
  p_issuer: string;
  p_owner_uuid: string;
  p_session_issued_at: string;
  p_session_key_hash: string;
  p_verified_at: string;
}

function isPositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isLocalControl(value: unknown): value is LocalControl {
  if (!value || typeof value !== "object") {
    return false;
  }
  const control = value as Record<string, unknown>;
  return control.authority === "local"
    && control.flows_open === true
    && isPositiveInteger(control.cutover_epoch)
    && isPositiveInteger(control.hmac_key_version)
    && typeof control.local_issuer === "string"
    && /^https:\/\/[^/?#]+\/auth\/v1$/u.test(control.local_issuer);
}

export async function readFullLocalSessionControl(client: RpcClient) {
  try {
    const result = await client.rpc("read_full_local_auth_control", {});
    return result.error || !isLocalControl(result.data)
      ? { ok: false as const, reason: "stale" as const }
      : { ok: true as const, control: result.data };
  } catch {
    return { ok: false as const, reason: "maintenance" as const };
  }
}

export async function prepareFullLocalSessionAuthority({
  accessToken,
  client,
  nowSeconds = () => Math.floor(Date.now() / 1_000),
  user,
}: {
  accessToken: string;
  client: RpcClient;
  nowSeconds?: () => number;
  user: { id: string; created_at?: string };
}): Promise<
  | {
      ok: true;
      accountBootstrap: AccountGenerationBootstrapSessionAuthority;
      record: FullLocalSessionRecord;
    }
  | { ok: false; reason: "maintenance" | "stale" }
> {
  try {
    const controlResult = await readFullLocalSessionControl(client);
    if (!controlResult.ok) {
      return controlResult;
    }
    const control = controlResult.control;
    const decoded = decodeRemoteJwt(accessToken);
    if (!decoded.ok || typeof user.created_at !== "string") {
      return { ok: false, reason: "stale" };
    }
    const now = nowSeconds();
    const validated = validateRemoteJwtClaims({
      claims: decoded.claims,
      expectedIssuer: control.local_issuer,
      nowSeconds: now,
    });
    if (
      !validated.ok
      || validated.claims.ownerUuid !== user.id
      || !Number.isFinite(Date.parse(user.created_at))
    ) {
      return { ok: false, reason: "stale" };
    }

    const keyVersion = control.hmac_key_version;
    const secret = process.env[
      `HOMECOOK_SESSION_GENERATION_HMAC_KEY_V${keyVersion}`
    ]?.trim() ?? "";
    const identityCreatedAt = new Date(user.created_at).toISOString();
    const verifiedAt = new Date(now * 1_000).toISOString();
    const binding = createSessionLivenessBinding({
      secret,
      keyVersion,
      issuer: validated.claims.issuer,
      ownerUuid: validated.claims.ownerUuid,
      sessionId: validated.claims.sessionId,
      identityCreatedAt,
      remoteVerifiedAt: verifiedAt,
      ttlSeconds: validated.claims.expiresAt - now,
    });
    const sessionIssuedAt = new Date(
      validated.claims.issuedAt * 1_000,
    ).toISOString();
    const accessTokenExpiresAt = new Date(
      validated.claims.expiresAt * 1_000,
    ).toISOString();

    return {
      ok: true,
      accountBootstrap: {
        ownerUuid: validated.claims.ownerUuid,
        authIdentityCreatedAt: identityCreatedAt,
        sessionIssuedAt,
        sessionKeyHash: binding.session_key_hash,
        hmacKeyVersion: keyVersion,
      },
      record: {
        p_access_token_expires_at: accessTokenExpiresAt,
        p_auth_cutover_epoch: control.cutover_epoch,
        p_binding_expires_at: binding.binding_expires_at,
        p_hmac_key_version: keyVersion,
        p_identity_created_at: identityCreatedAt,
        p_issuer: validated.claims.issuer,
        p_owner_uuid: validated.claims.ownerUuid,
        p_session_issued_at: sessionIssuedAt,
        p_session_key_hash: binding.session_key_hash,
        p_verified_at: verifiedAt,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return {
      ok: false,
      reason: detail.includes("MAINTENANCE") ? "maintenance" : "stale",
    };
  }
}

export async function recordFullLocalSessionAuthority({
  client,
  record,
}: {
  client: RpcClient;
  record: FullLocalSessionRecord;
}) {
  try {
    const result = await client.rpc("record_full_local_session_authority", record);
    const state = result.data && typeof result.data === "object"
      ? Reflect.get(result.data, "binding_state")
      : null;
    return result.error || state !== "active"
      ? { ok: false as const, reason: "stale" as const }
      : { ok: true as const };
  } catch {
    return { ok: false as const, reason: "stale" as const };
  }
}
