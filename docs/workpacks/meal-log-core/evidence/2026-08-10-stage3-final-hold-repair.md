# meal-log-core Stage 3 final HOLD repair evidence

## Identity and exact input

- repair date: `2026-08-10`
- role: fresh backend repair author after Stage 3 HOLD; not an independent reviewer or approver
- repair task ID: `019fea4d-6962-7ca1-b099-9a82415bfbc1`
- pull request: `#1319`, `master` <- `feature/be-meal-log-core`
- report successor input head: `7635056b40b18788d5ef760cce87ed3f773c43ba`
- input tree: `67eca3433d3a3ef2b50fdf3c3fcc5c4c22ebf1a0`
- input base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- HOLD report: `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-backend-final-rereview.md`
- local repair branch: `fix/be-meal-log-core-stage3-final-repair`

The local, remote, and PR heads matched the required input before repair. The stale divergent local feature branch was not reset, rebased, amended, or force-pushed. A fresh local repair branch was created from the exact remote head, and PR #1319 was returned to Draft before implementation. The final delivery head/tree and current-head checks are recorded in the PR body because a commit cannot embed its own hash.

The already-unmerged, locally unapplied Stage 2 migration remains the governing migration surface, so this repair updates `20260810120000_meal_log_core.sql` instead of inventing another migration. No remote migration apply, remote Supabase/Vercel write, production/staging action, server-Mac/OAuth action, capability or R/R+1/R+2 activation, merge, Discord, or Claude surface was used.

## TDD RED evidence

- focused runtime contract RED: `tests/meal-log-core.test.ts` ran `11` tests with `3 failed / 8 passed`.
  - mutation projection accepted an entry missing `id`;
  - day projection accepted an active column missing `id`;
  - recent projection accepted string `last_amount`/`frequency` values.
- fresh local PostgreSQL reset completed before SQL RED.
- PostgreSQL RED: `tests/meal-log-core-postgres.integration.test.ts` ran `14` tests with `5 failed / 9 passed`.
  - piece→volume PATCH returned `UNIT_CONVERSION_MISSING` despite one exact approved volume path;
  - ambiguous volume evidence and duplicate product basis pairs were silently accepted;
  - same-batch PATCH left `private.assert_cooked_batch_cached_projection` and the next valid mutation at `CONFLICT`, with stale remaining weight;
  - a valid same-batch capacity increase returned `CONFLICT`.
- Assertions were not weakened. The failures were observed before the corresponding implementation changes.

## Finding closure matrix

| ID | Repair | GREEN evidence | Repair status |
| --- | --- | --- | --- |
| `ML3-FINAL-001` | same-batch PATCH replays after its reversal and again after replacement, so the #8 revision authority advances once per appended event | full cached-projection assertion succeeds immediately; a subsequent valid `10g` mutation succeeds and remaining weight is `640g` | code/test closed |
| `ML3-FINAL-002` | capacity is evaluated from the locked batch after crediting only the patched entry's own reversal | valid increase, exact equality, true overdraw rollback, multiple-entry preservation, same-key replay and event-count stability pass in PostgreSQL | code/test closed |
| `ML3-FINAL-003` | old evidence is reused only when it matches the newly requested conversion class and exact profile/preparation; otherwise one current approved exact candidate is selected | piece↔volume and volume→mass pass; missing/ambiguous candidates return the official conversion error with unchanged state | code/test closed |
| `ML3-FINAL-004` | direct product basis lookup counts candidates and requires exactly one forward or reverse match | forward/reverse pass; missing/duplicate pairs return `UNIT_CONVERSION_MISSING` with zero writes | code/test closed |
| `ML3-FINAL-005` | mutation/day/column/section/entry/total/recent RPC values are validated and explicitly rebuilt through shared runtime projectors | focused response-contract suite passes missing/wrong-field negatives and exact public projection assertions | code/test closed |

The repair adds no endpoint, status, error code, or public response field. Owner/account-generation authority, RLS, service-role-only RPC grants, canonical batch lock order, idempotency, exact-source constraints, pointer integrity, rollback, and the #8 assertion remain intact.

## GREEN verification

- fresh `pnpm exec supabase db reset --local`: PASS through `20260810120000_meal_log_core.sql`
- fresh `pnpm test:meal-log-core:postgres`: PASS — `1 file / 14 tests`
- focused meal-log Vitest: PASS — `4 files / 21 tests`
- current-vs-future validators: PASS — `4 files / 36 tests`
- authority evidence validator: PASS — `1 file / 29 tests`
- security-function contract-only: PASS — meal-log `11` functions classified
- `pnpm verify:backend`: PASS
  - lint and typecheck: PASS
  - product tests: `2,716 passed / 164 intended skipped`
  - production build: PASS — `81/81` static pages generated and meal-log routes present
  - security E2E: `12/12` passed
- `git diff --check`: PASS

## Review and lifecycle boundary

This author reports the five code/test findings closed but does not approve Stage 3 or check independent-review completion. A different fresh Codex task must review the delivered exact successor head/tree and publish the Stage 3 verdict.

The four manual external smokes, merged-exact-SHA server-production/local-rehearsal evidence, OAuth, capability, R/R+1/R+2, activation, merge and post-merge evidence remain pending and unclaimed. Those lifecycle items are not converted into local code evidence by this repair.
