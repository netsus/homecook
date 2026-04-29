# Slice: 15b-cook-standalone-complete

## Goal
RECIPE_DETAIL에서 직접 [요리하기]로 진입하는 독립 요리(standalone) 경로를 구현하여, 사용자가 플래너를 거치지 않고도 레시피 상세에서 바로 COOK_MODE로 요리하고, 요리 완료 시 남은요리를 자동 등록하고 소진 재료를 팬트리에서 제거할 수 있도록 한다. 독립 요리는 `meals.status` 전이나 `cooking_sessions` 생성 없이 동작한다.

## Branches

- 백엔드: `feature/be-15b-cook-standalone-complete`
- 프론트엔드: `feature/fe-15b-cook-standalone-complete`

## In Scope
- 화면: `COOK_MODE` (독립 요리 경로 — RECIPE_DETAIL에서 직행 진입), `RECIPE_DETAIL` 기존 [요리하기] CTA 연결
- API:
  - `GET /recipes/{recipe_id}/cook-mode` — 독립 요리모드 데이터 조회 (공식 API §9-3b)
  - `POST /cooking/standalone-complete` — 독립 요리 완료 (공식 API §9-6)
- 상태 전이:
  - `meals.status` 변경 없음 (독립 요리는 플래너 식사 상태를 건드리지 않음)
  - `cooking_sessions` 생성/변경 없음 (세션 없이 동작)
- DB 영향: `leftover_dishes` (INSERT), `pantry_items` (DELETE), `recipes` (UPDATE cook_count), `recipes` (READ), `ingredients` (READ), `recipe_ingredients` (READ), `complete_standalone_cooking` RPC function (atomic mutation wrapper)
- Schema Change:
  - [ ] 없음
  - [x] 있음 → `supabase/migrations/20260429103000_15b_cook_standalone_complete.sql` 생성 필요
    - `public.complete_standalone_cooking(recipe_id, user_id, cooking_servings, consumed_ingredient_ids)` RPC function 추가
    - table/enum/column 변경 없음. 15a migration의 `leftover_dishes` 테이블을 재사용.

## Out of Scope
- 플래너 경유 요리 COOK_MODE — 15a에서 구현 완료
- `cooking_sessions` 기반 complete/cancel — 15a/14에서 구현 완료
- `meals.status` → `cook_done` 전이 — 15a에서 구현 완료
- 남은요리 조회/관리 화면 (`LEFTOVERS`, `ATE_LIST`) — 16에서 닫음
- `leftover_dishes`의 `eaten` 전이 — 16에서 닫음
- 인분 조절 UI (요리모드에서는 인분 조절 불가, 공식 요구사항)
- 화면 꺼짐 방지 — 17c(SETTINGS)에서 닫음
- 조리방법 마스터 조회 (`GET /cooking-methods`) — 18에서 소비
- RECIPE_DETAIL 화면 구조 변경 (기존 [요리하기] CTA를 독립 요리 경로로 연결만 함)

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
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### GET /recipes/{recipe_id}/cook-mode

독립 요리모드 데이터 조회. 세션 없이 레시피 기반으로 재료·스텝을 반환.

- **권한**: 비로그인 가능 (공식 API §9-3b 🔓)
- **Query Parameter**: `servings` (int) — 요리 인분. 재료 스케일링에 사용.
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "recipe": {
      "id": "uuid",
      "title": "김치찌개",
      "cooking_servings": 2,
      "ingredients": [
        {
          "ingredient_id": "uuid",
          "standard_name": "김치",
          "amount": 200,
          "unit": "g",
          "display_text": "김치 200g",
          "ingredient_type": "QUANT",
          "scalable": true
        }
      ],
      "steps": [
        {
          "step_number": 1,
          "instruction": "김치를 한입 크기로 썬다",
          "cooking_method": {
            "code": "prep",
            "label": "손질",
            "color_key": "gray"
          },
          "ingredients_used": [],
          "heat_level": null,
          "duration_seconds": null,
          "duration_text": null
        }
      ]
    }
  },
  "error": null
}
```
- **Error**:
  - `404 Not Found` — recipe_id 미존재
  - `422 Unprocessable Entity` — servings <= 0
  - `500 Internal Server Error`
- **Read-only**: 이 엔드포인트는 데이터를 변경하지 않음

### POST /cooking/standalone-complete

독립 요리 완료. 세션 없이 레시피 기반으로 남은요리 등록 + 팬트리 소진 + cook_count 증가.

- **권한**: 로그인 필수 (401)
- **Request Body**:
```json
{
  "recipe_id": "uuid",
  "cooking_servings": 2,
  "consumed_ingredient_ids": ["uuid", "uuid"]
}
```
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "leftover_dish_id": "uuid",
    "pantry_removed": 3,
    "cook_count": 91
  },
  "error": null
}
```
- **서버 처리 (트랜잭션)**:
  1. `leftover_dishes` INSERT (`user_id=current_user.id`, `recipe_id`, `status='leftover'`, `cooked_at=now()`)
  2. `pantry_items` DELETE WHERE `ingredient_id IN consumed_ingredient_ids AND user_id = current_user.id`
  3. `recipes.cook_count += 1`
- **멱등성**: 이 API는 매 호출마다 새 leftover_dish를 생성하므로 엄밀한 멱등성은 없음. 중복 호출 방지는 프론트엔드에서 duplicate-submit guard로 처리.
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `404 Not Found` — recipe_id 미존재
  - `422 Unprocessable Entity` — `cooking_servings <= 0`, `recipe_id` 누락

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI (prototype-derived design, Baemin vocabulary/material 사용)
- 15a에서 구현한 COOK_MODE 화면 컴포넌트를 재사용하되, 독립 요리 경로용 데이터 로딩/완료 로직을 분리
- 필수 상태:
  - `loading`: COOK_MODE 독립 요리 데이터 로딩 중 skeleton/spinner
  - `empty`: 해당 없음 (레시피 기반 진입이므로 레시피 존재하면 데이터 있음, 없으면 404)
  - `error`: API 오류 시 에러 메시지 + 재시도 또는 이전 화면(RECIPE_DETAIL) 복귀
  - `read-only`: 조리 인분은 읽기 전용 표시 (인분 조절 UI 없음)
  - `unauthorized`: 요리모드 진입은 비로그인 가능. 요리완료(`POST standalone-complete`)는 로그인 필수 → 로그인 유도 모달 + return-to-action
- return-to-action: 로그인 후 현재 COOK_MODE 독립 요리 화면으로 자동 복귀

## Design Authority
- UI risk: `low-risk` (기존 15a COOK_MODE confirmed 화면의 데이터 소스만 변경)
- Anchor screen dependency: `RECIPE_DETAIL` (기존 [요리하기] CTA를 독립 요리 경로로 연결)
- Visual artifact: 15a에서 confirmed된 `COOK_MODE` authority evidence 재사용. RECIPE_DETAIL의 [요리하기] 버튼은 이미 화면정의서에 정의된 기존 CTA이므로 anchor screen의 CTA 추가/변경에 해당하지 않음.
- Authority status: `not-required`
- h8 matrix reference: `COOK_MODE` initial class = `prototype-derived design` (same surface, same classification as 15a)
- design-generator / design-critic 생략 근거: 15a에서 COOK_MODE의 design-generator(`ui/designs/COOK_MODE.md`), design-critic(`ui/designs/critiques/COOK_MODE-critique.md`), authority report(`ui/designs/authority/COOK_MODE-authority.md`)를 모두 생성하고 blocker 0으로 confirmed됨. 15b는 동일한 COOK_MODE 화면을 독립 요리 데이터 소스로 소비할 뿐 시각적 변경이 없으므로 신규 design artifact 불필요. RECIPE_DETAIL은 기존 [요리하기] CTA의 href만 변경하는 low-risk change이므로 별도 authority 불필요.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` → `pending-review` (Stage 4 완료) → `confirmed` (Stage 5 low-risk design review approve)
> 15a COOK_MODE confirmed evidence 재사용. 독립 요리 경로는 동일 화면 컴포넌트를 데이터 소스만 달리하여 소비하므로 Stage 5에서 low-risk 판정 시 lightweight design check로 confirmed 유지 가능.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-3 요리하기(요리모드), §2-5 인분 정책, §2-10 카운트/정렬
- `docs/화면정의서-v1.5.1.md` — §14 COOK_MODE, §3 RECIPE_DETAIL ([요리하기] CTA 정의)
- `docs/유저flow맵-v1.3.1.md` — §5 요리하기 여정
- `docs/api문서-v1.2.2.md` — §9-3b 독립 요리 cook-mode 조회, §9-6 독립 요리 완료
- `docs/db설계-v1.3.1.md` — §9-1 leftover_dishes, §8-1 pantry_items, §4-1 recipes.cook_count, §13-3 독립 요리 흐름
- `docs/workpacks/15a-cook-planner-complete/README.md` — 15a Backend First Contract (COOK_MODE 화면 구현, complete API)
- `docs/workpacks/14-cook-session-start/README.md` — 14 Backend First Contract (세션 생성, cancel API)
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan
- **fixture baseline**:
  - 레시피 + recipe_ingredients + ingredients + recipe_steps가 존재하는 테스트 데이터
  - 팬트리에 소진 가능한 pantry_items가 있는 로그인 사용자
  - 빈 pantry 사용자 (소진 체크 0개 시나리오)
  - 비로그인 사용자 (cook-mode 조회 가능, standalone-complete 401)
  - 존재하지 않는 recipe_id (404 검증)
- **real DB smoke 경로**:
  - `pnpm dev:local-supabase` — `recipes`, `recipe_ingredients`, `ingredients`, `recipe_steps`, `pantry_items`, `leftover_dishes` 테이블 존재 확인
  - `pnpm dev:demo` — RECIPE_DETAIL에서 [요리하기] → 독립 COOK_MODE 진입 → 재료/스텝 확인 → [요리 완료] → 소진 체크리스트 → 완료 → RECIPE_DETAIL 복귀 → leftover_dishes row 확인
- **seed / reset 명령**:
  - `pnpm local:reset:demo` — 전체 초기화
  - 기존 migration으로 모든 참조 테이블이 이미 생성됨 (15a migration 포함)
  - Stage 2 migration으로 `complete_standalone_cooking` RPC function 추가
- **bootstrap이 생성해야 하는 시스템 row**:
  - `cooking_methods` seed data (시스템 기본 조리방법, 이미 seed로 관리)
  - `ingredients` seed data (재료 마스터, 이미 seed로 관리)
  - `recipes` + `recipe_ingredients` + `recipe_steps` (demo seed에 이미 포함)
- **blocker 조건**:
  - `leftover_dishes` 테이블 미존재 시 → 15a migration 먼저 적용 필요
  - `complete_standalone_cooking` RPC function 미존재 시 → 15b migration 적용 필요
  - `pantry_items` 테이블 미존재 시 → 13 migration 확인 필요
  - `recipes`, `recipe_ingredients`, `ingredients`, `recipe_steps` 테이블 미존재 시 → 01 bootstrap 확인

## Key Rules
- **`meals.status` 변경 금지**: 독립 요리는 플래너 식사 상태를 건드리지 않음 (공식 문서 §13-3: "⚠️ meals 상태 변경 없음")
- **`cooking_sessions` 생성 금지**: 독립 요리는 세션 없이 동작 (공식 문서 §13-3: "⚠️ cooking_sessions 생성 없음")
- **독립 요리와 플래너 요리 분리**: `POST /cooking/standalone-complete`는 `POST /cooking/sessions/{id}/complete`와 완전히 독립적. 상태 전이가 섞이면 안 됨.
- **인분 조절 금지**: COOK_MODE에서 인분 조절 UI를 두지 않음. 진입 시 전달된 servings로 진행. (단, GET cook-mode의 servings query param으로 스케일링된 재료를 받음)
- **비로그인 진입 허용**: `GET /recipes/{recipe_id}/cook-mode`는 비로그인 가능. `POST /cooking/standalone-complete`만 로그인 필수.
- **로그인 게이트**: 비로그인 상태에서 [요리 완료] 클릭 시 로그인 유도 모달 + return-to-action
- **leftover_dishes 자동 INSERT**: 요리 완료 시 `leftover_dishes`에 `status='leftover'`, `cooked_at=now()`로 INSERT.
- **pantry_items DELETE (선택적 소진)**: `consumed_ingredient_ids`에 해당하는 항목만 삭제. 빈 배열이면 소진 없음.
- **recipes.cook_count 증가**: 요리 완료 시 `recipes.cook_count += 1`.
- **소유자 검증**: `POST /cooking/standalone-complete`에서 `pantry_items` DELETE 시 `user_id = current_user.id` 확인. `leftover_dishes` INSERT 시 `user_id = current_user.id`.
- **duplicate-submit guard**: `POST /cooking/standalone-complete`는 엄밀한 서버 측 멱등성이 없으므로 프론트에서 중복 제출 방지.
- **요리 완료 후 복귀**: 독립 요리 완료 후 RECIPE_DETAIL로 복귀 (이전 화면).
- **소진 재료 체크리스트**: 기본값 체크 해제. 15a에서 구현한 `consumed-ingredient-sheet.tsx` 재사용.
- **조리방법 색상 구분**: 15a COOK_MODE의 스텝 카드 조리방법 색상 시각 구분을 그대로 사용.

## Contract Evolution Candidates (Optional)
없음. 공식 API 문서(v1.2.2) §9-3b와 §9-6이 이 슬라이스의 범위를 완전히 커버한다. 독립 요리 흐름은 DB 설계 §13-3에도 명시되어 있다.

## Primary User Path
1. **RECIPE_DETAIL**에서 [요리하기] 버튼 클릭
2. **COOK_MODE** 독립 요리 경로 진입: 레시피 재료(servings 스케일링) + 스텝 카드 전체화면 스와이프로 표시
3. 요리 진행 후 하단 **[요리 완료]** 클릭 → (비로그인이면 로그인 게이트) → **소진 재료 체크리스트 팝업** (기본 체크 해제) → 소진할 재료 체크
4. 팝업 확인 → 서버 처리: `leftover_dishes INSERT` + `pantry_items DELETE` + `recipes.cook_count += 1`
5. 완료 후 **RECIPE_DETAIL** 복귀
6. (대안) **[취소]** 클릭 → 상태 변경 없이 RECIPE_DETAIL 복귀 (세션이 없으므로 cancel API 호출 없음)

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] standalone complete RPC function migration 적용 <!-- omo:id=delivery-standalone-rpc-migration;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 (독립 요리 경로 COOK_MODE + RECIPE_DETAIL CTA 연결) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->

## Stage Evidence

### Stage 2 Backend Evidence

- RED first: `pnpm exec vitest run tests/cook-standalone-complete.backend.test.ts` failed on missing `GET /recipes/[id]/cook-mode`, missing `POST /cooking/standalone-complete`, and missing `20260429103000_15b_cook_standalone_complete.sql`.
- `pnpm exec vitest run tests/cook-standalone-complete.backend.test.ts` — 10/10 pass.
- `pnpm exec vitest run tests/cook-session-start.backend.test.ts tests/cook-planner-complete.backend.test.ts tests/cook-standalone-complete.backend.test.ts` — 28/28 pass.
- `pnpm typecheck` — pass.
- `pnpm lint` — pass with existing `<img>` warnings in `components/cooking/cook-ready-list-screen.tsx` and `components/planner/planner-week-screen.tsx`.
- `pnpm validate:workpack -- --slice 15b-cook-standalone-complete` — pass.
- `pnpm validate:workflow-v2` — pass.
- `pnpm dlx supabase db reset` — pass, including migration `20260429103000_15b_cook_standalone_complete.sql`.
- `psql` schema smoke — `complete_standalone_cooking(uuid, uuid, integer, uuid[])` function exists.
- `psql` permission smoke — mismatched `auth.uid()` returns `FORBIDDEN`.
- `psql` standalone happy-path smoke — inserts one `leftover_dishes` row, removes only the current user's recipe pantry item, keeps unrelated/current-other pantry rows, increments `recipes.cook_count` to 1, and leaves `meals` / `cooking_sessions` counts unchanged.
- `pnpm verify:backend` — pass (lint warnings only: existing `<img>` warnings; typecheck; 46 product test files / 367 tests; build; security E2E 9 tests).

### Stage 4 Frontend Evidence

- **Files created**:
  - `stores/standalone-cook-mode-store.ts` — Zustand store for standalone cooking (loading → ready → completing → completed).
  - `components/cooking/standalone-cook-mode-screen.tsx` — Standalone COOK_MODE screen reusing 15a visual patterns.
  - `app/cooking/recipes/[recipe_id]/cook-mode/page.tsx` — Route page with async params/searchParams.
  - `tests/standalone-cook-mode-screen.test.tsx` — 13 Vitest tests covering all acceptance scenarios.
  - `tests/e2e/slice-15b-cook-standalone-complete.spec.ts` — 5 Playwright E2E tests (happy, cancel, login gate, swipe, empty consumed selection).
- **Files modified**:
  - `lib/api/cooking.ts` — Added `fetchStandaloneCookMode()` and `completeStandaloneCooking()`.
  - `components/recipe/recipe-detail-screen.tsx` — [요리하기] CTA now navigates to `/cooking/recipes/${recipeId}/cook-mode?servings=${selectedServings}`.
- **Verification**:
  - `pnpm typecheck` — pass.
  - `pnpm lint` — pass (only pre-existing `<img>` warnings).
  - `pnpm exec vitest run tests/standalone-cook-mode-screen.test.tsx` — 13/13 pass.
  - `pnpm exec vitest run tests/standalone-cook-mode-screen.test.tsx tests/cook-mode-screen.test.tsx tests/recipe-detail-screen.test.tsx` — 50/50 pass.
  - `pnpm exec playwright test tests/e2e/slice-15b-cook-standalone-complete.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` — 15/15 pass.
  - `pnpm verify:frontend` — pass (lint warnings only: existing `<img>` warnings; product tests 49 files / 414 tests; build; smoke E2E 431 passed / 4 skipped; accessibility 6 passed; visual 12 passed; security 9 passed; Lighthouse assertions pass).
  - `pnpm validate:workpack -- --slice 15b-cook-standalone-complete` — pass.
  - `pnpm validate:workflow-v2` — pass.
- **Key design decisions**:
  - Separate `standalone-cook-mode-store.ts` (not extending session-based `cook-mode-store.ts`) to keep planner and standalone cooking paths isolated.
  - Auth check does NOT block viewing (public GET endpoint); login gate shown only when unauthenticated user clicks [요리 완료].
  - Cancel navigates directly to RECIPE_DETAIL without API call (no session to cancel).
  - Duplicate-submit prevention via `useRef` guard.
  - Servings read-only (no stepper UI in standalone COOK_MODE).
  - Reuses `ConsumedIngredientSheet` from 15a for consumed ingredient selection.

### Stage 5 Design Review Evidence

- `Stage 5 Design Review: APPROVE` — `.omx/artifacts/stage5-design-review-15b-cook-standalone-complete-20260429T111600Z.md`
- Design Status: `pending-review` → `confirmed`.
- Review scope: low-risk extension of 15a confirmed `COOK_MODE` plus existing `RECIPE_DETAIL` CTA route update.
- Authority required: no; authority blocker count 0.
- Evidence considered: `pnpm verify:frontend` pass, 15b Playwright coverage across `desktop-chrome`, `mobile-chrome`, `mobile-ios-small`, and code review of the standalone screen's fixed bottom CTA, tab/content layout, token usage, and login gate state.

### Stage 6 Frontend Review Evidence

- `Stage 6 Frontend Review: APPROVE` — `.omx/artifacts/stage6-fe-review-15b-cook-standalone-complete-20260429T114020Z.md`
- Review axes: correctness, readability/simplicity, architecture fit, security, performance, and verification story.
- Repair applied during review: `tests/e2e/slice-15b-cook-standalone-complete.spec.ts` now sends actual touch events for the swipe acceptance path instead of only clicking tabs.
- Merge-gate hardening applied during review: `tests/e2e/slice-13-pantry-core.spec.ts` mocks `/api/v1/pantry` with a pathname predicate so category-filter requests with query strings remain in the fixture instead of falling through to the real API.
- `pnpm exec playwright test tests/e2e/slice-15b-cook-standalone-complete.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` — 15/15 pass after swipe test repair.
- `pnpm exec playwright test tests/e2e/slice-13-pantry-core.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` — 21/21 pass after pantry fixture hardening.
- `pnpm test:e2e:a11y` — 6/6 pass after stopping a concurrent local `dev-demo` server that was writing the same `.next` directory and causing a local-only Next dev manifest error.
- `pnpm verify:frontend` — pass: lint (existing `<img>` warnings only), typecheck, product tests 49 files / 414 tests, build, smoke E2E 431 passed / 4 skipped, accessibility 6 passed, visual 12 passed, security 9 passed, Lighthouse assertions pass.

### Internal 6.5 Closeout Evidence

- Delivery checklist: all non-manual in-scope items checked.
- Acceptance: all automated/backend/frontend acceptance items checked; Manual Only items remain live OAuth / real-device / full external environment checks.
- Design Status: confirmed, low-risk reuse of 15a `COOK_MODE` authority evidence, authority blocker 0.
- Closeout sync: roadmap projection set to `merged`; workflow-v2 projection set to completed/passed for final frontend merge.
