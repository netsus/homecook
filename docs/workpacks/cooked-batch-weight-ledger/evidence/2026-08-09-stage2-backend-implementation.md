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
- Legacy eat/uneat now uses one owner-row-lock RPC even while account generation is active; authenticated direct v2-shaped INSERT and event-table SELECT are revoked
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

PostgreSQL refinement also separated fixture isolation from two earlier product defects: terminal sessions were revalidating the active Meal revision pin, and completion set `meals.leftover_dish_id` without `is_leftover`. The final migration keeps immutable start snapshots as audit data after terminal transition and leaves ordinary planner Meal leftover-origin fields unchanged.

Final fresh and replay PostgreSQL evidence:

```text
fresh predecessor: 15 passed / 1 intended skip
fresh cooked batch: 13 passed
fresh inherited shared security inventory: 26 passed / 22 intended skips
replay predecessor: 16 passed
replay cooked batch: 13 passed
replay inherited shared security inventory: 26 passed / 22 intended skips
```

The cooked-batch scenarios cover exact 17-function owner/ACL/search-path/scope inventory, owner RLS, direct protected update/event insert/select and forged batch INSERT denial, two-owner multi-table digests, exact pantry/claim rollback, standalone and planner completion/replay, idempotency payload mismatch including reason, discard/adjust bounds, unrecoverable irreversibility, close/cancel/reclose XP once, v2 unavailable versus legacy-null nutrition status, depleted meal reuse denial and exact-owner cleanup ordering.

## Verification

- `pnpm install --frozen-lockfile` — pass; no dependency or lockfile change
- final focused Vitest — `6 files / 58 tests`, official contract `4 files / 21 tests`, verifier projection `4 files / 54 tests` pass
- full `pnpm test` — attempt 1: 9 failures; attempt 2: 1 stale Stage 1 projection failure; attempt 3 pass: `520 files passed | 29 skipped`, `5,277 tests passed | 343 skipped`
- `pnpm test:cooked-batch-weight-ledger:postgres` — final pass: fresh predecessor `15 + 1 intended skip`, fresh/replay #8 `13/13`, replay predecessor `16/16`, inherited shared security inventory fresh/replay `26 passed / 22 intended skips`
- `pnpm verify:backend` — pass: lint, typecheck, `217 files passed | 11 skipped`, `2,664 tests passed | 150 skipped`, Next build, security E2E `12/12`
- `pnpm test:security-functions:postgres` — pass: 8 anonymous mutation signatures denied with unchanged checksums
- `node scripts/validate-security-function-authorization.mjs --contract-only` — pass; #8 manifest classifies 17 pre-deployment functions
- source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators — pass
- account-session generation inventory — pass: `64 routes / 86 write surfaces / 3 auth.users inbound FKs`
- `pnpm audit --audit-level high` — exit 0; residual `1 low / 1 moderate`, high `0`, critical `0`
- `git diff --check` — pass

The workpack-specific Stage 4 E2E grep returned `No tests found`; no pass-with-no-tests relaxation was added because frontend work is prohibited in Stage 2. Backend security E2E is covered by the successful `12/12` verification above.

## Runtime and manual boundary

- Migration was applied only to the isolated ephemeral PostgreSQL fresh/replay harness. No remote Supabase, production, staging, Vercel, server-Mac or capability activation write occurred.
- The configured local security-function authorization validator sees a pre-existing partially deployed additive runtime and reports missing older full-local/hybrid functions including `private.verify_full_local_internal_scope`; this task did not mutate that external runtime. Repository migration fresh/replay ACL/RLS checks pass.
- The inherited security inventory still runs exact shared function/RLS/policy and tamper cases. Personal-recipe Storage/runtime cases are intended skips in this Stage2 runner because later follow-up migrations produce that other workpack's expected schema/ACL drift; no personal recipe product, docs or generated artifact was changed.
- Deterministic `FOR UPDATE` order, exact affected-row counts and two-owner before/after multi-table digests are covered. A real two-connection forced interleaving and merged-exact-SHA local Supabase/server-production rehearsal remain manual/future evidence.
- Merged-exact-SHA server-production/local-rehearsal, R/R+1 seeded drain, current/previous release evidence, R+2 service-owner activation, frontend/E2E visual work and post-merge verification remain open.
- #9 still owns the physical meal-log linked event pointer and arbitrary-order consumed-entry reversal. #11 still owns final LEFTOVERS/weight UI.

## Contract evolution and handoff

- Contract Evolution Candidate: none. No undocumented endpoint, field, status, reason, error, action or screen was added.
- Stage 3 must be a different fresh `backend-reviewer` task and review the Draft PR successor head, all fourteen repaired advisory findings, migration/RPC/trigger atomicity and grants, route inventory isolation, legacy leftovers compatibility, fresh/replay evidence and every checked `review=3` item. Author-side current diff review found no remaining P0/P1/P2, but it is not an independent approval.
- This Stage 2 task does not self-approve Stage 3, mark Ready, merge or send Discord.
