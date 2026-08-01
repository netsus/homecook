# Stage 4 existing-consumer revalidation — 2026-08-02

## Scope

- Task ID: `019fbebf-25ce-7840-a065-85b48d75ed77`
- Role: fresh Stage 4 `frontend-implementer`; Stage 5/6 approval was not performed.
- Base: exact `master == origin/master == 1fb6bf26fd0d8e0631e924e49c559d8adfcfb285` after fetch.
- Branch: `fix/recipe-snapshot-stage4-consumer-revalidation`
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

## Full-local reader access blocker

The behavior repair above closes the planner projection gap, but current full-local activation still lacks a proven read authority for all historical content consumers:

- `20260729170500_recipe_snapshot_authority_foundation.sql` revokes `recipe_content_snapshots` from `anon` and `authenticated` and grants table SELECT only to `service_role`.
- existing Meal/planner/shopping/cooking/leftover Routes read embedded `recipe_content_snapshots` through `createRouteHandlerClient()`;
- full-local `createRouteHandlerClient()` forwards the authenticated user token, while local mode deliberately disables compatibility service-role fallback.

Therefore a real activated full-local consumer smoke cannot be claimed from mocked Route tests. Closing this requires an approved backend read-authority repair, such as an owner-anchored RPC or exact RLS policy/grant. A new migration/schema or broad service-role fallback is forbidden in this Stage 4 task, so this item remains a blocker and the branch must stay Draft. No preserved local target was modified to work around it.

## Remaining gates

- fresh independent backend/security review of the full-local snapshot read-authority repair;
- fresh independent Stage 5/6 review after the blocker is resolved and current-head checks are green;
- merged-exact full-local verifier execution;
- provider live callback/link, Cloudflare, remote final backup, off-Mac restore twice, first local mutation/cutover, compatibility-release observation and full actual-DB cleanup rehearsal remain Manual Only/pending.

This evidence does not mark lifecycle, Stage 5/6, merged-exact, current-head CI or Manual Only items complete.
