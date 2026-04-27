# Slice: 12a-shopping-complete

## Goal
사용자가 장보기 리스트에서 실제로 필요한 재료를 구매했다면, [장보기 완료] 버튼을 눌러 해당 장보기 리스트를 완료 상태로 전환하고 연결된 식사들의 상태를 `registered` → `shopping_done`으로 자동 전이한다. 완료 직후 장보기 리스트는 read-only로 잠기며, 이후 수정 API(체크/제외/순서 변경) 호출 시 409 CONFLICT를 반환한다. 완료 API는 멱등하게 동작하며, 이미 완료된 리스트를 재호출해도 200 + 동일 결과를 반환한다. 팬트리 반영은 slice 12b에서 분리 처리하며, 이 슬라이스는 장보기 완료 core 흐름만 담당한다.

## Branches

- 백엔드: `feature/be-12a-shopping-complete`
- 프론트엔드: `feature/fe-12a-shopping-complete`

## In Scope
- 화면:
  - `SHOPPING_DETAIL` (미완료 리스트에서 [장보기 완료] 버튼 노출)
  - `SHOPPING_DETAIL` (완료 후 read-only 전환 확인: 체크/제외/순서 변경 컨트롤 비활성화)
- API:
  - `POST /shopping/lists/{list_id}/complete` (장보기 완료, 기본 응답만, `add_to_pantry_item_ids` 없음)
- 상태 전이:
  - `shopping_lists.is_completed`: `false` → `true`
  - `shopping_lists.completed_at`: `null` → `현재 시각`
  - `meals.status`: `registered` → `shopping_done` (해당 리스트에 연결된 식사만)
- DB 영향:
  - `shopping_lists` (READ, UPDATE: `is_completed`, `completed_at`)
  - `shopping_list_items` (READ: 완료 응답 생성용)
  - `meals` (READ, UPDATE: `status` 전이)
  - `shopping_list_recipes` (READ: 리스트에 연결된 레시피 확인)
- Schema Change:
  - [x] 없음 (기존 `shopping_lists.is_completed`, `completed_at`, `meals.status` 컬럼 사용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 팬트리 반영 선택 팝업 (`add_to_pantry_item_ids` 처리) — slice 12b
- 장보기 리스트 생성 — slice 09
- 장보기 항목 체크/제외 토글 — slice 10a
- 장보기 공유 텍스트 — slice 10b
- 장보기 순서 변경 — slice 11
- 장보기 기록 목록 조회 — slice 17a
- 완료된 리스트의 read-only UX (체크/제외 비활성화는 slice 10a, 순서 변경 비활성화는 slice 11에서 이미 처리됨, 이 슬라이스는 백엔드 409 정책만 추가)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `11-shopping-reorder` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### POST /shopping/lists/{list_id}/complete (slice 12a core)

**slice 12a는 팬트리 반영 없는 기본 완료 흐름만 담당한다.**

- **권한**: 로그인 필수 (401)
- **Path**: `list_id` (uuid)
- **Body**:
  - 없음 (slice 12a는 `add_to_pantry_item_ids` 파라미터 없음)
  - slice 12b에서 팬트리 반영 선택 팝업과 함께 `add_to_pantry_item_ids` 파라미터 추가 예정
- **Response**: `{ success, data, error }`
  - `data` (slice 12a 기본):
    ```json
    {
      "completed": true,
      "meals_updated": 4
    }
    ```
  - `completed`: 완료 여부 (항상 `true`)
  - `meals_updated`: 상태 전이된 식사 수 (`registered` → `shopping_done`)
- **검증**:
  - 소유자 일치: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
  - 존재 여부: `list_id` 유효성 (404)
  - read-only 정책은 완료 후 수정 API(체크/제외/순서 변경)에만 적용, 완료 API는 멱등 허용
- **서버 처리**:
  1. `shopping_lists.is_completed=true`, `completed_at=NOW()` 설정
  2. 해당 리스트에 연결된 식사(`meals.shopping_list_id = list_id`) 중 `status='registered'`인 식사들을 `status='shopping_done'`으로 일괄 전이
  3. 전이된 식사 수(`meals_updated`)를 응답에 포함
  4. slice 12a는 팬트리 반영 처리 없음, 응답에 `pantry_added`, `pantry_added_item_ids` 필드 없음
- **멱등성**: 이미 완료된 리스트(`is_completed=true`)를 재호출해도 200 + 동일 결과 반환 (에러 아님)
  - `completed=true`, `meals_updated=0` (이미 전이 완료된 식사는 재전이 안 함)
- **Error**:
  - 401: UNAUTHORIZED (토큰 없음)
  - 403: FORBIDDEN (소유자 불일치)
  - 404: RESOURCE_NOT_FOUND (리스트 없음)
  - 422: VALIDATION_ERROR (필드 누락, 유효하지 않은 body 형식 — slice 12a는 body 없음, 12b에서 `add_to_pantry_item_ids` 검증 추가)
  - 500: INTERNAL_ERROR

### PATCH /shopping/lists/{list_id}/items/{item_id} (slice 10a)
- **read-only 정책 보강**: `shopping_lists.is_completed=true`이면 수정 불가 (409)
- slice 10a에서 이미 구현됨, slice 12a는 테스트로 재확인만

### PATCH /shopping/lists/{list_id}/items/reorder (slice 11)
- **read-only 정책 보강**: `shopping_lists.is_completed=true`이면 수정 불가 (409)
- slice 11에서 이미 구현됨, slice 12a는 테스트로 재확인만

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 완료 API 호출 중
  - `empty`: N/A (장보기 리스트 자체는 slice 09/10a에서 처리)
  - `error`: 완료 API 호출 실패 (403, 404, 500)
  - `read-only`: 완료 후 장보기 상세 재열람 시 [장보기 완료] 버튼 숨김, 체크/제외/순서 변경 컨트롤 비활성화 (slice 10a/11 UI 재사용)
  - `unauthorized`: 401 처리 (실질적으로 드물지만 포함)
- 로그인 보호 액션: 장보기 상세는 이미 로그인 게이트 통과 후 진입하므로 return-to-action은 상위 플로우에서 처리됨

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음 (프로젝트 anchor screen은 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`만 해당)
- Affected screen: 기존 confirmed `SHOPPING_DETAIL` 화면에 [장보기 완료] 버튼 추가, 완료 후 read-only 전환 확인
- Visual artifact: 기존 `ui/designs/SHOPPING_DETAIL.md` (slice 10a에서 생성) 참조, [장보기 완료] 버튼 추가 정도의 경미한 UI 변경
- Authority status: `not-required`
- Notes: 기존 confirmed 화면의 low-risk UI change ([장보기 완료] 버튼 추가, 완료 후 read-only 전환)이므로 design-generator/design-critic/authority review 불필요. Stage 4 PR에 low-risk 판단 근거 명시.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.
> **이 슬라이스는 low-risk UI change이므로 `confirmed` 유지하고, Stage 5는 lightweight design check로 진행 가능.**

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` § 1-6 장보기, § 2-12 장보기 상세 화면 정책, § 2-8 상태 전이 flow
- `docs/화면정의서-v1.5.0.md` § 0-7 장보기 상세 공통 정책, § 12 SHOPPING_DETAIL
- `docs/api문서-v1.2.2.md` § 8-5 POST /shopping/lists/{id}/complete
- `docs/db설계-v1.3.1.md` (shopping_lists, shopping_list_items, meals)

## QA / Test Data Plan
- **Fixture baseline**:
  - 로그인 유저 1명 (auth override)
  - `shopping_lists` × 2개 (하나는 `is_completed=false`, 하나는 `is_completed=true`)
  - `shopping_list_items` × 다수 (구매 섹션 / 제외 섹션 혼합, `is_checked` / `is_pantry_excluded` 다양)
  - `meals` × 다수 (`status='registered'`, 일부는 `shopping_list_id` 연결)
  - `shopping_list_recipes` × 몇 개 (리스트별 레시피 기록)
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - seed script로 위 baseline 데이터 생성 후 브라우저에서:
    1. 장보기 상세 → [장보기 완료] 클릭 → 성공 메시지 확인
    2. 플래너 위클리 → 연결된 식사 상태가 `registered` → `shopping_done`으로 전이 확인
    3. 장보기 상세 재진입 → [장보기 완료] 버튼 숨김, 체크/제외/순서 변경 컨트롤 비활성화 확인
    4. 완료된 리스트에서 체크 토글 시도 → 409 CONFLICT 확인
- **Bootstrap 요구사항**:
  - `meal_plan_columns` (회원가입 시 자동 생성, 4끼 고정)
  - `recipe_books` (회원가입 시 기본 3개 생성)
  - owning flow: 회원가입 → 자동 생성 로직 (slice 01 bootstrap)
  - 기대 row: `meal_plan_columns` × 4, `recipe_books` × 3
- **Blocker 조건**:
  - `shopping_lists`, `shopping_list_items`, `meals` 테이블 부재
  - `shopping_lists.is_completed`, `completed_at` 컬럼 부재
  - `meals.status`, `shopping_list_id` 컬럼 부재
  - 로컬 Supabase에 seed가 없어서 리스트 조회 시 404만 나오는 상태

## Key Rules
- **장보기 완료 core만 담당**: slice 12a는 `POST /shopping/lists/{id}/complete` 기본 응답만 구현 (`add_to_pantry_item_ids` 없음)
  - 팬트리 반영 선택 팝업과 `add_to_pantry_item_ids` 처리는 slice 12b에서 추가
- **상태 전이**: `shopping_lists.is_completed=false → true`, `meals.status='registered' → 'shopping_done'` (해당 리스트에 연결된 식사만)
  - `meals.shopping_list_id = list_id` 조건으로 필터링
  - `status='registered'`인 식사만 전이 (이미 `shopping_done`이나 `cook_done`인 식사는 무시)
- **완료 직후 read-only lock**: `shopping_lists.is_completed=true`로 전환되면 즉시 read-only
  - 완료 후 체크/제외/순서 변경 API 호출 시 409 CONFLICT 반환
  - slice 10a/11에서 이미 구현된 409 정책, slice 12a는 테스트로 재확인
- **멱등성**: 이미 완료된 리스트를 재호출해도 200 + 동일 결과 반환 (에러 아님)
  - `completed=true`, `meals_updated=0` (이미 전이 완료된 식사는 재전이 안 함)
- **소유자 검증**: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
- **정렬 규칙**: `shopping_list_items`는 `sort_order ASC`, 동일 시 `id ASC` (기존 규칙 유지)
- **독립 요리와 플래너 요리 구분**: 이 슬라이스는 플래너 경유 장보기만 다루므로 `meals.shopping_list_id`가 존재하는 식사만 전이
  - 독립 요리 상태 전이는 slice 15b에서 처리, 섞지 않음

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 플래너에서 장보기 생성 (slice 09) → `SHOPPING_DETAIL`로 자동 이동
2. 구매 섹션에서 필요한 재료 체크 (slice 10a)
3. [장보기 완료] 버튼 클릭 → 완료 처리 (slice 12a)
4. 성공 메시지 표시 → 장보기 상세 화면 유지 또는 플래너로 복귀
5. 플래너 위클리에서 연결된 식사 상태가 `shopping_done`으로 전이된 것을 확인
6. 장보기 상세 재진입 → [장보기 완료] 버튼 숨김, 체크/제외/순서 변경 컨트롤 비활성화 확인

## Stage 2 Backend Evidence
- Implemented: `app/api/v1/shopping/lists/[list_id]/complete/route.ts`, `types/shopping.ts`, `lib/api/shopping.ts`
- Tests: `tests/shopping-complete.backend.test.ts`
- Regression evidence: `pnpm test:product tests/shopping-complete.backend.test.ts tests/shopping-detail.backend.test.ts tests/shopping-reorder.backend.test.ts tests/supabase-server.test.ts` passed (29 tests)
- Backend gate: `pnpm verify:backend` passed (lint, typecheck, product tests 256, build, security E2E 9)
- Real DB/schema readiness: `tests/supabase-server.test.ts` confirms shopping tables and relations exist in migrations; browser/local Supabase smoke remains part of Stage 4/6 manual QA evidence.

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
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
