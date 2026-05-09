# Slice: wave1-port-planner-meal-add

## Goal

PLANNER_WEEK, 식사추가 옵션 모달(MENU_ADD), 직접등록(MANUAL_CREATE), 끼니 화면(MEAL_SCREEN) 네 화면의 Wave1 프로토타입 개선사항을 실제 서비스에 포팅한다. PLANNER_WEEK의 주간 이동/이모지·배지 제거/CTA 정리, MENU_ADD의 2열 옵션 레이아웃, MANUAL_CREATE의 재료 추가 모달 흐름 정리, MEAL_SCREEN의 레시피 클릭·상태 셀렉터 제거·삭제 아이콘 정리를 수행한다. 끼니 컬럼 CRUD는 이미 merged된 `planner-column-customization` 계약을 소비하며, 모든 변경은 기존 공식 API 계약과 승인 토큰 범위 안에서 UI-only 포팅이다.

## Branches

- 프론트엔드: `feature/fe-wave1-port-planner-meal-add`

## In Scope

- 화면: PLANNER_WEEK, MENU_ADD(식사추가 옵션 모달), MANUAL_CREATE(직접등록), MEAL_SCREEN(끼니 화면)
- API: 없음 (기존 API 변경 없음, 기존 응답 필드만 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### PLANNER_WEEK 변경

- 끼니 컬럼 이모티콘(🌅☀️🍪🌙) 제거 — 컬럼명 텍스트만 표시
- 플래너 카드의 recipe status badge 3종(등록/장보기/요리) 시각적 제거 — status 데이터/로직은 보존
- `+ 음식` 버튼을 기존 chevron(`>`) 자리로 이동, 강조(mint soft 배경, mint 보더)
- 상단 `장보기 목록 만들기` 문구를 `장보기`로 변경
- planner-level `요리하기` 버튼 제거 — meal/card context action 중심으로 전환
- 주간 이동(이전주/다음주) 지원 — 기존 `shiftPlannerRange(range, ±7)`과 `fetchPlanner(start, end)` 소비
- 기존 `SLOT_EMOJI` 매핑 제거, 슬롯 레이블은 plain text + bold

### MENU_ADD 변경 (식사추가 옵션 모달)

- 옵션 버튼을 2열 그리드 레이아웃으로 재배치 (기존 세로 리스트 → 2×3 그리드)
- 옵션 순서: 검색, 레시피북, 팬트리 추천, 남은요리, 유튜브, 직접등록
- `남은 요리에서 추가` 옵션 포함 — 기존 `LeftoverPicker` 모달과 `POST /meals` + `leftover_dish_id` 소비
- 상단 검색 input을 강조 (포커스 시 RecipeSearchPicker 진입 유지)
- 각 옵션 타일에 emoji 아이콘(44×44, brand-soft 배경) + 제목 + 부제 구성

### MANUAL_CREATE 변경 (직접등록)

- 재료 추가 modal 흐름 정리: 검색 input 자동 포커스, 다중 선택, 완료 시 폼에 일괄 주입
- 재료 양 입력 필드를 숫자 전용으로 통일, g/ml 단위 토글 유지
- 기존 API payload shape(`ManualRecipeCreateBody`) 유지 — ingredient_id, amount, unit, ingredient_type, sort_order
- 완료 CTA가 기존 `POST /recipes` + 계획 인분 입력 → `POST /meals` 흐름을 보존

### MEAL_SCREEN 변경

- 레시피명 클릭 시 `/recipe/[id]` 라우트로 RECIPE_DETAIL 이동 (기존 `전체보기` 버튼 제거)
- 진행상태 선택 버튼(status selector) 제거 — status는 데이터로 보존하되 사용자 직접 변경 UI 제거
- 삭제 버튼을 카드 우상단 휴지통 아이콘으로 변경 (기존 텍스트 삭제 버튼 대체)
- 조리법 칩(끓이기/무치기 등) 제거 — 카드에서 조리 방법 표시 제거
- 1개 레시피일 때도 카드 레이아웃 동일하게 유지

## Out of Scope

- HOME, RECIPE_DETAIL, save modal 화면 변경 (Slice B `wave1-port-discovery-detail`에서 완료)
- SHOPPING, COOK_MODE 화면 변경 (Slice D `wave1-port-shopping-cooking`)
- PANTRY, MYPAGE, SETTINGS 화면 변경 (Slice E~F)
- 끼니 컬럼 CRUD/기본 컬럼 설정 (이미 `planner-column-customization`에서 완료)
- API/DB/status/endpoint/field 추가 또는 변경
- 새 npm dependency 추가
- prototype mint/Jua/asset 도입 (production 승인 토큰만 사용)
- `meals.status` 직접 mutation (공식 상태 전이 `registered -> shopping_done -> cook_done` 보존)
- cooking session complete를 우회하는 새 상태 전이
- 끼니 컬럼 순서 변경(reorder) — 1차 범위 밖
- 플래너 카드 drag-and-drop 재배치 동작 변경 (기존 `@dnd-kit` 동작 보존)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` ~ `19-youtube-import` | merged | [x] |
| `planner-column-customization` | merged | [x] PR #367~#370 |
| `wave1-port-foundation` | merged | [x] PR #372, #373 |
| `wave1-port-discovery-detail` | merged | [x] PR #374, #375 |
| `baemin-prototype-planner-week-parity` | merged | [x] |
| `baemin-style-planner-week-retrofit` | merged | [x] |
| `baemin-prototype-modal-overlay-parity` | merged | [x] |

### planner-column-customization 소비 분석

- **현재 상태**: `merged` (PR #367~#370). 기본 끼니 3개(아침/점심/저녁), SETTINGS에서 1~5개 커스터마이징.
- **소비 규칙**: 이 슬라이스는 컬럼 CRUD를 다시 만들지 않고, `GET /planner/columns`에서 반환되는 동적 컬럼 목록을 그대로 소비한다. `SLOT_EMOJI` 매핑을 제거하고 컬럼명 텍스트만 표시.

### baemin-prototype-planner-week-parity 소비 분석

- **현재 상태**: `merged`. PLANNER_WEEK body prototype parity score 96.99, blocker 0.
- **충돌 위험**: 낮음. 이 슬라이스는 parity 결과물 위에서 Wave1 UI 개선을 추가로 적용한다.

### 기존 API 필드 확인

- `GET /planner?start_date=...&end_date=...`: `columns[]` + `meals[]` 반환. 각 meal에 `status`, `is_leftover`, `leftover_dish_id` 포함.
- `POST /meals`: `leftover_dish_id` optional field 존재 — 남은요리에서 추가 시 사용.
- `shiftPlannerRange(range, dayDelta)`: 기존 유틸리티 — 주간 이동에 사용.
- `fetchPlanner(startDate, endDate)`: 기존 API 함수 — 날짜 범위 기반 조회.

## Backend First Contract

이 슬라이스는 UI-only이며 backend 변경이 없다.

- API 변경: 없음
- 기존 `{ success, data, error }` 래퍼: 유지 (소비측 변경 없음)
- 권한 / 소유자 검증: 해당 없음 (기존 보호 로직 유지)
- 상태 전이: 해당 없음 (`registered -> shopping_done -> cook_done` 보존)
- 멱등성: 해당 없음
- Stage 2: N/A — UI-only slice. 근거: PLANNER_WEEK/MENU_ADD/MANUAL_CREATE/MEAL_SCREEN의 UI 포팅만 수행하며, route handler, DB, status transition 변경이 없다. 기존 API 응답의 공식 필드만 소비한다. `shiftPlannerRange`와 `fetchPlanner` 유틸리티는 이미 구현되어 있고, `POST /meals` + `leftover_dish_id`도 기존 계약이다.

## Frontend Delivery Mode

- 기존 공식 API 응답 필드를 그대로 소비하는 UI-only 포팅
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - PLANNER_WEEK: loading (skeleton), empty (식사 없는 주), error (fetch 실패) — 기존 구현 유지
  - MENU_ADD: loading (검색 중), empty (검색 결과 없음), error (fetch 실패) — 기존 구현 유지
  - MANUAL_CREATE: error (등록 실패), loading (저장 중) — 기존 구현 유지
  - MEAL_SCREEN: loading, empty (식사 없음), error (fetch 실패), 409 conflict — 기존 구현 유지
- 로그인 보호 액션: 기존 return-to-action 흐름 유지 (식사 추가, 레시피 등록)

## Design Authority

- UI risk: `anchor-extension` — PLANNER_WEEK는 anchor screen이며, 이 슬라이스에서 주간 이동 UI, 이모지/배지 제거, CTA hierarchy 변경을 수행
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: Stage 4/5에서 mobile 390px/320px screenshot evidence 생성
  - `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-default.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-narrow.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/planner-week-navigation.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/menu-add-option-grid.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/manual-create-ingredient-modal.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-default.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-narrow.png`
  - `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-recipe-click.png`
- Authority status: `pending-review`
- Notes:
  - PLANNER_WEEK는 anchor screen이므로 authority review 필수
  - MENU_ADD, MANUAL_CREATE, MEAL_SCREEN은 anchor screen은 아니지만 PLANNER_WEEK에서 진입하는 핵심 흐름이므로 evidence에 포함
  - `design-generator` / `design-critic`: 변경이 프로토타입 기준의 정리(이모지/배지 제거, CTA 재배치, 2열 그리드)이므로 screenshot evidence 기반 authority로 충분. Stage 4에서 재판단.
  - authority report: `ui/designs/authority/WAVE1_PLANNER_MEAL_ADD-authority.md`
  - Claude final authority gate 통과 필수 (blocker 0개 확인 후 `confirmed`)

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md`
- `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/wave1.jsx`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- **fixture baseline**: PLANNER_WEEK, MENU_ADD, MEAL_SCREEN은 기존 QA fixture (`HOMECOOK_ENABLE_QA_FIXTURES=1`)로 테스트 가능. planner는 meals + columns fixture 필요.
- **real DB smoke 경로**: `pnpm dev:demo` 또는 `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev` — 기존 fixture로 플래너/식사추가/끼니 흐름 검증
- **seed / reset 명령**: 해당 없음 (기존 fixture 재사용)
- **bootstrap 시스템 row**: `meal_plan_columns` 기본 3개(아침/점심/저녁) — 이미 회원가입 시 자동 생성
- **blocker 조건**: 없음. 모든 선행 슬라이스가 merged.

## Key Rules

- production 토큰은 `docs/design/design-tokens.md` 승인 값을 기본으로 쓴다.
- prototype mint/Jua/asset은 별도 승인 없이 사용하지 않는다.
- 기존 API 응답의 공식 필드(`columns`, `meals[].status`, `meals[].is_leftover`, `meals[].leftover_dish_id`, `meals[].recipe_title`)만 소비한다.
- `meals.status` 전이는 `registered -> shopping_done -> cook_done`을 보존한다. 직접 mutation하지 않는다.
- 끼니 컬럼 CRUD는 `planner-column-customization`에서 완료. 이 슬라이스는 `GET /planner/columns` 결과를 그대로 소비한다.
- 기존 `{ success, data, error }` API 래퍼를 유지한다.
- 카드 border-radius 16px, 터치 타겟 44px, 모달/바텀시트 20px radius 기준을 준수한다.
- `@dnd-kit` 드래그 동작은 변경하지 않는다. 시각적 정리만.
- `POST /meals` + `leftover_dish_id`는 기존 계약이므로 그대로 소비한다.
- 주간 이동은 `shiftPlannerRange` 유틸리티와 `fetchPlanner(startDate, endDate)` API를 소비한다. 새 API 없음.

## Contract Evolution Candidates (Optional)

| 후보 | 현재 계약 | 제안 계약 | 기대 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| 남은요리 attach 전용 API | `POST /meals` + `leftover_dish_id` 포함 | 별도 `POST /meals/from-leftover` 엔드포인트 | leftover 전용 검증 로직 분리 | API 문서 v1.2.3 | 미승인 — 기존 계약으로 충분 |
| `meals.status` 직접 mutation | cooking session complete 경유 | `PATCH /meals/{id}` + `status: cook_done` 직접 변경 | no-pantry user 단축 경로 | 요구사항기준선, API 문서 | 미승인 — 공식 상태 전이 보존 |
| MEAL_SCREEN `요리하기` 직행 | meal card에서 cooking session 시작 | meal card에서 바로 `POST /cooking/sessions` | 1-tap 요리 시작 | 화면정의서, API 문서 | 미승인 — MEAL_SCREEN에서 개별 요리하기 버튼은 화면정의서에서 제공하지 않음으로 명시. 프로토타입에만 존재. |

## Primary User Path

1. 사용자가 PLANNER_WEEK에 진입한다.
2. 주간 이동 컨트롤로 이전주/다음주를 탐색한다.
3. 이모지/배지 없이 깔끔한 day card에서 끼니별 식사를 확인한다.
4. 빈 슬롯의 `+ 음식` 버튼을 탭해 MENU_ADD 옵션 모달을 연다.
5. 2열 그리드에서 원하는 추가 방식(검색/레시피북/팬트리/남은요리/유튜브/직접등록)을 선택한다.
6. 직접등록 선택 시 MANUAL_CREATE에서 레시피를 등록하고 계획 인분을 입력한다.
7. MEAL_SCREEN에서 등록된 식사의 레시피명을 클릭해 RECIPE_DETAIL로 이동한다.
8. MEAL_SCREEN에서 삭제 아이콘으로 불필요한 식사를 제거한다.
9. `장보기` 버튼으로 장보기 흐름으로 진입한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2는 N/A (UI-only slice). Stage 4~6에서 프론트/QA/디자인/closeout 항목을 닫는다.

- [ ] PLANNER_WEEK 끼니 컬럼 이모티콘 제거 <!-- omo:id=planner-emoji-removal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK recipe status badge 시각적 제거 <!-- omo:id=planner-badge-removal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK `+ 음식` 버튼 위치/강조 변경 <!-- omo:id=planner-add-food-button;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK `장보기 목록 만들기` → `장보기` 문구 변경 <!-- omo:id=planner-shopping-label;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK planner-level `요리하기` 버튼 제거 <!-- omo:id=planner-cook-button-removal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 주간 이동(이전주/다음주) UI 구현 <!-- omo:id=planner-week-navigation;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD 2열 옵션 그리드 레이아웃 <!-- omo:id=menu-add-grid-layout;stage=4;scope=frontend;review=5,6 -->
- [ ] MENU_ADD `남은 요리에서 추가` 옵션 포함 <!-- omo:id=menu-add-leftover-option;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_CREATE 재료 추가 모달 흐름 정리 <!-- omo:id=manual-create-ingredient-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 레시피명 클릭 → RECIPE_DETAIL 이동 <!-- omo:id=meal-recipe-click;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 진행상태 selector 제거 <!-- omo:id=meal-status-selector-removal;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN 삭제 아이콘 정리 <!-- omo:id=meal-delete-icon;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / unauthorized` 상태 점검 <!-- omo:id=planner-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 이 슬라이스의 Vitest / Playwright 자동화 범위 구분 <!-- omo:id=planner-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 390/320 PLANNER_WEEK screenshot evidence <!-- omo:id=planner-screenshot;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 390/320 MENU_ADD/MEAL_SCREEN screenshot evidence <!-- omo:id=menu-meal-screenshot;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=planner-verify-frontend;stage=4;scope=frontend;review=6 -->
- [ ] authority report 생성 <!-- omo:id=planner-authority-report;stage=5;scope=frontend;review=5,6 -->
