# Wave1 Discovery Detail Phase4 Prep

> slice: `wave1-port-discovery-detail`  
> branch: `feature/fe-wave1-port-discovery-detail`  
> prep date: 2026-05-13 KST  
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`  
> visual source of truth: `ui/designs/reference/wave1-fixed-prototype/manifest.json`  
> functional source of truth: official docs v1.6.6 / v1.5.3 / API v1.2.4 + current MVP service behavior

## Purpose

This prep locks the current Slice B starting point before Phase5 visual repair. Historical PR #374 evidence remains useful history, but it is not current completion proof for Wave1 exact-mobile parity.

Phase5 may change only Slice B surfaces: HOME, RECIPE_DETAIL, SavePopup, and LOGIN/LoginGate provider display. It must preserve MVP route/API/auth behavior and the `{ success, data, error }` API wrapper.

## Current Service Capture

The current service screenshots below were regenerated from `tests/e2e/qa-wave1-discovery-detail-evidence.spec.ts`. The spec now captures with `deviceScaleFactor: 1` so generated service PNG dimensions match the committed fixed prototype reference dimensions.

| Surface / state | Viewport | Current service screenshot | Fixed reference screenshot | Prep note |
| --- | --- | --- | --- | --- |
| HOME default | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png` | Current fixture renders only one theme card and one recipe card; reference shows denser carousel/list content. |
| HOME default | 320x568 | `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png` | Needs narrow overflow and first-viewport density check after repair. |
| HOME sort open | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/home-sort-dropdown-open.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home-sort-open-state.png` | Dropdown geometry and fixture content need exact-reference comparison. |
| RECIPE_DETAIL default | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-default.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png` | Current MVP data differs from reference title/counts; repair should focus geometry and classify data-only differences. |
| RECIPE_DETAIL default | 320x568 | `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-detail.png` | Needs CTA, tab, and ingredient row fit check at 320px. |
| RECIPE_DETAIL metric cluster | element capture | `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-hero-stats.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png` | Element-level capture is supplementary; final verdict must still use full-screen reference. |
| SavePopup | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/save-modal.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-save-popup.png` | Phase5 recapture now includes full dimmed page context and multi-book selected state. |
| SavePopup | 320x568 | `ui/designs/evidence/wave1-port-discovery-detail/save-modal-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-save-popup.png` | Phase5 recapture confirms footer actions stay visible at 320px. |
| LOGIN | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/login-screen.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-login.png` | Phase5 repair replaced the legacy card narrative with the compact mint login composition. |
| LOGIN | 320x568 | `ui/designs/evidence/wave1-port-discovery-detail/login-screen-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-login.png` | Phase5 recapture confirms provider buttons fit at 320px. |
| Global LoginGateModal | 390x844 | `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-login-gate-modal.png` | Phase5 recapture adds deterministic protected-action evidence. |
| Global LoginGateModal | 320x568 | `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal-narrow.png` | `ui/designs/reference/wave1-fixed-prototype/mobile-320-login-gate-modal.png` | Phase5 recapture confirms footer actions stay visible at 320px. |

## Prototype vs Service Diff Table

| Surface | Difference class | Current observation | Phase5 repair direction |
| --- | --- | --- | --- |
| HOME | visual/layout | Theme carousel density is too sparse in the current controlled capture; only one theme card appears where the fixed reference shows multiple cards with horizontal peek. | Keep existing themes API behavior, but update capture fixture or local display data so the reference density can be audited. Do not invent new API fields. |
| HOME | visual/layout | Recipe card content in the current capture starts with a grey placeholder area in default capture; fixed reference shows a food asset immediately in the first card. | Preserve card navigation/save behavior; align thumbnail rendering, card height, badge position, and first-card vertical placement against reference. |
| HOME | functional-contract-governed | Current visible recipe count is `(1)` because the controlled route returns one recipe. Fixed reference shows `(6)`. | Treat as fixture/data difference unless Phase5 intentionally expands the evidence fixture. Do not change API contract to satisfy visual density. |
| HOME sort open | visual/layout | Current dropdown is wider/taller relative to nearby chips and overlays a different first card image/content than reference. | Align dropdown width, item row height, border, shadow, and anchor placement. Keep official sort options: `조회수순`, `최신순`, `저장순`, `플래너 등록순`. |
| RECIPE_DETAIL | visual/layout | Current detail uses `집밥 김치찌개` fixture data; fixed reference uses `제육볶음` fixture-like content. Geometry is similar, but metrics, copy, and ingredient rows are data-divergent. | Classify copy/count/ingredient text as MVP fixture data unless the evidence route is adjusted. Repair only geometry, color, type scale, metric placement, tab, and CTA alignment. |
| RECIPE_DETAIL | visual/layout | Current hero metric counts and icon stack are smaller-content variants than reference. | Preserve `like_count`, `save_count`, `cook_count`, `plan_count`, and `user_status.saved_book_ids`; adjust icon/text styling only. |
| SavePopup | visual/layout | Current screenshot captures the dialog alone; fixed reference includes dimmed RECIPE_DETAIL backdrop and multi-book checked states. | Phase5 evidence should capture the full viewport with backdrop, not only dialog, and should keep official `book_ids[]` multi-save behavior. |
| LOGIN | visual/layout | Current login screen is a historical card narrative with bottom nav; fixed reference is a compact mint login screen with back affordance and two provider buttons. | Rework LOGIN visual structure to match fixed reference while preserving Naver/Google OAuth, error display, and return-to-action. |
| Global LoginGateModal | evidence gap | No current login-gate screenshot was regenerated in this prep run. | Phase5 must add or reuse a deterministic protected-action trigger and capture `GLOBAL::LoginGateModal` at 390px and 320px. |
| Derived states | prototype-derived design | loading/empty/error/unauthorized states are not fixed reference pixel targets. | Use `wave1-derived-state-ui-prep` components/tokens and classify separately from exact-reference surfaces. |

## MVP Regression Lock

Already verified in this prep run:

- `pnpm exec vitest run tests/recipe-api-contracts.test.ts tests/recipe-save-route.test.ts tests/home-screen.test.tsx tests/recipe-detail-screen.test.tsx`
  - 4 test files passed
  - 72 tests passed
  - Covers `GET /recipes?sort=latest`, `POST /recipes/{id}/save` with `book_ids[]`, HOME sort/filter/search behavior, RECIPE_DETAIL save/like/planner/cook UI behavior, and login gate flows.
- `pnpm exec playwright test tests/e2e/qa-wave1-discovery-detail-evidence.spec.ts --project=desktop-chrome`
  - 1 test passed
  - Regenerated current service screenshots listed above.
- `pnpm validate:workflow-v2`
  - passed
- `pnpm validate:workpack -- --slice wave1-port-discovery-detail`
  - passed

## Phase5 Audit Plan

Phase5 repair PR must include:

- Reference screenshots from `ui/designs/reference/wave1-fixed-prototype/`.
- Regenerated service screenshots at matching pixel dimensions.
- Screenshot diff evidence for every exact-reference-ready Slice B surface.
- Computed-style audit covering color, font, type scale, line height, spacing, radius, border, shadow, opacity, and sticky/bottom safe-area treatment.
- DOM geometry audit covering app header, search pill, theme carousel cards, planner banner, sort dropdown, recipe card, hero image, hero metric stack, tabs, ingredient rows, SavePopup sheet, login provider buttons, and bottom tab/CTA boundaries.
- Remaining-difference ledger with:
  - visual blockers: `0`
  - unclassified visual differences: `0`
  - any remaining differences classified only as `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, `not-yet-prototyped`, or `prototype-derived design`.

## PR-Ready Evidence Checklist

- [x] Current service screenshots regenerated at 390px and 320px for HOME and RECIPE_DETAIL.
- [x] HOME sort-open, SavePopup, LOGIN, and LoginGate current screenshots regenerated.
- [x] Screenshot pixel dimensions aligned with fixed references by switching Slice B evidence capture to DPR 1.
- [x] Fixed reference mapping recorded in this prep artifact.
- [x] Prototype-vs-service diff table recorded.
- [x] MVP regression lock recorded with targeted Vitest and Playwright commands.
- [x] Phase5 repair: screenshot diff reports generated in `ui/designs/evidence/wave1-port-discovery-detail/phase5-visual-audit.md`.
- [x] Phase5 repair: computed-style audit generated in `ui/designs/evidence/wave1-port-discovery-detail/phase5-visual-audit.md`.
- [x] Phase5 repair: DOM geometry audit generated in `ui/designs/evidence/wave1-port-discovery-detail/phase5-visual-audit.md`.
- [x] Phase5 repair: remaining-difference ledger reaches visual blockers 0 and unclassified visual differences 0.
- [x] Phase5 repair: authority report refreshed and Claude final authority gate rerun.
