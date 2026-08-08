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
- Account cleanup clears future #9 event links when present, then deletes events before batch hard delete

## TDD RED to GREEN

Initial contract-first RED:

```text
pnpm exec vitest run tests/cooked-batch-weight-ledger.test.ts tests/snapshot-v2-complete.test.ts tests/cooked-batch-security.test.ts tests/cooked-batch-compatibility.test.ts
4 failed files: 4 assertion failures plus 2 missing import/route suites
```

Initial implementation GREEN and final focused regression:

```text
6 files / 40 tests passed
```

PostgreSQL planner hardening added after the first 7-scenario smoke. Six refinement RED attempts separated fixture isolation from two product defects: terminal sessions were still revalidating the active Meal revision pin, and completion incorrectly set `meals.leftover_dish_id` without `is_leftover`. The final migration keeps immutable start snapshots as audit data after terminal transition and leaves ordinary planner Meal leftover-origin fields unchanged.

Final fresh and replay PostgreSQL evidence:

```text
fresh predecessor: 15 passed / 1 intended skip
fresh cooked batch: 8 passed
replay predecessor: 16 passed
replay cooked batch: 8 passed
```

The cooked-batch scenarios cover owner RLS/private-function ACL, direct protected update/event insert denial, exact projections/constraints, standalone and planner completion/replay, other-owner zero-write denial, selected-only pantry deletion, idempotency payload mismatch, discard/adjust bounds, unrecoverable irreversibility, close/cancel/reclose XP once, and account cleanup ordering.

## Verification

- `pnpm install --frozen-lockfile` — pass; no dependency or lockfile change
- final focused Vitest — `6 files / 40 tests` pass
- full `pnpm test` — final attempt pass: `520 files passed | 29 skipped`, `5,267 tests passed | 338 skipped`
- `pnpm test:cooked-batch-weight-ledger:postgres` — final pass: fresh/replay `8/8` each plus predecessor `15/15 + 1 intended skip` and `16/16`
- `pnpm verify:backend` — pass: lint, typecheck, `217 files passed | 11 skipped`, `2,662 tests passed | 150 skipped`, Next build, security E2E `12/12`
- source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators — pass
- account-session generation inventory — pass: `64 routes / 88 write surfaces / 3 auth.users inbound FKs`
- `pnpm audit --audit-level high` — exit 0; residual `1 low / 1 moderate`, high `0`, critical `0`
- `git diff --check` — pass

Full test attempts: attempt 1 exposed the new route inventory entries and a stale local `js-yaml` install; after current-slice inventory classification and frozen reinstall, attempt 2 passed. Attempt 3 reran the entire suite after the planner PostgreSQL regression was added and also passed. Lint attempt 1 found one test-only explicit `any`; the final lint/typecheck and backend verification passed.

## Runtime and manual boundary

- Migration was applied only to the isolated ephemeral PostgreSQL fresh/replay harness. No remote Supabase, production, staging, Vercel, server-Mac or capability activation write occurred.
- The configured local security-function authorization validator sees a pre-existing partially deployed additive runtime and reports missing older full-local/hybrid functions including `private.verify_full_local_internal_scope`; this task did not mutate that external runtime. Repository migration fresh/replay ACL/RLS checks pass.
- Merged-exact-SHA server-production/local-rehearsal, R/R+1 seeded drain, current/previous release evidence, R+2 service-owner activation, frontend/E2E visual work and post-merge verification remain open.
- #9 still owns the physical meal-log linked event pointer and arbitrary-order consumed-entry reversal. #11 still owns final LEFTOVERS/weight UI.

## Contract evolution and handoff

- Contract Evolution Candidate: none. No undocumented endpoint, field, status, reason, error, action or screen was added.
- Stage 3 must be a different fresh `backend-reviewer` task and review the Draft PR current head, the migration/RPC atomicity and grants, route inventory isolation, legacy leftovers compatibility, fresh/replay evidence and every checked `review=3` item.
- This Stage 2 task does not self-approve Stage 3, mark Ready, merge or send Discord.
