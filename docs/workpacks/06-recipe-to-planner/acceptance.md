# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Happy Path
- [x] 로그인한 사용자가 `RECIPE_DETAIL`에서 planner add 바텀시트를 열고 날짜/끼니/계획 인분을 선택해 Meal을 생성한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] 생성된 Meal이 `PLANNER_WEEK`의 목표 날짜/끼니 슬롯에 `registered` 상태로 보인다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] 새 Meal이 `status='registered'`, `is_leftover=false`, `leftover_dish_id=null`로 생성된다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스가 기존 `shopping_done` / `cook_done` / read-only 정책을 우회하지 않는다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 제출 중 재탭 또는 중복 submit으로 사용자의 1회 액션이 중복 Meal 생성으로 이어지지 않는다 <!-- omo:id=accept-idempotency;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [x] loading 상태가 있다 (planner add submit pending, 필요 시 planner refetch pending) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (`PLANNER_WEEK`의 빈 주간/빈 슬롯 표현 재사용) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
  - N/A for slice06: empty slot rendering is slice05 baseline behavior; slice06 adds no new empty state UI.
- [x] error 상태가 있다 (`POST /meals` 실패 시 안내 및 재시도) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 planner add → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름 또는 명시적 N/A 근거가 있다 (`POST /meals`의 문서상 conflict 계약 범위 유지) <!-- omo:id=accept-conflict;stage=4;scope=shared;review=6 -->
  - N/A: README §Backend First Contract 명시: "이번 create path에는 별도 상태 충돌 계약이 없으므로 새로 도입하지 않는다."
- [x] 로그인 게이트 후 return-to-action이 맞다 (planner add 바텀시트 재오픈) <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인 리소스를 수정할 수 없다 (`column_id` 소유자 검증) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부한다 (`plan_date`, `planned_servings`, 필수 필드 검증) <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 파생 필드와 비정규화 값이 맞다 (`status`, `is_leftover`, `leftover_dish_id`) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 planner add baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 `meal_plan_columns`, `meals`, seed, bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성 owning flow와 기대 결과(`meal_plan_columns ×4`, `recipe_books ×3`)가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: Codex (`PR #120` Actual Verification, 2026-04-15)
- environment: local Supabase + `pnpm dev:local-supabase` (127.0.0.1:3100) + local dev auth main account (`local-tester@homecook.local`) after `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
- scenarios:
  1. 게스트 상태에서 `RECIPE_DETAIL` → `[플래너에 추가]` → 로그인 게이트 → 로그인 → planner add 바텀시트 재오픈 확인
  2. 로그인 상태에서 날짜/끼니/인분 선택 후 추가 → 토스트 확인 → `PLANNER_WEEK` 목표 슬롯 반영 확인
  3. 잘못된 입력 또는 실패 응답 시 에러 메시지와 재시도 동작 확인
  4. 작은 모바일 폭에서 planner add 바텀시트와 planner 주간 카드가 잘리지 않는지 확인

## Automation Split

### Vitest
- [x] `POST /meals` route validation / owner guard / canonical slot 검증 범위가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [x] Meal 생성 파생값과 상태 규칙 회귀가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright
- [x] `RECIPE_DETAIL` planner add → 성공 → `PLANNER_WEEK` 확인 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] OAuth / local-supabase / authority evidence처럼 외부/선택 실행 경로와 기본 브라우저 게이트가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->
  - CI tests use mocked routes only; live OAuth path is manual-only (see Manual Only section).

### Manual Only
- [ ] 실제 OAuth 로그인 후 planner add return-to-action 재오픈 동작
- [ ] authority-required evidence 캡처 (`RECIPE_DETAIL` planner add mobile/default+narrow, `PLANNER_WEEK` 5-column mobile density)
