# meal-log-ui Stage 5 finding repair evidence — 2026-08-14

## Scope and independence

- task / role: `019ffe8d-8fde-7a13-9ba2-8e9def7cb222` / fresh Stage 5 finding repair author
- source coordinator task: `019ff12c-dc8b-7752-9319-398a68cacb6e`
- Stage 5 reviewer task: `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`
- input PR / branch: PR `#1361` / `feature/fe-meal-log-ui-superseding-draft`
- input exact head / tree: `5f648f11e8b2512d2a1564d7ef8a426935d17d6f` / `d0bcd7a373b33071a380d431f39c51cfb68b783c`
- input verdict: `HOLD`, P0/P1/P2 `0/3/0`
- repaired findings: `P1-ML-S5-01`, `P1-ML-S5-02`, `P1-ML-S5-03`
- public API, schema, route, source, field, status, dependency, capability, activation change: none

This task authors only the three requested repairs. It does not approve Stage 5, final authority, Stage 6, Ready, merge, production, or activation, and it does not change `pending-review` to `confirmed`.

## TDD RED → GREEN

### RED

`pnpm exec vitest run tests/meal-log-ui.test.tsx tests/meal-log-entry-mutations.test.tsx` failed before implementation with `2 files / 4 failed / 7 passed`:

- the date rail had no `radiogroup` or `radio` semantics;
- deleted-origin edit initially focused `취소`, not the required destination selector;
- successful deleted edit returned focus to the panel heading, not the destination section;
- successful delete returned focus to the panel heading, not the origin section.

The first real-browser GREEN attempt additionally found that failure → cancel lost the original invoker after pending/error rerenders (`1 failed / 1 passed`). Preserving one dialog-lifetime invoker closed that regression. The first clean canonical capture then failed with three axe serious `listitem` findings, one per viewport, because visual `li` wrappers remained exposed below `radiogroup`. Presentational wrappers closed that issue without changing the rail DOM order.

### GREEN before evidence capture

- focused Vitest: `6 files / 44 passed`
- Chromium date rail and dialog focus lifecycle: `2 passed`
- typecheck: passed
- lint: passed with zero warnings
- `git diff --check`: passed

## Normal product repair chain

| Commit | Tree | Parent | Purpose |
| --- | --- | --- | --- |
| `33a8171237fa7ab01adfda712c74e1ed625895ea` | `4b8b7048c3ebdd1de6b1156f5ee8bfff75c4ae0b` | `5f648f11e8b2512d2a1564d7ef8a426935d17d6f` | date radiogroup/keyboard/rail-only nearest scroll, dialog focus lifecycle, deleted evidence fixture/assertions |
| `53b0ea6eb3d917588f678c008217b7874daac7b6` | `49137afc7a080913f154c4a861e0413ce7be6826` | `33a8171237fa7ab01adfda712c74e1ed625895ea` | remove visual list wrappers from the radiogroup accessibility tree after clean axe RED |

The exact clean implementation tuple used for evidence is `53b0ea6eb3d917588f678c008217b7874daac7b6` / `49137afc7a080913f154c4a861e0413ce7be6826`, parent `33a8171237fa7ab01adfda712c74e1ed625895ea`. No amend, rebase, reset, force push, or original/reference history rewrite was used.

## Finding disposition

### `P1-ML-S5-01` — repaired, reviewer recheck pending

- the rail is one named `radiogroup` with seven `radio` buttons and exactly one `aria-checked=true`;
- roving tabindex is selected `0`, all other radios `-1`;
- ArrowLeft/ArrowRight/Home/End move selection and focus without wrapping at either edge;
- Space/Enter activate the focused radio;
- selected-date visibility changes only `rail.scrollLeft` with nearest-edge arithmetic; page x/y scroll remains unchanged;
- Vitest and actual 320px Chromium tests lock the semantics, keyboard keys, edge behavior, rail movement, URL, focus, and page-scroll invariants.

### `P1-ML-S5-02` — repaired, reviewer recheck pending

- every deleted-origin edit initially focuses the unselected required destination selector;
- Tab and Shift+Tab remain trapped in each dialog;
- Escape and cancel restore the invoking action;
- generic failure and conflict focus the dialog error, preserve correction context, then restore the invoker on close;
- successful deleted edit focuses the selected destination section heading;
- successful delete focuses the origin active/deleted section heading, falling back to the panel heading only when the section no longer exists;
- dialog-lifetime invoker memory is not overwritten by pending/error rerenders.

### `P1-ML-S5-03` — repaired, reviewer recheck pending

- each `deleted-column` capture scrolls the deleted region into the mobile viewport and asserts its heading, zero add CTA, one edit action, and one delete action;
- each `edit` capture now opens a deleted-origin fixture and asserts the origin label, unselected required selector, selector focus, and disabled save;
- the same fixture and assertions run at 390×844, 320×693, and desktop.

## Fresh visual and runtime evidence

- manifest: `ui/designs/evidence/meal-log-ui/manifest.json`
- runtime audit: `ui/designs/evidence/meal-log-ui/runtime-accessibility-layout.json`
- manifest implementation head / tree: `53b0ea6eb3d917588f678c008217b7874daac7b6` / `49137afc7a080913f154c4a861e0413ce7be6826`
- capture window: `2026-08-14T04:48:31.709Z`–`2026-08-14T04:48:49.506Z`
- manifest written at: `2026-08-14T04:48:49.550Z`
- matrix: 17 states × 3 viewports = 51 PNGs
- mobile dimensions: 17 × `390×844`, 17 × `320×693`, all viewport-bound
- desktop: 17 captures at 1280px viewport width; full-page height varies with content
- manifest entries, on-disk PNG names, and the 17×3 expected matrix: exact one-to-one match
- direct visual inspection: all 51 files inspected through three viewport contact sheets; the six deleted-column/edit originals were additionally inspected at original resolution
- blank, wrong-state, loading-only, missing deleted heading, unintended crop, fake add CTA, selected destination default, or enabled preselection save: none found
- runtime regenerated result: axe serious/critical `0`, violations `[]`, horizontal overflow `0`, targets below 44px `0`, replay key reuse `true`

`runtime-accessibility-layout.json` was freshly rewritten by the canonical capture and is byte-identical because all five runtime values remain unchanged and green. The manifest and changed PNG bytes record the new exact implementation pin and visual states.

## Remaining gates and Manual Only

The standard no-environment `pnpm verify:frontend` must run from the clean evidence commit after this report and evidence are committed. Its result belongs in the task handoff; it is not pre-claimed here.

Assigned unresolved repair findings: `0` from the author-side evidence. Independent closure remains pending with the same Stage 5 reviewer task. Final authority, Stage 6, Ready, push, merge, Discord, production, and activation are outside this task.

Manual Only remains physical device, real screen reader, virtual keyboard, server-Mac, OAuth, assistive technology, `R/R+1/R+2`, production, and activation.

## Recheck handoff

Return the exact repair chain, clean implementation tuple, evidence commit tuple, this report, manifest/runtime bundle, focused RED/GREEN results, and final clean no-env `pnpm verify:frontend` result to Stage 5 reviewer task `019ffe80-b210-7921-b8b6-07b0a5d6d5c8`. The reviewer must recheck all three IDs and issue the independent verdict; this repair author must not change Design Status or approve later stages.
