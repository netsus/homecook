# Backend consumer read-authority repair — 2026-08-02

## Scope

- Task ID: `019fbed5-1c13-7f91-86ed-bbcacfa72ded`
- Role: fresh backend read-authority repair implementer. This task did not perform independent Stage 3/security approval, Ready transition, merge, Stage 5/6 or Discord notification.
- Base: exact `master == origin/master == 1fb6bf26fd0d8e0631e924e49c559d8adfcfb285` after fetch.
- Branch: `fix/recipe-snapshot-consumer-read-authority`.
- Stage 4 Draft PR #1267 and its planner Route changes were not modified.
- Production/staging/remote application writes: `0 / 0 / 0`.
- Preserved `127.0.0.1:54322` and other Docker/worktree fixtures were not started, stopped, reset or modified.

## Consumer and permission audit

The authenticated `createRouteHandlerClient()` path reads immutable content from Meal, planner nutrition, shopping preview/create/detail, snapshot-v2 cook mode and leftover projections. Planner nutrition then batches the exact pinned `recipe_nutrition_snapshots` rows. Full-local mode forwards the user session through the guarded Data client and intentionally has no user-path service-role fallback.

The existing migrations left `recipe_content_snapshots` and `recipe_nutrition_snapshots` readable only by `service_role`. The repair adds no Route, RPC, SECURITY DEFINER function, public field/status/error or dependency. It adds authenticated SELECT only, with the same policy on both tables:

```sql
owner_user_id is null or auth.uid() = owner_user_id
```

| Principal | Content | Nutrition | INSERT / UPDATE / DELETE / TRUNCATE |
| --- | --- | --- | --- |
| `anon` | denied | denied | denied |
| `authenticated` | owner-null shared + exact `auth.uid()` owner | owner-null shared + exact `auth.uid()` owner | denied |
| `service_role` | SELECT preserved | SELECT preserved | unchanged and not opened by this migration |

Both tables remain owned by `postgres`, RLS enabled, FORCE RLS false. The exact manifest and active inventory lock two table ACLs and twelve total policies, including policy name, command, role, permissiveness and boolean expression.

## TDD evidence

### RED

Before the migration, `pnpm test:recipe-snapshot-authority:postgres` failed in both fresh and replay modes:

- fresh: `1 failed / 14 passed / 1 skipped`
- replay: `1 failed / 15 passed`
- exact failure: authenticated User A received `permission denied for table recipe_content_snapshots` while reading the consumer snapshot pair.

### GREEN

After the migration and inventory repair:

- fresh snapshot schema: `15 passed / 1 intended skip`
- fresh active full-local security inventory: `25 passed / 16 skipped`
- replay snapshot schema: `16 passed`
- replay active full-local security inventory: `25 passed / 16 skipped`
- User A read the owner-null shared pair and its private pair.
- User A observed User B private content and nutrition as `0 / 0` rows.
- authenticated cross-owner UPDATE/DELETE failed and both User B rows remained present.
- anon content/nutrition SELECT failed.
- authenticated INSERT/UPDATE/DELETE privileges remained false for both tables.

The active mutation matrix rejects authenticated snapshot write grants, anon snapshot SELECT, missing authenticated nutrition SELECT, snapshot FORCE RLS, snapshot owner drift and a broad `USING (true)` policy. Existing function ACL/grant-option, role attribute/membership, policy literal/tree and Train B mutations remain locked.

## Verification

- Focused snapshot/consumer/full-local/Train B bundle: `26 files / 238 tests passed`.
- Standalone full-local Auth/DB foundation: `16 passed / 25 active snapshot cases intentionally skipped`; the isolated snapshot runner owns and passed those active cases in fresh and replay modes.
- Security function manifest `--contract-only`: passed; 13 full-local and 16 snapshot functions remain classified.
- `pnpm verify:backend`: lint and typecheck passed; product Vitest `202 passed / 9 skipped` files, `2,555 passed / 129 skipped` tests; production build passed; Playwright security smoke `12/12` passed.
- `pnpm audit --audit-level high`: high-or-higher findings `0`; one existing low advisory remains.
- source-of-truth, workpack, automation-spec, workflow-v2, OMO bookkeeping, closeout-sync and branch validators plus `git diff --check`: passed before commit.

## Remaining gates

- PR head `a90323a54452bfbc1c14d48b7aef45c175e567bd`는 초기 PR 본문의 workflow-v2 work item `N/A` 형식 오류로 `template-check`가 한 번 실패했고, 본문 correction 후 동일 head 재실행은 통과했다. 엄격한 current-head 규칙상 이 old head는 superseded이며 최종 merge evidence로 사용하지 않는다.
- Fresh independent backend/code/security/DB review of this exact PR head.
- Draft PR current-head checks; Ready and merge remain coordinator/reviewer-owned.
- Stage 4 PR #1267 must integrate the merged backend repair and rerun a real activated full-local Route smoke for Meal/planner/shopping/cooking/leftover consumers.
- The preserved target at `127.0.0.1:54322` was unavailable/not used; target-DB coverage here is the repository-owned isolated fresh/replay and full-local PostgreSQL runners.
- Merged-exact verifier execution, provider live callback/link, Cloudflare, remote final backup, off-Mac restore twice, first local mutation/cutover, compatibility-release observation and full actual-DB cleanup rehearsal remain Manual Only/pending.

This evidence does not approve the implementation or mark Stage 3/5/6, Ready, merge, merged-exact or Manual Only items complete.
