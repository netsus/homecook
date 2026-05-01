# Slice: 19-youtube-import

## Goal

사용자가 유튜브 요리 영상 URL을 입력하면 레시피를 자동 추출하고, 추출 결과를 검수/수정한 뒤 레시피로 등록할 수 있도록 한다. 등록된 레시피는 `recipes.created_by` + `source_type='youtube'` 조건으로 가상 레시피북 `my_added`를 통해 마이페이지에서 확인하고 재사용할 수 있으며, 등록 직후 끼니에 추가하여 플래너에 반영할 수 있다.

## Branches

- 백엔드: `feature/be-19-youtube-import`
- 프론트엔드: `feature/fe-19-youtube-import`

## In Scope

- 화면: `YT_IMPORT`
- API:
  - `POST /recipes/youtube/validate` — 유튜브 URL 검증 및 레시피 영상 여부 판정
  - `POST /recipes/youtube/extract` — 유튜브 레시피 추출 (설명란/고정댓글 파싱 + 수동 보완, 미분류 조리방법 즉시 생성)
  - `POST /recipes/youtube/register` — 검수/수정된 추출 결과를 레시피로 확정 등록
- 상태 전이:
  - `recipes.source_type = 'youtube'` 자동 설정
  - 등록 시 `recipes.created_by = current_user.id` 설정으로 가상 레시피북 `my_added` 반영
  - 추출 단계에서 미분류 조리방법 `cooking_methods` INSERT (`is_system=false`, `color_key='unassigned'`)
  - 등록 후 끼니 추가 선택 시 `meals` INSERT (`status='registered'`)
- DB 영향:
  - `recipes` (INSERT)
  - `recipe_sources` (INSERT — `youtube_url`, `youtube_video_id`, `extraction_methods`, `extraction_meta_json`, `raw_extracted_text`)
  - `recipe_ingredients` (INSERT)
  - `recipe_steps` (INSERT)
  - `cooking_methods` (INSERT — 미분류 조리방법, `is_system=false`, `color_key='unassigned'`)
  - `meals` (INSERT — 끼니 추가 선택 시)
- Schema Change:
  - [x] 없음 (기존 테이블 읽기/쓰기, `recipe_sources` 테이블은 DB 설계에 정의됨)

## Out of Scope

- 전체 생산 수준 OCR/ASR/추정 레이어 통합 — 공식 요구사항에 "MVP 1차는 설명란/고정댓글 파싱 + 수동 보완"으로 명시. OCR, ASR, 추정 레이어는 단계적 구현 대상이며 이 슬라이스에서 실제 외부 서비스 연동 필수 아님
- 실제 YouTube Data API 연동 — MVP에서는 stub/mock 추출로 deterministic 테스트 가능하게 유지하고, 실제 YouTube API 키/할당량 관리는 별도 인프라 슬라이스
- 레시피 수정/삭제 — 등록 이후 편집은 후속 슬라이스
- 레시피 이미지 업로드 — 후속 슬라이스
- 직접 레시피 등록 (manual) — `18-manual-recipe-create`에서 닫음
- 공식 문서 변경 또는 미문서화 public 필드/엔드포인트 추가
- prototype parity promotion — h8 matrix에 따라 `YT_IMPORT`는 `prototype-derived design`

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `06-recipe-to-planner` | merged | [x] |
| `07-meal-manage` | merged | [x] |
| `08a-meal-add-search-core` | merged | [x] |
| `08b-meal-add-books-pantry` | merged | [x] |
| `09-shopping-preview-create` | merged | [x] |
| `10a-shopping-detail-interact` | merged | [x] |
| `10b-shopping-share-text` | merged | [x] |
| `11-shopping-reorder` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `12b-shopping-pantry-reflect` | merged | [x] |
| `13-pantry-core` | merged | [x] |
| `14-cook-session-start` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |
| `16-leftovers` | merged | [x] |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |
| `17c-settings-account` | merged | [x] |
| `18-manual-recipe-create` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### POST /recipes/youtube/validate

유튜브 URL 검증 및 레시피 영상 여부 판정 (Step 1 + Step 1.5).

- **권한**: 로그인 필수 (401)
- **Request**:
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=abc123"
}
```

- **Response 200 — 레시피 영상 확인**:
```json
{
  "success": true,
  "data": {
    "is_valid_url": true,
    "is_recipe_video": true,
    "video_info": {
      "video_id": "abc123",
      "title": "백종원 김치찌개",
      "channel": "백종원의 요리비책",
      "thumbnail_url": "https://..."
    }
  },
  "error": null
}
```

- **Response 200 — 레시피 아님 판정**:
```json
{
  "success": true,
  "data": {
    "is_valid_url": true,
    "is_recipe_video": false,
    "video_info": {
      "video_id": "abc123",
      "title": "일반 영상",
      "channel": "채널명",
      "thumbnail_url": "https://..."
    },
    "message": "이 영상은 요리 레시피가 아닌 것 같아요"
  },
  "error": null
}
```

> **구현 주의**: 공식 API 문서 예시는 래퍼 없이 작성되었으나, 프로젝트 구현 규칙에 따라 모든 응답은 `{ success, data, error }` 래퍼를 유지해야 한다. 위 예시는 래퍼를 포함한 구현 기대 형식이다.

- **비레시피 영상 판정 시 UI 분기**: `is_recipe_video=false`일 때 프론트는 안내 문구 + `[다시 입력]` / `[그래도 진행]` 선택지를 표시한다.
  - `[다시 입력]`: URL 입력 폼으로 복귀
  - `[그래도 진행]`: extract 단계로 강제 진행

- **Validation**:
  - `youtube_url` 필수 (빈 문자열, null 불가)
  - 유효한 유튜브 URL 형식이 아니면 `422 Validation Error`

- **Error**:
  - `401 Unauthorized` — 비로그인
  - `422 Validation Error` — 유효하지 않은 URL 형식 (`{ code: 'INVALID_URL', message: '유효한 유튜브 URL을 입력해주세요', fields: [{ field: 'youtube_url', reason: 'invalid_url' }] }`)
  - `500 Internal Server Error`

- **멱등성**: 같은 URL을 여러 번 validate해도 side effect 없음 (조회 성격)

### POST /recipes/youtube/extract

유튜브 레시피 추출 (Step 2).

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
    "extraction_id": "uuid",
    "title": "백종원 김치찌개",
    "base_servings": 2,
    "extraction_methods": ["description", "ocr"],
    "ingredients": [
      {
        "standard_name": "김치",
        "amount": 200,
        "unit": "g",
        "ingredient_type": "QUANT",
        "display_text": "김치 200g",
        "ingredient_id": "uuid",
        "confidence": 0.95
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
        "duration_text": null
      }
    ],
    "new_cooking_methods": [
      {
        "id": "uuid",
        "code": "auto_1710000000",
        "label": "절이기",
        "color_key": "unassigned",
        "is_new": true
      }
    ]
  },
  "error": null
}
```

> 미분류 조리방법은 이 단계에서 즉시 `cooking_methods` INSERT → id 포함 반환.
> `color_key: "unassigned"`: 프론트는 fallback 색상(회색 계열) 적용.
> MVP 1차에서 `extraction_methods`는 주로 `["description"]` 또는 `["description", "manual"]`.

- **Validation**:
  - `youtube_url` 필수
  - 유효한 유튜브 URL 형식이 아니면 `422`

- **Error**:
  - `401 Unauthorized` — 비로그인
  - `422 Validation Error` — 유효하지 않은 URL
  - `500 Internal Server Error` — 추출 실패 (외부 서비스 장애 등)

- **멱등성**: 같은 URL을 여러 번 extract하면 새로운 `extraction_id`가 매번 생성됨 (멱등하지 않음). 미분류 조리방법은 이미 존재하면 재생성하지 않고 기존 ID 반환.

### POST /recipes/youtube/register

검수/수정된 추출 결과를 레시피로 확정 등록 (Step 3 → Step 4).

- **권한**: 로그인 필수 (401)
- **소유자 설정**: `created_by = current_user.id`
- **Request**:
```json
{
  "extraction_id": "uuid",
  "title": "백종원 김치찌개",
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
      "instruction": "김치를 한입 크기로 썬다",
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
    "title": "백종원 김치찌개"
  },
  "error": null
}
```

> **구현 주의**: 공식 API 문서의 register 응답 예시는 래퍼 없이 `{ recipe_id, title }` 형태이나, 프로젝트 규칙에 따라 `{ success, data, error }` 래퍼를 적용한다.

- **등록 시 DB INSERT**:
  - `recipes`: `source_type='youtube'`, `created_by=current_user.id`
  - `recipe_sources`: `youtube_url`, `youtube_video_id` (URL에서 파싱), `extraction_methods`, `extraction_meta_json`, `raw_extracted_text`
  - `recipe_ingredients`: 복수 INSERT
  - `recipe_steps`: 복수 INSERT
  - `cooking_methods`: 추출 단계에서 이미 INSERT된 미분류 조리방법은 register에서 재생성하지 않음
  - `meals`: "이 끼니에 추가" 선택 시 `status='registered'`로 INSERT (프론트에서 별도 `POST /meals` 호출)

- **my_added 가상 책 반영**: `recipes.created_by = current_user.id` + `source_type='youtube'` 조건으로 가상 레시피북 `my_added`를 통해 조회 가능. `recipe_book_items` INSERT 없음.

- **Validation**:
  - `extraction_id` 필수
  - `title` 필수 (1~200자)
  - `base_servings` 필수 (1 이상)
  - `youtube_url` 필수
  - `ingredients` 최소 1개
  - `ingredient_type='QUANT'` 항목은 `amount > 0`, `unit` 필수
  - `ingredient_type='TO_TASTE'` 항목은 `amount=null`, `unit=null`
  - `steps` 최소 1개
  - `cooking_method_id` 필수이며 존재하는 조리방법 ID여야 함
  - `step_number`는 1부터 시작하며 중복 불가

- **Error**:
  - `401 Unauthorized` — 비로그인
  - `422 Validation Error` — 필수 필드 누락, 타입 불일치, 조리방법 ID 부재
  - `500 Internal Server Error`

- **멱등성**: 멱등하지 않음 (POST는 호출 시마다 새 레시피 생성)

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading` — URL 검증 중, 추출 진행 중, 레시피 등록 중
  - `empty` — N/A (URL 입력 화면은 빈 상태 없음, 진입 즉시 입력 폼)
  - `error` — 검증 실패, 추출 실패, 등록 실패 시 에러 안내 + [다시 시도]
  - `read-only` — N/A (등록 완료 후에는 화면 닫힘)
  - `unauthorized` — 비로그인 시 로그인 게이트
- 로그인 보호: 로그인 게이트 + return-to-action (import 시도 → 로그인 → import 폼 자동 복귀)

## Design Authority

- UI risk: `new-screen`
- Visual classification: `prototype-derived design` (h8 matrix)
- Anchor screen dependency: 없음
- Visual artifact:
  - Stage 5 Codex authority_precheck evidence:
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-url-390x844.png`
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-review-top-390x844.png`
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-review-scroll-390x844.png`
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-review-top-narrow-320x568.png`
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-review-narrow-320x568.png`
  - `ui/designs/evidence/19-youtube-import/YT_IMPORT-mobile-complete-narrow-320x568.png`
- Authority status: `passed` (Codex authority_precheck + Claude final authority gate, blocker 0 / major 0)
- Authority planning: Stage 4에서 screenshot evidence 캡처 → Codex `authority_precheck` → Claude `final_authority_gate`
- Authority report: `ui/designs/authority/YT_IMPORT-authority.md` (Stage 4/5에서 생성)
- Notes:
  - h8 matrix에 따라 `YT_IMPORT`는 `prototype-derived design`으로 분류
  - Baemin vocabulary/material/tokens 사용, near-100% parity 타겟 아님
  - prototype-only 요소(bottom tab 동작, Jua 폰트, unsupported 기능) 불포함
  - 새 화면이므로 Stage 4 screenshot evidence + Claude final authority gate 필요

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후)
> h8 matrix의 `prototype-derived design` 분류로 parity scoring 타겟 아님

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` §2-4 유튜브 레시피 추출 정책
- `docs/화면정의서-v1.5.1.md` §10 YT_IMPORT
- `docs/유저flow맵-v1.3.1.md` ⑨ 유튜브 레시피 등록 여정
- `docs/api문서-v1.2.2.md` §6 유튜브 레시피 등록
- `docs/db설계-v1.3.1.md` §4-2 recipe_sources, §3 조리방법
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md` (h8 matrix 참조)

## QA / Test Data Plan

- **Fixture baseline**:
  - 기본 조리방법 seed 8종 (`stir_fry`, `boil`, `deep_fry`, `steam`, `grill`, `blanch`, `mix`, `prep`)
  - 재료 마스터 최소 10종
  - 끼니 컬럼 4개 (아침/점심/간식/저녁)
  - `my_added` 시스템 레시피북 row
  - YouTube 추출 stub fixture: 유효한 레시피 영상 / 비레시피 영상 / 추출 실패 시나리오
  - 추출 결과에 미분류 조리방법 1종 이상 포함 fixture
- **Fault injection**:
  - 비레시피 영상 URL → `is_recipe_video=false` 분기 테스트
  - 추출 실패 (500) → error 상태 UI 테스트
  - register validation 실패 (422) → 필수 필드 누락/타입 불일치 테스트
  - 비로그인 상태에서 전체 flow 시도 → 401 + 로그인 게이트 테스트
- **Real DB smoke 경로**:
  - `pnpm dev:local-supabase` — 로컬 Supabase 환경
  - `pnpm dev:demo` — fixture 기반 데모
  - 수동 smoke: URL 입력 → 검증 → 추출 → 검수 → 등록 → my_added 가상 책 반영 확인 → 끼니 추가 → MEAL_SCREEN 복귀
- **Seed / reset 명령**: `pnpm local:reset:demo`
- **Bootstrap 선행 조건**:
  - 회원가입 시 `meal_plan_columns` 4개 자동 생성 (아침/점심/간식/저녁)
  - 회원가입 시 `recipe_books` 3개 시스템 책 row 자동 생성 (my_added, saved, liked)
  - 조리방법 seed 8종
  - `recipe_sources` 테이블이 DB에 존재해야 함 (DB 설계 §4-2에 정의됨)
  - `ingredients` 테이블에 재료 마스터 데이터 존재
- **Blocker 조건**:
  - `recipe_sources` 테이블 부재 → 유튜브 레시피 소스 정보 저장 불가
  - 재료 마스터 테이블 부재 → 재료 매칭 불가
  - 조리방법 seed 미투입 → 조리방법 매칭/선택 불가
  - `my_added` 시스템 책 row 자동 생성 실패 → MYPAGE에서 레시피북 목록 조회 불가
  - `meal_plan_columns` 미생성 → 끼니 추가 시 컬럼 매칭 불가

## Key Rules

- **URL 검증 분기**:
  - `is_recipe_video=true` → 추출 단계 진행
  - `is_recipe_video=false` → "이 영상은 요리 레시피가 아닌 것 같아요" 안내 + `[다시 입력]` / `[그래도 진행]`
  - `[다시 입력]`: URL 입력 폼 복귀, `[그래도 진행]`: extract 강제 진행

- **추출 파이프라인**:
  - MVP 1차: 설명란/고정댓글 파싱 + 수동 보완
  - `extraction_methods` 배열로 사용된 추출 방식 기록 (`description`, `ocr`, `asr`, `estimation`, `manual`)
  - 미분류 조리방법은 추출 단계에서 즉시 `cooking_methods` INSERT (`is_system=false`, `color_key='unassigned'`)
  - 프론트는 `color_key='unassigned'`에 fallback 색상(회색 계열) 적용
  - 새로 생성된 조리방법은 "신규" 라벨로 구분 표시

- **검수/수정 규칙**:
  - 수동 입력은 검수 단계에서만 허용
  - 재료 리스트, 스텝 리스트 편집 가능 (추가/삭제/수정)
  - 기본 인분, 레시피명 편집 가능
  - 조리방법 자동 분류 결과 수동 변경 가능
  - 18과 동일한 재료 타입 규칙: `QUANT`는 amount/unit 필수, `TO_TASTE`는 amount=null/unit=null

- **등록 후 처리**:
  - `source_type='youtube'` 자동 설정
  - `created_by = current_user.id` 자동 설정 → 가상 레시피북 `my_added` 반영 (`recipes.created_by + source_type IN ('youtube','manual')` 조건)
  - `recipe_book_items` INSERT 없음 (my_added는 가상 책)
  - `recipe_sources` INSERT: `youtube_url`, `youtube_video_id`, `extraction_methods`, `extraction_meta_json`, `raw_extracted_text`
  - "이 끼니에 추가" 선택 시 계획 인분 입력 → `POST /meals` 호출 (`status='registered'`)

- **Validation 실패 시 처리**:
  - 필수 필드 누락 시 `422 Validation Error` + fields 상세 반환
  - 조리방법 ID 부재 시 `422 Validation Error`
  - 재료 타입별 제약 위반 시 `422 Validation Error`
  - URL 형식 오류 시 `422 Validation Error`

## Contract Evolution Candidates

없음.

## Primary User Path

1. 사용자가 `MENU_ADD`에서 "유튜브 링크로 추가" 선택 → `YT_IMPORT` 진입
2. 유튜브 URL 붙여넣기 + [가져오기] → `POST /recipes/youtube/validate` 호출
3. (레시피 영상 아님 판정 시) "이 영상은 요리 레시피가 아닌 것 같아요" 안내 → [다시 입력] 또는 [그래도 진행]
4. 자동 추출 진행 → `POST /recipes/youtube/extract` 호출 → Progress 표시 (extraction_methods 단계별)
5. 추출 결과 검수/수정: 레시피명, 기본 인분, 재료 리스트 편집, 스텝 리스트 편집 (조리방법 수동 변경 가능)
6. [레시피 등록] → `POST /recipes/youtube/register` → 레시피 생성 + `recipe_sources` INSERT + `my_added` 가상 책 반영
7. 등록 완료 후 "이 끼니에 추가" → 계획 인분 입력 → `POST /meals` → `MEAL_SCREEN` 복귀

## Stage 2 Backend Evidence

- 구현 파일:
  - `app/api/v1/recipes/youtube/validate/route.ts`
  - `app/api/v1/recipes/youtube/extract/route.ts`
  - `app/api/v1/recipes/youtube/register/route.ts`
  - `lib/server/youtube-import.ts`
  - `types/recipe.ts`
- 테스트:
  - `tests/youtube-import.backend.test.ts`
  - `tests/manual-recipe-create.backend.test.ts` 회귀 확인
- Local verification:
  - `pnpm test tests/youtube-import.backend.test.ts` — pass (14 tests)
  - `pnpm test tests/manual-recipe-create.backend.test.ts tests/youtube-import.backend.test.ts` — pass (25 tests)
  - `pnpm typecheck` — pass
  - `pnpm lint` — pass with pre-existing `<img>` warnings only
  - `pnpm verify:backend` — pass (`lint`, `typecheck`, `test:product` 58 files / 526 tests, `build`, security E2E 9 tests)
  - `pnpm local:reset:demo` — pass
  - local Supabase smoke query — pass (`cooking_methods` codes include seed 8종 + existing custom `finish`; `recipe_sources` table query ok)
- Scope note:
  - 실제 YouTube Data API/OCR/ASR/estimation은 Stage 1 Out of Scope 그대로 유지했다.
  - MVP 추출은 deterministic stub(`recipe12345`, `nonrecipe123`, `fail999999`)으로 고정했다.
  - `recipe_sources`와 seed readiness는 core schema migration, fixture baseline, local Supabase smoke로 확인했다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.

- [x] 백엔드 계약 고정 (`POST /recipes/youtube/validate`, `POST /recipes/youtube/extract`, `POST /recipes/youtube/register`) <!-- omo:id=19-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 타입 반영 (request/response/error 타입) <!-- omo:id=19-api-types;stage=2;scope=shared;review=3,6 -->
- [x] URL 검증 구현 (`POST /recipes/youtube/validate`, 레시피/비레시피 분기) <!-- omo:id=19-url-validate;stage=2;scope=backend;review=3,6 -->
- [x] 추출 구현 (`POST /recipes/youtube/extract`, 설명란 파싱 + 미분류 조리방법 자동 생성) <!-- omo:id=19-extract;stage=2;scope=backend;review=3,6 -->
- [x] 등록 확정 구현 (`POST /recipes/youtube/register`, `source_type='youtube'`, `recipe_sources` INSERT) <!-- omo:id=19-register;stage=2;scope=backend;review=3,6 -->
- [x] my_added 가상 책 반영 구현 (`recipes.created_by + source_type='youtube'`, `recipe_book_items` INSERT 없음) <!-- omo:id=19-my-added-virtual-book-reflection;stage=2;scope=backend;review=3,6 -->
- [x] 미분류 조리방법 자동 생성 (`cooking_methods` INSERT, `is_system=false`, `color_key='unassigned'`) <!-- omo:id=19-new-cooking-method-insert;stage=2;scope=backend;review=3,6 -->
- [x] 상태 전이 / 권한 / validation 테스트 <!-- omo:id=19-state-policy-tests;stage=2;scope=backend;review=3,6 -->
- [x] UI 연결 (`YT_IMPORT` 화면) <!-- omo:id=19-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] URL 입력 + 검증 UI (Step 1 + Step 1.5, 비레시피 판정 분기 포함) <!-- omo:id=19-url-validate-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 추출 Progress UI (Step 2, extraction_methods 단계 표시) <!-- omo:id=19-extract-progress-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 검수/수정 UI (Step 3, 재료/스텝 편집, 조리방법 변경) <!-- omo:id=19-review-edit-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 등록 + 끼니 추가 UI (Step 4, 계획 인분 입력 → `POST /meals`) <!-- omo:id=19-register-meal-add-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 구현 <!-- omo:id=19-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 + return-to-action 구현 <!-- omo:id=19-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=19-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=19-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] 조리방법 seed 8종 확인 <!-- omo:id=19-cooking-methods-seed;stage=2;scope=backend;review=3,6 -->
- [x] recipe_sources 테이블 존재 확인 <!-- omo:id=19-recipe-sources-table;stage=2;scope=backend;review=3,6 -->
- [x] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=19-test-split;stage=4;scope=frontend;review=6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=19-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
