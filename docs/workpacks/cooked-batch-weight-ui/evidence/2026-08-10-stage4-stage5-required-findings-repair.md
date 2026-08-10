# cooked-batch-weight-ui Stage 4 Stage 5 required-findings repair

## Scope and lineage

- task ID: `019feb34-89a1-7821-839a-857dabbb74bb`
- role: fresh Stage 4 frontend repair author
- input report-publication head/tree: `6f24aaf4b5d678850e35f3a37a8eb3c8100212ce` / `cac67eb8635ba437faec6ea0f6cf0f2835a0c81e`
- reviewed product head/tree: `4c5145e01ac62db527f144e2d2df0f97efea2e4b` / `0af6a107be2d1888dbfe5ed09da17a0906d53c18`
- source branch / PR: `feature/fe-cooked-batch-weight-ui-superseding-draft` / #1323 Draft
- Stage 5 reviewer task: `019feb20-7e66-73e3-9b92-ccf95b0fab58`
- Stage 5 report: `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage5-frontend-review.md`
- required finding IDs: `CBW-FA-P2-01`, `CBW-FA-P2-02`

This repair changes only the two required Stage 5 findings. It adds no API, field, status, action, screen, dependency, shared footer behavior, backend write or contract evolution. It does not perform Stage 5, final authority, Stage 6, Ready, merge, production, remote DB, server-Mac, OAuth or activation work.

## RED

Focused regression tests were added before product implementation:

```text
pnpm exec vitest run tests/cooked-batch-completion-sheet.test.tsx tests/cooked-batch-lifecycle-actions.test.tsx
```

After the frozen-lockfile install made the test runner available, the current implementation failed only the two new regressions:

- `2` test files failed; `2` new tests failed and `10` existing tests passed.
- `CBW-FA-P2-01`: the COOK footer lacked the 320px stacked class contract and primary-first DOM order.
- `CBW-FA-P2-02`: the LEFTOVERS footer lacked the scoped `text-base` wrapper contract.

The earlier `Command "vitest" not found` setup attempt was not counted as a product RED.

## GREEN implementation

### `CBW-FA-P2-01`

- `components/cooking/cooked-batch-completion-sheet.tsx` now owns a local footer instead of changing `AppModalFooterActions` globally.
- Submit is first in DOM order.
- At 320px the footer is a full-width vertical stack in primary-submit then secondary-back visual order.
- At 321px and wider `flex-row-reverse` preserves the existing visible `돌아가기 | 완료 저장` horizontal layout while keeping the primary-first DOM order.
- Both controls retain `--control-height-lg` 48px height, full-width narrow containment, official colors, disabled/pending locks and non-destructive semantics.

### `CBW-FA-P2-02`

- `components/leftovers/cooked-batch-action-sheet.tsx` adds only a local `[&_button]:text-base` footer wrapper.
- The shared footer still renders safe cancel before danger confirm in both DOM and visual order.
- Existing 48px height, danger/brand colors, pending lock, error recovery and focus behavior are unchanged.

## Verification

- focused RED-to-GREEN pair: `2 files / 12 tests` passed
- complete #11 focused UI set: `7 files / 21 tests` passed
- `pnpm typecheck`: passed
- targeted ESLint for the two components and two regression files: passed
- `pnpm validate:workpack -- --slice cooked-batch-weight-ui`: passed
- `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ui`: passed
- `pnpm verify:frontend:pr`: passed
  - full ESLint and TypeScript: passed
  - product Vitest: `227` files / `2,704` passed; `11` files / `150` intended skip
  - production build: passed; `78` pages
  - core smoke: `59` passed / `10` intended skip
- core a11y: `8` passed / `1` intended skip
- core visual: desktop `4` passed + mobile `8` passed
- branch, source-of-truth sync, workflow-v2, OMO bookkeeping and closeout-sync validators: passed
- exploratory QA evidence and Draft-context authority evidence presence validators: passed

The authority presence result checks the retained Draft evidence bundle only. It is not a freshness claim for this repair and does not replace the separate generator/rereview handoff below.

## Visual evidence handoff

No PNG, evidence manifest or runtime JSON was edited or generated in this task. The current committed visual bundle still describes the pre-repair implementation head and must not be cited as refreshed repair evidence.

A separate evidence-generator task must recapture only the affected COOK 320 footer states and LEFTOVERS 320/390 action-sheet footer states, update the manifest/runtime lineage, and hand the fresh exact tuple to a separate Stage 5 reviewer. This repair author does not approve the new visuals or perform final authority/Stage 6.

## Still pending

- separate visual evidence generation and manifest/runtime lineage refresh
- fresh independent Stage 5 rereview at the repaired exact head/tree
- separate final product-design-authority and Stage 6 review
- physical keyboard, VoiceOver/TalkBack, real virtual keyboard/safe-area, real role/permission accounts and full WCAG Manual checks
- server-Mac/OAuth, R/R+1/R+2 and capability activation
