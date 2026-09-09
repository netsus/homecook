# Slice 4 Desktop MVP Porting Evidence

> 역사적 PNG 캡처는 [파일별 복구 기록](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)으로 이관했다. 아래 판정과 ledger는 당시 결과를 유지한다.

Scope:

- `/menu-add`
- `/menu/add/manual`
- `/menu/add/youtube`
- Menu-add picker surfaces and planned servings modal
- Manual recipe ingredient picker modal

Captured MVP evidence:

- [archive: slice4/screenshots/menu-add-search-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/planned-servings-input-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/recipebook-selector-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/recipebook-detail-picker-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/pantry-match-picker-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/manual-recipe-create-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/ingredient-picker-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/yt-import-url-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice4/screenshots/yt-import-review-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)

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
