# Acceptance Checklist

> This Stage 1 document locks future backend, frontend integration and release evidence. Unchecked items do not claim that #4/#6 runtime, `cook-mode-whole-board`, migrations, RPCs, v2 routes, visual artifacts, server-production/local-rehearsal state or R+2 activation already exist.

## Impact Preview

- [x] `POST /recipes/{id}/future-plan-impact` accepts official `base_recipe_revision + full draft` and uses the same canonicalizer as PATCH <!-- omo:id=accept-future-preview-canonical;stage=2;scope=backend;review=3,6 -->
- [x] preview response contains only the official opaque token, expiry, proposed hash, Meal/date/shopping/claim summary and replace-all allowance <!-- omo:id=accept-future-preview-response;stage=2;scope=backend;review=3,6 -->
- [x] token state binds owner, generation, exact session, recipe, base revision, proposed content hash, target-set revision hash and claim/session tuple <!-- omo:id=accept-future-preview-binding;stage=2;scope=backend;review=3,6 -->
- [x] preview changes no recipe, content, Meal, shopping, claim or session row <!-- omo:id=accept-future-preview-no-write;stage=2;scope=backend;review=3,6 -->
- [x] direct client preview INSERT/UPDATE/DELETE is denied while owner+generation read and cleanup follow official RLS/TTL boundaries <!-- omo:id=accept-future-preview-rls;stage=2;scope=backend;review=3,6 -->
- [x] other-owner/deleted/quarantined recipe stays non-inferable and stale session/generation fails closed <!-- omo:id=accept-future-preview-nondisclosure;stage=2;scope=backend;review=3,6 -->

## PATCH / Strategy Atomicity

- [x] PATCH requires Authorization, UUID Idempotency-Key, previewed base revision, identical full draft, `replace_all|keep`, token and optional managed image ID <!-- omo:id=accept-future-patch-shape;stage=2;scope=backend;review=3,6 -->
- [x] one RPC locks preview and recomputes owner/session/expiry/revision/content/target/claim authority before any mutation <!-- omo:id=accept-future-patch-revalidation;stage=2;scope=backend;review=3,6 -->
- [x] expiry, recipe revision, draft hash or target-set drift returns exact `409 RECIPE_IMPACT_STALE` with every digest unchanged <!-- omo:id=accept-future-stale-zero-write;stage=2;scope=backend;review=3,6 -->
- [x] `keep` advances personal recipe current exactly once and preserves every existing Meal content pin <!-- omo:id=accept-future-keep;stage=2;scope=backend;review=3,6 -->
- [x] `replace_all` repins only eligible today-after non-cook-done future Meals to the new immutable content <!-- omo:id=accept-future-replace-all;stage=2;scope=backend;review=3,6 -->
- [x] any target active claim/session returns exact `409 MEAL_COOKING_ALREADY_STARTED`; no target is silently excluded and no write commits <!-- omo:id=accept-future-active-claim;stage=2;scope=backend;review=3,6 -->
- [x] past, cook-done, completed/cancelled session and past meal-log history are never repinned <!-- omo:id=accept-future-history-immutable;stage=2;scope=shared;review=3,6 -->
- [x] same key+payload returns the first durable wrapper/status; different payload returns `409 IDEMPOTENCY_KEY_REUSED` with mutation zero <!-- omo:id=accept-future-patch-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] PATCH success `data` is exactly `{id,revision}`; server-only snapshot, generation, target and reconcile evidence is not exposed <!-- omo:id=accept-future-patch-success-data;stage=2;scope=backend;review=3,6 -->
- [x] DELETE success `data` is exactly `{id,revision,deleted_at}` and replay returns the first durable revision/timestamp <!-- omo:id=accept-future-delete-success-data;stage=2;scope=backend;review=3,6 -->

## Common Lock / Writer Inventory

- [x] every personal writer verifies exact JWT session binding, identity epoch, current active generation and capability inside its final transaction <!-- omo:id=accept-future-session-generation;stage=2;scope=backend;review=3,6 -->
- [x] global shared fence→owner lifecycle→recipe UUID→Meal UUID→resource order is common to recipe, Meal, shopping and session-attempt writers <!-- omo:id=accept-future-lock-order;stage=2;scope=backend;review=3,6 -->
- [ ] multi-recipe shopping acquires recipe locks in UUID order and concurrent tests show no deadlock or stale post-preview Meal insertion <!-- omo:id=accept-future-multi-recipe-locks;stage=2;scope=backend;review=3,6 -->
- [x] recipe PATCH/soft DELETE/future restore and future Meal create/update/delete are single-RPC final writes <!-- omo:id=accept-future-writer-rpcs;stage=2;scope=backend;review=3,6 -->
- [x] no route calls a lock-only RPC and then performs REST INSERT/UPDATE/DELETE <!-- omo:id=accept-future-no-split-write;stage=2;scope=backend;review=3,6 -->
- [x] direct table privileges/guards are tightened only after the complete writer inventory is converted and regression-green <!-- omo:id=accept-future-writer-cutover;stage=2;scope=backend;review=3,6 -->

## Shopping / Grouping

- [x] incomplete shopping reconcile runs in the PATCH transaction and is deterministic on replay <!-- omo:id=accept-future-shopping-atomic;stage=2;scope=backend;review=3,6 -->
- [x] same ingredient/unit checked and pantry-excluded state is preserved, new item is unchecked and an unneeded item is removed only when no Meal needs it <!-- omo:id=accept-future-shopping-state;stage=2;scope=backend;review=3,6 -->
- [x] completed shopping list and item rows are read-only and bit-for-bit unchanged for keep, replace-all and retry paths <!-- omo:id=accept-future-completed-shopping;stage=2;scope=backend;review=3,6 -->
- [ ] UI states that completed shopping history does not change while cooking follows the pinned Meal content <!-- omo:id=accept-future-completed-shopping-copy;stage=4;scope=frontend;review=5,6 -->
- [x] planning/shopping grouping uses `(recipe_id, recipe_content_snapshot_id)` and never merges old/new content by recipe ID alone <!-- omo:id=accept-future-grouping-key;stage=2;scope=shared;review=3,6 -->

## Snapshot-v2 Start

- [x] planner and standalone official request bodies use separate `mode` parsers and require UUID Idempotency-Key <!-- omo:id=accept-future-start-shapes;stage=2;scope=backend;review=3,6 -->
- [x] planner start locks recipe then Meal UUIDs and revalidates owner/status/revision/no-claim/same recipe/same non-null content <!-- omo:id=accept-future-planner-validation;stage=2;scope=backend;review=3,6 -->
- [x] planner session copies each Meal's existing content pin and planned servings without reading mutable recipe current <!-- omo:id=accept-future-planner-pin;stage=2;scope=backend;review=3,6 -->
- [x] planner start creates session, session-meal rows and one active claim per Meal atomically <!-- omo:id=accept-future-planner-claim;stage=2;scope=backend;review=3,6 -->
- [x] concurrent attempts for the same Meal produce one winner and no duplicate claim/session/downstream effect <!-- omo:id=accept-future-concurrent-start;stage=2;scope=backend;review=3,6 -->
- [x] standalone start alone pins current content after access, deleted-state and expected recipe revision validation under recipe lock <!-- omo:id=accept-future-standalone-pin;stage=2;scope=backend;review=3,6 -->
- [x] start success `data` is exactly `{session_id,contract_version:"snapshot_v2",mode,status:"in_progress",content_summary:{recipe_id,title,cooking_servings}}` <!-- omo:id=accept-future-start-response;stage=2;scope=backend;review=3,6 -->
- [ ] UI waits for the exact start success response before any COOK_MODE navigation <!-- omo:id=accept-future-start-navigation;stage=4;scope=frontend;review=5,6 -->
- [x] creation flag off returns exact `409 SNAPSHOT_V2_CREATION_DISABLED` with session/claim mutation zero outside the official internal/test allowlist <!-- omo:id=accept-future-creation-disabled;stage=2;scope=backend;review=3,6 -->

## Read / Cancel / Dispatch

- [x] v2 cook-mode GET reads immutable session content/servings/steps/pantry candidates and never mutable current recipe <!-- omo:id=accept-future-v2-read;stage=2;scope=backend;review=3,6 -->
- [x] v2 cook-mode success `data` is exactly `{session_id,contract_version,mode,status,recipe,pantry_candidates}` and recipe reuses the existing `CookingModeRecipe` ingredient/step field shapes <!-- omo:id=accept-future-read-success-data;stage=2;scope=backend;review=3,6 -->
- [x] each pantry candidate is exactly `{pantry_item_id,ingredient_id,item_type,standard_name,food_product_id,food_product_nutrition_version_id,name,brand}` with generic null product/version and selected-product exact version provenance <!-- omo:id=accept-future-pantry-candidate-data;stage=2;scope=backend;review=3,6 -->
- [x] owner in-progress v2 cancel is idempotent and releases planner claims in the same transaction <!-- omo:id=accept-future-v2-cancel;stage=2;scope=backend;review=3,6 -->
- [x] cancel success `data` is exactly `{session_id,contract_version:"snapshot_v2",mode,status:"cancelled"}` and replay returns the same durable shape <!-- omo:id=accept-future-cancel-success-data;stage=2;scope=backend;review=3,6 -->
- [x] completed/cancelled cancel replay returns stored result without reopening state or releasing another claim <!-- omo:id=accept-future-cancel-replay;stage=2;scope=backend;review=3,6 -->
- [x] v1 endpoint/parser/reader accepts only `legacy_v1` and v2 namespace accepts only `snapshot_v2`; cross-version IDs use official 404/409 <!-- omo:id=accept-future-version-isolation;stage=2;scope=shared;review=3,6 -->
- [ ] UI dispatches from explicit `contract_version`, never body-shape inference, and preserves existing v1 body/response/consumed-ingredient semantics <!-- omo:id=accept-future-ui-dispatch;stage=4;scope=frontend;review=5,6 -->
- [x] creation rollback blocks new v2 starts while existing seeded v2 read/cancel and later #8 complete continue to drain <!-- omo:id=accept-future-rollback-drain;stage=2;scope=shared;review=3,6 -->

## UI / Design / Accessibility

- [ ] impact dialog shows future Meal/date range, incomplete/completed shopping counts and active claim count <!-- omo:id=accept-future-impact-summary-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] dialog exposes only `전체 반영 | 기존 계획 유지`; no per-date checkbox, extra shopping or old-recipe cooking action exists <!-- omo:id=accept-future-two-strategy-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] loading keeps save actions disabled, empty explicitly shows zero impact, and errors never close as success <!-- omo:id=accept-future-impact-states;stage=4;scope=frontend;review=5,6 -->
- [ ] active claim disables replace-all with associated reason while keep remains selectable <!-- omo:id=accept-future-claim-disabled-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] stale/claim 409 keeps the dialog open and moves focus to latest-impact recheck action <!-- omo:id=accept-future-impact-recheck-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] planner/standalone start pending disables duplicate action and retains the current screen until session ID/version succeeds <!-- omo:id=accept-future-start-pending-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] v2 read error never falls back to mutable recipe or cross-version parser; terminal session is read-only <!-- omo:id=accept-future-cookmode-fail-closed;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL and PLANNER_WEEK anchor plus COOK_MODE high-risk wireframes receive independent design critique before implementation <!-- omo:id=accept-future-design-critic;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px screenshots or Figma frames prove dialog/start/dispatch/loading/error/read-only states without overflow or keyboard/focus defects <!-- omo:id=accept-future-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] product-design-authority report has blocker/major findings zero before Design Status becomes confirmed <!-- omo:id=accept-future-design-authority;stage=4;scope=frontend;review=5,6 -->

## Successor / Release Boundary

- [x] #7 owns dormant v2 start/cancel/read and version dispatch only; exact pantry complete/weight/batch/XP effects remain #8 <!-- omo:id=accept-future-complete-boundary;stage=2;scope=shared;review=3,6 -->
- [x] #7 does not require seeded full-drain release or completion UI as its acceptance condition <!-- omo:id=accept-future-no-preclaim;stage=2;scope=shared;review=3,6 -->
- [x] current and immediate-previous clients keep legacy v1 behavior and create zero new personal/v2 rows while flags are off <!-- omo:id=accept-future-compat-zero-write;stage=2;scope=shared;review=3,6 -->
- [ ] #8 R and R+1 seeded-v2 drain evidence is green before R+2 jointly enables personal recipe and v2 start creation <!-- omo:id=accept-future-r2-gate;stage=2;scope=shared;review=3,6 -->
- [x] v1 required-key cutover/start block/removal remains #13 and requires its own telemetry/tombstone contract <!-- omo:id=accept-future-v1-boundary;stage=2;scope=shared;review=3,6 -->

## Error / Wrapper

- [x] every response uses `{ success, data, error }` and `{ code, message, fields[] }` <!-- omo:id=accept-future-wrapper;stage=2;scope=backend;review=3,6 -->
- [x] exact public `RECIPE_IMPACT_STALE`, `MEAL_COOKING_ALREADY_STARTED`, `IDEMPOTENCY_KEY_REUSED` and `SNAPSHOT_V2_CREATION_DISABLED` are not aliased by internal reasons <!-- omo:id=accept-future-exact-errors;stage=2;scope=backend;review=3,6 -->
- [x] 401/404/409/422/503 paths preserve non-disclosure and mutation-zero semantics without unofficial field/status/code invention <!-- omo:id=accept-future-no-contract-invention;stage=2;scope=backend;review=3,6 -->

## Verification / Evidence

- [x] Stage 1 claims only docs validators, focused workflow tests, lint/typecheck, audit and diff check <!-- omo:id=accept-future-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [x] Stage 2 first records failing route/DB tests before backend production changes <!-- omo:id=accept-future-tdd-red;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 4 first records failing component tests before frontend production changes <!-- omo:id=accept-future-component-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [x] fresh/replay PostgreSQL tests cover preview RLS/ACL, locks, idempotency, claim concurrency and full rollback <!-- omo:id=accept-future-postgres;stage=2;scope=backend;review=3,6 -->
- [ ] real local Supabase two-owner matrix and before/after digests prove denied/stale/claim paths are unchanged <!-- omo:id=accept-future-real-db;stage=2;scope=backend;review=3,6 -->
- [ ] E2E covers keep/replace-all, shopping read-only, stale preview, same-Meal concurrent start, cancel/restart and historical snapshot invariance <!-- omo:id=accept-future-e2e;stage=4;scope=frontend;review=5,6 -->
- [ ] merged-exact-SHA server-production/local-rehearsal verifier is read-only and production flags remain off until approved release gate <!-- omo:id=accept-future-remote;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal1.5, security/DB, five-axis, Stage 3/6 and closeout reviews have zero unresolved backend findings <!-- omo:id=accept-future-independent-review;stage=2;scope=shared;review=3,6 -->
- [ ] independent design, Stage 5/6 and closeout reviews have zero unresolved frontend findings <!-- omo:id=accept-future-independent-frontend-review;stage=4;scope=frontend;review=5,6 -->
- [ ] current-head PR checks and post-merge QA/Policy/Security/Vercel are terminal green or intended skip <!-- omo:id=accept-future-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation/review/design sessions; service owner for the future R+2 activation decision
- environment: local Supabase for write/concurrency tests; merged-exact-SHA server-production/local-rehearsal read-only inventory; 390px/320px browser evidence; production mutation/flag changes excluded until release gate
- scenarios: fresh/stale preview, keep, replace-all, active claim, completed shopping, same-Meal start race, cancel/restart, v1/v2 dispatch, creation-off seeded drain and historical pin stability

## Automation Split

### Vitest / PostgreSQL

- [x] route/service tests cover official bodies/wrappers/errors, canonical preview and idempotent replay <!-- omo:id=accept-future-vitest;stage=2;scope=backend;review=3,6 -->
- [x] DB tests cover preview RLS/ACL, transaction locks, target hash, shopping reconcile, claim uniqueness and rollback <!-- omo:id=accept-future-db-tests;stage=2;scope=backend;review=3,6 -->

### Component / E2E / Design

- [ ] component tests cover impact states, two-choice semantics, start-before-navigation and explicit version dispatch <!-- omo:id=accept-future-component;stage=4;scope=frontend;review=5,6 -->
- [ ] visual/a11y/exploratory and authority evidence is captured at exact implementation head <!-- omo:id=accept-future-frontend-evidence;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] production R+2 joint capability activation is performed only after service-owner approval of #8 R/R+1 compatibility evidence
