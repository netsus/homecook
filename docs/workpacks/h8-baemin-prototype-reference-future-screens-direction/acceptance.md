# Acceptance Checklist: h8-baemin-prototype-reference-future-screens-direction

This acceptance file covers the future-screen Baemin prototype reference gate only. Runtime implementation is intentionally deferred to later slice 13-19 work.

## Stage 1 Gate Acceptance

| # | Criteria | Status |
| --- | --- | --- |
| A1 | `BAEMIN_STYLE_DIRECTION.md` is the only canonical source for classification vocabulary | ✅ recorded |
| A2 | h8 stores the slice 13-19 rollout matrix without redefining the vocabulary | ✅ recorded |
| A3 | `PANTRY` and `MYPAGE` are parity candidates, not automatic slice-wide promotions | ✅ recorded |
| A4 | `PANTRY_BUNDLE_PICKER`, MYPAGE sub-tabs, cooking, leftovers, settings, manual, and YouTube surfaces stay derived by default | ✅ recorded |
| A5 | Bottom tab behavior, `Jua`, and prototype-only assets remain excluded | ✅ recorded |
| A6 | Generic nullable `frontend.design_authority.generator_artifact` and `critic_artifact` contract is documented | ✅ recorded |
| A7 | No runtime app code or official source-of-truth docs change in this gate | ✅ recorded |

## Happy Path

- [ ] A reviewer can identify the definition source without opening h7 <!-- omo:id=h8-accept-vocabulary-source;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can see the classification for every planned slice 13-19 screen/surface <!-- omo:id=h8-accept-matrix-readable;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can tell why `PANTRY_BUNDLE_PICKER` does not inherit `PANTRY` parity automatically <!-- omo:id=h8-accept-pantry-picker-derived;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can tell why MYPAGE sub-tabs do not inherit shell parity automatically <!-- omo:id=h8-accept-mypage-tabs-derived;stage=4;scope=frontend;review=5,6 -->
- [ ] `13-pantry-core` has an h8 dependency before frontend implementation begins <!-- omo:id=h8-accept-slice13-dependency;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] h7 remains historical and no new covered surfaces are added there <!-- omo:id=h8-accept-h7-historical;stage=4;scope=frontend;review=5,6 -->
- [ ] Promotion is screen/surface-level, not slice-level or tab-adjacency-level <!-- omo:id=h8-accept-screen-level-promotion;stage=4;scope=frontend;review=5,6 -->
- [ ] Future parity candidates still require their own implementation evidence and authority review <!-- omo:id=h8-accept-future-evidence-required;stage=4;scope=frontend;review=5,6 -->
- [ ] Official docs remain source of truth when prototype behavior conflicts with product contract <!-- omo:id=h8-accept-official-docs-win;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] Future `PANTRY` work must preserve auth, empty, error, and unauthorized handling from official contracts <!-- omo:id=h8-accept-pantry-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] Future `MYPAGE` work must preserve auth boundaries and account ownership rules <!-- omo:id=h8-accept-mypage-auth-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] Future cooking and leftovers surfaces must not borrow planner-state transitions from prototype visuals <!-- omo:id=h8-accept-cooking-state-guard;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] No new endpoint, field, table, status, or seed data is introduced by this gate <!-- omo:id=h8-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `meals.status` transition rules remain unchanged <!-- omo:id=h8-accept-meal-status;stage=4;scope=frontend;review=5,6 -->
- [ ] Shopping read-only and pantry inclusion semantics remain unchanged <!-- omo:id=h8-accept-shopping-pantry-contract;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] `frontend.design_authority.generator_artifact` accepts string path or `null` <!-- omo:id=h8-accept-generator-artifact-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] `frontend.design_authority.critic_artifact` accepts string path or `null` <!-- omo:id=h8-accept-critic-artifact-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] Missing artifact fields normalize to `null` in parser behavior <!-- omo:id=h8-accept-artifact-defaults;stage=4;scope=frontend;review=5,6 -->
- [ ] h8 itself requires no screenshot evidence because it changes no runtime UI <!-- omo:id=h8-accept-no-gate-screenshots;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] No fixture changes are required <!-- omo:id=h8-accept-no-fixture-change;stage=4;scope=frontend;review=5,6 -->
- [ ] No real DB smoke is required <!-- omo:id=h8-accept-no-real-db;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation slices identify their own data and smoke needs <!-- omo:id=h8-accept-future-smoke;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Docs Gate

- [ ] `git diff --check` passes <!-- omo:id=h8-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` passes <!-- omo:id=h8-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workpack` passes <!-- omo:id=h8-accept-workpack;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm test -- tests/omo-automation-spec.test.ts` passes <!-- omo:id=h8-accept-automation-spec-test;stage=4;scope=frontend;review=5,6 -->

### Future Frontend

- [ ] `13-pantry-core` treats `PANTRY` as a parity candidate and `PANTRY_BUNDLE_PICKER` as derived by default <!-- omo:id=h8-accept-slice13-future;stage=4;scope=frontend;review=5,6 -->
- [ ] `17a-mypage-overview-history` treats `MYPAGE` shell as a parity candidate and sub-tabs as derived by default <!-- omo:id=h8-accept-slice17a-future;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- User taste approval for final visual feel remains manual.
- Any future promotion from `prototype-derived design` to `prototype parity` remains manual.
- Any excluded prototype-only feature promotion remains manual.
