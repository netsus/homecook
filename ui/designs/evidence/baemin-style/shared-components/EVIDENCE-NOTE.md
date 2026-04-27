# Evidence Note: baemin-style-shared-components

## Status

Stage 4 implementation completed by Claude on 2026-04-27.
Stage 5 evidence capture completed by Codex on 2026-04-27 using Playwright.

## Implementation Summary

### New Primitives (`components/ui/`)

| Component | File | States covered |
| --- | --- | --- |
| Button | `components/ui/button.tsx` | primary, secondary, neutral, destructive; default, hover, pressed, disabled, loading |
| Chip | `components/ui/chip.tsx` | filter, selection; default, hover, active, disabled |
| Card | `components/ui/card.tsx` | default, hover, pressed, skeleton/loading (via `interactive` + `loading` props) |
| Badge | `components/ui/badge.tsx` | brand, danger, olive, muted |
| EmptyState | `components/ui/empty-state.tsx` | default, with-action |
| ErrorState | `components/ui/error-state.tsx` | default, with-retry |
| Skeleton | `components/ui/skeleton.tsx` | pulse animation with configurable size and rounding |

### Restyled Shared Components (`components/shared/`)

| Component | Changes |
| --- | --- |
| `modal-header.tsx` | Title: `text-xl font-extrabold` -> `text-lg font-bold`; description: `--muted` -> `--text-2`; close button: `--muted` -> `--text-3`, hover bg `white/60` -> `--surface-fill` |
| `modal-footer-actions.tsx` | Cancel: `bg-white/60` -> `bg-[var(--surface)]`, `rounded-[14px]` -> `rounded-[var(--radius-md)]`, added `hover:bg-[var(--surface-fill)]`; Confirm: `rounded-[14px]` -> `rounded-[var(--radius-md)]`, added `shadow-[var(--shadow-1)]` + `hover:brightness-110`; olive CTA preserved per H5 |
| `selection-chip-rail.tsx` | Pill mode: `rounded-full` -> `rounded-[var(--radius-full)]`, `--muted` -> `--text-2`; Date chip: `rounded-[14px]` -> `rounded-[var(--radius-md)]`, `bg-white/60` -> `bg-[var(--surface-fill)]`, `hover:bg-white/80` -> `hover:bg-[var(--surface-subtle)]`, added `shadow-[var(--shadow-1)]` on selected; olive accent preserved per H5 |

## Token Usage

All new and restyled components use CSS variables from `app/globals.css`. No hardcoded hex values remain.

- Destructive/danger colors are derived via `color-mix()` from approved brand tokens (`--brand`, `--brand-deep`, `--brand-soft`). No new tokens added.
- Olive tint backgrounds use `color-mix(in srgb, var(--olive) 12%, transparent)` instead of hardcoded `rgba()`.
- All `text-white` literals replaced with `text-[var(--surface)]` (`--surface: #ffffff`).

## Visual Diff Assessment

### New `components/ui/` files

These are **not imported by any existing screen**. No production visual diff occurs from creating them. Component state previews should be captured separately as new-component evidence (not regression evidence).

### Restyled `components/shared/` files

These files are imported by existing screens:

| Shared Component | Importing Screens |
| --- | --- |
| `modal-header.tsx` | Save modal, PlannerAdd sheet, IngredientFilter modal, Sort sheet |
| `modal-footer-actions.tsx` | Save modal, PlannerAdd sheet, IngredientFilter modal |
| `selection-chip-rail.tsx` | IngredientFilter modal, PlannerAdd sheet date chips, HOME sort/filter |

Changes are intentional and minor:
- Token-variable swaps (e.g., `--muted` -> `--text-2`) for consistent text hierarchy
- Hardcoded radius values -> token variables for consistency
- Hardcoded alpha backgrounds -> token surface values
- Added subtle shadow and transition effects

**Codex should capture regression screenshots at Stage 5:**

| Screen | Trigger | Required screenshots |
| --- | --- | --- |
| `HOME` | `selection-chip-rail.tsx` restyle | `HOME-before-mobile.png`, `HOME-after-mobile.png`, `HOME-after-narrow-320.png` |
| `RECIPE_DETAIL` | `modal-header.tsx` / `modal-footer-actions.tsx` restyle (modal open state) | `RECIPE_DETAIL-before-mobile.png`, `RECIPE_DETAIL-after-mobile.png`, `RECIPE_DETAIL-after-narrow-320.png` |
| `PLANNER_WEEK` | shared component restyle propagation | `PLANNER_WEEK-before-mobile.png`, `PLANNER_WEEK-after-mobile.png`, `PLANNER_WEEK-after-narrow-320.png` |

If before screenshots are needed for comparison, they should be captured from the current master branch before merging this PR.

## Verification coverage

- `pnpm typecheck` passes (no type errors)
- `pnpm lint` passes (no lint errors)
- All existing TypeScript props interfaces preserved (visual-only changes)
- No `--cook-*` token values changed
- No Jua or prototype-only font imported
- H5 modal decisions honored: icon close (preserved), olive accent (preserved in modal-footer-actions and selection-chip-rail), eyebrow removed (already absent)

## Blocker criteria to check in screenshots

- No horizontal overflow at mobile default or 320px: passed in `capture-summary.json`
- No text clipped inside brand-colored elements: passed by Codex visual inspection
- Existing loading/empty/error/read-only/unauthorized states still present: covered by existing frontend verification and exploratory QA
- Only token/surface/shadow styling visually different (modal chrome, chip rail, footer buttons): intentional

## Captured Evidence

| File | Description |
| --- | --- |
| `component-state-previews-button.png` | Button variants and states |
| `component-state-previews-chip.png` | Filter and selection chip states |
| `component-state-previews-card.png` | Card default/hover/pressed/loading states |
| `component-state-previews-badge.png` | Badge variants |
| `component-state-previews-empty-state.png` | EmptyState default/with-action preview |
| `component-state-previews-error-state.png` | ErrorState default/with-retry preview |
| `component-state-previews-skeleton.png` | Skeleton preview |
| `HOME-before-mobile.png` | HOME before shared component restyle at 390px |
| `HOME-after-mobile.png` | HOME after shared component restyle at 390px |
| `HOME-after-narrow-320.png` | HOME after shared component restyle at 320px |
| `RECIPE_DETAIL-before-mobile.png` | RECIPE_DETAIL before shared component restyle at 390px |
| `RECIPE_DETAIL-after-mobile.png` | RECIPE_DETAIL after shared component restyle at 390px |
| `RECIPE_DETAIL-after-narrow-320.png` | RECIPE_DETAIL after shared component restyle at 320px |
| `PLANNER_WEEK-before-mobile.png` | PLANNER_WEEK before shared component restyle at 390px |
| `PLANNER_WEEK-after-mobile.png` | PLANNER_WEEK after shared component restyle at 390px |
| `PLANNER_WEEK-after-narrow-320.png` | PLANNER_WEEK after shared component restyle at 320px |
| `capture-summary.json` | Capture metadata and horizontal overflow checks |

## Exploratory QA — Pending Stage 5

**This slice is high-risk UI. Exploratory QA has NOT been run by Claude and must be completed by Codex before Ready for Review.**

Codex must:
1. Run an exploratory QA bundle covering all screens that import restyled shared components (HOME, RECIPE_DETAIL, PLANNER_WEEK).
2. Capture component state previews for each new `components/ui/` primitive.
3. Verify no horizontal overflow at mobile default or 320px.
4. Verify no text clipping inside brand-colored elements.
5. Record the exploratory QA eval result in the PR before marking the slice ready.

**Automated regression coverage (Stage 4):** Playwright `qa-visual.spec.ts` visual regression tests cover the home sort menu and ingredient filter modal across 3 viewports (desktop-chrome, mobile-chrome, mobile-ios-small). Snapshots were updated to accept the intentional token-swap styling. All 273 E2E smoke tests pass, confirming no functional regression. All 232 Vitest product tests pass.

**Full `pnpm verify:frontend` pipeline passed:** lint, typecheck, 232 Vitest, Next.js build, 273 E2E smoke, 12 visual regression, a11y, security, Lighthouse.
