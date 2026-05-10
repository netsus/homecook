# Authority Report: WAVE1_PLANNER_MEAL_ADD

> slice: wave1-port-planner-meal-add
> stage: 5
> reviewer: Codex authority_precheck + Claude final authority gate
> date: 2026-05-10

## Design Status

**confirmed**

Claude final authority gate reviewed all 8 evidence screenshots against product-design-authority.md blocker criteria and planner-specific heuristics. Blocker count: 0. All screens pass overflow, CTA visibility, touch target, information structure, and anchor pattern checks at both 390px and 320px viewports.

## Changes Summary

### PLANNER_WEEK (anchor-extension)
- SLOT_EMOJI removal: slot rows render column name as text only (13px bold), no emoji
- STATUS_META removal: status badges removed from slot rows; status data preserved in meal objects for logic
- CTA grid: `grid-cols-3` -> `grid-cols-2`, `요리하기` link removed; remaining: `장보기` + `남은요리`
- Shopping CTA: top toolbar keeps `"장보기"` and the duplicate floating shopping CTA is removed to avoid overlapping meal cards
- Empty slot: dashed "식사 추가" -> solid brand-styled `"+ 음식"`
- Filled slot: chevron replaced with `"+ 음식"` branded button
- Empty thumbnail: emoji fallback -> first character of column name
- Week navigation: desktop-only buttons -> unified nav on all viewports (chevron icons on mobile, text labels on sm+)
- "이번주로 가기" -> "이번주로"

### MENU_ADD
- Heading: "다른 방법으로 추가" -> "추가 방법 선택"
- Option grid: flat buttons -> 2-column grid with emoji icon (44x44 on brand-soft bg) + label (14px bold) + subtitle (11px text-3)
- 6 options defined: search, recipebook, pantry, leftover, youtube, manual
- Search option is included in the 2x3 grid; tapping it focuses the RecipeSearchPicker input above the grid
- data-testid: `menu-add-option-grid` on container, `menu-add-option-${id}` on each button

### MEAL_SCREEN
- Status badge: completely removed (StatusBadge component + STATUS_META removed)
- Delete: text "삭제" button -> absolute-positioned trash SVG icon (top-right, 44x44 touch target, rounded-full, surface-fill bg)
- Recipe title: `<p>` -> `<button>` with `onRecipeClick` -> `router.push(/recipe/${meal.recipe_id})`
- Title clearance: `w-full` + `pr-12` to avoid overlap with trash icon
- data-testid: `meal-delete-${meal.id}`, `meal-recipe-link-${meal.id}`

### MANUAL_CREATE (recipe-ingredient-add-modal)
- Search input: added `autoFocus` + `ref={searchInputRef}` for immediate keyboard focus

## Token Usage

Production tokens only:
- `--brand`, `--brand-deep`, `--brand-soft`, `--olive`, `--foreground`, `--surface`, `--surface-fill`, `--panel`, `--line`, `--muted`, `--text-3`
- `--radius-sm`, `--radius-md`, `--radius-full`, `--radius-lg`, `--radius-xl`
- `--shadow-1`, `--shadow-2`

No prototype mint/Jua/asset leakage.

## Risk Assessment

- **Risk class**: anchor-extension (PLANNER_WEEK is anchor screen)
- SLOT_EMOJI removal: visual only, no data model change
- STATUS_META removal: visual only; status data preserved in meal objects; serving change confirmation still checks `meal.status === "shopping_done" || "cook_done"`
- CTA reduction (3 -> 2): `요리하기` CTA removed from planner-level toolbar; cooking access preserved via recipe detail flow
- Week nav unified: mobile+desktop now have same buttons; responsive styling via `sm:` breakpoint classes
- Recipe click routing: new navigation path from MEAL_SCREEN -> RECIPE_DETAIL using existing route
- Delete icon: touch target maintained at 44x44px; accessibility preserved with `aria-label`

## Test Coverage

### Vitest
- `tests/planner-week-screen.test.tsx`: Wave1 planner emoji/status/CTA/week-nav coverage
- `tests/planner-meal-screen.test.tsx`: MEAL_SCREEN status badge removal contract updated
- `tests/menu-add-screen.test.tsx`: 2x3 option grid, search option focus, leftover option coverage
- `tests/meal-screen.test.tsx`: Wave1 recipe click, trash icon, no status, delete flow

### Playwright E2E
- `tests/e2e/slice-05-planner-week-core.spec.ts`: updated for 2-col CTA, no status badges, unified week nav
- `tests/e2e/slice-07-meal-manage.spec.ts`: updated status badge removal + 3 new Wave1 tests (recipe click, trash icon, no status)
- `tests/e2e/slice-08a-meal-add-search.spec.ts`: narrowed "추가" selector after the 2x3 MENU_ADD option grid introduced `남은요리에서 추가`
- `tests/e2e/slice-08b-meal-add-books-pantry.spec.ts`: same narrowed servings-modal "추가" selector for recipebook/pantry flows
- `tests/e2e/slice-12a-shopping-complete.spec.ts`: planner remains usable after shopping completion without visual status badge
- `tests/e2e/slice-14-cook-session-start.spec.ts`: planner-level `요리하기` CTA removal locked

## Evidence

> evidence:
> - PLANNER_WEEK mobile 390: `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-default.png`
> - PLANNER_WEEK mobile 320: `ui/designs/evidence/wave1-port-planner-meal-add/planner-mobile-narrow.png`
> - PLANNER_WEEK week nav: `ui/designs/evidence/wave1-port-planner-meal-add/planner-week-navigation.png`
> - MENU_ADD option grid: `ui/designs/evidence/wave1-port-planner-meal-add/menu-add-option-grid.png`
> - MANUAL_CREATE ingredient modal: `ui/designs/evidence/wave1-port-planner-meal-add/manual-create-ingredient-modal.png`
> - MEAL_SCREEN mobile 390: `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-default.png`
> - MEAL_SCREEN mobile 320: `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-narrow.png`
> - MEAL_SCREEN recipe click: `ui/designs/evidence/wave1-port-planner-meal-add/meal-screen-recipe-click.png`

## Verification

- `pnpm verify:frontend` — passed
- `pnpm exec playwright test tests/e2e/qa-wave1-planner-meal-add-evidence.spec.ts --project=desktop-chrome` — passed, generated 8 evidence screenshots
- `pnpm exec playwright test tests/e2e/slice-05-planner-week-core.spec.ts tests/e2e/slice-07-meal-manage.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` — passed
- `pnpm exec playwright test tests/e2e/slice-08a-meal-add-search.spec.ts tests/e2e/slice-08b-meal-add-books-pantry.spec.ts tests/e2e/slice-12a-shopping-complete.spec.ts tests/e2e/slice-14-cook-session-start.spec.ts --project=desktop-chrome` — passed
- `pnpm qa:eval -- --checklist .artifacts/qa/wave1-port-planner-meal-add/2026-05-10T00-32-50-753Z/exploratory-checklist.json --report .artifacts/qa/wave1-port-planner-meal-add/2026-05-10T00-32-50-753Z/exploratory-report.json` — passed, score 100

## Scorecard

| Dimension | Score |
|-----------|-------|
| Mobile UX | 4/5 |
| Interaction Clarity | 4/5 |
| Visual Hierarchy | 4/5 |
| Color/Material Fit | 5/5 |
| Familiar App Pattern Fit | 4/5 |

## Verdict

verdict: pass

**PASS** — `confirmed_allowed: true`

- **Blockers**: 0
- **Majors**: 0
- **Minors**: 2
  1. Stats summary section (`이번 주 N끼 계획 중` + 3 counters) occupies vertical space before meal content. Acceptable for current scope; revisit if more sections are added above day cards.
  2. On 320px narrow viewport, week strip + nav area pushes day cards below the fold. Acceptable given the density of controls needed.

Codex precheck found 0 unresolved blockers after repairs. Claude final authority gate confirmed blocker 0 after reviewing all 8 evidence screenshots against product-design-authority.md blocker criteria and planner-specific heuristics.

Next action: proceed to merge.
