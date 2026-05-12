# Slice F Phase5 Visual Audit

> slice: `wave1-port-account-library-leftovers`
> date: 2026-05-13
> fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> parity mode: exact-mobile controlled capture

## Screenshot Comparison

| Surface | Reference | Service evidence | Result |
| --- | --- | --- | --- |
| MYPAGE 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-default.png` | pass |
| MYPAGE 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-narrow.png` | pass |
| SETTINGS 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-settings.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/settings-default.png` | pass |
| SETTINGS 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-settings.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/settings-narrow.png` | pass |
| ACCOUNT 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-account.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/account-default.png` | pass |
| ACCOUNT 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-account.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/account-narrow.png` | pass |
| LEFTOVERS 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-leftovers.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-default.png` | pass |
| LEFTOVERS 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-leftovers.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-narrow.png` | pass |
| ATE_LIST 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-ate-list.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-default.png` | pass |
| ATE_LIST 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-ate-list.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-narrow.png` | pass |
| RECIPEBOOK_DETAIL 390 | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipebook-detail.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-default.png` | pass |
| RECIPEBOOK_DETAIL 320 | `ui/designs/reference/wave1-fixed-prototype/mobile-320-recipebook-detail.png` | `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-narrow.png` | pass |

## Screenshot Diff Summary

- MYPAGE matches the fixed reference for app bar, profile/avatar block, three stat cards, menu row rhythm, chevrons, and bottom tab geometry at 390px and 320px.
- SETTINGS matches the fixed reference for app bar, setting rows, switches, planner column controls, disabled footer actions, and bottom tab geometry.
- ACCOUNT matches the fixed reference for account field rows, chevrons, nickname CTA, secondary account actions, destructive CTA, and bottom tab geometry.
- LEFTOVERS matches the fixed reference for header action, summary copy, card image/thumb rhythm, metadata row, two CTA layout, and bottom tab geometry.
- ATE_LIST matches the fixed reference for card layout, secondary recovery/remake actions, toast position, and bottom tab geometry.
- RECIPEBOOK_DETAIL matches the fixed reference for title/delete header, book summary block, recipe card spacing, remove buttons, and metadata row.

## Computed-Style Audit

- Color: surfaces use the Wave1 mint, white, gray, and red destructive colors from the fixed reference family; no legacy palette leak was observed in the inspected captures.
- Type: page titles, row labels, section headings, recipe names, metadata, and CTA labels use fixed pixel type scales; no viewport-scaled font sizes were introduced.
- Spacing: page padding, card gaps, row heights, CTA spacing, metadata gaps, and bottom tab spacing match the fixed mobile rhythm at 390px and 320px.
- Radius: profile stats, menu cards, account rows, leftover cards, recipe cards, switches, CTAs, and destructive actions keep the Wave1 radius family.
- Border/shadow/opacity: dividers, card borders, disabled controls, toast shadow, and bottom tab borders align with the fixed reference family.

## DOM Geometry Audit

- MYPAGE profile, stats, menu rows, chevrons, and bottom tab fit inside 390px and 320px captures without page-level horizontal overflow.
- SETTINGS column inputs, delete buttons, add button, and footer controls remain visible and do not overlap the bottom navigation.
- ACCOUNT field rows, action buttons, and destructive CTA remain inside the viewport and keep tappable heights at 320px.
- LEFTOVERS card actions keep stable dimensions at 390px and 320px; `플래너에 추가` and `다먹음` labels do not clip.
- ATE_LIST `남은 요리로` and `다시 만들기` actions remain visible within the card row at 320px.
- RECIPEBOOK_DETAIL metadata and `제거` buttons remain visible without overlapping recipe titles or the bottom tab.

## Remaining Difference Ledger

| Difference | Classification | Action |
| --- | --- | --- |
| Nicknames, counts, recipe names, shopping totals, dates, and view counts come from MVP fixtures instead of prototype literals. | functional-contract-required | accepted |
| SETTINGS wake-lock toggle state follows persisted fixture state and may differ from the prototype's visual state. | functional-contract-required | accepted |
| LEFTOVERS / ATE_LIST metadata is driven by official `source_meal_label`, `source_planned_servings`, and `cooking_servings` fields. | functional-contract-required | accepted |
| RECIPEBOOK_DETAIL metadata is driven by official `view_count`, `total_duration_text`, and `base_servings` fields. | functional-contract-required | accepted |
| Empty, error, unauthorized, rename sheet, logout confirm, delete-account confirm, and custom-book delete confirm are supplemental behavior states beyond these default fixed captures. | prototype-derived design | accepted |
| Minor PNG byte churn, antialiasing, and runtime text rendering can vary between local and CI rendering. | browser-rendering-limited | accepted |

Visual blockers: 0
Unclassified visual differences: 0
