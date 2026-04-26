# baemin-style-token-values

> User-approved brand token value slice. This is not a broad visual retrofit.
> Dependencies: `h6-baemin-style-direction` (merged), `baemin-style-tokens-additive` (merged).
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

Change the three brand token values (`--brand`, `--brand-deep`, `--brand-soft`) in `app/globals.css` to user-approved Baemin-style colors, completing the first value-changing step of the rollout sequence. Gray text, surface, radius, and shadow additive token values stay as currently documented. Expected visual diff: brand-colored UI states only.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-token-values` |
| Implementation | `feature/fe-baemin-style-token-values` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend implementation | **Claude** | CSS value changes + design-tokens.md update |
| 5 | Design review | **Codex** | visual diff check on brand-colored states |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

- Token value changes in `app/globals.css`:
  - `--brand`: `#FF6C3C` -> `#ED7470`
  - `--brand-deep`: `#E05020` -> `#C84C48`
  - `--brand-soft`: `#E6F8F7` -> `#FDEBEA`
- `docs/design/design-tokens.md` updated to record approved brand values and the approved "keep current" decisions for gray/surface/radius/shadow additive tokens
- API: none
- DB: none
- Status transitions: none
- Schema Change:
  - [x] None

## Out of Scope

- Changing `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` values
- Changing `--cook-*` cooking-method token values
- Changing gray text (`--text-2`, `--text-3`, `--text-4`), surface fill (`--surface-fill`, `--surface-subtle`), shadow (`--shadow-1`/`-2`/`-3`), or radius (`--radius-*`) additive token values
- Importing Jua or any prototype-only font
- Component, page, or layout file edits
- Shared component restyling
- HOME, RECIPE_DETAIL, or PLANNER_WEEK layout or structural changes
- Any API, DB, or status-transition change

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | Direction gate locks non-goals, rollout order, approval boundaries |
| `baemin-style-tokens-additive` | merged | Additive token foundation (`--brand-soft`, `--text-*`, `--surface-*`, `--shadow-*`, `--radius-*`) is already in `app/globals.css` |

## Approved Token Values

| Token | Current value | Approved value | Decision |
| --- | --- | --- | --- |
| `--brand` | `#FF6C3C` | `#ED7470` | User approved 2026-04-27 |
| `--brand-deep` | `#E05020` | `#C84C48` | User approved 2026-04-27 |
| `--brand-soft` | `#E6F8F7` | `#FDEBEA` | User approved 2026-04-27 |
| `--background` | `#fff9f2` | (keep current) | Not in scope for this slice |
| `--foreground` | `#1a1a2e` | (keep current) | Not in scope for this slice |
| `--muted` | `#5f6470` | (keep current) | Not in scope for this slice |
| `--surface` | `#ffffff` | (keep current) | Not in scope for this slice |
| `--panel` | `rgba(255,252,248,0.92)` | (keep current) | Not in scope for this slice |
| `--line` | `rgba(0,0,0,0.07)` | (keep current) | Not in scope for this slice |
| `--olive` | `#1f6b52` | (keep current) | Not in scope for this slice |
| `--cook-*` | (all current) | (keep current) | Not in scope for this slice |
| `--text-2/3/4` | (additive values) | (keep current) | Approved to stay as documented |
| `--surface-fill/subtle` | (additive values) | (keep current) | Approved to stay as documented |
| `--shadow-1/2/3` | (additive values) | (keep current) | Approved to stay as documented |
| `--radius-*` | (additive values) | (keep current) | Approved to stay as documented |

## Backend First Contract

No backend changes. Existing contracts must be preserved:

- API response envelope: `{ success, data, error }`
- `meals.status` transition sequence unchanged
- All existing `--cook-*` token values unchanged
- No endpoint, field, table, or status value may be added as part of this token value change

## Frontend Delivery Mode

- Touch only `app/globals.css` (3 value changes) and `docs/design/design-tokens.md` (record approved decisions).
- No component, page, or layout file may be edited in this slice.
- 5 UI states (`loading / empty / error / read-only / unauthorized`) must remain intact on all affected screens; this slice does not add or remove any.
- Value changes are user-approved; no additional approval needed before implementation.

## Design Authority

- UI risk: `low-risk` (token value swap only, no structural changes)
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` (brand tokens appear in CTA buttons, active tabs, badges, tint backgrounds on these screens)
- Visual artifact: before/after screenshots at Stage 4 (see Evidence Plan below)
- Authority status: `not-required` (low-risk token swap with user-approved values)
- Notes: design-generator and design-critic are skipped because this is a low-risk token value swap. The user explicitly approved the target values.

## Evidence Plan

Before/after screenshots covering brand-colored UI states:

| Screen | Required screenshots |
| --- | --- |
| `HOME` | `HOME-before-mobile.png`, `HOME-after-mobile.png`, `HOME-after-narrow-320.png` |
| `RECIPE_DETAIL` | `RECIPE_DETAIL-before-mobile.png`, `RECIPE_DETAIL-after-mobile.png`, `RECIPE_DETAIL-after-narrow-320.png` |
| `PLANNER_WEEK` | `PLANNER_WEEK-before-mobile.png`, `PLANNER_WEEK-after-mobile.png`, `PLANNER_WEEK-after-narrow-320.png` |

Evidence root: `ui/designs/evidence/baemin-style/token-values/`

## Design Status

- [x] Temporary (temporary) -- Stage 1 default; CSS value changes have not been applied yet
- [ ] Review pending (pending-review) -- Stage 4 complete, before/after screenshots captured
- [ ] Confirmed (confirmed) -- Stage 5/6 review passed
- [ ] N/A

> This is a low-risk token value swap. Design-generator / design-critic are skipped.
> Rationale: only 3 CSS variable values change; no component structure, layout, or interaction model is affected.
> Before/after screenshots at mobile default and 320px serve as visual evidence.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md`
- `docs/workpacks/baemin-style-tokens-additive/README.md`

## QA / Test Data Plan

- Fixture baseline: no changes.
- Real DB smoke: not required (CSS-only change).
- Browser smoke: before/after screenshots for HOME, RECIPE_DETAIL, PLANNER_WEEK at mobile default and 320px.
- Expected visual diff: brand-colored UI states only (CTA buttons, active tabs, badges, tint backgrounds).
- Required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm verify:frontend`
- Blocker criteria:
  - Horizontal overflow at mobile default or 320px
  - Text clipped inside brand-colored elements
  - Existing loading/empty/error/read-only/unauthorized states disappear
  - Non-brand token values changed

## Key Rules

- Only `--brand`, `--brand-deep`, `--brand-soft` values change. All other tokens stay at their current values.
- The `--brand-soft` additive token was introduced in `baemin-style-tokens-additive` with value `#E6F8F7`. This slice changes it to the user-approved `#FDEBEA`.
- No component, page, or layout file may be edited — the visual change propagates purely through CSS variable inheritance.
- `--cook-*` cooking-method color tokens must remain unchanged.
- No Jua or any prototype-only font may be imported.
- This is a user-approved decision; no contract-evolution PR is needed.

## Contract Evolution Candidates

None. The brand token value change is user-approved and does not affect API, DB, or status-transition contracts.

## Primary User Path

1. Claude changes `--brand`, `--brand-deep`, `--brand-soft` values in `app/globals.css` and updates `docs/design/design-tokens.md` (Stage 4).
2. Claude captures before/after screenshots for HOME, RECIPE_DETAIL, PLANNER_WEEK at mobile default and 320px.
3. Codex reviews visual diff: brand-colored states only, no layout regression, no horizontal overflow (Stage 5/6).
4. User confirms brand-colored UI states look correct after merge.

## Delivery Checklist

> Living closeout document. Stage 4 closes implementation items; Stage 5/6 reviews.
> Design-generator / design-critic skipped (low-risk token swap; user-approved values).

- [ ] `--brand` value changed from `#FF6C3C` to `#ED7470` in `app/globals.css` <!-- omo:id=bstv-brand-value;stage=4;scope=frontend;review=5,6 -->
- [ ] `--brand-deep` value changed from `#E05020` to `#C84C48` in `app/globals.css` <!-- omo:id=bstv-brand-deep-value;stage=4;scope=frontend;review=5,6 -->
- [ ] `--brand-soft` value changed from `#E6F8F7` to `#FDEBEA` in `app/globals.css` <!-- omo:id=bstv-brand-soft-value;stage=4;scope=frontend;review=5,6 -->
- [ ] `docs/design/design-tokens.md` updated to record approved brand values and "keep current" decisions for additive tokens <!-- omo:id=bstv-tokens-documented;stage=4;scope=frontend;review=5,6 -->
- [ ] No other CSS token values changed (`--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive`, `--cook-*`) <!-- omo:id=bstv-other-tokens-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] No component, page, or layout file edited <!-- omo:id=bstv-no-component-edit;stage=4;scope=frontend;review=5,6 -->
- [ ] No Jua or prototype-only font imported <!-- omo:id=bstv-no-font-import;stage=4;scope=frontend;review=5,6 -->
- [ ] Before/after screenshots for HOME, RECIPE_DETAIL, PLANNER_WEEK at mobile default and 320px <!-- omo:id=bstv-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` passes <!-- omo:id=bstv-verify-frontend;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Non-brand token value changed in `app/globals.css`
- Component, page, or layout file edited
- Jua or prototype-only font imported
- `--cook-*` token value changed
- `docs/design/design-tokens.md` not updated to match approved values
- Horizontal overflow or text clipping at mobile default or 320px
- Existing loading/empty/error/read-only/unauthorized state disappears
