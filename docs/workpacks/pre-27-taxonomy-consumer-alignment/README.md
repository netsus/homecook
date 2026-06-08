# Slice: pre-27-taxonomy-consumer-alignment

## Goal

slice 27 YouTube 기능 개선 전에, 현재 MVP의 모든 ingredient category / cooking method 소비자를 같은 기준 source에 정렬한다. ingredient 쪽은 당시 legacy 7종 카테고리를 단일 shared mapping source로 수렴시키고, cooking 쪽은 분산된 색상/fallback helper를 하나로 통합한다. 2026-06-08 follow-up에서 active ingredient category set은 `과일` 포함 8종으로 확장됐으며, 신규 DB registry table 없이 같은 shared mapping source를 계속 사용한다.

## Branches

- 백엔드/공용: `feature/be-pre-27-taxonomy-consumer-alignment`
- 프론트엔드: `feature/fe-pre-27-taxonomy-consumer-alignment`

## In Scope

- 화면: HOME (ingredient filter), PANTRY (add/filter/display), MANUAL_RECIPE_CREATE (ingredient/method picker), YT_IMPORT (ingredient registration/review), RECIPE_DETAIL (ingredient/step rendering), COOK_MODE (mobile/desktop)
- API: `GET /ingredients` (category query), `GET /cooking-methods`, `POST /recipes/youtube/ingredient-registration` (category validation), `GET /pantry` (category filter)
- 상태 전이: 없음 (기존 상태 전이 변경 없음)
- DB 영향: `ingredients` (category 읽기 및 2026-06-08 follow-up 과일 재분류), `cooking_methods` (color_key 읽기), `ingredient_synonyms` (읽기), `register_youtube_ingredient` RPC (8종 category validation)
- Schema Change:
  - [x] 신규 테이블/컬럼 없음
  - [ ] 있음

### Track A: Ingredient Category Normalization

- `lib/ingredient-categories.ts`를 canonical shared mapping source로 확장
  - `code`, `label` (=legacy label), `display_order`, `is_active` 속성 포함
  - 현재 v1 canonical 8 카테고리: `채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`
- `types/recipe.ts`의 `IngredientCategory` union이 shared source에서 파생하도록 전환
- `lib/server/youtube-import.ts`의 hardcoded `INGREDIENT_CATEGORIES` 검증을 shared source 참조로 교체
- `app/api/v1/ingredients/route.ts`의 category query를 shared source 기준으로 정렬
- `app/api/v1/pantry/route.ts`의 category filter를 shared source 기준으로 정렬
- `components/pantry/pantry-mobile-visuals.ts`의 Wave1-only display group (`주식`, `단백질`)과 canonical `과일` category가 충돌하지 않도록 명시적 mapping/fallback 처리
- `components/home/ingredient-filter-modal.tsx`의 `INGREDIENT_CATEGORY_OPTIONS` 소비를 shared source 기준으로 전환
- `components/recipe/recipe-ingredient-add-modal.tsx`의 hardcoded category emoji map을 shared source 또는 공용 helper로 전환
- `components/pantry/pantry-screen.tsx`의 desktop `CATEGORY_VISUAL` map을 공용 helper로 전환
- `components/pantry/pantry-add-sheet.tsx`의 category 소비를 shared source 기준으로 정렬
- `components/recipe/youtube-import-screen.tsx`의 `INGREDIENT_CATEGORY_CHOICES`를 shared source에서 파생

### Category Outcome

계획대로 진행한 현재 v1 canonical category label은 아래 8종이다. DB/API/프론트 선택지는 label을 계속 사용하고, `code`는 shared source 내부의 안정 식별자로만 쓴다.

| code | label |
| --- | --- |
| `vegetable` | `채소` |
| `fruit` | `과일` |
| `meat` | `육류` |
| `seafood` | `해산물` |
| `seasoning` | `양념` |
| `dairy` | `유제품` |
| `grain` | `곡류` |
| `other` | `기타` |

`주식`, `단백질`은 pantry mobile의 Wave1 display group/fallback 용도일 뿐 v1 canonical category가 아니다. 현재 API query와 YouTube ingredient registration validation은 위 8종 label만 허용한다.

### Future Taxonomy Candidate

아래 목록은 현재 v1 계약이 아니라 후속 contract-evolution 후보이다. 실제 적용 전에는 별도 workpack에서 공식 문서, DB/API 계약, migration, 회귀 테스트를 먼저 잠근다.

재료는 대분류 8개를 유지하고, 소분류는 UI/검색/자동매칭에서 자주 쓸 축만 남겨 21개로 줄인다.

| 대분류 | 소분류 후보 |
| --- | --- |
| 곡류/면/떡 | 밥/쌀, 면/파스타, 빵/떡/시리얼 |
| 채소/버섯 | 잎/나물채소, 뿌리/줄기채소, 열매채소/버섯 |
| 과일/견과 | 과일, 견과/씨앗/건과일 |
| 단백질 | 돼지/소/양, 닭/오리, 달걀, 두부/콩류 |
| 해산물 | 생선/갑각/조개, 해조/건어물/어묵 |
| 유제품/대체유 | 우유/요거트/크림, 치즈/버터/대체유 |
| 양념/조미 | 장류/소스, 향신료/허브, 기름/식초/당류/육수 |
| 가공/기타 | 김치/절임/통조림, 냉동/간편식/음료/기타 |

조리법은 레시피 단계에서 실제로 자주 쓰는 행동 중심으로 6개 그룹, 20개 대표 method로 줄인다. `씻기`, `채썰기`, `재우기`, `핏물빼기`, `지지기`, `중탕`, `압력솥`, `간보기`, `토핑`, `담기`, `식히기`, `숙성`처럼 빈도가 낮거나 다른 method의 표현으로 흡수 가능한 값은 canonical method가 아니라 synonym/step text 후보로 둔다.

| 그룹 | 대표 method 후보 |
| --- | --- |
| 준비/손질 | 썰기, 다지기 |
| 전처리 | 해동, 밑간, 절이기 |
| 물/수분 조리 | 끓이기, 삶기, 데치기, 찌기 |
| 팬/기름 조리 | 볶기, 굽기, 부치기, 튀기기 |
| 혼합/조림 | 섞기, 무치기, 조리기, 졸이기 |
| 기기 조리 | 전자레인지, 오븐굽기, 에어프라이어 |

후속 DB 후보는 `ingredient_category_groups`, `ingredient_categories`, `cooking_method_categories`, `cooking_method_synonyms`를 새로 검토하되, v1 호환을 위해 기존 `ingredients.category`와 `GET /ingredients?category=` label 계약은 migration 동안 유지한다. `cooking_methods.label varchar(5)` 완화는 method label 확장이 실제로 필요하다는 검증이 생긴 뒤 별도 승인으로 처리한다.

### Track B: Cooking Method Presentation Normalization

- `lib/cooking-method-colors.ts`의 `COOKING_METHOD_COLORS` / `getCookingMethodColor()`를 단일 기준 helper로 유지
- `components/recipe/recipe-detail-screen.tsx`의 로컬 `COOKING_METHOD_COLORS` / `COOKING_METHOD_TINTS` 중복 제거, shared helper 위임
- `components/cooking/cook-mode-mobile-ui.tsx`의 로컬 `METHOD_ALIASES` / `METHOD_VISUALS`를 shared helper 기준으로 정렬 또는 제거
- `components/cooking/cook-mode-desktop-view.tsx`의 `getCookingMethodColor()` 사용 유지 확인
- `components/recipe/manual-recipe-create-screen.tsx`의 color 소비가 shared helper를 사용하는지 확인
- `components/recipe/youtube-import-screen.tsx`의 color 소비가 shared helper를 사용하는지 확인
- `app/globals.css`의 `--cook-*` CSS 변수 체계 유지
- `blanch`의 문서상 `lime` color_key와 shared helper의 실제 매핑 불일치를 정합성 이슈로 잠금
- `GET /cooking-methods` v1 shape (`id`, `code`, `label`, `color_key`, `is_system`) 유지, additive-only 원칙

### Consumer Sweep

- 위 Track A/B 정렬 후 모든 화면/API에서 같은 shared source/helper를 실제 소비하는지 전수 점검
- 테스트에서 category/method 리터럴을 직접 쓰는 곳을 shared source import로 전환

## Out of Scope

- `ingredient_categories` 같은 신규 DB registry table 생성 또는 FK 전환
- `cooking_method_categories` full master table + FK cutover
- `cooking_methods.label varchar(5)` 확장 또는 taxonomy 코드 과적재
- 식약처 / 농식품올바로 등 외부 데이터 ingestion staging table 신설
- production 대량 ingest 운영 절차 확정
- legacy `ingredients.category` string field 제거 또는 FK 전환
- legacy `color_key` string field 제거 또는 FK 전환
- `GET /cooking-methods` 응답 필드 추가 (additive field 검토는 후보로만 기록)
- slice 27 YouTube 기능 개선 구현
- 디자인 리디자인 또는 신규 UI 화면 추가

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `26-youtube-dictionary-seed-uplift` | merged | [x] |
| `25-youtube-bulk-ingredient-resolution` | merged | [x] |
| `24-youtube-parser-dictionary-hardening` | merged | [x] |
| `23-youtube-quality-corpus` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `21-ingredient-dictionary` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이므로 착수 가능하다.

## Backend First Contract

### Track A: Ingredient Shared Mapping Source

**공용 source 구조** (`lib/ingredient-categories.ts` 확장):

```typescript
interface IngredientCategoryEntry {
  code: string;          // e.g. "vegetable"
  label: string;         // legacy label, e.g. "채소"
  display_order: number;
  is_active: boolean;
}

// canonical 8 categories
const INGREDIENT_CATEGORIES: IngredientCategoryEntry[];

// helper: legacy label -> entry
function getIngredientCategoryByLabel(label: string): IngredientCategoryEntry | undefined;

// helper: valid labels set
function isValidIngredientCategory(label: string): boolean;
```

**API 계약 유지**:
- `GET /ingredients?category=채소` / `GET /ingredients?category=과일` — category label 기반 query 유지
- `GET /pantry?category=채소` / `GET /pantry?category=과일` — category label 기반 filter 유지
- `POST /recipes/youtube/ingredient-registration` — category validation을 shared source 기준으로 수행
- 응답 형식: `{ success, data, error }` 래퍼 유지
- error: `{ code, message, fields[] }` 구조 유지

**RPC 계약**: 기존 `register_youtube_ingredient` RPC를 유지하되 category validation은 현재 v1 canonical 8종과 일치해야 함
**권한**: 기존 API 권한 정책 변경 없음
**상태 전이**: 없음
**멱등성**: 기존 API 멱등성 정책 변경 없음

### Track B: Cooking Helper Unification

**기존 shared helper** (`lib/cooking-method-colors.ts`) 유지:

```typescript
// 기존 함수 시그니처 유지
function getCookingMethodColor(colorKey?: string | null): string;
```

**통합 대상**:
- `components/recipe/recipe-detail-screen.tsx`의 로컬 `COOKING_METHOD_COLORS` / `COOKING_METHOD_TINTS` → shared helper 위임
- `components/cooking/cook-mode-mobile-ui.tsx`의 로컬 `METHOD_ALIASES` / `METHOD_VISUALS` → shared helper 기준 정렬

**API 계약 유지**:
- `GET /cooking-methods` — `{ id, code, label, color_key, is_system }` 응답 형식 변경 없음

### Error Cases

| 상황 | 코드 | 설명 |
| --- | --- | --- |
| 유효하지 않은 category query | 200 | 빈 결과 반환 (기존 동작 유지) |
| ingredient registration에 유효하지 않은 category | 422 | 기존 validation 유지 |
| 인증 실패 | 401 | 기존 정책 유지 |
| 권한 없음 | 403 | 기존 정책 유지 |

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI (기존 UI 유지, helper/source 참조만 변경)
- 필수 상태: `loading / empty / error / read-only / unauthorized` — 기존 화면의 상태 유지, 신규 상태 추가 없음
- 로그인 보호 액션: 기존 정책 유지

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL` (읽기 소비만, 레이아웃/구조 변경 없음)
- Visual artifact: N/A (기존 확정 UI의 helper/source 참조만 변경, 시각적 변경 최소)
- Authority status: `not-required`
- Notes: 기존 confirmed 화면의 import 참조만 변경하는 low-risk refactor. pantry mobile의 `주식/단백질/과일` 그룹명은 UI display 용도로 유지 가능하나, category canonical label과의 mapping 관계를 shared source에 명시해야 함.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — 기존 확정 화면의 internal refactor (시각적 출력 불변)

> 시각적 출력이 변경되지 않는 internal helper/source 정렬이므로 Design Status N/A. 만약 구현 중 시각적 변경이 불가피해지면 `temporary`로 전환하고 별도 authority review를 예약한다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.5.md`
- `docs/화면정의서-v1.5.12.md`
- `docs/유저flow맵-v1.3.12.md`
- `docs/api문서-v1.2.15.md`
- `docs/db설계-v1.3.11.md`
- `.omx/plans/ingredient-cooking-taxonomy-ralplan-final-20260525.md`
- `.omx/plans/ingredient-cooking-taxonomy-expansion-20260525.md`

## QA / Test Data Plan

### Fixture Baseline

- 기존 ingredient fixture (`tests/pantry-core.backend.test.ts`, `tests/home-screen.test.tsx` 등)에서 category 리터럴을 shared source import로 전환
- 기존 cooking method fixture (`tests/cooking-method-colors.test.ts`, `tests/cook-mode-screen.test.tsx` 등)에서 color_key 리터럴을 shared helper 기준으로 검증
- category/method 값이 shared source와 일치하는지 단위 테스트 추가

### Real DB Smoke 경로

- `pnpm dev:local-supabase` 또는 `pnpm dev:demo`에서:
  - `GET /ingredients?category=채소` 정상 반환 확인
  - `GET /cooking-methods` 정상 반환 확인
  - pantry category filter 정상 동작 확인
- Stage 2 시도 결과: `pnpm local:reset:demo`는 Docker image layer 등록 중 `no space left on device`로 실패했다. 테이블 존재 여부는 `supabase/migrations/20260301000000_core_schema_bootstrap.sql`의 `ingredients`, `ingredient_synonyms`, `cooking_methods` 정의로 확인했고, 자동화 가능한 검증은 Vitest, `pnpm typecheck`, `pnpm lint`, `pnpm verify:backend`로 보완한다.

### Seed / Reset 명령

- 기존 `supabase/seed.sql` 사용 (변경 없음)
- 기존 ingredient/cooking_method seed 데이터 유지

### Bootstrap 시스템 Row

- 기존 bootstrap 데이터 의존 (신규 시스템 row 생성 없음)

### Blocker 조건

- `ingredients` 테이블 부재
- `cooking_methods` 테이블 부재
- `ingredient_synonyms` 테이블 부재

## Key Rules

1. **현재 v1 canonical ingredient category는 `과일` 포함 8종**: `채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`
2. **신규 DB registry table 미도입**: 코드/seed 기반 shared mapping source로 시작, DB table은 slice 27 이후 필요 증거 시 검토
3. **`cooking_methods.label varchar(5)` 비과적재**: taxonomy 코드/분류 의미를 label에 싣지 않음
4. **cooking method category는 optional additive metadata**: v1 contract의 필수 축으로 승격하지 않음
5. **`GET /cooking-methods` v1 shape 유지**: 기존 소비자를 깨지 않는 additive-only 원칙
6. **외부 데이터 production 직적재 금지**: staging-only gate를 거쳐야 함
7. **시각적 출력 불변**: shared source/helper 전환 후에도 기존과 동일한 category label, cooking method color, emoji가 출력되어야 함
8. **pantry mobile의 `주식/단백질/과일` 그룹**: UI display 용도 유지 가능, canonical category와의 mapping 관계를 shared source에 명시

## Contract Evolution Candidates (Optional)

| # | 현재 계약 | 제안 계약 | 기대 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| CE-1 | `GET /ingredients` 응답에 `category` (legacy label) | `category_code` additive field | API 소비자가 label 외 stable code로도 category를 식별 | api문서, 화면정의서 | 미승인 |
| CE-2 | `GET /cooking-methods` 응답에 category 없음 | `category` optional additive field | 프론트에서 method를 논리적 그룹으로 표시 | api문서 | 미승인 |

> CE-1, CE-2 모두 현재 In Scope 계약에 포함하지 않는다. 사용자 승인 후 별도 contract-evolution PR로 진행한다.

## Primary User Path

1. 사용자가 HOME에서 재료 필터를 열고 `채소` 카테고리를 선택한다 → `GET /ingredients?category=채소`로 재료 목록 표시 (shared source 기준 label 사용)
2. PANTRY에서 카테고리별 재료를 조회한다 → mobile은 Wave1 그룹명 (`주식`, `단백질` 등), desktop은 canonical category 기준 표시 (모두 shared source에서 파생)
3. MANUAL_RECIPE_CREATE에서 재료를 추가하고 조리방법을 선택한다 → category chip은 shared source, method color는 shared helper 사용
4. YT_IMPORT에서 추출된 재료의 category를 확인/수정한다 → category 선택지가 shared source에서 파생
5. RECIPE_DETAIL에서 조리 단계의 method badge 색상이 표시된다 → shared helper 사용
6. COOK_MODE에서 mobile/desktop 모두 같은 method color로 표시된다 → shared helper 사용

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

### Track A: Ingredient

- [x] Shared mapping source 생성 (`lib/ingredient-categories.ts` 확장) <!-- omo:id=delivery-ingredient-shared-source;stage=2;scope=shared;review=3,6 -->
- [x] `IngredientCategory` type이 shared source에서 파생 <!-- omo:id=delivery-ingredient-type-derive;stage=2;scope=shared;review=3,6 -->
- [x] `lib/server/youtube-import.ts` INGREDIENT_CATEGORIES를 shared source 참조로 전환 <!-- omo:id=delivery-yt-import-category-ref;stage=2;scope=backend;review=3,6 -->
- [x] `app/api/v1/ingredients/route.ts` category query를 shared source 기준으로 정렬 <!-- omo:id=delivery-ingredients-api-align;stage=2;scope=backend;review=3,6 -->
- [x] `app/api/v1/pantry/route.ts` category filter를 shared source 기준으로 정렬 <!-- omo:id=delivery-pantry-api-align;stage=2;scope=backend;review=3,6 -->
- [x] ingredient filter modal이 shared source를 소비 <!-- omo:id=delivery-ingredient-filter-modal;stage=4;scope=frontend;review=5,6 -->
- [x] recipe ingredient add modal의 category emoji를 공용 helper로 전환 <!-- omo:id=delivery-ingredient-add-modal;stage=4;scope=frontend;review=5,6 -->
- [x] pantry-screen desktop의 CATEGORY_VISUAL을 공용 helper로 전환 <!-- omo:id=delivery-pantry-desktop-visual;stage=4;scope=frontend;review=5,6 -->
- [x] pantry-add-sheet의 category 소비를 shared source 기준으로 정렬 <!-- omo:id=delivery-pantry-add-sheet;stage=4;scope=frontend;review=5,6 -->
- [x] pantry-mobile-visuals의 Wave1 그룹과 canonical 8-category mapping 명시 <!-- omo:id=delivery-pantry-mobile-mapping;stage=4;scope=frontend;review=5,6 -->
- [x] youtube-import-screen의 INGREDIENT_CATEGORY_CHOICES를 shared source에서 파생 <!-- omo:id=delivery-yt-import-screen-category;stage=4;scope=frontend;review=5,6 -->

### Track B: Cooking

- [x] Shared cooking helper 확인 및 필요 시 확장 (`lib/cooking-method-colors.ts`) <!-- omo:id=delivery-cooking-shared-helper;stage=2;scope=shared;review=3,6 -->
- [x] recipe-detail-screen 로컬 COOKING_METHOD_COLORS/TINTS를 shared helper 위임 <!-- omo:id=delivery-recipe-detail-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [x] cook-mode-mobile-ui 로컬 METHOD_ALIASES/VISUALS를 shared helper 기준 정렬 <!-- omo:id=delivery-cook-mode-mobile-align;stage=4;scope=frontend;review=5,6 -->
- [x] manual-recipe-create-screen의 color 소비가 shared helper 사용 확인 <!-- omo:id=delivery-manual-create-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [x] youtube-import-screen의 color 소비가 shared helper 사용 확인 <!-- omo:id=delivery-yt-import-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [x] blanch/lime color_key 불일치를 shared helper에서 정합 <!-- omo:id=delivery-blanch-lime-fix;stage=2;scope=shared;review=3,6 -->

### Consumer Sweep & Testing

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (기존 유지 확인) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 (shared source/helper import 전환) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 (기존 유지 확인) <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] 테스트에서 category/method 리터럴을 shared source import로 전환 <!-- omo:id=delivery-test-literal-cleanup;stage=2;scope=shared;review=3,6 -->
- [x] 시각적 출력 불변 regression 확인 <!-- omo:id=delivery-visual-regression;stage=4;scope=frontend;review=5,6 -->
