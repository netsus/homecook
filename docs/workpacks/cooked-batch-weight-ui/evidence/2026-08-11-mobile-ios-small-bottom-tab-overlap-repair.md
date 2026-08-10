# PR #1323 mobile-ios-small bottom-tab overlap repair

## Identity and boundary

- delegated source task: `019fe028-be31-76f2-a5a7-986000a93374`
- failed rereview task: `019fecb8-2eff-70d2-bb20-419f65822126`
- role: fresh local repair author; not Stage 6, authority, evidence generator, Ready/merge supervisor, or self-approver
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- PR / branch: `#1323` / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- exact starting head / tree / merge base: `13f60890a4bcd81d1927cfe96637d8bad9070a4f` / `9e302c458cf4b080079d087787cb311f92fee4a1` / `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`
- failing run / job: `31413891123` / `93538296656`

The starting tuple was clean and exact, and PR #1323 was OPEN Draft with `full-ci`. This task changes only the LEFTOVERS mobile layout, its regression coverage, and this author report. It does not change dependencies, API/status/error/action/screen contracts, PNG baselines, authority decisions, lifecycle projections, PR metadata, or remote refs.

## TDD RED and diagnosis

The current Linux retry traces showed `GET /api/v1/cooked-batches?...` returning mocked `200`, while all three legacy actions ended at `y=495.01` and issued neither `POST /api/v1/leftovers/*/eat` nor `GET /api/v1/planner`. DOM and focus stayed unchanged. This closes the earlier auth/fixture hypothesis.

An independent run in the repository's Playwright Linux image (`mcr.microsoft.com/playwright:v1.58.2-noble`) reproduced all three failures at exact `320x568`:

- action rect: top `477.015625`, bottom `513.015625`, height `36px`;
- fixed bottom tab top: `496px`; required maximum action bottom for a 16px gutter: `480px`;
- the click center was `y=495.015625`; center and lower-interior `elementFromPoint` did not resolve to the action;
- two bottom-tab containers were present;
- observed eat/planner request logs remained empty;
- eat-result, all-eaten empty, and planner-sheet behaviors all failed.

This is a real narrow-mobile touch-region overlap, not an auth, fixture, timeout, or assertion issue. The macOS-host font metrics did not reproduce the same vertical collision, so Linux geometry and request observation are the accepted RED proof.

## Minimal product repair

The repair uses existing layout components and tokens:

1. `AppShell` no longer renders its shared bottom tab on `/leftovers`, because `LeftoversScreen` already owns the route-specific fixed tab.
2. The LEFTOVERS mobile ready/state shells are one bounded vertical scroll region above the fixed tab. Their height reserves the tab's existing `8px` inset, `4rem` height, safe area, and existing `--space-5` (`20px`) spacing token. The 20px reserve absorbs subpixel layout rounding while proving the required gutter is at least 16px.
3. Legacy planner/eat controls use the existing `h-11` size so their interactive height is exactly 44px.

The scroll region keeps overflow, focus scrolling, keyboard access, and safe-area spacing intact at 320px and 390px. The repair does not force clicks, add sleeps, weaken assertions, extend timeouts, add skips/retries, hide the route's navigation, or pass pointer events through visually occupied tab content.

The regression helper scrolls the real action into view, then proves one bottom tab, a 44px minimum target in both dimensions, the full target bottom at least 16px above the tab, and center/lower hit-test ownership. The three existing behaviors additionally prove that their real requests are issued before checking the existing results.

## GREEN and verification

| Check | Result |
| --- | --- |
| exact three Linux `320x568` behaviors | `3 passed`; eat and planner request counts were each exactly 1 |
| post-repair Linux geometry | action heights `44px`; bottoms `260.015625` / `262.015625`, tab top `496px`; center/lower hit tests owned by the action |
| exact three Linux tests with `--repeat-each=5 --workers=5 --retries=0` | `15 passed` |
| exact 390px layout probe | `1 passed` |
| full `slice-16-leftovers.spec.ts` on `mobile-ios-small`, `mobile-chrome`, and `desktop-chrome` | `34 passed`, `2` intended project skips |
| focused #11 and LEFTOVERS Vitest | `5 files / 48 tests passed` |
| automation-spec regression command filtered to `cooked-batch-weight-ui` | `2 passed`, `2` intended mobile-project skips |
| Stage-4 viewport/state/accessibility matrix | passed |
| focused LEFTOVERS axe comparison | `1 passed` |
| focused LEFTOVERS visual baseline comparison | `2 passed`; no baseline update |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | passed; build generated 81 static pages |
| source-of-truth, workpack, automation-spec, workflow-v2, OMO bookkeeping, closeout-sync, authority-evidence-presence, exploratory-QA-evidence, real-smoke-presence, branch validators | passed |

## Screenshot and generator boundary

The comparison run changed tracked screenshots and `manifest.json`, so a separate evidence-generator task is required. Across the focused matrix and exact automation-spec regression comparisons, the changed-file union was:

- `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-before-mobile-narrow-320.png`
- `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-desktop-state-matrix.png`
- `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-known.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-before-mobile-default-390.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-before-mobile-narrow-320.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-desktop-state-matrix.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-legacy-null-depleted.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-actions.png`
- `ui/designs/evidence/cooked-batch-weight-ui/manifest.json`

This author did not approve or update those files. Every generated tracked artifact was restored to the starting bytes. The complete #11 evidence inventory aggregate SHA-256 returned to `75315a777abc430e77352ca80febd89502d93ac5251e1444e08a55dcd65fe5fd`; `runtime-axe-wcag.json` and `runtime-focus-keyboard-overflow.json` remained byte-identical.

## Remaining limitations and lifecycle

Automated browser coverage does not complete the existing Manual obligations: physical-device 320px/390px safe areas and browser chrome, actual OS virtual-keyboard resize/occlusion, physical keyboard timing, VoiceOver/TalkBack reading order and announcements, or full WCAG conformance. Real authentication/other-owner accounts, server-Mac, OAuth, production/remote DB, real #8 read smoke, R/R+1/R+2, and capability activation were not run or claimed.

No Stage 6, final authority, Ready, merge, PR edit, push, Discord, roadmap, activation, or lifecycle promotion occurred. Publication and fresh current-head CI remain separate tasks, and the changed screenshot/manifest set must be handled only by a separate evidence generator.
