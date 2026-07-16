# Acceptance Checklist: prepared-food-catalog

> 이 acceptance는 backend-only Stage 2/3 living closeout이다. 체크는 테스트와 isolated PostgreSQL evidence가 생긴 뒤에만 한다. Stage 1 author는 자기 문서를 승인하지 않으며 독립 Stage 1.5 gate가 먼저 필요하다. frontend·Playwright·design authority는 N/A다.

## Catalog Read / Happy Path

- [x] `GET /food-products`가 `{ success, data, error }` wrapper 안에 공식 `items`, `next_cursor`, `has_next` shape를 반환한다 <!-- omo:id=accept-product-list-envelope;stage=2;scope=backend;review=3 -->
- [x] 결과는 active public 제품과 현재 사용자 소유 active private 제품만 포함한다 <!-- omo:id=accept-product-list-scope;stage=2;scope=backend;review=3 -->
- [x] 삭제 제품과 다른 사용자의 private 제품은 검색 결과·cursor page 어디에도 나타나지 않는다 <!-- omo:id=accept-product-list-hidden;stage=2;scope=backend;review=3 -->
- [x] `q`, opaque cursor, 기본 20·최대 50 limit가 공식 계약대로 동작한다 <!-- omo:id=accept-product-pagination;stage=2;scope=backend;review=3 -->
- [x] item은 공식 product metadata, `editable`, current `nutrition_version_id`, version-pinned `basis_relations`, `nutrition`만 반환한다 <!-- omo:id=accept-product-list-shape;stage=2;scope=backend;review=3 -->
- [x] public item은 `editable=false`, self-owned private manual item은 `editable=true`다 <!-- omo:id=accept-product-editable;stage=2;scope=backend;review=3 -->

## Public Catalog Admission / Provenance

- [x] predecessor MFDS evidence가 page 1 / size 1 transport smoke뿐이고 승인된 public product promotion artifact가 0건임을 고정한다 <!-- omo:id=accept-public-artifact-zero;stage=2;scope=backend;review=3 -->
- [x] Stage 2는 public importer/operator CLI/runtime provider 조회/unapproved seed를 구현하지 않고 실제 public row·검색 결과를 fail-closed 0건으로 유지하며 private manual만 write/read한다 <!-- omo:id=accept-public-zero-fail-closed;stage=2;scope=backend;review=3 -->
- [x] synthetic public fixture는 isolated test에서만 사용하고 운영/public row 생성·promotion 근거로 사용하지 않는다 <!-- omo:id=accept-public-fixture-isolated-only;stage=2;scope=backend;review=3 -->
- [x] public catalog에는 승인 source, stable external product key, 유효 basis, 핵심 영양값이 온전한 검수 subset만 존재한다 <!-- omo:id=accept-public-approved-subset;stage=2;scope=backend;review=3 -->
- [x] `(source_type, external_product_key)` uniqueness가 같은 public product의 중복 등록을 막는다 <!-- omo:id=accept-public-stable-key-unique;stage=2;scope=backend;review=3 -->
- [x] 같은 이름+브랜드라도 stable key가 다르면 병합하지 않고 fuzzy/name-only merge를 사용하지 않는다 <!-- omo:id=accept-public-no-name-brand-merge;stage=2;scope=backend;review=3 -->
- [x] public product는 `visibility='public'`, `source_type='public_dataset'`, `owner_user_id IS NULL` 조합만 허용한다 <!-- omo:id=accept-public-row-shape;stage=2;scope=backend;review=3 -->
- [x] public `nutrition.sources`는 1건 이상이며 실제 기여한 승인 attribution의 공식 6개 field만 반환하고 각 `source_version`은 non-null이다 <!-- omo:id=accept-public-source-projection;stage=2;scope=backend;review=3 -->
- [x] public `basis_relations[]`는 응답 version에 직접 귀속된 승인 immutable relation만 포함하고 없으면 `[]`다 <!-- omo:id=accept-public-basis-relations;stage=2;scope=backend;review=3 -->
- [x] 다른 version relation, inferred relation, relation chaining, 범용 밀도, 임의 `g↔ml` relation을 섞지 않는다 <!-- omo:id=accept-public-no-inferred-relations;stage=2;scope=backend;review=3 -->

## Private Manual Create

- [x] `POST /food-products`는 로그인 사용자의 owner-only `private/manual` 제품만 `201`로 생성한다 <!-- omo:id=accept-manual-create-private;stage=2;scope=backend;review=3 -->
- [x] create의 `name`은 필수이고 `brand`는 선택·nullable이며 누락/잘못된 body는 `422 VALIDATION_ERROR`다 <!-- omo:id=accept-manual-name-brand-contract;stage=2;scope=backend;review=3 -->
- [x] client가 public visibility/source type/owner/public key/current version/provenance를 주입할 수 없다 <!-- omo:id=accept-manual-create-server-fields;stage=2;scope=backend;review=3 -->
- [x] `basis.amount > 0`이고 unit은 `serving/package/g/ml`만 허용한다 <!-- omo:id=accept-manual-basis-validation;stage=2;scope=backend;review=3 -->
- [x] `energy_kcal`은 필수 finite 숫자이며 `>= 0`이고 실제 0은 보존한다 <!-- omo:id=accept-manual-energy-required;stage=2;scope=backend;review=3 -->
- [x] 나머지 핵심 nutrient와 optional nutrient 정확히 `sugars_g`, `saturated_fat_g`, `fiber_g`는 생략 또는 null 가능하며 제공된 값은 finite `>= 0`이다 <!-- omo:id=accept-manual-nullable-nutrients;stage=2;scope=backend;review=3 -->
- [x] null/missing/blank/parse 실패 nutrient를 zero row 또는 complete 값으로 저장·응답하지 않는다 <!-- omo:id=accept-manual-missing-not-zero;stage=2;scope=backend;review=3 -->
- [x] 정의되지 않은 nutrient code는 기존 `422 UNSUPPORTED_NUTRIENT`다 <!-- omo:id=accept-manual-unsupported-nutrient;stage=2;scope=backend;review=3 -->
- [x] manual create는 `basis_relations` 입력을 받지 않고 version의 `basis_relations_json`을 `[]`로 저장한다 <!-- omo:id=accept-manual-no-basis-relations;stage=2;scope=backend;review=3 -->
- [x] manual attribution은 공식 `user_label` projection이며 provider raw label/payload를 저장하지 않는다 <!-- omo:id=accept-manual-user-label-source;stage=2;scope=backend;review=3 -->
- [x] product, nutrition profile/value, first immutable version, current pointer가 한 transaction으로 commit된다 <!-- omo:id=accept-manual-create-atomic;stage=2;scope=backend;review=3 -->
- [x] first version 생성 중 injected failure가 product/profile/value/version/pointer 전체를 rollback한다 <!-- omo:id=accept-manual-create-rollback;stage=2;scope=backend;review=3 -->

## Private Manual Update / Immutable Version

- [x] `PATCH /food-products/{product_id}`는 본인 private/manual 제품의 공식 `name`, `brand`, `nutrition` field만 수정한다 <!-- omo:id=accept-manual-patch-owner;stage=2;scope=backend;review=3 -->
- [x] metadata-only PATCH는 `current_nutrition_version_id`를 유지하고 새 profile/value/version을 만들지 않는다 <!-- omo:id=accept-metadata-preserves-version;stage=2;scope=backend;review=3 -->
- [x] nutrition PATCH는 create와 같은 전체 basis/value validation을 적용한다 <!-- omo:id=accept-nutrition-patch-validation;stage=2;scope=backend;review=3 -->
- [x] nutrition PATCH는 새 profile/value/immutable version을 만들고 기존 version/value/relation row를 UPDATE/DELETE하지 않는다 <!-- omo:id=accept-nutrition-patch-new-version;stage=2;scope=backend;review=3 -->
- [x] nutrition PATCH의 새 manual version도 `basis_relations_json=[]`다 <!-- omo:id=accept-nutrition-patch-empty-relations;stage=2;scope=backend;review=3 -->
- [x] 새 version insert와 product current pointer 전환은 한 transaction이다 <!-- omo:id=accept-nutrition-current-atomic;stage=2;scope=backend;review=3 -->
- [x] concurrent nutrition PATCH에서 한 writer만 성공하고 loser는 `409 NUTRITION_VERSION_CONFLICT`다 <!-- omo:id=accept-nutrition-version-conflict;stage=2;scope=backend;review=3 -->
- [x] conflict나 injected failure가 orphan version/profile/value 또는 잘못된 pointer를 남기지 않고 이전 current를 보존한다 <!-- omo:id=accept-nutrition-update-rollback;stage=2;scope=backend;review=3 -->
- [x] 이전 immutable version과 이를 pin한 기존 planner entry는 current 변경 뒤에도 보존된다 <!-- omo:id=accept-old-version-pin-retained;stage=2;scope=backend;review=3 -->

## Soft Delete / Idempotency

- [x] `DELETE /food-products/{product_id}`는 본인 private 제품의 `deleted_at`만 설정하고 `{ deleted: true }`를 반환한다 <!-- omo:id=accept-product-soft-delete;stage=2;scope=backend;review=3 -->
- [x] 이미 삭제된 본인 제품을 다시 삭제해도 같은 `200` 결과이고 추가 version/delete side effect가 없다 <!-- omo:id=accept-product-delete-idempotent;stage=2;scope=backend;review=3 -->
- [x] soft-delete 후 old nutrition versions와 기존 planner pins가 삭제·변경되지 않는다 <!-- omo:id=accept-product-delete-retains-history;stage=2;scope=backend;review=3 -->
- [x] 삭제 제품은 catalog read와 신규 entry 대상에서 제외되고 후속 entry endpoint prerequisite가 `409 PRODUCT_DELETED`를 보존한다 <!-- omo:id=accept-product-delete-blocks-new-entry;stage=2;scope=backend;review=3 -->
- [x] 이 슬라이스는 planner entry endpoint나 table behavior를 새로 구현하지 않는다 <!-- omo:id=accept-product-delete-no-planner-scope;stage=2;scope=shared;review=3 -->

## Permission / RLS / Security

- [x] 네 endpoint는 기존 login-required 401 경계를 유지한다 <!-- omo:id=accept-product-login-required;stage=2;scope=backend;review=3 -->
- [x] 접근 가능한 product가 없거나 scope-filtered로 숨겨진 경우 `404 RESOURCE_NOT_FOUND`를 유지한다 <!-- omo:id=accept-product-not-found-contract;stage=2;scope=backend;review=3 -->
- [x] 일반 사용자의 public PATCH/DELETE는 `403 FORBIDDEN`이고 public row/version은 불변이다 <!-- omo:id=accept-public-mutation-forbidden;stage=2;scope=backend;review=3 -->
- [x] 사용자 A는 사용자 B private 제품을 검색·조회할 수 없고 PATCH/DELETE할 수 없다 <!-- omo:id=accept-cross-owner-denied;stage=2;scope=backend;review=3 -->
- [x] cross-owner direct ID 접근은 공식 scope-filtered 404/403 존재 은닉 경계를 유지하고 다른 사용자 식별자를 새지 않는다 <!-- omo:id=accept-cross-owner-hidden;stage=2;scope=backend;review=3 -->
- [x] anon/authenticated direct table mutation으로 public, cross-owner, immutable version/profile/value row를 변경할 수 없다 <!-- omo:id=accept-product-direct-mutation-denied;stage=2;scope=backend;review=3 -->
- [x] route/service layer가 owner, public read-only, deleted 상태, product-version 관계, expected current version을 재검증한다 <!-- omo:id=accept-product-service-guards;stage=2;scope=backend;review=3 -->
- [x] API key, auth query, cookie, raw fetch URL/payload/row, manifest/internal path가 DB/API/log/report에 없다 <!-- omo:id=accept-product-secret-raw-zero;stage=2;scope=backend;review=3 -->
- [x] production/staging catalog load·promotion·backfill write는 별도 승인 전 0건이다 <!-- omo:id=accept-product-production-zero-write;stage=2;scope=backend;review=3 -->

## DB Constraints / Immutability

- [x] `food_products`가 public/public_dataset/null owner 또는 private/manual/non-null owner 조합만 허용한다 <!-- omo:id=accept-product-owner-visibility-check;stage=2;scope=backend;review=3 -->
- [x] commit된 product의 NOT NULL current version이 존재하고 같은 product에 속한다 <!-- omo:id=accept-product-current-version-integrity;stage=2;scope=backend;review=3 -->
- [x] `(product_id, version)`과 `(product_id, nutrition_profile_id)` uniqueness가 유지된다 <!-- omo:id=accept-product-version-uniqueness;stage=2;scope=backend;review=3 -->
- [x] version/profile/value와 `basis_relations_json`의 UPDATE/DELETE가 DB guard·privilege에서 거부된다 <!-- omo:id=accept-product-version-append-only;stage=2;scope=backend;review=3 -->
- [x] `basis_relations_json`은 JSON array이고 승인 public relation은 양수 amount와 허용 unit만 사용한다 <!-- omo:id=accept-product-relation-check;stage=2;scope=backend;review=3 -->
- [x] same-unit, zero/negative, duplicate pair relation은 저장되지 않으며 manual version은 항상 빈 배열이다 <!-- omo:id=accept-product-invalid-relations;stage=2;scope=backend;review=3 -->

## Performance / Operational Readiness

- [x] catalog scope filter, search, stable cursor ordering, limit가 DB query 단계에서 적용된다 <!-- omo:id=accept-product-query-scope;stage=2;scope=backend;review=3 -->
- [x] current version/profile/value/source/relation projection이 bounded batch/join이며 item별 N+1 query가 없다 <!-- omo:id=accept-product-no-n-plus-one;stage=2;scope=backend;review=3 -->
- [x] 두 실제 DB connection의 concurrency test가 single winner, loser 409, current pointer 일관성을 증명한다 <!-- omo:id=accept-product-real-concurrency;stage=2;scope=backend;review=3 -->
- [x] rollback test가 partial product/version/profile/value를 남기지 않고 이전 current를 보존한다 <!-- omo:id=accept-product-real-rollback;stage=2;scope=backend;review=3 -->
- [x] cleanup 뒤 ephemeral DB와 test user/product/version/profile/value row가 남지 않는다 <!-- omo:id=accept-product-real-cleanup;stage=2;scope=backend;review=3 -->

## Scope / Regression

- [x] 공식 네 endpoint 외 새 endpoint, HTTP status, error code, field를 추가하지 않는다 <!-- omo:id=accept-product-no-contract-expansion;stage=2;scope=shared;review=3 -->
- [x] `prepared-food-planner-entry`, planner read model, nutrition aggregate가 diff에 포함되지 않는다 <!-- omo:id=accept-product-planner-excluded;stage=2;scope=shared;review=3 -->
- [x] Stage 4 UI·frontend route/state·Playwright·screenshot·authority artifact가 diff에 포함되지 않는다 <!-- omo:id=accept-product-frontend-na;stage=2;scope=shared;review=3 -->
- [x] design authority는 `not_required`, Design Status는 `N/A`로 유지된다 <!-- omo:id=accept-product-design-na;stage=2;scope=shared;review=3 -->
- [x] 기존 recipe nutrition, Meal status, shopping/cooking/leftover/XP/activity 규칙을 변경하지 않는다 <!-- omo:id=accept-product-domain-regression;stage=2;scope=shared;review=3 -->

## Data Setup / Preconditions

- [x] SOT가 요구사항 v1.7.20, 화면 v1.5.26, 유저 flow v1.3.23, DB v1.3.21, API v1.2.25로 일치한다 <!-- omo:id=accept-product-official-docs;stage=2;scope=shared;review=3 -->
- [x] `ingredient-nutrition-conversion-model` predecessor가 merged이고 shared nutrition schema를 사용할 수 있다 <!-- omo:id=accept-product-predecessor;stage=2;scope=backend;review=3 -->
- [x] isolated-test-only synthetic public distinct-stable-key pair, A/B private owner pair, deleted product, sparse nutrient, conflict writer fixture가 준비된다 <!-- omo:id=accept-product-fixtures;stage=2;scope=backend;review=3 -->
- [ ] 사용자 기존 DB/container/volume과 분리된 isolated PostgreSQL에 전체 migration과 fixture가 적용된다 <!-- omo:id=accept-product-isolated-postgres;stage=2;scope=backend;review=3 -->

## Automation Split

### Vitest / Service Integration

- [x] list scope/cursor/projection과 public stable-key no-merge를 테스트한다 <!-- omo:id=accept-product-vitest-read;stage=2;scope=backend;review=3 -->
- [x] manual name/nullable brand/basis/energy/exact optional nutrient/null-missing/404·422·unsupported nutrient validation을 테스트한다 <!-- omo:id=accept-product-vitest-validation;stage=2;scope=backend;review=3 -->
- [x] atomic create, metadata-only update, immutable nutrition update, rollback을 테스트한다 <!-- omo:id=accept-product-vitest-versioning;stage=2;scope=backend;review=3 -->
- [x] public/cross-owner denial, idempotent delete, deleted search/new-entry block prerequisite를 테스트한다 <!-- omo:id=accept-product-vitest-policy;stage=2;scope=backend;review=3 -->

### PostgreSQL Integration

- [x] real DB constraint·deferred FK·append-only·RLS/privilege를 검증한다 <!-- omo:id=accept-product-pg-constraints-rls;stage=2;scope=backend;review=3 -->
- [x] real two-session nutrition update conflict와 injected transaction rollback을 검증한다 <!-- omo:id=accept-product-pg-concurrency-rollback;stage=2;scope=backend;review=3 -->
- [x] real DB idempotent soft-delete, old history retention, A→B read/modify denial을 검증한다 <!-- omo:id=accept-product-pg-delete-owner;stage=2;scope=backend;review=3 -->

### Manual Only

- [x] 독립 Stage 1.5 Codex reviewer가 README/acceptance/automation/work-item/status 계약을 승인한다
- [ ] 독립 Stage 3 Codex reviewer가 exact current head의 contract, RLS, concurrency, rollback evidence를 승인한다
- [ ] full Supabase/PostgREST 환경과 plain isolated PostgreSQL의 차이를 별도로 확인한다
- [ ] 현재 approved public promotion artifact 0건을 유지하고, 향후 운영 public catalog load 전 source별 license·stable key·basis·핵심 영양 검수와 promotion 승인을 별도로 수행한다
