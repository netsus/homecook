# baemin-style-planner-week-retrofit

> PLANNER_WEEK anchor screen visual retrofit to Baemin-style design language.
> Dependencies: `h6-baemin-style-direction` (merged), `baemin-style-tokens-additive` (merged), `baemin-style-token-values` (merged), `baemin-style-shared-components` (merged), `baemin-style-home-retrofit` (merged), `baemin-style-recipe-detail-retrofit` (merged), `H2-planner-week-v2-redesign` (merged).
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

PLANNER_WEEK 화면의 기존 정보 구조(hero, secondary CTA toolbar, week context bar, weekday strip, day cards, slot rows, 상태 chips)와 H2/H4 day-card interaction contract(세로 스크롤 전용, 가로 스크롤 없음, 2일 이상 mobile overview)를 보존하면서, 승인된 배민 스타일 토큰과 공유 UI 프리미티브를 적용해 시각적 리트로핏을 완성한다. 구조 변경 없이 토큰 교체, 컴포넌트 소비, 스타일링 정제만 수행한다. STATUS_META의 hardcoded rgba를 `color-mix()`로 재파생하고, unauthorized 상태의 hardcoded 값도 토큰으로 교체한다.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-planner-week-retrofit` |
| Implementation | `feature/fe-baemin-style-planner-week-retrofit` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend / PLANNER_WEEK retrofit implementation | **Claude** | visual retrofit |
| 5 | Design review | **Codex** | authority evidence, a11y, visual regression |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

### PLANNER_WEEK Screen Visual Retrofit

다음 PLANNER_WEEK 화면 파일을 배민 스타일 토큰과 공유 프리미티브로 리스타일한다. 기존 H2/H4 day-card interaction contract(세로 스크롤, 가로 스크롤 없음, slot row 구조)를 보존하면서 시각적 일관성을 확보한다.

| Target | File | Retrofit scope |
| --- | --- | --- |
| PlannerWeekScreen shell | `components/planner/planner-week-screen.tsx` | Hero section, secondary CTA toolbar, week context bar, weekday strip, day cards, slot rows, status chips, loading skeleton, empty state, unauthorized state, serving chip — `glass-panel` 제거, hardcoded rgba/hex/rounded to token variables; STATUS_META rgba를 `color-mix()`로 재파생; `bg-white/*` → token surface; `text-white` → token surface |

### STATUS_META Token Derivation

`STATUS_META` className의 hardcoded rgba 값을 CSS 변수에서 `color-mix()`로 파생한다.

| 현재 | 변환 |
| --- | --- |
| `rgba(255,108,60,0.12)` (registered bg) | `color-mix(in srgb, var(--brand) 12%, transparent)` |
| `rgba(46,166,122,0.12)` (shopping_done bg) | `color-mix(in srgb, var(--olive) 12%, transparent)` |
| `rgba(30,30,30,0.08)` (cook_done bg) | `color-mix(in srgb, var(--foreground) 8%, transparent)` |

STATUS_META의 text 색상(`text-[var(--brand-deep)]`, `text-[var(--olive)]`, `text-[var(--foreground)]`)은 이미 토큰 기반이므로 변경하지 않는다.

### Hardcoded Value Migration Summary

| Pattern | Count (approx.) | Replacement strategy |
| --- | --- | --- |
| `glass-panel` | ~5 | token-based `bg-[var(--panel)]` + `border border-[var(--line)]` + `shadow-[var(--shadow-2)]` |
| `bg-white/*` (opacity variants) | ~4 | `bg-[var(--surface-fill)]` / `color-mix()` 파생 |
| `bg-white` (opaque) | ~1 | `bg-[var(--surface)]` |
| `text-white` | ~2 | `text-[var(--surface)]` |
| `rounded-[Npx]` (hardcoded) | ~10 | `--radius-sm/md/lg/xl/full` token mapping |
| Hardcoded `rgba(...)` | ~6 | `color-mix(in srgb, var(--token) N%, transparent)` |
| `text-[color:rgb(...)]` | ~1 | `text-[var(--olive)]` (leftover meal name) |
| Hardcoded `shadow-[...]` with rgba | ~3 | `shadow-[var(--shadow-N)]` 또는 `color-mix()` 파생 |

### Radius Mapping

| 현재 | 토큰 | 비고 |
| --- | --- | --- |
| `rounded-[12px]` | `--radius-md` (12px) | PLANNER_CTA_CLASS |
| `rounded-[13px]` | `--radius-md` (12px) | weekday strip items |
| `rounded-[11px]` | `--radius-md` (12px) | weekday badge |
| `rounded-[16px]` | `--radius-lg` (16px) | CTA group |
| `rounded-[18px]` | `--radius-lg` (16px) | unauthorized info box, empty message |
| `rounded-[clamp(18px,5vw,24px)]` | `--radius-xl` (20px) | week context bar |
| `rounded-[20px]` | `--radius-xl` (20px) | loading skeleton |
| `rounded-[clamp(20px,5vw,24px)]` | `--radius-xl` (20px) | day card |
| `rounded-[clamp(22px,6vw,28px)]` | `--radius-xl` (20px) | hero section |
| `rounded-full` | `--radius-full` (9999px) | 기존 사용처 유지 |

### Token Usage Contract

- 모든 리스타일은 `app/globals.css` CSS 변수 사용 — hardcoded hex 금지.
- Brand tokens: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA).
- Gray/surface/shadow/radius: additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`).
- `--olive` 사용 보존 (STATUS_META shopping_done, range context label).
- 신규 CSS 토큰 추가 금지 — 기존 승인 토큰만 사용. 파생 색상은 `color-mix()` 사용.

### Other In-Scope Items

- `components/ui/` 공유 프리미티브(`Skeleton`) 소비 — loading skeleton에서 적합한 곳에서 import하여 사용.
- `glass-panel` CSS class를 토큰 기반 인라인으로 교체.
- ContentState 컴포넌트의 PLANNER_WEEK 사용처에서 토큰 일관성 확인.
- API: 없음
- DB: 없음
- 상태 전이: 없음
- Schema Change:
  - [x] 없음

## Out of Scope

- PLANNER_WEEK 정보 구조 변경 (hero, CTA toolbar, week context bar, day card, slot row 구조/순서 변경 금지)
- H2/H4 day-card interaction contract 변경 (가로 스크롤 재도입 금지, slot row 모델 변경 금지)
- Prototype HANDOFF.md PLANNER_WEEK 스펙 직접 복사 (프로덕션 계약 아님)
- BottomTabs 리스타일 (별도 앱 전체 retrofit slice로 분리)
- AppShell / AppHeader 구조 변경 (home-retrofit에서 완료)
- 다른 화면(HOME, RECIPE_DETAIL 등) 리트로핏
- 새로운 기능/인터랙션 추가 (빈 슬롯 탭 동작, meal status transition 등)
- API, DB, 상태 전이, endpoint, auth 변경
- Jua 또는 prototype-only 폰트 import
- 프로토타입 JSX/HTML 직접 복사
- `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 변경
- 신규 CSS 토큰 추가
- `components/ui/` 프리미티브 수정 (소비만 허용)
- SocialLoginButtons 리스타일 (unauthorized state 내부 소비 컴포넌트이나 `components/auth/` 공유 범위)
- COOK_MODE 화면 (후속 slice 14/15)
- MEAL_SCREEN 화면 (slice 07에서 완료, 별도 retrofit 대상)

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | 배민 스타일 공식 채택 방향, rollout 순서, non-goals 잠금 |
| `baemin-style-tokens-additive` | merged | Additive token foundation이 `app/globals.css`에 존재 |
| `baemin-style-token-values` | merged | Brand tokens이 사용자 승인 값(#ED7470, #C84C48, #FDEBEA)으로 설정됨 |
| `baemin-style-shared-components` | merged | 공유 UI 프리미티브(Skeleton 등)가 소비 가능 상태 |
| `baemin-style-home-retrofit` | merged | HOME 리트로핏 패턴이 확정 — 동일 토큰 교체 패턴 참조 |
| `baemin-style-recipe-detail-retrofit` | merged | RECIPE_DETAIL 리트로핏 패턴이 확정 — 동일 토큰 교체 패턴 참조 |
| `H2-planner-week-v2-redesign` | merged | Day-card slot row 구조가 확정 — 이 구조 위에 시각적 리트로핏 적용 |

## Backend First Contract

백엔드 변경 없음. 기존 계약 보존:

- API response envelope: `{ success, data, error }`
- 기존 endpoint 파라미터/응답 구조 변경 없음
- 이 슬라이스에서 endpoint, field, table, status value 추가 금지

## Frontend Delivery Mode

- PLANNER_WEEK 화면 파일(`components/planner/planner-week-screen.tsx`)을 승인된 배민 스타일 토큰으로 리스타일.
- `components/ui/*` 공유 프리미티브를 적합한 곳에서 소비.
- 필수 상태 보존: `checking / authenticated / unauthorized` + `loading / ready / empty / error` — 기존 상태가 사라지면 안 됨.
- 기존 TypeScript props 인터페이스 보존 — visual-only 변경.
- H2/H4 day-card interaction contract 엄수 (세로 스크롤, 가로 스크롤 없음, slot row 구조, 2일 이상 mobile overview).
- `STATUS_META` rgba → `color-mix()` 파생 교체하되 시각적 결과 보존.
- Weekday strip swipe gesture, keyboard navigation 동작 보존.

## Design Authority

- UI risk: `high-risk` (anchor screen visual retrofit)
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: PLANNER_WEEK before/after screenshots at mobile default (390px), narrow (320px); key active states (loading skeleton, empty state, unauthorized state, scrolled day cards, weekday strip)
- Authority status: reviewed
- Design wireframe: `ui/designs/PLANNER_WEEK.md` — Baemin-Style Visual Retrofit Addendum 섹션
- Design critique: `ui/designs/critiques/PLANNER_WEEK-baemin-style-retrofit-critique.md`
- Authority report (Stage 4/5): `ui/designs/authority/BAEMIN_STYLE_PLANNER_WEEK_RETROFIT-authority.md`
- Notes: design-generator(PLANNER_WEEK.md addendum) 및 design-critic(critique artifact) Stage 1에서 완료. Authority report는 Stage 4/5에서 생성. Prototype `HANDOFF.md` PLANNER_WEEK 섹션은 REFERENCE ONLY.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 기본값; PLANNER_WEEK 리트로핏 미실행
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비
- [x] 확정 (confirmed) — Stage 5/6 review 통과, authority blocker 0개
- [ ] N/A

> 이 슬라이스는 high-risk anchor screen 변경이다. Authority review가 필수다.
> Prototype HANDOFF.md PLANNER_WEEK 섹션은 REFERENCE ONLY다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/PLANNER_WEEK.md` (Baemin-Style Retrofit Addendum 포함)
- `ui/designs/PLANNER_WEEK-v2.md`
- `ui/designs/critiques/PLANNER_WEEK-critique.md`
- `ui/designs/critiques/PLANNER_WEEK-baemin-style-retrofit-critique.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `docs/workpacks/baemin-style-home-retrofit/README.md` (home-retrofit 패턴 참조)
- `docs/workpacks/baemin-style-recipe-detail-retrofit/README.md` (recipe-detail-retrofit 패턴 참조)

## QA / Test Data Plan

- Fixture baseline: 변경 없음.
- Real DB smoke: 컴포넌트 수준 변경만이므로 불필요.
- Browser smoke: PLANNER_WEEK before/after screenshots + key active state screenshots.
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
  - 기존 checking/authenticated/unauthorized + loading/ready/empty/error 상태가 사라짐
  - 비승인 토큰 값 hardcode
  - PLANNER_WEEK 정보 구조 위반 (day-card, slot row, CTA toolbar 구조 변경)
  - H2/H4 day-card interaction contract 위반 (가로 스크롤 재도입)
  - `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
  - Weekday strip swipe/keyboard navigation 동작 깨짐
  - STATUS_META 상태 chip 색상이 시각적으로 달라짐
  - 390px에서 2일 이상 overview가 보이지 않음

## Key Rules

- H2/H4 day-card interaction contract(세로 스크롤, 가로 스크롤 없음, slot row 구조, 2일 이상 mobile overview)는 잠겼다. 구조를 변경하지 않는다.
- PLANNER_WEEK 정보 구조(hero, CTA toolbar, week context bar, weekday strip, day cards, slot rows)는 잠겼다. 섹션 순서, 컨트롤 배치를 변경하지 않는다.
- 모든 리스타일은 CSS 변수 사용 — hardcoded hex, rgba 금지. 파생 색상은 `color-mix()` 사용.
- `STATUS_META` rgba → `color-mix()` 전환 시 시각적 결과가 보존되어야 한다.
- Jua 또는 prototype-only 폰트 import 금지.
- 프로토타입 `HANDOFF.md` PLANNER_WEEK 스펙은 REFERENCE ONLY — 프로덕션 계약 아님.
- `components/ui/` 공유 프리미티브는 소비만 가능 — 이 슬라이스에서 수정 금지.
- 기존 TypeScript props 인터페이스 보존. Visual-only 변경.
- `glass-panel` 등 기존 유틸 클래스가 hardcoded 값을 사용하는 경우 토큰으로 교체하되, 다른 화면에서의 사용을 고려해 범위를 제한한다. PLANNER_WEEK 파일 내 인라인 교체만 수행하고 global CSS 규칙은 수정하지 않는다.
- Weekday strip swipe gesture와 keyboard navigation 동작을 보존한다.
- SocialLoginButtons(`components/auth/`)는 unauthorized state 내부에서 소비되지만 이 슬라이스에서 리스타일 대상이 아니다.

## Contract Evolution Candidates

없음. 이 슬라이스는 승인된 방향과 토큰 범위 내의 visual-only 변경이다.

## Primary User Path

1. 사용자가 PLANNER_WEEK(`/planner`)에 진입한다.
2. Hero 영역과 secondary CTA toolbar([장보기] [요리하기] [남은요리])가 배민 스타일 토큰으로 리스타일되어 보인다.
3. Week context bar와 weekday strip이 토큰 기반 surface/shadow로 표시된다.
4. Day cards가 토큰 기반 panel/border/shadow로 표시되고, slot rows 내의 상태 chip이 `color-mix()` 파생 색상으로 렌더된다.
5. Serving chip(`N인분`)이 토큰 기반 surface로 표시된다.
6. Leftover meal 텍스트가 토큰 기반 `--olive` 색상으로 표시된다.
7. Weekday strip swipe로 주 이동 시 토큰 기반 스타일이 유지된다.
8. Loading skeleton, empty state, error state, unauthorized state가 모두 토큰 기반으로 보존되어 정상 동작한다.

## Delivery Checklist

> Living closeout 문서. Stage 4에서 구현 항목 체크, Stage 5/6에서 리뷰.

- [x] PlannerWeekScreen hero section 리스타일 (`glass-panel` → token panel, hardcoded radii → `--radius-xl`) <!-- omo:id=bspwr-hero;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen secondary CTA toolbar 리스타일 (`bg-white/76` → token surface, hardcoded rgba shadows → token/color-mix, `text-white` → `--surface`, radii → tokens) <!-- omo:id=bspwr-cta-toolbar;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen week context bar 리스타일 (`glass-panel` + `bg-white/88` → token panel, hardcoded shadow → `--shadow-2`, radii → `--radius-xl`) <!-- omo:id=bspwr-week-context;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen weekday strip items 리스타일 (hardcoded radii → `--radius-md`) <!-- omo:id=bspwr-weekday-strip;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen day cards 리스타일 (`glass-panel` → token panel, radii → `--radius-xl`) <!-- omo:id=bspwr-day-cards;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen weekday badge 리스타일 (radii → `--radius-md`, `text-white` → `text-[var(--surface)]`) <!-- omo:id=bspwr-weekday-badge;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen slot rows 리스타일 (leftover `text-[color:rgb(...)]` → `text-[var(--olive)]`) <!-- omo:id=bspwr-slot-rows;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen serving chip 리스타일 (`bg-white` → `bg-[var(--surface)]`) <!-- omo:id=bspwr-serving-chip;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen `STATUS_META` rgba → `color-mix()` 전환 <!-- omo:id=bspwr-status-meta;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen loading skeleton 리스타일 (`glass-panel` + `bg-white/70` → token-based) <!-- omo:id=bspwr-skeleton;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen empty state 리스타일 (`glass-panel` → token panel, radii → `--radius-lg`) <!-- omo:id=bspwr-empty-state;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen unauthorized state 리스타일 (`bg-white/78` → token surface, `rounded-[18px]` → `--radius-lg`) <!-- omo:id=bspwr-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] `PLANNER_CTA_CLASS` radii 토큰화 (`rounded-[12px]` → `--radius-md`) <!-- omo:id=bspwr-cta-class;stage=4;scope=frontend;review=5,6 -->
- [x] 모든 리스타일이 CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bspwr-token-usage;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 checking/authenticated/unauthorized + loading/ready/empty/error 상태 보존 확인 <!-- omo:id=bspwr-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK 정보 구조 보존 확인 <!-- omo:id=bspwr-structure-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] H2/H4 day-card interaction contract 보존 확인 (가로 스크롤 없음, 2일 이상 overview) <!-- omo:id=bspwr-h2h4-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] Weekday strip swipe/keyboard navigation 동작 보존 확인 <!-- omo:id=bspwr-strip-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] Jua 또는 prototype-only 폰트 미사용 확인 <!-- omo:id=bspwr-no-font;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=bspwr-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK before/after screenshots 캡처 (mobile default 390px, narrow 320px) <!-- omo:id=bspwr-regression-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Key active state screenshots (loading skeleton, empty state, unauthorized, scrolled day cards) <!-- omo:id=bspwr-active-state-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bspwr-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Hardcoded hex/rgba 색상이 리스타일된 컴포넌트에 남아 있음
- 선언된 범위 밖의 컴포넌트, 페이지, 레이아웃 파일이 수정됨
- Jua 또는 prototype-only 폰트 import
- PLANNER_WEEK 정보 구조 위반
- H2/H4 day-card interaction contract 위반 (가로 스크롤 재도입)
- Mobile default(390px) 또는 320px에서 horizontal overflow
- Brand-colored 요소 내 텍스트 클리핑
- 기존 상태(checking/authenticated/unauthorized + loading/ready/empty/error)가 사라짐
- `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
- Weekday strip swipe/keyboard navigation 동작 깨짐
- STATUS_META 상태 chip 색상이 시각적으로 변경됨
- 390px에서 2일 이상 overview가 보이지 않음
- 미해결 authority blocker (Stage 5)
- Exploratory QA 미실행 및 유효한 skip rationale 미기록
