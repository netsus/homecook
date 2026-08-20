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
- Inactive recipe-owner visibility repair: `ae517053090fdd1d270e38690833ec23a84bf43a`; actual seeded-v2/required-key route evidence repair: `d6032a598b2ea2336dc5f7d02035ec3e40b33850`.
- Source recipe-owner lifecycle serialization: `09c579b09451218940c951c2342d1eafeec3a26c`; workflow verification rail sync: `c320c157b3703d81a27ecf83dc071082a70de0f8`.
- Production/staging/remote application writes: `0/0/0`; Claude, Ready, merge and activation were not used.

## RED → GREEN

- Initial four compatibility targets failed because the three production compatibility modules did not exist.
- Route matrix began at `16 failed`; the additive RPC static contract began at `4 failed`; the activation-block and missing-key telemetry assertions each reproduced one focused RED.
- Central security registration reproduced `1 failed / 4 passed` until the six-function #13 manifest and validator source were added.
- The expanded focused suite is `10 files / 76 tests` GREEN. It covers pinned legacy projection/delete, stored-version dispatch, actual seeded-v2 start/read/cancel/complete routes, cursor/removal fail-closed gates, actual legacy route required-key seam, route authority/error mapping, exact migration signatures/ordering/ACL, deleted/private/inactive-owner public recipe rejection before writers, optional-key compatibility and hard activation blocking.

## Implemented backend authority

- Planner and standalone completion now call exact service-role-only RPCs with server-verified owner, identity epoch, session hash/HMAC version and JWT issue time.
- The RPC revalidates account lifecycle/generation, stored `legacy_v1`, owner and canonical idempotency before bootstrap or mutation. One DB transaction owns claim, bootstrap, completion, pantry/cook-count effects, progress event/summary, missing-key telemetry and durable finish.
- Route-level user/bootstrap and best-effort progress writers were removed. Existing response wrappers and error floor remain unchanged.
- Missing key remains compatible success; `getLegacyCookingIdempotencyPhase()` is hard-locked to optional and cannot be activated by a runtime flag. Old overloads remain for the separately owned Manual drain/revoke gate.
- No API, field, status, error, action, screen, table or column was added.

## Disposable PostgreSQL evidence

- `pnpm test:legacy-product-compat:postgres`: `13/13`.
- Exact new signatures are postgres-owned `SECURITY DEFINER`, executable only by `service_role`; PUBLIC/anon/authenticated are denied.
- Planner and standalone completion, durable replay, concurrent same-key and concurrent mismatch prove one durable result with additional mutation `0` or exactly one `IDEMPOTENCY_KEY_REUSED` loser as appropriate.
- Other-owner private/deleted recipes, maintenance, quarantined, deleting, revoked-session and stored `snapshot_v2` cases retain identical digests across user/bootstrap, receipt, pantry, recipe, leftover/session/session-meal/meal, progress summary/event and operational telemetry writers.
- Public recipes whose other owner is quarantined or deleting are nondisclosed before claim/bootstrap and retain identical owner A/B mutation digests.
- A concurrent quarantine transaction holding the canonical source-owner advisory lock serializes before standalone completion; completion observes the committed inactive lifecycle and returns `RESOURCE_NOT_FOUND` with mutation zero.
- Planner and standalone no-key calls remain compatible success before activation.
- A deliberately failing downstream progress writer proves the whole planner and standalone transaction rolls back, including claim/bootstrap/completion/progress effects.
- The owned isolated project reached Data API `200` and removed its containers/resources on exit.

## Repository verification

- `pnpm verify:local-supabase-runtime:isolated`: all migrations plus seed applied, reset replay passed, Data API `200`, cleanup complete.
- `pnpm test:prepared-food-planner-entry:postgres`: `11/11` owner/bootstrap baseline.
- `pnpm verify:backend`: lint, typecheck, product `239 files passed / 12 skipped`, `2,756 tests passed / 175 intended skipped`, production build and security E2E `12/12`.
- `pnpm test`: `577 files passed / 30 skipped`, `6,106 tests passed / 416 intended skipped`.
- Internal authority verification: `3 files / 34 tests`; account-session generation inventory: `67 routes / 101 write surfaces / 3 auth.users inbound FKs`.
- Mixed-route regression first failed because `write_recipe_future_plan_change` and `write_personal_recipe_core` were classified as public/non-personal, then passed after enclosing PATCH/DELETE method metadata took precedence while GET view-count writers retained the public fallback.
- The isolated PostgreSQL `12/12` rerun also asserts both `user_progress_events` and `user_progress_summary.event_counts.cooking_completed` advance exactly once for planner/standalone same-key and mismatch concurrency.
- `node scripts/validate-security-function-authorization.mjs --contract-only`: #13 `6` pre-deployment functions classified with exact owner, ACL, security mode and search path.
- Source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, real-smoke and branch validators passed. Commit policy passed all branch commits.
- `pnpm audit --audit-level high`: exit `0`, high/critical `0/0`; residual pre-existing low/moderate `1/1`.
- `git diff --check`: pass.

## Explicit pending gates

- Frozen head `ad795cbc29981fb1e7ebe82232a977802364d268` independent code/quality task `01a003ae-1569-7091-b087-3a55e5ccc8fb` returned `REQUEST_CHANGES`: missing authority inventory, incomplete planner/standalone PostgreSQL matrix and test-only compatibility model concern.
- Frozen head security/DB task `01a003ae-1566-7f73-996d-52c44ffecd14` returned `REQUEST_CHANGES`: other-owner private/deleted standalone recipe completion, missing authority inventory and stale PR evidence.
- Successor commits repair the actionable runtime, inventory and fixture findings. Fresh independent Stage 3 code/quality and security/DB reviews must use new Codex App task IDs and the exact successor PR head. The author does not self-approve.
- Successor code/quality task `01a003ca-fc74-7103-ba18-0997f8a61c92` ended at the Codex usage limit before verdict after identifying the mixed-route/progress-counter candidates. Security/DB task `01a003ca-fc72-7c22-943e-bda5b4d47cdf` resumed after its approval wait, independently passed focused `54`, authority `23`, isolated PostgreSQL `11/11` and the security validators on frozen head `be65e6df1559de10e1098a4cd0f9ba69dccb9deb`, and found no runtime/security defect. It returned `REQUEST_CHANGES P0/P1/P2=0/0/1` only because the roadmap still said `53 / 6/6` and the PR body contained a mistyped repair SHA while the PR had drifted to `4bb7f65cc96682c332699f180936cef2e6d731a4`. The PR typo and repo projections are repaired on the successor; this frozen review is not current-head approval.
- Exact-head security/DB task `01a01d94-6623-7130-a6c5-b71a39edbd08` approved `b6c5be3186b5b851ab493b78fef199a02ae33b05` with `P0/P1/P2=0/0/0`. Exact-head code/quality task `01a01d94-6124-7eb1-bd0f-bdbda74d3f5b` returned `REQUEST_CHANGES 0/1/2`; the two code/evidence findings are repaired by `ae517053` and `d6032a59`, while its terminal PR-body projection finding is repaired only after successor CI finishes. Fresh exact-head re-review remains required.
- Exact `74f148e10027d269941ec873e49c9e4bd9ee5f8d` code/quality re-review approved `0/0/0`. Security/DB re-review returned `REQUEST_CHANGES 0/1/1` for an unlocked source-owner lifecycle race and stale eight-file workflow rails. `09c579b0` and `c320c157` repair both with concurrent RED/GREEN evidence; fresh exact-head re-review remains required.
- Current-head checks must all become terminal success or intended skip before any Ready/merge transition.
- Stage 4~6, OMO closeout and Discord Stage completion remain pending.
- Controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, deployed callable inventory/negative privilege, server-Mac/OAuth, merged-exact rehearsal and required-key/capability/R/R+1/R+2/production activation remain Manual Only and were not run.
- Contract Evolution Candidate: none.
