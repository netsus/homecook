# Meal Log Core Stage 2 Backend Evidence

## Scope

- Task: fresh Stage 2 backend implementer; no Stage 3 self-approval.
- Base: `origin/master` `8b1a4cce57e05d282c2a01fc54557ffc129fae1d`.
- Branch: `feature/be-meal-log-core`.
- Public contract: unchanged; official five meal-log endpoints only.
- Remote/production/staging/server-Mac/OAuth/capability/activation mutations: not run.

## TDD

- RED commit `3788890f`: `tests/meal-log-core.test.ts` failed 1/1 because the meal-log server contract did not exist.
- Review RED: immutable same-source ingredient conversion evidence test failed 1/2 before the repair.
- GREEN: focused meal-log suite passed 6 files / 19 tests; fresh local PostgreSQL passed 4/4.

## Implementation evidence

- `meal_log_entries` has owner/generation RLS, exact-one source/evidence constraints, stored local date/timezone/slot snapshots, soft delete, protected active consumption pointer, indexes and account cleanup.
- One service-role RPC performs UUID-keyed idempotent create/patch/delete with expected revision and row locks.
- Cooked-batch mutations append only to #8 events, target the active entry pointer, and call #8 full replay; no second ledger or projection was added.
- Product/ingredient nutrition is stored as immutable compact evidence. Same-source edits retain pinned product/profile/conversion identities.
- GET day/recent and POST/PATCH/DELETE routes preserve the official wrapper, errors and nondisclosure boundary.

## Verification

- `supabase db reset --local`: fresh migration replay succeeded through `20260810120000_meal_log_core.sql`.
- `pnpm test:meal-log-core:postgres`: 4/4 passed against local PostgreSQL.
- focused Vitest: 6 files / 19 tests passed.
- `pnpm verify:backend`: lint and typecheck passed; product 228 files / 2,706 tests passed, 12 files / 154 intended skipped; build passed; security E2E 12/12 passed.
- validators: source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping and closeout sync passed.
- `pnpm audit --audit-level high`: high/critical 0; residual low 1 and moderate 1.
- `pnpm test:e2e:regression:ci --grep meal-log-core`: no matching tests. This is not counted green; #12/Stage 4 UI E2E remains pending.
- `git diff --check`: passed.

## Review disposition

- Internal implementation review found four blockers; idempotency replay, direct product basis calculation, batch error split and safe recent projection were repaired.
- Follow-up review confirmed those repairs and identified same-source ingredient conversion drift; a RED/GREEN repair now reuses pinned conversion evidence.
- A suggestion to add evidence identifiers to request bodies was rejected because the official API makes server-side evidence pinning authoritative and forbids unofficial fields.

## Remaining gates

- Independent Stage 3 security/DB and five-axis approval.
- Stage 4 three-source/concurrency/DST/aggregate integration and #12 UI E2E.
- Manual/server-Mac/OAuth/capability/R/R+1/R+2/activation and merged-exact-SHA release evidence.
- Current-head Draft PR checks, Ready transition and merge.
- Discord notification intentionally untouched.
