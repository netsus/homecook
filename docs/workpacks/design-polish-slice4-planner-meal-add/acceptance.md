# Acceptance Criteria — design-polish-slice4-planner-meal-add

## Happy Path

### Modal/Sheet 전환 (Finding 1, 2)

- [ ] PLANNER_WEEK 빈 셀 `+` 버튼 → 식사추가 옵션 시트 → 검색 옵션 클릭 → RecipeSearchPicker가 모달/시트로 열린다 <!-- omo:id=accept-planner-search-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 셀 `+` → 옵션 시트 → 레시피북 옵션 → RecipeBookSelector가 모달/시트로 열린다 <!-- omo:id=accept-planner-recipebook-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 셀 `+` → 옵션 시트 → 팬트리 추천 옵션 → PantryMatchPicker가 모달/시트로 열린다 <!-- omo:id=accept-planner-pantry-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 셀 `+` → 옵션 시트 → 남은요리 옵션 → LeftoverPicker가 모달/시트로 열린다 <!-- omo:id=accept-planner-leftover-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 셀 `+` → 옵션 시트 → 직접등록 옵션 → `/menu/add/manual` 페이지로 이동 (기존 router.push 유지) <!-- omo:id=accept-planner-manual-route;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN "식사 추가" 버튼 → 식사추가 옵션 모달/시트가 열린다 (full-page 이동 아님) <!-- omo:id=accept-meal-screen-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 식사추가 모달 → 검색 옵션 → RecipeSearchPicker 모달 → 레시피 선택 → 인분 입력 → POST /meals → MEAL_SCREEN에 새 식사 반영 <!-- omo:id=accept-meal-screen-search-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 식사추가 모달 → 남은요리 옵션 → LeftoverPicker 모달 → 남은요리 선택 → 인분 입력 → POST /meals (leftover_dish_id 포함) → MEAL_SCREEN에 새 식사 반영 <!-- omo:id=accept-meal-screen-leftover-flow;stage=4;scope=frontend;review=5,6 -->

### 검색 아이콘 (Finding 3)

- [ ] RecipeSearchPicker의 검색 아이콘이 교체되어 기존보다 크고 명확하다 <!-- omo:id=accept-search-icon-change;stage=4;scope=frontend;review=5,6 -->

### LeftoverPicker 카드 (Finding 4)

- [ ] LeftoverPicker 각 카드의 선택 버튼이 카드 오른쪽에 위치하고 기존보다 작다 <!-- omo:id=accept-leftover-button-right;stage=4;scope=frontend;review=5,6 -->
- [ ] 버튼 텍스트가 `추가`이다 (기존 `선택`에서 변경) <!-- omo:id=accept-leftover-button-text;stage=4;scope=frontend;review=5,6 -->
- [ ] 각 카드의 메타데이터가 `"M/D 끼니명 N인분"` 형식이다 (예: `"5/7 저녁 2인분"`) <!-- omo:id=accept-leftover-metadata-format;stage=4;scope=frontend;review=5,6 -->
- [ ] `source_meal_label`이 null일 때 끼니명 부분이 합리적으로 fallback 표시된다 <!-- omo:id=accept-leftover-null-label;stage=4;scope=frontend;review=5,6 -->
- [ ] `source_planned_servings`/`cooking_servings`가 null일 때 인분 부분이 합리적으로 fallback 표시된다 <!-- omo:id=accept-leftover-null-servings;stage=4;scope=frontend;review=5,6 -->
- [ ] LeftoverPicker 시트 제목이 `"남은 요리에서 추가"`이다 <!-- omo:id=accept-leftover-sheet-title;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 기존 `loading / empty / error / read-only / unauthorized` 상태 UI가 변경 없이 유지된다 <!-- omo:id=accept-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 안 된 상태에서 식사 추가 시 기존 login gate가 정상 동작한다 <!-- omo:id=accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 모달에서 식사 추가 완료 후 원래 화면(PLANNER_WEEK 또는 MEAL_SCREEN)으로 올바르게 복귀한다 <!-- omo:id=accept-modal-return;stage=4;scope=frontend;review=5,6 -->
- [ ] `/menu-add` URL로 직접 접근 시 기존 MENU_ADD 페이지가 정상 렌더링된다 <!-- omo:id=accept-menu-add-route-fallback;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] 네트워크 오류 시 식사 추가 실패 피드백이 표시된다 (기존 에러 핸들링 보존) <!-- omo:id=accept-network-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 서버 409/500 응답 시 기존 에러 처리가 동작한다 <!-- omo:id=accept-server-error;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- 백엔드 항목 N/A (FE-only 슬라이스, API/DB 변경 없음)

## Data Setup / Preconditions

- [ ] 기존 fixture / mock 데이터로 PLANNER_WEEK, MEAL_SCREEN, MENU_ADD, LeftoverPicker 화면이 정상 렌더링된다 (신규 데이터 불필요) <!-- omo:id=accept-fixture-renders;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: 사용자 (수동 시각적 확인)
- environment: mobile default (390px); real DB smoke N/A because API/DB/seed flows are unchanged
- scenarios:
  - PLANNER_WEEK 빈 셀 `+` → 옵션 시트 → 각 옵션 클릭 시 모달/시트로 열리는지 확인
  - MEAL_SCREEN "식사 추가" 버튼 → 옵션 모달/시트 열리는지 확인 (full-page 이동 아닌지)
  - 각 picker 모달에서 레시피/남은요리 선택 → 인분 입력 → 식사 추가 완료 → 원래 화면 복귀
  - `직접등록` 옵션이 기존처럼 별도 페이지로 이동하는지 확인
  - LeftoverPicker 카드에서 버튼 위치(우측), 텍스트(`추가`), 메타데이터 형식(`M/D 끼니명 N인분`) 확인
  - LeftoverPicker 시트 제목이 `"남은 요리에서 추가"`인지 확인
  - RecipeSearchPicker 검색 아이콘이 교체되어 크고 명확한지 확인
  - 데스크톱에서 MENU_ADD 사이드 패널 레이아웃에 regression 없는지 확인

## Automation Split

### Vitest

- [ ] 기존 컴포넌트/유틸 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-vitest-regression;stage=4;scope=frontend;review=6 -->

### Playwright

- [ ] 기존 E2E 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-playwright-regression;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] PLANNER_WEEK 식사추가 옵션 시트 → picker 모달 전환 흐름 mobile (390px) before/after screenshot 비교
- [ ] MEAL_SCREEN 식사추가 모달 진입 흐름 mobile (390px) before/after screenshot 비교
- [ ] LeftoverPicker 카드 레이아웃 변경 mobile (390px) before/after screenshot 비교
- [ ] RecipeSearchPicker 검색 아이콘 변경 mobile (390px) before/after screenshot 비교
- [ ] Authority review: PLANNER_WEEK anchor-extension screenshot evidence 기반 판정
