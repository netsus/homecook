import { fail, ok } from "@/lib/api/response";
import { authorizeWeightImprovementParticipation, parseWeightImprovementMutation, participationRpcError,
  projectParticipationResult, readParticipationIdempotencyKey } from "@/lib/server/weight-improvement-participation";

export async function GET() {
  try {
  const authority = await authorizeWeightImprovementParticipation();
  if (!authority.ok) return authority.response;
  const result = await authority.client.read(authority.args);
  if (result.error) return participationRpcError(result.error);
  const status = projectParticipationResult(result.data, authority.ownerUuid);
  return status ? ok(status) : fail("INTERNAL_ERROR", "참여 정보를 확인하지 못했어요.", 500);
  } catch { return fail("INTERNAL_ERROR", "참여 정보를 확인하지 못했어요.", 500); }
}

export async function PATCH(request: Request) {
  try {
  const authority = await authorizeWeightImprovementParticipation();
  if (!authority.ok) return authority.response;
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_json" }]); }
  const mutation = parseWeightImprovementMutation(raw);
  const key = readParticipationIdempotencyKey(request);
  if (!mutation || !key) return fail("VALIDATION_ERROR", "참여 선택 내용을 확인해 주세요.", 422, [{ field: mutation ? "Idempotency-Key" : "body", reason: "invalid_request" }]);
  if (mutation.expected_subject.owner_uuid !== authority.ownerUuid.toLowerCase()) {
    return participationRpcError({ message: "PARTICIPATION_SUBJECT_CHANGED" });
  }
  const result = await authority.client.mutate({ ...authority.args, p_action: mutation.action,
    p_expected_account_generation: mutation.expected_subject.account_generation,
    p_expected_revision: mutation.expected_revision, p_surface: mutation.surface, p_idempotency_key: key,
    p_document_version: mutation.action === "opt_in" ? mutation.document_version : null,
    p_document_hash: mutation.action === "opt_in" ? mutation.document_hash : null,
    p_consent_checked: mutation.action === "opt_in" && mutation.consent_checked });
  if (result.error) return participationRpcError(result.error);
  const status = projectParticipationResult(result.data, authority.ownerUuid);
  return status ? ok(status) : fail("INTERNAL_ERROR", "참여 선택 결과를 확인하지 못했어요.", 500);
  } catch { return fail("INTERNAL_ERROR", "참여 선택을 처리하지 못했어요.", 500); }
}
