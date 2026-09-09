# Slice 5 Desktop MVP Porting Evidence

> 역사적 PNG 캡처는 [파일별 복구 기록](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)으로 이관했다. 아래 판정과 ledger는 당시 결과를 유지한다.

Scope:

- `/pantry`
- `/shopping/flow`
- `/shopping/lists/[list_id]`
- Pantry add ingredient modal
- Pantry bundle modal
- Shopping detail pantry reflection modal
- Shopping detail active and completed/read-only states

Captured MVP evidence:

- [archive: slice5/screenshots/pantry-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/pantry-add-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/pantry-bundle-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/shopping-flow-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/shopping-detail-active-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/shopping-detail-reflect-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice5/screenshots/shopping-detail-complete-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- `claude-presignoff.md`
- `claude-postreview.md`

Local verification:

- `pnpm typecheck`
- `pnpm lint` (passed with existing `.omx/artifacts` console warnings only)
- `pnpm build`
- `pnpm test:product -- --runInBand`
- `pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome --grep "pantry|shopping" --update-snapshots`
- `pnpm exec playwright test tests/e2e/qa-a11y.spec.ts --project=desktop-chrome --grep "pantry|shopping"`
- `pnpm exec playwright test tests/e2e/slice-13-pantry-core.spec.ts tests/e2e/slice-09-shopping-preview-create.spec.ts tests/e2e/slice-10a-shopping-detail-interact.spec.ts tests/e2e/slice-10b-shopping-share-text.spec.ts tests/e2e/slice-11-shopping-reorder.spec.ts tests/e2e/slice-12a-shopping-complete.spec.ts tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts --project=mobile-chrome --grep-invert '@live-oauth'`

Notes:

- Claude post-implementation verdict: `APPROVED_WITH_NON_BLOCKING_NOTES`; no required repairs.
- Desktop-specific visual coverage for Slice 5 now lives in `qa-visual.spec.ts` and `qa-a11y.spec.ts`.
- Mobile functional flows remain covered by the existing mobile Playwright slice specs.
- `screen:SHOPPING_LISTS` is only partially closed here: Slice 5 covers shopping detail/history semantics and read-only behavior; Slice 6 owns MyPage shopping-history presentation.
