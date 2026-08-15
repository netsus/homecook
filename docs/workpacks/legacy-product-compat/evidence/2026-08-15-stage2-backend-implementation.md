# Stage 2 backend implementation evidence — 2026-08-15

## Scope and lineage

- Workpack/Stage: `legacy-product-compat` (#13), Stage 2 backend implementer.
- Author task: `019ff12c-dc8b-7752-9319-398a68cacb6e`; this task does not approve Stage 3.
- Base: `origin/master` exact `d4f134c76660ebd2c58e49289a77abe36b8530e1`.
- Branch: `feature/be-legacy-product-compat`; Draft PR [#1369](https://github.com/netsus/homecook/pull/1369).
- RED commit: `e0b5bca9199cec72c1b51835e9124a0cd1b86f19`.
- Implementation commit: `a405ffb20a3f1e6e6e1d87df12cc209c474bd6f3`, parent `72b0a90428e63419d29776c44f9b9308eca4ae89`, tree `8b55dd3fbd06c50c3c26b6bf395c6a87bf01e5a2`.
- Mutation-zero evidence repair: `3e902b3d261aeade62fc3cdd11f2890a2e431a84`, parent `a405ffb20a3f1e6e6e1d87df12cc209c474bd6f3`, tree `2aa81430ec9d0932cd0cdd6295490592ffe0a919`.
- Internal authority inventory repair: `59cc07aca6d15ee623acb51e1e5e3803c04405dc`, parent `ad795cbc29981fb1e7ebe82232a977802364d268`, tree `83922d5a4d0b2fa6372efb593f6a0066712ce493`.
- Private/deleted recipe authority repair: `07cdc639e37f23156027c668fec408b63bba58b9`; indirect RPC inventory repair: `8ad430cecaba42ed1ed80f2b19806664fb5ce784`. Both are normal successor commits and do not rewrite reviewed history.
- Mixed-method route inventory repair: `636fc330f807fb37755a77448bbd87d722c70af2`; concurrent progress event/summary proof: `836f63902ca1d051cf4eb7c2b2a66229ca2d1835`.
- Production/staging/remote application writes: `0/0/0`; Claude, Ready, merge and activation were not used.

## RED → GREEN

- Initial four compatibility targets failed because the three production compatibility modules did not exist.
- Route matrix began at `16 failed`; the additive RPC static contract began at `4 failed`; the activation-block and missing-key telemetry assertions each reproduced one focused RED.
- Central security registration reproduced `1 failed / 4 passed` until the six-function #13 manifest and validator source were added.
- The final focused suite is `8 files / 54 tests` GREEN. It covers pinned legacy projection/delete, stored-version dispatch, seeded-v2 drain policy, cursor/removal fail-closed gates, route authority/error mapping, exact migration signatures/ordering/ACL, deleted/other-owner private recipe rejection before writers, optional-key compatibility and hard activation blocking.

## Implemented backend authority

- Planner and standalone completion now call exact service-role-only RPCs with server-verified owner, identity epoch, session hash/HMAC version and JWT issue time.
- The RPC revalidates account lifecycle/generation, stored `legacy_v1`, owner and canonical idempotency before bootstrap or mutation. One DB transaction owns claim, bootstrap, completion, pantry/cook-count effects, progress event/summary, missing-key telemetry and durable finish.
- Route-level user/bootstrap and best-effort progress writers were removed. Existing response wrappers and error floor remain unchanged.
- Missing key remains compatible success; `getLegacyCookingIdempotencyPhase()` is hard-locked to optional and cannot be activated by a runtime flag. Old overloads remain for the separately owned Manual drain/revoke gate.
- No API, field, status, error, action, screen, table or column was added.

## Disposable PostgreSQL evidence

- `pnpm test:legacy-product-compat:postgres`: `11/11`.
- Exact new signatures are postgres-owned `SECURITY DEFINER`, executable only by `service_role`; PUBLIC/anon/authenticated are denied.
- Planner and standalone completion, durable replay, concurrent same-key and concurrent mismatch prove one durable result with additional mutation `0` or exactly one `IDEMPOTENCY_KEY_REUSED` loser as appropriate.
- Other-owner private/deleted recipes, maintenance, quarantined, deleting, revoked-session and stored `snapshot_v2` cases retain identical digests across user/bootstrap, receipt, pantry, recipe, leftover/session/session-meal/meal, progress summary/event and operational telemetry writers.
- Planner and standalone no-key calls remain compatible success before activation.
- A deliberately failing downstream progress writer proves the whole planner and standalone transaction rolls back, including claim/bootstrap/completion/progress effects.
- The owned isolated project reached Data API `200` and removed its containers/resources on exit.

## Repository verification

- `pnpm verify:local-supabase-runtime:isolated`: all migrations plus seed applied, reset replay passed, Data API `200`, cleanup complete.
- `pnpm test:prepared-food-planner-entry:postgres`: `11/11` owner/bootstrap baseline.
- `pnpm verify:backend`: lint, typecheck, product `239 files passed / 12 skipped`, `2,756 tests passed / 175 intended skipped`, production build and security E2E `12/12`.
- `pnpm test`: `577 files passed / 30 skipped`, `6,103 tests passed / 414 intended skipped`.
- Internal authority verification: `3 files / 34 tests`; account-session generation inventory: `67 routes / 101 write surfaces / 3 auth.users inbound FKs`.
- Mixed-route regression first failed because `write_recipe_future_plan_change` and `write_personal_recipe_core` were classified as public/non-personal, then passed after enclosing PATCH/DELETE method metadata took precedence while GET view-count writers retained the public fallback.
- The isolated PostgreSQL `11/11` rerun also asserts both `user_progress_events` and `user_progress_summary.event_counts.cooking_completed` advance exactly once for planner/standalone same-key and mismatch concurrency.
- `node scripts/validate-security-function-authorization.mjs --contract-only`: #13 `6` pre-deployment functions classified with exact owner, ACL, security mode and search path.
- Source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, real-smoke and branch validators passed. Commit policy passed all branch commits.
- `pnpm audit --audit-level high`: exit `0`, high/critical `0/0`; residual pre-existing low/moderate `1/1`.
- `git diff --check`: pass.

## Explicit pending gates

- Frozen head `ad795cbc29981fb1e7ebe82232a977802364d268` independent code/quality task `01a003ae-1569-7091-b087-3a55e5ccc8fb` returned `REQUEST_CHANGES`: missing authority inventory, incomplete planner/standalone PostgreSQL matrix and test-only compatibility model concern.
- Frozen head security/DB task `01a003ae-1566-7f73-996d-52c44ffecd14` returned `REQUEST_CHANGES`: other-owner private/deleted standalone recipe completion, missing authority inventory and stale PR evidence.
- Successor commits repair the actionable runtime, inventory and fixture findings. Fresh independent Stage 3 code/quality and security/DB reviews must use new Codex App task IDs and the exact successor PR head. The author does not self-approve.
- Successor review task `01a003ca-fc74-7103-ba18-0997f8a61c92` ended at the Codex usage limit before verdict after identifying the mixed-route/progress-counter candidates; task `01a003ca-fc72-7c22-943e-bda5b4d47cdf` reached approval wait before its isolated PostgreSQL rerun. Replacement tasks could not start because the same account-wide limit applied. These are not approvals and do not advance Stage 3.
- Current-head checks must all become terminal success or intended skip before any Ready/merge transition.
- Stage 4~6, OMO closeout and Discord Stage completion remain pending.
- Controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, deployed callable inventory/negative privilege, server-Mac/OAuth, merged-exact rehearsal and required-key/capability/R/R+1/R+2/production activation remain Manual Only and were not run.
- Contract Evolution Candidate: none.
