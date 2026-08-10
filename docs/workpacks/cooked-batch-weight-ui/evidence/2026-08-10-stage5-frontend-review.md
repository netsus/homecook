# cooked-batch-weight-ui Stage 5 frontend review

## Review identity and exact inputs

- reviewer task ID: `019feb20-7e66-73e3-9b92-ccf95b0fab58`
- role: fresh independent Stage 5 frontend code/design reviewer
- reviewed product head/tree: `4c5145e01ac62db527f144e2d2df0f97efea2e4b` / `0af6a107be2d1888dbfe5ed09da17a0906d53c18`
- report-input and pre-publication PR head/tree: `9d78b96ed848b7e55c937386c744ebe91d8a09c7` / `dbad59f728b048738afeae617e737b177d12a224`
- base `master`: `df96c2113f60f1c3efcdb1080e3490d414c73200`
- source branch / PR: `feature/fe-cooked-batch-weight-ui-superseding-draft` / PR #1323
- preceding authority task: `019feb0a-f4ba-7812-b250-375264eec1c4`
- preceding authority report: `ui/designs/authority/COOK_MODE-cooked-batch-weight-ui-authority.md`
- preserved product patch / blob-list hashes: `2bb51802641a72f791d29376879b2377e224bbf0` / `70732532172cda33ae450265cd81f9c8fe704ac8`

The reviewed product tuple is `4c5145e0… / 0af6a107…`. Commit `9d78b96e…` adds only the preceding authority report and is the exact input parent for this review publication. The successor commit that publishes this file is self-authored report lineage, contains no reviewed product repair, and is excluded from this verdict; its exact SHA/tree must be carried in the final coordinator handoff and PR history rather than treated as a new reviewed product tuple.

This task is distinct from Stage 4 author/integrator and the preceding authority task. It performed no implementation repair, contract evolution, final authority, Stage 6, Ready transition, merge, Discord notification, production/remote DB/server-Mac/OAuth mutation, or activation.

## Verdict

**HOLD / REQUEST_CHANGES**

| Severity | Count | IDs |
| --- | ---: | --- |
| P0 | 0 | none |
| P1 | 0 | none |
| P2 | 2 | `CBW-FA-P2-01`, `CBW-FA-P2-02` |

- `required_fix_ids`: `CBW-FA-P2-01`, `CBW-FA-P2-02`
- unresolved required findings: **2**
- required Stage 5 approval threshold: actionable P0/P1/P2 `0/0/0` and unresolved required findings `0`
- current result: actionable P0/P1/P2 `0/0/2`; Stage 5 approval is withheld

The preceding authority's two residuals were independently re-evaluated rather than waived. Both remain concrete, locally repairable violations of governing design documents and therefore are actionable Stage 5 findings.

## Actionable findings

### CBW-FA-P2-01 — COOK 320px footer violates the approved stacked primary-first layout

**Severity: P2 · required**

`ui/designs/COOK_MODE.md` requires the 320px footer to stack `완료 저장` before `돌아가기` in both DOM and visual order. The current scoped wrapper in `components/cooking/cooked-batch-completion-sheet.tsx` only raises button typography to `text-base`; it passes the footer to `AppModalFooterActions` without a 320px layout/order contract. `components/shared/modal-footer-actions.tsx` renders a permanent horizontal `flex` row with cancel first and confirm second. The original-size `COOK_MODE-mobile-narrow-320-known.png` and `COOK_MODE-mobile-narrow-320-pending-error-replay.png` reproduce the horizontal cancel-to-submit footer.

**Actionable target:** repair only the COOK completion footer's narrow behavior so 320px uses two full-width rows with primary submit first in actual DOM and visual order while preserving the current 390px behavior, 44px minimum controls, pending lock, focus behavior, and safe-area containment. Do not apply CSS-only visual reordering to a cancel-first DOM and do not change the shared footer globally without proving every consumer.

**Missing regression lock:** add a focused assertion for the scoped narrow layout and actual DOM order. Existing tests prove labels, submission, pending state and COOK button typography, but do not lock the approved 320px stack/order.

### CBW-FA-P2-02 — LEFTOVERS action-sheet footer CTA uses 13px helper typography instead of the 16px button token

**Severity: P2 · required**

`docs/design/design-tokens.md` defines `text-base` as 16px for buttons and inputs, while `text-sm` is 13px for metadata/helper text. `components/shared/modal-footer-actions.tsx` assigns `text-sm` to both footer buttons. The COOK wrapper explicitly scopes `[&_button]:text-base`, but `components/leftovers/cooked-batch-action-sheet.tsx` provides only color variables, so all LEFTOVERS action-sheet footer CTAs continue to inherit 13px. The original-size 390/320 action-sheet evidence is consistent with the smaller footer label treatment.

**Actionable target:** scope the official 16px button token to the LEFTOVERS cooked-batch action-sheet footer without changing destructive safe-cancel-first DOM/visual order, pending lock, focus behavior, or unrelated shared-footer consumers.

**Missing regression lock:** add a focused wrapper/class or computed-style contract analogous to the existing COOK footer typography test.

## Scope and code review result

The review covered only checklist/workpack entries whose metadata has `scope=frontend` and whose `review` includes Stage 5. This includes the COOK completion contract and states, LEFTOVERS batch truth/actions, permission and replay boundaries, design artifact locks, mobile geometry/focus/evidence boundaries, fixtures/TDD lineage, and the frontend Delivery Checklist entries. Unchecked Manual/activation/real-account/evidence-projection rows were inspected as boundaries and remain unclaimed; this review does not mark shared workpack state.

Apart from the two findings above, no additional actionable P0/P1/P2 was found in the reviewed frontend scope:

- exact #8 request/response/error shapes are consumed without a new field, status, action, endpoint or fallback contract;
- unauthenticated state does not render private batch data; 401 returns to the auth boundary and other-owner nondisclosure remains server-authoritative;
- known, missing, unrecoverable, legacy-null and all six depleted reasons stay distinct and fail closed;
- unavailable actions remain absent, generic reopen and #12 consume UI are not introduced, and only the current eligible closure can be cancelled;
- mutation payloads retain official revision/idempotency fields, duplicate submit is blocked, and same-payload retry retains its UUID operation key;
- 409/422 paths retain correctable inputs, refresh server authority and link/focus official field errors; unknown fields do not expand the public contract;
- destructive second confirmation, pending dismiss lock, focus trap/restore, screen-reader semantics and horizontal-overflow runtime assertions are present;
- parsing rejects non-exact list/mutation projections instead of guessing zero, nutrition or availability state;
- no direct DML, dependency change, backend route/schema mutation, permission weakening, or material security/performance regression was identified.

No Contract Evolution Candidate was encountered.

## Original-size visual and runtime evidence

The following current screenshots were opened directly with original detail, not inferred from thumbnails:

- COOK 390: `container-helper`, `known`, `weigh-later` — each `390×844`
- COOK 320: `known`, `pending-error-replay` — each `320×568`
- LEFTOVERS 390: `known-missing-unrecoverable` `390×2296`; `legacy-null-depleted` `390×3472`
- LEFTOVERS 320: `actions`, `pending-error` — each `320×568`

The evidence manifest records capture time `2026-08-10T03:50:08.157Z`, implementation head/tree `6aac3c194f9606df8269fcd42a9cfa9f974fa1f0` / `cc2ebc645214433dada8492141ba950b5035a9d8`, and exactly 15 PNG plus 2 runtime JSON files. Runtime JSON records focus trap/restore, pending dismiss lock, 409/422 retention/linkage, same-key replay and no horizontal overflow. These mock/runtime artifacts are supporting evidence only; they do not prove physical keyboard timing, assistive technology behavior, real virtual-keyboard/safe-area behavior, real permission accounts or full WCAG conformance.

The two existing full-page COOK contrast nodes are recorded as legacy context. The #11 selector-scoped serious/critical count is `0`; no page-wide-zero or full-WCAG claim is made.

## Focused deterministic verification

Executed from the exact report-input worktree after `pnpm install --frozen-lockfile`; the install changed no tracked package or lock file. The earlier missing-runner/module-resolution setup attempts are not product failures and are excluded from the result.

| Verification | Result |
| --- | --- |
| `pnpm exec vitest run` — `cooked-batch-weight-ui`, `delayed-weight`, `lifecycle-actions`, `weight-ui-history` | **4 files / 11 tests passed** |
| `pnpm exec vitest run` — `completion-sheet`, `completion-replay`, `pantry-row-selection` | **3 files / 8 tests passed** |
| `pnpm typecheck` | **passed** |
| focused ESLint for reviewed components, API client and #11 tests/evidence spec | **passed** |
| `git diff --check` for base through reviewed product | **passed** |
| product patch hash reconstruction | `2bb51802641a72f791d29376879b2377e224bbf0` matched |

The canonical evidence Playwright spec was inspected but not rerun because it writes the committed screenshot/manifest/runtime evidence set and this task is report-only. The report-input PR head already had its started CI/QA/security checks terminal.

## PR and current-head checks at report input

- PR #1323: `OPEN` / `Draft` / `CLEAN` / `MERGEABLE`
- report-input PR head: `9d78b96ed848b7e55c937386c744ebe91d8a09c7`
- started checks: **15 terminal = 13 SUCCESS + 2 intended SKIPPED** (`lighthouse`, `full-regression`)
- pending/fail/cancelled/rerun/neutral: **0**
- PR body and exact base/head lineage were inspected. Stale prose that still says fresh authority is pending does not override the later authority publication at `9d78b96e…`; it should be refreshed only by the proper repair/integration owner, not by this report-only reviewer.

The successor report-publication head's newly started checks must also reach terminal state before coordinator handoff. Their exact final inventory belongs in the final response because they run after this file is committed.

## Manual and activation boundary

Still pending and not inferred from PNGs or mock JSON:

- physical keyboard Tab / Shift+Tab / Escape timing;
- VoiceOver / TalkBack;
- real virtual keyboard and device safe-area behavior;
- real permission/other-owner accounts and Stage 4 real-read smoke;
- full WCAG;
- server-Mac/OAuth, R/R+1/R+2 and capability activation.

PR #1323 must remain Draft. This verdict does not authorize final authority, Stage 6, Ready, merge or activation.

## Exact next handoff

Return to a separate Stage 4 frontend repair task at the self-authored report-publication head. That task must change only `CBW-FA-P2-01` and `CBW-FA-P2-02`, add focused regressions, recapture only affected evidence/manifest/runtime lineage as required, keep the PR Draft, and avoid contract expansion. After repair and terminal current-head checks, hand the new exact product/evidence tuple to a fresh independent Stage 5 review. A separate fresh final product-design authority may run only after Stage 5 reaches actionable P0/P1/P2 `0/0/0`; Stage 6 remains later and separate.
