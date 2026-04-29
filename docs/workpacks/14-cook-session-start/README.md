# Slice: 14-cook-session-start

## Goal
장보기가 완료된 식사들을 레시피별로 묶어서 요리 준비 리스트(`COOK_READY_LIST`)로 보여주고, 사용자가 원하는 레시피를 골라 요리 세션을 시작하거나 취소할 수 있도록 한다. 이 슬라이스는 요리 세션의 생성과 취소까지만 담당하며, 요리 완료(`cook_done` 전이)와 소진 재료/남은요리/팬트리 처리는 후속 슬라이스(`15a`, `15b`)에서 닫는다.

## Branches

- 백엔드: `feature/be-14-cook-session-start`
- 프론트엔드: `feature/fe-14-cook-session-start`

## In Scope
- 화면: `COOK_READY_LIST`
- API:
  - `GET /cooking/ready` — 요리 준비 리스트 조회
  - `POST /cooking/sessions` — 요리 세션 생성 (레시피 1개 단위)
  - `POST /cooking/sessions/{session_id}/cancel` — 요리 세션 취소
  - `GET /cooking/sessions/{session_id}/cook-mode` — COOK_MODE 데이터 조회 (navigation handoff용, 이 슬라이스는 route handler만 구현하고 COOK_MODE 화면은 15a에서 닫음)
- 상태 전이:
  - `cooking_sessions.status`: `in_progress` → `cancelled` (취소 시)
  - `meals.status`는 이 슬라이스에서 변경하지 않음 (읽기 전용: `shopping_done` 필터만 사용)
- DB 영향: `cooking_sessions`, `cooking_session_meals`, `meals` (읽기), `recipes` (읽기)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요
    - `cooking_sessions` 테이블 생성
    - `cooking_session_meals` 테이블 생성

## Out of Scope
- `COOK_MODE` 화면 구현 — 15a/15b에서 닫음
- 요리 완료 처리 (`POST /cooking/sessions/{session_id}/complete`) — 15a에서 닫음
- 독립 요리 완료 (`POST /cooking/standalone-complete`) — 15b에서 닫음
- 독립 요리 cook-mode 조회 (`GET /recipes/{recipe_id}/cook-mode`) — 15b에서 닫음
- `meals.status` → `cook_done` 전이 — 15a에서 닫음
- 남은요리(`leftover_dishes`) INSERT — 15a/15b에서 닫음
- 팬트리(`pantry_items`) DELETE (소진 체크 재료) — 15a/15b에서 닫음
- `recipes.cook_count` 증가 — 15a/15b에서 닫음
- 소진 재료 체크리스트 팝업 — 15a/15b에서 닫음
- 화면 꺼짐 방지 — 17c(SETTINGS)에서 닫음
- 조리방법 마스터 조회 (`GET /cooking-methods`) — 18에서 소비

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
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### GET /cooking/ready

요리 준비 리스트 조회. 오늘~마지막 등록일 범위의 `shopping_done` 식사를 레시피별 합산.

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `meals.user_id = current_user.id`
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "date_range": { "start": "2026-03-01", "end": "2026-03-07" },
    "recipes": [
      {
        "recipe_id": "uuid",
        "recipe_title": "김치찌개",
        "recipe_thumbnail_url": "https://...",
        "meal_ids": ["uuid", "uuid"],
        "total_servings": 4
      }
    ]
  },
  "error": null
}
```
- **Empty**: `recipes: []` (shopping_done 식사 없음)
- **Error**: `401 Unauthorized`, `500 Internal Server Error`
- **Read-only**: 이 엔드포인트는 데이터를 변경하지 않음

### POST /cooking/sessions

요리 세션 생성. 레시피 1개 단위.

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `meal_ids` 각각의 `user_id = current_user.id` (403)
- **상태 검증**: `meal_ids` 각각 `status = 'shopping_done'` (409)
- **레시피 일치 검증**: `meal_ids` 각각 `recipe_id` 일치 (422)
- **Request Body**:
```json
{
  "recipe_id": "uuid",
  "meal_ids": ["uuid", "uuid"],
  "cooking_servings": 4
}
```
- **Response 201**:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "recipe_id": "uuid",
    "status": "in_progress",
    "cooking_servings": 4,
    "meals": [{ "meal_id": "uuid", "is_cooked": false }]
  },
  "error": null
}
```
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `403 Forbidden` — 타인 meal 접근
  - `404 Not Found` — recipe_id 미존재
  - `409 Conflict` — meal이 `shopping_done`이 아님
  - `422 Unprocessable Entity` — `recipe_id` 불일치, `cooking_servings <= 0`, `meal_ids` 빈 배열

### POST /cooking/sessions/{session_id}/cancel

요리 세션 취소.

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `cooking_sessions.user_id = current_user.id` (403)
- **상태 정책**: `in_progress`만 취소 가능, 이미 `cancelled`면 200 + 동일 결과 (멱등)
- **Response 200**:
```json
{
  "success": true,
  "data": { "session_id": "uuid", "status": "cancelled" },
  "error": null
}
```
- **Error**:
  - `401 Unauthorized`
  - `403 Forbidden` — 타인 세션
  - `404 Not Found` — session_id 미존재
  - `409 Conflict` — 이미 `completed` 상태 (완료된 세션은 취소 불가)

### GET /cooking/sessions/{session_id}/cook-mode

세션 기반 요리모드 데이터 조회 (COOK_MODE navigation handoff용).

- **권한**: 로그인 필수 (401)
- **소유자 검증**: `cooking_sessions.user_id = current_user.id` (403)
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "recipe": {
      "id": "uuid",
      "title": "김치찌개",
      "cooking_servings": 4,
      "ingredients": [
        {
          "ingredient_id": "uuid",
          "standard_name": "김치",
          "amount": 400,
          "unit": "g",
          "display_text": "김치 400g",
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
  - `401 Unauthorized`
  - `403 Forbidden` — 타인 세션
  - `404 Not Found` — session_id 미존재
- **Read-only**: 이 엔드포인트는 데이터를 변경하지 않음

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI (prototype-derived design, Baemin vocabulary/material 사용)
- 필수 상태:
  - `loading`: COOK_READY_LIST 데이터 로딩 중 skeleton/spinner
  - `empty`: shopping_done 식사가 없을 때 안내 메시지 + PLANNER_WEEK 복귀 유도
  - `error`: API 오류 시 에러 메시지 + 재시도 버튼
  - `read-only`: 해당 없음 (이 화면은 조회+액션 화면이므로 read-only 상태 불필요)
  - `unauthorized`: 비로그인 시 로그인 유도 모달 + return-to-action
- return-to-action: 로그인 후 `COOK_READY_LIST`로 자동 복귀
- 프론트엔드 범위 한정: `COOK_READY_LIST` 화면과 세션 생성→COOK_MODE route 이동까지. 세션 취소 UI는 15a COOK_MODE에서 구현 (cancel API는 이 슬라이스 백엔드에서 준비)

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: `PLANNER_WEEK` (상단 [요리하기] 버튼에서 진입, anchor extension은 아님 — 기존 [요리하기] CTA 동작만 연결)
- Visual artifact: Stage 1에서 `ui/designs/COOK_READY_LIST.md` 생성, Stage 4에서 screenshot evidence 예정
- Authority status: `reviewed`
- h8 matrix reference: `COOK_READY_LIST` initial class = `prototype-derived design` (screen-level parity 대상 아님, Baemin vocabulary/material만 사용)
- Notes: PLANNER_WEEK의 기존 [요리하기] CTA를 연결하는 것이므로 anchor screen의 핵심 CTA 추가/변경에는 해당하지 않음. PLANNER_WEEK에 이미 [요리하기] 버튼이 존재하고 이 슬라이스는 그 버튼의 목적지 화면을 구현하는 것임.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — 1-3 요리하기(요리모드), 1-4 요리하기 진입 flow, 2-5 인분 정책, 2-8 요리하기 대상
- `docs/화면정의서-v1.5.1.md` — §13 COOK_READY_LIST, §14 COOK_MODE (참고), §5 PLANNER_WEEK 상호작용
- `docs/유저flow맵-v1.3.1.md` — §5 요리하기 여정(플래너 경유)
- `docs/api문서-v1.2.2.md` — §9-1~9-5 요리하기 API
- `docs/db설계-v1.3.1.md` — §7 cooking_sessions, cooking_session_meals, §5-2 meals
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan
- **fixture baseline**:
  - `shopping_done` 상태 meals가 있는 사용자 + 다양한 레시피 조합
  - 빈 상태 (shopping_done 없음) 사용자
  - 타인 리소스 접근용 2nd 사용자
  - `registered` / `cook_done` 상태 meals (필터링 검증용)
- **real DB smoke 경로**:
  - `pnpm dev:local-supabase` — 로컬 Supabase에 cooking_sessions, cooking_session_meals 테이블 존재 확인
  - `pnpm dev:demo` — planner에서 meal 생성 → shopping 완료 → COOK_READY_LIST 진입 → 세션 생성 검증 (cancel API는 백엔드 Vitest로 검증)
- **seed / reset 명령**:
  - `pnpm local:reset:demo` — 전체 초기화
  - migration으로 `cooking_sessions`, `cooking_session_meals` 테이블 생성
- **bootstrap이 생성해야 하는 시스템 row**:
  - `meal_plan_columns` × 3~4 (회원가입 시 자동 생성, 이미 구현됨)
  - `cooking_methods` seed data (시스템 기본 조리방법, 이미 seed로 관리)
- **blocker 조건**:
  - `cooking_sessions` 테이블 미존재 시 세션 생성 불가 → migration 먼저 실행 필요
  - `meals` 테이블에 `shopping_done` 상태 row가 없으면 COOK_READY_LIST는 empty 상태

## Key Rules
- `meals.status` 변경 금지: 이 슬라이스에서는 `shopping_done` meals를 읽기만 하고, `cook_done` 전이는 15a에서 수행
- 세션은 레시피 1개 단위: `cooking_sessions` 1개 = 레시피 1개, 여러 레시피를 한 세션에 묶지 않음
- `cooking_session_meals`는 세션 생성 시점의 스냅샷: 생성 후 meals 테이블 변경이 세션에 영향 주지 않음
- Cancel API 범위: `POST /cooking/sessions/{session_id}/cancel`은 이 슬라이스 백엔드(Stage 2)에서 구현하되, cancel을 트리거하는 UI 버튼은 15a COOK_MODE 화면에서 구현한다. 이 슬라이스 프론트엔드(Stage 4)에는 cancel UI가 없다.
- 취소 멱등성: 이미 `cancelled`인 세션에 cancel 요청 시 200 + 동일 결과 반환
- `completed` 세션 취소 불가: `completed` 상태에서 cancel 시 409 반환 (이 슬라이스에서 complete는 구현하지 않지만, 서버 검증은 갖춤)
- 소유자 검증: 모든 mutation API에서 `user_id` 일치 확인
- `COOK_READY_LIST` 범위: 오늘 ~ 마지막 등록일, `status='shopping_done'`인 meals만 대상
- 인분 정보: `cooking_servings`는 request body에서 받되, `COOK_READY_LIST`에서는 합산 인분을 읽기 전용으로 표시
- PLANNER_WEEK → COOK_READY_LIST 진입: 로그인 필수, 비로그인 시 로그인 게이트
- COOK_READY_LIST → COOK_MODE 진입: 세션 생성 후 session_id로 COOK_MODE route 이동 (이 슬라이스에서는 route 이동까지, COOK_MODE 화면 구현은 15a)

## Contract Evolution Candidates (Optional)
없음. 공식 API 문서(v1.2.2)의 cooking 섹션이 이 슬라이스의 범위를 완전히 커버한다.

## Primary User Path
1. **PLANNER_WEEK**에서 상단 [요리하기] 버튼 클릭
2. **COOK_READY_LIST** 진입: 오늘~마지막 등록일의 `shopping_done` 식사가 레시피별로 묶여 카드 리스트로 표시됨 (레시피명 + 합산 인분 + [요리하기] 버튼)
3. 레시피 카드의 **[요리하기]** 클릭 → 요리 세션 생성 → COOK_MODE route로 이동 (COOK_MODE 화면 구현은 15a)
4. (대안) 뒤로가기 → PLANNER_WEEK 복귀
5. (참고) COOK_MODE에서 취소 시 → 세션 cancelled → COOK_READY_LIST 복귀 (cancel UI는 15a COOK_MODE에서 구현, cancel API는 이 슬라이스 백엔드에서 구현)

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

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

## Stage 2 Evidence

- TDD red: `pnpm exec vitest run tests/cook-session-start.backend.test.ts` initially failed on missing cooking route modules.
- Targeted green: `pnpm exec vitest run tests/cook-session-start.backend.test.ts` -> 9 tests passed.
- Backend implementation: `GET /api/v1/cooking/ready`, `POST /api/v1/cooking/sessions`, `POST /api/v1/cooking/sessions/{session_id}/cancel`, `GET /api/v1/cooking/sessions/{session_id}/cook-mode`.
- Schema migration: `supabase/migrations/20260429050000_14_cook_session_tables.sql` creates `cooking_sessions`, `cooking_session_meals`, enum/checks/indexes/grants.
- Local DB smoke: `pnpm dlx supabase migration up` applied the migration; `psql` table existence check returned `cooking_session_meals` and `cooking_sessions`.
- Full backend gate: `pnpm verify:backend` -> pass (lint warning only: pre-existing `<img>` warning in `components/planner/planner-week-screen.tsx`).

## Stage 4 Evidence

- API client: `lib/api/cooking.ts` — follows pantry API pattern with `CookingApiError`, `isCookingApiError()`, `fetchCookingReady()`, `createCookingSession()`.
- Zustand store: `stores/cooking-ready-store.ts` — screen states: `loading | ready | empty | error`, with `loadReady()` and `startSession()` actions.
- Screen component: `components/cooking/cook-ready-list-screen.tsx` — auth checking/unauthorized gate, loading skeletons, empty state with planner redirect, error state with retry, recipe list with session creation CTA, 409 conflict toast + list refresh.
- Page route: `app/cooking/ready/page.tsx` — server component with `AppShell currentTab="planner" headerMode="hidden"`, passes `initialAuthenticated` from `getServerAuthUser()`.
- COOK_MODE placeholder: `app/cooking/sessions/[session_id]/cook-mode/page.tsx` — minimal placeholder (15a scope).
- PLANNER_WEEK wiring: `components/planner/planner-week-screen.tsx` — [요리하기] CTA changed from disabled `<button>` to `<Link href="/cooking/ready">`.
- Vitest: `tests/cook-ready-list-screen.test.tsx` — 16 tests covering auth gate, loading, ready, empty, error, retry, session creation, duplicate-submit guard, global pending lock, 409 conflict, 401 during session, thumbnail rendering.
- Playwright: `tests/e2e/slice-14-cook-session-start.spec.ts` — 7 tests covering authenticated ready list, guest login gate, empty state, session creation + route handoff, 409 toast, back button, planner CTA link.
- Design Status: `temporary` → `pending-review`.
- Authority evidence: `ui/designs/authority/COOK_READY_LIST-authority.md` (Stage 5 screenshots captured).

## Stage 5 Evidence

- Codex authority review: `ui/designs/authority/COOK_READY_LIST-authority.md` → verdict `pass`, blocker 0.
- Visual evidence: `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-default-screenshot.png`, `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-narrow-screenshot.png`.
- Exploratory QA: `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/exploratory-report.json` → desktop/mobile/small viewport coverage, findings 0.
- QA eval: `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/eval-result.json` → score 100, pass.
- Claude final authority gate: `.omx/artifacts/claude-delegate-14-cook-session-start-stage5-final-authority-gate-response-20260429T055358Z.md` → decision `pass`, Design Status update allowed.
- Design Status: `pending-review` → `confirmed`.

## Stage 6 Evidence

- Codex PR review repaired duplicate-submit risk: same-tick repeated CTA clicks are blocked with a synchronous ref guard, and all recipe CTAs are disabled while any session creation is pending.
- Regression test: `pnpm exec vitest run tests/cook-ready-list-screen.test.tsx` → 16 passed.
- Full frontend gate: `CI=true pnpm verify:frontend` → pass (lint/typecheck/product Vitest/build/smoke/a11y/visual/security/Lighthouse).
- Internal 6.5 validators: `validate:workflow-v2`, `validate:workpack`, `validate:authority-evidence-presence`, `validate:exploratory-qa-evidence`, `validate:real-smoke-presence`, `validate:pr-ready`, `validate:closeout-sync`, `validate:omo-bookkeeping`, `git diff --check`.
