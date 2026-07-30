# Stage 2 hybrid regression evidence — 2026-07-30

## Scope

This evidence records the local, reversible Stage 2 hybrid regression delta after
the historical PR #1218 backend and PR #1219 consumer implementation. It does not
declare Stage 2 complete and does not authorize contract/null cutover,
production/staging writes, or remote application DB/Storage access.

## Prior merged verifier delta

- PR #1231 merged the current hybrid Auth/local Data contract relock.
- PR #1232 exact head `ab020271e9b1d91b640d63c3943d0c5b6e5ee256`
  completed every started check: 17 success and 5 change-filter skips, with
  pending/fail/cancel 0.
- PR #1232 squash-merged as
  `6c9d2c32969d715de95813e93c61f005075c89a0`.
- On that clean exact `master == origin/master`, the post-merge verifier
  `--dry-run --json` passed and reported read-only mode with
  production/staging/remote application writes all 0.
- A separate read-only local PostgreSQL transaction observed
  `count(auth.users)=0`.

The actual verifier run with a real sanitized remote Auth control-plane evidence
file remains pending. No fixture evidence is substituted for that Manual Only
boundary.

## TDD evidence

1. Automation-lock RED:
   `tests/recipe-snapshot-hybrid-contract-sync.test.ts` failed 1 of 5 tests
   because the combined hybrid cleanup PostgreSQL target was not registered.
2. Initial telemetry RED:
   `tests/recipe-snapshot-authority-hybrid-verifier.test.ts` failed because
   true content/direct mismatch and backfill/pair gaps were not fail-closed.
3. Independent review found that historical direct-only inventory is not the
   required one-release write-window evidence, and that `direct=NULL` is valid
   when a content pin exists. The review-fix RED failed 4 of 23 focused tests
   until nullable direct pointers were excluded from mismatch counts,
   historical direct-only inventory remained report-only, and the runner gained
   bounded subprocess/teardown handling.
4. Hybrid deletion authority RED:
   the combined PostgreSQL test reached
   `expired hybrid cleanup session was not rejected`, proving the previous RPC
   accepted an expired active binding.
5. GREEN:
   the focused hybrid/remote/contract verifier suite passed 23 of 23. True
   mismatch and backfill gaps fail closed; historical direct-only inventory is
   reported but cannot substitute for release-window telemetry.
6. Combined PostgreSQL GREEN:
   `pnpm test:recipe-snapshot-authority:hybrid-cleanup-postgres` initially passed
   6 of 6
   against one isolated PostgreSQL instance with the F0 account-generation,
   recipe visibility, snapshot authority, hybrid identity/session, and
   `20260730150000_account_delete_hybrid_session_authority.sql` migrations.
7. Fresh code/security review RED:
   the remote verifier incorrectly excluded nutrition-null eligible Meals from
   `backfill_gap_count`, and the generation-active deletion path retained
   operational event actor/target/metadata identifiers. The focused verifier
   failed 1 of 8 and the expanded PostgreSQL fixture failed the operational scrub
   assertion.
8. Review-fix GREEN:
   the focused verifier passed 8 of 8 and the expanded PostgreSQL fixture passed
   8 of 8. The latter now covers same-key/same-intent replay, same-key/different-
   payload rejection, different-key/pending rejection, and the existing
   operational identifier scrub contract.

## Combined cleanup assertions

- missing and expired session bindings are rejected before cleanup with
  `ACCOUNT_SESSION_STALE`;
- the exact active identity epoch and generation-bound session can initiate the
  deletion;
- the full local `auth.users` table remains at count 0;
- the isolated fixture's currently implemented snapshot/product FK subset deletes
  the private content snapshot, nutrition
  snapshot, recipe/source, Meal/session/session-meal/leftover dependencies, and
  private product/profile/version/value chain through real pinned FKs;
- the owner admin membership is removed, grant/audit references are nulled, and
  operational event actor/target plus account identifier metadata keys are
  scrubbed while unrelated metadata is preserved;
- the same deletion intent/key replays the durable result, the same key with a
  different payload fails, and a different key while cleanup is pending fails;
- owner-null shared content, nutrition, recipe/source, and
  product/profile/version/value rows survive;
- one exact-generation Auth deletion outbox row is created in `pending`;
- an isolated fake-provider sequence claims and finalizes that exact outbox row,
  then represents remote epoch and session terminal mirror state locally.

The last item is a deterministic local orchestration regression only. It is not
real remote Auth terminal-readback evidence.

## Current branch verification

- focused hybrid/remote/contract Vitest: 23 of 23 passed;
- combined hybrid cleanup PostgreSQL: 8 of 8 passed;
- snapshot authority PostgreSQL existing/fresh gate: 14 passed with 1 intended
  skip, then replay gate 15 of 15 passed;
- account-session-generation PostgreSQL: 20 of 20 passed;
- core snapshot/readers/security/account-delete/consumer Vitest: 19 of 19 passed;
- `pnpm verify:backend`: lint, typecheck, 2,410 product tests, production build,
  and 12 security E2E tests passed;
- `pnpm verify:frontend`: lint, typecheck, 2,410 product tests, production build,
  six Lighthouse runs, 909 regression E2E tests with 132 intended skips,
  18 accessibility tests with 15 intended skips, 23 visual tests with 22
  intended skips, and 12 security E2E tests passed;
- the previously one-off standalone cook-mode regression passed three repeated
  executions before the full frontend suite also passed;
- source-of-truth, workflow-v2, workpack, automation, OMO bookkeeping, closeout
  sync, workflow-doc tests, dependency audit, and `git diff --check` passed.

Fresh independent code and security reviews each reported
`P0/P1/P2 = 0/0/0` for this delta. The independent verifier confirmed that the
evidence supports a regression-delta PR only and must not be represented as
Stage 2 completion.

## Still pending

- actual merged-exact-SHA hybrid verifier execution with the real local
  application DB URL and real sanitized remote Auth control-plane evidence;
- actual local Storage authority evidence composed with the snapshot verifier;
- current/immediate-previous deployed release smoke and one full compatibility
  release of old-shape/direct-only write 0 plus backfill/pair mismatch 0;
- approved contract/null XOR and rollback-floor activation after that release
  gate;
- Train B integration with #2, whose implementation has not started;
- successor-owned event, meal-log, and non-image idempotency cleanup links.
- a full cleanup rehearsal against the actual local schema's `public.users`
  inbound FK inventory. Read-only inventory currently includes RESTRICT references
  from `food_product_nutrition_versions.created_by`,
  `food_products.owner_user_id`,
  `ingredient_conversion_assignments.reviewed_by`,
  `ingredient_nutrition_profiles.reviewed_by`,
  `measurement_source_evidence.reviewed_by`,
  `nutrition_profiles.created_by`, `nutrition_profiles.reviewed_by`,
  `nutrition_source_items.reviewed_by`, `nutrition_sources.reviewed_by`, and
  `piece_unit_weights.reviewed_by`. The isolated fixture does not substitute for
  proving those rows reach dependency zero under their real checks and FKs.

Production writes: 0. Staging writes: 0. Remote application writes: 0.

## Post-merge reconciliation

- PR #1233 exact head `d9468881b7ae77f5b9b333e6f2a82452eb9dd60e`
  completed 16 check runs: 15 success and one intended full-regression skip,
  with pending/fail/cancel 0.
- PR #1233 squash-merged as
  `4a7718ee6bac66fb39b5163742783ac2092e5b5c`.
- The clean `master == origin/master` dry-run passed at exact SHA
  `da054a96afb7c6108a7007bfafbf3d328ef47656` in read-only mode with
  production/staging/remote application writes all 0.
- PR #1251 exact head `75d09a37f6341772c77e27a12a59730b7ef7914e`
  completed 24 check runs: 14 success and 10 intended skips, with
  pending/fail/cancel 0 after independent code/security/verifier
  P0/P1/P2 `0/0/0`.
- PR #1251 squash-merged the historical merged-SHA source-gate hardening as
  `94ae1a2077d63974c73a506add7b6647bf69d6d0`.
- Both remote and hybrid clean `master == origin/master` dry-runs passed at
  exact SHA `94ae1a2077d63974c73a506add7b6647bf69d6d0` in read-only mode with
  production/staging/remote application writes all 0.
- PR #1252 advanced `origin/master` to
  `29115dee2830f657a594ab68a8a6a3efe107dec9`.
- From clean detached historical ancestor
  `94ae1a2077d63974c73a506add7b6647bf69d6d0`, both remote and hybrid
  historical dry-run passed in read-only mode with production/staging/remote
  application writes all 0.
- This reconciliation does not replace the still-pending full local/remote
  evidence listed above and does not close the workpack lifecycle.
