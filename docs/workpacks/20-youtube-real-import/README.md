# Slice: 20-youtube-real-import

## Goal

슬라이스 19의 deterministic stub 추출을 실제 YouTube Data API 기반 description-first 추출로 교체한다. 사용자가 유튜브 URL을 입력하면 YouTube `videos.list` API로 실제 영상 메타데이터와 설명란을 가져와 레시피를 추출하고, 추출 결과를 검수/수정한 뒤 레시피로 등록할 수 있다. 등록 세션은 서버에서 관리되며 24시간 만료, 소유권 검증, 원자적 등록을 보장한다. 후속 LLM/caption/ASR 확장을 위한 세션 기반 인프라를 이 슬라이스에서 잠근다.

## Supersession from Slice 19

이 슬라이스는 `19-youtube-import`의 후속 슬라이스다. 슬라이스 19는 재개하지 않는다.

**Retain (슬라이스 19에서 유지)**:
- 로그인 게이트 + return-to-action
- URL 파싱 (youtube.com, youtu.be 등)
- review-before-register 검수 흐름
- `my_added` 가상 책 반영 (`recipes.created_by + source_type='youtube'`)
- `recipe_sources` INSERT
- 라우트 가드 (`/menu/add/youtube`)
- 기존 UI/등록 흐름 골격
- feature flag 기반 베타 노출 가드

**Replace (이 슬라이스에서 교체)**:
- deterministic stub → YouTube Data API `videos.list` 기반 실제 추출
- 가짜 고정 OCR/ASR/progress → 실제 `extraction_methods` 칩과 truthful indeterminate loading
- schema-change-none 가정 → `youtube_extraction_sessions` 테이블 신설
- 클라이언트 기반 extraction_id → 서버 세션 기반 추출/등록 관리
- 직접 multi-table INSERT → Postgres RPC 원자적 등록

**Keep for tests/local only**:
- 기존 deterministic stub fixture는 테스트/로컬 fallback으로만 유지

## Branches

- 백엔드: `feature/be-20-youtube-real-import`
- 프론트엔드: `feature/fe-20-youtube-real-import`

## In Scope

- 화면: `YT_IMPORT` (기존 화면 행동 변경, 신규 화면 아님)
- API:
  - `POST /recipes/youtube/validate` — 계약 확장 (classification 3-way 추가)
  - `POST /recipes/youtube/extract` — 실제 YouTube API 기반 추출 + 서버 세션 생성
  - `POST /recipes/youtube/register` — 세션 기반 원자적 등록 (Postgres RPC)
- 상태 전이:
  - `youtube_extraction_sessions.status`: `draft` → `consumed` (등록 성공) / `expired` (24h 만료)
  - 등록 시 `recipes.source_type = 'youtube'`, `created_by = current_user.id` (기존 유지)
  - 추출 단계에서 미분류 조리방법 `cooking_methods` INSERT (기존 유지)
- DB 영향:
  - `youtube_extraction_sessions` (CREATE TABLE + INSERT)
  - `recipe_sources` (ALTER — `youtube_extraction_session_id` nullable FK 추가)
  - `recipes` (INSERT — 기존)
  - `recipe_ingredients` (INSERT — 기존)
  - `recipe_steps` (INSERT — 기존)
  - `cooking_methods` (INSERT — 미분류 조리방법, 기존)
  - `meals` (INSERT — 끼니 추가 선택 시, 기존)
- Schema Change:
  - [x] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요
    - `youtube_extraction_sessions` 테이블 신설
    - `recipe_sources.youtube_extraction_session_id` nullable FK 추가
    - `register_youtube_recipe_from_session` Postgres RPC 생성

## Out of Scope

- Caption/subtitle 다운로드 — YouTube `captions.list` (50 units, OAuth 필수) / `captions.download` (200 units, 영상 편집 권한 필요)는 비용/권한 제약으로 제외
- ASR(자동 음성 인식) 통합 — 후속 슬라이스
- LLM 기반 JSON 추출 — future flag, 이 슬라이스에서 off by default
- OCR(영상 내 재료표) — 후속 슬라이스
- 추정 레이어 고도화 (관용량, 유사 레시피, 수량 예측) — 후속 슬라이스
- Polling/SSE 기반 실시간 진행 표시 — future endpoint (`GET /recipes/youtube/extractions/{id}` 또는 SSE), 이 슬라이스에서는 단일 POST 기반 indeterminate loading
- 레시피 수정/삭제 — 후속 슬라이스
- 레시피 이미지 업로드 — 후속 슬라이스
- 공개 자막/오디오/비디오 스크래핑 — MVP 금지
- oEmbed 기반 추출 — preview/embed 전용, 레시피 추출 소스 아님
- YouTube 할당량 증가 신청 — 운영 의존
- 같은 URL 세션 재사용 — MVP에서는 매번 새 세션 생성
- `non_recipe` override — MVP에서 non_recipe 판정 시 extract 차단, override 없음

## Beta Exposure Guard

- Production에서는 `HOMECOOK_ENABLE_YOUTUBE_IMPORT=1` 또는 `NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1`이 있을 때만 `/menu/add/youtube`와 YouTube import API를 연다 (슬라이스 19 유지).
- Feature flag off: `/validate`, `/extract`, `/register` 모두 `404 FEATURE_DISABLED` 반환.
- Feature flag on + 비로그인: `401 UNAUTHORIZED`.
- `YOUTUBE_API_KEY`는 서버 전용 환경변수, 클라이언트에 노출 금지.
- Optional LLM flags/env는 future-only, 이 슬라이스에서 off by default.

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `19-youtube-import` | merged | [x] |

> 슬라이스 19의 모든 코드/테스트/인프라가 main에 merge된 후 시작한다.
> 슬라이스 01~18의 선행 의존성은 슬라이스 19가 이미 충족했으므로 생략한다.

## Backend First Contract

### Feature Flag / Auth Guard (전 엔드포인트 공통)

- Feature flag off → `404 FEATURE_DISABLED`
- Feature flag on + 비로그인 → `401 UNAUTHORIZED`

### POST /recipes/youtube/validate

유튜브 URL 검증 + 3-way classification.

- **권한**: 로그인 필수 (401)
- **Request**:
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=abc123"
}
```

- **Response 200 — recipe 판정**:
```json
{
  "success": true,
  "data": {
    "is_valid_url": true,
    "is_recipe_video": true,
    "classification_status": "recipe",
    "classification_reasons": ["description contains ingredient list and cooking steps"],
    "video_info": {
      "video_id": "abc123",
      "title": "...",
      "channel": "...",
      "thumbnail_url": "https://..."
    }
  },
  "error": null
}
```

- **Response 200 — uncertain 판정**:
```json
{
  "success": true,
  "data": {
    "is_valid_url": true,
    "is_recipe_video": true,
    "classification_status": "uncertain",
    "classification_reasons": ["description mentions food but lacks structured recipe"],
    "video_info": { "..." : "..." }
  },
  "error": null
}
```
> `uncertain`: `is_recipe_video: true`. UI에서 careful-review 경고 표시, extract/continue 허용.

- **Response 200 — non_recipe 판정**:
```json
{
  "success": true,
  "data": {
    "is_valid_url": true,
    "is_recipe_video": false,
    "classification_status": "non_recipe",
    "classification_reasons": ["video is a music video with no cooking content"],
    "video_info": { "..." : "..." }
  },
  "error": null
}
```
> `non_recipe`: `is_recipe_video: false`. UI에서 extract 차단, 다른 URL 요청. `/extract` 직접 호출 시 `422 NOT_RECIPE_VIDEO`.

- **Classification 규칙**:
  - `recipe`: 설명란에 재료/조리 단계가 명확히 존재 → continue/extract 가능, 경고 없음
  - `uncertain`: 음식 관련이지만 구조화된 레시피가 불분명 → continue/extract 가능, careful-review 경고
  - `non_recipe`: 요리와 무관한 강한 증거 (음악, 게임, 뉴스 등) → extract 차단
  - Classifier는 보수적: 약한/혼합 증거는 `uncertain`, 강한 비요리 증거만 `non_recipe`

- **Validation**: 슬라이스 19와 동일 (youtube_url 필수, 유효 URL 형식)
- **Error**:
  - `401 UNAUTHORIZED` — 비로그인
  - `404 FEATURE_DISABLED` — feature flag off
  - `404 VIDEO_NOT_FOUND` — YouTube API에서 영상 조회 불가
  - `422 INVALID_URL` — 유효하지 않은 URL 형식
  - `502 PROVIDER_ERROR` — YouTube API 오류
  - `429 QUOTA_EXCEEDED` — YouTube API 할당량 초과
- **멱등성**: 같은 URL 반복 validate해도 side effect 없음 (조회 성격)

### POST /recipes/youtube/extract

실제 YouTube API 기반 추출 + 서버 세션 생성.

- **권한**: 로그인 필수 (401)
- **Request**:
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=abc123"
}
```

- **Response 200**:
```json
{
  "success": true,
  "data": {
    "extraction_id": "uuid (= youtube_extraction_sessions.id)",
    "title": "...",
    "base_servings": 2,
    "extraction_methods": ["description"],
    "draft_warnings": ["일부 재료의 수량이 불확실합니다"],
    "blocking_issues": [],
    "ingredients": [
      {
        "standard_name": "김치",
        "amount": 200,
        "unit": "g",
        "ingredient_type": "QUANT",
        "display_text": "김치 200g",
        "ingredient_id": "uuid",
        "confidence": 0.95,
        "resolution_status": "resolved",
        "raw_text": "김치 200g"
      },
      {
        "standard_name": null,
        "amount": null,
        "unit": null,
        "ingredient_type": null,
        "display_text": null,
        "ingredient_id": null,
        "confidence": null,
        "resolution_status": "unresolved",
        "raw_text": "적당량의 양념",
        "candidates": []
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "instruction": "김치를 한입 크기로 썬다",
        "cooking_method": {
          "id": "uuid",
          "code": "prep",
          "label": "손질",
          "color_key": "gray",
          "is_new": false
        },
        "duration_text": null,
        "is_incomplete": false,
        "missing_fields": []
      }
    ],
    "new_cooking_methods": [...]
  },
  "error": null
}
```

- **Ingredient draft fields**:
  - `resolution_status`: `"resolved"` | `"needs_review"` | `"unresolved"`
  - `candidates`: (needs_review일 때) `[{ ingredient_id, standard_name, confidence }]`
  - `raw_text`: 추출 원문 (display/provenance 용, 단독 저장 불가)

- **Ingredient save gating**:
  - `resolved`: 유효한 `ingredient_id` 존재, 현재 register validation 통과
  - `needs_review`: candidates 존재, 사용자가 명시적으로 선택 또는 picker/search로 교체해야 함. 선택 전까지 save 불가
  - `unresolved`: 신뢰할 수 있는 candidate 없음, picker/search로 재료를 찾아 교체해야 함. `raw_text`는 표시/출처용이지 저장 대상 아님

- **Step draft fields**:
  - `is_incomplete`: boolean (blocking field 누락 시 true)
  - `missing_fields`: `("instruction" | "cooking_method" | "duration" | "ingredients_used")[]`

- **Step missing field effects**:
  - `instruction`, `cooking_method`: blocking (fill 필수)
  - `duration`, `ingredients_used`: warning (future docs에서 required로 바뀌지 않는 한)

- **Save unlock condition**:
  - `blocking_issues.length === 0`
  - 모든 ingredients가 `resolved`
  - blocking step fields 모두 filled
  - 기존 register validation 통과

- **서버 세션 생성**:
  - `youtube_extraction_sessions` INSERT: `status='draft'`, `expires_at=NOW()+24h`
  - `extraction_id` = `youtube_extraction_sessions.id`
  - `user_id = current_user.id` (클라이언트 공급 불가)
  - 같은 URL이어도 매번 새 세션 생성 (MVP에서 재사용 없음)

- **Validation**:
  - `youtube_url` 필수
  - 유효한 유튜브 URL 형식이 아니면 `422 INVALID_URL`
  - `non_recipe` classification인 URL에 대한 직접 extract 시 `422 NOT_RECIPE_VIDEO`

- **Error**:
  - `401 UNAUTHORIZED`
  - `404 FEATURE_DISABLED`
  - `422 INVALID_URL`
  - `422 NOT_RECIPE_VIDEO` — non_recipe 판정 영상
  - `502 PROVIDER_ERROR` — YouTube API 오류
  - `429 QUOTA_EXCEEDED` — YouTube API 할당량 초과
  - `500 Internal Server Error`

- **멱등성**: 멱등하지 않음 (매번 새 세션 생성)

### POST /recipes/youtube/register

세션 기반 원자적 등록 (Postgres RPC).

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `session.user_id === current_user.id` (RLS 존재해도 route handler에서 재검증)
- **Request**:
```json
{
  "extraction_id": "uuid",
  "title": "...",
  "base_servings": 2,
  "youtube_url": "https://www.youtube.com/watch?v=abc123",
  "ingredients": [
    {
      "ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "sort_order": 1
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "...",
      "cooking_method_id": "uuid",
      "ingredients_used": [],
      "heat_level": null,
      "duration_seconds": null,
      "duration_text": null
    }
  ]
}
```

- **Response 201**:
```json
{
  "success": true,
  "data": {
    "recipe_id": "uuid",
    "title": "..."
  },
  "error": null
}
```

- **Atomic register strategy**:
  - Postgres RPC `register_youtube_recipe_from_session` 사용
  - 한 DB 트랜잭션에서: `recipes` INSERT, `recipe_sources` INSERT, `recipe_ingredients` INSERT (복수), `recipe_steps` INSERT (복수), `youtube_extraction_sessions.status='consumed'` + `consumed_at=NOW()` UPDATE
  - 어떤 단계에서든 실패 시 모든 row rollback, 세션은 consumed되지 않음

- **Session 검증 순서**:
  1. `extraction_id`로 세션 조회 → 없으면 `404 EXTRACTION_NOT_FOUND`
  2. `session.user_id !== current_user.id` → `404 EXTRACTION_NOT_FOUND` (cross-user 숨김)
  3. `session.status === 'expired'` 또는 `expires_at < NOW()` → `410 EXTRACTION_EXPIRED`
  4. `session.status === 'consumed'` → `409 EXTRACTION_ALREADY_REGISTERED`
  5. Immutable identity mismatch (`extraction_id`, `user_id`, `youtube_url`/`youtube_video_id`, optionally `provider_version`) → `409 EXTRACTION_MISMATCH`
  6. Unresolved ingredients 또는 blocking step fields → `422 VALIDATION_ERROR` with field paths

- **EXTRACTION_MISMATCH 범위**: immutable extraction identity fields만 (`extraction_id`, `user_id`, `youtube_url`/`youtube_video_id`, `provider_version`). 사용자가 편집한 title/ingredients/steps는 비교 대상 아님.
  - `youtube_url`은 client body로 받되 provenance 저장값으로 쓰지 않는다. 서버는 body URL을 파싱한 canonical URL/video ID가 session의 신뢰된 값과 일치하는지만 확인한다.

- **Provenance (recipe_sources)**:
  - `youtube_url`, `youtube_video_id`: 세션의 신뢰된 값 복사 (클라이언트 body 아님)
  - `extraction_methods`: 세션의 실제 추출 방식
  - `youtube_extraction_session_id`: FK로 세션 참조
  - `raw_extracted_text`: 세션의 원본 추출 텍스트
  - `extraction_meta_json`: `{ provider_version, source_providers, classification_status, draft_warnings }` + 후속 optional `llm_model`, caption metadata

- **Error**:
  - `401 UNAUTHORIZED`
  - `404 FEATURE_DISABLED`
  - `404 EXTRACTION_NOT_FOUND` — 세션 없음 또는 cross-user
  - `410 EXTRACTION_EXPIRED` — 24h 만료
  - `409 EXTRACTION_ALREADY_REGISTERED` — 이미 소비된 세션
  - `409 EXTRACTION_MISMATCH` — immutable identity 불일치
  - `422 VALIDATION_ERROR` — 필수 필드 누락, unresolved ingredients, blocking step fields (field paths 포함, e.g. `ingredients[0].ingredient_id`)
  - `500 Internal Server Error`

- **멱등성**: 멱등하지 않음 (성공 시 세션 소비, 재호출 시 409)

### DB / Session Contract

**신규 테이블: `youtube_extraction_sessions`**

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | extraction_id로 사용 |
| user_id | uuid | FK → auth.users, NOT NULL | 세션 소유자 |
| youtube_url | text | NOT NULL | 원본 URL |
| youtube_video_id | varchar(20) | NOT NULL | 파싱된 영상 ID |
| provider_version | text | nullable | YouTube API 버전/추출기 버전 |
| extraction_methods | text[] | NOT NULL, DEFAULT '{}' | 실제 사용된 추출 방식 |
| raw_source_text | text | nullable | 설명란 원문 등 |
| extraction_meta_json | jsonb | NOT NULL, DEFAULT '{}' | provider_version, classification, warnings 등 |
| draft_json | jsonb | NOT NULL | 추출 결과 전체 draft |
| status | text | NOT NULL, CHECK IN ('draft','consumed','expired') | 세션 상태 |
| expires_at | timestamptz | NOT NULL | 만료 시각 (created_at + 24h) |
| consumed_at | timestamptz | nullable | 등록 완료 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT NOW() | 생성 시각 |

**recipe_sources 변경**:

| 컬럼 | 변경 | 설명 |
| --- | --- | --- |
| youtube_extraction_session_id | ADD nullable FK → youtube_extraction_sessions | 세션 참조 |

**RLS / DB 권한**:
- 클라이언트의 직접 reads/writes를 DB 수준에서 제한
- Route handler의 server-side 검증이 authoritative

**Session lifecycle rules**:
- `extract`: 인증된 현재 사용자 전용 세션 생성. 클라이언트가 `user_id` 공급 불가.
- 같은 URL 재사용 없음 (MVP)
- `register`: `session.user_id === current_user.id` 검증 (RLS와 별도)
- Cross-user 또는 없는 세션 → `404 EXTRACTION_NOT_FOUND`
- 만료 세션 → `410 EXTRACTION_EXPIRED`
- 소비된/재실행 세션 → `409 EXTRACTION_ALREADY_REGISTERED`
- Immutable identity 불일치 → `409 EXTRACTION_MISMATCH`
- 세션 만료: 24h (`expires_at`)

**Atomic register strategy**:
- MVP 기본: Postgres RPC `register_youtube_recipe_from_session`
- 실패 시 partial row 금지 (전체 rollback)
- RPC 도입 불가 시 Stage 2 blocks → docs/architecture review 복귀

### Feature Flags / Env

| 변수 | 범위 | 설명 |
| --- | --- | --- |
| `HOMECOOK_ENABLE_YOUTUBE_IMPORT` | server + client (기존) | YouTube import 기능 활성화 |
| `NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT` | client (기존) | 클라이언트 측 feature flag |
| `YOUTUBE_API_KEY` | server only (신규) | YouTube Data API v3 키, 클라이언트 노출 금지 |

- Optional LLM flags/env는 future-only, 이 슬라이스에서 off by default.

## Frontend Delivery Mode

- 디자인 확정 전: 기존 `YT_IMPORT` UI 골격 재사용, 기능 변경 사항만 반영
- 필수 상태:
  - `loading` — URL 검증 중 (YouTube API 호출), 추출 진행 중 (truthful indeterminate), 등록 중
  - `empty` — N/A (URL 입력 화면은 빈 상태 없음)
  - `error` — 검증 실패, 추출 실패, 등록 실패, provider error, quota exceeded
  - `read-only` — N/A (등록 완료 후 화면 닫힘)
  - `unauthorized` — 비로그인 시 로그인 게이트
- 로그인 보호: 로그인 게이트 + return-to-action (기존 유지)

### UI 변경 사항

- **Validate 단계**: classification 3-way 결과 반영
  - `recipe`: 기존과 동일 (바로 extract 진행)
  - `uncertain`: `is_recipe_video: true` + careful-review 경고 배너 표시, extract 계속 가능
  - `non_recipe`: `is_recipe_video: false` + extract 차단, 다른 URL 입력 요청 (기존 `[다시 입력]`만, `[그래도 진행]` 제거)
- **Extract 단계**: indeterminate loading (실제 YouTube API 호출 대기), `extraction_methods` 칩은 실제 결과 기반
- **검수 단계**:
  - `draft_warnings` / `blocking_issues` 표시
  - Ingredient `resolution_status` 기반 UI:
    - `resolved`: 정상 표시
    - `needs_review`: 주의 배지 + 사용자 선택/교체 필수
    - `unresolved`: 경고 배지 + picker/search로 재료 교체 필수, `raw_text` 표시
  - Step `is_incomplete` / `missing_fields` 기반 경고/차단 표시
  - 등록 버튼은 save unlock condition 충족 전까지 disabled

## Design Authority

- UI risk: `low-risk` (기존 confirmed `YT_IMPORT` 화면의 행동 변경, 새 화면 아님)
- Visual classification: `prototype-derived design` (h8 matrix 유지)
- Anchor screen dependency: 없음
- Visual artifact: 기존 슬라이스 19 evidence 참조
- Authority status: `not-required`
- Notes:
  - 기존 confirmed `YT_IMPORT` 화면의 기능 변경이며 새 화면이나 high-risk UI change가 아님
  - classification 3-way 배너, draft warning/blocking issue 표시, ingredient resolution status badge, step incomplete 경고는 기존 화면 구조 내 low-risk UI 추가
  - design-generator / design-critic 생략 근거: 기존 confirmed 화면의 low-risk 기능 추가로 시각 구조 변경 없음
  - Stage 5는 생략 가능하며, Stage 6에서 lightweight design check로 흡수 가능

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 UI 연결 완료)
>   → `confirmed` (Stage 6 lightweight design check, 2026-05-21)
>
> 기존 confirmed `YT_IMPORT` 화면의 low-risk 기능 연결이므로 Stage 5는 별도 public authority 없이 Stage 6에서 흡수했다. Claude objective review는 blocker 0 / `APPROVE`였고, Stage 4 PR #541의 a11y/visual/core frontend gates가 통과했다.

## Stage 6 Closeout Evidence

- Stage 1 docs: PR #538 merged (`7668c2a`).
- Stage 2 backend: PR #539 merged (`536a9e3`).
- Stage 4 frontend: PR #541 merged (`1fff5199`).
- Claude objective review: `.omx/artifacts/claude-delegate-20-youtube-real-import-stage4-objective-review-retry-response-20260521T123125Z.md` returned `APPROVE`, blocking findings none.
- Stage 5 design review: low-risk existing-screen change, no new layout/anchor dependency, absorbed in Stage 6 lightweight check.
- Stage 6 verification: `pnpm verify:frontend:pr`, targeted YouTube Playwright 21/21, local Supabase smoke, demo smoke, workpack/closeout validators all passed before #541 merge.
- Manual Only remains limited to credential/quota/live-provider checks: real YouTube Data API key validate/extract/register, actual quota exhaustion, broad live URL/classification spot checks, and future LLM/caption/ASR regression.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/19-youtube-import/README.md` — superseded slice
- `docs/요구사항기준선-v1.6.8.md` §2-4 유튜브 레시피 추출 정책
- `docs/화면정의서-v1.5.5.md` §10 YT_IMPORT
- `docs/유저flow맵-v1.3.5.md` ⑨ 유튜브 레시피 등록 여정
- `docs/api문서-v1.2.6.md` §6 유튜브 레시피 등록
- `docs/db설계-v1.3.4.md` §4-2 youtube_extraction_sessions, §4-3 recipe_sources
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`

## QA / Test Data Plan

- **Fixture baseline**:
  - 슬라이스 19 기존 fixture 유지 (조리방법 seed 8종, 재료 마스터, YouTube stub fixture)
  - YouTube API mock fixture 추가: 실제 `videos.list` 응답 구조의 fixture (recipe video, non-recipe video, uncertain video)
  - 서버 세션 fixture: draft/expired/consumed/cross-user 세션
  - Ingredient resolution fixture: resolved, needs_review, unresolved 재료 조합
  - Step incomplete fixture: blocking/warning missing fields
- **Fault injection**:
  - YouTube API 오류 (`502 PROVIDER_ERROR`) → error UI
  - YouTube API 할당량 초과 (`429 QUOTA_EXCEEDED`) → error UI
  - `non_recipe` classification → extract 차단
  - 만료 세션 register → `410 EXTRACTION_EXPIRED`
  - Cross-user 세션 register → `404 EXTRACTION_NOT_FOUND`
  - 이미 등록된 세션 register → `409 EXTRACTION_ALREADY_REGISTERED`
  - Immutable identity mismatch → `409 EXTRACTION_MISMATCH`
  - Unresolved ingredients register → `422 VALIDATION_ERROR`
  - RPC 실패 시 partial row rollback 확인
  - Feature flag off → `404 FEATURE_DISABLED`
  - 비로그인 → `401 UNAUTHORIZED`
- **Real DB smoke 경로**:
  - `pnpm dev:local-supabase` — 로컬 Supabase + migration 확인
  - `pnpm dev:demo` — fixture 기반 데모
  - 수동 smoke (credential-gated): 실제 YouTube API key로 URL validate → extract → register 전체 흐름
- **Seed / reset 명령**: `pnpm local:reset:demo`
- **Bootstrap 선행 조건**:
  - 슬라이스 19 모든 선행 조건 유지
  - `youtube_extraction_sessions` 테이블 migration 적용
  - `recipe_sources.youtube_extraction_session_id` 컬럼 추가 migration 적용
  - `register_youtube_recipe_from_session` RPC 생성
  - `YOUTUBE_API_KEY` 환경변수 설정 (실제 API 호출 시)
- **Blocker 조건**:
  - `youtube_extraction_sessions` migration 실패 → 세션 관리 불가
  - `recipe_sources` FK 추가 migration 실패 → 세션-소스 연결 불가
  - RPC 생성 실패 → atomic register 불가 (Stage 2 blocks)
  - `YOUTUBE_API_KEY` 미설정 → YouTube API 호출 불가 (stub fallback은 테스트에서만)

## Key Rules

- **YouTube API 사용 제약 (grounded facts)**:
  - `videos.list` with `part=snippet,contentDetails`: title, description, tags, category, thumbnails, duration, caption flag. 1 quota unit.
  - `captions.list`: caption tracks only (not body), 50 units, OAuth 필수 — Out of Scope
  - `captions.download`: 200 units, 영상 편집 권한 필요 — Out of Scope
  - oEmbed: preview/embed metadata only, 레시피 추출 소스 아님
  - 공개 자막/오디오/비디오 스크래핑 금지 (MVP)

- **Classification 3-way 규칙**:
  - `recipe`: extract 진행, 경고 없음
  - `uncertain`: `is_recipe_video: true`, extract 진행 가능, careful-review 경고
  - `non_recipe`: `is_recipe_video: false`, extract 차단 (422 NOT_RECIPE_VIDEO), 다른 URL 요청
  - Classifier 보수적: 강한 비요리 증거만 `non_recipe`, 약한/혼합 증거는 `uncertain`

- **세션 소유권/lifecycle**:
  - extract는 현재 인증 사용자 전용 세션 생성
  - register는 `session.user_id === current_user.id` 검증 (RLS와 별도)
  - Cross-user 접근은 `404`로 세션 존재 자체를 숨김
  - 24h 만료, 만료 후 `410`
  - 소비 후 재시도는 `409`
  - MVP에서 같은 URL 재사용 없음

- **Atomic register invariant**:
  - Postgres RPC 트랜잭션에서 모든 INSERT + 세션 UPDATE를 한 번에 수행
  - 실패 시 partial row 없음, 세션 미소비
  - RPC 불가 시 Stage 2 blocks

- **Provenance 규칙**:
  - register 시 `recipe_sources`의 URL/video_id/extraction_methods는 클라이언트가 아닌 세션에서 복사
  - 편집된 recipe content (title, ingredients, steps)는 사용자 수정본을 사용

- **EXTRACTION_MISMATCH 범위**:
  - immutable identity fields만 비교: `extraction_id`, `user_id`, `youtube_url`/`youtube_video_id`, optionally `provider_version`
  - title/ingredients/steps는 비교 대상 아님

- **Progress contract**:
  - MVP는 `POST /recipes/youtube/extract` 단일 호출 + truthful indeterminate loading
  - 응답 후 실제 `extraction_methods` 칩 표시
  - Polling/SSE 기반 실시간 진행은 future-only, 별도 endpoint 필요

- **기존 슬라이스 19 규칙 유지**:
  - URL 파싱 (youtube.com, youtu.be 등)
  - 미분류 조리방법 즉시 생성 (`is_system=false`, `color_key='unassigned'`)
  - `ingredient_type='QUANT'`: amount > 0, unit 필수
  - `ingredient_type='TO_TASTE'`: amount=null, unit=null
  - `step_number` 1부터 시작, 중복 불가
  - `cooking_method_id` 필수, 존재하는 조리방법
  - 수동 입력은 검수 단계에서만 허용

## Contract Evolution Candidates

이 슬라이스는 사용자 승인 기반 contract-evolution이다. 아래 변경사항은 handoff에서 승인되었으며, 공식 문서를 같은 PR에서 갱신한다:

1. **validate 응답 확장**: `classification_status`, `classification_reasons` 추가
2. **extract 응답 확장**: `draft_warnings`, `blocking_issues`, ingredient `resolution_status`/`candidates`/`raw_text`, step `is_incomplete`/`missing_fields` 추가
3. **register error 확장**: `404 EXTRACTION_NOT_FOUND`, `410 EXTRACTION_EXPIRED`, `409 EXTRACTION_ALREADY_REGISTERED`, `409 EXTRACTION_MISMATCH`, `422 VALIDATION_ERROR` with field paths
4. **DB 신규**: `youtube_extraction_sessions` 테이블
5. **DB 변경**: `recipe_sources.youtube_extraction_session_id` FK 추가
6. **Provider error**: `502 PROVIDER_ERROR`, `429 QUOTA_EXCEEDED` 추가
7. **Feature flag error**: `404 FEATURE_DISABLED` 공식화
8. **Env 추가**: `YOUTUBE_API_KEY` server-only

> 승인 상태: 사용자 승인 완료 (handoff 문서에서 명시적 결정 사항으로 전달됨)
> 공식 문서 갱신: 이 PR에서 같은 contract-evolution docs commit에 포함

## Primary User Path

1. 사용자가 `MENU_ADD`에서 "유튜브 링크로 추가" 선택 → `YT_IMPORT` 진입
2. 유튜브 URL 붙여넣기 + [가져오기] → `POST /recipes/youtube/validate` (YouTube `videos.list` API 호출)
3. Classification 분기:
   - `recipe`: 바로 extract 진행
   - `uncertain`: careful-review 경고 표시, 사용자 계속 가능
   - `non_recipe`: extract 차단, 다른 URL 입력 요청
4. 자동 추출 진행 → `POST /recipes/youtube/extract` (indeterminate loading) → 서버 세션 생성 + 설명란 기반 추출
5. 추출 결과 검수/수정:
   - `draft_warnings` / `blocking_issues` 확인
   - unresolved/needs_review 재료 해결 (picker/search)
   - incomplete step blocking fields 채움
   - 등록 버튼 unlock 조건 충족
6. [레시피 등록] → `POST /recipes/youtube/register` → Postgres RPC 원자적 등록 → `recipe_sources` INSERT (세션 provenance)
7. 등록 완료 후 "이 끼니에 추가" → 계획 인분 입력 → `POST /meals` → `MEAL_SCREEN` 복귀

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] 백엔드 계약 고정 (validate 3-way, extract session, register RPC) <!-- omo:id=20-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (YouTube Data API `videos.list` adapter) <!-- omo:id=20-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (request/response/error 타입, session types) <!-- omo:id=20-types;stage=2;scope=shared;review=3,6 -->
- [x] DB migration 적용 (`youtube_extraction_sessions`, `recipe_sources` FK, RPC) <!-- omo:id=20-db-migration;stage=2;scope=backend;review=3,6 -->
- [x] YouTube API adapter 구현 (`videos.list`, quota/error handling) <!-- omo:id=20-youtube-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] Classification 3-way 구현 (recipe/uncertain/non_recipe) <!-- omo:id=20-classification;stage=2;scope=backend;review=3,6 -->
- [x] Extract 세션 생성 구현 (draft_json, extraction_methods, provider info) <!-- omo:id=20-extract-session;stage=2;scope=backend;review=3,6 -->
- [x] Ingredient resolution status 구현 (resolved/needs_review/unresolved) <!-- omo:id=20-ingredient-resolution;stage=2;scope=backend;review=3,6 -->
- [x] Step incomplete detection 구현 (blocking/warning fields) <!-- omo:id=20-step-incomplete;stage=2;scope=backend;review=3,6 -->
- [x] Register RPC 원자적 등록 구현 (Postgres RPC transaction) <!-- omo:id=20-register-rpc;stage=2;scope=backend;review=3,6 -->
- [x] Register 세션 검증 구현 (ownership, expired, consumed, mismatch) <!-- omo:id=20-register-session-validation;stage=2;scope=backend;review=3,6 -->
- [x] Provenance 구현 (recipe_sources에 세션 기반 provenance 복사) <!-- omo:id=20-provenance;stage=2;scope=backend;review=3,6 -->
- [x] Feature flag / auth guard 구현 (404 FEATURE_DISABLED, 401) <!-- omo:id=20-feature-flag-auth;stage=2;scope=backend;review=3,6 -->
- [x] Provider error handling (502 PROVIDER_ERROR, 429 QUOTA_EXCEEDED) <!-- omo:id=20-provider-error;stage=2;scope=backend;review=3,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=20-state-policy-tests;stage=2;scope=backend;review=3,6 -->
- [x] UI 연결 (classification 3-way, draft warnings, resolution status, incomplete steps) <!-- omo:id=20-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] Classification 3-way UI (recipe/uncertain 경고/non_recipe 차단) <!-- omo:id=20-classification-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Extract indeterminate loading UI <!-- omo:id=20-extract-loading-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Draft warnings / blocking issues UI <!-- omo:id=20-draft-warnings-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Ingredient resolution status UI (resolved/needs_review/unresolved) <!-- omo:id=20-ingredient-resolution-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Step incomplete / missing fields UI <!-- omo:id=20-step-incomplete-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Save unlock condition UI (register button gating) <!-- omo:id=20-save-unlock-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Provider error / quota error UI <!-- omo:id=20-provider-error-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Session expired / consumed error UI <!-- omo:id=20-session-error-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=20-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 + return-to-action 유지 확인 <!-- omo:id=20-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=20-test-split;stage=4;scope=frontend;review=6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=20-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=20-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] Deterministic test fixture 유지 (기존 stub + 새 YouTube API mock) <!-- omo:id=20-deterministic-fixtures;stage=2;scope=shared;review=3,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=20-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
