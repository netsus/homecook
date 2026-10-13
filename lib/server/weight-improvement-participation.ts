import { fail } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { createRouteHandlerClient, createWeightImprovementParticipationInternalClient } from "@/lib/supabase/server";
import { isParticipationRecord, isWeightImprovementParticipation } from "@/lib/weight-improvement-participation";
import type { WeightImprovementMutation } from "@/types/weight-improvement-participation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function authorizeWeightImprovementParticipation() {
  const authClient = await createRouteHandlerClient();
  const user = (await authClient.auth.getUser()).data.user;
  if (!user) return { ok: false as const, response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401) };
  const verified = await readVerifiedAccountGenerationSession(authClient);
  if (!verified.ok || verified.sessionAuthority.ownerUuid !== user.id) {
    return { ok: false as const, response: fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409) };
  }
  const client = createWeightImprovementParticipationInternalClient();
  if (!client) return { ok: false as const, response: fail("INTERNAL_ERROR", "참여 정보를 확인하지 못했어요.", 500) };
  return { ok: true as const, client, ownerUuid: user.id, args: buildSessionAuthorityRpcArgs(verified.sessionAuthority) };
}

export function parseWeightImprovementMutation(value: unknown): WeightImprovementMutation | null {
  if (!isParticipationRecord(value)) return null;
  const keys = value.action === "opt_in"
    ? ["action", "expected_subject", "expected_revision", "surface", "consent_checked", "document_version", "document_hash"]
    : ["action", "expected_subject", "expected_revision", "surface"];
  if (Object.keys(value).some((key) => !keys.includes(key))
    || typeof value.expected_revision !== "number" || !Number.isSafeInteger(value.expected_revision) || value.expected_revision < 0) return null;
  const subject = value.expected_subject;
  if (!isParticipationRecord(subject) || Object.keys(subject).length !== 2
    || Object.keys(subject).some(key => key !== "owner_uuid" && key !== "account_generation")
    || typeof subject.owner_uuid !== "string" || !UUID.test(subject.owner_uuid)
    || typeof subject.account_generation !== "number" || !Number.isSafeInteger(subject.account_generation) || subject.account_generation <= 0) return null;
  const surface = value.surface;
  if (surface !== "mobile_web" && surface !== "mobile_pwa" && surface !== "settings_mobile" && surface !== "settings_desktop") return null;
  const base: Pick<WeightImprovementMutation, "expected_subject" | "expected_revision" | "surface"> = {
    expected_subject: { owner_uuid: subject.owner_uuid.toLowerCase(), account_generation: subject.account_generation },
    expected_revision: value.expected_revision, surface,
  };
  if (value.action === "notice_seen" || value.action === "decline" || value.action === "withdraw") return { ...base, action: value.action };
  if (value.action !== "opt_in" || value.consent_checked !== true
    || typeof value.document_version !== "string" || !value.document_version.trim() || value.document_version.length > 80
    || typeof value.document_hash !== "string" || !/^[0-9a-f]{64}$/.test(value.document_hash)) return null;
  return { ...base, action: "opt_in", consent_checked: true, document_version: value.document_version, document_hash: value.document_hash };
}

export function readParticipationIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key");
  return key && UUID.test(key) ? key : null;
}

export function participationRpcError(error: unknown) {
  const text = isParticipationRecord(error) ? [error.code, error.message, error.details].filter((value) => typeof value === "string").join(" ") : "";
  const errors = {
    PARTICIPATION_DISABLED: { status: 409, message: "참여 안내를 준비하고 있어요. 다른 기능은 계속 이용할 수 있어요." },
    PARTICIPATION_REVISION_CONFLICT: { status: 409, message: "다른 화면에서 선택이 바뀌었어요. 최신 상태를 확인해 주세요." },
    PARTICIPATION_SUBJECT_CHANGED: { status: 409, message: "참여 계정이나 계정 상태가 바뀌었어요. 다시 확인해 주세요." },
    PARTICIPATION_DOCUMENT_CHANGED: { status: 409, message: "참여 설명이 바뀌었어요. 새 설명을 확인해 주세요." },
    ACCOUNT_SESSION_STALE: { status: 409, message: "세션을 다시 확인해 주세요." },
    ACCOUNT_GENERATION_STALE: { status: 409, message: "계정 상태를 다시 확인해 주세요." },
    ACCOUNT_DELETING: { status: 409, message: "계정 삭제를 처리하고 있어요." },
    ACCOUNT_LIFECYCLE_MAINTENANCE: { status: 503, message: "계정 상태를 정리하고 있어요. 잠시 후 다시 시도해 주세요." },
    PARTICIPATION_UNAUTHORIZED: { status: 403, message: "참여 정보를 처리할 권한을 확인하지 못했어요." },
    IDEMPOTENCY_KEY_REUSED: { status: 409, message: "요청 내용이 바뀌었어요. 최신 상태를 확인하고 다시 시도해 주세요." },
    VALIDATION_ERROR: { status: 422, message: "참여 선택 내용을 확인해 주세요." },
  };
  for (const [code, errorInfo] of Object.entries(errors)) {
    if (text.includes(code)) return fail(code, errorInfo.message, errorInfo.status);
  }
  return fail("INTERNAL_ERROR", "참여 정보를 처리하지 못했어요. 다른 기능은 계속 이용할 수 있어요.", 500);
}

export function projectParticipationResult(value: unknown, ownerUuid: string) {
  if (!isWeightImprovementParticipation(value) || value.subject.owner_uuid !== ownerUuid) return null;
  const document = value.document;
  return {
    purpose: value.purpose, subject: { owner_uuid: value.subject.owner_uuid, account_generation: value.subject.account_generation },
    decision: value.decision, revision: value.revision, notice_seen_at: value.notice_seen_at, notice_version_seen: value.notice_version_seen,
    opted_in_at: value.opted_in_at, withdrawn_at: value.withdrawn_at, consent_document_version: value.consent_document_version,
    consent_document_hash: value.consent_document_hash, cleanup_status: value.cleanup_status,
    participation_enabled: value.participation_enabled, collection_enabled: value.collection_enabled,
    document: document ? { version: document.version, hash: document.hash, notice_version: document.notice_version, title: document.title,
      purpose: document.purpose, data_items: document.data_items, excluded_items: document.excluded_items, sample_retention: document.sample_retention,
      evidence_retention: document.evidence_retention, withdrawal: document.withdrawal, personal_service: document.personal_service, body: document.body } : null,
  };
}
