# Acceptance Checklist: recipe-nutrition-calculation

> 이 acceptance는 Stage 2~6 living closeout이다. 체크는 테스트, real DB smoke, 브라우저 evidence가 생긴 뒤에만 한다. `Manual Only`를 제외한 모든 항목은 구현 merge 전에 닫혀야 한다.

## Happy Path

- [x] `GET /recipes/{id}`가 기존 상세 field를 보존하면서 additive non-null `nutrition` object를 `{ success, data, error }` envelope로 반환한다 <!-- omo:id=accept-recipe-additive-envelope;stage=2;scope=backend;review=3,6 -->
- [x] current snapshot이 있는 recipe는 핵심 5종, base servings, scalable/fixed vectors, status/quality/count/warnings/sources/snapshot metadata를 공식 shape로 반환한다 <!-- omo:id=accept-current-snapshot-payload;stage=2;scope=backend;review=3,6 -->
- [x] 기본 인분의 complete amount 또는 partial known amount가 scalable/fixed vector 합과 일치한다 <!-- omo:id=accept-vector-base-sum;stage=2;scope=backend;review=3,6 -->
- [ ] 선택 인분 값이 nutrient별 `scalable * selected/base + fixed`와 일치하고 fixed 기여는 비례하지 않는다 <!-- omo:id=accept-selected-serving-formula;stage=4;scope=shared;review=5,6 -->
- [x] `POST /meals`가 current snapshot이 있으면 ID를 pin하고 없으면 null로 Recipe Meal 생성에 성공한다 <!-- omo:id=accept-meal-nullable-pin;stage=2;scope=backend;review=3,6 -->
- [ ] Recipe Detail이 `1인분 기준 예상 영양`, 1인분 기준값, 선택 인분 전체값을 보여주고 기존 CTA·재료·조리 단계 흐름을 유지한다 <!-- omo:id=accept-recipe-detail-card;stage=4;scope=frontend;review=5,6 -->

## Calculator / Unit Conversion

- [x] `g/kg` 질량 경로가 승인 profile 기준으로 정확 계산된다 <!-- omo:id=accept-unit-mass-direct;stage=2;scope=backend;review=3,6 -->
- [x] `100mL` profile과 `mL/L/tbsp/tsp/cup` 입력은 g 환산 없이 부피 기준으로 직접 계산된다 <!-- omo:id=accept-unit-volume-direct;stage=2;scope=backend;review=3,6 -->
- [x] 그 밖의 부피는 tbsp 15mL, tsp 5mL, cup 200mL와 승인 `VOLUME_G6/G10/G15/G20/G25`만 사용한다 <!-- omo:id=accept-unit-approved-volume-class;stage=2;scope=backend;review=3,6 -->
- [x] 대표 부피 예상 질량은 `mL * representative_g / 15`이고 representative 경로가 있으면 quality가 direct가 아니다 <!-- omo:id=accept-estimated-volume-quality;stage=2;scope=backend;review=3,6 -->
- [x] `개`는 ingredient·크기·손질/가식 상태가 모두 정확히 일치하는 active approved piece weight만 사용한다 <!-- omo:id=accept-unit-exact-piece;stage=2;scope=backend;review=3,6 -->
- [x] `TO_TASTE`, amount 결측, 미지원 단위, 변환 경로 없음은 0이 아니라 missing reason으로 남는다 <!-- omo:id=accept-unit-missing-not-zero;stage=2;scope=backend;review=3,6 -->
- [x] inactive/revoked/superseded/stale/needs_source_check source·profile·link·assignment·piece row를 fallback으로 소비하지 않는다 <!-- omo:id=accept-approved-current-only;stage=2;scope=backend;review=3,6 -->
- [x] optional nutrient는 source 기여가 있을 때만 같은 vector/value key로 제공되고 누락 key를 0으로 만들지 않는다 <!-- omo:id=accept-optional-nutrients;stage=2;scope=backend;review=3,6 -->
- [x] 검증된 실제 source 값 0과 missing/trace/blank/parse error가 구분된다 <!-- omo:id=accept-observed-zero;stage=2;scope=backend;review=3,6 -->

## Completeness / Quality / Display Semantics

- [x] nutrient별 complete/partial/unavailable이 target 기여 기준으로 독립 판정된다 <!-- omo:id=accept-nutrient-status;stage=2;scope=backend;review=3,6 -->
- [x] 핵심 5종 모두 complete일 때만 전체 complete이고 하나 이상 계산 가능하지만 미완전하면 partial이다 <!-- omo:id=accept-overall-status;stage=2;scope=backend;review=3,6 -->
- [x] 계산 가능한 기여가 전혀 없으면 전체 unavailable, quality null, amount/known amount null이다 <!-- omo:id=accept-unavailable-null;stage=2;scope=backend;review=3,6 -->
- [ ] partial은 amount null, known amount, `display_mode='minimum'`을 보존하고 UI는 `최소 X`로 표시한다 <!-- omo:id=accept-partial-minimum;stage=4;scope=shared;review=5,6 -->
- [x] direct/estimated/mixed quality가 completeness와 독립적으로 계산된다 <!-- omo:id=accept-quality-independent;stage=2;scope=backend;review=3,6 -->
- [ ] 대표 환산 포함 값은 UI에서 `약`/`예상`으로 표시되고 정밀 실측값처럼 표현되지 않는다 <!-- omo:id=accept-estimated-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] unavailable은 `0 kcal`가 아니라 `정보 준비 중`으로 표시된다 <!-- omo:id=accept-unavailable-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] reflected/target count와 missing reason 설명이 partial 사용자가 이해할 수 있게 표시된다 <!-- omo:id=accept-coverage-copy;stage=4;scope=frontend;review=5,6 -->

## Snapshot / Data Integrity

- [x] canonical input 정렬과 동일 calculation version은 동일 input hash·vector·status·warning 순서를 만든다 <!-- omo:id=accept-deterministic-input;stage=2;scope=backend;review=3,6 -->
- [x] `(recipe_id,input_hash,calculation_version)` replay는 duplicate logical snapshot/write를 만들지 않는다 <!-- omo:id=accept-snapshot-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] 새 snapshot insert와 current false/true 전환은 한 transaction이며 recipe별 current가 최대 1개다 <!-- omo:id=accept-current-atomic;stage=2;scope=backend;review=3,6 -->
- [x] snapshot payload와 `warnings_json`은 UPDATE/DELETE되지 않고 API warnings와 순서·값까지 1:1이다 <!-- omo:id=accept-snapshot-immutable-warning;stage=2;scope=backend;review=3,6 -->
- [x] snapshot `sources_json`은 실제 기여한 승인 nutrition/conversion/piece evidence source만 exact 6-field canonical tuple로 pin하고 UPDATE/DELETE되지 않는다 <!-- omo:id=accept-snapshot-immutable-sources;stage=2;scope=backend;review=3,6 -->
- [x] recipe 계산 authority는 snapshot nutrient status + scalable/fixed vector + base servings며 `nutrition_profile_id`/`recipe_calculation` profile row에 의존하지 않는다 <!-- omo:id=accept-snapshot-single-authority;stage=2;scope=backend;review=3,6 -->
- [x] complete vector 합=amount, partial vector 합=known amount DB constraint/service validation이 적용된다 <!-- omo:id=accept-vector-db-integrity;stage=2;scope=backend;review=3,6 -->
- [x] reflected count는 target count를 넘지 않고 unavailable quality는 null이라는 DB constraint가 적용된다 <!-- omo:id=accept-status-db-integrity;stage=2;scope=backend;review=3,6 -->
- [x] current 변경/rollback 후에도 이미 Meal에 pin된 과거 snapshot을 계속 조회할 수 있다 <!-- omo:id=accept-pinned-history;stage=2;scope=backend;review=3,6 -->
- [x] 신규 Meal pin origin은 `created`, one-time 기존 Meal backfill은 `backfill`, snapshot null이면 origin null이다 <!-- omo:id=accept-meal-origin;stage=2;scope=backend;review=3,6 -->
- [x] recipe/source/profile/calculation 변경이 이미 pin된 Meal을 silent repin하지 않는다 <!-- omo:id=accept-no-silent-repin;stage=2;scope=backend;review=3,6 -->
- [x] backfill은 FoodSafety-30 exact scope 밖의 recipe/ingredient/Meal을 수정하지 않는다 <!-- omo:id=accept-bounded-backfill;stage=2;scope=backend;review=3,6 -->
- [x] injected failure는 현재 전환/Meal batch 전체를 rollback하고 이전 current/pin을 보존한다 <!-- omo:id=accept-transaction-rollback;stage=2;scope=backend;review=3,6 -->

## State / Policy / Regression

- [x] `POST /meals`는 Recipe Meal 전용이며 product field/snapshot ID 주입을 `422 VALIDATION_ERROR`로 거부한다 <!-- omo:id=accept-recipe-only-meal;stage=2;scope=backend;review=3,6 -->
- [x] Meal status는 `registered -> shopping_done -> cook_done`만 유지하고 영양 계산이 상태를 바꾸지 않는다 <!-- omo:id=accept-meal-status-unchanged;stage=2;scope=backend;review=3,6 -->
- [x] 독립 요리는 Meal 상태/pin을 만들거나 바꾸지 않는다 <!-- omo:id=accept-standalone-cook-unchanged;stage=2;scope=backend;review=3,6 -->
- [ ] `COOK_MODE`에는 인분 조절 UI가 추가되지 않는다 <!-- omo:id=accept-no-cook-serving-control;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 recipe detail 좋아요/저장/플래너/요리 액션과 삭제 endpoint tombstone이 회귀하지 않는다 <!-- omo:id=accept-recipe-actions-regression;stage=4;scope=shared;review=5,6 -->
- [x] 제품 catalog/planner/aggregate table·API·UI가 이 slice diff에 포함되지 않는다 <!-- omo:id=accept-product-scope-exclusion;stage=2;scope=shared;review=3,6 -->

## Error / Permission / Security

- [x] snapshot이 없는 recipe detail은 정상 200 unavailable payload이며 404/500 또는 0값으로 위장되지 않는다 <!-- omo:id=accept-no-snapshot-normal-state;stage=2;scope=backend;review=3,6 -->
- [ ] 비로그인 Meal 추가는 기존 401 로그인 안내 뒤 같은 recipe/planner action으로 복귀한다 <!-- omo:id=accept-login-return-action;stage=4;scope=frontend;review=5,6 -->
- [x] 타 사용자 recipe/column/leftover/Meal/snapshot mutation은 RLS·service guard에서 거부된다 <!-- omo:id=accept-owner-rls;stage=2;scope=backend;review=3,6 -->
- [x] anon/authenticated 사용자는 snapshot payload/current pointer/backfill origin을 임의 작성·수정·삭제할 수 없다 <!-- omo:id=accept-snapshot-write-guard;stage=2;scope=backend;review=3,6 -->
- [x] 기존 401/403/404/409/422 envelope과 fields shape가 유지된다 <!-- omo:id=accept-error-contract;stage=2;scope=backend;review=3,6 -->
- [x] invalid servings/unit/non-finite amount가 snapshot/current write 전에 거부된다 <!-- omo:id=accept-invalid-calculation-input;stage=2;scope=backend;review=3,6 -->
- [x] key/auth query/cookie/raw provider payload·row/private path/타 사용자 식별자가 DB report/log/API/browser bundle에 남지 않는다 <!-- omo:id=accept-secret-raw-boundary;stage=2;scope=shared;review=3,6 -->
- [x] source attribution은 pin된 `provider/dataset/source_version/data_basis_date/license/source_url` exact 6-field projection만 null-first Unicode ordinal tuple로 stable dedupe/order해 반환한다 <!-- omo:id=accept-source-attribution;stage=2;scope=backend;review=3,6 -->
- [x] source/profile/evidence current가 나중에 바뀌어도 기존 Meal은 pin된 snapshot 출처를 유지하고 read 시 live relation으로 재생성하지 않는다 <!-- omo:id=accept-pinned-source-history;stage=2;scope=backend;review=3,6 -->

## Frontend States / Accessibility / Authority

- [ ] 영양 영역 loading skeleton이 기존 CTA·재료·스텝을 가리거나 큰 layout shift를 만들지 않는다 <!-- omo:id=accept-ui-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] complete/partial/unavailable/error/low-quality 상태가 fixture와 실제 브라우저에서 서로 구분된다 <!-- omo:id=accept-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] 영양 API 오류가 기존 Recipe Detail 전체를 막지 않고 영양 영역에만 안내/재시도를 제공한다 <!-- omo:id=accept-ui-soft-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 영양 영역은 read-only이며 편집 가능한 source/profile/snapshot control을 노출하지 않는다 <!-- omo:id=accept-ui-read-only;stage=4;scope=frontend;review=5,6 -->
- [ ] 핵심 상태·값·단위·예상/최소 의미가 색상만이 아니라 텍스트/접근 가능한 이름으로 전달된다 <!-- omo:id=accept-ui-a11y-semantics;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px와 320px에서 전체 가로 overflow, CTA 잘림, 핵심 copy 붕괴, touch target 축소가 없다 <!-- omo:id=accept-mobile-sentinels;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop에서 영양 카드가 기존 detail grid/section width와 시각 위계를 깨지 않는다 <!-- omo:id=accept-desktop-layout;stage=4;scope=frontend;review=5,6 -->
- [ ] before/after 390px·320px·desktop 및 partial/unavailable evidence가 authority report에 연결된다 <!-- omo:id=accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 5/final authority report의 blocker가 0이고 Design Status가 confirmed로 동기화된다 <!-- omo:id=accept-authority-pass;stage=4;scope=frontend;review=5,6 -->

## Performance / Operational Readiness

- [x] Recipe Detail은 current snapshot과 attribution을 bounded join/batch로 읽고 ingredient별 N+1 query를 하지 않는다 <!-- omo:id=accept-read-performance;stage=2;scope=backend;review=3,6 -->
- [x] backfill은 batch size/cursor/checkpoint와 dry-run report를 사용하고 전체 table lock/무제한 메모리 적재를 피한다 <!-- omo:id=accept-backfill-performance;stage=2;scope=backend;review=3,6 -->
- [x] concurrent snapshot writer가 recipe별 current 1개와 deterministic replay를 보존한다 <!-- omo:id=accept-concurrent-writer;stage=2;scope=backend;review=3,6 -->
- [x] rollback은 snapshot payload/과거 Meal pin을 삭제하지 않고 이전 current를 복원한다 <!-- omo:id=accept-operational-rollback;stage=2;scope=backend;review=3,6 -->
- [ ] known limitations에 13/124 coverage, 21/30 linked recipes, conversion/piece sparse, 조리 손실 미모델링, PG14.5/17 위험이 남는다 <!-- omo:id=accept-known-limitations;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions

- [x] official five docs와 SOT가 v1.7.19/v1.5.25/v1.3.22/v1.3.20/v1.2.24로 일치한다 <!-- omo:id=accept-official-docs;stage=2;scope=shared;review=3,6 -->
- [x] PR #1005 merge/reviewed head와 PR #1006 merge/reviewed head exact ancestry를 검증한다 <!-- omo:id=accept-predecessor-commits;stage=2;scope=shared;review=3,6 -->
- [x] exact pilot logical batch/handoff checksum과 30 recipe/124 ingredient closure를 검증한다 <!-- omo:id=accept-pilot-pin;stage=2;scope=backend;review=3,6 -->
- [ ] calculator/API/frontend complete/partial/unavailable fixture가 준비된다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB에 migration, FoodSafety seed, approved predecessor rows, RLS가 적용된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=backend;review=3,6 -->
- [ ] Meal smoke용 owner user와 기존 bootstrap `meal_plan_columns`가 owning flow로 생성됐음을 검증한다 <!-- omo:id=accept-bootstrap-column;stage=2;scope=backend;review=3,6 -->
- [x] production/staging 별도 승인 없이는 snapshot/public data load write가 0이다 <!-- omo:id=accept-production-zero-writes;stage=2;scope=backend;review=3,6 -->

## Automation Split

### Vitest / Unit / Integration

- [x] 순수 calculator 산술, unit priority, representative classes, exact piece, missing/zero, vector formula를 단위 테스트로 고정한다 <!-- omo:id=accept-vitest-calculator;stage=2;scope=backend;review=3,6 -->
- [x] hash/idempotency/current switch/warning order/backfill/rollback을 service/integration test로 고정한다 <!-- omo:id=accept-vitest-snapshot;stage=2;scope=backend;review=3,6 -->
- [x] PostgreSQL integration에서 constraints/RLS/owner/concurrency/transaction rollback을 검증한다 <!-- omo:id=accept-db-integration;stage=2;scope=backend;review=3,6 -->
- [ ] API complete/partial/unavailable/no-snapshot/error와 기존 recipe response 회귀를 검증한다 <!-- omo:id=accept-api-integration;stage=2;scope=backend;review=3,6 -->
- [ ] frontend component에서 한국어 copy, status, selected servings, read-only/error fallback을 검증한다 <!-- omo:id=accept-frontend-vitest;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] 390px mobile에서 complete/partial selected-servings 흐름과 로그인 return-to-action을 검증한다 <!-- omo:id=accept-playwright-390;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px sentinel에서 unavailable/low-quality copy와 no-overflow를 검증한다 <!-- omo:id=accept-playwright-320;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop에서 error soft-fallback과 기존 CTA/재료/스텝 회귀를 검증한다 <!-- omo:id=accept-playwright-desktop;stage=4;scope=frontend;review=5,6 -->
- [ ] screenshot evidence와 accessibility smoke가 deterministic fixture server와 real DB manual smoke로 구분된다 <!-- omo:id=accept-playwright-evidence-split;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 사람 검수자가 partial 누락 사유와 `약/예상/최소/정보 준비 중` 문구가 의료적 정확성·실제 섭취를 암시하지 않는지 확인한다
- [ ] 격리 real DB에서 FoodSafety-30 dry-run/apply/replay/current switch/Meal pin/rollback report를 확인한다
- [ ] 운영 배포 전 source별 출처표시·라이선스 문구와 production promotion 승인을 별도로 확인한다
- [ ] 실제 390px/320px 기기와 desktop에서 긴 recipe 제목/재료/영양 copy의 위계와 스크롤을 확인한다
