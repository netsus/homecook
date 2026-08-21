# Acceptance Checklist

> PR #1274 merged the Stage 3 backend runtime checkpoint, but overall acceptance remains in progress. Route/service automation and the soft-deleted reader path are complete, yet the unchecked items are not claims that the integrated pinned-reader path, server-production/local-rehearsal DB state, #7/#8 integrated fork/save-as-new E2E, terminal workpack closeout review or `personal_recipe_v2` R+2 activation already exist. The API v1.2.39 summary/body mismatch around `origin_recipe_id` and the save-as-new discriminator is still pending explicit Contract Evolution. See [`evidence/2026-08-22-terminal-automation-progress.md`](./evidence/2026-08-22-terminal-automation-progress.md) for the commit-by-commit closeout ledger.

## Create / Fork / Identity

- [x] active-generation personal create returns one new owner-private recipe ID without implicit Meal creation <!-- omo:id=accept-personal-create;stage=2;scope=backend;review=3,6 -->
- [x] public fork returns a new private ID with immutable `origin_recipe_id` while source content/revision/digest is unchanged <!-- omo:id=accept-personal-fork;stage=2;scope=backend;review=3,6 -->
- [x] normal owner save keeps the recipe ID and advances revision exactly once <!-- omo:id=accept-personal-same-id-save;stage=2;scope=backend;review=3,6 -->
- [x] explicit save-as-new alone creates a separate private ID and leaves the source private recipe unchanged <!-- omo:id=accept-personal-save-as-new;stage=2;scope=backend;review=3,6 -->
- [x] existing planner-bound/manual create and public/manual legacy rows remain compatible and are not auto-private <!-- omo:id=accept-personal-legacy-create;stage=2;scope=shared;review=3,6 -->

## Draft / Snapshot / Integration Integrity

- [x] ingredient and exact product/version provenance, amount/unit, title/servings and steps add/change/delete canonicalize deterministically <!-- omo:id=accept-personal-draft-provenance;stage=2;scope=backend;review=3,6 -->
- [x] each committed revision creates/reuses immutable content with exact nutrition snapshot ID and never mutates older snapshots <!-- omo:id=accept-personal-snapshot-immutability;stage=2;scope=backend;review=3,6 -->
- [x] `image_object_id` reference attach and content save commit atomically; signed/raw URL is never managed identity <!-- omo:id=accept-personal-image-attach;stage=2;scope=backend;review=3,6 -->
- [x] private recipe tags remain bounded by parent visibility/deleted/quarantine state in every public aggregate/cache path <!-- omo:id=accept-personal-tag-upper-bound;stage=2;scope=backend;review=3,6 -->
- [x] product validation uses approved exact relation/provenance and never guesses an ambiguous generic ingredient <!-- omo:id=accept-personal-product-validation;stage=2;scope=backend;review=3,6 -->

## Permission / Transaction

- [x] public PATCH, other-owner private write and authenticated direct table/RPC bypass are denied with mutation zero <!-- omo:id=accept-personal-write-denial;stage=2;scope=backend;review=3,6 -->
- [x] other-owner/deleted/quarantined resource stays 404/non-inferable and owner/source state does not leak <!-- omo:id=accept-personal-nondisclosure;stage=2;scope=backend;review=3,6 -->
- [x] client owner/visibility/generation/current-version/public-image fields cannot become authority <!-- omo:id=accept-personal-client-authority;stage=2;scope=backend;review=3,6 -->
- [x] every write validates verified session binding, identity epoch and current active generation in the same transaction <!-- omo:id=accept-personal-session-generation;stage=2;scope=backend;review=3,6 -->
- [x] global fence→owner→recipe UUID→Meal UUID→resource order is used and no lock RPC is followed by REST DML <!-- omo:id=accept-personal-lock-order;stage=2;scope=backend;review=3,6 -->
- [x] maintenance/quarantine/deleting/stale-session/stale-generation races fail with official code and zero partial effects <!-- omo:id=accept-personal-lifecycle-fail-closed;stage=2;scope=backend;review=3,6 -->

## Concurrency / Idempotency

- [x] UUID Idempotency-Key and canonical payload hash are scoped by owner+generation+operation <!-- omo:id=accept-personal-idempotency-scope;stage=2;scope=backend;review=3,6 -->
- [x] same key+payload replays the first durable wrapper/status with no duplicate content, tag or image effect <!-- omo:id=accept-personal-idempotency-replay;stage=2;scope=backend;review=3,6 -->
- [x] same key+different payload returns `409 IDEMPOTENCY_KEY_REUSED` with mutation zero <!-- omo:id=accept-personal-idempotency-conflict;stage=2;scope=backend;review=3,6 -->
- [x] concurrent same-revision writes yield one winner and do not mix draft/image/tag effects <!-- omo:id=accept-personal-optimistic-concurrency;stage=2;scope=backend;review=3,6 -->
- [x] mutation-first/delete-first/account-cleanup races follow lock order and leave no G1 write in G2 or orphan private row <!-- omo:id=accept-personal-delete-races;stage=2;scope=backend;review=3,6 -->

## Soft Delete / History

- [x] owner DELETE records `deleted_at` idempotently and never hard deletes or detaches snapshot/FK rows <!-- omo:id=accept-personal-soft-delete;stage=2;scope=backend;review=3,6 -->
- [x] soft-deleted recipe disappears from new search/select/book/snapshot/write while pinned Meal/shopping/session/batch/log readers still work <!-- omo:id=accept-personal-deleted-readers;stage=2;scope=shared;review=3,6 -->
  - `tests/e2e/slice-personal-recipe-customization-write-core.spec.ts`: `hides a soft-deleted recipe from new detail access while pinned readers stay readable`
  - `tests/e2e/slice-personal-recipe-customization-write-core.spec.ts`: `keeps shopping and meal-log readers readable while new shopping preview omits the deleted recipe`
  - `tests/e2e/slice-personal-recipe-customization-write-core.spec.ts`: `prevents legacy leftovers fixtures from hiding cooked-batch reader regressions`
- [x] hard delete succeeds only in exact-generation account cleanup after dependent/history-critical private rows <!-- omo:id=accept-personal-account-hard-delete;stage=2;scope=backend;review=3,6 -->
- [x] owner-null public/shared recipes and snapshots survive private account cleanup and creator identity is only anonymized per contract <!-- omo:id=accept-personal-shared-preservation;stage=2;scope=backend;review=3,6 -->
- [x] no user-facing restore endpoint/UI exists; any future internal restore must use the same guarded recipe-lock RPC <!-- omo:id=accept-personal-no-restore;stage=2;scope=shared;review=3,6 -->

## Successor / Activation Boundary

- [x] #6 exposes no alternate partial PATCH body and leaves impact preview/token/replace_all|keep/Meal-shopping propagation to #7 <!-- omo:id=accept-personal-patch-boundary;stage=2;scope=shared;review=3,6 -->
- [x] #6 owns no session-attempt start/cancel/complete, exact pantry completion or cooked-batch behavior <!-- omo:id=accept-personal-cooking-boundary;stage=2;scope=shared;review=3,6 -->
- [x] current and immediate-previous release with capability off emits zero new personal mutations and preserves legacy flows <!-- omo:id=accept-personal-capability-off;stage=2;scope=shared;review=3,6 -->
- [x] external personal writes stay disabled until #7 integration plus #8 R/R+1 evidence and R+2 joint activation <!-- omo:id=accept-personal-r2-activation;stage=2;scope=shared;review=3,6 -->
- [x] Design Status remains N/A because #5 exclusively owns RECIPE_DETAIL/editor UI and authority evidence <!-- omo:id=accept-personal-design-na;stage=2;scope=shared;review=3,6 -->

## Error / Wrapper

- [x] every success/failure uses `{ success, data, error }` and `{ code, message, fields[] }` <!-- omo:id=accept-personal-wrapper;stage=2;scope=backend;review=3,6 -->
- [x] 401/403/404/409/422/503 paths use only official public errors and preserve mutation-zero semantics <!-- omo:id=accept-personal-errors;stage=2;scope=backend;review=3,6 -->
- [x] capability-off behavior invents no stable public code or unsupported field/endpoint <!-- omo:id=accept-personal-no-contract-invention;stage=2;scope=backend;review=3,6 -->

## Data Setup / Verification

- [x] fixtures cover two owners, public/private/deleted/shared/legacy rows, G1/G2 lifecycle and image/tag/product provenance <!-- omo:id=accept-personal-fixtures;stage=2;scope=shared;review=3,6 -->
- [x] fresh/replay PostgreSQL tests prove policies, grants, triggers, functions, idempotency and lock/concurrency behavior <!-- omo:id=accept-personal-postgres;stage=2;scope=backend;review=3,6 -->
- [x] real local Supabase role matrix and before/after digests prove all denied paths are unchanged <!-- omo:id=accept-personal-real-db;stage=2;scope=backend;review=3,6 -->
- [ ] merged-exact-SHA server-production/local-rehearsal verifier is read-only and production capability remains off until the approved release gate <!-- omo:id=accept-personal-remote;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal1.5, security/DB, five-axis, Stage 3 and closeout reviews have zero unresolved required findings <!-- omo:id=accept-personal-independent-review;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation/review sessions; service owner for the future R+2 activation decision
- environment: local Supabase for write tests; merged-exact-SHA server-production/local-rehearsal read-only inventory; production mutation/flag changes excluded until the release gate
- scenarios: two-owner non-disclosure, session-generation race, public-source immutable fork, same-ID save/new-ID save, soft delete/history, image/tag atomicity, capability-off legacy compatibility

## Automation Split

### Vitest / PostgreSQL

- [x] route/service tests cover request wrapper, official errors, identity modes, provenance and replay <!-- omo:id=accept-personal-vitest;stage=2;scope=backend;review=3,6 -->
- [x] DB tests cover RLS/ACL/direct-DML denial, common locks, revision races, cleanup and immutable snapshots <!-- omo:id=accept-personal-db-tests;stage=2;scope=backend;review=3,6 -->

### E2E / Release

- [ ] after #5/#7/#8 integration, E2E proves public fork/new ID, same-ID edit, explicit new ID, delete/history and rollback behavior <!-- omo:id=accept-personal-e2e;stage=2;scope=shared;review=3,6 -->
  - Composed E2E evidence exists (`same-ID save` + pinned readers + capability-off drain), but public fork/new ID and save-as-new/new ID are still unimplemented, so the full gate stays open.
- [x] current-head PR checks and post-merge QA/Policy/Security/Vercel are terminal green or intended skip <!-- omo:id=accept-personal-ci;stage=2;scope=shared;review=3,6 -->

### Manual Only

- [ ] production R+2 joint capability activation is performed only after service-owner approval of #8 R/R+1 compatibility evidence
