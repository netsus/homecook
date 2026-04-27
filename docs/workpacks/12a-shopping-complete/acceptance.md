# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] 미완료 장보기 리스트에서 [장보기 완료] 버튼이 노출된다 <!-- omo:id=accept-complete-button-visible;stage=4;scope=frontend;review=5,6 -->
- [ ] [장보기 완료] 클릭 시 완료 API가 호출되고 성공 메시지가 표시된다 <!-- omo:id=accept-complete-success-message;stage=4;scope=frontend;review=5,6 -->
- [ ] 완료 API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약(`completed`, `meals_updated`)과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [ ] 플래너 위클리에서 연결된 식사 상태가 `shopping_done`으로 전이된 것을 확인할 수 있다 <!-- omo:id=accept-meal-status-transition;stage=4;scope=frontend;review=6 -->

## State / Policy
- [ ] `shopping_lists.is_completed`가 `false → true`로 전이된다 <!-- omo:id=accept-list-completed-transition;stage=2;scope=backend;review=3,6 -->
- [ ] `shopping_lists.completed_at`이 완료 시각으로 설정된다 <!-- omo:id=accept-completed-at-set;stage=2;scope=backend;review=3,6 -->
- [ ] 해당 리스트에 연결된 식사(`meals.shopping_list_id = list_id`)만 상태 전이된다 <!-- omo:id=accept-meal-filter-by-list;stage=2;scope=backend;review=3,6 -->
- [ ] `meals.status='registered'`인 식사만 `shopping_done`으로 전이된다 <!-- omo:id=accept-meal-status-filter;stage=2;scope=backend;review=3,6 -->
- [ ] 이미 `shopping_done` 또는 `cook_done`인 식사는 무시된다 <!-- omo:id=accept-meal-skip-already-done;stage=2;scope=backend;review=3,6 -->
- [ ] 완료 후 장보기 리스트는 read-only로 전환된다 (체크/제외/순서 변경 API가 409 반환) <!-- omo:id=accept-read-only-after-complete;stage=2;scope=backend;review=3,6 -->
- [ ] 이미 완료된 리스트를 재호출해도 200 + 동일 결과 반환 (멱등성) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [ ] loading 상태가 있다 (완료 API 호출 중) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태는 N/A (장보기 리스트 자체는 slice 09/10a에서 처리, 완료 버튼 자체는 리스트 존재 전제) <!-- omo:id=accept-empty-na;stage=4;scope=frontend;review=6 -->
- [ ] error 상태가 있다 (완료 API 호출 실패 시) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (401 시) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=6 -->
- [ ] conflict 처리 흐름이 있다 (409 시, 완료 후 수정 시도) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 타인 리소스를 완료할 수 없다 (403) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [ ] 존재하지 않는 리스트 완료 시 404 반환 <!-- omo:id=accept-not-found;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [ ] 완료 API 호출 시 소유자 검증이 동작한다 (`shopping_lists.user_id = 요청 user_id`) <!-- omo:id=accept-owner-verification;stage=2;scope=backend;review=3,6 -->
- [ ] 완료 후 체크 토글 시도 시 409 CONFLICT 반환 <!-- omo:id=accept-check-after-complete-409;stage=2;scope=backend;review=3,6 -->
- [ ] 완료 후 제외 토글 시도 시 409 CONFLICT 반환 <!-- omo:id=accept-exclude-after-complete-409;stage=2;scope=backend;review=3,6 -->
- [ ] 완료 후 순서 변경 시도 시 409 CONFLICT 반환 <!-- omo:id=accept-reorder-after-complete-409;stage=2;scope=backend;review=3,6 -->
- [ ] 독립 요리 상태 전이와 섞이지 않는다 (`meals.shopping_list_id` 존재하는 식사만 전이) <!-- omo:id=accept-no-standalone-mix;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [ ] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (로그인 유저, 미완료/완료 리스트, 식사, 아이템) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 (`shopping_lists`, `meals`, `shopping_list_items`) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 (`meal_plan_columns`, `recipe_books`) <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: Codex / Claude
- environment: `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
- scenarios:
  1. 브라우저에서 장보기 상세 → [장보기 완료] 클릭 → 성공 메시지 확인
  2. 플래너 위클리 → 연결된 식사 상태가 `shopping_done`으로 전이 확인
  3. 장보기 상세 재진입 → [장보기 완료] 버튼 숨김, 체크/제외/순서 변경 컨트롤 비활성화 확인
  4. 완료된 리스트에서 체크 토글 시도 → 409 CONFLICT 에러 메시지 확인
  5. 완료 API 재호출 (브라우저 dev tools 또는 Postman) → 200 + 동일 결과 반환 (멱등성) 확인

## Automation Split

### Vitest
- [ ] 완료 API 로직 / 상태 전이 / 멱등성 테스트가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=backend;review=3,6 -->
- [ ] 소유자 검증 / 403/404 에러 시나리오가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-auth-errors;stage=2;scope=backend;review=3,6 -->
- [ ] 완료 후 read-only 정책(409 CONFLICT)이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-read-only;stage=2;scope=backend;review=3,6 -->

### Playwright
- [ ] 실제 사용자 흐름 (장보기 완료 → 플래너 상태 전이 확인)이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 완료 후 read-only UI (버튼 숨김, 컨트롤 비활성화)가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-read-only-ui;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] 자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다 (이 슬라이스는 Manual Only 항목 없음)
