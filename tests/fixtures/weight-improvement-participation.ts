import { WEIGHT_IMPROVEMENT_PURPOSE, type WeightImprovementDocument, type WeightImprovementParticipation } from "../../types/weight-improvement-participation";

export const PARTICIPATION_OWNER = "550e8400-e29b-41d4-a716-446655440071";
export const PARTICIPATION_OTHER_OWNER = "550e8400-e29b-41d4-a716-446655440072";
export const PARTICIPATION_DOCUMENT: WeightImprovementDocument = {
  version: "fixture-consent-v1", hash: "a".repeat(64), notice_version: "fixture-notice-v1",
  title: "직접 잰 음식 무게로 추정을 개선할까요?",
  purpose: "참여 후 새 요리의 적격 실측으로 음식의 조리 전후 무게 추정을 개선해요.",
  data_items: ["표준 재료 종류와 확인된 실제 투입량", "직접 잰 완성 음식 전체 무게"],
  excluded_items: ["체중·건강 정보", "자유 메모·사진", "레시피 원문"],
  sample_retention: "가짜 검증 문서: 테스트 종료 시 삭제",
  evidence_retention: "가짜 검증 문서: 테스트 종료 시 삭제",
  withdrawal: "모든 기기의 설정에서 철회할 수 있어요. 정리 상태는 서버에서 따로 확인해요.",
  personal_service: "참여하지 않아도 개인 실측과 모든 기존 기능은 그대로 이용할 수 있어요.",
  body: "로컬 fixture 전용 가짜 문서입니다. 운영 문서나 보유기간의 승인이 아닙니다. 외부 AI 전송과 실제 수집은 없습니다.",
};
export function participationStatus(overrides: Partial<WeightImprovementParticipation> = {}): WeightImprovementParticipation {
  return { purpose: WEIGHT_IMPROVEMENT_PURPOSE, subject: { owner_uuid: PARTICIPATION_OWNER, account_generation: 3 },
    decision: "unanswered", revision: 0, notice_seen_at: null, notice_version_seen: null, opted_in_at: null, withdrawn_at: null,
    consent_document_version: null, consent_document_hash: null, cleanup_status: "none", participation_enabled: true,
    collection_enabled: false, document: { ...PARTICIPATION_DOCUMENT }, ...overrides };
}
