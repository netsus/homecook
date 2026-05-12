# Slice B Phase5 Visual Audit

> slice: `wave1-port-discovery-detail`
> date: 2026-05-13
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> parity mode: exact-mobile controlled capture

## Screenshot Comparison

| Surface | Reference | Service evidence | Result |
| --- | --- | --- | --- |
| HOME 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png` | `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-default.png` | pass |
| HOME 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png` | `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-narrow.png` | pass |
| HOME sort open | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home-sort-open-state.png` | `ui/designs/evidence/wave1-port-discovery-detail/home-sort-dropdown-open.png` | pass |
| RECIPE_DETAIL 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png` | `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-default.png` | pass |
| RECIPE_DETAIL 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-detail.png` | `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-narrow.png` | pass |
| Save popup 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-save-popup.png` | `ui/designs/evidence/wave1-port-discovery-detail/save-modal.png` | pass |
| Save popup 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-save-popup.png` | `ui/designs/evidence/wave1-port-discovery-detail/save-modal-narrow.png` | pass |
| LOGIN 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-login.png` | `ui/designs/evidence/wave1-port-discovery-detail/login-screen.png` | pass |
| LOGIN 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-login.png` | `ui/designs/evidence/wave1-port-discovery-detail/login-screen-narrow.png` | pass |
| Login gate 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-login-gate-modal.png` | `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal.png` | pass |
| Login gate 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-login-gate-modal.png` | `ui/designs/evidence/wave1-port-discovery-detail/login-gate-modal-narrow.png` | pass |

## Screenshot Diff Summary

- HOME now captures six recipes, three theme cards, inline sort dropdown, recipe chip rail, and first card food fallback artwork at fixed DPR 1.
- Save popup is captured as a full viewport sheet with dimmed recipe detail backdrop and two selected recipe books.
- Login screen uses the fixed-reference app login composition: back affordance, mint icon tile, compact copy, Google/Naver buttons, terms line, and bottom tab.
- Login gate uses the Wave1 compact action sheet family with cancel/login footer actions while preserving the existing protected-action heading for regression compatibility.

## Computed-Style Audit

- Color: Wave1-local `--wave1-*` tokens or fixed reference hex values are used on modified mobile surfaces.
- Type: mobile headings use fixed-size text and `--wave1-font-brand`; no viewport-scaled font sizes were introduced.
- Spacing: login screen, modal sheets, buttons, and bottom safe area use fixed responsive constraints and no overlapping text.
- Radius: mobile sheets keep 20px top radius; provider buttons use 8px radius; card/sheet radius stays within Wave1 rules.
- Border/shadow/opacity: modal backdrops use `bg-black/40`, sheet shadows match the existing Wave1 modal family, and bottom borders are 0.5px where the shell already uses that pattern.

## DOM Geometry Audit

- HOME app bar, search pill, theme cards, promo strip, sort dropdown, chip rail, first recipe card, and bottom tab fit within 390px and 320px captures.
- RECIPE_DETAIL hero metrics remain separated from media and sticky CTA boundaries.
- Save popup and login gate sheets leave footer buttons visible on 390px and 320px viewport captures.
- Login provider buttons are 48px tall and fit within parent width at 390px and 320px.
- No incoherent overlap or horizontal overflow was observed in the controlled Playwright captures.

## Remaining Difference Ledger

| Difference | Classification | Action |
| --- | --- | --- |
| Service fixture titles/counts differ from prototype literal recipe data where MVP contracts require current QA fixture records. | functional-contract-required | accepted |
| Login gate backdrop is captured from RECIPE_DETAIL because HOME bookmark is not an actionable protected control in the current MVP. | functional-contract-required | accepted |
| Login gate heading keeps `로그인이 필요한 작업이에요` because existing tests and user flow copy use that accessible name. | regression-compatibility | accepted |

Visual blockers: 0
Unclassified visual differences: 0
