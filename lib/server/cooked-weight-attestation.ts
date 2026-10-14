import { fail } from "@/lib/api/response";
import type { WeightAttestationInput } from "@/types/cooked-weight-attestation";

export function attestationOwnerPrecondition(input: WeightAttestationInput, ownerId: string) {
  return input.expected_subject.owner_uuid.toLowerCase() === ownerId.toLowerCase()
    ? null : fail("WEIGHT_ATTESTATION_SUBJECT_CHANGED", "확인한 계정이 바뀌었어요. 다시 열어 주세요.", 409);
}
export function attestationRpcArgs(input: WeightAttestationInput) {
  return { p_expected_generation: input.expected_subject.account_generation,
    p_checked: true, p_statement_version: input.statement_version, p_expected_context: input.expected_context_fingerprint };
}
export function attestationRpcError(error: { message?: string; details?: string; code?: string } | null) {
  const text = [error?.message, error?.details, error?.code].join(" ");
  const messages = {
    WEIGHT_ATTESTATION_DISABLED: "개인 확인 기록의 새 저장이 중지됐어요. 선택 확인을 해제하면 기존 실측을 저장할 수 있어요.",
    WEIGHT_ATTESTATION_SUBJECT_CHANGED: "확인한 계정 상태가 바뀌었어요. 다시 열어 주세요.",
    WEIGHT_ATTESTATION_CONTEXT_CHANGED: "이번 요리의 고정 재료표가 바뀌었어요. 다시 확인해 주세요.",
    WEIGHT_ATTESTATION_REVISION_CONFLICT: "다른 화면에서 확인 기록이 바뀌었어요. 다시 열어 주세요.",
    WEIGHT_ATTESTATION_OLD_RECEIPT: "이미 저장된 옛 실측에는 확인을 새로 붙일 수 없어요.",
  };
  for (const [code, message] of Object.entries(messages)) if (text.includes(code)) return fail(code, message, 409);
  return null;
}
