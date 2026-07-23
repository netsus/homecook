# Acceptance Checklist

> Evidence is checked only after the owning implementation/review stage produces it. This Stage 1 document locks future tests and rollout boundaries; it does not claim migration, compatibility-release, browser or remote-verifier artifacts already exist.

## Snapshot Authority

- [ ] content stores title/base servings/canonical ingredients/product provenance/steps plus exact nullable nutrition snapshot ID and no nutrition vector/status/quality/warnings/sources copy <!-- omo:id=accept-snapshot-content-only;stage=2;scope=backend;review=3,6 -->
- [ ] `recipe_nutrition_snapshots` alone owns base servings, scalable/fixed vectors, nutrient status/quality, warnings and sources <!-- omo:id=accept-snapshot-nutrition-only;stage=2;scope=backend;review=3,6 -->
- [ ] same recipe/content/nutrition/schema reuses one snapshot with NULLS NOT DISTINCT; different nutrition ID produces a different immutable snapshot <!-- omo:id=accept-snapshot-dedupe;stage=2;scope=backend;review=3,6 -->
- [ ] content with nullable nutrition ID remains unavailable and never falls back to current nutrition <!-- omo:id=accept-snapshot-null-nutrition;stage=2;scope=backend;review=3,6 -->
- [ ] `scalable × cooking_servings / base_servings + fixed` applies fixed once and preserves partial/unavailable/missing-not-zero <!-- omo:id=accept-snapshot-formula;stage=2;scope=backend;review=3,6 -->

## Existing Nutrition Contract

- [ ] nutrition `recipe_id` remains NOT NULL with ON DELETE RESTRICT <!-- omo:id=accept-snapshot-nutrition-fk;stage=2;scope=backend;review=3,6 -->
- [ ] ordinary `(recipe_id,input_hash,calculation_version)` unique and predicate-free writer ON CONFLICT remain paired <!-- omo:id=accept-snapshot-conflict;stage=2;scope=backend;review=3,6 -->
- [ ] current `(recipe_id) WHERE is_current` partial unique remains and no partial history unique or detached recipe path is introduced <!-- omo:id=accept-snapshot-current-index;stage=2;scope=backend;review=3,6 -->

## Ownership / Immutability / Delete

- [ ] private content/nutrition owner equals recipe owner and both snapshot recipe IDs match; mismatch creates zero rows <!-- omo:id=accept-snapshot-private-owner;stage=2;scope=backend;review=3,6 -->
- [ ] public/shared content and nutrition are owner-null shared rows without per-user duplication <!-- omo:id=accept-snapshot-public-neutral;stage=2;scope=backend;review=3,6 -->
- [ ] anon/authenticated/service-role direct snapshot update/delete and generic cleanup fail; only allowlisted nutrition writer current switch remains <!-- omo:id=accept-snapshot-direct-mutation;stage=2;scope=backend;review=3,6 -->
- [ ] personal soft delete preserves recipe/snapshot/history FKs, blocks new snapshot/current transition and internal restore reuses immutable identity <!-- omo:id=accept-snapshot-soft-delete;stage=2;scope=backend;review=3,6 -->
- [ ] session-generation-bound account cleanup alone follows `Meal event pointer → event → meal log/non-image idempotency → claim → session-meal → session → Meal → batch → private content → private nutrition → private recipe → private-product references/link/version/profile/product` while preserving public/shared rows <!-- omo:id=accept-snapshot-account-delete;stage=2;scope=backend;review=3,6 -->

## Meal Expand / Mirror / Contract

- [ ] content-aware reader is deployed before backfill and content pin always wins over direct N/current recipe/current nutrition <!-- omo:id=accept-snapshot-reader-first;stage=2;scope=backend;review=3,6 -->
- [ ] eligible `registered|shopping_done` rows receive idempotent content backfill without changing existing direct N <!-- omo:id=accept-snapshot-backfill;stage=2;scope=backend;review=3,6 -->
- [ ] missing historical detail uses current projection only with `legacy_backfill/당시 상세 내용 미보존` provenance and preserves N <!-- omo:id=accept-snapshot-legacy-backfill;stage=2;scope=backend;review=3,6 -->
- [ ] compatibility direct N is DB-derived null-or-equal to content.N; mismatch and client selection/change fail at commit <!-- omo:id=accept-snapshot-mirror;stage=2;scope=backend;review=3,6 -->
- [ ] only content-null legacy rows use direct-N fallback; content-aware error/mismatch does not fall back <!-- omo:id=accept-snapshot-legacy-fallback;stage=2;scope=backend;review=3,6 -->
- [ ] current+immediate-previous content-aware, one full release old-shape/direct-only write 0 and backfill/pair mismatch 0 are required before contract <!-- omo:id=accept-snapshot-contract-gate;stage=2;scope=shared;review=3,6 -->
- [ ] contract migration nulls direct N/origin and validates `content non-null → direct/origin null`, `content null → content origin null` <!-- omo:id=accept-snapshot-xor;stage=2;scope=backend;review=3,6 -->
- [ ] after contract, rollback below the content-aware release and direct-pointer recreation migration are rejected <!-- omo:id=accept-snapshot-rollback-floor;stage=2;scope=shared;review=3,6 -->

## Session / Batch Foundation

- [ ] existing cooking sessions remain `legacy_v1`; remote orphan/mixed rows are reported without fabricated snapshot-v2 backfill <!-- omo:id=accept-snapshot-session-legacy;stage=2;scope=backend;review=3,6 -->
- [ ] snapshot-v2 alone requires planner/standalone kind, recipe/content pin, cooking servings and standalone expected revision under conditional checks <!-- omo:id=accept-snapshot-session-shape;stage=2;scope=backend;review=3,6 -->
- [ ] planner has at least one session-meal with start-time Meal revision and matching recipe/content; standalone has zero session-meal rows <!-- omo:id=accept-snapshot-session-meals;stage=2;scope=backend;review=3,6 -->
- [ ] `cooking_session_meal_claims.meal_id` PK permits at most one active attempt per Meal and preserves session/owner/claimed-at provenance <!-- omo:id=accept-snapshot-meal-claim;stage=2;scope=backend;review=3,6 -->
- [ ] generation-scoped v2 start/cancel/complete idempotency replays same key+payload once, rejects different payload/cross-generation reuse and exposes no UUID-only path <!-- omo:id=accept-snapshot-session-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] snapshot-v2 content pin is immutable and later completion consumes persisted session identity instead of mutable recipe current <!-- omo:id=accept-snapshot-session-pin;stage=2;scope=backend;review=3,6 -->
- [ ] v2 leftover/batch pins one content snapshot and cooking servings with no direct nutrition snapshot FK <!-- omo:id=accept-snapshot-batch-content-only;stage=2;scope=backend;review=3,6 -->

## Reader / Compatibility

- [ ] Meal/planner/planner-nutrition compatibility, shopping and existing cooking/history readers use content when present <!-- omo:id=accept-snapshot-reader-map;stage=2;scope=backend;review=3,6 -->
- [ ] compatibility `GET /planner/nutrition` remains one release and is removed only by a separate tombstone contract <!-- omo:id=accept-snapshot-planner-nutrition-floor;stage=2;scope=backend;review=3,6 -->
- [ ] content-pinned title/ingredients/steps/nutrition stay unchanged after recipe edit, nutrition current switch or soft delete <!-- omo:id=accept-snapshot-history-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] this slice adds no new screen/layout/CTA/servings control; PLANNER_WEEK/COOK_MODE/RECIPE_DETAIL design stays with owning successors <!-- omo:id=accept-snapshot-ui-ownership;stage=4;scope=frontend;review=5,6 -->

## Verification / Delivery

- [ ] Stage 1 runs only current docs validators, focused workflow tests, lint/typecheck, local dependency audit and diff check; current-head workflows are observed separately <!-- omo:id=accept-snapshot-stage1-gate;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 2 writes focused tests first and records RED before migration, trigger, reader, backfill or cleanup implementation <!-- omo:id=accept-snapshot-tdd-red;stage=2;scope=backend;review=3,6 -->
- [ ] PostgreSQL existing/fresh/replay covers FK/unique/check/trigger/grant, writer conflict, backfill/mirror/XOR and account cleanup order <!-- omo:id=accept-snapshot-postgres;stage=2;scope=backend;review=3,6 -->
- [ ] current/immediate-previous rollback smoke and old-shape zero telemetry are recorded for the exact compatibility release <!-- omo:id=accept-snapshot-release-evidence;stage=2;scope=shared;review=3,6 -->
- [ ] merged-exact-SHA remote verifier is read-only before approved contract/null cutover <!-- omo:id=accept-snapshot-remote;stage=2;scope=shared;review=3,6 -->
- [ ] Train B integration keeps #3 Storage cleanup/outbox and #2 effective pantry ingredient regressions green <!-- omo:id=accept-snapshot-train-b;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal 1.5, security/DB and five-axis reviewers finish with required findings zero <!-- omo:id=accept-snapshot-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [ ] Draft→Ready and every started current-head check finishes success or documented normal skip before squash merge <!-- omo:id=accept-snapshot-current-head;stage=2;scope=shared;review=3,6 -->
