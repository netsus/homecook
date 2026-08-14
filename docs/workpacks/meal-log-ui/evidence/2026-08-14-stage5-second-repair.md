# meal-log-ui Stage 5 second repair evidence — 2026-08-14

## Scope and independence

- task / role: `019ffebd-09a0-7432-8940-4e09ae2b3fb1` / fresh independent Stage 5 second repair author
- source coordinator task: `019ff12c-dc8b-7752-9319-398a68cacb6e`
- Stage 5 reviewer task: `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`
- input PR / branch: PR `#1361` / `feature/fe-meal-log-ui-superseding-draft`
- input exact head / tree: `62ea2a271c79e57d34f84467ef8ab87f124429bd` / `9c81b22494ad601e4e96bbeaa9b4d59109088189`
- input re-review verdict: `HOLD`, P0/P1/P2 `0/2/0`
- repaired findings: `P1-ML-S5-01`, `P1-ML-S5-03 residual`
- public API, schema, route, source, field, status, dependency, capability, activation change: none

This task authors only the two requested second repairs. It does not approve Stage 5, final authority, Stage 6, Ready, merge, production, or activation, and it does not change `pending-review` to `confirmed`. The already-closed `P1-ML-S5-02` focus lifecycle was retained as a regression constraint.

## TDD RED → GREEN

### RED

The following failures were recorded before implementation:

- `pnpm exec vitest run tests/meal-log-entry-mutations.test.tsx`: `1 file / 1 failed / 6 passed`; deleted-origin `수정 저장` was disabled but did not include the established `disabled:opacity-50` visual state.
- actual Chromium at `320×693`, with CSS scroll-snap assistance disabled so the component calculation itself owned containment: the Home return after End failed the selected-radio left/right boundary assertion while the page-scroll invariant remained unchanged.
- actual Chromium deleted-origin dialog: the save button was disabled but computed opacity was `1`, not the required `0.5`.

### GREEN before evidence capture

- focused Vitest: `6 files / 43 passed`
- actual Chromium rail + dialog lifecycle: `2 passed`
- the 320px End and Home selections each keep the selected radio's complete left/right bounds inside the rail viewport, without changing page x/y scroll
- the deleted-origin save remains semantically disabled and renders computed opacity `0.5`
- existing radiogroup, seven radios, roving tabindex, keyboard edge behavior, ARIA, focus trap/restoration, successful edit/delete focus, and `P1-ML-S5-02` regression assertions remain green
- typecheck: passed
- lint: passed with zero warnings
- `git diff --check`: passed

## Implementation tuple

| Commit | Tree | Parent | Purpose |
| --- | --- | --- | --- |
| `5c0165e402b1839ac57650a78e723cf89b6fdede` | `f9e258d923d1205542ba967c7a5a3e0be9e0ead1` | `62ea2a271c79e57d34f84467ef8ab87f124429bd` | rail-local nearest containment and visibly disabled deleted-origin primary save |

The evidence capture started from this clean implementation tuple. No amend, rebase, reset, force push, original/reference history rewrite, push, PR mutation, Ready transition, merge, Discord, production, remote, or activation action was used.

## Finding disposition

### `P1-ML-S5-01` — repaired, reviewer recheck pending

- BODY-relative `offsetLeft` arithmetic was removed.
- The effect compares the rail and selected radio `getBoundingClientRect()` values and changes only `rail.scrollLeft` by the nearest missing left/right distance.
- The Chromium regression disables CSS scroll-snap correction, selects End then Home at `320×693`, waits for layout to settle, and asserts the selected radio is fully contained after both moves.
- Page x/y scroll remains unchanged and the established keyboard/radiogroup/ARIA semantics remain green.

### `P1-ML-S5-03 residual` — repaired, reviewer recheck pending

- The edit/delete primary action reuses the existing `MealLogAddSheet` treatment `disabled:opacity-50`.
- The deleted-origin save remains disabled until an active owner meal column is explicitly selected.
- Unit evidence locks the shared disabled class and Chromium evidence locks computed opacity `0.5`.
- Fresh `edit` PNGs at `390×844`, `320×693`, and desktop visibly show the inactive save as a lighter primary control; the three originals were directly inspected.

## Fresh visual and runtime evidence

- manifest: `ui/designs/evidence/meal-log-ui/manifest.json`
- runtime audit: `ui/designs/evidence/meal-log-ui/runtime-accessibility-layout.json`
- manifest implementation head / tree: `5c0165e402b1839ac57650a78e723cf89b6fdede` / `f9e258d923d1205542ba967c7a5a3e0be9e0ead1`
- capture window: `2026-08-14T05:37:01.807Z`–`2026-08-14T05:37:19.209Z`
- manifest written at: `2026-08-14T05:37:19.262Z`
- matrix: 17 states × 3 viewports = 51 PNGs
- manifest capture names, on-disk PNG names, and unique viewport/state pairs: exact one-to-one match (`51 / 51 / 51`)
- mobile dimensions: 17 × `390×844`, 17 × `320×693`, all viewport-bound
- desktop: 17 captures at 1280px viewport width; full-page heights vary with content
- runtime regenerated result: axe serious/critical `0`, violations `[]`, horizontal overflow `0`, targets below 44px `0`, replay key reuse `true`

`runtime-accessibility-layout.json` was freshly rewritten by the canonical capture and remained byte-identical because all runtime values stayed green. The manifest and changed PNG bytes record the new exact implementation pin and inactive-primary visual state.

## Remaining gates and Manual Only

The standard no-environment `pnpm verify:frontend` runs from the clean evidence commit after this report and evidence are committed. Its result belongs in the final handoff and is not pre-claimed here.

Assigned unresolved repair findings are `0` from the author-side evidence. Independent closure remains pending with the same Stage 5 reviewer task. Final authority, Stage 6, Ready, push, merge, Discord, production, remote, and activation are outside this task.

Manual Only remains physical device, real screen reader, virtual keyboard, server-Mac, OAuth, assistive technology, `R/R+1/R+2`, production, and activation.

## Recheck handoff

Return the exact base, RED failures, implementation tuple, evidence commit tuple, this report, manifest/runtime bundle, focused GREEN results, and final clean no-env `pnpm verify:frontend` result to Stage 5 reviewer task `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`. The reviewer must independently recheck both IDs; this repair author must not change Design Status or approve a later stage.
