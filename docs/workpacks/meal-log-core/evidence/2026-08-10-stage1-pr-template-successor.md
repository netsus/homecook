# meal-log-core Stage 1 PR-template failure successor evidence

## Scope and actor separation

- evidence date: `2026-08-10 KST`
- successor evidence author task ID: `019fe78d-7d54-7f63-a0a5-898782eeb84b`
- source coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- PR-body repair supervisor task ID: `019fe785-ad35-78b3-b3e4-5169e80e4c56`
- prior final independent reviewer task ID: `019fe77d-ca59-78f0-a53c-2d24c7200671`
- role: evidence-only successor author; not the Stage 1 author, repair author, independent reviewer, or merge approver
- actor constraint: GPT-5.6-Sol high; Claude was not used
- pull request: `#1316`, Draft/Open, `master` <- `docs/meal-log-core-stage1-repair-rereview`

This task does not approve its own change. Its only repository write is this evidence file. It does not edit the PR body, rerun a check, transition the PR to Ready, merge, send Discord, start Stage 2, or activate any capability.

## Exact failed identity and lineage

| item | exact value |
| --- | --- |
| failed head | `c6d1c1c741783a547a9298256b95319700d0e347` |
| failed tree | `1485fbcfbe8e18633f2ac0fabebe3d80e7bf2230` |
| failed-head parent / reviewed repair head | `8ab86d1b0aa11e2a715ebe4f7288822f031e36e6` |
| failed-head parent tree | `1cdf60a6c117a4bb1ea8f18b2eff66db6743b47d` |
| governing base | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| governing base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| failed workflow run | `31326084633`, `PR Governance`, conclusion `failure` |
| failed job | `93276569040`, `template-check`, conclusion `failure` |
| failed step | `Validate PR body sections`, step `4`, conclusion `failure` |

GitHub's job record binds the run, job, branch, and head above directly. The step ran `node scripts/check-pr-body.mjs` against the pull-request body and exited `1` after reporting the exact five missing required headings:

1. `## Workpack / Slice`
2. `## Test Plan`
3. `## QA Evidence`
4. `## Actual Verification`
5. `## Closeout Sync`

## Raw failed-head check inventory

Direct GitHub commit check-run inspection for exact head `c6d1c1c...` returned the following timestamped raw snapshot at `2026-08-09T17:31:58.094Z`:

- reported total: `20`
- returned check runs: `20`
- terminal success: `13`
- intended skipped: `5`
- terminal failure: `1`
- pending/in progress: `1`
- cancelled: `0`
- rerun: `0`

The terminal failure is job `93276569040`. The pending external item is check-run `93276025701`, `GitGuardian Security Checks`, which remained `in_progress` from `2026-08-09T17:14:07Z` through the observation timestamp and had no completion timestamp. After the body repair, same-head PR metadata events started later governance runs: `template-check` job `93276993331` succeeded, together with later successful `policy` and `labeler` jobs. Those later same-head successes do not delete the raw failure or create a new commit identity. Therefore this non-terminal `20 = 13 success + 5 skipped + 1 failure + 1 pending`, cancel/rerun `0/0`, snapshot is diagnostic evidence only. The template failure independently disqualifies the discarded head regardless of the external pending check or later same-head template success.

## Root cause and defect boundary

The exact failure is a PR metadata template-completeness issue: the PR body present in run `31326084633` omitted five headings required by the repository's PR-body validator. The validator detected and listed those omissions as designed.

This evidence does not indicate a repository source, product, public contract, migration, workflow implementation, or dependency defect. In particular:

- the failed head's report-only commit changed one existing evidence file and preserved the fresh independent APPROVE report;
- product/runtime code, official documents, migrations, CI workflow files, scripts, `package.json`, and `pnpm-lock.yaml` did not change in that commit;
- no failing product, contract, SQL, migration, authorization, dependency-install, lint, typecheck, or focused-test output appears in the failed step;
- no workflow change is required because the existing validator correctly enforced the repository template.

The repair belongs to PR metadata, not repository content. The supervisor corrected that metadata without changing the failed commit.

## Corrected current body verification

Two consecutive direct GitHub API reads of the current PR body were stable:

- UTF-8 bytes: `10054`
- SHA-256: `0fea0da5515bbcf3e176cde3b1de7733185116d038769a29029c982eba4f3c37`
- all five exact required headings: present
- `node scripts/check-pr-body.mjs /dev/stdin`: `PR body sections OK`

The current PR remains Draft/Open at failed head `c6d1c1c...` and governing base `c16102a...`. This task preserves the corrected body exactly and does not edit it.

## Successor-head proof rule

Neither a rerun nor a PR-body-triggered run on failed head `c6d1c1c...` may be used as final merge proof. The body is now structurally valid, but commit identity has not changed and the raw same-head inventory contains the original failure.

This evidence file must be committed as a new evidence-only successor commit whose direct parent is `c6d1c1c...`. Immediately before push, remote `refs/heads/docs/meal-log-core-stage1-repair-rereview` must still equal exact `c6d1c1c...`. Only then may the successor commit be pushed by non-force fast-forward. The successor must start a new raw current-head check set, and only that new-head set may later become merge proof.

This task does not claim the successor check set is green and does not perform the later Ready or merge decision.

## Prior approval and pending boundaries

The prior final independent report remains unchanged at `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-ci-check-count-final-rereview.md`. Reviewer task `019fe77d...` recorded **APPROVE**, findings `P0 0 / P1 0 / P2 0`, and unresolved required findings `0` for reviewed repair head `8ab86d1b...` and tree `1cdf60a6...`. Failed head `c6d1c1c...` integrates that report without changing the approved Stage 1 contract.

The approval and this metadata repair do not promote lifecycle state:

- roadmap: `docs`
- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- auto merge: `false`

Stage 2, Manual/server-Mac/OAuth evidence, runtime DB/routes, capability, R/R+1/R+2, production/staging activation, and cross-slice release evidence remain pending. Discord is untouched. This evidence contains no secret, token, credential, private key, provider payload, or URL literal.

## Verification

| command / check | result |
| --- | --- |
| PR state/base/head/body direct inspection | PASS; Draft/Open, exact identities above |
| failed run/job/step/log direct inspection | PASS; exact five-heading failure above |
| failed-head raw check-run inspection | PASS at `2026-08-09T17:31:58.094Z`; `20 = 13 success + 5 skipped + 1 failure + 1 pending`, cancel/rerun `0/0` |
| current body double-read bytes/hash | PASS; stable across two reads |
| current body local template validator | PASS; `PR body sections OK` |
| six Stage 1 validators | PASS |
| focused Stage 1 Vitest suite | PASS; `6 files / 53 tests` |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm audit --audit-level high` | PASS; exit `0`, high `0`, moderate `1`, low `1` |
| one-file scope, secret/URL scan, lineage and `git diff --check` | PASS |

Runtime/PostgreSQL/route/E2E/server-Mac/OAuth/capability/R/R+1/R+2/production checks were not run and are not claimed by this evidence-only successor task.
