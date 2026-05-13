# Phase 2 Anchor Design Handoff

Author: Claude, implemented by Codex
Date: 2026-05-13
Status: Implemented and verified
Target: `ui/designs/prototypes/claude-design-260512-desktop/`
Plan reference: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
Ledger reference: `PHASE0_PARITY_LEDGER.md`

## Scope

Phase 2 closes the three anchor screens:

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`

Cross-cutting auth, sort/filter modal completion, recipebook/MyPage/settings, pantry/shopping, and cooking surfaces remain owned by later phases in the Phase 0 ledger.

## Claude Design Decision

Claude returned `READY_FOR_CODEX` for the Phase 2 anchor design spec.

The accepted approach was to keep Phase 1 primitives intact and add a reversible `styles-phase2.css` layer after `styles-phase1.css`, with only two small JSX structure changes:

- Wrap the HOME search bar and filter row in `.discovery-search-row`.
- Add `.today-col` to planner cells and remove thumbnail status dots from planner meal cards.

## Screen Specs

### HOME

- Compress the discovery area so recipe cards are visible on initial desktop view.
- Use a 3 / 4 / 5 column recipe grid at `1024`, `1280`, and `1440`.
- Keep card metadata on one line with block-level ellipsis instead of flex wrapping.
- Preserve sort/filter entry points without implementing Phase 3 modal completion.

### RECIPE_DETAIL

- Keep the two-column detail shell and sticky action rail from Phase 1.
- Reduce the photo mosaic to a tighter `420px` height.
- Add missing styles for tag rows, metrics, secondary actions, serving stepper, held ingredients, method pills, pantry summary, and rail internals.
- Preserve save, planner add, lightbox, and cook notice triggers.

### PLANNER_WEEK

- Keep the calendar grid as the primary visual surface.
- Reduce cells to `96px` min-height so the week remains scannable above the fold.
- Keep the sidebar sticky on desktop and static under the existing `1180px` collapse.
- Replace thumbnail status dots with a readable `3px` left status border.
- Add a subtle today-column tint.

## Implementation Files

- `project/homecook desktop prototype.html`
- `project/screens-1.jsx`
- `project/screens-2.jsx`
- `project/styles-phase2.css`
- `PHASE0_PARITY_LEDGER.md`

## Evidence

Evidence root: `ui/designs/evidence/desktop-modern-redesign/phase-2/`

- `home-1024.png`
- `home-1280.png`
- `home-1440.png`
- `recipe-detail-1024.png`
- `recipe-detail-1280.png`
- `recipe-detail-1440.png`
- `planner-week-1024.png`
- `planner-week-1280.png`
- `planner-week-1440.png`
- `visual-qa-report.json`

The Playwright visual QA report passed with zero failures. The only console warning observed is the expected prototype-only Babel-in-browser warning.

## Remaining Phase Boundaries

- Phase 3 still owns `LOGIN`, full `LoginGate`, `SaveModal`, `PlannerAddModal`, `IngredientFilterModal`, `Lightbox`, `ConfirmDialog`, and sort/filter completion.
- Phase 5 still owns recipebook, MyPage, and settings closure.
- Phase 6 still owns pantry and shopping closure.
- Phase 7 still owns cooking, leftovers, and ate-list closure.
