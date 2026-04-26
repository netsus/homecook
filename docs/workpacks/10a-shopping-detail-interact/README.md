# Slice: 10a-shopping-detail-interact

## Goal
장보기 리스트 생성 후 `SHOPPING_DETAIL` 화면에서 사용자는 구매할 재료를 체크하고, 팬트리에 이미 있는 재료를 제외 섹션과 구매 섹션 사이에서 자유롭게 이동할 수 있다. 제외 섹션으로 이동한 재료는 자동으로 구매 체크가 해제되며(`exclude→uncheck` 규칙), 사용자는 장보기를 실제로 수행하면서 필요에 따라 항목을 조정할 수 있다. 완료된 장보기 리스트는 read-only 모드로 전환되어 수정할 수 없으며, 마이페이지에서 재열람 시에도 같은 read-only 상태를 유지한다.

## Branches

- 백엔드: `feature/be-10a-shopping-detail-interact`
- 프론트엔드: `feature/fe-10a-shopping-detail-interact`

## In Scope
- 화면:
  - `SHOPPING_DETAIL` (편집 모드: 미완료 리스트 조회/체크/제외 토글)
  - `SHOPPING_DETAIL` (read-only 모드: 완료된 리스트 재열람)
- API:
  - `GET /shopping/lists/{list_id}` (장보기 리스트 상세 조회)
  - `PATCH /shopping/lists/{list_id}/items/{item_id}` (체크 토글 + 팬트리 제외 토글)
- 상태 전이:
  - `shopping_list_items.is_checked`: `false ↔ true` (구매 체크 토글)
  - `shopping_list_items.is_pantry_excluded`: `false ↔ true` (팬트리 제외 섹션 이동)
  - **제외 규칙**: `is_pantry_excluded=true`로 변경 시 서버가 `is_checked=false`로 자동 정리
- DB 영향:
  - `shopping_lists` (READ)
  - `shopping_list_items` (READ, UPDATE)
  - `shopping_list_recipes` (READ)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 장보기 순서 변경 (드래그&드롭) — slice 11
- 장보기 완료 처리 — slice 12a
- 팬트리 반영 선택 팝업 — slice 12b
- 장보기 공유 텍스트 — slice 10b
- 장보기 기록 목록 조회 — slice 17a

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `09-shopping-preview-create` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### GET /shopping/lists/{list_id}
- **권한**: 로그인 필수 (401)
- **Path**: `list_id` (uuid)
- **Response**: `{ success, data, error }`
  - `data`: 장보기 리스트 객체
    - `id`, `title`, `date_range_start`, `date_range_end`, `is_completed`, `completed_at`, `created_at`, `updated_at`
    - `recipes[]`: 레시피별 인분 기록 (`recipe_id`, `recipe_name`, `recipe_thumbnail`, `shopping_servings`, `planned_servings_total`)
    - `items[]`: 재료 목록 (`id`, `ingredient_id`, `display_text`, `amounts_json`, `is_checked`, `is_pantry_excluded`, `added_to_pantry`, `sort_order`)
  - 아이템 정렬: `sort_order ASC`, tie-break: `id ASC`
- **검증**:
  - 소유자 일치: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
  - 존재 여부: `list_id` 유효성 (404)
- **Error**:
  - 401: UNAUTHORIZED (토큰 없음)
  - 403: FORBIDDEN (타인 리소스 접근)
  - 404: RESOURCE_NOT_FOUND (리스트 없음)
  - 500: INTERNAL_ERROR

### PATCH /shopping/lists/{list_id}/items/{item_id}
- **권한**: 로그인 필수 (401)
- **Path**: `list_id` (uuid), `item_id` (uuid)
- **Body**:
  ```json
  {
    "is_checked": true,           // optional, 구매 체크 토글
    "is_pantry_excluded": false   // optional, 팬트리 제외 섹션 이동 토글
  }
  ```
- **Response**: `{ success, data, error }`
  - `data`: 업데이트된 item 객체 (전체 필드 포함)
- **검증**:
  - 소유자 일치: `shopping_lists.user_id = 요청 user_id` (403)
  - item 소속 확인: `shopping_list_items.shopping_list_id = list_id` (404)
  - read-only 정책: `shopping_lists.is_completed=true`이면 수정 불가 (409)
- **상태 전이**:
  - `is_pantry_excluded=true`로 변경 시 서버가 `is_checked=false`로 자동 정리 (`exclude→uncheck` 규칙)
- **멱등성**: 동일 값으로 재호출 시 200 + 동일 결과 반환
- **Error**:
  - 401: UNAUTHORIZED
  - 403: FORBIDDEN (소유자 불일치)
  - 404: RESOURCE_NOT_FOUND (리스트 또는 아이템 없음)
  - 409: CONFLICT (완료된 리스트 수정 시도)
  - 422: VALIDATION_ERROR (빈 body, 유효하지 않은 필드)
  - 500: INTERNAL_ERROR

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 리스트 조회 중, 항목 업데이트 중
  - `empty`: 구매 섹션이 비었을 때 ("팬트리에 이미 있어서 장볼 재료가 없어요")
  - `error`: API 호출 실패
  - `read-only`: 완료된 리스트 재열람 시 ("완료된 장보기 기록은 수정할 수 없어요"), 체크/제외 토글 비활성화
  - `unauthorized`: 로그인 필요 (실질적으로는 드물지만 401 처리 포함)
- 로그인 보호 액션: 장보기 상세는 이미 로그인 게이트 통과 후 진입하므로 return-to-action은 상위 플로우에서 처리됨

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: `PLANNER_WEEK` (장보기 생성 → 상세 자동 이동)
- Visual artifact: `ui/designs/SHOPPING_DETAIL.md` (Stage 1에서 생성), screenshot evidence는 Stage 4에서 확보
- Authority status: `reviewed`
- Notes: 신규 화면이므로 Stage 1에서 design-generator/design-critic 실행 필수, Stage 4에서 screenshot/Figma evidence 기반 authority review 필요

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` § 1-6 장보기, § 2-12 장보기 상세 화면 정책
- `docs/화면정의서-v1.5.0.md` § 0-6 장보기 합산 표시 규칙, § 0-7 장보기 상세 공통 정책, § 12 SHOPPING_DETAIL
- `docs/api문서-v1.2.2.md` § 8-3 GET /shopping/lists/{id}, § 8-4 PATCH /shopping/lists/{id}/items/{id}
- `docs/db설계-v1.3.1.md` (shopping_lists, shopping_list_items, shopping_list_recipes, ingredients)

## QA / Test Data Plan
- **Fixture baseline**:
  - 로그인 유저 1명 (auth override)
  - `shopping_lists` × 2개 (하나는 `is_completed=false`, 하나는 `is_completed=true`)
  - `shopping_list_items` × 다수 (구매 섹션 / 제외 섹션 혼합, `is_checked` / `is_pantry_excluded` 다양)
  - `shopping_list_recipes` × 몇 개 (리스트별 레시피 기록)
  - `ingredients` × 다수 (재료 마스터)
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - seed script로 위 baseline 데이터 생성 후 브라우저에서 장보기 상세 → 체크 토글 → 제외 토글 → read-only 재열람 흐름 확인
- **Bootstrap 요구사항**:
  - `meal_plan_columns` (회원가입 시 자동 생성, 4끼 고정)
  - `recipe_books` (회원가입 시 기본 3개 생성)
  - owning flow: 회원가입 → 자동 생성 로직 (slice 01 bootstrap)
  - 기대 row: `meal_plan_columns` × 4 (아침, 점심, 간식, 저녁), `recipe_books` × 3
- **Blocker 조건**:
  - `shopping_lists`, `shopping_list_items`, `ingredients` 테이블 부재
  - 로컬 Supabase에 seed가 없어서 리스트 조회 시 404만 나오는 상태

## Key Rules
- **`exclude→uncheck` 규칙**: `is_pantry_excluded=true`로 변경 시 서버가 `is_checked=false`로 자동 정리
  - 이유: 팬트리 제외 섹션 = "안 사는 항목"이므로 구매 체크가 의미 없음
- **read-only 정책**: `shopping_lists.is_completed=true`인 리스트는 수정 불가 (409 CONFLICT)
  - 완료된 리스트에서 `PATCH /shopping/lists/{id}/items/{id}` 호출 시 409 반환
  - 프론트는 read-only 모드에서 체크박스 / 토글 버튼 비활성화
- **정렬 규칙**: `shopping_list_items`는 `sort_order ASC`, 동일 시 `id ASC`
  - 드래그 순서 변경은 slice 11에서 처리, 이 슬라이스는 정렬된 순서대로 표시만
- **소유자 검증**: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
- **멱등성**: 체크 토글 API는 멱등함 (동일 값 재호출 시 200 + 동일 결과)
- **두 섹션 구성**:
  - 구매 섹션: `is_pantry_excluded=false` 항목
  - 팬트리 제외 섹션: `is_pantry_excluded=true` 항목
- **변환 불가 단위 복합 표기**: 합산 규칙은 API가 처리, 프론트는 `amounts_json` 기반으로 표시

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 플래너에서 장보기 생성 (slice 09) → `SHOPPING_DETAIL`로 자동 이동
2. 구매 섹션에서 항목 체크 (구매 완료 표시)
3. 팬트리에 이미 있는 재료를 제외 섹션으로 이동 (is_pantry_excluded 토글)
4. 제외된 재료 중 필요한 것을 다시 구매 섹션으로 되살리기
5. 마이페이지 장보기 기록에서 완료된 리스트 재열람 시 read-only 모드 확인

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 Codex rebuttal을 받아들인 checklist는 checkbox를 바꾸지 않고 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가해 닫는다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->


