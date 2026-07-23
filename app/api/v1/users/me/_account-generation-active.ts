import { createHash } from "node:crypto";

import { fail, ok } from "@/lib/api/response";
import {
  recordOperationalEvent,
  type OperationalEventsDbClient,
} from "@/lib/server/admin-events";
import {
  readVerifiedAccountGenerationReplaySession,
  readVerifiedAccountGenerationSession,
  type AccountGenerationReplaySessionAuthority,
  type AccountGenerationSessionAuthority,
} from "@/lib/server/account-generation/session-authority";

import type { QuarantineResolutionAction } from "./_account-generation";

interface AccountGenerationRpcError {
  code?: string;
  message: string;
}

interface AccountGenerationRpcClient {
  rpc(
    name:
      | "initiate_account_generation_delete"
      | "replay_account_generation_delete"
      | "resolve_account_cutover_quarantine",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: AccountGenerationRpcError | null;
  }>;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function isAccountGenerationSessionAuthority(
  value: AccountGenerationSessionAuthority,
) {
  return UUID_PATTERN.test(value.ownerUuid)
    && Number.isFinite(Date.parse(value.authIdentityCreatedAt))
    && SHA_256_HEX_PATTERN.test(value.sessionKeyHash)
    && Number.isInteger(value.hmacKeyVersion)
    && value.hmacKeyVersion > 0;
}

function hashCanonicalPayload(payload: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export {
  readVerifiedAccountGenerationReplaySession,
  readVerifiedAccountGenerationSession,
};
export type {
  AccountGenerationReplaySessionAuthority,
  AccountGenerationSessionAuthority,
};

function isCleanupPendingResult(
  value: unknown,
): value is { deletion_status: "cleanup_pending" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Reflect.get(value, "deletion_status") === "cleanup_pending";
}

function isActiveResolutionResult(
  value: unknown,
): value is { resolution_status: "active"; account_generation: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Reflect.get(value, "resolution_status") === "active"
    && Number.isInteger(Reflect.get(value, "account_generation"))
    && Number(Reflect.get(value, "account_generation")) > 0;
}

function mapAccountGenerationRpcError(error: AccountGenerationRpcError | null) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;

  if (/\bIDEMPOTENCY_KEY_REUSED\b/.test(detail)) {
    return fail(
      "IDEMPOTENCY_KEY_REUSED",
      "같은 요청 키가 다른 요청에 이미 사용됐어요.",
      409,
    );
  }

  if (/\bACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED\b/.test(detail)) {
    return fail(
      "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED",
      "고객 지원을 통한 계정 복구가 필요해요.",
      409,
    );
  }

  if (/\bACCOUNT_CUTOVER_UNCLASSIFIED\b/.test(detail)) {
    return fail(
      "ACCOUNT_CUTOVER_UNCLASSIFIED",
      "계정 상태를 다시 확인해 주세요.",
      409,
    );
  }

  if (/\bACCOUNT_CUTOVER_QUARANTINED\b/.test(detail)) {
    return fail(
      "ACCOUNT_CUTOVER_QUARANTINED",
      "계정 복구가 필요해요.",
      409,
    );
  }

  if (/\bACCOUNT_SESSION_STALE\b/.test(detail)) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }

  if (/\bACCOUNT_GENERATION_STALE\b/.test(detail)) {
    return fail("ACCOUNT_GENERATION_STALE", "계정 상태를 다시 확인해 주세요.", 409);
  }

  if (/\bACCOUNT_DELETION_PENDING\b/.test(detail)) {
    return fail("ACCOUNT_DELETION_PENDING", "계정 삭제를 마무리하고 있어요.", 409);
  }

  if (/\bACCOUNT_DELETING\b/.test(detail)) {
    return fail("ACCOUNT_DELETING", "계정 삭제가 진행 중이에요.", 409);
  }

  return null;
}

export async function executeAccountGenerationDelete(input: {
  dbClient: AccountGenerationRpcClient;
  idempotencyKey: string;
  request: Request;
  sessionAuthority: AccountGenerationSessionAuthority;
}) {
  if (!isAccountGenerationSessionAuthority(input.sessionAuthority)) {
    return fail("INTERNAL_ERROR", "회원 탈퇴를 처리하지 못했어요.", 500);
  }

  const result = await input.dbClient.rpc("initiate_account_generation_delete", {
    p_owner_uuid: input.sessionAuthority.ownerUuid,
    p_auth_identity_created_at_snapshot:
      input.sessionAuthority.authIdentityCreatedAt,
    p_session_key_hash: input.sessionAuthority.sessionKeyHash,
    p_hmac_key_version: input.sessionAuthority.hmacKeyVersion,
    p_idempotency_key: input.idempotencyKey,
    p_payload_hash: hashCanonicalPayload({ action: "delete" }),
  });

  if (result.error) {
    const publicError = mapAccountGenerationRpcError(result.error);
    if (publicError) {
      return publicError;
    }
  }

  if (result.error || !isCleanupPendingResult(result.data)) {
    await recordOperationalEvent(
      input.dbClient as unknown as OperationalEventsDbClient,
      {
        event_type: "account_generation_delete_failure",
        severity: "critical",
        source: "account",
        actor_user_id: input.sessionAuthority.ownerUuid,
        target_user_id: input.sessionAuthority.ownerUuid,
        request: input.request,
        http_status: 500,
        error_code: "ACCOUNT_GENERATION_DELETE_RPC_ERROR",
        message_summary: "Generation-bound account deletion RPC failed",
      },
    );

    return fail("INTERNAL_ERROR", "회원 탈퇴를 처리하지 못했어요.", 500);
  }

  return ok(result.data, { status: 202 });
}

export async function executeAccountGenerationDeleteReplay(input: {
  dbClient: AccountGenerationRpcClient;
  idempotencyKey: string;
  sessionAuthority: AccountGenerationReplaySessionAuthority;
}) {
  const authority = input.sessionAuthority;
  if (
    !UUID_PATTERN.test(authority.ownerUuid)
    || !SHA_256_HEX_PATTERN.test(authority.sessionKeyHash)
    || !Number.isInteger(authority.hmacKeyVersion)
    || authority.hmacKeyVersion <= 0
  ) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const result = await input.dbClient.rpc("replay_account_generation_delete", {
    p_owner_uuid: authority.ownerUuid,
    p_session_key_hash: authority.sessionKeyHash,
    p_hmac_key_version: authority.hmacKeyVersion,
    p_idempotency_key: input.idempotencyKey,
    p_payload_hash: hashCanonicalPayload({ action: "delete" }),
  });

  if (result.error) {
    const publicError = mapAccountGenerationRpcError(result.error);
    if (publicError) {
      return publicError;
    }
  }

  if (result.error || !isCleanupPendingResult(result.data)) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  return ok(result.data, { status: 202 });
}

export async function executeAccountQuarantineResolution(input: {
  action: QuarantineResolutionAction;
  dbClient: AccountGenerationRpcClient;
  idempotencyKey: string;
  nickname: string | null;
  request: Request;
  sessionAuthority: AccountGenerationSessionAuthority;
}) {
  if (!isAccountGenerationSessionAuthority(input.sessionAuthority)) {
    return fail(
      "INTERNAL_ERROR",
      input.action === "activate"
        ? "계정 복구를 처리하지 못했어요."
        : "계정 삭제를 처리하지 못했어요.",
      500,
    );
  }

  const canonicalPayload = input.action === "activate"
    ? {
        action: input.action,
        profile: { nickname: input.nickname },
      }
    : { action: input.action };
  const result = await input.dbClient.rpc("resolve_account_cutover_quarantine", {
    p_owner_uuid: input.sessionAuthority.ownerUuid,
    p_auth_identity_created_at_snapshot:
      input.sessionAuthority.authIdentityCreatedAt,
    p_session_key_hash: input.sessionAuthority.sessionKeyHash,
    p_hmac_key_version: input.sessionAuthority.hmacKeyVersion,
    p_idempotency_key: input.idempotencyKey,
    p_payload_hash: hashCanonicalPayload(canonicalPayload),
    p_action: input.action,
    p_nickname: input.nickname,
  });

  if (result.error) {
    const publicError = mapAccountGenerationRpcError(result.error);
    if (publicError) {
      return publicError;
    }
  }

  const isExpectedResult = input.action === "activate"
    ? isActiveResolutionResult(result.data)
    : isCleanupPendingResult(result.data);
  if (result.error || !isExpectedResult) {
    await recordOperationalEvent(
      input.dbClient as unknown as OperationalEventsDbClient,
      {
        event_type: "account_quarantine_resolution_failure",
        severity: "critical",
        source: "account",
        actor_user_id: input.sessionAuthority.ownerUuid,
        target_user_id: input.sessionAuthority.ownerUuid,
        request: input.request,
        http_status: 500,
        error_code: "ACCOUNT_QUARANTINE_RESOLUTION_RPC_ERROR",
        message_summary: "Generation-bound quarantine resolution RPC failed",
        metadata_json: {
          action: input.action,
        },
      },
    );

    return fail(
      "INTERNAL_ERROR",
      input.action === "activate"
        ? "계정 복구를 처리하지 못했어요."
        : "계정 삭제를 처리하지 못했어요.",
      500,
    );
  }

  return ok(result.data, input.action === "delete" ? { status: 202 } : undefined);
}

export async function failClosedGenerationDelete(input: {
  dbClient: OperationalEventsDbClient | null;
  request: Request;
  userId: string;
}) {
  await recordOperationalEvent(input.dbClient, {
    event_type: "account_generation_delete_not_ready",
    severity: "critical",
    source: "account",
    actor_user_id: input.userId,
    target_user_id: input.userId,
    request: input.request,
    http_status: 500,
    error_code: "ACCOUNT_GENERATION_DELETE_NOT_READY",
    message_summary: "Generation-bound account deletion is not configured",
  });

  return fail("INTERNAL_ERROR", "회원 탈퇴를 처리하지 못했어요.", 500);
}

export async function failClosedQuarantineResolution(input: {
  action: QuarantineResolutionAction;
  dbClient: OperationalEventsDbClient | null;
  request: Request;
  userId: string;
}) {
  await recordOperationalEvent(input.dbClient, {
    event_type: "account_quarantine_resolution_not_ready",
    severity: "critical",
    source: "account",
    actor_user_id: input.userId,
    target_user_id: input.userId,
    request: input.request,
    http_status: 500,
    error_code: "ACCOUNT_QUARANTINE_RESOLUTION_NOT_READY",
    message_summary: "Generation-bound quarantine resolution is not configured",
    metadata_json: {
      action: input.action,
    },
  });

  return fail(
    "INTERNAL_ERROR",
    input.action === "activate"
      ? "계정 복구를 처리하지 못했어요."
      : "계정 삭제를 처리하지 못했어요.",
    500,
  );
}
