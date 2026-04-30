# Slice: 17b-recipebook-detail-remove

## Goal
로그인한 사용자가 마이페이지 레시피북 목록에서 특정 레시피북을 탭하여 상세 화면(`RECIPEBOOK_DETAIL`)으로 진입하고, 레시피 목록을 cursor pagination으로 탐색하며, saved/custom 책에서 레시피를 제거하거나 liked 책에서 좋아요를 해제할 수 있도록 한다. `my_added` 책의 레시피는 제거 불가(403)임을 지킨다.

## Branches

- 백엔드: `feature/be-17b-recipebook-detail-remove`
- 프론트엔드: `feature/fe-17b-recipebook-detail-remove`

## In Scope
- 화면: `RECIPEBOOK_DETAIL` (레시피북 상세 — 레시피 리스트 + 제거 액션)
- API:
  - `GET /recipe-books/{book_id}/recipes` (12-6) — 레시피북 상세 레시피 목록 조회 (cursor pagination)
  - `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` (12-7) — 레시피북에서 레시피 제거 (book_type별 분기)
- 상태 전이: 없음 (읽기 + 삭제만)
- DB 영향: `recipe_books` (읽기, 소유자 검증), `recipe_book_items` (읽기, 삭제), `recipe_likes` (삭제 — liked 해제), `recipes` (비정규화 카운트 갱신: `like_count`, `save_count`)
- Schema Change:
  - [x] 없음 (기존 테이블 읽기 + 삭제)

## Out of Scope
- 레시피북 목록/CRUD (MYPAGE shell) — `17a-mypage-overview-history`에서 구현 완료
- 레시피북에 레시피 추가(저장/좋아요) — `03-recipe-like`, `04-recipe-save`에서 구현 완료
- 레시피 상세 조회 — `01-discovery-detail-auth`에서 구현 완료 (탭 시 `RECIPE_DETAIL`로 이동만)
- SETTINGS, 로그아웃, 닉네임 변경, 회원 탈퇴 — `17c-settings-account`
- 직접 레시피 등록 / 유튜브 등록 — `18-manual-recipe-create`, `19-youtube-import`

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `17a-mypage-overview-history` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이다.

## Backend First Contract

### GET /recipe-books/{book_id}/recipes (12-6)
- 권한: 로그인 필수
- Path: `book_id` (uuid)
- Query: `cursor` (string?), `limit` (int?, 기본 20)
- 소유자 검증: `recipe_books.user_id = 요청 유저` 필수. 다른 유저 → 403 FORBIDDEN
- 존재하지 않는 book_id → 404 RESOURCE_NOT_FOUND
- 응답 `{ success, data, error }` — `data`:
  ```json
  {
    "items": [
      {
        "recipe_id": "uuid",
        "title": "김치찌개",
        "thumbnail_url": "https://...",
        "tags": ["한식", "찌개"],
        "added_at": "2026-03-01T10:00:00Z"
      }
    ],
    "next_cursor": "opaque-cursor",
    "has_next": false
  }
  ```
- `items` 정렬: `added_at DESC` (최신 추가순)
- `added_at` 산출 (서버 내부 분기, 응답 스키마에 `book_type` 포함하지 않음):
  - `my_added`: `recipes.created_at`
  - `saved`/`custom`: `recipe_book_items.added_at`
  - `liked`: `recipe_likes.created_at`
- 프론트엔드 `book_type` 참조: MYPAGE 레시피북 목록(`GET /recipe-books`, 12-2)에서 이미 조회한 book 객체의 `book_type`을 클라이언트 상태로 전달하여 제거 라벨/정책을 결정한다. `GET /recipe-books/{book_id}/recipes` 응답에 `book_type`을 포함하지 않는다.
- 401: 미인증

### DELETE /recipe-books/{book_id}/recipes/{recipe_id} (12-7)
- 권한: 로그인 필수
- Path: `book_id` (uuid), `recipe_id` (uuid)
- 소유자 검증: `recipe_books.user_id = 요청 유저` 필수. 다른 유저 → 403 FORBIDDEN
- 존재하지 않는 book_id → 404 RESOURCE_NOT_FOUND
- book_type별 분기:
  - `liked`: `recipe_likes` WHERE `user_id = 요청 유저 AND recipe_id = recipe_id` DELETE + `recipes.like_count -= 1`
  - `saved`/`custom`: `recipe_book_items` WHERE `book_id = book_id AND recipe_id = recipe_id` DELETE + `recipes.save_count -= 1`
  - `my_added`: 403 FORBIDDEN (본인이 추가한 레시피는 레시피북에서 제거 불가)
- 200: 성공 `{ success, data: { deleted: true }, error }`
- 존재하지 않는 recipe_id 또는 이미 제거됨 → 404 RESOURCE_NOT_FOUND
- 401: 미인증

### 공통 에러 계약
- 모든 엔드포인트: `{ success: false, data: null, error: { code, message, fields[] } }`
- 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `RESOURCE_NOT_FOUND`

### 소유자 검증
- `recipe_books.user_id = 요청 유저` 검증 필수
- 다른 유저의 레시피북 접근 → 403

### 제거 정책
- `liked` 책: 좋아요 해제 (`recipe_likes` 삭제, `like_count` 감소)
- `saved`/`custom` 책: 레시피북 항목 제거 (`recipe_book_items` 삭제, `save_count` 감소)
- `my_added` 책: 제거 불가 → 403 FORBIDDEN

### 멱등성 정책
- GET: 자연적 멱등
- DELETE: 이미 제거된 항목 → 404

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 레시피 목록 로딩 스켈레톤
  - `empty`: 레시피 0건 → "아직 이 레시피북에 레시피가 없어요"
  - `error`: 데이터 로드 실패 → "데이터를 불러오지 못했어요" + [다시 시도]
  - `read-only`: 해당 없음 (제거 가능한 화면)
  - `unauthorized`: 비로그인 → 로그인 게이트 모달, 로그인 성공 후 RECIPEBOOK_DETAIL로 return-to-action
- 진입 경로: MYPAGE 레시피북 탭 → 레시피북 항목 탭 → `RECIPEBOOK_DETAIL`
- 레시피 카드 탭 → `RECIPE_DETAIL` (기존 구현 활용)
- 레시피 제거 버튼: MYPAGE에서 전달받은 book_type(클라이언트 상태)에 따라 다른 라벨
  - `liked`: "좋아요 해제"
  - `saved`/`custom`: "제거"
  - `my_added`: 제거 버튼 미표시
- 제거 성공 시 목록에서 optimistic removal + toast 피드백
- cursor pagination: 무한 스크롤 또는 "더 보기" 패턴

## Design Authority
- UI risk: `low-risk`
- h8 matrix 분류: `prototype-derived design` (derived unless separately promoted later)
- Anchor screen dependency: 없음 (RECIPEBOOK_DETAIL은 anchor screen이 아님)
- Visual artifact: 해당 없음 (low-risk, prototype-derived — 별도 설계 와이어프레임 불필요)
- Authority status: `not-required`
- generator artifact: 불필요 (low-risk prototype-derived design)
- critic artifact: 불필요
- Notes:
  - h8 matrix에서 `RECIPEBOOK_DETAIL`은 `prototype-derived design`으로 분류
  - anchor screen(HOME, RECIPE_DETAIL, PLANNER_WEEK)이 아니며 anchor-extension도 아님
  - 표준 리스트+제거 관리 화면으로 MYPAGE sub-view에 해당
  - `product-design-authority.md` 기준 low-risk UI 변경은 authority review 불필요
  - Stage 4에서 Baemin prototype-derived 스타일 참조 구현 가능

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후)
> low-risk prototype-derived design이므로 authority review 불필요. Stage 5 Codex public review에서 시각 품질만 확인하면 된다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-9 마이페이지, §2-13 레시피북 정책
- `docs/화면정의서-v1.5.1.md` — §20 RECIPEBOOK_DETAIL
- `docs/api문서-v1.2.2.md` — §12-6, §12-7
- `docs/db설계-v1.3.1.md` — §10 레시피북, §10-2 recipe_book_items, §11 recipe_likes
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`

## QA / Test Data Plan
- **fixture baseline**: 인증된 사용자 1명 + 시스템 레시피북 3개(my_added/saved/liked) + 커스텀 레시피북 1개 + 각 책에 레시피 2~3개씩 할당
- **real DB smoke**: `pnpm dev:local-supabase` — 레시피북 상세 진입, 레시피 목록 표시, saved 책에서 레시피 제거, liked 책에서 좋아요 해제 확인
- **seed / reset**: `pnpm dev:demo:reset` 또는 `pnpm local:reset:demo`
- **bootstrap row 기대치**:
  - `recipe_books ×3`: 회원가입 시 `my_added` / `saved` / `liked` 자동 생성 (17a에서 검증됨)
  - 각 시스템 책에 레시피가 할당되어 있어야 함 (seed 의존)
- **blocker 조건**:
  - `recipe_books` 테이블 부재
  - `recipe_book_items` 테이블 부재
  - `recipe_likes` 테이블 부재
  - `recipes` 테이블 부재
  - 회원가입 bootstrap (recipe_books ×3) 미완료
  - seed 데이터 미준비

## Key Rules
- `my_added` 책의 레시피는 제거 불가 (403 FORBIDDEN) — 제거 버튼 자체를 미표시
- `liked` 책 제거 = 좋아요 해제: `recipe_likes` 삭제 + `recipes.like_count -= 1`
- `saved`/`custom` 책 제거: `recipe_book_items` 삭제 + `recipes.save_count -= 1`
- 다른 유저의 레시피북 접근 시 403
- 모든 API는 `{ success, data, error }` envelope
- 비정규화 카운트(`like_count`, `save_count`) 동기 갱신 필수
- cursor pagination 기본 limit=20
- 제거 후 optimistic UI 업데이트 + 실패 시 rollback

## Contract Evolution Candidates (Optional)
없음. 현재 공식 문서의 API 계약으로 충분하다.

## Primary User Path
1. 사용자가 `MYPAGE` 레시피북 탭에서 특정 레시피북(예: "저장한 레시피")을 탭한다.
2. `RECIPEBOOK_DETAIL` 화면에 해당 레시피북의 레시피 목록이 카드 형태로 표시된다.
3. 레시피 카드를 탭하면 `RECIPE_DETAIL`로 이동한다.
4. 레시피 카드의 제거 버튼을 탭하면:
   - `saved`/`custom` 책: 레시피가 목록에서 제거된다.
   - `liked` 책: 좋아요가 해제되고 목록에서 제거된다.
5. `my_added` 책에서는 제거 버튼이 표시되지 않는다.
6. 스크롤 시 추가 레시피가 로드된다 (cursor pagination).

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [ ] 백엔드 계약 고정 (`GET /recipe-books/{book_id}/recipes`, `DELETE /recipe-books/{book_id}/recipes/{recipe_id}`) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결 (Route Handler 2개 추가) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 (`RecipeBookDetailItem` with recipe_id/title/thumbnail_url/tags/added_at, delete response types) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 (owner-guard, my_added 403, liked/saved/custom 분기, 404, count 갱신) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
