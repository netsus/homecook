# Slice: 18-manual-recipe-create

## Goal

사용자가 직접 레시피를 등록하고 조리방법을 선택할 수 있도록 하며, 등록 직후 끼니 화면에 식사로 추가하거나 레시피 상세로 이동하여 플래너에 추가할 수 있도록 한다. 등록된 레시피는 `recipes.created_by` + `source_type='manual'` 조건으로 가상 레시피북 `my_added`를 통해 마이페이지에서 확인하고 재사용할 수 있다.

## Branches

- 백엔드: `feature/be-18-manual-recipe-create`
- 프론트엔드: `feature/fe-18-manual-recipe-create`

## In Scope

- 화면: `MANUAL_RECIPE_CREATE`
- API:
  - `POST /recipes` — 직접 레시피 등록 (source_type='manual')
  - `GET /cooking-methods` — 조리방법 목록 조회 (스텝 입력용)
- 상태 전이:
  - `recipes.source_type = 'manual'` 자동 설정
  - 등록 시 `recipes.created_by = current_user.id` 설정으로 가상 레시피북 `my_added` 반영
  - 등록 후 끼니 추가 선택 시 `meals` INSERT (`status='registered'`)
- DB 영향:
  - `recipes` (INSERT)
  - `recipe_ingredients` (INSERT)
  - `recipe_steps` (INSERT)
  - `cooking_methods` (READ)
  - `meals` (INSERT — 끼니 추가 선택 시)
- Schema Change:
  - [x] 없음 (기존 테이블 읽기/쓰기, 스키마 마이그레이션 불필요)

## Out of Scope

- 유튜브 레시피 등록 — 19에서 닫음
- 조리방법 신규 생성 — 18에서는 기존 조리방법 선택만, 19 유튜브 등록에서 미분류 조리방법 자동 생성 처리
- 레시피 수정/삭제 — 후속 슬라이스
- 레시피 이미지 업로드 — 후속 슬라이스
- 남은요리에서 레시피 추가 — `MENU_ADD` 다른 경로
- 팬트리만 이용 경로 — `08b`에서 닫음
- 레시피북에서 추가 경로 — `08b`에서 닫음

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
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### POST /recipes

직접 레시피 등록.

- **권한**: 로그인 필수 (401)
- **소유자 설정**: `created_by = current_user.id`
- **Request**:
```json
{
  "title": "김치찌개",
  "base_servings": 2,
  "ingredients": [
    {
      "ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "scalable": true,
      "sort_order": 1
    },
    {
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "amount": null,
      "unit": null,
      "ingredient_type": "TO_TASTE",
      "display_text": "소금 약간",
      "scalable": false,
      "sort_order": 2
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "cooking_method_id": "uuid",
      "ingredients_used": [
        {
          "ingredient_id": "uuid",
          "amount": 200,
          "unit": "g",
          "cut_size": "한입 크기"
        }
      ],
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
    "id": "uuid",
    "title": "김치찌개",
    "source_type": "manual",
    "created_by": "current_user_id",
    "base_servings": 2
  },
  "error": null
}
```

- **Validation**:
  - `title` 필수 (1~200자)
  - `base_servings` 필수 (1 이상)
  - `ingredients` 최소 1개
  - `ingredient_type='QUANT'` 항목은 `amount > 0`, `unit` 필수
  - `ingredient_type='TO_TASTE'` 항목은 `amount=null`, `unit=null`, `scalable=false`
  - `steps` 최소 1개
  - `cooking_method_id` 필수이며 존재하는 조리방법 ID여야 함
  - `step_number`는 1부터 시작하며 중복 불가

- **Error**:
  - `401 Unauthorized` — 비로그인
  - `422 Validation Error` — 필수 필드 누락, 타입 불일치, 조리방법 ID 부재
  - `500 Internal Server Error`

- **멱등성**: 멱등하지 않음 (POST는 호출 시마다 새 레시피 생성)

- **my_added 가상 책 반영**: `recipes.created_by = current_user.id` + `source_type='manual'` 조건으로 가상 레시피북 `my_added`를 통해 조회 가능. `recipe_book_items` INSERT 없음.

### GET /cooking-methods

조리방법 목록 조회 (스텝 입력용).

- **권한**: 비로그인 가능 (🔓)
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "methods": [
      {
        "id": "uuid",
        "code": "stir_fry",
        "label": "볶기",
        "color_key": "orange",
        "is_system": true
      },
      {
        "id": "uuid",
        "code": "auto_1710000000",
        "label": "절이기",
        "color_key": "unassigned",
        "is_system": false
      }
    ]
  },
  "error": null
}
```

- **Empty**: `methods: []` (조리방법이 하나도 없는 경우, 비정상 상태)
- **Error**: `500 Internal Server Error`
- **정렬**: `display_order ASC, created_at ASC`
- **Read-only**: 이 슬라이스에서는 조회만 담당

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading` — 레시피 등록 중
  - `empty` — N/A (직접 등록 화면은 빈 상태 없음, 진입 즉시 입력 폼)
  - `error` — 등록 실패 시 에러 안내 + [다시 시도]
  - `read-only` — N/A (등록 완료 후에는 화면 닫힘)
  - `unauthorized` — 비로그인 시 로그인 게이트
- 로그인 보호: 로그인 게이트 + return-to-action (등록 시도 → 로그인 → 등록 폼 자동 복귀)

## Design Authority

- UI risk: `new-screen`
- Visual classification: `prototype-derived design` (h8 matrix)
- Anchor screen dependency: 없음
- Visual artifact: Figma frame URL 또는 screenshot evidence 경로 (h8 matrix 참조)
- Authority status: `required`
- Authority planning: `pending` (Stage 4 evidence generation, Claude final authority gate)
- Notes:
  - h8 matrix에 따라 `MANUAL_RECIPE_CREATE`는 `prototype-derived design`으로 분류
  - Baemin vocabulary/material/tokens 사용, near-100% parity 타겟 아님
  - prototype-only 요소(bottom tab 동작, Jua 폰트, unsupported 기능) 불포함
  - 새 화면이므로 Stage 4 screenshot evidence + Claude final authority gate 필요
  - new screen requires authority evidence per workflow

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후)
> h8 matrix의 `prototype-derived design` 분류로 parity scoring 타겟 아님

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` §1-5 식사추가, §2-4 유튜브 레시피 추출 정책
- `docs/화면정의서-v1.5.1.md` §9 MANUAL_RECIPE_CREATE
- `docs/유저flow맵-v1.3.1.md` ⑩ 직접 등록 여정
- `docs/api문서-v1.2.2.md` §7 직접 레시피 등록, §14 조리방법 목록 조회
- `docs/db설계-v1.3.1.md` §3 조리방법, §4 레시피
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md` (h8 matrix 참조)

## QA / Test Data Plan

- **Fixture baseline**: 기본 조리방법 seed (8종), 재료 마스터, 끼니 컬럼 4개, `my_added` 시스템 레시피북
- **Real DB smoke 경로**:
  - `pnpm dev:local-supabase` — 로컬 Supabase 환경
  - `pnpm dev:demo` — fixture 기반 데모
  - 수동 smoke: 레시피 등록 → my_added 가상 책 반영 확인 (recipes.created_by + source_type='manual') → 끼니 추가 → MEAL_SCREEN 복귀
- **Seed / reset 명령**: `pnpm local:reset:demo`
- **Bootstrap 선행 조건**:
  - 회원가입 시 `meal_plan_columns` 4개 자동 생성 (아침/점심/간식/저녁)
  - 회원가입 시 `recipe_books` 3개 시스템 책 row 자동 생성 (my_added, saved, liked) — MYPAGE 레시피북 목록용
  - 조리방법 seed 8종 (`stir_fry`, `boil`, `deep_fry`, `steam`, `grill`, `blanch`, `mix`, `prep`)
- **Blocker 조건**:
  - 재료 마스터 테이블 부재 → 재료 선택 불가
  - 조리방법 seed 미투입 → 조리방법 선택 불가
  - my_added 시스템 책 row 자동 생성 실패 → MYPAGE에서 레시피북 목록 조회 불가 (레시피 membership 자체는 recipes.created_by로 결정)

## Key Rules

- **재료 입력 규칙**:
  - `ingredient_type='QUANT'` — 수량(`amount > 0`), 단위(`unit`) 필수, `scalable=true` 가능
  - `ingredient_type='TO_TASTE'` — 수량/단위 없음(`amount=null`, `unit=null`), `scalable=false` 고정
  - 재료명은 표준명(`standard_name`) + 동의어로 검색하되, 등록 시 `ingredient_id` 필수
  - `display_text`는 사용자 입력 원문 보존용 (예: "김치 200g", "소금 약간")

- **스텝 입력 규칙**:
  - `step_number`는 1부터 시작, 중복 불가
  - `cooking_method_id` 필수이며 기존 조리방법 선택
  - 18에서는 신규 조리방법 생성 불가 (19 유튜브 등록에서 미분류 조리방법 자동 생성 처리)
  - `ingredients_used`는 jsonb, 스텝별 투입 재료 기록 (선택)
  - `heat_level`, `duration_seconds`, `duration_text` 선택 입력

- **등록 후 처리**:
  - `source_type='manual'` 자동 설정
  - `created_by = current_user.id` 자동 설정 → 가상 레시피북 `my_added` 반영 (`recipes.created_by + source_type IN ('youtube','manual')` 조건)
  - `recipe_book_items` INSERT 없음 (my_added는 가상 책, saved/custom만 recipe_book_items 사용)
  - 등록 완료 후 "끼니에 추가" 선택 시 계획 인분 입력 → `POST /meals` 호출
  - 등록 완료 후 "레시피 상세로 이동" 선택 시 `RECIPE_DETAIL` 이동 → 플래너 추가/저장/좋아요 가능

- **Validation 실패 시 처리**:
  - 필수 필드 누락 시 `422 Validation Error` + fields 상세 반환
  - 조리방법 ID 부재 시 `422 Validation Error` + "조리방법을 선택해주세요" 메시지
  - 재료 타입별 제약 위반 시 `422 Validation Error` + fields 상세 반환

## Contract Evolution Candidates

없음.

## Primary User Path

1. 사용자가 `MENU_ADD`에서 "직접 등록" 선택 → `MANUAL_RECIPE_CREATE` 진입
2. 레시피명, 기본 인분 입력 (필수)
3. 재료 추가: 재료명 검색 → 재료 선택 → 정량/비정량 구분 → 수량/단위 입력
4. 스텝 추가: 조리 설명 입력 → 조리방법 선택 (`GET /cooking-methods` 목록에서)
5. [저장] → `POST /recipes` → 레시피 생성 + `my_added` 가상 책 반영 (`recipes.created_by + source_type='manual'`)
6. 등록 완료 후 선택:
   - "끼니에 추가" → 계획 인분 입력 → `POST /meals` → `MEAL_SCREEN` 복귀
   - "레시피 상세로 이동" → `RECIPE_DETAIL` 진입 → 플래너 추가/저장/좋아요 가능

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.

- [x] 백엔드 계약 고정 (`POST /recipes`, `GET /cooking-methods`) <!-- omo:id=18-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 타입 반영 (request/response/error 타입) <!-- omo:id=18-api-types;stage=2;scope=shared;review=3,6 -->
- [x] 재료 타입별 validation 구현 (QUANT vs TO_TASTE) <!-- omo:id=18-ingredient-validation;stage=2;scope=backend;review=3,6 -->
- [x] 조리방법 목록 조회 구현 (`GET /cooking-methods`) <!-- omo:id=18-cooking-methods-list;stage=2;scope=backend;review=3,6 -->
- [x] 직접 레시피 등록 구현 (`POST /recipes`, `source_type='manual'`) <!-- omo:id=18-manual-recipe-create;stage=2;scope=backend;review=3,6 -->
- [x] my_added 가상 책 반영 구현 (`recipes.created_by + source_type='manual'`, recipe_book_items INSERT 없음) <!-- omo:id=18-my-added-virtual-book-reflection;stage=2;scope=backend;review=3,6 -->
- [x] 상태 전이 / 권한 / validation 테스트 <!-- omo:id=18-state-policy-tests;stage=2;scope=backend;review=3,6 -->
- [ ] UI 연결 (`MANUAL_RECIPE_CREATE` 화면) <!-- omo:id=18-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 조리방법 선택 UI (dropdown/modal, `GET /cooking-methods` 소비) <!-- omo:id=18-cooking-method-picker;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 추가 UI (정량/비정량 구분, 재료 검색) <!-- omo:id=18-ingredient-input-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 스텝 추가 UI (조리 설명, 조리방법, 투입 재료) <!-- omo:id=18-step-input-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 등록 후 끼니 추가 선택 UI (계획 인분 입력 → `POST /meals`) <!-- omo:id=18-post-create-meal-add;stage=4;scope=frontend;review=5,6 -->
- [ ] 등록 후 상세 이동 선택 UI (`RECIPE_DETAIL` 이동) <!-- omo:id=18-post-create-detail-nav;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 구현 <!-- omo:id=18-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 + return-to-action 구현 <!-- omo:id=18-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=18-fixture-smoke-split;stage=4;scope=frontend;review=6 -->
- [x] 조리방법 seed 8종 확인 (stir_fry, boil, deep_fry, steam, grill, blanch, mix, prep) <!-- omo:id=18-cooking-methods-seed;stage=2;scope=backend;review=3,6 -->
- [x] my_added 시스템 책 row 자동 생성 확인 (회원가입 bootstrap — MYPAGE 레시피북 목록용, membership은 recipes.created_by로 결정) <!-- omo:id=18-my-added-system-book-row-bootstrap;stage=2;scope=backend;review=3,6 -->
- [ ] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=18-test-split;stage=4;scope=frontend;review=6 -->
