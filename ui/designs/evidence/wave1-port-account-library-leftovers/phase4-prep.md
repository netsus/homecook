# Wave1 Account / Library / Leftovers Phase4 Prep

> slice: `wave1-port-account-library-leftovers`
> branch: `feature/fe-wave1-port-account-library-leftovers`
> prep date: 2026-05-13 KST
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> visual source of truth: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
> functional source of truth: official docs v1.6.6 / v1.5.3 / v1.3.3 / v1.2.4 and current MVP behavior

## Purpose

This prep refreshes Slice F after the Wave1 fixed prototype lock and the 2026-05-12 contract evolution. Historical PR #383 evidence remains history only; the current Phase5 closeout uses fixed-reference screenshots, regenerated service evidence, screenshot comparison, style/geometry audit, and a remaining-difference ledger with visual blockers 0 and unclassified visual differences 0.

Phase5 may change only Slice F evidence, evidence fixtures, and bookkeeping unless a current-head blocker is found. It must preserve existing account, settings, recipebook, leftovers, and planner-column contracts.

## Current Service Capture

The current service screenshots below were regenerated from `tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts` with Chromium, DPR 1, and fixed viewport sizes.

| Surface / state | Viewport | Current service screenshot | Fixed reference screenshot | Prep note |
| --- | --- | --- | --- | --- |
| MYPAGE default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage.png` | Profile summary, stats, menu rows, and bottom tab align with the fixed reference while using MVP fixture data. |
| MYPAGE default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage.png` | Narrow viewport keeps labels, counts, chevrons, and bottom tab inside the mobile shell. |
| SETTINGS default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/settings-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-settings.png` | Cooking settings, planner columns, disabled save/cancel row, and bottom tab match the fixed settings shell. |
| SETTINGS default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/settings-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-settings.png` | Column controls and footer buttons remain unclipped at 320px. |
| ACCOUNT default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/account-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-account.png` | Account fields, nickname CTA, logout, delete-account CTA, and bottom tab align with the fixed account reference. |
| ACCOUNT default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/account-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-account.png` | Account action labels and destructive CTA remain visible without clipping. |
| LEFTOVERS default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-leftovers.png` | Header, summary copy, leftover cards, planner CTA, done CTA, metadata, and bottom tab match the fixed reference family. |
| LEFTOVERS default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-leftovers.png` | Two card actions keep stable widths and do not overflow at 320px. |
| ATE_LIST default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-ate-list.png` | Eaten card, recovery action, remake action, toast, and bottom tab match the fixed reference family. |
| ATE_LIST default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-ate-list.png` | Recovery and remake actions fit within the 320px card row. |
| RECIPEBOOK_DETAIL default | 390x844 | `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipebook-detail.png` | Header, custom-book delete action, book summary, recipe cards, remove buttons, and metadata align with the fixed reference family. |
| RECIPEBOOK_DETAIL default | 320x568 | `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipebook-detail.png` | Recipe card metadata and remove buttons stay inside the narrow viewport. |

## Prototype vs Service Diff Table

| Surface | Difference class | Current observation | Phase5 direction |
| --- | --- | --- | --- |
| MYPAGE | functional-contract-required | Nickname, counts, and menu totals come from MVP fixtures instead of prototype literals. | Preserve service data and classify content-only drift. |
| SETTINGS | functional-contract-required | Screen wake lock toggle state follows the fixture setting rather than prototype-on state. | Preserve user setting state; do not force visual-only state. |
| ACCOUNT | functional-contract-required | Email uses the E2E fixture account and remains wrapped by the official user profile contract. | Preserve profile contract and destructive confirmation flow. |
| LEFTOVERS / ATE_LIST | functional-contract-required | Recipe names, dates, source meal labels, and servings come from official v1.2.4 leftover metadata. | Preserve `source_meal_label`, `source_planned_servings`, and `cooking_servings` contract. |
| RECIPEBOOK_DETAIL | functional-contract-required | Recipe counts, view counts, duration, base servings, and tags come from official v1.2.4 recipebook metadata. | Preserve `view_count`, `total_duration_text`, and `base_servings` contract. |
| Derived states | prototype-derived design | Loading, empty, error, unauthorized, rename sheets, and destructive confirmations are behavior targets beyond the default fixed-reference captures. | Verify through regression tests and keep them in the Wave1 mobile shell. |

## MVP Regression Lock

Verified in this prep run:

- `pnpm exec playwright test tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts --project=mobile-chrome`
  - 1 test passed
  - Regenerated 12 current service screenshots listed above.
- `pnpm exec vitest run tests/mypage-screen.test.tsx tests/settings-screen.test.tsx tests/leftovers.frontend.test.tsx tests/recipe-book-detail-screen.test.tsx`
  - 4 test files passed
  - 78 tests passed
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17c-settings.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small`
  - 186 tests passed
- `pnpm verify:frontend`
  - passed: lint, typecheck, product Vitest 65 files / 629 tests, build, smoke E2E 758 passed / 4 skipped, a11y 6, visual 12, security 9, Lighthouse assertions over 6 runs

## Phase5 Audit Plan

Phase5 closeout PR must include:

- Reference screenshots from `ui/designs/reference/wave1-fixed-prototype/`.
- Regenerated service screenshots at matching pixel dimensions for MYPAGE, SETTINGS, ACCOUNT, LEFTOVERS, ATE_LIST, and RECIPEBOOK_DETAIL.
- Screenshot comparison evidence covering all six default mobile surfaces at 390px and 320px.
- Computed-style audit covering color, font, type scale, spacing, radius, border, shadow, opacity, sheet/dialog, and bottom safe-area treatment.
- DOM geometry audit covering app bars, profile/menu rows, settings forms, account rows, leftover cards, ate-list cards, recipebook cards, action buttons, and bottom tab boundaries.
- Remaining-difference ledger with:
  - visual blockers: `0`
  - unclassified visual differences: `0`
  - any remaining differences classified only as `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, `not-yet-prototyped`, or `prototype-derived design`.

## PR-Ready Evidence Checklist

- [x] Current service screenshots regenerated at 390px and 320px for MYPAGE, SETTINGS, ACCOUNT, LEFTOVERS, ATE_LIST, and RECIPEBOOK_DETAIL.
- [x] Screenshot pixel dimensions match fixed references for exact-reference-ready full-screen captures.
- [x] Fixed reference mapping recorded in this prep artifact.
- [x] Prototype-vs-service diff table recorded.
- [x] MVP evidence capture regression lock recorded.
- [x] Phase5 closeout: screenshot comparison recorded in `ui/designs/evidence/wave1-port-account-library-leftovers/phase5-visual-audit.md`.
- [x] Phase5 closeout: computed-style audit recorded in `ui/designs/evidence/wave1-port-account-library-leftovers/phase5-visual-audit.md`.
- [x] Phase5 closeout: DOM geometry audit recorded in `ui/designs/evidence/wave1-port-account-library-leftovers/phase5-visual-audit.md`.
- [x] Phase5 closeout: remaining-difference ledger reaches visual blockers 0 and unclassified visual differences 0.
- [x] Phase5 closeout: authority report refreshed and Claude final authority gate rerun.
