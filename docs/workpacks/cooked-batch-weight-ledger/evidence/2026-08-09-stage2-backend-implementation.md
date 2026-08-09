# Stage 2 backend implementation evidence — 2026-08-09

## Scope and lineage

- Workpack: `cooked-batch-weight-ledger` (#8)
- Stage/role: Stage 2 / fresh `backend-implementer`, then fresh base-drift integrator/author
- Implementation lineage task ID: `019fe1aa-82fd-7602-844e-e050efae93db`
- Base-drift integrator task ID: `019fe2b2-0ee4-77c3-a829-9ae04bfac07f`
- Original Stage 1 base: `635763041d6420c648e2b55336e6caa9f1f9143c`
- Implementation base: `eb4e878eb1d5b6fe5df00b1edd3a4f42fa472142` (PR #1292)
- Current Draft PR head at the batch-nutrition repair entry: `87f068db400beba8c9df897b18875e1ad4508f50`
- Latest `origin/master` observed at the batch-nutrition repair entry: `8e310fbfa6211c9ca8d10c716a0707c4774c4864`
- Local batch-nutrition repair branch: `fix/cooked-batch-batch-nutrition-authority`
- Draft PR #1291 remote branch retained: `feature/cooked-batch-weight-ledger-stage2-current`
- Preserved held branch: `feature/be-cooked-batch-weight-ledger` exact `3c5b6760ce8c9a8b51205c755f9f92d57177ca00`
- The held branch was restored before task changes and was not rebased, edited, force-pushed or cherry-picked.
- Current tuple: requirements `v1.7.30`, screens `v1.5.34`, Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`; API `0-CBW` is byte-identical to v1.2.36.

This task changes only #8 DB/backend/API, the existing leftovers compatibility reader/writer boundary, and the repository-wide account-session route inventory entries required by the new #8 write routes. It does not change personal recipe editor product/docs, F0, another workpack, frontend/Stage 4, #9 meal-log public ownership or #11 visual ownership.

## Latest-master base-drift integration

- PR #1292 makes `supabase/migrations/20260809100000_full_local_session_refresh_authority.sql` the canonical stable-session refresh authority. The #8 migration is ordered after the latest-master request-transaction migration as `20260809120000_cooked_batch_weight_ledger.sql`.
- The obsolete #8 copies of the refresh trigger, legacy record/assert functions, three replacement manifest entries and inventory branch were removed. #8 retains only its scope-aware `private.verify_full_local_internal_scope()` replacement and recognizes the canonical `record_full_local_session_authority_v2` / `assert_and_renew_full_local_session_authority_v2` RPC paths.
- Integration RED first failed because the cooked-batch migration still defined `private.protect_full_local_session_binding_identity`; GREEN proves that the canonical migration alone owns monotonic token evidence and that the runner applies it before #8.
- PostgreSQL regression covers a newer JWT for the same stable session, old/stale token, different session, revoked session and stale generation. Only the newer same-session token is accepted; every rejected case leaves the expanded owner digest unchanged.
- `scripts/lib/full-local-security-inventory.mjs` follows #1292 canonical ownership. Shared inventory expectations were intentionally advanced from 29/33 to 32/36 functions; no #1292 security entry or user/external change was dropped.
- Public API/status/field/error contracts are unchanged. Contract Evolution Candidate: none.

### 2026-08-09 integration repair against master `508a9c26`

- Exact pre-integration PR head `86f4a005eb755e473c967f30041c24b5c9ebe791` was merged with exact master `508a9c26e9442ed54aa4920f17408d0d3156cdc3` as merge commit `01ae49c09ff8421254a5ea549fa72fde95a7f6fe`; no rebase, force-push or history rewrite was used.
- The only textual merge conflict was generated `docs/security/account-session-generation-inventory.json`. The official generator preserved all #8 additions and latest-master YouTube writer locations at `64 routes / 93 write surfaces / 3 auth.users inbound FKs`, checksum `eb0a8c1cd875c38ad183c5bf4f06c9b336f08e4b00d4f2d8e425c76f72b91733`.
- Current-head CI supplied a second integration RED: master and the Draft #8 lineage both used Supabase migration version `20260809110000`. A new regression test reproduced the exact duplicate pair before the unmerged #8 migration alone moved to `20260809120000`; the already-merged master migration and both SQL bodies remain unchanged.
- Successor security task `019fe382-c33f-7ee2-8e65-faf330b0cc32` returned APPROVE `0/0/0`. The 21-function cooked-batch manifest remains exact; this author repair is not Stage 3 approval.

## Backend contract implemented

- `POST /api/v1/cooking/session-attempts/{id}/complete`
- `GET /api/v1/cooked-batches`
- `PATCH /api/v1/cooked-batches/{id}/weight`
- `POST /api/v1/cooked-batches/{id}/discard`
- `POST /api/v1/cooked-batches/{id}/adjust`
- `POST /api/v1/cooked-batches/{id}/close-unweighed`
- Exact 15-key owner-only `CookedBatchProjection`, exact 8-key completion data and exact 3-key mutation data
- Verified-session server RPC boundary with 401, nondisclosing 404, 422 validation and 409 transition/revision/idempotency errors in the existing wrapper
- Row-lock completion and mutation RPCs, append-only event/reversal ledger, cached checksum replay, UUID idempotency and owner/account-generation authority
- Exact pantry row validation and selected-only delete, planner/standalone completion, Meal `shopping_done -> cook_done`, cook count and XP once
- Legacy leftovers read projection before protected update cutover; v2 rows reject legacy eat/uneat while legacy rows remain compatible and nullable
- Legacy eat/uneat/keep now use one owner-row-lock RPC with exact active session-generation validation; authenticated direct v2-shaped INSERT, broad leftover UPDATE, event-table SELECT and `event_checksum` SELECT are revoked
- Legacy eat status, canonical progress metadata/summary and growth activity are one transaction; v2 completion and consumed closure use the same owner-serialized canonical projection authority
- Every mutation compares the full event replay with cached revision, remaining weight, status, depleted reason and checksum before writing
- Meal creation keeps the existing `write_future_meal_with_snapshot_authority` RPC contract while a transaction-local trigger row-locks the linked leftover and rejects depleted/closed v2 batches
- Completion locks exact owner pantry and Meal-claim rows, requires exact delete counts, and rolls the entire digest back when either selection changes
- Account cleanup clears future #9 event links when present, then deletes events before batch hard delete

## TDD RED to GREEN

Initial contract-first RED:

```text
pnpm exec vitest run tests/cooked-batch-weight-ledger.test.ts tests/snapshot-v2-complete.test.ts tests/cooked-batch-security.test.ts tests/cooked-batch-compatibility.test.ts
4 failed files: 4 assertion failures plus 2 missing import/route suites
```

Initial implementation GREEN and successor advisory regression:

```text
focused backend/security: 6 files / 58 tests passed
official Stage 2 contract set: 4 files / 21 tests passed
full-local/security projection regression: 4 files / 54 tests passed
```

Old-head security/DB advisory `019fe1f5-6ac2-7150-9184-437b218122f5` returned `HOLD 0/5/3`; old-head five-axis advisory `019fe1f5-6ac2-7150-9184-438ae9727b20` returned `HOLD 0/4/2`. Successor RED tests reproduced pantry and claim TOCTOU, forged direct INSERT, generation-active legacy mutation, incomplete function inventory, v2 null nutrition status, event metadata SELECT, weak cleanup marker, reason-free checksum replay, depleted batch meal reuse, empty cursor and unbounded legacy list reads. All fourteen findings received focused GREEN coverage. These old-head advisories are lineage only, not current-head approval.

Successor-head security task `019fe22e-75af-7d61-89f9-8064cd710ff9` returned `ADVISORY HOLD 0/4/1` and five-axis task `019fe22e-75ae-7e02-a131-023cc9216782` returned `ADVISORY HOLD 0/4/3` on old head `dd0825726792c9c48b09cb46396f9916e9fd580e`. New RED cases reproduced owner keep failure, revoked/stale session-generation mutation, split legacy status/XP/activity commit, incomplete v2 progress projections, exposed `event_checksum`, stale cached replay acceptance, noncanonical cursor acceptance, missing representative predicate evidence and inconsistent Stage 2 bookkeeping. The successor repair makes those boundaries fail closed and covers each with Vitest or PostgreSQL negative tests. Both advisory results and all checks on `dd082572…` are lineage only, never final proof.

Final-old-head security task `019fe265-7393-76d2-809d-e0caea0ea0ab` returned `HOLD 0/2/0` and five-axis task `019fe265-7393-76d2-809d-e0d088a7a30c` returned `HOLD 0/3/4` on old head `6c45013d22c739714f27f7a4175f4619cced38ff`. The new RED set proved that a normal same-session JWT rotation was rejected, replay/duplicate paths changed `last_updated_at`, concurrent v1/v2 first awards could persist `60+60`, DB NULL/blank payloads crossed the route-only parser, Stage 2 validation silently targeted an obsolete branch, the canonical PR URL was wrong, and the performance proof did not exercise the actual legacy/v2 LEFTOVERS OR predicates. The successor repair advances stable-session token evidence monotonically while rejecting late JWTs, returns stored replay results with zero projection writes, serializes both progress writers to `60+45`, validates payloads at the final DB authority, and exercises both exact route predicates. Both old-head advisories and all old-head checks remain lineage only.

Final `b47c8d623c2c60e09ac4735e63466a1b97126472` advisories found no product DB/security P0/P1 defects: security task `019fe298-6c5b-7bc2-990e-5de2cc14c657` returned `HOLD 0/0/2`, and five-axis task `019fe298-6c5b-7bc2-990e-5e0b941cf514` returned `HOLD 0/1/2`. The narrow successor RED reproduced the remaining P1 automation defect as four CLI failures: the explicit cooked-batch slice returned success without a marker, unknown and missing slices returned success, and the package wrapper overwrote a branch caller. The validator now gives explicit `--slice` authority independent of checkout state, fails closed for malformed or missing workpacks, preserves branch inference when no explicit slice is supplied, and emits `Workpack docs OK` only after both governing documents exist on the base. The two P2 evidence mismatches are also corrected below. The `b47c` reviews and checks are lineage only after this repair.

The first `dbf4091d…` current-head CI quality run then supplied a new environment-specific RED: GitHub's shallow pull-request checkout had no `origin/master` ref, so two real-workpack CLI cases failed, while the governing status branch incorrectly projected the local successor instead of the preserved Draft PR branch. The repair keeps status on `feature/cooked-batch-weight-ledger-stage2-current` and makes the validator shallow-fetch the exact remote base only when its ref is absent; failure to resolve that base is an error, never a silent pass. Focused GREEN is `2 files / 37 tests`, including two new base-resolution cases and all explicit-success, invalid-slice and legacy-fallback paths.

Fresh review of `e9b88ac12bb5cb7ccaa40cb662578c8d56d7f3d4` found four further gaps. Security/DB task `019fe2e0-e5fc-7b32-ab30-76519d57bb08` returned `HOLD 0/1/1`; five-axis task `019fe2e0-e60b-7221-8b9b-a720784d31c2` returned `HOLD 0/2/0`. Focused RED reproduced seven failures: completion lacked the common recipe/Meal/session lock order, live gamification projection was absent, the generic RPC helper routes were missing from the write inventory and the validator could not check an alternate stored registry, and LEFTOVERS evidence still contained an artificial `LIMIT 20`. Repair commit `e0884a6de5ce928f2dc087916d07f3d5858313c3` turns that set GREEN without changing a public response shape.

- Snapshot-v2 completion now follows `recipe UUID -> actual Meal row UUID -> session/claim`, then revalidates Meal owner/recipe/content/status/revision under the locks. A real two-connection complete/cancel regression proves no deadlock, exactly one success and one `CONFLICT`, and one valid terminal state.
- Transactional progress/summary/activity rows remain the canonical RPC authority. Completion, consumed-unweighed close and legacy eat now resolve the durable canonical event/activity IDs and invoke the existing official live projection helpers. Replays reuse the same IDs, so notification, badge, achievement and level-up writers retain their established idempotency keys; no RPC/HTTP field was added.
- The account-session inventory recognizes all `callCookedBatchRpc` writers, treats only the explicit `list_cooked_batches` target as read-only, expands the mutation verbs, and supports an alternate `--inventory` registry for a real omission-fails test. The stored inventory advances from 85 to 93 write surfaces.
- LEFTOVERS performance evidence removes both artificial limits and selects the production columns with the production predicates/order. It does not claim that the unpaginated production query is a bounded page.

Fresh exact-head re-reviews then found that the remaining performance test still joined `EXPLAIN` and `pg_indexes` output before checking index-name substrings, and that the route selected an embedded `recipe_content_snapshots(...)` relation that its response projection never consumed. Security/DB task `019fe318-2f0e-7f62-98e0-f3ed205032f4` returned `HOLD 0/1/1`; five-axis task `019fe318-2f0f-7820-a6fd-cc7325bea9bb` returned `HOLD 0/0/1` on old head `5034eb802c1a409bb3f7087c6c34e85bdd70fae3`.

Repair commit `216a7429d27aa3de09b026cf4e6ef940a6c6f3c9` keeps the public response unchanged while making the evidence claims separable and testable:

- Route RED was `1 failed / 26 passed`: the exact `leftover_dishes` select still contained the unused embedded relation. GREEN is `27/27`; the response continues to use the existing explicit `recipe_content_snapshots(id,recipe_id,title)` lookup for the immutable title, while the unused PostgREST embed is removed.
- PostgreSQL RED first rejected an unrealistically tight v2 eaten selective-plan budget (`262` shared blocks observed versus `256`), then exposed the exact PostgreSQL-normalized `pg_indexes.indexdef` text. The final budget is `320`, and fresh/replay #8 suites are `24/24`.
- The two official unpaginated compatibility predicates/orders are measured as separate `FORMAT JSON` plans. Plan trees assert selected output columns, a real relation scan node (including rational `Seq Scan`), owner/predicate scan conditions, `Actual Rows` ranges, no `Limit`, at most `8,100` scanned rows and at most `2,000` root shared blocks.
- The existing explicit snapshot-title lookup is measured separately for exact `id,recipe_id,title` output, one actual row and at most `16` shared blocks. This is the only recipe-content relationship cost claimed by this evidence after the unused embed removal.
- Four separate selective representative queries prove actual `Index Scan`, `Index Only Scan` or `Bitmap Index Scan` nodes with each exact compatibility `Index Name`, relevant scan conditions, positive actual rows and at most `320` root shared blocks. These selective proofs are not described as the combined unpaginated route plan.
- A separate `pg_catalog.pg_indexes` query compares all four full PostgreSQL-normalized `indexdef` strings exactly. Catalog existence is not treated as runtime index usage.

Fresh final review task `019fe33f-a54c-7b22-b6a2-ba72fe1145a2` found the one remaining P1: Stage 2 projected a pinned nutrition status but had not implemented the official cooked-batch amount formula. Security task `019fe33f-a54c-7b22-b6a2-ba9032c9fb4b` reported code findings `0/0/0`; its only concern was external latest-master merge-ref staleness. Repair commit `8d1145b98422d80982674b5ac8945aa28d250a8e` closes the nutrition P1 without expanding the public contract:

- RED first produced exactly three missing-function failures for content-pinned formula/provenance, invalid or missing `base_servings`, and ACL/owner authority.
- `private.resolve_cooked_batch_nutrition(uuid,uuid)` is postgres-owned, owner-bound, `SECURITY DEFINER`, fixed-`search_path`, read-only and directly executable by none of `public/anon/authenticated/service_role`; the existing private projection consumes it through its owner authority.
- Resolution follows only the batch's immutable content pin to that content snapshot's pinned nutrition snapshot. A different current/latest nutrition snapshot cannot affect the old batch.
- Every available nutrient uses exact numeric `scalable × cooking_servings / base_servings + fixed`; fixed is applied once. Decimal results are preserved without an invented rounding layer.
- `complete` writes the computed value to `amount`; `partial` keeps `amount=null`, writes the computed subtotal to `known_amount`, and preserves `minimum`; `unavailable` remains null and is never zero-filled. Quality, missing reasons, warnings, sources, snapshot IDs and calculation time remain the pinned immutable provenance.
- A missing nutrition pin returns the official unavailable state. A malformed or missing pinned `base_servings` fails closed with internal `CONFLICT`; a legacy row without a content pin keeps its existing null nutrition status.
- The authority is deterministic on replay and does not persist a duplicate nutrition FK/vector or introduce #9 meal-log storage/API. #9 may later consume this private calculation inside its own postgres-owned authority.

PostgreSQL refinement also separated fixture isolation from two earlier product defects: terminal sessions were revalidating the active Meal revision pin, and completion set `meals.leftover_dish_id` without `is_leftover`. The final migration keeps immutable start snapshots as audit data after terminal transition and leaves ordinary planner Meal leftover-origin fields unchanged.

Final fresh and replay PostgreSQL evidence:

```text
fresh predecessor: 15 passed / 1 intended skip
fresh cooked batch: 27 passed
fresh inherited shared security inventory: 26 passed / 31 intended skips
replay predecessor: 16 passed
replay cooked batch: 27 passed
replay inherited shared security inventory: 26 passed / 31 intended skips
```

The cooked-batch scenarios cover exact 21-function owner/ACL/search-path/scope inventory plus the inherited canonical refresh authority, owner RLS, direct protected update/event insert/select/checksum and forged batch INSERT denial, two-owner multi-table digests including progress-summary timestamps, exact pantry/claim rollback, same-session newer JWT acceptance with old/stale/different/revoked/generation-mismatched zero-write, owner-locked keep, atomic canonical progress/activity projection plus official live notification/badge/achievement projection, duplicate/replay canonical-ID reuse, standalone and planner completion/replay, a real complete/cancel lock race, idempotency payload mismatch including reason, full cached-projection tamper denial, DB-level NULL/blank discard-adjust rejection, unrecoverable irreversibility, close/cancel/reclose XP once, a forced two-connection v1/v2 `60+45` award race, exact content-pinned batch nutrition with fixed-once and complete/partial/unavailable provenance, v2 unavailable versus legacy-null nutrition status, strict canonical cursor parsing, representative 4,000 v2 + 4,000 legacy row exact unpaginated LEFTOVERS plans, a separate snapshot-title lookup, four selective actual-index-use plans and four exact catalog definitions, depleted meal reuse denial and exact-owner cleanup ordering.

## Verification

- `pnpm install --frozen-lockfile` — pass; no dependency or lockfile change
- remaining LEFTOVERS performance-evidence focused TDD — route RED `1 failed / 26 passed`, GREEN `27/27`; PostgreSQL budget/catalog RED reproduced identically in fresh/replay, then final #8 fresh/replay `24/24`
- first full Vitest after the plan rewrite — `1 failed / 5,327 passed / 364 skipped`; the only RED was the prior static security test looking for removed string assertions. The batch-nutrition repair final full run is `522 files passed / 28 skipped`, `5,328 tests passed / 367 skipped`
- final focused Vitest — repaired backend/gamification/security/inventory set `7 files / 69 tests` pass; final completion/security rerun `2 files / 19 tests` pass
- full `pnpm test` after batch-nutrition repair `8d1145b9…` — `522 files passed | 28 skipped`, `5,328 tests passed | 367 skipped`
- `pnpm exec vitest run tests/check-workpack-docs.test.ts tests/cooked-batch-weight-ledger-stage1-relock.test.ts` — final automation/status repair `2 files / 37 tests`; the validator-only file is `27/27`
- `pnpm validate:workpack -- --slice cooked-batch-weight-ledger` — pass with visible `Workpack docs OK for slice 'cooked-batch-weight-ledger' (base: master)` marker; `missing-cooked-batch-sentinel` exits `1` with both missing governing paths; legacy `BRANCH_NAME=feature/be-cooked-batch-weight-ledger pnpm validate:workpack` inference still resolves the real workpack and passes
- batch-nutrition focused TDD — RED `3 failed` because the private resolver did not exist; GREEN focused Vitest `6 files / 59 tests`, PostgreSQL fresh/replay #8 `27/27`
- `pnpm test:cooked-batch-weight-ledger:postgres` — final successor pass: fresh predecessor `15 + 1 intended skip`, fresh/replay #8 `27/27`, replay predecessor `16/16`, inherited shared security inventory fresh/replay `26 passed / 31 intended skips`
- `pnpm verify:backend` — pass: lint, typecheck, `217 files passed | 11 skipped`, `2,664 tests passed | 150 skipped`, Next build, security E2E `12/12`
- `pnpm test:security-functions:postgres` — pass: 8 anonymous mutation signatures denied with unchanged checksums
- `node scripts/validate-security-function-authorization.mjs --contract-only` — pass; #8 manifest classifies 21 pre-deployment functions and delegates all full-local refresh ownership to the canonical #1292 manifest/migration
- source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators — pass
- account-session generation inventory — pass: `64 routes / 93 write surfaces / 3 auth.users inbound FKs`; all eight cooked-batch/legacy helper writers are explicit, and removing one from a checksum-valid alternate registry fails closed
- `pnpm audit --audit-level high` — exit 0; residual `1 low / 1 moderate`, high `0`, critical `0`
- `git diff --check` — pass
- latest-master integration focused Vitest — `11 files / 197 tests`; migration-version TDD RED identified both `20260809110000` files, GREEN `17/17`
- latest-master full Vitest — `523 files passed / 28 skipped`, `5,357 tests passed / 369 skipped`; master adds `1 file / 28 pass / 2 intended skip` and the migration-version regression adds one pass
- latest-master `pnpm verify:backend` — pass: lint, typecheck, product `217 files / 2,665 tests` with `150 skipped`, Next build, security E2E `12/12`
- latest-master PostgreSQL fresh/replay — predecessor `15 pass / 1 intended skip` then `16/16`; #8 `27/27` twice; inherited inventory `26 pass / 33 intended skip` twice, where the two added skips are new master full-local tests outside inventory-only mode

The workpack-specific Stage 4 E2E grep returned `No tests found`; no pass-with-no-tests relaxation was added because frontend work is prohibited in Stage 2. Backend security E2E is covered by the successful `12/12` verification above.

## Runtime and manual boundary

- Migration was applied only to the isolated ephemeral PostgreSQL fresh/replay harness. No remote Supabase, production, staging, Vercel, server-Mac or capability activation write occurred.
- The configured local security-function authorization validator sees a pre-existing partially deployed additive runtime and reports missing older full-local/hybrid functions including `private.verify_full_local_internal_scope`; this task did not mutate that external runtime. Repository migration fresh/replay ACL/RLS checks pass.
- The inherited security inventory still runs exact shared function/RLS/policy and tamper cases. Personal-recipe Storage/runtime cases are intended skips in this Stage2 runner because later follow-up migrations produce that other workpack's expected schema/ACL drift; no personal recipe product, docs or generated artifact was changed.
- Deterministic `FOR UPDATE` order, exact affected-row counts, two-owner before/after multi-table digests, a real two-connection complete/cancel interleaving and a separate v1/v2 progress interleaving are covered. Merged-exact-SHA local Supabase/server-production rehearsal remains manual/future evidence.
- Merged-exact-SHA server-production/local-rehearsal, R/R+1 seeded drain, current/previous release evidence, R+2 service-owner activation, frontend/E2E visual work and post-merge verification remain open.
- #9 still owns the physical meal-log linked event pointer and arbitrary-order consumed-entry reversal. #11 still owns final LEFTOVERS/weight UI.

## Author five-axis check

- Correctness: official wrapper/status/error shapes, legacy idempotency, full cached projection and fresh/replay state transitions match focused and PostgreSQL tests.
- Readability/architecture: all three legacy mutations share the existing verified-session RPC adapter and one database authority; no route-side compensating XP/activity path remains.
- Security: current-generation authority, owner row locks, exact affected-row counts, private helper ACLs and safe-column SELECT grants are fail closed.
- Performance: the official LEFTOVERS compatibility route is currently unpaginated. Representative 4,000-row v2 plus 4,000-row legacy fixtures measure the exact initial relation predicates, output columns and order without `LIMIT`; a separate plan measures the explicit snapshot-title lookup. Four selective queries separately prove the four named compatibility indexes are used, while `pg_indexes.indexdef` separately proves their exact definitions. The combined unpaginated route plan is not claimed to use all four indexes.
- Scope/dependencies: no frontend, personal-recipe product/docs, F0, new public contract or package dependency changed. This author check is not Stage 3 approval.

## Contract evolution and handoff

- Contract Evolution Candidate: none. No undocumented endpoint, field, status, reason, error, action or screen was added.
- Stage 3 must be a different fresh `backend-reviewer` task and review the Draft PR successor head, every repaired old-head and successor advisory finding, migration/RPC/trigger atomicity and grants, route inventory isolation, legacy leftovers compatibility, fresh/replay evidence and every checked `review=3` item. Author-side current diff review is not an independent approval.
- This Stage 2 task does not self-approve Stage 3, mark Ready, merge or send Discord.
