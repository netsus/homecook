# Stage 2 full-local verifier implementation evidence — 2026-08-01

## Scope

- Task ID: `019fbdac-befa-7a82-9ad3-85378f30bd16`
- Role: Stage 2 `backend-implementer`; no independent Stage 3 approval was performed.
- Base: `b46ec9571538fefce48d13f57c9765daba1e2b06`
- Branch: `fix/recipe-snapshot-stage2-full-local-verifier`
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
- independent Stage 3 code/security/DB review and current-head CI.

The implementation keeps all acceptance and lifecycle completion items unchecked until those exact evidence gates are satisfied.
