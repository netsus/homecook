# Slice: design-polish-slice2-app-shell-home

## Goal
앱 셸(하단 탭, 헤더)과 HOME 화면의 시각적 불일치·동작 결함을 수정하여 사용자가 일관된 내비게이션과 깔끔한 필터 경험을 얻게 한다. 하단 탭 지속성을 확보하고, 재료 필터 모달을 팬트리 추가 모달과 동일 패밀리로 정합시키며, 레거시 색상·레이아웃 미비 사항을 정리한다. 웹 토큰은 변경하지 않는다.

## Branches

- 백엔드: N/A (FE-only visual/behavior polish)
- 프론트엔드: `feature/fe-design-polish-slice2-app-shell-home`

## In Scope
- 화면: GLOBAL::APP_SHELL (하단 탭, 헤더), HOME (재료 필터 모달, 카테고리 필터 버튼)
- API: 없음
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

### 세부 범위

#### GLOBAL::APP_SHELL

1. **플래너 탭 활성 아이콘 검증/수정**
   - `Wave1MobileBottomTab`에서 CalendarIcon 활성 상태가 다른 탭 아이콘(HomeIcon, PantryIcon, UserIcon)과 동일한 `text-[#111111]` 시각 밀도를 갖는지 검증한다.
   - CalendarIcon은 stroke-only 기본 형태에 `active` 시 `fill="currentColor"` + 내부 rect를 그리지만, `currentColor`는 `text-[#111111]`을 상속하므로 코드상 동일 색상이다. 실제 렌더링에서 밀도 차이가 있으면 SVG fill/stroke 조정으로 시각 밀도를 맞춘다.
   - 파일: `components/layout/wave1-mobile-bottom-tab.tsx`

2. **하단 탭 지속성 확보 — 팬트리 화면 확인**
   - 현재 4개 메인 탭 화면 모두 `bottomTabsMode="hidden"` + 개별 `<Wave1MobileBottomTab>` 렌더링 패턴을 사용한다.
   - HOME: `components/home/home-screen.tsx:526`
   - Planner: `components/planner/planner-week-screen.tsx:1567`
   - Pantry: `components/pantry/pantry-mobile-screen.tsx:241`
   - MyPage: `components/mypage/mypage-mobile-screen.tsx:154`
   - 탭 전환 시 하단 탭이 사라졌다 다시 나타나는 현상(flash)이 있으면, 마운트/언마운트 타이밍 또는 조건부 렌더링 분기를 수정한다.

3. **하단 탭 배경 불투명도 확인**
   - `Wave1MobileBottomTab` 컨테이너는 `bg-[var(--wave1-surface)]`를 사용하며, `--wave1-surface: #FFFFFF`로 이미 완전 불투명이다.
   - 컨테이너가 이미 `border` + `shadow`를 가지고 있어 시각적으로 반투명하게 보이는 문제가 없는지 확인하고, 필요 시 `backdrop-blur` 등 보강은 하지 않는다 (이미 불투명).

4. **헤더 타이틀 정렬 및 언어 통일**
   - `AppHeader`의 브랜드 텍스트("homecook_")가 `justify-center`로 중앙 정렬되어 있다. 이것이 의도된 것인지, 좌측 정렬이 필요한지 Stage 4에서 확인한다.
   - 데스크톱 네비게이션 라벨(홈, 플래너, 팬트리, 마이)은 이미 한국어다. 모바일에서는 하단 탭이 동일 라벨을 사용한다.
   - 헤더에 모바일 페이지 타이틀이 별도로 표시되지 않으므로(브랜드 로고만 있음), 추가 텍스트 통일 작업은 불필요할 수 있다. Stage 4에서 확인 후 결정한다.
   - 파일: `components/layout/app-header.tsx`

#### HOME

5. **재료 필터 모달 → 팬트리 추가 모달 패밀리 정합**
   - `components/home/ingredient-filter-modal.tsx`의 모바일 뷰(`AppBottomSheet`)를 `components/pantry/pantry-add-sheet.tsx`와 시각적으로 정합시킨다.
   - 재료 항목 그리드: 현재 `grid gap-3 sm:grid-cols-2` → 팬트리처럼 `grid grid-cols-2 gap-2`로 변경하여 모바일에서도 2열 배치.
   - 칩/라벨 스타일, border-radius, padding, 선택 상태 색상의 일관성을 확보한다.
   - 파일: `components/home/ingredient-filter-modal.tsx`

6. **재료로 검색 버튼 색상**
   - HOME 카테고리 필터 바의 `재료로 검색` 버튼이 `var(--brand)` (현재 `#0F766E`)를 사용한다. 사용자가 `#007A76` → `#2AC1BC` 또는 기존 mint 역할 토큰 전환을 요청했다.
   - `var(--brand)`는 이미 역할 토큰이므로, 개별 버튼의 하드코딩 색상을 바꾸는 것이 아니라 역할 토큰을 계속 사용하되, 시각적 구분이 필요하면 `var(--wave1-mint-contrast)` 또는 `var(--brand-primary)` 등 기존 토큰으로 대체한다.
   - 파일: `components/home/home-screen.tsx` (DiscoveryFilterBar 내부)

7. **재료 선택 상태의 `var(--olive)` 잔재 제거**
   - Slice 1에서 컴포넌트 `var(--olive)` 직접 참조를 모두 제거했으며, 현재 codebase에 `var(--olive)` 참조가 0건이다.
   - Stage 4에서 재확인하고, 만약 잔재가 발견되면 역할 토큰으로 교체한다.

8. **재료 버튼 너비 — 모바일 2열 배치**
   - 재료 필터 모달의 재료 항목이 현재 `grid gap-3 sm:grid-cols-2`로, 모바일(< 640px)에서 1열이다.
   - 팬트리 추가 시트(`pantry-add-sheet.tsx:219`)는 `grid grid-cols-2 gap-2`로 항상 2열이다.
   - 재료 필터 모달도 동일하게 `grid grid-cols-2 gap-2`로 변경하여 모바일에서 2열 배치를 적용한다.
   - 파일: `components/home/ingredient-filter-modal.tsx`

## Out of Scope
- RECIPE_DETAIL 화면 수정
- PLANNER_WEEK 화면 수정
- Cooking mode / meal screen 수정
- 팬트리 내부 화면 레이아웃 변경 (팬트리 하단 탭 렌더링 확인만)
- Mypage/settings/account 내부 화면 수정
- API, DB, auth, 상태 전이 계약 변경
- 웹 색상 리디자인 (`--web-*` 토큰, 1024px 미디어 블록)
- 새로운 CSS 토큰 도입 (기존 역할 토큰만 사용)
- AppShell의 `bottomTabsMode` prop 구조 변경 (현재 개별 렌더링 패턴 유지)
- 하단 탭 아이콘 전면 리디자인

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `design-polish-slice1-typography-tokens` | merged | [x] |

> Slice 1(font-weight 경량화, olive 제거)이 merged 상태. 이 슬라이스는 Slice 1의 토큰 정리 결과 위에서 앱 셸/HOME 시각 정합을 수행한다.

## Backend First Contract

N/A — 이 슬라이스에 백엔드 변경 없음. FE-only visual/behavior polish.

## Frontend Delivery Mode
- 기능 변경 없음: 기존 화면의 시각적 스타일·레이아웃·동작 정합만 수행
- 필수 상태: 기존 `loading / empty / error / read-only / unauthorized` 유지 (신규 추가 없음)
- 로그인 보호 액션: 해당 없음

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: `HOME` (visual verification 대상, 구조 변경 아님)
- Visual artifact: Stage 4에서 HOME 모바일 before/after screenshot + 하단 탭 4화면 screenshot 제공 예정
- Authority status: `not-required`
- Notes: 이 슬라이스는 하단 탭 지속성 확인, 재료 모달 그리드 레이아웃 변경, 버튼 색상 토큰 교체만 수행한다. HOME은 앵커 화면이지만, 정보 구조(H1 carousel, section layout, CTA hierarchy)를 변경하지 않고, 신규 상호작용 모델을 추가하지 않으므로 anchor-extension이 아니라 low-risk visual polish다. 재료 모달의 1열→2열 변경은 팬트리 추가 시트의 기존 패턴을 따르는 것이며, 신규 UI 패턴이 아니다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 이 슬라이스는 기존 confirmed 앵커 화면(HOME)과 앱 셸의 low-risk visual/behavior polish를 수행한다.
> `temporary`에서 시작하고, Stage 4 완료 후 `pending-review`로 전환한다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md` — 확정 토큰 기준
- `docs/design/anchor-screens.md` — HOME 앵커 화면 정의
- `docs/design/mobile-ux-rules.md` — 모바일 UX 규칙
- `app/globals.css` — 앱 런타임 토큰 단일 소스

## QA / Test Data Plan
- fixture baseline: 기존 fixture 그대로 사용 (데이터 변경 없음)
- real DB smoke 경로: `pnpm dev:demo` — 스타일 변경 후 시각적 regression 확인
- seed / reset 명령: 해당 없음 (DB 변경 없음)
- bootstrap이 생성해야 하는 시스템 row: 해당 없음
- blocker 조건: 없음

### 검증 전략
- `pnpm lint` + `pnpm typecheck` — 정적 분석 통과
- `pnpm verify:frontend` — 기존 Vitest + Playwright 테스트 전체 통과 (regression 확인)
- HOME 모바일(390px, 320px) 재료 필터 모달 before/after screenshot 비교
- 하단 탭 4화면(HOME, Planner, Pantry, MyPage) 탭 전환 시 지속성 확인

## Key Rules
- **앱 표면만 변경**: 웹 `--web-*` 토큰과 1024px 미디어 블록 내 스타일은 건드리지 않는다.
- **기존 역할 토큰 사용**: 새 토큰을 도입하지 않고 `var(--brand)`, `var(--brand-primary)`, `var(--wave1-mint-contrast)` 등 기존 역할 토큰만 사용한다.
- **팬트리 추가 시트 정합**: 재료 필터 모달의 재료 항목 그리드, 칩 스타일, 선택 색상은 `pantry-add-sheet.tsx`의 패턴을 기준으로 정합한다.
- **하단 탭 패턴 유지**: 현재 4개 메인 화면이 개별 `<Wave1MobileBottomTab>`을 렌더링하는 구조를 유지한다. AppShell의 `bottomTabsMode` prop 구조는 변경하지 않는다.
- **regression 금지**: 기존 Vitest / Playwright 테스트가 전부 통과해야 한다.

## Contract Evolution Candidates (Optional)

없음. 공식 문서 변경 불필요.

## Primary User Path
1. 사용자가 HOME 화면을 연다. 하단 탭이 안정적으로 표시된다.
2. 하단 탭으로 팬트리/플래너/마이페이지를 오가도 탭이 깜빡임 없이 유지된다.
3. HOME에서 `재료로 검색` 버튼을 탭하면 재료 필터 모달이 열린다.
4. 재료 항목이 모바일에서도 2열로 배치되어 한눈에 보기 쉽다.
5. 재료를 선택하면 선택 상태 색상이 앱 브랜드 토큰과 일관된다.

## Delivery Checklist
> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> 백엔드 항목은 N/A (FE-only 슬라이스).

- [x] 플래너 탭 활성 아이콘 시각 밀도 검증/수정 <!-- omo:id=dp2-planner-icon-density;stage=4;scope=frontend;review=5,6 -->
- [x] 하단 탭 지속성 확인 (4화면 탭 전환 시 flash 없음) <!-- omo:id=dp2-bottom-tab-persistence;stage=4;scope=frontend;review=5,6 -->
- [x] 하단 탭 배경 불투명도 확인 <!-- omo:id=dp2-bottom-tab-opacity;stage=4;scope=frontend;review=5,6 -->
- [x] 헤더 타이틀 정렬/언어 확인 <!-- omo:id=dp2-header-alignment;stage=4;scope=frontend;review=5,6 -->
- [x] 재료 필터 모달 → 팬트리 추가 시트 패밀리 정합 <!-- omo:id=dp2-ingredient-modal-family;stage=4;scope=frontend;review=5,6 -->
- [x] 재료로 검색 버튼 색상 토큰 정리 <!-- omo:id=dp2-ingredient-button-color;stage=4;scope=frontend;review=5,6 -->
- [x] 재료 선택 상태 `var(--olive)` 잔재 재확인 <!-- omo:id=dp2-olive-residue-check;stage=4;scope=frontend;review=5,6 -->
- [x] 재료 버튼 너비 — 모바일 2열 배치 <!-- omo:id=dp2-ingredient-grid-2col;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` + `pnpm typecheck` 통과 <!-- omo:id=dp2-lint-typecheck;stage=4;scope=frontend;review=6 -->
- [x] `pnpm verify:frontend` 통과 (Vitest + Playwright regression) <!-- omo:id=dp2-verify-frontend;stage=4;scope=frontend;review=6 -->
- [x] `loading / empty / error / read-only` 기존 상태 UI 유지 확인 <!-- omo:id=dp2-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 모바일 before/after screenshot + 하단 탭 4화면 screenshot <!-- omo:id=dp2-screenshots;stage=4;scope=frontend;review=5,6 -->
