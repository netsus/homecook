# baemin-style-recipe-detail-retrofit

> RECIPE_DETAIL anchor screen visual retrofit to Baemin-style design language.
> Dependencies: `h6-baemin-style-direction` (merged), `baemin-style-tokens-additive` (merged), `baemin-style-token-values` (merged), `baemin-style-shared-components` (merged), `baemin-style-home-retrofit` (merged), `h5-modal-system-redesign` (merged).
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

RECIPE_DETAIL 화면의 기존 정보 구조(overview, 재료, 조리 단계, utility metrics, primary CTA, 모달 chrome)를 보존하면서, 승인된 배민 스타일 토큰과 공유 UI 프리미티브를 적용해 시각적 리트로핏을 완성한다. 구조 변경 없이 토큰 교체, 컴포넌트 소비, 스타일링 정제만 수행한다. PlannerAddSheet, SaveModal의 H5 modal chrome 결정(icon close, olive accent, eyebrow 제거)을 보존한다.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-recipe-detail-retrofit` |
| Implementation | `feature/fe-baemin-style-recipe-detail-retrofit` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend / RECIPE_DETAIL retrofit implementation | **Claude** | visual retrofit |
| 5 | Design review | **Codex** | authority evidence, a11y, visual regression |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

### RECIPE_DETAIL Screen Visual Retrofit

다음 RECIPE_DETAIL 화면 파일들을 배민 스타일 토큰과 공유 프리미티브로 리스타일한다. 기존 정보 구조(overview compact layout, utility metrics row, primary CTA row, 재료/스텝 카드 구조)를 보존하면서 시각적 일관성을 확보한다.

| Target | File | Retrofit scope |
| --- | --- | --- |
| RecipeDetailScreen shell | `components/recipe/recipe-detail-screen.tsx` | Hero gradient, overview card, utility metrics, action buttons, ingredient list, step cards, serving stepper, feedback toasts, loading skeleton — `glass-panel` 제거, hardcoded rgba/hex/rounded to token variables; COOKING_METHOD_TINTS를 `color-mix()`로 재파생 |
| PlannerAddSheet | `components/recipe/planner-add-sheet.tsx` | Modal backdrop/panel chrome — `glass-panel` 제거, `bg-black/50` → token backdrop, `text-white` → `--surface`, hardcoded radii to token variables; H5 modal decisions 보존 |
| SaveModal | `components/recipe/save-modal.tsx` | Modal backdrop/panel chrome — `glass-panel` 제거, `bg-black/50` → token backdrop, hardcoded rgba/hex for olive/brand tints → `color-mix()`; `bg-white/*` → token surface; H5 modal decisions 보존 |
| LoginGateModal (conditional) | `components/auth/login-gate-modal.tsx` | `glass-panel` 제거, `bg-black/42` → token backdrop, eyebrow badge hardcoded rgba → `color-mix()`, `bg-white/78` → token surface. 주의: `components/auth/` 경로이나 RECIPE_DETAIL에서만 소비됨. 다른 소비처 발생 시 별도 slice 분리 검토 |

### COOKING_METHOD_TINTS Token Derivation

`COOKING_METHOD_TINTS` 맵의 rgba 값을 `--cook-*` CSS 변수에서 `color-mix()`로 파생한다. `--cook-*` 토큰 값 자체는 변경하지 않는다.

| 현재 | 변환 |
| --- | --- |
| `rgba(255, 140, 66, 0.16)` | `color-mix(in srgb, var(--cook-stir) 16%, transparent)` |
| `rgba(232, 69, 60, 0.14)` | `color-mix(in srgb, var(--cook-boil) 14%, transparent)` |
| `rgba(139, 94, 60, 0.16)` | `color-mix(in srgb, var(--cook-grill) 16%, transparent)` |
| `rgba(74, 144, 217, 0.16)` | `color-mix(in srgb, var(--cook-steam) 16%, transparent)` |
| `rgba(245, 197, 24, 0.18)` | `color-mix(in srgb, var(--cook-fry) 18%, transparent)` |
| `rgba(46, 166, 122, 0.16)` | `color-mix(in srgb, var(--cook-mix) 16%, transparent)` |

기본 fallback(`rgba(170, 170, 170, 0.16)`)도 `color-mix(in srgb, var(--cook-etc) 16%, transparent)`로 통일한다.

### Token Usage Contract

- 모든 리스타일은 `app/globals.css` CSS 변수 사용 — hardcoded hex 금지.
- Brand tokens: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA).
- Gray/surface/shadow/radius: additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`).
- `--cook-*` 토큰 값 변경 금지 — 파생 tint는 `color-mix()` 사용.
- `--olive` 사용 보존 (PlannerAddSheet/SaveModal per H5).
- 신규 CSS 토큰 추가 금지 — 기존 승인 토큰만 사용. 파생 색상은 `color-mix()` 사용.

### Hardcoded Value Migration Summary

| Pattern | Count (approx.) | Replacement strategy |
| --- | --- | --- |
| `glass-panel` | ~8 | token-based `bg-[var(--panel)]` + `border-[var(--line)]` + `shadow-[var(--shadow-2)]` |
| `bg-white/*` (opacity variants) | ~30 | `bg-[var(--surface)]` / `bg-[var(--surface-fill)]` / `color-mix()` 파생 |
| `bg-white` (opaque) | ~6 | `bg-[var(--surface)]` |
| `bg-black/50`, `bg-black/42` | ~3 | `bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)]` |
| `text-white` | ~8 | `text-[var(--surface)]` |
| `rounded-[Npx]` (hardcoded) | ~40 | `--radius-sm/md/lg/xl/full` token mapping |
| Hardcoded `rgba(...)` | ~25 | `color-mix(in srgb, var(--token) N%, transparent)` |
| Hardcoded `#hex` | ~4 | `color-mix()` 파생 또는 token 직접 참조 |
| `shadow-[var(--shadow)]` | ~5 | `shadow-[var(--shadow-1)]` 또는 `shadow-[var(--shadow-2)]` 명확화 |

### Other In-Scope Items

- `components/ui/` 공유 프리미티브(`Badge`, `Skeleton`) 소비 — 적합한 곳에서 import하여 사용.
- `glass-panel` CSS class를 토큰 기반 인라인으로 교체.
- ContentState 컴포넌트의 RECIPE_DETAIL 사용처에서 토큰 일관성 확인.
- API: 없음
- DB: 없음
- 상태 전이: 없음
- Schema Change:
  - [x] 없음

## Out of Scope

- RECIPE_DETAIL 정보 구조 변경 (overview layout, utility metrics 배치, primary CTA row 구조, 재료/스텝 카드 순서 변경 금지)
- Prototype HANDOFF.md의 hero + transparent AppBar fade (프로토타입 전용 — 현재 RECIPE_DETAIL.md에 없음)
- Prototype HANDOFF.md의 tabs/reviews 구조 (프로토타입 전용 — 현재 구현 없음)
- BottomTabs 리스타일 (별도 앱 전체 retrofit slice로 분리)
- AppShell / AppHeader 구조 변경 (home-retrofit에서 완료)
- 다른 화면(HOME, PLANNER_WEEK 등) 리트로핏
- 새로운 기능/인터랙션 추가
- API, DB, 상태 전이, endpoint, auth 변경
- Jua 또는 prototype-only 폰트 import
- 프로토타입 JSX/HTML 직접 복사
- `--cook-*` 토큰 값 변경 (파생 tint만 `color-mix()` 전환)
- `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 변경
- 신규 CSS 토큰 추가
- `components/ui/` 프리미티브 수정 (소비만 허용)
- COOK_MODE 화면 (후속 slice 14/15)
- `SocialLoginButtons` 리스타일 (LoginGateModal 내부 소비 컴포넌트이나 `components/auth/` 공유 범위 — LoginGateModal 외의 수정은 별도 판단)

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | 배민 스타일 공식 채택 방향, rollout 순서, non-goals 잠금 |
| `baemin-style-tokens-additive` | merged | Additive token foundation이 `app/globals.css`에 존재 |
| `baemin-style-token-values` | merged | Brand tokens이 사용자 승인 값(#ED7470, #C84C48, #FDEBEA)으로 설정됨 |
| `baemin-style-shared-components` | merged | 공유 UI 프리미티브(Badge, Skeleton 등)가 소비 가능 상태 |
| `h5-modal-system-redesign` | merged | Modal/sheet chrome 결정이 잠김 — PlannerAddSheet/SaveModal 스타일링 시 준수 |
| `baemin-style-home-retrofit` | merged | HOME 리트로핏 패턴이 확정 — 동일 토큰 교체 패턴을 RECIPE_DETAIL에 적용 |

## Backend First Contract

백엔드 변경 없음. 기존 계약 보존:

- API response envelope: `{ success, data, error }`
- 기존 endpoint 파라미터/응답 구조 변경 없음
- `--cook-*` 토큰 값 변경 없음
- 이 슬라이스에서 endpoint, field, table, status value 추가 금지

## Frontend Delivery Mode

- RECIPE_DETAIL 화면 파일(`components/recipe/*`, 조건부 `components/auth/login-gate-modal.tsx`)을 승인된 배민 스타일 토큰으로 리스타일.
- `components/ui/*` 공유 프리미티브를 적합한 곳에서 소비.
- 필수 상태 보존: `loading / ready / error` — 기존 상태가 사라지면 안 됨.
- 기존 TypeScript props 인터페이스 보존 — visual-only 변경.
- RECIPE_DETAIL 정보 구조 엄수 (overview, utility metrics, primary CTA, 재료, 스텝 순서).
- H5 modal 결정(icon close, olive accent, eyebrow 제거) 엄수 — PlannerAddSheet/SaveModal에서.
- `COOKING_METHOD_TINTS` rgba를 `color-mix()` 파생으로 교체하되 시각적 결과 보존.

## Design Authority

- UI risk: `high-risk` (anchor screen visual retrofit)
- Anchor screen dependency: `RECIPE_DETAIL`
- Visual artifact: RECIPE_DETAIL before/after screenshots at mobile default (390px), narrow (320px), desktop sanity; key active states (planner-add sheet open, save modal open, login gate modal, loading, error)
- Authority status: reviewed
- Design wireframe: `ui/designs/RECIPE_DETAIL.md` — Baemin-Style Visual Retrofit Addendum 섹션
- Design critique: `ui/designs/critiques/RECIPE_DETAIL-baemin-style-retrofit-critique.md`
- Authority report (Stage 4/5): `ui/designs/authority/BAEMIN_STYLE_RECIPE_DETAIL_RETROFIT-authority.md`
- Notes: design-generator(RECIPE_DETAIL.md addendum) 및 design-critic(critique artifact) Stage 1에서 완료. Authority report는 Stage 4/5에서 생성. Prototype `HANDOFF.md` RECIPE_DETAIL 섹션은 REFERENCE ONLY — hero+transparent AppBar fade와 tabs/reviews는 프로덕션 범위 밖.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 기본값; RECIPE_DETAIL 리트로핏 미실행
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비
- [x] 확정 (confirmed) — Stage 5/6 review 통과, authority blocker 0개
- [ ] N/A

> 이 슬라이스는 high-risk anchor screen 변경이다. Authority review가 필수다.
> Prototype HANDOFF.md RECIPE_DETAIL 섹션은 REFERENCE ONLY다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/RECIPE_DETAIL.md` (Baemin-Style Retrofit Addendum 포함)
- `ui/designs/critiques/RECIPE_DETAIL-baemin-style-retrofit-critique.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md`
- `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (REFERENCE ONLY)
- `docs/workpacks/baemin-style-home-retrofit/README.md` (home-retrofit 패턴 참조)
- `docs/workpacks/h5-modal-system-redesign/README.md` (H5 modal decisions)

## QA / Test Data Plan

- Fixture baseline: 변경 없음.
- Real DB smoke: 컴포넌트 수준 변경만이므로 불필요.
- Browser smoke: RECIPE_DETAIL before/after screenshots + key active state screenshots.
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
  - 기존 loading/ready/error 상태가 사라짐
  - 비승인 토큰 값 hardcode
  - `--cook-*` 토큰 값 변경
  - RECIPE_DETAIL 정보 구조 위반
  - H5 modal 결정 위반
  - `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
  - Cooking method 배지 색상이 시각적으로 달라짐 (tint 변환 정확도 검증)

## Key Rules

- RECIPE_DETAIL 정보 구조(overview, utility metrics, primary CTA, 재료, 스텝)는 잠겼다. 섹션 순서, 컨트롤 배치를 변경하지 않는다.
- H5 modal 결정(icon close, olive accent, eyebrow 제거)을 PlannerAddSheet/SaveModal에서 엄수한다.
- 모든 리스타일은 CSS 변수 사용 — hardcoded hex, rgba 금지. 파생 색상은 `color-mix()` 사용.
- `--cook-*` 조리방법 색상 토큰 값 변경 금지. 파생 tint만 `color-mix()` 전환.
- `COOKING_METHOD_TINTS` rgba → `color-mix()` 전환 시 시각적 결과가 보존되어야 한다.
- Jua 또는 prototype-only 폰트 import 금지.
- 프로토타입 `HANDOFF.md` RECIPE_DETAIL 스펙은 REFERENCE ONLY — 프로덕션 계약 아님. hero+transparent AppBar fade, tabs/reviews는 out of scope.
- `components/ui/` 공유 프리미티브는 소비만 가능 — 이 슬라이스에서 수정 금지.
- 기존 TypeScript props 인터페이스 보존. Visual-only 변경.
- Badge 프리미티브의 contrast 이슈는 HOME 리트로핏과 동일하게 inline `style` prop으로 해결 (Tailwind v4 specificity).
- `glass-panel` 등 기존 유틸 클래스가 hardcoded 값을 사용하는 경우 토큰으로 교체하되, 다른 화면에서의 사용을 고려해 범위를 제한한다.
- LoginGateModal(`components/auth/`)은 RECIPE_DETAIL 전용 소비이나 경로가 `components/auth/`이므로, 향후 다른 화면에서 소비 시 별도 scope 검토가 필요하다.

## Contract Evolution Candidates

없음. 이 슬라이스는 승인된 방향과 토큰 범위 내의 visual-only 변경이다.

## Primary User Path

1. 사용자가 RECIPE_DETAIL(`/recipe/{id}`)에 진입한다.
2. Hero 영역, overview 카드, 태그 칩, utility metrics row가 배민 스타일 토큰으로 리스타일되어 보인다.
3. 인분 조절 스테퍼와 재료 리스트가 토큰 기반 surface/shadow로 표시된다.
4. 조리 단계 StepCard가 토큰 기반 surface로 표시되고, cooking method 배지 tint가 `color-mix()` 파생으로 동일하게 렌더된다.
5. Primary CTA(`[플래너에 추가]`, `[요리하기]`)와 utility metrics 버튼이 토큰 기반 tone으로 표시된다.
6. `[플래너에 추가]` → PlannerAddSheet가 배민 스타일 modal chrome으로 열린다.
7. `[저장]` → SaveModal이 배민 스타일 modal chrome으로 열린다.
8. 비로그인 액션 → LoginGateModal이 배민 스타일 modal chrome으로 열린다.
9. Loading/error 상태가 모두 보존되어 정상 동작한다.

## Delivery Checklist

> Living closeout 문서. Stage 4에서 구현 항목 체크, Stage 5/6에서 리뷰.

- [x] RecipeDetailScreen hero gradient 리스타일 (hardcoded rgba → `color-mix()` with brand/olive tokens) <!-- omo:id=bsrdr-hero-gradient;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen overview card 리스타일 (`glass-panel` → token surface/shadow/border) <!-- omo:id=bsrdr-overview-card;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen tag chips 리스타일 (hardcoded rgba → `color-mix()` with olive) <!-- omo:id=bsrdr-tag-chips;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen utility metrics row 리스타일 (hardcoded rgba tones → `color-mix()` with tokens) <!-- omo:id=bsrdr-utility-metrics;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen action buttons 리스타일 (ActionButton/MetricActionButton/IconActionButton tone classes → token-based) <!-- omo:id=bsrdr-action-buttons;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen serving stepper 리스타일 (`bg-white` → token surface, hardcoded hex → token-derived) <!-- omo:id=bsrdr-serving-stepper;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen ingredient list 리스타일 (`bg-white/70`, hardcoded hex → token-based) <!-- omo:id=bsrdr-ingredient-list;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen step cards 리스타일 (`bg-white/70`, `rounded-full` → token-based) <!-- omo:id=bsrdr-step-cards;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen `COOKING_METHOD_TINTS` rgba → `color-mix()` 전환 <!-- omo:id=bsrdr-cook-tints;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen feedback toasts 리스타일 (hardcoded rgba → `color-mix()`, hardcoded shadow → token shadow) <!-- omo:id=bsrdr-toasts;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen loading skeleton 리스타일 (`glass-panel`, `bg-white/*` → token-based) <!-- omo:id=bsrdr-skeleton;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeDetailScreen hardcoded `rounded-[Npx]` → `--radius-*` token mapping <!-- omo:id=bsrdr-radii;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerAddSheet 리스타일 (backdrop, `glass-panel`, `text-white`, `bg-white/*`, radii → tokens) <!-- omo:id=bsrdr-planner-sheet;stage=4;scope=frontend;review=5,6 -->
- [x] SaveModal 리스타일 (backdrop, `glass-panel`, hardcoded rgba, `bg-white/*`, radii → tokens) <!-- omo:id=bsrdr-save-modal;stage=4;scope=frontend;review=5,6 -->
- [x] LoginGateModal 리스타일 (backdrop, `glass-panel`, eyebrow rgba, `bg-white/78`, radii → tokens) <!-- omo:id=bsrdr-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] `components/ui/` 프리미티브 소비 적용 (Badge, Skeleton 소비) <!-- omo:id=bsrdr-ui-primitives-consumed;stage=4;scope=frontend;review=5,6 -->
- [x] 모든 리스타일이 CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bsrdr-token-usage;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 loading/ready/error 상태 보존 확인 <!-- omo:id=bsrdr-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 정보 구조 보존 확인 <!-- omo:id=bsrdr-structure-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] H5 modal 결정 보존 확인 (PlannerAddSheet, SaveModal) <!-- omo:id=bsrdr-h5-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] `--cook-*` 토큰 값 미변경 확인 <!-- omo:id=bsrdr-cook-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] Cooking method 배지 tint 시각적 결과 보존 확인 <!-- omo:id=bsrdr-cook-tint-visual;stage=4;scope=frontend;review=5,6 -->
- [x] Jua 또는 prototype-only 폰트 미사용 확인 <!-- omo:id=bsrdr-no-font;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=bsrdr-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL before/after screenshots 캡처 (mobile default, narrow 320px) <!-- omo:id=bsrdr-regression-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Key active state screenshots (planner-add sheet, save modal, login gate, loading, error) <!-- omo:id=bsrdr-active-state-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bsrdr-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Hardcoded hex/rgba 색상이 리스타일된 컴포넌트에 남아 있음
- 선언된 범위 밖의 컴포넌트, 페이지, 레이아웃 파일이 수정됨
- Jua 또는 prototype-only 폰트 import
- `--cook-*` 토큰 값 변경
- Cooking method 배지 tint의 시각적 결과가 변경됨
- RECIPE_DETAIL 정보 구조 위반
- H5 modal 결정 위반
- Mobile default(390px) 또는 320px에서 horizontal overflow
- Brand-colored 요소 내 텍스트 클리핑
- 기존 loading/ready/error 상태 사라짐
- `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
- 미해결 authority blocker (Stage 5)
- Exploratory QA 미실행 및 유효한 skip rationale 미기록
