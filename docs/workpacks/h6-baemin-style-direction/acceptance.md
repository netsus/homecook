# Acceptance Checklist: h6-baemin-style-direction

This acceptance file covers the Baemin-style design direction gate only. Runtime implementation is intentionally deferred to follow-up slices.

## Stage 1 Gate Acceptance

| # | Criteria | Status |
| --- | --- | --- |
| A1 | User decision records official Baemin-style adoption | ✅ official adoption chosen |
| A2 | Rollout strategy is gradual, not app-wide immediate replacement | ✅ gradual rollout chosen |
| A3 | Non-goals are visual-only and exclude API/DB/status/IA/new feature scope | ✅ visual-only chosen |
| A4 | Decision boundaries separate user approvals from agent implementation decisions | ✅ core approval boundary chosen |
| A5 | Temporary mixed UI during rollout is allowed | ✅ mixed UI allowed |
| A6 | First success checkpoint is direction document approval before code changes | ✅ direction document first |
| A7 | Prototype references are stored under `ui/designs/prototypes/` | ✅ reference paths listed |
| A8 | `PANTRY` and `MYPAGE` are reference-only until official future slices | ✅ reference-only |

## Happy Path

- [ ] A reviewer can open the direction doc and understand why Baemin-style is now official <!-- omo:id=h6-accept-direction-readable;stage=4;scope=frontend;review=5,6 -->
- [ ] A reviewer can see the staged rollout order before any runtime code changes <!-- omo:id=h6-accept-rollout-readable;stage=4;scope=frontend;review=5,6 -->
- [ ] Follow-up slice names distinguish additive tokens, value-changing tokens, shared components, and screen retrofits <!-- omo:id=h6-accept-followup-split;stage=4;scope=frontend;review=5,6 -->
- [ ] Existing slice1-8 retrofit handling is documented <!-- omo:id=h6-accept-existing-slices;stage=4;scope=frontend;review=5,6 -->
- [ ] slice09 non-blocking policy is documented <!-- omo:id=h6-accept-slice09-nonblocking;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] No API, DB, or status-transition behavior is changed by this gate <!-- omo:id=h6-accept-contract-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] H1 HOME, H2 PLANNER_WEEK, and H5 modal decisions remain preserved unless a later approved gate supersedes them <!-- omo:id=h6-accept-existing-gates-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype code is treated as reference, not production source <!-- omo:id=h6-accept-prototype-reference;stage=4;scope=frontend;review=5,6 -->
- [ ] Official docs remain the source of truth when they conflict with prototype behavior <!-- omo:id=h6-accept-official-docs-win;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] Future implementation must preserve existing loading states where present <!-- omo:id=h6-accept-loading-preserved-plan;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation must preserve existing empty states where present <!-- omo:id=h6-accept-empty-preserved-plan;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation must preserve existing error states where present <!-- omo:id=h6-accept-error-preserved-plan;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation must preserve login-gated return-to-action behavior <!-- omo:id=h6-accept-auth-preserved-plan;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation must preserve read-only and conflict states where relevant <!-- omo:id=h6-accept-readonly-preserved-plan;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] No new API fields, endpoints, tables, statuses, or seed data are introduced by this gate <!-- omo:id=h6-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] Brand/background/font value changes remain blocked until explicit user approval <!-- omo:id=h6-accept-value-change-blocked;stage=4;scope=frontend;review=5,6 -->
- [ ] Cooking-method `--cook-*` semantics remain stable in follow-up work <!-- omo:id=h6-accept-cook-token-stable;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] `HOME`, `RECIPE_DETAIL`, and `PLANNER_WEEK` are classified as anchor-screen retrofit targets <!-- omo:id=h6-accept-anchor-targets;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority preflight lists mobile default and 320px evidence requirements <!-- omo:id=h6-accept-evidence-viewports;stage=4;scope=frontend;review=5,6 -->
- [ ] Follow-up implementation requires before/after evidence before confirmation <!-- omo:id=h6-accept-before-after-required;stage=4;scope=frontend;review=5,6 -->
- [ ] This gate itself requires no screenshot evidence because it changes no runtime UI <!-- omo:id=h6-accept-no-gate-screenshots;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] No fixture changes are required <!-- omo:id=h6-accept-no-fixture-change;stage=4;scope=frontend;review=5,6 -->
- [ ] No real DB smoke is required <!-- omo:id=h6-accept-no-real-db;stage=4;scope=frontend;review=5,6 -->
- [ ] Future implementation slices identify their own data and smoke needs <!-- omo:id=h6-accept-future-smoke;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Docs Gate

- [ ] `git diff --check` passes <!-- omo:id=h6-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` passes <!-- omo:id=h6-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->

### Future Frontend

- [ ] Additive token slice expects no visual diff <!-- omo:id=h6-accept-additive-no-diff;stage=4;scope=frontend;review=5,6 -->
- [ ] Value-changing token slice requires user approval and screenshots <!-- omo:id=h6-accept-value-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] Anchor retrofit slices require `pnpm verify:frontend` plus authority evidence <!-- omo:id=h6-accept-anchor-verify;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- User taste approval for final visual feel remains manual.
- Brand/background/font value approval remains manual.
- Final decision to productionize future `PANTRY` and `MYPAGE` visuals remains manual in their official slices.
