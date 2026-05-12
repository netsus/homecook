# Wave1 Shopping Cooking Phase4 Prep

> slice: `wave1-port-shopping-cooking`
> branch: `feature/fe-wave1-port-shopping-cooking`
> prep date: 2026-05-13 KST
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> visual source of truth: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
> functional source of truth: official docs + current MVP service behavior

## Purpose

This prep refreshes Slice D after the Wave1 fixed prototype lock. Historical PR #379 and 2026-05-10 evidence remain useful history, but they are not the current completion proof for Phase5 closeout.

Phase5 may change only Slice D evidence/bookkeeping unless a current-head visual blocker is found. It must preserve the existing shopping and cooking contracts: completed shopping lists are read-only, `exclude -> uncheck` stays server-governed, `add_to_pantry_item_ids` keeps null/empty/selected semantics, planner cooking uses sessions, and standalone cooking does not mutate planner meal status.

## Current Service Capture

The current service screenshots below were regenerated from `tests/e2e/qa-wave1-shopping-cooking-evidence.spec.ts` with Chromium, DPR 1, and fixed viewport sizes.

| Surface / state | Viewport | Current service screenshot | Fixed reference screenshot | Prep note |
| --- | --- | --- | --- | --- |
| SHOPPING_FLOW select | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-preview.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-flow-select.png` | STEP 1 header, grouped meal cards, checkbox treatment, fixed CTA, and bottom tab align with the fixed reference while using MVP fixture data. |
| SHOPPING_FLOW select | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-flow-select.png` | Narrow viewport keeps the CTA and bottom tab stack inside the fixed mobile shell. |
| SHOPPING_FLOW review | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-review.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-flow-review.png` | STEP 2 hierarchy, progress treatment, ingredient card, fixed action bar, and bottom tab align with the fixed reference. |
| SHOPPING_FLOW review | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-flow-review-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-flow-review.png` | Narrow review state remains clipped/stacked consistently with the fixed reference. |
| SHOPPING_DETAIL active | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-detail.png` | Header, title/date, progress block, purchase section, excluded section, share, and sticky completion affordance preserve the fixed reference shell. |
| SHOPPING_DETAIL active | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-detail.png` | Narrow detail state keeps row actions and sticky CTA within the viewport without horizontal overflow. |
| SHOPPING_DETAIL read-only | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-detail-readonly.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-detail.png` | Supplemental MVP state proving completed-list read-only behavior; exact reference owns the active visual shell. |
| Pantry reflect picker | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-complete-pantry.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-reflect-picker.png` | Picker sheet structure, checkbox row, divider, and footer buttons match the fixed picker family; backdrop state is contract-governed. |
| Pantry reflect picker | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/shopping-complete-pantry-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-reflect-picker.png` | Narrow picker keeps title, copy, row, and two-button footer visible without clipping. |
| COOK_READY_LIST | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-ready-list.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-ready-list.png` | Header band, grouped ready cards, method/status pills, mint CTA, and bottom tab match the fixed reference. |
| COOK_READY_LIST | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-ready-list-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-ready-list.png` | Narrow list preserves card density and visible CTA affordances. |
| COOK_MODE planner | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-scroll.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-planner.png` | Dark cook shell, ingredient summary, step card sequence, and sticky bottom controls match the fixed reference. |
| COOK_MODE planner | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-planner.png` | Narrow planner cook mode keeps cancel/complete controls unclipped. |
| Consumed ingredient checklist | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-complete.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-consumed-ingredient-checklist.png` | Sheet title, checklist row, text wrapping, and action footer align with the fixed reference family. |
| Consumed ingredient checklist | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/cook-mode-complete-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-consumed-ingredient-checklist.png` | Narrow checklist preserves row wrapping and footer button fit. |
| COOK_MODE standalone | 390x844 | `ui/designs/evidence/wave1-port-shopping-cooking/standalone-cook-mode-scroll.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-standalone.png` | Standalone route uses the same scroll-first cook shell without planner-session controls leaking into the flow. |
| COOK_MODE standalone | 320x568 | `ui/designs/evidence/wave1-port-shopping-cooking/standalone-cook-mode-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-standalone.png` | Narrow standalone cook mode keeps all primary controls inside the shell. |

## Prototype vs Service Diff Table

| Surface | Difference class | Current observation | Phase5 direction |
| --- | --- | --- | --- |
| SHOPPING_FLOW | functional-contract-required | Recipe names, dates, counts, and placeholder food artwork come from MVP QA fixture data rather than literal prototype data. | Preserve fixture data and classify content-only drift; do not add undocumented fields or assets. |
| SHOPPING_DETAIL | functional-contract-required | Purchase rows retain reorder affordances and read-only state copy from existing MVP behavior. | Keep reorder/read-only behavior because Slice 11 and completed-list rules are official MVP contracts. |
| Pantry reflect picker | functional-contract-required | The sheet opens before the complete API resolves, so the backdrop remains the in-progress shopping detail state. | Preserve `add_to_pantry_item_ids` selection-before-completion semantics. |
| COOK_READY_LIST | browser-rendering-limited | Minor text and thumbnail rendering can differ by platform while geometry and hierarchy match. | No UI repair required unless CI evidence shows layout drift. |
| COOK_MODE | functional-contract-required | Ingredient/step text comes from MVP fixtures; planner and standalone API separation remains visible in routes. | Keep route/API separation and the no-serving-adjustment cook-mode rule. |
| Derived states | prototype-derived design | Loading/empty/error/unauthorized states are behavior targets, not fixed-reference pixel targets. | Verify through regression tests instead of forcing prototype screenshots. |

## MVP Regression Lock

Verified in this prep run:

- `pnpm exec playwright test tests/e2e/qa-wave1-shopping-cooking-evidence.spec.ts --project=mobile-chrome`
  - 1 test passed
  - Regenerated current service screenshots listed above.
  - Added the missing 320px pantry reflect picker evidence capture.
- `pnpm exec vitest run tests/shopping-flow-screen.test.tsx tests/shopping-detail.frontend.test.tsx tests/cook-ready-list-screen.test.tsx tests/cook-mode-screen.test.tsx tests/standalone-cook-mode-screen.test.tsx`
  - 5 test files passed
  - 103 tests passed
- `pnpm exec playwright test tests/e2e/slice-09-shopping-preview-create.spec.ts tests/e2e/slice-10a-shopping-detail-interact.spec.ts tests/e2e/slice-10b-shopping-share-text.spec.ts tests/e2e/slice-12a-shopping-complete.spec.ts tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts tests/e2e/slice-14-cook-session-start.spec.ts tests/e2e/slice-15a-cook-planner-complete.spec.ts tests/e2e/slice-15b-cook-standalone-complete.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small`
  - 204 tests passed
- `pnpm verify:frontend`
  - passed: lint, typecheck, product Vitest, build, smoke E2E, a11y, visual, security, Lighthouse

## Phase5 Audit Plan

Phase5 closeout PR must include:

- Reference screenshots from `ui/designs/reference/wave1-fixed-prototype/`.
- Regenerated service screenshots at matching pixel dimensions for the Slice D exact-reference-ready surfaces and modal states.
- Screenshot comparison evidence covering SHOPPING_FLOW, SHOPPING_DETAIL, pantry reflect picker, COOK_READY_LIST, COOK_MODE planner/standalone, and consumed ingredient checklist.
- Computed-style audit covering color, font, type scale, spacing, radius, border, shadow, opacity, sticky footer, and bottom safe-area treatment.
- DOM geometry audit covering app header, step headers, grouped cards, row controls, picker sheets, cook step cards, sticky cook controls, and bottom tab boundaries.
- Remaining-difference ledger with:
  - visual blockers: `0`
  - unclassified visual differences: `0`
  - any remaining differences classified only as `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, `not-yet-prototyped`, or `prototype-derived design`.

## PR-Ready Evidence Checklist

- [x] Current service screenshots regenerated at 390px and 320px for SHOPPING_FLOW, SHOPPING_DETAIL, pantry reflect picker, COOK_READY_LIST, COOK_MODE planner/standalone, and consumed ingredient checklist.
- [x] Screenshot pixel dimensions match fixed references for exact-reference-ready full-screen captures.
- [x] Fixed reference mapping recorded in this prep artifact.
- [x] Prototype-vs-service diff table recorded.
- [x] MVP regression lock recorded with targeted Playwright evidence command.
- [x] Phase5 closeout: screenshot comparison recorded in `ui/designs/evidence/wave1-port-shopping-cooking/phase5-visual-audit.md`.
- [x] Phase5 closeout: computed-style audit recorded in `ui/designs/evidence/wave1-port-shopping-cooking/phase5-visual-audit.md`.
- [x] Phase5 closeout: DOM geometry audit recorded in `ui/designs/evidence/wave1-port-shopping-cooking/phase5-visual-audit.md`.
- [x] Phase5 closeout: remaining-difference ledger reaches visual blockers 0 and unclassified visual differences 0.
- [x] Phase5 closeout: authority report refreshed and Claude final authority gate rerun.
