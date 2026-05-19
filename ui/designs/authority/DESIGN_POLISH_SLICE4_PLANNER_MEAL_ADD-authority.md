# Authority Report: DESIGN_POLISH_SLICE4_PLANNER_MEAL_ADD

> slice: design-polish-slice4-planner-meal-add
> stage: 5
> reviewer: Codex authority fallback (Claude provider limit)
> date: 2026-05-20

## Design Status

**reviewed**

Claude final review was requested through the user-provided resume session
`b475ec3a-c10b-42ae-9c38-1df94982e645` with `model=opus`,
`effort=high`, and `permission_mode=bypassPermissions`, but the Claude CLI
returned `You've hit your limit · resets 6:50am (Asia/Seoul)`. Per the user's
standing instruction, Codex completed the fallback authority review.

## Changes Summary

- PLANNER_WEEK now keeps the current planner context and opens picker flows from
  the meal-add bottom sheet instead of routing search/recipebook/pantry/leftover
  through `/menu-add`.
- MEAL_SCREEN `식사 추가` opens the same option bottom sheet and picker flow on
  mobile, while desktop web keeps the existing MENU_ADD route behavior.
- `/menu-add`, `/menu/add/manual`, and `/menu/add/youtube` remain available as
  direct route fallbacks. `직접 등록` stays route-based; YouTube remains a route
  fallback for slice5's deeper import UX.
- RecipeSearchPicker uses a larger clear magnifier icon with a 44px search
  control target.
- LeftoverPicker cards now place a compact `추가` action on the card right,
  expose `M/D 끼니 N인분` metadata, and use the title `남은 요리에서 추가`.

## Evidence

> evidence:
> - PLANNER_WEEK meal-add sheet mobile default: `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile.png`
> - PLANNER_WEEK meal-add sheet mobile narrow: `ui/designs/evidence/design-polish-slice4-planner-meal-add/PLANNER_WEEK-meal-add-modal-mobile-narrow.png`
> - MEAL_SCREEN meal-add sheet mobile default: `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile.png`
> - MEAL_SCREEN meal-add sheet mobile narrow: `ui/designs/evidence/design-polish-slice4-planner-meal-add/MEAL_SCREEN-meal-add-modal-mobile-narrow.png`
> - Recipe search icon mobile default: `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile.png`
> - Recipe search icon mobile narrow: `ui/designs/evidence/design-polish-slice4-planner-meal-add/RECIPE_SEARCH-icon-mobile-narrow.png`
> - LeftoverPicker cards mobile default: `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile.png`
> - LeftoverPicker cards mobile narrow: `ui/designs/evidence/design-polish-slice4-planner-meal-add/LEFTOVER_PICKER-card-mobile-narrow.png`

## Authority Findings

- **Blockers**: 0
- **Majors**: 0
- **Minors**: 0

Reviewed against `docs/design/mobile-ux-rules.md` and anchor-extension risks:
picker flows avoid URL/page jumps on the requested app surfaces, bottom-sheet
backdrop coverage is opaque enough to keep focus on the active sheet, controls
retain 44px touch targets, and the card/button layout has no visible overlap at
the captured mobile viewport.

Known scope decision: YouTube remains a route fallback in this slice because
the workpack explicitly allows it when full YouTube import modalization would
overlap slice5. This is not counted as a blocker.

## Verification

- `pnpm vitest run tests/menu-add-screen.test.tsx tests/planner-week-screen.test.tsx tests/planner-meal-screen.test.tsx` — passed, 59 tests.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `git diff --check` — passed.
- `pnpm exec playwright test tests/e2e/tmp-design-polish-slice4-evidence.spec.ts --project=mobile-chrome` — passed before the temporary evidence spec was removed; generated the four screenshots listed above.
- `pnpm exec playwright test tests/e2e/tmp-design-polish-slice4-narrow-evidence.spec.ts --project=mobile-chrome` — passed before the temporary evidence spec was removed; generated the four narrow screenshots listed above.
- `pnpm verify:frontend` — passed.

## Verdict

verdict: pass

**PASS** — `confirmed_allowed: true`

Proceed to Stage 6 closeout after full frontend verification and workflow
validators pass.
