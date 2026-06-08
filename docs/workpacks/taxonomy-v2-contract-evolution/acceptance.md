# Acceptance Checklist

> 이 slice는 v2 taxonomy contract-evolution 선행 workpack이다.
> README의 `Contract Evolution Candidates`는 공식 문서 갱신 전에는 구현 acceptance가 아니라 승인된 변경 후보로만 다룬다.
> acceptance는 living closeout 문서다. 체크는 공식 문서 갱신, migration/test evidence, 실제 화면 검증처럼 증거가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.

## Happy Path

- [x] 공식 문서 5종과 `CURRENT_SOURCE_OF_TRUTH`가 재료 8대분류/21소분류를 같은 이름과 개수로 설명한다 <!-- omo:id=accept-official-doc-ingredient-count;stage=2;scope=shared;review=3,6 -->
- [x] 공식 문서 5종과 `CURRENT_SOURCE_OF_TRUTH`가 조리법 6그룹/20대표 method를 같은 이름과 개수로 설명한다 <!-- omo:id=accept-official-doc-cooking-count;stage=2;scope=shared;review=3,6 -->
- [x] v1 category label 8종(`채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`)이 migration 동안 계속 API/filter/validation에서 동작한다 <!-- omo:id=accept-v1-label-compat;stage=2;scope=backend;review=3,6 -->
- [x] `GET /ingredients` 응답 확장은 additive-only이며 `{ success, data, error }` envelope를 유지한다 <!-- omo:id=accept-ingredients-additive-api;stage=2;scope=backend;review=3,6 -->
- [x] `GET /cooking-methods` 응답 확장은 additive-only이며 기존 `{ id, code, label, color_key, is_system }` 소비자를 깨지 않는다 <!-- omo:id=accept-cooking-additive-api;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 taxonomy source와 프론트 선택지/표시 타입이 같은 source에서 파생된다 <!-- omo:id=accept-backend-frontend-taxonomy-source;stage=4;scope=shared;review=6 -->

## Ingredient Taxonomy

- [x] 재료 taxonomy group은 8개다: `곡류/면/떡`, `채소/버섯`, `과일/견과`, `단백질`, `해산물`, `유제품/대체유`, `양념/조미`, `가공/기타` <!-- omo:id=accept-ingredient-groups-8;stage=2;scope=shared;review=3,6 -->
- [x] 재료 taxonomy subcategory는 21개다 <!-- omo:id=accept-ingredient-subcategories-21;stage=2;scope=shared;review=3,6 -->
- [x] `딸기`, `사과`, `바나나`, `레몬` 같은 명확한 과일 row는 `과일/견과 > 과일`로 매핑된다 <!-- omo:id=accept-fruit-row-mapping;stage=2;scope=backend;review=3,6 -->
- [x] 애매한 row는 자동 재분류하지 않고 review 후보 또는 fallback category로 남긴다 <!-- omo:id=accept-ambiguous-ingredient-review;stage=2;scope=backend;review=3,6 -->
- [x] existing `ingredients.category` v1 label 값은 migration 동안 제거되지 않는다 <!-- omo:id=accept-ingredients-category-retained;stage=2;scope=backend;review=3,6 -->

## Cooking Method Taxonomy

- [x] 조리법 group은 6개다: `준비/손질`, `전처리`, `물/수분 조리`, `팬/기름 조리`, `혼합/조림`, `기기 조리` <!-- omo:id=accept-cooking-groups-6;stage=2;scope=shared;review=3,6 -->
- [x] 대표 method는 20개다 <!-- omo:id=accept-cooking-methods-20;stage=2;scope=shared;review=3,6 -->
- [x] `씻기`는 canonical method seed/source에 포함되지 않는다 <!-- omo:id=accept-washing-excluded;stage=2;scope=shared;review=3,6 -->
- [x] `에어프라이어`는 canonical method seed/source에 포함된다 <!-- omo:id=accept-airfryer-included;stage=2;scope=shared;review=3,6 -->
- [x] `채썰기`, `재우기`, `핏물빼기`, `중탕`, `압력솥` 같은 표현은 synonym 또는 자유 step text 후보로만 처리된다 <!-- omo:id=accept-low-frequency-method-synonyms;stage=2;scope=shared;review=3,6 -->
- [x] `cooking_methods.label`은 taxonomy code 저장소로 과적재하지 않는다 <!-- omo:id=accept-cooking-label-non-overload;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] `meals.status` 전이는 변경되지 않는다 <!-- omo:id=accept-no-meal-status-change;stage=2;scope=shared;review=3,6 -->
- [x] 장보기 완료 후 read-only 정책은 변경되지 않는다 <!-- omo:id=accept-shopping-read-only-unchanged;stage=2;scope=shared;review=3,6 -->
- [x] taxonomy seed/migration은 재실행해도 중복 row나 잘못된 덮어쓰기를 만들지 않는다 <!-- omo:id=accept-taxonomy-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] 외부 재료 데이터는 staging/review/approved seed gate 없이 production에 들어가지 않는다 <!-- omo:id=accept-external-ingest-gate-preserved;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] 알 수 없는 v2 category code는 validation error 또는 빈 결과로 안전하게 처리된다 <!-- omo:id=accept-unknown-category-code;stage=2;scope=backend;review=3,6 -->
- [ ] inactive category/method 입력은 422 validation error로 처리된다 <!-- omo:id=accept-inactive-taxonomy-validation;stage=2;scope=backend;review=3,6 -->
- [ ] synonym이 여러 method에 매칭되면 자동 승격하지 않고 review 후보로 남긴다 <!-- omo:id=accept-ambiguous-synonym-review;stage=2;scope=backend;review=3,6 -->
- [ ] loading 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-loading-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-empty-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-error-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 기존 화면에서 유지된다 <!-- omo:id=accept-unauthorized-preserved;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] v2 ingredient taxonomy fixture 또는 seed source가 8대분류/21소분류와 일치한다 <!-- omo:id=accept-ingredient-fixture-source;stage=2;scope=shared;review=3,6 -->
- [x] v2 cooking taxonomy fixture 또는 seed source가 6그룹/20대표 method와 일치한다 <!-- omo:id=accept-cooking-fixture-source;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에서 `ingredients`, `ingredient_synonyms`, `cooking_methods`가 존재한다 <!-- omo:id=accept-real-db-base-tables;stage=2;scope=backend;review=3,6 -->
- [ ] 신규 taxonomy table/column migration을 선택하면 RLS/service boundary와 rollback safety가 문서화된다 <!-- omo:id=accept-taxonomy-migration-boundary;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: 후속 Stage 4 구현자 또는 Stage 6 reviewer
- environment: 로컬 개발 환경 또는 합의된 smoke 환경
- scenarios:
  1. HOME/PANTRY에서 v1 label과 v2 group/category가 섞인 재료가 같은 필터 기준으로 표시되는지 확인
  2. 직접등록에서 재료 category 선택과 조리법 선택이 v2 source 순서와 일치하는지 확인
  3. YT_IMPORT에서 미등록 재료 등록과 step method 검수가 v2 source/fallback을 사용하는지 확인
  4. RECIPE_DETAIL/COOK_MODE에서 기존 레시피의 v1 label/method가 깨지지 않고 표시되는지 확인
  5. `씻기`가 대표 method 선택지로 노출되지 않고, `에어프라이어`가 노출되는지 확인

## Automation Split

### Vitest

- [x] ingredient taxonomy source가 8대분류/21소분류를 정확히 제공하는지 테스트 <!-- omo:id=accept-vitest-ingredient-taxonomy-count;stage=2;scope=shared;review=3,6 -->
- [x] cooking taxonomy source가 6그룹/20대표 method를 정확히 제공하는지 테스트 <!-- omo:id=accept-vitest-cooking-taxonomy-count;stage=2;scope=shared;review=3,6 -->
- [x] v1 label 8종 category query/validation regression test <!-- omo:id=accept-vitest-v1-label-regression;stage=2;scope=backend;review=3,6 -->
- [x] fruit-like ingredient row reclassification test <!-- omo:id=accept-vitest-fruit-reclassification;stage=2;scope=backend;review=3,6 -->
- [x] `씻기` excluded / `에어프라이어` included regression test <!-- omo:id=accept-vitest-cooking-specifics;stage=2;scope=shared;review=3,6 -->
- [x] API additive-only response shape regression test <!-- omo:id=accept-vitest-additive-api-shape;stage=2;scope=backend;review=3,6 -->
- [ ] frontend consumer가 hardcoded taxonomy list 대신 shared source를 쓰는 component test <!-- omo:id=accept-vitest-frontend-shared-source;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] HOME/PANTRY category filter flow가 v1/v2 mixed data에서 깨지지 않는다 <!-- omo:id=accept-playwright-category-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] 직접등록 category/method 선택 flow가 v2 source를 표시한다 <!-- omo:id=accept-playwright-manual-taxonomy;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT review flow에서 category/method fallback이 동작한다 <!-- omo:id=accept-playwright-youtube-taxonomy;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL/COOK_MODE 기존 recipe rendering이 taxonomy migration 후에도 깨지지 않는다 <!-- omo:id=accept-playwright-detail-cook-rendering;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 운영 DB 전체 재료 재분류 승인 범위 최종 확인
- [ ] category selector 정보 구조가 바뀔 경우 실제 기기 또는 screenshot authority review
