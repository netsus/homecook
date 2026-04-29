# Slice: 15a-cook-planner-complete

## Goal
플래너 경유 요리 세션을 완료할 수 있는 COOK_MODE 화면을 구현하여, 사용자가 레시피 재료와 조리 과정을 전체화면 스와이프로 확인하면서 요리를 진행하고, 요리 완료 시 해당 식사들의 상태를 `cook_done`으로 전이하고, 소진 재료를 팬트리에서 제거하고, 남은요리를 자동 등록할 수 있도록 한다.

## Branches

- 백엔드: `feature/be-15a-cook-planner-complete`
- 프론트엔드: `feature/fe-15a-cook-planner-complete`

## In Scope
- 화면: `COOK_MODE` (플래너 경유 세션 기반)
- API:
  - `POST /cooking/sessions/{session_id}/complete` — 요리 세션 완료 (이 슬라이스의 핵심 신규 구현)
  - `GET /cooking/sessions/{session_id}/cook-mode` — COOK_MODE 데이터 조회 (14에서 route handler 구현 완료, 이 슬라이스에서 FE 화면 소비)
  - `POST /cooking/sessions/{session_id}/cancel` — 요리 세션 취소 (14에서 BE 구현 완료, 이 슬라이스에서 cancel UI 구현)
- 상태 전이:
  - `cooking_sessions.status`: `in_progress` → `completed` (요리 완료 시)
  - `cooking_session_meals.is_cooked`: `false` → `true` (요리 완료 시)
  - `meals.status`: `shopping_done` → `cook_done` (요리 완료 시)
  - `meals.cooked_at`: `null` → `now()` (요리 완료 시)
- DB 영향: `cooking_sessions` (UPDATE status, completed_at), `cooking_session_meals` (UPDATE is_cooked, cooked_at), `meals` (UPDATE status, cooked_at), `leftover_dishes` (INSERT), `pantry_items` (DELETE), `recipes` (UPDATE cook_count)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → Stage 2에서 migration 생성 필요
    - `leftover_dish_status_type` enum 생성 (`leftover`, `eaten`)
    - `public.leftover_dishes` 테이블 생성 (공식 DB §9-1 기준: id, user_id, recipe_id, status, cooked_at, eaten_at)
    - 인덱스 추가: `(user_id, status, cooked_at DESC)`
    - RLS / policies / grants 활성화 (프로젝트 패턴 준수)
    - `meals.leftover_dish_id` → `leftover_dishes(id)` FK 추가 (기존 bootstrap migration에 FK가 누락되어 있으면)

## Out of Scope
- 독립 요리(RECIPE_DETAIL 직행) COOK_MODE 진입 — 15b에서 닫음
- `POST /cooking/standalone-complete` — 15b에서 닫음
- `GET /recipes/{recipe_id}/cook-mode` (독립 요리 데이터 조회) — 15b에서 닫음
- 남은요리 조회/관리 화면 (`LEFTOVERS`, `ATE_LIST`) — 16에서 닫음
- leftover_dishes의 `eaten` 전이 — 16에서 닫음
- 인분 조절 UI — 요리모드에서는 인분 조절 불가 (공식 요구사항)
- 화면 꺼짐 방지 — 17c(SETTINGS)에서 닫음
- 조리방법 마스터 조회 (`GET /cooking-methods`) — 18에서 소비
- `COOK_READY_LIST` 화면 변경 — 14에서 구현 완료 (요리 완료 후 리스트 갱신은 COOK_MODE에서 복귀 시 자연스럽게 반영)

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
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### POST /cooking/sessions/{session_id}/complete

플래너 경유 요리 세션 완료.

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `cooking_sessions.user_id = current_user.id` (403)
- **상태 정책**: `in_progress`만 완료 가능, 이미 `completed`면 200 + 동일 결과 (멱등)
- **Request Body**:
```json
{
  "consumed_ingredient_ids": ["uuid", "uuid"]
}
```
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "status": "completed",
    "meals_updated": 2,
    "leftover_dish_id": "uuid",
    "pantry_removed": 3,
    "cook_count": 90
  },
  "error": null
}
```
- **서버 처리 (트랜잭션)**:
  1. `cooking_session_meals.is_cooked = true`, `cooking_session_meals.cooked_at = now()`
  2. `cooking_sessions.status = 'completed'`, `cooking_sessions.completed_at = now()`
  3. 해당 `cooking_session_meals`의 `meal_id`들: `meals.status → 'cook_done'`, `meals.cooked_at = now()`
  4. `leftover_dishes` INSERT (`status='leftover'`, `cooked_at=now()`)
  5. `pantry_items` DELETE WHERE `ingredient_id IN consumed_ingredient_ids AND user_id = current_user.id`
  6. `recipes.cook_count += 1`
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `403 Forbidden` — 타인 세션
  - `404 Not Found` — session_id 미존재
  - `409 Conflict` — `cancelled` 상태 세션 완료 시도

### GET /cooking/sessions/{session_id}/cook-mode (14에서 구현 완료, FE 소비)

14 Backend First Contract 참조. 이 슬라이스는 FE에서 데이터를 소비하여 COOK_MODE 화면을 렌더링.

### POST /cooking/sessions/{session_id}/cancel (14에서 BE 구현 완료, FE cancel UI 구현)

14 Backend First Contract 참조. 이 슬라이스는 COOK_MODE 하단 [취소] 버튼 UI를 구현.

- 멱등성: 이미 `cancelled`면 200 + 동일 결과
- `completed` 세션에 cancel 시 409

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI (prototype-derived design, Baemin vocabulary/material 사용)
- 필수 상태:
  - `loading`: COOK_MODE 데이터 로딩 중 skeleton/spinner
  - `empty`: 해당 없음 (세션 기반 진입이므로 데이터가 항상 존재, 세션 없으면 404)
  - `error`: API 오류 시 에러 메시지 + 재시도 또는 이전 화면 복귀
  - `read-only`: 조리 인분은 읽기 전용 표시 (인분 조절 UI 없음)
  - `unauthorized`: 플래너 경유 COOK_MODE는 세션 기반이므로 데이터 조회(`GET cook-mode`), 취소(`POST cancel`), 완료(`POST complete`) 모두 로그인 필수. 비로그인 시 로그인 유도 모달 + return-to-action. (독립 요리 경로에서는 진입 자체는 비로그인 가능하지만, 플래너 경유는 세션 조회 단계부터 401.)
- return-to-action: 로그인 후 현재 COOK_MODE 세션으로 자동 복귀

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: 없음 (COOK_MODE는 anchor screen이 아니며, anchor screen을 직접 수정하지 않음)
- Visual artifact: Stage 1에서 `ui/designs/COOK_MODE.md` 생성, Stage 4에서 screenshot evidence 예정
- Authority status: `required`
- h8 matrix reference: `COOK_MODE` initial class = `prototype-derived design` (planner path does not auto-promote visual parity)
- Notes: COOK_MODE는 전체화면 몰입형 모드로 좌우 스와이프 기반. 14에서 route handler만 구현한 COOK_MODE 화면을 이 슬라이스에서 실제 구현. 독립 요리 경로(15b)와 같은 COOK_MODE 화면을 공유하지만 workpack과 acceptance는 분리.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-3 요리하기(요리모드), §1-4 요리하기 진입 flow, §2-5 인분 정책, §2-8 식사 상태 & 상태 전이, §2-10 카운트/정렬
- `docs/화면정의서-v1.5.1.md` — §14 COOK_MODE, §13 COOK_READY_LIST (참고), §0-5 조리방법 시각 규칙
- `docs/유저flow맵-v1.3.1.md` — §5 요리하기 여정(플래너 경유)
- `docs/api문서-v1.2.2.md` — §9-3 cook-mode 조회, §9-4 요리 완료, §9-5 요리 취소
- `docs/db설계-v1.3.1.md` — §7 cooking_sessions, cooking_session_meals, §5-2 meals, §8-1 pantry_items, §9-1 leftover_dishes, §4-1 recipes.cook_count, §13-2 요리 흐름
- `docs/workpacks/14-cook-session-start/README.md` — 14 Backend First Contract (cook-mode 조회, cancel API)
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan
- **fixture baseline**:
  - `in_progress` 상태의 cooking_session + cooking_session_meals (shopping_done meals 연결)
  - 소진 가능한 pantry_items가 있는 사용자
  - 빈 pantry 사용자 (소진 체크 0개 시나리오)
  - `completed` / `cancelled` 상태 세션 (멱등성/conflict 검증)
  - 타인 세션 (403 검증)
  - 다양한 레시피 재료/스텝 조합 (COOK_MODE 렌더링 검증)
- **real DB smoke 경로**:
  - `pnpm dev:local-supabase` — `cooking_sessions`, `cooking_session_meals`, `meals`, `pantry_items`, `leftover_dishes` 테이블 존재 확인
  - `pnpm dev:demo` — planner에서 meal 생성 → shopping 완료 → COOK_READY_LIST 진입 → 세션 생성 → COOK_MODE 진입 → 요리 완료 → meals.status=cook_done 확인 → pantry 소진 확인
- **seed / reset 명령**:
  - `pnpm local:reset:demo` — 전체 초기화
  - 14 migration으로 `cooking_sessions`, `cooking_session_meals` 테이블 이미 생성됨
- **bootstrap이 생성해야 하는 시스템 row**:
  - `meal_plan_columns` x 3~4 (회원가입 시 자동 생성, 이미 구현됨)
  - `cooking_methods` seed data (시스템 기본 조리방법, 이미 seed로 관리)
  - `ingredients` seed data (재료 마스터, 이미 seed로 관리)
- **blocker 조건**:
  - `cooking_sessions` / `cooking_session_meals` 테이블 미존재 시 → 14 migration 먼저 실행 필요
  - `leftover_dishes` 테이블 미존재 시 → **Stage 2에서 이 슬라이스 migration을 추가해야 함** (공식 DB §9-1 기준, 기존 repo에는 `create table public.leftover_dishes`가 없음). `meals.leftover_dish_id` FK도 함께 검증. 이 migration이 적용되지 않으면 백엔드 complete API가 동작하지 않음.
  - `pantry_items` 테이블 미존재 시 → 13 migration 확인 필요
  - `shopping_done` 상태 meals가 없으면 COOK_READY_LIST는 empty, 세션 생성 불가

## Key Rules
- **`meals.status` 전이 한정**: 이 슬라이스에서는 `shopping_done → cook_done`만 수행. `registered → shopping_done`은 12a에서 닫힘.
- **독립 요리와 플래너 요리 분리**: 이 슬라이스는 플래너 경유(`cooking_sessions` 기반)만 담당. 독립 요리는 15b.
- **인분 조절 금지**: COOK_MODE에서는 인분 조절 UI를 두지 않음. 진입 전 설정된 인분(세션 생성 시 `cooking_servings`)으로 진행.
- **complete 멱등성**: 이미 `completed`인 세션에 complete 요청 시 200 + 동일 결과 반환.
- **`cancelled` 세션 완료 불가**: `cancelled` 상태에서 complete 시 409 반환.
- **소진 재료 체크리스트**: 기본값 체크 해제. 체크한 재료만 pantry_items에서 DELETE. `consumed_ingredient_ids`가 빈 배열이면 pantry 소진 없음.
- **leftover_dishes 자동 INSERT**: 요리 완료 시 `leftover_dishes`에 `status='leftover'`, `cooked_at=now()`로 INSERT.
- **recipes.cook_count 증가**: 요리 완료 시 `recipes.cook_count += 1`.
- **소유자 검증**: 모든 mutation API에서 `cooking_sessions.user_id` = 현재 사용자 확인.
- **요리 완료 후 복귀**: COOK_MODE에서 완료 → COOK_READY_LIST 복귀. 리스트가 비면 PLANNER_WEEK 복귀.
- **조리방법 색상 구분**: 스텝 카드의 테두리/배경으로 조리방법 시각 구분 (design-tokens.md의 cooking-method 색상 사용).
- **전체화면 몰입형 모드**: COOK_MODE 진입 시 전체화면. 좌우 스와이프로 재료 화면 ↔ 과정 화면 전환.
- **하단 고정 CTA**: [요리 완료] + [취소] 버튼 하단 고정.

## Contract Evolution Candidates (Optional)
없음. 공식 API 문서(v1.2.2)의 cooking 섹션 §9-3, §9-4, §9-5가 이 슬라이스의 범위를 완전히 커버한다.

## Primary User Path
1. **COOK_READY_LIST**에서 레시피 카드 [요리하기] 클릭 → 세션 생성(14에서 구현) → **COOK_MODE** 진입
2. **COOK_MODE 좌측**: 조리 인분(읽기 전용) + 재료 전체 목록 확인 / **우측**: 스텝 카드 리스트(스와이프로 전환)
3. 요리 진행 후 하단 **[요리 완료]** 클릭 → **소진 재료 체크리스트 팝업** (기본 체크 해제) → 소진할 재료 체크
4. 팝업 확인 → 서버 처리: `meals.status → cook_done` + `pantry_items DELETE` + `leftover_dishes INSERT` + `recipes.cook_count += 1`
5. 완료 후 **COOK_READY_LIST** 복귀 (완료된 레시피는 리스트에서 사라짐)
6. (대안) **[취소]** 클릭 → 세션 cancelled → COOK_READY_LIST 복귀

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] `leftover_dishes` 스키마 migration 적용 (enum + 테이블 + 인덱스 + RLS + FK 검증) <!-- omo:id=delivery-schema-migration;stage=2;scope=backend;review=3,6 -->
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

## Stage Evidence

### Stage 2 Backend Evidence

- `pnpm exec vitest run tests/cook-planner-complete.backend.test.ts` — pass (RED first: route/migration missing, then GREEN)
- `pnpm exec vitest run tests/cook-session-start.backend.test.ts tests/cook-planner-complete.backend.test.ts` — pass
- `pnpm typecheck` — pass
- `pnpm lint` — pass with existing `<img>` warnings in `components/cooking/cook-ready-list-screen.tsx` and `components/planner/planner-week-screen.tsx`
- `pnpm verify:backend` — pass (lint warnings only, 45 product test files / 357 tests, build, security E2E 9 tests)
- `pnpm dlx supabase db reset` — pass, including migration `20260429080000_15a_cook_planner_complete.sql`
- `psql` schema smoke — `leftover_dishes` table, `complete_cooking_session` function, and `meals_leftover_dish_id_fkey` all exist
- `psql` permission smoke — mismatched `auth.uid()` returns `FORBIDDEN`
- `psql` complete happy-path smoke — session returns `completed`, meal becomes `cook_done`, `leftover_dishes` row count is 1, recipe ingredient pantry removal count is 1, unrelated pantry item remains, recipe `cook_count` becomes 1
- `psql` empty-consumed smoke — `pantry_removed=0` and pantry item remains
- `psql` idempotency smoke — second complete call keeps `cook_count=1` and single leftover row

## Open Questions
없음.
