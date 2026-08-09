# Stage 5 frontend repair integration evidence — 2026-08-09

## Scope and lineage

- Workpack: `cooked-batch-weight-ledger` (#8)
- Role: fresh Stage 4 repair integration author; not the Stage 5 reviewer, final product-design authority, or Stage 6 reviewer
- Draft PR: [#1311](https://github.com/netsus/homecook/pull/1311)
- Remote branch at integration start: `feature/cooked-batch-weight-ledger-stage4-frontend-current`
- Exact source and remote head at integration start: `e50d72f9dfca09b5856751c65f5a881ef88e94ae`
- Dedicated local branch: `fix/cooked-batch-stage4-repair-integration`
- Original Stage 5 verdict: `REQUEST_CHANGES`, `P0/P1/P2=0/1/1`
- Original report: `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage5-frontend-review.md`
- Public contract/schema/UI expansion: none
- Force-push, Ready transition, merge, Discord, activation: none

Both delegated repair commits had exact parent `e50d72f9dfca09b5856751c65f5a881ef88e94ae`, changed disjoint owned files, and were cherry-picked without conflict. They remain separate commits in the integration history.

## Original Stage 5 findings and repairs

### P1 — malformed snapshot-v2 completion responses were accepted

The Stage 5 report found that the client did not correlate a terminal completion response with the opened session mode and exact weight request, and allowed legacy-only null or impossible initial cooked-batch states.

- Repair task: `019fe5ec-64d8-7a63-bdee-da4b6eb2c2c4`
- Delegated commit: `0b6a0d78dccdc06e1011bc165daee6120c686e8e`
- Integration cherry-pick: `80de7265d4c5744424b9ac2fe9e72e7f737261dd`
- Delegated tree: `aca4232ed4160ac7f709c103d4b21f66347c46b0`
- Owned files:
  - `lib/api/cooking.ts`
  - `tests/cooking-snapshot-v2-api.test.ts`

The repair binds completion validation to remembered session mode and the exact request body, rejects legacy-only null and impossible initial state, requires initial known weight equality or exact missing-weight projection, retains mode context for malformed-response retry, bounds the in-memory mode map, and clears it only after validated completion or cancellation.

Delegated evidence reported focused Vitest `5 files / 42 tests`, product Vitest `222 files / 2,685 tests`, typecheck, lint, and diff check passing. The combined-state reruns below supersede reliance on lane-only success.

### P2 — retained screenshots were not reproducible

The Stage 5 report found that committed 1280/390/320 PNG blobs did not match retained digests and that fresh mobile captures were non-deterministic.

- Repair task: `019fe5ec-64d8-7a63-bdee-da6f0dd692f9`
- Delegated commit: `ba81a391483ea9b08912d3d3652c1998d19f5725`
- Integration cherry-pick: `0dd4ceb4658f07063428f3a88ba80d9050430a0c`
- Delegated tree: `5d0cb8e5bf2ca872bd305d306c902335e1f64a37`
- Owned files:
  - `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-implementation.md`
  - `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-stage-result.json`
  - `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts`
  - the three retained `COOK_MODE-implementation-*.png` files

The repair waits for network and fonts, disables capture-only animation/transition/caret, neutralizes pointer hover, waits for settled paint, and regenerates one canonical retained PNG set whose Markdown/JSON digests match the committed bytes.

Delegated evidence reported three exact Playwright runs at `5 passed / 1 intended skip` with byte-identical hashes, focused visual/a11y, ESLint, typecheck, workpack validation, dimensions/checksums, and diff check passing. The combined-state reruns below independently reproduce the result.

## Combined repair identity

- Combined repaired product head before this report-only evidence commit: `0dd4ceb4658f07063428f3a88ba80d9050430a0c`
- Combined repaired product tree: `ebef0555f414bd7939413a7bcf16327fd67da9dc`
- Strict source ancestry: `e50d72f9dfca09b5856751c65f5a881ef88e94ae -> 80de7265d4c5744424b9ac2fe9e72e7f737261dd -> 0dd4ceb4658f07063428f3a88ba80d9050430a0c`

This evidence file is a report-only successor, so it cannot embed its own future commit SHA without circular self-reference. The final integration head/tree after the separate evidence commit is recorded in the PR body and handoff report; product behavior remains exactly the combined repair head/tree above plus this one evidence file.

## Fresh combined verification

- `pnpm install --frozen-lockfile` — pass; initial pre-test attempt found no local `vitest` binary and is not counted as a test result
- Focused Vitest — `5 files / 42 tests` pass
- Product Vitest — `222 files / 2,685 tests` pass; `11 files / 150 tests` intended skip
- Full `pnpm test` — `529 files / 5,421 tests` pass; `28 files / 372 tests` intended skip
- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm verify:frontend:pr` — pass:
  - product Vitest `222 files / 2,685 tests`
  - Next.js production build pass
  - core smoke `59 passed / 10 intended skip`
  - core accessibility `8 passed / 1 intended skip`
  - core visual `12 passed`
- Relevant COOK_MODE accessibility grep — `1 passed / 2 intended skip`
- Relevant COOK_MODE visual grep — `1 passed / 2 intended skip`
- Focused completion-sheet capture assertions — pass; `1 passed / 1 intended skip` across the requested desktop/mobile projects
- `git diff --check` — pass before this report-only file

### Exact Playwright grep, three consecutive runs

Command: `pnpm test:e2e:regression:ci --grep cooked-batch-weight-ledger`

| Run | Result | 1280 SHA-256 | 390 SHA-256 | 320 SHA-256 |
| ---: | --- | --- | --- | --- |
| 1 | `5 passed / 1 intended skip` | `3aa8556589cde4280587a7e11005bb628fe3f414ac1ec24e9f767010f47bf696` | `1ecd8b2137460b78925ad22b678939bae076d0a9b3af2b5e160719814284139b` | `e6a05d3a29a6c58e7812d5fc42730665a1119160fbb2eb472021576911fb27d5` |
| 2 | `5 passed / 1 intended skip` | `3aa8556589cde4280587a7e11005bb628fe3f414ac1ec24e9f767010f47bf696` | `1ecd8b2137460b78925ad22b678939bae076d0a9b3af2b5e160719814284139b` | `e6a05d3a29a6c58e7812d5fc42730665a1119160fbb2eb472021576911fb27d5` |
| 3 | `5 passed / 1 intended skip` | `3aa8556589cde4280587a7e11005bb628fe3f414ac1ec24e9f767010f47bf696` | `1ecd8b2137460b78925ad22b678939bae076d0a9b3af2b5e160719814284139b` | `e6a05d3a29a6c58e7812d5fc42730665a1119160fbb2eb472021576911fb27d5` |

All three dimensions and hashes were byte-identical across all three runs and still matched after the focused completion-sheet visual/a11y assertions.

## Review and lifecycle boundary

- Repair integration: complete locally, subject to final commit/push/current-head checks
- Original Stage 5 `REQUEST_CHANGES`: not self-overridden
- Fresh independent Stage 5 re-review: required and pending
- Design Status: `pending-review`; not `confirmed`
- Lifecycle: `in_progress`
- Approval, verification, evaluation closeout: pending
- Final product-design authority: pending
- Stage 6: pending
- Manual and physical-device/browser verification: pending
- Server-Mac and merged-exact-SHA production/local-rehearsal evidence: pending
- OAuth/provider evidence: pending
- Full v1 compatibility and seeded R/R+1 drain: pending
- R, R+1, R+2 and capability activation/rollback approval: pending
- Ready transition, merge and Discord: not performed by this task

This integration closes neither the whole #8 lifecycle nor any final design or release authority. A fresh reviewer must inspect the final pushed PR head and its current-head checks before any later Stage can proceed.
