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

### Current-head security inventory repair

- GitHub fresh-Supabase `security-function-authorization` exposed one real RED at head `a3940ef4`: both new service-only functions were absent from the central additive authorization inventory, so CI rejected them as unclassified.
- Focused inventory RED: 1/1 failed with the missing function classification. GREEN commit `29173d68` classifies the exact signatures, explicit postgres owner, safe search paths and service-role-only ACLs in both the central and full-local inventories.
- GREEN evidence: inventory/projection 15/15; authorization `--contract-only` validator classified all 18 #7 functions; disposable PostgreSQL fresh/replay again passed #7 20/20 and full-local security 31 pass + 17 intended skip in each run; current-head `pnpm verify:backend` passed 217 product files with 2,649 tests + 150 intended skips, 77-route build and security E2E 12/12.
- This repair changes no public endpoint, browser capability value or activation state.

### Current-head quality inventory repair

- GitHub `quality` exposed a second real RED at head `b7094db7`: the server-only entrypoint was approved by the runtime inventory, but three generated/static projections still described the pre-entrypoint source tree. The aggregate result was 3 failed, 5,201 passed and 330 intended skipped tests.
- GREEN commit `ca0b0555` adds only the two exact approved internal reads to the hybrid static expectation and regenerates the hybrid/account-session artifacts. It adds no operation, endpoint, capability source or browser authority.
- GREEN evidence: focused inventory tests 19/19; account-session inventory 59 routes, 88 write surfaces and 3 inbound `auth.users` foreign keys; hybrid generator check; full `pnpm test` exit 0; `git diff --check` pass.
- The first evidence projection head `d6244b55` then exposed one remaining self-lock literal in CI: 1 failed, 5,203 passed and 330 intended skipped. Updating both exact code-head expectations produced focused 27/27 and aggregate 513 files passed + 28 skipped, 5,204 tests passed + 330 skipped.
- Independent authority precheck, Stage 5/final authority/Stage 6, Manual/server-Mac evidence and activation remain pending.

## AUTH-B01 actual owner-edit repair — 2026-08-04

- Fresh authority precheck task `019fc981-6834-7fd3-be43-f161d81c02b6` reviewed PR #1281 head `166be95c9bd976fd41c720dfc7d520f595771e35` and returned `NEEDS_REPAIR` with blocker/major/minor `1/0/0` because the impact flow received the unchanged GET draft without an actual detail-screen editor.
- RED commit `037549179adf368621192214310f07a7c8df956b` changed the component contract first. Its focused run failed `1` test with `58` filtered because no accessible `편집` button existed.
- GREEN commit `7ca6a5dd5a9747a75c5b38c0e48fc1900f346f79` connects the exact owner-private `snapshot_v2 + edit_context` boundary to the existing personal editor shell. The editor initializes the complete official draft, retains untouched nested `ingredients_used` data, preserves `base_recipe_revision` and `image_object_id`, and freezes one edited draft for both impact preview and PATCH.
- Unauthenticated, legacy and non-owner responses expose no edit action or editor. Existing loading/error, active-claim, stale recheck focus, dialog trap/restore and read-only boundaries remain unchanged.

### Repair verification

- Focused component/API/security/entrypoint set: `14 files / 134 tests` passed. The direct UI integration set passed `77/77`; the wider related set passed `93/93`.
- `pnpm verify:frontend:pr`: product `2,652 passed + 150 intended skip`; 77-route build; smoke `59 passed + 10 intended skip`; core a11y `8 passed + 1 intended skip`; core visual `12/12`.
- `pnpm verify:frontend`: Lighthouse passed; aggregate browser regression `931 passed + 158 intended skip`; a11y `18 passed + 15 intended skip`; visual `23 passed + 22 intended skip`; security `12/12`. No aggregate failure or isolated-rerun substitution occurred.
- Slice E2E: `7 passed + 7` non-target-project intended skips. The flow now enters owner edit, changes the title, verifies enabled save, opens impact preview, keeps exactly two choices, checks keyboard wrapping/opener restore and retains stale recheck focus.
- Exploratory QA: `95/100`, threshold `85`; evidence validator passed. One evidence-generation `jq` command initially exited `5` due to local variable scoping, was corrected without product changes, and the complete eval then passed.
- The first pushed owner-edit evidence head `ab523fcb` exposed a CI-only static inventory RED: `quality` reported `3` failed files and `5` failed tests because the verifier treated the server-projected, owner-only `canEditPersonalRecipe` prop as literal client capability activation. The exact local reproduction failed `5/27`; the product component/API/E2E paths remained green.
- The verifier now counts that prop as fail-closed only when both exact server-projected guards remain present (`snapshot_v2 + edit_context`, then authenticated owner gating). The focused inventory set passes `27/27`, the related owner-edit/inventory set passes `106/106`, and the same aggregate `pnpm test` path passes `513` files + `28` intended skips with `5,207` tests + `330` intended skips. No capability value is exposed or activated by this classification repair.

### Refreshed visual evidence

- `ui/designs/evidence/recipe-content-snapshot-future-propagation/RECIPE_DETAIL-impact-mobile-default.png`: actual owner edit → title change → impact dialog, viewport-only `390×844`.
- `ui/designs/evidence/recipe-content-snapshot-future-propagation/RECIPE_DETAIL-impact-mobile-narrow.png`: the same actual flow, viewport-only `320×568`.
- The other four required workpack PNGs and auxiliary COOK_MODE evidence were regression-checked. Aggregate tests regenerated unrelated evidence as a side effect; every unrelated tracked file was restored and generated untracked files were removed before the #7 captures were recreated.
- Both refreshed images were visually inspected. The dialog keeps its visible/accessibly named title, 16px shell/cards, 44px actions, scroll-contained narrow body, reachable footer, two-choice hierarchy and zero horizontal overflow.

### Honest handoff boundary

- AUTH-B01 is closed by implementation evidence but remains pending a fresh independent authority precheck. This task does not create or approve an authority report.
- Design Status remains `pending-review`/temporary. PR #1281 stays Draft; Stage 5, final authority, Stage 6, broader real Auth/Data, Manual Only and merged-exact server-Mac evidence remain pending.
- Personal-v2 writes and snapshot-v2 creation were not activated. Existing seeded v2 read/cancel drain remains, while #8 R/R+1 evidence and R+2 joint approval remain the activation gate.
- No production/staging/remote application write, remote Supabase write, migration apply, dependency change, Vercel deployment, server-Mac mutation or Discord notification occurred.

## S5-M01 unauthorized focus-isolation repair — 2026-08-04

- Fresh Stage 5 re-review task `019fc9f0-25df-7080-a25e-20b9f9a2fc08` reviewed head `409b9e563a6c14e6f8d846e5b08d16f2eb3f57a4` and kept only the focus-isolation boundary open: the retired impact dialog could restore focus behind the replacement login gate on its delayed cleanup frame.
- RED commit `b750cb9105b4d941626caede807ffa8af116a60b` proves the escape after one animation frame and locks forward/reverse Tab wrapping in component and slice E2E coverage.
- GREEN commit `0ba05d584d302b81f39363906b9bb23f3ed26532` connects `LoginGateModal` to the existing shared dialog boundary. Test-isolation commit `e21dd3cf3aaccb823a811bf38589a1ffb2b5f1f0` resets the global auth-gate store in HOME tests, and static fix `421ddcea6056f38a6e9745c6c752a0f8616d3454` bounds replacement-modal focus recovery to one animation frame so multiple mounted dialog hooks cannot recursively exchange focus.
- Exact implementation-head verification passed: focused dialog/401 coverage `90/90`; slice E2E `8 passed + 8` non-target-project skips; `verify:frontend:pr` product `2,657 passed + 150 intended skip`, smoke `59 passed + 10 intended skip`, core a11y `8 passed + 1 intended skip`, core visual `12/12`; full a11y `18 passed + 15 intended skip`; security `12/12`; full Vitest `513` files passed + `28` skipped, `5,212` tests passed + `330` skipped.

### Exact-head CI diagnostic boundary

- The first `421ddcea6056f38a6e9745c6c752a0f8616d3454` CI aggregate completed with one unrelated existing async-focus assertion failure in `tests/prepared-food-planner-entry-ui.test.tsx`: `1 failed / 5,211 passed / 330 skipped`. The failure observed the search input before the expected amount-input focus; no #7 product assertion failed.
- The exact failing prepared-food assertion then passed `10/10` isolated local runs, while the unchanged local full aggregate passed `5,212/5,212`. A single diagnostic-only rerun passed `513` files + `28` skipped, `5,212` tests + `330` skipped, plus the ingredient-nutrition PostgreSQL integration `14/14`.
- The prepared-food product code and test were not changed. The diagnostic rerun is not used as final completion evidence; this evidence-only commit creates a new head whose newly started checks must all finish success or intended skip without rerun.
- The login transition still preserves one visible dialog, the edited draft, base revision and managed image identity, and retains post-auth resume. Stage 5 re-review, final authority, Stage 6, Manual/server-Mac evidence and capability activation remain pending; this implementer does not approve them.

## Final authority HOLD repair — AUTH-M01 / AUTH-M02 — 2026-08-04

- Final product-design-authority task `019fca28-f9c7-7110-884c-63052b90e6d8` reviewed exact head `d925e3149b86cbad8f5ea5322eef4d32ed5e00d6` and returned HOLD with blocker/major/minor `0/2/0`. It made no changes and created no authority report.
- RED commit `27487983f69a1b0efb2e93881e94386a5cfcda21` added the missing focus/background and snapshot recovery contracts first. The focused run had exactly three expected failures and `67` existing passes.
- GREEN commit `8856184ae1f493ee6a117ff4fa21513cc98049f6` repairs only AUTH-M01 and AUTH-M02. No public endpoint, wrapper, status, error, field, screen, dependency or rollout switch changed.

### AUTH-M01 closure evidence

- `RecipeDetailPersonalEditor` now has `role=dialog`, `aria-modal=true`, one accessible heading and the shared `useDialogBoundary` behavior. The recipe background is `inert`/`aria-hidden`, body scroll is locked, and Tab/Shift+Tab remain inside the editor.
- When discard, impact or login owns focus, the parent editor boundary is inactive, so nested transitions do not compete. Dirty close and Escape remain unchanged, and the exact clicked `편집` opener is restored after the editor closes.
- The existing broad mobile recipe-shell CSS selector was narrowed to the shell's direct header, keeping the editor's visible close/header controls reachable at 390px and 320px.
- Component coverage verifies background isolation, scroll lock, focus wrapping, dirty-discard isolation and opener restoration. Slice Playwright repeats the focus/background contract at exact `390×844` and `320×568` viewports.

### AUTH-M02 closure evidence

- Snapshot-v2 read error and unauthorized states keep the dark whole-board shell and provide 44px-plus actions. Error exposes `다시 시도 | 이전 화면`; unauthorized exposes the approved login `next` return primitive plus `이전 화면`.
- Retry calls only `fetchSnapshotV2CookMode(sessionId)` for the same immutable snapshot route. It never invokes a legacy parser, mutable recipe endpoint or cross-version fallback.
- Component tests prove initial recovery focus, same-reader retry and safe previous/login actions. Slice Playwright proves retry success, previous navigation, login navigation/focus and exact mobile containment.

### Verification and visual evidence

- Focused/related Vitest: `3 files / 74 tests` passed. Slice Playwright: `10 passed + 10` intended non-target-project skips.
- `pnpm verify:frontend:pr`: product `2,660 passed + 150` intended skip; build `77` routes; smoke `59 passed + 10` intended skip; core a11y `8 passed + 1` intended skip; core visual `12/12`.
- Full browser gates: a11y `18 passed + 15` intended skip; visual `23 passed + 22` intended skip; security `12/12`. Exploratory QA scored `95/100` against threshold `85` and evidence validation passed.
- Added/updated viewport-only evidence: `COOK_MODE-dispatch-error-mobile-default.png` (`390×844`), `COOK_MODE-dispatch-error-mobile-narrow.png` (`320×568`), `COOK_MODE-dispatch-unauthorized-mobile-default.png` (`390×844`) and `COOK_MODE-dispatch-unauthorized-mobile-narrow.png` (`320×568`). All four were visually inspected; there is no horizontal overflow, clipped copy or unreachable action.
- The required six workpack PNG paths remain unchanged and were regression-checked. Unrelated evidence regenerated by browser suites was restored exactly.

### Honest handoff boundary

- AUTH-M01 and AUTH-M02 are closed by implementation evidence only. A new fresh independent final authority task must review the pushed exact head; this implementer does not approve authority, Stage 5 or Stage 6 and does not create the authority report.
- Design Status remains `pending-review`/temporary. Broader real Auth/Data, Manual Only, merged-exact server-Mac evidence, #8 scope and R/R+1 before R+2 activation remain pending.
- Capability activation, production/staging/remote writes, migrations, Vercel deployment, server-Mac mutation and Discord notification remained zero.

### First current-head quality failure and direct repair

- The first pushed evidence head `30a05a1cd0414c764c22466aaa9f81f1d75b22ae` completed `14/15` checks as success or intended skip, but `quality` failed and is not completion evidence. Its aggregate result was `2 failed / 5,213 passed / 330 skipped`.
- One failure was directly related to AUTH-M01: the shared discard boundary restored focus one animation frame later, while the existing personal-editor contract requires the original cancel control immediately after Escape. The other was bookkeeping consistency: the contract-sync test still locked the superseded `7ca6a5dd` projection after automation notes moved to code commit `8856184a`.
- The exact local focused reproduction failed the same `2/13`. The repair preserves shared inert/scroll/Tab isolation while restoring the discard opener immediately, and synchronizes automation/work-item/status/roadmap assertions to the honest HOLD state. No unrelated product or test file is changed.
- GREEN verification passed the repair/related set `83/83`; the CI-equivalent local aggregate passed `513` files + `28` skipped with `5,215` tests passed + `330` skipped.
- Because the first-run quality failure is real, it is not rerun as completion evidence. This follow-up commit creates a new exact head that must receive a fully clean first-run check set before handoff.

## Final authority HOLD repair — AUTH-M03 — 2026-08-04

- Fresh final product-design-authority task `019fca5b-5b23-7be2-8ec4-d106a67402bd` reviewed exact head `b64835e250f7d28b92592ecc23e7a4b61f624982` and returned HOLD with blocker/major/minor `0/1/0`. It identified only the missing explicit modal semantic on the already isolated future-impact dialog; it made no file, report, metadata, PR or Discord change.
- RED commit `59de272f` adds component and slice-browser assertions first. The focused component run failed exactly `1/4` because `aria-modal` was `null`.
- GREEN commit `d7f689a3` adds only `aria-modal="true"` to the existing `role="dialog"`. The shared focus trap, background inert boundary, body scroll lock, two strategies, active-claim guard, stale recheck focus, nested login transition and opener restoration are unchanged.
- Verification passed: focused component `4/4`; related component/security/dispatch `103/103`; exact slice E2E `10 passed + 10` intended non-target-project skips; `verify:frontend:pr` product `2,660 passed + 150` intended skip, 77-route build, smoke `59 passed + 10` intended skip, core a11y `8 passed + 1` intended skip and core visual `12/12`; lint, typecheck, source/workflow/workpack/automation/bookkeeping/closeout/exploratory validators and `git diff --check` passed.
- The exact 390×844 and 320×568 impact evidence was regenerated by the slice E2E and remained pixel-stable, so no PNG content change is committed. Unrelated evidence regenerated by aggregate browser gates was restored exactly.
- AUTH-M03 is closed by implementation evidence only. Design Status remains `pending-review`/temporary; a new fresh independent final authority task must review the pushed exact head. Stage 5, final authority and Stage 6 are not self-approved. Manual/server-Mac/OAuth/activation boundaries remain pending, and production/staging/remote writes, activation, migrations, Vercel, server-Mac mutation, #8 scope and Discord notifications remain zero.
