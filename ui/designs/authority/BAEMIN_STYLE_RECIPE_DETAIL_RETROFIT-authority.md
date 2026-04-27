# Baemin-Style RECIPE_DETAIL Retrofit — Authority Report

> Slice: `baemin-style-recipe-detail-retrofit`
> Stage: 4 (Frontend Implementation)
> Date: 2026-04-27
> Reviewer: Claude (Stage 4 implementer) + Codex (Stage 5 visual evidence)
> Branch: `feature/fe-baemin-style-recipe-detail-retrofit`
> evidence:
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-before-mobile.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-after-mobile.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-after-narrow-320.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-planner-add-sheet.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-save-modal.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-login-gate-modal.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-loading-state.png`
> - `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-error-state.png`

> - `.artifacts/qa/baemin-style-recipe-detail-retrofit/2026-04-27T09-46-21-195Z/exploratory-report.json`
> - `.artifacts/qa/baemin-style-recipe-detail-retrofit/2026-04-27T09-46-21-195Z/eval-result.json`

---

## Verdict: PASS

The RECIPE_DETAIL screen visual retrofit is complete. All 4 target files have been tokenized:
- `components/recipe/recipe-detail-screen.tsx` — hero, overview, tags, metrics, actions, stepper, ingredients, steps, toasts, skeleton
- `components/recipe/planner-add-sheet.tsx` — modal chrome, backdrop, button tones
- `components/recipe/save-modal.tsx` — modal chrome, backdrop, book list, error banners
- `components/auth/login-gate-modal.tsx` — modal chrome, backdrop, eyebrow badge

All hardcoded hex/rgba values replaced with CSS variable tokens and `color-mix()` derivatives. RECIPE_DETAIL information architecture preserved. H5 modal decisions honored. `--cook-*` token values unchanged. No `components/ui/*` files modified. No `app/globals.css` edits.

Codex Stage 5 populated all required evidence screenshots, ran exploratory QA, and reran `pnpm verify:frontend`. No authority blocker remains.

---

## Changed Files

| File | Change summary |
|------|---------------|
| `components/recipe/recipe-detail-screen.tsx` | `glass-panel` removed (3 sections); hero gradient → `color-mix()` brand/olive; `COOKING_METHOD_TINTS` rgba → `color-mix()` from `--cook-*` tokens; overview/ingredient/step cards `bg-white/*` → `--surface-fill`; all `rounded-[Npx]` → `--radius-*` tokens; `shadow-[var(--shadow)]` → `--shadow-1`/`--shadow-2`; `getRecipeActionToneClass` 4 variants brand/olive/signal/neutral → `color-mix()` tokens; count pills `bg-white/72` → `--surface-fill`; feedback toasts → `color-mix()` + `--shadow-3`; loading skeleton → `Skeleton` primitive consumption; `text-white` → `text-[var(--surface)]` |
| `components/recipe/planner-add-sheet.tsx` | `bg-black/50` → `color-mix()` backdrop; `glass-panel` → token panel; `text-white` → `text-[var(--surface)]`; `bg-white/60` → `--surface-fill`; `rounded-[Npx]` → `--radius-*`; `text-red-600` → `--brand-deep` |
| `components/recipe/save-modal.tsx` | `bg-black/50` → `color-mix()` backdrop; `glass-panel` → token panel; all `rgba(...)` olive/brand tints → `color-mix()`; `bg-white`, `bg-white/70`, `bg-white/75` → `--surface`/`--surface-fill`; `text-white` → `text-[var(--surface)]`; all `rounded-[Npx]` → `--radius-*` |
| `components/auth/login-gate-modal.tsx` | `bg-black/42` → `color-mix()` backdrop; `glass-panel` → token panel; eyebrow `rgba(30,30,30,...)` → `color-mix()` foreground; `bg-white/78` → `--surface-fill`; `rounded-full` → `--radius-full`; `rounded-[18px]` → `--radius-lg` |

---

## Evidence Status

Screenshots were captured during Codex Stage 5:

| # | Description | Expected path | Status |
|---|-------------|---------------|--------|
| E1 | Before — mobile default (390px) | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-before-mobile.png` | Captured |
| E2 | After — mobile default (390px) | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-after-mobile.png` | Captured |
| E3 | After — narrow (320px) | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-after-narrow-320.png` | Captured |
| E4 | PlannerAddSheet open | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-planner-add-sheet.png` | Captured |
| E5 | SaveModal open | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-save-modal.png` | Captured |
| E6 | LoginGateModal open | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-login-gate-modal.png` | Captured |
| E7 | Loading state | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-loading-state.png` | Captured |
| E8 | Error state | `ui/designs/evidence/baemin-style/recipe-detail-retrofit/RECIPE_DETAIL-error-state.png` | Captured |

## Stage 5 Visual Review

- Mobile default and narrow 320px screenshots show no horizontal overflow.
- Brand-colored CTA and modal buttons do not clip text.
- PlannerAddSheet, SaveModal, and LoginGateModal open states keep the H5 modal chrome decisions.
- Loading and error states are preserved.
- Cooking method tint conversion remains visually aligned with the existing cooking color semantics.
- Full-page evidence can show the fixed bottom navigation over long page content, which is existing shell behavior and not a blocker for this visual-only slice.

---

## Risk Point Review (from Stage 1 Critique)

| # | Risk | Resolution | Status |
|---|------|------------|--------|
| R1 | `COOKING_METHOD_TINTS` `color-mix()` conversion may differ from original rgba due to alpha rounding | Converted all 6 tint values + fallback to `color-mix(in srgb, var(--cook-*) N%, transparent)`. Stage 5 screenshots preserve the cooking color semantics. | Resolved |
| R2 | `glass-panel` shared scope — other screens still reference it | Removed `glass-panel` only within the 4 target files. The global CSS rule for `glass-panel` is untouched — other screens (PLANNER_WEEK, etc.) can continue using it. | Resolved (scoped) |
| R3 | `getRecipeActionToneClass` 4-variant conversion may blur signal vs brand distinction | Converted: brand → `color-mix(--brand 18%/12%)`, olive → `color-mix(--olive 20%/12%)`, signal → `color-mix(--brand-deep 18%/10%)`, neutral → `--surface`/`--line`. Stage 5 screenshots show the tone distinction is maintained. | Resolved |
| R4 | LoginGateModal `components/auth/` path — multi-consumer risk | Verified via grep: only consumed by `recipe-detail-screen.tsx`. Safe to retrofit as single-consumer component. | Resolved |
| R5 | Badge contrast issue (Tailwind v4 specificity) | Skeleton primitive consumed in RecipeDetailLoadingSkeleton. Badge is consumed elsewhere in the codebase but RECIPE_DETAIL does not directly render Badge variant instances requiring contrast fix. HOME retrofit's inline style pattern is available if needed. | N/A for this slice |

---

## RECIPE_DETAIL Information Architecture Preservation

- [x] Overview card layout preserved: breadcrumb → tags → title → meta → utility metrics → description → CTA
- [x] Utility metrics row structure preserved: 플래너 · 공유 · 좋아요 · 저장 compact wrap row
- [x] Primary CTA row structure preserved: [플래너에 추가] [요리하기] 2-column
- [x] Ingredient list structure preserved: 재료명 + 수량 좌우 배치, 취향껏/옵션 배지
- [x] Step card structure preserved: 번호 원 + 조리방법 배지 + instruction + 사용재료 칩
- [x] Serving stepper position preserved: 재료 섹션 내

## H5 Modal Preservation Check

- [x] PlannerAddSheet: no eyebrow, icon-only close via ModalHeader, olive accent preserved
- [x] SaveModal: no eyebrow, icon-only close via ModalHeader, olive CTA preserved
- [x] LoginGateModal: eyebrow pill ("보호된 작업") preserved (LoginGateModal-specific, not H5 removal target)

## Scope Guard

- [x] Runtime diff limited to: `components/recipe/recipe-detail-screen.tsx`, `components/recipe/planner-add-sheet.tsx`, `components/recipe/save-modal.tsx`, `components/auth/login-gate-modal.tsx`
- [x] No `components/ui/*` files modified
- [x] No `app/globals.css` edits
- [x] No API/DB/store/fixture changes
- [x] No other screen (HOME, PLANNER_WEEK) touched
- [x] No BottomTabs/AppShell changes
- [x] No Jua or prototype-only fonts
- [x] No prototype hero+transparent AppBar fade or tabs/reviews
- [x] `--cook-*` token values unchanged (only tint derivation via `color-mix()`)

## Validation Status

| Check | Result |
|-------|--------|
| `git diff --check` | PASS |
| `pnpm validate:workflow-v2` | PASS |
| `pnpm validate:workpack` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm verify:frontend` | PASS |
| `pnpm qa:eval -- --checklist .artifacts/qa/baemin-style-recipe-detail-retrofit/2026-04-27T09-46-21-195Z/exploratory-checklist.json --report .artifacts/qa/baemin-style-recipe-detail-retrofit/2026-04-27T09-46-21-195Z/exploratory-report.json --fail-under 85` | PASS (100) |

---

## Out-of-Scope Confirmations

- Prototype HANDOFF.md hero + transparent AppBar fade: NOT implemented
- Prototype tabs/reviews: NOT implemented
- BottomTabs restyle: NOT implemented (separate app-wide slice)
- COOK_MODE screen: NOT implemented (slice 14/15)
- SocialLoginButtons restyle within LoginGateModal: NOT touched
- ContentState component: NOT modified (out of scope, shared component)

---

## Stage 5 Closeout

1. **Screenshot capture**: All 8 evidence paths listed above populated.
2. **COOKING_METHOD_TINTS visual parity**: StepCard cooking method badges preserve the intended tint semantics.
3. **Signal vs brand tone distinction**: 좋아요(signal) and 요리하기(brand) retain distinguishable tones.
4. **Mobile overflow check**: 390px and 320px evidence shows no horizontal overflow.
5. **Text clipping**: No text clipping found in brand-colored elements.
6. **Exploratory QA**: `.artifacts/qa/baemin-style-recipe-detail-retrofit/2026-04-27T09-46-21-195Z/` bundle created and evaluated at 100.
7. **LoginGateModal single-consumer re-verification**: LoginGateModal remains scoped to the RECIPE_DETAIL flow for this slice.
