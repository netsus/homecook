# cooked-batch-weight-ui Ready policy closeout repair

## Identity and boundary

- role: fresh independent docs repair author for PR #1323 Ready policy failure
- Claude use: none
- self-approval: forbidden; this evidence does not approve its own publication commit
- exact starting head/tree: `cc1d94e3e6bcd7cb4df81f2a8edf60555f009054` / `486059ad24d7a993e98f89092c8d6677f5bbf7ad`
- starting worktree: detached and clean
- local-only temporary branch: `codex/pr1323-policy-ready-repair`, created from the exact starting head
- live PR observation: `OPEN`, Ready (`isDraft=false`), `UNSTABLE`, head `cc1d94e3e6bcd7cb4df81f2a8edf60555f009054`
- failing check: run `31405628276`, job `93511120435`, `Policy / policy`

This repair changes only the workpack README, acceptance projection, and this evidence. It does not relax or skip a validator, change product/API/DB/schema/automation/status/work-item/roadmap state, edit the PR or GitHub Ready state, push, merge, notify Discord, or perform production/remote/server-Mac/OAuth/R/activation work.

The repository branch-intent entrypoint was invoked with the user-mandated branch name, but rejected `codex/*` because its local allowlist accepts only `feature|fix|chore|docs|refactor|test|release|hotfix`. The exact requested local branch was retained rather than silently substituting a different branch or starting from `origin/master`.

## RED reproduction

The GitHub job log was read directly. The same Ready context was then reproduced locally at the starting tree:

```text
BRANCH_NAME=feature/fe-cooked-batch-weight-ui-superseding-draft \
BASE_REF=master PR_IS_DRAFT=false \
node scripts/validate-closeout-sync.mjs
```

Result: `closeout sync validation failed` with the same **22** errors as the GitHub job.

## Evidence used for truthful projection

- Stage 4 implementation: `d6843baa6d27addea5d79fa991c937dfc6dbf070` / `0fa3545f9ec22d83dd4e969f1eef70364a2297ba`; focused product/runtime evidence and full frontend gate passed.
- Stage 4 P2 repair and fresh evidence: `a381f23237c001b232172317a948770d0efa364b` -> `531055aca7038041411293b8a7e10a9cd27c2e8c`.
- fresh Stage 5: task `019feb85-1b83-7662-9c10-ab91d834c4f6`, `APPROVE 0/0/0`.
- final authority: task `019feb94-4d4f-7831-9000-01eaaf3a7569`, `APPROVE 0/0/0`; this is the basis for canonical Design Status `confirmed` and Design Authority status `reviewed`.
- independent Stage 6 closeout rereview: `c777603883bca338739de186b01c95d0f2e4e611` / `7edc197b0f395acdaa422d05c6dcf960b9f8350c`, `APPROVE 0/0/0`.
- independent Stage 6 Ready-repair rereview: `829d18df78b1cb2a2a0dd3a1fd159f3499d41ef2` / `d0ef8e97332b067ad418288be89b90380f03b34d`, `APPROVE 0/0/0`; its report publication successor is the starting head and is not treated as self-approved.

The Stage 6 evidence explicitly keeps creation-off drain, real read, actual OS virtual keyboard, real authentication/other-owner accounts, actual device/AT/full WCAG, server-Mac/OAuth/production, R/R+1/R+2, and activation pending. This repair preserves that boundary.

## Exact 22-error closure map

| # | Starting error | Repair |
| ---: | --- | --- |
| 1 | README:198 shared ownership item assigned to review 5 | kept `stage=4;scope=shared`, changed to `review=6`; Stage 5 only owns frontend-scoped review |
| 2 | README:201 Stage 6 gate assigned to review 5 | removed the misclassified review gate from the Stage 4 Delivery Checklist; current-head independent review remains explicit in Lifecycle / Stage Boundary |
| 3 | acceptance:49 shared Stage 2/3 boundary assigned to review 5 | changed to `review=6` |
| 4 | acceptance:50 shared #9 ownership boundary assigned to review 5 | changed to `review=6` |
| 5 | acceptance:51 shared #12 ownership boundary assigned to review 5 | changed to `review=6` |
| 6 | acceptance:52 shared no-invention boundary assigned to review 5 | changed to `review=6` |
| 7 | acceptance:83 shared lifecycle honesty assigned to review 5 | changed to `review=6` |
| 8 | acceptance:84 historical Stage 1 claim assigned to review 5 | converted from a false Stage 4 checklist owner to a plain historical boundary statement |
| 9 | acceptance:86 independent Stage 6 gate assigned to review 5 | converted from a false Stage 4 checklist owner to an explicit pending review boundary |
| 10 | acceptance:96 Manual physical keyboard item missing metadata | made `Manual Only` a canonical `###` subsection; remains unchecked |
| 11 | acceptance:97 Manual VoiceOver/TalkBack item missing metadata | same canonical Manual subsection; remains unchecked |
| 12 | acceptance:98 Manual real-device/virtual-keyboard item missing metadata | same canonical Manual subsection; remains unchecked |
| 13 | acceptance:99 Manual server-Mac/OAuth item missing metadata | same canonical Manual subsection; remains unchecked |
| 14 | acceptance:100 Manual R/R+1/R+2/activation item missing metadata | same canonical Manual subsection; remains unchecked |
| 15 | README Design Status temporary/unrecognized | added the parser-recognized checklist and selected only `confirmed`, backed by fresh Stage 5 and final authority |
| 16 | README:201 unchecked Stage 4 item | removed the Stage 6-owned gate from Stage 4 delivery ownership; it remains explicit and pending outside the delivery checklist |
| 17 | acceptance:16 unchecked creation-off drain | moved to Manual Only without checking it |
| 18 | acceptance:67 unchecked virtual-keyboard claim | narrowed to the proven deterministic viewport/runtime contract and checked it; actual OS virtual keyboard remains unchecked in Manual Only |
| 19 | acceptance:77 unchecked read-only real smoke | moved to Manual Only without checking it |
| 20 | acceptance:84 unchecked historical Stage 1 claim | removed false Stage 4 ownership and kept the historical statement without a completion checkbox |
| 21 | acceptance:86 unchecked fresh Stage 6 claim | removed false Stage 4 ownership and kept the current publication-head review explicitly pending |
| 22 | README Design Authority section unrecognized | renamed to canonical `## Design Authority` and added parser keys for UI risk, anchor dependency, visual artifact, authority status, and notes |

Real authentication return-to-action and real other-owner nondisclosure were also moved from completed Stage 4 checkboxes into Manual Only so the repair does not overclaim an environment/account proof that the authority reports explicitly leave pending.

## Lifecycle and remaining pending work

No lifecycle projection was promoted. The governing state remains:

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- roadmap: `in-progress`
- merge and activation: pending

Unchecked Manual Only work remains: physical keyboard; VoiceOver/TalkBack; real 320/390 device safe area and OS virtual keyboard; creation-off drain; #8 real read smoke; real auth and other-owner accounts; server-Mac/OAuth; production/remote DB; full WCAG; R/R+1/R+2; capability activation.

The repair publication head still requires a fresh independent rereview. This author does not approve it.

## Verification

After `pnpm install --frozen-lockfile` restored the declared workspace dependencies without changing `package.json` or `pnpm-lock.yaml`:

| Command / gate | Result |
| --- | --- |
| Ready-context `validate:closeout-sync` | passed; all 22 starting errors closed |
| focused Vitest: checklist contract, closeout validator, authority presence, cooked-batch Stage 1 repair | 4 files / 64 tests passed |
| `pnpm validate:source-of-truth-sync` | passed |
| `pnpm validate:workflow-v2` | passed |
| Ready-context `pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui` | passed |
| successor-context `pnpm validate:workpack -- --slice cooked-batch-weight-ui` | passed |
| `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ui` | passed; automation spec unchanged |
| Ready-context `pnpm validate:omo-bookkeeping` | passed |
| live PR body `validate-pr-ready --mode frontend` | passed using a reusable temporary body file |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |

The first PR-body Ready invocation used `/dev/stdin`; the validator and its nested validators need to reread the body, so that single-use stream produced a non-product exploratory-evidence input failure. It was rerun with the same live PR body materialized by zsh as a reusable temporary file and passed.

The exact repair commit head/tree and commit-policy result are recorded in the final handoff because a commit cannot contain its own SHA.
