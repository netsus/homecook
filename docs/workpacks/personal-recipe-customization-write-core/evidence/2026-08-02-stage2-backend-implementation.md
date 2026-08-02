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

## Implemented dormant authority

- One service-role-only `write_personal_recipe_core` RPC owns capability, account generation, exact session binding, common lock order, resource validation, idempotency and all content effects in one transaction.
- `homecook.personal_recipe_v2` remains unset/off by default, no application caller sets it, and no PATCH/DELETE route was added.
- Create, immutable public fork, same-ID revision update, explicit save-as-new and owner-only idempotent soft delete are implemented without changing the legacy `POST /recipes` route.
- Server canonicalization strips client authority fields, resolves exact product/version provenance through one approved primary `represents` link, and stores immutable content with the exact ID returned by #4's validated nutrition snapshot writer. The #6 migration does not insert nutrition snapshot rows directly.
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

## Explicit pending gates

- Independent Stage 3 code/security/DB approval is pending and must use another Codex task ID.
- Draft PR current-head checks and the final evidence-projection head remain part of the Stage 2 handoff; the PR must stay Draft and must not be merged by this task.
- Workpack E2E named `personal-recipe-customization-write-core` does not currently exist; no empty grep is claimed as green.
- Local full Supabase/browser, merged-exact server-production/local-rehearsal read-only verifier, Manual Only evidence, #7 integration and #8 R/R+1→R+2 activation remain pending.
- Contract Evolution Candidate: none.
