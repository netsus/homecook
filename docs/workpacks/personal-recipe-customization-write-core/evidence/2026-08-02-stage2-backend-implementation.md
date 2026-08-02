# Stage 2 backend implementation evidence — 2026-08-02

## Scope and role

- Task ID: `019fc113-7b96-7620-ada5-a0bb66cfae7e`
- Role: Stage 2 backend implementer. This task does not approve Stage 3.
- Base: `origin/master` exact `6aed57bba12de320f16094389416f1b7c8eacfc8`
- Branch: `feature/be-personal-recipe-customization-write-core`
- Implementation commit: `22e673ca4a09649ee9187b336b35f5a97a80ce86`
- Draft PR: [#1274](https://github.com/netsus/homecook/pull/1274)
- Production/staging/remote application writes: `0/0/0`
- Claude, provider mutation, capability activation, public PATCH/DELETE route activation, #7 propagation and #8 session completion were not used or implemented.

## TDD RED → GREEN

The locked five-file command was run before the migration existed.

- RED: `4 failed files + 1 skipped file`, `15 failed + 2 skipped`
- GREEN unit/static: `4 passed files`, `15 passed`
- Command:
  `pnpm exec vitest run tests/personal-recipe-customization-write-core.test.ts tests/personal-recipe-customization-write-security.test.ts tests/personal-recipe-customization-write-idempotency.test.ts tests/personal-recipe-customization-write-account-delete.test.ts tests/personal-recipe-customization-write-core-postgres.integration.test.ts`

The initial pre-RED attempt that could not find `vitest` because this fresh worktree had no `node_modules` is retained as environment setup evidence only and is not counted as a test RED. `pnpm install --frozen-lockfile` restored the lockfile-identical workspace dependencies.

The implementer quality review then found that the first GREEN version bypassed #4's nutrition snapshot writer. A regression assertion produced `1 failed / 3 passed / 8 skipped`; the repair now calls `write_recipe_nutrition_snapshot` with the transaction's exact input guard and returned deterministic snapshot ID. The same focused command returned to `15 passed / 8 intended integration skips` before disposable PostgreSQL execution.

The first Draft PR head exposed one additional CI RED: the three new `SECURITY DEFINER` functions were absent from the central authorization manifest. A locked security test reproduced this as `1 failed / 4 passed`; the slice manifest and validator source registration repaired it to `5/5`, and `validate-security-function-authorization.mjs --contract-only` classified all three functions. The final locked static suite is `16 passed / 9 intended integration skips`.

## Implemented dormant authority

- One service-role-only `write_personal_recipe_core` RPC owns capability, account generation, exact session binding, common lock order, resource validation, idempotency and all content effects in one transaction.
- `homecook.personal_recipe_v2` remains unset/off by default, no application caller sets it, and no PATCH/DELETE route was added.
- Create, immutable public fork, same-ID revision update, explicit save-as-new and owner-only idempotent soft delete are implemented without changing the legacy `POST /recipes` route.
- Server canonicalization rejects unsupported client authority/server-owned fields with the existing `VALIDATION_ERROR`, hashes only normalized server-consumed fields, resolves exact product/version provenance through one approved primary `represents` link, and stores immutable content with the exact ID returned by #4's validated nutrition snapshot writer. The #6 migration does not insert nutrition snapshot rows directly.
- Tag input is narrowed to private user-selected authority. Managed image attach/replacement/removal remains in the same transaction and uses the existing generation-aware object/reference/outbox functions.
- The F0 internal generation-writer marker is opened and cleared inside the RPC transaction. Account lifecycle transition to exact-generation `deleting` removes only that generation's non-image personal write receipts before existing hard-delete cleanup.

## Disposable PostgreSQL evidence

Command: `pnpm test:personal-recipe-customization-write-core:postgres`

- Fresh mode: #4 authority `15 pass / 1 intended skip`; #6 `9/9`; active full-local security inventory `30 pass / 16 skip`.
- Replay mode: #4 authority `16/16`; #6 `9/9`; active full-local security inventory `30 pass / 16 skip`.
- #6 fixtures prove capability-off mutation zero, create/replay/conflict, immutable public fork, same-ID update and stale revision rejection, save-as-new identity, idempotent soft delete/history retention, private user-tag authority, failed-image whole-transaction rollback, public/other-owner/direct-DML denial, service-only ACL, and generation-scoped account receipt cleanup.
- The runner creates repository-owned disposable non-5432 PostgreSQL clusters and removes them after each mode. It applies no production/staging/remote migration.

## Related regression and repository gates

- #2 product/ingredient link: `9 files / 55 tests` passed.
- #3 visibility/image/tag: `59 files / 618 tests` passed.
- #4 snapshot authority: `4 files / 45 tests` passed, plus the fresh/replay evidence above.
- #5 editor decoupling: `9 files / 61 tests` passed.
- `pnpm verify:backend`: lint, typecheck, product `2,557 pass / 129 skip`, production build, security Playwright `12/12` passed.
- `pnpm audit --audit-level high`: high/critical `0`; one pre-existing low-severity advisory reported.
- source/workpack/automation/workflow-v2/OMO/closeout/branch validators and `git diff --check` passed. Validator-focused Vitest returned `5 files / 48 tests` passed.
- security function authorization contract classification passed for the new three-function manifest. The local full role-matrix command could not bind `127.0.0.1:54322` because Docker Desktop was not running; the Draft PR current-head CI supplies the fresh Supabase role-matrix result.

## Explicit pending gates

- Independent Stage 3 code/security/DB approval is pending and must use another Codex task ID.
- Draft PR current-head checks and the final evidence-projection head remain part of the Stage 2 handoff; the PR must stay Draft and must not be merged by this task.
- Workpack E2E named `personal-recipe-customization-write-core` does not currently exist; no empty grep is claimed as green.
- Local full Supabase/browser, merged-exact server-production/local-rehearsal read-only verifier, Manual Only evidence, #7 integration and #8 R/R+1→R+2 activation remain pending.
- Contract Evolution Candidate: none.

## Stage 3 findings repair — current Draft PR

This Stage 2 author repaired, but did not approve, two independent Stage 3 `REQUEST_CHANGES` results against exact head `1a5a6d47dd5f91329ec6279a33374991a8e35428`:

- code/quality task `019fc157-2042-7c90-a3ba-8af10f6ce86b`: `0/3/1`.
  - The reviewer identified the missing official ingredient provenance at the writer INSERT near the reviewed migration line 489 and the common runner's `recipe_ingredients` bootstrap near line 281, which had pre-created both columns and concealed migration ownership.
  - It identified the public-fork visibility check near the reviewed migration line 314 as weaker than the central `recipe_visibility_guard.is_owner_publicly_visible` contract defined near `20260723170000_recipe_visibility_read_hardening.sql:148`.
  - It identified the PostgreSQL test near reviewed line 248 as sequential revision coverage and the account cleanup test near reviewed line 363 as receipt-trigger-only coverage, not real two-connection races.
  - It identified the raw idempotency hash near reviewed migration line 243 as occurring before server-consumed canonicalization.
- security/DB task `019fc157-226b-7a20-af4a-ef8ba99640c5`: `0/2/1`.
  - The reviewer additionally identified hidden public update/delete as an existence leak because the public `FORBIDDEN` branch ran before the central lifecycle visibility upper bound.
  - It identified that the active full-local `30 pass / 16 skip` run did not yet add the new functions to its expected exact inventory, and that the slice manifest omitted explicit owners while the validator checked owner only when the manifest declared one.

No reviewer result is marked complete here. Fresh independent Stage 3 code/quality and security/DB re-review of the repaired exact head remains pending.

### Repair RED → GREEN

- Locked static RED before migration repair: `4 failed files`, `5 failed / 11 passed` across the four non-PostgreSQL locked files.
- Disposable PostgreSQL RED in both fresh and replay: #6 `4 failed / 13 passed`; the actual defect signals were canonical retry conflict, missing stored provenance, and a hidden-source lifecycle race that allowed a fork. The fourth failure was a test-only PostgreSQL boolean rendering expectation (`true` versus `t`) and was corrected before implementation claims.
- Locked static GREEN: `4 files / 16 tests passed`.
- Disposable PostgreSQL GREEN in both fresh and replay: predecessor snapshot authority fresh `15 pass / 1 intended skip`, replay `16/16`; #6 `17/17` per mode; active full-local security inventory `30 pass / 16 inactive skip` per mode with `required_function_count=33` (the prior 29 plus all three #6 `SECURITY DEFINER` functions and the provenance invoker trigger).
- Commands:
  - `pnpm exec vitest run tests/personal-recipe-customization-write-core.test.ts tests/personal-recipe-customization-write-security.test.ts tests/personal-recipe-customization-write-idempotency.test.ts tests/personal-recipe-customization-write-account-delete.test.ts tests/personal-recipe-customization-write-core-postgres.integration.test.ts`
  - `pnpm test:personal-recipe-customization-write-core:postgres`

### Findings closure evidence

- The #6 migration now owns additive product/version columns, pair and composite-version FK constraints, an exact approved-primary `represents` link trigger, and exact INSERT persistence. The predecessor runner creates compatibility columns only for its own older snapshot test, drops them before follow-up migrations, and therefore cannot conceal a missing #6 DDL on either fresh or replay.
- Public fork/update/delete locks the current source-owner lifecycle row and applies `recipe_visibility_guard.is_owner_publicly_visible` in the same transaction. Hidden owners converge to `RESOURCE_NOT_FOUND`; before/after recipe and mutation digests remain unchanged.
- Real spawned `psql` connections wait behind an explicit advisory barrier for same-revision one-winner, writer↔soft-delete and writer↔account-cleanup both orderings, G1→G2 stale writer, and lifecycle transition visibility. Failed mixed tag/image work proves recipe/snapshot/tag/idempotency mutation zero, shared-public preservation, and F0 marker rollback/clear.
- Fresh/replay inspect exact owner, security mode, overload count, ACL, grantability, PUBLIC-only probe/`anon`/`authenticated`/`service_role` actual calls, and the central exact inventory. The three `SECURITY DEFINER` signatures explicitly declare `owner: postgres` in the manifest and exact `ALTER FUNCTION ... OWNER TO postgres` statements in the migration.
- Idempotency hashes normalized server-consumed draft/nutrition/tag fields. Whitespace-equivalent input durably replays, unsupported client authority is rejected with the existing `VALIDATION_ERROR`, and only a different canonical payload produces `IDEMPOTENCY_KEY_REUSED`.

### Repair verification status

- `pnpm verify:backend`: product `2,557 pass / 129 intended skip`, production build, and security Playwright `12/12` passed.
- Current-diff predecessor regression: #2 unit `55 pass / 20 integration skip` and disposable PostgreSQL fresh/replay `20/20` each; #3 official focused visibility/image suite `59 files / 618 tests`; #4 snapshot authority fresh `15 pass / 1 intended skip` and replay `16/16` inside the #6 runner; #5 editor `9 files / 61 tests`.
- An additional non-required standalone #3 PostgreSQL diagnostic returned `74/75`: its unchanged pre-existing remote-verifier fixture reports `guard_unsafe_membership_count=1` while the test's simulated clean result overrides lifecycle, role and direct-mutation fields but not that field. The runner, test and verifier are byte-unchanged from reviewed head `1a5a6d47...`; the required #3 focused regression is green and this repair does not alter or claim that unrelated predecessor diagnostic.
- `pnpm audit --audit-level high`: high/critical `0`; one pre-existing low advisory remains.
- source/workpack/automation/workflow-v2/OMO/closeout/branch validators and `git diff --check` passed. Commit and PR-body validators are rerun after the repair commits/body update.
- No matching slice-specific local-fixture E2E exists before #7/#8 activation; no empty grep is claimed green.
- Production/staging/remote application writes remain `0/0/0`. Contract Evolution Candidate remains `none`.

## Fresh Stage 3 re-review repair — writer-first lifecycle and full session authority

The same Stage 2 author repaired, but did not approve, the fresh independent reviews of exact head `bcc4aa4efad7419837e3a35ae7b5c6ab5661ef31`. The implementation repair commit is `cfc2dfab46ce192a3c9160920d4a2a6db4ddb5f0`.

- code/quality task `019fc194-0255-7df1-abc2-0c01b08ef001`: `REQUEST_CHANGES`, P0/P1/P2 `0/1/0`.
  - The reviewer tied the official same-transaction `session_id + iat + identity epoch + generation` requirement to workpack README line 28, API v1.2.33 line 211 and automation-spec line 32.
  - At reviewed migration lines 100-115 the RPC signature had no JWT `iat`; the binding lookup near reviewed lines 348-358 could not compare `session_issued_at`. The reviewer also cited the existing binding column near full-local foundation line 698, authenticated pre-request/service-role boundary near request-authority line 348, and the iat-less PostgreSQL caller near reviewed test line 281.
- security/DB task `019fc193-e6e0-7571-a486-5d3d6efa2a40`: `REQUEST_CHANGES`, P0/P1/P2 `0/2/0`.
  - The public-source lifecycle row was locked with `FOR KEY SHARE` near reviewed migration lines 409-430. The reviewer reproduced a writer-first interleaving where a non-key `status='quarantined'` update committed before the already-guarded writer, while the existing regression near reviewed test lines 627-656 covered transition-first only.
  - The same reviewed binding lookup omitted `binding_state`, expiry, local authority/issuer, auth cutover epoch and current control authority. The reviewer cited the canonical full-local predicate near foundation lines 1157-1177 as the reusable upper bound.

Neither review task is marked complete. Both findings require a new independent Stage 3 re-review of the repaired current head.

### Fresh repair RED → GREEN

- Locked static RED before implementation edits: `4 files`, `14 passed / 2 failed`. Failures were the missing JWT `iat`/canonical authority call/strong lifecycle lock and the stale exact function signature.
- Disposable PostgreSQL RED in both fresh and replay: #6 `17 passed / 2 failed` out of 19. An expired binding completed successfully instead of raising `ACCOUNT_SESSION_STALE`, and all three writer-first transitions returned `[false,false,false]`, proving `quarantined`, `deleting` and `cleanup_pending` could commit before the writer transaction.
- The first RED fixture also left local-authority rows visible to the following central inventory suite, producing an additional fixture-isolation failure. This was not counted as a product finding; `afterAll` now removes only the disposable #6 session bindings before central inventory verification.
- Locked static GREEN/refactor: `4 files / 16 tests passed` and `git diff --check` passed.
- Disposable PostgreSQL GREEN in both fresh and replay: predecessor snapshot authority fresh `15 pass / 1 intended skip`, replay `16/16`; #6 `19/19` per mode; active central inventory `30 pass / 16 inactive skip` per mode with exact personal function inventory `33`.

### Fresh findings closure evidence

- `write_personal_recipe_core` now accepts exact JWT `session_issued_at`, pins the full-local control row after the common shared fence, acquires the owner lifecycle lock, then reuses `assert_full_local_session_authority`. The canonical predicate verifies service-role context, current local authority/issuer/cutover/HMAC control, auth identity epoch, active/non-revoked/non-expired binding, exact JWT iat and active expected generation in the same transaction. The returned generation must equal the latest locked owner lifecycle generation.
- Public source/recipe owner lifecycle rows now use `FOR SHARE`, which conflicts with non-key status UPDATE. The writer-first test holds the F0 marker row only as an explicit post-guard barrier, observes the writer's real PostgreSQL lock wait, starts an independent lifecycle transition connection, proves that transition also waits, then releases the barrier. Writer commit precedes transition commit; every post-transition fork is `RESOURCE_NOT_FOUND` with identical recipe/idempotency/snapshot digest.
- The transition-first race remains covered. The new writer-first matrix covers `quarantined`, `deleting` and `cleanup_pending`; nullable/non-public visibility continues to fail closed through `IS DISTINCT FROM` and `IS NOT TRUE` predicates.
- Binding negatives cover expired, revoked, non-active, wrong issuer, stale cutover epoch, mismatched JWT iat, stale identity epoch, remote current authority, changed current issuer, changed current cutover epoch and changed current HMAC control. Their before/after mutation digest is identical; one exact valid binding succeeds.
- The changed exact RPC signature is locked in migration owner/REVOKE/GRANT statements, the slice security manifest, fresh/replay owner/security-mode/overload/grantability queries and PUBLIC/anon/authenticated/service_role actual-call matrix. Central inventory remains exact with no unexpected overload.

### Fresh repair verification

- Locked focused static: `16/16`.
- #6 PostgreSQL fresh/replay: #6 `19/19` each; predecessor #4 `15 pass / 1 intended skip` fresh and `16/16` replay; central inventory `30 pass / 16 intended skip` each.
- Predecessors: #2 focused `83/83` and PostgreSQL fresh/replay `20/20` each; #3 official focused `618/618`; #4 focused `35/35`; #5 focused `62/62`.
- The separate non-required #3 PostgreSQL diagnostic remains honestly `74/75`, failing only the unchanged remote-verifier simulated-clean assertion. It is not replaced by or claimed green through `618/618`.
- `pnpm verify:backend`: lint, typecheck, product `2,557 pass / 129 intended skip`, production build and security Playwright `12/12` passed.
- Source/workpack/automation/workflow-v2/OMO/closeout/branch validators passed; validator-focused Vitest returned `8 files / 98 tests passed`.
- `pnpm audit --audit-level high`: high/critical `0`; one pre-existing low advisory remains. No slice-specific browser E2E exists before #7/#8 activation, so no empty grep is claimed green.
- Production/staging/remote application writes: `0/0/0`. Capability activation, public route activation, Ready, merge, Discord and Claude use: none. Contract Evolution Candidate: none.

## Third Stage 3 repair — cross-owner full-cleanup lock order

The same Stage 2 author repaired, but did not approve, two fresh independent reviews of exact head `d197086c9ff0a140878104716dfb73dff0f2ad27`:

- code/quality task `019fc1cf-9b72-7080-bddd-24e166fe86e1`: `REQUEST_CHANGES`, P0/P1/P2 `0/1/0`.
  - The reviewer identified recipe advisory/row acquisition near reviewed migration lines 391/404 before the source-owner lifecycle `FOR SHARE` near line 423.
  - Its actual two-connection reproduction held the source-owner lifecycle first, let the writer hold the public source recipe row, then ran full account cleanup. `public.users DELETE` reached the `recipes.created_by ON DELETE SET NULL` path and PostgreSQL returned `deadlock detected` instead of an official application error.
- security/DB task `019fc1cf-9b73-71e1-b2d2-c8009811ee79`: `REQUEST_CHANGES`, P0/P1/P2 `0/1/1`.
  - It independently reproduced the same lifecycle→recipe versus recipe→lifecycle cycle and tied it to the official `global → all affected owners → recipe → resource` order.
  - It also identified `.workflow-v2/status.json` line 589, where the unrelated merged `baemin-prototype-planner-week-parity` item had changed from the exact-base `pr_path: pending` to PR #1274.

The actual prior repair commit is `cfc2dfab46ce192a3c9160920d4a2a6db4ddb5f0`, as already recorded in this evidence and the PR body. The third implementation repair commit is `080193e73346eff91c1266045e7dfa6da43d26a6`.

Neither reviewer result is marked complete. Fresh independent Stage 3 code/quality and security/DB re-review of the new current head remains pending.

### Third repair RED → GREEN

- Locked static RED before implementation: `1 failed / 4 passed`; the migration had no mutation-free affected-owner pre-read before the owner/recipe order.
- Disposable PostgreSQL RED in both fresh and replay: #6 `19 passed / 1 failed` out of 20.
  - Observed lock graph: writer `Lock:transactionid`, cleanup `Lock:advisory`, writer blocked by cleanup, cleanup blocked by the explicit barrier.
  - The recipe `FOR UPDATE NOWAIT` probe failed before every affected owner was acquired.
  - After barrier release the writer exited `1` with actual PostgreSQL `deadlock detected`; cleanup exited `0`.
  - Contracted cleanup still preserved the public source as `visibility=public`, `created_by=NULL`, revision `1`; the failed writer left fork/idempotency receipt counts `0/0`.
- Locked static GREEN/refactor: the full locked suite returned `4 files / 16 passed` plus the PostgreSQL file's intended local skip.
- Disposable PostgreSQL GREEN in both fresh and replay: predecessor #4 fresh `15 pass / 1 intended skip`, replay `16/16`; #6 `20/20` per mode; central inventory `30 pass / 16 intended skip` per mode.

### Third findings closure

- The RPC performs a mutation-free pre-read of request/source/target recipe authority candidates after the global shared fence and capability/control pins.
- Requester and discovered source/target owners are deduplicated and UUID-sorted with `COLLATE "C"`; each owner advisory and latest lifecycle row is locked before any recipe advisory or row lock.
- The canonical `assert_full_local_session_authority` call remains after the complete owner loop and before recipe locks, so requester session authority does not reintroduce requester-first multi-owner ordering. JWT `iat`, binding state/expiry, authority/issuer/cutover/HMAC, identity epoch and generation checks remain unchanged.
- Recipe/source rows are re-read under `FOR UPDATE`. Owner, visibility or deletion drift converges to the existing `RESOURCE_NOT_FOUND` without adding a field, status, error or endpoint.
- The real full-cleanup test covers both directions. Cleanup-first completes account cleanup/anonymization before the writer fails non-disclosing with mutation zero and no deadlock; writer-first commits the fork before full cleanup completes. Public source preservation and contracted anonymization are asserted in both cases.
- The unrelated `baemin-prototype-planner-week-parity.pr_path` is restored to exact-base `pending`; PR #1274 is projected only on the `personal-recipe-customization-write-core` item.

Production/staging/remote application writes remain `0/0/0`. Capability activation, Ready, merge, Discord and Claude use remain none. Contract Evolution Candidate remains none.

### Third repair verification

- Locked focused command: `4 files / 16 passed`; the PostgreSQL file was intentionally skipped outside its disposable runner.
- #6 disposable PostgreSQL fresh/replay: #6 `20/20` each; predecessor #4 fresh `15 pass / 1 intended skip`, replay `16/16`; central inventory `30 pass / 16 intended skip` each.
- Predecessors: #2 focused `9 files / 55 tests` plus PostgreSQL fresh/replay `20/20` each; #3 official focused `59 files / 618 tests`; #4 focused `4 files / 45 tests`; #5 focused `9 files / 61 tests`.
- The separate non-required #3 PostgreSQL diagnostic was not substituted with the focused suite. Its existing `74/75` simulated-clean assertion diagnosis remains separately disclosed.
- `pnpm verify:backend`: lint, typecheck, product `202 files passed / 9 skipped` and `2,557 tests passed / 129 intended skip`, production build and security Playwright `12/12` passed.
- Source/workpack/automation/workflow-v2/OMO/closeout/branch validators and `git diff --check` passed. Validator-focused Vitest returned `8 files / 84 tests passed`.
- `pnpm audit --audit-level high`: high/critical `0`; one pre-existing low advisory remains.
- No slice-specific browser E2E exists before #7/#8 activation, so no empty grep is claimed green.
