# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Happy Path

### Track A: Ingredient Category Normalization

- [x] `lib/ingredient-categories.ts`에 canonical 7 category entry가 `code`, `label`, `display_order`, `is_active`로 정의되어 있다 <!-- omo:id=accept-ingredient-shared-source;stage=2;scope=shared;review=3,6 -->
- [x] `IngredientCategory` type union이 shared source에서 파생되어 hardcoded 7종 리터럴을 직접 선언하지 않는다 <!-- omo:id=accept-ingredient-type-derived;stage=2;scope=shared;review=3,6 -->
- [x] `GET /ingredients?category=채소` 호출 시 legacy label 기반 query가 정상 동작한다 <!-- omo:id=accept-ingredients-api-category-query;stage=2;scope=backend;review=3,6 -->
- [x] `GET /pantry?category=채소` 호출 시 category filter가 정상 동작한다 <!-- omo:id=accept-pantry-api-category-filter;stage=2;scope=backend;review=3,6 -->
- [x] `POST /recipes/youtube/ingredient-registration` 호출 시 category validation이 shared source 기준으로 수행된다 <!-- omo:id=accept-yt-registration-category-validation;stage=2;scope=backend;review=3,6 -->
- [ ] HOME ingredient filter modal에서 category 선택 시 shared source 기준 label/순서가 표시된다 <!-- omo:id=accept-home-filter-shared-source;stage=4;scope=frontend;review=5,6 -->
- [ ] recipe ingredient add modal에서 category chip과 emoji가 shared source/helper에서 파생된다 <!-- omo:id=accept-ingredient-add-modal-shared;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY mobile에서 Wave1 그룹명(`주식`, `단백질`)이 legacy 7-category와 mapping되어 표시된다 <!-- omo:id=accept-pantry-mobile-wave1-mapping;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY desktop에서 category visual(emoji)이 공용 helper에서 파생된다 <!-- omo:id=accept-pantry-desktop-visual-shared;stage=4;scope=frontend;review=5,6 -->
- [ ] pantry-add-sheet에서 category 소비가 shared source 기준이다 <!-- omo:id=accept-pantry-add-sheet-shared;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT 검수 화면에서 category 선택지가 shared source에서 파생된다 <!-- omo:id=accept-yt-import-category-choices;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

### Track B: Cooking Method Presentation Normalization

- [x] `lib/cooking-method-colors.ts`의 `getCookingMethodColor()`가 단일 기준 helper로 유지된다 <!-- omo:id=accept-cooking-shared-helper;stage=2;scope=shared;review=3,6 -->
- [ ] RECIPE_DETAIL의 조리 단계 badge 색상이 shared helper에서 파생된다 (로컬 중복 map 제거) <!-- omo:id=accept-recipe-detail-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE mobile의 method 색상이 shared helper 기준으로 정렬된다 <!-- omo:id=accept-cook-mode-mobile-color;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE desktop의 method 색상이 shared helper를 사용한다 <!-- omo:id=accept-cook-mode-desktop-color;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_RECIPE_CREATE의 step method 색상이 shared helper를 사용한다 <!-- omo:id=accept-manual-create-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT의 step method 색상이 shared helper를 사용한다 <!-- omo:id=accept-yt-import-cooking-color;stage=4;scope=frontend;review=5,6 -->
- [ ] 같은 cooking method가 모든 화면에서 같은 label/color/fallback으로 표시된다 <!-- omo:id=accept-cooking-visual-consistency;stage=4;scope=frontend;review=5,6 -->
- [x] `blanch` method의 color_key와 shared helper 매핑이 일관된다 <!-- omo:id=accept-blanch-color-consistency;stage=2;scope=shared;review=3,6 -->

## State / Policy

- [x] 기존 상태 전이가 변경 없이 유지된다 (이 슬라이스에서 상태 전이 변경 없음) <!-- omo:id=accept-no-state-transition-change;stage=2;scope=shared;review=3,6 -->
- [x] 기존 read-only 정책이 유지된다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 기존 API 멱등성이 유지된다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] `ingredients.category`는 legacy 7종 문자열 값만 허용한다 <!-- omo:id=accept-category-enum-freeze;stage=2;scope=shared;review=3,6 -->
- [x] `cooking_methods.label`에 taxonomy 코드/분류 의미를 싣지 않는다 <!-- omo:id=accept-label-non-overload;stage=2;scope=shared;review=3,6 -->

## Error / Data Integrity

- [ ] loading 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 기존 화면에서 유지된다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 기존 화면에서 유지된다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 타인 리소스를 수정할 수 없다 (기존 정책 유지) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid category input이 적절히 처리된다 (빈 결과 또는 422) <!-- omo:id=accept-invalid-category-input;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 ingredient category가 shared source의 7종과 일치한다 <!-- omo:id=accept-fixture-category-match;stage=2;scope=shared;review=3,6 -->
- [x] fixture / mock에서 cooking method color_key가 shared helper의 매핑과 일치한다 <!-- omo:id=accept-fixture-cooking-color-match;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 `ingredients` / `cooking_methods` / `ingredient_synonyms` 테이블이 존재한다 <!-- omo:id=accept-real-db-tables-exist;stage=2;scope=shared;review=3,6 -->
- [x] 기존 seed 데이터의 ingredient category 값이 legacy 7종 중 하나이다 <!-- omo:id=accept-seed-category-compliance;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: 수동 확인자 (Stage 4 구현 후)
- environment: 로컬 개발 환경 (`pnpm dev` 또는 `pnpm dev:demo`)
- scenarios:
  1. HOME ingredient filter에서 각 category 선택 시 같은 결과가 나오는지 확인
  2. PANTRY mobile에서 Wave1 그룹과 legacy category의 재료가 올바르게 표시되는지 확인
  3. RECIPE_DETAIL에서 조리 단계 badge 색상이 기존과 동일한지 확인
  4. COOK_MODE mobile/desktop에서 method 색상이 동일한지 확인
  5. MANUAL_RECIPE_CREATE에서 조리방법 선택 후 step badge 색상 확인
  6. YT_IMPORT에서 재료 category 선택지와 step method 색상 확인
- Stage 2 note: `pnpm local:reset:demo`는 Docker image layer 등록 중 `no space left on device`로 실패했다. `accept-real-db-tables-exist`는 체크하지 않고, 자동화 가능한 검증은 Vitest, `pnpm typecheck`, `pnpm lint`, `pnpm verify:backend`로 보완한다.

## Automation Split

### Vitest

- [x] `lib/ingredient-categories.ts` shared source의 7 category 정합성 단위 테스트 <!-- omo:id=accept-vitest-ingredient-source;stage=2;scope=shared;review=3,6 -->
- [x] `lib/cooking-method-colors.ts` shared helper의 color_key 매핑 단위 테스트 <!-- omo:id=accept-vitest-cooking-helper;stage=2;scope=shared;review=3,6 -->
- [x] `IngredientCategory` type이 shared source에서 파생되는지 타입 테스트 <!-- omo:id=accept-vitest-type-derive;stage=2;scope=shared;review=3,6 -->
- [x] YouTube ingredient registration의 category validation이 shared source 기준인지 테스트 <!-- omo:id=accept-vitest-yt-registration-validation;stage=2;scope=backend;review=3,6 -->
- [x] 기존 ingredient/pantry API 테스트가 shared source import로 전환 후에도 통과 <!-- omo:id=accept-vitest-api-regression;stage=2;scope=backend;review=3,6 -->
- [x] cooking method color 관련 기존 테스트가 shared helper 전환 후에도 통과 <!-- omo:id=accept-vitest-cooking-regression;stage=2;scope=shared;review=3,6 -->
- [ ] 화면 컴포넌트 테스트에서 category/method 리터럴이 shared source import로 전환 <!-- omo:id=accept-vitest-component-literal-cleanup;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] HOME ingredient filter category 선택 → 필터 결과 E2E 확인 <!-- omo:id=accept-playwright-home-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY category 필터 → 재료 목록 E2E 확인 <!-- omo:id=accept-playwright-pantry-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL step badge 색상 rendering E2E 확인 <!-- omo:id=accept-playwright-recipe-detail-color;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE method 색상 rendering E2E 확인 <!-- omo:id=accept-playwright-cook-mode-color;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 YouTube 동영상 URL로 YT_IMPORT 전체 플로우에서 ingredient category / cooking method color가 올바르게 표시되는지 확인 (실제 YouTube Data API 필요)
