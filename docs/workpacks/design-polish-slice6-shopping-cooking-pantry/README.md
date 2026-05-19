# design-polish-slice6-shopping-cooking-pantry

## Goal

MEAL_SCREEN에서 개별 식사의 `[요리하기]`를 눌렀을 때, 해당 식사에 등록된 인분만큼만 요리되도록 보장한다. COOK_MODE에서는 재료와 조리법이 멀리 떨어져 보이지 않게, 재료를 조리 단계 바로 위에 compact한 가로 목록으로 배치한다. API, DB, 상태 전이 계약은 이미 공식화된 PL-03 MEAL_SCREEN 개별 요리 단축 경로와 기존 cooking/pantry 계약을 그대로 사용한다.

## Branches

- 백엔드: N/A (FE-only behavior/layout polish)
- 프론트엔드: `feature/fe-design-polish-slice6-shopping-cooking-pantry`

## In Scope

- 화면: `MEAL_SCREEN`, `COOK_MODE`
- API: 기존 API 소비만 유지
  - `POST /cooking/sessions`
  - `GET /cooking/sessions/{session_id}/cook-mode`
  - `POST /cooking/sessions/{session_id}/complete`
- 상태 전이: 기존 정책 유지
  - `MEAL_SCREEN` 개별 요리 대상은 `shopping_done` 식사 1건만 허용
  - 완료 시 선택된 식사만 `shopping_done -> cook_done`
  - 취소/뒤로가기 시 상태 변경 없이 `MEAL_SCREEN` 복귀
  - `registered` 식사는 요리 대상에서 제외
- DB 영향: 없음
  - 기존 `meals.planned_servings`, `cooking_sessions.cooking_servings`, `cooking_session_meals`, `recipe_ingredients`, pantry 소진 계약만 소비
- Schema Change:
  - [x] 없음 (기존 테이블 읽기/쓰기 계약 그대로 사용)

## Out of Scope

- API request/response/error 구조 변경
- DB 스키마, seed, status enum 변경
- `registered` 식사 직접 요리 허용
- 독립 요리(RECIPE_DETAIL -> COOK_MODE) 시맨틱 변경
- 장보기 preview/list 생성 규칙 변경
- pantry 소진 정책 또는 leftover 저장 정책 변경
- COOK_READY_LIST 일괄/레시피 그룹 요리 UX 재설계
- 웹 색상 토큰 또는 글로벌 앱 브랜드 토큰 값 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `design-polish-slice1-typography-tokens` | merged | [x] |
| `design-polish-slice2-app-shell-home` | merged | [x] |
| `design-polish-slice3-recipe-detail` | merged | [x] |
| `design-polish-slice4-planner-meal-add` | merged | [x] |
| `design-polish-slice5-manual-youtube` | merged | [x] |
| `07-meal-manage` | merged | [x] |
| `14-cook-session-start` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |

## Classification

- **UI risk: `high-risk`**
- 이유: 신규 화면은 아니지만, planner meal에서 cooking session으로 넘어가는 인분 기준과 COOK_MODE 핵심 정보 위계를 함께 점검한다. 잘못 구현되면 pantry 소진량, leftover 수량, meal 상태 전이가 실제 사용자 데이터와 달라질 수 있다.
- Anchor screen dependency: 없음 (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` 직접 변경 없음)
- design-generator / design-critic: 기존 확정 화면 산출물 재사용
  - `ui/designs/MEAL_SCREEN.md`
  - `ui/designs/COOK_MODE.md`
  - `ui/designs/critiques/MEAL_SCREEN-critique.md`
  - `ui/designs/critiques/COOK_MODE-critique.md`
- product-design-authority: Stage 4 구현 후 screenshot evidence 기반 authority review 필수

## User Findings (2건)

### Finding 1: MEAL_SCREEN 개별 요리 인분 보존

플래너에서 끼니 화면의 개별 요리 카드 `[요리하기]`를 누르면 해당 식사가 끼니로 등록된 인분만큼만 요리되어야 한다. 같은 레시피의 다른 식사나 장보기 합산 인분이 섞이면 안 되며, 세션 생성 payload와 COOK_MODE 표시 인분이 같은 식사 1건의 `planned_servings` 기준임을 테스트로 고정한다.

### Finding 2: COOK_MODE 재료와 조리법 근접 배치

요리모드에서 조리방법/조리 단계와 재료 사이가 과도하게 떨어져 보이지 않아야 한다. 재료는 조리법 바로 위에 `김치 200g 돼지고기 180g 양파 50g`처럼 compact한 가로 목록으로 나열하고, 모바일에서는 자연스럽게 wrap되더라도 조리 단계와 한 화면 맥락 안에서 읽혀야 한다.

## Affected Components

| Component | File | 변경 사유 |
| --- | --- | --- |
| Meal screen | `components/planner/meal-screen.tsx` 또는 관련 meal card component | 개별 `[요리하기]` 세션 생성 시 선택 meal 1건과 인분 기준 보존 |
| Cook mode screen | `components/cooking/cook-mode-screen.tsx` 또는 shared cook mode component | 재료 compact list와 조리 단계 근접 배치 |
| Cooking API adapter/store | 기존 cooking session 호출 helper | `meal_ids=[meal_id]`, `cooking_servings=meal.planned_servings` 보존 확인 |
| Tests | `tests/*cook*`, `tests/*meal*`, `tests/e2e/slice-15a*`, `tests/e2e/slice-07*` | 인분/레이아웃 회귀 고정 |

## Backend First Contract

- Backend 변경 없음.
- 기존 응답 래퍼 `{ success, data, error }` 유지.
- `POST /cooking/sessions`는 기존 계약대로 호출한다.
  - MEAL_SCREEN 경유: `recipe_id`, `meal_ids=[선택된 meal_id]`, `cooking_servings=선택된 meal.planned_servings`
  - 대상 meal은 현재 사용자 소유이며 `shopping_done`이어야 한다.
  - 여러 meal 합산 또는 같은 recipe 전체 합산을 사용하지 않는다.
- `GET /cooking/sessions/{session_id}/cook-mode`는 세션 기준 `cooking_servings`와 스케일된 재료/steps를 그대로 소비한다.
- `POST /cooking/sessions/{session_id}/complete`는 기존 세션 완료 계약을 그대로 사용한다.
- 기존 권한 유지: planner 세션 시작/완료는 로그인 필수, unauthorized 시 login gate 또는 기존 redirect 정책 유지.
- 멱등성 변경 없음: 완료/cancel 정책은 기존 `15a` 계약 유지.

## Frontend Delivery Mode

- 디자인 상태: 기존 confirmed 화면의 high-risk behavior/layout polish
- 필수 상태:
  - `loading`: meal 목록 로딩, cooking session 생성 중, cook-mode data 로딩
  - `empty`: MEAL_SCREEN 식사 없음, COOK_MODE 재료/steps 없음
  - `error`: session 생성 실패, cook-mode fetch 실패, complete/cancel 실패
  - `read-only`: 완료된 shopping/cook_done 식사에서 직접 요리 CTA 미노출 유지
  - `unauthorized`: 비로그인 접근 또는 보호 액션에서 기존 login 흐름 유지
- 로그인 보호 액션은 기존 return-to-action을 유지한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact: Stage 4에서 아래 screenshot evidence 제공 예정
  - `ui/designs/evidence/design-polish-slice6-shopping-cooking-pantry/MEAL_SCREEN-cook-shortcut-mobile.png`
  - `ui/designs/evidence/design-polish-slice6-shopping-cooking-pantry/MEAL_SCREEN-cook-shortcut-narrow.png`
  - `ui/designs/evidence/design-polish-slice6-shopping-cooking-pantry/COOK_MODE-ingredients-steps-mobile.png`
  - `ui/designs/evidence/design-polish-slice6-shopping-cooking-pantry/COOK_MODE-ingredients-steps-narrow.png`
- Authority status: `required`
- Authority report path:
  - `ui/designs/authority/DESIGN_POLISH_SLICE6_SHOPPING_COOKING_PANTRY-authority.md`
- Notes: 기존 확정 화면의 동작 기준과 정보 위계를 다듬는 polish이다. generator/critic은 기존 산출물을 재사용하고, Stage 5에서 screenshot evidence 기준 blocker/major/minor를 판정한다.

## Design Status

- [x] 임시 UI (temporary) -- Stage 1 문서 잠금 상태. Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) -- Stage 4 완료 후, screenshot evidence 준비 상태
- [ ] 확정 (confirmed) -- Stage 5 review + authority blocker 0개 확인 후
- [ ] N/A -- BE-only 슬라이스 아님

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/07-meal-manage/README.md`
- `docs/workpacks/14-cook-session-start/README.md`
- `docs/workpacks/15a-cook-planner-complete/README.md`
- `docs/workpacks/15b-cook-standalone-complete/README.md`
- `docs/요구사항기준선-v1.6.7.md` -- §1-3, §1-4, PL-03 변경
- `docs/화면정의서-v1.5.4.md` -- §6 MEAL_SCREEN, §14 COOK_MODE
- `docs/유저flow맵-v1.3.4.md` -- ⑤-b MEAL_SCREEN 개별 식사 요리 단축 경로
- `docs/api문서-v1.2.5.md` -- §9-2, §9-3, §9-4
- `docs/db설계-v1.3.3.md` -- `meals`, `cooking_sessions`, `cooking_session_meals`, `leftover_dishes`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- fixture baseline: MEAL_SCREEN에 같은 recipe의 `shopping_done` meal 여러 개와 서로 다른 `planned_servings`를 둔 fixture를 사용한다.
- cook-mode fixture: session `cooking_servings` 기준으로 스케일된 재료 3개 이상과 steps 2개 이상을 렌더링한다.
- real DB smoke: API/DB 변경이 없으므로 신규 real DB smoke는 필수 아님. 기존 `15a` planner cook session 경로가 깨지지 않는지 regression으로 확인한다.
- seed/reset: 신규 seed 없음.
- bootstrap: `meal_plan_columns`, recipe, ingredients, pantry data는 기존 owning flow 유지.
- blocker 조건:
  - MEAL_SCREEN 개별 요리 payload가 여러 meal 또는 recipe 합산 인분을 사용함
  - COOK_MODE 표시 인분과 재료 스케일이 session `cooking_servings`와 불일치
  - `registered` 또는 `cook_done` 식사에 개별 `[요리하기]`가 노출됨
  - 모바일 320px에서 재료 가로 목록이 조리 단계나 하단 CTA와 겹침

### 검증 전략

- `pnpm lint`
- `pnpm typecheck`
- targeted Vitest: meal screen cook shortcut, cook mode ingredient layout/rendering
- targeted Playwright: `slice-07-meal-manage`, `slice-15a-cook-planner-complete`
- `pnpm verify:frontend`
- mobile default/narrow screenshot evidence + authority report
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack -- --slice design-polish-slice6-shopping-cooking-pantry`
- `pnpm validate:authority-evidence-presence`
- `pnpm validate:exploratory-qa-evidence`

## Key Rules

1. API/DB 계약을 바꾸지 않는다.
2. MEAL_SCREEN 개별 요리는 선택된 `shopping_done` meal 1건만 세션에 포함한다.
3. `cooking_servings`는 선택된 meal의 `planned_servings`와 일치해야 한다.
4. `registered` 식사는 장보기를 우회해 cook_done이 될 수 없다.
5. COOK_MODE에서는 인분 조절 UI를 추가하지 않는다.
6. 재료 compact list는 조리법 바로 위에 배치하되, 모바일에서 겹침 없이 wrap되어야 한다.
7. 독립 요리와 planner 요리 상태 전이를 섞지 않는다.

## Contract Evolution Candidates

없음. 공식 문서 v1.6.7 / v1.5.4 / API v1.2.5가 이미 MEAL_SCREEN 개별 식사 단축 경로를 승인했으며, 이번 작업은 기존 계약의 구현/표시 회귀를 고정하는 polish다.

## Primary User Path

1. 사용자가 `PLANNER_WEEK`에서 특정 날짜/끼니의 `MEAL_SCREEN`으로 들어간다.
2. `shopping_done` 상태 식사 카드의 `[요리하기]`를 누른다.
3. 앱은 선택된 meal 1건과 그 meal의 planned_servings로 cooking session을 만들고 `COOK_MODE`로 이동한다.
4. `COOK_MODE`에서 재료를 조리 단계 바로 위 compact list로 확인하고 조리한다.
5. 완료하면 선택된 식사만 `cook_done`이 되고 `MEAL_SCREEN`으로 복귀한다.

## Delivery Checklist

- [ ] MEAL_SCREEN 개별 요리 session create payload가 선택 meal 1건과 planned_servings를 사용 <!-- omo:id=dp6-meal-shortcut-serving-payload;stage=4;scope=frontend;review=5,6 -->
- [ ] `registered` / `cook_done` 식사에 개별 `[요리하기]` CTA 미노출 유지 <!-- omo:id=dp6-meal-shortcut-status-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE session cooking_servings와 표시 인분/재료 스케일 불일치 없음 확인 <!-- omo:id=dp6-cook-serving-contract-preserved;stage=4;scope=shared;review=6 -->
- [ ] COOK_MODE 재료 목록을 조리 단계 바로 위 compact horizontal/wrapping list로 배치 <!-- omo:id=dp6-cook-ingredients-near-steps;stage=4;scope=frontend;review=5,6 -->
- [ ] COOK_MODE 재료/조리법 간 과도한 vertical gap 제거 <!-- omo:id=dp6-cook-gap-reduction;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 회귀 없음 확인 <!-- omo:id=dp6-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile default/narrow screenshot evidence 생성 <!-- omo:id=dp6-authority-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] authority report 작성 및 blocker 0 확인 <!-- omo:id=dp6-authority-report;stage=4;scope=frontend;review=6 -->
- [ ] targeted Vitest / Playwright meal-cooking 회귀 테스트 통과 <!-- omo:id=dp6-targeted-tests;stage=4;scope=frontend;review=6 -->
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend` 통과 <!-- omo:id=dp6-frontend-verification;stage=4;scope=frontend;review=6 -->
