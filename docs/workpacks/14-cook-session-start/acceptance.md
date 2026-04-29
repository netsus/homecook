# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] PLANNER_WEEK에서 [요리하기] 클릭 시 COOK_READY_LIST로 이동한다 <!-- omo:id=accept-happy-planner-to-cookready;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_READY_LIST에 shopping_done 상태 식사가 레시피별로 묶여서 표시된다 <!-- omo:id=accept-happy-recipe-list;stage=4;scope=frontend;review=5,6 -->
- [x] 레시피 카드에 레시피명, 합산 인분, [요리하기] 버튼이 표시된다 <!-- omo:id=accept-happy-card-content;stage=4;scope=frontend;review=5,6 -->
- [x] [요리하기] 클릭 시 요리 세션이 생성되고 COOK_MODE route로 이동한다 <!-- omo:id=accept-happy-session-create;stage=4;scope=frontend;review=5,6 -->
- [x] GET /cooking/ready 응답에 date_range와 recipes 배열이 포함된다 <!-- omo:id=accept-happy-ready-response;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions 응답에 session_id, status='in_progress', meals 배열이 포함된다 <!-- omo:id=accept-happy-session-response;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] GET /cooking/ready가 오늘~마지막 등록일 범위의 shopping_done meals만 반환한다 <!-- omo:id=accept-state-date-range-filter;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions가 meal_ids의 status='shopping_done'을 검증한다 (위반 시 409) <!-- omo:id=accept-state-session-create-status-check;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions가 meal_ids의 recipe_id 일치를 검증한다 (위반 시 422) <!-- omo:id=accept-state-session-create-recipe-check;stage=2;scope=backend;review=3,6 -->
- [x] cooking_session_meals가 세션 생성 시점의 스냅샷으로 INSERT된다 <!-- omo:id=accept-state-snapshot-insert;stage=2;scope=backend;review=3,6 -->
- [x] meals.status는 이 슬라이스에서 변경되지 않는다 (read-only) <!-- omo:id=accept-state-meals-readonly;stage=2;scope=shared;review=3,6 -->
- [x] cancel 멱등성: 이미 cancelled인 세션에 cancel 시 200 + 동일 결과 <!-- omo:id=accept-state-cancel-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] completed 세션에 cancel 시 409 반환 <!-- omo:id=accept-state-cancel-completed-conflict;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (shopping_done 없을 때 안내 + PLANNER_WEEK 복귀 유도) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (API 오류 시 에러 메시지 + 재시도) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 시 로그인 유도) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름이 있다 (세션 생성 시 409 대응) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [x] 로그인 게이트 후 return-to-action이 COOK_READY_LIST로 복귀한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인 리소스를 수정할 수 없다 (meal 소유자 검증 403) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부한다 (빈 meal_ids 422, cooking_servings<=0 422) <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] cooking_session_meals의 recipe_id가 meal의 recipe_id와 일치한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 shopping_done meals + 다양 레시피 조합이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에서 cooking_sessions, cooking_session_meals 테이블이 존재한다 (migration 적용) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] meal_plan_columns 시스템 row가 회원가입 시 자동 생성되는 owning flow가 확인되었다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: agent or human
- environment: fixture + local Supabase
- scenarios:
  - PLANNER_WEEK에서 [요리하기] 클릭 → COOK_READY_LIST 진입 → 레시피 리스트 확인
  - 레시피 [요리하기] 클릭 → 세션 생성 확인 → COOK_MODE route 이동 확인
  - 빈 상태 (shopping_done 없음) → empty UI 표시 확인
  - 비로그인 → 로그인 게이트 → return-to-action 복귀 확인
  - 세션 취소 API 호출 → cancelled 상태 확인 (백엔드 API 테스트, cancel UI는 15a COOK_MODE에서 구현)
  - 동일 세션 취소 API 2회 → 멱등 확인 (백엔드 API 테스트)

## Automation Split

### Vitest
- [x] GET /cooking/ready 핸들러: 날짜 범위 필터, 레시피별 합산, 소유자 검증 <!-- omo:id=accept-vitest-ready-handler;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions 핸들러: 생성, 검증(소유자/상태/레시피 일치), 스냅샷 INSERT <!-- omo:id=accept-vitest-session-create;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions/{id}/cancel 핸들러: 취소, 멱등성, completed 거부 <!-- omo:id=accept-vitest-session-cancel;stage=2;scope=backend;review=3,6 -->
- [x] GET /cooking/sessions/{id}/cook-mode 핸들러: 세션 기반 조회, 소유자 검증 <!-- omo:id=accept-vitest-cook-mode;stage=2;scope=backend;review=3,6 -->
- [x] 프론트 상태 전이 로직 (세션 생성 후 COOK_MODE route 이동, COOK_READY_LIST 리스트 갱신) <!-- omo:id=accept-vitest-frontend-state;stage=4;scope=frontend;review=5,6 -->

### Playwright
- [x] COOK_READY_LIST 진입 → 레시피 리스트 표시 → 세션 생성 → route 이동 <!-- omo:id=accept-playwright-happy-flow;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태 표시 확인 <!-- omo:id=accept-playwright-empty;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 + return-to-action <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 로그인 후 COOK_READY_LIST 진입 및 세션 생성 (실제 소셜 로그인 환경)
- [ ] 실제 장보기 완료 → COOK_READY_LIST → 세션 생성 → COOK_MODE route 이동 확인 (end-to-end cross-slice, cancel UI는 15a에서 검증)
