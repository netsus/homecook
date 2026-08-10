# cooked-batch-weight-ui Stage 6 Ready-repair closeout rereview

## Review identity and independence

- reviewer task ID: `019fec3d-f339-7f90-ad69-611e37a0d2e0`
- role: fresh independent Stage 6 Ready-repair closeout rereviewer
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- PR / branch: [#1323](https://github.com/netsus/homecook/pull/1323) / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- reviewed head / tree: `829d18df78b1cb2a2a0dd3a1fd159f3499d41ef2` / `d0ef8e97332b067ad418288be89b90380f03b34d`
- reviewed base: `master` at `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`
- prior approved Stage 6 task / reviewed head: `019febc7-20c3-7182-94fd-da11761472bc` / `c777603883bca338739de186b01c95d0f2e4e611`
- focus repair task / commit: `019fe028-be31-76f2-a5a7-986000a93374` / `5daf67c5488de09c2e3256a1433a1cefc618c5c4`
- color-transition repair task / commit: `019fec15-9c36-7ee2-b551-5e40db0d547e` / `829d18df78b1cb2a2a0dd3a1fd159f3499d41ef2`
- preceding exact-head Ready-gate rereviewer conveyed in the PR body: `019fec2c-41f3-73e1-8a96-fff66ab413fa`, `APPROVE 0/0/0`, unresolved `0`

This task is distinct from every product author, Stage 4 evidence author, Stage 5 reviewer, final authority, prior Stage 6 reviewer, merge supervisor, and both Ready-repair authors. It reviewed the exact live target and publishes only this report. It did not modify product code, tests, PNGs, runtime JSON, manifest, public contracts, closeout projections, or the PR body, and it did not perform Ready, merge, Discord, production, remote DB, server-Mac/OAuth, R/R+1/R+2, or capability activation work.

The commit containing this report is a report-only publication successor. It is not the reviewed repair tuple and cannot self-approve its own publication head. The exact publication head/tree and its newly started terminal check inventory belong in the final handoff.

## Exact target reconciliation

The live GitHub tuple and local tuple matched before review:

| Item | Verified value |
| --- | --- |
| PR state | `OPEN`, `Draft`, `CLEAN`, `MERGEABLE` |
| Source branch | `feature/fe-cooked-batch-weight-ui-superseding-draft` |
| Reviewed head | `829d18df78b1cb2a2a0dd3a1fd159f3499d41ef2` |
| Reviewed tree | `d0ef8e97332b067ad418288be89b90380f03b34d` |
| Local branch ref / detached HEAD | both matched the reviewed head and tree |
| Base | `master` at `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` |
| Inventory | 55 changed files / 14 commits |
| Decoded PR body SHA-256 | `e24f2fc2fc3dfcab3378aef9b3bb65ad40451c826fd5a3c3c7b917e9a01147d4` |
| Canonical checks | 15 terminal = 13 `SUCCESS` + 2 intended `SKIPPED` |
| Raw check runs | 21 terminal = 19 `SUCCESS` + 2 intended `SKIPPED` |
| Pending / failure / cancelled / rerun / neutral | `0 / 0 / 0 / 0 / 0` |

The intended skips were `full-regression` and `lighthouse`. The 15 canonical names were GitGuardian Security Checks, accessibility, build, changes, full-regression, hybrid-authority-runtime, labeler, lighthouse, policy, quality, security-function-authorization, security-smoke, smoke, template-check, and visual. Raw duplicates were successful metadata-triggered labeler, policy, and template-check runs.

## Projection and scope continuity

The range from the prior Stage 6 report publication `0354922111404595155311b942596ec2e886bd2b` to the reviewed head changes exactly four paths:

1. `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts`
2. `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts`
3. `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-ready-full-regression-focus-contract-repair.md`
4. `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage4-color-transition-harness-repair.md`

Therefore the prior approved Stage 6 product and closeout projection remains unchanged:

- `.workflow-v2/work-items/cooked-batch-weight-ui.json` and `.workflow-v2/status.json` retain `planned / not_started / pending / not_started`, the non-terminal Draft/merge boundary, #9 integration, and all Manual/future obligations;
- the slice README retains Design Status `confirmed`, completed Stage 5/final-authority evidence, and non-terminal broader lifecycle wording;
- acceptance retains proven automated items while creation-off drain, real read, actual virtual keyboard, fresh merge/Ready lifecycle, and Manual obligations remain unchecked where required;
- `automation-spec.json` is byte-unchanged and keeps the strict current/future/Manual assertions;
- the roadmap remains `in-progress`, preserves #9 merged ownership, and does not preclaim #12 consumed-amount UI.

There are zero changes in product components, product runtime, PNGs, manifest, API, DB, schema, migrations, dependencies, official five-document contracts, public fields/status/errors/actions, or #9/#12 ownership surfaces in this successor range.

## Repair review

### 320px focus contract

The focus repair replaces the stale one-step expectation with the approved actual 320px DOM order:

`완료 저장 -> Tab -> 돌아가기 -> Tab -> 닫기`

and the exact reverse traversal:

`닫기 -> Shift+Tab -> 돌아가기 -> Shift+Tab -> 완료 저장`.

The test explicitly sets `320x568`, verifies focus at every step, then verifies Escape closes the dialog and restores the opener. It does not skip the case, weaken focus assertions, increase timeout, or change the product component. This matches the approved primary-first 320px DOM contract while leaving 390px/desktop presentation unchanged.

### Strict destructive-color proof

The color repair preserves the exact destructive-color assertion `maxRgbChannelDelta(...) <= 1`. Before reading computed colors it now moves the pointer to `(0, 0)`, waits for the footer buttons' actual Web Animations API animations to finish, and waits two `requestAnimationFrame` paints. It changes no tolerance, assertion, retry, timeout, worker count, screenshot criterion, product style, or evidence contract. It determinizes only hover/transition timing and does not globally disable transitions before the measurement.

## Independent focused verification

The first Playwright attempt stopped before test execution because this worktree had no installed `playwright` binary. `pnpm install --frozen-lockfile` restored the declared lockfile environment without changing `package.json` or `pnpm-lock.yaml`; the intended commands were then rerun successfully.

| Verification | Result |
| --- | --- |
| 320px focus/CTA target, desktop + mobile, repeat 3 each | **6 passed** |
| Stage 4 viewport/state/a11y matrix target, `--repeat-each=5 --workers=5` | **5 passed** |
| Stage 1 closeout projection regression | **1 file / 7 tests passed** |
| source-of-truth sync | passed |
| successor-context workpack validation | passed |
| automation-spec validation | passed |
| workflow-v2 validation | passed |
| OMO bookkeeping validation | passed |
| Draft closeout-sync validation | passed |
| Draft authority-evidence-presence validation | passed |
| exact PR body section validation | passed |
| exact PR body Ready-equivalent frontend validation | passed |
| branch validation | passed |
| commit policy | **14 commits passed** |
| `git diff --check` | passed |

The matrix stress run regenerated three PNGs and `manifest.json`. Those four tracked artifacts were restored from the exact reviewed HEAD. The aggregate checksum command over the tracked cooked-batch evidence inventory returned `75315a777abc430e77352ca80febd89502d93ac5251e1444e08a55dcd65fe5fd` both before and after the run, and the worktree returned clean.

The full `pnpm verify:frontend` was not rerun in this report-only task because the color-repair author already recorded exit `0` at the reviewed product/test head, including regression `952 passed / 170 intended skipped`, accessibility `18 / 15`, visual `23 / 22`, security `12`, Lighthouse `6`, build `81` static pages, and product Vitest `2729 / 175`. This independent review instead reran both repaired targets under repeat/concurrency, reran projection and governance validators, and reconciled all exact-current-head GitHub checks. Repeating the full artifact-writing gate would add no distinct coverage needed for this report and would increase restoration risk.

## Findings and verdict

| Severity | Count | Required finding IDs |
| --- | ---: | --- |
| P0 blocker | 0 | none |
| P1 major | 0 | none |
| P2 minor | 0 | none |

- unresolved required findings: **0**
- focus-contract drift: **0**
- strict-assertion weakening: **0**
- product / contract / evidence-asset drift: **0**

**APPROVE — fresh independent Stage 6 Ready-repair closeout rereview for exact reviewed head/tree `829d18df78b1cb2a2a0dd3a1fd159f3499d41ef2` / `d0ef8e97332b067ad418288be89b90380f03b34d`.**

The GitHub account cannot supply an independent platform self-approval to its own PR. Independence is therefore recorded as this distinct task ID plus the exact reviewed head/tree, evidence, findings, and verdict. This report does not approve its own publication successor and does not authorize Ready or merge.

## Residual Manual and lifecycle boundary

The following remain pending and are not waived or converted into mock/local completion claims:

- actual OS virtual-keyboard occlusion, resize, and scroll-to-active-field behavior;
- physical keyboard Tab / Shift+Tab / Escape timing in a real browser;
- VoiceOver / TalkBack reading order, names, descriptions, focus, and live announcements;
- physical-device 320px/390px safe area and browser chrome;
- full WCAG conformance, including the two inherited COOK_MODE full-page contrast residual nodes;
- real authentication and other-owner accounts;
- server-Mac/OAuth and production/remote DB behavior;
- R/R+1/R+2 and capability activation.

PR #1323 remains `OPEN` and `Draft`. Ready, merge, broader lifecycle completion, Manual verification, and activation are pending. After this report-only commit is pushed, all newly started checks on the publication head must be terminal success or intended skip before the report can be handed off.
