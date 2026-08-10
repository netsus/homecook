# meal-log-core Stage 3 ML3-FINAL-006 HOLD repair evidence

## Identity and exact input

- repair date: `2026-08-10`
- role: fresh backend repair author after Stage 3 HOLD; not an independent reviewer or approver
- repair task ID: `019fea97-fde1-7870-9ce7-1d8a372db7f5`
- predecessor reviewer task ID: `019fea7d-f2e4-79f2-b7e2-13d6ce4324e9`
- pull request: `#1319`, `master` <- `feature/be-meal-log-core`
- predecessor/report successor head: `08314cb3e44792128b3c7f7b662dfc10604fd027`
- predecessor tree: `3b227a4956c72257baa6c31ceeddc8365a2ccaaa`
- PR base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- HOLD report: `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-backend-five-finding-rereview.md`
- local repair branch: `fix/meal-log-core-ml3-final-006`

Preflight confirmed the remote feature head/tree and PR tuple exactly. PR #1319 was `OPEN`, Ready, `CLEAN`, and `MERGEABLE`, then was returned to Draft before repair as required by the HOLD flow. `origin/master` had independently advanced by one commit to `d9fb1311878e6e884d37daf5374b7d9eed5b7f46`; that unrelated commit was not reset, rebased, merged, or otherwise integrated. The PR base remains `b2bfd818dc26f2f2539d3f88128b16759b91656d`.

Stage 2 remains unmerged and unapplied, so the existing `20260810120000_meal_log_core.sql` is still the governing migration repair surface. No new migration was added. No remote migration apply, production/staging/server-Mac/OAuth/capability/activation action, merge, self-approval, Discord, or Claude surface was used.

## TDD RED evidence

The real PostgreSQL regressions were written before the resolver implementation changed. After a fresh local database reset and correction of test-only fixture authority setup, the canonical RED was:

- `tests/meal-log-core-postgres.integration.test.ts`: `1 file`, `17 tests`, `2 failed / 15 passed`.
- product same-source amount PATCH after normal supersession failed with `RESOURCE_NOT_FOUND`.
- ingredient same-source amount PATCH after normal supersession failed with `RESOURCE_NOT_FOUND`.
- revoked historical-profile fail-closed controls already passed, proving the RED was limited to valid superseded pins.

Assertions were not weakened to obtain GREEN.

## ML3-FINAL-006 closure

The private nutrition resolvers now receive an explicit `p_allow_superseded` context. Only the same-source PATCH path passes `true`, derived from the already established `v_same_source` decision. That path may read an immutable pinned profile only when it is inactive with `review_status='superseded'`. Current active `approved`/`self_reported` behavior is unchanged, and revoked, rejected, pending, or otherwise invalid historical profiles still fail closed with `RESOURCE_NOT_FOUND`.

First-time create and source-changing PATCH continue through official current/approved exact authority because they pass `false`. The repair does not silently repin a same-source entry to a newer profile. It does not globally weaken immutable/current validators or add a public endpoint, field, status, or error code.

Real PostgreSQL evidence proves both product and ingredient behavior:

- same-source amount PATCH keeps the original product version or ingredient profile ID;
- nutrition is recalculated from that pinned immutable version after normal supersession/inactivation;
- revision advances from `1` to `2`;
- same-key replay returns the same response and stores exactly one idempotency receipt;
- new create and source-changing PATCH select the replacement current approved version/profile;
- revoked historical pins return `RESOURCE_NOT_FOUND`, leave entry state unchanged, create zero matching receipts, and roll back the attempted profile-state mutation;
- prior owner/RLS, exact-one relation/evidence, conversion-class, pointer, rollback, revision, idempotency, and cooked-batch #8 integrity suites remain GREEN.

The two changed private function signatures remain service-internal, have all application-role execution revoked, and are synchronized in the security-function authorization manifest.

## GREEN verification

- `pnpm install --frozen-lockfile`: PASS; dependency manifests unchanged.
- fresh `pnpm exec supabase db reset --local`: PASS through `20260810120000_meal_log_core.sql`.
- fresh `pnpm test:meal-log-core:postgres`: PASS — `1 file / 17 tests`.
- focused meal-log Vitest: PASS — `4 files / 21 tests`.
- current-vs-future validators: PASS — `4 files / 36 tests`.
- authority evidence validator: PASS — `1 file / 29 tests`.
- security-function contract-only: PASS — meal-log `11` functions classified.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 pnpm verify:backend`: PASS.
  - lint and typecheck: PASS.
  - product tests: `2,716 passed / 167 intended skipped`; the three added real-PostgreSQL tests are intentionally skipped outside the PostgreSQL runner.
  - production build: PASS — `81/81` static pages generated and meal-log routes present.
  - security E2E: `12/12` passed.
- source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, Draft closeout-sync, branch, commit-message, and diff-policy validators: PASS.
- `pnpm audit --audit-level high`: PASS at the requested threshold; existing inventory is `1 low / 1 moderate / 0 high / 0 critical`, with no dependency change in this repair.
- `pnpm harness:audit`: command PASS, score `4.3/5`, repository-wide promotion readiness `not-ready` due pre-existing unrelated `H-CI-001` and `H-OMO-001`; backend harness and review/closeout score `5/5` with no scoped finding.

Port `3100` was owned by concurrent frontend task `019fea98-3ba5-7f71-a5d5-4117c748a62c` in another worktree and was not stopped. The repository-supported `PLAYWRIGHT_BASE_URL` isolated the backend security run on port `3111`.

## Changed files

- `supabase/migrations/20260810120000_meal_log_core.sql`
- `tests/meal-log-core-postgres.integration.test.ts`
- `docs/security/meal-log-core-security-function-authorization-manifest.json`
- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-final-006-hold-repair.md`

The final successor head/tree and current-head GitHub check inventory are recorded in the PR body because a commit cannot embed its own hash.

## Review and lifecycle boundary

This author reports only `ML3-FINAL-006` code/test closure and does not approve Stage 3. A different fresh Codex task must review the exact delivered successor head/tree and publish the Stage 3 verdict.

The four Manual external smokes, merged-exact-SHA server-production/local-rehearsal evidence, server-Mac/OAuth, capability, R/R+1/R+2, activation, merge, and post-merge evidence remain pending and unclaimed.
