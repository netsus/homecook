# wave1-port-shopping-cooking

> Slice D of Wave1 Service Porting Plan
> Stage: 5/6 closeout
> Owner: Claude (Stage 1), Codex (Stage 4 fallback, 5, 6)

## Goal

장보기 흐름(SHOPPING_FLOW, SHOPPING_DETAIL)과 요리 흐름(COOK_READY_LIST, COOK_MODE)의 Wave1 프로토타입 디자인 개선사항을 기존 공식 API/DB/status 계약 범위 안에서 UI-only로 포팅한다. 장보기 목록의 프리뷰 라벨 정리, 팬트리 제외 섹션 명확화, 공유/완료 버튼 배치 정리, 완료 후 pantry 반영 modal 유지, 요리모드의 단일 스크롤 뷰 전환과 timer/note/pause/prev/next 제거, cancel/complete 버튼 clipping 해결을 포함한다.

## In Scope

### Screens

| Screen | Component File | Change Summary |
|--------|---------------|----------------|
| SHOPPING_FLOW | `components/shopping/shopping-flow-screen.tsx` | `#1`, 끼니 이모티콘 제거; 하단 생성 버튼 라벨 정리 |
| SHOPPING_DETAIL | `components/shopping/shopping-detail-screen.tsx` | title에 생성 날짜/목록명 표시; share/complete 버튼 배치 정리; 구매/팬트리 제외 섹션 명확화; `이미있음`/`되살리기` 토글 버튼; `장보기 완료` 하단 배치 |
| PANTRY_REFLECTION | `components/shopping/pantry-reflection-popup.tsx` | 완료 후 pantry 반영 modal 유지/정리 |
| COOK_READY_LIST | `components/cooking/cook-ready-list-screen.tsx` | 날짜별 그룹 라벨 정리, 빈 상태 카드 개선 |
| COOK_MODE (session) | `components/cooking/cook-mode-screen.tsx` | timer/note/pause/prev/next 제거; 전체 step 한 화면 스크롤; cancel/complete 하단 sticky; consumed ingredient 줄바꿈 수정 |
| COOK_MODE (standalone) | `components/cooking/standalone-cook-mode-screen.tsx` | session cook-mode와 동일한 UI 변경 적용 |
| CONSUMED_INGREDIENT | `components/cooking/consumed-ingredient-sheet.tsx` | 줄바꿈/레이아웃 수정 |

### APIs Consumed (no changes)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/shopping/preview` | GET | 장보기 프리뷰 (eligible meals/recipes) |
| `/shopping/lists` | POST | 장보기 목록 생성 |
| `/shopping/lists/{id}` | GET | 장보기 목록 상세 |
| `/shopping/lists/{id}/items/{item_id}` | PATCH | 아이템 체크/제외 토글 |
| `/shopping/lists/{id}/items/reorder` | PATCH | 아이템 순서 변경 |
| `/shopping/lists/{id}/complete` | POST | 장보기 완료 + pantry 반영 |
| `/shopping/lists/{id}/share-text` | GET | 공유 텍스트 생성 |
| `/cooking/ready` | GET | 요리 가능 목록 |
| `/cooking/sessions` | POST | 요리 세션 생성 |
| `/cooking/sessions/{id}/cook-mode` | GET | 요리모드 데이터 |
| `/cooking/sessions/{id}/complete` | POST | 요리 완료 |
| `/cooking/sessions/{id}/cancel` | POST | 요리 취소 |
| `/cooking/standalone-complete` | POST | 독립 요리 완료 |
| `/recipes/{recipe_id}/cook-mode` | GET | 독립 요리모드 데이터 |

### DB / Schema Changes

None. 기존 테이블과 필드만 소비한다.

### Status / Contract Changes

None. 기존 상태 전이 규칙을 그대로 유지한다:
- `meals.status`: `registered -> shopping_done -> cook_done`
- `cooking_sessions.status`: `in_progress -> completed | cancelled`
- `shopping_lists.is_completed`: `false -> true`

## Out of Scope

- HOME, RECIPE_DETAIL, save modal 화면 변경 (Slice B `wave1-port-discovery-detail`에서 완료)
- PLANNER_WEEK, MENU_ADD, MANUAL_CREATE, MEAL_SCREEN 변경 (Slice C `wave1-port-planner-meal-add`에서 완료)
- PANTRY, MYPAGE, SETTINGS 화면 변경 (Slice E~F)
- API/DB/status/endpoint/field 추가 또는 변경
- 새 npm dependency 추가
- prototype mint/Jua/asset 도입
- `meals.status` 직접 mutation
- 장보기 목록 drag-drop 재정렬 방식 변경 (slice 11에서 완료)
- shopping list history 화면 변경

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `wave1-port-foundation` (Slice A) | merged | 공용 Button/Chip/Card/Modal/Dropdown 프리미티브 |
| `wave1-port-discovery-detail` (Slice B) | merged | HOME/RECIPE_DETAIL 포팅 완료 |
| `wave1-port-planner-meal-add` (Slice C) | merged | PLANNER/MENU_ADD/MEAL_SCREEN 포팅 완료 |
| `09-shopping-preview-create` | merged | SHOPPING_FLOW 기본 구현 |
| `10a-shopping-detail-interact` | merged | SHOPPING_DETAIL 아이템 체크/제외 |
| `10b-shopping-share-text` | merged | 장보기 공유 텍스트 |
| `11-shopping-reorder` | merged | 장보기 아이템 재정렬 |
| `12a-shopping-complete` | merged | 장보기 완료 |
| `12b-shopping-pantry-reflect` | merged | 완료 후 pantry 반영 3-way |
| `14-cook-session-start` | merged | COOK_READY_LIST + 세션 생성 |
| `15a-cook-planner-complete` | merged | COOK_MODE (planner) 완료/취소 |
| `15b-cook-standalone-complete` | merged | COOK_MODE (standalone) 완료 |
| `planner-column-customization` | merged | 끼니 컬럼 커스터마이징 |

## Backend First Contract

### Stage 2: N/A

UI-only slice. 모든 변경은 기존 공식 API의 request/response 계약 범위 안에서 FE 렌더링만 바꾼다. Route handler, DB schema, status enum, 상태 전이 로직에 변경이 없다.

근거:
- shopping preview label/icon 제거: UI-only
- shopping detail title/date 표시: `shopping_lists.title`, `created_at` 필드는 공식 API response에 포함
- 구매/제외 섹션 UI 정리: `is_pantry_excluded` 분기 로직은 기존 API로 충분
- `이미있음`/`되살리기` 토글: 기존 `PATCH /items/{id}`의 `is_pantry_excluded` 필드 사용
- share/complete 버튼 배치: UI-only
- pantry 반영 modal: 기존 `add_to_pantry_item_ids` 3-way semantics 유지
- COOK_MODE 전체 step 스크롤: UI-only, `GET /cook-mode` response 소비
- timer/note/pause 제거: UI-only
- consumed ingredient 줄바꿈: UI-only

### Existing Endpoints Consumed

모든 endpoint는 기존 공식 계약대로 소비한다. `{ success, data, error }` wrapper 형식을 유지한다.

### Error Handling

| HTTP Status | Scenario | FE Response |
|-------------|----------|-------------|
| 401 | 비로그인 | login gate redirect |
| 403 | 타인의 리스트/세션 | 접근 불가 토스트 + 목록 이동 |
| 404 | 삭제된 리스트/세션 | 존재하지 않음 토스트 + 목록 이동 |
| 409 | 완료된 리스트 mutation | read-only 상태 전환 + 피드백 |
| 422 | 잘못된 요청 데이터 | validation 에러 표시 |

### Idempotency / Read-only

- 완료된 `SHOPPING_DETAIL`은 read-only. 수정 시도 시 409 반환 규칙 유지.
- 요리 세션 cancel은 idempotent (재호출 200).
- 요리 세션 complete는 idempotent (재호출 200, `meals_updated=0`).

## Frontend Delivery Mode

### Required UI States

| State | Shopping | Cooking |
|-------|----------|---------|
| `loading` | 프리뷰/목록 로딩 스피너 | ready list/cook mode 로딩 |
| `empty` | 장보기 대상 없음 | 요리 가능한 식사 없음 |
| `error` | API 실패 시 재시도 안내 | API 실패 시 재시도 안내 |
| `read-only` | 완료된 장보기 목록 | 완료/취소된 세션 |
| `unauthorized` | login gate | login gate |

### Shopping Completed Lock

완료된 장보기 목록에서:
- 아이템 체크/제외 UI 숨김
- reorder 비활성
- complete 버튼 숨김
- share 버튼은 유지 (read-only에서도 공유 가능)

### Cooking Session States

| State | UI |
|-------|-----|
| `in_progress` | cook mode 진입 가능, cancel/complete 활성 |
| `completed` | read-only 결과 |
| `cancelled` | 목록으로 돌아감 |

## Design Authority

- UI risk: `high-risk` — COOK_MODE interaction model이 step-by-step/tabs에서 단일 스크롤 뷰로 바뀐다.
- Anchor screen dependency: `N/A`
- Visual artifact: 2026-05-13 Phase4/Phase5 re-audit에서 mobile 390px/320px screenshot evidence 생성
  - `ui/designs/evidence/wave1-port-shopping-cooking/phase4-prep.md`
  - `ui/designs/evidence/wave1-port-shopping-cooking/phase5-visual-audit.md`
  - `ui/designs/evidence/wave1-port-shopping-cooking/visual-verdict.json`
  - `ui/designs/evidence/wave1-port-shopping-cooking/claude-final-authority-gate.md`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-preview.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-review.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-review-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-default.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-readonly.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-complete-pantry.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/shopping-complete-pantry-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-ready-list.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-ready-list-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-scroll.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-complete.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-complete-narrow.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/standalone-cook-mode-scroll.png`
  - `ui/designs/evidence/wave1-port-shopping-cooking/standalone-cook-mode-narrow.png`
- Authority status: `reviewed`
- Notes:
  - Historical Claude Stage 4 handoff was attempted through the resume session but hit provider limit; Codex fallback implementation remains the historical source.
  - 2026-05-13 Phase5 re-audit refreshed evidence against the fixed Wave1 prototype and added missing 320px pantry reflect picker evidence.
  - Claude final authority gate PASS: blocker 0, unclassified visual differences 0.
  - authority report: `ui/designs/authority/WAVE1_SHOPPING_COOKING-authority.md`

### UI Risk Classification

- SHOPPING_FLOW: `low-risk-ui-change` (라벨/아이콘 제거, 버튼 정리)
- SHOPPING_DETAIL: `low-risk-ui-change` (섹션 명확화, 버튼 배치, title 표시)
- COOK_READY_LIST: `low-risk-ui-change` (그룹 라벨 정리)
- COOK_MODE: `high-risk-ui-change` (step-by-step -> 단일 스크롤 뷰 전환, control 제거)

### Anchor / Future-Screen Dependencies

- COOK_MODE는 anchor screen이 아니지만, interaction model 변경(step-by-step -> scroll)이 `high-risk-ui-change`에 해당한다.
- SHOPPING_DETAIL, SHOPPING_FLOW는 기존 mental model 유지 범위 내의 정리이므로 low-risk.

### Design Generator / Critic

- SHOPPING_FLOW, SHOPPING_DETAIL, COOK_READY_LIST: generator/critic 생략. 기존 화면의 라벨, spacing, 버튼 배치 정리이므로 screenshot evidence 기반 authority로 충분하다.
- COOK_MODE: interaction model 변경이므로 screenshot evidence 기반 authority review 필수. generator/critic는 기존 코드를 정리하는 방향이므로 생략하되, Stage 4 evidence에서 모바일 스크롤 UX를 면밀히 확인한다.

### Screenshot Evidence (Stage 4)

| Evidence ID | Screen | Viewport |
|------------|--------|----------|
| `shopping-flow-preview` | SHOPPING_FLOW 프리뷰 | 390px |
| `shopping-flow-narrow` | SHOPPING_FLOW 프리뷰 | 320px |
| `shopping-flow-review` | SHOPPING_FLOW review | 390px |
| `shopping-flow-review-narrow` | SHOPPING_FLOW review | 320px |
| `shopping-detail-default` | SHOPPING_DETAIL 구매/제외 섹션 | 390px |
| `shopping-detail-narrow` | SHOPPING_DETAIL | 320px |
| `shopping-detail-readonly` | SHOPPING_DETAIL 완료 상태 | 390px |
| `shopping-complete-pantry` | pantry 반영 modal | 390px |
| `shopping-complete-pantry-narrow` | pantry 반영 modal | 320px |
| `cook-ready-list` | COOK_READY_LIST | 390px |
| `cook-ready-list-narrow` | COOK_READY_LIST | 320px |
| `cook-mode-scroll` | COOK_MODE 스크롤 뷰 | 390px |
| `cook-mode-narrow` | COOK_MODE | 320px |
| `cook-mode-complete` | COOK_MODE 완료 버튼 | 390px |
| `cook-mode-complete-narrow` | COOK_MODE 완료 버튼 | 320px |
| `standalone-cook-mode-scroll` | Standalone COOK_MODE 스크롤 뷰 | 390px |
| `standalone-cook-mode-narrow` | Standalone COOK_MODE 스크롤 뷰 | 320px |

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — 2026-05-13 refreshed evidence, visual audit, and Claude final authority gate PASS로 다시 잠근다.
- [ ] N/A

## Authority Report

`ui/designs/authority/WAVE1_SHOPPING_COOKING-authority.md`

## Non-Negotiable Rules

아래 규칙은 이 slice에서 절대 위반하지 않는다:

1. **Completed SHOPPING_DETAIL is read-only.** `is_completed=true`인 목록에서 체크/제외/재정렬 UI를 숨긴다.
2. **Mutating a completed list returns 409.** FE는 409 응답 시 read-only 상태로 전환한다.
3. **`is_pantry_excluded=true` implies `is_checked=false`.** 서버가 자동으로 처리하며, FE는 이 규칙을 가정한다.
4. **`add_to_pantry_item_ids` 3-way semantics.** `null` (전체 추가), `[]` (추가 안 함), `[uuids]` (선택 추가)를 구분한다.
5. **Invalid pantry add ids are ignored.** `pantry_added` count는 실제 반영된 수와 일치해야 한다.
6. **Do not mix planner cooking and standalone cooking status transitions.** planner 경로는 `cooking_sessions` 경유, standalone은 `standalone-complete` 경유.
7. **Do not add undocumented endpoints, status values, fields, or DB changes.**

## QA / Test Data Plan

### Fixture Routes

기존 QA fixture 서버(`http://127.0.0.1:3100`)에서 shopping/cooking API를 mock한다. 기존 E2E helper `tests/e2e/helpers/mock-routes.ts`의 shopping/cooking 목업을 소비한다.

### Existing E2E Tests (regression targets)

| Test File | Coverage |
|-----------|----------|
| `tests/e2e/slice-09-shopping-preview-create.spec.ts` | shopping preview/create flow |
| `tests/e2e/slice-10a-shopping-detail-interact.spec.ts` | detail check/exclude |
| `tests/e2e/slice-10b-shopping-share-text.spec.ts` | share text |
| `tests/e2e/slice-12a-shopping-complete.spec.ts` | shopping complete |
| `tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts` | pantry reflection |
| `tests/e2e/slice-14-cook-session-start.spec.ts` | cook ready + session start |
| `tests/e2e/slice-15a-cook-planner-complete.spec.ts` | cook mode complete/cancel |
| `tests/e2e/slice-15b-cook-standalone-complete.spec.ts` | standalone cook complete |

### Existing Vitest Tests (regression targets)

| Test File | Coverage |
|-----------|----------|
| `tests/shopping-flow-screen.test.tsx` | shopping flow UI |
| `tests/shopping-detail.frontend.test.tsx` | shopping detail UI |
| `tests/cook-mode-screen.test.tsx` | cook mode UI |
| `tests/cook-ready-list-screen.test.tsx` | cook ready list UI |
| `tests/standalone-cook-mode-screen.test.tsx` | standalone cook mode UI |

### New Tests (Stage 4)

- Shopping flow: 라벨/아이콘 제거 확인, 버튼 라벨 변경 확인
- Shopping detail: 구매/제외 섹션 분리 확인, `이미있음`/`되살리기` 토글, title/date 표시, complete 버튼 하단 배치, read-only 상태
- Cook mode: 전체 step 스크롤 렌더, timer/note/pause 부재 확인, cancel/complete 하단 sticky 확인, consumed ingredient 줄바꿈
- Cook ready list: 날짜별 그룹 확인

### Real DB Smoke

N/A. 모든 변경이 UI-only이고 기존 API 계약을 변경하지 않으므로 fixture 기반 E2E로 충분하다. 기존 shopping/cooking slices(09, 10a, 10b, 12a, 12b, 14, 15a, 15b)에서 이미 real DB smoke를 수행했다.

## Contract Evolution Candidates

현재 발견된 후보 없음. 모든 변경이 기존 공식 API 계약 범위 내에서 가능하다.

잠재적 후보 (이 slice에서는 구현하지 않음):
- shopping detail의 section grouping을 서버 측에서 제공하려 할 때 (현재는 FE에서 `is_pantry_excluded`로 분기)
- cook mode에서 step progress tracking을 서버에 저장하려 할 때 (현재는 FE 로컬 상태)

## Primary User Path

### Path 1: 장보기 완료 흐름

1. PLANNER_WEEK에서 `장보기` CTA 클릭 -> SHOPPING_FLOW 프리뷰 진입
2. 프리뷰에서 식사 선택 확인 (라벨/아이콘 없이 깔끔한 UI) -> `장보기 목록 만들기` 클릭
3. SHOPPING_DETAIL에서 구매 섹션 아이템 체크, 팬트리 제외 섹션에서 `되살리기` 가능
4. `장보기 완료` 하단 버튼 클릭 -> pantry 반영 modal에서 팬트리 추가할 재료 선택 -> 완료

### Path 2: 요리하기 (planner 경로)

1. COOK_READY_LIST에서 날짜별 그룹으로 요리 가능한 식사 확인
2. `요리 시작` 클릭 -> COOK_MODE 진입
3. 전체 step을 단일 스크롤 뷰로 확인 (timer/note/pause 없이)
4. 하단 `요리 완료` sticky 버튼 클릭 -> consumed ingredient 선택 -> 완료

### Path 3: 요리하기 (standalone 경로)

1. RECIPE_DETAIL에서 `요리하기` 클릭 -> standalone COOK_MODE 진입
2. 전체 step 스크롤 뷰로 확인
3. 하단 `요리 완료` 클릭 -> consumed ingredient 선택 -> 완료

## Delivery Checklist

### Backend (Stage 2)

- [x] Stage 2 N/A 확인 — UI-only slice <!-- omo:id=be-na;stage=2;scope=backend;review=3 -->

### Frontend (Stage 4)

- [x] SHOPPING_FLOW 프리뷰 라벨/아이콘 제거 <!-- omo:id=fe-shopping-flow;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL 구매/제외 섹션 UI 정리 <!-- omo:id=fe-shopping-detail;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL title/date 표시 <!-- omo:id=fe-shopping-detail-title;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL share/complete 버튼 배치 <!-- omo:id=fe-shopping-buttons;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL `이미있음`/`되살리기` 토글 버튼 <!-- omo:id=fe-shopping-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] Pantry 반영 modal 정리 <!-- omo:id=fe-pantry-modal;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_READY_LIST 그룹 라벨 정리 <!-- omo:id=fe-cook-ready;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE step-by-step -> 단일 스크롤 뷰 전환 <!-- omo:id=fe-cook-mode-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE timer/note/pause/prev/next 제거 <!-- omo:id=fe-cook-controls-remove;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE cancel/complete 하단 sticky <!-- omo:id=fe-cook-sticky;stage=4;scope=frontend;review=5,6 -->
- [x] Consumed ingredient 줄바꿈 수정 <!-- omo:id=fe-consumed-wrap;stage=4;scope=frontend;review=5,6 -->
- [x] Standalone cook mode 동일 변경 적용 <!-- omo:id=fe-standalone-cook;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest 테스트 추가/갱신 <!-- omo:id=fe-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] Playwright E2E 테스트 갱신 <!-- omo:id=fe-e2e;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 상당 로컬 게이트 통과 (`lint`, `typecheck`, `test:product`, `build`, focused E2E) <!-- omo:id=fe-verify;stage=4;scope=frontend;review=5,6 -->
- [x] Screenshot evidence 생성 (390px + 320px) <!-- omo:id=fe-evidence;stage=4;scope=frontend;review=5,6 -->

### Design (Stage 5)

- [x] Authority report 작성 <!-- omo:id=design-authority;stage=4;scope=frontend;review=5,6 -->
- [x] Design Status -> `confirmed` (blocker 0) <!-- omo:id=design-confirmed;stage=4;scope=frontend;review=5,6 -->
