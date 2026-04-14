# Slice: 06-recipe-to-planner

## Goal

사용자가 `RECIPE_DETAIL`에서 레시피를 보다가 바로 플래너에 식사를 등록할 수 있어야 한다. 로그인한 사용자는 날짜, 끼니, 계획 인분을 선택한 뒤 즉시 `Meal`을 생성하고, 이후 `PLANNER_WEEK`에서 해당 날짜/끼니 슬롯에 등록된 결과를 확인할 수 있어야 한다. 이 슬라이스는 레시피 탐색과 주간 식단 계획 사이의 가장 짧은 연결을 닫되, 기존 로그인 복귀 흐름과 플래너의 anchor UX 기준을 깨지 않는 것을 목표로 한다.

## Branches

- 백엔드: `feature/be-06-recipe-to-planner`
- 프론트엔드: `feature/fe-06-recipe-to-planner`

## In Scope

- 화면:
  - `RECIPE_DETAIL` — `[플래너에 추가]` 액션, 날짜/끼니/인분 선택 바텀시트, 성공/실패 피드백
  - `PLANNER_WEEK` — 생성된 Meal이 기존 플래너 read model에서 목표 날짜/끼니 슬롯에 보이는지 확인하는 범위
  - `LOGIN` — 비로그인 사용자의 planner-add return-to-action 재진입 재사용 (신규 UI 계약 추가 없음)
- API:
  - `POST /meals` — 레시피 상세에서 planner add용 Meal 생성
  - `GET /planner` — 생성 결과 확인을 위한 기존 플래너 조회 계약 재사용 (계약 변경 없음)
- 상태 전이:
  - planner add 성공 시 `meals.status='registered'`로 새 row 생성
  - `shopping_done`, `cook_done`로의 전이는 이번 슬라이스에서 발생하지 않음
  - 비로그인 planner add 시 로그인 후 날짜/끼니 선택 바텀시트로 복귀
- DB 영향:
  - `meals` — INSERT
  - `meal_plan_columns` — 목표 `column_id` 검증 및 canonical 4끼 슬롯 확인
  - `recipes` — 대상 레시피 존재 여부 검증
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- `MEAL_SCREEN`에서의 식사 조회/수정/삭제 (`07-meal-manage`)
- `MENU_ADD`, `RECIPE_SEARCH_PICKER`, 레시피북/팬트리/남은요리/직접등록/유튜브 경유 추가 흐름 (`08a`, `08b`, `16`, `18`, `19`)
- `leftover_dish_id`를 포함한 남은요리 기반 Meal 생성 (`16-leftovers`)
- 장보기/요리 상태 전이, read-only, 팬트리 반영 (`09` 이후 슬라이스)
- `PLANNER_WEEK` 구조 자체의 interaction model 변경 또는 대규모 리디자인
- 레시피 상세의 좋아요/저장/공유/요리하기 계약 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `03-recipe-like` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `05-planner-week-core` | merged | [x] |

> `RECIPE_DETAIL`의 로그인 게이트/상세 액션 baseline과 `PLANNER_WEEK`의 4끼 고정 플래너 baseline이 모두 선행 슬라이스에서 잠겨 있으므로 시작 가능하다.

## Backend First Contract

### POST /meals

**Request Body**

```json
{
  "recipe_id": "uuid",
  "plan_date": "2026-04-13",
  "column_id": "uuid",
  "planned_servings": 2
}
```

- `recipe_id`: 등록할 레시피 ID
- `plan_date`: 목표 날짜 (`YYYY-MM-DD`)
- `column_id`: 목표 끼니 슬롯 ID (`meal_plan_columns.id`)
- `planned_servings`: 계획 인분 (`1` 이상)
- `leftover_dish_id`: 이번 슬라이스에서는 보내지 않는다

**Response (`201`)**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "recipe_id": "uuid",
    "plan_date": "2026-04-13",
    "column_id": "uuid",
    "planned_servings": 2,
    "status": "registered",
    "is_leftover": false,
    "leftover_dish_id": null
  },
  "error": null
}
```

**Error Cases**

- `401 UNAUTHORIZED` — 비로그인 사용자
- `403 FORBIDDEN` — 다른 사용자의 `column_id`로 생성 시도
- `404 RESOURCE_NOT_FOUND` — `recipe_id` 또는 `column_id`가 존재하지 않음
- `409 CONFLICT` — 이번 create path에는 별도 상태 충돌 계약이 없으므로 새로 도입하지 않는다. 충돌이 필요한 정책은 후속 슬라이스에서 공식 문서 기준으로만 확장한다.
- `422 VALIDATION_ERROR` — 필수 필드 누락, `planned_servings < 1`, 날짜 형식 오류 등

**권한 / 소유자 검증**

- 요청 사용자의 `meal_plan_columns`만 목표 슬롯으로 허용한다.
- 다른 사용자의 planner slot 또는 resource를 기준으로 Meal을 생성할 수 없다.

**상태 / 파생값 규칙**

- 생성 직후 `status='registered'`
- `is_leftover=false`, `leftover_dish_id=null`
- `shopping_list_id=null`, `cooked_at=null`
- 이번 슬라이스는 기존 meal의 상태를 변경하지 않고 새 Meal 생성만 담당한다.

**기존 계약 재사용**

- `GET /planner`의 4끼 고정 슬롯/주간 조회 계약은 `05-planner-week-core`를 그대로 재사용한다.

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI를 유지하되, `RECIPE_DETAIL`과 `PLANNER_WEEK`의 기존 mental model을 바꾸지 않는다.
- planner add 입력 surface는 `RECIPE_DETAIL` 안의 바텀시트로 잠근다. full-page detour는 두지 않는다.
- 필수 상태:
  - `loading` — planner add submit 중 버튼 비활성 + pending UI, 필요 시 planner 재조회 pending 상태
  - `empty` — `PLANNER_WEEK`의 기존 빈 주간/빈 슬롯 상태 재사용
  - `error` — `POST /meals` 실패 안내 및 재시도
  - `read-only` — 이번 create path에는 별도 read-only 분기 없음 (`N/A` 근거 필요)
  - `unauthorized` — 비로그인 상태에서 `[플래너에 추가]` 탭 시 로그인 게이트 모달
- 로그인 보호 액션:
  - `[플래너에 추가]` 탭 → 로그인 안내 모달 → 로그인 성공 후 planner add 바텀시트 자동 복귀

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact:
  - baseline: `ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png`
  - baseline: `ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png`
  - baseline: `ui/designs/evidence/authority/PLANNER_WEEK-mobile.png`
  - baseline: `ui/designs/evidence/authority/PLANNER_WEEK-mobile-narrow.png`
  - baseline: `ui/designs/evidence/authority/PLANNER_WEEK-mobile-scrolled.png`
  - Stage 4 supplement plan: `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile.png`
  - Stage 4 supplement plan: `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile-narrow.png`
  - Stage 4 supplement plan: `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png`
- Authority status: `required`
- Notes:
  - `RECIPE_DETAIL`과 `PLANNER_WEEK` baseline authority report는 이미 존재한다.
  - slice06 Stage 4는 기존 baseline 위에 planner add interaction과 `5-column mobile density` evidence를 추가로 남겨야 한다.
  - planner overflow 수정이 필요해도 interaction model 교체를 전제로 하지 않는다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> `06-recipe-to-planner`는 FE 화면이 있는 anchor-extension이므로 `temporary`에서 시작한다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` — 1-2 레시피 상세, 2-3 로그인 게이트, 2-5 인분 정책, 2-8 식사 상태
- `docs/화면정의서-v1.2.3.md` — `RECIPE_DETAIL`, `PLANNER_WEEK`
- `docs/api문서-v1.2.2.md` — 2-5 `POST /meals`, 3-1 `GET /planner`
- `docs/db설계-v1.3.1.md` — `meal_plan_columns`, `meals`
- `docs/유저flow맵-v1.2.3.md` — return-to-action, ③ 식단 계획 여정
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`
- `ui/designs/RECIPE_DETAIL.md`
- `ui/designs/PLANNER_WEEK.md`
- `ui/designs/authority/RECIPE_DETAIL-authority.md`
- `ui/designs/authority/PLANNER_WEEK-authority.md`

## QA / Test Data Plan

- QA fixture mode:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - authenticated / guest 전환이 가능한 fixture 또는 auth override 필요
  - fixture baseline은 아래를 만족해야 한다.
    - planner slot `아침 / 점심 / 간식 / 저녁` 4개 존재
    - planner add 대상 레시피 상세 route 1개 이상 존재
    - 선택 가능한 목표 날짜/끼니 중 최소 1개는 비어 있어 성공 경로를 검증할 수 있음
  - 이 baseline이 없으면 Stage 2/4에서 slice06 전용 fixture를 보강한다.
- real DB smoke:
  - `pnpm dev:local-supabase`
  - 필요 시 clean dataset: `pnpm dev:demo`, `pnpm dev:demo:reset`
  - bootstrap / seed baseline: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
  - 또는 `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - smoke 기준:
    - 로그인한 테스트 계정에 `meal_plan_columns ×4`, `recipe_books ×3`가 자동 준비되어 있어야 함
    - `RECIPE_DETAIL`에서 planner add 성공 후 `PLANNER_WEEK` 목표 슬롯에 새 meal이 보여야 함
- blocker 조건:
  - `meal_plan_columns` canonical 4끼 row가 없는 계정
  - 회원 bootstrap 미완료 (`meal_plan_columns`, `recipe_books` 미생성)
  - planner add 대상 recipe/detail seed 부재
  - authority baseline 또는 narrow/mobile evidence 계획 부재

## Key Rules

- `POST /meals`는 `registered` 상태 Meal 생성만 담당한다.
- 이번 슬라이스는 `shopping_done`, `cook_done`, `shopping_list_id`를 건드리지 않는다.
- planner add는 `RECIPE_DETAIL`에서만 닫고, `MENU_ADD` 계열 경로를 우회 구현하지 않는다.
- 목표 slot은 기존 canonical `meal_plan_columns` 4끼(`아침 / 점심 / 간식 / 저녁`)만 사용한다.
- `leftover_dish_id`를 임의 추가하지 않는다. 남은요리 기반 등록은 `16-leftovers` 이후에만 닫는다.
- 비로그인 planner add는 로그인 게이트 + return-to-action으로만 처리한다.
- `RECIPE_DETAIL` action hierarchy와 `PLANNER_WEEK` scroll containment를 약화시키는 구조 변경은 허용하지 않는다.

## Contract Evolution Candidates (Optional)

없음

## Primary User Path

1. 로그인한 사용자가 `RECIPE_DETAIL`에서 레시피를 확인하고 `[플래너에 추가]`를 탭한다.
2. planner add 바텀시트에서 날짜, 끼니, 계획 인분을 선택한다.
3. `POST /meals`로 새 Meal이 생성되고 바텀시트가 닫히며 성공 피드백이 노출된다.
4. 사용자가 `PLANNER_WEEK`로 이동하면 선택한 날짜/끼니 슬롯에서 새 `registered` Meal을 확인한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.

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
- [ ] anchor-extension authority evidence 계획 고정 <!-- omo:id=delivery-authority-plan;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 authority report / screenshot 경로 동기화 <!-- omo:id=delivery-authority-evidence-plan;stage=4;scope=frontend;review=5,6 -->
