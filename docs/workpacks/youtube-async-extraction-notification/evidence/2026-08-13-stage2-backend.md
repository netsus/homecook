# youtube-async-extraction-notification Stage 2 backend evidence

## Scope and authority

- baseline: `origin/master@6f6043d91a3cfdcc7da10a4f28f59676990a9d80`
- branch: `feature/be-youtube-async-extraction-notification`
- original implementation commits: `267356fe`, `0139e987`, `eee52d6e`, `9aaa690c`, `a751209f`, `95c2b370`
- Stage 3 reviewed head: `95c2b370` — `REVISE`
- revision RED commits: `918f1430`, `b817bcf9`
- revision GREEN commits: `789efe37`, `e62405e0`, `7f659d5d`
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

The independent Stage 3 review of `95c2b370` returned ten required findings. New characterization tests first reproduced all ten: the non-dry runner, unused worker-data fences, disconnected release readiness, incomplete HMAC pairs, delivered/seen key mismatch, loose JWT lifetime, service-role read bypass, permit contention, cursor lifetime, and `music.youtube.com` incompatibility. A separate Quick Import RED then proved that raw `{identity,recipe,meta}` i031 output was being stored instead of the existing 14-key draft. The same tests are green at the revision code head.

An internal review after GREEN found one additional release-path defect: launchd could verify one manifest but execute a runner below a different `--root-dir`. A RED installer test reproduced it; the plist root is now derived from the manifest directory and any explicit mismatch fails closed. This internal review is implementation assistance only and is not the independent Stage 3 approval.

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
- async unit/contract suite — 4 files, 48 tests passed
- Stage 3 focused API/worker/Quick Import compatibility suite — 4 files, 128 tests passed
- combined revised contract/API/worker/installer/migration suite — 8 files, 156 tests passed
- isolated real PostgreSQL + real PostgREST suite — 2 files, 29 tests passed
- migration static contract — 6 tests passed
- additive security-function contract — 31 YouTube functions classified and valid
- `pnpm typecheck` — pass
- targeted ESLint — pass
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3117 pnpm verify:backend` — lint, typecheck, product tests (238 files passed / 12 skipped; 2733 passed / 175 skipped), production build and security Playwright (12 passed) all pass after caching repeated migration reads in one flaky contract test
- `pnpm test` after CI inventory repair — 561 files passed / 31 skipped; 5879 passed / 420 skipped
- `pnpm local:reset:demo` on the default local PG17 stack — database recreation reached successfully without deleting or reusing the incompatible legacy PG15 data directory during this revision; existing app port `3100` stayed untouched

The isolated DB runner allocates dynamic PostgreSQL/PostgREST ports, uses an ephemeral credential and temporary database, and removes the container/database afterward. The Supabase reset rehearsal used only `homecook_yta_stage2_retry` on ports `65520`–`65526`. It did not bind, reuse or stop port `3100`, and it did not stop or mutate any `homecook-full-local-*` stack.

## Local reset and release-gate facts

- The original `supabase_db_homecook` volume contained PostgreSQL 15 data and could not be opened by the newly selected 17.6 image.
- Before the follow-up instruction to preserve user data arrived, `supabase stop --no-backup` had already been run against that default local development project. Its legacy local volume is no longer present. No production, staging or `homecook-full-local-*` volume was targeted.
- The revision reran `pnpm local:reset:demo` after the legacy-volume collision had been isolated. It did not delete any additional data and did not touch the `3100` app or production/full-local stack. Database recreation completed; `ACCOUNT_SESSION_STALE` remains informational rather than a PR blocker.
- `verify:security-functions:release` validates the 31 new additive YouTube functions, then stops in the pre-existing local provider inventory. The current first mismatch is `net.http_get(text,jsonb,jsonb,integer)`; earlier clean-PG17 evidence also records `graphql.get_schema_version()` drift. No approved waiver exists.
- the existing broad PostgreSQL security-function integration is also blocked on PG17 because `public.complete_cooking_session(...)` terminates a backend with signal 11. The isolated server recovers, and the YouTube-specific 29-test PostgreSQL/PostgREST suite remains green.
- No secret value, raw JWT, service-role key or credential was copied into this evidence.

## Pending independent gates

- Stage 3 independent backend/release re-review on the exact replacement PR head; the old reviewed head `95c2b370` remains `REVISE`
- current-head CI completion and any Stage 3 requested fixes
- approved independent disposition or root fix for the pre-existing security release-gate inventory/backend crash; this Stage 2 task does not self-author a waiver
- all Stage 4 frontend, Playwright, exploratory QA and design authority work
- Stage 6 closeout/merge approval
- every production/staging/remote action listed under `Manual Only`
