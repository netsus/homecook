# Acceptance Checklist

> Stage 1 locks future compatibility and evidence. Unchecked items do not claim runtime telemetry, a compatibility release, activation or tombstone authority exists.

## Legacy Product Planner

- [ ] `GET /planner` keeps additive legacy product entries separate from recipe meals <!-- omo:id=accept-legacy-compat-planner-read;stage=4;scope=shared;review=3,5,6 -->
- [ ] card/detail use pinned name, brand, quantity and nutrition version without current repin <!-- omo:id=accept-legacy-compat-pinned-version;stage=4;scope=shared;review=3,5,6 -->
- [ ] same-screen detail is read-only and owner delete is the only UI mutation <!-- omo:id=accept-legacy-compat-delete-only;stage=4;scope=shared;review=3,5,6 -->
- [ ] no add/edit/copy/shop/cook/leftover/XP/status or meal-log migration action exists <!-- omo:id=accept-legacy-compat-no-expansion;stage=4;scope=shared;review=3,5,6 -->
- [ ] elapsed release never auto-hides/deletes rows or read/delete paths <!-- omo:id=accept-legacy-compat-no-expiry;stage=4;scope=shared;review=3,5,6 -->
- [ ] other-owner/private rows and telemetry remain nondisclosed <!-- omo:id=accept-legacy-compat-owner;stage=4;scope=shared;review=3,5,6 -->

## Endpoint / Cursor Floor

- [ ] current UI has no product POST/PATCH producer or `GET /planner/nutrition` call <!-- omo:id=accept-legacy-compat-ui-producers;stage=4;scope=frontend;review=5,6 -->
- [ ] legacy planner GET/delete and `GET /planner/nutrition` remain until separate approved tombstone <!-- omo:id=accept-legacy-compat-endpoint-floor;stage=4;scope=shared;review=3,5,6 -->
- [ ] v1 cursor dual decode completes old cursor pages and new first pages may issue v2 <!-- omo:id=accept-legacy-compat-cursor;stage=4;scope=backend;review=3,6 -->
- [ ] no API field/status/error/migration or wrapper change is introduced <!-- omo:id=accept-legacy-compat-no-invention;stage=2;scope=shared;review=3,5,6 -->

## v1 Stable Key

- [ ] planner and standalone v1 clients send optional stable UUID keys first <!-- omo:id=accept-legacy-compat-key-client;stage=4;scope=shared;review=3,5,6 -->
- [ ] pre-gate no-key retains old v1 body/response and consumed_ingredient_ids <!-- omo:id=accept-legacy-compat-v1-shape;stage=4;scope=shared;review=3,5,6 -->
- [ ] one full release old-shape/no-key 0 precedes mutation-zero 428 enforcement <!-- omo:id=accept-legacy-compat-key-zero;stage=4;scope=shared;review=3,5,6 -->
- [ ] key enforcement does not remove v1 route/body/parser <!-- omo:id=accept-legacy-compat-key-vs-remove;stage=4;scope=shared;review=3,5,6 -->
- [ ] strict v1 removal also requires new-start block, active terminal 0 and separate tombstone contract <!-- omo:id=accept-legacy-compat-v1-tombstone;stage=4;scope=shared;review=3,5,6 -->

## Version Dispatch / Drain

- [ ] current and immediate-previous clients dispatch by stored contract_version only <!-- omo:id=accept-legacy-compat-version-dispatch;stage=4;scope=shared;review=3,5,6 -->
- [ ] cross-version IDs fail 404/409 without body-shape parser fallback <!-- omo:id=accept-legacy-compat-cross-version;stage=4;scope=shared;review=3,5,6 -->
- [ ] dormant adapter preserves v1 and drains seeded existing v2 read/cancel/complete <!-- omo:id=accept-legacy-compat-seeded-drain;stage=4;scope=shared;review=3,5,6 -->
- [ ] flag-off R/R+1 records new v2/personal mutation 0 <!-- omo:id=accept-legacy-compat-flag-off;stage=4;scope=shared;review=3,5,6 -->
- [ ] rollback closes new writes but keeps existing v2 drain <!-- omo:id=accept-legacy-compat-rollback;stage=4;scope=shared;review=3,5,6 -->
- [ ] #13 does not activate R+2 joint creation <!-- omo:id=accept-legacy-compat-no-activation;stage=2;scope=shared;review=3,5,6 -->

## Evidence / Tombstone Barrier

- [ ] evidence pins release IDs, head SHAs, window and current/immediate-previous clients <!-- omo:id=accept-legacy-compat-evidence-freshness;stage=4;scope=shared;review=3,5,6 -->
- [ ] telemetry covers v1 key/no-key, active v1, seeded v2 drain, legacy callers and cursor decode <!-- omo:id=accept-legacy-compat-telemetry;stage=4;scope=shared;review=3,5,6 -->
- [ ] telemetry excludes credentials, raw auth and other-owner private payload <!-- omo:id=accept-legacy-compat-telemetry-security;stage=4;scope=shared;review=3,5,6 -->
- [ ] zero telemetry or elapsed release is evidence, never deletion authority <!-- omo:id=accept-legacy-compat-zero-not-authority;stage=4;scope=shared;review=3,5,6 -->
- [ ] destructive removal requires new approval, official contract, retention, rollback and recovery evidence <!-- omo:id=accept-legacy-compat-manual-tombstone;stage=4;scope=shared;review=3,5,6 -->

## Verification

- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-legacy-compat-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation records failing compatibility tests before code <!-- omo:id=accept-legacy-compat-tdd-red;stage=2;scope=shared;review=3,5,6 -->
- [ ] independent internal1.5/security/five-axis/design-impact/Stage3/5/6 findings are zero <!-- omo:id=accept-legacy-compat-reviews;stage=2;scope=shared;review=3,5,6 -->
- [ ] current-head checks and post-merge QA/Policy/Security/Vercel are green/intended skip <!-- omo:id=accept-legacy-compat-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex reviewers
- environment: current/immediate-previous clients, seeded v2 fixture, 390px/320px/desktop, merged-exact-SHA remote read-only
- scenarios: legacy read/detail/delete, no writers, optional/no-key/428, v1/v2 dispatch, flag-off drain, rollback, unavailable telemetry

## Manual Only

- [ ] no destructive tombstone/removal without a new explicit user approval and merged official contract-evolution
