# Acceptance Checklist

> Stage 1 locks a future verification-only final release gate. Unchecked items do not claim predecessor runtime, remote/local DB, browser, telemetry, authority, activation or Manual Only evidence already exists.

## Contract / Repair Boundary

- [ ] official v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 and the approved 1,018-line plan remain the only public contract <!-- omo:id=accept-cooking-cross-release-contract;stage=2;scope=shared;review=3,6 -->
- [ ] the slice introduces no endpoint, field, status, error, migration, dependency, UI composition or inline runtime fix <!-- omo:id=accept-cooking-cross-release-no-invention;stage=2;scope=shared;review=3,5,6 -->
- [ ] runtime verification waits for F0 and #1~#13 implementation/closeout current-head green <!-- omo:id=accept-cooking-cross-release-predecessors;stage=2;scope=shared;review=3,6 -->
- [ ] each discovered defect is reproduced by a failing test in a separate repair PR and the final evidence is rerun on the repaired exact head <!-- omo:id=accept-cooking-cross-release-repair-boundary;stage=2;scope=shared;review=3,5,6 -->
- [ ] production/staging/provider writes remain zero outside separately authorized Manual Only operations <!-- omo:id=accept-cooking-cross-release-external-write-zero;stage=2;scope=shared;review=3,6 -->

## Security / Account Generation

- [ ] every application-owned trusted-schema function and every SECURITY DEFINER exact signature has one control-class/effect/exposure/exact-principal inventory row <!-- omo:id=accept-cooking-cross-release-function-inventory;stage=2;scope=backend;review=3,6 -->
- [ ] application mutations keep PUBLIC/anon false and safe search paths; provider-managed baselines are immutable and Data API/actual RPC negatives pass <!-- omo:id=accept-cooking-cross-release-function-security;stage=2;scope=backend;review=3,6 -->
- [ ] Auth Hook wrapper/guard exact principal and SELECT-only owner privileges pass local/remote legacy-maintenance-active and race fixtures <!-- omo:id=accept-cooking-cross-release-auth-hook;stage=2;scope=backend;review=3,6 -->
- [ ] every personal writer and account delete rejects stale/revoked/missing G1 sessions and cannot write into G2 <!-- omo:id=accept-cooking-cross-release-session-generation;stage=2;scope=backend;review=3,6 -->
- [ ] cutover staging/count-digest CAS/quarantine/promote/rollback and actual FK cleanup order pass without orphan private rows <!-- omo:id=accept-cooking-cross-release-cutover;stage=2;scope=backend;review=3,6 -->
- [ ] image quota/lease/takeover/cancel/first-404/recheck/permanent-tombstone/dead-letter/late-object recovery pass and legacy orphan enqueue/delete remains zero <!-- omo:id=accept-cooking-cross-release-image-lifecycle;stage=2;scope=backend;review=3,6 -->

## Recipe / Snapshot / Product

- [ ] public fork preserves the original, private create/PATCH/soft DELETE is owner/session-bound, and private/deleted tags are absent from every public path <!-- omo:id=accept-cooking-cross-release-personal-recipe;stage=2;scope=shared;review=3,5,6 -->
- [ ] content is the logical authority, pins one exact nutrition snapshot and keeps compatibility direct values null-or-equal until the approved contract step <!-- omo:id=accept-cooking-cross-release-snapshot-authority;stage=2;scope=backend;review=3,6 -->
- [ ] future impact token covers draft/revision/target/claim and stale or claimed replace-all is full mutation-zero 409 while keep preserves old pins <!-- omo:id=accept-cooking-cross-release-future-impact;stage=2;scope=shared;review=3,5,6 -->
- [ ] completed shopping remains read-only and open-list reconcile preserves check/exclusion state <!-- omo:id=accept-cooking-cross-release-shopping;stage=2;scope=shared;review=3,5,6 -->
- [ ] the local 287,041 product catalog keeps relevance, stable cursor, visibility/moderation and no runtime provider search <!-- omo:id=accept-cooking-cross-release-product-search;stage=2;scope=backend;review=3,6 -->
- [ ] approved primary product→ingredient projection preserves product identity/nutrition version and every reader uses effective ingredient projection <!-- omo:id=accept-cooking-cross-release-product-link;stage=2;scope=backend;review=3,6 -->
- [ ] unified ingredient/product food search is one server-ranked typed-union cursor with no client merge, duplicate or missing page item <!-- omo:id=accept-cooking-cross-release-unified-search;stage=2;scope=shared;review=3,5,6 -->

## Cooking / Batch / Meal Log

- [ ] v1/v2 dispatch uses stored contract version, optional-key rollout precedes 428, flag-off seeded-v2 and rollback drain remain green, and strict v1 removal stays separately gated <!-- omo:id=accept-cooking-cross-release-version-drain;stage=2;scope=shared;review=3,5,6 -->
- [ ] planner start and propagation share owner→recipe→Meal lock/claim and v2 completion removes only exact validated pantry row IDs <!-- omo:id=accept-cooking-cross-release-start-pantry;stage=2;scope=backend;review=3,6 -->
- [ ] cooked batch content-only nutrition and missing/known/unrecoverable weighted/unweighed ledger replay, bounds, concurrency and non-reversible mark all pass <!-- omo:id=accept-cooking-cross-release-batch-ledger;stage=2;scope=backend;review=3,6 -->
- [ ] each meal-log entry reverses only its linked active event regardless of order and full replay preserves other entries and remaining quantity <!-- omo:id=accept-cooking-cross-release-meal-event;stage=2;scope=backend;review=3,6 -->
- [ ] batch/product/ingredient nutrition uses exact pinned evidence; missing conversion returns 422 and missing nutrition is never false zero <!-- omo:id=accept-cooking-cross-release-exact-nutrition;stage=2;scope=backend;review=3,6 -->
- [ ] record-time IANA timezone/local date stays immutable and deleted meal columns retain slot history without admitting new selections <!-- omo:id=accept-cooking-cross-release-time-column;stage=2;scope=shared;review=3,5,6 -->
- [ ] consumed first depletion grants eaten/auto-hide/XP once, discarded/mixed does not, and reversal/redepletion never duplicates XP <!-- omo:id=accept-cooking-cross-release-leftover-xp;stage=2;scope=backend;review=3,6 -->

## Real DB / Remote / Performance

- [ ] fresh local Supabase full migrations and replay pass with real Postgres/RLS/PostgREST/Auth/Storage, A/B isolation and exact digests <!-- omo:id=accept-cooking-cross-release-real-db;stage=2;scope=backend;review=3,6 -->
- [ ] merged-exact-SHA remote read-only verification matches local inventory and performs no production mutation <!-- omo:id=accept-cooking-cross-release-remote;stage=2;scope=backend;review=3,6 -->
- [ ] search 287,041 rows, product relation, propagation, batch ledger and meal aggregate close one end-to-end evidence chain <!-- omo:id=accept-cooking-cross-release-e2e-data;stage=2;scope=shared;review=3,6 -->
- [ ] SQL/route measurements, EXPLAIN and query counts show no item-level N+1 or unexplained baseline regression <!-- omo:id=accept-cooking-cross-release-performance;stage=2;scope=backend;review=3,6 -->

## Real Browser / Design Authority

- [ ] real Chrome uses the real local stack rather than fixture-only substitutes for auth A/B and all release flows <!-- omo:id=accept-cooking-cross-release-real-browser;stage=4;scope=frontend;review=5,6 -->
- [ ] `ACCOUNT_QUARANTINE`, `HOME`, `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, `PLANNER_WEEK`, `COOK_MODE`, `LEFTOVERS`, `MEAL_LOG` have fresh 390/320/desktop exact-head evidence <!-- omo:id=accept-cooking-cross-release-responsive;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/unauthorized/read-only/partial/unavailable/conflict/replay and destructive confirmations fail closed without context loss <!-- omo:id=accept-cooking-cross-release-states;stage=4;scope=frontend;review=5,6 -->
- [ ] keyboard order, focus restore, 44px targets, wrapping/overflow and screen-reader landmarks pass the fresh authority review <!-- omo:id=accept-cooking-cross-release-accessibility;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME remains recipe-only and private/quarantined/deleted content never appears in list/detail/search/tag/cache/SEO <!-- omo:id=accept-cooking-cross-release-home-privacy;stage=4;scope=frontend;review=5,6 -->
- [ ] planner keeps cooking plan separate from actual meal log and legacy product rows remain read/detail/delete-only with pinned history <!-- omo:id=accept-cooking-cross-release-planner-separation;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA/eval, fresh authority report and concrete runtime/screenshot refs all pin the same repaired head <!-- omo:id=accept-cooking-cross-release-authority;stage=4;scope=frontend;review=5,6 -->

## Legacy / Rollback / Closeout

- [ ] current/immediate-previous clients and old/new image paths pass their declared rollback matrices <!-- omo:id=accept-cooking-cross-release-rollback;stage=4;scope=shared;review=3,5,6 -->
- [ ] elapsed release or telemetry zero never authorizes product/v1/cursor/planner/image-path tombstone or orphan deletion <!-- omo:id=accept-cooking-cross-release-no-tombstone;stage=4;scope=shared;review=3,5,6 -->
- [ ] final independent security/DB/operations, performance/code, Stage 5 authority and Stage 6 reviewers report zero findings/blockers <!-- omo:id=accept-cooking-cross-release-final-reviews;stage=4;scope=shared;review=6 -->
- [ ] every current-head started check is success or a policy-justified skip; pending/fail/cancel/absent/stale is zero <!-- omo:id=accept-cooking-cross-release-current-head;stage=4;scope=shared;review=6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff and keeps every runtime item unchecked <!-- omo:id=accept-cooking-cross-release-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] independent Stage 1 internal1.5/security-DB-operations/five-axis/design-authority-plan reviews are all zero findings <!-- omo:id=accept-cooking-cross-release-stage1-reviews;stage=2;scope=shared;review=3,5,6 -->

## Manual QA

- verifier: separated Codex DB/security/operations, performance/code, browser/design authority, Stage 5 and Stage 6 reviewers
- environment: exact repaired head, fresh local Supabase, merged-exact-SHA remote read-only, real Chrome, mobile-default 390px, mobile-narrow 320px and desktop
- scenarios: security inventory/Auth Hook; cutover/quarantine/image lifecycle; recipe/snapshot/product/planner; v1/v2 cooking; batch/meal log; legacy/rollback; current-head CI

## Manual Only

- [ ] physical device and actual screen-reader verification
- [ ] true production-scale query/load measurement
- [ ] product MacBook launchd install, production secret provisioning/rotation and external heartbeat ownership
- [ ] any irreversible tombstone, legacy orphan deletion or production/staging/provider mutation
