# Stage 2 backend implementation evidence — 2026-08-15

## Scope and lineage

- Workpack/Stage: `legacy-product-compat` (#13), Stage 2 backend implementer.
- Author task: `019ff12c-dc8b-7752-9319-398a68cacb6e`; this task does not approve Stage 3.
- Base: `origin/master` exact `d4f134c76660ebd2c58e49289a77abe36b8530e1`.
- Branch: `feature/be-legacy-product-compat`; Draft PR [#1369](https://github.com/netsus/homecook/pull/1369).
- RED commit: `e0b5bca9199cec72c1b51835e9124a0cd1b86f19`.
- Implementation commit: `a405ffb20a3f1e6e6e1d87df12cc209c474bd6f3`, parent `72b0a90428e63419d29776c44f9b9308eca4ae89`, tree `8b55dd3fbd06c50c3c26b6bf395c6a87bf01e5a2`.
- Mutation-zero evidence repair: `3e902b3d261aeade62fc3cdd11f2890a2e431a84`, parent `a405ffb20a3f1e6e6e1d87df12cc209c474bd6f3`, tree `2aa81430ec9d0932cd0cdd6295490592ffe0a919`.
- Production/staging/remote application writes: `0/0/0`; Claude, Ready, merge and activation were not used.

## RED → GREEN

- Initial four compatibility targets failed because the three production compatibility modules did not exist.
- Route matrix began at `16 failed`; the additive RPC static contract began at `4 failed`; the activation-block and missing-key telemetry assertions each reproduced one focused RED.
- Central security registration reproduced `1 failed / 4 passed` until the six-function #13 manifest and validator source were added.
- The final focused suite is `8 files / 53 tests` GREEN. It covers pinned legacy projection/delete, stored-version dispatch, seeded-v2 drain policy, cursor/removal fail-closed gates, route authority/error mapping, exact migration signatures/ordering/ACL, optional-key compatibility and hard activation blocking.

## Implemented backend authority

- Planner and standalone completion now call exact service-role-only RPCs with server-verified owner, identity epoch, session hash/HMAC version and JWT issue time.
- The RPC revalidates account lifecycle/generation, stored `legacy_v1`, owner and canonical idempotency before bootstrap or mutation. One DB transaction owns claim, bootstrap, completion, pantry/cook-count effects, progress event/summary, missing-key telemetry and durable finish.
- Route-level user/bootstrap and best-effort progress writers were removed. Existing response wrappers and error floor remain unchanged.
- Missing key remains compatible success; `getLegacyCookingIdempotencyPhase()` is hard-locked to optional and cannot be activated by a runtime flag. Old overloads remain for the separately owned Manual drain/revoke gate.
- No API, field, status, error, action, screen, table or column was added.

## Disposable PostgreSQL evidence

- `pnpm test:legacy-product-compat:postgres`: `6/6`.
- Exact new signatures are postgres-owned `SECURITY DEFINER`, executable only by `service_role`; PUBLIC/anon/authenticated are denied.
- Planner completion, durable replay and mismatch prove one result with additional mutation `0`.
- Other-owner, maintenance, quarantined, deleting and revoked-session cases retain identical digests across user/bootstrap, receipt, leftover/session/meal, progress summary/event and operational telemetry writers.
- Concurrent same-key/same-payload returns one durable result twice. Concurrent same-key/different-payload returns exactly one success and one `IDEMPOTENCY_KEY_REUSED`, with one receipt, leftover and progress effect.
- No-key standalone succeeds and writes durable missing-key telemetry inside the same transaction.
- The owned isolated project reached Data API `200` and removed its containers/resources on exit.

## Repository verification

- `pnpm verify:local-supabase-runtime:isolated`: all migrations plus seed applied, reset replay passed, Data API `200`, cleanup complete.
- `pnpm test:prepared-food-planner-entry:postgres`: `11/11` owner/bootstrap baseline.
- `pnpm verify:backend`: lint, typecheck, product `239 files passed / 12 skipped`, `2,756 tests passed / 175 intended skipped`, production build and security E2E `12/12`.
- `node scripts/validate-security-function-authorization.mjs --contract-only`: #13 `6` pre-deployment functions classified with exact owner, ACL, security mode and search path.
- Source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, real-smoke and branch validators passed. Commit policy passed all branch commits.
- `pnpm audit --audit-level high`: exit `0`, high/critical `0/0`; residual pre-existing low/moderate `1/1`.
- `git diff --check`: pass.

## Explicit pending gates

- Independent Stage 3 code/quality and security/DB review must use a fresh Codex App task ID and exact current PR head. The author does not self-approve.
- Current-head checks must all become terminal success or intended skip before any Ready/merge transition.
- Stage 4~6, OMO closeout and Discord Stage completion remain pending.
- Controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, deployed callable inventory/negative privilege, server-Mac/OAuth, merged-exact rehearsal and required-key/capability/R/R+1/R+2/production activation remain Manual Only and were not run.
- Contract Evolution Candidate: none.
