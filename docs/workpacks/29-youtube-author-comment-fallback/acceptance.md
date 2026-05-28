# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Author Comment Source Policy

- [x] 작성자 top-level comment만 parser input으로 사용한다 <!-- omo:id=accept-author-top-level-only;stage=2;scope=backend;review=3,6 -->
- [x] 일반 시청자 댓글은 recipe text가 있어도 무시한다 <!-- omo:id=accept-non-author-ignored;stage=2;scope=backend;review=3,6 -->
- [x] reply 댓글은 작성자 댓글이어도 MVP 범위에서 사용하지 않는다 <!-- omo:id=accept-replies-ignored;stage=2;scope=backend;review=3,6 -->
- [x] pinned 여부에 의존하지 않는다 <!-- omo:id=accept-pinned-not-required;stage=2;scope=backend;review=3,6 -->
- [x] `commentThreads.list`는 `order=relevance`, `maxResults=100`, 1 page cap을 지킨다 <!-- omo:id=accept-one-page-cap;stage=2;scope=backend;review=3,6 -->

## Fallback Trigger & Merge

- [x] description 결과가 registration-ready이면 comment provider를 호출하지 않는다 <!-- omo:id=accept-description-ready-skip;stage=2;scope=backend;review=3,6 -->
- [x] description이 비어 있고 작성자 댓글에 recipe text가 있으면 draft를 생성한다 <!-- omo:id=accept-empty-description-author-draft;stage=2;scope=backend;review=3,6 -->
- [x] description에 재료만 있고 작성자 댓글에 step이 있으면 step을 보충한다 <!-- omo:id=accept-author-steps-fill;stage=2;scope=backend;review=3,6 -->
- [x] description과 작성자 댓글이 충돌하면 description 값을 우선한다 <!-- omo:id=accept-description-precedence;stage=2;scope=backend;review=3,6 -->
- [x] 작성자 댓글에 recipe signal이 없으면 registration-ready로 주장하지 않는다 <!-- omo:id=accept-no-signal-no-false-ready;stage=2;scope=backend;review=3,6 -->
- [x] 여러 작성자 댓글 중 recipe signal이 가장 강한 후보를 선택하거나 안전하게 병합한다 <!-- omo:id=accept-multiple-author-comments;stage=2;scope=backend;review=3,6 -->

## Provider Failure & Metadata

- [x] comments disabled는 extract 실패가 아니라 description-only graceful degradation으로 처리한다 <!-- omo:id=accept-comments-disabled-degrade;stage=2;scope=backend;review=3,6 -->
- [x] author comment provider error는 기존 description 결과를 깨지 않는다 <!-- omo:id=accept-provider-error-degrade;stage=2;scope=backend;review=3,6 -->
- [x] provider 시도 여부, 후보 수, 사용 여부, failure reason이 `extraction_meta_json`에 기록된다 <!-- omo:id=accept-author-meta-recorded;stage=2;scope=backend;review=3,6 -->
- [x] 작성자 댓글 원문 전체를 운영 로그나 operational_events metadata에 저장하지 않는다 <!-- omo:id=accept-no-raw-comment-operational-log;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_methods`는 실제 기여 source만 포함한다 <!-- omo:id=accept-extraction-methods-honest;stage=2;scope=shared;review=3,6 -->

## Happy Path

- [ ] 작성자 댓글 recipe 영상: URL 입력 → extract → 작성자 댓글 보충 draft → 검수 → 등록 full flow가 동작한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [ ] `author_comment` source label이 검수 화면에서 "작성자 댓글"로 표시된다 <!-- omo:id=accept-author-comment-label;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 상태 전이가 공식 문서와 일치한다 (draft → consumed / expired) <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] read-only 정책이 지켜진다 (consumed session 재사용 불가) <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다 (extract는 새 세션, register consumed는 409) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] Taxonomy freeze contract를 지킨다 (legacy 7 category 유지) <!-- omo:id=accept-taxonomy-freeze;stage=2;scope=shared;review=3,6 -->
- [x] 신규 LLM/OCR fallback은 호출하지 않고, 기존 transcript fallback은 author-comment 보충 후 기존 조건에서만 이어진다 <!-- omo:id=accept-no-other-fallbacks;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 (author comment fallback 시도 중 기존 추출 진행 UI 유지) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (description/comment 모두 recipe 없음 → 기존 empty/blocked 안내) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (필수 provider 실패/validation 실패 → 기존 error 흐름 유지) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (401 → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리 흐름이 있다 (409 consumed/mismatch → error modal) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] 세션 만료(410) 처리가 올바르다 <!-- omo:id=accept-session-expired;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 (session ownership) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 파생 필드와 비정규화 값이 맞다 (`extraction_meta_json`, `draft_json`, `extraction_methods`) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [x] raw YouTube URL/source text/comment text를 운영 이벤트 로그에 저장하지 않는다 <!-- omo:id=accept-operational-log-minimized;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 신규 system row가 필요 없음을 확인했다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
- [x] `YOUTUBE_API_KEY` 부재 시 author-comment fallback만 비활성/진단되고 기존 정책과 충돌하지 않는다 <!-- omo:id=accept-youtube-key-gate;stage=2;scope=backend;review=3,6 -->

## Regression Protection

- [x] 기존 slice 27/27b parser/corpus tests가 regression 없이 통과한다 <!-- omo:id=accept-corpus-regression;stage=2;scope=backend;review=3,6 -->
- [x] 기존 description-only registration-ready 영상은 comment provider 호출 없이 기존 결과를 유지한다 <!-- omo:id=accept-description-only-compat;stage=2;scope=backend;review=3,6 -->
- [x] dictionary resolution rate가 기존 baseline 이하로 떨어지지 않는다 <!-- omo:id=accept-resolution-no-regress;stage=2;scope=backend;review=3,6 -->
- [x] `POST /extract` 응답 shape이 변경되지 않았다 <!-- omo:id=accept-extract-shape-compat;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: 사용자 또는 수동 QA 담당자
- environment: `pnpm dev:demo` (local Supabase + demo dataset)
- scenarios:
  1. PR #619 author-comment candidate 10건 → extract → 작성자 댓글 fallback 사용 여부 확인
  2. description registration-ready 영상 → comment provider skip 확인
  3. comments disabled 영상 → description-only graceful degradation 확인
  4. 작성자 댓글 없는 영상 → 기존 empty/partial 처리 확인
  5. 작성자 댓글은 있지만 홍보/해시태그뿐인 영상 → parser input 미사용 확인
  6. 작성자 댓글 fallback으로 draft 생성된 영상 → 검수 후 등록까지 full flow 확인

## Automation Split

### Vitest

- [x] AuthorCommentProvider adapter / official provider request shape 테스트 <!-- omo:id=accept-vitest-provider;stage=2;scope=backend;review=3,6 -->
- [x] author-only top-level filter 테스트 <!-- omo:id=accept-vitest-author-filter;stage=2;scope=backend;review=3,6 -->
- [x] non-author/reply 무시 negative test <!-- omo:id=accept-vitest-non-author-negative;stage=2;scope=backend;review=3,6 -->
- [x] recipe signal pre-filter 테스트 <!-- omo:id=accept-vitest-recipe-signal;stage=2;scope=backend;review=3,6 -->
- [x] fallback trigger/skip 조건 테스트 <!-- omo:id=accept-vitest-trigger-skip;stage=2;scope=backend;review=3,6 -->
- [x] source merge policy 테스트 <!-- omo:id=accept-vitest-source-merge;stage=2;scope=backend;review=3,6 -->
- [x] provider failure graceful degradation 테스트 <!-- omo:id=accept-vitest-provider-degrade;stage=2;scope=backend;review=3,6 -->
- [x] extraction_methods 정직성 테스트 <!-- omo:id=accept-vitest-methods-honesty;stage=2;scope=shared;review=3,6 -->
- [x] 기존 corpus/readiness/dictionary regression 하네스 통과 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] Author-comment fallback fixture-backed full flow E2E <!-- omo:id=accept-playwright-author-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] Description-ready skip path E2E 또는 component test <!-- omo:id=accept-playwright-description-ready;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 description-only YT_IMPORT flow regression E2E <!-- omo:id=accept-playwright-description-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 실제 YouTube comments API를 사용한 author-comment fallback live smoke 30건 이상
- [ ] YouTube comments API quota 소진 시 graceful degradation 확인
- [ ] 인기 영상에서 author comment가 relevance 첫 페이지에 없는 경우의 missed fallback 확인

## Stage 2 Automation Evidence

- `pnpm vitest run tests/youtube-import.backend.test.ts` — 50 passed
- `pnpm typecheck` — passed
- `pnpm lint` — passed
- `pnpm test:youtube-corpus` — 9 passed
- `pnpm test:youtube-readiness` — 1 passed
- `pnpm test:youtube-dictionary` — 10 passed
- `pnpm test:product` — 796 passed
- `pnpm validate:workpack` — passed
- `BRANCH_NAME=feature/be-29-youtube-author-comment-fallback BASE_REF=master PR_IS_DRAFT=false pnpm validate:closeout-sync` — passed
- `pnpm build` — passed
- `youtube-author-comment-live-smoke` — 3 sampled URLs, official YouTube comments API path available, author recipe-signal comments found in 3/3 (`live-smoke-author-comment-stage2-2026-05-29.md`)
- Claude Stage 2 backend review — `APPROVE`, `NO_FURTHER_REASONABLE_IMPROVEMENTS`

Stage 2 precondition notes:

- `accept-real-db-ready`: no new DDL/system seed is required; existing schema/bootstrap prerequisites are covered by schema baseline tests and `pnpm build`. Real URL smoke remains Manual Only.
- `accept-youtube-key-gate`: production extraction still requires `YOUTUBE_API_KEY` for the existing required `videos.list` provider before optional author-comment fallback can run; this PR adds no new fatal key path beyond that existing upstream gate.
