# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] 검색창에 키워드 입력 → 레시피 검색 결과 표시 <!-- omo:id=accept-search-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 검색 결과에서 레시피 선택 → 계획 인분 입력 모달 표시 <!-- omo:id=accept-recipe-select;stage=4;scope=frontend;review=5,6 -->
- [x] 인분 입력 후 [추가] → Meal 생성 → MEAL_SCREEN 복귀 <!-- omo:id=accept-meal-create;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] GET /recipes 검색 파라미터가 올바르게 전달된다 <!-- omo:id=accept-search-params;stage=2;scope=backend;review=3,6 -->
- [x] POST /meals request body가 Backend First Contract와 일치한다 <!-- omo:id=accept-post-meals-contract;stage=2;scope=shared;review=3,6 -->

## State / Policy
- [x] Meal 생성 시 status='registered'로 고정된다 <!-- omo:id=accept-meal-status;stage=2;scope=backend;review=3,6 -->
- [x] planned_servings는 양수만 허용된다 (0 이하 → 422) <!-- omo:id=accept-servings-positive;stage=2;scope=backend;review=3,6 -->
- [x] column_id 소유자 검증이 정상 작동한다 <!-- omo:id=accept-column-owner;stage=2;scope=backend;review=3,6 -->
- [x] 검색 결과 없음은 empty 상태로 처리된다 (error 아님) <!-- omo:id=accept-empty-not-error;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [x] loading 상태가 있다 (검색 중, Meal 생성 중) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (검색 결과 없음) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (네트워크 오류, 서버 오류) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (로그인 게이트 + return-to-action) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 401: 비로그인 상태에서 POST /meals 호출 시 올바른 응답 <!-- omo:id=accept-401-response;stage=2;scope=backend;review=3,6 -->
- [x] 403: column_id 소유자 불일치 시 올바른 응답 <!-- omo:id=accept-403-response;stage=2;scope=backend;review=3,6 -->
- [x] 404: recipe_id 또는 column_id 미존재 시 올바른 응답 <!-- omo:id=accept-404-response;stage=2;scope=backend;review=3,6 -->
- [x] 422: planned_servings 음수/0 시 올바른 응답 <!-- omo:id=accept-422-response;stage=2;scope=backend;review=3,6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인의 column_id에 Meal을 생성할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 미존재 recipe_id로 Meal 생성 시 404 응답 <!-- omo:id=accept-invalid-recipe;stage=2;scope=backend;review=3,6 -->
- [x] 미존재 column_id로 Meal 생성 시 404 응답 <!-- omo:id=accept-invalid-column;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] meal_plan_columns 시스템 row 자동 생성이 확인되었다 (아침/점심/저녁) <!-- omo:id=accept-column-bootstrap;stage=2;scope=shared;review=3,6 -->
- [x] recipes 테이블에 검색 테스트용 샘플이 최소 5개 준비되었다 <!-- omo:id=accept-recipe-samples;stage=2;scope=shared;review=3,6 -->

## UI/UX Behavior
- [x] MENU_ADD 진입 시 검색창이 상단에 표시된다 <!-- omo:id=accept-search-top;stage=4;scope=frontend;review=5,6 -->
- [x] Out of Scope 버튼(유튜브/레시피북/남은요리/팬트리/직접등록)은 비활성 또는 "준비 중" 표시 <!-- omo:id=accept-placeholder-buttons;stage=4;scope=frontend;review=5,6 -->
- [x] 레시피 선택 후 인분 입력 모달에서 취소 시 검색 결과로 복귀 <!-- omo:id=accept-cancel-servings;stage=4;scope=frontend;review=5,6 -->
- [x] Meal 생성 성공 후 MEAL_SCREEN으로 복귀 <!-- omo:id=accept-return-meal-screen;stage=4;scope=frontend;review=5,6 -->
- [x] 검색 결과 커서 페이지네이션이 정상 작동한다 <!-- omo:id=accept-pagination;stage=4;scope=frontend;review=5,6 -->

## Manual QA
- verifier: (Stage 4 이후 기록)
- environment: (로컬 / 데모)
- scenarios:
  1. 비로그인 상태에서 MENU_ADD 진입 시도 → 로그인 게이트 표시 → 로그인 후 MENU_ADD 복귀 확인
  2. 검색창에 "김치" 입력 → 검색 결과 리스트 표시 확인
  3. 검색 결과 없는 키워드 입력 → empty 상태 표시 확인
  4. 레시피 선택 → 인분 입력 모달 표시 → 인분 입력 후 [추가] → MEAL_SCREEN에 새 식사 카드 표시 확인
  5. 인분 입력 모달에서 취소 → 검색 결과로 복귀 확인

## Automation Split

### Vitest
- [x] GET /recipes 검색 파라미터 전달 로직 테스트 <!-- omo:id=accept-vitest-search-logic;stage=2;scope=shared;review=3,6 -->
- [x] POST /meals request body 생성 로직 테스트 <!-- omo:id=accept-vitest-post-logic;stage=2;scope=shared;review=3,6 -->
- [x] planned_servings 양수 검증 로직 테스트 <!-- omo:id=accept-vitest-servings-validation;stage=2;scope=backend;review=3,6 -->
- [x] column_id 소유자 검증 로직 테스트 <!-- omo:id=accept-vitest-owner-validation;stage=2;scope=backend;review=3,6 -->

### Playwright
- [x] MENU_ADD 진입 → 검색 → 레시피 선택 → 인분 입력 → Meal 생성 → MEAL_SCREEN 복귀 흐름 <!-- omo:id=accept-playwright-e2e;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 상태 로그인 게이트 + return-to-action 흐름 <!-- omo:id=accept-playwright-auth-gate;stage=4;scope=frontend;review=5,6 -->
- [x] 검색 결과 없음 empty 상태 표시 확인 <!-- omo:id=accept-playwright-empty;stage=4;scope=frontend;review=5,6 -->
- [x] 인분 입력 모달 취소 → 검색 결과 복귀 확인 <!-- omo:id=accept-playwright-cancel;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 로그인 후 MENU_ADD return-to-action (자동화 불가)
- [ ] 실제 Supabase 환경에서 column_id 소유자 검증 (운영 의존)
