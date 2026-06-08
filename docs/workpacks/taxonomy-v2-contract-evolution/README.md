# Slice: taxonomy-v2-contract-evolution

## Goal

재료와 조리법 분류를 v1 문자열 계약에서 바로 갈아엎지 않고, v2 taxonomy 계약으로 단계적으로 옮길 수 있게 공식 문서 갱신 범위와 구현 순서를 잠근다. 재료는 8대분류/21소분류, 조리법은 6그룹/20대표 method를 목표로 하되, 현재 API와 UI가 쓰는 v1 category label 8종은 migration 동안 유지한다. 이 slice는 새 taxonomy를 실제 DB/API/화면에 적용하기 전 contract-evolution 경계와 회귀 테스트 기준을 고정하는 선행 작업이다.

## Branches

- 문서: `docs/taxonomy-v2-official-contract`
- 백엔드/DB: `feature/be-taxonomy-v2-contract-evolution`
- 프론트엔드: `feature/fe-taxonomy-v2-contract-evolution`

## In Scope

- 화면: HOME, PANTRY, MANUAL_RECIPE_CREATE, YT_IMPORT, RECIPE_DETAIL, COOK_MODE, shopping/leftover 화면의 재료·조리법 표시 소비 경로
- API: `GET /ingredients`, `GET /pantry`, `GET /cooking-methods`, `POST /recipes`, `POST /recipes/youtube/ingredient-registration`, `POST /recipes/youtube/register`
- 상태 전이: 없음. `meals.status`와 장보기/read-only 정책은 변경하지 않는다.
- DB 영향:
  - 계획 대상: `ingredients`, `ingredient_synonyms`, `cooking_methods`
  - 신규 후보: `ingredient_category_groups`, `ingredient_categories`, `cooking_method_categories`, `cooking_method_synonyms`
  - 전환 후보: `ingredients.category_code` 또는 `ingredients.subcategory_code`, `cooking_methods.category_code`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 후속 Stage 2에서 additive migration 필요

## Taxonomy Outcome

계획대로 진행하면 사용자-facing 재료 대분류는 8개, 내부 소분류는 21개가 된다.

### Ingredient Groups / Categories

| 대분류 | 소분류 |
| --- | --- |
| 곡류/면/떡 | 밥/쌀, 면/파스타, 빵/떡/시리얼 |
| 채소/버섯 | 잎/나물채소, 뿌리/줄기채소, 열매채소/버섯 |
| 과일/견과 | 과일, 견과/씨앗/건과일 |
| 단백질 | 돼지/소/양, 닭/오리, 달걀, 두부/콩류 |
| 해산물 | 생선/갑각/조개, 해조/건어물/어묵 |
| 유제품/대체유 | 우유/요거트/크림, 치즈/버터/대체유 |
| 양념/조미 | 장류/소스, 향신료/허브, 기름/식초/당류/육수 |
| 가공/기타 | 김치/절임/통조림, 냉동/간편식/음료/기타 |

현재 v1 canonical category label은 `채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타` 8종이다. 이 label들은 migration 동안 `ingredients.category`, `GET /ingredients?category=`, pantry filter, YouTube/manual ingredient registration validation에서 계속 호환되어야 한다.

### Cooking Method Groups

계획대로 진행하면 조리법은 6그룹, 20대표 method가 된다.

| 그룹 | 대표 method |
| --- | --- |
| 준비/손질 | 썰기, 다지기 |
| 전처리 | 해동, 밑간, 절이기 |
| 물/수분 조리 | 끓이기, 삶기, 데치기, 찌기 |
| 팬/기름 조리 | 볶기, 굽기, 부치기, 튀기기 |
| 혼합/조림 | 섞기, 무치기, 조리기, 졸이기 |
| 기기 조리 | 전자레인지, 오븐굽기, 에어프라이어 |

`씻기`, `채썰기`, `재우기`, `핏물빼기`, `지지기`, `중탕`, `압력솥`, `간보기`, `토핑`, `담기`, `식히기`, `숙성`은 canonical method가 아니라 synonym 또는 자유 step text 후보로 둔다. 특히 `씻기`는 사용자가 명시적으로 제외한 값이므로 대표 method에 다시 넣지 않는다.

## Out of Scope

- v1 category label 8종 제거
- `ingredients.category` 즉시 삭제 또는 FK 전면 전환
- `GET /ingredients?category=` label query 제거
- `GET /cooking-methods` v1 응답 shape breaking change
- 조리법 20대표 method 밖의 낮은 빈도 표현을 canonical method로 자동 승격
- 외부 재료 데이터를 review 없이 production `ingredients`에 직적재
- 관리자 taxonomy 관리 UI
- 대량 자동 재분류를 사용자 승인 없이 운영 DB에 실행
- 장보기, 플래너, 요리 완료 상태 전이 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `pre-27-taxonomy-consumer-alignment` | merged | [x] |
| `28-external-ingredient-data-ingest-gate` | merged | [x] |
| `27-youtube-import-quality-uplift` | merged | [x] |

> 현재 v1 category shared source와 external ingest gate가 이미 merged 상태다. 따라서 v2 taxonomy는 v1 소비자 정렬 위에 additive contract-evolution으로 진행할 수 있다.

## Backend First Contract

### Official Docs To Update

이 slice가 Stage 2 구현으로 넘어가기 전, 아래 공식 문서와 `CURRENT_SOURCE_OF_TRUTH`를 같은 PR에서 갱신한다. 2026-06-09 기준 공식 문서 갱신은 완료됐고, 후속 구현은 additive DB/API migration과 shared taxonomy source부터 진행한다.

| 문서 | 필요한 변경 |
| --- | --- |
| `docs/요구사항기준선-v1.7.6.md` | v2 재료 8대분류/21소분류, 조리법 6그룹/20대표 method, v1 label 호환 원칙 |
| `docs/화면정의서-v1.5.13.md` | HOME/PANTRY/직접등록/YT_IMPORT/상세/요리모드의 v2 표시와 v1 label fallback |
| `docs/유저flow맵-v1.3.13.md` | 재료 등록·검색·필터·조리법 선택 흐름의 v2 mapping과 migration fallback |
| `docs/db설계-v1.3.12.md` | additive taxonomy table/column 후보, 기존 string field 유지, 재분류 migration 규칙 |
| `docs/api문서-v1.2.16.md` | additive response/query 후보, 기존 label query/validation 호환, error envelope 유지 |
| `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | 위 공식 문서 버전 경로와 변경 이력 동기화 |

### DB Contract

- `ingredient_category_groups`
  - stable `code`, 사용자 표시 `label`, `display_order`, `is_active`
- `ingredient_categories`
  - stable `code`, `group_code`, 사용자 표시 `label`, legacy `category` mapping, `display_order`, `is_active`
- `ingredients`
  - migration 동안 `category` 문자열 유지
  - 새 컬럼은 `category_code`로 결정하고 `ingredient_categories.code`를 참조한다
  - v1 label과 역매핑 가능해야 한다
- `cooking_method_categories`
  - stable `code`, 사용자 표시 `label`, `display_order`, `is_active`
- `cooking_methods`
  - 기존 `code`, `label`, `color_key`, `is_system` 유지
  - `category_code`는 additive column으로만 검토
- `cooking_method_synonyms`
  - `method_code`, `synonym`, `match_kind`, `is_active`
  - `씻기` 같은 excluded canonical candidate는 여기 또는 자유 step text 경로에서만 다룬다

### API Contract

- 모든 응답은 `{ success, data, error }` envelope를 유지한다.
- error 객체는 `{ code, message, fields[] }` 구조를 유지한다.
- `GET /ingredients?category=<v1 label>`은 migration 동안 계속 동작한다.
- `GET /ingredients`의 v2 필드 추가는 additive-only다. 후보: `category_group_code`, `category_code`, `category_label`.
- `GET /cooking-methods`의 기존 필드 `{ id, code, label, color_key, is_system }`는 유지한다.
- cooking v2 필드 추가는 additive-only다. 후보: `category_code`, `category_label`, `synonyms`.
- YouTube/manual ingredient registration validation은 v2 code를 받아도 v1 label fallback과 충돌하지 않아야 한다.

### Migration / Data Reclassification Rules

- 기존 DB 재료 중 새 카테고리에 명확히 해당하는 row는 v2 code로 재분류한다.
- 예: `딸기`, `생딸기`, `사과`, `바나나`, `레몬`, `라임`, `오렌지`, `귤`, `배`, `키위`, `복숭아`, `포도`, `블루베리`, `망고`는 `과일/견과 > 과일`에 매핑한다.
- 애매한 row는 자동 재분류하지 않고 `기타` 또는 review 후보로 남긴다.
- v1 label과 v2 code가 동시에 존재하는 기간에는 v2 code가 내부 정렬/검색/자동매칭 기준이고, v1 label은 public 호환과 fallback 기준이다.
- migration은 idempotent해야 하며 기존 사용자 생성 재료를 잘못 덮어쓰지 않아야 한다.

### Error Cases

| 상황 | 기대 처리 |
| --- | --- |
| 알 수 없는 v2 category code | 422 validation error 또는 해당 query 빈 결과 |
| v1 label과 v2 code가 충돌 | v2 code 우선, conflict reason을 로그/report에 기록 |
| inactive category 입력 | 422 validation error |
| synonym이 여러 method에 매칭 | review 필요, 자동 승격 금지 |
| migration 재실행 | 이미 매핑된 row는 skip 또는 동일 값 유지 |

## Frontend Delivery Mode

- 디자인 확정 전: 기존 화면 구조 유지, 선택지/태그/필터 label과 fallback만 v2 source에서 파생
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- UI 위험도: `low-risk`에서 시작하되, category selector 정보 구조가 바뀌면 `anchor-extension`으로 승격
- v1 label이 아직 들어온 데이터는 화면에서 깨지지 않고 v2 group/category로 표시돼야 한다.

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`
- Visual artifact: N/A for Stage 1 contract lock. Stage 4에서 category selector 정보 구조가 바뀌면 screenshot evidence 필요.
- Authority status: `not-required`
- Notes: 이번 workpack은 taxonomy 계약 잠금이다. 새 화면이나 레이아웃 재설계는 없지만, 후속 FE 구현에서 selector/grouping UI가 바뀌면 authority review로 승격한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — Stage 1 contract lock, 신규 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/pre-27-taxonomy-consumer-alignment/README.md`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/README.md`
- `.omx/plans/ingredient-cooking-taxonomy-ralplan-final-20260525.md`
- `.omx/plans/ingredient-cooking-taxonomy-expansion-20260525.md`
- `docs/요구사항기준선-v1.7.6.md`
- `docs/화면정의서-v1.5.13.md`
- `docs/유저flow맵-v1.3.13.md`
- `docs/db설계-v1.3.12.md`
- `docs/api문서-v1.2.16.md`

## QA / Test Data Plan

- fixture baseline
  - 현재 v1 label 8종이 API/filter/registration에서 계속 통과하는 테스트
  - v2 8대분류/21소분류 seed fixture 정합성 테스트
  - cooking 6그룹/20대표 method seed fixture 정합성 테스트
  - excluded method(`씻기`)가 canonical method가 아니라 synonym/text 후보로만 남는 테스트
- real DB smoke
  - `ingredients`, `ingredient_synonyms`, `cooking_methods` 존재 확인
  - v2 taxonomy seed/migration dry-run 후 fruit-like row의 `과일/견과 > 과일` 매핑 확인
  - migration 재실행 idempotency 확인
- seed/reset
  - 후속 Stage 2에서 additive migration과 deterministic seed를 추가한 뒤 `pnpm dev:local-supabase` 또는 합의된 smoke로 확인
- blocker 조건
  - 공식 문서 5종이 v2 taxonomy count와 v1 compatibility를 다르게 설명
  - v1 label query/validation이 깨짐
  - `씻기`가 canonical method seed에 포함됨
  - external ingest gate 없이 production direct-load 경로가 생김

## Key Rules

1. v2 taxonomy는 v1 label 계약의 replacement가 아니라 additive migration이다.
2. 재료 최종 목표는 8대분류/21소분류다.
3. 조리법 최종 목표는 6그룹/20대표 method다.
4. `씻기`는 canonical cooking method가 아니다.
5. `에어프라이어`는 canonical cooking method다.
6. public API breaking change 없이 additive field로 시작한다.
7. 운영 DB 재분류는 idempotent migration과 review 가능한 mapping 근거가 있어야 한다.
8. 외부 데이터는 `28-external-ingredient-data-ingest-gate`의 staging/review/approved seed 경로만 따른다.
9. `cooking_methods.label`은 사용자 표시 라벨이며 taxonomy code 저장소로 과적재하지 않는다.
10. 상태 전이, read-only, 권한 정책은 변경하지 않는다.

## Contract Evolution Candidates

| # | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| CE-1 | `ingredients.category` v1 label string | v1 label 유지 + v2 `category_code` additive | 필터/자동매칭 정확도 개선, label 변경 내성 | 요구사항, DB, API, Flow, 화면 | 공식 문서 반영 완료, 구현 필요 |
| CE-2 | `GET /ingredients` v1 label 중심 | `category_group_code`, `category_code`, `category_label` additive | HOME/PANTRY/YT_IMPORT에서 같은 분류 source 소비 | API, 화면, Flow | 사용자 방향 승인, 세부 field명 확정 필요 |
| CE-3 | `cooking_methods`에 category 없음 | `cooking_method_categories` + `cooking_methods.category_code` additive | 조리법 선택/표시 일관성 개선 | DB, API, 화면 | 사용자 방향 승인, 구현 전 공식 문서 필요 |
| CE-4 | synonym은 재료 중심 | `cooking_method_synonyms` 추가 | YouTube/직접등록 step 표현 매칭률 개선 | DB, API, 요구사항 | 사용자 방향 승인, 운영 seed 기준 필요 |

## Primary User Path

1. 사용자가 직접등록 또는 YouTube 등록에서 재료와 조리법을 입력한다.
2. 서비스는 v1 label 입력과 v2 code 입력을 모두 안정적으로 해석하고, 재료는 8대분류/21소분류 중 하나로, 조리법은 6그룹/20대표 method 중 하나로 매핑한다.
3. HOME/PANTRY/RECIPE_DETAIL/COOK_MODE는 같은 taxonomy source를 사용해 필터, 태그, step badge를 일관되게 표시한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 공식 문서, DB/API 계약, seed/migration, backend 테스트를 닫고, Stage 4~6에서는 화면 소비 경로와 visual/UX fallout을 닫는다.

- [x] 공식 문서 5종과 `CURRENT_SOURCE_OF_TRUTH`에 v2 taxonomy count와 v1 compatibility를 동기화 <!-- omo:id=delivery-official-doc-sync;stage=2;scope=shared;review=3,6 -->
- [x] 재료 8대분류/21소분류 seed 또는 shared source를 정의 <!-- omo:id=delivery-ingredient-taxonomy-source;stage=2;scope=shared;review=3,6 -->
- [x] 조리법 6그룹/20대표 method seed 또는 shared source를 정의 <!-- omo:id=delivery-cooking-taxonomy-source;stage=2;scope=shared;review=3,6 -->
- [x] `씻기` excluded canonical, `에어프라이어` included canonical 규칙을 테스트로 고정 <!-- omo:id=delivery-cooking-specific-regression;stage=2;scope=shared;review=3,6 -->
- [x] v1 category label 8종 query/validation 호환을 테스트로 고정 <!-- omo:id=delivery-v1-label-compat-tests;stage=2;scope=backend;review=3,6 -->
- [x] additive DB migration이 idempotent하고 기존 `ingredients.category`를 유지 <!-- omo:id=delivery-idempotent-db-migration;stage=2;scope=backend;review=3,6 -->
- [x] 기존 과일류 row가 `과일/견과 > 과일`로 매핑되는 재분류 검증 <!-- omo:id=delivery-fruit-reclassification;stage=2;scope=backend;review=3,6 -->
- [x] `GET /ingredients`와 `GET /cooking-methods`의 additive-only 응답 계약 검증 <!-- omo:id=delivery-api-additive-contract;stage=2;scope=backend;review=3,6 -->
- [ ] HOME/PANTRY/직접등록/YT_IMPORT category selector가 같은 taxonomy source를 소비 <!-- omo:id=delivery-frontend-ingredient-consumers;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL/COOK_MODE/YT_IMPORT cooking method 표시가 같은 taxonomy source를 소비 <!-- omo:id=delivery-frontend-cooking-consumers;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태가 기존 화면에서 유지 <!-- omo:id=delivery-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] migration과 UI fallout에 대한 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
