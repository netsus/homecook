# Slice 4 Desktop MVP Porting Evidence

Scope:

- `/menu-add`
- `/menu/add/manual`
- `/menu/add/youtube`
- Menu-add picker surfaces and planned servings modal
- Manual recipe ingredient picker modal

Captured MVP evidence:

- `screenshots/menu-add-search-1280.png`
- `screenshots/planned-servings-input-1280.png`
- `screenshots/recipebook-selector-1280.png`
- `screenshots/recipebook-detail-picker-1280.png`
- `screenshots/pantry-match-picker-1280.png`
- `screenshots/manual-recipe-create-1280.png`
- `screenshots/ingredient-picker-modal-1280.png`
- `screenshots/yt-import-url-1280.png`
- `screenshots/yt-import-review-1280.png`

Local verification:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm exec playwright test tests/e2e/qa-a11y.spec.ts --project=desktop-chrome --grep "menu add|youtube"`
- `pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome --grep "menu add|manual recipe|youtube import"`
- `pnpm exec playwright test tests/e2e/slice-08a-meal-add-search.spec.ts tests/e2e/slice-08b-meal-add-books-pantry.spec.ts tests/e2e/slice-18-manual-recipe-create.spec.ts tests/e2e/slice-19-youtube-import.spec.ts --project=mobile-chrome`

Notes:

- Desktop-specific legacy functional coverage for these flows now lives in `qa-visual.spec.ts` and `qa-a11y.spec.ts`.
- Existing mobile functional specs remain active on `mobile-chrome`; they skip `desktop-chrome` because the desktop port intentionally uses the web shell and web modal primitives instead of the old mobile DOM.
