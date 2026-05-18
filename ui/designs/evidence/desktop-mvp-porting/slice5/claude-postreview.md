## Slice 5 Post-Implementation Authority Review — TEXT ONLY

**Gate**: Post-Implementation Review (Step 4)
**Slice**: `desktop-mvp-port-slice5-pantry-shopping`
**Scope**: 10 ledger rows — PANTRY, PANTRY_ADD, PANTRY_BUNDLE, SHOPPING_FLOW, SHOPPING_DETAIL (active), SHOPPING_DETAIL (complete), SHOPPING_REFLECT, SHOPPING_LISTS (partial), plus 2 modal sub-surfaces
**Branch**: `feature/desktop-mvp-port-slice5-pantry-shopping`

---

### Verdict: APPROVED_WITH_NON_BLOCKING_NOTES

**Required repairs**: None.
**Blocking findings**: None.

---

### Positive Architecture Finding: CSS Token Bridge

`app/globals.css` lines 3233–3259 introduce `.web-pantry-shell` and `.web-shopping-shell` selectors that remap 20+ Wave1 CSS custom properties to their `--web-*` equivalents at the cascade level:

```
--brand → var(--web-brand)          /* #ED7470 → #00A1FF */
--line → var(--web-line)
--surface → var(--web-surface)
--olive → var(--web-brand-accessible)
--foreground → var(--web-text-1)
```

This elegantly solves Slice 4's NB-1 (Wave1 token contamination in shared sub-components). Any child element using `var(--brand)` inside these shells automatically resolves to the Ohou blue value. Recommend backporting this pattern to `.web-menu-add-shell` for Slice 4 surfaces when convenient.

---

### Token Audit Summary

| File | Desktop LOC start | Web primitives imported | Wave1 tokens in desktop branch | web-* CSS classes |
|---|---|---|---|---|
| pantry-screen.tsx | L463 | 7 | 0 | 20 |
| pantry-add-sheet.tsx | L296 | 9 | 0 | 12 |
| pantry-bundle-picker.tsx | L318 | 7 | 1 (`--line` in skeleton, bridge-scoped) | 16 |
| shopping-flow-screen.tsx | L728 | 4 | 0 | 25+ |
| shopping-detail-screen.tsx | L581 | 5 | 0 | 30+ |
| pantry-reflection-popup.tsx | L118 | 7 | 0 | 10 |

**Result**: Zero unscoped Wave1 tokens in any desktop branch. The single `--line` usage in `pantry-bundle-picker.tsx` is within `.web-pantry-shell` bridge scope and resolves correctly.

---

### Non-Blocking Findings

**NB-1 (P2) — Mobile spec skip inconsistency**
Slice 4 mobile specs added explicit `test.beforeEach` guards to skip on `desktop-chrome` project. Slice 5 mobile specs do not add these skips — they rely on being run with `--project=mobile-chrome`. Both work, but the inconsistency could confuse future contributors. Recommend standardizing on one pattern.

**NB-2 (P2) — Shopping flow layout consolidation**
Prototype shows a multi-step wizard-like flow. MVP implements a master-detail layout with 3 mode cards + recipe cards + sidebar summary in `shopping-flow-screen.tsx`. This is an intentional UX improvement that better fits the desktop form factor. Accepted.

**NB-3 (P2) — Pantry reflection modal simplification**
Prototype shows an item-level checkbox list for pantry reflection. MVP implements a 3-mode radio design (모두 반영 / 선택 반영 / 반영 안 함) in `pantry-reflection-popup.tsx` that directly maps to `add_to_pantry_item_ids` domain semantics (`null` = all, selected ids = partial, `[]` = none). This is a better domain model mapping. Accepted.

**NB-4 (P2) — Bundle picker layout variation**
Prototype shows chip/pill layout for bundle ingredients. MVP uses accordion sections with 2-column ingredient grids in `pantry-bundle-picker.tsx`. Functionally equivalent, visually different. Accepted as implementation choice.

**NB-5 (P2) — Visual threshold**
`PANTRY_SHOPPING_DESKTOP_VISUAL_MAX_DIFF_PIXELS = 2400` is higher than earlier slices but proportional to the increased surface complexity (7 screenshots across 6 screens including modals). Acceptable.

**NB-6 (P3) — Minor wording differences**
Some heading text and button labels differ slightly from prototype copy. Non-functional, cosmetic only.

---

### Test Coverage

- **Visual regression**: 7 screenshots across 2 test blocks in `qa-visual.spec.ts` (lines 412–506) — pantry, pantry-add-modal, pantry-bundle-modal, shopping-flow, shopping-detail-active, shopping-reflect-modal, shopping-detail-complete
- **Accessibility**: 1 test covering 4 screen segments in `qa-a11y.spec.ts` (lines 365–428) — pantry, shopping flow, shopping detail, shopping completed. All with `allowPrototypeDesktopColorContrast: true`
- **Mock routes**: Updated in `tests/e2e/helpers/mock-routes.ts` for pantry/shopping API surfaces
- **Product tests**: 650 passing (no regressions)
- **Mobile Playwright**: 62 passing (no regressions)

Coverage is sufficient for authority gate passage.

---

### Ledger Status

| Row | Surface | Verdict |
|---|---|---|
| 1 | PANTRY | done |
| 2 | PANTRY_ADD | done |
| 3 | PANTRY_BUNDLE | done |
| 4 | SHOPPING_FLOW | done |
| 5 | SHOPPING_DETAIL (active) | done |
| 6 | SHOPPING_DETAIL (complete) | done |
| 7 | SHOPPING_REFLECT | done |
| 8 | SHOPPING_LISTS | partial:slice5 |
| 9 | pantry-add modal sub-surface | done |
| 10 | pantry-bundle modal sub-surface | done |

9 rows → `done`. 1 row (`SHOPPING_LISTS`) → `partial:slice5` (MyPage entry point owned by Slice 6).

---

### Closeout

Codex may proceed with Slice 5 ledger updates and branch merge. No repairs required before merge. The CSS Token Bridge pattern is validated and should be adopted as the standard approach for all remaining slices where shared sub-components use Wave1 tokens.
