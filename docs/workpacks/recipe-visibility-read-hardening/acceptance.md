# Acceptance Checklist

> Evidence is checked only after the owning implementation/review stage produces it. This Stage 1 document locks future tests and rollout boundaries; it does not claim migration, Storage, route, launchd, browser or remote-verifier artifacts already exist.

## Happy Path

- [ ] public list/HOME/theme/search/sitemap returns only public, not-deleted recipes whose user owner is not quarantined <!-- omo:id=accept-visibility-public-read;stage=2;scope=backend;review=3,6 -->
- [ ] owner can read current private detail while anon and another owner receive indistinguishable 404 <!-- omo:id=accept-visibility-private-owner;stage=2;scope=backend;review=3,6 -->
- [ ] existing Meal/shopping/session/batch/meal-log/snapshot readers resolve pinned deleted recipe history for the authorized resource owner <!-- omo:id=accept-visibility-historical-anchor;stage=2;scope=backend;review=3,6 -->
- [ ] recovery activate restores eligible stored visibility without creating new owner-neutral rows or changing system content <!-- omo:id=accept-visibility-quarantine-recovery;stage=2;scope=backend;review=3,6 -->
- [ ] personal upload creates a private registry object, returns object ID plus short signed URL and reissues the URL on replay <!-- omo:id=accept-image-private-upload;stage=2;scope=backend;review=3,6 -->
- [ ] recipe create attaches verified `image_object_id` and reference atomically <!-- omo:id=accept-image-object-attach;stage=2;scope=backend;review=3,6 -->
- [ ] owner cancel, expired scanner and ordered drain reach terminal cleanup exactly once <!-- omo:id=accept-image-cancel-drain;stage=2;scope=backend;review=3,6 -->

## Visibility / State

- [ ] private and deleted recipe/tag association never appears in `/tags`, tag filter, themes, usage count, cache, sitemap or SEO <!-- omo:id=accept-visibility-tag-matrix;stage=2;scope=backend;review=3,6 -->
- [ ] `recipe_tags.visibility` is derived from the locked parent and client/direct DML cannot widen it <!-- omo:id=accept-visibility-tag-derived;stage=2;scope=backend;review=3,6 -->
- [ ] soft delete is idempotent, blocks new select/book/snapshot/start and leaves history FK/snapshot intact <!-- omo:id=accept-visibility-soft-delete;stage=2;scope=backend;review=3,6 -->
- [ ] historical reader authority cannot be used to fetch general deleted/private detail or make a new plan/session <!-- omo:id=accept-visibility-history-no-bypass;stage=2;scope=backend;review=3,6 -->
- [ ] quarantined user-owned profile/recipe/product/community rows are public-hidden in every direct and cached surface <!-- omo:id=accept-visibility-quarantine-hidden;stage=2;scope=backend;review=3,6 -->
- [ ] owner-null/system content is unchanged by quarantine, recovery and account cleanup <!-- omo:id=accept-visibility-neutral-preserved;stage=2;scope=backend;review=3,6 -->

## Managed Image / Concurrency

- [ ] private/pending/cleanup registry row requires owner+generation; public/shared neutral row requires both null and neutral path <!-- omo:id=accept-image-owner-shape;stage=2;scope=backend;review=3,6 -->
- [ ] direct anon/authenticated Storage mutation and registry/reference/outbox/quota DML are denied <!-- omo:id=accept-image-direct-mutation-denied;stage=2;scope=backend;review=3,6 -->
- [ ] before PUT, `image/jpeg|image/png|image/webp`, 5MB, `10 new uploads/10min`, `100MB/24h`, active 20 and backlog 500/oldest due over 15 minutes/any dead-letter circuit breaker are enforced; replay is not recharged <!-- omo:id=accept-image-preput-gate;stage=2;scope=backend;review=3,6 -->
- [ ] live same-key replay returns 202+Retry-After and expired exact CAS winner alone takes over same `upsert=false` path <!-- omo:id=accept-image-live-takeover;stage=2;scope=backend;review=3,6 -->
- [ ] different payload reuse is 409 and never overwrites bytes or changes owner/generation/path <!-- omo:id=accept-image-key-reuse;stage=2;scope=backend;review=3,6 -->
- [ ] late finalize after scanner/cancel/delete returns no URL and cannot revive registry or reference <!-- omo:id=accept-image-late-finalize;stage=2;scope=backend;review=3,6 -->
- [ ] attach versus scanner/cancel has exactly one winner and any active reference blocks cleanup <!-- omo:id=accept-image-attach-race;stage=2;scope=backend;review=3,6 -->
- [ ] Storage success plus DB finalize failure compensates delete or opens a newer cleanup generation <!-- omo:id=accept-image-storage-db-compensation;stage=2;scope=backend;review=3,6 -->
- [ ] first 404 becomes normal-drain-excluded awaiting recheck for 15 minutes, a late object returns to pending deletion, and only an independent second 404 is verified-not-found <!-- omo:id=accept-image-first404-recheck;stage=2;scope=backend;review=3,6 -->
- [ ] permanent terminal tombstone detects a later object and reopens cleanup without key/object identity loss <!-- omo:id=accept-image-terminal-late-object;stage=2;scope=backend;review=3,6 -->
- [ ] terminal tombstone scanner claims at most 50 rows per tick in `(next_terminal_scan_at, id)` order with `SKIP LOCKED`, persists cursor progress, scans every 5 minutes for the first 24 hours and every 24 hours thereafter, and drains a 151-row fixture with starvation 0 <!-- omo:id=accept-image-terminal-scan-fairness;stage=2;scope=backend;review=3,6 -->
- [ ] lifecycle/watermark/registry/image-idempotency compact identity is permanent; cleanup terminal + at least 90 days + terminal recheck only compacts verbose detail while preserving key/payload/result/object reference so 91-day same-key replay returns the original durable result <!-- omo:id=accept-image-compact-retention-replay;stage=2;scope=backend;review=3,6 -->
- [ ] lifecycle complete requires contiguous required generations and zero nonterminal/dead-letter registry/outbox rows <!-- omo:id=accept-image-contiguous-terminal;stage=2;scope=backend;review=3,6 -->

## API / Error / Compatibility

- [ ] `POST /recipes/images` accepts no public visibility intent and preserves official wrapper and image error codes <!-- omo:id=accept-image-upload-contract;stage=2;scope=backend;review=3,6 -->
- [ ] owner-only `POST /recipes/images/{image_object_id}/cancel` hides missing/other-owner object as `IMAGE_NOT_FOUND` <!-- omo:id=accept-image-cancel-contract;stage=2;scope=backend;review=3,6 -->
- [ ] service-owned bucket URL without verified object ID is 422 `MANAGED_IMAGE_REFERENCE_REQUIRED`; arbitrary external URL remains unmanaged compatibility input where official contract permits <!-- omo:id=accept-image-managed-reference;stage=2;scope=backend;review=3,6 -->
- [ ] `IMAGE_UPLOAD_LIMITED` has positive Retry-After and does not reveal quota/backlog size <!-- omo:id=accept-image-limited-nondisclosure;stage=2;scope=backend;review=3,6 -->
- [ ] private/public bucket or owner/generation mismatch is 422 `IMAGE_VISIBILITY_MISMATCH` with attach 0 <!-- omo:id=accept-image-visibility-mismatch;stage=2;scope=backend;review=3,6 -->
- [ ] lifecycle maintenance/quarantine/deleting/stale-session errors are fail-closed and do not fall back to UUID-only writes <!-- omo:id=accept-image-lifecycle-errors;stage=2;scope=backend;review=3,6 -->

## Legacy / Operations

- [ ] positive referenced objects alone are backfilled; unknown orphan candidates produce report/count/path hash and enqueue/delete exactly 0 <!-- omo:id=accept-image-legacy-report-only;stage=2;scope=backend;review=3,6 -->
- [ ] private and public/shared references copy to correct buckets, atomically swap references and retain old path through one compatibility release <!-- omo:id=accept-image-visibility-migration;stage=2;scope=backend;review=3,6 -->
- [ ] old path deletion is a separate irreversible gate with reference 0, read smoke, rollback floor and dead-letter 0 <!-- omo:id=accept-image-old-path-gate;stage=2;scope=backend;review=3,6 -->
- [ ] expected-owner signal uses only owner_id, strict allowlisted owner path or registry owner/generation and reaches union-zero before Auth deletion <!-- omo:id=accept-image-owner-signal;stage=2;scope=backend;review=3,6 -->
- [ ] MacBook tick proves `StartInterval=300`, `RunAtLoad=true`, wrong-secret 401, heartbeat gap 15 minutes, cleanup target 24 hours, alert on 3 consecutive calls failed/oldest due over 15 minutes/any dead-letter, mode 600 env or Keychain secret, JSON log 10MB × 5 rotation and next-tick recovery <!-- omo:id=accept-image-launchd-runtime;stage=2;scope=shared;review=3,6 -->

### Manual Only

- [ ] actual launchd install, production secret, power/login/sleep and external heartbeat receiver evidence remain service-owner Manual Only

## Frontend / Regression

- [ ] MANUAL_RECIPE_CREATE stores object ID, refreshes signed URL and calls owner cancel instead of browser Storage `.remove()` <!-- omo:id=accept-image-client-object-state;stage=4;scope=frontend;review=5,6 -->
- [ ] in-progress/retry/quota/expired/reference errors render without public/private selector or new layout <!-- omo:id=accept-image-client-errors;stage=4;scope=frontend;review=5,6 -->
- [ ] existing loading/empty/error/read-only/unauthorized, accessibility and return-to-action behavior remains unchanged <!-- omo:id=accept-visibility-ui-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] F0 ACCOUNT_QUARANTINE and #5 RECIPE_DETAIL CTA files are not modified by this slice <!-- omo:id=accept-visibility-ui-ownership;stage=4;scope=frontend;review=5,6 -->

## Verification / Delivery

- [ ] Stage 1 runs only current docs validators, focused workflow tests, lint/typecheck, local dependency audit and diff check; GitGuardian/current-head workflows are observed separately <!-- omo:id=accept-visibility-stage1-gate;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 2 writes focused tests first and records RED before migration, reader, Storage or scheduler implementation <!-- omo:id=accept-visibility-tdd-red;stage=2;scope=backend;review=3,6 -->
- [ ] focused Vitest covers read matrix, tags/cache, ACL/non-disclosure, image CAS/lifecycle and account-delete barrier <!-- omo:id=accept-visibility-vitest;stage=2;scope=backend;review=3,6 -->
- [ ] PostgreSQL existing/fresh/replay covers checks/FKs/RLS/grants/functions/triggers/partial unique and concurrent races <!-- omo:id=accept-visibility-postgres;stage=2;scope=backend;review=3,6 -->
- [ ] live Storage replay covers upload/takeover/cancel/attach/first-404/late-object/compensation with writes limited to approved test fixtures <!-- omo:id=accept-visibility-storage-live;stage=2;scope=shared;review=3,6 -->
- [ ] merged-exact-SHA remote verifier is read-only before approved cutover and records public/private role matrix plus union-zero readiness <!-- omo:id=accept-visibility-remote;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal 1.5, security/DB and five-axis reviewers finish with required findings zero <!-- omo:id=accept-visibility-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [ ] Draft→Ready and every started current-head check finishes success or documented normal skip before squash merge <!-- omo:id=accept-visibility-current-head;stage=2;scope=shared;review=3,6 -->
