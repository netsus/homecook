# Acceptance Criteria: wave1-port-pantry

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### Pantry List

- [ ] PANTRY 화면에서 보유 재료 목록이 표시된다 <!-- omo:id=accept-pantry-list;stage=4;scope=frontend;review=5,6 -->
- [ ] 보유 재료 count가 현재 목록 수와 일치한다 <!-- omo:id=accept-pantry-count;stage=4;scope=frontend;review=5,6 -->
- [ ] 보유 재료 카드에서 `보유 중` 텍스트가 제거된다 <!-- omo:id=accept-remove-owned-text;stage=4;scope=frontend;review=5,6 -->
- [ ] 보유 재료 카드에서 category/placeholder visual이 안정적으로 표시된다 <!-- omo:id=accept-card-placeholder;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY 화면에는 미보유 재료가 표시되지 않는다 <!-- omo:id=accept-hide-unowned;stage=4;scope=frontend;review=5,6 -->

### Search / Category

- [ ] 검색어 입력 시 `GET /pantry?q=` 기반 결과가 표시된다 <!-- omo:id=accept-search;stage=4;scope=frontend;review=5,6 -->
- [ ] category chip 선택 시 `GET /pantry?category=` 기반 결과가 표시된다 <!-- omo:id=accept-category-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] category horizontal chip rail이 보유 재료 목록 상단에서 동작한다 <!-- omo:id=accept-category-rail-position;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색 결과가 없을 때 empty state와 reset action이 표시된다 <!-- omo:id=accept-search-empty;stage=4;scope=frontend;review=5,6 -->

### Add Ingredient Sheet

- [ ] [재료 추가] CTA가 명확한 라벨과 위치로 표시된다 <!-- omo:id=accept-add-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] [재료 추가] 클릭 시 ingredient add sheet가 열린다 <!-- omo:id=accept-add-sheet-open;stage=4;scope=frontend;review=5,6 -->
- [ ] add sheet에서 재료 검색과 category filter가 동작한다 <!-- omo:id=accept-add-sheet-search-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] 이미 보유한 재료는 add sheet에서 중복 추가되지 않도록 비활성/보조 표시된다 <!-- omo:id=accept-add-existing-disabled;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 선택 후 `POST /pantry`가 `ingredient_ids` 배열로 호출된다 <!-- omo:id=accept-add-post;stage=4;scope=frontend;review=5,6 -->
- [ ] 추가 성공 후 PANTRY 목록이 갱신된다 <!-- omo:id=accept-add-refresh;stage=4;scope=frontend;review=5,6 -->

### Bundle Picker

- [ ] [묶음 추가] CTA가 [재료 추가]와 구분되는 위치/라벨로 표시된다 <!-- omo:id=accept-bundle-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] [묶음 추가] 클릭 시 PANTRY_BUNDLE_PICKER가 열린다 <!-- omo:id=accept-bundle-picker-open;stage=4;scope=frontend;review=5,6 -->
- [ ] bundle list에서 묶음 이름과 재료 수가 표시된다 <!-- omo:id=accept-bundle-list;stage=4;scope=frontend;review=5,6 -->
- [ ] `is_in_pantry=false` 재료가 기본 선택된다 <!-- omo:id=accept-bundle-default-selection;stage=4;scope=frontend;review=5,6 -->
- [ ] `is_in_pantry=true` 재료는 이미 보유 상태가 명확히 표시된다 <!-- omo:id=accept-bundle-owned-state;stage=4;scope=frontend;review=5,6 -->
- [ ] bundle picker에서 선택한 재료만 `POST /pantry`의 `ingredient_ids`로 전달된다 <!-- omo:id=accept-bundle-post;stage=4;scope=frontend;review=5,6 -->
- [ ] bundle 추가 성공 후 PANTRY 목록이 갱신된다 <!-- omo:id=accept-bundle-refresh;stage=4;scope=frontend;review=5,6 -->

### Multi Delete

- [ ] 삭제/선택 모드 진입 버튼이 항상 접근 가능하다 <!-- omo:id=accept-delete-entry-visible;stage=4;scope=frontend;review=5,6 -->
- [ ] delete mode에서만 item checkbox가 표시된다 <!-- omo:id=accept-delete-checkboxes;stage=4;scope=frontend;review=5,6 -->
- [ ] item 선택 시 selected count가 표시된다 <!-- omo:id=accept-delete-selected-count;stage=4;scope=frontend;review=5,6 -->
- [ ] selected items bottom `제거하기` CTA가 safe-area를 침범하지 않는다 <!-- omo:id=accept-delete-bottom-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] 선택된 재료만 `DELETE /pantry`의 `ingredient_ids`로 전달된다 <!-- omo:id=accept-delete-request;stage=4;scope=frontend;review=5,6 -->
- [ ] 삭제 성공 후 선택 모드가 종료되고 목록이 갱신된다 <!-- omo:id=accept-delete-refresh;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 팬트리는 보유 여부만 관리하며 수량 UI를 표시하지 않는다 <!-- omo:id=accept-no-quantity;stage=4;scope=frontend;review=5,6 -->
- [ ] 공식 category 값만 사용하고 임의 category contract를 추가하지 않는다 <!-- omo:id=accept-category-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] ingredient image URL 필드를 임의로 요구하지 않는다 <!-- omo:id=accept-no-image-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] 중복 추가 결과 `added=0`도 오류로 처리하지 않는다 <!-- omo:id=accept-duplicate-skip;stage=4;scope=frontend;review=5,6 -->
- [ ] 이미 없는 재료 삭제 결과 `removed=0`도 안정적으로 처리한다 <!-- omo:id=accept-delete-idempotent;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] 비로그인 상태에서 `/pantry` 접근 시 login gate가 표시된다 <!-- omo:id=accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] login gate는 return-to-action `/pantry`를 유지한다 <!-- omo:id=accept-return-to-pantry;stage=4;scope=frontend;review=5,6 -->
- [ ] pantry list loading skeleton이 표시된다 <!-- omo:id=accept-list-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] pantry list error 상태에서 재시도 버튼이 표시된다 <!-- omo:id=accept-list-error;stage=4;scope=frontend;review=5,6 -->
- [ ] add sheet loading/empty/error 상태가 표시된다 <!-- omo:id=accept-add-sheet-states;stage=4;scope=frontend;review=5,6 -->
- [ ] bundle picker loading/empty/error 상태가 표시된다 <!-- omo:id=accept-bundle-states;stage=4;scope=frontend;review=5,6 -->
- [ ] `ingredient_ids`가 빈 배열이면 mutation CTA가 비활성이다 <!-- omo:id=accept-empty-selection-disabled;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] pantry fixture에 보유 재료 3개 이상과 category 2개 이상이 있다 <!-- omo:id=accept-fixture-owned-items;stage=4;scope=frontend;review=5,6 -->
- [ ] ingredient fixture에 add sheet 검색 결과와 이미 보유한 재료가 함께 있다 <!-- omo:id=accept-fixture-ingredients;stage=4;scope=frontend;review=5,6 -->
- [ ] bundle fixture에 보유/미보유 재료가 섞여 있다 <!-- omo:id=accept-fixture-bundles;stage=4;scope=frontend;review=5,6 -->

## Design Evidence

- [ ] PANTRY 기본 화면 screenshot evidence가 생성된다 (390px + 320px) <!-- omo:id=accept-evidence-pantry-default;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY delete mode screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-delete-mode;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY empty/search-empty evidence가 생성된다 <!-- omo:id=accept-evidence-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] Add sheet evidence가 생성된다 <!-- omo:id=accept-evidence-add-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] Bundle picker evidence가 생성된다 <!-- omo:id=accept-evidence-bundle-picker;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority report가 blocker 0으로 남는다 <!-- omo:id=accept-authority-report;stage=5;scope=frontend;review=5,6 -->

## Manual Verification

### Manual Only

- [ ] 실제 기기에서 delete mode bottom CTA가 safe-area와 겹치지 않는지 확인
- [ ] 실제 local Supabase seed에서 ingredients/bundles category가 공식 vocabulary와 맞는지 확인

## Automation Split

### Vitest

- [ ] PANTRY: 보유 재료 목록, count, category/placeholder 렌더 확인 <!-- omo:id=test-vitest-pantry-list;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY: 검색/category filter 호출 파라미터 확인 <!-- omo:id=test-vitest-search-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY: delete mode checkbox, selected count, bottom CTA 확인 <!-- omo:id=test-vitest-delete-mode;stage=4;scope=frontend;review=5,6 -->
- [ ] Add sheet: 기존 보유 재료 disabled, 선택 후 POST body 확인 <!-- omo:id=test-vitest-add-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] Bundle picker: 미보유 기본 선택, 보유 상태 표시, POST body 확인 <!-- omo:id=test-vitest-bundle-picker;stage=4;scope=frontend;review=5,6 -->
- [ ] Error/empty/login gate 상태 확인 <!-- omo:id=test-vitest-states;stage=4;scope=frontend;review=5,6 -->

### Playwright E2E

- [ ] PANTRY list/search/category E2E 회귀 <!-- omo:id=test-e2e-list-search-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] Add ingredient sheet E2E 회귀 <!-- omo:id=test-e2e-add-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] Bundle picker E2E 회귀 <!-- omo:id=test-e2e-bundle-picker;stage=4;scope=frontend;review=5,6 -->
- [ ] Multi-delete E2E 회귀 <!-- omo:id=test-e2e-multi-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] Login gate E2E 회귀 <!-- omo:id=test-e2e-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] Mobile screenshot evidence E2E <!-- omo:id=test-e2e-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
