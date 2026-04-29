# Slice: 16-leftovers

## Goal
요리 완료 후 자동 등록된 남은요리를 조회·관리하고, 다먹음/덜먹음 전이를 통해 남은요리 소비를 추적하며, 남은요리를 플래너에 재등록할 수 있도록 한다. 사용자는 LEFTOVERS 화면에서 현재 남은요리를 한눈에 보고, ATE_LIST에서 다먹은 기록을 확인할 수 있다.

## Branches

- 백엔드: `feature/be-16-leftovers`
- 프론트엔드: `feature/fe-16-leftovers`

## In Scope
- 화면: `LEFTOVERS`, `ATE_LIST`
- API:
  - `GET /leftovers` — 남은요리 목록 조회 (status=leftover 기본, status=eaten으로 다먹은 목록)
  - `POST /leftovers/{leftover_id}/eat` — 다먹음 처리
  - `POST /leftovers/{leftover_id}/uneat` — 덜먹음 처리
  - `POST /meals` (leftover_dish_id 포함) — 남은요리 → 플래너 추가 (기존 §2-5 재사용)
- 상태 전이:
  - `leftover_dishes.status`: `leftover` → `eaten` (다먹음)
  - `leftover_dishes.status`: `eaten` → `leftover` (덜먹음)
  - `leftover_dishes.eaten_at`: 다먹음 시 `now()`, 덜먹음 시 `null`
  - `leftover_dishes.auto_hide_at`: 다먹음 시 `eaten_at + 30일`, 덜먹음 시 `null`
  - 남은요리 → 플래너 추가 시: `meals` INSERT (`status='registered'`, `is_leftover=true`, `leftover_dish_id=해당 ID`)
- DB 영향: `leftover_dishes` (READ, UPDATE status/eaten_at/auto_hide_at), `meals` (INSERT via POST /meals), `recipes` (READ — 레시피 제목/썸네일 조인)
- Schema Change:
  - [x] 없음 — 기존 테이블 READ/UPDATE 및 기존 POST /meals INSERT 경로 재사용
  - [ ] 있음
  > `leftover_dishes` 테이블과 CHECK 제약은 15a migration에서 이미 생성됨. 이 슬라이스는 기존 테이블의 status UPDATE와 READ를 수행하고, `POST /meals`의 `leftover_dish_id` 경로도 기존 계약(§2-5)에 이미 정의됨. 신규 migration 파일 없음.

## Out of Scope
- 남은요리 자동 생성 (요리 완료 시 INSERT) — 15a/15b에서 구현 완료
- COOK_MODE, COOK_READY_LIST — 14/15a/15b에서 구현 완료
- 팬트리 소진 — 15a/15b에서 구현 완료
- 남은요리 삭제 — 공식 문서에 삭제 API 없음
- MENU_ADD에서 남은요리 경로 ("남은요리에서 추가") — 08a shell의 leftovers path이나 별도 소비 슬라이스 범위 (Slice Notes: "leftovers path는 16"이나, 이는 leftover_dish_id를 통한 플래너 재등록을 의미하며 MENU_ADD UI 자체는 LEFTOVERS 화면의 [플래너에 추가]로 충족)
- PLANNER_WEEK 상단 [남은요리] CTA 연결 — 이미 15a/15b/14에서 PLANNER_WEEK toolbar CTA가 존재하는 경우 라우팅만 연결, 아직 없다면 이 슬라이스에서 라우트 추가
- 남은요리 auto_hide_at 도달 시 서버 측 자동 숨김 cron/trigger — 공식 문서에 자동 숨김 메커니즘 구현 명세 없음, 클라이언트 필터링으로 처리

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
| `15b-cook-standalone-complete` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### GET /leftovers

남은요리/다먹은 목록 조회.

- **권한**: 로그인 필수 (401)
- **Query Parameter**: `status` (string, optional) — `leftover` (기본) / `eaten`
- **Response 200**:
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
        "status": "leftover",
        "cooked_at": "2026-03-01T18:00:00Z",
        "eaten_at": null
      }
    ]
  },
  "error": null
}
```
- **정렬**: `status=leftover` → `cooked_at DESC` (최근 요리순), `status=eaten` → `eaten_at DESC` (최근 다먹은순)
- **필터**: `status=eaten`일 때 `auto_hide_at > now()` 조건으로 30일 초과 항목 제외
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `422 Unprocessable Entity` — 잘못된 status 값

### POST /leftovers/{leftover_id}/eat

다먹음 처리.

- **권한**: 로그인 필수 (401), 소유자만 (403)
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "eaten",
    "eaten_at": "2026-03-03T12:00:00Z",
    "auto_hide_at": "2026-04-02T12:00:00Z"
  },
  "error": null
}
```
- **서버 처리**: `leftover_dishes` UPDATE (`status='eaten'`, `eaten_at=now()`, `auto_hide_at=now()+30d`)
- **멱등성**: 이미 `eaten`이면 200 + 동일 결과 반환
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `403 Forbidden` — 타인 소유
  - `404 Not Found` — leftover_id 미존재

### POST /leftovers/{leftover_id}/uneat

덜먹음 처리.

- **권한**: 로그인 필수 (401), 소유자만 (403)
- **Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "leftover",
    "eaten_at": null,
    "auto_hide_at": null
  },
  "error": null
}
```
- **서버 처리**: `leftover_dishes` UPDATE (`status='leftover'`, `eaten_at=NULL`, `auto_hide_at=NULL`)
- **멱등성**: 이미 `leftover`이면 200 + 동일 결과 반환
- **Error**:
  - `401 Unauthorized` — 비로그인
  - `403 Forbidden` — 타인 소유
  - `404 Not Found` — leftover_id 미존재

### POST /meals (leftover_dish_id 포함)

남은요리 → 플래너 추가. 기존 §2-5 `POST /meals` 계약 재사용.

- **추가 필드**: `leftover_dish_id` (uuid) — 이 값이 있으면 서버에서 `is_leftover=true` 자동 세팅
- **나머지 계약**: §2-5와 동일 (`recipe_id`, `plan_date`, `column_id`, `planned_servings`)
- **소유자 검증**: `leftover_dish_id`가 현재 사용자 소유인지 확인
- **Error**: 기존 POST /meals 에러 + `403 Forbidden` (타인 leftover)

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI (prototype-derived design, Baemin vocabulary/material 사용)
- 필수 상태:
  - `loading`: LEFTOVERS/ATE_LIST 데이터 로딩 중 skeleton
  - `empty`: 남은요리/다먹은 항목이 없을 때 안내 메시지
    - LEFTOVERS: "남은 요리가 없어요. 요리를 완료하면 여기에 저장돼요."
    - ATE_LIST: "다먹은 기록이 없어요."
  - `error`: API 오류 시 에러 메시지 + 재시도
  - `read-only`: 해당 없음 (LEFTOVERS/ATE_LIST는 상태 전이 액션만 존재)
  - `unauthorized`: 로그인 필요 → 로그인 유도 모달 + return-to-action
- return-to-action: 로그인 후 현재 LEFTOVERS 또는 ATE_LIST 화면으로 자동 복귀

## Design Authority
- UI risk: `new-screen` (LEFTOVERS와 ATE_LIST는 신규 화면)
- Anchor screen dependency: `PLANNER_WEEK` (상단 [남은요리] CTA에서 LEFTOVERS로 진입)
- Visual artifact: Stage 4 구현 후 screenshot evidence 제공 예정
  - `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile.png` (예정)
  - `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile-narrow.png` (예정)
  - `ui/designs/evidence/16-leftovers/ATE_LIST-mobile.png` (예정)
  - `ui/designs/evidence/16-leftovers/ATE_LIST-mobile-narrow.png` (예정)
- Authority status: `required`
- h8 matrix reference: `LEFTOVERS`, `ATE_LIST` initial class = `prototype-derived design` (h8 §Future-Screen Classification Matrix: "no parity promotion in PR1")
- Notes: LEFTOVERS와 ATE_LIST는 신규 화면이므로 Stage 4 후 authority review 필수. prototype-derived design이므로 Baemin vocabulary/material을 사용하되 parity score 대상은 아님. PLANNER_WEEK 상단 [남은요리] CTA 연결은 기존 toolbar의 라우트 변경이므로 anchor-extension에 해당하지 않음 (CTA 자체는 이미 화면정의서에 정의됨).

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
> → `pending-review` (Stage 4 완료 후)
> → `confirmed` (Stage 5 public review 통과 + final authority gate 통과 후)
> 신규 화면이므로 `confirmed` 전에 authority review 근거가 필요하다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-7 남은요리/다먹은 목록, §2-8 식사 상태 & 상태 전이
- `docs/화면정의서-v1.5.1.md` — §15 LEFTOVERS, §16 ATE_LIST, §14 COOK_MODE [요리 완료] 액션
- `docs/api문서-v1.2.2.md` — §10 남은요리 (10-1 ~ 10-4), §2-5 POST /meals (leftover_dish_id)
- `docs/db설계-v1.3.1.md` — §9-1 leftover_dishes, §5-2 meals (is_leftover, leftover_dish_id)
- `docs/유저flow맵-v1.3.1.md` — §⑥ 남은요리 관리 여정
- `docs/workpacks/15a-cook-planner-complete/README.md` — leftover_dishes INSERT 구현
- `docs/workpacks/15b-cook-standalone-complete/README.md` — standalone leftover INSERT 구현
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan
- **fixture baseline**:
  - `leftover_dishes` rows: status=leftover인 항목 2~3개 (다양한 레시피)
  - `leftover_dishes` rows: status=eaten인 항목 1~2개 (eaten_at, auto_hide_at 포함)
  - `leftover_dishes` rows: auto_hide_at 만료된 eaten 항목 1개 (30일 초과 숨김 검증)
  - `recipes` rows: leftover가 참조하는 레시피 (제목, 썸네일)
  - `meal_plan_columns`: 플래너 추가 테스트용 (기존 fixture 재사용)
  - 비로그인 사용자 (401 검증)
  - 타인 소유 leftover 항목 (403 검증)
- **real DB smoke 경로**:
  - `pnpm dev:local-supabase` — `leftover_dishes`, `meals`, `recipes` 테이블 존재 확인
  - `pnpm dev:demo` — PLANNER_WEEK [남은요리] → LEFTOVERS 진입 → 목록 확인 → [다먹음] → ATE_LIST 확인 → [덜먹음] → LEFTOVERS 복귀 → [플래너에 추가] → 날짜/끼니 선택 → Meal 생성 확인
- **seed / reset 명령**:
  - `pnpm local:reset:demo` — 전체 초기화
  - 15a/15b migration으로 `leftover_dishes` 테이블이 이미 생성됨
  - 요리 완료를 통해 leftover_dishes seed 데이터 생성 가능
- **bootstrap이 생성해야 하는 시스템 row**:
  - `meal_plan_columns` (회원가입 시 자동 생성, owning flow: 01-discovery-detail-auth)
  - `leftover_dishes`는 요리 완료 시 자동 생성 (owning flow: 15a/15b cook complete)
  - `recipes` seed data (demo seed에 포함)
- **blocker 조건**:
  - `leftover_dishes` 테이블 미존재 시 → 15a migration 적용 필요
  - `meals` 테이블 미존재 시 → 05/06 migration 확인
  - `recipes` 테이블 미존재 시 → 01 bootstrap 확인
  - leftover_dishes에 테스트 데이터 없으면 → 15a/15b 요리 완료 flow 선행 필요

## Key Rules
- **소유자 검증**: eat/uneat/플래너 추가 시 `leftover_dishes.user_id = current_user.id` 검증
- **멱등성**: eat은 이미 eaten이면 200, uneat은 이미 leftover이면 200 반환
- **CHECK 제약 준수**: `(status='eaten' AND eaten_at IS NOT NULL AND auto_hide_at IS NOT NULL) OR (status='leftover' AND eaten_at IS NULL)` — DB CHECK 제약과 일치하도록 서버에서 상태 전이 시 관련 필드를 동시에 갱신
- **auto_hide_at**: eaten_at + 30일. 클라이언트에서 `GET /leftovers?status=eaten` 조회 시 서버가 `auto_hide_at > now()` 필터 적용
- **leftover → 플래너 추가 시 is_leftover=true**: `POST /meals`에 `leftover_dish_id`가 있으면 서버에서 `is_leftover=true` 자동 세팅 (meals CHECK 제약 준수)
- **남은요리 삭제 없음**: 공식 문서에 삭제 API 없음. eat/uneat 전이만 존재
- **30일 자동 숨김**: 서버 cron이 아닌 조회 시 서버 필터링. `auto_hide_at`이 지난 eaten 항목은 목록에서 제외
- **플래너 추가 시 날짜/끼니/인분 선택 필수**: 기존 PlannerAddSheet/PlannerAddPopup 재사용

## Contract Evolution Candidates (Optional)
없음. 공식 API 문서(v1.2.2) §10-1~10-4와 §2-5(leftover_dish_id 경로)가 이 슬라이스 범위를 완전히 커버한다.

## Primary User Path
1. **PLANNER_WEEK** 상단 [남은요리] 버튼 클릭 → **LEFTOVERS** 화면 진입
2. 남은요리 리스트 확인 (레시피명, 요리완료일, 최근순 정렬)
3. (경로 A) **[다먹음]** 클릭 → 해당 항목이 `eaten` 상태로 전이, ATE_LIST로 이동
4. (경로 B) **[플래너에 추가]** 클릭 → 날짜/끼니 선택 + 인분 입력 → `POST /meals` (leftover_dish_id 포함) → Meal 생성
5. **ATE_LIST** 탭/화면 진입 → 다먹은 기록 확인 (레시피명, 다먹은 날짜, 최근순)
6. ATE_LIST에서 **[덜먹음]** 클릭 → `leftover` 상태 복귀 → LEFTOVERS 리스트로 복원

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (GET /leftovers, POST eat, POST uneat) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 (LEFTOVERS 화면, ATE_LIST 화면, PLANNER_WEEK [남은요리] CTA) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 남은요리 → 플래너 추가 UI (PlannerAddSheet 재사용, leftover_dish_id 전달) <!-- omo:id=delivery-planner-add-leftover;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->

## Stage 2 Backend Evidence

- 2026-04-29T12:38:40Z Codex implemented `GET /api/v1/leftovers`, `POST /api/v1/leftovers/{leftover_id}/eat`, `POST /api/v1/leftovers/{leftover_id}/uneat`, and `POST /api/v1/meals` leftover owner validation.
- Regression tests: `pnpm exec vitest run tests/leftovers.backend.test.ts tests/meal-create-route.test.ts` passed (25 tests).
- Type check: `pnpm typecheck` passed.
- Backend gate: `pnpm verify:backend` passed on 2026-04-29T12:41:11Z (lint/typecheck/product Vitest 428 tests/build/security Playwright 9 tests).
- Real smoke: `pnpm local:reset:demo` passed, `pnpm dev:local-supabase -p 3016` started successfully, `GET /api/v1/leftovers` returned 401 envelope, and local DB schema check confirmed `leftover_dishes`, `meals`, `recipes`, `meal_plan_columns`, plus `leftover_dishes_status_time_integrity`.
- QA fixture baseline now includes leftover, eaten, expired eaten, and other-user leftover rows for Stage 4 Playwright fixture flows.
