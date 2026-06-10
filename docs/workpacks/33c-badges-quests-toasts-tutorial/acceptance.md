# Acceptance Checklist: 33c-badges-quests-toasts-tutorial

> README의 33c contract-evolution 항목은 Stage 2 전 공식 문서 PR merge로 먼저 닫아야 한다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.

## Happy Path

- [x] 로그인 사용자가 MYPAGE에서 level progress, 대표 배지, active quest, tutorial quest를 함께 확인한다 <!-- omo:id=accept-mypage-gamification-surface;stage=4;scope=frontend;review=5,6 -->
- [x] 배지 안내 modal/popover가 열리고 닫히며 배지/퀘스트 기준을 집밥 서비스 톤으로 설명한다 <!-- omo:id=accept-badge-guide-modal;stage=4;scope=frontend;review=5,6 -->
- [x] XP source action 성공 후 unseen notification이 있으면 XP toast가 표시된다 <!-- omo:id=accept-xp-toast-after-action;stage=4;scope=frontend;review=5,6 -->
- [x] quest 조건 충족 시 completed_recent 또는 earned badge 상태가 다음 조회에 반영된다 <!-- omo:id=accept-quest-badge-completion;stage=2;scope=shared;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] 공식 contract-evolution PR이 merge된 후에만 신규 API/DB 구현이 시작된다 <!-- omo:id=accept-contract-evolution-first;stage=2;scope=shared;review=3,6 -->
- [x] `GET /api/v1/users/me`는 profile/settings-only 계약을 유지한다 <!-- omo:id=accept-users-me-profile-only;stage=2;scope=backend;review=3,6 -->
- [x] 33a progress response에 badge/quest/toast/tutorial field를 추가하지 않는다 <!-- omo:id=accept-progress-response-unchanged;stage=2;scope=backend;review=3,6 -->
- [x] badge award는 같은 badge/source 조건에서 중복 생성되지 않는다 <!-- omo:id=accept-badge-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] quest completion/progress projection은 같은 ledger를 여러 번 평가해도 같은 결과다 <!-- omo:id=accept-quest-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] notification seen 처리는 중복 호출에도 성공하거나 안전하게 무시된다 <!-- omo:id=accept-notification-seen-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] tutorial quest dismiss는 XP, level, badge award를 변경하지 않는다 <!-- omo:id=accept-tutorial-dismiss-policy;stage=2;scope=backend;review=3,6 -->
- [x] gamification projection 실패가 원래 source action 실패로 전파되지 않는다 <!-- omo:id=accept-source-action-isolation;stage=2;scope=backend;review=3,6 -->
- [x] leaderboard, competitive rank, pressure streak, season reset, loot reward가 API/DB에 들어가지 않는다 <!-- omo:id=accept-no-competitive-backend-scope;stage=2;scope=backend;review=3,6 -->
- [x] leaderboard, competitive rank, pressure streak, season reset, loot reward가 UI에 들어가지 않는다 <!-- omo:id=accept-no-competitive-ui-scope;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] read-only 상태가 있다 <!-- omo:id=accept-read-only;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] gamification API 실패는 MYPAGE core와 33b progress 전체 실패로 전파되지 않는다 <!-- omo:id=accept-gamification-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] seen/dismiss endpoint는 타인 리소스 접근을 거부하거나 정보 노출 없이 무시한다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] badge guide modal은 keyboard close/focus 흐름을 가진다 <!-- omo:id=accept-modal-accessibility;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] `user_progress_events`와 `user_progress_summary`가 XP/level truth로 유지된다 <!-- omo:id=accept-progress-truth;stage=2;scope=backend;review=3,6 -->
- [x] `operational_events`를 badge/quest/XP truth로 사용하지 않는다 <!-- omo:id=accept-no-operational-events-truth;stage=2;scope=backend;review=3,6 -->
- [x] badge/quest/notification row는 인증 사용자 scope로만 조회/수정된다 <!-- omo:id=accept-user-scoped-data;stage=2;scope=backend;review=3,6 -->
- [x] source event 하나가 XP toast를 중복 생성/표시하지 않는다 <!-- omo:id=accept-toast-dedupe;stage=2;scope=shared;review=3,6 -->
- [x] legacy/backfill 데이터는 lower-bound로 표현되며 삭제된 활동 복원을 주장하지 않는다 <!-- omo:id=accept-legacy-lower-bound-copy;stage=4;scope=frontend;review=5,6 -->
- [x] invalid notification id, invalid quest key, malformed body를 안전하게 처리한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 0 XP, badge earned, active quest, completed quest, unseen notification, API failure baseline이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 신규 table, unique constraint, seed/cleanup 경로가 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=backend;review=3,6 -->
- [x] source action 4종 중 최소 2종을 route/projection test로 수행해 projection과 notification 생성을 검증한다 <!-- omo:id=accept-real-source-action-smoke;stage=2;scope=backend;review=3,6 -->
- [x] 신규 회원 bootstrap row 없이 tutorial quest가 조회 시 안전하게 파생된다 <!-- omo:id=accept-no-bootstrap-row-required;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier:
- environment:
- scenarios:
  - 320px 모바일에서 MYPAGE progress, 대표 배지, current quest, tutorial quest가 겹치지 않는다.
  - 배지 안내 bottom sheet가 열리고 닫히며 뒤 배경 스크롤이 튀지 않는다.
  - 레시피 저장, 장보기 완료, 요리 완료 중 최소 2개 행동 후 XP toast가 core success feedback을 가리지 않는다.
  - gamification API를 강제로 실패시켜도 MYPAGE core와 33b progress UI는 유지된다.

## Automation Split

### Vitest

- [x] badge/quest definition과 projection 조건이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-definition-projection;stage=2;scope=backend;review=3,6 -->
- [x] badge award / quest completion / notification dedupe idempotency가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] gamification route success/error/owner guard가 route test로 고정되어 있다 <!-- omo:id=accept-vitest-route;stage=2;scope=backend;review=3,6 -->
- [x] MYPAGE gamification card, badge guide modal, XP toast 상태가 component test로 고정되어 있다 <!-- omo:id=accept-vitest-component;stage=4;scope=frontend;review=5,6 -->
- [x] API client 타입과 error envelope 처리가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-api-client;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] MYPAGE badge/quest/tutorial surface의 loading/empty/error/read-only/unauthorized 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-mypage-states;stage=4;scope=frontend;review=5,6 -->
- [x] badge guide modal open/close keyboard flow가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-badge-guide;stage=4;scope=frontend;review=5,6 -->
- [x] source action 후 XP toast가 표시되고 seen 처리되는 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-xp-toast;stage=4;scope=frontend;review=5,6 -->
- [x] 320px/390px/desktop visual evidence가 Stage 4 PR에 첨부되어 있다 <!-- omo:id=accept-playwright-visual-evidence;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 운영 데이터에서 실제 장기 사용자 badge/quest 분포가 과하거나 압박적이지 않은지 출시 전 제품 판단으로 확인한다
