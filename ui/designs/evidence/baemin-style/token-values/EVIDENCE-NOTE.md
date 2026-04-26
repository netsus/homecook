# Evidence Note: baemin-style-token-values

## Status

Captured by Codex on 2026-04-27 using Playwright against the local QA fixture dev server.

## Capture Method

The implementation changes only 3 CSS variable values in `app/globals.css`:

- `--brand`: `#FF6C3C` -> `#ED7470`
- `--brand-deep`: `#E05020` -> `#C84C48`
- `--brand-soft`: `#E6F8F7` -> `#FDEBEA`

No component, page, or layout file was edited. The visual diff propagates purely through CSS variable inheritance.

The `before` screenshots use the current implementation with the previous three token values injected at `:root`. This is equivalent for this slice because the only runtime change is those three CSS variable values.

## Captured Screenshots

| File | Description |
| --- | --- |
| `HOME-before-mobile.png` | HOME at mobile default before token change |
| `HOME-after-mobile.png` | HOME at mobile default after token change |
| `HOME-after-narrow-320.png` | HOME at 320px after token change |
| `RECIPE_DETAIL-before-mobile.png` | RECIPE_DETAIL at mobile default before token change |
| `RECIPE_DETAIL-after-mobile.png` | RECIPE_DETAIL at mobile default after token change |
| `RECIPE_DETAIL-after-narrow-320.png` | RECIPE_DETAIL at 320px after token change |
| `PLANNER_WEEK-before-mobile.png` | PLANNER_WEEK at mobile default before token change |
| `PLANNER_WEEK-after-mobile.png` | PLANNER_WEEK at mobile default after token change |
| `PLANNER_WEEK-after-narrow-320.png` | PLANNER_WEEK at 320px after token change |
| `capture-summary.json` | Token values and horizontal overflow results for each capture |

## Verification coverage

`capture-summary.json` confirms:

- `before` captures use `--brand: #FF6C3C`, `--brand-deep: #E05020`, `--brand-soft: #E6F8F7`
- `after` captures use `--brand: #ED7470`, `--brand-deep: #C84C48`, `--brand-soft: #FDEBEA`
- HOME, RECIPE_DETAIL, and PLANNER_WEEK have no horizontal overflow at mobile default or 320px

`pnpm verify:frontend` covers code-level regression.

## Blocker criteria to check in screenshots

- No horizontal overflow at mobile default or 320px: passed
- No text clipped inside brand-colored elements: passed by Codex Stage 5 visual inspection
- Existing loading/empty/error/read-only/unauthorized states still present
- Only brand-colored UI states visually different (CTA buttons, active tabs, badges, tint backgrounds): passed
