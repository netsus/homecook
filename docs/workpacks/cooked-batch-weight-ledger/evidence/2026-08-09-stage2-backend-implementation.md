# Stage 2 backend implementation evidence — 2026-08-09

## Scope and lineage

- Workpack: `cooked-batch-weight-ledger` (#8)
- Stage/role: Stage 2 / fresh `backend-implementer`
- Codex task ID: `019fe1aa-82fd-7602-844e-e050efae93db`
- Exact base: `master` / `origin/master` `635763041d6420c648e2b55336e6caa9f1f9143c`
- Fresh branch: `feature/cooked-batch-weight-ledger-stage2-current`
- Preserved held branch: `feature/be-cooked-batch-weight-ledger` exact `3c5b6760ce8c9a8b51205c755f9f92d57177ca00`
- The held branch was restored before task changes and was not rebased, edited, force-pushed or cherry-picked.
- Current tuple: requirements `v1.7.30`, screens `v1.5.34`, Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`; API `0-CBW` is byte-identical to v1.2.36.

This task changes only #8 DB/backend/API, the existing leftovers compatibility reader/writer boundary, and the repository-wide account-session route inventory entries required by the new #8 write routes. It does not change personal recipe editor product/docs, F0, another workpack, frontend/Stage 4, #9 meal-log public ownership or #11 visual ownership.

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

PostgreSQL refinement also separated fixture isolation from two earlier product defects: terminal sessions were revalidating the active Meal revision pin, and completion set `meals.leftover_dish_id` without `is_leftover`. The final migration keeps immutable start snapshots as audit data after terminal transition and leaves ordinary planner Meal leftover-origin fields unchanged.

Final fresh and replay PostgreSQL evidence:

```text
fresh predecessor: 15 passed / 1 intended skip
fresh cooked batch: 22 passed
fresh inherited shared security inventory: 26 passed / 22 intended skips
replay predecessor: 16 passed
replay cooked batch: 22 passed
replay inherited shared security inventory: 26 passed / 22 intended skips
```

The cooked-batch scenarios cover exact 23-function owner/ACL/search-path/scope inventory, owner RLS, direct protected update/event insert/select/checksum and forged batch INSERT denial, two-owner multi-table digests including progress-summary timestamps, exact pantry/claim rollback, stale session-generation zero-write, monotonic same-session JWT rotation, owner-locked keep, atomic canonical progress/activity projection, duplicate/replay zero-write, standalone and planner completion/replay, idempotency payload mismatch including reason, full cached-projection tamper denial, DB-level NULL/blank discard-adjust rejection, unrecoverable irreversibility, close/cancel/reclose XP once, a forced two-connection v1/v2 `60+45` award race, v2 unavailable versus legacy-null nutrition status, strict canonical cursor parsing, representative 4,000 v2 + 4,000 legacy row `EXPLAIN (ANALYZE, BUFFERS)` checks for both exact LEFTOVERS predicates, depleted meal reuse denial and exact-owner cleanup ordering.

## Verification

- `pnpm install --frozen-lockfile` — pass; no dependency or lockfile change
- final focused Vitest — successor regression `10 files / 90 tests`, official contract `4 files / 27 tests` pass
- full `pnpm test` — initial implementation attempt 1: 9 failures; attempt 2: 1 stale Stage 1 projection failure; attempt 3 passed. Successor attempt 1 exposed 1 wrapper-inventory omission; attempt 2 exposed 2 bookkeeping/inventory projections; successor attempt 3 passed. Exact `b47c8d62` run: `520 files passed | 29 skipped`, `5,283 tests passed | 352 skipped`. Narrow validator successor: `520 files passed | 29 skipped`, `5,287 tests passed | 352 skipped`.
- `pnpm exec vitest run tests/check-workpack-docs.test.ts tests/cooked-batch-api-contract-v1-2-36.test.ts` — `2 files / 36 tests` pass; the validator-only file is `25/25`
- `pnpm validate:workpack -- --slice cooked-batch-weight-ledger` — pass with visible `Workpack docs OK for slice 'cooked-batch-weight-ledger' (base: master)` marker; `unknown-workpack` exits `1` with both missing governing paths
- `pnpm test:cooked-batch-weight-ledger:postgres` — final successor pass: fresh predecessor `15 + 1 intended skip`, fresh/replay #8 `22/22`, replay predecessor `16/16`, inherited shared security inventory fresh/replay `26 passed / 22 intended skips`
- `pnpm verify:backend` — pass: lint, typecheck, `217 files passed | 11 skipped`, `2,664 tests passed | 150 skipped`, Next build, security E2E `12/12`
- `pnpm test:security-functions:postgres` — pass: 8 anonymous mutation signatures denied with unchanged checksums
- `node scripts/validate-security-function-authorization.mjs --contract-only` — pass; #8 manifest classifies 23 pre-deployment functions, including three explicit full-local replacements
- source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators — pass
- account-session generation inventory — pass: `64 routes / 85 write surfaces / 3 auth.users inbound FKs`; the removed surface is the legacy keep direct UPDATE replaced by the owner-locked RPC
- `pnpm audit --audit-level high` — exit 0; residual `1 low / 1 moderate`, high `0`, critical `0`
- `git diff --check` — pass

The workpack-specific Stage 4 E2E grep returned `No tests found`; no pass-with-no-tests relaxation was added because frontend work is prohibited in Stage 2. Backend security E2E is covered by the successful `12/12` verification above.

## Runtime and manual boundary

- Migration was applied only to the isolated ephemeral PostgreSQL fresh/replay harness. No remote Supabase, production, staging, Vercel, server-Mac or capability activation write occurred.
- The configured local security-function authorization validator sees a pre-existing partially deployed additive runtime and reports missing older full-local/hybrid functions including `private.verify_full_local_internal_scope`; this task did not mutate that external runtime. Repository migration fresh/replay ACL/RLS checks pass.
- The inherited security inventory still runs exact shared function/RLS/policy and tamper cases. Personal-recipe Storage/runtime cases are intended skips in this Stage2 runner because later follow-up migrations produce that other workpack's expected schema/ACL drift; no personal recipe product, docs or generated artifact was changed.
- Deterministic `FOR UPDATE` order, exact affected-row counts, two-owner before/after multi-table digests and a real two-connection v1/v2 progress interleaving are covered. Merged-exact-SHA local Supabase/server-production rehearsal remains manual/future evidence.
- Merged-exact-SHA server-production/local-rehearsal, R/R+1 seeded drain, current/previous release evidence, R+2 service-owner activation, frontend/E2E visual work and post-merge verification remain open.
- #9 still owns the physical meal-log linked event pointer and arbitrary-order consumed-entry reversal. #11 still owns final LEFTOVERS/weight UI.

## Author five-axis check

- Correctness: official wrapper/status/error shapes, legacy idempotency, full cached projection and fresh/replay state transitions match focused and PostgreSQL tests.
- Readability/architecture: all three legacy mutations share the existing verified-session RPC adapter and one database authority; no route-side compensating XP/activity path remains.
- Security: current-generation authority, owner row locks, exact affected-row counts, private helper ACLs and safe-column SELECT grants are fail closed.
- Performance: pagination remains bounded; representative 4,000-row v2 plus 4,000-row legacy fixtures exercise the exact leftover and eaten route predicates under `EXPLAIN (ANALYZE, BUFFERS)` with four purpose-specific partial compatibility indexes and no broad table scan proof substitution.
- Scope/dependencies: no frontend, personal-recipe product/docs, F0, new public contract or package dependency changed. This author check is not Stage 3 approval.

## Contract evolution and handoff

- Contract Evolution Candidate: none. No undocumented endpoint, field, status, reason, error, action or screen was added.
- Stage 3 must be a different fresh `backend-reviewer` task and review the Draft PR successor head, every repaired old-head and successor advisory finding, migration/RPC/trigger atomicity and grants, route inventory isolation, legacy leftovers compatibility, fresh/replay evidence and every checked `review=3` item. Author-side current diff review is not an independent approval.
- This Stage 2 task does not self-approve Stage 3, mark Ready, merge or send Discord.
