# meal-log-core Stage 1 CI port-conflict successor evidence

## Scope and exact identity

- evidence date: `2026-08-10 KST`
- successor-head author task ID: `019fe76a-9031-7342-a3b0-0e5ada9dceab`
- pull request: `#1316`, Draft, `master` <- `docs/meal-log-core-stage1-repair-rereview`
- governing base: `c16102a3072e929e45bb24a69464cd3110d03db5`
- failed head: `28545c0abb07376b00361392f2a8c009fcf95b3f`
- failed-head tree: `1c4c8c8487ab39905ded2602b112daafe7577cac`
- failed-head parent: `f3cd1db5ba3801f425fb0c2c462ffd5a56ba6286`
- failed check: `security-function-authorization`
- workflow run: `31324302478`
- job: `93272089222`
- exact failed step: `Start fresh local Supabase and replay migrations`
- failed-head raw started check-run rollup: `total 20`; terminal `success 14`, intended `skipped 5`, `failure 1`, pending/cancel/rerun `0`

The contemporaneous `gh pr` condensed surface showed `success 8`; the governing raw exact-head inventory also includes six additional completed PR Governance/Policy check runs, yielding all-started `total 20` and `success 14`.

This is an evidence-only successor-head record. It changes no product code, public contract, migration, CI workflow, dependency, work item, lifecycle projection, or activation state. The GitHub log summary below excludes secrets, tokens, raw provider payloads, and unrelated runner details.

## Failure evidence and classification

Run `31324302478`, job `93272089222` applied the repository migration sequence through the last migration, `20260809120000_cooked_batch_weight_ledger.sql`, and then completed `supabase/seed.sql`. The next log events were `Starting containers` and `Stopping containers`. Container startup then failed because Docker could not bind host port `0.0.0.0:54326` for `supabase_inbucket_homecook`: the address was already in use. The step exited `1` before the following authorization validation step could run.

The observed ordering is material:

1. every migration, including `20260809120000_cooked_batch_weight_ledger.sql`, reached its apply log;
2. seed execution completed and container startup began;
3. the terminal error was host networking setup for occupied port `54326`, not SQL, seed, authorization assertion, application, or contract validation output.

On the available evidence, this failure is classified as a GitHub runner resource collision. It is not evidence of a #9 product, contract, migration, workflow, or dependency defect. The #9 delta at the failed head contains no product code, migration, workflow, or dependency change. Prior local verification remained green: focused Stage 1 `6 files / 53 tests`, validators, lint, typecheck, and diff checks passed; `pnpm audit --audit-level high` reported `high 0 / moderate 1 / low 1` and exited successfully.

## Successor-head proof rule

The failed head `28545c0abb07376b00361392f2a8c009fcf95b3f` must not be rerun and used as final merge proof. This evidence file is committed as a new evidence-only successor commit, producing a new PR head. The new head must start a new full set of PR checks, and only that current-head check set may be used by the merge supervisor. This document does not claim the successor checks are green.

The remote PR branch is updated only if `refs/heads/docs/meal-log-core-stage1-repair-rereview` still resolves exactly to `28545c0abb07376b00361392f2a8c009fcf95b3f` immediately before push. The update must be a non-force fast-forward. PR body updates, Ready transition, rerun, and merge remain the merge supervisor's responsibility.

## Prior approval and pending lifecycle

The prior fresh independent internal 1.5 rereview is preserved at `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-repair-rereview.md`. It records **APPROVE**, findings `P0 0 / P1 0 / P2 0`, unresolved required findings `0`, and reviewed parent evidence at commit `f3cd1db5ba3801f425fb0c2c462ffd5a56ba6286`, tree `ec0b22c049ed7f659d210f832105fd69c12acb98`.

That approval does not promote lifecycle state. #9 remains:

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- auto merge: `false`

Manual, server-Mac, OAuth, capability, R/R+1/R+2, production activation, and cross-slice release evidence remain pending. Stage 2 is not started by this successor commit. Discord is untouched.
