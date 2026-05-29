# Slice: 29-youtube-author-comment-fallback

## Goal
YouTube 설명란이 비어 있거나 설명란만으로 구체 재료/조리 과정이 부족한 영상에서, 영상 작성자가 남긴 top-level 댓글만 보조 source로 사용해 레시피 draft를 더 많이 생성한다. 일반 시청자 댓글은 사용하지 않고, 작성자 댓글이 실제 재료 또는 조리 과정 추출에 기여한 경우에만 source로 기록한다. 이 슬라이스는 transcript/OCR/LLM 결정을 미루고, 공식 YouTube comments API와 기존 결정론 파서를 재사용해 안전한 author-comment fallback만 닫는다.

## Branches

- 백엔드: `feature/be-29-youtube-author-comment-fallback`
- 프론트엔드: `feature/fe-29-youtube-author-comment-fallback`

## In Scope
- 화면: `YT_IMPORT` (Step 2/3에서 사용 source 표시가 필요하면 `author_comment` label 추가)
- API:
  - `POST /recipes/youtube/extract` — description-first 추출 후 필요한 경우 author-comment fallback을 시도한다. 응답 shape는 변경하지 않는다.
  - `POST /recipes/youtube/register` — 기존 session/RPC 등록 계약 유지. 세션에 기록된 `extraction_methods` provenance를 그대로 저장한다.
- 상태 전이: 변경 없음 (`draft` → `consumed` / `expired`)
- DB 영향:
  - `youtube_extraction_sessions.extraction_methods` — 기존 text[] 컬럼에 `"author_comment"` 값을 포함할 수 있다. 작성자 댓글이 실제 재료 또는 step 추출에 기여한 경우에만 포함한다.
  - `youtube_extraction_sessions.extraction_meta_json` — author comment 시도 여부, 후보 수, 사용 여부, comments disabled/provider error/failure reason, page cap, estimated quota metadata를 기록한다.
  - `youtube_extraction_sessions.draft_json` — 작성자 댓글에서 보충된 ingredients/steps를 기존 draft shape로 저장한다.
  - `youtube_extraction_sessions.raw_source_text` — 기존 설명란 원문 보존 계약 유지. 작성자 댓글이 실제 추출에 사용된 경우에만 `--- author comment ---` 구분자 뒤에 사용된 댓글 원문을 저장한다. 사용하지 않은 후보 댓글 원문은 저장하지 않고 필요한 진단만 metadata에 요약한다.
- Schema Change:
  - [x] 없음 (DDL 변경 없음, 기존 text[]/jsonb 컬럼 활용)

## Out of Scope
- 일반 시청자 댓글, reply 댓글, pinned 여부 기반 추출
- 작성자가 reply에 남긴 레시피 추출
- 추가 pagination 또는 여러 페이지 댓글 검색
- transcript/OCR/LLM production fallback
- 외부 재료 데이터 ingest
- 설명란/댓글 모두에 구체 레시피가 없는 영상의 registration-ready 주장
- public API response shape 변경
- multi-recipe 선택 UI
- ingredient/cooking taxonomy 확장
- 신규 화면 또는 YT_IMPORT 레이아웃 재설계

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `27-youtube-import-quality-uplift` | merged | [x] |
| `27b-youtube-source-fallback` | merged | [x] |
| `pre-27-taxonomy-consumer-alignment` | merged | [x] |

> `28-external-ingredient-data-ingest-gate`는 선행 조건이 아니다. 사용자는 외부 ingest 전에 작성자 댓글 fallback을 먼저 닫기로 결정했다.

## Backend First Contract

### 기존 엔드포인트 (shape 변경 없음)
- `POST /recipes/youtube/validate` — URL 검증 + oEmbed preview (변경 없음)
- `POST /recipes/youtube/extract` — author-comment fallback 경로 추가
- `POST /recipes/youtube/ingredient-registration` — 미등록 재료 등록 (변경 없음)
- `POST /recipes/youtube/register` — 세션 기반 원자적 등록 (변경 없음)

### Author Comment Fallback 경로
- **source order**: description first, author comment second.
- **fallback order with transcript**: author comment fallback은 transcript fallback보다 먼저 시도한다. 작성자 댓글 보충 후에도 concrete step이 부족하면 기존 transcript fallback 조건에 따라 transcript fallback을 이어서 시도할 수 있다.
- **skip condition**: description 결과가 이미 registration-ready이면 댓글 API를 호출하지 않는다.
- **trigger condition**:
  - description에서 재료와 step이 모두 비어 있거나,
  - description에서 재료는 일부 있지만 concrete step instruction이 없거나,
  - description 결과가 `missing_steps`/step-blocked로 등록 불가인 경우.
- **provider call**: official YouTube Data API `commentThreads.list`.
  - `part=snippet`
  - `videoId=<youtube_video_id>`
  - `textFormat=plainText`
  - `order=relevance`
  - `maxResults=100`
  - 1 page only, 추가 pagination 금지
- **author-only filter**:
  - `topLevelComment.snippet.authorChannelId.value === video.snippet.channelId`인 top-level comment만 후보로 사용한다.
  - 일반 시청자 댓글과 replies는 parser input에 넣지 않는다.
  - 공식 API에서 pinned 여부를 core gate로 쓰지 않는다.
- **recipe signal pre-filter**:
  - 빈 댓글, 너무 짧은 댓글, 홍보/구독/링크/해시태그 중심 댓글은 폐기한다.
  - parser input 전 최소한 재료/수량/단위/조리동사/번호형 단계 중 충분한 recipe signal을 요구한다.
  - 여러 작성자 댓글이 있으면 recipe signal이 가장 강한 댓글 또는 연결 가능한 작성자 댓글 묶음만 사용한다.
- **merge policy**:
  - description이 재료를 제공하고 author comment가 step을 제공하면 step을 보충한다.
  - description이 비어 있고 author comment가 충분한 재료/step을 제공하면 author comment 기반 draft를 만든다.
  - description과 author comment가 충돌하면 description 값을 우선하고, author comment는 누락된 field 보충에 사용한다.
- **source honesty**:
  - `"author_comment"`는 작성자 댓글이 실제 ingredients 또는 steps에 기여한 경우에만 `extraction_methods`에 포함한다.
  - 시도만 했거나 recipe signal이 없거나 provider가 실패한 경우에는 포함하지 않는다.
- **source_providers**:
  - author comment fallback을 시도하면 `comment_threads_api`를 provider 진단에 기록한다.
  - author-only 필터를 통과한 댓글이 parser input으로 쓰이면 `author_comment_filter`와 `author_comment_parser`를 source provider에 포함한다.
  - provider를 시도했지만 사용하지 않은 경우에는 `extraction_methods`에 `author_comment`를 넣지 않는다.

### 응답 envelope
- `{ success, data, error }` 기존 형식 유지
- `data.ingredients[]` shape 불변
- `data.steps[]` shape 불변
- `data.extraction_methods` = `["description"]`, `["author_comment"]`, `["description", "author_comment"]` 중 실제 기여 source만 포함
- `data.blocking_issues` — 기존 배열 유지. 작성자 댓글 fallback 이후에도 필수 step/재료가 부족하면 등록 차단

### 에러 응답 (기존)
| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 미인증 |
| 404 | FEATURE_DISABLED | feature flag off |
| 404 | EXTRACTION_NOT_FOUND | 세션 없음 또는 cross-user |
| 409 | EXTRACTION_ALREADY_REGISTERED | 이미 consumed |
| 409 | EXTRACTION_MISMATCH | video ID 불일치 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | INVALID_URL | URL 형식 오류 |
| 422 | NOT_RECIPE_VIDEO | non_recipe classification |
| 422 | VALIDATION_ERROR | 입력 검증 실패 |
| 429 | QUOTA_EXCEEDED | 기존 `videos.list` quota 소진 또는 필수 provider quota 소진 |
| 502 | PROVIDER_ERROR | 기존 필수 YouTube provider 호출 실패 |

> Author comment provider 실패, comments disabled, 댓글 없음, recipe signal 없음은 extract 실패가 아니다. description-only 또는 partial draft로 graceful degradation하고 `extraction_meta_json`에 진단만 기록한다.

### 권한 / 소유자 검증
- 기존 정책 유지: 로그인 필수, feature flag guard
- session ownership validation 변경 없음
- cross-user → 404, expired → 410, consumed → 409

### 멱등성
- extract 재호출 시 새 세션 생성 (기존 동작 유지)
- register는 consumed session 재사용을 409로 막는다.

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함
- FE 변경 범위:
  - `extraction_methods` 표시 label에 `author_comment: "작성자 댓글"` 추가
  - 작성자 댓글이 사용되지 않았으면 사용자에게 사용된 것처럼 표시하지 않는다.
  - comments disabled/provider error는 사용자가 고칠 수 없는 진단이므로 기존 error screen으로 보내지 않는다.

> 기존 YT_IMPORT 내부 label/copy 수준의 low-risk 변경이다. 신규 화면이나 레이아웃 재설계는 없다.

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음 (YT_IMPORT 내부 source label 추가)
- Visual artifact: 없음 (기존 YT_IMPORT 화면 유지)
- Authority status: `not-required`
- Notes: design-generator / design-critic 생략. 기존 confirmed 화면의 source label/상태 문구 추가에 한정한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — low-risk 내부 label/copy 변경, 신규 화면/레이아웃 변경 없음
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Stage 4 Frontend Evidence

- YT_IMPORT 검수 chip label map에 `author_comment: "작성자 댓글"`을 추가했다.
- `tests/menu-add-screen.test.tsx`로 라벨 회귀를 고정했다.
- `tests/e2e/slice-29-youtube-author-comment-fallback.spec.ts`로 author-comment fixture full flow, loading state, 409 conflict error modal, description-ready skip label을 고정했다.
- 추출 진행 UI 단계는 신규 단계를 추가하지 않기로 결정했다. 현재 프론트는 backend 내부 fallback source별 진행률을 알지 못하고, 사용자-facing 요구는 review chip의 source honesty로 닫는다.
- 30 URL provider-level live smoke는 `live-smoke-author-comment-closeout-2026-05-29.md`에 기록했다.
- 30 URL real app-route smoke는 `real-app-route-smoke-2026-05-29.md`에 기록했다. 실제 Supabase Auth session, 실제 앱 route, 실제 YouTube provider, DB 검증, cleanup을 사용했다.
- 2026-05-30 seed promotion 후 30 URL real app-route smoke는 `real-app-route-smoke-2026-05-30.md`에 기록했다. 첫 seed promotion 직후 `register 9/30`이었고, register blocker dictionary seed + false ingredient inference fix 후 `register 13/30`, cleanup remaining rows 0을 확인했다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.3.md` — §2-4 YouTube Recipe Extraction Policy (`설명란/고정댓글 파싱`)
- `docs/화면정의서-v1.5.10.md` — §10 YT_IMPORT Screen
- `docs/유저flow맵-v1.3.10.md` — §⑨ YouTube Recipe Registration Journey
- `docs/db설계-v1.3.9.md` — §4-2 youtube_extraction_sessions
- `docs/api문서-v1.2.13.md` — §6 YouTube Recipe Import
- `docs/workpacks/27-youtube-import-quality-uplift/live-smoke-author-comment-baseline-2026-05-29.md`
- `docs/workpacks/29-youtube-author-comment-fallback/live-smoke-author-comment-stage2-2026-05-29.md`
- `docs/workpacks/29-youtube-author-comment-fallback/live-smoke-author-comment-closeout-2026-05-29.md`
- `docs/workpacks/29-youtube-author-comment-fallback/real-app-route-smoke-2026-05-29.md`
- `.omx/plans/youtube-author-comment-fallback-ralplan-20260529.md`

## QA / Test Data Plan

### Fixture Baseline
- 기존 slice 27/27b YouTube corpus와 backend tests 유지
- 신규 author-comment fixture 추가:
  - description empty + author comment recipe → ingredients/steps draft
  - description ingredients only + author comment steps → step 보충
  - description registration-ready → comment provider not called
  - non-author top-level comment recipe → 무시
  - author promotional/comment-only text → 무시
  - comments disabled/provider failure → description-only degrade
  - multiple author comments → recipe signal이 가장 강한 후보 선택

### CI Safety
- 기본 CI는 fixture/mock 기반으로 동작한다.
- live YouTube comments API는 Manual Only 또는 별도 smoke script로 분리한다.
- LLM 호출 없음.

### Manual QA Handoff
- 작성자 댓글 사용 fixture: URL 입력 → extract → `작성자 댓글` chip 확인 → 재료/만들기 확인 → 등록 완료.
- description-ready skip fixture: URL 입력 → extract → `설명란` chip만 표시되고 `작성자 댓글` chip은 없어야 한다.
- loading state: extract 응답 지연 중 기존 `설명란 분석` 진행 UI가 유지되어야 한다.
- empty state: 재료/만들기가 모두 비어 있으면 등록 버튼이 비활성이고 부족 항목 안내가 보여야 한다.
- error/conflict state: register 409/410/500은 기존 등록 실패 modal로 표시되고 성공 화면으로 넘어가지 않아야 한다.
- unauthorized state: guest는 `/login?next=...`로 이동하고 return-to-action query를 보존해야 한다.

### Real DB / Live Smoke
- `pnpm dev:demo` — local demo 환경에서 실제 YouTube URL 테스트
- author-comment candidate 10건은 PR #619 smoke report의 후보를 우선 사용한다.
- 2026-05-29 closeout smoke에서 30건을 실제 앱 route로 검증했다:
  - `validate` route ok: 30/30
  - `extract` route ok: 30/30
  - review screen reached: 30/30
  - `author_comment` used: 4/30
  - register attempted/succeeded: 13/13
  - cleanup: generated recipes 13건 + extraction sessions 30건 삭제, post-cleanup remaining rows 0
  - fixes from this smoke: author-comment dictionary aliases, duplicate ingredient rows during register, exact-standard ingredient resolution, unmatched trailing parenthesis parsing, oEmbed validate fallback
  - remaining blocked drafts are mostly empty/partial extraction or missing first step; one unresolved dictionary item remains (`배`)
- 최종 closeout에서 30건 이상 real URL로 provider-level 재측정했다:
  - `videos.list` success count
  - `commentThreads.list` success/error count
  - author top-level comment present count
  - author recipe-signal comment count
  - description signal 없음 + author recipe signal 있음 count

### Seed / Migration
- 신규 DDL 없음.
- 재료 사전 seed는 이 슬라이스 기본 범위가 아니다. author comment에서 새 unresolved 재료가 드러나면 기존 미등록 재료 등록 flow로 처리한다.

### Blocker 조건
- `YOUTUBE_API_KEY` 부재
- `youtube_extraction_sessions` 테이블 부재
- `ingredients` / `ingredient_synonyms` / `cooking_methods` 테이블 부재
- YouTube comments API가 403/429로 author-comment fallback 전체를 사용할 수 없는 상태
- parser fixture baseline 부재

## Key Rules

1. **Author-Only**: video author top-level comment만 사용한다. 일반 댓글과 replies는 사용하지 않는다.
2. **Description-First**: description 결과가 이미 등록 가능하면 comment quota를 쓰지 않는다.
3. **One Page Cap**: `order=relevance`, `maxResults=100`, 1 page only. MVP에서 pagination 금지.
4. **No Pinned Dependency**: pinned 여부를 core gate로 신뢰하지 않는다.
5. **Recipe Signal Required**: 작성자 댓글이어도 recipe signal이 없으면 parser input으로 쓰지 않는다.
6. **Source Honesty**: 실제 추출에 기여한 경우에만 `author_comment`를 `extraction_methods`에 기록한다.
7. **Graceful Degradation**: comments disabled/provider error/댓글 없음은 extract 실패로 만들지 않는다.
8. **No False Ready**: 구체 재료와 조리 단계가 없으면 registration-ready로 주장하지 않는다.
9. **API Shape 불변**: 응답 필드 구조는 바꾸지 않는다.
10. **Session Contract 유지**: 24h TTL, ownership validation, RPC atomic registration 불변.
11. **Taxonomy Freeze Contract**: legacy 7 ingredient category 유지.
12. **No LLM/OCR/Transcript Expansion**: 이 슬라이스는 작성자 댓글 fallback만 닫는다.

## Contract Evolution Candidates (Optional)

### Official docs value enumeration follow-up
- 현재 계약: 공식 요구사항은 `설명란/고정댓글 파싱`을 포함하지만, API/DB 문서 예시는 `extraction_methods: ["description"]` 중심으로 남아 있다.
- 제안 계약: 후속 contract-evolution에서 `author_comment`를 `extraction_methods`의 허용 source 값으로 공식 예시에 추가한다.
- 기대 사용자 가치: API 소비자와 운영자가 source provenance를 오해하지 않는다.
- 영향 문서: `docs/api문서-*`, `docs/db설계-*`, `docs/화면정의서-*`, `docs/유저flow맵-*`, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- 승인 상태: 보류. 이 슬라이스는 기존 text[] shape와 요구사항의 고정댓글 파싱 범위 안에서 구현한다.

## Primary User Path
1. 사용자가 `/menu/add/youtube`에서 YouTube URL을 입력한다.
2. 서버가 validate 후 extract를 실행하고, 먼저 description을 파싱한다.
3. description만으로 등록 가능하지 않으면 서버가 작성자 top-level 댓글 1페이지를 조회한다.
4. 작성자 댓글에 recipe signal이 있으면 기존 parser로 재료/조리 과정을 보충한다.
5. 검수 화면은 실제 사용된 source만 표시하고, 부족한 항목은 기존 수정/미등록 재료 등록/step 추가 flow로 해결한다.
6. 사용자가 검수 후 등록하면 기존 session/RPC 경로로 YouTube recipe가 저장된다.

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] AuthorCommentProvider adapter 구현 <!-- omo:id=delivery-author-comment-provider;stage=2;scope=backend;review=3,6 -->
- [x] author-only top-level filtering 구현 <!-- omo:id=delivery-author-only-filter;stage=2;scope=backend;review=3,6 -->
- [x] recipe signal pre-filter 구현 <!-- omo:id=delivery-recipe-signal-filter;stage=2;scope=backend;review=3,6 -->
- [x] description-first trigger/skip 조건 구현 <!-- omo:id=delivery-trigger-skip;stage=2;scope=backend;review=3,6 -->
- [x] source merge policy 구현 <!-- omo:id=delivery-source-merge;stage=2;scope=backend;review=3,6 -->
- [x] extraction methods/source metadata 정직성 구현 <!-- omo:id=delivery-source-honesty;stage=2;scope=shared;review=3,6 -->
- [x] provider graceful degradation 구현 <!-- omo:id=delivery-provider-degrade;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI source label 연결 <!-- omo:id=delivery-ui-source-label;stage=4;scope=frontend;review=5,6 -->
- [x] 추출 진행 UI 단계에 작성자 댓글 확인 단계 추가 여부 결정 <!-- omo:id=delivery-extraction-stage-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 live smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] 30건 이상 live smoke closeout 재측정 <!-- omo:id=delivery-final-live-smoke;stage=4;scope=shared;review=6 -->
