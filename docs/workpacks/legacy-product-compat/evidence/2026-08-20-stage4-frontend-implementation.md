# Stage 4 frontend implementation evidence — 2026-08-20

## Scope and lineage

- workpack: `legacy-product-compat` (#13), Stage 4 frontend implementer
- author task: `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`; Stage 2/3 and review tasks와 별개이며 자기 Stage 5/6을 승인하지 않는다.
- base/parent: `origin/master` exact `9da127e806743e78ec103292907ec42bda566338`, tree `fbbdb2f0b8276dede72b2bec2348d3bfb49c9262`
- branch: `feature/fe-legacy-product-compat`; Draft PR [#1371](https://github.com/netsus/homecook/pull/1371)
- implementation commit: `3ca8320cd61b0a74e4ac682ce9c7661b0a675341`; parent `9da127e806743e78ec103292907ec42bda566338`; tree `f2108955c1bf17a2bba3f3bbb8570c6c6200f6fc`
- browser evidence commit: `c7920dc89a69579429a15198a0bd4769646154b3`; parent `3ca8320cd61b0a74e4ac682ce9c7661b0a675341`; tree `a2d10a217425e3dac0e54139f730181b3c9a5e04`
- retry-path repair commit: `d0748d8c6f60e235d5b42c7ed77bdf7ea3b245a7`; parent `a591ebafa619a992b52a9a576e41e7a45b18f011`; tree `6e041c45e4dcc4f09737fca1200f72ce914d1706`
- public API/schema/field/status/error/action/screen/route/dependency change: none
- Contract Evolution Candidate: none

## TDD RED → GREEN

- first corrected RED: `3 files / 5 failures`.
  - planner and standalone legacy completion header was `null` instead of the stable UUID.
  - planner and standalone retry key was `undefined`.
  - two immediate delete confirmations called the destructive handler twice.
- browser RED: nested delete confirmation → detail close lost the original legacy row invoker focus at every tested project.
- retry-path RED: completion failure 뒤 같은 session/recipe reader reload가 보존한 key를 지워 planner/standalone 각각 새 key를 만들었다 (`2 failed / 4 passed`).
- minimal GREEN:
  - v1 planner/standalone completion clients accept and send the stable UUID header while returning the unchanged no-key-era response data.
  - Zustand stores retain `{ canonical payload, key }` across retryable failures, rotate on payload change, and clear on success/new session.
  - same session 또는 같은 recipe+servings reader reload는 실패 attempt를 유지하고, 다른 target reload만 attempt를 지운다.
  - legacy delete owns an immediate ref + rendered pending lock; error keeps the confirmation/detail/row mounted.
  - legacy detail registers its exact row invoker as the explicit return-focus target without changing the shared dialog hook.
- focused GREEN: `10 files / 133 tests`.
- legacy focused GREEN after final refinement: `3 files / 17 tests`.

## Existing behavior reused, not duplicated

- stored `contract_version` dispatch remains `lib/cooking/session-version-dispatch.ts`; v1 and snapshot-v2 href/parser namespaces stay separate.
- seeded snapshot-v2 start/read/cancel/complete validation and flag-off drain stay in the existing `lib/api/cooking.ts`, `SnapshotV2CookModeScreen`, and route tests.
- `PLANNER_WEEK` loading/empty/error/read-only/unauthorized branches and owner-only delete API remain the predecessor runtime.
- no product POST/PATCH producer, planner nutrition UI call, migration/current-repin action, or new detail route was added.

## Browser evidence

- command: `pnpm test:e2e:regression:ci --grep legacy-product-compat`
- result: `14/14 passed` across `desktop-chrome` and `mobile-chrome`.
- exact in-test viewport matrix: `390x844`, `320x693`, `1280x900`.
- verified:
  - legacy row/detail/delete-only and pinned presentation
  - loading, empty, load-error+retry, read-only, unauthorized return-to-action
  - duplicate delete request count `1`, disabled `삭제 중`, error row/detail retention
  - detail and confirmation focus trap, `Escape`, nested focus restore, final row invoker restore
  - detail/page horizontal overflow `0`
- this is deterministic local mocked-route evidence. Physical device, virtual keyboard, VoiceOver/TalkBack and full WCAG remain Manual Only.

## Verification snapshot

- `pnpm lint`: pass
- `pnpm typecheck`: pass
- focused Vitest: `10 files / 133 tests` pass
- product Vitest through `verify:frontend:pr`: `239 files passed / 12 intended skip`; `2,757 passed / 175 intended skip`
- production build: pass; `81` static pages
- core smoke: `62 passed / 10 intended skip`
- core accessibility: `8 passed / 1 intended skip`
- core visual: `12/12 passed`
- `pnpm verify:frontend:pr`: successor projection head `ef2f92d7cea10c0731cdbcdd9850b5b02e7d2207`에서 pass; product `2,757/175`, build 81 pages, smoke `62/10`, core a11y `8/1`, core visual `12/12`
- clean-head `pnpm verify:frontend` at `a591ebafa619a992b52a9a576e41e7a45b18f011`: pass — Lighthouse `2 URLs × 3 runs`; complete regression `963 passed / 180 intended skip`; full accessibility `18/15`; full visual `22/23`; security `12/12`
- `pnpm audit --audit-level high`: exit `0`; high/critical `0/0`, residual pre-existing low/moderate `1/1`
- `git diff --check`: pass

The first `verify:frontend:pr` run caught a test-helper-only regression: object spread froze the live `mealLog` counter at zero. The helper now returns the original mutable counter object; the isolated smoke rerun passed `3/3`, and the full fast gate then passed. This did not affect production code.

The first full-gate attempt ran before the projection commit and the clean-head-only meal-log evidence test rejected the dirty worktree (`962 pass / 180 intended skip / 1 expected infrastructure failure`). After committing the Stage 4 projection, the exact clean-head rerun passed the complete gate with `963/180`; no product repair was made for that predecessor test.

## QA and Design Status

- change intensity: `low-risk` regression on existing surfaces
- `authority_required=false`; new design-generator/critic/authority artifact: none
- exploratory QA / qa eval: `N/A` with rationale — no new screen or visual composition, and exact mocked-route Playwright directly covers the required state, recovery, focus, and 390/320/desktop matrix.
- exact predecessor references retained:
  - `ui/designs/authority/PLANNER_WEEK-authority.md`
  - `ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md`
  - `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md`
- Design Status: `pending-review`, not `confirmed`.

## Pending and not claimed

- Draft PR #1371 current-head checks and complete template refresh after projection commit
- fresh Stage 5 lightweight design review and independent Stage 6 closeout review
- Ready transition, merge, final workpack closeout, Discord
- physical device/keyboard/screen reader/virtual keyboard/full WCAG
- controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, callable inventory/negative privilege, server-Mac/OAuth
- capability, exact required-key activation, R/R+1/R+2, production activation, destructive tombstone/removal

Production/staging/remote application writes are `0/0/0`. Claude was not used.

## Bounded author-side review

- helper role: read-only `code-reviewer`; Stage 5/6 또는 authority 승인 아님
- initial result: runtime CRITICAL/HIGH `0/0`, workflow projection MEDIUM `1`
- finding: current FE branch/PR projection에서 workpack validation command 3곳만 이전 BE branch를 가리켰다.
- repair: work-item required/verify command와 status required command를 `BRANCH_NAME=feature/fe-legacy-product-compat`로 동기화했다.
- post-repair validators: workflow-v2, workpack, automation, OMO, source-of-truth와 relock/governance `65/65`를 다시 실행한다.
