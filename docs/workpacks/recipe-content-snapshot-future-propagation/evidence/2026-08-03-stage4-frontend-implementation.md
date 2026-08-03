# Stage 4 frontend implementation evidence — 2026-08-03

- Role: independent Stage 4 `frontend-implementer`
- Branch: `feature/fe-recipe-content-snapshot-future-propagation`
- Draft PR: `#1281`
- Base: `ef5903b131a2eb9e505b2121b4e390970c565b95`
- RED commit: `e7f1ae72d0d8bdc620c690cfd7be89628cc6f4f2`
- GREEN commit: `226dcc85d25b9cbc2a439af2b3b495456d2948d9`

## Closed frontend scope

- Owner personal-edit impact dialog primitives and exact API client: explicit two-choice strategy, loading/error fail-closed, active-claim reason association, completed-shopping copy, stale/claim recheck focus, submit gating.
- Planner legacy start keeps the existing shell and route while dispatching from an explicit `legacy_v1` identity after success; the mobile action is at least 44px.
- `snapshot_v2` has a separate API namespace, type, route, reader and cancel surface. Terminal reads remain visible and read-only; no legacy parser or mutable recipe fallback exists.
- Workpack #8 completion/pantry/XP and capability activation are not implemented.

## Verification

- Focused RED: 3 suites failed because the three production modules did not exist.
- Focused GREEN: 3 files / 6 tests passed.
- Related regression: 6 files / 103 tests passed.
- `pnpm verify:frontend:pr`: passed; product suite 212 files / 2612 tests passed, 11 files / 148 tests skipped; build, 59 smoke tests, 8 core a11y tests and 12 core visual tests passed.
- Slice E2E: 3 passed / 3 non-target project skips; exact 390px and 320px images captured.
- Full browser regression: 926 passed / 150 intended skips / one unrelated existing MYPAGE `networkidle` timeout; that exact test passed immediately in an isolated rerun (1/1). Because the aggregate command exited on that transient failure, the already-run full a11y (18 passed / 15 intended skips), full visual (23 passed / 22 intended skips), and separately run security suite (12/12) are recorded individually instead of claiming one all-green aggregate exit.
- Exploratory QA: score 95, schema/evidence validation passed; pending real-data/authority/manual gates are marked `blocked`, not silently counted complete.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`: passed.

## Design evidence

- Critic: `ui/designs/critiques/recipe-content-snapshot-future-propagation-design-critic.md` (`BLOCKER 0`, conditional pass)
- Screenshots: `ui/designs/evidence/recipe-content-snapshot-future-propagation/` (six required PNGs)
- Authority target remains pending: `ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md`

## Honest pending boundary

- Separate authority precheck, Stage 5, final product-design-authority and Stage 6 are not approved by this task.
- Broader real Auth/Data stale/claim, full Manual Only, merged-exact server-Mac read-only evidence, current-head remote CI, R/R+1 drain and R+2 activation remain pending.
- The broad E2E checklist item remains unchecked because local fixture coverage does not replace the full real-data concurrency matrix.

## Authority precheck repair — 2026-08-04

- Review task: `019fc82b-e1e9-7010-80c7-a3845ab2f42a`
- Reviewed head: `57ddc8ce5abce09b2e4fa5869f5f1939867d029b`
- Verdict: `REQUEST_CHANGES` (`AP-B01` blocker, `AP-M01`~`AP-M04` major, `AP-m01` minor)
- Repair RED: `fc905983` — focused run failed in five files for the missing real consumer, cancel key, exact start response, dormant start wiring and visible title contracts; 12 pre-existing assertions passed.
- Repair GREEN: `bcb559c5` — focused 5 files / 20 tests and related 7 files / 72 tests passed with lint, typecheck and diff check.

### Finding closure evidence

- `AP-B01`: `RecipeFutureImpactSaveFlow` now owns real draft+revision preview → explicit two-choice → PATCH behavior. `RecipeDetailScreen` consumes it through a dormant opt-in editor context, and its QA route exercises the same production component/API calls instead of rendering a static dialog. Recipe-detail standalone and planner starts consume `createSnapshotV2CookingSession` only through dormant opt-in contexts; normal shipping behavior remains legacy-v1.
- `AP-M01`: snapshot-v2 cancel requires an explicit UUID `Idempotency-Key`; the cook-mode screen retains one key for the cancel attempt and API replay tests assert the same header.
- `AP-M02`: snapshot-v2 start accepts only the exact five-field wrapper data and exact three-field content summary with UUID IDs, supported mode, non-empty title and positive integer servings. Malformed success data throws `INVALID_RESPONSE`, so `CookingStartAction` remains on the current screen and navigation stays zero.
- `AP-M03`: all required captures are viewport-only at exact `390×844` or `320×568`. Planner required evidence now records pending and inline error states, while auxiliary cook-mode images record loading and error states. Playwright also locks dialog Tab wrapping, Escape opener restoration, stale recheck focus, narrow viewport containment and start-before-navigation.
- `AP-M04`: the dialog title wrapper is no longer a descendant `header`, so the Wave1 recipe-shell header suppression rule cannot hide the visible `h2` or dialog accessible name.
- `AP-m01`: Design Status remains `pending-review`; authority, Stage 5/6, Manual Only, server-Mac evidence and activation remain unchecked. The old unsupported numeric visual claim is not used as closeout evidence.

### Refreshed visual evidence

- Required: `RECIPE_DETAIL-impact-mobile-default.png` (`390×844`), `RECIPE_DETAIL-impact-mobile-narrow.png` (`320×568`), `PLANNER_WEEK-start-mobile-default.png` (`390×844`, pending), `PLANNER_WEEK-start-mobile-narrow.png` (`320×568`, inline error), `COOK_MODE-dispatch-mobile-default.png` (`390×844`, terminal read-only), `COOK_MODE-dispatch-mobile-narrow.png` (`320×568`, terminal read-only).
- Auxiliary: `COOK_MODE-dispatch-loading-mobile-default.png` (`390×844`) and `COOK_MODE-dispatch-error-mobile-narrow.png` (`320×568`).
- Slice Playwright after repair: `6 passed / 6 intended non-target-project skips`.
- A fresh authority precheck remains required against the pushed repair head. This implementer does not approve Stage 5, final authority or Stage 6.

### Repair verification

- `pnpm verify:frontend:pr`: passed; product Vitest `213 files passed / 11 skipped`, `2617 passed / 148 skipped`; production build passed; smoke `59 passed / 10 intended skips`; core a11y `8 passed / 1 intended skip`; core visual `12 passed`.
- Full Playwright: a11y `18 passed / 15 intended skips`; visual `23 passed / 22 intended skips`; security `12 passed`.
- Exploratory QA: score `95`, coverage-sensitive threshold `85`, evidence validation passed. The blocked share is the explicitly pending authority, real-data, server-Mac and Manual Only boundary.
- `validate:source-of-truth-sync`, `validate:workflow-v2`, `validate:workpack`, `validate-automation-spec`, `validate:omo-bookkeeping` and `git diff --check`: passed.
- No capability flag, migration, remote application, production/staging data or deployment was changed.

## Second authority precheck repair — 2026-08-04

- Review task: `019fc850-46de-7a42-bbf6-c58c3dccd57a`
- Reviewed head: `3786aa0e2720c4d8ec00acf57309213385a1796d`
- Verdict: `REQUEST_CHANGES` (`AP-B01` blocker, `AP-M02`/`AP-M03` major, `AP-m01` minor; prior `AP-M01` and `AP-M04` remain closed)
- Repair RED: `ce4b12eb` — five expected failures exposed response/request mismatch acceptance, missing pending copy, non-whole-board snapshot loading and duplicate standalone CTA behavior while 111 existing assertions passed.
- Repair GREEN: `b0f67e7f` — focused 4 files / 116 tests and related 9 files / 145 tests passed; start validation now correlates mode, recipe and servings to the request, planner exposes pending feedback, and standalone v2 replaces the existing CTA in place.
- Visual RED/GREEN: `7bd5a3f4` / `2d030379` — the immutable snapshot reader was missing the shared whole-board surface; the focused test failed 1/3 before the repair and passed 3/3 after it.

### Finding disposition

- `AP-B01` — **Contract Evolution Candidate / BLOCKED**: `app/recipe/[id]/page.tsx` and `app/planner/[date]/[columnId]/page.tsx` have no approved server/config projection for the DB-local `homecook.snapshot_v2_creation` capability and no official owner editor draft/base-revision context. The repository's only creation switch is read inside the protected DB function. The component integration now replaces the legacy CTA in place when an approved context is supplied, so duplicate CTA count is zero, but connecting the real page entrypoints would require a new client-readable authority or editor contract. No flag, API, field or QA query parameter was invented.
- `AP-M02` — closed locally: snapshot-v2 start success is rejected with existing `INVALID_RESPONSE` unless response mode equals request mode; standalone response recipe ID and servings must also equal the request. Component tests keep the current screen and navigation count zero on mismatch.
- `AP-M03` — closed locally: planner pending has visible `요리 세션 생성 중…` feedback; loading preserves whole-board geometry; terminal and in-progress fixtures retain one realistic ingredient and step; legacy and snapshot success have distinct DOM assertions and auxiliary captures. Required images remain exact viewport-only `390×844` / `320×568` captures.
- `AP-m01` — synchronized to frontend Draft PR `#1281`, Design Status `pending-review` and the repaired Stage 4 state. Manual Only, server-Mac evidence, Stage 5, final authority, Stage 6 and activation remain pending.

### Second repair visual evidence

- Required: `RECIPE_DETAIL-impact-mobile-default.png`, `RECIPE_DETAIL-impact-mobile-narrow.png`, `PLANNER_WEEK-start-mobile-default.png`, `PLANNER_WEEK-start-mobile-narrow.png`, `COOK_MODE-dispatch-mobile-default.png`, `COOK_MODE-dispatch-mobile-narrow.png`.
- Auxiliary: `COOK_MODE-dispatch-loading-mobile-default.png`, `COOK_MODE-dispatch-error-mobile-narrow.png`, `COOK_MODE-dispatch-legacy-success-mobile-default.png`, `COOK_MODE-dispatch-snapshot-success-mobile-default.png`.
- Slice Playwright: `7 passed / 7 intended non-target-project skips`; captures use `fullPage: false` and preserve 390px/320px overflow, focus and first-viewport action contracts.

### Second repair verification

- `pnpm verify:frontend:pr`: passed; product Vitest `213 files passed / 11 skipped`, `2620 passed / 148 skipped`; production build passed; smoke `59 passed / 10 intended skips`; core a11y `8 passed / 1 intended skip`; core visual `12 passed`.
- Full Playwright: a11y `18 passed / 15 intended skips`; visual `23 passed / 22 intended skips`; security `12 passed`.
- Exploratory QA: score `95`, threshold `85`; exploratory evidence validation passed with authority, real-data, server-Mac and Manual Only cases explicitly blocked.
- Source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping and closeout-sync validators passed; `git diff --check` passed.
- Full visual tests regenerated unrelated slice evidence as a side effect; those unrelated files were restored exactly, leaving only this workpack's captures changed.

### Remaining boundary

- Repair verdict is `BLOCKED` only on the missing approved entrypoint capability/editor projection. The independent authority reviewer must decide whether to open contract evolution; this implementation task cannot authorize it.
- Existing seeded snapshot-v2 read/cancel drain remains available with creation off. No capability was activated.
- Broader real Auth/Data stale/active-claim evidence, merged-exact server-Mac read-only evidence, Manual Only, #8 exact-pantry completion and R/R+1 before R+2 activation remain pending.

## 2026-08-04 approved entrypoint repair

### Authority and integration

- Approved source tuple: requirements `v1.7.29`, screens `v1.5.33`, flow `v1.3.31`, DB `v1.3.31`, API `v1.2.35` from Contract Evolution PR #1282 and Stage 1 re-lock PR #1283.
- New protected base `9659d4ba0cb9dccbee3bfed4833019202ff1e3f1` was integrated without discarding the prior Stage 4 work. Integration commit: `e9ab9647`.
- Entrypoint TDD RED: `71f37e07`; the first focused run produced 6 expected failures with 120 existing tests passing.
- Entrypoint GREEN: `f9f1d0ec`; the initial focused set passed 204/204. Fail-closed follow-up GREEN: `ba509392` after a nested RED proved that missing server environment could otherwise escape before the capability read fallback.

### Closed implementation surface

- Every successful recipe detail now carries a positive revision. Exact current personal owners alone receive one service-projected `{revision, edit_context}` snapshot, with the full official draft, managed image identity or `null`, and `base_recipe_revision === revision`; non-owner/public responses omit the field and inaccessible resources preserve 404 non-disclosure.
- Recipe Meal items carry positive revision while product entries remain unchanged.
- The server-only projection returns only `legacy_v1` or `snapshot_v2`. Both approved DB capabilities must be exact-active for v2; missing, malformed, read-error, client-construction error or either inactive value returns `legacy_v1`. Raw capability values are never passed to browser props or public response bodies.
- Actual recipe and planner route entrypoints consume the derived mode and API revision/context. The existing CTA is replaced in place only at the approved v2 boundary, so the capability-off surface stays legacy and duplicate CTA count is zero.
- Start responses are correlated to request mode, recipe and servings before navigation. Snapshot reads remain immutable and terminal states remain read-only.

### Deterministic and local evidence

- Focused/related Vitest: 15 files, 264/264; server projection isolated follow-up 14/14.
- Disposable PostgreSQL fresh/replay: #7 contract 20/20 in each run; authority base 15 pass + 1 intended skip fresh and 16/16 replay; full-local security 31 pass + 17 intended skip in each run. Only ephemeral loopback PostgreSQL was used.
- `pnpm verify:backend`: product 2,648 pass + 150 intended skip; build 77 routes; security E2E 12/12.
- `pnpm verify:frontend:pr`: product/build/smoke/core a11y/core visual all passed.
- `pnpm verify:frontend`: product 2,648 pass + 150 intended skip; build and Lighthouse passed; aggregate regression 931 pass + 158 intended skip; a11y 18 pass + 15 intended skip; visual 23 pass + 22 intended skip; security 12/12.
- Slice E2E: 7 pass + 7 non-target-project skips. Exploratory QA score 95/100 (threshold 85), evidence validator passed.
- Required PNGs remain viewport-only `390×844` and `320×568`; the implementation task visually inspected all six plus the whole-board loading skeleton. Unrelated screenshots regenerated by aggregate tests were restored exactly.

### Honest pending boundary

- Design Status remains `pending-review`; there is no product-design-authority report and this implementer does not approve authority, Stage 5 or Stage 6.
- A fresh independent authority precheck must review the pushed current head. Broader real Auth/Data, Manual Only and merged-exact server-Mac evidence remain pending.
- Personal recipe v2 writes and new snapshot-v2 creation were not activated. Existing seeded v2 read/cancel drain remains available, while #8 R/R+1 evidence and R+2 joint approval remain the activation gate.
- No production/staging write, remote Supabase write, migration apply, Vercel deploy, server-Mac mutation, dependency change or Discord notification occurred.
