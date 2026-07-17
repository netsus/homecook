# Acceptance Checklist — planner-nutrition-summary

> 이 문서는 living closeout이다. Stage 1에서는 계약만 작성하며 체크하지 않는다. 테스트, isolated PostgreSQL, real local DB/browser, screenshot, exploratory QA, independent review처럼 실제 evidence가 생긴 뒤에만 해당 역할이 체크한다.

## Happy Path / Exact API

- [x] `GET /planner/nutrition?start_date=&end_date=` 하나만 추가되고 최대 7일 범위를 조회한다 <!-- omo:id=accept-planner-nutrition-endpoint;stage=2;scope=backend;review=3,6 -->
- [x] 응답은 `{ success, data, error }`와 공식 `range/summary/days/columns` exact shape를 따른다 <!-- omo:id=accept-planner-nutrition-shape;stage=2;scope=backend;review=3,6 -->
- [x] range summary에 `recipe_entry_count`와 `product_entry_count`가 중복 없는 실제 entry 수로 반환된다 <!-- omo:id=accept-planner-nutrition-entry-counts;stage=2;scope=backend;review=3,6 -->
- [x] range/day/column nutrition의 `basis`는 공식 `{ amount:1, unit:'range' }`이며 핵심 5종과 aggregate field만 포함한다 <!-- omo:id=accept-planner-nutrition-aggregate-fields;stage=2;scope=backend;review=3,6 -->
- [x] Recipe Detail 전용 field나 새 product/entry 식별자가 aggregate에 추가되지 않는다 <!-- omo:id=accept-planner-nutrition-no-context-fields;stage=2;scope=backend;review=3,6 -->

## Pinned Snapshot / Version Authority

- [x] Recipe Meal은 pin된 `recipe_nutrition_snapshot_id`만 사용하고 current snapshot으로 repin하지 않는다 <!-- omo:id=accept-planner-nutrition-recipe-pin;stage=2;scope=backend;review=3,6 -->
- [x] recipe 계획값은 pin된 scalable/fixed vector와 `planned_servings/base_servings` 공식으로 계산된다 <!-- omo:id=accept-planner-nutrition-recipe-serving-scale;stage=2;scope=backend;review=3,6 -->
- [x] null recipe snapshot은 Meal을 실패시키지 않고 unavailable/incomplete로 유지한다 <!-- omo:id=accept-planner-nutrition-null-recipe-pin;stage=2;scope=backend;review=3,6 -->
- [x] ProductPlannerEntry는 pin된 `product_nutrition_version_id`와 quantity만 사용한다 <!-- omo:id=accept-planner-nutrition-product-pin;stage=2;scope=backend;review=3,6 -->
- [x] product current version/metadata 변경·soft-delete 뒤에도 old entry 합계가 변하지 않는다 <!-- omo:id=accept-planner-nutrition-product-old-pin;stage=2;scope=backend;review=3,6 -->
- [x] 같은 recipe/product entry가 기존 read arrays나 adapter 결합으로 두 번 합산되지 않는다 <!-- omo:id=accept-planner-nutrition-entry-dedupe;stage=2;scope=shared;review=3,6 -->

## Completeness / Missing Is Not Zero

- [x] 핵심 5종은 `energy_kcal/carbohydrate_g/protein_g/fat_g/sodium_mg`로 고정된다 <!-- omo:id=accept-planner-nutrition-core-five;stage=2;scope=shared;review=3,6 -->
- [x] 실제 complete 0만 0으로 합산하고 missing/null/unavailable/conversion failure는 0이 아니다 <!-- omo:id=accept-planner-nutrition-missing-not-zero;stage=2;scope=shared;review=3,6 -->
- [x] complete만 있는 nutrient는 `amount/complete/total`이다 <!-- omo:id=accept-planner-nutrition-complete-total;stage=2;scope=backend;review=3,6 -->
- [x] partial 또는 일부 unavailable이 있고 known sum이 있으면 `amount=null/known_amount/partial/minimum`이다 <!-- omo:id=accept-planner-nutrition-partial-minimum;stage=2;scope=backend;review=3,6 -->
- [x] 모든 entry가 unavailable인 nutrient는 amount와 known_amount가 모두 null이다 <!-- omo:id=accept-planner-nutrition-all-unavailable;stage=2;scope=backend;review=3,6 -->
- [x] entry 0개 scope는 unavailable/null, quality null, incomplete 0, warnings/sources 빈 배열이며 false 0 kcal가 아니다 <!-- omo:id=accept-planner-nutrition-empty-scope;stage=2;scope=backend;review=3,6 -->
- [x] incomplete entry는 핵심 5종 전체가 complete가 아닐 때 scope별 entry당 한 번만 count된다 <!-- omo:id=accept-planner-nutrition-incomplete-count;stage=2;scope=backend;review=3,6 -->

## Quality / Warning / Attribution

- [x] all direct→direct, all estimated→estimated, 그 외/mixed→mixed 규칙을 지킨다 <!-- omo:id=accept-planner-nutrition-quality-merge;stage=2;scope=backend;review=3,6 -->
- [x] 모든 entry unavailable이면 `calculation_quality=null`이다 <!-- omo:id=accept-planner-nutrition-quality-null;stage=2;scope=backend;review=3,6 -->
- [x] pin된 warnings만 deterministic aggregate하며 current source/profile로 재생성하지 않는다 <!-- omo:id=accept-planner-nutrition-warning-pin;stage=2;scope=backend;review=3,6 -->
- [x] source item은 공식 exact 6 field만 가진다 <!-- omo:id=accept-planner-nutrition-source-six-fields;stage=2;scope=shared;review=3,6 -->
- [x] range/day/column별 exact 6-field tuple을 stable dedupe/order하고 다른 `source_version`은 합치지 않는다 <!-- omo:id=accept-planner-nutrition-source-dedupe;stage=2;scope=backend;review=3,6 -->
- [x] secret/auth query/cookie/raw provider payload/internal path/other-user ID leak가 0이다 <!-- omo:id=accept-planner-nutrition-secret-raw-zero;stage=2;scope=shared;review=3,6 -->

## Validation / Authorization / Read-only

- [x] query 누락·invalid date·start>end·7일 초과가 기존 422 `VALIDATION_ERROR`다 <!-- omo:id=accept-planner-nutrition-query-validation;stage=2;scope=backend;review=3,6 -->
- [x] 비로그인은 기존 401 `UNAUTHORIZED`이고 새 status/error code가 없다 <!-- omo:id=accept-planner-nutrition-unauthorized;stage=2;scope=backend;review=3,6 -->
- [x] auth owner의 범위 row만 조회하고 다른 사용자 count/snapshot/version/source가 노출되지 않는다 <!-- omo:id=accept-planner-nutrition-owner-scope;stage=2;scope=backend;review=3,6 -->
- [x] `ensurePublicUserRow`/`ensureUserBootstrapState`는 환경·테스트 사전 준비에서 nutrition 측정 전에 끝나며 GET route/service가 bootstrap을 호출하지 않는다 <!-- omo:id=accept-planner-nutrition-bootstrap-boundary;stage=2;scope=backend;review=3,6 -->
- [x] bootstrap 뒤 user row와 기본 `아침/점심/저녁` 3 columns를 확인하고, endpoint 호출 전후 user/column/Meal/product entry/snapshot/version/current/source write가 0이다 <!-- omo:id=accept-planner-nutrition-read-only;stage=2;scope=backend;review=3,6 -->
- [x] production/staging와 외부 provider write가 0이다 <!-- omo:id=accept-planner-nutrition-production-zero;stage=2;scope=shared;review=3,6 -->

## Performance / Real DB

- [x] owner/date scope가 DB query 전에 적용된다 <!-- omo:id=accept-planner-nutrition-query-scope;stage=2;scope=backend;review=3,6 -->
- [x] meals range 1회 + recipe snapshot `.in` 1회 + 기존 product entry RPC 1회의 bounded read이며 날짜/column/entry별 N+1이 없다 <!-- omo:id=accept-planner-nutrition-no-n-plus-one;stage=2;scope=backend;review=3,6 -->
- [x] non-5432 isolated PostgreSQL 17 runner가 관련 migration과 실제 bootstrap을 적용한다 <!-- omo:id=accept-planner-nutrition-pg-runner;stage=2;scope=backend;review=3,6 -->
- [x] real DB에서 recipe direct/estimated/mixed snapshots, product complete/partial/unavailable direct pins, aggregate mixed, old/current pin, source-version 분리, cross-owner zero leak를 검증한다 <!-- omo:id=accept-planner-nutrition-pg-cases;stage=2;scope=backend;review=3,6 -->
- [x] current product DB에 없는 estimated/mixed quality/warning field를 fixture나 schema에 추가하지 않는다 <!-- omo:id=accept-planner-nutrition-product-fixture-contract;stage=2;scope=backend;review=3,6 -->
- [x] case/process/socket/temp directory cleanup 뒤 scoped row/process가 남지 않는다 <!-- omo:id=accept-planner-nutrition-pg-cleanup;stage=2;scope=backend;review=3,6 -->
- [ ] fixture browser는 `lib/mock/qa-fixtures.ts`와 `qa/fixtures/slices-01-05.json`을 `pnpm dev:qa-fixtures`로 실행하고 real local DB는 `pnpm local:reset:demo` 후 `pnpm dev:local-supabase`로 구분한다 <!-- omo:id=accept-planner-nutrition-fixture-reset-path;stage=4;scope=shared;review=6 -->

## PLANNER_WEEK UI

- [ ] 주간 범위에 `계획 영양` label과 compact kcal/incomplete indicator가 있다 <!-- omo:id=accept-planner-nutrition-week-summary;stage=4;scope=frontend;review=5,6 -->
- [ ] 날짜 카드에는 compact kcal/incomplete indicator만 있고 핵심 5종 표를 반복하지 않는다 <!-- omo:id=accept-planner-nutrition-day-compact;stage=4;scope=frontend;review=5,6 -->
- [ ] complete/partial/unavailable가 `총량/최소/정보 준비 중`으로 구분되고 missing을 0으로 표시하지 않는다 <!-- omo:id=accept-planner-nutrition-week-missing-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] summary loading/error가 기존 week navigation/day cards/Recipe Meal/product rows를 지우지 않는다 <!-- omo:id=accept-planner-nutrition-week-soft-state;stage=4;scope=frontend;review=5,6 -->
- [ ] 주 이동의 늦은 이전 응답이 현재 범위 summary를 덮지 않는다 <!-- omo:id=accept-planner-nutrition-week-request-race;stage=4;scope=frontend;review=5,6 -->
- [ ] summary가 first viewport day overview와 기존 primary CTA를 과도하게 밀지 않는다 <!-- omo:id=accept-planner-nutrition-week-hierarchy;stage=4;scope=frontend;review=5,6 -->

## MEAL_SCREEN UI

- [ ] 선택 날짜 응답의 현재 `column_id` summary로 끼니 핵심 5종을 표시한다 <!-- omo:id=accept-planner-nutrition-meal-core-five;stage=4;scope=frontend;review=5,6 -->
- [ ] `incomplete_entry_count`를 combined 확인 필요 count로 표시하고 문서 밖 별도 count field를 요구하지 않는다 <!-- omo:id=accept-planner-nutrition-meal-incomplete;stage=4;scope=frontend;review=5,6 -->
- [ ] `direct/estimated/mixed/null`을 사용자용 품질 문구로 구분하고 estimated/mixed에 예상 의미를 보존한다 <!-- omo:id=accept-planner-nutrition-meal-quality;stage=4;scope=frontend;review=5,6 -->
- [ ] aggregate warnings를 사용자용 누락/예상 안내로 표시하고 raw code/secret를 그대로 노출하지 않는다 <!-- omo:id=accept-planner-nutrition-meal-warnings;stage=4;scope=frontend;review=5,6 -->
- [ ] summary loading/error가 기존 entry list와 sticky `[식사 추가]` CTA를 지우지 않는다 <!-- omo:id=accept-planner-nutrition-meal-soft-state;stage=4;scope=frontend;review=5,6 -->
- [ ] 날짜/column 이동 또는 retry의 stale response가 현재 끼니를 덮지 않는다 <!-- omo:id=accept-planner-nutrition-meal-request-race;stage=4;scope=frontend;review=5,6 -->
- [ ] entry가 하나도 없는 scope는 `계획 영양 정보 없음`이며 false `0 kcal`나 0 합계를 표시하지 않는다 <!-- omo:id=accept-planner-nutrition-ui-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only nutrition summary 자체에는 mutation/repin control이 없고 기존 entry control만 기존 영역에 남는다 <!-- omo:id=accept-planner-nutrition-ui-read-only;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized는 기존 로그인 안내 뒤 week/date/column return context를 복원한다 <!-- omo:id=accept-planner-nutrition-ui-unauthorized-return;stage=4;scope=frontend;review=5,6 -->

## Browser / Authority / Accessibility

- [ ] Stage 4 전에 PLANNER_WEEK/MEAL_SCREEN current-state before를 각각 390/320/desktop 1280에서 확보한다 <!-- omo:id=accept-planner-nutrition-before-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 후 두 화면의 after를 같은 390/320/desktop 1280에서 확보하고 before와 짝지어 비교한다 <!-- omo:id=accept-planner-nutrition-after-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] complete/partial/unavailable/mixed/loading/error/empty/stale-response state evidence가 있다 <!-- omo:id=accept-planner-nutrition-state-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px에서 CTA/문구/핵심 5종/indicator가 잘리거나 겹치지 않고 touch target이 44px다 <!-- omo:id=accept-planner-nutrition-evidence-320;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 1280에서 기존 planner/meal hierarchy와 content width가 안정적이다 <!-- omo:id=accept-planner-nutrition-evidence-desktop;stage=4;scope=frontend;review=5,6 -->
- [ ] page-level horizontal overflow가 없고 기존 localized scroll/anchor return/focus가 보존된다 <!-- omo:id=accept-planner-nutrition-scroll-focus;stage=4;scope=frontend;review=5,6 -->
- [ ] axe, keyboard, screen-reader label, color 이외 incomplete 표현이 통과한다 <!-- omo:id=accept-planner-nutrition-accessibility;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA report/eval과 `pnpm verify:frontend`가 green이다 <!-- omo:id=accept-planner-nutrition-exploratory;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh authority precheck/Stage 5/final authority/Stage 6에 unresolved blocker/important가 0이다 <!-- omo:id=accept-planner-nutrition-authority;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Vitest / API / Service

- [x] aggregate nutrient/quality/source/incomplete pure logic을 단위 테스트한다 <!-- omo:id=accept-planner-nutrition-vitest-aggregate;stage=2;scope=backend;review=3,6 -->
- [x] route query/envelope/auth/exact shape/no-extra-field를 테스트한다 <!-- omo:id=accept-planner-nutrition-vitest-api;stage=2;scope=backend;review=3,6 -->
- [x] pin scaling/current-switch/dedupe/cross-owner/bounded query를 service/read-model 테스트로 고정한다 <!-- omo:id=accept-planner-nutrition-vitest-read-model;stage=2;scope=backend;review=3,6 -->
- [x] Stage 2 RED→GREEN 근거를 남기고 구현자가 자기 Stage 3 승인을 하지 않는다 <!-- omo:id=accept-planner-nutrition-tdd-role-split;stage=2;scope=shared;review=3,6 -->

### Playwright / UI

- [ ] PLANNER_WEEK week/day compact summary와 range navigation/stale guard를 검증한다 <!-- omo:id=accept-planner-nutrition-playwright-week;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 핵심 5종/incomplete/quality/warning/soft-state를 검증한다 <!-- omo:id=accept-planner-nutrition-playwright-meal;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/desktop visual/a11y/scroll/CTA evidence를 검증한다 <!-- omo:id=accept-planner-nutrition-playwright-devices;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [x] independent fresh Codex Stage 1.5 exact-head docs review/repair-final approval — 2026-07-17, repaired fingerprint `83f54e3942b40ceb46af2f917d6981f111a18060e4139ee7a96727651d05f315`, `RE_REVIEW_APPROVED 0/0/0`
- [ ] full local Supabase/PostgREST/auth claim real browser smoke
- [ ] physical iOS/Android narrow device와 실제 screen reader 확인
- [ ] production-scale query plan/large entry count/RLS cost 측정

## Scope Guard

- [x] actual consumption/goal/medical/OCR/barcode/dining-out/meal-kit이 diff에 없다 <!-- omo:id=accept-planner-nutrition-future-excluded;stage=2;scope=shared;review=3,6 -->
- [x] generic prep/size/edible field, cooking-loss model, density, relation chain이 diff에 없다 <!-- omo:id=accept-planner-nutrition-model-expansion-excluded;stage=2;scope=shared;review=3,6 -->
- [x] 문서에 없는 endpoint/query/field/status/error/DB surface가 없다 <!-- omo:id=accept-planner-nutrition-contract-no-expansion;stage=2;scope=shared;review=3,6 -->
