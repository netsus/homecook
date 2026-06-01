# Slice: 32-youtube-visual-quantity-enrichment

## Goal
YouTube 레시피 영상에서 공개 텍스트(설명란/작성자 댓글/자막) 추출만으로 빠지는 재료 수량을 화면 속 수량 텍스트 기반으로 보강한다. 특정 영상 ID 고정 fixture나 레시피오 결과 복사 없이 범용 레시피 영상에 대해 추출 품질을 높이되, 추정/추론 수량은 사용자 확인 없이 등록되지 않는다.

## Branches

- 백엔드: `feature/be-32-youtube-visual-quantity-enrichment`
- 프론트엔드: `feature/fe-32-youtube-visual-quantity-enrichment`

## In Scope
- 화면: YT_IMPORT 검수 화면 — 수량 provenance 배지, 수량 확인/수정/삭제 인터랙션, quick import 차단 UX
- API:
  - `POST /api/v1/recipes/youtube/extract` — 응답 `ingredients[]`에 `quantity_*` review fields 추가
  - `POST /api/v1/recipes/youtube/register` — `draft_ingredient_id` + `quantity_confirmation_status` 검증
  - `POST /api/v1/recipes/youtube/candidate-drafts` — quantity fields 전파
- 상태 전이:
  - extract → draft에 `quantity_review_required` 설정
  - register 시 `quantity_confirmation_status` 서버 검증
  - quick import에서 `quantity_review_required=true`가 있으면 auto-register 차단 → 검수 화면 fallback
- DB 영향:
  - `youtube_extraction_sessions` — `draft_json.ingredients[]`에 `quantity_*` fields 저장
  - `youtube_visual_extraction_cache` — 신규 서버 전용 테이블
  - `youtube_visual_extraction_events` — 신규 서버 전용 테이블
  - `recipe_sources.extraction_meta_json` — `quantity_enrichment_summary` 추가
  - `recipe_sources.extraction_methods` — 기존 mismatch 정리 (실제 YouTube session 값 `description | comment | caption`에 맞춤)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<timestamp>_32_youtube_visual_extraction_cache_and_events.sql` 생성 필요

## Out of Scope
- `recipe_ingredients` / `recipe_steps` per-row durable provenance columns
- `shopping_list_items` aggregation 변경 또는 shopping lineage
- cook-mode / detail API provenance 표시 변경
- ASR / STT (음성 인식)
- selected-frame OCR / Cloud Vision
- video ID fixture / 레시피오 결과 copy
- `OEassmynRro` 하드코딩
- 이미지 기반 step 생성 (visual step filling은 명시적 on-screen 텍스트만 허용)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `23-youtube-quality-corpus` | merged | [x] |
| `24-youtube-parser-dictionary-hardening` | merged | [x] |
| `27-youtube-import-quality-uplift` | merged | [x] |
| `27b-youtube-source-fallback` | merged | [x] |
| `29-youtube-author-comment-fallback` | merged | [x] |
| `31-recipe-media-tags` | in-progress | [ ] |

> `31-recipe-media-tags`는 YouTube extract/register에 thumbnail/tags 계약을 추가 중이지만, 이 슬라이스의 quantity enrichment는 thumbnail/tags와 직교한다. 31이 먼저 merge된 뒤 rebase해서 충돌을 해결한다.

## Backend First Contract

### `POST /api/v1/recipes/youtube/extract` 응답 확장

`ingredients[]` 각 항목에 optional review fields 추가:

```ts
type YoutubeQuantitySource =
  | "text_explicit"
  | "visual_explicit"
  | "unit_normalized"
  | "ingredient_default"
  | "recipe_inferred"
  | "user_entered"
  | "unknown";

interface YoutubeQuantityEvidenceRef {
  source_method: "description" | "comment" | "caption" | "visual";
  source_provider: string;
  line_index?: number | null;
  start_ms?: number | null;
  end_ms?: number | null;
  frame_ts_ms?: number | null;
  snippet: string;
  locator_hash?: string | null;
}

// YoutubeExtractedIngredient 확장 (optional fields)
quantity_source?: YoutubeQuantitySource;
quantity_confidence?: number | null;
quantity_raw_text?: string | null;
quantity_evidence_refs?: YoutubeQuantityEvidenceRef[];
quantity_review_required?: boolean;
quantity_user_confirmed?: boolean;
```

이 fields는 아래 경로에 모두 전파된다:
- top-level `ingredients[]`
- `recipe_candidates[].ingredients[]`
- parent `multi_parent` session `draft_json`
- selected `candidate_child` session `draft_json`
- `POST /api/v1/recipes/youtube/candidate-drafts` response

### `POST /api/v1/recipes/youtube/register` 확장

`YoutubeRecipeRegisterIngredientInput`에 YouTube 전용 fields 추가:

```ts
type YoutubeQuantityConfirmationStatus =
  | "not_required"
  | "confirmed_suggestion"
  | "edited_quantity"
  | "cleared_to_taste";

// register input 확장
draft_ingredient_id: string;
quantity_confirmation_status: YoutubeQuantityConfirmationStatus;
```

서버 검증 규칙:

1. **`not_required`**: matching draft ingredient의 `quantity_review_required=false`일 때만 허용
2. **`confirmed_suggestion`**: 사용자가 YT_IMPORT에서 기존 제안을 명시 확인했고 body가 draft suggestion과 canonical match할 때만 허용
3. **`edited_quantity`**: 사용자가 유효한 `QUANT` amount/unit으로 수정하거나 비어 있던 수량을 채웠을 때 허용
4. **`cleared_to_taste`**: `ingredient_type="TO_TASTE"` + `amount=null` + `unit=null`일 때 허용
5. **`recipe_inferred`**: 항상 `quantity_review_required=true`로 시작. human confirmation/edit/clear 없이는 register/quick auto-register 불가

클라이언트가 보낸 `quantity_review_required`는 신뢰하지 않는다. 서버가 session draft의 `draft_ingredient_id` 기준으로 판정한다.

**에러**: review-required 수량을 `not_required`로 보내면 `422 VALIDATION_ERROR` (`fields: [{ field: "quantity_review_required" }]`)

### Error Cases

| 상황 | 코드 | 응답 |
| --- | --- | --- |
| 인증 없음 | 401 | UNAUTHORIZED |
| 세션 소유자 불일치 | 403 | FORBIDDEN |
| 세션 없음 / 만료 / 소비됨 | 404 / 410 / 409 | SESSION_NOT_FOUND / SESSION_EXPIRED / SESSION_CONSUMED |
| review-required를 not_required로 보냄 | 422 | VALIDATION_ERROR — `quantity_review_required` |
| 유효하지 않은 confirmation body | 422 | VALIDATION_ERROR |

### Visual Quantity Extractor Provider

- 새 provider boundary: `visual_quantity_extractor`
- 첫 adapter: Gemini video understanding / public YouTube URL
- Gate: `YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=true` + API key/config + user/day quota + cache miss + timeout budget
- `extraction_methods`에는 추가하지 않음 (기존 `description | comment | caption` 유지)
- `source_providers`에 `visual_quantity_extractor` 또는 `visual_quantity_extractor_cache` 기록
- `extraction_meta_json.visual_quantity_extractor`에 provider/model/cache/status/enriched_count 기록
- 기존 Gemini text structured fallback과 별도로 운영

### Resolver Priority (enrichment 후 quantity 결정 순서)

1. 기존 공개 텍스트 명시 수량 (`text_explicit`)
2. 화면 속 명시 수량 (`visual_explicit`)
3. raw explicit evidence 기반 단위 변환 (`unit_normalized`) — 예: `1/2 종이컵` → 95~100ml
4. 명시 count evidence 기반 재료 기본값 (`ingredient_default`) — 예: `두부 1모` → 300g
5. 레시피 추론 (`recipe_inferred`) — review-only, auto-register 불가

### Cache/Event Tables

기존 `youtube_llm_extraction_cache` / `youtube_llm_extraction_events`는 text structured fallback 전용이므로 재사용하지 않는다.

**`youtube_visual_extraction_cache`**:
- unique key: `(youtube_video_id, provider, schema_version, visual_request_hash)`
- sanitized structured result만 저장
- raw video/frame/provider response/secret/레시피오 data 저장 금지

**`youtube_visual_extraction_events`**:
- event_type: `attempted | cache_hit | quota_denied | success | error`
- user/day quota 집계용
- raw provider response/secret 저장 금지

### Register Provenance Summary

등록 성공 시 `recipe_sources.extraction_meta_json.quantity_enrichment_summary`에 요약 저장:
- provider, cache_hit, trigger_reason, enriched_count, review_required_count, schema_version
- per-row durable provenance는 v1에서 추가하지 않음

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함
- YT_IMPORT 검수 화면에 수량 provenance 배지 표시: `텍스트 확인`, `화면 확인`, `단위 변환`, `기본값`, `추정`
- review-required 수량은 confirm/edit/clear 인터랙션 필수
- quick import에서 `quantity_review_required=true`가 있으면 auto-register 차단 → 검수 화면 fallback

## Design Authority
- UI risk: `low-risk` — 기존 YT_IMPORT 검수 화면에 배지/인터랙션 추가
- Anchor screen dependency: 없음
- Visual artifact: N/A (low-risk, 기존 화면 내 소규모 UI 추가)
- Authority status: `not-required`
- Notes: YT_IMPORT 화면 구조 변경 없이 ingredient row 내 배지와 confirm/edit/clear 인터랙션 추가
- Evidence: `ui/designs/evidence/32-youtube-visual-quantity-enrichment/review-quantity-confirm-desktop.png`

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review 또는 low-risk 판단에 따라 confirmed 유지
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — low-risk UI change, 기존 YT_IMPORT 화면 구조 유지, Claude review OK
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값) → Stage 4 완료 후 low-risk UI change로 `confirmed` 유지 가능 (PR 본문에 low-risk 판단 근거 기록). 기존 YT_IMPORT 검수 화면에 배지/인터랙션을 추가하는 수준이므로 화면 구조 변경 없음.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `.omx/plans/youtube-visual-quantity-extraction-ralplan-20260602.md`
- `.omx/plans/prd-youtube-visual-quantity-extraction.md`
- `.omx/plans/test-spec-youtube-visual-quantity-extraction.md`

## QA / Test Data Plan
- **fixture baseline**: `tests/fixtures/youtube-visual-quantity/visual-quantity-v1.json` — text-only baseline, visual overlay, unit normalization, ingredient default, recipe inferred, multi-recipe candidate, provider disabled/failure
- **real DB smoke**: `pnpm dev:demo` 또는 `pnpm dev:local-supabase`에서 `youtube_visual_extraction_cache`/`events` 테이블이 존재하고 RLS가 적용되는지 확인
- **seed / reset**: visual extraction cache/events는 seed 불필요 (테스트는 fixture 기반)
- **bootstrap 의존**: 기존 YouTube extraction sessions 테이블 필요 (선행 슬라이스에서 생성됨)
- **blocker 조건**: `31-recipe-media-tags` merge 후 rebase 필요

### 테스트 실행

```bash
pnpm test -- tests/youtube-visual-quantity-eval.test.ts tests/youtube-import.backend.test.ts tests/youtube-corpus.test.ts
pnpm verify:backend
```

### Pass Gates

- triggered fixture set `amount_coverage_ratio`가 public-text baseline 대비 절대 `+0.25` 이상 개선
- `false_explicit_count = 0` — explicit evidence 없는 explicit quantity 금지
- `recipe_inferred`는 human confirmation 없이 register 불가
- quick import는 `quantity_review_required=true`가 하나라도 있으면 auto-register 차단
- `OEassmynRro` / Recipio hardcoding 금지 (source scan)

### Live Smoke

`https://www.youtube.com/watch?v=OEassmynRro`에서:
- 두부 300g — 근거와 함께 reviewable
- 간장 2큰술 — 근거와 함께 reviewable
- 물 1/2 종이컵 (95~100ml 정책 범위) — raw text 보존, canonical 변환 reviewable

## Key Rules

### Extraction Methods 정책
- `extraction_methods`는 v1에서 `description | comment | caption`만 허용
- visual enrichment는 원천 extraction method가 아니라 `source_providers`와 `extraction_meta_json.visual_quantity_extractor`에 기록
- `recipe_sources.extraction_methods`의 기존 mismatch (`ocr/asr/estimation/manual` 설명)를 실제 YouTube session 값(`description | comment | caption`)에 맞게 정리

### Quantity Source 규칙
- `text_explicit`, `visual_explicit`만 explicit fact
- `unit_normalized`는 raw explicit evidence가 있을 때만 허용
- `ingredient_default`는 명시 count evidence가 있을 때만 허용 (예: `두부 1모`)
- `recipe_inferred`는 review-only — quick auto-register를 unblock하지 못함
- `user_entered`는 사용자가 수정/확인/clear한 결과의 server summary source

### Register 검증
- 서버는 클라이언트가 보낸 `quantity_review_required`를 신뢰하지 않음
- `draft_ingredient_id` 기준으로 session draft에서 원본 review 상태를 조회해 판정
- `multi_parent` 세션은 직접 register 불가 (기존 규칙 유지)

### Visual Extractor Gate
- `YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=true` env gate 필수
- user/day quota gate
- cache-first 정책
- 실패 시 public-text-only 결과로 fallback (에러 전파 없음)

### 저장 금지 항목
- raw video / raw frame / raw provider response
- API key / secret
- 레시피오 data

## Primary User Path
1. 사용자가 YouTube URL을 입력하고 추출을 시작한다
2. 서버가 공개 텍스트 추출 → (조건 충족 시) visual quantity enrichment를 실행하고, 각 재료에 `quantity_source`와 `quantity_review_required`를 설정한다
3. YT_IMPORT 검수 화면에서 사용자가 수량 provenance 배지를 확인하고, review-required 수량을 confirm/edit/clear한다
4. 모든 review-required 수량이 해결된 후 저장 버튼이 활성화되고, 서버가 `quantity_confirmation_status`를 검증하여 등록한다

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] 백엔드 계약 고정 (quantity fields, confirmation status, visual cache/events) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] Visual quantity extractor provider/adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (`YoutubeQuantitySource`, `YoutubeQuantityConfirmationStatus`, `YoutubeQuantityEvidenceRef`) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 (YT_IMPORT 수량 배지, confirm/edit/clear, quick import 차단) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (register confirmation rules, review-required 검증) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (youtube_visual_extraction_cache/events DDL) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] `recipe_sources.extraction_methods` mismatch 정리 (`ocr/asr/estimation/manual` → `description/comment/caption` 기준) <!-- omo:id=delivery-extraction-methods-fix;stage=2;scope=backend;review=3,6 -->
- [x] eval harness (`youtube-visual-quantity-eval.test.ts`) + fixture 구축 <!-- omo:id=delivery-eval-harness;stage=2;scope=backend;review=3,6 -->
- [x] `amount_coverage_ratio` +0.25 gate 통과 <!-- omo:id=delivery-coverage-gate;stage=2;scope=backend;review=3,6 -->
- [x] `false_explicit_count=0` gate 통과 <!-- omo:id=delivery-false-explicit-gate;stage=2;scope=backend;review=3,6 -->
- [x] `OEassmynRro` / Recipio hardcoding source scan 통과 <!-- omo:id=delivery-no-hardcoding;stage=2;scope=shared;review=3,6 -->
