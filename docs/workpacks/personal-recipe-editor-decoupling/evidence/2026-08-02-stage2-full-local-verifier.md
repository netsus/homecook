# Stage 2 full-local verifier implementation evidence — 2026-08-02

## Scope

- Task ID: `019fbfc4-e794-77e0-88b7-d76a74e438f3`
- Role: fresh Stage 2 implementer. This task does not perform or claim Stage 3 code/security approval, Ready transition, merge, Stage Discord notification or Stage 6 closeout.
- Exact base: `b33a7df67ed6484c9183834f15a511dffe9d70cb`
- Branch: `fix/personal-recipe-editor-stage2-full-local-verifier`
- Draft PR: [#1271](https://github.com/netsus/homecook/pull/1271). It remains Draft; Stage 3 approval, Ready and merge are not claimed.
- Production/staging/remote application writes: `0 / 0 / 0`
- Product API, field, status, error, migration, schema, UI and dependency changes: none.
- Stage 3 reviewed implementation head: `b96d83e55c276e7125e28b09b4999bccfbfb1a7a`.
- First Stage 3 repair implementation commits: `1d94a0c5` (RED), `2e852e70` (shared runner/Git env), `af7d709b` (observed authority/AST/PG).
- Fresh re-review input head `f8b0199fe40ce72370d743f61881c4d606a285ad` received new required findings. The second repair commits are `59ee0d66` (RED) and `42be7a34` (opaque output, fixed Git config, AST dataflow, non-empty Auth, exact Storage and observed execution boundary). Fresh independent re-review of the final pushed PR head remains pending.

## TDD evidence

1. Actual RED before implementation:
   - command: `pnpm exec vitest run tests/personal-recipe-editor-full-local-verifier.test.ts`
   - result: `1 failed suite / 0 tests`; `scripts/lib/personal-recipe-editor-full-local-verifier.mjs` did not exist.
   - retained commit: `adf29fce` contains only the locked test and records the missing-module RED.
2. Minimal GREEN:
   - same focused command after adding the verifier module and CLI.
   - result: `1 file / 8 tests passed`.
3. Source/environment bypass coverage:
   - added remote/hybrid authority, unmerged/dirty/untracked/grafted source and historical hybrid evidence rejection.
   - focused personal-editor, permission, contract and reused #4 full-local verifier bundle: `4 files / 32 tests passed`.

## Stage 3 finding repair — RED → GREEN

- Independent code review task `019fbfe0-1dcb-7cf1-82fd-077592725bbc` found the stale full-test count and duplicated #4/#5 CLI execution framework.
- Independent security review task `019fbfe0-1dcb-7cf1-82fd-075086010a34` found the permissive Git subprocess environment, unobserved Auth restore/transient and Storage state, incomplete browser mutation/service-role inventory, and hardcoded ready/zero boundary summary.
- Actual repair RED command:
  `pnpm exec vitest run tests/full-local-verification-cli-runner.test.ts tests/recipe-snapshot-authority-remote-verifier.test.ts tests/hybrid-supabase-static-gate.test.ts tests/personal-recipe-editor-full-local-verifier.test.ts`
  returned `4 failed files / 10 failed / 20 passed` at commit `1d94a0c5`.
- The REDs separately locked two executable CLI regressions, strict Git env exclusion, two AST false-positive/false-negative fixtures, restore-pending plan state, exact local result/source shapes, dynamic boundary checks and evidence-derived summary status.
- The same command after repair returned `4 files / 30 tests passed`; the final permission/contract/#4/#5 bundle returned `7 files / 53 tests passed`.
- The shared runner now owns source fetch/rev-parse/no-replace ancestry, untracked-inclusive cleanliness, required checks, psql JSON, sanitized errors/output and exit status. #4 and #5 provide only plan/assertion/evidence hooks.
- Git fetch/rev-parse inherits only `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`; proxy, Node injection and DB/Supabase credential variables are excluded. The fresh repair additionally supplies fixed internal Git global/system/SSH isolation constants described below.
- The existing TypeScript compiler API inventory now detects aliased/namespace browser client Data mutations, raw `/rest/v1` mutations, direct Storage, and aliased/namespace/conditional service-role calls while leaving unrelated `.from().insert()` and REST GET fixtures clean.
- Auth/Storage summary fields are computed from exact validated SQL/source evidence. Missing/extra fields, nonzero identity/transient/storage/registry drift, dynamic boundary mismatch and browser/service-role/remote-write findings fail closed.
- The production plan specifies relation/column classification evidence but not an exact verifier manifest input shape. No shape, table or migration was invented: `stable_remote_uuid_restore_status=pending-manual-restore-manifest`, local transient rows are observed as zero, and restore manifest evidence remains pending.

### Fresh re-review repair — RED → GREEN

- Fresh code re-review task `019fc011-93a2-77f0-b5b7-600f39750e70` found secret-bearing malformed psql output, query-builder alias, Git global/system/SSH configuration and stale evidence-count gaps.
- Fresh security re-review task `019fc011-949c-7512-8d55-c60f7e2d0291` found empty Auth acceptance, broad Storage policy/PUBLIC grant gaps, AST concat/factory alias false negatives and constant remote-write self-evidence.
- Actual RED at `59ee0d66`: the four-file command above returned `4 failed files / 9 failed / 23 passed`.
- Actual GREEN at `42be7a34`: the same four files returned `4 files / 32 tests passed`; the permission/contract/#4/#5 regression bundle returned `7 files / 55 tests passed`.
- Invalid database JSON is converted to the fixed opaque error `database verifier returned invalid JSON`; captured stdout and raw identity/secret payloads are never included.
- Git subprocesses retain only safe process basics and set `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` and the internal constant `GIT_SSH_COMMAND=ssh -F /dev/null`. A malicious temporary HOME fixture cannot apply its global credential helper, URL rewrite or SSH config, while a trusted checkout-local fetch fixture still succeeds.
- The TypeScript compiler API inventory resolves query-builder aliases, static string concatenation and imported service-role factory aliases, while unrelated local builders/factories and read-only REST fetches remain clean.
- Auth readiness now requires non-empty `public.users` and `auth.users`, exact UUID-set count equality, non-empty `auth.identities`, identity mismatch `0`, and transient session/refresh/flow-state rows `0`. The undefined restore-manifest shape remains pending/manual rather than being promoted to a release contract.
- Storage readiness now compares the existing four official `storage.objects` policy names/commands/roles and owner/generation guard expressions exactly, rejects unexpected/broad policies and rejects PUBLIC/anon/authenticated mutation grants. It observes the existing private bucket, RLS, image registry and generation-aware object state without adding a schema or migration.
- Remote application write status is no longer accepted from a SQL/result constant. The shared runner derives exact execution observation from a credential-free HTTPS Git read, loopback PostgreSQL target, `READ ONLY` transaction, sanitized local required checks and absence of any remote application-write target. Dry-run reports `not-observed-dry-run` and cannot claim numeric zero.

## Reused authority and fail-closed boundary

- `scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs` remains the SQL, loopback request, stable UUID, local session binding, `auth.uid()` RLS and exact result authority.
- `scripts/lib/full-local-security-inventory.mjs` remains the function/role/membership/RLS/policy authority. #5 adds no parallel SQL or security inventory framework.
- The #5 layer composes exact capability-off/source evidence, existing permission/contract checks, and read-only observations of existing `auth.*`, `storage.*` and `public.recipe_image_objects` relations. It adds no schema or migration.
- Historical `local auth.users=0`, remote identity epoch and mirror-HMAC evidence are rejected as active success evidence.
- Only a credentialed loopback PostgreSQL URL with no query/hash is accepted. Inherited PostgreSQL routing variables are stripped and the verifier SQL runs inside one read-only transaction.
- The exact execution shape fails closed on missing/extra checks, count or drift changes, other-owner/deleted/quarantined non-disclosure failure, public-boundary drift, browser direct Data/Storage mutation, service-role user fallback and any remote application write.
- Output is aggregate-only. Passwords, raw identity/provider payloads, sessions, refresh tokens, email and UUID evidence are neither accepted nor printed.

## Local isolated evidence

- Initial Stage 2 required unit/security composition: `19 files / 135 tests passed`.
- Self-owned isolated full-local PostgreSQL authority: `16 passed / 28 snapshot-owned cases skipped`; the runner removed only its own disposable fixture.
- Snapshot existing/fresh/replay PostgreSQL runner:
  - existing snapshot: `15 passed / 1 intended skip`;
  - active full-local inventory: `25 passed / 16 snapshot-owned skips`;
  - replay snapshot: `16 passed`;
  - replay active full-local inventory: `25 passed / 16 snapshot-owned skips`.
- Static browser/service-role authority inventory: `node scripts/generate-hybrid-authority-inventories.mjs --check` passed.
- Security-function manifest classification: `node scripts/validate-security-function-authorization.mjs --contract-only` passed, including the full-local 13-function and snapshot 16-function manifests.
- Pre-merge CLI dry-run was executed with local authority controls and a sentinel loopback credential. It failed before DB access because the feature head is not merged into `origin/master`, printed no credential or raw payload, and returned only the clean merged-exact requirement. This is expected pre-merge fail-closed evidence, not a successful release result.

### Stage 3 repair isolated PostgreSQL evidence

- `pnpm test:recipe-snapshot-authority:postgres` passed in both fresh and replay modes:
  - fresh snapshot authority: `15 passed / 1 intended skip`;
  - replay snapshot authority: `16 passed / 0 skipped`;
  - fresh and replay active full-local inventory plus personal authority SQL: `28 passed / 16 snapshot-owned skips` in each mode.
- The disposable fixture uses synthetic `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.flow_state`, `storage.buckets` and `storage.objects` structures only inside its temporary database. It applies the existing image registry/private bucket migrations and adds no product relation.
- Fixture setup aligns non-empty self-owned `public.users`/`auth.users`/`auth.identities` and inserts one generation-aware private image object. The verifier itself then runs in a separate `READ ONLY` transaction and observes identity mapping mismatch `0`, transient Auth rows `0`, one exact private bucket, Storage RLS enabled, exact existing Storage policies, unexpected broad policies/grants `0`, registry ACL drift `0`, and object/registry/path mismatches `0`.
- PostgreSQL itself exposed three additional fail-closed REDs before GREEN: the inherited JSON result exceeded one `jsonb_build_object` argument ceiling, column-level `DELETE` privilege is invalid, and a snapshot deletion left an Auth/application UUID mismatch. The repair splits JSONB objects, checks `DELETE` only at table scope, and explicitly realigns only the disposable fixture before the read-only verification.

## Final local validation before Draft PR

- Five-axis implementer self-check found one important hardening gap: fixed required-check child processes inherited the full shell environment. The repair now forwards only `PATH`, locale, home/temp, CI/color and timezone keys; DB URLs, Supabase service keys, Git routing and PostgreSQL routing variables are excluded. This self-check is not Stage 3 approval.
- Final focused verifier/contract bundle after the environment repair: `5 files / 43 tests passed`.
- `pnpm verify:backend` passed:
  - product Vitest: `202 files passed / 9 skipped`, `2,557 tests passed / 129 skipped`;
  - Next.js production build passed;
  - auth/session security Playwright: `12/12 passed`.
- The retained `5,049` full-test claim was stale. The independently reviewed `b96d83e5` head and GitHub quality evidence were `5,050 passed / 283 skipped`.
- Fresh re-review repair full `pnpm test`: `491 files passed / 26 skipped`, `5,057 tests passed / 286 skipped`.
- The first pushed documentation head exposed one workflow projection regression in GitHub `quality`: `1 failed / 5,056 passed / 286 skipped`. Local focused reproduction was `1 failed / 9 passed`; commit `0c05655b` restored the immutable Stage 1 raw-check/full-test/final-verifier sentinels. The focused contract then passed `10/10`, and full `pnpm test` returned to `5,057 passed / 286 skipped`.
- `pnpm lint` and `pnpm typecheck`: passed with zero warning/error output after removing two test-only unused bindings.
- source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping and closeout-sync validators: passed.
- branch validator: passed for `fix/personal-recipe-editor-stage2-full-local-verifier`.
- default 20-commit validator reported two already-merged base-history subjects. Re-running with `BASE_REF=b33a7df67ed6484c9183834f15a511dffe9d70cb` passed all Stage 2 branch commits present at that point.
- `pnpm audit --audit-level high`: high-or-higher findings `0`; one existing low-severity advisory remains.
- `git diff --check`: passed before each commit boundary.
- Fresh repair validation passed `pnpm verify:backend` (`2,557 product tests`, production build, security E2E `12/12`), focused `32/32` and regression `55/55`, both isolated PostgreSQL runners, static hybrid/security authority gates, lint and typecheck. Source-of-truth, workflow-v2, workpack, automation, OMO bookkeeping, closeout-sync, branch and exact-base commit validators passed. `pnpm audit --audit-level high` found no high-or-higher finding and retained one pre-existing low advisory. No Stage 3 approval is inferred from implementer validation.

## Pending

- fresh independent Stage 3 exact-head code/security re-review of the repaired PR head; this implementer does not mark Stage 3 complete or approve its own changes;
- Stage 4 existing capability-off shell/consumer revalidation;
- Stage 5 lightweight no-visual-drift review;
- clean merged-exact Stage 6 verifier execution;
- activated provider callback/link, Cloudflare, final backup/restore, off-Mac restore, first local mutation/cutover and post-floor recovery (`Manual Only`);
- Vercel and another-Mac deployment/manual evidence are not used and remain pending.

The overall lifecycle remains `in_progress / not_started / pending / not_started`. External personal writes and #6/#7/#8 activation remain dark.
