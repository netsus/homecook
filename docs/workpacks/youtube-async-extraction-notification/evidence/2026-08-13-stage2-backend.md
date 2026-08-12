# youtube-async-extraction-notification Stage 2 backend evidence

## Scope and authority

- baseline: `origin/master@6f6043d91a3cfdcc7da10a4f28f59676990a9d80`
- branch: `feature/be-youtube-async-extraction-notification`
- original implementation commits: `267356fe`, `0139e987`, `eee52d6e`, `9aaa690c`, `a751209f`, `95c2b370`
- first Stage 3 reviewed head: `95c2b370` — `REVISE`
- second Stage 3 re-reviewed head: `3af52ff5` — `REVISE` (`P1` 5, `P2` 3)
- second-revision RED commits: `d5f04962`, `4b264f1c`, `9c17affd`, `2edb82b4`, `b9edf7cb`, `afd74382`, `8b241750`
- second-revision GREEN commits: `d45f32c0`, `f7c48364`, `147ae6e7`, `7bf11d88`
- replacement implementation head: `7bf11d88`; independent Stage 3 re-review is pending
- official tuple: requirements `1.7.31`, screen `1.5.35`, Flow `1.3.33`, DB `1.3.33`, API `1.2.38`
- migration: `supabase/migrations/20260812160000_youtube_async_extraction_notification.sql`
- production/staging/remote writes: `0`
- production migration/policy enable/credential issuance/launchd activation: `0` (`Manual Only`)
- existing app service on port `3100`: untouched

This task implements and verifies Stage 2. It does not perform Stage 3 approval, Ready transition, merge, or production activation.

## TDD evidence

The first Stage 2 commit is the RED characterization commit `267356fe`. Missing async modules and migration surfaces caused the new contract tests to fail before implementation. Subsequent implementation commits made the same tests green.

Additional RED→GREEN findings fixed during integration:

- user active/daily budgets were initially absent; the real PostgreSQL test failed, then the enqueue transaction enforced the approved initial `active=2`, rolling 24-hour `daily=10` limits under a per-owner advisory lock.
- relative release paths and non-dry-run credential bootstrap initially succeeded; tests now require absolute paths and reject all non-dry-run credential actions.
- raw source text initially persisted through finalize; the integration test now proves it remains null and provider payload keys are absent.
- list pagination initially fetched only the first 51 rows before applying a cursor; the cursor tuple is now applied inside the restricted DB projection RPC.
- generic runtime failures initially collapsed retry classification; the worker now persists only allowlisted stable codes, retries only transient codes, and maps exhaustion to `ATTEMPTS_EXHAUSTED`.
- PostgreSQL serialized `SET search_path = ''` as an escaped empty string that the security inventory parser initially misclassified; a RED parser test now locks the catalog-only interpretation.
- function owner membership was initially revoked before the final ACL statements, leaving default execute grants in place on a clean Supabase migration run; the migration now applies ACL/schema revokes first and removes temporary owner membership last.
- an options-only policy rotation could leak state between the PostgreSQL and PostgREST test files; every integration test now restores the canonical policy snapshot, and previous-key dual-read/current-write plus stale-app/old-worker fail-closed behavior is covered explicitly.
- first-head CI `quality` failed because the three new mutation routes and worker RPC adapter were absent from the fail-closed account-session-generation inventory; the route/source classifications and generated account/hybrid inventories were updated, and the exact failing tests plus the full Vitest suite passed locally before the replacement head.
- replacement-head CI then reproduced a clean PostgreSQL 17 ownership-transfer failure for the new private fence helper. A migration-contract RED now requires the transaction-scoped `private.CREATE` grant/revoke pair; the migration also uses PostgreSQL 16+ grantor-specific, non-inheriting temporary `SET` membership. Clean Supabase reset proves the helper has the exact worker RPC owner while both `private.CREATE` and runner `SET ROLE` remain false after commit.
- the next fresh security-function inventory exposed that a non-superuser runner could not revoke default function ACLs after transferring ownership. A second RED requires owner-scoped ACL application; every enqueue/worker/credential ACL group now runs under transaction-local `SET ROLE` and immediately resets. Clean catalog evidence has the private helper `anon/authenticated/service_role=false` and no persistent owner capability.

The independent Stage 3 review of `95c2b370` returned ten required findings. New characterization tests first reproduced all ten: the non-dry runner, unused worker-data fences, disconnected release readiness, incomplete HMAC pairs, delivered/seen key mismatch, loose JWT lifetime, service-role read bypass, permit contention, cursor lifetime, and `music.youtube.com` incompatibility. A separate Quick Import RED then proved that raw `{identity,recipe,meta}` i031 output was being stored instead of the existing 14-key draft. The same tests are green at the revision code head.

An internal review after GREEN found one additional release-path defect: launchd could verify one manifest but execute a runner below a different `--root-dir`. A RED installer test reproduced it; the plist root is now derived from the manifest directory and any explicit mismatch fails closed. This internal review is implementation assistance only and is not the independent Stage 3 approval.

The independent second re-review of `3af52ff5` returned eight more findings. Characterization tests reproduced missing exact i031 startup preflight, disconnected worker cache/quota/event/method persistence, collapsed subprocess errors, incomplete live release attestation, previous-HMAC expiry loss, credential cutoff claim leakage, recipe-title substitution, and the snapshot-authority regex flake. The replacement runs the immutable artifact through a real non-dry claim/extract/persist/finalize subprocess, bridges allowlisted fenced child RPCs, preserves bounded stable provider failures, snapshots only sanitized provider video titles, and checks the credential both before polling and immediately before claim.

Two internal read-only reviews then found three additional fail-closed gaps. RED tests proved that cache-hit events could consume quota, cold no-cache LLM/visual events could be mislabeled as hits, and a forbidden principal could inherit a restricted worker owner role without changing readiness. The GREEN implementation excludes cache hits from paid quota, records cold execution with `cache_hit=false`, and fingerprints every membership edge touching `youtube_extraction*` authority. Clean PG17 and the portable PostgreSQL runner now produce the same catalog fingerprint. These internal reviews do not replace independent Stage 3 approval.

## Implemented surfaces

Public Next endpoints:

1. `POST /api/v1/recipes/youtube/extraction-jobs`
2. `GET /api/v1/recipes/youtube/extraction-jobs/{job_id}`
3. `GET /api/v1/recipes/youtube/extractions/{extraction_id}`
4. `GET /api/v1/users/me/youtube-extraction-jobs`
5. `POST /api/v1/users/me/youtube-extraction-jobs/delivered`
6. `POST /api/v1/users/me/youtube-extraction-jobs/seen`
7. existing `POST /api/v1/recipes/youtube/extract` routed through `sync_wait` only when the server flag is enabled; default remains off.

Database/release surfaces:

- additive jobs, global permit, current policy, worker credential tables and `youtube_extraction_sessions.source_job_id`
- disabled i031-only bootstrap policy and canonical snapshot digest
- exact enqueue/read/queue/permit/cache/event/quota/method/title/finalize/delivery/credential RPC inventory
- refreshed user-session owner reads plus restricted worker/manager roles, memberships, forced RLS, ACL and exact issuer/audience/lifetime pre-request fencing
- materialized read-only worker artifact with full file hashes, runnable non-dry poll/heartbeat/i031/SIGTERM path, and deterministic expected-schema/app/worker attestation
- macOS launchd installer, credential rotation, mandatory preflight, drain, rollback and health rehearsal; production install/activation remains Manual Only

## Verification evidence

Passed before Draft PR creation:

- `pnpm install --frozen-lockfile` — already up to date
- `BRANCH_NAME=feature/be-youtube-async-extraction-notification pnpm validate:workpack -- --slice youtube-async-extraction-notification` — pass
- second-revision focused migration/API/i031/runner/worker/installer suite — 6 files, 73 tests passed
- isolated real PostgreSQL + real PostgREST suite — 2 files, 34 tests passed, including forbidden role-membership and RPC-ACL drift
- migration static contract — 6 tests passed
- clean Supabase PostgreSQL 17.6 migration chain on isolated ports `55320`–`55326` — pass through migration and seed; `pg_graphql` absent; live catalog fingerprint `b3ad2b381c6d1a25fa40c30114d083371f66f3d5a82a828ea621bf8a8222fddf` equals the expected-schema manifest
- additive security-function contract — 31 YouTube functions classified and valid
- `pnpm typecheck` — pass
- targeted ESLint — pass
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend` at implementation-equivalent head `7bf11d88` — lint, typecheck, product tests (238 files passed / 12 skipped; 2734 passed / 175 skipped), production build and security Playwright (12 passed) all pass; the existing port `3100` service was untouched
- `pnpm local:reset:demo` at implementation-equivalent detached head `7bf11d88` on isolated `56320`–`56326` — migrations and `seed.sql` completed, but the unpinned current CLI stopped before step 2 because Realtime/REST/Storage health checks remained unhealthy/503; repeated with a shorter project id and got the same infrastructure timeout. The separately pinned clean PG17 chain above is green. Existing app port `3100` stayed untouched.

The isolated DB runner allocates dynamic PostgreSQL/PostgREST ports, uses an ephemeral credential and temporary database, and removes the container/database afterward. The earlier isolated Supabase reset rehearsal used only `homecook_yta_stage2_retry` on ports `65520`–`65526`; the final clean-migration regression used the default local Supabase development ports. Neither path bound, reused or stopped port `3100`, and neither stopped or mutated any `homecook-full-local-*` stack.

## Local reset and release-gate facts

- The original `supabase_db_homecook` volume contained PostgreSQL 15 data and could not be opened by the newly selected 17.6 image.
- Before the follow-up instruction to preserve user data arrived, `supabase stop --no-backup` had already been run against that default local development project. Its legacy local volume is no longer present. No production, staging or `homecook-full-local-*` volume was targeted.
- The earlier revision reran `pnpm local:reset:demo` after the legacy-volume collision was isolated. At current head, the same canonical command was rerun in a detached isolated worktree, applied every migration and seed, then failed only its container health gate twice. This current-head automation item is therefore recorded as red/environment-blocked, not green. It did not touch the `3100` app or production/full-local stack; `ACCOUNT_SESSION_STALE` remains informational rather than a PR blocker.
- `SECURITY_FUNCTION_DATABASE_URL=<isolated-PG17> pnpm verify:security-functions` is green: the clean catalog has 205 classified additive functions, and all 8 anonymous mutation probes (including `complete_cooking_session`) return the expected denial with unchanged checksums. This confirms the old `graphql.get_schema_version()` inventory drift and signal-11 failure were local CLI/image `17.6.1.106` defects; the isolated current image has `pg_graphql` absent and no backend crash.
- `pnpm verify:security-functions:release` still stops before its linked-remote read-only half because this worktree has no `supabase/.temp/project-ref`/`SECURITY_FUNCTION_LINKED_ROOT`. No approved waiver exists, so the release gate remains a merge blocker even though its local half is now green.
- `pnpm local:reset:demo` remains a second merge-process blocker at current head because the current unpinned CLI health check times out after a successful migration/seed. No waiver was authored.
- No secret value, raw JWT, service-role key or credential was copied into this evidence.

## Pending independent gates

- Stage 3 independent backend/release re-review on the exact replacement PR head; the old reviewed head `95c2b370` remains `REVISE`
- current-head CI completion and any Stage 3 requested fixes
- approved independent disposition or root fix for the pre-existing security release-gate inventory/backend crash; this Stage 2 task does not self-author a waiver
- all Stage 4 frontend, Playwright, exploratory QA and design authority work
- Stage 6 closeout/merge approval
- every production/staging/remote action listed under `Manual Only`
