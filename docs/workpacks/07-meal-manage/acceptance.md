# Acceptance Checklist: 07-meal-manage

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [ ] `GET /meals?plan_date=&column_id=`가 해당 슬롯의 식사 목록을 반환한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [ ] 식사 카드에 레시피명, 계획 인분, 상태 뱃지가 표시된다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [ ] `PATCH /meals/{id}` 호출 후 목록이 갱신된 인분으로 표시된다 <!-- omo:id=accept-patch-servings;stage=4;scope=frontend;review=5,6 -->
- [ ] `DELETE /meals/{id}` 호출 후 해당 식사가 목록에서 제거된다 <!-- omo:id=accept-delete-removes;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] `planned_servings` 변경 시 `status`가 변경되지 않는다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [ ] `status='shopping_done'` 또는 `'cook_done'`인 식사의 인분 변경 시 FE 확인 모달이 표시된다 <!-- omo:id=accept-serving-change-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] 삭제 전 확인 모달이 항상 표시된다 <!-- omo:id=accept-delete-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 이번 슬라이스에서 `meals.status` 전이는 발생하지 않는다 (read-only 정책은 후속 슬라이스에서) <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] DELETE는 멱등 처리 없이 404를 반환하며 FE에서 graceful 처리한다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 — GET /meals 조회 중 스켈레톤 또는 스피너 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 — 슬롯에 식사가 없는 경우 빈 상태 메시지 표시 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 — GET /meals 실패 시 안내 + 재시도 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 — 비로그인 접근 시 로그인 게이트 + return-to-action <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리 흐름이 있다 — 서버 409 반환 시 인라인 오류 메시지 표시 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 — 로그인 성공 후 원래 MEAL_SCREEN URL로 복귀 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인의 `column_id`로 조회 시 403을 반환한다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 타인의 `meal_id`를 PATCH/DELETE 시 403을 반환한다 <!-- omo:id=accept-owner-guard-mutation;stage=2;scope=backend;review=3,6 -->
- [x] `planned_servings < 1` 요청 시 422를 반환한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 존재하지 않는 `meal_id`로 PATCH/DELETE 시 404를 반환한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 — `meal_plan_columns ×4`, `meals` (registered/shopping_done/cook_done) 각 최소 1개 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 — `meals` 테이블 + `pnpm qa:seed:01-05` 결과 확인 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 — `meal_plan_columns ×4`는 회원가입 시 자동 생성 (`0-2 PATCH /auth/profile` 완료 후), 이 슬라이스는 해당 컬럼을 읽기만 한다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: QA 담당자 또는 Stage 4 구현 담당 Claude
- environment: `pnpm dev:local-supabase` 또는 `pnpm dev:demo`
- scenarios:
  1. 특정 날짜·끼니 슬롯에 식사가 있는 상태에서 MEAL_SCREEN 진입 → 목록 조회 확인
  2. 인분 조절 — `registered` 상태 식사: 모달 없이 바로 변경
  3. 인분 조절 — `shopping_done` 상태 식사: 확인 모달 표시 후 변경
  4. 인분 조절 — `cook_done` 상태 식사: 확인 모달 표시 후 변경
  5. 삭제 — 확인 모달 표시 → 확인 → 목록에서 제거
  6. 삭제 — 확인 모달 표시 → 취소 → 목록 변경 없음
  7. 빈 슬롯 진입 → 빈 상태 + [식사 추가] CTA 표시
  8. 비로그인 상태에서 MEAL_SCREEN URL 직접 접근 → 로그인 게이트 + return-to-action 확인
  9. 서버 오류(네트워크 차단 시뮬레이션) → error 상태 표시 + 재시도 버튼 확인

## Automation Split

### Vitest

- [x] `GET /meals` 쿼리 파라미터 검증, 소유자 확인 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [x] `PATCH /meals/{id}` 권한·422·409 경계 조건이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] `MEAL_SCREEN` 로드, 인분 변경, 삭제, 빈 상태가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 접근 시 로그인 게이트 및 return-to-action이 브라우저 테스트로 확인된다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 실제 live DB에서 `shopping_done` / `cook_done` 상태 식사의 확인 모달 경로 end-to-end 확인 (장보기/요리 완료가 이전 슬라이스에 의존하기 때문에 fixture로만 검증 가능하며 live 전체 흐름은 후속 슬라이스에서 닫힌다)
