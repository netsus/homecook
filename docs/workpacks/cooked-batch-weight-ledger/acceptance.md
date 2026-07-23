# Acceptance Checklist

> This Stage 1 document locks future backend, functional COOK_MODE and release evidence. Unchecked items do not claim that #7 runtime, `cook-mode-whole-board`, migrations, RPCs, seeded drain, visual evidence or R+2 activation already exist.

## Snapshot-v2 Completion

- [ ] complete requires owner in-progress `snapshot_v2` session and UUID Idempotency-Key <!-- omo:id=accept-batch-complete-session;stage=2;scope=backend;review=3,6 -->
- [ ] exact-one weight action accepts positive food-only finished g or weigh-later null g <!-- omo:id=accept-batch-complete-weight;stage=2;scope=backend;review=3,6 -->
- [ ] exact product pin consumes only the matching owner product pantry row <!-- omo:id=accept-batch-product-row;stage=2;scope=backend;review=3,6 -->
- [ ] generic pin accepts only generic or approved effective-ingredient product row <!-- omo:id=accept-batch-generic-row;stage=2;scope=backend;review=3,6 -->
- [ ] duplicate/missing/other-owner/mismatched selection changes no pantry or completion state <!-- omo:id=accept-batch-pantry-denial;stage=2;scope=backend;review=3,6 -->
- [ ] selected rows alone are deleted and equivalent unselected rows remain <!-- omo:id=accept-batch-selected-only;stage=2;scope=backend;review=3,6 -->
- [ ] pantry, batch, initial ledger, session, claim, Meal, cook-count and XP commit once in one RPC <!-- omo:id=accept-batch-complete-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] same key/payload replays first result and different payload returns exact 409 with zero effect <!-- omo:id=accept-batch-complete-idempotency;stage=2;scope=backend;review=3,6 -->

## Batch / Nutrition Authority

- [ ] v2 batch pins exact content snapshot and cooking servings without direct nutrition FK/vector duplication <!-- omo:id=accept-batch-content-only;stage=2;scope=backend;review=3,6 -->
- [ ] known/missing/unrecoverable and available/depleted/reason checks are mutually consistent <!-- omo:id=accept-batch-state-checks;stage=2;scope=backend;review=3,6 -->
- [ ] known weights obey `0<=remaining<=finished`; missing/unrecoverable weights are null <!-- omo:id=accept-batch-weight-bounds;stage=2;scope=backend;review=3,6 -->
- [ ] batch nutrition uses scalable×servings/base+fixed once and preserves partial/unavailable <!-- omo:id=accept-batch-nutrition-formula;stage=2;scope=backend;review=3,6 -->
- [ ] mutable recipe current, servings-to-g inference and missing-to-zero fallback are forbidden <!-- omo:id=accept-batch-no-guessing;stage=2;scope=backend;review=3,6 -->

## Weight / Ledger State Machine

- [ ] delayed finished weight accepts only original food-only total on missing+available with zero events <!-- omo:id=accept-batch-delayed-weight;stage=2;scope=backend;review=3,6 -->
- [ ] missing→unrecoverable is idempotent append-only and irreversible <!-- omo:id=accept-batch-mark-unrecoverable;stage=2;scope=backend;review=3,6 -->
- [ ] unrecoverable weight/restore/marker reversal returns `WEIGHT_UNRECOVERABLE` with no change <!-- omo:id=accept-batch-unrecoverable-error;stage=2;scope=backend;review=3,6 -->
- [ ] consumed/discarded/adjustment/marked/closed/reversal events are append-only and directly immutable <!-- omo:id=accept-batch-event-immutability;stage=2;scope=backend;review=3,6 -->
- [ ] operation ID/ordinal and target reversal uniqueness prevent duplicate effects <!-- omo:id=accept-batch-event-uniqueness;stage=2;scope=backend;review=3,6 -->
- [ ] row-lock RPC full-replays active events and validates cached projection/checksum <!-- omo:id=accept-batch-replay-checksum;stage=2;scope=backend;review=3,6 -->
- [ ] discard never exceeds remaining and derives depleted reason from all active consume/discard events <!-- omo:id=accept-batch-discard;stage=2;scope=backend;review=3,6 -->
- [ ] adjustment requires reason and leaves `0<remaining<=finished` without depletion/reopen bypass <!-- omo:id=accept-batch-adjust;stage=2;scope=backend;review=3,6 -->
- [ ] unweighed close requires missing/unrecoverable+available and makes no nutrition/meal-log entry <!-- omo:id=accept-batch-close-unweighed;stage=2;scope=backend;review=3,6 -->
- [ ] cancel-current reverses only latest active closed-unweighed with no later event and never marker <!-- omo:id=accept-batch-cancel-current;stage=2;scope=backend;review=3,6 -->

## Reader / Legacy Compatibility

- [ ] every leftover reader switches to new read model before direct protected update is revoked <!-- omo:id=accept-batch-reader-first;stage=2;scope=shared;review=3,6 -->
- [ ] existing server mutations move to row-lock RPC before grant/policy/guard cutover <!-- omo:id=accept-batch-writer-cutover;stage=2;scope=backend;review=3,6 -->
- [ ] legacy eaten projection is limited to consumed/consumed_unweighed <!-- omo:id=accept-batch-legacy-eaten;stage=2;scope=backend;review=3,6 -->
- [ ] discard/mixed never grants eaten/auto-hide/leftover-eaten XP <!-- omo:id=accept-batch-no-false-eaten;stage=2;scope=backend;review=3,6 -->
- [ ] reversal clears eaten/auto-hide without XP retraction or repeat award <!-- omo:id=accept-batch-xp-reversal;stage=2;scope=backend;review=3,6 -->
- [ ] existing rows keep nullable content/weight and receive no fabricated grams/content <!-- omo:id=accept-batch-legacy-nullable;stage=2;scope=backend;review=3,6 -->
- [ ] account cleanup clears meal-event links then events before batch hard delete in exact order <!-- omo:id=accept-batch-account-cleanup;stage=2;scope=backend;review=3,6 -->

## COOK_MODE Functional UI

- [ ] actual pantry row product/brand identity and row selection are visible <!-- omo:id=accept-batch-ui-row-identity;stage=4;scope=frontend;review=5,6 -->
- [ ] no exact eligible row keeps complete disabled and no equivalent row is auto-selected <!-- omo:id=accept-batch-ui-no-guess;stage=4;scope=frontend;review=5,6 -->
- [ ] UI offers only original food-only g or weigh-later and excludes container/current remainder <!-- omo:id=accept-batch-ui-weight-action;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error fail closed, submit is deduped and 409/422 preserves selections/focus <!-- omo:id=accept-batch-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] stored replay result closes once without repeating effects <!-- omo:id=accept-batch-ui-replay;stage=4;scope=frontend;review=5,6 -->
- [ ] canonical COOK_MODE design doc and independent critic pass before Stage 2 implementation <!-- omo:id=accept-batch-ui-design-critic;stage=2;scope=frontend;review=5,6 -->
- [ ] 390px/320px screenshots/Figma and scoped design authority pass before R <!-- omo:id=accept-batch-ui-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] #11 retains final LEFTOVERS/design/accessibility ownership without duplicate API/mutation <!-- omo:id=accept-batch-ui-successor;stage=4;scope=shared;review=5,6 -->

## Release / v1-v2 Boundary

- [ ] R and R+1 prove current+previous seeded v2 read/cancel/complete drain with new writes zero <!-- omo:id=accept-batch-r-r1-drain;stage=2;scope=shared;review=3,6 -->
- [ ] R+2 alone jointly enables personal recipe and v2 creation after service-owner approval <!-- omo:id=accept-batch-r2-activation;stage=2;scope=shared;review=3,6 -->
- [ ] rollback blocks new creation but preserves existing v2 read/cancel/complete and rows <!-- omo:id=accept-batch-rollback-drain;stage=2;scope=shared;review=3,6 -->
- [ ] v1 body/response/parser and generic consumed IDs remain unchanged <!-- omo:id=accept-batch-v1-shape;stage=2;scope=shared;review=3,6 -->
- [ ] v1 missing key is not 428 until one full compatibility release reports old/no-key zero <!-- omo:id=accept-batch-v1-key-gate;stage=2;scope=shared;review=3,6 -->
- [ ] v1 strict removal waits for new-start block, active terminal zero and separate tombstone <!-- omo:id=accept-batch-v1-tombstone;stage=2;scope=shared;review=3,6 -->

## Successor / Error Boundary

- [ ] #9 owns meal-log linked consumed event pointer and arbitrary-order entry reversal <!-- omo:id=accept-batch-meal-log-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] #11 owns final delayed-weight/unrecoverable/LEFTOVERS UI polish and reuses #8 mutations <!-- omo:id=accept-batch-weight-ui-boundary;stage=4;scope=shared;review=5,6 -->
- [ ] responses keep official wrapper/error shape and exact public codes <!-- omo:id=accept-batch-wrapper;stage=2;scope=backend;review=3,6 -->
- [ ] 401/404/409/422/503 paths preserve nondisclosure and whole-operation zero-write <!-- omo:id=accept-batch-errors;stage=2;scope=backend;review=3,6 -->
- [ ] no unofficial endpoint/field/status/reason/error/screen is introduced <!-- omo:id=accept-batch-no-contract-invention;stage=2;scope=shared;review=3,6 -->

## Verification / Evidence

- [ ] Stage 1 claims only docs validators, focused tests, lint/typecheck, audit and diff <!-- omo:id=accept-batch-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation first records failing route/DB/component tests before production changes <!-- omo:id=accept-batch-tdd-red;stage=2;scope=shared;review=3,5,6 -->
- [ ] PostgreSQL fresh/replay covers RLS/ACL/guards/events/locks/replay/cleanup <!-- omo:id=accept-batch-postgres;stage=2;scope=backend;review=3,6 -->
- [ ] real DB two-owner before/after digests prove denial/replay atomicity <!-- omo:id=accept-batch-real-db;stage=2;scope=backend;review=3,6 -->
- [ ] E2E covers exact pantry complete, weight matrix, v1 compatibility and seeded drain <!-- omo:id=accept-batch-e2e;stage=4;scope=shared;review=5,6 -->
- [ ] remote verifier is merged-exact-SHA read-only and flags stay off until release gate <!-- omo:id=accept-batch-remote;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal1.5/security-DB/five-axis/design/Stage3/5/6 reviews have zero unresolved findings <!-- omo:id=accept-batch-independent-review;stage=2;scope=shared;review=3,5,6 -->
- [ ] current-head PR and post-merge QA/Policy/Security/Vercel are green/intended skip <!-- omo:id=accept-batch-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation/review/design sessions; service owner for future R+2 activation
- environment: local Supabase, 390px/320px browser evidence, merged-exact-SHA remote read-only; production flags excluded until gate
- scenarios: exact row complete/replay, known/missing/unrecoverable, discard/adjust/close/cancel, legacy reader, R/R+1 drain and rollback

## Manual Only

- [ ] production R+2 joint activation occurs only after service-owner approval of R/R+1 evidence
