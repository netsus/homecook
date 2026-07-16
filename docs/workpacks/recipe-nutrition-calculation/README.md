# Slice: recipe-nutrition-calculation

## Goal

승인된 재료 영양·계량 데이터만 사용해 레시피의 예상 영양을 결정론적으로 계산하고, 과거 식단이 나중의 데이터 변경으로 흔들리지 않도록 불변 snapshot으로 고정한다. 사용자는 `RECIPE_DETAIL`에서 1인분 기준값과 선택 인분 전체값의 핵심 영양소를 `complete / partial / unavailable` 및 `direct / estimated / mixed` 품질과 함께 확인하며, 누락된 값은 0이 아니라 `최소 X` 또는 `정보 준비 중`으로 이해할 수 있다.

이 슬라이스는 recipe nutrition 계산·snapshot·Recipe Detail 표시와 신규 Recipe Meal의 nullable snapshot pin까지만 닫는다. 완제품 catalog, 완제품 planner entry, recipe/product 합계는 후속 슬라이스다.

## Branches

- 문서: `docs/recipe-nutrition-calculation-workpack`
- 백엔드: `feature/be-recipe-nutrition-calculation`
- 프론트엔드: `feature/fe-recipe-nutrition-calculation`

## In Scope

- 화면:
  - 기존 confirmed anchor screen `RECIPE_DETAIL`의 additive `예상 영양` 영역
  - `1인분 기준 예상 영양`과 상세 화면에서 이미 선택한 인분의 전체값 표시
  - `loading / complete / partial / unavailable / error / low-quality` 상태와 출처·한계 설명
- API:
  - 기존 `GET /recipes/{recipe_id}`의 additive non-null `nutrition` object
  - 기존 recipe-only `POST /meals` 응답의 nullable `recipe_nutrition_snapshot_id`
  - 신규 endpoint 없음
- 상태 전이:
  - recipe 계산 input 또는 calculation version 변경 → 새 immutable snapshot 생성 → current pointer 원자 전환
  - 신규 Meal 생성 시 당시 current snapshot을 nullable pin
  - 기존 unpinned Meal은 summary 출시 전 current snapshot으로 한 번만 `backfill` pin 가능
  - `meals.status`는 기존 `registered -> shopping_done -> cook_done`만 유지하고 영양 계산은 이 전이를 바꾸지 않음
- DB 영향:
  - `recipe_nutrition_snapshots`
  - `meals.recipe_nutrition_snapshot_id`, `meals.nutrition_snapshot_origin`
  - read-only predecessor: `recipes`, `recipe_ingredients`, `ingredients`, `nutrition_sources`, `nutrition_profiles`, `nutrition_values`, `ingredient_nutrition_profiles`, `measurement_conversion_profiles`, `ingredient_conversion_assignments`, `piece_unit_weights`
- 계산기와 운영 경로:
  - 순수 계산 함수, canonical input hash, `calculation_version`
  - manual/YouTube recipe write 완료 후 snapshot 생성·재생성 경로
  - 기존 FoodSafety-30 recipe bounded backfill dry-run/apply/report/rollback 경로
  - current snapshot을 join한 batch read로 Recipe Detail의 N+1 방지
- Schema Change:
  - [ ] 없음
  - [x] 있음 → `supabase/migrations/<timestamp>_add_recipe_nutrition_snapshots.sql` 및 Meal nullable pin/guard가 필요

## Out of Scope

- `food_products`, `food_product_nutrition_versions`, public/private 완제품 catalog와 수동 제품 등록
- `product_planner_entries`, 제품 수량 변경·삭제, Recipe Meal/ProductPlannerEntry 통합 adapter
- 끼니·날짜·주간 recipe/product `계획 영양` 합계와 `GET /planner/nutrition`
- 기존 planner read의 `product_entries` projection
- 장보기, cooking session, leftover, XP/activity의 제품 제외 구현
- 의료 처방·질환 코칭·목표 섭취량·실제 섭취 기록·먹음/건너뜀 상태
- 바코드·OCR·외식·밀키트·조리 수율·영양 잔존율·국물 폐기율·튀김유 흡수율 정밀 추정
- runtime 공공 API 호출, source refresh, 무검수 promotion, fuzzy/name-only 영양 또는 환산 fallback
- 범용 밀도, 범용 `개→g`, 관계 chaining, 승인되지 않은 source/profile/link/assignment/piece weight 사용
- `COOK_MODE` 인분 조절 UI. 기존 금지 규칙을 유지한다.
- 삭제된 `DELETE /recipes/{id}/save` 복원

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| public data local pilot PR #1005 | merged — merge `3866952c3e81bedfd80593f576e5ed6183ec7538`, reviewed head `028c6e8f13d3c8586bbbfaa9dad42f0ae65c1420` | [x] |
| nutrition/products/planner contract PR #1006 | merged contract — merge `6d01d8ac9f4861036ade4e6b97b20275c7f2a6c8`, reviewed head `81ddb4d5c4bbd320c01f9a91a40d89632193e619`; branch rebased through predecessor closeout master `842093048f7b5cc9996bc85e886405ad6788e9c5` | [x] |
| `ingredient-nutrition-conversion-model` | merged implementation in PR #1004 lineage; public-data pilot exact bundle is the calculation input | [x] |
| FoodSafety-30 exact pilot bundle | approved/pinned 13 nutrition links for 124 canonical ingredients; 21/30 recipes have at least one link | [x] |
| recipe snapshot attribution contract repair | 사용자 2026-07-15 명시 승인; official v1.7.19/v1.5.25/v1.3.22/v1.3.20/v1.2.24에서 미구현 target의 `nutrition_profile_id` 제거 + immutable `sources_json` 재잠금 | [x] |
| recipe 기본 profile 선택·가용성 contract repair | 사용자 2026-07-16 명시 승인; official v1.7.20/v1.5.26/v1.3.23/v1.3.21/v1.2.25에서 recipe row 비확장, exactly-one 선택, exact piece fail-closed, nullable `availability_reason` 재잠금 | [x] |
| independent Codex Stage 1.5 docs gate | PR #1010의 독립 Codex 검수·merge `a80db913b3cee30db78d6972d758131c674aaa59`가 current ancestry에 포함됨 | [x] |

> 최종 pilot dependency는 logical batch `7ede683988d9c23d0a89416d9b237df6b01e3a2720f045b96dbf11253ff833bc`, approved handoff checksum `457b70404e88564ab0e3d26d7d7e0d35db87babfa607b9472d1ac683538e1dcf`다. 이전 pre-fix bundle이나 `edible_portion_percent=100` 해석은 소비하지 않는다. 현재 coverage가 `13/124`인 것은 정상적인 sparse baseline이며 complete를 만들기 위해 승인되지 않은 후보를 보충하지 않는다.

## Proposal Critic Decision

목표는 계산의 재현성과 과거 Meal 안정성을 보장하면서 Recipe Detail 조회 비용을 제한하는 것이다.

| 선택지 | 단순성 | 정확성·안전성 | 되돌리기·유지보수 | 성능·현 코드 정합성 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 조회 시마다 현재 재료/profile로 동적 계산 | writer는 단순 | 동일 Meal 값이 source/current 변경에 따라 변하고 runtime fallback 유혹이 큼 | 과거 값 복원과 감사가 어려움 | Recipe Detail마다 다중 join/N+1 위험 | 거부 |
| recipe row에 현재 합계만 overwrite | 조회는 단순 | partial 사유·벡터·source version 이력과 과거 pin을 잃음 | 정정 전 값을 복구하기 어려움 | 기존 immutable 계약과 충돌 | 거부 |
| immutable snapshot + atomic current switch + nullable Meal pin | 생성 경로가 더 명시적 | input/version 재현, sparse 결측과 warning 보존, 과거 Meal 안정 | 새 version 추가와 pointer 전환으로 clean rollback 가능 | `recipe_nutrition_snapshots`와 API/DB 공식 계약에 정확히 맞음 | 채택 |

채택안은 계산을 write/backfill 시점에 수행하고 read는 current/pinned snapshot을 projection한다. 동일 `(recipe_id, input_hash, calculation_version)`은 같은 logical snapshot으로 멱등 처리하며 payload는 UPDATE/DELETE하지 않는다.

## Backend First Contract

### Public API Boundary

- 모든 JSON 응답은 기존 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지한다.
- `GET /recipes/{recipe_id}`는 기존 필드를 바꾸지 않고 `nutrition`을 additive object로 반환한다. snapshot이 없어도 `nutrition=null`이나 `0 kcal`가 아니라 필수 핵심 5종이 `unavailable`인 object를 반환한다. API의 `basis`/`values`는 계산 당시 기본 인분 전체 snapshot이고, UI의 1인분 기준값과 선택 인분 전체값은 같은 vector 공식으로 파생한다.
- current snapshot row를 정상 조회하면 `nutrition`은 `basis`, `base_servings`, `values`, `scalable_values`, `fixed_values`, `calculation_status`, `calculation_quality`, `availability_reason=null`, `reflected_ingredient_count`, `target_ingredient_count`, `warnings`, `sources`, `snapshot_id`, `calculated_at`를 공식 shape대로 투영한다. 정상 row의 `calculation_status='unavailable'`은 조회 실패가 아니므로 `availability_reason`을 바꾸지 않는다.
- current snapshot row가 실제로 없으면 `basis`, 핵심 5종 `values`, `calculation_status='unavailable'`, `calculation_quality=null`, `availability_reason='missing'`, `warnings=['RECIPE_NUTRITION_SNAPSHOT_MISSING']`, `sources=[]`를 반환한다. 존재하지 않는 snapshot ID·시각·count·vector는 거짓 0으로 채우지 않고 생략한다.
- snapshot query가 throw/DB error로 실패하거나 row payload가 malformed/unreadable이면 기존 recipe 상세 필드는 유지하고 nutrition을 `availability_reason='temporarily_unavailable'`인 200 payload로 반환한다. 새 endpoint/status/error code는 만들지 않으며 client는 영양 영역만 재시도한다.
- `POST /meals` request는 계속 `recipe_id`, `plan_date`, `column_id`, `planned_servings`, optional `leftover_dish_id/source_path`만 받는다. product field는 `422 VALIDATION_ERROR`다.
- `POST /meals`는 current snapshot이 있으면 `recipe_nutrition_snapshot_id`를 pin하고 없으면 null로 생성에 성공한다. endpoint는 Recipe Meal 전용이고 status/ownership/idempotency 기존 계약을 완화하지 않는다.

### Nutrition Payload And Formula

- 핵심 5종: `energy_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`, `sodium_mg`.
- optional: `sugars_g`, `saturated_fat_g`, `fiber_g`; source 값이 있을 때만 key를 제공한다.
- 기본 인분 전체에서 계산 가능한 nutrient 구성요소를 `scalable_values`와 `fixed_values`로 분리한다.
  - complete: 두 vector의 합 = `values[key].amount`
  - partial: 두 vector의 합 = `values[key].known_amount`; `amount=null`, `display_mode='minimum'`
  - unavailable: `amount/known_amount=null`, vector 양쪽에서 key 생략
  - 검증된 실제 기여 0만 숫자 0으로 허용
- 선택 인분 계산은 nutrient별로 `scalable_values[key] * selected_servings / base_servings + fixed_values[key]`다. 누락 vector를 0으로 보충하거나 1인분 값을 단순 곱하지 않는다.
- client는 snapshot의 nutrient status·display mode·warnings를 authority로 소비한다. `COOK_MODE`에는 selected servings control을 추가하지 않는다.

### Calculator Input And Unit Order

계산기는 recipe와 아래 **active current approved** predecessor row만 canonical 정렬해 input hash에 포함한다. recipe 정량 `amount + unit`은 껍질·뼈 포함 구매 총중량이 아니라 조리에 실제 투입하는 가식부 사용량이며 가식부율을 다시 곱하지 않는다.

- recipe ID/version, `base_servings`, 정량 recipe ingredient ID·amount·unit·ingredient type·`scalable`
- `nutrition_sources` current/freshness 및 approved normalized `nutrition_profiles/nutrition_values`
- active approved primary `ingredient_nutrition_profiles`
- active approved `ingredient_conversion_assignments`가 pin한 `measurement_conversion_profiles`
- recipe 입력과 ingredient의 `size_code + preparation_state`가 exact match인 active approved `piece_unit_weights`
- calculation version과 rounding policy version

`recipe_ingredients`에 `preparation_state`, `size_code`, `edible_state`를 새로 추가하지 않는다. 상태 미지정 입력의 기본값은 임의 row나 이름으로 고르지 않고 아래 exactly-one 규칙으로만 선택한다.

단위 경로 우선순위:

1. `g/kg`은 current approved source/profile과 active approved primary ingredient link를 모두 만족하는 완전한 chain이 canonical ingredient의 전체 `preparation_state`에서 정확히 1개일 때만 질량 기준 profile로 직접 계산한다.
2. 같은 exactly-one chain의 profile 기준이 `100mL`이고 입력이 `mL/L/tbsp/tsp/cup`이면 부피 기준으로 직접 계산한다.
3. 그 밖의 부피는 `tbsp=15mL`, `tsp=5mL`, 국내 조리용 `cup=200mL`로 정규화하고, active approved assignment/evidence/source의 자격 있는 경로가 전체 상태에서 정확히 1개일 때만 승인 `VOLUME_G6/G10/G15/G20/G25`를 적용한다. 예상 질량은 `mL * representative_g / 15`다.
4. `개/장`은 recipe 입력과 ingredient의 exact `size_code + preparation_state`가 일치하는 active approved piece weight만 사용한다. 현재 recipe row에는 두 입력 필드가 없으므로 일반적으로 계산하지 않으며, `g/kg` 직접 질량에는 piece 크기가 필요 없다.
5. `TO_TASTE`, amount 결측, 미지원 단위, 변환 경로 없음, inactive/revoked/superseded/stale/needs_source_check는 계산하지 않고 missing reason을 남긴다.

`TO_TASTE`와 계산 불가 기여는 0이 아니다. 대표 부피 환산을 하나라도 사용한 nutrient는 `direct`가 될 수 없으며 직접 경로만이면 `direct`, 대표 경로만이면 `estimated`, 혼합이면 `mixed`, 전체 unavailable이면 quality는 null이다.

### Deterministic Snapshot Contract

snapshot은 다음을 불변 보존한다.

- `input_hash`, `calculation_version`, `base_servings`
- `scalable_values_json`, `fixed_values_json`, 영양소별 값/상태의 단일 authority `nutrient_status_json`
- nutrient별 amount/known amount/status/display mode, 전체 `calculation_status`
- `calculation_quality`, reflected/target ingredient count
- 정렬·중복 제거된 `missing_reasons`, 순서가 의미 있는 `warnings_json`
- 기여한 approved source attribution과 계산·반올림 전 내부 정밀도
- 기여 source attribution은 snapshot `sources_json`에 `provider/dataset/source_version/data_basis_date/license/source_url` exact 6-field object만 저장한다. 실제로 영양값을 만든 active current approved nutrition source와, 실제 사용한 대표 부피/exact piece assignment에 연결된 active approved evidence의 active current approved source만 stable tuple로 dedupe/order한다. read 시 current relation으로 재생성하지 않는다.
- `nutrition_profiles`/`nutrition_values`는 read-only predecessor고 `recipe_calculation` profile/value row는 이 슬라이스에서 생성하지 않는다. recipe 계산 authority는 `base_servings` + nutrient status + scalable/fixed vector snapshot payload다.
- `calculated_at`

MVP 화면 반올림은 표시 직전에 kcal·g·mg을 사용자 가독 단위로 수행하며 snapshot/vector 산술은 충분한 내부 정밀도로 유지한다. 반올림 정책 변경은 `calculation_version`을 올리고 새 snapshot을 만든다. 같은 canonical input과 version은 동일 hash·vector·status·warning 순서를 만든다.

핵심 5종 모두 complete면 전체 complete, 하나라도 계산 가능하지만 불완전하면 partial, 모두 계산 불가면 unavailable이다. `partial`은 `known_amount`와 `최소 X`, `unavailable`은 amount null이다.

### Writer, Current Switch, Backfill, Rollback

- manual/YouTube recipe transaction이 recipe+ingredients를 성공 확정한 뒤 snapshot writer를 호출한다. 영양 writer 실패는 recipe 작성 자체를 거짓 성공으로 만들지 않도록 report/retry 대상이지만 미완전 public data를 fallback하지 않는다.
- `(recipe_id, input_hash, calculation_version)` unique로 replay를 멱등 처리한다.
- 새 snapshot insert와 기존 current의 `is_current=false`, 새 row `is_current=true` 전환은 한 transaction에서 수행한다.
- snapshot payload는 UPDATE/DELETE하지 않는다. 이미 Meal에 pin된 row는 current가 아니어도 계속 조회 가능하다.
- bounded backfill은 FoodSafety-30 exact scope로 dry-run → report → explicit apply 순서이며 batch size/cursor/checkpoint를 사용한다. 실패 batch는 rollback하고 성공한 이전 batch/Meal pin은 자동 변경하지 않는다.
- rollback은 새 current를 비활성화하고 이전 immutable snapshot을 current로 원자 복원할 수 있다. 과거 Meal pin은 바꾸지 않는다.
- 기존 unpinned Meal backfill은 summary 출시 전에 한 번만 실행하고 `nutrition_snapshot_origin='backfill'`을 기록한다. 새 Meal은 pin 시 `created`; snapshot null이면 origin도 null이다. pin된 Meal은 source/profile/recipe/current 변경으로 silent repin하지 않는다.

### Permission / RLS / Security

- public recipe의 current nutrition projection은 기존 recipe read 정책 안에서 읽을 수 있다. private/custom recipe는 기존 recipe 소유권을 그대로 적용한다.
- recipe snapshot payload와 current 전환, Meal snapshot pin/backfill은 사용자 입력으로 임의 지정할 수 없다. 일반 `anon/authenticated` 사용자는 snapshot insert/update/delete나 다른 사용자의 Meal pin을 수행할 수 없다.
- service/operator writer도 recipe·snapshot 관계, current uniqueness, audit origin, approved/current predecessor 조건을 DB guard와 transaction에서 다시 검증한다.
- `POST /meals`는 column/recipe/leftover 소유권과 기존 401/403/404/409/422 경계를 유지한다. client가 보낸 snapshot ID는 받지 않는다.
- API response, log, report, source attribution, browser bundle에 API key·인증 query·cookie·raw provider payload/row·private filesystem path·다른 사용자 식별자를 노출하지 않는다.
- public data attribution은 승인된 `provider/dataset/source_version/data_basis_date/license/source_url` 최소 projection만 stable dedupe해 반환한다.
- source tuple은 위 6개 field 순서로 exact dedupe하고 null-first Unicode ordinal 오름차순으로 정렬한다. snapshot payload의 `sources_json`도 UPDATE/DELETE 금지 대상이다.

### Error And Reason Codes

기존 public error envelope를 유지하며 새 public endpoint/code를 만들지 않는다. `GET /recipes/{id}`의 snapshot 부재·partial·unavailable·일시 조회 실패는 기존 성공 wrapper의 정상 200 soft state다.

| 상황 | 처리 |
| --- | --- |
| 비로그인 보호 Meal 생성 | 기존 `401` 로그인 안내와 return-to-action |
| 타 사용자 column/leftover/recipe mutation | 기존 `403` |
| recipe 대상 없음 | 기존 `404` |
| current snapshot row 실제 부재 | 200 unavailable + `availability_reason='missing'`; 0값/500/404 금지 |
| snapshot query throw/DB error 또는 malformed/unreadable row | 기존 detail 본문을 보존한 200 + `availability_reason='temporarily_unavailable'`; 영양 영역만 재시도 |
| 정상 snapshot row의 `calculation_status='unavailable'` | `availability_reason=null`; 계산 결측과 조회 실패를 섞지 않음 |
| Meal 상태/column 충돌 | 기존 `409` |
| invalid servings/unit/product field/snapshot ID 주입 | `422 VALIDATION_ERROR` |
| 계산 input 결측·변환 불가 | snapshot `partial/unavailable` + missing reason/warning; API error로 위장하지 않음 |
| unapproved/inactive predecessor 소비 시도 | writer/backfill fail-closed, 0 snapshot/current writes, sanitized reason report |
| concurrent current switch | transaction/unique guard로 current 1개; loser는 idempotent replay 또는 rollback |

## Frontend Delivery Mode

- Stage 4는 기존 `RECIPE_DETAIL`의 interaction model, CTA 순서, 재료/조리 단계 위계를 보존하는 기능 가능한 additive UI로 구현한다.
- 필수 표시 상태:
  - `loading`: 영양 영역 skeleton이 기존 상세 CTA·재료를 밀어내거나 가리지 않음
  - `complete`: 카드 제목 `1인분 기준 예상 영양`, 1인분 기준값, 선택 인분 전체값, 핵심 5종, 직접/예상 품질
  - `partial`: nutrient별 `최소 X`, 반영 수/대상 수, 누락 사유
  - `unavailable`/empty: 정상 snapshot row의 계산 unavailable 또는 `availability_reason='missing'`을 `정보 준비 중`으로 구분 표시; 0 kcal 금지
  - `error`: `availability_reason='temporarily_unavailable'`이면 기존 상세 내용은 유지하고 영양 영역만 재시도/안내
  - `low-quality`: 대표 환산이 포함되면 `약`/`예상`과 간단한 한계 설명
  - `read-only`: 영양은 정보 표시이며 일반 사용자가 source/snapshot을 수정하지 않음
  - `unauthorized`: Recipe Detail public read는 기존 정책, Meal 추가 보호 액션은 기존 로그인 안내 + return-to-action
- 인분 control은 기존 Recipe Detail 상세 context에서만 값을 다시 계산한다. fixed vector를 비례시키지 않으며 `COOK_MODE`에는 control을 추가하지 않는다.
- 공공 source attribution은 API 최소 projection만 표시하고 내부 검수 row나 raw data를 노출하지 않는다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `RECIPE_DETAIL`
- Visual artifact: Stage 4 before/after screenshot evidence를 `ui/designs/evidence/recipe-nutrition-calculation/`에 390px, 320px, desktop으로 저장할 예정
- Authority status: `required`
- Notes:
  - 기존 confirmed `RECIPE_DETAIL`에 additive 정보 영역을 넣어 정보 위계와 스크롤 길이가 바뀌므로 low-risk가 아니다.
  - 신규 화면이나 interaction model 변경은 아니므로 Stage 1 design-generator와 design-critic은 의도적으로 생략한다. generator/critic artifact는 null이다.
  - Stage 4에서 동일 fixture의 before/after 390px·320px·desktop screenshot, loading/partial/unavailable 상태, no-horizontal-overflow와 CTA/재료/스텝 위계 보존 evidence를 남긴다.
  - Stage 5와 final authority는 `ui/designs/authority/RECIPE_DETAIL-recipe-nutrition-calculation-authority.md`에서 blocker 0을 확인해야 한다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 계약 잠금 상태; Stage 4에서 기능 가능한 additive UI 구현 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> Design Status 전이: `temporary` → `pending-review` → authority-required Stage 5/final authority blocker 0 이후 `confirmed`.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.20.md`
- `docs/화면정의서-v1.5.26.md`
- `docs/유저flow맵-v1.3.23.md`
- `docs/db설계-v1.3.21.md`
- `docs/api문서-v1.2.25.md`
- `docs/workpacks/ingredient-nutrition-conversion-model/README.md`
- `docs/workpacks/ingredient-nutrition-conversion-model/evidence/2026-07-15-public-data-local-pilot.md`
- `docs/engineering/tdd-vitest.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/playwright-e2e.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`

## QA / Test Data Plan

### Fixture Baseline

- calculator fixtures는 direct g/kg, matching 100mL, each approved volume class, exact piece, scalable+fixed, optional nutrient, verified zero, missing/trace, `TO_TASTE`, unsupported unit, revoked/stale predecessor를 포함한다.
- API fixture는 normal snapshot complete/partial/unavailable(`availability_reason=null`), no snapshot(`missing`), query/DB/malformed failure(`temporarily_unavailable`)를 분리하고 기존 Recipe Detail fields가 nutrition 추가 전과 동일함을 잠근다.
- frontend fixture는 base/selected servings, partial minimum, low-quality 약/예상, unavailable, loading/error를 안정적으로 재현한다.

### Real DB Smoke

- `pnpm dev:local-supabase` 또는 격리된 local Supabase/PostgreSQL에서 모든 migration과 FoodSafety-30 seed를 적용한다.
- predecessor exact bundle/handoff만 local DB에 적용하고 production/staging은 별도 승인 없이 0 writes를 유지한다.
- dry-run으로 30 recipe/124 ingredient closure와 예상 candidate/snapshot count를 보고한 뒤 bounded apply, replay, current switch, Meal pin, rollback을 검증한다.
- owner/private recipe, anon/authenticated RLS, concurrent current switch, transaction injection rollback을 실제 DB에서 확인한다.
- real browser는 `pnpm dev:demo` 또는 local Supabase 환경에서 390/320/desktop Recipe Detail을 확인한다.

### Seed / Reset / Blockers

- seed: `supabase/migrations/20260626104000_seed_foodsafety_pilot_recipes.sql`의 exact 30 recipes.
- approved nutrition baseline: exact 13 links/124 ingredients; zero conversion/piece active assignment도 합법적인 sparse fixture다.
- reset은 이 slice가 만든 격리 local DB와 gitignored report/evidence만 대상으로 하며 사용자 기존 DB/container/volume을 건드리지 않는다.
- 시스템 bootstrap row 추가 의존은 없다. Meal smoke는 기존 로그인/bootstrap이 만든 owner user와 `meal_plan_columns`를 사용하고, owning flow가 column을 생성했는지 먼저 검증한다.
- blocker:
  - 공식 v1.7.20/v1.5.26/v1.3.23/v1.3.21/v1.2.25와 shape 불일치
  - exact predecessor merge/checksum 또는 approved/current gate 부재
  - `recipe_nutrition_snapshots`/Meal pin migration 또는 RLS guard 미적용
  - complete 오탐, missing→0, fixed vector scaling, silent repin
  - production write, secret/raw data leak
  - 390/320/desktop authority evidence 또는 actual real DB smoke 부재

## Key Rules

- 계산 입력은 active current approved predecessor만 사용한다. runtime provider 호출, fuzzy guessing, nearest fallback은 금지한다.
- recipe 정량은 실제 투입 가식부 사용량이다. recipe row에 상태·크기 컬럼을 추가하거나 구매 총중량으로 재해석하지 않는다.
- 상태 미지정 직접 profile과 부피 conversion은 각각 자격 있는 완전한 chain이 전체 상태에서 정확히 1개일 때만 사용한다. 0개/복수 후보는 fail-closed한다.
- `개/장`은 exact `size_code + preparation_state` 입력과 승인 근거가 모두 있을 때만 계산하고, 직접 질량에는 크기를 요구하지 않는다.
- sparse coverage는 정상이다. `13/124`를 complete로 꾸미지 않으며 결측은 0이 아니다.
- snapshot payload와 warning 순서는 불변이고 current 전환만 허용한다.
- Meal pin은 nullable이며 없다고 Meal 등록을 실패시키지 않는다. 이미 pin된 Meal은 silent repin하지 않는다.
- 선택 인분 공식은 `scalable * selected/base + fixed`다.
- Recipe Detail 영양은 `예상`이고 partial은 `최소`, 대표 환산은 `약`이다.
- Recipe Detail은 `missing`(row 부재), `temporarily_unavailable`(query/DB/malformed 실패), null(정상 row)을 구분하고 temporary 상태에서 영양만 재시도한다.
- 영양 카드가 기존 CTA·재료·조리 단계보다 강한 primary action처럼 보이면 안 된다.
- 제품·planner aggregate·실제 섭취 의미를 이 슬라이스에 섞지 않는다.

## Rollout, Backfill, Rollback, Known Limitations

1. migration과 calculator를 local/CI에 배포하고 fixture/DB/RLS를 검증한다.
2. FoodSafety-30 dry-run report에서 exact scope, snapshot status 분포, missing reason, secret count 0을 검수한다.
3. bounded apply로 current snapshot을 만들고 replay가 0 duplicate write인지 확인한다.
4. Recipe Detail additive API/UI를 feature gate 또는 deploy order로 연다. snapshot이 없어도 unavailable payload로 안전하게 동작한다.
5. summary 출시 전 기존 unpinned Meal을 한 번만 backfill하고 origin/count를 검수한다.
6. 문제 시 UI projection을 내리고 current pointer를 이전 immutable snapshot으로 복원한다. snapshot payload와 과거 Meal pin은 삭제/재작성하지 않는다.

알려진 한계:

- 현재 exact coverage는 13/124 ingredient이고 승인 link를 하나 이상 가진 recipe는 21/30이다. 완전한 30-recipe coverage가 아니다.
- 계량 evidence 6건은 `needs_source_check/human_review_required`; active conversion/piece assignment가 0일 수 있다.
- 조리 손실·잔존·흡수·폐기율을 모델링하지 않아 재료 투입 기준 예상치다.
- local pilot의 PostgreSQL 14.5 증거는 production/Supabase PostgreSQL 17 동등성을 완전히 증명하지 않는다.
- source 값이나 rounding policy가 바뀌면 새 calculation version/snapshot이 필요하다.

## Contract Evolution Decision `2026-07-16`

- 사용자 승인: recipe ingredient 입력/schema를 늘리지 않고 실제 투입 가식부 사용량과 exactly-one 기본 profile/conversion 선택을 잠그며, Recipe Detail nutrition에 nullable `availability_reason`을 additive 추가한다.
- 채택: 상태 미지정 direct chain과 conversion chain은 각각 전체 상태에서 자격 있는 후보가 정확히 1개일 때만 선택한다. 0개/복수는 partial/unavailable로 남긴다.
- 거부 A: `recipe_ingredients`에 손질·크기·가식 상태 컬럼 추가 — 기존 입력·schema·migration 범위를 불필요하게 넓힌다.
- 거부 B: 여러 상태 중 첫 row 또는 이름 기반 후보 선택 — 잘못된 값을 complete로 오인할 수 있고 결정성이 DB 정렬에 의존한다.
- `개/장`은 exact `size_code + preparation_state`가 없으면 fail-closed하며 직접 질량에는 size가 필요 없다. 조리 손실은 계속 미모델링한다.
- snapshot row가 없을 때만 `missing`, query throw/DB error/malformed row는 `temporarily_unavailable`, 정상 row는 calculation status와 무관하게 null이다. 새 endpoint/status/error code/table은 없다.
- official v1.7.20/v1.5.26/v1.3.23/v1.3.21/v1.2.25가 이 결정을 잠근다.

## Contract Evolution Decision `2026-07-15`

- 사용자 승인: 미구현 recipe snapshot target에서 `nutrition_profile_id`를 제거하고 immutable `sources_json` exact 6-field attribution을 추가한다.
- 거부 A: read 시 current ingredient/source relation으로 attribution 재생성 — source 교체 후 과거 Meal의 출처가 바뀐다.
- 거부 B: `recipe_calculation` profile/연결 row 생성 — 다중 source를 기존 단일 source profile로 완전히 표현하지 못하고 snapshot authority·predecessor read-only와 중복된다.
- 당시에는 public field/endpoint/status/error code를 추가하지 않았고 official v1.7.19/v1.5.25/v1.3.22/v1.3.20/v1.2.24가 snapshot attribution 결정을 잠갔다. 현재 공식 버전은 위 2026-07-16 결정을 additive로 포함한다.

## Primary User Path

1. 사용자가 `RECIPE_DETAIL`을 열면 기존 상세와 함께 현재 immutable snapshot의 `예상 영양`을 본다. snapshot row가 없으면 준비 중, query/DB/malformed 실패면 상세 본문을 유지한 채 영양만 다시 시도한다.
2. 상세 화면에서 인분을 바꾸면 client는 `scalable * selected/base + fixed`로 계산 가능한 값만 표시하고 partial/unavailable 상태는 유지한다.
3. 대표 환산이 있으면 `약/예상`, 누락이 있으면 `최소 X`·반영 수·사유를 확인한다.
4. 로그인 보호 플래너 추가를 실행하면 로그인 후 return-to-action을 거쳐 Recipe Meal이 생성되고 당시 current snapshot이 있으면 nullable pin된다.
5. 이후 recipe/source/profile이 바뀌어도 기존 Meal의 pin은 유지되고 새 조회/새 Meal만 새 current snapshot을 사용한다.

## Stage 2 Runtime Repair Evidence `2026-07-16`

- TDD에서 `장`이 일반 미지원 단위로 축소되던 실패, 상태 전체에서 유일한 predecessor를 읽지 못하던 실패, malformed 100g/100mL basis를 소비하던 실패, API가 `availability_reason`을 생략하던 실패, dry-run이 실제 계산기를 사용하지 않던 실패를 각각 RED로 확인한 뒤 GREEN으로 닫았다.
- manual/YouTube writer와 FoodSafety backfill은 같은 bounded predecessor loader와 순수 calculator를 사용한다. recipe ingredient별 N+1 query를 추가하지 않고 batch마다 정규화·중복 제거한 ingredient ID에 대해 nutrition link와 conversion assignment 두 종류를 각각 server-side eligibility filter + `id` 정렬 + 최대 1,000행 page 반복으로 읽는다.
- 현재 recipe row에 없는 `preparation_state`, `size_code`, `edible_state`를 추가하지 않았다. `amount + unit`은 실제 투입 가식부 사용량이며, direct `g/kg`에는 size가 필요 없고 `개/장`은 exact size/preparation 입력이 없으면 fail-closed한다.
- 기존 container/volume을 사용하지 않는 임시 격리 PostgreSQL 14.5에서 승인 chain count `1 → 2(모호) → 1(revoked) → 0`, snapshot/RLS/backfill/concurrency, optional-only partial, write-time link revoke/new eligible candidate/recipe ingredient mutation 거부를 포함해 11/11이 통과했다. 이 증거는 full migration + FoodSafety-30 seed + owner/bootstrap smoke가 아니며, Supabase PostgreSQL 17 동등성도 증명하지 않으므로 아래 real DB/owner 항목은 계속 미완료다.
- 관련 Vitest 8 files 96/96, 추가 service basis gate 12/12, targeted ESLint, typecheck, production build, source-of-truth/workflow/automation/workpack validators가 통과했다. `pnpm verify:backend`의 병렬 product suite는 로컬 자원 경합으로 1,475개 중 115개가 5초 timeout이었고, security E2E는 9/12 후 header 3개가 30초 timeout이었다. 기능 관련 단독 suite는 모두 통과했지만 이 timeout과 PG17 gap은 Stage 3/current-head CI가 다시 판정한다.
- production/staging write는 0이며 secret/raw provider row는 출력·커밋하지 않았다.

## Stage 3 Runtime Repair Evidence `2026-07-16`

- 1차 runtime repair에서 비-PG 영양 Vitest 6 files 70/70, 임시 격리 PostgreSQL 14.5 11/11, 변경 TS/MJS targeted ESLint, typecheck, source-of-truth/workflow-v2, 공식 slice명을 명시한 workpack validator가 통과했다. 기본 `pnpm validate:workpack`은 repair branch suffix를 새 slice로 오인했고, `BRANCH_NAME=feature/be-recipe-nutrition-calculation`로 같은 validator를 실행해 green을 확인했다.
- 2차 repair current-head에서 비-PG 영양 Vitest 6 files 71/71, DB contract 7/7, 기존 container/volume과 분리된 `/tmp` PostgreSQL 14.5 integration 18/18, typecheck가 통과했다. 전체 lint는 error 0이고 기존 backfill test의 unused parameter warning 4건이 남아 있다.
- writer-first 실제 2-session 검증은 writer transaction의 recipe `ExclusiveLock`과 ingredient `ShareLock`이 snapshot insert 뒤 commit 전까지 유지됨을 확인했다. writer의 granted recipe lock과 새 canonical ingredient를 추가하는 phantom mutation의 ungranted lock이 같은 advisory key임을 확인한 뒤 writer commit → mutation commit 순으로 종료했고, 이전 guard 재사용은 stale로 거부되며 기존 snapshot 1건만 유지됐다.
- mutation-first 실제 2-session 검증은 `nutrition_values` INSERT가 ingredient `ExclusiveLock`을 보유하고 barrier에서 대기하는 동안 writer의 동일-key `ShareLock`이 대기함을 확인했다. mutation commit 뒤 writer는 `RECIPE_NUTRITION_INPUT_STALE`로 실패했고 snapshot row는 0건이었다. 별도 순차 transaction은 link revoke, 새 eligible link, 새 eligible conversion assignment, 새 nutrient value, recipe ingredient 변경도 stale로 고정한다.
- exact contributing source matrix는 unsupported unit/TO_TASTE/missing-only는 빈 배열, direct mass/direct volume/optional-only/observed zero는 nutrition source만, volume→mass conversion은 nutrition+measurement source만 허용한다. 승인됐지만 실제 계산에 기여하지 않은 source는 `SNAPSHOT_SOURCE_MISMATCH`로 거부된다.
- bare/percent/double/partial-percent encoded credential query key와 `=`까지 전체 인코딩된 query segment는 TypeScript와 PostgreSQL 모두 fail-closed한다. `service_role`은 snapshot table에서 `SELECT`만 가능하고 실제 `TRUNCATE`가 row를 보존한 채 거부되며, 기존 recipe/predecessor input table의 `TRUNCATE` 권한 제거도 실제 DB에서 확인했다.
- `pnpm build`의 Next compile은 1차 repair에서 45초에 성공했지만 후속 lint/type 단계가 무출력으로 총 2분을 넘어 중단됐다. 2차 repair에서는 full build를 다시 완료하지 않았으므로 full build green은 주장하지 않는다.
- 이 증거는 full migration + FoodSafety-30 seed + 실제 owner/bootstrap smoke, production-scale contention, Supabase PostgreSQL 17 동등성을 증명하지 않는다. production/staging write는 0이며 secret/raw provider row는 출력·커밋하지 않았다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 living closeout이다. Stage 1 작성 세션은 자기 산출물을 최종 승인하지 않으며 독립 Codex Stage 1.5 review가 필요하다. 구현 최종 closeout 전에는 `.workflow-v2/work-items/recipe-nutrition-calculation.json#closeout`을 실제 검증 증거로 추가하고 canonical projection을 동기화한다.

- [x] 순수 calculator와 canonical input hash/calculation version 고정 <!-- omo:id=delivery-calculator-hash;stage=2;scope=backend;review=3,6 -->
- [x] actual edible-use amount와 exactly-one approved/current predecessor/conversion selection, exact piece fail-closed, unit priority 고정 <!-- omo:id=delivery-approved-unit-paths;stage=2;scope=backend;review=3,6 -->
- [x] immutable snapshot writer/current atomic switch/idempotent replay 구현 <!-- omo:id=delivery-snapshot-writer;stage=2;scope=backend;review=3,6 -->
- [x] scalable/fixed vector와 selected servings 공식 구현 <!-- omo:id=delivery-serving-vectors;stage=2;scope=shared;review=3,6 -->
- [x] nutrient completeness/quality/missing/warning/rounding 구현 <!-- omo:id=delivery-status-quality;stage=2;scope=backend;review=3,6 -->
- [x] `GET /recipes/{id}` additive nutrition projection과 `availability_reason` normal/missing/temporary 구분 구현 <!-- omo:id=delivery-recipe-api;stage=2;scope=backend;review=3,6 -->
- [x] recipe-only `POST /meals` nullable snapshot pin과 silent-repin guard 구현 <!-- omo:id=delivery-meal-pin;stage=2;scope=backend;review=3,6 -->
- [ ] DB constraint/RLS/ownership/append-only/current uniqueness 테스트 — constraint/RLS/append-only/current uniqueness는 격리 PG에서 통과했지만 owner/bootstrap smoke는 미완료 <!-- omo:id=delivery-db-security;stage=2;scope=backend;review=3,6 -->
- [ ] FoodSafety-30 bounded backfill/report/replay/rollback과 real DB smoke <!-- omo:id=delivery-backfill-smoke;stage=2;scope=backend;review=3,6 -->
- [x] 기존 recipe API/Meal status/authorization/error 회귀 테스트 <!-- omo:id=delivery-backend-regression;stage=2;scope=shared;review=3,6 -->
- [ ] Recipe Detail loading/complete/partial/unavailable/error/low-quality UI 연결 <!-- omo:id=delivery-recipe-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] selected servings vector UI와 COOK_MODE control 비추가 확인 <!-- omo:id=delivery-serving-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 한국어 `1인분 기준 예상 영양`/`약`/`최소`/`정보 준비 중`과 attribution 안내 확인 <!-- omo:id=delivery-korean-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] Vitest/Playwright/manual QA 범위와 fixture/real DB smoke 분리 <!-- omo:id=delivery-test-split;stage=4;scope=shared;review=5,6 -->
- [ ] 390px/320px/desktop before-after와 상태별 screenshot evidence <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] anchor authority report와 final authority blocker 0 <!-- omo:id=delivery-authority-gate;stage=4;scope=frontend;review=5,6 -->
- [x] secret/raw data leak 0, N+1 방지, bounded backfill 증거 <!-- omo:id=delivery-security-performance;stage=2;scope=shared;review=3,6 -->
- [ ] rollout/rollback/known-limitations와 current-head closeout evidence 동기화 <!-- omo:id=delivery-closeout;stage=4;scope=shared;review=6 -->
