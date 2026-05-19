# design-polish-slice4-planner-meal-add

## Goal

PLANNER_WEEK / MEAL_SCREEN / MENU_ADD / PICKERS 화면의 식사추가 흐름을 모달/시트 기반으로 전환하고, 남은요리 피커 카드의 메타데이터 표기와 버튼 배치를 개선하며, 레시피 검색 아이콘을 교체·확대한다. `직접등록`은 기존 페이지 라우팅을 유지한다 (slice5 MANUAL_RECIPE_CREATE / YOUTUBE_IMPORT 대상).

## Branches

- 백엔드: N/A (FE-only visual/interaction polish)
- 프론트엔드: `feature/fe-design-polish-slice4-planner-meal-add`

## In Scope

- Surface: `frontend`
- Backend: N/A (기존 API 소비만 수행. `GET /leftovers`, `GET /planner`, `GET /meals`, `POST /meals`, `GET /recipes`, `GET /recipe-books/{id}/recipes`, `GET /recipes/pantry-match` 모두 기정의)
- API 신규/변경: 없음
- DB 변경: 없음
- Auth 변경: 없음
- State transition 변경: 없음 (`meals.status`는 `registered -> shopping_done -> cook_done` 유지)

## Classification

- **UI risk: `anchor-extension`**
- 이 슬라이스는 `PLANNER_WEEK` 앵커 화면에서 식사추가 옵션이 열리는 방식(full-page → modal/sheet)을 변경한다. `docs/design/anchor-screens.md`의 anchor extension 정의 중 "modal, sheet, full-page 전환 구조를 변경" 항목에 해당한다.
- 추가로 `MEAL_SCREEN`에서 "식사 추가" 버튼이 `router.push`로 MENU_ADD 페이지 전체를 여는 대신 동일한 식사추가 모달/시트를 띄우도록 변경하므로, 진입 플로우 구조가 바뀐다.
- 남은요리 피커 카드 레이아웃 변경, 검색 아이콘 교체는 그 자체로는 low-risk이지만, 전체 슬라이스가 anchor-extension으로 분류되므로 동일한 authority gate를 공유한다.

### anchor-extension 근거

| anchor-screens.md 기준 | 해당 여부 |
|-------------------------|-----------|
| 핵심 CTA 추가/변경 | 부분 해당 — "식사 추가" 진입 경로의 presentation 변경 |
| 스크롤 구조 변경 | 해당 없음 |
| 정보 구조/섹션 위계 변경 | 해당 없음 |
| modal, sheet, full-page 전환 구조 변경 | **해당** — MENU_ADD 옵션이 full-page에서 modal/sheet로 전환 |
| 다른 slice의 핵심 진입 플로우를 새로 얹음 | 해당 없음 |

### design-generator / design-critic 판단

이 슬라이스는 anchor-extension이지만 **신규 화면을 추가하지 않는다**. 기존 PLANNER_WEEK, MEAL_SCREEN, MENU_ADD, LeftoverPicker 화면/컴포넌트의 presentation 방식과 부분 UI를 조정하는 작업이다. 따라서:
- **design-generator**: 생략. 신규 화면 설계가 아닌 기존 컴포넌트의 modal 전환, 카드 레이아웃 재배치, 아이콘 교체 범위이므로 텍스트 기반 Stage 1 문서로 충분하다.
- **design-critic**: 생략. 동일 근거.
- **product-design-authority**: Stage 4 구현 후 screenshot evidence 기반 authority review **필수**. anchor-extension이므로 `docs/engineering/product-design-authority.md`의 "anchor screen 확장" 조건에 해당한다.

## User Findings (4건)

### Finding 1: MENU_ADD 옵션 모달/시트 전환

**현황**: `MENU_ADD`는 `/menu-add` 경로의 full-page 화면이다. 모바일에서 옵션(검색/레시피북/팬트리/남은요리/유튜브)을 클릭하면 `pickerMode` 상태로 inline picker를 보여주지만, PLANNER_WEEK/MEAL_SCREEN에서 MENU_ADD로 진입할 때 `router.push`로 전체 페이지 이동이 발생한다.

**변경**: `직접등록`을 제외한 모든 옵션은 모달/바텀시트로 열어야 한다. 사용자가 원래 보던 PLANNER_WEEK 또는 MEAL_SCREEN의 컨텍스트를 유지한 채 식사를 추가할 수 있어야 한다.

**적용 범위**:
- PLANNER_WEEK의 빈 셀 `+` 버튼 → 식사추가 옵션 시트 열기 (현재는 `openMealAddSheet`로 이미 시트를 열고 있음, 그 시트 안의 옵션 클릭이 picker를 시트/모달로 여는 것이 핵심)
- 각 picker (RecipeSearchPicker, RecipeBookSelector, PantryMatchPicker, LeftoverPicker)가 시트/모달 형태로 동작해야 한다
- `직접등록` 옵션은 기존대로 `router.push`로 `/menu/add/manual` 이동

**유튜브 분류**: 사용자는 "직접등록을 제외한 모든 옵션"을 모달로 전환하라고 했지만, slice5가 `YOUTUBE_IMPORT` 리디자인을 담당한다. 이 슬라이스에서는 유튜브 옵션을 **경량 모달 진입점**(URL 입력 → 기존 유튜브 임포트 라우트로 이동)으로 처리하되, 전체 YouTube import UX 리디자인은 하지 않는다. 유튜브 모달이 구현 난이도 높으면 기존 라우트 fallback(`router.push`)을 유지하고 slice5에서 모달 전환하는 것도 허용한다.

### Finding 2: MEAL_SCREEN "식사 추가" 모달 전환

**현황**: `MEAL_SCREEN`의 "식사 추가" 버튼은 `router.push(addMealHref)`로 `/menu-add?...` 전체 페이지로 이동한다.

**변경**: "식사 추가" 버튼 클릭 시 Finding 1과 동일한 식사추가 옵션 모달/시트를 열어야 한다. MEAL_SCREEN의 날짜/끼니 컨텍스트가 유지된 상태에서 피커 모달이 열리고, 식사 추가 완료 후 MEAL_SCREEN으로 복귀한다.

### Finding 3: 레시피 검색 아이콘 교체 및 확대

**현황**: `RecipeSearchPicker`의 검색 아이콘은 인라인 SVG (24x24 viewBox, circle + path, `rotate-[-12deg]`)로 `h-8 w-8` 버튼 안에 있다.

**변경**: 검색 아이콘을 더 크고 명확하게 교체한다. 구체적 아이콘 사양은 Stage 4에서 결정하되, 기존보다 시각적으로 더 눈에 띄어야 한다.

### Finding 4: LeftoverPicker 카드 레이아웃 개선

**현황**:
- 각 남은요리 카드 하단에 full-width `선택` 버튼 (`h-[var(--control-height-md)] w-full rounded-[var(--radius-card)] bg-[var(--brand)]`)
- 날짜 메타: `"X월 X일 요리"` 형식 (`formatCookedAt()`)
- 시트 제목: `"남은요리 선택"`
- `source_meal_label`과 `cooking_servings`/`source_planned_servings`는 타입에 존재하나 카드에서 미노출

**변경 4-a**: 선택 버튼을 카드 오른쪽에 배치하고 크기를 축소한다. 기존 full-width 하단 배치에서 카드 우측의 compact 버튼으로 변경.

**변경 4-b**: 버튼 텍스트를 `선택` → `추가`로 변경.

**변경 4-c**: 날짜 메타데이터를 `"5월 7일 요리"` → `"5/7 저녁 2인분"` 형식으로 변경.
- `cooked_at`의 월/일을 슬래시 형식으로 축약
- `source_meal_label` (예: "저녁")을 추가
- `source_planned_servings` 또는 `cooking_servings` (예: "2인분")을 추가
- API 응답에 `source_meal_label`, `source_planned_servings`, `cooking_servings` 필드가 이미 존재하므로 BE 변경 불필요

**변경 4-d**: 시트 제목을 `"남은요리 선택"` → `"남은 요리에서 추가"`로 변경.

## Affected Components

| Component | File | 변경 사유 |
|-----------|------|-----------|
| PlannerWeekScreen | `components/planner/planner-week-screen.tsx` | 기존 mealAddSheet의 옵션 클릭이 picker 모달을 시트/모달로 여는 방식으로 전환 |
| MealScreen | `components/planner/meal-screen.tsx` | "식사 추가" 버튼: `router.push` → 옵션 시트/모달 열기 |
| MenuAddScreen | `components/planner/menu-add-screen.tsx` | 모바일 옵션 클릭 → modal/sheet picker 로직. 기존 `/menu-add` URL 라우트는 직접 접근 fallback으로 유지 |
| LeftoverPicker | `components/planner/leftover-picker.tsx` | 카드 레이아웃 (버튼 위치/크기/텍스트), 메타데이터 표기, 시트 제목 |
| RecipeSearchPicker | `components/planner/recipe-search-picker.tsx` | 검색 아이콘 교체/확대 |
| RecipeBookSelector | `components/planner/recipe-book-selector.tsx` | 모달/시트 presentation (필요 시) |
| PantryMatchPicker | `components/planner/pantry-match-picker.tsx` | 모달/시트 presentation (필요 시) |

## Implementation Constraints

1. **기존 URL 라우트 유지**: `/menu-add`, `/menu/add/manual`, `/menu/add/youtube` 라우트는 삭제하지 않는다. 직접 URL 접근, 테스트, `직접등록` fallback으로 필요하다.
2. **Modal-origin return behavior**: 모달에서 식사 추가 완료 후 `returnTo`/`returnSurface` 컨텍스트가 보존되어야 한다. PLANNER_WEEK에서 열린 모달은 PLANNER_WEEK로, MEAL_SCREEN에서 열린 모달은 MEAL_SCREEN으로 복귀한다.
3. **`직접등록` 제외**: `직접등록`은 기존 `router.push` 방식으로 유지한다. slice5가 MANUAL_RECIPE_CREATE/YOUTUBE_IMPORT를 담당한다.
4. **유튜브 옵션 scope**: 경량 모달 진입점(URL 입력)까지만 이 슬라이스 범위. 전체 YouTube import UX 리디자인은 slice5. 구현 난이도 높으면 기존 라우트 fallback 허용.
5. **`GET /leftovers` 기존 필드 사용**: `source_meal_label`, `source_planned_servings`, `cooking_servings` 필드가 API 응답에 이미 존재. `source_meal_label`과 `source_planned_servings`는 DB JOIN으로 계산됨 (nullable — 연결된 meal이 없으면 null). null 시 fallback 표시 필요.
6. **웹 토큰 변경 없음**: `--web-*` 토큰을 변경하지 않는다.
7. **글로벌 앱 토큰 값 변경 없음**: `app/globals.css`의 `--brand-primary` 등 글로벌 토큰 값은 변경하지 않는다.
8. **터치 타겟 44px**: `docs/design/mobile-ux-rules.md` 기준 최소 44×44px 터치 타겟 유지.
9. **desktop web**: 데스크톱은 기존 MENU_ADD 사이드 패널 레이아웃을 유지한다. 모달 전환은 모바일에 집중한다. 데스크톱에서 regression이 없어야 한다.
10. **domain rules**: `meals.status`는 `registered -> shopping_done -> cook_done` only. 완화하지 않는다.

## State UI Preservation

- 기능 변경 없음: 식사추가 진입 방식(page → modal/sheet)의 presentation 변경만 수행
- 필수 상태: 기존 `loading / empty / error / read-only / unauthorized` 유지 (신규 추가 없음)
- 로그인 보호 액션: 기존 login gate 보존 (식사 추가는 로그인 필요)

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: Stage 4에서 PLANNER_WEEK 식사추가 모달, MEAL_SCREEN 식사추가 모달, LeftoverPicker 카드 레이아웃, RecipeSearchPicker 아이콘의 before/after screenshot 제공 예정
- Authority status: reviewed
- Evidence paths:
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile-narrow.png`
- Notes: anchor-extension이므로 Stage 4 완료 후 screenshot evidence 기반 authority review가 필요하다. `docs/engineering/product-design-authority.md`의 "anchor screen 확장" 조건에 해당한다. Claude final authority gate는 provider limit으로 완료되지 못했으며, 사용자 지시에 따라 Codex fallback authority review를 수행했다. Authority report blocker/major/minor 0개, `confirmed_allowed: true`.

## Design Status

- [ ] 임시 UI (temporary) -- 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) -- Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) -- Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A -- BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 이 슬라이스는 PLANNER_WEEK 앵커 화면의 식사추가 진입 방식을 modal/sheet로 전환하는 anchor-extension이다. Claude final gate는 provider limit으로 실행되지 못했지만, 사용자 fallback 지시에 따라 Codex authority review를 완료했고 blocker 0개로 확정 가능 판정을 남겼다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md` -- 앱 런타임 토큰 기준
- `docs/design/anchor-screens.md` -- PLANNER_WEEK 앵커 화면 정의
- `docs/design/mobile-ux-rules.md` -- Rule 6: Modal / Sheet / Full page 선택 기준
- `docs/화면정의서-v1.5.4.md` -- §5 PLANNER_WEEK, §6 MEAL_SCREEN, §7 MENU_ADD
- `docs/요구사항기준선-v1.6.7.md` -- §1-4 식단 플래너, §1-5 식사추가
- `docs/유저flow맵-v1.3.4.md` -- Journey 3: 식단 계획 여정
- `docs/api문서-v1.2.5.md` -- §10-1 GET /leftovers, §2-5 POST /meals
- `docs/db설계-v1.3.3.md` -- §9-1 leftover_dishes (source_meal_label JOIN 계산)
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx` -- prototype PlannerAddPopup
- `docs/workpacks/08a-meal-add-search-core/README.md` -- MENU_ADD shell 기준
- `docs/workpacks/16-leftovers/README.md` -- LeftoverPicker 기준
- `docs/workpacks/wave1-port-planner-meal-add/README.md` -- Wave1 MENU_ADD 2열 그리드

## QA / Test Data Plan

- fixture baseline: 기존 fixture 그대로 사용 (데이터 변경 없음)
- real DB smoke 경로: N/A -- FE-only UI polish이며 API/DB/seed 흐름 변경 없음. `POST /meals`의 기존 호출 방식은 동일하고, presentation 방식만 변경.
- seed / reset 명령: 해당 없음 (DB 변경 없음)
- bootstrap이 생성해야 하는 시스템 row: 해당 없음
- blocker 조건: 없음

### 검증 전략

- `pnpm lint` + `pnpm typecheck` -- 정적 분석 통과
- `pnpm verify:frontend` -- 기존 Vitest + Playwright 테스트 전체 통과 (regression 확인)
- PLANNER_WEEK 식사추가 옵션 시트 → picker 모달 전환 흐름 mobile (390px) before/after screenshot 비교
- MEAL_SCREEN "식사 추가" → 옵션 모달 → picker 모달 흐름 mobile (390px) before/after screenshot 비교
- LeftoverPicker 카드 레이아웃 mobile (390px) before/after screenshot 비교
- RecipeSearchPicker 아이콘 mobile (390px) before/after screenshot 비교

## Delivery Checklist

- [x] PLANNER_WEEK 식사추가 옵션 시트 내 picker가 모달/시트로 열리도록 전환 <!-- omo:id=dp4-planner-picker-modal;stage=4;scope=frontend;review=5,6 -->
- [x] MEAL_SCREEN "식사 추가" 버튼이 모달/시트 옵션을 열도록 전환 <!-- omo:id=dp4-meal-screen-modal;stage=4;scope=frontend;review=5,6 -->
- [x] `직접등록` 옵션이 기존 `router.push` 방식 유지 확인 <!-- omo:id=dp4-manual-route-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 유튜브 옵션 처리 (경량 모달 또는 기존 라우트 fallback) <!-- omo:id=dp4-youtube-option;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeSearchPicker 검색 아이콘 교체 및 확대 <!-- omo:id=dp4-search-icon;stage=4;scope=frontend;review=5,6 -->
- [x] LeftoverPicker 선택 버튼 카드 우측 배치 + 크기 축소 <!-- omo:id=dp4-leftover-button-position;stage=4;scope=frontend;review=5,6 -->
- [x] LeftoverPicker 버튼 텍스트 `선택` → `추가` <!-- omo:id=dp4-leftover-button-text;stage=4;scope=frontend;review=5,6 -->
- [x] LeftoverPicker 메타데이터 `"X월 X일 요리"` → `"M/D 끼니명 N인분"` <!-- omo:id=dp4-leftover-metadata;stage=4;scope=frontend;review=5,6 -->
- [x] LeftoverPicker 시트 제목 `"남은요리 선택"` → `"남은 요리에서 추가"` <!-- omo:id=dp4-leftover-title;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 `/menu-add` URL 라우트 직접 접근 fallback 유지 <!-- omo:id=dp4-menu-add-route-fallback;stage=4;scope=frontend;review=5,6 -->
- [x] Modal-origin return behavior (PLANNER_WEEK/MEAL_SCREEN 컨텍스트 복귀) <!-- omo:id=dp4-modal-return-context;stage=4;scope=frontend;review=5,6 -->
- [x] `source_meal_label` / `cooking_servings` null fallback 처리 <!-- omo:id=dp4-leftover-null-fallback;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only` 기존 상태 UI 유지 확인 <!-- omo:id=dp4-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 데스크톱 MENU_ADD 사이드 패널 regression 없음 확인 <!-- omo:id=dp4-desktop-regression;stage=4;scope=frontend;review=5,6 -->
- [x] Authority evidence screenshot 생성 <!-- omo:id=dp4-authority-screenshots;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` + `pnpm typecheck` 통과 <!-- omo:id=dp4-lint-typecheck;stage=4;scope=frontend;review=6 -->
- [x] `pnpm verify:frontend` 통과 (Vitest + Playwright regression) <!-- omo:id=dp4-verify-frontend;stage=4;scope=frontend;review=6 -->

## Contract Evolution Candidates

| 대상 | 현재 값 | Prototype 값 | 판단 |
|------|---------|-------------|------|
| MENU_ADD presentation | full-page (`/menu-add`) | 화면정의서 §7: "바텀시트/풀스크린(디자인 단계에서 결정)" | 화면정의서가 디자인 단계 결정을 허용하고 있으므로 modal/sheet 전환은 계약 내. contract-evolution 불필요 |
| LeftoverPicker card metadata | `"X월 X일 요리"` | 요구사항기준선 §1-7: "마지막 연결 끼니명, 계획 인분" 표시 요구 | 기존 구현이 요구사항 미반영이었음. 이번 슬라이스에서 기준선에 맞춤. contract-evolution 불필요 |

## Stage 5/6 Evidence

- Implementation: PLANNER_WEEK/MEAL_SCREEN 모바일 식사추가 옵션은 `MealAddOptionsSheet`와 `MealAddPickerFlow`로 공유한다. 검색/레시피북/팬트리/남은요리는 현재 화면 위의 sheet/overlay picker로 열리고, `직접등록`과 YouTube는 기존 route fallback을 유지한다.
- LeftoverPicker: 카드 오른쪽 compact `추가` 버튼, `M/D 끼니명 N인분` 메타데이터, null fallback(`끼니 미상`, `인분 미상`)을 적용했다.
- RecipeSearchPicker: 검색 버튼 아이콘을 더 명확한 magnifier glyph로 교체하고 모바일 아이콘 크기를 키웠다.
- Authority report: `ui/designs/authority/DESIGN_POLISH_SLICE4_PLANNER_MEAL_ADD-authority.md`
- Claude final gate: `b475ec3a-c10b-42ae-9c38-1df94982e645` resume 세션에 요청했으나 provider limit으로 종료됨. 사용자 지시에 따라 Codex fallback authority review 완료.
- Screenshot evidence:
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile-narrow.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile.png`
  - `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile-narrow.png`
- Verification:
  - `pnpm vitest run tests/menu-add-screen.test.tsx tests/planner-week-screen.test.tsx tests/planner-meal-screen.test.tsx` passed.
  - `pnpm exec playwright test tests/e2e/tmp-design-polish-slice4-evidence.spec.ts --project=mobile-chrome` passed before temporary spec removal.
  - `pnpm exec playwright test tests/e2e/tmp-design-polish-slice4-narrow-evidence.spec.ts --project=mobile-chrome` passed before temporary spec removal.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `git diff --check` passed.
  - `pnpm verify:frontend` passed.

## Out of Scope

- MANUAL_RECIPE_CREATE (`직접등록`) 모달 전환 -- slice5
- YOUTUBE_IMPORT 전체 UX 리디자인 -- slice5
- PLANNER_WEEK 레이아웃/스크롤 구조 변경
- 요리하기/장보기/남은요리 상단 CTA 변경
- API/DB/auth/state transition 변경
- Web color tokens (`--web-*`) 변경
- Global app token 값 변경 (`--brand-primary` 등)

## Open Questions

- Resolved: YouTube 옵션은 기존 route fallback으로 유지한다. 전체 YouTube import UX는 slice5에서 다룬다.
