# baemin-style-shared-components

> Baemin-style shared UI component foundation. This is NOT an anchor-screen retrofit slice.
> Dependencies: `h6-baemin-style-direction` (merged), `baemin-style-tokens-additive` (merged), `baemin-style-token-values` (merged).
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

Establish reusable shared UI primitives styled with the approved Baemin-style token foundation so that follow-up anchor-screen retrofit slices (`baemin-style-home-retrofit`, `baemin-style-recipe-detail-retrofit`, `baemin-style-planner-week-retrofit`) can consume them without re-inventing component styling. This slice creates or restyles shared component files only; full screen retrofits are out of scope.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-shared-components` |
| Implementation | `feature/fe-baemin-style-shared-components` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend / shared implementation | **Claude** | shared component creation/restyling |
| 5 | Design review | **Codex** | component state coverage, token usage, a11y basics |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

### Shared Component Primitives

The following shared primitives may be created as new files under `components/ui/` or restyled in existing `components/shared/` files. Each must use the approved token foundation and cover all documented states.

| Primitive | File target | States to cover |
| --- | --- | --- |
| Button (primary, secondary, neutral, destructive) | `components/ui/button.tsx` (new) | default, hover, pressed, disabled, loading |
| Chip (filter, selection) | `components/ui/chip.tsx` (new) | default, hover, active, disabled |
| Card surface wrapper | `components/ui/card.tsx` (new) | default, hover, pressed, skeleton/loading |
| Badge (status pill) | `components/ui/badge.tsx` (new) | default variants (brand, danger, olive, muted) |
| Empty state | `components/ui/empty-state.tsx` (new) | default, with-action |
| Error state | `components/ui/error-state.tsx` (new) | default, with-retry |
| Loading skeleton | `components/ui/skeleton.tsx` (new) | pulse animation |
| Existing `modal-header.tsx` restyling | `components/shared/modal-header.tsx` | align with approved h5 + Baemin token usage |
| Existing `modal-footer-actions.tsx` restyling | `components/shared/modal-footer-actions.tsx` | align with approved h5 + Baemin token usage |
| Existing `selection-chip-rail.tsx` restyling | `components/shared/selection-chip-rail.tsx` | token swap to approved values |

### Token Usage Contract

- All new/restyled components must use CSS variables from `app/globals.css` — no hardcoded hex values.
- Brand tokens: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA).
- Gray/surface/shadow/radius: use additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`).
- `--cook-*` tokens remain untouched.
- `--olive` usage in filter chips preserved per h5 decision.

### Other In-Scope Items

- `docs/design/design-tokens.md` — update component rules section if shared components introduce standardized patterns.
- API: none
- DB: none
- Status transitions: none
- Schema Change:
  - [x] None

## Out of Scope

- Full HOME screen retrofit (deferred to `baemin-style-home-retrofit`)
- Full RECIPE_DETAIL screen retrofit (deferred to `baemin-style-recipe-detail-retrofit`)
- Full PLANNER_WEEK screen retrofit (deferred to `baemin-style-planner-week-retrofit`)
- PANTRY or MYPAGE production scope before their official product slices
- AppBar creation or restyling (deferred to screen-specific retrofit slices where AppBar variants differ per screen)
- BottomTab creation or restyling (deferred to a retrofit slice that activates it across the app)
- Any API, DB, status-transition, endpoint, or auth contract change
- Importing Jua or any prototype-only font
- Copying prototype JSX/HTML into production directly
- Replacing existing screen information architecture
- Changing `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive`, `--cook-*` token values

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | Direction gate locks non-goals, rollout order, approval boundaries |
| `baemin-style-tokens-additive` | merged | Additive token foundation is in `app/globals.css` |
| `baemin-style-token-values` | merged | Brand tokens are at user-approved values (#ED7470, #C84C48, #FDEBEA) |
| `h5-modal-system-redesign` | merged | Sheet/modal family decisions are locked (icon close, olive accent, eyebrow removed) |

## Backend First Contract

No backend changes. Existing contracts must be preserved:

- API response envelope: `{ success, data, error }`
- `meals.status` transition sequence unchanged
- All existing `--cook-*` token values unchanged
- No endpoint, field, table, or status value may be added in this slice

## Frontend Delivery Mode

- New components under `components/ui/` styled with approved Baemin tokens.
- Restyle existing `components/shared/modal-header.tsx`, `modal-footer-actions.tsx`, `selection-chip-rail.tsx` to align with approved tokens.
- All components must support `loading / empty / error / disabled` states where applicable.
- No production visual diff should occur unless the restyled shared components are already imported by existing screens. If existing screens import restyled shared components and the visual diff is intentional, it must be captured and reviewed.
- Components must preserve existing TypeScript props interfaces — visual change only.

## Design Authority

- UI risk: `high-risk` (new shared UI components affect multiple future screens; restyled shared components may affect currently-rendered screens)
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` (through existing shared component imports like `selection-chip-rail.tsx`, `modal-header.tsx`, `modal-footer-actions.tsx`)
- Visual artifact: component state previews + before/after screenshots of any screen affected by shared component restyling
- Authority status: `required` (high-risk, touches existing shared components consumed by anchor screens)
- Notes: design-generator and design-critic are not required for individual atomic components. Authority review focuses on token usage correctness, component state coverage, and visual regression in screens that import restyled shared components.

## Evidence Plan

### Component Previews

Each new `components/ui/` primitive should have a visual preview showing all documented states (default, hover, active, disabled, loading, error as applicable). Evidence root: `ui/designs/evidence/baemin-style/shared-components/`

### Anchor Screen Regression

If restyled `components/shared/*` files cause visual changes in currently-rendered screens, before/after screenshots are required:

| Screen | Trigger | Required screenshots |
| --- | --- | --- |
| `HOME` | `selection-chip-rail.tsx` restyle | `HOME-before-mobile.png`, `HOME-after-mobile.png`, `HOME-after-narrow-320.png` |
| `RECIPE_DETAIL` | `modal-header.tsx` / `modal-footer-actions.tsx` restyle | `RECIPE_DETAIL-before-mobile.png`, `RECIPE_DETAIL-after-mobile.png`, `RECIPE_DETAIL-after-narrow-320.png` |
| `PLANNER_WEEK` | shared component restyle propagation | `PLANNER_WEEK-before-mobile.png`, `PLANNER_WEEK-after-mobile.png`, `PLANNER_WEEK-after-narrow-320.png` |

If no existing screen is visually affected (e.g., new `components/ui/` files are not yet imported anywhere), the anchor screen evidence may be deferred with documented rationale.

## Design Status

- [x] Temporary (temporary) — Stage 1 default; shared components not yet created or restyled
- [ ] Review pending (pending-review) — Stage 4 complete, component previews and regression evidence captured
- [ ] Confirmed (confirmed) — Stage 5/6 review passed, authority review passed
- [ ] N/A

> This is a high-risk UI change slice. Authority review is required.
> Design-generator / design-critic are skipped for individual atomic components.
> Rationale: components are primitives styled with already-approved tokens; authority focuses on state coverage and regression.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md`
- `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (REFERENCE ONLY)

## QA / Test Data Plan

- Fixture baseline: no changes to test fixtures.
- Real DB smoke: not required (component-level changes only).
- Browser smoke: component state previews + anchor screen regression screenshots where affected.
- Exploratory QA: required by default for this high-risk UI change. If Codex later validates a low-risk skip rationale, it must be recorded in the PR.
- Required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm verify:frontend`
- Blocker criteria:
  - Horizontal overflow at mobile default or 320px on any affected screen
  - Text clipped inside brand-colored elements
  - Existing loading/empty/error/read-only/unauthorized states disappear from any screen
  - Non-approved token values hardcoded in components
  - `--cook-*` token values changed
  - H1/H2/H5 interaction decisions violated

## Key Rules

- All shared components must use CSS variables from the approved token foundation — no hardcoded hex colors.
- Existing TypeScript props interfaces must be preserved. Visual-only changes.
- `--cook-*` cooking-method color tokens must remain unchanged.
- No Jua or any prototype-only font may be imported.
- Prototype `HANDOFF.md` component specs are REFERENCE ONLY, not production contract. Adapt to existing project patterns.
- H5 modal-system decisions are locked (icon close, olive accent, eyebrow removed). Shared modal/sheet restyling must honor these.
- H1/H2 screen structure decisions are locked. Shared components must not assume a different information architecture.
- If restyling an existing shared component causes visual regression in a live screen, the regression must be intentional, documented, and evidence-captured.

## Contract Evolution Candidates

None. This slice is visual-only within approved direction and token boundaries.

## Primary User Path

1. Claude creates new `components/ui/` primitives and restyles existing `components/shared/` files using approved tokens (Stage 4).
2. Claude runs `pnpm verify:frontend` and captures component state previews.
3. If existing screens are visually affected, Claude captures before/after screenshots at mobile default and 320px.
4. Codex reviews component state coverage, token usage, a11y basics, and any visual regression (Stage 5/6).
5. Follow-up retrofit slices import shared components to apply Baemin styling to anchor screens.

## Delivery Checklist

> Living closeout document. Stage 4 closes implementation items; Stage 5/6 reviews.
> Design-generator / design-critic skipped (atomic components; authority review covers regression).

- [ ] New `components/ui/button.tsx` with all documented states <!-- omo:id=bssc-button;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/chip.tsx` with all documented states <!-- omo:id=bssc-chip;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/card.tsx` surface wrapper <!-- omo:id=bssc-card;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/badge.tsx` status pill variants <!-- omo:id=bssc-badge;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/empty-state.tsx` <!-- omo:id=bssc-empty-state;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/error-state.tsx` <!-- omo:id=bssc-error-state;stage=4;scope=frontend;review=5,6 -->
- [ ] New `components/ui/skeleton.tsx` loading primitive <!-- omo:id=bssc-skeleton;stage=4;scope=frontend;review=5,6 -->
- [ ] Existing `modal-header.tsx` restyled with approved tokens <!-- omo:id=bssc-modal-header;stage=4;scope=frontend;review=5,6 -->
- [ ] Existing `modal-footer-actions.tsx` restyled with approved tokens <!-- omo:id=bssc-modal-footer;stage=4;scope=frontend;review=5,6 -->
- [ ] Existing `selection-chip-rail.tsx` restyled with approved tokens <!-- omo:id=bssc-chip-rail;stage=4;scope=frontend;review=5,6 -->
- [ ] All components use CSS variables only — no hardcoded hex <!-- omo:id=bssc-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] Component state previews captured <!-- omo:id=bssc-component-previews;stage=4;scope=frontend;review=5,6 -->
- [ ] Anchor screen regression screenshots if existing screens affected <!-- omo:id=bssc-regression-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] No `--cook-*` token values changed <!-- omo:id=bssc-cook-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] No Jua or prototype-only font imported <!-- omo:id=bssc-no-font;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` passes <!-- omo:id=bssc-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle or low-risk skip rationale recorded <!-- omo:id=bssc-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Hardcoded hex colors in new or restyled components
- Component, page, or layout file outside the declared scope edited
- Jua or prototype-only font imported
- `--cook-*` token value changed
- H1/H2/H5 interaction decisions violated
- Horizontal overflow or text clipping at mobile default or 320px on any affected screen
- Existing loading/empty/error/read-only/unauthorized state disappears from any screen
- Unresolved authority blocker at Stage 5
- Exploratory QA not run and no valid skip rationale recorded
