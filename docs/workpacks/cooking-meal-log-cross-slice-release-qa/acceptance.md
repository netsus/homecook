# Acceptance Checklist

> Stage 1 locks a future verification-only gate. Every runtime item remains unchecked until exact-head evidence exists. The contract authority is official v1.7.33/v1.5.37/v1.3.35/DB v1.3.35/API v1.2.40 plus the retained 1,018 lines plan at SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`.

## Stage 1 Current Gate Evidence

- Draft PR: `https://github.com/netsus/homecook/pull/1373`; lifecycle/approval/verification/evaluation은 `planned / codex_approved / passed / passed`다.
- exact reviewed identity: head `2c33b38cf9f3badb72d610ad7a47abe70bf8907f`, tree `23fab93ab372174b9f531cf3414b348b1a724894`.
- internal1.5 task `01a01f2e-ae07-7f42-88be-87727228702a`: `APPROVE 0/0/0`, drift `0`.
- security/DB/operations task `01a01f2e-b2ed-7f32-bbaf-204b58613435`: `APPROVE 0/0/0`, drift `0`.
- five-axis task `01a01f2e-ba20-7022-8b3b-5b90d15572d0`: `APPROVE 0/0/0`, drift `0`.
- design-authority-plan task `01a01f2e-bf69-7f23-9c7c-7982855195bc`: `APPROVE 0/0/0`, drift `0`.
- retained evidence: `docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-21-stage1-final-independent-approvals.json`.
- 위 verdict는 Stage 1 bookkeeping/current gate evidence다. Stage 2 verification-only는 base `afb1b31aa6c95ba974f7484d31fa123439d5fcd6`에서 시작됐지만 evidence 수집 전이며, runtime/full 8-lane 287041/Manual/activation 완료나 아래 Stage 2/4 acceptance 체크를 아직 주장하지 않는다.

## Stage 4 / Stage 5 / Final Authority Evidence

- Stage 4 author `01a033bd-a723-7052-a42c-b830d10057af` completed source content head/tree `112a8e8763571a8b4c8c105efbe9a3f1f9a4af2a` / `70a20f8c63720800ae8073fe84e24629e1956886`; successor author `01a034a0-5120-7bd3-a2a6-278f1015dfee` preserved that tree exactly.
- Reviewed PR #1412 head/tree is `25f314e7524382da174fc9075604b6450061e72e` / `255347d7e0d4f71596c0180c2b137a9ce8e17413`. The evidence subtree and authority report blob remained unchanged after the Stage 5 projection repair.
- Fresh Stage 5 reviewer `01a034d3-69db-70f2-b297-8f7e716b44f4` returned `APPROVE`, P0/P1/P2 `0/0/2`, product UI findings `0`; final authority `01a034da-9a1f-76c0-bef4-47b1a1f481c7` returned `PASS`, P0/P1/P2 `0/0/2`, blocker/major `0/0`.
- `CML14-AUTH-PRE-M01` and `CML14-AUTH-PRE-M02` remain explicit and unwaived. Generic COOK_MODE/MEAL_LOG PNGs are viewport/layout evidence rather than default-state proof, and eval `96 PASS` is retained source exact-tree evidence rather than a fresh successor artifact.
- Stage 6, Ready, merge, Manual/server-Mac/OAuth/device/AT/full-WCAG/local-production/backup-restore/cutover/capability/R/R+1/R+2/required-key/activation remain pending.

## Happy Path

- [x] F0/#1~#13 automated/runtime merge evidence is rechecked at the frozen base before Stage 2 evidence collection <!-- omo:id=accept-cooking-cross-happy-predecessors;stage=2;scope=shared;review=3,6 -->
- [x] pinned isolated local verification passes without product or production mutation <!-- omo:id=accept-cooking-cross-happy-isolated;stage=2;scope=backend;review=3,6 -->
- [ ] backend/isolated/security/performance/rollback evidence is rerun on `FINAL_EVIDENCE_SHA` <!-- omo:id=accept-cooking-cross-final-backend-bundle;stage=2;scope=backend;review=3,6 -->
- [x] browser/design evidence is rerun on the same `FINAL_EVIDENCE_SHA` <!-- omo:id=accept-cooking-cross-final-browser-bundle;stage=4;scope=frontend;review=5,6 -->
- [ ] API responses retain the existing `{ success, data, error }` wrapper and v1.2.40 types <!-- omo:id=accept-cooking-cross-happy-api-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] automated/runtime predecessor gate: satisfied remains distinct from overall lifecycle is not complete <!-- omo:id=accept-cooking-cross-state-separation;stage=2;scope=shared;review=3,6 -->
- [x] Stage 2 remains verification-only and does not implement a repair or Contract Evolution <!-- omo:id=accept-cooking-cross-state-verification-only;stage=2;scope=shared;review=3,6 -->
- [x] current/immediate-previous v1/v2 dispatch, rollback drain and legacy retention stay available until their existing gates permit removal <!-- omo:id=accept-cooking-cross-state-version-rollback;stage=2;scope=shared;review=3,6 -->
- [ ] completed shopping and historical rows remain read-only under their official contracts <!-- omo:id=accept-cooking-cross-state-read-only;stage=2;scope=shared;review=3,6 -->
- [x] no endpoint, field, status, error, action, screen, migration, or dependency is introduced <!-- omo:id=accept-cooking-cross-state-no-invention;stage=2;scope=shared;review=3,6 -->
- [x] approved disposable isolated Stage 4 rehearsal is the only runtime/activation carve-out and production/non-disposable mutation remains forbidden <!-- omo:id=accept-cooking-cross-state-stage4-carveout;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] every application-owned trusted function and SECURITY DEFINER signature retains exact control/effect/exposure/principal classification <!-- omo:id=accept-cooking-cross-error-function-inventory;stage=2;scope=backend;review=3,6 -->
- [ ] PUBLIC/anon mutation denial, safe search path, owner A/B isolation and local Data API negative smoke pass <!-- omo:id=accept-cooking-cross-error-function-security;stage=2;scope=backend;review=3,6 -->
- [ ] stale/revoked/missing session and account generation requests are mutation-zero and cannot write into a new generation <!-- omo:id=accept-cooking-cross-error-session-generation;stage=2;scope=backend;review=3,6 -->
- [x] unauthorized, conflict, unavailable and read-only UI states fail closed without context loss <!-- omo:id=accept-cooking-cross-error-ui-states;stage=4;scope=frontend;review=5,6 -->
- [x] loading, empty and error states remain reachable on all owning screens <!-- omo:id=accept-cooking-cross-error-base-states;stage=4;scope=frontend;review=5,6 -->
- [x] login gate and return-to-action stay consistent with existing Auth behavior <!-- omo:id=accept-cooking-cross-error-return-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] public recipe original, owner-only private writes, soft delete and public-path nondisclosure remain intact <!-- omo:id=accept-cooking-cross-data-personal-recipe;stage=2;scope=backend;review=3,6 -->
- [ ] content snapshot authority, exact nutrition pin and future-impact all-or-nothing 409 remain intact <!-- omo:id=accept-cooking-cross-data-snapshot;stage=2;scope=backend;review=3,6 -->
- [ ] local 287,041 product search, stable cursor and effective product-to-ingredient projection remain intact <!-- omo:id=accept-cooking-cross-data-product-search;stage=2;scope=backend;review=3,6 -->
- [ ] cooked batch content-only ledger, bounds, replay and non-reversible unrecoverable state remain intact <!-- omo:id=accept-cooking-cross-data-batch-ledger;stage=2;scope=backend;review=3,6 -->
- [ ] each meal-log entry reverses only its linked active event and preserves other entries/remaining quantity <!-- omo:id=accept-cooking-cross-data-meal-event;stage=2;scope=backend;review=3,6 -->
- [ ] exact nutrition evidence or 422, immutable record-time timezone/local date and missing-not-zero remain intact <!-- omo:id=accept-cooking-cross-data-nutrition-time;stage=2;scope=backend;review=3,6 -->
- [ ] consumed-only first depletion grants XP once; reversal/redepletion never duplicates it <!-- omo:id=accept-cooking-cross-data-xp;stage=2;scope=backend;review=3,6 -->
- [ ] account cleanup and image lifecycle preserve owner/generation boundaries and legacy orphan enqueue/delete zero <!-- omo:id=accept-cooking-cross-data-cleanup;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] focused predecessor tests and exact merge evidence have no stale or different-head reference <!-- omo:id=accept-cooking-cross-precondition-evidence;stage=2;scope=shared;review=3,6 -->
- [x] pinned isolated local runtime uses no production volume, port, env or secret mount <!-- omo:id=accept-cooking-cross-precondition-isolation;stage=2;scope=backend;review=3,6 -->
- [ ] required schema, seed, owner A/B and predecessor bootstrap rows exist before runtime verification <!-- omo:id=accept-cooking-cross-precondition-bootstrap;stage=2;scope=backend;review=3,6 -->
- [ ] controlled full-local read-only use records exact target identity, backup freshness and before/after checksum equality <!-- omo:id=accept-cooking-cross-precondition-controlled-local;stage=2;scope=backend;review=3,6 -->
- [x] Cloud/linked/remote Supabase is forbidden/N/A and is never a target, prerequisite, verifier or fallback <!-- omo:id=accept-cooking-cross-precondition-local-only;stage=2;scope=backend;review=3,6 -->

## Automation Split

### Vitest / deterministic local

- [x] focused F0/#1~#13 runtime regressions are green on the exact repaired head <!-- omo:id=accept-cooking-cross-automation-runtime;stage=2;scope=backend;review=3,6 -->
- [ ] repo-owned producer creates one new create-only `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/` bound to `FINAL_EVIDENCE_SHA` without deleting or reusing older attempts <!-- omo:id=accept-cooking-cross-automation-attempt;stage=2;scope=backend;review=3,6 -->
- [x] every lane runs with a lane-specific allowlist and cannot inherit migration/test replacement, skip/filter/testNamePattern, PG/DB, cloud/link/credential ambient overrides <!-- omo:id=accept-cooking-cross-automation-env;stage=2;scope=backend;review=3,6 -->
- [x] Stage 6 full validator rejects `profile=proof`, stale head, existing/missing/partial attempt and manifest/hash drift <!-- omo:id=accept-cooking-cross-automation-final-validator;stage=2;scope=backend;review=3,6 -->
- [x] final validator runs `git rev-parse HEAD`, requires clean worktree and canonical attempt root, and rejects outside-repo, stale-head and dirty-repo execution <!-- omo:id=accept-cooking-cross-automation-git-binding;stage=2;scope=backend;review=3,6 -->
- [x] artifact type and semantic payload fields are exact and every artifact timestamp equals the manifest single shared generated_at <!-- omo:id=accept-cooking-cross-automation-semantic;stage=2;scope=backend;review=3,6 -->
- [x] pinned isolated owning PostgreSQL runners produce `db-security.json` with every required lane `passed > 0`, `skipped = 0`, `pending = 0`, `failed = 0` <!-- omo:id=accept-cooking-cross-automation-local-stack;stage=2;scope=backend;review=3,6 -->
- [x] isolated security producer creates `security.json` with nonzero authorization evidence and remote/linked/cloud access `0` <!-- omo:id=accept-cooking-cross-automation-security;stage=2;scope=backend;review=3,6 -->
- [x] attempt `performance.json` records Recall@20 >= 0.90, Precision@20 >= 0.75, DB p95 <= 300ms and route p95 <= 600ms <!-- omo:id=accept-cooking-cross-automation-performance;stage=2;scope=backend;review=3,6 -->
- [x] `actual-route-service-boundary` producer executes real route control flow for list1/list20, derives N+1 growth, and loop/callback regression fixtures fail closed <!-- omo:id=accept-cooking-cross-automation-query-count;stage=2;scope=backend;review=3,6 -->
- [x] attempt `rollback.json` proves current/immediate-previous, seeded-v2 drain, replay, tombstone and required-key rollback matrix with `passed > 0`, `skipped = 0`, `pending = 0`, `failed = 0` <!-- omo:id=accept-cooking-cross-automation-rollback;stage=2;scope=backend;review=3,6 -->

### Playwright / authority

- [x] real Chrome uses the authorized real local stack rather than fixture-only substitutes <!-- omo:id=accept-cooking-cross-browser-real-stack;stage=4;scope=frontend;review=5,6 -->
- [x] eight required screens have fresh 390/320/desktop exact-head evidence <!-- omo:id=accept-cooking-cross-browser-responsive;stage=4;scope=frontend;review=5,6 -->
- [x] keyboard order, focus restore, 44px targets, wrapping/overflow and landmarks pass <!-- omo:id=accept-cooking-cross-browser-accessibility;stage=4;scope=frontend;review=5,6 -->
- [x] HOME remains recipe-only and private/quarantined/deleted content never leaks <!-- omo:id=accept-cooking-cross-browser-home-privacy;stage=4;scope=frontend;review=5,6 -->
- [x] Planner keeps cooking plan separate from meal log and legacy product history read/delete-only <!-- omo:id=accept-cooking-cross-browser-planner-separation;stage=4;scope=frontend;review=5,6 -->
- [x] exploratory QA/eval and final authority report pin the same repaired head with blocker 0 <!-- omo:id=accept-cooking-cross-browser-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] after Stage 4 artifacts, attempt `manifest.json` and every evidence JSON record one clean `head_sha == FINAL_EVIDENCE_SHA`, matching `attempt_id` and `generated_at` <!-- omo:id=accept-cooking-cross-final-sha;stage=4;scope=shared;review=6 -->
- [ ] complete backend/isolated/security/performance/rollback + browser/design bundle is rerun on `FINAL_EVIDENCE_SHA` before Stage 6 <!-- omo:id=accept-cooking-cross-final-stage6-bundle;stage=4;scope=shared;review=6 -->
- [ ] every started current-head check is success or policy-justified skip and independent Stage 6 has zero findings <!-- omo:id=accept-cooking-cross-browser-closeout;stage=4;scope=shared;review=6 -->

### Repair boundary

- [ ] a discovered defect stops verification and moves to a separate failing-test-first TDD repair PR <!-- omo:id=accept-cooking-cross-repair-separate;stage=2;scope=shared;review=3,6 -->
- [ ] affected and final evidence gets a full rerun after its merge on the new exact head <!-- omo:id=accept-cooking-cross-repair-rerun;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex Stage 2/3, Stage 4 evidence, Stage 5 authority and Stage 6 closeout tasks
- environment: exact repaired head, pinned isolated local Supabase, separately authorized controlled full-local target, real Chrome 390/320/desktop
- scenarios: security inventory; account/session/image lifecycle; recipe/snapshot/product; v1/v2 cooking; batch/meal-log; legacy/rollback; current-head CI
- Stage 4 browser/authority evidence is collected only in the approved disposable isolated rehearsal project. It uses fresh ownership-attested disposable project only, loopback-only transport, JWKS loopback only, DNS/TLS/public request 0, and the reserved production-shaped HTTPS issuer claim; direct UPDATE, fixture state injection, and migration shortcut are forbidden. It must clean up owned artifacts only and remains `rehearsal_only`; it does not satisfy Manual/server-Mac/OAuth/device/AT/full-WCAG or capability activation.

### Manual Only

- [ ] Manual/server-Mac/OAuth/device/AT/full-WCAG verification
- [ ] local-production/rehearsal/backup-restore/cutover evidence requiring operator authority
- [ ] off-Mac encrypted backup, clean restore, RPO/RTO and reboot recovery
- [ ] capability/R/R+1/R+2/required-key/activation
- [ ] any local-production mutation, destructive tombstone or legacy orphan deletion
