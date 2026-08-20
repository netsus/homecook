# youtube-async-extraction-notification Stage 2 backend evidence

## Scope and authority

- baseline: `origin/master@c4045705ef72c76f7e7258d10c460f56b6847dd7`
- branch: `feature/be-youtube-async-extraction-notification`
- original implementation commits: `267356fe`, `0139e987`, `eee52d6e`, `9aaa690c`, `a751209f`, `95c2b370`
- first Stage 3 reviewed head: `95c2b370` — `REVISE`
- second Stage 3 re-reviewed head: `3af52ff5` — `REVISE` (`P1` 5, `P2` 3)
- second-revision RED commits: `d5f04962`, `4b264f1c`, `9c17affd`, `2edb82b4`, `b9edf7cb`, `afd74382`, `8b241750`
- second-revision GREEN commits: `d45f32c0`, `f7c48364`, `147ae6e7`, `7bf11d88`
- third Stage 3 re-reviewed head: `704d2f39` — `REVISE` (`P1` 1, `P2` 1)
- third-revision RED commit: `78ffe9b9`
- third-revision GREEN commit: `68a7d338`
- fourth Stage 3 re-reviewed head: `898cf0c70292646a30aba9eca816ad44b68364f6` — `PASS` (implementation findings none)
- replacement implementation head: `68a7d338`; reviewed documentation head: `898cf0c70292646a30aba9eca816ad44b68364f6`
- official tuple: requirements `1.7.32`, screen `1.5.36`, Flow `1.3.34`, DB `1.3.34`, API `1.2.39`
- frozen plan: SHA-256 `7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a`, 991 lines, independent review task `019ffb44-5614-7af3-86a9-4ebd50977123` (`PASS`, Findings 없음)
- Phase 1.5 local-only repair: PR #1350 exact head `a625aefa7baab63f183a9d46e6f12d607d4e017f`, merged as `c4045705ef72c76f7e7258d10c460f56b6847dd7` after independent `PASS` / Findings 없음 and current-head checks green
- migration: `supabase/migrations/20260812160000_youtube_async_extraction_notification.sql`
- production/staging/remote writes: `0`
- production migration/policy enable/credential issuance/launchd activation: `0` (`Manual Only`)
- existing app service on port `3100`: untouched

This evidence records the Stage 2 implementation and the independent Stage 3 approval. The PR remains Draft and merge-blocked; no Ready transition, merge, or production activation was performed.

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

The first replacement current-head CI run found two further regression-test failures: the generated account-session inventory had not yet recorded the new method/title worker RPC calls, and the immutable subprocess integration timed out only on Linux CI. The inventory is now regenerated from the exact call sites. Immediate child-exit diagnostics then exposed both hidden environment assumptions: the fixture omitted `yt-dlp`, and the production verifier correctly rejects non-Darwin hosts plus missing `/usr/bin/sandbox-exec` and `/usr/bin/swiftc`. Production verification remains unchanged and fail-closed. The cross-platform integration artifact now materializes an isolated Darwin-system-path simulation, supplies every exact tool without host `PATH`, rejects immediately if the child exits before finalize, and retains claim/persist/finalize/SIGTERM assertions under a bounded 30-second budget. Separate unit coverage locks the unmodified production platform, exact paths, Codex version/login, Python/OpenCV/yt-dlp, ffmpeg and ffprobe checks.

The independent third re-review of `704d2f39` found two final catalog-attestation gaps. The RED suite first failed 2 of 23 focused tests because the live fingerprint omitted exact table/sequence/schema ownership and the expected-schema reader accepted duplicate JSON keys. The GREEN migration now fingerprints every target relation and schema owner, every distinct owner role's security attributes, and membership `admin`/`inherit`/`set` attributes. A real PostgreSQL regression transfers a target table to an arbitrary non-prefixed role and proves readiness becomes false before restoring ownership. The expected-schema manifest has one canonical memberships structure, and its reader rejects duplicate keys, incomplete component lists, incomplete membership attributes, and fingerprint-shape drift before installation or startup.

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

### 2026-08-14 second independent-review repair candidate

- verification content head: `782646e7cb093803930f1c490682c2cb6e042095`; the following evidence commit changes documentation only
- independent reviewer task `019ffbd0-a22f-7270-b8c0-3a4360cd0875` returned `REVISE` on `78b0a38825b48129b9c6f12d42cbaa5d038a08a7`; all three findings were repaired with RED-first regressions and the same task must re-review the replacement head
- readiness now validates the enabled/valid database state before policy comparison: disabled, credential-cutoff, catalog/schema drift, `ready=false`, and malformed descriptors fail before write as `503 QUEUE_UNAVAILABLE`; only an enabled valid stale app descriptor returns `409 POLICY_CHANGED`
- the migration preserves the official exact five-role set. The existing credential-manager owner executes readiness inside its already-frozen policy/credential boundary, the existing worker owner executes owner-filtered projections inside its jobs/sessions boundary, and the enqueue owner remains limited to policy `SELECT` plus jobs `SELECT,INSERT`; enqueue credential/session authority remains 0
- the advisory-lock regression no longer acquires a test-owned shared lock. A second connection observes the actual enqueue RPC transaction's granted `ShareLock` by application name, backend PID, lock mode and grant state, then proves the rotation `ExclusiveLock` and retry `ShareLock` wait in order; accepted rows contain complete old/new snapshots and mixed snapshot count is 0
- RED evidence: focused route/migration 3 failures / 18 passes before the minimal implementation
- GREEN focused route/migration: 2 files / 21 tests passed; focused backend/migration/worker/installer regression: 9 files / 122 tests passed
- product PostgreSQL/PostgREST integration: isolated real database and loopback Data API, 2 files / 36 tests passed; catalog fingerprint `42343e34fadbe3ddc4b73026c97cd6606e1f864182be2cd9ff571410289c8bb0`
- focused local-only/workpack regression: 5 files / 35 tests passed
- `verify:security-functions:isolated`: exact Supabase CLI `2.110.0`, migration tree SHA-256 `a0a75cef529d1e5e5b4632c448b4605a8eccacd57df5a4335313926761b225d9`, temporary project `hcg_7638_dd594b`; 205 additive functions classified, 8 anonymous mutations denied with unchanged checksums, 4 Data API probes returned `406/PGRST106`, cleanup residue 0
- `verify:local-supabase-runtime:isolated`: the same CLI and migration tree, temporary project `hcg_11804_b9503c`; migration+seed and Data API `200` passed, cleanup residue 0
- operating-state read-only comparison before/after both gates: Docker volume inventory SHA-256 `cfe7d35201429e2ab5421ab9867f1344665308553f801f12020092b09edf59f7` identical, app `127.0.0.1:3100` listener PID `3640` identical, isolated-gate labeled container/network/volume residue 0; only unrelated self-restarting `real_django_django_1` uptime changed
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, workpack/source-of-truth/workflow-v2/OMO validators and `git diff --check`: pass
- `pnpm test`: 570 files passed / 31 skipped; 6066 tests passed / 439 skipped
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend`: lint, typecheck, 238 product files passed / 12 skipped and 2741 tests passed / 175 skipped, production build, security Playwright 12/12 passed; operating app `3100` untouched
- Supabase Cloud/linked/remote access, hosted URL or credential lookup, production migration, feature activation, launchd action and operating full-local mutation: 0

### 2026-08-14 independent-review repair candidate

- verification content head: `57722981d9fa7aed7a709ffeb85ee36fd4fb9315`; the following evidence commit changes documentation only
- independent reviewer task `019ffbd0-a22f-7270-b8c0-3a4360cd0875` returned `REVISE` on `a236649657b5db648b0c9eb76e86c6017d7ae821`; all four findings were repaired with RED-first regressions and the same task must re-review the replacement head
- stale app descriptor versus rotated DB policy now fails before write as `409 POLICY_CHANGED`; malformed/unavailable readiness remains `503 QUEUE_UNAVAILABLE`
- exact authority split is enqueue owner = policy `SELECT` + jobs `SELECT,INSERT`, readiness owner = policy/credential `SELECT`, projection owner = jobs/sessions owner-scoped `SELECT`; enqueue credential/session ACL and RLS count is 0
- provider `video_title_snapshot` remains independent from the finalized recipe title, proven with different provider and recipe titles in the real PostgreSQL suite
- two independent `psql` connections prove shared enqueue/retry versus exclusive rotation on advisory key `86120317`; accepted jobs contain complete old/new snapshots and mixed snapshot count is 0
- RED evidence: focused route/migration 4 failures / 16 passes, isolated PostgreSQL/PostgREST 3 failures / 32 passes; the merged security gate also rejected the stale security-function owner inventory before its TDD repair
- GREEN focused local-only/workpack regression: 5 files / 35 tests passed; focused backend/migration/worker/installer regression: 9 files / 122 tests passed
- product PostgreSQL/PostgREST integration: isolated real database and loopback Data API, 2 files / 36 tests passed; catalog fingerprint `0662b6cb4086710a91970011c3867c628db97f8e18edcae89570131d9ddc90cf`
- `verify:security-functions:isolated`: exact Supabase CLI `2.110.0`, migration tree SHA-256 `ff7e12b28c1f06c6678b351994158de8ebbcbd4ef7e69677d233ea5811e3daf6`, temporary project `hcg_45511_6dd661`; 205 additive functions classified, 8 anonymous mutations denied with unchanged checksums, 4 Data API probes returned `406/PGRST106`, cleanup residue 0
- `verify:local-supabase-runtime:isolated`: the same CLI and migration tree, temporary project `hcg_49796_ea7680`; migration+seed and Data API `200` passed, cleanup residue 0
- operating-state read-only comparison before/after both gates: container inventory unchanged except an unrelated self-restarting `real_django_django_1` uptime, Docker volume inventory SHA-256 `cfe7d35201429e2ab5421ab9867f1344665308553f801f12020092b09edf59f7` identical, app `127.0.0.1:3100` listener PID `3640` identical, isolated-gate labeled container/network/volume residue 0
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, workpack/source-of-truth/workflow-v2/OMO validators and `git diff --check`: pass
- `pnpm test`: 570 files passed / 31 skipped; 6066 tests passed / 439 skipped
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend`: lint, typecheck, 238 product files passed / 12 skipped and 2741 tests passed / 175 skipped, production build, security Playwright 12/12 passed; operating app `3100` untouched
- Supabase Cloud/linked/remote access, hosted URL or credential lookup, production migration, feature activation, launchd action and operating full-local mutation: 0

### 2026-08-14 rebased local-only candidate

- verification content head: `ca94794dff0f748ced357985982b8f7c1cb5168b` on `origin/master@c4045705ef72c76f7e7258d10c460f56b6847dd7`; the following evidence commit changes documentation only
- focused local-only/workpack regression — 5 files / 36 tests passed; workpack and automation-spec validators passed
- focused backend/migration/worker/installer regression — 9 files / 119 tests passed
- product PostgreSQL/PostgREST integration — isolated real database and loopback Data API, 2 files / 35 tests passed
- `verify:security-functions:isolated` — exact Supabase CLI `2.110.0`, migration tree SHA-256 `417db58eed9eb28a0adc83a99651086804c3a8a885753cf04fc59912d6065aa5`, temporary project `hcg_63576_07a904`; 205 additive functions classified, 8 anonymous mutations denied with unchanged checksums, 4 Data API negative probes returned `406/PGRST106`, cleanup residue 0
- `verify:local-supabase-runtime:isolated` — exact Supabase CLI `2.110.0`, the same migration tree SHA-256, temporary project `hcg_67853_8f55d4`; migration+seed and Data API `200` readiness passed, cleanup residue 0
- operating-state read-only comparison before/after both gates — running container inventory identical, Docker volume inventory SHA-256 `cfe7d35201429e2ab5421ab9867f1344665308553f801f12020092b09edf59f7` identical, app `127.0.0.1:3100` listener/PID identical, isolated-gate labeled container/network/volume residue 0
- `pnpm lint`, `pnpm typecheck`, `pnpm build` — pass
- `pnpm test` — 570 files passed / 31 skipped; 6063 tests passed / 438 skipped
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend` — lint, typecheck, 238 product files passed / 12 skipped and 2741 tests passed / 175 skipped, production build, security Playwright 12/12 passed; the operating app on `3100` was untouched
- Supabase Cloud/linked/remote access, hosted URL or credential lookup, production migration, feature activation, launchd action and operating full-local mutation — 0

### Historical Stage 2/3 verified evidence

- `pnpm install --frozen-lockfile` — already up to date
- `BRANCH_NAME=feature/be-youtube-async-extraction-notification pnpm validate:workpack -- --slice youtube-async-extraction-notification` — pass
- third-revision focused migration/API/i031/runner/worker/installer/snapshot suite — 6 files, 70 tests passed
- expected-schema/migration focused suite — 2 files, 23 tests passed
- isolated real PostgreSQL + real PostgREST suite — 2 files, 35 tests passed, including arbitrary owner, forbidden role-membership and RPC-ACL drift
- migration static contract — 6 tests passed
- portable real PostgreSQL catalog fingerprint `ba92ccdeb92c350548b09d556d561619b511ec7f614ff6436c376044747fda0f` equals the expected-schema manifest after exact owner and membership-attribute coverage
- additive security-function contract — 31 YouTube functions classified and valid
- `pnpm typecheck` — pass
- targeted ESLint — pass
- `pnpm test` at implementation head `68a7d338` — 563 files passed / 31 skipped; 5926 tests passed / 433 skipped
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend` at implementation head `68a7d338` — lint, typecheck, product tests (238 files passed / 12 skipped; 2734 passed / 175 skipped), production build and security Playwright (12 passed) all pass; the existing port `3100` service was untouched
- historical pre-repair reset rehearsal at implementation-equivalent detached head `7bf11d88` used isolated `56320`–`56326`; its unpinned multi-service health timeout is superseded by the merged pinned DB+Data API isolated lifecycle. Existing app port `3100` stayed untouched.

Independent fourth Stage 3 verification on exact head `898cf0c70292646a30aba9eca816ad44b68364f6`:

- findings: none; the prior 11 required findings and the final owner/fingerprint plus duplicate-membership findings are closed without a new correctness, security, performance or maintainability regression
- `pnpm exec vitest run tests/youtube-async-extraction-migration.test.ts tests/youtube-extraction-release-installer.test.ts` — 2 files / 23 tests passed; a separate raw duplicate-JSON probe rejected the second `memberships` key before parsing
- `pnpm test:youtube-async:postgres` — isolated real PostgreSQL/PostgREST, 2 files / 35 tests passed; the suite transferred `public.youtube_extraction_jobs` to an arbitrary unrelated owner and proved readiness/fingerprint fail closed before restoring ownership
- focused migration/i031/runner/worker/installer/snapshot suite — 6 files / 70 tests passed
- `pnpm test` — 563 files passed / 31 skipped; 5926 tests passed / 433 skipped
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3199 pnpm verify:backend` — lint, typecheck, 238 product files / 2734 tests passed, production build passed, security Playwright 12 passed
- exact-head GitHub checks — 13 unique successful checks; repeated governance runs were also successful, conditional `lighthouse` and `full-regression` were skipped by the workflow, and no check was pending or failed

The isolated DB runner allocates dynamic PostgreSQL/PostgREST ports, uses an ephemeral credential and temporary database, and removes the container/database afterward. The earlier isolated Supabase reset rehearsal used only `homecook_yta_stage2_retry` on ports `65520`–`65526`; the final clean-migration regression used the default local Supabase development ports. Neither path bound, reused or stopped port `3100`, and neither stopped or mutated any `homecook-full-local-*` stack.

## Phase 1.5 local-only rebaseline

- The original `supabase_db_homecook` volume contained PostgreSQL 15 data and could not be opened by the newly selected 17.6 image.
- Before the follow-up instruction to preserve user data arrived, `supabase stop --no-backup` had already been run against that default local development project. Its legacy local volume is no longer present. No production, staging or `homecook-full-local-*` volume was targeted.
- Earlier unpinned multi-service reset attempts are historical evidence only. PR #1350 replaced that required path with pinned isolated PostgreSQL plus Data API lifecycles that own their temporary project, ports, volumes, network, environment and secrets.
- `SECURITY_FUNCTION_DATABASE_URL=<isolated-PG17> pnpm verify:security-functions` was green on the isolated current image: the clean catalog had 205 classified additive functions, and all 8 anonymous mutation probes (including `complete_cooking_session`) returned the expected denial with unchanged checksums. This confirms the old signal-11 failure was specific to the stale local CLI/image `17.6.1.106`; the isolated image had `pg_graphql` absent and no backend crash.
- Supabase Cloud, linked projects, hosted endpoints and remote credentials are forbidden/N/A. Their absence is not a blocker and no such target is queried during Stage 2/3 verification.
- Required schema/security verification uses merged `verify:security-functions:isolated`; required migration/runtime verification uses merged `verify:local-supabase-runtime:isolated`. Both fail closed if labeled temporary resources remain after cleanup.
- Product PostgreSQL/PostgREST integration runs only against its own temporary database and loopback Data API. The operating full-local stack, app port `3100`, user data, production ports/volumes/environment/secrets and launchd remain read-only and untouched.
- No secret value, raw JWT, service-role key or credential was copied into this evidence.

## Pending independent gates

- Stage 3 implementation review is complete with `PASS` and findings none at exact head `898cf0c70292646a30aba9eca816ad44b68364f6`; reviewed heads `95c2b370`, `3af52ff5`, and `704d2f39` remain `REVISE`
- current rebased product head의 current-head GitHub checks
- current rebased exact head에 대한 새 독립 Stage 3 reviewer Findings 0 확인
- all Stage 4 frontend, Playwright, exploratory QA and design authority work
- Stage 6 closeout/merge approval
- every production/staging/remote action listed under `Manual Only`
