# Acceptance Checklist

> This checkpoint records the independently approved and merged Stage 2/3 backend scope. Unchecked items do not claim #12 UI, future-smoke relock, merged-exact server-production/local-rehearsal verification, independent post-merge/release review, or production activation.
> Official authority is the current tuple `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37` and the Cooking Plan / Meal Log master-plan lineage SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines.

## Schema / Ownership

- [x] `meal_log_entries` is owner+generation scoped and RLS-isolated <!-- omo:id=accept-meal-log-owner-generation;stage=2;scope=backend;review=3,6 -->
- [x] source type is exact-one `cooked_batch|food_product|ingredient` with matching evidence FKs <!-- omo:id=accept-meal-log-source-exact-one;stage=2;scope=backend;review=3,6 -->
- [x] consumed_at is nullable while local date, validated IANA zone and slot snapshot are required <!-- omo:id=accept-meal-log-time-schema;stage=2;scope=backend;review=3,6 -->
- [x] meal column FK is nullable `ON DELETE SET NULL` and deleted-slot history retains the snapshot <!-- omo:id=accept-meal-log-slot-snapshot;stage=2;scope=backend;review=3,6 -->
- [x] active event pointer uses `ON DELETE RESTRICT` and is null for product/ingredient entries <!-- omo:id=accept-meal-log-event-pointer-schema;stage=2;scope=backend;review=3,6 -->
- [x] deferred constraint verifies active batch entry, owner/batch and non-reversed event identity at commit <!-- omo:id=accept-meal-log-event-pointer-constraint;stage=2;scope=backend;review=3,6 -->
- [x] ordinary delete is soft and account cleanup alone may hard-delete in official pointer→event→entry order <!-- omo:id=accept-meal-log-soft-delete;stage=2;scope=backend;review=3,6 -->
- [x] authenticated direct hard delete, pointer edit, evidence edit and event/batch protected DML are denied <!-- omo:id=accept-meal-log-direct-dml-denied;stage=2;scope=backend;review=3,6 -->

## Stored Date / Slot Reads

- [x] day reads filter non-deleted owner rows by stored consumed_local_date exact match <!-- omo:id=accept-meal-log-local-date-read;stage=2;scope=backend;review=3,6 -->
- [x] current device/profile timezone never regroups historical entries <!-- omo:id=accept-meal-log-no-regroup;stage=2;scope=backend;review=3,6 -->
- [x] present consumed_at converts in the stored IANA zone to the same local date <!-- omo:id=accept-meal-log-date-timezone-match;stage=2;scope=backend;review=3,6 -->
- [x] unknown past instant remains null and is never fabricated from noon/midnight defaults <!-- omo:id=accept-meal-log-null-instant;stage=2;scope=backend;review=3,6 -->
- [x] active columns keep configured order and deleted columns render snapshot-only sections <!-- omo:id=accept-meal-log-slot-sections;stage=2;scope=backend;review=3,6 -->
- [x] deleted columns cannot be new-write targets <!-- omo:id=accept-meal-log-deleted-slot-write-denied;stage=2;scope=backend;review=3,6 -->
- [x] recent/frequent returns only owner/generation accessible exact sources with opaque stable cursor <!-- omo:id=accept-meal-log-recent-safe;stage=2;scope=backend;review=3,6 -->

## Create

- [x] POST requires a UUID Idempotency-Key and generation-scoped canonical payload hash <!-- omo:id=accept-meal-log-create-key;stage=2;scope=backend;review=3,6 -->
- [x] server pins slot, display identity and exact nutrition evidence; client evidence JSON is not authority <!-- omo:id=accept-meal-log-server-pin;stage=2;scope=backend;review=3,6 -->
- [x] batch create locks owner known+available batch and checks enough remaining <!-- omo:id=accept-meal-log-batch-bounds;stage=2;scope=backend;review=3,6 -->
- [x] batch entry, consumed event, active pointer, replay projection and operation result commit in one RPC <!-- omo:id=accept-meal-log-batch-create-atomic;stage=2;scope=backend;review=3,6 -->
- [x] product create pins selected exact nutrition version and direct basis relation <!-- omo:id=accept-meal-log-product-evidence;stage=2;scope=backend;review=3,6 -->
- [x] ingredient create pins approved profile and exact conversion or piece evidence <!-- omo:id=accept-meal-log-ingredient-evidence;stage=2;scope=backend;review=3,6 -->
- [x] missing conversion returns UNIT_CONVERSION_MISSING with entry/event zero <!-- omo:id=accept-meal-log-conversion-missing;stage=2;scope=backend;review=3,6 -->
- [x] partial/unavailable evidence remains explicit and is never coerced to complete zero <!-- omo:id=accept-meal-log-create-incomplete;stage=2;scope=backend;review=3,6 -->

## Patch / Delete / Idempotency

- [x] PATCH requires a fresh UUID key and expected revision <!-- omo:id=accept-meal-log-patch-key-revision;stage=2;scope=backend;review=3,6 -->
- [x] POST malformed UUID Idempotency-Key returns exact `400 INVALID_IDEMPOTENCY_KEY` and leaves mutation/operation/entry/event/pointer/projection/aggregate at zero <!-- omo:id=accept-meal-log-post-invalid-idempotency-key;stage=2;scope=backend;review=3,6 -->
- [x] PATCH malformed UUID Idempotency-Key returns exact `400 INVALID_IDEMPOTENCY_KEY` and leaves mutation/operation/entry/event/pointer/projection/aggregate at zero <!-- omo:id=accept-meal-log-patch-invalid-idempotency-key;stage=2;scope=backend;review=3,6 -->
- [x] DELETE malformed UUID Idempotency-Key returns exact `400 INVALID_IDEMPOTENCY_KEY` and leaves mutation/operation/entry/event/pointer/projection/aggregate at zero <!-- omo:id=accept-meal-log-delete-invalid-idempotency-key;stage=2;scope=backend;review=3,6 -->
- [x] batch PATCH reverses its own current event, appends replacement and swaps pointer atomically <!-- omo:id=accept-meal-log-patch-event-swap;stage=2;scope=backend;review=3,6 -->
- [x] event identity, not order or equal amount, selects the reversal target <!-- omo:id=accept-meal-log-event-identity;stage=2;scope=backend;review=3,6 -->
- [x] source changes handle old batch reversal and new batch replacement in the same transaction <!-- omo:id=accept-meal-log-source-change-atomic;stage=2;scope=backend;review=3,6 -->
- [x] product/ingredient PATCH pins requested exact evidence and never silently uses mutable current rows <!-- omo:id=accept-meal-log-no-silent-repin;stage=2;scope=backend;review=3,6 -->
- [x] DELETE requires key+revision and atomically reverses own event, nulls pointer and soft-deletes <!-- omo:id=accept-meal-log-delete-atomic;stage=2;scope=backend;review=3,6 -->
- [x] same key/payload returns the stored compact result without duplicate entry or batch delta <!-- omo:id=accept-meal-log-replay;stage=2;scope=backend;review=3,6 -->
- [x] same key/different payload returns IDEMPOTENCY_KEY_REUSED with zero effect <!-- omo:id=accept-meal-log-key-reuse;stage=2;scope=backend;review=3,6 -->
- [x] stale revision/generation, concurrent remainder conflict and access denial leave all tables unchanged <!-- omo:id=accept-meal-log-conflict-zero-write;stage=2;scope=backend;review=3,6 -->

## Batch Replay / Legacy Projection

- [x] #8 row-lock RPC remains the only event/projection mutation authority <!-- omo:id=accept-meal-log-batch-rpc-authority;stage=2;scope=backend;review=3,6 -->
- [x] every batch entry mutation full-replays active events and validates bounds/checksum <!-- omo:id=accept-meal-log-full-replay;stage=2;scope=backend;review=3,6 -->
- [x] concurrent entries cannot over-consume or lose another entry's event <!-- omo:id=accept-meal-log-concurrent-consume;stage=2;scope=backend;review=3,6 -->
- [x] missing/unrecoverable batch rejects g entries and unweighed closure creates no entry/nutrition <!-- omo:id=accept-meal-log-unweighed-boundary;stage=2;scope=backend;review=3,6 -->
- [x] consumed-only first depletion may project eaten/auto-hide/XP once <!-- omo:id=accept-meal-log-consumed-projection;stage=2;scope=backend;review=3,6 -->
- [x] discard/mixed never projects eaten or XP <!-- omo:id=accept-meal-log-no-discard-xp;stage=2;scope=backend;review=3,6 -->
- [x] reversal may clear eaten/auto-hide but never retracts or repeats XP/activity <!-- omo:id=accept-meal-log-reversal-xp;stage=2;scope=backend;review=3,6 -->

## Nutrition / Aggregate

- [x] compact nutrition snapshot retains exact product version basis or ingredient profile/conversion IDs <!-- omo:id=accept-meal-log-nutrition-provenance;stage=2;scope=backend;review=3,6 -->
- [x] batch nutrition derives from #8 immutable content snapshot and original finished weight authority <!-- omo:id=accept-meal-log-batch-nutrition;stage=2;scope=backend;review=3,6 -->
- [x] mutable current recipe/product/profile changes do not rewrite historical entry nutrition <!-- omo:id=accept-meal-log-history-immutable;stage=2;scope=backend;review=3,6 -->
- [x] soft-deleted entries are excluded from slot/day aggregates <!-- omo:id=accept-meal-log-aggregate-delete;stage=2;scope=backend;review=3,6 -->
- [x] slot/day aggregates preserve complete/partial/unavailable and incomplete count <!-- omo:id=accept-meal-log-aggregate-state;stage=2;scope=backend;review=3,6 -->
- [x] day total equals visible slot subtotals without treating unavailable as zero <!-- omo:id=accept-meal-log-day-total;stage=2;scope=backend;review=3,6 -->

## Reader / Successor Boundaries

- [x] product/ingredient discovery consumes #1 single ranked typed union/cursor without client merge <!-- omo:id=accept-meal-log-search-reader;stage=2;scope=shared;review=3,6 -->
- [x] effective product/ingredient identity consumes #2 approved represents projection only <!-- omo:id=accept-meal-log-effective-ingredient;stage=2;scope=shared;review=3,6 -->
- [x] batch choices consume #8 owner read model without raw protected-column inference <!-- omo:id=accept-meal-log-batch-reader;stage=2;scope=shared;review=3,6 -->
- [ ] #10 alone owns Planner shell navigation <!-- omo:id=accept-meal-log-planner-shell-boundary;stage=4;scope=shared;review=6 -->
- [ ] #12 alone owns MEAL_LOG UI, sheets, recent/frequent UX and design authority <!-- omo:id=accept-meal-log-ui-boundary;stage=4;scope=shared;review=6 -->
- [x] weekly analysis, goals, medical advice and generalized free-text food remain out of scope <!-- omo:id=accept-meal-log-product-boundary;stage=2;scope=shared;review=3,6 -->

## Error / Contract Safety

- [x] responses retain official wrapper and exact public codes <!-- omo:id=accept-meal-log-wrapper;stage=2;scope=backend;review=3,6 -->
- [x] 401/404 preserve nondisclosure and all 400/409/422/428/503 failures are whole-operation zero-write <!-- omo:id=accept-meal-log-errors;stage=2;scope=backend;review=3,6 -->
- [x] no unofficial endpoint, source type, field, aggregate state, error or screen is introduced <!-- omo:id=accept-meal-log-no-contract-invention;stage=2;scope=shared;review=3,6 -->
- [x] implementation waits for #1+#2+#4+#8 runtime and required checks green <!-- omo:id=accept-meal-log-predecessors;stage=2;scope=shared;review=3,6 -->
- [x] no unmerged migration, external-provider mutation or production capability/flag change occurs <!-- omo:id=accept-meal-log-no-production-write;stage=2;scope=backend;review=3,6 -->

## Verification / Evidence

> Backend Ready uses the current executable `automation-spec.json#external_smokes=[]` while `.workflow-v2/work-items/meal-log-core.json#workflow.external_smokes` preserves the eight-item future lifecycle gate. Because #9 is backend-only, a fresh post-merge/release closeout actor must relock that current list before the merged-exact/manual/release items below can be checked or whole-lifecycle completion can be claimed. This sequencing is not a waiver.

- [x] Stage 1 claims only docs validators, focused tests, lint/typecheck, audit and diff <!-- omo:id=accept-meal-log-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [x] implementation records failing route/DB tests before production changes <!-- omo:id=accept-meal-log-tdd-red;stage=2;scope=shared;review=3,6 -->
- [x] PostgreSQL fresh/replay covers RLS, exact-one checks, deferred pointer, RPCs and cleanup <!-- omo:id=accept-meal-log-postgres;stage=2;scope=backend;review=3,6 -->
- [ ] A/B real DB digests prove nondisclosure, idempotency and zero-write failures <!-- omo:id=accept-meal-log-real-db;stage=2;scope=backend;review=3,6 -->
- [x] integration tests cover three sources, timezone/DST, evidence, aggregate and concurrent replay <!-- omo:id=accept-meal-log-integration;stage=2;scope=backend;review=3,6 -->
- [ ] local-first verifier is merged-exact-SHA server-production/local-rehearsal read-only and flags stay off until release gate <!-- omo:id=accept-meal-log-remote;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal1.5/security-DB/five-axis/Stage3/6 reviews have zero findings <!-- omo:id=accept-meal-log-independent-review;stage=2;scope=shared;review=3,6 -->
- [x] current-head PR and post-merge QA/Policy/Security/Vercel are green/intended skip <!-- omo:id=accept-meal-log-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation, security/DB, five-axis and release-review sessions
- environment: local Supabase/PostgreSQL, owner A/B, merged-exact-SHA server-production/local-rehearsal read-only; production flags excluded
- scenarios: three-source create/replay, batch edit/delete/interleaving, timezone/DST, slot deletion, exact evidence, aggregate states, account cleanup

### Manual Only

- [ ] production capability activation occurs only in the approved release train after predecessor and server-production/local-rehearsal evidence
