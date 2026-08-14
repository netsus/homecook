# meal-log-ui Stage 5 third repair evidence — 2026-08-14

## Scope and independence

- task / role: `019ffeea-88ec-7f91-bf18-df5280c2c24d` / fresh independent Stage 5 third repair author
- source coordinator task: `019ff12c-dc8b-7752-9319-398a68cacb6e`
- Stage 5 reviewer task: `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`
- input PR / branch: PR `#1361` / `feature/fe-meal-log-ui-superseding-draft`
- input exact head / tree: `7e5385e7d691995f2de6251be77387e8ea857c67` / `26419926f06f62fac0b0a44f190e8038971c2cca`
- input re-review verdict: `HOLD`, P0/P1/P2 `0/1/0`
- repaired finding: `P1-ML-S5-01 residual`
- public API, schema, route, query field, status, dependency, capability, activation change: none

This task authors only the requested navigation race repair. It does not approve Stage 5, final authority, Stage 6, Ready, merge, production, or activation, and it does not change `pending-review` to `confirmed`. The closed `P1-ML-S5-02` focus lifecycle and `P1-ML-S5-03` disabled visual state remain regression constraints.

## TDD RED → GREEN

### RED

The first command could not start because this independent worktree had no `node_modules` (`vitest not found`). `pnpm install --frozen-lockfile` restored only locked dependencies; the unchanged command then produced the product RED.

`pnpm exec vitest run tests/meal-log-ui.test.tsx` failed with `1 file / 1 failed / 4 passed`. The deterministic component harness held the older End URL navigation, accepted the newer Home keyboard request, then completed the older request. The shell recorded only one navigation instead of dispatching the latest Home request (`expected 2, received 1`), reproducing the stale completion path without sleeps.

### GREEN before evidence capture

- focused component test: `1 file / 5 passed`
- focused meal-log/planner Vitest: `6 files / 43 passed`
- Chromium 320×693 rail test: initial `1/1`, then single worker repeat `10/10`
- Chromium dialog focus/disabled regression: `1/1`
- typecheck: passed
- lint: passed with zero warnings
- `git diff --check`: passed

## Clean implementation tuple

| Commit | Tree | Parent | Purpose |
| --- | --- | --- | --- |
| `6673dacbc99006af7f266abc9cfd28d79f836acc` | `05d0cd7db20ea70e6fddeb40c8c8ce73a30550c0` | `7e5385e7d691995f2de6251be77387e8ea857c67` | serialize Planner shell navigation completions by generation and lock deferred/component plus Chromium invariants |

The evidence capture started from this clean implementation tuple. No amend, rebase, reset, force push, original/reference history rewrite, push, PR mutation, Ready transition, merge, Discord, production, remote, or activation action was used.

## `P1-ML-S5-01 residual` disposition

- each shell navigation receives a monotonically increasing generation;
- only one URL navigation is in flight, while a newer requested location remains the latest authority;
- when the older End URL completes after the newer Home selection, the older location is acknowledged but not applied to `activeSegment` or `selectedDateKey`;
- the latest Home request is then dispatched with the existing `/planner?segment=log&date=...` URL and ordinary `push` semantics;
- the deferred component regression directly controls completion timing and verifies that the selected Home radio and focus never roll back;
- actual 320px Chromium verifies End → Home → ArrowLeft with first radio `aria-checked=true`, first-radio focus, latest `date=2026-08-10` URL, full rail containment, and unchanged page x/y scroll;
- no sleep was enlarged and no assertion was removed.

The protection is limited to the existing Planner shell navigation boundary. It adds no public query parameter, route, navigation action, or contract.

## Closed finding regression checks

- `P1-ML-S5-02`: Chromium dialog lifecycle passed. Deleted-origin selector initial focus, Tab trap, Escape/cancel, failure/conflict focus, successful edit destination focus, and delete origin focus remain unchanged.
- `P1-ML-S5-03`: deleted-origin save remains semantically disabled until explicit destination selection and retains computed opacity `0.5`.

## Fresh visual and runtime evidence

- manifest: `ui/designs/evidence/meal-log-ui/manifest.json`
- runtime audit: `ui/designs/evidence/meal-log-ui/runtime-accessibility-layout.json`
- manifest implementation head / tree: `6673dacbc99006af7f266abc9cfd28d79f836acc` / `05d0cd7db20ea70e6fddeb40c8c8ce73a30550c0`
- capture window: `2026-08-14T06:27:04.614Z`–`2026-08-14T06:27:22.079Z`
- manifest written at: `2026-08-14T06:27:22.120Z`
- matrix: 17 states × 3 viewports = 51 PNGs
- manifest names, on-disk PNG names, and unique viewport/state pairs: exact one-to-one match (`51 / 51 / 51`)
- mobile dimensions: 17 × `390×844`, 17 × `320×693`, all viewport-bound
- desktop: 17 captures at 1280px viewport width; full-page heights vary with content
- direct visual inspection: all 51 files inspected through three viewport contact sheets; missing, blank, wrong-state, unintended crop, or disabled-state regression was not found
- runtime regenerated result: axe serious/critical `0`, violations `[]`, horizontal overflow `0`, targets below 44px `0`, replay key reuse `true`

The canonical capture rewrote all 51 PNGs, manifest, and runtime audit. Unchanged visual bytes remain absent from the Git diff by design; four PNGs changed bytes in this run, while the fresh manifest pins the new implementation tuple and every capture timestamp. `runtime-accessibility-layout.json` remained byte-identical because all five runtime values stayed green.

## Remaining gates and Manual Only

The standard no-environment `pnpm verify:frontend` and final validators run from the clean evidence commit after this report and evidence are committed. Their results belong in the final task handoff and are not pre-claimed here.

Assigned unresolved repair findings are `0` from the author-side evidence. Independent closure remains pending with the same Stage 5 reviewer task. Final authority, Stage 6, Ready, push, merge, Discord, production, remote, and activation are outside this task.

Manual Only remains physical device, real screen reader, virtual keyboard, server-Mac, OAuth, assistive technology, `R/R+1/R+2`, production, and activation.

## Recheck handoff

Return the exact base, deterministic RED, implementation tuple, evidence commit tuple, this report, fresh manifest/runtime bundle, Chromium `10/10`, focused GREEN results, and final clean no-environment verification to Stage 5 reviewer task `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`. The reviewer must independently close `P1-ML-S5-01`; this repair author must not change Design Status or approve a later stage.
