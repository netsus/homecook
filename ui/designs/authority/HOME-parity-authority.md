# HOME Prototype Parity — Authority Report

> Superseded note (2026-04-28): HOME 실화면 포팅 기준은 `ui/designs/authority/HOME-prototype-porting-authority.md`가 우선한다. 이 문서는 `baemin-prototype-home-parity` 당시의 scored parity evidence로 보존하며, 당시 제외했던 hero greeting, promo strip, inline ingredient chips, HOME bottom tab은 `baemin-prototype-home-porting`에서 HOME 포팅 대상으로 승격되었다.

> Slice: `baemin-prototype-home-parity`
> Classification: `anchor-extension`
> Stage: 4 (Frontend Implementation)
> Date: 2026-04-28
> Reviewer: Claude (Stage 4 implementer)
> Branch: `feature/fe-baemin-prototype-home-parity`
> Visual verdict: `ui/designs/evidence/baemin-prototype-home-parity/visual-verdict.json`
> Capture evidence: `qa/visual/parity/baemin-prototype-home-parity/`
> evidence:
> - `qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-after.png`
> - `qa/visual/parity/baemin-prototype-home-parity/320-HOME-initial-after.png`
> - `qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-prototype.png`
> - `qa/visual/parity/baemin-prototype-home-parity/320-HOME-initial-prototype.png`
> - `qa/visual/parity/baemin-prototype-home-parity/390-HOME-sort-open-after.png`
> - `qa/visual/parity/baemin-prototype-home-parity/320-HOME-sort-open-after.png`
> - `qa/visual/parity/baemin-prototype-home-parity/390-HOME-filter-active-after.png`
> - `qa/visual/parity/baemin-prototype-home-parity/320-HOME-filter-active-after.png`

---

## Verdict: PASS

Slice score **96.99** >= threshold **95**. Authority blocker count: **0**.

The HOME screen body has been updated to near-100% visual parity with the Baemin prototype. All 7 required states captured at both viewports. Production HOME information architecture is fully preserved. No API, DB, status, or dependency changes.

---

## Score Summary

| Metric | Value |
| --- | --- |
| Screen score (390px) | 97.29 |
| Screen score (320px) | 96.29 |
| Slice score (70/30 weighted) | 96.99 |
| Threshold | 95 |
| Blocker count | 0 |

## Evidence

### After Layer — 390px Captures

| # | State | Path |
|---|-------|------|
| E1 | initial | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-after.png` |
| E2 | scrolled-to-recipes-entry | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-scrolled-to-recipes-entry-after.png` |
| E3 | sort-open | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-sort-open-after.png` |
| E4 | filter-active | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-filter-active-after.png` |
| E5 | loading | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-loading-after.png` |
| E6 | empty | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-empty-after.png` |
| E7 | error | `qa/visual/parity/baemin-prototype-home-parity/390-HOME-error-after.png` |

### After Layer — 320px Captures

| # | State | Path |
|---|-------|------|
| E8 | initial | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-initial-after.png` |
| E9 | scrolled-to-recipes-entry | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-scrolled-to-recipes-entry-after.png` |
| E10 | sort-open | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-sort-open-after.png` |
| E11 | filter-active | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-filter-active-after.png` |
| E12 | loading | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-loading-after.png` |
| E13 | empty | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-empty-after.png` |
| E14 | error | `qa/visual/parity/baemin-prototype-home-parity/320-HOME-error-after.png` |

### Current Layer (Baseline from `origin/master`)

| # | State | 390px | 320px |
|---|-------|-------|-------|
| C1 | initial | `390-HOME-initial-current.png` | `320-HOME-initial-current.png` |
| C2 | scrolled-to-recipes-entry | `390-HOME-scrolled-to-recipes-entry-current.png` | `320-HOME-scrolled-to-recipes-entry-current.png` |
| C3 | sort-open | `390-HOME-sort-open-current.png` | `320-HOME-sort-open-current.png` |
| C4 | filter-active | `390-HOME-filter-active-current.png` | `320-HOME-filter-active-current.png` |
| C5 | loading | `390-HOME-loading-current.png` | `320-HOME-loading-current.png` |
| C6 | empty | `390-HOME-empty-current.png` | `320-HOME-empty-current.png` |
| C7 | error | `390-HOME-error-current.png` | `320-HOME-error-current.png` |

Captured from a temporary git worktree at `origin/master` with dev server on port 3099.

### Prototype Layer (from `homecook-baemin-prototype.html`)

| # | State | 390px | 320px |
|---|-------|-------|-------|
| P1 | initial | `390-HOME-initial-prototype.png` | `320-HOME-initial-prototype.png` |
| P2 | scrolled-to-recipes-entry | `390-HOME-scrolled-to-recipes-entry-prototype.png` | `320-HOME-scrolled-to-recipes-entry-prototype.png` |
| P3 | sort-open | `390-HOME-sort-open-prototype.png` | `320-HOME-sort-open-prototype.png` |
| P4 | filter-active | `390-HOME-filter-active-prototype.png` | `320-HOME-filter-active-prototype.png` |
| — | loading | N/A | N/A |
| — | empty | N/A | N/A |
| — | error | N/A | N/A |

Prototype N/A rationale: the prototype is a static HTML demo with hardcoded data — it renders instantly (no loading skeleton), always shows recipes (no empty state), and has no fetch failure path (no error state).

### Capture Completeness

| Layer | Files | States | Notes |
|-------|-------|--------|-------|
| Current | 14 | 7 x 2 viewports | Complete |
| After | 14 | 7 x 2 viewports | Complete |
| Prototype | 8 | 4 feasible x 2 viewports | 3 states (loading/empty/error) N/A |
| **Total** | **36** | | |

---

## Parity Implementation Changes

### Files Modified

| File | Change Summary |
| --- | --- |
| `components/home/home-screen.tsx` | Discovery panel flattened (no bordered glass-panel), pill-shaped search bar with SearchIcon, standalone ingredient filter button with brand-soft active state, text-only sort control, theme carousel with "전체보기 ›" link, separated count from h2 for a11y |
| `components/home/recipe-card.tsx` | Card radius from rounded-lg to rounded-md (12px), 16:9 aspect ratio thumbnail, conditional badge (🔥 인기 for save_count > 100), reordered layout (title → meta → tags), prototype-style meta row and tag pills |
| `tests/recipe-card.test.tsx` | Test rewritten to match new card structure (h3 heading, regex-based servings check, source badge localized label check) |
| `tests/e2e/qa-visual.spec.ts-snapshots/` | 6 darwin HOME visual regression snapshots regenerated |

### 5-Axis Parity Alignment

| Axis | Weight | Implementation |
| --- | --- | --- |
| Skin (25) | Color tokens applied, typography scale matched, radius/shadow/spacing aligned with prototype | `--surface-fill` search bar bg, `--shadow-2` card shadow, `--muted` secondary text, `--brand-soft`/`--brand-deep` active filter |
| Layout (30) | Flat discovery panel, pill search bar, standalone filter button, separated count sibling, 160px carousel cards, 16:9 card thumbnails | Matches prototype section geometry |
| Interaction (20) | Sort sheet, ingredient filter modal, carousel scroll snap, search — all preserve existing behavior with prototype-aligned visual treatment | h5 modal system preserved |
| Assets/Copy (10) | SearchIcon SVG, "전체보기 ›" link text, "🔥 인기" badge, localized source labels | Production copy preserved |
| State Fidelity (15) | All 7 required states (initial, scrolled, sort-open, filter-active, loading, empty, error) captured and scored | Skeleton/ContentState patterns match design system |

---

## Production IA Preservation Check

- [x] Common brand header: preserved (no changes to app-header.tsx)
- [x] Search bar: preserved (pill shape change is visual only, same functionality)
- [x] Ingredient filter button: preserved (standalone row, opens INGREDIENT_FILTER_MODAL)
- [x] Theme carousel section: preserved (horizontal scroll strip with scroll-snap)
- [x] "모든 레시피" section + sort: preserved (section header + sort button + grid)
- [x] Recipe card grid: preserved (responsive grid, card structure intact)
- [x] Loading/Empty/Error states: preserved (shared components, visual-only changes)

## Contract Preservation Check

- [x] No API endpoint changes
- [x] No DB schema changes
- [x] No status value changes
- [x] No new npm dependencies
- [x] No source-of-truth document changes
- [x] No IA/navigation flow changes

## Prototype-Only Exclusions Verified

- [x] Hero greeting ("오늘은 뭐 해먹지?"): not present in production, not scored as deficit
- [x] Promo strip (플래너 안내 배너): not present, not scored
- [x] Bottom tab bar: not present, not scored
- [x] Inline ingredient chips: production uses modal, not scored
- [x] Jua font: not used, not scored

## Approved Divergences Verified

- [x] Brand color: `#ED7470` vs `#2AC1BC` — not penalized
- [x] Background: `#fff9f2` vs `#FFFFFF` — not penalized
- [x] Foreground: `#1a1a2e` vs `#212529` — not penalized
- [x] Font stack: Avenir Next / Pretendard vs system-only — not penalized
- [x] Olive vs teal: `#1f6b52` vs `#12B886` — not penalized

---

## Blocker List

None.

---

## Authority Status

- Design status: `pending-review` → `confirmed` (Final authority gate passed)
- Stage 5 design review: passed (Codex, 2026-04-28)
- Final authority gate: **approved** (Claude, 2026-04-28)
- Blocker count: 0 | Major count: 0 | Minor count: 0

## OS-Specific Snapshot Note

Darwin-platform visual regression snapshots updated locally. Linux-platform snapshots (CI reference) require Codex/CI follow-up to regenerate.
