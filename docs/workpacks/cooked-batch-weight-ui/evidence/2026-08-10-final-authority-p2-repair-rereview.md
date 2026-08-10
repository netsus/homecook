# cooked-batch-weight-ui final product-design-authority P2 repair rereview

## Review identity and independence

- authority task ID: `019feb94-4d4f-7831-9000-01eaaf3a7569`
- role: fresh independent final `product-design-authority`
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- PR / source branch: #1323 / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- reviewed current head/tree: `a17b0961f9aca4fc6ec740d62f81022fded962fc` / `24ff607e761b087722a37ce03035fa76a89cfd85`
- product repair head/tree: `a381f23237c001b232172317a948770d0efa364b` / `0f72334bdebe4e5930858aa781050b7391b91d`
- fresh evidence head/tree: `531055aca7038041411293b8a7e10a9cd27c2e8c` / `8cba47ba73792536f422e19ea5ca381f057c57e5`
- fresh Stage 5 task/report: `019feb85-1b83-7662-9c10-ab91d834c4f6` / `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage5-p2-repair-rereview.md`

This task is different from the author, Stage 4 repair, evidence generator, prior authority, Stage 5, and integration tasks. It did not repair product code, tests, screenshots, runtime artifacts, manifests, contracts, or closeout state. It publishes only this final authority report. It performed no Stage 6, Ready transition, merge, Discord notification, production or remote DB action, or capability activation.

The commit containing this report is a report-publication successor, not a product/evidence review target and not self-approval. Its exact head/tree and current-head check inventory belong in the final handoff after publication checks finish.

## Live PR, lineage, and current-head verification

Live GitHub inspection confirmed PR #1323 is `OPEN` and `Draft`, with source branch `feature/fe-cooked-batch-weight-ui-superseding-draft`, base `master`, and exact head `a17b0961f9aca4fc6ec740d62f81022fded962fc`. The local and remote branch heads matched, and the reviewed tree was `24ff607e761b087722a37ce03035fa76a89cfd85`.

Lineage is monotonic and exact: `a381f232…` is an ancestor and direct product-repair parent of fresh evidence `531055ac…`; `531055ac…` is the direct parent of Stage 5 report publication `a17b0961…`. The repair/evidence range changes only the two scoped frontend components, focused tests, deterministic evidence spec/artifacts, and the two repair/review reports. It adds no Route Handler, RPC, migration, DB/schema write, server helper, dependency, endpoint, public field, status, error code, or action.

At reviewed head `a17b0961…`, all **15 started checks were terminal: 13 SUCCESS + 2 intended SKIPPED** (`lighthouse`, `full-regression`). Failed, pending, cancelled, neutral, and rerun checks were `0`.

## Evidence set and direct inspection

The handoff's descriptive `docs/workpacks/.../evidence/*.png` paths are not literal PNG locations in this tree. The workpack automation contract and manifest canonically locate them under `ui/designs/evidence/cooked-batch-weight-ui/`. The manifest SHA-256 is `852644716ad44b8854f2be01964cdfb43ba4cfc3e01bd6e581b8cc36eb394f89`, captured at `2026-08-10T11:42:51.017Z`, and records implementation head/tree `a381f232…` / `0f72334b…` with viewport matrix `320/390/1440`.

The following current artifacts were opened directly with `view_image detail=original`:

| Step | Evidence | Health |
| ---: | --- | --- |
| 1 | `COOK_MODE-mobile-narrow-320-known.png` (`320×568`) | **Healthy** — primary-first vertical footer, 48px controls, clear input hierarchy, no visible horizontal clipping |
| 2 | `COOK_MODE-mobile-narrow-320-pending-error-replay.png` (`320×568`) | **Healthy** — retained error context, locked primary action, fixed footer containment, readable recovery copy |
| 3 | `COOK_MODE-mobile-default-390-known.png` (`390×844`) | **Healthy** — familiar horizontal `돌아가기 | 완료 저장` hierarchy is preserved |
| 4 | `COOK_MODE-desktop-state-matrix.png` (`1440×1000`) | **Healthy** — wide horizontal footer and centered sheet remain stable without stretching the task surface |
| 5 | `LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png` (`390×2296`) | **Healthy** — legacy and batch sections stay distinct; known, missing, and unrecoverable truth is not collapsed into guessed grams |
| 6 | `LEFTOVERS-mobile-default-390-legacy-null-depleted.png` (`390×3472`) | **Healthy** — legacy-null and six depleted outcomes remain read-only and visually distinct; exact current closure cancellation stays secondary |
| 7 | `LEFTOVERS-mobile-narrow-320-actions.png` (`320×568`) | **Healthy** — destructive result summary is legible; safe `입력 수정` precedes danger `버림 기록`; both controls are 48px and 16px |
| 8 | `LEFTOVERS-mobile-narrow-320-pending-error.png` (`320×568`) | **Healthy** — 422 recovery retains values and keeps the safe-cancel-first footer reachable without horizontal overflow |
| 9 | `LEFTOVERS-desktop-state-matrix.png` (`1440×2127`) | **Healthy** — wide list hierarchy, action grouping, pagination, and state labels regress neither mobile truth nor desktop scanability |

The long 390px LEFTOVERS captures contain repeated fixed navigation from full-page screenshot stitching. The native 320px viewport evidence and runtime geometry do not reproduce that as sheet clipping or page-level overflow, so it is capture context rather than a product finding.

## Final verdict

**APPROVE — fresh independent final product-design-authority**

| Severity | Count | Required finding IDs |
| --- | ---: | --- |
| P0 blocker | 0 | none |
| P1 major | 0 | none |
| P2 minor | 0 | none |

- unresolved required findings: **0**
- prior P2 recurrence: **0**
- closed without recurrence: `CBW-FA-P2-01`, `CBW-FA-P2-02`
- approval threshold: blocker/major `0/0`, with no prior required P2 recurrence
- result: threshold satisfied for the exact reviewed current head/tree only

## Product-design findings

### Mobile UX and responsive hierarchy

COOK_MODE at 320px now uses the approved primary-first vertical footer in both actual DOM and visible order. The primary and secondary controls are full-width, 48px high, use 16px button text, and remain inside the viewport. At 390px and 1440px the existing horizontal `돌아가기 | 완료 저장` arrangement is preserved, so the narrow repair does not redesign the wider interaction model.

LEFTOVERS at 320px and 390px preserves safe-cancel-first order in both DOM and visible layout. Destructive confirmation remains visually distinct through danger treatment and explicit current/amount/result/reason copy. Footer labels compute to 16px and controls to 48px; the former 13px token drift does not recur.

### Scroll structure and familiar pattern

Both task surfaces use the existing familiar bottom-sheet model: background/body scroll lock, bounded `100dvh` sheet, sheet-internal vertical scroll, and a fixed footer with safe-area padding. The evidence shows no page-level horizontal movement or ambiguous nested list scrolling. Long LEFTOVERS content remains one vertical page journey, while short corrective actions stay in focused sheets.

### Visual hierarchy and state truth

The sequence page section → batch card → state/action → confirmation remains easy to scan. Primary completion, neutral correction, and destructive actions do not compete visually. Known, missing, unrecoverable, legacy-null, and depleted projections are distinguishable without relying on color alone. The six depleted reasons remain distinct, generic reopen is absent, and #12 consumed-amount UI is not preclaimed.

### Focus, keyboard, error recovery, and overflow

The runtime artifact and generating assertions record focus trap/restore, pending Escape/dismiss lock, 409 input retention, 422 alert focus and field linkage, same-key replay reuse, 48px controls, 16px LEFTOVERS footer text, and no horizontal overflow at 320/390/1440. Pending/error/replay/close/discard flows preserve safe inputs and do not expose duplicate submission or unsafe dismissal.

### Coverage and contract boundary

The manifest, original-size images, runtime JSON, component code, focused regressions, and fresh Stage 5 report collectively cover loading, empty, known, missing, unrecoverable, legacy-null, depleted, pending, error, replay, close, discard, adjust, and exact cancel-current boundaries. The repair and evidence successor add no API, DB, schema, permission, dependency, or public contract change. #11 remains a client/UI consumer of the existing #8 contract; #9 and #12 ownership stays intact.

## Residual Manual boundary

The mock screenshots, deterministic browser runtime harness, and JSON artifacts do **not** prove the following:

- actual OS virtual-keyboard occlusion, resize timing, and scroll-to-active-field behavior;
- physical keyboard Tab / Shift+Tab / Escape timing in a real browser;
- VoiceOver / TalkBack reading order, names, descriptions, and live announcements;
- actual-device 320px/390px safe-area and mobile browser-chrome behavior;
- full WCAG conformance or every full-page contrast node;
- production authentication/permission accounts, other-owner behavior, server-Mac/OAuth, production or remote DB behavior;
- R/R+1/R+2 or capability activation.

These remain **Residual Manual**, not waived or completed claims. They do not create a screenshot-supported product defect in this authority review, but this approval must not be presented as physical-device, assistive-technology, full-WCAG, production-auth, production, remote-DB, or activation proof. The existing COOK_MODE full-page contrast residual remains exactly two legacy nodes; the #11 selector-scoped serious/critical count is zero and is not a page-wide-zero claim.

## Handoff boundary

This approval authorizes only the next **fresh independent Stage 6** review to evaluate the publication head after every newly started check is terminal green or an intended skip. PR #1323 must remain Draft here. This task does not authorize or perform Stage 6, Ready, merge, Discord, production/remote DB work, or activation.
