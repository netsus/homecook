# cooked-batch-weight-ui Stage 5 P2 repair rereview

## Review identity and exact lineage

- reviewer task ID: `019feb85-1b83-7662-9c10-ab91d834c4f6`
- role: fresh independent Stage 5 frontend reviewer
- model: `GPT-5.6-Sol` / `high`
- Claude use: none
- PR / source branch: #1323 / `feature/fe-cooked-batch-weight-ui-superseding-draft`
- reviewed successor head/tree: `531055aca7038041411293b8a7e10a9cd27c2e8c` / `8cba47ba73792536f422e19ea5ca381f057c57e5`
- product repair head/tree: `a381f23237c001b232172317a948770d0efa364b` / `0f72334bdebeeb4e5930858aa781050b7391b91d`
- prior Stage 5 report head/task: `6f24aaf4b5d678850e35f3a37a8eb3c8100212ce` / `019feb20-7e66-73e3-9b92-ccf95b0fab58`
- repair task: `019feb34-89a1-7821-839a-857dabbb74bb`
- evidence generator task: `019feb70-fa6b-7ec3-8c5d-4d348b2da8fb`

Live GitHub inspection confirmed that PR #1323 was `OPEN` and `Draft`, its exact head was `531055ac…`, and the source branch and base were the expected successor branch and `master`. `531055ac…` has `a381f232…` as its direct parent. The repair commit changes only the two scoped frontend components, their focused regressions, and the repair report; the successor commit changes the deterministic evidence spec and affected evidence artifacts without changing product, API, or DB code.

The commit that publishes this report is a report-only successor to the reviewed tuple. It is not part of the product/evidence verdict and is not self-approved here. Its exact head/tree and post-publication check inventory belong in the final handoff and PR history.

This task performed no product/document/evidence repair other than creating this required review report. It performed no final authority, Stage 6, Ready transition, merge, Discord notification, production/remote DB mutation, or activation.

## Verdict

**APPROVE — Stage 5 frontend P2 repair rereview**

| Severity | Count | Required finding IDs |
| --- | ---: | --- |
| P0 | 0 | none |
| P1 | 0 | none |
| P2 | 0 | none |

- `required_fix_ids`: none
- prior required findings closed: `CBW-FA-P2-01`, `CBW-FA-P2-02`
- unresolved required findings: **0**
- approval threshold: actionable P0/P1/P2 `0/0/0` and both prior required findings closed
- result: threshold satisfied for this Stage 5 frontend rereview

This approval applies only to the exact reviewed product/evidence tuple. PR #1323 remains Draft. Final product-design authority, Stage 6, Ready, merge, and activation remain separate and unauthorized by this report.

## Prior finding closure

### `CBW-FA-P2-01` — closed

The COOK completion footer now owns a scoped responsive layout in `components/cooking/cooked-batch-completion-sheet.tsx`:

- the primary `완료 저장` control is first in actual DOM order;
- 320px uses a full-width vertical stack with the primary action first visually;
- 390px and 1440px preserve the familiar horizontal `돌아가기 | 완료 저장` presentation through the scoped wider breakpoint;
- both controls use the 48px large control token and 16px button typography;
- pending disables both controls and preserves viewport containment;
- the shared modal footer and unrelated consumers are unchanged.

The focused component regression locks the 320px classes, primary-first DOM order, full-width controls, and 48px height. The canonical browser spec additionally reads actual element rectangles and computed styles for 320/390/1440. Original-detail inspection of the two fresh COOK 320 PNGs showed the primary-first vertical hierarchy without clipping or horizontal overflow. The runtime JSON independently records primary-first DOM/visual order, stacked layout, 48px controls, pending lock, containment, and preserved 390/1440 layout.

### `CBW-FA-P2-02` — closed

The LEFTOVERS cooked-batch action sheet now scopes `[&_button]:text-base` in `components/leftovers/cooked-batch-action-sheet.tsx`, so its footer controls compute to 16px without changing the shared footer contract. `AppModalFooterActions` continues to render safe `취소` first in both DOM and visual order, followed by the danger-colored destructive confirmation; both controls remain 48px high.

The focused lifecycle regression locks the local 16px wrapper, `취소` then destructive-confirm DOM order, and 48px controls. The canonical browser spec verifies 320/390 computed font size, geometry, safe order, danger color, pending lock, and containment. Original-detail inspection of the 390 and both canonical 320 LEFTOVERS PNGs showed legible footer labels, cancel-first ordering, a visually distinct danger action, and no clipped controls. The runtime JSON records the same 16px, 48px, safe-cancel-first, danger-color, and viewport facts.

## Visual evidence and freshness provenance

The paths listed in the handoff under `docs/workpacks/.../evidence/` are not literal PNG paths in this worktree. The workpack automation spec and manifest canonically locate the artifacts under `ui/designs/evidence/cooked-batch-weight-ui/`. The two requested descriptive LEFTOVERS 320 names map to the canonical automation names `LEFTOVERS-mobile-narrow-320-actions.png` and `LEFTOVERS-mobile-narrow-320-pending-error.png`.

All five canonical artifacts were opened directly at original detail:

| Artifact | Dimensions | SHA-256 |
| --- | ---: | --- |
| `COOK_MODE-mobile-narrow-320-known.png` | 320×568 | `0ac2bfa4ec5535cddc00af80f052caaa3e3dab05015b0eb1b60381a55db7fdfa` |
| `COOK_MODE-mobile-narrow-320-pending-error-replay.png` | 320×568 | `6ec05fe97a7f4f21d62dc8a9869ac61a38300e1208652d60eb26a087f561fe8f` |
| `LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png` | 390×2296 | `26154150dc876daf41c9ce72f74589c1b73e3a88fce84066c8ea982ab44d3f01` |
| `LEFTOVERS-mobile-narrow-320-actions.png` | 320×568 | `6a02cd8baa84734f501bf2d2df1ec26f07bb97f72be50bccd64072adcf91f759` |
| `LEFTOVERS-mobile-narrow-320-pending-error.png` | 320×568 | `178188d6f2aa779d25c960feed917daafa379bfddf19ddec80192e8447d0bf0c` |

The committed manifest SHA-256 is `852644716ad44b8854f2be01964cdfb43ba4cfc3e01bd6e581b8cc36eb394f89`; it records capture time `2026-08-10T11:42:51.017Z` and the exact implementation tuple `a381f232… / 0f72334b…`. The runtime focus/keyboard/overflow JSON SHA-256 is `2b12d4a38bb6e4a1dfa2026bf9dbee5206f71b37914c9ce986afa3bbf1794278`.

The two LEFTOVERS 320 PNGs are absent from the generator commit diff because their fresh captures are byte-identical, not because the generator retained pre-repair files. This was independently checked against the generator task's raw session log rather than accepted from its final summary:

- the generator began at the exact repair tuple and made a recoverable backup;
- its canonical Playwright run overwrote the evidence bundle and completed `2 passed / 2 intended skipped`;
- the raw before/after hash output at `2026-08-10T11:39:32Z` contains the same `6a02cd8…` and `178188d…` hashes for the two 320 artifacts;
- the final canonical run completed immediately before the manifest capture time and emitted the exact repair head/tree in the manifest;
- the successor commit is a direct child of the repair commit and includes the updated spec, manifest, runtime JSON, and only the affected PNGs whose bytes changed.

Local filesystem mtimes were also inspected but are checkout times and therefore were not used as capture-freshness proof. Freshness is established by the raw generator execution sequence, hashes, manifest timestamp and implementation tuple, canonical spec, and commit lineage together. Product closure and evidence freshness were evaluated separately; both pass.

Supporting 390 and 1440 state-matrix images were also inspected at original detail. They preserve the intended horizontal desktop/wider-mobile hierarchy and show no visible regression in the affected footer surfaces. The generator's `96/100 PASS` score was not used as authority for this verdict.

## Runtime, state, accessibility, and contract review

Direct code/spec/runtime inspection found no additional actionable frontend finding:

- actual focus trap and return-focus assertions remain present;
- pending controls and Escape dismissal are locked;
- 409 retains user input and 422 retains/links invalid inputs while focusing the alert;
- same-payload replay reuses the operation key;
- 320/390/1440 horizontal overflow assertions pass;
- known, missing, unrecoverable, legacy-null, and depleted states remain distinct;
- destructive confirmation consequences and safe cancel-first ordering remain explicit;
- no public request/response/error field, status, endpoint, action, DB schema, dependency, or permission boundary changed in the repair/successor range;
- no direct DML, backend mutation, contract-evolution candidate, or material security/performance regression was identified.

The selector-scoped automated accessibility artifact reports no serious/critical #11 violation. Existing full-page COOK contrast context is not treated as repaired or as a full-page-zero claim.

## Focused deterministic verification

The worktree initially lacked `node_modules`; those setup attempts did not execute the intended tools and are not product failures. After `pnpm install --frozen-lockfile` restored the locked dependencies without changing `package.json` or `pnpm-lock.yaml`, all intended checks were rerun:

| Verification | Result |
| --- | --- |
| seven focused cooked-batch Vitest files | **7 files / 21 tests passed** |
| `pnpm typecheck` | **passed** |
| focused ESLint for repaired components, regressions, and evidence spec | **passed** |
| workpack validator | **passed** |
| automation-spec validator | **passed** |
| Draft authority-evidence-presence validator | **passed** |
| source-of-truth sync validator | **passed** |
| workflow-v2 validator | **passed** |
| OMO bookkeeping validator | **passed** |
| closeout-sync validator | **passed** |
| `git diff --check` | **passed** |

The canonical evidence Playwright spec was not rerun in this report-only worktree because it writes the committed evidence bundle. Its raw generator execution log, committed spec/runtime artifacts, exact hashes, and current-head CI were inspected instead.

## Reviewed-head PR checks

At the exact reviewed successor head `531055ac…`:

- started checks: **15 terminal**
- conclusions: **13 SUCCESS + 2 intended SKIPPED** (`lighthouse`, `full-regression`)
- failed/pending/cancelled/rerun: **0**
- PR state: `OPEN` / `Draft`

The report-publication successor's newly started checks must separately reach terminal state before final handoff. Those checks validate the publication head, but they do not expand or replace this exact product/evidence verdict.

## Residual and manual-only boundary

The following remain honestly pending because screenshots, DOM mocks, and runtime JSON cannot prove them:

- physical keyboard Tab / Shift+Tab / Escape timing;
- VoiceOver / TalkBack behavior;
- real virtual keyboard and device safe-area behavior;
- full WCAG conformance;
- real permission/other-owner accounts and activation-only checks;
- server-Mac/OAuth, R/R+1/R+2, production, remote DB, and capability activation.

These are residual/manual boundaries, not waived claims. This Stage 5 approval does not authorize final authority, Stage 6, Ready, merge, or activation.
