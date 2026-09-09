# Slice 6 Desktop MVP Porting Evidence

> 역사적 PNG 캡처는 [파일별 복구 기록](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)으로 이관했다. 아래 판정과 ledger는 당시 결과를 유지한다.

Scope:

- `/login`
- `/mypage`
- `/mypage` recipebook management surface
- `/mypage/recipe-books/[book_id]`
- `/settings`
- MyPage saved/account/notification/help/shopping-history surfaces
- Settings nickname/logout/account-delete modals
- Recipebook delete confirm modal

Captured MVP evidence:

- [archive: slice6/screenshots/login-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/login-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/login-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-saved-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-saved-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-saved-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebooks-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebooks-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebooks-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebook-detail-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebook-detail-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebook-detail-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-shopping-history-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-shopping-history-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-shopping-history-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-1024.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-1440.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-account-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-notifications-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/mypage-help-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-nickname-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-logout-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/settings-account-delete-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- [archive: slice6/screenshots/recipebook-delete-modal-1280.png](../../historical-manifests/retired-assets-20260910.md#desktop-mvp-porting)
- `claude-presignoff.md`
- `claude-postreview.md`

Local verification:

- `pnpm typecheck`
- `pnpm lint` (passed with existing `.omx/artifacts` console warnings only)
- `pnpm build`
- `pnpm test:product -- --runInBand`
- `DEBUG_PRINT_LIMIT=1200 pnpm exec vitest run tests/login-screen.test.tsx tests/mypage-screen.test.tsx tests/settings-screen.test.tsx tests/recipe-book-detail-screen.test.tsx --reporter=basic`
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/qa-desktop-mvp-port-slice6-evidence.spec.ts --project=desktop-chrome`
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/qa-a11y.spec.ts --project=desktop-chrome`
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome`
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts tests/e2e/slice-17c-settings.spec.ts --project=desktop-chrome`

Notes:

- Claude pre-implementation verdict: `PRE-SIGNOFF: APPROVED`.
- Claude final post-review verdict after Codex follow-up repairs: `APPROVED`.
- Slice 6 closes the MyPage-side shopping history presentation left as `partial:slice5`.
- Desktop-only token bridges are scoped to `.web-login-shell`, `.web-mypage-shell`, `.web-settings-shell`, and `.web-recipebook-detail-shell`.
