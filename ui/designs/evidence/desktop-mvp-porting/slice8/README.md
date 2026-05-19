# Slice 8 Desktop MVP Porting Evidence

Scope:

- `/leftovers`
- `/leftovers/ate`
- Final 53-row burn-down for leftovers, ate-list, and remaining LoginGate ledger closure

Captured MVP evidence:

- `screenshots/leftovers-1024.png`
- `screenshots/leftovers-1280.png`
- `screenshots/leftovers-1440.png`
- `screenshots/leftovers-empty-1280.png`
- `screenshots/ate-list-1024.png`
- `screenshots/ate-list-1280.png`
- `screenshots/ate-list-1440.png`
- `screenshots/ate-list-empty-1280.png`
- `claude-presignoff.md`
- `claude-postreview.md`

Visual baselines:

- `tests/e2e/qa-visual.spec.ts-snapshots/qa-leftovers-ready-desktop-chrome-darwin.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-leftovers-ready-desktop-chrome-linux.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-leftovers-empty-desktop-chrome-darwin.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-leftovers-empty-desktop-chrome-linux.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-ate-list-ready-desktop-chrome-darwin.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-ate-list-ready-desktop-chrome-linux.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-ate-list-empty-desktop-chrome-darwin.png`
- `tests/e2e/qa-visual.spec.ts-snapshots/qa-ate-list-empty-desktop-chrome-linux.png`

Local verification:

- `pnpm exec vitest run tests/leftovers.frontend.test.tsx`
- `pnpm lint` (passed with existing `.omx/artifacts` console warnings only)
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:product -- --runInBand`
- `pnpm exec playwright test tests/e2e/slice-16-leftovers.spec.ts`
- `pnpm exec playwright test tests/e2e/qa-a11y.spec.ts --project=desktop-chrome --grep "leftovers desktop"`
- `pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome --grep "leftovers desktop" --update-snapshots`
- `pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome --grep "leftovers desktop"`
- `pnpm exec playwright test tests/e2e/qa-desktop-mvp-port-slice8-evidence.spec.ts --project=desktop-chrome`

Notes:

- Claude pre-implementation verdict: `PRE-SIGNOFF: APPROVED`.
- Claude post-review verdict: `APPROVED`.
- Slice 8 closes `screen:LEFTOVERS` and `screen:ATE_LIST`.
- `요리하기` and `다시 만들기` intentionally link to `/recipe/{recipe_id}` because current MVP contracts do not expose a leftovers cook-start or ate-list recreate endpoint.
- No leftovers API contract, meal status transition, or cooking-session endpoint was changed.
- Desktop uses `WebShell`, `WebTopNav`, `WebPageHeader`, `WebCard`, `WebButton`, `WebEmptyState`, `WebErrorState`, and `WebSkeleton`.
- Mobile below `1024px` remains on the existing mobile branches and is covered by the full `slice-16-leftovers` Playwright projects.
