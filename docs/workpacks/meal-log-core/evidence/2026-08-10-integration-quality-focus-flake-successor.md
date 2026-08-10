# meal-log-core predecessor integration quality-flake successor evidence

## Scope and identity

- role: fresh integration author/supervisor; not Stage 3 reviewer or merge approver
- pull request: `#1319`, Draft, `master` <- `feature/be-meal-log-core`
- integrated predecessor: PR `#1322`, merge commit `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012`
- discarded integration head: `51c86c18410422e837a1eb6369663f1b00cb9ad8`
- discarded integration tree: `3189fcba6ea02f027e28025ea1cbd58a4c4d2900`
- merge parents: `41a8c554a7ea7db4272487b68a8c95fa87a78cad` and `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012`
- governing base: `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012`
- failed workflow run/job: `31356079788` / `93355916444` (`CI / quality`)

This evidence-only successor does not modify product code, tests, migrations, public contract, checklist closure, capability, activation, or Manual/server-Mac/OAuth state. It does not approve Stage 3, transition the PR to Ready, merge, rerun a GitHub check, or send Discord.

## Failure classification

The exact discarded-head raw check set was terminal:

- total `15`
- success `12`
- intended skipped `2`
- failure `1`
- pending/cancel/rerun `0/0/0`

The only failure was an existing focus assertion in `tests/prepared-food-planner-entry-ui.test.tsx`: the active element remained the product search input instead of the amount input. Neither that test nor its product UI is changed by the predecessor merge or this successor evidence.

The same isolated test passed locally immediately after the CI failure:

```text
pnpm exec vitest run tests/prepared-food-planner-entry-ui.test.tsx -t "restores search, later-page selection, amount, unit, nutrition, and focus from safe session context"
1 passed / 22 skipped
```

The meal-log integration verification remained green: Stage 2 focused `17/17`, checklist/closeout/PR-Ready current-vs-future tests `36/36`, fresh local PostgreSQL `10/10`, lint, typecheck, security-function contract, source/workflow/workpack/automation/bookkeeping, branch/commit/diff policy, and Ready-mode closeout sync.

## Successor proof rule

The discarded head and its failed check cannot be final delivery proof. This file creates a new evidence-only successor head without a GitHub rerun. The successor must be pushed by non-force fast-forward only if the remote feature branch still equals the discarded head. Only the new head's all-started terminal check set may be handed to the fresh independent Stage 3 rereviewer.

Manual/server-Mac/OAuth/capability/R/R+1/R+2/activation and the full PR Ready real-smoke gate remain pending. The repaired base-checklist blocker is separately proven closed by `PR_IS_DRAFT=false BRANCH_NAME=feature/be-meal-log-core BASE_REF=master pnpm validate:closeout-sync` passing.
