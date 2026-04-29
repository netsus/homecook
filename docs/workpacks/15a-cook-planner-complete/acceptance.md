# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] COOK_MODE 진입 시 세션 기반 레시피 재료와 스텝이 표시된다 <!-- omo:id=accept-happy-cook-mode-render;stage=4;scope=frontend;review=5,6 -->
- [ ] 좌측 재료 화면에 조리 인분(읽기 전용)과 재료 전체 목록이 표시된다 <!-- omo:id=accept-happy-ingredients-view;stage=4;scope=frontend;review=5,6 -->
- [ ] 우측 과정 화면에 스텝 카드 리스트가 조리방법 색상과 함께 표시된다 <!-- omo:id=accept-happy-steps-view;stage=4;scope=frontend;review=5,6 -->
- [ ] 좌우 스와이프로 재료 화면 ↔ 과정 화면 전환이 된다 <!-- omo:id=accept-happy-swipe-navigation;stage=4;scope=frontend;review=5,6 -->
- [ ] [요리 완료] 클릭 시 소진 재료 체크리스트 팝업이 표시된다 (기본 체크 해제) <!-- omo:id=accept-happy-consumed-popup;stage=4;scope=frontend;review=5,6 -->
- [ ] 소진 재료 확인 후 세션이 완료되고 COOK_READY_LIST로 복귀한다 <!-- omo:id=accept-happy-complete-and-return;stage=4;scope=frontend;review=5,6 -->
- [x] POST /cooking/sessions/{id}/complete 응답에 session_id, status='completed', meals_updated, leftover_dish_id, pantry_removed, cook_count가 포함된다 <!-- omo:id=accept-happy-complete-response;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] 요리 완료 시 cooking_sessions.status가 'completed'로 전이된다 <!-- omo:id=accept-state-session-completed;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 cooking_sessions.completed_at이 설정된다 <!-- omo:id=accept-state-session-completed-at;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 cooking_session_meals.is_cooked가 true로 전이된다 <!-- omo:id=accept-state-csm-cooked;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 cooking_session_meals.cooked_at이 설정된다 <!-- omo:id=accept-state-csm-cooked-at;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 해당 meals.status가 'shopping_done' → 'cook_done'으로 전이된다 <!-- omo:id=accept-state-meals-cook-done;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 meals.cooked_at이 설정된다 <!-- omo:id=accept-state-meals-cooked-at;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 leftover_dishes가 INSERT된다 (status='leftover') <!-- omo:id=accept-state-leftover-insert;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 consumed_ingredient_ids에 해당하는 pantry_items가 DELETE된다 <!-- omo:id=accept-state-pantry-delete;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids가 빈 배열이면 pantry 소진이 없다 <!-- omo:id=accept-state-pantry-empty-consumed;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 시 recipes.cook_count가 1 증가한다 <!-- omo:id=accept-state-cook-count-increment;stage=2;scope=backend;review=3,6 -->
- [x] complete 멱등성: 이미 completed인 세션에 complete 시 200 + 동일 결과 <!-- omo:id=accept-state-complete-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] cancelled 세션에 complete 시 409 반환 <!-- omo:id=accept-state-complete-cancelled-conflict;stage=2;scope=backend;review=3,6 -->
- [ ] cancel 멱등성: 이미 cancelled인 세션에 cancel 시 200 + 동일 결과 (14 BE 사용) <!-- omo:id=accept-state-cancel-idempotent;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE에서 인분 조절 UI가 없다 (읽기 전용) <!-- omo:id=accept-state-servings-readonly;stage=4;scope=frontend;review=5,6 -->
- [x] 독립 요리(meals.status 변경 없음)와 플래너 요리의 상태 전이가 섞이지 않는다 <!-- omo:id=accept-state-planner-standalone-separation;stage=2;scope=shared;review=3,6 -->

## Error / Permission
- [ ] loading 상태가 있다 (COOK_MODE 데이터 로딩 중) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (API 오류 시 에러 메시지 + 재시도/복귀) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (플래너 경유 COOK_MODE는 데이터 조회/취소/완료 모두 로그인 필수, 비로그인 시 로그인 유도) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리 흐름이 있다 (cancelled 세션 complete 시 409 대응) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 게이트 후 return-to-action이 COOK_MODE로 복귀한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] 세션 미존재 시 404 대응 (이전 화면 복귀 또는 에러 표시) <!-- omo:id=accept-error-404;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인 세션을 완료/취소할 수 없다 (403) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids 중 해당 사용자의 pantry에 없는 ID는 무시된다 <!-- omo:id=accept-invalid-consumed-ignore;stage=2;scope=backend;review=3,6 -->
- [x] 요리 완료 트랜잭션이 원자적이다 (일부만 반영되지 않음) <!-- omo:id=accept-atomic-transaction;stage=2;scope=backend;review=3,6 -->
- [x] leftover_dishes.recipe_id가 세션의 recipe_id와 일치한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] `leftover_dishes` 스키마 migration이 적용되었다: `leftover_dish_status_type` enum, `public.leftover_dishes` 테이블(공식 DB §9-1), 인덱스 `(user_id, status, cooked_at DESC)`, RLS/policies/grants, `meals.leftover_dish_id` FK가 모두 존재한다 <!-- omo:id=accept-schema-leftover-dishes;stage=2;scope=backend;review=3,6 -->
- [x] fixture / mock에서 in_progress 세션 + shopping_done meals + pantry_items가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에서 cooking_sessions, cooking_session_meals, meals, pantry_items, leftover_dishes 테이블이 존재한다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] meal_plan_columns, cooking_methods, ingredients 시스템 row가 이미 준비된 owning flow가 확인되었다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: agent or human
- environment: fixture + local Supabase
- scenarios:
  - COOK_READY_LIST에서 [요리하기] → COOK_MODE 진입 → 재료/스텝 확인 → [요리 완료] → 소진 체크리스트 → 완료 → COOK_READY_LIST 복귀
  - COOK_MODE에서 [취소] → 세션 cancelled → COOK_READY_LIST 복귀
  - 소진 재료 0개 체크 → 완료 시 pantry 변동 없음 확인
  - 소진 재료 전체 체크 → pantry에서 해당 재료 제거 확인
  - 이미 completed 세션에 진입 시도 → 적절한 대응 확인
  - 비로그인 상태에서 [요리 완료] → 로그인 게이트 → return-to-action 복귀 확인
  - 요리 완료 후 COOK_READY_LIST에서 완료된 레시피가 사라지는지 확인
  - 요리 완료 후 planner에서 해당 meals.status가 cook_done인지 확인

## Automation Split

### Vitest
- [x] POST /cooking/sessions/{id}/complete 핸들러: 완료, 상태 전이(session/csm/meals), leftover INSERT, pantry DELETE, cook_count 증가 <!-- omo:id=accept-vitest-complete-handler;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions/{id}/complete 멱등성: 이미 completed 시 200 + 동일 결과 <!-- omo:id=accept-vitest-complete-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/sessions/{id}/complete 에러: cancelled 409, 타인 403, 미존재 404, 비로그인 401 <!-- omo:id=accept-vitest-complete-errors;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids 빈 배열 시 pantry 변동 없음 <!-- omo:id=accept-vitest-empty-consumed;stage=2;scope=backend;review=3,6 -->
- [x] 트랜잭션 원자성: 부분 실패 시 전체 롤백 <!-- omo:id=accept-vitest-transaction-atomicity;stage=2;scope=backend;review=3,6 -->
- [ ] 프론트 COOK_MODE 상태 전이 로직 (데이터 로딩 → 요리 중 → 완료 처리 → 복귀) <!-- omo:id=accept-vitest-frontend-state;stage=4;scope=frontend;review=5,6 -->
- [ ] 소진 재료 체크리스트 팝업 동작 (기본 해제, 선택, 제출) <!-- omo:id=accept-vitest-consumed-popup;stage=4;scope=frontend;review=5,6 -->

### Playwright
- [ ] COOK_MODE 진입 → 재료/스텝 표시 → [요리 완료] → 소진 팝업 → 완료 → COOK_READY_LIST 복귀 <!-- omo:id=accept-playwright-happy-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE에서 [취소] → cancelled → COOK_READY_LIST 복귀 <!-- omo:id=accept-playwright-cancel;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 시 [요리 완료] → 로그인 게이트 + return-to-action <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 좌우 스와이프 재료 ↔ 과정 전환 <!-- omo:id=accept-playwright-swipe;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 로그인 후 COOK_MODE 진입 및 요리 완료 (실제 소셜 로그인 환경)
- [ ] 실제 전체 경로: planner → shopping 완료 → COOK_READY_LIST → COOK_MODE → 완료 → planner 복귀 확인 (end-to-end cross-slice)
- [ ] 모바일 기기에서 전체화면 몰입형 모드 동작 확인 (화면 꺼짐 방지는 17c)
