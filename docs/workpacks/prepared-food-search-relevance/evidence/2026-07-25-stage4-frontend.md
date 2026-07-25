# prepared-food-search-relevance Stage 4 frontend evidence

Verification window: 2026-07-25 UTC / 2026-07-26 KST (UTC+09:00).

## Scope

- branch: `feature/fe-prepared-food-search-relevance`
- the official `GET /api/v1/food-catalog/search` client is dark-shipped for a
  later approved typed-union consumer and serializes official fields only
- the existing planner picker intentionally keeps the legacy
  `GET /api/v1/food-products` and `all|public_dataset|manual` compatibility
  contract; this slice changes only its debounce, IME, and generation control
- UI classification: behavior-only, low-risk; no layout, navigation, card hierarchy, or anchor-screen change
- physical-device IME feel remains Manual Only

## TDD and deterministic behavior

- RED was observed before production implementation for debounce, Korean IME,
  request-generation invalidation, source/query reset, stale first-page
  response, and stale same-source load-more response cases.
- `tests/prepared-food-planner-entry-ui.test.tsx` locks source-change cursor
  reset at `resets the cursor on a source change...`, same-source stale
  load-more rejection at `ignores an in-flight cursor page...`, and stale
  first-page rejection at `clears old results immediately...`. It also drops
  unresolved edit-return restore targets from memory and session storage on
  new query or source intent.
- `tests/food-catalog-search-client.test.tsx` separately locks the dark-shipped
  unified client's official parameter serialization, error envelope, actual
  empty page, and HOME recipe-only exclusion.
- focused Vitest: 2 files, 7 tests passed.
- related picker/client Vitest: 3 files, 30 tests passed.
- full single-worker Vitest: 359 files, 3,605 tests passed and 123 normal skips.
- the IME regression also covers a same-value final change after
  `compositionend`; React's controlled input does not issue a duplicate request.
- the focused Playwright grep includes both the stale-response flow and the
  explicit 390/320/desktop evidence matrix.

## Frontend verification

- `pnpm verify:frontend:pr`: product tests 1,668 passed with 36 normal skips,
  build completed with 74 pages, smoke 59 passed with 10 normal skips,
  accessibility core 8 passed with 1 normal skip, and visual core passed for
  web and mobile.
- `pnpm verify:frontend`: lint, typecheck, product tests, build, and Lighthouse
  passed.
- full regression: 902 passed and 132 normal skips. One unrelated
  discovery-filter desktop resource timeout passed immediately when rerun in
  isolation; no timeout or assertion was changed.
- full accessibility: 18 passed and 15 normal skips.
- full visual: 23 passed and 22 normal skips.
- security browser suite: 12 passed.
- focused `prepared-food-search-relevance` Playwright coverage passed on
  desktop and mobile. The evidence test itself opens explicit 390px, 320px,
  and 1280px viewports and checks horizontal overflow, preserved picker
  states, and unauthorized return context.

## Independent review and merge gate

- separate Codex quality, security, and test review lanes reviewed the
  implementation tree. Their first findings were repaired and the
  implementation-only tree reached P0-P3 0 with three approvals.
- after closeout bookkeeping changed, an additional exact-tree Codex review
  found that the focused grep did not include the viewport evidence title and
  that this Stage 4 evidence was not persisted. Both findings are repaired in
  the final tree.
- the final exact-tree quality, security, and test review result is recorded in
  the PR `Actual Verification` section and retained in
  `evidence/2026-07-25-closeout.md`. The checked closeout item is valid only
  while those records report P0-P3 0 for the pushed exact tree.
- the Draft head completed all started checks successfully or with normal
  skips. Ready policy then correctly blocked on unchecked Stage 4 closeout
  items; this repair updates those owned items.
- a new pushed head invalidates all earlier current-head conclusions. Squash
  merge remains blocked until every check started for that new head is
  terminal success or a documented normal skip.
