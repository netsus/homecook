# Slice: planner-nutrition-summary

## Goal

사용자는 플래너에 등록한 Recipe Meal과 완제품 entry의 **생성 당시 고정 영양값**만으로 끼니·날짜·최대 7일 범위의 `계획 영양`을 확인할 수 있다. 합계는 실제 섭취량이나 목표 달성률이 아니며, 계산할 수 없는 값은 0으로 채우지 않고 `partial / unavailable`, `최소`, `확인 필요` 의미를 유지한다.

이 슬라이스는 공식 `GET /planner/nutrition` 하나를 추가하고, 기존 `PLANNER_WEEK`에는 compact 계획 열량만, `MEAL_SCREEN`에는 끼니 핵심 5종 상세와 품질·누락 안내를 연결한다. 저장 구조와 기존 planner/meals 응답은 바꾸지 않는 read-only 세로 슬라이스다.

## Branches

- 문서: `docs/planner-nutrition-summary`
- 백엔드: `feature/be-planner-nutrition-summary`
- 프론트엔드: `feature/fe-planner-nutrition-summary`

## In Scope

- 화면:
  - `PLANNER_WEEK`: 주간 범위와 날짜 카드에 compact `계획 영양` 열량 + `incomplete_entry_count` indicator
  - `MEAL_SCREEN`: 선택 날짜·끼니 column의 핵심 5종, `complete / partial / unavailable`, `direct / estimated / mixed`, aggregate warning 안내
- API — 정확히 1개:
  - `GET /planner/nutrition?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - 포함 범위는 최대 7일이며 응답은 공식 `range -> summary -> days -> columns` 구조다.
- 합산 source:
  - Recipe Meal의 `recipe_nutrition_snapshot_id`
  - ProductPlannerEntry의 `product_nutrition_version_id`
  - 기존 entry의 plan date, column, planned servings 또는 quantity
- DB 영향:
  - 읽기: `meals`, `recipe_nutrition_snapshots`, `product_planner_entries`, `food_product_nutrition_versions`, `meal_plan_columns`
  - 신규 table, column, trigger, RPC, index, write 없음
- Schema Change:
  - [x] 없음 — read-only endpoint와 UI projection만 추가
  - [ ] 있음

## Out of Scope

- 실제 섭취량, 먹음/건너뜀, 영양 목표, 목표 달성률, 의료·질환 코칭
- `cook_done`을 섭취 완료로 해석하는 것
- recipe/product snapshot 또는 version의 생성·수정·current 전환·repin
- 기존 Meal의 nullable snapshot backfill 재실행 또는 current snapshot 자동 대체
- 새로운 영양소, API endpoint, query/body/response field, HTTP status, error code, workflow status, DB surface
- 기존 `GET /planner`, `GET /meals`, `POST /meals`, product entry mutation shape 변경
- entry별 새로운 missing-reason API field. 공식 aggregate `warnings[]`와 `incomplete_entry_count`만 소비한다.
- 조리 손실률·잔존율·국물 폐기율·튀김유 흡수율 정밀 모델링
- generic `preparation_state / size_code / edible_state`를 recipe row에 추가하는 것
- OCR, 바코드, 외식, 밀키트, generic density, relation chaining, 임의 `g↔ml`
- production/staging write, 외부 provider write, raw provider row/payload/secret 출력·커밋

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `recipe-nutrition-calculation` | merged — backend PR #1012 merge `78560d665a38b127946c1148a7b59f4930419521`, UI/authority PR #1013 merge `3b65ba227c0e0946260c4c9d7c6851c72bb0fd92` | [x] |
| `prepared-food-planner-entry` | merged — docs/backend/frontend/closeout ancestry, latest merge `64d2b5145d1e96772eb7dfee4d4057cafcab8f64` | [x] |
| nutrition/products/planner official contract | merged — 요구사항 v1.7.20, 화면 v1.5.26, flow v1.3.23, DB v1.3.21, API v1.2.25 | [x] |
| independent fresh Codex Stage 1.5 docs gate | 2026-07-17 `RE_REVIEW_APPROVED`; initial B/I/S `0/5/0` → repair-final → re-review `0/0/0`, reviewed fingerprint `83f54e3942b40ceb46af2f917d6981f111a18060e4139ee7a96727651d05f315` | [x] |

> 사용자 승인 nutrition/products/planner Codex-only 예외에 따라 Stage 1 author, internal 1.5 reviewer/repair-final, Stage 2 backend TDD implementer, Stage 3 reviewer, Stage 4 implementer, authority precheck, Stage 5/final authority, Stage 6 reviewer를 fresh 역할로 분리한다. 작성자와 구현자는 자기 변경을 승인하지 않는다.
>
> 이 승인은 repaired Stage 1 docs와 future evidence plan에만 적용된다. Stage 4 UI/screenshots/authority precheck, Stage 5, final authority, Stage 6는 아직 pending이다.

## Proposal Decision

| 선택지 | 과거 계획 재현 | 결측 의미 | 기존 계약 영향 | 판정 |
| --- | --- | --- | --- | --- |
| current recipe/product 영양을 매 조회 재계산 | current 변경 때 과거 합계 변동 | 과거 warning/source 유실 | pin 계약 위반 | 거부 |
| 기존 `GET /planner`/`GET /meals`에 합계 필드 추가 | pin 사용 가능 | 가능 | 공식 별도 endpoint와 기존 shape 변경 | 거부 |
| `GET /planner/nutrition`에서 pin만 bounded batch 합산 | immutable pin 보존 | partial/unavailable 유지 | 공식 계약 그대로 | 채택 |

## Backend First Contract

### Request / Envelope / Errors

- endpoint는 정확히 `GET /planner/nutrition` 하나다.
- query는 정확히 `start_date`, `end_date`이며 둘 다 유효한 ISO date여야 한다.
- 범위는 양 끝 날짜를 포함하고 최대 7일이다. 누락·잘못된 날짜·역전·7일 초과는 기존 `422 VALIDATION_ERROR` envelope로 거절한다.
- 비로그인은 기존 `401 UNAUTHORIZED`, 예상하지 못한 read 실패는 기존 `500 INTERNAL_ERROR`를 사용한다.
- 모든 JSON은 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지한다. 새 status/error code를 만들지 않는다.
- `ensurePublicUserRow`와 `ensureUserBootstrapState`는 auth/users 흐름 또는 테스트 환경 사전 준비에서만 끝낸다. 측정 시작 뒤 `GET /planner/nutrition` route/service는 두 bootstrap 함수를 호출하지 않는다.

### Exact Success Shape

- `data.range`: `{ start_date, end_date }`
- `data.summary`:
  - `nutrition`: aggregate 공통 shape
  - `recipe_entry_count`
  - `product_entry_count`
- `data.days[]`:
  - `plan_date`
  - `nutrition`: 날짜 aggregate
  - `columns[]`: `{ column_id, nutrition }`
- 모든 aggregate `nutrition`은 정확히 아래 field만 사용한다.
  - `basis: { amount: 1, unit: "range" }`
  - 핵심 5종 `values`
  - `calculation_status`
  - `calculation_quality`
  - `incomplete_entry_count`
  - `warnings`
  - `sources`
- Recipe Detail 전용 `availability_reason`, `base_servings`, `scalable_values`, `fixed_values`, `snapshot_id`, `calculated_at`, 반영/대상 재료 수를 aggregate에 추가하지 않는다.
- Product version 식별자나 entry 식별자를 aggregate 응답에 새로 노출하지 않는다.

### Pinned Entry Projection

- Recipe Meal은 row에 pin된 `recipe_nutrition_snapshot_id`만 읽는다. null이면 current snapshot을 찾아 채우거나 repin하지 않고 unavailable entry로 센다.
- Recipe Meal의 계획값은 pin된 snapshot의 `base_servings`, `scalable_values_json`, `fixed_values_json`, `nutrient_status_json`만으로 `scalable × planned_servings / base_servings + fixed`를 적용한다.
- ProductPlannerEntry는 row에 pin된 `product_nutrition_version_id`, 그 version의 immutable nutrition/basis relation, entry quantity만 사용한다. current version이나 current catalog metadata를 다시 적용하지 않는다.
- 기존 recipe/product read arrays를 합계 source와 다시 결합해 같은 entry를 두 번 더하지 않는다. Recipe Meal과 ProductPlannerEntry는 각 storage identity당 한 번만 센다.
- current source/profile/relation 조회로 과거 `warnings`나 `sources`를 재생성하지 않는다.

### Nutrient Completeness

- MVP 핵심 5종은 `energy_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`, `sodium_mg`다.
- 실제 `complete` 0만 합계의 0이다. null, missing, unreadable, conversion failure, unavailable은 0으로 정규화하지 않는다.
- 영양소별 계산 가능한 모든 `complete.amount`와 `partial.known_amount`를 known sum에 반영한다.
- 해당 scope의 모든 entry가 그 nutrient에서 complete면 `complete / amount / total`이다.
- 하나라도 partial 또는 unavailable이고 계산 가능한 known sum이 있으면 `partial / amount=null / known_amount / minimum`이다.
- 모든 entry가 unavailable이면 `unavailable / amount=null / known_amount=null`이다.
- scope에 entry가 0개면 핵심 5종은 `unavailable`과 null amount/known_amount, quality null, incomplete count 0, warnings/sources 빈 배열이며 range entry count도 0이다. 빈 계획을 섭취 0으로 표현하지 않는다.
- scope에 포함된 entry 중 핵심 5종이 모두 complete가 아닌 entry는 `incomplete_entry_count`에 entry당 한 번 포함한다. 영양소마다 중복 count하지 않는다.
- aggregate `calculation_status`는 핵심 5종의 상태를 요약하되 unavailable을 complete로 승격하지 않는다.

### Quality / Warnings / Sources

- 계산 가능한 entry가 모두 `direct`면 aggregate도 `direct`, 모두 `estimated`면 `estimated`, 그 밖의 조합 또는 entry 자체가 `mixed`면 `mixed`다.
- 모든 entry가 unavailable이면 `calculation_quality=null`이다. completeness와 quality를 같은 의미로 합치지 않는다.
- 대표 환산이 기여한 `estimated/mixed`를 정밀 direct 값처럼 표현하지 않는다.
- `warnings[]`는 pin된 entry warning의 deterministic aggregate이며 원 snapshot/version 배열을 수정하지 않는다.
- `sources[]` item은 정확히 `provider`, `dataset`, `source_version`, `data_basis_date`, `license`, `source_url` 6개 field다.
- 각 range/day/column scope에서 exact tuple `(provider, dataset, source_version, data_basis_date, license, source_url)`을 한 번만 반환한다. 같은 source라도 `source_version`이 다르면 합치지 않는다.
- tuple은 위 field 순서의 null-first, Unicode ordinal 오름차순으로 stable dedupe/order한다.
- API key, 인증 query/cookie/token, raw fetch URL/row/payload, manifest checksum/storage path, service credential, 다른 사용자 ID를 source/log/error/browser bundle에 노출하지 않는다.

### Authorization / Query Shape / Performance

- auth user의 `meals`와 `product_planner_entries`만 날짜 범위와 owner scope를 DB query 전에 적용해 읽는다.
- 다른 사용자 pin, source, snapshot, product version 식별자는 count·error·payload로 유출하지 않는다.
- 최대 7일 범위를 entry 수와 무관한 bounded query 단계로 읽는다. 날짜·column·entry별 N+1을 허용하지 않는다.
- distinct recipe snapshot IDs는 `.in(...)` batch 1회로 읽고, product pins는 기존 `list_product_planner_entries` RPC 1회가 반환한 pinned projection을 사용해 memory에서 range/day/column projection을 만든다.
- endpoint는 read-only다. bootstrap 완료 뒤 nutrition request 측정을 시작하며, 호출 전후 `public.users`, `meal_plan_columns`, `meals`, `product_planner_entries`, recipe snapshot, product version/current, nutrition source 관련 row write가 0건이어야 한다.

### Current Implementation Handoff

- 신규 route는 기존 `app/api/v1/planner/route.ts`와 parser를 공유한다고 가정하지 않는다. 기존 planner parser는 최대 7일을 막지 않으므로 nutrition route가 inclusive 7-day validation을 직접 고정한다.
- 최소 bounded read shape는 `meals` owner/date range 1회, distinct pinned recipe snapshot IDs `.in(...)` 1회, 기존 `list_product_planner_entries` RPC 1회다. item/day/column loop 안에서 DB query를 호출하지 않는다.
- aggregate public type은 Recipe Detail nutrition type에 aggregate 전용 field를 억지로 섞지 않고 별도 planner nutrition type으로 둔다.
- MEAL_SCREEN은 새 entry별 recipe nutrition field를 요구하지 않는다. column aggregate + 기존 Recipe Meal/ProductPlannerEntry cards를 그대로 조합한다.
- 현재 회귀 기준은 `tests/planner-route.test.ts`, `tests/meals-route.test.ts`, `tests/prepared-food-planner-entry-read-model.test.ts`, `tests/recipe-nutrition-snapshot.test.ts`, `tests/planner-week-screen.test.tsx`, `tests/planner-meal-screen.test.tsx`다.

## Frontend Delivery Mode

- Design Status는 Stage 1에서 `temporary`다. Stage 4 구현과 screenshot evidence 후 `pending-review`, Stage 5·final authority·Stage 6 blocker 0 뒤에만 `confirmed`다.
- `PLANNER_WEEK`는 compact kcal + incomplete indicator만 표시한다. 핵심 5종 표와 warning 상세를 day card마다 반복하지 않는다.
- `MEAL_SCREEN`은 `start_date=end_date=선택 날짜` 응답의 `days[].columns[]`에서 현재 `column_id`를 찾아 핵심 5종 상세를 표시한다. 별도 column filter endpoint/query를 만들지 않는다.
- summary fetch의 loading/error가 기존 planner/meal entry 목록, week navigation, primary CTA를 지우지 않게 soft state로 분리한다.
- 주 이동·날짜/column 이동 시 늦게 도착한 이전 응답이 현재 화면을 덮지 않도록 abort 또는 latest-request guard를 둔다.
- empty: 선택 scope에 Recipe Meal과 ProductPlannerEntry가 모두 없으면 summary는 `계획 영양 정보 없음`으로 표시하고 `0 kcal` 또는 영양소 0 합계를 만들지 않는다.
- read-only: nutrition summary 안에는 생성·수정·삭제·repin control을 두지 않는다. 기존 Meal/ProductPlannerEntry mutation control은 기존 화면 영역에 그대로 남는다.
- unauthorized: 기존 로그인 안내를 사용하고, 로그인 뒤 사용자가 보던 week/date/column으로 돌아갈 return context를 보존한다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `PLANNER_WEEK`
- Required screens: `PLANNER_WEEK`, `MEAL_SCREEN`
- Visual artifacts: `ui/designs/PLANNER_WEEK.md`, `ui/designs/MEAL_SCREEN.md`
- Stage 1 critique brief: `ui/designs/critiques/planner-nutrition-summary-critique.md`
- Stage 4 evidence root: `ui/designs/evidence/planner-nutrition-summary/`
- Future authority report: `ui/designs/authority/PLANNER_WEEK-planner-nutrition-summary-authority.md`
- Authority status: `required`
- Notes: 기존 prepared-food-planner-entry의 day card, slot row, mixed entry, primary CTA, localized scroll, anchor return을 보존한다. 영양 summary가 첫 화면 day overview를 과도하게 밀면 summary metadata를 더 compact하게 만들고 planner mental model을 교체하지 않는다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 계약만 잠금, 구현·evidence·authority pending
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.20.md`
- `docs/화면정의서-v1.5.26.md`
- `docs/유저flow맵-v1.3.23.md`
- `docs/db설계-v1.3.21.md`
- `docs/api문서-v1.2.25.md`
- `docs/workpacks/recipe-nutrition-calculation/README.md`
- `docs/workpacks/prepared-food-planner-entry/README.md`
- `docs/engineering/tdd-vitest.md`
- `docs/engineering/playwright-e2e.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`

## QA / Test Data Plan

### Stage 2 TDD / Isolated PostgreSQL

- fresh Stage 2 implementer는 aggregate unit/API test를 먼저 작성하고 RED를 확인한 뒤 최소 구현을 추가한다.
- planned targets:
  - `tests/planner-nutrition-aggregate.test.ts`
  - `tests/planner-nutrition-api.test.ts`
  - `tests/planner-nutrition-read-model.test.ts`
  - `tests/planner-nutrition-postgres.integration.test.ts`
  - `scripts/run-planner-nutrition-postgres-integration.mjs`
- Stage 2 targeted command에는 위 신규 test와 현재 planner/meals/product/snapshot 회귀 test를 함께 넣는다.
- non-5432 isolated PostgreSQL 17에 predecessor migration을 순서대로 적용한다. 사용자 A/B의 `public.users` row를 만든 뒤 실제 `ensureUserBootstrapState`를 nutrition request **전에** 호출하고, 각 사용자 row와 기본 `아침/점심/저녁` 3개 `meal_plan_columns`가 존재하며 재호출이 멱등인지 확인한다.
- bootstrap 다음 recipe `direct/estimated/mixed` complete/partial/unavailable snapshots와 product `complete/partial/unavailable` direct pins, old/current version, same/different source-version tuple을 준비한다. 현재 product DB에는 별도 estimated/mixed quality/warning field가 없으므로 그런 product fixture를 만들지 않는다. aggregate `mixed`는 recipe estimated/mixed와 product direct의 조합으로 검증한다.
- bootstrap과 fixture 준비가 끝난 뒤 write 측정을 시작한다. route/service가 A의 최대 7일 범위만 읽고 B row를 유출하지 않으며, current switch 후에도 A의 old pins 합계가 같고 nutrition request 전후 target/planner 관련 write가 0인지 확인한다. route/service는 `ensureUserBootstrapState`를 호출하지 않는다.
- case 전후 scoped FK-order cleanup과 process/socket/temp directory `finally` cleanup을 검증한다. production/staging 접속 문자열은 허용하지 않는다.

#### Stage 2 Implementation Evidence — Pending Independent Stage 3 Review

- RED: aggregate 첫 실행은 `@/lib/server/planner-nutrition-summary` 모듈 부재, read-model 4개는 `readPlannerNutritionSummary is not a function`, API 9개는 route 모듈 부재, PostgreSQL runner는 파일 부재로 각각 실패했다. 실패를 확인한 뒤 최소 구현을 추가했다.
- GREEN/REFACTOR: 신규 aggregate/API/read-model과 기존 planner/meals/product/snapshot 회귀 묶음이 7 files, 45 tests로 통과했다.
- real PostgreSQL: non-5432 ephemeral PostgreSQL `17.10`에서 관련 6개 migration, 실제 `ensureUserBootstrapState`, owner A/B, recipe direct/estimated/mixed/null pin, product complete/partial/unavailable direct pin, old/current pin, source-version 분리, cross-owner zero leak, request 전후 target write 0, process/socket/temp cleanup을 1 file, 2 tests로 검증했다. unavailable product는 현재 manual writer가 energy를 요구하므로 isolated legacy/corrupt fixture에서 해당 validation trigger만 준비 구간에 한해 끄고 다시 켰으며, 서비스 측정 경로는 그대로 read-only였다.
- repository gate: `pnpm verify:backend`가 lint 0 errors(기존 무관 warning 4개), typecheck, product 1,550 passed/24 intended skipped, production build, security Playwright 12/12로 통과했다.
- 새 endpoint/query/field/status/error/DB surface, generic 손질·크기·가식 필드, migration/RPC/dependency를 추가하지 않았다. production/staging/provider write는 0이다.
- 이 기록은 Stage 2 구현 증거이며 Stage 3 승인으로 간주하지 않는다. fresh reviewer가 새 exact PR head를 독립 검수해야 한다.

### Stage 4 Browser / Exploratory / Real Local DB

- Stage 4 전에 현재 master의 `PLANNER_WEEK`, `MEAL_SCREEN`을 각각 `390 / 320 / desktop 1280`에서 before 캡처한다.
- Stage 4 후 같은 viewport의 after 캡처를 짝지어 비교한다. complete, partial/minimum, unavailable, mixed quality, loading, error/retry, empty/no-entry, stale range response를 evidence로 남긴다.
- `PLANNER_WEEK`는 compact week/day energy, incomplete indicator, first viewport day overview, week swipe/navigation, localized scroll, no page-level overflow를 검증한다.
- `MEAL_SCREEN`은 핵심 5종, combined incomplete count, warning/quality copy, entry list 보존, sticky primary CTA, 44px target, keyboard/focus, anchor return을 검증한다.
- `pnpm qa:explore -- --slice planner-nutrition-summary`와 `pnpm qa:eval`로 exploratory report/eval을 남긴다.
- fixture browser state는 현재 경로 `lib/mock/qa-fixtures.ts`와 `qa/fixtures/slices-01-05.json`을 Stage 4에서 확장하고 `pnpm dev:qa-fixtures`로 실행한다. recipe `direct/estimated/mixed`와 product `complete/partial/unavailable` direct pin만 만들며, product estimated/mixed field를 꾸며내지 않는다.
- real local DB는 QA 문서와 `package.json`에 있는 `pnpm local:reset:demo`로 reset/start/seed한 뒤 `pnpm dev:local-supabase`로 실제 auth browser를 실행한다. bootstrap 결과 user row와 기본 `아침/점심/저녁` 3 columns를 먼저 확인하고, nutrition request 전후 target/planner write 0을 별도로 측정한다.
- fixture evidence와 real local DB evidence를 명확히 구분한다.
- physical device, external OAuth, production-scale query plan은 Manual Only이며 기본 gate를 대체하지 않는다.

## Primary User Path

1. 로그인 사용자가 `PLANNER_WEEK`에서 주간 범위와 날짜별 compact `계획 영양`을 확인한다.
2. incomplete indicator가 있으면 날짜의 끼니 slot을 눌러 `MEAL_SCREEN`으로 이동한다.
3. 선택 끼니의 핵심 5종, `최소/정보 준비 중`, 품질, warning을 확인한다.
4. 기존 Recipe Meal/ProductPlannerEntry 수정 흐름은 그대로 사용하고 nutrition summary는 다음 read에서 pin 기준으로 갱신된다.

## Delivery Checklist

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-planner-nutrition-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-planner-nutrition-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-planner-nutrition-types;stage=2;scope=shared;review=3,6 -->
- [x] range/day/column pinned aggregate TDD <!-- omo:id=delivery-planner-nutrition-aggregate-tdd;stage=2;scope=backend;review=3,6 -->
- [x] isolated PostgreSQL read-only smoke와 cleanup <!-- omo:id=delivery-planner-nutrition-real-db;stage=2;scope=backend;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-planner-nutrition-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-planner-nutrition-test-split;stage=4;scope=shared;review=6 -->
- [x] fixture와 real local DB smoke 경로 구분 <!-- omo:id=delivery-planner-nutrition-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] loading / empty / error / unauthorized / partial / unavailable 상태 점검 <!-- omo:id=delivery-planner-nutrition-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/desktop before-after와 scroll/CTA evidence <!-- omo:id=delivery-planner-nutrition-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA / eval / authority evidence <!-- omo:id=delivery-planner-nutrition-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-planner-nutrition-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
