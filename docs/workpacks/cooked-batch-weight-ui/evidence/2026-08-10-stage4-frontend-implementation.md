# Stage 4 frontend implementation evidence — 2026-08-10

## Scope and lineage

- Workpack: `cooked-batch-weight-ui` (#11)
- Task: `019fe7b3-881f-7152-b3fc-9ca58b5dba2a`
- Role: fresh Stage 4 frontend implementer; not Stage 5, final product-design authority, or Stage 6
- Exact base: `origin/master` `8b1a4cce57e05d282c2a01fc54557ffc129fae1d`, tree `7545e8eb04142f210f9f230d1ab49c1cbde7a957` (merged Stage 1 PR #1318)
- Branch: `feature/fe-cooked-batch-weight-ui`
- Implementation evidence target: head `d6843baa6d27addea5d79fa991c937dfc6dbf070`, tree `0fa3545f9ec22d83dd4e969f1eef70364a2297ba`
- Draft PR: [#1320](https://github.com/netsus/homecook/pull/1320), created as Draft; Ready/merge remain untouched
- Public contract/schema/status/error/action expansion: none
- Remote Supabase, production/staging, Vercel, server-Mac, OAuth, Cloudflare, migration, capability, R/R+1/R+2, activation and Discord mutation: none

Stage 4 consumes the already merged #8 `0-CBW` TypeScript/API/runtime contract exactly. It does not change `app/api/v1/cooked-batches/**`, public `CookedBatchProjection`, cooked-batch server helpers/RPC/migrations, meal-log DB/API/write/events/pointers, or #12 consumed-amount UI.

## TDD RED → GREEN

1. Dependency installation first used the frozen lockfile; `package.json` and `pnpm-lock.yaml` remained unchanged.
2. Intended RED: the four focused files failed because the completion sheet, cooked-batch state helper and lifecycle surfaces did not exist.
3. Intended RED: history tests failed because the exact #8 client functions were absent; LEFTOVERS integration failed because the second section did not exist.
4. Accessibility RED: the newly scoped action-sheet axe check exposed a `3.85:1` submit-button contrast failure.
5. GREEN: completion/action sheets, exact client parsing, lifecycle truth, pagination, server-projection refresh and official high-contrast tokens pass `5 files / 43 tests`.
6. GREEN: the automation command now collects the slice-prefixed evidence spec and passes `2 / 2`, with `2` mobile-project skips intentionally delegating the exact 320/390/1440 matrix to the desktop project.

The implementation preserves exact-one `set_finished_weight | weigh_later`, food-only grams, local-only tare values, idempotency replay identity, 409/422 inputs and focus. LEFTOVERS keeps legacy and v2 as separate sections, never guesses null projection truth, paginates with the opaque cursor, removes all lifecycle actions from depleted cards, and exposes `cancel_current` only for the exact non-null `current_unweighed_closure_event_id`.

## Runtime design and accessibility evidence

Canonical manifest: `ui/designs/evidence/cooked-batch-weight-ui/manifest.json`

- capture time: `2026-08-09T19:12:15.711Z`
- implementation target: `d6843baa6d27addea5d79fa991c937dfc6dbf070` / `0fa3545f9ec22d83dd4e969f1eef70364a2297ba`
- viewport matrix: `320`, `390`, `1440`
- screenshot PNGs: `15` (`4` before, `11` implementation/state evidence)
- runtime JSON artifacts: `2`
- original dimensions inspected: COOK_MODE `320x568`, `390x844`, `1440x1000`; LEFTOVERS `320x568–2352`, `390x844–3472`, `1440x2127`

The matrix covers known, weigh-later, local container helper, pending/error/replay, known/missing/unrecoverable/legacy-null, pagination, all depleted reason labels, action and pending/error sheets. Runtime assertions prove focus trap/restore, pending Escape lock, replay-key reuse and no horizontal overflow at all three widths. Automated viewport evidence does not prove a physical keyboard or virtual-keyboard behavior.

### Exact accessibility scope boundary

- Existing COOK_MODE full-page residual: one inherited `color-contrast` violation category, exactly `2` nodes. These predate #11 and are outside its ownership.
- New #11 completion/action sheets and LEFTOVERS cooked-batch section, selector-scoped: serious/critical `0`.
- This is **not** a page-wide serious/critical-zero claim. Full WCAG, VoiceOver/TalkBack and physical assistive-technology evidence remain Manual Only.

The boundary is machine-readable in `runtime-axe-wcag.json` and `manifest.json` and must be carried unchanged into authority precheck, Stage 5, final authority and Stage 6 handoffs.

## Verification

- focused ESLint — pass
- focused component/history Vitest — `5 files / 43 tests` pass
- exact #11 Playwright automation — `2 pass / 2 intended skip`
- #8 + #11 focused Playwright compatibility — `8 pass`
- `pnpm verify:frontend` at the exact implementation target — exit `0`
  - lint and typecheck — pass
  - product Vitest — `227 files / 2,698 tests` pass; `11 files / 150 tests` intended skip
  - Next production build — pass; `78` static pages generated
  - Lighthouse — `2 URLs × 3 runs` pass
  - full Playwright regression — `952 pass / 170 intended skip`
  - a11y — `18 pass / 15 intended skip`
  - visual — `23 pass / 22 intended skip`
  - security — `12 pass`
- exploratory QA eval — score `93`, validation errors `0`, covered `52/63`, blocked `11/63`
- exploratory QA evidence validator — pass
- `pnpm audit --audit-level high` — exit `0`; high/critical `0/0`, residual low/moderate `1/1`
- source-of-truth/workpack/automation/workflow/bookkeeping/authority-presence validators — pass before final documentation lock and rerun for final Draft PR head
- `git diff --check` — pass

The full frontend run used local deterministic Next/Playwright fixtures. Missing local Supabase environment variables were logged when inherited legacy fixtures fell through to real route handlers, but the test matrix remained green and no remote Supabase call or mutation was performed. The #11 and shared LEFTOVERS visual fixtures now mock cooked-batches deterministically.

## Author quality review, not independent approval

The five-axis author review checked correctness, readability, architecture, security and performance against the full base diff. It found no Critical or Important blocker after the scoped contrast repair and deterministic visual-fixture repair. This is only a Draft-PR author quality gate: it is not an internal 1.5, Stage 5, design critic, final authority or Stage 6 approval.

## Ownership and sequential handoff

- `docs/workpacks/README.md` and `.workflow-v2/status.json` were intentionally not edited because the parallel #9/shared lane owns them.
- After #9 is integrated, that shared owner must sequentially project #11 as `pending-review` with this implementation target and Draft PR, without marking Stage 5/final authority/Stage 6 complete.
- #9 retains every meal-log backend surface; #12 retains consumed-amount add/edit/delete UI and CTA.

## Findings and repairs

- Action-sheet submit contrast: scoped axe RED at `3.85:1`; repaired with existing `brand-primary-text` and `danger-strong` tokens, no new token or hex.
- Dialog focus cycle: a temporary tabbable title introduced a regression against #8; restored the programmatic heading and locked the real close/confirm boundary.
- LEFTOVERS trigger restoration: server refresh can replace the trigger node; restoration now resolves the current card/action trigger after projection refresh.
- Shared LEFTOVERS visual fixture: cooked-batches now has explicit ready/empty projection fixtures, avoiding environment fallthrough and unstable page height.
- Existing full-page COOK_MODE contrast residual: `2` nodes retained and reported, not repaired or hidden.
- Invalidated Draft head `15faebf1ad2346dcb3056b479121a214353fe3ca`: QA `smoke` stopped before test execution because the GitHub runner received a location-restricted Playwright CDN `403` while downloading Chrome Headless Shell. It is infrastructure evidence only, was not rerun, and is not used as Stage 4 proof; a successor head must pass its own complete check set.

## Contract Evolution Candidate

None. No field, endpoint, status, error, action or screen outside the official merged contract was required.

## Pending and not claimed

- current-head Draft PR #1320 checks until every started check is terminal green or intended skip
- fresh authority precheck
- independent Stage 5
- final product-design authority
- independent Stage 6
- physical iOS Safari, virtual keyboard, VoiceOver/TalkBack and Manual QA
- server-Mac/OAuth and merged-exact-SHA read-only rehearsal
- R/R+1/R+2 drain/rollback and activation
- shared roadmap/status projection by the later #9/shared owner
- Ready transition, merge and Discord notification

## Status projection

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- Design Status: `pending-review`
- Stage 5/final authority/Stage 6 self-approval: no
- Ready/merge/activation/Discord: not performed
