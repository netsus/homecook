# meal-log-core Stage 3 ML3-FINAL-007 HOLD repair evidence

## Identity and exact input

- repair date: `2026-08-10`
- role: backend repair author after Stage 3 HOLD; not an independent reviewer or approver
- repair task ID: `019fea97-fde1-7870-9ce7-1d8a372db7f5`
- predecessor reviewer task ID: `019feacc-c217-7bb1-a85f-788f9e7e9389`
- pull request: `#1319`, `master` <- `feature/be-meal-log-core`
- reviewed predecessor head: `8999a5e8c02826e05a3815bb7bd84660b7864a65`
- reviewed predecessor tree: `6ad0bf740612e488de09dca33302427e40121474`
- PR base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- local repair branch: `fix/meal-log-core-ml3-final-006`

Preflight matched the exact local head/tree, remote feature head, and PR head/base. PR #1319 was `OPEN`, Ready, `CLEAN`, and `MERGEABLE`, and was returned to Draft before the first repair edit. The unrelated newer `master` history was not reset, rebased, merged, or otherwise integrated. Stage 2 remains unmerged and unapplied, so governing policy keeps `20260810120000_meal_log_core.sql` as the repair surface; no new migration was added.

No self-approval, Ready transition, merge, Discord, production/staging/remote DB, server-Mac, OAuth, capability, activation, force push, rebase, amend, or Claude surface was used.

## TDD RED evidence

The PostgreSQL regressions were added before implementation changed, then run after a fresh local Supabase reset. Canonical RED was:

- `tests/meal-log-core-postgres.integration.test.ts`: `1 file`, `25 tests`, `7 failed / 18 passed`.
- duration: Vitest `23.00s`, wall clock `24.18s`.
- every new negative failed because the prohibited PATCH returned process status `0` instead of `RESOURCE_NOT_FOUND`:
  - revoked pinned product nutrition profile plus same-quantity, meal-column-only PATCH;
  - revoked pinned ingredient link plus quantity PATCH;
  - revoked pinned ingredient link plus same-quantity metadata PATCH;
  - revoked pinned volume assignment;
  - revoked pinned piece weight;
  - rejected/inactive pinned evidence;
  - rejected/inactive/stale pinned source.

The evidence/source contracts have no `revoked` review status and do not permit an approved row to transition to rejected. Their negative fixtures therefore use a rollback-only superuser setup with triggers disabled to establish an officially enumerated but disallowed stored state, restore normal trigger execution, and call the public RPC. Normal product/link/assignment/piece revocations use the official state transitions. Assertions were not weakened to obtain GREEN.

## ML3-FINAL-007 closure

The public mutation RPC now validates historical pinned authority before the cached same-quantity path:

- product PATCH resolves the entry's exact immutable product version and validates its underlying profile before cached nutrition reuse;
- ingredient PATCH validates the exact pinned ingredient link and underlying nutrition profile;
- a pinned volume conversion validates the exact assignment, evidence, and nutrition source chain;
- a pinned piece conversion validates the exact piece row, evidence, and nutrition source chain.

Each pinned layer is reusable only when it remains active and approved/current, or when the same-source historical path sees an inactive `superseded` row. `revoked`, `rejected`, stale active authority, a missing chain row, or any other disallowed state raises the existing `RESOURCE_NOT_FOUND` error before entry revision, receipt, or aggregate mutation. The repair does not globally relax immutable/current validators and adds no endpoint, field, status, or error code.

Create and source-changing PATCH still use only current active approved exact authority. Same-source normally superseded product, ingredient, piece, volume, evidence, and source pins remain immutable and reusable without silent repin. Product and ingredient superseded controls exercise both quantity changes and same-quantity metadata replay; conversion controls preserve the exact evidence IDs and recompute the expected nutrition values.

Negative regressions compare the full entry plus owner meal-log receipt digest and the public day aggregate digest before and after failure. They also assert zero matching patch receipts. Positive regressions assert exact pinned IDs, nutrition, revision increments, identical same-key replay responses, and exactly one receipt. Existing owner/RLS, exact-one source/evidence, conversion-class reselection, rollback, idempotency, pointer, batch capacity, and full #8 cached-projection integrity tests remain GREEN.

No private function signature or private function definition changed. The existing security-function manifest therefore remains unchanged; the modified public RPC retains owner `postgres`, `SECURITY DEFINER`, fixed `pg_catalog, public, private, pg_temp` search path, service-role-only execution, and revoked public/anon/authenticated execution.

## GREEN verification

- `pnpm install --frozen-lockfile`: PASS; lockfile and dependencies unchanged.
- fresh `pnpm exec supabase db reset --local`: PASS through `20260810120000_meal_log_core.sql`.
- final fresh PostgreSQL verbose run: PASS — `1 file / 25 tests`, Vitest `26.30s`, wall clock `26.97s`.
  - longest test: `2.525s`.
  - inherited revoked compound test: `1.957s`.
  - default `5s` timeout is sufficient; the inherited unjustified `10s` override was removed.
- focused meal-log suite: PASS — `4 files / 21 tests`.
- fresh nutrition-model PostgreSQL integration: PASS — `2 files / 14 tests`.
- current/future policy suites: PASS — `4 files / 60 tests` and `4 files / 22 tests` in the executed validator-support commands.
- authority evidence: PASS — `1 file / 29 tests`; authority-evidence CLI PASS.
- security-function contract-only: PASS — meal-log `11` functions classified.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 pnpm verify:backend`: PASS.
  - lint and typecheck: PASS.
  - product tests: `2,716 passed / 175 intended skipped`.
  - production build: PASS — `81/81` static pages generated and meal-log routes present.
  - security E2E: `12/12` passed.
- source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, Draft closeout-sync, branch, commit-message, and diff-policy validators: PASS.
- `pnpm audit --audit-level high`: PASS at the requested threshold; existing inventory is `1 low / 1 moderate / 0 high / 0 critical`, with no dependency change.
- `pnpm harness:audit`: command PASS, score `4.3/5`; repository-wide promotion remains `not-ready` for pre-existing unrelated `H-CI-001` and `H-OMO-001`. Backend harness and review/closeout remain `5/5` with no scoped finding.

Port `3100` was not stopped or reused. The repository-supported `PLAYWRIGHT_BASE_URL` isolated backend security verification on port `3111`.

## Changed files

- `supabase/migrations/20260810120000_meal_log_core.sql`
- `tests/meal-log-core-postgres.integration.test.ts`
- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-final-007-hold-repair.md`

The final successor head/tree and current-head GitHub check inventory are recorded in the PR body because a commit cannot embed its own hash.

## Review and lifecycle boundary

This author reports only `ML3-FINAL-007` code/test closure and does not approve Stage 3. A different fresh Codex task must review the exact delivered successor head/tree and publish the Stage 3 verdict.

The four Manual external smokes, merged-exact-SHA server-production/local-rehearsal evidence, server-Mac/OAuth, capability, R/R+1/R+2, activation, merge, and post-merge evidence remain pending and unclaimed.
