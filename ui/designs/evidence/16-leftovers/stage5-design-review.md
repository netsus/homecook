# 16-leftovers Stage 5 Design Review

> 대상 slice: `16-leftovers`
> review stage: Stage 5 public design review
> reviewer: Codex
> reviewed screens: `LEFTOVERS`, `ATE_LIST`
> reviewed evidence:
> - `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile.png`
> - `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile-narrow.png`
> - `ui/designs/evidence/16-leftovers/ATE_LIST-mobile.png`
> - `ui/designs/evidence/16-leftovers/ATE_LIST-mobile-narrow.png`
> authority reports:
> - `ui/designs/authority/LEFTOVERS-authority.md`
> - `ui/designs/authority/ATE_LIST-authority.md`
> review date: 2026-04-29

## Verdict

- Stage 5 review result: `approve`
- Design Status transition: `pending-review` -> `confirmed` is held until Claude `final_authority_gate` passes.
- Final authority gate required: `yes`
- Authority blocker count: `0`
- Major issue count: `0`
- Minor issue count: `1` accepted as non-blocking.

## Required Repair Closed

| id | finding | repair | evidence |
|----|---------|--------|----------|
| S5-R1 | `LEFTOVERS` reversed the intended button hierarchy: `[다먹음]` looked stronger than `[플래너에 추가]`, while `ui/designs/LEFTOVERS.md` defines planner-add as the primary filled CTA. | Claude repaired the `LeftoverCard` button classNames in commit `2d5ce5d`, making `[다먹음]` secondary outlined and `[플래너에 추가]` primary filled. | Recaptured `LEFTOVERS-mobile*.png`; `pnpm exec vitest run tests/leftovers.frontend.test.tsx`; `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3116 PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/slice-16-leftovers.spec.ts --project=mobile-chrome` |

## Check Results

| check | result | notes |
|-------|--------|-------|
| Required UI states | `pass` | loading, empty, error, read-only N/A, unauthorized are implemented and documented. |
| Screen definition match | `pass` | LEFTOVERS and ATE_LIST required text/actions are present. |
| Common component consistency | `pass` | AppShell, BottomTabs, ContentState, Skeleton, PlannerAddSheet patterns are reused. |
| Accessibility basics | `pass` | 44px touch targets, `role="alert"` feedback, login gate return-to-action, and link labels are present. |
| Mobile default evidence | `pass` | 375px screenshots show stable hierarchy and no dev overlay. |
| Mobile narrow evidence | `pass` | 320px screenshots preserve button text and card structure. |
| Authority evidence validation | `pass` | `PR_IS_DRAFT=false pnpm validate:authority-evidence-presence` passed. |

## Non-Blocking Minor

| id | location | note | disposition |
|----|----------|------|-------------|
| S5-M1 | `LEFTOVERS-mobile-narrow.png` | The third card reaches the bottom tab area at initial 320px viewport. The first two cards and their CTAs remain fully visible, and the list remains vertically scrollable. | Accepted as non-blocking; watch if future content density increases. |

## Verification Snapshot

- `pnpm exec vitest run tests/leftovers.frontend.test.tsx`: pass, 21 tests.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3116 PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/slice-16-leftovers.spec.ts --project=mobile-chrome`: pass, 11 tests.
- `PR_IS_DRAFT=false pnpm validate:authority-evidence-presence`: pass.
- `pnpm validate:workpack -- --slice 16-leftovers`: pass.
- `pnpm validate:workflow-v2`: pass.

## Next Step

Claude `final_authority_gate` must confirm blocker 0 before `docs/workpacks/16-leftovers/README.md` can move Design Status from `pending-review` to `confirmed`.
