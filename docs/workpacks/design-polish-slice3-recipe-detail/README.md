# Slice: design-polish-slice3-recipe-detail

## Goal
RECIPE_DETAIL 화면의 세 가지 시각적 문제를 수정한다: (1) 플래너 추가 모달의 인분 조절 `−`/`+` 버튼이 과도하게 커진 문제를 줄이고 `−`와 `+`의 시각적 균형을 맞춘다, (2) 좋아요/저장/요리완료 메트릭 숫자의 font-weight가 과하므로 경량화한다, (3) 인분 아이콘, 좋아요/저장/요리완료 컨트롤, 인분 `+`/`−` 버튼의 색상을 wave1 prototype reference에 맞춘다.

## Branches

- 백엔드: N/A (FE-only visual polish)
- 프론트엔드: `feature/fe-design-polish-slice3-recipe-detail`

## In Scope
- 화면: `RECIPE_DETAIL` (앵커 화면)
- API: 없음
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

### 세부 범위

1. **플래너 추가 모달 인분 `−`/`+` 버튼 크기 축소 및 균형**
   - `components/recipe/planner-add-sheet.tsx`: `AppStepper` 내부의 `NumericStepperCompact` 버튼 크기가 prototype 기준(28×28px)보다 과다. visible circle 크기를 prototype 수준으로 조정한다.
   - `components/recipe/recipe-detail-screen.tsx`: 재료 탭 inline 인분 stepper의 `−`/`+` 버튼이 `h-[var(--control-height-md)] w-11` (44×44px)로 prototype(32×32px)보다 크다. visible 영역을 축소한다.
   - `−` 글리프가 `+`보다 시각적으로 작아 보이는 문제: `−` 버튼의 font-size나 font-weight를 미세 조정하거나, Unicode minus sign (U+2212 `−`)을 확인하여 시각적 균형을 맞춘다.
   - 공유 컴포넌트 `components/shared/numeric-stepper-compact.tsx`의 visible circle도 동일하게 조정한다.
   - 터치 타겟(44×44px)은 outer wrapper로 유지하되, visible circle을 축소하여 프로토타입 비례에 맞춘다.

2. **좋아요/저장/요리완료 메트릭 숫자 font-weight 경량화**
   - `Wave1HeroMetricButton` (모바일 히어로 오버레이): count 텍스트의 `font-extrabold` (800) → `font-bold` (700)로 경량화.
   - `Wave1HeroMetricStatus` (요리완료 status): 동일하게 `font-extrabold` → `font-bold`.
   - 데스크톱 `MetricActionButton`의 count badge (`font-bold` text-[10px])는 이미 적정 수준이므로 변경하지 않는다.

3. **인분 아이콘 / 좋아요·저장·요리완료 컨트롤 / 인분 `+`/`−` 버튼 색상 prototype 정합**
   - Prototype reference: `ui/designs/prototypes/claude-design-260505-wave1`
   - Prototype tokens: `T.mint = #2AC1BC` (brand), `T.ink = #212529` (text/stepper), `T.metricLike = #FF6B6B`, `T.metricSave = #2AC1BC`, `T.metricCook = #12B886`.
   - **인분 `+` 버튼**: prototype(`detail.jsx`)은 `+` 버튼 bg를 `T.mint` (#2AC1BC)로 사용. 현재 코드는 `var(--brand)` (#0F766E). 앱 런타임 토큰 `--brand-primary`가 #0F766E이므로, prototype과 다르다. 이 차이가 의도적 앱 팔레트 결정인지 확인 필요. 앱 토큰을 변경하면 전역 영향이므로, RECIPE_DETAIL stepper에만 scoped override를 적용하거나, prototype 색상을 앱 토큰으로 수용하는 판단이 필요하다.
   - **인분 `−` 버튼**: prototype은 `border: 1px solid T.border (#DEE2E6)`, bg white. 현재 코드는 `border-[var(--line)]` + `bg-[var(--panel)]`로 유사하나 정확 정합 확인.
   - **모바일 히어로 메트릭**: prototype의 `RecipeHeroStats`는 모든 아이콘/텍스트를 `#fff`로 표시하고 drop-shadow를 적용. 현재 코드도 동일 패턴(`text-white drop-shadow`). 색상 정합이 이미 되어 있는지 Stage 4에서 확인.
   - **데스크톱 메트릭 톤**: 현재 `getRecipeActionToneClass`가 `var(--brand)` / `var(--brand-deep)` 기반. prototype과의 색상 차이를 Stage 4에서 확인하고, 기존 앱 토큰 내에서 조정.
   - **ServingsIcon**: `currentColor` 상속이므로 부모의 색상 토큰이 올바른지 확인.

## Out of Scope
- HOME 화면 변경
- PLANNER_WEEK 화면 변경
- 앱 셸 하단 탭/헤더 변경
- 앱 전역 font-weight 재조정 (slice1에서 완료)
- 글로벌 `--brand-primary` 토큰 값 변경 (전역 영향 → 별도 contract-evolution 필요 시 에스컬레이션)
- Cooking mode 레이아웃/서빙 로직 변경
- API, DB, auth, 상태 전이 계약 변경
- 웹 색상 리디자인 (`--web-*` 토큰, 1024px 미디어 블록)
- 프로토타입 font-family 변경 (현재 sans-serif 스택 유지)
- Jua 브랜드 폰트 복원

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `design-polish-slice1-typography-tokens` | merged | [x] |
| `design-polish-slice2-app-shell-home` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태. 이 슬라이스는 slice1의 토큰 정비와 slice2의 앱 셸 정합을 기반으로, RECIPE_DETAIL 화면의 세부 시각 문제를 수정한다.

## Backend First Contract

N/A — 이 슬라이스에 백엔드 변경 없음. FE-only visual polish.

## Frontend Delivery Mode
- 기능 변경 없음: 기존 화면의 시각적 크기/weight/색상 교체만 수행
- 필수 상태: 기존 `loading / empty / error / read-only / unauthorized` 유지 (신규 추가 없음)
- 로그인 보호 액션: 해당 없음

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: `RECIPE_DETAIL`
- Visual artifact: Stage 4에서 인분 stepper, 메트릭 영역 before/after screenshot 제공 예정
- Authority status: `not-required`
- Notes: 이 슬라이스는 RECIPE_DETAIL 앵커 화면의 (1) 버튼 크기 축소, (2) font-weight 경량화, (3) 색상 토큰 정합만 수행한다. 핵심 CTA(플래너 추가, 요리하기)의 추가/변경이 아니고, 스크롤 구조, 정보 위계, 모달/시트 전환, 새 진입 흐름을 변경하지 않으므로 anchor-extension이 아니라 low-risk visual polish다. design-generator / design-critic은 신규 화면이나 high-risk UI change가 아니므로 생략한다. Stage 4 완료 시 인분 stepper 영역과 히어로 메트릭 영역의 mobile (390px) before/after screenshot으로 regression 검증만 수행한다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 이 슬라이스는 기존 confirmed 앵커 화면의 low-risk visual polish만 수행하며, 신규 화면이나 구조 변경은 없다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md` — 앱 런타임 토큰 기준
- `docs/design/anchor-screens.md` — RECIPE_DETAIL 앵커 화면 정의
- `ui/designs/prototypes/claude-design-260505-wave1/screens/detail.jsx` — prototype RECIPE_DETAIL
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx` — prototype PlannerAddPopup
- `ui/designs/prototypes/claude-design-260505-wave1/tokens.jsx` — prototype 토큰
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx` — prototype RecipeHeroStats

## QA / Test Data Plan
- fixture baseline: 기존 fixture 그대로 사용 (데이터 변경 없음)
- real DB smoke 경로: `pnpm dev:demo` — 시각적 변경 확인
- seed / reset 명령: 해당 없음 (DB 변경 없음)
- bootstrap이 생성해야 하는 시스템 row: 해당 없음
- blocker 조건: 없음

### 검증 전략
- `pnpm lint` + `pnpm typecheck` — 정적 분석 통과
- `pnpm verify:frontend` — 기존 Vitest + Playwright 테스트 전체 통과 (regression 확인)
- RECIPE_DETAIL 인분 stepper 영역 + 히어로 메트릭 영역 mobile (390px) before/after screenshot 비교
- planner-add 모달 인분 stepper 영역 mobile (390px) before/after screenshot 비교
- font-weight 변경 전후 시각적 확인 (manual QA)

## Key Rules
- **RECIPE_DETAIL 전용**: 다른 화면의 stepper/metric을 변경하지 않는다 (단, 공유 컴포넌트 `NumericStepperCompact` 변경 시 다른 소비처에 regression이 없는지 확인).
- **앱 토큰 변경 금지**: 글로벌 `--brand-primary` 등 앱 전역 토큰 값을 변경하지 않는다. prototype 색상 차이가 있으면 scoped override 또는 기존 토큰 내에서 해결한다.
- **웹 토큰 변경 금지**: `--web-*` 토큰과 1024px 미디어 블록 내 스타일은 건드리지 않는다.
- **Jua 미복원**: 브랜드 폰트 Jua는 의도적으로 제거된 상태이며 복원하지 않는다.
- **터치 타겟 유지**: visible circle을 줄이되, outer touch target은 최소 44×44px를 유지한다.
- **regression 금지**: 기존 Vitest / Playwright 테스트가 전부 통과해야 한다.

## Contract Evolution Candidates (Optional)

| 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
|-----------|-----------|------------------|-----------|-----------|
| `--brand-primary` = `#0F766E` (dark teal) | prototype `T.mint` = `#2AC1BC` (bright mint) 전역 적용 | 프로토타입과 전역 색상 일치 | `docs/design/design-tokens.md`, `app/globals.css` | 미승인 — Stage 4에서 scoped 해결 우선, 전역 변경 필요 시 별도 contract-evolution 에스컬레이션 |

## Primary User Path
1. 사용자가 RECIPE_DETAIL 화면을 연다.
2. 히어로 이미지 위의 좋아요/저장/요리완료 메트릭 숫자가 이전보다 적절한 굵기로 표시된다.
3. 재료 탭에서 인분 `−`/`+` 버튼이 적절한 크기이고, `−`와 `+`가 시각적으로 균형 잡혀 있다.
4. 플래너에 추가 바텀시트에서도 인분 stepper 버튼이 동일하게 적절한 크기다.
5. 인분 아이콘, 메트릭 컨트롤, stepper 버튼의 색상이 wave1 prototype과 정합되어 있다.

## Delivery Checklist
> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> 백엔드 항목은 N/A (FE-only 슬라이스).

- [ ] RECIPE_DETAIL 재료 탭 인분 stepper `−`/`+` visible circle 크기 축소 <!-- omo:id=dp3-inline-stepper-size;stage=4;scope=frontend;review=5,6 -->
- [ ] planner-add 모달 인분 stepper `−`/`+` visible circle 크기 축소 <!-- omo:id=dp3-modal-stepper-size;stage=4;scope=frontend;review=5,6 -->
- [ ] `−` 글리프와 `+` 글리프의 시각적 균형 조정 <!-- omo:id=dp3-glyph-balance;stage=4;scope=frontend;review=5,6 -->
- [ ] Wave1HeroMetricButton count font-weight 경량화 (`font-extrabold` → `font-bold`) <!-- omo:id=dp3-hero-metric-weight;stage=4;scope=frontend;review=5,6 -->
- [ ] Wave1HeroMetricStatus count font-weight 경량화 (`font-extrabold` → `font-bold`) <!-- omo:id=dp3-status-metric-weight;stage=4;scope=frontend;review=5,6 -->
- [ ] 인분 `+` 버튼 색상 prototype 정합 확인/조정 <!-- omo:id=dp3-stepper-plus-color;stage=4;scope=frontend;review=5,6 -->
- [ ] 인분 `−` 버튼 색상 prototype 정합 확인/조정 <!-- omo:id=dp3-stepper-minus-color;stage=4;scope=frontend;review=5,6 -->
- [ ] 모바일 히어로 메트릭 색상 prototype 정합 확인 <!-- omo:id=dp3-hero-metric-color;stage=4;scope=frontend;review=5,6 -->
- [ ] 데스크톱 메트릭 톤 색상 prototype 정합 확인/조정 <!-- omo:id=dp3-desktop-metric-color;stage=4;scope=frontend;review=5,6 -->
- [ ] ServingsIcon 색상 상속 확인 <!-- omo:id=dp3-servings-icon-color;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL before/after screenshot 생성 <!-- omo:id=dp3-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm lint` + `pnpm typecheck` 통과 <!-- omo:id=dp3-lint-typecheck;stage=4;scope=frontend;review=6 -->
- [ ] `pnpm verify:frontend` 통과 (Vitest + Playwright regression) <!-- omo:id=dp3-verify-frontend;stage=4;scope=frontend;review=6 -->
- [ ] `loading / empty / error / read-only` 기존 상태 UI 유지 확인 <!-- omo:id=dp3-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->

## Stage 5/6 Evidence

(Stage 4 완료 후 갱신)
