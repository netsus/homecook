# Stage 1 relock successor evidence — 2026-08-04

## Scope and role

- Role: Homecook #8 `cooked-batch-weight-ledger` fresh Stage 1 relock author-continuation helper.
- Working branch: `docs/cooked-batch-weight-ledger-stage1-relock`.
- Draft PR: `#1285`.
- Old interrupted head before this successor evidence: `0a3544a391c275d3073791eb5c6ab2ec7bb3b4cb`.
- Original author task: `019fcad5-e90a-7f22-8446-f7fb4ef00c68`.
- Independent precheck task: `019fcaca-8632-7c71-a3fc-32ea5c49f4a1`.
- Current author-side internal 1.5 repair task: `019fe096-0556-7ee3-a071-7e4c97c86684`.
- This task does not self-approve internal 1.5, design critic, product-design-authority, Stage 2, Stage 3, Stage 5, Stage 6, final authority or merge.

## Why a successor head was required

- The prior exact head stopped at independent precheck `HOLD` with `3 blocker / 2 major`.
- The same old head also had an empty PR body and therefore could not satisfy the current PR-template/policy surface as final proof even though the branch/worktree was otherwise clean.
- The user-provided author context confirmed that focused Stage 1 RED `5/5` and GREEN local validations had already been completed before the App system error; this successor head preserves that lineage instead of broadening scope.

## Locked official tuple and scope guard

- requirements: `docs/요구사항기준선-v1.7.29.md`
- screens: `docs/화면정의서-v1.5.33.md`
- flow: `docs/유저flow맵-v1.3.31.md`
- DB: `docs/db설계-v1.3.31.md`
- API at the original 2026-08-04 evidence head: `docs/api문서-v1.2.35.md`
- current user-approved Contract Evolution tuple: `docs/api문서-v1.2.36.md`

The relock remains docs-only. No product runtime/API implementation, DB schema, migration, dependency, #7 implementation, other workpack or capability-activation change is introduced here.

## Dependency and predecessor boundary

- `recipe-content-snapshot-future-propagation` (#7) runtime predecessor is merged and available through PR `#1281` exact head `aab9a65e6123e3134478842971765ad3aa737d6a`, merged as `2173737e8ea2eec2297e1cc0227ce4f2c27c50b9`.
- That merge does **not** close the broader #7 lifecycle. Manual/server-Mac/OAuth evidence, #8 R/R+1 drain, and R+2 activation remain open and are intentionally preserved as pending here.
- Dependency advisory baseline repair PR `#1284` was independently approved and squash-merged as `c982d97085ebcbe50da8a1b3c3de68bcd9f638a3`. This Stage 1 relock does not claim ownership of that merge; it only consumes the repaired base truthfully.
- Registry drift later exposed inherited high advisories again. Separate dependency repair PR `#1286` was independently approved and merged as new master `9ff5a920f063af22cd8a8dbee33a603b27c3af57`; this branch absorbed that exact lineage through merge commit `893e9866cfb6a3dc4d2b801756ea25629b80736f` without copying its three files.

## Independent gate status

- Fresh design critic task `019fe02c-1b12-7d42-bcaf-0d5a02847967`: PASS `0/0/0`; report `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md`.
- Fresh product-design-authority task `019fe041-2ff4-7f62-9786-79a46aecae0c`: pass `0/0/0`; report `ui/designs/authority/COOK_MODE-cooked-batch-weight-ledger-authority.md`.
- Static design evidence:
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png`
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png`
- Internal 1.5 task `019fe049-dc14-77f0-ac4c-6dcb58d2b819` reviewed old head `0eb76e8ff0450ccc4353b91f191be8a2f1e2dfb3` and returned `HOLD`, P0/P1/P2 `0/3/0`: `I15-B01`, `I15-B02`, `I15-B03`.
- The author repaired all three findings; fresh internal 1.5 re-review pending on the successor head.
- Future Stage 2 implementation owner and all later independent review stages

This author records the independent critic/authority verdicts but does not self-approve internal 1.5 or project Stage 1 complete.

## Local successor edits

- Added this successor evidence file so the interrupted Stage 1 lineage, blocked precheck context, merged dependency-baseline context, and future independent gates are retained in-repo.
- Added one minimal README link to the evidence file so future reviewers and validators can find the successor context without reopening scope.
- `I15-B01`: replaced the nonofficial `cooking_session_v2` name with the existing official pair `personal_recipe_v2` + `snapshot_v2_creation`.
- `I15-B02`: absorbed merged PR `#1286`; `pnpm audit --audit-level high` now reports high/critical `0`.
- `I15-B03`: removed only the six Markdown hard-break trailing-space pairs from the critic report. The report task ID, verdict, counts and visual findings are unchanged.

## Validation

Historical author/precheck context carried forward from the interrupted run:

- Focused RED before repair: `5/5`
- Focused GREEN before App failure: local Stage 1 validations completed

Fresh successor-head validation was rerun after the evidence/bookkeeping update:

- `pnpm validate:source-of-truth-sync`
- `pnpm validate:workflow-v2`
- `BRANCH_NAME=docs/cooked-batch-weight-ledger-stage1-relock pnpm validate:workpack -- --slice cooked-batch-weight-ledger`
- `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ledger`
- `pnpm validate:omo-bookkeeping`
- `pnpm exec vitest run tests/cooked-batch-weight-ledger-stage1-relock.test.ts tests/check-workpack-docs.test.ts tests/source-of-truth-sync.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm audit --audit-level high`
- `git diff --check`

- `pnpm validate:source-of-truth-sync` → pass
- `pnpm validate:workflow-v2` → pass
- `BRANCH_NAME=docs/cooked-batch-weight-ledger-stage1-relock pnpm validate:workpack -- --slice cooked-batch-weight-ledger` → pass (exit `0`)
- `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ledger` → pass
- `pnpm validate:omo-bookkeeping` → pass
- `pnpm exec vitest run tests/cooked-batch-weight-ledger-stage1-relock.test.ts tests/check-workpack-docs.test.ts tests/source-of-truth-sync.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts` → `6 files / 67 tests` pass
- `pnpm lint` → pass
- `pnpm typecheck` → pass
- Historical note correction: the earlier `pnpm audit --audit-level high` high/critical `0` and `git diff --check` pass lines were a false pass claim for old head `0eb76e8ff0450ccc4353b91f191be8a2f1e2dfb3`. Independent internal 1.5 reproduced audit high `4` and diff-check failure from six Markdown hard-break trailing-space pairs.
- After PR `#1286` absorption and author repair, `pnpm audit --audit-level high` → high/critical `0`; residual advisories `1 low | 1 moderate`.
- After whitespace-only critic repair, `git diff --check origin/master...HEAD` → pass.

## 2026-08-08 API Contract Evolution re-lock

- Fresh precheck task `019fe0d7-a6fd-7561-a68b-a59fe9c40030` returned `CONFIRMED_CE` with three high-confidence blockers: missing exact complete/mutation success data, incomplete `GET /cooked-batches`, and other-owner error conflict.
- The user explicitly approved API `v1.2.35 → v1.2.36` while keeping requirements `v1.7.29`, screens `v1.5.33`, Flow `v1.3.31`, DB `v1.3.31`, endpoint count and DB authority unchanged.
- API v1.2.36 now locks one owner-only `CookedBatchProjection` shared by `GET /cooked-batches`, complete and mutation success; exact complete/mutation replay data; owner-only filter/cursor/legacy null semantics; missing/other-owner `404 RESOURCE_NOT_FOUND` versus validation 422 and state/revision/bounds/later-event 409.
- #9 meal-log and #11 final UI remain successor-owned. No product code, migration/apply, production/staging/remote DB/app/Vercel write, capability or R+2 activation is included.
- Fresh independent contract re-review pending; Stage 2 resume pending. This author does not self-approve Stage 1/internal 1.5, mark Ready, merge, or resume implementation.
- #7 broader lifecycle, Manual/server-Mac/OAuth evidence, #8 R/R+1 drain and R+2 activation remain pending.

### PR #1287 RED/GREEN count correction and reviewer repair

- Original test commit `c286871f79eaec92b97fcbd64da48e1d2a0cb538` was re-executed in a detached historical worktree: `1 file / 9 tests / 8 failed / 1 passed`. The earlier PR-body claim `8 tests / 7 failures` was incorrect.
- Reviewed old head `c189c8678878f80b31b1cdd4aa375281500e6627` was re-executed with the exact focused eight-file contract/governance suite: `8 files / 90 tests` passed. The old-head GitHub `quality` log independently ran `tests/cooked-batch-api-contract-v1-2-36.test.ts` as `9 tests`.
- The already-pushed `c189c867` commit trailer says `89 focused tests`. It cannot be rewritten or force-pushed and was an arithmetic miscount based on the incorrect eight-test assumption, not a different passing subset. The executable historical result is `90/90`; this successor evidence and the repaired PR body supersede only that count claim.
- Successor regression RED after strengthening whole-document consistency checks: `1 file / 9 tests / 2 expected failures / 7 passes`. The failures reproduced the inherited other-owner error conflict and permissive `availability=loggable` wording before either official-document line was repaired.
- The repair keeps API v1.2.35 and the other four official documents byte-identical. It corrects only the two conflicting inherited v1.2.36 lines, strengthens the existing contract test, and leaves fresh independent successor-head re-review and Stage 2 resume pending.

### PR #1287 second reviewer exact-key parser repair

- Second fresh reviewer task `019fe114-dc48-77a1-b408-a98dd887715c` reviewed exact head `25528f81f859709845d69f965d475e9afa4e7c61` and returned `HOLD`, P0/P1/P2 `0/0/1`: projection `.slice(-15)` discarded an extra key before `id`, while list-container `.slice(0, 3)` discarded a fourth or later key.
- Second fresh repair-author task `019fe120-b165-7ea0-a736-89da7535cacf` first injected `unexpected_before_id` and `unexpected_after_has_next` into in-memory mutated document fixtures while retaining the old assertions. The focused RED was `1 file / 11 tests / 2 failed / 9 passed`; both failures were `expected [Function] to throw an error`, proving the old assertions accepted the extra keys.
- The minimum test-only repair isolates each declaration between explicit unique start/end markers and compares the complete ordered key array. Prefix/suffix inline-code noise remains outside the parsed range, while either injected key makes the exact-key assertion throw. No temporary key was written to an official document.
- GREEN verification is focused `1 file / 11 tests` and the same related contract/governance suite `8 files / 90 tests`. Source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators, lint, typecheck, diff check and audit high/critical `0` also pass; residual advisories remain `1 low | 1 moderate`.
- This second repair changes only the contract regression test and this evidence history. API v1.2.36 meaning, API v1.2.35, the other four official documents, #9/#11, product/DB/migration/dependency and activation surfaces remain unchanged. A different fresh reviewer must inspect the new exact head before any Ready, merge, Stage 1 approval or Stage 2 resume action.

## PR and merge posture

- Historical Stage 1 PR `#1285` was `Draft` at the authored/relock snapshot, and it was later `MERGED` with `isDraft=false` at merge SHA `e868fe803743454a0a8e9ea59a733d0692e0658b`; this Contract Evolution was delivered through a separate Draft PR and did not approve #1285.
- This successor task may fill the PR body and supervise current-head checks, but it does not mark Ready, approve, or merge.
- Current-head checks and fresh internal 1.5 must be evaluated on the new pushed successor SHA only; old-head green checks and the old `HOLD` are retained as history, not reused as approval proof.
