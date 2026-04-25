# Slice: 08b-meal-add-books-pantry

## Goal
플래너에서 식사를 추가할 때 레시피북 경로와 팬트리 기반 추천 경로를 제공한다. `MENU_ADD` 화면의 레시피북 버튼과 팬트리 버튼을 활성화하고, 레시피북 상세에서 레시피를 선택하거나 팬트리 기반 추천 목록에서 레시피를 선택한 뒤 계획 인분을 입력하여 Meal을 생성할 수 있다. 이번 슬라이스는 남은요리/유튜브/직접등록 경로는 제외하고 **레시피북과 팬트리 추천 path만** 닫는다.

## Branches

- 백엔드: `feature/be-08b-meal-add-books-pantry`
- 프론트엔드: `feature/fe-08b-meal-add-books-pantry`

## In Scope
- 화면:
  - `MENU_ADD` — 레시피북 버튼과 팬트리 버튼 활성화
  - `RECIPEBOOK_SELECTOR` — 레시피북 목록 선택 컴포넌트 (신규)
  - `RECIPEBOOK_DETAIL_PICKER` — 레시피북 내 레시피 목록 선택 컴포넌트 (신규)
  - `PANTRY_MATCH_PICKER` — 팬트리 기반 레시피 추천 목록 선택 컴포넌트 (신규)
- API:
  - `GET /recipe-books` (기존 재사용, 레시피북 목록 조회)
  - `GET /recipe-books/{book_id}/recipes` (기존 재사용, 레시피북 내 레시피 목록)
  - `GET /recipes/pantry-match` (기존 재사용, 팬트리 기반 추천)
  - `POST /meals` (기존 재사용, `recipe_id` + `planned_servings` 기반 생성)
- 상태 전이:
  - Meal 생성 시 `status='registered'` 고정
- DB 영향:
  - `meals` — INSERT (새 식사 등록)
  - `recipe_books` — 조회만 (수정 없음)
  - `pantry_items` — 조회만 (수정 없음)
  - `recipes` — 조회만 (수정 없음)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

## Out of Scope
- 남은요리에서 추가 (`16`)
- 직접 레시피 등록 (`18`)
- 유튜브 링크로 추가 (`19`)
- 레시피북 생성/수정/삭제 (마이페이지 슬라이스에서 처리)
- 팬트리 항목 추가/삭제 (팬트리 슬라이스에서 처리)

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

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인했다.

## Backend First Contract

### `GET /recipe-books` (기존 재사용)
- Query: 없음
- Response: `{ success: true, data: { books: RecipeBook[] } }`
- 권한: 로그인 필수 (401 Unauthorized)
- 기능: 현재 사용자의 레시피북 목록 조회 (시스템 책 + 커스텀 책)
- RecipeBook: `{ id, name, book_type, recipe_count, sort_order }`

### `GET /recipe-books/{book_id}/recipes` (기존 재사용)
- Path: `book_id` (uuid)
- Query: `?cursor=<cursor>&limit=<N>`
- Response: `{ success: true, data: { items: Recipe[], next_cursor, has_next } }`
- 권한: 로그인 필수 (401 Unauthorized)
- 소유자 검증: book_id 소유자와 현재 user_id 일치 확인 (403 Forbidden)
- 기능: 특정 레시피북의 레시피 목록 조회, 커서 페이지네이션

### `GET /recipes/pantry-match` (기존 재사용)
- Query: `?cursor=<cursor>&limit=<N>`
- Response: `{ success: true, data: { items: Recipe[] } }`
- Recipe: `{ id, title, thumbnail_url, match_score, matched_ingredients, total_ingredients, missing_ingredients }`
- 권한: 로그인 필수 (401 Unauthorized)
- 기능: 현재 사용자의 팬트리 기반 레시피 추천, 매칭 점수 순 정렬

### `POST /meals` (기존 재사용)
- Request body:
  ```json
  {
    "plan_date": "2026-04-24",
    "column_id": "uuid",
    "recipe_id": "uuid",
    "planned_servings": 2
  }
  ```
- Response: `{ success: true, data: { id, plan_date, column_id, recipe_id, planned_servings, status: "registered", ... } }`
- 권한: 로그인 필수 (401 Unauthorized)
- 소유자 검증: column_id 소유자와 현재 user_id 일치 확인 (403 Forbidden)
- 상태 전이: 새 Meal은 항상 `status='registered'`로 시작
- 멱등성: 중복 생성 방지는 클라이언트 책임 (백엔드는 동일 date/column_id/recipe_id 조합도 허용)

### Error 케이스
- 401: 비로그인 상태에서 로그인 필수 API 호출
- 403: book_id 또는 column_id 소유자 불일치
- 404: recipe_id 미존재, column_id 미존재, book_id 미존재
- 422: planned_servings 음수 또는 0

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading` — 레시피북 목록 로딩, 레시피북 내 레시피 로딩, 팬트리 추천 로딩, Meal 생성 중
  - `empty` — 레시피북 없음, 레시피북 내 레시피 없음, 팬트리 기반 추천 없음
  - `error` — 네트워크 오류, 서버 오류, 권한 오류
  - `read-only` — N/A (이번 슬라이스는 생성 흐름만)
  - `unauthorized` — 로그인하지 않은 상태에서 API 호출 시 로그인 게이트 + return-to-action
- 로그인 보호 액션: 모든 API 호출 시 로그인 필요. return-to-action 지원.

## Design Authority
- UI risk: `low-risk` (MENU_ADD 기존 화면에 버튼 활성화만 추가, picker 컴포넌트는 08a RECIPE_SEARCH_PICKER와 유사한 패턴)
- Anchor screen dependency: 없음
- Visual artifact: Stage 1에서 간단한 wireframe 제공, Stage 4에서 screenshot evidence 필요 없음 (low-risk)
- Authority status: `not-required`
- Notes: `MENU_ADD`는 08a에서 이미 shell을 구현했으므로, 이번 슬라이스는 레시피북 버튼과 팬트리 버튼을 활성화하고 해당 picker 컴포넌트를 연결하는 작업만 진행한다. picker 컴포넌트는 08a의 `RECIPE_SEARCH_PICKER` 패턴을 참조하여 일관성을 유지한다.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 기본값, 기능 완성 우선
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 후 전환 (low-risk이므로 생략 가능)
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후 (low-risk이므로 Stage 6에서 lightweight check)
- [ ] N/A — BE-only 슬라이스

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후, low-risk이므로 생략 가능)
>   → `confirmed` (Stage 6에서 lightweight design check)
> low-risk UI change이므로 Stage 5 public review를 생략하고 Stage 6에서 기능 동작 + token/spacing drift + 핵심 상태 UI 회귀만 점검한다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` (§1-3 식단 계획, §1-2 레시피북)
- `docs/화면정의서-v1.5.0.md` (§8 MENU_ADD)
- `docs/api문서-v1.2.2.md` (§5 식사 추가, §12 마이페이지)
- `docs/db설계-v1.3.1.md` (meals, recipe_books, pantry_items, recipes)

## QA / Test Data Plan
- fixture baseline: 레시피북 시스템 책 3개 (my_added, saved, liked) + 커스텀 책 1~2개, 각 책에 레시피 2~5개, 팬트리 항목 5~10개
- real DB smoke 경로: `pnpm dev:demo` 또는 `pnpm dev:local-supabase`로 로그인 후 마이페이지에서 레시피북 확인, 팬트리 추가 후 팬트리 기반 추천 확인, `MENU_ADD`에서 레시피북/팬트리 버튼으로 Meal 생성 흐름 검증
- seed / reset 명령: `pnpm db:seed` (로컬 Supabase용), `pnpm db:reset` (로컬 Supabase 초기화)
- bootstrap이 생성해야 하는 시스템 row: 회원가입 시 자동 생성되는 시스템 레시피북 3개 (`my_added`, `saved`, `liked`)
- blocker 조건: 시스템 레시피북 미생성, 팬트리 테이블 부재, recipe_books 테이블 부재

## Key Rules
- 레시피북 목록 조회 시 시스템 책과 커스텀 책을 모두 포함한다.
- 팬트리 기반 추천은 현재 사용자의 팬트리 항목을 기준으로 매칭 점수를 계산한다.
- Meal 생성 시 `status='registered'` 고정, `leftover_dish_id`는 이번 슬라이스 범위 외.
- 레시피북/팬트리 조회는 로그인 필수, 비로그인 시 401 반환 후 로그인 게이트.
- column_id 소유자와 user_id 불일치 시 403 반환.
- 멱등성: Meal 중복 생성 방지는 클라이언트에서 처리.

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 사용자가 `PLANNER_WEEK`에서 특정 날짜/끼니의 + 버튼을 클릭 → `MENU_ADD` 진입
2. `MENU_ADD`에서 "레시피북에서 추가" 버튼 클릭 → `RECIPEBOOK_SELECTOR` 팝업 오픈
3. 레시피북 선택 (예: "저장한 레시피") → `RECIPEBOOK_DETAIL_PICKER` 화면으로 전환
4. 레시피 선택 → 계획 인분 입력 모달 → [추가] 클릭 → `POST /meals` 호출 → `PLANNER_WEEK`로 복귀, 새 Meal 카드 표시
5. 또는 `MENU_ADD`에서 "팬트리만 이용" 버튼 클릭 → `PANTRY_MATCH_PICKER` 화면 오픈
6. 팬트리 기반 추천 레시피 선택 → 계획 인분 입력 모달 → [추가] 클릭 → `POST /meals` 호출 → `PLANNER_WEEK`로 복귀, 새 Meal 카드 표시

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 Codex rebuttal을 받아들인 checklist는 checkbox를 바꾸지 않고 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가해 닫는다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=5,6 -->
