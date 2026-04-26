# baemin-style-tokens-additive

> Stage 1 workpack. Claude owns Stages 1, 3, 4; Codex owns Stages 2, 5, 6.
> Dependency: `h6-baemin-style-direction` must be merged before implementation begins.

## Goal

Add non-conflicting CSS variables to `app/globals.css` that follow-up Baemin-style slices will consume. No existing C2 token value is changed. No component references the new tokens in this slice. Expected outcome: zero visual diff.

## Branches

| Type | Branch |
| --- | --- |
| Docs gate | `docs/baemin-style-tokens-additive` |
| Implementation | `feature/fe-baemin-style-tokens-additive` |

## In Scope

- New CSS variables in `app/globals.css` (additive only):
  - Brand soft tint: `--brand-soft`
  - Surface fills: `--surface-fill`, `--surface-subtle`
  - Text hierarchy extensions: `--text-2`, `--text-3`, `--text-4`
  - Shadow scale: `--shadow-1`, `--shadow-2`, `--shadow-3`
  - Radius scale extensions: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full`
- `docs/design/design-tokens.md` updated to record all new tokens with values and roles
- API: none
- DB: none
- Status transitions: none
- Schema Change:
  - [x] None

## Out of Scope

- Changing `--brand`, `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, or any other existing C2 token value
- Importing Jua or any prototype-only font
- Applying new tokens to any component, page, or layout file in this slice
- Restyling HOME, RECIPE_DETAIL, or PLANNER_WEEK
- Shared component restyling
- Any API, DB, or status-transition change

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | Direction gate locks non-goals and approval boundaries |

## Backend First Contract

No backend changes. Existing contracts must be preserved:

- API response envelope: `{ success, data, error }`
- `meals.status` transition sequence unchanged
- All existing `--cook-*` token values unchanged

## Frontend Delivery Mode

- Touch only `app/globals.css` (new variables) and `docs/design/design-tokens.md` (record them).
- No component file, route file, or layout file may reference the new tokens in this slice.
- Candidate values are sourced from `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (reference only — see guard in that file).
- Value changes to existing tokens are blocked until `baemin-style-token-values` slice receives explicit user approval.

## Token Candidates

Candidates for additive CSS variables. Final values are authored by Codex in Stage 2 and reviewed by Claude in Stage 3. No value is authoritative until merged.

| Token | Role | Prototype source |
| --- | --- | --- |
| `--brand-soft` | Brand tint background (active chip bg, state pill bg) | `mintSoft: #E6F8F7` |
| `--surface-fill` | Input fields, inactive chip background | `surfaceFill: #F8F9FA` |
| `--surface-subtle` | Section backgrounds, chip hover | `surfaceSubtle: #F1F3F5` |
| `--text-2` | Subtitle / description text | `text2: #495057` |
| `--text-3` | Secondary metadata | `text3: #868E96` |
| `--text-4` | Disabled text | `text4: #ADB5BD` |
| `--shadow-1` | Subtle card elevation | prototype shadow scale natural |
| `--shadow-2` | Moderate elevation (sheets, dropdowns) | prototype shadow scale medium |
| `--shadow-3` | High elevation (overlays) | prototype shadow scale crisp |
| `--radius-sm` | Chip, badge | prototype 6px |
| `--radius-md` | Button, input | prototype 8–10px |
| `--radius-lg` | Card | prototype 12–16px |
| `--radius-xl` | Sheet top | prototype 20px |
| `--radius-full` | Pill / avatar | 9999px |

Prototype source reference: `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (REFERENCE ONLY).

## Design Authority

- UI risk: `low` (additive tokens only, no visual change expected in this slice)
- Authority required: no, for this slice
- Evidence requirement: before/after screenshots confirm no intentional visual diff
- Unintended visual change is a blocker even if it appears minor

## QA / Test Data Plan

- Fixture baseline: no changes.
- Real DB smoke: not required.
- Browser smoke: not required.
- Expected visual diff: none.
- Required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm verify:frontend`
- `execution_mode: manual` — single-file CSS addition; manual merge gate ensures no existing value is accidentally touched.

## Primary User Path

1. Codex adds new CSS variables to `app/globals.css` and records them in `docs/design/design-tokens.md` (Stage 2).
2. Claude reviews that no existing C2 values changed and no component references new tokens (Stage 3).
3. CI runs `pnpm verify:frontend`; no visual diff expected.
4. User reviews the token candidate values before merge (Stage 4).

## Delivery Checklist

- [ ] New CSS variables added to `app/globals.css` without modifying existing C2 values <!-- omo:id=bsta-tokens-added;stage=4;scope=frontend;review=5,6 -->
- [ ] `docs/design/design-tokens.md` updated to record all new additive tokens with values and roles <!-- omo:id=bsta-tokens-documented;stage=4;scope=frontend;review=5,6 -->
- [ ] No component or page file in the diff references the new CSS variables <!-- omo:id=bsta-no-component-use;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` passes with no visual diff <!-- omo:id=bsta-no-visual-diff;stage=4;scope=frontend;review=5,6 -->
- [ ] `--brand`, `--background`, `--foreground`, and all existing C2 tokens remain unchanged <!-- omo:id=bsta-c2-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] No Jua or prototype-only font is imported <!-- omo:id=bsta-no-font-import;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Existing C2 token value changed
- New tokens applied to any component in this slice
- Jua or prototype-only font imported
- Visual diff produced (intentional or unintentional)
- `docs/design/design-tokens.md` not updated to match `app/globals.css`
