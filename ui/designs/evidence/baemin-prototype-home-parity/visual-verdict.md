# Visual Verdict: baemin-prototype-home-parity

> Surface: HOME
> Captured: 2026-04-28
> Viewports: 390x844 (70%), 320x568 (30%)
> Threshold: 95
> Method: h7 direction gate 5-axis scoring

## Verdict

| Metric | Value |
| --- | --- |
| Screen score (390px) | 97.29 |
| Screen score (320px) | 96.29 |
| **Slice score** | **96.99** |
| Threshold | 95 |
| Pass | Yes |
| Blocker count | 0 |
| Waiver | None required |

## Score Breakdown by State

### 390px Viewport

| State | Skin /25 | Layout /30 | Interaction /20 | Assets/Copy /10 | State Fidelity /15 | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| initial | 24 | 29 | 20 | 10 | 15 | 98 |
| scrolled-to-recipes-entry | 24 | 29 | 20 | 10 | 15 | 98 |
| sort-open | 24 | 29 | 19 | 10 | 15 | 97 |
| filter-active | 24 | 29 | 19 | 10 | 15 | 97 |
| loading | 24 | 29 | 20 | 10 | 14 | 97 |
| empty | 24 | 29 | 20 | 10 | 14 | 97 |
| error | 24 | 29 | 20 | 10 | 14 | 97 |
| **Average** | | | | | | **97.29** |

### 320px Viewport

| State | Skin /25 | Layout /30 | Interaction /20 | Assets/Copy /10 | State Fidelity /15 | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| initial | 24 | 28 | 20 | 10 | 15 | 97 |
| scrolled-to-recipes-entry | 24 | 28 | 20 | 10 | 15 | 97 |
| sort-open | 24 | 28 | 19 | 10 | 15 | 96 |
| filter-active | 24 | 28 | 19 | 10 | 15 | 96 |
| loading | 24 | 28 | 20 | 10 | 14 | 96 |
| empty | 24 | 28 | 20 | 10 | 14 | 96 |
| error | 24 | 28 | 20 | 10 | 14 | 96 |
| **Average** | | | | | | **96.29** |

## Scoring Notes

### Skin (-1 per viewport)

- Brand color approved divergence: production `--brand #ED7470` vs prototype `--brand #2AC1BC`. Not penalized per token-material-mapping.md.
- Background tone approved divergence: production `--background #fff9f2` vs prototype `#FFFFFF`. Not penalized.
- Foreground tone: production `--foreground #1a1a2e` vs prototype `#212529`. Minimal. Not penalized.
- Olive vs teal: production `--olive #1f6b52` vs prototype `#12B886`. Not penalized.
- Minor skin deduction (-1): Font stack difference (Avenir Next / Pretendard vs system sans-serif). Approved divergence, minimal 1-point deduction for subtle rendering differences.

### Layout (-1 at 320px)

- At 390px: Layout fully matches prototype card grid, section spacing, carousel strip geometry.
- At 320px: -1 for narrow viewport layout reflow — some text wrapping differences at extreme narrow width. No structural layout issue.

### Interaction (-1 for sort-open, filter-active)

- Sort sheet: production uses h5 modal system bottom sheet overlay. Prototype uses tab-like sort control. Per prototype-exclusion-inventory.md, this semantic drift is noted but not scored as a deficit. Minor -1 for visual treatment difference in sort sheet chrome.
- Filter active: production uses modal-based ingredient filter with summary bar. Prototype uses inline chips (excluded). -1 for summary bar visual weight difference vs prototype's inline approach.

### State Fidelity (-1 for loading, empty, error)

- Prototype does not support loading/empty/error states — prototype layer N/A for these states.
- -1 deduction per state because direct prototype comparison is not possible. Production states use shared ContentState and Skeleton components that follow the design system.

## Approved Divergences (Not Penalized)

Per `token-material-mapping.md` Approved Production Divergences:

1. Brand color family: `#ED7470` (warm coral) vs `#2AC1BC` (mint)
2. Background tone: `#fff9f2` (warm cream) vs `#FFFFFF` (white)
3. Foreground tone: `#1a1a2e` vs `#212529`
4. Font stack: Avenir Next / Pretendard vs system-only (no Jua)
5. Olive vs teal: `#1f6b52` vs `#12B886`

## Prototype-Only Exclusions (Not Scored as Deficits)

Per `prototype-exclusion-inventory.md`:

- Hero greeting ("오늘은 뭐 해먹지?")
- Promo strip (플래너 안내 배너)
- Bottom tab bar (4 tabs)
- Inline ingredient chips (production uses modal)
- Jua font
- Pantry/MyPage links

## Capture Evidence

All captures at `qa/visual/parity/baemin-prototype-home-parity/`:

### 3-Way Capture Matrix

| Viewport | State | Current | After | Prototype |
| --- | --- | --- | --- | --- |
| 390 | initial | `390-HOME-initial-current.png` | `390-HOME-initial-after.png` | `390-HOME-initial-prototype.png` |
| 390 | scrolled-to-recipes-entry | `390-HOME-scrolled-to-recipes-entry-current.png` | `390-HOME-scrolled-to-recipes-entry-after.png` | `390-HOME-scrolled-to-recipes-entry-prototype.png` |
| 390 | sort-open | `390-HOME-sort-open-current.png` | `390-HOME-sort-open-after.png` | `390-HOME-sort-open-prototype.png` |
| 390 | filter-active | `390-HOME-filter-active-current.png` | `390-HOME-filter-active-after.png` | `390-HOME-filter-active-prototype.png` |
| 390 | loading | `390-HOME-loading-current.png` | `390-HOME-loading-after.png` | N/A |
| 390 | empty | `390-HOME-empty-current.png` | `390-HOME-empty-after.png` | N/A |
| 390 | error | `390-HOME-error-current.png` | `390-HOME-error-after.png` | N/A |
| 320 | initial | `320-HOME-initial-current.png` | `320-HOME-initial-after.png` | `320-HOME-initial-prototype.png` |
| 320 | scrolled-to-recipes-entry | `320-HOME-scrolled-to-recipes-entry-current.png` | `320-HOME-scrolled-to-recipes-entry-after.png` | `320-HOME-scrolled-to-recipes-entry-prototype.png` |
| 320 | sort-open | `320-HOME-sort-open-current.png` | `320-HOME-sort-open-after.png` | `320-HOME-sort-open-prototype.png` |
| 320 | filter-active | `320-HOME-filter-active-current.png` | `320-HOME-filter-active-after.png` | `320-HOME-filter-active-prototype.png` |
| 320 | loading | `320-HOME-loading-current.png` | `320-HOME-loading-after.png` | N/A |
| 320 | empty | `320-HOME-empty-current.png` | `320-HOME-empty-after.png` | N/A |
| 320 | error | `320-HOME-error-current.png` | `320-HOME-error-after.png` | N/A |

### Layer Totals

| Layer | Count | Notes |
| --- | --- | --- |
| Current | 14 | All 7 states x 2 viewports. Captured from `origin/master` via temp worktree. |
| After | 14 | All 7 states x 2 viewports. Captured from feature branch. |
| Prototype | 8 | 4 feasible states x 2 viewports. Loading/empty/error are N/A (prototype has no fetch delay, hardcoded demo data, no error path). |
| **Total** | **36** | |

## Capture Method

- **Current layer**: Captured via `scripts/capture-home-parity-evidence.mjs --layer current` with `PARITY_BASE_URL=http://localhost:3099` against a dev server started from a temporary git worktree at `origin/master`. Worktree was created outside the repo (`/tmp/homecook-home-parity-current-*`) and removed after capture.
- **After layer**: Captured via `scripts/capture-home-parity-evidence.mjs --layer after` using Playwright against local dev server on the feature branch with mock API routes.
- **Prototype layer**: Captured via `scripts/capture-home-parity-evidence.mjs --layer prototype` from `ui/designs/prototypes/homecook-baemin-prototype.html` opened as a local file in headless Chromium. After React render, the script normalizes the showcase layout: the side panel (screen navigation, quick flows) is hidden, wrapper padding/gap removed, and the iOS device shell is CSS-transformed to fill the viewport exactly (390×844 or 320×568). Viewport-clipped screenshots (`fullPage: false`) produce captures at exact viewport dimensions containing only the mobile device content. States without prototype support (loading, empty, error) are `null` — the prototype renders instantly with hardcoded demo data and has no fetch/error simulation.

## OS-Specific Snapshot Note

Darwin-platform visual regression snapshots updated locally. Linux-platform snapshots (CI reference) require Codex/CI follow-up to regenerate.
