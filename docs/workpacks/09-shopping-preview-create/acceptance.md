# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] 플래너 상단 "장보기" 버튼 클릭 → SHOPPING_FLOW 진입 <!-- omo:id=accept-happy-planner-to-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] GET /shopping/preview 호출 → eligible_meals 목록 표시 <!-- omo:id=accept-happy-preview;stage=2;scope=backend;review=3,6 -->
- [ ] eligible_meals가 자동 선택되어 화면에 노출됨 <!-- omo:id=accept-happy-auto-select;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피별 장보기 기준 인분 조정 (+, - 버튼) <!-- omo:id=accept-happy-servings-adjust;stage=4;scope=frontend;review=5,6 -->
- [ ] [장보기 목록 만들기] 클릭 → POST /shopping/lists 호출 <!-- omo:id=accept-happy-create;stage=2;scope=backend;review=3,6 -->
- [ ] 생성 성공 후 SHOPPING_DETAIL로 자동 이동 (응답 id 사용) <!-- omo:id=accept-happy-navigate;stage=4;scope=frontend;review=5,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [ ] eligible_meals는 status='registered' AND shopping_list_id IS NULL만 포함 <!-- omo:id=accept-state-eligible-filter;stage=2;scope=backend;review=3,6 -->
- [ ] POST /shopping/lists 시 대상 meals.shopping_list_id UPDATE됨 <!-- omo:id=accept-state-list-id-update;stage=2;scope=backend;review=3,6 -->
- [ ] POST /shopping/lists 후 meals.status는 registered 유지 (shopping_done 전이 안 함) <!-- omo:id=accept-state-status-unchanged;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_lists.is_completed=false로 생성 <!-- omo:id=accept-state-incomplete;stage=2;scope=backend;review=3,6 -->
- [ ] 재료 합산 시 변환 가능 단위는 변환 후 합산 <!-- omo:id=accept-policy-unit-conversion;stage=2;scope=backend;review=3,6 -->
- [ ] 재료 합산 시 변환 불가 단위는 복합 표기 (예: "양파 2개 + 200g") <!-- omo:id=accept-policy-unit-mixed;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_list_items INSERT 시 pantry_items와 매칭되는 재료는 is_pantry_excluded=true 초기값 <!-- omo:id=accept-policy-pantry-exclude;stage=2;scope=backend;review=3,6 -->
- [ ] 생성 버튼 중복 클릭 방지 (loading 상태 또는 disabled 처리) <!-- omo:id=accept-policy-duplicate-click;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [ ] loading 상태: preview 로딩 중, 리스트 생성 중 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태: eligible_meals 빈 배열 → "장보기 대상이 없어요" + [플래너로 돌아가기] <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태: API 호출 실패 → "장보기 목록을 불러오지 못했어요" + [다시 시도] <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리: 401 응답 시 로그인 안내 (플래너 진입 시점에서 이미 게이트 통과했으므로 드물지만 포함) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리: 409 응답 시 "이미 다른 장보기 리스트에 포함된 식사가 있어요" 안내 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] validation error: meal_configs 빈 배열 시 422 → "선택된 식사가 없어요" <!-- omo:id=accept-validation-empty;stage=2;scope=backend;review=3,6 -->
- [ ] validation error: shopping_servings < 1 시 422 → "인분은 1 이상이어야 합니다" <!-- omo:id=accept-validation-servings;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [ ] 타인 meals를 preview에 포함하지 않음 (user_id 필터링) <!-- omo:id=accept-owner-preview;stage=2;scope=backend;review=3,6 -->
- [ ] 타인 meals로 리스트 생성 시도 시 403 <!-- omo:id=accept-owner-create;stage=2;scope=backend;review=3,6 -->
- [ ] status='shopping_done' 또는 'cook_done'인 meals는 preview에서 제외 <!-- omo:id=accept-data-status-filter;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_list_id가 이미 있는 meals는 preview에서 제외 <!-- omo:id=accept-data-list-id-filter;stage=2;scope=backend;review=3,6 -->
- [ ] 무효 meal_id는 무시하고 유효한 것만 처리 (서버 4단계 검증) <!-- omo:id=accept-data-invalid-ignore;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_list_recipes에 각 meal의 recipe_id와 shopping_servings 기록 <!-- omo:id=accept-data-recipes-insert;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_list_items에 sort_order 기본값 설정 (0부터 순차) <!-- omo:id=accept-data-sort-order;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [ ] fixture: 로그인 유저, meals (registered + NULL shopping_list_id), recipes, recipe_ingredients, pantry_items <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke: pnpm dev:demo 또는 local-supabase에서 seed로 baseline 데이터 생성 확인 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] bootstrap: meal_plan_columns × 4, recipe_books × 3이 회원가입 시 자동 생성되는지 확인 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
- [ ] meals, recipes, recipe_ingredients, pantry_items 테이블이 로컬 Supabase에 존재 <!-- omo:id=accept-tables-exist;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: (Stage 4 완료 시 기입)
- environment: (real DB smoke 또는 demo)
- scenarios:
  1. 플래너에 registered meals 3개 등록 → 장보기 버튼 → preview 확인
  2. 인분 조정 후 생성 → 상세로 이동 확인
  3. eligible_meals 없을 때 empty 상태 확인
  4. 이미 묶인 meal이 preview에서 제외되는지 확인

## Automation Split

### Vitest
- [ ] GET /shopping/preview API helper 단위 테스트 <!-- omo:id=accept-vitest-preview-api;stage=2;scope=shared;review=3,6 -->
- [ ] POST /shopping/lists API helper 단위 테스트 <!-- omo:id=accept-vitest-create-api;stage=2;scope=shared;review=3,6 -->
- [ ] eligible_meals 필터링 로직 테스트 (status, shopping_list_id 조건) <!-- omo:id=accept-vitest-filter;stage=2;scope=backend;review=3,6 -->
- [ ] 재료 합산 로직 단위 테스트 (변환 가능/불가 단위) <!-- omo:id=accept-vitest-merge;stage=2;scope=backend;review=3,6 -->
- [ ] pantry 자동 제외 로직 테스트 <!-- omo:id=accept-vitest-pantry-exclude;stage=2;scope=backend;review=3,6 -->
- [ ] shopping_servings 조정 로직 테스트 <!-- omo:id=accept-vitest-servings;stage=4;scope=frontend;review=5,6 -->

### Playwright
- [ ] 플래너 → 장보기 preview → 인분 조정 → 생성 → 상세 이동 E2E <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태 시나리오 (eligible_meals 빈 배열) <!-- omo:id=accept-playwright-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태 시나리오 (API 호출 실패 mock) <!-- omo:id=accept-playwright-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 생성 버튼 중복 클릭 방지 확인 <!-- omo:id=accept-playwright-duplicate-click;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] 실제 Supabase DB에서 seed → 플래너 → 장보기 생성 전체 흐름 수동 확인 (bootstrap, referenced table 검증)
- [ ] 장보기 생성 후 SHOPPING_DETAIL 화면이 정상적으로 로드되는지 확인 (slice 10a 구현 후)
