# Wave1 Pantry Phase4 Prep

> slice: `wave1-port-pantry`
> branch: `feature/fe-wave1-port-pantry`
> prep date: 2026-05-13 KST
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> visual source of truth: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
> functional source of truth: official docs + current MVP service behavior

## Purpose

This prep refreshes Slice E after the Wave1 fixed prototype lock. Historical PR #383-era pantry evidence remains history only; current Phase5 closeout must use fixed-reference screenshots, regenerated service evidence, screenshot comparison, style/geometry audit, and a remaining-difference ledger with visual blockers 0 and unclassified visual differences 0.

Phase5 may change only Slice E evidence/bookkeeping unless a current-head visual blocker is found. It must preserve the existing pantry contracts: pantry is presence-only, `POST /pantry` silently skips duplicate or invalid `ingredient_ids`, `DELETE /pantry` is idempotent for already-missing items, and all mutations stay scoped to the authenticated user's pantry.

## Current Service Capture

The current service screenshots below were regenerated from `tests/e2e/qa-wave1-pantry-evidence.spec.ts` with Chromium, DPR 1, and fixed viewport sizes.

| Surface / state | Viewport | Current service screenshot | Fixed reference screenshot | Prep note |
| --- | --- | --- | --- | --- |
| PANTRY default | 390x844 | `ui/designs/evidence/wave1-port-pantry/pantry-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png` | Header, count, search, primary/secondary CTAs, category rail, grouped cards, and bottom tab align with the fixed reference while using MVP fixture data. |
| PANTRY default | 320x568 | `ui/designs/evidence/wave1-port-pantry/pantry-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry.png` | Narrow viewport keeps count/search/CTA/category controls inside the fixed mobile shell without horizontal overflow. |
| PANTRY delete mode | 390x844 | `ui/designs/evidence/wave1-port-pantry/pantry-select-delete.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png` | Supplemental MVP state proving delete-mode checkbox, selected count, and bottom `제거하기` CTA. |
| PANTRY empty | 390x844 | `ui/designs/evidence/wave1-port-pantry/pantry-empty.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png` | Supplemental derived state; shell, CTAs, and empty card remain in the Wave1 pantry visual family. |
| INGREDIENT_ADD_SHEET | 390x844 | `ui/designs/evidence/wave1-port-pantry/pantry-add-sheet.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-add-sheet.png` | Sheet top, title, search, category rail, ingredient grid, disabled owned cards, and footer buttons align with the fixed reference. |
| INGREDIENT_ADD_SHEET | 320x568 | `ui/designs/evidence/wave1-port-pantry/pantry-add-sheet-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-add-sheet.png` | Narrow sheet keeps header, filters, grid, and footer controls visible without clipped button labels. |
| PANTRY_BUNDLE_PICKER | 390x844 | `ui/designs/evidence/wave1-port-pantry/pantry-bundle-picker.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-bundle-picker.png` | Sheet top, title/copy, bundle rows, icons, chevrons, and card rhythm align with the fixed reference. |
| PANTRY_BUNDLE_PICKER | 320x568 | `ui/designs/evidence/wave1-port-pantry/pantry-bundle-picker-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-bundle-picker.png` | Narrow picker preserves sheet geometry, row height, and text truncation boundaries inside the viewport. |

## Prototype vs Service Diff Table

| Surface | Difference class | Current observation | Phase5 direction |
| --- | --- | --- | --- |
| PANTRY | functional-contract-required | Count, ingredient names, categories, and owned items come from MVP pantry fixtures rather than prototype literals. | Preserve service data and classify content-only drift; do not add undocumented fields. |
| PANTRY item visuals | functional-contract-required | Official pantry/ingredient responses do not expose ingredient image URLs, so category/ingredient placeholders are used. | Keep placeholder visuals and leave image URL as a contract-evolution candidate only. |
| PANTRY delete mode | prototype-derived design | Delete mode is an MVP interaction state layered on the pantry shell, not a separate fixed prototype screen. | Preserve checkbox-only-in-delete-mode, selected count, and bottom CTA behavior. |
| INGREDIENT_ADD_SHEET | functional-contract-required | Existing ingredients are disabled and marked as owned to preserve duplicate-add semantics. | Keep disabled owned cards and submit only selected missing ingredients. |
| PANTRY_BUNDLE_PICKER | functional-contract-required | Bundle availability is driven by `GET /pantry/bundles` `is_in_pantry` values and MVP fixture text. | Keep missing ingredients selected by default and preserve `POST /pantry` payload semantics. |
| Derived states | prototype-derived design | Empty, loading, error, unauthorized, and mutation feedback states are behavior targets, not fixed-reference pixel targets. | Verify through regression tests and keep them visually consistent with the Wave1 shell. |

## MVP Regression Lock

Verified in this prep run:

- `pnpm exec playwright test tests/e2e/qa-wave1-pantry-evidence.spec.ts --project=mobile-chrome`
  - 1 test passed
  - Regenerated 8 current service screenshots listed above.
- `pnpm exec vitest run tests/pantry-screen.test.tsx`
  - 1 test file passed
  - 18 tests passed
- `pnpm exec playwright test tests/e2e/slice-13-pantry-core.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small`
  - 24 tests passed
- `pnpm verify:frontend`
  - passed: lint, typecheck, product Vitest 65 files / 629 tests, build, smoke E2E 758 passed / 4 skipped, a11y 6, visual 12, security 9, Lighthouse assertions over 6 runs

## Phase5 Audit Plan

Phase5 closeout PR must include:

- Reference screenshots from `ui/designs/reference/wave1-fixed-prototype/`.
- Regenerated service screenshots at matching pixel dimensions for PANTRY, INGREDIENT_ADD_SHEET, and PANTRY_BUNDLE_PICKER.
- Screenshot comparison evidence covering pantry default, add sheet, bundle picker, and supplemental delete/empty states.
- Computed-style audit covering color, font, type scale, spacing, radius, border, shadow, opacity, sheet backdrop, and bottom safe-area treatment.
- DOM geometry audit covering app header, count/search block, CTA grid, category rail, pantry rows, delete action bar, add sheet, bundle picker, and bottom tab boundaries.
- Remaining-difference ledger with:
  - visual blockers: `0`
  - unclassified visual differences: `0`
  - any remaining differences classified only as `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, `not-yet-prototyped`, or `prototype-derived design`.

## PR-Ready Evidence Checklist

- [x] Current service screenshots regenerated at 390px and 320px for PANTRY, INGREDIENT_ADD_SHEET, and PANTRY_BUNDLE_PICKER.
- [x] Screenshot pixel dimensions match fixed references for exact-reference-ready full-screen captures.
- [x] Fixed reference mapping recorded in this prep artifact.
- [x] Prototype-vs-service diff table recorded.
- [x] MVP regression lock recorded with targeted Vitest and Playwright evidence commands.
- [x] Phase5 closeout: screenshot comparison recorded in `ui/designs/evidence/wave1-port-pantry/phase5-visual-audit.md`.
- [x] Phase5 closeout: computed-style audit recorded in `ui/designs/evidence/wave1-port-pantry/phase5-visual-audit.md`.
- [x] Phase5 closeout: DOM geometry audit recorded in `ui/designs/evidence/wave1-port-pantry/phase5-visual-audit.md`.
- [x] Phase5 closeout: remaining-difference ledger reaches visual blockers 0 and unclassified visual differences 0.
- [x] Phase5 closeout: authority report refreshed and Claude final authority gate rerun.
