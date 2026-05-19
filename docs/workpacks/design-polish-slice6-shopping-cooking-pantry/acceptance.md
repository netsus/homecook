# Acceptance Criteria - design-polish-slice6-shopping-cooking-pantry

## Happy Path

- [ ] MEAL_SCREEN에서 `shopping_done` 식사의 `[요리하기]`를 누르면 선택된 meal 1건만 cooking session에 포함된다 <!-- omo:id=dp6-accept-single-meal-session;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 개별 요리 session create 요청의 `cooking_servings`가 해당 meal의 `planned_servings`와 일치한다 <!-- omo:id=dp6-accept-meal-planned-servings;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE가 session `cooking_servings` 기준 인분과 스케일된 재료를 표시한다 <!-- omo:id=dp6-accept-cook-mode-serving-display;stage=4;scope=shared;review=6 -->
- [ ] COOK_MODE에서 재료가 조리 단계 바로 위 compact list로 보여 한 화면 맥락에서 읽힌다 <!-- omo:id=dp6-accept-ingredient-step-proximity;stage=4;scope=frontend;review=5,6 -->
- [ ] 완료 후 선택된 식사만 `cook_done`으로 전이되고 MEAL_SCREEN으로 복귀한다 <!-- omo:id=dp6-accept-complete-selected-meal-only;stage=4;scope=shared;review=6 -->

## State / Policy

- [ ] `registered` 식사에는 개별 `[요리하기]`가 노출되지 않는다 <!-- omo:id=dp6-accept-registered-hidden;stage=4;scope=frontend;review=5,6 -->
- [ ] `cook_done` 식사에는 개별 `[요리하기]`가 노출되지 않는다 <!-- omo:id=dp6-accept-cook-done-hidden;stage=4;scope=frontend;review=5,6 -->
- [ ] 취소/뒤로가기 시 meal 상태 변경 없이 MEAL_SCREEN으로 복귀한다 <!-- omo:id=dp6-accept-cancel-no-state-change;stage=4;scope=shared;review=6 -->
- [ ] 독립 요리(RECIPE_DETAIL 경유)에는 planner meal 상태 전이가 섞이지 않는다 <!-- omo:id=dp6-accept-standalone-no-regression;stage=4;scope=shared;review=6 -->
- [ ] COOK_MODE에 인분 조절 UI가 추가되지 않는다 <!-- omo:id=dp6-accept-no-serving-controls-in-cook-mode;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] session 생성 중 loading/submitting 상태가 보인다 <!-- omo:id=dp6-accept-session-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 식사 없음 empty 상태가 유지된다 <!-- omo:id=dp6-accept-meal-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] cook-mode 재료/steps 없음 또는 fetch 실패 error 상태가 유지된다 <!-- omo:id=dp6-accept-cook-mode-error-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 보호 액션은 기존 unauthorized/login 흐름을 유지한다 <!-- omo:id=dp6-accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] session 생성 실패 시 사용자가 MEAL_SCREEN에서 다시 시도할 수 있다 <!-- omo:id=dp6-accept-create-failure-retry;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 같은 recipe의 다른 meal 인분이 선택 meal cooking_servings에 합산되지 않는다 <!-- omo:id=dp6-accept-no-recipe-total-leak;stage=4;scope=shared;review=6 -->
- [ ] pantry 소진 payload는 기존 COOK_MODE 완료 계약을 유지한다 <!-- omo:id=dp6-accept-pantry-consumption-preserved;stage=4;scope=shared;review=6 -->
- [ ] leftover 저장 시 cooking_servings는 세션 요리 인분을 그대로 사용한다 <!-- omo:id=dp6-accept-leftover-serving-preserved;stage=4;scope=shared;review=6 -->
- [ ] API 응답 래퍼 `{ success, data, error }` 소비 방식이 바뀌지 않는다 <!-- omo:id=dp6-accept-api-envelope-preserved;stage=4;scope=shared;review=6 -->

## Layout / Accessibility

- [ ] 390px 모바일에서 재료 compact list와 조리 단계가 과도하게 떨어지지 않는다 <!-- omo:id=dp6-accept-mobile-gap-default;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px 모바일에서 재료 텍스트가 버튼, 단계 카드, 하단 CTA와 겹치지 않는다 <!-- omo:id=dp6-accept-mobile-gap-narrow;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 list는 스크린리더가 읽을 수 있는 텍스트 순서를 유지한다 <!-- omo:id=dp6-accept-ingredient-a11y-order;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture에 같은 recipe의 `shopping_done` meal 2개 이상과 서로 다른 planned_servings가 있다 <!-- omo:id=dp6-accept-fixture-multiple-meals;stage=4;scope=frontend;review=6 -->
- [ ] cook-mode fixture에 재료 3개 이상과 steps 2개 이상이 있다 <!-- omo:id=dp6-accept-fixture-cook-mode-density;stage=4;scope=frontend;review=6 -->
- [ ] 기존 `15a` planner cook session 경로가 regression으로 유지된다 <!-- omo:id=dp6-accept-existing-15a-regression;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 5/6 + Claude final authority when available
- environment: local Playwright fixture server, mobile default 390px, mobile narrow 320px
- scenarios:
  - 같은 recipe 식사 2개가 서로 다른 인분으로 등록된 상태에서 한 카드의 `[요리하기]`만 실행
  - COOK_MODE에서 인분/재료 스케일과 compact 재료 list 확인
  - 완료 후 MEAL_SCREEN 복귀 및 선택 meal만 완료 상태 확인
  - 320px에서 재료 list wrap과 하단 CTA 겹침 확인

## Automation Split

### Vitest

- [ ] MEAL_SCREEN 개별 요리 payload가 selected meal planned_servings를 사용하도록 고정 <!-- omo:id=dp6-accept-vitest-serving-payload;stage=4;scope=frontend;review=6 -->
- [ ] COOK_MODE 재료 compact list 렌더링과 empty/error 상태를 고정 <!-- omo:id=dp6-accept-vitest-cook-layout;stage=4;scope=frontend;review=6 -->

### Playwright

- [ ] MEAL_SCREEN `shopping_done` 개별 요리 -> COOK_MODE -> 완료 -> MEAL_SCREEN 흐름을 고정 <!-- omo:id=dp6-accept-playwright-meal-shortcut;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE 재료/조리법 proximity를 mobile default/narrow screenshot 또는 locator metric으로 고정 <!-- omo:id=dp6-accept-playwright-cook-proximity;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 기기에서 조리 중 화면 켜짐/스크롤 관성 확인
