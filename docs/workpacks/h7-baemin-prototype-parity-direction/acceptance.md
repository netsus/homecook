# Acceptance Checklist: h7-baemin-prototype-parity-direction

This acceptance file covers the Baemin prototype near-100% parity direction gate only. Runtime implementation is intentionally deferred to follow-up slices.

## Stage 1 Gate Acceptance

| # | Criteria | Status |
| --- | --- | --- |
| A1 | User goal is recorded as near-100% prototype parity, not visual-only retrofit | ✅ recorded |
| A2 | Prior `PLANNER_WEEK` no-horizontal lock is superseded by user approval | ✅ recorded |
| A3 | Supersession matrix covers `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, and overlays | ✅ recorded |
| A4 | Prototype-only exclusions are explicit | ✅ recorded |
| A5 | Visual-verdict method defines viewport, states, score axes, thresholds, and blocker rule | ✅ recorded |
| A6 | Body and overlay scoring are independent | ✅ recorded |
| A7 | Contract-evolution-required slices are separated from visual-only slices | ✅ recorded |
| A8 | No runtime app code changes in this gate | ✅ recorded; verified at merge |

## Happy Path

- [ ] A reviewer can understand why h6 visual-only retrofit is no longer enough <!-- omo:id=h7-accept-h6-superseded;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can identify the exact follow-up slice order <!-- omo:id=h7-accept-slice-order;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can see which prior locks are kept or superseded per surface <!-- omo:id=h7-accept-supersession-readable;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can see which prototype elements are excluded unless separately approved <!-- omo:id=h7-accept-exclusions-readable;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] No API, DB, status-transition, permission, auth, or read-only behavior is changed by this gate <!-- omo:id=h7-accept-no-contract-runtime-change;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation must preserve loading, empty, error, unauthorized, and read-only states where applicable <!-- omo:id=h7-accept-state-coverage-required;stage=4;scope=frontend;review=5,6 -->
- [ ] `PLANNER_WEEK` prototype-priority direction follows `docs/화면정의서-v1.5.1.md`, `docs/요구사항기준선-v1.6.4.md`, and `docs/유저flow맵-v1.3.1.md` <!-- omo:id=h7-accept-planner-current-docs;stage=4;scope=frontend;review=5,6 -->
- [ ] H1/H5 locks remain in force unless this h7 matrix or a later user-approved contract-evolution PR supersedes them <!-- omo:id=h7-accept-h1-h5-guard;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype source remains reference-only and must not be copy-pasted as production code without adaptation <!-- omo:id=h7-accept-reference-only;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] Future `HOME` parity preserves guest browsing and login-gated return behavior <!-- omo:id=h7-accept-home-auth;stage=4;scope=frontend;review=5,6 -->
- [ ] Future `RECIPE_DETAIL` parity preserves save/like/planner-add permission behavior <!-- omo:id=h7-accept-detail-auth;stage=4;scope=frontend;review=5,6 -->
- [ ] Future `PLANNER_WEEK` parity preserves unauthorized state and authenticated planner state boundaries <!-- omo:id=h7-accept-planner-auth;stage=4;scope=frontend;review=5,6 -->
- [ ] Future modal parity preserves `LoginGateModal` return-to-action behavior <!-- omo:id=h7-accept-login-gate;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] No new endpoint, field, table, status, or seed data is introduced by this gate <!-- omo:id=h7-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `meals.status` transition rules remain unchanged <!-- omo:id=h7-accept-meal-status;stage=4;scope=frontend;review=5,6 -->
- [ ] Shopping read-only and pantry inclusion semantics remain unchanged <!-- omo:id=h7-accept-shopping-pantry-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] `PANTRY` and `MYPAGE` remain excluded until official future slices <!-- omo:id=h7-accept-future-screens-excluded;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] Near-100% parity uses five score axes: skin, layout, interaction, assets/copy, state coverage <!-- omo:id=h7-accept-score-axes;stage=4;scope=frontend;review=5,6 -->
- [ ] Required viewports are 390px and 320px <!-- omo:id=h7-accept-viewports;stage=4;scope=frontend;review=5,6 -->
- [ ] Required comparison is 3-way: current, after, prototype <!-- omo:id=h7-accept-three-way;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority blocker count must be 0 for follow-up implementation slices <!-- omo:id=h7-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [ ] Body screen score and overlay score are separate gates <!-- omo:id=h7-accept-score-independence;stage=4;scope=frontend;review=5,6 -->
- [ ] Score miss waiver conditions are documented <!-- omo:id=h7-accept-waiver-conditions;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] This gate requires no fixture changes <!-- omo:id=h7-accept-no-fixture-change;stage=4;scope=frontend;review=5,6 -->
- [ ] This gate requires no real DB smoke <!-- omo:id=h7-accept-no-real-db;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation slices must define their own fixture and route entry setup before scoring <!-- omo:id=h7-accept-future-fixtures;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Docs Gate

- [ ] `git diff --check` passes <!-- omo:id=h7-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` passes <!-- omo:id=h7-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workpack` passes <!-- omo:id=h7-accept-workpack;stage=4;scope=frontend;review=5,6 -->

### Future Frontend

- [ ] `baemin-prototype-parity-foundation` locks capture/fixture/material setup before scored slices <!-- omo:id=h7-accept-foundation-first;stage=4;scope=frontend;review=5,6 -->
- [ ] `HOME` parity must meet `>=95` body score and blocker 0 <!-- omo:id=h7-accept-home-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPE_DETAIL` parity must meet `>=95` body score and blocker 0 <!-- omo:id=h7-accept-detail-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] `PLANNER_WEEK` parity must meet `>=94` body score and blocker 0 <!-- omo:id=h7-accept-planner-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] Modal parity must meet `>=93` overlay score and blocker 0 <!-- omo:id=h7-accept-modal-threshold;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- User taste approval for final visual feel remains manual.
- Any excluded prototype-only feature promotion remains manual.
- Any score waiver remains manual and must cite the documented waiver conditions.
