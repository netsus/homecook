# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] RECIPE_DETAIL에서 [요리하기] 클릭 시 독립 요리 COOK_MODE로 진입한다 <!-- omo:id=accept-happy-standalone-entry;stage=4;scope=frontend;review=5,6 -->
- [x] GET /recipes/{recipe_id}/cook-mode가 servings 기준 스케일링된 재료와 스텝을 반환한다 <!-- omo:id=accept-happy-cook-mode-data;stage=2;scope=backend;review=3,6 -->
- [x] 독립 COOK_MODE에서 좌측 재료 화면에 조리 인분(읽기 전용)과 재료 전체 목록이 표시된다 <!-- omo:id=accept-happy-ingredients-view;stage=4;scope=frontend;review=5,6 -->
- [x] 독립 COOK_MODE에서 우측 과정 화면에 스텝 카드 리스트가 조리방법 색상과 함께 표시된다 <!-- omo:id=accept-happy-steps-view;stage=4;scope=frontend;review=5,6 -->
- [x] 좌우 스와이프로 재료 화면 ↔ 과정 화면 전환이 된다 <!-- omo:id=accept-happy-swipe-navigation;stage=4;scope=frontend;review=5,6 -->
- [x] [요리 완료] 클릭 시 소진 재료 체크리스트 팝업이 표시된다 (기본 체크 해제) <!-- omo:id=accept-happy-consumed-popup;stage=4;scope=frontend;review=5,6 -->
- [x] 소진 재료 확인 후 독립 요리가 완료되고 RECIPE_DETAIL로 복귀한다 <!-- omo:id=accept-happy-complete-and-return;stage=4;scope=frontend;review=5,6 -->
- [x] POST /cooking/standalone-complete 응답에 leftover_dish_id, pantry_removed, cook_count가 포함된다 <!-- omo:id=accept-happy-complete-response;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] 독립 요리 완료 시 leftover_dishes가 INSERT된다 (status='leftover', cooked_at=now()) <!-- omo:id=accept-state-leftover-insert;stage=2;scope=backend;review=3,6 -->
- [x] 독립 요리 완료 시 consumed_ingredient_ids에 해당하는 pantry_items가 DELETE된다 <!-- omo:id=accept-state-pantry-delete;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids가 빈 배열이면 pantry 소진이 없다 <!-- omo:id=accept-state-pantry-empty-consumed;stage=2;scope=backend;review=3,6 -->
- [x] 독립 요리 완료 시 recipes.cook_count가 1 증가한다 <!-- omo:id=accept-state-cook-count-increment;stage=2;scope=backend;review=3,6 -->
- [x] 독립 요리는 meals.status를 변경하지 않는다 <!-- omo:id=accept-state-no-meals-mutation;stage=2;scope=shared;review=3,6 -->
- [x] 독립 요리는 cooking_sessions를 생성하지 않는다 <!-- omo:id=accept-state-no-session-creation;stage=2;scope=shared;review=3,6 -->
- [x] 독립 요리와 플래너 요리의 상태 전이가 섞이지 않는다 <!-- omo:id=accept-state-planner-standalone-separation;stage=2;scope=shared;review=3,6 -->
- [x] COOK_MODE 독립 요리에서 인분 조절 UI가 없다 (읽기 전용) <!-- omo:id=accept-state-servings-readonly;stage=4;scope=frontend;review=5,6 -->
- [x] [취소] 클릭 시 상태 변경 없이 RECIPE_DETAIL로 복귀한다 (세션 없으므로 cancel API 호출 없음) <!-- omo:id=accept-state-cancel-no-api;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [x] loading 상태가 있다 (독립 COOK_MODE 데이터 로딩 중) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (API 오류 시 에러 메시지 + 재시도/RECIPE_DETAIL 복귀) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (cook-mode 조회는 비로그인 가능, standalone-complete는 로그인 필수 → 로그인 유도) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 후 return-to-action이 독립 COOK_MODE로 복귀한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] 레시피 미존재 시 404 대응 (에러 표시 또는 RECIPE_DETAIL 복귀) <!-- omo:id=accept-error-404;stage=4;scope=frontend;review=5,6 -->
- [x] servings <= 0 시 422 대응 <!-- omo:id=accept-error-422-servings;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [x] standalone-complete에서 pantry_items DELETE 시 user_id = current_user.id만 삭제된다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids 중 해당 사용자의 pantry에 없는 ID는 무시된다 <!-- omo:id=accept-invalid-consumed-ignore;stage=2;scope=backend;review=3,6 -->
- [x] standalone-complete 트랜잭션이 원자적이다 (일부만 반영되지 않음) <!-- omo:id=accept-atomic-transaction;stage=2;scope=backend;review=3,6 -->
- [x] leftover_dishes.recipe_id가 요청의 recipe_id와 일치한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [x] leftover_dishes.user_id가 현재 로그인 사용자와 일치한다 <!-- omo:id=accept-leftover-user-id;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 레시피 + recipe_ingredients + ingredients + recipe_steps + pantry_items가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에서 recipes, recipe_ingredients, ingredients, recipe_steps, pantry_items, leftover_dishes 테이블이 존재한다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에서 complete_standalone_cooking RPC function이 존재한다 <!-- omo:id=accept-real-db-rpc-ready;stage=2;scope=backend;review=3,6 -->
- [x] cooking_methods, ingredients 시스템 row가 이미 준비된 owning flow가 확인되었다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: agent or human
- environment: fixture + local Supabase
- scenarios:
  - RECIPE_DETAIL에서 [요리하기] → 독립 COOK_MODE 진입 → 재료/스텝 확인 → [요리 완료] → 소진 체크리스트 → 완료 → RECIPE_DETAIL 복귀
  - 비로그인 상태에서 COOK_MODE 진입 가능 확인 → [요리 완료] → 로그인 게이트 → return-to-action 복귀 → 완료
  - 소진 재료 0개 체크 → 완료 시 pantry 변동 없음 확인
  - 소진 재료 전체 체크 → pantry에서 해당 재료 제거 확인
  - [취소] 클릭 → 상태 변경 없이 RECIPE_DETAIL 복귀 확인
  - 요리 완료 후 leftover_dishes에 row 생성 확인
  - 요리 완료 후 recipes.cook_count 증가 확인
  - 미존재 레시피 ID로 진입 시도 → 적절한 에러 대응 확인

## Automation Split

### Vitest
- [x] GET /recipes/{recipe_id}/cook-mode 핸들러: 레시피 데이터 조회, servings 스케일링, 404/422 에러 <!-- omo:id=accept-vitest-cook-mode-handler;stage=2;scope=backend;review=3,6 -->
- [x] POST /cooking/standalone-complete 핸들러: leftover INSERT, pantry DELETE, cook_count 증가, 401/404/422 에러 <!-- omo:id=accept-vitest-standalone-complete-handler;stage=2;scope=backend;review=3,6 -->
- [x] consumed_ingredient_ids 빈 배열 시 pantry 변동 없음 <!-- omo:id=accept-vitest-empty-consumed;stage=2;scope=backend;review=3,6 -->
- [x] 트랜잭션 원자성: 부분 실패 시 전체 롤백 <!-- omo:id=accept-vitest-transaction-atomicity;stage=2;scope=backend;review=3,6 -->
- [x] standalone complete RPC migration이 planner session/meals side effect 없이 추가된다 <!-- omo:id=accept-vitest-rpc-migration;stage=2;scope=backend;review=3,6 -->
- [x] meals.status 변경 없음 검증 <!-- omo:id=accept-vitest-no-meals-mutation;stage=2;scope=backend;review=3,6 -->
- [x] cooking_sessions 생성 없음 검증 <!-- omo:id=accept-vitest-no-session-creation;stage=2;scope=backend;review=3,6 -->
- [x] 프론트 독립 COOK_MODE 상태 전이 로직 (데이터 로딩 → 요리 중 → 완료 처리 → 복귀) <!-- omo:id=accept-vitest-frontend-state;stage=4;scope=frontend;review=5,6 -->
- [x] 소진 재료 체크리스트 팝업 동작 (15a 컴포넌트 재사용 검증) <!-- omo:id=accept-vitest-consumed-popup;stage=4;scope=frontend;review=5,6 -->
- [x] duplicate-submit guard 동작 확인 <!-- omo:id=accept-vitest-duplicate-submit-guard;stage=4;scope=frontend;review=5,6 -->

### Playwright
- [x] RECIPE_DETAIL → [요리하기] → 독립 COOK_MODE 진입 → 재료/스텝 표시 → [요리 완료] → 소진 팝업 → 완료 → RECIPE_DETAIL 복귀 <!-- omo:id=accept-playwright-happy-flow;stage=4;scope=frontend;review=5,6 -->
- [x] [취소] → 상태 변경 없이 RECIPE_DETAIL 복귀 <!-- omo:id=accept-playwright-cancel;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 시 [요리 완료] → 로그인 게이트 + return-to-action <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] 좌우 스와이프 재료 ↔ 과정 전환 <!-- omo:id=accept-playwright-swipe;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 로그인 후 독립 COOK_MODE 진입 및 요리 완료 (실제 소셜 로그인 환경)
- [ ] 실제 전체 경로: RECIPE_DETAIL → 독립 COOK_MODE → 완료 → RECIPE_DETAIL 복귀 → leftover 확인 (end-to-end)
- [ ] 모바일 기기에서 전체화면 몰입형 모드 동작 확인 (화면 꺼짐 방지는 17c)
