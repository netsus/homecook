# Acceptance: prepared-food-planner-entry

> 공식 기준: 요구사항 v1.7.20 / 화면 v1.5.26 / 유저 flow v1.3.23 / DB v1.3.21 / API v1.2.25
>
> Stage ownership: fresh Codex Stage 1 author → independent Stage 1.5 reviewer/repair-final → Stage 2 backend TDD implementer → independent Stage 3 reviewer → Stage 4 frontend implementer → fresh authority precheck/Stage 5/final authority → independent Stage 6 reviewer. 작성자·구현자는 자기 변경을 최종 승인하지 않는다.

## Happy Path / API Contract

- [x] 신규 mutation은 `POST /product-planner-entries`, `PATCH /product-planner-entries/{entry_id}`, `DELETE /product-planner-entries/{entry_id}` 정확히 3개뿐이다 <!-- omo:id=accept-product-entry-exact-mutations;stage=2;scope=backend;review=3 -->
- [x] 기존 `GET /planner`와 `GET /meals`만 additive `product_entries[]` projection을 제공하고 새 read endpoint를 만들지 않는다 <!-- omo:id=accept-product-entry-existing-reads;stage=2;scope=backend;review=3 -->
- [x] 모든 JSON API가 `{ success, data, error }`와 `{ code, message, fields[] }`를 유지한다 <!-- omo:id=accept-product-entry-wrapper;stage=2;scope=backend;review=3 -->
- [x] POST body가 `product_id/plan_date/column_id/quantity`만 받고 quantity는 amount `>0`, unit `serving|package|g|ml`이다 <!-- omo:id=accept-product-entry-create-body;stage=2;scope=backend;review=3 -->
- [x] POST 201 `entry`가 공식 product entry shape와 `workflow_status:null`을 반환한다 <!-- omo:id=accept-product-entry-create-response;stage=2;scope=backend;review=3 -->
- [x] PATCH body가 `quantity`만 받고 200에서 같은 공식 entry shape를 반환한다 <!-- omo:id=accept-product-entry-patch-response;stage=2;scope=backend;review=3 -->
- [x] DELETE 200 `data`가 `{ deleted:true, entry_id }`이고 product/Recipe Meal/version을 변경하지 않는다 <!-- omo:id=accept-product-entry-delete-response;stage=2;scope=backend;review=3 -->

## Existing Read Compatibility / Dedupe

- [x] `GET /planner.meals[]`는 기존 recipe-only field/status shape 그대로다 <!-- omo:id=accept-product-entry-planner-meals-compatible;stage=2;scope=shared;review=3,6 -->
- [x] `GET /planner.product_entries[]`에만 ProductPlannerEntry가 있으며 날짜/column/quantity/pin/snapshot 공식 field를 제공한다 <!-- omo:id=accept-product-entry-planner-products;stage=2;scope=backend;review=3 -->
- [x] `GET /meals.items[]`는 기존 recipe-only field/status shape 그대로다 <!-- omo:id=accept-product-entry-meals-items-compatible;stage=2;scope=shared;review=3,6 -->
- [x] `GET /meals.product_entries[]`에만 해당 날짜·column의 ProductPlannerEntry가 있다 <!-- omo:id=accept-product-entry-meals-products;stage=2;scope=backend;review=3 -->
- [x] 같은 Recipe Meal 또는 product entry가 두 배열/두 entry type/동일 배열에 중복 반환되지 않는다 <!-- omo:id=accept-product-entry-read-dedupe;stage=2;scope=shared;review=3,6 -->
- [x] Product entry에 `status/recipe_id/shopping_list_id/cooked_at/leftover_dish_id`가 없다 <!-- omo:id=accept-product-entry-no-meal-fields;stage=2;scope=shared;review=3,6 -->
- [x] 기존 client가 recipe 배열만 소비해도 response parsing과 status behavior가 회귀하지 않는다 <!-- omo:id=accept-product-entry-client-compat;stage=2;scope=shared;review=3,6 -->

## State / Policy

### Atomic Create / Immutable Pin

- [x] public active product는 로그인 사용자가, private active product는 owner만 entry로 추가한다 <!-- omo:id=accept-product-entry-product-scope;stage=2;scope=backend;review=3 -->
- [x] route와 DB가 column owner를 모두 검증하고 `entry.user_id=column.user_id`를 강제한다 <!-- omo:id=accept-product-entry-column-owner;stage=2;scope=backend;review=3 -->
- [x] create가 current product nutrition version을 원자적으로 pin한다 <!-- omo:id=accept-product-entry-version-pin;stage=2;scope=backend;review=3 -->
- [x] create가 같은 transaction에서 product name/brand snapshot을 pin한다 <!-- omo:id=accept-product-entry-product-snapshot;stage=2;scope=backend;review=3 -->
- [x] version 부재/경합은 409 `NUTRITION_VERSION_CONFLICT`이며 partial entry/version/snapshot write가 없다 <!-- omo:id=accept-product-entry-version-conflict;stage=2;scope=backend;review=3 -->
- [x] soft-deleted 제품 신규 create는 409 `PRODUCT_DELETED`이며 entry write가 없다 <!-- omo:id=accept-product-entry-product-deleted;stage=2;scope=backend;review=3 -->
- [x] catalog에서 이관된 old version pin과 삭제 전 기존 entry가 current 변경/soft-delete 뒤에도 보존된다 <!-- omo:id=accept-product-entry-catalog-pin-handoff;stage=2;scope=backend;review=3 -->

## Data Integrity

### Quantity Basis / Missing Semantics

- [x] quantity unit과 pinned nutrition basis unit이 같으면 positive basis amount의 직접 배수만 사용한다 <!-- omo:id=accept-product-entry-same-unit-scale;stage=2;scope=backend;review=3 -->
- [x] 다른 unit은 같은 product·같은 pinned immutable version의 approved direct relation 정확히 1개만 정방향/역방향으로 사용한다 <!-- omo:id=accept-product-entry-direct-relation;stage=2;scope=backend;review=3 -->
- [x] relation 0개/복수, chaining, cross-product/version, current-version substitute, name/brand/density/임의 g↔ml는 422 `NUTRITION_BASIS_MISMATCH`다 <!-- omo:id=accept-product-entry-basis-fail-closed;stage=2;scope=backend;review=3 -->
- [x] private manual `basis_relations=[]`은 label basis가 아닌 unit을 추정하지 않는다 <!-- omo:id=accept-product-entry-manual-no-relation;stage=2;scope=backend;review=3 -->
- [x] nutrition missing/null/unreadable을 0으로 정규화하지 않고 partial/unavailable과 amount null을 유지한다 <!-- omo:id=accept-product-entry-missing-not-zero;stage=2;scope=shared;review=3,6 -->
- [x] pinned version의 calculation status/quality/warnings/sources가 current lookup으로 재생성되지 않는다 <!-- omo:id=accept-product-entry-pinned-nutrition;stage=2;scope=backend;review=3 -->

## Patch / Delete / Column Guard

- [x] PATCH가 quantity만 바꾸고 version/product/name/brand/date/column pin을 바꾸지 않는다 <!-- omo:id=accept-product-entry-patch-quantity-only;stage=2;scope=backend;review=3 -->
- [x] PATCH는 product current가 아니라 old pinned version relation을 사용해 기존 계산을 재현한다 <!-- omo:id=accept-product-entry-patch-old-version;stage=2;scope=backend;review=3 -->
- [x] soft-deleted product의 기존 entry read/PATCH가 pin 기준으로 유지된다 <!-- omo:id=accept-product-entry-deleted-existing-retained;stage=2;scope=backend;review=3 -->
- [x] DELETE는 owner entry만 삭제하고 Recipe Meal, catalog, current/old version, XP/activity를 바꾸지 않는다 <!-- omo:id=accept-product-entry-delete-isolated;stage=2;scope=backend;review=3 -->
- [x] DELETE 성공 뒤 side effect가 되살아나지 않고 재요청은 기존 404 `RESOURCE_NOT_FOUND`로 종료한다 <!-- omo:id=accept-product-entry-delete-state-idempotent;stage=2;scope=backend;review=3 -->
- [x] Recipe Meal이 연결된 column 삭제는 기존 409 `COLUMN_HAS_MEALS`를 유지한다 <!-- omo:id=accept-product-entry-column-recipe-guard;stage=2;scope=backend;review=3 -->
- [x] ProductPlannerEntry가 연결된 column 삭제도 동일 409 `COLUMN_HAS_MEALS`다 <!-- omo:id=accept-product-entry-column-product-guard;stage=2;scope=backend;review=3 -->
- [x] concurrent entry insert/column delete에도 orphan entry나 owner mismatch가 없다 <!-- omo:id=accept-product-entry-column-race;stage=2;scope=backend;review=3 -->

## Error / Permission

### Permission / RLS / Security

- [x] 비로그인 mutation/read는 401 `UNAUTHORIZED`다 <!-- omo:id=accept-product-entry-login-required;stage=2;scope=backend;review=3 -->
- [x] 다른 사용자 private product/column/entry는 403 또는 scope-filtered 404이고 식별자/snapshot leak가 없다 <!-- omo:id=accept-product-entry-cross-owner;stage=2;scope=backend;review=3 -->
- [x] `product_planner_entries` RLS가 `auth.uid()=user_id` row만 CRUD하게 한다 <!-- omo:id=accept-product-entry-rls;stage=2;scope=backend;review=3 -->
- [x] anon/authenticated direct grant로 actor/pin/snapshot 불변 field와 public/cross-owner row를 우회하지 못한다 <!-- omo:id=accept-product-entry-direct-grants;stage=2;scope=backend;review=3 -->
- [x] service/RPC security definer를 사용하면 actor assertion과 locked search_path가 있고 raw identifier 인자를 믿지 않는다 <!-- omo:id=accept-product-entry-definer-security;stage=2;scope=backend;review=3 -->
- [x] API key/auth query/cookie/raw provider row·payload·URL/manifest/internal path/service credential/other-user ID leak가 0이다 <!-- omo:id=accept-product-entry-secret-raw-zero;stage=2;scope=shared;review=3,6 -->
- [x] production/staging write는 0건이고 현재 approved public artifact/운영 public row도 0건이다 <!-- omo:id=accept-product-entry-production-zero;stage=2;scope=shared;review=3,6 -->
- [x] synthetic public products는 isolated test에만 존재하고 운영/public promotion evidence가 아니다 <!-- omo:id=accept-product-entry-synthetic-isolated;stage=2;scope=shared;review=3,6 -->

## Structural Workflow Exclusion / Regression

- [x] product entry create/PATCH/DELETE가 `meals` row/status를 만들거나 바꾸지 않는다 <!-- omo:id=accept-product-entry-no-meal-write;stage=2;scope=backend;review=3 -->
- [x] shopping preview/list/create/complete가 Recipe Meal만 대상으로 하며 product entry를 수량/recipe aggregation에 넣지 않는다 <!-- omo:id=accept-product-entry-shopping-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] cooking session/create/complete/cancel과 standalone cook가 product entry를 대상에 넣지 않는다 <!-- omo:id=accept-product-entry-cooking-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] leftover create/list/keep/eat/uneat에 product entry가 나타나지 않는다 <!-- omo:id=accept-product-entry-leftover-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] recipe plan/cook counts와 recipe metrics가 product entry로 증가하지 않는다 <!-- omo:id=accept-product-entry-recipe-metric-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] `planner_registered` XP/event와 `meal_add_path_used` activity가 product entry로 생성되지 않는다 <!-- omo:id=accept-product-entry-growth-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] 기존 Recipe Meal `registered -> shopping_done -> cook_done`, owner/read-only/error 계약이 그대로 통과한다 <!-- omo:id=accept-product-entry-meal-regression;stage=2;scope=shared;review=3,6 -->

## Performance / Operational Readiness

- [x] planner/meals product projection이 owner/date/column scope를 DB query 전에 적용한다 <!-- omo:id=accept-product-entry-query-scope;stage=2;scope=backend;review=3 -->
- [x] version/profile/value/source/relation projection이 bounded batch/join이며 item별 N+1이 없다 <!-- omo:id=accept-product-entry-no-n-plus-one;stage=2;scope=backend;review=3 -->
- [x] 두 real DB connection의 create/current-switch race가 consistent pin 또는 공식 409만 만들고 partial row 0을 증명한다 <!-- omo:id=accept-product-entry-real-race;stage=2;scope=backend;review=3 -->
- [x] injected failure가 entry/version/snapshot partial write를 남기지 않는다 <!-- omo:id=accept-product-entry-real-rollback;stage=2;scope=backend;review=3 -->
- [x] test cleanup 뒤 ephemeral DB/process/user/product/entry row가 남지 않는다 <!-- omo:id=accept-product-entry-real-cleanup;stage=2;scope=backend;review=3 -->

## Frontend Primary Flow / States

- [ ] `MENU_ADD -> FOOD_PRODUCT_PICKER -> 선택 -> 수량 -> ProductPlannerEntry -> MEAL_SCREEN -> PLANNER_WEEK`가 동작한다 <!-- omo:id=accept-product-entry-ui-primary-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색 empty에서 `FOOD_PRODUCT_CREATE`로 private product를 등록하고 선택된 picker로 복귀한다 <!-- omo:id=accept-product-entry-ui-create-return;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN/PLANNER_WEEK가 Recipe Meal과 product entry를 시각·타입으로 구분하고 product status chip/action을 표시하지 않는다 <!-- omo:id=accept-product-entry-ui-type;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/read-only/unauthorized 상태가 서로 구분된다 <!-- omo:id=accept-product-entry-ui-required-states;stage=4;scope=frontend;review=5,6 -->
- [ ] partial/unavailable가 최소/정보 준비 중 의미를 유지하고 결측을 0으로 표시하지 않는다 <!-- omo:id=accept-product-entry-ui-missing;stage=4;scope=frontend;review=5,6 -->
- [ ] basis mismatch가 inline validation을 보이고 수량/선택 단계에 머문다 <!-- omo:id=accept-product-entry-ui-basis-mismatch;stage=4;scope=frontend;review=5,6 -->
- [ ] guest login return-to-action이 검색어·날짜·끼니·선택 product·quantity context를 복원한다 <!-- omo:id=accept-product-entry-ui-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] PATCH는 old pinned basis를 소비하고 current 변경 뒤 UI 값/허용 unit이 조용히 바뀌지 않는다 <!-- omo:id=accept-product-entry-ui-old-pin;stage=4;scope=frontend;review=5,6 -->
- [ ] delete confirmation이 product entry만 제거하고 Recipe Meal/catalog UI를 바꾸지 않는다 <!-- omo:id=accept-product-entry-ui-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN product card가 pin된 version + entry quantity의 energy를 `예상 열량 X kcal`, partial은 `예상 열량 최소 X kcal`, unavailable은 `예상 열량 정보 준비 중`으로 표시하고 observed complete 0 외 missing/null을 0으로 표시하지 않는다 <!-- omo:id=accept-product-entry-ui-expected-energy;stage=4;scope=frontend;review=5,6 -->
- [ ] FOOD_PRODUCT_PICKER가 기존 `GET /food-products`의 opaque `next_cursor`/`has_next`로 page를 이어 붙이고 product ID dedupe·last-page 종료를 지킨다 <!-- omo:id=accept-product-entry-ui-cursor-pagination;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색어 변경은 items/cursor/has_next를 reset하고 느린 이전 query 응답을 무시해 최신 query만 표시하며 새 endpoint를 만들지 않는다 <!-- omo:id=accept-product-entry-ui-search-race;stage=4;scope=frontend;review=5,6 -->

## Manual QA

### Browser / Authority / Accessibility

- [ ] Stage 4 전에 PLANNER_WEEK/MEAL_SCREEN/MENU_ADD 각각의 current-state before screenshot을 390/320/desktop 1280에서 확보한다 <!-- omo:id=accept-product-entry-before-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK/MEAL_SCREEN/MENU_ADD 각각의 after screenshot도 390/320/desktop 1280에서 확보하고 before와 짝지어 비교한다 <!-- omo:id=accept-product-entry-anchor-after-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] 신규 FOOD_PRODUCT_PICKER/FOOD_PRODUCT_CREATE는 390/320/desktop 1280 after screenshot을 확보한다 <!-- omo:id=accept-product-entry-new-surface-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px에서 picker/create/mixed-entry/quantity/mismatch/return flow evidence가 있다 <!-- omo:id=accept-product-entry-evidence-390;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px narrow에서 CTA/keyboard/footer/touch target/문구가 잘리거나 가려지지 않는다 <!-- omo:id=accept-product-entry-evidence-320;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 1280px에서 nested surface와 PLANNER_WEEK/MEAL_SCREEN hierarchy가 안정적이다 <!-- omo:id=accept-product-entry-evidence-desktop;stage=4;scope=frontend;review=5,6 -->
- [ ] page-level horizontal overflow가 없고 기존 PLANNER_WEEK scroll containment/navigation이 보존된다 <!-- omo:id=accept-product-entry-scroll-containment;stage=4;scope=frontend;review=5,6 -->
- [ ] primary CTA, keyboard/focus restoration, ESC/back, 44x44 touch target, axe가 통과한다 <!-- omo:id=accept-product-entry-accessibility;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA report/eval과 `pnpm verify:frontend`가 green이다 <!-- omo:id=accept-product-entry-exploratory;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh authority precheck/Stage 5/final authority/Stage 6에서 blocker/important 미해결 0이다 <!-- omo:id=accept-product-entry-authority;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] SOT가 요구사항 v1.7.20, 화면 v1.5.26, flow v1.3.23, DB v1.3.21, API v1.2.25로 일치한다 <!-- omo:id=accept-product-entry-official-docs;stage=2;scope=shared;review=3,6 -->
- [x] `prepared-food-catalog`가 merge `b095f257a9a99f0f4952029ffd11a1036104f40f` ancestry에 있고 immutable version 계약을 제공한다 <!-- omo:id=accept-product-entry-catalog-predecessor;stage=2;scope=backend;review=3 -->
- [x] isolated runner가 `public.users` A/B만 준비한 뒤 실제 `ensureUserBootstrapState`를 호출해 owner별 `아침/점심/저녁`을 만들며 `meal_plan_columns`를 SQL로 직접 seed하지 않는다 <!-- omo:id=accept-product-entry-column-bootstrap;stage=2;scope=backend;review=3 -->
- [x] A/B owner, private/public/deleted product, old/new version, direct/no relation, missing/zero nutrient fixture가 준비된다 <!-- omo:id=accept-product-entry-fixtures;stage=2;scope=backend;review=3 -->

## Automation Split

### Vitest / Route / Service

- [x] 세 mutation request/response/validation/error와 unexpected field 거부를 테스트한다 <!-- omo:id=accept-product-entry-vitest-api;stage=2;scope=backend;review=3 -->
- [x] planner/meals additive read 호환·dedupe·product no-Meal-fields를 테스트한다 <!-- omo:id=accept-product-entry-vitest-read;stage=2;scope=backend;review=3 -->
- [x] same-unit/direct forward/reverse 및 no/multiple/cross-version/chaining mismatch를 테스트한다 <!-- omo:id=accept-product-entry-vitest-basis;stage=2;scope=backend;review=3 -->
- [x] atomic pin, name/brand snapshot, old pin, deleted product, patch/delete를 테스트한다 <!-- omo:id=accept-product-entry-vitest-pin;stage=2;scope=backend;review=3 -->
- [x] shopping/cooking/leftover/Meal/recipe counts/XP/activity regression을 테스트한다 <!-- omo:id=accept-product-entry-vitest-regression;stage=2;scope=shared;review=3,6 -->

### PostgreSQL Integration

- [x] `scripts/run-prepared-food-planner-entry-postgres-integration.mjs`가 non-5432 ephemeral DB에 core/cover/nutrition/recipe snapshot/catalog/product-entry migration을 순서대로 적용하고 `finally`에서 process/socket/temp directory를 제거한다 <!-- omo:id=accept-product-entry-pg-runner;stage=2;scope=backend;review=3 -->
- [x] `tests/fixtures/prepared-food-planner-entry-postgres-harness.ts`가 실제 `ensureUserBootstrapState` adapter와 transaction rollback/scoped reset을 제공하고 case 전후 scoped row 0을 확인한다 <!-- omo:id=accept-product-entry-pg-harness-reset;stage=2;scope=backend;review=3 -->
- [x] real constraint/composite ownership/product-version relation/RLS/direct grants를 검증한다 <!-- omo:id=accept-product-entry-pg-constraints;stage=2;scope=backend;review=3 -->
- [x] real two-session version pin race와 failure-injected transaction rollback을 검증한다 <!-- omo:id=accept-product-entry-pg-race-rollback;stage=2;scope=backend;review=3 -->
- [x] real old pin/current change/product delete/new create 409/existing entry retention을 검증한다 <!-- omo:id=accept-product-entry-pg-old-pin;stage=2;scope=backend;review=3 -->
- [x] real column Recipe Meal/product entry/concurrent race guard와 cleanup을 검증한다 <!-- omo:id=accept-product-entry-pg-column-cleanup;stage=2;scope=backend;review=3 -->

### Playwright / UI

- [ ] real browser primary flow, manual product create return, PATCH/delete를 검증한다 <!-- omo:id=accept-product-entry-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] real browser auth return, basis mismatch, loading/empty/error/read-only/partial/unavailable를 검증한다 <!-- omo:id=accept-product-entry-playwright-states;stage=4;scope=frontend;review=5,6 -->
- [ ] FOOD_PRODUCT_PICKER query reset, cursor append/dedupe, last page, slow previous response ignore를 검증한다 <!-- omo:id=accept-product-entry-playwright-pagination;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN의 complete/partial/unavailable/observed-zero 예상 열량 copy와 pin/current-version 회귀를 검증한다 <!-- omo:id=accept-product-entry-playwright-energy;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/desktop visual/a11y/scroll/focus evidence를 검증한다 <!-- omo:id=accept-product-entry-playwright-devices;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [x] independent Stage 1.5 reviewer가 exact head `fe210b7169094edc77b64e91a730d86720d598ae`의 이 문서·README·automation/work-item/status/design artifacts를 `DOC_GATE_APPROVED` 0/0/0으로 승인했다
- [ ] full repository migration stack + Supabase/PostgREST/auth claim 동등성을 plain isolated PostgreSQL과 비교한다
- [ ] physical iOS/Android narrow device 및 실제 screen reader로 확인한다
- [ ] 향후 approved public promotion artifact가 생기면 license/stable key/basis/core nutrition을 운영 승인 후 별도 load한다
- [ ] production-scale query plan, two-session contention, RLS policy cost를 측정한다

## Scope Guard

- [x] `GET /planner/nutrition`과 planner summary 계산/UI가 diff에 없다 <!-- omo:id=accept-product-entry-summary-excluded;stage=2;scope=shared;review=3,6 -->
- [x] OCR/barcode/dining-out/meal-kit/actual-consumption/medical coaching이 diff에 없다 <!-- omo:id=accept-product-entry-future-excluded;stage=2;scope=shared;review=3,6 -->
- [x] generic prep/size/edible field, density, relation chain, new endpoint/status/error/field가 없다 <!-- omo:id=accept-product-entry-contract-no-expansion;stage=2;scope=shared;review=3,6 -->
