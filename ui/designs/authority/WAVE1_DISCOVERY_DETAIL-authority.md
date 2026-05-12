# Authority Report: WAVE1_DISCOVERY_DETAIL

> slice: `wave1-port-discovery-detail`
> stage: 5
> reviewer: Codex design authority precheck + Claude final authority gate
> date: 2026-05-13
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`

## Design Status

**confirmed**

Slice B Phase5 refreshed the current service evidence for HOME, RECIPE_DETAIL, SavePopup, LOGIN, and LoginGateModal against the fixed Wave1 mobile prototype. The evidence set now includes 390px and 320px captures where fixed references exist, a visual audit, and a verdict ledger with blocker 0 and unclassified visual differences 0.

Claude final authority gate returned PASS with blocker 0 and confirmed that the remaining differences are classified rather than unclassified visual drift.

## Changes Summary

### HOME
- Evidence fixture now renders a dense HOME surface with 3 theme cards and 6 recipe cards so the fixed reference layout can be audited without changing public API fields.
- First recipe card fallback artwork, badge, count, and card color were aligned with the fixed reference capture.
- Inline SortDropdown, chip rail, promo strip, and HOME-owned bottom tab remain in place.

### RECIPE_DETAIL
- Existing MVP behavior was preserved: like/save/planner/cook actions, tabs, serving control, and login gate return-to-action.
- Full-view SavePopup evidence now captures the dimmed recipe detail backdrop, multi-book selected state, and footer action visibility at 390px and 320px.

### LOGIN / LoginGate
- Login page now uses the fixed reference composition: back affordance, mint icon tile, compact headline/copy, Google/Naver provider buttons, terms copy, and bottom tab.
- LoginGateModal now uses the compact Wave1 action sheet family with cancel/login footer buttons while preserving the existing accessible heading used by regression tests.

## Evidence

> evidence:
> - HOME mobile default: `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-default.png`
> - HOME mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-narrow.png`
> - HOME sort dropdown open: `ui/designs/evidence/wave1-port-discovery-detail/home-sort-dropdown-open.png`
> - RECIPE_DETAIL mobile default: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-default.png`
> - RECIPE_DETAIL mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-narrow.png`
> - RECIPE_DETAIL hero stats: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-hero-stats.png`
> - Save modal mobile default: `ui/designs/evidence/wave1-port-discovery-detail/save-modal.png`
> - Save modal mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/save-modal-narrow.png`
> - Login screen mobile default: `ui/designs/evidence/wave1-port-discovery-detail/login-screen.png`
> - Login screen mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/login-screen-narrow.png`
> - Login gate modal mobile default: `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal.png`
> - Login gate modal mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal-narrow.png`

## Audit Artifacts

- Screenshot comparison / computed-style audit / DOM geometry audit / remaining-difference ledger: `ui/designs/evidence/wave1-port-discovery-detail/phase5-visual-audit.md`
- Visual verdict: `ui/designs/evidence/wave1-port-discovery-detail/visual-verdict.json`
- Claude final authority gate: `ui/designs/evidence/wave1-port-discovery-detail/claude-final-authority-gate.md`

## Scorecard

| Dimension | Score | Notes |
| --- | --- | --- |
| Mobile UX | 9/10 | 390px and 320px controlled captures show no horizontal overflow or incoherent overlap. |
| Interaction Clarity | 9/10 | HOME sort, save popup, login providers, login gate, and detail CTA remain clear and touch-friendly. |
| Visual Hierarchy | 9/10 | HOME density, login composition, modal footer hierarchy, and recipe detail sheets now follow the fixed prototype more closely. |
| Color/Material Fit | 9/10 | Modified mobile surfaces use Wave1-local tokens or fixed reference hex values. |
| Regression Safety | 9/10 | Existing auth, save, planner, sort, and detail regression tests remain green. |

## Verdict

- Visual parity score: 94
- Visual blockers: 0
- Unclassified visual differences: 0
- Major issues: 0
- Minor issues: 0

## Remaining Classified Differences

| Difference | Classification | Decision |
| --- | --- | --- |
| Service fixture titles and counts differ from prototype literal sample data. | functional-contract-required | Accepted; MVP fixtures and official API fields remain source of truth. |
| Login gate backdrop is captured from RECIPE_DETAIL, not HOME. | functional-contract-required | Accepted; HOME bookmark is not an actionable protected control in the current MVP. |
| Login gate accessible heading remains `로그인이 필요한 작업이에요`. | regression-compatibility | Accepted; existing protected-action tests and flows rely on this accessible name. |

## Blockers

0

## Claude Final Gate

- Verdict: PASS
- Blockers: 0
- Artifact: `ui/designs/evidence/wave1-port-discovery-detail/claude-final-authority-gate.md`
