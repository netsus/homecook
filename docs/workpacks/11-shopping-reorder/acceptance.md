# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] 대표 사용자 흐름이 정상 동작한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
  - 장보기 상세(미완료) 진입 → 재료 카드 위/아래 이동 버튼 클릭 → 순서 변경 → 재진입 시 순서 유지
  - Evidence: `tests/e2e/slice-11-shopping-reorder.spec.ts` - "should call reorder API when clicking move button"
- [x] 문서 기준 화면 상태와 액션이 맞다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
  - 위/아래 이동 버튼 표시 (미완료 리스트)
  - 이동 버튼 비활성화 또는 숨김 (완료 리스트)
  - Evidence: `tests/shopping-detail.frontend.test.tsx` - "shows reorder buttons for incomplete list", "does not show reorder buttons for completed list"
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
  - `PATCH /shopping/lists/{id}/items/reorder` request/response 타입
  - Evidence: `types/shopping.ts` - ShoppingListReorderBody, ShoppingListReorderData

## State / Policy
- [x] 상태 전이가 공식 문서와 일치한다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
  - `shopping_list_items.sort_order` 일괄 업데이트
  - 업데이트 후 `GET /shopping/lists/{id}` 재조회 시 새 순서 반영
- [x] read-only 정책이 지켜진다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
  - `shopping_lists.is_completed=true` 리스트는 순서 변경 불가 (409 CONFLICT)
  - 프론트 read-only 모드에서 이동 버튼 비활성화 또는 숨김
- [x] 중복 호출에도 결과가 꼬이지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
  - 같은 `orders` 배열로 재호출 시 200 + 동일 결과

## Error / Permission
- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
  - reorder API 호출 중 로딩 표시
  - Evidence: `components/shopping/shopping-detail-screen.tsx` - isReordering state, disabled movement controls during reorder
- [x] empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
  - N/A (장보기 리스트 자체는 slice 09/10a에서 처리)
- [x] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
  - reorder API 호출 실패 시 에러 메시지 표시 + 원래 순서로 되돌림
  - Evidence: `tests/e2e/slice-11-shopping-reorder.spec.ts` - "should show error toast when reorder fails", "should rollback order on reorder failure"
- [x] unauthorized 처리 흐름이 있다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
  - 401 발생 시 로그인 안내 (실질적으로 드물지만 처리 포함)
  - Evidence: `components/shopping/shopping-detail-screen.tsx:313` - handleDragEnd 401 redirect
- [x] conflict 처리 흐름이 있다 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
  - 완료된 리스트 순서 변경 시도 시 409 → "완료된 장보기 기록은 수정할 수 없어요" 안내
  - Evidence: `tests/e2e/slice-11-shopping-reorder.spec.ts` - "should show conflict error when reordering completed list"
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
  - 상위 플로우(장보기 생성)에서 이미 로그인 게이트 통과, N/A로 처리 가능

## Data Integrity
- [x] 타인 리소스를 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
  - `shopping_lists.user_id = 요청 user_id` 검증 (403)
  - 모든 `item_id`가 해당 `list_id` 소속인지 확인 (아니면 무시)
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
  - 빈 body → 422 VALIDATION_ERROR
  - `orders` 누락 또는 배열이 아님 → 422
  - 존재하지 않는 list_id → 404
  - 현재 list_id 소속이 아닌 item_id → 무시하고 유효한 항목만 처리
- [x] 파생 필드와 비정규화 값이 맞다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
  - `sort_order` 업데이트 후 정렬 규칙(`sort_order ASC`, 동일 시 `id ASC`)에 따라 조회됨

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
  - 로그인 유저 1명
  - `shopping_lists` × 2개 (`is_completed=false` / `true`)
  - `shopping_list_items` × 5개 이상 (다양한 `sort_order` 값)
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
  - `shopping_lists`, `shopping_list_items` 테이블
  - `shopping_list_items.sort_order` 컬럼 (DB v1.3에서 이미 추가됨)
  - seed script로 위 baseline 데이터 생성
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
  - `meal_plan_columns` × 4, `recipe_books` × 3 (회원가입 시 자동 생성, slice 01 bootstrap)

## Manual QA
- verifier: Claude (Stage 4 implementation)
- environment: Automated (Vitest + Playwright e2e)
- scenarios:
  1. 장보기 상세(미완료) 진입 → 위/아래 이동 버튼 표시 확인 ✅
  2. 이동 버튼 클릭 → 화면 순서 변경 + reorder API 호출 확인 ✅
  3. 재진입 → 순서 유지 확인 ✅ (covered by e2e test)
  4. 완료된 리스트 재열람 → 이동 버튼 비활성화 또는 숨김 확인 ✅
  5. reorder API 실패 시 원래 순서로 되돌림 + 에러 메시지 표시 확인 ✅

## Automation Split

### Vitest
- [x] 로직 / 유틸 / 상태 전이 / API helper 범위가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
  - read-only 정책 단위 테스트 (409 CONFLICT)
  - 멱등성 단위 테스트
  - 소유자 검증 단위 테스트 (403)
- [x] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->
  - 완료된 리스트 순서 변경 시 409 반환
  - 유효하지 않은 item_id 무시하고 유효한 항목만 업데이트

### Playwright
- [x] 실제 사용자 흐름, 라우팅, 모달, 권한 게이트가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
  - 장보기 상세 진입 → 이동 버튼 클릭 → 순서 변경 → 재진입 → 순서 유지
  - 완료된 리스트 재열람 → 이동 버튼 비활성화
  - reorder API 실패 시 원래 순서로 되돌림
  - Evidence: `tests/e2e/slice-11-shopping-reorder.spec.ts` - all test scenarios
- [x] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->
  - N/A (외부 연동 없음)

### Manual Only
- [ ] 자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다
  - 없음 (모든 시나리오 자동화 가능)
