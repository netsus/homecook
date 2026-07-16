# Slice: prepared-food-planner-entry

## Goal

사용자는 승인된 public 완제품 또는 본인이 등록한 private 완제품을 플래너의 날짜·끼니에 수량과 함께 추가하고, Recipe Meal과 혼동하지 않은 채 수량 변경·삭제를 할 수 있다. entry는 생성 순간 제품 이름·브랜드와 immutable 영양 version을 원자적으로 고정하므로 제품 영양이 바뀌거나 private 제품이 soft-delete되어도 과거 계획은 흔들리지 않는다.

이 슬라이스는 완제품 entry를 기존 Recipe Meal 저장소와 분리한다. 그 결과 완제품은 장보기·요리·남은요리·recipe 지표·`planner_registered` XP·`meal_add_path_used` activity에 들어가지 않으며, 기존 `GET /planner`와 `GET /meals`에는 additive `product_entries[]`로만 나타난다.

## Branches

- 문서: `docs/prepared-food-planner-entry`
- 백엔드: `feature/be-prepared-food-planner-entry`
- 프론트엔드: `feature/fe-prepared-food-planner-entry`

## In Scope

- 화면:
  - 기존 anchor `PLANNER_WEEK`에 Recipe Meal과 구별되는 ProductPlannerEntry 요약 표시
  - 기존 `MEAL_SCREEN`의 product entry 카드, 수량 변경, 삭제 확인
  - 기존 `MENU_ADD`의 `[완제품]` 진입
  - 신규 nested surface `FOOD_PRODUCT_PICKER`: public + 본인 private 검색, 선택, 호환 수량/단위, 등록
  - 신규 nested surface `FOOD_PRODUCT_CREATE`: 검색 결과가 없을 때 private manual 제품 등록 후 선택 상태 복귀
- 신규 mutation API — 정확히 3개:
  - `POST /product-planner-entries`
  - `PATCH /product-planner-entries/{entry_id}`
  - `DELETE /product-planner-entries/{entry_id}`
- 기존 read model additive 변경 — 신규 endpoint가 아님:
  - `GET /planner`: 기존 recipe-only `meals[]` 보존 + `product_entries[]`
  - `GET /meals`: 기존 recipe-only `items[]` 보존 + `product_entries[]`
- 상태 전이:
  - create: 접근 가능한 active product + 현재 사용자 column + current immutable product nutrition version 확인 → 이름/브랜드 snapshot과 version을 한 transaction에서 pin
  - patch: owner entry의 `quantity`만 변경, pin과 이름/브랜드 snapshot 불변
  - delete: owner entry만 삭제, Recipe Meal·catalog·nutrition version 불변
  - ProductPlannerEntry의 `workflow_status`는 항상 `null`; `meals.status` 전이를 만들거나 변경하지 않음
- DB 영향:
  - 신규 target: `product_planner_entries`
  - 읽기/참조: `food_products`, `food_product_nutrition_versions`, `nutrition_profiles`, `nutrition_values`, `meal_plan_columns`
  - 기존 read projection: `meals`, planner/meals query
  - 기존 column delete guard: `meal_plan_columns`에 연결된 `meals` 또는 `product_planner_entries`가 하나라도 있으면 삭제 거부
  - 구조적 제외 회귀: `shopping_lists`, `shopping_list_items`, `cooking_sessions`, `leftover_dishes`, recipe count, user progress/activity tables는 write/read source로 사용하지 않음
- Schema Change:
  - [ ] 없음
  - [x] 있음 → 공식 DB v1.3.21의 `product_planner_entries`, composite ownership guard, RLS/direct grant, product-version pin guard와 column delete guard migration 필요

## Out of Scope

- `GET /planner/nutrition`과 끼니·날짜·주간 recipe/product 계획 영양 합계. 후속 `planner-nutrition-summary`가 소유한다.
- 완제품 catalog create/update/delete 자체의 재구현. `prepared-food-catalog`를 predecessor로 그대로 소비한다.
- public catalog importer/operator CLI/seed/runtime provider lookup. 현재 approved public promotion artifact·운영 public row는 0건이다.
- synthetic public 제품을 운영 제품, promotion 근거, production/staging row로 사용하는 행위
- ProductPlannerEntry에 `status`, `recipe_id`, `shopping_list_id`, `cooked_at`, `leftover_dish_id`를 추가하는 것
- 기존 `POST /meals`에 product field를 넣거나 완제품을 Recipe Meal로 만드는 것
- 실제 섭취/먹음·건너뜀, 의료 처방·질환 코칭, 목표 달성률
- OCR, 바코드, 외식, 밀키트
- generic preparation/size/edible fields, 제품명·브랜드 기반 환산, 일반 밀도, 임의 `g↔ml`, relation chaining
- 문서에 없는 endpoint, HTTP status, error code, request/response field, workflow status
- production/staging write와 외부 provider write

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `prepared-food-catalog` | merged — PR #1015 merge `b095f257a9a99f0f4952029ffd11a1036104f40f`; private manual catalog와 immutable nutrition version 제공 | [x] |
| `05-planner-week-core` | merged — planner column, Recipe Meal week/read model foundation | [x] |
| nutrition/products/planner official contract | merged — 요구사항 v1.7.20, 화면 v1.5.26, flow v1.3.23, DB v1.3.21, API v1.2.25 | [x] |
| independent Codex Stage 1.5 docs gate | 첫 review `b137aa4e` 0/6/0 → 별도 repair 1회 → fresh re-review `fe210b71` `DOC_GATE_APPROVED` 0/0/0 | [x] |

> 사용자 승인 nutrition/products/planner Codex-only 예외에 따라 Stage 1 author, Stage 1.5 reviewer/repair-final, Stage 2 implementer, Stage 3 reviewer, Stage 4 implementer, authority precheck, Stage 5/final authority, Stage 6 reviewer는 fresh 역할로 분리한다. 작성자와 구현자는 자기 변경을 최종 승인하지 않는다.

## Proposal Decision

| 선택지 | 기존 workflow 보호 | 과거 계획 안정성 | 공식 계약 정합성 | 판정 |
| --- | --- | --- | --- | --- |
| 완제품을 `meals`/Recipe로 저장 | shopping/cooking/status/XP에 섞임 | 가짜 recipe 재료·상태 필요 | 공식 분리 ADR 위반 | 거부 |
| 공통 `food_items/meal_entries`로 전면 일반화 | 기존 workflow 전체 migration 필요 | 장기 확장성은 있으나 범위가 큼 | 세 번째 entry type 승인 전 과도함 | 거부 |
| 별도 `product_planner_entries` + read adapter | Recipe Meal query를 구조적으로 보호 | immutable version/snapshot pin으로 재현 가능 | API/DB 공식 계약과 일치 | 채택 |

## Backend First Contract

### Public API Boundary

- 모든 JSON 응답은 기존 `{ success, data, error }` wrapper를 유지한다. error는 `{ code, message, fields[] }`다.
- 신규 mutation endpoint는 위 3개뿐이다. 기존 `GET /planner`, `GET /meals`의 additive projection은 확장하지만 새 read endpoint를 만들지 않는다.
- `POST /product-planner-entries` body는 정확히 `product_id`, `plan_date`, `column_id`, `quantity: { amount, unit }`다.
- `PATCH /product-planner-entries/{entry_id}` body는 정확히 `quantity: { amount, unit }`다. product, date, column, pinned version, snapshot field는 받지 않는다.
- `DELETE /product-planner-entries/{entry_id}`는 owner entry만 삭제하고 `{ deleted: true, entry_id }`를 `data`로 반환한다.
- create/PATCH entry response와 두 read model의 `product_entries[]`는 공식 `entry_type`, ID, product snapshot, 날짜/column(해당 surface 공식 shape), quantity, `workflow_status:null`, pinned version, pinned `basis_relations`, pinned nutrition shape만 제공한다.
- Product entry에 `status`, `recipe_id`, `shopping_list_id`, `cooked_at`, `leftover_dish_id`를 추가하지 않는다.

### Existing Read Compatibility And Dedupe

- `GET /planner`의 기존 `meals[]`는 recipe-only shape를 그대로 유지한다. ProductPlannerEntry는 additive `product_entries[]`에만 반환한다.
- `GET /meals`의 기존 `items[]`는 recipe-only shape를 그대로 유지한다. ProductPlannerEntry는 additive `product_entries[]`에만 반환한다.
- 같은 Recipe Meal 또는 ProductPlannerEntry를 두 배열, 두 `entry_type`, 또는 동일 배열에 중복 반환하지 않는다.
- 새 client adapter만 `entry_type='recipe' | 'product'`로 합친다. 기존 client가 `meals[]` 또는 `items[]`만 소비해도 shape·status 의미가 바뀌지 않는다.
- read는 entry가 pin한 `product_nutrition_version_id`, `product_name_snapshot`, `product_brand_snapshot`을 authority로 사용한다. current product metadata/version을 조용히 재적용하지 않는다.
- 주간/끼니 query는 date/column/owner scope를 DB에서 적용하고 bounded batch/join으로 product/version/profile/value를 투영한다. item별 N+1이나 pagination 이후 scope filter를 허용하지 않는다.

### Create And Atomic Pin

- `quantity.amount`는 finite 숫자 `> 0`이고 unit은 `serving / package / g / ml` 중 하나다.
- public active 제품은 모든 로그인 사용자가 추가할 수 있다. private active 제품은 `owner_user_id=auth.uid()`인 owner만 추가한다.
- `column_id`는 현재 사용자 소유여야 한다. route/service guard와 DB composite guard가 모두 `product_planner_entries.user_id = meal_plan_columns.user_id`를 강제한다.
- create transaction은 product의 active/visibility/owner 상태, current version 존재, version-product 관계, 수량 basis 호환을 다시 검증한 뒤 entry와 아래 값을 함께 commit한다.
  - `product_nutrition_version_id = 생성 순간 current_nutrition_version_id`
  - `product_name_snapshot = 생성 순간 product.name`
  - `product_brand_snapshot = 생성 순간 product.brand`
- current version이 없거나 검증과 insert 사이 경합으로 기대 version을 pin할 수 없으면 `409 NUTRITION_VERSION_CONFLICT`이고 partial entry는 0건이다.
- soft-deleted 제품으로 신규 create는 `409 PRODUCT_DELETED`다. catalog search에서 숨겨졌더라도 direct ID create를 fail-closed한다.
- Stage 2 real DB test는 catalog에서 이관된 old nutrition version을 pin한 entry와 삭제 전 생성된 entry를 보존하며, 새 current 또는 deleted 상태가 과거 pin을 바꾸지 않음을 검증한다.

### Quantity And Direct Basis Relation

- 수량 unit이 pin 대상 nutrition basis unit과 같으면 `quantity.amount / basis.amount`의 직접 배수로 계산한다.
- 다른 unit은 **같은 product의 같은 pinned immutable version**에 포함된 approved `basis_relations[]` 중 입력 basis와 label basis를 직접 연결하는 relation이 정확히 1개일 때만 정방향 또는 역방향으로 사용한다.
- direct relation의 양쪽 amount는 양수이고 relation pair와 입력 amount가 호환되어야 한다. 계산은 relation 비율의 배수만 허용한다.
- 0개면 추정하지 않고 `422 NUTRITION_BASIS_MISMATCH`다. 복수 후보, chained relation, 다른 product/version relation, current version relation 대체, 제품명·브랜드, 일반 밀도, 임의 `g↔ml`도 같은 fail-closed 오류다.
- private manual predecessor version은 `basis_relations=[]`이므로 label basis와 다른 unit으로 변환하지 않는다.
- missing/null nutrient는 0이 아니다. pinned nutrition의 complete/partial/unavailable, direct/estimated/mixed, warnings/sources 의미를 유지한다.

### Patch And Delete

- PATCH는 owner entry의 quantity만 변경한다. `product_nutrition_version_id`, `product_name_snapshot`, `product_brand_snapshot`, `product_id`, `plan_date`, `column_id`는 불변이다.
- PATCH basis 검증은 product current가 아니라 entry의 pinned version만 사용한다. product current version이 바뀌거나 private product가 soft-delete되어도 기존 entry의 허용 relation과 계산값은 변하지 않는다.
- DELETE는 owner entry row만 삭제한다. Recipe Meal, product catalog, current/old nutrition version, recipe workflow/XP/activity row를 변경하지 않는다.
- entry DELETE의 상태 멱등성을 테스트한다: 첫 성공 뒤 row와 부수 효과는 다시 생기지 않는다. 공식 문서가 replay `200`을 약속하지 않으므로 두 번째 direct ID 요청은 기존 `404 RESOURCE_NOT_FOUND` 경계를 유지하며 새 status/code를 만들지 않는다.

### Permission / RLS / Security

- 세 mutation과 두 read projection은 로그인 필수다. 비로그인은 `401 UNAUTHORIZED`다.
- 다른 사용자 column/product/entry는 `403 FORBIDDEN` 또는 scope-filtered `404 RESOURCE_NOT_FOUND`로 거부하며 다른 사용자 식별자/제품 snapshot을 새지 않는다.
- RLS만 믿지 않고 route/service에서 actor, column owner, private product owner, product-version 관계, entry owner를 재검증한다.
- `product_planner_entries`는 `auth.uid()=user_id` row만 SELECT/INSERT/UPDATE/DELETE 가능하다. anon/authenticated direct grant로 actor나 pin/snapshot 불변 필드를 우회하지 못한다.
- public product는 read/add만 가능하며 이 슬라이스의 entry API로 catalog/version을 수정하지 않는다.
- API key, auth query, cookie, raw provider row/payload/URL, manifest/internal path, service credential, 다른 사용자 identifier를 DB/API/log/report/browser bundle에 남기지 않는다.
- production/staging write는 0건이다. public actual artifact/row도 0건이며 synthetic public data는 분리된 isolated test에서만 사용한다.

### Error Contract

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 비로그인 보호 API/action |
| 403 | `FORBIDDEN` | 타 사용자 column/private product/entry 등 공식 owner 거부 |
| 404 | `RESOURCE_NOT_FOUND` | scope에서 접근 가능한 product/entry/version 없음, 삭제된 entry 재조회/재삭제 |
| 409 | `PRODUCT_DELETED` | soft-deleted 제품으로 신규 entry create |
| 409 | `NUTRITION_VERSION_CONFLICT` | create 순간 current version 부재/경합/atomic pin 실패 |
| 409 | `COLUMN_HAS_MEALS` | column에 Recipe Meal 또는 ProductPlannerEntry가 연결됨 |
| 422 | `NUTRITION_BASIS_MISMATCH` | pin 대상 version의 exactly-one direct relation으로 수량을 환산할 수 없음 |
| 422 | `VALIDATION_ERROR` | invalid date/UUID, amount `<=0`/non-finite, 허용하지 않는 unit/field |

> 공식 필드/status/code 밖으로 확장하지 않는다. API error는 `fields[]`를 포함하는 기존 error object를 유지한다.

## Data Model And Transaction Contract

### `product_planner_entries`

- 공식 컬럼만 구현한다: `id`, `user_id`, `plan_date`, `column_id`, `product_id`, `product_nutrition_version_id`, `quantity_amount`, `quantity_unit`, `product_name_snapshot`, `product_brand_snapshot`, `created_at`, `updated_at`.
- `quantity_amount > 0`, unit allowlist를 DB에서도 강제한다.
- composite FK `(column_id, user_id) -> meal_plan_columns(id, user_id)` 또는 동등하게 강한 DB guard를 둔다.
- pinned version이 같은 `product_id`에 속하도록 composite FK/trigger/RPC guard를 둔다.
- private product owner와 entry actor 일치, public/private visibility 규칙을 transaction/DB guard로 검증한다.
- pin/version/name/brand/product/date/column은 PATCH로 변경하지 못하고 quantity만 바뀐다.
- `status`, shopping/cooking/leftover 관련 컬럼은 만들지 않는다.
- 인덱스는 `(user_id, plan_date, column_id)`와 `(product_nutrition_version_id)`를 제공한다.

### Column Delete Guard

- `DELETE /planner/columns/{column_id}`는 기존 최소 1개·소유권·재정렬 규칙을 보존한다.
- 해당 column에 Recipe Meal **또는** ProductPlannerEntry가 하나라도 있으면 기존 `409 COLUMN_HAS_MEALS`다.
- route 확인과 DB race-safe guard를 모두 적용해 check 직후 concurrent entry insert로 column이 orphan되지 않게 한다.

## Structural Recipe Workflow Exclusion

- ProductPlannerEntry create/PATCH/DELETE는 `meals`를 쓰지 않고 `meals.status`를 바꾸지 않는다.
- `GET /shopping/preview`, shopping list create/complete와 recipe별 servings aggregation은 Recipe Meal만 소비한다.
- cooking session create/complete/cancel과 standalone cook는 Recipe Meal/recipe만 소비한다.
- leftover create/list/keep/eat/uneat은 recipe cooking 결과만 소비한다.
- `recipes.plan_count`, `recipes.cook_count`, recipe saved/plan metrics를 바꾸지 않는다.
- `planner_registered` XP/event와 `meal_add_path_used` activity를 만들지 않는다.
- read adapter는 product를 recipe entry로 복제하지 않는다.

## Frontend Delivery Mode

- Stage 4는 기존 `PLANNER_WEEK`, `MEAL_SCREEN`, `MENU_ADD`의 navigation·scroll·Recipe Meal interaction model을 보존하면서 product 흐름만 additive로 구현한다.
- `FOOD_PRODUCT_PICKER`는 predecessor의 기존 `GET /food-products?q&cursor&limit`만 소비한다. `next_cursor`는 해석하지 않는 opaque 값으로 다음 요청에 그대로 전달하고, `has_next=false` 또는 `next_cursor=null`이면 마지막 page로 종료한다.
- 검색어가 바뀌면 누적 item·cursor·`has_next`를 즉시 초기화하고 첫 page부터 다시 요청한다. 다음 page는 기존 순서를 보존해 append하되 stable `product.id`로 중복 제거하며, 이전 검색/느린 요청 응답은 request generation 또는 abort guard로 무시해 최신 검색어 결과만 화면에 반영한다. 새 검색 endpoint는 만들지 않는다.
- 필수 상태:
  - `loading`: product 검색/entry mutation 영역만 skeleton/pending 처리하고 기존 Recipe Meal 목록을 가리지 않음
  - `empty`: 검색 결과 없음과 끼니 entry 없음은 분리; 검색 empty에는 `[직접 등록]`
  - `error`: catalog/read/mutation 실패를 해당 영역에 표시하고 안전한 retry 제공
  - `read-only`: public product는 수정/삭제하지 못하지만 선택·추가는 가능; pin된 과거 제품은 snapshot 기준으로 표시
  - `unauthorized`: 로그인 안내 뒤 검색어·날짜·끼니·선택 product·quantity context로 return-to-action
  - `partial`: 결측 nutrient를 0으로 보이지 않고 `최소`/불완전 의미 유지
  - `unavailable`: amount `null`을 `정보 준비 중`으로 표시
- `NUTRITION_BASIS_MISMATCH`면 수량 단계에 머물고 선택/검색 context를 보존한다.
- Product entry는 Recipe Meal과 시각적으로 구분하고 status chip, 장보기, 요리하기, 남은요리 action을 표시하지 않는다.
- `MEAL_SCREEN` Product entry card는 entry가 pin한 version과 현재 entry quantity로 서버가 산출한 `nutrition.values.energy_kcal`만 사용해 `예상 열량`을 표시한다. `complete`의 non-null `amount`는 `예상 열량 X kcal`, `partial`의 non-null `known_amount`는 `예상 열량 최소 X kcal`, null/unavailable은 `예상 열량 정보 준비 중`이다. 관측된 complete `0`만 `0 kcal`이며 missing/null/unavailable을 0으로 대체하지 않고 current product version을 다시 조회·계산하지 않는다.
- `PLANNER_WEEK`/`MEAL_SCREEN`은 existing recipe 배열과 additive product 배열을 client adapter에서 한 번만 합치며 key/type 충돌 없이 렌더한다.
- `FOOD_PRODUCT_CREATE` 성공은 새 private 제품을 선택한 `FOOD_PRODUCT_PICKER` 상태로 복귀한다. 이어서 수량을 확정한 뒤 `MEAL_SCREEN`, 최종적으로 `PLANNER_WEEK` 흐름으로 돌아간다.
- 디자인 상태는 Stage 1에서 `temporary`, Stage 4 구현 후 `pending-review`, 독립 Stage 5 + final authority + Stage 6에서 blocker 0일 때만 `confirmed`다.

## Primary User Path

1. 로그인 사용자가 `PLANNER_WEEK`에서 날짜·끼니를 열어 `MEAL_SCREEN`의 `[식사 추가]`를 누른다.
2. `MENU_ADD`의 `[완제품]`으로 `FOOD_PRODUCT_PICKER`를 열어 public + 본인 private 제품을 검색한다.
3. 제품이 없으면 `FOOD_PRODUCT_CREATE`에서 private manual 제품을 등록하고 검색어·날짜·끼니·선택 context가 유지된 picker로 돌아간다.
4. 선택 제품의 pin 대상 version에서 허용하는 수량·unit을 입력한다. mismatch면 이 단계에 머물고 direct relation이 있으면 entry를 생성한다.
5. `MEAL_SCREEN`에서 Recipe Meal과 구별되는 product entry를 확인·수정·삭제하고, `PLANNER_WEEK`에서도 workflow status 없는 제품 요약을 확인한다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `PLANNER_WEEK`; 연계 high-risk surfaces `MEAL_SCREEN`, `MENU_ADD`, 신규 `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`
- Visual artifact: `ui/designs/evidence/prepared-food-planner-entry/{before,after}/`의 390px/320px/desktop 1280px screenshot plan과 아래 Stage 1 design docs
- existing authority baseline:
  - `ui/designs/PLANNER_WEEK.md`
  - `ui/designs/MEAL_SCREEN.md`
  - `ui/designs/MENU_ADD.md`
- Stage 1 product-flow design artifacts:
  - `ui/designs/PLANNER_WEEK.md#prepared-food-planner-entry-anchor-extension-addendum`
  - `ui/designs/MEAL_SCREEN.md#prepared-food-planner-entry-addendum`
  - `ui/designs/MENU_ADD.md#prepared-food-planner-entry-addendum`
  - `ui/designs/FOOD_PRODUCT_PICKER.md`
  - `ui/designs/FOOD_PRODUCT_CREATE.md`
- current-state before evidence plan: `ui/designs/evidence/prepared-food-planner-entry/before/`
- Stage 4 after evidence plan: `ui/designs/evidence/prepared-food-planner-entry/after/`
- required viewport evidence: 기존 `PLANNER_WEEK`, `MEAL_SCREEN`, `MENU_ADD` 각각의 **before + after**를 390px, narrow 320px, desktop 1280px에서 모두 확보한다. 신규 `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`는 동일 3개 viewport의 after를 확보한다. 최초 진입, scroll 중, primary CTA, empty/error/unauthorized/basis mismatch, mixed recipe/product entry 상태도 별도 evidence로 남긴다.
- authority report: `ui/designs/authority/PLANNER_WEEK-prepared-food-planner-entry-authority.md`
- Authority status: `required`
- Independent authority는 아직 pending이다. Stage 4 implementation 전에 current-state screenshot을 확보하고, fresh authority precheck → Stage 5 → 별도 final authority gate → Stage 6 순서를 지킨다.
- `PLANNER_WEEK`의 Baemin prototype navigation/day-card/scroll containment와 기존 Recipe Meal CTA/status hierarchy를 바꾸지 않는다. Product entry는 additive 정보로 밀도를 조절하며 page-level horizontal overflow를 만들지 않는다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.20.md`
- `docs/화면정의서-v1.5.26.md`
- `docs/유저flow맵-v1.3.23.md`
- `docs/db설계-v1.3.21.md`
- `docs/api문서-v1.2.25.md`
- `docs/workpacks/prepared-food-catalog/{README.md,acceptance.md,automation-spec.json}`
- `docs/engineering/{slice-workflow.md,agent-workflow-overview.md,tdd-vitest.md,playwright-e2e.md,qa-system.md,product-design-authority.md}`
- `docs/design/{design-tokens.md,mobile-ux-rules.md,anchor-screens.md}`

## QA / Test Data Plan

### Fixture Baseline

- 사용자 A/B, 각 사용자 owned `meal_plan_columns`, 기존 Recipe Meal 상태 3종
- A private manual active product/current version, B private product, soft-deleted A product
- isolated-test-only synthetic public active product with one approved direct `serving ↔ g` relation
- same name/brand but different stable-key synthetic public pair; 운영 public evidence로 사용하지 않음
- pinned old product version, new current version, product name/brand 변경, soft-deleted product
- missing/observed-zero/partial/unavailable nutrient fixtures
- basis match, exact forward/reverse relation, no relation, multiple/direct-invalid/cross-version/chaining candidates
- create failure injection, two-session version switch/create race, concurrent entry insert/column delete race

### Stage 2 Real Isolated PostgreSQL

- Stage 2는 `scripts/run-prepared-food-planner-entry-postgres-integration.mjs`, `tests/fixtures/prepared-food-planner-entry-postgres-harness.ts`, `tests/prepared-food-planner-entry-postgres.integration.test.ts`를 만들고 `package.json`에 `test:prepared-food-planner-entry:postgres`를 연결한다. 단일 실행 명령은 `pnpm test:prepared-food-planner-entry:postgres`다.
- runner는 기존 `scripts/run-prepared-food-catalog-postgres-integration.mjs`의 `mkdtemp -> non-5432 port 예약 -> initdb -> pg_ctl -> createdb -> finally pg_ctl stop + rmSync` lifecycle과 `tests/fixtures/recipe-nutrition-postgres17-closeout-harness.ts`의 실제 bootstrap adapter 패턴을 재사용한다. 사용자의 기존 DB/container/volume, production/staging URL은 읽거나 쓰지 않는다.
- isolated DB에는 auth roles/`auth.uid()` test shim을 만든 뒤 `20260301000000_core_schema_bootstrap.sql`, `20260610170000_recipe_book_cover_metadata.sql`, `20260714143000_ingredient_nutrition_conversion_model.sql`, `20260716090000_add_recipe_nutrition_snapshots.sql`, `20260716120000_prepared_food_catalog.sql`, Stage 2의 product entry migration을 순서대로 적용한다. 대상 DB name/comment와 non-5432 port를 test 시작 시 assert한다.
- A/B는 `public.users` row까지만 fixture로 준비한 다음 repo의 실제 `ensureUserBootstrapState`를 harness adapter로 호출한다. `meal_plan_columns`를 SQL로 직접 seed하지 않으며, 각 owner에 `아침/점심/저녁` 3개가 생기고 두 번째 bootstrap이 멱등임을 먼저 검증한 뒤 그 실제 column ID를 모든 entry/column guard test가 사용한다.
- fixture product/version/recipe/Meal/entry는 case별 고정 UUID namespace로 준비한다. 일반 case는 test transaction rollback, 두-session race처럼 commit이 필요한 case는 scoped FK 역순 reset을 사용하고 다음 case 전에 owner/product/entry count 0을 assert한다. 전체 종료는 runner `finally`가 process/socket/data directory를 제거한다.
- route/service와 실제 DB constraint/RLS/direct grants를 모두 검증한다.
- 두 connection으로 current version pin race를 재현해 하나의 consistent 결과 또는 공식 409만 허용하고 partial entry 0을 확인한다.
- transaction 중 snapshot/version/entry insert 실패를 주입해 atomic rollback을 확인한다.
- old pinned version, product metadata/current 변경, soft-delete 후 기존 entry read/PATCH, 새 create `PRODUCT_DELETED`를 확인한다.
- 다른 사용자 private product/column/entry read/write/leak 0, anon/authenticated direct immutable-field mutation 0을 확인한다.
- column delete가 Recipe Meal 또는 ProductPlannerEntry 모두에서 `COLUMN_HAS_MEALS`이고 concurrent race에도 orphan 0인지 확인한다.
- Recipe Meal, shopping, cooking, leftover, recipe count, XP/activity가 product entry 전후 동일함을 DB row count/targeted regression으로 확인한다.
- cleanup에서 ephemeral DB/process/test row가 남지 않아야 한다.

### Stage 4 Browser / Real UI

- `MENU_ADD → FOOD_PRODUCT_PICKER → 선택 → 수량 → entry → MEAL_SCREEN → PLANNER_WEEK`
- empty search → `FOOD_PRODUCT_CREATE` → selected picker 복귀
- guest login gate → 검색어·날짜·끼니·선택·quantity return-to-action
- product entry status/action 부재와 Recipe Meal status/action 보존
- PATCH pinned-old-version, delete confirm, basis mismatch에서 수량 단계 유지
- loading/empty/error/read-only/unauthorized/partial/unavailable와 missing≠0
- 390px, 320px, desktop 1280px screenshot 및 page-level horizontal overflow/CTA/focus/keyboard/axe 확인
- `pnpm verify:frontend:pr` green 뒤 exploratory QA + qa eval, merge 전 `pnpm verify:frontend`

### Blocker Conditions

- official five/SOT version 불일치 또는 predecessor/catalog merge 미확인
- meal column bootstrap이 없거나 실제 user에 owner column이 생성되지 않음
- isolated DB에서 RLS/constraint/two-session race/rollback을 재현하지 못함
- Recipe Meal/status/shopping/cooking/leftover/XP 회귀 발생
- public actual row를 synthetic fixture로 대체하거나 production/staging write 발생
- 390/320/desktop evidence 또는 independent authority blocker 0 증거 부재

## Stage Ownership And Review Gates

### Stage 1 / 1.5

- fresh Codex docs author: workpack/acceptance/automation/work-item/status/design docs 작성. 자기 승인 금지.
- independent fresh Codex Stage 1.5 reviewer: official five와 exact diff를 Blocker/Important/Suggestion으로 검수.
- separate repair-final role: accepted finding만 수정하고 reviewer가 새 exact head를 재검수.
- unresolved required finding 0, doc gate/validators green, docs PR merge 전 Stage 2 시작 금지.

#### Stage 1.5 Approval Projection

- 첫 독립 review head `b137aa4e9d090827a80301ab47cc55710821a166`: Blocker/Important/Suggestion `0/6/0`, `REQUEST_CHANGES`.
- 별도 repair-final 역할이 Important 6건을 한 차례 수정했고 자기 변경을 승인하지 않았다.
- fresh independent re-review head `fe210b7169094edc77b64e91a730d86720d598ae`: `DOC_GATE_APPROVED`, Blocker/Important/Suggestion `0/0/0`.
- 같은 exact head의 current-head checks는 success 7, 의도된 docs skip 5, pending/fail 0이다.
- 이 승인은 Stage 1 설계 계약과 문서 gate에만 해당한다. Stage 4 screenshot/browser evidence, authority precheck, Stage 5, final authority, Stage 6은 아직 대기이며 `Design Status`는 `temporary`다.

### Stage 2 Backend TDD

- fresh implementer가 RED → GREEN → REFACTOR를 기록한다.
- request/response/error/type, schema/RLS/transaction, two read projections, column guard와 structural exclusions를 함께 구현한다.
- implementation actor는 acceptance backend 항목과 evidence를 갱신하지만 자기 Stage 3 승인을 하지 않는다.

#### Stage 2 Implementation Evidence — Approved By Independent Stage 3 Review

- RED: 최초 5개 파일 9개 테스트 중 계약 미구현에 해당하는 8개 실패를 확인했고, ProductPlannerEntry가 연결된 column 삭제가 200으로 잘못 통과하는 회귀 테스트도 별도로 409 기대 실패로 고정했다.
- GREEN/REFACTOR: 신규 service/API/read/RLS/regression과 기존 planner/meals/column 회귀 묶음이 8 files, 66 tests로 통과했다.
- real PostgreSQL: non-5432 ephemeral PostgreSQL에서 공식 6개 migration 순서, 실제 `ensureUserBootstrapState`, constraint/RLS/direct grant, atomic pin/old pin/delete, current-version create race와 column-delete/create race를 1 file, 11 tests로 검증했다. Stage 3 수리에서 test-only `AFTER INSERT` 예외 주입이 statement 전체를 rollback하고 scoped residual row가 0임을 확인했으며, 관측된 `0`은 `complete/0`, missing/null은 `unavailable/null`로 구분했다.
- repository gate: `pnpm verify:backend`가 product 1,519 passed/22 skipped, production build, security Playwright 12 passed로 통과했다. source-of-truth/workflow-v2/workpack/automation-spec/OMO bookkeeping validator와 `git diff --check`도 통과했다.
- 이 Stage 2 구현 증거는 별도 수리 뒤 fresh independent Stage 3 reviewer가 exact head `25b56d1a767a8fc03f85024b418ead202e8d900b`에서 `STAGE3_APPROVED`, Blocker/Important/Suggestion `0/0/0`으로 승인했다. 이 승인은 backend Stage 3에만 해당하며 Stage 4 이후 승인을 대신하지 않는다.

### Stage 3 Backend Review

- implementation과 분리된 fresh reviewer가 exact PR head에서 contract/RLS/direct grants, two-session race, rollback, immutable pin, read dedupe/N+1, workflow exclusions를 검수한다.
- required finding은 별도 repair role이 처리하고 같은 reviewer가 새 exact head를 재검수한다.
- reviewer 승인, actual verification, closeout sync, current-head checks green 전 backend merge 금지.
- 첫 Stage 3 review는 implementation head `8137ef7c00e9c23fc09d0c2937650be351be780a`에서 `REQUEST_CHANGES`였다. required finding 2건은 실제 case-scoped FK 역순 reset/row-count assertion·insert 후 예외 rollback·observed-zero fixture 보강과 roadmap/workflow-v2 Stage 2/3 projection drift 수리다.
- repair role은 자기 변경을 승인하지 않았다. 별도 수리 commit `25b56d1a767a8fc03f85024b418ead202e8d900b`이 두 finding을 닫은 뒤 fresh independent reviewer가 같은 exact head를 `STAGE3_APPROVED`, Blocker/Important/Suggestion `0/0/0`으로 승인했다.
- 승인 근거는 targeted 66/66, isolated PostgreSQL 11/11, `pnpm verify:backend` product 1,519 passed/22 intended skipped + production build + security Playwright 12/12, source-of-truth/workflow/workpack/automation/OMO/closeout validators green이다. GitHub exact reviewed-head checks도 success 16, intended skip 2, pending/fail/cancel 0이다.
- post-closeout projection commit/head와 그 head의 checks는 아직 없으므로 backend merge gate의 `current_head_sha`는 pending이고 `all_checks_green=false`다. 오케스트레이터가 새 head를 push하고 그 exact head를 다시 검증하기 전 merge하지 않는다.
- 이 승인은 Stage 3 backend review만 닫는다. Stage 4 UI, authority precheck, Stage 5, final authority, Stage 6은 pending이고 전체 lifecycle은 `in_progress`, `Design Status`는 `temporary`다.

### Stage 4 Frontend

- backend merge 뒤 fresh frontend implementer가 API shape를 그대로 소비한다.
- 390/320/desktop browser evidence, exploratory QA/eval, accessibility, performance, return-to-action을 닫는다.
- Stage 4 actor는 자기 디자인/최종 PR 승인을 하지 않는다.

### Stage 5 / Final Authority / Stage 6

- fresh authority precheck가 screenshot/Figma evidence와 official flow를 비교한다.
- 분리된 Stage 5 design reviewer가 scope=frontend review=5 항목을 검수한다.
- 별도 final authority가 blocker 0과 390/320/desktop evidence를 승인하기 전 `Design Status: confirmed` 금지.
- fresh Stage 6 reviewer가 full contract, accessibility/security/performance, exploratory QA/eval, current-head checks, closeout projection을 최종 검수한다.

## Delivery Checklist

### Backend — Stage 2 / Review Stage 3

- [x] 세 mutation endpoint가 공식 wrapper/body/response/error만 구현한다 <!-- omo:id=delivery-product-entry-three-mutations;stage=2;scope=backend;review=3 -->
- [x] `GET /planner` recipe-only `meals[]`와 additive deduped `product_entries[]`를 제공한다 <!-- omo:id=delivery-product-entry-planner-read;stage=2;scope=backend;review=3 -->
- [x] `GET /meals` recipe-only `items[]`와 additive deduped `product_entries[]`를 제공한다 <!-- omo:id=delivery-product-entry-meals-read;stage=2;scope=backend;review=3 -->
- [x] create가 current version + name/brand snapshot을 원자 pin하고 conflict/rollback을 지킨다 <!-- omo:id=delivery-product-entry-atomic-pin;stage=2;scope=backend;review=3 -->
- [x] same-unit 또는 exactly-one direct pinned relation만 정/역방향 환산한다 <!-- omo:id=delivery-product-entry-basis;stage=2;scope=backend;review=3 -->
- [x] PATCH가 quantity만 바꾸고 old pin/snapshot/current-change 안정성을 유지한다 <!-- omo:id=delivery-product-entry-patch-pin;stage=2;scope=backend;review=3 -->
- [x] DELETE가 owner row만 없애고 state-idempotency/공식 replay 404를 지킨다 <!-- omo:id=delivery-product-entry-delete;stage=2;scope=backend;review=3 -->
- [x] RLS/direct grants/route guard가 cross-owner leak/write와 immutable-field 우회를 0으로 만든다 <!-- omo:id=delivery-product-entry-security;stage=2;scope=backend;review=3 -->
- [x] column delete guard가 Recipe Meal과 ProductPlannerEntry 모두를 race-safe하게 막는다 <!-- omo:id=delivery-product-entry-column-guard;stage=2;scope=backend;review=3 -->
- [x] shopping/cooking/leftover/recipe counts/XP/activity에서 제품 entry가 구조적으로 제외된다 <!-- omo:id=delivery-product-entry-workflow-exclusion;stage=2;scope=shared;review=3,6 -->
- [x] isolated PostgreSQL에서 constraint/RLS/two-session race/rollback/old pin/delete/cleanup이 통과한다 <!-- omo:id=delivery-product-entry-real-db;stage=2;scope=backend;review=3 -->
- [x] public actual artifact/row와 production/staging write가 0이고 synthetic public fixture가 격리된다 <!-- omo:id=delivery-product-entry-zero-write;stage=2;scope=shared;review=3,6 -->
- [x] fresh independent Stage 3 reviewer가 repair exact head `25b56d1a767a8fc03f85024b418ead202e8d900b`를 `STAGE3_APPROVED` 0/0/0으로 승인한다 <!-- omo:id=delivery-product-entry-stage3-review;stage=2;scope=backend;review=3 -->

### Frontend — Stage 4 / Review Stages 5 And 6

- [x] MENU_ADD에서 FOOD_PRODUCT_PICKER, 없으면 CREATE, 선택 복귀, 수량, entry, PLANNER_WEEK flow가 동작한다 <!-- omo:id=delivery-product-entry-primary-flow;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK/MEAL_SCREEN이 Recipe Meal과 product entry를 중복 없이 구분하고 product workflow status/action을 표시하지 않는다 <!-- omo:id=delivery-product-entry-type-ui;stage=4;scope=frontend;review=5,6 -->
- [x] loading/empty/error/read-only/unauthorized/partial/unavailable를 분리하고 missing을 0으로 표시하지 않는다 <!-- omo:id=delivery-product-entry-ui-states;stage=4;scope=frontend;review=5,6 -->
- [x] basis mismatch가 수량 단계와 선택 context를 보존한다 <!-- omo:id=delivery-product-entry-basis-ui;stage=4;scope=frontend;review=5,6 -->
- [x] guest return-to-action이 검색어·날짜·끼니·선택·quantity context를 복원한다 <!-- omo:id=delivery-product-entry-return;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px/desktop browser evidence와 scroll/CTA/accessibility 회귀가 닫힌다 <!-- omo:id=delivery-product-entry-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA/eval과 frontend full verification이 green이다 <!-- omo:id=delivery-product-entry-qa;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh authority precheck/Stage 5/final authority/Stage 6에서 unresolved blocker 0이다 <!-- omo:id=delivery-product-entry-authority;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [x] independent Stage 1.5 review/repair-final exact-head 승인 <!-- omo:id=delivery-product-entry-stage1-review;stage=2;scope=shared;review=3,6 -->
- [x] docs PR #1016 merge <!-- omo:id=delivery-product-entry-docs-merge;stage=2;scope=shared;review=3,6 -->
- full repository migration stack 전체와 plain PostgreSQL 대비 Supabase/PostgREST/auth claim 동등성
- 실제 physical iOS/Android narrow device와 screen reader 수동 확인
- 현재 0건인 approved public promotion artifact의 향후 운영 승인·load·license 검수
- production 규모의 version pin/column delete contention과 query plan 측정

## Design Status

`pending-review` — Stage 4 evidence·자동화와 fresh authority precheck(B/I/S 0/0/0)는 준비됐지만, 구현자는 자기 디자인/최종 승인을 하지 않는다. Stage 5·final authority·Stage 6이 아직 대기이므로 `confirmed`가 아니다.

## Key Rules

- 완제품은 Recipe Meal이 아니며 `workflow_status=null`이다.
- product entry는 생성 순간 immutable version과 제품 이름/브랜드를 원자적으로 pin한다.
- 같은 unit direct scale 또는 같은 pinned version의 exactly-one approved direct relation만 허용한다.
- 결측은 0이 아니며 relation을 추정하거나 chain하지 않는다.
- 기존 recipe arrays와 product arrays는 서로 중복되지 않는다.
- product entry는 shopping/cooking/leftover/recipe counts/XP/activity에서 구조적으로 제외한다.
- production/staging write 0, public actual artifact/row 0을 숨기지 않는다.
- 새 field/status/endpoint/error code를 임의 추가하지 않는다.

## Contract Evolution Candidates

없음. 현재 공식 v1.7.20/v1.5.26/v1.3.23/v1.3.21/v1.2.25 안에서 구현 가능하다. entry DELETE replay는 새 200 계약으로 확장하지 않고 기존 404 경계를 유지한다.
