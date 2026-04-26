# Baemin Style Direction Authority Preflight

> This is an evidence plan for future implementation slices. The h6 gate itself has no runtime screenshot requirement because it changes no app UI.

## Authority Classification

| Item | Value |
| --- | --- |
| UI risk | high-risk / anchor-extension |
| Anchor screens | `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` |
| Authority required | yes, in follow-up implementation slices |
| Evidence root | `ui/designs/evidence/baemin-style/` |
| Gate status | direction adopted, implementation pending |

## Required Evidence by Follow-Up Slice

| Slice | Evidence |
| --- | --- |
| `baemin-style-tokens-additive` | before/after screenshots should show no intentional visual diff |
| `baemin-style-token-values` | app shell/HOME before/after at mobile default and 320px |
| `baemin-style-shared-components` | component previews for default, active, disabled, loading/error where relevant |
| `baemin-style-home-retrofit` | `HOME` before/after mobile default, after 320px, key active states |
| `baemin-style-recipe-detail-retrofit` | `RECIPE_DETAIL` before/after mobile default, after 320px, sheet/action states |
| `baemin-style-planner-week-retrofit` | `PLANNER_WEEK` before/after mobile default, after 320px, filled/scrolled states |

## Minimum Screenshot Set

| Screen | Required files |
| --- | --- |
| `HOME` | `HOME-before-mobile.png`, `HOME-after-mobile.png`, `HOME-after-narrow-320.png` |
| `RECIPE_DETAIL` | `RECIPE_DETAIL-before-mobile.png`, `RECIPE_DETAIL-after-mobile.png`, `RECIPE_DETAIL-after-narrow-320.png` |
| `PLANNER_WEEK` | `PLANNER_WEEK-before-mobile.png`, `PLANNER_WEEK-after-mobile.png`, `PLANNER_WEEK-after-narrow-320.png` |
| Shared sheets | `SHEET-before-mobile.png`, `SHEET-after-mobile.png`, `SHEET-after-narrow-320.png` |

## Blocker Criteria

- Page-level horizontal overflow at mobile default or 320px.
- Text clipped inside buttons, chips, cards, tabs, or sheets.
- Existing loading, empty, error, read-only, or unauthorized states disappear.
- H1 HOME first-viewport decision is contradicted.
- H2 PLANNER_WEEK day-card model is contradicted.
- H5 sheet/modal family decisions are contradicted.
- Brand/background/font value changes ship without explicit user approval.
- Authority report has unresolved blocker findings.

## Verification Expectations

- Run `pnpm verify:frontend` for implementation slices.
- Capture mobile default and 320px evidence before marking anchor screens confirmed.
- Run exploratory QA/eval only for slices that change interactive flows.
- Keep this preflight as the high-level authority map; each implementation slice owns its exact report and screenshots.
