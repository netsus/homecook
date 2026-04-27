# Slice: 11-shopping-reorder

## Goal
미완료 상태의 장보기 리스트(`is_completed=false`)에서 사용자는 드래그&드롭 또는 다른 수단으로 재료 항목의 순서를 자유롭게 변경할 수 있으며, 변경된 순서는 서버에 즉시 저장되어 재진입이나 마이페이지 재열람 시에도 그대로 유지된다. 완료된 장보기 리스트(`is_completed=true`)는 순서 변경이 불가능하며, 시도 시 409 CONFLICT를 반환한다.

## Branches

- 백엔드: `feature/be-11-shopping-reorder`
- 프론트엔드: `feature/fe-11-shopping-reorder`

## In Scope
- 화면:
  - `SHOPPING_DETAIL` (미완료 리스트 드래그&드롭 순서 변경 UI)
  - `SHOPPING_DETAIL` (완료 리스트 재열람 시 드래그 비활성화 확인)
- API:
  - `PATCH /shopping/lists/{list_id}/items/reorder` (장보기 아이템 순서 변경)
- 상태 전이:
  - `shopping_list_items.sort_order` 일괄 업데이트 (사용자 정의 순서 저장)
- DB 영향:
  - `shopping_lists` (READ: `is_completed` 확인)
  - `shopping_list_items` (READ, UPDATE: `sort_order`)
- Schema Change:
  - [x] 없음 — 기존 `shopping_list_items.sort_order` 컬럼 업데이트 (DB v1.3에서 이미 추가됨)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 장보기 리스트 생성 — slice 09
- 장보기 항목 체크/제외 토글 — slice 10a
- 장보기 공유 텍스트 — slice 10b
- 장보기 완료 처리 — slice 12a
- 팬트리 반영 선택 팝업 — slice 12b
- 장보기 기록 목록 조회 — slice 17a
- 완료된 리스트의 read-only UI 전반 (체크/제외 비활성화) — slice 10a에서 이미 처리됨, 이 슬라이스는 드래그 비활성화만 추가

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `10a-shopping-detail-interact` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### PATCH /shopping/lists/{list_id}/items/reorder
- **권한**: 로그인 필수 (401)
- **Path**: `list_id` (uuid)
- **Body**:
  ```json
  {
    "orders": [
      { "item_id": "uuid", "sort_order": 10 },
      { "item_id": "uuid", "sort_order": 20 },
      { "item_id": "uuid", "sort_order": 30 }
    ]
  }
  ```
  - `orders`: 순서 변경 목록 (배열)
  - 각 항목: `item_id` (uuid), `sort_order` (number, 양수 정수 권장)
- **Response**: `{ success, data, error }`
  - `data`: `{ updated: number }` (업데이트된 항목 수)
  - 예: `{ "updated": 5 }`
- **검증**:
  - 소유자 일치: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
  - 모든 `item_id`가 해당 `list_id` 소속인지 확인 (아니면 무시)
  - read-only 정책: `shopping_lists.is_completed=true`이면 순서 변경 불가 (409 CONFLICT)
  - 존재하지 않는 `item_id`는 무시하고 처리 (유효한 항목만 업데이트)
- **멱등성**: 같은 `orders` 배열로 재호출 시 200 + 동일 결과 반환
- **순서 표시 규칙**:
  - `shopping_list_items` 조회 시 `sort_order ASC`, 동일 시 `id ASC`
  - reorder API 호출 후 `GET /shopping/lists/{list_id}` 재조회 시 새 순서가 반영되어야 함
- **Error**:
  - 401: UNAUTHORIZED (토큰 없음)
  - 403: FORBIDDEN (소유자 불일치)
  - 404: RESOURCE_NOT_FOUND (리스트 없음)
  - 409: CONFLICT (완료된 리스트 순서 변경 시도)
  - 422: VALIDATION_ERROR (빈 body, `orders` 누락, `orders`가 배열이 아님)
  - 500: INTERNAL_ERROR

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: reorder API 호출 중
  - `empty`: N/A (장보기 리스트 자체는 slice 09/10a에서 처리, 이 슬라이스는 드래그만 담당)
  - `error`: reorder API 호출 실패
  - `read-only`: 완료된 리스트(`is_completed=true`)에서 드래그 핸들 비활성화 또는 숨김
  - `unauthorized`: 401 처리 (실질적으로 드물지만 포함)
- 로그인 보호 액션: 장보기 상세는 이미 로그인 게이트 통과 후 진입하므로 return-to-action은 상위 플로우에서 처리됨

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음 (프로젝트 anchor screen은 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`만 해당)
- Affected screen: 기존 confirmed `SHOPPING_DETAIL` 화면에 드래그 인터랙션 추가
- Visual artifact: 기존 `ui/designs/SHOPPING_DETAIL.md` (slice 10a에서 생성) 참조, 드래그 핸들 추가 정도의 경미한 UI 변경
- Authority status: `not-required`
- Notes: 기존 confirmed 화면의 low-risk UI change (드래그 핸들 추가, 순서 변경 인터랙션)이므로 design-generator/design-critic/authority review 불필요. Stage 4 PR에 low-risk 판단 근거 명시.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.
> **이 슬라이스는 low-risk UI change이므로 `temporary` 유지하고, Stage 5는 lightweight design check로 진행 가능.**

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` — 장보기 드래그&드롭 순서 변경 언급
- `docs/화면정의서-v1.5.0.md` § 12 SHOPPING_DETAIL (드래그 핸들 위치는 구현 판단)
- `docs/api문서-v1.2.2.md` § 8-4b PATCH /shopping/lists/{id}/items/reorder
- `docs/db설계-v1.3.1.md` (shopping_lists, shopping_list_items)
- `docs/reference/wireframes/jibhap-wireframe-session2.md` (드래그&드롭 UX 참고)

## QA / Test Data Plan
- **Fixture baseline**:
  - 로그인 유저 1명 (auth override)
  - `shopping_lists` × 2개 (하나는 `is_completed=false`, 하나는 `is_completed=true`)
  - `shopping_list_items` × 5개 이상 (다양한 `sort_order` 값, 동일 list_id 소속)
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - seed script로 위 baseline 데이터 생성 후 브라우저에서 SHOPPING_DETAIL → 드래그&드롭 → 순서 변경 확인 → 재진입 → 순서 유지 확인
  - 완료된 리스트 재열람 → 드래그 핸들 비활성화 또는 숨김 확인
- **Bootstrap 요구사항**:
  - `meal_plan_columns` (회원가입 시 자동 생성, 4끼 고정)
  - `recipe_books` (회원가입 시 기본 3개 생성)
  - owning flow: 회원가입 → 자동 생성 로직 (slice 01 bootstrap)
  - 기대 row: `meal_plan_columns` × 4, `recipe_books` × 3
- **Blocker 조건**:
  - `shopping_lists`, `shopping_list_items` 테이블 부재
  - `shopping_list_items.sort_order` 컬럼 부재 (DB v1.3에서 이미 추가되었으므로 정상이면 문제 없음)
  - 로컬 Supabase에 seed가 없어서 리스트 조회 시 404만 나오는 상태

## Key Rules
- **미완료 리스트만 순서 변경 가능**: `shopping_lists.is_completed=false`인 리스트만 reorder API 호출 가능
  - 완료된 리스트(`is_completed=true`)에서 reorder 시도 시 서버 409 CONFLICT 반환
  - 프론트는 완료된 리스트 재열람 시 드래그 핸들 비활성화 또는 숨김 (UI 레벨 차단 + 서버 409 이중 방어)
- **정렬 규칙**: `shopping_list_items` 조회 시 `sort_order ASC`, 동일 시 `id ASC`
  - reorder API 호출 후 새 순서가 바로 반영되어야 함
- **소유자 검증**: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
- **멱등성**: 같은 `orders` 배열로 재호출 시 200 + 동일 결과 반환
- **유효하지 않은 item_id 처리**: `orders` 배열에 현재 list_id 소속이 아닌 item_id가 포함되어도 무시하고 유효한 항목만 업데이트
- **드래그 UX 구현**:
  - `@dnd-kit/core` 또는 유사 라이브러리 사용 권장
  - 드래그 시작 → 드롭 완료 → 새 순서 계산 → reorder API 호출 → 성공 시 로컬 상태 반영
  - 실패 시 원래 순서로 되돌림 + 에러 메시지 표시

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 플래너에서 장보기 생성 (slice 09) → `SHOPPING_DETAIL`로 자동 이동
2. 장보기 상세에서 재료 카드 드래그 시작 → 원하는 위치로 드롭
3. 새 순서가 서버에 저장되고 화면에 반영됨
4. 앱을 종료했다가 다시 장보기 상세 진입 → 순서가 그대로 유지됨
5. 마이페이지 장보기 기록에서 완료된 리스트 재열람 → 드래그 핸들 비활성화 또는 숨김 확인

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
