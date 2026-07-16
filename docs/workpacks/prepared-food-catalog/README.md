# Slice: prepared-food-catalog

## Goal

승인된 stable product key를 가진 public 완제품과 사용자가 직접 등록한 private 완제품을 하나의 검색 catalog 계약으로 제공한다. 다만 현재 승인된 public product promotion artifact는 0건이므로 Stage 2의 실제 catalog write/read 결과는 private manual 제품만 대상으로 하며, public row는 승인 artifact가 생기기 전까지 fail-closed 0건을 유지한다. private manual 제품은 owner만 생성·조회·수정·soft-delete할 수 있고, 영양 수정은 기존 값을 덮어쓰지 않고 새 immutable version을 원자적으로 current로 전환해 과거 planner pin을 보존한다.

이 슬라이스는 backend-only catalog Stage 2/3만 닫는다. 완제품을 플래너에 추가하는 `prepared-food-planner-entry`, 계획 영양 합계, Stage 4 UI는 후속 범위다.

## Branches

- 문서: `docs/prepared-food-catalog`
- 백엔드: `feature/be-prepared-food-catalog`
- 프론트엔드: N/A — Stage 4 UI 없음

## In Scope

- API:
  - `GET /food-products`
  - `POST /food-products`
  - `PATCH /food-products/{product_id}`
  - `DELETE /food-products/{product_id}`
- catalog read:
  - active public 제품과 현재 사용자 소유 active private 제품만 검색
  - `q`, opaque `cursor`, 기본 20·최대 50 `limit`
  - public approved stable-key subset과 current immutable nutrition version projection
  - 삭제 제품과 다른 사용자의 private 제품 비노출
- private manual write:
  - owner-only create/update/soft-delete
  - `visibility='private'`, `source_type='manual'` 고정
  - 첫 nutrition profile/value/version과 product current pointer의 단일 transaction 생성
  - nutrition 변경 시 새 immutable version 생성과 atomic current pointer 전환
  - metadata-only 변경 시 current nutrition version 유지
- public catalog protection:
  - `visibility='public'`, `source_type='public_dataset'`, `owner_user_id IS NULL`
  - 승인 source, stable product key, 기준량, 핵심 영양값이 온전한 subset만 노출
  - 현재 승인된 promotion artifact 0건에 따라 Stage 2 public row와 public 검색 결과 0건 유지
  - synthetic public fixture는 isolated test에서만 사용하고 운영/public row 생성 근거로 사용하지 않음
  - 일반 사용자 mutation 금지
- DB 영향:
  - `food_products`
  - `food_product_nutrition_versions`
  - shared `nutrition_profiles`, `nutrition_values`
  - public provenance read: `nutrition_sources`, `nutrition_source_items`
- real DB verification:
  - 사용자 기존 DB/container/volume과 분리된 isolated PostgreSQL
  - constraint, RLS/privilege, cross-owner denial, immutable version, concurrency, idempotency, transaction rollback
- Schema Change:
  - [ ] 없음
  - [x] 있음 → 공식 DB v1.3.21의 `food_products`, `food_product_nutrition_versions`와 필요한 constraint/RLS/guard migration

## Out of Scope

- `product_planner_entries` 생성·조회·수정·삭제와 `prepared-food-planner-entry` 전체
- planner `product_entries` projection과 Meal/ProductPlannerEntry adapter
- 끼니·날짜·주간 `계획 영양` 합계와 `GET /planner/nutrition`
- 완제품 관리·검색·등록·수정·삭제 Stage 4 UI, route, browser flow, screenshot
- shopping preview/list, cooking session, leftover, XP/activity에서 제품 entry를 제외하는 후속 구현
- barcode/OCR 입력·스캔, 외식 메뉴, 밀키트, 실제 섭취 기록, 의료 처방·질환 코칭
- 일반 사용자가 public 제품을 생성·수정·삭제하거나 private 제품을 public으로 전환하는 기능
- private manual `basis_relations` 입력·승인·추정, 관계 chaining, 범용 밀도, 임의 `g↔ml` 환산
- 이름+브랜드 유사성, fuzzy matching, first-row 선택으로 public 제품을 merge하는 로직
- runtime provider 호출, 신규 public source 수집·promotion, public importer/operator CLI·seed, raw provider payload 저장
- 승인 artifact가 생기기 전 public row 생성 또는 synthetic fixture의 운영/public 승격
- 문서에 없는 endpoint, HTTP status, error code, request/response field 추가

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `ingredient-nutrition-conversion-model` | merged — nutrition source/profile/value와 승인·불변 predecessor 제공 | [x] |
| nutrition/products/planner official contract | merged — 요구사항 v1.7.20, DB v1.3.21, API v1.2.25와 SOT에 포함 | [x] |
| independent Codex Stage 1.5 docs gate | 이 작성 작업과 분리된 새 Codex 작업 필요 | [ ] |

> 사용자가 승인한 nutrition/products/planner Codex-only 예외에 따라 Stage 1 author, Stage 1.5 review/repair-final, Stage 2 backend implementer, Stage 3 reviewer는 서로 다른 새 Codex 작업으로 분리한다. 이 작성 작업은 자기 산출물을 승인하지 않는다.

## Proposal Decision

| 선택지 | 무결성 | 과거 pin 안정성 | 공식 계약 정합성 | 판정 |
| --- | --- | --- | --- | --- |
| product row의 영양값을 직접 overwrite | 수정은 단순하지만 이력을 잃음 | 기존 planner pin이 현재값 변경에 흔들림 | immutable version 계약 위반 | 거부 |
| 이름+브랜드로 public 제품을 병합 | stable key가 없어 오병합 가능 | provenance가 섞임 | 명시적 금지 | 거부 |
| stable-key public subset + owner-only private + immutable version/current pointer | 승인 경계와 소유권이 명확 | 과거 version과 pin 보존 | API/DB 공식 계약과 일치 | 채택 |

## Backend First Contract

### Public API Boundary

- 모든 JSON 응답은 기존 `{ success, data, error }` wrapper를 유지하며 error는 `{ code, message, fields[] }`다.
- `GET /food-products`는 로그인한 사용자가 읽을 수 있는 active public + self-owned active private 제품만 반환한다.
- 각 item은 공식 `id`, `name`, `brand`, `visibility`, `source_type`, `editable`, `nutrition_version_id`, `basis_relations`, `nutrition` shape만 투영한다.
- public `nutrition.sources`는 실제 영양값에 기여한 승인 attribution의 안전한 6개 field만 포함한다: `provider`, `dataset`, `source_version`, `data_basis_date`, `license`, `source_url`.
- public `basis_relations[]`는 응답의 `nutrition_version_id`에 직접 귀속된 승인 immutable relation만 포함한다. 승인 relation이 없으면 빈 배열이다.
- `POST /food-products`는 private/manual 제품만 생성한다. `visibility`, `source_type`, `owner_user_id`, `external_product_key`, `basis_relations`를 client가 지정하는 public 전환 surface를 추가하지 않는다.
- create의 `name`은 필수이고 `brand`는 선택·nullable이다. PATCH는 공식 `name`, `brand`, `nutrition` 선택 field만 받는다.
- `PATCH /food-products/{product_id}`는 공식 `name`, `brand`, `nutrition` 선택 field만 받는다. nutrition이 있으면 전체 라벨 basis/value 규칙으로 새 version을 만들고, 없으면 metadata만 갱신한다.
- `DELETE /food-products/{product_id}`는 본인 private 제품을 soft-delete하고 이미 삭제된 본인 제품에도 `{ deleted: true }`를 반환한다.

### Manual Nutrition Input

- `nutrition.basis.amount > 0`이다.
- `nutrition.basis.unit`은 `serving / package / g / ml` 중 하나다.
- `energy_kcal`은 필수이며 finite 숫자 `>= 0`이다.
- 나머지 핵심 nutrient `carbohydrate_g`, `protein_g`, `fat_g`, `sodium_mg`와 optional nutrient 정확히 `sugars_g`, `saturated_fat_g`, `fiber_g`는 생략 또는 null 가능하다. 제공된 숫자는 finite `>= 0`이어야 한다.
- 생략·null·blank·parse 실패는 0이 아니다. `nutrition_values`에 거짓 zero row를 만들지 않고 API projection도 unavailable 의미를 보존한다.
- 정의되지 않은 nutrient code는 기존 `422 UNSUPPORTED_NUTRIENT`다.
- manual create/PATCH는 `basis_relations`를 받지 않으며 해당 immutable version의 `basis_relations_json`은 항상 `[]`다.
- manual attribution은 raw label/provider data가 아니라 공식 `user_label` projection만 사용한다.

### Public Catalog Admission

- predecessor의 MFDS live evidence는 page 1 / size 1 transport smoke뿐이며, catalog로 승격 승인된 public product artifact는 현재 0건이다.
- Stage 2는 public importer, operator CLI, public seed를 구현하지 않고 public row와 public 검색 결과를 fail-closed 0건으로 유지한다. 실제 write/read 가능한 catalog는 private manual 제품뿐이다.
- synthetic public product는 isolated test에서 admission constraint, read-only, attribution projection을 검증하는 fixture로만 허용한다. 운영/public row 생성, promotion, 실제 catalog 내용의 근거가 될 수 없다.
- public 제품은 승인된 source와 stable `external_product_key`, 유효 basis, 핵심 영양값이 온전한 검수 subset만 등록·노출한다.
- 같은 provider product는 `(source_type, external_product_key)` uniqueness로 보호한다.
- 제품명+브랜드가 같거나 비슷하다는 이유만으로 합치지 않는다.
- public row는 `owner_user_id IS NULL`이고 일반 사용자에게 `editable=false`다.
- public 영양 version의 profile/value/source item과 `basis_relations_json`은 승인된 직접 provenance만 pin한다.
- public `nutrition.sources`는 1건 이상이어야 하며 각 attribution의 `source_version`은 null일 수 없다.
- API key, auth query, cookie, raw fetch URL/payload/row, 내부 manifest·filesystem path는 DB projection, API, log, report에 포함하지 않는다.
- runtime provider 조회, unapproved seed, 이름+브랜드 기반 생성·merge는 모두 금지한다.

## Data Model And Transaction Contract

### `food_products`

- public/public_dataset/null owner 또는 private/manual/non-null owner 조합만 허용한다.
- `current_nutrition_version_id`는 NOT NULL deferred FK이며 commit된 product는 반드시 자신에게 속한 current version을 가진다.
- product row와 첫 profile/value/version/current pointer는 미리 만든 UUID를 사용해 한 transaction으로 생성한다.
- create 중 profile/value/version/pointer 어느 단계든 실패하면 product 포함 전체 write가 rollback된다.
- `deleted_at`은 soft-delete 시각이다. old version과 기존 planner pin은 보존하고 검색·신규 entry 대상에서는 제외한다.

### `food_product_nutrition_versions`

- `(product_id, version)`과 `(product_id, nutrition_profile_id)` uniqueness를 유지한다.
- version, profile/value payload, source item, `basis_relations_json`은 insert 후 UPDATE/DELETE하지 않는다.
- nutrition PATCH는 현재 version을 compare-and-switch해 새 version과 pointer 전환을 한 transaction으로 수행한다.
- metadata-only PATCH는 새 profile/value/version을 만들지 않고 `current_nutrition_version_id`를 유지한다.
- 동시 nutrition PATCH에서 한 요청만 current를 전환하고 loser는 `409 NUTRITION_VERSION_CONFLICT`다. orphan partial version/pointer를 남기지 않는다.
- public approved relation item만 양수 amount와 `serving / package / g / ml` unit을 사용한다. manual version은 항상 빈 배열이다.

## Permission / RLS / Security

- login이 필요한 네 endpoint의 기존 401 경계를 유지한다.
- public 제품은 검색/read만 허용하고 일반 사용자의 PATCH/DELETE를 `403 FORBIDDEN`으로 거부한다.
- private manual 제품은 owner만 read/update/soft-delete할 수 있다.
- 다른 사용자의 private 제품과 삭제 제품은 검색에서 scope-filter하고, 직접 ID read/modify 시 공식 404/403 존재 은닉 경계를 그대로 유지한다.
- client는 owner, visibility, source type, public key/provenance, current version ID, immutable version ID/version, relation을 임의 주입할 수 없다.
- RLS만 믿지 않고 service/route layer에서도 owner, product-version 관계, deleted 상태, public read-only, expected current version을 검증한다.
- anon/authenticated direct table mutation으로 public row, 다른 사용자 row, immutable version/profile/value를 변경할 수 없다.
- production/staging catalog load, promotion, backfill write는 별도 운영 승인 전 정확히 0건이다.

## Error And State Contract

| 상황 | 처리 |
| --- | --- |
| 비로그인 catalog 요청 | 기존 `401` |
| public 제품 mutation | `403 FORBIDDEN` |
| 다른 사용자 private 제품 접근·변경 | scope-filtered 비노출과 공식 403/404 경계 유지 |
| 접근 가능한 product가 없거나 scope-filtered로 숨겨짐 | `404 RESOURCE_NOT_FOUND` |
| 삭제된 제품 재삭제 | `200` + `{ deleted: true }` |
| 필수 `name` 누락, invalid basis, 음수/비정상 nutrient, 잘못된 body | `422 VALIDATION_ERROR` |
| 미지원 nutrient code | `422 UNSUPPORTED_NUTRIENT` |
| 동시 current nutrition 변경 | `409 NUTRITION_VERSION_CONFLICT` |
| 삭제 제품으로 신규 planner entry | 후속 entry endpoint의 기존 `409 PRODUCT_DELETED`; 이 슬라이스는 endpoint를 구현하지 않음 |
| transaction 중 version/profile/value/current 전환 실패 | 전체 rollback, 이전 current와 product 상태 보존 |

## Performance And Operational Boundaries

- catalog는 cursor 기반 pagination과 최대 `limit=50`을 지키며 public/self-private/deleted scope를 SQL 단계에서 제한한다.
- current version, profile/value, source attribution, approved relation을 bounded batch/join으로 읽고 item별 N+1 query를 만들지 않는다.
- `q` 검색이 scope filter나 stable cursor ordering을 우회하지 않는다.
- concurrency 검증은 실제 두 connection/transaction으로 current compare-and-switch 경합을 재현한다.
- rollback은 새 incomplete row를 노출하지 않고 이전 current와 old immutable version을 유지한다.

## Frontend Delivery Mode

- N/A — backend-only Stage 2/3 슬라이스다.
- Stage 4 UI, frontend route/state, Playwright, screenshot artifact는 만들지 않는다.

## Design Authority

- `not_required` — 사용자 화면 변경이 없다.
- anchor screen, generator, critic, authority report, Stage 4 evidence는 모두 빈 배열 또는 false다.

## Design Status

- N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.20.md` lines 1161-1177
- `docs/화면정의서-v1.5.26.md` lines 937-986 — 이 backend-only 슬라이스의 public read-only, private owner-only, picker-create 경계와 후속 UI flow 제외 근거
- `docs/유저flow맵-v1.3.23.md` lines 571-622 — catalog 검색/등록과 후속 planner-entry flow의 분리 근거
- `docs/db설계-v1.3.21.md` lines 1439-1497
- `docs/api문서-v1.2.25.md` lines 1520-1688
- `docs/workpacks/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/tdd-vitest.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/workflow-v2/README.md`

## QA / Test Data Plan

### TDD Order

1. API request/response/error type와 public/private scope fixture를 먼저 고정한다.
2. create validation과 첫 version/current pointer rollback을 RED로 확인한다.
3. metadata-only PATCH와 nutrition PATCH immutable-version 차이를 RED로 확인한다.
4. public/cross-owner/delete/RLS guards와 idempotent delete를 RED로 확인한다.
5. 두 transaction nutrition update conflict와 실패 rollback을 RED로 확인한다.
6. 최소 구현 후 targeted Vitest와 isolated PostgreSQL integration을 GREEN으로 만든다.

### Deterministic Fixtures

- 승인 stable key·완전한 핵심 영양·1건 이상 attribution·non-null `source_version`을 가진 synthetic public product. isolated test 전용이며 운영/public row 생성이나 promotion 근거로 사용할 수 없다.
- public 제품과 같은 이름/브랜드지만 다른 stable key를 가진 별도 product
- 사용자 A private manual active/deleted product
- 사용자 B private manual active product
- energy `0`, optional null/missing, invalid negative/non-finite/unsupported nutrient body
- `serving/package/g/ml` basis와 invalid zero/negative/unsupported basis
- metadata-only PATCH와 nutrition PATCH 전후 immutable version graph
- 동일 expected current version을 경쟁하는 두 writer

### Isolated PostgreSQL Real DB Gate

- 기존 사용자 DB/container/volume을 재사용하거나 삭제하지 않는다.
- 별도 ephemeral PostgreSQL에 전체 migration과 최소 deterministic fixture를 적용한다.
- 실제 DB에서 다음을 검증한다.
  - public/private owner/source/visibility CHECK와 stable key uniqueness
  - product-current-version same-product 관계와 commit-time NOT NULL/deferred FK
  - version/profile/value/relation append-only와 UPDATE/DELETE denial
  - owner RLS, public read-only, A→B read/modify denial, anon/authenticated direct mutation denial
  - first create atomicity, nutrition version atomic switch, injected failure rollback
  - 실제 two-session concurrency의 single winner + `NUTRITION_VERSION_CONFLICT`
  - idempotent soft-delete와 old version/planner pin retention, 신규 entry 차단 prerequisite
- cleanup 뒤 test role/user/product/version/profile/value row와 ephemeral DB가 남지 않았음을 확인한다.
- plain PostgreSQL 검증은 full Supabase/PostgREST 동등성을 자동 증명하지 않으므로 남은 위험으로 기록한다.

### Current Public Data Gate

- predecessor public source evidence는 MFDS page 1 / size 1 transport smoke에 한정되고, 현재 승인된 public product promotion artifact는 0건이다.
- Stage 2는 public importer·operator CLI·seed를 만들지 않는다. migration과 guard는 공식 target schema를 구현하되 실제 public row 및 public 검색 결과는 0건으로 유지한다.
- isolated PostgreSQL synthetic fixture는 constraint/RLS/read projection 테스트가 끝나면 정리하며, production/staging을 포함한 운영 환경으로 복사·승격하지 않는다.
- 향후 public artifact가 승인되면 이 슬라이스 구현을 근거로 즉시 적재하지 않고 별도 source/license/stable-key/basis/core-nutrition 검수와 promotion 승인을 먼저 거친다.

## Key Rules

- public은 approved stable-key subset read-only이고 name+brand merge를 하지 않는다.
- 현재 approved public promotion artifact는 0건이므로 Stage 2 public row/result는 0건이고 private manual만 실제 write/read한다.
- public importer/seed/runtime lookup은 구현하지 않으며 synthetic public fixture는 isolated test 전용이다.
- private manual은 owner-only이며 public 전환 surface가 없다.
- create의 name은 필수, brand는 선택·nullable이다. energy는 필수 `>= 0`이고 optional nutrient는 정확히 `sugars_g/saturated_fat_g/fiber_g`이며 다른 nutrient의 null/missing은 0이 아니다.
- basis amount는 양수이고 unit은 `serving/package/g/ml`만 허용한다.
- manual `basis_relations`는 입력받지 않고 저장값은 `[]`다.
- 첫 version/current pointer와 nutrition version switch는 원자적이다.
- nutrition 수정은 새 immutable version, metadata 수정은 기존 version 유지다.
- 동시 version 경합은 `409 NUTRITION_VERSION_CONFLICT`다.
- soft-delete는 멱등하고 old version/pin을 보존하며 신규 entry는 차단한다.
- public mutation, cross-owner read/modify, secret/raw provider 노출은 금지한다.
- production/staging write는 별도 승인 전 0이다.
- planner entry와 UI를 이 슬라이스에 섞지 않는다.

## Primary User Path

1. 로그인 사용자가 catalog를 검색하면 현재 승인 public artifact가 0건이므로 자신의 active private 제품만 cursor page로 받는다. 향후 승인 public row가 존재할 때에도 active public + self-private 경계는 그대로다.
2. 사용자가 manual 제품을 등록하면 private/manual product, profile/value, first immutable version, current pointer가 한 transaction으로 만들어진다.
3. metadata만 바꾸면 current nutrition version은 그대로다.
4. nutrition 라벨을 바꾸면 새 immutable version이 생성되고 성공한 transaction만 current pointer를 전환한다.
5. 삭제하면 product는 soft-delete되고 재삭제도 같은 성공 결과를 반환한다. 과거 version과 planner pin은 보존되고 검색·신규 entry 대상에서는 제외된다.

## Delivery Checklist

> Stage 2/3 living closeout이다. Stage 1 작성 작업은 체크하지 않으며 독립 Stage 1.5 승인 후 구현 evidence가 생길 때만 갱신한다. frontend/authority 항목은 N/A다.

- [x] 네 food-products endpoint의 공식 request/response/error 계약 고정 <!-- omo:id=delivery-product-api-contract;stage=2;scope=backend;review=3 -->
- [x] public stable-key approved subset과 name-brand no-merge 고정 <!-- omo:id=delivery-public-admission;stage=2;scope=backend;review=3 -->
- [x] private manual owner-only create/read/update/delete 고정 <!-- omo:id=delivery-private-owner-scope;stage=2;scope=backend;review=3 -->
- [x] basis·energy·nullable nutrient·missing-not-zero validation 구현 <!-- omo:id=delivery-manual-nutrition-validation;stage=2;scope=backend;review=3 -->
- [x] first version/profile/value/current pointer atomic create 구현 <!-- omo:id=delivery-product-atomic-create;stage=2;scope=backend;review=3 -->
- [x] nutrition 새 immutable version과 metadata-only version preservation 구현 <!-- omo:id=delivery-version-update-semantics;stage=2;scope=backend;review=3 -->
- [x] concurrent current switch conflict와 rollback 구현 <!-- omo:id=delivery-version-concurrency;stage=2;scope=backend;review=3 -->
- [x] idempotent soft-delete와 history/pin retention·new-entry block prerequisite 구현 <!-- omo:id=delivery-product-soft-delete;stage=2;scope=backend;review=3 -->
- [x] public mutation·cross-owner·direct table mutation RLS/permission guard 구현 <!-- omo:id=delivery-product-security;stage=2;scope=backend;review=3 -->
- [x] safe public attribution과 secret/raw provider leak 0 검증 <!-- omo:id=delivery-product-provenance;stage=2;scope=backend;review=3 -->
- [x] cursor scope/pagination과 bounded read query 검증 <!-- omo:id=delivery-product-read-performance;stage=2;scope=backend;review=3 -->
- [x] isolated PostgreSQL constraint/RLS/concurrency/idempotency/rollback gate 통과 <!-- omo:id=delivery-product-real-db;stage=2;scope=backend;review=3 -->
- [x] production/staging write 0과 cleanup evidence 기록 <!-- omo:id=delivery-product-zero-write;stage=2;scope=backend;review=3 -->
- [ ] Stage 3 독립 Codex review finding 0 또는 수용·반박 기록 <!-- omo:id=delivery-product-stage3-review;stage=2;scope=backend;review=3 -->
- [x] planner-entry/UI 비포함과 design authority N/A closeout 동기화 <!-- omo:id=delivery-product-scope-closeout;stage=2;scope=shared;review=3 -->

### Stage 2 implementation evidence — 2026-07-16

- TDD RED: service/DB 계약 14건이 service module과 migration 부재로 실패했고, API 계약 7건이 collection/item Route Handler 부재로 실패했다.
- GREEN: `tests/prepared-food-catalog-{api,service,rls}.test.ts` 27건과 격리 PostgreSQL 17 integration 11건이 통과했다. Stage 3 repair는 JWT role claim 위조 차단, microsecond cursor 보존, public source/profile basis exact admission, numeric 범위 422 경계를 추가로 고정했다.
- repository regression: `pnpm verify:backend`에서 lint 0 error(기존 unrelated warning 4), typecheck, product test 1,518 pass/22 skip, Next.js production build, security Playwright 12건이 통과했다. SOT/workpack/automation/workflow-v2/bookkeeping/branch/diff 검증도 통과했다.
- real DB는 별도 임시 cluster/database에 predecessor ingredient migration, recipe snapshot migration, catalog migration만 적용했다. first create와 nutrition PATCH injected failure 전체 rollback, 실제 두 connection single-winner/loser 409, RLS/직접 권한 거부, append-only, idempotent delete, stable-key public fixture와 stale-source fail-closed를 확인한 뒤 cluster directory를 삭제했다.
- 승인된 public promotion artifact와 운영 public row는 계속 0건이다. synthetic public row는 위 임시 DB 테스트 안에서만 사용했고 importer/operator CLI/public seed를 만들지 않았다. production/staging write는 0건이다.
- full repository migration stack 및 Supabase/PostgREST 동등성은 이 plain PostgreSQL bootstrap subset으로 증명하지 않았으며 Stage 3 Manual Only 위험으로 남긴다.
- 독립 Stage 3 첫 review에서 확정된 5건은 fresh repair 역할이 TDD로 수리했으며, exact repaired head 재검토 전이므로 Stage 3 checklist는 미완료로 유지한다.
