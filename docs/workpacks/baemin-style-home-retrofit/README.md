# baemin-style-home-retrofit

> HOME anchor screen visual retrofit to Baemin-style design language.
> Dependencies: `h6-baemin-style-direction` (merged), `baemin-style-tokens-additive` (merged), `baemin-style-token-values` (merged), `baemin-style-shared-components` (merged), `h1-home-first-impression` (merged).
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

HOME 화면의 기존 정보 구조(H1 확정: D1 정렬=섹션헤더, D2 테마=compact carousel strip, D3 재료필터=discovery 단독행, D4 안 C compact hybrid)를 보존하면서, 승인된 배민 스타일 토큰과 공유 UI 프리미티브를 적용해 시각적 리트로핏을 완성한다. 구조 변경 없이 토큰 교체, 컴포넌트 소비, 스타일링 정제만 수행한다.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-home-retrofit` |
| Implementation | `feature/fe-baemin-style-home-retrofit` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend / HOME retrofit implementation | **Claude** | visual retrofit |
| 5 | Design review | **Codex** | authority evidence, a11y, visual regression |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

### HOME Screen Visual Retrofit

다음 HOME 화면 파일들을 배민 스타일 토큰과 공유 프리미티브로 리스타일한다. 기존 정보 구조(H1 D1-D4)를 보존하면서 시각적 일관성을 확보한다.

| Target | File | Retrofit scope |
| --- | --- | --- |
| HomeScreen shell | `components/home/home-screen.tsx` | Discovery panel, sort menu, skeleton, layout — hardcoded colors/shadows/radii to token variables; consume `components/ui/` primitives where applicable |
| RecipeCard | `components/home/recipe-card.tsx` | Card surface, badge, stats pills, tag styling — token swap, consume `Card`/`Badge` from `components/ui/` where appropriate |
| IngredientFilterModal | `components/home/ingredient-filter-modal.tsx` | Modal chrome already uses shared `ModalHeader`/`SelectionChipRail`; retrofit remaining inline styles (hardcoded rgba, border colors, backgrounds) to token variables |
| AppHeader (HOME context) | `components/layout/app-header.tsx` | Glass panel → token-based surface/shadow; brand text → token color; hover state → token transition |
| ThemeCarouselStrip (inline) | `components/home/home-screen.tsx` (ThemeCarouselStrip) | Carousel card surface, thumbnail overlay, right-fade gradient — token swap |
| ThemeCarouselCard (inline) | `components/home/home-screen.tsx` (ThemeCarouselCard) | Card border, shadow, hover, source badge — token variables |
| SortMenu (inline) | `components/home/home-screen.tsx` (SortMenu) | Sheet chrome, backdrop, button styles — token swap; desktop dropdown — token surface/shadow |
| Skeleton components (inline) | `components/home/home-screen.tsx` (ThemeCarouselSkeleton, RecipeListSkeleton) | Consume `Skeleton` from `components/ui/skeleton.tsx` or align with token-based skeleton styling |

### Token Usage Contract

- 모든 리스타일은 `app/globals.css` CSS 변수 사용 — hardcoded hex 금지.
- Brand tokens: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA).
- Gray/surface/shadow/radius: additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`).
- `--cook-*` tokens 변경 금지.
- `--olive` 사용 보존 (재료 필터 chip per H5).
- 신규 CSS 토큰 추가 금지 — 기존 승인 토큰만 사용. 파생 색상은 `color-mix()` 사용.

### Other In-Scope Items

- `components/ui/` 공유 프리미티브(`Card`, `Badge`, `Chip`, `Skeleton`, `Button`, `EmptyState`, `ErrorState`) 소비 — 적합한 곳에서 import하여 사용.
- `glass-panel` CSS class가 토큰 기반이 아닌 경우 토큰 교체.
- ContentState 컴포넌트의 HOME 사용처에서 토큰 일관성 확인.
- API: 없음
- DB: 없음
- 상태 전이: 없음
- Schema Change:
  - [x] 없음

## Out of Scope

- HOME 정보 구조 변경 (H1 D1-D4 잠김 — 섹션 순서, 컴포넌트 배치, 테마/정렬/필터 위치 변경 금지)
- BottomTabs 리스타일 (별도 앱 전체 retrofit slice로 분리)
- AppShell 구조 변경
- 다른 화면(RECIPE_DETAIL, PLANNER_WEEK 등) 리트로핏
- 새로운 기능/인터랙션 추가
- API, DB, 상태 전이, endpoint, auth 변경
- Jua 또는 prototype-only 폰트 import
- 프로토타입 JSX/HTML 직접 복사
- `--cook-*` 토큰 값 변경
- `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 변경
- 신규 CSS 토큰 추가
- `components/ui/` 프리미티브 수정 (소비만 허용)

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | 배민 스타일 공식 채택 방향, rollout 순서, non-goals 잠금 |
| `baemin-style-tokens-additive` | merged | Additive token foundation이 `app/globals.css`에 존재 |
| `baemin-style-token-values` | merged | Brand tokens이 사용자 승인 값(#ED7470, #C84C48, #FDEBEA)으로 설정됨 |
| `baemin-style-shared-components` | merged | 공유 UI 프리미티브(Button, Chip, Card, Badge 등)가 소비 가능 상태 |
| `h1-home-first-impression` | merged | HOME 정보 구조 결정(D1-D4)이 잠김 — 이 구조를 반드시 보존 |
| `h5-modal-system-redesign` | merged | Modal/sheet chrome 결정이 잠김 — SortMenu sheet 스타일링 시 준수 |

## Backend First Contract

백엔드 변경 없음. 기존 계약 보존:

- API response envelope: `{ success, data, error }`
- 기존 endpoint 파라미터/응답 구조 변경 없음
- `--cook-*` 토큰 값 변경 없음
- 이 슬라이스에서 endpoint, field, table, status value 추가 금지

## Frontend Delivery Mode

- HOME 화면 파일(`components/home/*`, `components/layout/app-header.tsx`)을 승인된 배민 스타일 토큰으로 리스타일.
- `components/ui/*` 공유 프리미티브를 적합한 곳에서 소비.
- 필수 상태 보존: `loading / empty / error` — 기존 상태가 사라지면 안 됨.
- 기존 TypeScript props 인터페이스 보존 — visual-only 변경.
- H1 정보 구조(D1-D4) 엄수.
- H5 modal 결정(icon close, olive accent, eyebrow 제거) 엄수 — SortMenu sheet에서.

## Design Authority

- UI risk: `high-risk` (anchor screen visual retrofit)
- Anchor screen dependency: `HOME`
- Visual artifact: HOME before/after screenshots at mobile default (390px), narrow (320px), desktop sanity; key active states (sort sheet open, ingredient filter active, loading, empty, error)
- Authority status: required
- Design wireframe: `ui/designs/HOME.md` — Baemin-Style Visual Retrofit Addendum 섹션
- Design critique: `ui/designs/critiques/HOME-baemin-style-retrofit-critique.md`
- Authority report (Stage 4/5): `ui/designs/authority/BAEMIN_STYLE_HOME_RETROFIT-authority.md`
- Notes: design-generator(HOME.md addendum) 및 design-critic(critique artifact) 완료. Authority report는 Stage 4/5에서 생성. Prototype `HANDOFF.md` HOME 섹션은 REFERENCE ONLY — 프로토타입 token table과 component spec은 직접 복사하지 않고 기존 프로젝트 패턴에 맞춰 적용.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 기본값; HOME 리트로핏 미실행
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비
- [ ] 확정 (confirmed) — Stage 5/6 review 통과, authority blocker 0개
- [ ] N/A

> 이 슬라이스는 high-risk anchor screen 변경이다. Authority review가 필수다.
> Prototype HANDOFF.md HOME 섹션은 REFERENCE ONLY다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/HOME.md` (Baemin-Style Retrofit Addendum 포함)
- `ui/designs/critiques/HOME-baemin-style-retrofit-critique.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md`
- `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (REFERENCE ONLY)
- `docs/workpacks/h1-home-first-impression/README.md` (H1 D1-D4 decisions)
- `docs/workpacks/baemin-style-shared-components/README.md` (shared primitives)

## QA / Test Data Plan

- Fixture baseline: 변경 없음.
- Real DB smoke: 컴포넌트 수준 변경만이므로 불필요.
- Browser smoke: HOME before/after screenshots + key active state screenshots.
- Exploratory QA: anchor screen high-risk UI 변경이므로 기본 필수. Codex가 Stage 5에서 실행.
- Required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm verify:frontend`
- Blocker criteria:
  - Mobile default(390px) 또는 320px에서 horizontal overflow
  - Brand-colored 요소 내 텍스트 클리핑
  - 기존 loading/empty/error 상태가 사라짐
  - 비승인 토큰 값 hardcode
  - `--cook-*` 토큰 값 변경
  - H1 정보 구조(D1-D4) 위반
  - H5 modal 결정 위반
  - `components/ui/` 프리미티브 파일 수정 (소비만 허용)

## Key Rules

- HOME 정보 구조(H1 D1-D4)는 잠겼다. 섹션 순서, 컨트롤 배치, 테마 처리 방식을 변경하지 않는다.
- H5 modal 결정(icon close, olive accent, eyebrow 제거)을 SortMenu sheet에서 엄수한다.
- 모든 리스타일은 CSS 변수 사용 — hardcoded hex, rgba 금지. 파생 색상은 `color-mix()` 사용.
- `--cook-*` 조리방법 색상 토큰 변경 금지.
- Jua 또는 prototype-only 폰트 import 금지.
- 프로토타입 `HANDOFF.md` HOME 스펙은 REFERENCE ONLY — 프로덕션 계약 아님. 기존 프로젝트 패턴에 맞춰 적용.
- `components/ui/` 공유 프리미티브는 소비만 가능 — 이 슬라이스에서 수정 금지.
- 기존 TypeScript props 인터페이스 보존. Visual-only 변경.
- 리스타일로 인한 시각적 변화는 의도적이며 evidence로 캡처되어야 한다.
- `glass-panel` 등 기존 유틸 클래스가 hardcoded 값을 사용하는 경우 토큰으로 교체하되, 다른 화면에서의 사용을 고려해 범위를 제한한다.

## Contract Evolution Candidates

없음. 이 슬라이스는 승인된 방향과 토큰 범위 내의 visual-only 변경이다.

## Primary User Path

1. 사용자가 HOME(`/`)에 진입한다.
2. Discovery panel(검색바, 재료필터 버튼)이 배민 스타일 토큰으로 리스타일되어 보인다.
3. 테마 carousel strip이 토큰 기반 Card 스타일로 표시된다.
4. "모든 레시피" 섹션의 RecipeCard가 배민 스타일 Badge, 토큰 기반 surface/shadow로 표시된다.
5. 정렬 메뉴(SortMenu)를 열면 배민 스타일 sheet/dropdown chrome이 적용된다.
6. 재료 필터 모달을 열면 기존 shared component 리스타일이 반영된다.
7. Loading/empty/error 상태가 모두 보존되어 정상 동작한다.

## Delivery Checklist

> Living closeout 문서. Stage 4에서 구현 항목 체크, Stage 5/6에서 리뷰.

- [ ] HomeScreen discovery panel 리스타일 (glass-panel, search bar, ingredient filter button → token variables) <!-- omo:id=bshr-discovery-panel;stage=4;scope=frontend;review=5,6 -->
- [ ] HomeScreen active filter summary bar 리스타일 (hardcoded rgba → token variables) <!-- omo:id=bshr-filter-summary;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeCard 리스타일 (surface, shadow, badge, stats pills, tags → tokens + `Card`/`Badge` primitives) <!-- omo:id=bshr-recipe-card;stage=4;scope=frontend;review=5,6 -->
- [ ] ThemeCarouselStrip/Card 리스타일 (card surface, thumbnail overlay, right-fade gradient → tokens) <!-- omo:id=bshr-theme-carousel;stage=4;scope=frontend;review=5,6 -->
- [ ] SortMenu 리스타일 (sort button, mobile sheet, desktop dropdown → token variables, H5 modal decisions) <!-- omo:id=bshr-sort-menu;stage=4;scope=frontend;review=5,6 -->
- [ ] Skeleton 컴포넌트 리스타일 (hardcoded bg → `Skeleton` primitive or token-based) <!-- omo:id=bshr-skeleton;stage=4;scope=frontend;review=5,6 -->
- [ ] AppHeader 리스타일 (glass-panel → token surface/shadow, brand text hover → token) <!-- omo:id=bshr-app-header;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilterModal 잔여 inline 스타일 리스타일 <!-- omo:id=bshr-ingredient-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `components/ui/` 프리미티브 소비 적용 (Card, Badge, Chip, Skeleton, EmptyState, ErrorState 등) <!-- omo:id=bshr-ui-primitives-consumed;stage=4;scope=frontend;review=5,6 -->
- [ ] 모든 리스타일이 CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bshr-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 loading/empty/error 상태 보존 확인 <!-- omo:id=bshr-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] H1 정보 구조(D1-D4) 보존 확인 <!-- omo:id=bshr-h1-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 modal 결정 보존 확인 (SortMenu sheet) <!-- omo:id=bshr-h5-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] `--cook-*` 토큰 값 미변경 확인 <!-- omo:id=bshr-cook-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] Jua 또는 prototype-only 폰트 미사용 확인 <!-- omo:id=bshr-no-font;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=bshr-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME before/after screenshots 캡처 (mobile default, narrow 320px) <!-- omo:id=bshr-regression-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Key active state screenshots (sort sheet, ingredient filter active, loading, empty, error) <!-- omo:id=bshr-active-state-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bshr-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Hardcoded hex/rgba 색상이 리스타일된 컴포넌트에 남아 있음
- 선언된 범위 밖의 컴포넌트, 페이지, 레이아웃 파일이 수정됨
- Jua 또는 prototype-only 폰트 import
- `--cook-*` 토큰 값 변경
- H1 정보 구조(D1-D4) 위반
- H5 modal 결정 위반
- Mobile default(390px) 또는 320px에서 horizontal overflow
- Brand-colored 요소 내 텍스트 클리핑
- 기존 loading/empty/error 상태 사라짐
- `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
- 미해결 authority blocker (Stage 5)
- Exploratory QA 미실행 및 유효한 skip rationale 미기록
