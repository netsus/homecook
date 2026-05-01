# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Happy Path

- [x] 레시피명, 기본 인분 입력 → 재료 추가 (정량/비정량) → 스텝 추가 (조리방법 선택) → [저장] → 레시피 생성 성공 <!-- omo:id=18-accept-happy-create-flow;stage=4;scope=frontend;review=5,6 -->
- [x] `POST /recipes` 응답이 `{ success: true, data: { id, title, source_type: 'manual', ... }, error: null }` 형식 <!-- omo:id=18-accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 타입과 프론트 타입 일치 (request/response/error 형식) <!-- omo:id=18-accept-types-match;stage=4;scope=shared;review=6 -->
- [x] 등록 완료 후 my_added 가상 책 반영 확인 (MYPAGE → my_added 진입 → 방금 등록한 레시피 존재, recipes.created_by + source_type='manual' 조건) <!-- omo:id=18-accept-my-added-virtual-book-reflection;stage=4;scope=frontend;review=6 -->

## State / Policy

- [x] `ingredient_type='QUANT'` 재료는 `amount > 0`, `unit` 필수 <!-- omo:id=18-accept-quant-validation;stage=2;scope=backend;review=3,6 -->
- [x] `ingredient_type='TO_TASTE'` 재료는 `amount=null`, `unit=null`, `scalable=false` 고정 <!-- omo:id=18-accept-to-taste-validation;stage=2;scope=backend;review=3,6 -->
- [x] 조리방법 ID는 존재하는 조리방법이어야 함 (부재 시 422) <!-- omo:id=18-accept-cooking-method-exists;stage=2;scope=backend;review=3,6 -->
- [x] step_number는 1부터 시작, 중복 불가 <!-- omo:id=18-accept-step-number-unique;stage=2;scope=backend;review=3,6 -->
- [x] 등록 시 `source_type='manual'`, `created_by=current_user.id` 자동 설정 <!-- omo:id=18-accept-source-type-owner;stage=2;scope=backend;review=3,6 -->
- [x] my_added 가상 책은 `recipes.created_by + source_type IN ('youtube','manual')` 조건으로 구현, `recipe_book_items` INSERT 없음 <!-- omo:id=18-accept-my-added-virtual-book;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] 비로그인 시 `POST /recipes` 호출 → `401 Unauthorized` <!-- omo:id=18-accept-unauthorized;stage=2;scope=backend;review=3,6 -->
- [x] 필수 필드 누락 시 `422 Validation Error` + fields 상세 반환 <!-- omo:id=18-accept-validation-error-fields;stage=2;scope=backend;review=3,6 -->
- [x] 조리방법 ID 부재 시 `422 Validation Error` + "조리방법을 선택해주세요" 메시지 <!-- omo:id=18-accept-cooking-method-missing;stage=2;scope=backend;review=3,6 -->
- [x] `base_servings < 1` 시 `422 Validation Error` <!-- omo:id=18-accept-base-servings-min;stage=2;scope=backend;review=3,6 -->
- [x] 재료 타입별 제약 위반 시 `422 Validation Error` (QUANT인데 amount 없음, TO_TASTE인데 amount 있음 등) <!-- omo:id=18-accept-ingredient-type-constraint;stage=2;scope=backend;review=3,6 -->
- [x] UI에서 `loading` 상태 존재 (레시피 등록 중) <!-- omo:id=18-accept-loading-ui;stage=4;scope=frontend;review=5,6 -->
- [x] UI에서 `error` 상태 존재 (등록 실패 시 에러 안내 + [다시 시도]) <!-- omo:id=18-accept-error-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 시 로그인 게이트 → 로그인 후 등록 폼 자동 복귀 (return-to-action) <!-- omo:id=18-accept-login-gate-return;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 재료명은 `ingredient_id` 필수이며 실제 존재하는 재료여야 함 <!-- omo:id=18-accept-ingredient-exists;stage=2;scope=backend;review=3,6 -->
- [x] 동일 레시피에서 재료 `sort_order` 중복 없음 <!-- omo:id=18-accept-ingredient-sort-unique;stage=2;scope=backend;review=3,6 -->
- [x] 동일 레시피에서 스텝 `step_number` 중복 없음 <!-- omo:id=18-accept-step-number-unique-db;stage=2;scope=backend;review=3,6 -->
- [x] `display_text`는 사용자 입력 원문 보존 (예: "김치 200g", "소금 약간") <!-- omo:id=18-accept-display-text-preserve;stage=2;scope=backend;review=3,6 -->
- [x] `ingredients_used` jsonb는 유효한 형식 (ingredient_id, amount, unit, cut_size 등) <!-- omo:id=18-accept-ingredients-used-format;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture에 조리방법 seed 8종 존재 (stir_fry, boil, deep_fry, steam, grill, blanch, mix, prep) <!-- omo:id=18-accept-fixture-cooking-methods;stage=2;scope=backend;review=3,6 -->
- [x] real DB smoke에 조리방법 seed 투입 확인 (`GET /cooking-methods` 응답에 8종 존재) <!-- omo:id=18-accept-real-cooking-methods;stage=2;scope=backend;review=3,6 -->
- [x] 회원가입 시 my_added 시스템 책 row 자동 생성 확인 (bootstrap — MYPAGE 레시피북 목록용, membership은 recipes.created_by로 결정) <!-- omo:id=18-accept-bootstrap-my-added-row;stage=2;scope=backend;review=3,6 -->
- [x] fixture에 재료 마스터 최소 10종 이상 존재 <!-- omo:id=18-accept-fixture-ingredients;stage=2;scope=backend;review=3,6 -->
- [x] 회원가입 시 meal_plan_columns 4개 자동 생성 확인 (아침/점심/간식/저녁) <!-- omo:id=18-accept-bootstrap-columns;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: Codex Stage 4/5/6 closeout
- environment: local Playwright fixtures (`http://127.0.0.1:3100`), local visual authority capture (`http://127.0.0.1:3140`), local Supabase smoke (`http://127.0.0.1:3128`), demo smoke (`http://127.0.0.1:3130`)
- evidence:
  - `pnpm verify:frontend`
  - `pnpm exec playwright test tests/e2e/slice-18-manual-recipe-create.spec.ts --project=desktop-chrome`
  - `.artifacts/qa/18-manual-recipe-create/2026-05-01T15-34-55-530Z/exploratory-report.json`
  - `.artifacts/qa/18-manual-recipe-create/2026-05-01T15-34-55-530Z/eval-result.json`
  - `ui/designs/authority/MANUAL_RECIPE_CREATE-authority.md`
  - `.omx/artifacts/stage5-design-review-18-manual-recipe-create-20260501T150821Z.md`
  - `.omx/artifacts/claude-delegate-18-manual-recipe-create-final-authority-gate-response-2026-05-01T15-08-41Z.md`
- scenarios:
  - 레시피명 "직접 레시피" + 기본 인분 2 → 재료 3개 추가 (정량 2개, 비정량 1개) → 스텝 3개 추가 (조리방법 각각 다르게) → [저장] → my_added 확인
  - 등록 후 "끼니에 추가" → 계획 인분 입력 → MEAL_SCREEN 복귀 → 식사 존재 확인
  - 등록 후 "레시피 상세로 이동" → RECIPE_DETAIL 진입 → 플래너 추가 가능 확인
  - 비로그인 상태에서 [저장] → 로그인 게이트 → 로그인 후 등록 폼 자동 복귀 확인
  - 플래너 문맥 없이 등록 후 "끼니에 추가" → 사용자 오류 안내 표시, `POST /api/v1/meals` 미호출 확인

## Automation Split

### Vitest

- [x] 재료 타입별 validation 로직 (QUANT vs TO_TASTE) <!-- omo:id=18-vitest-ingredient-validation;stage=2;scope=backend;review=3,6 -->
- [x] 스텝 번호 중복 검증 로직 <!-- omo:id=18-vitest-step-number-unique;stage=2;scope=backend;review=3,6 -->
- [x] base_servings 최소값 검증 로직 <!-- omo:id=18-vitest-base-servings-min;stage=2;scope=backend;review=3,6 -->
- [x] my_added 가상 책 반영 로직 (recipes.created_by 설정, recipe_book_items INSERT 없음) <!-- omo:id=18-vitest-my-added-virtual-book-reflection;stage=2;scope=backend;review=3,6 -->

### Playwright

- [x] 레시피 등록 happy path (레시피명 입력 → 재료 추가 → 스텝 추가 → [저장] → 성공) <!-- omo:id=18-playwright-happy-create;stage=4;scope=frontend;review=5,6 -->
- [x] 등록 후 끼니 추가 flow (등록 → "끼니에 추가" → 계획 인분 입력 → MEAL_SCREEN 복귀) <!-- omo:id=18-playwright-post-create-meal;stage=4;scope=frontend;review=5,6 -->
- [x] 등록 후 상세 이동 flow (등록 → "레시피 상세로 이동" → RECIPE_DETAIL 진입) <!-- omo:id=18-playwright-post-create-detail;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 + return-to-action (비로그인 [저장] → 로그인 → 등록 폼 복귀) <!-- omo:id=18-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] my_added 가상 책 반영 확인 (MYPAGE → my_added → 방금 등록한 레시피 존재, recipes.created_by 조건) <!-- omo:id=18-playwright-my-added-virtual-book-check;stage=4;scope=frontend;review=5,6 -->
- [x] 플래너 문맥 누락 시 끼니 추가 차단과 오류 안내 표시 <!-- omo:id=18-playwright-missing-context-meal-guard;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 조리방법 색상 시각 구분 확인 (COOK_MODE에서 각 조리방법 색상이 올바르게 표시되는지 — 요리 세션 전체 flow는 15a/15b 범위, 시각 확인은 수동)
- [ ] 재료 검색 동의어 매칭 확인 (재료 마스터 + 동의어 테이블 실제 운영 데이터 의존)
