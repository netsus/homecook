# Acceptance Checklist: wave1-port-planner-meal-add

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### Planner

- [ ] PLANNER_WEEK 끼니 컬럼 이모티콘이 제거되고 텍스트만 표시된다 <!-- omo:id=accept-planner-no-emoji;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 카드에서 recipe status badge(등록/장보기/요리)가 시각적으로 제거됐다 <!-- omo:id=accept-planner-no-badge;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK `+ 음식` 버튼이 기존 chevron 자리에 강조 표시로 배치된다 <!-- omo:id=accept-planner-add-food-position;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 상단에 `장보기` 문구가 표시된다 (기존 `장보기 목록 만들기` 대체) <!-- omo:id=accept-planner-shopping-label;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK에서 planner-level `요리하기` 버튼이 제거됐다 <!-- omo:id=accept-planner-no-cook-button;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK에서 이전주/다음주 이동이 작동한다 <!-- omo:id=accept-planner-week-nav;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 기존 drag-and-drop, 식사 추가, 날짜 표시가 정상 작동한다 <!-- omo:id=accept-planner-existing-features;stage=4;scope=frontend;review=5,6 -->

### Meal Add

- [ ] MENU_ADD 옵션이 2열 그리드로 표시된다 <!-- omo:id=accept-menu-add-grid;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD에 `남은 요리에서 추가` 옵션이 포함돼 있다 <!-- omo:id=accept-menu-add-leftover;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD 검색 input 포커스 시 RecipeSearchPicker로 진입한다 <!-- omo:id=accept-menu-add-search;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD에서 각 옵션(검색/레시피북/팬트리/남은요리/유튜브/직접등록)으로 정상 라우팅된다 <!-- omo:id=accept-menu-add-routing;stage=4;scope=frontend;review=5,6 -->
- [ ] `남은 요리에서 추가` 선택 시 LeftoverPicker 모달이 열리고, 선택 후 `POST /meals` + `leftover_dish_id`로 식사가 생성된다 <!-- omo:id=accept-menu-add-leftover-create;stage=4;scope=frontend;review=5,6 -->

### Manual Create

- [ ] MANUAL_CREATE 재료 추가 버튼 클릭 시 재료 선택 모달이 열리고 검색 input에 자동 포커스된다 <!-- omo:id=accept-manual-ingredient-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_CREATE 재료 다중 선택 후 확인 시 폼에 일괄 주입된다 <!-- omo:id=accept-manual-ingredient-bulk;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_CREATE 완료 시 `POST /recipes` → 계획 인분 → `POST /meals` 흐름이 정상 작동한다 <!-- omo:id=accept-manual-complete-flow;stage=4;scope=frontend;review=5,6 -->

### Meal Screen

- [ ] MEAL_SCREEN 레시피명 클릭 시 RECIPE_DETAIL(`/recipe/[id]`)로 이동한다 <!-- omo:id=accept-meal-recipe-click;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 진행상태 선택 버튼이 제거됐다 <!-- omo:id=accept-meal-no-status-selector;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 삭제 버튼이 카드 우상단 휴지통 아이콘으로 표시된다 <!-- omo:id=accept-meal-delete-icon;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 삭제 시 확인 모달이 표시되고 정상 삭제된다 <!-- omo:id=accept-meal-delete-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 기존 인분 조절 stepper가 정상 작동한다 <!-- omo:id=accept-meal-servings-stepper;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] PLANNER_WEEK, MENU_ADD, MANUAL_CREATE, MEAL_SCREEN의 loading/empty/error 상태가 올바르게 표시된다 <!-- omo:id=accept-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 사용자가 보호 액션(식사 추가, 레시피 등록) 시도 시 로그인 게이트가 표시된다 <!-- omo:id=accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] production 승인 토큰만 사용하고 prototype mint/Jua/asset은 사용하지 않는다 <!-- omo:id=accept-approved-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 API 응답 필드만 소비하고 새 endpoint/field가 추가되지 않는다 <!-- omo:id=accept-no-contract-change;stage=4;scope=frontend;review=6 -->
- [ ] 새 npm dependency가 추가되지 않는다 <!-- omo:id=accept-no-new-dep;stage=4;scope=frontend;review=6 -->
- [ ] `meals.status` 전이 규칙(`registered -> shopping_done -> cook_done`)이 보존된다 <!-- omo:id=accept-status-transition-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] MEAL_SCREEN에서 인분 변경 시 `shopping_done`/`cook_done` 상태이면 확인 모달이 표시된다 <!-- omo:id=accept-serving-change-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN에서 삭제 실패 시(409 등) 에러 메시지가 표시된다 <!-- omo:id=accept-meal-delete-error;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK에서 플래너 로드 실패 시 에러 상태와 재시도 버튼이 표시된다 <!-- omo:id=accept-planner-load-error;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_CREATE에서 레시피 등록 실패 시 에러 메시지가 표시된다 <!-- omo:id=accept-manual-create-error;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] mobile 390px PLANNER_WEEK가 overflow 없이 렌더된다 <!-- omo:id=accept-planner-390;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 320px PLANNER_WEEK가 overflow 없이 렌더된다 <!-- omo:id=accept-planner-320;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 주간 이동 컨트롤이 planner 본문 가까이에 위치한다 <!-- omo:id=accept-planner-nav-proximity;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 390px에서 2일 이상의 day summary가 첫 화면에 보인다 <!-- omo:id=accept-planner-2day-visible;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD 2열 그리드가 touch-friendly하게 작동한다 (44px 터치 타겟) <!-- omo:id=accept-menu-add-touch;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 삭제 아이콘이 touch-friendly하다 (44px) <!-- omo:id=accept-meal-delete-touch;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN mobile 390px/320px가 overflow 없이 렌더된다 <!-- omo:id=accept-meal-screen-responsive;stage=4;scope=frontend;review=5,6 -->
- [ ] Screenshot evidence가 Stage 4 완료 시 생성된다 <!-- omo:id=accept-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] 기존 QA fixture로 PLANNER_WEEK 렌더 테스트가 가능하다 (meals + columns) <!-- omo:id=accept-fixture-planner;stage=4;scope=frontend;review=6 -->
- [ ] 기존 QA fixture로 MEAL_SCREEN 렌더 테스트가 가능하다 <!-- omo:id=accept-fixture-meal;stage=4;scope=frontend;review=6 -->

## Automation Split

### Vitest

- [ ] PLANNER_WEEK 이모티콘 제거 + 텍스트 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-planner-emoji;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK status badge 제거 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-planner-badge;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 주간 이동 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-planner-nav;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK `장보기` 문구 + `요리하기` 제거 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-planner-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD 2열 그리드 + 남은요리 옵션 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-menu-add;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 레시피 클릭 + 삭제 아이콘 + status selector 제거 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-meal-screen;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] PLANNER_WEEK → 주간 이동 → 식사 추가 E2E 흐름이 브라우저에서 정상 작동한다 <!-- omo:id=accept-playwright-planner-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD 옵션 선택 → 검색/레시피북/남은요리 라우팅 E2E가 정상 작동한다 <!-- omo:id=accept-playwright-menu-add;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 레시피 클릭 → RECIPE_DETAIL 이동 + 삭제 E2E가 정상 작동한다 <!-- omo:id=accept-playwright-meal-screen;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- dev server에서 390px/320px PLANNER_WEEK 시각 품질 확인
- PLANNER_WEEK 주간 이동 스와이프/제스처 인터랙션 확인
- MENU_ADD 2열 그리드의 실제 터치 반응 확인
- MANUAL_CREATE 재료 모달의 검색 자동 포커스 및 다중 선택 흐름 확인
- MEAL_SCREEN 레시피명 탭 → RECIPE_DETAIL 실제 네비게이션 확인
