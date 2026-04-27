# Acceptance Checklist: baemin-style-shared-components

> Baemin-style shared UI component foundation. New `components/ui/` primitives and existing `components/shared/` restyles.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### New Primitives (`components/ui/`)

- [ ] Button renders all variants (primary, secondary, neutral, destructive) and states (default, hover, pressed, disabled, loading) <!-- omo:id=bssc-accept-button-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Chip renders filter and selection variants with states (default, hover, active, disabled) <!-- omo:id=bssc-accept-chip-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Card surface wrapper renders states (default, hover, pressed, skeleton/loading) <!-- omo:id=bssc-accept-card-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Badge renders all variants (brand, danger, olive, muted) <!-- omo:id=bssc-accept-badge-variants;stage=4;scope=frontend;review=5,6 -->
- [ ] EmptyState renders default and with-action variants <!-- omo:id=bssc-accept-empty-state;stage=4;scope=frontend;review=5,6 -->
- [ ] ErrorState renders default and with-retry variants <!-- omo:id=bssc-accept-error-state;stage=4;scope=frontend;review=5,6 -->
- [ ] Skeleton renders with pulse animation <!-- omo:id=bssc-accept-skeleton;stage=4;scope=frontend;review=5,6 -->

### Restyled Shared Components (`components/shared/`)

- [ ] `modal-header.tsx` restyled with approved h5 + Baemin token usage <!-- omo:id=bssc-accept-modal-header-restyle;stage=4;scope=frontend;review=5,6 -->
- [ ] `modal-footer-actions.tsx` restyled with approved h5 + Baemin token usage <!-- omo:id=bssc-accept-modal-footer-restyle;stage=4;scope=frontend;review=5,6 -->
- [ ] `selection-chip-rail.tsx` restyled with approved token swap <!-- omo:id=bssc-accept-chip-rail-restyle;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] All components use CSS variables from `app/globals.css` — no hardcoded hex values <!-- omo:id=bssc-accept-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] Brand tokens used: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA) <!-- omo:id=bssc-accept-brand-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] Additive tokens used where applicable (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`) <!-- omo:id=bssc-accept-additive-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] `--cook-*` cooking-method tokens remain unchanged <!-- omo:id=bssc-accept-cook-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] `--olive` usage in filter chips preserved per h5 decision <!-- omo:id=bssc-accept-olive-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] H1/H2/H5 interaction decisions unaffected <!-- omo:id=bssc-accept-h125-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 modal-system decisions honored: icon close, olive accent, eyebrow removed <!-- omo:id=bssc-accept-h5-modal-locked;stage=4;scope=frontend;review=5,6 -->
- [ ] Existing TypeScript props interfaces preserved — visual-only changes on restyled components <!-- omo:id=bssc-accept-props-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] No existing loading, empty, error, read-only, or unauthorized state disappears from any screen <!-- omo:id=bssc-accept-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] No Jua or prototype-only font imported <!-- omo:id=bssc-accept-no-font-dep;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] No API field, endpoint, table, status, or seed data is changed <!-- omo:id=bssc-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] No `--cook-*` token value changed <!-- omo:id=bssc-accept-cook-token-value;stage=4;scope=frontend;review=5,6 -->
- [ ] No `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` token values changed <!-- omo:id=bssc-accept-c2-values-stable;stage=4;scope=frontend;review=5,6 -->

## Scope Guard

- [ ] Only `components/ui/` (new) and `components/shared/modal-header.tsx`, `modal-footer-actions.tsx`, `selection-chip-rail.tsx` (restyle) are in diff <!-- omo:id=bssc-accept-scope-guard;stage=4;scope=frontend;review=5,6 -->
- [ ] No full screen retrofit (HOME, RECIPE_DETAIL, PLANNER_WEEK layout changes) <!-- omo:id=bssc-accept-no-screen-retrofit;stage=4;scope=frontend;review=5,6 -->
- [ ] No AppBar or BottomTab creation or restyling <!-- omo:id=bssc-accept-no-appbar-bottomtab;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype `HANDOFF.md` component specs used as REFERENCE ONLY, not production contract <!-- omo:id=bssc-accept-handoff-reference-only;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [ ] Component state previews captured for each new `components/ui/` primitive <!-- omo:id=bssc-accept-component-previews;stage=4;scope=frontend;review=5,6 -->
- [ ] Anchor screen regression screenshots captured if existing screens affected by restyled `components/shared/` files <!-- omo:id=bssc-accept-regression-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] No horizontal overflow at mobile default or 320px on any affected screen <!-- omo:id=bssc-accept-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] No text clipped inside brand-colored elements <!-- omo:id=bssc-accept-no-text-clip;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] `h6-baemin-style-direction` is merged before implementation starts <!-- omo:id=bssc-accept-h6-merged;stage=4;scope=frontend;review=6 -->
- [ ] `baemin-style-tokens-additive` is merged before implementation starts <!-- omo:id=bssc-accept-additive-merged;stage=4;scope=frontend;review=6 -->
- [ ] `baemin-style-token-values` is merged before implementation starts <!-- omo:id=bssc-accept-token-values-merged;stage=4;scope=frontend;review=6 -->
- [ ] No fixture changes required <!-- omo:id=bssc-accept-no-fixture;stage=4;scope=frontend;review=6 -->

## Automation

- [ ] `git diff --check` passes <!-- omo:id=bssc-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` passes <!-- omo:id=bssc-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm typecheck` passes <!-- omo:id=bssc-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm lint` passes <!-- omo:id=bssc-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` passes <!-- omo:id=bssc-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle or low-risk skip rationale recorded <!-- omo:id=bssc-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] Final component visual feel confirmation by user after merge
- [ ] Confirmation that restyled shared components look intentional and cohesive in screens that import them
- [ ] Confirmation that new `components/ui/` primitives are ready for consumption by follow-up retrofit slices
