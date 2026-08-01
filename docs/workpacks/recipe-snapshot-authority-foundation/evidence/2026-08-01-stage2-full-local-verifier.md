# Stage 2 full-local verifier implementation evidence — 2026-08-01

## Scope

- Task ID: `019fbdac-befa-7a82-9ad3-85378f30bd16`
- Role: Stage 2 `backend-implementer`; no independent Stage 3 approval was performed.
- Base: `b46ec9571538fefce48d13f57c9765daba1e2b06`
- Branch: `fix/recipe-snapshot-stage2-full-local-verifier`
- Draft PR: [#1265](https://github.com/netsus/homecook/pull/1265); exact current-head CI is recorded in the PR Merge Gate and does not constitute Stage 3 approval.
- Production/staging/remote application writes: `0 / 0 / 0`
- Schema migration, activation, cutover and restore: not performed.

## TDD evidence

1. Environment prerequisite attempt:
   - `pnpm exec vitest run tests/recipe-snapshot-authority-full-local-verifier.test.ts`
   - Result: command failed before test collection because the worktree had no installed `vitest` binary. This is not counted as the contract RED.
2. Focused contract RED after `pnpm install --frozen-lockfile`:
   - same command
   - Result: `1 failed suite`, `0 tests`; missing `scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs`.
3. Minimal GREEN:
   - same command
   - Result: `1 file`, `6 passed`.
4. Revoke signature regression RED/GREEN:
   - RED: `1 failed / 6`, because the planned signature did not match `public.revoke_full_local_session_authority(text,uuid,text,integer)`.
   - GREEN: `6 passed` after exact signature correction.
5. Current cleanup authority regression RED/GREEN:
   - RED: `1 failed / 8`, because the historical verifier still pinned the pre-Train-B cleanup function hash.
   - GREEN: `tests/recipe-snapshot-authority-full-local-verifier.test.ts` plus `tests/recipe-snapshot-authority-remote-verifier.test.ts` = `18 passed` after pinning the current PR #1256 cleanup source and exact dependency order.
6. Active local-authority regression RED/GREEN:
   - RED: `1 failed / 8`, because the active full-local plan still accepted `full_local_auth_control.authority='remote'`.
   - GREEN: `8 passed` after requiring an activated `local` control row, an HTTPS `/auth/v1` issuer and `local_activated_at`.
7. Local issuer NULL and SQL replacement regression RED/GREEN:
   - RED: `1 failed / 8`; a NULL issuer could evade PostgreSQL three-valued boolean drift detection, and JavaScript replacement-token expansion truncated the issuer regex terminator.
   - GREEN: the verifier rejects a NULL issuer and inserts the SQL through a replacement callback that preserves the exact `^https://[^/?#]+/auth/v1$` expression.

## Local automated evidence

- Snapshot/full-local/Train B focused unit and security set:
  - 15 files, 83 tests passed.
- Snapshot isolated PostgreSQL existing/fresh/replay runner:
  - first mode 14 passed, 1 intended skip;
  - second mode 15 passed.
- Full-local isolated PostgreSQL Auth/session/request-authority runner:
  - 6 passed.
- Contract-sync plus new verifier:
  - 2 files, 96 passed.
- Final focused foundation/inventory/consumer/verifier bundle:
  - 8 files, 128 passed.
- `pnpm verify:backend`:
  - product Vitest 202 files passed, 9 skipped; 2,543 tests passed, 128 skipped;
  - Next.js production build passed;
  - Playwright auth/session security smoke 12 passed.
- `pnpm lint`, `pnpm typecheck`, source/workpack/automation/workflow/OMO/closeout/branch validators and `git diff --check`: passed after synchronizing the Stage 2 status projection.
- `pnpm audit --audit-level high`: high-or-higher findings 0; one existing low-severity advisory reported.
- Docker daemon was unavailable. No container, volume or another worktree fixture was stopped, removed or modified. The two repository-owned isolated PostgreSQL runners use unique temporary clusters and cleaned up only their own temporary directories.

## Fail-closed implementation boundary

- The CLI requires a clean exact 40-character HEAD that is an `origin/master` ancestor through `git --no-replace-objects merge-base --is-ancestor` and rejects legacy grafts plus tracked or untracked dirt.
- Only an explicit loopback PostgreSQL URL is accepted; inherited PostgreSQL routing variables are stripped and the inventory transaction is read-only.
- Snapshot schema/function/grant/telemetry and current local Auth control/session binding/stable UUID/RLS/request-authority/cleanup inventory are evaluated in one SQL statement against one local database.
- Required snapshot, PR #1263 full-local runtime, isolated PostgreSQL and Train B checks must all report `passed`. Missing, skipped or additional evidence fields fail closed.
- Output contains aggregate statuses only. Credentials, raw provider rows, session identifiers and user identifiers are not accepted evidence fields or emitted summary fields.

## Still pending / Manual Only

- clean merged-exact-SHA execution of the new verifier;
- provider live callback/link;
- Cloudflare public-edge verification;
- remote final backup;
- off-Mac restore twice;
- first local mutation/cutover;
- one full compatibility-release observation;
- full actual-DB cleanup rehearsal including exact local Auth identity delete, terminal readback and delete/recreate isolation;
- independent Stage 3 code/security/DB review.

The implementation keeps all acceptance and lifecycle completion items unchecked until those exact evidence gates are satisfied.

## Stage 3 REQUEST_CHANGES repair — 2026-08-02

- Review input: PR #1265 head `4bf8e8781f76b1306382ed0715ead585890cd93c`, verdict `REQUEST_CHANGES`, findings `P0/P1/P2 = 0/3/0`.
- Role boundary: the same Stage 2 implementer repaired the three findings. This evidence is not a Stage 3 approval, Ready decision, merge decision or lifecycle completion.

### Mutation RED and focused GREEN

1. Explicit application authority environment:
   - RED: `tests/recipe-snapshot-authority-full-local-verifier.test.ts` reported `1 failed / 8 passed`; the verifier exported no fail-closed environment assertion.
   - GREEN: `HOMECOOK_AUTH_AUTHORITY=local` and `HOMECOOK_DATA_AUTHORITY=local` are both required before dry-run or execution. Missing, remote, local-shadow, typo and mixed values are rejected without echoing the supplied value.
2. Exact target-DB security inventory:
   - RED: `pnpm test:full-local-auth-db-foundation:postgres` reported `6 failed / 6 passed`; the exact inventory builder/assertion did not exist.
   - GREEN: `12 passed`, including actual transactional mutations for allow-all function body, `anon` EXECUTE, SECURITY/search_path drift, required owner RLS removal plus dummy `auth.uid()` policy and an unexpected overload. Every mutation is rolled back inside its isolated PostgreSQL fixture.
3. Auth-only public exposure and Compose publication:
   - RED: `tests/full-local-production-runtime.test.ts` failed before collection because the proxy could not be imported as a pure request boundary (`Invalid URL`).
   - Additional RED during security diff review: `2 failed / 38 passed`; literal dot segments could be normalized from an Auth-prefixed path into REST or Storage.
   - GREEN: `40 passed`; the production handler now uses the tested pure request decision, rejects encoded/duplicate/dot-segment/direct-origin/private service paths across method/query/trailing-slash variants, and startup rejects equality/regex/Set/encoded-storage matcher mutations. Parsed Compose model mutations reject short-form published ports on PostgreSQL, PostgREST, Storage and Studio and require both gateway publications to bind loopback.

### Repair verification recorded before push

- Combined focused verifier/public-boundary suite: 2 files, 49 tests passed.
- Snapshot/full-local/Train B required set: 16 files, 110 tests passed.
- Snapshot isolated PostgreSQL existing/fresh/replay: first mode 14 passed with 1 intended skip; second mode 15 passed.
- Full-local isolated PostgreSQL: 12 tests passed.
- PR #1263 full-local runtime/app regression set: 10 files passed, 1 Docker smoke file skipped by its explicit opt-in gate; 133 tests passed, 1 skipped.
- Replace-ref/graft and read-only SQL regression: 10 tests passed.
- `pnpm lint` and `pnpm typecheck`: passed after the repair.
- `pnpm verify:backend`: product Vitest 202 files passed and 9 skipped, 2,544 tests passed and 128 skipped; Next.js production build passed; Playwright security smoke 12 passed.
- source-of-truth, workpack, automation-spec, workflow-v2, OMO bookkeeping, closeout sync and branch validators plus `git diff --check`: passed.
- `pnpm audit --audit-level high`: high-or-higher findings 0; the existing low-severity advisory remains 1.
- Production, staging and remote application writes remain `0 / 0 / 0`. No activation, cutover, provider callback, Cloudflare, backup, restore or actual production cleanup operation was run.

All Manual Only items above remain pending. The repaired current head still requires a fresh independent Stage 3 code/security/DB re-review and all current-head PR checks; this Stage 2 task does not approve or merge it.

## PR #1266 master integration — 2026-08-02

- Integrated `origin/master` exact SHA `af0b65ce33b8cc413f66cd30f2bfdcd98b6acdfb` with merge commit `cf1fe574` after PR #1266 advanced the restore/cutover runtime.
- Conflict resolution preserved both boundaries in `auth-only-proxy.mjs`: the repaired pure Auth-only request matcher plus PR #1266 dynamic internal gateway origin, trusted loopback Cloudflare client IP and no-store response headers.
- PR #1266 full-local production plan/acceptance, OAuth Compose, platform backup, restore/cutover, LaunchAgent and Storage-copy code/evidence were retained without reverting or marking additional Manual Only work complete.
- Post-integration focused restore/proxy/runtime suite: 7 files, 105 tests passed.
- Post-integration Stage 2 snapshot/full-local/Train B set: 16 files, 111 tests passed; remote verifier ancestry/read-only SQL 10 tests passed.
- Snapshot PostgreSQL existing/fresh/replay remained 14 passed with 1 intended skip, then 15 passed. Full-local PostgreSQL remained 12 passed.
- Post-integration `pnpm verify:backend`: product Vitest 202 files passed and 9 skipped, 2,544 tests passed and 128 skipped; build and 12 security E2E tests passed.
- Source/workpack/automation/workflow/OMO/closeout/branch validators, lint, typecheck, audit and diff check passed. `validate:commits` still reports the already-merged non-Conventional PR #1261 subject from base history; none of this repair's four Conventional+Lore commits is the reported violation.
- Worktree was clean and `origin/master` was an ancestor of the integrated branch. Production/staging/remote application writes remained `0 / 0 / 0`.

The integration does not change the independent fresh Stage 3 code/security/DB re-review requirement or any remaining Manual Only gate.
