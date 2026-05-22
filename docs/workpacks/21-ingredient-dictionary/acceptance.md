# Acceptance Checklist: 21-ingredient-dictionary (Phase 1 + 2)

> acceptance는 living closeout 문서다. 체크는 테스트, real DB smoke, 실제 확인처럼 evidence가 생긴 뒤에만 한다.
> BE-only 슬라이스이므로 Stage 3 merge 시점에 `Manual Only`를 제외한 모든 항목이 체크되어 있어야 한다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] `진간장` synonym 입력이 `간장`으로 `resolved`되고, top-level `standard_name`이 canonical(`간장`)로 치환된다 <!-- omo:id=accept-synonym-resolved;stage=2;scope=backend;review=3 -->
- [x] `Soy Sauce` 입력이 DB의 `soy sauce` synonym으로 `resolved`된다 (대소문자 + 역매핑 검증) <!-- omo:id=accept-case-insensitive-match;stage=2;scope=backend;review=3 -->
- [x] direct와 synonym이 같은 ingredientId를 가리키면 후보 1개로 dedup되고 `source`가 `direct`다 <!-- omo:id=accept-dedup-direct-priority;stage=2;scope=backend;review=3 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 (기존 계약 유지) <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3 -->

## State / Policy

- [x] direct와 synonym이 서로 다른 ingredientId를 가리키면 `needs_review`가 되며, top-level `standard_name`은 원본 parsed name을 유지한다 (canonical 치환 안 됨) <!-- omo:id=accept-needs-review-no-canonical;stage=2;scope=backend;review=3 -->
- [x] 같은 synonym이 여러 재료에 붙으면 `needs_review` candidates가 direct → synonym → standardName 순으로 안정 정렬된다 <!-- omo:id=accept-candidates-sort;stage=2;scope=backend;review=3 -->
- [x] `resolved`일 때만 top-level `standard_name`을 canonical로 치환하고, `display_text`/`raw_text`는 원문을 유지한다 <!-- omo:id=accept-resolved-canonical-only;stage=2;scope=backend;review=3 -->

## Error / Permission

- [x] synonym 조회 DB 에러가 `findIngredientIds`의 `error`로 전파되어 호출부에서 `INTERNAL_ERROR`로 차단된다 (조용한 unresolved 금지) <!-- omo:id=accept-db-error-propagation;stage=2;scope=backend;review=3 -->

## Data Integrity

- [x] lookup key는 trim 후 빈 문자열을 제외한다 (예: `" "` 입력이 빈 key를 만들지 않는다) <!-- omo:id=accept-trim-empty-guard;stage=2;scope=backend;review=3 -->
- [x] embedded join 결과(`row.ingredients`)가 단일/배열/null 어떤 형태로 와도 `Array.isArray` 정규화로 안전하게 처리되고, falsy면 skip한다 <!-- omo:id=accept-array-normalize;stage=2;scope=backend;review=3 -->
- [x] migration이 표준 재료를 `on conflict (standard_name) do nothing`으로 삽입해 기존 row를 덮지 않는다 <!-- omo:id=accept-migration-no-overwrite;stage=2;scope=backend;review=3 -->
- [x] synonym은 `standard_name` 기준 join으로 연결되고, 영어 synonym은 `lower(trim(...))` 저장된다 <!-- omo:id=accept-synonym-lowercase;stage=2;scope=backend;review=3 -->
- [x] 카테고리는 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 내에서만 지정된다 <!-- omo:id=accept-category-enum;stage=2;scope=backend;review=3 -->
- [x] migration 재실행이 idempotent하다 (중복 synonym `on conflict (ingredient_id, synonym) do nothing`) <!-- omo:id=accept-migration-idempotent;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (synonym 매칭 테스트용 fixture) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3 -->
- [x] real DB smoke에 필요한 테이블이 준비되어 있다 (`ingredients`, `ingredient_synonyms`) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3 -->

## Integration / Regression

- [x] 기존 `tests/youtube-import.backend.test.ts`가 모두 통과한다 (resolution_status 계약 불변) <!-- omo:id=accept-regression-pass;stage=2;scope=backend;review=3 -->
- [x] 실제 실패 케이스(오이참치 꼬마김밥 등)에서 시딩된 재료가 `resolved` 또는 `needs_review`로 전환되어 매칭률이 개선된다 <!-- omo:id=accept-matching-improvement;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: 수동 (real DB smoke)
- environment: local Supabase (`pnpm dev:local-supabase`)
- evidence plan: synonym 시딩 migration 적용 후 실제 YouTube URL로 extract 호출하여 이전 unresolved 재료가 resolved로 전환되는지 확인. real DB + YOUTUBE_API_KEY 필요.

## Automation Split

### Vitest

- [x] 로직 / 유틸 / 상태 전이 / API helper 범위가 분리되어 있다 (findIngredientIds 6종 테스트) <!-- omo:id=accept-vitest-split;stage=2;scope=backend;review=3 -->
- [x] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다 (dedup, canonical 치환, 에러 전파) <!-- omo:id=accept-vitest-regression;stage=2;scope=backend;review=3 -->

### Playwright

- N/A (BE-only 슬라이스)

### Manual Only

- [ ] synonym 시딩 migration 적용 후 실제 YouTube URL로 extract 호출하여 매칭률 개선 실물 확인 (real DB + YOUTUBE_API_KEY 필요)

## Out of Scope (이 슬라이스 acceptance 아님)

- Phase 3 안전 정규화 / 위험 추정 매칭
- Phase 4 미등록 재료 등록 흐름 (별도 슬라이스 + contract evolution)
