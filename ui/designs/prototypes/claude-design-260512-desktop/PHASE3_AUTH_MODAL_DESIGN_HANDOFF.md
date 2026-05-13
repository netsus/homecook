# Phase 3 Auth And Modal Design Handoff

Status: implemented pending visual QA and Claude review
Date: 2026-05-13
Prototype: `ui/designs/prototypes/claude-design-260512-desktop/`
Ledger: `ui/designs/prototypes/claude-design-260512-desktop/PHASE0_PARITY_LEDGER.md`

## Scope

Phase 3 closes auth, gates, and cross-cutting modal rows from the Phase 0 parity ledger:

- `screen:LOGIN`
- `surface:HOME::SortDropdown`
- `surface:HOME::IngredientFilter`
- `gate:GLOBAL::LoginGate`
- `modal:RECIPE_DETAIL::SaveModal`
- `modal:RECIPE_DETAIL::PlannerAddModal`
- `modal:HOME::IngredientFilterModal`
- `modal:GLOBAL::Lightbox`
- `modal:GLOBAL::ConfirmDialog`

The phase intentionally does not close MyPage/settings account modals, pantry/shopping modals, menu-add pickers, or cooking-mode rows. Those remain owned by later phases in the ledger.

## Claude Design Spec

Claude session `c18117b4-d57a-4e67-8f2a-115df7704e63` was resumed with:

- `session_attach_mode=resume`
- `model=opus`
- `effort=high`
- `permission_mode=bypassPermissions`

Artifacts:

- Prompt: `.omx/artifacts/claude-delegate-c18117b4-d57a-4e67-8f2a-115df7704e63-phase3-auth-modal-design-spec-prompt-20260513T144754Z.md`
- Response: `.omx/artifacts/claude-delegate-c18117b4-d57a-4e67-8f2a-115df7704e63-phase3-auth-modal-design-spec-response-20260513T144754Z.md`
- Summary: `.omx/artifacts/claude-delegate-c18117b4-d57a-4e67-8f2a-115df7704e63-phase3-auth-modal-design-spec-summary-20260513T145730Z.md`

Claude verdict: `READY_FOR_CODEX`

## Implementation Notes

- Added a dedicated `LoginScreen` route with Kakao, Naver, and Google provider actions plus a guest browse path.
- Reused the same provider list in `LoginGateDialog`, preserving return-to-action after login.
- Added account/avatar behavior in the top navigation: unauthenticated avatar opens login, authenticated avatar opens MyPage.
- Protected recipe detail planner-add and planner week add flows through `requireAuth`.
- Added reusable `ConfirmDialog` and wired meal deletion to the destructive confirm path.
- Added ARIA and keyboard handling to `SortDropdown`.
- Added focus-on-open behavior to the ingredient filter modal and lightbox.
- Added visible focus rings for provider buttons, sort controls, filter cells, save rows, date chips, segmented controls, lightbox buttons, and dialog buttons.
- Added `styles-phase3.css` as a scoped layer after Phase 2 styles.

## Evidence

Visual QA evidence will be written to:

`ui/designs/evidence/desktop-modern-redesign/phase-3/`

The Phase 0 ledger should only be marked `verified` after:

- the evidence screenshots exist,
- `visual-qa-report.json` reports zero blocking findings,
- local verification passes,
- Claude implementation review has no blockers.
