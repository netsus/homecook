# youtube-async-extraction-notification Stage 2 backend evidence

## Scope and authority

- baseline: `origin/master@6f6043d91a3cfdcc7da10a4f28f59676990a9d80`
- branch: `feature/be-youtube-async-extraction-notification`
- implementation commits: `267356fe`, `0139e987`, `eee52d6e`, `9aaa690c`
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
- exact enqueue/queue/permit/finalize/delivery/credential/projection RPC inventory
- restricted roles, owner roles, memberships, forced RLS, ACL and pre-request fencing
- deterministic expected-schema manifest and worker artifact manifest
- macOS launchd installer, credential rotation, preflight, drain, rollback and health rehearsal, all dry-run/manual-only

## Verification evidence

Passed before Draft PR creation:

- `pnpm install --frozen-lockfile` — already up to date
- `BRANCH_NAME=feature/be-youtube-async-extraction-notification pnpm validate:workpack -- --slice youtube-async-extraction-notification` — pass
- exact async unit/contract suite plus migration compatibility — 6 files, 62 tests passed
- isolated real PostgreSQL + real PostgREST suite — 2 files, 22 tests passed
- existing YouTube import/i031/parser/Recipio compatibility selection — 6 files, 154 tests passed
- `pnpm typecheck` — pass
- targeted ESLint — pass
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3117 pnpm verify:backend` — lint, typecheck, product tests (238 files passed / 12 skipped; 2733 passed / 175 skipped), production build and security Playwright (12 passed) all pass
- clean isolated Supabase PostgreSQL 17 reset with every repository migration through `20260812160000_youtube_async_extraction_notification.sql` and `supabase/seed.sql` — pass
- additive security-function contract classification — 22 new application functions classified; live ACL validation reached the unrelated baseline inventory phase with the new function ACL/owner/search-path checks green

The isolated DB runner allocates dynamic PostgreSQL/PostgREST ports, uses an ephemeral credential and temporary database, and removes the container/database afterward. The Supabase reset rehearsal used only `homecook_yta_stage2_retry` on ports `65520`–`65526`. It did not bind, reuse or stop port `3100`, and it did not stop or mutate any `homecook-full-local-*` stack.

## Local reset and release-gate facts

- The original `supabase_db_homecook` volume contained PostgreSQL 15 data and could not be opened by the newly selected 17.6 image.
- Before the follow-up instruction to preserve user data arrived, `supabase stop --no-backup` had already been run against that default local development project. Its legacy local volume is no longer present. No production, staging or `homecook-full-local-*` volume was targeted.
- All subsequent work used the newly created isolated `homecook_yta_stage2_retry` project. The schema reset and SQL seed completed. The demo-data API seed could not complete: the CLI-selected amd64 PostgREST repeatedly exited `137`; after replacing only that temporary container with the repository-tested arm64 image, the existing hybrid pre-request authority rejected the service-role seed with `ACCOUNT_SESSION_STALE`.
- `verify:security-functions:release` validates the new additive functions, then stops on an existing PG17 provider baseline mismatch: `graphql.get_schema_version()` is present in the new image while the checked-in local inventory records it absent.
- the existing broad PostgreSQL security-function integration is also blocked on PG17 because `public.complete_cooking_session(...)` terminates a backend with signal 11. The isolated server recovers, and the YouTube-specific 22-test PostgreSQL/PostgREST suite remains green.
- No secret value, raw JWT, service-role key or credential was copied into this evidence.

## Pending independent gates

- Stage 3 independent backend/release review on the exact final PR head
- current-head CI completion and any Stage 3 requested fixes
- independent disposition of the two unrelated PG17 security release-gate drifts above
- all Stage 4 frontend, Playwright, exploratory QA and design authority work
- Stage 6 closeout/merge approval
- every production/staging/remote action listed under `Manual Only`
