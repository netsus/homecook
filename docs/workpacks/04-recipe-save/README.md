# Slice: 04-recipe-save

## Goal
레시피 상세 화면에서 사용자가 레시피를 저장할 수 있도록 한다. 저장 버튼 클릭 시 저장 대상 레시피북 선택 모달이 열리며, "저장한 레시피북(saved)" 또는 "커스텀 레시피북(custom)" 중 하나를 선택하거나 새 커스텀 레시피북을 빠르게 생성하여 저장할 수 있다. 저장 후 레시피의 save_count가 증가하고, 사용자의 user_status에 저장 상태가 반영된다.

## Branches

- 백엔드: `feature/be-04-recipe-save`
- 프론트엔드: `feature/fe-04-recipe-save`

## In Scope
- 화면:
  - `RECIPE_DETAIL` — 저장 버튼 동작 (로그인 게이트 포함)
  - `SAVE_MODAL` (신규) — 저장 대상 레시피북 선택 + 커스텀 책 quick-create
- API:
  - `GET /recipe-books` — 저장 가능한 레시피북 목록 조회 (saved/custom 필터링)
  - `POST /recipe-books` — 커스텀 레시피북 생성 (quick-create용)
  - `POST /recipes/{recipe_id}/save` — 레시피 저장 (book_id 전달)
- 상태 전이:
  - 레시피 저장 전: `is_saved=false`, `saved_book_ids=[]`
  - 레시피 저장 후: `is_saved=true`, `saved_book_ids=[...]`, `save_count += 1`
- DB 영향:
  - `recipe_books` (조회 및 생성)
  - `recipe_book_items` (저장 시 INSERT)
  - `recipes.save_count` (비정규화 카운트 증가)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 저장 해제 기능 (별도 슬라이스 17b에서 처리)
- my_added, liked 레시피북으로의 저장 (정책상 불가)
- 레시피북 수정/삭제 기능 (별도 슬라이스 17a에서 처리)
- 저장된 레시피 조회 화면 (별도 슬라이스 17a/17b에서 처리)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |
| `03-recipe-like` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### GET /recipe-books
- **Query**: 없음 (로그인된 사용자의 레시피북 전체 조회)
- **Response** (`200`):
  ```json
  {
    "books": [
      {
        "id": "uuid",
        "name": "저장한 레시피",
        "book_type": "saved",
        "recipe_count": 8,
        "sort_order": 1
      },
      {
        "id": "uuid",
        "name": "주말 파티",
        "book_type": "custom",
        "recipe_count": 5,
        "sort_order": 3
      }
    ]
  }
  ```
- **Error**:
  - `401 UNAUTHORIZED` — 비로그인 사용자

### POST /recipe-books
- **Request Body**:
  ```json
  {
    "name": "새 레시피북 이름" // required, string, max 50자
  }
  ```
- **Response** (`201`):
  ```json
  {
    "id": "uuid",
    "name": "새 레시피북 이름",
    "book_type": "custom",
    "recipe_count": 0,
    "sort_order": 4,
    "created_at": "2026-03-27T10:00:00Z",
    "updated_at": "2026-03-27T10:00:00Z"
  }
  ```
- **Error**:
  - `401 UNAUTHORIZED` — 비로그인 사용자
  - `422 VALIDATION_ERROR` — name 필드 누락 또는 유효하지 않음

### POST /recipes/{recipe_id}/save
- **Request Body**:
  ```json
  {
    "book_id": "uuid" // required, 저장할 레시피북 ID
  }
  ```
- **Response** (`200`):
  ```json
  {
    "saved": true,
    "save_count": 211,
    "book_id": "uuid"
  }
  ```
- **Error**:
  - `401 UNAUTHORIZED` — 비로그인 사용자
  - `404 RESOURCE_NOT_FOUND` — 레시피 또는 레시피북이 존재하지 않음
  - `403 FORBIDDEN` — 다른 유저의 레시피북에 저장 시도
  - `409 CONFLICT` — book_type이 `saved` 또는 `custom`이 아닌 경우 (my_added, liked 불가)
  - `409 CONFLICT` — 이미 해당 레시피북에 저장된 경우 (중복 저장)

### 권한 / 소유자 검증
- `GET /recipe-books`: 로그인된 사용자의 레시피북만 조회
- `POST /recipe-books`: 로그인된 사용자의 레시피북 생성
- `POST /recipes/{id}/save`: book_id가 요청 유저의 레시피북인지 검증 (403)

### 멱등성
- `POST /recipes/{id}/save`: 동일 레시피를 동일 레시피북에 재저장 시도 → `409 CONFLICT` 반환 (멱등하지 않음, 명시적 실패)

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - **loading**: 레시피북 목록 로딩 중, 저장 처리 중
  - **empty**: 저장 가능한 레시피북이 없음 (시스템 'saved' 책은 항상 존재하므로 실질적으로 발생하지 않음)
  - **error**: 레시피북 조회 실패, 저장 실패
  - **unauthorized**: 비로그인 상태에서 저장 버튼 클릭 → 로그인 게이트 모달
  - **read-only**: 해당 없음 (저장 후 모달 닫힘)
- 로그인 보호 액션: 저장 버튼 클릭 → 로그인 안내 모달 → 로그인 후 return-to-action (저장 모달 재오픈)

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료, Claude Stage 5 디자인 리뷰 필요
- [x] 확정 (confirmed) — Stage 5 리뷰 통과, Tailwind/공용 컴포넌트 정리 완료
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료, Codex가 변경)
>   → `confirmed` (Stage 5 리뷰 통과, Claude가 변경)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.md` — 1-2 레시피 상세 (저장 액션)
- `docs/화면정의서-v1.2.md` — 3) RECIPE_DETAIL
- `docs/api문서-v1.2.1.md` — 2-3 레시피 저장, 12-2 레시피북 목록 조회, 12-3 레시피북 생성
- `docs/db설계-v1.3.md` — 10-1 recipe_books, 10-2 recipe_book_items

## QA / Test Data Plan

- QA fixture mode:
  - 권장 실행: `pnpm dev:qa-fixtures`
  - QA toolbar에서 auth / fault / reset을 바로 조작할 수 있다
  - console 수동 override도 가능: guest / authenticated
  - fixture baseline: saved/custom book 2개 제공, target recipe는 현재 사용자 기준 `unsaved`
  - fault injection 필요 시:
    - `localStorage["homecook.qa-fixture-faults"] = JSON.stringify({ "recipe_books_list": "internal_error" })`
    - `localStorage["homecook.qa-fixture-faults"] = JSON.stringify({ "recipe_books_create": "internal_error" })`
    - `localStorage["homecook.qa-fixture-faults"] = JSON.stringify({ "recipe_save": "missing_recipe" | "missing_book" | "forbidden_book" | "invalid_book_type" | "duplicate_save" | "internal_error" })`
    - 해제: `localStorage.removeItem("homecook.qa-fixture-faults")`
  - 일반 `pnpm dev`에서는 QA localStorage override를 읽지 않는다
- 실 DB smoke:
  - 브라우저에서 real local DB 흐름 확인: `pnpm dev:local-supabase`
  - local-only 로그인 카드로 테스트 계정 진입 후 기본 `saved` 책이 자동 보정되는지 확인
  - local 테스트 계정 seed: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
  - `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - baseline: 현재 사용자는 target recipe 미저장, 다른 QA 유저 저장 1건으로 `save_count > 0`

## Key Rules
- **저장 가능 book_type 제한**: `saved` 또는 `custom`만 허용. `my_added`, `liked`로 저장 시도 시 `409 CONFLICT`
- **중복 저장 방지**: 동일 레시피를 동일 레시피북에 재저장 시 `409 CONFLICT`
- **레시피북 소유자 검증**: book_id가 요청 유저의 레시피북인지 확인 (403)
- **비정규화 카운트 갱신**: 저장 성공 시 `recipes.save_count += 1`
- **user_status 반영**: 저장 후 `is_saved=true`, `saved_book_ids`에 book_id 추가
- **로그인 게이트**: 비로그인 상태에서 저장 시도 → 로그인 안내 모달 → 로그인 후 return-to-action

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 사용자가 `RECIPE_DETAIL`에서 레시피를 확인하고 [저장] 버튼 클릭
2. 로그인 상태라면 `SAVE_MODAL` 오픈, 비로그인이라면 로그인 게이트 모달 → 로그인 후 `SAVE_MODAL` 오픈
3. `SAVE_MODAL`에서 저장 가능한 레시피북 목록 조회 (saved/custom만 노출)
4. 기존 레시피북 선택 또는 "새 레시피북 만들기" 입력 후 생성
5. [저장] 버튼 클릭 → `POST /recipes/{id}/save` → 성공 시 모달 닫힘, save_count 증가, 저장 버튼 상태 변경

## Delivery Checklist
- [ ] 백엔드 계약 고정
- [ ] API 또는 adapter 연결
- [ ] 타입 반영
- [ ] UI 연결
- [ ] 상태 전이 / 권한 / 멱등성 테스트
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분
- [ ] `loading / empty / error / read-only / unauthorized` 상태 점검
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리
