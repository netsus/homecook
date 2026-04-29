# Slice: 17a-mypage-overview-history

## Goal
로그인한 사용자가 마이페이지에서 자신의 프로필 정보를 확인하고, 레시피북(시스템 자동 3개 + 커스텀)을 목록으로 관리(생성/이름 변경/삭제)하며, 장보기 기록을 최신순으로 재열람할 수 있도록 한다. MYPAGE shell과 두 탭(레시피북/장보기 기록)의 읽기·쓰기 기능을 이 슬라이스에서 닫는다.

## Branches

- 백엔드: `feature/be-17a-mypage-overview-history`
- 프론트엔드: `feature/fe-17a-mypage-overview-history`

## In Scope
- 화면: `MYPAGE` (계정 섹션 + 탭 영역), `MYPAGE_TAB_RECIPEBOOK`, `MYPAGE_TAB_SHOPPINGLISTS`
- API:
  - `GET /users/me` (12-1) — 내 정보 조회
  - `GET /recipe-books` (12-2) — 레시피북 목록 조회
  - `POST /recipe-books` (12-3) — 커스텀 레시피북 생성
  - `PATCH /recipe-books/{book_id}` (12-4) — 커스텀 레시피북 이름 변경
  - `DELETE /recipe-books/{book_id}` (12-5) — 커스텀 레시피북 삭제
  - `GET /shopping/lists` (12-8) — 장보기 기록 목록 조회
- 상태 전이: 없음 (읽기 + 레시피북 CRUD만)
- DB 영향: `users` (읽기), `recipe_books` (CRUD), `recipe_book_items` (recipe_count 집계), `recipe_likes` (liked count 집계), `recipes` (my_added count 집계), `shopping_lists` (읽기)
- Schema Change:
  - [x] 없음 (읽기 전용 + 기존 테이블 CRUD)

## Out of Scope
- `RECIPEBOOK_DETAIL` 상세 조회 및 레시피 목록 탐색 → `17b-recipebook-detail-remove`
- 레시피북에서 레시피 제거 (saved/custom/liked) → `17b-recipebook-detail-remove`
- `SETTINGS` 화면, 로그아웃, 화면 꺼짐 방지 토글, 닉네임 변경, 회원 탈퇴 → `17c-settings-account`
- 직접 레시피 등록(manual) / 유튜브 레시피 등록 흐름 → `18-manual-recipe-create`, `19-youtube-import`
- 레시피 저장/좋아요 액션 자체 (이미 slice 03, 04에서 구현 완료)
- 장보기 상세 재열람 UI 개선 (기존 `SHOPPING_DETAIL` read-only 모드는 10a/12a에서 이미 구현)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `16-leftovers` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `14-cook-session-start` | merged | [x] |
| `13-pantry-core` | merged | [x] |
| `12b-shopping-pantry-reflect` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이다.

## Backend First Contract

### GET /users/me (12-1)
- 권한: 🔒 로그인 필수
- 응답 `{ success, data, error }` — `data`:
  ```json
  {
    "id": "uuid",
    "nickname": "집밥러",
    "email": "user@example.com",
    "profile_image_url": "https://...",
    "social_provider": "kakao",
    "settings": { "screen_wake_lock": true }
  }
  ```
- 401: 미인증
- 404: 사용자 없음 (소프트 삭제 등)

### GET /recipe-books (12-2)
- 권한: 🔒 로그인 필수
- 응답 `{ success, data, error }` — `data`:
  ```json
  {
    "books": [
      { "id": "uuid", "name": "내가 추가한 레시피", "book_type": "my_added", "recipe_count": 12, "sort_order": 0 },
      { "id": "uuid", "name": "저장한 레시피", "book_type": "saved", "recipe_count": 8, "sort_order": 1 },
      { "id": "uuid", "name": "좋아요한 레시피", "book_type": "liked", "recipe_count": 25, "sort_order": 2 },
      { "id": "uuid", "name": "주말 파티", "book_type": "custom", "recipe_count": 5, "sort_order": 3 }
    ]
  }
  ```
- 시스템 레시피북은 실제 row (`recipe_books` 테이블)로 존재한다.
- `recipe_count` 산출:
  - `my_added`: `recipes WHERE created_by = user_id AND source_type IN ('youtube', 'manual')` COUNT
  - `saved`: `recipe_book_items WHERE book_id = saved 책 uuid` COUNT
  - `liked`: `recipe_likes WHERE user_id = user_id` COUNT
  - `custom`: `recipe_book_items WHERE book_id = 해당 custom 책 uuid` COUNT
- 401: 미인증

### POST /recipe-books (12-3)
- 권한: 🔒 로그인 필수
- Body: `{ "name": "string" }`
- 응답 (201) `{ success, data, error }` — `data`: 생성된 book 객체 (`book_type = 'custom'`)
- 401: 미인증
- 422: `name` 누락 또는 빈 문자열

### PATCH /recipe-books/{book_id} (12-4)
- 권한: 🔒 로그인 필수
- Body: `{ "name": "string" }`
- 시스템 레시피북(`my_added`/`saved`/`liked`) 이름 변경 불가 → 403
- 다른 유저의 레시피북 → 403
- 존재하지 않는 book_id → 404
- 401: 미인증

### DELETE /recipe-books/{book_id} (12-5)
- 권한: 🔒 로그인 필수
- 시스템 레시피북 삭제 불가 → 403
- 다른 유저의 레시피북 → 403
- 존재하지 않는 book_id → 404
- 200: 성공 `{ success, data: { deleted: true }, error }`
- 401: 미인증
- 멱등성: 이미 삭제된 book → 404

### GET /shopping/lists (12-8)
- 권한: 🔒 로그인 필수
- Query: `cursor` (string?), `limit` (int?, 기본 20)
- 응답 `{ success, data, error }` — `data`:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "title": "3/1 장보기",
        "date_range_start": "2026-03-01",
        "date_range_end": "2026-03-07",
        "is_completed": true,
        "item_count": 12,
        "created_at": "2026-03-01T09:00:00Z"
      }
    ],
    "next_cursor": "opaque-cursor",
    "has_next": false
  }
  ```
- 최신순 정렬 (`created_at DESC`)
- 401: 미인증

### 공통 에러 계약
- 모든 엔드포인트: `{ success: false, data: null, error: { code, message, fields[] } }`
- 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `RESOURCE_NOT_FOUND`, 422 `VALIDATION_ERROR`

### 소유자 검증
- `recipe-books` CRUD: `recipe_books.user_id = 요청 유저` 검증 필수
- `shopping/lists`: `shopping_lists.user_id = 요청 유저` 검증 필수

### 커스텀 전용 rename/delete 정책
- `book_type`이 `my_added`, `saved`, `liked`이면 PATCH/DELETE → 403 FORBIDDEN
- `custom`만 이름 변경 및 삭제 허용

### 시스템 레시피북 불변성
- 시스템 레시피북(my_added/saved/liked)은 row로 존재하나 이름/삭제 불가
- 회원가입 시 `recipe_books ×3` 자동 생성됨

### 멱등성 정책
- GET 엔드포인트: 자연적 멱등
- POST /recipe-books: 같은 이름 중복 생성 허용 (별도 unique constraint 없음)
- DELETE /recipe-books/{book_id}: 이미 없으면 404

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 프로필 + 레시피북 + 장보기 목록 로딩 스켈레톤
  - `empty`: 커스텀 레시피북 없음 → "아직 만든 레시피북이 없어요" + [새 레시피북 만들기]; 장보기 기록 없음 → "저장된 장보기 기록이 없어요. 플래너에서 장보기를 만들면 여기에 저장돼요."
  - `error`: 데이터 로드 실패 → "데이터를 불러오지 못했어요" + [다시 시도]
  - `read-only`: 해당 없음 (MYPAGE 자체는 항상 편집 가능)
  - `unauthorized`: 비로그인 → 로그인 게이트 모달, 로그인 성공 후 MYPAGE로 return-to-action
- 탭 전환: 레시피북(기본) ↔ 장보기 기록
- 장보기 기록 항목 탭 → `SHOPPING_DETAIL` (read-only 재열람 모드, 기존 구현 활용)
- 레시피북 항목 탭 → `RECIPEBOOK_DETAIL` (17b에서 구현, 이 슬라이스에서는 라우팅만 준비)

## Design Authority
- `MYPAGE` shell: h8 matrix에서 `prototype parity` 후보 (screen-level only)
- `MYPAGE_TAB_RECIPEBOOK`, `MYPAGE_TAB_SHOPPINGLISTS`: h8 matrix에서 `prototype-derived design` (shell parity에서 자동 승격 없음)
- UI risk: `new-screen`
- Anchor screen dependency: 없음 (MYPAGE는 anchor screen이 아님)
- Visual artifact: `ui/designs/MYPAGE.md` (Stage 1 생성 완료)
- Authority status: `required`
- Stage 4 evidence requirements: `mobile-default`, `mobile-narrow`
- Authority report paths: `ui/designs/authority/MYPAGE-authority.md` (Stage 4에서 생성 예정)
- generator artifact: `ui/designs/MYPAGE.md` (Stage 1 생성 완료)
- critic artifact: `ui/designs/critiques/MYPAGE-critique.md` (Stage 1 생성 완료, 등급: Green)
- Notes:
  - MYPAGE가 신규 화면이므로 authority review 필수
  - shell은 prototype parity 후보이나 sub-tab은 별도 증거 없이 자동 승격 불가
  - Stage 1에서 설계 와이어프레임 + critic 리뷰 완료 (크리티컬 0건, 마이너 3건 — Stage 4 해결)
  - Stage 4에서 Baemin prototype 참조하여 shell 구조 확정 후 screenshot evidence 제공 필요

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 신규 화면이므로 `confirmed` 전에 authority review 근거가 필요하다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-9 마이페이지, §2-13 레시피북 정책
- `docs/화면정의서-v1.5.1.md` — §19 MYPAGE
- `docs/api문서-v1.2.2.md` — §12 마이페이지 (12-1~12-5, 12-8)
- `docs/db설계-v1.3.1.md` — §10 레시피북, §6 장보기
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan
- **fixture baseline**: 인증된 사용자 1명 + 시스템 레시피북 3개 + 커스텀 레시피북 2개 + 장보기 기록 3개 (완료 2 + 미완료 1)
- **real DB smoke**: `pnpm dev:local-supabase` — 회원가입 후 recipe_books ×3 bootstrap 확인, 커스텀 레시피북 CRUD 확인, 장보기 기록 재열람 확인
- **seed / reset**: `pnpm dev:demo:reset` 또는 `pnpm local:reset:demo`
- **bootstrap row 기대치**:
  - `recipe_books ×3`: 회원가입 시 `my_added` / `saved` / `liked` 자동 생성
  - `meal_plan_columns ×4`: 이미 존재 (이전 슬라이스에서 검증됨)
  - auth user profile data: `users` 테이블에 nickname, social_provider 등 존재
- **blocker 조건**:
  - `recipe_books` 테이블 부재
  - `recipe_book_items` 테이블 부재
  - `shopping_lists` 테이블 부재
  - `users` 테이블 부재
  - 회원가입 bootstrap (recipe_books ×3) 미완료
  - seed 데이터 미준비

## Key Rules
- 시스템 레시피북(my_added/saved/liked)은 이름 변경, 삭제 불가 (403)
- 커스텀 레시피북만 CRUD 대상
- 다른 유저의 리소스 접근 시 403
- 장보기 기록은 read-only 재열람만 제공 (수정/삭제 불가)
- 모든 API는 `{ success, data, error }` envelope
- 레시피북 목록에서 `recipe_count`는 book_type별 source of truth에서 집계
- 탭 기본값: 레시피북 탭

## Contract Evolution Candidates (Optional)
없음. 현재 공식 문서의 API 계약으로 충분하다.

## Primary User Path
1. 사용자가 하단 탭에서 `마이페이지`를 탭한다.
2. 상단에 닉네임, 프로필 이미지, 로그인 제공자가 표시된다. 톱니바퀴 버튼은 보이나 `SETTINGS`는 17c에서 구현.
3. 기본 탭인 **레시피북** 탭에서 시스템 레시피북 3개(내가 추가한/저장한/좋아요한)와 커스텀 레시피북 목록을 확인한다.
4. `[+ 새 레시피북]`을 탭하여 커스텀 레시피북을 생성한다.
5. 커스텀 레시피북의 점3개(⋯) 메뉴에서 이름을 변경하거나 삭제한다.
6. **장보기 기록** 탭으로 전환하여 저장된 장보기 리스트를 최신순으로 확인한다.
7. 장보기 기록 항목을 탭하면 `SHOPPING_DETAIL` read-only 모드로 재열람한다.

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] 백엔드 계약 고정 (`GET /users/me`, full `GET /recipe-books`, `POST/PATCH/DELETE /recipe-books`, `GET /shopping/lists`) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (Route Handler 4개 추가/확장) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (`RecipeBookSummary`, update/delete, shopping history types) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (system-book 403, owner filters, 404/422, cursor history) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 (Stage 2 route tests + Stage 4 fixture follow-up retained) <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (`ensureUserBootstrapState` before profile/books/history) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->

## Stage 2 Backend Evidence

- 2026-04-30 Codex implemented `GET /api/v1/users/me`, expanded `GET /api/v1/recipe-books` to return system + custom books with type-specific `recipe_count`, added `PATCH /api/v1/recipe-books/{book_id}`, `DELETE /api/v1/recipe-books/{book_id}`, and added `GET /api/v1/shopping/lists` history pagination.
- Regression tests: `pnpm exec vitest run tests/mypage.backend.test.ts tests/recipe-books-route.test.ts tests/recipe-save-route.test.ts tests/08b-recipebook-picker.backend.test.ts` passed (34 tests).
- Type check: `pnpm typecheck` passed.
- Lint: `pnpm lint` passed with existing `<img>` warnings in unrelated prior UI files.
- Backend gate: `pnpm verify:backend` passed (lint/typecheck/product Vitest 433 tests/build/security Playwright 9 tests).
- Real smoke: `pnpm local:reset:demo` passed; local Supabase reset applied migrations and seed output confirmed system books (`내가 추가한 레시피`, `저장한 레시피`, `좋아요한 레시피`) plus main custom/saved book baseline.

## Stage 4 Frontend Evidence

- 2026-04-30 Claude implemented MYPAGE frontend on `feature/fe-17a-mypage-overview-history`:
  - API client: `lib/api/mypage.ts` — 6 endpoint functions (`fetchUserProfile`, `fetchRecipeBooks`, `createRecipeBook`, `renameRecipeBook`, `deleteRecipeBook`, `fetchShoppingHistory`)
  - Screen component: `components/mypage/mypage-screen.tsx` — auth state machine, view state machine, profile section, tab bar, recipe book tab with system/custom sections and CRUD, shopping history tab with cursor pagination, delete confirm dialog, toast notifications
  - Route page: `app/mypage/page.tsx` — server component with `getServerAuthUser()` + `AppShell currentTab="mypage"`
  - Bottom tabs: `components/layout/bottom-tabs.tsx` — updated mypage href from `"#"` to `"/mypage"`
  - Product config: `vitest.product.config.ts` — added `tests/mypage-*.test.tsx` pattern
  - Authority report: `ui/designs/authority/MYPAGE-authority.md`
- 5 mandatory UI states: loading (skeleton), empty (custom books + shopping), error (retry), read-only (N/A), unauthorized (login gate with `SocialLoginButtons nextPath="/mypage"`)
- Vitest: `pnpm exec vitest run tests/mypage-screen.test.tsx` — 18 tests passed
- Playwright: `tests/e2e/slice-17a-mypage.spec.ts` — 9 E2E test scenarios
- Type check: `npx tsc --noEmit` passed with 0 errors
- Backend regression: `pnpm exec vitest run tests/mypage.backend.test.ts` — 5 tests passed
