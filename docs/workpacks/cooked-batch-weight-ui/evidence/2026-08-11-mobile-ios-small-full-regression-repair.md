# PR #1323 mobile-ios-small full-regression repair

## Identity and boundary

- repair author task ID: `019fecaa-5518-7991-a649-9f201b750870`
- delegated source task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- role: fresh full-regression repair author; not Stage 6, authority, Ready/merge supervisor, or self-approver
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- PR / branch: `#1323` / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- starting head / tree: `20e6ace2e5a41a5cd1d4acfa3f3ef054c38cc4b1` / `2ece986f5aaf872b876d8d8787a9fa72078ef8e9`
- failing run / job: `31410756805` / `93528043328`

This repair changes one deterministic E2E fixture and this evidence report. It does not change product components, API/auth behavior, public fields/status/errors/actions, DB/schema/migrations, dependencies, screenshot baselines, runtime evidence, lifecycle projections, Stage 6 or authority decisions. It does not perform Ready, merge, Discord, production/remote DB/server-Mac/OAuth, R/R+1/R+2, or capability activation work.

## Failure and root cause

The current-head GitHub full-regression job ended with `943 passed / 170 skipped / 6 flaky / 3 failed`. All three terminal failures were `mobile-ios-small` tests in `tests/e2e/slice-16-leftovers.spec.ts`:

1. `eat action removes item from list` did not find the feedback toast;
2. `shows empty state when all leftovers are eaten` did not find the empty copy;
3. `planner add opens sheet` did not find the planner sheet copy.

The retry-1 trace independently showed the same sequence:

- mocked `GET /api/v1/leftovers?status=leftover`: `200`;
- unmocked `GET /api/v1/cooked-batches?availability=all&limit=20`: `401 Unauthorized` after about `716 ms`;
- `components/leftovers/leftovers-screen.tsx` treats a cooked-batch `401` as authoritative unauthorized state;
- the page switched to the login gate after the legacy card became clickable, so each assertion observed the login screen instead of the requested result.

The failure is a deterministic test-isolation defect exposed by CI authentication timing, not a product regression and not a viewport interaction, focus, keyboard, or overflow defect. `installLeftoverRoutes` mocked the legacy leftovers/planner/meal requests but did not mock the #11 cooked-batch list request that the integrated screen now always starts. Dedicated #11 and visual tests already owned that route explicitly.

The exact pre-repair local command reached the same unmocked server route. On this worktree it returned `500` because local Supabase env was intentionally absent, so the client did not take the `401` unauthorized branch and all 11 tests passed. This environment-dependent false green further confirms that the fixture did not fully own its dependencies; the GitHub trace is the authoritative RED for the `401` path.

## Minimal repair

`installLeftoverRoutes` now fulfills only `GET /api/v1/cooked-batches?*` with the existing exact success wrapper and an explicit empty page:

```json
{
  "success": true,
  "data": { "items": [], "next_cursor": null, "has_next": false },
  "error": null
}
```

This preserves the test intent: the three tests remain focused on legacy LEFTOVERS eat, empty, and planner-sheet behavior while the integrated #11 section has a deterministic valid empty state. Assertions, timeouts, retries, skip policy, viewport, product behavior, and CI policy are unchanged.

## Verification

| Command / evidence | Result |
| --- | --- |
| GitHub run `31410756805`, job `93528043328` log and retry traces | root cause confirmed; all three retries ended on the login gate after cooked-batch `401` |
| pre-repair exact local `CI=1 pnpm exec playwright test tests/e2e/slice-16-leftovers.spec.ts --project=mobile-ios-small` | `11 passed`, but emitted the unmocked cooked-batch server error; not accepted as isolation proof |
| post-repair same exact command | `11 passed` with the cooked-batch dependency explicitly mocked |
| three repaired tests, `mobile-ios-small`, `--repeat-each=5` | `15 passed` using 5 workers |
| focused #11 Vitest | `4 files / 12 tests passed` |
| #11 Stage 4 viewport/state/accessibility matrix | `2 passed` |
| LEFTOVERS focused axe test | `1 passed` |
| LEFTOVERS focused visual baseline tests | `2 passed` |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |
| `pnpm build` | passed; 81 static pages generated |

The #11 matrix regenerated seven PNGs and `manifest.json` during verification. All eight tracked artifacts were restored to exact starting-HEAD bytes. The complete tracked #11 evidence aggregate SHA-256 returned from `b2b0c461...` after generation to the original `75315a777abc430e77352ca80febd89502d93ac5251e1444e08a55dcd65fe5fd` after restoration.

## Screenshot and design boundary

No product UI, style, layout, focus behavior, interaction model, or screenshot assertion changed. Existing focused visual tests passed without baseline updates. Therefore no new screenshot evidence or separate evidence generator is required for this repair, and this author does not generate or approve new baselines.

## Remaining limitations

All existing non-terminal boundaries remain pending and are not waived:

- actual OS virtual-keyboard occlusion, resize, and scroll-to-active-field behavior;
- physical keyboard Tab / Shift+Tab / Escape timing;
- VoiceOver / TalkBack reading order, names, descriptions, focus, and live announcements;
- physical-device 320px/390px safe area and browser chrome;
- full WCAG conformance, including the two inherited COOK_MODE full-page contrast residual nodes;
- creation-off existing-v2 drain and real #8 read smoke;
- real authentication and other-owner nondisclosure accounts;
- server-Mac/OAuth and production/remote DB behavior;
- R/R+1/R+2 and capability activation.

Lifecycle remains `planned / not_started / pending / not_started`, roadmap remains `in-progress`, PR remains Draft, and `full-ci` remains required. This repair author does not approve its own publication successor or perform Stage 6/authority/Ready/merge work. The publication head must receive newly started current-head checks; `full-regression` and `visual` must be terminal `SUCCESS`, while Draft Lighthouse skip remains intentional. Any fail, pending, cancelled, rerun, or ambiguous terminal state is a HOLD with no rerun by this task.
