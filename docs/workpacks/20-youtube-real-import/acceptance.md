# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> 이 슬라이스는 handoff에서 사용자 승인된 contract-evolution이며, 공식 문서 갱신이 같은 PR에 포함된다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Feature Flag / Auth Guard

- [x] Feature flag off → 모든 YouTube 엔드포인트 `404 FEATURE_DISABLED` <!-- omo:id=20-accept-feature-flag-off;stage=2;scope=backend;review=3,6 -->
- [x] Feature flag on + 비로그인 → `POST /recipes/youtube/validate` `401 UNAUTHORIZED` <!-- omo:id=20-accept-validate-unauthorized;stage=2;scope=backend;review=3,6 -->
- [x] Feature flag on + 비로그인 → `POST /recipes/youtube/extract` `401 UNAUTHORIZED` <!-- omo:id=20-accept-extract-unauthorized;stage=2;scope=backend;review=3,6 -->
- [x] Feature flag on + 비로그인 → `POST /recipes/youtube/register` `401 UNAUTHORIZED` <!-- omo:id=20-accept-register-unauthorized;stage=2;scope=backend;review=3,6 -->

## Happy Path

- [ ] URL 입력 → validate(recipe 판정) → extract → 검수/수정 → register → 레시피 생성 성공 <!-- omo:id=20-accept-happy-import-flow;stage=4;scope=frontend;review=5,6 -->
- [x] validate 응답에 `classification_status`, `classification_reasons` 포함 <!-- omo:id=20-accept-validate-classification;stage=2;scope=backend;review=3,6 -->
- [x] extract 응답에 `extraction_id`(=session id), `draft_warnings`, `blocking_issues`, ingredient `resolution_status`, step `is_incomplete` 포함 <!-- omo:id=20-accept-extract-session-fields;stage=2;scope=backend;review=3,6 -->
- [x] register 응답이 `{ success: true, data: { recipe_id, title }, error: null }` 형식 <!-- omo:id=20-accept-register-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 타입과 프론트 타입 일치 (request/response/error) <!-- omo:id=20-accept-types-match;stage=4;scope=shared;review=6 -->
- [ ] 등록 완료 후 my_added 가상 책 반영 확인 <!-- omo:id=20-accept-my-added-reflection;stage=4;scope=frontend;review=6 -->

## Validate Classification Gates

- [x] `recipe` classification → `is_recipe_video: true`, extract 진행 가능, 경고 없음 <!-- omo:id=20-accept-classify-recipe;stage=2;scope=backend;review=3,6 -->
- [ ] `uncertain` classification → `is_recipe_video: true`, extract 진행 가능, UI careful-review 경고 표시 <!-- omo:id=20-accept-classify-uncertain;stage=4;scope=frontend;review=5,6 -->
- [ ] `non_recipe` classification → `is_recipe_video: false`, UI extract 차단, 다른 URL 요청 <!-- omo:id=20-accept-classify-non-recipe-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `non_recipe` URL에 대한 직접 `POST /extract` → `422 NOT_RECIPE_VIDEO` <!-- omo:id=20-accept-classify-non-recipe-server;stage=2;scope=backend;review=3,6 -->
- [x] Classifier 보수적: 약한/혼합 증거 → `uncertain`, 강한 비요리 증거만 → `non_recipe` <!-- omo:id=20-accept-classifier-conservative;stage=2;scope=backend;review=3,6 -->

## Videos.list Metadata / Description Mapping

- [x] YouTube `videos.list` (part=snippet,contentDetails)로 title, description, tags, category, thumbnails, duration, caption flag 조회 <!-- omo:id=20-accept-videos-list-metadata;stage=2;scope=backend;review=3,6 -->
- [x] description 기반 재료/스텝 파싱이 실제 YouTube 영상 설명란에서 동작 <!-- omo:id=20-accept-description-parsing;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_methods` 배열에 실제 사용된 방식만 포함 (MVP: `["description"]` 또는 `["description", "manual"]`) <!-- omo:id=20-accept-extraction-methods-accurate;stage=2;scope=backend;review=3,6 -->

## Provider Error / Quota Handling

- [x] YouTube API에서 영상을 찾지 못함 → `404 VIDEO_NOT_FOUND` <!-- omo:id=20-accept-video-not-found;stage=2;scope=backend;review=3,6 -->
- [x] YouTube API 오류 → `502 PROVIDER_ERROR` <!-- omo:id=20-accept-provider-error;stage=2;scope=backend;review=3,6 -->
- [x] YouTube API 할당량 초과 → `429 QUOTA_EXCEEDED` <!-- omo:id=20-accept-quota-exceeded;stage=2;scope=backend;review=3,6 -->
- [ ] Provider error 시 UI에서 적절한 에러 표시 <!-- omo:id=20-accept-provider-error-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `YOUTUBE_API_KEY` 서버 전용, 클라이언트에 노출되지 않음 <!-- omo:id=20-accept-api-key-server-only;stage=2;scope=backend;review=3,6 -->

## Extract Session Creation and 24h Expiry

- [x] extract 시 `youtube_extraction_sessions` INSERT (`status='draft'`, `expires_at=NOW()+24h`) <!-- omo:id=20-accept-session-create;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_id` = `youtube_extraction_sessions.id` <!-- omo:id=20-accept-extraction-id-session;stage=2;scope=backend;review=3,6 -->
- [x] 세션에 `user_id = current_user.id` 저장 (클라이언트 공급 불가) <!-- omo:id=20-accept-session-user-id;stage=2;scope=backend;review=3,6 -->
- [x] 같은 URL이어도 매번 새 세션 생성 (MVP 재사용 없음) <!-- omo:id=20-accept-no-session-reuse;stage=2;scope=backend;review=3,6 -->
- [x] 24h 만료 세션에 대한 register → `410 EXTRACTION_EXPIRED` <!-- omo:id=20-accept-session-expired;stage=2;scope=backend;review=3,6 -->

## Unresolved / Needs_review Ingredient UX and Server Enforcement

- [x] `resolved` 재료: 정상 표시, register 통과 <!-- omo:id=20-accept-ingredient-resolved;stage=2;scope=backend;review=3,6 -->
- [ ] `needs_review` 재료: candidates 존재, 사용자 선택/교체 전까지 save 불가 <!-- omo:id=20-accept-ingredient-needs-review;stage=4;scope=frontend;review=5,6 -->
- [ ] `unresolved` 재료: picker/search로 교체 필수, `raw_text` 표시만 <!-- omo:id=20-accept-ingredient-unresolved;stage=4;scope=frontend;review=5,6 -->
- [x] Unresolved ingredients 포함 상태로 register 시도 → `422 VALIDATION_ERROR` with field paths <!-- omo:id=20-accept-unresolved-register-block;stage=2;scope=backend;review=3,6 -->

## Incomplete Step Warnings / Blockers

- [x] `instruction` 또는 `cooking_method` 누락 → blocking (register 불가) <!-- omo:id=20-accept-step-blocking-fields;stage=2;scope=backend;review=3,6 -->
- [x] `duration` 또는 `ingredients_used` 누락 → warning (register 가능) <!-- omo:id=20-accept-step-warning-fields;stage=2;scope=backend;review=3,6 -->
- [ ] Step incomplete UI 표시 (blocking vs warning 구분) <!-- omo:id=20-accept-step-incomplete-ui;stage=4;scope=frontend;review=5,6 -->

## Register Session Ownership / Cross-user / Expired / Consumed / Mismatch

- [x] 세션 없음 → `404 EXTRACTION_NOT_FOUND` <!-- omo:id=20-accept-register-not-found;stage=2;scope=backend;review=3,6 -->
- [x] Cross-user 세션 접근 → `404 EXTRACTION_NOT_FOUND` (세션 존재 숨김) <!-- omo:id=20-accept-register-cross-user;stage=2;scope=backend;review=3,6 -->
- [x] 만료 세션 → `410 EXTRACTION_EXPIRED` <!-- omo:id=20-accept-register-expired;stage=2;scope=backend;review=3,6 -->
- [x] 이미 등록된 세션 → `409 EXTRACTION_ALREADY_REGISTERED` <!-- omo:id=20-accept-register-consumed;stage=2;scope=backend;review=3,6 -->
- [x] Immutable identity mismatch → `409 EXTRACTION_MISMATCH` <!-- omo:id=20-accept-register-mismatch;stage=2;scope=backend;review=3,6 -->
- [x] EXTRACTION_MISMATCH는 immutable identity만 비교 (title/ingredients/steps 제외) <!-- omo:id=20-accept-mismatch-scope;stage=2;scope=backend;review=3,6 -->

## RPC Atomicity Invariant

- [x] Postgres RPC `register_youtube_recipe_from_session`이 단일 트랜잭션에서 모든 INSERT + 세션 UPDATE 수행 <!-- omo:id=20-accept-rpc-atomic;stage=2;scope=backend;review=3,6 -->
- [x] RPC 실패 시 어떤 partial row도 commit되지 않음 <!-- omo:id=20-accept-rpc-no-partial;stage=2;scope=backend;review=3,6 -->
- [x] RPC 실패 시 세션이 consumed되지 않음 (재시도 가능) <!-- omo:id=20-accept-rpc-session-not-consumed;stage=2;scope=backend;review=3,6 -->

## Recipe_sources Provenance

- [x] register 시 `recipe_sources.youtube_url`은 세션에서 복사 (클라이언트 아님) <!-- omo:id=20-accept-provenance-url;stage=2;scope=backend;review=3,6 -->
- [x] register 시 `recipe_sources.youtube_video_id`는 세션에서 복사 <!-- omo:id=20-accept-provenance-video-id;stage=2;scope=backend;review=3,6 -->
- [x] register 시 `recipe_sources.extraction_methods`는 세션의 실제 방식 <!-- omo:id=20-accept-provenance-methods;stage=2;scope=backend;review=3,6 -->
- [x] register 시 `recipe_sources.youtube_extraction_session_id` FK 저장 <!-- omo:id=20-accept-provenance-session-fk;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_meta_json`에 `provider_version`, `source_providers`, `classification_status`, `draft_warnings` 포함 <!-- omo:id=20-accept-provenance-meta;stage=2;scope=backend;review=3,6 -->

## Deterministic Tests / Local Fixtures

- [x] 기존 슬라이스 19 deterministic stub fixture 유지 (테스트/로컬 fallback) <!-- omo:id=20-accept-stub-fixture-retained;stage=2;scope=shared;review=3,6 -->
- [x] YouTube API mock fixture 추가 (recipe/uncertain/non_recipe 응답) <!-- omo:id=20-accept-youtube-api-mock;stage=2;scope=shared;review=3,6 -->
- [x] 세션 lifecycle fixture (draft/expired/consumed/cross-user) <!-- omo:id=20-accept-session-fixtures;stage=2;scope=shared;review=3,6 -->
- [x] Ingredient resolution fixture (resolved/needs_review/unresolved) <!-- omo:id=20-accept-ingredient-resolution-fixtures;stage=2;scope=shared;review=3,6 -->

## State / Policy

- [x] 기존 상태 전이 유지: `source_type='youtube'`, `created_by=current_user.id` <!-- omo:id=20-accept-source-type-owner;stage=2;scope=backend;review=3,6 -->
- [x] 미분류 조리방법 INSERT 유지 (`is_system=false`, `color_key='unassigned'`) <!-- omo:id=20-accept-new-cooking-method;stage=2;scope=backend;review=3,6 -->
- [x] `my_added` 가상 책 반영 유지 (`recipe_book_items` INSERT 없음) <!-- omo:id=20-accept-my-added-virtual-book;stage=2;scope=backend;review=3,6 -->
- [x] `ingredient_type='QUANT'` → amount > 0, unit 필수 <!-- omo:id=20-accept-quant-validation;stage=2;scope=backend;review=3,6 -->
- [x] `ingredient_type='TO_TASTE'` → amount=null, unit=null <!-- omo:id=20-accept-to-taste-validation;stage=2;scope=backend;review=3,6 -->
- [ ] 검수 단계에서만 수동 편집 허용 <!-- omo:id=20-accept-manual-edit-review-only;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] UI `loading` 상태 (validate/extract/register) <!-- omo:id=20-accept-loading-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] UI `error` 상태 (provider error, quota, validation failure, session errors) <!-- omo:id=20-accept-error-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 시 로그인 게이트 → 로그인 후 import 폼 자동 복귀 (return-to-action) <!-- omo:id=20-accept-login-gate-return;stage=4;scope=frontend;review=5,6 -->
- [ ] Session expired/consumed 에러 시 적절한 UI 안내 <!-- omo:id=20-accept-session-error-ui;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] `youtube_extraction_sessions`에 `user_id`, `youtube_url`, `youtube_video_id` 올바르게 저장 <!-- omo:id=20-accept-session-data-integrity;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_sources.youtube_video_id` URL에서 올바르게 파싱 <!-- omo:id=20-accept-video-id-parse;stage=2;scope=backend;review=3,6 -->
- [x] `draft_json`에 추출 결과 전체 저장 <!-- omo:id=20-accept-draft-json-complete;stage=2;scope=backend;review=3,6 -->
- [x] 동일 레시피에서 재료 `sort_order` 중복 없음 <!-- omo:id=20-accept-ingredient-sort-unique;stage=2;scope=backend;review=3,6 -->
- [x] 동일 레시피에서 스텝 `step_number` 중복 없음 <!-- omo:id=20-accept-step-number-unique;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] `youtube_extraction_sessions` 테이블 migration 적용 확인 <!-- omo:id=20-accept-migration-sessions;stage=2;scope=shared;review=3,6 -->
- [x] `recipe_sources.youtube_extraction_session_id` FK 추가 확인 <!-- omo:id=20-accept-migration-fk;stage=2;scope=shared;review=3,6 -->
- [x] `register_youtube_recipe_from_session` RPC 생성 확인 <!-- omo:id=20-accept-rpc-created;stage=2;scope=shared;review=3,6 -->
- [x] 슬라이스 19 기존 bootstrap 유지 (조리방법 seed, 재료 마스터, recipe_sources 테이블, my_added 시스템 책) <!-- omo:id=20-accept-bootstrap-retained;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Codex Stage 4/5/6 closeout
- environment: local Playwright fixtures (`http://127.0.0.1:3100`), local Supabase smoke (`http://127.0.0.1:3128`), demo smoke (`http://127.0.0.1:3130`)
- scenarios:
  - 유튜브 URL 입력 → validate (recipe) → extract → 검수(재료/스텝 편집) → register → my_added 확인
  - validate uncertain → careful-review 경고 확인 → extract 계속 → register 성공
  - validate non_recipe → extract 차단 확인 → 다른 URL 입력
  - Extract 후 unresolved 재료 → picker로 교체 → register 성공
  - Extract 후 needs_review 재료 → candidate 선택 → register 성공
  - Extract 후 incomplete step → blocking field 채움 → register 성공
  - 등록 후 "이 끼니에 추가" → MEAL_SCREEN 복귀
  - 만료 세션 register 시도 → 410 에러 확인
  - 비로그인 상태에서 URL 입력 시도 → 로그인 게이트 → 복귀

## Automation Split

### Vitest

- [x] YouTube API adapter (videos.list mock, error handling) <!-- omo:id=20-vitest-youtube-adapter;stage=2;scope=backend;review=3,6 -->
- [x] Classification 3-way 로직 (recipe/uncertain/non_recipe 판정) <!-- omo:id=20-vitest-classification;stage=2;scope=backend;review=3,6 -->
- [x] Extract 세션 생성 로직 (draft_json, status, expires_at) <!-- omo:id=20-vitest-extract-session;stage=2;scope=backend;review=3,6 -->
- [x] Ingredient resolution 로직 (resolved/needs_review/unresolved 판정) <!-- omo:id=20-vitest-ingredient-resolution;stage=2;scope=backend;review=3,6 -->
- [x] Step incomplete detection 로직 (blocking/warning) <!-- omo:id=20-vitest-step-incomplete;stage=2;scope=backend;review=3,6 -->
- [x] Register 세션 검증 로직 (ownership, expired, consumed, mismatch) <!-- omo:id=20-vitest-register-session;stage=2;scope=backend;review=3,6 -->
- [x] RPC atomicity (성공/실패 시 세션 상태) <!-- omo:id=20-vitest-rpc-atomicity;stage=2;scope=backend;review=3,6 -->
- [x] Provenance 로직 (세션 기반 recipe_sources 생성) <!-- omo:id=20-vitest-provenance;stage=2;scope=backend;review=3,6 -->
- [x] Feature flag / auth guard (404/401 분기) <!-- omo:id=20-vitest-feature-auth;stage=2;scope=backend;review=3,6 -->
- [x] Provider error handling (502/429) <!-- omo:id=20-vitest-provider-error;stage=2;scope=backend;review=3,6 -->

### Playwright

- [ ] YouTube real import happy path (URL → validate → extract → review → register) <!-- omo:id=20-playwright-happy-import;stage=4;scope=frontend;review=5,6 -->
- [ ] Classification 3-way UI (recipe 진행, uncertain 경고, non_recipe 차단) <!-- omo:id=20-playwright-classification;stage=4;scope=frontend;review=5,6 -->
- [ ] Ingredient resolution UI (needs_review → 선택, unresolved → 교체) <!-- omo:id=20-playwright-ingredient-resolution;stage=4;scope=frontend;review=5,6 -->
- [ ] Step incomplete UI (blocking → fill required, warning 표시) <!-- omo:id=20-playwright-step-incomplete;stage=4;scope=frontend;review=5,6 -->
- [ ] Save unlock condition (register button gating) <!-- omo:id=20-playwright-save-unlock;stage=4;scope=frontend;review=5,6 -->
- [ ] Provider error UI (502, 429 표시) <!-- omo:id=20-playwright-provider-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 + return-to-action <!-- omo:id=20-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 YouTube Data API key를 사용한 live 영상 validate/extract/register (credential-gated, deterministic 불가)
- [ ] YouTube API 할당량 초과 시나리오 (실제 할당량 소진 필요)
- [ ] 다양한 유튜브 URL 형식 호환성 (youtu.be, shorts, 플레이리스트 내 영상 등 — 실제 YouTube URL 파서 동작 의존)
- [ ] 실제 YouTube 영상의 classification 정확도 수동 확인
- [ ] Future LLM/caption/ASR 통합 시 regression 확인 (이 슬라이스 범위 밖)
