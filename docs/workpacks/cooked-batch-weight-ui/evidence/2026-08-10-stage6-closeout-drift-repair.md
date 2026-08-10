# cooked-batch-weight-ui Stage 6 closeout drift repair

## Identity and scope

- repair task ID: `019febac-5498-73e0-bacf-b6948ff9c3a0`
- role: fresh Stage 6 HOLD repair author
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- source PR / branch: [#1323](https://github.com/netsus/homecook/pull/1323) / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- independent Stage 6 reviewer task: `019feba0-7a3b-7851-bcf0-4ea106cc7c3c`
- reviewed head / tree: `6cbfaf053b63d119f91225ce5fec500a229a7ad1` / `c337a9a46552d94bfd7863ef1d03f23af4bfcb3e`
- reviewed PR body SHA-256: `31906b6e29b141b31afa5708ebbcb82e7144485731db0681cde96af4f07d5c0e`
- reviewed PR inventory: 48 files, 9 commits, 15 terminal checks = 13 `SUCCESS` + 2 intended `SKIPPED`
- Stage 6 verdict: `HOLD`, `P0/P1/P2 = 0/2/0`
- required finding IDs: `CBW-S6-P1-01`, `CBW-S6-P1-02`

This task repairs only the two required closeout findings. It does not change product components, tests, PNGs, runtime artifacts, API, DB, schema, public contracts, dependencies, or automation requirements. It does not perform Stage 6 approval, Ready transition, merge, Discord notification, production/remote DB/server-Mac/OAuth work, or capability activation.

## Latest master integration

Before repair, local `master`, `origin/master`, and GitHub `master` were all `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`, the squash merge of #9 PR #1319. The #11 remote branch and PR head were both `6cbfaf053b63d119f91225ce5fec500a229a7ad1`.

Latest master was integrated through normal non-rewriting two-parent merge `2965c84b832b22595b19c8ef2aab1dfde58bdbcc` with parents:

1. `6cbfaf053b63d119f91225ce5fec500a229a7ad1`
2. `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`

The merge was conflict-free and produced tree `0a424f57656f3c8a504a47263c66b382d619bbd1`. It preserved the merged #9 implementation and its roadmap/status projection while retaining every existing #11 product/evidence path. No rebase, amend, reset, force-push, or branch recreation was used.

## `CBW-S6-P1-01` closure

The PR body is replaced only after the repair publication commit supplies the exact successor head/tree and GitHub supplies the final file/commit/check inventory. The new body records:

- lineage `a381f232… -> 531055ac… -> a17b0961… -> 6cbfaf05…`;
- the two-parent latest-master integration and the repair publication head;
- exact current head/tree, changed-file count, commit count, and all started check conclusions;
- fresh Stage 5 task/report `APPROVE 0/0/0`;
- fresh final authority task/report `APPROVE 0/0/0`;
- Stage 6 `HOLD 0/2/0`, this repair, and fresh-rereview requirement;
- structured QA Evidence fields with retained artifact/report paths;
- `Actual Verification`, `Closeout Sync`, `Merge Gate`, and residual Manual boundaries.

The decoded body hash is computed from the exact body file after `gh pr edit` and reported in the final repair handoff. A body-only edit creates no commit and is not treated as canonical truth by itself.

## `CBW-S6-P1-02` closure

The repair synchronizes only the allowed closeout/bookkeeping surfaces:

- `.workflow-v2/work-items/cooked-batch-weight-ui.json`: PR #1323, current product/evidence/review lineage, #9 integration, Stage 5/final authority facts, Stage 6 HOLD/repair status, current verification commands, and preserved future/Manual obligations;
- `.workflow-v2/status.json`: current branch/PR path and focused closeout commands while keeping lifecycle/approval/verification/evaluation at the governing non-final `planned / not_started / pending / not_started` state;
- `docs/workpacks/cooked-batch-weight-ui/README.md`: Design Status `confirmed`, evidence readiness, fresh Stage 5/final authority `APPROVE 0/0/0`, and fresh Stage 6 rereview pending;
- `docs/workpacks/cooked-batch-weight-ui/acceptance.md`: only evidence freshness and already-proven review evidence are checked; Stage 6, real read, creation-off drain, virtual keyboard, and Manual boundaries remain unchecked;
- `docs/workpacks/README.md`: #11 moves from `docs` to the non-terminal `in-progress` roadmap state while #9 merged facts remain intact.

`docs/workpacks/cooked-batch-weight-ui/automation-spec.json` is intentionally unchanged. Its current/future/Manual contract remains strict, and no validator or governing document required a contract change.

## Verification

Verification results recorded against the repair diff before commit and push:

- exact focused cooked-batch Vitest: **7 files / 21 tests passed**;
- full `pnpm lint`: **passed**;
- `pnpm typecheck`: **passed**;
- source-of-truth sync: **passed**;
- workpack validation in canonical successor branch context: **passed**;
- automation-spec validation: **passed** with the file unchanged;
- workflow-v2 validation: **passed**;
- OMO bookkeeping validation: **passed**;
- closeout-sync validation: **passed**;
- Draft authority-evidence-presence validation: **passed**;
- Stage 1 projection regression: **1 file / 7 tests passed** after retaining the #8 predecessor tuple;
- `git diff --check`: **passed**.

The exact repair publication head/tree cannot be embedded in the commit that creates it. After publication, the PR body is updated with that exact tuple, re-downloaded into a real temporary body file, and validated in both Draft-context and Ready-equivalent contexts. Those body-only results and the successor-head GitHub check inventory are recorded in the updated PR body and final handoff rather than falsely preclaimed here.

## Manual and review boundary

These remain pending and are not waived:

- actual OS virtual-keyboard occlusion and resize timing;
- physical keyboard Tab / Shift+Tab / Escape timing;
- VoiceOver / TalkBack reading order and live announcements;
- actual 320px/390px device safe-area and browser chrome;
- full WCAG and the two existing COOK_MODE full-page contrast residual nodes;
- real authentication/other-owner accounts;
- server-Mac/OAuth, production/remote DB, R/R+1/R+2, and capability activation.

This author does not approve its own repair. A new fresh independent Stage 6 reviewer must review the repair publication head and its terminal check inventory before any Ready or merge decision.
