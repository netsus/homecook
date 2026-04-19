# Slice: 07-meal-manage

## Goal

사용자가 플래너의 특정 날짜·끼니 슬롯(셀)을 탭하면 `MEAL_SCREEN`이 열리고, 그 슬롯에 등록된 식사 목록을 조회하고, 계획 인분을 조절하거나 식사를 삭제할 수 있어야 한다. 인분 변경 시 상태가 진행된 식사(`shopping_done` / `cook_done`)는 확인 모달을 통해 의사를 확인하고 MVP에서는 변경을 허용하되 상태를 그대로 유지한다. 삭제 시에는 항상 확인 모달이 표시되며, 서버가 상태 충돌로 409를 반환하는 경우 FE는 이를 적절히 안내해야 한다.

## Branches

- 백엔드: `feature/be-07-meal-manage`
- 프론트엔드: `feature/fe-07-meal-manage`

## In Scope

- 화면:
  - `MEAL_SCREEN` — 날짜 + 끼니명 헤더, 식사 카드 리스트(조회/인분 조절/삭제), 하단 [식사 추가] CTA(→ `MENU_ADD`는 Out of Scope)
- API:
  - `GET /meals` (query: `plan_date`, `column_id`) — 해당 슬롯의 식사 목록 조회
  - `PATCH /meals/{meal_id}` (body: `planned_servings`) — 인분 변경
  - `DELETE /meals/{meal_id}` — 식사 삭제 (응답 204)
- 상태 전이:
  - 이 슬라이스 자체는 `meals.status`를 변경하지 않는다.
  - 인분 조절은 `planned_servings`만 변경하며 상태는 유지된다.
  - 삭제는 `meals` row를 제거한다.
- DB 영향:
  - `meals` — READ (조회), UPDATE (`planned_servings`), DELETE
  - `meal_plan_columns` — 목표 `column_id` 식별 참조 (읽기 전용)
  - `recipes` — `recipe_title`, `recipe_thumbnail_url` 조회 (읽기 전용)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- `MENU_ADD` / `RECIPE_SEARCH_PICKER` 식사 추가 흐름 (`08a-meal-add-search-core`): 이번 슬라이스는 하단 CTA 버튼 노출까지만 담당하고 실제 식사 추가 flow는 포함하지 않는다.
- `meals.status` 전이(`registered → shopping_done → cook_done`): 상태 전이는 장보기/요리 슬라이스에서 닫는다.
- `is_leftover` / `leftover_dish_id` 기반 남은요리 식사 처리 (`16-leftovers`).
- 개별 식사 [요리하기] 버튼 및 요리 세션 진입: 화면정의서상 MEAL_SCREEN에서는 제공하지 않는다.
- `PLANNER_WEEK` 자체의 구조·레이아웃 변경: 이미 `05-planner-week-core`와 H2/H3에서 잠김.
- `SHOPPING_FLOW`, `COOK_READY_LIST`, `LEFTOVERS`로의 플래너 상단 CTA 연결: 후속 슬라이스 담당.

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `05-planner-week-core` | merged | [x] |
| `06-recipe-to-planner` | merged | [x] |

> `meals` 테이블 bootstrap과 canonical `meal_plan_columns` 4끼 슬롯은 `05`와 `06`에서 이미 닫혔으므로 시작 가능하다.

## Backend First Contract

### GET /meals

**Request Query**

| 파라미터 | 타입 | 설명 |
| --- | --- | --- |
| `plan_date` | date | 날짜 (`YYYY-MM-DD`) |
| `column_id` | uuid | 끼니 슬롯 ID (`meal_plan_columns.id`) |

**Response (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "recipe_id": "uuid",
        "recipe_title": "김치찌개",
        "recipe_thumbnail_url": "https://...",
        "planned_servings": 2,
        "status": "registered",
        "is_leftover": false
      }
    ]
  },
  "error": null
}
```

**Error Cases**

- `401 UNAUTHORIZED` — 비로그인 사용자
- `403 FORBIDDEN` — 다른 사용자의 `column_id`로 조회 시도
- `422 VALIDATION_ERROR` — `plan_date` 형식 오류 또는 `column_id` 누락

**권한 / 소유자 검증**

- 요청 사용자의 `meal_plan_columns`에 속하는 슬롯만 조회 가능하다. 타인의 슬롯 접근 시 403.

---

### PATCH /meals/{meal_id}

**Request Body**

```json
{
  "planned_servings": 3
}
```

- `planned_servings`: 변경할 인분 (1 이상 정수)

**Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "planned_servings": 3,
    "status": "registered"
  },
  "error": null
}
```

**Error Cases**

- `401 UNAUTHORIZED` — 비로그인 사용자
- `403 FORBIDDEN` — 다른 사용자의 meal 수정 시도
- `404 RESOURCE_NOT_FOUND` — 존재하지 않는 meal_id
- `409 CONFLICT` — 서버 정책상 현재 상태에서 수정이 허용되지 않는 경우 (구체적 트리거는 서버 구현 시 확정)
- `422 VALIDATION_ERROR` — `planned_servings < 1` 또는 데이터 타입 오류

**상태 유지 정책**

- `PATCH`는 `planned_servings`만 변경하며 `status`는 변경하지 않는다.
- `status='shopping_done'` 또는 `'cook_done'`인 식사의 인분 변경: 서버에서 허용(MVP), FE에서 확인 모달 표시 필수.

---

### DELETE /meals/{meal_id}

**Response (204)**: No Content

**Error Cases**

- `401 UNAUTHORIZED` — 비로그인 사용자
- `403 FORBIDDEN` — 다른 사용자의 meal 삭제 시도
- `404 RESOURCE_NOT_FOUND` — 존재하지 않는 meal_id
- `409 CONFLICT` — 서버 정책상 현재 상태에서 삭제가 허용되지 않는 경우 (구체적 트리거는 서버 구현 시 확정; 예: shopping_done/cook_done 상태인 meal의 downstream 보호)

**멱등성 정책**

- 이미 삭제된 meal에 다시 DELETE 요청 시: `404 RESOURCE_NOT_FOUND` 반환. (complete·cancel 성 API와 달리 삭제는 `204` 멱등 처리 대상이 아니며, 404가 정상 응답이다.)

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI (`Design Status: temporary`).
- 필수 상태:
  - `loading` — GET /meals 조회 중 스켈레톤 또는 스피너
  - `empty` — 해당 슬롯에 식사가 없는 경우 빈 상태 메시지 + [식사 추가] CTA 강조
  - `error` — GET /meals 실패 안내 및 재시도 버튼
  - `read-only` — 이번 슬라이스에서 read-only 분기는 없다. PATCH/DELETE는 항상 허용(서버가 409 반환 시 FE에서 인라인 오류 표시). 명시 N/A: `meals` 자체의 read-only 정책은 후속 슬라이스에서 장보기/요리 완료 이후에 적용된다.
  - `unauthorized` — 비로그인 사용자가 MEAL_SCREEN URL에 직접 접근 시 로그인 게이트 + return-to-action
- 로그인 보호 액션: 모든 액션이 로그인 필수. 비로그인 접근 시 로그인 안내 후 원래 URL로 복귀.
- 인분 조절 확인 모달 (`shopping_done` / `cook_done` 상태 식사): "상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요."
- 삭제 확인 모달: 모든 식사 삭제 전 필수. "이 식사를 삭제하시겠어요?" + [삭제] / [취소].

## Design Authority

- UI risk: `new-screen`
- Anchor screen dependency: 없음 (MEAL_SCREEN은 PLANNER_WEEK에서 진입하나, PLANNER_WEEK 자체를 수정하지 않는다)
- Visual artifact: Stage 1 design-generator wireframe `ui/designs/MEAL_SCREEN.md`; Stage 4 evidence plan `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile.png`, `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile-narrow.png`
- Authority status: `reviewed`
- Notes:
  - MEAL_SCREEN은 신규 화면이므로 Stage 4에서 screenshot evidence 기반 authority review를 거친다.
  - 모바일 기본 폭 + narrow sentinel 각 1장 이상 필요.
  - 스크롤 구조 확인 필요: 식사 목록이 길어질 때 리스트만 스크롤되고 헤더·하단 CTA가 고정되는지 확인.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority review 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스

> `07-meal-manage`는 신규 FE 화면이 있으므로 `temporary`에서 시작한다. Stage 4 완료 후 `pending-review`로 전환한다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` — 1-4 식단 플래너, 끼니 화면, 2-8 식사 상태
- `docs/화면정의서-v1.5.0.md` — §6 MEAL_SCREEN
- `docs/api문서-v1.2.2.md` — §4 끼니 화면 (4-1, 4-2, 4-3)
- `docs/db설계-v1.3.1.md` — §5-2 meals, §5-1 meal_plan_columns
- `docs/유저flow맵-v1.3.0.md` — ③ 식단 계획 여정
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`
- `ui/designs/MEAL_SCREEN.md`

## QA / Test Data Plan

- QA fixture mode:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - fixture baseline은 아래를 만족해야 한다.
    - `meal_plan_columns` 4끼(`아침 / 점심 / 간식 / 저녁`) 존재
    - 하나 이상의 `meals` row가 특정 `plan_date` + `column_id`에 존재 (`status='registered'`)
    - `shopping_done` 상태 meal 최소 1개 (인분 변경 확인 모달 경로 검증용)
    - `cook_done` 상태 meal 최소 1개 (인분 변경 확인 모달 경로 검증용)
  - 이 baseline이 없으면 Stage 2/4에서 slice07 전용 fixture를 보강한다.
- real DB smoke:
  - `pnpm dev:local-supabase`
  - seed baseline: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
  - smoke 기준:
    - 로그인한 테스트 계정에 `meal_plan_columns ×4`, `recipe_books ×3` 자동 준비
    - GET /meals가 특정 날짜/끼니 슬롯의 식사 목록을 반환하는지 확인
    - PATCH /meals/{id}가 `planned_servings`를 변경하는지 확인
    - DELETE /meals/{id}가 204를 반환하고 이후 GET 목록에서 제거되는지 확인
- blocker 조건:
  - `meal_plan_columns` canonical 4끼 row가 없는 계정
  - `meals` 테이블에 테스트용 row가 없어 PATCH/DELETE 경로 검증 불가
  - 회원 bootstrap 미완료 (`meal_plan_columns`, `recipe_books` 미생성)

## Key Rules

- `GET /meals`는 `plan_date` + `column_id` 조합으로 해당 슬롯의 식사만 반환한다. 날짜나 column_id 없이 전체 조회하지 않는다.
- `PATCH /meals/{meal_id}`는 `planned_servings`만 변경한다. `status` 필드를 같이 보내거나 변경하지 않는다.
- `status='shopping_done'` 또는 `'cook_done'`인 식사의 인분 변경 시 FE에서 확인 모달 필수. MVP에서는 변경 허용 + 상태 그대로 유지.
- `DELETE /meals/{meal_id}` 전에 반드시 확인 모달을 표시해야 한다. 사용자가 명시적으로 동의한 뒤에만 API를 호출한다.
- 서버가 `409`를 반환하면 FE는 이를 사용자에게 인라인 오류 메시지로 안내한다 ("현재 상태에서는 이 작업을 수행할 수 없어요").
- 이 화면에서 개별 식사 [요리하기] 버튼을 제공하지 않는다 (화면정의서 §6 정책 준수).
- 식사 카드는 `RECIPE_DETAIL`로의 진입점 역할을 하지만, 실제 RECIPE_DETAIL 링크 연결은 이번 슬라이스의 primary scope가 아니다. 카드 탭 시 상세로 이동하는 구조는 구현하되 UI 처리 방식(네비게이션 방향, 뒤로가기 등)은 FE 구현자가 UX 일관성을 고려해 결정한다.
- `is_leftover=true` meal도 동일하게 조회·인분 변경·삭제가 가능하다. leftover 관련 downstream 처리는 이번 슬라이스 scope가 아니다.
- 문서에 없는 필드(`status` 강제 변경 등)를 PATCH body에 추가하지 않는다.

## Contract Evolution Candidates (Optional)

없음. 공식 계약(GET/PATCH/DELETE `/meals`)이 MVP 요구사항을 충분히 커버하며, 추가 계약 변경 후보가 없다.

## Primary User Path

1. 사용자가 `PLANNER_WEEK`에서 특정 날짜·끼니 슬롯 셀을 탭한다.
2. `MEAL_SCREEN`이 열리고 해당 슬롯의 식사 목록이 표시된다 (`GET /meals`).
3. 사용자가 특정 식사 카드의 [인분 조절]을 탭해 인분을 변경한다 (`PATCH /meals/{id}`). 상태가 진행된 식사면 확인 모달이 먼저 표시된다.
4. 사용자가 특정 식사 카드의 [삭제]를 탭하면 확인 모달이 표시된다. 확인 시 `DELETE /meals/{id}`가 호출되고 목록이 갱신된다.
5. 사용자가 하단 [식사 추가]를 탭하면 `MENU_ADD` 진입 지점으로 이동한다 (구현은 `08a`에서).

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
- [x] Stage 4 authority report / screenshot 경로 동기화 <!-- omo:id=delivery-authority-evidence-plan;stage=4;scope=frontend;review=5,6 -->


