# meal-log-core Stage 1 CI successor fresh independent internal 1.5 rereview

## Verdict

- review date: `2026-08-10 KST`
- reviewer task ID: `019fe76f-77b6-77a0-babf-68fd28ac7867`
- source coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- successor-head author task ID: `019fe76a-9031-7342-a3b0-0e5ada9dceab`
- prior repair author task ID: `019fe746-8d84-7cd2-9f12-9c22560e914f`
- prior fresh APPROVE reviewer task ID: `019fe756-5573-7533-9a0a-90fd2d427746`
- review role: fresh independent Stage 1 CI successor internal 1.5 rereviewer
- actor constraint: GPT-5.6-Sol high; Claude was not used
- verdict: **HOLD**
- findings: **P0 0 / P1 1 / P2 0**
- unresolved required findings: **1**
- Contract Evolution Candidate: **none**

This task is distinct from the Stage 1 author, original HOLD reviewer, repair author, prior APPROVE reviewer, successor author, and merge supervisor. It did not author or repair the reviewed successor evidence. The only write made by this task is this independent report.

## Exact reviewed identity and diff

| item | exact value |
| --- | --- |
| reviewed head | `4d7f53840c5c277da46b9a84b4238adf028c570e` |
| reviewed tree | `26fa938ee5540bb0cdfb466eb2c8369e91025683` |
| reviewed parent / failed-check head | `28545c0abb07376b00361392f2a8c009fcf95b3f` |
| reviewed parent tree | `1c4c8c8487ab39905ded2602b112daafe7577cac` |
| governing base | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| governing base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| pull request | `#1316`, Draft |
| remote PR branch at review | `docs/meal-log-core-stage1-repair-rereview` at exact reviewed head |

The parent-to-reviewed-head diff adds exactly one file:

- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-ci-port-conflict-successor.md`

Product/runtime code, official contract documents, migrations, CI workflows, dependencies, lockfile, workpack contract artifacts, workflow work item, and status projection are unchanged from the parent. The governing-base diff remains limited to the previously reviewed Stage 1 repair, its regression test/evidence, and this one successor evidence file.

## Finding

### P1-03 — failed-head check rollup understates six successful checks

Status: **unresolved / required repair**

The successor evidence records the failed-head current PR check rollup as terminal `success 8`, intended `skipped 5`, `failure 1`, `pending 0`. GitHub's exact commit check-run inventory for `28545c0abb07376b00361392f2a8c009fcf95b3f` contains 20 check runs:

- `success 14`
- intended `skipped 5`
- `failure 1`
- pending/cancel/rerun `0`

The extra six successes are completed PR Governance/Policy runs that are part of the exact failed-head check inventory. They cannot be omitted from a document claiming the current failed-head rollup. The run/job/root-cause account is otherwise supported, but exact check-count evidence is a required merge-gate identity property, so the successor document is not approvable while the count remains incorrect.

Exact repair:

1. In `2026-08-10-stage1-ci-port-conflict-successor.md`, replace only the failed-head rollup `success 8` with `success 14`; preserve `skipped 5`, `failure 1`, and pending/cancel/rerun `0`.
2. State total check runs `20` or otherwise make clear that the rollup includes every check run attached to exact head `28545c0a...`, including repeated completed governance/policy runs.
3. Do not change the failure classification, prior APPROVE report, Stage 1 contract, lifecycle, product code, migration, workflow, dependency, PR body/state, or activation state unless new independent evidence requires it.
4. Commit the repair on top of this HOLD report. Do not use a rerun of `28545c0a...`, the diagnostic checks of `4d7f5384...`, or this report-only head as final proof.
5. A fresh independent rereviewer must bind the corrected evidence to its exact new head/tree and return P0/P1/P2 `0/0/0`. The report-integrated corrected head must then start a new current-head check set; only that set may become merge proof.

## Failed run and root-cause review

| evidence | verified result |
| --- | --- |
| failed head | `28545c0abb07376b00361392f2a8c009fcf95b3f` |
| workflow run | `31324302478` |
| failed job | `93272089222`, `security-function-authorization` |
| failed step | `Start fresh local Supabase and replay migrations` |
| final applied migration in log | `20260809120000_cooked_batch_weight_ledger.sql` |
| seed transition | log advanced from `Seeding data from supabase/seed.sql` to `Starting containers` without a SQL/seed error |
| terminal failure | Docker could not bind `supabase_inbucket_homecook` to host port `0.0.0.0:54326`; `address already in use` |
| next authorization validation step | skipped because container startup exited `1` |

The document does not expose a secret, token, credential, or raw provider payload. Its bounded classification is supported: the observed terminal error is a host-port collision after migration replay and the seed transition, not a SQL, seed, authorization assertion, #9 product, public contract, or migration failure. The same security job later succeeded on reviewed head `4d7f5384...`, which is useful diagnostic corroboration but not final merge proof.

## Prior P1 closure and contract boundaries

The prior P1-01/P1-02 closure remains intact:

- current official tuple: `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37`;
- approved Cooking Plan / Meal Log lineage: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, `1,018` lines;
- POST/PATCH/DELETE malformed UUID `Idempotency-Key`: exact `400 INVALID_IDEMPOTENCY_KEY`;
- whole-operation zero-write surfaces: `mutation / operation / entry / event / pointer / projection / aggregate`.

No unofficial endpoint, field, enum, status, error, product behavior, migration, capability, or dependency was added. #9 continues to own meal-log schema/RLS/RPC/API/types/tests; #8 remains the sole batch-event/projection authority; #11 remains limited to COOK_MODE/LEFTOVERS presentation as an existing #8 consumer; #10 owns Planner shell and #12 owns MEAL_LOG UI/design.

## Lifecycle and proof boundary

The roadmap and workflow projections remain intentionally separate:

- roadmap: `docs`
- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- auto merge: `false`

Manual, server-Mac, OAuth, capability, R/R+1/R+2, production activation, Stage 2, and cross-slice release evidence remain pending. PR #1316 remains Draft.

At review time, exact reviewed head `4d7f5384...` had a terminal diagnostic check set of `success 9 / intended skipped 5 / failure 0`. That set is not final proof because this report commit creates another head, and the required evidence-count repair must create a later corrected head. No same-failed-head rerun is accepted as final proof.

## Verification

| command / check | result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged |
| focused Stage 1 Vitest suite | PASS; 6 files / 53 tests |
| `pnpm validate:source-of-truth-sync` | PASS |
| `BRANCH_NAME=docs/meal-log-core pnpm validate:workpack -- --slice meal-log-core` | PASS |
| `node scripts/validate-automation-spec.mjs --slice meal-log-core` | PASS |
| `pnpm validate:workflow-v2` | PASS |
| `pnpm validate:omo-bookkeeping` | PASS |
| `pnpm validate:closeout-sync -- --slice meal-log-core` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm audit --audit-level high` | PASS exit `0`; low `1`, moderate `1`, high `0` |
| JSON parse, secret-pattern scan, parent/head/base diff and `git diff --check` | PASS |
| GitHub PR/check/run/job/log direct inspection | PASS; count mismatch produced P1-03 |

Runtime/PostgreSQL/route/E2E/server-Mac/OAuth/capability/R/R+1/R+2/production checks were not run and are not claimed by this Stage 1 evidence rereview.

## Final gate

**HOLD — P0 0 / P1 1 / P2 0, unresolved required 1.**

P1-03 is a narrow evidence-count repair. Prior contract closure, root-cause classification, dormant lifecycle, and ownership boundaries remain valid. Stage 1 may not use this successor evidence as final merge proof until the exact repair above is committed and independently rereviewed to zero findings on the corrected current head.
