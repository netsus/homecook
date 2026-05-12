# Wave1 Planner Meal Add Phase4 Prep

> slice: `wave1-port-planner-meal-add`
> branch: `feature/fe-wave1-port-planner-meal-add`
> prep date: 2026-05-13 KST
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> visual source of truth: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
> functional source of truth: official docs + current MVP service behavior

## Purpose

This prep locks the current Slice C starting point before Phase5 closeout. Historical 2026-05-10 authority evidence remains useful history, but it is not current completion proof for Wave1 exact-mobile parity.

Phase5 may change only Slice C surfaces: PLANNER_WEEK, MENU_ADD and picker states, MANUAL_RECIPE_CREATE, and MEAL_SCREEN. It must preserve MVP route/API/auth behavior and the `{ success, data, error }` API wrapper.

## Current Service Capture

The current service screenshots below were regenerated from `tests/e2e/qa-wave1-planner-meal-add-evidence.spec.ts` with Chromium, DPR 1, and fixed viewport sizes.

| Surface / state | Viewport | Current service screenshot | Fixed reference screenshot | Prep note |
| --- | --- | --- | --- | --- |
| PLANNER_WEEK default | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner.png` | Summary counters, week strip, day cards, add buttons, floating help CTA, and bottom tab align with the fixed reference. |
| PLANNER_WEEK default | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-planner.png` | Narrow viewport keeps page-level width locked and day-card clipping consistent with the reference. |
| PLANNER_WEEK next-week state | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/planner-week-navigation.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner.png` | Supplemental state proving existing week navigation behavior; exact reference has the default week. |
| MENU_ADD sheet | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/planner-meal-add-sheet.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner-meal-add.png` | Sheet height, dimmed planner backdrop, search input, and 2-column option grid align with the fixed reference. |
| MENU_ADD sheet | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/planner-meal-add-sheet-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-planner-meal-add.png` | Narrow sheet keeps the handle, close button, and option grid visible without horizontal overflow. |
| Recipe search picker | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-search-picker.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-search-picker.png` | Picker state uses current MVP recipe fixture data while preserving reference shell geometry. |
| Recipe search picker | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-search-picker-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-search-picker.png` | Narrow picker keeps search, first cards, and bottom tab boundaries visible. |
| Recipe book selector | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-book-selector.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-book-selector.png` | MVP saved/custom book data is used; row geometry matches the picker family. |
| Recipe book selector | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-book-selector-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-book-selector.png` | Narrow selector preserves touch rows and bottom safe area. |
| Recipe book detail picker | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-book-detail-picker.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-book-detail-picker.png` | Recipe rows use MVP fixture data while preserving reference density. |
| Recipe book detail picker | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/recipe-book-detail-picker-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-book-detail-picker.png` | Narrow list remains scrollable and unclipped. |
| Pantry match picker | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/pantry-match-picker.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-match-picker.png` | Pantry match scores and missing ingredient chips remain MVP data-governed. |
| Pantry match picker | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/pantry-match-picker-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-match-picker.png` | Narrow picker keeps row controls within the viewport. |
| Planned servings input | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/planned-servings-input.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planned-servings-input.png` | Sheet remains tied to existing `POST /meals` behavior. |
| Planned servings input | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/planned-servings-input-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-planned-servings-input.png` | Footer CTA stays visible at 320px. |
| MANUAL_RECIPE_CREATE default | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/manual-recipe-create.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-manual-recipe-create.png` | Form sections, dashed add affordance, step editor, and CTA band align with the reference family. |
| MANUAL_RECIPE_CREATE default | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/manual-recipe-create-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-manual-recipe-create.png` | Narrow viewport keeps the fixed form rhythm without page-level overflow. |
| MANUAL_RECIPE_CREATE ingredient modal | element capture | `ui/designs/evidence/wave1-port-planner-meal-add/manual-create-ingredient-modal.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-manual-recipe-create.png` | Supplemental interaction capture proving ingredient search modal focus and multi-select entry. |
| MEAL_SCREEN default | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-meal-screen.png` | Header, summary chips, meal cards, serving stepper, CTA row, trash icon, and bottom tab align with the fixed reference. |
| MEAL_SCREEN default | 320x568 | `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-meal-screen.png` | Narrow card clipping and bottom tab overlap match the reference behavior. |
| MEAL_SCREEN recipe click | 390x844 | `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-recipe-click.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png` | Supplemental functional capture proving recipe title navigation to RECIPE_DETAIL. |

## Prototype vs Service Diff Table

| Surface | Difference class | Current observation | Phase5 direction |
| --- | --- | --- | --- |
| PLANNER_WEEK | browser-rendering-limited | Current capture differs only by tiny PNG byte churn after regeneration; visual layout matches the fixed reference in controlled inspection. | Keep service layout unchanged; preserve deterministic fixture data. |
| MENU_ADD sheet | browser-rendering-limited | Search icon and option emoji antialiasing may differ by renderer, but grid geometry, spacing, and sheet placement match. | No UI repair needed unless current-head CI screenshots reveal a platform-specific drift. |
| MENU_ADD picker states | functional-contract-required | Picker titles, book names, recipe names, and pantry match details use MVP QA fixture data rather than literal prototype data. | Classify data-only differences; do not change official API fields to satisfy visual text. |
| MANUAL_RECIPE_CREATE | functional-contract-required | Ingredient modal is an MVP interaction capture, while the fixed reference is the main manual-create surface. | Keep ingredient-modal evidence supplemental and verify modal behavior through regression tests. |
| MEAL_SCREEN | browser-rendering-limited | Trash icon stroke and thumbnail emoji antialiasing can vary slightly, while card geometry and CTA layout match. | Keep current implementation; watch Linux screenshot baselines in PR CI. |
| Derived states | prototype-derived design | loading/empty/error/unauthorized states are not fixed reference pixel targets. | Use `wave1-derived-state-ui-prep` family and verify behavior through targeted tests. |

## MVP Regression Lock

Verified in this prep run:

- `pnpm exec playwright test tests/e2e/qa-wave1-planner-meal-add-evidence.spec.ts --project=mobile-chrome`
  - 1 test passed
  - Regenerated current service screenshots listed above.
- `pnpm exec vitest run tests/planner-week-screen.test.tsx tests/menu-add-screen.test.tsx tests/meal-screen.test.tsx tests/planner-meal-screen.test.tsx`
  - 4 test files passed
  - 57 tests passed
  - Covers planner week navigation, MENU_ADD option grid, MEAL_SCREEN recipe click/delete/status-selector removal, and planner meal state behavior.

## Phase5 Audit Plan

Phase5 closeout PR must include:

- Reference screenshots from `ui/designs/reference/wave1-fixed-prototype/`.
- Regenerated service screenshots at matching pixel dimensions.
- Screenshot comparison evidence for every exact-reference-ready Slice C surface.
- Computed-style audit covering color, font, type scale, line height, spacing, radius, border, shadow, opacity, and bottom safe-area treatment.
- DOM geometry audit covering app header, summary cards, week strip, day card, add buttons, MENU_ADD sheet/grid, picker rows, manual-create form sections, meal cards, trash icon, CTA row, and bottom tab boundaries.
- Remaining-difference ledger with:
  - visual blockers: `0`
  - unclassified visual differences: `0`
  - any remaining differences classified only as `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, `not-yet-prototyped`, or `prototype-derived design`.

## PR-Ready Evidence Checklist

- [x] Current service screenshots regenerated at 390px and 320px for PLANNER_WEEK, MENU_ADD, MANUAL_RECIPE_CREATE, MEAL_SCREEN, and picker states.
- [x] Screenshot pixel dimensions match fixed references for exact-reference-ready full-screen captures.
- [x] Fixed reference mapping recorded in this prep artifact.
- [x] Prototype-vs-service diff table recorded.
- [x] MVP regression lock recorded with targeted Vitest and Playwright commands.
- [x] Phase5 closeout: screenshot comparison recorded in `ui/designs/evidence/wave1-port-planner-meal-add/phase5-visual-audit.md`.
- [x] Phase5 closeout: computed-style audit recorded in `ui/designs/evidence/wave1-port-planner-meal-add/phase5-visual-audit.md`.
- [x] Phase5 closeout: DOM geometry audit recorded in `ui/designs/evidence/wave1-port-planner-meal-add/phase5-visual-audit.md`.
- [x] Phase5 closeout: remaining-difference ledger reaches visual blockers 0 and unclassified visual differences 0.
- [x] Phase5 closeout: authority report refreshed and Claude final authority gate rerun.
