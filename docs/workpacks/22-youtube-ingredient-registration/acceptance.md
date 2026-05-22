# Acceptance Checklist: 22-youtube-ingredient-registration

> README의 `Contract Evolution Decisions`는 Stage 1 docs/contract-evolution PR에서 공식 문서와 함께 잠근다.
> 이 슬라이스는 public API와 YT_IMPORT 화면 계약을 바꾸므로, Stage 2 구현 전에 이 문서 PR이 merge되어야 한다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Contract Gate

- [x] 공식 API 문서에 새 재료 등록 endpoint 계약이 반영되어 있다 <!-- omo:id=accept-contract-api-doc;stage=2;scope=shared;review=3,6 -->
- [x] 공식 API 문서에 extract 응답의 `draft_ingredient_id` 필드가 반영되어 있다 <!-- omo:id=accept-contract-draft-id-doc;stage=2;scope=shared;review=3,6 -->
- [x] 공식 화면정의서에 YT_IMPORT 새 재료 등록 액션과 상태가 반영되어 있다 <!-- omo:id=accept-contract-screen-doc;stage=2;scope=shared;review=3,6 -->
- [x] 공식 유저 flow 문서에 unresolved / needs_review → search 또는 create 분기가 반영되어 있다 <!-- omo:id=accept-contract-flow-doc;stage=2;scope=shared;review=3,6 -->
- [x] 공식 DB 문서에 `register_youtube_ingredient(...)` RPC 경계가 반영되어 있다 <!-- omo:id=accept-contract-db-doc;stage=2;scope=shared;review=3,6 -->

## Happy Path

- [x] unresolved 재료에서 "새 재료로 등록"을 열 수 있다 <!-- omo:id=accept-open-register-from-unresolved;stage=4;scope=frontend;review=5,6 -->
- [x] 표준명/카테고리 확인 후 등록하면 `ingredients` row가 생성되고 현재 재료가 `resolved`가 된다 <!-- omo:id=accept-create-and-resolve;stage=2;scope=shared;review=3,6 -->
- [x] registration response `data.ingredient`가 클라이언트 row 업데이트에 필요한 `ingredient_id`와 canonical `standard_name`을 포함한다 <!-- omo:id=accept-response-row-update-fields;stage=2;scope=backend;review=3,6 -->
- [x] 등록 성공 후 수량, 단위, `display_text`, `raw_text`가 유지된다 <!-- omo:id=accept-preserve-quantity-unit-raw;stage=4;scope=frontend;review=5,6 -->
- [x] 다른 차단 재료가 없으면 기존 YouTube register 흐름으로 레시피 저장이 가능하다 <!-- omo:id=accept-register-after-resolve;stage=4;scope=frontend;review=5,6 -->
- [x] needs_review 재료도 후보 선택 외에 새 재료 등록 fallback을 사용할 수 있다 <!-- omo:id=accept-needs-review-create-fallback;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] 사용자 확인 없는 자동 등록 경로가 없다 <!-- omo:id=accept-no-auto-create;stage=4;scope=frontend;review=5,6 -->
- [x] `resolved` row만 최종 recipe register에 통과한다 <!-- omo:id=accept-register-resolved-only;stage=2;scope=shared;review=3,6 -->
- [x] 이미 같은 `standard_name`이 있으면 기존 ingredient를 반환하고 중복 row를 만들지 않는다 <!-- omo:id=accept-standard-name-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] 동일 요청을 두 번 보내도 ingredient / synonym 중복 row가 생기지 않는다 <!-- omo:id=accept-request-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] session draft row가 이미 resolved이면 새 등록을 거부한다 <!-- omo:id=accept-reject-already-resolved;stage=2;scope=backend;review=3,6 -->
- [x] session draft에 없는 `draft_ingredient_id`이거나 unresolved / needs_review가 아니면 409로 거부한다 <!-- omo:id=accept-draft-id-guard;stage=2;scope=backend;review=3,6 -->
- [x] registration API는 `youtube_extraction_sessions.draft_json`을 수정하지 않고, 클라이언트가 로컬 row를 resolved로 업데이트한다 <!-- omo:id=accept-client-side-row-update;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 검색 결과 empty 상태에서 새 등록 CTA가 보인다 <!-- omo:id=accept-empty-create-cta;stage=4;scope=frontend;review=5,6 -->
- [x] validation / API error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름과 return-to-action이 있다 <!-- omo:id=accept-unauthorized-return;stage=4;scope=frontend;review=5,6 -->
- [x] session 만료는 410으로 처리하고 재추출 안내를 보여준다 <!-- omo:id=accept-session-expired;stage=2;scope=shared;review=3,6 -->
- [x] 타인 extraction session은 404로 숨긴다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] consumed / stale session은 409로 처리한다 <!-- omo:id=accept-session-conflict;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] `standard_name`은 trim, 내부 공백 collapse, 길이 제한, 제어문자 금지를 적용한다 <!-- omo:id=accept-standard-name-validation;stage=2;scope=backend;review=3,6 -->
- [x] category는 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 중 하나만 허용한다 <!-- omo:id=accept-category-validation;stage=2;scope=backend;review=3,6 -->
- [x] `default_unit`은 null 또는 제한된 문자열만 허용한다 <!-- omo:id=accept-default-unit-validation;stage=2;scope=backend;review=3,6 -->
- [x] synonym은 trim + 영어 lower-case로 저장한다 <!-- omo:id=accept-synonym-normalization;stage=2;scope=backend;review=3,6 -->
- [x] `lower(trim(synonym)) === lower(trim(standard_name))`이면 synonym 저장을 skip하고 현재 row는 resolved로 처리한다 <!-- omo:id=accept-synonym-same-as-standard;stage=2;scope=backend;review=3,6 -->
- [x] 같은 synonym이 다른 ingredient에 이미 있으면 best-effort advisory query로 새 synonym 연결을 skip하고 warning을 반환한다 <!-- omo:id=accept-synonym-ambiguous-skip;stage=2;scope=backend;review=3,6 -->
- [x] ingredient 생성과 synonym 연결은 `register_youtube_ingredient(...)` RPC로 묶여 partial success가 남지 않는다 <!-- omo:id=accept-rpc-boundary;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 21번 재료 사전 migration이 선행 적용되어 있다 <!-- omo:id=accept-dictionary-precondition;stage=2;scope=shared;review=3,6 -->

## Integration / Regression

- [x] 기존 `GET /api/v1/ingredients` 검색/교체 흐름이 깨지지 않는다 <!-- omo:id=accept-ingredients-search-regression;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 YT_IMPORT candidate 선택 흐름이 깨지지 않는다 <!-- omo:id=accept-candidate-selection-regression;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 YouTube register API가 unresolved / needs_review 차단을 유지한다 <!-- omo:id=accept-register-blocker-regression;stage=2;scope=backend;review=3,6 -->
- [x] 모바일 좁은 폭에서 unresolved 문구, 검색 교체, 새 등록 CTA, 수량/단위 입력이 겹치지 않는다 <!-- omo:id=accept-mobile-layout;stage=4;scope=frontend;review=5,6 -->

## Manual QA

- verifier: Stage 6 verifier
- environment: `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
- scenarios:
  - 실제 YouTube 설명란에서 `연겨자` 같은 미등록 재료 추출 → 새 등록 → row resolved → 레시피 저장
  - 기존 DB에 있는 `간장`을 새 표준명으로 입력 → 기존 ingredient 재사용 확인
  - synonym conflict fixture → warning 표시 또는 조용한 skip 확인
  - session 만료/재추출 필요 안내 확인

## Automation Split

### Vitest

- [x] registration validation 유틸 테스트가 있다 <!-- omo:id=accept-vitest-validation;stage=2;scope=backend;review=3,6 -->
- [x] API route/RPC 테스트가 owner guard, expired, conflict, idempotency, synonym conflict를 고정한다 <!-- omo:id=accept-vitest-api-policy;stage=2;scope=backend;review=3,6 -->
- [x] 기존 `youtube-import.backend.test.ts` 회귀가 통과한다 <!-- omo:id=accept-vitest-youtube-regression;stage=2;scope=backend;review=3,6 -->
- [x] YT_IMPORT UI unit/component 테스트가 새 등록 성공/실패 상태를 고정한다 <!-- omo:id=accept-vitest-ui;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] unresolved → 새 등록 → resolved → 저장 가능 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-create-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 모바일 viewport에서 registration sheet와 row layout screenshot evidence가 있다 <!-- omo:id=accept-playwright-mobile-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] live YouTube API가 필요한 경로와 fixture 기반 기본 게이트가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 실제 외부 YouTube API description 추출 smoke는 YOUTUBE_API_KEY가 있는 환경에서 선택 실행한다

## Out of Scope (이 슬라이스 acceptance 아님)

- 자동 표준명 추정 / fuzzy matching
- 운영 DB 정리 또는 admin moderation
- 전체 ingredient 관리 CRUD
- YouTube session draft 장기 저장/복구 UX
