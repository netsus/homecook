# Final-authority contrast repair integration evidence — 2026-08-09

## Scope and independence

- Workpack: `cooked-batch-weight-ledger` (#8)
- Role: fresh final-authority contrast repair integration author
- Integration task: `019fe643-6f73-7092-bbe4-ac4e731fa888`
- Delegating source task: `019fe028-be31-76f2-a5a7-986000a93374`
- Draft PR: [#1311](https://github.com/netsus/homecook/pull/1311)
- Dedicated local branch: `fix/cooked-batch-final-authority-contrast-integration`
- This task is distinct from the final-authority HOLD task, contrast product author, evidence generator, Stage 5 reviewers, and every later authority or closeout reviewer.
- This task does not approve its own repair, change `Design Status`, mark lifecycle complete, transition the PR to Ready, merge, activate capabilities, or perform Stage 5, final authority, or Stage 6.
- Claude CLI, Claude app, and Claude API were not used.

The original HOLD report remains unchanged at `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-final-product-design-authority.md`. This new file is an additive repair handoff and does not replace or reinterpret that verdict.

## Locked starting state and strict lineage

At integration start, a fresh fetch confirmed that PR #1311 and `feature/cooked-batch-weight-ledger-stage4-frontend-current` both pointed to the expected final-authority report-only head `bc2b0e3bd9953902d4a259896319bd2f4a86ae43`. The product and evidence repairs already formed a strict descendant chain, so neither commit was cherry-picked, squashed, amended, or otherwise rewritten.

| Revision | Task / role | Parent | Tree | Meaning |
| --- | --- | --- | --- | --- |
| `bc2b0e3bd9953902d4a259896319bd2f4a86ae43` | final authority task `019fe61a-9336-7691-9bf8-9d82b178702a` | `a87616d64e1442bdb051861722c7247fc5973fe9` | `eb63da364c566122d32c2105acfacb00c11eb82b` | report-only `HOLD / REQUEST_CHANGES` |
| `e662eaeafd4270245fb77259bb856a82bfd972ea` | contrast product repair task `019fe62c-2280-7a13-8f32-8d970c86f9a3` | `bc2b0e3bd9953902d4a259896319bd2f4a86ae43` | `4642dc0b920f06faa826fa7d6b82b1891411ae33` | scoped product and regression repair |
| `980e0b92755d745dc93bd100d8f324bcca7a2ca0` | contrast evidence task `019fe639-87cb-7f23-bf2c-9fdd62ab81ee` | `e662eaeafd4270245fb77259bb856a82bfd972ea` | `bea53d13bdb93e6a463a36f2929fee2417b9659d` | canonical PNG and retained evidence refresh |

Strict ancestry: `bc2b0e3… -> e662eae… -> 980e0b9…`.

The current repaired product/evidence head before this report-only integration commit is exactly `980e0b92755d745dc93bd100d8f324bcca7a2ca0`, tree `bea53d13bdb93e6a463a36f2929fee2417b9659d`. This report cannot embed the SHA of its own future commit without circular self-reference; the pushed integration head/tree is recorded in the PR body and handoff result.

## Original final-authority P1 findings and repairs

### FA-P1-01 — active primary CTA contrast

The original authority task measured the enabled completion CTA at `2.78:1` and its hover token at about `3.86:1`, below the required `4.5:1` for normal text. The product repair scopes existing accessible tokens to the #8 completion sheet instead of changing shared/global brand styling, and adds browser coverage for both known-weight and `weigh_later` active states.

- Repaired default ratio: `5.070320:1`
- Repaired hover ratio: `12.581112:1`
- Repaired pressed ratio: `12.581112:1`
- axe serious/critical findings in the exercised active states: `0`

### FA-P1-02 — 422 recovery heading contrast

The original authority task measured the mocked 422 recovery heading at `3.35:1` against its surface. The product repair uses the existing scoped `--danger-strong` text token, retains the separate border treatment, and locks focus, exact selection/input preservation, `aria-invalid`, `aria-describedby`, contrast, and axe behavior in the same real mocked-422 flow.

- Repaired 422 heading ratio: `6.049532:1`
- axe serious/critical findings in the exercised 422 state: `0`

The repair changes no public API, response wrapper, endpoint, schema, migration, capability, shared global token, or dependency. It preserves #9 meal-log and #11 final delayed-weight/LEFTOVERS ownership.

## Fresh combined verification

All commands below ran from the exact combined head `980e0b92755d745dc93bd100d8f324bcca7a2ca0` before this report-only file was added.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; lockfile unchanged |
| focused Vitest, 5 files | `5 files / 43 tests` passed |
| `pnpm test:product` | `222 files / 2,686 tests` passed; `11 files / 150 tests` intended skip |
| full `pnpm test` | `529 files / 5,422 tests` passed; `28 files / 372 tests` intended skip |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| standalone `pnpm build` | pass; `78/78` static pages generated |
| `pnpm verify:frontend:pr` | pass |
| verify product Vitest | `222 files / 2,686 tests` passed; `11 files / 150 tests` intended skip |
| verify build | pass; `78/78` static pages generated |
| verify smoke | `59 passed / 10 intended skip` |
| verify core a11y | `8 passed / 1 intended skip` |
| verify core visual | `12 passed` |
| relevant COOK_MODE a11y | `1 passed` |
| relevant COOK_MODE visual | `1 passed` |
| active CTA + 422 trace run | `2 passed`, Playwright trace enabled |
| source-of-truth / workflow-v2 / workpack / automation-spec / OMO bookkeeping validators | all pass |
| exploratory QA / authority evidence / closeout-sync validators | all pass |
| branch validator | pass for the dedicated integration branch |

The verify smoke regenerated unrelated tracked PNGs under the 33c/34c/34d/34e/35c evidence directories. Those test-generated files were restored exactly to `980e0b9…` bytes before this report was authored. The three #8 canonical PNGs remained byte-identical to the committed evidence and required no restoration.

### Exact #8 Playwright, three clean-server runs

Command: `PLAYWRIGHT_REUSE_EXISTING_SERVER=0 pnpm test:e2e:regression:ci --grep cooked-batch-weight-ledger`

| Run | Result | 1280 SHA-256 | 390 SHA-256 | 320 SHA-256 |
| ---: | --- | --- | --- | --- |
| 1 | `9 passed / 1 intended skip` | `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c` | `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9` | `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027` |
| 2 | `9 passed / 1 intended skip` | same | same | same |
| 3 | `9 passed / 1 intended skip` | same | same | same |

All three retained artifacts were byte-identical across all three runs and matched the Markdown, JSON, working-tree, and committed `980e0b9…` evidence bytes:

- desktop `1280x900`: `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c`
- mobile `390x844`: `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9`
- narrow `320x568`: `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027`

## Review and lifecycle boundary

- Contrast product repair and reproducible evidence generation: complete at `980e0b92755d745dc93bd100d8f324bcca7a2ca0`
- Original final-authority verdict: `HOLD / REQUEST_CHANGES`; this integration task does not self-override it
- Fresh independent Stage 5 re-review of the final pushed repair head: required and pending
- Fresh final product-design-authority re-review after Stage 5: required and pending
- Stage 6: pending
- `Design Status`: `pending-review`; not `confirmed`
- Lifecycle: `in_progress`
- Overall approval / verification / evaluation closeout: pending
- Manual and physical-device/browser/screen-reader verification: pending
- server-Mac and merged-exact-SHA production/local rehearsal: pending
- OAuth/provider evidence: pending
- R and R+1 seeded drain evidence: pending
- R+2 service-owner approval, activation, and rollback authority: pending
- Discord, Ready transition, and merge: not performed or approved by this task

This report proves author-side repair integration and reproducibility only. It is not Stage 5, final authority, Stage 6, or release approval.
