# Acceptance Checklist: baemin-style-tokens-additive

This acceptance file covers the additive token foundation slice only. Token value changes and component restyling are deferred to follow-up slices.

## Stage 1 Gate Acceptance

| # | Criteria | Status |
| --- | --- | --- |
| A1 | `h6-baemin-style-direction` merged before implementation starts | ✅ required gate |
| A2 | Only `app/globals.css` and `docs/design/design-tokens.md` are changed | ✅ constrained scope |
| A3 | No existing C2 token values are modified | ✅ additive-only rule |
| A4 | New tokens are not referenced by any component in this slice | ✅ isolated foundation |
| A5 | No Jua or prototype-only font is imported | ✅ font guard |
| A6 | Expected outcome is no visual diff | ✅ verified by CI |

## Happy Path

- [ ] A reviewer can confirm `app/globals.css` diff is additive-only (new variables, no changed values) <!-- omo:id=bsta-accept-additive-diff;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can confirm `docs/design/design-tokens.md` records all new tokens with values and roles <!-- omo:id=bsta-accept-tokens-documented;stage=4;scope=frontend;review=5,6 -->
- [ ] No component, page, or layout file in the diff references the new CSS variables <!-- omo:id=bsta-accept-no-component-ref;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] `--brand`, `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line` values are unchanged <!-- omo:id=bsta-accept-c2-values-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] `--cook-*` cooking-method tokens are unchanged <!-- omo:id=bsta-accept-cook-tokens-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] H1/H2/H5 decisions remain unaffected by this slice <!-- omo:id=bsta-accept-h125-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] New tokens follow the naming convention from the token candidate table in README <!-- omo:id=bsta-accept-naming-convention;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] No loading, empty, error, or read-only state is changed by this slice <!-- omo:id=bsta-accept-states-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] No new font dependency is introduced <!-- omo:id=bsta-accept-no-font-dep;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] No API field, endpoint, table, status, or seed data is changed <!-- omo:id=bsta-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [ ] `pnpm verify:frontend` passes <!-- omo:id=bsta-accept-verify-pass;stage=4;scope=frontend;review=5,6 -->
- [ ] Before/after screenshots confirm no intentional visual diff <!-- omo:id=bsta-accept-no-visual-diff;stage=4;scope=frontend;review=5,6 -->
- [ ] Any unintended visual change is treated as a blocker <!-- omo:id=bsta-accept-visual-blocker;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] No fixture changes are required <!-- omo:id=bsta-accept-no-fixture;stage=4;scope=frontend;review=5,6 -->
- [ ] No real DB smoke is required <!-- omo:id=bsta-accept-no-db-smoke;stage=4;scope=frontend;review=5,6 -->

## Automation

- [ ] `git diff --check` passes <!-- omo:id=bsta-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` passes <!-- omo:id=bsta-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm typecheck` passes <!-- omo:id=bsta-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm lint` passes <!-- omo:id=bsta-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` passes <!-- omo:id=bsta-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- Final token value review by user before `baemin-style-token-values` slice begins.
- Confirmation that no unintended visual change occurred.
