# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] 대표 사용자 흐름이 정상 동작한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
  - 장보기 생성 후 SHOPPING_DETAIL 진입 → 구매 항목 체크 → 제외 섹션 이동 → 되살리기
- [ ] 문서 기준 화면 상태와 액션이 맞다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
  - 구매 섹션 / 팬트리 제외 섹션 분리 표시
  - 체크박스 토글, 제외/되살리기 버튼
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
  - `GET /shopping/lists/{id}` 응답 타입
  - `PATCH /shopping/lists/{id}/items/{id}` request/response 타입

## State / Policy
- [ ] 상태 전이가 공식 문서와 일치한다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
  - `is_checked`: `false ↔ true`
  - `is_pantry_excluded`: `false ↔ true`
  - `exclude→uncheck` 규칙: `is_pantry_excluded=true` 변경 시 `is_checked=false` 자동 정리
- [ ] read-only 정책이 지켜진다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
  - `shopping_lists.is_completed=true` 리스트는 수정 불가 (409 CONFLICT)
  - 프론트 read-only 모드에서 체크박스/토글 비활성화
- [ ] 중복 호출에도 결과가 꼬이지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
  - 체크 토글 API는 멱등함 (동일 값 재호출 시 200 + 동일 결과)

## Error / Permission
- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
  - 리스트 조회 중, 항목 업데이트 중
- [ ] empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
  - 구매 섹션 비었을 때: "팬트리에 이미 있어서 장볼 재료가 없어요"
- [ ] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
  - API 호출 실패 시 에러 메시지 표시
- [ ] unauthorized 처리 흐름이 있다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
  - 401 발생 시 로그인 안내 (실질적으로 드물지만 처리 포함)
- [ ] conflict 처리 흐름이 있다 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
  - 완료된 리스트 수정 시도 시 409 → "완료된 장보기 기록은 수정할 수 없어요" 안내
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
  - 상위 플로우(장보기 생성)에서 이미 로그인 게이트 통과, N/A로 처리 가능

## Data Integrity
- [ ] 타인 리소스를 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
  - `shopping_lists.user_id = 요청 user_id` 검증 (403)
  - item 소속 확인: `shopping_list_items.shopping_list_id = list_id` (404)
- [ ] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
  - 빈 body → 422 VALIDATION_ERROR
  - 존재하지 않는 list_id/item_id → 404
- [ ] 파생 필드와 비정규화 값이 맞다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
  - `exclude→uncheck` 규칙: `is_pantry_excluded=true` 변경 시 `is_checked=false` 자동 세팅

## Data Setup / Preconditions
- [ ] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
  - 로그인 유저 1명
  - `shopping_lists` × 2개 (`is_completed=false` / `true`)
  - `shopping_list_items` × 다수 (구매/제외 섹션 혼합)
  - `shopping_list_recipes`, `ingredients`
- [ ] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
  - `shopping_lists`, `shopping_list_items`, `shopping_list_recipes`, `ingredients` 테이블
  - seed script로 위 baseline 데이터 생성
- [ ] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
  - `meal_plan_columns` × 4, `recipe_books` × 3 (회원가입 시 자동 생성, slice 01 bootstrap)

## Manual QA
- verifier: (Stage 4에서 기입)
- environment: (Stage 4에서 기입)
- scenarios:
  1. 장보기 생성 → SHOPPING_DETAIL 자동 이동 확인
  2. 구매 섹션 항목 체크 → UI 반영 확인
  3. 항목을 제외 섹션으로 이동 → 구매 체크 자동 해제 확인
  4. 제외 섹션 항목을 다시 구매 섹션으로 되살리기
  5. 완료된 리스트 재열람 시 read-only 모드 확인 (체크박스/토글 비활성화)

## Automation Split

### Vitest
- [ ] 로직 / 유틸 / 상태 전이 / API helper 범위가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
  - `exclude→uncheck` 규칙 단위 테스트
  - read-only 정책 단위 테스트
  - 멱등성 단위 테스트
- [ ] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->
  - `is_pantry_excluded=true` 변경 시 `is_checked=false` 자동 세팅
  - 완료된 리스트 수정 시 409 반환

### Playwright
- [ ] 실제 사용자 흐름, 라우팅, 모달, 권한 게이트가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
  - 장보기 생성 → SHOPPING_DETAIL 진입
  - 체크 토글 → UI 반영
  - 제외/되살리기 → 섹션 이동
  - read-only 모드 확인
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->
  - N/A (외부 연동 없음)

### Manual Only
- [ ] 자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다
  - 없음 (모든 시나리오 자동화 가능)
