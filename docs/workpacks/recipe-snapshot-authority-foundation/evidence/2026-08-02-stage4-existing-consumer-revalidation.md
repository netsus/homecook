# Stage 4 existing-consumer revalidation — 2026-08-02

## Scope

- Task ID: `019fbebf-25ce-7840-a065-85b48d75ed77`
- Role: fresh Stage 4 `frontend-implementer`; Stage 5/6 approval was not performed.
- Base: exact `master == origin/master == 1fb6bf26fd0d8e0631e924e49c559d8adfcfb285` after fetch.
- Branch: `fix/recipe-snapshot-stage4-consumer-revalidation`
- Dependency integration: merged PR #1268 master `f5bd4b1ab6ba1cc98d79985b4e08a8439a82bc48` into this branch without conflict, preserving both the planner TDD repair and the backend migration, manifest, inventory, tests, and evidence.
- Historical source: PR #1219 remains the original Stage 4 consumer evidence. This revalidation does not represent that historical work as new implementation and does not toggle its already-checked acceptance items.
- Production/staging/remote application writes: `0 / 0 / 0`.
- Preserved `127.0.0.1:54322` and Docker fixtures were not started, stopped, reset or modified.

## Baseline and gap

1. Locked baseline:
   - `pnpm exec vitest run tests/recipe-snapshot-consumers.test.tsx`
   - Result: `1 file / 4 tests passed`.
2. Historical dynamic consumer and Train B set:
   - Meal, shopping preview/detail, cooking, leftover, planner nutrition, Storage/outbox and effective-ingredient tests.
   - Result before the repair: `13 passed / 1 skipped` files, `130 passed / 15 skipped` tests.
3. Actual gap:
   - `GET /api/v1/planner` selected no `recipe_content_snapshot_id` relation and always projected mutable `recipes.title`.
   - The historical E2E used a pre-projected fixture response, so it proved UI rendering but did not exercise this Route mapping.

## TDD evidence

1. Pinned title RED:
   - focused planner test expected `계획 당시 된장찌개` but received mutable `수정된 된장찌개`.
2. Minimal GREEN:
   - planner now selects the content relation and uses the immutable title whenever a content pin exists.
3. Broken pin RED:
   - focused planner test expected fail-closed `500` but received mutable-fallback `200`.
4. Minimal GREEN and refactor:
   - a content-pinned planner Meal with a missing or blank immutable title returns the existing `500 INTERNAL_ERROR` path;
   - only content-null legacy planner Meals use mutable recipe title fallback;
   - no response field, status, error code, screen, layout, CTA or servings control was added.
5. Regression lock:
   - `tests/recipe-snapshot-consumers.test.tsx` now includes the actual planner Route and both dynamic scenarios.

## Verification

- Focused consumer, planner and Train B bundle:
  - `15 passed / 1 skipped` files;
  - `142 passed / 15 skipped` tests.
- Snapshot isolated PostgreSQL existing/fresh/replay:
  - `14 passed / 1 intended skip`, active inventory `19 passed / 16 skipped`;
  - replay `15 passed`, active inventory `19 passed / 16 skipped`.
- Exact Stage 4 Playwright grep:
  - desktop/mobile `2 passed`.
- `pnpm verify:frontend:pr`:
  - lint and typecheck passed;
  - product Vitest `202 passed / 9 skipped` files, `2,556 passed / 128 skipped` tests;
  - production build passed;
  - core smoke `59 passed / 10 skipped`;
  - core accessibility `8 passed / 1 skipped`;
  - core visual `12 passed`.
- Source-of-truth, workpack, automation-spec, workflow-v2, OMO bookkeeping, closeout-sync and branch validators passed.
- `pnpm audit --audit-level high`: high-or-higher findings `0`; one existing low advisory remains.
- `git diff --check`: passed.

## PR #1268 dependency-resolution revalidation

- Planner Route and locked consumer regression: `2 files / 12 tests passed` before and after integration.
- Consumer and Train B bundle: `13 passed / 2 skipped` files, `157 passed / 36 skipped` tests.
- Snapshot security and full-local inventory focus: `3 passed / 2 skipped` files, `26 passed / 57 skipped` tests.
- Isolated snapshot PostgreSQL:
  - fresh migration path `15 passed / 1 intended skip`;
  - fresh active inventory `25 passed / 16 intended skips`;
  - replay path `16 passed`;
  - replay active inventory `25 passed / 16 intended skips`.
- `pnpm verify:frontend:pr`:
  - lint, typecheck, production build passed;
  - product Vitest `202 passed / 9 skipped` files, `2,557 passed / 129 skipped` tests;
  - core smoke `59 passed / 10 skipped`;
  - core accessibility `8 passed / 1 skipped`;
  - core visual `12 passed` with no baseline or UI change retained.
- The standalone security-function validator was not rerun after it revealed its default target is the preserved `127.0.0.1:54322`; the connection was refused immediately, and no server, Docker, schema, or data state was started, stopped, or modified. The merged manifest and policy inventory were instead covered by the static/mutation tests and isolated snapshot PostgreSQL runner above.

## Merged read authority and remaining live proof

PR #1268 resolves the missing database authority in merged master:

- `20260802120000_recipe_snapshot_consumer_read_authority.sql` grants authenticated SELECT on both content and nutrition snapshot tables;
- exact owner-aware RLS allows only `owner_user_id IS NULL OR auth.uid() = owner_user_id`;
- authenticated DML remains revoked and no service-role fallback or `SECURITY DEFINER` bypass was introduced;
- the migration, full-local security inventory, authorization manifest, mutation tests, and backend repair evidence are all retained from merged PR #1268.

The dependency blocker is therefore cleared. A real activated full-local Route smoke is still not claimed: the preserved `127.0.0.1:54322` target was not started or modified, and merged-exact/full-local activation evidence remains pending. This branch stays Draft and does not advance Stage 5/6 or lifecycle state.

## Remaining gates

- activated authenticated full-local consumer Route smoke against an explicitly authorized fixture;
- fresh independent lightweight Stage 5 design/no-drift review and exact-head Stage 6 review;
- merged-exact full-local verifier execution;
- provider live callback/link, Cloudflare, remote final backup, off-Mac restore twice, first local mutation/cutover, compatibility-release observation and full actual-DB cleanup rehearsal remain Manual Only/pending.

This evidence does not mark lifecycle, Stage 5/6, merged-exact, current-head CI or Manual Only items complete.
