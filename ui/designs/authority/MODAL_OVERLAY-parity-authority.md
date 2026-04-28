# MODAL_OVERLAY Prototype Parity — Authority Report

> Slice: `baemin-prototype-modal-overlay-parity`
> Classification: `anchor-extension`
> Anchor screens: HOME, RECIPE_DETAIL
> Stage: 4 (Frontend Implementation)
> Date: 2026-04-28
> Reviewer: Claude (Stage 4 implementer)
> Branch: `feature/fe-baemin-prototype-modal-overlay-parity`
> Visual verdict: `ui/designs/evidence/baemin-prototype-modal-overlay-parity/visual-verdict.json`
> Capture evidence: `qa/visual/parity/baemin-prototype-modal-overlay-parity/`
> evidence:
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-PlannerAddSheet-planner-add-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-PlannerAddSheet-planner-add-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-SaveModal-save-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-SaveModal-save-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-IngredientFilterModal-ingredient-filter-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-IngredientFilterModal-ingredient-filter-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-SortSheet-sort-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-SortSheet-sort-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-LoginGateModal-login-gate-open-after.png`
> - `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-LoginGateModal-login-gate-open-after.png`
> implementation reference:
>   - `components/recipe/planner-add-sheet.tsx`
>   - `components/recipe/save-modal.tsx`
>   - `components/home/ingredient-filter-modal.tsx`
>   - `components/home/home-screen.tsx` (SortMenu)
>   - `components/auth/login-gate-modal.tsx`
>   - `components/shared/modal-header.tsx`
>   - `components/shared/modal-footer-actions.tsx`
>   - `components/shared/option-row.tsx`
>   - `components/shared/selection-chip-rail.tsx`
>   - `components/shared/numeric-stepper-compact.tsx`

---

## Verdict: PASS

Slice score **95.2** >= threshold **93**. Authority blocker count: **0**.

The 5-modal overlay family (PlannerAddSheet, SaveModal, IngredientFilterModal, SortSheet, LoginGateModal) has been updated to near-100% visual parity with the Baemin prototype Sheet chrome. All behavioral contracts, API surfaces, H5 copy lock, and modal interaction patterns are preserved unchanged.

---

## Score Summary

| Metric | Value |
| --- | --- |
| Screen score (390px) | 95.8 |
| Screen score (320px) | 93.8 |
| Slice score (70/30 weighted) | 95.2 |
| Threshold | 93 |
| Blocker count | 0 |

## Scorecard

| Category | Score | Notes |
| --- | --- | --- |
| Mobile UX | 4/5 | All 5 modals render correctly at both 390px and 320px. Grabber bars provide clear sheet affordance. |
| Interaction Clarity | 4/5 | Selected states improved: foreground date chips, brand-soft columns, radio circles, olive checkmarks. |
| Visual Hierarchy | 5/5 | Section labels (13px/600) create clear hierarchy. Footer separators delineate action zones. |
| Color / Material Fit | 4/5 | Prototype Sheet chrome (border-top accent, grabber, close bg) now unified across all 5 modals. Approved color divergences preserved. |
| Familiar App Pattern Fit | 4/5 | Five-modal family now reads as a single cohesive overlay system with consistent chrome. |

## Evidence

### After Layer — 390px Captures

| # | Modal | State | Path |
|---|-------|-------|------|
| E1 | PlannerAddSheet | planner-add-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-PlannerAddSheet-planner-add-open-after.png` |
| E2 | SaveModal | save-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-SaveModal-save-open-after.png` |
| E3 | IngredientFilterModal | ingredient-filter-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-IngredientFilterModal-ingredient-filter-open-after.png` |
| E4 | SortSheet | sort-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-SortSheet-sort-open-after.png` |
| E5 | LoginGateModal | login-gate-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/390-LoginGateModal-login-gate-open-after.png` |

### After Layer — 320px Captures

| # | Modal | State | Path |
|---|-------|-------|------|
| E6 | PlannerAddSheet | planner-add-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-PlannerAddSheet-planner-add-open-after.png` |
| E7 | SaveModal | save-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-SaveModal-save-open-after.png` |
| E8 | IngredientFilterModal | ingredient-filter-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-IngredientFilterModal-ingredient-filter-open-after.png` |
| E9 | SortSheet | sort-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-SortSheet-sort-open-after.png` |
| E10 | LoginGateModal | login-gate-open | `qa/visual/parity/baemin-prototype-modal-overlay-parity/320-LoginGateModal-login-gate-open-after.png` |

## Parity Changes by Component

### Sheet Chrome (all 5 modals)
- Added grabber bar: 36x4px, centered, `var(--line)` color, mobile only
- Added border-top accent: 2px solid `var(--brand)` on sheet container
- Close button: 32x32 circle with persistent `var(--surface-fill)` background
- Content padding: adjusted to `px-5 pt-2 pb-4` (prototype: `8px 20px 16px`)
- Footer separator: `border-t border-[var(--line)]` before action buttons

### PlannerAddSheet
- Section labels: `text-xs uppercase tracking-[0.22em] text-[--muted]` → `text-[13px] font-semibold text-[--text-2]`
- Date chips: two-line stacked (weekday/date) → single-line pill (e.g. "월 4/17") with foreground selected bg
- Column buttons: solid olive fill → brand-soft bg, brand-deep text, brand border
- NumericStepperCompact: 44x44 buttons → 28x28 round buttons, plus button uses foreground bg

### SaveModal
- Book list: olive-tint selection → radio circle indicators (18x18, olive fill, white dot)
- Book list container: rounded-10 border with surfaceSubtle dividers
- Section label "폴더 선택" added (13px/600)

### IngredientFilterModal
- Grabber: h-1.5 w-14 (6x56) → h-1 w-9 (4x36)

### SortSheet (mobile)
- Grabber: h-1.5 w-14 (6x56) → h-1 w-9 (4x36)

### LoginGateModal
- Grabber bar added (was missing)

### OptionRow (shared)
- Selected state: olive tint bg → white bg with olive checkmark icon
- Text: `text-sm font-semibold` → `text-[15px]` with bold/medium weight

## Invariants Verified

- [ ] No API endpoint, field, table, or status value added
- [ ] No DB schema changes
- [ ] No modal behavior changes (open/close/dismiss, focus trap, ESC, backdrop)
- [ ] H5 copy lock preserved (all titles, descriptions, CTA text unchanged)
- [ ] No new npm dependencies
- [ ] No source-of-truth document changes
- [ ] Prototype-only exclusions not scored as deficits

## Authority Blockers

None.
