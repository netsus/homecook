# Visual Verdict: baemin-prototype-recipe-detail-parity

> Surface: RECIPE_DETAIL
> Captured: 2026-04-28
> Viewports: 390x844 (70%), 320x568 (30%)
> Threshold: 95
> Method: h7 direction gate 5-axis scoring

## Verdict

| Metric | Value |
| --- | --- |
| Screen score (390px) | 96.86 |
| Screen score (320px) | 95.86 |
| **Slice score** | **96.56** |
| Threshold | 95 |
| Pass | Yes |
| Blocker count | 0 |
| Waiver | None required |

## Score Breakdown by State

### 390px Viewport

| State | Skin /25 | Layout /30 | Interaction /20 | Assets/Copy /10 | State Fidelity /15 | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| initial | 24 | 29 | 20 | 10 | 15 | 98 |
| scrolled | 24 | 29 | 20 | 10 | 15 | 98 |
| planner-add-open | 24 | 29 | 19 | 10 | 14 | 96 |
| save-open | 24 | 29 | 19 | 10 | 14 | 96 |
| login-gate-open | 24 | 29 | 19 | 10 | 14 | 96 |
| loading | 24 | 29 | 20 | 10 | 14 | 97 |
| error | 24 | 29 | 20 | 10 | 14 | 97 |
| **Average** | | | | | | **96.86** |

### 320px Viewport

| State | Skin /25 | Layout /30 | Interaction /20 | Assets/Copy /10 | State Fidelity /15 | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| initial | 24 | 28 | 20 | 10 | 15 | 97 |
| scrolled | 24 | 28 | 20 | 10 | 15 | 97 |
| planner-add-open | 24 | 28 | 19 | 10 | 14 | 95 |
| save-open | 24 | 28 | 19 | 10 | 14 | 95 |
| login-gate-open | 24 | 28 | 19 | 10 | 14 | 95 |
| loading | 24 | 28 | 20 | 10 | 14 | 96 |
| error | 24 | 28 | 20 | 10 | 14 | 96 |
| **Average** | | | | | | **95.86** |

## Scoring Notes

### Skin (-1 per viewport)

- Brand color approved divergence: production `--brand #ED7470` vs prototype `--brand #2AC1BC`. Not penalized per token-material-mapping.md.
- Background tone approved divergence: production `--background #fff9f2` vs prototype `#FFFFFF`. Not penalized.
- Foreground tone: production `--foreground #1a1a2e` vs prototype `#212529`. Minimal. Not penalized.
- Olive vs teal: production `--olive #1f6b52` vs prototype `#12B886`. Not penalized.
- Minor skin deduction (-1): Font stack difference (Avenir Next / Pretendard vs system sans-serif). Approved divergence, minimal 1-point deduction for subtle rendering differences.

### Layout (-1 at 320px)

- At 390px: Layout matches prototype hero (4:3 aspect), flat sections with border-bottom, compact stepper, ingredient rows, and left-bordered step cards.
- At 320px: -1 for narrow viewport layout reflow. The candidate uses a 16:9 hero sentinel override, one-line utility row, and two-column CTA row so primary actions clear the fixed bottom tabs. This is an approved mobile-usability correction, not a blocker.

### Interaction (-1 for planner-add-open, save-open, login-gate-open)

- Planner add sheet: production uses bottom sheet overlay for planner column/date selection. Prototype has inline CTA with no overlay. Minor -1 for visual treatment difference in sheet chrome.
- Save modal: production uses modal overlay for recipe book selection. Prototype uses inline bookmark toggle with no modal. Minor -1 for visual treatment difference.
- Login gate: production uses modal overlay for auth prompt. Prototype has no auth gate (all actions always available). Minor -1 for presence of auth gate chrome.

### State Fidelity (-1 for planner-add-open, save-open, login-gate-open, loading, error)

- Prototype does not support planner-add-open, save-open, login-gate-open, loading, error states — prototype layer N/A for these states.
- -1 deduction per state because direct prototype comparison is not possible. Production states use shared PlannerAddSheet, SaveModal, LoginGateModal, ContentState, and Skeleton components that follow the design system.

## Approved Divergences (Not Penalized)

Per `token-material-mapping.md` Approved Production Divergences:

1. Brand color family: `#ED7470` (warm coral) vs `#2AC1BC` (mint)
2. Background tone: `#fff9f2` (warm cream) vs `#FFFFFF` (white)
3. Foreground tone: `#1a1a2e` vs `#212529`
4. Font stack: Avenir Next / Pretendard vs system-only (no Jua)
5. Olive vs teal: `#1f6b52` vs `#12B886`

## Prototype-Only Exclusions (Not Scored as Deficits)

Per `prototype-exclusion-inventory.md` RECIPE_DETAIL exclusions:

- Tab switcher (ingredients/steps/reviews tabs)
- Reviews section and review cards
- Review count badge
- Star rating input
- Floating hero overlay buttons (back, like, bookmark) — production uses AppHeader + inline utility actions

## Capture Evidence

All captures at `qa/visual/parity/baemin-prototype-recipe-detail-parity/`:

### 3-Way Capture Matrix

| Viewport | State | Current | After | Prototype |
| --- | --- | --- | --- | --- |
| 390 | initial | `390-RECIPE_DETAIL-initial-current.png` | `390-RECIPE_DETAIL-initial-after.png` | `390-RECIPE_DETAIL-initial-prototype.png` |
| 390 | scrolled | `390-RECIPE_DETAIL-scrolled-current.png` | `390-RECIPE_DETAIL-scrolled-after.png` | `390-RECIPE_DETAIL-scrolled-prototype.png` |
| 390 | planner-add-open | `390-RECIPE_DETAIL-planner-add-open-current.png` | `390-RECIPE_DETAIL-planner-add-open-after.png` | N/A |
| 390 | save-open | `390-RECIPE_DETAIL-save-open-current.png` | `390-RECIPE_DETAIL-save-open-after.png` | N/A |
| 390 | login-gate-open | `390-RECIPE_DETAIL-login-gate-open-current.png` | `390-RECIPE_DETAIL-login-gate-open-after.png` | N/A |
| 390 | loading | `390-RECIPE_DETAIL-loading-current.png` | `390-RECIPE_DETAIL-loading-after.png` | N/A |
| 390 | error | `390-RECIPE_DETAIL-error-current.png` | `390-RECIPE_DETAIL-error-after.png` | N/A |
| 320 | initial | `320-RECIPE_DETAIL-initial-current.png` | `320-RECIPE_DETAIL-initial-after.png` | `320-RECIPE_DETAIL-initial-prototype.png` |
| 320 | scrolled | `320-RECIPE_DETAIL-scrolled-current.png` | `320-RECIPE_DETAIL-scrolled-after.png` | `320-RECIPE_DETAIL-scrolled-prototype.png` |
| 320 | planner-add-open | `320-RECIPE_DETAIL-planner-add-open-current.png` | `320-RECIPE_DETAIL-planner-add-open-after.png` | N/A |
| 320 | save-open | `320-RECIPE_DETAIL-save-open-current.png` | `320-RECIPE_DETAIL-save-open-after.png` | N/A |
| 320 | login-gate-open | `320-RECIPE_DETAIL-login-gate-open-current.png` | `320-RECIPE_DETAIL-login-gate-open-after.png` | N/A |
| 320 | loading | `320-RECIPE_DETAIL-loading-current.png` | `320-RECIPE_DETAIL-loading-after.png` | N/A |
| 320 | error | `320-RECIPE_DETAIL-error-current.png` | `320-RECIPE_DETAIL-error-after.png` | N/A |

### Layer Totals

| Layer | Count | Notes |
| --- | --- | --- |
| Current | 14 | All 7 states x 2 viewports. Captured from `origin/master` via temp worktree. |
| After | 14 | All 7 states x 2 viewports. Captured from feature branch. |
| Prototype | 4 | 2 feasible states (initial, scrolled) x 2 viewports. planner-add-open/save-open/login-gate-open/loading/error are N/A (prototype has inline actions, no auth gate, no fetch delay, no error path). |
| **Total** | **32** | |

## Capture Method

- **Current layer**: Captured via `scripts/capture-recipe-detail-parity-evidence.mjs --layer current` with `PARITY_BASE_URL=http://localhost:3099` against a dev server started from a temporary git worktree at `origin/master`. Worktree was created outside the repo and removed after capture.
- **After layer**: Captured via `scripts/capture-recipe-detail-parity-evidence.mjs --layer after` using Playwright against local dev server on the feature branch with mock API routes.
- **Prototype layer**: Captured via `scripts/capture-recipe-detail-parity-evidence.mjs --layer prototype` from `ui/designs/prototypes/homecook-baemin-prototype.html`. After React render, the script navigates to the recipe detail screen, normalizes the showcase layout (hide side panel, CSS-transform device shell to fill viewport), and captures. States without prototype support are `null`.

## OS-Specific Snapshot Note

Darwin-platform visual regression snapshots updated locally. Linux-platform snapshots (CI reference) require Codex/CI follow-up to regenerate.
