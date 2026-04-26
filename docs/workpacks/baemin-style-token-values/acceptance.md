# Acceptance Checklist: baemin-style-token-values

> User-approved brand token value slice. Only `--brand`, `--brand-deep`, `--brand-soft` values change.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] Brand-colored UI states (CTA buttons, active tabs, badges) display `#ED7470` instead of `#FF6C3C` <!-- omo:id=bstv-accept-brand-visible;stage=4;scope=frontend;review=5,6 -->
- [x] Brand-deep states (hover, active, pressed) display `#C84C48` instead of `#E05020` <!-- omo:id=bstv-accept-brand-deep-visible;stage=4;scope=frontend;review=5,6 -->
- [x] Brand-soft states (tint backgrounds, active chip bg) display `#FDEBEA` instead of `#E6F8F7` <!-- omo:id=bstv-accept-brand-soft-visible;stage=4;scope=frontend;review=5,6 -->
- [x] `docs/design/design-tokens.md` records the approved brand values and "keep current" decisions for gray/surface/radius/shadow additive tokens <!-- omo:id=bstv-accept-tokens-documented;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] All C2 tokens except `--brand`, `--brand-deep`, `--brand-soft` remain unchanged in `app/globals.css` <!-- omo:id=bstv-accept-c2-stable;stage=4;scope=frontend;review=5,6 -->
- [x] `--cook-*` cooking-method tokens remain unchanged <!-- omo:id=bstv-accept-cook-stable;stage=4;scope=frontend;review=5,6 -->
- [x] Gray text additive tokens (`--text-2`, `--text-3`, `--text-4`) remain unchanged <!-- omo:id=bstv-accept-text-additive-stable;stage=4;scope=frontend;review=5,6 -->
- [x] Surface additive tokens (`--surface-fill`, `--surface-subtle`) remain unchanged <!-- omo:id=bstv-accept-surface-additive-stable;stage=4;scope=frontend;review=5,6 -->
- [x] Shadow additive tokens (`--shadow-1`, `--shadow-2`, `--shadow-3`) remain unchanged <!-- omo:id=bstv-accept-shadow-additive-stable;stage=4;scope=frontend;review=5,6 -->
- [x] Radius additive tokens (`--radius-sm/md/lg/xl/full`) remain unchanged <!-- omo:id=bstv-accept-radius-additive-stable;stage=4;scope=frontend;review=5,6 -->
- [x] H1/H2/H5 interaction decisions are unaffected <!-- omo:id=bstv-accept-h125-unchanged;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] No loading, empty, error, read-only, or unauthorized state is changed by this slice <!-- omo:id=bstv-accept-states-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] No new font dependency is introduced (no Jua, no prototype-only font) <!-- omo:id=bstv-accept-no-font-dep;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] No API field, endpoint, table, status, or seed data is changed <!-- omo:id=bstv-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] No component, page, or layout file is edited <!-- omo:id=bstv-accept-no-component-edit;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [x] HOME at mobile default: brand-colored elements use `#ED7470` <!-- omo:id=bstv-accept-home-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] HOME at 320px: no horizontal overflow, brand elements visible <!-- omo:id=bstv-accept-home-320;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL at mobile default: brand-colored elements use `#ED7470` <!-- omo:id=bstv-accept-detail-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL at 320px: no horizontal overflow, brand elements visible <!-- omo:id=bstv-accept-detail-320;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK at mobile default: brand-colored elements use `#ED7470` <!-- omo:id=bstv-accept-planner-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK at 320px: no horizontal overflow, brand elements visible <!-- omo:id=bstv-accept-planner-320;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] `h6-baemin-style-direction` is merged before implementation starts <!-- omo:id=bstv-accept-h6-merged;stage=4;scope=frontend;review=6 -->
- [x] `baemin-style-tokens-additive` is merged before implementation starts <!-- omo:id=bstv-accept-additive-merged;stage=4;scope=frontend;review=6 -->
- [x] No fixture changes required <!-- omo:id=bstv-accept-no-fixture;stage=4;scope=frontend;review=6 -->
- [x] No real DB smoke required (CSS-only change) <!-- omo:id=bstv-accept-no-db-smoke;stage=4;scope=frontend;review=6 -->

## Automation

- [x] `git diff --check` passes <!-- omo:id=bstv-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` passes <!-- omo:id=bstv-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm typecheck` passes <!-- omo:id=bstv-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` passes <!-- omo:id=bstv-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` passes <!-- omo:id=bstv-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] Final visual feel confirmation by user after merge
- [ ] Confirmation that brand-colored states across the app look intentional and cohesive
